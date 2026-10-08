// Sync resilience: dropped connections are retried, requests cut off while the
// iPad sleeps are re-run when it wakes, a short outage over good saved data stays
// quiet, at most 2 bridge requests run at once, the task list is not re-fetched
// every minute, and Systems shows a log of recent requests.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/';
const CONN = JSON.stringify({ url: 'http://127.0.0.1:8095/macros/s/test/exec', key: 'k'.repeat(64) });

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-06T07:40:00-05:00') });
  await p.goto('http://localhost:8080/');

  // network control for the bridge: mode 'pass' | 'dropFirst' | 'dropAll'; counts concurrency and actions
  let mode = 'pass', dropped = 0, live = 0, peak = 0; const hits = {};
  await p.route('http://127.0.0.1:8095/**', async route => {
    const action = new URL(route.request().url()).searchParams.get('action') || 'post';
    if (mode === 'dropAll' || (mode === 'dropFirst' && dropped === 0)) { dropped++; return route.abort('failed'); }
    hits[action] = (hits[action] || 0) + 1;
    live++; peak = Math.max(peak, live);
    await new Promise(r => setTimeout(r, 150));
    try { await route.continue(); } finally { live--; }
  });
  const wait = ms => p.clock.runFor(ms).then(() => p.waitForTimeout(50));
  const settle = async () => { for (let i = 0; i < 20; i++) { await p.waitForTimeout(150); await p.clock.runFor(1000); } };

  // 1. first request dropped: retried, no error shown
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, CONN);
  mode = 'dropFirst';
  await p.reload(); await settle();
  console.log('after one dropped request -> status:', (await p.textContent('#status')).trim(), '| dropped', dropped, '| peak parallel', peak);
  assert.strictEqual(dropped, 1);
  assert.ok((await p.textContent('#status')).includes('SYNCED'));
  assert.strictEqual(await p.locator('#content .err').count(), 0, 'no red errors');
  assert.ok(!(await p.textContent('#content')).includes("Couldn't reach"));
  assert.ok(peak <= 2, 'at most 2 bridge requests at once');

  // 2. request cut off while the iPad sleeps: re-run on wake, not reported as a failure
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  mode = 'dropAll'; dropped = 0;
  await hide(true);
  await p.evaluate(() => document.querySelector('#status').click());
  await p.evaluate(() => document.querySelector('[data-act="refresh"]').click());
  await settle();
  const whileAsleep = dropped;
  mode = 'pass';
  await hide(false); await settle();
  console.log('asleep: dropped', whileAsleep, '| after wake status:', (await p.textContent('#status')).trim());
  assert.ok(whileAsleep >= 1);
  assert.ok((await p.textContent('#status')).includes('SYNCED'));
  const log = await p.locator('.netlog').innerText();
  console.log('request log:', log.replace(/\s+/g, ' ').slice(0, 300));
  assert.ok(/IN BACKGROUND/.test(log), 'log marks requests cut off in the background');
  assert.ok(/IN THE LAST HOUR · (NONE FAILED|\d+ FAILED)/.test(await p.textContent('.phead:has-text("RECENT REQUESTS")')));

  // 3. an outage over good saved data: stays quiet (SYNCED · RETRYING), panels show a muted note, not red errors
  await p.evaluate(() => document.querySelector('.elbow').click()); await settle();
  mode = 'dropAll';
  await p.evaluate(() => document.querySelector('#status').click());
  await p.evaluate(() => document.querySelector('[data-act="refresh"]').click());
  await settle();
  console.log('outage status:', (await p.textContent('#status')).trim());
  assert.ok(/SYNCED.*RETRYING/.test((await p.textContent('#status')).replace(/\s+/g, ' ')), 'first failure stays quiet');
  await p.evaluate(() => document.querySelector('.elbow').click()); await settle();
  assert.strictEqual(await p.locator('#content .err').count(), 0, 'no red errors over saved data');
  console.log('stale notes:', await p.locator('.stale').count(), '| cond:', await p.getAttribute('.ov-cond', 'class'));
  await p.screenshot({ path: D + 'sync-outage.png' });
  // the app retries 30 s, then 60 s, after each failed attempt; give it up to 4 simulated minutes rather than a fixed moment
  mode = 'pass';
  for (let i = 0; i < 24 && /RETRYING/.test(await p.textContent('#status')); i++) { await p.clock.runFor(10000); await p.waitForTimeout(150); }
  await settle();
  console.log('recovered status:', (await p.textContent('#status')).trim());
  assert.ok((await p.textContent('#status')).replace(/\s+/g, ' ').includes('SYNCED'));
  assert.ok(!(await p.textContent('#status')).includes('RETRYING'));

  // 4. task list: not re-fetched on every 1-minute tick
  await p.evaluate(() => document.querySelector('#status').click());
  const t0 = hits.tasks || 0;
  await p.evaluate(() => document.querySelector('[data-act="refresh"]').click());
  for (let i = 0; i < 60 && (hits.tasks || 0) === t0; i++) { await p.waitForTimeout(150); await p.clock.runFor(500); }
  assert.ok((hits.tasks || 0) > t0, 'REFRESH NOW also refreshes the task list');
  await p.evaluate(() => document.querySelector('.elbow').click()); await settle();
  const before = hits.tasks || 0;
  for (let i = 0; i < 4; i++) { await wait(60000); }
  await settle();
  const extra = (hits.tasks || 0) - before;
  console.log('task list fetches over 4 minutes open:', extra);
  assert.strictEqual(extra, 0, 'task list is not re-fetched on every 1-minute tick');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
