// Captain's Log search (bridge 1.16): setup adds the Search Text field once, saves and imports
// keep it in step, logindex fills older entries newest first (and only counts on a dry run),
// search finds exact words (case ignored) or any match, returns dates and short snippets,
// needs the PIN, and Ask still has no way in. All entry text is invented.
const fs = require('fs'); const assert = require('assert');
const { bridge } = require('./lib/gas');
const P = 'Search Text';
const b = bridge({ props: { NOTION_TOKEN: 'ntn_test', LOG_PIN: '204816' }, notion: {} }), { ctx, props, cache, nx } = b;
nx.drop('log', P);   // entries saved before setup added the field
const pin = '204816', post = b.post, get = b.post;
const txt = d => nx.rows('log').find(x => x.Date === d)[P];
const caps = () => get({ action: 'ping' }).capabilities;

// Before setup: entries saved the old way (no Search Text), search says it isn't ready.
const OLD = { '2025-02-03': 'Helped the kids with their Homework after dinner.\n\nQuiet night.', '2025-02-10': 'Long day. homework again, then a walk.', '2025-03-01': 'Homeworks piled up; we skipped it.', '2025-04-12': 'Garden beds. Nothing else.' };
assert.ok(post({ action: 'logimport', pin, entries: Object.keys(OLD).map(d => ({ date: d, text: OLD[d] })) }).ok);
assert.ok(nx.calls.filter(c => c.method === 'post' && c.path === '/pages').every(c => !(P in c.body.properties)), 'no field yet, so imports leave it out');
assert.ok(!caps().includes('logsearch'));
assert.strictEqual(get({ action: 'logsearch', pin, q: 'homework' }).error, 'log_search_not_ready');

// setup adds the field once and reports what's left to index.
ctx.logSearchSetup_ && assert.ok(ctx.logSearchSetup_().startsWith('OK (added the "Search Text" field). 4 older entries to index'));
assert.strictEqual(nx.columns('log')[P], 'rich_text'); assert.strictEqual(props.LOG_SEARCH_READY, '1');
const at = nx.calls.length; assert.ok(ctx.logSearchSetup_().startsWith('OK. 4 older'), 'a second run changes nothing');
assert.ok(!nx.calls.slice(at).some(c => c.method === 'patch' && c.path === '/data_sources/' + nx.ds('log')));
assert.ok(caps().includes('logsearch'));

// Searching now finds nothing (not indexed yet) and says so.
let r = get({ action: 'logsearch', pin, q: 'homework' });
assert.ok(r.ok); assert.strictEqual(r.entries.length, 0); assert.strictEqual(r.left, 4);

// Indexing: a dry run only counts; a run fills newest first; Notion busy stops early without losing anything.
assert.deepStrictEqual([post({ action: 'logindex', pin }).did, post({ action: 'logindex', pin }).left], [0, 4]);
const second = nx.rows('log').find(x => x.Date === '2025-03-01').id;
nx.fail({ status: 429, match: 'get /blocks/' + second + '/children', times: 1 });   // the first entry indexed, then busy reading the second
r = post({ action: 'logindex', pin, run: 1 });
assert.ok(r.ok && r.busy); assert.strictEqual(r.did, 1); assert.strictEqual(r.left, 3);
assert.strictEqual(txt('2025-04-12'), 'Garden beds. Nothing else.', 'newest first');
r = post({ action: 'logindex', pin, run: 1 }); assert.ok(r.ok && !r.busy); assert.strictEqual(r.did, 3); assert.strictEqual(r.left, 0);
assert.strictEqual(txt('2025-02-03'), 'Helped the kids with their Homework after dinner. Quiet night.', 'kept on one line');

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
assert.deepStrictEqual(nx.refused().map(c => c.method + ' ' + c.refused.slice(0, 3)), ['get 429'], 'Notion refused only the one slow-down the test asked for');
console.log('ALL LOG SEARCH CHECKS PASSED');
