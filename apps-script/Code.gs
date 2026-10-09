/**
 * TimothyOS bridge, v1.10
 *
 * Runs inside your personal Google account as a web app.
 *  - Calendars: reads Work + Personal, plus your farm calendar once linked
 *    (Script Property FARM_CALENDAR_ID). Creates events you capture on Personal
 *    or the farm calendar; never on Work.
 *  - Notion: reads your Master Task List for Plan Day; sets Focus Date, marks
 *    tasks done, and adds new tasks. Reads and adds Key Dates. Counts tasks
 *    finished recently (for the Bridge's Balance panel). Reads a week's
 *    finished and picked tasks, and saves your Weekly Review (one page per week).
 *    Lists saved reviews for the Review log and its trends.
 *  - Ledger: reads your YNAB plan (Script Property YNAB_TOKEN; read-only, it never
 *    writes to YNAB) and the Replicator Queue in Notion (add, reorder, mark bought).
 *  - Captain's Log: one Notion page per day, the entry in its body. Every log
 *    request must carry your authorization code (Script Property LOG_PIN: a Greek
 *    code word and four digits, like OMEGA-0000, or six digits); five wrong tries
 *    lock the log for 15 minutes, twice as long for each lockout in a row. Editing an entry rewrites only that
 *    entry's own text. Search (bridge 1.16) reads a copy of each entry's text kept
 *    in its page's Search Text field. Ask never sees the log.
 *  - Ask: answers questions with Claude (key in Script Properties: ANTHROPIC_API_KEY).
 *    Claude only reads; every change it suggests waits for your tap in the app.
 *    A monthly budget pauses it (AI_BUDGET_USD, default $8).
 *    Nothing else in Notion is touched.
 *
 * The work calendar can never be written to. Nothing is ever deleted, except
 * paragraphs you remove from your own log entry when you edit it.
 * Your Notion key lives in Script Properties (NOTION_TOKEN), never in this code.
 * Setup and update steps are in README.md.
 */

// ---- Your settings ---------------------------------------------------------
var CONFIG = {
  // Your personal calendar. "primary" means the default calendar of the
  // Google account this script runs in.
  PERSONAL_CALENDAR_ID: 'primary',

  // Your work calendar, shared to this personal account. Usually your work
  // email address. Run setup() to list every calendar this account can see.
  // setup() also saves it, so future code updates keep it even if this line
  // goes back to the placeholder.
  WORK_CALENDAR_ID: 'you@your-employer.com',

  // Your Notion Master Task List (the ID is the 32 characters in its link).
  // Not a secret on its own: the bridge also needs NOTION_TOKEN, which lives in
  // Project Settings > Script Properties and never in this file.
  NOTION_TASKS_DATABASE: '6c4a440d571e49e0b4076c18d5712c1f',

  // Your Notion Key Dates database.
  NOTION_DATES_DATABASE: '8184db37aacb4d96943b2067558b92ab',

  // Your Notion Weekly Reviews database.
  NOTION_REVIEWS_DATABASE: '459bcacdc38d4bad9f58b4579fa9f4fd',

  // Your Notion Replicator Queue (things to buy once the Discretionary category allows).
  NOTION_QUEUE_DATABASE: '6f9b8c3888f74ec18a503bd197f37c8c',

  // Your Notion Captain's Log (one page per day). Its PIN is Script Property LOG_PIN.
  NOTION_LOG_DATABASE: '4c395160e1a84702a3a6861c20ddf748',

  // Your Notion Habits database (one page per day).
  NOTION_HABITS_DATABASE: '441619b34ada41d49e05bed92372589b',

  // Your Notion Library (one page per book).
  NOTION_LIBRARY_DATABASE: '47fdad1d1217402fa84731a8aa146cba'
};
// ---------------------------------------------------------------------------

var VERSION = '1.17.0';
var NOTION_VERSION = '2025-09-03';
var TASK_STATUSES = ['⬜ To Do', '🔄 In Progress', '✅ Done', '🚫 Blocked'];
var TASK_PRIORITIES = ['🔴 High', '🟡 Medium', '🟢 Low'];
function capabilities_() {
  var props = PropertiesService.getScriptProperties();
  return ['read', 'create'].concat(props.getProperty('NOTION_TOKEN') ? ['tasks', 'dates', 'done', 'reviews', 'reviewlog', 'queue', 'log', 'habits', 'library'] : [], logPin_() ? ['logpin'] : [], logPin_().indexOf('-') > -1 ? ['logcode'] : [], props.getProperty('NOTION_TOKEN') && props.getProperty('LOG_SEARCH_READY') === '1' ? ['logsearch'] : [], props.getProperty('ANTHROPIC_API_KEY') ? ['ask'] : [], props.getProperty('YNAB_TOKEN') ? ['ledger'] : []);
}
var MAX_RANGE_DAYS = 62;
var CACHE_SECONDS = 120;
var PLACEHOLDER = 'your-employer.com';
var SOURCES = [
  { area: 'work', id: workCalendarId_ },
  { area: 'personal', id: function () { return CONFIG.PERSONAL_CALENDAR_ID; } },
  { area: 'farm', id: farmCalendarId_, optional: true }   // left out until FARM_CALENDAR_ID is set
];
// Calendars the app may add events to. Work is deliberately absent.
var WRITABLE = {
  personal: function () { return CONFIG.PERSONAL_CALENDAR_ID; },
  farm: farmCalendarId_
};
/** Sources in use: optional calendars only once they're set. */
function sources_() { return SOURCES.filter(function (src) { return !src.optional || src.id(); }); }

/** Read requests. Every request must carry the access key. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var refused = keyRefusal_(p.key);
    if (refused) return json_({ ok: false, error: refused });
    if (p.action === 'logunlock' || p.action === 'logdates' || p.action === 'logday' || p.action === 'logsearch') return json_(logAction_(p));   // reads travel as GET: nothing to lose on a redirect
    if (p.action === 'ping') return json_({ ok: true, version: VERSION, capabilities: capabilities_(), calendars: calendarStatus_(), notion: notionStatus_(), ai: aiKey_() ? aiSpend_() : null });
    if (p.action === 'batch') return json_(batch_(p.calls));
    return json_(read_(p) || { ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_(readError_(err));
  }
}

/** The everyday reads, by action. Null for anything else. */
var BATCH_READS = ['aispend', 'events', 'tasks', 'dates', 'done', 'week', 'reviews', 'ledger', 'habits', 'library'];
function read_(p) {
  if (p.action === 'aispend') return { ok: true, version: VERSION, ai: aiKey_() ? aiSpend_() : null, log: aiKey_() ? aiLog_() : [] };
  if (p.action === 'events') return events_(Number(p.from), Number(p.to));
  if (p.action === 'tasks') return tasks_(String(p.day || ''));
  if (p.action === 'dates') return dates_();
  if (p.action === 'done') return done_(p.days);
  if (p.action === 'week') return week_(String(p.week || ''), String(p.from || ''), String(p.to || ''));
  if (p.action === 'reviews') return reviews_(p.limit);
  if (p.action === 'ledger') return ledger_();
  if (p.action === 'habits') return habits_(p.from, p.to);
  if (p.action === 'library') return library_();
  return null;
}
function readError_(err) {
  if (err && err.notion) return { ok: false, error: err.notion, detail: err.message };
  return { ok: false, error: 'server_error', detail: String((err && err.message) || err) };
}

/**
 * Several reads in one request (calls = JSON list of {action, ...}). The app bundles the reads it
 * needs at the same moment, such as on returning to the app, so Google runs one execution instead
 * of five: fewer chances for its result page to go missing. Each read answers on its own; one
 * failing doesn't stop the others.
 */
function batch_(raw) {
  var calls;
  try { calls = JSON.parse(String(raw || '')); } catch (x) { return { ok: false, error: 'bad_request' }; }
  if (!Array.isArray(calls) || !calls.length || calls.length > 8) return { ok: false, error: 'bad_request' };
  return { ok: true, version: VERSION, results: calls.map(function (c) {
    if (!c || BATCH_READS.indexOf(c.action) === -1) return { ok: false, error: 'bad_request' };
    try { return read_(c); } catch (err) { return readError_(err); }
  }) };
}

/** Write requests (Capture). The body is JSON: { key, action: "create", item }. */
function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    var refusedP = keyRefusal_(body.key);
    if (refusedP) return json_({ ok: false, error: refusedP });
    if (body.action === 'create') return json_(create_(body.item || {}));
    if (body.action === 'focus') return json_(setFocus_(body.id, body.day));
    if (body.action === 'status') return json_(setStatus_(body.id, body.status));
    if (body.action === 'addtask') return json_(addTask_(body.task || {}));
    if (body.action === 'adddate') return json_(addDate_(body.date || {}));
    if (body.action === 'savereview') return json_(saveReview_(body.review || {}));
    if (body.action === 'ask') return json_(ask_(body));
    if (body.action === 'aicontinue') return json_(aiContinue_());
    if (body.action === 'aispendset') return json_(aiSpendSet_(body.usd));
    if (body.action === 'queueadd') return json_(queueAdd_(body.item || {}));
    if (body.action === 'queueorder') return json_(queueOrder_(body.ids));
    if (body.action === 'habitset') return json_(habitSet_(body.day));
    if (body.action === 'booksave') return json_(bookSave_(body.book));
    if (body.action === 'bookremove') return json_(bookRemove_(body.id));
    if (/^log/.test(String(body.action || ''))) return json_(logAction_(body));
    if (body.action === 'queuebought') return json_(queueBought_(String(body.id || ''), body.day === null ? null : String(body.day || '')));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    if (err && err.notion) return json_({ ok: false, error: err.notion, detail: err.message });
    return json_({ ok: false, error: 'server_error', detail: String((err && err.message) || err) });
  }
}

/**
 * Run this from the editor (select "setup", then Run) after first install
 * and after every code update. Creates your access key if there is none,
 * saves your work calendar ID, and lists every calendar this account can see.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ACCESS_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ACCESS_KEY', key);
  }
  if (CONFIG.WORK_CALENDAR_ID && CONFIG.WORK_CALENDAR_ID.indexOf(PLACEHOLDER) === -1) {
    props.setProperty('WORK_CALENDAR_ID', CONFIG.WORK_CALENDAR_ID);
  }
  console.log('Calendars this account can see (name -> ID):');
  CalendarApp.getAllCalendars().forEach(function (c) {
    console.log('  ' + c.getName() + '  ->  ' + c.getId());
  });
  calendarStatus_().forEach(function (s) {
    console.log('TimothyOS ' + s.area + ' calendar: ' + (s.ok ? 'OK (' + s.name + ')' : 'PROBLEM: ' + s.error + (s.area === 'farm' ? '. Check FARM_CALENDAR_ID in Script Properties against the list above' : '')));
  });
  if (!farmCalendarId_()) console.log('TimothyOS farm calendar: OFF. Add FARM_CALENDAR_ID in Script Properties (the ID from the list above) to link it');
  var n = notionStatus_();
  console.log('Notion tasks: ' + (n.ok ? 'OK (' + n.name + ', ' + n.open + ' open tasks)' : 'NOT READY: ' + n.error + (n.help ? '. ' + n.help : '')));
  var kd = n.dates || {};
  console.log('Notion key dates: ' + (kd.ok ? 'OK (' + kd.name + ', ' + kd.count + ' dates)' : 'NOT READY: ' + (kd.error || n.error) + (kd.help ? '. ' + kd.help : '')));
  var wr = n.reviews || {};
  console.log('Notion weekly reviews: ' + (wr.ok ? 'OK (' + wr.name + ', ' + wr.count + ' reviews)' : 'NOT READY: ' + (wr.error || n.error) + (wr.help ? '. ' + wr.help : '')));
  var lg = ledgerStatus_();
  console.log('Ledger (YNAB): ' + lg.ynab);
  console.log('Notion replicator queue: ' + lg.queue);
  console.log("Captain's Log: " + logStatus_());
  console.log("Captain's Log search: " + logSearchSetup_());
  console.log('Notion habits: ' + habitsStatus_());
  console.log('Notion library: ' + libraryStatus_());
  var ai = aiKey_() ? aiSpend_() : null;
  console.log('Ask Claude: ' + (ai ? 'OK (questions ' + aiFast_() + ', THINK HARDER ' + AI.DEEP + '). This month $' + ai.usd.toFixed(2) + ', reminder at $' + ai.budget.toFixed(2) + (ai.cont ? ' (continued)' : '') + ' (' + ai.calls + ' calls)' : 'OFF. Add ANTHROPIC_API_KEY in Script Properties to turn it on'));
  console.log('Bridge version ' + VERSION + '. Can write to: ' + Object.keys(WRITABLE).filter(function (k) { return WRITABLE[k](); }).join(', ') + (n.ok ? ', Notion tasks' : '') + '.');
  console.log('ACCESS KEY (paste into the iPad app): ' + key);
}

/** Run this only if your access key leaks. The iPad app will need the new key. */
function rotateKey() {
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_KEY');
  setup();
}

