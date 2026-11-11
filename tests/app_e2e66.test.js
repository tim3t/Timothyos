// EMOJI IN WHAT YOU WRITE (2.54.1; simulated bridge on :8105, invented titles): an event and a note captured with
// emoji (flags, keycaps, joined families) reach the bridge whole; the Time Loom shows an event's emoji in its list
// and on the loom, as Today and Week do (Notion's labels stay plain text); and while you write on the Bridge, the
// minute's redraw waits until you leave the field, so the field isn't swapped out under the iPad's emoji keyboard.
// Search boxes still redraw while in use.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const E = 'Hive 🐝 ❤️ 👨‍👩‍👧 1️⃣ 🇺🇸 check';

(async () => {
  await fetch(B + '&action=inboxmode&cap=1&fail=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const sent = []; p.on('request', r => { if (r.method() === 'POST' && r.url().includes(':' + P8105 + '/')) sent.push(JSON.parse(r.postData() || '{}')); });
  await p.clock.install({ time: new Date('2026-10-26T09:10:00-05:00') });
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom'])); }, [K, U]);
  await p.reload(); await p.clock.runFor(3000); await p.waitForSelector('#logIntent');

  // ---- captured whole
  await p.click('#capBtn'); await p.click('[data-ctype="event"]'); await p.click('#capText'); await p.keyboard.insertText(E);
  assert.strictEqual(await p.inputValue('#capText'), E);
  await p.click('#capSave'); await p.clock.runFor(2000);
  await p.click('#capBtn'); await p.click('[data-ctype="note"]'); await p.click('#capNoteText'); await p.keyboard.insertText('Note 🐝 ☀️');
  await p.click('#capSave'); await p.clock.runFor(2000);
  const ev = sent.filter(x => x.action === 'create')[0], nt = sent.filter(x => x.action === 'inboxadd')[0];
  assert.strictEqual(ev && ev.item.title, E, 'the event title went to the bridge whole');
  assert.strictEqual(nt && nt.note.text, 'Note 🐝 ☀️', 'the note too');

  // ---- the Loom keeps the event's emoji (it used to strip them)
  await p.click('[data-screen="loom"].nav'); await p.clock.runFor(1500);
  const loom = await p.innerText('#content');
  assert.ok(loom.includes('Hive 🐝 ❤️'), 'Loom list: ' + loom.slice(0, 400));
  await p.screenshot({ path: D + 'e66-loom.png' });
  await p.click('[data-screen="week"].nav'); await p.clock.runFor(800);
  assert.ok((await p.innerText('#content')).includes('Hive 🐝'), 'Week as before');

  // ---- writing on the Bridge: the minute's redraw waits
  await p.click('.elbow'); await p.clock.runFor(800);
  await p.click('#logIntent'); await p.keyboard.type('Bees ');
  await p.evaluate(() => { window.__f = document.getElementById('logIntent'); });
  await p.clock.runFor(130000);   // two minute ticks and a sync
  assert.ok(await p.evaluate(() => document.contains(window.__f) && document.activeElement === window.__f), 'the same field, still in use');
  await p.keyboard.insertText('🐝');
  assert.strictEqual(await p.inputValue('#logIntent'), 'Bees 🐝');
  await p.evaluate(() => document.activeElement.blur()); await p.clock.runFor(300);   // leave the field (the keyboard's Done): the held redraw happens now
  assert.ok(await p.evaluate(() => !document.contains(window.__f)), 'redrawn once you left the field');
  assert.strictEqual(await p.inputValue('#logIntent'), 'Bees 🐝', 'and kept');
  assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.log.v1')))['2026-10-26'], 'Bees 🐝');

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 }); await p.clock.runFor(500);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));

  assert.deepStrictEqual(errs, []);
  await b.close();
  await fetch(B + '&action=inboxmode&cap=0&fail=0');
  console.log('e2e66 emoji: OK');
})().catch(async e => { console.error(e); await fetch(B + '&action=inboxmode&cap=0&fail=0').catch(() => {}); process.exit(1); });
