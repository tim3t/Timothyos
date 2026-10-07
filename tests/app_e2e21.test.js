// Motion + standby: the press light-up, screens rising in only on navigation (never on a
// background sync), + details easing open, sheets sliding away, and Reduce Motion. Standby:
// STANDBY in the top bar, idle timeout from Systems, night look, OFF, and a wake tap that
// presses nothing underneath.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const CONN = JSON.stringify({ url: 'http://127.0.0.1:8100/macros/s/test/exec', key: K });
const has = (p, sel, cls) => p.evaluate(([s, c]) => { const el = document.querySelector(s); return !!el && el.classList.contains(c); }, [sel, cls]);

(async () => {
  const b = await chromium.launch(); const errs = [];
  // --- motion, with a fixed clock
  let ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  let p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T08:14:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"bridge"'); }, CONN);
  await p.reload(); await p.waitForTimeout(1800);

  // press light-up
  const box = await p.locator('[data-screen="week"].nav').boundingBox();
  await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down();
  assert.ok(await has(p, '[data-screen="week"].nav', 'flash'), 'LCARS light-up on press');
  await p.mouse.up(); await p.waitForTimeout(60);
  assert.ok(await has(p, '#content', 'enter') && await has(p, '#content', 'grow-in'), 'screen rises in on navigation');
  await p.waitForTimeout(800);
  assert.ok(!(await has(p, '#content', 'enter')), 'cleared afterwards');
  await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(800);
  assert.ok(!(await has(p, '#content', 'enter')) && !(await has(p, '#content', 'grow-in')), 'a background sync re-renders without animating');

  // + details ease open and the + turns
  await p.click('.elbow'); await p.waitForTimeout(800);
  await p.click('[data-more="now"]');
  assert.ok(await has(p, '[data-more="now"]', 'turn') && await has(p, '[data-panel="now"]', 'opening'));
  assert.strictEqual(await p.getAttribute('[data-more="now"]', 'aria-expanded'), 'true');
  await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => document.querySelector('[data-panel="now"]').style.height), '', 'height released after easing');

  // sheets slide away before hiding
  await p.click('#capBtn'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('#capScrim'));
  await p.click('#capCancel');
  assert.ok(await has(p, '#capScrim', 'closing'), 'slides down first');
  await p.waitForTimeout(300);
  assert.ok(await p.isHidden('#capScrim'));

  // a priority marked done pops (if today has picks in the sample data)
  const open = p.locator('.prio:not(.done)');
  if (await open.count()) { const id = await open.first().getAttribute('data-task'); await open.first().click(); assert.ok(await has(p, '.prio[data-task="' + id + '"]', 'justdone')); }

  // --- standby from the top bar
  await p.click('#idleBtn'); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#standby') && await has(p, '#standby', 'on'));
  const sbText = (await p.innerText('#standby')).replace(/\s+/g, ' ');
  console.log('standby:', sbText);
  assert.ok(sbText.startsWith('08:14 WEDNESDAY 07 OCTOBER') && /NEXT UP|NOW/.test(sbText) && /CONDITION (GREEN|YELLOW|RED)/.test(sbText) && sbText.includes('TAP ANYWHERE TO WAKE'));
  assert.ok(!(await has(p, '#standby', 'night')), 'day look in the morning');
  await p.waitForTimeout(1800); await p.screenshot({ path: D + 'standby-day.png' });
  // the wake tap lands where LEDGER is, but only wakes
  const lg = await p.locator('[data-screen="ledger"].nav').boundingBox();
  await p.mouse.click(lg.x + 20, lg.y + 20); await p.waitForTimeout(500);
  assert.ok(await p.isHidden('#standby'), 'tap wakes');
  assert.ok((await p.textContent('#eyebrow')).startsWith('BRIDGE'), 'and presses nothing underneath');

  // Systems: standby setting
  await p.click('#status'); await p.waitForTimeout(400);
  const sys = (await p.innerText('section:has(.phead:has-text("STANDBY"))')).replace(/\s+/g, ' ');
  console.log('systems:', sys.slice(0, 160));
  assert.ok(sys.includes('AFTER 15 MIN') && sys.includes('SCREEN ON'));
  await p.click('[data-standby="5"]');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.standby.v1')), '5');
  await p.click('[data-act="standbynow"]'); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#standby')); await p.keyboard.press('Space'); await p.waitForTimeout(500);
  assert.ok(await p.isHidden('#standby'), 'a key wakes too');
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('#idleBtn'); await p.waitForTimeout(1900);
  await p.screenshot({ path: D + 'standby-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400);
  await p.mouse.click(200, 400); await p.waitForTimeout(400);
  await ctx.close();

  // --- Reduce Motion: sheets close at once, nothing rises in
  ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', reducedMotion: 'reduce' });
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T08:14:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, CONN);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('#capBtn'); await p.click('#capCancel');
  assert.ok(await p.isHidden('#capScrim'), 'no slide with Reduce Motion');
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(50);
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.querySelector('#content > *')).animationName), 'none');
  await ctx.close();

  // --- idle timeout, at night, on a running clock
  ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-07T23:10:00-05:00') });
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.standby.v1', '5'); }, CONN);
  await p.reload();
  for (let i = 0; i < 10; i++) { await p.waitForTimeout(150); await p.clock.runFor(500); }
  await p.clock.runFor(4 * 60000); await p.waitForTimeout(100);
  assert.ok(await p.isHidden('#standby'), 'not before 5 minutes');
  await p.clock.runFor(70000); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('#standby') && await has(p, '#standby', 'night'), 'after 5 minutes, night look at 23:15');
  await p.clock.runFor(2000); await p.waitForTimeout(1900);   /* the fade runs on real time */
  await p.screenshot({ path: D + 'standby-night.png' });
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('standby')).opacity), '1', 'the black layer is fully opaque at night');
  await p.mouse.click(600, 400); await p.clock.runFor(1000); await p.waitForTimeout(100);
  assert.ok(await p.isHidden('#standby'));
  // OFF: never idles
  await p.evaluate(() => localStorage.setItem('tos.standby.v1', '0'));
  await p.clock.runFor(20 * 60000); await p.waitForTimeout(100);
  assert.ok(await p.isHidden('#standby'), 'OFF stays awake as before');
  await ctx.close();

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
