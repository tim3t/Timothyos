// A READ THAT STOPS AT ITS LIMIT SAYS SO (bridge 1.50, A3). queryAll_ reads at most maxPages x 100 rows; a read that
// stopped with rows still to come now answers with capped: [rows]. The strict simulated Notion (lib/notion.js) hands results back in
// pages of 100, as the real API does, with has_more and next_cursor. Checked: a read
// under its limit says nothing; over it, capped: [1000]; the next read (too large for Google's cache, so read again) says the
// same; a batch carries it on the read that was cut; the connection check's deliberate one-page counts never do; and
// once the rows fit again, a fresh read drops it. All rows are invented.
const { bridge } = require('./lib/gas');
const assert = require('assert');
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), nx = br.nx, cache = br.cache, post = br.post;
const fill = n => { nx.clear('apiary'); for (let i = 0; i < n; i++) nx.add('apiary', { Name: 'Sample check ' + i, Kind: 'Check', Date: '2026-06-01' }, { created_time: '2026-01-01T00:00:00.000Z' }); };
const countQueries = () => nx.calls.filter(c => c.method === 'post' && /\/query$/.test(c.path)).length;
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

// ---- the next read: 1,000 checks are too large for Apps Script's cache (100 KB a value), so Notion is asked again
const q0 = countQueries();
a = post({ action: 'apiary' });
assert.ok(countQueries() > q0, 'read again: Google would refuse to cache an answer this size');
assert.deepStrictEqual(a.capped, [1000], 'and it still says it was cut short');

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

assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('A READ THAT STOPS AT ITS LIMIT SAYS SO: under, over, read again, batched, cleared: ok');
