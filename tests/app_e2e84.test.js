// SICKBAY (2.74, bridge 1.43; 2.80, bridge 1.47; simulated on :8106, every value invented). VITALS: readiness (naming the
// night it reads), the last 7 days' activity rings and their GOALS, six measures each at its latest value and day, a
// measure's 7/14/30-day chart whose bars open a day. DAYS: the arrival banner, 14 days marked arrived, partial, waiting or
// missed, a day's arrival stamp, rings, night and every measure (no weight), EARLIER and LATER. The Bridge's Condition says "Take it easy" when
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
  assert.ok(/READINESS · THIS MORNING/.test(ready), 'last night is in: this morning');
  assert.ok(/ACTIVITY · THE LAST 7 DAYS/.test(await txt('.sk-today')) && /MOVE 500 KCAL/.test(await txt('.sk-today')), await txt('.sk-today'));
  assert.strictEqual(await p.$$eval('.sk-dayring', l => l.length), 7);
  const rhrTile = await txt('[data-skm="rhr"]');
  assert.ok(/67/.test(rhrTile) && /▲ ABOVE NORMAL/.test(rhrTile) && /TODAY/.test(rhrTile), rhrTile);
  assert.ok(/YESTERDAY|[A-Z]{3} \d+/.test(await txt('[data-skm="vo2"]')), 'cardio fitness: its latest value and the day it was measured: ' + await txt('[data-skm="vo2"]'));
  assert.ok(/ARRIVES A DAY OR TWO LATE/.test(await txt('.sk-arrive')) && /missed/.test(await txt('.sk-arrive')), await txt('.sk-arrive'));
  // GOALS: set once, kept with the view (profile sync carries it)
  await p.click('[data-skact="goals"]'); await p.fill('#skGoalMove', '400'); await p.press('#skGoalMove', 'Tab');
  await until(async () => /MOVE 400 KCAL/.test(await txt('.sk-today')));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.sickview.v1')).goals.move), 400);
  await p.click('[data-skact="goals"]');
  assert.ok(await p.$('[data-skm="hrv"][aria-pressed="true"]'), 'heart rate variability first');
  await p.click('[data-skm="rhr"]');
  assert.ok(/RESTING HEART RATE/.test(await txt('.sk-detail')) && /Your normal: 57 to 59 bpm/.test(await txt('.sk-detail')), await txt('.sk-detail'));
  assert.ok(!/average/.test(await txt('.sk-detail')), 'no averages');
  await p.click('[data-skrange="30"]');
  assert.strictEqual(await p.$$eval('.sk-chart .sk-bars button', l => l.length), 30);
  assert.strictEqual(await p.$$eval('.sk-chart .sk-bars button.sk-none', l => l.length), 1, 'the missed day is a hatched bar');
  assert.ok(await p.$('.sk-chart .sk-band'), 'the normal band');
  // a bar opens its day
  const bar = await p.getAttribute('.sk-chart .sk-bars button >> nth=20', 'data-skbar');
  await p.click('.sk-chart .sk-bars button >> nth=20');
  assert.ok(/OPEN THE DAY/.test(await txt('.sk-bartip')), await txt('.sk-bartip'));
  await p.screenshot({ path: 'out/e84-vitals.png' });
  await p.click('.sk-bartip [data-skday]');
  await p.waitForSelector('.sk-day');
  assert.ok(await p.$('[data-sktab="days"][aria-pressed="true"]'));
  assert.ok(await p.$('.sk-dchip[data-skday="' + bar + '"][aria-pressed="true"]'), 'that day, picked in the strip');

  // ---- DAYS
  const D = n => p.evaluate(n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }, n);
  assert.strictEqual(await p.$$eval('.sk-dchip', l => l.length), 14);
  const marks = await p.$$eval('.sk-dchip i', l => l.map(x => x.className.replace('sk-s-', '')));
  assert.deepStrictEqual([marks[13], marks[12], marks[5], marks[11]], ['partial', 'partial', 'missing', 'arrived'], marks.join(' '));
  await p.click('[data-sktab="days"]');
  await p.click('.sk-dchip[data-skday="' + await D(2) + '"]');
  let day = await txt('.sk-day');
  assert.ok(/2 DAYS AGO/.test(day) && /✓ ARRIVED/.test(day) && /Arrived .* 1 day later/.test(day) && /Updated .*: added steps, move, exercise and stand/.test(day), day);
  assert.ok(/MOVE/.test(day) && /of 400 kcal/.test(day) && /THE NIGHT BEFORE · SLEEP/.test(day) && /EVERY MEASURE FOR THIS DAY/.test(day), day);
  assert.deepStrictEqual(await p.$$eval('.sk-mf > span:first-child', l => l.map(x => x.textContent)), ['Resting heart rate', 'Heart rate variability', 'Breathing rate', 'Wrist temperature', 'Steps', 'Cardio fitness'], 'no weight: that is in RECORDS');
  assert.ok(/Cardio fitness 38\.2/.test(day.replace(/\s+/g, ' ')), 'measured that day (every 4th, from 2 days back)');
  await p.click('[data-skstep="-1"]');
  day = await txt('.sk-day');
  assert.ok(/3 DAYS AGO/.test(day) && /NOT MEASURED/.test(day) && /Latest: 38\.2 on/.test(day), 'a day without cardio fitness says when it last was: ' + day);
  await p.click('.sk-dchip[data-skday="' + await D(1) + '"]');
  day = await txt('.sk-day');
  assert.ok(/YESTERDAY/.test(day) && /◐ PARTIAL/.test(day) && /Still to come: steps, move, exercise and stand/.test(day) && /NOT IN YET/.test(day), day);
  await p.click('.sk-dchip[data-skday="' + await D(8) + '"]');
  assert.ok(/✕ MISSED/.test(await txt('.sk-day')) && /NOTHING ARRIVED FOR THIS DAY/.test(await txt('.sk-day')), await txt('.sk-day'));
  await p.click('.sk-dchip[data-skday="' + await D(0) + '"]');
  assert.ok(/Today is still under way/.test(await txt('.sk-day')) && await p.$('[data-skstep="1"][disabled]'), 'today: under way, nothing later');
  await p.click('.sk-dchip[data-skday="' + await D(13) + '"]');
  assert.ok(/Arrived .* 1 day later/.test(await txt('.sk-day')));
  await p.click('[data-skstep="-1"]');
  assert.ok(/Arrived before arrival times were kept/.test(await txt('.sk-day')), 'an older day');
  await p.click('.sk-dchip[data-skday="' + await D(2) + '"]');
  await p.screenshot({ path: 'out/e84-days.png' });
  // a ring on VITALS opens its day
  await p.click('[data-sktab="vitals"]'); await p.click('.sk-dayring >> nth=3');
  await p.waitForSelector('.sk-day');
  assert.ok(await p.$('.sk-dchip[data-skday="' + await D(3) + '"][aria-pressed="true"]'));
  await p.click('[data-sktab="vitals"]');
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
  await p.click('.sk-side [data-skday]'); await p.waitForSelector('.sk-day');
  assert.ok(await p.$('.sk-dchip[data-skday="' + firstNight + '"][aria-pressed="true"]'), 'the night opens its day');

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
  assert.ok(/SICKBAY/.test(sec) && /40 days/.test(sec) && /Health key/.test(sec) && /SET/.test(sec), sec);
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

  // ---- 2.80.1: days before the shortcut's first send are BEFORE SICKBAY, not missed, and the banner leaves them out
  await fetch(CTL + 'skmode&young=1');
  await p.evaluate(() => localStorage.removeItem('tos.sickbay.v1'));
  await p.reload(); await settled(p, 1200);
  await p.click('[data-screen="sickbay"].nav'); await p.click('[data-sktab="days"]'); await p.waitForSelector('.sk-strip');
  const marks2 = await p.$$eval('.sk-dchip i', l => l.map(x => x.className.replace('sk-s-', '')));
  assert.deepStrictEqual(marks2.slice(0, 9), Array(9).fill('before'), 'the 9 days before the first send: ' + marks2.join(' '));
  assert.ok(marks2.slice(9).every(m => m !== 'before' && m !== 'missing'), marks2.join(' '));
  assert.ok(/BEFORE SICKBAY/.test(await txt('.sk-key')));
  assert.ok(!/missed/.test(await txt('.sk-arrive')) && /Still coming in: .*\(partial\)/.test(await txt('.sk-arrive')), await txt('.sk-arrive'));
  await p.click('.sk-dchip >> nth=2');
  assert.ok(/BEFORE SICKBAY/.test(await txt('.sk-day')) && /first sent on/.test(await txt('.sk-day')) && /nothing is waiting/.test(await txt('.sk-day')), await txt('.sk-day'));
  await p.screenshot({ path: 'out/e84-before.png' });
  await fetch(CTL + 'skmode&young=0');
  await p.evaluate(() => localStorage.removeItem('tos.sickbay.v1'));

  // ---- phone width: nothing wider than the screen, on every tab
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('[data-screen="sickbay"].nav').catch(async () => { await p.click('#allBtn'); await p.click('#launch [data-screen="sickbay"]'); });
  await p.waitForSelector('.sk-top');
  for (const tab of ['vitals', 'sleep', 'days', 'records']) {
    await p.click('[data-sktab="' + tab + '"]'); await p.waitForTimeout(200);
    const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
    assert.ok(w <= 400, tab + ' fits at 400 px: ' + w);
    await p.screenshot({ path: 'out/e84-narrow-' + tab + '.png', fullPage: true });
  }

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('SICKBAY: vitals, rings and goals, bars to days, days (arrived, partial, missed, stamps), sleep, records, systems, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
