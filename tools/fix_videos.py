#!/usr/bin/env python3
"""fix_videos.py: convert the videos HOLODECK can't play on the iPad, in place, keeping the originals.

For Timothy's own viewing. Runs on the NAS in a throwaway Python container with ffmpeg (README → HOLODECK →
Converting videos). Many YouTube downloads are .mp4 files holding VP9 or AV1 video (and sometimes Opus audio): the
header reads fine, the iPad can't decode the picture, and HOLODECK lists them as UNREADABLE.

What it does, for every .mp4 / .m4v / .mov under SRC (subfolders included; hidden folders, .part files and yt-dlp's
unfinished pieces left alone):
  - reads its streams with ffprobe and decides:
      ok       H.264 (8-bit) or HEVC tagged hvc1, with AAC, MP3, AC-3, E-AC-3 or ALAC sound (or none): left as it is
      retag    HEVC tagged hev1 (Safari won't play that tag): the same streams, relabelled; quick and lossless
      audio    a playable picture with sound the iPad can't play (Opus, Vorbis…): picture copied, sound to AAC
      convert  anything else (VP9, AV1, MPEG-4 Part 2, 10-bit H.264…): H.264 + AAC, at most 1920 wide
  - lists them all (only the ones needing work in detail) unless --go is given;
  - with --go, one file at a time: writes the new file beside the old as "<name>.fixing.part" (HOLODECK ignores .part),
    checks it (a playable picture, the same length within 2 s), then moves the ORIGINAL to the same path under KEEP and
    puts the new file in its place under the original's name and date. The folders in SRC never change; HOLODECK keeps
    each video's place and measures it again on LOOK AGAIN. A failed or stopped conversion leaves the original where it
    was (a leftover .fixing.part is removed on the next run).
  - never deletes anything of yours; KEEP must be outside SRC (or HOLODECK would find the originals).

  python3 fix_videos.py --src /video --keep /keep                  # report only
  python3 fix_videos.py --src /video --keep /keep --go             # convert
  python3 fix_videos.py --src /video --keep /keep --go --limit 3   # try three first
  python3 fix_videos.py --src /video --keep /keep --only "Unsolved Mysteries"
  python3 fix_videos.py --selftest                                 # checks of the deciding (and real conversions with ffmpeg)
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time

VIDEO = re.compile(r"\.(mp4|m4v|mov)$", re.I)                   # what HOLODECK plays (others are skipped by name there)
PARTIAL = re.compile(r"\.(f\d+|temp)\.[a-z0-9]+$", re.I)          # yt-dlp's unfinished pieces, as in HOLODECK
TMP = ".fixing.part"
OK_AUDIO = {"aac", "mp3", "ac3", "eac3", "alac"}
MAX_W = 1920


def run(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")


def probe(path):
    """{'v': {codec, tag, pix, w, h} or None, 'a': {codec} or None, 'dur': seconds or None}; None if unreadable."""
    r = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,codec_tag_string,pix_fmt,width,height:format=duration", "-of", "json", path])
    if r.returncode != 0:
        return None
    try:
        j = json.loads(r.stdout or "{}")
    except ValueError:
        return None
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video" and s.get("codec_name") not in ("mjpeg", "png")), None)
    a = next((s for s in j.get("streams", []) if s.get("codec_type") == "audio"), None)
    try:
        dur = float((j.get("format") or {}).get("duration"))
    except (TypeError, ValueError):
        dur = None
    return {"v": v and {"codec": v.get("codec_name", "?"), "tag": v.get("codec_tag_string", ""), "pix": v.get("pix_fmt", ""), "w": v.get("width") or 0, "h": v.get("height") or 0},
            "a": a and {"codec": a.get("codec_name", "?")}, "dur": dur}


def decide(p):
    """(action, why) for one probed file: ok, retag, audio, convert or broken."""
    if not p or not p["v"]:
        return "broken", "no picture ffprobe can read"
    v, a = p["v"], p["a"]
    ten = "10" in v["pix"] or "12" in v["pix"]
    pic_ok = (v["codec"] == "h264" and not ten and v["pix"] in ("yuv420p", "yuvj420p", "")) or (v["codec"] == "hevc" and v["tag"] == "hvc1")
    snd_ok = a is None or a["codec"] in OK_AUDIO
    if pic_ok and snd_ok:
        return "ok", ""
    if v["codec"] == "hevc" and v["tag"] != "hvc1" and snd_ok:
        return "retag", "HEVC tagged %s (Safari wants hvc1)" % (v["tag"] or "?")
    if pic_ok:
        return "audio", "%s sound" % a["codec"]
    return "convert", "%s%s video%s" % (v["codec"].upper(), " 10-bit" if ten else "", "" if snd_ok else ", %s sound" % a["codec"])


def ffmpeg_cmd(action, src, out, p, crf, preset):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "0"]
    if action == "retag":
        cmd += ["-c", "copy", "-tag:v", "hvc1"]
    elif action == "audio":
        cmd += ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k"]
        if p["v"]["codec"] == "hevc":
            cmd += ["-tag:v", "hvc1"]
    else:
        vf = "scale='min(%d,iw)':-2" % MAX_W   # 4K downloads come down to 1080p: the iPad's screen, and a fraction of the time
        cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p", "-profile:v", "high", "-vf", vf]
        cmd += ["-c:a", "copy"] if p["a"] and p["a"]["codec"] in OK_AUDIO else ["-c:a", "aac", "-b:a", "160k"]
    return cmd + ["-movflags", "+faststart", "-f", "mp4", out]


def walk(src, only):
    base = os.path.join(src, only) if only else src
    for root, dirs, files in os.walk(base):
        dirs[:] = sorted(d for d in dirs if not d.startswith((".", "@")) and d != "#recycle")   # hidden, Synology/UGOS system folders
        for f in sorted(files):
            if f.startswith(".") or not VIDEO.search(f) or PARTIAL.search(f):
                continue
            yield os.path.join(root, f)


def mmss(s):
    s = int(round(s or 0)); return "%d:%02d:%02d" % (s // 3600, s % 3600 // 60, s % 60) if s >= 3600 else "%d:%02d" % (s // 60, s % 60)


def fix_one(path, src, keep, action, p, crf, preset, log):
    tmp = path + TMP
    t0 = time.time()
    r = run(ffmpeg_cmd(action, path, tmp, p, crf, preset))
    if r.returncode != 0:
        if os.path.exists(tmp): os.remove(tmp)
        log("   FAILED: ffmpeg: " + (r.stderr.strip().splitlines() or ["?"])[-1][:200]); return False
    q = probe(tmp)
    if decide(q)[0] != "ok" or (p["dur"] and q["dur"] and abs(q["dur"] - p["dur"]) > 2):
        if os.path.exists(tmp): os.remove(tmp)
        log("   FAILED: the new file didn't check out (%s, %s vs %s)" % (decide(q)[1] or "?", mmss(q and q["dur"]), mmss(p["dur"]))); return False
    dest = os.path.join(keep, os.path.relpath(path, src))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest):
        stem, ext = os.path.splitext(dest); dest = "%s (kept %s)%s" % (stem, time.strftime("%Y-%m-%d %H%M"), ext)
    st = os.stat(path)
    shutil.move(path, dest)                         # the original out of HOLODECK's reach, same folders under KEEP
    try:
        os.replace(tmp, path)                       # the new one in its place, same name
        os.utime(path, (st.st_atime, st.st_mtime))  # and the same date, so nothing reorders by date
    except OSError as e:
        shutil.move(dest, path)                     # put the original back
        if os.path.exists(tmp): os.remove(tmp)
        log("   FAILED: couldn't put the new file in place (%s); the original is back" % e); return False
    log("   done in %s · %.0f MB → %.0f MB · original kept at %s" % (mmss(time.time() - t0), st.st_size / 1e6, os.path.getsize(path) / 1e6, dest))
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description="Convert the videos HOLODECK can't play, keeping the originals.")
    ap.add_argument("--src", help="the Video folder HOLODECK reads")
    ap.add_argument("--keep", help="where the originals go: outside SRC")
    ap.add_argument("--go", action="store_true", help="convert (without it, only report)")
    ap.add_argument("--only", default="", help="a folder inside SRC, to do just that one")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many conversions")
    ap.add_argument("--crf", type=int, default=20, help="H.264 quality: lower is better and bigger (18 to 23)")
    ap.add_argument("--preset", default="faster", help="x264 speed: veryfast, faster (default), medium, slow")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.src or not a.keep:
        ap.error("--src and --keep are both needed")
    src, keep = os.path.realpath(a.src), os.path.realpath(a.keep)
    if not os.path.isdir(src):
        sys.exit("No folder at --src " + a.src)
    if keep == src or keep.startswith(src + os.sep):
        sys.exit("--keep must be outside --src, or HOLODECK would find the originals again")
    if a.go and not os.path.isdir(keep):
        sys.exit("No folder at --keep " + a.keep + " (make it first)")
    log = lambda s: print(s, flush=True)
    for root, _, files in os.walk(src):   # a run stopped halfway leaves its half-made file: clear it
        for f in files:
            if f.endswith(TMP):
                os.remove(os.path.join(root, f)); log("removed a half-made file from an earlier run: " + os.path.join(os.path.relpath(root, src), f))
    todo, counts, total = [], {}, 0.0
    for path in walk(src, a.only):
        p = probe(path); act, why = decide(p)
        counts[act] = counts.get(act, 0) + 1
        if act != "ok":
            todo.append((path, act, why, p)); total += (p and p["dur"]) or 0
    by = {}
    for path, act, why, p in todo:
        by.setdefault(os.path.relpath(os.path.dirname(path), src), []).append((path, act, why, p))
    for folder in sorted(by):
        log("\n%s  (%d)" % (folder, len(by[folder])))
        for path, act, why, p in by[folder]:
            log("  %-7s %s  · %s · %s" % (act.upper(), os.path.basename(path), why, mmss(p and p["dur"])))
    log("\n%d videos read: %d play already, %d to convert, %d to relabel, %d sound only, %d unreadable even by ffprobe. %s of video to do."
        % (sum(counts.values()), counts.get("ok", 0), counts.get("convert", 0), counts.get("retag", 0), counts.get("audio", 0), counts.get("broken", 0), mmss(total)))
    if not a.go:
        log("Nothing changed. Add --go to convert (originals go to %s)." % keep); return 0
    done = failed = 0
    for path, act, why, p in todo:
        if act == "broken":
            continue
        if a.limit and done >= a.limit:
            log("\nStopped at --limit %d." % a.limit); break
        log("\n%s %s (%s)" % (act.upper(), os.path.relpath(path, src), why))
        if fix_one(path, src, keep, act, p, a.crf, a.preset, log): done += 1
        else: failed += 1
    log("\n%d done, %d failed. On the iPad: HOLODECK → LOOK AGAIN." % (done, failed))
    return 1 if failed else 0


def selftest():
    P = lambda vc, tag="", pix="yuv420p", ac="aac", dur=60.0: {"v": {"codec": vc, "tag": tag, "pix": pix, "w": 1280, "h": 720}, "a": ac and {"codec": ac}, "dur": dur}
    assert decide(P("h264", "avc1"))[0] == "ok"
    assert decide(P("h264", "avc1", ac=None))[0] == "ok"
    assert decide(P("hevc", "hvc1", ac="eac3"))[0] == "ok"
    assert decide(P("hevc", "hev1")) == ("retag", "HEVC tagged hev1 (Safari wants hvc1)")
    assert decide(P("h264", "avc1", ac="opus")) == ("audio", "opus sound")
    assert decide(P("vp9", "vp09")) == ("convert", "VP9 video")
    assert decide(P("av1", "av01", ac="opus")) == ("convert", "AV1 video, opus sound")
    assert decide(P("h264", "avc1", pix="yuv420p10le")) == ("convert", "H264 10-bit video")
    assert decide(P("mpeg4", "mp4v"))[0] == "convert"
    assert decide(None)[0] == "broken" and decide({"v": None, "a": None, "dur": None})[0] == "broken"
    assert "-tag:v" in ffmpeg_cmd("retag", "a", "b", P("hevc", "hev1"), 20, "medium")
    c = ffmpeg_cmd("convert", "a", "b", P("vp9", ac="aac"), 20, "medium")
    assert c[c.index("-c:a") + 1] == "copy" and "libx264" in c and c[-3:] == ["-f", "mp4", "b"]
    assert mmss(185.4) == "3:05" and mmss(3725) == "1:02:05"
    print("deciding OK")

    try:
        have = run(["ffmpeg", "-version"]).returncode == 0 and run(["ffprobe", "-version"]).returncode == 0
    except FileNotFoundError:
        have = False
    if not have:
        print("ffmpeg not here: real conversions not tried"); return 0
    d = tempfile.mkdtemp(); src, keep = os.path.join(d, "Video"), os.path.join(d, "Holodeck converts")
    os.makedirs(os.path.join(src, "Show", "Season 1")); os.makedirs(os.path.join(src, "Music")); os.makedirs(os.path.join(src, ".hidden")); os.makedirs(keep)
    mk = lambda path, vargs, aargs: run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3"] + vargs + aargs + ["-shortest", path])
    files = {
        "Music/Song A [vp9].mp4": (["-c:v", "libvpx-vp9", "-b:v", "200k"], ["-c:a", "libopus"]),
        "Show/Season 1/E01 [ok].mp4": (["-c:v", "libx264", "-pix_fmt", "yuv420p"], ["-c:a", "aac"]),
        "Show/Season 1/E02 [opus].mp4": (["-c:v", "libx264", "-pix_fmt", "yuv420p"], ["-c:a", "libopus"]),
        ".hidden/Skip [vp9].mp4": (["-c:v", "libvpx-vp9", "-b:v", "200k"], ["-c:a", "libopus"]),
    }
    for rel, (va, aa) in files.items():
        r = mk(os.path.join(src, rel), va, aa); assert r.returncode == 0, r.stderr
    open(os.path.join(src, "Music", "Song B.f137.mp4"), "w").close()   # yt-dlp leftover: never touched
    open(os.path.join(src, "Music", "Old" + TMP), "w").close()          # a half-made file from a stopped run: removed
    old_mtime = time.time() - 86400 * 30
    os.utime(os.path.join(src, "Music", "Song A [vp9].mp4"), (old_mtime, old_mtime))
    assert main(["--src", src, "--keep", keep]) == 0                   # report only: nothing changes
    assert decide(probe(os.path.join(src, "Music", "Song A [vp9].mp4")))[0] == "convert" and not os.listdir(keep)
    assert main(["--src", src, "--keep", keep, "--go"]) == 0
    for rel in ("Music/Song A [vp9].mp4", "Show/Season 1/E01 [ok].mp4", "Show/Season 1/E02 [opus].mp4"):
        assert decide(probe(os.path.join(src, rel)))[0] == "ok", rel          # all play now, same names, same folders
    assert sorted(os.path.relpath(os.path.join(r, f), keep) for r, _, fs in os.walk(keep) for f in fs) == ["Music/Song A [vp9].mp4", "Show/Season 1/E02 [opus].mp4"]
    assert decide(probe(os.path.join(keep, "Music", "Song A [vp9].mp4")))[0] == "convert", "the original kept as it was"
    assert abs(os.path.getmtime(os.path.join(src, "Music", "Song A [vp9].mp4")) - old_mtime) < 2, "same date"
    assert os.path.exists(os.path.join(src, ".hidden", "Skip [vp9].mp4")) and os.path.exists(os.path.join(src, "Music", "Song B.f137.mp4"))
    assert not os.path.exists(os.path.join(src, "Music", "Old" + TMP))
    assert not any(f.endswith(TMP) for r, _, fs in os.walk(src) for f in fs)
    assert main(["--src", src, "--keep", keep, "--go"]) == 0                  # a second run: nothing left to do
    try:
        main(["--src", src, "--keep", os.path.join(src, "Music")]); assert False, "KEEP inside SRC refused"
    except SystemExit as e:
        assert "outside" in str(e)
    shutil.rmtree(d)
    print("conversions OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
