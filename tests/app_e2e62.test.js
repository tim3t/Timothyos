// HOLODECK, commercial breaks (2.52): one Commercials folder for every channel, BREAKS on or off per channel. A break
// (1 or 2 commercials) follows each episode; anything over 3 minutes is skipped; during a break there's no credit and
// the guide shows one COMMERCIAL BREAK row with its length. The breaks are computed from the clock, so a reload shows
// the same guide. Simulated relay; invented files. Lengths are rewritten after measuring so episodes and commercials
// are long enough to land inside a break.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const rows = p => p.$$eval('#hdGuide .hd-slot', a => a.map(e => e.innerText.replace(/\s+/g, ' ').trim()));

(async () => {
  await fetch(R + '/__reset'); await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Commercials'));
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const visual = async () => { await p.waitForSelector('[data-screen="holodeck"].nav'); await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd-ads'); };
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: Date.now() - 3600e3 }, { id: 2, name: 'Test Network', dir: '/Video/Test Network', premiere: Date.now() - 3600e3, style: 'network' }], ch: 1, look: 'clean', muted: true })); }, [K, R]);
  await p.reload(); await visual();

  // no folder yet: BREAKS can't be turned on
  assert.ok((await txt(p, '.hd-ads')).includes('No folder yet'));
  assert.ok(await p.$eval('[data-hdbrk="1"]', e => e.disabled), 'BREAKS waits for a folder');

  // choose the folder: it isn't a channel, and the picker says what it holds
  await p.click('[data-hd="adpick"]'); await p.click('[data-hdpick="/Video/Commercials"]');
  await p.waitForSelector('[data-hd="useads"]');
  assert.ok((await txt(p, '[data-hd="useads"]')).includes('USE FOR COMMERCIALS · 4 VIDEOS'));
  await p.click('[data-hd="useads"]');
  await p.waitForFunction(() => /1 over 3 min, skipped/.test(document.querySelector('.hd-ads').innerText) && /3 can air/.test(document.querySelector('.hd-ads').innerText), null, { timeout: 30000 });
  assert.ok((await txt(p, '.hd-ads')).includes('/Video/Commercials 4 commercials'));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).ads), '/Video/Commercials');
  assert.ok(!(await p.$$eval('.hd-chan', a => a.length === 3)), 'still two channels');

  // BREAKS on for channel 1
  await p.click('[data-hdbrk="1"]');
  assert.strictEqual(await p.getAttribute('[data-hdbrk="1"]', 'aria-pressed'), 'true');
  assert.strictEqual(await p.getAttribute('[data-hdbrk="2"]', 'aria-pressed'), 'false', 'per channel');
  await p.waitForFunction(() => /commercial breaks/.test((document.getElementById('hdInfo1') || {}).innerText || ''));

  // every length in: episodes become 10 minutes and the short commercials 2:50, so "now" can be inside a break
  await p.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'), a = JSON.parse(localStorage.getItem('tos.holoadlen.v1') || '{}'), n = pre => Object.keys(l).filter(k => k.startsWith(pre) && l[k].s > 0).length;
    return n('/Video/Test Channel/') >= 3 && n('/Video/Test Network/') >= 8 && Object.values(a).filter(x => x.s > 0).length === 4; }, null, { timeout: 60000 });
  // 2.52.1: commercials' lengths are kept apart, under short keys, so thousands of singles never crowd out the episodes
  assert.ok(!(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(k => k.startsWith('/Video/Commercials/')))));
  assert.ok(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).every(k => k.length < 16 && !k.includes('/'))));
  await p.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('tos.hololen.v1'));
    Object.keys(l).forEach(k => { if (/^\/Video\/Test (Channel|Network)\//.test(k)) l[k].s = 600; });
    localStorage.setItem('tos.hololen.v1', JSON.stringify(l));
    const a = JSON.parse(localStorage.getItem('tos.holoadlen.v1')); Object.values(a).forEach(x => { if (x.s < 100) x.s = 170; });   // the 185 s one stays too long
    localStorage.setItem('tos.holoadlen.v1', JSON.stringify(a));
    const c = JSON.parse(localStorage.getItem('tos.holo.v1')); c.chans[0].premiere = Date.now() - 610e3; c.chans[1].breaks = true; localStorage.setItem('tos.holo.v1', JSON.stringify(c));
  });
  await p.reload(); await visual();

  // 10 s into the first break: one row for the whole break, with its length; the episodes either side
  await p.waitForFunction(() => /COMMERCIAL BREAK/.test((document.getElementById('hdGuide') || {}).innerText || ''), null, { timeout: 30000 });
  let g = await rows(p);
  assert.strictEqual(g.length, 4, g.join(' | '));
  assert.ok(/^NOW COMMERCIAL BREAK 0:1\d of (2:50|5:40)/.test(g[0]), g[0]);
  assert.ok(!/COMMERCIAL/.test(g[1]) && /10:00$/.test(g[1]), g[1]);
  assert.ok(/COMMERCIAL BREAK (2:50|5:40)$/.test(g[2]), g[2]);
  assert.ok(!/COMMERCIAL/.test(g[3]), g[3]);
  assert.ok(!/Long Infomercial|Fizzy|Moon Mops|Pocket Rocket/.test(g.join(' ')), 'a break never names its commercials');

  // on air in the break: the commercial plays, no credit, no UP NEXT; LIVE and the bug stay
  await p.click('#hdTune');
  await p.waitForFunction(() => /LIVE/.test((document.getElementById('hdLive') || {}).innerText || ''));
  assert.ok(/\/Video\/Commercials\//.test(decodeURIComponent(await p.$eval('#hdVideo', v => v.getAttribute('src')))));
  assert.ok(!/Long%20Infomercial/.test(await p.$eval('#hdVideo', v => v.getAttribute('src'))), 'over 3 minutes never airs');
  await p.waitForTimeout(1200);
  assert.ok(await p.$eval('#hdCredit', e => e.hidden), 'no credit for a commercial');
  assert.ok(await p.$eval('#hdUpNext', e => e.hidden));
  assert.ok((await txt(p, '.hd-bug')).startsWith('HOLODECK'));

  // NETWORK with breaks: a break after every 10-minute episode, so the guide alternates
  await p.click('[data-hd="tune"]');   // off
  await p.click('[data-hdch="2"]');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4);
  g = await rows(p);
  const brk = g.map(r => /COMMERCIAL BREAK/.test(r));
  assert.ok(brk.filter(Boolean).length === 2 && brk[0] !== brk[1] && brk[1] !== brk[2] && brk[2] !== brk[3], g.join(' | '));
  const later = g.slice(1).map(r => r.slice(0, 5));

  // from the clock: the same guide after a reload
  await p.reload(); await visual();
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4);
  assert.deepStrictEqual((await rows(p)).slice(1).map(r => r.slice(0, 5)), later);

  // a length measured under 2.52.0 (kept with the episodes) moves to the commercials' own store
  const na = await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1')); l['/Video/Commercials/Older One.webm'] = { s: 5, z: 1 }; localStorage.setItem('tos.hololen.v1', JSON.stringify(l)); return Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).length; });
  await p.reload(); await visual();
  assert.ok(await p.evaluate(n => !Object.keys(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(k => k.startsWith('/Video/Commercials/')) && Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).length === n + 1, na));

  // BREAKS off: channel 2's guide has no breaks
  await p.click('[data-hdbrk="2"]');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4 && !/COMMERCIAL/.test(document.getElementById('hdGuide').innerText));

  // CLEAR: no folder, BREAKS waits again; the channels' own setting is kept
  await p.click('[data-hd="adclear"]');
  assert.ok((await txt(p, '.hd-ads')).includes('No folder yet'));
  assert.ok(await p.$eval('[data-hdbrk="1"]', e => e.disabled));
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')));
  assert.strictEqual(cfg.ads, ''); assert.strictEqual(cfg.chans[0].breaks, true);
  await p.click('[data-hdch="1"]');
  await p.waitForFunction(() => document.querySelectorAll('#hdGuide .hd-slot').length === 4 && !/COMMERCIAL/.test(document.getElementById('hdGuide').innerText));
  assert.ok((await txt(p, '#hdInfo1')).includes('breaks on, no commercials folder yet'));

  await fetch(R + '/__reset');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await fetch(R + '/__reset').catch(() => {}); console.error(e); process.exit(1); });
