// RESSIKAN (2.44): a REFLECT station for playing with sound, all on the iPad (Web Audio). Opened from ALL STATIONS;
// SOUND ON; FIELD: the beat (a lofi pattern) with the ring's fixed slots (a tap toggles one, a lane cycles 16/12/10/8
// steps), synth knobs, ACROSS THE FIELD, HOLD NOTES and RELEASE, the theremin played with a finger, scale lock and
// FREEFORM, the ring inside the field; DRIFT: modes, bed, a touch, the sleep timer; RECORD a take and SAVE TO FILES;
// leaving goes quiet; settings kept on the iPad across a reload; COMPUTER finds it; phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('tos.ressikan.v1') || 'null'));
const until = async (fn, ms = 5000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const box = async (p, sel) => { await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150); return (await p.$(sel)).boundingBox(); };
const drag = async (p, sel, dy) => { const b = await box(p, sel); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 5 }); await p.mouse.up(); };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript(() => { const C = window.AudioContext; window.__acs = []; window.AudioContext = class extends C { constructor(o) { super(o); window.__acs.push(this); } }; });   // to see each sound engine
  const acs = p => p.evaluate(() => window.__acs.map(a => a.state));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-25T21:14:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload(); await p.waitForSelector('#allBtn');

  // ---- from ALL STATIONS → REFLECT
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('.rs');
  assert.strictEqual(await txt(p, '#title'), 'RESSIKAN');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · FIELD');
  assert.ok((await txt(p, '[data-rsread="field"]')).startsWith('SOUND OFF'));
  await p.click('[data-rsact="power"]');
  assert.strictEqual(await p.getAttribute('[data-rsact="power"]', 'aria-pressed'), 'true');
  assert.strictEqual(await txt(p, '[data-rsread="field"]'), 'PENTATONIC IN A');
  await until(async () => (await acs(p)).join() === 'running');
  // iPadOS takes the sound away mid-play (another app, a call, the lock screen): SOUND OFF, and the next tap starts clean (2.44.1)
  await p.evaluate(() => window.__acs[0].suspend());
  await p.waitForFunction(() => document.querySelector('[data-rsact="power"]').getAttribute('aria-pressed') === 'false');
  assert.strictEqual(await txt(p, '[data-rsread="field"]'), 'IPADOS PAUSED THE SOUND · TAP TO START AGAIN');
  await p.click('[data-rsact="power"]');
  await until(async () => (await acs(p)).join() === 'closed,running');
  assert.strictEqual(await txt(p, '[data-rsread="field"]'), 'PENTATONIC IN A');

  // ---- the beat: a lofi pattern, the ring's fixed slots
  await p.click('[data-rsact="beat"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · FIELD · BEAT 82 BPM');
  assert.strictEqual(await txt(p, '[data-rscardinfo="field"]'), '● BEAT 82 BPM · LOFI');
  const ring = await box(p, '[data-rssurf="ring"]');
  await p.mouse.click(ring.x + ring.width / 2, ring.y + ring.height * .05 + 2);   // the top dot of the outer ring (KEYS, step 1 of 16)
  await until(async () => { const s = await saved(p); return s && s.steps && !s.steps.keys.includes(0); });
  assert.strictEqual(await p.$('[data-rspat][aria-pressed="true"]'), null, 'an edited pattern is your own');
  await p.click('[data-rslane="hat"]');
  assert.strictEqual(await txt(p, '[data-rslane="hat"]'), 'HAT 12');
  await until(async () => { const s = await saved(p); return s && s.lens && s.lens[2] === 12 && s.steps.hat.every(x => x < 12); });
  assert.ok((await txt(p, '[data-rscardinfo="field"]')).includes('YOUR PATTERN'));
  await p.click('[data-rspat="dub"]');
  assert.deepStrictEqual((await until(async () => { const s = await saved(p); return s && s.pat === 'dub' && s; })).steps.kick, [0, 8]);

  // ---- the synth: knobs, what across the field does, held notes
  assert.strictEqual(await txt(p, '[data-rskv="th.fold"]'), '0%');
  await drag(p, '[data-rsk="th.fold"]', -60);
  assert.ok(/^\d+%$/.test(await txt(p, '[data-rskv="th.fold"]')) && (await txt(p, '[data-rskv="th.fold"]')) !== '0%');
  await p.click('[data-rsacross="vowel"]');
  assert.ok((await txt(p, '[data-rssurf="field"] .rs-hint')).includes('ACROSS IS VOWEL'));
  const th = await box(p, '[data-rssurf="field"]');
  await p.mouse.move(th.x + th.width * .3, th.y + th.height * .6); await p.mouse.down();
  await p.mouse.move(th.x + th.width * .6, th.y + th.height * .3, { steps: 10 }); await p.mouse.up();
  await p.click('[data-rsact="hold"]');
  const th2 = await box(p, '[data-rssurf="field"]');
  await p.mouse.click(th2.x + th2.width * .5, th2.y + th2.height * .5);
  await p.waitForSelector('[data-rsact="release"]');
  assert.strictEqual(await txt(p, '[data-rsact="release"]'), 'RELEASE 1');
  assert.ok((await txt(p, '[data-rscardinfo="field"]')).endsWith('1 held'));
  await p.click('[data-rsact="release"]');
  assert.strictEqual(await p.$('[data-rsact="release"]'), null);
  await p.click('[data-rsscale="free"]');
  assert.strictEqual(await txt(p, '[data-rsread="field"]'), 'FREEFORM · EVERY PITCH');
  await p.click('[data-rsact="place"]');
  assert.ok(await p.$('.rs-field.inside .rs-host .rs-ring'), 'the ring set inside the field');
  await p.screenshot({ path: D + 'ressikan-field.png' });

  // ---- DRIFT: modes, a bed, a touch, sleep
  await p.click('[data-rscard="drift"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · DRIFT · BEAT 82 BPM', 'the beat carries on');
  assert.strictEqual(await txt(p, '[data-rscardinfo="drift"]'), '● DUET · SURF');
  await p.click('[data-rsbed="rain"]'); await p.click('[data-rsdmode="play"]');
  assert.strictEqual(await txt(p, '[data-rscardinfo="drift"]'), '● PLAYING · RAIN');
  assert.ok((await txt(p, '.rs-dr .rs-hint')).startsWith('TAP TO BLOOM A NOTE'));
  const dr = await box(p, '[data-rssurf="drift"]');
  await p.mouse.move(dr.x + dr.width * .4, dr.y + dr.height * .4); await p.mouse.down(); await p.mouse.move(dr.x + dr.width * .5, dr.y + dr.height * .7, { steps: 8 }); await p.mouse.up();
  await p.click('[data-rssleep="15"]');
  assert.strictEqual(await txt(p, '[data-rsread="drift"]'), 'SLEEPS IN 15 MIN');
  await p.click('[data-rscard="field"]'); await p.click('[data-rsact="beat"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'REFLECT · RESSIKAN · FIELD');

  // ---- RECORD a take, SAVE TO FILES
  await p.click('[data-rsact="rec"]'); await p.waitForTimeout(1200); await p.click('[data-rsact="rec"]');
  await p.waitForSelector('.rs-take');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-rssave="0"]')]);
  assert.ok(/^Ressikan 2026-10-25 2114\d\d\.(m4a|webm)$/.test(dl.suggestedFilename()), dl.suggestedFilename());

  // ---- leaving goes quiet; settings kept on the iPad
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('.rs');
  assert.strictEqual(await p.getAttribute('[data-rsact="power"]', 'aria-pressed'), 'false', 'quiet after leaving');
  await p.waitForFunction(() => window.__acs[window.__acs.length - 1].state === 'suspended', null, { timeout: 5000 }).catch(() => {});   // suspend() settles a moment later under load
  assert.strictEqual((await acs(p)).pop(), 'suspended', 'the iPad\'s sound handed back');
  const n = (await acs(p)).length;
  await p.click('[data-rsact="power"]');   // coming back later: a fresh engine, running
  await until(async () => { const a = await acs(p); return a.length === n + 1 && a[n] === 'running' && a.slice(0, n).every(x => x === 'closed'); });
  await p.click('[data-rsact="power"]');
  await p.reload(); await p.waitForSelector('#allBtn');
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('.rs');
  assert.strictEqual(await p.getAttribute('[data-rsscale="free"]', 'aria-pressed'), 'true');
  assert.ok(await p.$('.rs-field.inside'));
  assert.strictEqual(await txt(p, '[data-rslane="hat"]'), 'HAT 16', 'DUB reset the lengths');
  assert.notStrictEqual(await txt(p, '[data-rskv="th.fold"]'), '0%');
  const s = await saved(p); assert.strictEqual(s.dmode, 'play'); assert.strictEqual(s.bedKind, 'rain'); assert.strictEqual(s.across, 'vowel');

  // ---- COMPUTER
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'theremin');
  assert.ok((await txt(p, '#cmdList')).includes('Play the theremin and a beat'));
  await p.keyboard.press('Escape');
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'ambient'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /DRIFT/.test(document.getElementById('eyebrow').textContent));

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');
  await p.screenshot({ path: D + 'ressikan-phone.png', fullPage: true });

  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
