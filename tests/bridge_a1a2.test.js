// A WRITE NEVER LANDS TWICE, AND A FINISH DATE THAT HOLDS (bridge 1.51; A1 and A2 of the 15 Nov diagnostic).
// A1: a task sent again after Google's 6-hour cache has let go (a reply lost as the iPad slept, retried next morning)
// is answered with the first page, not made twice: the bridge keeps cid -> page id for 30 days in its own Script
// Properties, one entry per day, and drops days older than that. A2: the Master Task List's Completed column (Date):
// setup adds it once; without it, finished tasks go by their last edit as before; with it, the first read writes a
// finished task's last edit in, so a later edit no longer moves it; marking Done sets it, leaving Done clears it.
// All titles are sample text.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {} }), nx = br.nx, props = br.props, ctx = br.ctx;
nx.drop('tasks', 'Completed');   // the Master Task List as it was before setup added the column
const iso = ms => new Date(ms).toISOString();
const DAY = 86400000, NOW = Date.now();
const post = br.post;
const finishedRead = () => post({ action: 'year', from: iso(NOW - 30 * DAY), to: iso(NOW + DAY) });   // the finished tasks, as ASTROMETRICS reads them (1.53: the done read is gone)
const forget = () => { Object.keys(br.cache).forEach(k => { delete br.cache[k]; }); };   // Google's cache let go: 6 hours passed, or more
const tasksN = () => nx.rows('tasks').length;
const writesTo = (id, from) => nx.calls.slice(from).filter(c => c.method === 'patch' && c.path === '/pages/' + id);

// ---- A1: the same task sent again after the cache let go is the same page
let r = post({ action: 'addtask', task: { cid: 'cid-sample-0001', title: 'Sample task one' } });
assert.ok(r.ok, JSON.stringify(r));
const first = r.task.id;
forget();
r = post({ action: 'addtask', task: { cid: 'cid-sample-0001', title: 'Sample task one' } });
assert.ok(r.ok && r.duplicate === true, JSON.stringify(r));
assert.strictEqual(r.task.id, first, 'the first page');
assert.strictEqual(tasksN(), 1, 'made once');
const today = new Date().toISOString().slice(0, 10);
assert.ok(JSON.parse(props['cids:' + today])['task:cid-sample-0001'] === first, 'kept as cid -> page id only');
assert.ok(!/Sample task/.test(props['cids:' + today]), 'nothing about the task itself');
// days older than 30 go as new ones are written; a new cid is a new page
props['cids:2020-01-01'] = JSON.stringify({ 'task:old-0000-0000': 'x' });
r = post({ action: 'addtask', task: { cid: 'cid-sample-0002', title: 'Sample task two' } });
assert.ok(r.ok && !r.duplicate && tasksN() === 2);
const p2 = r.task.id;
assert.strictEqual(props['cids:2020-01-01'], undefined, 'a day older than 30 is dropped');
// a busy day carries on in a second entry
props['cids:' + today] = JSON.stringify(Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['task:filler-' + i, 'p'.repeat(32)])));
r = post({ action: 'addtask', task: { cid: 'cid-sample-0003', title: 'Sample task three' } });
assert.ok(JSON.parse(props['cids:' + today + ':1'])['task:cid-sample-0003'], 'a second entry for the day');
forget();
r = post({ action: 'addtask', task: { cid: 'cid-sample-0003', title: 'Sample task three' } });
assert.ok(r.duplicate && tasksN() === 3, 'found in the second entry');

// ---- A2 without the column: finished goes by the last edit, as before
const p1 = first;
nx.edit(p1, { Status: '✅ Done' }, { last_edited_time: iso(NOW - 10 * DAY) });
forget();
let c0 = nx.calls.length;
let d = finishedRead();
assert.ok(d.ok, JSON.stringify(d));
assert.deepStrictEqual(d.done.map(x => x.at), [nx.row(p1).last_edited_time]);
assert.ok(!writesTo(p1, c0).length && !('Completed' in nx.row(p1)), 'nothing written without the column');

// ---- setup adds Completed once
assert.ok(/^ADDED Completed/.test(ctx.completedColumn_()));
assert.strictEqual(nx.columns('tasks').Completed, 'date');
assert.ok(/^OK/.test(ctx.completedColumn_()), 'the second time it is already there');
assert.strictEqual(nx.calls.filter(c => c.method === 'patch' && c.path === '/data_sources/' + nx.ds('tasks')).length, 1);

// ---- the first read writes the finish in; a later edit doesn't move it
forget();
const finished = nx.row(p1).last_edited_time;
c0 = nx.calls.length;
d = finishedRead();
assert.deepStrictEqual(d.done.map(x => x.at), [finished]);
assert.strictEqual(nx.row(p1).Completed, finished, 'its last edit, written in once');
assert.strictEqual(writesTo(p1, c0).length, 1);
nx.edit(p1, { 'Life Area': 'Sample area' }, { last_edited_time: iso(Date.now()) });   // an edit in Notion, today
forget();
d = finishedRead();
assert.deepStrictEqual(d.done.map(x => x.at), [finished], 'still the day it was finished');
const yr = post({ action: 'year', from: iso(NOW - 5 * DAY), to: iso(NOW + DAY) });
assert.ok(yr.ok && !yr.done.length, 'not counted as finished this week: ' + JSON.stringify(yr.done));

// ---- marking Done sets it; leaving Done clears it
r = post({ action: 'status', id: p2, status: '✅ Done' });
assert.ok(r.ok, JSON.stringify(r));
assert.ok(Math.abs(Date.parse(nx.row(p2).Completed) - Date.now()) < 60000, 'now');
r = post({ action: 'status', id: p2, status: '⬜ To Do' });
assert.strictEqual(nx.row(p2).Completed, null, 'cleared');

assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('A WRITE NEVER LANDS TWICE, AND A FINISH DATE THAT HOLDS: 30-day record, pruned, split; Completed added, filled, kept, set, cleared: ok');
