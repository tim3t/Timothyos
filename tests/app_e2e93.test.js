// READS CUT SHORT AND THE DEEP STORE (2.85, bridge 1.50; mock :8105). A3: a read the bridge stopped at its row limit
// (capped: [1000], injected here into LIBRARY's answer) shows as a muted line at the foot of LIBRARY only, and in
// COPY DIAGNOSTICS as READS CUT SHORT; a whole read clears both. A4: the large saved copies live in IndexedDB, not the
// 5 MB store: after a sync the calendars' copy is in the deep store under this browser's mark, and LIBRARY opens from
// it after a reload with the bridge out of reach; a copy left in the 5 MB store by an older version moves in on start (and leaves); a
// cleared 5 MB store makes the deep store's old records count for nothing; SYSTEMS says what the deep store holds and
// CLEAR SAVED COPIES empties it; a browser without IndexedDB carries on with everything in the 5 MB store.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const deep = require('./lib/deep');
const assert = require('assert');
const until = require('./lib/explain').until(15000, 150);
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const ls = (p, k) => p.evaluate(x => localStorage.getItem(x), k);

async function start(b, noIdb) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  await lane(ctx);
  if (noIdb) await ctx.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  const state = { cut: false, down: false };
  await ctx.route(new RegExp('127\\.0\\.0\\.1:' + P8105 + '/macros'), async route => {
    if (state.down) return route.abort('internetdisconnected');   // the bridge out of reach; the app's own files still load
    if (!state.cut) return route.continue();
    const body = JSON.parse(route.request().postData() || '{}'), res = await route.fetch(), j = await res.json();
    if (body.action === 'batch') { const calls = typeof body.calls === 'string' ? JSON.parse(body.calls) : body.calls; calls.forEach((c, i) => { if (c.action === 'library' && j.results && j.results[i]) j.results[i].capped = [1000]; }); }
    if (body.action === 'library') j.capped = [1000];
    return route.fulfill({ response: res, json: j });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });
  return { ctx, p, errs, state };
}
const openLibrary = async p => { await p.click('#allBtn'); await p.click('[data-station="library"]'); await p.waitForSelector('#content .lb'); };
const refresh = async p => { await p.click('#status'); await p.waitForSelector('#refreshBtn:not([disabled])', { timeout: 30000 }); await p.click('#refreshBtn'); await p.waitForSelector('#refreshBtn:not([disabled])', { timeout: 30000 }); };

