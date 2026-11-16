// Profile sync and Upkeep in the bridge (1.36). profile / profileput: settings from each iPad, kept compressed in
// pieces in the bridge's own User Properties; a newer change wins item by item; AUDIO's places merge episode by
// episode; keys, tokens, drafts and AI switches are refused; too large is refused, not cut. upkeep / upkeepsave /
// upkeepremove: one Notion page per item, found again by its App ID, so a save from either iPad lands on the same
// page; remove moves it to the trash. Invented items.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { ACCESS_KEY: null, NOTION_TOKEN: 'ntn_test' }, notion: {} }), { ctx, props, user, nx } = br, logs = br.log;
ctx.setup(); const key = props.ACCESS_KEY;
const get = br.call, post = br.post;

// ---- the setup lines and capabilities
assert.ok(logs.includes('Profile sync: OK (nothing synced yet; turn it on in SYSTEMS on an iPad)'), logs.filter(l => /Profile/.test(l)).join(' | '));
assert.ok(logs.includes('Notion upkeep: OK (0 items)'), logs.filter(l => /upkeep/i.test(l)).join(' | '));
const caps = get({ action: 'ping', key }).capabilities;
assert.ok(caps.includes('profile') && caps.includes('upkeep'));
assert.ok(!get({ action: 'profile' }).ok, 'needs the key');

