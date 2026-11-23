// Session Notes (bridge 1.35): counseling sessions in LOG's SESSIONS tab. Every action is a log action, so it needs the
// authorization code and counts toward the lockout; a session is saved whole (new by cid, changed by id), with plain
// columns, a Data copy of the detail and a readable page body rewritten on each save; ADD TO NEXT TIME sets one field;
// remove moves a page to Notion's trash; only pages of this database can be changed. SUGGEST TOPICS previews without
// calling Claude, sends only the chosen sessions of one type, with no tools, and keeps only dates that were sent; spend
// is logged as "sessions" with no text. Nothing about sessions is cached. All sessions and wording are invented.
const assert = require('assert');
const { bridge, formatDate } = require('./lib/gas');
let claudeCalls = [], reply = '';
function fetch(url, opts, res) {
  if (!/anthropic\.com/.test(url)) return;
  const body = JSON.parse(opts.payload); claudeCalls.push(body);
  return res(200, { model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: reply }], usage: { input_tokens: 900, output_tokens: 300 } });
}
const b = bridge({ props: { NOTION_TOKEN: 'ntn_test', LOG_PIN: 'OMEGA-1701', ANTHROPIC_API_KEY: 'sk-ant-test' }, notion: {}, fetch }), { ctx, props, cache, nx } = b;
const pin = 'OMEGA-1701', post = b.post, get = b.post;
const body = id => nx.blocks(id).map(x => x.type + ':' + x[x.type].rich_text.map(t => t.plain_text).join(''));
const J = x => JSON.parse(JSON.stringify(x));   // values from the sandbox, compared as plain data

// ---- capabilities
let caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sessions') && caps.includes('sessionsuggest'));
delete props.ANTHROPIC_API_KEY; caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sessions') && !caps.includes('sessionsuggest'), 'suggestions need the Claude key');
props.ANTHROPIC_API_KEY = 'sk-ant-test';

// ---- the code guards every session action, and wrong codes count toward the lockout
const at0 = nx.calls.length;   /* ping's own status reads aside */
for (const a of ['logsessions', 'logsessionsave', 'logsessionnext', 'logsessionremove', 'logsessionsuggest']) {
  assert.strictEqual(post({ action: a }).error, 'bad_pin', a + ' without a code');
  delete cache.logfail;
}
assert.strictEqual(get({ action: 'logsessions', pin: 'ALPHA-0000' }).error, 'bad_pin');
assert.strictEqual(cache.logfail, '1', 'a miss counts'); delete cache.logfail;
assert.strictEqual(nx.calls.length, at0, 'nothing reaches Notion without the code');

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
const pg1 = nx.row(s1.id);
assert.strictEqual(pg1.Session, 'Solo · Thursday, October 8, 2026');
assert.strictEqual(pg1['What Landed'], S1.landed);
assert.deepStrictEqual(pg1.Topics, ['MOOD', 'GOALS DIRECTION']);
assert.deepStrictEqual(body(s1.id), ['heading_3:On my mind going in', 'paragraph:Feeling flat.', 'heading_3:Topics', 'bulleted_list_item:MOOD: Flat rather than sad.', 'bulleted_list_item:GOALS DIRECTION',
  'heading_3:What landed', 'paragraph:' + S1.landed, 'heading_3:A phrase to keep', 'paragraph:' + S1.phrase, 'heading_3:Practice until next time', 'bulleted_list_item:Note one thing done well each evening',
  'heading_3:Bring up next time', 'paragraph:Work stress is building.'], 'a readable copy in the page');
// the same cid again: the same page, not a second one; the cache keeps only the page id
r = post({ action: 'logsessionsave', pin, session: Object.assign({ cid: 'cid-0001' }, S1) });
assert.ok(r.duplicate && r.session.id === s1.id && nx.rows('sessions').length === 1);
assert.ok(!JSON.stringify(cache).includes('flat'), 'no session text in the cache');

// ---- bad requests are refused before Notion
const bad = [{ type: 'group' }, { day: '2026-02-30' }, { arriving: 6 }, { arriving: 2.5 }, { felt: 'Fine' }, { where: 'Park' }, { next: 'soon' },
  { topics: Array.from({ length: 21 }, (_, i) => ({ name: 'T' + i })) }, { topics: [{ name: 'A' }, { name: 'A' }] }, { topics: [{ name: 'x'.repeat(41) }] },
  { landed: 'x'.repeat(2001) }, { practice: [''] }, { carried: [{ text: 'walk', did: 'maybe' }] }];
