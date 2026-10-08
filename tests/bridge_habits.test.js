// Habits + Library (bridge 1.14): a day's habits written whole (created once, then updated in
// place), ranges read back, bad values refused; books added (cid makes a retry harmless),
// changed field by field, refused when they aren't on the shelf, and moved to Notion's trash.
// All titles are sample data.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const HDB = '441619b34ada41d49e05bed92372589b', LDB = '47fdad1d1217402fa84731a8aa146cba', HDS = 'ds-habits', LDS = 'ds-library';
const pages = { [HDS]: [], [LDS]: [] }; let n = 0, calls = [];
const id = p => p + String(++n).padStart(30, '0');
const val = v => v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v;
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  calls.push(m + ' ' + path);
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + HDB) return res(200, { data_sources: [{ id: HDS }] });
  if (m === 'get' && path === '/databases/' + LDB) return res(200, { data_sources: [{ id: LDS }] });
  let mm = path.match(/^\/data_sources\/([^/]+)\/query$/);
  if (mm && m === 'post') {
    const f = body.filter; let r = pages[mm[1]].filter(p => !p.in_trash);
    if (f && f.property === 'Date') r = r.filter(p => p.properties.Date.date.start === f.date.equals);
    if (f && f.and) r = r.filter(p => { const d = p.properties.Date.date.start; return d >= f.and[0].date.on_or_after && d <= f.and[1].date.on_or_before; });
    return res(200, { results: r, has_more: false });
  }
  if (m === 'post' && path === '/pages') {
    const ds = body.parent.data_source_id, pr = {};
    Object.keys(body.properties).forEach(k => { pr[k] = val(body.properties[k]); });
    const pg = { id: id('p'), url: 'https://notion.so/x', parent: { type: 'data_source_id', data_source_id: ds }, created_time: '2026-10-08T12:00:00.000Z', properties: pr };
    pages[ds].push(pg); return res(200, pg);
  }
  mm = path.match(/^\/pages\/([^/]+)$/);
  if (mm) {
    const pg = pages[HDS].concat(pages[LDS]).find(p => p.id === mm[1]);
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
assert.ok(caps.includes('habits') && caps.includes('library'));

// ---- Habits
let r = post({ action: 'habitset', day: { date: '2026-10-08', med: true, walk: false, water: 1.5, card: null } });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([r.day.date, r.day.med, r.day.walk, r.day.water, r.day.card], ['2026-10-08', true, false, 1.5, null]);
const hp = pages[HDS][0];
assert.strictEqual(hp.properties.Name.title[0].plain_text, 'Thursday, October 8, 2026');
// the same day again: updated in place, not a second page
r = post({ action: 'habitset', day: { date: '2026-10-08', med: true, walk: true, water: 3, card: 'kept' } });
assert.ok(r.ok); assert.strictEqual(pages[HDS].length, 1);
assert.strictEqual(hp.properties['Debit Card'].select.name, 'Did Not Swipe');
assert.strictEqual(hp.properties['Water (L)'].number, 3);
post({ action: 'habitset', day: { date: '2026-10-06', med: false, walk: true, water: 2, card: 'swiped' } });
r = get({ action: 'habits', from: '2026-10-01', to: '2026-10-08' });
assert.ok(r.ok); assert.strictEqual(r.days.length, 2);
const d6 = r.days.find(d => d.date === '2026-10-06');
assert.deepStrictEqual([d6.med, d6.walk, d6.water, d6.card], [false, true, 2, 'swiped']);
// a write clears the cached range
post({ action: 'habitset', day: { date: '2026-10-07', med: true, walk: false, water: null, card: null } });
assert.strictEqual(get({ action: 'habits', from: '2026-10-01', to: '2026-10-08' }).days.length, 3, 'fresh after a write');
// refused: bad date, water off the half-litre steps, unknown card value, too long a range
assert.strictEqual(post({ action: 'habitset', day: { date: '2026-13-01' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'habitset', day: { date: '2026-10-08', water: 1.3 } }).error, 'bad_request');
assert.strictEqual(post({ action: 'habitset', day: { date: '2026-10-08', card: 'maybe' } }).error, 'bad_request');
assert.strictEqual(get({ action: 'habits', from: '2024-01-01', to: '2026-10-08' }).error, 'bad_request');
// batched with the other reads
r = get({ action: 'batch', calls: JSON.stringify([{ action: 'habits', from: '2026-10-01', to: '2026-10-08' }, { action: 'library' }]) });
assert.ok(r.results[0].ok && r.results[1].ok);

// ---- Library
r = post({ action: 'booksave', book: { cid: 'cid-book-0001', title: 'A Sample Novel', author: 'Pat Example', status: 'reading', started: '2026-10-01', cover: 'https://covers.openlibrary.org/b/id/123-M.jpg', ol: 'https://openlibrary.org/works/OL1W', year: 2021 } });
assert.ok(r.ok, JSON.stringify(r));
const b1 = r.book;
assert.deepStrictEqual([b1.title, b1.author, b1.status, b1.started, b1.year], ['A Sample Novel', 'Pat Example', 'reading', '2026-10-01', 2021]);
assert.strictEqual(pages[LDS][0].properties.Status.select.name, 'Reading');
// the same cid again: no second book
assert.ok(post({ action: 'booksave', book: { cid: 'cid-book-0001', title: 'A Sample Novel' } }).duplicate);
assert.strictEqual(pages[LDS].length, 1);
// a new book defaults to Want to Read
r = post({ action: 'booksave', book: { cid: 'cid-book-0002', title: 'Another Sample' } });
assert.strictEqual(r.book.status, 'want');
// finish the first: only the fields sent change
r = post({ action: 'booksave', book: { id: b1.id, status: 'read', finished: '2026-10-08', rating: 4, notes: 'Lovely ending.' } });
assert.ok(r.ok); assert.deepStrictEqual([r.book.title, r.book.status, r.book.finished, r.book.rating, r.book.notes, r.book.started], ['A Sample Novel', 'read', '2026-10-08', 4, 'Lovely ending.', '2026-10-01']);
// refused: a rating of 6, a cover from elsewhere, a page that isn't a book, no title on a new book
assert.strictEqual(post({ action: 'booksave', book: { id: b1.id, rating: 6 } }).error, 'bad_request');
assert.strictEqual(post({ action: 'booksave', book: { id: b1.id, cover: 'https://example.com/x.jpg' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'booksave', book: { id: hp.id, title: 'Not a book' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'booksave', book: { cid: 'cid-book-0003', title: ' ' } }).error, 'bad_title');
r = get({ action: 'library' });
assert.strictEqual(r.books.length, 2);
// remove: to Notion's trash, gone from the shelf; a habit day can't be removed this way
assert.strictEqual(post({ action: 'bookremove', id: hp.id }).error, 'not_writable');
assert.ok(post({ action: 'bookremove', id: b1.id }).ok);
assert.strictEqual(get({ action: 'library' }).books.length, 1);
console.log('bridge habits + library: ok');