/**
 * Run this from the editor (select "compareModels", then Run) to see Ask on Sonnet 5.5
 * (low effort, everyday), Opus 5.5 (medium, THINK HARDER) and Haiku 5.5 (low) side by
 * side with your own calendar and tasks. Five questions, three setups: roughly 30 to 70
 * cents in total, counted in this month's Ask spend. Nothing is changed: proposals are
 * only listed. Results stay in this log.
 */
function compareModels() {
  if (!aiKey_()) { console.log('Add ANTHROPIC_API_KEY first.'); return; }
  var tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'EEEE yyyy-MM-dd HH:mm');
  var context = 'TODAY: ' + today + ' (' + tz + ')\nThis is a model comparison run from the script editor: the app snapshot is not included, so use your tools to look things up.';
  var questions = [
    'What should I do first today?',
    "What's on my calendar tomorrow, and is anything back to back?",
    'Which of my open tasks are overdue?',
    'Remind me Friday at 3pm to call the vet.',
    'How busy is my next week compared with this one?'
  ];
  var setups = [{ model: 'claude-sonnet-5-5', effort: 'low' }, { model: 'claude-opus-5-5', effort: 'medium' }, { model: 'claude-haiku-5-5', effort: 'low' }];
  var totals = setups.map(function () { return { usd: 0, ms: 0, ok: 0 }; });
  questions.forEach(function (q, qi) {
    console.log('\n=== Q' + (qi + 1) + ': ' + q);
    setups.forEach(function (st, si) {
      var t0 = Date.now(), r;
      try { r = ask_({ cid: 'cmp-' + Utilities.getUuid().slice(0, 18), mode: 'fast', context: context, messages: [{ role: 'user', text: q }] }, st); }
      catch (e) { r = { ok: false, error: String(e.message || e) }; }
      var ms = Date.now() - t0, label = st.model.replace('claude-', '') + (st.effort ? ' (' + st.effort + ')' : '');
      if (!r.ok) { console.log('--- ' + label + ': ERROR ' + r.error + (r.detail ? ' ' + r.detail : '')); return; }
      totals[si].usd += r.costExact || 0; totals[si].ms += ms; totals[si].ok++;
      console.log('--- ' + label + ' · ' + (ms / 1000).toFixed(1) + ' s · $' + (r.costExact || 0).toFixed(5) + ' · ' + r.steps + ' step(s) · ' + r.stop +
        (r.proposals.length ? ' · proposes: ' + r.proposals.map(function (x) { return x.kind; }).join(', ') : '') + '\n' + r.reply);
    });
  });
  console.log('\n=== TOTALS');
  setups.forEach(function (st, si) {
    var t = totals[si];
    console.log(st.model + (st.effort ? ' (' + st.effort + ')' : '') + ': ' + t.ok + '/' + questions.length + ' answered · $' + t.usd.toFixed(4) + ' · avg ' + (t.ok ? (t.ms / t.ok / 1000).toFixed(1) : '-') + ' s');
  });
  console.log('Everyday Ask is using: ' + aiFast_() + '. To switch back to Haiku 4.5, add Script Property AI_FAST_MODEL = claude-haiku-4-5.');
}

// ---- Internals -------------------------------------------------------------

/**
 * null when the key matches; otherwise why not. The three refusals are told apart so the
 * app can retry the two that aren't your fault:
 *  - no_key: the request arrived without its details (Google can turn a POST into an
 *    empty GET on a redirect), so the key never reached us;
 *  - key_unreadable: Google's settings store answered empty for a moment;
 *  - unauthorized: a key arrived and it's the wrong one.
 */
function keyRefusal_(given) {
  if (typeof given !== 'string' || !given) return 'no_key';
  for (var i = 0; i < 3; i++) {
    var key = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
    if (key) return given === key ? null : 'unauthorized';
    if (i < 2) Utilities.sleep(300);
  }
  return 'key_unreadable';
}
function keyMatches_(given) { return keyRefusal_(given) === null; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function workCalendarId_() {
  if (CONFIG.WORK_CALENDAR_ID && CONFIG.WORK_CALENDAR_ID.indexOf(PLACEHOLDER) === -1) return CONFIG.WORK_CALENDAR_ID;
  return PropertiesService.getScriptProperties().getProperty('WORK_CALENDAR_ID') || '';
}

/** The farm calendar's ID, from Script Properties (so its name never sits in this code). Empty until linked. */
function farmCalendarId_() {
  return String(PropertiesService.getScriptProperties().getProperty('FARM_CALENDAR_ID') || '').trim();
}

function openCalendar_(id) {
  if (!id || id.indexOf(PLACEHOLDER) > -1) return { cal: null, error: 'not_configured' };
  var cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  return cal ? { cal: cal } : { cal: null, error: 'not_found' };
}

function calendarStatus_() {
  return sources_().map(function (src) {
    var o = openCalendar_(src.id());
    return o.cal ? { area: src.area, ok: true, name: o.cal.getName() } : { area: src.area, ok: false, error: o.error };
  });
}

/** One event in the shape the app expects. */
function toItem_(ev, area, tz) {
  var title = ev.getTitle();
  var item = {
    id: area + ':' + ev.getId() + ':' + ev.getStartTime().getTime(),
    area: area,
    title: title || 'Busy',
    busy: !title,
    allDay: ev.isAllDayEvent(),
    location: ev.getLocation() || ''
  };
  if (item.allDay) {
    item.start = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
    item.end = Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd');
  } else {
    item.start = ev.getStartTime().toISOString();
    item.end = ev.getEndTime().toISOString();
  }
  return item;
}

function events_(from, to) {
  if (!isFinite(from) || !isFinite(to) || to <= from) return { ok: false, error: 'bad_range' };
  if ((to - from) / 86400000 > MAX_RANGE_DAYS) return { ok: false, error: 'range_too_long' };

  var cache = CacheService.getScriptCache();
  var cacheKey = 'ev:' + VERSION + ':' + (cache.get('gen') || '0') + ':' + from + ':' + to;
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  var start = new Date(from), end = new Date(to);
  var calendars = [], events = [];
  sources_().forEach(function (src) {
    var o = openCalendar_(src.id());
    if (!o.cal) { calendars.push({ area: src.area, ok: false, error: o.error }); return; }
    var tz = o.cal.getTimeZone();
    calendars.push({ area: src.area, ok: true, name: o.cal.getName() });
    o.cal.getEvents(start, end).forEach(function (ev) {
      if (src.area !== 'work' && declined_(ev)) return;
      events.push(toItem_(ev, src.area, tz));
    });
  });

  var out = { ok: true, version: VERSION, capabilities: capabilities_(), generated: new Date().toISOString(), calendars: calendars, events: events };
  try { cache.put(cacheKey, JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* too large to cache; fine */ }
  return out;
}

/**
 * Create one event. item: { cid, area, title, allDay, start, end }
 *   cid    unique ID from the app, so a resent capture never makes a duplicate
 *   timed  start/end are ISO timestamps
 *   allDay start/end are yyyy-MM-dd dates (end is the day after)
 */
function create_(item) {
  if (!Object.prototype.hasOwnProperty.call(WRITABLE, item.area)) return { ok: false, error: 'not_writable' };
  var title = String(item.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(item.cid || ''))) return { ok: false, error: 'bad_request' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache();
    var seen = cache.get('cid:' + item.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }

    var o = openCalendar_(WRITABLE[item.area]());
    if (!o.cal) return { ok: false, error: o.error };
    var ev, now = Date.now();
    if (item.allDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.start || ''))) return { ok: false, error: 'bad_time' };
      var day = Utilities.parseDate(item.start, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (Math.abs(day.getTime() - now) > 400 * 86400000) return { ok: false, error: 'bad_time' };
      ev = o.cal.createAllDayEvent(title, day);
    } else {
      var s = new Date(item.start), e = new Date(item.end);
      if (!isFinite(s.getTime()) || !isFinite(e.getTime()) || e <= s || e - s > 86400000) return { ok: false, error: 'bad_time' };
      if (s.getTime() < now - 2 * 86400000 || s.getTime() > now + 400 * 86400000) return { ok: false, error: 'bad_time' };
      ev = o.cal.createEvent(title, s, e);
    }
    try { ev.setDescription('Added from TimothyOS'); ev.setTag('tosCid', item.cid); } catch (x) { /* optional */ }

    var out = { ok: true, version: VERSION, event: toItem_(ev, item.area, o.cal.getTimeZone()) };
    cache.put('cid:' + item.cid, JSON.stringify(out), 21600);   // remember for 6 hours
    cache.put('gen', String(now), 21600);                         // fresh reads include the new event
    return out;
  } finally {
    lock.releaseLock();
  }
}

function declined_(ev) {
  try { return ev.getMyStatus() === CalendarApp.GuestStatus.NO; } catch (e) { return false; }
}

// ---- Notion: Master Task List ---------------------------------------------

function notion_(method, path, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) { var e0 = new Error('No NOTION_TOKEN in Script Properties'); e0.notion = 'notion_not_configured'; throw e0; }
  var opts = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION } };
  if (payload) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, opts);
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  if (code >= 300) {
    var e = new Error((body && body.message) || ('Notion HTTP ' + code));
    e.notion = code === 401 ? 'notion_unauthorized' : code === 404 ? 'notion_not_shared' : code === 429 ? 'notion_busy' : 'notion_error';
    throw e;
  }
  return body;
}

/** A database's data source ID, looked up once and remembered. */
function sourceFor_(dbIdRaw, memo) {
  var props = PropertiesService.getScriptProperties();
  var dbId = String(dbIdRaw || '').replace(/-/g, '');
  var known = props.getProperty(memo);
  if (known && known.indexOf(dbId + ':') === 0) return known.split(':')[1];
  var db = notion_('get', '/databases/' + dbId);
  var ds = db.data_sources && db.data_sources[0] && db.data_sources[0].id;
  if (!ds) { var e = new Error('That database has no data source'); e.notion = 'notion_error'; throw e; }
  props.setProperty(memo, dbId + ':' + ds);
  return ds;
}
function tasksSource_() { return sourceFor_(CONFIG.NOTION_TASKS_DATABASE, 'NOTION_TASKS_SOURCE'); }
function datesSource_() { return sourceFor_(CONFIG.NOTION_DATES_DATABASE, 'NOTION_DATES_SOURCE'); }
function reviewsSource_() { return sourceFor_(CONFIG.NOTION_REVIEWS_DATABASE, 'NOTION_REVIEWS_SOURCE'); }

function notionStatus_() {
  if (!PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN')) {
    return { ok: false, error: 'not_configured', help: 'Add NOTION_TOKEN in Project Settings > Script Properties' };
  }
  try {
    var ds = tasksSource_();
    var src = notion_('get', '/data_sources/' + ds);
    var open = queryAll_(ds, { property: 'Status', select: { does_not_equal: '✅ Done' } }, 1).length;
    return { ok: true, name: plain_(src.title), open: open, dates: datesStatus_(), reviews: reviewsStatus_() };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to the Master Task List (... > Connections)' : String(e.message), dates: datesStatus_(), reviews: reviewsStatus_() };
  }
}
function datesStatus_() {
  try {
    var ds = datesSource_();
    var src = notion_('get', '/data_sources/' + ds);
    return { ok: true, name: plain_(src.title), count: queryAll_(ds, null, 1).length };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to Key Dates (... > Connections)' : String(e.message) };
  }
}

function reviewsStatus_() {
  try {
    var ds = reviewsSource_();
    var src = notion_('get', '/data_sources/' + ds);
    return { ok: true, name: plain_(src.title), count: queryAll_(ds, null, 1).length };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to Weekly Reviews (... > Connections)' : String(e.message) };
  }
}

function plain_(rich) { return (rich || []).map(function (r) { return r.plain_text || ''; }).join(''); }
function sel_(prop) { return prop && prop.select ? prop.select.name : null; }
function day_(prop) { return prop && prop.date && prop.date.start ? prop.date.start.slice(0, 10) : null; }

function toTask_(pg) {
  var p = pg.properties || {};
  return {
    id: pg.id, url: pg.url,
    title: plain_(p.Task && p.Task.title) || 'Untitled',
    status: sel_(p.Status), priority: sel_(p.Priority), area: sel_(p['Life Area']),
    due: day_(p['Due Date']), focus: day_(p['Focus Date'])
  };
}