const before = nx.calls.length;
bad.forEach(x => assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({ cid: 'cid-bad' }, S1, x) }).error, 'bad_request', JSON.stringify(x)));
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({}, S1) }).error, 'bad_request', 'a new session needs a cid');
assert.strictEqual(nx.calls.length, before, 'refused before Notion');

// ---- more sessions, then the list: newest first, both types, full detail
post({ action: 'logsessionsave', pin, session: { cid: 'cid-0002', type: 'solo', day: '2026-10-22', arriving: 2, leaving: 3, felt: 'Heavy but useful', topics: [{ name: 'STRESS + WORK', note: 'Saying yes too fast.' }],
  landed: 'A fast yes avoids disappointing someone.', practice: ['Pause one breath before agreeing'], carried: [{ text: 'Note one thing done well each evening', did: 'y' }], nextTime: 'How the pause went.' } });
post({ action: 'logsessionsave', pin, session: { cid: 'cid-0003', type: 'couples', day: '2026-10-14', topics: [{ name: 'CONFLICT + REPAIR', note: 'The weekend argument.' }], landed: 'It is about who carries the planning.' } });
r = get({ action: 'logsessions', pin });
assert.ok(r.ok); assert.deepStrictEqual(J(r.sessions.map(s => s.day + ' ' + s.type)), ['2026-10-22 solo', '2026-10-14 couples', '2026-10-08 solo']);
assert.deepStrictEqual(J(r.sessions[0].carried), [{ text: 'Note one thing done well each evening', did: 'y' }]);
assert.ok(r.url.endsWith(nx.dbId('sessions').replace(/-/g, '')));

// ---- change a session: columns patched, the body rewritten
r = post({ action: 'logsessionsave', pin, session: Object.assign({ id: s1.id }, S1, { phrase: '', topics: [{ name: 'MOOD', note: 'Flat, not sad.' }] }) });
assert.ok(r.ok && r.session.id === s1.id);
assert.deepStrictEqual(J(r.session.topics), [{ name: 'MOOD', note: 'Flat, not sad.' }]);
assert.strictEqual(nx.row(s1.id).Phrase, '', 'a cleared field is cleared');
assert.ok(body(s1.id).includes('bulleted_list_item:MOOD: Flat, not sad.'));
assert.ok(!body(s1.id).includes('heading_3:A phrase to keep'), 'old body gone');

// ---- only pages of this database
const other = nx.add('log', { Name: 'Sample entry', Date: '2026-10-01' });   // a page of another database, not in the trash
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({ id: other }, S1) }).error, 'not_writable');
assert.strictEqual(post({ action: 'logsessionremove', pin, id: other }).error, 'not_writable');
assert.strictEqual(post({ action: 'logsessionnext', pin, id: other, text: 'x' }).error, 'not_writable');
assert.deepStrictEqual([nx.row(other).Name, nx.row(other).in_trash], ['Sample entry', false], 'left as it was');

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
props.AI_SPEND = JSON.stringify({ month: formatDate(new Date(), 'America/Chicago', 'yyyy-MM'), usd: 9, calls: 1 });
assert.strictEqual(post({ action: 'logsessionsuggest', pin, type: 'solo', ids: soloIds }).error, 'ai_budget', 'the monthly reminder pauses it');
delete props.AI_SPEND;

// ---- remove: to the trash, gone from the list
r = post({ action: 'logsessionremove', pin, id: coupleId });
assert.ok(r.ok); assert.ok(nx.row(coupleId).in_trash);
assert.ok(!get({ action: 'logsessions', pin }).sessions.some(s => s.id === coupleId));
assert.strictEqual(post({ action: 'logsessionnext', pin, id: coupleId, text: 'x' }).error, 'not_writable', 'a session in the trash is not changed');

