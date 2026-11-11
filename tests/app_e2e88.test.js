// RECIPE PHOTOS KEPT SMALL (2.79, bridge 1.46; simulated bridge :8105, invented meals). MEALS never loads an image from
// a recipe site: the bridge fetches the picture (mealimg) and the iPad makes the small square copy (Thumb) it already
// makes for its own photos. A meal from before, with only a link, gets its copy once, in the background (mealthumb
// changes only the picture); a picture that can't be had shows the initials and isn't asked for again for two weeks.
// A pasted image link becomes a copy too, or says it couldn't. COOK shows the copy.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const post = b => fetch(U, { method: 'POST', body: JSON.stringify(Object.assign({ key: K }, b)) }).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const posts = async act => (await mode('')).posts.filter(x => x[0] === act);
const JPEG = /^data:image\/jpeg;base64,/;

(async () => {
  await mode('cap=1&reset=1&seed=1');
  for (const [id, name, photo] of [['m-pic1', 'Sample pot roast', 'https://img.example/roast.jpg'], ['m-pic2', 'Sample stir fry', 'https://img.example/gone.jpg']])
    assert.ok((await post({ action: 'mealsave', meal: { id, name, kind: 'Other', ing: [{ n: 'Rice', a: 'Pantry', have: false }], recipe: '', photo, notes: '', retired: false } })).ok);
  const b = await chromium.launch(); const errs = [], outside = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  await ctx.route(u => !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(u)), r => { outside.push(r.request().url()); r.abort(); });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals'])); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload();
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-row', { timeout: 15000 });

  // ---- the older meals: a copy made once, in the background; only the picture changes
  await until(async () => (await posts('mealthumb')).length === 1);
  const [th] = await posts('mealthumb');
  assert.strictEqual(th[1], 'm-pic1');
  const roast = (await mode('')).meals.find(m => m.id === 'm-pic1');
  assert.ok(JPEG.test(roast.thumb) && roast.thumb.length <= 15000 && roast.photo === 'https://img.example/roast.jpg' && roast.name === 'Sample pot roast', 'the copy saved; the rest as it was');
  await until(async () => JPEG.test(await p.getAttribute('[data-mlcard="m-pic1"] img.ml-pic', 'src').catch(() => '')));
  assert.ok(await p.$('[data-mlcard="m-pic2"] i.ml-pic'), 'a picture that can\'t be had: the initials');
  await until(async () => p.evaluate(() => !!(JSON.parse(localStorage.getItem('tos.mealview.v1') || '{}').nothumb || {})['m-pic2']));
  assert.deepStrictEqual((await posts('mealimg')).map(x => x[1]).sort(), ['https://img.example/gone.jpg', 'https://img.example/roast.jpg']);

  // ---- a reload asks for neither again
  await p.reload(); await p.click('[data-screen="meals"].nav'); await p.waitForSelector('[data-mlcard="m-pic1"] img.ml-pic');
  await new Promise(r => setTimeout(r, 1500));
  assert.strictEqual((await posts('mealimg')).length, 2, 'not asked for again');

  // ---- a pasted image link becomes a copy; one that can't be had says so
  await p.click('[data-ml="edit"]'); await p.click('[data-mlcard="m-pic2"]');
  await p.fill('#mlPhotoUrl', 'https://img.example/gone-again.jpg'); await p.press('#mlPhotoUrl', 'Tab');
  await until(async () => (await txt(p, '.ml-form')).includes("Couldn't use that image link"));
  await p.fill('#mlPhotoUrl', 'https://img.example/stirfry.jpg'); await p.press('#mlPhotoUrl', 'Tab');
  await p.waitForSelector('.ml-photo img.ml-pic.lg');
  assert.ok(JPEG.test(await p.getAttribute('.ml-photo img.ml-pic.lg', 'src')));
  assert.ok((await txt(p, '.ml-photo')).includes('Kept small with the meal in Notion'));
  await p.click('[data-ml="save"]');
  const saved = (await until(async () => (await posts('mealsave')).filter(x => x[1].id === 'm-pic2').pop()))[1];
  assert.ok(saved.photo === 'https://img.example/stirfry.jpg' && JPEG.test(saved.thumb), 'saved with its copy');

  // ---- COOK shows the copy
  await p.click('[data-ml="edit"]');
  await p.click('[data-ml="edit"]'); await p.click('[data-mlcard="m-pic1"]');
  await p.click('[data-mlcook="m-pic1"]'); await p.waitForSelector('.ml-cookhead');
  assert.ok(JPEG.test(await p.getAttribute('.ml-cookhead img', 'src')));

  // ---- nothing was ever asked of a recipe site
  assert.deepStrictEqual(outside.filter(u => /img\.example/.test(u)), [], 'no image from a recipe site: ' + outside.join(' '));
  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await mode('reset=1&seed=1');
  console.log('RECIPE PHOTOS: copies made in the background and kept, not asked again, a pasted link, COOK, no site images: ok');
})().catch(e => { console.error(e); process.exit(1); });
