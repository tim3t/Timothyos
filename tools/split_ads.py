#!/usr/bin/env python3
"""split_ads.py: cut commercial compilations into single commercials for HOLODECK's breaks.

For Timothy's own viewing. Runs on the NAS in a throwaway Python container with ffmpeg (README → HOLODECK →
Commercial breaks). HOLODECK skips any commercial over 3 minutes, so a 6-minute compilation of several commercials
never airs; this finds the cuts between them and writes each as its own file.

What it does:
  - for each video in SRC (not in its subfolders), longer than --max seconds (anything shorter is already a single
    and airs as it is), finds the moments where the picture is black AND the sound is silent at the same time
    (--by black or --by silence uses one alone);
  - writes each piece between those moments as  OUT/<name> - 01.mp4, - 02.mp4 …  in H.264 and AAC with +faststart,
    re-encoded so each starts and ends exactly on the cut, via a .part file (HOLODECK ignores those);
  - leaves out pieces shorter than --min seconds, and pieces still longer than --max (no cut found there; HOLODECK
    would skip them anyway);
  - never changes or deletes the originals (HOLODECK already skips them for their length);
  - keeps OUT/_split_done.txt (name and size of each file done), so a later run splits only new downloads. A file
    interrupted halfway, or one that gave no singles, is tried again next time.

It only lists the cuts it would make unless --go is given.

  python3 split_ads.py --src /data                       # list the cuts, OUT is /data/Singles
  python3 split_ads.py --src /data --go                  # cut them
  python3 split_ads.py --src /data --go --by black       # cut at black picture alone
  python3 split_ads.py --selftest                        # checks of the reading and planning (and a real cut with ffmpeg)
"""
import argparse, os, re, subprocess, sys, tempfile

VIDEO = re.compile(r"\.(mp4|m4v|mov|webm|mkv)$", re.I)
PARTIAL = re.compile(r"\.(f\d+|temp)\.[a-z0-9]+$", re.I)   # yt-dlp's unfinished pieces, as in HOLODECK
DONE = "_split_done.txt"


