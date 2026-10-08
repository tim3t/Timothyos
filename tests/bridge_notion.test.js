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
const DB3 = '459bcacdc38d4bad9f58b4579fa9f4fd', DS3 = 'ds-3333', rpages = [];
let reviewsShared = true;
const stored = pr => { const o = {}; Object.keys(pr).forEach(k => { const v = pr[k];
  if (v.title) o[k] = { title: v.title.map(x => ({ plain_text: x.text.content })) };
  else if (v.rich_text) o[k] = { rich_text: v.rich_text.map(x => ({ plain_text: x.text.content })) };
  else o[k] = v; }); return o; };
const foreign = mk('d'.repeat(32), 'Private journal', null, null, null, null, null, 'other-ds');
let calls = [];
function notionMock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''); const m = (opts.method || 'get').toLowerCase();
  calls.push(m + ' ' + path + ' v=' + opts.headers['Notion-Version']);
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  if (opts.headers.Authorization !== 'Bearer ntn_test') return res(401, { message: 'API token is invalid.' });
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS, name: 'Master Task List' }] });
  if (m === 'get' && path === '/databases/' + DB2) return res(200, { data_sources: [{ id: DS2 }] });
  if (path.indexOf(DB3) > -1 || path.indexOf(DS3) > -1 || (opts.payload && opts.payload.indexOf(DS3) > -1)) { if (!reviewsShared) return res(404, { message: 'Could not find database' }); }
  if (m === 'get' && path === '/databases/' + DB3) return res(200, { data_sources: [{ id: DS3 }] });
  if (m === 'get' && path === '/data_sources/' + DS3) return res(200, { title: [{ plain_text: '🧭 Weekly Reviews' }], properties: {} });
  if (m === 'post' && path === '/data_sources/' + DS3 + '/query') { const q = JSON.parse(opts.payload), f = q.filter; let r = f ? rpages.filter(p => (p.properties['Week Start'].date || {}).start === f.date.equals) : rpages.slice();
    if (q.sorts) r.sort((a, b) => (b.properties['Week Start'].date.start).localeCompare(a.properties['Week Start'].date.start)); return res(200, { results: r, has_more: false }); }
  if (m === 'post' && path === '/pages' && JSON.parse(opts.payload).parent.data_source_id === DS3) { const pg = { id: 'r'.repeat(31) + rpages.length, url: 'u', last_edited_time: '2026-10-11T20:00:00.000Z', parent: { data_source_id: DS3 }, properties: stored(JSON.parse(opts.payload).properties) }; rpages.push(pg); return res(200, pg); }
  const rm = path.match(/^\/pages\/(r+\d+)$/);
  if (rm && m === 'patch') { const pg = rpages.find(p => p.id === rm[1]); Object.assign(pg.properties, stored(JSON.parse(opts.payload).properties)); return res(200, pg); }
  if (m === 'get' && path === '/data_sources/' + DS2) return res(200, { title: [{ plain_text: '🗓️ Key Dates' }], properties: { 'Life Area': { select: { options: [{ name: '🌿 SkyGarden Farm' }, { name: '👨‍👩‍👧‍👦 Family' }] } }, Type: { select: { options: [{ name: '⏰ Deadline' }, { name: '🎂 Birthday' }, { name: '🌦️ Window' }] } } } });
  if (m === 'post' && path === '/data_sources/' + DS2 + '/query') return res(200, { results: dpages, has_more: false });
  if (m === 'post' && path === '/pages' && JSON.parse(opts.payload).parent.data_source_id === DS2) { const pr = JSON.parse(opts.payload).properties; const pg = { id: 'g'.repeat(31) + dpages.length, url: 'u', parent: { data_source_id: DS2 }, properties: Object.assign({ Notes: { rich_text: (pr.Notes || {}).rich_text || [] } }, pr, { Name: { title: [{ plain_text: pr.Name.title[0].text.content }] } }) }; if (pr.Notes) pg.properties.Notes = { rich_text: [{ plain_text: pr.Notes.rich_text[0].text.content }] }; dpages.push(pg); return res(200, pg); }
  if (m === 'get' && path === '/data_sources/' + DS) return res(200, { title: [{ plain_text: '🎯 Master Task List' }], properties: { 'Life Area': { select: { options: [{ name: '🌿 SkyGarden Farm' }, { name: '🎯 Work & Calling' }, { name: '🏡 Home & Property' }] } } } });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') {
    const f = JSON.parse(opts.payload).filter; let r = pages;
    if (f.property === 'Focus Date') r = pages.filter(p => (p.properties['Focus Date'].date || {}).start === f.date.equals);
    if (f.property === 'Status') r = pages.filter(p => (p.properties.Status.select || {}).name !== f.select.does_not_equal);
    if (f.and) r = pages.filter(p => f.and.every(c => {
      if (c.property === 'Status') return (p.properties.Status.select || {}).name === c.select.equals;
      if (c.timestamp) { const v = c.last_edited_time, t = Date.parse(p.last_edited_time); return (!v.on_or_after || t >= Date.parse(v.on_or_after)) && (!v.before || t < Date.parse(v.before)); }
      if (c.property === 'Focus Date') { const d = (p.properties['Focus Date'].date || {}).start; return !!d && (!c.date.on_or_after || d >= c.date.on_or_after) && (!c.date.before || d < c.date.before); }
      return true;
    }));
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
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
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

