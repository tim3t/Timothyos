// Session Notes (bridge 1.35): counseling sessions in LOG's SESSIONS tab. Every action is a log action, so it needs the
// authorization code and counts toward the lockout; a session is saved whole (new by cid, changed by id), with plain
// columns, a Data copy of the detail and a readable page body rewritten on each save; ADD TO NEXT TIME sets one field;
// remove moves a page to Notion's trash; only pages of this database can be changed. SUGGEST TOPICS previews without
// calling Claude, sends only the chosen sessions of one type, with no tools, and keeps only dates that were sent; spend
// is logged as "sessions" with no text. Nothing about sessions is cached. All sessions and wording are invented.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test', LOG_PIN: 'OMEGA-1701', ANTHROPIC_API_KEY: 'sk-ant-test' }; const cache = {};
const DB = 'c0e793436cfd43c9962e3a82fe62dc07', DS = 'ds-ses';
const pages = [], blocks = {}; let n = 0, calls = [];
const id = p => p + String(++n).padStart(30, '0');
const rt = arr => (arr || []).map(r => ({ plain_text: r.text.content }));
function store(pg, p) {   // Notion's shape for what the bridge sends
  for (const k in p) {
    const v = p[k];
    if (v.title) pg.properties[k] = { title: rt(v.title) };
    else if (v.rich_text) pg.properties[k] = { rich_text: rt(v.rich_text) };
    else if ('select' in v) pg.properties[k] = { select: v.select };
    else if (v.multi_select) pg.properties[k] = { multi_select: v.multi_select.map(o => ({ name: o.name })) };
    else if ('number' in v) pg.properties[k] = { number: v.number };
    else if ('date' in v) pg.properties[k] = { date: v.date };
  }
}
const kids = c => ({ id: id('b'), type: c.type, has_children: false, [c.type]: { rich_text: rt(c[c.type].rich_text) } });
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  calls.push(m + ' ' + path.split('?')[0]);
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    const r = pages.filter(pg => !pg.in_trash).sort((a, b) => b.properties.Date.date.start.localeCompare(a.properties.Date.date.start));
    return res(200, { results: r, has_more: false });
  }
  if (m === 'post' && path === '/pages') {
    const pg = { id: id('p'), url: 'https://notion.so/s' + n, created_time: new Date().toISOString(), last_edited_time: new Date().toISOString(), parent: { type: 'data_source_id', data_source_id: body.parent.data_source_id }, properties: {} };
    store(pg, body.properties); pages.push(pg); blocks[pg.id] = (body.children || []).map(kids);
    return res(200, pg);
  }
  let mm = path.match(/^\/pages\/([^/?]+)$/);
  if (mm) {
    const pg = pages.find(x => x.id === mm[1]); if (!pg) return res(404, { message: 'no page' });
    if (m === 'patch') { if (body.in_trash) pg.in_trash = true; if (body.properties) store(pg, body.properties); }
    return res(200, pg);
  }
  mm = path.match(/^\/blocks\/([^/?]+)\/children/);
  if (mm && m === 'get') return res(200, { results: blocks[mm[1]] || [], has_more: false });
  if (mm && m === 'patch') { body.children.forEach(c => blocks[mm[1]].push(kids(c))); return res(200, {}); }
  mm = path.match(/^\/blocks\/([^/?]+)$/);
  if (mm && m === 'delete') { for (const k in blocks) { const i = blocks[k].findIndex(b => b.id === mm[1]); if (i > -1) blocks[k].splice(i, 1); } return res(200, {}); }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
let claudeCalls = [], reply = '';
function anthropic(url, opts) {
  const body = JSON.parse(opts.payload); claudeCalls.push(body);
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: reply }], usage: { input_tokens: 900, output_tokens: 300 } }) };
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: (d, tz, f) => f === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: (url, opts) => /anthropic\.com/.test(url) ? anthropic(url, opts) : mock(url, opts) },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY, pin = 'OMEGA-1701';
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const get = p => JSON.parse(ctx.doGet({ parameter: Object.assign({ key }, p) }).text);
const J = x => JSON.parse(JSON.stringify(x));   // values from the sandbox, compared as plain data

