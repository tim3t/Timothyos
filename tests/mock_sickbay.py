# Simulated bridge 1.43 for SICKBAY (app 2.74): health days for the last 40 days (invented values, relative to today,
# America/Chicago), resting heart rate up the last two mornings (Condition: Take it easy), sleep stages per night,
# medicines/readings/notes saved and removed, a dentist visit in 5 days on the Personal calendar, and HEALTH_KEY's
# healthput. GET ?action=skmode&stale=1 makes the last send three days old; ?action=skstats returns what was saved.
# Port 8106. Only what SICKBAY needs: other reads answer unknown_action, as an older bridge would.
import json, re, os, datetime as dt
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
TZ = ZoneInfo("America/Chicago"); KEY = "k" * 64; HKEY = "h" * 64
BV = re.search(r"var VERSION = '([\d.]+)'", open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps-script", "Code.gs")).read()).group(1)
CAPS = ["read", "create", "holidays", "sickbay", "healthkey"]
CALS = [{"area": "work", "ok": True, "name": "Work"}, {"area": "personal", "ok": True, "name": "Personal"}]
ITEMS = []; SAVES = []; MODE = {"stale": 0}
def days():
    out = []; today = dt.datetime.now(TZ).date()
    for i in range(40, -1, -1):
        d = today - dt.timedelta(days=i); k = i % 7
        rhr = 58 + (k % 3) - 1
        if i <= 1: rhr = 66 + (1 - i)   # the last two mornings: well above the normal
        sl = 400 + (k * 9) % 60
        segs = [["c", 0, 80], ["d", 80, 55], ["r", 135, 40], ["a", 175, 8], ["c", 183, sl - 183 + 8 - 40], ["r", sl - 32 + 8, 40]]
        out.append({"date": d.isoformat(), "rhr": rhr, "hrv": 44 + (k * 3) % 10, "resp": 14.4, "steps": 6000 + k * 500, "active": 380 + k * 20, "exercise": 18 + k, "stand": 10, "vo2": 38.2, "temp": 36.1 + (0.1 if i == 0 else 0),
                    "sleep": {"asleep": sl, "deep": 55, "rem": 80, "core": sl - 135, "awake": 8, "bed": "23:%02d" % (5 + k * 7 % 50), "wake": "06:30", "len": sl + 8, "segs": segs}})
    return out
def events(f, t):
    d = dt.datetime.now(TZ).date() + dt.timedelta(days=5); s = dt.datetime(d.year, d.month, d.day, 9, 0, tzinfo=TZ); e = s + dt.timedelta(hours=1)
    ev = {"id": "personal:dentist", "area": "personal", "title": "Dentist cleaning", "busy": False, "allDay": False, "location": "",
          "start": s.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"), "end": e.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")}
    return [ev] if f <= s.timestamp() * 1000 < t else []
def read(q):
    a = q.get("action")
    if a == "ping": return {"ok": True, "version": BV, "capabilities": CAPS, "calendars": CALS}
    if a == "events": return {"ok": True, "version": BV, "capabilities": CAPS, "calendars": CALS, "events": events(int(q["from"]), int(q["to"]))}
    if a == "holidays": return {"ok": True, "version": BV, "holidays": []}
    if a == "health":
        last = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=72 if MODE["stale"] else 3)
        return {"ok": True, "version": BV, "from": q.get("from"), "last": last.isoformat().replace("+00:00", "Z"), "url": "https://www.notion.so/x", "days": days(), "items": ITEMS}
    return {"ok": False, "error": "unknown_action"}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, body):
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if q.get("action") == "skmode": MODE["stale"] = int(q.get("stale", "0")); return self.reply({"ok": True})
        if q.get("action") == "skstats": return self.reply({"ok": True, "saves": SAVES, "items": ITEMS})
        if q.get("action") == "skreset": ITEMS.clear(); SAVES.clear(); MODE["stale"] = 0; return self.reply({"ok": True})
        return self.reply({"ok": False, "error": "use_post"})
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try: b = json.loads(self.rfile.read(n).decode() or "null")
        except Exception: b = None
        if not isinstance(b, dict): return self.reply({"ok": False, "error": "bad_request"})
        a = b.get("action")
        if a == "healthput": return self.reply({"ok": True, "days": []} if b.get("key") == HKEY else {"ok": False, "error": "unauthorized"})
        if b.get("key") != KEY: return self.reply({"ok": False, "error": "unauthorized"})
        if a == "batch":
            calls = b.get("calls"); calls = json.loads(calls) if isinstance(calls, str) else calls
            return self.reply({"ok": True, "version": BV, "results": [read({k: (v if isinstance(v, str) else json.dumps(v)) for k, v in c.items()}) for c in calls]})
        if a == "sickbaysave":
            it = b.get("item") or {}; SAVES.append(it)
            if it.get("kind") not in ("medicine", "reading", "note") or not it.get("name"): return self.reply({"ok": False, "error": "bad_request"})
            ITEMS[:] = [x for x in ITEMS if x["id"] != it["id"]] + [{"id": it["id"], "kind": it["kind"], "name": it["name"], "date": it.get("date"), "data": it.get("data") or {}}]
            return self.reply({"ok": True, "version": BV, "item": ITEMS[-1]})
        if a == "sickbayremove":
            ITEMS[:] = [x for x in ITEMS if x["id"] != b.get("id")]; SAVES.append({"removed": b.get("id")})
            return self.reply({"ok": True, "version": BV, "removed": b.get("id")})
        return self.reply(read({k: (v if isinstance(v, str) else json.dumps(v)) for k, v in b.items()}))
HTTPServer(("127.0.0.1", 8106), H).serve_forever()
