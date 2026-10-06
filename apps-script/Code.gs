/**
 * TimothyOS calendar bridge, v1.0
 *
 * Runs inside your personal Google account as a web app. Reads your
 * calendars and returns them as JSON to the TimothyOS app on your iPad.
 *
 * Read-only: this script never creates, edits, or deletes anything.
 * Setup steps are in README.md ("Handshake 2" and "Handshake 3").
 */

// ---- Your settings ---------------------------------------------------------
var CONFIG = {
  // Your personal calendar. "primary" means the default calendar of the
  // Google account this script runs in.
  PERSONAL_CALENDAR_ID: 'primary',

  // Your work calendar, shared to this personal account. Usually your work
  // email address. Run setup() to list every calendar this account can see.
  WORK_CALENDAR_ID: 'you@your-employer.com'
};
// ---------------------------------------------------------------------------

var VERSION = '1.0.0';
var MAX_RANGE_DAYS = 62;
var CACHE_SECONDS = 120;
var SOURCES = [
  { area: 'work', id: function () { return CONFIG.WORK_CALENDAR_ID; } },
  { area: 'personal', id: function () { return CONFIG.PERSONAL_CALENDAR_ID; } }
];

/** Web app entry point. Every request must carry the access key. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (!keyMatches_(p.key)) return json_({ ok: false, error: 'unauthorized' });
    if (p.action === 'ping') return json_({ ok: true, version: VERSION, calendars: calendarStatus_() });
    if (p.action === 'events') return json_(events_(Number(p.from), Number(p.to)));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String((err && err.message) || err) });
  }
}

/**
 * Run this once from the editor (select "setup", then Run).
 * Creates your access key and lists every calendar this account can see.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ACCESS_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ACCESS_KEY', key);
  }
  console.log('Calendars this account can see (name -> ID):');
  CalendarApp.getAllCalendars().forEach(function (c) {
    console.log('  ' + c.getName() + '  ->  ' + c.getId());
  });
  calendarStatus_().forEach(function (s) {
    console.log('TimothyOS ' + s.area + ' calendar: ' + (s.ok ? 'OK (' + s.name + ')' : 'PROBLEM: ' + s.error));
  });
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

function openCalendar_(id) {
  if (!id || id.indexOf('your-employer.com') > -1) return { cal: null, error: 'not_configured' };
  var cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  return cal ? { cal: cal } : { cal: null, error: 'not_found' };
}

function calendarStatus_() {
  return SOURCES.map(function (src) {
    var o = openCalendar_(src.id());
    return o.cal ? { area: src.area, ok: true, name: o.cal.getName() } : { area: src.area, ok: false, error: o.error };
  });
}

function events_(from, to) {
  if (!isFinite(from) || !isFinite(to) || to <= from) return { ok: false, error: 'bad_range' };
  if ((to - from) / 86400000 > MAX_RANGE_DAYS) return { ok: false, error: 'range_too_long' };

  var cache = CacheService.getScriptCache();
  var cacheKey = 'ev:' + VERSION + ':' + from + ':' + to;
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
      var title = ev.getTitle();
      var item = {
        id: src.area + ':' + ev.getId() + ':' + ev.getStartTime().getTime(),
        area: src.area,
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
      events.push(item);
    });
  });

  var out = { ok: true, version: VERSION, generated: new Date().toISOString(), calendars: calendars, events: events };
  try { cache.put(cacheKey, JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* too large to cache; fine */ }
  return out;
}

function declined_(ev) {
  try { return ev.getMyStatus() === CalendarApp.GuestStatus.NO; } catch (e) { return false; }
}