/** Query with pagination; maxPages x 100 rows at most. */
function queryAll_(ds, filter, maxPages, sorts) {
  var out = [], cursor = null;
  for (var i = 0; i < (maxPages || 3); i++) {
    var body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;
    var r = notion_('post', '/data_sources/' + ds + '/query', body);
    out = out.concat(r.results || []);
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

/** A select field's choices, read from the database so new options appear automatically. */
function selectOptions_(ds, field) {
  var cache = CacheService.getScriptCache(), key = 'opts:' + ds + ':' + field, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var src = notion_('get', '/data_sources/' + ds);
  var prop = src.properties && src.properties[field];
  var names = prop && prop.select ? prop.select.options.map(function (o) { return o.name; }) : [];
  cache.put(key, JSON.stringify(names), 21600);
  return names;
}
function areaOptions_(ds) { return selectOptions_(ds, 'Life Area'); }

/** Plan Day data for one day: today's picks plus every open task. */
function tasks_(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache();
  var key = 'tasks:' + (cache.get('tgen') || '0') + ':' + day;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_();
  var focus = queryAll_(ds, { property: 'Focus Date', date: { equals: day } }, 1).map(toTask_);
  var open = queryAll_(ds, { property: 'Status', select: { does_not_equal: '✅ Done' } }, 3,
    [{ property: 'Due Date', direction: 'ascending' }]).map(toTask_);
  var out = { ok: true, version: VERSION, day: day, focus: focus, open: open, areas: areaOptions_(ds), priorities: TASK_PRIORITIES };
  try { cache.put(key, JSON.stringify(out), 60); } catch (e) { /* too large to cache */ }
  return out;
}

/**
 * Balance: tasks marked Done in the last few days, with their Life Area only
 * (no titles). Notion has no "completed on" field, so each page's last edit
 * stands in for the day it was finished.
 */
function done_(days) {
  days = Math.max(1, Math.min(60, Math.floor(Number(days)) || 30));
  var cache = CacheService.getScriptCache();
  var key = 'done:' + (cache.get('tgen') || '0') + ':' + days;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_();
  var since = new Date(Date.now() - days * 86400000).toISOString();
  var done = queryAll_(ds, { and: [
    { property: 'Status', select: { equals: '✅ Done' } },
    { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } }
  ] }, 3).map(function (pg) {
    return { area: sel_((pg.properties || {})['Life Area']), at: pg.last_edited_time || null };
  });
  var out = { ok: true, version: VERSION, days: days, done: done };
  try { cache.put(key, JSON.stringify(out), 300); } catch (e) { /* too large to cache */ }
  return out;
}

// ---- Weekly Review ------------------------------------------------------------
var REVIEW_TEXT = { wentWell: 'Went Well', drained: 'Drained Me', nextFocus: 'Next Focus', bearing: 'Bearing', intents: 'Intents', byArea: 'Done By Area', summary: 'Claude Summary' };
var REVIEW_NUM = { hoursWork: 'Hours Work', hoursPersonal: 'Hours Personal', hoursFarm: 'Hours Farm', hoursHobbies: 'Hours Hobbies', tasksDone: 'Tasks Done', picked: 'Priorities Picked', pickedDone: 'Priorities Done' };
var YMD = /^\d{4}-\d{2}-\d{2}$/, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function addDaysYmd_(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** Rich text in Notion's 2000-character pieces. */
function rt_(text) {
  var out = [];
  for (var i = 0; i < text.length && out.length < 3; i += 2000) out.push({ text: { content: text.slice(i, i + 2000) } });
  return out;
}
function toReview_(pg) {
  var p = pg.properties || {}, out = { id: pg.id, url: pg.url, saved: pg.last_edited_time || null, week: day_(p['Week Start']), title: plain_(p.Week && p.Week.title) };
  Object.keys(REVIEW_TEXT).forEach(function (k) { out[k] = plain_(p[REVIEW_TEXT[k]] && p[REVIEW_TEXT[k]].rich_text); });
  Object.keys(REVIEW_NUM).forEach(function (k) { out[k] = p[REVIEW_NUM[k]] && typeof p[REVIEW_NUM[k]].number === 'number' ? p[REVIEW_NUM[k]].number : null; });
  return out;
}
function findReview_(ds, week) {
  return queryAll_(ds, { property: 'Week Start', date: { equals: week } }, 1)[0] || null;
}

/**
 * One week for the Review screen. week = its Monday (yyyy-mm-dd); from and to =
 * that Monday and the next at local midnight (ISO), so "finished this week"
 * follows the iPad's time zone. Returns tasks finished (by last edit), tasks
 * picked (Focus Date in the week), and the saved review if there is one.
 */
function week_(week, from, to) {
  if (!YMD.test(week) || !ISO.test(from) || !ISO.test(to) || !(Date.parse(to) > Date.parse(from))) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache();
  var key = 'week:' + (cache.get('tgen') || '0') + ':' + (cache.get('rgen') || '0') + ':' + week + ':' + from;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_(), next = addDaysYmd_(week, 7);
  var done = queryAll_(ds, { and: [
    { property: 'Status', select: { equals: '✅ Done' } },
    { timestamp: 'last_edited_time', last_edited_time: { on_or_after: from } },
    { timestamp: 'last_edited_time', last_edited_time: { before: to } }
  ] }, 3).map(function (pg) { var t = toTask_(pg); t.at = pg.last_edited_time || null; return t; });
  var picked = queryAll_(ds, { and: [
    { property: 'Focus Date', date: { on_or_after: week } },
    { property: 'Focus Date', date: { before: next } }
  ] }, 2).map(toTask_);
  var review = null, reviewsError = null;
  try {
    var pg = findReview_(reviewsSource_(), week);
    if (pg) review = toReview_(pg);
  } catch (e) {
    if (!e.notion) throw e;
    reviewsError = e.notion;
  }
  var out = { ok: true, version: VERSION, week: week, done: done, picked: picked, review: review, reviewsError: reviewsError };
  try { cache.put(key, JSON.stringify(out), 60); } catch (x) { /* too large to cache */ }
  return out;
}

/** Saved reviews, newest first, for the Review log and its trends. */
function reviews_(limit) {
  limit = Math.max(1, Math.min(104, Math.floor(Number(limit)) || 60));
  var cache = CacheService.getScriptCache(), key = 'reviews:' + (cache.get('rgen') || '0') + ':' + limit, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(reviewsSource_(), null, Math.ceil(limit / 100), [{ property: 'Week Start', direction: 'descending' }])
    .map(toReview_).filter(function (r) { return r.week; }).slice(0, limit);
  var out = { ok: true, version: VERSION, reviews: rows };
  try { cache.put(key, JSON.stringify(out), 300); } catch (e) { /* too large to cache */ }
  return out;
}

/** Save the review for one week: updates that week's page, or creates it. Only fields that are sent change. Safe to repeat. */
function saveReview_(r) {
  var week = String(r.week || '');
  if (!YMD.test(week)) return { ok: false, error: 'bad_request' };
  var props = {
    Week: { title: rt_(String(r.title || week).trim().slice(0, 120) || week) },
    'Week Start': { date: { start: week } }
  };
  Object.keys(REVIEW_TEXT).forEach(function (k) { if (r[k] !== undefined) props[REVIEW_TEXT[k]] = { rich_text: rt_(String(r[k] == null ? '' : r[k]).trim().slice(0, 6000)) }; });
  Object.keys(REVIEW_NUM).forEach(function (k) {
    if (r[k] === undefined) return;
    var v = Number(r[k]);
    props[REVIEW_NUM[k]] = { number: r[k] === null || r[k] === undefined || r[k] === '' || !isFinite(v) ? null : Math.round(v * 10) / 10 };
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = reviewsSource_(), found = findReview_(ds, week), pg;
    if (found) pg = notion_('patch', '/pages/' + found.id, { properties: props });
    else pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    CacheService.getScriptCache().put('rgen', String(Date.now()), 21600);
    return { ok: true, version: VERSION, created: !found, review: toReview_(pg) };
  } finally {
    lock.releaseLock();
  }
}

/** Only pages inside the Master Task List may be changed. */
function ownTask_(id) {
  if (!/^[0-9a-f-]{32,36}$/i.test(String(id || ''))) return null;
  var pg = notion_('get', '/pages/' + id);
  var ds = tasksSource_(), parent = pg.parent || {};
  return parent.data_source_id === ds ? pg : null;
}
function touched_() { CacheService.getScriptCache().put('tgen', String(Date.now()), 21600); }

function setFocus_(id, day) {
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { ok: false, error: 'bad_request' };
  if (!ownTask_(id)) return { ok: false, error: 'not_writable' };
  var pg = notion_('patch', '/pages/' + id, { properties: { 'Focus Date': { date: day ? { start: day } : null } } });
  touched_();
  return { ok: true, task: toTask_(pg) };
}

function setStatus_(id, status) {
  if (TASK_STATUSES.indexOf(status) === -1) return { ok: false, error: 'bad_request' };
  if (!ownTask_(id)) return { ok: false, error: 'not_writable' };
  var pg = notion_('patch', '/pages/' + id, { properties: { Status: { select: { name: status } } } });
  touched_();
  return { ok: true, task: toTask_(pg) };
}

/** task: { cid, title, area, priority, day } -> new To Do task, focused on day. */
function addTask_(task) {
  var title = String(task.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(task.cid || ''))) return { ok: false, error: 'bad_request' };
  if (task.day && !/^\d{4}-\d{2}-\d{2}$/.test(String(task.day))) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('tcid:' + task.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var ds = tasksSource_();
    var props = { Task: { title: [{ text: { content: title } }] }, Status: { select: { name: '⬜ To Do' } } };
    if (task.area) {
      if (areaOptions_(ds).indexOf(task.area) === -1) return { ok: false, error: 'bad_request' };
      props['Life Area'] = { select: { name: task.area } };
    }
    if (task.priority) {
      if (TASK_PRIORITIES.indexOf(task.priority) === -1) return { ok: false, error: 'bad_request' };
      props.Priority = { select: { name: task.priority } };
    }
    if (task.day) props['Focus Date'] = { date: { start: task.day } };
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    var out = { ok: true, version: VERSION, task: toTask_(pg) };
    cache.put('tcid:' + task.cid, JSON.stringify(out), 21600);
    touched_();
    return out;
  } finally {
    lock.releaseLock();
  }
}

// ---- Notion: Key Dates ------------------------------------------------------

function toDate_(pg) {
  var p = pg.properties || {}, d = (p.Date && p.Date.date) || {};
  return {
    id: pg.id, url: pg.url,
    title: plain_(p.Name && p.Name.title) || 'Untitled',
    start: d.start ? d.start.slice(0, 10) : null,
    end: d.end ? d.end.slice(0, 10) : null,
    area: sel_(p['Life Area']), type: sel_(p.Type),
    yearly: !!(p['Repeats Yearly'] && p['Repeats Yearly'].checkbox),
    notes: plain_(p.Notes && p.Notes.rich_text)
  };
}

/** Every key date (the app works out countdowns and yearly repeats). */
function dates_() {
  var cache = CacheService.getScriptCache();
  var key = 'dates:' + (cache.get('dgen') || '0');
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = datesSource_();
  var dates = queryAll_(ds, null, 5, [{ property: 'Date', direction: 'ascending' }]).map(toDate_).filter(function (d) { return d.start; });
  var out = { ok: true, version: VERSION, dates: dates, areas: areaOptions_(ds), types: selectOptions_(ds, 'Type') };
  try { cache.put(key, JSON.stringify(out), 120); } catch (e) { /* too large to cache */ }
  return out;
}

/** date: { cid, title, start, end, area, type, yearly, notes } -> new key date. */
function addDate_(date) {
  var title = String(date.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(date.cid || ''))) return { ok: false, error: 'bad_request' };
  var ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(String(date.start || ''))) return { ok: false, error: 'bad_time' };
  if (date.end && (!ymd.test(String(date.end)) || date.end < date.start)) return { ok: false, error: 'bad_time' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('dcid:' + date.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var ds = datesSource_();
    var props = {
      Name: { title: [{ text: { content: title } }] },
      Date: { date: date.end && date.end !== date.start ? { start: date.start, end: date.end } : { start: date.start } },
      'Repeats Yearly': { checkbox: !!date.yearly }
    };
    if (date.area) {
      if (areaOptions_(ds).indexOf(date.area) === -1) return { ok: false, error: 'bad_request' };
      props['Life Area'] = { select: { name: date.area } };
    }
    if (date.type) {
      if (selectOptions_(ds, 'Type').indexOf(date.type) === -1) return { ok: false, error: 'bad_request' };
      props.Type = { select: { name: date.type } };
    }
    var notes = String(date.notes || '').trim().slice(0, 1000);
    if (notes) props.Notes = { rich_text: [{ text: { content: notes } }] };
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    var out = { ok: true, version: VERSION, date: toDate_(pg) };
    cache.put('dcid:' + date.cid, JSON.stringify(out), 21600);
    cache.put('dgen', String(Date.now()), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}

// ---- Ledger: YNAB (read-only) + Replicator Queue (Notion) ---------------------
//
// YNAB: Script Property YNAB_TOKEN (a Personal Access Token). Optional YNAB_PLAN_ID
// (default: the plan you used last). The bridge only ever sends GET requests to YNAB.
// The fund for the Replicator Queue is the category named in LEDGER_FUND_CATEGORY
// (Script Property, default "Discretionary").

var YNAB_BASE = 'https://api.ynab.com/v1';
var LEDGER_SECONDS = 600;          // the current state, cached 10 minutes
var MONTH_SECONDS = 21600;         // past months, cached 6 hours (the longest Apps Script allows)
var LEDGER_MONTHS = 12;
var LOAN_TYPES = ['mortgage', 'autoLoan', 'studentLoan', 'personalLoan', 'medicalDebt', 'otherDebt'];
var SKIP_GROUPS = ['Credit Card Payments', 'Internal Master Category', 'Hidden Categories'];

function ynabToken_() { return PropertiesService.getScriptProperties().getProperty('YNAB_TOKEN'); }
function ynabPlan_() { return String(PropertiesService.getScriptProperties().getProperty('YNAB_PLAN_ID') || 'last-used').trim(); }
function fundName_() { return String(PropertiesService.getScriptProperties().getProperty('LEDGER_FUND_CATEGORY') || 'Discretionary').trim(); }

/** One GET to YNAB. Returns { code, body }; never throws for HTTP errors. GET only: there is no write path to YNAB. */
function ynabGet_(url) {
  var token = ynabToken_();
  if (!token) { var e0 = new Error('No YNAB_TOKEN in Script Properties'); e0.ynab = 'ynab_not_configured'; throw e0; }
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } });
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  return { code: res.getResponseCode(), body: body };
}
/** YNAB renamed budgets to plans (API 1.79). Use /plans, and fall back to the older /budgets if an account only answers there. */
function ynabPrefix_() { return CacheService.getScriptCache().get('ynab:prefix') || 'plans'; }
/** Read one YNAB resource for the plan. */
function ynab_(path) {
  var plan = encodeURIComponent(ynabPlan_()), prefix = ynabPrefix_();
  var r = ynabGet_(YNAB_BASE + '/' + prefix + '/' + plan + path);
  if (r.code === 404 && prefix === 'plans' && !/^\/months\//.test(path)) {
    var old = ynabGet_(YNAB_BASE + '/budgets/' + plan + path);
    if (old.code < 300) { CacheService.getScriptCache().put('ynab:prefix', 'budgets', 21600); r = old; }
  }
  if (r.code >= 300) {
    var e = new Error(((r.body.error && r.body.error.detail) || ('YNAB HTTP ' + r.code)) + ' (reading ' + path.replace(/^\//, '') + ')');
    e.ynab = r.code === 401 ? 'ynab_unauthorized' : r.code === 404 ? 'ynab_not_found' : r.code === 429 ? 'ynab_busy' : 'ynab_error';
    throw e;
  }
  return r.body.data || {};
}
/** Your plans (name and ID), to help pick YNAB_PLAN_ID. */
function ynabPlans_() {
  var r = ynabGet_(YNAB_BASE + '/plans');
  if (r.code >= 300) r = ynabGet_(YNAB_BASE + '/budgets');
  var d = r.body.data || {};
  return (d.plans || d.budgets || []).map(function (b) { return { id: b.id, name: b.name, last: b.last_modified_on || '' }; });
}

/** yyyy-mm-01 for this month and the n months before it, oldest first. */
function ledgerMonths_(n) {
  var t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), y = +t.slice(0, 4), m = +t.slice(5, 7), out = [];
  for (var i = n; i >= 0; i--) {
    var mm = m - i, yy = y;
    while (mm < 1) { mm += 12; yy--; }
    out.push(yy + '-' + (mm < 10 ? '0' : '') + mm + '-01');
  }
  return out;
}
function money_(milli) { return typeof milli === 'number' ? Math.round(milli) / 1000 : null; }
/** Names compared without emoji, symbols, extra spaces or capitals: "🪽 Discretionary" matches "Discretionary". */
function plainName_(s) { return String(s || '').replace(/[^A-Za-z0-9\u00C0-\u024F]+/g, ' ').trim().toLowerCase(); }
function spendable_(c) { return !c.deleted && !c.hidden && !c.internal && SKIP_GROUPS.indexOf(c.category_group_name) === -1; }

/** One past month, reduced to what the Ledger needs: age of money and spending per category. */
function ledgerMonth_(month) {
  var cache = CacheService.getScriptCache(), key = 'ym:' + ynabPlan_() + ':' + month, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var m = {};
  try { m = ynab_('/months/' + month).month || {}; }
  catch (e) { if (e.ynab !== 'ynab_not_found') throw e; }   // a month before the plan began
  var out = { age: typeof m.age_of_money === 'number' ? m.age_of_money : null, spend: {} };
  (m.categories || []).forEach(function (c) { if (spendable_(c) && c.activity) out.spend[c.id] = -money_(c.activity); });
  try { cache.put(key, JSON.stringify(out), MONTH_SECONDS); } catch (x) { /* too large to cache */ }
  return out;
}

/** Accounts, age of money, spending by category (12 months + this month so far), and the fund category. */
function ynabLedger_() {
  var cache = CacheService.getScriptCache(), key = 'ynab:' + ynabPlan_(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var months = ledgerMonths_(LEDGER_MONTHS), thisMonth = months.pop();
  var accts = (ynab_('/accounts').accounts || []).filter(function (a) { return !a.deleted && !a.closed; });
  var acct = function (a) { return { id: a.id, name: a.name, type: a.type, balance: money_(a.balance), original: a.debt_original_balance == null ? null : Math.abs(money_(a.debt_original_balance)) }; };
  var cur = ynab_('/months/' + thisMonth).month || {};
  var cats = (cur.categories || []).filter(spendable_);
  var past = months.map(ledgerMonth_);
  var want = plainName_(fundName_()), fund = null;
  (cur.categories || []).forEach(function (c) { if (!fund && !c.deleted && plainName_(c.name) === want) fund = { name: c.name, balance: money_(c.balance) }; });
  var out = {
    month: thisMonth, months: months,
    checking: accts.filter(function (a) { return a.type === 'checking'; }).map(acct),
    savings: accts.filter(function (a) { return a.type === 'savings'; }).map(acct),
    loans: accts.filter(function (a) { return LOAN_TYPES.indexOf(a.type) > -1; }).map(acct),
    age: past.map(function (p, i) { return { month: months[i], days: p.age }; }).concat([{ month: thisMonth, days: typeof cur.age_of_money === 'number' ? cur.age_of_money : null }]),
    cats: cats.map(function (c) {
      return { id: c.id, name: c.name, group: c.category_group_name || '', m: past.map(function (p) { return p.spend[c.id] || 0; }), now: -money_(c.activity || 0) };
    }),
    fundName: fundName_(), fund: fund
  };
  try { cache.put(key, JSON.stringify(out), LEDGER_SECONDS); } catch (x) { /* too large to cache */ }
  return out;
}

function queueSource_() { return sourceFor_(CONFIG.NOTION_QUEUE_DATABASE, 'NOTION_QUEUE_SOURCE'); }
function toQueue_(pg) {
  var p = pg.properties || {};
  return {
    id: pg.id, url: pg.url, title: plain_(p.Name && p.Name.title) || 'Untitled',
    cost: p.Cost && typeof p.Cost.number === 'number' ? p.Cost.number : null,
    priority: p.Priority && typeof p.Priority.number === 'number' ? p.Priority.number : null,
    note: plain_(p.Note && p.Note.rich_text), link: (p.Link && p.Link.url) || '',
    bought: day_(p.Bought), created: pg.created_time || ''
  };
}
/** Waiting items in priority order (lowest first; unranked go last, oldest first), plus the last 10 bought. */
function queueRows_() {
  var rows = queryAll_(queueSource_(), null, 3).map(toQueue_);
  var rank = function (r) { return r.priority === null ? 1e9 : r.priority; };
  return {
    items: rows.filter(function (r) { return !r.bought; }).sort(function (a, b) { return rank(a) - rank(b) || (a.created < b.created ? -1 : 1); }),
    bought: rows.filter(function (r) { return r.bought; }).sort(function (a, b) { return a.bought < b.bought ? 1 : -1; }).slice(0, 10)
  };
}

/** Everything the LEDGER screen shows. A YNAB problem and a Notion problem are reported separately. */
function ledger_() {
  var out = { ok: true, version: VERSION };
  try { out.ynab = ynabLedger_(); } catch (e) { out.ynabError = e.ynab || 'ynab_error'; out.ynabDetail = String(e.message || e); }
  try { out.queue = queueRows_(); } catch (e2) { out.queueError = e2.notion || 'notion_error'; }
  return out;
}

function queueAdd_(item) {
  var title = String(item.title || '').trim();
  if (!title || title.length > 120) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(item.cid || ''))) return { ok: false, error: 'bad_request' };
  var cost = item.cost === null || item.cost === undefined || item.cost === '' ? null : Number(item.cost);
  if (cost !== null && (!isFinite(cost) || cost < 0 || cost > 1e7)) return { ok: false, error: 'bad_request' };
  var link = String(item.link || '').trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('qcid:' + item.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var q = queueRows_(), last = q.items.reduce(function (m, r) { return Math.max(m, r.priority || 0); }, 0);
    var props = { Name: { title: rt_(title) }, Priority: { number: last + 10 } };
    if (cost !== null) props.Cost = { number: Math.round(cost * 100) / 100 };
    if (String(item.note || '').trim()) props.Note = { rich_text: rt_(String(item.note).trim().slice(0, 500)) };
    if (link) props.Link = { url: link.slice(0, 1000) };
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: queueSource_() }, properties: props });
    var out = { ok: true, version: VERSION, item: toQueue_(pg) };
    cache.put('qcid:' + item.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Set the order of waiting items: ids top to bottom. Only items in the queue can be touched. Safe to repeat. */
function queueOrder_(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var q = queueRows_(), byId = {};
    q.items.forEach(function (r) { byId[r.id] = r; });
    if (ids.some(function (id) { return !byId[id]; })) return { ok: false, error: 'not_writable' };
    ids.forEach(function (id, i) {
      var want = (i + 1) * 10;
      if (byId[id].priority !== want) notion_('patch', '/pages/' + id, { properties: { Priority: { number: want } } });
    });
    return { ok: true, version: VERSION, queue: queueRows_() };
  } finally {
    lock.releaseLock();
  }
}

