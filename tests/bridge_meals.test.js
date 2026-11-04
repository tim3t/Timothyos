// MEALS in the bridge (1.39). meals: every meal (ingredients read from "Item · Aisle" lines, "· have" for a pantry
// staple) and the dinners from 120 days back to three weeks ahead, each linked to its meal by the Meal relation.
// mealsave / mealremove: one page per meal, found again by its App ID; remove moves it to the trash. dinnerset: one
// page per night (setting it again changes that page; none moves it to the trash); a meal it doesn't know is refused.
// mealplan: PLAN MY WEEK asks Claude for the open nights with each meal's rotation (days since, times in 90 days, usual
// gap); only meals from the list, one each, only the nights asked; nothing is saved. Invented meals.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test', ANTHROPIC_API_KEY: 'sk-test' }, cache = {};
const DBM = '880216ac00294fbca344eafc9c77a8b5', DBD = '1ba57e689aaa499eafe3f734874a1b7c', DSM = 'ds-meals', DSD = 'ds-dinners';
let pages = {}, n = 0, calls = [], claude = [], reply = null;
const norm = pr => { Object.values(pr).forEach(v => ['title', 'rich_text'].forEach(t => (v[t] || []).forEach(r => { if (r.text) r.plain_text = r.text.content; }))); return pr; };
function page(ds, pr) { norm(pr); const id = ('0000000000000000000000000000000' + (++n)).slice(-32); pages[id] = { id, ds, in_trash: false, properties: pr }; return pages[id]; }
const txt = p => ((p && (p.rich_text || p.title)) || []).map(r => r.plain_text != null ? r.plain_text : r.text.content).join('');
const day = off => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
function match(p, f) {
  if (!f) return true;
  if (f.and) return f.and.every(x => match(p, x));
  if (f.rich_text) return txt(p.properties[f.property]) === f.rich_text.equals;
  const d = p.properties.Date && p.properties.Date.date && p.properties.Date.date.start;
  if (f.date.equals) return d === f.date.equals;
  if (f.date.on_or_after) return d >= f.date.on_or_after;
  if (f.date.on_or_before) return d <= f.date.on_or_before;
  return true;
}
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
  const body = opts.payload ? JSON.parse(opts.payload) : null;
  if (/anthropic/.test(url)) { claude.push(body); return res(200, { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 120 }, content: [{ type: 'text', text: reply }] }); }
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase();
  calls.push(m + ' ' + path);
  if (m === 'get' && path === '/databases/' + DBM) return res(200, { data_sources: [{ id: DSM }] });
  if (m === 'get' && path === '/databases/' + DBD) return res(200, { data_sources: [{ id: DSD }] });
  if (m === 'get' && path.indexOf('/databases/') === 0) return res(404, { message: 'Could not find database' });
  const q = path.match(/^\/data_sources\/(.+)\/query$/);
  if (m === 'post' && q) {
    const rows = Object.values(pages).filter(p => p.ds === q[1] && !p.in_trash && match(p, body.filter)), by = body.sorts && body.sorts[0].property;
    if (by === 'Date') rows.sort((a, b) => a.properties.Date.date.start < b.properties.Date.date.start ? -1 : 1);
    if (by === 'Name') rows.sort((a, b) => txt(a.properties.Name).localeCompare(txt(b.properties.Name)));
    return res(200, { results: rows, has_more: false });
  }
  if (m === 'post' && path === '/pages') return res(200, page(body.parent.data_source_id, body.properties));
  const pm = path.match(/^\/pages\/(.+)$/);
  if (pm && m === 'patch') { const p = pages[pm[1]]; if (body.in_trash) p.in_trash = true; if (body.properties) Object.assign(p.properties, norm(body.properties)); return res(200, p); }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const logs = [];
