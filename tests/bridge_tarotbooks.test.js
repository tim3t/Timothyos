// Tarot Books (bridge 1.25): IMPORT BOOKS turns the import file (a JSON file on a page with no card) into one page
// per card per book, leaving existing pages alone; a card's passages are read back as sections (cached, fresh=1 reads
// again); SUGGEST sends that card's passages, position, question and notes to Claude with no tools and saves nothing;
// a whole reading sends only the core of each passage; spend is counted; bad input, an empty library and the monthly
// pause are refused. Every passage here is placeholder text: the real book text lives only in Timothy's Notion.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test', ANTHROPIC_API_KEY: 'sk-test' }; const cache = {};
const BDB = '29cd26305cea4270a6c40f36cbe75511', BDS = 'ds-books', FILE_URL = 'https://files.example/tarot-books.json';
const pages = [], kids = {}; let n = 0, notionCalls = 0, fetchAlls = 0;
const id = p => p + String(++n).padStart(30, '0');
const val = v => v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v;
const txt = r => (r || []).map(t => t.plain_text).join('');
const blockOut = b => { const t = b.type, inner = b[t]; return { type: t, [t]: Object.assign({}, inner, inner.rich_text ? { rich_text: inner.rich_text.map(x => ({ plain_text: x.text.content })) } : {}) }; };
const sec = (h, p) => ({ h, p });
const FILE = { v: 1, cards: [
  { code: 'M7', book: 'dean', source: 'Chapter 4, page 1', sections: [sec('AT A GLANCE', ['• Number: VII', '• Key Meanings: sample keywords']), sec('UNDERSTANDING THE CHARIOT', ['Sample description.']), sec('UPRIGHT MEANING', ['Sample upright passage.', '• Home: sample line']), sec('REVERSED MEANING', ['Sample reversed passage.']), sec('HIS WISDOM MESSAGE', ['Sample wisdom.']), sec('THE CHARIOT’S SYMBOLS', ['Sample symbol notes.'])] },
  { code: 'M7', book: 'crispin', source: 'The Cards, page 2', sections: [sec('THE CARD', ['Sample picture.']), sec('HER READING', ['Sample creative reading.']), sec('RECOMMENDED MATERIALS', ['Sample film, by Someone'])] },
  { code: 'P4', book: 'dean', source: 'Chapter 5, page 3', sections: [sec('UPRIGHT MEANING', ['Sample four upright.']), sec('REVERSED MEANING', ['Sample four reversed.'])] },
  { code: 'P4', book: 'crispin', source: 'The Cards, page 4', sections: [sec('HER READING', ['Sample coins reading.'])] },
  { code: 'X9', book: 'dean', sections: [] },            // not a card: skipped
  { code: 'W8', book: 'someone', sections: [] }          // not one of the two books: skipped
] };
// the import page: no card, the file in its body
const imp = { id: id('i'), url: 'https://notion.so/import', parent: { data_source_id: BDS }, properties: { Title: { title: [{ plain_text: 'Import file' }] }, Card: { rich_text: [] } } };
pages.push(imp); kids[imp.id] = [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Read once.' }] } }, { type: 'file', file: { type: 'file', file: { url: FILE_URL } } }];
function match(pg, f) {
  if (!f) return true;
  const p = pg.properties[f.property];
  if (f.rich_text && 'equals' in f.rich_text) return !!p && txt(p.rich_text) === f.rich_text.equals;
  throw new Error('filter ' + JSON.stringify(f));
}
function notion(url, opts) {
  notionCalls++;
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + BDB) return res(200, { data_sources: [{ id: BDS }] });
  if (m === 'post' && path === '/data_sources/' + BDS + '/query') return res(200, { results: pages.filter(p => match(p, body.filter)), has_more: false });
  let mm = path.match(/^\/blocks\/([^/?]+)\/children/);
  if (mm && m === 'get') return res(200, { results: kids[mm[1]] || [], has_more: false });
  if (m === 'post' && path === '/pages') {
    assert.strictEqual(body.parent.data_source_id, BDS);
    assert.ok(body.children.length <= 100);
    const pr = {}; Object.keys(body.properties).forEach(k => { pr[k] = val(body.properties[k]); });
    const pg = { id: id('p'), url: 'https://notion.so/' + n, parent: { data_source_id: BDS }, properties: pr };
    pages.push(pg); kids[pg.id] = body.children.map(blockOut); return res(200, pg);
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const claudeCalls = [];
function anthropic(url, opts) {
  const body = JSON.parse(opts.payload); claudeCalls.push(body);
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sample suggestion.' }], usage: { input_tokens: 4000, output_tokens: 200 } }) };
}
function fetch(url, opts) {
  opts = opts || {};
  if (url === FILE_URL) { assert.ok(!opts.headers || !opts.headers.Authorization, 'the file link carries no Notion key'); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(FILE) }; }
  if (/anthropic\.com/.test(url)) return anthropic(url, opts);
  return notion(url, opts);
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: d => d.toISOString().slice(0, 7) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  UrlFetchApp: { fetch, fetchAll: reqs => { fetchAlls++; return reqs.map(r => fetch(r.url, r)); } },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const get = q => JSON.parse(ctx.doGet({ parameter: Object.assign({ key }, q) }).text);

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
const made = pages.filter(p => p !== imp);
assert.strictEqual(made.length, 4);
const chariotDean = made.find(p => txt(p.properties.Card.rich_text) === 'M7' && p.properties.Book.select.name === 'Liz Dean');
assert.strictEqual(txt(chariotDean.properties.Title.title), 'The Chariot · Liz Dean');
assert.strictEqual(txt(chariotDean.properties.Source.rich_text), 'Chapter 4, page 1');
assert.strictEqual(chariotDean.properties.Order.number, 14);   // deck position 7, Dean first
assert.strictEqual(made.find(p => txt(p.properties.Card.rich_text) === 'P4' && p.properties.Book.select.name === 'Jessa Crispin').properties.Order.number, (22 + 3 * 14 + 3) * 2 + 1);
const kb = kids[chariotDean.id];
assert.deepStrictEqual(kb.slice(0, 3).map(b => b.type), ['heading_3', 'bulleted_list_item', 'bulleted_list_item']);
assert.strictEqual(txt(kb[2].bulleted_list_item.rich_text), 'Key Meanings: sample keywords');
// again: nothing new, nothing doubled
r = post({ action: 'tarotbookimport' });
assert.deepStrictEqual([r.ok, r.made, r.left], [true, 0, 0]);
assert.strictEqual(pages.length, 5);
r = get({ action: 'tarotbooks' });
assert.deepStrictEqual([r.books.dean, r.books.crispin], [2, 2]);

// ---- a card's passages, Dean first, sections and list items as written; then from the cache
const calls0 = notionCalls;
r = get({ action: 'tarotbook', card: 'M7' });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.books.map(b => b.book), ['dean', 'crispin']);
assert.deepStrictEqual([r.books[0].name, r.books[0].title, r.books[0].source], ['Liz Dean', 'The Ultimate Guide to Tarot', 'Chapter 4, page 1']);
assert.deepStrictEqual(r.books[0].sections.map(s => s.h), ['AT A GLANCE', 'UNDERSTANDING THE CHARIOT', 'UPRIGHT MEANING', 'REVERSED MEANING', 'HIS WISDOM MESSAGE', 'THE CHARIOT’S SYMBOLS']);
assert.deepStrictEqual(r.books[0].sections[2].p, ['Sample upright passage.', '• Home: sample line']);
assert.ok(fetchAlls >= 1, 'both pages read at once');
const calls1 = notionCalls;
assert.ok(calls1 > calls0);
get({ action: 'tarotbook', card: 'M7' });
assert.strictEqual(notionCalls, calls1, 'the second read comes from the cache');
get({ action: 'tarotbook', card: 'M7', fresh: '1' });
assert.ok(notionCalls > calls1, 'fresh=1 reads Notion again');
assert.strictEqual(get({ action: 'tarotbook', card: 'M22' }).error, 'bad_request');
assert.deepStrictEqual(get({ action: 'tarotbook', card: 'W8' }).books, []);

// ---- SUGGEST one card: its full passages, the reading around it, no tools, nothing saved
const before = pages.length;
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
assert.strictEqual(pages.length, before, 'nothing saved');
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

// ---- without the import file and with no pages, IMPORT says so
pages.length = 0; ctx.tbBump_();
assert.strictEqual(post({ action: 'tarotbookimport' }).error, 'tarot_books_no_file');
console.log('bridge tarot books ok');
