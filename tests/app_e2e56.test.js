// HOLODECK (2.45, channels 2.46): a TV that's always on air, one NAS folder per channel through the STORAGE relay
// (simulated, with short WebM videos: the test browser has no H.264). Channel 1 from a flat folder in /Video, the AVI
// skipped, lengths measured once and kept, in order from when it was added, TUNE IN joins mid-broadcast at the clock's
// position, the guide, the next video when one ends, the credit, CRT/CLEAN, mute. Channel 2 from a series in season
// folders: seasons by number, episodes by number, specials and extras last, the MKV skipped; changing channel with the
// buttons, the dial and the guide's other-channel line; rename, remove; leaving
// turns it off, STORAGE no longer lists /Video, COMPUTER, phone width. 2.47: HOLODECK opens on the arch (VISUAL or
// AUDIO, which is STORAGE now); ◇ ARCH from either; one at a time (the TV pauses audio, audio turns the TV off); the
// radio band's needle; STORAGE gone from ALL STATIONS. 2.48: a NETWORK channel (show folders, two levels, programmed
// like TV: show names, never three of a show in a row, UP NEXT), back to IN ORDER.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const visual = async p => { await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd'); };
const vid = p => p.evaluate(() => { const v = document.getElementById('hdVideo'); return v ? { src: decodeURIComponent(v.getAttribute('src') || ''), t: v.currentTime, paused: v.paused, inScreen: !!v.closest('#hdScreen'), muted: v.muted } : null; });

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await fetch(R + '/__reset');   /* the relay as it started: earlier runs may have added folders */
  const T0 = new Date('2026-10-28T14:00:00-05:00').getTime();
  await p.clock.setFixedTime(T0);   /* a fixed afternoon: NETWORK's lineup is the same every run and never near the 6:00 change */
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, R]);
  await p.reload(); await p.waitForSelector('#allBtn');

  // ---- from ALL STATIONS → RESOURCES; no folder yet: the picker opens on /Video
  await p.click('#allBtn');
  assert.strictEqual(await p.$('[data-station="storage"]'), null, 'STORAGE is inside HOLODECK now');
  assert.ok((await txt(p, '[data-station="holodeck"]')).includes('your NAS audio'));
  await p.click('[data-station="holodeck"]'); await p.waitForSelector('.hd-arch');
  assert.strictEqual(await txt(p, '#title'), 'HOLODECK');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · HOLODECK · ARCH');
  assert.ok((await txt(p, '[data-hdprog="visual"]')).includes('NONE YET'));
  await p.waitForFunction(() => /FOLDERS Music · Podcasts/.test(document.querySelector('[data-hdprog="audio"]').innerText.replace(/\s+/g, ' ')), null, { timeout: 5000 });
  await visual(p);
  assert.strictEqual(await txt(p, '#title'), 'HOLODECK');
  assert.ok(await p.isDisabled('.hd-tune'), 'nothing to tune to yet');
  assert.ok((await txt(p, '.hd-tune')).includes('ADD A CHANNEL BELOW'));
  await p.waitForSelector('[data-hdpick="/Video/Test Channel"]');
  assert.deepStrictEqual(await p.$$eval('.hd-dir span:not(.muted)', e => e.map(x => x.textContent)), ['Other Channel', 'Test Channel', 'Test Network', 'Test Series']);
  // a folder added to the relay while Bridge is open shows the next time the picker opens (2.48.1)
  await p.evaluate(r => fetch(r + '/__mkdir?d=' + encodeURIComponent("/Video/80's Late [ Added ]")), R);
  await p.click('[data-hd="pick"]'); await p.click('[data-hd="pick"]');
  await p.waitForSelector('.hd-dir >> text=80\'s Late [ Added ]', { timeout: 5000 });
  await p.click('[data-hdpick="/Video/Test Channel"]');
  await p.waitForSelector('[data-hd="use"]');
  assert.strictEqual(await txt(p, '[data-hd="use"]'), 'USE THIS FOLDER · 4 VIDEOS');
  await p.click('[data-hd="use"]');

  // ---- the folder: 3 play, the AVI skipped; lengths measured once; in order from now
  await p.waitForFunction(() => / round/.test((document.getElementById('hdInfo1') || {}).textContent || ''), null, { timeout: 20000 });
  const info = await txt(p, '#hdInfo1');
  assert.ok(/^3 videos · 1 AVI skipped · in order · 1[78] s round · on air since /.test(info), info);
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · HOLODECK · VISUAL · CH 1 · TEST CHANNEL');
  const lens = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololen.v1')));
  const secs = Object.keys(lens).sort().map(k => Math.round(lens[k].s));
  assert.deepStrictEqual(secs, [6, 5, 7], 'each length read from the file: ' + JSON.stringify(lens));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')));
  assert.deepStrictEqual(saved.chans.map(c => [c.id, c.name, c.dir]), [[1, 'Test Channel', '/Video/Test Channel']]);
  assert.ok(saved.chans[0].premiere === T0 && saved.ch === 1, 'premiered at the clock: ' + saved.chans[0].premiere);

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
  await p.waitForSelector('[data-hdpick="/Video/Test Series"]');
  await p.evaluate(() => { window.__draws = 0; new MutationObserver(() => window.__draws++).observe(document.getElementById('content'), { childList: true }); });
  await p.click('[data-hdpick="/Video/Test Series"]');
  await p.waitForSelector('[data-hd="use"]'); await p.waitForTimeout(800);
  const draws = await p.evaluate(() => window.__draws);
  assert.ok(draws <= 4, 'the picker reads the folders inside once and redraws once, not once per folder per redraw (2.47.1 froze on 18): ' + draws);
  assert.strictEqual(await txt(p, '[data-hd="use"]'), 'USE THIS FOLDER · 3 SEASONS + SPECIALS · 8 EPISODES');
  await p.click('[data-hd="use"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · HOLODECK · VISUAL · CH 2 · TEST SERIES · ON AIR');
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
  await p.reload(); await p.waitForSelector('#allBtn'); await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await visual(p);
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4, null, { timeout: 15000 });
  const RUN = ['S1 E1', 'S1 E2', 'S1 E10', 'S2 E1', 'S10 E1 · The Last Case', 'Special · Christmas Special', 'Special · Behind the Scenes'];
  const g3 = await p.$$eval('#hdGuide .hd-slot b', e => e.map(x => x.textContent)), k3 = RUN.indexOf(g3[0]);
  assert.ok(k3 >= 4, 'near the end of the run: ' + g3.join(' | '));
  g3.forEach((x, i) => assert.strictEqual(x, RUN[(k3 + i) % RUN.length], 'the last season, the specials, the extra, then round again: ' + g3.join(' | ')));

  // ---- rename; remove (two taps); the numbers follow the list
  await p.click('[data-hdren="2"]'); await p.fill('#hdRename', 'Mystery Hour'); await p.click('[data-hd="rensave"]');
  assert.ok((await txt(p, '#eyebrow')).startsWith('RESOURCES · HOLODECK · VISUAL · CH 2 · MYSTERY HOUR'));
  await p.click('[data-hdrm="1"]'); assert.strictEqual(await txt(p, '[data-hdrm="1"]'), 'REMOVE IT');
  await p.click('[data-hdrm="1"]');
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 1);
  assert.ok((await txt(p, '#eyebrow')).startsWith('RESOURCES · HOLODECK · VISUAL · CH 1 · MYSTERY HOUR'));
  assert.ok(await p.isDisabled('[data-hd="down"]'));
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).chans.map(c => c.name));
  assert.deepStrictEqual(kept, ['Mystery Hour'], 'the rename and the removal are kept on the iPad');

  // ---- 2.48: NETWORK. A folder of show folders, programmed like TV
  await p.click('[data-hd="pick"]'); await p.waitForSelector('[data-hdpick="/Video/Test Network"]'); await p.click('[data-hdpick="/Video/Test Network"]');
  await p.waitForSelector('[data-hd="use"]'); await p.click('[data-hd="use"]');
  assert.ok((await txt(p, '#eyebrow')).startsWith('RESOURCES · HOLODECK · VISUAL · CH 2 · TEST NETWORK'));
  await p.click('.hd-chan[aria-current="true"] [data-hdstyle$="|network"]');
  await p.waitForFunction(() => /network/.test((document.querySelector('.hd-chan[aria-current="true"] [id^="hdInfo"]') || {}).textContent || ''), null, { timeout: 10000 });
  assert.ok(/^3 shows · 8 episodes · network · a new lineup every day at 6:00/.test(await txt(p, '.hd-chan[aria-current="true"] [id^="hdInfo"]')), await txt(p, '.hd-chan[aria-current="true"] [id^="hdInfo"]'));
  assert.strictEqual(await p.getAttribute('.hd-chan[aria-current="true"] [data-hdstyle$="|network"]', 'aria-pressed'), 'true');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4, null, { timeout: 10000 });
  const SHOWS = ['Angry Test', 'Show Two', 'Third Show'];
  const g4 = await p.$$eval('#hdGuide .hd-slot b', e => e.map(x => x.textContent));
  const sh4 = g4.map(x => SHOWS.find(n => x.startsWith(n + ' · ')));
  assert.ok(sh4.every(Boolean), 'each slot names its show: ' + g4.join(' | '));
  for (let i = 0; i + 2 < sh4.length; i++) assert.ok(!(sh4[i] === sh4[i + 1] && sh4[i + 1] === sh4[i + 2]), 'never three of a show in a row: ' + g4.join(' | '));
  assert.ok(g4.every(x => !/Full Episode|\[|\.f\d|\.part/.test(x)), 'no "Full Episode", ids or leftovers: ' + g4.join(' | '));
  const all = await p.evaluate(() => [...document.querySelectorAll('#hdGuide .hd-slot b')].map(x => x.textContent).join(' | '));
  assert.ok(!/Unfinished/.test(all), 'a .part download never airs');
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  await p.waitForSelector('#hdUpNext:not([hidden])', { timeout: 8000 });
  const up = await p.evaluate(() => ({ t: document.getElementById('hdUpNext').innerText.replace(/\s+/g, ' ').trim(), credit: document.getElementById('hdCredit').innerText }));
  assert.ok(/^UP NEXT (MORE )?(ANGRY TEST|SHOW TWO|THIRD SHOW)$/.test(up.t), 'UP NEXT names a show: ' + up.t);
  assert.ok(SHOWS.some(n => up.credit.startsWith(n)), 'the credit leads with the show: ' + up.credit);
  await p.click('.hd-chan[aria-current="true"] [data-hdstyle$="|order"]');
  await p.waitForFunction(() => /in order/.test((document.querySelector('.hd-chan[aria-current="true"] [id^="hdInfo"]') || {}).textContent || ''), null, { timeout: 10000 });
  await p.click('[data-hd="tune"]');   /* off again */
  await p.click('.hd-chan[aria-current="true"] [data-hdrm]'); await p.click('.hd-chan[aria-current="true"] [data-hdrm]');
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 1);
  // NETWORK on a plain folder of videos: a daily shuffle (2.48.2; it found "0 shows")
  await p.click('[data-hd="pick"]'); await p.waitForSelector('[data-hdpick="/Video/Test Channel"]'); await p.click('[data-hdpick="/Video/Test Channel"]');
  await p.waitForSelector('[data-hd="use"]'); await p.click('[data-hd="use"]');
  await p.click('.hd-chan[aria-current="true"] [data-hdstyle$="|network"]');
  await p.waitForFunction(() => /network/.test((document.querySelector('.hd-chan[aria-current="true"] [id^="hdInfo"]') || {}).textContent || ''), null, { timeout: 10000 });
  assert.ok(/^3 videos · 1 AVI skipped · network · a new shuffle every day at 6:00/.test(await txt(p, '.hd-chan[aria-current="true"] [id^="hdInfo"]')), await txt(p, '.hd-chan[aria-current="true"] [id^="hdInfo"]'));
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4, null, { timeout: 10000 });
  const g5 = await p.$$eval('#hdGuide .hd-slot b', e => e.map(x => x.textContent));
  assert.ok(g5.every(x => ['Neon Harbor · Midnight Signal', 'The Velvet Static · Satellite Heart', 'Juniper Drive · Polaroid Weekend'].includes(x)), 'artist · title, as a music video: ' + g5.join(' | '));
  await p.click('.hd-chan[aria-current="true"] [data-hdrm]'); await p.click('.hd-chan[aria-current="true"] [data-hdrm]');
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 1);

  // ---- the relay failing: five videos in a row that won't play turn the TV off, with a note
  await fetch(R + '/__fail?prefix=' + encodeURIComponent('/Video/Test Series/') + '&code=404&n=999');
  await p.click('.hd-tune');
  await p.waitForFunction(() => /Five videos in a row wouldn't play/.test(document.getElementById('content').innerText), null, { timeout: 30000 });
  assert.ok(!(await vid(p)).src.includes('/Video/'), 'off after five failures');
  assert.ok(await p.$('.hd-tune'), 'TUNE IN offered again');
  await fetch(R + '/__fail?n=0');

  // ---- 2.47: ◇ ARCH, AUDIO (STORAGE's screen) and its radio band; one at a time
  await p.click('[data-hd="tune"]'); await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && v.getAttribute('src'); });
  await p.click('[data-hdgo="arch"]'); await p.waitForSelector('.hd-arch');
  assert.ok(!(await vid(p)).src.includes('/Video/'), 'the arch turns the TV off');
  assert.ok((await txt(p, '[data-hdprog="visual"]')).includes('CH 1 Mystery Hour'));
  await p.evaluate(r => fetch(r + '/__mkdir?d=' + encodeURIComponent('/Radio Plays')), R);   /* a share added to the relay mid-session (2.48.3) */
  await p.click('[data-hdprog="audio"]'); await p.waitForSelector('.nas-band');
  await p.waitForSelector('.nas-share >> text=RADIO PLAYS', { timeout: 5000 });
  assert.strictEqual(await txt(p, '#eyebrow'), 'HOLODECK · AUDIO · NAS');
  assert.strictEqual(await txt(p, '#title'), 'HOLODECK');
  assert.ok((await txt(p, '#allBtn')).includes('HOLODECK'), 'AUDIO counts as HOLODECK');
  const n0 = await p.$eval('#nasNeedle', e => e.style.left);
  await p.click('.nas-share >> text=PODCASTS');
  await p.waitForFunction(n0 => { const n = document.getElementById('nasNeedle'); return !n || n.style.left !== n0; }, n0, { timeout: 3000 });
  await p.waitForSelector('.nas-row');
  assert.strictEqual(await txt(p, '#title'), 'PODCASTS', 'the needle swings, then the folder opens');
  await p.click('.nas-row >> text=Show A'); await p.waitForSelector('[data-nasplay]'); await p.click('[data-nasplay]');
  await p.waitForFunction(() => { const a = document.getElementById('nasAudio'); return a && !a.paused && a.currentTime > 0.3; }, null, { timeout: 8000 });
  await p.click('[data-hdgo="arch"]'); await p.waitForSelector('.hd-arch');
  assert.ok((await txt(p, '[data-hdprog="audio"]')).includes('PLAYING'), 'the arch says what plays');
  await visual(p); await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  assert.ok(await p.evaluate(() => document.getElementById('nasAudio').paused), 'the TV paused the audio');
  await p.waitForFunction(() => { const b = document.querySelector('#nasMini [data-nas="toggle"]'); return b && b.getAttribute('aria-label') === 'Play'; }, null, { timeout: 3000 });
  await p.click('#nasMini [data-nas="toggle"]');   /* audio again: the TV goes off */
  await p.waitForFunction(() => !(document.getElementById('hdVideo').getAttribute('src') || '').length, null, { timeout: 3000 });
  assert.ok((await txt(p, '.hd')).includes('The TV went off while audio plays.'));
  await p.click('#nasMini [data-nas="toggle"]');

  // ---- leaving: off (no Picture in Picture here); coming back: TUNE IN again, later in the broadcast
  await p.click('[data-hd="tune"]'); await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && v.getAttribute('src'); });
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  const off = await vid(p); assert.ok(off.paused && !off.src.includes('/Video/'), 'off after leaving: ' + JSON.stringify(off));
  await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await visual(p); await p.waitForSelector('.hd-tune:not([disabled])');

  // ---- AUDIO (STORAGE) leaves /Video to VISUAL
  await p.click('#allBtn'); await p.click('[data-station="holodeck"]'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="audio"]'); await p.waitForSelector('.nas-share');
  assert.ok(!(await p.$$eval('.nas-share b', e => e.map(x => x.textContent))).includes('VIDEO'));

  // ---- COMPUTER
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'tv');
  assert.ok((await txt(p, '#cmdList')).includes('Tune in to the HOLODECK'));
  await p.click('#cmdList >> text=Tune in to the HOLODECK'); await p.waitForSelector('.hd');   /* straight to VISUAL; the station row itself opens the arch */

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');
  await p.click('[data-hdgo="arch"]'); await p.waitForSelector('.hd-arch'); await p.waitForTimeout(200);
  const cards = await p.$$eval('.hd-pg', e => e.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  assert.ok(cards.length === 2 && cards[0][0] === cards[1][0] && cards.every(c => c[1] > 120), 'the arch\'s programs, whole and side by side in width: ' + JSON.stringify(cards));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'the arch: no sideways scroll');

  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
