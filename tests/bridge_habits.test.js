// Habits + Library (bridge 1.14): a day's habits written whole (created once, then updated in
// place), ranges read back, bad values refused; books added (cid makes a retry harmless),
// changed field by field, refused when they aren't on the shelf, and moved to Notion's trash.
// All titles are sample data. 1.49: "Evening Walk" became "Exercise": either column name is read and written, so the
// bridge and the Notion column can change in either order, and a rename between writes is picked up at once.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), nx = br.nx;
nx.rename('habits', 'Exercise', 'Evening Walk');   // Notion still has the old name when the test starts
const post = br.post, get = br.post;
const day = d => nx.rows('habits').find(r => r.Date === d);
const habitWrites = (from = 0) => nx.calls.slice(from).filter(c => c.body && c.body.properties && 'Meditated' in c.body.properties);
const exNames = c => Object.keys(c.body.properties).filter(k => k === 'Exercise' || k === 'Evening Walk');

const caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('habits') && caps.includes('library'));

// ---- Habits
let r = post({ action: 'habitset', day: { date: '2026-10-08', med: true, walk: false, water: 1.5, card: null } });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([r.day.date, r.day.med, r.day.walk, r.day.water, r.day.card], ['2026-10-08', true, false, 1.5, null]);
const hp = nx.rows('habits')[0].id;
assert.strictEqual(nx.row(hp).Name, 'Thursday, October 8, 2026');
// the same day again: updated in place, not a second page
r = post({ action: 'habitset', day: { date: '2026-10-08', med: true, walk: true, water: 3, card: 'kept' } });
assert.ok(r.ok); assert.strictEqual(nx.rows('habits').length, 1);
assert.strictEqual(nx.row(hp)['Debit Card'], 'Did Not Swipe');
assert.strictEqual(nx.row(hp)['Water (L)'], 3);
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

// ---- 1.49: the column renamed to Exercise in Notion: past days read the same, the next write lands in Exercise
r = get({ action: 'habits', from: '2026-10-01', to: '2026-10-08' }); const before = JSON.stringify(r.days);
assert.ok(habitWrites().length === 4 && habitWrites().every(c => exNames(c).join() === 'Evening Walk'), 'written under the old name while Notion still had it');
assert.deepStrictEqual(nx.refused(), [], 'and Notion took every write');
nx.rename('habits', 'Evening Walk', 'Exercise');   // Notion keeps every day's value
const w0 = nx.calls.length;
post({ action: 'habitset', day: { date: '2026-10-05', med: false, walk: true, water: 1, card: null } });   // the name looked up 10 minutes ago is stale: refused once, looked up again
assert.deepStrictEqual(habitWrites(w0).map(c => exNames(c).join() + (c.refused ? ' refused' : '')), ['Evening Walk refused', 'Exercise'], 'refused once under the old name, then written under the new one');
assert.strictEqual(day('2026-10-05').Exercise, true);
r = get({ action: 'habits', from: '2026-10-01', to: '2026-10-08' });
assert.strictEqual(JSON.stringify(r.days.filter(d => d.date !== '2026-10-05')), before, 'every past day reads the same after the rename');
assert.strictEqual(r.days.find(d => d.date === '2026-10-05').walk, true);
r = post({ action: 'habitset', day: { date: '2026-10-08', med: true, walk: false, water: 3, card: 'kept' } });
assert.ok(r.ok && r.day.walk === false && day('2026-10-08').Exercise === false && exNames(habitWrites().pop()).join() === 'Exercise' && !('Evening Walk' in nx.columns('habits')));

// ---- Library
r = post({ action: 'booksave', book: { cid: 'cid-book-0001', title: 'A Sample Novel', author: 'Pat Example', status: 'reading', started: '2026-10-01', cover: 'https://covers.openlibrary.org/b/id/123-M.jpg', ol: 'https://openlibrary.org/works/OL1W', year: 2021 } });
assert.ok(r.ok, JSON.stringify(r));
const b1 = r.book;
assert.deepStrictEqual([b1.title, b1.author, b1.status, b1.started, b1.year], ['A Sample Novel', 'Pat Example', 'reading', '2026-10-01', 2021]);
assert.strictEqual(nx.row(b1.id).Status, 'Reading');
// the same cid again: no second book
assert.ok(post({ action: 'booksave', book: { cid: 'cid-book-0001', title: 'A Sample Novel' } }).duplicate);
assert.strictEqual(nx.rows('library').length, 1);
// a new book defaults to Want to Read
r = post({ action: 'booksave', book: { cid: 'cid-book-0002', title: 'Another Sample' } });
assert.strictEqual(r.book.status, 'want');
// finish the first: only the fields sent change
r = post({ action: 'booksave', book: { id: b1.id, status: 'read', finished: '2026-10-08', rating: 4, notes: 'Lovely ending.' } });
assert.ok(r.ok); assert.deepStrictEqual([r.book.title, r.book.status, r.book.finished, r.book.rating, r.book.notes, r.book.started], ['A Sample Novel', 'read', '2026-10-08', 4, 'Lovely ending.', '2026-10-01']);
// refused: a rating of 6, a cover from elsewhere, a page that isn't a book, no title on a new book
assert.strictEqual(post({ action: 'booksave', book: { id: b1.id, rating: 6 } }).error, 'bad_request');
assert.strictEqual(post({ action: 'booksave', book: { id: b1.id, cover: 'https://example.com/x.jpg' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'booksave', book: { id: hp, title: 'Not a book' } }).error, 'not_writable');
assert.strictEqual(post({ action: 'booksave', book: { cid: 'cid-book-0003', title: ' ' } }).error, 'bad_title');
r = get({ action: 'library' });
assert.strictEqual(r.books.length, 2);
// remove: to Notion's trash, gone from the shelf; a habit day can't be removed this way
assert.strictEqual(post({ action: 'bookremove', id: hp }).error, 'not_writable');
assert.ok(post({ action: 'bookremove', id: b1.id }).ok);
assert.strictEqual(get({ action: 'library' }).books.length, 1);
assert.strictEqual(nx.row(b1.id).in_trash, true, 'in the trash, where it can be restored');
assert.deepStrictEqual(nx.refused().map(c => c.refused.slice(0, 20) + ' ' + exNames(c).join()), ['400 validation_error Evening Walk'], 'the bridge sent nothing Notion refuses but the one write under the name it had just lost');
console.log('bridge habits + library: ok');
