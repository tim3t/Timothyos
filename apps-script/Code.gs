/**
 * TimothyOS bridge, v1.9
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
 *  - Ask: answers questions with Claude (key in Script Properties: ANTHROPIC_API_KEY).
 *    Claude only reads; every change it suggests waits for your tap in the app.
 *    A monthly budget pauses it (AI_BUDGET_USD, default $8).
 *    Nothing else in Notion is touched.
 *
 * The work calendar can never be written to. Nothing is ever deleted.
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
  NOTION_QUEUE_DATABASE: '6f9b8c3888f74ec18a503bd197f37c8c'
};
// ---------------------------------------------------------------------------

var VERSION = '1.9.1';
var NOTION_VERSION = '2025-09-03';
var TASK_STATUSES = ['⬜ To Do', '🔄 In Progress', '✅ Done', '🚫 Blocked'];
var TASK_PRIORITIES = ['🔴 High', '🟡 Medium', '🟢 Low'];
function capabilities_() {
  var props = PropertiesService.getScriptProperties();
  return ['read', 'create'].concat(props.getProperty('NOTION_TOKEN') ? ['tasks', 'dates', 'done', 'reviews', 'reviewlog', 'queue'] : [], props.getProperty('ANTHROPIC_API_KEY') ? ['ask'] : [], props.getProperty('YNAB_TOKEN') ? ['ledger'] : []);
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
    if (!keyMatches_(p.key)) return json_({ ok: false, error: 'unauthorized' });
    if (p.action === 'ping') return json_({ ok: true, version: VERSION, capabilities: capabilities_(), calendars: calendarStatus_(), notion: notionStatus_(), ai: aiKey_() ? aiSpend_() : null });
    if (p.action === 'aispend') return json_({ ok: true, version: VERSION, ai: aiKey_() ? aiSpend_() : null });
    if (p.action === 'events') return json_(events_(Number(p.from), Number(p.to)));
    if (p.action === 'tasks') return json_(tasks_(String(p.day || '')));
    if (p.action === 'dates') return json_(dates_());
    if (p.action === 'done') return json_(done_(p.days));
    if (p.action === 'week') return json_(week_(String(p.week || ''), String(p.from || ''), String(p.to || '')));
    if (p.action === 'reviews') return json_(reviews_(p.limit));
    if (p.action === 'ledger') return json_(ledger_());
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    if (err && err.notion) return json_({ ok: false, error: err.notion, detail: err.message });
    return json_({ ok: false, error: 'server_error', detail: String((err && err.message) || err) });
  }
}

/** Write requests (Capture). The body is JSON: { key, action: "create", item }. */
function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    if (!keyMatches_(body.key)) return json_({ ok: false, error: 'unauthorized' });
    if (body.action === 'create') return json_(create_(body.item || {}));
    if (body.action === 'focus') return json_(setFocus_(body.id, body.day));
    if (body.action === 'status') return json_(setStatus_(body.id, body.status));
    if (body.action === 'addtask') return json_(addTask_(body.task || {}));
    if (body.action === 'adddate') return json_(addDate_(body.date || {}));
    if (body.action === 'savereview') return json_(saveReview_(body.review || {}));
    if (body.action === 'ask') return json_(ask_(body));
    if (body.action === 'queueadd') return json_(queueAdd_(body.item || {}));
    if (body.action === 'queueorder') return json_(queueOrder_(body.ids));
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
  var ai = aiKey_() ? aiSpend_() : null;
  console.log('Ask Claude: ' + (ai ? 'OK. This month $' + ai.usd.toFixed(2) + ' of $' + ai.budget.toFixed(2) + ' (' + ai.calls + ' calls)' : 'OFF. Add ANTHROPIC_API_KEY in Script Properties to turn it on'));
  console.log('Bridge version ' + VERSION + '. Can write to: ' + Object.keys(WRITABLE).filter(function (k) { return WRITABLE[k](); }).join(', ') + (n.ok ? ', Notion tasks' : '') + '.');
  console.log('ACCESS KEY (paste into the iPad app): ' + key);
}

/** Run this only if your access key leaks. The iPad app will need the new key. */
function rotateKey() {
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_KEY');
  setup();
}

// ---- Internals -------------------------------------------------------------

