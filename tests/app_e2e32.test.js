// LEDGER freshness (2.15.1, bridge 1.21). Opening LEDGER asks YNAB itself (past the bridge's
// 10-minute copy) when the iPad's copy is over a minute old; pulling down from the top of LEDGER,
// or REFRESH beside OPEN YNAB, asks YNAB again at once. The header says when YNAB was asked. A pull
// only counts at the top of LEDGER, and nowhere else. Figures are invented sample data.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8103/x/exec?key=' + K + '&action=';
const call = async q => (await (await fetch(M + q)).json());
const calls = async () => (await call('stats')).ledgercalls;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const pull = async (x, y0, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom', 'review', 'log', 'habits', 'ledger'])); });
  await p.reload(); await p.waitForTimeout(1800);
  await call('ynabset&bal=4812.37&at=2026-10-10T20:00:00-05:00');

  // ---- opening LEDGER goes to YNAB itself
  const n0 = (await calls()).length;
  await p.click('[data-screen="ledger"].nav'); await p.waitForSelector('text=$4,812', { timeout: 5000 });
  let c = (await calls()).slice(n0);
  assert.deepStrictEqual(c, [true], 'one ask, straight to YNAB');
  console.log('header:', await txt(p, '#eyebrow'));
  assert.ok(/^FINANCES · YNAB · AS OF /.test(await txt(p, '#eyebrow')), 'says when YNAB was asked');

  // ---- YNAB moves on; reopening within a minute doesn't ask again
  await call('ynabset&bal=5000&at=2026-10-10T20:05:00-05:00');
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(300); await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(800);
  assert.strictEqual((await calls()).length, n0 + 1, 'under a minute: the copy here stands');

  // ---- pull down from the top: refreshed from YNAB
  await p.evaluate(() => { document.getElementById('content').scrollTop = 0; });
  await pull(700, 260, 300); await p.waitForTimeout(400);
  assert.strictEqual((await calls()).length, n0 + 1, 'a short pull does nothing');
  await pull(700, 220, 520); await p.waitForTimeout(150);
  assert.ok((await txt(p, '#ptr')).includes('REFRESHING FROM YNAB'), 'shows it is refreshing');
  await p.screenshot({ path: D + 'ledger-pull.png' });
  await p.waitForSelector('text=$5,000', { timeout: 5000 });
  c = await calls(); assert.strictEqual(c[c.length - 1], true, 'straight to YNAB');
  await p.waitForTimeout(700);
  assert.ok((await p.textContent('#toast')).includes('Ledger updated from YNAB'));
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('ptr')).height), '0px', 'the indicator folds away');

  // ---- not when scrolled down, and not on other screens
  const n1 = (await calls()).length;
  await p.evaluate(() => { document.getElementById('content').scrollTop = 300; });
  await pull(700, 220, 520); await p.waitForTimeout(800);
  assert.strictEqual((await calls()).length, n1, 'only from the top');
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(400);
  await pull(700, 220, 520); await p.waitForTimeout(800);
  assert.strictEqual((await calls()).length, n1, 'LEDGER only');

  // ---- REFRESH beside OPEN YNAB does the same
  await call('ynabset&bal=5100.5&at=2026-10-10T20:09:00-05:00');
  await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(500);
  await p.click('[data-act="ledgerrefresh"]'); await p.waitForSelector('text=$5,100', { timeout: 5000 });
  c = await calls(); assert.strictEqual(c[c.length - 1], true);

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
