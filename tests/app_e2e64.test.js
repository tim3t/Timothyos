// HOLODECK, videos that measure but won't play (2.53.4). A video's header can read fine (so its length is measured and
// it's on the schedule) while its picture can't be decoded. Tuning in used to skip from title to title, landing on the
// same broken videos, and gave up after five ("never begins playing"). Now each one that fails to decode leaves the
// schedule on this iPad, the run carries on to one that plays, the folded row says how many, and an opened row names
// them. Simulated relay; invented files.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  await fetch(R + '/__reset'); await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Rough Cuts'));
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const visual = async () => { await p.waitForSelector('[data-screen="holodeck"].nav'); await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd-rail'); };
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Rough Cuts', dir: '/Video/Rough Cuts', premiere: Date.now() - 3600e3 }], ch: 1, copen: true, look: 'clean', muted: true })); }, [K, R]);
  await p.reload(); await visual();

  // the trap: all seven measure, so all seven are on the schedule
  await p.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'); return Object.keys(l).filter(k => k.startsWith('/Video/Rough Cuts/') && l[k].s > 0).length === 7; }, null, { timeout: 40000 });

  // tune in just as the first broken one starts: six broken in a row, then the one that plays
  await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('tos.holo.v1')); c.chans[0].premiere = Date.now() - 6500; localStorage.setItem('tos.holo.v1', JSON.stringify(c)); });
  await p.reload(); await visual();
  await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 20000 });
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && /Plays Fine/.test(decodeURIComponent(v.getAttribute('src') || '')) && !v.paused && v.currentTime > 0; }, null, { timeout: 30000 });
  assert.ok(!/Five videos/.test(await txt(p, '#content')), 'it never gives up on a run of broken videos');
  const lens = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololen.v1')));
  const out = Object.keys(lens).filter(k => k.startsWith('/Video/Rough Cuts/') && lens[k].s < 0);
  assert.ok(out.length >= 1 && out.every(k => /Broken Picture/.test(k) && lens[k].why === 'format'), 'each broken one it lands on leaves the schedule: ' + JSON.stringify(out));   /* each leaving moves the clock's order on, so it may leap over others */
  assert.ok(!out.some(k => /Plays Fine/.test(k)));

  // the folded row says so; an opened row names them
  await p.waitForFunction(() => /\d UNREADABLE/.test((document.getElementById('hdSum1') || {}).textContent || ''));
  await p.click('[data-hdopen="1"]');
  assert.ok(/^CAN'T DECODE ON THIS IPAD \(\d\) .*Broken Picture.*Convert them on the NAS with fix-videos \(README → HOLODECK → Converting videos\), then LOOK AGAIN\.$/.test(await txt(p, '.hd-bad')), await txt(p, '.hd-bad'));   /* 2.69: why, and what to do */
  assert.strictEqual(await p.locator('.hd-bad.net').count(), 0, 'none of them only unreachable');

  // the next time round: it plays, and never tries one already left out
  await p.click('[data-hd="tune"]');   // off
  await p.evaluate(() => { const v = document.getElementById('hdVideo'); window.__tried = []; v.addEventListener('loadstart', () => window.__tried.push(decodeURIComponent(v.getAttribute('src') || ''))); });
  await p.click('.hd-tune');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && !v.paused && v.currentTime > 0; }, null, { timeout: 30000 });
  const tried = await p.evaluate(() => window.__tried);
  assert.ok(!tried.some(u => out.some(k => u.includes(k))), 'nothing left out is tried again: ' + tried.join(' | '));

  // LOOK AGAIN tries them afresh
  await p.click('[data-hd="tune"]');
  await p.click('[data-hd="rescan"]');
  assert.ok(await p.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(x => x.s < 0)));

  // the NAS failing, in a fresh browser (nothing cached): five that don't load turn the TV off with the NAS's note, and
  // none is marked as one the iPad can't play
  await fetch(R + '/__fail?prefix=' + encodeURIComponent('/Video/Rough Cuts/') + '&code=404&n=999');
  const ctx2 = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message));
  const lensNow = await p.evaluate(() => localStorage.getItem('tos.hololen.v1'));
  await q.goto('http://localhost:8080/');
  await q.evaluate(([k, r, l]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck'])); localStorage.setItem('tos.hololen.v1', l);   /* lengths known, as on the iPad that measured them */
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Rough Cuts', dir: '/Video/Rough Cuts', premiere: Date.now() - 3600e3 }], ch: 1, copen: true, look: 'clean', muted: true })); }, [K, R, lensNow]);
  await q.reload(); await q.click('[data-screen="holodeck"].nav'); await q.waitForSelector('.hd-arch'); await q.click('[data-hdprog="visual"]');
  await q.waitForSelector('.hd-tune:not([disabled])', { timeout: 20000 }); await q.click('.hd-tune');
  await q.waitForFunction(() => /Five videos in a row didn't load|None of this channel's videos would load/.test(document.getElementById('content').innerText), null, { timeout: 30000 });
  assert.ok(await q.$('.hd-tune'), 'off, TUNE IN offered again');
  assert.ok(await q.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('tos.hololen.v1'))).some(x => x.why === 'format')), 'an outage never marks a video unplayable');
  if (await q.$('[data-hdopen="1"]') && !(await q.$('.hd-more:not([hidden]) .hd-bad'))) await q.click('[data-hdopen="1"]');
  const net = await q.$('.hd-bad.net');
  if (net) assert.ok(/^COULDN'T REACH \(\d+\) · TRYING AGAIN AT \d\d:\d\d /.test((await net.innerText()).replace(/\s+/g, ' ')), 'a refused file says it will be tried again');
  await fetch(R + '/__fail?n=0');

  await fetch(R + '/__reset');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await fetch(R + '/__reset').catch(() => {}); console.error(e); process.exit(1); });
