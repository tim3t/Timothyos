// Apiary (bridge 1.26): the yard, hives and checks read back in one call (hives by Data.order,
// Data read from its first "{" so a note before it is harmless); a hive saved; a check saved
// against its hive (title from the hive's name and the date, Hive relation set, boxes written to the
// hive's Data); cid makes a retry harmless, id changes one in place; one yard only; checks and
// hives to Notion's trash, never the yard; pages outside the Apiary and bad input refused; every stack piece
// (deep, medium, super, feeder, queen excluder) with frame counts (1.28).
// All names and notes are sample text.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const TDB = '548f88460e014b17a521dba092160da2', TDS = 'ds-apiary', ODS = 'ds-other';
const pages = { [TDS]: [], [ODS]: [] }; let n = 0;
const id = p => p + String(++n).padStart(30, '0');
const val = v => v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v;
const txt = r => (r || []).map(t => t.plain_text).join('');
function match(pg, f) {
  if (!f) return true;
  if (f.and) return f.and.every(g => match(pg, g));
  if (f.or) return f.or.some(g => match(pg, g));
  const p = pg.properties[f.property];
  if (f.select) return !!(p && p.select && p.select.name === f.select.equals);
  if (f.checkbox) return !!(p && p.checkbox) === f.checkbox.equals;
  if (f.rich_text) return !!p && txt(p.rich_text) === f.rich_text.equals;
  if (f.date) { const d = p && p.date && p.date.start; if (!d) return false; if (f.date.on_or_after && d < f.date.on_or_after) return false; if (f.date.on_or_before && d > f.date.on_or_before) return false; return true; }
  throw new Error('filter ' + JSON.stringify(f));
}
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + TDB) return res(200, { data_sources: [{ id: TDS }] });
  let mm = path.match(/^\/data_sources\/([^/]+)\/query$/);
  if (mm && m === 'post') return res(200, { results: pages[mm[1]].filter(p => !p.in_trash && match(p, body.filter)), has_more: false });
  if (m === 'post' && path === '/pages') {
    const ds = body.parent.data_source_id, pr = {};
    Object.keys(body.properties).forEach(k => { pr[k] = val(body.properties[k]); });
    const pg = { id: id('p'), url: 'https://notion.so/x', parent: { type: 'data_source_id', data_source_id: ds }, created_time: '2026-10-19T12:00:00.000Z', properties: pr };
    pages[ds].push(pg); return res(200, pg);
  }
  mm = path.match(/^\/pages\/([^/]+)$/);
  if (mm) {
    const pg = pages[TDS].concat(pages[ODS]).find(p => p.id === mm[1]);
    if (!pg) return res(404, { message: 'not found' });
    if (m === 'get') return res(200, pg);
    if (m === 'patch') { if (body.in_trash) pg.in_trash = true; Object.keys(body.properties || {}).forEach(k => { pg.properties[k] = val(body.properties[k]); }); return res(200, pg); }
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
const get = q => JSON.parse(ctx.doGet({ parameter: Object.assign({ key }, q) }).text);

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
assert.strictEqual(pages[TDS].find(p => p.id === ha).properties.Kind.select.name, 'Hive');
cache.agen = 'x1';
// a Data value with a note before the JSON (as an import may leave) still reads
pages[TDS].find(p => p.id === hb).properties.Data = { rich_text: [{ plain_text: 'TimothyOS ' + JSON.stringify({ order: 2, paint: '#9c2f2a', boxes: boxes }) }] };
a = get({ action: 'apiary' });
assert.deepStrictEqual(a.hives.map(h => h.name), ['Hive A', 'Hive B']);
assert.deepStrictEqual([a.hives[1].queen, a.hives[1].data.paint, a.hives[1].data.boxes.length, a.hives[0].notes], ['Queen B', '#9c2f2a', 3, 'Sample note']);

// ---- a check: title from the hive, relation, numbers, boxes written to the hive
const chk = { kind: 'check', cid: 'k-0001-abcd', hive: hb, day: '2026-10-19', who: 'Solo', queen: 'Eggs, larvae', frames: 'Bottom deep 9 of 10', mood: 'Calm', did: 'Fed', next: 'Sample next', mites: 1.7, honey: null,
  data: { deeps: [9, 3], capped: 50 }, boxes: [{ k: 'super', fill: 0.5 }, { k: 'deep', drawn: 3 }, { k: 'deep', drawn: 9 }] };
r = post({ action: 'apiarysave', item: chk });
assert.ok(r.ok, JSON.stringify(r));
const cp = pages[TDS].find(p => p.id === r.item.id);
assert.strictEqual(txt(cp.properties.Name.title), 'Hive B · 19 Oct 2026');
assert.deepStrictEqual(cp.properties.Hive, { relation: [{ id: hb }] });
assert.deepStrictEqual([cp.properties['Mites (%)'].number, cp.properties['Honey (lb)'].number, txt(cp.properties.Temperament.rich_text)], [1.7, null, 'Calm']);
assert.deepStrictEqual([r.item.hive, r.item.mites, r.item.mood, r.item.data.deeps[0]], [hb, 1.7, 'Calm', 9]);
assert.deepStrictEqual(r.hive.data.boxes.map(b => b.drawn != null ? b.drawn : b.fill), [0.5, 3, 9]);
assert.strictEqual(r.hive.data.paint, '#9c2f2a', 'the rest of the hive\'s Data is kept');
// a retry with the same cid: no second page
const before = pages[TDS].length;
r = post({ action: 'apiarysave', item: chk });
assert.ok(r.ok && r.duplicate); assert.strictEqual(pages[TDS].length, before);
// changed in place by id
r = post({ action: 'apiarysave', item: Object.assign({}, chk, { cid: undefined, id: cp.id, notes: 'Changed', honey: 12.25, mites: null, boxes: undefined }) });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([txt(cp.properties.Notes.rich_text), cp.properties['Honey (lb)'].number, cp.properties['Mites (%)'].number, r.hive], ['Changed', 12.3, null, null]);
a = get({ action: 'apiary' });
assert.deepStrictEqual([a.checks.length, a.checks[0].honey], [1, 12.3]);

// ---- the yard: one only
r = post({ action: 'apiarysave', item: { kind: 'yard', cid: 'y-0001-abcd', name: 'Sample Yard', notes: 'Site note', data: { facing: 'SE', list: [{ t: 'Buy a thing', done: false }] } } });
assert.ok(r.ok, JSON.stringify(r));
r = post({ action: 'apiarysave', item: { kind: 'yard', cid: 'y-0002-abcd', name: 'Sample Yard', data: { facing: 'S', list: [] } } });
assert.strictEqual(pages[TDS].filter(p => p.properties.Kind.select.name === 'Yard').length, 1);
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
pages[ODS].push({ id: id('o'), parent: { type: 'data_source_id', data_source_id: ODS }, properties: { Kind: { select: { name: 'Hive' } } } });
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'check', cid: 'x-0011-abcd', hive: cp.id, day: '2026-10-19' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'check', cid: 'x-0012-abcd', hive: pages[ODS][0].id, day: '2026-10-19' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'hive', id: pages[ODS][0].id, name: 'x' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiarysave', item: { kind: 'hive', id: cp.id, name: 'x' } }).error, 'not_writable', 'a check is not a hive');

// ---- 1.28: every piece a stack can hold, with frame counts; anything else refused
const full = [{ k: 'feeder', level: 'LOW' }, { k: 'super', n: 9, drawn: 6, fill: 0.5 }, { k: 'excluder' }, { k: 'medium', n: 10, drawn: 4, fill: null }, { k: 'deep', n: 10, drawn: 9 }, { k: 'deep', drawn: null }];
r = post({ action: 'apiarysave', item: { kind: 'hive', id: ha, name: 'Hive A', data: { order: 1, boxes: full, trued: '2026-10-21' } } });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.item.data.boxes.map(b => b.k), ['feeder', 'super', 'excluder', 'medium', 'deep', 'deep']);
[[{ k: 'escape' }], [{ k: 'super', n: 9, drawn: 10 }], [{ k: 'deep', n: 20 }], [{ k: 'deep', fill: 0.5 }], [{ k: 'feeder', level: 'HALF' }], [{ k: 'excluder', drawn: 1 }], Array(13).fill({ k: 'deep' })]
  .forEach(bx => { const x = post({ action: 'apiarysave', item: { kind: 'hive', id: ha, name: 'Hive A', data: { boxes: bx } } }); assert.strictEqual(x.error, 'bad_request', JSON.stringify(bx)); });

// ---- remove: a check to the trash; the yard and outside pages refused
r = post({ action: 'apiaryremove', id: cp.id });
assert.ok(r.ok && cp.in_trash, JSON.stringify(r));
assert.strictEqual(post({ action: 'apiaryremove', id: pages[TDS].find(p => p.properties.Kind.select.name === 'Yard').id }).error, 'not_writable');
assert.strictEqual(post({ action: 'apiaryremove', id: pages[ODS][0].id }).error, 'not_writable');
a = get({ action: 'apiary' });
assert.deepStrictEqual([a.checks.length, a.hives.length], [0, 2]);
// and it batches
const bt = get({ action: 'batch', calls: JSON.stringify([{ action: 'apiary' }]) });
assert.ok(bt.results[0].ok && bt.results[0].hives.length === 2);
console.log('apiary bridge ok');
