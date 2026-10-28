// Transient failures (Google's 404 page) are retried, not shown: loading recovers, a capture whose first POST fails is
// saved once, a check-off goes through, and RECENT REQUESTS calls them RETRIED, not failed.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8093/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  let hits = { tasks: 0, post: 0, events: 0 };
  const googlePage = { status: 404, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<!DOCTYPE html><title>Page Not Found</title>' };
  await p.route('**/127.0.0.1:8093/**', r => {
    const u = r.request().url(), m = r.request().method();
    if (m === 'POST') { hits.post++; return hits.post % 2 === 1 ? r.fulfill(googlePage) : r.continue(); }  // every first POST attempt fails
    if (u.includes('action=tasks')) { hits.tasks++; return hits.tasks <= 2 ? r.fulfill(googlePage) : r.continue(); }  // two failures, then OK
    if (u.includes('action=events')) { hits.events++; return hits.events === 1 ? r.fulfill(googlePage) : r.continue(); }
    return r.continue();
  });
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8093/macros/s/test/exec', key: 'k'.repeat(64) })); });
  const retry0 = (await stats()).created.filter(t => t === 'Retry test event').length;
  await p.reload(); await p.waitForTimeout(6000);
  assert.ok((await p.textContent('#status')).trim().startsWith('SYNCED'), 'recovered: ' + await p.textContent('#status'));
  assert.ok(await p.locator('.prio').count() >= 1, 'priorities loaded after two failures'); assert.strictEqual(await p.locator('.rcol .err').count(), 0, 'no error shown');
  assert.strictEqual(hits.tasks, 3, 'two failures, then the third worked: ' + JSON.stringify(hits));
  await p.click('#capBtn'); await p.fill('#capText', 'Retry test event'); await p.click('#capSave'); await p.waitForTimeout(3000);
  const st = await stats();
  assert.ok((await p.textContent('#toast')).startsWith('Saved to Personal'), await p.textContent('#toast'));
  assert.strictEqual(st.created.filter(t => t === 'Retry test event').length, retry0 + 1, 'saved once despite the failed first attempt');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1') || '[]').length), 0);
  await p.click('.prio >> nth=0'); await p.waitForTimeout(3000);
  assert.strictEqual(await p.textContent('#toast'), 'Done. Marked Done in Notion.', 'the check-off went through on the retry');
  // the log calls a failed attempt that was tried again RETRIED (amber), not a failure
  const nl = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.netlog.v1')));
  const t404 = nl.filter(n => n.a === 'tasks' && /http_404/.test(n.r));
  require('assert').ok(t404.length >= 2 && t404.every(n => n.retried), 'retried 404s marked');
  await p.click('#status'); await p.waitForTimeout(500);
  const head = (await p.textContent('.sys')).replace(/\s+/g, ' ');
  require('assert').ok(/NONE FAILED · \d+ RETRIED/.test(head), 'nothing counted as failed when retries succeeded');
  console.log('errors', errs); await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
