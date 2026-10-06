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
import uuid
def T(title, status, pri, area, due=None, focus=None):
    return {"id": uuid.uuid4().hex, "url": "", "title": title, "status": status, "priority": pri, "area": area, "due": due, "focus": focus}
TASKS = [
  T("Order spring bulbs", "⬜ To Do", "🔴 High", "🌿 SkyGarden Farm", "2026-10-04", "2026-10-05"),
  T("Send Q4 deck draft", "🔄 In Progress", "🟡 Medium", "🎯 Work & Calling", "2026-10-08"),
  T("Sugar syrup for Hive 2", "⬜ To Do", "🔴 High", "🐝 Beekeeping", "2026-10-06"),
  T("Book furnace service", "⬜ To Do", "🟢 Low", "🏡 Home & Property", "2026-10-02"),
  T("Renew passport", "🚫 Blocked", "🟡 Medium", "🏡 Home & Property"),
  T("Read chapter 4", "⬜ To Do", "🟢 Low", "🌱 Personal Growth"),
  T("Renew registration", "✅ Done", "🟢 Low", "🏡 Home & Property", "2026-10-01", "2026-10-06"),
  T("Plan Saturday market display", "⬜ To Do", None, "🌿 SkyGarden Farm", "2026-10-20"),
]
AREAS = ["💰 Money", "👨‍👩‍👧‍👦 Family", "🌱 Personal Growth", "🌿 SkyGarden Farm", "🐝 Beekeeping", "🙏 Faith & Spirit", "🏥 Health", "🎯 Work & Calling", "🏡 Home & Property"]
PRIS = ["🔴 High", "🟡 Medium", "🟢 Low"]
TCIDS = {}
def KDt(title, start, end=None, area=None, typ=None, yearly=False, notes=""):
    return {"id": uuid.uuid4().hex, "url": "https://www.notion.so/" + uuid.uuid4().hex, "title": title, "start": start, "end": end, "area": area, "type": typ, "yearly": yearly, "notes": notes}
KDATES = [
  KDt("First frost risk", "2026-10-12", None, "🌿 SkyGarden Farm", "⏰ Deadline", False, "Cover the dahlias the night before"),
  KDt("Mom's birthday", "1958-10-20", None, "👨‍👩‍👧‍👦 Family", "🎂 Birthday", True),
  KDt("Garlic planting window", "2026-10-01", "2026-10-25", "🌿 SkyGarden Farm", "🌦️ Window"),
  KDt("Q4 roadmap due", "2026-10-30", None, "🎯 Work & Calling", "⏰ Deadline"),
  KDt("Mite treatment", "2026-11-15", None, "🐝 Beekeeping", "🔔 Reminder"),
  KDt("Old past thing", "2026-09-01", None, "🏡 Home & Property", "📍 Event"),
]
KTYPES = ["⏰ Deadline", "🌦️ Window", "🎂 Birthday", "💍 Anniversary", "📍 Event", "🔔 Reminder"]
DCIDS = {}
SEEN = {}
POSTS = []
CALS = [{"area": "work", "ok": True, "name": "Timothy (Work)"}, {"area": "personal", "ok": True, "name": "personal@example.com"}]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if q.get("key") != KEY: body = {"ok": False, "error": "unauthorized"}
        elif q.get("action") == "ping": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create", "tasks", "dates"], "calendars": CALS}
        elif q.get("action") == "events": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create", "tasks", "dates"], "calendars": CALS, "events": events(int(q["from"]), int(q["to"])) + CREATED}
        elif q.get("action") == "tasks":
            d = q.get("day")
            body = {"ok": True, "version": "1.2.0", "day": d, "focus": [t for t in TASKS if t["focus"] == d], "open": sorted([t for t in TASKS if t["status"] != "✅ Done"], key=lambda t: t["due"] or "9999"), "areas": AREAS, "priorities": PRIS}
        elif q.get("action") == "dates":
            body = {"ok": True, "version": "1.3.0", "dates": KDATES, "areas": AREAS, "types": KTYPES}
        elif q.get("action") == "stats": body = {"ok": True, "posts": len(POSTS), "created": [e["title"] for e in CREATED], "tasks": [[t["title"], t["status"], t["focus"]] for t in TASKS], "dates": [[d["title"], d["start"], d["end"], d["area"], d["type"], d["yearly"]] for d in KDATES]}
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
            act = b.get("action")
            tk = next((t for t in TASKS if t["id"] == b.get("id")), None)
            if act == "focus":
                if not tk: body = {"ok": False, "error": "not_writable"}
                else: tk["focus"] = b.get("day"); body = {"ok": True, "task": tk}
            elif act == "status":
                if not tk: body = {"ok": False, "error": "not_writable"}
                elif b.get("status") not in ["⬜ To Do", "🔄 In Progress", "✅ Done", "🚫 Blocked"]: body = {"ok": False, "error": "bad_request"}
                else: tk["status"] = b["status"]; body = {"ok": True, "task": tk}
            elif act == "adddate":
                d = b.get("date", {})
                if d.get("cid") in DCIDS: body = dict(DCIDS[d["cid"]], duplicate=True)
                elif d.get("end") and d["end"] < d["start"]: body = {"ok": False, "error": "bad_time"}
                else:
                    nd = KDt(d["title"], d["start"], d.get("end"), d.get("area"), d.get("type"), bool(d.get("yearly"))); KDATES.append(nd)
                    body = {"ok": True, "date": nd}; DCIDS[d["cid"]] = body
            elif act == "addtask":
                t = b.get("task", {})
                if t.get("cid") in TCIDS: body = dict(TCIDS[t["cid"]], duplicate=True)
                else:
                    nt = T(t["title"], "⬜ To Do", t.get("priority"), t.get("area"), None, t.get("day")); TASKS.append(nt)
                    body = {"ok": True, "task": nt}; TCIDS[t["cid"]] = body
            elif it.get("area") != "personal": body = {"ok": False, "error": "not_writable"}
            elif it.get("title") == "FAILME": body = {"ok": False, "error": "bad_title"}
            elif it.get("cid") in SEEN: body = dict(SEEN[it["cid"]], duplicate=True)
            else:
                ev = {"id": "personal:new:" + it["cid"], "area": "personal", "title": it["title"], "busy": False, "allDay": bool(it.get("allDay")), "location": "", "start": it["start"], "end": it["end"]}
                CREATED.append(ev); body = {"ok": True, "version": "1.1.0", "event": ev}; SEEN[it["cid"]] = body
        out = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(out)
HTTPServer(("127.0.0.1", 8094), H).serve_forever()
