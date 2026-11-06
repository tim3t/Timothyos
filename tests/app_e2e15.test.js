// Ignored events: a weekend "away" block on the work calendar fills the Week view (and inflated HORIZON
// until 2.63 took it off the Bridge). Ignoring its title (in Systems, or from the event's
// detail sheet) leaves it out of every view and total, and survives a reload.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/';
const CONN = JSON.stringify({ url: 'http://127.0.0.1:8095/macros/s/test/exec', key: 'k'.repeat(64) });

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tos.pins.v1')) localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month', 'dates', 'review', 'ledger', 'log'])); });   // the bar as it was before 2.7
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, CONN);
  await p.reload(); await p.waitForTimeout(2000);
  const away = () => p.locator('.wkb[title^="Away block"]').count();

  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  assert.ok(await away() > 0, 'the block fills the Week');
  await p.click('.elbow'); await p.waitForTimeout(400);

  // ignore by phrase in Systems
  await p.click('#status'); await p.waitForTimeout(300);
  await p.fill('#ignIn', 'away block');
  await p.click('[data-act="ignsave"]'); await p.waitForTimeout(200);
  console.log('toast:', await p.textContent('#toast'));
  assert.ok(/1 title ignored · [1-9]\d* events left out/.test(await p.textContent('#toast')));
  await p.click('.elbow'); await p.waitForTimeout(400);
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  assert.strictEqual(await away(), 0, 'gone from Week');
  await p.click('[data-screen="month"].nav'); await p.waitForTimeout(500);
  assert.ok(!(await p.textContent('#content')).includes('Away block'), 'gone from Month');

  // clear it, then ignore from the event itself
  await p.click('#status'); await p.waitForTimeout(300);
  await p.fill('#ignIn', ''); await p.click('[data-act="ignsave"]'); await p.waitForTimeout(200);
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  assert.ok(await away() >= 1, 'back in Week once cleared');
  await p.click('.wkb[title^="Away block"] >> nth=0'); await p.waitForTimeout(200);
  await p.screenshot({ path: D + 'ignore-detail.png' });
  await p.click('[data-ignore]'); await p.waitForTimeout(300);
  console.log('toast:', await p.textContent('#toast'));
  assert.ok((await p.textContent('#toast')).includes('Away block (auto-decline)'));
  assert.ok(await p.isHidden('#detailScrim'));
  assert.strictEqual(await away(), 0, 'gone from Week after IGNORE THIS TITLE');
  // busy (private) events don't offer the button
  await p.click('.wkb.busy >> nth=0'); await p.waitForTimeout(200);
  assert.strictEqual(await p.locator('#detailSheet [data-ignore]').count(), 0); await p.click('#detailClose');

  // survives a reload; Systems shows the title
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  assert.strictEqual(await away(), 0, 'still left out after a reload');
  await p.click('#status'); await p.waitForTimeout(300);
  assert.strictEqual(await p.inputValue('#ignIn'), 'Away block (auto-decline)');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
