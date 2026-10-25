// SCIENCE in the bridge (1.34): aircraft within 50 km of the rounded location (adsb.lol, adsb.fi when it doesn't
// answer), distance and bearing worked out here, ground traffic and anything past 50 km left out, cached 8 s;
// orbits (CelesTrak), band conditions (hamqsl XML) and eBird notables (only with EBIRD_API_KEY, its key in a header);
// the Science Log: events between two days, logged once each by Key, checked, starred only in its own database.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = { NOTION_TOKEN: 'ntn_test' }, cache = {};
const DB = '497256af405747a3a9bb064759865cf6', DS = 'ds-sci';
let pages = {}, n = 0, calls = [], lolDown = false, ebirdHeaders = [];
const TLE = { 25544: 'ISS (ZARYA)\n1 25544U 98067A   26298.50000000  .00016717  00000-0  10270-3 0  9993\n2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50377579 12345\n',
  48274: 'CSS (TIANHE)\n1 48274U 21035A   26298.50000000  .00020000  00000-0  23000-3 0  9991\n2 48274  41.4700 100.0000 0005000  90.0000 270.0000 15.60000000 23456\n',
  20580: 'HST\n1 20580U 90037B   26298.50000000  .00001000  00000-0  50000-4 0  9995\n2 20580  28.4700 200.0000 0002500 100.0000 260.0000 15.10000000 34567\n' };
const XML = '<?xml version="1.0"?><solar><solardata><updated> 25 Oct 2026 0300 GMT</updated><solarflux>148</solarflux><sunspots>121</sunspots><kindex>2</kindex><xray>C1.4</xray>' +
  '<calculatedconditions><band name="80m-40m" time="day">Fair</band><band name="80m-40m" time="night">Good</band><band name="12m-10m" time="day">Poor</band></calculatedconditions><signalnoise>S1-S2</signalnoise></solardata></solar>';
const ac = (hex, flight, lat, lon, alt, extra) => Object.assign({ hex, flight: flight + '  ', r: 'N' + hex, t: 'B738', lat, lon, alt_baro: alt, gs: 400.4, track: 255.2, squawk: '4312', category: 'A3', emergency: 'none' }, extra || {});
function fetchMock(url, opts) {
  const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) });
  calls.push(url);
  if (url.indexOf('https://api.adsb.lol/v2/') === 0) {
    if (lolDown) return res(503, 'busy');
    return res(200, { ac: [ac('a1', 'UAL1532', 42.06, -88.00, 36000), ac('a2', 'N172SP', 41.94, -87.92, 2400, { dbFlags: 0 }), ac('a3', 'RCH411', 41.60, -87.95, 28000, { dbFlags: 1, emergency: 'general' }),
      ac('a4', 'GROUND', 41.90, -88.00, 'ground'), ac('a5', 'FAR', 42.60, -88.00, 30000), { hex: 'a6', flight: 'NOPOS' }] });
  }
  if (url.indexOf('https://opendata.adsb.fi/api/v2/') === 0) return res(200, { aircraft: [ac('b1', 'SWA2210', 41.70, -88.10, 23400)] });
  const cat = url.match(/CATNR=(\d+)/); if (cat) return res(200, TLE[cat[1]]);
  if (url === 'https://www.hamqsl.com/solarxml.php') return res(200, XML);
  if (url.indexOf('https://api.ebird.org/') === 0) { ebirdHeaders.push(opts.headers); return res(200, [{ speciesCode: 'snobun', comName: 'Snow Bunting', sciName: 'Plectrophenax nivalis', lat: 42.0, lng: -88.0, obsDt: '2026-10-24 09:30', locName: 'Sample Prairie', howMany: 3, subId: 'S1' }, { speciesCode: 'snobun', comName: 'Snow Bunting', lat: 42.0, lng: -88.0, subId: 'S2' }]); }
  const path = url.replace('https://api.notion.com/v1', ''), m = (opts.method || 'get').toLowerCase(), body = opts.payload ? JSON.parse(opts.payload) : null;
  if (m === 'get' && path === '/databases/' + DB) return res(200, { data_sources: [{ id: DS }] });
  if (m === 'get' && path.indexOf('/databases/') === 0) return res(404, { message: 'Could not find database' });
  if (m === 'post' && path === '/data_sources/' + DS + '/query') return res(200, { results: Object.values(pages).filter(p => !p.in_trash), has_more: false });
  if (m === 'post' && path === '/pages') { const id = ('e' + String(++n).padStart(31, '0')); pages[id] = { id, url: 'u', parent: body.parent, properties: Object.assign({}, body.properties, { Event: { title: [{ plain_text: body.properties.Event.title[0].text.content }] }, Key: { rich_text: [{ plain_text: body.properties.Key.rich_text[0].text.content }] }, Detail: { rich_text: [] } }) }; return res(200, pages[id]); }
  const pm = path.match(/^\/pages\/(.+)$/);
  if (pm) { const p = pages[pm[1]]; if (!p) return res(404, { message: 'nope' }); if (m === 'patch') Object.assign(p.properties, body.properties); return res(200, p); }
  return res(404, { message: 'unexpected ' + m + ' ' + url });
}
const ctx = {
  console: { log: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d, tz, f) => f === 'yyyy-MM' ? '2026-10' : f === 'yyyy-MM-dd' ? new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10) : f === "yyyy-MM-dd'T'HH:mm:ss" ? new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 19) : d.toISOString().slice(0, 16).replace('T', ' '), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch: fetchMock },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);

