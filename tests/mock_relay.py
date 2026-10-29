"""Simulated NAS relay (Caddy behind Tailscale on the NAS) on :8110 (or the port given as the first argument).
Read-only, token by Bearer header or ?k=, CORS for the test origin, JSON folder listings
(Accept: application/json, like Caddy's file_server browse), byte ranges for audio.
Files are generated silence; names are invented.
/ha/* is a simulated Home Assistant behind the relay (2.24): relay token by ?k=, HA token by Bearer."""
import io, json, struct, wave, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

TOKEN = "relay-test-token"
ORIGIN = "http://localhost:8080"

def wav(seconds):
    b = io.BytesIO()
    w = wave.open(b, "wb"); w.setnchannels(1); w.setsampwidth(1); w.setframerate(8000)
    w.writeframes(b"\x80" * (8000 * seconds)); w.close()
    return b.getvalue()

FILES = {
    "/Podcasts/Show A/ep 1.wav": (wav(90), "2026-08-01T10:00:00Z"),
    "/Podcasts/Show A/ep 2.wav": (wav(90), "2026-08-02T10:00:00Z"),
    "/Podcasts/Show A/ep 10.wav": (wav(90), "2026-08-10T10:00:00Z"),
    "/Podcasts/Show A/notes.txt": (b"show notes", "2026-08-03T10:00:00Z"),
    "/Music/Album/track.wav": (wav(5), "2026-07-01T10:00:00Z"),
}
def tagged():
    """An MP3 with ID3v2.3 tags and embedded artwork, and a cover.png, made with ffmpeg (skipped without it)."""
    import subprocess, tempfile, os, shutil
    if not shutil.which("ffmpeg"): return {}
    d = tempfile.mkdtemp(); cov = os.path.join(d, "cover.png"); art = os.path.join(d, "art.png"); mp3 = os.path.join(d, "b1.mp3")
    q = ["-loglevel", "error", "-y"]
    subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-i", "color=c=0x3060c0:s=64x64", "-frames:v", "1", cov], check=True)
    subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-i", "color=c=0xc04040:s=300x300", "-frames:v", "1", art], check=True)
    subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-t", "90", "-i", "anullsrc=r=22050:cl=mono", "-i", art, "-map", "0:a", "-map", "1:v",
                    "-c:a", "libmp3lame", "-b:a", "16k", "-c:v", "png", "-id3v2_version", "3", "-metadata", "title=The Quiet Barn",
                    "-metadata", "artist=Show B Hosts", "-metadata", "album=Show B", "-metadata:s:v", "comment=Cover (front)", mp3], check=True)
    album = {}
    for fname, title, trk, disc in [("a.mp3", "Closing Time", "3/3", "1/2"), ("b.mp3", "Opening", "1/3", "1/2"), ("c.mp3", "Middle", "2", "1/2"), ("0 bonus.mp3", "Bonus", "1", "2/2")]:
        out = os.path.join(d, fname)
        subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-t", "3", "-i", "anullsrc=r=22050:cl=mono", "-c:a", "libmp3lame", "-b:a", "16k", "-id3v2_version", "3",
                        "-metadata", "title=" + title, "-metadata", "track=" + trk, "-metadata", "disc=" + disc, "-metadata", "album=Album Two", out], check=True)
        album["/Music/Album2/" + fname] = (open(out, "rb").read(), "2026-07-02T10:00:00Z")
    return {**album, "/Podcasts/Show B/ep b1.mp3": (open(mp3, "rb").read(), "2026-09-01T10:00:00Z"),
            "/Music/Album/cover.png": (open(cov, "rb").read(), "2026-07-01T10:00:00Z")}
