// First run and the calendar screens: the link form refuses a wrong URL; Today, an event's detail, Week, Month and the
// next month; when the bridge can't be reached the screens keep the last copy; phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tos.pins.v1')) localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month', 'dates', 'review', 'ledger', 'log'])); });   // the bar as it was before 2.7
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await p.clock.setFixedTime(new Date('2026-10-06T10:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.waitForTimeout(500);
  await p.screenshot({ path: D + '1-connect.png' });
  await p.fill('#connUrl', 'https://example.com/foo'); await p.fill('#connKey', 'abc'); await p.click('#connBtn');
  assert.strictEqual(await p.textContent('#connErr'), 'The URL should start with https://script.google.com/ and end in /exec.');
  await p.evaluate(() => { localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8090/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1200);
  await p.screenshot({ path: D + '2-today.png' });
  assert.strictEqual(await p.locator('.ev').count(), 5); assert.ok((await p.textContent('#status')).trim().startsWith('SYNCED'));
  await p.locator('.ev', { hasText: 'Busy' }).first().click(); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#detailSheet'), 'an event opens its detail');
  await p.screenshot({ path: D + '3-detail.png' });
  await p.click('#detailClose');
  await p.click('[data-screen="week"]'); await p.waitForTimeout(900); await p.screenshot({ path: D + '4-week.png' });
  await p.click('[data-screen="month"]'); await p.waitForTimeout(1200); await p.screenshot({ path: D + '5-month.png' });
  assert.ok(await p.locator('.moc .li').count() > 20, 'the month is filled in');
  await p.click('#nextBtn'); await p.waitForTimeout(1000); assert.strictEqual(await p.textContent('#title'), 'NOVEMBER 2026');
  await p.click('#status'); await p.waitForTimeout(300); await p.screenshot({ path: D + '6-systems.png', fullPage: true });
  await p.route('**/127.0.0.1:8090/**', r => r.abort());
  await p.click('[data-act="refresh"]'); await p.waitForTimeout(600);
  assert.ok(/LAST 10:40/.test((await p.textContent('#status')).replace(/\s+/g, ' ')), 'shows when it last synced: ' + await p.textContent('#status'));
  await p.click('[data-screen="today"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.ev').count(), 5, 'the last copy stays on screen while the bridge is unreachable');
  await p.unroute('**/127.0.0.1:8090/**');
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  await p.screenshot({ path: D + '7-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), 'no sideways scroll');
  const real = errs.filter(e => !/fonts\.g/.test(e) && !/ERR_FAILED|net::/.test(e));
  console.log('errors', real);
  await b.close();
  if (real.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
