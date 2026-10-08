/* TimothyOS: Bridge overview, calendars, capture, Plan Day and Key Dates.
   Reads work + personal calendars and Notion through the Apps Script bridge.
   The Bridge screen sums it all up; Day, Week and Month show the detail. */
(function () {
  "use strict";

  var VERSION = "2.8.0";
  var LS_CONN = "tos.conn.v1";
  var LS_CACHE = "tos.cache.v1";
  var LS_SYNC = "tos.sync.v1";
  var LS_HIDDEN = "tos.hidden.v1";
  var LS_QUEUE = "tos.queue.v1";       /* captures waiting to be saved */
  var LS_CAPPREFS = "tos.capprefs.v1";
  var LS_TASKS = "tos.tasks.v1";       /* Notion Master Task List, last few days fetched */
  var LS_DATES = "tos.dates.v1";       /* Notion Key Dates */
  var LS_START = "tos.start.v1";       /* screen the app opens on: "bridge" or "today" */
  var LS_PLACE = "tos.place.v1";       /* { lat, lon } rounded, for weather */
  var LS_WX = "tos.wx.v1";             /* last Open-Meteo forecast */
  var LS_DONE = "tos.done.v1";         /* tasks finished in the last 30 days (area + date only) */
  var LS_LOG = "tos.log.v1";           /* Bridge: one intent line per day, last 30 days (the journal itself is the LOG screen) */
  var LS_BEARINGS = "tos.bearings.v1"; /* guiding words, one shown per day */
  var LS_WEEKS = "tos.weeks.v1";       /* Review: last few weeks fetched (finished + picked tasks, saved review) */
  var LS_RSAVED = "tos.rsaved.v1";     /* Review: weeks saved to Notion, for the Bridge reminder */
  var LS_RDRAFT = "tos.rdraft.v1";     /* Review: unsaved writing, per week */
  var LS_RLOG = "tos.rlog.v1";         /* Review log: saved reviews from Notion (bridge 1.7) */
  var LS_RPAT = "tos.rpatterns.v1";    /* Review log: the last "patterns" answer from Claude */
  var LS_ASK = "tos.ask.v1";           /* Ask: the current conversation (6 hours, or until NEW CHAT) */
  var LS_LEDGER = "tos.ledger.v1";       /* Ledger: last YNAB figures and Replicator Queue from the bridge */
  var LS_LEDGERRANGE = "tos.lrange.v1"; /* Ledger: averaging period, 3, 6 or 12 months */
  var LS_AIFIN = "tos.aifin.v1";
  var LS_STANDBY = "tos.standby.v1";    /* Standby after N minutes without a touch (0 = off) */        /* Ask: share finances with Claude (off unless turned on) */
  var LS_AISPEND = "tos.aispend.v1";   /* Ask: this month's spend as last reported by the bridge */
  var LS_BOPEN = "tos.bopen.v1";       /* Bridge panels opened with + */
  var LS_IGNORE = "tos.ignore.v1";     /* event titles left out everywhere, e.g. blocks that only exist to stop bookings */
  var LS_TOPGAP = "tos.topgap.v1";     /* retired in 2.7.3: the space below the iPad status bar is fixed (30 px, CSS --top-gap) */
  var MAX_ATTEMPTS = 10;
  var FRESH_MS = 60 * 1000;          /* don't refetch a range newer than this */
  var TASKS_FRESH_MS = 5 * 60 * 1000; /* background refresh of the task list; your own actions refresh at once */
  var LS_NETLOG = "tos.netlog.v1";    /* last bridge requests: action, time taken, result (no data) */
  var AUTO_MS = 5 * 60 * 1000;       /* background refresh while the app is open */
  var KEEP_RANGES = 8;

  var AREAS = {
    work: { name: "WORK", unit: "MTGS" },
    personal: { name: "PERSONAL", unit: "ITEMS" },
    farm: { name: "FARM + BEES", unit: "ITEMS" },   /* named after its calendar once linked (bridge 1.8) */
    hobby: { name: "HOBBIES" }
  };
  var LIVE = ["work", "personal"];         /* calendars in use; setAreas() adds farm once the bridge reports it */
  var STANDBY_AREAS = ["farm", "hobby"];
  var STANDBY_MODULES = [
    ["NOTES IN CAPTURE", "Quick notes, with a later Notion stage."]
  ];
  var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DOWL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MONL = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  /* ---------- Storage (never throws) ---------- */
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v, function (key, val) { return key.charAt(0) === "_" ? undefined : val; })); } catch (e) { /* storage full or blocked */ }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  /* ---------- Dates ---------- */
  function p2(n) { return String(n).padStart(2, "0"); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sow(d) { var x = sod(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  function som(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function ymd(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function parseYmd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hm(d) { return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function dLabel(d) { return DOW[d.getDay()] + " " + p2(d.getDate()) + " " + MON[d.getMonth()]; }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  /* Hour position inside a day, using wall-clock time so DST days stay correct. */
  function posInDay(d, d0) {
    if (d <= d0) return 0;
    if (d >= addDays(d0, 1)) return 24;
    return d.getHours() + d.getMinutes() / 60;
  }
  function stamp(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    return (sameDay(d, new Date()) ? "" : p2(d.getDate()) + " " + MON[d.getMonth()] + " ") + hm(d);
  }

  /* ---------- Small helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* Notion labels carry emoji ("🔴 High", "🎯 Work & Calling"). Show them as plain text;
     the original value is still what gets sent back to Notion. */
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{3030}\u{303D}\u{3297}\u{3299}\u{00A9}\u{00AE}\u{203C}\u{2049}\u{2122}\u{2139}\u{FE0F}\u{200D}\u{20E3}]/gu;
  function bare(s) { return String(s == null ? "" : s).replace(EMOJI, "").replace(/\s+/g, " ").trim(); }
  function cssNum(name, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }
  function phead(title, meta, c, extra) {
    return '<div class="phead"' + (c ? ' style="--c: var(--' + c + ')"' : "") + '><span class="cap"></span><h2>' + title +
      "</h2>" + (extra || "") + '<span class="rule"></span>' + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</div>";
  }
  /* A refresh failed but saved data is on screen: say so quietly. Details are in Systems. */
  function stale(at) { return '<div class="stale">Couldn\'t refresh just now. Showing ' + esc(stamp(at)) + ". Retrying.</div>"; }
  function stubBox(text) { return '<div class="stubbox"><span class="pill">STANDBY</span><span>' + text + "</span></div>"; }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }

  /* ---------- State ---------- */
  var cached = lsGet(LS_CACHE) || {};
  var savedWeeks = lsGet(LS_RSAVED) || {};
  var bridgeOpen = lsGet(LS_BOPEN) || {};
  var state = {
    screen: lsGet(LS_START) === "today" ? "today" : "bridge",
    anchor: sod(new Date()),
    conn: lsGet(LS_CONN),
    ranges: cached.ranges || {},
    calendars: cached.calendars || [],
    bridgeVersion: cached.bridgeVersion || null,
    caps: cached.caps || [],             /* bridge abilities, e.g. ["read", "create"] */
    queue: lsGet(LS_QUEUE) || [],
    tasks: lsGet(LS_TASKS) || {},          /* { "2026-10-06": { fetched, focus, open, areas, priorities } } */
    tasksErr: null,
    tasksInflight: {},
    taskBusy: {},
    dates: lsGet(LS_DATES),                /* { fetched, dates, areas, types } */
    datesErr: null,
    datesInflight: false,
    done: lsGet(LS_DONE),                  /* { fetched, done: [{ area, at }] } */
    doneErr: null,
    doneInflight: false,
    wx: lsGet(LS_WX),                      /* { fetched, key, data } */
    wxErr: null,
    wxInflight: false,
    wmShift: 0,
    weeks: lsGet(LS_WEEKS) || {},          /* { "2026-10-05": { fetched, done, picked, review, reviewsError } } */
    weekErr: null,
    weekInflight: {},
    reviewSaving: false,
    ledger: lsGet(LS_LEDGER), ledgerErr: null, ledgerInflight: false, ledgerCat: null, queueBusy: false, queueConfirm: null,
    rvLog: true,                           /* REVIEW shows the log (landing) rather than one week */
    rlog: lsGet(LS_RLOG),                  /* { fetched, reviews } */
    rlogErr: null, rlogInflight: false, patternsBusy: false,
    aiSpend: lsGet(LS_AISPEND),            /* { month, usd, calls, budget } */
    flushing: false,
    dayScale: null,
    weekScale: null,
    sync: lsGet(LS_SYNC) || { status: "idle", at: null, error: null },
    hidden: lsGet(LS_HIDDEN) || {},   /* calendars toggled off on Today, e.g. { work: true } */
    inflight: {},
    index: {},
    lastDay: sod(new Date()).getTime(),
    lastAuto: 0,
    disarmAt: 0,
    scrollTarget: null
  };
  if (state.sync.status === "syncing") state.sync.status = "idle";

  /* ---------- Bridge API ---------- */
  /* Google answers in two steps (script, then a result page). The second step
     occasionally returns a 404 or an HTML error page even though the script ran
     fine. Those are retried, and so are dropped connections. Every bridge action
     is safe to repeat: reads, and writes that carry a unique ID or set a field
     to a fixed value. */
  var RETRY_DELAYS = [700, 1800, 4000];
  var MAX_PARALLEL = 2;                 /* bridge requests at once; more just queue inside Google */
  function transient(err) {
    var code = err && err.code;
    /* no_key: Google delivered the request without its details (a redirect turned it into an empty GET);
       key_unreadable: Google's settings store answered empty for a moment. Neither is a wrong key. */
    return code === "http_404" || code === "bad_json" || /^http_5/.test(code || "") || code === "no_key" || code === "key_unreadable" || code === "notion_busy" || (!!err && err.name === "TypeError");
  }
  /* iPadOS cuts off requests when the screen locks or you switch apps. */
  var lastHidden = 0;
  document.addEventListener("visibilitychange", function () { if (document.hidden) lastHidden = Date.now(); });
  function waitVisible() {
    return new Promise(function (res) {
      if (!document.hidden) { res(); return; }
      var f = function () { if (!document.hidden) { document.removeEventListener("visibilitychange", f); res(); } };
      document.addEventListener("visibilitychange", f);
    });
  }
  function withRetry(run) {
    var attempt = 0, paused = 0;
    function go() {
      var started = Date.now();
      return run().catch(function (err) {
        /* Cut off by the iPad going to sleep or to another app: try again once it's back. */
        if (isNetworkError(err) && (document.hidden || lastHidden >= started) && paused < 3) { paused++; markRetried(err); return waitVisible().then(go); }
        if (navigator.onLine === false || !transient(err) || attempt >= RETRY_DELAYS.length) throw err;
        markRetried(err);
        var wait = RETRY_DELAYS[attempt++];
        return new Promise(function (res) { setTimeout(res, wait); }).then(go);
      });
    }
    return go();
  }
  /* Run at most MAX_PARALLEL requests at once; the rest wait their turn. */
  var active = 0, waiting = [];
  function slot(fn) {
    return new Promise(function (res, rej) {
      waiting.push(function () {
        active++;
        fn().then(res, rej).then(function () {
          active--;
          if (waiting.length) waiting.shift()();
        });
      });
      if (active < MAX_PARALLEL) waiting.shift()();
    });
  }
  /* A short log of recent requests, shown in Systems, to tell slow from dropped from refused. */
  var netlog = lsGet(LS_NETLOG) || [];
  function logged(action, started, p) {
    return p.then(function (j) { note(action, started, "ok"); return j; }, function (err) {
      var r = err && err.name === "AbortError" ? "timeout" : err && err.name === "TypeError" ? "dropped" : (err && err.code) || "error";
      if (err && typeof err === "object") err.netEntry = note(action, started, r + (document.hidden || lastHidden >= started ? " · in background" : ""));
      throw err;
    });
  }
  function note(action, started, result) {
    var n = { t: started, a: action || "?", ms: Date.now() - started, r: result };
    netlog.push(n);
    netlog = netlog.slice(-30);
    lsSet(LS_NETLOG, netlog);
    return n;
  }
  /* A failed attempt that is tried again isn't a failure yet: the log shows it as RETRIED. */
  function markRetried(err) { if (err && err.netEntry) { err.netEntry.retried = true; lsSet(LS_NETLOG, netlog); } }
  /* Requests still on their way, counting retries and pauses: REFRESH NOW spins until this is 0. */
  var netPending = 0;
  function tracked(p) { netPending++; p.then(function () { netPending--; }, function () { netPending--; }); return p; }
  /* Reads asked for at the same moment (returning to the app, REFRESH NOW) travel together as one
     request (bridge 1.13), so Google runs one execution instead of five. Fewer requests, fewer of
     Google's lost answers (HTTP 404). An older bridge doesn't know "batch": then each goes alone. */
  var BATCHABLE = ["aispend", "events", "tasks", "dates", "done", "week", "reviews", "ledger", "habits", "library"];
  var batchQ = null, batchOk = true;
  function api(params, conn) {
    if (conn || !batchOk || BATCHABLE.indexOf(params.action) === -1) return tracked(withRetry(function () { return apiOnce(params, conn); }));
    return tracked(new Promise(function (res, rej) {
      if (!batchQ) { batchQ = []; setTimeout(flushBatch, 40); }
      batchQ.push({ params: params, res: res, rej: rej });
    }));
  }
  function flushBatch() {
    var q = batchQ; batchQ = null;
    var alone = function (x) { withRetry(function () { return apiOnce(x.params); }).then(x.res, x.rej); };
    if (q.length === 1) { alone(q[0]); return; }
    var calls = q.map(function (x) { return x.params; });
    withRetry(function () { return apiOnce({ action: "batch", calls: JSON.stringify(calls) }, null, "sync: " + calls.map(function (c) { return c.action; }).join(", "), 90000); }).then(function (j) {
      q.forEach(function (x, i) {
        var r = j.results && j.results[i];
        if (r && r.ok === true) x.res(r); else x.rej(replyError(r));
      });
    }, function (err) {
      if (err && err.code === "unknown_action") { batchOk = false; markRetried(err); q.forEach(alone); return; }   /* older bridge: each goes alone instead */
      q.forEach(function (x) { x.rej(err); });
    });
  }
  function apiPost(body, timeoutMs) { return tracked(withRetry(function () { return apiPostOnce(body, timeoutMs); })); }
  function apiOnce(params, conn, label, timeoutMs) {
    conn = conn || state.conn;
    var u = new URL(conn.url);
    u.searchParams.set("key", conn.key);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return slot(function () {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
      /* Plain GET with no custom headers, so Apps Script answers without a CORS preflight. */
      return logged(label || params.action, Date.now(), fetch(u.toString(), { method: "GET", redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(readReply)
        .finally(function () { if (timer) clearTimeout(timer); }));
    });
  }
  /* Writes go as a POST with a plain-text JSON body (no custom headers, so no CORS preflight). */
  function apiPostOnce(body, timeoutMs) {
    var conn = state.conn;
    return slot(function () {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 60000) : null;
      return logged(body.action, Date.now(), fetch(conn.url, { method: "POST", body: JSON.stringify(Object.assign({ key: conn.key }, body)), redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(readReply)
        .finally(function () { if (timer) clearTimeout(timer); }));
    });
  }
  function readReply(r) {
    if (!r.ok) { var e = new Error("http_" + r.status); e.code = "http_" + r.status; throw e; }
    return r.text().then(function (txt) {
      var j;
      try { j = JSON.parse(txt); } catch (x) { var e1 = new Error("bad_json"); e1.code = "bad_json"; throw e1; }
      if (!j || j.ok !== true) throw replyError(j);
      return j;
    });
  }
  function replyError(j) {
    var e2 = new Error((j && j.error) || "bad_response");
    e2.code = (j && j.error) || "bad_response"; e2.detail = j && j.detail; e2.spend = j && j.spend; e2.left = j && j.left;
    return e2;
  }
  function isNetworkError(err) { return !!err && (err.name === "TypeError" || err.name === "AbortError"); }
  function describe(err) {
    var code = err && (err.code || err.message);
    if (code === "unauthorized") return "The access key doesn't match. Copy it again from the Apps Script log (run setup).";
    if (code === "no_key") return "Google delivered the request without its details, even after retrying. Usually temporary; try again in a moment.";
    if (code === "key_unreadable") return "Google's settings store didn't answer, even after retrying. Usually temporary; try again in a moment.";
    if (code === "server_error") return "The script hit an error: " + (err.detail || "unknown") + ".";
    if (code === "bad_json") return "Google sent an error page instead of data, even after retrying. Usually temporary. If it persists, check that the URL ends in /exec.";
    if (code === "http_404") return "Google's servers didn't return the result (HTTP 404), even after retrying. Usually temporary; try Refresh in a minute.";
    if (code === "unknown_action") return "The script is out of date. Deploy a new version of the latest Code.gs.";
    if (/^http_/.test(code || "")) return "The script answered with " + code.replace("http_", "HTTP ") + ". Check the deployment.";
    if (err && err.name === "AbortError") return "Google took too long to answer, even after retrying. Usually temporary.";
    if (isNetworkError(err)) return navigator.onLine === false ? "No connection. Showing saved data." : "Couldn't reach the script, even after retrying. If this keeps happening, check that the URL ends in /exec and access is set to Anyone.";
    return "Sync failed (" + esc(code) + ").";
  }

  /* ---------- Ranges + events ---------- */
  function viewRange() {
    var a = state.anchor;
    if (state.screen === "bridge") return bridgeRange();
    if (state.screen === "loom") return lmRange();
    if (state.screen === "review") { var rw = state.rvLog ? sow(new Date()) : sow(a); return { from: addDays(rw, -7), to: addDays(rw, 14) }; }
    if (state.screen === "month") { var g = sow(som(a)); return { from: g, to: addDays(g, 42) }; }
    var w = sow(a);
    return { from: w, to: addDays(w, 7) };
  }
  function rkey(r) { return r.from.getTime() + "_" + r.to.getTime(); }
  function eventsFor(r) { return cachedEventsFor(r).filter(function (ev) { return !ignored(ev); }).concat(pendingEvents()); }
  /* ---------- Ignored events ---------- */
  /* Some events exist only to stop others booking time (for example an all-weekend
     "out of office" block on the work calendar). Any event whose title contains a
     phrase on this list is left out of every view, count, clash and total.
     The list stays on this iPad; the calendars themselves are untouched. */
  var ignoreList = lsGet(LS_IGNORE) || [];
  function ignored(ev) {
    if (!ignoreList.length || ev.pending) return false;
    var t = norm1(ev.title);
    return ignoreList.some(function (p) { return t.indexOf(norm1(p)) > -1; });
  }
  function setIgnore(list) {
    var seen = {};
    ignoreList = list.map(function (s) { return String(s).trim(); }).filter(function (s) {
      var k = norm1(s);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    }).slice(0, 30);
    if (ignoreList.length) lsSet(LS_IGNORE, ignoreList); else lsDel(LS_IGNORE);
  }
  function ignoredCount() {
    var seen = {};
    Object.keys(state.ranges).forEach(function (k) { state.ranges[k].events.forEach(function (ev) { if (ignored(ev)) seen[ev.id] = 1; }); });
    return Object.keys(seen).length;
  }
  function cachedEventsFor(r) {
    var exact = state.ranges[rkey(r)];
    if (exact) return exact.events;
    var seen = {}, out = [], f = r.from.getTime(), t = r.to.getTime();
    Object.keys(state.ranges).forEach(function (k) {
      var e = state.ranges[k];
      if (e.to > f && e.from < t) e.events.forEach(function (ev) { if (!seen[ev.id]) { seen[ev.id] = 1; out.push(ev); } });
    });
    return out;
  }
  function hasData(r) {
    var f = r.from.getTime(), t = r.to.getTime();
    return Object.keys(state.ranges).some(function (k) { var e = state.ranges[k]; return e.from <= f && e.to >= t; });
  }
  function norm(ev) {
    if (!ev.allDay && !(ev._s instanceof Date)) { ev._s = new Date(ev.start); ev._e = new Date(ev.end); }
    return ev;
  }
  function areaRank(a) { return LIVE.indexOf(a); }
  function dayEvents(list, day) {
    var d0 = sod(day), d1 = addDays(d0, 1), key = ymd(d0), timed = [], allDay = [];
    list.forEach(function (ev) {
      norm(ev);
      if (ev.allDay) { if (ev.start <= key && key < ev.end) allDay.push(ev); }
      else if (ev._s < d1 && ev._e > d0) timed.push(ev);
    });
    timed.sort(function (a, b) { return a._s - b._s || b._e - a._e; });
    allDay.sort(function (a, b) { return areaRank(a.area) - areaRank(b.area); });
    return { timed: timed, allDay: allDay };
  }
  /* Every hour is shown. Focus hours (07-21) are twice as tall as the rest. */
  var FOCUS_START = 7, FOCUS_END = 21, QUIET_RATIO = 0.5;
  function isFocus(h) { return h >= FOCUS_START && h < FOCUS_END; }
  function makeScale(full) {
    var slim = full * QUIET_RATIO;
    function y(h) {
      h = Math.max(0, Math.min(24, h));
      if (h <= FOCUS_START) return h * slim;
      if (h <= FOCUS_END) return FOCUS_START * slim + (h - FOCUS_START) * full;
      return FOCUS_START * slim + (FOCUS_END - FOCUS_START) * full + (h - FOCUS_END) * slim;
    }
    function hourAt(px) {
      var a = FOCUS_START * slim, b = a + (FOCUS_END - FOCUS_START) * full;
      if (px <= a) return px / slim;
      if (px <= b) return FOCUS_START + (px - a) / full;
      return Math.min(24, FOCUS_END + (px - b) / slim);
    }
    return { y: y, total: y(24), hourAt: hourAt };
  }
  /* Faint shading behind the quieter hours. */
  function quietBands(sc, cls) {
    var top = sc.y(FOCUS_START), late = sc.y(FOCUS_END);
    return '<div class="' + cls + '" style="top:0;height:' + top + 'px"></div>' +
      '<div class="' + cls + '" style="top:' + late + "px;height:" + (sc.total - late) + 'px"></div>';
  }
  /* Side-by-side columns for overlapping events, worked out in pixels so
     short events in the compressed bands still get their own column. */
  function layout(timed, day, sc, minPx) {
    var d0 = sod(day);
    var rows = timed.map(function (ev) {
      var s = posInDay(ev._s, d0), e = posInDay(ev._e, d0), ys = sc.y(s), ye = sc.y(e);
      return { ev: ev, s: s, e: e, ys: ys, ye: ye, vye: Math.max(ye, ys + minPx) };
    });
    var clusters = [], cur = [], end = -1;
    rows.forEach(function (r) {
      if (cur.length && r.ys >= end) { clusters.push(cur); cur = []; end = -1; }
      cur.push(r);
      end = Math.max(end, r.vye);
    });
    if (cur.length) clusters.push(cur);
    clusters.forEach(function (cl) {
      var cols = [];
      cl.forEach(function (r) {
        var c = 0;
        while (cols[c] !== undefined && cols[c] > r.ys) c++;
        cols[c] = r.vye;
        r.col = c;
      });
      cl.forEach(function (r) { r.n = cols.length; });
    });
    return rows;
  }
  /* ---------- Calendar visibility ---------- */
  function visible(list) { return list.filter(function (ev) { return !state.hidden[ev.area]; }); }
  function hiddenNote() {
    var off = LIVE.filter(function (k) { return state.hidden[k]; });
    return off.length ? off.map(function (k) { return AREAS[k].name; }).join(" + ") + " HIDDEN" : "";
  }
  function toggleArea(k) {
    if (state.hidden[k]) delete state.hidden[k]; else state.hidden[k] = true;
    lsSet(LS_HIDDEN, state.hidden);
    render(true);
    var name = AREAS[k].name.charAt(0) + AREAS[k].name.slice(1).toLowerCase();
    toast(name + " calendar " + (state.hidden[k] ? "hidden on all views" : "shown on all views"));
  }
  function calStatus(area) { return state.calendars.filter(function (c) { return c.area === area; })[0]; }
  /* The farm calendar joins Work and Personal once the bridge lists it (bridge 1.8, FARM_CALENDAR_ID).
     Its label is the calendar's own name, so nothing personal is written into this code. */
  function setAreas() {
    var f = calStatus("farm");
    LIVE = f ? ["work", "personal", "farm"] : ["work", "personal"];
    STANDBY_AREAS = f ? ["hobby"] : ["farm", "hobby"];
    AREAS.farm.name = f && f.ok && bare(f.name || "").trim() ? bare(f.name).trim().toUpperCase().slice(0, 20) : "FARM + BEES";
    WRITABLE = ["personal"].concat(f && f.ok ? ["farm"] : []);
  }
  function hasFarm() { return LIVE.indexOf("farm") > -1; }

  /* ---------- Sync ---------- */
  function setSync(status, error) {
    state.sync = { status: status, at: status === "ok" ? Date.now() : state.sync.at, error: error || null };
    lsSet(LS_SYNC, state.sync);
    renderStatus();
  }
  function persist() {
    var keys = Object.keys(state.ranges).sort(function (a, b) { return state.ranges[b].fetched - state.ranges[a].fetched; });
    keys.slice(KEEP_RANGES).forEach(function (k) { delete state.ranges[k]; });
    lsSet(LS_CACHE, { ranges: state.ranges, calendars: state.calendars, bridgeVersion: state.bridgeVersion, caps: state.caps });
  }
  function refresh(force) {
    if (!state.conn || (state.screen === "systems" && !force)) return;
    var r = viewRange(), k = rkey(r), have = state.ranges[k];
    if (!force && have && Date.now() - have.fetched < FRESH_MS) return;
    if (state.inflight[k]) return;
    state.inflight[k] = true;
    setSync("syncing");
    api({ action: "events", from: r.from.getTime(), to: r.to.getTime() }).then(function (j) {
      state.ranges[k] = { from: r.from.getTime(), to: r.to.getTime(), fetched: Date.now(), events: j.events || [] };
      state.calendars = j.calendars || state.calendars;
      if (j.version) state.bridgeVersion = j.version;
      state.caps = j.capabilities || [];
      persist();
      state.syncFails = 0;
      setSync("ok");
      reconcileQueue();
      if (state.screen === "systems") { toast("Synced"); loadTasks(ymd(new Date()), true); loadDates(true); loadDone(true); loadHabits(true); loadLibrary(true); }
      flushQueue(false);
      flushHabits();
      if (rkey(viewRange()) === k || state.screen === "systems") render(true);
    }).catch(function (err) {
      var offline = navigator.onLine === false;
      state.syncFails = (state.syncFails || 0) + 1;
      if (!offline && state.syncFails < 3 && hasData(r) && (transient(err) || isNetworkError(err))) {
        /* Showing saved data that's still good: stay quiet and try again shortly. */
        state.sync.status = "retrying";
        state.sync.error = describe(err);
        renderStatus();
        setTimeout(function () { refresh(true); }, 30000 * state.syncFails);
      } else {
        setSync(isNetworkError(err) || offline ? "offline" : "error", describe(err));
      }
      if (state.screen === "systems") render(true);
    }).then(function () { delete state.inflight[k]; });
  }

  /* ---------- Header, nav, status ---------- */
  function renderHeader() {
    var e = $("eyebrow"), t = $("title"), a = state.anchor, now = new Date();
    var linked = !!state.conn;
    renderNav();
    $("pager").hidden = !linked || state.screen === "systems" || state.screen === "dates" || state.screen === "bridge" || state.screen === "ledger" || state.screen === "log" || state.screen === "library" || (state.screen === "review" && state.rvLog);
    $("logBtn").hidden = state.screen !== "review";
    $("todayBtn").hidden = state.screen === "review" || state.screen === "log" || state.screen === "library";   /* ALL REVIEWS takes its place; this week is one tap away on the log */
    if (state.screen === "review") $("todayBtn").textContent = "THIS WEEK"; else $("todayBtn").textContent = "TODAY";
    $("topNote").textContent = !linked ? "CALENDAR CORE · NOT LINKED" : canCreate() ? "CALENDAR CORE · CAPTURE ON" : "CALENDAR CORE · READ-ONLY";
    $("capBtn").disabled = !linked;
    $("planBtn").disabled = !linked || !canPlan();
    $("planBtn").innerHTML = "PLAN DAY" + (linked && !canPlan() ? "<small>SETUP</small>" : "");
    $("askBtn").disabled = !linked || !canAsk();
    $("askBtn").innerHTML = "ASK" + (linked && !canAsk() ? "<small>SETUP</small>" : "");
    if (!linked && state.screen !== "systems") { e.textContent = "FIRST RUN"; t.textContent = "LINK CALENDARS"; }
    else if (state.screen === "bridge") {
      e.textContent = "BRIDGE · " + hm(now) + (hiddenNote() ? " · " + hiddenNote() : "");
      t.textContent = DOWL[now.getDay()] + " " + p2(now.getDate()) + " " + MON[now.getMonth()];
    }
    else if (state.screen === "today") {
      var diff = Math.round((sod(a) - sod(now)) / 86400000);
      e.textContent = diff === 0 ? "TODAY" : diff === 1 ? "TOMORROW" : diff === -1 ? "YESTERDAY" : DOWL[a.getDay()];
      t.textContent = dLabel(a) + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    } else if (state.screen === "week") {
      var w0 = sow(a), w1 = addDays(w0, 6);
      e.textContent = "WEEK " + isoWeek(a) + (sow(now).getTime() === w0.getTime() ? " · THIS WEEK" : "");
      t.textContent = p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + MON[w0.getMonth()] : "") + " TO " + p2(w1.getDate()) + " " + MON[w1.getMonth()];
    } else if (state.screen === "month") {
      e.textContent = "MONTH" + (hiddenNote() ? " · " + hiddenNote() : "");
      t.textContent = MONL[a.getMonth()] + " " + a.getFullYear();
    } else if (state.screen === "review" && state.rvLog) {
      var nSaved = Object.keys(reviewMap()).concat(Object.keys(savedWeeks)).filter(function (k, i, arr) { return arr.indexOf(k) === i; }).length;
      e.textContent = "REVIEW · " + (nSaved ? nSaved + " SAVED" : "LOG");
      t.textContent = "WEEKLY REVIEWS";
    } else if (state.screen === "review") {
      var rw0 = sow(a), thisW = sow(now).getTime() === rw0.getTime(), lastW = addDays(sow(now), -7).getTime() === rw0.getTime();
      /* Same shape as the Week screen (week number above, dates as the title) so the header stays on one line beside ALL REVIEWS and the arrows. */
      e.textContent = "WEEK " + isoWeek(rw0) + " · " + (thisW ? "THIS WEEK" : lastW ? "LAST WEEK" : rw0 > now ? "AHEAD" : "PAST WEEK") + (reviewSaved(ymd(rw0)) ? " · SAVED" : "");
      t.textContent = weekLabel(rw0).replace(/^WEEK \d+ · /, "");
    } else if (state.screen === "dates") { e.textContent = "UPCOMING · NEXT 12 MONTHS"; t.textContent = "KEY DATES"; }
    else if (state.screen === "ledger") { e.textContent = "FINANCES · YNAB" + (state.ledger ? " · SYNCED " + stamp(state.ledger.fetched) : ""); t.textContent = "LEDGER"; }
    else if (state.screen === "log") { e.textContent = "JOURNAL · " + (logOpen() ? "OPEN" : "LOCKED"); t.textContent = "CAPTAIN'S LOG"; }
    else if (state.screen === "loom") lmHead();
    else if (state.screen === "habits") {
      var hd = Math.round((sod(now) - sod(a)) / 86400000);
      e.textContent = "HABITS · " + (hd === 0 ? "TODAY" : hd === 1 ? "YESTERDAY" : hd + " DAYS AGO");
      t.textContent = dLabel(a) + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    }
    else if (state.screen === "library") { e.textContent = "LIBRARY · " + (lb.data ? books().length + (books().length === 1 ? " BOOK" : " BOOKS") : "NOTION"); t.textContent = "LIBRARY"; }
    else { e.textContent = "SETTINGS + HEALTH"; t.textContent = "SYSTEMS"; }
    $("app").classList.toggle("on-bridge", linked && state.screen === "bridge");
    document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) {
      if (b.dataset.screen === state.screen) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    /* Systems has no button of its own: the sync status opens it, and lights up while it's open. */
    if (state.screen === "systems") $("status").setAttribute("aria-current", "page"); else $("status").removeAttribute("aria-current");
    if (state.launch) {   /* ALL STATIONS is open over the screen */
      e.textContent = "STATIONS · " + pins().length + " IN THE BAR"; t.textContent = "ALL STATIONS";
      $("pager").hidden = true; $("logBtn").hidden = true;
      document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) { b.removeAttribute("aria-current"); });
    }
  }
  function renderStatus() {
    var s = $("status"), st = state.sync, at = stamp(st.at), line1, line2, cls;
    if (!state.conn) { cls = "unlinked"; line1 = "NOT LINKED"; line2 = "SETUP NEEDED"; }
    else if (st.status === "syncing") { cls = "syncing"; line1 = "SYNCING"; line2 = at ? "LAST " + at : ""; }
    else if (st.status === "retrying") { cls = "ok"; line1 = "SYNCED"; line2 = (at ? at + " · " : "") + "RETRYING"; }
    else if (st.status === "offline") { cls = "offline"; line1 = "OFFLINE"; line2 = at ? "CACHED " + at : "NO DATA YET"; }
    else if (st.status === "error") { cls = "error"; line1 = "SYNC ERROR"; line2 = "SEE SYSTEMS"; }
    else { cls = "ok"; line1 = at ? "SYNCED" : "WAITING"; line2 = at; }
    var waiting = queued().length, failed = state.queue.length - waiting;
    if (state.conn && failed) { cls = "error"; line1 = "NOT SAVED"; line2 = failed + (failed === 1 ? " CAPTURE" : " CAPTURES"); }
    else if (state.conn && waiting) line2 = waiting + " QUEUED";
    s.className = "status " + cls;
    s.innerHTML = '<b><span class="dot"></span>' + line1 + "</b><span>" + esc(line2) + "</span>";
  }

  /* ---------- Day ---------- */
  function renderDay() {
    var r = viewRange(), list = eventsFor(r), day = state.anchor, now = new Date(), isToday = sameDay(day, now);
    var sc = makeScale(cssNum("--hh", 54));
    var all = dayEvents(list, day), de = dayEvents(visible(list), day), rows = layout(de.timed, day, sc, 24);
    var total = de.timed.length + de.allDay.length, allHidden = LIVE.every(function (k) { return state.hidden[k]; });
    var meta = !hasData(r) ? (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET") : allHidden ? "ALL CALENDARS HIDDEN" :
      (total ? total + (total === 1 ? " EVENT" : " EVENTS") : "OPEN DAY") + (hiddenNote() ? " · " + hiddenNote() : "");
    var html = '<div class="bridge"><section class="tlpanel">' + phead(isToday ? "TODAY TIMELINE" : "DAY TIMELINE", meta);
    var marks = kdMarks(ymd(day), true);
    if (de.allDay.length || marks.length) {
      html += '<div class="allday">' + marks.map(function (m) {
        return '<button type="button" class="adchip kdchip a-' + taskArea(m.o.d.area) + '" data-kd="' + esc(m.o.id) + '">◆ ' + esc(m.o.d.title) + (m.tag ? " · " + m.tag : "") + "</button>";
      }).join("") + de.allDay.map(function (ev) {
        state.index[ev.id] = ev;
        return '<button type="button" class="adchip a-' + ev.area + pendingCls(ev) + '" data-id="' + esc(ev.id) + '">ALL DAY · ' + esc(ev.title) + pendingTag(ev) + "</button>";
      }).join("") + "</div>";
    }
    html += '<div class="tlwrap" id="tlwrap"><div class="tl" style="height:' + sc.total + 'px">' + quietBands(sc, "quietband");
    for (var h = 0; h < 24; h++) {
      html += '<div class="hour' + (isFocus(h) ? "" : " quiet") + '" style="top:' + sc.y(h) + "px;height:" + (sc.y(h + 1) - sc.y(h)) + 'px"><span class="tnum">' + p2(h) + "</span></div>";
    }
    rows.forEach(function (row) {
      var ev = row.ev, top = row.ys + 1, height = Math.max(24, row.ye - row.ys - 3);
      state.index[ev.id] = ev;
      var cls = "ev a-" + ev.area + (height >= 50 ? " tall" : "") + (row.n > 2 && height >= 44 ? " narrow" : "") + (ev.busy ? " busy" : "") + pendingCls(ev);
      html += '<button type="button" class="' + cls + '" data-id="' + esc(ev.id) + '" style="top:' + top + "px;height:" + height +
        "px;left:calc(58px + (100% - 62px) * " + row.col + " / " + row.n + ");width:calc((100% - 62px) / " + row.n + ' - 4px)">' +
        '<span class="lbl"><span class="t">' + esc(ev.title) + '</span><span class="tm tnum">' + hm(ev._s) + "-" + hm(ev._e) + pendingTag(ev) + "</span></span></button>";
    });
    var nowH = now.getHours() + now.getMinutes() / 60;
    if (isToday) html += '<div class="now" style="top:' + sc.y(nowH) + 'px"><span class="tnum">' + hm(now) + "</span></div>";
    html += "</div></div></section><section class=\"rcol\">";

    html += "<div>" + phead("LIFE AREAS", "TAP TO SHOW OR HIDE") + '<div class="arows">';
    LIVE.forEach(function (k) {
      var cs = calStatus(k), off = !!state.hidden[k];
      var items = all.timed.filter(function (e) { return e.area === k; });
      var adCount = all.allDay.filter(function (e) { return e.area === k; }).length;
      var next = items.filter(function (e) { return !isToday || e._e > now; })[0];
      var sub;
      if (off) sub = "Hidden on all views. Tap to show.";
      else if (cs && !cs.ok) sub = "Not connected. See Systems.";
      else if (next) sub = (isToday && next._s <= now ? "Now: " : "Next: ") + hm(next._s) + " " + esc(next.title);
      else sub = items.length ? "Done for the day" : adCount ? "All-day only" : "Nothing scheduled";
      html += '<button type="button" class="arow a-' + k + (off ? " off" : "") + '" data-toggle="' + k + '" aria-pressed="' + !off + '" aria-label="' +
        AREAS[k].name + (off ? " calendar hidden. Tap to show." : " calendar shown. Tap to hide.") + '"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name + "</b><small>" + sub +
        '</small></span><span class="ct"><b class="tnum">' + (items.length + adCount) + "</b>" + (off ? "HIDDEN" : AREAS[k].unit) + "</span></button>";
    });
    STANDBY_AREAS.forEach(function (k) {
      html += '<div class="arow stub a-' + k + '" aria-disabled="true"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name +
        '</b><small>Calendar not linked yet</small></span><span class="ct">STANDBY</span></div>';
    });
    html += "</div></div>";
    html += "<div>" + prioritiesPanel(ymd(day), isToday) + "</div>";
    html += "<div>" + keyDatesPanel(ymd(day)) + "</div>";
    html += "</section></div>";
    $("content").innerHTML = html;

    state.dayScale = sc;
    loadTasks(ymd(day), false);
    loadDates(false);
    var first = rows.length ? rows[0].s : 8;
    state.scrollTarget = Math.max(0, sc.y(isToday ? nowH - 2.5 : Math.max(FOCUS_START, Math.min(first, 18)) - 0.5));
  }

  /* ---------- Week ---------- */
  function renderWeek() {
    var r = viewRange(), list = visible(eventsFor(r)), now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
    var sc = makeScale(cssNum("--wh", 46));
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(r.from, i), de = dayEvents(list, d);
      days.push({ d: d, de: de, rows: layout(de.timed, d, sc, 20) });
    }
    days.forEach(function (x) { x.marks = kdMarks(ymd(x.d), false); });
    var hasAllDay = days.some(function (x) { return x.de.allDay.length || x.marks.length; });
    loadDates(false);
    var html = '<div class="wkpanel">' + phead(hiddenNote() ? "CALENDARS" : "ALL CALENDARS", !hasData(r) ? (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET") :
      hiddenNote() ? hiddenNote() + " · CHANGE ON TODAY" : "TAP A DAY TO OPEN IT") +
      '<div class="wkscroll"><div class="wk wkhead" id="wkhead"><div></div>';
    days.forEach(function (x) {
      html += '<button type="button" class="wkh' + (sameDay(x.d, now) ? " today" : "") + '" data-day="' + ymd(x.d) + '">' +
        DOW[x.d.getDay()] + '<b class="tnum">' + p2(x.d.getDate()) + "</b></button>";
    });
    if (hasAllDay) {
      html += "<div></div>";
      days.forEach(function (x) {
        html += '<div class="wkad">' + x.marks.map(function (m) {
          return '<button type="button" class="kdspan a-' + taskArea(m.o.d.area) + '" data-kd="' + esc(m.o.id) + '">◆ ' + esc(m.o.d.title) + (m.tag ? " · " + m.tag : "") + "</button>";
        }).join("") + x.de.allDay.map(function (ev) { return '<span class="a-' + ev.area + '">' + esc(ev.title) + "</span>"; }).join("") + "</div>";
      });
    }
    html += '</div><div class="wkbody" id="tlwrap"><div class="wk"><div class="wkgut" style="height:' + sc.total + 'px">';
    for (var h = 0; h < 24; h++) {
      html += '<span class="tnum' + (isFocus(h) ? "" : " quiet") + '" style="top:' + (sc.y(h) + 2) + 'px">' + p2(h) + "</span>";
    }
    html += "</div>";
    var lines = "";
    for (var k = 1; k < 24; k++) lines += '<div class="wkline" style="top:' + sc.y(k) + 'px"></div>';
    days.forEach(function (x) {
      html += '<div class="wkcol" data-ymd="' + ymd(x.d) + '" style="height:' + sc.total + 'px">' + quietBands(sc, "wkband") + lines;
      x.rows.forEach(function (row) {
        /* every block carries its title: one line (cut with …) when short, wrapped with its start time when tall */
        var ev = row.ev, hgt = Math.max(20, row.ye - row.ys - 2), tall = hgt >= 54;
        state.index[ev.id] = ev;
        html += '<button type="button" class="wkb a-' + ev.area + (ev.busy ? " busy" : "") + (tall ? " tall" : " one") + pendingCls(ev) + '" data-id="' + esc(ev.id) + '" title="' + esc(ev.title) +
          '" style="top:' + (row.ys + 1) + "px;height:" + hgt + "px;left:calc(2px + (100% - 4px) * " + row.col + " / " + row.n +
          ");width:calc((100% - 4px) / " + row.n + ' - 2px)"><span class="lbl">' + (tall ? '<span class="tm tnum">' + hm(ev._s) + "</span>" : "") + esc(ev.title) + "</span></button>";
      });
      if (sameDay(x.d, now)) html += '<div class="wknow" style="top:' + sc.y(nowH) + 'px"></div>';
      html += "</div>";
    });
    html += "</div></div></div></div>";
    $("content").innerHTML = html;
    state.weekScale = sc;
    var thisWeek = days.some(function (x) { return sameDay(x.d, now); });
    state.scrollTarget = Math.max(0, sc.y(thisWeek ? Math.min(nowH, 18) - 2 : FOCUS_START) - 8);
  }

  /* ---------- Month ---------- */
  function renderMonth() {
    var r = viewRange(), list = visible(eventsFor(r)), now = new Date(), m = state.anchor.getMonth();
    loadDates(false);
    var html = '<div class="mo">';
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(function (d) { html += '<div class="moh">' + d + "</div>"; });
    for (var c = 0; c < 42; c++) {
      var d = addDays(r.from, c), de = dayEvents(list, d), all = de.allDay.concat(de.timed), marks = kdMarks(ymd(d), false);
      var lines = marks.map(function (mk) { return '<span class="li kdli a-' + taskArea(mk.o.d.area) + '">◆ ' + esc(mk.o.d.title) + (mk.tag ? " · " + mk.tag : "") + "</span>"; })
        .concat(all.map(function (ev) { return '<span class="li a-' + ev.area + pendingCls(ev) + '">' + (ev.allDay ? "" : '<span class="tnum">' + hm(ev._s) + "</span> ") + esc(ev.title) + "</span>"; }));
      var present = LIVE.filter(function (a) { return all.some(function (e) { return e.area === a; }); });
      html += '<button type="button" class="moc' + (d.getMonth() === m ? "" : " out") + (sameDay(d, now) ? " today" : "") + '" data-day="' + ymd(d) + '">' +
        '<span class="top1"><span class="n tnum">' + d.getDate() + '</span><span class="dots">' +
        present.map(function (a) { return '<i class="a-' + a + '"></i>'; }).join("") + "</span></span>" +
        lines.slice(0, 3).join("") +
        (lines.length > 3 ? '<span class="more">+' + (lines.length - 3) + " MORE</span>" : "") + "</button>";
    }
    html += "</div>";
    $("content").innerHTML = html;
  }

  /* ---------- Systems ---------- */
  function maskUrl(u) { return u.length > 52 ? u.slice(0, 38) + "…" + u.slice(-10) : u; }
  function calHelp(c) {
    if (c.error === "not_configured") return "Set WORK_CALENDAR_ID in the Apps Script, then deploy a new version.";
    if (c.error === "not_found") return "This Google account can't see that calendar yet. Accept the share invite, then check the ID.";
    return "Problem: " + esc(c.error);
  }
  function renderSystems() {
    var c = state.conn, st = state.sync;
    loadAiSpend(false);
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var pill = !c ? '<span class="pill bad">NOT LINKED</span>' : st.status === "error" ? '<span class="pill bad">ERROR</span>' :
      st.status === "offline" ? '<span class="pill">OFFLINE</span>' : '<span class="pill ok">LINKED</span>';
    var html = '<div class="sys"><section>' + phead("CONNECTION", "") + '<dl class="kv">' +
      "<dt>STATUS</dt><dd>" + pill + (st.error && c ? ' <span class="muted">' + esc(st.error) + "</span>" : "") + "</dd>" +
      "<dt>BRIDGE URL</dt><dd>" + (c ? esc(maskUrl(c.url)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>ACCESS KEY</dt><dd>" + (c ? "•••• " + esc(c.key.slice(-4)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>LAST SYNC</dt><dd class=\"tnum\">" + (st.at ? esc(stamp(st.at)) : '<span class="muted">Never</span>') + "</dd>" +
      "</dl><div class=\"btnrow\" style=\"margin-top:14px\">" +
      (c ? refreshBtn() +
        '<button type="button" class="btn ghost" data-act="disconnect">' + (Date.now() - state.disarmAt < 4000 ? "TAP AGAIN TO UNLINK" : "UNLINK") + "</button>"
        : '<button type="button" class="btn capture" data-act="setup">LINK CALENDARS</button>') +
      "</div></section>";

    html += netSection();
    html += "<section>" + phead("CALENDARS", canCreate() ? "WORK READ-ONLY · " + WRITABLE.map(function (k) { return AREAS[k].name; }).join(" + ") + (WRITABLE.length > 1 ? " TAKE" : " TAKES") + " CAPTURES" : "READ-ONLY");
    LIVE.forEach(function (k) {
      var cs = calStatus(k);
      html += '<div class="calrow a-' + k + '"><span class="st"></span><span><b>' + AREAS[k].name + "</b><small>" +
        (cs ? (cs.ok ? esc(cs.name) : calHelp(cs)) : "Status appears after the first sync.") + "</small></span>" +
        (cs ? (cs.ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">' + (cs.error === "not_configured" ? "NOT SET" : "NOT FOUND") + "</span>") : '<span class="pill">UNKNOWN</span>') + "</div>";
    });
    STANDBY_AREAS.forEach(function (k) {
      html += '<div class="calrow a-' + k + '" style="opacity:.5"><span class="st"></span><span><b>' + AREAS[k].name +
        "</b><small>Separate calendar, linked in a later stage.</small></span><span class=\"pill\">STANDBY</span></div>";
    });
    var nIgn = ignoredCount();
    html += '<label class="ov-sub" for="ignIn">IGNORED EVENTS</label>' +
      '<textarea id="ignIn" rows="3" placeholder="One title per line. Any event whose title contains it is left out of every view, count and total.">' + esc(ignoreList.join("\n")) + "</textarea>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="ignsave">SAVE IGNORED</button></div>' +
      '<small class="muted">' + (ignoreList.length ? nIgn + (nIgn === 1 ? " event" : " events") + " left out of the loaded calendars. " : "") +
      "Quickest way to add one: tap the event, then IGNORE THIS TITLE. Saved on this iPad; your calendars are not changed.</small>";
    html += "</section>";

    html += aiSection();
    html += ledgerSection();
    html += logSection();
    html += standbySection();
    html += bridgeSection();
    html += captureSection();
    html += notionSection();
    html += "<section>" + phead("STANDBY MODULES", "NOT ACTIVE YET") + '<div class="stublist">' +
      STANDBY_MODULES.map(function (m) { return '<div class="stubbox"><span><b style="color:var(--fg)">' + m[0] + "</b><br>" + m[1] + "</span></div>"; }).join("") + "</div></section>";

    html += "<section>" + phead("APP", "", "chrome-d") + '<dl class="kv"><dt>APP VERSION</dt><dd class="tnum">' + VERSION + "</dd>" +
      "<dt>BRIDGE VERSION</dt><dd class=\"tnum\">" + (state.bridgeVersion ? esc(state.bridgeVersion) : '<span class="muted">Unknown</span>') + "</dd>" +
      "<dt>RUNNING AS</dt><dd>" + (standalone ? "Home screen app" : "Browser tab. In Safari, tap Share, then Add to Home Screen.") + "</dd>" +
      "</dl></section></div>";
    $("content").innerHTML = html;
  }

  /* Recent bridge requests: how long each took and how it ended. */
  /* REFRESH NOW spins until every request it set off (and any retries) has finished, then says so. */
  var refreshing = false, refreshTimer = null, refreshDone = false;
  function refreshBtn() {
    return '<button type="button" class="btn' + (refreshing ? " busy" : refreshDone ? " done" : "") + '" id="refreshBtn" data-act="refresh"' + (refreshing ? ' aria-busy="true" disabled' : "") + ">" +
      (refreshing ? '<span class="spin" aria-hidden="true"></span>REFRESHING…' : refreshDone ? "SYNCED ✓" : "REFRESH NOW") + "</button>";
  }
  function paintRefresh() { var b = $("refreshBtn"); if (b) b.outerHTML = refreshBtn(); }
  function refreshNow() {
    if (refreshing) return;
    refreshing = true; refreshDone = false;
    refresh(true);
    paintRefresh();
    clearInterval(refreshTimer);
    var ticks = 0;
    refreshTimer = setInterval(function () {
      if (++ticks < 3 || netPending > 0 || batchQ) return;   /* at least ¾ s, so a quick answer still registers */
      clearInterval(refreshTimer); refreshing = false; refreshDone = true;
      paintRefresh();
      setTimeout(function () { refreshDone = false; paintRefresh(); }, 1600);
    }, 250);
  }
  function netSection() {
    if (!state.conn || !netlog.length) return "";
    var hour = netlog.filter(function (n) { return Date.now() - n.t < 3600000; }), bad = hour.filter(function (n) { return n.r !== "ok" && !n.retried; }), again = hour.filter(function (n) { return n.retried; });
    var slow = netlog.filter(function (n) { return n.r === "ok"; }).map(function (n) { return n.ms; }).sort(function (a, b) { return a - b; });
    var median = slow.length ? (slow[Math.floor(slow.length / 2)] / 1000).toFixed(1) + " s" : "–";
    return "<section>" + phead("RECENT REQUESTS", hour.length ? hour.length + " IN THE LAST HOUR · " + (bad.length ? bad.length + " FAILED" : "NONE FAILED") + (again.length ? " · " + again.length + " RETRIED" : "") + " · TYPICAL " + median : "TYPICAL " + median) +
      '<div class="netlog tnum">' + netlog.slice(-12).reverse().map(function (n) {
        return '<span>' + hm(new Date(n.t)) + "</span><span>" + esc(String(n.a).toUpperCase()) + "</span><span>" + (n.ms / 1000).toFixed(1) + " s</span>" +
          '<span class="' + (n.r === "ok" ? "okmsg" : n.retried ? "warntxt" : "errtxt") + '">' + esc(n.r === "ok" ? "OK" : n.r.toUpperCase() + (n.retried ? " · RETRIED" : "")) + "</span>";
      }).join("") + '</div><small class="muted">RETRIED: that attempt failed and was tried again on its own; the next line for it shows how it ended. HTTP_404: Google ran the request but lost the answer on the way back, a known Google quirk. DROPPED: the connection was cut. TIMEOUT: no answer in 45 s. IN BACKGROUND: the iPad slept or switched apps mid-request. SYNC: several reads sent together as one request. Only red lines are real failures.</small></section>';
  }

  /* ---------- First-run link ---------- */
  function renderConnect() {
    var html = '<div class="connect">' + phead("CALENDAR BRIDGE", "ONE-TIME SETUP") +
      "<ol><li>Create the Apps Script bridge and run <b>setup</b>. Copy the access key from the log.</li>" +
      "<li>Deploy it as a web app (execute as you, access: Anyone). Copy the URL ending in <b>/exec</b>.</li>" +
      "<li>Paste both below. Full steps are in the README.</li></ol>" +
      '<form id="connForm" class="connect" autocomplete="off" novalidate>' +
      '<div><label for="connUrl">WEB APP URL</label><input type="url" id="connUrl" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div><label for="connKey">ACCESS KEY</label><input type="text" id="connKey" placeholder="64 characters from the setup log" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div class="err" id="connErr" role="alert"></div>' +
      '<div class="btnrow"><button type="submit" class="btn capture" id="connBtn">LINK</button></div></form></div>';
    $("content").innerHTML = html;
  }
  function submitConnect() {
    var url = $("connUrl").value.trim(), key = $("connKey").value.trim().replace(/\s+/g, ""), err = $("connErr");
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { err.textContent = "The URL should start with https://script.google.com/ and end in /exec."; return; }
    if (key.length < 20) { err.textContent = "That key looks too short. Copy the whole line from the setup log."; return; }
    err.textContent = "";
    var btn = $("connBtn");
    btn.disabled = true;
    btn.textContent = "CHECKING…";
    var conn = { url: url, key: key };
    api({ action: "ping" }, conn).then(function (j) {
      state.conn = conn;
      lsSet(LS_CONN, conn);
      state.calendars = j.calendars || [];
      state.bridgeVersion = j.version || null;
      state.caps = j.capabilities || [];
      persist();
      var bad = state.calendars.filter(function (c) { return !c.ok; });
      toast(bad.length ? "Linked. One calendar needs attention, see Systems." : "Linked. Loading your calendars.");
      go(lsGet(LS_START) === "today" ? "today" : "bridge", sod(new Date()));
    }).catch(function (e) {
      err.textContent = describe(e);
      btn.disabled = false;
      btn.textContent = "LINK";
    });
  }

  /* ---------- Detail sheet ---------- */
  function openDetail(ev) {
    norm(ev);
    var when;
    if (ev.allDay) {
      var s = parseYmd(ev.start), last = addDays(parseYmd(ev.end), -1);
      when = "All day · " + dLabel(s) + (sameDay(s, last) ? "" : " to " + dLabel(last));
    } else {
      when = dLabel(ev._s) + " · " + hm(ev._s) + " to " + (sameDay(ev._s, ev._e) ? "" : dLabel(ev._e) + " ") + hm(ev._e);
    }
    $("detailSheet").className = "sheet a-" + ev.area;
    $("detailSheet").style.setProperty("--c", "var(--" + ev.area + ")");
    var q = ev.pending ? queueItem(ev.cid) : null;
    $("detailSheet").innerHTML = '<div class="sbar"><span>' + AREAS[ev.area].name + "</span><span>" +
      (q ? (q.failed ? "NOT SAVED" : "WAITING TO SAVE") : ev.area === "work" ? "READ-ONLY" : "VIEW ONLY") + "</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + esc(ev.title) + '</h3><div class="tnum">' + esc(when) + "</div>" +
      (ev.location ? '<div class="muted">' + esc(ev.location) + "</div>" : "") +
      (ev.busy ? '<div class="muted">Details are hidden. This calendar is shared as free/busy only, or the event is private.</div>' : "") +
      (q ? '<div class="' + (q.failed ? "err" : "muted") + '">' + (q.failed ? esc(q.lastError || "Not saved.") :
        "Captured on this iPad. It saves to your Personal calendar as soon as Google answers.") + "</div>" : "") +
      '</div><div class="sfoot btnrow">' +
      (q ? (q.failed ? '<button type="button" class="btn" data-qretry="' + esc(q.cid) + '">RETRY</button>' : "") +
        '<button type="button" class="btn ghost" data-qdiscard="' + esc(q.cid) + '">DISCARD</button>' : "") +
      (!q && !ev.busy ? '<button type="button" class="btn ghost" data-ignore="' + esc(ev.title) + '">IGNORE THIS TITLE</button>' : "") +
      '<button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("detailClose").focus();
  }
  function closeDetail() { hideSheet("detailScrim"); }


  /* ---------- Capture ---------- */
  var WRITABLE = ["personal"];              /* Work is never offered */
  var RETRYABLE = { bad_json: 1, server_error: 1, bad_response: 1, http_404: 1 };
  var DURS = [["0.25", "15 MIN"], ["0.5", "30 MIN"], ["1", "1 HR"], ["2", "2 HR"], ["all", "ALL DAY"]];
  var capPrefs = lsGet(LS_CAPPREFS) || { dur: "1" };
  var cap = null;

  function canCreate() { return state.caps.indexOf("create") > -1; }
  function areaName(k) { return AREAS[k].name.charAt(0) + AREAS[k].name.slice(1).toLowerCase(); }
  function queued() { return state.queue.filter(function (q) { return !q.failed; }); }
  function queueItem(cid) { return state.queue.filter(function (q) { return q.cid === cid; })[0]; }
  function saveQueue() { lsSet(LS_QUEUE, state.queue); }
  function newCid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (v, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return p2(b.toString(16)); }).join("");
  }
  function whenLabel(q) {
    if (q.kind === "date") return dLabel(parseYmd(q.start)) + (q.end ? " TO " + dLabel(parseYmd(q.end)) : "") + " · KEY DATE";
    if (q.allDay) return dLabel(parseYmd(q.start)) + " · ALL DAY";
    var s = new Date(q.start);
    return dLabel(s) + " " + hm(s);
  }
  /* Captures still on this iPad, drawn on the calendar as dashed blocks. */
  function pendingEvents() {
    return state.queue.filter(function (q) { return q.kind !== "date"; }).map(function (q) {
      return { id: "pending:" + q.cid, cid: q.cid, area: q.area, title: q.title, allDay: !!q.allDay, start: q.start, end: q.end, location: "",
        pending: q.failed ? "failed" : q.attempts ? "queued" : "saving" };
    });
  }
  function pendingCls(ev) { return ev.pending ? " pending" + (ev.pending === "failed" ? " failed" : "") : ""; }
  function pendingTag(ev) { return ev.pending ? " · " + { saving: "SAVING", queued: "QUEUED", failed: "NOT SAVED" }[ev.pending] : ""; }
  /* Put a confirmed event into the cached ranges so it shows before the next sync. */
  function addConfirmed(ev) {
    var at = ev.allDay ? parseYmd(ev.start).getTime() : Date.parse(ev.start);
    Object.keys(state.ranges).forEach(function (k) {
      var r = state.ranges[k];
      if (at >= r.from && at < r.to && !r.events.some(function (x) { return x.id === ev.id; })) r.events.push(ev);
    });
    persist();
  }
  function describeCapture(err) {
    var code = err && (err.code || err.message);
    return {
      not_writable: "That calendar is read-only.",
      bad_title: "The title is empty or longer than 200 characters.",
      bad_time: "The bridge only accepts times from 2 days ago to about a year ahead.",
      bad_request: "The bridge couldn't read this capture.",
      unauthorized: "The access key was rejected. Re-link in Systems.",
      unknown_action: "The bridge needs an update before it can save this. See Systems.",
      retries: "Google kept failing after " + MAX_ATTEMPTS + " tries."
    }[code] || describe(err);
  }

  /* A capture whose reply was lost may already be saved. Before resending,
     look for it in what we already loaded; if it's there, it's done. */
  function norm1(t) { return String(t || "").trim().toLowerCase(); }
  function alreadySaved(q) {
    if (q.kind === "date") {
      return !!(state.dates && state.dates.dates.some(function (d) {
        return norm1(d.title) === norm1(q.title) && d.start === q.start && (d.end || null) === (q.end || null);
      }));
    }
    var at = q.allDay ? q.start : Date.parse(q.start);
    return Object.keys(state.ranges).some(function (k) {
      return state.ranges[k].events.some(function (ev) {
        return ev.area === q.area && norm1(ev.title) === norm1(q.title) && (q.allDay ? ev.allDay && ev.start === at : !ev.allDay && Date.parse(ev.start) === at);
      });
    });
  }
  function reconcileQueue() {
    var done = state.queue.filter(function (q) { return (q.attempts || q.failed) && alreadySaved(q); });
    if (!done.length) return;
    state.queue = state.queue.filter(function (q) { return done.indexOf(q) === -1; });
    saveQueue();
    toast(done.length === 1 ? "\"" + done[0].title + "\" was already saved. Cleared from the queue." : done.length + " queued items were already saved. Cleared.");
    render(true);
  }

  /* Send queued captures one at a time. Network trouble and temporary Google
     errors keep the item queued; anything else marks it NOT SAVED. */
  function flushQueue(announce) {
    if (!state.conn || state.flushing) return;
    reconcileQueue();
    var next = queued().filter(function (q) { return q.kind === "date" ? canDates() : canCreate(); })[0];
    if (!next) return;
    state.flushing = true;
    var req = next.kind === "date"
      ? { action: "adddate", date: { cid: next.cid, title: next.title, start: next.start, end: next.end || null, area: next.area || null, type: next.type || null, yearly: !!next.yearly } }
      : { action: "create", item: { cid: next.cid, area: next.area, title: next.title, allDay: !!next.allDay, start: next.start, end: next.end } };
    apiPost(req)
      .then(function (j) {
        state.flushing = false;
        state.queue = state.queue.filter(function (q) { return q.cid !== next.cid; });
        saveQueue();
        if (j.event) addConfirmed(j.event);
        if (j.date) addKeyDate(j.date);
        if (announce) toast(next.kind === "date" ? "Key date saved to Notion · " + whenLabel(next) : "Saved to " + areaName(next.area) + " · " + whenLabel(next));
        render(true);
        if (queued().length) flushQueue(announce); else if (next.kind !== "date") refresh(true);
      })
      .catch(function (err) {
        state.flushing = false;
        var code = err && err.code;
        next.attempts = (next.attempts || 0) + 1;
        if ((isNetworkError(err) || RETRYABLE[code] || /^http_5/.test(code || "")) && next.attempts < MAX_ATTEMPTS) {
          next.lastError = describeCapture(err);
          saveQueue();
          if (announce) toast(isNetworkError(err) || navigator.onLine === false ? "Queued. It saves when you're back online." : "Google didn't answer. Queued to retry.");
          render(true);
          return;
        }
        next.failed = isNetworkError(err) || RETRYABLE[code] ? "retries" : code || "error";
        next.lastError = describeCapture(next.failed === "retries" ? { code: "retries" } : err);
        saveQueue();
        toast("Not saved: " + next.lastError);
        render(true);
        flushQueue(false);
      });
  }
  function retryCapture(cid) {
    var q = queueItem(cid);
    if (!q) return;
    delete q.failed; q.attempts = 0; q.lastError = "";
    saveQueue(); render(true); flushQueue(true);
  }
  function discardCapture(cid) {
    state.queue = state.queue.filter(function (q) { return q.cid !== cid; });
    saveQueue(); render(true);
    toast("Discarded. Nothing was saved.");
  }

  function captureSection() {
    var html = "<section>" + phead("CAPTURE", canCreate() ? "SAVES TO PERSONAL" : "BRIDGE UPDATE NEEDED");
    if (!canCreate()) {
      html += '<div class="stubbox"><span class="pill">UPDATE</span><span>Your bridge is version ' + esc(state.bridgeVersion || "1.0") +
        ". Capture needs bridge 1.1: paste the latest Code.gs, run <b>setup</b>, then deploy a new version. Steps are in the README.</span></div>";
    }
    if (!state.queue.length) html += '<div class="empty">Nothing waiting. Every capture has been saved.</div>';
    state.queue.forEach(function (q) {
      html += '<div class="calrow a-' + (q.kind === "date" ? taskArea(q.area) : q.area) + '"><span class="st"></span><span><b>' + esc(q.title) + '</b><small class="tnum">' + esc(whenLabel(q)) + " · " +
        (q.failed ? '<span class="errtxt">' + esc(q.lastError || "Not saved") + "</span>" : q.attempts ? "Queued, " + q.attempts + (q.attempts === 1 ? " try" : " tries") + (q.lastError ? '</small><small class="errtxt">Last reply: ' + esc(q.lastError) : "") : "Saving") +
        '</small></span><span class="btnrow">' + (q.failed ? '<button type="button" class="chip" data-qretry="' + esc(q.cid) + '">RETRY</button>' : "") +
        '<button type="button" class="chip" data-qdiscard="' + esc(q.cid) + '">DISCARD</button></span></div>';
    });
    if (queued().length && canCreate()) html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn" data-act="flush">SEND NOW</button></div>';
    return html + "</section>";
  }

  /* --- the sheet --- */
  function openCapture(day, hour, type) {
    if (!state.conn) return;
    var now = new Date(), d = sod(day || (state.screen === "today" ? state.anchor : now)), h;
    if (typeof hour === "number") h = hour;
    else if (sameDay(d, now)) h = Math.min(23.75, Math.ceil((now.getHours() + now.getMinutes() / 60) * 2) / 2);
    else h = 9;
    cap = { day: d, hour: h, dur: capPrefs.dur || "1", type: type === "date" && canDates() ? "date" : "event", yearly: false, area: capPrefs.area || "personal" };
    $("capText").value = "";
    $("capUntil").value = "";
    fillDateSelects();
    $("capErr").textContent = "";
    renderCapture();
    showSheet("capScrim");
    setTimeout(function () { $("capText").focus(); }, 60);
  }
  function closeCapture() { hideSheet("capScrim"); cap = null; }
  function renderCapture() {
    var now = new Date(), allDay = cap.dur === "all", notes = [], isDate = cap.type === "date";
    setAreas();
    if (WRITABLE.indexOf(cap.area) === -1) cap.area = "personal";
    $("capMode").textContent = navigator.onLine === false ? "OFFLINE · WILL QUEUE" : isDate ? "NOTION · KEY DATES" : AREAS[cap.area].name + " CALENDAR";
    $("capForm").style.setProperty("--c", isDate ? "var(--chrome-b)" : "var(--" + cap.area + ")");
    document.querySelectorAll("[data-carea]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.carea === cap.area)); });
    var fb = $("capFarm"), farmOn = WRITABLE.indexOf("farm") > -1;
    fb.disabled = !farmOn;
    fb.innerHTML = esc(AREAS.farm.name) + (farmOn ? "" : "<small>STANDBY</small>");
    document.querySelectorAll("[data-ctype]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ctype === cap.type)); });
    $("capTypeDate").disabled = !canDates();
    $("capTypeDate").innerHTML = "KEY DATE" + (canDates() ? "" : "<small>SETUP</small>");
    $("capAreaRow").hidden = isDate; $("capTimeRow").hidden = isDate;
    $("capKdRow").hidden = !isDate; $("capUntilRow").hidden = !isDate;
    $("capYearly").setAttribute("aria-pressed", String(!!cap.yearly));
    $("capText").placeholder = isDate ? "What's the date? e.g. First frost risk" : "What goes in? e.g. Pick up bee feeder";
    $("capFootText").textContent = isDate ? "Saves to Key Dates in Notion." : "Saves to your " + areaName(cap.area) + " Google Calendar. Work is read-only.";
    if (!isDate && !canCreate()) notes.push("Your bridge needs the 1.1 update before events can be saved. See Systems.");
    if (!isDate && state.hidden[cap.area]) notes.push(areaName(cap.area) + " is hidden. New events save, but stay hidden until you tap " + areaName(cap.area) + " on Today.");
    $("capNote").hidden = !notes.length;
    $("capNote").textContent = notes.join(" ");
    $("capSave").disabled = isDate ? !canDates() : !canCreate();
    var today = sod(now), tomorrow = addDays(today, 1);
    document.querySelectorAll("[data-capday]").forEach(function (b) {
      var target = b.dataset.capday === "today" ? today : tomorrow;
      b.setAttribute("aria-pressed", String(sameDay(cap.day, target)));
    });
    $("capDate").value = ymd(cap.day);
    $("capTime").value = String(cap.hour);
    $("capTime").hidden = allDay;
    document.querySelectorAll("[data-dur]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.dur === cap.dur)); });
  }
  function submitCapture() {
    var title = $("capText").value.trim(), err = $("capErr");
    if (!title) { err.textContent = "Type what you want to add first."; $("capText").focus(); return; }
    if (cap.type === "date") {
      if (!canDates()) return;
      var until = $("capUntil").value;
      if (until && until < ymd(cap.day)) { err.textContent = "The end date is before the start date."; return; }
      capPrefs.kdArea = $("capLifeArea").value; capPrefs.kdType = $("capKdType").value; lsSet(LS_CAPPREFS, capPrefs);
      state.queue.push({ kind: "date", cid: newCid(), title: title.slice(0, 200), start: ymd(cap.day), end: until && until !== ymd(cap.day) ? until : null,
        area: $("capLifeArea").value || null, type: $("capKdType").value || null, yearly: !!cap.yearly, created: Date.now(), attempts: 0 });
      saveQueue(); closeCapture(); render(true); flushQueue(true);
      return;
    }
    if (!canCreate()) return;
    var item = { cid: newCid(), area: WRITABLE.indexOf(cap.area) > -1 ? cap.area : "personal", title: title.slice(0, 200), created: Date.now(), attempts: 0 };
    if (cap.dur === "all") {
      item.allDay = true; item.start = ymd(cap.day); item.end = ymd(addDays(cap.day, 1));
    } else {
      var s = new Date(cap.day);
      s.setHours(Math.floor(cap.hour), Math.round((cap.hour % 1) * 60), 0, 0);
      if (s.getTime() < Date.now() - 2 * 86400000) { err.textContent = "That's more than 2 days ago. Pick a later day."; return; }
      item.allDay = false; item.start = s.toISOString(); item.end = new Date(s.getTime() + Number(cap.dur) * 3600000).toISOString();
    }
    state.queue.push(item);
    saveQueue();
    closeCapture();
    render(true);
    flushQueue(true);
  }
  /* Tap an empty spot on the Day or Week timeline to capture at that time. */
  function tapToCapture(e) {
    if (!state.conn) return;
    var tl = e.target.closest(".tl"), col = e.target.closest(".wkcol"), host = tl || col, sc = tl ? state.dayScale : state.weekScale;
    if (!host || !sc) return;
    var y = e.clientY - host.getBoundingClientRect().top;
    var hour = Math.max(0, Math.min(23.75, Math.floor(sc.hourAt(y) * 4) / 4));
    openCapture(col ? parseYmd(col.dataset.ymd) : state.anchor, hour);
  }
  (function buildCaptureSheet() {
    var t = "";
    for (var q = 0; q < 96; q++) t += '<option value="' + q / 4 + '">' + p2(Math.floor(q / 4)) + ":" + p2((q % 4) * 15) + "</option>";
    $("capTime").innerHTML = t;
    $("capDurs").innerHTML = DURS.map(function (d) { return '<button type="button" class="chip" data-dur="' + d[0] + '">' + d[1] + "</button>"; }).join("");
  })();
  $("capBtn").addEventListener("click", function () { openCapture(); });
  $("capCancel").addEventListener("click", closeCapture);
  $("capForm").addEventListener("submit", function (e) { e.preventDefault(); submitCapture(); });
  $("capScrim").addEventListener("click", function (e) {
    if (e.target === $("capScrim")) { closeCapture(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled || !cap) return;
    if (b.dataset.ctype) { cap.type = b.dataset.ctype; renderCapture(); $("capText").focus(); }
    else if (b.id === "capYearly") { cap.yearly = !cap.yearly; renderCapture(); }
    else if (b.dataset.capday) { cap.day = b.dataset.capday === "today" ? sod(new Date()) : addDays(sod(new Date()), 1); renderCapture(); }
    else if (b.dataset.dur) { cap.dur = b.dataset.dur; capPrefs.dur = cap.dur; lsSet(LS_CAPPREFS, capPrefs); renderCapture(); }
    else if (b.dataset.carea) { cap.area = b.dataset.carea; capPrefs.area = cap.area; lsSet(LS_CAPPREFS, capPrefs); renderCapture(); }
  });
  $("capDate").addEventListener("change", function () { if (cap && /^\d{4}-\d{2}-\d{2}$/.test(this.value)) { cap.day = parseYmd(this.value); renderCapture(); } });
  $("capTime").addEventListener("change", function () { if (cap) cap.hour = Number(this.value); });
  $("capForm").addEventListener("input", function () { $("capErr").textContent = ""; });
  $("capForm").addEventListener("change", function () { $("capErr").textContent = ""; });



  /* ---------- Key Dates (Notion) ---------- */
  var DATES_FRESH_MS = 5 * 60 * 1000;
  function canDates() { return state.caps.indexOf("dates") > -1; }
  function loadDates(force) {
    if (!state.conn || !canDates() || state.datesInflight) return;
    if (!force && state.dates && Date.now() - state.dates.fetched < DATES_FRESH_MS) return;
    if (!force && state.datesErr && Date.now() - state.datesErr.at < FRESH_MS) return;
    state.datesInflight = true;
    api({ action: "dates" }).then(function (j) {
      state.dates = { fetched: Date.now(), dates: j.dates || [], areas: j.areas || [], types: j.types || [] };
      state.datesErr = null;
      lsSet(LS_DATES, state.dates);
      reconcileQueue();
    }).catch(function (err) {
      state.datesErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.datesInflight = false;
      if (["bridge", "today", "week", "month", "dates", "systems", "loom"].indexOf(state.screen) > -1) render(true);
    });
  }
  function addKeyDate(d) {
    if (!state.dates) state.dates = { fetched: 0, dates: [], areas: [], types: [] };
    if (!state.dates.dates.some(function (x) { return x.id === d.id; })) state.dates.dates.push(d);
    lsSet(LS_DATES, state.dates);
  }
  function leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function shiftYear(s, by) {
    var y = +s.slice(0, 4) + by, m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (m === 2 && d === 29 && !leap(y)) d = 28;
    return y + "-" + p2(m) + "-" + p2(d);
  }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  /* Every occurrence overlapping [from, to] (yyyy-mm-dd, inclusive). Yearly dates repeat. */
  function occurrences(from, to) {
    var out = [], fy = +from.slice(0, 4), ty = +to.slice(0, 4);
    ((state.dates && state.dates.dates) || []).forEach(function (d) {
      var s = d.start, e = d.end || d.start;
      var add = function (os, oe) { if (os <= to && oe >= from) { var o = { d: d, s: os, e: oe, id: d.id + "@" + os }; state.index["kd:" + o.id] = o; out.push(o); } };
      if (!d.yearly) { add(s, e); return; }
      for (var y = fy - 1; y <= ty; y++) add(shiftYear(s, y - +s.slice(0, 4)), shiftYear(e, y - +s.slice(0, 4)));
    });
    return out.sort(function (a, b) { return a.s.localeCompare(b.s) || a.d.title.localeCompare(b.d.title); });
  }
  function countdown(o, ref) {
    if (o.s > ref) { var n = daysBetween(ref, o.s); return n === 1 ? "TOMORROW" : "IN " + n + " D"; }
    if (o.s === ref) return o.e > ref ? "STARTS TODAY" : "TODAY";
    if (o.e >= ref) return o.e === ref ? "ENDS TODAY" : daysBetween(ref, o.e) + " D LEFT";
    return "PAST";
  }
  function soon(o, ref) { return o.s <= ref || daysBetween(ref, o.s) <= 7; }
  function shortDay(s) { var d = parseYmd(s); return p2(d.getDate()) + " " + MON[d.getMonth()]; }
  function rangeLabel(o) { return o.e !== o.s ? shortDay(o.s) + " TO " + shortDay(o.e) : shortDay(o.s); }
  /* Key dates to mark on one day: single dates, window starts and ends (and, if asked, days inside a window). */
  function kdMarks(day, inside) {
    if (!canDates() || !state.dates) return [];
    return occurrences(day, day).filter(function (o) { return o.s === day || o.e === day || inside; }).map(function (o) {
      var tag = "";
      if (o.e !== o.s) tag = o.s === day ? "STARTS" : o.e === day ? "ENDS" : "DAY " + (daysBetween(o.s, day) + 1) + " OF " + (daysBetween(o.s, o.e) + 1);
      return { o: o, tag: tag };
    });
  }
  function kdRow(o, ref) {
    var d = o.d, meta = [bare(d.type), bare(d.area), d.yearly ? "YEARLY" : ""].filter(Boolean).map(esc).join(" · ");
    return '<button type="button" class="kd a-' + taskArea(d.area) + '" data-kd="' + esc(o.id) + '"><span class="st"></span>' +
      '<span class="dt tnum">' + rangeLabel(o) + '</span><span class="tt"><b>' + esc(d.title) + "</b>" + (meta ? "<small>" + meta + "</small>" : "") + "</span>" +
      '<span class="pill tnum' + (soon(o, ref) ? " soon" : "") + '">' + countdown(o, ref) + "</span></button>";
  }
  function keyDatesPanel(day) {
    if (!canDates()) return phead("KEY DATES", "") + stubBox(state.conn ? "Needs bridge 1.3 and the Key Dates database connected in Notion. Steps are in the README." : "Link calendars first.");
    if (!state.dates) return phead("KEY DATES", "") + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div>";
    var list = occurrences(day, ymd(addDays(parseYmd(day), 30)));
    var html = phead("KEY DATES", "NEXT 30 DAYS");
    if (!list.length) html += '<div class="empty">Nothing in the next 30 days.</div>';
    list.slice(0, 5).forEach(function (o) { html += kdRow(o, day); });
    if (list.length > 5) html += '<div class="muted" style="font-size:14px;margin-top:6px">+' + (list.length - 5) + " more in the next 30 days</div>";
    html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="dates">ALL KEY DATES</button>' +
      '<button type="button" class="btn" data-act="adddate">+ ADD</button></div>';
    if (state.datesErr) html += stale(state.dates.fetched);
    return html;
  }
  function renderDatesScreen() {
    loadDates(false);
    var html = '<div class="kdscreen">';
    if (!canDates()) {
      $("content").innerHTML = html + phead("KEY DATES", "SETUP") + stubBox("Needs bridge 1.3 and the Key Dates database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Key Dates</b>.") + "</div>";
      return;
    }
    var today = ymd(new Date()), end = ymd(addDays(new Date(), 365)), f = state.kdFilter;
    var areas = [["", "ALL"], ["work", "WORK"], ["personal", "PERSONAL"], ["farm", AREAS.farm.name], ["hobby", "HOBBIES"]];
    html += '<div class="kdtools"><div class="chips">' + areas.map(function (a) {
      return '<button type="button" class="chip' + (a[0] ? " a-" + a[0] : "") + '" data-kdf="' + a[0] + '" aria-pressed="' + ((f || "") === a[0]) + '">' + a[1] + "</button>";
    }).join("") + '</div><button type="button" class="btn" data-act="adddate">+ ADD KEY DATE</button></div>';
    if (!state.dates) { $("content").innerHTML = html + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div></div>"; return; }
    var list = occurrences(today, end).filter(function (o) { return !f || taskArea(o.d.area) === f; });
    var now = list.filter(function (o) { return o.s < today; }), later = list.filter(function (o) { return o.s >= today; });
    if (now.length) html += '<div class="dgroup">' + phead("HAPPENING NOW", now.length + (now.length === 1 ? " WINDOW" : " WINDOWS")) + now.map(function (o) { return kdRow(o, today); }).join("") + "</div>";
    var byMonth = {};
    later.forEach(function (o) { var k = o.s.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(o); });
    Object.keys(byMonth).sort().forEach(function (k) {
      var g = byMonth[k], d = parseYmd(k + "-01");
      html += '<div class="dgroup">' + phead(MONL[d.getMonth()] + " " + d.getFullYear(), g.length + (g.length === 1 ? " DATE" : " DATES")) + g.map(function (o) { return kdRow(o, today); }).join("") + "</div>";
    });
    if (!list.length) html += '<div class="empty" style="margin-top:20px">' + (f ? "No key dates in this area for the next 12 months." : "No key dates yet. Tap + ADD KEY DATE, or add them in Notion.") + "</div>";
    html += '<div class="muted" style="margin-top:22px;font-size:14px">Past dates stay in Notion. Edit or delete key dates there.</div>';
    if (state.datesErr) html += stale(state.dates.fetched);
    $("content").innerHTML = html + "</div>";
  }
  function openKeyDate(o) {
    var d = o.d, ref = ymd(new Date());
    var when = o.e !== o.s ? dLabel(parseYmd(o.s)) + " TO " + dLabel(parseYmd(o.e)) : dLabel(parseYmd(o.s));
    $("detailSheet").className = "sheet a-" + taskArea(d.area);
    $("detailSheet").style.setProperty("--c", "var(--" + taskArea(d.area) + ")");
    $("detailSheet").innerHTML = '<div class="sbar"><span>◆ KEY DATE</span><span>' + esc(bare(d.type)) + "</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + esc(d.title) + '</h3><div class="tnum">' + esc(when) + " · " + countdown(o, ref) + "</div>" +
      '<div class="muted">' + [bare(d.area), d.yearly ? "Repeats every year" : ""].filter(Boolean).map(esc).join(" · ") + "</div>" +
      (d.notes ? "<div>" + esc(d.notes) + "</div>" : "") +
      '</div><div class="sfoot btnrow">' + (d.url ? '<a class="btn ghost" href="' + esc(d.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") +
      '<button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("detailClose").focus();
  }
  function fillDateSelects() {
    var areas = (state.dates && state.dates.areas.length ? state.dates.areas : (state.tasks[ymd(new Date())] || {}).areas) || [];
    var types = (state.dates && state.dates.types) || [];
    $("capLifeArea").innerHTML = '<option value="">Life Area</option>' + areas.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("");
    $("capKdType").innerHTML = '<option value="">Type</option>' + types.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("");
    if (capPrefs.kdArea && areas.indexOf(capPrefs.kdArea) > -1) $("capLifeArea").value = capPrefs.kdArea;
    if (capPrefs.kdType && types.indexOf(capPrefs.kdType) > -1) $("capKdType").value = capPrefs.kdType;
  }

  /* ---------- Plan Day + Priorities (Notion Master Task List) ---------- */
  var DONE = "✅ Done", TODO = "⬜ To Do", INPROG = "🔄 In Progress", BLOCKED = "🚫 Blocked";
  var PRI_RANK = { "🔴 High": 0, "🟡 Medium": 1, "🟢 Low": 2 };
  var plan = null;

  function canPlan() { return state.caps.indexOf("tasks") > -1; }
  /* Map a Notion Life Area onto the four TimothyOS colors. */
  function taskArea(name) {
    if (!name) return "personal";
    if (/Work/i.test(name)) return "work";
    if (/Farm|Bee/i.test(name)) return "farm";
    if (/Growth|Creative|Hobb/i.test(name)) return "hobby";
    return "personal";
  }
  function dueLabel(due, day) {
    if (!due) return "";
    var n = Math.round((parseYmd(due) - parseYmd(day)) / 86400000);
    if (n < 0) return "OVERDUE " + -n + "D";
    if (n === 0) return "DUE TODAY";
    if (n === 1) return "DUE TOMORROW";
    return "DUE " + dLabel(parseYmd(due));
  }
  function taskMeta(t, day) {
    return [bare(t.priority), t.status === INPROG || t.status === BLOCKED ? bare(t.status) : "", bare(t.area), dueLabel(t.due, day)].filter(Boolean).map(esc).join(" · ");
  }
  function rankTasks(list) {
    return list.slice().sort(function (a, b) {
      var pa = PRI_RANK[a.priority] === undefined ? 3 : PRI_RANK[a.priority], pb = PRI_RANK[b.priority] === undefined ? 3 : PRI_RANK[b.priority];
      return (a.status === INPROG ? -1 : 0) - (b.status === INPROG ? -1 : 0) || pa - pb || (a.due || "9999").localeCompare(b.due || "9999");
    });
  }
  function saveTasks() {
    var days = Object.keys(state.tasks).sort().slice(-4), keep = {};
    days.forEach(function (d) { keep[d] = state.tasks[d]; });
    state.tasks = keep;
    lsSet(LS_TASKS, keep);
  }
  function describeTasks(err) {
    var code = err && (err.code || err.message);
    return {
      notion_not_configured: "Notion isn't set up yet. Add NOTION_TOKEN to the bridge's Script Properties.",
      notion_unauthorized: "Notion rejected the bridge's key. Check NOTION_TOKEN in Script Properties.",
      notion_not_shared: "The Master Task List isn't connected to the TimothyOS integration in Notion.",
      notion_busy: "Notion is busy. Try again in a moment.",
      not_writable: "That task isn't in your Master Task List."
    }[code] || describe(err);
  }

  function loadTasks(day, force) {
    if (!state.conn || !canPlan() || state.tasksInflight[day]) return;
    var have = state.tasks[day];
    if (!force && have && Date.now() - have.fetched < TASKS_FRESH_MS) return;
    if (!force && state.tasksErr && Date.now() - state.tasksErr.at < FRESH_MS) return;
    state.tasksInflight[day] = true;
    api({ action: "tasks", day: day }).then(function (j) {
      state.tasks[day] = { fetched: Date.now(), focus: j.focus || [], open: j.open || [], areas: j.areas || [], priorities: j.priorities || [] };
      state.tasksErr = null;
      saveTasks();
    }).catch(function (err) {
      state.tasksErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      delete state.tasksInflight[day];
      if (plan && plan.day === day) renderPlan();
      if (state.screen === "today" || state.screen === "bridge" || state.screen === "systems") render(true);
    });
  }

  function prioritiesPanel(day, isToday, extra) {
    if (!canPlan()) {
      return phead("PRIORITIES", "") + stubBox(state.conn ? "Needs the Notion link: bridge 1.2 and a Notion key. Steps are in the README." : "Link calendars first.");
    }
    var data = state.tasks[day], past = day < ymd(new Date());
    if (!data) {
      return phead("PRIORITIES", "") + '<div class="empty">' + (state.tasksErr ? esc(state.tasksErr.msg) : "Loading your Master Task List…") + "</div>";
    }
    var focus = data.focus.slice().sort(function (a, b) { return (a.status === DONE) - (b.status === DONE); });
    var done = focus.filter(function (t) { return t.status === DONE; }).length;
    var html = phead("PRIORITIES", focus.length ? done + " OF " + focus.length + " DONE" : "", null, extra);
    if (!focus.length) {
      html += '<div class="empty">' + (past ? "No priorities were picked for this day." : "No priorities picked yet.") + "</div>";
    }
    focus.forEach(function (t) {
      var isDone = t.status === DONE, busy = !!state.taskBusy[t.id];
      html += '<button type="button" class="prio a-' + taskArea(t.area) + (isDone ? " done" : "") + (busy ? " busy" : "") + '" data-task="' + esc(t.id) + '" data-day="' + day +
        '" aria-pressed="' + isDone + '" aria-label="' + esc(t.title) + (isDone ? ", done. Tap to reopen." : ". Tap to mark done.") + '">' +
        '<span class="box">' + (isDone ? "✓" : "") + '</span><span class="pt"><b>' + esc(t.title) + "</b><small>" + taskMeta(t, day) + "</small></span></button>";
    });
    if (!past) {
      html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn plan" data-act="plan" data-day="' + day + '">' +
        (focus.length ? "CHANGE PICKS" : "PLAN " + (isToday ? "TODAY" : dLabel(parseYmd(day)))) + "</button></div>";
    }
    if (state.tasksErr) html += stale(data.fetched);
    return html;
  }

  /* Tap a priority: Done in Notion, or back to its previous status. */
  function toggleDone(id, day) {
    var data = state.tasks[day];
    if (!data || state.taskBusy[id]) return;
    var t = data.focus.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var before = t.status, next = before === DONE ? (t._prev && t._prev !== DONE ? t._prev : TODO) : DONE;
    t._prev = before;
    t.status = next;
    state.taskBusy[id] = true;
    render(true);
    if (next === DONE) document.querySelectorAll('.prio[data-task="' + id + '"]').forEach(function (el) { restartClass(el, "justdone"); });
    apiPost({ action: "status", id: id, status: next }).then(function () {
      delete state.taskBusy[id];
      saveTasks();
      toast(next === DONE ? "Done. Marked Done in Notion." : "Reopened in Notion.");
      render(true);
    }).catch(function (err) {
      delete state.taskBusy[id];
      t.status = before;
      toast("Not changed: " + describeTasks(err));
      render(true);
    });
  }

  function notionSection() {
    var data = state.tasks[ymd(new Date())];
    var html = "<section>" + phead("NOTION", canPlan() ? "MASTER TASK LIST" : "NOT LINKED");
    if (!canPlan()) {
      html += '<div class="stubbox"><span class="pill">SETUP</span><span>Plan Day and Priorities need bridge 1.2 and a Notion key in its Script Properties. Steps are in the README under <b>Notion link</b>.</span></div>';
    } else if (state.tasksErr) {
      html += '<div class="calrow a-personal"><span class="st"></span><span><b>Master Task List</b><small class="errtxt">' + esc(state.tasksErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>';
    } else {
      html += '<div class="calrow a-personal"><span class="st"></span><span><b>Master Task List</b><small>' +
        (data ? data.open.length + " open tasks · " + data.focus.length + " picked for today · synced " + esc(stamp(data.fetched)) : "Not loaded yet") +
        '</small></span><span class="pill ok">OK</span></div>';
    }
    if (canBalance()) {
      html += state.doneErr
        ? '<div class="calrow a-hobby"><span class="st"></span><span><b>Balance</b><small class="errtxt">' + esc(state.doneErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>'
        : '<div class="calrow a-hobby"><span class="st"></span><span><b>Balance</b><small>' + (state.done ? state.done.done.length + " tasks finished in the last 30 days · synced " + esc(stamp(state.done.fetched)) : "Not loaded yet") +
          '</small></span><span class="pill ok">OK</span></div>';
    } else if (canPlan()) {
      html += '<div class="calrow a-hobby" style="opacity:.6"><span class="st"></span><span><b>Balance</b><small>Needs bridge 1.4. Steps are in the README under Bridge 1.4.</small></span><span class="pill">SETUP</span></div>';
    }
    if (canReviews()) {
      var lw = state.weeks[ymd(sow(new Date()))] || state.weeks[ymd(addDays(sow(new Date()), -7))];
      html += lw && lw.reviewsError
        ? '<div class="calrow a-personal"><span class="st"></span><span><b>Weekly Reviews</b><small class="errtxt">' + (lw.reviewsError === "notion_not_shared" ? "Not connected. In Notion: Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: lw.reviewsError }))) + '</small></span><span class="pill bad">SETUP</span></div>'
        : '<div class="calrow a-personal"><span class="st"></span><span><b>Weekly Reviews</b><small>' + Object.keys(savedWeeks).length + " saved from this iPad · open REVIEW to write this week's</small></span><span class=\"pill ok\">OK</span></div>";
    } else if (canPlan()) {
      html += '<div class="calrow a-personal" style="opacity:.6"><span class="st"></span><span><b>Weekly Reviews</b><small>Needs bridge 1.5. Steps are in the README under Bridge 1.5.</small></span><span class="pill">SETUP</span></div>';
    }
    if (canDates()) {
      html += state.datesErr
        ? '<div class="calrow a-farm"><span class="st"></span><span><b>Key Dates</b><small class="errtxt">' + esc(state.datesErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>'
        : '<div class="calrow a-farm"><span class="st"></span><span><b>Key Dates</b><small>' + (state.dates ? state.dates.dates.length + " key dates · synced " + esc(stamp(state.dates.fetched)) : "Not loaded yet") +
          '</small></span><span class="pill ok">OK</span></div>';
    } else if (canPlan()) {
      html += '<div class="calrow a-farm" style="opacity:.6"><span class="st"></span><span><b>Key Dates</b><small>Needs bridge 1.3. Steps are in the README under Key Dates.</small></span><span class="pill">SETUP</span></div>';
    }
    return html + "</section>";
  }

  /* --- the Plan Day sheet --- */
  function openPlan(day) {
    if (!canPlan()) return;
    var d = ymd(day || (state.screen === "today" && ymd(state.anchor) >= ymd(new Date()) ? state.anchor : new Date()));
    var data = state.tasks[d];
    plan = { day: d, picks: {}, initial: {}, showAll: false, saving: false, err: "" };
    if (data) data.focus.forEach(function (t) { plan.picks[t.id] = true; plan.initial[t.id] = true; });
    plan.seeded = !!data;
    renderPlan();
    showSheet("planScrim");
    loadTasks(d, true);
  }
  function closePlan() { hideSheet("planScrim"); plan = null; }
  function openPicks() {
    var data = state.tasks[plan.day];
    if (!data) return 0;
    var all = data.open.concat(data.focus);
    return Object.keys(plan.picks).filter(function (id) {
      var t = all.filter(function (x) { return x.id === id; })[0];
      return t && t.status !== DONE;
    }).length;
  }
  function kdComing(day) {
    if (!canDates() || !state.dates) return "";
    var list = occurrences(day, ymd(addDays(parseYmd(day), 14))).slice(0, 3);
    return list.length ? '<div class="dayline kdline">◆ COMING UP: ' + list.map(function (o) { return esc(o.d.title) + " " + countdown(o, day); }).join(" · ") + "</div>" : "";
  }
  function dayContext(day) {
    var d = parseYmd(day), r = { from: sow(d), to: addDays(sow(d), 7) };
    var de = dayEvents(visible(eventsFor(r)), d), timed = de.timed;
    if (!hasData(r)) return "Calendar for this day isn't loaded yet.";
    var parts = [timed.length + (timed.length === 1 ? " EVENT" : " EVENTS")];
    if (timed.length) parts.push("FIRST " + hm(timed[0]._s) + " " + esc(timed[0].title).toUpperCase());
    /* longest open stretch between 07:00 and 21:00 */
    var d0 = sod(d), cursor = FOCUS_START, best = 0, bestAt = null;
    timed.forEach(function (ev) {
      var s = posInDay(ev._s, d0), e = posInDay(ev._e, d0);
      if (s > cursor && Math.min(s, FOCUS_END) - cursor > best) { best = Math.min(s, FOCUS_END) - cursor; bestAt = cursor; }
      cursor = Math.max(cursor, e);
    });
    if (FOCUS_END - cursor > best) { best = FOCUS_END - cursor; bestAt = cursor; }
    if (best >= 0.5) {
      var a = new Date(d0), b = new Date(d0);
      a.setMinutes(Math.round(bestAt * 60)); b.setMinutes(Math.round((bestAt + best) * 60));
      parts.push("LONGEST OPEN STRETCH " + hm(a) + " TO " + hm(b));
    }
    return parts.join(" · ");
  }
  function planRow(t, day) {
    var on = !!plan.picks[t.id], isDone = t.status === DONE;
    return '<button type="button" class="cand a-' + taskArea(t.area) + (isDone ? " isdone" : "") + '" data-pick="' + esc(t.id) + '" aria-pressed="' + on + '">' +
      '<span class="st"></span><span class="ct"><b>' + esc(t.title) + "</b><small>" + (isDone ? "DONE · " : "") + taskMeta(t, day) + "</small></span>" +
      '<span class="box">' + (on ? "✓" : "") + "</span></button>";
  }
  function renderPlan() {
    if (!plan) return;
    var day = plan.day, data = state.tasks[day], html;
    if (data && !plan.seeded) {
      data.focus.forEach(function (t) { plan.picks[t.id] = true; plan.initial[t.id] = true; });
      plan.seeded = true;
    }
    var title = sameDay(parseYmd(day), new Date()) ? "PLAN TODAY · " + dLabel(parseYmd(day)) : "PLAN " + dLabel(parseYmd(day));
    html = '<div class="sbar"><span>' + title + '</span><span id="planCount">' + (data ? openPicks() + " OF 3 PICKED" : "") + "</span></div>" +
      '<div class="sbody"><div class="dayline">' + dayContext(day) + "</div>" + kdComing(day);
    if (!data) {
      html += '<div class="empty">' + (state.tasksErr ? esc(state.tasksErr.msg) : "Loading your Master Task List…") + "</div>";
    } else {
      var used = {}, groups = [], day7 = ymd(addDays(parseYmd(day), 7));
      var pool = rankTasks(data.open.filter(function (t) { return t.status !== DONE; }));
      var take = function (label, list) { list = list.filter(function (t) { return !used[t.id]; }); list.forEach(function (t) { used[t.id] = 1; }); if (list.length) groups.push([label, list]); };
      take("PICKED FOR THIS DAY", rankTasks(data.focus));
      take("CARRIED OVER", pool.filter(function (t) { return t.focus && t.focus < day; }));
      take("OVERDUE", pool.filter(function (t) { return t.due && t.due < day; }));
      take("DUE IN THE NEXT 7 DAYS", pool.filter(function (t) { return t.due && t.due <= day7; }));
      take("HIGH PRIORITY OR IN PROGRESS", pool.filter(function (t) { return t.priority === "🔴 High" || t.status === INPROG; }));
      var rest = pool.filter(function (t) { return !used[t.id] && t.status !== BLOCKED; }).concat(pool.filter(function (t) { return !used[t.id] && t.status === BLOCKED; }));
      groups.forEach(function (g) {
        html += '<div class="pgroup">' + g[0] + '</div><div class="cands">' + g[1].map(function (t) { return planRow(t, day); }).join("") + "</div>";
      });
      if (rest.length) {
        html += '<button type="button" class="chip" data-showall="1">' + (plan.showAll ? "HIDE" : "SHOW") + " ALL OTHER OPEN TASKS (" + rest.length + ")</button>";
        if (plan.showAll) html += '<div class="cands" style="margin-top:8px">' + rest.map(function (t) { return planRow(t, day); }).join("") + "</div>";
      }
      if (!groups.length && !rest.length) html += '<div class="empty">No open tasks in your Master Task List. Add one below.</div>';
      html += '<div class="pgroup">ADD A NEW TASK FOR THIS DAY</div><div class="newtask">' +
        '<input type="text" id="planNew" maxlength="200" placeholder="New task" enterkeyhint="done">' +
        '<select id="planArea" aria-label="Life Area"><option value="">Life Area</option>' + data.areas.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("") + "</select>" +
        '<select id="planPri" aria-label="Priority"><option value="">Priority</option>' + data.priorities.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="btn" id="planAdd">ADD</button></div>';
    }
    html += '<div class="err" id="planErr" role="alert">' + esc(plan.err) + "</div></div>" +
      '<div class="sfoot capfoot"><span class="muted">Saved to Notion as Focus Date. Check them off on Today.</span><span class="btnrow">' +
      '<button type="button" class="btn ghost" id="planCancel">CANCEL</button>' +
      '<button type="button" class="btn capture" id="planSave"' + (!data || plan.saving || navigator.onLine === false ? " disabled" : "") + ">" +
      (plan.saving ? esc(plan.saving) : navigator.onLine === false ? "OFFLINE" : "SET PRIORITIES") + "</button></span></div>";
    var sheet = $("planSheet"), top = sheet.scrollTop;
    sheet.innerHTML = html;
    sheet.scrollTop = top;
  }
  function togglePick(id) {
    if (plan.picks[id]) delete plan.picks[id];
    else if (openPicks() >= 3) { toast("Three is the limit. Unpick one first."); return; }
    else plan.picks[id] = true;
    var b = document.querySelector('[data-pick="' + id.replace(/"/g, "") + '"]');
    if (b) { b.setAttribute("aria-pressed", String(!!plan.picks[id])); b.querySelector(".box").textContent = plan.picks[id] ? "✓" : ""; }
    $("planCount").textContent = openPicks() + " OF 3 PICKED";
  }
  function addPlanTask() {
    var title = $("planNew").value.trim();
    if (!title) { plan.err = "Type the new task first."; renderPlan(); return; }
    if (openPicks() >= 3) { toast("Three is the limit. Unpick one first."); return; }
    var btn = $("planAdd");
    btn.disabled = true; btn.textContent = "ADDING…";
    apiPost({ action: "addtask", task: { cid: newCid(), title: title.slice(0, 200), area: $("planArea").value || null, priority: $("planPri").value || null, day: plan.day } })
      .then(function (j) {
        var data = state.tasks[plan.day];
        data.focus.push(j.task); data.open.push(j.task);
        plan.picks[j.task.id] = true; plan.initial[j.task.id] = true;   /* already focused on this day */
        plan.err = "";
        saveTasks();
        toast("Added to Master Task List and picked");
        renderPlan();
      }).catch(function (err) { plan.err = "Not added: " + describeTasks(err); renderPlan(); });
  }
  /* Save the difference: new picks get Focus Date = day, removed picks are cleared. */
  function savePlan() {
    var day = plan.day, add = [], drop = [];
    Object.keys(plan.picks).forEach(function (id) { if (!plan.initial[id]) add.push([id, day]); });
    Object.keys(plan.initial).forEach(function (id) { if (!plan.picks[id]) drop.push([id, null]); });
    var jobs = add.concat(drop), done = 0;
    if (!jobs.length) { closePlan(); return; }
    var step = function () {
      if (!plan) return;
      if (done === jobs.length) {
        var n = openPicks();
        closePlan();
        toast(n + (n === 1 ? " priority" : " priorities") + " set for " + dLabel(parseYmd(day)));
        loadTasks(day, true);
        return;
      }
      plan.saving = "SAVING " + (done + 1) + " OF " + jobs.length + "…";
      renderPlan();
      apiPost({ action: "focus", id: jobs[done][0], day: jobs[done][1] }).then(function () {
        if (jobs[done][1]) plan.initial[jobs[done][0]] = true; else delete plan.initial[jobs[done][0]];
        done++;
        step();
      }).catch(function (err) {
        plan.saving = false;
        plan.err = "Stopped after " + done + " of " + jobs.length + ": " + describeTasks(err) + " Tap SET PRIORITIES to try the rest.";
        renderPlan();
      });
    };
    step();
  }
  $("planBtn").addEventListener("click", function () { openPlan(); });
  $("askBtn").addEventListener("click", openAsk);
  $("askClose").addEventListener("click", closeAsk);
  $("askSend").addEventListener("click", askSend);
  $("askOpen").addEventListener("click", openInClaude);
  $("askNew").addEventListener("click", function () { askState = null; freshAsk(); $("askErr").textContent = ""; renderAsk(); $("askText").focus(); });
  $("askDeep").addEventListener("click", function () { freshAsk(); askState.deep = !askState.deep; saveAsk(); renderAsk(); });
  $("askText").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); } });
  $("askScrim").addEventListener("click", function (e) {
    if (e.target === $("askScrim")) { closeAsk(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    var k = (b.dataset.pok || b.dataset.pcancel || "").split(":");
    if (b.dataset.pok) runProposal(+k[0], +k[1]);
    else if (b.dataset.pcancel) { askState.msgs[+k[0]].proposals[+k[1]].state = "cancelled"; saveAsk(); renderAsk(); }
  });
  $("planScrim").addEventListener("click", function (e) {
    if (e.target === $("planScrim")) { closePlan(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled || !plan) return;
    if (b.dataset.pick) togglePick(b.dataset.pick);
    else if (b.dataset.showall) { plan.showAll = !plan.showAll; renderPlan(); }
    else if (b.id === "planAdd") addPlanTask();
    else if (b.id === "planCancel") closePlan();
    else if (b.id === "planSave") savePlan();
  });
  $("planScrim").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "planNew") { e.preventDefault(); addPlanTask(); } });

  /* ---------- Bridge (overview) ---------- */
  /* One screen above the calendars: what needs you now, what's coming, and
     whether the week is in balance. Everything here is read from data the app
     already loads, plus weather (Open-Meteo) and the bridge's "done" counts. */
  var HEAVY_HOURS = 7, KD_WARN_DAYS = 3, PICK_BY_HOUR = 10, STALE_SYNC_MS = 6 * 3600 * 1000;
  var HIGH = "🔴 High";
  var BAL_AREAS = ["work", "personal", "farm", "hobby"];
  var HIVE = { minF: 60, maxWind: 12, maxRain: 30, from: 10, to: 17 };
  var WX_FRESH_MS = 30 * 60 * 1000, DONE_FRESH_MS = 10 * 60 * 1000;

  function canBalance() { return state.caps.indexOf("done") > -1; }
  function durLabel(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return h && m ? h + "H " + m + "M" : h ? h + "H" : m + "M";
  }
  function hrsLabel(h) { return (Math.round(h * 10) / 10) + "H"; }
  /* Hours covered by events between hours a and b of one day (overlaps counted once). */
  function unionHours(timed, day, a, b) {
    var d0 = sod(day), tot = 0, cs = null, ce = null;
    timed.map(function (ev) { return [Math.max(a, posInDay(ev._s, d0)), Math.min(b, posInDay(ev._e, d0))]; })
      .filter(function (x) { return x[1] > x[0]; })
      .sort(function (x, y) { return x[0] - y[0]; })
      .forEach(function (x) {
        if (ce === null || x[0] > ce) { if (ce !== null) tot += ce - cs; cs = x[0]; ce = x[1]; } else if (x[1] > ce) ce = x[1];
      });
    if (ce !== null) tot += ce - cs;
    return tot;
  }
  function titles(list) {
    var t = list.slice(0, 2).map(function (x) { return esc(x.title); }).join(" · ");
    return t + (list.length > 2 ? " · +" + (list.length - 2) + " more" : "");
  }
  function bridgeRange() { var t = sod(new Date()); return { from: addDays(t, -6), to: addDays(t, 7) }; }
  /* Work and Personal events that overlap later today (all calendars, even hidden ones). */
  function clashes(list, now) {
    var timed = dayEvents(list, now).timed.filter(function (e) { return e._e > now && !e.pending; }), out = [];
    timed.forEach(function (a, i) {
      timed.slice(i + 1).forEach(function (b) {
        if (a.area !== b.area && a._s < b._e && b._s < a._e) out.push(a.area === "work" ? [a, b] : [b, a]);
      });
    });
    return out;
  }

  /* --- condition: GREEN, YELLOW or RED, with every item that needs you --- */
  function conditions(now, today, list) {
    var items = [], data = canPlan() ? state.tasks[today] : null;
    if (data) {
      var picked = {};
      data.focus.forEach(function (t) { picked[t.id] = 1; });
      var overdue = rankTasks(data.open.filter(function (t) { return t.due && t.due < today && t.status !== DONE; }));
      var hi = overdue.filter(function (t) { return t.priority === HIGH; }), lo = overdue.filter(function (t) { return t.priority !== HIGH; });
      if (hi.length) items.push({ lvl: "bad", ic: "▲", txt: hi.length === 1 ? "Overdue, High priority" : hi.length + " High-priority tasks overdue", sub: titles(hi), act: "plan", go: "PLAN DAY" });
      if (lo.length) items.push({ lvl: "warn", ic: "▲", txt: lo.length === 1 ? "1 task overdue" : lo.length + " tasks overdue", sub: titles(lo), act: "plan", go: "PLAN DAY" });
      var dueNow = rankTasks(data.open.filter(function (t) { return t.due === today && !picked[t.id] && t.status !== DONE; }));
      if (dueNow.length) items.push({ lvl: "warn", ic: "▲", txt: "Due today, not in your picks", sub: titles(dueNow), act: "plan", go: "PLAN DAY" });
      if (!data.focus.length && now.getHours() >= PICK_BY_HOUR) items.push({ lvl: "warn", ic: "▲", txt: "No priorities picked yet", sub: "Plan Day takes a minute.", act: "plan", go: "PLAN DAY" });
    }
    if (hasData(bridgeRange())) {
      clashes(list, now).slice(0, 2).forEach(function (c) {
        items.push({ lvl: "bad", ic: "✕", txt: "Calendar clash at " + hm(c[0]._s > c[1]._s ? c[0]._s : c[1]._s), sub: esc(c[0].title) + " (" + areaName(c[0].area) + ") overlaps " + esc(c[1].title) + " (" + areaName(c[1].area) + ")", day: today, go: "TODAY" });
      });
    }
    if (canDates() && state.dates) {
      occurrences(today, ymd(addDays(now, KD_WARN_DAYS))).filter(function (o) { return o.s >= today; }).forEach(function (o) {
        var n = daysBetween(today, o.s);
        items.push({ lvl: "warn", ic: "◆", txt: n === 0 ? "Key date today" : n === 1 ? "Key date tomorrow" : "Key date in " + n + " days", sub: esc(o.d.title) + " · " + dLabel(parseYmd(o.s)), kd: o.id, go: "DETAILS" });
      });
    }
    var rdue = reviewDue(now);
    if (rdue && canReviews() && !reviewSaved(ymd(rdue))) items.push({ lvl: "warn", ic: "◆", txt: "Weekly review due", sub: weekLabel(rdue) + " · about 5 minutes", act: "review", go: "REVIEW" });
    var fr = frost(now);
    if (fr && fr.low <= 32) items.push({ lvl: "warn", ic: "▼", txt: "Frost tonight", sub: "Low " + Math.round(fr.low) + "°F around " + fr.at, act: "none", go: "" });
    var st = state.sync;
    if (state.conn && (st.status === "error" || st.status === "offline") && (!st.at || Date.now() - st.at > STALE_SYNC_MS)) {
      items.push({ lvl: "bad", ic: "◌", txt: "Sync failing for over 6 hours", sub: st.at ? "Showing data from " + esc(stamp(st.at)) + "." : "No data loaded yet.", act: "systems", go: "SYSTEMS" });
    }
    var stuck = state.queue.filter(function (q) { return q.failed || (q.attempts || 0) >= 2; });
    if (stuck.length) items.push({ lvl: "warn", ic: "▲", txt: stuck.length === 1 ? "1 capture not saved yet" : stuck.length + " captures not saved yet", sub: titles(stuck), act: "systems", go: "SYSTEMS" });
    if (canPlan() && state.tasksErr && !data) items.push({ lvl: "warn", ic: "◌", txt: "Task list didn't load", sub: esc(state.tasksErr.msg), act: "systems", go: "SYSTEMS" });
    items.sort(function (a, b) { return (a.lvl === "bad" ? 0 : 1) - (b.lvl === "bad" ? 0 : 1); });
    return items;
  }
  function conditionBanner(now, today, list) {
    var items = conditions(now, today, list);
    var level = items.some(function (i) { return i.lvl === "bad"; }) ? "red" : items.length ? "yellow" : "green";
    var body;
    if (!items.length) {
      var data = canPlan() ? state.tasks[today] : null, facts = [];
      if (data) facts.push(data.focus.length + (data.focus.length === 1 ? " priority" : " priorities") + " picked", "nothing overdue");
      facts.push("no clashes");
      if (state.sync.at) facts.push("synced " + stamp(state.sync.at));
      body = '<div class="ov-nominal"><b>ALL SYSTEMS NOMINAL</b><small>' + esc(facts.join(" · ")) + "</small></div>";
    } else {
      body = items.map(function (i) {
        var attrs = i.kd ? ' data-kd="' + esc(i.kd) + '"' : i.day ? ' data-day="' + i.day + '"' : i.act === "plan" ? ' data-act="plan" data-day="' + today + '"' : ' data-act="' + i.act + '"';
        return '<button type="button" class="ov-alert ' + i.lvl + '"' + attrs + '><span class="ic">' + i.ic + "</span><span class=\"tx\"><b>" + i.txt + "</b><small>" + i.sub + "</small></span>" +
          (i.go ? '<span class="go">' + i.go + "</span>" : "") + "</button>";
      }).join("");
    }
    var n = items.length;
    return '<section class="ov-cond ' + level + '" aria-label="Condition ' + level + '"><div class="lvl"><small>CONDITION</small>' + level.toUpperCase() +
      "<small>" + (n ? n + (n === 1 ? " ITEM NEEDS" : " ITEMS NEED") + " YOU" : "NOTHING NEEDS YOU") + '</small></div><div class="list">' + body + "</div></section>";
  }

  /* --- now / next --- */
  function nowPanel(now, list) {
    var de = dayEvents(visible(list), now), timed = de.timed;
    var cur = timed.filter(function (e) { return e._s <= now && e._e > now; })[0];
    var next = timed.filter(function (e) { return e._s > now; })[0];
    var html = phead("NOW / NEXT", hiddenNote(), null, moreBtn("now", "now and next")) + '<div class="ov-now">';
    if (!hasData(bridgeRange()) && !timed.length) {
      return html + '<div class="empty">' + (state.sync.status === "syncing" ? "Loading your calendars…" : "Calendar not loaded yet.") + "</div></div>";
    }
    if (cur) html += '<span class="pill a-' + cur.area + ' ov-state">NOW</span><span class="ov-cd tnum">' + durLabel((cur._e - now) / 60000) + '</span><span class="muted">left · ' + esc(cur.title) + "</span>";
    else if (next) html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd tnum">' + durLabel((next._s - now) / 60000) + '</span><span class="muted">until ' + hm(next._s) + "</span>";
    else html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd">CLEAR</span><span class="muted">nothing else on the calendar today</span>';
    html += "</div>";
    if (next) {
      state.index[next.id] = next;
      html += '<button type="button" class="ov-next a-' + next.area + pendingCls(next) + '" data-id="' + esc(next.id) + '"><span class="st"></span><span class="tx"><b>' + esc(next.title) + "</b><small>Next · " +
        hm(next._s) + " to " + hm(next._e) + " · " + areaName(next.area) + pendingTag(next) + '</small></span><span class="go tnum">IN ' + durLabel((next._s - now) / 60000) + "</span></button>";
    }
    if (de.allDay.length) html += '<div class="ov-allday">ALL DAY · ' + de.allDay.map(function (e) { return esc(e.title); }).join(" · ") + "</div>";
    /* the day from 07:00 to 21:00, events stacked in lanes when they overlap */
    var span = FOCUS_END - FOCUS_START, pct = function (h) { return ((h - FOCUS_START) / span * 100).toFixed(2); };
    var clash = {};
    clashes(visible(list), sod(now)).forEach(function (c) { clash[c[0].id] = 1; clash[c[1].id] = 1; });
    var rows = layout(timed, now, { y: function (h) { return h * 60; } }, 0), d0 = sod(now);
    html += '<div class="ov-strip">';
    rows.forEach(function (r) {
      var s = Math.max(FOCUS_START, r.s), e = Math.min(FOCUS_END, r.e);
      if (e <= s) return;
      state.index[r.ev.id] = r.ev;
      html += '<button type="button" class="ov-blk a-' + r.ev.area + (clash[r.ev.id] ? " clash" : "") + (r.ev.busy ? " busy" : "") + pendingCls(r.ev) + '" data-id="' + esc(r.ev.id) +
        '" aria-label="' + esc(r.ev.title) + ", " + hm(r.ev._s) + " to " + hm(r.ev._e) + '" style="left:' + pct(s) + "%;width:" + (pct(e) - pct(s)).toFixed(2) +
        "%;top:calc(5px + (100% - 10px) * " + r.col + " / " + r.n + ");height:calc((100% - 10px) / " + r.n + ' - 2px)"></button>';
    });
    var nowH = posInDay(now, d0);
    if (nowH >= FOCUS_START && nowH <= FOCUS_END) html += '<span class="ov-nowln" style="left:' + pct(nowH) + '%"><i class="tnum">' + hm(now) + "</i></span>";
    html += '</div><div class="ov-ticks">' + [7, 9, 11, 13, 15, 17, 19, 21].map(function (h) { return '<span class="tnum" style="left:' + pct(h) + '%">' + p2(h) + "</span>"; }).join("") + "</div>";
    var booked = unionHours(timed, now, FOCUS_START, FOCUS_END), left = unionHours([{ _s: now, _e: addDays(d0, 1) }], now, FOCUS_START, FOCUS_END) - unionHours(timed.map(function (e) { return { _s: e._s < now ? now : e._s, _e: e._e }; }), now, FOCUS_START, FOCUS_END);
    html += '<div class="ov-load ov-extra tnum"><span><b>' + durLabel(booked * 60) + "</b> BOOKED</span><span><b>" + durLabel((span - booked) * 60) + "</b> OPEN</span>" +
      (nowH < FOCUS_END ? "<span><b>" + durLabel(Math.max(0, left) * 60) + "</b> OPEN FROM NOW</span>" : "") + "<span>07:00 TO 21:00</span></div>";
    return html;
  }

  /* --- priorities + what's due outside them --- */
  function duePanel(today) {
    var data = canPlan() ? state.tasks[today] : null;
    if (!data) return "";
    var picked = {};
    data.focus.forEach(function (t) { picked[t.id] = 1; });
    var list = data.open.filter(function (t) { return t.due && t.due <= today && !picked[t.id] && t.status !== DONE; })
      .sort(function (a, b) { return a.due.localeCompare(b.due) || (PRI_RANK[a.priority] === undefined ? 3 : PRI_RANK[a.priority]) - (PRI_RANK[b.priority] === undefined ? 3 : PRI_RANK[b.priority]); });
    if (!list.length) return '<div class="ov-sub">NOTHING DUE OUTSIDE YOUR PICKS</div>';
    return '<div class="ov-sub">' + list.length + (list.length === 1 ? " TASK" : " TASKS") + ' DUE OR OVERDUE, NOT PICKED<span class="ov-hint"> · TAP + TO SEE</span></div><div class="ov-extra">' + list.slice(0, 4).map(function (t) {
      return '<button type="button" class="ov-due a-' + taskArea(t.area) + '" data-act="plan" data-day="' + today + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" +
        [bare(t.priority), bare(t.area)].filter(Boolean).map(esc).join(" · ") + '</small></span><span class="pill ' + (t.due < today ? "bad" : "warn") + '">' + dueLabel(t.due, today) + "</span></button>";
    }).join("") + (list.length > 4 ? '<div class="muted ov-morenote">+' + (list.length - 4) + " more in Plan Day</div>" : "") + "</div>";
  }

  /* --- the next seven days --- */
  function horizonPanel(now, list) {
    var vis = visible(list), days = [], max = 8, H = 110;
    for (var i = 0; i < 7; i++) {
      var d = addDays(sod(now), i), timed = dayEvents(vis, d).timed;
      var w = unionHours(timed.filter(function (e) { return e.area === "work"; }), d, 0, 24);
      var p = unionHours(timed.filter(function (e) { return e.area === "personal"; }), d, 0, 24);
      var f = unionHours(timed.filter(function (e) { return e.area === "farm"; }), d, 0, 24);
      days.push({ d: d, w: w, p: p, f: f, tot: unionHours(timed, d, 0, 24), kd: kdMarks(ymd(d), false).length });
      max = Math.max(max, w + p + f);
    }
    var html = phead("HORIZON · 7 DAYS", hiddenNote() || (hasData(bridgeRange()) ? "TAP A DAY" : "LOADING"), null, moreBtn("horizon", "horizon")) + '<div class="ov-wk">';
    days.forEach(function (x, i) {
      var heavy = x.tot >= HEAVY_HOURS;
      html += '<button type="button" class="ov-day' + (i === 0 ? " today" : "") + (heavy ? " heavy" : "") + '" data-day="' + ymd(x.d) + '" aria-label="' + DOWL[x.d.getDay()] + ", " + hrsLabel(x.tot) + ' booked">' +
        '<span class="bars"><span class="mk">' + (x.kd ? "◆" : "") + '</span><span class="hrs tnum">' + hrsLabel(x.tot) + "</span>" +
        (x.f ? '<span class="seg a-farm" style="height:' + Math.round(x.f / max * H) + 'px"></span>' : "") +
        '<span class="seg a-personal" style="height:' + Math.round(x.p / max * H) + 'px"></span><span class="seg a-work" style="height:' + Math.round(x.w / max * H) + 'px"></span></span>' +
        '<span class="dl">' + DOW[x.d.getDay()] + '<b class="tnum">' + p2(x.d.getDate()) + "</b></span></button>";
    });
    html += '</div><div class="ov-legend ov-extra"><span><i class="a-work"></i>WORK</span><span><i class="a-personal"></i>PERSONAL</span>' + (hasFarm() ? '<span><i class="a-farm"></i>' + AREAS.farm.name + "</span>" : "") + '<span><i class="dia">◆</i>KEY DATE</span></div>';
    var heavy = days.filter(function (x) { return x.tot >= HEAVY_HOURS; });
    if (heavy.length) html += '<div class="ov-heavy">▲ HEAVY: ' + heavy.map(function (x) { return DOW[x.d.getDay()] + " " + hrsLabel(x.tot); }).join(" · ") + ". Few open gaps.</div>";
    return html;
  }

  /* --- key dates: the next three --- */
  function kdNextPanel(today) {
    if (!canDates()) return phead("KEY DATES", "") + stubBox(state.conn ? "Needs bridge 1.3 and the Key Dates database connected in Notion. Steps are in the README." : "Link calendars first.");
    if (!state.dates) return phead("KEY DATES", "") + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div>";
    var list = occurrences(today, ymd(addDays(parseYmd(today), 366))).filter(function (o) { return o.e >= today; }).slice(0, 3);
    var html = phead("KEY DATES", "NEXT UP", null, moreBtn("kd", "key dates"));
    if (!list.length) html += '<div class="empty">No key dates in the next 12 months.</div>';
    list.forEach(function (o) {
      var running = o.s < today, n = running ? daysBetween(today, o.e) : daysBetween(today, o.s);
      var unit = running ? "D LEFT" : n === 0 ? "TODAY" : n === 1 ? "DAY" : "DAYS";
      html += '<button type="button" class="ov-kd a-' + taskArea(o.d.area) + (!running && n <= KD_WARN_DAYS ? " soon" : "") + '" data-kd="' + esc(o.id) + '"><span class="kn tnum">' + (n === 0 && !running ? "◆" : n) +
        "<small>" + unit + '</small></span><span class="tx"><b>' + esc(o.d.title) + "</b><small>" + rangeLabel(o) + (o.d.type ? " · " + esc(bare(o.d.type)) : "") + (running ? " · UNDER WAY" : "") + "</small></span></button>";
    });
    return html + '<div class="btnrow ov-extra" style="margin-top:14px"><button type="button" class="btn ghost" data-act="dates">ALL KEY DATES</button><button type="button" class="btn" data-act="adddate">+ ADD</button></div>';
  }

  /* --- environment (Open-Meteo, no key needed; only rounded coordinates are sent) --- */
  function place() { return lsGet(LS_PLACE); }
  function placeKey(pl) { return pl.lat + "," + pl.lon; }
  function loadWeather(force) {
    var pl = place();
    if (!pl || state.wxInflight || navigator.onLine === false) return;
    if (!force && state.wx && state.wx.key === placeKey(pl) && Date.now() - state.wx.fetched < WX_FRESH_MS) return;
    if (!force && state.wxErr && Date.now() - state.wxErr < FRESH_MS) return;
    state.wxInflight = true;
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + pl.lat + "&longitude=" + pl.lon +
      "&current=temperature_2m,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=3";
    fetch(u, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.hourly || !j.daily) throw new Error("bad_json");
      state.wx = { fetched: Date.now(), key: placeKey(pl), data: j };
      state.wxErr = null;
      lsSet(LS_WX, state.wx);
    }).catch(function () { state.wxErr = Date.now(); })
      .then(function () { state.wxInflight = false; if (state.screen === "bridge") render(true); });
  }
  function wxData() { var pl = place(); return pl && state.wx && state.wx.key === placeKey(pl) ? state.wx.data : null; }
  function wxText(c) {
    if (c === 0) return "CLEAR"; if (c === 1) return "MOSTLY CLEAR"; if (c === 2) return "PARTLY CLOUDY"; if (c === 3) return "OVERCAST";
    if (c === 45 || c === 48) return "FOG"; if (c >= 51 && c <= 57) return "DRIZZLE"; if (c >= 61 && c <= 67) return "RAIN";
    if (c >= 71 && c <= 77) return "SNOW"; if (c >= 80 && c <= 82) return "SHOWERS"; if (c === 85 || c === 86) return "SNOW SHOWERS";
    if (c >= 95) return "THUNDERSTORMS"; return "";
  }
  function wxHours(j) {
    var h = j.hourly;
    return h.time.map(function (t, i) {
      return { t: t, day: t.slice(0, 10), hr: +t.slice(11, 13), temp: h.temperature_2m[i], wind: h.wind_speed_10m[i], rain: h.precipitation_probability[i], code: h.weather_code[i] };
    });
  }
  /* Best stretch for opening hives: warm, calm and dry, between 10:00 and 17:00. */
  function hiveCheck(now) {
    var j = wxData();
    if (!j) return null;
    var hours = wxHours(j), today = ymd(now), start = now.getHours() + (now.getMinutes() ? 1 : 0), label = "TODAY", day = today;
    if (Math.max(start, HIVE.from) >= HIVE.to) { day = ymd(addDays(now, 1)); start = 0; label = "TOMORROW"; }
    var slot = hours.filter(function (x) { return x.day === day && x.hr >= Math.max(start, HIVE.from) && x.hr < HIVE.to; });
    if (!slot.length) return null;
    var why = { cool: 0, wind: 0, rain: 0 }, best = null, run = null, hiT = -99;
    slot.forEach(function (x) {
      hiT = Math.max(hiT, x.temp);
      var wet = x.code >= 51 || (x.rain != null && x.rain > HIVE.maxRain);
      var ok = x.temp >= HIVE.minF && x.wind <= HIVE.maxWind && !wet;
      if (!ok) { if (x.temp < HIVE.minF) why.cool++; else if (x.wind > HIVE.maxWind) why.wind++; else why.rain++; run = null; return; }
      if (!run) run = { from: x.hr, to: x.hr + 1, lo: x.temp, hi: x.temp }; else { run.to = x.hr + 1; run.lo = Math.min(run.lo, x.temp); run.hi = Math.max(run.hi, x.temp); }
      if (!best || run.to - run.from > best.to - best.from) best = { from: run.from, to: run.to, lo: run.lo, hi: run.hi };
    });
    if (best) return { go: true, label: label, text: "Best window " + p2(best.from) + ":00 to " + p2(best.to) + ":00", sub: (Math.round(best.lo) === Math.round(best.hi) ? "" : Math.round(best.lo) + " to ") + Math.round(best.hi) + "°F, light wind, dry" };
    var reason = why.cool >= why.wind && why.cool >= why.rain ? "Too cool, high " + Math.round(hiT) + "°F" : why.wind >= why.rain ? "Too windy" : "Rain likely";
    return { go: false, label: label, text: reason, sub: "Needs " + HIVE.minF + "°F+, wind under " + HIVE.maxWind + " mph, dry" };
  }
  /* Lowest temperature from now until 09:00 tomorrow. */
  function frost(now) {
    var j = wxData();
    if (!j) return null;
    var end = ymd(addDays(now, 1)) + "T09:00", from = ymd(now) + "T" + p2(now.getHours()) + ":00", low = null;
    wxHours(j).forEach(function (x) { if (x.t >= from && x.t <= end && (low === null || x.temp < low.temp)) low = x; });
    return low ? { low: low.temp, at: low.t.slice(11, 16) } : null;
  }
  function envPanel(now) {
    var pl = place(), html = phead("ENVIRONMENT", pl ? (pl.name ? esc(pl.name) : "") : "SETUP", "farm", pl ? moreBtn("env", "environment") : "");
    if (!pl) return html + '<div class="stubbox"><span class="pill">SETUP</span><span>Weather, hive check and frost watch need your location. Set it in Systems.</span></div>' +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="systems">SET LOCATION</button></div>';
    var j = wxData();
    if (!j) return html + '<div class="empty">' + (state.wxErr ? "Weather didn't load. It retries in a minute." : "Loading weather…") + "</div>";
    var c = j.current || {}, dly = j.daily, today = ymd(now), di = Math.max(0, dly.time.indexOf(today));
    html += '<div class="ov-env"><span class="ov-temp tnum">' + Math.round(c.temperature_2m) + '°F</span><span class="tx"><b>' + wxText(c.weather_code) + "</b><small>High " +
      Math.round(dly.temperature_2m_max[di]) + "° · Low " + Math.round(dly.temperature_2m_min[di]) + "°</small></span></div>" +
      '<div class="ov-facts ov-extra tnum"><span>WIND <b>' + Math.round(c.wind_speed_10m) + " MPH</b></span><span>RAIN <b>" + (dly.precipitation_probability_max[di] == null ? "–" : dly.precipitation_probability_max[di] + "%") +
      "</b></span><span>SUNRISE <b>" + dly.sunrise[di].slice(11, 16) + "</b></span><span>SUNSET <b>" + dly.sunset[di].slice(11, 16) + "</b></span></div>";
    var hv = hiveCheck(now), fr = frost(now);
    if (hv) html += '<div class="ov-envrow"><span class="k">HIVE CHECK · ' + hv.label + '</span><span class="tx"><b>' + hv.text + '</b><small class="ov-extra">' + hv.sub + '</small></span><span class="pill ' + (hv.go ? "ok" : "warn") + '">' + (hv.go ? "GO" : "HOLD") + "</span></div>";
    if (fr) {
      var lvl = fr.low <= 32 ? "bad" : fr.low <= 36 ? "warn" : "ok";
      html += '<div class="ov-envrow"><span class="k">FROST WATCH · TONIGHT</span><span class="tx"><b>Low ' + Math.round(fr.low) + "°F around " + fr.at + '</b><small class="ov-extra">' +
        (lvl === "ok" ? "No frost expected" : lvl === "warn" ? "Near frost. Cover tender plants." : "Frost likely. Protect plants and water lines.") + '</small></span><span class="pill ' + lvl + '">' +
        (lvl === "ok" ? "NO FROST" : lvl === "warn" ? "NEAR FROST" : "FROST") + "</span></div>";
    }
    return html + '<div class="ov-foot ov-extra">Weather by Open-Meteo · updated ' + esc(stamp(state.wx.fetched)) + "</div>";
  }

  /* --- balance: tasks finished per area, hours per calendar, quiet areas --- */
  function loadDone(force) {
    if (!state.conn || !canBalance() || state.doneInflight) return;
    if (!force && state.done && Date.now() - state.done.fetched < DONE_FRESH_MS) return;
    if (!force && state.doneErr && Date.now() - state.doneErr.at < FRESH_MS) return;
    state.doneInflight = true;
    api({ action: "done", days: 30 }).then(function (j) {
      state.done = { fetched: Date.now(), done: j.done || [] };
      state.doneErr = null;
      lsSet(LS_DONE, state.done);
    }).catch(function (err) {
      state.doneErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.doneInflight = false;
      if (state.screen === "bridge") render(true);
    });
  }
  function balancePanel(now, today, list) {
    var html = phead("BALANCE · LAST 7 DAYS", "", "personal", moreBtn("bal", "balance"));
    if (!canBalance()) return html + stubBox(state.conn ? "Needs bridge 1.4. Steps are in the README under <b>Bridge 1.4</b>." : "Link calendars first.");
    if (!state.done) return html + '<div class="empty">' + (state.doneErr ? esc(state.doneErr.msg) : "Loading finished tasks…") + "</div>";
    var since = addDays(sod(now), -6), stats = {};
    BAL_AREAS.forEach(function (a) { stats[a] = { n: 0, last: null, hrs: 0 }; });
    state.done.done.forEach(function (x) {
      if (!x.at) return;
      var s = stats[taskArea(x.area)], t = new Date(x.at);
      if (!s.last || t > s.last) s.last = t;
      if (t >= since) s.n++;
    });
    for (var i = 0; i < 7; i++) {
      var d = addDays(since, i), timed = dayEvents(list, d).timed, upTo = i === 6 ? posInDay(now, sod(now)) : 24;
      LIVE.forEach(function (a) { stats[a].hrs += unionHours(timed.filter(function (e) { return e.area === a; }), d, 0, upTo); });
    }
    var maxN = Math.max(3, Math.max.apply(null, BAL_AREAS.map(function (a) { return stats[a].n; })));
    BAL_AREAS.forEach(function (a) {
      var s = stats[a], ago = s.last ? daysBetween(ymd(s.last), today) : null;
      var pill = ago === null ? '<span class="pill warn">NONE IN 30 D</span>' : ago >= 7 ? '<span class="pill warn">QUIET ' + ago + " D</span>" :
        '<span class="pill">LAST ' + (ago === 0 ? "TODAY" : ago === 1 ? "YESTERDAY" : ago + " D AGO") + "</span>";
      html += '<div class="ov-bal a-' + a + '"><span class="bn">' + AREAS[a].name + '</span><span class="track"><span style="width:' + Math.round(s.n / maxN * 100) + '%"></span></span>' +
        '<span class="bv tnum">' + s.n + " DONE" + (LIVE.indexOf(a) > -1 && hasData(bridgeRange()) ? " · " + hrsLabel(s.hrs) : "") + "</span>" + pill + "</div>";
    });
    html += '<div class="ov-foot ov-extra">Tasks marked done per Life Area, dated by their last edit in Notion. Hours come from the Work and Personal calendars; Farm + Bees and Hobbies get hours once they have their own calendars.</div>';
    if (state.doneErr) html += stale(state.done.fetched);
    return html;
  }

  /* --- captain's log + bearing (both stay on this iPad) --- */
  function bearings() { return lsGet(LS_BEARINGS) || []; }
  function bearingFor(today) {
    var b = bearings();
    return b.length ? b[((daysBetween("2000-01-01", today) + state.wmShift) % b.length + b.length) % b.length] : "";
  }
  function logPanel(today) {
    var log = lsGet(LS_LOG) || {}, b = bearingFor(today);
    return phead("INTENT + BEARING", dLabel(parseYmd(today)) + " · ON THIS IPAD") + '<div class="ov-log"><div><label class="ov-sub" for="logIntent">TODAY\'S INTENT</label>' +
      '<input type="text" id="logIntent" maxlength="160" placeholder="One line: what makes today a good day?" autocomplete="off" enterkeyhint="done" value="' + esc(log[today] || "") + '"></div>' +
      (b ? '<button type="button" class="ov-bearing" data-act="bearing">BEARING<b>' + esc(b) + "</b>TAP TO ROTATE</button>"
        : '<button type="button" class="ov-bearing" data-act="systems">BEARING<b>SET IN SYSTEMS</b>YOUR GUIDING WORDS</button>') + "</div>";
  }
  function saveLog(text) {
    var log = lsGet(LS_LOG) || {}, today = ymd(new Date());
    if (text) log[today] = text; else delete log[today];
    var keep = {};
    Object.keys(log).sort().slice(-30).forEach(function (k) { keep[k] = log[k]; });
    lsSet(LS_LOG, keep);
  }

  /* Each Bridge panel shows its essentials; secondary readouts sit behind the + beside its title. */
  function moreBtn(key, title) {
    var open = !!bridgeOpen[key];
    return '<button type="button" class="ov-more" data-more="' + key + '" aria-expanded="' + open + '" aria-label="' + (open ? "Hide" : "Show") + " details for " + title + '"></button>';
  }
  function pnl(key, inner) { return '<section class="ov-pnl' + (bridgeOpen[key] ? " open" : "") + '" data-panel="' + key + '">' + inner + "</section>"; }

  function renderBridge() {
    var now = new Date(), today = ymd(now), list = eventsFor(bridgeRange());
    var html = conditionBanner(now, today, list) + '<div class="ov-grid">' +
      pnl("now", nowPanel(now, list)) + (canHabits() ? pnl("habits", habitsPanel(today)) : "") + pnl("env", envPanel(now)) +
      pnl("prio", prioritiesPanel(today, true, moreBtn("prio", "priorities")) + duePanel(today)) +
      pnl("horizon", horizonPanel(now, list)) + pnl("kd", kdNextPanel(today)) +
      pnl("bal", balancePanel(now, today, list)) + pnl("log", logPanel(today)) + "</div>";
    $("content").innerHTML = html;
    /* when the condition changes, its color crossfades from the old one */
    var cEl = document.querySelector(".ov-cond"), lv = cEl && (cEl.className.match(/\b(green|yellow|red)\b/) || [])[1];
    if (lv && state.lastCond && state.lastCond !== lv) {
      cEl.style.setProperty("--prev", "var(--" + { green: "ok", yellow: "warn", red: "bad" }[state.lastCond] + ")");
      restartClass(cEl, "changed");
    }
    if (lv) state.lastCond = lv;
    loadTasks(today, false);
    loadDates(false);
    loadDone(false);
    loadWeather(false);
    var rdue = reviewDue(now);
    if (rdue && canReviews() && !reviewSaved(ymd(rdue))) loadWeek(rdue, false);
  }

  /* ---------- Weekly Review ---------- */
  /* Once a week (due Sunday 14:00 to Tuesday night): how the week went, then a
     short reflection saved to the Weekly Reviews database in Notion, one page
     per week, together with the week's numbers and Captain's Log lines. */
  var WEEK_FRESH_MS = 2 * 60 * 1000;
  var REVIEW_FIELDS = [
    ["wentWell", "1 · WHAT WENT WELL?", "Wins, good moments, what worked"],
    ["drained", "2 · WHAT DRAINED ME?", "What cost more than it gave"],
    ["nextFocus", "3 · WHAT'S MY NEXT FOCUS?", "The one or two things that matter most next week"],
    ["bearing", "4 · WHERE DID I HOLD MY BEARING?", "Moments you stayed on course, and what helped"]
  ];
  function canReviews() { return state.caps.indexOf("reviews") > -1; }
  /* The week a review is due for: from Sunday 14:00 it's this week; on Monday and Tuesday, last week. */
  function reviewDue(now) {
    var d = now.getDay();
    if (d === 0 && now.getHours() >= 14) return sow(now);
    if (d === 1 || d === 2) return addDays(sow(now), -7);
    return null;
  }
  function reviewSaved(wk) {
    var w = state.weeks[wk];
    return !!((w && w.review) || savedWeeks[wk]);
  }
  function defaultReviewWeek() {
    var now = new Date(), due = reviewDue(now);
    return due && !reviewSaved(ymd(due)) ? due : sow(now);
  }
  function weekLabel(w0) {
    var w1 = addDays(w0, 6);
    return "WEEK " + isoWeek(w0) + " · " + p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + MON[w0.getMonth()] : "") + " TO " + p2(w1.getDate()) + " " + MON[w1.getMonth()];
  }
  function loadWeek(w0, force) {
    var wk = ymd(w0), have = state.weeks[wk];
    if (!state.conn || !canReviews() || state.weekInflight[wk]) return;
    if (!force && have && Date.now() - have.fetched < WEEK_FRESH_MS) return;
    if (!force && state.weekErr && state.weekErr.wk === wk && Date.now() - state.weekErr.at < FRESH_MS) return;
    state.weekInflight[wk] = true;
    api({ action: "week", week: wk, from: w0.toISOString(), to: addDays(w0, 7).toISOString() }).then(function (j) {
      state.weeks[wk] = { fetched: Date.now(), done: j.done || [], picked: j.picked || [], review: j.review || null, reviewsError: j.reviewsError || null };
      if (j.review) savedWeeks[wk] = Date.parse(j.review.saved) || Date.now();
      state.weekErr = null;
      saveWeeks();
    }).catch(function (err) {
      state.weekErr = { wk: wk, at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      delete state.weekInflight[wk];
      if (state.screen === "review" || state.screen === "bridge") render(true);
    });
  }
  function saveWeeks() {
    var keep = {};
    Object.keys(state.weeks).sort().slice(-6).forEach(function (k) { keep[k] = state.weeks[k]; });
    state.weeks = keep;
    lsSet(LS_WEEKS, keep);
    var sw = {};
    Object.keys(savedWeeks).sort().slice(-20).forEach(function (k) { sw[k] = savedWeeks[k]; });
    savedWeeks = sw;
    lsSet(LS_RSAVED, sw);
  }
  function drafts() { return lsGet(LS_RDRAFT) || {}; }
  function saveDraft(wk, field, value) {
    var d = drafts();
    d[wk] = d[wk] || {};
    d[wk][field] = value;
    var keep = {};
    Object.keys(d).sort().slice(-4).forEach(function (k) { keep[k] = d[k]; });
    lsSet(LS_RDRAFT, keep);
  }
  /* The numbers for one week, from the calendars (ignored events left out) and the bridge. */
  function weekStats(w0) {
    var now = new Date(), list = eventsFor(viewRange()), cur = sow(now).getTime() === w0.getTime();
    var hours = function (start, area) {
      var tot = 0;
      for (var i = 0; i < 7; i++) {
        var d = addDays(start, i);
        if (d > now) break;
        var timed = dayEvents(list, d).timed.filter(function (e) { return !area || e.area === area; });
        tot += unionHours(timed, d, 0, sameDay(d, now) ? posInDay(now, sod(now)) : 24);
      }
      return tot;
    };
    var st = { cur: cur, work: hours(w0, "work"), personal: hours(w0, "personal"), prevWork: hours(addDays(w0, -7), "work"), prevPersonal: hours(addDays(w0, -7), "personal") };
    if (hasFarm()) { st.farm = hours(w0, "farm"); st.prevFarm = hours(addDays(w0, -7), "farm"); }
    var busiest = null, open = 0, meetings = 0;
    for (var i = 0; i < 7; i++) {
      var d = addDays(w0, i), timed = dayEvents(list, d).timed, tot = unionHours(timed, d, 0, 24);
      if (!busiest || tot > busiest.h) busiest = { d: d, h: tot };
      open += (FOCUS_END - FOCUS_START) - unionHours(timed, d, FOCUS_START, FOCUS_END);
      meetings += timed.filter(function (e) { return e.area === "work" && sod(e._s).getTime() === d.getTime(); }).length;
    }
    st.busiest = busiest; st.open = open; st.meetings = meetings;
    var w = state.weeks[ymd(w0)];
    if (w) {
      st.done = w.done.length;
      var by = {};
      w.done.forEach(function (t) { var k = t.area || ""; by[k] = (by[k] || 0) + 1; });
      st.byArea = Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); }).map(function (k) { return { area: k, n: by[k] }; });
      st.picked = w.picked.length;
      st.pickedDone = w.picked.filter(function (t) { return t.status === DONE; }).length;
    }
    return st;
  }
  /* "Week 41 · 05 to 11 Oct", the page title in Notion. */
  function reviewTitle(w0) {
    var w1 = addDays(w0, 6), m = function (d) { return MON[d.getMonth()].charAt(0) + MON[d.getMonth()].slice(1).toLowerCase(); };
    return "Week " + isoWeek(w0) + " · " + p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + m(w0) : "") + " to " + p2(w1.getDate()) + " " + m(w1);
  }
  function delta(a, b) { var d = Math.round((a - b) * 10) / 10; return d === 0 ? "±0" : (d > 0 ? "+" : "") + d; }
  function intents(w0) {
    var log = lsGet(LS_LOG) || {};
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = addDays(w0, i); return { d: d, text: log[ymd(d)] || "" }; });
  }

  function renderReview() {
    var w0 = sow(state.anchor), wk = ymd(w0), now = new Date(), r = viewRange(), loaded = hasData(r);
    if (w0 > now) { $("content").innerHTML = '<div class="rv">' + phead("NOT YET", "") + '<div class="empty">This week hasn\'t started. Tap the left arrow or TODAY.</div></div>'; return; }
    var st = weekStats(w0), w = state.weeks[wk], html = '<div class="rv">';

    /* time */
    html += "<section>" + phead("TIME", st.cur ? "SO FAR THIS WEEK" : "VS THE WEEK BEFORE");
    if (!loaded) html += '<div class="empty">' + (state.sync.status === "syncing" ? "Loading your calendars…" : "Calendar for this week isn't loaded yet.") + "</div>";
    else {
      var maxH = Math.max(10, st.work, st.personal, st.farm || 0);
      [["work", st.work, st.prevWork], ["personal", st.personal, st.prevPersonal]].concat(hasFarm() ? [["farm", st.farm, st.prevFarm]] : []).forEach(function (x) {
        html += '<div class="rv-row a-' + x[0] + '"><span class="bn">' + AREAS[x[0]].name + '</span><span class="track"><span style="width:' + Math.round(x[1] / maxH * 100) + '%"></span></span>' +
          '<span class="bv tnum">' + hrsLabel(x[1]) + "</span>" + (st.cur ? "<span></span>" : '<span class="dl tnum">' + delta(x[1], x[2]) + "</span>") + "</div>";
      });
      STANDBY_AREAS.forEach(function (k) {
        html += '<div class="rv-row a-' + k + ' off"><span class="bn">' + AREAS[k].name + '</span><span class="muted">No calendar yet</span><span></span><span></span></div>';
      });
      html += '<div class="ov-facts tnum"><span>BUSIEST <b>' + (st.busiest && st.busiest.h ? DOW[st.busiest.d.getDay()] + " " + hrsLabel(st.busiest.h) : "NONE") + "</b></span><span>OPEN 07:00 TO 21:00 <b>" + hrsLabel(st.open) +
        " OF 98H</b></span><span>WORK EVENTS <b>" + st.meetings + "</b></span>" + (ignoreList.length ? "<span>IGNORED EVENTS LEFT OUT</span>" : "") + "</div>";
    }
    html += "</section>";

    /* output + priorities kept (bridge 1.5) */
    if (!canReviews()) {
      html += "<section>" + phead("OUTPUT", "") + stubBox(state.conn ? "Finished tasks, priorities kept and saving reviews need bridge 1.5. Steps are in the README under <b>Bridge 1.5</b>." : "Link calendars first.") + "</section>";
    } else if (!w) {
      html += "<section>" + phead("OUTPUT", "") + '<div class="empty">' + (state.weekErr && state.weekErr.wk === wk ? esc(state.weekErr.msg) : "Loading the week from Notion…") + "</div></section>";
    } else {
      var maxN = Math.max(3, st.byArea.length ? st.byArea[0].n : 0);
      html += "<section>" + phead("OUTPUT", st.done + (st.done === 1 ? " TASK" : " TASKS") + " FINISHED");
      if (!st.done) html += '<div class="empty">No tasks marked done this week.</div>';
      st.byArea.forEach(function (x) {
        html += '<div class="rv-row a-' + taskArea(x.area) + '"><span class="bn">' + esc(bare(x.area) || "No area") + '</span><span class="track"><span style="width:' + Math.round(x.n / maxN * 100) + '%"></span></span><span class="bv tnum">' + x.n + "</span><span></span></div>";
      });
      if (st.done) html += '<div class="rv-list">' + w.done.slice(0, 12).map(function (t) { return '<span class="a-' + taskArea(t.area) + '">' + esc(t.title) + "</span>"; }).join("") +
        (w.done.length > 12 ? '<span class="muted">+' + (w.done.length - 12) + " more</span>" : "") + "</div>";
      html += "</section>";
      var slipped = w.picked.filter(function (t) { return t.status !== DONE; });
      html += "<section>" + phead("PRIORITIES KEPT", st.picked ? st.pickedDone + " OF " + st.picked + " · " + Math.round(st.pickedDone / st.picked * 100) + "%" : "");
      if (!st.picked) html += '<div class="empty">No priorities were picked this week.</div>';
      else html += '<div class="rv-kept"><span class="kn tnum">' + st.pickedDone + '<small>DONE</small></span><span class="kn tnum">' + slipped.length + '<small>NOT DONE</small></span><span class="kn tnum">' + st.picked + "<small>PICKED</small></span></div>";
      if (slipped.length) html += '<div class="ov-sub">STILL OPEN</div>' + slipped.map(function (t) {
        return '<div class="ov-due a-' + taskArea(t.area) + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" + [bare(t.status), bare(t.area), t.focus ? "PICKED FOR " + dLabel(parseYmd(t.focus)) : ""].filter(Boolean).map(esc).join(" · ") + "</small></span><span></span></div>";
      }).join("");
      html += "</section>";
    }

    html += habitsWeek(w0);

    /* intent log */
    var ins = intents(w0), written = ins.filter(function (x) { return x.text; }).length;
    html += "<section>" + phead("INTENT LOG", written + " OF 7 DAYS") + '<div class="rv-log">' + ins.map(function (x) {
      return '<span class="dt tnum">' + DOW[x.d.getDay()] + " " + p2(x.d.getDate()) + "</span><span" + (x.text ? "" : ' class="muted"') + ">" + (x.text ? esc(x.text) : "No entry") + "</span>";
    }).join("") + '</div><small class="muted">From the Captain\'s Log on the Bridge. Saving the review keeps these lines in Notion.</small></section>';

    /* next week */
    var n0 = addDays(w0, 7), today = ymd(now), tdata = canPlan() ? state.tasks[today] : null, nl = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(n0, i), h = unionHours(dayEvents(eventsFor(r), d).timed, d, 0, 24);
      if (h >= HEAVY_HOURS) nl.push(DOW[d.getDay()] + " " + hrsLabel(h));
    }
    var kds = canDates() && state.dates ? occurrences(ymd(n0), ymd(addDays(n0, 6))) : [];
    var due = tdata ? rankTasks(tdata.open.filter(function (t) { return t.due && t.due >= ymd(n0) && t.due <= ymd(addDays(n0, 6)); })) : [];
    html += "<section>" + phead("NEXT WEEK", weekLabel(n0).replace(/^WEEK \d+ · /, "")) +
      '<div class="ov-facts"><span>HEAVY DAYS <b>' + (nl.length ? nl.join(" · ") : "NONE") + "</b></span></div>";
    kds.forEach(function (o) { html += kdRow(o, today); });
    if (due.length) html += '<div class="ov-sub">DUE NEXT WEEK</div>' + due.slice(0, 6).map(function (t) {
      return '<div class="ov-due a-' + taskArea(t.area) + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" + taskMeta(t, today) + "</small></span><span></span></div>";
    }).join("");
    if (!kds.length && !due.length) html += '<div class="empty">No key dates or due tasks next week.</div>';
    html += "</section>";

    /* reflection + save */
    var saved = w && w.review, draft = drafts()[wk] || {};
    html += "<section>" + phead("REFLECTION", "4 QUESTIONS · " + (saved ? "SAVED " + esc(stamp(Date.parse(saved.saved))) : "NOT SAVED YET"));
    REVIEW_FIELDS.forEach(function (f) {
      var v = draft[f[0]] !== undefined ? draft[f[0]] : saved ? saved[f[0]] || "" : "";
      html += '<label class="ov-sub" for="rv-' + f[0] + '">' + f[1] + '</label><textarea id="rv-' + f[0] + '" data-rv="' + f[0] + '" rows="3" maxlength="2000" placeholder="' + esc(f[2]) + '">' + esc(v) + "</textarea>";
    });
    var bad = w && w.reviewsError, sumV = draft.summary !== undefined ? draft.summary : saved ? saved.summary || "" : "";
    html += '<label class="ov-sub" for="rv-summary">CLAUDE SUMMARY</label><textarea id="rv-summary" data-rv="summary" rows="5" maxlength="4000" placeholder="' +
      (canAsk() ? "Tap WRITE SUMMARY for a short summary of the week. Edit it as you like." : "Needs Ask Claude (bridge 1.6). You can also write your own.") + '">' + esc(sumV) + "</textarea>";
    html += '<div class="btnrow" style="margin-top:14px"><button type="button" class="btn ask" data-act="writesummary"' + (!canAsk() || state.summaryBusy || navigator.onLine === false ? " disabled" : "") + ">" +
      (state.summaryBusy ? "WRITING…" : "WRITE SUMMARY") + (canAsk() ? "<small>CLAUDE · ABOUT 5¢</small>" : "<small>SETUP</small>") + "</button>" +
      '<button type="button" class="btn capture" data-act="savereview"' + (!canReviews() || state.reviewSaving || navigator.onLine === false || bad ? " disabled" : "") + ">" +
      (state.reviewSaving ? "SAVING…" : navigator.onLine === false ? "OFFLINE" : saved ? "UPDATE IN NOTION" : "SAVE TO NOTION") + "</button>" +
      (saved && saved.url ? '<a class="btn ghost" href="' + esc(saved.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
    if (bad) html += '<div class="err">' + (bad === "notion_not_shared" ? "Weekly Reviews isn't connected to the TimothyOS integration. In Notion: 🧭 Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: bad }))) + "</div>";
    html += '<small class="muted">Your writing is kept on this iPad as you type, so nothing is lost before you save.</small></section></div>';
    $("content").innerHTML = html;
    loadWeek(w0, false);
    loadTasks(today, false);
    loadDates(false);
  }
  function submitReview() {
    var w0 = sow(state.anchor), wk = ymd(w0), st = weekStats(w0), d = drafts()[wk] || {}, w = state.weeks[wk], saved = w && w.review;
    var field = function (k) { var el = $("rv-" + k); return el ? el.value.trim() : (d[k] !== undefined ? d[k] : saved ? saved[k] || "" : ""); };
    var review = {
      week: wk,
      title: reviewTitle(w0),
      wentWell: field("wentWell"), drained: field("drained"), nextFocus: field("nextFocus"), bearing: field("bearing"), summary: field("summary"),
      intents: intents(w0).filter(function (x) { return x.text; }).map(function (x) { return DOW[x.d.getDay()] + " " + p2(x.d.getDate()) + " · " + x.text; }).join("\n"),
      hoursWork: hasData(viewRange()) ? Math.round(st.work * 10) / 10 : null,
      hoursPersonal: hasData(viewRange()) ? Math.round(st.personal * 10) / 10 : null,
      hoursFarm: hasFarm() && hasData(viewRange()) ? Math.round(st.farm * 10) / 10 : null, hoursHobbies: null,
      tasksDone: w ? st.done : null, picked: w ? st.picked : null, pickedDone: w ? st.pickedDone : null,
      byArea: w ? st.byArea.map(function (x) { return (bare(x.area) || "No area") + " " + x.n; }).join(" · ") : ""
    };
    state.reviewSaving = true;
    render(true);
    apiPost({ action: "savereview", review: review }).then(function (j) {
      state.weeks[wk] = state.weeks[wk] || { fetched: 0, done: [], picked: [], review: null };
      state.weeks[wk].review = j.review;
      savedWeeks[wk] = Date.now();
      if (state.rlog) {
        state.rlog.reviews = state.rlog.reviews.filter(function (r) { return r.week !== wk; }).concat([j.review]).sort(function (a, b) { return a.week < b.week ? 1 : -1; });
        lsSet(LS_RLOG, state.rlog);
      }
      var all = drafts(); delete all[wk]; lsSet(LS_RDRAFT, all);
      saveWeeks();
      toast(j.created ? "Review saved to Notion" : "Review updated in Notion");
    }).catch(function (err) {
      toast("Not saved: " + describeTasks(err) + " Your writing is kept on this iPad.");
    }).then(function () {
      state.reviewSaving = false;
      render(true);
    });
  }

  /* ---------- Review log (landing page) ---------- */
  /* REVIEW opens here: what's due, trends from saved reviews, and every week by
     month. Tapping a week opens it on the Review screen above; ALL REVIEWS comes
     back. The numbers are the ones stored with each saved review (bridge 1.7). */
  var RLOG_FRESH_MS = 2 * 60 * 1000;
  function canReviewLog() { return state.caps.indexOf("reviewlog") > -1; }
  function loadReviewLog(force) {
    if (!state.conn || !canReviewLog() || state.rlogInflight) return;
    if (!force && state.rlog && Date.now() - state.rlog.fetched < RLOG_FRESH_MS) return;
    if (!force && state.rlogErr && Date.now() - state.rlogErr.at < FRESH_MS) return;
    state.rlogInflight = true;
    api({ action: "reviews", limit: 60 }).then(function (j) {
      state.rlog = { fetched: Date.now(), reviews: j.reviews || [] };
      state.rlog.reviews.forEach(function (r) { savedWeeks[r.week] = Date.parse(r.saved) || Date.now(); });
      state.rlogErr = null;
      lsSet(LS_RLOG, state.rlog);
      saveWeeks();
    }).catch(function (err) {
      state.rlogErr = { at: Date.now(), code: err.code, msg: describeTasks(err) };
    }).then(function () {
      state.rlogInflight = false;
      if (state.screen === "review" && state.rvLog) render(true);
    });
  }
  /* Saved reviews by week; a week fetched or saved on the Review screen wins, being newer. */
  function reviewMap() {
    var m = {};
    ((state.rlog && state.rlog.reviews) || []).forEach(function (r) { m[r.week] = r; });
    Object.keys(state.weeks).forEach(function (k) { if (state.weeks[k].review) m[k] = state.weeks[k].review; });
    return m;
  }
  /* Every week from this one back to the first saved review (at least last week), newest first. */
  function logWeeks(now) {
    var cur = sow(now), map = reviewMap(), keys = Object.keys(map).concat(Object.keys(savedWeeks)).sort();
    var first = keys.length ? sow(parseYmd(keys[0])) : cur, due = reviewDue(now), dueK = due ? ymd(due) : "";
    if (first > addDays(cur, -7)) first = addDays(cur, -7);
    var out = [];
    for (var w = cur, i = 0; w >= first && i < 104; w = addDays(w, -7), i++) {
      var k = ymd(w), r = map[k] || null;
      out.push({ w0: w, wk: k, r: r, status: r || savedWeeks[k] ? "saved" : k === dueK ? "due" : k === ymd(cur) ? "cur" : "missed" });
    }
    return out;
  }
  function rlPill(st) {
    return { cur: '<span class="pill inprog">IN PROGRESS</span>', due: '<span class="pill warn">DUE</span>', saved: '<span class="pill ok">SAVED</span>', missed: '<span class="pill">NOT SAVED</span>' }[st];
  }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function hasDraft(wk) { var d = drafts()[wk]; return !!d && Object.keys(d).some(function (k) { return String(d[k] || "").trim(); }); }

  /* Charts: SVG drawn at about the screen's pixel width so labels stay at label size. Tap or hover a week for its values. */
  function chartWidth(half) {
    var c = $("content"), w = Math.max(280, Math.min(980, (c ? c.clientWidth : 900) - 34));
    return half && w > 640 ? Math.floor((w - 36) / 2) : w;
  }
  function svgOpen(vw, vh, label) { return '<svg class="rl-svg" viewBox="0 0 ' + vw + " " + vh + '" role="img" aria-label="' + label + '">'; }
  function gridLine(x1, x2, y, label) { return '<line class="g" x1="' + x1 + '" x2="' + x2 + '" y1="' + y + '" y2="' + y + '"/><text x="' + (x1 - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + label + "</text>"; }
  function hitRect(x, y, w, h, title, line) { return '<rect class="hit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" data-tip="' + esc(title + "|" + line) + '"/>'; }
  function wkNo(x) { return isoWeek(x.w0); }
  function hoursChart(weeks) {
    var VW = chartWidth(false), VH = 210, L = 40, R = 8, T = 22, B = 28, n = weeks.length, cw = (VW - L - R) / n, bw = Math.max(8, Math.min(40, cw - 12));
    var top = 10;
    weeks.forEach(function (x) { if (x.r && num(x.r.hoursWork)) top = Math.max(top, x.r.hoursWork + (x.r.hoursPersonal || 0) + (x.r.hoursFarm || 0)); });
    top = Math.ceil(top / 10) * 10;
    var y = function (v) { return T + (VH - T - B) * (1 - v / top); }, best = null;
    var s = svgOpen(VW, VH, "Hours per week, Work and Personal") + gridLine(L, VW - R, y(0), "0") + gridLine(L, VW - R, y(top / 2), top / 2) + gridLine(L, VW - R, y(top), top);
    weeks.forEach(function (x, i) {
      var bx = L + i * cw + (cw - bw) / 2, r = x.r, lab = '<text x="' + (bx + bw / 2) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!r || !num(r.hoursWork)) {
        s += '<rect class="gap" x="' + bx + '" y="' + T + '" width="' + bw + '" height="' + (y(0) - T) + '" rx="4"/>' + lab +
          hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), x.status === "cur" ? "In progress" : x.status === "due" ? "Not saved yet" : r ? "Saved without hours" : "Not saved");
        return;
      }
      var wv = r.hoursWork, pv = r.hoursPersonal || 0, fv = r.hoursFarm || 0, yw = y(wv), yp = y(wv + pv), yf = y(wv + pv + fv);
      s += '<rect class="b-work" x="' + bx + '" y="' + yw + '" width="' + bw + '" height="' + Math.max(0, y(0) - yw) + '"' + (pv || fv ? "" : ' rx="4"') + "/>";
      if (pv) s += '<rect class="b-personal" x="' + bx + '" y="' + yp + '" width="' + bw + '" height="' + Math.max(0, yw - yp - 2) + '"' + (fv ? "" : ' rx="4"') + "/>";
      if (fv) s += '<rect class="b-farm" x="' + bx + '" y="' + yf + '" width="' + bw + '" height="' + Math.max(0, yp - yf - 2) + '" rx="4"/>';
      best = { x: bx + bw / 2, y: yf, v: wv + pv + fv };
      s += lab + hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), "Work " + hrsLabel(wv).toLowerCase() + " · Personal " + hrsLabel(pv).toLowerCase() + (fv ? " · " + areaName("farm") + " " + hrsLabel(fv).toLowerCase() : "") + " · " + hrsLabel(wv + pv + fv).toLowerCase() + " total");
    });
    if (best) s += '<text class="v" x="' + best.x + '" y="' + (best.y - 6) + '" text-anchor="middle">' + hrsLabel(best.v) + "</text>";
    return s + "</svg>";
  }
  function keptChart(weeks) {
    var VW = chartWidth(true), VH = 190, L = 44, R = 10, T = 16, B = 28, n = weeks.length, cw = (VW - L - R) / n;
    var y = function (v) { return T + (VH - T - B) * (1 - v / 100); }, xp = function (i) { return L + i * cw + cw / 2; };
    var s = svgOpen(VW, VH, "Priorities kept, percent per week") + gridLine(L, VW - R, y(0), "0%") + gridLine(L, VW - R, y(50), "50%") + gridLine(L, VW - R, y(100), "100%");
    var seg = [], segs = [], dots = "";
    weeks.forEach(function (x, i) {
      var r = x.r, ok = r && num(r.picked) && r.picked > 0 && num(r.pickedDone);
      s += '<text x="' + xp(i) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!ok) { if (seg.length) { segs.push(seg); seg = []; } return; }
      var pc = Math.round(r.pickedDone / r.picked * 100);
      seg.push([xp(i), y(pc)]);
      dots += '<circle class="dot" cx="' + xp(i) + '" cy="' + y(pc) + '" r="4.5"/>' + hitRect(xp(i) - cw / 2, T, cw, VH - T - B, "WEEK " + wkNo(x), r.pickedDone + " of " + r.picked + " kept · " + pc + "%");
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (sg) { s += '<polyline class="ln" points="' + sg.map(function (p) { return p.join(","); }).join(" ") + '"/>'; });
    return s + dots + "</svg>";
  }
  function doneChart(weeks) {
    var VW = chartWidth(true), VH = 190, L = 36, R = 10, T = 16, B = 28, n = weeks.length, cw = (VW - L - R) / n, bw = Math.max(6, Math.min(22, cw - 10)), top = 5;
    weeks.forEach(function (x) { if (x.r && num(x.r.tasksDone)) top = Math.max(top, x.r.tasksDone); });
    top = Math.ceil(top / 5) * 5;
    var y = function (v) { return T + (VH - T - B) * (1 - v / top); };
    var s = svgOpen(VW, VH, "Tasks finished per week") + gridLine(L, VW - R, y(0), "0") + gridLine(L, VW - R, y(top), top);
    weeks.forEach(function (x, i) {
      var bx = L + i * cw + (cw - bw) / 2, r = x.r;
      s += '<text x="' + (bx + bw / 2) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!r || !num(r.tasksDone)) return;
      s += '<rect class="b-done" x="' + bx + '" y="' + y(r.tasksDone) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(r.tasksDone)) + '" rx="' + (r.tasksDone ? 4 : 0) + '"/>' +
        hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), r.tasksDone + (r.tasksDone === 1 ? " task" : " tasks") + " finished");
    });
    return s + "</svg>";
  }
  /* "Area 3 · Other area 1" (stored with each review) summed over the weeks. */
  function areaTotals(weeks) {
    var by = {};
    weeks.forEach(function (x) {
      String((x.r && x.r.byArea) || "").split(" · ").forEach(function (part) {
        var m = /^(.*\S)\s+(\d+)$/.exec(part.trim());
        if (m) by[m[1]] = (by[m[1]] || 0) + (+m[2]);
      });
    });
    return Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); }).slice(0, 8).map(function (k) { return { area: k, n: by[k] }; });
  }
  var rlTip = null;
  function showTip(el) {
    hideTip();
    var parts = (el.getAttribute("data-tip") || "").split("|"), box = el.closest(".rl-chart");
    if (!box) return;
    var r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    rlTip = document.createElement("div");
    rlTip.className = "rl-tip";
    rlTip.innerHTML = "<b>" + esc(parts[0]) + "</b><br>" + esc(parts[1] || "");
    rlTip.style.left = Math.max(80, Math.min(b.width - 80, r.left - b.left + r.width / 2)) + "px";
    rlTip.style.top = (r.top - b.top + 8) + "px";
    box.appendChild(rlTip);
  }
  function hideTip() { if (rlTip) { rlTip.remove(); rlTip = null; } }

  function renderReviewLog() {
    hideTip();
    var now = new Date(), cur = sow(now), all = logWeeks(now), due = reviewDue(now), html = '<div class="rv">';
    var stillDue = due && !reviewSaved(ymd(due));

    /* up next */
    var card = function (w0, kind) {
      var wk = ymd(w0), w = state.weeks[wk], sub;
      if (kind === "due") sub = "Due now. Not saved yet · about 5 minutes" + (hasDraft(wk) ? " · draft started" : "");
      else if (kind === "saved") sub = "Saved · tap to read or update";
      else sub = "In progress" + (w ? " · " + w.done.length + " finished so far" : "") + " · due Sunday" + (hasDraft(wk) ? " · draft started" : "");
      return '<button type="button" class="rl-card ' + kind + '" data-rweek="' + wk + '"><span class="st"></span><span class="tx"><b>' + weekLabel(w0) + "</b><small>" + sub + "</small></span>" +
        (kind === "due" ? '<span class="pill warn">REVIEW NOW</span>' : rlPill(kind)) + "</button>";
    };
    html += "<section>" + phead("UP NEXT", "DUE SUNDAY 14:00 TO TUESDAY NIGHT") + '<div class="rl-up">' +
      (stillDue ? card(due, "due") : "") + (stillDue && ymd(due) === ymd(cur) ? "" : card(cur, reviewSaved(ymd(cur)) ? "saved" : "cur")) + "</div>";
    if (!canReviews()) html += stubBox(state.conn ? "Saving reviews needs bridge 1.5. Steps are in the README under <b>Bridge 1.5</b>." : "Link calendars first.");
    html += "</section>";

    /* trends */
    var win = all.slice(0, 12).reverse(), savedW = win.filter(function (x) { return x.r; });
    var meta = "LAST " + win.length + (win.length === 1 ? " WEEK" : " WEEKS");
    if (!canReviews()) { /* nothing to show yet */ }
    else if (!canReviewLog()) html += "<section>" + phead("TRENDS", "", "chrome-a") + stubBox("Trends and the full list of reviews need bridge 1.7. Steps are in the README under <b>Bridge 1.7</b>.") + "</section>";
    else if (state.rlogErr && !state.rlog) html += "<section>" + phead("TRENDS", "", "chrome-a") + '<div class="err">' + rlogErrText() + "</div></section>";
    else if (!state.rlog) html += "<section>" + phead("TRENDS", "", "chrome-a") + '<div class="empty">Loading your saved reviews from Notion…</div></section>';
    else if (!savedW.length) html += "<section>" + phead("TRENDS", meta, "chrome-a") + '<div class="empty">Trends appear here once you\'ve saved a review.</div></section>';
    else {
      var eligible = win.filter(function (x) { return x.r || x.status === "missed"; }).length, streak = 0;
      for (var i = 0; i < all.length; i++) {
        if (all[i].status === "saved") streak++;
        else if (all[i].status === "missed") break;
      }
      var avg = function (list, f) { return list.length ? list.reduce(function (s, x) { return s + f(x); }, 0) / list.length : null; };
      var kept = savedW.filter(function (x) { return num(x.r.picked) && x.r.picked > 0 && num(x.r.pickedDone); });
      var hrs = savedW.filter(function (x) { return num(x.r.hoursWork); });
      var kAvg = avg(kept, function (x) { return x.r.pickedDone / x.r.picked; }), wAvg = avg(hrs, function (x) { return x.r.hoursWork; }), pAvg = avg(hrs, function (x) { return x.r.hoursPersonal || 0; });
      var areas = areaTotals(win);
      html += pnl("rtrends", phead("TRENDS", meta + " · FROM SAVED REVIEWS", "chrome-a", moreBtn("rtrends", "trends")) +
        '<div class="rl-stats">' +
        '<div class="rl-stat"><b class="tnum">' + savedW.length + "/" + Math.max(eligible, savedW.length) + '</b><span>REVIEWS SAVED</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + streak + '</b><span>WEEK STREAK</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + (kAvg === null ? "NONE" : Math.round(kAvg * 100) + "%") + '</b><span>PRIORITIES KEPT, AVG</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + (wAvg === null ? "NONE" : Math.round(wAvg) + "H · " + Math.round(pAvg) + "H") + '</b><span>WORK · PERSONAL, AVG</span></div></div>' +
        '<div class="rl-charts">' +
        '<div class="rl-chart wide"><h3>HOURS PER WEEK</h3><div class="sub">Calendar time, ignored events left out. Week numbers along the bottom.</div>' + hoursChart(win) +
        '<div class="rl-legend"><span><i class="a-work"></i>WORK</span><span><i class="a-personal"></i>PERSONAL</span>' + (win.some(function (x) { return x.r && x.r.hoursFarm; }) ? '<span><i class="a-farm"></i>' + AREAS.farm.name + "</span>" : "") + '<span><i class="gap"></i>NOT SAVED</span></div></div>' +
        habitsTrend(win) +
        '<div class="rl-chart ov-extra"><h3>PRIORITIES KEPT</h3><div class="sub">Share of the week\'s picks marked done.</div>' + keptChart(win) + "</div>" +
        '<div class="rl-chart ov-extra"><h3>TASKS FINISHED</h3><div class="sub">Marked done in the Master Task List.</div>' + doneChart(win) + "</div>" +
        '<div class="rl-chart wide ov-extra"><h3>WHERE THE WORK WENT</h3><div class="sub">Tasks finished by Life Area, ' + meta.toLowerCase().replace("last ", "") + ".</div>" +
        (areas.length ? '<div class="rl-areas">' + areas.map(function (a) {
          return '<div class="rl-arow"><span class="bn">' + esc(a.area) + '</span><span class="track"><span style="width:' + Math.round(a.n / areas[0].n * 100) + '%"></span></span><span class="v tnum">' + a.n + "</span></div>";
        }).join("") + "</div>" : '<div class="empty">No finished tasks in these reviews.</div>') + "</div></div>" +
        patternsBox(all) + (state.rlogErr ? stale(state.rlog.fetched) : ""));
    }

    /* all reviews */
    html += "<section>" + phead("ALL REVIEWS", "TAP A WEEK");
    var lastM = "";
    all.forEach(function (x) {
      var end = addDays(x.w0, 6), m = MONL[end.getMonth()] + " " + end.getFullYear(), r = x.r;
      if (m !== lastM) { html += (lastM ? "</div>" : "") + '<div class="rl-month"><div class="rl-mlabel">' + m + "</div>"; lastM = m; }
      var bits = [];
      if (r) {
        if (num(r.hoursWork)) bits.push("WORK <b>" + hrsLabel(r.hoursWork) + "</b>");
        if (num(r.hoursPersonal)) bits.push("PERSONAL <b>" + hrsLabel(r.hoursPersonal) + "</b>");
        if (num(r.tasksDone)) bits.push("<b>" + r.tasksDone + "</b> FINISHED");
        if (num(r.picked) && r.picked > 0) bits.push("<b>" + (r.pickedDone || 0) + "/" + r.picked + "</b> PICKS KEPT");
      }
      var nums = bits.length ? bits.join(" · ") : x.status === "saved" ? "Saved" : x.status === "missed" ? "No review saved" : x.status === "due" ? "Ready to review" : "Week in progress";
      var focus = r && (r.nextFocus || r.wentWell), snip = focus ? "<em>" + (r.nextFocus ? "NEXT FOCUS" : "WENT WELL") + "</em> " + esc(focus.split("\n")[0])
        : hasDraft(x.wk) ? "<em>DRAFT</em> Started on this iPad" : x.status === "missed" ? "<em>NOTE</em> You can still write it" : "";
      html += '<button type="button" class="rl-row ' + x.status + '" data-rweek="' + x.wk + '"><span class="st"></span><span class="rlw"><b>WEEK ' + wkNo(x) + "</b><small>" + weekLabel(x.w0).replace(/^WEEK \d+ · /, "") + "</small></span>" +
        '<span class="tx"><span class="nums tnum">' + nums + "</span>" + (snip ? '<span class="snip">' + snip + "</span>" : "") + '</span><span class="end">' + rlPill(x.status) + '<span class="tri r"></span></span></button>';
    });
    html += "</div></section></div>";
    $("content").innerHTML = html;
    loadReviewLog(false);
    if (due && canReviews() && !reviewSaved(ymd(due))) loadWeek(due, false);
    loadWeek(cur, false);
  }
  function rlogErrText() {
    var e = state.rlogErr;
    return e.code === "notion_not_shared" ? "Weekly Reviews isn't connected to the TimothyOS integration. In Notion: Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(e.msg);
  }

  /* Patterns: Claude reads the saved reflections (Sonnet, no tools). Kept on this iPad until you ask again. */
  function patternSource(all) {
    return all.filter(function (x) { return x.r && (x.r.wentWell || x.r.drained || x.r.nextFocus || x.r.bearing); }).slice(0, 26);
  }
  function patternsBox(all) {
    var src = patternSource(all), p = lsGet(LS_RPAT), enough = src.length >= 2;
    var btn = '<button type="button" class="btn ask" data-act="patterns"' + (!canAsk() || !enough || state.patternsBusy || navigator.onLine === false ? " disabled" : "") + ">" +
      (state.patternsBusy ? "READING…" : p ? "FIND AGAIN" : "FIND PATTERNS") + "<small>" + (canAsk() ? "SONNET · ABOUT 8¢" : "SETUP") + "</small></button>";
    var html = '<div class="rl-pat"><span class="st"></span><span class="tx"><b>PATTERNS ACROSS YOUR REVIEWS</b><small>' +
      (!enough ? "Needs two saved reviews with writing." : "Claude reads your " + src.length + " saved reflections and names what keeps coming up.") + "</small></span>" + btn + "</div>";
    if (p && p.text) {
      var lines = p.text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      html += '<div class="rl-patout"><div class="ov-sub">FROM ' + p.n + " REVIEWS · " + esc(stamp(p.at)) + " · " + money(p.cost || 0) + "</div><ul>" +
        lines.map(function (l) { return "<li>" + esc(l.replace(/^[-*•]\s*/, "")) + "</li>"; }).join("") + "</ul></div>";
    }
    return html;
  }
  function findPatterns() {
    var src = patternSource(logWeeks(new Date()));
    if (src.length < 2 || !canAsk()) return;
    var ctx = src.map(function (x) {
      var r = x.r, n = [];
      if (num(r.hoursWork)) n.push("Work " + r.hoursWork + "h, Personal " + (r.hoursPersonal || 0) + "h");
      if (num(r.tasksDone)) n.push(r.tasksDone + " tasks finished");
      if (num(r.picked) && r.picked) n.push((r.pickedDone || 0) + " of " + r.picked + " priorities kept");
      return weekLabel(x.w0) + (n.length ? " (" + n.join(", ") + ")" : "") +
        "\nWhat went well: " + (r.wentWell || "(blank)") + "\nWhat drained me: " + (r.drained || "(blank)") +
        "\nNext focus: " + (r.nextFocus || "(blank)") + "\nWhere I held my bearing: " + (r.bearing || "(blank)");
    }).join("\n\n");
    state.patternsBusy = true;
    render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "patterns", messages: [{ role: "user", text: "What patterns do you see across my weekly reviews?" }], context: "SAVED WEEKLY REVIEWS, NEWEST FIRST\n\n" + ctx, ignore: ignoreList }, 150000).then(function (j) {
      lsSet(LS_RPAT, { at: Date.now(), text: j.reply, cost: j.cost, n: src.length });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Patterns found (" + money(j.cost) + ")");
    }).catch(function (err) { toast(describeAi(err)); }).then(function () { state.patternsBusy = false; render(true); });
  }

  /* --- Systems: Bridge settings --- */
  function bridgeSection() {
    var pl = place(), start = lsGet(LS_START) || "bridge";
    return "<section>" + phead("BRIDGE", "SAVED ON THIS IPAD") + '<dl class="kv">' +
      '<dt>OPENS ON</dt><dd><div class="chips">' + [["bridge", "BRIDGE"], ["today", "TODAY"]].map(function (o) {
        return '<button type="button" class="chip" data-start="' + o[0] + '" aria-pressed="' + (start === o[0]) + '">' + o[1] + "</button>";
      }).join("") + "</div></dd>" +
      "<dt>LOCATION</dt><dd>" + (pl ? '<span class="tnum">' + esc(placeKey(pl)) + "</span>" + (pl.name ? " · " + esc(pl.name) : "") : '<span class="muted">Not set. Weather, hive check and frost watch stay off.</span>') +
      '<div class="ov-place"><input type="text" id="placeIn" placeholder="Latitude, longitude (e.g. 44.98, -93.27)" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn" data-act="placesave">SAVE</button><button type="button" class="btn ghost" data-act="geo">USE THIS IPAD\'S LOCATION</button>' +
      (pl ? '<button type="button" class="btn ghost" data-act="placeclear">CLEAR</button>' : "") + "</div>" +
      '<small class="muted">Rounded to about 1 km. Weather requests send only these numbers to Open-Meteo.</small></dd>' +
      '<dt>BEARINGS</dt><dd><textarea id="bearIn" rows="5" placeholder="One per line. The Bridge shows one each day.">' + esc(bearings().join("\n")) + "</textarea>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="bearsave">SAVE BEARINGS</button></div></dd>' +
      '</dl><div class="err" id="bridgeErr" role="alert"></div></section>';
  }
  function setPlace(lat, lon, name) {
    lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100;
    lsSet(LS_PLACE, { lat: lat, lon: lon, name: name || "" });
    state.wx = null; state.wxErr = null; lsDel(LS_WX);
    toast("Location saved. Weather loads on the Bridge.");
    render(true);
    loadWeather(true);
  }
  function bridgeAct(act) {
    var err = $("bridgeErr");
    if (act === "placesave") {
      var m = ($("placeIn").value || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { err.textContent = "Type latitude and longitude as two numbers, like 44.98, -93.27."; return; }
      setPlace(+m[1], +m[2]);
    } else if (act === "geo") {
      if (!navigator.geolocation) { err.textContent = "This browser can't share its location. Type the numbers instead."; return; }
      err.textContent = "";
      toast("Asking for location…");
      navigator.geolocation.getCurrentPosition(function (pos) { setPlace(pos.coords.latitude, pos.coords.longitude); },
        function () { var e2 = $("bridgeErr"); if (e2) e2.textContent = "Location wasn't shared. Allow it in Settings, or type the numbers instead."; },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    } else if (act === "placeclear") {
      lsDel(LS_PLACE); lsDel(LS_WX); state.wx = null;
      toast("Location cleared. Weather is off.");
      render(true);
    } else if (act === "bearsave") {
      var list = $("bearIn").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
      if (list.length) lsSet(LS_BEARINGS, list); else lsDel(LS_BEARINGS);
      toast(list.length ? list.length + (list.length === 1 ? " bearing saved" : " bearings saved") : "Bearings cleared");
      render(true);
    }
  }

  /* ---------- Ask (Claude) ---------- */
  /* Questions go to the bridge with a snapshot of what the app knows; the bridge
     asks Claude, which can read more through the bridge but never changes
     anything. Suggested changes come back as cards: nothing happens until
     CONFIRM, and then the app makes the change exactly as a tap would.
     The conversation stays on this iPad (6 hours, or until NEW CHAT). */
  var ASK_TTL_MS = 6 * 3600 * 1000, SNAPSHOT_MS = 30 * 60 * 1000;
  var askState = lsGet(LS_ASK);
  var askBusy = false;
  function canAsk() { return state.caps.indexOf("ask") > -1; }
  function saveAsk() { lsSet(LS_ASK, askState); }
  function freshAsk() {
    if (!askState || Date.now() - askState.started > ASK_TTL_MS) askState = { started: Date.now(), deep: askState ? askState.deep : false, msgs: [], context: "", contextAt: 0 };
    if (!askState.context || Date.now() - askState.contextAt > SNAPSHOT_MS) { askState.context = briefing(); askState.contextAt = Date.now(); }
    saveAsk();
  }
  function money(usd) { return usd < 1 ? (Math.round(usd * 1000) / 10) + "¢" : "$" + usd.toFixed(2); }
  function spendLine(s) { return s ? "$" + s.usd.toFixed(2) + " OF $" + s.budget.toFixed(2) + " THIS MONTH" : ""; }
  function modelName(m) { return /haiku/.test(m || "") ? "HAIKU" : /sonnet/.test(m || "") ? "SONNET" : String(m || "").toUpperCase(); }
  function describeAi(err) {
    var code = err && (err.code || err.message), s = state.aiSpend;
    return {
      ai_not_configured: "Ask isn't set up yet. Add ANTHROPIC_API_KEY to the bridge's Script Properties (README, Ask Claude).",
      ai_budget: "Ask is paused: this month's budget" + (s ? " ($" + s.budget.toFixed(2) + ")" : "") + " is used. It resumes on the 1st, or raise AI_BUDGET_USD in Script Properties.",
      ai_console_limit: "The spend limit in the Claude Console was reached. It resumes next month, or raise it at platform.claude.com.",
      ai_no_credit: "Your Claude Console credit is used up. Add credit at platform.claude.com (auto-reload stays off).",
      ai_unauthorized: "Claude didn't accept the API key. Check ANTHROPIC_API_KEY in Script Properties.",
      ai_busy: "Claude is busy right now. Try again in a minute.",
      ai_error: "Claude returned an error" + (err && err.detail ? ": " + err.detail : ".")
    }[code] || describeTasks(err);
  }

  /* What the app knows right now, as plain text for Claude. Ignored events are already left out. */
  function briefing() {
    var now = new Date(), today = ymd(now), list = eventsFor(bridgeRange()), out = [];
    var line = function (e) { return e.allDay ? "all day · " + AREAS[e.area].name + " · " + e.title : hm(e._s) + "-" + hm(e._e) + " · " + AREAS[e.area].name + " · " + e.title + (e.pending ? " (not saved yet)" : ""); };
    out.push("NOW: " + DOWL[now.getDay()] + " " + today + " " + hm(now) + " (iPad local time). Week starts Monday.");
    if (hasFarm()) out.push("CALENDARS: WORK (read-only), PERSONAL, " + AREAS.farm.name + " (farm and bees; calendar 'farm' for proposals)");
    var items = conditions(now, today, list);
    out.push("CONDITION: " + (items.some(function (i) { return i.lvl === "bad"; }) ? "RED" : items.length ? "YELLOW" : "GREEN") +
      (items.length ? " · " + items.map(function (i) { return i.txt + " (" + unesc(i.sub.replace(/<[^>]+>/g, "")) + ")"; }).join(" · ") : ""));
    var de = dayEvents(list, now);
    out.push("TODAY:\n" + (de.allDay.concat(de.timed).map(function (e) { return "- " + line(e); }).join("\n") || "- nothing on the calendar"));
    var days = [];
    for (var i = 1; i < 7; i++) {
      var d = addDays(sod(now), i), dd = dayEvents(list, d);
      days.push(DOW[d.getDay()] + " " + ymd(d) + ": " + (dd.allDay.concat(dd.timed).map(line).join("; ") || "nothing"));
    }
    out.push("NEXT 6 DAYS:\n" + days.join("\n"));
    if (!hasData(bridgeRange())) out.push("(Calendar data may be incomplete: last sync " + (state.sync.at ? stamp(state.sync.at) : "never") + ".)");
    var data = canPlan() ? state.tasks[today] : null;
    if (data) {
      var t = function (x) { return "- [" + x.id + "] " + x.title + " · " + [x.status, x.priority, x.area, x.due ? "due " + x.due : "", x.focus ? "picked " + x.focus : ""].filter(Boolean).join(" · "); };
      out.push("PRIORITIES PICKED FOR TODAY:\n" + (data.focus.map(t).join("\n") || "- none picked yet"));
      out.push("OPEN TASKS (most urgent first, up to 40 of " + data.open.length + "):\n" + (rankTasks(data.open).slice(0, 40).map(t).join("\n") || "- none"));
    } else out.push("TASKS: not loaded. Use get_tasks.");
    if (canDates() && state.dates) {
      var kd = occurrences(today, ymd(addDays(now, 60))).map(function (o) { return "- " + o.s + (o.e !== o.s ? " to " + o.e : "") + " · " + o.d.title + " · " + [o.d.type, o.d.area, o.d.yearly ? "yearly" : "", countdown(o, today)].filter(Boolean).join(" · "); });
      out.push("KEY DATES (next 60 days):\n" + (kd.join("\n") || "- none"));
    }
    var j = wxData();
    if (j) {
      var c = j.current || {}, dl = j.daily, di = Math.max(0, dl.time.indexOf(today)), hv = hiveCheck(now), fr = frost(now);
      out.push("WEATHER: " + Math.round(c.temperature_2m) + "°F " + wxText(c.weather_code).toLowerCase() + ", high " + Math.round(dl.temperature_2m_max[di]) + " low " + Math.round(dl.temperature_2m_min[di]) +
        (hv ? "; hive check " + (hv.go ? "GO, " : "HOLD, ") + hv.text.toLowerCase() + " (" + hv.label.toLowerCase() + ")" : "") + (fr ? "; tonight's low " + Math.round(fr.low) + "°F" : ""));
    }
    var log = (lsGet(LS_LOG) || {})[today], b = bearingFor(today);
    if (log) out.push("TODAY'S INTENT: " + log);
    if (b) out.push("TODAY'S BEARING: " + b);
    if (data) out.push("LIFE AREAS: " + data.areas.join(" | ") + "\nPRIORITY NAMES: " + data.priorities.join(" | "));
    if (state.dates && state.dates.types) out.push("KEY DATE TYPES: " + state.dates.types.join(" | "));
    if (ignoreList.length) out.push("IGNORED EVENT TITLES (booking blocks, left out everywhere): " + ignoreList.join(" | "));
    var fin = ledgerBrief();
    if (fin) out.push(fin);
    return out.join("\n\n");
  }

  function unesc(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
  /* Weekly summary for the Review screen: Sonnet, no tools, from the week's numbers and your reflection. */
  function writeSummary() {
    var w0 = sow(state.anchor), wk = ymd(w0), st = weekStats(w0), w = state.weeks[wk], d = drafts()[wk] || {}, saved = w && w.review;
    var f = function (k) { var el = $("rv-" + k); return el ? el.value.trim() : d[k] || (saved && saved[k]) || ""; };
    var lines = [weekLabel(w0) + (st.cur ? " (in progress, numbers so far)" : ""),
      "Hours: Work " + hrsLabel(st.work) + (st.cur ? "" : " (week before " + hrsLabel(st.prevWork) + ")") + ", Personal " + hrsLabel(st.personal) + (st.cur ? "" : " (week before " + hrsLabel(st.prevPersonal) + ")") +
        (hasFarm() ? ", " + areaName("farm") + " (farm and bees) " + hrsLabel(st.farm) + (st.cur ? "" : " (week before " + hrsLabel(st.prevFarm) + ")") : "") +
        ". Busiest day " + (st.busiest && st.busiest.h ? DOW[st.busiest.d.getDay()] + " " + hrsLabel(st.busiest.h) : "none") + ". Open time 07:00 to 21:00: " + hrsLabel(st.open) + " of 98H. Work events: " + st.meetings + "."];
    if (w) {
      lines.push("Finished (" + st.done + "): " + (w.done.map(function (t) { return t.title + " [" + (bare(t.area) || "no area") + "]"; }).join("; ") || "none"));
      lines.push("Priorities: " + st.pickedDone + " of " + st.picked + " done. Still open: " + (w.picked.filter(function (t) { return t.status !== DONE; }).map(function (t) { return t.title; }).join("; ") || "none"));
    }
    var ins = intents(w0).filter(function (x) { return x.text; });
    if (ins.length) lines.push("Daily intents: " + ins.map(function (x) { return DOW[x.d.getDay()] + " " + x.text; }).join("; "));
    lines.push("His reflection so far. What went well: " + (f("wentWell") || "(blank)") + ". What drained me: " + (f("drained") || "(blank)") + ". Next focus: " + (f("nextFocus") || "(blank)") + ". Where I held my bearing: " + (f("bearing") || "(blank)") + ".");
    state.summaryBusy = true;
    render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "summary", messages: [{ role: "user", text: "Write my weekly summary for " + weekLabel(w0) + "." }], context: lines.join("\n"), ignore: ignoreList }, 150000).then(function (j) {
      saveDraft(wk, "summary", j.reply);
      if ($("rv-summary")) $("rv-summary").value = j.reply;   /* replaces anything typed there, on purpose */
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Summary written (" + money(j.cost) + "). Edit it, then save.");
    }).catch(function (err) { toast(describeAi(err)); }).then(function () { state.summaryBusy = false; render(true); });
  }

  function openAsk() {
    if (!canAsk()) return;
    freshAsk();
    $("askErr").textContent = "";
    renderAsk();
    showSheet("askScrim");
    setTimeout(function () { $("askText").focus(); }, 50);
    loadAiSpend(false);
  }
  function closeAsk() { hideSheet("askScrim"); }
  function propTitle(p) {
    var i = p.input;
    if (p.kind === "add_task") return "ADD TASK · " + i.title;
    if (p.kind === "set_focus") return (i.day === "none" ? "UNPICK · " : "PICK FOR " + dLabel(parseYmd(i.day)) + " · ") + i.task_title;
    if (p.kind === "set_status") return "MARK " + bare(i.status).toUpperCase() + " · " + i.task_title;
    if (p.kind === "add_key_date") return "ADD KEY DATE · " + i.title;
    if (p.kind === "add_event") return "ADD TO " + (i.calendar === "farm" ? AREAS.farm.name : "PERSONAL") + " CALENDAR · " + i.title;
    if (p.kind === "review_draft") return "DRAFT REVIEW · " + weekLabel(sow(parseYmd(i.week_start)));
    return p.kind;
  }
  function propSub(p) {
    var i = p.input;
    if (p.kind === "add_task") return [bare(i.life_area), bare(i.priority), i.focus_day ? "PICKED FOR " + dLabel(parseYmd(i.focus_day)) : ""].filter(Boolean).join(" · ");
    if (p.kind === "add_key_date") return [i.end ? shortDay(i.start) + " TO " + shortDay(i.end) : dLabel(parseYmd(i.start)), bare(i.type), bare(i.life_area), i.yearly ? "YEARLY" : ""].filter(Boolean).join(" · ");
    if (p.kind === "add_event") return dLabel(parseYmd(i.date)) + " · " + (i.all_day ? "ALL DAY" : i.start_time + " · " + (i.minutes || 30) + " MIN");
    if (p.kind === "review_draft") return ["went_well", "drained", "next_focus", "bearing", "summary"].filter(function (k) { return i[k]; }).map(function (k) { return k.replace("_", " ").toUpperCase(); }).join(" · ") + " · YOU SAVE IT ON REVIEW";
    return "";
  }
  function renderAsk() {
    var log = $("askLog"), html = "";
    if (!askState.msgs.length) {
      html = '<div class="askhint"><b>Ask anything about your days.</b><br>For example: What needs me today? · What did I get done this week? · Remind me to call the vet Thursday at 3 · Add a task to order hive frames.' +
        '<br><span class="muted">Answers use your calendars, tasks and key dates. Nothing changes until you tap CONFIRM. THINK HARDER uses a stronger model at about twice the cost.</span></div>';
    }
    askState.msgs.forEach(function (m, mi) {
      if (m.role === "user") { html += '<div class="amsg user">' + esc(m.text) + "</div>"; return; }
      html += '<div class="amsg bot"><div class="atext">' + esc(m.text).replace(/\n/g, "<br>") + '</div><div class="ameta">' + modelName(m.model) + (m.cost != null ? " · " + money(m.cost) : "") + "</div>";
      (m.proposals || []).forEach(function (p, pi) {
        var st = p.state || "pending";
        html += '<div class="prop ' + st + '"><span class="st"></span><span class="tx"><b>' + esc(propTitle(p)) + "</b>" + (propSub(p) ? "<small>" + esc(propSub(p)) + "</small>" : "") +
          (p.note ? '<small class="' + (st === "failed" ? "errtxt" : "") + '">' + esc(p.note) + "</small>" : "") + "</span>" +
          (st === "pending" ? '<span class="btnrow"><button type="button" class="btn ghost" data-pcancel="' + mi + ":" + pi + '">CANCEL</button><button type="button" class="btn" data-pok="' + mi + ":" + pi + '">CONFIRM</button></span>'
            : '<span class="pill' + (st === "done" ? " ok" : st === "failed" ? " bad" : "") + '">' + { working: "WORKING", done: "DONE", cancelled: "CANCELLED", failed: "NOT DONE" }[st] + "</span>") + "</div>";
      });
      html += "</div>";
    });
    if (askBusy) html += '<div class="amsg bot thinking"><div class="atext">' + (askState.deep ? "Thinking harder…" : "Working…") + "</div></div>";
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    $("askDeep").setAttribute("aria-pressed", String(!!askState.deep));
    $("askSend").disabled = askBusy || navigator.onLine === false;
    $("askSend").textContent = askBusy ? "…" : navigator.onLine === false ? "OFFLINE" : "SEND";
    $("askMeter").textContent = spendLine(state.aiSpend);
  }
  function askSend() {
    var text = $("askText").value.trim();
    if (!text || askBusy) return;
    freshAsk();
    askState.msgs.push({ role: "user", text: text.slice(0, 2000) });
    $("askText").value = "";
    $("askErr").textContent = "";
    askBusy = true;
    saveAsk(); renderAsk();
    var turns = askState.msgs.map(function (m) { return { role: m.role, text: m.text }; });
    apiPost({ action: "ask", cid: newCid(), mode: askState.deep ? "deep" : "fast", messages: turns, context: askState.context, ignore: ignoreList }, 150000).then(function (j) {
      askState.msgs.push({ role: "assistant", text: j.reply, model: j.model, cost: j.cost, proposals: (j.proposals || []).map(function (p) { p.state = "pending"; return p; }) });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
    }).catch(function (err) {
      askState.msgs.pop();
      $("askText").value = text;
      if (err && err.spend) state.aiSpend = err.spend;
      $("askErr").textContent = describeAi(err);
    }).then(function () {
      askBusy = false;
      saveAsk(); renderAsk();
    });
  }
  /* CONFIRM: make the change exactly as the app's own buttons would. */
  function runProposal(mi, pi) {
    var p = askState.msgs[mi].proposals[pi], i = p.input, today = ymd(new Date());
    var finish = function (ok, note) { p.state = ok ? "done" : "failed"; p.note = note || ""; saveAsk(); renderAsk(); render(true); };
    var fail = function (err) { finish(false, "Not done: " + describeTasks(err)); };
    p.state = "working"; renderAsk();
    if (p.kind === "add_task") {
      apiPost({ action: "addtask", task: { cid: newCid(), title: i.title.slice(0, 200), area: i.life_area || null, priority: i.priority || null, day: i.focus_day || null } })
        .then(function () { loadTasks(today, true); if (i.focus_day && i.focus_day !== today) loadTasks(i.focus_day, true); finish(true, "Added to your Master Task List."); }, fail);
    } else if (p.kind === "set_focus") {
      apiPost({ action: "focus", id: i.task_id, day: i.day === "none" ? null : i.day })
        .then(function () { loadTasks(today, true); if (i.day !== "none" && i.day !== today) loadTasks(i.day, true); finish(true, i.day === "none" ? "Unpicked." : "Picked."); }, fail);
    } else if (p.kind === "set_status") {
      apiPost({ action: "status", id: i.task_id, status: i.status }).then(function () { loadTasks(today, true); finish(true, "Updated in Notion."); }, fail);
    } else if (p.kind === "add_key_date") {
      state.queue.push({ kind: "date", cid: newCid(), title: i.title.slice(0, 200), start: i.start, end: i.end && i.end !== i.start ? i.end : null, area: i.life_area || null, type: i.type || null, yearly: !!i.yearly, created: Date.now(), attempts: 0 });
      saveQueue(); flushQueue(true); finish(true, "Saving to Key Dates.");
    } else if (p.kind === "add_event") {
      var area = i.calendar === "farm" && WRITABLE.indexOf("farm") > -1 ? "farm" : "personal";
      var item = { cid: newCid(), area: area, title: i.title.slice(0, 200), created: Date.now(), attempts: 0 };
      if (i.all_day) { item.allDay = true; item.start = i.date; item.end = ymd(addDays(parseYmd(i.date), 1)); }
      else {
        var s = parseYmd(i.date), hmv = String(i.start_time).split(":");
        s.setHours(+hmv[0], +hmv[1], 0, 0);
        item.allDay = false; item.start = s.toISOString(); item.end = new Date(s.getTime() + Math.max(5, Math.min(600, i.minutes || 30)) * 60000).toISOString();
      }
      state.queue.push(item); saveQueue(); flushQueue(true); finish(true, "Saving to your " + areaName(area) + " calendar.");
    } else if (p.kind === "review_draft") {
      var wk = ymd(sow(parseYmd(i.week_start)));
      [["went_well", "wentWell"], ["drained", "drained"], ["next_focus", "nextFocus"], ["bearing", "bearing"], ["summary", "summary"]].forEach(function (f) {
        if (!i[f[0]]) return;
        saveDraft(wk, f[1], i[f[0]]);
        if (state.screen === "review" && ymd(sow(state.anchor)) === wk && $("rv-" + f[1])) $("rv-" + f[1]).value = i[f[0]];
      });
      finish(true, "Placed in Review as a draft. Open REVIEW to check and save.");
    } else finish(false, "Unknown change.");
  }
  function openInClaude() {
    var q = $("askText").value.trim() || (askState && askState.msgs.length ? askState.msgs.filter(function (m) { return m.role === "user"; }).slice(-1)[0].text : "");
    var text = "Here is a snapshot from my TimothyOS dashboard. Use it to help me.\n\n" + briefing().replace(/\[[0-9a-f-]{32,36}\] /g, "") + (q ? "\n\nMy question: " + q : "");
    try { navigator.clipboard.writeText(text).catch(function () {}); } catch (e) { /* clipboard not allowed */ }
    var a = document.createElement("a");
    a.href = "https://claude.ai/new?q=" + encodeURIComponent(text.slice(0, 6000));
    a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Snapshot copied. If Claude opens empty, paste it.");
  }
  var aiSpendAt = 0;
  function loadAiSpend(force) {
    if (!state.conn || !canAsk() || (!force && Date.now() - aiSpendAt < FRESH_MS)) return;
    aiSpendAt = Date.now();
    api({ action: "aispend" }).then(function (j) {
      if (j.ai) { state.aiSpend = j.ai; lsSet(LS_AISPEND, j.ai); }
      if (!$("askScrim").hidden) renderAsk();
      if (state.screen === "systems") render(true);
    }).catch(function () { /* shown next time */ });
  }
  function aiSection() {
    var s = state.aiSpend, html = "<section>" + phead("ASK CLAUDE", canAsk() ? "ON" : "OFF");
    if (!canAsk()) return html + '<div class="stubbox"><span class="pill">SETUP</span><span>Needs bridge 1.6 and ANTHROPIC_API_KEY in its Script Properties. Steps are in the README under <b>Ask Claude</b>.</span></div></section>';
    var pct = s ? Math.min(100, Math.round(s.usd / s.budget * 100)) : 0;
    html += '<dl class="kv"><dt>THIS MONTH</dt><dd>' + (s ? '<div class="aimeter"><span style="width:' + pct + '%" class="' + (pct >= 90 ? "hot" : pct >= 60 ? "warm" : "") + '"></span></div><span class="tnum">$' + s.usd.toFixed(2) + " of $" + s.budget.toFixed(2) + " · " + s.calls + " calls</span>" : '<span class="muted">Not loaded yet</span>') + "</dd>" +
      "<dt>MODELS</dt><dd>Haiku 5.5 for questions · Sonnet 5.5 for THINK HARDER and weekly summaries</dd>" +
      "<dt>SAFEGUARDS</dt><dd>Pauses at the budget above (AI_BUDGET_USD). Claude Console spend limit and prepaid credit, auto-reload off. Every change waits for CONFIRM.</dd></dl>" +
      '<small class="muted">Questions and the snapshot of your calendars, tasks and key dates are sent to Anthropic to answer them.</small></section>';
    return html;
  }

  /* ---------- Ledger (YNAB, read-only) + Replicator Queue (Notion) ---------- */
  /* Checking, savings and loans, age of money and average spend come from YNAB
     through the bridge (bridge 1.9, YNAB_TOKEN); nothing here can change YNAB.
     The Replicator Queue is a Notion list of things to buy once the Discretionary
     category can cover them, funded top-down in priority order. */
  var LEDGER_FRESH_MS = 5 * 60 * 1000;
  var LEDGER_RANGES = [3, 6, 12];
  function canLedger() { return state.caps.indexOf("ledger") > -1; }
  function canQueue() { return state.caps.indexOf("queue") > -1; }
  function loadLedger(force) {
    if (!state.conn || !(canLedger() || canQueue()) || state.ledgerInflight) return;
    if (!force && state.ledger && Date.now() - state.ledger.fetched < LEDGER_FRESH_MS) return;
    if (!force && state.ledgerErr && Date.now() - state.ledgerErr.at < FRESH_MS) return;
    state.ledgerInflight = true;
    api({ action: "ledger" }).then(function (j) {
      state.ledger = { fetched: Date.now(), ynab: j.ynab || null, ynabError: j.ynabError || null, queue: j.queue || null, queueError: j.queueError || null };
      state.ledgerErr = null;
      lsSet(LS_LEDGER, state.ledger);
    }).catch(function (err) {
      state.ledgerErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.ledgerInflight = false;
      if (state.screen === "ledger" || state.screen === "systems") render(true);
    });
  }
  function usd(v, cents) {
    if (typeof v !== "number" || !isFinite(v)) return "";
    var s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
    return (v < 0 ? "−$" : "$") + s;
  }
  function ynabErrText(code) {
    return ({
      ynab_not_configured: "Add YNAB_TOKEN in the bridge's Script Properties. Steps are in the README under <b>Ledger</b>.",
      ynab_unauthorized: "YNAB didn't accept the token. Make a new Personal Access Token in YNAB and replace YNAB_TOKEN.",
      ynab_not_found: "YNAB couldn't find that plan. Check YNAB_PLAN_ID, or remove it to use the plan you opened last.",
      ynab_busy: "YNAB asked us to slow down (200 requests an hour). Showing the last numbers; it retries shortly."
    })[code] || "YNAB didn't answer (" + esc(code || "error") + "). Usually temporary.";
  }
  /* Average monthly spend over the last n full months, counting only months the plan was in use. */
  function avgSpend(y, n) {
    var idx = [];
    for (var i = Math.max(0, y.months.length - n); i < y.months.length; i++) {
      if (y.cats.some(function (c) { return c.m[i]; })) idx.push(i);
    }
    return { months: idx.length, cats: y.cats.map(function (c) {
      var tot = idx.reduce(function (s, i) { return s + Math.max(0, c.m[i] || 0); }, 0);
      return { id: c.id, name: c.name, group: c.group, avg: idx.length ? tot / idx.length : 0, now: Math.max(0, c.now || 0), all: c };
    }).filter(function (c) { return c.avg > 0.5 || c.now > 0.5; }).sort(function (a, b) { return b.avg - a.avg || b.now - a.now; }) };
  }
  function aomChart(age) {
    var pts = age.filter(function (a) { return typeof a.days === "number"; });
    if (pts.length < 2) return "";
    var VW = 300, VH = 86, L = 6, R = 10, T = 10, B = 20, n = pts.length, vals = pts.map(function (a) { return a.days; });
    var lo = Math.max(0, Math.floor(Math.min.apply(null, vals) / 10) * 10 - 10), hi = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 10;
    var x = function (i) { return L + i * (VW - L - R) / (n - 1); }, yv = function (v) { return T + (VH - T - B) * (1 - (v - lo) / (hi - lo)); };
    var line = pts.map(function (a, i) { return x(i).toFixed(1) + "," + yv(a.days).toFixed(1); }).join(" ");
    var mon = function (a) { return MON[+a.month.slice(5, 7) - 1]; };
    return '<svg class="lg-spark" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Age of money by month, ' + pts[0].days + " days in " + mon(pts[0]) + " to " + pts[n - 1].days + ' days now">' +
      '<line class="g" x1="' + L + '" x2="' + (VW - R) + '" y1="' + yv(lo) + '" y2="' + yv(lo) + '"/>' +
      '<polygon class="a" points="' + x(0) + "," + yv(lo) + " " + line + " " + x(n - 1) + "," + yv(lo) + '"/><polyline class="l" points="' + line + '"/>' +
      '<circle class="d" cx="' + x(n - 1) + '" cy="' + yv(pts[n - 1].days) + '" r="4.5"/>' +
      '<text x="' + x(0) + '" y="' + (VH - 4) + '">' + mon(pts[0]) + " · " + pts[0].days + 'D</text><text x="' + x(n - 1) + '" y="' + (VH - 4) + '" text-anchor="end">' + mon(pts[n - 1]) + "</text></svg>";
  }

  function renderLedger() {
    var L = state.ledger, now = new Date(), html = '<div class="lg">';
    if (!canLedger() && !canQueue()) {
      $("content").innerHTML = html + "<section>" + phead("LEDGER", "") + stubBox(state.conn ? "The Ledger needs bridge 1.9. Steps are in the README under <b>Ledger</b>." : "Link calendars first.") + "</section></div>";
      return;
    }
    if (!L) {
      $("content").innerHTML = html + "<section>" + phead("LEDGER", "") + '<div class="empty">' + (state.ledgerErr ? esc(state.ledgerErr.msg) : "Loading your ledger…") + "</div></section></div>";
      loadLedger(false);
      return;
    }
    var y = L.ynab;

    /* accounts */
    html += "<section>" + phead("ACCOUNTS", y ? "FROM YNAB · AS OF YOUR LAST ENTRY" : "", null, '<a class="chip lg-open" href="https://app.ynab.com" target="_blank" rel="noopener">OPEN YNAB</a>');
    if (!canLedger()) html += stubBox("Add YNAB_TOKEN in the bridge's Script Properties to show your accounts. Steps are in the README under <b>Ledger</b>.");
    else if (!y) html += '<div class="err">' + ynabErrText(L.ynabError) + "</div>";
    else {
      var chk = y.checking.reduce(function (s, a) { return s + a.balance; }, 0), age = y.age.filter(function (a) { return typeof a.days === "number"; });
      var last = age.length ? age[age.length - 1].days : null, prev = age.length > 3 ? age[age.length - 4].days : null;
      var whole = usd(chk < 0 ? Math.ceil(chk) : Math.floor(chk)), cents = String(Math.round(Math.abs(chk) * 100) % 100); while (cents.length < 2) cents = "0" + cents;
      html += '<div class="lg-money"><div class="lg-hero"><span class="st"></span><div class="in"><span class="ov-sub">CHECKING' + (y.checking.length > 1 ? " · " + y.checking.length + " ACCOUNTS" : "") + "</span>" +
        '<span class="lg-big tnum">' + (y.checking.length ? whole + '<span class="c">.' + cents + "</span>" : "NONE") + "</span>" +
        (y.checking.length > 1 ? '<span class="muted lg-note">' + y.checking.map(function (a) { return esc(a.name) + " " + usd(a.balance, true); }).join(" · ") + "</span>" : '<span class="muted lg-note">Working balance in YNAB, including anything not yet cleared.</span>') + "</div></div>" +
        '<div class="lg-aom"><span class="ov-sub">AGE OF MONEY</span><span class="n tnum">' + (last === null ? "NONE" : last + "<small>DAYS</small>") + "</span>" +
        '<span class="muted lg-note">' + (last === null ? "YNAB shows this after about ten transactions." : (prev === null ? "" : (last >= prev ? "Up " : "Down ") + Math.abs(last - prev) + " days in 3 months. ") + "Money you spend today arrived about " + last + " days ago.") + "</span>" + aomChart(y.age) + "</div></div>";
      var group = function (title, list, loans) {
        if (!list.length) return "";
        var tot = list.reduce(function (s, a) { return s + a.balance; }, 0);
        return '<div class="lg-agroup"><h3 class="ov-sub">' + title + " · " + usd(tot) + (loans ? " OWED" : "") + "</h3>" + list.map(function (a) {
          var paid = loans && a.original ? Math.max(0, Math.min(100, Math.round((1 - Math.abs(a.balance) / a.original) * 100))) : null;
          return '<div class="lg-arow"><span class="nm">' + esc(a.name) + '</span><span class="v tnum">' + usd(a.balance, true) + "</span>" +
            (paid !== null ? '<span class="bar" role="img" aria-label="' + paid + '% paid off"><span style="width:' + paid + '%"></span></span><span class="sub">' + paid + "% paid off · started at " + usd(a.original) + "</span>" : "") + "</div>";
        }).join("") + "</div>";
      };
      var groups = group("SAVINGS", y.savings, false) + group("LOANS", y.loans, true);
      if (groups) html += '<div class="lg-accts">' + groups + "</div>";
    }
    html += "</section>";

    /* average spend */
    if (y) {
      var range = lsGet(LS_LEDGERRANGE) || 6;
      if (LEDGER_RANGES.indexOf(range) === -1) range = 6;
      var av = avgSpend(y, range), open = !!bridgeOpen.lspend, shown = open ? av.cats : av.cats.slice(0, 8);
      var maxA = Math.max.apply(null, [1].concat(av.cats.map(function (c) { return Math.max(c.avg, c.now); })));
      var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      var total = av.cats.reduce(function (s, c) { return s + c.avg; }, 0), nowTot = av.cats.reduce(function (s, c) { return s + c.now; }, 0);
      html += pnl("lspend", phead("AVERAGE SPEND", "PER MONTH · " + (av.months ? "LAST " + av.months + (av.months === 1 ? " MONTH" : " MONTHS") : "NO FULL MONTHS YET"), "chrome-c", av.cats.length > 8 ? moreBtn("lspend", "spending") : "") +
        '<div class="lg-tools"><div class="lg-seg" role="group" aria-label="Averaging period">' + LEDGER_RANGES.map(function (r) {
          return '<button type="button" class="chip" data-lrange="' + r + '" aria-pressed="' + (r === range) + '">' + r + "M</button>";
        }).join("") + '</div><div class="lg-legend"><span><i class="b"></i>AVERAGE MONTH</span><span><i class="t"></i>' + MONL[now.getMonth()] + " SO FAR · DAY " + now.getDate() + " OF " + dim + "</span></div></div>" +
        (av.cats.length ? '<div class="lg-cats">' + shown.map(function (c) {
          var isOpen = state.ledgerCat === c.id;
          return '<button type="button" class="lg-crow" data-lcat="' + esc(c.id) + '" aria-expanded="' + isOpen + '"><span class="nm"><b>' + esc(bare(c.name) || c.name) + "</b><small>" + esc(bare(c.group).toUpperCase()) + "</small></span>" +
            '<span class="track"><span class="b" style="width:' + (c.avg / maxA * 100).toFixed(1) + '%"></span><span class="t" style="left:' + (c.now / maxA * 100).toFixed(1) + '%"></span></span><span class="v tnum">' + usd(c.avg) + "</span></button>" +
            (isOpen ? '<div class="lg-cdetail">' + esc(bare(c.name) || c.name) + ": " + usd(c.avg) + " a month on average over " + av.months + (av.months === 1 ? " month" : " months") + " (" + LEDGER_RANGES.map(function (r) {
              var a2 = avgSpend(y, r).cats.filter(function (x) { return x.id === c.id; })[0];
              return r + "M " + usd(a2 ? a2.avg : 0);
            }).join(" · ") + "). " + MONL[now.getMonth()].charAt(0) + MONL[now.getMonth()].slice(1).toLowerCase() + " so far " + usd(c.now) + ".</div>" : "");
        }).join("") + "</div>" + (open || av.cats.length <= 8 ? "" : '<div class="muted lg-note ov-hint">+' + (av.cats.length - 8) + " smaller categories behind +</div>") +
        '<div class="lg-total"><span class="ov-sub">AVERAGE MONTH</span><span class="muted lg-note">' + MONL[now.getMonth()].charAt(0) + MONL[now.getMonth()].slice(1).toLowerCase() + " so far " + usd(nowTot) + '</span><span class="v tnum">' + usd(total) + "</span></div>"
          : '<div class="empty">No spending recorded in these months yet.</div>'));
    }

    /* replicator queue */
    html += "<section>" + phead("REPLICATOR QUEUE", L.queue ? L.queue.items.length + (L.queue.items.length === 1 ? " ITEM" : " ITEMS") + " · TOP OF THE QUEUE IS FUNDED FIRST" : "", "chrome-d");
    if (!canQueue()) html += stubBox("Needs the Notion link (bridge 1.9). Steps are in the README under <b>Ledger</b>.");
    else if (!L.queue) html += '<div class="err">' + (L.queueError === "notion_not_shared" ? "The Replicator Queue isn't connected to the TimothyOS integration. In Notion: Replicator Queue → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: L.queueError }))) + "</div>";
    else {
      var fund = y && y.fund, left = fund ? fund.balance : 0, busy = state.queueBusy || navigator.onLine === false;
      html += '<div class="lg-fund"><span class="st"></span><span><span class="ov-sub">REPLICATOR RATIONS · YNAB CATEGORY "' + esc(((y && y.fundName) || "Discretionary").toUpperCase()) + '"</span><br>' +
        (fund ? '<b class="tnum">' + usd(fund.balance) + '</b> <span class="muted lg-note">available</span>' : '<span class="muted lg-note">' + (y ? 'No category called "' + esc(y.fundName) + '" in YNAB yet. Create it and the bars below fill from it.' : "Shows once YNAB is connected.") + "</span>") +
        '</span><span class="muted lg-note lg-fundhint">Bars fill down the queue<br>in priority order</span></div><div class="lg-queue">';
      if (!L.queue.items.length) html += '<div class="empty">The queue is empty. Add something below so you don\'t forget it.</div>';
      var inPrice = priceSorted(L.queue.items).every(function (x, i) { return x === L.queue.items[i]; });
      if (L.queue.items.length > 1 && !inPrice) html += '<div class="lg-sortrow"><span class="muted lg-note">Your own order. New items still land by price.</span><button type="button" class="btn ghost sm" data-qprice="1"' + (busy ? " disabled" : "") + ">PRICE ORDER</button></div>";
      L.queue.items.forEach(function (w, i) {
        var cost = typeof w.cost === "number" ? w.cost : 0, got = fund && cost ? Math.min(cost, Math.max(0, left)) : 0;
        left -= cost;
        var ready = fund && cost && got >= cost - 0.005;
        var status = !cost ? '<span class="pill">NO PRICE YET</span>' : !fund ? "" : ready ? '<span class="pill ok">FUNDS READY</span>' : '<span class="pill' + (got > 0 ? " warn" : "") + '">' + usd(cost - got) + " TO GO</span>";
        html += '<div class="lg-witem" data-qid="' + esc(w.id) + '"><span class="rank tnum">' + (i + 1) + '</span><span class="tx"><b>' + esc(w.title) + "</b>" +
          (w.note ? "<small>" + esc(w.note) + "</small>" : "") + (w.link ? '<small><a href="' + esc(w.link) + '" target="_blank" rel="noopener">' + esc(w.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)) + "</a></small>" : "") +
          (fund && cost ? '<span class="fb" role="img" aria-label="' + usd(got) + " of " + usd(cost) + ' funded"><span style="width:' + (got / cost * 100).toFixed(1) + '%"></span></span>' : "") + "</span>" +
          '<span class="right"><span class="cost tnum">' + (cost ? usd(cost) : "") + "</span>" + status + '</span><span class="acts">' +
          (state.queueConfirm === w.id
            ? '<span class="ov-sub">BOUGHT?</span><button type="button" class="btn" data-qyes="' + esc(w.id) + '"' + (busy ? " disabled" : "") + '>YES</button><button type="button" class="btn ghost" data-qno="1">NO</button>'
            : '<button type="button" class="lg-icon" data-qmove="-1" data-qi="' + i + '" aria-label="Move ' + esc(w.title) + ' up"' + (i === 0 || busy ? " disabled" : "") + '><span class="tri u"></span></button>' +
              '<button type="button" class="lg-icon" data-qmove="1" data-qi="' + i + '" aria-label="Move ' + esc(w.title) + ' down"' + (i === L.queue.items.length - 1 || busy ? " disabled" : "") + '><span class="tri d"></span></button>' +
              '<button type="button" class="btn ghost" data-qbought="' + esc(w.id) + '"' + (busy ? " disabled" : "") + ">BOUGHT</button>") + "</span></div>";
      });
      html += '</div><form class="lg-add" id="qForm" autocomplete="off">' +
        '<label class="wide"><span class="ov-sub">ADD TO THE QUEUE</span><input id="qName" maxlength="120" placeholder="e.g. New glasses"></label>' +
        '<label><span class="ov-sub">ROUGH COST</span><input id="qCost" inputmode="decimal" placeholder="$"></label>' +
        '<label class="wide"><span class="ov-sub">NOTE (OPTIONAL)</span><input id="qNote" maxlength="200" placeholder="Why, or where to buy it"></label>' +
        '<button type="submit" class="btn capture"' + (busy ? " disabled" : "") + ">" + (state.queueBusy ? "SAVING…" : "ADD") + "</button></form>";
      if (L.queue.bought.length) html += '<div class="lg-bought"><div class="ov-sub">BOUGHT RECENTLY</div>' + L.queue.bought.map(function (b) {
        return '<div class="lg-brow"><span>' + esc(b.title) + (typeof b.cost === "number" ? " · " + usd(b.cost) : "") + " · " + dLabel(parseYmd(b.bought)) + '</span><button type="button" class="btn ghost" data-qundo="' + esc(b.id) + '"' + (busy ? " disabled" : "") + ">UNDO</button></div>";
      }).join("") + "</div>";
    }
    html += "</section>";
    if (state.ledgerErr) html += stale(L.fetched);
    html += '<small class="muted">Read-only from YNAB: nothing here changes your plan. Ask Claude ' + (lsGet(LS_AIFIN) ? "can see these figures (Systems → Ask Claude)." : "can't see this screen unless you turn it on in Systems.") + "</small></div>";
    $("content").innerHTML = html;
    loadLedger(false);
  }

  function queueSend(body, okMsg) {
    state.queueBusy = true;
    render(true);
    return apiPost(body).then(function (j) {
      if (j.queue && state.ledger) { state.ledger.queue = j.queue; lsSet(LS_LEDGER, state.ledger); }
      if (okMsg) toast(okMsg);
      return j;
    }).catch(function (err) {
      toast("Not saved: " + describeTasks(err));
      loadLedger(true);
    }).then(function (j) { state.queueBusy = false; state.queueConfirm = null; render(true); return j; });
  }
  function queueMove(i, dir) {
    var q = state.ledger && state.ledger.queue;
    if (!q || i + dir < 0 || i + dir >= q.items.length) return;
    var items = q.items.slice(), it = items.splice(i, 1)[0];
    items.splice(i + dir, 0, it);
    q.items = items;   /* shown at once; the bridge confirms */
    var before = tops(".lg-witem", "data-qid");
    var sent = queueSend({ action: "queueorder", ids: items.map(function (x) { return x.id; }) });
    slideFrom(".lg-witem", "data-qid", before);
    sent.then(function () {
      var again = document.querySelector('[data-qid="' + it.id + '"] [data-qmove="' + dir + '"]:not(:disabled)') || document.querySelector('[data-qid="' + it.id + '"] .lg-icon:not(:disabled)');
      if (again) again.focus();
    });
  }
  function queueAddSubmit() {
    var name = $("qName").value.trim(), costRaw = $("qCost").value.trim(), note = $("qNote").value.trim();
    if (!name) { toast("Type what you want to add first."); $("qName").focus(); return; }
    var cost = costRaw ? parseFloat(costRaw.replace(/[^0-9.]/g, "")) : null;
    if (costRaw && !isFinite(cost)) { toast("The cost should be a number, like 280."); $("qCost").focus(); return; }
    var item = { cid: newCid(), title: name.slice(0, 120), cost: cost, note: note.slice(0, 200) };
    queueSend({ action: "queueadd", item: item }).then(function (j) {
      if (!j || !j.item || !state.ledger || !state.ledger.queue) return;
      var q = state.ledger.queue;
      q.items = q.items.filter(function (x) { return x.id !== j.item.id; });
      /* A new item goes where its price puts it: just above the first item that costs more (unpriced ones
         stay at the bottom). Everything already in the queue keeps the order you gave it. */
      var at = priceSlot(q.items, j.item.cost);
      q.items.splice(at, 0, j.item);
      lsSet(LS_LEDGER, state.ledger);
      ["qName", "qCost", "qNote"].forEach(function (id) { if ($(id)) $(id).value = ""; });
      var where = "Added at #" + (at + 1) + " of " + q.items.length + (typeof j.item.cost === "number" ? ", by price" : ", at the bottom (no price yet)") + ". Move it to change.";
      if (at < q.items.length - 1) queueSend({ action: "queueorder", ids: q.items.map(function (x) { return x.id; }) }, where);
      else { toast(where); render(true); }
      if ($("qName")) $("qName").focus();
    });
  }
  /* Where a cost belongs in the queue as it stands: before the first item that costs more or has no price. */
  function priceSlot(items, cost) {
    if (typeof cost !== "number") return items.length;
    for (var i = 0; i < items.length; i++) if (typeof items[i].cost !== "number" || items[i].cost > cost) return i;
    return items.length;
  }
  function priceSorted(items) {
    return items.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      var ca = typeof a.x.cost === "number" ? a.x.cost : Infinity, cb = typeof b.x.cost === "number" ? b.x.cost : Infinity;
      return ca - cb || a.i - b.i;
    }).map(function (o) { return o.x; });
  }
  /* PRICE ORDER: lowest to highest, once; any moves after that are remembered as usual. */
  function queuePriceOrder() {
    var q = state.ledger && state.ledger.queue;
    if (!q) return;
    var before = tops(".lg-witem", "data-qid");
    q.items = priceSorted(q.items);
    var sent = queueSend({ action: "queueorder", ids: q.items.map(function (x) { return x.id; }) }, "Sorted lowest to highest. Move anything to set your own order.");
    slideFrom(".lg-witem", "data-qid", before);
    return sent;
  }

  /* For Ask, only when turned on in Systems: the figures on this screen, in plain text. */
  function ledgerBrief() {
    var L = state.ledger, y = L && L.ynab, out = [];
    if (!lsGet(LS_AIFIN) || !L) return "";
    if (y) {
      out.push("Checking " + usd(y.checking.reduce(function (s, a) { return s + a.balance; }, 0), true) +
        (y.savings.length ? "; savings " + y.savings.map(function (a) { return a.name + " " + usd(a.balance, true); }).join(", ") : "") +
        (y.loans.length ? "; loans " + y.loans.map(function (a) { return a.name + " " + usd(a.balance, true) + (a.original ? " of " + usd(a.original) : ""); }).join(", ") : ""));
      var ag = y.age.filter(function (a) { return typeof a.days === "number"; });
      if (ag.length) out.push("Age of money " + ag[ag.length - 1].days + " days");
      if (y.fund) out.push(y.fund.name + " category available " + usd(y.fund.balance, true));
      var av = avgSpend(y, 6);
      out.push("Average monthly spend (" + av.months + " months): " + av.cats.slice(0, 12).map(function (c) { return c.name + " " + usd(c.avg) + " (this month " + usd(c.now) + ")"; }).join("; "));
    }
    if (L.queue) out.push("Replicator Queue (wish list, priority order): " + (L.queue.items.map(function (w, i) { return (i + 1) + ". " + w.title + (typeof w.cost === "number" ? " " + usd(w.cost) : ""); }).join("; ") || "empty"));
    return out.length ? "FINANCES (YNAB, read-only; shared by Timothy's choice):\n" + out.join("\n") : "";
  }
  function ledgerSection() {
    var L = state.ledger, html = "<section>" + phead("LEDGER", canLedger() ? "YNAB READ-ONLY" : "SETUP");
    if (!canLedger() && !canQueue()) return html + stubBox("Needs bridge 1.9. Steps are in the README under <b>Ledger</b>.") + "</section>";
    var y = L && L.ynab;
    html += '<div class="calrow"><span class="st" style="background:var(--chrome-b)"></span><span><b>YNAB</b><small' + (L && L.ynabError ? ' class="errtxt">' + ynabErrText(L.ynabError) : ">" + (y ? y.checking.length + " checking · " + y.savings.length + " savings · " + y.loans.length + " loans · fund category " + (y.fund ? '"' + esc(bare(y.fund.name).trim() || y.fund.name) + '" found' : '"' + esc(y.fundName) + '" not found') : canLedger() ? "Not loaded yet" : "Add YNAB_TOKEN in Script Properties")) + "</small></span>" +
      '<span class="pill' + (y ? " ok" : L && L.ynabError ? " bad" : "") + '">' + (y ? "OK" : L && L.ynabError ? "ERROR" : canLedger() ? "WAITING" : "SETUP") + "</span></div>";
    html += '<div class="calrow"><span class="st" style="background:var(--ok)"></span><span><b>Replicator Queue</b><small' + (L && L.queueError ? ' class="errtxt">' + (L.queueError === "notion_not_shared" ? "Not connected. In Notion: Replicator Queue → ••• → Connections → add TimothyOS bridge." : esc(L.queueError)) : ">" + (L && L.queue ? L.queue.items.length + " waiting · " + L.queue.bought.length + " bought recently" : "Not loaded yet")) + "</small></span>" +
      '<span class="pill' + (L && L.queue ? " ok" : L && L.queueError ? " bad" : "") + '">' + (L && L.queue ? "OK" : L && L.queueError ? "SETUP" : "WAITING") + "</span></div>";
    var on = !!lsGet(LS_AIFIN);
    html += '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND YOUR FINANCES</label><div class="btnrow">' +
      '<button type="button" class="chip" data-aifin="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-aifin="1" aria-pressed="' + on + '">SHARE WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "Ask receives your balances, average spend and the Replicator Queue with each question, so it can answer things like whether the extractor fits this month. They go to Anthropic with the question." : "Off: your finances are never sent with Ask questions.") + "</small></section>";
    return html;
  }

  /* ---------- Motion ---------- */
  /* Small, quick and only when you do something: a light-up on press, screens that
     rise in, sheets that slide, bars that grow when a screen opens, panels that open
     smoothly. Background syncs re-render without animating. With Reduce Motion on,
     the CSS turns every animation off and these helpers do nothing. */
  function calm() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function restartClass(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  var enterTimer = null;
  function enterScreen() {
    var c = $("content");
    restartClass(c, "enter"); restartClass(c, "grow-in");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(function () { c.classList.remove("enter"); c.classList.remove("grow-in"); }, 700);
  }
  /* Animate an element from its old height to its new one (after a re-render). */
  function easeHeight(el, from) {
    if (!el || calm() || from == null) return;
    var to = el.offsetHeight;
    if (Math.abs(to - from) < 2) return;
    el.style.height = from + "px"; el.style.overflow = "hidden";
    void el.offsetHeight;
    el.style.transition = "height 240ms cubic-bezier(.2, .7, .2, 1)";
    el.style.height = to + "px";
    setTimeout(function () { el.style.height = ""; el.style.overflow = ""; el.style.transition = ""; }, 260);
  }
  /* Slide items from where they were to where they are now (after a re-render). */
  function slideFrom(sel, keyAttr, before) {
    if (calm()) return;
    document.querySelectorAll(sel).forEach(function (el) {
      var dy = before[el.getAttribute(keyAttr)] - el.getBoundingClientRect().top;
      if (!dy || !isFinite(dy)) return;
      el.style.transition = "none"; el.style.transform = "translateY(" + dy + "px)";
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = "transform 240ms cubic-bezier(.2, .7, .2, 1)"; el.style.transform = ""; }); });
    });
  }
  function tops(sel, keyAttr) {
    var o = {};
    document.querySelectorAll(sel).forEach(function (el) { o[el.getAttribute(keyAttr)] = el.getBoundingClientRect().top; });
    return o;
  }
  /* Sheets slide up when they open (CSS) and slide down before they hide. */
  var sheetTimers = {};
  function showSheet(id) { var s = $(id); clearTimeout(sheetTimers[id]); s.classList.remove("closing"); s.hidden = false; }
  function hideSheet(id) {
    var s = $(id);
    if (s.hidden) return;
    if (calm()) { s.hidden = true; return; }
    s.classList.add("closing");
    clearTimeout(sheetTimers[id]);
    sheetTimers[id] = setTimeout(function () { s.hidden = true; s.classList.remove("closing"); }, 200);
  }
  /* The LCARS light-up on every button press. */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".nav, .elbow, .btn, .chip, .ov-more, .status, .topbtn");
    if (b && !b.disabled) restartClass(b, "flash");
  }, true);

  /* ---------- Standby ---------- */
  /* After a stretch without a touch (Systems → Standby, default 15 minutes) or from
     STANDBY in the top bar, the screen fades to a dim clock with weather, next up,
     the condition and the next key date. The screen is kept awake while standby is
     on (iPadOS releases that whenever the app is closed; it's asked for again on
     return). The first tap only wakes the screen. Night look from 22:00 to 06:00. */
  var STANDBY_CHOICES = [0, 5, 15, 30];
  var sb = { on: false, last: Date.now(), clock: null, drift: null, step: 0, wake: null, wakeState: "off" };
  function standbyMins() { var v = lsGet(LS_STANDBY); return STANDBY_CHOICES.indexOf(v) > -1 ? v : 15; }
  function noteTouch() { sb.last = Date.now(); }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (t) { document.addEventListener(t, noteTouch, { capture: true, passive: true }); });
  function holdAwake() {
    if (sb.wake || document.hidden || standbyMins() === 0) return;
    if (!("wakeLock" in navigator)) { sb.wakeState = "unsupported"; return; }
    navigator.wakeLock.request("screen").then(function (lock) {
      sb.wake = lock; sb.wakeState = "on";
      lock.addEventListener("release", function () { sb.wake = null; if (sb.wakeState === "on") sb.wakeState = "released"; });
    }).catch(function () { sb.wakeState = "refused"; });
  }
  function letSleep() { if (sb.wake) { sb.wakeState = "off"; sb.wake.release().catch(function () {}); sb.wake = null; } else sb.wakeState = "off"; }
  document.addEventListener("pointerdown", function () { if (!sb.wake && standbyMins()) holdAwake(); }, true);   /* some iPadOS versions want a tap first */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { noteTouch(); holdAwake(); } });

  function typing() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function checkIdle() {
    var mins = standbyMins();
    if (sb.on || !mins || !state.conn || document.hidden || typing()) return;
    if (Date.now() - sb.last >= mins * 60000) enterStandby();
  }
  setInterval(checkIdle, 15000);

  function standbyHtml(now) {
    /* One centered column, one typeface, three sizes: the clock, the event title, and small
       spaced capitals for everything else. */
    var today = ymd(now), list = visible(eventsFor(bridgeRange()));
    var timed = dayEvents(list, now).timed.filter(function (e) { return e._e > now; }).sort(function (a, b) { return a._s - b._s; });
    var cur = timed.filter(function (e) { return e._s <= now; })[0], up = timed.filter(function (e) { return e._s > now; });
    var tomorrow = up.length || cur ? [] : dayEvents(list, addDays(sod(now), 1)).timed.sort(function (a, b) { return a._s - b._s; });
    var mins = function (ms) { var m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? m + " MIN" : durLabel(m).toUpperCase(); };
    var dot = function (cls) { return '<i class="sb-dot ' + cls + '"></i>'; };
    var j = wxData(), top = DOWL[now.getDay()] + " " + p2(now.getDate()) + " " + MONL[now.getMonth()];
    if (j && j.current) {
      var dly = j.daily, di = Math.max(0, dly.time.indexOf(today));
      top += '<span class="sb-sep">·</span>' + Math.round(j.current.temperature_2m) + "° " + esc(wxText(j.current.weather_code).toUpperCase()) +
        '<span class="sb-sep">·</span>H ' + Math.round(dly.temperature_2m_max[di]) + "° L " + Math.round(dly.temperature_2m_min[di]) + "°";
    }
    var html = '<div class="sb-tm tnum">' + hm(now) + '</div><div class="sb-lbl sb-acc">' + top + '</div><div class="sb-rule"></div>';
    var ev = cur || up[0], after = cur ? up[0] : up[1];
    if (ev) {
      var when = cur ? "NOW · UNTIL " + hm(cur._e) + " · " + mins(cur._e - now) + " LEFT" : "NEXT UP · " + hm(ev._s) + " · IN " + mins(ev._s - now);
      html += '<div class="sb-lbl">' + dot("a-" + ev.area) + when + '</div><div class="sb-title">' + esc(ev.title) + "</div>" +
        (after ? '<div class="sb-lbl sb-dim">THEN ' + hm(after._s) + " · " + esc(after.title.toUpperCase()) + "</div>" : "");
    } else {
      /* nothing left today: say so; tomorrow's first item waits in small print until midnight */
      html += '<div class="sb-lbl">REST OF TODAY</div><div class="sb-title">Clear for the rest of the day</div>' +
        (tomorrow[0] ? '<div class="sb-lbl sb-dim">NEXT · TOMORROW ' + hm(tomorrow[0]._s) + " · " + esc(tomorrow[0].title.toUpperCase()) + "</div>" : "");
    }
    var items = conditions(now, today, eventsFor(bridgeRange()));
    var level = items.some(function (i) { return i.lvl === "bad"; }) ? "red" : items.length ? "yellow" : "green";
    var foot = dot(level) + "CONDITION " + level.toUpperCase() + (items.length ? " · " + items.length + (items.length === 1 ? " ITEM" : " ITEMS") : "");
    var kd = canDates() && state.dates ? occurrences(today, ymd(addDays(now, 366))).filter(function (o) { return o.e >= today; })[0] : null;
    if (kd) {
      var running = kd.s < today, n = running ? daysBetween(today, kd.e) : daysBetween(today, kd.s);
      foot += '<span class="sb-sep wide"></span>◆ ' + esc(kd.d.title.toUpperCase()) + " · " + (running ? n + " D LEFT" : n === 0 ? "TODAY" : "IN " + n + " D");
    }
    return html + '<div class="sb-lbl sb-dim sb-foot">' + foot + "</div>";
  }
  function paintStandby() {
    var now = new Date(), el = $("standby"), h = now.getHours();
    el.classList.toggle("night", h >= 22 || h < 6);
    $("sbBody").innerHTML = standbyHtml(now);
  }
  function enterStandby() {
    if (sb.on || !state.conn) return;
    if (logOpen() || lg.digits) { lockLog(); if (state.screen === "log") render(false); }
    sb.on = true;
    var el = $("standby");
    paintStandby();
    el.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("on"); }); });
    sb.clock = setInterval(paintStandby, 15000);
    sb.step = 0;
    sb.drift = setInterval(function () {   /* a few pixels each minute, so nothing burns into an OLED screen */
      var o = [[0, 0], [7, -5], [-6, 6], [5, 7], [-7, -4]][++sb.step % 5];
      $("sbBody").style.transform = "translate(" + o[0] + "px, " + o[1] + "px)";
    }, 60000);
    holdAwake();
  }
  function exitStandby() {
    if (!sb.on) return;
    sb.on = false; noteTouch();
    clearInterval(sb.clock); clearInterval(sb.drift);
    var el = $("standby");
    el.classList.remove("on");
    $("sbBody").style.transform = "";
    setTimeout(function () { if (!sb.on) el.hidden = true; }, calm() ? 0 : 360);
    if (state.screen === "bridge" || state.screen === "today") render(true);
  }
  /* The wake tap lands on the standby layer itself, so nothing underneath is pressed. */
  $("standby").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); exitStandby(); });
  document.addEventListener("keydown", function (e) { if (sb.on) { e.preventDefault(); exitStandby(); } }, true);
  $("idleBtn").addEventListener("click", function () { enterStandby(); });

  function standbySection() {
    var mins = standbyMins();
    var ws = { on: "Yes, while TimothyOS is open.", released: "Released when the app went to the background; asked for again on your next tap.", refused: "iPadOS declined. When docked, set Settings → Display & Brightness → Auto-Lock → Never.",
      unsupported: "This iPadOS version can't keep a web app's screen on. When docked, set Auto-Lock to Never.", off: mins ? "Asked for on your next tap." : "No: standby is off, so the iPad locks as usual." }[sb.wakeState] || "";
    return "<section>" + phead("STANDBY", mins ? "AFTER " + mins + " MIN" : "OFF") +
      '<dl class="kv"><dt>STANDBY AFTER</dt><dd><div class="chips">' + STANDBY_CHOICES.map(function (m) {
        return '<button type="button" class="chip" data-standby="' + m + '" aria-pressed="' + (m === mins) + '">' + (m ? m + " MIN" : "OFF") + "</button>";
      }).join("") + "</div></dd><dt>SCREEN ON</dt><dd>" + ws + "</dd></dl>" +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="standbynow">STANDBY NOW</button></div>' +
      '<small class="muted">Without a touch for that long, the screen fades to a dim clock with weather, next up and the condition. Tap anywhere to wake; that tap only wakes the screen. STANDBY in the top bar does the same any time. Night look 22:00 to 06:00. A web app can\'t turn the backlight down, so keep the iPad plugged in when docked.</small></section>';
  }

  /* ---------- Captain's Log ---------- */
  /* A plain journal: a calendar of days and a blank page, one Notion page per day
     (bridge 1.10). Opening LOG always asks for the 6-digit PIN. The PIN lives in the
     bridge (Script Property LOG_PIN) and is checked there; here it's held in memory
     only while the log is open. Entries are never stored on the iPad: leaving LOG,
     sending the app to the background, standby, or 10 minutes without a touch locks
     it and drops them. The only thing kept here is writing that hasn't reached Notion
     yet, removed as soon as it has. No reminders, no streaks, no counts. Never sent to Ask. */
  var LS_LDRAFT = "tos.ldraft.v1";       /* Log: writing not yet saved to Notion, per day */
  var LOG_SAVE_MS = 5000;                /* save this long after you stop typing */
  var LOG_IDLE_MS = 10 * 60 * 1000;      /* lock after this long without a touch */
  var LOG_BATCH = 3;                     /* entries per import request (short requests fail less) */
  var lg = logFresh();
  var logDrafts = lsGet(LS_LDRAFT) || {};
  function logFresh() { return { pin: null, digits: "", msg: "", busy: false, dates: null, month: null, day: null, entries: {}, loading: {}, err: {}, timer: null, saving: false, again: false, saveErr: null, imp: null, manual: false, pick: false, pickYear: null }; }
  function canLog() { return state.caps.indexOf("log") > -1; }
  /* Reads go as GET (bridge 1.11): the key and PIN ride in the address, which survives Google's
     redirects; a POST body sometimes doesn't. An older bridge only takes POST, so fall back. */
  function logRead(params) {
    return api(params).catch(function (err) { if (err && err.code === "unknown_action") return apiPost(params); throw err; });
  }
  function logOpen() { return !!lg.pin; }
  function logDraftsSave() { lsSet(LS_LDRAFT, logDrafts); }
  /* The same paragraph rules the bridge uses, so "unchanged" means the same thing on both sides. */
  function logNorm(t) {
    return String(t == null ? "" : t).replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/)
      .map(function (p) { return p.replace(/^\n+|\s+$/g, ""); }).filter(function (p) { return p.length; }).join("\n\n");
  }
  function logText(d) { return logDrafts[d] ? logDrafts[d].text : lg.entries[d] ? lg.entries[d].text : ""; }

  function lockLog() {
    var pin = lg.pin;
    if (lg.timer) { clearTimeout(lg.timer); lg.timer = null; }
    if (pin && Object.keys(logDrafts).length) logSave(pin);   /* finish what was written, then forget the PIN */
    lg = logFresh();
    var f = document.activeElement;
    if (f && /^clText-/.test(f.id)) f.blur();
  }
  function logErrText(code, left) {
    return ({
      bad_pin: "Not that one." + (left ? " " + left + (left === 1 ? " try" : " tries") + " left before a 15-minute lock." : ""),
      log_locked: "Locked for 15 minutes after five wrong tries.",
      log_pin_not_set: "No PIN set yet. In Apps Script: Project Settings → Script Properties → add LOG_PIN with six digits. Steps are in the README under Captain's Log.",
      notion_not_shared: "The Captain's Log database isn't connected. In Notion: Captain's Log → ••• → Connections → add TimothyOS bridge.",
      unknown_action: "The bridge is out of date. Deploy the latest Code.gs (1.10)."
    })[code] || null;
  }
  function logPress(k) {
    if (lg.busy) return;
    lg.msg = "";
    if (k === "del") lg.digits = lg.digits.slice(0, -1);
    else if (lg.digits.length < 6) lg.digits += k;
    render(true);
    if (lg.digits.length === 6) logUnlock(lg.digits);
  }
  function logUnlock(pin) {
    lg.busy = true; render(true);
    logRead({ action: "logunlock", pin: pin }).then(function (j) {
      if (state.screen !== "log") return;
      lg.pin = pin; lg.digits = ""; lg.dates = {};
      (j.dates || []).forEach(function (d) { lg.dates[d] = true; });
      var t = ymd(new Date());
      lg.day = t; lg.month = som(new Date());
      noteTouch();
      loadLogDay(t);
      if (Object.keys(logDrafts).length) logSave(pin);   /* anything left from last time */
    }).catch(function (err) {
      lg.digits = "";
      lg.msg = logErrText(err.code, err && err.left) || describe(err);
    }).then(function () { lg.busy = false; if (state.screen === "log") { render(true); enterScreen(); } });
  }
  function loadLogDay(d) {
    if (!lg.pin || d in lg.entries || lg.loading[d]) return;
    if (!lg.dates[d]) { lg.entries[d] = null; return; }
    var pin = lg.pin;
    lg.loading[d] = true; delete lg.err[d];
    logRead({ action: "logday", pin: pin, date: d }).then(function (j) {
      if (lg.pin !== pin) return;
      lg.entries[d] = j.entry ? { text: j.entry.text || "", url: j.entry.url || "", other: !!j.entry.other, saved: j.entry.saved } : null;
    }).catch(function (err) {
      if (lg.pin === pin) lg.err[d] = logErrText(err.code) || describe(err);
    }).then(function () {
      if (lg.pin !== pin) return;
      delete lg.loading[d];
      if (state.screen === "log" && lg.day === d) render(true);
    });
  }
  function logPick(d) {
    lg.day = d; lg.imp = null;
    var dt = parseYmd(d); if (dt.getMonth() !== lg.month.getMonth() || dt.getFullYear() !== lg.month.getFullYear()) lg.month = som(dt);
    loadLogDay(d);
    render(true);
  }
  function logStatusText(d) {
    if (lg.saving) return "SAVING…";
    if (logDrafts[d]) return lg.saveErr ? "NOT SAVED YET · KEPT ON THIS IPAD" : "UNSAVED · KEPT ON THIS IPAD";
    var e = lg.entries[d];
    return e && e.saved ? "SAVED " + esc(stamp(Date.parse(e.saved))) : e ? "IN NOTION" : "";
  }
  function logStatus() { var el = $("clStatus"); if (el && lg.day) el.textContent = logStatusText(lg.day); var er = $("clErr"); if (er) er.textContent = lg.saveErr || ""; }
  function onLogInput(d, value) {
    var server = lg.entries[d] ? lg.entries[d].text : "";
    if (logNorm(value) === server) delete logDrafts[d]; else logDrafts[d] = { text: value, at: Date.now() };
    logDraftsSave();
    lg.saveErr = null;
    logStatus();
    if (lg.timer) clearTimeout(lg.timer);
    lg.timer = setTimeout(function () { lg.timer = null; if (lg.pin) logSave(lg.pin); }, LOG_SAVE_MS);
  }
  /* Send unsaved writing to Notion, one day at a time. Writing kept here until it lands. */
  function logSave(pin) {
    if (lg.saving) { lg.again = true; return; }
    var d = Object.keys(logDrafts).sort()[0];
    if (!d || !pin) return;
    var text = logDrafts[d].text, mine = lg;
    mine.saving = true; logStatus();
    apiPost({ action: "logsave", pin: pin, date: d, text: text }).then(function (j) {
      if (logDrafts[d] && logDrafts[d].text === text) { delete logDrafts[d]; logDraftsSave(); }
      var norm = logNorm(text);
      mine.entries[d] = Object.assign({}, mine.entries[d] || {}, { text: norm, saved: j.saved || new Date().toISOString() });
      if (mine.dates) { if (norm) mine.dates[d] = true; else delete mine.dates[d]; }
      mine.saveErr = null;
      if (lg === mine && mine.day === d) logSavedFx(mine.manual);
      mine.manual = false;
    }).catch(function (err) {
      mine.manual = false;
      if (err.code === "log_edit_in_notion") {
        mine.saveErr = "This page holds things the LOG can't show (a photo or table, say), so it's edited in Notion only. Your text here is kept on this iPad.";
        return;
      }
      mine.saveErr = logErrText(err.code) || describe(err);
      if (err.code === "bad_pin" || err.code === "log_locked") return;
      if (lg === mine) setTimeout(function () { if (lg === mine && lg.pin) logSave(lg.pin); }, 30000);
    }).then(function () {
      mine.saving = false;
      if (lg !== mine) return;
      logStatus();
      var cell = document.querySelector('[data-lday="' + d + '"]');   /* update in place so the save animation and the caret survive */
      if (cell && mine.dates) cell.classList.toggle("has", !!mine.dates[d] || !!logDrafts[d]);
      var er = $("clErr"); if (er) er.textContent = mine.saveErr || "";
      var more = Object.keys(logDrafts).some(function (k) { return k !== d || logDrafts[k].text !== text; });
      if ((mine.again || more) && !mine.saveErr) { mine.again = false; logSave(pin); }
    });
  }
  /* A save landing: the page's bar fills left to right and the status flashes. SAVE
     itself also reads SAVED ✓ for a moment. Done in place, never by redrawing, so the
     keyboard and caret stay where they are. */
  function logSavedFx(manual) {
    var bar = document.querySelector(".cl-page .phead .rule"), st = $("clStatus"), btn = document.querySelector('[data-lact="save"]');
    restartClass(bar, "swept"); restartClass(st, "ok");
    if (manual && btn) {
      btn.textContent = "SAVED ✓"; restartClass(btn, "saved");
      setTimeout(function () { if (btn.isConnected) { btn.textContent = "SAVE"; btn.classList.remove("saved"); } }, 1600);
    }
  }
  function logInsertBearings() {
    var d = lg.day, ta = $("clText-" + d), words = bearings();
    if (!ta || !words.length) return;
    var add = "—\n\n" + words.map(function (w) { return w + ": "; }).join("\n\n");
    var v = ta.value.replace(/\s+$/, "");
    ta.value = (v ? v + "\n\n" : "") + add;
    onLogInput(d, ta.value);
    growLog(ta);
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (x) { /* not a text field */ }
  }
  function growLog(ta) {
    if (!ta) return;
    var c = $("content"), top = c.scrollTop;
    ta.style.height = "auto";
    ta.style.height = Math.max(ta.scrollHeight + 4, 320) + "px";
    c.scrollTop = top;
  }

  /* --- importing old entries ---
     Paste a text export from a diary app: days headed by lines like
     "Thursday, November 13, 2025". Read here, sent five days at a time; days that
     already have a page are skipped, so running it twice adds nothing twice. */
  var DAYSL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHSL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function parseDiary(raw) {
    var text = String(raw || "").replace(/\r\n?/g, "\n").replace(/ /g, " ");
    var re = new RegExp("^[ \\t]*(" + DAYSL.join("|") + "),[ \\t]+(" + MONTHSL.join("|") + ")[ \\t]+(\\d{1,2}),[ \\t]+(\\d{4})[ \\t]*$", "gm");
    var heads = [], m, out = [], notes = [], by = {};
    while ((m = re.exec(text))) heads.push({ at: m.index, end: m.index + m[0].length, wd: m[1], mo: MONTHSL.indexOf(m[2]), d: +m[3], y: +m[4] });
    if ((heads.length ? text.slice(0, heads[0].at) : text).trim()) notes.push(heads.length ? "Text before the first date is left out." : "No dated days found. Each day should start with a line like “Thursday, November 13, 2025”.");
    heads.forEach(function (h, i) {
      var body = text.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : text.length)
        .replace(/\n[ \t]*Sent from my (iPad|iPhone)[ \t]*\s*$/, "\n")
        .split("\n").map(function (l) { return l.replace(/[ \t]+$/, ""); }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      var dt = new Date(h.y, h.mo, h.d);
      if (dt.getDate() !== h.d) { notes.push("Skipped an impossible date: " + h.wd + ", " + MONTHSL[h.mo] + " " + h.d + ", " + h.y + "."); return; }
      var d = ymd(dt), label = dLabel(dt) + " " + h.y;
      if (DAYSL[dt.getDay()] !== h.wd) notes.push(label + " is headed " + h.wd + "; imported on the date as written.");
      if (by[d]) { notes.push(label + " appears twice; both join one page, in order."); if (body) by[d].text += (by[d].text ? "\n\n· · ·\n\n" : "") + body; return; }
      by[d] = { date: d, text: body }; out.push(by[d]);
    });
    out = out.filter(function (e) { if (!e.text) notes.push(dLabel(parseYmd(e.date)) + " is empty and is left out."); return !!e.text; });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { entries: out, notes: notes };
  }
  /* Progress is counted from what Notion actually holds (days with a page), so a
     re-paste after any interruption shows exactly what's left and sends only that.
     A failed request is retried on its own, with growing pauses; only a PIN or setup
     problem stops it. Every request is safe to repeat: days already written are skipped. */
  var LOG_RETRY_MS = [10000, 20000, 40000, 60000, 90000, 120000];
  var LOG_STOP = ["bad_pin", "log_locked", "log_pin_not_set", "notion_not_shared", "notion_unauthorized", "unknown_action"];
  function logImportCheck() {
    var f = $("clImp"), r = parseDiary(f ? f.value : ""), have = {};
    r.entries.forEach(function (e) { if (lg.dates && lg.dates[e.date]) have[e.date] = true; });
    lg.imp = { stage: r.entries.length ? "ready" : "paste", entries: r.entries, notes: r.notes, have: have, created: 0, fails: 0, retryAt: 0, err: null };
    if (f) f.value = "";
    render(true);
  }
  function impLeft(imp) { return imp.entries.filter(function (e) { return !imp.have[e.date]; }); }
  function logImportRun() {
    var imp = lg.imp, pin = lg.pin;
    if (!imp || !pin) return;
    imp.stage = "running"; imp.err = null; imp.fails = 0; imp.retryAt = 0; render(true);
    (function next() {
      if (lg.pin !== pin || lg.imp !== imp) return;
      var left = impLeft(imp);
      if (!left.length) {
        imp.stage = "done";
        return logRead({ action: "logdates", pin: pin }).then(function (j) {
          if (lg.pin !== pin) return;
          lg.dates = {}; (j.dates || []).forEach(function (d) { lg.dates[d] = true; });
          lg.entries = {};
        }).catch(function () { /* the calendar catches up on the next unlock */ }).then(function () { if (state.screen === "log") render(true); });
      }
      var batch = left.slice(0, LOG_BATCH);
      apiPost({ action: "logimport", pin: pin, entries: batch }, 120000).then(function (j) {
        (j.created || []).concat(j.skipped || []).forEach(function (d) { imp.have[d] = true; if (lg.dates && (j.created || []).indexOf(d) > -1) lg.dates[d] = true; });
        imp.created += (j.created || []).length;
        imp.fails = 0; imp.err = null; imp.retryAt = 0;
        noteTouch();
        if (state.screen === "log") render(true);
        next();
      }).catch(function (err) {
        if (lg.pin !== pin || lg.imp !== imp) return;
        var why = logErrText(err.code) || describe(err);
        if (LOG_STOP.indexOf(err.code) > -1 || imp.fails >= LOG_RETRY_MS.length) {
          imp.stage = "ready"; imp.err = why; imp.retryAt = 0;
        } else {
          var wait = LOG_RETRY_MS[imp.fails++];
          imp.err = why; imp.retryAt = Date.now() + wait;
          noteTouch();
          setTimeout(next, wait);
        }
        if (state.screen === "log") render(true);
      });
    })();
  }
  function logImportHtml() {
    var imp = lg.imp, n = imp.entries.length, first = n ? imp.entries[0].date : null, last = n ? imp.entries[n - 1].date : null;
    var range = n ? dLabel(parseYmd(first)) + " " + first.slice(0, 4) + " TO " + dLabel(parseYmd(last)) + " " + last.slice(0, 4) : "";
    var inN = n - impLeft(imp).length, left = n - inN;
    var html = phead("IMPORT", imp.stage === "running" ? inN + " OF " + n + " IN NOTION" : imp.stage === "done" ? "DONE" : "FROM A DIARY EXPORT", "chrome-c");
    if (imp.stage === "paste") {
      return html + (imp.notes.length ? '<div class="errtxt cl-note">' + esc(imp.notes.join(" ")) + "</div>" : "") +
        '<label class="ov-sub" for="clImp">PASTE THE TEXT EXPORT</label><textarea id="clImp" rows="10" spellcheck="false" placeholder="Each day starting with a line like: Thursday, November 13, 2025"></textarea>' +
        '<div class="btnrow cl-row"><button type="button" class="btn" data-lact="impcheck">CHECK</button><button type="button" class="btn ghost" data-lact="impcancel">CANCEL</button></div>' +
        '<small class="muted">Read on this iPad and sent straight to Notion. Nothing is kept here. Days that already have a page are skipped.</small>';
    }
    html += '<dl class="kv"><dt>ENTRIES</dt><dd class="tnum">' + n + "</dd><dt>FROM</dt><dd>" + range + "</dd>" +
      '<dt>IN NOTION</dt><dd class="tnum">' + inN + " of " + n + (left && imp.stage !== "done" ? " · " + left + " to go" : "") + "</dd>" +
      '<dt>PROGRESS</dt><dd><span class="cl-bar"><i style="width:' + (n ? Math.round(100 * inN / n) : 0) + '%"></i></span></dd></dl>';
    if (imp.notes.length) html += '<ul class="cl-notes">' + imp.notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
    if (imp.stage === "running" && imp.retryAt) html += '<div class="cl-note muted">That request didn\'t go through (' + esc(imp.err) + "). Trying again in " + Math.max(1, Math.round((imp.retryAt - Date.now()) / 1000)) + " s, on its own.</div>";
    else if (imp.stage === "ready" && imp.err) html += '<div class="errtxt cl-note">' + imp.err + " Everything already in Notion stays; IMPORT sends only what's left.</div>";
    if (imp.stage === "ready") html += '<div class="btnrow cl-row"><button type="button" class="btn" data-lact="imprun"' + (left ? "" : " disabled") + ">" + (inN ? "IMPORT THE " + left + " LEFT" : "IMPORT " + n + (n === 1 ? " ENTRY" : " ENTRIES")) + '</button><button type="button" class="btn ghost" data-lact="impcancel">CANCEL</button></div>' +
      '<small class="muted">About ' + Math.max(1, Math.round(left / LOG_BATCH * 4 / 60)) + " min. Keep TimothyOS open until it finishes; it locks if the app goes to the background. If it does, paste again: only what's left is sent.</small>";
    if (imp.stage === "running" && !imp.retryAt) html += '<small class="muted">Writing to Notion…</small>';
    if (imp.stage === "done") html += '<div class="cl-note">All ' + n + " days are in Notion" + (imp.created ? " (" + imp.created + " added just now)" : "") + '.</div><div class="btnrow cl-row"><button type="button" class="btn" data-lact="impcancel">BACK TO THE PAGE</button></div>';
    return html;
  }
  function renderLog() {
    var html = '<div class="cl">';
    if (!canLog()) { $("content").innerHTML = html + "<section>" + phead("CAPTAIN'S LOG", "") + stubBox("The log needs bridge 1.10. Steps are in the README under <b>Captain's Log</b>.") + "</section></div>"; return; }
    if (!logOpen()) {
      var dots = ""; for (var i = 0; i < 6; i++) dots += '<i class="' + (i < lg.digits.length ? "on" : "") + '"></i>';
      var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
      $("content").innerHTML = html + '<section class="cl-lock">' + phead("CAPTAIN'S LOG", "LOCKED", "chrome-c") +
        '<div class="cl-dots" aria-label="' + lg.digits.length + ' of 6 digits">' + dots + "</div>" +
        '<div class="cl-msg" role="status">' + (lg.busy ? "CHECKING…" : lg.msg ? esc(lg.msg) : "ENTER YOUR PIN") + "</div>" +
        '<div class="cl-pad">' + keys.map(function (k) {
          return k === "" ? "<span></span>" : '<button type="button" class="cl-key' + (k === "del" ? " del" : "") + '" data-lpin="' + k + '"' + (lg.busy ? " disabled" : "") + ' aria-label="' + (k === "del" ? "Delete" : k) + '">' + (k === "del" ? "⌫" : k) + "</button>";
        }).join("") + "</div></section></div>";
      return;
    }
    var today = ymd(new Date()), mo = lg.month, g = sow(mo), cells = "";
    for (var c = 0; c < 42; c++) {
      var dd = addDays(g, c), k2 = ymd(dd), inMo = dd.getMonth() === mo.getMonth();
      if (c === 35 && !inMo) break;
      cells += '<button type="button" class="cl-day' + (inMo ? "" : " out") + (lg.dates[k2] || logDrafts[k2] ? " has" : "") + (k2 === today ? " today" : "") + '"' +
        (k2 === lg.day ? ' aria-current="date"' : "") + (k2 > today ? " disabled" : ' data-lday="' + k2 + '"') + ' aria-label="' + dLabel(dd) + (lg.dates[k2] ? ", written" : "") + '">' + dd.getDate() + "</button>";
    }
    var thisMo = mo.getFullYear() === new Date().getFullYear() && mo.getMonth() === new Date().getMonth();
    html += '<section class="cl-cal">' + phead("CAPTAIN'S LOG", "OPEN", "chrome-c") +
      '<div class="cl-mon"><button type="button" class="chip" data-lmon="-1" aria-label="Previous month"' + (lg.pick ? " disabled" : "") + '><span class="tri l"></span></button>' +
      '<button type="button" class="cl-title" data-lact="pick" aria-expanded="' + lg.pick + '" aria-label="Jump to a month">' + MONL[mo.getMonth()] + " " + mo.getFullYear() + '<span class="tri ' + (lg.pick ? "u" : "d") + '"></span></button>' +
      '<button type="button" class="chip" data-lmon="1" aria-label="Next month"' + (thisMo || lg.pick ? " disabled" : "") + '><span class="tri r"></span></button></div>' +
      (lg.pick ? logPickerHtml() : '<div class="cl-grid">' + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return '<span class="cl-dow">' + x + "</span>"; }).join("") + cells + "</div>") +
      '<div class="btnrow cl-row"><button type="button" class="chip" data-lact="today"' + (lg.day === today && thisMo ? " disabled" : "") + '>TODAY</button>' +
      '<button type="button" class="chip" data-lact="lock">LOCK</button><button type="button" class="chip" data-lact="import">IMPORT</button></div></section>';
    html += '<section class="cl-page">';
    if (lg.imp) html += logImportHtml();
    else {
      var d = lg.day, dt = parseYmd(d), e = lg.entries[d], loading = lg.dates[d] && !(d in lg.entries), intent = (lsGet(LS_LOG) || {})[d];
      html += phead(DOWL[dt.getDay()], p2(dt.getDate()) + " " + MON[dt.getMonth()] + " " + dt.getFullYear() + ' · <span id="clStatus">' + logStatusText(d) + "</span>", "chrome-c");
      if (intent) html += '<div class="cl-intent"><span>INTENT</span>' + esc(intent) + "</div>";
      if (lg.err[d] && !logDrafts[d]) html += '<div class="errtxt cl-note">' + lg.err[d] + ' <button type="button" class="chip" data-lact="retry">TRY AGAIN</button></div>';
      else if (loading && !logDrafts[d]) html += '<div class="empty">Opening the page…</div>';
      else {
        var b = bearings();
        if (e && e.other) html += '<div class="cl-note muted">This page also holds things the LOG can\'t show (a photo or table, say). Read it here; change it in Notion.</div>';
        html += '<textarea class="cl-text" id="clText-' + d + '" aria-label="Entry for ' + dLabel(dt) + '"' + (e && e.other ? " readonly" : "") + ' spellcheck="true" autocapitalize="sentences">' + esc(logText(d)) + "</textarea>" +
          '<div class="cl-err errtxt" id="clErr">' + (lg.saveErr || "") + "</div>" +
          '<div class="btnrow cl-row">' + (e && e.other ? "" : '<button type="button" class="btn" data-lact="save">SAVE</button>') +
          (b.length && !(e && e.other) ? '<button type="button" class="btn ghost" data-lact="bearings">+ BEARINGS</button>' : "") +
          (e && e.url ? '<a class="btn ghost" href="' + esc(e.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
      }
    }
    $("content").innerHTML = html + "</section></div>";
    growLog($("clText-" + lg.day));
  }
  /* Jump to a month: years you've written in, then the twelve months of the chosen one.
     A dot marks months with entries; months still ahead are closed. */
  function logPickerHtml() {
    var now = new Date(), cy = now.getFullYear(), have = {}, first = cy;
    Object.keys(lg.dates || {}).forEach(function (d) { have[d.slice(0, 7)] = true; first = Math.min(first, +d.slice(0, 4)); });
    var y = lg.pickYear || lg.month.getFullYear(), years = "";
    for (var yy = first; yy <= cy; yy++) years += '<button type="button" class="chip" data-lyear="' + yy + '" aria-pressed="' + (yy === y) + '">' + yy + "</button>";
    var months = MON.map(function (m, i) {
      var key = y + "-" + p2(i + 1), ahead = y > cy || (y === cy && i > now.getMonth()), cur = y === lg.month.getFullYear() && i === lg.month.getMonth();
      return '<button type="button" class="cl-mo' + (have[key] ? " has" : "") + '"' + (cur ? ' aria-current="date"' : "") + (ahead ? " disabled" : ' data-ljump="' + key + '"') + ' aria-label="' + MONL[i] + " " + y + (have[key] ? ", written" : "") + '">' + m + "</button>";
    }).join("");
    return '<div class="cl-pick"><div class="chips cl-years">' + years + '</div><div class="cl-months">' + months + "</div></div>";
  }
  function logSection() {
    var html = "<section>" + phead("CAPTAIN'S LOG", canLog() ? "PIN-LOCKED" : "SETUP");
    if (!canLog()) return html + stubBox("Needs bridge 1.10. Steps are in the README under <b>Captain's Log</b>.") + "</section>";
    var pinSet = state.caps.indexOf("logpin") > -1, nd = Object.keys(logDrafts).length;
    return html + '<div class="calrow"><span class="st" style="background:var(--chrome-c)"></span><span><b>PIN</b><small' + (pinSet ? ">Set. Change it any time: LOG_PIN in the bridge's Script Properties." : ' class="errtxt">' + logErrText("log_pin_not_set")) + "</small></span>" +
      '<span class="pill' + (pinSet ? " ok" : " bad") + '">' + (pinSet ? "OK" : "SETUP") + "</span></div>" +
      '<small class="muted">Entries open only after the PIN and are never stored on this iPad; leaving LOG, the background, standby or 10 minutes without a touch locks it. ' +
      (nd ? nd + (nd === 1 ? " day has" : " days have") + " writing waiting to reach Notion; it goes on your next unlock. " : "") + "The log is never sent to Ask.</small></section>";
  }
  document.addEventListener("keydown", function (e) {
    if (state.screen !== "log" || logOpen() || !canLog() || sb.on || e.metaKey || e.ctrlKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); logPress(e.key); }
    else if (e.key === "Backspace") { e.preventDefault(); logPress("del"); }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && (logOpen() || lg.digits)) { lockLog(); if (state.screen === "log") render(false); }
  });
  setInterval(function () {
    if (logOpen() && Date.now() - sb.last >= LOG_IDLE_MS) { lockLog(); if (state.screen === "log") render(false); }
  }, 15000);

  /* ---------- Time Loom ---------- */
  /* An infinity loop with the focused day at the crossing. The coming days ride the top of the right
     loop and slide down into the crossing; the days just past carry on round the lower-left loop.
     Swipe right to move forward. Events hang from each day as beads in their calendar's color; key
     dates sit below as diamonds. Drawn on a canvas, and only while something moves. */
  var LM_N = 24, LM_REACH = 12, LM_BLOCK = 14;
  var lm = { t: 0, vel: 0, target: null, drag: null, base: 0, raf: 0, days: {}, hits: [], col: null, W: 0, H: 0, U: 1, dpr: 1, shownK: null };
  function lmRange() { var t0 = sod(new Date()); return { from: addDays(t0, lm.base - 21), to: addDays(t0, lm.base + 35) }; }
  function lmDay(k) { return addDays(sod(new Date()), k); }
  function lmRel(k) { return k === 0 ? "TODAY" : k === 1 ? "TOMORROW" : k === -1 ? "YESTERDAY" : k > 0 ? "IN " + k + " DAYS" : -k + " DAYS AGO"; }
  function lmFocus() { return Math.round(lm.target !== null ? lm.target : lm.t); }
  /* Each day near the loom: its events (hidden calendars and ignored titles left out) and key dates. */
  function lmData() {
    var r = lmRange(), list = visible(eventsFor(r)), t0 = sod(new Date()), days = {};
    var k0 = Math.round((r.from - t0) / 86400000), k1 = Math.round((r.to - t0) / 86400000);
    for (var k = k0; k < k1; k++) {
      var day = addDays(t0, k), de = dayEvents(list, day), kd = kdMarks(ymd(day), false);
      days[k] = {
        ev: de.allDay.map(function (ev) { return { ev: ev, area: ev.area, time: "ALL DAY" }; })
          .concat(de.timed.map(function (ev) { return { ev: ev, area: ev.area, time: sameDay(ev._s, day) ? hm(ev._s) : "CONT" }; })),
        kd: kd
      };
    }
    lm.days = days;
  }
  function lmPlace(d) {
    var W = lm.W, H = lm.H, u = Math.PI / 2 - d / LM_N * Math.PI * 2, s2 = Math.sin(u) * Math.sin(u), A = Math.min(W * .47, H * .78);
    var x = A * Math.cos(u) / (1 + s2), y = A * Math.sin(u) * Math.cos(u) / (1 + s2);
    var z = Math.cos(d / LM_N * Math.PI * 2), f = Math.pow((z + 1) / 2, 1.4), g = Math.exp(-(d / 1.3) * (d / 1.3));
    return { x: W / 2 + x, y: H * .5 - y * 1.5, s: (.22 + .78 * f) * (.72 + .28 * g), a: .1 + .9 * f * f, z: z, top: z > 0 };
  }
  function lmColors() {
    var cs = getComputedStyle(document.documentElement), v = function (n) { return cs.getPropertyValue(n).trim(); };
    lm.col = { work: v("--work"), personal: v("--personal"), farm: v("--farm"), hobby: v("--hobby"), fg: v("--fg"), dim: v("--dim"),
      a: v("--chrome-a"), b: v("--chrome-b"), c: v("--chrome-c"), bg: v("--bg"), display: v("--display"), body: v("--body") };
  }
  function lmSize() {
    var cv = $("lmCv"); if (!cv) return;
    var r = cv.getBoundingClientRect();
    lm.dpr = Math.min(2, window.devicePixelRatio || 1); lm.W = r.width; lm.H = r.height;
    cv.width = Math.round(lm.W * lm.dpr); cv.height = Math.round(lm.H * lm.dpr);
    lm.U = Math.max(.75, Math.min(1.3, Math.min(lm.W, lm.H * 1.4) / 640));
    lmDraw();
  }
  function lmDraw() {
    var cv = $("lmCv"); if (!cv || !lm.W) return;
    var cx = cv.getContext("2d"), C = lm.col, U = lm.U, W = lm.W, H = lm.H, t = lm.t, TAU = Math.PI * 2;
    cx.setTransform(lm.dpr, 0, 0, lm.dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    cx.lineCap = "round";
    cx.font = "600 " + Math.round(12 * U) + "px " + C.display; cx.fillStyle = C.dim; cx.globalAlpha = .8;
    cx.textAlign = "left"; cx.fillText("◀  P A S T", 14, H - 14);
    cx.textAlign = "right"; cx.fillText("F U T U R E  ▶", W - 14, H - 14);
    // the thread: weeks shaded in turn; at the crossing the strand you're on passes over the other
    var segs = [], prev = null, ft = Math.round(t), off = (lmDay(0).getDay() + 6) % 7;
    for (var q = -LM_REACH; q <= LM_REACH + 1e-9; q += .1) {
      var p = lmPlace(q);
      if (prev) segs.push({ a: prev, b: p, wk: ((Math.floor((ft + q + off) / 7) % 2) + 2) % 2, top: p.top && prev.top });
      prev = p;
    }
    function seg(sg, halo) {
      var w = (1 + 2.4 * sg.b.s) * U;
      if (halo) { cx.strokeStyle = C.bg; cx.lineWidth = w + 7 * U; cx.globalAlpha = 1; }
      else { cx.strokeStyle = sg.wk ? C.a : C.c; cx.lineWidth = w; cx.globalAlpha = .1 + .45 * sg.b.a; }
      cx.beginPath(); cx.moveTo(sg.a.x, sg.a.y); cx.lineTo(sg.b.x, sg.b.y); cx.stroke();
    }
    segs.forEach(function (sg) { if (!sg.top) seg(sg); });
    segs.forEach(function (sg) { if (sg.top) seg(sg, true); });
    segs.forEach(function (sg) { if (sg.top) seg(sg); });
    cx.globalAlpha = 1;
    var items = [], labels = [], beads = [];
    for (var k = Math.floor(t - LM_REACH) - 1; k <= Math.ceil(t + LM_REACH) + 1; k++) {
      var d = k - t;
      if (d < -LM_REACH - .5 || d > LM_REACH + .5) continue;
      var pl = lmPlace(d);
      if (pl.a > .02) items.push({ k: k, d: d, p: pl });
    }
    items.sort(function (a, b) { return a.p.z - b.p.z; });
    lm.hits = [];
    items.forEach(function (it) {
      var p = it.p, dt = lmDay(it.k), near = Math.abs(it.d), info = lm.days[it.k] || { ev: [], kd: [] }, gap = (9 + 13 * p.s) * U, top = p.y;
      cx.globalAlpha = p.a;
      cx.fillStyle = it.k === 0 ? C.b : C.c;
      cx.beginPath(); cx.arc(p.x, p.y, (2.5 + 4 * p.s) * U, 0, TAU); cx.fill();
      // events hang from the day like beads on a warp thread; past seven, the column stops growing
      var ev = info.ev, show = ev.slice(0, 7), back = near < .5 ? 1 : Math.min(1, .4 + .6 * (near - .5) / 1.5);   /* the days beside the crossing step back */
      cx.globalAlpha = p.a * back;
      show.forEach(function (e, i) {
        var by = p.y - gap * (i + 1) - 4 * U, br = (2.2 + 6.8 * p.s) * U;
        cx.fillStyle = C[e.area] || C.c;
        cx.beginPath(); cx.arc(p.x, by, br, 0, TAU); cx.fill();
        top = by - br;
        if (near < .5) {
          beads.push({ x: p.x - br, y: by - br, w: br * 2, h: br * 2 });
          lm.hits.push({ ev: e.ev, x: p.x, y: by, r: Math.max(br, 14) });
          if (p.s > .5) labels.push({ t: e.time + "  " + bare(e.ev.title || "Busy"), x: p.x - br - 7 * U, y: by + 4.5 * U, f: "500 " + Math.round(13 * U) + "px " + C.body, c: C.fg, al: "right", a: p.a, pr: 200 - i * .1, plate: true });
        }
      });
      if (ev.length > show.length && p.s > .5) labels.push({ t: "+" + (ev.length - show.length), x: p.x, y: top - 6 * U, f: "600 " + Math.round(12 * U) + "px " + C.display, c: C.dim, al: "center", a: p.a, pr: near < .5 ? 190 : 40 });
      cx.globalAlpha = p.a;
      // a key date sits below the day as a diamond
      var o = (16 + 14 * p.s) * U;
      if (info.kd.length) {
        var kr = (4 + 7 * p.s) * U, ky = p.y + o;
        cx.fillStyle = C.b; cx.beginPath(); cx.moveTo(p.x, ky - kr); cx.lineTo(p.x + kr, ky); cx.lineTo(p.x, ky + kr); cx.lineTo(p.x - kr, ky); cx.closePath(); cx.fill();
        if (near < .5) lm.hits.push({ kd: info.kd[0].o, x: p.x, y: ky, r: Math.max(kr, 14) });
        o += kr + (12 + 6 * p.s) * U;
        if (p.s > .4) labels.push({ t: bare(info.kd[0].o.d.title).toUpperCase() + (info.kd.length > 1 ? " +" + (info.kd.length - 1) : ""), x: p.x, y: p.y + o + (14 + 6 * p.s) * U, f: "600 " + Math.round((11 + 4 * p.s) * U) + "px " + C.display, c: C.b, al: "center", a: p.a, pr: (near < .5 ? 205 : 70) + p.s * 10 - near });
      } else o += 4 * U;
      if (p.s > .36) labels.push({ t: DOW[dt.getDay()] + " " + dt.getDate(), x: p.x, y: p.y + o, f: (near < .5 ? "700 " : "400 ") + Math.round((10 + 9 * p.s) * U) + "px " + C.display, c: it.k === 0 ? C.b : C.dim, al: "center", a: p.a, pr: (near < .5 ? 210 : 60) + p.s * 20 });
      if (dt.getDate() === 1 && p.s > .25) labels.push({ t: MON[dt.getMonth()] + " " + dt.getFullYear(), x: p.x, y: top - 14 * U, f: "600 " + Math.round((11 + 9 * p.s) * U) + "px " + C.display, c: C.a, al: "center", a: p.a, pr: 75 });
      cx.globalAlpha = 1;
      lm.hits.push({ k: it.k, x: p.x, y: p.y, top: top, r: Math.max(18, 26 * p.s) * U, z: p.z });
    });
    // the focus ring at the crossing; no other day's label may sit on it or on today's beads
    var fp = lmPlace(0), rr = (14 + 8 * fp.s) * U, taken = [], ring = { x: fp.x - rr, y: fp.y - rr, w: rr * 2, h: rr * 2 };
    cx.strokeStyle = C.b; cx.globalAlpha = .55; cx.lineWidth = 1.5 * U;
    cx.beginPath(); cx.arc(fp.x, fp.y, rr, 0, TAU); cx.stroke();
    cx.globalAlpha = 1;
    labels.sort(function (a, b) { return b.pr - a.pr; });
    labels.forEach(function (l) {
      if (ring && l.pr < 150) { taken.push(ring); taken.push.apply(taken, beads); ring = null; }
      cx.font = l.f;
      var w = cx.measureText(l.t).width, hgt = parseFloat(l.f.split(" ")[1]) * 1.1;
      var x0 = l.al === "center" ? l.x - w / 2 : l.al === "right" ? l.x - w : l.x, r = { x: x0 - 3, y: l.y - hgt, w: w + 6, h: hgt + 4 };
      if (r.x < 4 || r.x + r.w > W - 4 || r.y < 2 || r.y + r.h > H - 2) return;
      for (var i = 0; i < taken.length; i++) { var o2 = taken[i]; if (r.x < o2.x + o2.w && o2.x < r.x + r.w && r.y < o2.y + o2.h && o2.y < r.y + r.h) return; }
      taken.push(r);
      if (l.plate) { cx.globalAlpha = .82; cx.fillStyle = C.bg; cx.fillRect(r.x - 2, r.y, r.w + 2, r.h); }   /* today's titles stay readable over the beads behind */
      cx.globalAlpha = l.a; cx.fillStyle = l.c; cx.textAlign = l.al; cx.fillText(l.t, l.x, l.y);
    });
    cx.globalAlpha = 1;
    if (Math.round(t) !== lm.shownK) lmPanel();
  }
  /* Motion: one time cursor that glides, coasts after a swipe, and settles on a day. */
  function lmGo(k) { lm.target = k; lm.vel = 0; if (calm()) { lm.t = k; lm.target = null; lmSettle(); } lmKick(); }
  function lmKick() { if (!lm.raf) lm.raf = requestAnimationFrame(lmStep); }
  function lmStep() {
    lm.raf = 0;
    if (!$("lmCv")) return;
    var moving = !!lm.drag;
    if (!lm.drag) {
      if (lm.target !== null) { lm.t += (lm.target - lm.t) * .14; moving = true; if (Math.abs(lm.target - lm.t) < .002) { lm.t = lm.target; lm.target = null; moving = false; lmSettle(); } }
      else if (lm.vel) { lm.t += lm.vel; lm.vel *= .93; moving = true; if (Math.abs(lm.vel) < .004) { lm.vel = 0; lmGo(Math.round(lm.t)); } }
    }
    lmDraw();
    if (moving) lmKick();
  }
  /* Settled on a day: if it has moved into a new fortnight, fetch the events around it. */
  function lmSettle() {
    var b = Math.round(lm.t / LM_BLOCK) * LM_BLOCK;
    if (b !== lm.base) { lm.base = b; lmData(); lmDraw(); refresh(false); }
  }
  function lmHead() {
    var k = Math.round(lm.t), day = lmDay(k);
    $("eyebrow").textContent = "TIME LOOM · " + lmRel(k) + (hiddenNote() ? " · " + hiddenNote() : "");
    $("title").textContent = dLabel(day) + (day.getFullYear() !== new Date().getFullYear() ? " " + day.getFullYear() : "");
  }
  function lmPanel() {
    var k = Math.round(lm.t), day = lmDay(k), key = ymd(day), info = lm.days[k] || { ev: [], kd: [] };
    lm.shownK = k;
    if (state.screen === "loom") lmHead();
    var f = $("lmFocus"), a = $("lmAhead");
    if (!f || !a) return;
    var rows = info.kd.map(function (m) { return kdRow(m.o, key); }).join("") + info.ev.map(function (e) {
      state.index[e.ev.id] = e.ev;
      return '<button type="button" class="kd a-' + e.area + pendingCls(e.ev) + '" data-id="' + esc(e.ev.id) + '"><span class="st"></span><span class="dt tnum">' + e.time + '</span><span class="tt"><b>' + esc(bare(e.ev.title || "Busy")) + "</b>" + (e.ev.location ? "<small>" + esc(e.ev.location) + "</small>" : "") + "</span>" + (e.ev.pending ? '<span class="pill">' + pendingTag(e.ev).slice(3) + "</span>" : "") + "</button>";
    }).join("");
    f.innerHTML = phead(k === 0 ? "TODAY" : dLabel(day), info.ev.length ? info.ev.length + (info.ev.length === 1 ? " EVENT" : " EVENTS") : "") +
      (rows || '<div class="empty">' + (hasData(lmRange()) ? "A clear day." : state.sync.status === "syncing" ? "Loading…" : "No data for this day yet.") + "</div>");
    if (!canDates()) { a.innerHTML = ""; return; }
    var ahead = state.dates ? occurrences(ymd(addDays(day, 1)), ymd(addDays(day, 60))).filter(function (o) { return o.s > key; }).slice(0, 4) : [];
    a.innerHTML = phead("KEY DATES AHEAD", "NEXT 60 DAYS", "chrome-a") + (ahead.length ? ahead.map(function (o) { return kdRow(o, key); }).join("") :
      '<div class="empty">' + (state.dates ? "Nothing in the next 60 days." : "Loading key dates…") + "</div>");
  }
  function renderLoom() {
    loadDates(false);
    lmColors();
    lmData();
    if (!$("lmCv")) {
      $("content").innerHTML = '<div class="lm"><div class="lm-stage" id="lmStage" tabindex="0" role="application" aria-roledescription="time loom" ' +
        'aria-label="Time Loom. Swipe or press the right arrow to move forward a day, left to go back; Page Up and Page Down move a week; T returns to today."><canvas id="lmCv"></canvas></div>' +
        '<div class="lm-side"><section id="lmFocus"></section><section id="lmAhead"></section></div></div>';
      lmBind();
      lmSize();
    } else lmDraw();
    lmPanel();
  }
  function lmBind() {
    var st = $("lmStage"), cv = $("lmCv");
    if (window.ResizeObserver) new ResizeObserver(function () { lmSize(); }).observe(cv);
    function pxDay() { return Math.max(38, lm.W / 9); }
    st.addEventListener("pointerdown", function (e) {
      lm.drag = { x: e.clientX, t: lm.t, lx: e.clientX, lt: performance.now(), moved: false };
      lm.vel = 0; lm.target = null;
      st.setPointerCapture(e.pointerId); st.classList.add("drag"); lmKick();
    });
    st.addEventListener("pointermove", function (e) {
      var g = lm.drag; if (!g) return;
      if (Math.abs(e.clientX - g.x) > 4) g.moved = true;
      lm.t = g.t + (e.clientX - g.x) / pxDay();   /* finger right: forward in time */
      var now = performance.now();
      lm.vel = (e.clientX - g.lx) / pxDay() * (16 / Math.max(1, now - g.lt));
      g.lx = e.clientX; g.lt = now;
      lmKick();
    });
    function release(e) {
      var g = lm.drag; if (!g) return;
      lm.drag = null; st.classList.remove("drag");
      if (!g.moved) {   /* a tap: today's beads and diamond open their details; any other day glides to the crossing */
        var r = st.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null;
        lm.hits.forEach(function (h) {
          if (h.ev || h.kd) { if (Math.hypot(x - h.x, y - h.y) < h.r + 4 && Math.abs(lm.t - Math.round(lm.t)) < .1) best = h; return; }
          if (best && (best.ev || best.kd)) return;
          var inCol = Math.abs(x - h.x) < h.r && y > h.top - h.r && y < h.y + h.r * 2.2;
          if ((inCol || Math.hypot(x - h.x, y - h.y) < h.r * 1.6) && (!best || h.z > best.z)) best = h;
        });
        if (best && best.ev) openDetail(best.ev);
        else if (best && best.kd) openKeyDate(best.kd);
        else if (best) lmGo(best.k);
        else lmGo(Math.round(lm.t));
        return;
      }
      if (calm()) { lm.vel = 0; lmGo(Math.round(lm.t)); } else { lm.vel = Math.max(-1.2, Math.min(1.2, lm.vel)); lmKick(); }
    }
    st.addEventListener("pointerup", release);
    st.addEventListener("pointercancel", release);
    st.addEventListener("wheel", function (e) {
      var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY;
      if (!dx) return;
      e.preventDefault(); lm.target = null;
      if (calm()) { lmGo(Math.round(lm.t) + (dx > 0 ? 1 : -1)); return; }
      lm.vel = Math.max(-1.2, Math.min(1.2, lm.vel + dx / 900)); lmKick();
    }, { passive: false });
    st.addEventListener("keydown", function (e) {
      var m = { ArrowRight: 1, ArrowLeft: -1, PageDown: 7, PageUp: -7 }[e.key];
      if (m) { e.preventDefault(); lmGo(lmFocus() + m); }
      else if (e.key === "t" || e.key === "T" || e.key === "Home") { e.preventDefault(); lmGo(0); }
    });
  }

  /* ---------- Stations: the pinned side bar and ALL STATIONS ---------- */
  /* The bar holds up to seven stations Timothy picks (EDIT PINS in ALL STATIONS); every station,
     pinned or not, is in the launcher. BRIDGE always keeps the corner. Pins live on this iPad. */
  var LS_PINS = "tos.pins.v1", MAX_PINS = 7;
  var STATIONS = [
    { id: "bridge", name: "BRIDGE", g: "TIME", sub: "Everything at a glance. Always in the corner.", fixed: true },
    { id: "today", name: "TODAY", g: "TIME", sub: "Day timeline, priorities, key dates" },
    { id: "week", name: "WEEK", g: "TIME", sub: "Seven days side by side" },
    { id: "month", name: "MONTH", g: "TIME", sub: "The month at a glance" },
    { id: "loom", name: "LOOM", g: "TIME", sub: "The infinity loop of days" },
    { id: "dates", name: "DATES", g: "TIME", sub: "Key dates, next 12 months" },
    { id: "review", name: "REVIEW", g: "REFLECT", sub: "Weekly reviews and trends" },
    { id: "log", name: "LOG", g: "REFLECT", sub: "Captain's Log, PIN locked" },
    { id: "habits", name: "HABITS", g: "REFLECT", sub: "Meditation, walk, water, debit card" },
    { id: "ledger", name: "LEDGER", g: "RESOURCES", sub: "YNAB at a glance, read only" },
    { id: "library", name: "LIBRARY", g: "RESOURCES", sub: "Reading, want to read, read" },
    { id: "audio", name: "AUDIO", g: "STANDBY", sub: "Podcasts from the NAS. Later.", standby: true },
    { id: "meals", name: "MEALS", g: "STANDBY", sub: "Dinners planned and made. Later.", standby: true }
  ];
  var ST_GROUPS = [["TIME", "chrome-b"], ["REFLECT", "chrome-a"], ["RESOURCES", "chrome-d"], ["STANDBY", "line"]];
  var BAR_COLORS = ["chrome-b", "chrome-d", "chrome-a", "chrome-c", "chrome-b", "chrome-d", "chrome-a"];   /* no two neighbours alike; ALL STATIONS is lavender, SYSTEMS orchid */
  var DEFAULT_PINS = ["today", "week", "loom", "review", "log", "habits", "library"];
  var navSig = "";
  function station(id) { return STATIONS.filter(function (s) { return s.id === id; })[0]; }
  function pins() {
    var p = lsGet(LS_PINS), seen = {};
    if (!Array.isArray(p)) p = DEFAULT_PINS;
    return p.filter(function (id) { var s = station(id); if (!s || s.fixed || s.standby || seen[id]) return false; seen[id] = 1; return true; }).slice(0, MAX_PINS);
  }
  function renderNav() {
    var on = pins(), here = station(state.screen), loose = !!here && !here.fixed && on.indexOf(here.id) < 0;
    var sig = on.join(",");
    if (sig !== navSig) {   /* rebuilt only when the pins change, so a press's light-up isn't cut short */
      navSig = sig;
      $("pins").innerHTML = STATIONS.filter(function (s) { return on.indexOf(s.id) > -1; }).map(function (s, i) {
        return '<button class="nav" data-screen="' + s.id + '" style="--c: var(--' + BAR_COLORS[i % BAR_COLORS.length] + ')" type="button">' + s.name + "</button>";
      }).join("");
    }
    var all = $("allBtn");
    all.setAttribute("aria-expanded", String(!!state.launch));
    all.innerHTML = '<span class="st-grid" aria-hidden="true">' + new Array(10).join("<i></i>") + '</span><span class="st-lbl">ALL STATIONS' + (loose ? "<small>· " + here.name + "</small>" : "") + "</span>";
    if (loose && !state.launch) all.setAttribute("aria-current", "page"); else all.removeAttribute("aria-current");
  }
  function renderLaunch() {
    var on = pins(), edit = !!state.pinEdit, html = '<div class="st-head">' + phead((STATIONS.length - 3) + " STATIONS", on.length + " OF " + MAX_PINS + " IN THE BAR") +
      '<button type="button" class="btn sm' + (edit ? "" : " ghost") + '" data-pins="1" aria-pressed="' + edit + '">' + (edit ? "DONE" : "EDIT PINS") + "</button>" +
      '<button type="button" class="btn sm ghost" data-launch="close">CLOSE</button></div>';
    if (edit) html += '<div class="st-note"><b>EDIT PINS</b>Tap a station to pin or unpin it. Up to ' + MAX_PINS + " sit in the bar, in this order. BRIDGE always keeps the corner. The bar changes as you tap.</div>";
    ST_GROUPS.forEach(function (g) {
      html += '<div class="st-group">' + phead(g[0], g[0] === "STANDBY" ? "COMING LATER" : "", g[1]) + '<div class="st-tiles">';
      STATIONS.filter(function (s) { return s.g === g[0]; }).forEach(function (s) {
        var pinned = on.indexOf(s.id) > -1;
        var tag = s.standby ? '<span class="pill">STANDBY</span>' :
          edit ? '<span class="st-pin' + (pinned || s.fixed ? " on" : "") + '">' + (s.fixed ? "CORNER" : pinned ? "PINNED" : on.length >= MAX_PINS ? "BAR FULL" : "+ PIN") + "</span>" :
          (pinned || s.fixed ? "" : '<span class="pill">IN HERE</span>');
        html += '<button type="button" class="st-tile' + (s.standby ? " st-off" : "") + '" style="--c: var(--' + (s.standby ? "line" : g[1]) + ')" data-station="' + s.id + '"' +
          (state.screen === s.id && !edit ? ' aria-current="page"' : "") + (s.standby ? " disabled" : "") +
          '><span class="st-row"><b>' + s.name + "</b>" + tag + "</span><small>" + esc(s.sub) + "</small></button>";
      });
      html += "</div></div>";
    });
    $("launch").innerHTML = html;
  }
  function openLaunch(open) {
    state.launch = !!open;
    if (!open) state.pinEdit = false;
    $("launch").hidden = !open;
    $("content").hidden = !!open;
    if (open) { renderLaunch(); $("launch").scrollTop = 0; if (!calm()) restartClass($("launch"), "enter"); }
    renderHeader();
  }
  $("allBtn").addEventListener("click", function () { openLaunch(!state.launch); });
  $("pins").addEventListener("click", function (e) {
    var b = e.target.closest("[data-screen]");
    if (b) go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null);
  });
  $("launch").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.launch === "close") { openLaunch(false); return; }
    if (b.dataset.pins) { state.pinEdit = !state.pinEdit; renderLaunch(); return; }
    var id = b.dataset.station, s = id && station(id);
    if (!s || s.standby) return;
    if (!state.pinEdit) { go(id, id === "today" ? new Date() : null); return; }
    if (s.fixed) { toast("BRIDGE keeps the corner"); return; }
    var on = pins(), at = on.indexOf(id);
    if (at > -1) on.splice(at, 1);
    else if (on.length >= MAX_PINS) { toast("The bar holds " + MAX_PINS + ". Unpin one first."); return; }
    else on.push(id);
    lsSet(LS_PINS, STATIONS.map(function (x) { return x.id; }).filter(function (x) { return on.indexOf(x) > -1; }));
    renderLaunch(); renderHeader();
  });

  /* ---------- Habits ---------- */
  /* One page per day in the Habits database (bridge 1.14): Meditated, Evening Walk, Water in litres
     (half-bottle steps of a 1 L bottle) and the debit card (Did Not Swipe / Swiped). A tap changes the
     day here at once; the whole day is sent a moment later and kept on this iPad until it lands. */
  var LS_HABITS = "tos.habits.v1", LS_HABITQ = "tos.habitq.v1", LS_HABITCFG = "tos.habitcfg.v1";
  var HABITS = [
    { id: "med", name: "MEDITATED", c: "chrome-c" },
    { id: "walk", name: "EVENING WALK", c: "personal" },
    { id: "water", name: "WATER", c: "work" },
    { id: "card", name: "NO CARD SWIPE", c: "chrome-b" }
  ];
  var WATER_GOALS = [2, 2.5, 3, 3.5, 4];
  var hb = { data: lsGet(LS_HABITS), q: lsGet(LS_HABITQ) || {}, err: null, inflight: false, flushing: false, timer: null, pop: null };
  function canHabits() { return state.caps.indexOf("habits") > -1; }
  function waterGoal() { var c = lsGet(LS_HABITCFG) || {}; return WATER_GOALS.indexOf(c.goal) > -1 ? c.goal : 3; }
  function litres(n) { return (n % 1 ? n.toFixed(1) : String(n)) + " L"; }
  function hDay(key) { return hb.q[key] || (hb.data && hb.data.days[key]) || null; }
  function hWin(id, d) {
    if (!d) return null;
    if (id === "med" || id === "walk") return !!d[id];
    if (id === "water") return d.water == null ? null : d.water >= waterGoal();
    return d.card == null ? null : d.card === "kept";
  }
  function hStreak(id) {
    var t = sod(new Date()), n = 0;
    for (var i = hWin(id, hDay(ymd(t))) ? 0 : 1; i < 400 && hWin(id, hDay(ymd(addDays(t, -i)))) === true; i++) n++;
    return n;
  }
  function hBest(id) {
    var t = sod(new Date()), best = 0, run = 0;
    for (var i = 370; i >= 0; i--) { if (hWin(id, hDay(ymd(addDays(t, -i)))) === true) { run++; best = Math.max(best, run); } else run = 0; }
    return best;
  }
  function hRate(id, days) {
    var t = sod(new Date()), w = 0, c = 0;
    for (var i = 1; i <= days; i++) { var x = hWin(id, hDay(ymd(addDays(t, -i)))); if (x !== null) { c++; if (x) w++; } }
    return c ? Math.round(w / c * 100) : null;
  }
  function habitsErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Habits database with the bridge yet. In Notion open 🔁 Habits → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Deploy bridge 1.14 (steps in the README under Habits + Library).";
    return describe(err);
  }
  function loadHabits(force) {
    if (!state.conn || !canHabits() || hb.inflight) return;
    if (!force && hb.data && Date.now() - hb.data.fetched < 120000) return;
    if (!force && hb.err && !hb.err.write && Date.now() - hb.err.at < FRESH_MS) return;
    hb.inflight = true;
    api({ action: "habits", from: ymd(addDays(new Date(), -370)), to: ymd(new Date()) }).then(function (j) {
      var days = {};
      (j.days || []).forEach(function (d) { days[d.date] = { med: !!d.med, walk: !!d.walk, water: d.water == null ? null : d.water, card: d.card || null }; });
      hb.data = { fetched: Date.now(), days: days };
      if (!hb.err || !hb.err.write) hb.err = null;
      lsSet(LS_HABITS, hb.data);
      flushHabits();
    }).catch(function (err) {
      hb.err = { at: Date.now(), msg: habitsErrText(err) };
    }).then(function () {
      hb.inflight = false;
      if (["habits", "bridge", "review"].indexOf(state.screen) > -1) render(true);
    });
  }
  function setHabit(key, patch) {
    var cur = hDay(key) || { med: false, walk: false, water: null, card: null };
    hb.q[key] = Object.assign({}, cur, patch);
    lsSet(LS_HABITQ, hb.q);
    clearTimeout(hb.timer);
    hb.timer = setTimeout(flushHabits, 700);
    render(true);
  }
  function flushHabits() {
    if (hb.flushing || !state.conn || !canHabits()) return;
    var keys = Object.keys(hb.q);
    if (!keys.length) return;
    var key = keys[0], sent = hb.q[key];
    hb.flushing = true;
    apiPost({ action: "habitset", day: { date: key, med: !!sent.med, walk: !!sent.walk, water: sent.water, card: sent.card } }).then(function (j) {
      if (!hb.data) hb.data = { fetched: 0, days: {} };
      hb.data.days[key] = { med: !!j.day.med, walk: !!j.day.walk, water: j.day.water == null ? null : j.day.water, card: j.day.card || null };
      lsSet(LS_HABITS, hb.data);
      if (hb.q[key] === sent) delete hb.q[key];
      lsSet(LS_HABITQ, hb.q);
      hb.err = null;
      hb.flushing = false;
      if (Object.keys(hb.q).length) flushHabits();
      else if (["habits", "bridge"].indexOf(state.screen) > -1) render(true);
    }).catch(function (err) {
      hb.flushing = false;
      hb.err = { at: Date.now(), msg: habitsErrText(err), write: true };
      clearTimeout(hb.timer); hb.timer = setTimeout(flushHabits, 30000);   /* kept on the iPad; tried again shortly */
      if (["habits", "bridge"].indexOf(state.screen) > -1) render(true);
    });
  }
  function habitMeta() {
    if (hb.err && hb.err.write) return '<span class="warntxt">NOT SAVED YET · RETRIES ON ITS OWN</span>';
    if (Object.keys(hb.q).length) return "SAVING…";
    if (!hb.data) return hb.err ? "" : "LOADING";
    return "SAVED TO NOTION";
  }
  function bottles(w, goal, big) {
    var n = Math.max(1, Math.ceil(Math.max(goal, w || 0))), out = "";
    for (var k = 1; k <= n; k++) {
      var fill = (w || 0) >= k ? " full" : (w || 0) >= k - .5 ? " half" : "";
      out += '<button type="button" class="hb-bottle' + fill + (big ? "" : " sm") + '" data-hwater="' + k + '" aria-label="Bottle ' + k + (fill === " full" ? ", full" : fill ? ", half" : ", empty") + '"><i></i></button>';
    }
    return out;
  }
  function habitTile(h, key, d) {
    var isToday = key === ymd(new Date()), st = isToday ? hStreak(h.id) : 0, win = hWin(h.id, d);
    var cls = "hb-tile" + (win ? " done" : "") + (hb.pop === h.id ? " pop" : ""), foot = '<span class="hb-st">' + (isToday ? (st ? st + "-DAY STREAK" : "START A STREAK") : "") + "</span>";
    var style = ' style="--c: var(--' + h.c + ')"';
    if (h.id === "med" || h.id === "walk") {
      var on = !!(d && d[h.id]);
      return '<button type="button" class="' + cls + '"' + style + ' data-hbool="' + h.id + '" aria-pressed="' + on + '"><span class="hb-nm">' + h.name + '</span><span class="hb-big">' +
        (on ? (h.id === "med" ? "DONE" : "WALKED") : "NOT YET") + "</span>" + foot + "</button>";
    }
    if (h.id === "water") {
      var w = d && d.water != null ? d.water : 0, goal = waterGoal();
      return '<div class="' + cls + '"' + style + '><span class="hb-nm">WATER</span><span class="hb-big">' + litres(w) + ' <small>OF ' + litres(goal) + ' · 1 L BOTTLES</small></span><div class="hb-bottles">' + bottles(w, goal, true) +
        '</div><div class="hb-seg"><button type="button" class="chip" data-hstep="-0.5" aria-label="Half a bottle less">− ½</button><button type="button" class="chip" data-hstep="0.5">+ ½ BOTTLE</button></div>' + foot + "</div>";
    }
    var c = d ? d.card : null;
    return '<div class="' + cls + '"' + style + '><span class="hb-nm">DEBIT CARD</span><span class="hb-big">' + (c === "kept" ? "DID NOT SWIPE" : c === "swiped" ? "SWIPED" : "NOT YET") + '</span><div class="hb-seg">' +
      '<button type="button" class="chip" style="--c: var(--chrome-b)" data-hcard="kept" aria-pressed="' + (c === "kept") + '">DID NOT SWIPE</button>' +
      '<button type="button" class="chip" style="--c: var(--warn)" data-hcard="swiped" aria-pressed="' + (c === "swiped") + '">SWIPED</button></div>' + foot + "</div>";
  }
  function habitGrid(h) {
    var t = sod(new Date()), dow = (t.getDay() + 6) % 7, start = 77 + dow, cells = "", goal = waterGoal();
    for (var i = start; i > start - 84; i--) {
      if (i < 0) { cells += '<span class="hb-cell future"></span>'; continue; }
      var dt = addDays(t, -i), key = ymd(dt), d = hDay(key), x = hWin(h.id, d), cls = "hb-cell", style = "";
      if (x === null) cls += " none";
      else if (h.id === "water") style = ' style="background: color-mix(in srgb, var(--work) ' + Math.round(18 + 82 * Math.min(1, d.water / goal)) + '%, var(--panel-2))"';
      else if (x) cls += " win";
      if (i === 0) cls += " today";
      var tip = dLabel(dt) + " · " + (x === null ? "not recorded" : h.id === "water" ? litres(d.water) : h.id === "card" ? (x ? "did not swipe" : "swiped") : x ? "done" : "missed");
      cells += '<button type="button" class="' + cls + '"' + style + ' data-hday="' + key + '" title="' + tip + '" aria-label="' + tip + '"></button>';
    }
    return '<div class="hb-g" style="--c: var(--' + h.c + ')"><h3>' + h.name + '</h3><div class="hb-cells">' + cells + "</div></div>";
  }
  function renderHabits() {
    loadHabits(false);
    if (!canHabits()) { $("content").innerHTML = '<div class="hb">' + phead("HABITS", "SETUP") + stubBox(state.conn ? "Needs bridge 1.14 and the 🔁 Habits database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Habits + Library</b>." : "Link calendars first.") + "</div>"; return; }
    var key = ymd(state.anchor), d = hDay(key), today = key === ymd(new Date());
    var html = '<div class="hb"><div class="hb-top"><section>' + phead(today ? "TODAY" : dLabel(state.anchor), habitMeta());
    if (hb.err && !hb.data) html += '<div class="err">' + esc(hb.err.msg) + "</div>";
    html += '<div class="hb-tiles">' + HABITS.map(function (h) { return habitTile(h, key, d); }).join("") + "</div>" +
      '<div class="hb-goal"><span>WATER GOAL</span>' + WATER_GOALS.map(function (g) { return '<button type="button" class="chip" style="--c: var(--work)" data-hgoal="' + g + '" aria-pressed="' + (g === waterGoal()) + '">' + litres(g) + "</button>"; }).join("") + "</div>" +
      (hb.err && hb.err.write ? '<div class="err">' + esc(hb.err.msg) + "</div>" : "") +
      '<p class="muted hb-note">A day you don\'t touch stays blank, never counted as a miss. Earlier days: the arrows, or tap a square below.</p></section>';
    html += "<section>" + phead("STREAKS", "", "chrome-a") + '<div class="hb-srow head"><span></span><span></span><span>NOW</span><span>BEST</span><span>30 DAYS</span></div>' + HABITS.map(function (h) {
      var r = hRate(h.id, 30);
      return '<div class="hb-srow" style="--c: var(--' + h.c + ')"><span class="sw"></span><span>' + h.name + (h.id === "water" ? '<small class="muted"> · ' + litres(waterGoal()) + "+</small>" : "") + '</span><span class="n tnum">' + hStreak(h.id) +
        '<small>DAYS</small></span><span class="n tnum">' + hBest(h.id) + '<small>DAYS</small></span><span class="n tnum">' + (r === null ? "–" : r) + "<small>%</small></span></div>";
    }).join("") + "</section></div>";
    html += '<section class="hb-weeks">' + phead("LAST 12 WEEKS", "MONDAY AT TOP · THIS WEEK ON THE RIGHT", "chrome-c") + '<div class="hb-grids">' + HABITS.map(habitGrid).join("") + "</div>" +
      '<div class="hb-legend"><span><i style="background: var(--chrome-c)"></i>DONE</span><span><i style="background: var(--panel-2)"></i>MISSED</span><span><i class="none"></i>NOT RECORDED</span>' +
      '<span><i style="background: color-mix(in srgb, var(--work) 35%, var(--panel-2))"></i><i style="background: color-mix(in srgb, var(--work) 70%, var(--panel-2))"></i><i style="background: var(--work)"></i>WATER, LESS TO GOAL</span></div></section></div>';
    hb.pop = null;
    $("content").innerHTML = html;
  }
  /* The same four, one tap each, on the Bridge. */
  function habitsPanel(today) {
    if (!canHabits()) return "";
    loadHabits(false);
    var d = hDay(today), goal = waterGoal(), c = d ? d.card : null, w = d && d.water != null ? d.water : 0;
    var chip = function (attr, c2, on, label) { return '<button type="button" class="chip hb-chip" style="--c: var(--' + c2 + ')" ' + attr + ' aria-pressed="' + on + '"><span class="tick"></span>' + label + "</button>"; };
    return phead("HABITS · TODAY", habitMeta()) + '<div class="hb-strip">' +
      chip('data-hbool="med"', "chrome-c", !!(d && d.med), "MEDITATED") + chip('data-hbool="walk"', "personal", !!(d && d.walk), "EVENING WALK") +
      chip('data-hstep="0.5"', "work", w >= goal, "WATER " + litres(w) + " / " + litres(goal) + " · + ½") +
      chip('data-hcycle="1"', c === "swiped" ? "warn" : "chrome-b", c !== null, c === "kept" ? "DID NOT SWIPE" : c === "swiped" ? "SWIPED" : "DEBIT CARD · NOT YET") + "</div>" +
      (hb.err && hb.err.write ? '<div class="err" style="margin-top:10px">' + esc(hb.err.msg) + "</div>" : "");
  }
  /* Review: the week's habits, day by day, against the 12 weeks before. */
  function habitsWeek(w0) {
    if (!canHabits()) return "";
    loadHabits(false);
    if (!hb.data) return "<section>" + phead("HABITS", "") + '<div class="empty">' + (hb.err ? esc(hb.err.msg) : "Loading your habits from Notion…") + "</div></section>";
    var t = ymd(new Date()), goal = waterGoal();
    var html = "<section>" + phead("HABITS", "THIS WEEK, DAY BY DAY") + '<div class="hb-wk head"><span></span>' + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return "<span>" + x + "</span>"; }).join("") + '<span>WEEK</span><span>VS 12 WEEKS</span></div>';
    HABITS.forEach(function (h) {
      var cells = "", wins = 0, cnt = 0, sum = 0;
      for (var k = 0; k < 7; k++) {
        var key = ymd(addDays(w0, k));
        if (key > t) { cells += '<span class="d future"></span>'; continue; }
        var d = hDay(key), x = hWin(h.id, d);
        if (x === null) { cells += '<span class="d none"></span>'; continue; }
        cnt++; if (x) wins++;
        if (h.id === "water") { sum += d.water; cells += '<span class="d ' + (x ? "win" : "part") + ' tnum">' + (d.water % 1 ? d.water.toFixed(1) : d.water) + "</span>"; }
        else cells += '<span class="d' + (x ? " win" : "") + '"></span>';
      }
      var pw = 0, pc = 0;
      for (var j = 1; j <= 84; j++) { var y = hWin(h.id, hDay(ymd(addDays(w0, -j)))); if (y !== null) { pc++; if (y) pw++; } }
      var exp = pc ? pw / pc * cnt : null, diff = exp === null ? null : wins - exp;
      var tot = h.id === "water" ? (cnt ? litres(Math.round(sum / cnt * 10) / 10) + '<small class="muted"> AVG</small>' : "–") : wins + '<small class="muted"> / ' + cnt + "</small>";
      var vs = diff === null || !cnt ? '<span class="vs">–</span>' : Math.abs(diff) < .5 ? '<span class="vs">ON PACE</span>' : diff > 0 ? '<span class="vs up">▲ ' + diff.toFixed(1) + " DAYS</span>" : '<span class="vs down">▼ ' + Math.abs(diff).toFixed(1) + " DAYS</span>";
      html += '<div class="hb-wk" style="--c: var(--' + h.c + ')"><span class="nm">' + h.name + "</span>" + cells + '<span class="tot tnum">' + tot + "</span>" + vs + "</div>";
    });
    return html + '<small class="muted">Water shows litres each day; a full square means ' + litres(goal) + " or more. Read live from the Habits database, so a day changed later shows here too.</small></section>";
  }
  /* ALL REVIEWS trends: share of recorded days won, week by week. */
  function habitsTrend(win) {
    if (!canHabits() || !hb.data) return "";
    var t = ymd(new Date());
    return '<div class="rl-chart wide"><h3>HABITS PER WEEK</h3><div class="sub">Days won of days recorded, from the Habits database.</div><div class="hb-trend" style="grid-template-columns: 130px repeat(' + win.length + ', minmax(0, 1fr))">' +
      HABITS.map(function (h) {
        return '<span class="nm" style="color: var(--' + h.c + ')">' + h.name + "</span>" + win.map(function (x) {
          var w = 0, c = 0;
          for (var k = 0; k < 7; k++) { var key = ymd(addDays(x.w0, k)); if (key > t) break; var y = hWin(h.id, hDay(key)); if (y !== null) { c++; if (y) w++; } }
          return '<span class="c tnum" style="--c: var(--' + h.c + '); --f: ' + (c ? Math.round(w / c * 100) : 0) + '%"' + (c ? "" : ' data-none="1"') + ' title="Week ' + isoWeek(x.w0) + ": " + w + " of " + c + '">' + (c ? w : "") + "</span>";
        }).join("");
      }).join("") + '<span></span>' + win.map(function (x) { return '<span class="wkn tnum">' + isoWeek(x.w0) + "</span>"; }).join("") + "</div></div>";
  }
  function habitsClick(b) {
    var key = state.screen === "habits" ? ymd(state.anchor) : ymd(new Date()), d = hDay(key) || {};
    if (b.dataset.hbool) { var id = b.dataset.hbool, on = !d[id], p = {}; p[id] = on; hb.pop = on ? id : null; setHabit(key, p); return true; }
    if (b.dataset.hwater) { var k = +b.dataset.hwater; setHabit(key, { water: d.water === k ? k - .5 : k }); return true; }
    if (b.dataset.hstep) { var nw = Math.max(0, Math.min(12, (d.water || 0) + Number(b.dataset.hstep))); hb.pop = nw >= waterGoal() && (d.water || 0) < waterGoal() ? "water" : null; setHabit(key, { water: nw }); return true; }
    if (b.dataset.hcard) { var v = b.dataset.hcard; hb.pop = d.card !== v && v === "kept" ? "card" : null; setHabit(key, { card: d.card === v ? null : v }); return true; }
    if (b.dataset.hcycle) { setHabit(key, { card: d.card == null ? "kept" : d.card === "kept" ? "swiped" : null }); return true; }
    if (b.dataset.hgoal) { lsSet(LS_HABITCFG, { goal: Number(b.dataset.hgoal) }); render(true); return true; }
    if (b.dataset.hday) { state.anchor = parseYmd(b.dataset.hday); render(true); return true; }
    return false;
  }

  /* ---------- Library ---------- */
  /* One page per book in the Library database (bridge 1.14). Books are found on Open Library
     (free, no account) straight from the iPad; covers load from Open Library too. */
  var LS_LIBRARY = "tos.library.v1", LS_SHELF = "tos.shelf.v1";
  var SHELVES = [["reading", "READING"], ["want", "WANT TO READ"], ["read", "READ"], ["aside", "SET ASIDE"]];
  var COVER_TINTS = ["chrome-a", "chrome-b", "chrome-c", "work", "personal", "farm", "hobby"];
  var lb = { data: lsGet(LS_LIBRARY), err: null, inflight: false, draft: null, search: null, sTimer: null, sSeq: 0, removeArm: false };
  function canLibrary() { return state.caps.indexOf("library") > -1; }
  function shelfNow() { var s = lsGet(LS_SHELF); return SHELVES.some(function (x) { return x[0] === s; }) ? s : "reading"; }
  function libraryErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Library with the bridge yet. In Notion open 📚 Library → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Deploy bridge 1.14 (steps in the README under Habits + Library).";
    return describe(err);
  }
  function loadLibrary(force) {
    if (!state.conn || !canLibrary() || lb.inflight) return;
    if (!force && lb.data && Date.now() - lb.data.fetched < 300000) return;
    if (!force && lb.err && Date.now() - lb.err.at < FRESH_MS) return;
    lb.inflight = true;
    api({ action: "library" }).then(function (j) {
      lb.data = { fetched: Date.now(), books: j.books || [] }; lb.err = null; lsSet(LS_LIBRARY, lb.data);
    }).catch(function (err) { lb.err = { at: Date.now(), msg: libraryErrText(err) }; })
      .then(function () { lb.inflight = false; if (state.screen === "library") render(true); });
  }
  function books() { return (lb.data && lb.data.books) || []; }
  function bookById(id) { return books().filter(function (b) { return b.id === id; })[0]; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function cover(b, cls) {
    var longest = Math.max.apply(null, String(b.title).split(" ").map(function (w) { return w.length; })), fs = longest > 9 || b.title.length > 26 ? 11 : longest > 7 || b.title.length > 16 ? 13 : 15;
    return '<span class="lb-cover' + (cls ? " " + cls : "") + '" lang="en" style="--cc: var(--' + COVER_TINTS[hash(b.title) % COVER_TINTS.length] + "); --fs: " + fs + 'px"><span class="ct">' + esc(b.title) + '</span><span class="ca">' + esc(b.author || "") + "</span>" +
      (b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + "</span>";
  }
  function stars(n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= (n || 0) ? "★" : '<span class="off">★</span>'; return '<span class="lb-stars" aria-label="' + (n || 0) + ' of 5 stars">' + s + "</span>"; }
  function bookDays(b) { return b.started && b.finished ? Math.max(1, daysBetween(b.started, b.finished)) : null; }
  function renderLibrary() {
    loadLibrary(false);
    if (!canLibrary()) { $("content").innerHTML = '<div class="lb">' + phead("LIBRARY", "SETUP") + stubBox(state.conn ? "Needs bridge 1.14 and the 📚 Library database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Habits + Library</b>." : "Link calendars first.") + "</div>"; return; }
    if (!lb.data) { $("content").innerHTML = '<div class="lb">' + phead("LIBRARY", "") + '<div class="empty">' + (lb.err ? esc(lb.err.msg) : "Loading your library from Notion…") + "</div></div>"; return; }
    var all = books(), yr = new Date().getFullYear(), read = all.filter(function (b) { return b.status === "read"; }), sh = shelfNow();
    var thisYear = read.filter(function (b) { return b.finished && +b.finished.slice(0, 4) === yr; }).length;
    var spans = read.map(bookDays).filter(function (x) { return x; }).sort(function (a, b) { return a - b; }), typical = spans.length ? spans[Math.floor(spans.length / 2)] : null;
    var by = {}; read.forEach(function (b) { if (b.author) by[b.author] = (by[b.author] || 0) + 1; });
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    var html = '<div class="lb"><div class="lb-stats">' +
      '<div class="lb-stat" style="--c: var(--chrome-b)"><span class="k">READ IN ' + yr + '</span><span class="v tnum">' + thisYear + "<small>" + (thisYear === 1 ? "BOOK" : "BOOKS") + "</small></span></div>" +
      '<div class="lb-stat" style="--c: var(--chrome-d)"><span class="k">TYPICAL BOOK</span><span class="v tnum">' + (typical === null ? "–" : typical) + "<small>DAYS START TO FINISH</small></span></div>" +
      '<div class="lb-stat" style="--c: var(--chrome-c)"><span class="k">MOST READ AUTHOR</span><span class="v name">' + (top && by[top] > 1 ? esc(top.toUpperCase()) : "–") + '</span><span class="k">' + (top && by[top] > 1 ? by[top] + " BOOKS READ" : "TWO BOOKS BY ONE AUTHOR TO SHOW") + "</span></div></div>";
    html += '<div class="lb-tools"><div class="chips">' + SHELVES.map(function (s) {
      var n = all.filter(function (b) { return b.status === s[0]; }).length;
      return '<button type="button" class="chip" data-shelf="' + s[0] + '" aria-pressed="' + (sh === s[0]) + '">' + s[1] + " · " + n + "</button>";
    }).join("") + '</div><button type="button" class="btn sm" data-act="addbook">+ ADD BOOK</button></div>';
    var list = all.filter(function (b) { return b.status === sh; });
    if (sh === "reading") {
      html += "<section>" + phead("ON THE NIGHTSTAND", list.length + " IN PROGRESS") + (list.length ? '<div class="lb-reading">' + list.map(function (b) {
        var day = b.started ? daysBetween(b.started, ymd(new Date())) + 1 : null;
        return '<div class="lb-card"><button type="button" class="lb-book" data-book="' + esc(b.id) + '" aria-label="' + esc(b.title) + '">' + cover(b) + '</button><div><div class="t">' + esc(b.title) + '</div><div class="muted">' + esc(b.author || "") + "</div>" +
          '<div class="meta">' + (b.started ? "STARTED " + dLabel(parseYmd(b.started)) + " · DAY " + day : "NO START DATE") + '</div><div class="btnrow"><button type="button" class="btn sm" data-bfinish="' + esc(b.id) + '">FINISHED</button><button type="button" class="btn sm ghost" data-baside="' + esc(b.id) + '">SET ASIDE</button></div></div></div>';
      }).join("") + "</div>" : '<div class="empty">Nothing on the nightstand. Tap a book under WANT TO READ, or + ADD BOOK.</div>') + "</section>";
      var next = all.filter(function (b) { return b.status === "want"; });
      if (next.length) html += "<section>" + phead("UP NEXT", "FROM WANT TO READ", "chrome-a") + '<div class="lb-shelf">' + next.slice(0, 6).map(bookTile).join("") + "</div></section>";
    } else if (sh === "read") {
      var years = {};
      list.forEach(function (b) { var y = b.finished ? b.finished.slice(0, 4) : "NO DATE"; (years[y] = years[y] || []).push(b); });
      Object.keys(years).sort().reverse().forEach(function (y) {
        var g = years[y].sort(function (a, b) { return (b.finished || "").localeCompare(a.finished || ""); });
        html += "<section>" + phead(y, g.length + (g.length === 1 ? " BOOK" : " BOOKS"), "chrome-c") + '<div class="lb-read">' + g.map(function (b) {
          var n = bookDays(b);
          return '<button type="button" class="lb-row" data-book="' + esc(b.id) + '">' + cover(b, "mini") + '<span class="dt tnum">' + (b.finished ? shortDay(b.finished) : "") + '</span><span class="tt"><b>' + esc(b.title) + "</b><small>" + esc(b.author || "") + "</small></span>" +
            (n ? '<span class="pill tnum">' + n + (n === 1 ? " DAY" : " DAYS") + "</span>" : "<span></span>") + stars(b.rating) + "</button>";
        }).join("") + "</div></section>";
      });
      if (!list.length) html += '<div class="empty">No finished books yet.</div>';
    } else {
      html += "<section>" + phead(sh === "want" ? "WANT TO READ" : "SET ASIDE", list.length + (list.length === 1 ? " BOOK" : " BOOKS")) +
        (list.length ? '<div class="lb-shelf">' + list.map(bookTile).join("") + "</div>" : '<div class="empty">Nothing here.</div>') + "</section>";
    }
    if (lb.err) html += stale(lb.data.fetched);
    $("content").innerHTML = html + "</div>";
  }
  function bookTile(b) { return '<button type="button" class="lb-book" data-book="' + esc(b.id) + '">' + cover(b) + '<span class="bt">' + esc(b.title) + '</span><span class="ba">' + esc(b.author || "") + "</span></button>"; }
  /* Save a change: shown at once, sent to Notion, put back if Notion refuses. */
  function bookSave(id, patch, msg) {
    var b = bookById(id), before = b ? JSON.parse(JSON.stringify(b)) : null;
    if (b) { Object.assign(b, patch); lsSet(LS_LIBRARY, lb.data); }
    if (state.screen === "library") render(true);
    apiPost({ action: "booksave", book: Object.assign({ id: id }, patch) }).then(function (j) {
      var cur = bookById(id); if (cur) Object.assign(cur, j.book); lsSet(LS_LIBRARY, lb.data);
      if (msg) toast(msg);
    }).catch(function (err) {
      var cur = bookById(id); if (cur && before) Object.assign(cur, before); lsSet(LS_LIBRARY, lb.data);
      toast("Not saved: " + libraryErrText(err));
      if (state.screen === "library") render(true);
    });
  }
  function bookAdd(found, status) {
    var today = ymd(new Date()), cid = newCid();
    var b = { cid: cid, title: found.title, author: found.author || "", status: status, cover: found.cover || "", ol: found.ol || "", year: found.year || null };
    if (status === "reading") b.started = today;
    if (status === "read") b.finished = today;
    var temp = Object.assign({ id: "tmp-" + cid, started: b.started || null, finished: b.finished || null, rating: null, notes: "", created: new Date().toISOString() }, b);
    if (!lb.data) lb.data = { fetched: 0, books: [] };
    lb.data.books.unshift(temp);
    lsSet(LS_SHELF, status);
    closeDetail();
    render(true);
    var send = { cid: cid, title: b.title, author: b.author, status: status, started: b.started || null, finished: b.finished || null };
    if (b.cover) send.cover = b.cover; if (b.ol) send.ol = b.ol; if (b.year) send.year = b.year;
    apiPost({ action: "booksave", book: send }).then(function (j) {
      var i = lb.data.books.indexOf(temp); if (i > -1) lb.data.books[i] = j.book; else lb.data.books.unshift(j.book);
      lsSet(LS_LIBRARY, lb.data);
      toast("Added to " + SHELVES.filter(function (s) { return s[0] === status; })[0][1]);
      if (state.screen === "library") render(true);
    }).catch(function (err) {
      var i = lb.data.books.indexOf(temp); if (i > -1) lb.data.books.splice(i, 1);
      toast("Not added: " + libraryErrText(err));
      if (state.screen === "library") render(true);
    });
  }
  /* + ADD BOOK: search Open Library as you type; or add by hand. */
  function openAddBook() {
    lb.search = { q: "", results: null, busy: false, err: null };
    $("detailSheet").className = "sheet lb-sheet";
    $("detailSheet").style.setProperty("--c", "var(--chrome-b)");
    $("detailSheet").innerHTML = '<div class="sbar"><span>+ ADD BOOK</span><span>SEARCH · OPEN LIBRARY</span></div><div class="sbody"><input type="search" id="olq" placeholder="Title or author" autocomplete="off" enterkeyhint="search" aria-label="Title or author"><div id="olres"></div></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("olq").focus();
  }
  function olResults() {
    var s = lb.search, el = $("olres");
    if (!s || !el) return;
    var add = function (i) { return '<div class="hb-seg"><button type="button" class="chip" data-addas="want" data-r="' + i + '">WANT</button><button type="button" class="chip" data-addas="reading" data-r="' + i + '">READING NOW</button><button type="button" class="chip" data-addas="read" data-r="' + i + '">ALREADY READ</button></div>'; };
    var html = s.busy ? '<div class="empty">Searching Open Library…</div>' : s.err ? '<div class="err">' + esc(s.err) + "</div>" : "";
    if (s.results) html += s.results.length ? s.results.map(function (r, i) {
      var have = books().some(function (b) { return b.title.toLowerCase() === r.title.toLowerCase() && (b.author || "") === (r.author || ""); });
      return '<div class="lb-result">' + cover(r, "mini") + '<div><b>' + esc(r.title) + "</b><small>" + esc([r.author, r.year].filter(Boolean).join(" · ")) + (have ? " · ALREADY IN YOUR LIBRARY" : "") + "</small>" + add(i) + "</div></div>";
    }).join("") : '<div class="empty">Nothing found on Open Library.</div>';
    if (s.q.length >= 2) html += '<div class="lb-manual"><span class="muted">Not listed? Add “' + esc(s.q) + '” by hand:</span>' + add(-1) + "</div>";
    el.innerHTML = html;
  }
  function olSearch(q) {
    var s = lb.search; if (!s) return;
    s.q = q.trim();
    clearTimeout(lb.sTimer);
    if (s.q.length < 3) { s.results = null; s.busy = false; s.err = null; olResults(); return; }
    lb.sTimer = setTimeout(function () {
      var seq = ++lb.sSeq;
      s.busy = true; s.err = null; olResults();
      fetch("https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,first_publish_year,cover_i&q=" + encodeURIComponent(s.q))
        .then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.json(); })
        .then(function (j) {
          if (seq !== lb.sSeq) return;
          s.results = (j.docs || []).map(function (d) {
            return { title: String(d.title || "").slice(0, 200), author: (d.author_name || []).slice(0, 2).join(", ").slice(0, 200), year: d.first_publish_year || null,
              cover: d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-M.jpg" : "", ol: /^\/works\/\w+$/.test(d.key || "") ? "https://openlibrary.org" + d.key : "" };
          }).filter(function (d) { return d.title; });
        })
        .catch(function () { if (seq === lb.sSeq) s.err = "Couldn't reach Open Library. Add it by hand below, or try again in a moment."; })
        .then(function () { if (seq === lb.sSeq) { s.busy = false; olResults(); } });
    }, 450);
  }
  /* A book's sheet: shelf, dates, stars and notes, saved together on DONE. */
  function openBook(id) {
    var b = bookById(id); if (!b) return;
    lb.draft = { id: id, status: b.status, started: b.started || "", finished: b.finished || "", rating: b.rating || 0, notes: b.notes || "" };
    lb.removeArm = false;
    $("detailSheet").className = "sheet lb-sheet";
    $("detailSheet").style.setProperty("--c", "var(--chrome-b)");
    drawBook();
    showSheet("detailScrim");
  }
  function drawBook() {
    var dr = lb.draft, b = bookById(dr.id); if (!b) return;
    var notesEl = $("bkNotes"); if (notesEl) dr.notes = notesEl.value;
    $("detailSheet").innerHTML = '<div class="sbar"><span>📖 BOOK</span><span>' + SHELVES.filter(function (s) { return s[0] === dr.status; })[0][1] + "</span></div>" +
      '<div class="sbody"><div class="lb-detail">' + cover(b, "big") + '<div class="lb-dbody"><h3 id="detailTitle">' + esc(b.title) + '</h3><div class="muted">' + esc([b.author, b.year].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="hb-seg">' + SHELVES.map(function (s) { return '<button type="button" class="chip" data-bstatus="' + s[0] + '" aria-pressed="' + (dr.status === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<div class="lb-dates"><label>STARTED<input type="date" id="bkStarted" value="' + esc(dr.started) + '"></label><label>FINISHED<input type="date" id="bkFinished" value="' + esc(dr.finished) + '"></label></div>' +
      '<div class="lb-starpick" role="group" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-brate="' + n + '" class="' + (n <= dr.rating ? "on" : "") + '" aria-label="' + n + (n === 1 ? " star" : " stars") + '">★</button>'; }).join("") + "</div></div></div>" +
      '<textarea id="bkNotes" rows="3" maxlength="4000" placeholder="Notes, quotes, who recommended it" aria-label="Notes">' + esc(dr.notes) + "</textarea></div>" +
      '<div class="sfoot btnrow">' + (b.url ? '<a class="btn ghost" href="' + esc(b.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") +
      '<button type="button" class="btn ghost" data-bremove="1">' + (lb.removeArm ? "TAP AGAIN TO REMOVE" : "REMOVE") + '</button><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-bdone="1">DONE</button></div>';
  }
  function bookSheetClick(b) {
    var dr = lb.draft;
    if (b.dataset.addas) {
      var i = +b.dataset.r, s = lb.search, found = i === -1 ? { title: s.q.slice(0, 200) } : s.results[i];
      if (found && found.title) bookAdd(found, b.dataset.addas);
      return true;
    }
    if (!dr) return false;
    var keep = function () { dr.started = ($("bkStarted") || {}).value || ""; dr.finished = ($("bkFinished") || {}).value || ""; };
    if (b.dataset.bstatus) {
      keep(); dr.status = b.dataset.bstatus; var t = ymd(new Date());
      if (dr.status === "reading" && !dr.started) dr.started = t;
      if (dr.status === "read" && !dr.finished) dr.finished = t;
      drawBook(); return true;
    }
    if (b.dataset.brate) { keep(); var n = +b.dataset.brate; dr.rating = dr.rating === n ? 0 : n; drawBook(); return true; }
    if (b.dataset.bremove) {
      keep();
      if (!lb.removeArm) { lb.removeArm = true; drawBook(); return true; }
      var id = dr.id, bk = bookById(id), idx = books().indexOf(bk);
      lb.draft = null; closeDetail();
      if (idx > -1) lb.data.books.splice(idx, 1);
      lsSet(LS_LIBRARY, lb.data); render(true);
      apiPost({ action: "bookremove", id: id }).then(function () { toast("Removed. It's in Notion's trash if you change your mind"); }).catch(function (err) {
        if (bk) lb.data.books.splice(Math.max(0, idx), 0, bk); lsSet(LS_LIBRARY, lb.data); render(true); toast("Not removed: " + libraryErrText(err));
      });
      return true;
    }
    if (b.dataset.bdone) {
      keep(); dr.notes = ($("bkNotes") || {}).value || "";
      var cur = bookById(dr.id), patch = {};
      if (!cur) { closeDetail(); return true; }
      if (dr.status !== cur.status) patch.status = dr.status;
      if ((dr.started || null) !== (cur.started || null)) patch.started = dr.started || null;
      if ((dr.finished || null) !== (cur.finished || null)) patch.finished = dr.finished || null;
      if ((dr.rating || null) !== (cur.rating || null)) patch.rating = dr.rating || null;
      if (dr.notes.trim() !== (cur.notes || "").trim()) patch.notes = dr.notes.trim();
      lb.draft = null; closeDetail();
      if (Object.keys(patch).length) bookSave(cur.id, patch, "Saved to Notion");
      return true;
    }
    return false;
  }
  function libraryClick(b) {
    if (b.dataset.shelf) { lsSet(LS_SHELF, b.dataset.shelf); render(true); return true; }
    if (b.dataset.act === "addbook") { openAddBook(); return true; }
    if (b.dataset.book) { if (!/^tmp-/.test(b.dataset.book)) openBook(b.dataset.book); return true; }
    if (b.dataset.bfinish) { var t = ymd(new Date()), id = b.dataset.bfinish; bookSave(id, { status: "read", finished: t }, "Finished. Tap it to rate it"); return true; }
    if (b.dataset.baside) { bookSave(b.dataset.baside, { status: "aside" }, "Moved to SET ASIDE"); return true; }
    return false;
  }
  $("detailScrim").addEventListener("input", function (e) { if (e.target.id === "olq") olSearch(e.target.value); });
  /* A cover that doesn't load leaves the lettered cover underneath. */
  document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("lb-cover")) t.remove(); }, true);

  /* ---------- Top spacing below the status bar ---------- */
  /* Panels (ASK, CAPTURE, details) sit inside the part of the screen you can actually see: below the
     status bar and, while typing, above the keyboard. iPadOS shrinks the visual viewport for the keyboard
     and may scroll it; the scrims follow it through --vv-top and --vv-h. */
  lsDel(LS_TOPGAP);
  function fitViewport() {
    var v = window.visualViewport, r = document.documentElement.style;
    if (!v) return;
    r.setProperty("--vv-top", Math.max(0, v.offsetTop) + "px");
    r.setProperty("--vv-h", v.height + "px");
  }
  if (window.visualViewport) { visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); fitViewport(); }

  /* ---------- Render + navigation ---------- */
  function render(keepScroll) {
    var wrap = $("tlwrap");
    var keep = keepScroll && wrap ? wrap.scrollTop : null;
    var active = document.activeElement, typing = active && active.id && $("content").contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)
      ? { id: active.id, value: active.value, a: active.selectionStart, b: active.selectionEnd } : null;
    /* Text typed into any field since the last draw survives a redraw (a sync landing while you
       fill in a form), not just the field in use. A field you haven't touched shows fresh data. */
    /* Writing in the log: a background redraw would cost the keyboard its place. Leave the page alone. */
    if (keepScroll && state.screen === "log" && active && /^clText-/.test(active.id)) { setAreas(); renderHeader(); renderStatus(); return; }
    var typed = {};
    $("content").querySelectorAll("input[id], textarea[id]").forEach(function (f) {
      if ((f.tagName === "TEXTAREA" || /^(text|search|url|tel|email|number|)$/.test(f.type)) && f.value !== f.defaultValue) typed[f.id] = f.value;
    });
    state.index = {};
    setAreas();
    renderHeader();
    renderStatus();
    if (!state.conn && state.screen !== "systems") { renderConnect(); return; }
    ({ bridge: renderBridge, review: function () { if (state.rvLog) renderReviewLog(); else renderReview(); }, ledger: renderLedger, log: renderLog, loom: renderLoom, habits: renderHabits, library: renderLibrary, today: renderDay, week: renderWeek, month: renderMonth, dates: renderDatesScreen, systems: renderSystems })[state.screen]();
    Object.keys(typed).forEach(function (id) { var f = $(id); if (f && f.value !== typed[id]) f.value = typed[id]; });
    if (typing && $(typing.id)) {
      var el = $(typing.id);
      el.value = typing.value;
      el.focus();
      try { el.setSelectionRange(typing.a, typing.b); } catch (x) { /* not a text field */ }
    }
    var w2 = $("tlwrap");
    if (w2) w2.scrollTop = keep !== null ? keep : state.scrollTarget || 0;
    var head = $("wkhead");
    if (head && w2) head.style.paddingRight = (w2.offsetWidth - w2.clientWidth) + "px";
  }
  function go(screen, anchor) {
    if (screen === "log" || state.screen === "log") lockLog();   /* opening LOG always asks for the PIN */
    if (screen === "loom" && state.screen !== "loom") { lm.t = calm() ? 0 : -5; lm.target = null; lm.vel = 0; lm.base = 0; }   /* arrive with a short glide into today */
    if (screen === "habits" && state.screen !== "habits" && !anchor) anchor = new Date();
    if (state.launch) openLaunch(false);
    state.screen = screen;
    if (screen === "review") state.rvLog = !anchor;
    if (anchor) state.anchor = sod(anchor);
    render(false);
    if (screen === "loom") lmGo(0);
    $("content").scrollTop = 0;
    enterScreen();
    refresh(false);
  }
  function page(dir) {
    if (state.screen === "loom") { lmGo(lmFocus() + dir); return; }   /* the arrows step the loom a day */
    if (state.screen === "habits") { var hn = addDays(state.anchor, dir); if (hn > sod(new Date())) return; state.anchor = hn; render(false); enterScreen(); return; }
    var a = state.anchor;
    if (state.screen === "today") state.anchor = addDays(a, dir);
    else if (state.screen === "week" || state.screen === "review") state.anchor = addDays(a, 7 * dir);
    else state.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    render(false);
    enterScreen();
    refresh(false);
  }

  document.querySelectorAll(".navbridge[data-screen], .elbow[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null); });
  });
  $("status").addEventListener("click", function () { go("systems"); });
  $("prevBtn").addEventListener("click", function () { page(-1); });
  $("nextBtn").addEventListener("click", function () { page(1); });
  $("logBtn").addEventListener("click", function () { go("review"); });
  $("todayBtn").addEventListener("click", function () { go(state.screen, state.screen === "review" ? sow(new Date()) : new Date()); });

  $("content").addEventListener("click", function (e) {
    var hit = e.target.closest(".hit");
    if (hit) { showTip(hit); return; }
    hideTip();
    var b = e.target.closest("button");
    if (!b) { tapToCapture(e); return; }
    if (b.disabled) return;
    if (habitsClick(b) || libraryClick(b)) return;
    if (b.dataset.id && state.index[b.dataset.id]) openDetail(state.index[b.dataset.id]);
    else if (b.dataset.kd && state.index["kd:" + b.dataset.kd]) openKeyDate(state.index["kd:" + b.dataset.kd]);
    else if (b.dataset.task) toggleDone(b.dataset.task, b.dataset.day);
    else if (b.dataset.act === "dates") go("dates");
    else if (b.dataset.act === "adddate") openCapture(null, null, "date");
    else if (b.dataset.kdf !== undefined) { state.kdFilter = b.dataset.kdf || null; render(false); }
    else if (b.dataset.act === "plan") openPlan(parseYmd(b.dataset.day));
    else if (b.dataset.act === "systems") go("systems");
    else if (b.dataset.act === "bearing") { state.wmShift++; render(true); }
    else if (b.dataset.start) { lsSet(LS_START, b.dataset.start); toast("Opens on " + b.dataset.start.toUpperCase() + " from now on"); render(true); }
    else if (["placesave", "geo", "placeclear", "bearsave"].indexOf(b.dataset.act) > -1) bridgeAct(b.dataset.act);
    else if (b.dataset.more) {
      var mk = b.dataset.more, pnlSel = '[data-panel="' + mk + '"]', h0 = document.querySelector(pnlSel) ? document.querySelector(pnlSel).offsetHeight : null;
      bridgeOpen[mk] = !bridgeOpen[mk]; lsSet(LS_BOPEN, bridgeOpen); render(true);
      var pnlNow = document.querySelector(pnlSel);
      easeHeight(pnlNow, h0);
      if (pnlNow && bridgeOpen[mk]) restartClass(pnlNow, "opening");
      var again = document.querySelector('[data-more="' + mk + '"]'); if (again) { restartClass(again, "turn"); again.focus(); }
    }
    else if (b.dataset.act === "review") go("review", defaultReviewWeek());
    else if (b.dataset.rweek) go("review", parseYmd(b.dataset.rweek));
    else if (b.dataset.act === "patterns") findPatterns();
    else if (b.dataset.lrange) { lsSet(LS_LEDGERRANGE, +b.dataset.lrange); render(true); }
    else if (b.dataset.lcat) { state.ledgerCat = state.ledgerCat === b.dataset.lcat ? null : b.dataset.lcat; render(true); }
    else if (b.dataset.qmove) queueMove(+b.dataset.qi, +b.dataset.qmove);
    else if (b.dataset.qprice) queuePriceOrder();
    else if (b.dataset.qbought) { state.queueConfirm = b.dataset.qbought; render(true); }
    else if (b.dataset.qno) { state.queueConfirm = null; render(true); }
    else if (b.dataset.qyes) {
      var qname = (state.ledger.queue.items.filter(function (x) { return x.id === b.dataset.qyes; })[0] || {}).title || "Item";
      queueSend({ action: "queuebought", id: b.dataset.qyes, day: ymd(new Date()) }, qname + " marked bought. Log it in YNAB as usual.");
    }
    else if (b.dataset.qundo) queueSend({ action: "queuebought", id: b.dataset.qundo, day: null }, "Back in the queue.");
    else if (b.dataset.lpin) logPress(b.dataset.lpin);
    else if (b.dataset.lday) logPick(b.dataset.lday);
    else if (b.dataset.lyear) { lg.pickYear = +b.dataset.lyear; render(true); }
    else if (b.dataset.ljump) { var jp = b.dataset.ljump.split("-"); lg.month = new Date(+jp[0], +jp[1] - 1, 1); lg.pick = false; lg.pickYear = null; render(true); enterScreen(); }
    else if (b.dataset.lmon) { lg.month = new Date(lg.month.getFullYear(), lg.month.getMonth() + +b.dataset.lmon, 1); render(true); enterScreen(); }
    else if (b.dataset.lact) {
      var la = b.dataset.lact;
      if (la === "lock") { lockLog(); render(false); }
      else if (la === "pick") { lg.pick = !lg.pick; lg.pickYear = null; render(true); }
      else if (la === "today") { lg.month = som(new Date()); logPick(ymd(new Date())); }
      else if (la === "save") { if (lg.timer) { clearTimeout(lg.timer); lg.timer = null; } if (logDrafts[lg.day]) { lg.manual = true; logSave(lg.pin); } else { logSavedFx(true); toast("Already saved"); } }
      else if (la === "bearings") logInsertBearings();
      else if (la === "retry") { delete lg.err[lg.day]; loadLogDay(lg.day); render(true); }
      else if (la === "import") { lg.imp = { stage: "paste", entries: [], notes: [], have: {}, created: 0, fails: 0, retryAt: 0, err: null }; render(true); }
      else if (la === "impcheck") logImportCheck();
      else if (la === "imprun") logImportRun();
      else if (la === "impcancel") { lg.imp = null; loadLogDay(lg.day); render(true); }
    }
    else if (b.dataset.standby !== undefined) { lsSet(LS_STANDBY, +b.dataset.standby); if (+b.dataset.standby) holdAwake(); else letSleep(); noteTouch(); render(true); }
    else if (b.dataset.act === "standbynow") enterStandby();
    else if (b.dataset.aifin) { if (b.dataset.aifin === "1") lsSet(LS_AIFIN, true); else lsDel(LS_AIFIN); render(true); }
    else if (b.dataset.act === "savereview") submitReview();
    else if (b.dataset.act === "writesummary") writeSummary();
    else if (b.dataset.act === "ignsave") {
      setIgnore($("ignIn").value.split("\n"));
      toast(ignoreList.length ? ignoreList.length + (ignoreList.length === 1 ? " title ignored" : " titles ignored") + " · " + ignoredCount() + " events left out" : "Nothing ignored");
      render(true);
    }
    else if (b.dataset.day) go("today", parseYmd(b.dataset.day));
    else if (b.dataset.toggle) toggleArea(b.dataset.toggle);
    else if (b.dataset.act === "refresh") refreshNow();
    else if (b.dataset.act === "flush") flushQueue(true);
    else if (b.dataset.qretry) retryCapture(b.dataset.qretry);
    else if (b.dataset.qdiscard) discardCapture(b.dataset.qdiscard);
    else if (b.dataset.act === "setup") go("today");
    else if (b.dataset.act === "disconnect") {
      if (Date.now() - state.disarmAt < 4000) {
        state.conn = null;
        state.ranges = {};
        state.calendars = [];
        state.caps = [];
        lsDel(LS_CONN); lsDel(LS_CACHE); lsDel(LS_SYNC);   /* unsent captures stay queued for the next link */
        state.sync = { status: "idle", at: null, error: null };
        state.disarmAt = 0;
        toast("Unlinked. Calendar data removed from this device.");
        render(false);
      } else {
        state.disarmAt = Date.now();
        render(false);
        setTimeout(function () { if (state.screen === "systems") render(false); }, 4100);
      }
    }
  });
  $("content").addEventListener("mouseover", function (e) { var h = e.target.closest && e.target.closest(".hit"); if (h) showTip(h); });
  $("content").addEventListener("mouseout", function (e) { if (e.target.closest && e.target.closest(".hit")) hideTip(); });
  $("content").addEventListener("submit", function (e) {
    if (e.target.id === "connForm") { e.preventDefault(); submitConnect(); }
    else if (e.target.id === "qForm") { e.preventDefault(); queueAddSubmit(); }
  });
  $("content").addEventListener("input", function (e) {
    if (e.target.id === "logIntent") saveLog(e.target.value.trim());
    else if (/^clText-/.test(e.target.id) && logOpen()) { onLogInput(e.target.id.slice(7), e.target.value); growLog(e.target); }
    else if (e.target.dataset.rv && state.screen === "review") saveDraft(ymd(sow(state.anchor)), e.target.dataset.rv, e.target.value);
  });
  $("content").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "logIntent") e.target.blur(); });
  $("detailScrim").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b && bookSheetClick(b)) return;
    if (b && b.dataset.qretry) { closeDetail(); retryCapture(b.dataset.qretry); return; }
    if (b && b.dataset.qdiscard) { closeDetail(); discardCapture(b.dataset.qdiscard); return; }
    if (b && b.dataset.ignore) {
      setIgnore(ignoreList.concat([b.dataset.ignore]));
      closeDetail();
      render(true);
      toast("Ignored everywhere: \u201C" + b.dataset.ignore + "\u201D. Undo in SYSTEMS");
      return;
    }
    if (e.target === $("detailScrim") || e.target.id === "detailClose") closeDetail();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (state.launch && $("detailScrim").hidden) openLaunch(false); closeDetail(); closeCapture(); closePlan(); closeAsk(); } });

  /* ---------- Update notice ---------- */
  var UPDATE_CHECK_MS = 10 * 60 * 1000, lastUpdateCheck = 0;
  function newer(a, b) {
    var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  }
  function checkForUpdate(force) {
    if (!force && Date.now() - lastUpdateCheck < UPDATE_CHECK_MS) return;
    lastUpdateCheck = Date.now();
    fetch("version.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.version && newer(j.version, VERSION)) { $("updateBtn").hidden = false; } })
      .catch(function () { /* offline: check again later */ });
  }
  $("updateBtn").addEventListener("click", function () {
    var b = $("updateBtn");
    b.disabled = true;
    b.textContent = "LOADING UPDATE…";
    var reload = function () { location.reload(); };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then(function (reg) { return reg && reg.update(); }).then(reload, reload);
    } else reload();
  });

  /* ---------- Clock + background refresh ---------- */
  function tick() {
    var today = sod(new Date()).getTime();
    if (today !== state.lastDay) {
      if (state.anchor.getTime() === state.lastDay) state.anchor = new Date(today);
      state.lastDay = today;
    }
    if (document.hidden) return;
    if ($("detailScrim").hidden && (state.screen === "bridge" || state.screen === "today" || state.screen === "week" || state.screen === "loom") && state.conn) render(true);
    if (state.screen === "bridge") loadWeather(false);
    if (Date.now() - state.lastAuto > AUTO_MS) { state.lastAuto = Date.now(); refresh(true); }
    flushQueue(false);
    checkForUpdate(false);
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); refresh(false); checkForUpdate(true); } });
  /* TimothyOS stays full screen: Safari's pinch zoom is ignored (double-tap zoom is off in the CSS). */
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("touchmove", function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  window.addEventListener("online", function () { refresh(true); flushQueue(true); flushHabits(); });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* app still works without offline cache */ });
  }

  state.lastAuto = Date.now();
  render(false);
  refresh(false);
  flushQueue(false);
  setTimeout(function () { checkForUpdate(true); }, 3000);
})();
