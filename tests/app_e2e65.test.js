// PROFILE SYNC AND UPKEEP IN NOTION (2.54, bridge 1.36; simulated on :8105, relay on RELAY_PORT, every setting
// invented): two iPads, each its own browser. HUB names itself (the top bar says so) and turns sync on: its settings
// become the profile, and keys, tokens and drafts never go. MOBILE, with settings of its own, joins: the differences
// are listed, MERGE combines the channel lists and the ignored events, takes HUB's pins and its resume point, and
// reloads saying where the settings came from. SYNC NOW on HUB brings MOBILE's channel across. A row switched off
// stays on that iPad. AUDIO on MOBILE starts where HUB stopped and says so. Upkeep made on HUB goes to Notion, shows
// on MOBILE, and MARK DONE there reaches HUB. HOLODECK asks for a missing channel folder once, not on every redraw.
// Phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const prof = q => fetch(B + '&action=profmode&' + q).then(r => r.json());
const upk = q => fetch(B + '&action=upkmode&' + q).then(r => r.json());
const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const EP = '/Podcasts/Show A/ep 1.wav';
const systems = async p => { await p.click('#status'); await p.waitForSelector('#sec-sync'); };
const station = async (p, st) => { await p.click('#allBtn'); await p.click('[data-station="' + st + '"]'); };   // the pins came from HUB: open stations from ALL STATIONS
const audio = async p => { await station(p, 'holodeck'); await p.waitForSelector('[data-hdprog="audio"]'); await p.click('[data-hdprog="audio"]'); await p.waitForFunction(() => !document.querySelector('.hd-arch')); };

