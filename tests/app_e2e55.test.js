// RESSIKAN (2.44; revamped 2.82, D82: CHORDS and SOLO, from Timothy's approved mockup; every loop here is invented).
// Opened from ALL STATIONS; SOUND ON, and an interruption by iPadOS that turns it off and starts clean on the next tap.
// CHORDS: the seven pads of the key (F major: ii7 is Gm7), PLAY runs the loop (the bar playing glows, the beat's
// playhead moves), a bar then a pad writes it, CAPTURE, starters, colours and BORROW, NEXT?, sounds and styles, 4/8
// bars and half bars, the beat grid (step, accent, clear), kits, patterns and mutes. MY LOOPS saves, opens and removes;
// SAVE AS MIDI hands over a real MIDI file. SOLO: scale pads, the chord playing now lit, a touch plays and a slide
// glides, sounds and notes. RECORD a take and SAVE TO FILES; leaving goes quiet; settings kept across a reload;
// COMPUTER finds both cards; phone width.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('tos.ressikan.v1') || 'null'));
const until = async (fn, ms = 5000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const slotsText = p => p.$$eval('.rs-slot', l => l.map(b => b.querySelector('.rs-num').textContent + ' ' + b.querySelector('.rs-nm').textContent));

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', acceptDownloads: true });
  await lane(ctx);
  await ctx.addInitScript(() => { const C = window.AudioContext; window.__acs = []; window.AudioContext = class extends C { constructor(o) { super(o); window.__acs.push(this); } }; });   // to see each sound engine
  const acs = p => p.evaluate(() => window.__acs.map(a => a.state));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.ressikan.v1', JSON.stringify({ card: 'field', key: 9, fx: { echo: .1, space: .5, lofi: .25, wow: .3 }, th: { wave: .3 } })); }, [K, U]);   // a FIELD-era setting: only key and room come across
  await p.reload(); await p.waitForSelector('#allBtn');

  // ---- from ALL STATIONS → REFLECT; an older FIELD setting keeps its key and room
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('.rs');
  assert.strictEqual(await txt(p, '#title'), 'RESSIKAN');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · CHORDS');
  assert.ok((await txt(p, '[data-rsread]')).startsWith('SOUND OFF'));
  assert.strictEqual(await txt(p, '.rs-key b'), 'A', 'the key came across');
  assert.strictEqual(await p.getAttribute('[data-rsk="fx.echo"]', 'aria-valuenow'), '10', 'and the room');
  for (let i = 0; i < 4; i++) await p.click('[data-rskey="-1"]');   // A → F
  assert.strictEqual(await txt(p, '.rs-key b'), 'F');

  // ---- the pads: the seven chords of F major, with the 7th; the loop: LOFI (ii7 V7 Imaj7 vi7)
  assert.deepStrictEqual(await p.$$eval('.rs-pad', l => l.map(x => x.querySelector('.rs-pn').textContent + ' ' + x.querySelector('.rs-pc').textContent)),
    ['Imaj7 Fmaj7', 'ii7 Gm7', 'iii7 Am7', 'IVmaj7 B♭maj7', 'V7 C7', 'vi7 Dm7', 'viiø7 Em7♭5']);
  assert.deepStrictEqual(await slotsText(p), ['ii7 Gm7', 'V7 C7', 'Imaj7 Fmaj7', 'vi7 Dm7']);
  assert.deepStrictEqual(await p.$$eval('.rs-pad.next .rs-pn', l => l.map(x => x.textContent)), ['ii7', 'IVmaj7', 'V7'], 'NEXT? after vi: ii, IV, V');

  // ---- SOUND ON; iPadOS takes the sound away mid-play: SOUND OFF, and the next tap starts clean (2.44.1)
  await p.click('[data-rsact="power"]');
  await until(async () => (await acs(p)).join() === 'running');
  assert.strictEqual(await txt(p, '[data-rsread]'), 'STOPPED · F MAJOR');
  await p.evaluate(() => window.__acs[0].suspend());
  await p.waitForFunction(() => document.querySelector('[data-rsact="power"]').getAttribute('aria-pressed') === 'false');
  assert.strictEqual(await txt(p, '[data-rsread]'), 'IPADOS PAUSED THE SOUND · TAP TO START AGAIN');

  // ---- PLAY: the loop runs (sound comes on with it), the bar playing glows, the playhead moves
  await p.click('[data-rsact="play"]');
  await until(async () => (await acs(p)).join() === 'closed,running');
  await p.waitForSelector('.rs-slot.now', { timeout: 5000 }); await p.waitForSelector('.rs-cell.ph', { timeout: 5000 });
  assert.ok(/^BAR [1-4] OF 4$/.test(await txt(p, '[data-rsread]')), await txt(p, '[data-rsread]'));
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · CHORDS · 82 BPM');
  assert.ok(/^● 82 BPM · /.test(await txt(p, '[data-rscardinfo="chords"]')));

  // ---- a bar, then a pad: written there, and the next bar is picked
  await p.click('[data-rsslot="1"]'); assert.ok(await p.$('.rs-slot.sel[data-rsslot="1"]'));
  await p.click('[data-rscolour=""]'); await p.click('[data-rspad="3"]');
  assert.deepStrictEqual((await slotsText(p))[1], 'IV B♭');
  assert.ok(await p.$('.rs-slot.sel[data-rsslot="2"]'), 'the next bar is picked');
  await p.click('[data-rscolour="sus4"]'); await p.click('[data-rspad="4"]');
  assert.deepStrictEqual((await slotsText(p))[2], 'Vsus Csus4');
  await p.click('[data-rsslot="2"]'); await p.click('[data-rsclear="2"]');
  assert.deepStrictEqual((await slotsText(p))[2], '— Empty');
  // BORROW: iv from F minor
  await p.click('[data-rscolour=""]'); await p.click('[data-rsact="borrow"]');
  assert.deepStrictEqual(await p.$$eval('.rs-pad .rs-pn', l => l.map(x => x.textContent)), ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']);
  await p.click('[data-rspad="3"]');   // bar 3 is still picked after clearing it
  assert.deepStrictEqual((await slotsText(p))[2], 'iv B♭m');
  await p.click('[data-rsact="borrow"]');
  await until(async () => { const s = await saved(p); return s && s.v === 2 && s.slots.join() === '1:7,3:,3::b,5:7'; });

  // ---- CAPTURE: a pad played in time lands in the bar playing
  await p.click('[data-rsact="capture"]');
  await p.click('[data-rscolour="9"]'); await p.click('[data-rspad="0"]');
  assert.ok((await slotsText(p)).includes('Imaj9 Fmaj9'), 'captured into the loop: ' + (await slotsText(p)).join(' | '));
  await p.click('[data-rsact="capture"]');

  // ---- starters and SURPRISE; SPANISH switches to minor with a borrowed V
  await p.click('[data-rsstart="pop"]');
  assert.deepStrictEqual(await slotsText(p), ['I F', 'V C', 'vi Dm', 'IV B♭']);
  await p.click('[data-rsstart="spanish"]');
  assert.deepStrictEqual(await slotsText(p), ['i Fm', 'VII E♭', 'VI D♭', 'V C']);
  assert.strictEqual(await p.getAttribute('[data-rsmode="minor"]', 'aria-pressed'), 'true');
  await p.click('[data-rsmode="major"]'); await p.click('[data-rsact="surprise"]');
  assert.strictEqual((await slotsText(p)).filter(x => !/Empty/.test(x)).length, 4, 'SURPRISE fills the loop');
  await p.click('[data-rsstart="lofi"]');

  // ---- length: 8 bars repeats the four; half bars double up and come back
  await p.click('[data-rsbars="8"]');
  assert.deepStrictEqual(await slotsText(p), ['ii7 Gm7', 'V7 C7', 'Imaj7 Fmaj7', 'vi7 Dm7', 'ii7 Gm7', 'V7 C7', 'Imaj7 Fmaj7', 'vi7 Dm7']);
  await p.click('[data-rsbars="4"]'); await p.click('[data-rsevery="8"]');
  assert.strictEqual((await slotsText(p)).length, 8); assert.strictEqual(await txt(p, '[data-rsslot="1"] .rs-bar'), 'BAR 1·B');
  await p.click('[data-rsevery="16"]');
  assert.deepStrictEqual(await slotsText(p), ['ii7 Gm7', 'V7 C7', 'Imaj7 Fmaj7', 'vi7 Dm7']);

  // ---- how they play
  for (const s of ['pad', 'pluck', 'organ', 'keys']) { await p.click('[data-rssound="' + s + '"]'); assert.strictEqual(await p.getAttribute('[data-rssound="' + s + '"]', 'aria-pressed'), 'true'); }
  for (const s of ['stab', 'strum', 'arp']) { await p.click('[data-rsstyle="' + s + '"]'); await p.waitForTimeout(300); }
  await p.click('[data-rsarp="updown"]'); await p.click('[data-rsrate="1"]'); await p.waitForTimeout(400);
  await p.click('[data-rsact="bass"]');
  await until(async () => { const s = await saved(p); return s && s.sound === 'keys' && s.style === 'arp' && s.arp === 'updown' && s.rate === 1 && s.bass === false; });
  await p.click('[data-rsact="bass"]'); await p.click('[data-rsstyle="hold"]');

  // ---- the beat: step on, accent, clear; kits, patterns, a mute
  const cell = '[data-rscell="0:3"]';
  await p.click(cell); assert.ok(/ on$/.test(await p.getAttribute(cell, 'aria-label')));
  await p.click(cell); assert.ok(/ accent$/.test(await p.getAttribute(cell, 'aria-label')));
  await p.click(cell); assert.ok(/ off$/.test(await p.getAttribute(cell, 'aria-label')));
  assert.strictEqual(await p.$('[data-rspat][aria-pressed="true"]'), null, 'an edited pattern is your own');
  await p.click('[data-rskit="808"]'); await p.click('[data-rspat="house"]'); await p.click('[data-rslane="shaker"]');
  assert.strictEqual(await txt(p, '[data-rslane="shaker"]'), 'SHAKER MUTED');
  await until(async () => { const s = await saved(p); return s && s.kit === '808' && s.grid[0] === '2000200020002000' && s.mute.join() === 'shaker'; });
  await p.screenshot({ path: D + 'ressikan-chords.png' });

  // ---- MY LOOPS: save, open, remove (asks first); SAVE AS MIDI
  await p.fill('#rsLoopName', 'Sample porch'); await p.click('[data-rsact="saveloop"]');
  assert.ok((await txt(p, '.rs-loops')).startsWith('Sample porch F major · 82 BPM · 4 chords'), await txt(p, '.rs-loops'));
  await p.click('[data-rspat="lofi"]'); await p.click('[data-rsstart="pop"]');
  await p.click('[data-rsloop="0"]');
  assert.deepStrictEqual(await slotsText(p), ['ii7 Gm7', 'V7 C7', 'Imaj7 Fmaj7', 'vi7 Dm7'], 'the saved chords back');
  assert.strictEqual(await p.getAttribute('[data-rscell="0:4"]', 'aria-label'), 'KICK step 5, accent', 'and its beat');
  const [mid] = await Promise.all([p.waitForEvent('download'), p.click('[data-rsact="midi"]')]);
  assert.ok(/^Ressikan F major \d{4}-\d\d-\d\d \d{4}\.mid$/.test(mid.suggestedFilename()), mid.suggestedFilename());
  const bytes = require('fs').readFileSync(await mid.path());
  assert.strictEqual(bytes.slice(0, 4).toString(), 'MThd'); assert.strictEqual(bytes.readUInt16BE(10), 4, 'four tracks');
  assert.strictEqual(bytes.toString('latin1').split('MTrk').length - 1, 4);
  await p.click('[data-rsdel="0"]'); assert.strictEqual(await txt(p, '[data-rsdel="0"]'), 'REMOVE?');
  await p.click('[data-rsdel="0"]'); assert.strictEqual(await p.$('.rs-loops'), null);
  await p.fill('#rsLoopName', 'Sample barn'); await p.click('[data-rsact="saveloop"]');

  // ---- SOLO: the scale's pads, the chord playing lit; a touch plays, a slide glides
  await p.click('[data-rscard="solo"]'); await p.waitForSelector('[data-rssolo]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · SOLO · 82 BPM');
  assert.strictEqual(await p.$$eval('[data-rsnote]', l => l.length), 11, 'pentatonic: two octaves and the top note');
  assert.deepStrictEqual(await p.$$eval('.rs-srow:last-child [data-rsnote] b', l => l.map(x => x.textContent)), ['F', 'G', 'A', 'C', 'D']);
  await until(async () => /^NOW \S+ \S+ NEXT \S+$/.test(await txt(p, '[data-rsnow]')));
  const lit = await p.$$eval('[data-rsnote].tone', l => l.length); assert.ok(lit >= 2, 'the chord playing is lit: ' + lit);
  const n1 = await (await p.$('.rs-srow:last-child [data-rsnote]:nth-child(1)')).boundingBox(), n3 = await (await p.$('.rs-srow:last-child [data-rsnote]:nth-child(3)')).boundingBox();
  await p.mouse.move(n1.x + n1.width / 2, n1.y + n1.height / 2); await p.mouse.down();
  assert.ok(await p.$('.rs-srow:last-child [data-rsnote]:nth-child(1).down'));
  await p.mouse.move(n3.x + n3.width / 2, n3.y + n3.height / 2, { steps: 6 });
  assert.ok(await p.$('.rs-srow:last-child [data-rsnote]:nth-child(3).down'), 'slid to the third note');
  await p.mouse.up(); assert.strictEqual(await p.$('[data-rsnote].down'), null);
  await p.click('[data-rsscale="full"]'); assert.strictEqual(await p.$$eval('[data-rsnote]', l => l.length), 15);
  await p.click('[data-rsscale="blues"]'); assert.strictEqual(await p.$$eval('[data-rsnote]', l => l.length), 13);
  for (const s of ['lead', 'bell', 'soft', 'flute']) await p.click('[data-rsssound="' + s + '"]');
  await p.click('[data-rsoct="1"]'); assert.strictEqual(await txt(p, '.rs-key b'), '+1');
  await p.screenshot({ path: D + 'ressikan-solo.png' });

  // ---- RECORD a take, SAVE TO FILES
  await p.click('[data-rsact="rec"]'); await p.waitForTimeout(1200); await p.click('[data-rsact="rec"]');
  await p.waitForSelector('[data-rssave="0"]', { timeout: 5000 });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-rssave="0"]')]);
  assert.ok(/^Ressikan \d{4}-\d\d-\d\d \d{6}\.(m4a|webm)$/.test(dl.suggestedFilename()), dl.suggestedFilename());

  // ---- leaving goes quiet; settings come back after a reload
  await p.click('.elbow');
  await p.waitForFunction(() => window.__acs[window.__acs.length - 1].state === 'suspended', null, { timeout: 5000 }).catch(() => {});   // suspend() settles a moment later under load
  assert.strictEqual((await acs(p)).pop(), 'suspended', 'the iPad\'s sound handed back');
  await p.reload(); await p.waitForSelector('#allBtn');
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('[data-rssolo]');
  assert.strictEqual(await p.getAttribute('[data-rsscale="blues"]', 'aria-pressed'), 'true');
  await p.click('[data-rscard="chords"]');
  assert.ok((await txt(p, '.rs-loops')).startsWith('Sample barn'));
  assert.strictEqual(await p.getAttribute('[data-rskit="808"]', 'aria-pressed'), 'true');

  // ---- COMPUTER finds both cards
  await p.click('.elbow'); await p.click('#cmdBtn'); await p.fill('#cmdText', 'solo');
  assert.ok((await txt(p, '#cmdList')).includes('Solo over the loop'), await txt(p, '#cmdList'));
  await p.keyboard.press('Enter'); await p.waitForSelector('[data-rssolo]');
  await p.click('.elbow'); await p.click('#cmdBtn'); await p.fill('#cmdText', 'chords');
  assert.ok((await txt(p, '#cmdList')).includes('Play chords over a beat'));

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#cmdList >> text=Play chords over a beat'); await p.waitForSelector('.rs-pads');
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'fits at 400 px: ' + w);
  await p.screenshot({ path: D + 'ressikan-narrow.png', fullPage: true });

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('RESSIKAN: chords, the loop, capture, starters, the beat, loops and MIDI, solo, record, quiet on leaving, kept, COMPUTER, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
