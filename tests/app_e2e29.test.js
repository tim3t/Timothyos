// Easter eggs (2.13.0). Earl Grey in the Replicator Queue (replicated, nothing added); holding the
// CONDITION block 3 s (Red Alert, then standing down); holding SYNCED (a stardate, without opening
// Systems); "Make it so" / "Computer, end program" in ASK (never sent to Claude; the second ends in
// Standby); and Q, about one launch in 500 (forced here). None of them changes any data.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8103/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const CONN = JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: K });
async function open(b, random) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(r => { Math.random = () => r; }, random);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-10-09T09:16:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom', 'review', 'log', 'habits', 'ledger'])); }, CONN);
  await p.reload(); await p.waitForTimeout(1800);
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  let { ctx, p } = await open(b, 0.5);
  p.on('pageerror', e => errs.push(e.message));

  // ---- 3. stardate: hold SYNCED; it shows the stardate and doesn't open Systems
  const st = await p.locator('#status').boundingBox();
  await p.mouse.move(st.x + 40, st.y + 30); await p.mouse.down(); await p.waitForTimeout(900); await p.mouse.up(); await p.waitForTimeout(200);
  const sd = await txt(p, '#status');
  console.log('status:', sd);
  assert.ok(/^STARDATE 807\d\d\.\d$/.test(sd), sd);
  assert.ok((await p.textContent('#eyebrow')).startsWith('BRIDGE'), 'still on the Bridge');
  await p.click('#status'); await p.waitForTimeout(400);
  assert.ok((await p.textContent('#title')).includes('SYSTEMS'), 'a normal tap still opens Systems');
  await p.click('[data-screen="bridge"]'); await p.waitForTimeout(600);

  // ---- 2. red alert: hold the CONDITION block for 3 seconds
  const lvl = await p.locator('.ov-cond .lvl').boundingBox();
  await p.mouse.move(lvl.x + 30, lvl.y + 30); await p.mouse.down(); await p.waitForTimeout(1500);
  assert.ok(await p.isHidden('#egg'), 'not before 3 seconds');
  await p.waitForTimeout(1800); await p.mouse.up();
  assert.ok(await p.isVisible('#egg.red'));
  assert.strictEqual(await txt(p, '#egg'), 'RED ALERT ALL HANDS TO BATTLE STATIONS');
  await p.waitForTimeout(500); await p.screenshot({ path: D + 'egg-redalert.png' });
  await p.click('#egg'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '#egg')).startsWith('STANDING DOWN · CONDITION '), 'stands down to the real condition');
  await p.waitForTimeout(1600); assert.ok(await p.isHidden('#egg'));
  // a short press does nothing
  await p.mouse.move(lvl.x + 30, lvl.y + 30); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up(); await p.waitForTimeout(3000);
  assert.ok(await p.isHidden('#egg'));

  // ---- 4. Make it so: warp, never sent to Claude
  const asks0 = (await stats()).asks.length;
  await p.click('#askBtn'); await p.fill('#askText', 'Make it so.'); await p.click('#askSend'); await p.waitForTimeout(500);
  assert.ok(await p.isVisible('#egg.warp') && await p.isHidden('#askScrim'));
  assert.strictEqual(await txt(p, '#egg'), 'ENGAGING');
  await p.screenshot({ path: D + 'egg-warp.png' });
  await p.waitForTimeout(2400); assert.ok(await p.isHidden('#egg'));
  // ---- 5. Computer, end program: the holodeck grid, then Standby
  await p.click('#askBtn'); await p.fill('#askText', 'Computer, end program'); await p.press('#askText', 'Enter'); await p.waitForTimeout(1200);
  assert.ok(await p.isVisible('#egg.holo'));
  await p.screenshot({ path: D + 'egg-holodeck.png' });
  await p.waitForTimeout(2200);
  assert.ok(await p.isVisible('#standby') && await p.isHidden('#egg'), 'program ended into Standby');
  await p.mouse.click(600, 400); await p.waitForTimeout(1200);
  assert.strictEqual((await stats()).asks.length, asks0, 'neither went to Claude');
  // an ordinary question still goes
  await p.click('#askBtn'); await p.fill('#askText', 'Make it so the bulbs get ordered'); await p.click('#askSend'); await p.waitForTimeout(1200);
  assert.strictEqual((await stats()).asks.length, asks0 + 1);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- 1. Tea, Earl Grey, hot: replicated, not queued
  await p.click('[data-screen="ledger"]'); await p.waitForTimeout(1500);
  const q0 = await stats();
  await p.fill('#qName', 'Tea, Earl Grey, hot'); await p.press('#qName', 'Enter'); await p.waitForTimeout(2200);
  assert.ok(await p.isVisible('#egg.rep .egg-rep'));
  assert.strictEqual(await txt(p, '.egg-rep'), 'TEA. EARL GREY. HOT.');
  assert.deepStrictEqual(await p.$$eval('.egg-cup, .egg-rep b', els => els.map(e => getComputedStyle(e).opacity)), ['1', '1'], 'the cup and the words show');
  await p.screenshot({ path: D + 'egg-earlgrey.png' });
  const q1 = await stats();
  assert.strictEqual(q1.qposts, q0.qposts, 'nothing sent'); assert.deepStrictEqual(q1.queue, q0.queue, 'queue unchanged');
  assert.strictEqual(await p.inputValue('#qName'), '');
  await p.click('#egg'); assert.ok(await p.isHidden('#egg'), 'a tap clears it');
  await ctx.close();

  // ---- 6. Q (forced: every launch here)
  ({ ctx, p } = await open(b, 0));
  p.on('pageerror', e => errs.push(e.message));
  await p.waitForSelector('#egg.q', { timeout: 8000 });
  assert.strictEqual(await txt(p, '#egg .egg-q'), 'Mon Capitaine. Still playing with your little calendar? Q');
  await p.waitForTimeout(900); await p.screenshot({ path: D + 'egg-q.png' });
  await p.click('#egg'); assert.ok(await p.isHidden('#egg'));
  await ctx.close();

  // ---- and not otherwise
  ({ ctx, p } = await open(b, 0.5));
  await p.waitForTimeout(5500); assert.ok(await p.isHidden('#egg'), 'Q stays away');
  await ctx.close();

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
