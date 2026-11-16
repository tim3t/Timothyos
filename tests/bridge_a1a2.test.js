// A WRITE NEVER LANDS TWICE, AND A FINISH DATE THAT HOLDS (bridge 1.51; A1 and A2 of the 15 Nov diagnostic).
// A1: a task sent again after Google's 6-hour cache has let go (a reply lost as the iPad slept, retried next morning)
// is answered with the first page, not made twice: the bridge keeps cid -> page id for 30 days in its own Script
// Properties, one entry per day, and drops days older than that. A2: the Master Task List's Completed column (Date):
// setup adds it once; without it, finished tasks go by their last edit as before; with it, the first read writes a
// finished task's last edit in, so a later edit no longer moves it; marking Done sets it, leaving Done clears it.
// All titles are sample text.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; let cache = {};
const TDB = '6c4a440d571e49e0b4076c18d5712c1f', TDS = 'ds-tasks';
const cols = { Task: { type: 'title' }, Status: { type: 'select' }, Priority: { type: 'select' }, 'Life Area': { type: 'select', select: { options: [] } }, 'Due Date': { type: 'date' }, 'Focus Date': { type: 'date' } };
const pages = []; let n = 0, patchedCols = 0;
const iso = ms => new Date(ms).toISOString();
const DAY = 86400000, NOW = Date.now();
const val = v => v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : v;
function match(pg, f) {
  if (!f) return true;
  if (f.and) return f.and.every(g => match(pg, g));
  if (f.or) return f.or.some(g => match(pg, g));
  if (f.timestamp === 'last_edited_time') { const t = pg.last_edited_time, c = f.last_edited_time; return (!c.on_or_after || t >= c.on_or_after) && (!c.before || t < c.before); }
  const p = pg.properties[f.property];
  if (f.select) { const name = p && p.select && p.select.name; return f.select.equals ? name === f.select.equals : f.select.does_not_equal ? name !== f.select.does_not_equal : true; }
  if (f.date) {
    const d = p && p.date && p.date.start;
    if (f.date.is_empty) return !d;
    if (!d) return false;
    if (f.date.on_or_after && d < f.date.on_or_after) return false;
    if (f.date.before && d >= f.date.before) return false;
    if (f.date.equals && d.slice(0, 10) !== f.date.equals) return false;
    return true;
  }
  throw new Error('filter ' + JSON.stringify(f));
}
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + TDB) return res(200, { data_sources: [{ id: TDS }] });
  if (path === '/data_sources/' + TDS && m === 'get') return res(200, { title: [{ plain_text: 'Master Task List' }], properties: cols });
  if (path === '/data_sources/' + TDS && m === 'patch') { Object.keys(body.properties).forEach(k => { cols[k] = { type: Object.keys(body.properties[k])[0] }; }); patchedCols++; return res(200, { properties: cols }); }
  if (path === '/data_sources/' + TDS + '/query' && m === 'post') return res(200, { results: pages.filter(p => !p.in_trash && match(p, body.filter)), has_more: false });
  if (m === 'post' && path === '/pages') {
    const pr = {}; Object.keys(body.properties).forEach(k => { pr[k] = val(body.properties[k]); });
    const pg = { id: 'p' + String(++n).padStart(31, '0'), url: 'https://notion.so/x', parent: { type: 'data_source_id', data_source_id: body.parent.data_source_id }, created_time: iso(NOW), last_edited_time: iso(NOW), properties: pr };
    pages.push(pg); return res(200, pg);
  }
  const mm = path.match(/^\/pages\/([^/]+)$/);
  if (mm) {
    const pg = pages.find(p => p.id === mm[1]);
    if (!pg) return res(404, { message: 'not found' });
    if (m === 'get') return res(200, pg);
    if (m === 'patch') { Object.keys(body.properties || {}).forEach(k => { pg.properties[k] = val(body.properties[k]); }); pg.last_edited_time = iso(Date.now()); return res(200, pg); }
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, getProperties: () => Object.assign({}, props), setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: (d, tz, f) => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: mock },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY;
const post = b => { const o = ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }); if (!o || o.text === undefined) throw new Error('no reply to ' + b.action + ': ' + JSON.stringify(o)); return JSON.parse(o.text); };
const forget = () => { cache = {}; };   // Google's cache let go: 6 hours passed, or more

