// Ask Claude in the bridge: tool loop, proposals (never executed), spend tracking,
// the monthly budget, repeat-safe replies, error mapping, and partial review saves.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test' }, cache = {};
const DS = 'ds-1111', DB = '6c4a440d571e49e0b4076c18d5712c1f', DS2 = 'ds-2222', DB2 = '8184db37aacb4d96943b2067558b92ab';
const task = { id: 'a'.repeat(32), url: 'u', last_edited_time: '2026-10-05T15:00:00.000Z', parent: { type: 'data_source_id', data_source_id: DS }, properties: {
  Task: { title: [{ plain_text: 'Order spring bulbs' }] }, Status: { select: { name: '⬜ To Do' } }, Priority: { select: { name: '🔴 High' } },
  'Life Area': { select: { name: '🌿 SkyGarden Farm' } }, 'Due Date': { date: { start: '2026-10-04' } }, 'Focus Date': { date: null } } };
let script = [], sent = [], anthropicHeaders = [];
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (url === 'https://api.anthropic.com/v1/messages') {
    anthropicHeaders.push(opts.headers); const body = JSON.parse(opts.payload); sent.push(body);
    const next = script.shift(); return typeof next === 'function' ? next(body) : res(200, next);
  }
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase();
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'get' && path === '/databases/' + DB2) return res(200, { data_sources: [{ id: DS2 }] });
  if (m === 'get' && path.indexOf('/data_sources/') === 0) return res(200, { title: [{ plain_text: 'x' }], properties: { 'Life Area': { select: { options: [] } }, Type: { select: { options: [] } } } });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') return res(200, { results: [task], has_more: false });
  if (m === 'post' && path === '/data_sources/' + DS2 + '/query') return res(200, { results: [], has_more: false });
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: (...a) => console.log('   log:', ...a) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d, tz, f) => f === 'yyyy-MM' ? '2026-10' : d.toISOString().slice(0, 16).replace('T', ' '), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
const ask = (extra) => post(Object.assign({ key, action: 'ask', cid: 'ask-' + Math.random().toString(36).slice(2, 10), mode: 'fast', messages: [{ role: 'user', text: 'What should I do first today?' }], context: 'NOW: Tue 06 Oct 2026 07:40', ignore: ['away block'] }, extra || {}));

console.log('without key:', JSON.stringify(ask()), '| caps', JSON.stringify(get({ action: 'ping', key }).capabilities));
assert.strictEqual(ask().error, 'ai_not_configured');
props.ANTHROPIC_API_KEY = 'sk-ant-test';
assert.ok(get({ action: 'ping', key }).capabilities.includes('ask'));

