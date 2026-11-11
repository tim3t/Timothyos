// HOLODECK on a new iPad (2.53.1): restored from a backup, so the channels and the Commercials folder are known but
// no length is. With thousands of commercials it used to make a <video> element per file name (to ask what it can
// play) and measure every commercial over the network, and the iPad froze. Now: one element per type, one reused
// probe, and only the commercials worth measuring ahead. Simulated relay; invented files.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8104 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');

(async () => {
  await fetch(R + '/__reset'); await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Commercials'));
  const bulk = await (await fetch(R + '/__bulk?d=' + encodeURIComponent('/Video/Commercials/Singles') + '&n=2000&src=' + encodeURIComponent('/Video/Commercials/Fizzy Pop - Taste the Sparkle.webm'))).json();
  assert.strictEqual(bulk.n, 2000);
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, serviceWorkers: 'block' });
  await quiet(ctx);
  await lane(ctx);
  await ctx.addInitScript(() => { window.__vids = 0; const ce = Document.prototype.createElement; Document.prototype.createElement = function (t) { if (String(t).toLowerCase() === 'video') window.__vids++; return ce.apply(this, arguments); }; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:' + P8104 + '/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: Date.now() - 10 * 86400e3, breaks: true }, { id: 2, name: 'Test Network', dir: '/Video/Test Network', premiere: Date.now() - 86400e3, style: 'network', breaks: true }], ch: 2, copen: true, look: 'crt', muted: true, ads: '/Video/Commercials' })); }, [K, R]);
  await p.reload(); await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch');
  await settled(p, 3000);
  await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd-rail');
  await p.waitForFunction(() => /2004 commercials/.test((document.getElementById('hdAdsInfo') || {}).textContent || ''), null, { timeout: 30000 });
  await settled(p, 8000);

  const v = await p.evaluate(() => window.__vids);
  assert.ok(v < 20, 'a handful of video elements, not one per file: ' + v);
  const a = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1') || '{}')).length);
  assert.ok(a < 40, 'only the commercials worth measuring ahead: ' + a);
  const t0 = Date.now(); await p.click('[data-hdopen="2"]'); await p.waitForSelector('#hdInfo2:not([hidden]), .hd-chan.open #hdInfo2');
  assert.ok(Date.now() - t0 < 2000, 'a tap answers at once');
  assert.ok(await p.isEnabled('.hd-tune'), 'the network channel is ready to tune in: unmeasured commercials count as 30 s');

  await fetch(R + '/__reset');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await fetch(R + '/__reset').catch(() => {}); console.error(e); process.exit(1); });
