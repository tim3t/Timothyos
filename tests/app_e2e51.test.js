// ASTROMETRICS (2.40, bridge 1.32; simulated on :8105): the year at a glance. Without bridge 1.32 the rows it can't
// fill are left out and it says so; with it, the year read asks for local midnights, the star chart shades each row
// against itself, a tap reads a week out, a row opens its sector (and a month bar reads out), the Log stays locked
// until its PIN and then shows counts only (never stored), the pager steps a year, the Ship's Year compiles from
// counts only (never the Log; tarot only with its switch), prints, reads aloud in Moira, and on 31 December after
// 06:00 compiles itself as the whole year. Invented data throughout.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const astro = q => fetch(B + '&action=astromode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=astrostats').then(r => r.json());
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const UPKEEP = [{ id: 'u1', name: 'Juniper filter', cat: 'home', every: 3, unit: 'month', last: '2026-09-01', hist: ['2026-03-02', '2026-09-01'] }];

async function open(b, when, start, setup) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__said = [];
    function U(t) { this.text = t; }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
    const voices = [{ name: 'Moira', lang: 'en-IE', voiceURI: 'com.apple.voice.compact.en-IE.Moira' }];
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u) { window.__said.push(u); }, cancel() {}, getVoices() { return voices; }, addEventListener() {} }, configurable: true });
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.clock.setFixedTime(new Date(when));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, s, up]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify(s)); localStorage.setItem('tos.upkeep.v1', JSON.stringify(up)); }, [K, U, start, UPKEEP]);
  if (setup) await p.evaluate(setup);
  await p.reload(); await p.waitForTimeout(1200);
  return p;
}
async function station(p) { await p.click('#allBtn'); await p.click('[data-station="astrometrics"]'); await p.waitForSelector('#asChart'); }
const loaded = p => p.waitForFunction(() => !document.querySelector('.as-cell.wait') && /Read \d/.test((document.querySelector('.as-foot') || {}).textContent || ''), null, { timeout: 20000 });