(async () => {
  await prof('cap=1&reset=1'); await upk('cap=1&reset=1');
  const b = await chromium.launch(); const errs = [];
  const now = Date.now();
  const HUB = {
    'tos.holo.v1': { chans: [{ id: 1, name: 'Sample Alpha', dir: '/Video/Sample Alpha', premiere: 1 }], ch: 1, look: 'crt', muted: false, ads: '' },
    'tos.plays.v1': { [EP]: { p: 41, d: 90, done: false, at: now - 60000, by: 'HUB' } },
    'tos.ignore.v1': ['Sample block A'],
    'tos.pins.v1': ['today', 'week'],
    'tos.upkeep.v1': [{ id: 'uS1', name: 'Sample filter', cat: 'home', every: 3, unit: 'months', last: '2026-09-01', hist: [] }],
    'tos.nas.v1': { url: R, token: 'relay-test-token' },
    'tos.ldraft.v1': { '2026-10-22': 'Private sample journal words' },
    'tos.engtab.v1': 'upkeep'
  };
  const MOB = {
    'tos.holo.v1': { chans: [{ id: 1, name: 'Sample Beta', dir: '/Video/Sample Beta', premiere: 2 }], ch: 1, look: 'clean', muted: false, ads: '' },
    'tos.ignore.v1': ['Sample block B'],
    'tos.pins.v1': ['today'],
    'tos.nas.v1': { url: R, token: 'relay-test-token' },
    'tos.engtab.v1': 'upkeep'
  };
  const open = async (data, w) => {
    const ctx = await b.newContext({ viewport: { width: w || 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.lists = 0; p.on('request', r => { if (r.url().includes('/Video/Sample')) p.lists++; });   // the channels' folders aren't on the relay
    await p.goto('http://localhost:8080/');
    await p.evaluate(([k, u, d]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); Object.keys(d).forEach(x => localStorage.setItem(x, JSON.stringify(d[x]))); }, [K, U, data]);
    await p.reload(); await p.waitForSelector('#content > *', { timeout: 15000 }); await p.waitForTimeout(1200);
    return p;
  };
  const h = await open(HUB), m = await open(MOB);

  // ---- HUB: off until named; the name goes on the top bar; turned on, its settings become the profile
  await systems(h);
  assert.ok((await txt(h, '#sec-sync')).includes('OFF'), await txt(h, '#sec-sync'));
  assert.ok(await h.$eval('[data-pf="on"]', e => e.disabled), 'TURN ON waits for a name');
  await h.click('[data-pfname="HUB"]');
  assert.ok((await txt(h, '.topbar')).includes('· HUB'), await txt(h, '.topbar'));
  await h.waitForFunction(() => !document.querySelector('[data-pf="on"]').disabled);
  await h.click('[data-pf="on"]');
  let P = await until(async () => { const x = await prof(''); return x.items['tos.holo.v1'] && x; });
  assert.deepStrictEqual(P.items['tos.holo.v1'].v.chans.map(c => c.name), ['Sample Alpha']);
  assert.strictEqual(P.items['tos.holo.v1'].by, 'HUB');
  assert.ok(P.items['tos.plays.v1'].v[EP].p === 41 && P.items['tos.ignore.v1'] && P.items['tos.pins.v1'], Object.keys(P.items).join(', '));
  const sent = JSON.stringify(P.items) + JSON.stringify(P.puts);
  ['tos.nas.v1', 'tos.conn.v1', 'tos.ldraft.v1', 'tos.profile.v1', 'tos.upkeep.v1'].forEach(k => assert.ok(!sent.includes(k), k + ' is never part of the profile'));
  assert.ok(!sent.includes('relay-test-token') && !sent.includes(K) && !sent.includes('Private sample journal'), 'no token, key or draft text sent');
  await h.waitForFunction(() => /IN SYNC/.test(document.getElementById('sec-sync').textContent));
  const hs = await txt(h, '#sec-sync');
  assert.ok(hs.includes('HOLODECK') && hs.includes('ALL SYNCED') && hs.includes('STAYS ON THIS IPAD') && hs.includes('IN NOTION'), hs);
  await h.screenshot({ path: D + 'e65-hub-systems.png', fullPage: true });

  // ---- Upkeep: HUB's item went to Notion when the bridge offered Upkeep
  await until(async () => (await upk('')).items.some(x => x.id === 'uS1'));

  // ---- MOBILE joins: the differences, three choices, MERGE
  await systems(m);
  await m.click('[data-pfname="MOBILE"]');
  await m.waitForFunction(() => !document.querySelector('[data-pf="on"]').disabled);
  await m.click('[data-pf="on"]');
  await m.waitForSelector('.pf-modal');
  const jt = await txt(m, '.pf-modal');
  assert.ok(jt.includes('MOBILE JOINS PROFILE SYNC') && jt.includes('HUB already keeps its profile'), jt);
  assert.ok(jt.includes('CHANNELS · DIFFERENT') && jt.includes('AUDIO · 1 RESUME POINT DIFFERS') && jt.includes('PINS · DIFFERENT'), jt);
  assert.ok(jt.includes("USE HUB'S") && jt.includes("USE THIS IPAD'S") && jt.includes('MERGE AND SYNC'), jt);
  assert.strictEqual(await m.$eval('[data-pfpick="merge"]', e => e.getAttribute('aria-checked')), 'true', 'MERGE is the default');
  await m.click('[data-pfpick="cloud"]');
  assert.ok((await txt(m, '[data-pf="join"]')).includes("USE HUB'S AND SYNC"));
  await m.click('[data-pfpick="merge"]');
  await m.screenshot({ path: D + 'e65-mobile-join.png' });
  await Promise.all([m.waitForNavigation({ timeout: 15000 }), m.click('[data-pf="join"]')]);
  await m.waitForSelector('#content > *', { timeout: 15000 });
  await m.waitForFunction(() => /Updated from HUB/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  const mh = await ls(m, 'tos.holo.v1');
  assert.deepStrictEqual(mh.chans.map(c => c.dir).sort(), ['/Video/Sample Alpha', '/Video/Sample Beta'], 'both iPads\' channels');
  assert.strictEqual(new Set(mh.chans.map(c => c.id)).size, 2, 'each keeps its own id');
  assert.deepStrictEqual((await ls(m, 'tos.ignore.v1')).sort(), ['Sample block A', 'Sample block B']);
  assert.deepStrictEqual(await ls(m, 'tos.pins.v1'), ['today', 'week'], 'HUB\'s pins');
  assert.strictEqual((await ls(m, 'tos.plays.v1'))[EP].p, 41);
  assert.ok((await txt(m, '.topbar')).includes('· MOBILE'));
  P = await until(async () => { const x = await prof(''); return x.items['tos.holo.v1'].v.chans.length === 2 && x; });
  assert.strictEqual(P.items['tos.holo.v1'].by, 'MOBILE', 'the combined list went up');

  // ---- HUB: SYNC NOW brings MOBILE's channel across, and says where it came from
  await Promise.all([h.waitForNavigation({ timeout: 15000 }), h.click('[data-pf="sync"]')]);
  await h.waitForFunction(() => /Updated from MOBILE/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  assert.strictEqual((await ls(h, 'tos.holo.v1')).chans.length, 2);
  assert.deepStrictEqual((await ls(h, 'tos.ignore.v1')).sort(), ['Sample block A', 'Sample block B']);

  // ---- a row switched off on MOBILE stays there
  await systems(m);
  await m.click('[data-pfrow="ignore"]');
  assert.strictEqual(await m.$eval('[data-pfrow="ignore"]', e => e.getAttribute('aria-checked')), 'false');
  assert.ok((await txt(m, '#sec-sync')).includes('STAYS ON THIS IPAD'));
  await m.fill('#ignIn', 'Sample block B'); await m.click('[data-act="ignsave"]');
  await systems(h);
  await h.fill('#ignIn', 'Sample block A\nSample block C'); await h.click('[data-act="ignsave"]');
  await until(async () => (await prof('')).items['tos.ignore.v1'].v.includes('Sample block C'));
  assert.ok(!(await prof('')).items['tos.ignore.v1'].v.every(x => x === 'Sample block B'), 'MOBILE\'s own list did not go up');
  await m.click('[data-pf="sync"]'); await m.waitForTimeout(1500);
  assert.deepStrictEqual(await ls(m, 'tos.ignore.v1'), ['Sample block B'], 'and HUB\'s change did not come in');

  // ---- AUDIO on MOBILE starts where HUB stopped
  await audio(m);
  await m.waitForTimeout(1500);
  assert.ok(m.lists <= 6, 'a channel whose folder is missing is asked for once, not on every redraw (2.54): ' + m.lists);
  await m.click('.nas-share >> text=PODCASTS'); await m.waitForSelector('.nas-row');
  await m.click('.nas-row >> text=Show A'); await m.waitForSelector('[data-nasplay]');
  await m.click('[data-nasplay="' + EP + '"]');
  await m.waitForFunction(() => /Picked up from HUB at 0:41/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
  await m.waitForTimeout(400);
  const t = await m.evaluate(() => document.getElementById('nasAudio').currentTime);
  assert.ok(t >= 40, 'playing from 0:41: ' + t);
  await m.click('#nasBar [data-nas="toggle"]'); await m.waitForTimeout(300);

  // ---- Upkeep: in Notion, on MOBILE; MARK DONE there reaches HUB
  await station(m, 'engineering'); await m.waitForSelector('[data-updone="uS1"]');
  assert.ok((await txt(m, '#content')).includes('Sample filter'));
  await m.click('[data-updone="uS1"]'); await m.waitForTimeout(500);
  if (await m.isVisible('.up-early')) await m.click('[data-updoneforce]');   /* 2.73: not due yet (this test runs on the real date), so it asks first */
  const today = await m.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  await until(async () => (await upk('')).items.some(x => x.id === 'uS1' && x.last === today));
  await h.reload(); await h.waitForSelector('#content > *', { timeout: 15000 }); await h.waitForTimeout(1200);
  await station(h, 'engineering'); await h.waitForSelector('[data-updone="uS1"]');
  await until(async () => ((await ls(h, 'tos.upkeep.v1')) || []).some(x => x.id === 'uS1' && x.last === today));
  assert.strictEqual((await ls(h, 'tos.upkeepq.v1')).ops.length, 0, 'nothing left to send');

  // ---- pause on MOBILE: nothing goes up
  await systems(m);
  await m.click('[data-pf="pause"]');
  assert.ok((await txt(m, '#sec-sync')).includes('PAUSED ON THIS IPAD'));
  const n = (await prof('')).puts.length;
  await m.fill('#ignIn', 'Sample block D'); await m.click('[data-act="ignsave"]');
  await m.click('[data-pfrow="ignore"]'); await m.waitForTimeout(5000);
  assert.strictEqual((await prof('')).puts.length, n, 'paused: nothing sent');

  // ---- phone width
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(300);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(over <= 1, 'no sideways scroll at phone width: ' + over);
  await m.screenshot({ path: D + 'e65-mobile-phone.png', fullPage: true });

  assert.deepStrictEqual(errs, []);
  await b.close();
  await prof('cap=0&reset=1'); await upk('cap=0&reset=1');
  console.log('e2e65 profile sync and upkeep: OK');
})().catch(async e => { console.error(e); await prof('cap=0&reset=1').catch(() => {}); await upk('cap=0&reset=1').catch(() => {}); process.exit(1); });
