// MORNING BRIEFING, SMARTER (2.56, bridge 1.37; simulated on :8105, invented hives and headlines): the hive rhythm.
// Checks every so many days by season (APIARY → THIS YEAR → CHECK RHYTHM), counted from the newest check on any hive.
// On a rest day the briefing is told the rhythm and that nothing is due, without the weather's hive window, and the
// Bridge shows HIVE CHECK · NEXT ~date, REST. When a check is due, the window comes back (or, in winter, an outside look).
// Upkeep that is due reaches the briefing. NEWS: the two newest NPR headlines, added after Claude's paragraphs exactly
// as written, with links, never sent to Claude; NO HEADLINES in SYSTEMS turns them off; a feed that fails costs nothing.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = (a, q) => fetch(B + '&action=' + a + '&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=briefstats').then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date()), plus = n => ymdIn(new Date(Date.parse(TODAY + 'T12:00:00Z') + n * 864e5));
function weather() {
  const days = [TODAY, plus(1), plus(2)], h = { time: [], temperature_2m: [], precipitation_probability: [], wind_speed_10m: [], weather_code: [] };
  days.forEach(d => { for (let hr = 0; hr < 24; hr++) { h.time.push(d + 'T' + String(hr).padStart(2, '0') + ':00'); h.temperature_2m.push(hr >= 11 && hr < 16 ? 66 : 48); h.precipitation_probability.push(5); h.wind_speed_10m.push(5); h.weather_code.push(1); } });
  return { current: { temperature_2m: 48, weather_code: 1, wind_speed_10m: 5 }, hourly: h,
    daily: { time: days, temperature_2m_max: [66, 64, 62], temperature_2m_min: [40, 41, 42], sunrise: days.map(d => d + 'T07:02'), sunset: days.map(d => d + 'T17:01'), precipitation_probability_max: [5, 5, 5] } };
}
const reset = () => Promise.all([mode('briefmode', 'cap=0&fail=0&shape=0'), mode('apmode', 'on=0'), mode('newsmode', 'cap=0&fail=0')]);

