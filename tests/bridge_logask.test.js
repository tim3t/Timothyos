// Log Ask (bridge 1.20): Claude reads only the entries Timothy picks in the open LOG (a date
// range of at most 62 days, or up to 62 chosen dates), behind the authorization code; a preview
// gives the count, tokens and cost without calling Claude; the caps refuse larger asks; entries
// go first in a cached block, so follow-ups are cheap; no tools; spend is logged as "log" with
// no text; answers are saved only on request, as undated "Claude insight" pages that the date-
// based log views skip; REVIEW's summary can include one week. All entry text is invented.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test', LOG_PIN: 'OMEGA-1701', ANTHROPIC_API_KEY: 'sk-ant-test' }; const cache = {};
const DB = '4c395160e1a84702a3a6861c20ddf748', DS = 'ds-log', P = 'Search Text';
const pages = [], blocks = {}; let n = 0, calls = [], schema = { Name: { type: 'title' }, Date: { type: 'date' }, Source: { type: 'select' } }, busyAt = -1;
const id = p => p + String(++n).padStart(30, '0');
const rt = arr => (arr || []).map(r => ({ plain_text: r.text.content }));
const txt = pg => (pg.properties[P] ? pg.properties[P].rich_text.map(r => r.plain_text).join('') : '');
function match(pg, f) {
  if (!f) return true;
  if (f.or) return f.or.some(g => match(pg, g));
  if (f.and) return f.and.every(g => match(pg, g));
  if (f.property === 'Source') return (pg.properties.Source && pg.properties.Source.select && pg.properties.Source.select.name) === f.select.equals;
  if (f.property === 'Date') { if (!pg.properties.Date.date) return false; const d = pg.properties.Date.date.start; return f.date.equals ? d === f.date.equals : (!f.date.on_or_after || d >= f.date.on_or_after) && (!f.date.on_or_before || d <= f.date.on_or_before); }
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
    if (body.sorts && body.sorts[0].timestamp) r.sort((a, b) => b.created_time.localeCompare(a.created_time));
    else if (body.sorts && body.sorts[0].direction === 'descending') r.sort((a, b) => b.properties.Date.date.start.localeCompare(a.properties.Date.date.start));
    const start = +(body.start_cursor || 0), slice = r.slice(start, start + body.page_size);
    return res(200, { results: slice, has_more: start + body.page_size < r.length, next_cursor: String(start + body.page_size) });
  }
  if (m === 'post' && path === '/pages') {
    if (body.properties[P] && !schema[P]) return res(400, { message: 'Search Text is not a property' });
    const pg = { id: id('p'), url: 'https://notion.so/x', created_time: new Date(Date.now() + n * 1000).toISOString(), parent: { type: 'data_source_id', data_source_id: DS }, properties: { Name: { title: (body.properties.Name.title || []).map(r => ({ plain_text: r.text.content })) }, Date: body.properties.Date || { date: null }, Source: body.properties.Source } };
    if (body.properties[P]) pg.properties[P] = { rich_text: rt(body.properties[P].rich_text) };
    pages.push(pg); blocks[pg.id] = (body.children || []).map(c => ({ id: id('b'), type: c.type, has_children: false, [c.type]: { rich_text: rt(c[c.type].rich_text) } }));
    return res(200, pg);
  }
  let mm = path.match(/^\/pages\/([^/?]+)$/);
  if (mm && m === 'get') { const pg = pages.find(x => x.id === mm[1]); return pg ? res(200, pg) : res(404, { message: 'no page' }); }
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

let claudeCalls = [];
function anthropic(url, opts) {
  const body = JSON.parse(opts.payload); claudeCalls.push(body);
  const first = body.messages.length === 1;
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ model: body.model, stop_reason: 'end_turn',
    content: [{ type: 'text', text: first ? 'Key moments: the first frost [2025-10-12] and the honey harvest [2025-10-20].' : 'The harvest stood out most [2025-10-20].' }],
    usage: first ? { input_tokens: 400, output_tokens: 200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 0 } : { input_tokens: 120, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000 } }) };
}
const fetchAll = (url, opts) => /anthropic\.com/.test(url) ? anthropic(url, opts) : mock(url, opts);
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: (d, tz, f) => f === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchAll },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY, pin = 'OMEGA-1701';
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const caps = () => JSON.parse(ctx.doGet({ parameter: { key, action: 'ping' } }).text).capabilities;
assert.ok(caps().includes('logask'));

// Sample entries: October 2025 (searchable copy filled), one in early November without a search copy yet.
ctx.logSearchSetup_();
const OCT = { '2025-10-02': 'Quiet start to the month. Walked the fence line.', '2025-10-12': 'First frost. Covered the dahlias in the dark.', '2025-10-20': 'Honey harvest: 31 jars. Tired and happy.\n\n- labels\n- lids' };
post({ action: 'logimport', pin, entries: Object.keys(OCT).map(d => ({ date: d, text: OCT[d] })) });
props.LOG_SEARCH_READY = '0';   // saved before the search copy existed
post({ action: 'logimport', pin, entries: [{ date: '2025-11-03', text: 'Rain all day. Read by the stove.' }] });
props.LOG_SEARCH_READY = '1';

