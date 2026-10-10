// Log Ask (2.15.0, bridge 1.20). Off until SHARE LOG WITH ASK in Systems. In the open LOG, ASK
// CLAUDE works on a month, that month and the one before, or a search's results (62 at most):
// a preset or your own question, PREVIEW (count, dates, cost; nothing sent), SEND, dates in the
// answer open the entry, follow-ups on the same entries, SAVE TO NOTION and SAVED INSIGHTS. It all
// goes when the log locks. REVIEW's WRITE SUMMARY asks for the authorization code first and then
// includes that week's entries; WITHOUT THE LOG works as before. All entries are invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8103/x/exec?key=' + K + '&action=';
const call = async q => (await (await fetch(M + q)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
async function unlock(p) { await p.keyboard.type('o1701'); await p.waitForSelector('#clFind', { timeout: 5000 }); }

(async () => {
  await call('pincode'); await call('idxhold&n=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-10T20:30:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);

  // ---- off by default: no ASK CLAUDE in the LOG
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(300); await unlock(p);
  assert.strictEqual(await p.locator('[data-lact="aiopen"]').count(), 0, 'off until turned on');
  await p.click('[data-lact="lock"]');
  await p.click('#status'); await p.waitForTimeout(500);
  const sys = await txt(p, 'section:has(.phead:has-text("CAPTAIN\'S LOG"))');
  assert.ok(sys.includes('ASK CLAUDE AND THE LOG') && sys.includes('Off: Claude never reads your log.'));
  await p.click('[data-logai="1"]');
  assert.ok((await txt(p, 'section:has(.phead:has-text("CAPTAIN\'S LOG"))')).includes('62 at most'));

  // ---- a month: preset, preview (nothing sent), send
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(300); await unlock(p);
  await p.click('[data-lmon="-1"]'); await p.waitForTimeout(200);
  await p.click('[data-lact="aiopen"]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '.cl-page .phead')).includes('ASK THE LOG SEPTEMBER 2026'));
  await p.click('[data-lapreset="moments"]');
  assert.ok((await p.inputValue('#laQ')).startsWith('What were the key moments'));
  await p.click('[data-lact="aipreview"]'); await p.waitForSelector('.la-pv', { timeout: 5000 });
  const pv = await txt(p, '.la-pv');
  console.log('preview:', pv);
  assert.ok(pv.startsWith('2 ENTRIES · WED 02 SEP 2026 TO MON 14 SEP 2026') && /about \d+(\.\d)?¢ with Sonnet · THINK HARDER about/.test(pv) && pv.includes('Nothing is kept unless you tap SAVE'));
  assert.strictEqual((await call('stats')).logasks.length, 0, 'a preview sends nothing to Claude');
  await p.screenshot({ path: D + 'logask-preview.png' });
  await p.click('[data-lact="aisend"]'); await p.waitForSelector('.la-msg.a .la-meta', { timeout: 8000 });
  let st = await call('stats');
  assert.deepStrictEqual([st.logasks[0].mode, st.logasks[0].count, st.logasks[0].turns, st.logasks[0].scope], ['fast', 2, 1, { from: '2026-09-01', to: '2026-09-30' }]);
  assert.strictEqual(await p.locator('.la-msg.a .la-date').count(), 2, 'dates become links');
  assert.ok((await txt(p, '.la-meta')).startsWith('SONNET · 1.2¢'));
  await p.screenshot({ path: D + 'logask-answer.png' });

  // ---- follow-up on the same entries
  await p.fill('#laF', 'Which stood out most?'); await p.click('[data-lact="aifollow"]');
  await p.waitForFunction(() => document.querySelectorAll('.la-msg.a .la-meta').length === 2, null, { timeout: 8000 });
  st = await call('stats'); assert.strictEqual(st.logasks[1].turns, 3, 'the conversation goes along');

  // ---- SAVE TO NOTION
  await p.click('[data-lasave="1"]'); await p.waitForTimeout(800);
  st = await call('stats');
  assert.strictEqual(st.insights[0][0], 'Insight · September 2026 · Key moments');
  assert.ok(st.insights[0][1].includes('Question: What were the key moments'));
  assert.ok((await txt(p, '[data-lasave="1"]')).includes('SAVED'));

  // ---- a date in the answer opens the entry; back to the answer
  await p.locator('.la-date').first().click(); await p.waitForTimeout(600);
  assert.ok((await p.inputValue('#clText-2026-09-02')).startsWith('First homework night'));
  await p.click('[data-lact="aiback"]'); await p.waitForTimeout(200);
  assert.strictEqual(await p.locator('.la-msg.a').count(), 2, 'the conversation is still there');

  // ---- SAVED INSIGHTS
  await p.click('[data-lact="aiinsights"]'); await p.waitForSelector('.la-in', { timeout: 5000 });
  await p.locator('.la-in').first().click(); await p.waitForSelector('.la-saved', { timeout: 5000 });
  assert.ok((await txt(p, '.la-saved')).includes('• a moment'));
  await p.click('[data-lact="aiopenback"]');

  // ---- two months; then a search's results
  await p.click('[data-lascope="two"]');
  assert.ok((await txt(p, '.cl-page .phead')).includes('AUG + SEP 2026') && await p.locator('.la-msg').count() === 0, 'a new scope starts fresh');
  await p.fill('#clFind', 'homework'); await p.press('#clFind', 'Enter'); await p.waitForSelector('.cl-hit', { timeout: 5000 });
  await p.click('[data-lact="aisearch"]');
  assert.ok((await txt(p, '.cl-page .phead')).includes('“homework” · 4 ENTRIES'));
  await p.click('[data-lapreset="themes"]'); await p.click('[data-lact="aipreview"]'); await p.waitForSelector('.la-pv');
  assert.ok((await txt(p, '.la-pv')).startsWith('4 ENTRIES'));
  await p.click('[data-lact="aisend"]'); await p.waitForSelector('.la-msg.a .la-meta', { timeout: 8000 });
  st = await call('stats'); assert.deepStrictEqual(st.logasks[2].scope.dates.sort(), ['2024-03-11', '2025-12-04', '2026-09-02', '2026-09-14']);

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll');
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(200);

  // ---- locking forgets it all; nothing on the iPad
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(300); await unlock(p);
  assert.strictEqual(await p.locator('.la-msg').count(), 0);
  const ls = await p.evaluate(() => JSON.stringify(localStorage));
  assert.ok(!ls.includes('a moment') && !ls.includes('stood out'), 'answers are never stored on the iPad');
  await p.click('[data-lact="lock"]');

  // ---- REVIEW: the code first, then the week's entries go with the summary
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  await p.locator('.rl-card[data-rweek]').first().click(); await p.waitForSelector('[data-act="writesummary"]', { timeout: 5000 });
  await p.click('[data-act="writesummary"]'); await p.waitForSelector('.lsum-sheet', { timeout: 3000 });
  assert.ok((await txt(p, '#detailSheet')).includes("lets the summary read this week's Captain's Log entries"));
  await p.click('[data-spin="BETA"]'); for (const k of '1701') await p.click('[data-spin="' + k + '"]'); await p.waitForTimeout(900);
  assert.ok((await txt(p, '.lsum-sheet .cl-msg')).startsWith('Authorization not recognized'), 'a wrong code is refused');
  await p.screenshot({ path: D + 'logask-summary-code.png' });
  await p.click('[data-spin="OMEGA"]'); for (const k of '1701') await p.click('[data-spin="' + k + '"]');
  await p.waitForSelector('#detailScrim', { state: 'hidden', timeout: 8000 });
  assert.ok((await p.inputValue('#rv-summary')).startsWith('A week of homework nights'));
  st = await call('stats'); const sm = st.logasks[st.logasks.length - 1];
  assert.deepStrictEqual([sm.mode, sm.scope], ['summary', { from: '2026-10-05', to: '2026-10-11' }]);
  assert.ok(sm.context.startsWith('WEEK 41'), 'the review numbers go along');
  // WITHOUT THE LOG: the plain summary, no code
  const asks0 = st.asks.length;
  await p.click('[data-act="writesummary"]'); await p.waitForSelector('.lsum-sheet');
  await p.click('[data-act="sumplain"]'); await p.waitForTimeout(1500);
  assert.strictEqual((await call('stats')).asks.length, asks0 + 1, 'plain summary through the usual ASK');
  // switched off: straight to the plain summary
  await p.evaluate(() => localStorage.removeItem('tos.logai.v1'));
  await p.click('[data-act="writesummary"]'); await p.waitForTimeout(1500);
  assert.ok(await p.isHidden('#detailScrim'), 'no code asked when the log is not shared');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