(async () => {
  await mode('briefmode', 'cap=1&fail=0&shape=0&reset=1'); await mode('apmode', 'on=1'); await mode('newsmode', 'cap=1&fail=0&reset=1'); await mode('voicemode', 'cap=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  await ctx.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(weather()) }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(TODAY + 'T07:30:00-06:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.place.v1', JSON.stringify({ lat: 44.98, lon: -93.27 }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'apiary']));
    localStorage.setItem('tos.hiverhythm.v1', JSON.stringify({ active: 30, shoulder: 30, winter: 30 }));   // newest check 20 days ago: next due in 10
    localStorage.setItem('tos.upkeep.v1', JSON.stringify([{ id: 'u1', name: 'Sample filter', cat: 'House', every: 1, unit: 'months', last: '2020-01-01' }, { id: 'u2', name: 'Sample gutters', cat: 'House', every: 1, unit: 'years', last: '2099-01-01' }]));
  }, [K, U]);
  await p.reload();

  // ---- a rest day: the rhythm goes to Claude, the hive window doesn't
  let s = await until(async () => { const x = await stats(); return x.n === 1 && x; });
  const last = (await mode('apstats', '')).checks.map(c => c.day).sort().pop(), ago = Math.round((Date.parse(TODAY) - Date.parse(last)) / 864e5);   // tests before this one may have logged a check
  assert.ok(ago < 14, 'a recent check to count from: ' + last);
  assert.ok(s.ctx.includes('HIVES: last checked ' + last + ' (' + ago + (ago === 1 ? ' day' : ' days') + ' ago)'), s.ctx.split('\n').filter(l => /HIVE/.test(l)).join(' | '));
  assert.ok(s.ctx.includes('next due about ' + plus(30 - ago) + '. Nothing to do for the hives today.'));
  assert.ok(!/hive check (GO|HOLD)|Best window/i.test(s.ctx), 'no hive window on a rest day');
  assert.ok(/UPKEEP DUE: Sample filter \(House\), \d+ days over/.test(s.ctx) && !s.ctx.includes('Sample gutters'), 'what is due, only');
  assert.ok(!s.ctx.includes('Sample council') && !s.ctx.includes('NPR'), 'headlines never go to Claude');
  // NEWS: after Claude's paragraphs, as NPR wrote them, with links
  await p.waitForSelector('#brPaper'); await p.click('#brPaper'); await p.waitForTimeout(300);
  const paper = await txt(p, '#brPaper');
  assert.ok(paper.includes('NEWS · NPR. Sample council approves the new river crossing. Sample storm brings early snow to the plains.'), paper);
  assert.ok(!paper.includes('A third sample headline'), 'two headlines');
  assert.deepStrictEqual(await p.$$eval('.br-news a', n => n.map(a => [a.textContent, a.href, a.target])), [
    ['Sample council approves the new river crossing', 'https://www.npr.org/2026/11/02/1/sample-crossing', '_blank'],
    ['Sample storm brings early snow to the plains', 'https://www.npr.org/2026/11/02/2/sample-snow', '_blank']]);
  // the Bridge: next check, at rest
  const env = await txt(p, '.ov-envrow:has-text("HIVE CHECK")');
  assert.ok(/HIVE CHECK · NEXT ~\d\d [A-Z]{3}/.test(env) && env.includes('REST') && !env.includes('GO'), env);
  await p.screenshot({ path: D + 'e67-brief-rest.png', fullPage: true });

  // ---- APIARY: the rhythm editor (this season's row)
  await p.click('[data-screen="apiary"].nav'); await p.waitForSelector('.ap-yard');
  assert.ok((await txt(p, '.ap-quiet')).includes('NEXT CHECK ~'));
  await p.click('#apYear summary'); await p.waitForSelector('.ap-rhythm');
  assert.strictEqual(await p.locator('.ap-rrow.ap-rnow').count(), 1);
  await p.click('.ap-rrow.ap-rnow [data-aprhythm$=":-1"]'); await p.waitForTimeout(150);
  const R = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hiverhythm.v1')));
  assert.strictEqual(Object.values(R).filter(v => v === 28).length, 1, '30 down to 28, this season only: ' + JSON.stringify(R));
  assert.ok((await txt(p, '.ap-rrow.ap-rnow')).includes('28 DAYS'));
  await p.click('.ap-rrow.ap-rnow [data-aprhythm$=":1"]'); await p.waitForTimeout(150);
  assert.ok((await txt(p, '.ap-rrow.ap-rnow')).includes('35 DAYS'), 'by weeks above three');
  await p.screenshot({ path: D + 'e67-apiary-rhythm.png' });

  // ---- a check due: the window comes back, or in winter the outside look
  await p.evaluate(() => localStorage.setItem('tos.hiverhythm.v1', JSON.stringify({ active: 1, shoulder: 1, winter: 1 })));
  await p.click('.elbow'); await p.waitForSelector('[data-brief="again"]'); await p.click('[data-brief="again"]');
  s = await until(async () => { const x = await stats(); return x.n === 2 && x; });
  await p.waitForSelector('#brPaper', { timeout: 15000 });   // compiled, headlines included: nothing of this one still on its way
  const winter = [11, 0, 1].includes(new Date(TODAY + 'T12:00:00Z').getUTCMonth());
  const n = 1 - ago, when = n < 0 ? (-n) + (n === -1 ? ' day' : ' days') + ' overdue.' : n === 0 ? 'today.' : n === 1 ? 'tomorrow.' : 'in ' + n + ' days.';   // every day: due whatever check came before
  assert.ok(s.ctx.includes((winter ? 'an outside look is due ' : 'a check is due ') + when), s.ctx.split('\n').filter(l => /HIVE/.test(l)).join(' | '));
  if (!winter) assert.ok(/hive check GO, best window 11:00 to 16:00/.test(s.ctx), 'the window, now that a check is due');
  const env2 = await txt(p, '.ov-envrow:has-text("HIVE CHECK")');
  assert.ok(winter ? env2.includes('OUTSIDE LOOK') && env2.includes('DUE') : (n < 0 ? env2.includes('OVERDUE') : env2.includes('· DUE')) && env2.includes('GO'), env2);

  // ---- NO HEADLINES; a feed that fails
  await p.click('#status'); await p.waitForSelector('[data-brief="newsoff"]');
  assert.ok((await txt(p, '.br-newsset')).includes("NPR's National news"));
  await p.click('[data-brief="newsoff"]'); await p.waitForSelector('[data-brief="newson"]');
  const n0 = (await mode('newsmode', '')).n;
  await p.click('.elbow'); await p.waitForSelector('[data-brief="again"]'); await p.click('[data-brief="again"]');
  await until(async () => (await stats()).n === 3);
  await p.waitForTimeout(400); await p.click('#brPaper'); await p.waitForTimeout(200);
  assert.ok(!(await txt(p, '#brPaper')).includes('NEWS'), 'off');
  assert.strictEqual((await mode('newsmode', '')).n, n0, 'not even asked');
  await p.click('#status'); await p.click('[data-brief="newson"]'); await mode('newsmode', 'fail=1');
  await p.click('.elbow'); await p.waitForSelector('[data-brief="again"]'); await p.click('[data-brief="again"]');
  await until(async () => (await stats()).n === 4);
  await p.waitForTimeout(400); await p.click('#brPaper'); await p.waitForTimeout(200);
  const paper2 = await txt(p, '#brPaper');
  assert.ok(paper2.startsWith('Good morning, Captain.') && !paper2.includes('NEWS'), 'the briefing stands without them');

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepStrictEqual(errs, []);
  await b.close(); await reset();
  console.log('e2e67 briefing, hive rhythm, headlines: OK');
})().catch(async e => { console.error(e); await reset().catch(() => {}); process.exit(1); });
