// HOLODECK (2.45): a TV that's always on air, from one NAS folder through the STORAGE relay (simulated, with short
// WebM videos: the test browser has no H.264). Choosing the folder (flat, from /Video), the AVI skipped, lengths
// measured once and kept, TUNE IN joins mid-broadcast at the clock's position, the guide (now, next, later), the next
// video when one ends, the credit, CRT/CLEAN, mute, leaving turns it off, STORAGE no longer lists /Video, COMPUTER.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const vid = p => p.evaluate(() => { const v = document.getElementById('hdVideo'); return v ? { src: decodeURIComponent(v.getAttribute('src') || ''), t: v.currentTime, paused: v.paused, inScreen: !!v.closest('#hdScreen'), muted: v.muted } : null; });

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, R]);
  await p.reload(); await p.waitForSelector('#allBtn');

  // ---- from ALL STATIONS → RESOURCES; no folder yet: the picker opens on /Video
  await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await p.waitForSelector('.hd');
  assert.strictEqual(await txt(p, '#title'), 'HOLODECK');
  assert.ok(await p.isDisabled('.hd-tune'), 'nothing to tune to yet');
  assert.ok((await txt(p, '.hd-tune')).includes('CHOOSE A FOLDER BELOW'));
  await p.waitForSelector('[data-hdpick="/Video/Test Channel"]');
  assert.deepStrictEqual(await p.$$eval('.hd-dir span:not(.muted)', e => e.map(x => x.textContent)), ['Other Channel', 'Test Channel']);
  await p.click('[data-hdpick="/Video/Test Channel"]');
  await p.waitForSelector('[data-hd="use"]');
  assert.strictEqual(await txt(p, '[data-hd="use"]'), 'USE THIS FOLDER · 4 VIDEOS');
  await p.click('[data-hd="use"]');

  // ---- the folder: 3 play, the AVI skipped; lengths measured once
  await p.waitForFunction(() => /ONE TIME ROUND/.test(document.querySelector('.hd-kv').textContent), null, { timeout: 20000 });
  const src = await txt(p, '.hd-kv');
  assert.ok(src.includes('FOLDER /Video/Test Channel') && src.includes('VIDEOS 3 play · 1 skipped 1 AVI') && /ONE TIME ROUND 1[78] s · then reshuffled/.test(src), src);
  const lens = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololen.v1')));
  const secs = Object.keys(lens).sort().map(k => Math.round(lens[k].s));
  assert.deepStrictEqual(secs, [6, 5, 7], 'each length read from the file: ' + JSON.stringify(lens));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).dir), '/Video/Test Channel');

  // ---- the guide: computed from the clock; NOW then the next three
  const g = await p.$$eval('.hd-slot', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  assert.strictEqual(g.length, 4, g.join(' | '));
  assert.ok(g[0].startsWith('NOW ') && /\d:\d\d of 0:0[5-7] · \d:\d\d left/.test(g[0]), g[0]);
  assert.ok(g.slice(1).every(x => /^\d\d:\d\d /.test(x)), g.join(' | '));
  assert.ok(/Neon Harbor · Midnight Signal|The Velvet Static · Satellite Heart|Juniper Drive · Polaroid Weekend/.test(g[0]), 'a name and a line from the file name: ' + g[0]);

  // ---- TUNE IN: mid-stream, at the clock's position in what's on now
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  const v1 = await vid(p);
  assert.ok(v1.inScreen && v1.src.includes('/Video/Test Channel/') && v1.src.includes('k=relay-test-token'), JSON.stringify(v1));
  const now = (await txt(p, '.hd-slot.now')).replace(/^NOW /, '');
  assert.ok(v1.src.includes(now.split(' · ')[0]), 'playing what the guide says is on: ' + now + ' / ' + v1.src);
  assert.ok((await txt(p, '#eyebrow')).endsWith('· ON AIR'));
  assert.ok((await txt(p, '#hdLive')).startsWith('● LIVE ·'));
  assert.strictEqual(await p.getAttribute('#hdCredit', 'hidden'), null, 'the credit shows on tuning in');
  await p.screenshot({ path: D + 'holodeck.png' });
  // the next video when one ends
  await p.waitForFunction(src => { const v = document.getElementById('hdVideo'); return v && decodeURIComponent(v.getAttribute('src') || '') !== src && v.currentTime > 0 && !v.paused; }, v1.src, { timeout: 12000 });
  const v2 = await vid(p);
  assert.ok(v2.src !== v1.src && v2.t < 3, 'the next one, from its start: ' + JSON.stringify(v2));

  // ---- MUTE, CLEAN, and the page redrawing doesn't stop it
  await p.click('[data-hd="mute"]');
  assert.strictEqual((await vid(p)).muted, true);
  await p.click('[data-hdlook="clean"]');
  assert.ok(!(await p.$('.hd-tv.crt')));
  const v3 = await vid(p); assert.ok(!v3.paused && v3.inScreen, 'still playing after a redraw');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).look), 'clean');

  // ---- leaving: off (no Picture in Picture here); coming back: TUNE IN again, later in the broadcast
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  const off = await vid(p); assert.ok(off.paused && !off.src.includes('/Video/'), 'off after leaving: ' + JSON.stringify(off));
  await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await p.waitForSelector('.hd-tune:not([disabled])');

  // ---- STORAGE leaves /Video to HOLODECK
  await p.click('#allBtn'); await p.click('[data-station="storage"]'); await p.waitForSelector('.nas-share');
  assert.ok(!(await p.$$eval('.nas-share b', e => e.map(x => x.textContent))).includes('VIDEO'));

  // ---- COMPUTER
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'tv');
  assert.ok((await txt(p, '#cmdList')).includes('Tune in to the HOLODECK'));
  await p.keyboard.press('Enter'); await p.waitForSelector('.hd');

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');

  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
