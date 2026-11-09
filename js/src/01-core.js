
  var VERSION = "2.74.0";
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

  /* ---------- Storage (never throws) ---------- */
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v, function (key, val) { return key.charAt(0) === "_" ? undefined : val; })); } catch (e) { /* storage full or blocked */ }
    if (lsHook) lsHook(k);
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } if (lsHook) lsHook(k); }

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

