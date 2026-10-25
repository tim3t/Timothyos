// COMPUTER (2.35; simulated on :8105 after the apiary tests, all data invented): the header button and ⌘K open it;
// empty, it lists what's waiting, recent stations and unpinned ones not opened lately; typing narrows stations,
// actions, books, hives, cards and settings, with arrow keys and Return; rows open the right place (ADD BOOK,
// TRUE UP STACK on the named hive, a card's history, Systems at BACKUP AND RESTORE, LOG search once unlocked);
// it never opens before the app is linked; a swipe down on the bar opens it without opening a station; visits
// are recorded; phone width fits; no emoji.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=apmode&' + q).then(r => r.json());
const open = p => p.evaluate(() => { const s = document.querySelector('#cmdScrim'); return !s.hidden && !s.classList.contains('closing'); });
const rows = p => p.$$eval('#cmdList .cmd-row', rs => rs.map(r => r.querySelector('b').textContent + ' | ' + r.querySelector('small').textContent + ' | ' + r.querySelector('.k').textContent));
const ask = async (p, q) => { await p.keyboard.press('Meta+k'); await p.waitForSelector('#cmdScrim:not([hidden]):not(.closing)'); await p.fill('#cmdText', q); await p.waitForTimeout(150); return rows(p); };
const DAY = 864e5;

