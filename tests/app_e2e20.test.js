// Ledger (bridge 1.9): checking, age of money, savings and loans from YNAB (read-only),
// average spend for 3, 6 and 12 months with this month so far, and the Replicator Queue
// (funded top-down from the Discretionary category; reorder, add, bought, undo).
// Finances stay out of Ask unless turned on in Systems.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8100/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T08:14:00-05:00'));
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"today"'); }, conn(port));

  // --- bridge 1.8: LEDGER explains what it needs
  await setup(8099); await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#title'), 'LEDGER');
  assert.ok((await p.textContent('#content')).includes('needs bridge 1.9'));

  // --- bridge 1.9
  await setup(8100); await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(1200);
  assert.ok((await p.textContent('#eyebrow')).startsWith('FINANCES · YNAB · SYNCED'));
  assert.ok(await p.isHidden('#pager'));
  const hero = await txt(p, '.lg-hero'), aom = await txt(p, '.lg-aom');
  console.log('hero:', hero, '| aom:', aom.slice(0, 80));
  assert.ok(hero.includes('$4,812.37'), 'checking with cents');
  assert.ok(aom.includes('62DAYS') && aom.includes('Up 2 days in 3 months'));
  const accts = await txt(p, '.lg-accts');
  console.log('accounts:', accts);
  assert.ok(accts.includes('SAVINGS · $10,391') && accts.includes('Emergency Fund $8,250.00'));
  assert.ok(accts.includes('LOANS · −$11,420 OWED') && accts.includes('38% paid off · started at $18,400'));

  // average spend
  let rows = (await p.locator('.lg-crow').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('6M:', rows.slice(0, 4).join(' | '), '| meta', await p.textContent('.phead:has-text("AVERAGE SPEND") .meta'));
  assert.strictEqual(rows.length, 8, 'top 8, rest behind +');
  assert.ok(rows[0].startsWith('GROCERIES EVERYDAY') && rows[0].endsWith('$604'));
  assert.ok((await p.textContent('.phead:has-text("AVERAGE SPEND") .meta')).includes('LAST 6 MONTHS'));
  assert.ok((await txt(p, '.lg-legend')).includes('OCTOBER SO FAR · DAY 7 OF 31'));
  await p.click('[data-more="lspend"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.locator('.lg-crow').count(), 9);
  await p.click('[data-lrange="12"]'); await p.waitForTimeout(200);
  assert.ok((await p.textContent('.phead:has-text("AVERAGE SPEND") .meta')).includes('LAST 10 MONTHS'), 'months before the plan started are skipped');
  await p.click('.lg-crow:has-text("Groceries")'); await p.waitForTimeout(200);
  const det = await txt(p, '.lg-cdetail'); console.log('detail:', det);
  assert.ok(/3M \$\d+ · 6M \$604 · 12M \$\d+/.test(det) && det.includes('October so far $214'));
  await p.reload(); await p.waitForTimeout(1200); await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(600);
  assert.strictEqual(await p.getAttribute('[data-lrange="12"]', 'aria-pressed'), 'true', 'period remembered');

  // replicator queue
  const items = async () => (await p.locator('.lg-witem').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  let q = await items(); console.log('queue:', q.join(' | '));
  assert.ok((await txt(p, '.lg-fund')).includes('REPLICATOR RATIONS · YNAB CATEGORY "DISCRETIONARY" $340 available'));
  assert.ok(q[0].startsWith('1 New glasses') && q[0].includes('FUNDS READY'));
  assert.ok(q[1].startsWith('2 Honey extractor') && q[1].includes('$390 TO GO'));
  assert.ok(q[2].includes('NO PRICE YET'));
  await p.click('[data-qid="q2"] [data-qmove="-1"]'); await p.waitForTimeout(800);
  let s = await stats(); console.log('order after move:', JSON.stringify(s.queue));
  assert.deepStrictEqual(s.queue.filter(x => !x[2]).sort((a, c) => a[1] - c[1]).map(x => x[0]), ['Honey extractor', 'New glasses', 'Rain barrels']);
  q = await items();
  assert.ok(q[0].includes('Honey extractor') && q[0].includes('$110 TO GO') && q[1].includes('$280 TO GO'), 'funding follows the new order');
  assert.strictEqual(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Move Honey extractor down', 'focus stays on the moved item (up is disabled at the top)');

  await p.fill('#qName', 'Pruning saw'); await p.fill('#qCost', '$129'); await p.fill('#qNote', 'For the orchard');
  await p.click('#qForm button[type="submit"]'); await p.waitForTimeout(800);
  q = await items(); assert.ok(q[3].startsWith('4 Pruning saw') && q[3].includes('For the orchard') && q[3].includes('$129'));
  s = await stats(); assert.ok(s.queue.some(x => x[0] === 'Pruning saw' && x[1] === 40));

  await p.click('[data-qbought="q1"]'); await p.waitForTimeout(150);
  assert.ok((await txt(p, '[data-qid="q1"]')).includes('BOUGHT? YES NO'));
  s = await stats(); const before = s.qposts;
  await p.click('[data-qno]'); await p.click('[data-qbought="q1"]'); await p.click('[data-qyes="q1"]'); await p.waitForTimeout(800);
  s = await stats(); assert.ok(s.queue.some(x => x[0] === 'New glasses' && x[2] === '2026-10-07')); assert.strictEqual(s.qposts, before + 1, 'NO sends nothing');
  console.log('toast:', await p.textContent('#toast'));
  assert.ok((await txt(p, '.lg-bought')).includes('New glasses · $280 · WED 07 OCT'));
  await p.click('.lg-brow:has-text("New glasses") [data-qundo]'); await p.waitForTimeout(800);
  assert.ok((await items()).some(t => t.includes('New glasses')), 'undo puts it back');
  await p.screenshot({ path: D + 'ledger-ipad.png', fullPage: true });

  // finances stay out of Ask until turned on
  await p.click('#askBtn'); await p.fill('#askText', 'What should I do first today?'); await p.click('#askSend'); await p.waitForTimeout(1000);
  s = await stats(); assert.ok(!s.asks[s.asks.length - 1].ctx.includes('FINANCES'), 'off by default');
  await p.click('#askClose');
  assert.strictEqual(await p.locator('[data-screen="systems"]').count(), 0, 'no SYSTEMS button');
  await p.click('#status'); await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#title'), 'SYSTEMS');
  assert.strictEqual(await p.getAttribute('#status', 'aria-current'), 'page', 'the status lights up on Systems');
  const sys = await txt(p, 'section:has(.phead:has-text("LEDGER"))'); console.log('systems:', sys.slice(0, 220));
  assert.ok(sys.includes('1 checking · 2 savings · 1 loans · fund category "Discretionary" found') && sys.includes('Off: your finances are never sent'));
  await p.click('[data-aifin="1"]'); await p.waitForTimeout(100);
  await p.click('#askBtn'); await p.click('#askNew'); await p.fill('#askText', 'Can I afford the extractor?'); await p.click('#askSend'); await p.waitForTimeout(1000);
  s = await stats(); const c2 = s.asks[s.asks.length - 1].ctx;
  assert.ok(c2.includes("FINANCES (YNAB, read-only; shared by Timothy's choice)") && c2.includes('Checking $4,812.37') && c2.includes('Discretionary category available $340.00'));
  await p.click('#askClose');

  // phone width
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('[data-screen="ledger"].nav'); await p.waitForTimeout(400);
  await p.screenshot({ path: D + 'ledger-phone.png', fullPage: true });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll on a phone');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
