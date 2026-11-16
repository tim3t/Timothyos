// ASTROMETRICS in the bridge (1.32): the year read returns finished tasks (Life Area and finish only, no titles)
// and Replicator Queue items bought (day and cost only) between two local midnights, at most 400 days apart;
// nothing written but the Completed date of a task finished without one (1.51); each part reports its own error;
// cached until a task changes.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { ACCESS_KEY: null, NOTION_TOKEN: 'ntn_test' }, notion: {} });
const { ctx, props, cache, nx } = br;
const farm = nx.add('tasks', { Task: 'Juniper task', Status: '✅ Done', 'Life Area': '🌿 Farm' }, { last_edited_time: '2026-03-02T15:00:00.000Z' });
const work = nx.add('tasks', { Task: 'Juniper task', Status: '✅ Done', 'Life Area': '🎯 Work' }, { last_edited_time: '2026-08-20T15:00:00.000Z' });
nx.add('queue', { Name: 'Bramble feeder', Cost: 24.5, Bought: '2026-05-01' });
nx.add('queue', { Name: 'Bramble feeder', Cost: null, Bought: '2026-09-12' });
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => br.call(p);
const F = '2026-01-01T06:00:00.000Z', T = '2027-01-01T06:00:00.000Z';
const queries = (k, from) => nx.calls.slice(from).filter(c => c.method === 'post' && c.path === '/data_sources/' + nx.ds(k) + '/query').map(c => JSON.stringify(c.body));

assert.ok(get({ action: 'ping', key }).capabilities.includes('year'), 'capability year with the Notion key');
let c0 = nx.calls.length;
const y = get({ action: 'year', key, from: F, to: T });
assert.ok(y.ok, JSON.stringify(y));
assert.deepStrictEqual(y.done, [{ area: '🌿 Farm', at: '2026-03-02T15:00:00.000Z' }, { area: '🎯 Work', at: '2026-08-20T15:00:00.000Z' }], 'Life Area and last edit only');
assert.ok(!JSON.stringify(y).includes('Juniper') && !JSON.stringify(y).includes('Bramble'), 'no titles');
assert.deepStrictEqual(y.bought, [{ day: '2026-05-01', cost: 24.5 }, { day: '2026-09-12', cost: null }]);
const tq = queries('tasks', c0);
assert.strictEqual(tq.length, 2, 'two task queries: by Completed, and by last edit where Completed is empty (1.51)');
assert.ok(tq.every(q => q.includes('"on_or_after":"' + F + '"') && q.includes('"before":"' + T + '"') && q.includes('✅ Done')), tq.join(' | '));
const qq = queries('queue', c0)[0];
assert.ok(qq.includes('"on_or_after":"2026-01-01"') && qq.includes('"before":"2027-01-01"'), qq);
const writes = nx.calls.slice(c0).filter(c => c.method !== 'get' && !/\/query$/.test(c.path));
assert.deepStrictEqual(writes.map(c => c.method + ' ' + c.path + ' ' + Object.keys(c.body.properties).join()), ['patch /pages/' + farm + ' Completed', 'patch /pages/' + work + ' Completed'],
  'nothing written but the Completed date of a task finished without one (1.51)');
assert.deepStrictEqual([nx.row(farm).Completed, nx.row(work).Completed], ['2026-03-02T15:00:00.000Z', '2026-08-20T15:00:00.000Z'], 'their last edit, written in once');

// cached; a task change (tgen) asks again, and the finish now comes from Completed
c0 = nx.calls.length; get({ action: 'year', key, from: F, to: T }); assert.strictEqual(nx.calls.length, c0, 'from the cache');
cache.tgen = 'x1'; const again = get({ action: 'year', key, from: F, to: T }); assert.ok(nx.calls.length > c0, 'asks again after a task change');
assert.deepStrictEqual(again.done, y.done, 'the same finish, now read from Completed');
assert.strictEqual(nx.calls.slice(c0).filter(c => c.method === 'patch').length, 0, 'written in once only');

// batched with the other reads
const b = get({ action: 'batch', key, calls: JSON.stringify([{ action: 'year', from: F, to: T }]) });
assert.ok(b.results[0].ok && b.results[0].done.length === 2);

// bad ranges
assert.strictEqual(get({ action: 'year', key, from: 'x', to: T }).error, 'bad_request');
assert.strictEqual(get({ action: 'year', key, from: T, to: F }).error, 'bad_request');
assert.strictEqual(get({ action: 'year', key, from: '2026-01-01T06:00:00.000Z', to: '2027-03-01T06:00:00.000Z' }).error, 'bad_request', 'over 400 days');

// the queue not connected: the tasks still come, the queue says why
nx.unshare('queue'); cache.tgen = 'x2';
delete props.NOTION_QUEUE_SOURCE;
const y2 = get({ action: 'year', key, from: F, to: T });
assert.ok(y2.ok && y2.done.length === 2 && y2.boughtError === 'notion_not_shared', JSON.stringify(y2));
assert.deepStrictEqual(nx.refused().map(c => c.method + ' ' + c.path + ' ' + c.refused.slice(0, 20)), ['get /databases/' + nx.dbId('queue') + ' 404 object_not_found'],
  'the bridge sent nothing Notion refuses (the one 404 is the queue taken off the integration)');
console.log('ALL YEAR CHECKS PASSED');
