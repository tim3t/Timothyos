// Weekly Notion export (bridge 1.41): Drive through drive.file only (the REST API with the script's own token), setup's
// check and weekly trigger, EXPORT NOW (never runs inside the app's request), runs that stop at the time budget and resume
// exactly (no page twice, none missed) with parts merged, JSON (every field, page text and blocks) and CSV (BOM, quoting),
// unchanged page text reused next week, Notion asking to slow down, a database not shared, Drive full, the newest 12 kept,
// and Notion only ever read. Invented data only.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test' }, cache = {};
let clock = Date.parse('2026-11-08T09:00:00Z');
const tick = ms => { clock += ms; };

// ---- simulated Notion: Tasks (3 pages) and Captain's Log (12 pages, 5 per query page, with text); the rest not shared
const LOGN = 12;
const page = (ds, i, extra) => Object.assign({ id: ds + '-p' + i, url: 'https://www.notion.so/' + ds + i, created_time: '2026-10-01T10:00:00.000Z', last_edited_time: '2026-10-02T10:00:00.000Z',
  properties: ds === 'log' ? { Name: { type: 'title', title: [{ plain_text: 'Sample entry ' + i }] }, Date: { type: 'date', date: { start: '2026-10-' + String(i + 1).padStart(2, '0') } }, Source: { type: 'select', select: { name: 'Typed' } } }
    : { Task: { type: 'title', title: [{ plain_text: 'Sample task "' + i + '", with a comma' }] }, Status: { type: 'select', select: { name: '⬜ To Do' } }, Tags: { type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] },
      Done: { type: 'checkbox', checkbox: i === 0 }, Hours: { type: 'number', number: i ? i * 1.5 : null }, Link: { type: 'relation', relation: [{ id: 'rel-1' }] } } }, extra || {});
let logPages = Array.from({ length: LOGN }, (_, i) => page('log', i));
const taskPages = [0, 1, 2].map(i => page('tasks', i));
let notionCalls = [], blockReads = [], busyOnce = 0;
function notion(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase();
  notionCalls.push(m + ' ' + path); tick(1000);
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (busyOnce && m === 'get' && path.startsWith('/blocks/')) { busyOnce--; return res(429, { message: 'slow down' }); }
  if (m === 'get' && path.startsWith('/databases/')) {
    const id = path.split('/')[2];
    if (id === ctx.CONFIG.NOTION_TASKS_DATABASE) return res(200, { data_sources: [{ id: 'tasks' }] });
    if (id === ctx.CONFIG.NOTION_LOG_DATABASE) return res(200, { data_sources: [{ id: 'log' }] });
    return res(404, { message: 'not shared' });
  }
  if (m === 'post' && /^\/data_sources\/(tasks|log)\/query$/.test(path)) {
    const ds = path.split('/')[2], body = JSON.parse(opts.payload), all = ds === 'log' ? logPages : taskPages;
    const at = body.start_cursor ? Number(body.start_cursor.slice(1)) : 0, n = ds === 'log' ? 5 : 100;
    return res(200, { results: all.slice(at, at + n), has_more: at + n < all.length, next_cursor: at + n < all.length ? 'c' + (at + n) : null });
  }
  let mb = /^\/blocks\/([^/]+)\/children/.exec(path);
  if (m === 'get' && mb) {
    const id = mb[1]; blockReads.push(id);
    if (id.endsWith('-kids')) return res(200, { results: [{ id: 'x', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'nested line' }] }, has_children: false }], has_more: false });
    if (id.startsWith('tasks')) return res(200, { results: [], has_more: false });
    const p = logPages.find(x => x.id === id);
    return res(200, { results: [
      { id: id + '-h', type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Heading ' + id }] }, has_children: false },
      { id: id + '-kids', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'point' }] }, has_children: true },
      { id: id + '-t', type: 'to_do', to_do: { rich_text: [{ plain_text: 'done thing' }], checked: true }, has_children: false },
      { id: id + '-p', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body of ' + id + (p && p.v ? ' v' + p.v : '') }] }, has_children: false }], has_more: false });
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}

// ---- simulated Drive (only what the bridge made exists for it, as with drive.file)
let files = {}, nid = 0, driveMode = 'ok', driveCalls = [];
const fid = () => 'f' + (++nid);
function drive(url, opts) {
  const m = (opts.method || 'get').toLowerCase(); driveCalls.push(m + ' ' + url.split('?')[0]); tick(200);
  assert.strictEqual(opts.headers.Authorization, 'Bearer oauth-token', 'the script\'s own token');
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
  if (driveMode === 'scope') return res(403, { error: { message: 'Request had insufficient authentication scopes.' } });
  if (driveMode === 'apioff') return res(403, { error: { code: 403, message: 'Google Drive API has not been used in project 123 before or it is disabled. Enable it by visiting the console.', status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } });
  if (driveMode === 'full' && m === 'post' && url.includes('/upload/')) return res(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } });
  if (m === 'post' && url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
    const raw = Buffer.from(opts.payload).toString('utf8'), b = opts.contentType.split('boundary=')[1];
    const parts = raw.split('--' + b).slice(1, 3).map(x => x.replace(/^\r\n/, '').replace(/\r\n$/, '')), meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
    const id = fid(); files[id] = { name: meta.name, parents: meta.parents, mime: meta.mimeType, body: parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'), trashed: false };
    return res(200, { id, name: meta.name, size: String(Buffer.byteLength(files[id].body)) });
  }
  if (m === 'post' && url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
    const meta = JSON.parse(opts.payload), id = fid(); files[id] = { name: meta.name, parents: meta.parents || ['root'], mime: meta.mimeType, trashed: false }; return res(200, { id, name: meta.name });
  }
  const mid = /drive\/v3\/files\/([^?]+)\?(.*)$/.exec(url);
  if (mid) {
    const f = files[decodeURIComponent(mid[1])]; if (!f) return res(404, { error: { message: 'File not found' } });
    if (m === 'get' && mid[2] === 'alt=media') return res(200, f.body);
    if (m === 'get') return res(200, { id: mid[1], trashed: f.trashed });
    if (m === 'patch') { Object.assign(f, JSON.parse(opts.payload)); return res(200, { id: mid[1] }); }
  }
  if (m === 'get' && url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
    const q = decodeURIComponent(/q=([^&]+)/.exec(url)[1]), parent = /'([^']+)' in parents/.exec(q)[1];
    return res(200, { files: Object.keys(files).filter(id => files[id].parents.includes(parent) && !files[id].trashed && (!/folder/.test(q) || /folder/.test(files[id].mime))).map(id => ({ id, name: files[id].name })) });
  }
  return res(400, 'unexpected ' + m + ' ' + url);
}

