// RECIPES AND COOK (2.60, bridge 1.40; simulated bridge :8105, invented recipe). + FROM A RECIPE: a link (read from
// the page's recipe data), the pasted text, or a photo (made smaller, as JPEG) → the meal editor filled in to review:
// name, kind, the shopping list with staples marked HAVE, and what the import found (ingredients as written, steps,
// servings, time, where from). SAVE sends the recipe with the meal so it becomes the Notion page's body; the card shows
// the dish's photo. A site that refuses says what to do instead. ASK sends a recipe link here rather than to the chat;
// COMPUTER has "Add a recipe". COOK (from TONIGHT, a chosen night or the editor): ingredients to tick, the step you're on
// (NEXT STEP, or tap one), A+ for larger type, the screen kept on; a meal with no recipe yet says how to add one.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date());
const lastPost = async act => (await mode('')).posts.filter(x => x[0] === act).pop();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAgx9jA8AAAAASUVORK5CYII=', 'base64');

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(TODAY + 'T12:00:00-06:00'));
  await p.addInitScript(() => { window.__wake = 0; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => { window.__wake++; const l = new EventTarget(); l.release = () => { window.__wake--; return Promise.resolve(); }; return Promise.resolve(l); } } }); });
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals'])); localStorage.setItem('tos.standby.v1', '0'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#mlLine', { timeout: 15000 });
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-cards');

  // ---- a link: the editor, filled in
  await p.click('[data-ml="imp"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · MEALS · FROM A RECIPE');
  await p.click('[data-ml="impgo"]');
  assert.ok((await txt(p, '.ml-imp')).includes("Paste the recipe's link"));
  await p.fill('#mlImpUrl', 'https://recipes.example/blocked'); await p.click('[data-ml="impgo"]');
  await p.waitForFunction(() => /won't let Bridge read it/.test(document.querySelector('.ml-imp').innerText));
  await p.fill('#mlImpUrl', 'https://recipes.example/skillet'); await p.click('[data-ml="impgo"]');
  await p.waitForSelector('.ml-imported');
  assert.strictEqual((await lastPost('mealimport'))[1], 'https://recipes.example/skillet');
  assert.strictEqual(await p.inputValue('#mlName'), 'Sample skillet chicken');
  assert.strictEqual(await p.getAttribute('[data-mlkind="Chicken"]', 'aria-pressed'), 'true');
  assert.deepStrictEqual(await p.$$eval('.ml-ingn', e => e.map(x => x.value)), ['Chicken thighs', 'Rice', 'Onion']);
  assert.strictEqual(await p.getAttribute('[data-mlhave="1"]', 'aria-pressed'), 'true', 'a staple: HAVE');
  const imp = await txt(p, '.ml-imported');
  assert.ok(imp.startsWith('FROM RECIPES.EXAMPLE 3 ingredients as written · 3 steps · serves 4 servings · 45 min'), imp);
  assert.strictEqual(await p.inputValue('#mlRecipe'), 'https://recipes.example/skillet');
  await p.click('.ml-full summary');
  assert.ok((await txt(p, '.ml-full')).includes('2 lb chicken thighs') && (await txt(p, '.ml-full')).includes('Brown the chicken.'));
  await p.fill('#mlName', 'Sample skillet chicken and rice');   // edited before saving
  await p.click('[data-ml="save"]');
  const saved = (await until(() => lastPost('mealsave')))[1];
  assert.strictEqual(saved.name, 'Sample skillet chicken and rice');
  assert.deepStrictEqual(saved.full, { lines: ['2 lb chicken thighs', '1 cup rice', '1 onion, diced'], steps: ['Dice the onion.', 'Brown the chicken.', 'Add the rice and simmer.'], servings: '4 servings', time: '45 min', source: 'https://recipes.example/skillet' });
  assert.ok(saved.photo.startsWith('data:image/gif'), 'the dish photo goes with it');
  assert.ok(await p.$(`.ml-row[data-mlcard="${saved.id}"] img.ml-pic`), 'the row shows the photo');
  const local = await p.evaluate(id => JSON.parse(localStorage.getItem('tos.meals.v1')).meals.find(m => m.id === id), saved.id);
  assert.ok(local && !local.full, 'the recipe text is sent, not kept in the meals list');

  // ---- the text, and a photo
  await p.click('[data-ml="imp"]'); await p.click('[data-mlimp="text"]');
  await p.fill('#mlImpText', 'too short'); await p.click('[data-ml="impgo"]');
  assert.ok((await txt(p, '.ml-imp')).includes('Paste the whole recipe'));
  await p.fill('#mlImpText', 'Sample stew\n2 carrots\n1 onion\nSimmer everything for an hour.'); await p.click('[data-ml="impgo"]');
  await p.waitForSelector('.ml-imported');
  assert.ok((await txt(p, '.ml-imported')).startsWith('FROM YOUR TEXT'));
  await p.click('[data-ml="cancel"]');
  await p.click('[data-ml="imp"]'); await p.click('[data-mlimp="photo"]');
  await p.setInputFiles('#mlImpPhoto', { name: 'card.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForFunction(() => /card\.png chosen/.test(document.querySelector('.ml-imp').innerText));
  await p.click('[data-ml="impgo"]'); await p.waitForSelector('.ml-imported');
  assert.strictEqual((await lastPost('mealimport'))[1], 'image/jpeg', 'sent smaller, as JPEG');
  assert.ok((await txt(p, '.ml-imported')).startsWith('FROM YOUR PHOTO'));
  await p.click('[data-ml="cancel"]');

  // ---- ASK: a recipe link opens + FROM A RECIPE, not the chat; COMPUTER: Add a recipe
  await p.click('#askBtn'); await p.fill('#askText', 'add this recipe https://recipes.example/skillet'); await p.press('#askText', 'Enter');
  await p.waitForSelector('.ml-imported');
  await p.waitForSelector('#askScrim', { state: 'hidden', timeout: 3000 });   // ASK closed
  await p.click('[data-ml="cancel"]');
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'recipe');
  await p.waitForFunction(() => /Add a recipe/.test(document.getElementById('cmdList').innerText));
  await p.keyboard.press('Escape');

  // ---- COOK: from TONIGHT
  await p.click(`.ml-day[data-mlday="${TODAY}"]`); await p.click(`[data-mlcard="${saved.id}"]`);
  await until(async () => (await lastPost('dinnerset'))[1].meal === saved.id);
  await p.click('.elbow'); await p.waitForSelector('#mlLine [data-mlcook]');
  await p.click('#mlLine [data-mlcook]'); await p.waitForSelector('.ml-cook .ml-step');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · MEALS · COOK');
  assert.deepStrictEqual(await p.$$eval('.ml-tick span', e => e.map(x => x.textContent)), ['2 lb chicken thighs', '1 cup rice', '1 onion, diced']);
  assert.strictEqual(await txt(p, '.ml-step.now'), '1 Dice the onion.');
  await p.click('[data-ml="cooknext"]');
  assert.strictEqual(await txt(p, '.ml-step.now'), '2 Brown the chicken.');
  assert.ok((await txt(p, '.ml-cookbody')).includes('STEPS · 2 OF 3'));
  await p.click('[data-mlstep="2"]'); assert.ok(await p.isDisabled('[data-ml="cooknext"]'));
  await p.click('[data-mltick="0"]'); assert.strictEqual(await p.getAttribute('[data-mltick="0"]', 'aria-pressed'), 'true');
  await p.click('[data-ml="cookbig"]'); assert.ok(await p.$('.ml-cook.big'));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.mealview.v1')).big), true);
  assert.strictEqual(await p.evaluate(() => window.__wake), 1, 'the screen kept on, even with Standby off');
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.mealrc.v1') || '{}')), 'kept for no signal');
  await p.click('[data-ml="cookx"]');
  assert.strictEqual(await p.evaluate(() => window.__wake), 0, 'let go');
  // a meal with no recipe yet: its shopping list, and how to add steps
  await p.click('[data-ml="edit"]'); await p.click('[data-mlcard="m-soup"]'); await p.click('.ml-form [data-mlcook="m-soup"]');
  await p.waitForFunction(() => /No steps in this meal's Notion page yet/.test(document.querySelector('.ml-cook').innerText));
  assert.deepStrictEqual(await p.$$eval('.ml-tick span', e => e.map(x => x.textContent)), ['Lentils', 'Onion', 'Carrots']);
  await p.click('.elbow');
  assert.strictEqual(await p.evaluate(() => window.__wake), 0, 'leaving MEALS ends COOK');

  // ---- phone width: COOK stacks
  await p.click('[data-screen="meals"].nav'); await p.click('[data-ml="edit"]').catch(() => {});
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  assert.deepStrictEqual(errs, []);
  await b.close(); await mode('cap=0&reset=1');
  console.log('e2e73 recipes and COOK: OK');
})().catch(async e => { console.error(e); await mode('cap=0&reset=1').catch(() => {}); process.exit(1); });
