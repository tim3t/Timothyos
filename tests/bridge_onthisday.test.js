// ON THIS DAY in the bridge (1.48, D80; every item invented). onthisday: for each of the last 5 years, the same date
// and three days either side: calendar events from every calendar but Work (declined and busy-only ones left out),
// tasks marked done (by their last edit), dinners eaten (planned ones left out), hive checks with the hive's name,
// books finished, tarot readings (cards as ids), the weekly review covering the date ("went well"), and habits. One
// Notion query per database for all the years; a database that fails leaves the others; 29 February falls back to
// the 28th; nothing is written; kept for 6 hours; Work never appears.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test', FARM_CALENDAR_ID: 'farm@x', FAMILY_CALENDAR_ID: 'family@x', WORK_CALENDAR_ID: 'work@x' }, cache = {};
let pages = [], queries = [], writes = [], failDs = null;
const T = s => [{ plain_text: s, text: { content: s } }];
const ts = d => d + 'T15:00:00.000Z';

// ---- a simulated Notion: data sources found from their databases; queries filtered as Notion would
function dateOf(pg, f) {
  if (f.timestamp === 'last_edited_time') return pg.last_edited_time;
  const p = pg.properties[f.property]; return p && p.date && p.date.start;
}
function match(pg, f) {
  if (!f) return true;
  if (f.and) return f.and.every(x => match(pg, x));
  if (f.or) return f.or.some(x => match(pg, x));
  if (f.select) { const s = pg.properties[f.property]; return !!(s && s.select && s.select.name === f.select.equals); }
  const v = dateOf(pg, f), c = f.date || f.last_edited_time;
  if (!v) return false;
  if (c.on_or_after) return v >= c.on_or_after;
  if (c.on_or_before) return v.slice(0, 10) <= c.on_or_before;
  if (c.before) return v < c.before;
  return true;
}
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const db = path.match(/^\/databases\/(\w+)$/);
  if (m === 'get' && db) return res(200, { data_sources: [{ id: 'ds-' + db[1] }] });
  const q = path.match(/^\/data_sources\/ds-(\w+)\/query$/);
  if (m === 'post' && q) {
    queries.push(q[1]);
    if (failDs === q[1]) return res(500, { message: 'simulated failure' });
    return res(200, { results: pages.filter(p => p.db === q[1] && match(p, body.filter)), has_more: false });
  }
  writes.push(m + ' ' + path); return res(400, { message: 'unexpected ' + m + ' ' + path });
}
// ---- a simulated Google Calendar
const ev = (title, start, end, o = {}) => ({ getTitle: () => title, getId: () => title, getStartTime: () => new Date(start), getEndTime: () => new Date(end), isAllDayEvent: () => !!o.allDay,
  getAllDayStartDate: () => new Date(start), getAllDayEndDate: () => new Date(end), getLocation: () => '', getMyStatus: () => o.declined ? 'NO' : 'YES' });
const CALS = {};
const cal = (name, events) => ({ getName: () => name, getTimeZone: () => 'UTC', getId: () => name, getEvents: (a, b) => events.filter(e => e.getStartTime() < b && e.getEndTime() > a) });
const ctx = {
  console: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }), getUserProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v, s) => { cache[k] = v; cache['ttl:' + k] = s; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep() {},
    formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : f === 'HH:mm' ? d.toISOString().slice(11, 16) : f === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString() },
  Session: { getScriptTimeZone: () => 'UTC' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => CALS.personal, getCalendarById: id => CALS[id.split('@')[0]] || null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const C = ctx.CONFIG, DB = { tasks: C.NOTION_TASKS_DATABASE, dinners: C.NOTION_DINNERS_DATABASE, tarot: C.NOTION_TAROT_DATABASE, habits: C.NOTION_HABITS_DATABASE, apiary: C.NOTION_APIARY_DATABASE, library: C.NOTION_LIBRARY_DATABASE, reviews: C.NOTION_REVIEWS_DATABASE };
ctx.setup(); const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);

