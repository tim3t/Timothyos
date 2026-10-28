// KEY DATES (Notion): the Today panel and the day's chip, the detail sheet, the DATES screen (groups, yearly birthdays,
// farm filter), Month lines, capturing a window (end before start refused, saved once with its type and yearly), CAPTURE
// back to EVENT after, PLAN DAY's coming-up line, Systems, phone.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8094/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tos.pins.v1')) localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month', 'dates', 'review', 'ledger', 'log'])); });   // the bar as it was before 2.7
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8094/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(2000);
  const txt = async sel => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
  const rows = (await p.locator('.rcol .kd').allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
  assert.deepStrictEqual(rows, ['01 OCT TO 25 OCTGarlic planting windowWindow · Hollow Oak Farm19 D LEFT', '12 OCTFirst frost riskDeadline · Hollow Oak FarmIN 6 D', "20 OCTMom's birthdayBirthday · Kin · YEARLYIN 14 D", '30 OCTQ4 roadmap dueDeadline · Work DeskIN 24 D']);
  assert.deepStrictEqual(await p.locator('.kdchip').allTextContents(), ['◆ Garlic planting window · DAY 6 OF 25']);
  const kd0 = (await stats()).dates.filter(d => d[0] === 'Hardening-off window').length;
  await p.screenshot({ path: D + 'kd-today.png' });
  await p.click('.rcol .kd >> nth=0'); await p.waitForTimeout(200);
  assert.ok((await txt('#detailSheet')).startsWith('◆ KEY DATEWindowGarlic planting windowTHU 01 OCT TO SUN 25 OCT · 19 D LEFT'), await txt('#detailSheet'));
  assert.strictEqual(await p.locator('#detailSheet a[href*="notion.so"]').count(), 1, 'OPEN IN NOTION');
  await p.click('#detailClose');
  await p.click('[data-screen="dates"]'); await p.waitForTimeout(500);
  assert.deepStrictEqual((await p.locator('.kdscreen .phead h2').allTextContents()).slice(0, 3), ['HAPPENING NOW', 'OCTOBER 2026', 'NOVEMBER 2026']);
  assert.strictEqual(await p.locator('.kdscreen .kd:has-text("Mom")').count(), 1, 'a yearly date once in the next 12 months');
  await p.screenshot({ path: D + 'kd-screen.png', fullPage: false });
  await p.click('[data-kdf="farm"]'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.locator('.kdscreen .kd b').allTextContents(), ['Garlic planting window', 'First frost risk', 'Mite treatment'], 'farm only');
  await p.click('[data-kdf=""]');
  await p.click('[data-screen="month"]'); await p.waitForTimeout(800);
  assert.deepStrictEqual(await p.locator('.moc .kdli').allTextContents(), ['◆ Garlic planting window · STARTS', '◆ First frost risk', "◆ Mom's birthday", '◆ Garlic planting window · ENDS', '◆ Q4 roadmap due']);
  await p.screenshot({ path: D + 'kd-month.png' });
  await p.click('[data-screen="week"]'); await p.waitForTimeout(800);
  // capture a key date (window, yearly)
  await p.click('[data-screen="dates"]'); await p.waitForTimeout(300);
  await p.click('.kdtools [data-act="adddate"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.getAttribute('#capTypeDate', 'aria-pressed'), 'true'); assert.ok(await p.isHidden('#capTimeRow'));
  assert.strictEqual(await txt('#capMode'), 'NOTION · KEY DATES');
  await p.fill('#capText', 'Hardening-off window');
  await p.fill('#capDate', '2027-03-15'); await p.dispatchEvent('#capDate', 'change');
  await p.fill('#capUntil', '2027-03-01'); await p.click('#capSave');
  assert.strictEqual(await txt('#capErr'), 'The end date is before the start date.');
  await p.fill('#capUntil', '2027-04-05');
  await p.selectOption('#capLifeArea', '🌿 Hollow Oak Farm'); await p.selectOption('#capKdType', '🌦️ Window'); await p.click('#capYearly');
  await p.screenshot({ path: D + 'kd-capture.png' });
  await p.click('#capSave'); await p.waitForTimeout(1200);
  assert.strictEqual(await txt('#toast'), 'Key date saved to Notion · MON 15 MAR TO MON 05 APR · KEY DATE');
  const got = (await stats()).dates.filter(d => d[0] === 'Hardening-off window');
  assert.strictEqual(got.length, kd0 + 1, 'saved once');
  assert.deepStrictEqual(got[got.length - 1], ['Hardening-off window', '2027-03-15', '2027-04-05', '🌿 Hollow Oak Farm', '🌦️ Window', true]);
  // switching back to event keeps event flow working
  await p.click('#capBtn'); assert.strictEqual(await p.getAttribute('[data-ctype="event"]', 'aria-pressed'), 'true', 'back to EVENT'); assert.ok(await p.isVisible('#capAreaRow')); await p.click('#capCancel');
  // plan day coming-up line
  await p.click('[data-screen="today"]'); await p.waitForTimeout(500); await p.click('#planBtn'); await p.waitForTimeout(800);
  assert.strictEqual(await txt('.kdline'), "◆ COMING UP: Garlic planting window 19 D LEFT · First frost risk IN 6 D · Mom's birthday IN 14 D"); await p.click('#planCancel');
  await p.click('#status'); await p.waitForTimeout(300);
  assert.ok(/^\d+ key dates · synced \d\d:\d\d$/.test((await p.locator('.calrow:has-text("Key Dates") small').first().textContent()).trim()));
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('[data-screen="dates"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'kd-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), 'no sideways scroll');
  console.log('errors', errs); await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
