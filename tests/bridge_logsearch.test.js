// Captain's Log search (bridge 1.16): setup adds the Search Text field once, saves and imports
// keep it in step, logindex fills older entries newest first (and only counts on a dry run),
// search finds exact words (case ignored) or any match, returns dates and short snippets,
// needs the PIN, and Ask still has no way in. All entry text is invented.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test', LOG_PIN: '204816' }; const cache = {};
const DB = '4c395160e1a84702a3a6861c20ddf748', DS = 'ds-log', P = 'Search Text';
const pages = [], blocks = {}; let n = 0, calls = [], schema = { Name: { type: 'title' }, Date: { type: 'date' }, Source: { type: 'select' } }, busyAt = -1;
const id = p => p + String(++n).padStart(30, '0');
const rt = arr => (arr || []).map(r => ({ plain_text: r.text.content }));
const txt = pg => (pg.properties[P] ? pg.properties[P].rich_text.map(r => r.plain_text).join('') : '');
function match(pg, f) {
  if (!f) return true;
  if (f.or) return f.or.some(g => match(pg, g));
  if (f.and) return f.and.every(g => match(pg, g));
  if (f.property === 'Date') { const d = pg.properties.Date.date.start; return f.date.equals ? d === f.date.equals : (!f.date.on_or_after || d >= f.date.on_or_after) && (!f.date.on_or_before || d <= f.date.on_or_before); }
  if (f.property === P) { const t = txt(pg); return f.rich_text.is_empty ? !t : t.includes(f.rich_text.contains); }   // case-sensitive here on purpose: the bridge sends case variants
  throw new Error('filter ' + JSON.stringify(f));
}
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  calls.push(m + ' ' + path.split('?')[0]);
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (busyAt === calls.length) return res(429, { message: 'slow down' });
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'get' && path === '/data_sources/' + DS) return res(200, { properties: schema });
  if (m === 'patch' && path === '/data_sources/' + DS) { for (const k in body.properties) schema[k] = { type: body.properties[k].type }; return res(200, {}); }
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    if (JSON.stringify(body.filter || {}).includes(P) && !schema[P]) return res(400, { message: 'no such property' });
    let r = pages.filter(pg => match(pg, body.filter));
    if (body.sorts && body.sorts[0].direction === 'descending') r.sort((a, b) => b.properties.Date.date.start.localeCompare(a.properties.Date.date.start));
    const start = +(body.start_cursor || 0), slice = r.slice(start, start + body.page_size);
    return res(200, { results: slice, has_more: start + body.page_size < r.length, next_cursor: String(start + body.page_size) });
  }
  if (m === 'post' && path === '/pages') {
    if (body.properties[P] && !schema[P]) return res(400, { message: 'Search Text is not a property' });
    const pg = { id: id('p'), url: 'https://notion.so/x', properties: { Name: body.properties.Name, Date: body.properties.Date, Source: body.properties.Source } };
    if (body.properties[P]) pg.properties[P] = { rich_text: rt(body.properties[P].rich_text) };
    pages.push(pg); blocks[pg.id] = (body.children || []).map(c => ({ id: id('b'), type: 'paragraph', has_children: false, paragraph: { rich_text: rt(c.paragraph.rich_text) } }));
    return res(200, pg);
  }
  let mm = path.match(/^\/pages\/([^/?]+)$/);
  if (mm && m === 'patch') { const pg = pages.find(x => x.id === mm[1]); pg.properties[P] = { rich_text: rt(body.properties[P].rich_text) }; return res(200, pg); }
  mm = path.match(/^\/blocks\/([^/?]+)\/children/);
  if (mm && m === 'get') return res(200, { results: blocks[mm[1]] || [], has_more: false });
  if (mm && m === 'patch') { body.children.forEach(c => blocks[mm[1]].push({ id: id('b'), type: 'paragraph', has_children: false, paragraph: { rich_text: rt(c.paragraph.rich_text) } })); return res(200, {}); }
  mm = path.match(/^\/blocks\/([^/?]+)$/);
  if (mm) { for (const k in blocks) { const i = blocks[k].findIndex(b => b.id === mm[1]); if (i > -1) {
    if (m === 'delete') { blocks[k].splice(i, 1); return res(200, {}); }
    if (m === 'patch') { blocks[k][i].paragraph.rich_text = rt(body.paragraph.rich_text); return res(200, {}); } } } }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const logs = [];
