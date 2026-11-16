// THE STRICT SIMULATED NOTION (B1): each refusal real Notion makes, checked against requests written by hand from
// Notion's reference pages, and the shared Apps Script harness it plugs into. All data is invented.
const assert = require('assert');
const { bridge, formatDate, parseDate } = require('./lib/gas');

const b = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: { options: { tasks: { Status: ['⬜ To Do', '✅ Done'] } } } });
const nx = b.nx;
const H = { Authorization: 'Bearer ntn_test', 'Notion-Version': '2025-09-03' };
const api = (method, path, body, headers) => {
  const r = nx.fetch('https://api.notion.com/v1' + path, { method, headers: headers || H, payload: body ? JSON.stringify(body) : undefined });
  return { status: r.getResponseCode(), body: JSON.parse(r.getContentText()), headers: r.getHeaders() };
};
const refused = (r, status, code, what) => { assert.strictEqual(r.status, status, what + ': ' + JSON.stringify(r.body)); assert.strictEqual(r.body.code, code, what); assert.strictEqual(r.body.object, 'error', what); };
const ds = nx.ds('tasks');

// ---- the databases come from the bridge's own column list
assert.deepStrictEqual(nx.columns('tasks'), { Task: 'title', Status: 'select', Priority: 'select', 'Life Area': 'select', 'Due Date': 'date', 'Focus Date': 'date', Completed: 'date' });
assert.strictEqual(nx.dbId('tasks'), b.ctx.CONFIG.NOTION_TASKS_DATABASE);
assert.strictEqual(api('get', '/databases/' + nx.dbId('tasks')).body.data_sources[0].id, ds, 'a database names its data source');
assert.ok(nx.columns('tarotbooks').Book && nx.columns('log')['Search Text'], 'every database in the list, the conditional log column too');

// ---- seeding in plain values, read back in Notion's shape
const a = nx.add('tasks', { Task: 'Order spring bulbs', Status: '⬜ To Do', 'Due Date': '2026-10-04' });
nx.add('tasks', { Task: 'Renew registration', Status: '✅ Done', 'Due Date': '2026-10-01' });
nx.add('tasks', { Task: 'Sharpen tools', Status: '⬜ To Do' });
const pg = api('get', '/pages/' + a).body;
assert.strictEqual(pg.properties.Task.title[0].plain_text, 'Order spring bulbs');
assert.strictEqual(pg.properties.Task.title[0].text.content, 'Order spring bulbs');
assert.strictEqual(pg.properties.Status.select.name, '⬜ To Do');
assert.strictEqual(pg.properties.Priority.select, null, 'an empty select reads as null');
assert.deepStrictEqual(pg.parent, { type: 'data_source_id', data_source_id: ds, database_id: nx.dbId('tasks') });
assert.throws(() => nx.add('tasks', { Nope: 1 }), /no column Nope/, 'a test seeding a column that does not exist fails at once');

// ---- auth and version
refused(api('get', '/pages/' + a, null, { Authorization: 'Bearer ntn_wrong', 'Notion-Version': '2025-09-03' }), 401, 'unauthorized', 'a wrong token');
refused(api('get', '/pages/' + a, null, { Authorization: 'Bearer ntn_test' }), 400, 'missing_version', 'no Notion-Version');
refused(api('get', '/pages/' + a, null, { Authorization: 'Bearer ntn_test', 'Notion-Version': '2022-06-28' }), 400, 'validation_error', 'an old Notion-Version');