function keyMatches_(given) {
  var key = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  return !!key && typeof given === 'string' && given === key;
}

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
  var want = fundName_().toLowerCase(), fund = null;
  (cur.categories || []).forEach(function (c) { if (!fund && !c.deleted && String(c.name).trim().toLowerCase() === want) fund = { name: c.name, balance: money_(c.balance) }; });
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

// ---- Ask Claude ---------------------------------------------------------------
// The in-app assistant. Claude reads through the same functions the app uses and
// never changes anything itself: every change comes back as a proposal that
// Timothy confirms in the app. No web, no work-calendar writes, no code.
// The API key lives in Script Properties (ANTHROPIC_API_KEY), never in this file.
var AI = {
  FAST: 'claude-haiku-4-5',    // everyday questions
  DEEP: 'claude-sonnet-5-5',   // THINK HARDER and weekly summaries
  BUDGET_USD: 8,               // monthly pause point; override with Script Property AI_BUDGET_USD
  MAX_STEPS: 6                 // model calls per question, at most
};
// US$ per million tokens: input, output, cache write (5 min), cache read.
var AI_PRICES = {
  'claude-haiku-4-5': [1, 5, 1.25, 0.10],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.20],
  'claude-sonnet-5': [2, 10, 2.5, 0.20]
};
var AI_PRICE_OTHER = [5, 25, 6.25, 0.50];   // anything unexpected is counted at a high rate

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
function aiMonth_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'); }
/** This month's spend, kept in Script Properties: { month, usd, calls }. */
function aiSpend_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('AI_SPEND') || '{}'); } catch (e) { s = {}; }
  if (s.month !== aiMonth_()) s = { month: aiMonth_(), usd: 0, calls: 0 };
  return { month: s.month, usd: Math.round((s.usd || 0) * 10000) / 10000, calls: s.calls || 0, budget: aiBudget_() };
}
function aiCost_(model, u) {
  var p = AI_PRICES[model] || AI_PRICE_OTHER;
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
function ask_(body) {
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
  if (spend.usd >= spend.budget) return { ok: false, error: 'ai_budget', spend: spend };

  var model = mode === 'fast' ? AI.FAST : AI.DEEP;
  var system = [{ type: 'text', text: AI_RULES + (mode === 'summary' ? "\nTask: write a weekly summary in 4 to 6 sentences: what the week held, what moved forward, what slipped, one observation about balance, and one suggestion for next week. Plain prose, no lists. Don't use tools." :
      mode === 'patterns' ? "\nTask: read the saved weekly reviews in the snapshot and name the patterns across them: what keeps draining him, what reliably goes well, focus areas that keep coming back or slipping, how he holds his bearing, and any trend in the numbers. 4 to 6 lines starting with '- ', each one concrete and tied to specific weeks. End with one suggestion. Don't use tools." : '') },
    { type: 'text', text: 'SNAPSHOT FROM THE APP\n' + String(body.context || 'No snapshot was sent.').slice(0, 40000) }];
  var payload = { model: model, max_tokens: mode === 'fast' ? 2000 : 8000, system: system, messages: turns, cache_control: { type: 'ephemeral' } };
  if (mode === 'fast' || mode === 'deep') payload.tools = AI_TOOLS;
  var betas = [];
  if (model === AI.DEEP) { payload.output_config = { effort: 'medium' }; payload.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }

  var ctx = { ignore: Array.isArray(body.ignore) ? body.ignore.slice(0, 30) : [], proposals: [] }, cost = 0, res, served = model;
  for (var step = 0; step < AI.MAX_STEPS; step++) {
    if (step > 0 && aiSpend_().usd >= aiSpend_().budget) break;
    try {
      res = claude_(payload, betas);
    } catch (e) {
      if (!e.ai) throw e;
      return { ok: false, error: e.ai, detail: String(e.message).slice(0, 300), spend: aiSpend_() };
    }
    served = res.model || model;
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
  var out = { ok: true, version: VERSION, reply: text || '(No answer.)', proposals: ctx.proposals, model: served, cost: Math.round(cost * 10000) / 10000, spend: aiSpend_() };
  try { cache.put('ask:' + body.cid, JSON.stringify(out), 600); } catch (x) { /* too large to cache */ }
  return out;
}
