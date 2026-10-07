const { chromium } = require('playwright');
const D = __dirname + '/out/';
const K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8092/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T10:40:00-05:00'));
  await p.goto('http://localhost:8080/');

  // 1. Old bridge (no create ability)
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8090/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('#capBtn'); await p.waitForTimeout(200);
  console.log('old bridge: note shown', await p.isVisible('#capNote'), '| save disabled', await p.isDisabled('#capSave'));
  await p.screenshot({ path: D + 'cap-oldbridge.png' });
  await p.click('#capCancel');

  // 2. New bridge
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8092/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1200);
  console.log('topbar:', await p.textContent('#topNote'));
  await p.click('#capBtn'); await p.waitForTimeout(200);
  console.log('defaults: time', await p.inputValue('#capTime'), '| today pressed', await p.getAttribute('[data-capday="today"]', 'aria-pressed'), '| dur 1h pressed', await p.getAttribute('[data-dur="1"]', 'aria-pressed'), '| save enabled', !(await p.isDisabled('#capSave')));
  await p.fill('#capText', 'Pick up bee feeder');
  await p.click('[data-dur="0.5"]');
  await p.screenshot({ path: D + 'cap-sheet.png' });
  await p.press('#capText', 'Enter'); await p.waitForTimeout(800);
  console.log('toast:', await p.textContent('#toast'));
  console.log('day shows it:', await p.locator('.ev', { hasText: 'Pick up bee feeder' }).count(), '| pending left:', await p.locator('.ev.pending').count(), '| queue', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length));
  console.log('server:', JSON.stringify(await stats()));
  await p.screenshot({ path: D + 'cap-saved.png' });

  // 3. Empty validation
  await p.click('#capBtn'); await p.click('#capSave'); console.log('empty title msg:', await p.textContent('#capErr')); await p.click('#capCancel');

  // 4. Tap empty timeline at 15:00
  const y = await p.evaluate(() => { const tl = document.querySelector('.tl'); const h = [...tl.querySelectorAll('.hour')][15]; h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); return r.top + 5; });
  const x = await p.evaluate(() => { const r = document.querySelector('.tl').getBoundingClientRect(); return r.left + r.width - 30; });
  await p.mouse.click(x, y); await p.waitForTimeout(200);
  console.log('tap 15:00 -> sheet open', await p.isVisible('#capScrim'), 'time', await p.inputValue('#capTime'));
  await p.fill('#capText', 'All day farm stand'); await p.click('[data-capday="tomorrow"]'); await p.click('[data-dur="all"]');
  console.log('all-day hides time:', await p.isHidden('#capTime'));
  await p.click('#capSave'); await p.waitForTimeout(800);
  console.log('toast:', await p.textContent('#toast'));

  // 5. Offline queue
  await p.click('[data-dur]', { trial: true }).catch(() => {});
  await p.route('**/127.0.0.1:8092/**', r => r.abort());
  await p.click('#capBtn'); await p.fill('#capText', 'Offline idea'); await p.click('[data-dur="1"]'); await p.click('#capSave'); await p.waitForTimeout(600);
  console.log('offline toast:', await p.textContent('#toast'), '| status:', (await p.textContent('#status')).trim(), '| pending block:', await p.locator('.ev.pending', { hasText: 'Offline idea' }).count());
  await p.screenshot({ path: D + 'cap-queued.png' });
  await p.unroute('**/127.0.0.1:8092/**');
  await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1200);
  console.log('after online: queue', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length), '| status:', (await p.textContent('#status')).trim(), '| server:', JSON.stringify(await stats()));

  // 6. Permanent failure
  await p.click('#capBtn'); await p.fill('#capText', 'FAILME'); await p.click('#capSave'); await p.waitForTimeout(800);
  console.log('failure toast:', await p.textContent('#toast'), '| status:', (await p.textContent('#status')).trim());
  await p.click('#status'); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'cap-systems.png', fullPage: true });
  await p.click('[data-qdiscard]'); await p.waitForTimeout(300);
  console.log('after discard: queue', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length), '| status:', (await p.textContent('#status')).trim());

  // 7. Personal hidden note
  await p.click('[data-screen="today"]'); await p.waitForTimeout(500); await p.click('[data-toggle="personal"]');
  await p.click('#capBtn'); console.log('hidden note:', await p.textContent('#capNote')); await p.click('#capCancel'); await p.click('[data-toggle="personal"]');

  // Week tap-to-capture is covered by app_e2e7.test.js
  await p.setViewportSize({ width: 400, height: 860 }); await p.click('#capBtn'); await p.waitForTimeout(200);
  await p.screenshot({ path: D + 'cap-phone.png' });
  console.log('phone scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  console.log('POST content types:', JSON.stringify((await stats()).posts));
  console.log('errors', errs); await b.close();
})();
