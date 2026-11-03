// Headlines for the Morning Briefing (bridge 1.37): news reads NPR's National RSS feed (no key), keeps up to five items as
// {title, link, at} with entities and CDATA decoded and only https links, caches them 30 minutes, and says news_unavailable
// when the feed fails. The capability is always offered. Invented headlines.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = {}, cache = {}; let fetches = [], reply = { code: 200, body: '' };
const FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NPR Topics: National</title><link>https://www.npr.org/sections/national/</link>
<item><title>Sample town &amp; county reopen the river bridge</title><description>Words.</description><pubDate>Mon, 02 Nov 2026 15:00:00 -0500</pubDate><link>https://www.npr.org/2026/11/02/1/sample-bridge</link></item>
<item><title><![CDATA[Sample storm brings &#8216;rare&#8217; snow 🌨 to the plains]]></title><pubDate>Mon, 02 Nov 2026 14:00:00 -0500</pubDate><link>https://www.npr.org/2026/11/02/2/sample-snow</link></item>
<item><title>Not https, left out</title><link>http://example.invalid/x</link></item>
<item><title>Third sample headline</title><link>https://www.npr.org/2026/11/02/3/third</link></item>
<item><title>Fourth</title><link>https://www.npr.org/4</link></item><item><title>Fifth</title><link>https://www.npr.org/5</link></item><item><title>Sixth</title><link>https://www.npr.org/6</link></item>
</channel></rss>`;
const ctx = {
  console: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }), getUserProperties: () => ({ getProperty: () => null, setProperties() {}, deleteProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v, s) => { cache[k] = v; cache[k + ':ttl'] = s; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: d => d.toISOString() },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: (url) => { fetches.push(url); if (reply.throw) throw new Error('DNS'); return { getResponseCode: () => reply.code, getContentText: () => reply.body }; } },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY; fetches = [];   // setup checks other feeds
const get = p => JSON.parse(ctx.doGet({ parameter: Object.assign({ key }, p) }).text);

assert.ok(get({ action: 'ping' }).capabilities.includes('news'), 'always offered');
reply = { code: 200, body: FEED };
let j = get({ action: 'news' });
assert.ok(j.ok, JSON.stringify(j));
assert.strictEqual(j.source, 'NPR');
assert.deepStrictEqual(fetches, ['https://feeds.npr.org/1003/rss.xml'], 'NPR National');
assert.deepStrictEqual(j.items.map(x => x.title), ['Sample town & county reopen the river bridge', 'Sample storm brings ‘rare’ snow 🌨 to the plains', 'Third sample headline', 'Fourth', 'Fifth'], 'five, decoded, http left out');
assert.strictEqual(j.items[0].link, 'https://www.npr.org/2026/11/02/1/sample-bridge');
assert.strictEqual(j.items[0].at, 'Mon, 02 Nov 2026 15:00:00 -0500');
assert.strictEqual(cache['news:1:ttl'], 1800, 'kept 30 minutes');
// cached: no second fetch
get({ action: 'news' }); assert.strictEqual(fetches.length, 1);
// batched with the other reads
const b = JSON.parse(ctx.doGet({ parameter: { key, action: 'batch', calls: JSON.stringify([{ action: 'news' }]) } }).text);
assert.ok(b.results[0].ok && b.results[0].items.length === 5, JSON.stringify(b).slice(0, 200));
// the feed failing, or empty, or unreachable
for (const r of [{ code: 503, body: '' }, { code: 200, body: '<rss><channel></channel></rss>' }, { throw: true }]) {
  delete cache['news:1']; reply = r;
  assert.strictEqual(get({ action: 'news' }).error, 'news_unavailable', JSON.stringify(r));
}
// the briefing's rules: hives only when due, the routine left out, upkeep named, the news left to the app
const rules = vm.runInContext('BRIEF_RULES', ctx);
assert.ok(/hives only when the snapshot's HIVES line says/.test(rules) && !/the hive check window,/.test(rules), 'no daily hive window');
assert.ok(/only what is due, changed or unusual today/.test(rules) && /UPKEEP DUE/.test(rules) && /Don't write about the news/.test(rules));
console.log('bridge news: ok');
