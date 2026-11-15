// A READ THAT STOPS AT ITS LIMIT SAYS SO (bridge 1.50, A3). queryAll_ reads at most maxPages x 100 rows; a read that
// stopped with rows still to come now answers with capped: [rows]. The simulated Notion here hands results back in
// pages of 100 (the real API's way, which no other bridge test does), with has_more and next_cursor. Checked: a read
// under its limit says nothing; over it, capped: [1000]; the cached answer (the next read within two minutes) says the
// same; a batch carries it on the read that was cut; the connection check's deliberate one-page counts never do; and
// once the rows fit again, a fresh read drops it. All rows are invented.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const ADB = '548f88460e014b17a521dba092160da2', ADS = 'ds-apiary';
let rows = [], queries = 0;
const check = i => ({ id: 'p' + String(i).padStart(31, '0'), url: 'https://notion.so/x', created_time: '2026-01-01T00:00:00.000Z',
  properties: { Name: { title: [{ plain_text: 'Sample check ' + i }] }, Kind: { select: { name: 'Check' } }, Date: { date: { start: '2026-06-01' } } } });
const fill = n => { rows = Array.from({ length: n }, (_, i) => check(i)); };
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + ADB) return res(200, { data_sources: [{ id: ADS }] });
  if (m === 'get' && path === '/data_sources/' + ADS) return res(200, { title: [{ plain_text: 'Apiary' }] });
  if (m === 'post' && path === '/data_sources/' + ADS + '/query') {
    queries++;
    const size = Math.min(body.page_size || 100, 100), from = Number(body.start_cursor || 0), page = rows.slice(from, from + size);
    return res(200, { results: page, has_more: from + size < rows.length, next_cursor: from + size < rows.length ? String(from + size) : null });
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: d => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: mock },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const fresh = () => { cache.agen = 'g' + Math.random(); };

// ---- under the limit: nothing said
fill(950); fresh();
let a = post({ action: 'apiary' });
assert.ok(a.ok, JSON.stringify(a).slice(0, 200));
assert.strictEqual(a.checks.length, 950);
assert.strictEqual(a.capped, undefined, 'a read that got everything says nothing');

// ---- over it: 1,000 rows read, and it says so
fill(1050); fresh();
a = post({ action: 'apiary' });
assert.strictEqual(a.checks.length, 1000, 'ten pages of 100');
assert.deepStrictEqual(a.capped, [1000]);

// ---- the cached answer says the same
const q0 = queries;
a = post({ action: 'apiary' });
assert.strictEqual(queries, q0, 'answered from the cache');
assert.deepStrictEqual(a.capped, [1000], 'a cached answer still says it was cut short');

// ---- in a batch, on the read that was cut
fresh();
const b = post({ action: 'batch', calls: [{ action: 'apiary' }] });
assert.ok(b.ok && b.results.length === 1, JSON.stringify(b).slice(0, 200));
assert.deepStrictEqual(b.results[0].capped, [1000]);
assert.strictEqual(b.capped, undefined, 'said by the read, not the batch');

// ---- the rows fit again: a fresh read drops it, and so does the cached one after it
fill(300); fresh();
a = post({ action: 'apiary' });
assert.strictEqual(a.capped, undefined);
a = post({ action: 'apiary' });
assert.strictEqual(a.capped, undefined, 'the remembered verdict went with it');

// ---- the connection check (one page on purpose) never carries it
fill(1050);
const ping = post({ action: 'ping' });
assert.ok(ping.ok && ping.capped === undefined);

console.log('A READ THAT STOPS AT ITS LIMIT SAYS SO: under, over, cached, batched, cleared: ok');