// The PIN guards it like every log request.
assert.strictEqual(post({ action: 'logask', pin: 'ALPHA-0000', preview: true, scope: { from: '2025-10-01', to: '2025-10-31' } }).error, 'bad_pin');
delete cache.logfail;

// Preview: count, dates, tokens and both costs; no call to Claude.
let r = post({ action: 'logask', pin, preview: true, scope: { from: '2025-10-01', to: '2025-10-31' } });
assert.ok(r.ok && r.preview); assert.strictEqual(r.preview.count, 3);
assert.deepStrictEqual([r.preview.from, r.preview.to], ['2025-10-02', '2025-10-20']);
assert.ok(r.preview.tokens > 300 && r.preview.tokens < 3000, String(r.preview.tokens));
assert.ok(r.preview.usd.deep > r.preview.usd.fast && r.preview.usd.fast > 0);
assert.strictEqual(claudeCalls.length, 0, 'a preview never calls Claude');

// Ask: the entries go first, cached; the question after; no tools; Sonnet for questions.
r = post({ action: 'logask', pin, mode: 'fast', scope: { from: '2025-10-01', to: '2025-10-31' }, messages: [{ role: 'user', text: 'What were the key moments?' }] });
assert.ok(r.ok, JSON.stringify(r)); assert.ok(r.reply.includes('[2025-10-12]'));
let sent = claudeCalls[0];
assert.strictEqual(sent.model, 'claude-sonnet-5-5'); assert.ok(!sent.tools, 'no tools');
const parts = sent.messages[0].content;
assert.deepStrictEqual(parts[0].cache_control, { type: 'ephemeral' });
assert.ok(parts[0].text.startsWith("CAPTAIN'S LOG ENTRIES (3, 2025-10-02 to 2025-10-20)") && parts[0].text.includes('=== 2025-10-12 (Sunday)\nFirst frost.'));
assert.ok(!parts[0].text.includes('Rain all day'), 'only the chosen period');
assert.ok(parts[1].text.endsWith('QUESTION\nWhat were the key moments?'));
assert.ok(sent.system.includes('Cite the date'));
// A follow-up resends the same cached block and reads it from the cache.
r = post({ action: 'logask', pin, mode: 'deep', scope: { from: '2025-10-01', to: '2025-10-31' }, messages: [{ role: 'user', text: 'What were the key moments?' }, { role: 'assistant', text: r.reply }, { role: 'user', text: 'Which stood out most?' }] });
sent = claudeCalls[1];
assert.strictEqual(sent.model, 'claude-opus-5-5'); assert.strictEqual(sent.messages.length, 3);
assert.strictEqual(sent.messages[0].content[0].text, claudeCalls[0].messages[0].content[0].text, 'identical block, so the cache hits');
assert.ok(r.cost < 0.01, 'follow-up read from the cache: ' + r.cost);
// Spend: counted, and logged as "log" with no text.
const log = JSON.parse(props.AI_LOG);
assert.strictEqual(log[0].mode, 'log'); assert.strictEqual(log[0].cr, 3000);
assert.ok(!JSON.stringify(log).includes('frost') && !JSON.stringify(log).includes('key moments'), 'no text in the log');

// Chosen dates (from a search): only those, even across years; an entry without a search copy is read from its page.
claudeCalls = [];
r = post({ action: 'logask', pin, preview: true, scope: { dates: ['2025-11-03', '2025-10-20'] } });
assert.strictEqual(r.preview.count, 2);
post({ action: 'logask', pin, scope: { dates: ['2025-11-03', '2025-10-20'] }, messages: [{ role: 'user', text: 'Common thread?' }] });
assert.ok(claudeCalls[0].messages[0].content[0].text.includes('Rain all day. Read by the stove.'));
assert.ok(claudeCalls[0].messages[0].content[0].text.includes('Tired and happy. labels lids'), 'the one-line search copy when there is one (one query, not a call per entry)');

