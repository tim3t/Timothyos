// Captain's Log: PIN gate + lockout, dates, day read, save (create, edit in place,
// paragraphs removed), import (skips days already written), Notion-only content
// refused for editing, nothing leaks into Ask. Sample text is invented.
const fs = require('fs'); const assert = require('assert');
const { bridge } = require('./lib/gas');
const b = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), { ctx, props, cache, nx } = b;
const key = props.ACCESS_KEY, post = b.post, ping = () => b.post({ action: 'ping' });
let blip = 0;
const sp = ctx.PropertiesService.getScriptProperties(), readProp = sp.getProperty;
sp.getProperty = k => (k === 'ACCESS_KEY' && blip > 0 && blip--) ? null : readProp(k);
const day = d => nx.rows('log').find(r => r.Date === d);
const since = at => nx.calls.slice(at).map(c => c.method + ' ' + c.path);
const writes = at => since(at).filter(c => /^(patch|delete) /.test(c));

// No PIN set: the log refuses everything, caps say so.
assert.ok(ping().capabilities.includes('log')); assert.ok(!ping().capabilities.includes('logpin'));
assert.strictEqual(post({ action: 'logunlock', pin: '123456' }).error, 'log_pin_not_set');
props.LOG_PIN = '204816';
assert.ok(ping().capabilities.includes('logpin'));
// Access key still required.
assert.strictEqual(b.call({ action: 'logunlock', pin: '204816' }).error, 'no_key', 'a request that lost its details says so');
assert.strictEqual(b.call({ key: 'x'.repeat(64), action: 'logunlock', pin: '204816' }).error, 'unauthorized', 'a wrong key is refused');
assert.strictEqual(JSON.parse(ctx.doGet({ parameter: {} }).text).error, 'no_key', 'a POST turned into an empty GET is recognisable (the app retries it)');
assert.strictEqual(JSON.parse(ctx.doGet({ parameter: { key, action: 'ping' } }).text).error, 'use_post', '1.38: even with the key, nothing is read by GET');
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: '{}' } }).text).error, 'no_key', 'a POST without its body is recognisable');
// Wrong PIN counts down, right PIN resets.
let r = post({ action: 'logunlock', pin: '111111' }); assert.strictEqual(r.error, 'bad_pin'); assert.strictEqual(r.left, 4);
r = post({ action: 'logday', pin: '20481', date: '2026-10-07' }); assert.strictEqual(r.error, 'bad_pin'); assert.strictEqual(r.left, 3);
r = post({ action: 'logunlock', pin: '204816' }); assert.ok(r.ok); assert.deepStrictEqual(r.dates, []); assert.ok(!cache.logfail);
// Five misses lock it, even for the right PIN.
for (let i = 0; i < 4; i++) post({ action: 'logunlock', pin: '000000' });
assert.strictEqual(post({ action: 'logunlock', pin: '000000' }).error, 'log_locked');
assert.strictEqual(post({ action: 'logunlock', pin: '204816' }).error, 'log_locked');
delete cache.logfail; delete props.LOG_LOCK_UNTIL;   // the 15 minutes pass
const pin = '204816';

// Save a new day: one paragraph block per paragraph, line breaks kept, long paragraphs split into 2000-char pieces.
const long = 'x'.repeat(4500);
const T1 = 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n\n' + long + '\n';
r = post({ action: 'logsave', pin, date: '2026-10-07', text: T1 }); assert.ok(r.ok && r.created, JSON.stringify(r));
const pg = day('2026-10-07');
assert.strictEqual(pg.Name, 'Wednesday, October 7, 2026');
assert.strictEqual(pg.Source, 'Bridge');
assert.strictEqual(nx.blocks(pg.id).length, 3);
assert.strictEqual(nx.blocks(pg.id)[2].paragraph.rich_text.length, 3);
r = post({ action: 'logday', pin, date: '2026-10-07' });
assert.strictEqual(r.entry.text, 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n' + long);
assert.strictEqual(r.entry.other, false);
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-08' }).entry, null);
assert.deepStrictEqual(post({ action: 'logdates', pin }).dates, ['2026-10-07']);

// Edit: an added paragraph at the end is one append; nothing patched or removed.
let at = nx.calls.length;
r = post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n' + long + '\n\nEvening: early night.' });
assert.ok(r.ok && !r.created);
assert.deepStrictEqual(writes(at).filter(c => !c.endsWith('/children')), [], 'unchanged paragraphs untouched');
assert.deepStrictEqual(writes(at), ['patch /blocks/' + pg.id + '/children'], 'one append to the page');
// Edit in the middle and remove the last two: one patch, two deletes. Survives a "slow down" from Notion.
nx.fail({ status: 429, match: 'patch ', times: 1 });
r = post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.' });
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-07' }).entry.text, 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.');
assert.strictEqual(nx.blocks(pg.id).length, 2);
// Saving the same text again changes nothing.
at = nx.calls.length; post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.' });
assert.deepStrictEqual(writes(at), []);
// Something added in Notion that the LOG can't show: the app must not overwrite it.
const img = nx.blocks(pg.id, [{ type: 'image', image: { type: 'external', external: { url: 'https://img.example/pond.jpg' } } }])[0];
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-07' }).entry.other, true);
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-10-07', text: 'Short now' }).error, 'log_edit_in_notion');
assert.ok(nx.blocks(pg.id).some(x => x.id === img.id));

