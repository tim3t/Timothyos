// BREAKS (2.23): lunch booked as "Out of office — Lunch" on the Work calendar. "Out of office" is on
// IGNORED EVENTS, yet Lunch is shown (labelled Lunch, a hatched break block) on Today, Week and the
// Bridge (NOW shows LUNCH), while plain "Out of office" stays hidden. A break never counts as Work
// hours, meetings or BALANCE. The list is edited in Systems. Fixed clock: Wed 14 Oct 2026, 12:20.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-14T12:20:00-05:00'));
  await p.goto('http://localhost:8080/');
  const boot = (ign, brk) => p.evaluate(([k, ign, brk]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.ignore.v1', JSON.stringify(ign)); if (brk) localStorage.setItem('tos.breaks.v1', JSON.stringify(brk));
  }, [K, ign, brk]);
  const workBal = async () => { await p.waitForSelector('.ov-bal.bal-work'); return parseFloat((await txt(p, '.ov-bal.bal-work')).match(/WORK ([\d.]+)H/)[1]); };

  // ---- baseline: nothing ignored and no breaks, so lunch counts as work
  await boot(['Away block'], []); await p.reload(); await p.waitForTimeout(1800);
  const withLunch = await workBal();

  // ---- the real setup: "Out of office" ignored, Lunch a break (the default list)
  await boot(['Out of office', 'Away block'], null); await p.reload(); await p.waitForTimeout(1800);
  const nowTxt = await txt(p, '.ov-now');
  console.log('now:', nowTxt);
  assert.ok(nowTxt.startsWith('LUNCH') && nowTxt.includes('40M') && nowTxt.includes('Lunch') && !nowTxt.includes('Out of office'), nowTxt);
  assert.strictEqual(await p.locator('.ov-blk.a-break').count(), 1, 'on the Bridge strip');
  const asBreak = await workBal();
  console.log('work hours, lunch as work:', withLunch, '| lunch as a break:', asBreak);
  assert.ok(withLunch - asBreak >= 2.9 && withLunch - asBreak <= 5.1, 'exactly the lunch hours left out of Work');

  // ---- Today
  await p.click('[data-screen="today"].nav'); await p.waitForSelector('.ev');
  const brk = await txt(p, '.ev.a-break');
  assert.ok(brk.startsWith('Lunch') && brk.includes('12:00-13:00'), brk);
  assert.ok(!(await p.evaluate(() => [...document.querySelectorAll('.ev')].some(e => /Out of office/.test(e.textContent)))), 'plain Out of office stays hidden');
  const work = await txt(p, '.arow.a-work');
  assert.ok(/2 MTGS$/.test(work), 'meetings: Standup and Roadmap review only: ' + work);
  await p.screenshot({ path: D + 'breaks-today.png' });

  // ---- Week
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator('.wkb.a-break').count(), 5, 'a lunch each weekday');

  // ---- Systems: the list
  await p.click('#status'); await p.waitForSelector('#brkIn');
  assert.strictEqual(await p.inputValue('#brkIn'), 'Lunch');
  await p.fill('#brkIn', 'Lunch\nWalk'); await p.click('[data-act="brksave"]');
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.breaks.v1'))), ['Lunch', 'Walk']);
  await p.fill('#brkIn', ''); await p.click('[data-act="brksave"]');
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(400);
  assert.strictEqual(await p.locator('.ev.a-break').count(), 0, 'emptied: lunch is ignored again');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
