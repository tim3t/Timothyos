// MEAL LIBRARY AND PHOTOS (2.76, bridge 1.44; simulated bridge :8105, invented meals). Forty-one meals: the library
// shows 24 rows (a small picture, the name, kind and when last made) and SHOW ALL for the rest; search finds a name or an
// ingredient; a kind narrows it; A TO Z orders it; the choices are kept. A meal typed by hand gets a photo from the
// camera or the library: cropped square, 160 px, JPEG, sent as thumb; the row shows it; REMOVE goes back to the
// initials; a bad image link is refused. A night planned from a search clears the search. LOG's picker is the same
// library. Phone width.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const post = b => fetch(U, { method: 'POST', body: JSON.stringify(Object.assign({ key: K }, b)) }).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date());
const lastPost = async act => (await mode('')).posts.filter(x => x[0] === act).pop();

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const kinds = ['Beef + Pork', 'Chicken', 'Fish', 'Meatless', 'Breakfast', 'Other'];
  for (let i = 1; i <= 36; i++) {
    const r = await post({ action: 'mealsave', meal: { id: 'm-x' + i, name: 'Test meal ' + String(i).padStart(2, '0'), kind: kinds[i % 6], ing: [{ n: i === 7 ? 'Saffron' : 'Rice', a: 'Pantry', have: false }], recipe: '', photo: '', notes: '', retired: false } });
    assert.ok(r.ok, JSON.stringify(r));
  }
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(TODAY + 'T12:00:00-06:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals'])); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-row', { timeout: 15000 });

  // ---- 41 meals: 24 rows, then SHOW ALL
  assert.strictEqual(await txt(p, '.ml-cards h3'), 'MEAL LIBRARY');
  assert.strictEqual(await p.$$eval('.ml-cards .ml-row', e => e.length), 24);
  assert.ok((await txt(p, '.ml-more')).includes('24 of 41') && (await txt(p, '.ml-more')).includes('SHOW ALL 41'), await txt(p, '.ml-more'));
  assert.strictEqual(await p.$$eval('.ml-row i.ml-pic', e => e.length), 24, 'no photo: the initials');
  assert.strictEqual(await p.getAttribute('[data-mlcard="m-tacos"] .ml-pic', 'data-ini'), 'ST');
  await p.click('[data-ml="all"]');
  assert.strictEqual(await p.$$eval('.ml-cards .ml-row', e => e.length), 41);

  // ---- search: a name, an ingredient; narrowed in place, the box keeps its focus
  await p.fill('#mlFind', 'meal 1');
  const want = Array.from({ length: 36 }, (_, i) => 'Test meal ' + String(i + 1).padStart(2, '0')).filter(n => n.slice(10).includes('1'));   // every word found: 01, 10 to 19, 21, 31
  assert.deepStrictEqual(await p.$$eval('.ml-row b', e => e.map(x => x.textContent).sort()), want);
  assert.strictEqual(await p.evaluate(() => document.activeElement && document.activeElement.id), 'mlFind');
  await p.fill('#mlFind', 'saffron');
  assert.deepStrictEqual(await p.$$eval('.ml-row b', e => e.map(x => x.textContent)), ['Test meal 07']);
  await p.fill('#mlFind', 'nothing like this');
  assert.ok((await txt(p, '#mlRows')).includes('No meal matches'));
  await p.fill('#mlFind', '');

  // ---- a kind, and an order; kept
  await p.click('[data-mlkindf="Fish"]');
  const fish = await p.$$eval('.ml-row small', e => e.map(x => x.textContent));
  assert.ok(fish.length === 7 && fish.every(x => x.startsWith('FISH')), fish.join(' | '));
  await p.click('[data-mllsort="name"]');
  assert.strictEqual(await p.$eval('.ml-row b', e => e.textContent), 'Sample fish');
  assert.deepStrictEqual(await p.evaluate(() => { const v = JSON.parse(localStorage.getItem('tos.mealview.v1')); return [v.kind, v.lsort]; }), ['Fish', 'name']);
  await p.click('[data-mlkindf=""]'); await p.click('[data-mllsort="last"]');

  // ---- a meal typed by hand, with a photo from the iPad
  await p.click('[data-ml="new"]');
  await p.fill('#mlName', 'Grilled cheese and tomato soup'); await p.click('[data-mlkind="Meatless"]');
  assert.strictEqual(await p.getAttribute('.ml-photo .ml-pic.lg', 'data-ini'), 'GC');
  await p.fill('.ml-ingn >> nth=0', 'Bread');
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#fff'; x.fillRect(200, 100, 200, 200); return c.toDataURL('image/png').split(',')[1]; });
  await p.setInputFiles('#mlThumbFile', { name: 'dinner.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await p.waitForSelector('.ml-photo img.ml-pic.lg');
  const pic = await p.$eval('.ml-photo img.ml-pic.lg', i => new Promise(r => { const go = () => r([i.src.slice(0, 23), i.naturalWidth, i.naturalHeight]); i.complete ? go() : i.onload = go; }));
  assert.deepStrictEqual(pic, ['data:image/jpeg;base64,', 160, 160], 'cropped square, 160 px, JPEG');
  assert.strictEqual(await p.inputValue('#mlName'), 'Grilled cheese and tomato soup', 'typing kept');
  assert.ok((await txt(p, '.ml-photo')).includes('A DIFFERENT PHOTO') && (await txt(p, '.ml-photo')).includes('REMOVE'));
  await (await p.$('.ml-form')).screenshot({ path: 'out/e85-photo.png' });
  await p.click('[data-ml="save"]');
  const saved = (await until(async () => { const x = await lastPost('mealsave'); return x && x[1].name === 'Grilled cheese and tomato soup' && x; }))[1];
  assert.ok(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(saved.thumb) && saved.thumb.length <= 15000, String(saved.thumb).slice(0, 40) + ' ' + String(saved.thumb).length);
  assert.ok(await p.$(`.ml-row[data-mlcard="${saved.id}"] img.ml-pic`), 'the row shows it');

  // ---- edit: REMOVE goes back to the initials; a bad image link is refused
  await p.click('[data-ml="edit"]'); await p.click(`[data-mlcard="${saved.id}"]`);
  assert.ok(await p.$('.ml-photo img.ml-pic.lg'));
  await p.click('[data-ml="thumbrm"]');
  assert.strictEqual(await p.getAttribute('.ml-photo .ml-pic.lg', 'data-ini'), 'GC');
  await p.fill('#mlPhotoUrl', 'http://images.example/x.jpg'); await p.click('[data-ml="save"]');
  assert.ok((await txt(p, '.ml-form')).includes('The image link should start with https://'));
  await p.fill('#mlPhotoUrl', ''); await p.click('[data-ml="save"]');
  await until(async () => { const x = await lastPost('mealsave'); return x[1].id === saved.id && x[1].thumb === '' && x[1].photo === ''; });
  await p.click('[data-ml="edit"]');

  // ---- a night planned from a search; the search clears
  await p.click('[data-ml="wknext"]');
  const open = await p.$$eval('.ml-days .ml-day.open', e => e.map(x => x.dataset.mlday));
  await p.click(`.ml-day[data-mlday="${open[0]}"]`);
  await p.fill('#mlFind', 'grilled');
  assert.strictEqual(await p.$$eval('.ml-row', e => e.length), 1);
  await p.click(`[data-mlcard="${saved.id}"]`);
  assert.deepStrictEqual((await until(async () => { const x = await lastPost('dinnerset'); return x && x[1].date === open[0] && x; }))[1], { date: open[0], status: 'planned', kind: 'meal', meal: saved.id });
  assert.strictEqual(await p.inputValue('#mlFind'), '');
  assert.strictEqual(await p.$$eval('.ml-cards .ml-row', e => e.length), 42, 'back to the whole library (SHOW ALL still on)');
  await p.click('[data-ml="unsel"]');
  await p.screenshot({ path: 'out/e85-library.png' });

  // ---- LOG: the picker is the same library
  await p.click('[data-mltab="log"]');
  const blank = await p.$eval('.ml-cal .ml-day.blank', e => e.dataset.mlday);
  await p.click(`.ml-cal [data-mlday="${blank}"]`);
  assert.ok(await p.$('.ml-pick #mlFind') && await p.$('.ml-pick [data-ml="all"]'));
  await p.fill('#mlFind', 'saffron'); await p.click('.ml-pick [data-mlcard="m-x7"]');
  assert.deepStrictEqual((await until(async () => { const x = await lastPost('dinnerset'); return x[1].date === blank && x; }))[1], { date: blank, status: 'eaten', kind: 'meal', meal: 'm-x7' });

  // ---- phone width
  await p.click('[data-mltab="plan"]');
  await p.setViewportSize({ width: 400, height: 860 });
  await p.waitForTimeout(200);
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'fits at 400 px: ' + w);
  await p.screenshot({ path: 'out/e85-narrow.png', fullPage: true });

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await mode('reset=1&seed=1');
  console.log('MEAL LIBRARY: 24 then all, search, kind, order, a hand photo, remove, plan from a search, LOG, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