const caps = get({ action: 'ping', key }).capabilities;
assert.ok(caps.includes('science') && caps.includes('sciencelog'));
assert.ok(vm.runInContext('BRIEF_RULES', ctx).includes('SKY (a visible space station pass tonight'), 'the briefing may mention the sky');

// aircraft: rounded location, 50 km, ground and out-of-range left out, distance and bearing from here
calls = [];
const s1 = get({ action: 'sky', key, lat: '41.90123', lon: '-88.00456' });
assert.ok(s1.ok, JSON.stringify(s1)); assert.strictEqual(s1.source, 'adsb.lol');
assert.ok(calls[0].startsWith('https://api.adsb.lol/v2/lat/41.9/lon/-88/dist/27'), calls[0]);
assert.deepStrictEqual(s1.aircraft.map(a => a.cs), ['N172SP', 'UAL1532', 'RCH411'], 'nearest first; ground, too far and no position left out');
const ual = s1.aircraft.find(a => a.cs === 'UAL1532'), rch = s1.aircraft.find(a => a.cs === 'RCH411');
assert.ok(Math.abs(ual.km - 17.8) < 0.3 && ual.dir === 0, JSON.stringify(ual));
assert.ok(rch.mil && rch.emergency === 'general' && rch.dir > 170 && rch.dir < 190, JSON.stringify(rch));
assert.strictEqual(ual.gs, 400); assert.strictEqual(ual.track, 255); assert.strictEqual(ual.reg, 'Na1');
calls = []; get({ action: 'sky', key, lat: '41.90123', lon: '-88.00456' }); assert.strictEqual(calls.length, 0, 'cached a few seconds');
lolDown = true; delete cache['sky:41.9:-88'];
const s2 = get({ action: 'sky', key, lat: 41.9, lon: -88 });
assert.ok(s2.ok && s2.source === 'adsb.fi' && s2.aircraft[0].cs === 'SWA2210', 'the second network when the first is down');
lolDown = false;
assert.strictEqual(get({ action: 'sky', key, lat: 'x', lon: 1 }).error, 'bad_request');
assert.strictEqual(get({ action: 'sky', key, lat: 95, lon: 1 }).error, 'bad_request');