(async () => {
  await astro('cap=0&fail=0&reset=1');
  await fetch(B + '&action=apmode&on=1');   /* the apiary on, as the lane's earlier tests leave it */
  const b = await chromium.launch(); const errs = [];

  // ---- an older bridge (no year read): what it can fill, and what needs 1.32
  let p = await open(b, '2026-10-23T09:30:00-05:00', 'bridge');
  await station(p); await loaded(p);
  assert.strictEqual(await txt(p, '#title'), '2026 · DAY 296');
  assert.strictEqual(await txt(p, '#eyebrow'), 'ASTROMETRICS · THE YEAR SO FAR');
  const rows0 = await p.$$eval('.as-rowlab:not(.kd)', els => els.map(e => e.textContent.trim()));
  assert.deepStrictEqual(rows0, ['CALENDAR', 'HABITS', 'LOG', 'REVIEW', 'LIBRARY', 'TAROT', 'APIARY', 'UPKEEP'], rows0.join(','));
  assert.ok((await txt(p, '.as-foot')).includes('TASKS and QUEUE need bridge 1.32'));
  assert.ok((await txt(p, '.as-fold')).includes('Needs the Google bridge updated to 1.32'));
  errs.push(...p.errs); await p.context().close();

  // ---- bridge 1.32
  await astro('cap=1');
  p = await open(b, '2026-10-23T09:30:00-05:00', 'bridge');
  await station(p); await loaded(p);
  const yr = (await stats()).years;
  assert.deepStrictEqual(yr[yr.length - 1], ['2026-01-01T06:00:00.000Z', '2027-01-01T06:00:00.000Z'], 'the year between local midnights');
  const rows1 = await p.$$eval('.as-rowlab:not(.kd)', els => els.map(e => e.textContent.trim()));
  assert.deepStrictEqual(rows1, ['CALENDAR', 'TASKS', 'HABITS', 'LOG', 'REVIEW', 'LIBRARY', 'TAROT', 'APIARY', 'QUEUE', 'UPKEEP'], rows1.join(','));
  const sweep = await txt(p, '.as-tiles');
  assert.ok(sweep.includes('TASKS DONE 13 BEST WK 34') && sweep.includes('BOOKS FINISHED 2 AVG 4.5★') && sweep.includes('LOG DAYS LOCKED') && /HONEY [\d.]+lb \d+ PULLS?/.test(sweep) && sweep.includes('REVIEWS 4/ 9'), sweep);
  // weeks after today are dots; the TODAY line stands at this week
  assert.ok(await p.$eval('[data-ascell="tasks:52"]', e => e.classList.contains('fut')));
  assert.ok(await p.$('.as-today'));
  // the busiest week is marked; a yes/no row (REVIEW) never is
  assert.ok(await p.$eval('[data-ascell="tasks:33"]', e => e.classList.contains('peak') && e.classList.contains('l4')));
  assert.strictEqual(await p.$$eval('.as-cell.peak[data-ascell^="review:"]', e => e.length), 0);
  // a tap reads the week out
  await p.click('[data-ascell="tasks:33"]');
  assert.strictEqual(await txt(p, '#asReadout'), 'TASKS · WK 34 · 17–23 AUG 4 tasks done. ✦ The busiest week of the year for TASKS.');
  assert.ok((await txt(p, 'section.as-panel >> nth=1')).includes('SECTOR · TASKS'));
  const facts = await txt(p, '.as-facts');
  assert.ok(facts.includes('13 tasks done') && facts.includes('Best: WK 34 · 17–23 AUG 4 done') && facts.includes('Most done in WORK'), facts);
  // a month bar reads out
  await p.click('rect.hitm[data-asbar="4"]');
  assert.ok((await txt(p, '.as-bars .as-readout')).startsWith('MAY 3 tasks done.'), await txt(p, '.as-bars .as-readout'));
  // LIBRARY's sector
  await p.click('.as-rowlab[data-asrow="library"]');
  assert.ok((await txt(p, '.as-facts')).includes('Highest rated: Long River 5★'));
  // the calendar's sector, by area
  await p.click('.as-rowlab[data-asrow="cal"]');
  const cal = await txt(p, '.as-blegend');
  assert.ok(cal.includes('WORK') && cal.includes('PERSONAL') && cal.includes('GROWTH'), cal);
  // UPKEEP from this iPad's history
  await p.click('.as-rowlab[data-asrow="upkeep"]');
  assert.ok((await txt(p, '.as-facts')).includes('2 upkeep items marked done'));
  await p.screenshot({ path: D + 'astro.png' });

  // ---- the Log: locked until its PIN, then counts only, never kept
  await p.click('.as-rowlab[data-asrow="log"]');
  assert.ok((await txt(p, '.as-lock')).includes('only how many'));
  await p.click('[data-as="unlock"]');
  await p.waitForSelector('[data-lpin="1"]', { timeout: 5000 });
  for (const d of '135790') await p.click('[data-lpin="' + d + '"]');
  await p.waitForSelector('#asChart', { timeout: 8000 });
  const logT = await txt(p, '.as-tile[data-asrow="log"]');
  assert.ok(/^LOG DAYS \d+ COUNTS ONLY$/.test(logT) && !logT.includes(' 0 '), logT);
  assert.ok((await txt(p, '.as-panel >> nth=1')).includes('SECTOR · LOG'));
  assert.ok(!(await p.evaluate(() => localStorage.getItem('tos.astro.v1'))).includes('"log"'), 'the Log days are not stored');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await p.click('.as-rowlab[data-asrow="log"]');
  assert.ok((await txt(p, '.as-tile[data-asrow="log"]')).includes('LOCKED'), 'put away: forgotten');

  // ---- the Ship's Year: counts only, never the Log, tarot only with its switch
  await p.click('.as-fold');
  await p.waitForSelector('.as-ship[aria-busy="true"]');
  await p.waitForSelector('#asPaper', { timeout: 10000 });
  await p.dispatchEvent('#asPaper', 'pointerdown');
  await p.waitForTimeout(200);
  assert.ok((await txt(p, '#asPaper')).startsWith('Captain, the year so far. THE YEAR. Thirteen tasks closed'), await txt(p, '#asPaper'));
  let st = await stats();
  assert.ok(st.ctx.startsWith("SHIP'S YEAR 2026: the year so far, day 296 of 365") && st.ctx.includes('TASKS DONE: 13') && st.ctx.includes('WEEKLY REVIEWS: 4 of 9'), st.ctx);
  assert.ok(!/\bLOG\b|days written|journal/i.test(st.ctx), 'never the Log');
  assert.ok(!st.ctx.includes('TAROT') && !st.ctx.includes('APIARY') && !st.ctx.includes('REPLICATOR'), 'tarot, the apiary and money stay out without their switches');
  assert.ok(st.ask.startsWith("Write the Ship's Year"));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.shipyear.v1')));
  assert.ok(saved['2026'] && saved['2026'].paras.length === 3 && saved['2026'].final === false);
  // read aloud: no AI voice here, so Moira, paragraph by paragraph
  await p.click('[data-ship="say"]');
  const said = await p.evaluate(() => window.__said.map(u => u.voice && u.voice.name));
  assert.ok(said.length === 4 && said.every(n => n === 'Moira'), said.join(','));
  await p.click('[data-ship="say"]');
  // tarot shared with ASK: now it's in
  await p.evaluate(() => localStorage.setItem('tos.aitarot.v1', 'true'));
  await p.click('[data-ship="now"]');
  await until(async () => (await stats()).n === st.n + 1);
  assert.ok(/TAROT: \d+ readings/.test((await stats()).ctx));   /* earlier tests in the lane add readings */
  await p.waitForSelector('#asPaper');
  // folded, then opened again
  await p.click('[data-ship="fold"]'); assert.ok((await txt(p, '.as-fold')).includes('Captain, the year so far.'));
  await p.click('.as-fold'); await p.waitForSelector('#asPaper');

  // ---- the pager steps a year; THIS YEAR comes back
  await p.click('#prevBtn'); await p.waitForTimeout(300);
  assert.strictEqual(await txt(p, '#title'), '2025');
  assert.strictEqual(await txt(p, '#eyebrow'), 'ASTROMETRICS · THE YEAR IN FULL');
  assert.ok(await p.isVisible('#todayBtn')); assert.strictEqual(await txt(p, '#todayBtn'), 'THIS YEAR');
  await until(async () => (await stats()).years.some(y => y[0] === '2025-01-01T06:00:00.000Z'));
  await p.click('#todayBtn'); await p.waitForTimeout(300);
  assert.strictEqual(await txt(p, '#title'), '2026 · DAY 296');
  assert.ok(await p.$eval('#nextBtn', e => e.disabled), 'no years ahead');

  // ---- COMPUTER finds it
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'year');
  const found = await txt(p, '#cmdList');
  assert.ok(found.includes('ASTROMETRICS') && found.includes("Compile the Ship's Year"), found);
  await p.keyboard.press('Escape');
  errs.push(...p.errs); await p.context().close();

  // ---- 31 December after 06:00: the whole year, on its own, wherever the app is open
  const n0 = (await stats()).n;
  p = await open(b, '2026-12-31T06:30:00-06:00', 'bridge');
  await until(async () => (await stats()).n === n0 + 1, 40000);
  st = await stats();
  assert.ok(st.ctx.startsWith("SHIP'S YEAR 2026: the whole year"), st.ctx.slice(0, 80));
  await until(() => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('tos.shipyear.v1') || '{}'); return !!(s['2026'] && s['2026'].final); }));
  await p.waitForTimeout(1500);
  assert.strictEqual((await stats()).n, n0 + 1, 'once');
  await station(p);
  assert.ok((await txt(p, '.as-ship .phead')).includes('2026 · COMPILED 31 DEC'));
  errs.push(...p.errs); await p.context().close();

  await astro('cap=0&fail=0');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await astro('cap=0&fail=0').catch(() => {}); console.error(e); process.exit(1); });
