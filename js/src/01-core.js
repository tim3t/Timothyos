
  var VERSION = "2.82.0";
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
  var LS_LOGAI = "tos.logai.v1";     /* Log Ask: let Claude read Log entries you pick (off unless turned on) */
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
    hobby: { name: "GROWTH", unit: "ITEMS" },
    family: { name: "FAMILY", unit: "ITEMS" },   /* 2.67 (bridge 1.42): the household's calendar, read-only; busy time, never Work hours or meetings */
    break: { name: "BREAK", unit: "" }   /* Breaks list (2.23): shown, never counted; not a Life Area */   /* growth and hobbies; a Notion Life Area named for growth lands here (taskArea) */
  };
  var LIVE = ["work", "personal"];         /* calendars in use; setAreas() adds farm once the bridge reports it */
  var STANDBY_AREAS = ["farm", "hobby"];
  var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DOWL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MONL = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  /* ---------- Storage (never throws; 2.77: a full store is never silent) ----------
     The browser gives this app about 5 MB. Until 2.77 a write that didn't fit was dropped without a word, and the
     changes on their way to Notion share that space with saved copies of calendars, meals and health days.
     Now: a write that doesn't fit first makes room by dropping SAVED COPIES (what the next sync brings back),
     largest first, then what the iPad can measure again (lengths, tags, artwork). If it still doesn't fit, the
     value is kept in memory (lsGet answers with it, so the app carries on and the change still goes out), tried
     again every 30 seconds and when the app is left, and the Bridge's Condition turns red (lsFull). A saved copy
     that doesn't fit is simply not kept: it never pushes anything else out. The same goes for this iPad's running
     notes (LS_QUIET: recent requests, the error log): not kept when there's no room, and never an alarm. */
  var LS_COPIES = ["tos.cache.v1", "tos.tasks.v1", "tos.dates.v1", "tos.done.v1", "tos.weeks.v1", "tos.rlog.v1", "tos.habits.v1", "tos.library.v1", "tos.tarot.v1", "tos.apiary.v1",
    "tos.inbox.v1", "tos.ledger.v1", "tos.hols.v1", "tos.schema.v1", "tos.astro.v1", "tos.wx.v1", "tos.export.v1", "tos.sickbay.v1", "tos.meals.v1", "tos.mealrc.v1", "tos.otd.v1"];
  var LS_REMADE = ["tos.nasart.v1", "tos.nastags.v1", "tos.naslen.v1", "tos.hololen.v1", "tos.holoadlen.v1", "tos.hololoud.v1"];   /* slow to measure again: dropped only when the copies weren't enough */
  var LS_QUIET = ["tos.netlog.v1", "tos.netday.v1", "tos.errlog.v1", "tos.visits.v1", "tos.sync.v1"];   /* this iPad's own running notes: never dropped for room, and no alarm when one doesn't fit */
  var store = { failed: {}, skipped: {}, dropped: 0, droppedAt: 0, said: false, t: 0 };
  function lsWrite(k, text) { try { localStorage.setItem(k, text); return true; } catch (e) { return false; } }
  function lsIsCopy(k) { return LS_COPIES.indexOf(k) > -1 || LS_REMADE.indexOf(k) > -1; }
  function lsMakeRoom(k, text) {
    try {
      var tiers = [LS_COPIES, LS_REMADE];
      for (var t = 0; t < tiers.length; t++) {
        var have = tiers[t].map(function (c) { var v = localStorage.getItem(c); return [c, v === null ? -1 : v.length]; }).filter(function (x) { return x[1] > -1; }).sort(function (a, b) { return b[1] - a[1]; });
        for (var i = 0; i < have.length; i++) {
          localStorage.removeItem(have[i][0]); store.dropped++; store.droppedAt = Date.now();
          if (lsWrite(k, text)) return true;
        }
      }
    } catch (e) { /* storage blocked altogether */ }
    return false;
  }
  function lsFull() { return Object.keys(store.failed); }
  function lsTell() {   /* said once when it fills and once when it clears; the Bridge and SYSTEMS redraw */
    var full = lsFull().length > 0;
    if (full === store.said) return;
    store.said = full;
    clearInterval(store.t); if (full) store.t = setInterval(lsRetry, 30000);
    setTimeout(function () {
      toast(full ? "This iPad's storage is full. Open SYSTEMS to make room." : "Storage: everything is saved on this iPad again.");
      if (state.screen === "bridge" || state.screen === "systems") render(true);
    }, 0);
  }
  function lsRetry() {
    lsFull().forEach(function (k) { if (lsWrite(k, store.failed[k]) || lsMakeRoom(k, store.failed[k])) delete store.failed[k]; });
    lsTell();
    return !lsFull().length;
  }
  function lsGet(k) { try { var v = store.failed[k] !== undefined ? store.failed[k] : localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    var text; try { text = JSON.stringify(v, function (key, val) { return key.charAt(0) === "_" ? undefined : val; }); } catch (e) { text = undefined; }
    if (text !== undefined) {
      if (lsWrite(k, text)) { delete store.failed[k]; delete store.skipped[k]; }
      else if (lsIsCopy(k) || LS_QUIET.indexOf(k) > -1) store.skipped[k] = true;
      else if (lsMakeRoom(k, text)) delete store.failed[k];
      else store.failed[k] = text;
      lsTell();
    }
    if (lsHook) lsHook(k);
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } delete store.failed[k]; delete store.skipped[k]; lsTell(); if (lsHook) lsHook(k); }
  window.addEventListener("pagehide", function () { if (lsFull().length) lsRetry(); });
  /* What the store holds, for SYSTEMS: characters by kind (a character is two bytes), and the largest few by name. */
  var LS_NAMES = { cache: "Calendars", tasks: "Tasks", dates: "Key dates", weeks: "Week summaries", rlog: "Review log", habits: "Habits", library: "Library", tarot: "Tarot", apiary: "Apiary", inbox: "Inbox", ledger: "Ledger",
    astro: "Astrometrics", sickbay: "Health days", meals: "Meals and their photos", mealrc: "Recipes read for COOK", nasart: "AUDIO artwork", nastags: "AUDIO tags", naslen: "AUDIO lengths", hololen: "HOLODECK video lengths",
    holoadlen: "Commercial lengths", hololoud: "HOLODECK loudness", plays: "Resume points", errlog: "Error log", scilog: "Science Log", sci: "Science feeds", brief: "Morning Briefing", arb: "Arboretum", holo: "HOLODECK channels",
    upkeep: "Upkeep", log: "Log settings", profile: "Profile sync", mealgot: "Grocery ticks and added items", pins: "Pinned stations", netlog: "Recent requests", netday: "Today's request count", sync: "Last sync", visits: "Stations opened",
    ask: "Ask conversation", aispend: "Ask spending", queue: "Captures on their way", mealq: "Meal changes on their way", habitq: "Habit changes on their way", tarotq: "Tarot changes on their way", apiaryq: "Hive changes on their way",
    inboxq: "Inbox changes on their way", sciq: "Science Log entries on their way", upkeepq: "Upkeep changes on their way", sickbayq: "Sickbay changes on their way" };
  function lsName(k) { var m = /^tos\.([a-z0-9]+)\.v\d+$/.exec(k); return m ? LS_NAMES[m[1]] || 'a setting ("' + m[1] + '")' : k; }
  function lsUsage() {
    var out = { total: 0, copies: 0, own: 0, items: [] };
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), n = k.length + (localStorage.getItem(k) || "").length;
        out.total += n; if (lsIsCopy(k)) out.copies += n; else out.own += n;
        out.items.push({ k: k, n: n, copy: lsIsCopy(k) });
      }
    } catch (e) { /* blocked */ }
    out.items.sort(function (a, b) { return b.n - a.n; });
    return out;
  }

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
  /* Notion labels carry emoji ("🔴 High", "🎯 Work"). Show them as plain text;
     the original value is still what gets sent back to Notion. */
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{3030}\u{303D}\u{3297}\u{3299}\u{00A9}\u{00AE}\u{203C}\u{2049}\u{2122}\u{2139}\u{FE0F}\u{200D}\u{20E3}]/gu;
  /* bare(): for labels only (Notion's select options, areas, statuses, fund names), shown as plain LCARS text.
     Never for what Timothy wrote (titles, notes, names): those keep their emoji on every screen (2.54.1). */
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
    t.textContent = msg; toastUndoFn = null;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }
  /* 2.73: a toast with UNDO for 10 seconds (UPKEEP's MARK DONE). Any later toast replaces it, and its undo with it. */
  var toastUndoFn = null;
  function toastUndo(msg, fn) {
    var t = $("toast");
    t.innerHTML = '<span>' + esc(msg) + '</span><button type="button" class="toast-undo" data-toastundo="1">UNDO</button>';
    t.hidden = false; toastUndoFn = fn;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; toastUndoFn = null; }, 10000);
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
    tasksErr: null, tasksAsked: {},
    fixBusy: {}, fixSeen: false, fixFocus: null,
    tasksInflight: {},
    taskBusy: {},
    dates: lsGet(LS_DATES),                /* { fetched, dates, areas, types } */
    hols: lsGet("tos.hols.v1"),            /* holidays (bridge 1.23): { fetched, calendar, list[{d, t}] }; key is LS_HOLS */
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
    ledger: lsGet(LS_LEDGER), ledgerErr: null, ledgerInflight: false, ledgerCat: null, queueBusy: false, queueConfirm: null, queueRemove: null,
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