// ---- capabilities
let caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sessions') && caps.includes('sessionsuggest'));
delete props.ANTHROPIC_API_KEY; caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sessions') && !caps.includes('sessionsuggest'), 'suggestions need the Claude key');
props.ANTHROPIC_API_KEY = 'sk-ant-test';

// ---- the code guards every session action, and wrong codes count toward the lockout
calls = [];   /* ping's own status reads aside */
for (const a of ['logsessions', 'logsessionsave', 'logsessionnext', 'logsessionremove', 'logsessionsuggest']) {
  assert.strictEqual(post({ action: a }).error, 'bad_pin', a + ' without a code');
  delete cache.logfail;
}
assert.strictEqual(get({ action: 'logsessions', pin: 'ALPHA-0000' }).error, 'bad_pin');
assert.strictEqual(cache.logfail, '1', 'a miss counts'); delete cache.logfail;
assert.strictEqual(calls.length, 0, 'nothing reaches Notion without the code');

// ---- save a new session
const S1 = { type: 'solo', day: '2026-10-08', where: 'Video', arriving: 3, leaving: 3, felt: 'Steady', onMind: 'Feeling flat.',
  topics: [{ name: 'MOOD', note: 'Flat rather than sad.' }, { name: 'GOALS, DIRECTION', note: '' }], landed: 'Flat follows weeks of only urgent things.', phrase: 'Energy follows something mine.',
  practice: ['Note one thing done well each evening'], carried: [], nextTime: 'Work stress is building.', next: '2026-10-22' };
let r = post({ action: 'logsessionsave', pin, session: Object.assign({ cid: 'cid-0001' }, S1) });
assert.ok(r.ok, JSON.stringify(r));
const s1 = r.session;
assert.deepStrictEqual(J([s1.type, s1.day, s1.where, s1.felt, s1.arriving, s1.leaving, s1.next]), ['solo', '2026-10-08', 'Video', 'Steady', 3, 3, '2026-10-22']);
assert.deepStrictEqual(J(s1.topics), [{ name: 'MOOD', note: 'Flat rather than sad.' }, { name: 'GOALS DIRECTION', note: '' }], 'a comma (not allowed in Notion option names) becomes a space');
assert.strictEqual(s1.onMind, 'Feeling flat.'); assert.deepStrictEqual(J(s1.practice), ['Note one thing done well each evening']);
const pg1 = pages[0];
assert.strictEqual(pg1.properties.Session.title[0].plain_text, 'Solo · Thursday, October 8, 2026');
assert.strictEqual(pg1.properties['What Landed'].rich_text[0].plain_text, S1.landed);
assert.deepStrictEqual(pg1.properties.Topics.multi_select.map(o => o.name), ['MOOD', 'GOALS DIRECTION']);
const body1 = blocks[pg1.id].map(b => b.type + ':' + b[b.type].rich_text.map(x => x.plain_text).join(''));
assert.deepStrictEqual(body1, ['heading_3:On my mind going in', 'paragraph:Feeling flat.', 'heading_3:Topics', 'bulleted_list_item:MOOD: Flat rather than sad.', 'bulleted_list_item:GOALS DIRECTION',
  'heading_3:What landed', 'paragraph:' + S1.landed, 'heading_3:A phrase to keep', 'paragraph:' + S1.phrase, 'heading_3:Practice until next time', 'bulleted_list_item:Note one thing done well each evening',
  'heading_3:Bring up next time', 'paragraph:Work stress is building.'], 'a readable copy in the page');
// the same cid again: the same page, not a second one; the cache keeps only the page id
r = post({ action: 'logsessionsave', pin, session: Object.assign({ cid: 'cid-0001' }, S1) });
assert.ok(r.duplicate && r.session.id === s1.id && pages.length === 1);
assert.ok(!JSON.stringify(cache).includes('flat'), 'no session text in the cache');

