// UPDATE READY (2.43.2): the app installed with its service worker, then two new versions published one after the
// other. Tapping UPDATE READY must bring each one up whole: its version in the top bar, its styles applied, the
// screen drawn, and only its own cache left. The new version waits instead of taking over on install, so it never
// swaps in while the page is mid-reload (that left a header over a black screen, or unstyled HTML, on the iPad).
// A copy of the app is served from a scratch folder on :8125 so the test can publish versions to it.
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execFileSync } = require('child_process');
const R = path.join(__dirname, '..'), DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tos-upd-')), PORT = 8125, URL0 = 'http://localhost:' + PORT + '/';
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'version.json', 'css', 'js', 'icons', 'fonts', 'tools/bump_version.py']) fs.cpSync(path.join(R, f), path.join(DIR, f), { recursive: true });
let stamp = Date.now() / 1000;
const publish = v => {   // the test server dates files to the second: move them on, or a same-second change reads as "not modified"
  execFileSync('python3', [path.join(DIR, 'tools/bump_version.py'), v]);
  stamp += 60; for (const f of ['sw.js', 'index.html', 'version.json', 'js/app.js', 'css/app.css']) fs.utimesSync(path.join(DIR, f), stamp, stamp);
};
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 200)); } };
const whole = p => p.evaluate(() => ({
  bar: document.querySelector('.topbar span').textContent,
  css: getComputedStyle(document.documentElement).getPropertyValue('--hero').trim(),
  font: getComputedStyle(document.getElementById('title')).fontFamily,
  drawn: document.getElementById('content').children.length > 0,
  ctl: !!navigator.serviceWorker.controller
}));

(async () => {
  await until(() => fetch(URL0).then(r => r.ok));
  publish('9.9.0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'allow' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL0);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  let w = await whole(p);
  assert.ok(w.bar === 'TIMOTHYOS 9.9' && w.css && w.drawn, JSON.stringify(w));

  for (const v of ['9.10.0', '9.11.0']) {
    publish(v);
    const mm = v.split('.').slice(0, 2).join('.');
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // coming back to the app checks version.json
    await p.waitForSelector('#updateBtn:not([hidden])', { timeout: 8000 });
    if (v === '9.10.0') {   // found before the tap (iPadOS checks on its own): it installs, then waits instead of taking over
      const old = await p.evaluate(() => caches.keys());
      await until(() => p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.waiting && r.waiting.state === 'installed' ? true : r.installing ? false : r.update().then(() => false))));
      await new Promise(r => setTimeout(r, 1000));
      assert.ok(await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)), 'still waiting');
      assert.ok(await p.evaluate(old => caches.keys().then(k => old.every(x => k.includes(x))), old), 'the running version keeps its files');
    }   // 9.11.0: found only when tapped
    await Promise.all([p.waitForNavigation({ timeout: 20000 }), p.click('#updateBtn')]);
    await p.waitForFunction(mm => document.querySelector('.topbar span').textContent === 'TIMOTHYOS ' + mm, mm, { timeout: 10000 });
    w = await whole(p);
    assert.ok(w.css && w.drawn && w.ctl && /Antonio/.test(w.font), v + ' came up whole: ' + JSON.stringify(w));
    assert.deepStrictEqual(await p.evaluate(() => caches.keys()), ['tos-shell-' + v], 'only the new version cached');
    assert.ok(await p.evaluate(v => fetch('sw.js').then(r => r.text()).then(t => t.includes('"' + v + '"')), v));
    assert.ok(await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !r.waiting && !r.installing)), 'nothing left waiting');
  }

  console.log('errors', errs);
  await b.close(); server.kill(); fs.rmSync(DIR, { recursive: true, force: true });
  if (errs.length) process.exit(1);
})().catch(e => { server.kill(); fs.rmSync(DIR, { recursive: true, force: true }); console.error(e); process.exit(1); });