const assertB = require('assert');
// several reads in one request: each answers on its own, a bad one doesn't stop the rest
const bt = get({ action: 'batch', key, calls: JSON.stringify([{ action: 'tasks', day: '2026-10-06' }, { action: 'dates' }, { action: 'ping' }, { action: 'nope' }]) });
assertB.ok(bt.ok); assertB.strictEqual(bt.results.length, 4);
assertB.ok(bt.results[0].ok && Array.isArray(bt.results[0].focus)); assertB.ok(bt.results[1].ok && Array.isArray(bt.results[1].dates));
assertB.strictEqual(bt.results[2].error, 'bad_request', 'only everyday reads'); assertB.strictEqual(bt.results[3].error, 'bad_request');
assertB.strictEqual(get({ action: 'batch', key, calls: 'not json' }).error, 'bad_request');
assertB.strictEqual(get({ action: 'batch', key, calls: JSON.stringify(new Array(9).fill({ action: 'dates' })) }).error, 'bad_request');
assertB.strictEqual(get({ action: 'batch', calls: '[]' }).error, 'no_key');
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
assert.deepStrictEqual(get({ action: 'ping', key }).capabilities, ['read', 'create', 'tasks', 'dates', 'done', 'reviews', 'reviewlog', 'queue', 'log']);
console.log('days clamp:', get({ action: 'done', key, days: '999' }).days, get({ action: 'done', key, days: 'x' }).days);

console.log('--- weekly review ---');
pages.push(mk('i'.repeat(32), 'Picked and finished', '✅ Done', '🔴 High', '🎯 Work & Calling', null, '2026-10-07', DS, '2026-10-07T18:00:00.000Z'));
pages.push(mk('j'.repeat(32), 'Picked, slipped', '⬜ To Do', '🟡 Medium', '🌿 SkyGarden Farm', null, '2026-10-09', DS, '2026-10-01T18:00:00.000Z'));
pages.push(mk('k'.repeat(32), 'Done Sunday night, local time', '✅ Done', null, '🏥 Health', null, null, DS, '2026-10-12T03:30:00.000Z'));
pages.push(mk('l'.repeat(32), 'Done next Monday', '✅ Done', null, '🏥 Health', null, null, DS, '2026-10-12T06:00:00.000Z'));
const W = { action: 'week', key, week: '2026-10-05', from: '2026-10-05T00:00:00-05:00', to: '2026-10-12T00:00:00-05:00' };
const wk = get(W);
console.log('week: done', wk.done.map(t => t.title), '| picked', wk.picked.map(t => t.title + '/' + t.status), '| review', wk.review);
assert.ok(wk.ok);
assert.ok(wk.done.some(t => t.title === 'Done Sunday night, local time'), 'Sunday 22:30 local counts in the week');
assert.ok(!wk.done.some(t => t.title === 'Done next Monday'));
assert.deepStrictEqual(wk.picked.map(t => t.title).sort(), ['Picked and finished', 'Picked, slipped', 'Renew registration', 'Sugar syrup, Hive 2']);
assert.strictEqual(wk.review, null);
assert.strictEqual(get(Object.assign({}, W, { from: 'yesterday' })).error, 'bad_request');
const R = { week: '2026-10-05', title: 'Week 41 · 05 to 11 Oct', wentWell: 'Shipped the deck', drained: 'Too many evening calls', nextFocus: 'Hive winter prep', bearing: '', intents: 'MON One line\nTUE Another', byArea: 'Work & Calling 2 · Health 1', hoursWork: 31.25, hoursPersonal: 6, hoursFarm: null, hoursHobbies: null, tasksDone: 3, picked: 2, pickedDone: 1 };
const s1 = post({ key, action: 'savereview', review: R });
console.log('save:', JSON.stringify(s1).slice(0, 200));
assert.ok(s1.ok && s1.created);
assert.strictEqual(s1.review.hoursWork, 31.3); assert.strictEqual(s1.review.hoursFarm, null); assert.strictEqual(s1.review.intents, 'MON One line\nTUE Another');
const s2 = post({ key, action: 'savereview', review: Object.assign({}, R, { nextFocus: 'Hive winter prep, then rest' }) });
assert.ok(s2.ok && !s2.created, 'second save updates the same page'); assert.strictEqual(rpages.length, 1);
assert.strictEqual(get(W).review.nextFocus, 'Hive winter prep, then rest', 'week returns the saved review (cache refreshed)');
assert.strictEqual(post({ key, action: 'savereview', review: { week: 'oops' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'savereview', review: R }).error, 'no_key', 'refused without a key');
assert.ok(get({ action: 'ping', key }).capabilities.includes('reviews') && get({ action: 'ping', key }).capabilities.includes('reviewlog'));
post({ key, action: 'savereview', review: { week: '2026-09-28', title: 'Week 40', wentWell: 'Quiet week', hoursWork: 30 } });
const list = get({ action: 'reviews', key });
console.log('reviews list:', list.reviews.map(r => r.week + ' ' + r.title));
assert.deepStrictEqual(list.reviews.map(r => r.week), ['2026-10-05', '2026-09-28'], 'newest first');
assert.strictEqual(list.reviews[0].nextFocus, 'Hive winter prep, then rest');
reviewsShared = false; ctx.PropertiesService.getScriptProperties().deleteProperty('NOTION_REVIEWS_SOURCE'); cache['rgen'] = 'x';
const ns = get(W);
console.log('reviews not connected -> week still works:', ns.ok, ns.reviewsError, '| save:', post({ key, action: 'savereview', review: R }).error);
assert.ok(ns.ok && ns.reviewsError === 'notion_not_shared');
console.log('setup log with reviews:'); reviewsShared = true; ctx.setup();