(async () => {
  const b = await chromium.launch();
  const { ctx, p, errs, state } = await start(b);

  // ---- A4: the calendars' copy is in the deep store, under this browser's mark, and not in the 5 MB store
  const mark = await ls(p, 'tos.deep.v1');
  assert.ok(mark && mark.length > 6, 'a mark: ' + mark);
  await until(async () => (await ls(p, 'tos.cache.v1')) === null && !!(await deep.read(p, 'tos.cache.v1')), 8000, 'the calendars copy in the deep store');
  assert.ok(JSON.parse(await deep.read(p, 'tos.cache.v1')).bridgeVersion, 'the copy is whole');

  // ---- A3: LIBRARY's read cut short at 1,000 rows
  state.cut = true;
  await refresh(p);
  await until(async () => /"library":\{"rows":1000/.test(await ls(p, 'tos.capped.v1') || ''), 15000, 'LIBRARY noted as cut short');
  await openLibrary(p);
  await p.waitForSelector('#cutNote');
  assert.ok(/first 1,000 rows for this screen and stopped at its limit/.test(await txt(p, '#cutNote')), await txt(p, '#cutNote'));
  assert.ok(await p.$eval('#cutNote', e => e.classList.contains('muted') && e.parentElement.id === 'content' && !e.nextElementSibling), 'muted, at the foot of the station');
  await p.click('#allBtn'); await p.click('[data-station="tarot"]'); await p.waitForSelector('#content .tr');
  assert.strictEqual(await p.$('#cutNote'), null, 'only on the station it belongs to');
  await p.click('#status'); await p.waitForSelector('#sec-diag');
  await p.evaluate(() => navigator.clipboard.writeText(''));
  await p.click('[data-act="diagcopy"]');
  const diag = await until(async () => p.evaluate(() => navigator.clipboard.readText()), 5000, 'the diagnostics on the clipboard');
  assert.ok(/READS CUT SHORT library at 1000 rows, since /.test(diag), diag.split('\n').find(l => /READS/.test(l)));
  assert.ok(/deep store [\d.]+ MB in \d+ copies/.test(diag), diag.split('\n').find(l => /^STORAGE/.test(l)));

  // ---- a whole read clears it
  state.cut = false;
  await refresh(p);
  await until(async () => !/"library"/.test(await ls(p, 'tos.capped.v1') || ''), 15000, 'LIBRARY no longer cut short');
  await openLibrary(p);
  assert.strictEqual(await p.$('#cutNote'), null, 'gone once a read comes back whole');

  // ---- SYSTEMS: the deep store, by name
  await p.click('#status'); await p.waitForSelector('#sec-store');
  const sec = await txt(p, '#sec-store');
  assert.ok(/DEEP STORE [\d.]+ MB meal photos, calendars, health days/.test(sec) && /Calendars [\d.]+ MB/.test(sec), sec);
  assert.ok(!/LAST WRITE REFUSED/.test(sec), sec);

  // ---- the bridge out of reach, after a reload: LIBRARY opens from the deep store's copy
  state.down = true;
  await p.reload(); await p.waitForSelector('#status');
  await openLibrary(p);
  assert.ok((await txt(p, '#content')).includes('The Quiet Orchard'), 'books from the deep store, with the bridge out of reach');

  // ---- an older version's copy in the 5 MB store moves in on start, and leaves the 5 MB store
  const lib = JSON.parse(await deep.read(p, 'tos.library.v1'));
  lib.books[0].title = 'Sample Moved Orchard';
  await p.evaluate(v => localStorage.setItem('tos.library.v1', v), JSON.stringify(lib));
  await p.reload(); await p.waitForSelector('#status');
  await openLibrary(p);
  assert.ok((await txt(p, '#content')).includes('Sample Moved Orchard'), 'the 5 MB store\'s copy (newer) wins on the move');
  await until(async () => (await ls(p, 'tos.library.v1')) === null, 5000, 'the moved copy to leave the 5 MB store');
  assert.ok((await deep.read(p, 'tos.library.v1')).includes('Sample Moved Orchard'), 'and the deep store has it');

  // ---- the 5 MB store cleared: the deep store's records no longer count
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#status');
  await openLibrary(p);
  assert.ok(!(await txt(p, '#content')).includes('Sample Moved Orchard'), 'old records ignored after the 5 MB store was cleared');
  assert.notStrictEqual(await ls(p, 'tos.deep.v1'), mark, 'a new mark');
  assert.strictEqual(await deep.read(p, 'tos.library.v1'), null, 'and the old record cleared');
  state.down = false;

  // ---- CLEAR SAVED COPIES empties the deep store too
  await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });
  await until(async () => !!(await deep.read(p, 'tos.cache.v1')), 8000, 'a fresh calendars copy');
  state.down = true;   // nothing refills them while we look
  await p.click('#status'); await p.waitForSelector('#sec-store');
  await p.click('#sec-store [data-act="storeclear"]');
  assert.strictEqual(await deep.read(p, 'tos.cache.v1'), null, 'cleared from the deep store');
  state.down = false;
  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await ctx.close();

  // ---- no IndexedDB: everything in the 5 MB store, as before
  const n = await start(b, true);
  await until(async () => !!(await ls(n.p, 'tos.cache.v1')), 8000, 'the calendars copy in the 5 MB store');
  assert.strictEqual(await ls(n.p, 'tos.deep.v1'), null, 'no mark without a deep store');
  await n.p.click('#status'); await n.p.waitForSelector('#sec-store');
  assert.ok(/DEEP STORE Not available in this browser/.test(await txt(n.p, '#sec-store')), await txt(n.p, '#sec-store'));
  console.log('errors', JSON.stringify(n.errs));
  assert.deepStrictEqual(n.errs, []);

  await b.close();
  console.log('READS CUT SHORT AND THE DEEP STORE: noted, shown, cleared; copies in IndexedDB, moved, marked, cleared, and none: ok');
})().catch(e => { console.error(e); process.exit(1); });
