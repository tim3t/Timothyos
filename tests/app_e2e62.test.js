// HOLODECK, commercial breaks (2.52): one Commercials folder for every channel, BREAKS on or off per channel. A break
// (1 or 2 commercials) follows each episode; anything over 3 minutes is skipped; during a break there's no credit and
// the guide folds each break into the show before it (2.57: the show's block runs to the break's end; no commercial is named). The breaks are computed from the clock, so a reload shows
// the same guide. Simulated relay; invented files. Lengths are rewritten after measuring so episodes and commercials
// are long enough to land inside a break.
const { chromium } = require('playwright');
const { lane, P8104 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
/* 2.57: a channel's row in the guide: each block's times, what it holds, and whether it's on now */
const cells = (p, n) => p.$$eval('.hd-grow', (rs, n) => [...rs[n - 1].querySelectorAll('.hd-gc:not(.wait)')].map(c => ({ live: c.classList.contains('live'), range: c.title.split('\n')[0], what: c.title.split('\n').slice(1).join(' | ') })), n);
const mins = r => { const [a, b] = r.split('–').map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; }); return (b - a + 1440) % 1440; };
const plain = async (p, n) => { const c = await cells(p, n); return c.length >= 2 && c.every(x => mins(x.range) === 10); };

(async () => {
  await fetch(R + '/__reset'); await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Commercials'));
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  // The guide follows the clock in half-hour columns, and this test reads it twice to compare: a :00 or :30 falling
  // between the two reads moved every block (2026-11-10). The page's clock starts at :07 or :37 of this hour and runs
  // at its normal pace from there, so the whole test sits inside one half hour, on today's date as the relay expects.
  const start = new Date(); start.setMinutes(start.getMinutes() < 30 ? 7 : 37, 0, 0);
  await p.clock.install({ time: start }); await p.clock.resume();
  const visual = async () => { await p.waitForSelector('[data-screen="holodeck"].nav'); await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd-ads'); };
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:' + P8104 + '/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: Date.now() - 3600e3 }, { id: 2, name: 'Test Network', dir: '/Video/Test Network', premiere: Date.now() - 3600e3, style: 'network' }], ch: 1, look: 'clean', muted: true, copen: true })); }, [K, R]);
  await p.reload(); await visual();

  // no folder yet: BREAKS can't be turned on
  assert.ok((await txt(p, '.hd-ads')).includes('NO FOLDER YET'));
  assert.ok(await p.$eval('[data-hdbrk="1"]', e => e.disabled), 'BREAKS waits for a folder');

  // choose the folder: it isn't a channel, and the picker says what it holds
  await p.click('[data-hd="adpick"]'); await p.click('[data-hdpick="/Video/Commercials"]');
  await p.waitForSelector('[data-hd="useads"]');
  assert.ok((await txt(p, '[data-hd="useads"]')).includes('USE FOR COMMERCIALS · 4 VIDEOS'));
  await p.click('[data-hd="useads"]');
  await p.click('[data-hdopen="ads"]');   // 2.53: the row folds like a channel's
  await p.waitForFunction(() => /1 over 3 min, skipped/.test(document.querySelector('.hd-ads').innerText) && /3 can air/.test(document.querySelector('.hd-ads').innerText), null, { timeout: 30000 });
  assert.ok((await txt(p, '.hd-ads')).includes('/Video/Commercials 4 commercials'));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).ads), '/Video/Commercials');
  assert.ok(!(await p.$$eval('.hd-chan', a => a.length === 3)), 'still two channels');

  // BREAKS on for channel 1
  await p.click('[data-hdopen="1"]'); await p.click('[data-hdbrk="1"]');
  assert.strictEqual(await p.getAttribute('[data-hdbrk="1"]', 'aria-pressed'), 'true');
  assert.strictEqual(await p.getAttribute('[data-hdbrk="2"]', 'aria-pressed'), 'false', 'per channel');
  await p.waitForFunction(() => /commercial breaks/.test((document.getElementById('hdInfo1') || {}).innerText || ''));

  // every length in: episodes become 10 minutes and the short commercials 2:50, so "now" can be inside a break
  await p.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'), a = JSON.parse(localStorage.getItem('tos.holoadlen.v1') || '{}'), n = pre => Object.keys(l).filter(k => k.startsWith(pre) && l[k].s > 0).length;
    return n('/Video/Test Channel/') >= 3 && n('/Video/Test Network/') >= 8 && Object.values(a).some(x => x.s > 180); }, null, { timeout: 60000 });
  // 2.53.1: only a commercial much bigger than the rest is measured ahead (it's likely too long); the others count as 30 s until they air
  assert.ok((await txt(p, '#hdAdsInfo')).includes('the rest as they come up'), await txt(p, '#hdAdsInfo'));
  // 2.52.1: commercials' lengths are kept apart, under short keys, so thousands of singles never crowd out the episodes
  assert.ok(!(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(k => k.startsWith('/Video/Commercials/')))));
  assert.ok(await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).every(k => k.length < 16 && !k.includes('/'))));
  const short = (await (await fetch(R + '/Video/Commercials/', { headers: { Authorization: 'Bearer relay-test-token' } })).json()).filter(f => !f.is_dir && !/Long Infomercial/.test(f.name));
  await p.evaluate(short => {
    const l = JSON.parse(localStorage.getItem('tos.hololen.v1'));
    Object.keys(l).forEach(k => { if (/^\/Video\/Test (Channel|Network)\//.test(k)) l[k].s = 600; });
    localStorage.setItem('tos.hololen.v1', JSON.stringify(l));
    const a = JSON.parse(localStorage.getItem('tos.holoadlen.v1'));   // the 185 s one stays too long; the short ones become 2:50 (keys as the app makes them)
    const fnv = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }, key = q => fnv(q).toString(36) + fnv(q.split('').reverse().join('')).toString(36);
    short.forEach(f => { a[key('/Video/Commercials/' + f.name)] = { s: 170, z: f.size }; });
    localStorage.setItem('tos.holoadlen.v1', JSON.stringify(a));
    const c = JSON.parse(localStorage.getItem('tos.holo.v1')); c.chans[0].premiere = Date.now() - 610e3; c.chans[1].breaks = true; localStorage.setItem('tos.holo.v1', JSON.stringify(c));
  }, short);
  await p.reload(); await visual();

  // 10 s into the first break: the guide folds it into the episode before, which runs to the break's end; the next follows on
  await p.waitForFunction(() => /COMMERCIAL BREAK/.test((document.getElementById('hdNow') || {}).innerText || ''), null, { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('.hd-grow .hd-gc.live'), null, { timeout: 15000 });
  let g = await cells(p, 1);
  const lv = g.findIndex(x => x.live);
  assert.ok(lv > -1 && [12, 13, 15, 16].includes(mins(g[lv].range)), 'the episode and its break of 2:50 or 5:40: ' + JSON.stringify(g));
  assert.ok(!/COMMERCIAL/.test(g[lv].what) && g[lv + 1].range.split('–')[0] === g[lv].range.split('–')[1], 'the next episode starts as the break ends: ' + JSON.stringify(g));
  const gt = await p.innerText('.hd-tg') + JSON.stringify(g);
  assert.ok(!/COMMERCIAL|Long Infomercial|Fizzy|Moon Mops|Pocket Rocket/.test(gt), 'a break never names its commercials, nor shows as one');

  // on air in the break: the commercial plays, no credit, no UP NEXT; LIVE and the bug stay
  await p.click('#hdTune');
  await p.waitForFunction(() => /LIVE/.test((document.getElementById('hdLive') || {}).innerText || ''));
  assert.ok(/\/Video\/Commercials\//.test(decodeURIComponent(await p.$eval('#hdVideo', v => v.getAttribute('src')))));
  assert.ok(!/Long%20Infomercial/.test(await p.$eval('#hdVideo', v => v.getAttribute('src'))), 'over 3 minutes never airs');
  await p.waitForTimeout(1200);
  assert.ok(await p.$eval('#hdCredit', e => e.hidden), 'no credit for a commercial');
  assert.ok(await p.$eval('#hdUpNext', e => e.hidden));
  assert.ok((await txt(p, '.hd-bug')).startsWith('HOLODECK'));

  // NETWORK with breaks: a break after every 10-minute episode, each folded into its episode
  await p.click('[data-hd="tune"]');   // off
  await p.click('[data-hdkey="2"]'); await p.click('[data-hdkey="ok"]');
  // the guide fills in as the channel's folders and lengths arrive: read it once it has settled (every block named, and
  // the same two reads a second apart), as a slow full run once caught it half built
  // 2026-11-11: up to 40 s (measuring lengths is slow on a busy machine), and a guide that never finishes fails here, by
  // name, instead of being compared half built (which is how this test used to fail when the machine was busy).
  const settled = async (n, ms = 40000) => { const t = Date.now(); let a = null; for (;;) { const c = await cells(p, n), k = JSON.stringify(c);
    if (c.length >= 5 && c.every(x => x.what) && k === a) return c; if (Date.now() - t > ms) throw new Error('the guide never finished filling in: ' + k); a = k; await p.waitForTimeout(1000); } };
  g = await settled(2);
  assert.ok(g.length >= 5 && g.every(x => [12, 13, 15, 16].includes(mins(x.range))), 'every episode with its break: ' + JSON.stringify(g));
  const later = g.map(x => x.range + ' ' + x.what);

  // from the clock: the same guide after a reload
  await p.reload(); await visual();
  await p.waitForFunction(() => document.querySelectorAll('.hd-grow').length === 2 && document.querySelectorAll('.hd-grow')[1].querySelectorAll('.hd-gc:not(.wait)').length >= 5, null, { timeout: 15000 });
  assert.deepStrictEqual((await settled(2)).map(x => x.range + ' ' + x.what), later);

  // a length measured under 2.52.0 (kept with the episodes) moves to the commercials' own store
  const na = await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1')); l['/Video/Commercials/Older One.webm'] = { s: 5, z: 1 }; localStorage.setItem('tos.hololen.v1', JSON.stringify(l)); return Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).length; });
  await p.reload(); await visual();
  assert.ok(await p.evaluate(n => !Object.keys(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(k => k.startsWith('/Video/Commercials/')) && Object.keys(JSON.parse(localStorage.getItem('tos.holoadlen.v1'))).length === n + 1, na));

  // 2.70: the guide opening in the middle of a break. Channel 1 premiered so its first break is airing at the guide's left
  // edge: that break belongs to the first episode (◂, off to the left), and the next episode keeps only its own break
  // (it used to take both, making a 19 or 22 minute block)
  const w0 = await p.evaluate(() => { const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); return d.getTime() - 1800e3; });
  await p.evaluate(pr => { const c = JSON.parse(localStorage.getItem('tos.holo.v1')); c.chans[0].premiere = pr; localStorage.setItem('tos.holo.v1', JSON.stringify(c)); }, w0 - 660e3);
  await p.reload(); await visual();
  const hmOf = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });
  const edge = await settled(1);
  console.log('opening in a break:', JSON.stringify(edge.slice(0, 3)));
  assert.strictEqual(edge[0].range.split('–')[0], hmOf(w0 - 660e3), 'the first block is the episode the break follows');
  assert.ok(edge.slice(0, 4).every(x => [12, 13, 15, 16].includes(mins(x.range))), 'every block one episode and its own break: ' + JSON.stringify(edge.slice(0, 4)));
  assert.strictEqual(edge[1].range.split('–')[0], edge[0].range.split('–')[1], 'the next starts as the break ends');

  // BREAKS off: channel 2's guide has no breaks
  await p.click('[data-hdopen="2"]'); await p.click('[data-hdbrk="2"]');
  for (let i = 0; !(await plain(p, 2)); i++) { assert.ok(i < 40, 'channel 2 without breaks: ' + JSON.stringify(await cells(p, 2))); await p.waitForTimeout(250); }

  // CLEAR: no folder, BREAKS waits again; the channels' own setting is kept
  await p.click('[data-hdopen="ads"]'); await p.click('[data-hd="adclear"]');
  assert.ok((await txt(p, '.hd-ads')).includes('NO FOLDER YET'));
  assert.ok(await p.$eval('[data-hdbrk="1"]', e => e.disabled));
  const cfg = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')));
  assert.strictEqual(cfg.ads, ''); assert.strictEqual(cfg.chans[0].breaks, true);
  for (let i = 0; !(await plain(p, 1)); i++) { assert.ok(i < 40, 'channel 1 without breaks: ' + JSON.stringify(await cells(p, 1))); await p.waitForTimeout(250); }
  assert.ok((await txt(p, '#hdInfo1')).includes('breaks on, no commercials folder yet'));

  await fetch(R + '/__reset');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await fetch(R + '/__reset').catch(() => {}); console.error(e); process.exit(1); });
