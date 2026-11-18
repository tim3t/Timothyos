// ENGINEERING after a power cut (2.89.1; simulated relay with Home Assistant, devices invented). Every Home Assistant
// request has a 15-second limit: a device whose read never answers shows NO ANSWER and the reason, while the others
// show their states (one silent device used to leave every card at "…" for good). The SCENES check in SYSTEMS ends
// as NOT CHECKED instead of "Checking…" forever. Once Home Assistant answers again, SAVE AND TEST reads the devices
// and scenes at once. The page clock is installed (not frozen) so the 15 seconds can be run forward.
const { chromium } = require('playwright');
const { lane, P8104 } = require('./lib/lane');
const assert = require('assert');
const until = require('./lib/explain').until(10000, 150);
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const opt = q => fetch(R + '/__haopt?' + q).then(r => r.json());
const tick = async (p, ms) => { for (let t = 0; t < ms; t += 1000) { await p.clock.runFor(1000); await new Promise(res => setTimeout(res, 40)); } };   // the page's time, in steps, so real answers land between them
const card = (p, id) => p.evaluate(i => { const b = document.querySelector('.hc-more[data-hadev="' + i + '"]'); return b ? b.parentElement.innerText.replace(/\s+/g, ' ').trim() : ''; }, id);

(async () => {
  await fetch(R + '/__hareset'); await opt('hang=light.barn_porch&delete=1');   // delete=1: the relay lets DELETE through, so the SCENES check can say READY
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-18T08:00:00-06:00') });
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r, port]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.ha.v1', JSON.stringify({ url: r + '/ha', token: 'ha-test-token' }));
    localStorage.setItem('tos.hadev.v1', JSON.stringify([{ id: 'switch.pond_lights_outlet', name: 'Pond Lights Outlet' }, { id: 'light.barn_porch', name: 'Barn Porch' }, { id: 'sensor.pond_water_temp', name: 'Pond Water Temp' }]));
    localStorage.setItem('tos.hascnchk.v1', JSON.stringify({ at: Date.now(), res: 'ready' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'engineering']));
  }, [K, R, P8104]);
  await p.reload(); await p.waitForSelector('#status');
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('.hc-more');

  // ---- one device never answers: within 15 seconds it says so, and the others show their states
  await p.clock.runFor(2000);
  assert.ok((await card(p, 'light.barn_porch')).includes('…'), 'before the limit, the silent one is still waiting: ' + await card(p, 'light.barn_porch'));
  await p.clock.runFor(14000);
  await until(async () => (await card(p, 'light.barn_porch')).includes('NO ANSWER'), 10000, 'the silent device marked');
  assert.ok((await card(p, 'switch.pond_lights_outlet')).includes('OFF'), await card(p, 'switch.pond_lights_outlet'));
  assert.ok((await card(p, 'sensor.pond_water_temp')).includes('61.4'), await card(p, 'sensor.pond_water_temp'));
  const err = await p.innerText('.eng .err');
  assert.ok(err.includes("didn't answer within 15 seconds") && err.includes('(1 of 3 devices)'), err);
  assert.ok(/device read/.test(await p.evaluate(() => localStorage.getItem('tos.errlog.v1'))), 'in the error log, for COPY DIAGNOSTICS');

  // ---- nothing answers: the SCENES check ends as NOT CHECKED, not "Checking…" for good
  await opt('hang=all');
  await p.click('#status'); await p.click('[data-act="hascncheck"]');
  assert.ok((await p.innerText('#sec-ha')).includes('Checking…'));
  await p.clock.runFor(16000);
  await until(async () => (await p.innerText('#sec-ha')).includes('NOT CHECKED'), 10000, 'the check gives up');

  // ---- Home Assistant back: SAVE AND TEST reads the devices and the scenes again at once. The reads left hanging hold
  // the browser's six connections to the relay until their limit ends them (without a limit they held them for good)
  await opt('hang=');
  await tick(p, 16000);
  await p.click('[data-act="hasave"]');
  await until(async () => (await p.innerText('#sec-ha')).includes('READY'), 10000, 'scenes checked again');
  await p.click('[data-screen="engineering"].nav');
  await until(async () => (await card(p, 'light.barn_porch')).includes('50%'), 10000, 'the device read again');
  assert.ok(!(await card(p, 'light.barn_porch')).includes('NO ANSWER'));
  assert.strictEqual(await p.locator('.eng .err').count(), 0, 'no problem left');

  assert.deepStrictEqual(errs, []);
  await b.close(); await opt('hang=');
  console.log('ENGINEERING after a power cut: a silent device times out alone, the SCENES check ends, SAVE AND TEST reads again: ok');
})().catch(async e => { console.error(e); await opt('hang=').catch(() => {}); process.exit(1); });
