const { chromium } = require('playwright');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8094/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tos.pins.v1')) localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month', 'dates', 'review', 'ledger', 'log'])); });   // the bar as it was before 2.7
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  // bridge 1.2 (no dates)
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8093/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1500);
  console.log('bridge 1.2: panel stub', (await p.textContent('.rcol')).includes('Needs bridge 1.3'));
  await p.click('#capBtn'); console.log('  key date chip disabled', await p.isDisabled('#capTypeDate')); await p.click('#capCancel');
  // bridge 1.3
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8094/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(2000);
  const rows = await p.locator('.rcol .kd').allTextContents();
  console.log('panel rows:\n   ' + rows.join('\n   '));
  console.log('day all-day chips:', (await p.locator('.kdchip').allTextContents()).join(' | '));
  await p.screenshot({ path: D + 'kd-today.png' });
  await p.click('.rcol .kd >> nth=0'); await p.waitForTimeout(200);
  console.log('detail:', (await p.textContent('#detailSheet')).replace(/\s+/g, ' ').slice(0, 160), '| notion link', await p.locator('#detailSheet a[href*="notion.so"]').count());
  await p.click('#detailClose');
  await p.click('[data-screen="dates"]'); await p.waitForTimeout(500);
  console.log('dates screen groups:', (await p.locator('.kdscreen .phead h2').allTextContents()).join(' | '));
  console.log('rows (12 months):', await p.locator('.kdscreen .kd').count(), '| birthday occurrences:', await p.locator('.kdscreen .kd:has-text("Mom")').count());
  await p.screenshot({ path: D + 'kd-screen.png', fullPage: false });
  await p.click('[data-kdf="farm"]'); await p.waitForTimeout(200);
  console.log('farm filter rows:', (await p.locator('.kdscreen .kd b').allTextContents()).join(', '));
  await p.click('[data-kdf=""]');
  await p.click('[data-screen="month"]'); await p.waitForTimeout(800);
  console.log('month kd lines:', (await p.locator('.moc .kdli').allTextContents()).join(' | '));
  await p.screenshot({ path: D + 'kd-month.png' });
  await p.click('[data-screen="week"]'); await p.waitForTimeout(800);
  console.log('week kd spans:', (await p.locator('.kdspan').allTextContents()).join(' | '));
  // capture a key date (window, yearly)
  await p.click('[data-screen="dates"]'); await p.waitForTimeout(300);
  await p.click('.kdtools [data-act="adddate"]'); await p.waitForTimeout(200);
  console.log('capture opens as key date:', await p.getAttribute('#capTypeDate', 'aria-pressed'), '| time row hidden', await p.isHidden('#capTimeRow'), '| mode', await p.textContent('#capMode'));
  await p.fill('#capText', 'Hardening-off window');
  await p.fill('#capDate', '2027-03-15'); await p.dispatchEvent('#capDate', 'change');
  await p.fill('#capUntil', '2027-03-01'); await p.click('#capSave');
  console.log('end before start msg:', await p.textContent('#capErr'));
  await p.fill('#capUntil', '2027-04-05');
  await p.selectOption('#capLifeArea', '🌿 SkyGarden Farm'); await p.selectOption('#capKdType', '🌦️ Window'); await p.click('#capYearly');
  await p.screenshot({ path: D + 'kd-capture.png' });
  await p.click('#capSave'); await p.waitForTimeout(1200);
  console.log('toast:', await p.textContent('#toast'));
  console.log('server got:', JSON.stringify((await stats()).dates.slice(-1)));
  // switching back to event keeps event flow working
  await p.click('#capBtn'); console.log('reopen defaults to EVENT:', await p.getAttribute('[data-ctype="event"]', 'aria-pressed'), '| area row visible', await p.isVisible('#capAreaRow')); await p.click('#capCancel');
  // plan day coming-up line
  await p.click('[data-screen="today"]'); await p.waitForTimeout(500); await p.click('#planBtn'); await p.waitForTimeout(800);
  console.log('plan line:', await p.textContent('.kdline').catch(() => 'none')); await p.click('#planCancel');
  await p.click('#status'); await p.waitForTimeout(300);
  console.log('systems:', await p.locator('.calrow:has-text("Key Dates") small').first().textContent());
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('[data-screen="dates"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'kd-phone.png' });
  console.log('phone scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  console.log('errors', errs); await b.close();
})();