// ---- profile: empty, then Hub sends, then Mobile sends
let p = get({ action: 'profile', key });
assert.deepStrictEqual([p.ok, p.rev, p.items], [true, 0, {}]);
const T = 1793500000000;
p = post({ action: 'profileput', items: { 'tos.holo.v1': { v: { chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel' }] }, at: T, by: 'HUB' }, 'tos.standby.v1': { v: 15, at: T, by: 'HUB' },
  'tos.plays.v1': { v: { '/Podcasts/Show A/1.mp3': { p: 100, d: 600, at: T }, '/Podcasts/Show A/2.mp3': { p: 50, d: 600, at: T } }, at: T, by: 'HUB' } } });
assert.ok(p.ok && p.rev === 1, JSON.stringify(p).slice(0, 200));
assert.ok(Number(user.prof_n) >= 1 && user.prof_0 && !/Test Channel/.test(user.prof_0), 'stored compressed');
// an older change loses; a newer one wins; places merge episode by episode
p = post({ action: 'profileput', items: { 'tos.standby.v1': { v: 30, at: T - 1000, by: 'MOBILE' }, 'tos.holo.v1': { v: { chans: [] }, at: T + 5000, by: 'MOBILE' },
  'tos.plays.v1': { v: { '/Podcasts/Show A/1.mp3': { p: 400, d: 600, at: T + 9000 }, '/Podcasts/Show A/2.mp3': { p: 10, d: 600, at: T - 9000 }, '/Podcasts/Show B/1.mp3': { p: 5, d: 60, at: T + 1 } }, at: T + 9000, by: 'MOBILE' } } });
assert.strictEqual(p.items['tos.standby.v1'].v, 15, 'older change loses');
assert.deepStrictEqual([p.items['tos.holo.v1'].v.chans, p.items['tos.holo.v1'].by], [[], 'MOBILE'], 'newer change wins');
const pl = p.items['tos.plays.v1'];
assert.deepStrictEqual([pl.v['/Podcasts/Show A/1.mp3'].p, pl.v['/Podcasts/Show A/2.mp3'].p, !!pl.v['/Podcasts/Show B/1.mp3'], pl.by], [400, 50, true, 'MOBILE'], 'each episode keeps its newer place');
assert.strictEqual(p.rev, 2);
assert.strictEqual(get({ action: 'profile', key }).items['tos.plays.v1'].v['/Podcasts/Show A/1.mp3'].p, 400, 'read back after a reload of the store');
// nothing newer: no new revision
assert.strictEqual(post({ action: 'profileput', items: { 'tos.standby.v1': { v: 99, at: T - 5, by: 'MOBILE' } } }).rev, 2);
// keys, drafts, AI switches and unknown shapes are refused
['tos.conn.v1', 'tos.nas.v1', 'tos.ha.v1', 'tos.ldraft.v1', 'tos.logai.v1', 'tos.profile.v1', 'secret', '../x'].forEach(k => {
  assert.strictEqual(post({ action: 'profileput', items: { [k]: { v: 'x', at: T + 99999, by: 'HUB' } } }).error, 'bad_request', k);
});
assert.strictEqual(post({ action: 'profileput', items: { 'tos.pins.v1': { v: [], by: 'HUB' } } }).error, 'bad_request', 'no time');
assert.strictEqual(post({ action: 'profileput', items: [] }).error, 'bad_request');
// in batches too
assert.ok(get({ action: 'batch', key, calls: JSON.stringify([{ action: 'profile' }]) }).results[0].items['tos.holo.v1']);
// many pieces: a large profile is split under 9 KB a piece, and old pieces are cleared when it shrinks
const big = {}; for (let i = 0; i < 1500; i++) big['/Podcasts/Big/' + require('crypto').randomBytes(12).toString('hex') + '.mp3'] = { p: i, d: 3600, at: T + 20000 + i };
p = post({ action: 'profileput', items: { 'tos.plays.v1': { v: big, at: T + 50000, by: 'HUB' } } });
assert.ok(p.ok && Number(user.prof_n) > 3, 'pieces: ' + user.prof_n);
assert.ok(Object.values(user).every(v => v.length <= 9000), 'a property stays under 9 KB');
assert.strictEqual(Object.keys(p.items['tos.plays.v1'].v).length, 1500, 'at most 1500 places, the most recent');
// too large is refused, not cut
const huge = { a: require('crypto').randomBytes(400000).toString('base64') };
assert.strictEqual(post({ action: 'profileput', items: { 'tos.ressikan.v1': { v: huge, at: T + 60000, by: 'HUB' } } }).error, 'too_large');
assert.ok(!get({ action: 'profile', key }).items['tos.ressikan.v1'], 'nothing half-stored');

// ---- upkeep
let u = get({ action: 'upkeep', key });
assert.deepStrictEqual([u.ok, u.items], [true, []]);
const item = { id: 'u1', name: 'Change furnace filter', cat: 'House', every: 3, unit: 'months', last: '2026-08-01', lastRead: null, read: null, hist: ['2026-05-01', '2026-08-01'] };
let r = post({ action: 'upkeepsave', item });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.item, Object.assign({ page: r.item.page }, item));
assert.strictEqual(nx.row(r.item.page)['App ID'], 'u1');
// the same id again, from the other iPad: the same page
r = post({ action: 'upkeepsave', item: Object.assign({}, item, { last: '2026-11-01', hist: item.hist.concat('2026-11-01') }) });
assert.strictEqual(nx.rows('upkeep').length, 1, 'one page per item');
assert.ok(nx.calls.filter(c => c.method === 'post' && c.path === '/pages').every(c => c.body.parent.data_source_id === nx.ds('upkeep')), 'made in Upkeep, nowhere else');
u = get({ action: 'upkeep', key });
assert.deepStrictEqual([u.items.length, u.items[0].last, u.items[0].hist.length], [1, '2026-11-01', 3], 'fresh after a save (no stale cache)');
post({ action: 'upkeepsave', item: { id: 'tractor', name: 'Tractor oil', cat: 'Farm', every: 100, unit: 'hours', last: '2026-09-02', lastRead: 410, read: 455, hist: [] } });
assert.deepStrictEqual(get({ action: 'upkeep', key }).items.map(x => [x.id, x.read]), [['u1', null], ['tractor', 455]], 'by name');
// bad items refused
[{ id: 'x' }, Object.assign({}, item, { id: 'bad id!' }), Object.assign({}, item, { unit: 'fortnights' }), Object.assign({}, item, { every: 0 }), Object.assign({}, item, { last: '2026-02-30' }), Object.assign({}, item, { read: -1 })]
  .forEach(b => assert.strictEqual(post({ action: 'upkeepsave', item: b }).error, 'bad_request', JSON.stringify(b)));
// remove: to the trash; removing again is fine
{ const rr = post({ action: 'upkeepremove', id: 'u1' }); assert.ok(rr.ok, JSON.stringify(rr)); assert.ok(nx.rows('upkeep', { trash: true }).find(x => x['App ID'] === 'u1').in_trash, 'in the trash'); }
assert.deepStrictEqual(get({ action: 'upkeep', key }).items.map(x => x.id), ['tractor']);
assert.ok(post({ action: 'upkeepremove', id: 'u1' }).ok, 'already gone: fine');
assert.strictEqual(post({ action: 'upkeepremove', id: '' }).error, 'bad_request');
// 1.36.1: long text is cut into Notion's 2,000-character pieces without splitting an emoji (two JavaScript characters)
{
  const t = 'a'.repeat(1999) + '🐝' + 'b'.repeat(10), parts = ctx.pieces_(t, 3);
  assert.strictEqual(parts.join(''), t, 'nothing lost');
  assert.strictEqual(parts[0].length, 1999, 'the cut moves before the emoji');
  assert.ok(parts.every(x => !/[\uD800-\uDBFF]$/.test(x) && !/^[\uDC00-\uDFFF]/.test(x)), 'no half emoji at either end');
  assert.strictEqual(ctx.rt_('x'.repeat(4000)).length, 2, 'plain text: still 2,000 a piece');
  const long = ('Notes 🐝 ').repeat(700), lr = ctx.logRich_(long);
  assert.strictEqual(lr.map(res => res.text.content).join(''), long);
  assert.ok(lr.every(res => res.text.content.length <= 2000));
  const up = post({ action: 'upkeepsave', item: { id: 'emo1', name: 'Hive 🐝 frames ☀️', every: 1, unit: 'weeks', hist: [] } });
  assert.strictEqual(up.item.name, 'Hive 🐝 frames ☀️', 'emoji kept through Notion and back');
}
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('bridge profile + upkeep: ok');
