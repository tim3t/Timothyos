// The Inbox in the bridge (1.33): notes captured to sort later. inbox lists waiting (oldest first) and kept notes;
// inboxadd makes one page (Note, Captured with the script's time zone, Status New) and is safe to repeat (cid);
// inboxset marks a note New, Sorted (with what it became) or Kept; inboxremove moves it to Notion's trash; only
// pages in the Inbox can be changed; the capability, the setup line and the column check include it; sort mode.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test', ANTHROPIC_API_KEY: 'sk-ant-test' }, cache = {};
const DB = '5712ada1ef2742daad5629d70bf3f4d4', DS = 'ds-inbox';
let pages = {}, n = 0, calls = [], sent = [];
const sel = v => ({ select: v ? { name: v } : null });
function page(text, at, status, as) {
  const id = ('0000000000000000000000000000000' + (++n)).slice(-32);
  pages[id] = { id, url: 'https://www.notion.so/' + id, created_time: at, parent: { type: 'data_source_id', data_source_id: DS }, in_trash: false,
    properties: { Note: { title: [{ plain_text: text }] }, Captured: { date: { start: at } }, Status: sel(status), 'Sorted As': sel(as) } };
  return pages[id];
}
page('Juniper fence quote', '2026-10-19T07:42:00.000-05:00', 'New');
page('Bramble feeder idea', '2026-10-12T22:40:00.000-05:00', 'Kept');
page('Old sorted note', '2026-10-01T09:00:00.000-05:00', 'Sorted', 'Task');
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (url === 'https://api.anthropic.com/v1/messages') { const b = JSON.parse(opts.payload); sent.push(b); return res(200, { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 300 }, content: [{ type: 'text', text: '{"items":[]}' }] }); }
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  calls.push(m + ' ' + path);
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'get' && path.indexOf('/databases/') === 0) return res(404, { message: 'Could not find database' });
  if (m === 'get' && path === '/data_sources/' + DS) return res(200, { properties: { Note: { type: 'title' }, Captured: { type: 'date' }, Status: { type: 'select' }, 'Sorted As': { type: 'select' } } });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    const want = body.filter.select.equals;
    const rows = Object.values(pages).filter(p => !p.in_trash && p.properties.Status.select && p.properties.Status.select.name === want);
    return res(200, { results: rows, has_more: false });
  }
  if (m === 'post' && path === '/pages') { const p = page('', '', 'New'); p.properties = body.properties; p.parent = body.parent; return res(200, p); }
  const pm = path.match(/^\/pages\/(.+)$/);
  if (pm) {
    const p = pages[pm[1]]; if (!p) return res(404, { message: 'Could not find page' });
    if (m === 'get') return res(200, p);
    if (m === 'patch') { if (body.in_trash) p.in_trash = true; if (body.properties) Object.assign(p.properties, body.properties); return res(200, p); }
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const logs = [];
const ctx = {
  console: { log: (...a) => logs.push(a.join(' ')) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d, tz, f) => f === 'yyyy-MM' ? '2026-10' : f === "yyyy-MM-dd'T'HH:mm:ss" ? new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 19) : d.toISOString().slice(0, 16).replace('T', ' '), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);

assert.ok(logs.some(l => l === 'Notion inbox: OK (1 waiting, 1 kept)'), logs.filter(l => /inbox/i.test(l)).join(' | '));
const caps = get({ action: 'ping', key }).capabilities;
assert.ok(caps.includes('inbox') && caps.includes('inboxsort'));

// the list
let b = get({ action: 'inbox', key });
assert.deepStrictEqual(b.waiting.map(x => [x.text, x.status]), [['Juniper fence quote', 'new']]);
assert.deepStrictEqual(b.kept.map(x => [x.text, x.status]), [['Bramble feeder idea', 'kept']]);
assert.ok(b.url.endsWith(DB));

