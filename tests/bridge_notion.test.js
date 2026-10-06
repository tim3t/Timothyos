const fs = require('fs'); const vm = require('vm');
const props = {}; const cache = {};
const DS = 'ds-1111', DB = '6c4a440d571e49e0b4076c18d5712c1f', DS2 = 'ds-2222', DB2 = '8184db37aacb4d96943b2067558b92ab';
const dpages = [{ id: 'f'.repeat(32), url: 'u', parent: { type: 'data_source_id', data_source_id: 'ds-2222' }, properties: { Name: { title: [{ plain_text: 'First frost risk' }] }, Date: { date: { start: '2026-10-12', end: null } }, 'Life Area': { select: { name: '🌿 SkyGarden Farm' } }, Type: { select: { name: '⏰ Deadline' } }, 'Repeats Yearly': { checkbox: false }, Notes: { rich_text: [] } } }];
const mk = (id, title, status, priority, area, due, focus, parent = DS, edited = '2026-10-05T15:00:00.000Z') => ({ id, url: 'https://notion.so/' + id, last_edited_time: edited, parent: { type: 'data_source_id', data_source_id: parent }, properties: {
  Task: { title: [{ plain_text: title }] }, Status: { select: status ? { name: status } : null }, Priority: { select: priority ? { name: priority } : null },
  'Life Area': { select: area ? { name: area } : null }, 'Due Date': { date: due ? { start: due } : null }, 'Focus Date': { date: focus ? { start: focus } : null } } });
const pages = [
  mk('a'.repeat(32), 'Order spring bulbs', '⬜ To Do', '🔴 High', '🌿 SkyGarden Farm', '2026-10-04', '2026-10-05'),
  mk('b'.repeat(32), 'Send Q4 deck', '🔄 In Progress', '🟡 Medium', '🎯 Work & Calling', '2026-10-08', null),
  mk('c'.repeat(32), 'Renew registration', '✅ Done', '🟢 Low', '🏡 Home & Property', '2026-10-01', '2026-10-06'),
];
const foreign = mk('d'.repeat(32), 'Private journal', null, null, null, null, null, 'other-ds');
let calls = [];
function notionMock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''); const m = (opts.method || 'get').toLowerCase();
  calls.push(m + ' ' + path + ' v=' + opts.headers['Notion-Version']);
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (opts.headers.Authorization !== 'Bearer ntn_test') return res(401, { message: 'API token is invalid.' });
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS, name: 'Master Task List' }] });
  if (m === 'get' && path === '/databases/' + DB2) return res(200, { data_sources: [{ id: DS2 }] });
  if (m === 'get' && path === '/data_sources/' + DS2) return res(200, { title: [{ plain_text: '🗓️ Key Dates' }], properties: { 'Life Area': { select: { options: [{ name: '🌿 SkyGarden Farm' }, { name: '👨‍👩‍👧‍👦 Family' }] } }, Type: { select: { options: [{ name: '⏰ Deadline' }, { name: '🎂 Birthday' }, { name: '🌦️ Window' }] } } } });
  if (m === 'post' && path === '/data_sources/' + DS2 + '/query') return res(200, { results: dpages, has_more: false });
  if (m === 'post' && path === '/pages' && JSON.parse(opts.payload).parent.data_source_id === DS2) { const pr = JSON.parse(opts.payload).properties; const pg = { id: 'g'.repeat(31) + dpages.length, url: 'u', parent: { data_source_id: DS2 }, properties: Object.assign({ Notes: { rich_text: (pr.Notes || {}).rich_text || [] } }, pr, { Name: { title: [{ plain_text: pr.Name.title[0].text.content }] } }) }; if (pr.Notes) pg.properties.Notes = { rich_text: [{ plain_text: pr.Notes.rich_text[0].text.content }] }; dpages.push(pg); return res(200, pg); }
  if (m === 'get' && path === '/data_sources/' + DS) return res(200, { title: [{ plain_text: '🎯 Master Task List' }], properties: { 'Life Area': { select: { options: [{ name: '🌿 SkyGarden Farm' }, { name: '🎯 Work & Calling' }, { name: '🏡 Home & Property' }] } } } });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    const f = JSON.parse(opts.payload).filter; let r = pages;
    if (f.property === 'Focus Date') r = pages.filter(p => (p.properties['Focus Date'].date || {}).start === f.date.equals);
    if (f.property === 'Status') r = pages.filter(p => (p.properties.Status.select || {}).name !== f.select.does_not_equal);
    if (f.and) { const st = f.and.find(x => x.property === 'Status').select.equals, since = f.and.find(x => x.timestamp === 'last_edited_time').last_edited_time.on_or_after;
      r = pages.filter(p => (p.properties.Status.select || {}).name === st && p.last_edited_time >= since); }
    return res(200, { results: r, has_more: false });
  }
  const pm = path.match(/^\/pages\/(.+)$/);
  if (pm) { const pg = pages.concat([foreign]).find(p => p.id === pm[1]); if (!pg) return res(404, { message: 'not found' });
    if (m === 'get') return res(200, pg);
    if (m === 'patch') { const pr = JSON.parse(opts.payload).properties; Object.keys(pr).forEach(k => { pg.properties[k] = pr[k]; }); return res(200, pg); } }
  if (m === 'post' && path === '/pages') { const b = JSON.parse(opts.payload); const pr = b.properties;
    const pg = mk('e'.repeat(31) + pages.length, pr.Task.title[0].text.content, pr.Status.select.name, pr.Priority && pr.Priority.select.name, pr['Life Area'] && pr['Life Area'].select.name, null, pr['Focus Date'] && pr['Focus Date'].date.start, b.parent.data_source_id);
    pages.push(pg); return res(200, pg); }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: (...a) => console.log('   log:', ...a) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: d => d.toISOString().slice(0, 10), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: notionMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
