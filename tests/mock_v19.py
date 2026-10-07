# Simulated bridge 1.9: everything in 1.8, plus "ledger" (YNAB figures, sample data) and the Replicator Queue. Port 8100.
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
        if wd == 5:  # a 48-hour work block over the weekend that only exists to stop bookings
            s0 = dt.datetime(d.year, d.month, d.day, 0, 0, tzinfo=TZ); e0 = s0 + dt.timedelta(days=2)
            out.append({"id": f"work:away:{d}", "area": "work", "title": "Away block (auto-decline)", "busy": False, "allDay": False, "location": "",
                        "start": s0.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"), "end": e0.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")})
        if wd == 1: out.append(ev("farm", d, 16, 0, 17, 30, "Hive inspection"))
        if wd == 5: out.append(ev("farm", d, 14, 0, 16, 0, "Bed prep"))
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
RPOSTS = []; UNSHARED = []
def R(week, title, hw, hp, done, picked, kept, well, drained, focus, bearing, by):
    return {"id": "rev-" + week, "url": "https://www.notion.so/rev" + week.replace("-", ""), "saved": week + "T21:00:00Z", "week": week, "title": title,
            "wentWell": well, "drained": drained, "nextFocus": focus, "bearing": bearing, "intents": "", "byArea": by, "summary": "",
            "hoursWork": hw, "hoursPersonal": hp, "hoursFarm": None, "hoursHobbies": None, "tasksDone": done, "picked": picked, "pickedDone": kept}
# saved history (sample data): weeks 39, 38, 37 and 35 saved, 36 skipped; 40 (last week) is due, 41 in progress
REVIEWS = {
  "2026-09-21": R("2026-09-21", "Week 39 · 21 to 27 Sep", 36, 8, 7, 5, 4, "Shipped the deck two days early", "Evening calls", "Hive winter prep", "Kept mornings for deep work", "Work & Calling 4 · Beekeeping 2 · Home & Property 1"),
  "2026-09-14": R("2026-09-14", "Week 38 · 14 to 20 Sep", 41, 6, 5, 6, 3, "The launch held", "Back-to-back meetings", "Protect two evenings", "Said no to one extra call", "Work & Calling 3 · Health 2"),
  "2026-09-07": R("2026-09-07", "Week 37 · 07 to 13 Sep", 38, 10, 9, 5, 5, "Every pick done", "Late nights", "Launch prep", "Walked every morning", "Work & Calling 5 · Beekeeping 3 · Health 1"),
  "2026-08-24": R("2026-08-24", "Week 35 · 24 to 30 Aug", 33, 7, 4, 6, 2, "Honey harvest", "Evening calls again", "Fewer picks, finished", "", "Beekeeping 3 · Work & Calling 1"),
}
QUEUE = [
  {"id": "q1", "title": "New glasses", "cost": 280, "priority": 10, "note": "Prescription changed in August", "link": "", "bought": None, "created": "2026-10-01"},
  {"id": "q2", "title": "Honey extractor", "cost": 450, "priority": 20, "note": "", "link": "https://example.com/extractor", "bought": None, "created": "2026-10-02"},
  {"id": "q3", "title": "Rain barrels", "cost": None, "priority": 30, "note": "", "link": "", "bought": None, "created": "2026-10-03"},
  {"id": "q4", "title": "Hive tool", "cost": 25, "priority": 5, "note": "", "link": "", "bought": "2026-09-20", "created": "2026-09-01"}]