// ---- invented history around 13 November
CALS.personal = cal('Personal', [ev('Sample dentist', '2025-11-13T15:30:00Z', '2025-11-13T16:00:00Z'), ev('Sample declined party', '2025-11-13T19:00:00Z', '2025-11-13T21:00:00Z', { declined: true }),
  ev('', '2025-11-14T12:00:00Z', '2025-11-14T13:00:00Z'), ev('Sample far too early', '2025-11-01T12:00:00Z', '2025-11-01T13:00:00Z'), ev('Sample apple pressing', '2022-11-13', '2022-11-14', { allDay: true })]);
CALS.farm = cal('Farm', [ev('Sample hay delivery', '2025-11-13T10:00:00Z', '2025-11-13T11:00:00Z')]);
CALS.family = cal('Family', [ev('Sample school concert', '2022-11-13T14:00:00Z', '2022-11-13T15:00:00Z')]);
CALS.work = cal('Work', [ev('Sample standup', '2025-11-13T08:30:00Z', '2025-11-13T09:00:00Z')]);
const pg = (db, props2, edited) => { pages.push({ id: 'p' + pages.length, db, last_edited_time: edited || '2026-01-01T00:00:00.000Z', properties: props2 }); };
pg(DB.tasks, { Task: { title: T('Clean the gutters') }, Status: { select: { name: '✅ Done' } }, 'Life Area': { select: { name: 'Sample Home' } } }, ts('2025-11-13'));
pg(DB.tasks, { Task: { title: T('Still open') }, Status: { select: { name: '⬜ To Do' } } }, ts('2025-11-13'));
pg(DB.tasks, { Task: { title: T('Done much later') }, Status: { select: { name: '✅ Done' } } }, ts('2025-12-20'));
pg(DB.dinners, { Dinner: { title: T('Sample white chili') }, Date: { date: { start: '2025-11-13' } }, Status: { select: { name: 'Eaten' } } });
pg(DB.dinners, { Dinner: { title: T('Sample planned only') }, Date: { date: { start: '2025-11-14' } }, Status: { select: { name: 'Planned' } } });
pg(DB.tarot, { Kind: { select: { name: 'Reading' } }, Title: { title: T('a reading') }, Date: { date: { start: '2022-11-13' } }, Spread: { rich_text: T('Weekly spread') }, Data: { rich_text: T(JSON.stringify({ cards: [{ id: 'M17', rev: false }, { id: 'C03', rev: true }], q: 'a private question' })) } });
pg(DB.habits, { Date: { date: { start: '2025-11-13' } }, Meditated: { checkbox: false }, 'Evening Walk': { checkbox: true }, 'Water (L)': { number: 2.5 } });
pg(DB.apiary, { Kind: { select: { name: 'Hive' } }, Name: { title: T('Hive One') }, Data: { rich_text: T('{}') } });
const hiveId = pages[pages.length - 1].id;
pg(DB.apiary, { Kind: { select: { name: 'Check' } }, Name: { title: T('check') }, Date: { date: { start: '2025-11-12' } }, Hive: { relation: [{ id: hiveId }] }, Did: { rich_text: T('Winter wrap on') }, 'Honey (lb)': { number: null } });
pg(DB.library, { Title: { title: T('The Sample Orchard') }, Status: { select: { name: 'Finished' } }, Finished: { date: { start: '2024-11-11' } }, Rating: { number: 4 } });
pg(DB.reviews, { Week: { title: T('Week of 10 Nov 2025') }, 'Week Start': { date: { start: '2025-11-10' } }, 'Went Well': { rich_text: T('The beds got mulched') } });