// ---- bad requests are refused before Notion
const bad = [{ type: 'group' }, { day: '2026-02-30' }, { arriving: 6 }, { arriving: 2.5 }, { felt: 'Fine' }, { where: 'Park' }, { next: 'soon' },
  { topics: Array.from({ length: 21 }, (_, i) => ({ name: 'T' + i })) }, { topics: [{ name: 'A' }, { name: 'A' }] }, { topics: [{ name: 'x'.repeat(41) }] },
  { landed: 'x'.repeat(2001) }, { practice: [''] }, { carried: [{ text: 'walk', did: 'maybe' }] }];
const before = calls.length;
bad.forEach(b => assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({ cid: 'cid-bad' }, S1, b) }).error, 'bad_request', JSON.stringify(b)));
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({}, S1) }).error, 'bad_request', 'a new session needs a cid');
assert.strictEqual(calls.length, before, 'refused before Notion');

// ---- more sessions, then the list: newest first, both types, full detail
post({ action: 'logsessionsave', pin, session: { cid: 'cid-0002', type: 'solo', day: '2026-10-22', arriving: 2, leaving: 3, felt: 'Heavy but useful', topics: [{ name: 'STRESS + WORK', note: 'Saying yes too fast.' }],
  landed: 'A fast yes avoids disappointing someone.', practice: ['Pause one breath before agreeing'], carried: [{ text: 'Note one thing done well each evening', did: 'y' }], nextTime: 'How the pause went.' } });
post({ action: 'logsessionsave', pin, session: { cid: 'cid-0003', type: 'couples', day: '2026-10-14', topics: [{ name: 'CONFLICT + REPAIR', note: 'The weekend argument.' }], landed: 'It is about who carries the planning.' } });
r = get({ action: 'logsessions', pin });
assert.ok(r.ok); assert.deepStrictEqual(J(r.sessions.map(s => s.day + ' ' + s.type)), ['2026-10-22 solo', '2026-10-14 couples', '2026-10-08 solo']);
assert.deepStrictEqual(J(r.sessions[0].carried), [{ text: 'Note one thing done well each evening', did: 'y' }]);
assert.ok(r.url.endsWith(DB));

// ---- change a session: columns patched, the body rewritten
r = post({ action: 'logsessionsave', pin, session: Object.assign({ id: s1.id }, S1, { phrase: '', topics: [{ name: 'MOOD', note: 'Flat, not sad.' }] }) });
assert.ok(r.ok && r.session.id === s1.id);
assert.deepStrictEqual(J(r.session.topics), [{ name: 'MOOD', note: 'Flat, not sad.' }]);
assert.strictEqual(pg1.properties.Phrase.rich_text.length, 0, 'a cleared field is cleared');
assert.ok(blocks[pg1.id].some(b => (b.bulleted_list_item || {}).rich_text && b.bulleted_list_item.rich_text[0].plain_text === 'MOOD: Flat, not sad.'));
assert.ok(!blocks[pg1.id].some(b => b.type === 'heading_3' && b.heading_3.rich_text[0].plain_text === 'A phrase to keep'), 'old body gone');

// ---- only pages of this database
pages.push({ id: 'p'.repeat(32), parent: { type: 'data_source_id', data_source_id: 'ds-log' }, properties: { Date: { date: { start: '2026-10-01' } } }, in_trash: true });
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({ id: 'p'.repeat(32) }, S1) }).error, 'not_writable');
assert.strictEqual(post({ action: 'logsessionremove', pin, id: 'p'.repeat(32) }).error, 'not_writable');
assert.strictEqual(post({ action: 'logsessionnext', pin, id: 'p'.repeat(32), text: 'x' }).error, 'not_writable');
pages.pop();

// ---- ADD TO NEXT TIME: one field, set to the value given
const latest = get({ action: 'logsessions', pin }).sessions[0];
r = post({ action: 'logsessionnext', pin, id: latest.id, text: 'How the pause went.\nSleep: anxiety or habit?' });
assert.ok(r.ok); assert.strictEqual(r.session.nextTime, 'How the pause went.\nSleep: anxiety or habit?');
assert.strictEqual(post({ action: 'logsessionnext', pin, id: latest.id, text: 'x'.repeat(2001) }).error, 'bad_request');