def run(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


LOOSE = {"gap": 0.05, "noise": -38.0, "dark": 0.15, "picture": 0.85}   # --compare's second try: for worn tape, where black is grey and noisy


def detect(path, black_d, noise, pix_th, pic_th=0.98):
    """ffmpeg's blackdetect and silencedetect over the whole file, in one pass; their report, as text."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vf", "blackdetect=d=%s:pix_th=%s:pic_th=%s" % (black_d, pix_th, pic_th),
             "-af", "silencedetect=noise=%sdB:d=%s" % (noise, black_d), "-f", "null", "-"])
    return r.stderr


def parse(report, dur):
    """The black and the silent stretches, as (start, end) seconds. A silence still going at the end runs to dur."""
    num = r"(-?[\d.]+(?:e-?\d+)?)"
    black = [(max(0.0, float(a)), float(b)) for a, b in re.findall(r"black_start:\s*" + num + r"\s+black_end:\s*" + num, report)]
    silent, start = [], None
    for kind, v in re.findall(r"silence_(start|end):\s*" + num, report):
        if kind == "start":
            start = max(0.0, float(v))
        elif start is not None:
            silent.append((start, float(v))); start = None
    if start is not None:
        silent.append((start, dur))
    return black, silent


def gaps(black, silent, by, least=0.08):
    """Where one commercial ends and the next begins: black and silent together (by="both"), or one alone."""
    if by == "black":
        out = list(black)
    elif by == "silence":
        out = list(silent)
    else:
        out = [(max(a, c), min(b, d)) for a, b in black for c, d in silent if min(b, d) - max(a, c) >= least]
    out.sort(); merged = []
    for a, b in out:
        if merged and a <= merged[-1][1] + 0.05:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def plan(dur, cuts, lo, hi):
    """The pieces between the cuts: (keep, start, end), keep False when shorter than lo or longer than hi."""
    pieces, t = [], 0.0
    for a, b in cuts + [(dur, dur)]:
        if a - t > 0.01:
            pieces.append((lo <= a - t <= hi, round(t, 3), round(a, 3)))
        t = max(t, b)
    return pieces


def cut(src, start, end, dest):
    part = dest + ".part"
    r = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % start, "-i", src, "-t", "%.3f" % (end - start),
             "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", part])
    if r.returncode != 0:
        if os.path.exists(part):
            os.remove(part)
        raise RuntimeError(r.stderr.strip()[-300:] or "ffmpeg failed")
    os.replace(part, dest)


def done_list(out):
    try:
        with open(os.path.join(out, DONE), encoding="utf-8") as f:
            return {tuple(l.rstrip("\n").split("\t")[:2]) for l in f if "\t" in l}
    except FileNotFoundError:
        return set()


def pl(n, word):
    return "%d %s%s" % (n, word, "" if n == 1 else "s")


def flags(o):
    return "--gap %g --noise %g --dark %g --picture %g" % (o["gap"], o["noise"], o["dark"], o["picture"])


def compare(paths, a):
    """For a sample of compilations: how much of them each way of cutting would keep, and how long a typical single is."""
    mine = {"gap": a.gap, "noise": a.noise, "dark": a.dark, "picture": a.picture}
    tries = [("as set", mine)] + ([("loose", LOOSE)] if LOOSE != mine else [])
    stats = {(t, by): {"n": 0, "kept": 0.0, "lens": []} for t, _ in tries for by in ("both", "black", "silence")}
    total = 0.0
    for path, dur in paths:
        total += dur; line = []
        for t, o in tries:
            black, silent = parse(detect(path, o["gap"], o["noise"], o["dark"], o["picture"]), dur)
            for by in ("both", "black", "silence"):
                keep = [e - s for k, s, e in plan(dur, gaps(black, silent, by), a.min, a.max) if k]
                st = stats[(t, by)]; st["n"] += len(keep); st["kept"] += sum(keep); st["lens"] += keep
                line.append("%s/%s %d" % (by, t, len(keep)))
        print("%s (%s): %s" % (os.path.basename(path), mmss(dur), " · ".join(line)))
    print("\nOver %s (%s):" % (pl(len(paths), "compilation"), mmss(total)))
    print("  %-16s %8s %6s %8s   %s" % ("cut at", "singles", "kept", "typical", "add to the command"))
    best = None
    for (t, by), st in stats.items():
        lens = sorted(st["lens"]); typ = lens[len(lens) // 2] if lens else 0; share = st["kept"] / total if total else 0
        print("  %-16s %8d %5d%% %8s   --by %s %s" % (by + ", " + t, st["n"], round(share * 100), mmss(typ), by, flags(dict(tries)[t])))
        if 10 <= typ <= 90 and (best is None or share > best[0]):
            best = (share, by, t)
    if best:
        print("\nMost kept with singles of a normal length (10 s to 1:30): --by %s %s" % (best[1], flags(dict(tries)[best[2]])))
    else:
        print("\nNo way of cutting gave singles of a normal length (10 s to 1:30): these may have no black or silent moment between commercials.")
    return 0


def mmss(s):
    return "%d:%02d" % (int(s) // 60, int(s) % 60)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Cut commercial compilations into single commercials, for HOLODECK.")
    ap.add_argument("--src", help="the Commercials folder (in the container: /data)")
    ap.add_argument("--out", help="where the singles go (default: SRC/Singles; make it first)")
    ap.add_argument("--by", choices=["both", "black", "silence"], default="both", help="what marks a cut (default: black and silent together)")
    ap.add_argument("--min", type=float, default=5.0, help="leave out pieces shorter than this, in seconds")
    ap.add_argument("--max", type=float, default=180.0, help="files up to this long are already singles; pieces longer are left out")
    ap.add_argument("--gap", type=float, default=0.1, help="the shortest black or silence that counts, in seconds")
    ap.add_argument("--noise", type=float, default=-45.0, help="quieter than this is silence, in dB")
    ap.add_argument("--dark", type=float, default=0.10, help="how dark a pixel must be to count as black (0 to 1)")
    ap.add_argument("--picture", type=float, default=0.98, help="how much of the picture must be that dark (0 to 1)")
    ap.add_argument("--limit", type=int, help="only the first this many compilations (for a quick look)")
    ap.add_argument("--compare", action="store_true", help="try each way of cutting on the compilations and say which keeps most (writes nothing)")
    ap.add_argument("--go", action="store_true", help="cut; without it, only list")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.src:
        ap.error("--src is required")
    out = a.out or os.path.join(a.src, "Singles")
    if not os.path.isdir(out):
        sys.exit("No folder %s yet: make it first (it's where the singles go)." % out)
    seen = done_list(out)
    names = sorted(n for n in os.listdir(a.src) if VIDEO.search(n) and not PARTIAL.search(n) and os.path.isfile(os.path.join(a.src, n)))
    total = {"files": 0, "pieces": 0, "short": 0, "long": 0, "failed": 0, "would": 0, "secs": 0.0}
    if a.compare:
        found = []
        for n in names:
            d = duration(os.path.join(a.src, n))
            if d and d > a.max:
                found.append((os.path.join(a.src, n), d))
            if a.limit and len(found) >= a.limit:
                break
        return compare(found, a)
    for n in names:
        if a.limit and total["files"] >= a.limit:
            break
        path = os.path.join(a.src, n); size = str(os.path.getsize(path))
        if (n, size) in seen:
            continue
        dur = duration(path)
        if dur is None:
            print("?? %s: can't read its length, skipped" % n); total["failed"] += 1; continue
        if dur <= a.max:
            continue   # already a single
        black, silent = parse(detect(path, a.gap, a.noise, a.dark, a.picture), dur)
        pieces = plan(dur, gaps(black, silent, a.by), a.min, a.max)
        keep = [p for p in pieces if p[0]]
        total["files"] += 1; total["short"] += sum(1 for p in pieces if not p[0] and p[2] - p[1] < a.min); total["long"] += sum(1 for p in pieces if not p[0] and p[2] - p[1] > a.max)
        print("%s (%s): %d pieces%s" % (n, mmss(dur), len(keep), "" if len(keep) == len(pieces) else ", %d left out" % (len(pieces) - len(keep))))
        for i, (_, s, e) in enumerate(keep, 1):
            print("   %02d  %s to %s  (%s)" % (i, mmss(s), mmss(e), mmss(e - s)))
        total["would"] += len(keep); total["secs"] += sum(e - s for _, s, e in keep)
        if not a.go:
            continue
        stem = re.sub(r"\.[^.]+$", "", n)
        try:
            for i, (_, s, e) in enumerate(keep, 1):
                cut(path, s, e, os.path.join(out, "%s - %02d.mp4" % (stem, i)))
        except RuntimeError as err:
            print("   !! stopped on this file: %s" % err); total["failed"] += 1; continue
        if keep:   # one that gave nothing isn't marked done, so a run with other settings tries it again
            with open(os.path.join(out, DONE), "a", encoding="utf-8") as f:
                f.write("%s\t%s\t%d\n" % (n, size, len(keep)))
        total["pieces"] += len(keep)
    print("\n%s%s · left out: %d too short, %d still over %s (no cut found) · %d failed"
          % (pl(total["files"], "compilation"), " · %s written" % pl(total["pieces"], "single") if a.go else "", total["short"], total["long"], mmss(a.max), total["failed"]))
    if not a.go and total["files"]:
        print("--go would write %s (%s of commercials). Nothing written yet." % (pl(total["would"], "single"), mmss(total["secs"])))
    return 1 if total["failed"] else 0


def selftest():
    # reading ffmpeg's report
    rep = ("[blackdetect @ 0x1] black_start:0 black_end:0.4 black_duration:0.4\n"
           "[silencedetect @ 0x2] silence_start: -0.01\n[silencedetect @ 0x2] silence_end: 0.5 | silence_duration: 0.51\n"
           "[blackdetect @ 0x1] black_start:30.04 black_end:30.6 black_duration:0.56\n"
           "[silencedetect @ 0x2] silence_start: 29.9\n[silencedetect @ 0x2] silence_end: 30.7 | silence_duration: 0.8\n"
           "[blackdetect @ 0x1] black_start:45.2 black_end:45.5 black_duration:0.3\n"          # black, sound playing: not a cut
           "[silencedetect @ 0x2] silence_start: 61\n[silencedetect @ 0x2] silence_end: 61.4 | silence_duration: 0.4\n"   # silent, picture on: not a cut
           "[blackdetect @ 0x1] black_start:90.1 black_end:90.5 black_duration:0.4\n"
           "[silencedetect @ 0x2] silence_start: 90\n[silencedetect @ 0x2] silence_end: 90.6 | silence_duration: 0.6\n"
           "[blackdetect @ 0x1] black_start:93 black_end:93.3 black_duration:0.3\n"
           "[silencedetect @ 0x2] silence_start: 93\n[silencedetect @ 0x2] silence_end: 93.3 | silence_duration: 0.3\n"
           "[silencedetect @ 0x2] silence_start: 299.5\n")
    black, silent = parse(rep, 300.0)
    assert black[0] == (0.0, 0.4) and silent[0] == (0.0, 0.5) and silent[-1] == (299.5, 300.0), (black, silent)
    g = gaps(black, silent, "both")
    assert g == [(0.0, 0.4), (30.04, 30.6), (90.1, 90.5), (93.0, 93.3)], g
    assert len(gaps(black, silent, "black")) == 5 and len(gaps(black, silent, "silence")) == 6
    p = plan(300.0, g, 5, 180)
    assert p == [(True, 0.4, 30.04), (True, 30.6, 90.1), (False, 90.5, 93.0), (False, 93.3, 300.0)], p   # 2.5 s left out as short; the last 206.7 s as still too long
    assert plan(100.0, [], 5, 180) == [(True, 0.0, 100.0)]
    assert plan(10.0, [(0.0, 0.5), (9.6, 10.0)], 5, 180) == [(True, 0.5, 9.6)]   # black at both ends makes no extra pieces
    assert gaps([(1, 2), (2.02, 3)], [(0, 5)], "both") == [(1, 3)]   # touching stretches are one cut
    assert mmss(185.4) == "3:05"
    print("planning OK")

    # a real cut, when ffmpeg is here: three commercials (8 s, 10 s, 3 s) between black silent gaps, then a long tail
    try:
        have = run(["ffmpeg", "-version"]).returncode == 0
    except FileNotFoundError:
        have = False
    if not have:
        print("ffmpeg not found: real cut skipped"); return 0
    d = tempfile.mkdtemp(); src = os.path.join(d, "src"); out = os.path.join(src, "Singles"); os.makedirs(out)
    segs = [("red", 8, 440), (None, .6, 0), ("blue", 10, 550), (None, .6, 0), ("green", 3, 660), (None, .6, 0), ("yellow", 190, 330)]
    ins, fl = [], []
    for i, (c, t, hz) in enumerate(segs):
        ins += ["-f", "lavfi", "-i", "color=c=%s:s=96x64:r=10:d=%s" % (c or "black", t), "-f", "lavfi", "-i", ("sine=frequency=%d:duration=%s" % (hz, t)) if c else "aevalsrc=0:d=%s" % t]
        fl.append("[%d:v][%d:a]" % (2 * i, 2 * i + 1))
    comp = os.path.join(src, "Retro Ads Vol 1 [Ab1Cd2].mp4")
    r = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", "".join(fl) + "concat=n=%d:v=1:a=1[v][a]" % len(segs), "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", comp])
    assert r.returncode == 0, r.stderr
    open(os.path.join(src, "Empty.mp4"), "wb").close()   # an unreadable file: reported, and the run goes on
    assert main(["--src", src]) == 1 and not [n for n in os.listdir(out) if n.endswith(".mp4")], "a list run writes nothing"
    os.remove(os.path.join(src, "Empty.mp4"))
    assert main(["--src", src, "--go"]) == 0
    got = sorted(n for n in os.listdir(out) if n.endswith(".mp4"))
    assert got == ["Retro Ads Vol 1 [Ab1Cd2] - 01.mp4", "Retro Ads Vol 1 [Ab1Cd2] - 02.mp4"], got   # 3 s and 190 s left out
    lens = [duration(os.path.join(out, n)) for n in got]
    assert abs(lens[0] - 8) < .4 and abs(lens[1] - 10) < .4, lens
    assert not [n for n in os.listdir(out) if n.endswith(".part")]
    assert open(os.path.join(out, DONE)).read().startswith("Retro Ads Vol 1 [Ab1Cd2].mp4\t")
    before = os.path.getmtime(os.path.join(out, got[0]))
    assert main(["--src", src, "--go"]) == 0 and os.path.getmtime(os.path.join(out, got[0])) == before, "done once, never again"
    assert os.path.exists(comp), "the original stays"
    flat = os.path.join(src, "No Gaps.mp4")
    r = run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=96x64:r=10:d=200", "-f", "lavfi", "-i", "sine=frequency=440:duration=200", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", flat])
    assert r.returncode == 0, r.stderr
    assert main(["--src", src, "--go"]) == 0 and "No Gaps.mp4" not in open(os.path.join(out, DONE)).read(), "nothing kept: not marked done"
    assert compare([(comp, duration(comp))], argparse.Namespace(gap=.1, noise=-45.0, dark=.10, picture=.98, min=5.0, max=180.0)) == 0
    print("real cut OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
