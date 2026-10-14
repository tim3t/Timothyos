// HOLIDAYS (2.21, bridge 1.23): Google's holidays calendar read beside Key Dates as HOLIDAY, never as
// calendar events (no hours, meetings or BALANCE), a HOLIDAYS filter on DATES, a read-only card with
// HIDE THIS HOLIDAY (uses the IGNORED EVENTS list), and a status row in Systems. Dates are invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); }, K);
  await p.reload(); await p.waitForSelector('.ov-kd.a-holiday', { timeout: 10000 });

  // ---- Bridge: KEY DATES shows the next holiday, tagged, and only one of them
  const row = await txt(p, '.ov-kd.a-holiday');
  console.log('bridge row:', row);
  assert.ok(row.startsWith('3 DAYS') && row.includes('Veterans Day') && row.includes('HOLIDAY'), row);
  assert.strictEqual(await p.locator('.ov-kd.a-holiday').count(), 1, 'one holiday among the three');
  await p.screenshot({ path: D + 'holidays-bridge.png' });

  // ---- finished events (2.22): ended before now = .past, on the Bridge strip, Today and Week
  const nowMin = await p.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  await p.click('[data-screen="today"].nav'); await p.waitForSelector('.ev');
  const evs = await p.$$eval('.ev', n => n.map(x => ({ past: x.classList.contains('past'), tm: (x.querySelector('.tm') || {}).textContent || '' })));
  for (const e of evs) {
    const m = e.tm.match(/(\d\d):(\d\d)\s*$|-(\d\d):(\d\d)/); if (!m) continue;
    const end = m[3] ? +m[3] * 60 + +m[4] : +m[1] * 60 + +m[2];
    if (Math.abs(end - nowMin) > 1) assert.strictEqual(e.past, end < nowMin, 'past matches its end time: ' + JSON.stringify(e));
  }
  console.log('today blocks:', evs.map(e => (e.past ? '✓' : '·') + e.tm).join(' '));
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(500);
  if (new Date().getDay() !== 1) assert.ok(await p.locator('.wkb.past').count() > 0, 'Week dims finished blocks (earlier days this week)');
  await p.screenshot({ path: D + 'past-week.png' });
  await p.click('.elbow'); await p.waitForTimeout(500);

  // ---- not events: no hours, no blocks
  assert.ok(!(await p.evaluate(() => [...document.querySelectorAll('.ov-now, .ov-wk')].some(e => /Veterans Day/.test(e.textContent)))), 'not in Now/Next or Horizon');
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator('.wkb[title^="Veterans Day"]').count(), 0, 'no Week block');

  // ---- DATES: HOLIDAYS filter
  await p.click('#allBtn'); await p.click('[data-station="dates"]'); await p.waitForSelector('[data-kdf="holiday"]');
  await p.click('[data-kdf="holiday"]'); await p.waitForTimeout(200);
  const only = (await p.locator('.kd').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  assert.ok(only.length === 3 && only.every(t => t.includes('HOLIDAY')), 'only holidays: ' + only.join(' | '));
  await p.click('[data-kdf="personal"]'); await p.waitForTimeout(200);
  assert.ok(!(await txt(p, '#content')).includes('Veterans Day'), 'not filed under Personal');
  await p.click('[data-kdf=""]');

  // ---- the card: read-only, HIDE THIS HOLIDAY
  await p.click('.kd.a-holiday >> text=Daylight Saving Time ends'); await p.waitForSelector('#detailTitle');
  const card = await txt(p, '#detailSheet');
  assert.ok(card.includes('◆ HOLIDAY') && card.includes('HOLIDAYS IN UNITED STATES') && card.includes('read-only') && !card.includes('OPEN IN NOTION'), card);
  await p.click('[data-ignore="Daylight Saving Time ends"]'); await p.waitForTimeout(300);
  assert.ok(!(await txt(p, '#content')).includes('Daylight Saving'), 'hidden');
  assert.ok((await p.evaluate(() => JSON.parse(localStorage.getItem('tos.ignore.v1')))).includes('Daylight Saving Time ends'));

  // ---- Systems
  await p.click('#status'); await p.waitForTimeout(400);
  const sys = await txt(p, '.calrow.a-holiday');
  assert.ok(sys.includes('Holidays in United States') && sys.includes('2 shown') && sys.includes('OK'), sys);

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
