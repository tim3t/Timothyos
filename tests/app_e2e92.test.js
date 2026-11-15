// NO RULE FROM ELSEWHERE (B2, 2.85; mock :8105). The app's stylesheet is global, and three times a station took a class
// another screen had already styled (RESSIKAN's playing bar and TODAY's .now, 2.82.2). This opens every station from
// ALL STATIONS and asks the page whether any rule that isn't the station's own or the shared kit matches anything in it
// (lib/classguard.js). The first walk found four: WEEK's carried-over events took LOG's two-column grid (.cl), TAROT's
// reversed mark took REVIEW's grid (.rv), ASTROMETRICS' KEY DATES row took DATES' .kd, LEDGER's pull-to-refresh was the
// only unprefixed .ptr. Stations that need more than this bridge to draw (SICKBAY, ENGINEERING, APIARY, SCIENCE, INBOX,
// MEALS, ARBORETUM, HOLODECK) also call the guard in their own tests, at their fullest.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const { reachIns, STATIONS } = require('./lib/classguard');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });
  const found = {};
  for (const id of Object.keys(STATIONS)) {
    await p.click('#allBtn'); await p.click('[data-station="' + id + '"]');
    await p.waitForSelector(STATIONS[id].root.split(',').map(s => '#content ' + s.trim()).join(', '), { timeout: 10000 }); await p.waitForTimeout(400);
    const r = await reachIns(p, id); if (r.length) found[id] = r;
  }
  assert.deepStrictEqual(found, {}, 'rules from elsewhere reaching into a station');

  // the guard itself catches one: TODAY's .now placed inside RESSIKAN, as in 2.82.1
  await p.click('#allBtn'); await p.click('[data-station="ressikan"]'); await p.waitForSelector('.rs');
  await p.evaluate(() => { const x = document.createElement('span'); x.className = 'now'; x.id = 'planted'; document.querySelector('.rs').appendChild(x); });
  assert.ok((await reachIns(p, 'ressikan')).some(s => /^\.now\b/.test(s)), 'a planted .now is caught');
  await p.evaluate(() => document.getElementById('planted').remove());

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('NO RULE FROM ELSEWHERE: ' + Object.keys(STATIONS).length + ' stations walked, none reached into: ok');
})().catch(e => { console.error(e); process.exit(1); });