// Import: up to 10 a time, days already written skipped, resending adds nothing twice.
const E = [{ date: '2025-11-13', text: 'First page.\n\nSecond paragraph.' }, { date: '2025-11-14', text: 'Next day.' }, { date: '2026-10-07', text: 'Would overwrite' }, { date: '2025-11-15', text: '   ' }];
r = post({ action: 'logimport', pin, entries: E });
assert.deepStrictEqual(r.created, ['2025-11-13', '2025-11-14']); assert.deepStrictEqual(r.skipped.sort(), ['2025-11-15', '2026-10-07']);
r = post({ action: 'logimport', pin, entries: E }); assert.deepStrictEqual(r.created, []);
assert.strictEqual(day('2025-11-13').Source, 'Diary import');
assert.strictEqual(post({ action: 'logday', pin, date: '2025-11-13' }).entry.text, 'First page.\n\nSecond paragraph.');
assert.deepStrictEqual(post({ action: 'logdates', pin }).dates, ['2025-11-13', '2025-11-14', '2026-10-07'], 'dates refresh after writes');
assert.strictEqual(post({ action: 'logimport', pin, entries: new Array(11).fill({ date: '2025-11-20', text: 'x' }) }).error, 'bad_request');
assert.strictEqual(post({ action: 'logimport', pin, entries: [{ date: '2025-02-30', text: 'x' }] }).error, 'bad_request');
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-13-01', text: 'x' }).error, 'bad_request');
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-10-09', text: 'y'.repeat(120001) }).error, 'too_long');
// An empty first save creates nothing.
r = post({ action: 'logsave', pin, date: '2026-10-10', text: '  \n\n ' }); assert.ok(r.ok && !r.created); assert.ok(!day('2026-10-10'));

// Nothing with entry text is cached, and Ask can't reach the log.
assert.ok(!Object.keys(cache).some(k => /Quiet morning|First page/.test(cache[k])), 'no entry text in the cache');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const askPart = src.slice(src.indexOf('// ---- Ask Claude'));
assert.ok(!/log(Day|Dates|Save|Import|Blocks|Source)_/.test(askPart), 'Ask code never calls the log');
// The properties store answering empty for a moment doesn't turn a good key away.
blip = 1; assert.ok(post({ action: 'logdates', pin }).ok, 'momentary empty read retried');
blip = 5; assert.strictEqual(post({ action: 'logdates', pin }).error, 'key_unreadable', 'a lasting gap is reported as such'); blip = 0;
// Reads also work as GET (the key and PIN in the address survive a redirect).
const getL = post;
assert.strictEqual(getL({ action: 'logday', pin, date: '2025-11-13' }).entry.text, 'First page.\n\nSecond paragraph.');
assert.ok(getL({ action: 'logunlock', pin }).dates.includes('2026-10-07'));
assert.strictEqual(getL({ action: 'logday', pin: '999999', date: '2025-11-13' }).error, 'bad_pin');
delete cache.logfail;
// The list of written days stays cached across saves and picks up new days in place.
const before = nx.calls.length; getL({ action: 'logdates', pin });
assert.strictEqual(since(before).filter(c => /query/.test(c)).length, 0, 'served from cache');
post({ action: 'logsave', pin, date: '2026-10-11', text: 'A new day.' });
const b2 = nx.calls.length; assert.ok(getL({ action: 'logdates', pin }).dates.includes('2026-10-11')); assert.strictEqual(since(b2).filter(c => /query/.test(c)).length, 0);

