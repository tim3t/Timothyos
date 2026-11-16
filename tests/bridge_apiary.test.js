// Apiary (bridge 1.26): the yard, hives and checks read back in one call (hives by Data.order,
// Data read from its first "{" so a note before it is harmless); a hive saved; a check saved
// against its hive (title from the hive's name and the date, Hive relation set, boxes written to the
// hive's Data); cid makes a retry harmless, id changes one in place; one yard only; checks and
// hives to Notion's trash, never the yard; pages outside the Apiary and bad input refused; every stack piece
// (deep, medium, super, feeder, queen excluder) with frame counts (1.28).
// All names and notes are sample text.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), nx = br.nx, cache = br.cache;
const post = br.post, get = br.post;
const data = id => JSON.parse(nx.row(id).Data);

const caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('apiary'), caps.join());

// ---- an empty apiary reads cleanly
let a = get({ action: 'apiary' });
assert.ok(a.ok, JSON.stringify(a));
assert.deepStrictEqual([a.yard, a.hives.length, a.checks.length], [null, 0, 0]);

// ---- hives: the second one is first by order
const boxes = [{ k: 'super', fill: null }, { k: 'deep', drawn: null }, { k: 'deep', drawn: 8 }];
let r = post({ action: 'apiarysave', item: { kind: 'hive', cid: 'h-0001-abcd', name: 'Hive B', day: '2026-03-21', queen: 'Queen B', data: { order: 2, paint: '#9c2f2a', boxes: boxes } } });
assert.ok(r.ok, JSON.stringify(r));
const hb = r.item.id;
r = post({ action: 'apiarysave', item: { kind: 'hive', cid: 'h-0002-abcd', name: 'Hive A', day: '2026-03-21', queen: 'Queen A', notes: 'Sample note', data: { order: 1, boxes: [{ k: 'deep', drawn: 5 }] } } });
const ha = r.item.id;
assert.strictEqual(nx.row(ha).Kind, 'Hive');
cache.agen = 'x1';
// a Data value with a note before the JSON (as an import may leave) still reads
nx.edit(hb, { Data: 'TimothyOS ' + JSON.stringify({ order: 2, paint: '#9c2f2a', boxes: boxes }) });
a = get({ action: 'apiary' });
assert.deepStrictEqual(a.hives.map(h => h.name), ['Hive A', 'Hive B']);
assert.deepStrictEqual([a.hives[1].queen, a.hives[1].data.paint, a.hives[1].data.boxes.length, a.hives[0].notes], ['Queen B', '#9c2f2a', 3, 'Sample note']);

// ---- a check: title from the hive, relation, numbers, boxes written to the hive
const chk = { kind: 'check', cid: 'k-0001-abcd', hive: hb, day: '2026-10-19', who: 'Solo', queen: 'Eggs, larvae', frames: 'Bottom deep 9 of 10', mood: 'Calm', did: 'Fed', next: 'Sample next', mites: 1.7, honey: null,
  data: { deeps: [9, 3], capped: 50 }, boxes: [{ k: 'super', fill: 0.5 }, { k: 'deep', drawn: 3 }, { k: 'deep', drawn: 9 }] };
r = post({ action: 'apiarysave', item: chk });
assert.ok(r.ok, JSON.stringify(r));
const cp = r.item.id;
assert.strictEqual(nx.row(cp).Name, 'Hive B · 19 Oct 2026');
assert.deepStrictEqual(nx.row(cp).Hive, [hb]);
assert.deepStrictEqual([nx.row(cp)['Mites (%)'], nx.row(cp)['Honey (lb)'], nx.row(cp).Temperament], [1.7, null, 'Calm']);
assert.deepStrictEqual([r.item.hive, r.item.mites, r.item.mood, r.item.data.deeps[0]], [hb, 1.7, 'Calm', 9]);
assert.deepStrictEqual(r.hive.data.boxes.map(b => b.drawn != null ? b.drawn : b.fill), [0.5, 3, 9]);
assert.strictEqual(r.hive.data.paint, '#9c2f2a', 'the rest of the hive\'s Data is kept');
assert.deepStrictEqual([data(hb).boxes, data(hb).paint], [chk.boxes, '#9c2f2a'], 'and the stack is in the hive\'s page');
// a retry with the same cid: no second page
const before = nx.rows('apiary').length;
r = post({ action: 'apiarysave', item: chk });
assert.ok(r.ok && r.duplicate); assert.strictEqual(nx.rows('apiary').length, before);
// changed in place by id
r = post({ action: 'apiarysave', item: Object.assign({}, chk, { cid: undefined, id: cp, notes: 'Changed', honey: 12.25, mites: null, boxes: undefined }) });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([nx.row(cp).Notes, nx.row(cp)['Honey (lb)'], nx.row(cp)['Mites (%)'], r.hive], ['Changed', 12.3, null, null]);
a = get({ action: 'apiary' });
assert.deepStrictEqual([a.checks.length, a.checks[0].honey], [1, 12.3]);

