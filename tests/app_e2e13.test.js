// Bridge overview: condition banner, Now/Next, Priorities + due list, Horizon,
// Key Dates, Environment (weather stubbed), Balance (bridge 1.4), Captain's Log,
// Bearings, start-screen setting, navigation, phone width.
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
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');

  // --- bridge 1.3: no Balance yet, no location yet
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, conn(8094));
  await p.reload(); await p.waitForTimeout(2000);
  assert.strictEqual(await p.getAttribute('.elbow', 'aria-current'), 'page', 'opens on the Bridge by default');
  assert.ok((await p.textContent('#content')).includes('Needs bridge 1.4'), 'balance stub on bridge 1.3');
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

  const now = (await p.innerText('.ov-now')).replace(/\s+/g, ' ').trim();
  console.log('now:', now, '| next:', (await p.innerText('.ov-next')).replace(/\s+/g, ' '));
  assert.ok(now.startsWith('FREE 50M until 08:30'));
  assert.ok((await p.innerText('.ov-next')).includes('Standup'));
  assert.ok(await p.locator('.ov-blk.clash').count() >= 2, 'clashing blocks outlined');
  console.log('load:', (await p.innerText('.ov-load')).replace(/\s+/g, ' '));
  assert.ok((await p.innerText('.ov-load')).includes('4H BOOKED'));

  const due = await p.locator('.ov-due b').allTextContents();
  console.log('due not picked:', due.join(' | '));
  assert.deepStrictEqual(due.slice(0, 3), ['Book furnace service', 'Order spring bulbs', 'Sugar syrup for Hive 2']);

  const hrs = await p.locator('.ov-day .hrs').allTextContents();
  console.log('horizon:', (await p.locator('.ov-day .dl').allTextContents()).join(' '), '|', hrs.join(' '));
  assert.strictEqual(hrs.length, 7);
  assert.strictEqual(hrs[0], '4H', 'today: overlaps counted once');

  const kd = (await p.locator('.ov-kd').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('key dates:', kd.join(' | '));
  assert.ok(kd[0].startsWith('19 D LEFT') && kd[0].includes('Garlic planting window'), 'running window shows days left');
  assert.ok(kd[1].startsWith('6 DAYS') && kd[1].includes('First frost risk'));

  const env = (await p.innerText('.ov-pnl:has(.ov-env)')).replace(/\s+/g, ' ');
  console.log('env:', env);
  assert.ok(wxUrl.includes('latitude=44.98') && wxUrl.includes('longitude=-93.27') && wxUrl.includes('temperature_unit=fahrenheit'));
  assert.ok(env.includes('45°F') && env.includes('PARTLY CLOUDY') && env.includes('SUNRISE 07:12'));
  assert.ok(env.includes('Best window 12:00 to 17:00') && env.includes('64°F, light wind') && env.includes('GO'));
  assert.ok(env.includes('Low 31°F') && env.includes('FROST'));

  const bal = (await p.locator('.ov-bal').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('balance:', bal.join(' | '));
  assert.ok(bal[0].startsWith('WORK') && bal[0].includes('2 DONE') && bal[0].includes('LAST YESTERDAY'));
  assert.ok(bal[1].startsWith('PERSONAL') && bal[1].includes('2 DONE'));
  assert.ok(bal[2].startsWith('FARM') && bal[2].includes('0 DONE') && bal[2].includes('QUIET 12 D'));
  assert.ok(bal[3].startsWith('HOBBIES') && bal[3].includes('NONE IN 30 D'));
  await p.screenshot({ path: D + 'bridge-ipad.png', fullPage: true });
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
  assert.ok((await p.textContent('.ov-bearing')).includes('SET IN SYSTEMS'));
  await p.click('.ov-bearing'); await p.waitForTimeout(300);
  assert.strictEqual(await p.getAttribute('[data-screen="systems"].nav', 'aria-current'), 'page');
  await p.fill('#bearIn', 'First bearing\nSecond bearing\n\nThird bearing');
  await p.click('[data-act="bearsave"]'); await p.waitForTimeout(200);
  console.log('toast:', await p.textContent('#toast'));
  await p.click('.elbow'); await p.waitForTimeout(500);
  const b1 = await p.textContent('.ov-bearing b'); await p.click('.ov-bearing'); const b2 = await p.textContent('.ov-bearing b');
  console.log('bearing:', b1, '->', b2);
  assert.ok(['First bearing', 'Second bearing', 'Third bearing'].includes(b1) && b1 !== b2);

  // --- navigation from the Bridge
  await p.click('.ov-day >> nth=2'); await p.waitForTimeout(400);
  console.log('horizon tap ->', await p.textContent('#eyebrow'), await p.textContent('#title'));
  assert.strictEqual(await p.textContent('#title'), 'THU 08 OCT');
  await p.click('.elbow'); await p.waitForTimeout(400);
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
  await p.click('.ov-pnl .prio >> nth=0'); await p.waitForTimeout(800);
  console.log('after toggle toast:', await p.textContent('#toast'));

  // --- Systems: open on Today instead
  await p.click('[data-screen="systems"].nav'); await p.waitForTimeout(300);
  assert.ok((await p.textContent('#content')).includes('44.98,-93.27'));
  const padBefore = await p.evaluate(() => getComputedStyle(document.body).paddingTop);
  await p.click('[data-topgap="48"]'); await p.waitForTimeout(100);
  const padAfter = await p.evaluate(() => getComputedStyle(document.body).paddingTop);
  console.log('top spacing:', padBefore, '->', padAfter, '|', await p.textContent('dd:has([data-topgap]) small'));
  assert.strictEqual(padBefore, '14px'); assert.strictEqual(padAfter, '48px');
  await p.reload(); await p.waitForTimeout(800);
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.body).paddingTop), '48px', 'spacing kept after reload');
  await p.click('[data-screen="systems"].nav'); await p.waitForTimeout(300);
  await p.click('[data-topgap="14"]');
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
