"""Simulated Storage relay (Caddy behind Tailscale on the NAS) on :8110.
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

DIRS = {"/", "/cdrom", "/Podcasts", "/Podcasts/Show A", "/Podcasts/Show B", "/Music", "/Music/Album", "/Music/Album2", "/Podcasts/.hidden"}
STATS = {"lists": 0, "denied": 0, "media": 0, "ha_denied": 0, "toggles": 0, "calls": []}
HA_TOKEN = "ha-test-token"
HA = {
    "switch.pond_lights_outlet": {"state": "off", "attributes": {"friendly_name": "Pond Lights Outlet"}},
    "light.barn_porch": {"state": "on", "attributes": {"friendly_name": "Barn Porch", "supported_color_modes": ["brightness"], "color_mode": "brightness", "brightness": 128}},
    "light.skylight_2": {"state": "on", "attributes": {"friendly_name": "Skylight 2", "supported_color_modes": ["color_temp", "hs"], "color_mode": "hs", "brightness": 178,
        "hs_color": [205.0, 62.0], "rgb_color": [97, 180, 255], "min_color_temp_kelvin": 2000, "max_color_temp_kelvin": 6500, "effect_list": ["None", "Candle"], "effect": "None"}},
    "sensor.pond_water_temp": {"state": "61.4", "attributes": {"friendly_name": "Pond Water Temp", "unit_of_measurement": "°F"}},
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
            STATS["calls"] = []; return self.send_json(200, {})
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
        if path in FILES:
            STATS["media"] += 1
            data = FILES[path][0]; ctype = {"wav": "audio/wav", "mp3": "audio/mpeg", "png": "image/png"}.get(path.rsplit(".", 1)[-1], "text/plain")
            rng = self.headers.get("Range"); m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
            if m:
                a = int(m.group(1) or 0); b = int(m.group(2)) if m.group(2) else len(data) - 1; b = min(b, len(data) - 1)
                chunk = data[a:b + 1]
                self.send_response(206); self.cors(); self.send_header("Content-Range", "bytes %d-%d/%d" % (a, b, len(data)))
            else:
                chunk = data; self.send_response(200); self.cors()
            self.send_header("Accept-Ranges", "bytes"); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(chunk))); self.end_headers(); self.wfile.write(chunk); return
        self.send_response(404); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()

ThreadingHTTPServer(("127.0.0.1", 8110), H).serve_forever()