FILES.update(tagged())
def lengths():
    """2.30 track lengths: one file per way of reading a length, made with ffmpeg (skipped without it). Expected seconds in LENGTHS."""
    import subprocess, tempfile, os, shutil
    if not shutil.which("ffmpeg"): return {}
    d = tempfile.mkdtemp(); q = ["-loglevel", "error", "-y"]; out = {}
    src = lambda s: ["-f", "lavfi", "-t", str(s), "-i", "sine=frequency=330:sample_rate=22050"]
    big = os.path.join(d, "big.png")
    subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-i", "nullsrc=s=600x600,geq=random(1)*255:128:128", "-frames:v", "1", big], check=True)   # noise: a picture too big for the first read
    jobs = [("vbr.mp3", 75, ["-c:a", "libmp3lame", "-q:a", "9"]),                                    # Xing header (variable bitrate)
            ("cbr.mp3", 61, ["-c:a", "libmp3lame", "-b:a", "32k", "-write_xing", "0"]),               # no header: bitrate and size
            ("art.mp3", 42, ["-c:a", "libmp3lame", "-b:a", "32k", "-id3v2_version", "3"]),            # artwork in the tag, frames after it
            ("end.m4a", 63, ["-c:a", "aac", "-b:a", "32k"]),                                           # moov after the audio
            ("fast.m4a", 50, ["-c:a", "aac", "-b:a", "32k", "-movflags", "+faststart"]),               # moov first
            ("song.flac", 33, ["-c:a", "flac"]),
            ("talk.ogg", 20, ["-c:a", "libvorbis"])]                                                   # not read: shows once played
    for fname, secs, args in jobs:
        f = os.path.join(d, fname)
        extra = ["-i", big, "-map", "0:a", "-map", "1:v", "-c:v", "png", "-metadata:s:v", "comment=Cover (front)"] if fname == "art.mp3" else []
        try: subprocess.run(["ffmpeg", *q, *src(secs), *extra, *args, f], check=True)
        except Exception: continue
        out["/Music/Lengths/" + fname] = (open(f, "rb").read(), "2026-10-01T10:00:00Z")
    return out
FILES.update(lengths())
def tagkinds():
    """2.30.1 TRACK #: tags written by hand, one per layout that used to hide the number. Name order a..f, track order c e b d a f."""
    import subprocess, tempfile, os, shutil, random
    if not shutil.which("ffmpeg"): return {}
    f = os.path.join(tempfile.mkdtemp(), "raw.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-t", "4", "-i", "sine=frequency=440:sample_rate=22050",
                    "-c:a", "libmp3lame", "-b:a", "32k", "-id3v2_version", "0", "-write_xing", "0", f], check=True)
    audio = open(f, "rb").read()
    ss = lambda n: bytes([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127])
    txt = lambda s: b"\x00" + s.encode("latin1")
    f23 = lambda i, d: i.encode() + len(d).to_bytes(4, "big") + b"\x00\x00" + d
    f24 = lambda i, d, fmt=0: i.encode() + ss(len(d)) + bytes([0, fmt]) + d
    f22 = lambda i, d: i.encode() + len(d).to_bytes(3, "big") + d
    tag = lambda ver, body, flags=0: b"ID3" + bytes([ver, 0, flags]) + ss(len(body)) + body
    rnd = random.Random(7)
    pic = lambda n: b"\x00image/png\x00\x03\x00" + bytes(rnd.randrange(256) for _ in range(n))
    def unsync(b):
        out = bytearray()
        for i, x in enumerate(b):
            out.append(x)
            if x == 255: out.append(0)
        return bytes(out)
    v1 = lambda title, n: b"TAG" + title.encode().ljust(30, b"\x00") + b"\x00" * 30 + b"\x00" * 30 + b"2026" + b"\x00" * 28 + b"\x00" + bytes([n]) + b"\xff"
    pad = b"\x00" * 200
    files = {
        "a art first.mp3": tag(3, f23("APIC", pic(300000)) + f23("TIT2", txt("Episode Five")) + f23("TRCK", txt("5")) + pad) + audio,
        "b v22.mp3": tag(2, f22("TT2", txt("Episode Three")) + f22("TRK", txt("3")) + pad) + audio,
        "c unsync.mp3": tag(3, unsync(f23("APIC", b"\x00image/png\x00\x03\x00" + b"\xff\xe0\xff\xfb" * 500) + f23("TIT2", txt("Episode One")) + f23("TRCK", txt("1/176")) + pad), 0x80) + audio,
        "d v1 only.mp3": audio + v1("Episode Four", 4),
        "e v24.mp3": tag(4, f24("TIT2", b"\x03Episode Two") + f24("TRCK", ss(4) + b"\x03002", 0x01) + pad) + audio,
        "f stale.mp3": tag(3, f23("TIT2", txt("Episode Six")) + f23("TRCK", txt("6")) + pad) + audio,
    }
    return {"/Podcasts/Show C/" + k: (v, "2026-10-1%dT10:00:00Z" % i) for i, (k, v) in enumerate(files.items())}
