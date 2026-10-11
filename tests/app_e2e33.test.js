// STORAGE (2.16.0): the NAS through its read-only relay (simulated on :8110). Set up in Systems
// (address + token, kept on the iPad), wrong token refused, folders listed with the relay's built-in
// placeholders left out, a folder opened in natural order, an episode played, skipped and paused,
// the place kept on the iPad and offered under CONTINUE LISTENING after a reload, a pill on other
// screens while it plays, MARK PLAYED moving to the next one, filters, phone width. Names invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', R = 'http://127.0.0.1:8110';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const cur = p => p.evaluate(() => { const a = document.getElementById('nasAudio'); return a ? { t: a.currentTime, paused: a.paused, src: a.src } : null; });

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom', 'review', 'log', 'library', 'storage'])); });
  await p.reload(); await p.waitForTimeout(1500);

  // ---- not set up yet: Storage points to Systems
  await p.click('[data-screen="storage"].nav'); await p.waitForTimeout(300);
  assert.ok((await txt(p, '#content')).includes('Add the relay address and token under STORAGE in Systems'));
  await p.click('[data-nas="systems"]'); await p.waitForSelector('#sec-storage');

  // ---- wrong token refused, then the right one
  await p.fill('#nasUrl', R); await p.fill('#nasTok', 'nope'); await p.click('[data-act="nassave"]');
  await p.waitForFunction(() => /refused the token/.test(document.getElementById('nasErr').textContent), null, { timeout: 5000 });
  await p.fill('#nasUrl', R); await p.fill('#nasTok', 'relay-test-token'); await p.click('[data-act="nassave"]');
  await p.waitForFunction(() => /Storage connected/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  assert.ok((await txt(p, '#sec-storage')).includes('•••• oken'), 'token shown masked');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.nas.v1')));
  assert.strictEqual(saved.token, 'relay-test-token');

  // ---- front page: folders, not the placeholders or hidden ones
  await p.click('[data-screen="storage"].nav'); await p.waitForSelector('.nas-share');
  const shares = await p.$$eval('.nas-share b', n => n.map(x => x.textContent));
  assert.deepStrictEqual(shares, ['MUSIC', 'PODCASTS']);
  assert.ok((await txt(p, '.nas-status')).includes('ONLINE'));
  await p.screenshot({ path: D + 'storage-home.png' });

  // ---- a folder: natural order, non-audio can't play
  await p.click('.nas-share >> text=PODCASTS'); await p.waitForSelector('.nas-row');
  await p.click('.nas-row >> text=Show A'); await p.waitForSelector('[data-nasplay]');
  assert.strictEqual(await txt(p, '#title'), 'SHOW A');
  const names = await p.$$eval('.nas-row .nas-nm', n => n.map(x => x.childNodes[x.childNodes.length > 1 && x.firstChild.tagName === 'I' ? 1 : 0].textContent));
  assert.deepStrictEqual(names, ['ep 1', 'ep 2', 'ep 10', 'notes.txt'], 'numbers sort naturally');
  assert.ok((await txt(p, '.nas-row.other')).includes("CAN'T PLAY"));

  // ---- play, skip, pause: the place is kept on this iPad
  await p.click('[data-nasplay="/Podcasts/Show A/ep 1.wav"]');
  await p.waitForFunction(() => { const a = document.getElementById('nasAudio'); return a && a.currentTime > 0.5; }, null, { timeout: 8000 });
  let c = await cur(p);
  assert.ok(c.src.includes('k=relay-test-token') && c.src.includes('/Podcasts/Show%20A/ep%201.wav'));
  await p.waitForSelector('#nasBar'); assert.ok((await txt(p, '#nasBar')).includes('ep 1'));
  await p.click('#nasBar [data-nas="fwd"]'); await p.waitForTimeout(400);
  await p.click('#nasBar [data-nas="toggle"]'); await p.waitForTimeout(400);
  c = await cur(p); assert.ok(c.paused && c.t > 30, 'skipped 30 s and paused: ' + c.t);
  const pl = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.plays.v1'))['/Podcasts/Show A/ep 1.wav']);
  assert.ok(pl.p > 30 && pl.d > 89 && !pl.done, 'place saved: ' + JSON.stringify(pl));
  assert.ok((await txt(p, '.nas-row.cur')).includes('LEFT'), 'row shows time left');

  // ---- other screens: a pill while it's playing
  await p.click('#nasBar [data-nas="toggle"]'); await p.waitForTimeout(300);
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#nasMini'), 'pill on other screens');
  assert.ok((await txt(p, '#nasMini')).includes('ep 1'));
  await p.screenshot({ path: D + 'storage-pill.png' });
  await p.click('#nasMini [data-nas="open"]'); await p.waitForSelector('.nas-now');
  assert.ok(!(await p.isVisible('#nasMini')), 'no pill on Storage itself');
  await p.screenshot({ path: D + 'storage-now.png' });
  await p.click('.nas-ctl.big [data-nas="toggle"]'); await p.waitForTimeout(300);

  // ---- after a reload: CONTINUE LISTENING picks up the place
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('[data-screen="storage"].nav'); await p.waitForSelector('.nas-ep');
  assert.ok((await txt(p, '.nas-cont')).includes('ep 1'));
  await p.click('.nas-ep'); await p.waitForSelector('.nas-now');
  await p.waitForFunction(() => { const a = document.getElementById('nasAudio'); return a && a.currentTime > 30 && !a.paused; }, null, { timeout: 8000 });

  // ---- MARK PLAYED: on to the next one in the folder
  await p.waitForFunction(() => document.querySelectorAll('.nas-now ~ section .nas-row').length > 0, null, { timeout: 5000 });
  assert.ok((await txt(p, '#content')).includes('UP NEXT'));
  await p.click('[data-nas="markplayed"]');
  await p.waitForFunction(() => /ep%202/.test(document.getElementById('nasAudio').src), null, { timeout: 5000 });
  assert.ok((await txt(p, '.nas-now h3')) === 'ep 2');
  const p1 = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.plays.v1'))['/Podcasts/Show A/ep 1.wav']);
  assert.ok(p1.done, 'ep 1 marked played');

  // ---- speed and sleep
  await p.click('[data-nasspeed="1.5"]'); assert.strictEqual(await p.evaluate(() => document.getElementById('nasAudio').playbackRate), 1.5);
  await p.click('[data-nassleep="15"]'); assert.ok((await txt(p, '#toast')).includes('Pauses in 15 minutes'));

  // ---- filters in the folder
  await p.click('.nas-now [data-nasdir]'); await p.waitForSelector('[data-nasfilter]');
  assert.ok((await txt(p, '.nas-list')).includes('PLAYED'));
  await p.click('[data-nasfilter="unplayed"]');
  let shown = await p.$$eval('[data-nasplay]', n => n.map(x => x.dataset.nasplay));
  assert.deepStrictEqual(shown, ['/Podcasts/Show A/ep 2.wav', '/Podcasts/Show A/ep 10.wav']);
  await p.fill('#nasQ', '10'); await p.waitForTimeout(200);
  shown = await p.$$eval('[data-nasplay]', n => n.map(x => x.dataset.nasplay));
  assert.deepStrictEqual(shown, ['/Podcasts/Show A/ep 10.wav'], 'search narrows');
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'nasQ', 'keeps typing');
  await p.fill('#nasQ', ''); await p.click('[data-nasfilter="all"]');

  // ---- crumbs back, and tapping STORAGE again returns to its front page
  await p.click('.nas-crumbs >> text=PODCASTS'); await p.waitForSelector('text=Show A');
  await p.click('[data-screen="storage"].nav'); await p.waitForSelector('.nas-share');

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('.nas-share >> text=PODCASTS'); await p.click('.nas-row >> text=Show A'); await p.waitForSelector('[data-nasplay]');
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('content').scrollWidth, document.getElementById('content').clientWidth]);
  assert.ok(w[0] <= 400 && w[1] <= w[2] + 1, 'no sideways scroll at phone width: ' + w);
  await p.screenshot({ path: D + 'storage-phone.png', fullPage: false });
  await p.setViewportSize({ width: 1180, height: 820 });

  // ---- forget: two taps, and playback stops
  await p.click('#status'); await p.waitForSelector('#sec-storage');
  await p.click('[data-act="nasforget"]'); assert.ok((await txt(p, '#sec-storage')).includes('TAP AGAIN TO FORGET'));
  await p.click('[data-act="nasforget"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.nas.v1')), null);
  assert.ok((await cur(p)).paused);

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
