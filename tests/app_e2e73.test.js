// RECIPES (2.60, bridge 1.40; 2.89: COOK removed, the recipe in the editor; simulated bridge :8105, invented recipes). + FROM A RECIPE: a link (read from
// the page's recipe data), the pasted text, or a photo (made smaller, as JPEG) → the meal editor filled in to review:
// name, kind, the shopping list with staples marked HAVE, and what the import found (ingredients as written, steps,
// servings, time, where from). SAVE sends the recipe with the meal so it becomes the Notion page's body; the dish's photo
// (fetched by the bridge, 2.79) is made a small square here and kept with the meal; the site's own image is never loaded. A site that refuses says what to do instead. ASK sends a recipe link here rather than to the chat;
// COMPUTER has "Add a recipe". 2.89: the editor's RECIPE section (serves, time, ingredient lines with amounts, steps to
// edit, add, remove and reorder) is filled from the import or read back from the meal's Notion page; SAVE sends the
// recipe only when it changed and isn't empty; FILL SHOPPING LIST turns lines into items; a page with other text says
// a changed recipe would replace it. A meal tapped with no night chosen shows its recipe to read. Nothing offers COOK.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const deep = require('./lib/deep');   // 2.85 (A4): saved copies live in the deep store
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = require('./lib/explain').until(10000, 120);   // B3: a timeout says what the page showed
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date());
const lastPost = async act => (await mode('')).posts.filter(x => x[0] === act).pop();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAgx9jA8AAAAASUVORK5CYII=', 'base64');

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
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
  await p.waitForSelector('.ml-imported img[src^="data:image/jpeg;base64,"]');   // the dish's photo, made small here (2.79)
  assert.strictEqual(await p.inputValue('#mlName'), 'Sample skillet chicken');
  assert.strictEqual(await p.getAttribute('[data-mlkind="Chicken"]', 'aria-pressed'), 'true');
  assert.deepStrictEqual(await p.$$eval('.ml-ingn', e => e.map(x => x.value)), ['Chicken thighs', 'Rice', 'Onion']);
  assert.strictEqual(await p.getAttribute('[data-mlhave="1"]', 'aria-pressed'), 'true', 'a staple: HAVE');
  const imp = await txt(p, '.ml-imported');
  assert.ok(imp.startsWith('FROM RECIPES.EXAMPLE 3 ingredients as written · 3 steps · serves 4 servings · 45 min'), imp);
  assert.strictEqual(await p.inputValue('#mlRecipe'), 'https://recipes.example/skillet');
  assert.deepStrictEqual(await p.$$eval('.ml-rxl', e => e.map(x => x.value)), ['2 lb chicken thighs', '1 cup rice', '1 onion, diced'], 'the lines, in the editor');
  assert.deepStrictEqual(await p.$$eval('.ml-rxt', e => e.map(x => x.value)), ['Dice the onion.', 'Brown the chicken.', 'Add the rice and simmer.'], 'the steps, in the editor');
  assert.deepStrictEqual([await p.inputValue('#mlServes'), await p.inputValue('#mlTime')], ['4 servings', '45 min']);
  assert.strictEqual(await p.locator('[data-mlcook], .ml-full').count(), 0, 'no COOK, no folded list');
  await p.fill('#mlName', 'Sample skillet chicken and rice');   // edited before saving
  await p.click('[data-ml="save"]');
  const saved = (await until(() => lastPost('mealsave')))[1];
  assert.strictEqual(saved.name, 'Sample skillet chicken and rice');
  assert.deepStrictEqual(saved.full, { lines: ['2 lb chicken thighs', '1 cup rice', '1 onion, diced'], steps: ['Dice the onion.', 'Brown the chicken.', 'Add the rice and simmer.'], servings: '4 servings', time: '45 min', source: 'https://recipes.example/skillet' });
  assert.strictEqual(saved.photo, 'https://img.example/skillet.jpg', 'where the photo came from');
  assert.ok(/^data:image\/jpeg;base64,/.test(saved.thumb) && saved.thumb.length <= 15000, 'the small copy goes with it');
  assert.ok(/^data:image\/jpeg/.test(await p.getAttribute(`.ml-row[data-mlcard="${saved.id}"] img.ml-pic`, 'src')), 'the row shows the small copy');
  const local = JSON.parse(await deep.read(p, 'tos.meals.v1')).meals.find(m => m.id === saved.id);
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

  // ---- TONIGHT on the Bridge: no COOK
  await p.click(`.ml-day[data-mlday="${TODAY}"]`); await p.click(`[data-mlcard="${saved.id}"]`);
  await until(async () => (await lastPost('dinnerset'))[1].meal === saved.id);
  await p.click('.elbow'); await p.waitForSelector('#mlLine');
  assert.strictEqual(await p.locator('[data-mlcook]').count(), 0, 'TONIGHT offers no COOK');
  assert.ok(!/\bCOOK\b/.test(await txt(p, '#mlLine')));

  // ---- a meal tapped with no night chosen: its recipe, to read
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-cards');
  if (await p.$('#mlDayBar')) await p.click('[data-ml="unsel"]');   // planning moved on to the next open night
  await p.click(`[data-mlcard="${saved.id}"]`); await p.waitForSelector('.ml-view');
  await until(async () => (await txt(p, '.ml-viewbody')).includes('Brown the chicken.'), 10000, 'the recipe read from Notion');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · MEALS · RECIPE');
  assert.ok((await txt(p, '.ml-viewhead')).includes('CHICKEN · SERVES 4 SERVINGS · 45 MIN'), await txt(p, '.ml-viewhead'));
  assert.deepStrictEqual(await p.$$eval('.ml-viewbody ul li', e => e.map(x => x.textContent)), ['2 lb chicken thighs', '1 cup rice', '1 onion, diced']);
  assert.deepStrictEqual(await p.$$eval('.ml-viewbody ol li', e => e.map(x => x.textContent)), ['Dice the onion.', 'Brown the chicken.', 'Add the rice and simmer.']);
  assert.strictEqual(await p.getAttribute('.ml-view a.chip', 'href'), 'https://recipes.example/skillet');
  assert.ok(await p.$('.ml-view .ml-pic'), 'its small copy, or its initials');
  await p.screenshot({ path: __dirname + '/out/e73-recipe-view.png' });

  // ---- EDIT from there: the recipe read back; unchanged, SAVE sends no recipe
  await p.click('[data-ml="viewedit"]'); await p.waitForSelector('.ml-form .ml-rxl');
  assert.strictEqual(await txt(p, '#eyebrow'), 'RESOURCES · MEALS · EDIT MEAL');
  assert.deepStrictEqual([await p.inputValue('#mlServes'), await p.inputValue('#mlTime')], ['4 servings', '45 min'], 'read from the page\'s "Serves … · …" line');
  const nSaves = async () => (await mode('')).posts.filter(x => x[0] === 'mealsave').length;
  let n0 = await nSaves();
  await p.click('[data-ml="save"]');
  const plain = (await until(async () => (await nSaves()) > n0 && (await lastPost('mealsave'))))[1];
  assert.ok(plain.id === saved.id && !('full' in plain), 'nothing changed in the recipe: the page is left alone');

  const editOpen = async id => { if ((await p.getAttribute('[data-ml="edit"]', 'aria-pressed')) !== 'true') await p.click('[data-ml="edit"]'); await p.click(`[data-mlcard="${id}"]`); await p.waitForSelector('.ml-form .ml-rxl'); };
  // ---- edited: a line out, a line in, a step reworded and moved up, a step added
  await editOpen(saved.id);
  await p.click('[data-mlrxl="0"]');
  await p.click('[data-ml="rxladd"]'); assert.ok(await p.evaluate(() => document.activeElement === [...document.querySelectorAll('.ml-rxl')].pop()), 'the new line has the caret');
  await p.keyboard.type('2 tbsp butter');
  await p.fill('.ml-rxt >> nth=1', 'Brown the chicken well.');   // typed, still in the box, when ▲ is tapped
  await p.click('[data-mlrxs="2"][data-mlrxgo="up"]');
  assert.ok(await p.isDisabled('[data-mlrxs="0"][data-mlrxgo="up"]') && await p.isDisabled('[data-mlrxs="2"][data-mlrxgo="dn"]'), 'the ends don\'t move further');
  await p.click('[data-ml="rxsadd"]'); await p.keyboard.type('Serve.');
  assert.deepStrictEqual(await p.$$eval('.ml-rxstep > b', e => e.map(x => x.textContent)), ['1', '2', '3', '4']);
  n0 = await nSaves(); await p.click('[data-ml="save"]');
  const ed = (await until(async () => (await nSaves()) > n0 && (await lastPost('mealsave'))))[1];
  assert.deepStrictEqual(ed.full, { lines: ['1 cup rice', '1 onion, diced', '2 tbsp butter'], steps: ['Dice the onion.', 'Add the rice and simmer.', 'Brown the chicken well.', 'Serve.'], servings: '4 servings', time: '45 min', source: 'https://recipes.example/skillet' });

  // ---- from scratch: a recipe written by hand; FILL SHOPPING LIST makes the items to check
  await p.click('[data-ml="new"]'); await p.waitForSelector('.ml-rx');
  assert.strictEqual(await p.locator('.ml-rxl, .ml-rxt').count(), 0, 'a new meal starts with an empty recipe');
  assert.strictEqual(await p.locator('[data-ml="rxfill"]').count(), 0, 'nothing to fill from yet');
  await p.fill('#mlName', 'Sample omelette');
  for (const l of ['3 large eggs', '2 tbsp butter, softened', '1/2 cup grated cheddar (sharp)']) { await p.click('[data-ml="rxladd"]'); await p.keyboard.type(l); }
  await p.click('[data-ml="rxfill"]');
  assert.deepStrictEqual(await p.$$eval('.ml-ingn', e => e.map(x => x.value)), ['Eggs', 'Butter', 'Grated cheddar'], 'the ingredient of each line, amounts left behind');
  assert.deepStrictEqual(await p.$$eval('.ml-inga', e => e.map(x => x.value)), ['Other', 'Other', 'Other'], 'aisles left to check');
  await p.click('[data-ml="rxfill"]');
  assert.strictEqual(await p.locator('.ml-ingn').count(), 3, 'filling again adds nothing twice');
  await p.click('[data-ml="rxsadd"]'); await p.keyboard.type('Whisk, then cook gently.');
  await p.fill('#mlServes', '2');
  n0 = await nSaves(); await p.click('[data-ml="save"]');
  const om = (await until(async () => (await nSaves()) > n0 && (await lastPost('mealsave'))))[1];
  assert.strictEqual(om.name, 'Sample omelette');
  assert.deepStrictEqual(om.full, { lines: ['3 large eggs', '2 tbsp butter, softened', '1/2 cup grated cheddar (sharp)'], steps: ['Whisk, then cook gently.'], servings: '2', time: '', source: '' });
  assert.deepStrictEqual(om.ing.map(x => x.n), ['Eggs', 'Butter', 'Grated cheddar']);
  // a new meal with no recipe sends none
  await p.click('[data-ml="new"]'); await p.fill('#mlName', 'Sample toast');
  n0 = await nSaves(); await p.click('[data-ml="save"]');
  const toast0 = (await until(async () => (await nSaves()) > n0 && (await lastPost('mealsave'))))[1];
  assert.ok(toast0.name === 'Sample toast' && !('full' in toast0), 'an empty recipe is never sent');

  // ---- a page with other text: the editor says a changed recipe would replace it
  await editOpen('m-curry');
  assert.deepStrictEqual([await p.inputValue('#mlServes'), await p.inputValue('#mlTime')], ['4', '40 min']);
  assert.ok((await txt(p, '.ml-rxextra')).includes('A sample note kept in the page'), 'the other text is named');
  await (await p.$('.ml-rx')).scrollIntoViewIfNeeded(); await p.screenshot({ path: __dirname + '/out/e73-recipe-edit.png' });
  assert.ok(!(await txt(p, '.ml-rxextra')).includes('From curry.example'), 'the source line is the recipe\'s own');
  await p.click('[data-ml="cancel"]');
  assert.deepStrictEqual(await p.evaluate(() => document.body.innerText.match(/\bCOOK\b/g)), null, 'COOK appears nowhere');
  assert.strictEqual(await p.evaluate(() => window.__wake), 0, 'nothing keeps the screen on');

  // ---- phone width: the recipe view and the editor fit
  await editOpen('m-curry');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await (await p.$('.ml-rx')).scrollIntoViewIfNeeded(); await p.screenshot({ path: __dirname + '/out/e73-recipe-phone.png' });

  assert.deepStrictEqual(errs, []);
  await b.close(); await mode('cap=0&reset=1');
  console.log('e2e73 recipes, and the recipe in the editor: OK');
})().catch(async e => { console.error(e); await mode('cap=0&reset=1').catch(() => {}); process.exit(1); });
