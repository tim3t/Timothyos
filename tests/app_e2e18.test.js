// Review log: REVIEW opens on a landing page (up next, trends from saved reviews,
// every week by month). A week opens the Review screen; ALL REVIEWS comes back.
// The Bridge reminder still goes straight to the week. Four questions, patterns,
// older bridges, phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8098/x/exec?action=stats&key=' + K)).json());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));   // Tuesday: last week is due
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.ignore.v1', JSON.stringify(['away block'])); }, conn(port));

  // --- bridge 1.6: the log works, trends wait for 1.7
  await setup(8097); await p.reload(); await p.waitForTimeout(1800);
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  assert.strictEqual(await p.textContent('#title'), 'WEEKLY REVIEWS');
  assert.ok((await p.textContent('#content')).includes('need bridge 1.7'));
  assert.strictEqual(await p.locator('.rl-row').count(), 2, 'this week and last week listed');

  // --- bridge 1.7
  await setup(8098); await p.reload(); await p.waitForTimeout(2000);
  // the Bridge reminder goes straight to the week
  await p.click('.ov-alert:has-text("Weekly review due")'); await p.waitForTimeout(1000);
  assert.strictEqual(await p.textContent('#title'), '28 SEP TO 04 OCT');
  assert.ok(await p.isVisible('#logBtn'), 'ALL REVIEWS beside the arrows');
  assert.strictEqual(await p.textContent('#eyebrow'), 'WEEK 40 · LAST WEEK');
  assert.ok(await p.isHidden('#todayBtn'), 'ALL REVIEWS takes the place of THIS WEEK');
  // on Timothy's iPad width the header stays one line, so the sidebar matches every other screen
  const dims = () => p.evaluate(() => [document.querySelector('.top').getBoundingClientRect().height, document.querySelector('#allBtn').getBoundingClientRect().height]);
  const hr = await dims();
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(300);
  const hw = await dims();
  console.log('header + ALL STATIONS, review week vs Week screen:', hr, hw);
  assert.deepStrictEqual(hr, hw, 'sidebar identical to other screens');
  // narrower (Split View): the header may wrap, but the left bar never collapses to a sliver
  await p.click('.elbow'); await p.waitForTimeout(300); await p.click('.ov-alert:has-text("Weekly review due")'); await p.waitForTimeout(800);
  await p.setViewportSize({ width: 1000, height: 695 }); await p.waitForTimeout(200);
  const narrow = await dims(); console.log('narrow header + fill:', narrow);
  assert.ok(narrow[1] >= 40, 'fill keeps its size');
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click('.elbow'); await p.waitForTimeout(300); await p.click('.ov-alert:has-text("Weekly review due")'); await p.waitForTimeout(800);
  await p.click('#logBtn'); await p.waitForTimeout(1200);
  console.log('header:', await p.textContent('#eyebrow'), '|', await p.textContent('#title'));
  assert.strictEqual(await p.textContent('#title'), 'WEEKLY REVIEWS');
  assert.strictEqual(await p.textContent('#eyebrow'), 'REVIEW · 4 SAVED');
  assert.ok(await p.isHidden('#pager'), 'no arrows on the log');
  assert.strictEqual(await p.getAttribute('[data-screen="review"].nav', 'aria-current'), 'page');

  const cards = (await p.locator('.rl-card').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  console.log('up next:', cards.join(' | '));
  assert.ok(cards[0].startsWith('WEEK 40 · 28 SEP TO 04 OCT') && cards[0].includes('REVIEW NOW'));
  assert.ok(cards[1].startsWith('WEEK 41 · 05 TO 11 OCT') && cards[1].includes('IN PROGRESS'));

  const st = (await p.locator('.rl-stat').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  console.log('stats:', st.join(' | '));
  assert.deepStrictEqual(st, ['4/5 REVIEWS SAVED', '3 WEEK STREAK', '66% PRIORITIES KEPT, AVG', '37H · 8H WORK · PERSONAL, AVG']);
  assert.ok((await p.textContent('.phead:has-text("TRENDS") .meta')).startsWith('LAST 7 WEEKS'));
  assert.strictEqual(await p.locator('.rl-svg .b-work').count(), 4, 'one bar per saved week');
  assert.strictEqual(await p.locator('.rl-svg .gap').count(), 3, 'unsaved weeks drawn as gaps');
  assert.ok(await p.isHidden('.rl-chart:has-text("PRIORITIES KEPT")'), 'more charts behind +');

  // tap a bar for its values
  await p.locator('.rl-chart.wide .hit').nth(2).click(); await p.waitForTimeout(200);
  console.log('tip:', await p.innerText('.rl-tip'));
  assert.ok((await p.innerText('.rl-tip')).replace(/\s+/g, ' ') === 'WEEK 37 Work 38h · Personal 10h · 48h total');

  await p.click('[data-more="rtrends"]'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('.rl-chart:has-text("PRIORITIES KEPT")'));
  assert.strictEqual(await p.locator('.rl-svg .dot').count(), 4);
  const areas = (await p.locator('.rl-arow').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  console.log('areas:', areas.join(' | '));
  assert.ok(areas[0].includes('13') && areas[1].includes('8'), 'tasks by Life Area summed across reviews');
  await p.screenshot({ path: D + 'review-log-ipad.png', fullPage: true });

  // the list, by month
  const months = await p.locator('.rl-mlabel').allTextContents();
  assert.deepStrictEqual(months, ['OCTOBER 2026', 'SEPTEMBER 2026', 'AUGUST 2026']);
  const rows = (await p.locator('.rl-row').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  console.log('rows:\n   ' + rows.join('\n   '));
  assert.strictEqual(rows.length, 7);
  assert.ok(rows[2].includes('WORK 36H · PERSONAL 8H · 7 FINISHED · 4/5 PICKS KEPT') && rows[2].includes('NEXT FOCUS Hive winter prep') && rows[2].includes('SAVED'));
  assert.ok(rows[5].startsWith('WEEK 36') && rows[5].includes('NOT SAVED'));
  const emoji = await p.evaluate(() => (document.body.innerText.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).join(''));
  assert.strictEqual(emoji, '', 'no emoji on the log');

  // patterns: Sonnet reads the saved reflections; the answer stays after a reload
  await p.click('[data-act="patterns"]'); await p.waitForTimeout(1200);
  let s = await stats(), a = s.asks[s.asks.length - 1];
  assert.strictEqual(a.mode, 'patterns');
  assert.ok(a.ctx.includes('What drained me: Evening calls') && a.ctx.includes('Where I held my bearing: Kept mornings for deep work'));
  assert.strictEqual(await p.locator('.rl-patout li').count(), 3);
  const asks = s.asks.length;
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  assert.strictEqual(await p.locator('.rl-patout li').count(), 3, 'kept on the iPad');
  assert.strictEqual((await stats()).asks.length, asks, 'not asked again');

  // a saved week: the four questions, arrows, back to the log
  await p.click('.rl-row:has-text("WEEK 39")'); await p.waitForTimeout(1500);
  assert.strictEqual(await p.textContent('#title'), '21 TO 27 SEP');
  assert.ok((await p.textContent('#eyebrow')).includes('SAVED'));
  const qs = await p.locator('label[for^="rv-"]').allTextContents();
  console.log('questions:', qs.join(' | '));
  assert.deepStrictEqual(qs.slice(0, 4), ['1 · WHAT WENT WELL?', '2 · WHAT DRAINED ME?', "3 · WHAT'S MY NEXT FOCUS?", '4 · WHERE DID I HOLD MY BEARING?']);
  assert.ok(!(await p.textContent('#content')).includes('optional'));
  assert.strictEqual(await p.inputValue('#rv-bearing'), 'Kept mornings for deep work');
  await p.click('#prevBtn'); await p.waitForTimeout(800);
  assert.strictEqual(await p.textContent('#title'), '14 TO 20 SEP');
  await p.click('#logBtn'); await p.waitForTimeout(500);
  assert.strictEqual(await p.textContent('#title'), 'WEEKLY REVIEWS');

  // write and save the due week; the log updates
  await p.click('.rl-card.due'); await p.waitForTimeout(1500);
  await p.fill('#rv-wentWell', 'Quiet, steady week'); await p.fill('#rv-drained', 'Late email'); await p.fill('#rv-nextFocus', 'Garlic beds'); await p.fill('#rv-bearing', 'Mornings again');
  await p.click('[data-act="savereview"]'); await p.waitForTimeout(1200);
  s = await stats(); assert.strictEqual(s.reviews['2026-09-28'].bearing, 'Mornings again');
  await p.click('#logBtn'); await p.waitForTimeout(800);
  assert.strictEqual(await p.locator('.rl-card.due').count(), 0, 'nothing due once saved');
  assert.strictEqual(await p.textContent('#eyebrow'), 'REVIEW · 5 SAVED');
  const st2 = (await p.locator('.rl-stat').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  assert.strictEqual(st2[1], '4 WEEK STREAK');
  assert.ok((await p.innerText('.rl-row:has-text("WEEK 40")')).includes('NEXT FOCUS Garlic beds'));

  // phone width
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('[data-screen="review"].nav'); await p.waitForTimeout(500);
  await p.screenshot({ path: D + 'review-log-phone.png', fullPage: true });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll on a phone');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
