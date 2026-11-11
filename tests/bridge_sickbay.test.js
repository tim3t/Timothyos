// SICKBAY (bridge 1.43): the Health shortcut's lines (CODE|VALUE|START|END) put together into days in the script's
// time zone (averages, sums, the last reading, sleep stages by the morning it ended, Fahrenheit and kilograms
// converted, nonsense and duplicates left out); HEALTH_KEY sends and does nothing else, and the main key can't send;
// a day sent again merges with what it holds; medicines, readings and notes saved, read back and removed; Day pages
// never touched by the app's own saves; the schema spec, the capability and setup's key. All values invented.
const fs = require('fs'); const vm = require('vm');
const fmt = (d, tz, pat) => {   // Apps Script's formatDate, for the three patterns the bridge uses here
  const o = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (pat === 'yyyy-MM-dd') return o.year + '-' + o.month + '-' + o.day;
  if (pat === 'HH:mm') return o.hour + ':' + o.minute;
  if (pat === 'EEE d MMM yyyy') return o.weekday + ' ' + Number(o.day) + ' ' + MON[Number(o.month) - 1] + ' ' + o.year;
  return d.toISOString();
}; const assert = require('assert');
const props = { ACCESS_KEY: 'k'.repeat(64), NOTION_TOKEN: 'ntn_test' }; const cache = {};
const TDB = '247132153b624a71ab5fb20492e98b7c', TDS = 'ds-sickbay', ODS = 'ds-other';
const pages = { [TDS]: [], [ODS]: [] }; let n = 0;
const id = p => p + String(++n).padStart(30, '0');
const val = v => v.title ? { title: v.title.map(t => ({ plain_text: t.text.content })) } : v.rich_text ? { rich_text: v.rich_text.map(t => ({ plain_text: t.text.content })) } : v;
const txt = r => (r || []).map(t => t.plain_text).join('');
function match(pg, f) {
  if (!f) return true;
  if (f.and) return f.and.every(g => match(pg, g));
  if (f.or) return f.or.some(g => match(pg, g));
  const p = pg.properties[f.property];
  if (f.select) return f.select.does_not_equal !== undefined ? !(p && p.select && p.select.name === f.select.does_not_equal) : !!(p && p.select && p.select.name === f.select.equals);
  if (f.checkbox) return !!(p && p.checkbox) === f.checkbox.equals;
  if (f.rich_text) return !!p && txt(p.rich_text) === f.rich_text.equals;
  if (f.date) { const d = p && p.date && p.date.start; if (!d) return false; if (f.date.on_or_after && d < f.date.on_or_after) return false; if (f.date.on_or_before && d > f.date.on_or_before) return false; return true; }
  throw new Error('filter ' + JSON.stringify(f));
}
function mock(url, opts) {
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  const res = (code, b) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(b) });
  if (m === 'get' && path === '/databases/' + TDB) return res(200, { data_sources: [{ id: TDS }] });
  let mm = path.match(/^\/data_sources\/([^/]+)\/query$/);
  if (mm && m === 'post') return res(200, { results: pages[mm[1]].filter(p => !p.in_trash && match(p, body.filter)), has_more: false });
  if (m === 'post' && path === '/pages') {
    const ds = body.parent.data_source_id, pr = {};
    Object.keys(body.properties).forEach(k => { pr[k] = val(body.properties[k]); });
    const pg = { id: id('p'), url: 'https://notion.so/x', parent: { type: 'data_source_id', data_source_id: ds }, created_time: '2026-10-19T12:00:00.000Z', properties: pr };
    pages[ds].push(pg); return res(200, pg);
  }
  mm = path.match(/^\/pages\/([^/]+)$/);
  if (mm) {
    const pg = pages[TDS].concat(pages[ODS]).find(p => p.id === mm[1]);
    if (!pg) return res(404, { message: 'not found' });
    if (m === 'get') return res(200, pg);
    if (m === 'patch') { if (body.in_trash) pg.in_trash = true; Object.keys(body.properties || {}).forEach(k => { pg.properties[k] = val(body.properties[k]); }); return res(200, pg); }
  }
  return res(400, { message: 'unexpected ' + m + ' ' + path });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {}, formatDate: fmt },
  Session: { getScriptTimeZone: () => 'America/New_York' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: mock },
  CalendarApp: { getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const key = props.ACCESS_KEY;
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, b)) } }).text);
const get = q => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key }, q)) } }).text);


const HK = 'h'.repeat(64);
let r0;
const health = (k, lines) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: k, action: 'healthput', lines: lines }) } }).text);

