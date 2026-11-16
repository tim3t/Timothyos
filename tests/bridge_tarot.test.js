// Tarot (bridge 1.24): readings saved whole (cid makes a retry harmless, id changes one in place),
// read back by date range with their positions, cards and notes; one card for the week (marking a
// new one unmarks the old one in the same Monday-to-Sunday week); card meanings upserted per card and
// trashed when emptied; spreads saved; readings and spreads moved to Notion's trash; bad input refused.
// Questions and notes are sample text.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), nx = br.nx;
const post = br.post, get = br.post;
const live = () => nx.rows('tarot');

const caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('tarot'), caps.join());

// ---- a three-card reading
const three = { cid: 'c-0001-abcd', day: '2026-10-19', spread: 'ppf', sname: 'PAST · PRESENT · FUTURE', q: 'Sample question',
  pos: [{ l: 'PAST', x: 0, y: 0 }, { l: 'PRESENT', x: 1, y: 0 }, { l: 'FUTURE', x: 2, y: 0 }],
  cards: [{ id: 'W8', rev: false }, { id: 'M7' }, { id: 'P4', rev: true }], notes: ['a', 'b', 'c'], sum: 'Sample summary' };
let r = post({ action: 'tarotsave', reading: three });
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(live().length, 1);
const pg = r.reading.id;
assert.strictEqual(nx.row(pg).Cards, '1 PAST: Eight of Wands; 2 PRESENT: The Chariot; 3 FUTURE: Four of Pentacles (reversed)');
assert.strictEqual(nx.row(pg).Title, 'Sample question');
assert.strictEqual(nx.row(pg).Kind, 'Reading');
assert.deepStrictEqual([r.reading.cards.length, r.reading.cards[2].rev, r.reading.notes[1], r.reading.sum, r.reading.weekly], [3, true, 'b', 'Sample summary', false]);
// the same cid again (a retry): no second page
r = post({ action: 'tarotsave', reading: three });
assert.ok(r.ok && r.duplicate); assert.strictEqual(live().length, 1);
// changed in place by id
r = post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: undefined, id: pg, notes: ['a', 'b2', 'c'], sum: 'Changed' }) });
assert.ok(r.ok); assert.strictEqual(live().length, 1); assert.strictEqual(r.reading.notes[1], 'b2');

// ---- the card for the week: a new one in the same week unmarks the old one
const one = (cid, day, card) => ({ cid, day, spread: 'one', sname: 'ONE CARD', q: '', pos: [{ l: 'THE CARD', x: 0, y: 0 }], cards: [{ id: card }], notes: [''], sum: '', weekly: true });
r = post({ action: 'tarotsave', reading: one('c-0002-abcd', '2026-10-19', 'P8') });
assert.ok(r.ok && r.reading.weekly); const thisWeek = r.reading.id; assert.strictEqual(nx.row(thisWeek).Title, 'Card for the week: Eight of Pentacles');
const lastWeek = post({ action: 'tarotsave', reading: one('c-0003-abcd', '2026-10-12', 'M17') }).reading.id;   // last week: left alone
r = post({ action: 'tarotsave', reading: one('c-0004-abcd', '2026-10-21', 'C3') });  // Wednesday of the same week
assert.ok(r.ok);
assert.strictEqual(nx.row(thisWeek).Weekly, false, 'the earlier card this week is unmarked');
assert.strictEqual(nx.row(lastWeek).Weekly, true, 'last week keeps its card');
assert.strictEqual(nx.row(r.reading.id).Weekly, true, 'the new one is marked');
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
let ms = live().filter(p => p.Kind === 'Meaning');
assert.strictEqual(ms.length, 1); assert.strictEqual(ms[0].Interpretation, 'Practice, again.');
r = get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' });
assert.deepStrictEqual(r.meanings.map(m => [m.card, m.text]), [['P8', 'Practice, again.']]);
post({ action: 'tarotmeaning', card: 'P8', text: '' });
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).meanings.length, 0, 'emptied: to the trash');
assert.strictEqual(nx.row(ms[0].id).in_trash, true);
assert.strictEqual(post({ action: 'tarotmeaning', card: 'X9', text: 'nope' }).error, 'bad_request');

// ---- spreads
r = post({ action: 'tarotspread', spread: { nm: 'Week ahead', pos: [{ l: 'WORK', x: 0, y: 0 }, { l: 'HOME', x: 1, y: 0 }, { l: 'WATCH', x: 1, y: 1, c: 1 }] } });
assert.ok(r.ok); assert.strictEqual(r.spread.title, 'WEEK AHEAD'); assert.strictEqual(r.spread.pos[2].c, 1);
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).spreads.length, 1);
assert.strictEqual(post({ action: 'tarotspread', spread: { nm: 'Bad', pos: [{ l: '', x: 0, y: 0 }] } }).error, 'bad_request');

// ---- removal: only pages in the Tarot database
r = post({ action: 'tarotremove', id: pg });
assert.ok(r.ok); assert.ok(nx.row(pg).in_trash);
assert.strictEqual(get({ action: 'tarot', from: '2026-10-13', to: '2026-10-25' }).readings.length, 2);
nx.define('other', { columns: { Title: 'title' } });
const other = nx.add('other', { Title: 'Not a reading' });
assert.strictEqual(post({ action: 'tarotremove', id: other }).error, 'not_writable');
assert.strictEqual(post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: undefined, id: other }) }).error, 'not_writable');
assert.ok(!nx.calls.some(c => c.method === 'patch' && c.path === '/pages/' + other), 'a page outside Tarot is never written');

// ---- refused: unknown or repeated cards, positions not matching, bad dates and ranges
const bad = o => post({ action: 'tarotsave', reading: Object.assign({}, three, { cid: 'c-0099-abcd' }, o) }).error;
assert.strictEqual(bad({ cards: [{ id: 'M22' }, { id: 'W1' }, { id: 'W2' }] }), 'bad_request');
assert.strictEqual(bad({ cards: [{ id: 'W1' }, { id: 'W1' }, { id: 'W2' }] }), 'bad_request');
assert.strictEqual(bad({ pos: three.pos.slice(0, 2) }), 'bad_request');
assert.strictEqual(bad({ day: '2026-02-30' }), 'bad_request');
assert.strictEqual(bad({ q: 'x'.repeat(201) }), 'bad_request');
assert.strictEqual(get({ action: 'tarot', from: '2025-01-01', to: '2026-10-19' }).error, 'range_too_long');
assert.strictEqual(get({ action: 'tarot', from: '2026-10-19', to: '2026-10-01' }).error, 'bad_range');
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('tarot bridge ok');
