// HOLODECK LEVEL (2.61; simulated bridge :8105, relay on RELAY_PORT; /Video/Level Test after /__mkdir: a loud show (a tone
// at 0.5) then a quiet one (0.01), 30 s each): with LEVEL on, the TV's sound runs through Web Audio (the video element is
// crossOrigin "anonymous"); a file never heard says LEARNING, then the gain eases up for the quiet show; what an airing
// measured is kept per file and the next show starts at its folder's average; a file heard before starts at its own level.
// LEVEL OFF swaps in a plain video element that plays on; ON routes again. iPadOS keeping the sound (a context that
// won't resume) shows TAP FOR SOUND, and the tap starts afresh. The background radio stays a plain <audio>.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 200)); } };
const lvl = p => p.evaluate(() => { const e = document.getElementById('hdLvl'); return e ? e.textContent : null; });
const db = t => { const m = /^([+−])(\d+\.\d) DB$/.exec(t || ''); return m ? (m[1] === '−' ? -1 : 1) * +m[2] : null; };
const vid = p => p.evaluate(() => { const vs = document.querySelectorAll('video#hdVideo'), v = vs[0]; return v && { n: vs.length, co: v.getAttribute('crossorigin'), paused: v.paused, t: v.currentTime, src: decodeURIComponent(v.getAttribute('src') || '') }; });
const louds = p => p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololoud.v1') || '{}'));