QCIDS = {}; QPOSTS = []
MONTHS = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]
def c(id, name, group, m, now): return {"id": id, "name": name, "group": group, "m": m, "now": now}
YNAB = {"month": "2026-10-01", "months": MONTHS,
  "checking": [{"id": "a1", "name": "Checking", "type": "checking", "balance": 4812.37, "original": None}],
  "savings": [{"id": "a2", "name": "Emergency Fund", "type": "savings", "balance": 8250.0, "original": None}, {"id": "a3", "name": "Savings", "type": "savings", "balance": 2140.55, "original": None}],
  "loans": [{"id": "a4", "name": "Truck Loan", "type": "autoLoan", "balance": -11420.18, "original": 18400.0}],
  "age": [{"month": m, "days": d} for m, d in zip(MONTHS + ["2026-10-01"], [41, 44, 47, 49, 52, 50, 55, 58, 57, 60, 61, 62, 62])],
  "cats": [c("g", "Groceries", "Everyday", [0, 0, 590, 600, 580, 610, 620, 600, 640, 570, 590, 604], 214),
           c("f", "Fuel", "Everyday", [0, 0, 240, 250, 230, 236, 240, 250, 220, 210, 230, 220], 74),
           c("e", "Electric", "Bills", [0, 0, 200, 210, 190, 170, 160, 180, 190, 170, 160, 175], 0),
           c("b", "Bee Supplies", "SkyGarden", [0, 0, 60, 80, 200, 220, 140, 90, 120, 80, 95, 110], 38),
           c("d", "Discretionary", "Fun", [0, 0, 40, 30, 20, 60, 50, 40, 30, 20, 25, 35], 0),
           c("h", "Household", "Everyday", [0, 0, 90, 95, 100, 88, 92, 97, 85, 90, 88, 86], 23),
           c("m", "Medical", "Health", [0, 0, 0, 120, 0, 60, 0, 75, 0, 60, 0, 60], 15),
           c("x", "Gifts", "Fun", [0, 0, 300, 20, 0, 0, 60, 0, 40, 0, 0, 52], 0),
           c("p", "Phone", "Bills", [0, 0, 145, 145, 145, 145, 145, 145, 145, 145, 145, 145], 145)],
  "fundName": "Discretionary", "fund": {"name": "Discretionary", "balance": 340.0}}
def qrows():
    w = sorted([q for q in QUEUE if not q["bought"]], key=lambda q: (q["priority"] if q["priority"] is not None else 1e9, q["created"]))
    b = sorted([q for q in QUEUE if q["bought"]], key=lambda q: q["bought"], reverse=True)[:10]
    return {"items": w, "bought": b}
RLISTS = []; ASKS = []; SPEND = {"month": "2026-10", "usd": 0.42, "calls": 20, "budget": 8}
WEEKDONE = {"2026-10-05": [
  {"id": "w1", "title": "Send Q4 deck draft", "area": "🎯 Work & Calling", "status": "✅ Done", "at": "2026-10-07T18:00:00Z"},
  {"id": "w2", "title": "Inspect Hive 1", "area": "🐝 Beekeeping", "status": "✅ Done", "at": "2026-10-09T18:00:00Z"},
  {"id": "w3", "title": "Renew registration", "area": "🏡 Home & Property", "status": "✅ Done", "at": "2026-10-06T15:00:00Z"}]}