FILES.update(tagkinds())
def videos():
    """2.45 HOLODECK: a channel folder of short WebM videos (the test browser has no H.264), one AVI the iPad can't play, a text file. Made with ffmpeg (skipped without it)."""
    import subprocess, tempfile, os, shutil
    if not shutil.which("ffmpeg"): return {}
    d = tempfile.mkdtemp(); q = ["-loglevel", "error", "-y"]; out = {}
    for name, secs, src in [("01 - Neon Harbor - Midnight Signal.webm", 6, "testsrc=s=160x120:r=15"), ("02 - The Velvet Static - Satellite Heart.webm", 5, "smptebars=s=160x120:r=15"), ("03 - Juniper Drive - Polaroid Weekend.webm", 7, "rgbtestsrc=s=160x120:r=15")]:
        f = os.path.join(d, "v.webm")
        subprocess.run(["ffmpeg", *q, "-f", "lavfi", "-t", str(secs), "-i", src, "-f", "lavfi", "-t", str(secs), "-i", "sine=frequency=440:sample_rate=48000", "-c:v", "libvpx-vp9", "-b:v", "60k", "-deadline", "realtime", "-c:a", "libopus", "-b:a", "24k", "-shortest", f], check=True)
        out["/Video/Test Channel/" + name] = (open(f, "rb").read(), "2026-10-01T10:00:00Z")
    out["/Video/Test Channel/04 - Old Rip - Not For iPad.avi"] = (b"RIFF\x00\x00\x00\x00AVI LIST", "2026-10-01T10:00:00Z")
    out["/Video/Test Channel/notes.txt"] = (b"channel notes", "2026-10-01T10:00:00Z")
    out["/Video/Other Channel/a - b.webm"] = out["/Video/Test Channel/02 - The Velvet Static - Satellite Heart.webm"]
    # 2.46: a series, one folder per season (named as video sites name them), a specials folder, an extra without a number, one MKV
    v1, v2, v3 = (out["/Video/Test Channel/" + n] for n in ("01 - Neon Harbor - Midnight Signal.webm", "02 - The Velvet Static - Satellite Heart.webm", "03 - Juniper Drive - Polaroid Weekend.webm"))
    ser = "/Video/Test Series/Test Series \u2014 Season "
    out[ser + "1/Test Series - Season 1 Episode 10 - Full Episode [aB3dE5fG7hI].webm"] = v2
    out[ser + "1/Test Series - Season 1 Episode 2 - Full Episode [Zz9Yy8Xx7Ww].webm"] = v1
    out[ser + "1/Test Series - Season 1, Episode 1 - Updated Full Episode [Qq1Ww2Ee3Rr].webm"] = v2
    out[ser + "1/Behind the Scenes.webm"] = v1
    out[ser + "2/Test Series - Season 2 Episode 1 - Full Episode [Kk4Jj3Hh2Gg].webm"] = v3
    out[ser + "2/Test Series - Season 2 Episode 2 - Not For iPad.mkv"] = (b"\x1aE\xdf\xa3", "2026-10-01T10:00:00Z")
    out[ser + "10/Test Series - Season 10 Episode 1 - The Last Case [Mm5Nn6Bb7Vv].webm"] = v2
    out["/Video/Test Series/Specials/Christmas Special.webm"] = v1
    # 2.48: a NETWORK folder: show folders, flat or with seasons, and a downloader's leftovers (.part, a video-only .f247) to ignore
    nw = "/Video/Test Network/"
    out[nw + "angry_test/Episode 1 - Full Episode [Aa1Bb2Cc3Dd].webm"] = v2
    out[nw + "angry_test/Episode 2 - The Dam [Ee4Ff5Gg6Hh].webm"] = v1
    out[nw + "angry_test/Episode 3 - Full Episode [Ii7Jj8Kk9Ll].webm"] = v2
    out[nw + "angry_test/Episode 4 - Unfinished [Mm1Nn2Oo3Pp].f247.webm.part"] = (b"partial", "2026-10-01T10:00:00Z")
    out[nw + "show_two/Season 1/Show Two - S01E01 - Pilot [Qq4Rr5Ss6Tt].webm"] = v3
    out[nw + "show_two/Season 1/Show Two - S01E02 - The Fair [Uu7Vv8Ww9Xx].webm"] = v2
    out[nw + "show_two/Season 2/Show Two - S02E01 - Return [Yy1Zz2Aa3Bb].webm"] = v1
    out[nw + "third_show/A Night Out [Cc4Dd5Ee6Ff].webm"] = v2
    out[nw + "third_show/The Big Game [Gg7Hh8Ii9Jj].webm"] = v1
    out[nw + "third_show/The Big Game [Gg7Hh8Ii9Jj].f247"] = (b"video only", "2026-10-01T10:00:00Z")
    # 2.51.4: what a stopped yt-dlp run leaves behind: a video-only stream and a merge in progress, both named .mp4
    out[nw + "third_show/004 - A Late Show [Kk1Ll2Mm3Nn].f136.mp4"] = (b"video only stream", "2026-10-01T10:00:00Z")
    out["/Video/Test Channel/05 - Unjoined [Oo4Pp5Qq6Rr].f136.mp4"] = (b"video only stream", "2026-10-01T10:00:00Z")
    out["/Video/Test Channel/05 - Unjoined [Oo4Pp5Qq6Rr].temp.mp4"] = (b"half merged", "2026-10-01T10:00:00Z")
    # 2.51.1: videos with a playable name that no browser can decode; the folder shows only after /__mkdir?d=/Video/Broken Rips
    out["/Video/Broken Rips/Episode 1.webm"] = (b"\x00not a video at all" * 64, "2026-10-01T10:00:00Z")
    out["/Video/Broken Rips/Episode 2.webm"] = (b"\x01still not a video" * 64, "2026-10-01T10:00:00Z")
    return out
