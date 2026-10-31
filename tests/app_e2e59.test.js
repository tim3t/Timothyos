// HOLODECK, unreadable videos (2.51.1): a channel whose every video has a playable name but can't be decoded used to
// read "MEASURING 2 OF 2 VIDEOS…" for ever. Now it says the iPad can't play them and what to do, the channel list
// counts them as unreadable, and LOOK AGAIN measures them afresh. Simulated relay; invented files.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();

(async () => {
  await fetch(R + '/__reset'); await fetch(R + '/__mkdir?d=' + encodeURIComponent('/Video/Broken Rips'));
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [{ id: 1, name: 'Broken Rips', dir: '/Video/Broken Rips', premiere: Date.now() - 3600e3 }], ch: 1, look: 'clean', muted: true })); }, [K, R]);
  await p.reload(); await p.waitForSelector('[data-screen="holodeck"].nav');
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');

  // every video measured, none readable: say so, rather than "measuring" for ever
  await p.waitForFunction(() => /CAN'T PLAY THESE/.test(document.body.innerText), null, { timeout: 30000 });
  assert.ok((await txt(p, '#hdSum1')).includes('2 UNREADABLE'), 'the folded row says so (2.53)');
  await p.click('[data-hdopen="1"]');
  const page = await txt(p, '#content');
  assert.ok(page.includes("THE IPAD CAN'T PLAY THESE 2 VIDEOS · CONVERT THEM TO MP4 (H.264)"), page);
  assert.ok(!/MEASURING 2 OF 2/.test(page));
  assert.ok(page.includes('2 unreadable') && page.includes('nothing playable yet'), 'the channel list says so too');
  const lens = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.hololen.v1')));
  const mine = Object.keys(lens).filter(k => k.startsWith('/Video/Broken Rips/')).map(k => lens[k]);
  assert.strictEqual(mine.length, 2); assert.ok(mine.every(x => x.s === -1 && x.why === 'format' && x.at > 0), JSON.stringify(mine));

  // LOOK AGAIN measures them afresh (here they still can't be decoded, so the same answer comes back)
  await p.click('[data-hd="rescan"]');
  const at0 = Math.max(...mine.map(x => x.at));
  await p.waitForFunction(t => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'); const v = Object.keys(l).filter(k => k.startsWith('/Video/Broken Rips/')).map(k => l[k]); return v.length === 2 && v.every(x => x.at > t); }, at0, { timeout: 30000 });
  assert.ok((await txt(p, '#content')).includes("THE IPAD CAN'T PLAY THESE 2 VIDEOS"));

  // a length marked unreadable before 2.51.1 (no reason kept) is measured again
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1')); Object.keys(l).forEach(k => { if (k.startsWith('/Video/Broken Rips/')) l[k] = { s: -1, z: l[k].z }; }); localStorage.setItem('tos.hololen.v1', JSON.stringify(l)); });
  await p.reload(); await p.waitForSelector('[data-screen="holodeck"].nav'); await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
  await p.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('tos.hololen.v1') || '{}'); return Object.keys(l).filter(k => k.startsWith('/Video/Broken Rips/')).every(k => l[k].why === 'format'); }, null, { timeout: 30000 });

  await fetch(R + '/__reset');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await fetch(R + '/__reset').catch(() => {}); console.error(e); process.exit(1); });
