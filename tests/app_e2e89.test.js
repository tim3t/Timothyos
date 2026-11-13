// ON THIS DAY (2.81, bridge 1.48, D80; simulated bridge :8105 and weather archive, every item invented). Under the
// Bridge's columns: a card for each past year with something (last year on the date itself; two years back only in the
// week around it, marked THAT WEEK; four years back), each with that day's weather (one archive request per year,
// rounded coordinates), its first three items and "+ N MORE". A card opens the year's sheet: every source grouped, the
// week's items with their days, year tabs. OPEN THIS DAY IN LOG on every year (says nothing of an entry): the PIN, then that
// day; leaving LOG forgets it. Kept for the day (a reload asks nothing again). A day
// with nothing: no panel.
// COMMANDS finds it. Phone width.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=otdmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date()), Y1 = (+TODAY.slice(0, 4) - 1) + TODAY.slice(4);

(async () => {
  await mode('cap=1&empty=0&reset=1&logday=' + (TODAY.slice(5) === '02-29' ? Y1.slice(0, 5) + '02-28' : Y1));
  const b = await chromium.launch(); const errs = [], wx = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await lane(ctx);
  await ctx.route(/archive-api\.open-meteo\.com/, r => { wx.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ daily: { time: ['x'], temperature_2m_max: [41.2], temperature_2m_min: [27.6], precipitation_sum: [0.1] } }) }); });
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');
    localStorage.setItem('tos.place.v1', JSON.stringify({ lat: 41.9, lon: -87.6 })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'log'])); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload();
  await p.waitForSelector('.otd .otd-yr', { timeout: 20000 });

  // ---- the panel: three years, nearest first
  assert.ok((await txt(p, '.otd .phead')).startsWith('ON THIS DAY') && /3 YEARS · TAP ONE/.test(await txt(p, '.otd .phead')), await txt(p, '.otd .phead'));
  const heads = await p.$$eval('.otd-yr .otd-yh b', l => l.map(x => x.textContent));
  assert.deepStrictEqual(heads, ['A YEAR AGO', '2 YEARS AGO', '4 YEARS AGO']);
  await until(async () => (await p.$$eval('.otd-yr .otd-wx', l => l.length)) === 3);
  const c1 = await txt(p, '.otd-yr >> nth=0'), c2 = await txt(p, '.otd-yr >> nth=1'), c4 = await txt(p, '.otd-yr >> nth=2');
  assert.ok(/41°F \/ 28°F · 0\.1 in rain · FROST/.test(c1), 'the day\'s weather, frost at 32°F or under: ' + c1);
  assert.ok(/FARM Sample hay delivery, 10:00/.test(c1) && /PERSONAL Sample dentist, 15:30/.test(c1) && /TASKS DONE 3 finished: Clean the gutters/.test(c1) && /\+ 3 MORE/.test(c1), c1);
  assert.ok(!/Sample white chili/.test(c1), 'three items on the card; the rest in the sheet');
  assert.ok(/THAT WEEK/.test(c2) && /GROWTH Sample woodworking class, 18:00/.test(c2) && /BOOK Finished The Sample Orchard · 4 stars/.test(c2) && /THE REVIEW Went well/.test(c2), c2);
  assert.ok(/FAMILY Sample school concert, 14:00/.test(c4) && /TAROT The Star, in Weekly spread/.test(c4), c4);
  assert.ok(!/\bLOG\b/.test(await txt(p, '.otd')), 'nothing about the Log');
  assert.strictEqual(wx.length, 3, 'one weather request per year shown');
  assert.ok(wx.every(u => /latitude=41\.9&longitude=-87\.6/.test(u)), 'only the rounded coordinates');
  assert.ok(wx.some(u => u.includes('start_date=' + Y1 + '&end_date=' + Y1)), wx.join(' '));
  await p.screenshot({ path: 'out/e89-panel.png' });

  // ---- a year's sheet
  await p.click('.otd-yr >> nth=0'); await p.waitForSelector('#detailSheet.otd-sheet');
  let sh = await txt(p, '#detailSheet');
  assert.ok(/◆ ON THIS DAY A YEAR AGO/.test(sh) && /WEATHER 41°F/.test(sh), sh);
  for (const want of ['FARM Sample hay delivery, 10:00', 'PERSONAL Sample dentist, 15:30', 'TASKS DONE 3 finished: Clean the gutters · Order winter feed · Swap the furnace filter', 'DINNER Sample white chili',
    'HIVE CHECK Hive One: Winter wrap on', 'HABITS Walk · Water 2.5 L · Meditation missed', 'Nothing here goes to ASK or the briefing'])
    assert.ok(sh.includes(want), 'the sheet has "' + want + '": ' + sh);
  assert.strictEqual(await p.$$eval('#detailSheet [data-otd]', l => l.length), 3, 'year tabs');
  await p.click('#detailSheet [data-otd="1"]');
  sh = await txt(p, '#detailSheet');
  assert.ok(/THE WEEK AROUND/.test(sh) && /three days either side/.test(sh) && /GROWTH [A-Z]{3} \d+ Sample woodworking class/.test(sh) && /THE REVIEW Went well: The garden beds/.test(sh), sh);
  await p.screenshot({ path: 'out/e89-sheet.png' });
  assert.ok(await p.$('#detailSheet [data-otdlog]'), 'OPEN THIS DAY IN LOG on a year with no entry too: it says nothing about the Log');
  await p.click('#detailClose');

  // ---- OPEN THIS DAY IN LOG: the PIN as always, then that day
  await p.click('.otd-yr >> nth=0'); await p.waitForSelector('#detailSheet [data-otdlog]');
  const day = await p.getAttribute('#detailSheet [data-otdlog]', 'data-otdlog');
  assert.strictEqual(day, TODAY.slice(5) === '02-29' ? Y1.slice(0, 5) + '02-28' : Y1);
  await p.click('#detailSheet [data-otdlog]');
  await p.waitForSelector('[data-lpin="1"]'); await p.waitForSelector('#detailScrim', { state: 'hidden' }); await p.screenshot({ path: 'out/e89-pin.png' });
  assert.ok(/^THEN OPENS [A-Z]{3} \d+ [A-Z]{3} \d{4}$/.test(await txt(p, '.cl-want')), await txt(p, '.cl-want'));
  assert.strictEqual(await p.$('[id^="clText-"]'), null, 'locked: nothing of the entry');
  for (const k of '135790') await p.click('[data-lpin="' + k + '"]');
  await until(async () => (await p.$$eval('[id^="clText-"]', l => l.map(x => x.value).join(' '))).includes('A sample entry.'));
  const head = +day.slice(8, 10) + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+day.slice(5, 7) - 1] + ' ' + day.slice(0, 4);
  assert.ok((await txt(p, '#content')).includes(head + ' ·'), 'that day is open: ' + head);
  // leaving LOG forgets the request: the next visit opens today
  await p.click('.elbow'); await p.waitForSelector('.otd .otd-yr');
  await p.click('[data-screen="log"].nav'); await p.waitForSelector('[data-lpin="1"]');
  assert.strictEqual(await p.$('.cl-want'), null);
  await p.click('.elbow'); await p.waitForSelector('.otd .otd-yr');

  // ---- kept for the day: a reload asks the bridge and the archive nothing
  const reads = (await mode('')).reads, wx0 = wx.length;
  await p.reload(); await p.waitForSelector('.otd .otd-yr', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  assert.strictEqual((await mode('')).reads, reads, 'no second onthisday read');
  assert.strictEqual(wx.length, wx0, 'no second weather request');

  // ---- COPY DIAGNOSTICS says what it read (2.81.2): counts and years, never a title
  const diag = async () => { await p.evaluate(() => navigator.clipboard.writeText('')); await p.click('#cmdBtn'); await p.fill('#cmdText', 'diagnostics'); await p.keyboard.press('Enter');
    const r = await until(async () => { const t = await p.evaluate(() => navigator.clipboard.readText()); return t.startsWith('TimothyOS DIAGNOSTICS') && t; }); return r.split('\n').find(l => l.startsWith('ON THIS DAY ')) || ''; };
  let dl = await diag();
  assert.ok(/^ON THIS DAY read \d\d:\d\d for 5 years · 3 with something \(\d{4}, \d{4} week, \d{4}\) · weather 3 of 3 · no problems$/.test(dl), dl);
  assert.ok(!/Sample/.test(dl));

  // ---- COMMANDS finds it
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'on this day');
  assert.ok((await txt(p, '#cmdList')).includes('On this day'));
  await p.keyboard.press('Enter'); await p.waitForSelector('#detailSheet.otd-sheet');
  await p.click('#detailClose');

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.waitForTimeout(200);
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'fits at 400 px: ' + w);
  await (await p.$('.otd')).screenshot({ path: 'out/e89-narrow.png' });

  // ---- a day with nothing in any year: no panel
  await mode('empty=1');
  await p.evaluate(() => localStorage.removeItem('tos.otd.v1'));
  await p.reload(); await p.waitForSelector('.rb-cols', { timeout: 15000 });
  await until(async () => (await mode('')).reads > reads);
  await new Promise(r => setTimeout(r, 600));
  assert.strictEqual(await p.$('.otd'), null, 'nothing to show: no panel');
  dl = await diag();
  assert.ok(/^ON THIS DAY read \d\d:\d\d for 5 years · 0 with something, so no panel · no problems$/.test(dl), dl);

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await mode('cap=0&empty=0&reset=1');
  console.log('ON THIS DAY: three years, weather, sheet and week, kept for the day, COMMANDS, narrow, empty: ok');
})().catch(e => { console.error(e); process.exit(1); });
