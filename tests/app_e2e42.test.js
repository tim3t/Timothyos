// TRACK # FOR EVERY TAG LAYOUT (2.30.1; relay simulated on :8110, tags written by hand in the mock): a number behind a
// large cover picture (read past without fetching the picture), ID3v2.2, an unsynchronised v2.3 tag, ID3v1.1 only, a
// v2.4 frame with a data-length indicator, and a file whose tags were remembered before it was numbered (read again
// because the file changed). The folder sorts 1 to 6, says how many are numbered, and READ TAGS AGAIN reads them anew.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110'), K = 'k'.repeat(64), C = '/Podcasts/Show C/';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const sent = async () => (await (await fetch(R + '/__stats')).json()).sent;

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, c, r]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'storage']));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    // remembered by an earlier version, before the file had its number: no file stamp, no number
    localStorage.setItem('tos.nastags.v1', JSON.stringify({ [c + 'f stale.mp3']: { t: '', a: '', al: '', n: 0, d: 0, s: 1 } }));
  }, [K, C, R]);
  await p.reload(); await p.waitForTimeout(1200);

  const s0 = await sent();
  await p.click('[data-screen="storage"].nav'); await p.waitForSelector('.nas-share');
  await p.click('.nas-share >> text=PODCASTS'); await p.click('[data-nasdir="/Podcasts/Show C"]');
  await p.waitForSelector('[data-nassort="track"]');
  await p.click('[data-nassort="track"]');
  await p.waitForFunction(() => /IN TRACK ORDER · 6 MP3S NUMBERED/.test((document.querySelector('.nas-trk') || {}).textContent || ''), null, { timeout: 15000 });
  const order = await p.$$eval('.nas-list [data-nasplay]', n => n.map(x => x.dataset.nasplay.split('/').pop()));
  assert.deepStrictEqual(order, ['c unsync.mp3', 'e v24.mp3', 'b v22.mp3', 'd v1 only.mp3', 'a art first.mp3', 'f stale.mp3']);
  const rows = await txt(p, '.nas-list');
  ['01Episode One', '02Episode Two', '03Episode Three', '04Episode Four', '05Episode Five', '06Episode Six'].forEach(s => assert.ok(rows.replace(/\s/g, '').includes(s.replace(/\s/g, '')), s + ' in ' + rows));
  // the 300 KB picture before the number is stepped over, not downloaded
  const s1 = await sent(), art = (s1[C + 'a art first.mp3'] || 0) - (s0[C + 'a art first.mp3'] || 0);
  assert.ok(art > 0 && art < 200000, 'read ' + art + ' bytes of a 316 KB file');
  // remembered with the file's stamp now
  const tags = await p.evaluate(c => JSON.parse(localStorage.getItem('tos.nastags.v1'))[c + 'f stale.mp3'], C);
  assert.deepStrictEqual([tags.n, tags.s, !!tags.m, tags.z > 0], [6, 1, true, true]);
  await p.screenshot({ path: D + 'storage-track-kinds.png' });

  // ---- READ TAGS AGAIN: everything in the folder read anew, same order
  await p.click('[data-nas="rescan"]');
  await p.waitForFunction(() => /IN TRACK ORDER · 6 MP3S NUMBERED/.test((document.querySelector('.nas-trk') || {}).textContent || ''), null, { timeout: 15000 });
  const s2 = await sent();
  assert.ok((s2[C + 'e v24.mp3'] || 0) > (s1[C + 'e v24.mp3'] || 0), 'read again');
  assert.deepStrictEqual(await p.$$eval('.nas-list [data-nasplay]', n => n.map(x => x.dataset.nasplay.split('/').pop())), order);

  // ---- a folder where some files have no number: says so
  await p.evaluate(c => { const t = JSON.parse(localStorage.getItem('tos.nastags.v1')); }, C);
  await p.click('.nas-crumbs >> text=NAS'); await p.click('.nas-share >> text=MUSIC'); await p.click('[data-nasdir="/Music/Lengths"]');
  await p.waitForSelector('[data-nassort="track"]'); await p.click('[data-nassort="track"]');
  await p.waitForFunction(() => /0 OF 3 MP3S HAVE A TRACK NUMBER/.test((document.querySelector('.nas-trk') || {}).textContent || ''), null, { timeout: 15000 });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
