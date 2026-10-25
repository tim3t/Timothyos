// SCIENCE (2.42, bridge 1.34; simulated on :8105, every public feed stubbed): the Bridge's SCIENCE line (a nearby
// quake); SKY TRAFFIC with aircraft from the bridge on the scope and in a list, routes from adsbdb, a detail card;
// visible ISS passes worked out on the iPad from a real orbit; the event log (military and low aircraft, a storm, a
// flare, a quake, an alert, a close asteroid) reaching the Science Log once each, a reload sending nothing twice;
// ☆ stars one in Notion; the other departments; ASTROMETRICS' SCIENCE row and starred events on its key-date line;
// Systems' SCIENCE section turns the line off; COMPUTER finds it. Landmarks (2.43): suggested once from OpenStreetMap
// (a few, spread out), muted under the aircraft, "near" wording, a toggle, and the list edited in Systems; kept only
// on the iPad, never sent to the bridge. Invented aircraft, events and places throughout.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=scimode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=scistats').then(r => r.json());
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 200)); } };
const NOW = Date.parse('2026-10-24T19:30:00-05:00'), T0 = Date.parse('2026-10-25T00:00:00Z'), iso = ms => new Date(ms).toISOString();
const SEED = ['eq:old1', 'moon:full:2026-08-28', 'met:Perseids:2026'], mine = evs => evs.filter(e => !SEED.includes(e.key));
const kp = [[-27, 2.33], [-24, 3], [-21, 5.33], [-18, 4.67], [-15, 3.67], [-12, 3], [-9, 2.67], [-6, 3], [-3, 3.33]].map(([h, v]) => ({ time_tag: iso(T0 + h * 3600e3).slice(0, 19), Kp: v, a_running: 9, station_count: 8 }));
const kpf = kp.map(r => ({ time_tag: r.time_tag, kp: r.Kp, observed: 'observed', noaa_scale: null })).concat([3, 6, 9, 12, 15].map((h, i) => ({ time_tag: iso(T0 + h * 3600e3).slice(0, 19), kp: [3.67, 4, 3.33, 2.67, 2][i], observed: 'predicted', noaa_scale: null })));
const quake = (id, mag, lat, lon, ago, place) => ({ id, properties: { mag, place, time: NOW - ago * 3600e3, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id }, geometry: { coordinates: [lon, lat, 8] } });
const FEEDS = {
  'services.swpc.noaa.gov/products/noaa-planetary-k-index.json': kp,
  'services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json': kpf,
  'services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json': [{ begin_time: '2026-10-23T14:02:00Z', max_time: '2026-10-23T14:11:00Z', max_class: 'M1.2' }, { begin_time: '2026-10-24T03:32:00Z', max_time: '2026-10-24T03:53:00Z', max_class: 'C3.4' }],
  'services.swpc.noaa.gov/json/f107_cm_flux.json': [{ time_tag: '2026-10-24T20:00:00', flux: 91 }, { time_tag: '2026-10-23T20:00:00', flux: 140 }],
  'earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=40': { features: [quake('us7000tst1', 4.2, 44.0, -93.5, 3, '12 km N of Testville, MN'), quake('us7000tst2', 2.1, 45.6, -94.1, 30, 'Somewhere quiet')] },
  'earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=10': { features: [quake('us7000big1', 6.4, -20, -70, 50, 'off the coast of Testland')] },
  'api.weather.gov/alerts/active': { features: [{ properties: { id: 'urn:oid:2.49.0.1.840.0.test1', event: 'Frost Advisory', headline: 'Frost Advisory until 9 AM CDT Sunday', severity: 'Minor', sent: '2026-10-24T14:00:00-05:00', ends: '2026-10-25T09:00:00-05:00' } }] },
  'air-quality-api.open-meteo.com': { current: { us_aqi: 42, pm2_5: 6.5, ozone: 73, uv_index: 0 } },
  'api.nasa.gov/neo': { near_earth_objects: { '2026-10-26': [{ id: '3999001', name: '(2026 TA1)', is_potentially_hazardous_asteroid: false, estimated_diameter: { meters: { estimated_diameter_min: 20, estimated_diameter_max: 40 } }, close_approach_data: [{ epoch_date_close_approach: Date.parse('2026-10-26T04:00:00Z'), miss_distance: { lunar: '0.74' } }] }],
    '2026-10-27': [{ id: '3999002', name: '2026 TB2', is_potentially_hazardous_asteroid: true, estimated_diameter: { meters: { estimated_diameter_min: 300, estimated_diameter_max: 500 } }, close_approach_data: [{ epoch_date_close_approach: Date.parse('2026-10-27T11:00:00Z'), miss_distance: { lunar: '12.3' } }] }] } },
  'api.inaturalist.org': { results: [{ observed_on: '2026-10-23', place_guess: 'Test Park', taxon: { id: 1, name: 'Sciurus niger', preferred_common_name: 'Fox Squirrel', iconic_taxon_name: 'Mammalia' } }, { observed_on: '2026-10-22', place_guess: 'Test Creek', taxon: { id: 2, name: 'Ardea herodias', preferred_common_name: 'Great Blue Heron', iconic_taxon_name: 'Aves' } }] },
  'api.wheretheiss.at': { latitude: -33.97, longitude: -62.27, altitude: 425.4, velocity: 27571, visibility: 'eclipsed' },
  'api.adsbdb.com/v0/callsign/TST101': { response: { flightroute: { callsign: 'TST101', airline: { name: 'Test Air' }, origin: { iata_code: 'MSP', name: 'Minneapolis-St Paul' }, destination: { iata_code: 'DEN', name: 'Denver' } } } },
  'overpass-api.de/api/interpreter': { elements: [
    { type: 'node', id: 1, lat: 45.03, lon: -93.39, tags: { name: 'Testburg', place: 'city', population: '300000' } },
    { type: 'node', id: 2, lat: 44.98, lon: -93.04, tags: { name: 'Riverton', place: 'town', population: '20,000' } },
    { type: 'node', id: 3, lat: 44.79, lon: -93.57, tags: { name: 'Oakfield', place: 'town', population: '5000' } },
    { type: 'node', id: 4, lat: 45.23, lon: -93.65, tags: { name: 'Pinecrest', place: 'village', population: '800' } },
    { type: 'node', id: 5, lat: 45.0, lon: -93.0, tags: { name: 'Littleton', place: 'village', population: '300' } },
    { type: 'node', id: 6, lat: 44.985, lon: -93.27, tags: { name: 'Centreville', place: 'village' } },
    { type: 'node', id: 7, lat: 44.9, lon: -93.1, tags: { place: 'hamlet' } },
    { type: 'way', id: 8, center: { lat: 44.845, lon: -93.27 }, tags: { name: 'Test International', aeroway: 'aerodrome', iata: 'TST', icao: 'KTST' } },
    { type: 'way', id: 9, center: { lat: 44.846, lon: -93.268 }, tags: { aeroway: 'runway', ref: '12/30' } },
    { type: 'node', id: 10, lat: 45.3, lon: -93.25, tags: { name: 'Grass Strip', aeroway: 'aerodrome' } },
    { type: 'node', id: 11, lat: 44.9, lon: -93.4, tags: { name: 'Private Field', aeroway: 'aerodrome', access: 'private' } }] },
  'geocoding-api.open-meteo.com': { results: [
    { name: 'Water Tower Hill', latitude: 45.06, longitude: -93.12, feature_code: 'HLL', admin1: 'Minnesota', admin2: 'Test County' },
    { name: 'Water Tower Hill', latitude: 40.1, longitude: -90.1, feature_code: 'HLL', admin1: 'Illinois' }] },
  'api.adsbdb.com/v0/aircraft/a1b2c3': { response: { aircraft: { type: '737-800', manufacturer: 'Boeing', registered_owner: 'Test Air', registered_owner_country_name: 'United States' } } }
};
const hits = {};

