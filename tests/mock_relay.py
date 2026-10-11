"""Simulated Storage relay (Caddy behind Tailscale on the NAS) on :8110.
Read-only, token by Bearer header or ?k=, CORS for the test origin, JSON folder listings
(Accept: application/json, like Caddy's file_server browse), byte ranges for audio.
Files are generated silence; names are invented."""
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
DIRS = {"/", "/cdrom", "/Podcasts", "/Podcasts/Show A", "/Music", "/Music/Album", "/Podcasts/.hidden"}
STATS = {"lists": 0, "denied": 0, "media": 0}

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
        self.send_header("Access-Control-Allow-Headers", "Authorization, Range")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        self.send_header("Vary", "Origin")
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        u = urlparse(self.path); path = unquote(u.path); q = parse_qs(u.query)
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
            data = FILES[path][0]; ctype = "audio/wav" if path.endswith(".wav") else "text/plain"
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
