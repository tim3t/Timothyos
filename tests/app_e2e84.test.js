// SICKBAY (2.74, bridge 1.43; simulated on :8106, every value invented). VITALS: readiness, yesterday's activity,
// six measures with their normal, a measure's 7/30/90-day chart. The Bridge's Condition says "Take it easy" when
// resting heart rate is up two mornings, and "No health data" when the last send is three days old. SLEEP: four
// stage lanes and the week, a night picked. RECORDS: a medicine added, ticked (supply down, REFILL), unticked,
// removed in two taps; a reading; a note added and removed; the dentist from the Personal calendar. SYSTEMS: the
// section, the health key, SHARE WITH ASK. Phone width. Runs on the real date: the simulated days are relative to it.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8106/macros/s/test/exec', CTL = 'http://127.0.0.1:8106/?action=';
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  await fetch(CTL + 'skreset');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await quiet(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'sickbay'])); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
  }, [K, U]);
  await p.reload(); await settled(p, 1500);
  const txt = s => p.innerText(s);

  // ---- the Bridge: resting heart rate up two mornings
  await until(async () => /Take it easy/.test(await txt('#content')), 15000);
  assert.ok(/Resting heart rate 66 and 67/.test(await txt('#content')), 'named with the numbers');

  // ---- VITALS
  await p.click('[data-screen="sickbay"].nav'); await p.waitForSelector('.sk-tile');
  assert.strictEqual(await txt('#title'), 'SICKBAY');
  assert.ok(/SICKBAY · FROM HEALTH/.test(await txt('#eyebrow')), await txt('#eyebrow'));
  assert.ok(await p.$('[data-sktab="vitals"][aria-pressed="true"]'));
  assert.strictEqual(await p.$$eval('.sk-tile', l => l.length), 6);
  const ready = await txt('.sk-ready');
  assert.ok(/READINESS/.test(ready) && /\d+/.test(ready) && /A guide, not a diagnosis/.test(ready) && /resting heart rate up/.test(ready), ready);
  assert.ok(/MOVE/.test(await txt('.sk-today')) && /of 500 kcal/.test(await txt('.sk-today')));
  const rhrTile = await txt('[data-skm="rhr"]');
  assert.ok(/67/.test(rhrTile) && /▲ ABOVE NORMAL/.test(rhrTile), rhrTile);
  assert.ok(await p.$('[data-skm="hrv"][aria-pressed="true"]'), 'heart rate variability first');
  await p.click('[data-skm="rhr"]');
  assert.ok(/RESTING HEART RATE/.test(await txt('.sk-detail')) && /Your normal: 57 to 59 bpm/.test(await txt('.sk-detail')), await txt('.sk-detail'));
  await p.click('[data-skrange="90"]');
  assert.strictEqual(await p.$$eval('.sk-chart .sk-bars i', l => l.length), 90);
  assert.strictEqual(await p.$$eval('.sk-chart .sk-bars i.sk-none', l => l.length), 49, 'days before the data are empty bars');
  assert.ok(await p.$('.sk-chart .sk-band'), 'the normal band');
  assert.ok(await p.$('[data-skact="sync"]'), 'SYNC FROM HEALTH');
  await p.screenshot({ path: 'out/e84-vitals.png' });

  // ---- SLEEP
  await p.click('[data-sktab="sleep"]'); await p.waitForSelector('.sk-lane');
  assert.deepStrictEqual(await p.$$eval('.sk-lane > span:first-child', l => l.map(x => x.textContent)), ['AWAKE', 'REM', 'CORE', 'DEEP']);
  assert.ok(await p.$$eval('.sk-lt i', l => l.length) >= 5, 'the night drawn in spells');
  assert.strictEqual(await p.$$eval('.sk-night', l => l.length), 7);
  assert.ok(await p.$('.sk-night:last-child[aria-pressed="true"]'), 'last night first');
  const firstNight = await p.getAttribute('.sk-night >> nth=0', 'data-sknight');
  await p.click('.sk-night >> nth=0');
  assert.ok(await p.$('.sk-night:first-of-type[aria-pressed="true"]'));
  const side = await txt('.sk-side');
  assert.ok(/In bed/.test(side) && /Deep/.test(side) && /Wrist temperature/.test(side), side);
  assert.ok(firstNight);
  await p.screenshot({ path: 'out/e84-sleep.png' });

  // ---- RECORDS
  await p.click('[data-sktab="records"]'); await p.waitForSelector('.sk-grid');
  await until(async () => /Dentist cleaning/.test(await txt('.sk-grid')));
  assert.ok(/IN 5 DAYS/.test(await txt('.sk-appt')), await txt('.sk-appt'));
  await p.click('[data-skform="med"]');
  await p.fill('#skMedName', 'Sample vitamin'); await p.fill('#skMedWhen', 'Morning'); await p.fill('#skMedLeft', '8');
  await p.click('[data-sksave="med"]');
  await until(async () => (await (await fetch(CTL + 'skstats')).json()).items.some(i => i.name === 'Sample vitamin'));
  assert.ok(/Sample vitamin/.test(await txt('.sk-med')) && /8 LEFT/.test(await txt('.sk-med')));
  await p.click('[data-sktake]');
  assert.ok(/▲ REFILL · 7 LEFT/.test(await txt('.sk-med')), await txt('.sk-med'));
  assert.ok(await p.$('[data-sktake][aria-pressed="true"]'));
  await until(async () => { const s = await (await fetch(CTL + 'skstats')).json(); const m = s.items.find(i => i.name === 'Sample vitamin'); return m && m.data.left === 7 && m.data.taken.length === 1; });
  await p.click('[data-sktake]');
  assert.ok(/8 LEFT/.test(await txt('.sk-med')) && !/REFILL/.test(await txt('.sk-med')), 'untick gives it back');
  await p.click('[data-skform="read"]'); await p.fill('#skRdVal', '121/79'); await p.click('[data-sksave="read"]');
  assert.ok(/BLOOD PRESSURE/.test(await txt('.sk-read')) && /121\/79/.test(await txt('.sk-read')), await txt('.sk-read'));
  await p.click('[data-skform="note"]'); await p.fill('#skNote', 'Felt rested after a long walk'); await p.click('[data-sktag="GOOD"]'); await p.click('[data-sksave="note"]');
  assert.ok(/Felt rested after a long walk/.test(await txt('.sk-note')) && /GOOD/.test(await txt('.sk-note')));
  await p.click('.sk-note [data-skdel]'); assert.ok(await p.$('.sk-note .sk-x.armed'), 'asks first');
  await p.click('.sk-note [data-skdel]');
  assert.strictEqual(await p.$$eval('.sk-note', l => l.length), 0);
  await p.click('[data-skedit]'); await p.waitForSelector('#skMedName');
  assert.strictEqual(await p.inputValue('#skMedName'), 'Sample vitamin');
  await p.click('.sk-form [data-skdel]'); assert.ok(/TAP AGAIN TO REMOVE/.test(await txt('.sk-form')));
  await p.click('.sk-form [data-skdel]');
  await until(async () => !(await (await fetch(CTL + 'skstats')).json()).items.some(i => i.kind === 'medicine'));
  assert.ok(/Nothing yet/.test(await txt('.sk-grid')));
  await p.screenshot({ path: 'out/e84-records.png' });

  // ---- SYSTEMS: the section, the health key, SHARE WITH ASK
  await p.click('#status'); await p.waitForSelector('[data-aisick]');
  const sec = await p.evaluate(() => [...document.querySelectorAll('section')].map(s => s.innerText).find(t => /🩺 Sickbay/.test(t)) || '');
  assert.ok(/SICKBAY/.test(sec) && /41 days/.test(sec) && /Health key/.test(sec) && /SET/.test(sec), sec);
  await p.click('[data-aisick="1"]');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.aisickbay.v1')), 'true');
  await p.click('[data-aisick="0"]');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.aisickbay.v1')), null);

  // ---- nothing new from Health for three days: Condition says so
  await fetch(CTL + 'skmode&stale=1');
  await p.evaluate(() => localStorage.removeItem('tos.sickbay.v1'));
  await p.reload(); await settled(p, 1200);
  await p.click('.elbow[data-screen="bridge"]');
  await until(async () => /No health data for 3 days/.test(await txt('#content')), 15000).catch(async e => { console.log('BRIDGE TEXT:', (await txt('#content')).slice(0, 600)); console.log('SCREEN', await p.evaluate(() => document.querySelector('#title').textContent), 'ERRS', JSON.stringify(errs), 'CACHE', await p.evaluate(() => (localStorage.getItem('tos.sickbay.v1') || 'none').slice(0, 120)), 'Q', await p.evaluate(() => localStorage.getItem('tos.sickbayq.v1'))); throw e; });
  await fetch(CTL + 'skmode&stale=0');

  // ---- phone width: nothing wider than the screen, on every tab
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('[data-screen="sickbay"].nav').catch(async () => { await p.click('#allBtn'); await p.click('#launch [data-screen="sickbay"]'); });
  await p.waitForSelector('.sk-top');
  for (const tab of ['vitals', 'sleep', 'records']) {
    await p.click('[data-sktab="' + tab + '"]'); await p.waitForTimeout(200);
    const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
    assert.ok(w <= 400, tab + ' fits at 400 px: ' + w);
    await p.screenshot({ path: 'out/e84-narrow-' + tab + '.png', fullPage: true });
  }

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('SICKBAY: vitals, condition, sleep, records, systems, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
