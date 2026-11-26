// A VACUUM in ENGINEERING (2.92, D84; simulated relay with Home Assistant and an invented Roborock). + ADD DEVICE lists
// it and finds its battery and error sensors; it shows under CLEANING with its state large, its battery and START /
// PAUSE / DOCK / LOCATE (each sends its vacuum service; one that can't act is dimmed; START reads RESUME when paused);
// a low battery turns the bar red; a problem names its reason. The Bridge's Condition says "Vacuum needs you" while
// it reports a problem (read every 2 minutes while the Bridge is open) and drops it once it docks. LIST view, phone width.
// The page clock is installed (not frozen) so the 30-second and 2-minute reads can be run forward.
const { chromium } = require('playwright');
const { lane, P8104 } = require('./lib/lane');
const { reachIns } = require('./lib/classguard');
const assert = require('assert');
const until = require('./lib/explain').until(10000, 150);
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const vac = q => fetch(R + '/__havac?' + q).then(r => r.json());
const calls = () => fetch(R + '/__stats').then(r => r.json()).then(j => (j.calls || []).filter(c => /^vacuum\./.test(c.svc)));
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const tick = async (p, ms) => { for (let t = 0; t < ms; t += 1000) { await p.clock.runFor(1000); await new Promise(res => setTimeout(res, 30)); } };

(async () => {
  await fetch(R + '/__hareset'); await vac('on=1&state=docked&err=none&batt=84');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-26T09:00:00-06:00') });
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r, port]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.ha.v1', JSON.stringify({ url: r + '/ha', token: 'ha-test-token' }));
    localStorage.setItem('tos.hadev.v1', JSON.stringify([{ id: 'sensor.pond_water_temp', name: 'Pond Water Temp' }]));
    localStorage.setItem('tos.hascnchk.v1', JSON.stringify({ at: Date.now(), res: 'ready' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'engineering'])); localStorage.setItem('tos.start.v1', '"bridge"');
  }, [K, R, P8104]);
  await p.reload(); await p.waitForSelector('#status');
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('[data-eng="add"]');

  // ---- + ADD DEVICE lists the vacuum, and finds its battery and error sensors
  await p.click('[data-eng="add"]'); await p.waitForSelector('.ha-hit');
  await p.fill('#haQ', 'robo'); await tick(p, 1);
  assert.ok((await txt(p, '.ha-hit:has-text("vacuum.sample_robo")')).includes('vacuum'), await txt(p, '#haList'));
  await p.click('[data-hapick="vacuum.sample_robo"]'); await p.waitForSelector('[data-haaddgo]');
  assert.ok((await txt(p, '#detailSheet')).includes('Shown under CLEANING'), 'no card styles to pick');
  await p.click('[data-haaddgo]');
  const dev = (await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hadev.v1')))).find(d => d.id === 'vacuum.sample_robo');
  assert.deepStrictEqual(dev.sib, { batt: 'sensor.sample_robo_battery', err: 'sensor.sample_robo_vacuum_error' });
  const card = () => txt(p, '.ec-vac');
  const on = async sel => !(await p.isDisabled(sel));
  await until(async () => /DOCKED Charging BATTERY 84%/.test(await card()), 10000, 'the card, docked');
  assert.ok((await txt(p, '.ec-vacs')).startsWith('CLEANING'));
  assert.deepStrictEqual([await on('[data-havac="start"]'), await on('[data-havac="pause"]'), await on('[data-havac="dock"]'), await on('[data-havac="locate"]')], [true, false, false, true], 'docked: START and LOCATE');

  // ---- START, PAUSE (then RESUME), DOCK, LOCATE: each sends its service
  const n0 = (await calls()).length;
  await p.click('[data-havac="start"]');
  await until(async () => (await card()).startsWith('SAMPLE ROBO CLEANING Cleaning since'), 5000, 'cleaning');
  assert.strictEqual(await p.locator('.ec-vsweep').count(), 1, 'the moving line while it cleans');
  await p.click('[data-havac="pause"]');
  await until(async () => /PAUSED Paused since .* RESUME carries on/.test(await card()), 5000, 'paused');
  assert.strictEqual(await txt(p, '[data-havac="start"]'), 'RESUME');
  await p.click('[data-havac="dock"]');
  await until(async () => (await card()).includes('RETURNING On its way to the dock'), 5000, 'returning');
  await p.click('[data-havac="locate"]');
  await until(async () => (await txt(p, '#toast')).includes('Sample Robo is beeping'), 5000, 'the beep');
  assert.deepStrictEqual((await calls()).slice(n0).map(c => [c.svc, c.entity_id]), [['vacuum.start', 'vacuum.sample_robo'], ['vacuum.pause', 'vacuum.sample_robo'], ['vacuum.return_to_base', 'vacuum.sample_robo'], ['vacuum.locate', 'vacuum.sample_robo']]);

  // ---- a low battery, and a problem with its reason (read on the 30-second refresh)
  await vac('state=error&err=main_brush_jammed&batt=12');
  await tick(p, 31000);
  await until(async () => /PROBLEM Main brush jammed BATTERY 12%/.test(await card()), 10000, 'the problem and the low battery');
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.querySelector('.ec-vbat b')).backgroundColor), await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bad').trim()).then(h => 'rgb(' + h.match(/\w\w/g).map(x => parseInt(x, 16)).join(', ') + ')'), 'red under 15%');
  assert.deepStrictEqual(await reachIns(p, 'engineering'), [], 'no rule from elsewhere reaches into ENGINEERING (B2)');
  await p.screenshot({ path: __dirname + '/out/eng-vacuum.png' });

  // ---- LIST view: one row
  await p.click('[data-haview="list"]');
  assert.ok((await txt(p, '.ec-vacs')).includes('Sample Robo PROBLEM · 12%'), await txt(p, '.ec-vacs'));
  await p.click('[data-haview="cards"]');

  // ---- the Bridge: "Vacuum needs you" while it reports a problem, read every 2 minutes; gone once it docks
  await p.click('.elbow'); await p.waitForSelector('#content .rb-alerts');
  await tick(p, 31000);
  await until(async () => (await txt(p, '#content .rb-alerts')).includes('Vacuum needs you Sample Robo: Main brush jammed'), 10000, 'the Condition line');
  await vac('state=docked&err=none&batt=60');
  await tick(p, 60000);
  assert.ok((await txt(p, '#content .rb-alerts')).includes('Vacuum needs you'), 'read again only after 2 minutes');
  await tick(p, 70000);
  await until(async () => !(await txt(p, '#content .rb-alerts')).includes('Vacuum needs you'), 10000, 'gone once docked');
  // and the line takes you to CONTROLS
  await vac('state=error&err=wheel_stuck'); await tick(p, 125000);
  await until(async () => (await txt(p, '#content .rb-alerts')).includes('Sample Robo: Wheel stuck'), 10000, 'back again');
  await p.click('#content .rb-alerts [data-act="engcontrols"]');
  await p.waitForSelector('.ec-vac');

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 }); await tick(p, 1);
  await p.locator('.ec-vac').scrollIntoViewIfNeeded(); await p.screenshot({ path: __dirname + '/out/eng-vacuum-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  assert.deepStrictEqual(errs, []);
  await b.close(); await vac('on=0'); await fetch(R + '/__hareset');
  console.log('VACUUM: added with its sensors, START/PAUSE/RESUME/DOCK/LOCATE, battery and problem, LIST, the Bridge\'s Condition: ok');
})().catch(async e => { console.error(e); await vac('on=0').catch(() => {}); process.exit(1); });