const ctx = {
  console: { log: (...a) => logs.push(a.join(' ')) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }), getUserProperties: () => ({ getProperty: () => null, setProperties() {}, deleteProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep() {},
    formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : f === 'yyyy-MM' ? d.toISOString().slice(0, 7) : f === 'EEEE' ? d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : d.toISOString() },
  Session: { getScriptTimeZone: () => 'UTC' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);

assert.ok(logs.includes('Notion meals and dinners: OK (0 meals, 0 dinners)'), logs.filter(l => /meal/i.test(l)).join(' | '));
const caps = post({ action: 'ping' }).capabilities;
assert.ok(caps.includes('meals') && caps.includes('mealplan'));

// ---- meals: saved whole, found again by App ID; ingredients as lines in Notion
const soup = { id: 'm-soup', name: 'Sample lentil soup', kind: 'Meatless', ing: [{ n: 'Lentils', a: 'Pantry', have: true }, { n: 'Carrots', a: 'Produce' }, { n: 'Onion', a: 'Produce' }], recipe: 'https://example.com/soup', notes: 'Double it' };
let r = post({ action: 'mealsave', meal: soup });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.meal.ing, [{ n: 'Lentils', a: 'Pantry', have: true }, { n: 'Carrots', a: 'Produce', have: false }, { n: 'Onion', a: 'Produce', have: false }]);
const sp = Object.values(pages).find(p => txt(p.properties['App ID']) === 'm-soup');
assert.strictEqual(txt(sp.properties.Ingredients), 'Lentils · Pantry · have\nCarrots · Produce\nOnion · Produce', 'readable and editable in Notion');
assert.strictEqual(sp.properties.Kind.select.name, 'Meatless'); assert.strictEqual(sp.properties.Recipe.url, 'https://example.com/soup');
r = post({ action: 'mealsave', meal: Object.assign({}, soup, { name: 'Sample lentil stew' }) });
assert.strictEqual(Object.values(pages).filter(p => p.ds === DSM && !p.in_trash).length, 1, 'the same page again');
['m-taco', 'm-pizza', 'm-fish'].forEach((id, i) => assert.ok(post({ action: 'mealsave', meal: { id, name: ['Sample tacos', 'Sample pizza', 'Sample fish'][i], kind: ['Beef + Pork', 'Meatless', 'Fish'][i], ing: [{ n: 'Item ' + i, a: 'Dairy' }] } }).ok));
// an edit made in Notion: an aisle it doesn't know is Other; blank lines skipped
sp.properties.Ingredients = { rich_text: [{ plain_text: 'Lentils · pantry · HAVE\n\nCumin · Spices' }] };
cache.mgen = 'x1';
let rd = post({ action: 'meals' });
assert.deepStrictEqual(rd.meals.find(m => m.id === 'm-soup').ing, [{ n: 'Lentils', a: 'Pantry', have: true }, { n: 'Cumin', a: 'Other', have: false }]);
// refused: no id, an unknown kind or aisle, a line break or dot in an item, a recipe that isn't a link
[{ name: 'x', kind: 'Other', ing: [] }, { id: 'a', name: 'x', kind: 'Soup', ing: [] }, { id: 'a', name: 'x', kind: 'Other', ing: [{ n: 'y', a: 'Spices' }] },
  { id: 'a', name: 'x', kind: 'Other', ing: [{ n: 'y\nz', a: 'Dairy' }] }, { id: 'a', name: 'x', kind: 'Other', ing: [{ n: 'y · z', a: 'Dairy' }] }, { id: 'a', name: 'x', kind: 'Other', ing: [], recipe: 'javascript:alert(1)' }]
  .forEach(b => assert.strictEqual(post({ action: 'mealsave', meal: b }).error, 'bad_request', JSON.stringify(b)));