// ---- before setup: no health key, nothing accepted
let caps = get({ action: 'ping' }).capabilities;
assert.ok(caps.includes('sickbay') && !caps.includes('healthkey'), caps.join());
r0 = health(HK, 'rhr|58|2026-11-08T08:00:00-05:00|2026-11-08T08:00:00-05:00');
assert.strictEqual(r0.error, 'health_key_not_set'); assert.ok(/Run setup/.test(r0.message), 'every refusal says what to do (1.43.1)');
ctx.setup();
assert.ok(/^[0-9a-f]{64}$/.test(props.HEALTH_KEY), 'setup makes the health key');
props.HEALTH_KEY = HK;
assert.ok(get({ action: 'ping' }).capabilities.includes('healthkey'));
r0 = health(key, 'rhr|58|2026-11-08T08:00:00-05:00|2026-11-08T08:00:00-05:00');
assert.strictEqual(r0.error, 'unauthorized', 'the main key cannot send health data'); assert.ok(/didn't match/.test(r0.message));
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: HK, action: 'health' }) } }).text).error, 'unauthorized', 'the health key reads nothing');
assert.strictEqual(JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: HK, action: 'sickbaysave', item: { kind: 'note', id: 'n1', name: 'x' } }) } }).text).error, 'unauthorized', 'and writes nothing else');
r0 = health(HK, '');
assert.strictEqual(r0.error, 'nothing_to_send'); assert.ok(/Health had nothing to send yet/.test(r0.message), 'an empty send explains itself (1.43.1)');
r0 = health(HK, 'steps|6840|9 Nov 2026 at 3:24 PM|9 Nov 2026 at 3:24 PM');
assert.ok(r0.ok && !r0.days.length && /ISO 8601/.test(r0.message), 'dates not in ISO 8601: said so: ' + r0.message);

// ---- a morning's lines, as the shortcut sends them (dates relative to now, so the 14-day window holds)
const D = n => { const d = new Date(Date.now() - n * 864e5); return fmt(d, 'America/New_York', 'yyyy-MM-dd'); };
const at = (n, hm) => D(n) + 'T' + hm + ':00-05:00';
const y = D(1), t = D(0);
const L = [
  'rhr|57 count/min|' + at(1, '07:00') + '|' + at(1, '07:00'), 'rhr|59|' + at(1, '19:00') + '|' + at(1, '19:00'),
  'hrv|48 ms|' + at(1, '03:00') + '|' + at(1, '03:00'), 'hrv | 52 | ' + at(1, '04:00') + ' | ' + at(1, '04:00'),
  'steps|6,840 count|' + at(1, '00:00') + '|' + at(1, '23:59'), 'steps|1200|' + at(1, '12:00') + '|' + at(1, '12:30'),
  'active|412 kcal|' + at(1, '00:00') + '|' + at(1, '23:59'), 'exercise|22 min|' + at(1, '00:00') + '|' + at(1, '23:59'), 'standmin|540|' + at(1, '00:00') + '|' + at(1, '23:59'),
  'resp|14.2|' + at(0, '02:00') + '|' + at(0, '02:00'), 'vo2|38.4|' + at(1, '18:00') + '|' + at(1, '18:00'),
  'temp|96.8 °F|' + at(1, '23:30') + '|' + at(0, '06:00'), 'weight|84 kg|' + at(0, '07:10') + '|' + at(0, '07:10'),
  'sleep|In Bed|' + at(1, '22:50') + '|' + at(0, '06:30'),
  'sleep|Asleep Core|' + at(1, '23:10') + '|' + at(0, '00:40'), 'sleep|Asleep Deep|' + at(0, '00:40') + '|' + at(0, '01:40'),
  'sleep|Asleep REM|' + at(0, '01:40') + '|' + at(0, '02:30'), 'sleep|Awake|' + at(0, '02:30') + '|' + at(0, '02:40'), 'sleep|Asleep Core|' + at(0, '02:40') + '|' + at(0, '06:20'),
  'sleep|Asleep Core|' + at(0, '02:40') + '|' + at(0, '06:20'),   // the same line twice: counted once
  'rhr|999|' + at(1, '08:00') + '|' + at(1, '08:00'), 'pulse|60|' + at(1, '08:00') + '|' + at(1, '08:00'), 'rhr|fast|' + at(1, '08:00') + '|' + at(1, '08:00'), 'rhr|58|not a date|',
  'steps|500|' + at(30, '12:00') + '|' + at(30, '12:30')   // too old
].join('\n');
let r = health(HK, L);
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual(r.days, [y, t]);
assert.strictEqual(r.skipped, 5, 'the out-of-range, unknown, unreadable and repeated lines');
assert.strictEqual(r.message, 'Sent 2 days to SICKBAY. (6 lines left out: 1 the same line again, 1 a number out of range, 1 a code it does not know (pulse), 1 no number, 1 no date it could read, 1 older than two weeks.)', 'each left-out line says why (1.45)');
const day = d => pages[TDS].find(p => p.properties['App ID'] && txt(p.properties['App ID'].rich_text) === 'day-' + d);
const data = d => JSON.parse(txt(day(d).properties.Data.rich_text));
let Y = data(y), T = data(t);
assert.deepStrictEqual([Y.rhr, Y.hrv, Y.steps, Y.active, Y.exercise, Y.stand, Y.vo2], [58, 50, 8040, 412, 22, 9, 38.4], JSON.stringify(Y));
assert.strictEqual(Y.temp, undefined, 'wrist temperature belongs to the morning the night ended');
const segs = T.sleep.segs; delete T.sleep.segs;
assert.deepStrictEqual(T.sleep, { asleep: 420, deep: 60, rem: 50, core: 310, awake: 10, bed: '23:10', wake: '06:20', len: 430 }, JSON.stringify(T.sleep));
assert.deepStrictEqual(segs, [['c', 0, 90], ['d', 90, 60], ['r', 150, 50], ['a', 200, 10], ['c', 210, 220]], "the night's stages in order, for the lanes");
assert.strictEqual(T.temp, 36, '96.8 °F in °C'); assert.strictEqual(T.weight, 185.2, '84 kg in lb'); assert.strictEqual(T.resp, 14.2);
assert.strictEqual(day(t).properties.Kind.select.name, 'Day');
assert.strictEqual(day(t).properties['Sleep (h)'].number, 7); assert.strictEqual(day(y).properties['Resting HR'].number, 58); assert.strictEqual(day(y).properties.Steps.number, 8040);
assert.ok(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(txt(day(t).properties.Name.title)), txt(day(t).properties.Name.title));
assert.ok(props.HEALTH_LAST, 'the last send is kept');

