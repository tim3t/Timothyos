// ARBORETUM (2.71, D67; simulated bridge :8103, its lane's, only for the link). Timothy's design from the 2026-11-08 mockups, built
// empty: the map (home, Zones 1 to 3 as ripples, the Pond, the Meadow), a zone zoomed in with any number of beds, pots
// and plots per side in their real order (his example: four raised beds behind the house, three on the left with pots
// between), the pond in depth bands, plantings, jobs through the year with typical ones offered, QUICK GLANCE by season
// with ticks that belong to this turn of the season, the garden's name, COMPUTER, and the narrow screen.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8103/macros/s/test/exec';   // its lane's own simulated bridge (2.72: on :8105 it set off e50's schema-call count in another lane)

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-08T10:00:00-06:00'));   // late autumn
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');   // the shared simulated bridge: no briefing
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'arboretum']));
  }, [K, U]);
  await p.reload(); await p.waitForTimeout(1200);
  const store = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.arb.v1') || 'null'));
  const txt = s => p.innerText(s);
  const names = side => p.$$eval('.arb-strip.s-' + side + ' .arb-it', l => l.map(x => x.getAttribute('aria-label').split(',')[0]));

  // ---- the map, empty
  await p.click('[data-screen="arboretum"].nav');
  await p.waitForSelector('.arb-map');
  assert.strictEqual(await txt('#title'), 'ARBORETUM');
  assert.ok(/THE GARDEN · LATE AUTUMN/.test(await txt('#eyebrow')), 'season from the date: ' + await txt('#eyebrow'));
  assert.strictEqual(await p.$$eval('.arb-zrow', l => l.length), 5, 'five zones');
  assert.strictEqual(await p.$$eval('.arb-zrow', l => l.filter(x => /Nothing added yet/.test(x.innerText)).length), 5, 'a blank slate');
  assert.strictEqual(await p.$$eval('.arb-g', l => l.length), 0);
  assert.ok(/LATE AUTUMN · 0 JOBS TO DO/.test(await txt('.arb-seas')));
  assert.ok(await p.$('.arb-pond') && await p.$('.arb-meadow') && await p.$('.arb-ring.z1') && await p.$('.arb-home'), 'pond, meadow, ripples, home');
  await p.screenshot({ path: 'out/e83-map-empty.png' });

  // ---- the garden's name (Timothy's to type)
  await p.fill('#arbGName', 'Test Garden'); await p.press('#arbGName', 'Enter');
  assert.strictEqual((await store()).name, 'Test Garden');
  assert.ok(/TEST GARDEN · LATE AUTUMN/.test(await txt('#eyebrow')));

  // ---- Zone 1 from the map: four raised beds behind, three on the left with pots between
  await p.click('.arb-ring.z1');
  await p.waitForSelector('.arb-zone.ring');
  assert.strictEqual(await txt('#title'), 'ZONE 1');
  assert.strictEqual(await p.$$eval('.arb-strip', l => l.length), 4, 'BACK LEFT RIGHT FRONT');
  for (let i = 0; i < 4; i++) await p.click('[data-arbadd="BACK"]');
  assert.deepStrictEqual(await names('back'), ['Raised bed 1', 'Raised bed 2', 'Raised bed 3', 'Raised bed 4']);
  assert.ok(await p.$('#arbName'), 'a new bed opens for editing');
  const add = async (kind, side) => { await p.click('[data-arbdone]'); await p.click('[data-arbak="' + kind + '"]'); await p.click('[data-arbadd="' + side + '"]'); };
  await add('RAISED', 'LEFT'); await add('POTS', 'LEFT'); await add('RAISED', 'LEFT'); await add('POTS', 'LEFT'); await add('RAISED', 'LEFT');
  assert.deepStrictEqual(await names('left'), ['Raised bed 5', 'Pot 1', 'Raised bed 6', 'Pot 2', 'Raised bed 7']);
  assert.strictEqual(await p.$$eval('.arb-strip.s-left .arb-it.v', l => l.length), 5, 'the sides run top to bottom');
  assert.strictEqual(await p.innerText('[data-arbadd="LEFT"]'), '+ RAISED BED');

  // ---- one bed: name, plantings, jobs, typical jobs
  const left = await p.$$('.arb-strip.s-left .arb-it');
  await left[2].click();
  assert.ok(/ZONE 1 · LEFT · 3 OF 5/.test(await txt('.arb-ed')));
  await p.fill('#arbName', 'Rose bed'); await p.press('#arbName', 'Enter');
  await p.fill('#arbPlant', 'Climbing rose'); await p.press('#arbPlant', 'Enter');
  await p.fill('#arbPlant', 'Lavender'); await p.click('[data-arbpadd]');
  let it = (await store()).items.find(x => x.name === 'Rose bed');
  assert.deepStrictEqual(it.plants, ['Climbing rose', 'Lavender']);
  assert.strictEqual(await p.$eval('#arbPlant', x => x.value), '', 'the box clears for the next plant');
  const tipText = await txt('.arb-tips');
  assert.ok(/WINTER Prune the roses/.test(tipText) && /SUMMER Trim the lavender/.test(tipText) && /Top up the bed with compost/.test(tipText), tipText);
  await p.click('.arb-tip:has-text("Prune the roses")');
  await p.click('[data-arbjs="AUTUMN"]'); await p.fill('#arbJob', 'Mulch the roses'); await p.click('[data-arbjadd]');
  it = (await store()).items.find(x => x.name === 'Rose bed');
  assert.deepStrictEqual(it.jobs.map(j => j.s + ' ' + j.t), ['WINTER Prune the roses', 'AUTUMN Mulch the roses']);
  assert.strictEqual(it.jobs[0].n, 'Late winter, as the buds swell');
  assert.ok(!/Prune the roses/.test(await txt('.arb-tips')), 'a job already added is not offered again');

  // ---- order along the side, then another side
  await p.click('[data-arbmove="1"]');
  assert.deepStrictEqual(await names('left'), ['Raised bed 5', 'Pot 1', 'Pot 2', 'Rose bed', 'Raised bed 7']);
  await p.click('[data-arbside="FRONT"]');
  assert.deepStrictEqual(await names('front'), ['Rose bed']);
  assert.deepStrictEqual(await names('left'), ['Raised bed 5', 'Pot 1', 'Pot 2', 'Raised bed 7']);
  assert.ok(await p.$('[data-arbmove="-1"][disabled]') && await p.$('[data-arbmove="1"][disabled]'), 'alone on its side');

  // ---- kind, then remove (two taps)
  await p.click('.arb-strip.s-left .arb-it.k-pots >> nth=0');
  await p.click('[data-arbkind="BORDER"]');
  assert.ok(await p.$('.arb-strip.s-left .arb-it.k-border.v'), 'a border, drawn along the side');
  await p.click('[data-arbkind="POTS"]');
  await p.click('.arb-strip.s-left .arb-it >> nth=3');
  await p.click('[data-arbdel]');
  assert.ok(/TAP AGAIN TO REMOVE/.test(await txt('.arb-ed')));
  await p.click('[data-arbdel]');
  assert.deepStrictEqual(await names('left'), ['Raised bed 5', 'Pot 1', 'Pot 2']);
  await p.screenshot({ path: 'out/e83-zone1.png' });

  // ---- back on the map: the beds show on their sides, the season's job counts
  await p.click('.arb-top [data-arbv="map"] >> nth=-1');
  await p.waitForSelector('.arb-map');
  assert.strictEqual(await p.$$eval('.arb-g', l => l.length), 8, '4 back, 3 left, 1 front');
  const z1 = await txt('.arb-zrow[data-arbz="z1"]');
  assert.ok(/6 beds · 2 pots · 2 plantings/.test(z1) && /1 TO DO/.test(z1), z1);
  assert.ok(/LATE AUTUMN · 1 JOB TO DO/.test(await txt('.arb-seas')) && /Mulch the roses, Zone 1/.test(await txt('.arb-seas')));

  // ---- the pond in depth bands
  await p.click('.arb-pond');
  await p.waitForSelector('.arb-zone.pond');
  assert.strictEqual(await txt('#title'), 'THE POND');
  assert.strictEqual(await p.$$eval('.arb-band.b0 .arb-band.b1 .arb-band.b2 .arb-band.b3', l => l.length), 1, 'bank, margin, shelf, deep, one inside the next');
  assert.strictEqual(await p.innerText('[data-arbadd="DEEP"]'), '+ DEEP WATER');
  await p.click('[data-arbadd="DEEP"]');
  await p.fill('#arbPlant', 'Water lily'); await p.press('#arbPlant', 'Enter');
  assert.ok(/SPRING Divide the water lilies/.test(await txt('.arb-tips')) && /AUTUMN Net the pond against leaves/.test(await txt('.arb-tips')));
  await p.click('.arb-tip:has-text("Net the pond")');
  await p.click('[data-arbdone]');

  // ---- QUICK GLANCE: this season, a zone, ticks for this turn of the season
  await p.click('[data-arbv="glance"]');
  await p.waitForSelector('.arb-mini');
  assert.ok(await p.$('[data-arbgs="AUTUMN"][aria-pressed="true"]'));
  assert.strictEqual(await p.innerText('[data-arbgs="AUTUMN"]'), 'AUTUMN · NOW');
  assert.deepStrictEqual(await p.$$eval('.arb-card b', l => l.map(x => x.innerText)), ['Mulch the roses', 'Net the pond against leaves']);
  await p.click('.arb-card:has-text("Mulch the roses")');
  assert.deepStrictEqual(await p.$$eval('.arb-card', l => l.map(x => x.querySelector('b').innerText + (x.classList.contains('done') ? ' ✓' : ''))), ['Net the pond against leaves', 'Mulch the roses ✓'], 'done goes last');
  let S = await store(); const mulch = S.items.flatMap(i => i.jobs).find(j => j.t === 'Mulch the roses');
  assert.strictEqual(S.done[mulch.id], 'AUTUMN-2026');
  await p.click('[data-arbgz="pond"]');
  assert.deepStrictEqual(await p.$$eval('.arb-card b', l => l.map(x => x.innerText)), ['Net the pond against leaves']);
  await p.click('[data-arbgz="all"]');
  await p.click('[data-arbgs="WINTER"]');
  assert.deepStrictEqual(await p.$$eval('.arb-card b', l => l.map(x => x.innerText)), ['Prune the roses']);
  await p.click('.arb-card'); S = await store();
  assert.strictEqual(S.done[S.items.flatMap(i => i.jobs).find(j => j.t === 'Prune the roses').id], 'WINTER-2027', 'a winter is named for its January');
  await p.click('[data-arbgs="SUMMER"]');
  assert.ok(/No summer jobs yet/.test(await txt('.arb-gmain')));
  await p.click('[data-arbgs="AUTUMN"]');
  await p.screenshot({ path: 'out/e83-glance.png' });

  // ---- a new turn of the season: last autumn's tick no longer counts
  await p.clock.setFixedTime(new Date('2027-09-10T10:00:00-05:00'));
  await p.click('[data-arbgs="SPRING"]'); await p.click('[data-arbgs="AUTUMN"]');
  assert.strictEqual(await p.$$eval('.arb-card.done', l => l.length), 0, 'autumn 2027 starts fresh');
  await p.clock.setFixedTime(new Date('2026-11-08T10:00:00-06:00'));

  // ---- it all comes back after a reload; tapping ARBORETUM again goes to the map
  await p.reload(); await p.waitForTimeout(800);
  await p.click('[data-screen="arboretum"].nav'); await p.waitForSelector('.arb-map');
  assert.strictEqual(await p.$$eval('.arb-g', l => l.length), 8);
  await p.click('.arb-zrow[data-arbz="z1"]'); await p.waitForSelector('.arb-zone.ring');
  await p.click('[data-screen="arboretum"].nav'); await p.waitForSelector('.arb-map');

  // ---- COMPUTER
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'garden jobs'); await p.press('#cmdText', 'Enter');
  await p.waitForSelector('.arb-mini');
  assert.ok(/QUICK GLANCE/.test(await txt('#eyebrow')));

  // ---- a narrow screen: nothing wider than the screen
  await p.setViewportSize({ width: 400, height: 860 });
  for (const v of ['map', 'z1', 'pond', 'glance']) {
    if (v === 'map' || v === 'glance') await p.click('[data-arbv="' + v + '"] >> nth=0');
    else { await p.click('[data-arbv="map"] >> nth=0'); await p.click('.arb-zrow[data-arbz="' + v + '"]'); await p.click('.arb-it >> nth=0'); }
    await p.waitForTimeout(150);
    const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
    assert.ok(w <= 400, v + ' fits at 400 px: ' + w);
    await p.screenshot({ path: 'out/e83-narrow-' + v + '.png', fullPage: true });
  }

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('ARBORETUM: map, zones, sides in order, pond bands, jobs, QUICK GLANCE, name, COMPUTER, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