// ---- A1: the same task sent again after the cache let go is the same page
let r = post({ action: 'addtask', task: { cid: 'cid-sample-0001', title: 'Sample task one' } });
assert.ok(r.ok, JSON.stringify(r));
const first = r.task.id;
forget();
r = post({ action: 'addtask', task: { cid: 'cid-sample-0001', title: 'Sample task one' } });
assert.ok(r.ok && r.duplicate === true, JSON.stringify(r));
assert.strictEqual(r.task.id, first, 'the first page');
assert.strictEqual(pages.length, 1, 'made once');
const today = new Date().toISOString().slice(0, 10);
assert.ok(JSON.parse(props['cids:' + today])['task:cid-sample-0001'] === first, 'kept as cid -> page id only');
assert.ok(!/Sample task/.test(props['cids:' + today]), 'nothing about the task itself');
// days older than 30 go as new ones are written; a new cid is a new page
props['cids:2020-01-01'] = JSON.stringify({ 'task:old-0000-0000': 'x' });
r = post({ action: 'addtask', task: { cid: 'cid-sample-0002', title: 'Sample task two' } });
assert.ok(r.ok && !r.duplicate && pages.length === 2);
assert.strictEqual(props['cids:2020-01-01'], undefined, 'a day older than 30 is dropped');
// a busy day carries on in a second entry
props['cids:' + today] = JSON.stringify(Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['task:filler-' + i, 'p'.repeat(32)])));
r = post({ action: 'addtask', task: { cid: 'cid-sample-0003', title: 'Sample task three' } });
assert.ok(JSON.parse(props['cids:' + today + ':1'])['task:cid-sample-0003'], 'a second entry for the day');
forget();
r = post({ action: 'addtask', task: { cid: 'cid-sample-0003', title: 'Sample task three' } });
assert.ok(r.duplicate && pages.length === 3, 'found in the second entry');

// ---- A2 without the column: finished goes by the last edit, as before
const p1 = pages[0];
p1.properties.Status = { select: { name: '✅ Done' } }; p1.last_edited_time = iso(NOW - 10 * DAY);
forget();
let d = post({ action: 'done', days: 30 });
assert.ok(d.ok, JSON.stringify(d));
assert.deepStrictEqual(d.done.map(x => x.at), [p1.last_edited_time]);
assert.strictEqual(p1.properties.Completed, undefined, 'nothing written without the column');

// ---- setup adds Completed once
assert.ok(/^ADDED Completed/.test(ctx.completedColumn_()));
assert.strictEqual(cols.Completed.type, 'date');
assert.ok(/^OK/.test(ctx.completedColumn_()), 'the second time it is already there');
assert.strictEqual(patchedCols, 1);

// ---- the first read writes the finish in; a later edit doesn't move it
forget();
const finished = p1.last_edited_time;
d = post({ action: 'done', days: 30 });
assert.deepStrictEqual(d.done.map(x => x.at), [finished]);
assert.strictEqual(p1.properties.Completed.date.start, finished, 'its last edit, written in once');
p1.properties['Life Area'] = { select: { name: 'Sample area' } }; p1.last_edited_time = iso(Date.now());   // an edit in Notion, today
forget();
d = post({ action: 'done', days: 30 });
assert.deepStrictEqual(d.done.map(x => x.at), [finished], 'still the day it was finished');
const yr = post({ action: 'year', from: iso(NOW - 5 * DAY), to: iso(NOW + DAY) });
assert.ok(yr.ok && !yr.done.length, 'not counted as finished this week: ' + JSON.stringify(yr.done));

// ---- marking Done sets it; leaving Done clears it
const p2 = pages[1];
r = post({ action: 'status', id: p2.id, status: '✅ Done' });
assert.ok(r.ok, JSON.stringify(r));
assert.ok(Math.abs(Date.parse(p2.properties.Completed.date.start) - Date.now()) < 60000, 'now');
r = post({ action: 'status', id: p2.id, status: '⬜ To Do' });
assert.strictEqual(p2.properties.Completed.date, null, 'cleared');

console.log('A WRITE NEVER LANDS TWICE, AND A FINISH DATE THAT HOLDS: 30-day record, pruned, split; Completed added, filled, kept, set, cleared: ok');