// a new note: Captured in the script's time zone, Status New; repeat-safe
calls = [];
const a1 = post({ key, action: 'inboxadd', note: { cid: 'note-0000001', text: '  Look into a second extractor\r\nbefore spring  ', at: '2026-10-24T12:58:00.000Z' } });
assert.ok(a1.ok, JSON.stringify(a1));
const made = pages[a1.note.id];
assert.strictEqual(made.properties.Note.title[0].text.content, 'Look into a second extractor\nbefore spring');
assert.deepStrictEqual(made.properties.Captured.date, { start: '2026-10-24T07:58:00', time_zone: 'America/Chicago' });
assert.strictEqual(made.properties.Status.select.name, 'New');
const a2 = post({ key, action: 'inboxadd', note: { cid: 'note-0000001', text: 'Look into a second extractor' } });
assert.ok(a2.duplicate && a2.note.id === a1.note.id, 'a retry never makes a second page');
assert.strictEqual(get({ action: 'inbox', key }).waiting.length, 2, 'the list is fresh after a write');
assert.strictEqual(post({ key, action: 'inboxadd', note: { cid: 'note-0000002', text: '   ' } }).error, 'bad_title');
assert.strictEqual(post({ key, action: 'inboxadd', note: { cid: 'note-0000003', text: 'x'.repeat(2001) } }).error, 'bad_title');
assert.strictEqual(post({ key, action: 'inboxadd', note: { cid: 'bad', text: 'Hi' } }).error, 'bad_request');

// sorted, with what it became; kept; back to new
const id = a1.note.id;
let s1 = post({ key, action: 'inboxset', id, status: 'sorted', as: 'queue' });
assert.ok(s1.ok && s1.note.status === 'sorted' && s1.note.as === 'queue');
assert.strictEqual(pages[id].properties['Sorted As'].select.name, 'Queue');
s1 = post({ key, action: 'inboxset', id, status: 'kept', as: null });
assert.ok(s1.ok && s1.note.status === 'kept' && s1.note.as === null && pages[id].properties['Sorted As'].select === null);
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'kept', as: 'task' }).error, 'bad_request', 'what it became only with sorted');
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'gone', as: null }).error, 'bad_request');
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'sorted', as: 'meal' }).error, 'bad_request');

// only Inbox pages
const other = page('Not an inbox page', '2026-10-01T00:00:00Z', 'New'); other.parent = { type: 'data_source_id', data_source_id: 'ds-tasks' };
assert.strictEqual(post({ key, action: 'inboxset', id: other.id, status: 'kept', as: null }).error, 'not_writable');
assert.strictEqual(post({ key, action: 'inboxremove', id: other.id }).error, 'not_writable');
assert.strictEqual(post({ key, action: 'inboxremove', id: 'not-an-id' }).error, 'not_writable');

// remove: Notion's trash
assert.ok(post({ key, action: 'inboxremove', id }).ok);
assert.strictEqual(pages[id].in_trash, true);
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'kept', as: null }).error, 'not_writable', 'a trashed note is gone');

// the column check covers it
const sc = get({ action: 'schema', key, fresh: '1' }).dbs.find(d => d.key === 'inbox');
assert.ok(sc && sc.missing.length === 0 && sc.wrong.length === 0, JSON.stringify(sc));

// sort mode: Sonnet, low effort, no tools, its own task
post({ key, action: 'ask', cid: 'ask-sort-00001', mode: 'sort', messages: [{ role: 'user', text: 'Suggest where each note goes.' }], context: 'INBOX: ...' });
assert.strictEqual(sent[0].model, 'claude-sonnet-5-5'); assert.ok(!sent[0].tools); assert.deepStrictEqual(sent[0].output_config, { effort: 'low' });
assert.ok(sent[0].system[0].text.includes("snapshot's INBOX") && sent[0].system[0].text.includes('{\"items\"'), 'the sorting task');
console.log('ALL INBOX CHECKS PASSED');
