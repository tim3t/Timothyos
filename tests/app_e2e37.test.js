// ENGINEERING (2.24): Home Assistant through the Storage relay's /ha path (simulated on :8110) and
// UPKEEP kept on the iPad. Not set up: points to Systems. HOME ASSISTANT in Systems: USE THE STORAGE
// RELAY, a wrong token refused, the right one tested. CONTROLS starts empty; + ADD DEVICE searches
// Home Assistant (switches, lights, sensors only), a switch toggles, a sensor reads, REMOVE takes a
// device off the screen. UPKEEP starts empty; items by time and by miles, overdue ones in the
// Bridge's CONDITION, MARK DONE, edit, delete, phone width. Fixed clock: Thu 15 Oct 2026. Names invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:8110';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const stats = () => fetch(R + '/__stats').then(r => r.json());

(async () => {
  await fetch(R + '/__hareset');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-15T10:00:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom', 'review', 'log', 'storage', 'engineering']));
  }, [K, R]);
  await p.reload(); await p.waitForTimeout(1500);

  // ---- not set up: CONTROLS points to Systems
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('.eng');
  assert.strictEqual(await txt(p, '#title'), 'ENGINEERING');
  assert.ok((await txt(p, '#eyebrow')).includes('HOME ASSISTANT NOT SET'));
  assert.ok((await txt(p, '#content')).includes('under HOME ASSISTANT in Systems'));
  assert.strictEqual(await p.locator('[data-eng="add"]').count(), 0, 'no ADD DEVICE before setup');
  await p.click('[data-eng="systems"]'); await p.waitForSelector('#sec-ha');
  assert.ok((await txt(p, '#sec-ha')).includes('NOT SET'));

  // ---- Systems: the relay address filled in for you; wrong token refused, then the right one
  await p.click('[data-act="harelay"]');
  assert.strictEqual(await p.inputValue('#haUrl'), R + '/ha');
  await p.fill('#haTok', 'nope'); await p.click('[data-act="hasave"]');
  await p.waitForFunction(() => /refused the token/.test(document.getElementById('haErr').textContent), null, { timeout: 5000 });
  assert.ok((await stats()).ha_denied >= 1, 'Home Assistant itself refused it, past the relay');
  await p.fill('#haTok', 'ha-test-token'); await p.click('[data-act="hasave"]');
  await p.waitForFunction(() => /Home Assistant connected/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  const sec = await txt(p, '#sec-ha');
  assert.ok(sec.includes('•••• oken') && sec.includes('through the Storage relay') && !sec.includes('ha-test-token'), sec);
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.ha.v1'))), { url: R + '/ha', token: 'ha-test-token' });

  // ---- CONTROLS starts empty; ADD DEVICE lists switches, lights and sensors, searchable
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('[data-eng="add"]');
  assert.ok((await txt(p, '#content')).includes('No devices yet'));
  await p.click('[data-eng="add"]'); await p.waitForSelector('.ha-hit');
  const all = await p.$$eval('.ha-hit b', n => n.map(x => x.textContent));
  assert.deepStrictEqual(all, ['Barn Porch', 'Pond Lights Outlet', 'Pond Water Temp'], 'automations left out, sorted by name');
  await p.fill('#haQ', 'pond lights'); await p.waitForTimeout(100);
  assert.deepStrictEqual(await p.$$eval('.ha-hit b', n => n.map(x => x.textContent)), ['Pond Lights Outlet']);
  await p.click('[data-haadd="switch.pond_lights_outlet"]'); await p.waitForTimeout(100);
  assert.ok((await txt(p, '.ha-hit')).includes('ADDED'));
  await p.fill('#haQ', 'temp'); await p.waitForTimeout(100);
  await p.click('[data-haadd="sensor.pond_water_temp"]');
  await p.click('#detailClose'); await p.waitForTimeout(300);
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hadev.v1')).map(d => d.id)), ['switch.pond_lights_outlet', 'sensor.pond_water_temp']);

  // ---- tiles: the switch toggles, the sensor reads
  await p.waitForFunction(() => /61\.4 °F/.test(document.getElementById('content').textContent), null, { timeout: 5000 });
  const tile = '.eng-dev:has([data-hatoggle="switch.pond_lights_outlet"])';
  assert.ok((await txt(p, tile)).includes('POND LIGHTS OUTLET OFF TAP TO TURN ON'), await txt(p, tile));
  assert.ok((await txt(p, '#eyebrow')).includes('CONTROLS · 2 DEVICES'));
  await p.screenshot({ path: D + 'eng-controls.png' });
  const t0 = (await stats()).toggles;
  await p.click('[data-hatoggle="switch.pond_lights_outlet"]');
  await p.waitForFunction(() => document.querySelector('[data-hatoggle="switch.pond_lights_outlet"]').getAttribute('aria-pressed') === 'true');
  await p.waitForTimeout(1200);
  assert.strictEqual((await stats()).toggles, t0 + 1, 'one toggle sent');
  assert.ok((await txt(p, tile)).includes('ON TAP TO TURN OFF'), 'confirmed on by the re-read');
  assert.ok(await p.$eval(tile, n => n.classList.contains('on')));
  await p.screenshot({ path: D + 'eng-on.png' });

  // ---- REMOVE (tap twice) takes it off this screen only
  const rm = '.eng-dev:has([data-hatoggle="switch.pond_lights_outlet"]) [data-eng="rmdev"]';
  await p.click(rm); assert.strictEqual(await txt(p, rm), 'TAP AGAIN TO REMOVE');
  await p.click(rm); await p.waitForTimeout(200);
  assert.strictEqual(await p.locator('[data-hatoggle]').count(), 0);
  assert.ok((await txt(p, '#content')).includes('POND WATER TEMP'));

  // ---- UPKEEP starts empty
  await p.click('[data-engtab="upkeep"]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '#content')).includes('Nothing tracked yet'));
  assert.ok((await txt(p, '#eyebrow')).includes('UPKEEP · 0 ITEMS'));
  const add = async (o) => {
    await p.click('[data-eng="newitem"]'); await p.waitForSelector('#upName');
    await p.fill('#upName', o.name); await p.fill('#upCat', o.cat || ''); await p.fill('#upEvery', String(o.every));
    await p.click('[data-upunit="' + o.unit + '"]');
    if (o.last) await p.fill('#upLast', o.last);
    if (o.lastRead != null) { await p.fill('#upLastRead', String(o.lastRead)); await p.fill('#upRead', String(o.read)); }
    await p.click('[data-upsave]'); await p.waitForTimeout(250);
  };
  // validation
  await p.click('[data-eng="newitem"]'); await p.waitForSelector('#upName'); await p.click('[data-upsave]');
  assert.strictEqual(await txt(p, '#upErr'), 'Give it a name.');
  await p.click('#detailClose'); await p.waitForTimeout(250);
  await add({ name: 'Oil change', cat: 'Car', every: 5000, unit: 'miles', lastRead: 40000, read: 45200 });
  await add({ name: 'Furnace filter', cat: 'House', every: 3, unit: 'months', last: '2026-06-01' });
  await add({ name: 'Clean gutters', cat: 'House', every: 1, unit: 'years', last: '2026-10-01' });
  await add({ name: 'Blade sharpen', cat: 'Mower', every: 4, unit: 'weeks', last: '2026-09-21' });
  const rows = await p.$$eval('.up-row', n => n.map(x => [x.className.replace('up-row ', ''), x.querySelector('.nm').firstChild.textContent, x.querySelector('.due').textContent]));
  console.log(rows);
  assert.deepStrictEqual(rows, [
    ['bad', 'Furnace filter', '44 DAYS OVER'],
    ['bad', 'Oil change', '200 MI OVER'],
    ['warn', 'Blade sharpen', 'IN 4 DAYS'],
    ['ok', 'Clean gutters', '01 OCT 2027'],
  ]);
  assert.ok((await txt(p, '.eng-sum')).includes('2 OVERDUE 1 DUE SOON 1 ON SCHEDULE'));
  assert.ok((await txt(p, '#eyebrow')).includes('UPKEEP · 2 OVERDUE'));
  await p.screenshot({ path: D + 'eng-upkeep.png' });

  // ---- the Bridge: overdue upkeep in CONDITION, one tap back to UPKEEP
  await p.click('[data-screen="engineering"].nav'); // stays on upkeep (remembered)
  await p.click(".elbow[data-screen=\"bridge\"]"); await p.waitForSelector(".ov-cond");
  const cond = await txt(p, '.ov-cond');
  assert.ok(cond.includes('2 upkeep items overdue') && cond.includes('Furnace filter (House)'), cond);
  await p.click('.ov-alert[data-act="engineering"]'); await p.waitForSelector('.eng-up');
  assert.strictEqual(await p.getAttribute('[data-engtab="upkeep"]', 'aria-pressed'), 'true');

  // ---- MARK DONE: by time, then by miles (asks for the odometer)
  await p.click('.up-row:has-text("Furnace filter") [data-updone]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '#toast')).includes('Furnace filter done. Next 15 JAN'));
  await p.click('.up-row:has-text("Oil change") [data-updone]'); await p.waitForSelector('#upDoneRead');
  await p.fill('#upDoneRead', '45300'); await p.click('[data-updoneread]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '.up-row:has-text("Oil change")')).includes('5,000 MI LEFT'));
  assert.strictEqual(await p.locator('.up-row.bad').count(), 0);

  // ---- edit, then delete (tap twice)
  await p.click('.up-row:has-text("Blade sharpen") .up-main'); await p.waitForSelector('#upName');
  assert.strictEqual(await p.inputValue('#upName'), 'Blade sharpen');
  assert.strictEqual(await p.getAttribute('[data-upunit="weeks"]', 'aria-pressed'), 'true');
  await p.fill('#upName', 'Blade sharpening'); await p.click('[data-upsave]'); await p.waitForTimeout(200);
  await p.click('.up-row:has-text("Blade sharpening") .up-main'); await p.waitForSelector('[data-updel]');
  await p.click('[data-updel]'); assert.strictEqual(await txt(p, '[data-updel]'), 'TAP AGAIN TO DELETE');
  await p.click('[data-updel]'); await p.waitForTimeout(250);
  assert.strictEqual(await p.locator('.up-row').count(), 3);
  assert.ok(!(await txt(p, '#content')).includes('Blade'));

  // ---- phone width: nothing spills sideways
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll (upkeep)');
  await p.screenshot({ path: D + 'eng-upkeep-phone.png' });
  await p.click('[data-engtab="controls"]'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll (controls)');

  // ---- FORGET (tap twice) clears the address and token from this iPad
  await p.click('#status'); await p.waitForSelector('#sec-ha');
  await p.click('[data-act="haforget"]'); await p.click('[data-act="haforget"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.ha.v1')), null);

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