console.log('setup without token:'); ctx.setup(); const key = props.ACCESS_KEY;
console.log('caps without token:', JSON.stringify(get({ action: 'ping', key }).capabilities));
console.log('tasks without token:', JSON.stringify(get({ action: 'tasks', key, day: '2026-10-06' })));
props.NOTION_TOKEN = 'ntn_wrong'; console.log('bad token ping notion:', JSON.stringify(get({ action: 'ping', key }).notion));
props.NOTION_TOKEN = 'ntn_test'; console.log('setup with token:'); ctx.setup();
const t = get({ action: 'tasks', key, day: '2026-10-06' });
console.log('tasks: focus', t.focus.map(x => x.title), '| open', t.open.map(x => x.title + '/' + x.focus), '| areas', t.areas.length, '| caps', JSON.stringify(get({ action: 'ping', key }).capabilities));
console.log('no key:', JSON.stringify(post({ action: 'focus', id: 'a'.repeat(32), day: '2026-10-06' })));
console.log('focus a:', JSON.stringify(post({ key, action: 'focus', id: 'a'.repeat(32), day: '2026-10-06' })).slice(0, 140));
console.log('focus foreign page:', JSON.stringify(post({ key, action: 'focus', id: 'd'.repeat(32), day: '2026-10-06' })));
console.log('status bad value:', JSON.stringify(post({ key, action: 'status', id: 'a'.repeat(32), status: 'Deleted' })));
console.log('status done:', JSON.stringify(post({ key, action: 'status', id: 'a'.repeat(32), status: '✅ Done' }).task.status));
console.log('unfocus:', JSON.stringify(post({ key, action: 'focus', id: 'a'.repeat(32), day: null }).task.focus));
const add = { cid: 'task-0000-0001', title: 'Sugar syrup, Hive 2', area: '🌿 SkyGarden Farm', priority: '🔴 High', day: '2026-10-06' };
console.log('add task:', JSON.stringify(post({ key, action: 'addtask', task: add }).task));
console.log('add again same cid -> duplicate:', post({ key, action: 'addtask', task: add }).duplicate, '| pages now', pages.length);
console.log('add bad area:', JSON.stringify(post({ key, action: 'addtask', task: Object.assign({}, add, { cid: 'task-0000-0002', area: '💣 Nope' }) })));
const t2 = get({ action: 'tasks', key, day: '2026-10-06' });
console.log('after writes: focus', t2.focus.map(x => x.title + '/' + x.status));
console.log('Notion-Version used:', [...new Set(calls.map(c => c.split(' v=')[1]))]);

console.log('--- key dates ---');
const ping = get({ action: 'ping', key });
console.log('caps', JSON.stringify(ping.capabilities), '| dates status', JSON.stringify(ping.notion.dates));
console.log('dates:', JSON.stringify(get({ action: 'dates', key }).dates.map(d => [d.title, d.start, d.end, d.area, d.type, d.yearly])));
const kd = { cid: 'date-0000-0001', title: "Mom's birthday", start: '2026-11-08', area: '👨‍👩‍👧‍👦 Family', type: '🎂 Birthday', yearly: true, notes: 'Call in the morning' };
console.log('add birthday:', JSON.stringify(post({ key, action: 'adddate', date: kd }).date));
console.log('resend -> duplicate', post({ key, action: 'adddate', date: kd }).duplicate, '| count', dpages.length);
console.log('window:', JSON.stringify(post({ key, action: 'adddate', date: { cid: 'date-0000-0002', title: 'Hardening-off window', start: '2027-03-15', end: '2027-04-05', type: '🌦️ Window' } }).date));
console.log('end before start:', JSON.stringify(post({ key, action: 'adddate', date: { cid: 'date-0000-0003', title: 'x', start: '2026-10-10', end: '2026-10-01' } })));
console.log('bad type:', JSON.stringify(post({ key, action: 'adddate', date: { cid: 'date-0000-0004', title: 'x', start: '2026-10-10', type: 'Nope' } })));
console.log('no key:', JSON.stringify(post({ action: 'adddate', date: kd })));
console.log('after adds:', get({ action: 'dates', key }).dates.length);

console.log('--- balance (done) ---');
const assert = require('assert');
const RealDate = Date; ctx.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-10-06T12:00:00Z'])); } static now() { return new RealDate('2026-10-06T12:00:00Z').getTime(); } };
pages.push(mk('h'.repeat(32), 'Old finished thing', '✅ Done', null, '🌿 SkyGarden Farm', null, null, DS, '2026-08-01T12:00:00.000Z'));
const dn = get({ action: 'done', key, days: '30' });
console.log('done:', JSON.stringify(dn));
assert.strictEqual(dn.ok, true);
assert.ok(dn.done.every(x => !('title' in x)), 'no titles leave the bridge');
assert.ok(!dn.done.some(x => x.at < '2026-09-06'), 'older than 30 days excluded');
assert.ok(dn.done.length >= 1);
assert.deepStrictEqual(get({ action: 'ping', key }).capabilities, ['read', 'create', 'tasks', 'dates', 'done']);
console.log('days clamp:', get({ action: 'done', key, days: '999' }).days, get({ action: 'done', key, days: 'x' }).days);