/** Mark an item bought on a day, or put it back in the queue (day null). */
function queueBought_(id, day) {
  if (day !== null && !YMD.test(String(day || ''))) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var q = queueRows_();
    if (!q.items.concat(q.bought).some(function (r) { return r.id === id; })) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + id, { properties: { Bought: { date: day ? { start: day } : null } } });
    return { ok: true, version: VERSION, queue: queueRows_() };
  } finally {
    lock.releaseLock();
  }
}

function ledgerStatus_() {
  var out = {};
  if (!ynabToken_()) out.ynab = 'OFF. Add YNAB_TOKEN in Script Properties to turn on the Ledger';
  else {
    try {
      CacheService.getScriptCache().remove('ynab:' + ynabPlan_());
      var y = ynabLedger_();
      out.ynab = 'OK. ' + y.checking.length + ' checking, ' + y.savings.length + ' savings, ' + y.loans.length + ' loan accounts. Fund category "' + y.fundName + '": ' + (y.fund ? 'found' : 'NOT FOUND (create it in YNAB, or set LEDGER_FUND_CATEGORY)');
    } catch (e) {
      out.ynab = 'PROBLEM: ' + (e.ynab || 'ynab_error') + '. ' + e.message;
      if (e.ynab === 'ynab_not_found') {
        try {
          out.ynab += '. Plans this token can see (add YNAB_PLAN_ID with the right ID): ' + (ynabPlans_().map(function (b) { return b.name + ' -> ' + b.id; }).join(' | ') || 'none');
        } catch (x) { /* listing failed too */ }
      }
    }
  }
  try { var q = queueRows_(); out.queue = 'OK (' + q.items.length + ' waiting)'; }
  catch (e2) { out.queue = 'NOT READY: ' + (e2.notion || 'notion_error') + (e2.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to the Replicator Queue (... > Connections)' : ''); }
  return out;
}

// ---- Captain's Log ---------------------------------------------------------
// One page per day in the Captain's Log database; the entry is the page body,
// one paragraph block per paragraph. Every request needs the 6-digit PIN in
// Script Property LOG_PIN (bridge 1.17: a code word and four digits, see logPin_).
// Nothing here is cached with its text, and Ask has no
// way in: the log is not in its snapshot and it has no tool that reads it.
var LOG_FAIL_LIMIT = 5, LOG_LOCK_SECONDS = 900, LOG_MAX_CHARS = 120000;
var LOG_TEXT_BLOCKS = ['paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'heading_1', 'heading_2', 'heading_3', 'to_do'];
var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** LOG_PIN is either six digits or, like a Starfleet authorization, a Greek code word and
    four digits: "OMEGA-1234", "omega 1234" or "Ω1234" all read as OMEGA-1234. The panel
    offers these six words; anything else isn't a valid PIN. */
var LOG_WORDS = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'THETA', 'OMEGA'];
var LOG_GLYPHS = { 'Α': 'ALPHA', 'Β': 'BETA', 'Γ': 'GAMMA', 'Δ': 'DELTA', 'Θ': 'THETA', 'Ω': 'OMEGA' };
function logCode_(raw) {
  var m = String(raw == null ? '' : raw).trim().toUpperCase().match(/^([A-Z]+|[ΑΒΓΔΘΩ])[\s\-]*(\d{4})$/);
  if (!m) return '';
  var word = LOG_GLYPHS[m[1]] || m[1];
  return LOG_WORDS.indexOf(word) > -1 ? word + '-' + m[2] : '';
}
function logPin_() {
  var p = String(PropertiesService.getScriptProperties().getProperty('LOG_PIN') || '').trim();
  return /^\d{6}$/.test(p) ? p : logCode_(p);
}
function logSource_() { return sourceFor_(CONFIG.NOTION_LOG_DATABASE, 'NOTION_LOG_SOURCE'); }
/** The list of written days is kept for 6 hours and updated in place when a day is added,
    so opening the log rarely has to read all of Notion. setup() clears it. */
function logDatesAdd_(days) {
  var cache = CacheService.getScriptCache(), hit = cache.get('logdates');
  if (!hit) return;
  var seen = {}; JSON.parse(hit).concat(days).forEach(function (d) { seen[d] = true; });
  try { cache.put('logdates', JSON.stringify(Object.keys(seen).sort()), 21600); } catch (x) { cache.remove('logdates'); }
}

/** PIN check with a lockout. Compares every character so timing says nothing. Five misses
    lock it for 15 minutes; each lockout in a row doubles that (up to a day), since a code
    word and four digits has fewer combinations than six digits. A right answer resets it. */
function logGate_(pin) {
  var want = logPin_();
  if (!want) return { ok: false, error: 'log_pin_not_set' };
  var props = PropertiesService.getScriptProperties(), until = Number(props.getProperty('LOG_LOCK_UNTIL') || 0);
  if (Date.now() < until) return { ok: false, error: 'log_locked', until: until };
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('logfail') || 0);
  if (fails >= LOG_FAIL_LIMIT) return { ok: false, error: 'log_locked' };
  var given = /^\d{6}$/.test(want) ? String(pin == null ? '' : pin) : logCode_(pin) || String(pin == null ? '' : pin);
  var diff = given.length === want.length ? 0 : 1;
  for (var i = 0; i < want.length; i++) diff |= (given.charCodeAt(i) || 0) ^ want.charCodeAt(i);
  if (diff) {
    fails++;
    if (fails >= LOG_FAIL_LIMIT) {
      var strikes = Number(props.getProperty('LOG_STRIKES') || 0), secs = Math.min(86400, LOG_LOCK_SECONDS * Math.pow(2, strikes));
      until = Date.now() + secs * 1000;
      props.setProperty('LOG_LOCK_UNTIL', String(until)); props.setProperty('LOG_STRIKES', String(strikes + 1));
      cache.remove('logfail');
      return { ok: false, error: 'log_locked', until: until, left: 0 };
    }
    cache.put('logfail', String(fails), LOG_LOCK_SECONDS);
    return { ok: false, error: 'bad_pin', left: LOG_FAIL_LIMIT - fails };
  }
  if (fails) cache.remove('logfail');
  if (props.getProperty('LOG_STRIKES')) { props.deleteProperty('LOG_STRIKES'); props.deleteProperty('LOG_LOCK_UNTIL'); }
  return null;
}

function logAction_(body) {
  var shut = logGate_(body.pin);
  if (shut) return shut;
  if (body.action === 'logunlock' || body.action === 'logdates') return logDates_();
  if (body.action === 'logday') return logDay_(String(body.date || ''));
  if (body.action === 'logsave') return logSave_(String(body.date || ''), body.text);
  if (body.action === 'logimport') return logImport_(body.entries);
  if (body.action === 'logsearch') return logSearch_(body.q, !(body.whole === '0' || body.whole === 0 || body.whole === false));
  if (body.action === 'logindex') return logIndex_(body.run ? LOG_INDEX_MS : 0);
  return { ok: false, error: 'unknown_action' };
}

/** "Wednesday, October 7, 2026" for a yyyy-mm-dd. */
function longDay_(ymd) {
  var d = new Date(ymd + 'T12:00:00Z');
  return WEEKDAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}
function realDay_(ymd) { var d = YMD.test(ymd) ? new Date(ymd + 'T12:00:00Z') : null; return !!d && !isNaN(d) && d.toISOString().slice(0, 10) === ymd; }

/** Text into paragraphs: blank lines separate them, single line breaks stay inside. */
function logParas_(text) {
  return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
    .map(function (p) { return p.replace(/^\n+|\s+$/g, ''); }).filter(function (p) { return p.length; });
}
function logRich_(text) {
  var out = [];
  for (var i = 0; i < text.length && out.length < 100; i += 2000) out.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return out;
}
function logBlock_(p) { return { object: 'block', type: 'paragraph', paragraph: { rich_text: logRich_(p) } }; }

/** Notion asks callers to slow down now and then; a log save waits and tries again. */
function logNotion_(method, path, payload) {
  for (var i = 0; ; i++) {
    try { return notion_(method, path, payload); } catch (e) {
      if (e.notion !== 'notion_busy' || i >= 3) throw e;
      Utilities.sleep(800 * (i + 1));
    }
  }
}

function logFind_(ds, ymd) { return queryAll_(ds, { property: 'Date', date: { equals: ymd } }, 1)[0] || null; }

/** Every day that has an entry (no text), for the calendar. */
function logDates_() {
  var cache = CacheService.getScriptCache(), key = 'logdates', hit = cache.get(key);
  if (hit) return { ok: true, version: VERSION, dates: JSON.parse(hit) };
  var seen = {};
  queryAll_(logSource_(), null, 40, [{ property: 'Date', direction: 'ascending' }]).forEach(function (pg) {
    var d = day_((pg.properties || {}).Date); if (d) seen[d] = true;
  });
  var dates = Object.keys(seen).sort();
  try { cache.put(key, JSON.stringify(dates), 21600); } catch (x) { /* too large to cache */ }
  return { ok: true, version: VERSION, dates: dates };
}

/** A page's body as blocks we can read back as text. */
function logBlocks_(pageId) {
  var out = [], cursor = null;
  for (var i = 0; i < 20; i++) {
    var r = notion_('get', '/blocks/' + pageId + '/children?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
    (r.results || []).forEach(function (b) {
      var t = b.type, inner = b[t] || {}, txt = LOG_TEXT_BLOCKS.indexOf(t) > -1 ? plain_(inner.rich_text) : null;
      if (txt !== null && t === 'bulleted_list_item') txt = '- ' + txt;
      if (txt !== null && t === 'to_do') txt = (inner.checked ? '[x] ' : '[ ] ') + txt;
      out.push({ id: b.id, type: t, text: txt, kids: !!b.has_children });
    });
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

function logBlocksText_(blocks) { return blocks.filter(function (b) { return b.text !== null; }).map(function (b) { return b.text; }).join('\n\n'); }

/** One day's entry. other = the page also holds things the LOG can't show (images, tables); edit those in Notion. */
function logDay_(ymd) {
  if (!realDay_(ymd)) return { ok: false, error: 'bad_request' };
  var pg = logFind_(logSource_(), ymd);
  if (!pg) return { ok: true, version: VERSION, date: ymd, entry: null };
  var blocks = logBlocks_(pg.id);
  var other = blocks.some(function (b) { return b.text === null || b.kids; });
  var text = logBlocksText_(blocks);
  return { ok: true, version: VERSION, date: ymd, entry: { id: pg.id, url: pg.url, text: text, saved: pg.last_edited_time || null, other: other } };
}

/** Create or update one day's entry. Unchanged paragraphs are left alone. Safe to repeat. */
function logSave_(ymd, text) {
  if (!realDay_(ymd) || typeof text !== 'string') return { ok: false, error: 'bad_request' };
  if (text.length > LOG_MAX_CHARS) return { ok: false, error: 'too_long' };
  var paras = logParas_(text);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ds = logSource_(), pg = logFind_(ds, ymd), created = false;
    if (!pg) {
      if (!paras.length) return { ok: true, version: VERSION, date: ymd, saved: null, created: false };
      pg = logNotion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds },
        properties: logSearchProps_({ Name: { title: rt_(longDay_(ymd)) }, Date: { date: { start: ymd } }, Source: { select: { name: 'Bridge' } } }, paras),
        children: paras.slice(0, 100).map(logBlock_) });
      created = true;
      paras = paras.slice(100);
      if (paras.length) logAppend_(pg.id, paras);
    } else {
      var old = logBlocks_(pg.id);
      if (old.some(function (b) { return b.text === null || b.kids; })) return { ok: false, error: 'log_edit_in_notion' };
      var k = 0;
      while (k < old.length && k < paras.length && old[k].type === 'paragraph' && old[k].text === paras[k]) k++;
      var j = k;
      while (j < old.length && j < paras.length && old[j].type === 'paragraph') {
        logNotion_('patch', '/blocks/' + old[j].id, { paragraph: { rich_text: logRich_(paras[j]) } });
        j++;
      }
      for (var x = j; x < old.length; x++) logNotion_('delete', '/blocks/' + old[x].id);
      if (j < paras.length) logAppend_(pg.id, paras.slice(j));
      if (logSearchReady_()) logNotion_('patch', '/pages/' + pg.id, { properties: logSearchProps_({}, paras) });
    }
    if (created) logDatesAdd_([ymd]);
    return { ok: true, version: VERSION, date: ymd, created: created, saved: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}
function logAppend_(pageId, paras) {
  for (var i = 0; i < paras.length; i += 100) logNotion_('patch', '/blocks/' + pageId + '/children', { children: paras.slice(i, i + 100).map(logBlock_) });
}

/** Bring in old entries, up to 10 per request. Days that already have a page are skipped, so a resent batch adds nothing twice. */
function logImport_(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10) return { ok: false, error: 'bad_request' };
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i] || {};
    if (!realDay_(String(e.date || '')) || typeof e.text !== 'string' || e.text.length > LOG_MAX_CHARS) return { ok: false, error: 'bad_request' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ds = logSource_(), sorted = entries.map(function (e) { return e.date; }).sort(), have = {};
    queryAll_(ds, { and: [{ property: 'Date', date: { on_or_after: sorted[0] } }, { property: 'Date', date: { on_or_before: sorted[sorted.length - 1] } }] }, 2)
      .forEach(function (pg) { var d = day_((pg.properties || {}).Date); if (d) have[d] = true; });
    var created = [], skipped = [];
    entries.forEach(function (e) {
      var paras = logParas_(e.text);
      if (have[e.date] || !paras.length) { skipped.push(e.date); return; }
      var pg = logNotion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds },
        properties: logSearchProps_({ Name: { title: rt_(longDay_(e.date)) }, Date: { date: { start: e.date } }, Source: { select: { name: 'Diary import' } } }, paras),
        children: paras.slice(0, 100).map(logBlock_) });
      if (paras.length > 100) logAppend_(pg.id, paras.slice(100));
      have[e.date] = true;
      created.push(e.date);
    });
    if (created.length) logDatesAdd_(created);
    return { ok: true, version: VERSION, created: created, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function logStatus_() {
  CacheService.getScriptCache().remove('logdates');
  var raw = String(PropertiesService.getScriptProperties().getProperty('LOG_PIN') || '').trim(), code = logPin_();
  var pin = code ? (code.indexOf('-') > -1 ? 'Authorization code set (' + code.split('-')[0] + ' and four digits)' : 'PIN set (six digits)')
    : raw ? 'LOG_PIN NOT VALID: use a code word (' + LOG_WORDS.join(', ') + ') and four digits, like OMEGA-0000, or six digits'
    : 'NO PIN: add LOG_PIN in Script Properties (a code word and four digits, like OMEGA-0000)';
  try { var n = logDates_().dates.length; return 'OK (' + n + ' days written). ' + pin; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? ". Connect the TimothyOS integration to the Captain's Log (... > Connections)" : '') + '. ' + pin; }
}

