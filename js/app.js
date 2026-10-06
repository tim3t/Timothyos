/* TimothyOS: Bridge overview, calendars, capture, Plan Day and Key Dates.
   Reads work + personal calendars and Notion through the Apps Script bridge.
   The Bridge screen sums it all up; Day, Week and Month show the detail. */
(function () {
  "use strict";

  var VERSION = "2.0.0";
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
  var LS_LOG = "tos.log.v1";           /* Captain's Log: one intent line per day, last 30 days */
  var LS_BEARINGS = "tos.bearings.v1"; /* guiding words, one shown per day */
  var LS_WEEKS = "tos.weeks.v1";       /* Review: last few weeks fetched (finished + picked tasks, saved review) */
  var LS_RSAVED = "tos.rsaved.v1";     /* Review: weeks saved to Notion, for the Bridge reminder */
  var LS_RDRAFT = "tos.rdraft.v1";     /* Review: unsaved writing, per week */
  var LS_ASK = "tos.ask.v1";           /* Ask: the current conversation (6 hours, or until NEW CHAT) */
  var LS_AISPEND = "tos.aispend.v1";   /* Ask: this month's spend as last reported by the bridge */
  var LS_IGNORE = "tos.ignore.v1";     /* event titles left out everywhere, e.g. blocks that only exist to stop bookings */
  var LS_TOPGAP = "tos.topgap.v1";     /* extra space below the iPad status bar, in px */
  var TOP_GAPS = [[14, "STANDARD"], [30, "MORE"], [48, "MOST"]];
  var MAX_ATTEMPTS = 10;
  var FRESH_MS = 60 * 1000;          /* don't refetch a range newer than this */
  var TASKS_FRESH_MS = 5 * 60 * 1000; /* background refresh of the task list; your own actions refresh at once */
  var LS_NETLOG = "tos.netlog.v1";    /* last bridge requests: action, time taken, result (no data) */
  var AUTO_MS = 5 * 60 * 1000;       /* background refresh while the app is open */
  var KEEP_RANGES = 8;

  var AREAS = {
    work: { name: "WORK", unit: "MTGS" },
    personal: { name: "PERSONAL", unit: "ITEMS" },
    farm: { name: "FARM + BEES" },
    hobby: { name: "HOBBIES" }
  };
  var LIVE = ["work", "personal"];
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
  function phead(title, meta, c) {
    return '<div class="phead"' + (c ? ' style="--c: var(--' + c + ')"' : "") + '><span class="cap"></span><h2>' + title +
      '</h2><span class="rule"></span>' + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</div>";
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
    return code === "http_404" || code === "bad_json" || /^http_5/.test(code || "") || (!!err && err.name === "TypeError");
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
        if (isNetworkError(err) && (document.hidden || lastHidden >= started) && paused < 3) { paused++; return waitVisible().then(go); }
        if (navigator.onLine === false || !transient(err) || attempt >= RETRY_DELAYS.length) throw err;
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
      note(action, started, r + (document.hidden || lastHidden >= started ? " · in background" : ""));
      throw err;
    });
  }
  function note(action, started, result) {
    netlog.push({ t: started, a: action || "?", ms: Date.now() - started, r: result });
    netlog = netlog.slice(-30);
    lsSet(LS_NETLOG, netlog);
  }
  function api(params, conn) { return withRetry(function () { return apiOnce(params, conn); }); }
  function apiPost(body, timeoutMs) { return withRetry(function () { return apiPostOnce(body, timeoutMs); }); }
  function apiOnce(params, conn) {
    conn = conn || state.conn;
    var u = new URL(conn.url);
    u.searchParams.set("key", conn.key);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return slot(function () {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : null;
      /* Plain GET with no custom headers, so Apps Script answers without a CORS preflight. */
      return logged(params.action, Date.now(), fetch(u.toString(), { method: "GET", redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
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
      if (!j || j.ok !== true) { var e2 = new Error((j && j.error) || "bad_response"); e2.code = (j && j.error) || "bad_response"; e2.detail = j && j.detail; e2.spend = j && j.spend; throw e2; }
      return j;
    });
  }
  function isNetworkError(err) { return !!err && (err.name === "TypeError" || err.name === "AbortError"); }
  function describe(err) {
    var code = err && (err.code || err.message);
    if (code === "unauthorized") return "The access key doesn't match. Copy it again from the Apps Script log (run setup).";
    if (code === "server_error") return "The script hit an error: " + (err.detail || "unknown") + ".";
    if (code === "bad_json") return "Google sent an error page instead of data, even after retrying. Usually temporary. If it persists, check that the URL ends in /exec.";
    if (code === "http_404") return "Google's servers didn't return the result (HTTP 404), even after retrying. Usually temporary; try Refresh in a minute.";
    if (code === "unknown_action") return "The script is out of date. Deploy a new version of the latest Code.gs.";
    if (/^http_/.test(code || "")) return "The script answered with " + code.replace("http_", "HTTP ") + ". Check the deployment.";
    if (err && err.name === "AbortError") return "Google took too long to answer (45 seconds), even after retrying. Usually temporary.";
    if (isNetworkError(err)) return navigator.onLine === false ? "No connection. Showing saved data." : "Couldn't reach the script, even after retrying. If this keeps happening, check that the URL ends in /exec and access is set to Anyone.";
    return "Sync failed (" + esc(code) + ").";
  }

  /* ---------- Ranges + events ---------- */
  function viewRange() {
    var a = state.anchor;
    if (state.screen === "bridge") return bridgeRange();
    if (state.screen === "review") { var rw = sow(a); return { from: addDays(rw, -7), to: addDays(rw, 14) }; }
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
      if (state.screen === "systems") { toast("Synced"); loadTasks(ymd(new Date()), true); loadDates(true); loadDone(true); }
      flushQueue(false);
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
    $("pager").hidden = !linked || state.screen === "systems" || state.screen === "dates" || state.screen === "bridge";
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
    } else if (state.screen === "review") {
      var rw0 = sow(a), thisW = sow(now).getTime() === rw0.getTime(), lastW = addDays(sow(now), -7).getTime() === rw0.getTime();
      e.textContent = "REVIEW · " + (thisW ? "THIS WEEK" : lastW ? "LAST WEEK" : rw0 > now ? "AHEAD" : "PAST WEEK") + (reviewSaved(ymd(rw0)) ? " · SAVED" : "");
      t.textContent = weekLabel(rw0);
    } else if (state.screen === "dates") { e.textContent = "UPCOMING · NEXT 12 MONTHS"; t.textContent = "KEY DATES"; }
    else { e.textContent = "SETTINGS + HEALTH"; t.textContent = "SYSTEMS"; }
    $("app").classList.toggle("on-bridge", linked && state.screen === "bridge");
    document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) {
      if (b.dataset.screen === state.screen) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
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
      days.push({ d: d, de: de, rows: layout(de.timed, d, sc, 14) });
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
        var ev = row.ev, hgt = Math.max(14, row.ye - row.ys - 2);
        state.index[ev.id] = ev;
        html += '<button type="button" class="wkb a-' + ev.area + (ev.busy ? " busy" : "") + pendingCls(ev) + '" data-id="' + esc(ev.id) + '" title="' + esc(ev.title) +
          '" style="top:' + (row.ys + 1) + "px;height:" + hgt + "px;left:calc(2px + (100% - 4px) * " + row.col + " / " + row.n +
          ");width:calc((100% - 4px) / " + row.n + ' - 2px)">' + (hgt >= 26 ? '<span class="lbl">' + esc(ev.title) + "</span>" : "") + "</button>";
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
      (c ? '<button type="button" class="btn" data-act="refresh">REFRESH NOW</button>' +
        '<button type="button" class="btn ghost" data-act="disconnect">' + (Date.now() - state.disarmAt < 4000 ? "TAP AGAIN TO UNLINK" : "UNLINK") + "</button>"
        : '<button type="button" class="btn capture" data-act="setup">LINK CALENDARS</button>') +
      "</div></section>";

    html += netSection();
    html += "<section>" + phead("CALENDARS", canCreate() ? "WORK READ-ONLY · PERSONAL TAKES CAPTURES" : "READ-ONLY");
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
    html += bridgeSection();
    html += captureSection();
    html += notionSection();
    html += "<section>" + phead("STANDBY MODULES", "NOT ACTIVE YET") + '<div class="stublist">' +
      STANDBY_MODULES.map(function (m) { return '<div class="stubbox"><span><b style="color:var(--fg)">' + m[0] + "</b><br>" + m[1] + "</span></div>"; }).join("") + "</div></section>";

    html += "<section>" + phead("APP", "") + '<dl class="kv"><dt>APP VERSION</dt><dd class="tnum">' + VERSION + "</dd>" +
      "<dt>BRIDGE VERSION</dt><dd class=\"tnum\">" + (state.bridgeVersion ? esc(state.bridgeVersion) : '<span class="muted">Unknown</span>') + "</dd>" +
      "<dt>RUNNING AS</dt><dd>" + (standalone ? "Home screen app" : "Browser tab. In Safari, tap Share, then Add to Home Screen.") + "</dd>" +
      '<dt>TOP SPACING</dt><dd><div class="chips">' + TOP_GAPS.map(function (g) {
        return '<button type="button" class="chip" data-topgap="' + g[0] + '" aria-pressed="' + (topGap() === g[0]) + '">' + g[1] + "</button>";
      }).join("") + '</div><small class="muted">Space between the iPad status bar and the top of the app. Status bar height here: ' + safeTop() + " px.</small></dd></dl></section></div>";
    $("content").innerHTML = html;
  }

  /* Recent bridge requests: how long each took and how it ended. */
  function netSection() {
    if (!state.conn || !netlog.length) return "";
    var hour = netlog.filter(function (n) { return Date.now() - n.t < 3600000; }), bad = hour.filter(function (n) { return n.r !== "ok"; });
    var slow = netlog.filter(function (n) { return n.r === "ok"; }).map(function (n) { return n.ms; }).sort(function (a, b) { return a - b; });
    var median = slow.length ? (slow[Math.floor(slow.length / 2)] / 1000).toFixed(1) + " s" : "–";
    return "<section>" + phead("RECENT REQUESTS", hour.length ? bad.length + " OF " + hour.length + " FAILED IN THE LAST HOUR · TYPICAL " + median : "TYPICAL " + median) +
      '<div class="netlog tnum">' + netlog.slice(-12).reverse().map(function (n) {
        return '<span>' + hm(new Date(n.t)) + "</span><span>" + esc(String(n.a).toUpperCase()) + "</span><span>" + (n.ms / 1000).toFixed(1) + " s</span>" +
          '<span class="' + (n.r === "ok" ? "okmsg" : "errtxt") + '">' + esc(n.r === "ok" ? "OK" : n.r.toUpperCase()) + "</span>";
      }).join("") + '</div><small class="muted">DROPPED: the connection was cut. TIMEOUT: no answer in 45 s. IN BACKGROUND: the iPad slept or switched apps mid-request; those are retried when you come back.</small></section>';
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
    $("detailScrim").hidden = false;
    $("detailClose").focus();
  }
  function closeDetail() { $("detailScrim").hidden = true; }


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
    cap = { day: d, hour: h, dur: capPrefs.dur || "1", type: type === "date" && canDates() ? "date" : "event", yearly: false };
    $("capText").value = "";
    $("capUntil").value = "";
    fillDateSelects();
    $("capErr").textContent = "";
    renderCapture();
    $("capScrim").hidden = false;
    setTimeout(function () { $("capText").focus(); }, 60);
  }
  function closeCapture() { $("capScrim").hidden = true; cap = null; }
  function renderCapture() {
    var now = new Date(), allDay = cap.dur === "all", notes = [], isDate = cap.type === "date";
    $("capMode").textContent = navigator.onLine === false ? "OFFLINE · WILL QUEUE" : isDate ? "NOTION · KEY DATES" : "PERSONAL CALENDAR";
    $("capForm").style.setProperty("--c", isDate ? "var(--chrome-b)" : "var(--personal)");
    document.querySelectorAll("[data-ctype]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ctype === cap.type)); });
    $("capTypeDate").disabled = !canDates();
    $("capTypeDate").innerHTML = "KEY DATE" + (canDates() ? "" : "<small>SETUP</small>");
    $("capAreaRow").hidden = isDate; $("capTimeRow").hidden = isDate;
    $("capKdRow").hidden = !isDate; $("capUntilRow").hidden = !isDate;
    $("capYearly").setAttribute("aria-pressed", String(!!cap.yearly));
    $("capText").placeholder = isDate ? "What's the date? e.g. First frost risk" : "What goes in? e.g. Pick up bee feeder";
    $("capFootText").textContent = isDate ? "Saves to Key Dates in Notion." : "Saves to your Personal Google Calendar. Work is read-only.";
    if (!isDate && !canCreate()) notes.push("Your bridge needs the 1.1 update before events can be saved. See Systems.");
    if (!isDate && state.hidden.personal) notes.push("Personal is hidden. New events save, but stay hidden until you tap Personal on Today.");
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
    var item = { cid: newCid(), area: WRITABLE[0], title: title.slice(0, 200), created: Date.now(), attempts: 0 };
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
      if (["bridge", "today", "week", "month", "dates", "systems"].indexOf(state.screen) > -1) render(true);
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
    var areas = [["", "ALL"], ["work", "WORK"], ["personal", "PERSONAL"], ["farm", "FARM + BEES"], ["hobby", "HOBBIES"]];
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
    $("detailScrim").hidden = false;
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

  function prioritiesPanel(day, isToday) {
    if (!canPlan()) {
      return phead("PRIORITIES", "") + stubBox(state.conn ? "Needs the Notion link: bridge 1.2 and a Notion key. Steps are in the README." : "Link calendars first.");
    }
    var data = state.tasks[day], past = day < ymd(new Date());
    if (!data) {
      return phead("PRIORITIES", "") + '<div class="empty">' + (state.tasksErr ? esc(state.tasksErr.msg) : "Loading your Master Task List…") + "</div>";
    }
    var focus = data.focus.slice().sort(function (a, b) { return (a.status === DONE) - (b.status === DONE); });
    var done = focus.filter(function (t) { return t.status === DONE; }).length;
    var html = phead("PRIORITIES", focus.length ? done + " OF " + focus.length + " DONE" : "");
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
    $("planScrim").hidden = false;
    loadTasks(d, true);
  }
  function closePlan() { $("planScrim").hidden = true; plan = null; }
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
        items.push({ lvl: "bad", ic: "✕", txt: "Calendar clash at " + hm(c[0]._s > c[1]._s ? c[0]._s : c[1]._s), sub: esc(c[0].title) + " (Work) overlaps " + esc(c[1].title) + " (Personal)", day: today, go: "TODAY" });
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
    var html = phead("NOW / NEXT", hiddenNote()) + '<div class="ov-now">';
    if (!hasData(bridgeRange()) && !timed.length) {
      return html + '<div class="empty">' + (state.sync.status === "syncing" ? "Loading your calendars…" : "Calendar not loaded yet.") + "</div></div>";
    }
    if (cur) html += '<span class="pill a-' + cur.area + ' ov-state">NOW</span><span class="ov-cd tnum">' + durLabel((cur._e - now) / 60000) + '</span><span class="muted">left · ' + esc(cur.title) + "</span>";
    else if (next) html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd tnum">' + durLabel((next._s - now) / 60000) + '</span><span class="muted">until ' + hm(next._s) + "</span>";
    else html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd">CLEAR</span><span class="muted">nothing else on the calendar today</span>';
    html += "</div>";
    if (next) {
      state.index[next.id] = next;
      html += '<button type="button" class="ov-next a-' + next.area + pendingCls(next) + '" data-id="' + esc(next.id) + '"><span class="st"></span><span class="tx"><b>' + esc(next.title) + "</b><small>NEXT · " +
        hm(next._s) + " TO " + hm(next._e) + " · " + AREAS[next.area].name + pendingTag(next) + '</small></span><span class="go tnum">IN ' + durLabel((next._s - now) / 60000) + "</span></button>";
    }
    if (de.allDay.length) html += '<div class="ov-allday">ALL DAY: ' + de.allDay.map(function (e) { return esc(e.title); }).join(" · ") + "</div>";
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
    html += '<div class="ov-load tnum"><span><b>' + durLabel(booked * 60) + "</b> BOOKED</span><span><b>" + durLabel((span - booked) * 60) + "</b> OPEN</span>" +
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
    if (!list.length) return '<div class="ov-sub">DUE + OVERDUE</div><div class="empty">Nothing due outside your picks.</div>';
    return '<div class="ov-sub">DUE + OVERDUE · NOT IN YOUR PICKS</div>' + list.slice(0, 4).map(function (t) {
      return '<button type="button" class="ov-due a-' + taskArea(t.area) + '" data-act="plan" data-day="' + today + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" +
        [bare(t.priority), bare(t.area)].filter(Boolean).map(esc).join(" · ") + '</small></span><span class="pill ' + (t.due < today ? "bad" : "warn") + '">' + dueLabel(t.due, today) + "</span></button>";
    }).join("") + (list.length > 4 ? '<div class="muted ov-more">+' + (list.length - 4) + " more in Plan Day</div>" : "");
  }

  /* --- the next seven days --- */
  function horizonPanel(now, list) {
    var vis = visible(list), days = [], max = 10, H = 120;
    for (var i = 0; i < 7; i++) {
      var d = addDays(sod(now), i), timed = dayEvents(vis, d).timed;
      var w = unionHours(timed.filter(function (e) { return e.area === "work"; }), d, 0, 24);
      var p = unionHours(timed.filter(function (e) { return e.area === "personal"; }), d, 0, 24);
      days.push({ d: d, w: w, p: p, tot: unionHours(timed, d, 0, 24), kd: kdMarks(ymd(d), false).length });
      max = Math.max(max, w + p);
    }
    var html = phead("HORIZON · 7 DAYS", hiddenNote() || (hasData(bridgeRange()) ? "TAP A DAY" : "LOADING")) + '<div class="ov-wk">';
    days.forEach(function (x, i) {
      var heavy = x.tot >= HEAVY_HOURS;
      html += '<button type="button" class="ov-day' + (i === 0 ? " today" : "") + (heavy ? " heavy" : "") + '" data-day="' + ymd(x.d) + '" aria-label="' + DOWL[x.d.getDay()] + ", " + hrsLabel(x.tot) + ' booked">' +
        '<span class="bars"><span class="mk">' + (x.kd ? "◆" : "") + '</span><span class="hrs tnum">' + hrsLabel(x.tot) + "</span>" +
        '<span class="seg a-personal" style="height:' + Math.round(x.p / max * H) + 'px"></span><span class="seg a-work" style="height:' + Math.round(x.w / max * H) + 'px"></span></span>' +
        '<span class="dl">' + DOW[x.d.getDay()] + '<b class="tnum">' + p2(x.d.getDate()) + "</b></span></button>";
    });
    html += '</div><div class="ov-legend"><span><i class="a-work"></i>WORK</span><span><i class="a-personal"></i>PERSONAL</span><span><i class="dia">◆</i>KEY DATE</span></div>';
    var heavy = days.filter(function (x) { return x.tot >= HEAVY_HOURS; });
    if (heavy.length) html += '<div class="ov-heavy">▲ HEAVY: ' + heavy.map(function (x) { return DOW[x.d.getDay()] + " " + hrsLabel(x.tot); }).join(" · ") + ". Few open gaps.</div>";
    return html;
  }

  /* --- key dates: the next three --- */
  function kdNextPanel(today) {
    if (!canDates()) return phead("KEY DATES", "") + stubBox(state.conn ? "Needs bridge 1.3 and the Key Dates database connected in Notion. Steps are in the README." : "Link calendars first.");
    if (!state.dates) return phead("KEY DATES", "") + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div>";
    var list = occurrences(today, ymd(addDays(parseYmd(today), 366))).filter(function (o) { return o.e >= today; }).slice(0, 3);
    var html = phead("KEY DATES", "NEXT UP");
    if (!list.length) html += '<div class="empty">No key dates in the next 12 months.</div>';
    list.forEach(function (o) {
      var running = o.s < today, n = running ? daysBetween(today, o.e) : daysBetween(today, o.s);
      var unit = running ? "D LEFT" : n === 0 ? "TODAY" : n === 1 ? "DAY" : "DAYS";
      html += '<button type="button" class="ov-kd a-' + taskArea(o.d.area) + (!running && n <= KD_WARN_DAYS ? " soon" : "") + '" data-kd="' + esc(o.id) + '"><span class="kn tnum">' + (n === 0 && !running ? "◆" : n) +
        "<small>" + unit + '</small></span><span class="tx"><b>' + esc(o.d.title) + "</b><small>" + rangeLabel(o) + (o.d.type ? " · " + esc(bare(o.d.type)) : "") + (running ? " · UNDER WAY" : "") + "</small></span></button>";
    });
    return html + '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="dates">ALL KEY DATES</button><button type="button" class="btn" data-act="adddate">+ ADD</button></div>';
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
    var pl = place(), html = phead("ENVIRONMENT", pl ? (pl.name ? esc(pl.name) : "") : "SETUP", "farm");
    if (!pl) return html + '<div class="stubbox"><span class="pill">SETUP</span><span>Weather, hive check and frost watch need your location. Set it in Systems.</span></div>' +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="systems">SET LOCATION</button></div>';
    var j = wxData();
    if (!j) return html + '<div class="empty">' + (state.wxErr ? "Weather didn't load. It retries in a minute." : "Loading weather…") + "</div>";
    var c = j.current || {}, dly = j.daily, today = ymd(now), di = Math.max(0, dly.time.indexOf(today));
    html += '<div class="ov-env"><span class="ov-temp tnum">' + Math.round(c.temperature_2m) + '°F</span><span class="tx"><b>' + wxText(c.weather_code) + "</b><small>High " +
      Math.round(dly.temperature_2m_max[di]) + "° · Low " + Math.round(dly.temperature_2m_min[di]) + "°</small></span></div>" +
      '<div class="ov-facts tnum"><span>WIND <b>' + Math.round(c.wind_speed_10m) + " MPH</b></span><span>RAIN <b>" + (dly.precipitation_probability_max[di] == null ? "–" : dly.precipitation_probability_max[di] + "%") +
      "</b></span><span>SUNRISE <b>" + dly.sunrise[di].slice(11, 16) + "</b></span><span>SUNSET <b>" + dly.sunset[di].slice(11, 16) + "</b></span></div>";
    var hv = hiveCheck(now), fr = frost(now);
    if (hv) html += '<div class="ov-envrow"><span class="k">HIVE CHECK<small>' + hv.label + '</small></span><span class="tx"><b>' + hv.text + "</b><small>" + hv.sub + '</small></span><span class="pill ' + (hv.go ? "ok" : "warn") + '">' + (hv.go ? "GO" : "HOLD") + "</span></div>";
    if (fr) {
      var lvl = fr.low <= 32 ? "bad" : fr.low <= 36 ? "warn" : "ok";
      html += '<div class="ov-envrow"><span class="k">FROST WATCH<small>TONIGHT</small></span><span class="tx"><b>Low ' + Math.round(fr.low) + "°F around " + fr.at + "</b><small>" +
        (lvl === "ok" ? "No frost expected" : lvl === "warn" ? "Near frost. Cover tender plants." : "Frost likely. Protect plants and water lines.") + '</small></span><span class="pill ' + lvl + '">' +
        (lvl === "ok" ? "NO FROST" : lvl === "warn" ? "NEAR FROST" : "FROST") + "</span></div>";
    }
    return html + '<div class="ov-foot">Weather by Open-Meteo · updated ' + esc(stamp(state.wx.fetched)) + "</div>";
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
    var html = phead("BALANCE · LAST 7 DAYS", "", "personal");
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
    html += '<div class="ov-foot">Tasks marked done per Life Area, dated by their last edit in Notion. Hours come from the Work and Personal calendars; Farm + Bees and Hobbies get hours once they have their own calendars.</div>';
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
    return phead("CAPTAIN'S LOG", dLabel(parseYmd(today)) + " · ON THIS IPAD") + '<div class="ov-log"><div><label class="ov-sub" for="logIntent">TODAY\'S INTENT</label>' +
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

  function renderBridge() {
    var now = new Date(), today = ymd(now), list = eventsFor(bridgeRange());
    var html = conditionBanner(now, today, list) + '<div class="ov-grid">' +
      '<section class="ov-pnl">' + nowPanel(now, list) + "</section>" +
      '<section class="ov-pnl">' + envPanel(now) + "</section>" +
      '<section class="ov-pnl">' + prioritiesPanel(today, true) + duePanel(today) + "</section>" +
      '<section class="ov-pnl">' + horizonPanel(now, list) + "</section>" +
      '<section class="ov-pnl">' + kdNextPanel(today) + "</section>" +
      '<section class="ov-pnl">' + balancePanel(now, today, list) + "</section>" +
      '<section class="ov-pnl">' + logPanel(today) + "</section></div>";
    $("content").innerHTML = html;
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
    ["wentWell", "WENT WELL", "What worked, what you're glad about"],
    ["drained", "DRAINED ME", "What cost more than it gave"],
    ["nextFocus", "NEXT FOCUS", "The one or two things that matter most next week"],
    ["bearing", "BEARING", "Where did I hold my bearing? (optional)"]
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
      var maxH = Math.max(10, st.work, st.personal);
      [["work", st.work, st.prevWork], ["personal", st.personal, st.prevPersonal]].forEach(function (x) {
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
    html += "<section>" + phead("REFLECTION", saved ? "SAVED " + esc(stamp(Date.parse(saved.saved))) : "NOT SAVED YET");
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
      hoursFarm: null, hoursHobbies: null,
      tasksDone: w ? st.done : null, picked: w ? st.picked : null, pickedDone: w ? st.pickedDone : null,
      byArea: w ? st.byArea.map(function (x) { return (bare(x.area) || "No area") + " " + x.n; }).join(" · ") : ""
    };
    state.reviewSaving = true;
    render(true);
    apiPost({ action: "savereview", review: review }).then(function (j) {
      state.weeks[wk] = state.weeks[wk] || { fetched: 0, done: [], picked: [], review: null };
      state.weeks[wk].review = j.review;
      savedWeeks[wk] = Date.now();
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
    if (log) out.push("CAPTAIN'S LOG, TODAY'S INTENT: " + log);
    if (b) out.push("TODAY'S BEARING: " + b);
    if (data) out.push("LIFE AREAS: " + data.areas.join(" | ") + "\nPRIORITY NAMES: " + data.priorities.join(" | "));
    if (state.dates && state.dates.types) out.push("KEY DATE TYPES: " + state.dates.types.join(" | "));
    if (ignoreList.length) out.push("IGNORED EVENT TITLES (booking blocks, left out everywhere): " + ignoreList.join(" | "));
    return out.join("\n\n");
  }

  function unesc(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
  /* Weekly summary for the Review screen: Sonnet, no tools, from the week's numbers and your reflection. */
  function writeSummary() {
    var w0 = sow(state.anchor), wk = ymd(w0), st = weekStats(w0), w = state.weeks[wk], d = drafts()[wk] || {}, saved = w && w.review;
    var f = function (k) { var el = $("rv-" + k); return el ? el.value.trim() : d[k] || (saved && saved[k]) || ""; };
    var lines = [weekLabel(w0) + (st.cur ? " (in progress, numbers so far)" : ""),
      "Hours: Work " + hrsLabel(st.work) + (st.cur ? "" : " (week before " + hrsLabel(st.prevWork) + ")") + ", Personal " + hrsLabel(st.personal) + (st.cur ? "" : " (week before " + hrsLabel(st.prevPersonal) + ")") +
        ". Busiest day " + (st.busiest && st.busiest.h ? DOW[st.busiest.d.getDay()] + " " + hrsLabel(st.busiest.h) : "none") + ". Open time 07:00 to 21:00: " + hrsLabel(st.open) + " of 98H. Work events: " + st.meetings + "."];
    if (w) {
      lines.push("Finished (" + st.done + "): " + (w.done.map(function (t) { return t.title + " [" + (bare(t.area) || "no area") + "]"; }).join("; ") || "none"));
      lines.push("Priorities: " + st.pickedDone + " of " + st.picked + " done. Still open: " + (w.picked.filter(function (t) { return t.status !== DONE; }).map(function (t) { return t.title; }).join("; ") || "none"));
    }
    var ins = intents(w0).filter(function (x) { return x.text; });
    if (ins.length) lines.push("Daily intents: " + ins.map(function (x) { return DOW[x.d.getDay()] + " " + x.text; }).join("; "));
    lines.push("His reflection so far. Went well: " + (f("wentWell") || "(blank)") + ". Drained me: " + (f("drained") || "(blank)") + ". Next focus: " + (f("nextFocus") || "(blank)") + ". Bearing: " + (f("bearing") || "(blank)") + ".");
    state.summaryBusy = true;
    render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "summary", messages: [{ role: "user", text: "Write my weekly summary for " + weekLabel(w0) + "." }], context: lines.join("\n"), ignore: ignoreList }, 150000).then(function (j) {
      saveDraft(wk, "summary", j.reply);
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Summary written (" + money(j.cost) + "). Edit it, then save.");
    }).catch(function (err) { toast(describeAi(err)); }).then(function () { state.summaryBusy = false; render(true); });
  }

  function openAsk() {
    if (!canAsk()) return;
    freshAsk();
    $("askErr").textContent = "";
    renderAsk();
    $("askScrim").hidden = false;
    setTimeout(function () { $("askText").focus(); }, 50);
    loadAiSpend(false);
  }
  function closeAsk() { $("askScrim").hidden = true; }
  function propTitle(p) {
    var i = p.input;
    if (p.kind === "add_task") return "ADD TASK · " + i.title;
    if (p.kind === "set_focus") return (i.day === "none" ? "UNPICK · " : "PICK FOR " + dLabel(parseYmd(i.day)) + " · ") + i.task_title;
    if (p.kind === "set_status") return "MARK " + bare(i.status).toUpperCase() + " · " + i.task_title;
    if (p.kind === "add_key_date") return "ADD KEY DATE · " + i.title;
    if (p.kind === "add_event") return "ADD TO PERSONAL CALENDAR · " + i.title;
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
      var item = { cid: newCid(), area: "personal", title: i.title.slice(0, 200), created: Date.now(), attempts: 0 };
      if (i.all_day) { item.allDay = true; item.start = i.date; item.end = ymd(addDays(parseYmd(i.date), 1)); }
      else {
        var s = parseYmd(i.date), hmv = String(i.start_time).split(":");
        s.setHours(+hmv[0], +hmv[1], 0, 0);
        item.allDay = false; item.start = s.toISOString(); item.end = new Date(s.getTime() + Math.max(5, Math.min(600, i.minutes || 30)) * 60000).toISOString();
      }
      state.queue.push(item); saveQueue(); flushQueue(true); finish(true, "Saving to your Personal calendar.");
    } else if (p.kind === "review_draft") {
      var wk = ymd(sow(parseYmd(i.week_start)));
      [["went_well", "wentWell"], ["drained", "drained"], ["next_focus", "nextFocus"], ["bearing", "bearing"], ["summary", "summary"]].forEach(function (f) { if (i[f[0]]) saveDraft(wk, f[1], i[f[0]]); });
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
      "<dt>MODELS</dt><dd>Haiku 4.5 for questions · Sonnet 5.5 for THINK HARDER and weekly summaries</dd>" +
      "<dt>SAFEGUARDS</dt><dd>Pauses at the budget above (AI_BUDGET_USD). Claude Console spend limit and prepaid credit, auto-reload off. Every change waits for CONFIRM.</dd></dl>" +
      '<small class="muted">Questions and the snapshot of your calendars, tasks and key dates are sent to Anthropic to answer them.</small></section>';
    return html;
  }

  /* ---------- Top spacing below the status bar ---------- */
  function topGap() { var g = lsGet(LS_TOPGAP); return TOP_GAPS.some(function (x) { return x[0] === g; }) ? g : TOP_GAPS[0][0]; }
  function applyTopGap() { document.documentElement.style.setProperty("--top-gap", topGap() + "px"); }
  function safeTop() { return Math.round(parseFloat(getComputedStyle(document.body, "::before").height) || 0); }
  applyTopGap();

  /* ---------- Render + navigation ---------- */
  function render(keepScroll) {
    var wrap = $("tlwrap");
    var keep = keepScroll && wrap ? wrap.scrollTop : null;
    var active = document.activeElement, typing = active && active.id && $("content").contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)
      ? { id: active.id, value: active.value, a: active.selectionStart, b: active.selectionEnd } : null;
    state.index = {};
    renderHeader();
    renderStatus();
    if (!state.conn && state.screen !== "systems") { renderConnect(); return; }
    ({ bridge: renderBridge, review: renderReview, today: renderDay, week: renderWeek, month: renderMonth, dates: renderDatesScreen, systems: renderSystems })[state.screen]();
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
    state.screen = screen;
    if (!anchor && screen === "review") anchor = defaultReviewWeek();
    if (anchor) state.anchor = sod(anchor);
    render(false);
    $("content").scrollTop = 0;
    refresh(false);
  }
  function page(dir) {
    var a = state.anchor;
    if (state.screen === "today") state.anchor = addDays(a, dir);
    else if (state.screen === "week" || state.screen === "review") state.anchor = addDays(a, 7 * dir);
    else state.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    render(false);
    refresh(false);
  }

  document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null); });
  });
  $("status").addEventListener("click", function () { go("systems"); });
  $("prevBtn").addEventListener("click", function () { page(-1); });
  $("nextBtn").addEventListener("click", function () { page(1); });
  $("todayBtn").addEventListener("click", function () { go(state.screen, state.screen === "review" ? sow(new Date()) : new Date()); });

  $("content").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) { tapToCapture(e); return; }
    if (b.disabled) return;
    if (b.dataset.id && state.index[b.dataset.id]) openDetail(state.index[b.dataset.id]);
    else if (b.dataset.kd && state.index["kd:" + b.dataset.kd]) openKeyDate(state.index["kd:" + b.dataset.kd]);
    else if (b.dataset.task) toggleDone(b.dataset.task, b.dataset.day);
    else if (b.dataset.act === "dates") go("dates");
    else if (b.dataset.act === "adddate") openCapture(null, null, "date");
    else if (b.dataset.kdf !== undefined) { state.kdFilter = b.dataset.kdf || null; render(false); }
    else if (b.dataset.act === "plan") openPlan(parseYmd(b.dataset.day));
    else if (b.dataset.act === "systems") go("systems");
    else if (b.dataset.act === "bearing") { state.wmShift++; render(true); }
    else if (b.dataset.topgap) { lsSet(LS_TOPGAP, +b.dataset.topgap); applyTopGap(); render(true); }
    else if (b.dataset.start) { lsSet(LS_START, b.dataset.start); toast("Opens on " + b.dataset.start.toUpperCase() + " from now on"); render(true); }
    else if (["placesave", "geo", "placeclear", "bearsave"].indexOf(b.dataset.act) > -1) bridgeAct(b.dataset.act);
    else if (b.dataset.act === "review") go("review");
    else if (b.dataset.act === "savereview") submitReview();
    else if (b.dataset.act === "writesummary") writeSummary();
    else if (b.dataset.act === "ignsave") {
      setIgnore($("ignIn").value.split("\n"));
      toast(ignoreList.length ? ignoreList.length + (ignoreList.length === 1 ? " title ignored" : " titles ignored") + " · " + ignoredCount() + " events left out" : "Nothing ignored");
      render(true);
    }
    else if (b.dataset.day) go("today", parseYmd(b.dataset.day));
    else if (b.dataset.toggle) toggleArea(b.dataset.toggle);
    else if (b.dataset.act === "refresh") refresh(true);
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
  $("content").addEventListener("submit", function (e) {
    if (e.target.id === "connForm") { e.preventDefault(); submitConnect(); }
  });
  $("content").addEventListener("input", function (e) {
    if (e.target.id === "logIntent") saveLog(e.target.value.trim());
    else if (e.target.dataset.rv && state.screen === "review") saveDraft(ymd(sow(state.anchor)), e.target.dataset.rv, e.target.value);
  });
  $("content").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "logIntent") e.target.blur(); });
  $("detailScrim").addEventListener("click", function (e) {
    var b = e.target.closest("button");
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
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeDetail(); closeCapture(); closePlan(); closeAsk(); } });

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
    if ($("detailScrim").hidden && (state.screen === "bridge" || state.screen === "today" || state.screen === "week") && state.conn) render(true);
    if (state.screen === "bridge") loadWeather(false);
    if (Date.now() - state.lastAuto > AUTO_MS) { state.lastAuto = Date.now(); refresh(true); }
    flushQueue(false);
    checkForUpdate(false);
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); refresh(false); checkForUpdate(true); } });
  window.addEventListener("online", function () { refresh(true); flushQueue(true); });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* app still works without offline cache */ });
  }

  state.lastAuto = Date.now();
  render(false);
  refresh(false);
  flushQueue(false);
  setTimeout(function () { checkForUpdate(true); }, 3000);
})();
