/**
 * TimothyOS bridge, v1.5
 *
 * Runs inside your personal Google account as a web app.
 *  - Calendars: reads Work + Personal; creates events you capture (Personal only).
 *  - Notion: reads your Master Task List for Plan Day; sets Focus Date, marks
 *    tasks done, and adds new tasks. Reads and adds Key Dates. Counts tasks
 *    finished recently (for the Bridge's Balance panel). Reads a week's
 *    finished and picked tasks, and saves your Weekly Review (one page per week).
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
  NOTION_REVIEWS_DATABASE: '459bcacdc38d4bad9f58b4579fa9f4fd'
};
// ---------------------------------------------------------------------------

var VERSION = '1.5.0';
var NOTION_VERSION = '2025-09-03';
var TASK_STATUSES = ['⬜ To Do', '🔄 In Progress', '✅ Done', '🚫 Blocked'];
var TASK_PRIORITIES = ['🔴 High', '🟡 Medium', '🟢 Low'];
function capabilities_() {
  return ['read', 'create'].concat(PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN') ? ['tasks', 'dates', 'done', 'reviews'] : []);
}
var MAX_RANGE_DAYS = 62;
var CACHE_SECONDS = 120;
var PLACEHOLDER = 'your-employer.com';
var SOURCES = [
  { area: 'work', id: workCalendarId_ },
  { area: 'personal', id: function () { return CONFIG.PERSONAL_CALENDAR_ID; } }
];
// Calendars the app may add events to. Work is deliberately absent.
var WRITABLE = {
  personal: function () { return CONFIG.PERSONAL_CALENDAR_ID; }
};

/** Read requests. Every request must carry the access key. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (!keyMatches_(p.key)) return json_({ ok: false, error: 'unauthorized' });
    if (p.action === 'ping') return json_({ ok: true, version: VERSION, capabilities: capabilities_(), calendars: calendarStatus_(), notion: notionStatus_() });
    if (p.action === 'events') return json_(events_(Number(p.from), Number(p.to)));
    if (p.action === 'tasks') return json_(tasks_(String(p.day || '')));
    if (p.action === 'dates') return json_(dates_());
    if (p.action === 'done') return json_(done_(p.days));
    if (p.action === 'week') return json_(week_(String(p.week || ''), String(p.from || ''), String(p.to || '')));
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
    console.log('TimothyOS ' + s.area + ' calendar: ' + (s.ok ? 'OK (' + s.name + ')' : 'PROBLEM: ' + s.error));
  });
  var n = notionStatus_();
  console.log('Notion tasks: ' + (n.ok ? 'OK (' + n.name + ', ' + n.open + ' open tasks)' : 'NOT READY: ' + n.error + (n.help ? '. ' + n.help : '')));
  var kd = n.dates || {};
  console.log('Notion key dates: ' + (kd.ok ? 'OK (' + kd.name + ', ' + kd.count + ' dates)' : 'NOT READY: ' + (kd.error || n.error) + (kd.help ? '. ' + kd.help : '')));
  var wr = n.reviews || {};
  console.log('Notion weekly reviews: ' + (wr.ok ? 'OK (' + wr.name + ', ' + wr.count + ' reviews)' : 'NOT READY: ' + (wr.error || n.error) + (wr.help ? '. ' + wr.help : '')));
  console.log('Bridge version ' + VERSION + '. Can write to: ' + Object.keys(WRITABLE).join(', ') + (n.ok ? ', Notion tasks' : '') + '.');
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

function openCalendar_(id) {
  if (!id || id.indexOf(PLACEHOLDER) > -1) return { cal: null, error: 'not_configured' };
  var cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  return cal ? { cal: cal } : { cal: null, error: 'not_found' };
}

function calendarStatus_() {
  return SOURCES.map(function (src) {
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
  SOURCES.forEach(function (src) {
    var o = openCalendar_(src.id());
    if (!o.cal) { calendars.push({ area: src.area, ok: false, error: o.error }); return; }
    var tz = o.cal.getTimeZone();
    calendars.push({ area: src.area, ok: true, name: o.cal.getName() });
    o.cal.getEvents(start, end).forEach(function (ev) {
      if (src.area === 'personal' && declined_(ev)) return;
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
var REVIEW_TEXT = { wentWell: 'Went Well', drained: 'Drained Me', nextFocus: 'Next Focus', bearing: 'Bearing', intents: 'Intents', byArea: 'Done By Area' };
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
  out.summary = plain_(p['Claude Summary'] && p['Claude Summary'].rich_text);
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

/** Save the review for one week: updates that week's page, or creates it. Safe to repeat. */
function saveReview_(r) {
  var week = String(r.week || '');
  if (!YMD.test(week)) return { ok: false, error: 'bad_request' };
  var props = {
    Week: { title: rt_(String(r.title || week).trim().slice(0, 120) || week) },
    'Week Start': { date: { start: week } }
  };
  Object.keys(REVIEW_TEXT).forEach(function (k) { props[REVIEW_TEXT[k]] = { rich_text: rt_(String(r[k] == null ? '' : r[k]).trim().slice(0, 6000)) }; });
  Object.keys(REVIEW_NUM).forEach(function (k) {
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