// ---- Captain's Log search (bridge 1.16) --------------------------------------
// Notion can't search inside page bodies, and reading every body would cost a call
// per day. So each entry's text is also kept in its page's "Search Text" field:
// saves and imports write it (on one line), logindex fills it for older entries (newest first),
// and one query then finds every entry holding a word. Same PIN as the log, no
// cache, and Ask still has no way in. setup() adds the field (with Timothy's OK).
var LOG_SEARCH_PROP = 'Search Text', LOG_INDEX_MS = 20000, LOG_EMPTY = '\u00b7', LOG_SEARCH_PAGES = 20;
/** One line, single spaces: a phrase matches across line and paragraph breaks. */
function logFlat_(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function logSearchReady_() { return PropertiesService.getScriptProperties().getProperty('LOG_SEARCH_READY') === '1'; }
/** Adds Search Text to a page's properties once the field exists. */
function logSearchProps_(props, paras) {
  if (!logSearchReady_()) return props;
  props[LOG_SEARCH_PROP] = { rich_text: logRich_(logFlat_(paras.join(' ')) || LOG_EMPTY) };
  return props;
}
/** Entries whose Search Text is still empty (up to maxPages x 100). */
function logUnindexed_(maxPages) {
  var f = { property: LOG_SEARCH_PROP, rich_text: { is_empty: true } };
  return queryAll_(logSource_(), f, maxPages, [{ property: 'Date', direction: 'descending' }]);
}
/** Fill Search Text for older entries for up to budget ms; budget 0 only counts what's left. */
function logIndex_(budget) {
  if (!logSearchReady_()) return { ok: false, error: 'log_search_not_ready' };
  if (!budget) return { ok: true, version: VERSION, did: 0, left: logUnindexed_(40).length };
  var t0 = Date.now(), todo = logUnindexed_(1), did = 0, busy = false, lock = LockService.getScriptLock();
  for (var i = 0; i < todo.length && Date.now() - t0 < budget; i++) {
    lock.waitLock(20000);   // a save in progress finishes first, so its fresh text is never overwritten
    try {
      var text = logFlat_(logBlocksText_(logBlocks_(todo[i].id))), pr = {};
      pr[LOG_SEARCH_PROP] = { rich_text: logRich_(text || LOG_EMPTY) };
      logNotion_('patch', '/pages/' + todo[i].id, { properties: pr });
      did++;
    } catch (e) {
      if (e.notion !== 'notion_busy') throw e;
      busy = true; break;
    } finally { lock.releaseLock(); }
  }
  var left = todo.length - did;
  if (todo.length === 100 && left < 100) left = logUnindexed_(40).length;   // there may be more beyond the first hundred
  return { ok: true, version: VERSION, did: did, left: left, busy: busy };
}
/** Run from the script editor to index older entries in one go (about five minutes per run). */
function buildLogSearch() {
  var r = logIndex_(300000);
  console.log(r.ok ? 'Indexed ' + r.did + ' entries. ' + (r.left ? r.left + ' left: run buildLogSearch again.' : 'Every entry is searchable.') : r.error);
}
function logSearchRe_(q, whole) {
  var body = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return whole ? new RegExp('(?<![\\p{L}\\p{N}_])' + body + '(?![\\p{L}\\p{N}_])', 'giu') : new RegExp(body, 'giu');
}
/** A few words either side of a match, cut at word edges, as [text, match, text, match, ..., text]. */
function logSnip_(text, at, len, re) {
  var a = Math.max(0, at - 70), b = Math.min(text.length, at + len + 90);
  var win = text.slice(a, b), lead = '', tail = '';
  if (a > 0) { var cut = win.indexOf(' '); if (cut > -1 && cut < at - a) { win = win.slice(cut + 1); a += cut + 1; } lead = '…'; }
  if (b < text.length) { var back = win.lastIndexOf(' '); if (back > at - a + len) { win = win.slice(0, back); b = a + back; } tail = '…'; }
  var parts = [], last = 0, m, r = new RegExp(re.source, re.flags);
  while ((m = r.exec(win))) { parts.push(win.slice(last, m.index), m[0]); last = m.index + m[0].length; if (!m[0].length) r.lastIndex++; }
  parts.push(win.slice(last));
  parts[0] = lead + parts[0]; parts[parts.length - 1] += tail;
  return { parts: parts, end: b };
}
/** Every entry holding a word or phrase (case ignored), newest first, with where it appears. */
function logSearch_(q, whole) {
  if (!logSearchReady_()) return { ok: false, error: 'log_search_not_ready' };
  q = String(q == null ? '' : q).replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 80) return { ok: false, error: 'bad_request' };
  // Notion narrows it down; the case variants are in case its match minds case. The exact rule is applied here.
  var cap = q.charAt(0).toUpperCase() + q.slice(1), seen = {}, ors = [];
  var title = q.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, c) { return a + c.toUpperCase(); });
  [q, q.toLowerCase(), q.toUpperCase(), cap, q.charAt(0).toUpperCase() + q.slice(1).toLowerCase(), title].forEach(function (v) {
    if (!seen[v]) { seen[v] = true; ors.push({ property: LOG_SEARCH_PROP, rich_text: { contains: v } }); }
  });
  var pages = queryAll_(logSource_(), ors.length === 1 ? ors[0] : { or: ors }, LOG_SEARCH_PAGES, [{ property: 'Date', direction: 'descending' }]);
  var re = logSearchRe_(q, whole), entries = [], mentions = 0;
  pages.forEach(function (pg) {
    var d = day_((pg.properties || {}).Date), text = plain_(((pg.properties || {})[LOG_SEARCH_PROP] || {}).rich_text);
    if (!d || !text) return;
    var m, count = 0, snips = [], shown = 0;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      count++;
      if (snips.length < 2 && m.index >= shown) { var sn = logSnip_(text, m.index, m[0].length, re); snips.push(sn.parts); shown = sn.end; }
      if (!m[0].length) re.lastIndex++;
    }
    if (!count) return;
    mentions += count;
    entries.push({ date: d, count: count, snips: snips });
  });
  var left = logUnindexed_(1).length;
  return { ok: true, version: VERSION, q: q, whole: whole, entries: entries, mentions: mentions, left: left, more: pages.length >= LOG_SEARCH_PAGES * 100 };
}
/** setup(): add the Search Text field to the Captain's Log if it isn't there, then say how much is left to index. */
function logSearchSetup_() {
  try {
    var ds = logSource_(), src = notion_('get', '/data_sources/' + ds), have = src.properties && src.properties[LOG_SEARCH_PROP];
    if (have && have.type !== 'rich_text') return 'PROBLEM: the Log has a "' + LOG_SEARCH_PROP + '" field that isn\'t Text. Rename it in Notion, then run setup again';
    if (!have) { var add = {}; add[LOG_SEARCH_PROP] = { type: 'rich_text', rich_text: {} }; notion_('patch', '/data_sources/' + ds, { properties: add }); }
    PropertiesService.getScriptProperties().setProperty('LOG_SEARCH_READY', '1');
    var left = logUnindexed_(40).length;
    return 'OK' + (have ? '' : ' (added the "' + LOG_SEARCH_PROP + '" field)') + (left ? '. ' + left + ' older entries to index: unlock LOG on the iPad and it fills in, or run buildLogSearch here' : '. Every entry is searchable');
  } catch (e) {
    return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? ". Connect the TimothyOS integration to the Captain's Log (... > Connections)" : '');
  }
}

