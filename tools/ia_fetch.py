#!/usr/bin/env python3
"""ia_fetch.py: download old public access TV from the Internet Archive into HOLODECK-ready folders.

For Timothy's own viewing. Runs on the NAS in a throwaway Python container (README → NAS relay → Public access TV).
It uses the Archive's own search and download addresses through its official `internetarchive` library, one file at
a time with a pause between, and never logs in.

What it does:
  - searches archive.org for movies matching a query (by default: public, cable or community access television,
    1980 to 2009), leaving out the TV News Archive and anything marked restricted;
  - for each video in an item, picks the copy an iPad plays best (H.264 HD, then H.264, then MPEG4, then 512Kb MPEG4);
  - saves it as  OUT/<show>/<title> [identifier].mp4  (one folder per show, so a NETWORK channel works at once),
    via a .part file (HOLODECK ignores those) that is resumed if interrupted and checked against the Archive's MD5;
  - skips what it already has, and stops at the size limits;
  - retries a dropped connection up to five times (resuming), but gives up on a file at once when the Archive
    refuses it (404 not found, 403 forbidden, and so on);
  - writes OUT/_ia_log.csv: when, identifier, file, size, the item's license (blank if none), its page, the folder.

It only lists what it would fetch unless --go is given.

  python3 ia_fetch.py --out /out                       # list what the default search would fetch
  python3 ia_fetch.py --out /out --go --max-gb 50      # fetch it, at most 50 GB this run
  python3 ia_fetch.py --out /out --query '"public access" AND subject:cooking' --go
  python3 ia_fetch.py --out /out --ids some-item another-item --go
  python3 ia_fetch.py --selftest                       # offline checks of the picking, naming and downloading
"""
import argparse, csv, hashlib, os, re, sys, time
from urllib.parse import quote

DEFAULT_QUERY = '("public access" OR "cable access" OR "community access" OR "access television" OR "public-access")'
PREFER = ["h.264 HD", "h.264", "MPEG4", "512Kb MPEG4"]   # best first, for an iPad
UA = "TimothyOS-ia_fetch/1.0 (personal archive; one file at a time)"


def build_query(q, years, collection, exclude=()):
    parts = ["mediatype:movies", "(%s)" % q, "-collection:tvarchive", "-access-restricted-item:true"]
    parts += ['NOT ("%s")' % x.replace('"', "") for x in exclude if x.strip()]
    if years:
        a, b = years
        parts.append("(year:[%d TO %d] OR date:[%d-01-01 TO %d-12-31])" % (a, b, a, b))
    if collection:
        parts.append("collection:(%s)" % collection)
    return " AND ".join(parts)


def clean(name, limit=90):
    """A folder or file name that any NAS share takes: no slashes or reserved marks, no trailing dots, not too long."""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", str(name or "")).strip()
    name = re.sub(r"\s+", " ", name).strip(" .")
    return (name[:limit].rstrip(" .") or "Untitled")


def gb(n):
    return "%.1f GB" % (n / 1e9) if n >= 1e9 else "%.0f MB" % (n / 1e6)


def first(v):
    return (v[0] if v else "") if isinstance(v, list) else (v or "")


SERIES_TAIL = re.compile(r"\s*[-–—:,#(]*\s*\b(?:episode|ep\.?|part|pt\.?|show|program|no\.?|vol\.?|volume)\s*#?\s*\d+.*$|\s*[-–—:,(]*\s*#\s*\d+.*$|\s*[-–—:,(]*\s*\b(?:19|20)\d\d\b.*$", re.I)


def series_of(title):
    """'Night Owl Theatre Episode 3' → 'Night Owl Theatre'; '' if nothing is left."""
    return clean(SERIES_TAIL.sub("", first(title) or ""), 60) if SERIES_TAIL.sub("", first(title) or "").strip(" -–—:,") else ""


def show_of(md, group):
    """The show folder: by default the series name from the title (episode numbers and years dropped), else the item's
    creator (usually the producer), else its first collection, else Misc."""
    if group == "none":
        return ""
    if group == "series":
        s = series_of(md.get("title"))
        if s and s != "Untitled":
            return s
        group = "creator"
    if group == "creator" and first(md.get("creator")):
        return clean(first(md.get("creator")), 60)
    cols = md.get("collection") or []
    cols = [c for c in (cols if isinstance(cols, list) else [cols]) if c and not c.startswith("fav-")]
    return clean(cols[0] if cols else "Misc", 60)