// ---- sent again with a new reading for today: merged, nothing lost, no second page
r = health(HK, 'rhr|61|' + at(0, '07:00') + '|' + at(0, '07:00'));
assert.strictEqual(r.message, 'Sent 1 day to SICKBAY.');
assert.deepStrictEqual(r.days, [t]);
T = data(t);
assert.strictEqual(T.rhr, 61); assert.strictEqual(T.sleep.asleep, 420, 'what was there stays');
assert.strictEqual(pages[TDS].filter(p => p.properties.Kind.select.name === 'Day').length, 2);

// ---- the app reads days and records with the main key
let h = get({ action: 'health', from: D(10) });
assert.ok(h.ok, JSON.stringify(h));
assert.deepStrictEqual(h.days.map(x => x.date), [y, t]);
assert.strictEqual(h.days[1].sleep.deep, 60); assert.ok(h.last);
assert.deepStrictEqual(h.items, []);

// ---- medicines, readings and notes
r = post({ action: 'sickbaysave', item: { kind: 'medicine', id: 'm-test-1', name: 'Sample vitamin', data: { when: 'Morning', left: 30, taken: [t] } } });
assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.item.kind, 'medicine'); assert.strictEqual(r.item.data.left, 30);
r = post({ action: 'sickbaysave', item: { kind: 'medicine', id: 'm-test-1', name: 'Sample vitamin', data: { when: 'Morning', left: 29, taken: [t] } } });
assert.strictEqual(pages[TDS].filter(p => p.properties.Kind.select.name === 'Medicine').length, 1, 'saved again: changed in place');
post({ action: 'sickbaysave', item: { kind: 'reading', id: 'r-test-1', name: 'Blood pressure', date: t, data: { v: '120/80', unit: 'mmHg' } } });
post({ action: 'sickbaysave', item: { kind: 'note', id: 'n-test-1', name: 'A sample note', date: y, data: { tag: 'GOOD' } } });
cache.skgen = 'z2';
h = get({ action: 'health', from: D(10) });
assert.deepStrictEqual(h.items.map(i => i.kind + ':' + i.name).sort(), ['medicine:Sample vitamin', 'note:A sample note', 'reading:Blood pressure']);
assert.strictEqual(h.items.find(i => i.kind === 'medicine').data.left, 29);
// refused: a Day page, a day- id, a bad kind, a bad date, nothing to say
['day', 'nope'].forEach(k => assert.strictEqual(post({ action: 'sickbaysave', item: { kind: k, id: 'x1', name: 'x' } }).error, 'bad_request'));
assert.strictEqual(post({ action: 'sickbaysave', item: { kind: 'note', id: 'day-' + t, name: 'x' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'sickbaysave', item: { kind: 'note', id: 'n2', name: 'x', date: '2026-02-30' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'sickbaysave', item: { kind: 'note', id: 'n2', name: '' } }).error, 'bad_request');
assert.strictEqual(post({ action: 'sickbayremove', id: 'day-' + t }).error, 'bad_request', 'a day is never removed from the app');
r = post({ action: 'sickbayremove', id: 'n-test-1' });
assert.ok(r.ok); assert.ok(pages[TDS].find(p => txt(p.properties['App ID'].rich_text) === 'n-test-1').in_trash);
assert.ok(post({ action: 'sickbayremove', id: 'n-gone' }).ok, 'removing what is gone is fine');

// ---- 1.45: check mode reads the lines and says how, line by line, and saves nothing
const pagesBefore = JSON.stringify(pages[TDS]);
const chk = (k, lines, check) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: k, action: 'healthput', lines, check }) } }).text);
r = chk(HK, ['steps|4210|' + at(1, '00:00') + '|' + at(1, '23:59'), 'Rhr|61|' + at(0, '07:00') + '|' + at(0, '07:00'), 'sleep|Asleep Deep|' + at(0, '01:00') + '|' + at(0, '01:45'),
  'pulse|60|' + at(0, '08:00') + '|' + at(0, '08:00'), 'hrv|48|' + D(0) + '|' + D(0), 'steps|900|' + at(30, '12:00') + '|' + at(30, '12:30')].join('\n'), 'yes');