// ---- the yard: one only
r = post({ action: 'apiarysave', item: { kind: 'yard', cid: 'y-0001-abcd', name: 'Sample Yard', notes: 'Site note', data: { facing: 'SE', list: [{ t: 'Buy a thing', done: false }] } } });
assert.ok(r.ok, JSON.stringify(r));
r = post({ action: 'apiarysave', item: { kind: 'yard', cid: 'y-0002-abcd', name: 'Sample Yard', data: { facing: 'S', list: [] } } });
assert.strictEqual(nx.rows('apiary').filter(p => p.Kind === 'Yard').length, 1);
a = get({ action: 'apiary' });
assert.deepStrictEqual([a.yard.name, a.yard.data.facing], ['Sample Yard', 'S']);

// ---- refused
const refused = [
  { kind: 'nest', cid: 'x-0001-abcd', name: 'x' },
  { kind: 'hive', cid: 'x-0002-abcd', name: '' },
  { kind: 'hive', cid: 'x-0003-abcd', name: 'x'.repeat(61) },
  { kind: 'check', cid: 'x-0004-abcd', hive: hb },                                   // no date
  { kind: 'check', cid: 'x-0005-abcd', hive: hb, day: '2026-02-30' },
  { kind: 'check', cid: 'x-0006-abcd', hive: hb, day: '2026-10-19', mites: 101 },
  { kind: 'check', cid: 'x-0007-abcd', hive: hb, day: '2026-10-19', notes: 'x'.repeat(2001) },
  { kind: 'check', cid: 'x-0008-abcd', hive: hb, day: '2026-10-19', boxes: [{ k: 'deep', drawn: 11 }] },
  { kind: 'hive', cid: 'x-0009-abcd', name: 'x', data: { boxes: [] } },
  { kind: 'hive', cid: 'x-0010-abcd', name: 'x', data: [1] },
  { kind: 'hive', name: 'x' }                                                        // neither id nor cid
];
refused.forEach(it => { const x = post({ action: 'apiarysave', item: it }); assert.strictEqual(x.error, 'bad_request', JSON.stringify(it) + ' ' + JSON.stringify(x)); });
// a check pointing at something that isn't a hive, or a page outside the Apiary
nx.define('other', { columns: { Name: 'title', Kind: 'select' } });
const other = nx.add('other', { Name: 'Not a hive', Kind: 'Hive' });
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'check', cid: 'x-0011-abcd', hive: cp, day: '2026-10-19' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'check', cid: 'x-0012-abcd', hive: other, day: '2026-10-19' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'hive', id: other, name: 'x' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'hive', id: cp, name: 'x' } }).error, 'not_writable', 'a check is not a hive');
assert.ok(!nx.calls.some(c => c.method === 'patch' && c.path === '/pages/' + other), 'a page outside the Apiary is never written');

// ---- 1.28: every piece a stack can hold, with frame counts; anything else refused
const full = [{ k: 'feeder', level: 'LOW' }, { k: 'super', n: 9, drawn: 6, fill: 0.5 }, { k: 'excluder' }, { k: 'medium', n: 10, drawn: 4, fill: null }, { k: 'deep', n: 10, drawn: 9 }, { k: 'deep', drawn: null }];
r = post({ action: 'apiarysave', item: { kind: 'hive', id: ha, name: 'Hive A', data: { order: 1, boxes: full, trued: '2026-10-21' } } });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.item.data.boxes.map(b => b.k), ['feeder', 'super', 'excluder', 'medium', 'deep', 'deep']);
[[{ k: 'escape' }], [{ k: 'super', n: 9, drawn: 10 }], [{ k: 'deep', n: 20 }], [{ k: 'deep', fill: 0.5 }], [{ k: 'feeder', level: 'HALF' }], [{ k: 'excluder', drawn: 1 }], Array(13).fill({ k: 'deep' })]
  .forEach(bx => { const x = post({ action: 'apiarysave', item: { kind: 'hive', id: ha, name: 'Hive A', data: { boxes: bx } } }); assert.strictEqual(x.error, 'bad_request', JSON.stringify(bx)); });

// ---- remove: a check to the trash; the yard and outside pages refused
r = post({ action: 'apiaryremove', id: cp });
assert.ok(r.ok && nx.row(cp).in_trash, JSON.stringify(r));
assert.strictEqual(post({ action: 'apiaryremove', id: nx.rows('apiary').find(p => p.Kind === 'Yard').id }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiaryremove', id: other }).error, 'not_writable');
assert.strictEqual(nx.rows('apiary', { trash: true }).find(p => p.Kind === 'Yard').in_trash, false, 'the yard stays');
a = get({ action: 'apiary' });
assert.deepStrictEqual([a.checks.length, a.hives.length], [0, 2]);
// and it batches
const bt = get({ action: 'batch', calls: JSON.stringify([{ action: 'apiary' }]) });
assert.ok(bt.results[0].ok && bt.results[0].hives.length === 2);
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('apiary bridge ok');
