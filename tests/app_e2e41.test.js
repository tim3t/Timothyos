// LENGTHS + GOALS (2.30): Storage shows each track's length instead of its size, read from small parts of the files
// through the relay (simulated on :8110, files made by ffmpeg): MP3 with a Xing header, MP3 without one, MP3 behind a
// large artwork tag, M4A with its header after or before the audio, FLAC, WAV; a format it can't read stays blank;
// lengths are kept on the iPad. Habits (bridge simulated on :8105): changing the water goal counts from today, so past
// days keep the goal they had (the 30-day rate doesn't move), a past day shows its own goal, changing back the same
// day leaves no trace, and a goal saved by an older version becomes the first entry.
const { chromium } = require('playwright');
const assert = require('assert');
const { execFileSync } = require('child_process');
const D = __dirname + '/out/', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110'), K = 'k'.repeat(64);
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mmss = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

const audio = async p => { await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('[data-hdprog="audio"]'); await p.click('[data-hdprog="audio"]'); await p.waitForFunction(() => !document.querySelector('.hd-arch')); };   // 2.47: STORAGE is HOLODECK → AUDIO, through the arch
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'habits', 'storage']));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.habitcfg.v1', JSON.stringify({ goal: 2.5 }));   // as saved before 2.30
  }, [K, R]);
  await p.reload(); await p.waitForTimeout(1500);

  // ---- STORAGE: lengths, not sizes
  const sent0 = (await (await fetch(R + '/__stats')).json()).sent;
  await audio(p); await p.waitForSelector('.nas-share');
  await p.click('.nas-share >> text=MUSIC'); await p.click('[data-nasdir="/Music/Lengths"]');
  await p.waitForSelector('[data-nasplay="/Music/Lengths/vbr.mp3"]');
  const row = f => p.$eval('[data-nasplay="/Music/Lengths/' + f + '"] .nas-m.tnum', el => el.textContent);
  const want = { 'vbr.mp3': 75, 'cbr.mp3': 61, 'art.mp3': 42, 'end.m4a': 63, 'fast.m4a': 50, 'song.flac': 33 };
  await p.waitForFunction(n => [...document.querySelectorAll('[data-nasplay^="/Music/Lengths/"] .nas-m.tnum')].filter(e => /:/.test(e.textContent)).length >= n, Object.keys(want).length, { timeout: 15000 });
  for (const f of Object.keys(want)) {
    const shown = await row(f);
    // ffprobe's own reading of the file, as a second opinion (the relay mock made these files)
    assert.strictEqual(shown, mmss(want[f]), f + ' shows ' + shown);
  }
  assert.strictEqual(await row('talk.ogg'), '', 'a format it can\'t read stays blank (no size)');
  assert.ok(!/\d\s?(KB|MB)/.test(await txt(p, '.nas-list, #content')), 'no sizes on audio rows');
  // read from small parts of the files, not downloaded
  const sent = (await (await fetch(R + '/__stats')).json()).sent;
  for (const f of Object.keys(want)) {
    const path = '/Music/Lengths/' + f, n = (sent[path] || 0) - (sent0[path] || 0);
    assert.ok(n > 0 && n <= 140000, f + ': read ' + n + ' bytes');
  }
  assert.ok(!sent['/Music/Lengths/talk.ogg'], 'formats it can\'t read aren\'t fetched');
  // kept on the iPad: a second visit asks nothing
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.naslen.v1')));
  assert.strictEqual(kept['/Music/Lengths/vbr.mp3'].s, 75);
  await p.click('.nas-crumbs >> text=MUSIC'); await p.click('[data-nasdir="/Music/Lengths"]'); await p.waitForTimeout(800);
  const again = (await (await fetch(R + '/__stats')).json()).sent;
  assert.strictEqual(again['/Music/Lengths/vbr.mp3'], sent['/Music/Lengths/vbr.mp3'], 'not read twice');
  assert.strictEqual(await row('end.m4a'), '1:03');
  await p.screenshot({ path: D + 'storage-lengths.png' });
  // WAV in the older folders too
  await p.click('.nas-crumbs >> text=NAS'); await p.click('.nas-share >> text=PODCASTS'); await p.click('[data-nasdir="/Podcasts/Show A"]');
  await p.waitForFunction(() => { const e = document.querySelector('[data-nasplay="/Podcasts/Show A/ep 1.wav"] .nas-m.tnum'); return e && e.textContent === '1:30'; }, null, { timeout: 8000 });
  const notes = await p.$eval('.nas-row.other .nas-m.tnum', el => el.textContent);
  assert.ok(/B$/.test(notes), 'a document still shows its size: ' + notes);

  // ---- HABITS: a new goal counts from today
  await p.click('[data-screen="habits"].nav'); await p.waitForSelector('.hb-srow');
  const rate = async () => (await txt(p, '.hb-srow:has-text("WATER") .n:nth-of-type(3)'));
  const waterRow = () => txt(p, '.hb-srow:has-text("WATER")');
  const r0 = await waterRow();
  assert.ok(r0.includes('2.5 L+'), r0);
  // a past day recorded at exactly 2.5 L
  const cells = await p.$$eval('.hb-g:has(h3:text("WATER")) .hb-cell[data-hday]', n => n.map(x => [x.dataset.hday, x.title]));
  const at25 = cells.find(c => / 2\.5 L of 2\.5 L$/.test(c[1]));
  assert.ok(at25, 'a day at 2.5 L met that day\'s goal: ' + JSON.stringify(cells.slice(-20)));
  const pct0 = r0.match(/(\d+)\s*%/)[1];
  await p.click('[data-hgoal="3"]'); await p.waitForTimeout(200);
  const r1 = await waterRow();
  assert.ok(r1.includes('3 L+'), r1);
  assert.strictEqual(r1.match(/(\d+)\s*%/)[1], pct0, 'the 30-day rate is unchanged: past days keep their goal');
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.habitcfg.v1')));
  const today = await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  assert.deepStrictEqual(cfg, { goal: 3, hist: [{ from: '', goal: 2.5 }, { from: today, goal: 3 }] });
  assert.ok((await txt(p, '.hb-top')).includes('A new goal counts from today; earlier days keep the goal they had. 3 L from') && (await txt(p, '.hb-top')).includes('(was 2.5 L)'), await txt(p, '.hb-top'));
  assert.ok((await txt(p, '.hb-tile:has-text("WATER")')).includes('OF 3 L'), 'today: the new goal');
  const t2 = await p.$eval('.hb-g:has(h3:text("WATER")) .hb-cell[data-hday="' + at25[0] + '"]', x => x.title);
  assert.ok(/ 2\.5 L of 2\.5 L$/.test(t2), 'that day still judged by 2.5 L: ' + t2);
  // a past day shows its own goal
  await p.click('.hb-g:has(h3:text("WATER")) .hb-cell[data-hday="' + at25[0] + '"]'); await p.waitForTimeout(300);
  assert.ok((await txt(p, '.hb-tile:has-text("WATER")')).includes('OF 2.5 L'), 'the past day shows the goal it had');
  assert.ok((await p.getAttribute('.hb-tile:has-text("WATER")', 'class')).includes('done'), 'and counts as met');
  await p.screenshot({ path: D + 'habits-goal-history.png' });
  // changing back the same day leaves no trace
  await p.click('[data-hgoal="2.5"]'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.habitcfg.v1'))), { goal: 2.5, hist: [{ from: '', goal: 2.5 }] });
  // a goal changed on an earlier day stays with those days: set history by hand (as if made last week), then check
  await p.evaluate(() => { localStorage.setItem('tos.habitcfg.v1', JSON.stringify({ goal: 3.5, hist: [{ from: '', goal: 2 }, { from: '2026-09-25', goal: 3.5 }] })); });
  await p.click('[data-screen="habits"].nav'); await p.waitForTimeout(300);
  const old = await p.$$eval('.hb-g:has(h3:text("WATER")) .hb-cell[data-hday]', n => n.map(x => [x.dataset.hday, x.title]));
  const before = old.find(c => c[0] < '2026-09-25' && / of /.test(c[1])), after = old.find(c => c[0] >= '2026-09-25' && / of /.test(c[1]));
  assert.ok(/ of 2 L$/.test(before[1]) && / of 3\.5 L$/.test(after[1]), before[1] + ' | ' + after[1]);

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