// ---- Habits ----------------------------------------------------------------
// One page per day in the Habits database: Meditated and Evening Walk (checkboxes),
// Water (L) in half-litre steps (a 1 L bottle), Debit Card (Did Not Swipe / Swiped).
// The app sends the whole day at once, so a repeat is harmless.
var HABIT_CARD = { kept: 'Did Not Swipe', swiped: 'Swiped' }, HABIT_MAX_DAYS = 400;
function habitsSource_() { return sourceFor_(CONFIG.NOTION_HABITS_DATABASE, 'NOTION_HABITS_SOURCE'); }
function toHabit_(pg) {
  var p = pg.properties || {}, w = p['Water (L)'], card = sel_(p['Debit Card']);
  return {
    id: pg.id, date: day_(p.Date),
    med: !!(p.Meditated && p.Meditated.checkbox), walk: !!(p['Evening Walk'] && p['Evening Walk'].checkbox),
    water: w && typeof w.number === 'number' ? w.number : null,
    card: card === HABIT_CARD.kept ? 'kept' : card === HABIT_CARD.swiped ? 'swiped' : null
  };
}
function habitsGen_() { return CacheService.getScriptCache().get('hgen') || '0'; }
function habitsBump_() { CacheService.getScriptCache().put('hgen', Utilities.getUuid().slice(0, 8), 21600); }
/** Recorded days from `from` to `to` (yyyy-mm-dd, inclusive, at most 400 days). */
function habits_(from, to) {
  from = String(from || ''); to = String(to || '');
  if (!realDay_(from) || !realDay_(to) || to < from || (new Date(to) - new Date(from)) / 86400000 > HABIT_MAX_DAYS) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), key = 'habits:' + habitsGen_() + ':' + from + ':' + to, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(habitsSource_(), { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] }, 5)
    .map(toHabit_).filter(function (h) { return h.date; });
  var out = { ok: true, version: VERSION, from: from, to: to, days: rows };
  try { cache.put(key, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
/** One day's habits, whole: creates the day's page if there is none, otherwise sets every field. */
function habitSet_(d) {
  d = d || {};
  var date = String(d.date || '');
  if (!realDay_(date)) return { ok: false, error: 'bad_request' };
  var water = d.water === null || d.water === undefined || d.water === '' ? null : Number(d.water);
  if (water !== null && (!isFinite(water) || water < 0 || water > 12 || Math.round(water * 2) !== water * 2)) return { ok: false, error: 'bad_request' };
  if (d.card !== null && d.card !== undefined && !HABIT_CARD[d.card]) return { ok: false, error: 'bad_request' };
  var props = {
    Meditated: { checkbox: d.med === true }, 'Evening Walk': { checkbox: d.walk === true },
    'Water (L)': { number: water }, 'Debit Card': { select: d.card ? { name: HABIT_CARD[d.card] } : null }
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = habitsSource_(), found = queryAll_(ds, { property: 'Date', date: { equals: date } }, 1)[0], pg;
    if (found) pg = notion_('patch', '/pages/' + found.id, { properties: props });
    else {
      props.Name = { title: rt_(longDay_(date)) };
      props.Date = { date: { start: date } };
      pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    habitsBump_();
    return { ok: true, version: VERSION, day: toHabit_(pg) };
  } finally {
    lock.releaseLock();
  }
}
function habitsStatus_() {
  try { var n = queryAll_(habitsSource_(), null, 1).length; return 'OK (' + (n >= 100 ? '100+' : n) + ' days recorded)'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Habits (... > Connections)' : ''); }
}

// ---- Library -----------------------------------------------------------------
// One page per book. The app finds books on Open Library itself (titles, authors,
// cover links); the bridge only keeps the shelf in Notion.
var BOOK_STATUS = { want: 'Want to Read', reading: 'Reading', read: 'Read', aside: 'Set Aside' };
function librarySource_() { return sourceFor_(CONFIG.NOTION_LIBRARY_DATABASE, 'NOTION_LIBRARY_SOURCE'); }
function toBook_(pg) {
  var p = pg.properties || {}, st = sel_(p.Status), status = 'want';
  Object.keys(BOOK_STATUS).forEach(function (k) { if (BOOK_STATUS[k] === st) status = k; });
  var num = function (x) { return x && typeof x.number === 'number' ? x.number : null; };
  return {
    id: pg.id, url: pg.url, title: plain_(p.Title && p.Title.title) || 'Untitled', author: plain_(p.Author && p.Author.rich_text),
    status: status, started: day_(p.Started), finished: day_(p.Finished), rating: num(p.Rating), notes: plain_(p.Notes && p.Notes.rich_text),
    cover: (p.Cover && p.Cover.url) || '', ol: (p['Open Library'] && p['Open Library'].url) || '', year: num(p.Published), created: pg.created_time || ''
  };
}
function libraryGen_() { return CacheService.getScriptCache().get('lgen') || '0'; }
function library_() {
  var cache = CacheService.getScriptCache(), key = 'library:' + libraryGen_(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = { ok: true, version: VERSION, books: queryAll_(librarySource_(), null, 10).map(toBook_) };
  try { cache.put(key, JSON.stringify(out), 300); } catch (x) { /* too large to cache */ }
  return out;
}
var OL_COVER = /^https:\/\/covers\.openlibrary\.org\/[\w\/.-]+$/, OL_PAGE = /^https:\/\/openlibrary\.org\/[\w\/.-]+$/;
/** Add a book (with cid) or change one (with id). Only the fields sent are written. */
function bookSave_(b) {
  b = b || {};
  var props = {}, has = function (k) { return Object.prototype.hasOwnProperty.call(b, k); };
  if (has('title') || !b.id) {
    var title = String(b.title || '').trim();
    if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
    props.Title = { title: rt_(title) };
  }
  if (has('author')) { var au = String(b.author || '').trim(); if (au.length > 200) return { ok: false, error: 'bad_request' }; props.Author = { rich_text: au ? rt_(au) : [] }; }
  if (has('status') || !b.id) { if (!BOOK_STATUS[b.status || 'want']) return { ok: false, error: 'bad_request' }; props.Status = { select: { name: BOOK_STATUS[b.status || 'want'] } }; }
  var dates = { started: 'Started', finished: 'Finished' }, bad = false;
  Object.keys(dates).forEach(function (k) {
    if (!has(k)) return;
    if (b[k] !== null && !realDay_(String(b[k]))) bad = true;
    props[dates[k]] = { date: b[k] ? { start: String(b[k]) } : null };
  });
  if (has('rating')) { var r = b.rating === null ? null : Number(b.rating); if (r !== null && !(r >= 1 && r <= 5 && Math.round(r) === r)) bad = true; props.Rating = { number: r }; }
  if (has('notes')) { var nt = String(b.notes || ''); if (nt.length > 4000) bad = true; props.Notes = { rich_text: nt.trim() ? rt_(nt.trim()) : [] }; }
  if (has('cover')) { var cv = String(b.cover || ''); if (cv && !OL_COVER.test(cv)) bad = true; props.Cover = { url: cv || null }; }
  if (has('ol')) { var ol = String(b.ol || ''); if (ol && !OL_PAGE.test(ol)) bad = true; props['Open Library'] = { url: ol || null }; }
  if (has('year')) { var y = b.year === null ? null : Number(b.year); if (y !== null && !(y > 0 && y < 3000 && Math.round(y) === y)) bad = true; props.Published = { number: y }; }
  if (bad) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = librarySource_(), cache = CacheService.getScriptCache(), pg;
    if (b.id) {
      var cur = notion_('get', '/pages/' + String(b.id));
      if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== ds.replace(/-/g, '')) return { ok: false, error: 'not_writable' };
      pg = notion_('patch', '/pages/' + cur.id, { properties: props });
    } else {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(b.cid || ''))) return { ok: false, error: 'bad_request' };
      var seen = cache.get('bcid:' + b.cid);
      if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
      pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    cache.put('lgen', Utilities.getUuid().slice(0, 8), 21600);
    var out = { ok: true, version: VERSION, book: toBook_(pg) };
    if (!b.id) cache.put('bcid:' + b.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}
/** Take a book off the shelf (to Notion's trash, where it can be restored). */
function bookRemove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = librarySource_(), cur = notion_('get', '/pages/' + String(id || ''));
    if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== ds.replace(/-/g, '')) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + cur.id, { in_trash: true });
    CacheService.getScriptCache().put('lgen', Utilities.getUuid().slice(0, 8), 21600);
    return { ok: true, version: VERSION, removed: cur.id };
  } finally {
    lock.releaseLock();
  }
}
function libraryStatus_() {
  try { var n = library_().books.length; return 'OK (' + n + (n === 1 ? ' book)' : ' books)'); }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Library (... > Connections)' : ''); }
}

