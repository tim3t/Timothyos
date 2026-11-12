// SHEETS HOLD THE PAGE STILL (2.56.1; simulated bridge on :8105): in portrait the Bridge is taller than the screen,
// so the page itself scrolls. When a field in a sheet took the focus, iPadOS scrolled that page to reveal it and then
// aimed taps in the sheet as if it had moved: ADD, SET PRIORITIES and the selects missed. Now an open sheet pins the
// page where it is: it can't be scrolled underneath (as iPadOS would), taps land on what's drawn, PLAN TODAY adds a
// task and sets priorities, and closing the sheet leaves the page exactly where it was. The same for CAPTURE.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const hits = (p, id) => p.evaluate(idv => { const el = document.getElementById(idv), r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); }, id);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await quiet(ctx);
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const posts = []; p.on('request', r => { if (r.method() === 'POST') posts.push(JSON.parse(r.postData() || '{}').action); });
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload(); await p.waitForSelector('#planBtn'); await settled(p, 2500);

  // ---- portrait: the page is taller than the screen and scrolls
  const tall = await p.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  assert.ok(tall > 300, 'the page scrolls in portrait: ' + tall);
  await p.evaluate(() => window.scrollTo(0, 260)); await p.waitForTimeout(100);
  const y0 = await p.evaluate(() => window.scrollY);
  const at = await p.evaluate(() => document.querySelector('.phead').getBoundingClientRect().top);

  // ---- PLAN TODAY: pinned while open; the iPad's "reveal the field" scroll can't move it
  await p.evaluate(() => document.getElementById('planBtn').click()); await p.waitForSelector('#planNew');   // a click that doesn't scroll the page first
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('sheet-lock')), 'pinned');
  assert.strictEqual(await p.evaluate(() => Math.round(document.querySelector('.phead').getBoundingClientRect().top)), Math.round(at), 'nothing moved when it pinned');
  await p.click('#planNew'); await p.keyboard.type('Sample task from the sheet');
  await p.evaluate(() => { window.scrollTo(0, 900); document.scrollingElement.scrollTop = 900; });   // what iPadOS does on focus
  await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => window.scrollY), 0, 'the page underneath did not scroll');
  for (const id of ['planNew', 'planArea', 'planPri', 'planAdd', 'planCancel', 'planSave']) assert.ok(await hits(p, id), id + ' is where it is drawn');
  await p.selectOption('#planPri', { index: 1 });
  await p.click('#planAdd'); await p.waitForFunction(() => /Added to Master Task List/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  assert.ok(posts.includes('addtask'));
  await p.click('#planSave'); await p.waitForFunction(() => document.getElementById('planScrim').hidden, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains('sheet-lock'))), 'let go');
  assert.strictEqual(await p.evaluate(() => window.scrollY), y0, 'back where it was');
  assert.strictEqual(await p.evaluate(() => document.body.style.top), '');

  // ---- CAPTURE the same; CANCEL lets go too
  await p.evaluate(() => document.getElementById('capBtn').click()); await p.waitForSelector('#capText');
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('sheet-lock')));
  await p.click('#capText'); await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(100);
  assert.strictEqual(await p.evaluate(() => window.scrollY), 0);
  assert.ok(await hits(p, 'capSave'), 'SAVE is where it is drawn');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => window.scrollY), y0, 'back where it was');
  assert.ok(!(await p.evaluate(() => document.documentElement.classList.contains('sheet-lock'))));

  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('e2e68 sheets hold the page: OK');
})().catch(e => { console.error(e); process.exit(1); });
