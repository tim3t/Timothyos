// GROWTH (2.20, bridge 1.22): the old HOBBIES area is named GROWTH everywhere (Notion's Personal
// Growth Life Area lands there), standby until the Growth calendar is linked, then a live area:
// Today, Horizon, Systems, Capture (its own chip), BALANCE hours against its minimum, Review hours.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8104/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"today"'); }, conn(port));

  // --- not linked (bridge 1.21): GROWTH on standby, no HOBBIES anywhere
  await setup(8103); await p.reload(); await p.waitForTimeout(1800);
  assert.ok((await txt(p, '.arow.stub.a-hobby')).includes('GROWTH'));
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.ok(await p.isDisabled('#capGrowth')); assert.ok((await p.textContent('#capGrowth')).includes('GROWTH'));
  await p.click('#capCancel');
  assert.ok(!(await p.evaluate(() => document.body.innerText)).includes('HOBBIES'), 'renamed');

  // --- linked (bridge 1.22)
  await setup(8104); await p.reload(); await p.waitForTimeout(2000);
  const row = await txt(p, '.arow.a-hobby');
  console.log('today growth:', row);
  assert.ok(row.startsWith('GROWTH') && !row.includes('STANDBY') && /\d ITEMS?$/.test(row) && !row.includes('undefined'), row);
  await p.click('.elbow'); await p.waitForTimeout(600);
  assert.ok(await p.locator('.ov-day.today .seg.a-hobby').count() === 1 || await p.locator('.ov-day .seg.a-hobby').count() >= 6, 'Horizon stacks Growth hours');
  const bal = (await p.locator('.ov-bal.a-hobby').innerText()).replace(/\s+/g, ' ').trim();
  console.log('balance growth:', bal);
  assert.ok(/^GROWTH \d OF 7 DAYS · [\d.]+H OF 3H/.test(bal), 'dots plus hours against the 3 h minimum');
  assert.ok(bal.includes('GOAL MET'), 'an hour every evening meets 3 h');

  await p.click('#status'); await p.waitForTimeout(400);
  const cal = await txt(p, 'section:has(.phead:has-text("CALENDARS"))');
  assert.ok(cal.includes('TAKE CAPTURES') && cal.includes('GROWTH'), cal.slice(0, 200));
  assert.ok((await txt(p, '#sec-balance')).includes('GROWTH AT LEAST'));

  // --- Capture to Growth
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.ok(!(await p.isDisabled('#capGrowth')));
  await p.click('#capGrowth');
  assert.strictEqual(await p.textContent('#capMode'), 'GROWTH CALENDAR');
  await p.fill('#capText', 'Sketching hour'); await p.click('#capSave'); await p.waitForTimeout(1500);
  assert.ok((await stats()).createdAreas.some(x => x[0] === 'Sketching hour' && x[1] === 'hobby'), 'saved to the Growth calendar');

  // --- Review shows Growth hours
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  await p.click('.rl-card.due'); await p.waitForTimeout(1500);
  const rows = (await p.locator('.rv-row').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('review rows:', rows.join(' | '));
  assert.ok(rows.some(r => r.startsWith('GROWTH')), 'Growth hours in the review');
  await p.screenshot({ path: D + 'growth-review.png' });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
