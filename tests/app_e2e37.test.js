// ENGINEERING (2.24, controls 2.25): Home Assistant through the Storage relay's /ha path (simulated on :8110) and
// UPKEEP kept on the iPad. Not set up: points to Systems. HOME ASSISTANT in Systems: USE THE STORAGE
// RELAY, a wrong token refused, the right one tested. CONTROLS starts empty; + ADD DEVICE searches
// Home Assistant, then a card style and an iPad-only group (new groups made on the way); a switch toggles;
// Skylight 2's panel sends brightness, colour from the wheel (throttled), a quick color, white and an
// effect; a DIMMER card's bar; ALL OFF, folding, LIST view, GROUPS (rename, reorder, delete); REMOVE.
// UPKEEP starts empty; items by time and by miles, overdue ones in the Bridge's CONDITION, MARK DONE, edit, delete, phone width. Fixed clock: Thu 15 Oct 2026. Names invented.
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

  // ---- Engineering's styles stay out of other screens (2.25.1): the Life Areas / streak swatches (.sw)
  // and the Bridge's week bars (.seg) keep their own look
  const leak = await p.evaluate(() => {
    const box = document.createElement('div'); box.innerHTML = '<div class="arow"><span class="sw"></span></div><div class="ov-day"><span class="seg"></span></div><button class="chip sm">X</button>';
    document.body.appendChild(box);
    const sw = getComputedStyle(box.querySelector('.sw')), seg = getComputedStyle(box.querySelector('.seg')), chip = getComputedStyle(box.querySelector('.chip'));
    const r = { swW: sw.width, swRadius: sw.borderTopLeftRadius, segBorder: seg.borderTopWidth, segPad: seg.paddingTop, chipFont: chip.fontSize };
    box.remove(); return r;
  });
  assert.ok(leak.swW !== '70px' && leak.swRadius !== '21px', 'swatch untouched: ' + JSON.stringify(leak));
  assert.ok(leak.segBorder === '0px' && leak.segPad === '0px', 'week bars untouched: ' + JSON.stringify(leak));
  assert.strictEqual(leak.chipFont, '13px', 'small chips keep 13px');

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
  assert.deepStrictEqual(all, ['Barn Porch', 'Main Floor', 'Pond Lights Outlet', 'Pond Water Temp', 'Skylight 2'], 'automations left out, sorted by name');
  assert.ok((await txt(p, '.ha-hit:has-text("Skylight 2")')).includes('color, white, brightness'));
  const addDev = async (q, id, opts) => {
    if (!(await p.$('#haQ'))) { await p.click('[data-eng="add"]'); await p.waitForSelector('.ha-hit'); }
    await p.fill('#haQ', q); await p.waitForTimeout(80);
    await p.click('[data-hapick="' + id + '"]'); await p.waitForSelector('[data-haaddgo]');
    if (opts.expect) assert.strictEqual(await p.getAttribute('[data-hastyle][aria-pressed="true"]', 'data-hastyle'), opts.expect, 'default style for ' + id);
    if (opts.style) await p.click('[data-hastyle="' + opts.style + '"]');
    if (opts.newGroup) { await p.fill('#haAddNewG', opts.newGroup); await p.click('[data-hanewg="add"]'); }
    if (opts.group) await p.click('[data-hagrp]:text-is("' + opts.group + '")');
    await p.click('[data-haaddgo]'); await p.waitForTimeout(250);
  };
  // the switch: COLOR and DIMMER don't fit it; a new group made on the way
  await p.fill('#haQ', 'pond lights'); await p.waitForTimeout(80);
  await p.click('[data-hapick="switch.pond_lights_outlet"]'); await p.waitForSelector('[data-haaddgo]');
  assert.ok(await p.isDisabled('[data-hastyle="color"]') && await p.isDisabled('[data-hastyle="dimmer"]') && await p.isDisabled('[data-hastyle="reading"]'));
  await p.click('#detailClose'); await p.waitForTimeout(250);
  await addDev('pond lights', 'switch.pond_lights_outlet', { expect: 'toggle', newGroup: 'Outside' });
  await addDev('temp', 'sensor.pond_water_temp', { expect: 'reading', group: 'OUTSIDE' });
  await addDev('sky', 'light.skylight_2', { expect: 'color', newGroup: 'Living Room' });
  await addDev('barn', 'light.barn_porch', { expect: 'dimmer', style: 'mini' });
  await addDev('main', 'climate.main_floor', {});   /* a thermostat: no card styles to choose */
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hadev.v1')));
  assert.deepStrictEqual(saved.map(d => [d.id, d.style]), [['switch.pond_lights_outlet', 'toggle'], ['sensor.pond_water_temp', 'reading'], ['light.skylight_2', 'color'], ['light.barn_porch', 'mini'], ['climate.main_floor', 'climate']]);
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hagroups.v1')).map(g => g.nm)), ['OUTSIDE', 'LIVING ROOM']);
  await p.waitForFunction(() => /61\.4 °F/.test(document.getElementById('content').textContent), null, { timeout: 5000 });
  // 2.28: laid out by type; rooms as chips over the lights; each tile carries its room
  assert.deepStrictEqual(await p.$$eval('.ec-sec > .phead h2', n => n.map(x => x.textContent)), ['LIGHTS AND SWITCHES', 'CLIMATE', 'SENSORS']);
  assert.deepStrictEqual(await p.$$eval('[data-haroom]', n => n.map(x => x.textContent)), ['ALL', 'OUTSIDE', 'LIVING ROOM', 'OTHER']);
  const sensT = await txt(p, '.ec-sens'); assert.ok(sensT.includes('OUTSIDE') && sensT.includes('POND WATER TEMP') && sensT.includes('61.4'), sensT);
  assert.ok((await txt(p, '.hc:has([data-hatoggle="switch.pond_lights_outlet"])')).startsWith('OUTSIDE POND LIGHTS OUTLET'));
  assert.ok((await txt(p, '#eyebrow')).includes('CONTROLS · 5 DEVICES · 2 ON'), await txt(p, '#eyebrow'));
  // climate: the thermostat, + and − sent once after the taps settle, and modes
  await p.waitForFunction(() => /NOW 66/.test((document.querySelector('.ec-clim') || {}).textContent || ''), null, { timeout: 5000 });
  const cl = await txt(p, '.ec-clim');
  assert.ok(cl.includes('MAIN FLOOR · NOW 66°F') && cl.includes('68°F') && cl.includes('Heating to 68°F · humidity 41%'), cl);
  let cc = (await stats()).calls.length;
  await p.click('[data-haclim="1"]'); await p.click('[data-haclim="1"]');
  assert.ok((await txt(p, '.ec-clim .tgt')).startsWith('70'), 'shown at once');
  await p.waitForTimeout(1400);
  let cs = (await stats()).calls.slice(cc);
  assert.deepStrictEqual(cs, [{ svc: 'climate.set_temperature', entity_id: 'climate.main_floor', temperature: 70 }], 'one call after the taps');
  await p.click('[data-hahvac="cool"]'); await p.waitForTimeout(400);
  cs = (await stats()).calls; assert.deepStrictEqual(cs[cs.length - 1], { svc: 'climate.set_hvac_mode', entity_id: 'climate.main_floor', hvac_mode: 'cool' });
  assert.strictEqual(await p.getAttribute('[data-hahvac="cool"]', 'aria-pressed'), 'true');
  const sky = '.hc-color:has([data-hatoggle="light.skylight_2"])';
  assert.ok(await p.$eval(sky, n => n.classList.contains('on') && /rgb\(97, ?180, ?255\)/.test(n.style.getPropertyValue('--lc'))), 'colour card in the light\'s colour');
  assert.ok((await txt(p, sky)).includes('ON · 70% · COLOR'), await txt(p, sky));
  assert.ok(await p.isVisible('.hm:has-text("Barn Porch")'), 'compact button');
  await p.screenshot({ path: D + 'eng-controls.png' });

  // ---- the switch toggles, confirmed by a re-read
  const tile = '.hc:has([data-hatoggle="switch.pond_lights_outlet"])';
  assert.ok((await txt(p, tile)).includes('POND LIGHTS OUTLET OFF TAP TO TURN ON'), await txt(p, tile));
  const t0 = (await stats()).toggles;
  await p.click(tile + ' .hc-main');
  await p.waitForTimeout(1200);
  assert.strictEqual((await stats()).toggles, t0 + 1, 'one toggle sent');
  assert.ok((await txt(p, tile)).includes('ON TAP TO TURN OFF') && await p.$eval(tile, n => n.classList.contains('on')));

  // ---- Skylight 2's panel: brightness, the wheel (throttled), a quick color, white, an effect
  await p.click(sky + ' .hc-main'); await p.waitForSelector('#haWheel');
  assert.ok((await txt(p, '#detailSheet .sbar')).includes('SKYLIGHT 2 LIVING ROOM'));
  const calls = async () => (await stats()).calls;
  await p.$eval('#haB', el => { el.value = 40; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(300);
  let c = await calls();
  assert.deepStrictEqual(c[c.length - 1], { svc: 'light.turn_on', entity_id: 'light.skylight_2', brightness_pct: 40 });
  const n0 = c.length, w = await (await p.$('#haWheel')).boundingBox();
  await p.mouse.move(w.x + w.width / 2, w.y + w.height / 2); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(w.x + w.width / 2 + i * (w.width * 0.4 / 12), w.y + w.height / 2); await p.waitForTimeout(40); }
  await p.mouse.up(); await p.waitForTimeout(500);
  c = await calls();
  const wheel = c.slice(n0);
  assert.ok(wheel.length >= 2 && wheel.length <= 6, 'wheel sends are throttled: ' + wheel.length);
  const fin = wheel[wheel.length - 1];
  assert.ok(fin.hs_color && Math.abs(fin.hs_color[0] - 90) <= 2 && Math.abs(fin.hs_color[1] - 80) <= 3, 'east of centre = hue 90, 80%: ' + JSON.stringify(fin));
  await p.click('[data-hapreset="hs,0,95"]'); await p.waitForTimeout(250);
  c = await calls(); assert.deepStrictEqual(c[c.length - 1].hs_color, [0, 95]);
  await p.click('[data-hamode="ct"]'); await p.waitForSelector('#haK');
  assert.deepStrictEqual(await p.$eval('#haK', el => [el.min, el.max]), ['2000', '6500']);
  await p.$eval('#haK', el => { el.value = 3000; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);
  c = await calls(); assert.strictEqual(c[c.length - 1].color_temp_kelvin, 3000);
  assert.ok(!('hs_color' in c[c.length - 1]), 'never colour and white in one call');
  await p.click('[data-hafx="Candle"]'); await p.waitForTimeout(250);
  c = await calls(); assert.strictEqual(c[c.length - 1].effect, 'Candle');
  await p.screenshot({ path: D + 'eng-panel.png' });
  // style change from the panel: DIMMER, then drag its bar
  await p.click('[data-hastyle="dimmer"]'); await p.click('#detailClose'); await p.waitForTimeout(300);
  const dim = '.hc-dimmer:has([data-hatoggle="light.skylight_2"]) .hc-lvl';
  const bb = await (await p.$(dim)).boundingBox();
  await p.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2); await p.mouse.down();
  await p.mouse.move(bb.x + bb.width * 0.25, bb.y + bb.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400);
  c = await calls(); assert.ok(Math.abs(c[c.length - 1].brightness_pct - 25) <= 1, 'bar dims to 25%: ' + JSON.stringify(c[c.length - 1]));
  assert.ok((await txt(p, dim)).includes('25%'));

  // ---- a room's chip shows just that room; ALL OFF HERE; LIST view
  await p.click('[data-haroom]:text-is("LIVING ROOM")'); await p.waitForTimeout(150);
  assert.strictEqual(await p.locator('#content [data-hatoggle="switch.pond_lights_outlet"]').count(), 0, 'only the living room');
  assert.ok(await p.isVisible('.ec-clim') && await p.isVisible('.ec-sens'), 'climate and sensors stay');
  await p.click('[data-haalloff]'); await p.waitForTimeout(300);
  c = await calls(); assert.deepStrictEqual(c[c.length - 1], { svc: 'light.turn_off', entity_id: 'light.skylight_2' });
  assert.notStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.haroom.v1'))), 'all', 'room remembered');
  await p.click('[data-haroom="all"]'); await p.click('[data-haview="list"]'); await p.waitForTimeout(150);
  assert.strictEqual(await p.locator('.hr').count(), 4, 'rows for the lights and the sensor');
  const tb = (await stats()).toggles;
  await p.click('.hr:has-text("Barn Porch") .hsw'); await p.waitForTimeout(300);
  assert.strictEqual((await stats()).toggles, tb + 1);
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.haview.v1'))), 'list');
  await p.screenshot({ path: D + 'eng-list.png' });
  await p.click('[data-haview="cards"]');

  // ---- ROOMS: rename, reorder, delete (devices move to OTHER)
  await p.click('[data-eng="groups"]'); await p.waitForSelector('.hg-row');
  const lr = await p.getAttribute('.hg-row:nth-child(2) input', 'data-hagname');
  await p.fill('#hgn-' + lr, 'Lounge'); await p.waitForTimeout(100);
  await p.click('[data-hagmove="' + lr + ',-1"]');
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hagroups.v1')).map(g => g.nm)), ['LOUNGE', 'OUTSIDE']);
  const out = await p.getAttribute('.hg-row:nth-child(2) input', 'data-hagname');
  await p.click('[data-hagdel="' + out + '"]'); await p.click('[data-hagdel="' + out + '"]'); await p.waitForTimeout(100);
  await p.click('#detailClose'); await p.waitForTimeout(250);
  assert.deepStrictEqual(await p.$$eval('[data-haroom]', n => n.map(x => x.textContent)), ['ALL', 'LOUNGE', 'OTHER']);

  // ---- REMOVE (tap twice) takes a device off this screen only
  await p.click('.hc:has([data-hatoggle="switch.pond_lights_outlet"]) .hc-more'); await p.waitForSelector('[data-harm]');
  await p.click('[data-harm]'); assert.strictEqual(await txt(p, '[data-harm]'), 'TAP AGAIN TO REMOVE');
  await p.click('[data-harm]'); await p.waitForTimeout(250);
  assert.strictEqual(await p.locator('#content [data-hatoggle="switch.pond_lights_outlet"]').count(), 0);
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