(async () => {
  await mode('cap=1&log=1&birds=0&fail=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.route(u => !/^http:\/\/(localhost|127\.0\.0\.1)/.test(u.href), route => {
    const u = route.request().url(), k = Object.keys(FEEDS).find(x => u.includes(x));
    if (!k) return route.abort();
    hits[k] = (hits[k] || 0) + 1;
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(FEEDS[k]) });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const toBridge = []; p.on('request', r => { if (r.url().includes(':8105/')) toBridge.push(r.url() + ' ' + (r.postData() || '')); });
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 44.9, longitude: -93.3 });
  await p.clock.setFixedTime(new Date(NOW));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); localStorage.setItem('tos.place.v1', JSON.stringify({ lat: 44.98, lon: -93.27 })); }, [K, U]);
  await p.reload();

  // ---- the Bridge: one SCIENCE line, never a Condition item; a light read only (no aircraft, no air quality)
  await p.waitForSelector('.sci-line', { timeout: 15000 });
  assert.strictEqual(await txt(p, '.sci-line'), 'SCIENCE · EARTH M 4.2 earthquake 110 km S · 16:30 · 12 km N of Testville, MN');
  assert.ok(!/SCIENCE|quake/i.test(await txt(p, '.ov-cond')), 'Condition never counts SCIENCE');
  assert.ok(!hits['air-quality-api.open-meteo.com'] && !hits['api.inaturalist.org'] && !(await stats()).sky, 'away from the station: only the light read');

  // ---- SCIENCE opens on SKY TRAFFIC
  await p.click('.sci-line'); await p.waitForSelector('.sci-scope svg');
  assert.strictEqual(await txt(p, '#title'), 'SENSORS');
  await p.waitForFunction(() => /3 AIRCRAFT IN RANGE/.test(document.querySelector('#eyebrow').textContent), null, { timeout: 8000 });
  assert.strictEqual(await txt(p, '#eyebrow'), 'SCIENCE · SKY TRAFFIC · 3 AIRCRAFT IN RANGE');
  assert.strictEqual(await p.$$eval('.sci-scope g.ac', e => e.length), 3);
  assert.ok(await p.$('.sci-scope g.ac.mil') && await p.$('.sci-scope g.ac.low'));
  await p.waitForFunction(() => /MSP → DEN/.test(document.querySelector('.sci-rows').textContent), null, { timeout: 8000 });
  const rows = await p.$$eval('.sci-sky .sci-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(rows[0].startsWith('N42JB') && rows[0].includes('1,500 FT6 km SE'), rows[0]);
  assert.ok(rows[1].startsWith('TST101 · Test Air') && rows[1].includes('B738 · MSP → DEN') && rows[1].includes('34,000 FT12 km WNW'), rows[1]);
  assert.ok(rows[2].startsWith('RCH411 · Military'), rows[2]);
  await p.click('.sci-row[data-sciac="a1b2c3"]');
  await p.waitForFunction(() => /Boeing 737-800/.test((document.querySelector('.sci-detail h3') || {}).textContent || ''), null, { timeout: 8000 });
  const det = await txt(p, '#sciSky .sci-detail');
  assert.ok(det.includes('ROUTE Minneapolis-St Paul (MSP) → Denver (DEN)') && det.includes('NOW 34,000 ft · 452 kt · heading 75° · 12 km WNW') && det.includes('TRACK LIVE'), det);
  await p.click('g[data-sciac="a1b2c3"] .tap', { position: { x: 6, y: 6 } });   // on the scope too, on the plane's own tap ring: again closes the card
  assert.strictEqual(await p.$('#sciSky .sci-detail'), null);

  // ---- landmarks: suggested once from OpenStreetMap, a few and spread out, muted under the aircraft
  await p.waitForSelector('.sci-scope g.lm', { timeout: 8000 });
  const lms = await p.$$eval('.sci-scope g.lm', els => els.map(e => e.textContent));
  assert.deepStrictEqual(lms, ['Test International', 'Grass Strip', 'Testburg', 'Oakfield', 'Riverton', 'Pinecrest'], lms.join('|'));   // airports first; no village 4 km from Riverton, nothing at the centre, no private field
  assert.strictEqual(await p.getAttribute('g[data-scilm="w8"] line', 'transform'), 'rotate(120)', 'the runway at its heading');
  assert.ok(await p.$('g[data-scilm="n1"] path') && !(await p.$('g[data-scilm="n10"] line')), 'a town is a diamond; an airfield without a runway is a plain circle');
  assert.ok(await p.evaluate(() => { const g = [...document.querySelectorAll('.sci-scope svg > *')]; return g.findIndex(x => x.matches('g.lms')) < g.findIndex(x => x.matches('g.ac')); }), 'drawn under the aircraft');
  await p.waitForFunction(() => /near Testburg/.test(document.querySelector('.sci-row[data-sciac="a1b2c3"]').textContent), null, { timeout: 12000 });
  await p.click('.sci-row[data-sciac="a1b2c3"]');
  assert.ok((await txt(p, '#sciSky .sci-detail')).includes('NEAR 1 km WNW of Testburg'));
  await p.click('.sci-row[data-sciac="a1b2c3"]');
  await p.click('g[data-scilm="n2"] .tap');
  assert.strictEqual(await txt(p, '.sci-lmsel'), 'Riverton · town · 18 km E of home');
  await p.click('[data-scilmt]');   // off: no marks, no "near"
  assert.strictEqual(await p.$('.sci-scope g.lm'), null);
  assert.ok(!(await txt(p, '.sci-rows')).includes('near '));
  await p.click('[data-scilmt]');
  assert.strictEqual(await p.$$eval('.sci-scope g.lm', e => e.length), 6);
  assert.strictEqual(hits['overpass-api.de/api/interpreter'], 1, 'asked once');
  // visible passes from the real orbit: mornings this week, low in the north
  await p.waitForSelector('.sci-passes tbody tr', { timeout: 15000 });
  const pass = await txt(p, '.sci-passes tbody tr:first-child');
  assert.ok(/^ISS (Low, \d+° up|Bright, easy to see) (SUN|MON|TUE|WED|THU) \d\d \d\d:\d\d [NESW]{1,3} \d+° [NESW]{1,3} [NESW]{1,3} \d\d:\d\d \d+ min$/.test(pass), pass);
  const issNow = (await p.$$eval('.sci-detail', els => els.map(e => e.textContent))).find(t => t.startsWith('ISS NOW'));
  assert.ok(issNow && issNow.includes('425 KM UP') && issNow.includes("27,571 km/h · in Earth's shadow · next visible here " + pass.match(/ (SUN|MON|TUE|WED|THU) /)[1] + ' at ' + pass.match(/ \d\d (\d\d:\d\d)/)[1]), issNow);
  await p.screenshot({ path: D + 'science-sky.png', fullPage: true });

  // ---- the event log: once each in Notion
  const want = ['ac:ae0f11:2026-10-24', 'ac:a7c0de:2026-10-24', 'eq:us7000tst1', 'eq:us7000big1', 'nws:', 'neo:3999001:2026-10-25', 'flare:20261023T140200', 'kp:20261024T030000'];
  await until(async () => { const ks = (await stats()).events.map(e => e.key); return want.every(w => ks.some(k => k.startsWith(w))); });
  const st = await stats();
  assert.ok(!st.events.some(e => e.key === 'eq:us7000tst2'), 'small and far: not logged');
  assert.ok(!st.events.some(e => e.key.startsWith('neo:3999002')), 'a distant asteroid is not an event');
  assert.ok(!st.events.some(e => e.key.startsWith('ac:a1b2c3')), 'an ordinary airliner is not an event');
  const mil = st.events.find(e => e.key === 'ac:ae0f11:2026-10-24');
  assert.strictEqual(mil.title, 'RCH411, military, at 21,000 ft'); assert.strictEqual(mil.dept, 'sky'); assert.strictEqual(mil.kind, 'aircraft');
  assert.strictEqual(st.events.find(e => e.key === 'kp:20261024T030000').title, 'Geomagnetic storm G1 (Kp 5.33)');
  const nAdded = mine(st.events).length;
  assert.ok((await txt(p, '.sci-log')).includes('RCH411, military, at 21,000 ft'));

  // ☆ stars one, in Notion
  await p.click('[data-scistar="ac:ae0f11:2026-10-24"]');
  await until(async () => (await stats()).events.find(e => e.key === 'ac:ae0f11:2026-10-24').starred === true);
  assert.strictEqual(await p.getAttribute('[data-scistar="ac:ae0f11:2026-10-24"]', 'aria-pressed'), 'true');

  // a reload sends nothing twice
  await p.reload(); await p.waitForSelector('.sci-line');
  await new Promise(r => setTimeout(r, 2500));
  assert.strictEqual(mine((await stats()).events).length, nAdded, 'no duplicates');

  // ---- the other departments
  await p.click('.sci-line'); await p.waitForSelector('.sci-tile');
  await p.click('[data-scitab="space"]'); await p.waitForSelector('.sci-kp i');
  // every Kp bar stays inside its chart (the current one once picked up the Today timeline's .now line: 2.42.1)
  const kpOut = await p.$$eval('.sci-kp i', (els) => { const box = els[0].parentElement.getBoundingClientRect(); return els.filter(e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).position !== 'static' || r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1; }).length; });
  assert.strictEqual(kpOut, 0, 'Kp bars stay in the chart');
  assert.strictEqual(await p.$$eval('.sci-kp i.kp-now', e => e.length), 1);
  const sp = await txt(p, '.sci-panel');
  assert.ok(sp.includes('Kp 3.3QUIET') && sp.includes('it needs about Kp 7 at your latitude; tonight\'s forecast peaks at Kp 4') && sp.includes('SOLAR FLUX 91 sfu') && sp.includes('M1.2 FRI 09:11'), sp);
  assert.strictEqual(await p.$$eval('.sci-bands tbody tr', e => e.length), 4);
  assert.strictEqual(await txt(p, '#eyebrow'), 'SCIENCE · SPACE WEATHER');
  await p.click('[data-scievf="one"]');
  const evs = await p.$$eval('.sci-ev b', e => e.map(x => x.textContent));
  assert.ok(evs.length === 2 && evs.every(t => /solar flare|Geomagnetic storm/.test(t)), evs.join('|'));
  await p.click('[data-scievf="all"]');
  await p.click('[data-scitab="earth"]'); await p.waitForSelector('.sci-aq');
  const ea = await txt(p, '.sci-panel');
  assert.ok(ea.includes('M 4.2 · 110 km S') && ea.includes('Frost Advisory') && /42\s?US AQI · GOOD/.test(ea), ea);
  await p.click('[data-scitab="night"]'); await p.waitForSelector('.sci-moon');
  const ni = await txt(p, '.sci-panel');
  assert.ok(/Waxing gibbous \d+% lit/.test(ni) && ni.includes('2026 TA1') && ni.includes('0.7 LD') && ni.includes('METEORS Leonids, peak TUE 17 NOV'), ni);
  await p.screenshot({ path: D + 'science-night.png', fullPage: true });
  await p.click('[data-scitab="nature"]'); await p.waitForSelector('.sci-panel .stubbox');
  const na = await txt(p, '.sci-panel');
  assert.ok(na.includes('EBIRD_API_KEY') && na.includes('Fox Squirrel') && na.includes('Great Blue Heron'), na);
  // tapping SCIENCE again: back to SKY TRAFFIC
  await p.click('#allBtn'); await p.click('[data-station="science"]');
  assert.ok((await txt(p, '#eyebrow')).startsWith('SCIENCE · SKY TRAFFIC'));

  // ---- ASTROMETRICS: the SCIENCE row, and starred events on the key-date line
  await p.click('#allBtn'); await p.click('[data-station="astrometrics"]'); await p.waitForSelector('#asChart');
  await p.waitForSelector('.as-rowlab[data-asrow="science"]', { timeout: 10000 });
  await p.click('.as-rowlab[data-asrow="science"]');
  await p.waitForFunction(() => /events logged by SCIENCE/.test((document.querySelector('.as-facts') || {}).textContent || ''), null, { timeout: 8000 });
  const fa = await txt(p, '.as-facts');
  assert.ok(fa.startsWith("10 events logged by SCIENCE") && fa.includes("sky traffic 2") && fa.includes("3 starred") && fa.includes('starred'), fa);
  const kdW = await p.$$eval('.as-kd', e => e.map(x => x.dataset.askd));
  let found = '';
  for (const w of kdW) { await p.click('[data-askd="' + w + '"]'); const t = await txt(p, '#asReadout'); if (t.includes('★ M 3.1 earthquake')) found = t; }
  assert.ok(found, 'a starred event on the key-date line');

  // ---- Systems: the section, and the line turned off
  await p.click('#status'); await p.waitForSelector('#sec-science');
  const sec = await txt(p, '#sec-science');
  assert.ok(sec.startsWith('SCIENCE FREE PUBLIC FEEDS') && sec.includes('all in Notion') && sec.includes('Optional: add EBIRD_API_KEY'), sec);
  await p.click('#sec-science [data-act="sciline"]');
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  await new Promise(r => setTimeout(r, 500));
  assert.strictEqual(await p.$('.sci-line'), null, 'line off');

  // ---- Systems: the landmarks, edited on this iPad
  await p.click('#status'); await p.waitForSelector('#sec-science');
  const secL = await txt(p, '#sec-science'); assert.ok(secL.includes('Landmarks on the scope 6 shown. Kept only on this iPad.'), secL);
  await p.click('[data-scilmact="edit"]'); await p.waitForSelector('.lm-edit');
  assert.strictEqual(await p.$$eval('.lm-row', e => e.length), 6);
  await p.fill('[data-scilmname="n2"]', 'River Town'); await p.dispatchEvent('[data-scilmname="n2"]', 'change');
  await p.click('[data-scilmhide="n3"]');
  await p.fill('#lmHome', 'Juniper Hill'); await p.dispatchEvent('#lmHome', 'change');
  await p.fill('#lmFind', 'Water Tower Hill'); await p.click('[data-scilmact="find"]');
  await p.waitForSelector('[data-scilmadd]');
  assert.strictEqual(await p.$$eval('[data-scilmadd]', e => e.length), 1, 'only places within 50 km');
  assert.strictEqual(await txt(p, '[data-scilmadd="0"]'), '+ Water Tower Hill · Test County · 15 km NE');
  await p.click('[data-scilmadd="0"]');
  await p.fill('#lmFind', '44.6, -93.27'); await p.keyboard.press('Enter');
  await p.click('[data-scilmact="here"]');
  await p.waitForFunction(() => document.querySelectorAll('.lm-row').length === 9, null, { timeout: 5000 });
  const names = await p.$$eval('.lm-name', e => e.map(x => x.value));
  assert.deepStrictEqual(names.slice(6), ['Water Tower Hill', 'My place', 'My place']);
  const dels = await p.$$('[data-scilmdel]'); assert.strictEqual(dels.length, 3, 'only your own can be removed'); await dels[2].click();
  assert.strictEqual(await p.$$eval('.lm-row', e => e.length), 8);
  await p.click('[data-scilmact="suggest"]');
  await p.waitForFunction(() => !/Finding/.test(document.querySelector('.lm-edit').textContent), null, { timeout: 5000 });
  assert.strictEqual(hits['overpass-api.de/api/interpreter'], 2);
  assert.strictEqual(await p.$$eval('.lm-row', e => e.length), 8, 'your own kept');
  assert.strictEqual(await p.inputValue('[data-scilmname="n2"]'), 'River Town', 'a rename kept');
  assert.strictEqual(await p.getAttribute('[data-scilmhide="n3"]', 'aria-pressed'), 'false', 'a hidden one stays hidden');
  await p.click('[data-scilmact="done"]');
  // back on the scope
  await p.click('#allBtn'); await p.click('[data-station="science"]'); await p.waitForSelector('.sci-scope g.lm');
  const lms2 = await p.$$eval('.sci-scope g.lm', els => els.map(e => e.textContent));
  assert.ok(lms2.includes('River Town') && !lms2.includes('Oakfield') && lms2.includes('Water Tower Hill') && lms2.length === 7, lms2.join('|'));
  assert.strictEqual(await p.$$eval('.sci-scope g.lm rect', e => e.length), 2, 'a found hill and your place: squares');
  await p.click('g[data-scilm="n2"] .tap');
  assert.strictEqual(await txt(p, '.sci-lmsel'), 'River Town · town · 18 km E of Juniper Hill');
  await (await p.$('.sci-scope')).screenshot({ path: D + 'science-landmarks.png' });
  // privacy: on this iPad and in backups only; nothing about them reached the bridge
  assert.ok(await p.evaluate(() => /River Town/.test(localStorage.getItem('tos.scilm.v1'))));
  assert.ok(!toBridge.some(x => /Testburg|Riverton|River Town|Juniper|Water Tower|scilm/.test(x)), 'never sent to the bridge');
  assert.ok(!(await stats()).events.some(e => /Testburg|Riverton|River Town/.test(e.title + e.detail)), 'never in the Science Log');

  // ---- COMPUTER
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'iss');
  const found2 = await txt(p, '#cmdList');
  assert.ok(found2.includes('When is the ISS overhead?'), found2);
  await p.keyboard.press('Escape');

  await mode('cap=0&log=0&fail=0');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await mode('cap=0&log=0&fail=0').catch(() => {}); console.error(e); process.exit(1); });