# finished tasks (area + last edit only, like the real bridge): Farm has been quiet for 12 days, Growth for 40
DONE = [
  {"area": "🎯 Work & Calling", "at": "2026-10-05T20:00:00Z"}, {"area": "🎯 Work & Calling", "at": "2026-10-02T15:00:00Z"},
  {"area": "🎯 Work & Calling", "at": "2026-09-29T15:00:00Z"}, {"area": "🏡 Home & Property", "at": "2026-10-04T15:00:00Z"},
  {"area": "🏥 Health", "at": "2026-10-01T15:00:00Z"}, {"area": "🌿 SkyGarden Farm", "at": "2026-09-24T15:00:00Z"},
]
SEEN = {}
POSTS = []
CALS = [{"area": "work", "ok": True, "name": "Timothy (Work)"}, {"area": "personal", "ok": True, "name": "personal@example.com"}, {"area": "farm", "ok": True, "name": "Hilltop"}]
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if q.get("key") != KEY: body = {"ok": False, "error": "unauthorized"}
        elif q.get("action") == "ping": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create", "tasks", "dates", "done", "reviews", "reviewlog", "queue", "ask", "ledger"], "calendars": CALS}
        elif q.get("action") == "events": body = {"ok": True, "version": "1.1.0", "capabilities": ["read", "create", "tasks", "dates", "done", "reviews", "reviewlog", "queue", "ask", "ledger"], "calendars": CALS, "events": events(int(q["from"]), int(q["to"])) + CREATED}
        elif q.get("action") == "tasks":
            d = q.get("day")
            body = {"ok": True, "version": "1.2.0", "day": d, "focus": [t for t in TASKS if t["focus"] == d], "open": sorted([t for t in TASKS if t["status"] != "✅ Done"], key=lambda t: t["due"] or "9999"), "areas": AREAS, "priorities": PRIS}
        elif q.get("action") == "week":
            wk = q.get("week", ""); nxt = (dt.date.fromisoformat(wk) + dt.timedelta(days=7)).isoformat()
            body = {"ok": True, "version": "1.5.0", "week": wk, "done": WEEKDONE.get(wk, []),
                    "picked": [t for t in TASKS if t["focus"] and wk <= t["focus"] < nxt],
                    "review": None if UNSHARED else REVIEWS.get(wk), "reviewsError": "notion_not_shared" if UNSHARED else None}
        elif q.get("action") == "aispend":
            body = {"ok": True, "ai": SPEND}
        elif q.get("action") == "unshare":
            UNSHARED.append(1); body = {"ok": True}
        elif q.get("action") == "done":
            body = {"ok": True, "version": "1.4.0", "days": 30, "done": DONE}
        elif q.get("action") == "dates":
            body = {"ok": True, "version": "1.3.0", "dates": KDATES, "areas": AREAS, "types": KTYPES}
        elif q.get("action") == "ledger":
            body = {"ok": True, "version": "1.9.0", "ynab": YNAB, "queue": qrows()}
        elif q.get("action") == "reviews":
            body = {"ok": True, "version": "1.7.0", "reviews": [] if UNSHARED else [REVIEWS[k] for k in sorted(REVIEWS, reverse=True)]}
            if UNSHARED: body = {"ok": False, "error": "notion_not_shared"}
            RLISTS.append(1)
        elif q.get("action") == "stats": body = {"ok": True, "posts": len(POSTS), "created": [e["title"] for e in CREATED], "tasks": [[t["title"], t["status"], t["focus"]] for t in TASKS], "dates": [[d["title"], d["start"], d["end"], d["area"], d["type"], d["yearly"]] for d in KDATES], "reviews": REVIEWS, "reviewPosts": len(RPOSTS), "reviewLists": len(RLISTS), "asks": ASKS, "spend": SPEND, "created": [e["title"] for e in CREATED], "createdAreas": [[e["title"], e["area"]] for e in CREATED], "queue": [[q["title"], q["priority"], q["bought"]] for q in QUEUE], "qposts": len(QPOSTS)}
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
            elif act == "ask":
                msgs = b.get("messages", []); last = msgs[-1]["text"] if msgs else ""; mode = b.get("mode")
                ASKS.append({"mode": mode, "turns": len(msgs), "last": last, "ctx": b.get("context", "")[:4000], "ignore": b.get("ignore")})
                model = "claude-haiku-4-5" if mode == "fast" else "claude-sonnet-5-5"; cost = 0.012 if mode == "fast" else 0.035
                props = []
                if "BUDGET" in last: body = {"ok": False, "error": "ai_budget", "spend": dict(SPEND, usd=8.0)}
                else:
                    if mode == "patterns": reply = "- Evening calls drain you in weeks 39 and 35.\n- Weeks with fewer picks finish more of them.\n- Try one call-free evening next week."
                    elif mode == "summary": reply = "A steady week, Captain. The deck shipped and the hives were checked; bulbs slipped again."
                    elif "hive" in last.lower():
                        reply = "Proposed a farm calendar block."; props.append({"kind": "add_event", "input": {"title": "Feed the hives", "calendar": "farm", "date": "2026-10-10", "start_time": "09:00", "minutes": 60}})
                    elif "remind" in last.lower():
                        reply = "Proposed a reminder for Thursday at 15:00."; props.append({"kind": "add_event", "input": {"title": "Call the vet", "date": "2026-10-08", "start_time": "15:00", "minutes": 15}})
                    elif "task" in last.lower():
                        reply = "Proposed a new task."; props.append({"kind": "add_task", "input": {"title": "Order hive frames", "life_area": "🐝 Beekeeping", "priority": "🟡 Medium"}})
                    elif "pick" in last.lower():
                        t = next(t for t in TASKS if t["title"] == "Book furnace service")
                        reply = "Proposed picking it for today."; props.append({"kind": "set_focus", "input": {"task_id": t["id"], "task_title": t["title"], "day": "2026-10-06"}})
                    elif "date" in last.lower():
                        reply = "Proposed a key date."; props.append({"kind": "add_key_date", "input": {"title": "Seed order deadline", "start": "2026-11-02", "life_area": "🌿 SkyGarden Farm", "type": "⏰ Deadline"}})
                    elif "review" in last.lower():
                        reply = "Drafted your review."; props.append({"kind": "review_draft", "input": {"week_start": "2026-10-05", "went_well": "Shipped the deck", "next_focus": "Hive winter prep"}})
                    else: reply = "Order spring bulbs first, Captain. It is two days overdue and High priority."
                    SPEND["usd"] = round(SPEND["usd"] + cost, 4); SPEND["calls"] += 1
                    body = {"ok": True, "reply": reply, "proposals": props, "model": model, "cost": cost, "spend": SPEND}
            elif act == "savereview":
                r = b.get("review", {}); RPOSTS.append(1)
                if UNSHARED: body = {"ok": False, "error": "notion_not_shared"}
                elif not r.get("week"): body = {"ok": False, "error": "bad_request"}
                else:
                    created = r["week"] not in REVIEWS
                    REVIEWS[r["week"]] = dict(REVIEWS.get(r["week"], {}), **r, id="rev-" + r["week"], url="https://www.notion.so/rev" + r["week"].replace("-", ""), saved="2026-10-11T20:05:00Z")
                    body = {"ok": True, "created": created, "review": REVIEWS[r["week"]]}
            elif act == "queueadd":
                it2 = b.get("item", {}); QPOSTS.append(1)
                if it2.get("cid") in QCIDS: body = dict(QCIDS[it2["cid"]], duplicate=True)
                elif not str(it2.get("title", "")).strip(): body = {"ok": False, "error": "bad_title"}
                else:
                    last = max([q["priority"] or 0 for q in QUEUE if not q["bought"]] + [0])
                    nq = {"id": "q" + str(len(QUEUE) + 1), "title": it2["title"], "cost": it2.get("cost"), "priority": last + 10, "note": it2.get("note", ""), "link": "", "bought": None, "created": "2026-10-07"}
                    QUEUE.append(nq); body = {"ok": True, "item": nq}; QCIDS[it2["cid"]] = body
            elif act == "queueorder":
                ids = b.get("ids", []); QPOSTS.append(1)
                waiting = {q["id"]: q for q in QUEUE if not q["bought"]}
                if any(i not in waiting for i in ids): body = {"ok": False, "error": "not_writable"}
                else:
                    for i, qid in enumerate(ids): waiting[qid]["priority"] = (i + 1) * 10
                    body = {"ok": True, "queue": qrows()}
            elif act == "queuebought":
                qq = next((q for q in QUEUE if q["id"] == b.get("id")), None); QPOSTS.append(1)
                if not qq: body = {"ok": False, "error": "not_writable"}
                else: qq["bought"] = b.get("day"); body = {"ok": True, "queue": qrows()}
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
            elif it.get("area") not in ("personal", "farm"): body = {"ok": False, "error": "not_writable"}
            elif it.get("title") == "FAILME": body = {"ok": False, "error": "bad_title"}
            elif it.get("cid") in SEEN: body = dict(SEEN[it["cid"]], duplicate=True)
            else:
                ev = {"id": it["area"] + ":new:" + it["cid"], "area": it["area"], "title": it["title"], "busy": False, "allDay": bool(it.get("allDay")), "location": "", "start": it["start"], "end": it["end"]}
                CREATED.append(ev); body = {"ok": True, "version": "1.1.0", "event": ev}; SEEN[it["cid"]] = body
        out = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(out)
HTTPServer(("127.0.0.1", 8100), H).serve_forever()