// ---- SUGGEST TOPICS
const all = get({ action: 'logsessions', pin }).sessions, soloIds = all.filter(s => s.type === 'solo').map(s => s.id), coupleId = all.find(s => s.type === 'couples').id;
claudeCalls = [];
r = post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds.concat([coupleId]), preview: true });
assert.ok(r.ok && r.preview); assert.strictEqual(r.preview.count, 2, 'only the type asked for'); assert.deepStrictEqual(J(r.preview.dates), ['2026-10-08', '2026-10-22']);
assert.ok(r.preview.tokens > 200 && r.preview.usd.deep > r.preview.usd.fast && r.preview.usd.fast > 0);
assert.strictEqual(claudeCalls.length, 0, 'a preview never calls Claude');
assert.strictEqual(post({ action: 'logsessionsuggest', pin, type: 'solo', ids: Array.from({ length: 13 }, (_, i) => 'q'.repeat(31) + i % 10) }).error, 'bad_request', 'at most 12 sessions');
assert.strictEqual(post({ action: 'logsessionsuggest', pin, type: 'group', ids: soloIds }).error, 'bad_request');
reply = 'TOPIC: How the pause went\nWHY: You set the pause as practice on 22 October\nafter naming the fast yes.\nFROM: 2026-10-22\n\nTOPIC: Energy and what is yours\nWHY: Flat weeks follow urgent-only weeks.\nFROM: 2026-10-08, 2026-01-01, 2026-10-14';
r = post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(J(r.topics), [{ title: 'How the pause went', why: 'You set the pause as practice on 22 October after naming the fast yes.', dates: ['2026-10-22'] },
  { title: 'Energy and what is yours', why: 'Flat weeks follow urgent-only weeks.', dates: ['2026-10-08'] }], 'dates that were not sent are dropped');
const sent = claudeCalls[0];
assert.strictEqual(sent.model, 'claude-sonnet-5-5'); assert.ok(!sent.tools, 'no tools');
assert.ok(sent.system.includes("Reflect, don't diagnose") && sent.system.includes('TOPIC:'));
const text = sent.messages[0].content;
assert.ok(text.startsWith('SOLO COUNSELING SESSION NOTES (2, 2026-10-08 to 2026-10-22)') && text.includes('Topic, STRESS + WORK: Saying yes too fast.') && text.includes("Last time's practice: Note one thing done well each evening (done)"));
assert.ok(!text.includes('weekend argument'), 'never the other type');
r = post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds, mode: 'deep' });
assert.strictEqual(claudeCalls[1].model, 'claude-opus-5-5');
const log = JSON.parse(props.AI_LOG);
assert.strictEqual(log[0].mode, 'sessions'); assert.ok(!/pause|flat|STRESS/i.test(JSON.stringify(log)), 'no text in the spend log');
reply = 'I would rather not.'; assert.strictEqual(post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds }).detail, 'no_topics');
props.AI_SPEND = JSON.stringify({ month: new Date().toISOString().slice(0, 7), usd: 9, calls: 1 });
assert.strictEqual(post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds }).error, 'ai_budget', 'the monthly reminder pauses it');
delete props.AI_SPEND;

// ---- remove: to the trash, gone from the list
r = post({ action: 'logsessionremove', pin, id: coupleId });
assert.ok(r.ok); assert.ok(pages.find(p => p.id === coupleId).in_trash);
assert.ok(!get({ action: 'logsessions', pin }).sessions.some(s => s.id === coupleId));

// ---- the column check knows the database
const spec = ctx.schemaSpec_().find(d => d.key === 'sessions');
assert.ok(spec && spec.need.some(x => x[0] === 'Topics' && x[1] === 'multi_select') && spec.need.some(x => x[0] === 'Bring Up Next Time'));
assert.ok(ctx.sessionsStatus_().startsWith('OK (2 sessions)'));
console.log('bridge_sessions: ok');