// a two-step answer: read tasks, then propose a task and answer
const usage = { input_tokens: 3000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
script = [
  { model: 'claude-sonnet-5-5', stop_reason: 'tool_use', usage, content: [{ type: 'thinking', thinking: '', signature: 'sig-1' }, { type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'tu1', name: 'get_tasks', input: { day: '2026-10-06' } }] },
  { model: 'claude-sonnet-5-5', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'tu2', name: 'propose_add_task', input: { title: 'Call the co-op', life_area: '🌿 SkyGarden Farm', focus_day: '2026-10-06' } },
    { type: 'tool_use', id: 'tu3', name: 'propose_set_focus', input: { task_id: 'a'.repeat(32), task_title: 'Order spring bulbs', day: '2026-10-06' } }] },
  { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'thinking', thinking: '', signature: 'sig-3' }, { type: 'text', text: 'Order spring bulbs first, Captain. It is overdue. I proposed picking it and adding a call to the co-op.' }] }
];
const cid = 'ask-fixed-0001';
const r1 = ask({ cid });
console.log('reply:', r1.reply, '| proposals', JSON.stringify(r1.proposals), '| cost', r1.cost, '| spend', JSON.stringify(r1.spend));
assert.ok(r1.ok); assert.strictEqual(r1.proposals.length, 2); assert.strictEqual(r1.proposals[0].kind, 'add_task');
assert.strictEqual(sent.length, 3, 'three model calls');
assert.strictEqual(sent[0].model, 'claude-sonnet-5-5', 'everyday questions on Sonnet 5.5 (1.15)');
assert.deepStrictEqual(sent[0].output_config, { effort: 'low' }, 'low effort'); assert.strictEqual(sent[0].max_tokens, 6000, 'room for thinking');
assert.ok(!sent[0].thinking && !('temperature' in sent[0]) && !('top_p' in sent[0]), 'no thinking setting or sampling (rejected on Sonnet 5.5)');
assert.strictEqual(sent[0].fallbacks, 'default', 'server-side fallback on a classifier decline');
assert.ok(!r1.reply.includes('sig-') && r1.reply.startsWith('Order spring bulbs'), 'reply read from text blocks, thinking skipped');
assert.deepStrictEqual(sent[1].messages[1].content[0], { type: 'thinking', thinking: '', signature: 'sig-1' }, 'thinking block passed back unchanged with the tool results');
assert.deepStrictEqual(sent[0].cache_control, { type: 'ephemeral' });
assert.ok(sent[0].system[0].text.includes('never change anything directly'));
assert.ok(sent[0].tools.every(t => !/work/i.test(t.name)) && !sent[0].tools.some(t => /web/.test(t.name)), 'no web tool, no work-calendar tool');
const tr = sent[1].messages[2].content[0];
console.log('tool result sent back:', tr.content.split('\n').slice(0, 3).join(' / '));
assert.ok(tr.content.includes('[' + 'a'.repeat(32) + '] Order spring bulbs'));
assert.ok(sent[2].messages[4].content[0].content.includes('Nothing changes until he taps CONFIRM'));
assert.strictEqual(anthropicHeaders[0]['x-api-key'], 'sk-ant-test'); assert.strictEqual(anthropicHeaders[0]['anthropic-version'], '2023-06-01');
const expected = 3 * (3000 * 2 + 200 * 10) / 1e6;
assert.ok(Math.abs(r1.cost - expected) < 1e-4, 'cost at Sonnet 5.5 prices');
// the call log: one line per question, no text
let lg = get({ action: 'aispend', key }).log;
assert.strictEqual(lg[0].mode, 'fast'); assert.strictEqual(lg[0].model, 'claude-sonnet-5-5'); assert.strictEqual(lg[0].steps, 3);
assert.deepStrictEqual([lg[0].in, lg[0].out], [9000, 600]); assert.ok(Math.abs(lg[0].usd - expected) < 1e-4);
assert.ok(!JSON.stringify(lg).includes('spring bulbs'), 'no question or answer text in the log');
// repeat with the same cid: no new model call
const before = sent.length; const r1b = ask({ cid });
assert.strictEqual(sent.length, before); assert.strictEqual(r1b.reply, r1.reply);
// one Script Property steps everyday questions down to Haiku 5.5 (low effort, no fallback) or Haiku 4.5 (no effort)
props.AI_FAST_MODEL = 'claude-haiku-5-5'; sent = [];
script = [{ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }];
const rh = ask({ cid: 'ask-rollback-00' });
assert.strictEqual(sent[0].model, 'claude-haiku-5-5'); assert.deepStrictEqual(sent[0].output_config, { effort: 'low' }); assert.ok(!sent[0].fallbacks, 'Haiku has no fallbacks');
assert.ok(Math.abs(rh.cost - (3000 * 0.10 + 200 * 0.50) / 1e6) < 1e-6, 'cost at Haiku 5.5 prices');
props.AI_FAST_MODEL = 'claude-haiku-4-5'; sent = [];
script = [{ model: 'claude-haiku-4-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }];
ask({ cid: 'ask-rollback-01' });
assert.strictEqual(sent[0].model, 'claude-haiku-4-5'); assert.ok(!sent[0].output_config, 'no effort on Haiku 4.5');
props.AI_FAST_MODEL = 'gpt-4'; sent = []; script = [{ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }];
ask({ cid: 'ask-rollback-02' }); assert.strictEqual(sent[0].model, 'claude-sonnet-5-5', 'unknown values ignored'); delete props.AI_FAST_MODEL;
// a model name with a date or region is priced like its family; an unlisted one is counted high and marked
sent = []; script = [{ model: 'claude-sonnet-5-5-20261001', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }];
const rd = ask({ cid: 'ask-dated-0001' });
assert.ok(Math.abs(rd.cost - (3000 * 2 + 200 * 10) / 1e6) < 1e-6, 'dated name priced as Sonnet 5.5, not the catch-all');
script = [{ model: 'claude-something-new', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'ok' }] }];
ask({ cid: 'ask-unknown-001' });
assert.strictEqual(get({ action: 'aispend', key }).log[0].unknown, true, 'unknown model marked in the log');

// deep mode (THINK HARDER): Opus 5.5, medium effort, server-side fallback; thinking blocks passed back unchanged
sent = [];
script = [
  { model: 'claude-opus-5-5', stop_reason: 'tool_use', usage, content: [{ type: 'thinking', thinking: '', signature: 'sig1' }, { type: 'tool_use', id: 'tu9', name: 'get_key_dates', input: {} }] },
  { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Nothing pressing.' }] }
];
const r2 = ask({ mode: 'deep' });
assert.strictEqual(sent[0].model, 'claude-opus-5-5'); assert.deepStrictEqual(sent[0].output_config, { effort: 'medium' }); assert.strictEqual(sent[0].fallbacks, 'default'); assert.strictEqual(sent[0].max_tokens, 12000);
assert.strictEqual(anthropicHeaders[anthropicHeaders.length - 1]['anthropic-beta'], 'server-side-fallback-2026-07-01');
assert.deepStrictEqual(sent[1].messages[1].content[0], { type: 'thinking', thinking: '', signature: 'sig1' }, 'thinking block echoed unchanged');
assert.ok(Math.abs(r2.cost - 2 * (3000 * 4 + 200 * 20) / 1e6) < 1e-4, 'cost at Opus 5.5 prices');

// summary mode: Sonnet, no tools
sent = []; script = [{ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'A steady week.' }] }];
const r3 = ask({ mode: 'summary' });
assert.strictEqual(sent[0].model, 'claude-sonnet-5-5'); assert.deepStrictEqual(sent[0].output_config, { effort: 'medium' }); assert.ok(!sent[0].tools); assert.ok(sent[0].system[0].text.includes('weekly summary')); assert.strictEqual(r3.reply, 'A steady week.');