// ---- Ask Claude ---------------------------------------------------------------
// The in-app assistant. Claude reads through the same functions the app uses and
// never changes anything itself: every change comes back as a proposal that
// Timothy confirms in the app. No web, no work-calendar writes, no code.
// The API key lives in Script Properties (ANTHROPIC_API_KEY), never in this file.
var AI = {
  FAST: 'claude-sonnet-5-5',   // everyday questions (Script Property AI_FAST_MODEL = claude-haiku-5-5 or claude-haiku-4-5 steps down)
  FAST_EFFORT: 'low',          // quick, plain answers; Sonnet 5.5 recalibrated its levels, low suits chat
  DEEP: 'claude-opus-5-5',     // THINK HARDER
  DEEP_EFFORT: 'medium',       // Opus 5.5's own default
  SUMMARY: 'claude-sonnet-5-5',// weekly summaries and patterns
  BUDGET_USD: 8,               // monthly pause and reminder; CONTINUE carries on until the Claude Console stops it. Script Property AI_BUDGET_USD
  CAP_USD: 10,                 // the real ceiling is the Console (prepaid credit, spend limit); shown for reference. Script Property AI_CAP_USD
  MAX_STEPS: 6                 // model calls per question, at most
};
// US$ per million tokens: input, output, cache write (5 min), cache read. Matched by model family, longest first,
// so a dated or regional model name is priced like its family rather than at the catch-all rate.
var AI_PRICES = [
  ['claude-opus-5-5', [4, 20, 5, 0.20]],
  ['claude-opus-5', [5, 25, 6.25, 0.50]],
  ['claude-opus-4', [5, 25, 6.25, 0.50]],
  ['claude-sonnet-5-5', [2, 10, 2.5, 0.20]],
  ['claude-sonnet-5', [2, 10, 2.5, 0.20]],
  ['claude-sonnet-4', [3, 15, 3.75, 0.30]],
  ['claude-haiku-5-5', [0.10, 0.50, 0.125, 0.01]],   // prompts up to 100K tokens; Ask stays far below that
  ['claude-haiku-4-5', [1, 5, 1.25, 0.10]]
];
var AI_PRICE_OTHER = [10, 50, 12.5, 1];   // a model not listed is counted high, and marked in the log
function aiPrice_(model) {
  var m = String(model || '').replace(/^[a-z]+\./, '');
  for (var i = 0; i < AI_PRICES.length; i++) if (m.indexOf(AI_PRICES[i][0]) === 0) return AI_PRICES[i][1];
  return null;
}

var AI_RULES = [
  "You are the ship's computer inside TimothyOS, Timothy's personal life dashboard. Address him as Captain.",
  "Style: calm, brief, concrete. Plain text: short paragraphs or simple lines starting with '- '. No headings, no tables, no emoji, no em dashes. Lead with the answer.",
  "Facts: use only the snapshot below and your tools. Never invent events, tasks, dates or numbers. If something isn't in the data, say so. Times are local.",
  "You can read his Work and Personal calendars (and his farm calendar, area 'farm', when the snapshot lists it), his Master Task List, Key Dates and Weekly Reviews. You cannot browse the web, read email, or change the app itself. Notion pages outside those databases are private and out of reach.",
  "Changes: you never change anything directly. To add a task, pick or unpick a priority, set a task's status, add a key date, add an event or reminder to the Personal calendar (or the farm calendar for farm and bee work, when it's linked), or draft a weekly review, call the matching propose_ tool. Timothy confirms each one with a tap. After proposing, say in one line what you proposed.",
  "The Work calendar is read-only: never propose anything for it. A reminder is a short Personal calendar event at the reminder time; his devices alert him.",
  "Use exact task ids from the snapshot or get_tasks. Use Life Area, priority and key date type names exactly as listed in the snapshot."
].join('\n');

function aiKey_() { return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'); }
function aiBudget_() { var b = Number(PropertiesService.getScriptProperties().getProperty('AI_BUDGET_USD')); return isFinite(b) && b > 0 ? b : AI.BUDGET_USD; }
function aiCap_() { var b = Number(PropertiesService.getScriptProperties().getProperty('AI_CAP_USD')); return isFinite(b) && b > 0 ? b : AI.CAP_USD; }
function aiMonth_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'); }
/** This month's spend, kept in Script Properties: { month, usd, calls }. */
function aiSpend_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('AI_SPEND') || '{}'); } catch (e) { s = {}; }
  if (s.month !== aiMonth_()) s = { month: aiMonth_(), usd: 0, calls: 0 };
  var cont = PropertiesService.getScriptProperties().getProperty('AI_CONTINUE') === s.month;
  return { month: s.month, usd: Math.round((s.usd || 0) * 10000) / 10000, calls: s.calls || 0, budget: aiBudget_(), cap: aiCap_(), cont: cont };
}
/** Paused at the monthly reminder, unless Timothy chose CONTINUE this month. */
function aiPaused_(s) { return s.usd >= s.budget && !s.cont; }
/** The last 25 questions: when, which mode and model, tokens and cost. No text. */
function aiLog_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('AI_LOG') || '[]'); } catch (e) { return []; } }
function aiLogAdd_(entry) { var l = aiLog_(); l.unshift(entry); PropertiesService.getScriptProperties().setProperty('AI_LOG', JSON.stringify(l.slice(0, 25))); }
/** CONTINUE past the reminder for the rest of this month. */
function aiContinue_() { PropertiesService.getScriptProperties().setProperty('AI_CONTINUE', aiMonth_()); return { ok: true, version: VERSION, spend: aiSpend_() }; }
/** Set this month's total to the figure the Claude Console shows, so the two agree from here on. */
function aiSpendSet_(usd) {
  usd = Number(usd);
  if (!isFinite(usd) || usd < 0 || usd > 10000) return { ok: false, error: 'bad_request' };
  var s = aiSpend_();
  PropertiesService.getScriptProperties().setProperty('AI_SPEND', JSON.stringify({ month: s.month, usd: usd, calls: s.calls }));
  aiLogAdd_({ t: new Date().toISOString(), mode: 'matched', usd: Math.round(usd * 10000) / 10000 });
  return { ok: true, version: VERSION, spend: aiSpend_() };
}
/** The everyday model: Haiku 5.5 unless Script Property AI_FAST_MODEL picks Haiku 4.5. */
function aiFast_() {
  var m = String(PropertiesService.getScriptProperties().getProperty('AI_FAST_MODEL') || '').trim();
  return m === 'claude-haiku-4-5' || m === 'claude-haiku-5-5' || m === 'claude-sonnet-5-5' ? m : AI.FAST;
}
function aiCost_(model, u) {
  var p = aiPrice_(model) || AI_PRICE_OTHER;
  u = u || {};
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_creation_input_tokens || 0) * p[2] + (u.cache_read_input_tokens || 0) * p[3]) / 1e6;
}
function aiAddSpend_(usd) {
  var s = aiSpend_();
  s.usd += usd; s.calls += 1;
  PropertiesService.getScriptProperties().setProperty('AI_SPEND', JSON.stringify({ month: s.month, usd: s.usd, calls: s.calls }));
  return s;
}

/** One request to the Messages API (raw HTTP: Apps Script has no SDK). */
function claude_(payload, betas) {
  var headers = { 'x-api-key': aiKey_(), 'anthropic-version': '2023-06-01' };
  if (betas && betas.length) headers['anthropic-beta'] = betas.join(',');
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  if (code >= 300) {
    var msg = (body.error && body.error.message) || ('HTTP ' + code), e = new Error(msg);
    var details = (body.error && body.error.details) || {};
    if (code === 401 || code === 403) e.ai = 'ai_unauthorized';
    else if (/credit balance/i.test(msg)) e.ai = 'ai_no_credit';
    else if (details.error_code === 'enforced_spend_limit_reached' || /specified (workspace )?API usage limits|usage limits/i.test(msg)) e.ai = 'ai_console_limit';
    else if (code === 429 || code === 529 || code >= 500) e.ai = 'ai_busy';
    else e.ai = 'ai_error';
    throw e;
  }
  return body;
}

