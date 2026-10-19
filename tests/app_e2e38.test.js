// TAROT (2.26, bridge 1.24; simulated on :8105, readings dated relative to today, all invented):
// the week's card on the Bridge, the TAROT front page (week's card with its note and your meaning,
// recent readings, patterns), a new Celtic Cross recorded card by card and finished by DRAW HERE,
// notes saved to Notion after typing stops, a card's history and MY MEANING, delete (two taps),
// a spread of your own, a one-card reading saved as the week's card, the Review's TAROT section,
// Systems' TAROT row and SHARE WITH ASK (off: nothing sent; on: the week's card goes with a question),
// phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), B = 'http://127.0.0.1:8105';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const stats = () => fetch(B + '/macros/s/test/exec?key=' + K + '&action=stats').then(r => r.json());
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'review', 'log', 'habits', 'tarot']));
  }, K);
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile[data-tropen]', { timeout: 10000 });

  // ---- the Bridge: this week's card, with your meaning and the week's note
  const tile = await txt(p, '[data-panel="tarot"]');
  assert.ok(tile.includes('TAROT · THIS WEEK') && tile.includes('EIGHT OF PENTACLES') && tile.includes('Practice. The small reps.') && tile.includes('Slow work, steady hands.'), tile);
  await p.screenshot({ path: D + 'tarot-bridge.png' });
  await p.click('[data-panel="tarot"] .tr-tile'); await p.waitForSelector('.tr-pos');
  assert.strictEqual(await txt(p, '#title'), 'TAROT');
  await p.click('[data-trgo="home"]'); await p.waitForSelector('.tr-week');

  // ---- the front page
  const wk = await txt(p, '.tr-week');
  assert.ok(wk.includes('EIGHT OF PENTACLES') && wk.includes('Mine: Practice. The small reps.') && wk.includes('MOMENTUM, PRACTICE'), wk);
  assert.strictEqual(await p.inputValue('#trWkSum'), 'Slow work, steady hands.');
  assert.ok((await txt(p, '.tr-list')).includes('Sample question about the garden'));
  const pat = await txt(p, '.tr-pat');
  assert.ok(pat.includes('CARDS DRAWN') && pat.includes('KEEPS COMING BACK') && pat.includes('2 TIMES'), pat);
  assert.strictEqual(await p.locator('.tr-strip > button').count(), 2, 'two earlier weekly cards in the strip');
  await p.screenshot({ path: D + 'tarot-home.png', fullPage: true });
  // the week's note: saved to Notion once typing stops
  await p.fill('#trWkSum', 'Slow work, steady hands. Keep going.');
  await until(async () => { const s = await stats(); const l = s.tsaves[s.tsaves.length - 1]; return l && l.id === 'tr-w0' && l.sum === 'Slow work, steady hands. Keep going.'; });

  // ---- a new Celtic Cross: two cards by hand (the picker moves on by itself), the rest drawn here
  await p.click('[data-trgo="new"]'); await p.waitForSelector('.tr-spreads');
  await p.click('[data-trspread="celtic"]');
  assert.strictEqual(await p.locator('.tr-slot').count(), 10);
  await p.fill('#trQ', 'Sample question for the season');
  await p.click('[data-trslot="0"]', { position: { x: 20, y: 12 } }); await p.waitForSelector('.tr-pick');
  await p.click('[data-trpick="M3"]'); await p.waitForTimeout(500);
  assert.ok((await txt(p, '#detailSheet .sbar')).startsWith('2 · CHALLENGE'), 'next position offered');
  await p.click('[data-trtab="swords"]'); await p.check('#trRev');
  await p.click('[data-trpick="S5"]'); await p.waitForTimeout(500);
  await p.click('#detailClose'); await p.waitForTimeout(300);
  assert.ok(await p.isDisabled('[data-tract="save"]'), 'not until every position has a card');
  await p.click('[data-tract="draw"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: D + 'tarot-new.png' });
  await p.click('[data-tract="save"]'); await p.waitForSelector('.tr-pos');
  let s = await until(async () => { const x = await stats(); const l = x.tsaves[x.tsaves.length - 1]; return l && l.cid && l.cards.length === 10 ? x : null; });
  let saved = s.tsaves[s.tsaves.length - 1];
  assert.strictEqual(saved.q, 'Sample question for the season');
  assert.deepStrictEqual(saved.cards.slice(0, 2), [{ id: 'M3', rev: false }, { id: 'S5', rev: true }]);
  assert.strictEqual(new Set(saved.cards.map(c => c.id)).size, 10, 'no card twice');
  assert.deepStrictEqual([saved.pos[1].l, saved.pos[1].c, saved.pos[9].l], ['CHALLENGE', 1, 'OUTCOME']);
  assert.strictEqual(await p.locator('.tr-pr').count(), 10);
  assert.ok((await txt(p, '.tr-pr:nth-child(2)')).includes('FIVE OF SWORDS · REVERSED'));
  await p.screenshot({ path: D + 'tarot-reading.png', fullPage: true });
  // a note on a position: goes with the real page id once Notion has it
  await p.waitForTimeout(800);
  await p.fill('[data-trnote="0"]', 'Growth with care.');
  s = await until(async () => { const x = await stats(); const l = x.tsaves[x.tsaves.length - 1]; return l && l.notes && l.notes[0] === 'Growth with care.' ? x : null; });
  saved = s.tsaves[s.tsaves.length - 1];
  assert.ok(saved.id && !saved.cid, 'edits go to the saved page: ' + JSON.stringify([saved.id, saved.cid]));
  // text boxes grow with their text (2.26.1): all of it visible, no inner scrolling
  const box = sel => p.$eval(sel, el => ({ h: el.offsetHeight, sh: el.scrollHeight, ch: el.clientHeight }));
  const g0 = await box('#trSum');
  await p.fill('#trSum', Array.from({ length: 12 }, (_, i) => 'Line ' + (i + 1) + ' of the reading as a whole.').join('\n'));
  await p.waitForTimeout(100);
  const g1 = await box('#trSum');
  assert.ok(g1.h > g0.h + 120 && g1.sh <= g1.ch + 2, 'grew to fit: ' + JSON.stringify([g0, g1]));
  await p.fill('#trSum', 'Short again.'); await p.waitForTimeout(100);
  assert.ok((await box('#trSum')).h < g1.h - 100, 'and shrinks back');

  // ---- a card's history and MY MEANING
  await p.click('.tr-pr:nth-child(1) .tr-link'); await p.waitForSelector('.tr-hist');
  assert.ok((await txt(p, '#detailSheet')).includes('THE EMPRESS') && (await txt(p, '.tr-hrows')).includes('Sample question for the season'));
  await p.fill('#trMean', 'Tending, not forcing.\nA second line.\nA third.\nA fourth.\nA fifth.\nA sixth.');
  await p.waitForTimeout(100);
  const gm = await p.$eval('#trMean', el => [el.scrollHeight, el.clientHeight]);
  assert.ok(gm[0] <= gm[1] + 2, 'a box in a sheet grows too: ' + gm);
  await p.fill('#trMean', 'Tending, not forcing.');
  await until(async () => (await stats()).tmean.M3 === 'Tending, not forcing.');
  await p.click('#detailClose'); await p.waitForTimeout(300);

  // ---- delete (two taps): to Notion's trash
  const rid = saved.id;
  await p.click('[data-trdel]'); assert.strictEqual(await txt(p, '[data-trdel]'), 'TAP AGAIN TO DELETE');
  await p.click('[data-trdel]'); await p.waitForSelector('.tr-week');
  await until(async () => !(await stats()).tarot.some(r => r.id === rid));

  // ---- a spread of your own
  await p.click('[data-trgo="builder"]'); await p.waitForSelector('.tr-grid');
  await p.fill('#trBName', 'Week ahead');
  for (const c of ['0,0', '1,0', '1,1']) await p.click('[data-trcell="' + c + '"]');
  await p.fill('[data-trplabel="0"]', 'Work'); await p.fill('[data-trplabel="1"]', 'Home');
  await p.click('[data-trpcross="2"]');
  await p.click('[data-tract="bsave"]');
  s = await until(async () => { const x = await stats(); return x.tspreads.length ? x : null; });
  assert.deepStrictEqual(s.tspreads[0].pos.map(q => [q.l, q.c]), [['WORK', 0], ['HOME', 0], ['CARD 3', 1]]);
  await p.click('[data-trgo="home"]'); await p.click('[data-trgo="new"]'); await p.waitForSelector('.tr-spreads');
  await until(async () => (await txt(p, '.tr-spreads')).includes('WEEK AHEAD'));

  // ---- one card as the week's card: replaces the earlier one this week
  await p.click('[data-trspread="one"]'); await p.check('#trWk');
  await p.click('[data-trslot="0"]'); await p.waitForSelector('.tr-pick');
  await p.click('[data-trtab="major"]'); await p.click('[data-trpick="M9"]'); await p.waitForTimeout(400);
  await p.click('[data-tract="save"]'); await p.waitForSelector('.tr-pos');
  s = await until(async () => { const x = await stats(); return x.tarot.some(r => r.weekly && r.cards[0].id === 'M9') ? x : null; });
  assert.ok(!s.tarot.find(r => r.id === 'tr-w0').weekly, 'the earlier card this week is unmarked');
  await p.click('[data-trgo="home"]'); await p.waitForTimeout(800);
  assert.ok((await txt(p, '.tr-week')).includes('THE HERMIT'));

  // ---- Review: the week's card and readings
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(300);
  const mon = await p.evaluate(() => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  await p.click('[data-rweek="' + mon + '"]'); await p.waitForTimeout(800);
  const rv = await txt(p, '#content');
  assert.ok(/TAROT/.test(rv) && rv.includes('THE HERMIT'), 'review shows the week\'s card');

  // ---- Systems: the row, and Ask off then on
  await p.click('#status'); await p.waitForSelector('[data-aitarot]');
  const sysT = await txt(p, 'section:has([data-aitarot])'); assert.ok(sysT.includes('OK') && sysT.includes('🔮 Tarot'), sysT);
  await p.click('#askBtn');
  await p.fill('#askText', Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n')); await p.waitForTimeout(100);
  const ga = await p.$eval('#askText', el => [el.offsetHeight, innerHeight * 0.4 + 1, getComputedStyle(el).overflowY]);
  assert.ok(ga[0] <= ga[1] && ga[2] === 'auto', 'Ask stops at its cap and scrolls inside: ' + ga);
  await p.fill('#askText', 'Anything for today?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  s = await stats(); assert.ok(!s.asks[s.asks.length - 1].ctx.includes('TAROT'), 'off: readings never sent');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('[data-aitarot="1"]');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.aitarot.v1')), 'true');
  await p.click('#askBtn'); await p.fill('#askText', 'And with the cards?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  s = await stats(); const actx = s.asks[s.asks.length - 1].ctx;
  assert.ok(actx.includes("TAROT (his readings, shared by Timothy's choice)") && actx.includes("This week's card: The Hermit") && actx.includes('Sample question about the garden'), actx.slice(actx.indexOf('TAROT')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // switched off again: the very next question goes without them
  await p.click('[data-aitarot="0"]');
  await p.click('#askBtn'); await p.fill('#askText', 'One more?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  s = await stats(); assert.ok(!s.asks[s.asks.length - 1].ctx.includes('TAROT'), 'off again: not sent');
  await p.keyboard.press('Escape');

  // ---- phone width: nothing spills sideways
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('[data-screen="tarot"].nav'); await p.waitForTimeout(400);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  await p.screenshot({ path: D + 'tarot-phone.png' });

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
