// FAMILY CALENDAR and the WEEK all-day strip (2.67, bridge 1.42; simulated bridge :8105, invented events only). The Family
// calendar, once the bridge lists it, is its own area (pale pink), read-only: on TODAY (a hide toggle), WEEK, MONTH and in
// SYSTEMS; never offered to CAPTURE; ASK's snapshot names it. WEEK draws a multi-day all-day event as one bar across its days,
// cut square where it runs past the week, and the bar opens the event. Unlinked, SYSTEMS shows FAMILY OFF with how to link it.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const fam = q => fetch(B + '&action=familymode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=stats').then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

(async () => {
  // the trip: this week's Friday to Monday (as the simulated bridge makes it)
  const today = new Date(ymdIn(new Date()) + 'T12:00:00'), wd = (today.getDay() + 6) % 7, fri = new Date(today); fri.setDate(today.getDate() - wd + 4);
  const mon = new Date(fri); mon.setDate(fri.getDate() + 3);
  const p2 = n => String(n).padStart(2, '0');
  const label = p2(fri.getDate()) + (fri.getMonth() === mon.getMonth() ? '' : ' ' + MON[fri.getMonth()]) + ' to ' + p2(mon.getDate()) + ' ' + MON[mon.getMonth()];

  await fam('on=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('today'));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'month'])); }, [K, U]);
  await p.reload(); await p.waitForTimeout(2000);

  // ---- not linked: SYSTEMS says how
  await p.click('#status'); await p.waitForSelector('.calrow.a-family');
  assert.ok(/FAMILY Optional, read-only: add FAMILY_CALENDAR_ID in the bridge's Script Properties \(README → Family calendar\)\. OFF/.test(await txt(p, '.calrow.a-family')));

  // ---- linked
  await fam('on=1');
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k === "tos.cache.v1") localStorage.removeItem(k); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('#status'); await until(async () => /FAMILY Family OK/.test(await txt(p, '.calrow.a-family')));
  assert.ok(/WORK \+ FAMILY READ-ONLY · /.test(await txt(p, '.sys')), 'read-only, like Work');
  assert.strictEqual(await p.$eval('.calrow.a-family', e => getComputedStyle(e).getPropertyValue('--c').trim()), '#ffd0e8');

  // ---- WEEK: the trip is one bar over Friday to Sunday, cut square on the right; the concert on Wednesday
  await p.click('[data-screen="week"].nav'); await p.waitForSelector('.wkads');
  const bar = await p.$$eval('.wkspan.a-family', n => n.map(x => ({ t: x.textContent, col: x.style.gridColumn.replace(/\s/g, ''), cr: x.classList.contains('cr'), cl: x.classList.contains('cl') })));
  console.log('this week:', JSON.stringify(bar));
  assert.deepStrictEqual(bar, [{ t: 'Sample trip' + label, col: '5/8', cr: true, cl: false }]);
  const w = await p.$eval('.wkspan.a-family', e => e.getBoundingClientRect().width), col = await p.$eval('.wkh', e => e.getBoundingClientRect().width);
  assert.ok(w > col * 2.7, 'one bar across three days: ' + w + ' vs a day ' + col);
  assert.ok(await p.$('.wkcol .wkb.a-family'), 'the concert is a timed block');
  await p.click('.wkspan.a-family'); await p.waitForSelector('#detailScrim:not([hidden])');
  const sheet = await txt(p, '#detailSheet');
  assert.ok(/Sample trip/.test(sheet) && /READ-ONLY/.test(sheet), sheet.slice(0, 200));
  await p.click('#detailClose');
  // next week: the Monday piece, cut square on the left
  await p.click('#nextBtn');
  const nx = () => p.$$eval('.wkspan.a-family', n => n.map(x => [x.style.gridColumn.replace(/\s/g, ''), x.classList.contains('cl'), x.classList.contains('cr')]));
  try { await until(async () => (await nx()).length, 8000); } catch (e) { /* the assert shows it */ }
  assert.deepStrictEqual(await nx(), [['1/2', true, false]]);
  await p.click('#prevBtn');
  // lanes: the bars never overlap
  const boxes = await p.$$eval('.wkads > *', n => n.map(x => { const r = x.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }));
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(c => assert.ok(a[1] <= c[0] + 1 || c[1] <= a[0] + 1 || a[3] <= c[2] + 1 || c[3] <= a[2] + 1, 'no overlap')));

  // ---- TODAY: a FAMILY toggle; hiding it hides the trip everywhere
  await p.click('[data-screen="today"].nav'); await p.waitForSelector('[data-toggle="family"]');
  await p.click('[data-toggle="family"]');
  await p.click('[data-screen="week"].nav'); await p.waitForSelector('.wk');
  assert.strictEqual(await p.locator('.wkspan.a-family').count(), 0, 'hidden on WEEK');
  await p.click('[data-screen="today"].nav'); await p.click('[data-toggle="family"]');

  // ---- MONTH shows it
  await p.click('[data-screen="month"].nav'); await p.waitForTimeout(500);
  assert.ok((await txt(p, '#content')).includes('Sample trip'), 'on MONTH');

  // ---- CAPTURE never offers Family
  await p.click('#capBtn'); await p.waitForTimeout(400);
  assert.ok(!/FAMILY/.test(await p.$eval('#capForm', f => f.textContent)), 'not a capture target');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- ASK's snapshot names it
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(400);
  await p.click('#askBtn'); await p.waitForSelector('#askText');
  await p.fill('#askText', 'What is the family up to?'); await p.click('#askSend');
  const a = await until(async () => (await stats()).asks.filter(x => x.last === 'What is the family up to?').pop());
  assert.ok(/FAMILY · Sample trip/.test(a.ctx), 'the trip in the snapshot');
  await p.keyboard.press('Escape');

  // ---- portrait: the strip still fits its columns
  await p.setViewportSize({ width: 820, height: 1180 });
  await p.click('[data-screen="week"].nav'); await p.waitForSelector('.wkads');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways page scroll');

  await b.close();
  await fam('on=0');
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  console.log('ok app_e2e81');
})().catch(e => { console.error(e); process.exit(1); });