// Bulleted lists (bridge 1.19): "• " or "- " lines are Notion list items, read back one per line.
props.LOG_PIN = '204816';
const LISTED = 'Morning chores:\n- feed the hens\n• check the hives\n\nThen coffee.';
r = post({ action: 'logsave', pin, date: '2026-10-12', text: LISTED }); assert.ok(r.ok && r.created);
let lp = day('2026-10-12');
assert.deepStrictEqual(nx.blocks(lp.id).map(x => x.type), ['paragraph', 'bulleted_list_item', 'bulleted_list_item', 'paragraph']);
assert.strictEqual(nx.blocks(lp.id)[1].bulleted_list_item.rich_text[0].plain_text, 'feed the hens');
const back = post({ action: 'logday', pin, date: '2026-10-12' }).entry.text;
assert.strictEqual(back, 'Morning chores:\n\n• feed the hens\n• check the hives\n\nThen coffee.', 'list items one per line, a blank line around the list');
// Saving that text again changes nothing; editing one item patches only it.
at = nx.calls.length; post({ action: 'logsave', pin, date: '2026-10-12', text: back });
assert.deepStrictEqual(writes(at), [], 'unchanged');
at = nx.calls.length; post({ action: 'logsave', pin, date: '2026-10-12', text: back.replace('check the hives', 'check the hives twice') });
assert.deepStrictEqual(writes(at), ['patch /blocks/' + nx.blocks(lp.id)[2].id]);
assert.strictEqual(nx.blocks(lp.id)[2].bulleted_list_item.rich_text[0].plain_text, 'check the hives twice');
// A paragraph turned into a list item is replaced from there on, in order.
post({ action: 'logsave', pin, date: '2026-10-12', text: 'Morning chores:\n\n• feed the hens\n• check the hives twice\n• then coffee' });
assert.deepStrictEqual(nx.blocks(lp.id).map(x => x.type), ['paragraph', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item']);
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-12' }).entry.text, 'Morning chores:\n\n• feed the hens\n• check the hives twice\n• then coffee');
// Empty bullets are dropped; a dash inside a sentence isn't a bullet.
post({ action: 'logsave', pin, date: '2026-10-13', text: '• \nA day - quiet.\n-no space' });
lp = day('2026-10-13');
assert.deepStrictEqual(nx.blocks(lp.id).map(x => [x.type, x[x.type].rich_text.map(t => t.plain_text).join('')]), [['paragraph', 'A day - quiet.\n-no space']]);
// Imports turn dash lines into list items too.
post({ action: 'logimport', pin, entries: [{ date: '2025-01-02', text: 'Goals:\n- read more\n- walk' }] });
lp = day('2025-01-02');
assert.deepStrictEqual(nx.blocks(lp.id).map(x => x.type), ['paragraph', 'bulleted_list_item', 'bulleted_list_item']);
// A long day: Notion takes 100 blocks a request, so the page comes with the first 100 and the rest is appended.
const lines = Array.from({ length: 150 }, (_, i) => 'Line ' + (i + 1) + '.').join('\n\n');
at = nx.calls.length;
assert.ok(post({ action: 'logsave', pin, date: '2026-10-14', text: lines }).created);
assert.deepStrictEqual(nx.calls.slice(at).filter(c => c.body.children).map(c => c.body.children.length), [100, 50], 'the page with 100 blocks, then one append of 50');
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-14' }).entry.text, lines, 'read back across two pages of blocks');
// Authorization code (bridge 1.17): a Greek code word and four digits, written any of the usual ways.
props.LOG_PIN = 'omega 1701';
assert.ok(ping().capabilities.includes('logpin') && ping().capabilities.includes('logcode'));
assert.ok(ctx.logStatus_().includes('Authorization code set (OMEGA and four digits)'));
assert.ok(post({ action: 'logunlock', pin: 'OMEGA-1701' }).ok, 'the panel sends WORD-1234');
assert.ok(post({ action: 'logunlock', pin: 'Ω1701' }).ok && post({ action: 'logunlock', pin: 'omega1701' }).ok, 'glyph or lower case too');
r = post({ action: 'logunlock', pin: 'ALPHA-1701' }); assert.strictEqual(r.error, 'bad_pin'); assert.strictEqual(r.left, 4);
assert.strictEqual(post({ action: 'logunlock', pin: '001701' }).error, 'bad_pin', 'six digits no longer open it');
props.LOG_PIN = 'Ω-0451'; assert.ok(post({ action: 'logunlock', pin: 'OMEGA-0451' }).ok, 'and the right one resets the count'); assert.ok(!cache.logfail);
for (const bad of ['SIGMA-1234', 'OMEGA-123', 'OMEGA 12345', 'OMEGA']) {
  props.LOG_PIN = bad;
  assert.ok(!ping().capabilities.includes('logpin'), bad + ' is not a valid code');
  assert.ok(ctx.logStatus_().includes('LOG_PIN NOT VALID'), bad);
}
props.LOG_PIN = 'DELTA-2024';
// Each lockout in a row lasts twice as long; a right answer clears the record.
const lockFor = () => { let x; for (let i = 0; i < 5; i++) x = post({ action: 'logunlock', pin: 'BETA-0000' }); return x; };
let t0 = Date.now(), L = lockFor();
assert.strictEqual(L.error, 'log_locked'); assert.ok(Math.abs(L.until - t0 - 900000) < 5000, 'first lock 15 minutes');
assert.strictEqual(post({ action: 'logunlock', pin: 'DELTA-2024' }).error, 'log_locked', 'even the right code waits');
props.LOG_LOCK_UNTIL = '1'; t0 = Date.now(); L = lockFor();
assert.ok(Math.abs(L.until - t0 - 1800000) < 5000, 'second lock 30 minutes');
props.LOG_LOCK_UNTIL = '1'; props.LOG_STRIKES = '9'; t0 = Date.now(); L = lockFor();
assert.ok(Math.abs(L.until - t0 - 86400000) < 5000, 'never more than a day');
props.LOG_LOCK_UNTIL = '1';
assert.ok(post({ action: 'logunlock', pin: 'DELTA-2024' }).ok);
assert.ok(!props.LOG_STRIKES && !props.LOG_LOCK_UNTIL, 'record cleared');
assert.deepStrictEqual(nx.refused().map(c => c.method + ' ' + c.refused.slice(0, 3)), ['patch 429'], 'Notion refused only the one slow-down the test asked for');
console.log('bridge log: all checks passed');
