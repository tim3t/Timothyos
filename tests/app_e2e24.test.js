// Stations + Habits + Library (2.7.0, bridge 1.14). The bar holds seven pinned stations and
// ALL STATIONS opens every one (EDIT PINS changes the bar and survives a reload); HABITS records
// the day in one tap each (water in half-bottle steps of a 1 L bottle, debit card Did Not Swipe /
// Swiped), saves the whole day once, keeps unsaved taps, steps to earlier days; the Bridge strip
// and the Review week show the same; LIBRARY finishes, adds from an Open Library search, rates and
// removes books. All days and books are invented sample data; Open Library is simulated.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8102/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const navs = p => p.$$eval('#pins .nav', bs => bs.map(x => x.textContent.trim()));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T20:14:00-05:00'));   // a Wednesday evening
  let olq = [];
  await p.route('https://openlibrary.org/**', r => { olq.push(r.request().url()); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ docs: [{ key: '/works/OL1W', title: 'The Sample Voyage', author_name: ['Dee Example'], first_publish_year: 2020, cover_i: 12345 }, { key: '/works/OL2W', title: 'Sample Voyage Home', author_name: ['Dee Example'], first_publish_year: 2023 }] }) }); });
  await p.route('https://covers.openlibrary.org/**', r => r.fulfill({ status: 404, body: '' }));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8102/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(2000);

  // ---- the bar: seven pins, ALL STATIONS where the empty block was
  assert.deepStrictEqual(await navs(p), ['TODAY', 'WEEK', 'LOOM', 'REVIEW', 'LOG', 'HABITS', 'LIBRARY']);
  assert.ok((await p.textContent('#allBtn')).includes('ALL STATIONS'));
  await p.click('#allBtn'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#launch') && await p.isHidden('#content'));
  assert.strictEqual(await p.textContent('#title'), 'ALL STATIONS');
  assert.strictEqual(await p.getAttribute('#allBtn', 'aria-expanded'), 'true');
  assert.ok(await p.isDisabled('[data-station="audio"]'), 'standby stations are shown, not opened');
  await p.screenshot({ path: D + 'e2e24_launch.png' });
  // an unpinned station opens from here; the bar shows where you are
  await p.click('[data-station="dates"]'); await p.waitForTimeout(600);
  assert.strictEqual(await p.textContent('#title'), 'KEY DATES');
  assert.ok(await p.isHidden('#launch') && await p.isVisible('#content'));
  assert.strictEqual(await p.getAttribute('#allBtn', 'aria-current'), 'page');
  assert.ok((await p.textContent('#allBtn')).includes('· DATES'));
  // Escape closes it
  await p.click('#allBtn'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  assert.ok(await p.isHidden('#launch'));
  // EDIT PINS: swap LOOM for LEDGER; the bar is full at seven
  await p.click('#allBtn'); await p.click('[data-pins]'); await p.waitForTimeout(200);
  await p.click('[data-station="loom"]'); await p.click('[data-station="ledger"]'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await navs(p), ['TODAY', 'WEEK', 'REVIEW', 'LOG', 'HABITS', 'LEDGER', 'LIBRARY']);
  await p.click('[data-station="month"]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '.toast')).includes('The bar holds 7'));
  await p.screenshot({ path: D + 'e2e24_pins.png' });
  await p.click('[data-launch="close"]'); await p.reload(); await p.waitForTimeout(1500);
  assert.deepStrictEqual(await navs(p), ['TODAY', 'WEEK', 'REVIEW', 'LOG', 'HABITS', 'LEDGER', 'LIBRARY'], 'pins survive a reload');

  // ---- HABITS
  await p.click('[data-screen="habits"].nav'); await p.waitForTimeout(1500);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT');
  assert.ok((await p.textContent('#eyebrow')).startsWith('HABITS · TODAY'));
  assert.ok((await txt(p, '[data-hbool="med"]')).includes('NOT YET 4-DAY STREAK'));
  const before = (await stats()).hsets.length;
  await p.click('[data-hbool="med"]');
  await p.click('[data-hwater="2"]'); await p.click('[data-hwater="2"]');          // 2 L, then back to a half bottle: 1.5 L
  await p.click('[data-hstep="0.5"]');                                                // + ½ → 2 L
  await p.click('[data-hcard="kept"]');
  assert.ok((await txt(p, '[data-hbool="med"]')).includes('DONE 5-DAY STREAK'), 'counts at once');
  assert.ok((await txt(p, '.hb-tiles')).includes('2 L OF 3 L'));
  assert.ok((await txt(p, '.hb-tiles')).includes('DID NOT SWIPE'));
  await p.waitForTimeout(2500);
  let s = await stats();
  console.log('saves:', s.hsets.length - before, JSON.stringify(s.hsets[s.hsets.length - 1]));
  assert.ok(s.hsets.length - before <= 2, 'quick taps are sent together');
  assert.deepStrictEqual(s.habits['2026-10-07'], { date: '2026-10-07', med: true, walk: false, water: 2, card: 'kept' });
  assert.ok((await txt(p, '.hb .phead')).includes('SAVED TO NOTION'));
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.habitq.v1')), '{}', 'nothing left waiting');
  await p.screenshot({ path: D + 'e2e24_habits.png' });
  // a busy moment at Notion is retried on its own
  await fetch('http://127.0.0.1:8102/x/exec?action=hfail&n=1&key=' + K);
  await p.click('[data-hbool="walk"]'); await p.waitForTimeout(4500);
  assert.strictEqual((await stats()).habits['2026-10-07'].walk, true, 'saved after a retry');
  // earlier days: the arrows, never past today
  await p.click('#prevBtn'); await p.waitForTimeout(400);
  assert.strictEqual(await p.textContent('#title'), 'TUE 06 OCT');
  assert.ok((await p.textContent('#eyebrow')).includes('YESTERDAY'));
  const y = await txt(p, '.hb-tiles');
  assert.ok(y.includes('DONE') && y.includes('WALKED') && y.includes('2.5 L') && y.includes('DID NOT SWIPE'), y);
  await p.click('#nextBtn'); await p.click('#nextBtn'); await p.waitForTimeout(400);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT', 'no future days');
  await p.click('[data-hday="2026-10-01"] >> nth=0'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#title'), 'THU 01 OCT', 'a square opens its day');
  await p.click('[data-hgoal="2.5"]'); await p.waitForTimeout(200);
  assert.strictEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.habitcfg.v1'))).goal, 2.5);
  assert.ok((await txt(p, '.hb-srow:has-text("WATER")')).includes('2.5 L+'));
  await p.click('[data-hgoal="3"]');
  // the Bridge strip: the same day, one tap each
  await p.click('.elbow'); await p.waitForTimeout(800);
  const strip = await txt(p, '[data-panel="habits"]');
  console.log('strip:', strip);
  assert.ok(strip.includes('HABITS · TODAY') && strip.includes('WATER 2 L / 3 L') && strip.includes('DID NOT SWIPE'));
  assert.strictEqual(await p.getAttribute('[data-panel="habits"] [data-hbool="med"]', 'aria-pressed'), 'true');
  await p.click('[data-panel="habits"] [data-hstep="0.5"]'); await p.click('[data-panel="habits"] [data-hcycle]');   // + ½ L; card: kept → swiped
  await p.waitForTimeout(2500);
  s = await stats();
  assert.strictEqual(s.habits['2026-10-07'].water, 2.5); assert.strictEqual(s.habits['2026-10-07'].card, 'swiped');
  await p.screenshot({ path: D + 'e2e24_bridge.png' });
  // REVIEW: the week's habits, day by day; the log's trends gain a habits row
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(1200);
  assert.ok((await txt(p, '#content')).includes('HABITS PER WEEK'), 'trends row');
  assert.ok(await p.evaluate(() => { const c = document.getElementById('content'); return c.scrollWidth <= c.clientWidth; }), 'ALL REVIEWS does not scroll sideways (2.7.1)');
  await p.click('.rl-row:has-text("WEEK 41")'); await p.waitForTimeout(1500);
  const wk = await txt(p, 'section:has(.hb-wk)');
  console.log('review week:', wk.slice(0, 160));
  assert.ok(wk.includes('MEDITATED 3 / 3') && wk.includes('2.8 L AVG'), wk);
  await p.screenshot({ path: D + 'e2e24_review.png', fullPage: true });

  // ---- LIBRARY
  await p.click('[data-screen="library"].nav'); await p.waitForTimeout(1500);
  const st = await txt(p, '.lb-stats');
  assert.ok(/READ IN 2026 2 ?BOOKS/.test(st) && st.includes('ADA EXAMPLE 2 BOOKS READ'), st);
  assert.ok((await txt(p, '.lb-card')).includes('STARTED SUN 20 SEP · DAY 18'));
  await p.click('[data-bfinish="bk1"]'); await p.waitForTimeout(1500);
  s = await stats();
  assert.deepStrictEqual(s.bsaves[s.bsaves.length - 1], { id: 'bk1', status: 'read', finished: '2026-10-07' });
  assert.ok((await txt(p, '.lb-tools')).includes('READ · 4'));
  // add from an Open Library search
  await p.click('[data-act="addbook"]'); await p.fill('#olq', 'sample voyage'); await p.waitForTimeout(1200);
  assert.ok(olq.length === 1 && olq[0].includes('q=sample%20voyage'), 'one search after typing stops');
  await p.click('[data-addas="reading"][data-r="0"]'); await p.waitForTimeout(1500);
  s = await stats();
  const add = s.bsaves[s.bsaves.length - 1];
  assert.deepStrictEqual([add.title, add.author, add.status, add.started, add.cover, add.ol, add.year], ['The Sample Voyage', 'Dee Example', 'reading', '2026-10-07', 'https://covers.openlibrary.org/b/id/12345-M.jpg', 'https://openlibrary.org/works/OL1W', 2020]);
  assert.ok((await txt(p, '.lb-reading')).includes('The Sample Voyage'));
  assert.strictEqual(await p.locator('.lb-cover img').count(), 0, 'a cover that fails to load leaves the lettered cover');
  // rate a finished book
  await p.click('[data-shelf="read"]'); await p.waitForTimeout(300);
  await p.click('.lb-row[data-book="bk3"]'); await p.waitForTimeout(300);
  await p.click('[data-brate="5"]'); await p.click('[data-bdone]'); await p.waitForTimeout(1500);
  s = await stats();
  assert.deepStrictEqual(s.bsaves[s.bsaves.length - 1], { id: 'bk3', rating: 5 });
  // remove asks twice
  await p.click('[data-shelf="want"]'); await p.click('.lb-book[data-book="bk2"]'); await p.waitForTimeout(300);
  await p.click('[data-bremove]'); assert.ok((await txt(p, '[data-bremove]')).includes('TAP AGAIN'));
  await p.click('[data-bremove]'); await p.waitForTimeout(1500);
  assert.ok(!(await stats()).books.some(x => x[0] === 'Field Notes on Bees'));
  await p.screenshot({ path: D + 'e2e24_library.png' });

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(400);
  for (const sc of ['habits', 'library']) {
    await p.click('[data-screen="' + sc + '"].nav'); await p.waitForTimeout(600);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), sc + ' fits the phone');
  }
  await p.click('#allBtn'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('[data-station="month"]'));
  await p.screenshot({ path: D + 'e2e24_phone.png', fullPage: true });
  console.log('errors', errs);
  await b.close();
})();
