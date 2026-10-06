const { chromium } = require('playwright');
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
  await p.reload(); await p.waitForTimeout(6000);
  console.log('after transient 404s -> status:', (await p.textContent('#status')).trim(), '| priorities rows:', await p.locator('.prio').count(), '| error shown:', await p.locator('.rcol .err').count(), '| hits', JSON.stringify(hits));
  await p.click('#capBtn'); await p.fill('#capText', 'Retry test event'); await p.click('#capSave'); await p.waitForTimeout(3000);
  const st = await stats();
  console.log('capture with 404 on first POST -> toast:', await p.textContent('#toast'), '| created on server:', st.created.filter(t => t === 'Retry test event').length, '| queue', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length));
  await p.click('.prio >> nth=0'); await p.waitForTimeout(3000);
  console.log('check-off with 404 on first POST -> toast:', await p.textContent('#toast'));
  console.log('errors', errs); await b.close();
})();