// Caps: more than 62 dates, a range over 62 days, or about 60K tokens are refused before Claude.
claudeCalls = [];
const many = []; for (let i = 0; i < 63; i++) many.push(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
assert.deepStrictEqual([post({ action: 'logask', pin, preview: true, scope: { dates: many } }).error, post({ action: 'logask', pin, preview: true, scope: { dates: many } }).count], ['log_ask_too_big', 63]);
assert.strictEqual(post({ action: 'logask', pin, preview: true, scope: { from: '2025-01-01', to: '2025-12-31' } }).error, 'log_ask_too_big', 'a year never goes at once');
assert.strictEqual(post({ action: 'logask', pin, preview: true, scope: { from: '2025-09-01', to: '2025-10-31' } }).ok, true, 'two months (61 days) is fine');
const huge = 'word '.repeat(60000);
post({ action: 'logimport', pin, entries: [{ date: '2024-06-01', text: huge.slice(0, 110000) }, { date: '2024-06-02', text: huge.slice(0, 110000) }] });
r = post({ action: 'logask', pin, preview: true, scope: { from: '2024-06-01', to: '2024-06-30' } });
assert.strictEqual(r.error, 'log_ask_too_big'); assert.ok(r.tokens > 60000);
assert.strictEqual(post({ action: 'logask', pin, scope: { from: '2025-07-01', to: '2025-07-31' }, messages: [{ role: 'user', text: 'x' }] }).error, 'log_ask_empty');
assert.strictEqual(claudeCalls.length, 0);

// The monthly reminder applies here too.
props.AI_SPEND = JSON.stringify({ month: new Date().toISOString().slice(0, 7), usd: 9, calls: 1 });
assert.strictEqual(post({ action: 'logask', pin, scope: { from: '2025-10-01', to: '2025-10-31' }, messages: [{ role: 'user', text: 'x' }] }).error, 'ai_budget');
delete props.AI_SPEND;

// REVIEW's summary with one week's entries, plus the review context; even an empty week works.
claudeCalls = [];
r = post({ action: 'logask', pin, mode: 'summary', scope: { from: '2025-10-13', to: '2025-10-19' }, context: 'Finished (3): deck, hives, bulbs.', messages: [{ role: 'user', text: "Write this week's summary." }] });
assert.ok(r.ok); assert.strictEqual(claudeCalls[0].model, 'claude-sonnet-5-5');
assert.ok(claudeCalls[0].messages[0].content[0].text.includes('2025-10-12') === false && claudeCalls[0].messages[0].content[0].text.includes('none in this period'));
assert.ok(claudeCalls[0].messages[0].content[1].text.startsWith('OTHER CONTEXT FROM THE APP\nFinished (3)'));
assert.ok(claudeCalls[0].system.includes("this week's summary"));
assert.strictEqual(JSON.parse(props.AI_LOG)[0].mode, 'logsummary');

// SAVE: an undated "Claude insight" page that the date-based log views skip.
const before = JSON.stringify(post({ action: 'logdates', pin }).dates), leftBefore = post({ action: 'logindex', pin }).left;
r = post({ action: 'logasksave', pin, insight: { title: 'Insight · October 2025 · Key moments', question: 'What were the key moments?', scope: '3 entries, 2025-10-02 to 2025-10-20', text: 'Key moments:\n- frost [2025-10-12]\n- harvest [2025-10-20]' } });
assert.ok(r.ok && r.insight.id, JSON.stringify(r));
const ip = pages.find(x => x.id === r.insight.id);
assert.strictEqual(ip.properties.Source.select.name, 'Claude insight'); assert.ok(!ip.properties.Date.date, 'no date');
assert.deepStrictEqual(blocks_of(ip.id), [['paragraph', 'Question: What were the key moments?'], ['paragraph', 'Entries: 3 entries, 2025-10-02 to 2025-10-20'], ['paragraph', 'Key moments:'], ['bulleted_list_item', 'frost [2025-10-12]'], ['bulleted_list_item', 'harvest [2025-10-20]']]);
assert.strictEqual(JSON.stringify(post({ action: 'logdates', pin }).dates), before, 'not a day in the log');
assert.strictEqual(post({ action: 'logindex', pin }).left, leftBefore, 'not waiting to be indexed');
const list = post({ action: 'loginsights', pin }).insights;
assert.deepStrictEqual(list.map(x => x.title), ['Insight · October 2025 · Key moments']);
const one = post({ action: 'loginsight', pin, id: list[0].id }).insight;
assert.ok(one.text.includes('• frost [2025-10-12]'));
const diary = pages.find(x => x.properties.Date.date && x.properties.Date.date.start === '2025-10-12');
assert.strictEqual(post({ action: 'loginsight', pin, id: diary.id }).error, 'not_writable', 'only insights open here');
assert.strictEqual(post({ action: 'loginsights', pin: '000000' }).error, 'bad_pin');
delete cache.logfail;

// The ASK button still has no way into the log.
const src = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const askPart = src.slice(src.indexOf('function ask_('), src.indexOf('\n}', src.indexOf('function ask_(')));
assert.ok(!/log[A-Z][A-Za-z]*_\(/.test(askPart), 'ask_ never touches the log');
console.log('ALL LOG ASK CHECKS PASSED');
function blocks_of(pid) { return blocks[pid].map(b => [b.type, b[b.type].rich_text.map(x => x.plain_text).join('')]); }