// ---- filters: evaluated, and refused when nested too deep, unknown, or of the wrong type
const q = body => api('post', '/data_sources/' + ds + '/query', body);
const titles = r => r.body.results.map(p => p.properties.Task.title[0].plain_text).sort();
assert.deepStrictEqual(titles(q({ filter: { property: 'Status', select: { equals: '⬜ To Do' } } })), ['Order spring bulbs', 'Sharpen tools']);
assert.deepStrictEqual(titles(q({ filter: { property: 'Due Date', date: { is_empty: true } } })), ['Sharpen tools']);
assert.deepStrictEqual(titles(q({ filter: { and: [{ property: 'Status', select: { does_not_equal: '✅ Done' } }, { property: 'Due Date', date: { on_or_before: '2026-10-04' } }] } })), ['Order spring bulbs']);
const two = { and: [{ property: 'Status', select: { equals: '⬜ To Do' } }, { or: [{ property: 'Due Date', date: { equals: '2026-10-04' } }, { property: 'Due Date', date: { is_empty: true } }] }] };
assert.strictEqual(q({ filter: two }).status, 200, 'two levels deep is allowed');
const three = { and: [{ or: [{ and: [{ property: 'Status', select: { equals: '⬜ To Do' } }] }] }] };
refused(q({ filter: three }), 400, 'validation_error', 'three levels deep (1.48.0 shipped this)');
refused(q({ filter: { property: 'Done Date', date: { equals: '2026-10-04' } } }), 400, 'validation_error', 'a filter on a column that does not exist');
refused(q({ filter: { property: 'Status', rich_text: { equals: '⬜ To Do' } } }), 400, 'validation_error', 'a select filtered as text');
refused(q({ filter: { property: 'Status', select: { equals: '⬜ To Do', is_empty: true } } }), 400, 'validation_error', 'two conditions in one');
refused(q({ filter: { property: 'Due Date', date: { equals: '4 Oct' } } }), 400, 'validation_error', 'a date that is not ISO 8601');
refused(q({ sorts: [{ property: 'Rank', direction: 'ascending' }] }), 400, 'validation_error', 'a sort on a column that does not exist');
assert.deepStrictEqual(q({ sorts: [{ property: 'Due Date', direction: 'ascending' }] }).body.results.map(p => p.properties.Task.title[0].plain_text), ['Renew registration', 'Order spring bulbs', 'Sharpen tools'], 'sorted, empty dates last');
refused(q({ filters: {} }), 400, 'validation_error', 'an unknown query field');

// ---- pages of at most 100, with has_more and next_cursor
for (let i = 0; i < 247; i++) nx.add('apiary', { Name: 'Check ' + i, Kind: 'Check', Date: '2026-06-01' });
const aq = body => api('post', '/data_sources/' + nx.ds('apiary') + '/query', body);
refused(aq({ page_size: 101 }), 400, 'validation_error', 'page_size over 100');
refused(aq({ page_size: 0 }), 400, 'validation_error', 'page_size under 1');
let r = aq({}), seen = r.body.results.length, n = 1;
assert.strictEqual(r.body.results.length, 100, 'the default page is 100');
while (r.body.has_more) { r = aq({ start_cursor: r.body.next_cursor }); seen += r.body.results.length; n++; }
assert.deepStrictEqual([seen, n, r.body.next_cursor], [247, 3, null], 'every row once, in three pages');
refused(aq({ start_cursor: 'made-up' }), 400, 'validation_error', 'a cursor Notion never gave');

