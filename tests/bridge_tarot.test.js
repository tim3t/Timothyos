// Tarot (bridge 1.24): readings saved whole (cid makes a retry harmless, id changes one in place),
// read back by date range with their positions, cards and notes; one card for the week (marking a
// new one unmarks the old one in the same Monday-to-Sunday week); card meanings upserted per card and
// trashed when emptied; spreads saved; readings and spreads moved to Notion's trash; bad input refused.
// Questions and notes are sample text.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const TDB = '414eee50818e4ffd948e38f3923c0faf', TDS = 'ds-tarot', ODS = 'ds-other';
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
assert.ok(caps.includes('tarot'), caps.join());

// ---- a three-card reading
const three = { cid: 'c-0001-abcd', day: '2026-10-19', spread: 'ppf', sname: 'PAST · PRESENT · FUTURE', q: 'Sample question',
  pos: [{ l: 'PAST', x: 0, y: 0 }, { l: 'PRESENT', x: 1, y: 0 }, { l: 'FUTURE', x: 2, y: 0 }],
  cards: [{ id: 'W8', rev: false }, { id: 'M7' }, { id: 'P4', rev: true }], notes: ['a', 'b', 'c'], sum: 'Sample summary' };
let r = post({ action: 'tarotsave', reading: three });
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(pages[TDS].length, 1);
const pg = pages[TDS][0];
assert.strictEqual(txt(pg.properties.Cards.rich_text), '1 PAST: Eight of Wands; 2 PRESENT: The Chariot; 3 FUTURE: Four of Pentacles (reversed)');
assert.strictEqual(txt(pg.properties.Title.title), 'Sample question');
assert.strictEqual(pg.properties.Kind.select.name, 'Reading');
assert.deepStrictEqual([r.reading.cards.length, r.reading.cards[2].rev, r.reading.notes[1], r.reading.sum, r.reading.weekly], [3, true, 'b', 'Sample summary', false]);
// the same cid again (a retry): no second page
r = post({ action: 'tarotsave', reading: three });
assert.ok(r.ok && r.duplicate); assert.strictEqual(pages[TDS].length, 1);
// changed in place by id
r = post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: undefined, id: pg.id, notes: ['a', 'b2', 'c'], sum: 'Changed' }) });
assert.ok(r.ok); assert.strictEqual(pages[TDS].length, 1); assert.strictEqual(r.reading.notes[1], 'b2');

// ---- the card for the week: a new one in the same week unmarks the old one
const one = (cid, day, card) => ({ cid, day, spread: 'one', sname: 'ONE CARD', q: '', pos: [{ l: 'THE CARD', x: 0, y: 0 }], cards: [{ id: card }], notes: [''], sum: '', weekly: true });
r = post({ action: 'tarotsave', reading: one('c-0002-abcd', '2026-10-19', 'P8') });
assert.ok(r.ok && r.reading.weekly); assert.strictEqual(txt(pages[TDS][1].properties.Title.title), 'Card for the week: Eight of Pentacles');
post({ action: 'tarotsave', reading: one('c-0003-abcd', '2026-10-12', 'M17') });   // last week: left alone
r = post({ action: 'tarotsave', reading: one('c-0004-abcd', '2026-10-21', 'C3') });  // Wednesday of the same week
assert.ok(r.ok);
assert.strictEqual(pages[TDS][1].properties.Weekly.checkbox, false, 'the earlier card this week is unmarked');
assert.strictEqual(pages[TDS][2].properties.Weekly.checkbox, true, 'last week keeps its card');
// weekly needs exactly one card
assert.strictEqual(post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: 'c-0005-abcd', weekly: true }) }).error, 'bad_request');

// ---- read back by range, with meanings and spreads
r = get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' });
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(r.readings.length, 3, 'the week before is outside the range');
assert.ok(r.readings.every(x => x.day >= '2026-10-13'));
const rd = r.readings.find(x => x.spread === 'ppf');
assert.deepStrictEqual(rd.pos.map(p => p.l), ['PAST', 'PRESENT', 'FUTURE']);
assert.strictEqual(rd.sname, 'PAST · PRESENT · FUTURE'); assert.strictEqual(rd.q, 'Sample question');
assert.strictEqual(r.readings.find(x => x.weekly).q, '', 'a weekly card keeps an empty question');

// ---- meanings: one page per card, updated in place, trashed when emptied
r = post({ action: 'tarotmeaning', card: 'P8', text: 'Practice.' });
assert.ok(r.ok); assert.strictEqual(r.meaning.card, 'P8');
post({ action: 'tarotmeaning', card: 'P8', text: 'Practice, again.' });
let ms = pages[TDS].filter(p => p.properties.Kind.select.name === 'Meaning' && !p.in_trash);
assert.strictEqual(ms.length, 1); assert.strictEqual(txt(ms[0].properties.Interpretation.rich_text), 'Practice, again.');
r = get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' });
assert.deepStrictEqual(r.meanings.map(m => [m.card, m.text]), [['P8', 'Practice, again.']]);
post({ action: 'tarotmeaning', card: 'P8', text: '' });
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).meanings.length, 0, 'emptied: to the trash');
assert.strictEqual(post({ action: 'tarotmeaning', card: 'X9', text: 'nope' }).error, 'bad_request');

// ---- spreads
r = post({ action: 'tarotspread', spread: { nm: 'Week ahead', pos: [{ l: 'WORK', x: 0, y: 0 }, { l: 'HOME', x: 1, y: 0 }, { l: 'WATCH', x: 1, y: 1, c: 1 }] } });
assert.ok(r.ok); assert.strictEqual(r.spread.title, 'WEEK AHEAD'); assert.strictEqual(r.spread.pos[2].c, 1);
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).spreads.length, 1);
assert.strictEqual(post({ action: 'tarotspread', spread: { nm: 'Bad', pos: [{ l: '', x: 0, y: 0 }] } }).error, 'bad_request');

// ---- removal: only pages in the Tarot database
r = post({ action: 'tarotremove', id: pg.id });
assert.ok(r.ok); assert.ok(pg.in_trash);
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).readings.length, 2);
pages[ODS].push({ id: 'pother000000000000000000000000000', parent: { type: 'data_source_id', data_source_id: ODS }, properties: {} });
assert.strictEqual(post({ action: 'tarotremove', id: 'pother000000000000000000000000000' }).error, 'not_writable');
assert.strictEqual(post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: undefined, id: 'pother000000000000000000000000000' }) }).error, 'not_writable');

// ---- refused: unknown or repeated cards, positions not matching, bad dates and ranges
const bad = o => post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: 'c-0099-abcd' }, o) }).error;
assert.strictEqual(bad({ cards: [{ id: 'M22' }, { id: 'W1' }, { id: 'W2' }] }), 'bad_request');
assert.strictEqual(bad({ cards: [{ id: 'W1' }, { id: 'W1' }, { id: 'W2' }] }), 'bad_request');
assert.strictEqual(bad({ pos: three.pos.slice(0, 2) }), 'bad_request');
assert.strictEqual(bad({ day: '2026-02-30' }), 'bad_request');
assert.strictEqual(bad({ q: 'x'.repeat(201) }), 'bad_request');
assert.strictEqual(get({ action: 'tarot', from: '2025-01-01', to: '2026-10-19' }).error, 'range_too_long');
assert.strictEqual(get({ action: 'tarot', from: '2026-10-19', to: '2026-10-01' }).error, 'bad_range');
console.log('tarot bridge ok');
