// Backups (2.33; checked from 2.50): every key the app keeps on the iPad is either in the backup (BK_KEYS) or left out on
// purpose, with the reason here, so a new setting can't be lost on restore and nothing private slips in. The Captain's
// Log draft is never in a backup. The "saves still on their way" warning counts every write queue.
const fs = require('fs'), path = require('path'), assert = require('assert');
const s = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const all = [...new Set(s.match(/"tos\.[a-z0-9]+\.v\d"/g).map(x => x.slice(1, -1)))].sort();
const bk = new Set(s.match(/var BK_KEYS = \[([\s\S]*?)\];/)[1].match(/"tos\.[a-z0-9]+\.v\d"/g).map(x => x.slice(1, -1)));
const LEFT_OUT = {
  // copies of what the bridge, Notion, YNAB, the relay or the web give back on the next sync
  cache: ['tos.cache.v1', 'tos.dates.v1', 'tos.done.v1', 'tos.tasks.v1', 'tos.weeks.v1', 'tos.rlog.v1', 'tos.habits.v1', 'tos.library.v1', 'tos.tarot.v1', 'tos.apiary.v1',
    'tos.inbox.v1', 'tos.ledger.v1', 'tos.hols.v1', 'tos.schema.v1', 'tos.astro.v1', 'tos.brief.v1', 'tos.sci.v1', 'tos.scilog.v1', 'tos.wx.v1',
    'tos.nasart.v1', 'tos.naslen.v1', 'tos.nastags.v1', 'tos.hololen.v1', 'tos.holoadlen.v1'],
  // writes on their way: they belong to this iPad and go out with their capture ids; a restore elsewhere must not resend them
  queue: ['tos.queue.v1', 'tos.habitq.v1', 'tos.tarotq.v1', 'tos.apiaryq.v1', 'tos.inboxq.v1', 'tos.sciq.v1'],
  // unsaved writing: private, and finished or discarded on this iPad (the Log draft never leaves it)
  draft: ['tos.ldraft.v1', 'tos.sndraft.v1', 'tos.rdraft.v1', 'tos.tarotdraft.v1', 'tos.apdraft.v1'],
  // this iPad's own running state
  local: ['tos.sync.v1', 'tos.netlog.v1', 'tos.visits.v1', 'tos.bkat.v1', 'tos.ask.v1', 'tos.aispend.v1', 'tos.voicespend.v1'],
  // retired, no longer read
  retired: ['tos.topgap.v1'],
};
const out = new Set([].concat(...Object.values(LEFT_OUT)));
const unknown = all.filter(k => !bk.has(k) && !out.has(k));
assert.deepStrictEqual(unknown, [], 'a key that is neither backed up nor left out on purpose; decide which: ' + unknown.join(', '));
const both = [...bk].filter(k => out.has(k));
assert.deepStrictEqual(both, [], 'listed as backed up and as left out: ' + both.join(', '));
const gone = [...out].filter(k => !all.includes(k));
assert.deepStrictEqual(gone, [], 'no longer in the app; drop from this list: ' + gone.join(', '));
assert.ok(!bk.has('tos.ldraft.v1'), 'the Captain\'s Log draft is never backed up');
const pend = s.match(/function bkPending\(\) \{[\s\S]*?\[([^\]]*)\]\.forEach/)[1];
LEFT_OUT.queue.forEach(k => assert.ok(pend.includes('"' + k + '"'), 'the pending-saves warning counts ' + k));
console.log('backup keys: ' + bk.size + ' backed up, ' + out.size + ' left out on purpose');
