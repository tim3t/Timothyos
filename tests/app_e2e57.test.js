// HOLODECK and Standby (2.49): Standby never starts on HOLODECK (the arch, VISUAL, AUDIO) or while its TV is on air, and
// still does elsewhere. VISUAL's sleep timer: 15 MIN turns the TV off on the clock, and Standby then takes over (a night
// in front of the TV ends on the clock); END OF THIS SHOW turns it off when the video ends.
// AUDIO's timer hands over to Standby too, and the Captain's Log locks itself after 10 idle minutes. Simulated relay (WebM videos).
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const src = p => p.evaluate(() => { const v = document.getElementById('hdVideo'); return v ? v.getAttribute('src') || '' : ''; });
const idle = async (p, ms) => { for (let t = 0; t < ms; t += 30000) { await p.clock.runFor(30000); await p.waitForTimeout(20); } };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-28T21:00:00-05:00') });
  await fetch(R + '/__reset');
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.standby.v1', '5'); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: Date.now() }], ch: 1, look: 'clean', muted: true })); }, [K, R]);
  await p.reload();
  for (let i = 0; i < 10; i++) { await p.waitForTimeout(150); await p.clock.runFor(500); }
  await p.waitForSelector('[data-screen="holodeck"].nav');

  // ---- on the arch and in AUDIO: no Standby, however long
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch');
  await idle(p, 7 * 60000);
  assert.ok(await p.isHidden('#standby'), 'not on the arch');
  await p.click('[data-hdprog="audio"]'); await p.clock.runFor(1000); await p.waitForSelector('.nas-band');
  await idle(p, 7 * 60000);
  assert.ok(await p.isHidden('#standby'), 'not in AUDIO');

  // ---- elsewhere it still comes on
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(200);
  await idle(p, 6 * 60000);
  assert.ok(await p.isVisible('#standby'), 'Standby on TODAY after 5 minutes');
  await p.mouse.click(600, 400); await p.clock.runFor(2000); await p.waitForTimeout(400);
  assert.ok(await p.isHidden('#standby'));

  // ---- VISUAL: on air, no Standby; SLEEP 15 MIN turns the TV off, then Standby takes over
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
  for (let i = 0; i < 6; i++) { await p.clock.runFor(200); await p.waitForTimeout(100); }
  await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 20000 });
  // 2.53: SLEEP at the foot of the rail opens a window of large choices
  const sleepPick = async v => { await p.click('[data-hd="sleep"]'); await p.waitForSelector('.hd-win'); await p.click('[data-hdsleep="' + v + '"]'); assert.ok(!(await p.$('.hd-win')), 'a choice closes the window'); };
  assert.strictEqual(await txt(p, '[data-hd="sleep"]'), 'SLEEP OFF');
  await p.click('[data-hd="sleep"]');
  assert.strictEqual(await txt(p, '.hd-sleepgrid'), 'OFF 15 MIN 30 MIN 1 HOUR 2 HOURS END OF THIS SHOW');
  assert.strictEqual(await p.getAttribute('.hd-win', 'role'), 'dialog');
  await p.keyboard.press('Escape'); assert.ok(!(await p.$('.hd-win')), 'Escape closes it');
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  await sleepPick('15');
  assert.strictEqual(await txt(p, '[data-hd="sleep"]'), 'SLEEP 15 MIN LEFT');
  await p.click('[data-hd="sleep"]');
  assert.strictEqual(await p.getAttribute('[data-hdsleep="15"]', 'aria-pressed'), 'true');
  assert.strictEqual(await txt(p, '[data-hdsleep="15"]'), '15 MIN · 15 LEFT');
  await p.click('.hd-winend [data-hd="sleepclose"]');
  assert.ok((await txt(p, '#toast')).includes('The TV goes off in 15 minutes'));
  await idle(p, 9 * 60000);
  assert.ok(await p.isHidden('#standby'), 'no Standby while the TV is on');
  assert.ok((await src(p)).includes('/Video/'), 'still on air at 9 minutes');
  assert.ok(/^SLEEP [67] MIN LEFT$/.test(await txt(p, '[data-hd="sleep"]')), 'counting down: ' + await txt(p, '[data-hd="sleep"]'));   /* refreshed each second, so 6 or 7 at exactly 9:00 */
  await idle(p, 7 * 60000);
  assert.ok(!(await src(p)).includes('/Video/'), 'off at 15 minutes');
  assert.strictEqual(await txt(p, '[data-hd="sleep"]'), 'SLEEP OFF', 'the timer is spent');
  await idle(p, 60000);
  assert.ok(await p.isVisible('#standby'), 'after the sleep timer, Standby takes over (no touch for 5 minutes)');
  await p.screenshot({ path: D + 'holodeck-sleep.png' });
  await p.mouse.click(600, 400); await p.clock.runFor(2000); await p.waitForTimeout(400);

  // ---- a touch holds HOLODECK awake again
  await idle(p, 7 * 60000);
  assert.ok(await p.isHidden('#standby'), 'back to held once touched');

  // ---- END OF THIS SHOW: off when the video ends
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 10000 });
  await sleepPick('end');
  assert.strictEqual(await txt(p, '[data-hd="sleep"]'), 'SLEEP END OF SHOW');
  assert.ok((await txt(p, '#toast')).includes('The TV goes off at the end of this show'));
  await p.waitForFunction(() => !(document.getElementById('hdVideo').getAttribute('src') || '').length, null, { timeout: 15000 });
  assert.ok((await txt(p, '#toast')).includes('Sleep timer: the TV went off at the end of the show'));
  assert.ok(await p.$('.hd-tune'), 'off: TUNE IN shows again');

  // ---- turning it off by hand clears a timer
  await p.click('.hd-tune'); await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && v.getAttribute('src'); });
  await sleepPick('30'); await p.click('[data-hd="tune"]');
  assert.strictEqual(await txt(p, '[data-hd="sleep"]'), 'SLEEP OFF');

  // ---- AUDIO's sleep timer: the episode pauses on time, then Standby takes over (2.49 hand-over)
  await p.click('[data-hdgo="arch"]'); await p.waitForSelector('.hd-arch');
  await p.click('[data-hdprog="audio"]'); await p.clock.runFor(1000); await p.waitForSelector('.nas-share');
  await p.click('.nas-share >> text=PODCASTS'); for (let i = 0; i < 4; i++) { await p.clock.runFor(200); await p.waitForTimeout(150); }
  await p.waitForSelector('.nas-row >> text=Show A'); await p.click('.nas-row >> text=Show A'); await p.waitForSelector('[data-nasplay]');
  await p.click('[data-nasplay="/Podcasts/Show A/ep 1.wav"]');
  await p.waitForFunction(() => { const a = document.getElementById('nasAudio'); return a && !a.paused && a.currentTime > 0.2; }, null, { timeout: 10000 });
  await p.click('[data-hdgo="arch"]'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="audio"]');
  for (let i = 0; i < 4; i++) { await p.clock.runFor(200); await p.waitForTimeout(150); }
  await p.waitForSelector('[data-nassleep="15"]'); await p.click('[data-nassleep="15"]');
  await idle(p, 9 * 60000);
  assert.ok(await p.isHidden('#standby'), 'no Standby in AUDIO while the timer runs');
  await idle(p, 7 * 60000); await p.waitForTimeout(800);   /* the pause lands on the next time update */
  assert.ok(await p.evaluate(() => document.getElementById('nasAudio').paused), 'paused at 15 minutes');
  await idle(p, 60000);
  assert.ok(await p.isVisible('#standby'), 'then Standby takes over in AUDIO too');
  await p.mouse.click(600, 400); await p.clock.runFor(2000); await p.waitForTimeout(400);

  // ---- the Captain's Log locks itself after 10 minutes without a touch (Standby off, so this is the log's own rule)
  await p.evaluate(() => localStorage.setItem('tos.standby.v1', '0'));
  await p.click('#allBtn'); await p.click('[data-station="log"]'); await p.waitForSelector('.cl-key');
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · LOCKED');
  await p.keyboard.type('135790');
  for (let i = 0; i < 10 && (await txt(p, '#eyebrow')) !== 'JOURNAL · OPEN'; i++) { await p.clock.runFor(300); await p.waitForTimeout(200); }
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · OPEN');
  await idle(p, 9 * 60000);
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · OPEN', 'still open at 9 minutes');
  await idle(p, 90000);
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · LOCKED', 'locked by 10 and a half');
  assert.strictEqual(await p.locator('.cl-key').count(), 11, 'the PIN pad is back');
  assert.strictEqual(await p.$('.cl-cal'), null, 'no journal left on screen');
  assert.ok(await p.isHidden('#standby'));

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');

  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