def pick(files):
    """One file per video in the item: group derivatives with their original, then take the best format."""
    groups = {}
    for f in files:
        fmt, name = f.get("format", ""), f.get("name", "")
        if fmt not in PREFER or not name.lower().endswith((".mp4", ".m4v")):
            continue
        key = f.get("original") or name
        groups.setdefault(key, []).append(f)
    out = []
    for key in sorted(groups):
        best = sorted(groups[key], key=lambda f: PREFER.index(f["format"]))[0]
        out.append(best)
    return out


def target(out, md, f, n_videos, group):
    title = clean(first(md.get("title")) or md.get("identifier"), 80)
    stem = clean(os.path.splitext(os.path.basename(f["name"]))[0], 60)
    name = "%s [%s].mp4" % (title if n_videos == 1 else "%s - %s" % (title, stem), md.get("identifier"))
    folder = show_of(md, group)
    return os.path.join(out, folder, name) if folder else os.path.join(out, name)


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


class GiveUp(Exception):
    """A file that won't come however often it's asked for (404, 403, 410…)."""


def fetch(session, ident, f, dest, verify):
    url = "https://archive.org/download/%s/%s" % (quote(ident), quote(f["name"]))
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    have = os.path.getsize(part) if os.path.exists(part) else 0
    for attempt in range(5):
        try:
            hdr = {"User-Agent": UA}
            if have:
                hdr["Range"] = "bytes=%d-" % have
            with session.get(url, headers=hdr, stream=True, timeout=60) as r:
                if r.status_code == 416:   # already whole
                    break
                if 400 <= r.status_code < 500 and r.status_code not in (408, 429):   # gone or refused: trying again won't help
                    raise GiveUp("HTTP %d" % r.status_code)
                r.raise_for_status()
                mode = "ab" if have and r.status_code == 206 else "wb"
                if mode == "wb":
                    have = 0
                with open(part, mode) as fh:
                    for chunk in r.iter_content(1 << 20):
                        fh.write(chunk)
                        have += len(chunk)
            break
        except GiveUp:
            raise
        except Exception as e:   # the network or the Archive hiccuped: wait and resume from where it got to
            wait = 2 ** attempt * 5
            print("    retry in %ds (%s)" % (wait, e), flush=True)
            time.sleep(wait)
            have = os.path.getsize(part) if os.path.exists(part) else 0
    else:
        raise RuntimeError("gave up after 5 tries")
    if verify and f.get("md5") and md5(part) != f["md5"]:
        os.remove(part)
        raise RuntimeError("checksum didn't match; removed, will try again next run")
    os.replace(part, dest)