// patterns mode: Sonnet, no tools, its own task
sent = []; script = [{ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: '- Evening calls drain you most weeks.' }] }];
const rp = ask({ mode: 'patterns' });
assert.strictEqual(sent[0].model, 'claude-sonnet-5-5'); assert.ok(!sent[0].tools); assert.ok(sent[0].system[0].text.includes('patterns across them')); assert.ok(rp.reply.startsWith('- Evening'));

// invalid proposal comes back to the model as an error, not a proposal
script = [
  { model: 'claude-haiku-4-5', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'tx', name: 'propose_set_status', input: { task_id: 'nope', task_title: 'x', status: '✅ Done' } }] },
  { model: 'claude-haiku-4-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'I need the exact task.' }] }
];
sent = []; const r4 = ask();
assert.strictEqual(r4.proposals.length, 0); assert.strictEqual(sent[1].messages[2].content[0].is_error, true);

// errors
script = [() => ({ getResponseCode: () => 401, getContentText: () => JSON.stringify({ error: { message: 'invalid x-api-key' } }) })];
assert.strictEqual(ask().error, 'ai_unauthorized');
script = [() => ({ getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: { message: 'Your credit balance is too low to access the Anthropic API.' } }) })];
assert.strictEqual(ask().error, 'ai_no_credit');
script = [() => ({ getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: { message: 'You have reached your specified API usage limits.' } }) })];
assert.strictEqual(ask().error, 'ai_console_limit');
script = [() => ({ getResponseCode: () => 529, getContentText: () => JSON.stringify({ error: { message: 'Overloaded' } }) })];
assert.strictEqual(ask().error, 'ai_busy');
assert.strictEqual(ask({ messages: [{ role: 'assistant', text: 'hi' }] }).error, 'bad_request');
assert.strictEqual(post({ action: 'ask', cid: 'ask-nokey-01', messages: [{ role: 'user', text: 'x' }] }).error, 'no_key', 'refused without a key');

// budget: pause at the monthly limit without calling the model
props.AI_SPEND = JSON.stringify({ month: '2026-10', usd: 7.999, calls: 400 });
script = [{ model: 'claude-haiku-4-5', stop_reason: 'end_turn', usage: { input_tokens: 2000, output_tokens: 100 }, content: [{ type: 'text', text: 'ok' }] }];
const r5 = ask(); assert.ok(r5.ok, 'just under budget still answers');
sent = []; const r6 = ask();
console.log('over budget:', JSON.stringify(r6));
assert.strictEqual(r6.error, 'ai_budget'); assert.strictEqual(sent.length, 0, 'no model call when over budget');
assert.strictEqual(r6.spend.cap, 10, 'the $10 Console ceiling is reported for reference');
// CONTINUE: past the reminder for the rest of the month, until the Console stops it
const rc = post({ key, action: 'aicontinue' }); assert.ok(rc.ok && rc.spend.cont);
sent = []; assert.ok(ask().ok, 'continues past the reminder'); assert.strictEqual(sent.length, 1);
// MATCH: set the month's total to the Console's figure
assert.strictEqual(post({ key, action: 'aispendset', usd: 'lots' }).error, 'bad_request');
const rm = post({ key, action: 'aispendset', usd: 0.01 }); assert.ok(rm.ok); assert.strictEqual(rm.spend.usd, 0.01);
assert.strictEqual(get({ action: 'aispend', key }).log[0].mode, 'matched');
props.AI_BUDGET_USD = '20'; assert.strictEqual(get({ action: 'aispend', key }).ai.budget, 20);
props.AI_SPEND = JSON.stringify({ month: '2026-09', usd: 9.5, calls: 900 });
assert.strictEqual(get({ action: 'aispend', key }).ai.usd, 0, 'a new month starts at zero');
props.AI_CONTINUE = '2026-09'; assert.strictEqual(get({ action: 'aispend', key }).ai.cont, false, 'CONTINUE lasts one month');
console.log('setup log with AI on:'); ctx.setup();
// compareModels (editor): five questions on three setups, each request shaped for its model
props.AI_SPEND = JSON.stringify({ month: '2026-10', usd: 0, calls: 0 }); sent = [];
script = []; for (let i = 0; i < 15; i++) script.push(body => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 120 }, content: [{ type: 'text', text: 'Answer from ' + body.model }] }) }));
ctx.compareModels();
assert.strictEqual(sent.length, 15, 'fifteen model calls');
assert.deepStrictEqual(sent.map(b => b.model + ':' + ((b.output_config || {}).effort || '-')).slice(0, 3), ['claude-sonnet-5-5:low', 'claude-opus-5-5:medium', 'claude-haiku-5-5:low']);
assert.ok(sent.every(b => b.system[1].text.includes('use your tools')), 'editor run says the snapshot is missing');
console.log('ALL ASK CHECKS PASSED');