var AI_TOOLS = [
  { name: 'get_events', description: 'Work, Personal and (when linked) farm calendar events between two dates (inclusive, at most 62 days). Ignored booking blocks are already left out.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'yyyy-mm-dd' }, to: { type: 'string', description: 'yyyy-mm-dd' } }, required: ['from', 'to'], additionalProperties: false } },
  { name: 'get_tasks', description: "Tasks picked for a day (its priorities) and every open task in the Master Task List, with ids, status, priority, Life Area and due date.",
    input_schema: { type: 'object', properties: { day: { type: 'string', description: 'yyyy-mm-dd' } }, required: ['day'], additionalProperties: false } },
  { name: 'get_key_dates', description: 'Every key date (deadlines, windows, birthdays, anniversaries, events, reminders). Yearly ones repeat every year.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_week', description: 'One week (Monday start): tasks finished, priorities picked, and the saved weekly review if there is one.',
    input_schema: { type: 'object', properties: { week_start: { type: 'string', description: 'Monday, yyyy-mm-dd' } }, required: ['week_start'], additionalProperties: false } },
  { name: 'propose_add_task', description: 'Propose a new To Do task in the Master Task List. Optionally pick it as a priority for a day.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, life_area: { type: 'string' }, priority: { type: 'string' }, focus_day: { type: 'string', description: 'yyyy-mm-dd, to pick it for that day' } }, required: ['title'], additionalProperties: false } },
  { name: 'propose_set_focus', description: 'Propose picking an existing task as a priority for a day, or unpicking it (day "none").',
    input_schema: { type: 'object', properties: { task_id: { type: 'string' }, task_title: { type: 'string' }, day: { type: 'string', description: 'yyyy-mm-dd, or "none" to unpick' } }, required: ['task_id', 'task_title', 'day'], additionalProperties: false } },
  { name: 'propose_set_status', description: 'Propose changing a task status.',
    input_schema: { type: 'object', properties: { task_id: { type: 'string' }, task_title: { type: 'string' }, status: { type: 'string', enum: TASK_STATUSES } }, required: ['task_id', 'task_title', 'status'], additionalProperties: false } },
  { name: 'propose_add_key_date', description: 'Propose a new key date. Add an end date for a window; yearly for birthdays, anniversaries and seasons.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, start: { type: 'string', description: 'yyyy-mm-dd' }, end: { type: 'string', description: 'yyyy-mm-dd, for windows' }, life_area: { type: 'string' }, type: { type: 'string' }, yearly: { type: 'boolean' } }, required: ['title', 'start'], additionalProperties: false } },
  { name: 'propose_add_event', description: 'Propose an event or reminder on the Personal calendar, or on the farm calendar for farm and bee work when it is linked (never Work). Give a date and start time, or all_day.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, calendar: { type: 'string', enum: ['personal', 'farm'], description: 'default personal' }, date: { type: 'string', description: 'yyyy-mm-dd' }, start_time: { type: 'string', description: 'HH:MM, 24-hour' }, minutes: { type: 'integer', description: 'length, default 30' }, all_day: { type: 'boolean' } }, required: ['title', 'date'], additionalProperties: false } },
  { name: 'propose_review_draft', description: "Propose text for a week's review fields. Timothy reviews them on the Review screen before saving.",
    input_schema: { type: 'object', properties: { week_start: { type: 'string', description: 'Monday, yyyy-mm-dd' }, went_well: { type: 'string' }, drained: { type: 'string' }, next_focus: { type: 'string' }, bearing: { type: 'string' }, summary: { type: 'string' } }, required: ['week_start'], additionalProperties: false } }
];

var AREA_LABEL = { work: 'Work', personal: 'Personal', farm: 'Farm' };
function aiDay_(s) { return YMD.test(String(s || '')); }
function aiLine_(ev, tz) {
  if (ev.allDay) return ev.start + ' all day · ' + AREA_LABEL[ev.area] + ' · ' + ev.title;
  return Utilities.formatDate(new Date(ev.start), tz, 'EEE yyyy-MM-dd HH:mm') + '-' + Utilities.formatDate(new Date(ev.end), tz, 'HH:mm') + ' · ' + AREA_LABEL[ev.area] + ' · ' + ev.title;
}
function aiTaskLine_(t) {
  return '[' + t.id + '] ' + t.title + ' · ' + [t.status, t.priority, t.area, t.due ? 'due ' + t.due : '', t.focus ? 'picked ' + t.focus : ''].filter(String).join(' · ');
}

/** Run one tool call. Reads return data; propose_ tools return a proposal for the app. */
function aiTool_(name, input, ctx) {
  var tz = Session.getScriptTimeZone();
  if (name === 'get_events') {
    if (!aiDay_(input.from) || !aiDay_(input.to) || input.to < input.from) return { error: 'Dates must be yyyy-mm-dd, with to on or after from.' };
    var f = Utilities.parseDate(input.from, tz, 'yyyy-MM-dd').getTime(), t = Utilities.parseDate(addDaysYmd_(input.to, 1), tz, 'yyyy-MM-dd').getTime();
    var ev = events_(f, t);
    if (!ev.ok) return { error: 'Range too long: at most 62 days.' };
    var ign = (ctx.ignore || []).map(function (p) { return String(p).toLowerCase(); });
    var lines = ev.events.filter(function (e) { var tl = String(e.title).toLowerCase(); return !ign.some(function (p) { return p && tl.indexOf(p) > -1; }); })
      .sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); }).slice(0, 200).map(function (e) { return aiLine_(e, tz); });
    return { text: lines.length ? lines.join('\n') : 'No events in that range.' };
  }
  if (name === 'get_tasks') {
    if (!aiDay_(input.day)) return { error: 'day must be yyyy-mm-dd.' };
    var tk = tasks_(input.day);
    return { text: 'PICKED FOR ' + input.day + ':\n' + (tk.focus.map(aiTaskLine_).join('\n') || 'none') + '\nOPEN TASKS:\n' + (tk.open.slice(0, 120).map(aiTaskLine_).join('\n') || 'none') };
  }
  if (name === 'get_key_dates') {
    var kd = dates_();
    return { text: kd.dates.map(function (d) { return d.start + (d.end ? ' to ' + d.end : '') + ' · ' + d.title + ' · ' + [d.type, d.area, d.yearly ? 'yearly' : ''].filter(String).join(' · '); }).join('\n') || 'No key dates.' };
  }
  if (name === 'get_week') {
    if (!aiDay_(input.week_start)) return { error: 'week_start must be a Monday, yyyy-mm-dd.' };
    var w0 = Utilities.parseDate(input.week_start, tz, 'yyyy-MM-dd'), w1 = Utilities.parseDate(addDaysYmd_(input.week_start, 7), tz, 'yyyy-MM-dd');
    var wk = week_(input.week_start, w0.toISOString(), w1.toISOString());
    if (!wk.ok) return { error: 'Could not read that week.' };
    var r = wk.review;
    return { text: 'FINISHED:\n' + (wk.done.map(function (x) { return '- ' + x.title + ' · ' + (x.area || 'no area'); }).join('\n') || 'none') +
      '\nPICKED:\n' + (wk.picked.map(function (x) { return '- ' + x.title + ' · ' + x.status + (x.focus ? ' · for ' + x.focus : ''); }).join('\n') || 'none') +
      '\nSAVED REVIEW: ' + (r ? ['Went well: ' + r.wentWell, 'Drained me: ' + r.drained, 'Next focus: ' + r.nextFocus, 'Bearing: ' + r.bearing, 'Summary: ' + r.summary].join('\n') : 'none') };
  }
  if (name.indexOf('propose_') === 0) {
    var bad = aiCheck_(name, input);
    if (bad) return { error: bad };
    ctx.proposals.push({ kind: name.replace('propose_', ''), input: input });
    return { text: 'Shown to Timothy as proposal ' + ctx.proposals.length + '. Nothing changes until he taps CONFIRM.' };
  }
  return { error: 'Unknown tool ' + name };
}
function aiCheck_(name, i) {
  var str = function (v, max) { return typeof v === 'string' && v.trim() && v.length <= max; };
  if (name === 'propose_add_task') return !str(i.title, 200) ? 'title is required (200 characters at most).' : i.focus_day && !aiDay_(i.focus_day) ? 'focus_day must be yyyy-mm-dd.' : '';
  if (name === 'propose_set_focus') return !/^[0-9a-f-]{32,36}$/i.test(String(i.task_id || '')) ? 'Use an exact task id.' : i.day !== 'none' && !aiDay_(i.day) ? 'day must be yyyy-mm-dd, or "none" to unpick.' : '';
  if (name === 'propose_set_status') return !/^[0-9a-f-]{32,36}$/i.test(String(i.task_id || '')) ? 'Use an exact task id.' : TASK_STATUSES.indexOf(i.status) === -1 ? 'Unknown status.' : '';
  if (name === 'propose_add_key_date') return !str(i.title, 200) ? 'title is required.' : !aiDay_(i.start) ? 'start must be yyyy-mm-dd.' : i.end && (!aiDay_(i.end) || i.end < i.start) ? 'end must be yyyy-mm-dd, on or after start.' : '';
  if (name === 'propose_add_event') return !str(i.title, 200) ? 'title is required.' : i.calendar === 'farm' && !farmCalendarId_() ? 'The farm calendar is not linked yet. Use personal.' : !aiDay_(i.date) ? 'date must be yyyy-mm-dd.' : !i.all_day && !/^\d{2}:\d{2}$/.test(String(i.start_time || '')) ? 'Give start_time as HH:MM, or all_day.' : '';
  if (name === 'propose_review_draft') return !aiDay_(i.week_start) ? 'week_start must be yyyy-mm-dd.' : '';
  return '';
}

/**
 * Answer one message. body: { cid, mode: 'fast'|'deep'|'summary', messages: [{ role, text }],
 * context: snapshot text from the app, ignore: [title phrases] }.
 * Returns { reply, proposals, model, cost, spend }. Safe to repeat: replies are kept by cid for 10 minutes.
 */
function ask_(body, test) {
  if (!aiKey_()) return { ok: false, error: 'ai_not_configured' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(body.cid || ''))) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), seen = cache.get('ask:' + body.cid);
  if (seen) return JSON.parse(seen);
  var mode = body.mode === 'deep' || body.mode === 'summary' || body.mode === 'patterns' ? body.mode : 'fast';
  var turns = (Array.isArray(body.messages) ? body.messages : []).slice(-20).filter(function (m) {
    return (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim();
  }).map(function (m) { return { role: m.role, content: m.text.slice(0, 4000) }; });
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { ok: false, error: 'bad_request' };
  while (turns.length && turns[0].role !== 'user') turns.shift();

  var spend = aiSpend_();
  if (aiPaused_(spend)) return { ok: false, error: 'ai_budget', spend: spend };

  var model = test && test.model ? test.model : mode === 'fast' ? aiFast_() : mode === 'deep' ? AI.DEEP : AI.SUMMARY;
  var system = [{ type: 'text', text: AI_RULES + (mode === 'summary' ? "\nTask: write a weekly summary in 4 to 6 sentences: what the week held, what moved forward, what slipped, one observation about balance, and one suggestion for next week. Plain prose, no lists. Don't use tools." :
      mode === 'patterns' ? "\nTask: read the saved weekly reviews in the snapshot and name the patterns across them: what keeps draining him, what reliably goes well, focus areas that keep coming back or slipping, how he holds his bearing, and any trend in the numbers. 4 to 6 lines starting with '- ', each one concrete and tied to specific weeks. End with one suggestion. Don't use tools." : '') },
    { type: 'text', text: 'SNAPSHOT FROM THE APP\n' + String(body.context || 'No snapshot was sent.').slice(0, 40000) }];
  // Current models think by default and thinking counts toward max_tokens, so each cap leaves room for it.
  var payload = { model: model, max_tokens: mode === 'fast' ? 6000 : 12000, system: system, messages: turns, cache_control: { type: 'ephemeral' } };
  var effort = (test && test.effort) || (mode === 'fast' ? AI.FAST_EFFORT : mode === 'deep' ? AI.DEEP_EFFORT : 'medium');
  if (model !== 'claude-haiku-4-5') payload.output_config = { effort: effort };   // Haiku 4.5 rejects effort
  if (mode === 'fast' || mode === 'deep') payload.tools = AI_TOOLS;
  var betas = [];
  // A decline by a safety classifier is retried on a suitable model in the same call (Sonnet 5.5 and Opus 5.5; Haiku has none).
  if (/^claude-(sonnet-5-5|opus-5-5)/.test(model)) { payload.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }

  var ctx = { ignore: Array.isArray(body.ignore) ? body.ignore.slice(0, 30) : [], proposals: [] }, cost = 0, res, served = model;
  var tok = { in: 0, out: 0, cw: 0, cr: 0 }, unknown = false;
  for (var step = 0; step < AI.MAX_STEPS; step++) {
    if (step > 0 && aiPaused_(aiSpend_())) break;
    try {
      res = claude_(payload, betas);
    } catch (e) {
      if (!e.ai) throw e;
      return { ok: false, error: e.ai, detail: String(e.message).slice(0, 300), spend: aiSpend_() };
    }
    served = res.model || model;
    var u = res.usage || {};
    tok.in += u.input_tokens || 0; tok.out += u.output_tokens || 0; tok.cw += u.cache_creation_input_tokens || 0; tok.cr += u.cache_read_input_tokens || 0;
    if (!aiPrice_(served)) unknown = true;
    var c = aiCost_(served, res.usage);
    cost += c;
    spend = aiAddSpend_(c);
    payload.messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'tool_use') break;
    var results = res.content.filter(function (b) { return b.type === 'tool_use'; }).map(function (b) {
      var out;
      try { out = aiTool_(b.name, b.input || {}, ctx); } catch (err) { out = { error: (err && err.notion) ? 'Notion is unavailable right now (' + err.notion + ').' : 'That lookup failed.' }; }
      return out.error ? { type: 'tool_result', tool_use_id: b.id, content: out.error, is_error: true } : { type: 'tool_result', tool_use_id: b.id, content: out.text };
    });
    payload.messages.push({ role: 'user', content: results });
  }
  var text = (res && res.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n\n').trim();
  if (res && res.stop_reason === 'refusal') text = "That's outside what I can help with here.";
  else if (res && res.stop_reason === 'tool_use') text = (text ? text + '\n\n' : '') + "(Stopped after " + AI.MAX_STEPS + " steps. Ask again more narrowly.)";
  else if (res && res.stop_reason === 'max_tokens') text += '\n\n(Answer cut short.)';
  if (!test) aiLogAdd_({ t: new Date().toISOString(), mode: mode, model: served, steps: step + 1, in: tok.in, out: tok.out, cw: tok.cw, cr: tok.cr, usd: Math.round(cost * 100000) / 100000, unknown: unknown || undefined });
  var out = { ok: true, version: VERSION, reply: text || '(No answer.)', proposals: ctx.proposals, model: served, cost: Math.round(cost * 10000) / 10000, spend: aiSpend_() };
  if (test) { out.stop = res && res.stop_reason; out.steps = step + 1; out.costExact = cost; }
  try { cache.put('ask:' + body.cid, JSON.stringify(out), 600); } catch (x) { /* too large to cache */ }
  return out;
}