(async () => {
  await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Level Test'));
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {   /* the routed engine, so the test can see and stall it */
    const C = window.AudioContext, o = C.prototype.createMediaElementSource;
    C.prototype.createMediaElementSource = function (el) { window.__lv = this; window.__lvN = (window.__lvN || 0) + 1; return o.call(this, el); };
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Level Test', dir: '/Video/Level Test', premiere: Date.now() - 34000 }], ch: 1, look: 'crt', muted: false }));
  }, [K, U, R]);
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
  await p.waitForSelector('#hdLvl');
  assert.strictEqual(await lvl(p), 'ON', 'LEVEL is on by default');
  assert.ok(await p.$('.hd-lvb.set[aria-pressed="true"]'), 'the rail shows LEVEL on');
  await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 20000 });
  await p.click('.hd-tune');

  // ---- the quiet show, never heard: LEARNING, then the gain eases up
  let v = await until(async () => { const x = await vid(p); return x && !x.paused && x.t > .3 && x; });
  assert.strictEqual(v.co, 'anonymous', 'the video asks the relay for CORS, as Web Audio needs');
  assert.ok(/Quiet Show/.test(v.src), 'tuned in to the quiet show: ' + v.src);
  assert.ok(await p.evaluate(() => window.__lv && window.__lv.state === 'running'), 'the engine runs');
  assert.strictEqual(await lvl(p), 'LEARNING', 'nothing known yet');
  const g1 = await until(async () => db(await lvl(p)), 12000);
  await p.waitForTimeout(2500);
  const g2 = db(await lvl(p));
  assert.ok(g1 > 0 && g2 > g1, 'the gain rises for a quiet show, a step at a time: ' + g1 + ' then ' + g2);
  assert.ok(g2 - g1 < 2, 'eased, never a jump: ' + g1 + ' → ' + g2);

  // ---- the quiet show ends: its loudness is kept; the loud show starts at the folder's average and eases down
  v = await until(async () => { const x = await vid(p); return x && /Loud Show/.test(x.src) && x.t > .3 && x; }, 30000);
  let L = await louds(p); const q = L['/Video/Level Test/02 - Quiet Show.webm'];
  assert.ok(q && q.n >= 5 && q.l < -34 && q.l > -47, 'the quiet show measured near -41: ' + JSON.stringify(q));
  const s0 = db(await lvl(p));
  assert.ok(s0 > 11, 'the loud show starts at the folder\'s level (all quiet so far): ' + s0);
  await p.waitForTimeout(6000);
  const s1 = db(await lvl(p));
  assert.ok(s1 < s0 - 1, 'and eases down as it hears the loud show: ' + s0 + ' → ' + s1);

  // ---- OFF keeps what it heard; tuning in again starts the loud show at its own level
  await p.click('#hdPower'); await p.waitForSelector('.hd-tune');
  assert.strictEqual(await lvl(p), 'ON');
  assert.ok(await p.evaluate(() => window.__lv.state !== 'running'), 'the engine rests while the TV is off');
  L = await louds(p); const ld = L['/Video/Level Test/01 - Loud Show.webm'];
  assert.ok(ld && ld.l > -12 && ld.l < -2, 'the loud show measured near -7: ' + JSON.stringify(ld));
  await p.click('.hd-tune');
  await until(async () => { const x = await vid(p); return x && /Loud Show/.test(x.src) && !x.paused && x.t > .3; });
  const s2 = db(await lvl(p));
  assert.ok(s2 != null && s2 < -6, 'a show heard before starts at its own level, turned down: ' + await lvl(p));
  assert.ok(await p.evaluate(() => window.__lv.state === 'running'), 'the tap woke the engine');
  assert.strictEqual(await p.evaluate(() => window.__lvN), 1, 'one engine for the element');

  // ---- LEVEL OFF: a plain element plays on; ON routes a new one
  await p.click('[data-hd="level"]');
  assert.strictEqual(await lvl(p), 'OFF');
  v = await until(async () => { const x = await vid(p); return x && !x.paused && x.t > .3 && x; });
  assert.strictEqual(v.n, 1, 'one video element'); assert.strictEqual(v.co, null, 'not routed: plays as before 2.61');
  assert.ok(await p.$('.hd-lvb:not(.set)[aria-pressed="false"]'));
  assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.holo.v1'))).level === false, 'kept');
  await p.click('[data-hd="level"]');
  v = await until(async () => { const x = await vid(p); return x && !x.paused && x.t > .3 && x; });
  assert.strictEqual(v.co, 'anonymous'); assert.strictEqual(v.n, 1);
  assert.strictEqual(await p.evaluate(() => window.__lvN), 2, 'a new engine for the new element');
  assert.ok(db(await lvl(p)) < -6, 'at the loud show\'s level again: ' + await lvl(p));

  // ---- iPadOS keeps the sound: asked again by itself, then TAP FOR SOUND starts afresh
  await p.evaluate(() => window.__lv.suspend());
  await until(() => p.evaluate(() => window.__lv.state === 'running'), 6000);   /* woken without a tap */
  await p.evaluate(() => { window.__lv.resume = () => Promise.resolve(); return window.__lv.suspend(); });   /* now it won't come back */
  await until(() => p.evaluate(() => { const b = document.getElementById('hdSnd'); return b && !b.hidden; }), 8000);
  assert.strictEqual(await lvl(p), 'TAP FOR SOUND');
  await p.click('#hdSnd');
  await until(async () => { const x = await vid(p); return x && !x.paused && x.t > .3; });
  assert.strictEqual(await p.evaluate(() => window.__lvN), 3, 'a fresh element and engine');
  assert.ok(await p.evaluate(() => window.__lv.state === 'running' && document.getElementById('hdSnd').hidden), 'sound back, the button gone');

  // ---- away: the radio plays the file as it is (Web Audio pauses in the background); back, the picture takes over
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await until(() => p.evaluate(() => { const a = document.getElementById('hdRadio'); return a && !a.paused && a.currentTime > 0; }));
  assert.strictEqual(await p.evaluate(() => document.getElementById('hdRadio').getAttribute('crossorigin')), null, 'the radio is a plain player');
  await p.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await until(async () => { const x = await vid(p); return x && !x.paused && x.t > .3; });

  // ---- the phone layout keeps LEVEL reachable
  await p.setViewportSize({ width: 390, height: 844 });
  const box = await p.$eval('.hd-lvb', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  assert.ok(box.w > 100 && box.h >= 44, 'LEVEL on a phone: ' + JSON.stringify(box));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  await b.close();
  await fetch(R + '/__reset');
  if (errs.length) { console.log('page errors:', errs); process.exit(1); }
  console.log('ok app_e2e74');
})().catch(e => { console.error(e); process.exit(1); });