assert.ok(r.ok && r.check === true, JSON.stringify(r));
assert.strictEqual(JSON.stringify(pages[TDS]), pagesBefore, 'nothing saved');
assert.deepStrictEqual(r.days, [y, t]);
assert.strictEqual(r.message, 'Check only, nothing saved. Read steps 1, rhr 1, sleep 1, hrv 1 (' + y + ' to ' + t + '). 2 left out: 1 a code it does not know (pulse), 1 older than two weeks. 1 date has no time: turn on Include ISO 8601 Time in the shortcut. Take the check field out to send for real.');
assert.deepStrictEqual(r.lines, ['1: steps 4210 → ' + y, '2: rhr 61 → ' + t, '3: sleep deep 45 min → ' + t, '4: pulse, left out: a code it does not know', '5: hrv 48 → ' + t + ' (no time)', '6: steps, left out: older than two weeks']);
assert.strictEqual(chk(HK, 'nothing|here|at all', true).message, 'Check only, nothing saved. Nothing could be read. 1 left out: 1 no date it could read. Take the check field out to send for real.');
assert.strictEqual(chk('wrong', 'steps|1|' + D(0) + '|' + D(0), 'yes').error, 'unauthorized', 'check mode needs the health key too');
// a real send says when dates came without a time
r = health(HK, 'hrv|50|' + D(0) + '|' + D(0));
assert.strictEqual(r.message, 'Sent 1 day to SICKBAY. 1 date has no time: turn on Include ISO 8601 Time in the shortcut.');

// ---- 1.44.1: a date with no time is that day where you are (it used to land a day early, at midnight in London)
r = health(HK, 'steps|4321|' + D(2) + '|' + D(2));
assert.deepStrictEqual(r.days, [D(2)], JSON.stringify(r));
assert.strictEqual(data(D(2)).steps, 4321);

// ---- 1.44.1: the oldest day of a send (3 days back, so only partly covered) fills gaps, never overwrites a complete day
r = health(HK, 'steps|9000|' + at(3, '00:00') + '|' + at(3, '23:59'));
assert.strictEqual(data(D(3)).steps, 9000, 'a new page is written in full');
r = health(HK, ['steps|1200|' + at(3, '16:00') + '|' + at(3, '23:59'), 'rhr|60|' + at(3, '16:30') + '|' + at(3, '16:30'), 'steps|3100|' + at(0, '00:00') + '|' + at(0, '15:00')].join('\n'));
assert.ok(r.ok, JSON.stringify(r));
assert.deepStrictEqual([data(D(3)).steps, data(D(3)).rhr], [9000, 60], 'the complete count stays; the missing resting heart rate fills in');
assert.strictEqual(data(t).steps, 3100, 'today is replaced as it grows');
r = health(HK, 'steps|1500|' + at(3, '18:00') + '|' + at(3, '23:59'));
assert.ok(r.ok && data(D(3)).steps === 9000, 'nothing new for that day: left alone');
r = health(HK, 'steps|2600|' + at(2, '00:00') + '|' + at(2, '23:59'));
assert.strictEqual(data(D(2)).steps, 2600, 'two days back is whole, and replaced');

// ---- the schema check knows the database; setup reports it
assert.ok(vm.runInContext('schemaSpec_()', ctx).some(s => s.key === 'sickbay'));
assert.ok(/^OK \(4 days, 2 records\)/.test(vm.runInContext('sickbayStatus_()', ctx)), vm.runInContext('sickbayStatus_()', ctx));
console.log('bridge sickbay: OK');
