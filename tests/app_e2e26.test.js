// LOG search (2.11.0, bridge 1.16). Unlocking the log tops up the search copy of older entries
// with visible progress; SEARCH THE LOG finds every entry using a word (exact word by default,
// any capitals), newest first and grouped by year, with the words highlighted; an entry opened
// from the results has RESULTS, NEWER and OLDER; EXACT WORD off widens it; locking forgets it all.
// All entries are invented sample text.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8103/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const dates = p => p.$$eval('.cl-hit', bs => bs.map(b => b.dataset.lfound));
async function unlock(p) { for (const k of '135790') await p.click('[data-lpin="' + k + '"]'); await p.waitForSelector('#clFind', { timeout: 5000 }); }

(async () => {
  await fetch('http://127.0.0.1:8103/x/exec?action=idxhold&key=' + K);
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-08T20:30:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);
  await unlock(p);

  // ---- older entries become searchable while the log is open, with progress
  await p.waitForSelector('.cl-idxbar', { timeout: 4000 });
  console.log('index:', await txt(p, '#clIdx'));
  assert.ok((await txt(p, '#clIdx')).includes('Making older entries searchable'));
  await p.waitForFunction(() => document.getElementById('clIdx').textContent.includes('Every entry is searchable now'), null, { timeout: 15000 });
  assert.deepStrictEqual((await stats()).unindexed, []);

  // ---- search: exact word, any capitals, newest first, grouped by year
  await p.fill('#clFind', 'homework'); await p.press('#clFind', 'Enter');
  await p.waitForSelector('.cl-hit', { timeout: 5000 });
  assert.deepStrictEqual(await dates(p), ['2026-09-14', '2026-09-02', '2025-12-04', '2024-03-11'], 'Homeworks is not the word');
  const head = await txt(p, '.cl-page .phead');
  console.log('head:', head);
  assert.ok(head.includes('4 ENTRIES · 5 MENTIONS'));
  assert.deepStrictEqual(await p.$$eval('.cl-hy', h => h.map(x => x.textContent)), ['2026 · 2 ENTRIES', '2025 · 1 ENTRY', '2024 · 1 ENTRY']);
  assert.strictEqual(await txt(p, '[data-lfound="2026-09-02"] .cl-hitn'), '2×');
  assert.deepStrictEqual(await p.$$eval('[data-lfound="2026-09-14"] mark', m => m.map(x => x.textContent)), ['Homework']);
  assert.ok((await stats()).logvia.includes('GET logsearch'), 'search travels as a read');
  await p.screenshot({ path: D + 'log-search.png' });

  // ---- open one: the entry, with RESULTS, NEWER, OLDER and where the word is
  await p.click('[data-lfound="2026-09-02"]'); await p.waitForTimeout(700);
  assert.ok((await p.inputValue('#clText-2026-09-02')).startsWith('First homework night'));
  const bar = await txt(p, '.cl-findbar');
  console.log('bar:', bar);
  assert.ok(bar.includes('“homework” · 2 OF 4') && bar.includes('NEWER') && bar.includes('OLDER'));
  assert.strictEqual(await p.locator('.cl-findbar mark').count(), 2, 'both places it appears');
  await p.screenshot({ path: D + 'log-search-entry.png' });
  await p.click('[data-lact="findstep"][data-dir="-1"]'); await p.waitForTimeout(600);
  assert.ok((await txt(p, '.cl-findbar')).includes('1 OF 4') && await p.isDisabled('[data-lact="findstep"][data-dir="-1"]'));
  await p.click('[data-lact="findstep"][data-dir="1"]'); await p.click('[data-lact="findstep"][data-dir="1"]'); await p.click('[data-lact="findstep"][data-dir="1"]'); await p.waitForTimeout(700);
  assert.ok((await txt(p, '.cl-findbar')).includes('4 OF 4'));
  assert.ok((await txt(p, '.cl-mon')).includes('MARCH 2024'), 'the calendar follows');
  // a calendar day that isn't a match: no bar
  await p.click('[data-lact="findback"]'); await p.waitForTimeout(300);
  assert.ok(await p.locator('.cl-hit.cur[data-lfound="2024-03-11"]').count() === 1, 'back at the list, on the one you were reading');

  // ---- EXACT WORD off: part words too
  await p.click('[data-lact="findwhole"]'); await p.waitForSelector('.cl-hit', { timeout: 5000 }); await p.waitForTimeout(300);
  assert.ok((await dates(p)).includes('2025-11-20'), 'Homeworks now');
  assert.ok((await txt(p, '.cl-fq')).includes('part words too'));
  await p.click('[data-lact="findwhole"]'); await p.waitForTimeout(800);

  // ---- nothing found
  await p.fill('#clFind', 'ted lasso'); await p.click('[data-lact="find"]'); await p.waitForTimeout(800);
  const none = await txt(p, '.cl-page');
  assert.ok(none.includes('No entries use the word “ted lasso”') && none.includes('EXACT WORD is on'), none);
  await p.fill('#clFind', 'a'); await p.click('[data-lact="find"]'); await p.waitForTimeout(200);
  assert.ok((await p.textContent('#toast')).includes('at least two letters'));

  // ---- CLOSE SEARCH, then LOCK forgets everything
  await p.click('[data-lact="findclose"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.cl-hit').count(), 0); assert.ok(await p.isVisible('.cl-text'));
  await p.fill('#clFind', 'homework'); await p.press('#clFind', 'Enter'); await p.waitForSelector('.cl-hit');
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('#clFind').count(), 0);
  const ls = await p.evaluate(() => JSON.stringify(localStorage));
  assert.ok(!ls.includes('homework') && !ls.includes('long division'), 'nothing searched or found is kept on the iPad');
  await unlock(p);
  assert.strictEqual(await p.inputValue('#clFind'), ''); assert.strictEqual(await p.locator('.cl-hit').count(), 0);

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.fill('#clFind', 'homework'); await p.press('#clFind', 'Enter'); await p.waitForSelector('.cl-hit'); await p.waitForTimeout(600);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll');
  await p.screenshot({ path: D + 'log-search-phone.png' });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
