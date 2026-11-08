// HOLODECK IN THE BACKGROUND (2.56.2; simulated bridge :8105, relay on RELAY_PORT with short WebM videos): leaving the
// app (Home, another app, the lock) with the TV on moves its sound to an audio player at the same point in the same
// video, unlocked by the tap that tuned in, and named on the lock screen; at the end of a video it plays what's on next;
// the picture is paused meanwhile and nothing is measured. Coming back, the audio stops and the picture takes over at
// the live point. A muted TV stays silent away; OFF clears it all; AUDIO starting turns it off as before.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const st = p => p.evaluate(() => {
  const v = document.getElementById('hdVideo'), a = document.getElementById('hdRadio'), src = e => decodeURIComponent((e && e.getAttribute('src')) || '');
  return { v: v && { src: src(v), paused: v.paused, t: v.currentTime }, a: a && { src: src(a), paused: a.paused, t: a.currentTime } };
});
const away = p => p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
const back = p => p.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');   /* not the morning briefing: it would ask the shared simulated bridge for voice while e2e48 counts those calls */ localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: Date.now() - 86400000 }], ch: 1, look: 'crt', muted: false }));
  }, [K, U, R]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
  await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 20000 });
  await p.click('.hd-tune');
  await until(async () => { const s = await st(p); return s.v && !s.v.paused && s.v.t > 1 && s; });

  // ---- away: the sound carries on as audio, from the same video at the same point
  const before = await st(p);
  await away(p);
  let s = await until(async () => { const x = await st(p); return x.a && !x.a.paused && x.a.t > 0 && x; });
  assert.strictEqual(s.a.src, before.v.src, 'the same video, as sound');
  assert.ok(s.v.paused, 'the picture waits');
  assert.ok(Math.abs(s.a.t - before.v.t) < 4, 'at the same point: ' + s.a.t + ' vs ' + before.v.t);
  assert.ok(await p.evaluate(() => navigator.mediaSession.metadata && navigator.mediaSession.metadata.album === 'TimothyOS · HOLODECK' && navigator.mediaSession.metadata.artist === 'Test Channel'), 'named on the lock screen');
  // the end of a video: what's on next, still as sound
  const was = s.a.src;
  await p.evaluate(() => { const a = document.getElementById('hdRadio'); a.currentTime = Math.max(0, a.duration - .3); });
  s = await until(async () => { const x = await st(p); return x.a.src && x.a.src !== was && !x.a.paused && x; });
  assert.ok(s.a.src.includes('/Video/Test Channel/'), 'the next one on the channel: ' + s.a.src);
  assert.ok(s.v.paused);

  // ---- back: the audio stops, the picture takes over at the live point
  await back(p);
  s = await until(async () => { const x = await st(p); return x.v && !x.v.paused && x.v.t > 0 && x; });
  assert.ok(!s.a.src, 'the audio player let go');
  assert.ok((await p.$$eval('#hdScreen video', n => n.length)) === 1, 'the picture is on the screen');

  // ---- a muted TV stays silent away
  await p.click('.hd-mute'); await p.waitForTimeout(200);
  await away(p); await p.waitForTimeout(800);
  s = await st(p);
  assert.ok(!s.a.src, 'muted: no sound away');
  await back(p); await p.click('.hd-mute'); await p.waitForTimeout(500);

  // ---- OFF while away clears it; turning on again works
  await away(p); await until(async () => { const x = await st(p); return x.a.src && x; });
  await p.evaluate(() => document.getElementById('hdPower').click());   // as if from the lock screen's way back
  s = await st(p);
  assert.ok(!s.a.src && !s.v.src, 'off: neither plays');
  await back(p);

  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('e2e69 HOLODECK in the background: OK');
})().catch(e => { console.error(e); process.exit(1); });
