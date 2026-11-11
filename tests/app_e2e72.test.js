// MEALS (2.59, bridge 1.39; simulated bridge :8105, invented meals). TONIGHT on the Bridge and TODAY: from 4 PM it asks
// what dinner was (LEFTOVERS, EATING OUT, SOMETHING ELSE, ✓ HAD IT for a plan), UNDO puts it back. PLAN: the week as
// seven nights; tap a night, then a menu card (longest ago first; NOT IN A WHILE, DUE, NEW); a plan moves on to the next
// open night; the grocery list builds from the nights planned, merged by aisle, staples marked HAVE left off; ticks and
// added items are kept (tos.mealgot.v1); PRINT lays out one plain page of what's left; SHARE sends the same as text.
// PLAN MY WEEK proposes the open nights and plans only what is confirmed. A new meal with its ingredients; RETIRE takes
// it off the cards; REMOVE takes two taps. LOG: five weeks to fill in, and the rotation table. Every change goes to
// the bridge in order. SYSTEMS has its row; phone width.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date());
const lastPost = async act => (await mode('')).posts.filter(x => x[0] === act).pop();

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(TODAY + 'T18:30:00-06:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals'])); }, [K, U]);
  await p.reload(); await p.waitForSelector('#mlLine', { timeout: 15000 });

  // ---- TONIGHT, 18:30: nothing recorded yet
  let line = await txt(p, '#mlLine');
  assert.ok(line.startsWith('TONIGHT · DINNER Not recorded What was dinner?') && line.includes('tomorrow: Sample fish') && line.includes('LEFTOVERS EATING OUT SOMETHING ELSE'), line);
  await p.click('#mlLine [data-mlnow="leftovers"]');
  assert.deepStrictEqual((await until(() => lastPost('dinnerset')))[1], { date: TODAY, status: 'eaten', kind: 'leftovers', meal: null });
  line = await txt(p, '#mlLine');
  assert.ok(line.includes('Leftovers Recorded') && line.includes('UNDO'), line);
  await p.click('#mlLine [data-mlnow="undo"]');
  await until(async () => (await lastPost('dinnerset'))[1].kind === 'none');
  assert.ok((await txt(p, '#mlLine')).includes('Not recorded'));
  // the same line on TODAY
  await p.click('[data-screen="today"].nav'); await p.waitForSelector('#mlLine');
  // SOMETHING ELSE: MEALS, tonight chosen; a card records it
  await p.click('#mlLine [data-mlnow="else"]'); await p.waitForSelector('.ml-days');
  assert.strictEqual(await p.getAttribute('.ml-days .ml-day.sel', 'data-mlday'), TODAY);
  assert.ok((await txt(p, '#mlDayBar')).includes('Tap a meal to record it.'));
  await p.click('[data-mlcard="m-curry"]');
  assert.deepStrictEqual((await until(() => lastPost('dinnerset')))[1], { date: TODAY, status: 'eaten', kind: 'meal', meal: 'm-curry' });
  assert.ok((await txt(p, `.ml-day[data-mlday="${TODAY}"]`)).includes('Sample curry EATEN ✓'));

  // ---- the MEAL LIBRARY (2.76): a row per meal, longest ago first, flagged
  await p.clock.setFixedTime(new Date(TODAY + 'T12:00:00-06:00'));   // midday: nights are planned, not recorded
  const cards = await p.$$eval('.ml-row', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  assert.ok(cards[0] === 'Sample soup MEATLESS · 60 days ago · 2× NOT IN A WHILE', cards[0]);
  assert.ok(cards.some(c => c.startsWith('Sample tacos BEEF + PORK · 2 days ago · 3×')), cards.join(' | '));
  assert.ok(cards.some(c => /^Sample pasta BEEF \+ PORK/.test(c)));
  assert.ok((await txt(p, '.ml-lates')).includes('NOT IN A WHILE Sample soup · 60 DAYS'));

  // ---- PLAN next week: a night, then a card; on to the next open night
  await p.click('[data-ml="wknext"]');
  assert.ok((await txt(p, '.ml-week h3')) === 'NEXT WEEK');
  const open = await p.$$eval('.ml-days .ml-day.open', e => e.map(x => x.dataset.mlday));
  assert.ok(open.length >= 5, open.join(' '));
  await p.click(`.ml-day[data-mlday="${open[0]}"]`);
  assert.ok((await txt(p, '#mlDayBar')).includes('to plan it.'));
  await p.click('[data-mlcard="m-curry"]');
  assert.deepStrictEqual((await until(() => lastPost('dinnerset')))[1], { date: open[0], status: 'planned', kind: 'meal', meal: 'm-curry' });
  assert.strictEqual(await p.getAttribute('.ml-days .ml-day.sel', 'data-mlday'), open[1], 'on to the next open night');
  await p.click('[data-mlcard="m-tacos"]');
  await until(async () => (await lastPost('dinnerset'))[1].date === open[1]);
  await p.click('[data-ml="unsel"]');
  // the groceries: merged by aisle; the staple (Rice, HAVE) left off
  let g = await txt(p, '.ml-groc');
  assert.ok(g.includes('MEAT + FISH') && g.includes('Chicken thighs') && g.includes('Ground beef') && g.includes('PANTRY Coconut milk') && !g.includes('Rice'), g);
  assert.ok(g.includes('1 pantry staple left off'), g);
  // tick one, add one by hand, take it off again
  await p.click('[data-mlgot="ground beef"]');
  assert.strictEqual(await p.getAttribute('[data-mlgot="ground beef"]', 'aria-pressed'), 'true');
  await p.click('[data-ml="add"]'); await p.fill('#mlAddN', 'Sample paper towels'); await p.selectOption('#mlAddA', 'Household'); await p.click('[data-ml="addsave"]');
  assert.ok((await txt(p, '.ml-groc')).includes('HOUSEHOLD Sample paper towels added by hand'));
  const got = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.mealgot.v1')));
  assert.ok(got.got['ground beef'] && got.extra.some(x => x.n === 'Sample paper towels' && x.a === 'Household'), JSON.stringify(got));
  // PRINT: one plain page of what's left; SHARE: the same as text
  await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById('printSheet').textContent; window.__printing = document.documentElement.classList.contains('printing'); }; window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }; });
  await p.click('[data-ml="print"]');
  const printed = await p.evaluate(() => [window.__printed, window.__printing]);
  assert.ok(printed[1] && printed[0].startsWith('GROCERIESFor ') && printed[0].includes('HOUSEHOLD') && printed[0].includes('Chicken thighs') && !printed[0].includes('Ground beef'), printed[0]);
  await p.click('[data-ml="share"]');
  const shared = await p.evaluate(() => window.__shared);
  assert.ok(shared.title === 'Groceries' && shared.text.includes('☐ Chicken thighs') && !shared.text.includes('Ground beef'), JSON.stringify(shared));
  await p.click('[data-mlrmx="sample paper towels"]');
  assert.ok(!(await txt(p, '.ml-groc')).includes('paper towels'));

  // ---- PLAN MY WEEK: the open nights, proposed; only what's confirmed is planned
  const left = (await p.$$eval('.ml-days .ml-day.open', e => e.map(x => x.dataset.mlday)));
  await p.click('[data-ml="plan"]'); await p.waitForSelector('.ml-props', { timeout: 10000 });
  assert.deepStrictEqual((await lastPost('mealplan'))[1], left);
  const props = await p.$$eval('.ml-prop', e => e.length);
  assert.strictEqual(props, left.length);
  await p.click('[data-mltake="0"]');   // not that one
  const before = (await mode('')).posts.length;
  await p.click('[data-ml="planok"]');
  await until(async () => (await mode('')).posts.length === before + left.length - 1);
  assert.ok((await txt(p, `.ml-day[data-mlday="${left[0]}"]`)).includes('+ PLAN'), 'the one left out stays open');

  // ---- a new meal; edit, retire, remove
  await p.click('[data-ml="new"]'); await p.click('[data-ml="save"]');
  assert.ok((await txt(p, '.ml-form')).includes('Give the meal a name.'));
  await p.fill('#mlName', 'Sample chili'); await p.click('[data-mlkind="Beef + Pork"]');
  await p.fill('.ml-ingn', 'Beans'); await p.selectOption('.ml-inga', 'Pantry');
  await p.click('[data-ml="ingadd"]'); await p.fill('.ml-ingn >> nth=1', 'Cheddar · sharp'); await p.selectOption('.ml-inga >> nth=1', 'Dairy');
  await p.click('[data-ml="ingadd"]'); await p.fill('.ml-ingn >> nth=2', 'Chili powder'); await p.selectOption('.ml-inga >> nth=2', 'Pantry'); await p.click('[data-mlhave="2"]');
  assert.strictEqual(await p.inputValue('.ml-ingn >> nth=1'), 'Cheddar · sharp', 'typing kept across redraws');
  await p.fill('#mlRecipe', 'not a link'); await p.click('[data-ml="save"]');
  assert.ok((await txt(p, '.ml-form')).includes('should start with https://'));
  await p.fill('#mlRecipe', 'https://example.com/chili'); await p.click('[data-ml="save"]');
  const saved = (await until(() => lastPost('mealsave')))[1];
  assert.deepStrictEqual([saved.name, saved.kind, saved.ing, saved.recipe], ['Sample chili', 'Beef + Pork', [{ n: 'Beans', a: 'Pantry', have: false }, { n: 'Cheddar sharp', a: 'Dairy', have: false }, { n: 'Chili powder', a: 'Pantry', have: true }], 'https://example.com/chili']);
  assert.ok((await txt(p, `[data-mlcard="${saved.id}"]`)).includes('Sample chili BEEF + PORK · Not made yet NEW'));
  await p.click('[data-ml="edit"]'); await p.click(`[data-mlcard="${saved.id}"]`);
  assert.strictEqual(await p.inputValue('#mlName'), 'Sample chili');
  await p.click('[data-ml="retire"]'); await p.click('[data-ml="save"]');
  await until(async () => (await lastPost('mealsave'))[1].retired === true);
  assert.strictEqual(await p.$(`.ml-cards [data-mlcard="${saved.id}"]`), null, 'retired: off the list');
  await p.click('[data-mlcard="m-pasta"]'); await p.click('[data-ml="del"]');
  assert.strictEqual(await txt(p, '[data-ml="del"]'), 'TAP AGAIN TO REMOVE');
  await p.click('[data-ml="del"]');
  assert.strictEqual((await until(() => lastPost('mealremove')))[1], 'm-pasta');
  await p.click('[data-ml="edit"]');

  // ---- LOG: five weeks; a blank night filled in; the rotation table
  await p.click('[data-mltab="log"]');
  assert.strictEqual(await p.$$eval('.ml-cal .ml-day', e => e.length), 35);
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · MEALS · LOG AND ROTATION');
  const blank = await p.$eval('.ml-cal .ml-day.blank', e => e.dataset.mlday);
  await p.click(`.ml-cal [data-mlday="${blank}"]`); await p.click('.ml-pick [data-mlcard="m-fish"]');
  assert.deepStrictEqual((await until(async () => { const x = await lastPost('dinnerset'); return x[1].date === blank && x; }))[1], { date: blank, status: 'eaten', kind: 'meal', meal: 'm-fish' });
  let rows = await p.$$eval('.ml-tr:not(.ml-th)', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  assert.ok(rows[0].startsWith('Sample soup') && rows[0].endsWith('NOT IN A WHILE'), rows[0]);
  await p.click('[data-mlsort="name"]');
  rows = await p.$$eval('.ml-tr:not(.ml-th)', e => e.map(x => x.innerText.split('\n')[0].trim()));
  assert.deepStrictEqual(rows, ['Sample curry', 'Sample fish', 'Sample soup', 'Sample tacos']);
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.mealview.v1')).sort), 'name');

  // ---- everything reached the bridge; SYSTEMS; phone width
  await until(async () => (await p.evaluate(() => JSON.parse(localStorage.getItem('tos.mealq.v1')).ops.length)) === 0);
  await p.click('#status'); await p.waitForSelector('.calrow:has-text("Meals and Dinners")');
  assert.strictEqual(await p.locator('.calrow', { hasText: 'Meals and Dinners' }).locator('.pill').innerText(), 'OK');
  await p.click('[data-screen="meals"].nav'); await p.click('[data-mltab="plan"]');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
  assert.ok(await p.evaluate(() => document.querySelector('.ml-groc').getBoundingClientRect().top < document.querySelector('.ml-week').getBoundingClientRect().top), 'on a phone the groceries come first');

  assert.deepStrictEqual(errs, []);
  await b.close(); await mode('cap=0&reset=1');
  console.log('e2e72 MEALS: OK');
})().catch(async e => { console.error(e); await mode('cap=0&reset=1').catch(() => {}); process.exit(1); });
