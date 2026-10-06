import json, datetime as dt
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
TZ = ZoneInfo("America/Chicago"); KEY = "k" * 64
def ev(area, d, sh, sm, eh, em, title, busy=False, loc=""):
    s = dt.datetime(d.year, d.month, d.day, sh, sm, tzinfo=TZ); e = dt.datetime(d.year, d.month, d.day, eh, em, tzinfo=TZ)
    return {"id": f"{area}:{title}:{s.timestamp()}", "area": area, "title": title or "Busy", "busy": busy, "allDay": False, "location": loc,
            "start": s.astimezone(dt.timezone.utc).isoformat().replace("+00:00","Z"), "end": e.astimezone(dt.timezone.utc).isoformat().replace("+00:00","Z")}
def events(f, t):
    out = []; d = dt.datetime.fromtimestamp(f/1000, TZ).date(); end = dt.datetime.fromtimestamp(t/1000, TZ).date()
    while d < end:
        wd = d.weekday()
        if wd < 5:
            out.append(ev("work", d, 8, 30, 9, 0, "Standup"))
            if wd in (0, 2): out.append(ev("work", d, 10, 0, 11, 0, "Roadmap review", loc="Zoom"))
            if wd == 1: out += [ev("work", d, 13, 0, 14, 30, "Sprint planning"), ev("work", d, 14, 0, 15, 0, "", busy=True)]
            if wd == 3: out.append(ev("work", d, 15, 0, 16, 0, "Vendor call"))
        if wd == 1: out.append(ev("personal", d, 13, 30, 14, 0, "Pharmacy pickup"))
        if wd == 1: out.append(ev("personal", d, 18, 0, 19, 30, "Dinner with Sam", loc="Luna Cafe"))
        if wd == 5: out.append(ev("personal", d, 7, 0, 13, 0, "Saturday market"))
        if wd == 6: out.append(ev("personal", d, 15, 0, 16, 0, "Call Mom"))
        if d.day == 8: out.append({"id": f"personal:allday:{d}", "area": "personal", "title": "Garlic planting window", "busy": False, "allDay": True, "location": "", "start": str(d), "end": str(d + dt.timedelta(days=2))})
        if d.day == 16: out.append({"id": f"work:allday:{d}", "area": "work", "title": "Q4 planning offsite", "busy": False, "allDay": True, "location": "", "start": str(d), "end": str(d + dt.timedelta(days=1))})
        d += dt.timedelta(days=1)
    return out
CREATED = []
SEEN = {}
POSTS = []
CALS = [{"area": "work", "ok": True, "name": "Timothy (Work)"}, {"area": "personal", "ok": True, "name": "timothy@gmail.com"}]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if q.get("key") != KEY: body = {"ok": False, "error": "unauthorized"}
        elif q.get("action") == "ping": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create"], "calendars": CALS}
        elif q.get("action") == "events": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create"], "calendars": CALS, "events": events(int(q["from"]), int(q["to"])) + CREATED}
        elif q.get("action") == "stats": body = {"ok": True, "posts": len(POSTS), "created": [e["title"] for e in CREATED]}
        else: body = {"ok": False, "error": "unknown_action"}
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); raw = self.rfile.read(n).decode()
        POSTS.append(self.headers.get("Content-Type"))
        try: b = json.loads(raw)
        except Exception: b = None
        if b is None: body = {"ok": False, "error": "bad_request"}
        elif b.get("key") != KEY: body = {"ok": False, "error": "unauthorized"}
        else:
            it = b.get("item", {})
            if it.get("area") != "personal": body = {"ok": False, "error": "not_writable"}
            elif it.get("title") == "FAILME": body = {"ok": False, "error": "bad_title"}
            elif it.get("cid") in SEEN: body = dict(SEEN[it["cid"]], duplicate=True)
            else:
                ev = {"id": "personal:new:" + it["cid"], "area": "personal", "title": it["title"], "busy": False, "allDay": bool(it.get("allDay")), "location": "", "start": it["start"], "end": it["end"]}
                CREATED.append(ev); body = {"ok": True, "version": "1.1.0", "event": ev}; SEEN[it["cid"]] = body
        out = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(out)
HTTPServer(("127.0.0.1", 8092), H).serve_forever()