// ---- the read (setup cached the empty databases it checked: clear that first)
Object.keys(cache).forEach(k => { delete cache[k]; });
writes = [];
assert.ok(post({ action: 'ping' }).capabilities.includes('onthisday'));
queries = [];
let r = post({ action: 'onthisday', today: '2026-11-13' });
assert.ok(r.ok, JSON.stringify(r).slice(0, 300));
assert.deepStrictEqual(r.years.map(y => [y.year, y.date, y.from, y.to]), [[2025, '2025-11-13', '2025-11-10', '2025-11-16'], [2024, '2024-11-13', '2024-11-10', '2024-11-16'], [2023, '2023-11-13', '2023-11-10', '2023-11-16'], [2022, '2022-11-13', '2022-11-10', '2022-11-16'], [2021, '2021-11-13', '2021-11-10', '2021-11-16']]);
const y25 = r.years[0], y24 = r.years[1], y22 = r.years[3];
assert.deepStrictEqual(y25.events.map(e => [e.area, e.title, e.time]), [['farm', 'Sample hay delivery', '10:00'], ['personal', 'Sample dentist', '15:30']], 'no Work, no declined, no busy-only, nothing outside the week');
assert.deepStrictEqual(y22.events.map(e => [e.area, e.title, e.allDay]), [['personal', 'Sample apple pressing', true], ['family', 'Sample school concert', false]]);
assert.ok(!JSON.stringify(r).includes('standup'), 'Work never appears');
assert.deepStrictEqual(y25.tasks.map(t => t.title), ['Clean the gutters'], 'done in that week; not open ones, not ones finished later');
assert.deepStrictEqual(y25.dinners, [{ date: '2025-11-13', name: 'Sample white chili' }], 'eaten, not planned');
assert.deepStrictEqual(y25.checks, [{ date: '2025-11-12', hive: 'Hive One', did: 'Winter wrap on', honey: null }]);
assert.deepStrictEqual(y25.habits, [{ date: '2025-11-13', med: false, walk: true, water: 2.5 }]);
assert.deepStrictEqual(y25.review, { week: '2025-11-10', wentWell: 'The beds got mulched' });
assert.deepStrictEqual(y24.books, [{ date: '2024-11-11', title: 'The Sample Orchard', rating: 4 }]);
assert.deepStrictEqual(y22.tarot, [{ date: '2022-11-13', spread: 'Weekly spread', cards: [{ id: 'M17', rev: false }, { id: 'C03', rev: true }] }]);
assert.ok(!JSON.stringify(r).includes('private question'), 'a reading\'s question stays out');
assert.deepStrictEqual(queries.filter(q => q === DB.tasks).length + queries.filter(q => q === DB.dinners).length + queries.filter(q => q === DB.tarot).length + queries.filter(q => q === DB.habits).length, 4, 'one query per database for all five years');
assert.deepStrictEqual(writes.filter(w => !/^get /.test(w)), [], 'nothing is written');
assert.strictEqual(cache['ttl:otd:2026-11-13:5'], 21600, 'kept for 6 hours');

// ---- kept: the same answer, no new queries
queries = [];
assert.deepStrictEqual(post({ action: 'onthisday', today: '2026-11-13' }), r);
assert.strictEqual(queries.length, 0);

// ---- one database failing leaves the rest, and isn't kept
failDs = DB.dinners;
r = post({ action: 'onthisday', today: '2026-11-14' });
assert.ok(r.ok && r.problems.length === 1 && /^dinners/.test(r.problems[0]) && r.years[0].dinners.length === 0 && r.years[0].tasks.length === 1 && r.years[0].habits.length === 1, JSON.stringify(r.problems));
assert.ok(!cache['otd:2026-11-14:5'], 'a partial answer is not kept');
failDs = null;

// ---- 29 February, a bad date, a count of years
r = post({ action: 'onthisday', today: '2028-02-29', years: 2 });
assert.deepStrictEqual(r.years.map(y => y.date), ['2027-02-28', '2026-02-28']);
assert.strictEqual(post({ action: 'onthisday', today: '2026-13-01' }).error, 'bad_request');
assert.strictEqual(post({ action: 'onthisday', today: '2026-11-13', years: 99 }).years.length, 10, 'at most 10 years');
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'wrong', action: 'onthisday', today: '2026-11-13' }) } }).text).error, 'unauthorized');
console.log('bridge onthisday: OK');
