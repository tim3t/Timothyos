// Tarot Books (bridge 1.25): IMPORT BOOKS turns the import file (a JSON file on a page with no card) into one page
// per card per book, leaving existing pages alone; a card's passages are read back as sections (cached, fresh=1 reads
// again); SUGGEST sends that card's passages, position, question and notes to Claude with no tools and saves nothing;
// a whole reading sends only the core of each passage; spend is counted; bad input, an empty library and the monthly
// pause are refused. Every passage here is placeholder text: the real book text lives only in Timothy's Notion.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const FILE_URL = 'https://files.example/tarot-books.json';
let fetchAlls = 0;
const txt = r => (r || []).map(t => t.plain_text).join('');
const sec = (h, p) => ({ h, p });
const FILE = { v: 1, cards: [
  { code: 'M7', book: 'dean', source: 'Chapter 4, page 1', sections: [sec('AT A GLANCE', ['• Number: VII', '• Key Meanings: sample keywords']), sec('UNDERSTANDING THE CHARIOT', ['Sample description.']), sec('UPRIGHT MEANING', ['Sample upright passage.', '• Home: sample line']), sec('REVERSED MEANING', ['Sample reversed passage.']), sec('HIS WISDOM MESSAGE', ['Sample wisdom.']), sec('THE CHARIOT’S SYMBOLS', ['Sample symbol notes.'])] },
  { code: 'M7', book: 'crispin', source: 'The Cards, page 2', sections: [sec('THE CARD', ['Sample picture.']), sec('HER READING', ['Sample creative reading.']), sec('RECOMMENDED MATERIALS', ['Sample film, by Someone'])] },
  { code: 'P4', book: 'dean', source: 'Chapter 5, page 3', sections: [sec('UPRIGHT MEANING', ['Sample four upright.']), sec('REVERSED MEANING', ['Sample four reversed.'])] },
  { code: 'P4', book: 'crispin', source: 'The Cards, page 4', sections: [sec('HER READING', ['Sample coins reading.'])] },
  { code: 'X9', book: 'dean', sections: [] },            // not a card: skipped
  { code: 'W8', book: 'someone', sections: [] }          // not one of the two books: skipped
] };
const claudeCalls = [];
function fetch(url, opts, res) {
  if (url === FILE_URL) { assert.ok(!opts.headers || !opts.headers.Authorization, 'the file link carries no Notion key'); return res(200, FILE); }
  if (/anthropic\.com/.test(url)) {
    const body = JSON.parse(opts.payload); claudeCalls.push(body);
    return res(200, { model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sample suggestion.' }], usage: { input_tokens: 4000, output_tokens: 200 } });
  }
}
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test', ANTHROPIC_API_KEY: 'sk-test' }, notion: {}, fetch }), { ctx, props, cache, nx } = br;
const fetchAll = ctx.UrlFetchApp.fetchAll;
ctx.UrlFetchApp.fetchAll = reqs => { fetchAlls++; return fetchAll(reqs); };
const post = br.post, get = br.post;
// the import page: no card, the file in its body
const imp = nx.add('tarotbooks', { Title: 'Import file' }, { blocks: [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Read once.' } }] } }, { type: 'file', file: { type: 'file', file: { url: FILE_URL } } }] });

const caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('tarotbooks') && caps.includes('tarotsuggest'), caps.join());

// ---- before the import: nothing yet, the file is there; asking for a suggestion says the books are empty
let r = get({ action: 'tarotbooks' });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([r.books.dean, r.books.crispin, r.per, r.file], [0, 0, 78, true]);
assert.ok(/notion\.so\/29cd2630/.test(r.url));
r = post({ action: 'tarotsuggest', mode: 'card', at: 0, cards: [{ id: 'M7', pos: 'PRESENT' }] });
assert.strictEqual(r.error, 'tarot_books_empty'); assert.strictEqual(claudeCalls.length, 0);

// ---- IMPORT BOOKS: four card pages; the two bad entries are skipped
r = post({ action: 'tarotbookimport' });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([r.made, r.left, r.books.dean, r.books.crispin], [4, 0, 2, 2]);
const made = nx.rows('tarotbooks').filter(p => p.id !== imp);
assert.strictEqual(made.length, 4);
const sends = nx.calls.filter(c => c.method === 'post' && c.path === '/pages');
assert.ok(sends.every(c => c.body.parent.data_source_id === nx.ds('tarotbooks')), 'each page in Tarot Books');
assert.ok(sends.every(c => c.body.children.length <= 100), 'at most 100 blocks a page');
const chariotDean = made.find(p => p.Card === 'M7' && p.Book === 'Liz Dean');
assert.strictEqual(chariotDean.Title, 'The Chariot · Liz Dean');
assert.strictEqual(chariotDean.Source, 'Chapter 4, page 1');
assert.strictEqual(chariotDean.Order, 14);   // deck position 7, Dean first
assert.strictEqual(made.find(p => p.Card === 'P4' && p.Book === 'Jessa Crispin').Order, (22 + 3 * 14 + 3) * 2 + 1);
const kb = nx.blocks(chariotDean.id);
assert.deepStrictEqual(kb.slice(0, 3).map(b => b.type), ['heading_3', 'bulleted_list_item', 'bulleted_list_item']);
assert.strictEqual(txt(kb[2].bulleted_list_item.rich_text), 'Key Meanings: sample keywords');
// again: nothing new, nothing doubled
r = post({ action: 'tarotbookimport' });
assert.deepStrictEqual([r.ok, r.made, r.left], [true, 0, 0]);
assert.strictEqual(nx.rows('tarotbooks').length, 5);
r = get({ action: 'tarotbooks' });
assert.deepStrictEqual([r.books.dean, r.books.crispin], [2, 2]);

// ---- a card's passages, Dean first, sections and list items as written; then from the cache
const calls0 = nx.calls.length;
r = get({ action: 'tarotbook', card: 'M7' });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.books.map(b => b.book), ['dean', 'crispin']);
assert.deepStrictEqual([r.books[0].name, r.books[0].title, r.books[0].source], ['Liz Dean', 'The Ultimate Guide to Tarot', 'Chapter 4, page 1']);
assert.deepStrictEqual(r.books[0].sections.map(s => s.h), ['AT A GLANCE', 'UNDERSTANDING THE CHARIOT', 'UPRIGHT MEANING', 'REVERSED MEANING', 'HIS WISDOM MESSAGE', 'THE CHARIOT’S SYMBOLS']);
assert.deepStrictEqual(r.books[0].sections[2].p, ['Sample upright passage.', '• Home: sample line']);
assert.ok(fetchAlls >= 1, 'both pages read at once');
const calls1 = nx.calls.length;
assert.ok(calls1 > calls0);
get({ action: 'tarotbook', card: 'M7' });
assert.strictEqual(nx.calls.length, calls1, 'the second read comes from the cache');
get({ action: 'tarotbook', card: 'M7', fresh: '1' });
assert.ok(nx.calls.length > calls1, 'fresh=1 reads Notion again');
assert.strictEqual(get({ action: 'tarotbook', card: 'M22' }).error, 'bad_request');
assert.deepStrictEqual(get({ action: 'tarotbook', card: 'W8' }).books, []);

// ---- SUGGEST one card: its full passages, the reading around it, no tools, nothing saved
const before = nx.rows('tarotbooks').length;
r = post({ action: 'tarotsuggest', mode: 'card', at: 1, q: 'Sample question', sname: 'PAST · PRESENT · FUTURE',
  cards: [{ id: 'W8', pos: 'PAST', note: 'Sample note' }, { id: 'M7', pos: 'PRESENT', mine: 'Sample meaning of mine' }, { id: 'P4', rev: true, pos: 'FUTURE' }] });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([r.mode, r.text], ['card', 'Sample suggestion.']);
assert.ok(r.cost > 0 && r.spend.calls === 1, JSON.stringify(r.spend));
let sent = claudeCalls[0], msg = sent.messages[0].content;
assert.ok(!sent.tools, 'no tools');
assert.ok(/Dean or Crispin/.test(sent.system) && /no em dashes/i.test(sent.system));
assert.ok(msg.includes('Sample symbol notes.') && msg.includes('Sample film, by Someone'), 'one card: the whole passage');
assert.ok(!msg.includes('Sample four upright.'), 'only the card asked about');
assert.ok(msg.includes('Question: Sample question') && msg.includes('2. PRESENT: The Chariot') && msg.includes('3. FUTURE: Four of Pentacles (reversed)'));
assert.ok(msg.includes('His own meaning for this card: Sample meaning of mine') && msg.includes('His note here so far: Sample note'));
assert.ok(/card 2 \(PRESENT: The Chariot\)/.test(msg));
assert.strictEqual(nx.rows('tarotbooks').length, before, 'nothing saved');
assert.strictEqual(JSON.parse(props.AI_LOG)[0].mode, 'tarot');

// ---- SUGGEST the whole reading: the core of each passage, reversed cards without the upright meaning
r = post({ action: 'tarotsuggest', mode: 'reading', q: 'Sample question', sum: 'Sample summary so far',
  cards: [{ id: 'M7', pos: 'PRESENT' }, { id: 'P4', rev: true, pos: 'FUTURE' }] });
assert.ok(r.ok, JSON.stringify(r));
msg = claudeCalls[1].messages[0].content;
assert.ok(msg.includes('Sample upright passage.') && msg.includes('Key Meanings: sample keywords') && !msg.includes('Number: VII'));
assert.ok(!msg.includes('Sample symbol notes.') && !msg.includes('Sample description.') && !msg.includes('Sample film'), 'core only');
assert.ok(msg.includes('Sample four reversed.') && !msg.includes('Sample four upright.'), 'reversed: the reversed meaning');
assert.ok(msg.includes('What he has written about the whole reading so far: Sample summary so far') && /whole spread/.test(msg));

// ---- refused: bad cards, a position that isn't there, the monthly pause
assert.strictEqual(post({ action: 'tarotsuggest', mode: 'card', at: 0, cards: [{ id: 'Z1' }] }).error, 'bad_request');
assert.strictEqual(post({ action: 'tarotsuggest', mode: 'card', at: 3, cards: [{ id: 'M7' }] }).error, 'bad_request');
assert.strictEqual(post({ action: 'tarotsuggest', mode: 'card', at: 0, cards: [] }).error, 'bad_request');
props.AI_SPEND = JSON.stringify({ month: ctx.aiMonth_(), usd: 99, calls: 3 });
assert.strictEqual(post({ action: 'tarotsuggest', mode: 'card', at: 0, cards: [{ id: 'M7' }] }).error, 'ai_budget');
assert.strictEqual(claudeCalls.length, 2);

// ---- an import step doesn't hold the script lock (saves elsewhere would wait and fail); two never overlap
cache.tbimporting = '1';
assert.strictEqual(post({ action: 'tarotbookimport' }).error, 'tarot_books_importing');
delete cache.tbimporting;
assert.ok(!/getScriptLock/.test(ctx.tarotBookImport_.toString()), 'no script lock in the import');
// ---- a save that waits too long for the lock answers "busy" (retried quietly by the app), not a server error
const realLock = ctx.LockService.getScriptLock;
ctx.LockService.getScriptLock = () => ({ waitLock() { throw new Error('Lock timeout: another process was holding the lock for too long.'); }, tryLock() { return false; }, releaseLock() {} });
r = post({ action: 'tarotsave', reading: { cid: 'c-lock-0001', day: '2026-10-19', spread: 'one', sname: 'ONE CARD', q: '', pos: [{ l: 'THE CARD', x: 0, y: 0 }], cards: [{ id: 'M0' }], notes: [''], sum: '' } });
assert.deepStrictEqual([r.ok, r.error], [false, 'busy']);
ctx.LockService.getScriptLock = realLock;

// ---- without the import file and with no pages, IMPORT says so
nx.clear('tarotbooks'); ctx.tbBump_();
assert.strictEqual(post({ action: 'tarotbookimport' }).error, 'tarot_books_no_file');
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('bridge tarot books ok');
