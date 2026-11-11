// SYSTEMS → ERROR LOG (2.62; simulated bridge :8105): every failure is kept on the iPad until cleared, so a burst of
// requests can't push it out of sight as it did RECENT REQUESTS' last 30. Bridge requests that fail (and Bridge's own
// retries of them) fold into one line with ×n and RETRIED; script errors and unhandled promises; what the page's rules
// blocked. Keys, tokens and PINs are scrubbed. Lines survive a reload; ALL / BRIDGE / PAGE / PAGE RULES filter; BRIDGE
// TODAY counts requests; COPY REPORT copies it with the versions; CLEAR asks twice; COMPUTER finds it. (backup_keys:
// never in a backup.)
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 200)); } };
const log = p => p.evaluate(() => JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]'));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await quiet(ctx);
  await lane(ctx);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  const p = await ctx.newPage();
  p.on('pageerror', e => { if (!/test boom|test rejection/.test(e.message)) errs.push(e.message); });   /* the two thrown on purpose */
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload(); await settled(p, 2500);

  // ---- nothing yet
  await p.click('#status'); await p.waitForSelector('#sec-errlog');
  let sec = await p.textContent('#sec-errlog');
  assert.ok(/NOTHING LOGGED/.test(sec) && /Nothing has failed/.test(sec), sec);
  assert.ok(/BRIDGE TODAY \d+ requests? · none failed · slowest \d+\.\d s/.test(sec), 'today\'s count: ' + sec);
  assert.ok(await p.$('[data-act="errcopy"][disabled]'), 'nothing to copy');

  // ---- the bridge answers 500 to everything for a moment: one line per action, ×n, with Bridge's own retries
  await p.route('**/macros/s/test/exec**', r => r.fulfill({ status: 500, body: 'oops' }));
  await p.click('#refreshBtn');
  await until(async () => (await log(p)).some(e => e.s === 'bridge' && e.n >= 4), 20000);
  await p.unroute('**/macros/s/test/exec**');
  let E = await log(p), br = E.find(e => e.s === 'bridge' && e.n >= 4);
  assert.strictEqual(br.m, 'http_500'); assert.ok(br.rt >= 3, 'three of them retried: ' + JSON.stringify(br));
  assert.ok(/\d+\.\d s$/.test(br.d), 'how long it took: ' + br.d);

  // ---- a script error with a token in it, an unhandled promise, something the page's rules block
  await p.evaluate(() => { setTimeout(() => { throw new Error('test boom at https://nas.example.ts.net/Video/a.mp4?k=supersecret-token-1234&x=1 Bearer abc.def'); }); });
  await p.evaluate(() => { Promise.reject(new Error('test rejection')); });
  await p.evaluate(() => { fetch('https://example.com/not-allowed').catch(() => {}); });
  await until(async () => { const x = await log(p); return x.some(e => e.s === 'page' && /boom/.test(e.m)) && x.some(e => /rejection/.test(e.m)) && x.some(e => e.s === 'rules'); });
  E = await log(p);
  const boom = E.find(e => /boom/.test(e.m)), raw = JSON.stringify(E);
  assert.ok(!/supersecret|abc\.def/.test(raw), 'scrubbed: ' + boom.m);
  assert.ok(/\?k=•••&x=1/.test(boom.m) && /Bearer •••/.test(boom.m), boom.m);
  assert.strictEqual(boom.a, 'script error'); assert.ok(/:\d+:\d+$/.test(boom.d), 'where: ' + boom.d);
  const rules = E.find(e => e.s === 'rules');
  assert.ok(/^blocked: connect-src$/.test(rules.a) && rules.m === 'https://example.com', JSON.stringify(rules));
  assert.ok(!E.some(e => e.s === 'page' && /http_500/.test(e.m)), 'a bridge failure isn\'t logged twice as an unhandled promise');

  // ---- the section: newest first, filters, ×n, RETRIED, today's count
  await until(async () => /test boom/.test(await p.textContent('#sec-errlog')));
  sec = await p.textContent('#sec-errlog');
  assert.ok(/IN 24 H · \d+ KEPT/.test(sec), sec);
  assert.ok(/×\d+/.test(sec) && /RETRIED/.test(sec), sec);
  assert.ok(/BRIDGE TODAY \d+ requests · \d+ failed/.test(sec), sec);
  const chips = await p.$$eval('[data-elf]', c => c.map(x => x.textContent));
  assert.deepStrictEqual(chips, ['ALL', 'BRIDGE', 'PAGE', 'PAGE RULES']);
  await p.click('[data-elf="bridge"]');
  let rows = await p.$$eval('#errList .el-row', r => r.map(x => x.textContent));
  assert.ok(rows.length >= 1 && rows.every(t => /BRIDGE/.test(t) && /HTTP_500|http_500/i.test(t)), rows.join(' | '));
  await p.click('[data-elf="page"]');
  rows = await p.$$eval('#errList .el-row', r => r.map(x => x.textContent));
  assert.strictEqual(rows.length, 2, rows.join(' | ')); assert.ok(/rejection/.test(rows[0]) && /boom/.test(rows[1]), 'newest first: ' + rows.join(' | '));
  await p.click('[data-elf="all"]');

  // ---- COPY REPORT
  await p.click('[data-act="errcopy"]');
  const clip = await until(() => p.evaluate(() => navigator.clipboard.readText()));
  assert.ok(/^TimothyOS ERROR LOG/.test(clip) && /App \d+\.\d+\.\d+ · bridge 1\.\d+/.test(clip), clip.slice(0, 200));
  assert.ok(/\[BRIDGE\] \w+: http_500 · \d+ retried/.test(clip) && /\[PAGE RULES\] blocked: connect-src: https:\/\/example\.com/.test(clip), clip);
  assert.ok(!/supersecret/.test(clip));

  // ---- kept across a reload; never in a backup; COMPUTER finds it
  await p.reload(); await settled(p, 2000);
  assert.ok((await log(p)).length >= 4, 'kept on the iPad');
  await p.keyboard.press('Meta+k'); await p.waitForSelector('#cmdScrim:not([hidden]):not(.closing)');
  await p.fill('#cmdText', 'error log'); await p.waitForTimeout(200);
  assert.ok(/Error log/.test(await p.textContent('#cmdScrim')), 'COMPUTER lists it');
  await p.keyboard.press('Enter'); await settled(p, 600);
  assert.ok(await p.$('#sec-errlog'), 'and opens SYSTEMS at it');

  // ---- CLEAR asks twice
  await p.click('[data-act="errclear"]');
  assert.strictEqual((await p.textContent('[data-act="errclear"]')).trim(), 'TAP AGAIN TO CLEAR');
  assert.ok((await log(p)).length >= 4, 'not yet');
  await p.click('[data-act="errclear"]');
  assert.strictEqual((await log(p)).length, 0, 'cleared');
  assert.ok(/NOTHING LOGGED/.test(await p.textContent('#sec-errlog')));

  // ---- phone width
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => { setTimeout(() => { throw new Error('test boom on a phone with a long message that has to wrap inside the row without pushing the page sideways at all'); }); });
  await until(async () => /test boom on a phone/.test(await p.textContent('#sec-errlog')));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  await b.close();
  console.log('errors', errs);
  console.log('ok app_e2e75');
})().catch(e => { console.error(e); process.exit(1); });
