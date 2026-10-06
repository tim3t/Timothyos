// Farm calendar (bridge 1.8): standby until the bridge lists it, then a live area
// named after the calendar: Today, Week, Horizon, Systems, Capture (its own chip),
// Review hours (saved as Hours Farm), and Ask proposals for it. Work stays read-only.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8099/x/exec?action=stats&key=' + K)).json());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.ignore.v1', JSON.stringify(['away block'])); }, conn(port));

  // --- bridge 1.7, no farm calendar: standby everywhere
  await setup(8098); await p.reload(); await p.waitForTimeout(1800);
  assert.ok((await p.innerText('.arow.stub.a-farm')).includes('FARM + BEES'));
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.ok(await p.isDisabled('#capFarm')); assert.ok((await p.textContent('#capFarm')).includes('STANDBY'));
  await p.click('#capCancel');

  // --- bridge 1.8 with the farm calendar linked
  await setup(8099); await p.reload(); await p.waitForTimeout(2000);
  const farmRow = (await p.innerText('.arow.a-farm')).replace(/\s+/g, ' ');
  console.log('today life area:', farmRow);
  assert.ok(farmRow.includes('HILLTOP') && !farmRow.includes('STANDBY'), 'named after the calendar');
  assert.ok(await p.locator('.ev.a-farm, .tlb.a-farm, [class*="a-farm"]:has-text("Hive inspection")').count() >= 1, 'farm event on the timeline');

  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  assert.ok(await p.locator('.wkb.a-farm[title^="Hive inspection"]').count() === 1, 'farm block in Week');

  await p.click('.elbow'); await p.waitForTimeout(500);
  assert.ok(await p.locator('.ov-day.today .seg.a-farm').count() === 1, 'Horizon stacks farm hours');
  console.log('horizon today:', await p.textContent('.ov-day.today .hrs'));

  await p.click('[data-screen="systems"].nav'); await p.waitForTimeout(400);
  const cal = (await p.innerText('section:has(.phead:has-text("CALENDARS"))')).replace(/\s+/g, ' ');
  console.log('systems:', cal.slice(0, 160));
  assert.ok(cal.includes('WORK READ-ONLY · PERSONAL + HILLTOP TAKE CAPTURES') && /HILLTOP Hilltop OK/.test(cal));

  // --- Capture to the farm calendar; the choice is remembered
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.ok(!(await p.isDisabled('#capFarm')));
  await p.click('#capFarm');
  assert.strictEqual(await p.textContent('#capMode'), 'HILLTOP CALENDAR');
  assert.ok((await p.textContent('#capFootText')).includes('Hilltop Google Calendar'));
  await p.fill('#capText', 'Check water trough'); await p.click('#capSave'); await p.waitForTimeout(1500);
  let s = await stats();
  assert.ok(s.createdAreas.some(x => x[0] === 'Check water trough' && x[1] === 'farm'), 'saved to the farm calendar');
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.strictEqual(await p.getAttribute('#capFarm', 'aria-pressed'), 'true', 'last choice remembered');
  await p.click('[data-carea="personal"]'); await p.click('#capCancel');

  // --- Review: farm hours shown and saved
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  await p.click('.rl-card.due'); await p.waitForTimeout(1500);
  const rows = (await p.locator('.rv-row').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('review rows:', rows.slice(0, 4).join(' | '));
  assert.ok(rows.some(r => r.startsWith('HILLTOP 3.5H')), 'last week: Tue 1.5h + Sat 2h');
  assert.ok(!rows.some(r => r.startsWith('FARM + BEES')), 'no standby row once linked');
  await p.click('[data-act="savereview"]'); await p.waitForTimeout(1200);
  s = await stats(); assert.strictEqual(s.reviews['2026-09-28'].hoursFarm, 3.5, 'Hours Farm saved to Notion');

  // --- Ask: the snapshot names the calendar; a proposal can target it
  await p.click('#askBtn'); await p.waitForTimeout(300);
  await p.fill('#askText', 'Block time to feed the hive Saturday'); await p.click('#askSend'); await p.waitForTimeout(1200);
  s = await stats(); const a = s.asks[s.asks.length - 1];
  assert.ok(a.ctx.includes("CALENDARS: WORK (read-only), PERSONAL, HILLTOP (farm and bees; calendar 'farm' for proposals)"));
  assert.ok(a.ctx.includes('HILLTOP · Hive inspection'), 'farm events in the snapshot');
  const card = p.locator('.prop').last();
  assert.ok((await card.innerText()).includes('ADD TO HILLTOP CALENDAR · Feed the hives'));
  await card.locator('[data-pok]').click(); await p.waitForTimeout(1500);
  s = await stats(); assert.ok(s.createdAreas.some(x => x[0] === 'Feed the hives' && x[1] === 'farm'));
  await p.click('#askClose');
  await p.click('.elbow'); await p.waitForTimeout(400);
  await p.screenshot({ path: D + 'farm-bridge.png' });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
