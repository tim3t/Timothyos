// Captain's Log: PIN gate + lockout, dates, day read, save (create, edit in place,
// paragraphs removed), import (skips days already written), Notion-only content
// refused for editing, nothing leaks into Ask. Sample text is invented.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const DB = '4c395160e1a84702a3a6861c20ddf748', DS = 'ds-log';
const pages = [], blocks = {}; let n = 0, calls = [], busyOnce = false;
const id = p => p + String(++n).padStart(30, '0');
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  calls.push(m + ' ' + path.split('?')[0]);
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (busyOnce && m === 'patch') { busyOnce = false; return res(429, { message: 'slow down' }); }
  const blk = (p) => { const t = p.type; return { id: id('b'), type: t, has_children: false, [t]: { rich_text: (p[t].rich_text || []).map(r => ({ plain_text: r.text.content })) } }; };
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    const f = body.filter; let r = pages.slice();
    if (f && f.property === 'Date') r = r.filter(p => p.properties.Date.date.start === f.date.equals);
    if (f && f.and) r = r.filter(p => { const d = p.properties.Date.date.start; return d >= f.and[0].date.on_or_after && d <= f.and[1].date.on_or_before; });
    return res(200, { results: r, has_more: false });
  }
  if (m === 'post' && path === '/pages') {
    assert.strictEqual(body.parent.data_source_id, DS);
    const pg = { id: id('p'), url: 'https://notion.so/x', last_edited_time: '2026-10-07T23:00:00.000Z', properties: { Name: { title: [{ plain_text: body.properties.Name.title[0].text.content }] }, Date: body.properties.Date, Source: body.properties.Source } };
    pages.push(pg); blocks[pg.id] = (body.children || []).map(blk); return res(200, pg);
  }
  let mm = path.match(/^\/blocks\/([^/?]+)\/children/);
  if (mm && m === 'get') return res(200, { results: blocks[mm[1]] || [], has_more: false });
  if (mm && m === 'patch') { body.children.forEach(c => blocks[mm[1]].push(blk(c))); return res(200, {}); }
  mm = path.match(/^\/blocks\/([^/?]+)$/);
  if (mm) { for (const k in blocks) { const i = blocks[k].findIndex(b => b.id === mm[1]); if (i > -1) {
    if (m === 'delete') { blocks[k].splice(i, 1); return res(200, {}); }
    if (m === 'patch') { blocks[k][i].paragraph.rich_text = body.paragraph.rich_text.map(r => ({ plain_text: r.text.content })); return res(200, {}); } } } }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: d => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: mock },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const ping = () => JSON.parse(ctx.doGet({ parameter: { key, action: 'ping' } }).text);

// No PIN set: the log refuses everything, caps say so.
assert.ok(ping().capabilities.includes('log')); assert.ok(!ping().capabilities.includes('logpin'));
assert.strictEqual(post({ action: 'logunlock', pin: '123456' }).error, 'log_pin_not_set');
props.LOG_PIN = '204816';
assert.ok(ping().capabilities.includes('logpin'));
// Access key still required.
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action: 'logunlock', pin: '204816' }) } }).text).error, 'unauthorized');
// Wrong PIN counts down, right PIN resets.
let r = post({ action: 'logunlock', pin: '111111' }); assert.strictEqual(r.error, 'bad_pin'); assert.strictEqual(r.left, 4);
r = post({ action: 'logday', pin: '20481', date: '2026-10-07' }); assert.strictEqual(r.error, 'bad_pin'); assert.strictEqual(r.left, 3);
r = post({ action: 'logunlock', pin: '204816' }); assert.ok(r.ok); assert.deepStrictEqual(r.dates, []); assert.ok(!cache.logfail);
// Five misses lock it, even for the right PIN.
for (let i = 0; i < 4; i++) post({ action: 'logunlock', pin: '000000' });
assert.strictEqual(post({ action: 'logunlock', pin: '000000' }).error, 'log_locked');
assert.strictEqual(post({ action: 'logunlock', pin: '204816' }).error, 'log_locked');
delete cache.logfail;   // the 15 minutes pass
const pin = '204816';

