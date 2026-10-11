// Authorization code (2.12.0, bridge 1.17): with LOG_PIN set to a Greek code word and four digits,
// LOG asks for the word first (six word keys), then four digits; the word never shows by name once
// chosen; ⌫ steps back through digits, then the word; the keyboard works (letters a b g d t o);
// a wrong code says so and how many tries are left; a lockout says until when. Sample code only.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8103/x/exec?key=' + K + '&action=';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const filled = p => p.$$eval('.cl-dots i', is => is.map(i => (i.classList.contains('w') ? 'W' : 'd') + (i.classList.contains('on') ? '+' : '-')).join(' '));

(async () => {
  await fetch(M + 'pincode');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);

  // ---- the panel: six code words over the keypad; digits wait for a word
  assert.deepStrictEqual(await p.$$eval('.cl-word', bs => bs.map(x => x.dataset.lpin)), ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'THETA', 'OMEGA']);
  assert.strictEqual(await filled(p), 'W- d- d- d- d-');
  assert.ok((await txt(p, '.cl-lock')).includes('AUTHORIZATION REQUIRED') && (await txt(p, '.cl-msg')) === 'STATE AUTHORIZATION: CODE WORD');
  assert.ok(await p.isDisabled('[data-lpin="1"]'), 'digits wait for the word');
  await p.screenshot({ path: D + 'log-auth.png' });

  // ---- a word, then digits; the word shows only as a filled slot
  await p.click('[data-lpin="GAMMA"]');
  assert.strictEqual(await filled(p), 'W+ d- d- d- d-');
  assert.ok(await p.isDisabled('[data-lpin="OMEGA"]'), 'one word only');
  assert.strictEqual(await txt(p, '.cl-msg'), 'AUTHORIZATION: FOUR DIGITS');
  assert.ok(!(await txt(p, '.cl-dots, .cl-msg')).includes('GAMMA'), 'not named on screen');
  await p.click('[data-lpin="1"]'); await p.click('[data-lpin="7"]');
  assert.strictEqual(await filled(p), 'W+ d+ d+ d- d-');
  // ⌫ takes back the digits, then the word
  await p.click('[data-lpin="del"]'); await p.click('[data-lpin="del"]'); await p.click('[data-lpin="del"]');
  assert.strictEqual(await filled(p), 'W- d- d- d- d-'); assert.ok(!(await p.isDisabled('[data-lpin="OMEGA"]')));

  // ---- the wrong word with the right digits is refused
  await p.click('[data-lpin="ALPHA"]'); for (const k of '1701') await p.click('[data-lpin="' + k + '"]');
  await p.waitForTimeout(800);
  console.log('wrong:', await txt(p, '.cl-msg'));
  assert.strictEqual(await txt(p, '.cl-msg'), 'Authorization not recognized. 4 tries left before a lock.');
  assert.strictEqual(await filled(p), 'W- d- d- d- d-', 'cleared for another go');

  // ---- the keyboard: o for OMEGA, then the digits
  await p.keyboard.type('o1701'); await p.waitForSelector('#clFind', { timeout: 5000 });
  assert.ok(await p.isVisible('.cl-cal'), 'unlocked');
  const ls = (await p.evaluate(() => JSON.stringify(localStorage))).replace(/\d{10,}/g, '#');   /* timestamps can contain any four digits */
  assert.ok(!ls.includes('1701') && !ls.includes('OMEGA'), 'the code is never stored');
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(300);

  // ---- Systems describes it
  await p.click('#status'); await p.waitForTimeout(500);
  assert.ok((await txt(p, 'section:has(.phead:has-text("CAPTAIN\'S LOG"))')).includes('Authorization code set (a code word and four digits)'));

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#pins [data-screen="log"]').catch(async () => { await p.click('#allBtn'); await p.click('[data-station="log"]'); });
  await p.waitForTimeout(500);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll');
  await p.screenshot({ path: D + 'log-auth-phone.png', fullPage: true });
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(300);

  // ---- five wrong: locked, and it says until when
  for (let n = 0; n < 5; n++) { await p.keyboard.type('b0000'); await p.waitForTimeout(500); }
  console.log('locked:', await txt(p, '.cl-msg'));
  assert.ok(/^Locked until \d\d:\d\d after five wrong tries\. Each lockout in a row lasts twice as long\.$/.test(await txt(p, '.cl-msg')));

  await fetch(M + 'pincode');   // reset the simulated bridge
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