// the slow feeds: orbits, band conditions; eBird only with a key, the key in a header (never the URL)
let f = get({ action: 'sciencefeeds', key, lat: 41.9, lon: -88 });
assert.deepStrictEqual(Object.keys(f.tle), ['iss', 'css', 'hst']);
assert.ok(f.tle.iss.l1.startsWith('1 25544U') && f.tle.iss.l2.startsWith('2 25544') && f.tle.css.name === 'Tiangong');
assert.strictEqual(f.bands.flux, '148'); assert.strictEqual(f.bands.xray, 'C1.4');
assert.deepStrictEqual(f.bands.bands[1], { name: '80m-40m', time: 'night', cond: 'Good' });
assert.ok(!f.birds && f.ebird === false, 'no eBird without a key');
props.EBIRD_API_KEY = 'ebird-test-key';
f = get({ action: 'sciencefeeds', key, lat: 41.9, lon: -88 });
assert.strictEqual(f.birds.length, 1, 'one line per species'); assert.strictEqual(f.birds[0].name, 'Snow Bunting'); assert.strictEqual(f.birds[0].count, 3);
assert.strictEqual(ebirdHeaders[0]['X-eBirdApiToken'], 'ebird-test-key');
assert.ok(!calls.some(u => u.includes('ebird-test-key')), 'the key never in a URL');

// the Science Log
const ev = (k, extra) => Object.assign({ key: k, at: '2026-10-24T20:42:00.000Z', dept: 'sky', kind: 'station', title: 'ISS visible pass, 67° high', detail: 'NNE, 19:42 to 19:48', value: 67 }, extra || {});
let a = post({ key, action: 'sciencelogadd', events: [ev('pass:iss:2026-10-24T19:42'), ev('eq:us7000abcd', { dept: 'earth', kind: 'quake', title: 'M 2.6 earthquake 214 km south', value: 2.6 })] });
assert.ok(a.ok && a.added.length === 2 && a.skipped.length === 0, JSON.stringify(a));
const p1 = pages[a.added[0].id].properties;
assert.deepStrictEqual(p1.When.date, { start: '2026-10-24T15:42:00', time_zone: 'America/Chicago' });
assert.strictEqual(p1.Department.select.name, 'Sky'); assert.strictEqual(p1.Kind.select.name, 'Space Station'); assert.strictEqual(p1.Value.number, 67); assert.strictEqual(p1.Starred.checkbox, false);
a = post({ key, action: 'sciencelogadd', events: [ev('pass:iss:2026-10-24T19:42'), ev('ac:ae1234:2026-10-24', { kind: 'aircraft', title: 'RCH411 over, 28,000 ft', starred: true })] });
assert.ok(a.added.length === 1 && a.skipped.length === 1 && a.skipped[0].key === 'pass:iss:2026-10-24T19:42', 'logged once');
assert.strictEqual(pages[a.added[0].id].properties.Starred.checkbox, true);
assert.strictEqual(post({ key, action: 'sciencelogadd', events: [ev('bad key!')] }).error, 'bad_request');
assert.strictEqual(post({ key, action: 'sciencelogadd', events: [ev('k:1', { dept: 'kitchen' })] }).error, 'bad_request');
assert.strictEqual(post({ key, action: 'sciencelogadd', events: [ev('k:1', { kind: 'ufo' })] }).error, 'bad_request');
assert.strictEqual(post({ key, action: 'sciencelogadd', events: new Array(26).fill(0).map((_, i) => ev('k:' + i)) }).error, 'bad_request');
const lg = get({ action: 'sciencelog', key, from: '2026-10-01', to: '2026-10-31' });
assert.strictEqual(lg.events.length, 3); assert.ok(lg.events.some(e => e.dept === 'earth' && e.kind === 'quake' && e.value === 2.6));
assert.strictEqual(get({ action: 'sciencelog', key, from: '2026-10-31', to: '2026-10-01' }).error, 'bad_request');
// star: only Science Log pages
const sid = a.added[0].id;
assert.ok(post({ key, action: 'sciencestar', id: sid, starred: false }).ok); assert.strictEqual(pages[sid].properties.Starred.checkbox, false);
const other = Object.keys(pages)[0]; pages[other].parent = { data_source_id: 'ds-tasks' };
assert.strictEqual(post({ key, action: 'sciencestar', id: other, starred: true }).error, 'not_writable');
assert.strictEqual(post({ key, action: 'sciencestar', id: 'nope', starred: true }).error, 'not_writable');
console.log('ALL SCIENCE CHECKS PASSED');