// ---- Apps Script
let triggers = [];
const trig = h => { const t = { h, getHandlerFunction: () => h }; return t; };
const ctx = {
  console: { log: (...a) => logLines.push(a.join(' ')) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { assert.ok(String(v).length < 9000, k + ' fits a Script Property'); props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }), getUserProperties: () => ({ getProperty: () => null }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, newBlob: s => ({ getBytes: () => Buffer.from(s, 'utf8') }),
    formatDate: (d, tz, f) => f === 'yyyy-MM-dd HH.mm' ? new Date(d).toISOString().slice(0, 16).replace('T', ' ').replace(':', '.') : new Date(d).toISOString().slice(0, 10), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: (u, o) => u.startsWith('https://api.notion.com') ? notion(u, o) : u.startsWith('https://www.googleapis.com') ? drive(u, o) : { getResponseCode: () => 404, getContentText: () => '' } },
  ScriptApp: { getOAuthToken: () => 'oauth-token', WeekDay: { SUNDAY: 'SUNDAY' }, getProjectTriggers: () => triggers.slice(), deleteTrigger: t => { triggers = triggers.filter(x => x !== t); },
    newTrigger: h => ({ timeBased: () => { const s = { h }; const c = { after: ms => { s.after = ms; return c; }, onWeekDay: d => { s.day = d; return c; }, atHour: n => { s.hour = n; return c; }, create: () => { const t = trig(h); Object.assign(t, s); triggers.push(t); return t; } }; return c; } }) },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
let logLines = [];
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext('Date.now = function () { return __clock(); }', Object.assign(ctx, { __clock: () => clock }));
ctx.EXPORT.BUDGET_MS = 9000;   // about nine Notion reads a run here, so the log takes several runs
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
const inFolder = (folder, name) => Object.keys(files).map(id => Object.assign({ id }, files[id])).filter(f => f.parents.includes(folder) && !f.trashed && (!name || f.name === name));
const runTriggers = () => { let n = 0; while (triggers.some(t => t.h === 'exportContinue')) { assert.ok(++n < 40, 'finishes'); tick(60000); ctx.exportContinue(); } return n; };

// ---- 1.41.1: the Drive API switched off (Google says PERMISSION_DENIED) is told apart, with Google's own words
driveMode = 'apioff'; logLines = [];
ctx.setup();
const offLine = logLines.find(l => l.startsWith('Weekly Notion export:'));
console.log(offLine);
assert.ok(/NEEDS THE DRIVE API: in the script editor, Services \(\+ beside Services\) → Drive API → Add, then run setup again \(Google said: Google Drive API has not been used/.test(offLine), offLine);
assert.strictEqual(triggers.length, 0);
// ---- setup without the drive.file permission: says what to do, installs nothing
driveMode = 'scope'; logLines = [];
ctx.setup(); const key = props.ACCESS_KEY;
const exLine = logLines.find(l => l.startsWith('Weekly Notion export:'));
console.log(exLine);
assert.ok(/NEEDS DRIVE ACCESS: add the oauthScopes block.*\(Google said: Request had insufficient authentication scopes\.\)/.test(exLine), exLine); assert.strictEqual(triggers.length, 0);
assert.strictEqual(post({ key, action: 'exportnow' }).error, 'drive_scope', 'EXPORT NOW names the missing permission');
assert.strictEqual(post({ key, action: 'ping' }).export.last.error, 'drive_scope');

// ---- with it: one root folder, one weekly trigger (setup again adds none)
driveMode = 'ok'; logLines = []; ctx.setup(); ctx.setup();
console.log(logLines.find(l => l.startsWith('Weekly Notion export:')));
assert.deepStrictEqual(triggers.map(t => [t.h, t.day, t.hour]), [['exportWeekly', 'SUNDAY', 3]]);
const root = props.EXPORT_ROOT; assert.strictEqual(files[root].name, 'TimothyOS Notion export'); assert.deepStrictEqual(files[root].parents, ['root']);
let ping = post({ key, action: 'ping' });
assert.ok(ping.capabilities.includes('export') && ping.export.weekly === true && ping.export.keep === 12);

// ---- EXPORT NOW: answers at once, a trigger does the work
notionCalls = [];
const now1 = post({ key, action: 'exportnow' });
assert.ok(now1.ok && now1.export.running && notionCalls.length === 0, 'nothing read inside the app\'s request');
assert.deepStrictEqual(triggers.filter(t => t.h === 'exportContinue').map(t => t.after), [1000]);
assert.ok(post({ key, action: 'exportnow' }).export.running, 'a second tap joins the same run');
assert.strictEqual(triggers.filter(t => t.h === 'exportContinue').length, 1);
busyOnce = 1;   // Notion asks to slow down once along the way
const runs = runTriggers();
const last = JSON.parse(props.EXPORT_LAST), folder = last.folder;
console.log('first export:', runs, 'runs ·', JSON.stringify({ pages: last.pages, dbs: last.dbs, of: last.of, failed: last.failed.length, runs: last.runs, name: last.name }));
assert.ok(runs >= 3, 'several runs: the budget is honoured');
assert.ok(last.ok && last.pages === LOGN + 3 && last.dbs === 2 && last.of === 17 && last.failed.length === 15 && /not shared|notion_not_shared/.test(last.failed[0]));
assert.ok(!props.EXPORT_JOB && triggers.filter(t => t.h === 'exportContinue').length === 0, 'job and its trigger cleared');
assert.ok(notionCalls.every(c => /^get \/(databases|blocks)\/|^post \/data_sources\/[^/]+\/query$/.test(c)), 'Notion only read: ' + notionCalls.filter(c => !/^get \/(databases|blocks)\/|query$/.test(c)).join(', '));
const names = inFolder(folder).map(f => f.name).sort();
assert.deepStrictEqual(names, ["Captain's Log.csv", "Captain's Log.json", 'Master Task List.csv', 'Master Task List.json', '_export.json'], 'parts tidied away: ' + names);
const lj = JSON.parse(inFolder(folder, "Captain's Log.json")[0].body);
assert.strictEqual(lj.count, LOGN); assert.deepStrictEqual(lj.pages.map(p => p.id), logPages.map(p => p.id), 'every page once, in order');
const p3 = lj.pages[3];
assert.strictEqual(p3.values.Name, 'Sample entry 3'); assert.strictEqual(p3.properties.Date.date.start, '2026-10-04', 'raw properties kept');
assert.strictEqual(p3.text, '## Heading log-p3\n- point\n  nested line\n[x] done thing\nBody of log-p3', 'page text readable, nested lines indented');
assert.strictEqual(p3.blocks[1].children[0].paragraph.rich_text[0].plain_text, 'nested line', 'blocks kept for a restore');
const csv = inFolder(folder, 'Master Task List.csv')[0].body;
console.log('CSV:', csv.split('\r\n').slice(0, 2).join(' / '));
assert.ok(csv.startsWith('﻿"Notion ID","Notion link","Created","Last edited","Task","Status","Tags","Done","Hours","Link","Page text"'));
assert.ok(csv.includes('"Sample task ""1"", with a comma","⬜ To Do","a; b","false","1.5","rel-1",""'), 'quoted, flattened');
assert.strictEqual(files[folder].parents[0], root); assert.ok(/^\d{4}-\d\d-\d\d \d\d\.\d\d$/.test(files[folder].name), 'a dated folder');
ping = post({ key, action: 'ping' });
assert.ok(ping.export.last.ok && ping.export.running === null && !('files' in ping.export.last), 'status is small');

// ---- next week: unchanged text reused, only the edited page read again
logPages[5] = page('log', 5, { last_edited_time: '2026-11-10T10:00:00.000Z', v: 2 });
blockReads = []; tick(7 * 864e5); triggers = triggers.filter(t => t.h !== 'exportContinue');
ctx.exportWeekly(); runTriggers();
const l2 = JSON.parse(props.EXPORT_LAST);
assert.ok(l2.ok && l2.folder !== folder);
assert.deepStrictEqual(blockReads.filter(b => b.startsWith('log')), ['log-p5', 'log-p5-kids'], 'only the edited page read again: ' + blockReads.join(','));
const lj2 = JSON.parse(inFolder(l2.folder, "Captain's Log.json")[0].body);
assert.ok(lj2.pages[5].text.endsWith('Body of log-p5 v2') && lj2.pages[4].text === lj.pages[4].text);

// ---- a run in progress isn't started twice; the weekly trigger leaves it alone
post({ key, action: 'exportnow' }); const j1 = props.EXPORT_JOB;
ctx.exportWeekly(); ctx.exportWeekly();
assert.ok(JSON.parse(props.EXPORT_JOB).at === JSON.parse(j1).at);
runTriggers();

// ---- the newest 12 kept: older dated folders go to the trash; anything else in the root is left
const keepMe = 'keep-' + fid(); files[keepMe] = { name: 'Notes', parents: [root], mime: 'application/vnd.google-apps.folder', trashed: false };
for (let i = 0; i < 12; i++) { const id = fid(); files[id] = { name: '2026-0' + (1 + (i % 9)) + '-0' + (1 + Math.floor(i / 9)) + ' 03.00', parents: [root], mime: 'application/vnd.google-apps.folder', trashed: false }; }
post({ key, action: 'exportnow' }); runTriggers();
const dated = inFolder(root).filter(f => /^\d{4}-/.test(f.name)).map(f => f.name).sort();
console.log('kept:', dated.length, dated[0], '…', dated[dated.length - 1]);
assert.strictEqual(dated.length, 12); assert.strictEqual(dated[dated.length - 1], JSON.parse(props.EXPORT_LAST).name, 'the newest kept');
assert.ok(!dated.includes('2026-01-01 03.00'), 'the oldest gone');
assert.ok(!files[keepMe].trashed, 'a folder that is not an export is never touched');

// ---- Drive full partway: the run stops, says so, and its half-made folder goes
driveMode = 'full'; post({ key, action: 'exportnow' }); runTriggers();
const lf = JSON.parse(props.EXPORT_LAST);
assert.ok(lf.ok === false && lf.error === 'drive_full' && !props.EXPORT_JOB, JSON.stringify(lf));
assert.ok(post({ key, action: 'ping' }).export.last.error === 'drive_full');
driveMode = 'ok';

// ---- a stalled run (its trigger lost) is woken by EXPORT NOW, not started again
post({ key, action: 'exportnow' }); triggers = triggers.filter(t => t.h !== 'exportContinue');
const at = JSON.parse(props.EXPORT_JOB).at; tick(15 * 60000);
assert.ok(post({ key, action: 'ping' }).export.running.stalled);
post({ key, action: 'exportnow' });
assert.strictEqual(JSON.parse(props.EXPORT_JOB).at, at); runTriggers();
assert.ok(JSON.parse(props.EXPORT_LAST).ok);
console.log('ALL EXPORT CHECKS PASSED');
