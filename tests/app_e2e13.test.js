// Bridge overview (2.63, the Time Ribbon): the condition pill and what needs you, the ribbon (now/next, names on the
// blocks, pins), ORDERS OF THE DAY (priorities + due list, intent), BODY + HOME (weather stubbed, its details behind +),
// COMMS (key date, bearing), no HORIZON or BALANCE (their targets stay in Systems), start-screen setting, navigation,
// phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/';
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: 'k'.repeat(64) });

function weather() {
  const days = ['2026-10-06', '2026-10-07', '2026-10-08'], h = { time: [], temperature_2m: [], precipitation_probability: [], wind_speed_10m: [], weather_code: [] };
  days.forEach((d, i) => { for (let hr = 0; hr < 24; hr++) {
    h.time.push(d + 'T' + String(hr).padStart(2, '0') + ':00');
    h.temperature_2m.push(i === 0 ? (hr < 10 ? 45 : hr < 12 ? 57 : hr < 17 ? 64 : 48) : i === 1 ? (hr <= 6 ? 31 : 55) : 55);
    h.precipitation_probability.push(10); h.wind_speed_10m.push(6); h.weather_code.push(1);
  } });
  return { current: { temperature_2m: 45, weather_code: 2, wind_speed_10m: 6 }, hourly: h,
    daily: { time: days, temperature_2m_max: [66, 58, 60], temperature_2m_min: [38, 31, 40], sunrise: days.map(d => d + 'T07:12'), sunset: days.map(d => d + 'T18:41'), precipitation_probability_max: [10, 20, 30] } };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  let wxCalls = 0, wxUrl = '';
  await ctx.route('https://api.open-meteo.com/**', r => { wxCalls++; wxUrl = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(weather()) }); });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tos.pins.v1')) localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month', 'dates', 'review', 'ledger', 'log'])); });   // the bar as it was before 2.7
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');

  // --- no location yet
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, conn(8095));
  await p.reload(); await p.waitForTimeout(2000);
  assert.strictEqual(await p.getAttribute('.elbow', 'aria-current'), 'page', 'opens on the Bridge by default');
  // the elbow, its curve and the top bar are one arm (2.8 Command Gold): the corner, the curve and the bar's
  // left end are the same gold everywhere; on the Bridge both carry the same faint halo, elsewhere none
  const arm = () => p.evaluate(() => { const e = getComputedStyle(document.querySelector('.elbow')), t = getComputedStyle(document.querySelector('.topbar'));
    return [e.backgroundColor, t.backgroundImage.match(/rgb\([^)]*\)/)[0], getComputedStyle(document.querySelector('.top'), '::before').backgroundImage.match(/rgb\([^)]*\)/)[0], e.boxShadow, t.boxShadow]; });
  const lit = await arm();
  console.log('arm on Bridge:', lit.join(' | '));
  assert.ok(lit.slice(0, 3).every(c => c === 'rgb(246, 198, 107)'), 'one gold, no seam');
  assert.ok(lit[3] !== 'none' && lit[3] === lit[4], 'the same faint halo on corner and bar');
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(700);   /* the halo fades out over 0.4 s */
  const unlit = await arm();
  assert.ok(unlit.slice(0, 3).every(c => c === 'rgb(246, 198, 107)') && unlit[3] === 'none' && unlit[4] === 'none', 'gold, no halo, elsewhere');
  await p.click('.elbow'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('[data-act="systems"]:has-text("SET LOCATION")'), 'environment asks for a location');
  assert.strictEqual(wxCalls, 0, 'no weather request without a location');

  // --- bridge 1.4 with a location
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.place.v1', JSON.stringify({ lat: 44.98, lon: -93.27 })); }, conn(8095));
  await p.reload(); await p.waitForTimeout(2500);
  console.log('header:', await p.textContent('#eyebrow'), '|', await p.textContent('#title'));
  assert.strictEqual(await p.textContent('#title'), 'TUESDAY 06 OCT');
  assert.ok(await p.isHidden('#pager'));

  const cls = await p.getAttribute('.ov-cond', 'class');
  const alerts = await p.locator('.ov-alert b').allTextContents();
  console.log('condition:', cls, '| alerts:', alerts.join(' | '));
  assert.ok(cls.includes('red'));
  assert.ok(alerts.includes('Overdue, High priority'));
  assert.ok(alerts.includes('1 task overdue'));
  assert.ok(alerts.includes('Due today, not in your picks'));
  assert.ok(alerts.some(a => /^Calendar clash at 13:30$/.test(a)), 'work/personal clash found');
  assert.ok(alerts.includes('Frost tonight'));
  assert.strictEqual(alerts.indexOf('Overdue, High priority'), 0, 'red items first');

  // 2.63: the condition is a pill beside the date; what needs you is a strip under the header
  assert.ok(/^CONDITION\s*RED · 5$/.test((await p.innerText('#condSlot .ov-cond')).trim()), await p.innerText('#condSlot .ov-cond'));
  assert.strictEqual(await p.locator('#content .ov-cond').count(), 0, 'no banner in the page');
  assert.strictEqual(await p.locator('.rb-alerts .ov-alert').count(), alerts.length);
  // the ribbon
  assert.ok((await p.textContent('[data-panel="prio"] .ov-sub')).includes('3 TASKS DUE OR OVERDUE, NOT PICKED'));
  const now = (await p.innerText('.ov-now')).replace(/\s+/g, ' ').trim();
  console.log('now:', now, '| next:', (await p.innerText('.ov-next')).replace(/\s+/g, ' '), '| then:', await p.innerText('.rb-then'));
  assert.ok(now.startsWith('FREE 50M until 08:30'));
  assert.ok((await p.innerText('.ov-next')).includes('Standup'));
  assert.ok(/^Then \d+ more/.test(await p.innerText('.rb-then')), 'what follows it');
  assert.ok(await p.locator('.ov-blk.clash').count() >= 2, 'clashing blocks outlined');
  assert.ok((await p.locator('.rb-band .rb-bl').allTextContents()).includes('Standup'), 'names on the blocks');
  const pins = (await p.locator('.rb-pin').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('pins:', pins.join(' | '));
  assert.ok(pins.some(t => /^(OVERDUE|DUE TODAY) Book furnace service \+2$/.test(t)), 'what\'s due, pinned');
  assert.ok(pins.includes('TODAY Garlic planting window'), 'today\'s key date, pinned');
  // gone from the Bridge
  assert.strictEqual(await p.locator('.ov-day, .ov-bal, .ov-load').count(), 0, 'no HORIZON, BALANCE or the old readouts');
  assert.ok(!/HORIZON|BALANCE/.test(await p.innerText('#content')));

  const due = await p.locator('.ov-due b').allTextContents();
  console.log('due not picked:', due.join(' | '));
  assert.deepStrictEqual(due.slice(0, 3), ['Book furnace service', 'Order spring bulbs', 'Sugar syrup for Hive 2']);

  const kd = (await p.locator('.ov-kd').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('key dates:', kd.join(' | '));
  assert.deepStrictEqual(kd, ['KEY DATE Garlic planting window · 19 days left'], 'COMMS: the next key date, a running window in days left');

  await p.click('[data-more="env"]'); await p.waitForTimeout(150);
  assert.strictEqual(await p.getAttribute('[data-more="env"]', 'aria-expanded'), 'true');
  await p.reload(); await p.waitForTimeout(1500);
  assert.strictEqual(await p.getAttribute('[data-more="env"]', 'aria-expanded'), 'true', 'the weather\'s details stay open');
  const env = (await p.innerText('.ov-pnl:has(.ov-env)')).replace(/\s+/g, ' ');
  console.log('env:', env);
  assert.ok(wxUrl.includes('latitude=44.98') && wxUrl.includes('longitude=-93.27') && wxUrl.includes('temperature_unit=fahrenheit'));
  assert.ok(env.includes('45°F') && env.includes('PARTLY CLOUDY') && env.includes('SUNRISE 07:12'));
  assert.ok(env.includes('Best window 12:00 to 17:00') && env.includes('64°F, light wind') && env.includes('GO'));
  assert.ok(env.includes('Low 31°F') && env.includes('FROST'));

  await p.screenshot({ path: D + 'bridge-ipad.png', fullPage: true });
  // ---- BALANCE's targets stay in Systems (ASK and REVIEW still use them)
  await p.click('#status'); await p.waitForSelector('#balT-work');
  assert.strictEqual(await p.inputValue('#balT-work'), '45');
  await p.fill('#balT-work', '60'); await p.fill('#balT-personal', '5'); await p.click('[data-act="balsave"]');
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.baltarget.v1'))), { work: 60, personal: 5, farm: 6, hobby: 3 });
  await p.click('[data-screen="bridge"]'); await p.waitForSelector('.rb-ribbon');
  // no emoji anywhere in the interface (Notion labels are shown as plain text; ✓ and ✕ are text marks)
  const emojiIn = () => p.evaluate(() => (document.body.innerText.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).join(''));
  assert.strictEqual(await emojiIn(), '', 'bridge shows no emoji');
  await p.click('#planBtn'); await p.waitForTimeout(600);
  assert.strictEqual(await emojiIn(), '', 'plan day shows no emoji');
  await p.click('#planCancel');
  await p.click('[data-screen="dates"].nav'); await p.waitForTimeout(400);
  assert.strictEqual(await emojiIn(), '', 'dates screen shows no emoji');
  await p.click('.elbow'); await p.waitForTimeout(400);

  // --- Captain's Log survives a re-render while typing, and a reload
  await p.click('#logIntent'); await p.keyboard.type('Finish the deck, then the hives');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.activeElement && document.activeElement.id), 'logIntent', 'focus kept across re-render');
  await p.keyboard.type('.');
  await p.reload(); await p.waitForTimeout(1500);
  assert.strictEqual(await p.inputValue('#logIntent'), 'Finish the deck, then the hives.');

  // --- Bearings: empty until set in Systems
  assert.ok((await p.textContent('.ov-bearing')).includes('SYSTEMS'));
  await p.click('.ov-bearing'); await p.waitForTimeout(300);
  assert.strictEqual(await p.getAttribute('#status', 'aria-current'), 'page');
  await p.fill('#bearIn', 'First bearing\nSecond bearing\n\nThird bearing');
  await p.click('[data-act="bearsave"]'); await p.waitForTimeout(200);
  console.log('toast:', await p.textContent('#toast'));
  await p.click('.elbow'); await p.waitForTimeout(500);
  const b1 = await p.textContent('.ov-bearing span'); await p.click('.ov-bearing'); const b2 = await p.textContent('.ov-bearing span');
  console.log('bearing:', b1, '->', b2);
  assert.ok(['First bearing', 'Second bearing', 'Third bearing'].includes(b1) && b1 !== b2);

  // --- navigation from the Bridge
  await p.click('.ov-alert:has-text("Calendar clash")'); await p.waitForTimeout(400);
  assert.strictEqual(await p.textContent('#title'), 'TUE 06 OCT');
  await p.click('.elbow'); await p.waitForTimeout(400);
  await p.click('.ov-alert:has-text("Overdue, High")'); await p.waitForTimeout(500);
  assert.ok(await p.isVisible('#planSheet'), 'overdue alert opens Plan Day'); await p.click('#planCancel');
  await p.click('.ov-next'); await p.waitForTimeout(200);
  assert.ok((await p.textContent('#detailSheet')).includes('Standup')); await p.click('#detailClose');
  await p.click('.ov-kd >> nth=0'); await p.waitForTimeout(200);
  assert.ok((await p.textContent('#detailSheet')).includes('Garlic planting window')); await p.click('#detailClose');
  // checking off a priority from the Bridge
  await p.click('[data-panel="prio"] .prio >> nth=0'); await p.waitForTimeout(800);
  console.log('after toggle toast:', await p.textContent('#toast'));

  // --- Systems: open on Today instead
  await p.click('#status'); await p.waitForTimeout(300);
  assert.ok((await p.textContent('#content')).includes('44.98,-93.27'));
  // 2.7.3: the space below the status bar is fixed at Timothy's choice (MORE, 30 px); no setting for it
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.body).paddingTop), '30px');
  assert.strictEqual(await p.locator('[data-topgap]').count(), 0, 'TOP SPACING retired');
  await p.fill('#placeIn', 'not a place'); await p.click('[data-act="placesave"]');
  assert.ok((await p.textContent('#bridgeErr')).includes('two numbers'));
  await p.click('[data-start="today"]'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(1200);
  assert.strictEqual(await p.getAttribute('[data-screen="today"].nav', 'aria-current'), 'page', 'opens on Today when chosen');
  await p.evaluate(() => localStorage.removeItem('tos.start.v1'));

  // --- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.reload(); await p.waitForTimeout(1500);
  assert.ok(await p.isVisible('.navbridge'), 'Bridge reachable from the nav row on phones');
  await p.screenshot({ path: D + 'bridge-phone.png', fullPage: true });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log('phone scrollWidth', sw);
  assert.ok(sw <= 400, 'no sideways scroll on a phone');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