def log(out, row):
    path = os.path.join(out, "_ia_log.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new:
            w.writerow(["when", "identifier", "file", "bytes", "license", "page", "folder"])
        w.writerow(row)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Public access TV from the Internet Archive, for HOLODECK.")
    ap.add_argument("--out", help="where the show folders go (in the container: /out)")
    ap.add_argument("--query", default=DEFAULT_QUERY, help="Internet Archive search terms")
    ap.add_argument("--years", default="1980-2009", help="FROM-TO, or 'any'")
    ap.add_argument("--collection", help="only this collection identifier")
    ap.add_argument("--sort", default="downloads desc", help="search order (default: most downloaded first)")
    ap.add_argument("--ids", nargs="*", help="these item identifiers instead of a search")
    ap.add_argument("--group", choices=["series", "creator", "collection", "none"], default="series", help="show folders by")
    ap.add_argument("--exclude", nargs="*", default=[], help="leave out items matching any of these words or phrases")
    ap.add_argument("--strict", action="store_true", help="only items that state a license (usually public domain or Creative Commons)")
    ap.add_argument("--max-items", type=int, default=200)
    ap.add_argument("--max-gb", type=float, default=50.0, help="stop after this much this run")
    ap.add_argument("--max-file-gb", type=float, default=4.0, help="skip single files bigger than this")
    ap.add_argument("--max-per-item", type=int, default=25, help="skip items holding more videos than this (conference dumps, whole channels)")
    ap.add_argument("--pause", type=float, default=2.0, help="seconds between files")
    ap.add_argument("--no-verify", action="store_true", help="skip the MD5 check")
    ap.add_argument("--go", action="store_true", help="download; without it, only list")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.out:
        ap.error("--out is required")
    import internetarchive as ia   # pip install internetarchive
    session = ia.get_session()
    years = None if a.years == "any" else tuple(int(x) for x in a.years.split("-"))
    if a.ids:
        idents = a.ids
    else:
        q = build_query(a.query, years, a.collection, a.exclude)
        print("Search: " + q, flush=True)
        idents = [r["identifier"] for r in ia.search_items(q, fields=["identifier"], sorts=[a.sort], archive_session=session)]
        idents = idents[: a.max_items]
    print("%d item(s)%s" % (len(idents), "" if a.go else ", listing only (add --go to download)"), flush=True)
    total, got, budget, cap = 0, 0, a.max_gb * 1e9, a.max_file_gb * 1e9
    for n, ident in enumerate(idents, 1):
        try:
            item = ia.get_item(ident, archive_session=session)
            md = dict(item.metadata or {})
        except Exception as e:
            print("[%d] %s: can't read (%s)" % (n, ident, e), flush=True)
            continue
        md.setdefault("identifier", ident)
        lic = md.get("licenseurl", "")
        if md.get("access-restricted-item") in (True, "true"):
            continue
        if a.strict and not lic:
            print("[%d] %s: no license, skipped (--strict)" % (n, ident), flush=True)
            continue
        vids = pick(item.files or [])
        if not vids:
            print("[%d] %s: no MP4 copy" % (n, ident), flush=True)
            continue
        if len(vids) > a.max_per_item:
            print("[%d] %s: %d videos, over --max-per-item; skipped (fetch it with --ids and a higher --max-per-item)" % (n, ident, len(vids)), flush=True)
            continue
        print("[%d] %s · %s · %s" % (n, first(md.get("title")) or ident, first(md.get("year")) or first(md.get("date"))[:4] or "?", lic or "no license given"), flush=True)
        for f in vids:
            size = int(f.get("size") or 0)
            dest = target(a.out, md, f, len(vids), a.group)
            rel = os.path.relpath(dest, a.out)
            if os.path.exists(dest):
                print("    have  %s" % rel, flush=True)
                continue
            if size > cap:
                print("    skip  %s (%.1f GB, over --max-file-gb)" % (rel, size / 1e9), flush=True)
                continue
            if total + size > budget:
                print("Stopping: --max-gb reached (%.1f GB this run)." % (total / 1e9), flush=True)
                return 0
            print("    %s %s (%.0f MB, %s)" % ("get  " if a.go else "would", rel, size / 1e6, f["format"]), flush=True)
            total += size
            if not a.go:
                continue
            try:
                fetch(session, ident, f, dest, not a.no_verify)
                got += 1
                log(a.out, [time.strftime("%Y-%m-%d %H:%M"), ident, rel, size, lic, "https://archive.org/details/" + ident, os.path.dirname(rel)])
            except Exception as e:
                print("    failed: %s" % e, flush=True)
            time.sleep(a.pause)
    if a.go:
        print("Done: fetched %d file(s), %s." % (got, gb(total)), flush=True)
    else:
        print("Done: would fetch %s. Add --go to download." % gb(total), flush=True)
    return 0


def fetch_selftest():
    """fetch() with a stand-in for the Archive: a fresh download, a resume (206 appended), a server that ignores the
    resume (200 rewritten), already whole (416), a checksum that doesn't match, and a 404 given up on without waiting."""
    import tempfile, hashlib as hl
    body = b"0123456789" * 50

    class Resp:
        def __init__(self, code, data): self.status_code, self.data = code, data
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def raise_for_status(self):
            if self.status_code >= 400: raise IOError("HTTP %d" % self.status_code)
        def iter_content(self, n): return [self.data[i:i + n] for i in range(0, len(self.data), n)] or []

    class Session:
        def __init__(self, mode): self.mode, self.calls = mode, []
        def get(self, url, headers=None, stream=True, timeout=60):
            rng = (headers or {}).get("Range"); self.calls.append(rng)
            if self.mode == "404": return Resp(404, b"")
            if self.mode == "416": return Resp(416, b"")
            if rng and self.mode == "honour": return Resp(206, body[int(rng[6:-1]):])
            return Resp(200, body)

    slept = []; real_sleep = time.sleep; time.sleep = lambda s: slept.append(s)
    try:
        d = tempfile.mkdtemp(); f = {"name": "x.mp4", "md5": hl.md5(body).hexdigest()}; dest = os.path.join(d, "show", "x.mp4")
        fetch(Session("honour"), "id", f, dest, True)
        assert open(dest, "rb").read() == body and not os.path.exists(dest + ".part"), "fresh download"
        os.remove(dest); open(dest + ".part", "wb").write(body[:123]); s = Session("honour")
        fetch(s, "id", f, dest, True)
        assert s.calls == ["bytes=123-"] and open(dest, "rb").read() == body, "resumed from 123 and appended"
        os.remove(dest); open(dest + ".part", "wb").write(b"garbage"); s = Session("ignore")
        fetch(s, "id", f, dest, True)
        assert open(dest, "rb").read() == body, "a server that ignores Range: written afresh, not appended"
        os.remove(dest); open(dest + ".part", "wb").write(body)
        fetch(Session("416"), "id", f, dest, True)
        assert open(dest, "rb").read() == body, "416: the .part was already whole"
        os.remove(dest)
        try:
            fetch(Session("honour"), "id", {"name": "x.mp4", "md5": "0" * 32}, dest, True); raise AssertionError("bad checksum accepted")
        except RuntimeError as e:
            assert "checksum" in str(e) and not os.path.exists(dest + ".part") and not os.path.exists(dest), "bad checksum: removed"
        s = Session("404")
        try:
            fetch(s, "id", f, dest, True); raise AssertionError("404 not raised")
        except GiveUp:
            assert len(s.calls) == 1 and not slept, "a 404 is given up on at once, no retries, no waiting"
    finally:
        time.sleep = real_sleep


def selftest():
    files = [
        {"name": "show.mpeg", "format": "MPEG2", "size": "9"},
        {"name": "show.mp4", "format": "h.264", "original": "show.mpeg", "size": "5"},
        {"name": "show_512kb.mp4", "format": "512Kb MPEG4", "original": "show.mpeg", "size": "2"},
        {"name": "ep2.mp4", "format": "MPEG4", "size": "7"},
        {"name": "ep2.ia.mp4", "format": "h.264 HD", "original": "ep2.mp4", "size": "6"},
        {"name": "thumb.jpg", "format": "JPEG"},
    ]
    got = [f["name"] for f in pick(files)]
    assert got == ["ep2.ia.mp4", "show.mp4"], got
    assert clean('Wayne\'s / World: "Live"?') == "Wayne's World Live", clean('Wayne\'s / World: "Live"?')
    assert clean("..") == "Untitled"
    md = {"identifier": "abc-1", "title": "Night Owl Show", "creator": "Channel 3 Access", "collection": ["xfrcollective", "fav-someone"]}
    assert target("/out", md, {"name": "x.mp4"}, 1, "creator") == "/out/Channel 3 Access/Night Owl Show [abc-1].mp4"
    assert target("/out", md, {"name": "Part 2.mp4"}, 2, "collection") == "/out/xfrcollective/Night Owl Show - Part 2 [abc-1].mp4"
    assert target("/out", {"identifier": "z"}, {"name": "a.mp4"}, 1, "none") == "/out/z [z].mp4"
    q = build_query(DEFAULT_QUERY, (1980, 2009), None, ["talk radio", ""])
    assert "mediatype:movies" in q and "-collection:tvarchive" in q and "year:[1980 TO 2009]" in q and 'NOT ("talk radio")' in q and 'NOT ("")' not in q, q
    for t, want in [("Night Owl Theatre Episode 3", "Night Owl Theatre"), ("Night Owl Show - Part 2", "Night Owl Show"), ("Kids Korner #14", "Kids Korner"),
                    ("Cable Cooking (1987)", "Cable Cooking"), ("Episode 4", ""), ("Bowling for Seniors", "Bowling for Seniors")]:
        assert series_of(t) == want, (t, series_of(t))
    assert show_of({"title": "Night Owl Theatre episode 5", "creator": "Channel 7 Access"}, "series") == "Night Owl Theatre"
    assert show_of({"title": "Episode 4", "creator": "Channel 7 Access"}, "series") == "Channel 7 Access"
    fetch_selftest()
    print("ia_fetch selftest: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
