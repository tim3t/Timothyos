// TAROT BOOKS (2.29, bridge 1.25; simulated on :8105 after e2e38, placeholder passages only): Systems' 📖 Tarot Books
// row and IMPORT BOOKS in steps; a closed BOOKS chip under each card that opens a drawer with both books (Dean's
// reversed meaning first for a reversed card); SUGGEST A MEANING HERE sends the reading around the card and shows the
// answer as NOT SAVED until ADD or DISMISS; ADD saves into the note like typing; SUGGEST A READING FROM MY BOOKS fills
// WHAT IT SAYS the same way; an error shows in place; the card's history sheet has the books without SUGGEST; book
// text is never written to the iPad's storage; phone width; an older bridge shows no BOOKS at all.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), B = 'http://127.0.0.1:8105/macros/s/test/exec?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const stats = () => fetch(B + '&action=stats').then(r => r.json());
const tb = () => fetch(B + '&action=tbstats').then(r => r.json()).then(j => j.tb);
const mode = q => fetch(B + '&action=tbmode&' + q).then(r => r.json());
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  await mode('on=1&made=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'review', 'tarot']));
  }, K);
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile', { timeout: 10000 });

  // ---- Systems: nothing imported yet, then IMPORT BOOKS runs until every page is made
  await p.click('#status'); await p.waitForSelector('[data-aitarot]');
  await until(async () => (await txt(p, 'section:has([data-aitarot])')).includes('Liz Dean 0 of 78'));
  let sys = await txt(p, 'section:has([data-aitarot])');
  assert.ok(sys.includes('📖 Tarot Books') && sys.includes('Jessa Crispin 0 of 78') && sys.includes('EMPTY') && sys.includes('IMPORT BOOKS'), sys);
  await p.click('[data-trbimport]');
  await until(async () => (await txt(p, 'section:has([data-aitarot])')).includes('156 pages in 📖 Tarot Books'));
  sys = await txt(p, 'section:has([data-aitarot])');
  assert.ok(sys.includes('Liz Dean 78 of 78') && sys.includes('Jessa Crispin 78 of 78') && !sys.includes('IMPORT BOOKS'), sys);
  assert.strictEqual((await tb()).imports, 3, 'three steps of the import');
  await p.screenshot({ path: D + 'tarotbooks-systems.png' });

  // ---- a reading: a closed BOOKS chip under each card, nothing fetched until it's opened
  await p.click('[data-screen="tarot"].nav'); await p.waitForSelector('.tr-list');
  await p.click('.tr-list [data-tropen="tr-r1"]'); await p.waitForSelector('.tr-pos');
  assert.strictEqual(await p.locator('.tr-pr .tr-bk-chip').count(), 3);
  assert.strictEqual(await p.locator('.tr-bk').count(), 0, 'closed until asked');
  assert.strictEqual((await tb()).reads.length, 0);
  // the Four of Pentacles, reversed: Dean's reversed meaning comes first
  await p.click('.tr-pr:nth-child(3) [data-trbk]');
  await p.waitForSelector('.tr-pr:nth-child(3) .tr-bk-text');
  assert.strictEqual(await txt(p, '.tr-pr:nth-child(3) [data-trbk]'), 'CLOSE BOOKS');
  assert.deepStrictEqual((await tb()).reads.map(r => r[0]), ['P4']);
  const heads = await p.$$eval('.tr-pr:nth-child(3) .tr-bk-h', n => n.map(x => x.textContent));
  assert.deepStrictEqual(heads, ['AT A GLANCE', 'REVERSED MEANING', 'UPRIGHT MEANING', 'UNDERSTANDING THE CARD']);
  assert.strictEqual(await p.getAttribute('.tr-pr:nth-child(3) [data-trbtab="dean"]', 'aria-pressed'), 'true');
  let dr = await txt(p, '.tr-pr:nth-child(3) .tr-bk');
  assert.ok(dr.includes('Sample reversed passage for P4.') && dr.includes('The Ultimate Guide to Tarot · Chapter 4, page 1') && dr.includes('OPEN IN NOTION'), dr);
  await p.click('.tr-pr:nth-child(3) [data-trbtab="crispin"]');
  dr = await txt(p, '.tr-pr:nth-child(3) .tr-bk');
  assert.ok(dr.includes('Sample creative reading of P4.') && dr.includes('The Creative Tarot · The Cards, page 2'), dr);
  await p.screenshot({ path: D + 'tarotbooks-drawer.png' });

  // ---- SUGGEST A MEANING HERE: the reading around the card goes; the answer waits, NOT SAVED
  const saves0 = (await stats()).tsaves.length;
  await p.click('.tr-pr:nth-child(3) [data-trbsug="2"]');
  await p.waitForSelector('.tr-pr:nth-child(3) .tr-sug');
  const sug = await txt(p, '.tr-pr:nth-child(3) .tr-sug');
  assert.ok(sug.includes('SUGGESTED FROM YOUR BOOKS · NOT SAVED') && sug.includes('Sample suggestion for P4.') && sug.includes('SONNET') && sug.includes('0.9¢'), sug);
  let sent = (await tb()).suggests.slice(-1)[0];
  assert.deepStrictEqual([sent.mode, sent.at, sent.q, sent.cards.length, sent.cards[2].rev, sent.cards[2].pos, sent.cards[0].note], ['card', 2, 'Sample question about the garden', 3, true, 'FUTURE', 'Fast start']);
  await p.waitForTimeout(1500);
  assert.strictEqual((await stats()).tsaves.length, saves0, 'a suggestion alone saves nothing');
  await p.screenshot({ path: D + 'tarotbooks-suggest.png' });
  // DISMISS: gone, the note untouched
  await p.click('.tr-pr:nth-child(3) [data-trbdis="2"]');
  assert.strictEqual(await p.locator('.tr-sug').count(), 0);
  assert.strictEqual(await p.inputValue('[data-trnote="2"]'), '');
  // again, then ADD TO MY NOTE: into the note and saved like typing
  await p.click('.tr-pr:nth-child(3) [data-trbsug="2"]'); await p.waitForSelector('.tr-pr:nth-child(3) .tr-sug');
  await p.click('.tr-pr:nth-child(3) [data-trbadd="2"]');
  assert.strictEqual(await p.inputValue('[data-trnote="2"]'), 'Sample suggestion for P4.\nA second line.');
  await until(async () => { const s = await stats(); const l = s.tsaves[s.tsaves.length - 1]; return l && l.id === 'tr-r1' && l.notes[2] === 'Sample suggestion for P4.\nA second line.'; });
  // a note already there: the suggestion goes after it
  await p.fill('[data-trnote="0"]', 'Fast start');
  await p.click('.tr-pr:nth-child(1) [data-trbk]'); await p.waitForSelector('.tr-pr:nth-child(1) .tr-bk-text');
  await p.click('.tr-pr:nth-child(1) [data-trbsug="0"]'); await p.waitForSelector('.tr-pr:nth-child(1) .tr-sug');
  await p.click('.tr-pr:nth-child(1) [data-trbadd="0"]');
  assert.strictEqual(await p.inputValue('[data-trnote="0"]'), 'Fast start\n\nSample suggestion for W8.\nA second line.');

  // ---- the whole reading, under WHAT IT SAYS
  const rsBtn = await txt(p, '[data-trbox="s"]');
  assert.ok(rsBtn.includes('SUGGEST A READING FROM MY BOOKS') && rsBtn.includes('all 3 cards'), rsBtn);
  await p.click('[data-trbsug="-1"]'); await p.waitForSelector('[data-trbox="s"] .tr-sug');
  sent = (await tb()).suggests.slice(-1)[0];
  assert.deepStrictEqual([sent.mode, sent.sum], ['reading', 'Momentum, then hold loosely.']);
  await p.click('[data-trbadd="-1"]');
  assert.strictEqual(await p.inputValue('[data-trsum]'), 'Momentum, then hold loosely.\n\nSample suggestion for the whole spread.\nA second line.');
  await until(async () => { const s = await stats(); const l = s.tsaves[s.tsaves.length - 1]; return l && l.sum === 'Momentum, then hold loosely.\n\nSample suggestion for the whole spread.\nA second line.'; });

  // ---- Claude busy: said in place, nothing added
  await mode('on=1&fail=ai_busy');
  await p.click('.tr-pr:nth-child(2) [data-trbk]'); await p.waitForSelector('.tr-pr:nth-child(2) .tr-bk-text');
  await p.click('.tr-pr:nth-child(2) [data-trbsug="1"]');
  await p.waitForSelector('.tr-pr:nth-child(2) .tr-bk .err');
  assert.ok((await txt(p, '.tr-pr:nth-child(2) .tr-bk .err')).includes('Claude is busy right now'));
  assert.strictEqual(await p.inputValue('[data-trnote="1"]'), '');
  await mode('on=1');

  // ---- the card's history sheet: the books are there too, without SUGGEST
  await p.click('.tr-pr:nth-child(2) [data-trhist]'); await p.waitForSelector('.tr-hist');
  await p.click('#detailSheet [data-trbk="h:M7"]'); await p.waitForSelector('#detailSheet .tr-bk-text');
  assert.strictEqual(await p.getAttribute('#detailSheet [data-trbtab="crispin"]', 'aria-pressed'), 'true', 'the book last chosen stays chosen');
  await p.click('#detailSheet [data-trbtab="dean"]');
  const hs = await txt(p, '#detailSheet .tr-bk');
  assert.ok(hs.includes('Sample upright passage for M7.') && !hs.includes('SUGGEST'), hs);
  assert.strictEqual(await txt(p, '#detailSheet [data-trbk]'), 'CLOSE BOOKS');
  await p.screenshot({ path: D + 'tarotbooks-history.png' });
  await p.click('#detailClose'); await p.waitForTimeout(300);

  // ---- the book text never lands in the iPad's storage
  const stored = await p.evaluate(() => Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'));
  assert.ok(!/Sample (upright|reversed) passage|Sample creative reading/.test(stored), 'no passages in localStorage');

  // ---- phone width: the open drawer and a suggestion stay inside the screen
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await p.click('.tr-pr:nth-child(3) [data-trbsug="2"]'); await p.waitForSelector('.tr-pr:nth-child(3) .tr-sug');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  await p.locator('.tr-pr:nth-child(3) .tr-sug').scrollIntoViewIfNeeded();
  await p.screenshot({ path: D + 'tarotbooks-phone.png' });

  // ---- an older bridge: no BOOKS anywhere
  await mode('on=0');
  await p.setViewportSize({ width: 1180, height: 900 });
  await p.evaluate(() => localStorage.removeItem('tos.cache.v1'));   // a fresh start: capabilities come from the bridge
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile', { timeout: 10000 });
  await p.click('[data-screen="tarot"].nav'); await p.waitForSelector('.tr-list');
  await p.click('.tr-list [data-tropen="tr-r1"]'); await p.waitForSelector('.tr-pos');
  assert.strictEqual(await p.locator('.tr-bk-chip, [data-trbsug]').count(), 0);
  assert.strictEqual(await p.locator('.tr-pr .tr-link').count(), 3, 'EVERY TIME THIS CARD CAME UP stays');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(async e => { await mode('on=0').catch(() => {}); console.error(e); process.exit(1); });
