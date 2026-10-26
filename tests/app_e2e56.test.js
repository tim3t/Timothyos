// HOLODECK (2.45, channels 2.46): a TV that's always on air, one NAS folder per channel through the STORAGE relay
// (simulated, with short WebM videos: the test browser has no H.264). Channel 1 from a flat folder in /Video, the AVI
// skipped, lengths measured once and kept, in order from when it was added, TUNE IN joins mid-broadcast at the clock's
// position, the guide, the next video when one ends, the credit, CRT/CLEAN, mute. Channel 2 from a series in season
// folders: seasons by number, episodes by number, specials and extras last, the MKV skipped; changing channel with the
// buttons, the dial and the guide's other-channel line; rename, remove; 2.45's one folder becomes channel 1; leaving
// turns it off, STORAGE no longer lists /Video, COMPUTER, phone width.
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
  assert.ok((await txt(p, '.hd-tune')).includes('ADD A CHANNEL BELOW'));
  await p.waitForSelector('[data-hdpick="/Video/Test Channel"]');
  assert.deepStrictEqual(await p.$$eval('.hd-dir span:not(.muted)', e => e.map(x => x.textContent)), ['Other Channel', 'Test Channel', 'Test Series']);
  await p.click('[data-hdpick="/Video/Test Channel"]');
  await p.waitForSelector('[data-hd="use"]');
  assert.strictEqual(await txt(p, '[data-hd="use"]'), 'USE THIS FOLDER · 4 VIDEOS');
  await p.click('[data-hd="use"]');

  // ---- the folder: 3 play, the AVI skipped; lengths measured once; in order from now
  await p.waitForFunction(() => / round/.test((document.getElementById('hdInfo1') || {}).textContent || ''), null, { timeout: 20000 });
  const info = await txt(p, '#hdInfo1');
  assert.ok(/^3 videos · 1 AVI skipped · in order · 1[78] s round · on air since /.test(info), info);
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · HOLODECK · CH 1 · TEST CHANNEL');
  const lens = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololen.v1')));
  const secs = Object.keys(lens).sort().map(k => Math.round(lens[k].s));
  assert.deepStrictEqual(secs, [6, 5, 7], 'each length read from the file: ' + JSON.stringify(lens));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')));
  assert.deepStrictEqual(saved.chans.map(c => [c.id, c.name, c.dir]), [[1, 'Test Channel', '/Video/Test Channel']]);
  assert.ok(Math.abs(saved.chans[0].premiere - Date.now()) < 30000 && saved.ch === 1);

  // ---- the guide: computed from the clock; NOW then the next three, in file order, round again
  const ORDER = ['Neon Harbor · Midnight Signal', 'The Velvet Static · Satellite Heart', 'Juniper Drive · Polaroid Weekend'];
  const g = await p.$$eval('#hdGuide .hd-slot', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  assert.strictEqual(g.length, 4, g.join(' | '));
  assert.ok(g[0].startsWith('NOW ') && /\d:\d\d of 0:0[5-7] · \d:\d\d left/.test(g[0]), g[0]);
  assert.ok(g.slice(1).every(x => /^\d\d:\d\d /.test(x)), g.join(' | '));
  assert.strictEqual(await p.$eval('#hdGuide .hd-slot', e => getComputedStyle(e).position), 'static', 'the NOW row stays in the guide (no global .now)');
  assert.strictEqual(await p.$('#hdGuide .now'), null);
  const k0 = ORDER.findIndex(o => g[0].includes(o));
  assert.ok(k0 > -1, 'a name and a line from the file name: ' + g[0]);
  for (let i = 1; i < 4; i++) assert.ok(g[i].includes(ORDER[(k0 + i) % 3]), 'in order: ' + g.join(' | '));
  assert.strictEqual(await txt(p, '#hdOthers'), '', 'no other channels yet');
  assert.ok(await p.isDisabled('[data-hd="up"]'), 'one channel: nothing to change to');

  // ---- TUNE IN: mid-stream, at the clock's position in what's on now
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  const v1 = await vid(p);
  assert.ok(v1.inScreen && v1.src.includes('/Video/Test Channel/') && v1.src.includes('k=relay-test-token'), JSON.stringify(v1));
  const now = (await txt(p, '.hd-slot.hd-now')).replace(/^NOW /, '');
  assert.ok(v1.src.includes(now.split(' · ')[0]), 'playing what the guide says is on: ' + now + ' / ' + v1.src);
  assert.ok((await txt(p, '#eyebrow')).endsWith('· ON AIR'));
  assert.ok((await txt(p, '#hdLive')).startsWith('● LIVE ·'));
  assert.strictEqual(await p.getAttribute('#hdCredit', 'hidden'), null, 'the credit shows on tuning in');
  await p.screenshot({ path: D + 'holodeck.png' });
  // the next video when one ends
  await p.waitForFunction(src => { const v = document.getElementById('hdVideo'); return v && decodeURIComponent(v.getAttribute('src') || '') !== src && v.currentTime > 0 && !v.paused; }, v1.src, { timeout: 12000 });
  const v2 = await vid(p);
  assert.ok(v2.src !== v1.src && v2.t < 3, 'the next one, from its start: ' + JSON.stringify(v2));
  const nm = s => ORDER.findIndex(o => s.includes(o.split(' · ')[0]));
  assert.strictEqual(nm(v2.src), (nm(v1.src) + 1) % 3, 'the next in order');

  // ---- MUTE, CLEAN, and the page redrawing doesn't stop it
  await p.click('[data-hd="mute"]');
  assert.strictEqual((await vid(p)).muted, true);
  await p.click('[data-hdlook="clean"]');
  assert.ok(!(await p.$('.hd-tv.crt')));
  const v3 = await vid(p); assert.ok(!v3.paused && v3.inScreen, 'still playing after a redraw');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).look), 'clean');

  // ---- CHANNEL 2: a series in season folders, added while on air; it starts at the beginning
  await p.click('[data-hd="pick"]');
  await p.waitForSelector('[data-hdpick="/Video/Test Series"]'); await p.click('[data-hdpick="/Video/Test Series"]');
  await p.waitForSelector('[data-hd="use"]');
  assert.strictEqual(await txt(p, '[data-hd="use"]'), 'USE THIS FOLDER · 3 SEASONS + SPECIALS · 8 EPISODES');
  await p.click('[data-hd="use"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · HOLODECK · CH 2 · TEST SERIES · ON AIR');
  assert.strictEqual(await txt(p, '.hd-chnum'), 'CH 2');
  assert.strictEqual(await txt(p, '.hd-bug'), 'HOLODECK 2');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && /Test Series/.test(decodeURIComponent(v.getAttribute('src') || '')) && v.currentTime > 0; }, null, { timeout: 15000 });
  assert.ok((await vid(p)).src.includes('Season 1, Episode 1 - Updated Full Episode'), 'season 1, episode 1 first');
  const credit = (await p.innerText('#hdCredit')).replace(/\s+/g, ' ').trim();
  assert.strictEqual(credit, 'Test Series Season 1, Episode 1', 'the credit: the channel, the season and episode (no "Full Episode", no id)');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4 && / round/.test(document.getElementById('hdInfo2').textContent), null, { timeout: 20000 });
  const g2 = await p.$$eval('#hdGuide .hd-slot b', e => e.map(x => x.textContent));
  assert.deepStrictEqual(g2, ['S1 E1', 'S1 E2', 'S1 E10', 'S2 E1'], 'episodes by number, seasons by number');
  assert.ok(/^3 seasons \+ specials · 7 episodes · 1 MKV skipped · in order · 40 s round · on air since /.test(await txt(p, '#hdInfo2')), await txt(p, '#hdInfo2'));
  const oth = await txt(p, '#hdOthers');
  assert.ok(/^CH 1 .+ Test Channel · until \d\d:\d\d · tap to switch$/.test(oth), oth);

  // ---- changing channel: CH ▼, the guide's line, the dial (a turn, a tap)
  await p.click('[data-hd="down"]');
  assert.strictEqual(await txt(p, '.hd-chnum'), 'CH 1');
  await p.waitForFunction(() => /Test Channel/.test(decodeURIComponent((document.getElementById('hdVideo') || {}).getAttribute('src') || '')), null, { timeout: 8000 });
  await p.click('#hdOthers .hd-other');
  assert.strictEqual(await txt(p, '.hd-chnum'), 'CH 2');
  await p.$eval('#hdDial', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150); const bb = await (await p.$('#hdDial')).boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
  await p.mouse.move(bb.x + bb.width / 2 - 50, bb.y + bb.height / 2 - 10, { steps: 6 }); await p.mouse.up();
  assert.strictEqual(await txt(p, '.hd-chnum'), 'CH 1', 'turned to the left: channel 1');
  await p.click('#hdDial');
  assert.strictEqual(await txt(p, '.hd-chnum'), 'CH 2', 'a tap: the next channel');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).ch), 2);

  // ---- the end of the series: the specials, then the extra without a number, then round to the start
  await p.click('[data-hd="tune"]');
  await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('tos.holo.v1')), l = JSON.parse(localStorage.getItem('tos.hololen.v1'));
    const ep = n => Object.keys(l).find(k => k.includes(n)); const pre = ['Season 1, Episode 1', 'Episode 2 -', 'Episode 10', 'Season 2 Episode 1'].reduce((s, n) => s + l[ep(n)].s, 0);
    c.chans[1].premiere = Date.now() - (pre + 1) * 1000; localStorage.setItem('tos.holo.v1', JSON.stringify(c)); });
  await p.reload(); await p.waitForSelector('#allBtn'); await p.click('#allBtn'); await p.click('[data-station="holodeck"]');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4, null, { timeout: 15000 });
  const RUN = ['S1 E1', 'S1 E2', 'S1 E10', 'S2 E1', 'S10 E1 · The Last Case', 'Special · Christmas Special', 'Special · Behind the Scenes'];
  const g3 = await p.$$eval('#hdGuide .hd-slot b', e => e.map(x => x.textContent)), k3 = RUN.indexOf(g3[0]);
  assert.ok(k3 >= 4, 'near the end of the run: ' + g3.join(' | '));
  g3.forEach((x, i) => assert.strictEqual(x, RUN[(k3 + i) % RUN.length], 'the last season, the specials, the extra, then round again: ' + g3.join(' | ')));

  // ---- rename; remove (two taps); the numbers follow the list
  await p.click('[data-hdren="2"]'); await p.fill('#hdRename', 'Mystery Hour'); await p.click('[data-hd="rensave"]');
  assert.ok((await txt(p, '#eyebrow')).startsWith('RESOURCES · HOLODECK · CH 2 · MYSTERY HOUR'));
  await p.click('[data-hdrm="1"]'); assert.strictEqual(await txt(p, '[data-hdrm="1"]'), 'REMOVE IT');
  await p.click('[data-hdrm="1"]');
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 1);
  assert.ok((await txt(p, '#eyebrow')).startsWith('RESOURCES · HOLODECK · CH 1 · MYSTERY HOUR'));
  assert.ok(await p.isDisabled('[data-hd="down"]'));

  // ---- leaving: off (no Picture in Picture here); coming back: TUNE IN again, later in the broadcast
  await p.click('[data-hd="tune"]'); await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && v.getAttribute('src'); });
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  const off = await vid(p); assert.ok(off.paused && !off.src.includes('/Video/'), 'off after leaving: ' + JSON.stringify(off));
  await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await p.waitForSelector('.hd-tune:not([disabled])');

  // ---- 2.45's one folder becomes channel 1, in order from now
  await p.evaluate(() => localStorage.setItem('tos.holo.v1', JSON.stringify({ dir: '/Video/Test Channel', look: 'clean', muted: false })));
  await p.reload(); await p.waitForSelector('#allBtn');
  const mig = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')));
  assert.ok(!('dir' in mig) && mig.ch === 1 && mig.look === 'clean' && mig.chans.length === 1 && mig.chans[0].name === 'Test Channel' && Math.abs(mig.chans[0].premiere - Date.now()) < 10000, JSON.stringify(mig));

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
