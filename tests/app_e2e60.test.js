// HOLODECK → AUDIO scrubbing (2.51.3): hold the slider and drag forward while the episode plays, by touch. iPadOS never
// focuses a touched slider, so the playing time used to pull the thumb and the clock back under the finger and the lift
// seeked to the wrong place. Run twice: as Chromium is, and with focus refused as on the iPad. The thumb only moves
// forward, the clock follows the finger, and letting go plays from there. Simulated relay.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
async function run(MODE) {
  await fetch(R + '/__reset');
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
  if (MODE === 'safari') await ctx.addInitScript(() => document.addEventListener('focusin', e => { if (e.target.type === 'range') e.target.blur(); }, true));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck'])); }, [K, R]);
  await p.reload(); await p.waitForSelector('[data-screen="holodeck"].nav'); await p.click('[data-screen="holodeck"].nav');
  await p.click('[data-hdprog="audio"]'); await p.waitForSelector('.nas-share'); await p.click('.nas-share >> text=PODCASTS'); await p.waitForTimeout(1500);
  await p.click('.nas-row >> text=Show A'); await p.waitForSelector('[data-nasplay]'); await p.click('[data-nasplay="/Podcasts/Show A/ep 1.wav"]');
  await p.waitForFunction(() => { const a = document.getElementById('nasAudio'); return a && !a.paused && a.currentTime > 1; }, null, { timeout: 10000 });
  await p.click('[data-hdgo="arch"]'); await p.click('[data-hdprog="audio"]'); await p.waitForSelector('#nasSeekBig:not([disabled])');
  const box = await p.locator('#nasSeekBig').boundingBox();
  const st = () => p.evaluate(() => { const r = document.getElementById('nasSeekBig'), s = r.closest('.nas-scrub'); return { v: +r.value, t: s.querySelector('[data-np="t"]').textContent, cur: Math.round(document.getElementById('nasAudio').currentTime), focus: document.activeElement === r }; });
  const cdp = await ctx.newCDPSession(p), y = box.y + box.height / 2;
  const x0 = box.x + (await st()).v / 90 * box.width, x1 = box.x + 0.8 * box.width;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  const samples = [];
  for (let i = 1; i <= 24; i++) {   /* about 3 s holding and moving forward, as a finger does */
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * Math.min(1, i / 16), y }] });
    await p.waitForTimeout(125); samples.push(await st());
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(800); const end = await st();
  const back = samples.filter((s, i) => i && s.v < samples[i - 1].v).length;
  console.log(MODE, 'thumb while held:', samples.map(s => s.v).join(','), '| after:', end.v, 'playing at', end.cur);
  assert.strictEqual(back, 0, MODE + ': the thumb never jumps back under the finger');
  assert.ok(samples[15].v >= 70 && samples.slice(15).every(s => s.v === samples[15].v), MODE + ': it stays where the finger holds it');
  assert.ok(samples.every(s => s.t === Math.floor(s.v / 60) + ':' + String(s.v % 60).padStart(2, '0')), MODE + ': the clock shows where the finger is');
  assert.ok(end.cur >= 70 && end.cur <= 76, MODE + ': letting go plays from there, at ' + end.cur);
  if (MODE === 'safari') await (await p.$('.nas-now')).screenshot({ path: __dirname + '/out/audio-scrub.png' });
  await b.close();
  return errs;
}
(async () => {
  const errs = (await run('chromium')).concat(await run('safari'));
  console.log('errors', errs);
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