// ---- writes: unknown column, wrong type, text limits
const create = props => api('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
const ok = create({ Task: { title: [{ text: { content: 'Split hive' } }] }, Status: { select: { name: '⬜ To Do' } }, 'Due Date': { date: { start: '2026-10-09' } } });
assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
assert.strictEqual(nx.row(ok.body.id).Task, 'Split hive');
refused(create({ Task: { title: [{ text: { content: 'x' } }] }, Done: { checkbox: true } }), 400, 'validation_error', 'a column that does not exist');
refused(create({ Task: { rich_text: [{ text: { content: 'x' } }] } }), 400, 'validation_error', 'a title written as rich text');
refused(create({ 'Due Date': { date: { start: 'next Friday' } } }), 400, 'validation_error', 'a date that is not ISO 8601');
refused(create({ Task: { title: [{ text: { content: 'x'.repeat(2001) } }] } }), 400, 'validation_error', 'one piece over 2,000 characters');
assert.strictEqual(create({ Task: { title: [{ text: { content: 'x'.repeat(2000) } }] } }).status, 200, 'exactly 2,000 is fine');
refused(create({ Task: { title: Array.from({ length: 101 }, () => ({ text: { content: 'x' } })) } }), 400, 'validation_error', 'over 100 pieces');
refused(create({ Status: { select: { name: 'A, B' } } }), 400, 'validation_error', 'a select option with a comma');
refused(api('post', '/pages', { parent: { database_id: nx.dbId('tasks') }, properties: {} }), 400, 'validation_error', 'a parent by database id (2025-09-03 wants the data source)');
const pr = api('patch', '/pages/' + a, { properties: { Status: { select: { name: '🚫 Blocked' } } } });
assert.strictEqual(pr.body.properties.Status.select.name, '🚫 Blocked', 'a new select option is added, as Notion does');
api('patch', '/pages/' + a, { in_trash: true });
refused(api('patch', '/pages/' + a, { properties: { Status: { select: { name: '✅ Done' } } } }), 400, 'validation_error', 'editing a page in the trash');
assert.strictEqual(titles(q({ filter: { property: 'Task', title: { equals: 'Order spring bulbs' } } })).length, 0, 'a page in the trash is not in query results');

// ---- blocks: children in pages, at most 100 per append
const page2 = nx.add('log', { Name: 'Entry', Date: '2026-10-06' }, { blocks: Array.from({ length: 130 }, (_, i) => ({ paragraph: { rich_text: [{ text: { content: 'line ' + i } }] } })) });
let kids = api('get', '/blocks/' + page2 + '/children?page_size=100');
assert.deepStrictEqual([kids.body.results.length, kids.body.has_more], [100, true]);
kids = api('get', '/blocks/' + page2 + '/children?page_size=100&start_cursor=' + kids.body.next_cursor);
assert.deepStrictEqual([kids.body.results.length, kids.body.has_more, kids.body.results[29].paragraph.rich_text[0].plain_text], [30, false, 'line 129']);
refused(api('patch', '/blocks/' + page2 + '/children', { children: Array.from({ length: 101 }, () => ({ paragraph: { rich_text: [] } })) }), 400, 'validation_error', 'over 100 children in one append');
refused(api('patch', '/blocks/' + page2 + '/children', { children: [{ paragraph: { rich_text: [{ text: { content: 'y'.repeat(2001) } }] } }] }), 400, 'validation_error', 'a block with a piece over 2,000');
assert.strictEqual(api('delete', '/blocks/' + kids.body.results[0].id).status, 200);
assert.strictEqual(nx.blocks(page2).length, 129, 'a deleted block is gone from its page');

// ---- not shared, and faults on request
nx.unshare('dates');
refused(api('get', '/databases/' + nx.dbId('dates')), 404, 'object_not_found', 'a database not shared with the integration');
nx.share('dates');
nx.fail({ status: 429, match: 'post /data_sources', times: 1, retryAfter: 2 });
const busy = q({});
refused(busy, 429, 'rate_limited', 'a 429 on request');
assert.strictEqual(busy.headers['Retry-After'], '2', 'with Retry-After in seconds');
assert.strictEqual(busy.body.additional_data.retry_after, '2');
assert.strictEqual(q({}).status, 200, 'only as many times as asked');

// ---- through the bridge: its tasks read passes, and a 429 on the batched read falls back and still answers
b.post({ action: 'ping' });
nx.fail({ status: 429, match: 'post /data_sources/' + ds, times: 1 });
const t = b.post({ action: 'tasks', day: '2026-10-09' });
assert.ok(t.ok, JSON.stringify(t));
assert.deepStrictEqual(t.focus.map(x => x.title), [], 'nothing focused that day');
assert.ok(t.open.some(x => x.title === 'Split hive'), 'the open list read after a 429');
assert.ok(nx.calls.some(c => c.refused && /^429/.test(c.refused)), 'the 429 was served');
assert.deepStrictEqual(nx.calls.slice(-6).filter(c => c.refused && !/^429/.test(c.refused)), [], 'the bridge sent nothing Notion refused');

// ---- the harness: Apps Script's dates in the script's time zone, and a cache that refuses what Google's refuses
assert.strictEqual(formatDate(new Date('2026-10-07T03:30:00Z'), 'America/Chicago', 'yyyy-MM-dd'), '2026-10-06', 'the day in Chicago, not UTC');
assert.strictEqual(formatDate(new Date('2026-10-07T03:30:00Z'), 'America/New_York', "EEE d MMM yyyy 'at' HH:mm"), 'Tue 6 Oct 2026 at 23:30');
assert.strictEqual(parseDate('2026-10-06', 'America/Chicago', 'yyyy-MM-dd').toISOString(), '2026-10-06T05:00:00.000Z');
assert.strictEqual(parseDate('2026-12-06', 'America/Chicago', 'yyyy-MM-dd').toISOString(), '2026-12-06T06:00:00.000Z', 'after the clocks change');
assert.throws(() => b.ctx.CacheService.getScriptCache().put('big', 'x'.repeat(100 * 1024 + 1)), /too large/);
assert.throws(() => b.ctx.UrlFetchApp.fetch('https://example.invalid/x', {}), /no simulated service answers/);

console.log('STRICT SIMULATED NOTION: depth, unknown, types, pages, 2,000, 100, 429, 404, auth, blocks, harness: ok');