FILES.update(videos())

DIRS = {"/", "/cdrom", "/Podcasts", "/Podcasts/Show A", "/Podcasts/Show B", "/Music", "/Music/Album", "/Music/Album2", "/Podcasts/.hidden", "/Music/Lengths", "/Podcasts/Show C", "/Video", "/Video/Test Channel", "/Video/Other Channel", "/Video/Test Series", "/Video/Test Series/Specials", "/Video/Test Network", "/Video/Test Network/angry_test", "/Video/Test Network/show_two", "/Video/Test Network/show_two/Season 1", "/Video/Test Network/show_two/Season 2", "/Video/Test Network/third_show"} | {"/Video/Test Series/Test Series \u2014 Season %d" % n for n in (1, 2, 10)}
DIRS0 = set(DIRS); FAIL = {}   # /__reset restores the folders; /__fail makes files fail on purpose
STATS = {"lists": 0, "denied": 0, "media": 0, "ha_denied": 0, "toggles": 0, "calls": [], "sent": {}}   # sent: bytes served per file
HA_TOKEN = "ha-test-token"
HA = {
    "switch.pond_lights_outlet": {"state": "off", "attributes": {"friendly_name": "Pond Lights Outlet"}},
    "light.barn_porch": {"state": "on", "attributes": {"friendly_name": "Barn Porch", "supported_color_modes": ["brightness"], "color_mode": "brightness", "brightness": 128}},
    "light.skylight_2": {"state": "on", "attributes": {"friendly_name": "Skylight 2", "supported_color_modes": ["color_temp", "hs"], "color_mode": "hs", "brightness": 178,
        "hs_color": [205.0, 62.0], "rgb_color": [97, 180, 255], "min_color_temp_kelvin": 2000, "max_color_temp_kelvin": 6500, "effect_list": ["None", "Candle"], "effect": "None"}},
    "sensor.pond_water_temp": {"state": "61.4", "attributes": {"friendly_name": "Pond Water Temp", "unit_of_measurement": "°F"}},
    "climate.main_floor": {"state": "heat", "attributes": {"friendly_name": "Main Floor", "hvac_modes": ["off", "heat", "cool", "heat_cool"], "current_temperature": 66, "temperature": 68,
        "hvac_action": "heating", "current_humidity": 41, "min_temp": 50, "max_temp": 90, "target_temp_step": 1}},
    "automation.nightly": {"state": "on", "attributes": {"friendly_name": "Nightly Routine"}},
}
def ha_state(eid):
    v = HA[eid]; return {"entity_id": eid, "state": v["state"], "attributes": v["attributes"], "last_changed": "2026-10-15T12:00:00+00:00"}

