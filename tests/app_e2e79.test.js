// ENGINEERING · SCENES (2.64; simulated bridge :8105, relay on RELAY_PORT with Home Assistant under /ha). Timothy's pick:
// Option A's scene bar, edited in IF / THEN sentences; scenes are Home Assistant automations (Bridge's own, id tos_…),
// so they run with the iPads asleep. Builds BEDTIME word by word (two IFs with their days, an ONLY IF, set / turn off /
// wait / fade), checks the exact automation Home Assistant receives, runs it with a tap (trigger, skipping the IF),
// opens it with a hold, pauses it, fills THEN from the lights as they are, marks one edited in the Home Assistant app
// read-only, deletes with the relay refusing DELETE and then allowing it, never touches Timothy's own automation, and
// shows SCENES' state in SYSTEMS (READY, NEEDS ADMIN, RELAY BLOCKS DELETE). Portrait too.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const ha = () => fetch(R + '/__hacfg').then(r => r.json());
const calls = () => fetch(R + '/__stats').then(r => r.json()).then(j => j.calls);

(async () => {
  await fetch(R + '/__hareset');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await quiet(ctx);
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');   /* not the morning briefing: it would ask the shared simulated bridge for voice while e2e48 counts those calls */ localStorage.setItem('tos.start.v1', '"today"');
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'engineering']));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.ha.v1', JSON.stringify({ url: r + '/ha', token: 'ha-test-token' }));
    localStorage.setItem('tos.hagroups.v1', JSON.stringify([{ id: 'g1', nm: 'BEDROOM' }]));
    localStorage.setItem('tos.hadev.v1', JSON.stringify([
      { id: 'light.skylight_2', name: 'Skylight 2', style: 'color', g: 'g1' }, { id: 'light.barn_porch', name: 'Barn Porch', style: 'dimmer', g: 'g1' },
      { id: 'switch.pond_lights_outlet', name: 'Pond Lights Outlet', style: 'toggle', g: null }]));
  }, [K, U, R]);
  await p.reload(); await settled(p, 1200);
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('.ec-scn');
  assert.ok(/No scenes yet/.test(await txt(p, '.ec-scn')), 'empty at first');
  assert.deepStrictEqual(await p.$$eval('.ec-sec > .phead h2', n => n.map(x => x.textContent)).then(x => x.slice(0, 2)), ['SCENES', 'LIGHTS AND SWITCHES'], 'SCENES above the lights');

  // ---- build BEDTIME, word by word
  await p.click('[data-scnnew]'); await p.waitForSelector('#detailSheet.scn-sheet #scnName');
  await p.fill('#scnName', 'Bedtime');
  await p.click('[data-scnadd="if"]'); await p.waitForSelector('.scn-pick');
  for (let i = 0; i < 6; i++) await p.click('[data-scnmm="5"]');
  assert.strictEqual(await txt(p, '.scn-clock'), '▲ 22 ▼ : ▲ 30 ▼');
  await p.click('[data-scndone]');
  await p.click('[data-scnadd="if"]'); await p.click('[data-scnft="sunset"]');
  for (let i = 0; i < 3; i++) await p.click('[data-scnoff="-5"]');
  await p.click('[data-scndays="we"]'); await p.click('[data-scndone]');
  await p.click('[data-scnadd="only"]'); await p.click('[data-scnonlyid="switch.pond_lights_outlet"]'); await p.click('[data-scnonlyst="off"]'); await p.click('[data-scndone]');
  await p.click('[data-scnadd="set"]');
  assert.strictEqual(await p.locator('[data-scnid="switch.pond_lights_outlet"]').count(), 0, 'SET offers dimmable lights only');
  await p.click('[data-scnroom="g1"]'); await p.click('[data-scndone]');
  await p.click('.scn-row.step >> nth=0 >> [data-scnp^="set:"]');
  await p.$eval('#scnB', e => { e.value = 30; e.dispatchEvent(new Event('input')); });
  await p.click('[data-scnmode="ct"]');
  await p.$eval('#scnK', e => { e.value = 2200; e.dispatchEvent(new Event('input')); });
  await p.click('[data-scndone]');
  await p.click('.scn-row.step >> nth=0 >> [data-scnp^="fade:"]'); await p.click('[data-scndur="60"]'); await p.click('[data-scndone]');
  await p.click('[data-scnadd="off"]'); await p.click('[data-scnid="switch.pond_lights_outlet"]'); await p.click('[data-scndone]');
  await p.click('[data-scnadd="wait"]'); await p.click('[data-scndur="3600"]'); await p.click('[data-scndone]');
  await p.click('[data-scnadd="off"]'); await p.click('[data-scnroom="g1"]'); await p.click('[data-scndone]');
  await p.click('.scn-row.step >> nth=3 >> [data-scnp^="fade:"]'); await p.click('[data-scndur="300"]'); await p.click('[data-scndone]');
  const reads = await txt(p, '#scnReads');
  console.log('reads as:', reads);
  assert.strictEqual(reads, "If it's 22:30 any day, or it's sunset −15 min on weekends, or you tap it, and the Pond Lights Outlet is off: set the BEDROOM lights to 30% · warm 2200 K over 1 min, then turn off Pond Lights Outlet, then wait 1 hr, then turn off the BEDROOM lights over 5 min.");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // ---- SAVE: exactly this automation in Home Assistant
  await p.click('[data-scnsave]'); await p.waitForSelector('#detailScrim', { state: 'hidden' });
  const H = await ha(), ids = Object.keys(H.cfg).filter(k => k.startsWith('tos_'));
  assert.strictEqual(ids.length, 1, 'one automation of Bridge\'s');
  const cfg = H.cfg[ids[0]];
  assert.deepStrictEqual(cfg, {
    id: ids[0], alias: 'TimothyOS · Bedtime', description: "Made in Bridge (TimothyOS) on ENGINEERING. Change it there to keep it editable in Bridge.", mode: 'restart',
    trigger: [{ platform: 'time', at: '22:30:00', id: 'if0' }, { platform: 'sun', event: 'sunset', offset: '-00:15:00', id: 'if1' }],
    condition: [{ condition: 'or', conditions: [{ condition: 'trigger', id: 'if0' }, { condition: 'and', conditions: [{ condition: 'trigger', id: 'if1' }, { condition: 'time', weekday: ['sat', 'sun'] }] }] },
      { condition: 'state', entity_id: 'switch.pond_lights_outlet', state: 'off' }],
    action: [{ service: 'light.turn_on', target: { entity_id: ['light.skylight_2', 'light.barn_porch'] }, data: { brightness_pct: 30, color_temp_kelvin: 2200, transition: 60 } },
      { service: 'homeassistant.turn_off', target: { entity_id: ['switch.pond_lights_outlet'] } },
      { delay: { seconds: 3600 } },
      { service: 'light.turn_off', target: { entity_id: ['light.skylight_2', 'light.barn_porch'] }, data: { transition: 300 } }]
  });
  await until(async () => await p.$('.scn-run') && /BEDTIME IF 22:30 daily \+1/.test(await txt(p, '.scn-b')), 8000);

  // ---- a tap runs the THEN (the IF skipped); a hold opens the IF / THEN
  await p.click('.scn-run');   // straight after SAVE: Bridge looks for the new automation's entity once, then runs it
  await until(async () => (await calls()).some(c => c.svc === 'automation.trigger' && c.entity_id === 'automation.timothyos_bedtime' && c.skip_condition === true));
  await until(async () => /BEDTIME running/.test(await txt(p, '#toast')), 4000);
  const box = await p.locator('.scn-run').first().boundingBox();
  await p.mouse.move(box.x + 30, box.y + 20); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
  await p.waitForSelector('#detailSheet.scn-sheet #scnName');
  assert.strictEqual(await p.inputValue('#scnName'), 'Bedtime');
  assert.strictEqual(await p.locator('.scn-row.step').count(), 4, 'read back from Home Assistant');
  // ---- RULE ON / OFF pauses it
  await p.click('[data-scnon]'); await until(async () => (await p.textContent('[data-scnon]')) === 'RULE OFF');
  assert.strictEqual((await ha()).ents['automation.timothyos_bedtime'].state, 'off');
  // ---- TAKE CURRENT LIGHTS: the chosen lights as they are now (not saved)
  await p.click('[data-scntake]'); await p.waitForSelector('[data-scntakego]');
  await p.click('[data-scntakego]');
  const steps = await p.$$eval('.scn-row.step', r => r.map(x => x.textContent.replace(/\s+/g, ' ').replace(/[▲✕]/g, '').trim()));
  console.log('taken:', steps.join(' | '));
  assert.ok(steps.some(s => /^Set Skylight 2 to 70% · color over at once$/.test(s)) && steps.some(s => /^Set Barn Porch to 50% · warm 2700 K over at once$/.test(s)) && steps.some(s => /^Turn off Pond Lights Outlet$/.test(s)), steps.join(' | '));
  await p.click('#detailClose');
  assert.ok(/BEDTIME PAUSED/.test(await txt(p, '.scn-b')), 'the bar says PAUSED');
  assert.deepStrictEqual((await ha()).cfg[ids[0]], cfg, 'closing without SAVE changes nothing');

  // ---- changed in the Home Assistant app into something Bridge can't show: read-only here
  await fetch(R + '/__hacfg?id=' + ids[0]);
  await p.reload(); await settled(p, 1200); await p.click('[data-screen="engineering"].nav');
  await until(async () => /EDITED IN HOME ASSISTANT/.test(await txt(p, '.ec-scn')));
  await p.click('[data-scnedit="' + ids[0] + '"]'); await p.waitForSelector('#detailSheet.scn-sheet');
  assert.ok(/EDITED IN HOME ASSISTANT/.test(await txt(p, '#detailSheet')) && await p.locator('[data-scnsave]').count() === 0 && await p.isVisible('[data-scntry]'), 'run or pause, never saved over');

  // ---- delete: the relay refuses DELETE, then lets it through
  await p.click('[data-scndel]'); await p.click('[data-scndel]');
  await until(async () => /doesn't let deletes through/.test(await txt(p, '#scnErr')));
  assert.ok((await ha()).cfg[ids[0]], 'still there');
  assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.errlog.v1'))).some(e => e.s === 'engineering' && e.a === 'scene delete' && e.m === 'relay blocks DELETE'), 'logged');
  await fetch(R + '/__haopt?delete=1');
  await p.click('[data-scndel]'); await p.click('[data-scndel]');
  await p.waitForSelector('#detailScrim', { state: 'hidden' });
  assert.strictEqual((await ha()).cfg[ids[0]], undefined, 'gone from Home Assistant');
  assert.ok(/No scenes yet/.test(await txt(p, '.ec-scn')));
  // ---- Timothy's own automation was never read, changed or deleted
  const after = await ha();
  assert.ok(after.cfg.nightly && after.ents['automation.nightly'] && after.ents['automation.nightly'].state === 'on');
  assert.ok(!(await calls()).some(c => JSON.stringify(c).includes('nightly')), 'never touched');

  // ---- SYSTEMS: SCENES READY, then NEEDS ADMIN, then RELAY BLOCKS DELETE
  await p.click('#status'); await p.waitForSelector('#sec-ha');
  await until(async () => /SCENES READY/.test(await txt(p, '#sec-ha')));
  await fetch(R + '/__haopt?admin=0'); await p.click('[data-act="hascncheck"]');
  await until(async () => /SCENES NEEDS ADMIN/.test(await txt(p, '#sec-ha')));
  await fetch(R + '/__haopt?admin=1&delete=0'); await p.click('[data-act="hascncheck"]');
  await until(async () => /SCENES RELAY BLOCKS DELETE/.test(await txt(p, '#sec-ha')));

  // ---- 2.66 SCENE ORDER: alphabetical until reordered; ▲ ▼ in a sheet; kept on reload; a new scene goes last; shared by PROFILE SYNC
  await fetch(R + '/__haopt?delete=1');
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('[data-scnnew]');
  const mk = async nm => {
    await p.click('[data-scnnew]'); await p.waitForSelector('#scnName'); await p.fill('#scnName', nm);
    await p.click('[data-scnadd="off"]'); await p.click('[data-scnid="switch.pond_lights_outlet"]'); await p.click('[data-scndone]');
    await p.click('[data-scnsave]'); await p.waitForSelector('#detailScrim', { state: 'hidden' });
  };
  const bar = () => p.$$eval('.scn-run b', n => n.map(x => x.textContent));
  await mk('Alpha');
  assert.strictEqual(await p.locator('[data-scnorder]').count(), 0, 'no ORDER with one scene');
  await mk('Zulu'); await mk('Gaming');
  await until(async () => (await bar()).join() === 'ALPHA,GAMING,ZULU');
  await p.click('[data-scnorder]'); await p.waitForSelector('#detailSheet.scn-ord');
  assert.deepStrictEqual(await p.$$eval('.scn-ordrow b', n => n.map(x => x.textContent)), ['ALPHA', 'GAMING', 'ZULU']);
  assert.ok(await p.isDisabled('.scn-ordrow >> nth=0 >> [data-scnmv$=",-1"]') && await p.isDisabled('.scn-ordrow >> nth=2 >> [data-scnmv$=",1"]'), 'ends disabled');
  const zid = await p.getAttribute('.scn-ordrow >> nth=2 >> [data-scnmv$=",-1"]', 'data-scnmv');
  await p.click('[data-scnmv="' + zid + '"]'); await p.click('[data-scnmv="' + zid + '"]');
  assert.deepStrictEqual(await p.$$eval('.scn-ordrow b', n => n.map(x => x.textContent)), ['ZULU', 'ALPHA', 'GAMING']);
  assert.strictEqual(await p.evaluate(() => document.activeElement && document.activeElement.dataset.scnmv || ''), zid.replace(',-1', ',1'), 'focus stays on the moved scene');
  await p.click('#detailClose');
  assert.strictEqual((await bar()).join(), 'ZULU,ALPHA,GAMING', 'the bar follows');
  const ord = JSON.parse(await p.evaluate(() => localStorage.getItem('tos.hascnord.v1')));
  assert.strictEqual(ord.length, 3);
  const H2 = await ha(); assert.ok(Object.values(H2.cfg).filter(c => /^TimothyOS · /.test(c.alias)).length === 3, 'Home Assistant holds the three scenes; nothing about order');
  await p.reload(); await settled(p, 1200); await p.click('[data-screen="engineering"].nav');
  await until(async () => (await bar()).join() === 'ZULU,ALPHA,GAMING');
  await mk('Beta');
  await until(async () => (await bar()).join() === 'ZULU,ALPHA,GAMING,BETA', 8000);
  await p.setViewportSize({ width: 820, height: 1180 });
  await p.click('[data-scnorder]'); await p.waitForSelector('#detailSheet.scn-ord');
  assert.ok(await p.evaluate(() => { const r = document.getElementById('detailSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }), 'ORDER fits portrait');
  await p.click('#detailClose'); await p.setViewportSize({ width: 1180, height: 820 });

  // ---- portrait: the modal fits
  await fetch(R + '/__haopt?delete=1');
  await p.setViewportSize({ width: 820, height: 1180 });
  await p.click('[data-screen="engineering"].nav'); await p.waitForSelector('[data-scnnew]');
  await p.click('[data-scnnew]'); await p.waitForSelector('#detailSheet.scn-sheet');
  assert.ok(await p.evaluate(() => { const r = document.getElementById('detailSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }), 'the modal fits portrait');
  await p.click('#detailClose');

  await b.close();
  await fetch(R + '/__hareset');
  console.log('errors', errs);
  console.log('ok app_e2e79');
})().catch(e => { console.error(e); process.exit(1); });
