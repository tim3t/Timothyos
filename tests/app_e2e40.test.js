// TYPING SURVIVES SAVING (2.29.1; simulated on :8105 with slow and refused saves): typing in a tarot note while
// earlier saves are still on their way, and as a brand-new reading gets its Notion id, keeps the cursor in the box and
// every character; the last text typed is what lands in Notion. Text typed in one reading never shows up in another.
// A save Apps Script refuses because another request holds its lock ("busy") is retried quietly, with no red error.
// Leaving the app saves at once. Every other text field the app draws has a stable id, so a redraw keeps it too.
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const D = __dirname + '/out/', K = 'k'.repeat(64), B = 'http://127.0.0.1:8105/macros/s/test/exec?key=' + K;
const stats = () => fetch(B + '&action=stats').then(r => r.json());
const ctl = q => fetch(B + '&action=' + q).then(r => r.json());
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'review', 'tarot']));
  }, K);
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile', { timeout: 10000 });
  await ctl('slowsave&ms=1400');   // each save takes 1.4 s: saves and typing overlap

  // ---- a brand-new reading: type in bursts while it is first saved (cid -> real id) and then saved again
  await p.click('[data-screen="tarot"].nav'); await p.waitForSelector('[data-trgo="new"]');
  await p.click('[data-trgo="new"]'); await p.click('[data-trspread="ppf"]');
  await p.fill('#trQ', 'Sample question while typing');
  await p.click('[data-tract="draw"]'); await p.waitForTimeout(400);
  await p.click('[data-tract="save"]'); await p.waitForSelector('.tr-pos');
  const note = '[data-trnote="0"]';
  await p.click(note);
  const parts = ['First burst of words, ', 'second burst while a save is in flight, ', 'third after the reading has its id, ', 'and the end.'];
  for (const part of parts) {
    await p.keyboard.type(part, { delay: 35 });
    const focus = await p.evaluate(() => document.activeElement && document.activeElement.dataset.trnote);
    assert.strictEqual(focus, '0', 'the cursor stays in the note after: ' + part);
    await p.waitForTimeout(1700);   // long enough for a save to start
  }
  const full = parts.join('');
  assert.strictEqual(await p.inputValue(note), full, 'nothing typed is lost on screen');
  assert.strictEqual(await p.evaluate(() => document.activeElement.dataset.trnote), '0', 'still in the note');
  const sel = await p.$eval(note, el => [el.selectionStart, el.value.length]);
  assert.strictEqual(sel[0], sel[1], 'the caret stays at the end');
  await until(async () => { const s = await stats(); const l = s.tsaves[s.tsaves.length - 1]; return l && l.notes && l.notes[0] === full && !l.cid; }, 20000);
  await p.waitForTimeout(2500);
  assert.strictEqual(await p.inputValue(note), full, 'still all there after every save has landed');
  const newId = (await stats()).tarot.find(r => r.q === 'Sample question while typing').id;
  assert.strictEqual((await stats()).tarot.find(r => r.id === newId).notes[0], full);

  // ---- WHAT IT SAYS the same way
  await p.click('[data-trsum]');
  await p.keyboard.type('The reading as a whole, ', { delay: 30 }); await p.waitForTimeout(1700);
  await p.keyboard.type('typed across a save.', { delay: 30 });
  assert.strictEqual(await p.evaluate(() => 'trsum' in document.activeElement.dataset), true);
  await until(async () => { const s = await stats(); return s.tarot.find(r => r.id === newId).sum === 'The reading as a whole, typed across a save.'; }, 20000);

  // ---- text typed in one reading never shows up in another
  await p.click('[data-trsum]'); await p.keyboard.press('End'); await p.keyboard.type(' More.');
  await p.click('[data-trgo="home"]'); await p.waitForSelector('.tr-list');
  await p.click('.tr-list [data-tropen="tr-r1"]'); await p.waitForSelector('.tr-pos');
  const r1 = (await stats()).tarot.find(r => r.id === 'tr-r1');   // earlier tests may have written here: read what's there
  assert.strictEqual(await p.inputValue('[data-trsum]'), r1.sum, 'the other reading shows its own text');
  await until(async () => (await stats()).tarot.find(r => r.id === newId).sum === 'The reading as a whole, typed across a save. More.');

  // ---- "busy" (another request held the bridge's lock): retried quietly, no red error, saved in the end
  await ctl('slowsave&ms=0'); await ctl('busysave&n=3');
  const n1 = await p.inputValue('[data-trnote="1"]');
  await p.focus('[data-trnote="1"]'); await p.keyboard.press('Control+End'); await p.keyboard.type('Saved despite a busy bridge.', { delay: 20 });
  await p.waitForTimeout(2500);
  assert.strictEqual(await p.locator('.tr .err').count(), 0, 'no red error while it retries');
  await until(async () => { const s = await stats(); return s.tarot.find(r => r.id === 'tr-r1').notes[1] === n1 + 'Saved despite a busy bridge.'; }, 25000);
  assert.strictEqual(await p.locator('.tr .err').count(), 0);

  // ---- leaving the app saves at once, without waiting for the pause
  const n2 = await p.inputValue('[data-trnote="2"]');
  await p.focus('[data-trnote="2"]'); await p.keyboard.press('Control+End'); await p.keyboard.type('Typed just before leaving.');
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await until(async () => { const s = await stats(); const l = s.tsaves[s.tsaves.length - 1]; return l && l.notes && l.notes[2] === n2 + 'Typed just before leaving.'; }, 900).catch(() => { throw new Error('not sent on leaving the app'); });
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });

  await ctl('slowsave&ms=0'); await ctl('busysave&n=0');
  // ---- every text field the app draws carries an id (render() keeps a focused field, its caret and its text by id)
  const src = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const bare = (src.match(/<(textarea|input type="(text|search|number|url|tel|email)")[^>]*>/g) || []).filter(s => !/ id="/.test(s));
  assert.deepStrictEqual(bare, [], 'text fields without an id');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(async e => { await ctl('slowsave&ms=0').catch(() => {}); await ctl('busysave&n=0').catch(() => {}); console.error(e); process.exit(1); });
