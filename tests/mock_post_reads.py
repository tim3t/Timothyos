# Bridge 1.38 for every simulated bridge: reads arrive as a POST with a JSON body ({key, action, ...}, values as text),
# answered exactly as the same read by GET. Test controls (setversion, briefmode, ...) stay GET. Two switches, set by
# GET ?action=readmode: post=0 answers a read by POST with unknown_action (a bridge before 1.38), get=0 answers a read
# by GET with use_post (as 1.38 does); counts of each kind of read are returned.
import io, json
from urllib.parse import urlencode, urlparse, parse_qs

READS = {"ping", "batch", "aispend", "events", "tasks", "dates", "holidays", "done", "week", "reviews", "ledger", "habits", "library",
         "tarot", "tarotbooks", "tarotbook", "apiary", "inbox", "upkeep", "profile", "news", "sky", "sciencefeeds", "sciencelog", "year",
         "schema", "meals", "logunlock", "logdates", "logday", "logsearch", "logsessions"}
MODE = {"post": 1, "get": 1, "posts": 0, "gets": 0}

def wrap(H):
    orig_get, orig_post = H.do_GET, getattr(H, "do_POST", None)
    def reply(self, body):
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if q.get("action") == "readmode":
            for k in ("post", "get"):
                if k in q: MODE[k] = int(q[k])
            if "reset" in q: MODE.update(posts=0, gets=0)
            return reply(self, dict(MODE, ok=True))
        if q.get("action") in READS and not getattr(self, "_via_post", False):
            MODE["gets"] += 1
            if not MODE["get"]: return reply(self, {"ok": False, "error": "use_post"})
        return orig_get(self)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n)
        try: b = json.loads(raw.decode() or "null")
        except Exception: b = None
        if isinstance(b, dict) and b.get("action") in READS:
            MODE["posts"] += 1
            if not MODE["post"]: return reply(self, {"ok": False, "error": "unknown_action"})
            q = {k: (v if isinstance(v, str) else json.dumps(v)) for k, v in b.items()}
            self.path = urlparse(self.path).path + "?" + urlencode(q); self._via_post = True
            return do_GET(self)
        if orig_post is None: return reply(self, {"ok": False, "error": "unknown_action"})
        self.rfile = io.BytesIO(raw)
        return orig_post(self)
    H.do_GET, H.do_POST = do_GET, do_POST
    return H
