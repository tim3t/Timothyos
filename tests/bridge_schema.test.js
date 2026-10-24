// Notion schema check in the bridge (1.31): each connected database's columns against the ones the bridge uses
// (name and type); a renamed column is "not found", a changed type names both; databases not connected say so
// instead; read-only (GETs only); cached for six hours unless asked fresh; setup's log names the problem.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test' }, cache = {};
const DB = { tasks: '6c4a440d571e49e0b4076c18d5712c1f', dates: '8184db37aacb4d96943b2067558b92ab', library: '47fdad1d1217402fa84731a8aa146cba' };
const col = type => ({ type });
const sources = {
  'ds-tasks': { Task: col('title'), Status: col('select'), Priority: col('select'), 'Life Area': col('select'), 'Due Date': col('date'), 'Focus Date': col('date'), Extra: col('people') },
  'ds-dates': { Name: col('title'), When: col('date'), 'Life Area': col('select'), Type: col('select'), 'Repeats Yearly': col('checkbox'), Notes: col('rich_text') },   // Date renamed to When
  'ds-library': { Title: col('title'), Author: col('rich_text'), Status: col('select'), Started: col('date'), Finished: col('date'), Rating: col('rich_text'),         // Rating made text
    Notes: col('rich_text'), Cover: col('url'), 'Open Library': col('url'), Published: col('number') }
};
let calls = [];
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase();
  calls.push(m + ' ' + path);
  if (m === 'get') {
    const db = Object.keys(DB).find(k => path === '/databases/' + DB[k]);
    if (db) return res(200, { data_sources: [{ id: 'ds-' + db }] });
    if (path.indexOf('/databases/') === 0) return res(404, { message: 'Could not find database' });
    const ds = path.replace('/data_sources/', '');
    if (sources[ds]) return res(200, { title: [{ plain_text: ds }], properties: sources[ds] });
  }
  if (m === 'post' && /\/query$/.test(path)) return res(200, { results: [], has_more: false });
  return res(404, { message: 'unexpected ' + m + ' ' + path });
}
const logs = [];
const ctx = {
  console: { log: (...a) => { logs.push(a.join(' ')); } },
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
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);

// setup's log names the problems
const line = logs.find(l => l.startsWith('Notion columns:'));
assert.ok(line && line.includes('PROBLEM') && line.includes('Key Dates: "Date" (date) not found') && line.includes('Library: "Rating" is text, needs number'), line);
assert.ok(get({ action: 'ping', key }).capabilities.includes('schema'));

// the schema action: one row per database
calls = [];
const s = get({ action: 'schema', key, fresh: '1' });
assert.ok(s.ok); assert.strictEqual(s.dbs.length, 11);
const by = k => s.dbs.find(d => d.key === k);
assert.deepStrictEqual([by('tasks').missing, by('tasks').wrong], [[], []], 'Master Task List complete (extra columns are fine)');
assert.deepStrictEqual(by('dates').missing, [{ name: 'Date', type: 'date' }]);
assert.deepStrictEqual(by('library').wrong, [{ name: 'Rating', want: 'number', got: 'rich_text' }]);
assert.strictEqual(by('apiary').error, 'notion_not_shared', 'not connected is said, not counted as missing columns');
assert.strictEqual(by('apiary').missing.length, 0);
assert.ok(calls.every(c => c.startsWith('get ')), 'read-only: ' + calls.filter(c => !c.startsWith('get ')).join(', '));

// cached: no Notion calls the second time; fresh asks again
calls = [];
get({ action: 'schema', key }); assert.strictEqual(calls.length, 0, 'from the cache');
sources['ds-dates'].Date = col('date'); delete sources['ds-dates'].When;
assert.strictEqual(get({ action: 'schema', key }).dbs.find(d => d.key === 'dates').missing.length, 1, 'still the cached answer');
assert.strictEqual(get({ action: 'schema', key, fresh: '1' }).dbs.find(d => d.key === 'dates').missing.length, 0, 'fresh sees the fix');

// without the Notion key
delete props.NOTION_TOKEN; delete cache.schema;
assert.strictEqual(get({ action: 'schema', key }).error, 'notion_not_configured');
console.log('ALL SCHEMA CHECKS PASSED');