(async () => {
  await mode('on=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));

  // ---- not linked: no COMPUTER
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  assert.ok(await p.isDisabled('#cmdBtn'), 'COMPUTER waits for the link');
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(200);
  assert.ok(!(await open(p)), '⌘K does nothing before linking');

  // ---- linked; LIBRARY, REVIEW and TAROT unpinned; REVIEW last opened 20 days ago, LIBRARY never in 30
  await p.evaluate(([k, u, d]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'loom', 'log', 'habits', 'ledger', 'apiary']));
    const now = Date.now();
    localStorage.setItem('tos.visits.v1', JSON.stringify({ _since: now - 30 * d, review: now - 20 * d, ledger: now - 2 * 3600e3, apiary: now - 3600e3, month: now - 2 * d, dates: now - 3 * d, tarot: now - 4 * d, storage: now - 5 * d, engineering: now - 6 * d, astrometrics: now - 7 * d, inbox: now - 8 * d, ressikan: now - 9 * d }));   /* stations added later, opened lately */
  }, [K, U, DAY]);
  await p.reload(); await p.waitForSelector('[data-screen="apiary"].nav', { timeout: 10000 });
  await p.waitForFunction(() => !document.querySelector('#cmdBtn').disabled);
  assert.strictEqual(await txt(p, '#cmdBtn'), 'COMPUTER');

  // ---- the header button opens it, empty
  await p.click('#cmdBtn'); await p.waitForSelector('#cmdScrim:not([hidden])');
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'cmdText', 'the field is ready to type in');
  const empty = await txt(p, '#cmdList');
  console.log('empty:', empty.slice(0, 400));
  assert.ok(empty.includes('RECENT') && empty.indexOf('APIARY') < empty.indexOf('LEDGER'), 'recent stations, newest first');
  assert.ok(empty.includes('NOT OPENED LATELY'), empty);
  const quiet = empty.slice(empty.indexOf('NOT OPENED LATELY'));
  assert.ok(/LIBRARY Not opened in 30 days/.test(quiet) && /REVIEW Last opened 20 days ago/.test(quiet), quiet);
  assert.ok(!/MONTH/.test(quiet), 'opened two days ago: not quiet');
  assert.ok(!/LEDGER|APIARY/.test(quiet), 'pinned stations never listed as quiet');
  assert.strictEqual(await p.getAttribute('#cmdList .cmd-row', 'aria-selected'), 'true', 'the first row is chosen');
  await p.screenshot({ path: D + 'computer-empty.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  assert.ok(!(await open(p)), 'Escape closes it');
  // ⌘K straight after closing opens it again (the sheet is still sliding away), and ⌘K while open closes it
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); await p.keyboard.press('Meta+k'); await p.waitForTimeout(300);
  assert.ok(await open(p), '⌘K during the closing slide opens it');
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(300);
  assert.ok(!(await open(p)), '⌘K again closes it');

  // ---- typing narrows: "book" finds the action, the station, books and tarot books
  let r = await ask(p, 'book');
  console.log('book:', r.slice(0, 6));
  assert.ok(r.length > 2 && r.some(x => x.startsWith('Add a book |')) && r.some(x => x.startsWith('LIBRARY |')), r.join('\n'));
  assert.ok(await p.isVisible('#cmdList mark'), 'the match is marked');
  await p.screenshot({ path: D + 'computer-book.png' });
  // Return opens the chosen row: ADD BOOK on LIBRARY
  await p.fill('#cmdText', 'add a book'); await p.waitForTimeout(100);
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.ok(!(await open(p)));
  assert.strictEqual(await txt(p, '#title'), 'LIBRARY');
  assert.ok((await txt(p, '#detailSheet')).includes('+ ADD BOOK'), 'the add-book sheet is open');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- a hive by name: its rows, then TRUE UP STACK on that hive
  r = await ask(p, 'juniper');
  assert.ok(r.some(x => x.startsWith('Juniper | APIARY · HIVE')) && r.some(x => x.startsWith('New hive check · Juniper')) && r.some(x => x.startsWith('True up stack · Juniper')), r.join('\n'));
  await p.fill('#cmdText', 'true up jun'); await p.waitForTimeout(100);
  assert.strictEqual((await rows(p))[0].split(' | ')[0], 'True up stack · Juniper');
  await p.keyboard.press('Enter'); await p.waitForSelector('.ap-pieces');
  assert.strictEqual(await txt(p, '#title'), 'JUNIPER', 'the true up is for Juniper');

  // ---- arrow keys move the choice; a tarot card opens its history
  r = await ask(p, 'star');
  const star = r.findIndex(x => x.startsWith('The Star |'));
  assert.ok(star > -1 && r[star].endsWith('| CARD'), r.join('\n'));
  for (let i = 0; i < star; i++) await p.keyboard.press('ArrowDown');
  assert.strictEqual(await p.$eval('#cmdList .cmd-row[aria-selected="true"] b', e => e.textContent), 'The Star', 'arrow keys moved the choice to The Star');
  assert.strictEqual(await p.getAttribute('#cmdText', 'aria-activedescendant'), await p.$eval('#cmdList .cmd-row[aria-selected="true"]', e => e.id));
  await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  assert.strictEqual(await txt(p, '#title'), 'TAROT');
  assert.ok(await p.isVisible('#detailSheet') && /star/i.test(await txt(p, '#detailSheet')), 'The Star history is open');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- a setting: Systems, at BACKUP AND RESTORE
  r = await ask(p, 'backup');
  assert.ok(r[0].startsWith('Make a backup | SYSTEMS · BACKUP AND RESTORE | SETTING'), r.join('\n'));
  await p.click('#cmdList .cmd-row'); await p.waitForTimeout(700);
  assert.strictEqual(await txt(p, '#title'), 'SYSTEMS');
  const top = await p.evaluate(() => { const s = [...document.querySelectorAll('#content section')].find(x => /^BACKUP AND RESTORE/.test(x.querySelector('.phead h2').textContent)); const c = document.querySelector('#content').getBoundingClientRect(); return Math.round(s.getBoundingClientRect().top - c.top); });
  assert.ok(top >= -20 && top < 120, 'scrolled to BACKUP AND RESTORE (' + top + ')');

  // ---- nothing matches
  r = await ask(p, 'xyzzy');
  assert.strictEqual(r.length, 0);
  assert.ok((await txt(p, '#cmdList')).includes('Nothing here matches'));
  // a tap outside closes it
  await p.mouse.click(1150, 880); await p.waitForTimeout(350);
  assert.ok(!(await open(p)), 'tap outside closes');

  // ---- LOG search: the log asks for its PIN first, then the search field is ready
  r = await ask(p, 'search the log');
  assert.ok(r[0].startsWith('Search the log |'), r.join('\n'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.strictEqual(await txt(p, '#title'), "CAPTAIN'S LOG");
  await p.keyboard.type('135790'); await p.waitForSelector('#clFind', { timeout: 8000 }); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'clFind', 'search is ready after unlocking');

  // ---- visits are kept
  const v = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.visits.v1')));
  assert.ok(Date.now() - v.library < 60e3 && Date.now() - v.systems < 60e3 && Date.now() - v.log < 60e3, JSON.stringify(v));
  await p.click('.nav[data-screen="today"]'); await p.waitForTimeout(300);

  // ---- no emoji in the list
  r = await ask(p, 'a');
  const list = await txt(p, '#cmdList');
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(list), 'no emoji');
  await p.keyboard.press('Escape');

  // ---- swipe down on the bar (touch): opens COMPUTER, and the station under the finger stays shut
  const tctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', hasTouch: true });
  const t = await tctx.newPage(); t.on('pageerror', e => errs.push(e.message));
  await t.goto('http://localhost:8080/');
  await t.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('today')); }, [K, U]);
  await t.reload(); await t.waitForFunction(() => !document.querySelector('#cmdBtn').disabled, null, { timeout: 10000 });
  const before = await txt(t, '#title');
  await t.evaluate(() => {
    const el = document.querySelectorAll('.side .nav')[2], r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 10;
    const T = yy => new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [T(y)], changedTouches: [T(y)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [T(y + 40)], changedTouches: [T(y + 40)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchmove', { touches: [T(y + 110)], changedTouches: [T(y + 110)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(y + 110)], bubbles: true }));
    el.click();
  });
  await t.waitForTimeout(300);
  assert.ok(await open(t), 'a swipe down on the bar opens COMPUTER');
  assert.strictEqual(await txt(t, '#title'), before, 'the tap that ends the swipe opens nothing');
  await tctx.close();

  // ---- phone width: fits, no keys column
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  await p.click('#cmdBtn'); await p.waitForSelector('#cmdScrim:not([hidden])'); await p.fill('#cmdText', 'hive'); await p.waitForTimeout(150);
  assert.strictEqual(await p.evaluate(() => document.documentElement.scrollWidth), 400, 'no sideways scroll');
  assert.ok(await p.isHidden('.cmd-foot'));
  await p.screenshot({ path: D + 'computer-phone.png' });

  console.log('errors', errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