// ---- 1.52: ASK THE LOG answers held for a session, dropped into one, filed as insights once it's saved (invented text)
caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sessionprep'), 'held answers come from ASK THE LOG, so they need its key');
assert.strictEqual(post({ action: 'logpreps' }).error, 'bad_pin', 'behind the code like the rest of LOG'); delete cache.logfail;
const ANS = 'Threads worth raising:\n- A sample worry at bedtime [2026-11-16]\n- A calmer evening after a walk [2026-11-17]';
const held = post({ action: 'logasksave', pin, insight: { title: 'For a session · November 2026 · topics to raise', question: 'What should I raise today?', scope: '2026-11-01 to 2026-11-23', text: ANS, hold: true } });
const plainIns = post({ action: 'logasksave', pin, insight: { title: 'Insight · November 2026 · the week', question: 'How was the week?', scope: '2026-11-01 to 2026-11-23', text: 'A steady week.' } });
const held2 = post({ action: 'logasksave', pin, insight: { title: 'For a session · a second one', question: 'Anything else?', scope: '2026-11-20', text: 'One more thread.', hold: true } });
assert.ok(held.ok && held.insight.held === true && plainIns.insight.held === false);
assert.deepStrictEqual([nx.row(held.insight.id).Source, nx.row(plainIns.insight.id).Source], ['Session prep', 'Claude insight']);
let preps = post({ action: 'logpreps', pin }).preps;
assert.deepStrictEqual(preps.map(x => x.id).sort(), [held.insight.id, held2.insight.id].sort(), 'only the held ones');
const hp = preps.find(x => x.id === held.insight.id);
assert.deepStrictEqual([hp.question, hp.scope], ['What should I raise today?', '2026-11-01 to 2026-11-23']);
assert.ok(hp.text.startsWith('Threads worth raising:') && hp.text.includes('• A sample worry at bedtime [2026-11-16]') && !hp.text.includes('Question:'), hp.text);
assert.ok(!post({ action: 'loginsights', pin }).insights.some(x => x.id === held.insight.id), 'a held answer is not among the saved insights yet');
// REMOVE: to the trash; only Log pages that are held or filed answers
assert.strictEqual(post({ action: 'logprepset', pin, id: held2.insight.id, to: 'later' }).error, 'bad_request');
assert.strictEqual(post({ action: 'logprepset', pin, id: soloIds[0], to: 'trash' }).error, 'not_writable', 'a session page is never touched');
assert.ok(post({ action: 'logprepset', pin, id: held2.insight.id, to: 'trash' }).ok && nx.row(held2.insight.id).in_trash);
// dropped into a session and saved: kept in Data and the page body, then filed as an ordinary insight
const P = { id: held.insight.id, title: 'For a session · November 2026 · topics to raise', text: hp.text + '\nAnd one line added in the session.' };
r = post({ action: 'logsessionsave', pin, session: Object.assign({}, S1, { day: '2026-11-23', cid: 'ses-prep-0001', prep: [P] }) });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(J(r.session.prep), [P], 'read back as it was sent');
const pb = body(r.session.id);
assert.ok(pb.includes('heading_3:Brought from the log') && pb.some(x => x.includes('A sample worry at bedtime')) && pb.some(x => x.includes('And one line added')), pb.join(' | '));
assert.ok(pb.indexOf('heading_3:Brought from the log') > pb.indexOf('heading_3:On my mind going in'), 'after what was on my mind');
assert.strictEqual(nx.row(held.insight.id).Source, 'Claude insight', 'filed as an ordinary insight once the session is saved');
assert.deepStrictEqual(post({ action: 'logpreps', pin }).preps, [], 'nothing left waiting');
assert.ok(post({ action: 'loginsights', pin }).insights.some(x => x.id === held.insight.id));
// limits: five at most, 40,000 characters in all, real ids
const big = 'x'.repeat(15000);
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({}, S1, { cid: 'ses-prep-0002', prep: Array.from({ length: 6 }, () => ({ id: '', title: 't', text: 'a' })) }) }).error, 'bad_request');
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({}, S1, { cid: 'ses-prep-0003', prep: [1, 2, 3].map(() => ({ id: '', title: 't', text: big })) }) }).error, 'bad_request', 'over 40,000 characters');
assert.strictEqual(post({ action: 'logsessionsave', pin, session: Object.assign({}, S1, { cid: 'ses-prep-0004', prep: [{ id: '../x', title: 't', text: 'a' }] }) }).error, 'bad_request');
post({ action: 'logsessionremove', pin, id: r.session.id });

// ---- the column check knows the database
const spec = ctx.schemaSpec_().find(d => d.key === 'sessions');
assert.ok(spec && spec.need.some(x => x[0] === 'Topics' && x[1] === 'multi_select') && spec.need.some(x => x[0] === 'Bring Up Next Time'));
assert.ok(ctx.sessionsStatus_().startsWith('OK (2 sessions)'), ctx.sessionsStatus_());
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('bridge_sessions: ok');
