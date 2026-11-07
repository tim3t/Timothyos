// HOLODECK waits out a lost NAS (2.68; simulated bridge :8105, relay on RELAY_PORT). From Timothy's ERROR LOG: six "didn't
// load" (MediaError 4) in two seconds, then the TV went off: the iPad's link to the NAS was down, not the files or LEVEL.
// Now a load failure first asks the NAS for the file (HEAD). No answer: WAITING FOR THE NAS, nothing marked or counted,
// LEVEL not paused, tried again at the live point, and the show picks up when the NAS is back; five instant failures in a
// row no longer turn the TV off. The NAS answering with an error: the file's own problem, logged with the HTTP code.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  await fetch(R + '/__fail?n=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    const pr = Date.now() - 86400000;
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: pr }, { id: 2, name: 'Other Channel', dir: '/Video/Other Channel', premiere: pr }], ch: 1, look: 'crt', muted: true }));
  }, [K, U, R]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
  await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 30000 });
  await p.click('.hd-tune');
  const playing = () => p.evaluate(() => { const v = document.getElementById('hdVideo'); return !!v && !v.paused && v.currentTime > .2 && v.readyState >= 2; });
  await until(playing, 15000);
  const log = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]'));
  const marked = () => p.evaluate(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'); return Object.keys(l).filter(k => l[k].s < 0); });

  // ---- the NAS drops out: CH ▲ can't load anything
  await ctx.route(R + '/**', r => r.abort('connectionrefused'));
  await p.click('[data-hd="up"]');
  await until(async () => /WAITING FOR THE NAS/.test(await p.innerText('#content')), 8000);
  let L = await log();
  console.log('log:', L.slice(0, 4).map(e => e.a + ': ' + e.m).join(' | '));
  assert.ok(L.some(e => e.s === 'holodeck' && e.a === 'waiting for the NAS' && /NAS unreachable \(no connection\)/.test(e.m)), 'the cause is named');
  await p.waitForTimeout(9000);   // 2 s, 4 s and 8 s tries go by
  L = await log();
  assert.ok(!L.some(e => e.a === 'TV went off'), 'the TV stays on');
  assert.ok(!L.some(e => e.a === 'LEVEL paused'), 'LEVEL isn\'t blamed');
  assert.deepStrictEqual(await marked(), [], 'nothing marked unplayable');
  assert.ok(/WAITING FOR THE NAS/.test(await p.innerText('#content')));

  // ---- it comes back: the show picks up at its live point
  await ctx.unroute(R + '/**');
  await until(playing, 25000);
  L = await log();
  assert.ok(L.some(e => e.a === 'NAS back' && /picked up at its live point/.test(e.m)), 'logged');
  assert.ok(!/WAITING FOR THE NAS/.test(await p.innerText('#content')), 'the note is gone');
  assert.deepStrictEqual(await marked(), []);

  // ---- the NAS answers, but the file is refused: the file's own problem, with the code
  await fetch(R + '/__fail?prefix=' + encodeURIComponent('/Video/') + '&code=404&n=2');   // the video and the check both get 404
  await p.click('[data-hd="down"]');
  await until(async () => (await log()).some(e => e.a === 'NAS answered' && /HTTP 404/.test(e.m)), 10000);
  await until(playing, 20000);   // LEVEL's backup or the next show carries on
  await fetch(R + '/__fail?n=0');

  await b.close();
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  console.log('ok app_e2e82');
})().catch(e => { console.error(e); process.exit(1); });
