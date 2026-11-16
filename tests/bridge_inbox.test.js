// The Inbox in the bridge (1.33): notes captured to sort later. inbox lists waiting (oldest first) and kept notes;
// inboxadd makes one page (Note, Captured with the script's time zone, Status New) and is safe to repeat (cid);
// inboxset marks a note New, Sorted (with what it became) or Kept; inboxremove moves it to Notion's trash; only
// pages in the Inbox can be changed; the capability, the setup line and the column check include it; sort mode.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const sent = [];
const br = bridge({ props: { ACCESS_KEY: null, NOTION_TOKEN: 'ntn_test', ANTHROPIC_API_KEY: 'sk-ant-test' }, notion: {}, fetch: (url, opts, res) => {
  if (url === 'https://api.anthropic.com/v1/messages') { sent.push(JSON.parse(opts.payload)); return res(200, { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 300 }, content: [{ type: 'text', text: '{"items":[]}' }] }); }
} });
const { ctx, props, nx, log: logs } = br;
const note = (text, at, status, as) => nx.add('inbox', { Note: text, Captured: at, Status: status, 'Sorted As': as });
note('Juniper fence quote', '2026-10-19T07:42:00.000-05:00', 'New');
note('Bramble feeder idea', '2026-10-12T22:40:00.000-05:00', 'Kept');
note('Old sorted note', '2026-10-01T09:00:00.000-05:00', 'Sorted', 'Task');
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => br.call(p);
const post = b => br.call(b);

assert.ok(logs.some(l => l === 'Notion inbox: OK (1 waiting, 1 kept)'), logs.filter(l => /inbox/i.test(l)).join(' | '));
const caps = get({ action: 'ping', key }).capabilities;
assert.ok(caps.includes('inbox') && caps.includes('inboxsort'));

// the list
let b = get({ action: 'inbox', key });
assert.deepStrictEqual(b.waiting.map(x => [x.text, x.status]), [['Juniper fence quote', 'new']]);
assert.deepStrictEqual(b.kept.map(x => [x.text, x.status]), [['Bramble feeder idea', 'kept']]);
assert.ok(b.url.endsWith(nx.dbId('inbox')));

// a new note: Captured in the script's time zone, Status New; repeat-safe
const c0 = nx.calls.length;
const a1 = post({ key, action: 'inboxadd', note: { cid: 'note-0000001', text: '  Look into a second extractor\r\nbefore spring  ', at: '2026-10-24T12:58:00.000Z' } });
assert.ok(a1.ok, JSON.stringify(a1));
const made = nx.row(a1.note.id);
assert.strictEqual(made.Note, 'Look into a second extractor\nbefore spring');
const sentNote = nx.calls.slice(c0).find(c => c.method === 'post' && c.path === '/pages');
assert.deepStrictEqual(sentNote.body.properties.Captured.date, { start: '2026-10-24T07:58:00', time_zone: 'America/Chicago' });
assert.strictEqual(made.Captured, '2026-10-24T07:58:00');
assert.strictEqual(made.Status, 'New');
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
assert.strictEqual(nx.row(id)['Sorted As'], 'Queue');
s1 = post({ key, action: 'inboxset', id, status: 'kept', as: null });
assert.ok(s1.ok && s1.note.status === 'kept' && s1.note.as === null && nx.row(id)['Sorted As'] === null);
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'kept', as: 'task' }).error, 'bad_request', 'what it became only with sorted');
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'gone', as: null }).error, 'bad_request');
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'sorted', as: 'meal' }).error, 'bad_request');

// only Inbox pages
const other = nx.add('tasks', { Task: 'Not an inbox page', Status: '⬜ To Do' });
assert.strictEqual(post({ key, action: 'inboxset', id: other, status: 'kept', as: null }).error, 'not_writable');
assert.strictEqual(post({ key, action: 'inboxremove', id: other }).error, 'not_writable');
assert.strictEqual(post({ key, action: 'inboxremove', id: 'not-an-id' }).error, 'not_writable');
assert.ok(!nx.calls.some(c => c.method === 'patch' && c.path === '/pages/' + other) && !nx.row(other).in_trash, 'the task is untouched');

// remove: Notion's trash
assert.ok(post({ key, action: 'inboxremove', id }).ok);
assert.strictEqual(nx.row(id).in_trash, true);
assert.strictEqual(post({ key, action: 'inboxset', id, status: 'kept', as: null }).error, 'not_writable', 'a trashed note is gone');

// the column check covers it
const sc = get({ action: 'schema', key, fresh: '1' }).dbs.find(d => d.key === 'inbox');
assert.ok(sc && sc.missing.length === 0 && sc.wrong.length === 0, JSON.stringify(sc));

// sort mode: Sonnet, low effort, no tools, its own task
post({ key, action: 'ask', cid: 'ask-sort-00001', mode: 'sort', messages: [{ role: 'user', text: 'Suggest where each note goes.' }], context: 'INBOX: ...' });
assert.strictEqual(sent[0].model, 'claude-sonnet-5-5'); assert.ok(!sent[0].tools); assert.deepStrictEqual(sent[0].output_config, { effort: 'low' });
assert.ok(sent[0].system[0].text.includes("snapshot's INBOX") && sent[0].system[0].text.includes('{\"items\"'), 'the sorting task');
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('ALL INBOX CHECKS PASSED');
