// HARDENING (2.58, bridge 1.38; simulated bridge :8105): the access key never travels in an address. Every read goes as a
// POST with the key in its body, as writes always have. An older bridge (one that answers a read by POST with
// unknown_action) still works: reads to it go as GET, as before; once it's updated (a GET answered use_post) they go by
// POST again, without a reload. SYSTEMS reads its LEDGER and APIARY rows for itself (after a restore they sat at
// WAITING until those stations were opened). The page's Content-Security-Policy blocks a service it doesn't list, and
// RECENT REQUESTS names what was blocked.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const mode = (a, q) => fetch(B + '&action=' + a + '&' + q).then(r => r.json());
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  await mode('readmode', 'post=1&get=1&reset=1'); await mode('apmode', 'on=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  let seen = []; p.on('request', r => { if (r.url().includes(':8105/')) seen.push({ m: r.method(), url: r.url(), body: r.postData() || '' }); });
  const act = x => x.m === 'POST' ? JSON.parse(x.body).action : new URL(x.url).searchParams.get('action');
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  seen = []; await p.reload();
  await p.waitForFunction(() => /^SYNCED/.test(document.getElementById('status').textContent), null, { timeout: 15000 });

  // ---- bridge 1.38: reads by POST, the key in the body, never in an address
  await until(async () => seen.length >= 3);
  assert.ok(seen.every(x => !/[?&]key=/.test(x.url) && !x.url.includes(K)), 'no address carries the key: ' + seen.map(x => x.url).join(' '));
  assert.ok(seen.every(x => x.m === 'POST' && JSON.parse(x.body).key === K), 'every request a POST with the key inside');
  assert.ok(seen.some(x => ['batch', 'events', 'ping'].includes(act(x))), 'reads among them: ' + seen.map(act).join(', '));
  assert.strictEqual(await p.$eval('meta[http-equiv="Content-Security-Policy"]', m => /script-src 'self'/.test(m.content) && /connect-src[^;]*script\.google\.com/.test(m.content)), true);

  // ---- SYSTEMS reads its own rows: LEDGER and APIARY are never left at WAITING
  await p.click('#status');
  const pill = name => p.locator('.calrow', { hasText: name }).locator('.pill').innerText();
  await until(async () => (await pill('🐝 Apiary')) === 'OK');
  await until(async () => (await pill('YNAB')) === 'OK');

  // ---- an older bridge: reads fall back to GET (the key in the address, as before 2.58), and everything still loads
  await mode('readmode', 'post=0');
  const ctx2 = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push(e.message));
  let s2 = []; p2.on('request', r => { if (r.url().includes(':8105/')) s2.push({ m: r.method(), url: r.url(), body: r.postData() || '' }); });
  await p2.goto('http://localhost:8080/');
  await p2.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  s2 = []; await p2.reload();
  await p2.waitForFunction(() => /^SYNCED/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  await until(async () => s2.some(x => x.m === 'GET' && /[?&]key=/.test(x.url)));   // an older bridge: reads by GET
  await p2.waitForFunction(() => document.querySelectorAll('.ov-cond').length && !/ERROR/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  // updated mid-session: its GET answers use_post, and the reads go by POST again without a reload
  await mode('readmode', 'post=1&get=0');
  s2 = [];
  await p2.click('#status'); await p2.click('[data-act="refresh"]');
  await until(async () => s2.some(x => x.m === 'POST' && ['batch', 'events', 'tasks'].includes(act(x))));
  await p2.waitForFunction(() => /^SYNCED/.test(document.getElementById('status').textContent), null, { timeout: 15000 });
  const after = s2.filter(x => x.m === 'GET');
  assert.ok(after.length <= 2, 'at most the one refused GET per read in flight: ' + after.map(x => x.url).join(' '));
  s2 = []; await p2.click('[data-act="refresh"]'); await p2.waitForTimeout(1500);
  assert.ok(s2.length && s2.every(x => x.m === 'POST'), 'from then on, POST only');

  // ---- the Content-Security-Policy: a service it doesn't list is blocked, and SYSTEMS says so
  const blocked = await p.evaluate(() => fetch('https://example.com/collect').then(() => 'sent', () => 'blocked'));
  assert.strictEqual(blocked, 'blocked');
  await until(async () => (await p.evaluate(() => JSON.parse(localStorage.getItem('tos.netlog.v1') || '[]').some(n => n.r === 'blocked · https://example.com'))));
  await p.click('#status'); await p.waitForTimeout(300);
  assert.ok((await p.innerText('.netlog')).includes('BLOCKED · HTTPS://EXAMPLE.COM'));

  assert.deepStrictEqual(errs, []);
  await b.close(); await mode('readmode', 'post=1&get=1&reset=1'); await mode('apmode', 'on=0');
  console.log('e2e71 reads by POST, older bridges, SYSTEMS rows, the CSP: OK');
})().catch(async e => { console.error(e); await mode('readmode', 'post=1&get=1').catch(() => {}); await mode('apmode', 'on=0').catch(() => {}); process.exit(1); });
