// ASTROMETRICS in the bridge (1.32): the year read returns finished tasks (Life Area and last edit only, no titles)
// and Replicator Queue items bought (day and cost only) between two local midnights, at most 400 days apart;
// read-only (Notion queries, no page writes); each part reports its own error; cached until a task changes.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test' }, cache = {};
const DB = { tasks: '6c4a440d571e49e0b4076c18d5712c1f', queue: '0b5b1e3a7d7c4f2a9a51f4f0c3d2e1a0' };
let calls = [], queueShared = true;
const task = (area, at) => ({ id: 't' + Math.random(), last_edited_time: at, properties: { Task: { title: [{ plain_text: 'Juniper task' }] }, Status: { select: { name: '✅ Done' } }, 'Life Area': { select: { name: area } } } });
const item = (day, cost) => ({ id: 'q' + Math.random(), properties: { Name: { title: [{ plain_text: 'Bramble feeder' }] }, Cost: { number: cost }, Bought: { date: { start: day } } } });
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase();
  calls.push(m + ' ' + path + (opts.payload ? ' ' + opts.payload : ''));
  if (m === 'get' && path.indexOf('/databases/') === 0) {
    const k = Object.keys(DB).find(x => path === '/databases/' + DB[x]);
    if (k === 'queue' && !queueShared) return res(404, { message: 'Could not find database' });
    return k ? res(200, { data_sources: [{ id: 'ds-' + k }] }) : res(404, { message: 'Could not find database' });
  }
  if (m === 'post' && path === '/data_sources/ds-tasks/query') return res(200, { results: [task('🌿 Farm', '2026-03-02T15:00:00.000Z'), task('🎯 Work', '2026-08-20T15:00:00.000Z')], has_more: false });
  if (m === 'post' && path === '/data_sources/ds-queue/query') return res(200, { results: [item('2026-05-01', 24.5), item('2026-09-12', null)], has_more: false });
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d, tz, f) => f === 'yyyy-MM' ? '2026-10' : d.toISOString().slice(0, 16).replace('T', ' '), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext("CONFIG.NOTION_QUEUE_DATABASE = '" + DB.queue + "';", ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const F = '2026-01-01T06:00:00.000Z', T = '2027-01-01T06:00:00.000Z';

assert.ok(get({ action: 'ping', key }).capabilities.includes('year'), 'capability year with the Notion key');
calls = [];
const y = get({ action: 'year', key, from: F, to: T });
assert.ok(y.ok, JSON.stringify(y));
assert.deepStrictEqual(y.done, [{ area: '🌿 Farm', at: '2026-03-02T15:00:00.000Z' }, { area: '🎯 Work', at: '2026-08-20T15:00:00.000Z' }], 'Life Area and last edit only');
assert.ok(!JSON.stringify(y).includes('Juniper') && !JSON.stringify(y).includes('Bramble'), 'no titles');
assert.deepStrictEqual(y.bought, [{ day: '2026-05-01', cost: 24.5 }, { day: '2026-09-12', cost: null }]);
const tq = calls.find(c => c.startsWith('post /data_sources/ds-tasks/query'));
assert.ok(tq.includes('"on_or_after":"' + F + '"') && tq.includes('"before":"' + T + '"') && tq.includes('✅ Done'), tq);
const qq = calls.find(c => c.startsWith('post /data_sources/ds-queue/query'));
assert.ok(qq.includes('"on_or_after":"2026-01-01"') && qq.includes('"before":"2027-01-01"'), qq);
assert.ok(calls.every(c => c.startsWith('get ') || /\/query /.test(c)), 'read-only: ' + calls.join(' | '));

// cached; a task change (tgen) asks again
calls = []; get({ action: 'year', key, from: F, to: T }); assert.strictEqual(calls.length, 0, 'from the cache');
cache.tgen = 'x1'; get({ action: 'year', key, from: F, to: T }); assert.ok(calls.length > 0, 'asks again after a task change');

// batched with the other reads
const b = get({ action: 'batch', key, calls: JSON.stringify([{ action: 'year', from: F, to: T }]) });
assert.ok(b.results[0].ok && b.results[0].done.length === 2);

// bad ranges
assert.strictEqual(get({ action: 'year', key, from: 'x', to: T }).error, 'bad_request');
assert.strictEqual(get({ action: 'year', key, from: T, to: F }).error, 'bad_request');
assert.strictEqual(get({ action: 'year', key, from: '2026-01-01T06:00:00.000Z', to: '2027-03-01T06:00:00.000Z' }).error, 'bad_request', 'over 400 days');

// the queue not connected: the tasks still come, the queue says why
queueShared = false; cache.tgen = 'x2'; Object.keys(cache).filter(k => k.indexOf('ds:') === 0 || /SOURCE/.test(k)).forEach(k => delete cache[k]);
delete props.NOTION_QUEUE_SOURCE;
const y2 = get({ action: 'year', key, from: F, to: T });
assert.ok(y2.ok && y2.done.length === 2 && y2.boughtError === 'notion_not_shared', JSON.stringify(y2));
console.log('ALL YEAR CHECKS PASSED');
