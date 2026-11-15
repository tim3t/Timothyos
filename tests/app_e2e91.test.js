// HONEST REQUEST NUMBERS (2.84; simulated bridge :8105). From the 15 Nov diagnostic. C4: a request dropped once whose
// retry goes through stays in the error log as RECOVERED, dimmed, not as trouble, and leaves BRIDGE TODAY's failure
// count. C3: a request still open while the app was paused (iPadOS froze the page: the clock moved on 200 s) reads
// "app paused" and stays out of BRIDGE TODAY's "slowest". A request that fails for good still counts as a failure.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = require('./lib/explain').until(15000, 120);   // B3: a timeout says what the page showed

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  // the page's clock can jump, as it does when iPadOS freezes the page and lets it go later
  await ctx.addInitScript(() => { const real = Date.now.bind(Date); let off = 0; Date.now = () => real() + off; window.__jump = ms => { off += ms; }; });
  let mode = 'pass', held = null;
  await ctx.route(new RegExp('127\\.0\\.0\\.1:' + P8105 + '/macros'), async route => {
    const act = (JSON.parse(route.request().postData() || '{}').action) || '';
    if (act !== 'batch' || mode === 'pass') return route.continue();
    if (mode === 'dropOnce') { mode = 'pass'; return route.abort('failed'); }
    if (mode === 'dropAll') return route.abort('failed');
    if (mode === 'hold') { mode = 'pass'; held = route; return; }
    return route.continue();
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForTimeout(2500);
  await p.click('#status'); await p.waitForSelector('#sec-errlog');
  const day = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.netday.v1') || '{}'));
  const log = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]'));
  const refresh = async m => { await p.waitForSelector('#refreshBtn:not([disabled])', { timeout: 30000 }); mode = m; await p.click('#refreshBtn'); };   // after the last refresh has settled, retries included
  const reopen = async () => { await p.click('[data-screen="today"]'); await p.click('#status'); await p.waitForSelector('#sec-errlog'); };
  const f0 = (await day()).f || 0;

  // ---- C4: dropped once, then through: RECOVERED, dimmed, not a failure today
  await refresh('dropOnce');
  await until(async () => (await log()).some(e => /^sync:/.test(e.a) && e.rec >= (e.n || 1)));
  await p.waitForTimeout(500);
  assert.strictEqual((await day()).f || 0, f0, 'a recovered request is not a failure today');
  await reopen();
  const row = await txt(p, '#errList .el-row');
  assert.ok(/RECOVERED/.test(row) && !/RETRIED/.test(row), row);
  assert.ok(await p.$('#errList .el-row.soft .pill:not(.bad)'), 'dimmed, not marked as trouble');
  assert.ok(!/IN 24 H/.test(await txt(p, '#sec-errlog .phead')), 'a recovered request is not counted as trouble: ' + await txt(p, '#sec-errlog .phead'));
  assert.ok(/none failed/.test(await txt(p, '#sec-errlog .el-day')), await txt(p, '#sec-errlog .el-day'));
  assert.ok(/RECOVERED/.test(await txt(p, '.netlog')), 'RECENT REQUESTS says so too');

  // ---- C3: open while the app was paused for 200 s: "app paused", and not BRIDGE TODAY's slowest
  await refresh('hold');
  await until(async () => !!held);
  await p.evaluate(() => window.__jump(200 * 1000));
  await held.abort('failed'); held = null;   // dropped as the app wakes: then retried, and through
  await until(async () => (await log()).some(e => /app paused/.test(e.m)));
  await refresh('hold'); await until(async () => !!held);
  await p.evaluate(() => window.__jump(200 * 1000));
  await held.continue(); held = null;   // this one answers, 200 s "later"
  await until(async () => (await day()).n >= 3);
  await p.waitForTimeout(800);
  assert.ok((await day()).max < 60000, 'slowest leaves out paused requests: ' + (await day()).max);
  await reopen();
  assert.ok(/slowest \d+\.\d s/.test(await txt(p, '#sec-errlog .el-day')) && !/slowest (\d{3,})/.test(await txt(p, '#sec-errlog .el-day')), await txt(p, '#sec-errlog .el-day'));
  assert.ok(/app paused/.test(await txt(p, '#errList')), 'the error log names it');

  // ---- a request that fails for good is still a failure
  await refresh('dropAll');
  await until(async () => ((await day()).f || 0) > f0, 20000);
  mode = 'pass';

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('HONEST REQUEST NUMBERS: recovered, app paused, a real failure still counted: ok');
})().catch(e => { console.error(e); process.exit(1); });