def children(d):
    d = d.rstrip("/") or "/"
    out = {}
    for path in list(DIRS) + list(FILES):
        if path == d: continue
        parent = path.rsplit("/", 1)[0] or "/"
        if parent == d:
            name = path.rsplit("/", 1)[1]
            if path in DIRS: out[name] = {"name": name + "/", "size": 4096, "url": "./" + name + "/", "mod_time": "2026-08-01T00:00:00Z", "mode": 2147484141, "is_dir": True, "is_symlink": False}
            else: out[name] = {"name": name, "size": len(FILES[path][0]), "url": "./" + name, "mod_time": FILES[path][1], "mode": 420, "is_dir": False, "is_symlink": False}
    return [out[k] for k in sorted(out)]

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Authorization, Range, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        self.send_header("Vary", "Origin")
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def send_json(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code); self.cors(); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def ha(self, method, path, q):
        """Like the relay's handle_path /ha/*: relay token by ?k= first, then Home Assistant's own Bearer check."""
        if q.get("k", [""])[0] != TOKEN:
            STATS["denied"] += 1; return self.send_json(401, {})
        if self.headers.get("Authorization") != "Bearer " + HA_TOKEN:
            STATS["ha_denied"] += 1; return self.send_json(401, {"message": "Unauthorized"})
        api = path[3:]
        if method == "GET" and api == "/api/": return self.send_json(200, {"message": "API running."})
        if method == "GET" and api == "/api/config": return self.send_json(200, {"unit_system": {"temperature": "°F"}, "location_name": "Home"})
        if method == "GET" and api == "/api/states": return self.send_json(200, [ha_state(e) for e in HA])
        if method == "GET" and api.startswith("/api/states/"):
            eid = api[len("/api/states/"):]
            return self.send_json(200, ha_state(eid)) if eid in HA else self.send_json(404, {"message": "Entity not found."})
        m = re.match(r"^/api/services/([a-z_]+)/toggle$", api)
        if method == "POST" and m:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            eid = body.get("entity_id")
            if eid not in HA or eid.split(".")[0] != m.group(1): return self.send_json(400, {"message": "bad entity"})
            HA[eid]["state"] = "off" if HA[eid]["state"] == "on" else "on"; STATS["toggles"] += 1
            return self.send_json(200, [ha_state(eid)])
        m = re.match(r"^/api/services/climate/(set_temperature|set_hvac_mode)$", api)
        if method == "POST" and m:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            eid = body.get("entity_id")
            if eid not in HA or not eid.startswith("climate."): return self.send_json(400, {"message": "bad entity"})
            STATS["calls"].append({"svc": "climate." + m.group(1), **body})
            if m.group(1) == "set_temperature": HA[eid]["attributes"]["temperature"] = body["temperature"]
            else: HA[eid]["state"] = body["hvac_mode"]
            return self.send_json(200, [ha_state(eid)])
        m = re.match(r"^/api/services/([a-z_]+)/(turn_on|turn_off)$", api)
        if method == "POST" and m:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            eid = body.get("entity_id")
            if eid not in HA or eid.split(".")[0] != m.group(1): return self.send_json(400, {"message": "bad entity"})
            STATS["calls"].append({"svc": m.group(1) + "." + m.group(2), **body})
            v = HA[eid]; a = v["attributes"]
            if m.group(2) == "turn_off": v["state"] = "off"
            else:
                v["state"] = "on"
                if "brightness_pct" in body: a["brightness"] = round(body["brightness_pct"] * 2.55)
                if "hs_color" in body:
                    import colorsys
                    a.update({"hs_color": body["hs_color"], "color_mode": "hs", "color_temp_kelvin": None,
                              "rgb_color": [round(x * 255) for x in colorsys.hsv_to_rgb(body["hs_color"][0] / 360, body["hs_color"][1] / 100, 1)]})
                if "color_temp_kelvin" in body: a.update({"color_temp_kelvin": body["color_temp_kelvin"], "color_mode": "color_temp", "rgb_color": [255, 200, 150]})
                if "effect" in body: a["effect"] = body["effect"]
            return self.send_json(200, [ha_state(eid)])
        return self.send_json(404, {"message": "not found"})
    def do_POST(self):
        u = urlparse(self.path); path = unquote(u.path); q = parse_qs(u.query)
        if path.startswith("/ha/"): return self.ha("POST", path, q)
        self.send_response(405); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()
    def do_GET(self):
        u = urlparse(self.path); path = unquote(u.path); q = parse_qs(u.query)
        if path.startswith("/ha/"): return self.ha("GET", path, q)
        if path == "/__hareset":   # tests start from a known Home Assistant
            HA["switch.pond_lights_outlet"]["state"] = "off"; HA["light.barn_porch"]["state"] = "on"; HA["light.barn_porch"]["attributes"]["brightness"] = 128
            sk = HA["light.skylight_2"]; sk["state"] = "on"; sk["attributes"].update({"color_mode": "hs", "brightness": 178, "hs_color": [205.0, 62.0], "rgb_color": [97, 180, 255], "color_temp_kelvin": None, "effect": "None"})
            HA["climate.main_floor"]["state"] = "heat"; HA["climate.main_floor"]["attributes"]["temperature"] = 68
            STATS["calls"] = []; return self.send_json(200, {})
        if path == "/__reset":   # tests: back to the folders the relay started with, nothing failing
            DIRS.clear(); DIRS.update(DIRS0); FAIL.clear(); return self.send_json(200, {})
        if path == "/__fail":   # tests: the next n requests under a path answer with an error code (n=0 turns it off)
            FAIL.update({"prefix": q.get("prefix", ["/"])[0], "code": int(q.get("code", ["404"])[0]), "n": int(q.get("n", ["1"])[0])}); return self.send_json(200, {})
        if path == "/__mkdir":   # tests: a folder appears on the NAS mid-session, as a relay redeploy would
            DIRS.add(q.get("d", [""])[0]); return self.send_json(200, {})
        if path == "/__stats":
            body = json.dumps(STATS).encode(); self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body); return
        ok = self.headers.get("Authorization") == "Bearer " + TOKEN or q.get("k", [""])[0] == TOKEN
        if not ok:
            STATS["denied"] += 1; self.send_response(401); self.cors(); self.send_header("Content-Length", "0"); self.end_headers(); return
        d = path.rstrip("/") or "/"
        if d in DIRS:
            STATS["lists"] += 1
            body = json.dumps(children(d)).encode()
            self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if path in FILES and FAIL.get("n", 0) > 0 and path.startswith(FAIL["prefix"]):
            FAIL["n"] -= 1; self.send_response(FAIL["code"]); self.cors(); self.send_header("Content-Length", "0"); self.end_headers(); return
        if path in FILES:
            STATS["media"] += 1
            data = FILES[path][0]; ctype = {"wav": "audio/wav", "mp3": "audio/mpeg", "png": "image/png", "webm": "video/webm"}.get(path.rsplit(".", 1)[-1], "text/plain")
            rng = self.headers.get("Range"); m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
            if m:
                a = int(m.group(1) or 0); b = int(m.group(2)) if m.group(2) else len(data) - 1; b = min(b, len(data) - 1)
                chunk = data[a:b + 1]
                self.send_response(206); self.cors(); self.send_header("Content-Range", "bytes %d-%d/%d" % (a, b, len(data)))
            else:
                chunk = data; self.send_response(200); self.cors()
            STATS["sent"][path] = STATS["sent"].get(path, 0) + len(chunk)
            self.send_header("Accept-Ranges", "bytes"); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(chunk))); self.end_headers(); self.wfile.write(chunk); return
        self.send_response(404); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

import sys
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8110), H).serve_forever()   # run.sh starts one per lane (8110, 8111, 8112)