const ctx = {
  console: { log: s => logs.push(s) },
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
const key = props.ACCESS_KEY, pin = '204816';
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const get = q => JSON.parse(ctx.doGet({ parameter: Object.assign({ key }, q) }).text);
const caps = () => get({ action: 'ping' }).capabilities;

// Before setup: entries saved the old way (no Search Text), search says it isn't ready.
const OLD = { '2025-02-03': 'Helped the kids with their Homework after dinner.\n\nQuiet night.', '2025-02-10': 'Long day. homework again, then a walk.', '2025-03-01': 'Homeworks piled up; we skipped it.', '2025-04-12': 'Garden beds. Nothing else.' };
assert.ok(post({ action: 'logimport', pin, entries: Object.keys(OLD).map(d => ({ date: d, text: OLD[d] })) }).ok);
assert.ok(pages.every(pg => !pg.properties[P]), 'no field yet, so imports leave it out');
assert.ok(!caps().includes('logsearch'));
assert.strictEqual(get({ action: 'logsearch', pin, q: 'homework' }).error, 'log_search_not_ready');

// setup adds the field once and reports what's left to index.
ctx.logSearchSetup_ && assert.ok(ctx.logSearchSetup_().startsWith('OK (added the "Search Text" field). 4 older entries to index'));
assert.strictEqual(schema[P].type, 'rich_text'); assert.strictEqual(props.LOG_SEARCH_READY, '1');
calls = []; assert.ok(ctx.logSearchSetup_().startsWith('OK. 4 older'), 'a second run changes nothing');
assert.ok(!calls.includes('patch /data_sources/' + DS));
assert.ok(caps().includes('logsearch'));

// Searching now finds nothing (not indexed yet) and says so.
let r = get({ action: 'logsearch', pin, q: 'homework' });
assert.ok(r.ok); assert.strictEqual(r.entries.length, 0); assert.strictEqual(r.left, 4);

// Indexing: a dry run only counts; a run fills newest first; Notion busy stops early without losing anything.
assert.deepStrictEqual([post({ action: 'logindex', pin }).did, post({ action: 'logindex', pin }).left], [0, 4]);
calls = []; busyAt = 4;   // query, then blocks+patch for the first entry, then busy reading the second
r = post({ action: 'logindex', pin, run: 1 });
assert.ok(r.ok && r.busy); assert.strictEqual(r.did, 1); assert.strictEqual(r.left, 3);
assert.strictEqual(txt(pages.find(pg => pg.properties.Date.date.start === '2025-04-12')), 'Garden beds. Nothing else.', 'newest first');
busyAt = -1;
r = post({ action: 'logindex', pin, run: 1 }); assert.ok(r.ok && !r.busy); assert.strictEqual(r.did, 3); assert.strictEqual(r.left, 0);
assert.strictEqual(txt(pages.find(pg => pg.properties.Date.date.start === '2025-02-03')), 'Helped the kids with their Homework after dinner. Quiet night.', 'kept on one line');

// Exact word, case ignored: Homework and homework, not Homeworks. Newest first, with counts and snippets.
r = get({ action: 'logsearch', pin, q: 'homework' });
assert.deepStrictEqual(r.entries.map(e => e.date), ['2025-02-10', '2025-02-03']);
assert.strictEqual(r.mentions, 2); assert.strictEqual(r.whole, true); assert.strictEqual(r.left, 0);
assert.deepStrictEqual(r.entries[1].snips, [['Helped the kids with their ', 'Homework', ' after dinner. Quiet night.']]);
// Two mentions close together share one snippet, both marked.
post({ action: 'logsave', pin, date: '2025-05-05', text: 'Homework first, then more homework.' });
assert.deepStrictEqual(get({ action: 'logsearch', pin, q: 'homework' }).entries[0].snips, [['', 'Homework', ' first, then more ', 'homework', '.']]);
post({ action: 'logsave', pin, date: '2025-05-05', text: '' });
// Any match: Homeworks too.
r = get({ action: 'logsearch', pin, q: 'Homework', whole: '0' });
assert.deepStrictEqual(r.entries.map(e => e.date), ['2025-03-01', '2025-02-10', '2025-02-03']);
// A phrase across a line break; nothing for a word that isn't there; too short refused.
assert.deepStrictEqual(get({ action: 'logsearch', pin, q: 'dinner quiet' }).entries.map(e => e.date), []);
assert.deepStrictEqual(get({ action: 'logsearch', pin, q: 'dinner.  Quiet' }).entries.map(e => e.date), ['2025-02-03'], 'a phrase matches across a paragraph break');
assert.strictEqual(get({ action: 'logsearch', pin, q: 'ted lasso' }).entries.length, 0);
assert.strictEqual(get({ action: 'logsearch', pin, q: 'a' }).error, 'bad_request');
assert.strictEqual(get({ action: 'logsearch', pin, q: '(x' }).entries.length, 0, 'symbols are matched literally');

// New and edited entries keep their search copy in step.
assert.ok(post({ action: 'logsave', pin, date: '2026-10-08', text: 'Watched Ted Lasso with the family.' }).created);
assert.deepStrictEqual(get({ action: 'logsearch', pin, q: 'ted lasso' }).entries.map(e => e.date), ['2026-10-08']);
assert.ok(post({ action: 'logsave', pin, date: '2026-10-08', text: 'Watched a film with the family.\n\nHomework check at 7.' }).ok);
assert.strictEqual(get({ action: 'logsearch', pin, q: 'ted lasso' }).entries.length, 0, 'the old words are gone');
assert.strictEqual(get({ action: 'logsearch', pin, q: 'homework' }).entries[0].date, '2026-10-08');
// A long entry: the snippet is cut at word edges with ellipses.
const long = 'word '.repeat(60) + 'the homework was long ' + 'more '.repeat(60);
post({ action: 'logsave', pin, date: '2026-10-09', text: long });
const sn = get({ action: 'logsearch', pin, q: 'homework' }).entries[0].snips[0];
assert.ok(sn.length === 3 && sn[0].startsWith('…word') && sn[2].endsWith('more…') && sn[1] === 'homework' && sn[0].length < 80, JSON.stringify(sn));
// Far-apart mentions get a snippet each (two at most).
post({ action: 'logsave', pin, date: '2025-05-06', text: 'homework ' + 'filler '.repeat(60) + 'homework ' + 'filler '.repeat(60) + 'homework' });
const far = get({ action: 'logsearch', pin, q: 'homework' }).entries.find(e => e.date === '2025-05-06');
assert.strictEqual(far.count, 3); assert.strictEqual(far.snips.length, 2);

// The PIN guards search and index like every other log request.
assert.strictEqual(get({ action: 'logsearch', pin: '000000', q: 'homework' }).error, 'bad_pin');
assert.strictEqual(post({ action: 'logindex', pin: '000001', run: 1 }).error, 'bad_pin');
delete cache.logfail;

// Ask still has no way in: no tool or snapshot path reaches the log or its search.
const src = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const askPart = src.slice(src.indexOf('function ask_('), src.indexOf('\n}', src.indexOf('function ask_(')));
assert.ok(!/log(Search|Index|Day|Blocks|Source|Unindexed)_/.test(askPart), 'ask_ never touches the log');
console.log('ALL LOG SEARCH CHECKS PASSED');
