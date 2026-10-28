// CAPTURE to Google Calendar: defaults, saving, the empty-title check, a tap on the Day timeline and on the Week grid
// (2.47: app_e2e7 merged in), all-day, the offline queue (pending block, QUEUED, sent once when back), a permanent failure
// with DISCARD in Systems, the note when Personal is hidden, phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/';
const K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8092/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T10:40:00-05:00'));
  await p.goto('http://localhost:8080/');

  // 2. New bridge
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8092/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1200);
  const txt = async sel => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
  const created = async t => (await stats()).created.filter(x => x === t).length, queue = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1') || '[]').length);
  const bee0 = await created('Pick up bee feeder'), off0 = await created('Offline idea');
  assert.strictEqual(await txt('#topNote'), 'CALENDAR CORE · CAPTURE ON');
  await p.click('#capBtn'); await p.waitForTimeout(200);
  assert.strictEqual(await p.inputValue('#capTime'), '11', 'the next whole hour');
  assert.strictEqual(await p.getAttribute('[data-capday="today"]', 'aria-pressed'), 'true');
  assert.strictEqual(await p.getAttribute('[data-dur="1"]', 'aria-pressed'), 'true');
  await p.fill('#capText', 'Pick up bee feeder');
  await p.click('[data-dur="0.5"]');
  await p.screenshot({ path: D + 'cap-sheet.png' });
  await p.press('#capText', 'Enter'); await p.waitForTimeout(800);
  assert.strictEqual(await txt('#toast'), 'Saved to Personal · TUE 06 OCT 11:00');
  assert.strictEqual(await p.locator('.ev', { hasText: 'Pick up bee feeder' }).count(), bee0 + 1, 'on the day once');
  assert.strictEqual(await p.locator('.ev.pending').count(), 0); assert.strictEqual(await queue(), 0);
  assert.strictEqual(await created('Pick up bee feeder'), bee0 + 1, 'saved once');
  await p.screenshot({ path: D + 'cap-saved.png' });

  // 3. Empty validation
  await p.click('#capBtn'); await p.click('#capSave'); assert.strictEqual(await txt('#capErr'), 'Type what you want to add first.'); await p.click('#capCancel');

  // 4. Tap empty timeline at 15:00
  const y = await p.evaluate(() => { const tl = document.querySelector('.tl'); const h = [...tl.querySelectorAll('.hour')][15]; h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); return r.top + 5; });
  const x = await p.evaluate(() => { const r = document.querySelector('.tl').getBoundingClientRect(); return r.left + r.width - 30; });
  await p.mouse.click(x, y); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#capScrim')); assert.strictEqual(await p.inputValue('#capTime'), '15', 'the tapped hour');
  await p.fill('#capText', 'All day farm stand'); await p.click('[data-capday="tomorrow"]'); await p.click('[data-dur="all"]');
  assert.ok(await p.isHidden('#capTime'), 'all day hides the time');
  await p.click('#capSave'); await p.waitForTimeout(800);
  assert.strictEqual(await txt('#toast'), 'Saved to Personal · WED 07 OCT · ALL DAY');

  // 5. Offline queue
  await p.click('[data-dur]', { trial: true }).catch(() => {});
  await p.route('**/127.0.0.1:8092/**', r => r.abort());
  await p.click('#capBtn'); await p.fill('#capText', 'Offline idea'); await p.click('[data-dur="1"]'); await p.click('#capSave'); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator('.ev.pending', { hasText: 'Offline idea' }).count(), 1, 'shown as pending on the day');
  assert.ok((await txt('#status')).includes('1 QUEUED'), await txt('#status'));
  assert.strictEqual(await created('Offline idea'), off0, 'nothing reached the server');
  await p.screenshot({ path: D + 'cap-queued.png' });
  await p.unroute('**/127.0.0.1:8092/**');
  await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1200);


  // 6. Permanent failure
  await p.click('#capBtn'); await p.fill('#capText', 'FAILME'); await p.click('#capSave'); await p.waitForTimeout(800);
  assert.strictEqual(await txt('#toast'), 'Not saved: The title is empty or longer than 200 characters.');
  assert.ok((await txt('#status')).startsWith('NOT SAVED'), await txt('#status'));
  assert.strictEqual(await created('Offline idea'), off0 + 1, 'the queued capture went once the bridge answered again');
  await p.click('#status'); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'cap-systems.png', fullPage: true });
  await p.click('[data-qdiscard]'); await p.waitForTimeout(300);
  assert.strictEqual(await queue(), 0, 'DISCARD empties the queue'); assert.ok((await txt('#status')).startsWith('SYNCED'), await txt('#status'));
  assert.strictEqual(await created('Offline idea'), off0 + 1, 'still exactly once');

  // 7. Personal hidden note
  await p.click('[data-screen="today"]'); await p.waitForTimeout(500); await p.click('[data-toggle="personal"]');
  await p.click('#capBtn'); assert.strictEqual(await txt('#capNote'), 'Personal is hidden. New events save, but stay hidden until you tap Personal on Today.'); await p.click('#capCancel'); await p.click('[data-toggle="personal"]');

  // 8. Week: a tap on an empty slot opens CAPTURE at that day and hour
  await p.click('[data-screen="week"]'); await p.waitForTimeout(900);
  const pt = await p.evaluate(() => {
    const col = document.querySelector('.wkcol[data-ymd="2026-10-08"]'); const line = col.querySelectorAll('.wkline')[15];   // the line at 16:00
    line.scrollIntoView({ block: 'center' }); const r = line.getBoundingClientRect(); const c = col.getBoundingClientRect();
    return { x: c.left + c.width / 2, y: r.top + 10 };
  });
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#capScrim'), 'week tap opens CAPTURE');
  assert.strictEqual(await p.inputValue('#capDate'), '2026-10-08'); assert.strictEqual(await p.inputValue('#capTime'), '16');
  await p.click('#capCancel');

  await p.setViewportSize({ width: 400, height: 860 }); await p.click('#capBtn'); await p.waitForTimeout(200);
  await p.screenshot({ path: D + 'cap-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), 'no sideways scroll at phone width');
  console.log('errors', errs); await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