// ---- dinners: one page a night, linked to its meal
r = post({ action: 'dinnerset', dinner: { date: day(-2), status: 'eaten', kind: 'meal', meal: 'm-taco', note: 'Sample note' } });
assert.ok(r.ok && r.dinner.meal === 'm-taco' && r.dinner.name === 'Sample tacos' && r.dinner.status === 'eaten', JSON.stringify(r));
const dp = Object.values(pages).find(p => p.ds === DSD);
assert.strictEqual(dp.properties.Meal.relation[0].id, Object.values(pages).find(p => txt(p.properties['App ID']) === 'm-taco').id);
assert.strictEqual(dp.properties.Kind.select.name, 'Meal'); assert.strictEqual(dp.properties.Status.select.name, 'Eaten');
r = post({ action: 'dinnerset', dinner: { date: day(-2), status: 'eaten', kind: 'leftovers' } });
assert.ok(r.ok && r.dinner.kind === 'leftovers' && r.dinner.meal === null);
assert.strictEqual(Object.values(pages).filter(p => p.ds === DSD && !p.in_trash).length, 1, 'the same night, the same page');
assert.strictEqual(txt(dp.properties.Dinner), 'Leftovers'); assert.deepStrictEqual(dp.properties.Meal.relation, []);
post({ action: 'dinnerset', dinner: { date: day(-9), status: 'eaten', kind: 'meal', meal: 'm-soup' } });
post({ action: 'dinnerset', dinner: { date: day(-40), status: 'eaten', kind: 'meal', meal: 'm-soup' } });
post({ action: 'dinnerset', dinner: { date: day(-1), status: 'eaten', kind: 'out' } });
post({ action: 'dinnerset', dinner: { date: day(1), status: 'planned', kind: 'meal', meal: 'm-pizza' } });
post({ action: 'dinnerset', dinner: { date: day(-300), status: 'eaten', kind: 'meal', meal: 'm-pizza' } });   // older than the read reaches
assert.strictEqual(post({ action: 'dinnerset', dinner: { date: day(3), status: 'planned', kind: 'meal', meal: 'm-gone' } }).error, 'not_found');
[{ date: '2026-02-30', kind: 'out' }, { date: day(0), kind: 'brunch' }, { date: day(0), kind: 'meal' }].forEach(b => assert.strictEqual(post({ action: 'dinnerset', dinner: b }).error, 'bad_request', JSON.stringify(b)));
rd = post({ action: 'meals' });
assert.deepStrictEqual(rd.dinners.map(d => [d.date, d.status, d.kind, d.meal]), [[day(-40), 'eaten', 'meal', 'm-soup'], [day(-9), 'eaten', 'meal', 'm-soup'], [day(-2), 'eaten', 'leftovers', null], [day(-1), 'eaten', 'out', null], [day(1), 'planned', 'meal', 'm-pizza']]);
// cleared: to the trash
assert.ok(post({ action: 'dinnerset', dinner: { date: day(1), kind: 'none' } }).ok);
assert.ok(Object.values(pages).some(p => p.ds === DSD && p.in_trash && p.properties.Date.date.start === day(1)));
assert.ok(!post({ action: 'meals' }).dinners.some(d => d.date === day(1)));

// ---- PLAN MY WEEK: the rotation goes to Claude; only meals and nights it was given come back
reply = JSON.stringify({ plan: [{ date: day(2), meal: 'm-soup', why: 'not in a while' }, { date: day(3), meal: 'm-nope', why: 'x' }, { date: day(4), meal: 'm-soup', why: 'again' }, { date: day(9), meal: 'm-fish', why: 'not asked' }, { date: day(4), meal: 'm-fish', why: 'fish night' }] });
r = post({ action: 'mealplan', nights: [day(2), day(3), day(4)] });
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.plan.map(p => [p.date, p.meal]), [[day(2), 'm-soup'], [day(4), 'm-fish']], 'an unknown meal, a repeat and a night not asked are dropped');
const sent = claude[0].messages[0].content;
assert.ok(sent.includes('m-soup | Sample lentil stew | Meatless | 9 days since | 2x in 90 days | usually every 31 days'), sent);
assert.ok(sent.includes('m-fish | Sample fish | Fish | never recorded'));
assert.ok(sent.includes(day(-1) + ': Eating out') && sent.includes('PLAN THESE NIGHTS\n' + day(2) + ' ('), sent);
assert.ok(!/Sample note/.test(sent), 'notes stay out');
assert.strictEqual(Object.values(pages).filter(p => p.ds === DSD && !p.in_trash).length, 5, 'nothing saved');
assert.ok(JSON.parse(props.AI_SPEND).calls === 1);
[[], [day(-1)], [day(30)], [day(2), day(2)], Array.from({ length: 8 }, (_, i) => day(i))].forEach(nights => assert.strictEqual(post({ action: 'mealplan', nights }).error, 'bad_request', JSON.stringify(nights)));
reply = 'no idea'; assert.strictEqual(post({ action: 'mealplan', nights: [day(2)] }).error, 'ai_error');

// ---- remove: to the trash; its dinners keep their names
assert.ok(post({ action: 'mealremove', id: 'm-taco' }).ok);
assert.ok(Object.values(pages).find(p => txt(p.properties['App ID']) === 'm-taco').in_trash);
assert.strictEqual(post({ action: 'mealremove', id: '../x' }).error, 'bad_request');
// the schema check knows both
const sc = post({ action: 'schema', fresh: '1' });
assert.ok(sc.dbs.some(d => d.key === 'meals') && sc.dbs.some(d => d.key === 'dinners'), JSON.stringify(sc.dbs.map(d => d.key)));
console.log('bridge meals: OK');