// Save a new day: one paragraph block per paragraph, line breaks kept, long paragraphs split into 2000-char pieces.
const long = 'x'.repeat(4500);
const T1 = 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n\n' + long + '\n';
r = post({ action: 'logsave', pin, date: '2026-10-07', text: T1 }); assert.ok(r.ok && r.created, JSON.stringify(r));
const pg = pages[0];
assert.strictEqual(pg.properties.Name.title[0].plain_text, 'Wednesday, October 7, 2026');
assert.strictEqual(pg.properties.Source.select.name, 'Bridge');
assert.strictEqual(blocks[pg.id].length, 3);
assert.strictEqual(blocks[pg.id][2].paragraph.rich_text.length, 3);
r = post({ action: 'logday', pin, date: '2026-10-07' });
assert.strictEqual(r.entry.text, 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n' + long);
assert.strictEqual(r.entry.other, false);
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-08' }).entry, null);
assert.deepStrictEqual(post({ action: 'logdates', pin }).dates, ['2026-10-07']);

// Edit: an added paragraph at the end is one append; nothing patched or removed.
calls = [];
r = post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond.\n\n' + long + '\n\nEvening: early night.' });
assert.ok(r.ok && !r.created);
assert.deepStrictEqual(calls.filter(c => /^(patch|delete) \/blocks\/b/.test(c)), [], 'unchanged paragraphs untouched');
assert.strictEqual(calls.filter(c => /^patch \/blocks\/p.*\/children$/.test(c)).length, 1);
// Edit in the middle and remove the last two: one patch, two deletes. Survives a "slow down" from Notion.
busyOnce = true;
r = post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.' });
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-07' }).entry.text, 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.');
assert.strictEqual(blocks[pg.id].length, 2);
// Saving the same text again changes nothing.
calls = []; post({ action: 'logsave', pin, date: '2026-10-07', text: 'Quiet morning.\nCoffee on the porch.\n\nWorked on the pond, then the hives.' });
assert.deepStrictEqual(calls.filter(c => /^(patch|delete)/.test(c)), []);
// Something added in Notion that the LOG can't show: the app must not overwrite it.
blocks[pg.id].push({ id: 'img1', type: 'image', has_children: false, image: {} });
assert.strictEqual(post({ action: 'logday', pin, date: '2026-10-07' }).entry.other, true);
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-10-07', text: 'Short now' }).error, 'log_edit_in_notion');
assert.ok(blocks[pg.id].some(b => b.id === 'img1'));

// Import: up to 10 a time, days already written skipped, resending adds nothing twice.
const E = [{ date: '2025-11-13', text: 'First page.\n\nSecond paragraph.' }, { date: '2025-11-14', text: 'Next day.' }, { date: '2026-10-07', text: 'Would overwrite' }, { date: '2025-11-15', text: '   ' }];
r = post({ action: 'logimport', pin, entries: E });
assert.deepStrictEqual(r.created, ['2025-11-13', '2025-11-14']); assert.deepStrictEqual(r.skipped.sort(), ['2025-11-15', '2026-10-07']);
r = post({ action: 'logimport', pin, entries: E }); assert.deepStrictEqual(r.created, []);
assert.strictEqual(pages.find(p => p.properties.Date.date.start === '2025-11-13').properties.Source.select.name, 'Diary import');
assert.strictEqual(post({ action: 'logday', pin, date: '2025-11-13' }).entry.text, 'First page.\n\nSecond paragraph.');
assert.deepStrictEqual(post({ action: 'logdates', pin }).dates, ['2025-11-13', '2025-11-14', '2026-10-07'], 'dates refresh after writes');
assert.strictEqual(post({ action: 'logimport', pin, entries: new Array(11).fill({ date: '2025-11-20', text: 'x' }) }).error, 'bad_request');
assert.strictEqual(post({ action: 'logimport', pin, entries: [{ date: '2025-02-30', text: 'x' }] }).error, 'bad_request');
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-13-01', text: 'x' }).error, 'bad_request');
assert.strictEqual(post({ action: 'logsave', pin, date: '2026-10-09', text: 'y'.repeat(120001) }).error, 'too_long');
// An empty first save creates nothing.
r = post({ action: 'logsave', pin, date: '2026-10-10', text: '  \n\n ' }); assert.ok(r.ok && !r.created); assert.ok(!pages.some(p => p.properties.Date.date.start === '2026-10-10'));

// Nothing with entry text is cached, and Ask can't reach the log.
assert.ok(!Object.keys(cache).some(k => /Quiet morning|First page/.test(cache[k])), 'no entry text in the cache');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const askPart = src.slice(src.indexOf('// ---- Ask Claude'));
assert.ok(!/log(Day|Dates|Save|Import|Blocks|Source)_/.test(askPart), 'Ask code never calls the log');
console.log('bridge log: all checks passed');
