// ON THIS DAY in the bridge (1.48, D80; every item invented). onthisday: for each of the last 5 years, the same date
// and three days either side: calendar events from every calendar but Work (declined and busy-only ones left out),
// tasks marked done (by Completed, or by the last edit of one without it, which is then written in), dinners eaten (planned ones left out), hive checks with the hive's name,
// books finished, tarot readings (cards as ids), the weekly review covering the date ("went well"), and habits. One
// Notion query per database for all the years; a database that fails leaves the others; 29 February falls back to
// the 28th; nothing else is written; kept for 6 hours; Work never appears.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const ts = d => d + 'T15:00:00.000Z';

// ---- a simulated Google Calendar
const ev = (title, start, end, o = {}) => ({ getTitle: () => title, getId: () => title, getStartTime: () => new Date(start), getEndTime: () => new Date(end), isAllDayEvent: () => !!o.allDay,
  getAllDayStartDate: () => new Date(start), getAllDayEndDate: () => new Date(end), getLocation: () => '', getMyStatus: () => o.declined ? 'NO' : 'YES' });
const CALS = {};
const cal = (name, events) => ({ getName: () => name, getTimeZone: () => 'UTC', getId: () => name, getEvents: (a, b) => events.filter(e => e.getStartTime() < b && e.getEndTime() > a) });
const br = bridge({ tz: 'UTC', notion: {}, props: { NOTION_TOKEN: 'ntn_test', FARM_CALENDAR_ID: 'farm@x', FAMILY_CALENDAR_ID: 'family@x', WORK_CALENDAR_ID: 'work@x' },
  globals: { CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => CALS.personal, getCalendarById: id => CALS[id.split('@')[0]] || null, getAllCalendars: () => [] } } });
const nx = br.nx, cache = br.cache, post = br.post;
const queriesOf = (key, from = 0) => nx.calls.slice(from).filter(c => c.method === 'post' && c.path === '/data_sources/' + nx.ds(key) + '/query').length;

// ---- invented history around 13 November
CALS.personal = cal('Personal', [ev('Sample dentist', '2025-11-13T15:30:00Z', '2025-11-13T16:00:00Z'), ev('Sample declined party', '2025-11-13T19:00:00Z', '2025-11-13T21:00:00Z', { declined: true }),
  ev('', '2025-11-14T12:00:00Z', '2025-11-14T13:00:00Z'), ev('Sample far too early', '2025-11-01T12:00:00Z', '2025-11-01T13:00:00Z'), ev('Sample apple pressing', '2022-11-13', '2022-11-14', { allDay: true })]);
CALS.farm = cal('Farm', [ev('Sample hay delivery', '2025-11-13T10:00:00Z', '2025-11-13T11:00:00Z')]);
CALS.family = cal('Family', [ev('Sample school concert', '2022-11-13T14:00:00Z', '2022-11-13T15:00:00Z')]);
CALS.work = cal('Work', [ev('Sample standup', '2025-11-13T08:30:00Z', '2025-11-13T09:00:00Z')]);
const old = { last_edited_time: '2026-01-01T00:00:00.000Z' };
const gutters = nx.add('tasks', { Task: 'Clean the gutters', Status: '✅ Done', 'Life Area': 'Sample Home' }, { last_edited_time: ts('2025-11-13') });
nx.add('tasks', { Task: 'Still open', Status: '⬜ To Do' }, { last_edited_time: ts('2025-11-13') });
nx.add('tasks', { Task: 'Done much later', Status: '✅ Done' }, { last_edited_time: ts('2025-12-20') });
nx.add('dinners', { Dinner: 'Sample white chili', Date: '2025-11-13', Status: 'Eaten' }, old);
nx.add('dinners', { Dinner: 'Sample planned only', Date: '2025-11-14', Status: 'Planned' }, old);
nx.add('tarot', { Kind: 'Reading', Title: 'a reading', Date: '2022-11-13', Spread: 'Weekly spread', Data: JSON.stringify({ cards: [{ id: 'M17', rev: false }, { id: 'C03', rev: true }], q: 'a private question' }) }, old);
nx.add('habits', { Date: '2025-11-13', Meditated: false, Exercise: true, 'Water (L)': 2.5 }, old);
const hiveId = nx.add('apiary', { Kind: 'Hive', Name: 'Hive One', Data: '{}' }, old);
nx.add('apiary', { Kind: 'Check', Name: 'check', Date: '2025-11-12', Hive: [hiveId], Did: 'Winter wrap on', 'Honey (lb)': null }, old);
nx.add('library', { Title: 'The Sample Orchard', Status: 'Finished', Finished: '2024-11-11', Rating: 4 }, old);
nx.add('reviews', { Week: 'Week of 10 Nov 2025', 'Week Start': '2025-11-10', 'Went Well': 'The beds got mulched' }, old);

// ---- the read
assert.ok(post({ action: 'ping' }).capabilities.includes('onthisday'));
const c0 = nx.calls.length;
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
assert.deepStrictEqual(['tasks', 'dinners', 'tarot', 'habits'].map(k => queriesOf(k, c0)), [2, 1, 1, 1], 'one query per database for all five years (tasks two: by Completed, and by last edit where Completed is empty, 1.51)');
assert.deepStrictEqual(nx.calls.slice(c0).filter(c => c.method !== 'get' && !/\/query$/.test(c.path)).map(c => c.method + ' ' + c.path), ['patch /pages/' + gutters], 'nothing is written but the Completed date of a task finished without one (1.51)');
assert.strictEqual(nx.row(gutters).Completed, ts('2025-11-13'), 'its last edit, written in once');
assert.strictEqual(br.ttl['otd:2026-11-13:5'], 21600, 'kept for 6 hours');

// ---- kept: the same answer, no new queries
const c1 = nx.calls.length;
assert.deepStrictEqual(post({ action: 'onthisday', today: '2026-11-13' }), r);
assert.strictEqual(nx.calls.length, c1);

// ---- one database failing leaves the rest, and isn't kept
nx.fail({ status: 500, match: 'post /data_sources/' + nx.ds('dinners'), times: 1 });
r = post({ action: 'onthisday', today: '2026-11-14' });
assert.ok(r.ok && r.problems.length === 1 && /^dinners: notion_error \(\w+\)$/.test(r.problems[0]) && r.years[0].dinners.length === 0 && r.years[0].tasks.length === 1 && r.years[0].habits.length === 1, JSON.stringify(r.problems));
assert.ok(!cache['otd:2026-11-14:5'], 'a partial answer is not kept');
assert.deepStrictEqual(nx.refused().map(c => c.refused.slice(0, 3)), ['500'], 'the bridge sent nothing Notion refuses (the one failure was the simulated 500)');

// ---- 29 February, a bad date, a count of years
r = post({ action: 'onthisday', today: '2028-02-29', years: 2 });
assert.deepStrictEqual(r.years.map(y => y.date), ['2027-02-28', '2026-02-28']);
assert.strictEqual(post({ action: 'onthisday', today: '2026-13-01' }).error, 'bad_request');
assert.strictEqual(post({ action: 'onthisday', today: '2026-11-13', years: 99 }).years.length, 10, 'at most 10 years');
assert.strictEqual(br.call({ key: 'wrong', action: 'onthisday', today: '2026-11-13' }).error, 'unauthorized');
console.log('bridge onthisday: OK');
