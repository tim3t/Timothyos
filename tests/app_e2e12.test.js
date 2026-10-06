const { chromium } = require('playwright');
const K = 'k'.repeat(64);
const stats = async () => (await (await fetch('http://127.0.0.1:8094/x/exec?action=stats&key=' + K)).json());
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  let lose = true;
  // the server receives every POST, but while `lose` is on the page never sees the reply
  await p.route('**/127.0.0.1:8094/**', async r => {
    if (r.request().method() === 'POST' && lose) { await r.fetch(); return r.abort('connectionreset'); }
    return r.continue();
  });
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8094/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);
  await p.click('#capBtn'); await p.click('[data-ctype="date"]');
  await p.fill('#capText', 'Planting anniversary');
  await p.fill('#capDate', '2026-11-13'); await p.dispatchEvent('#capDate', 'change');
  await p.selectOption('#capLifeArea', '👨‍👩‍👧‍👦 Family'); await p.selectOption('#capKdType', '💍 Anniversary'); await p.click('#capYearly');
  await p.click('#capSave'); await p.waitForTimeout(1500);
  console.log('reply lost -> toast:', await p.textContent('#toast'));
  console.log('server copies:', (await stats()).dates.filter(d => d[0].startsWith('Planting')).length, '| queue:', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).map(q => q.title + ' attempts=' + q.attempts)));
  await p.click('[data-screen="systems"]'); await p.waitForTimeout(300);
  console.log('systems row:', (await p.locator('.calrow:has-text("Planting")').textContent()).replace(/\s+/g, ' '));
  // replies flow again; the dates refresh shows it is already in Notion
  lose = false;
  await p.click('[data-act="refresh"]'); await p.waitForTimeout(2000);
  console.log('after refresh -> queue:', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length), '| server copies:', (await stats()).dates.filter(d => d[0].startsWith('Planting')).length);
  console.log('toast:', await p.textContent('#toast'));
  // same for a calendar event
  lose = true;
  await p.click('[data-screen="today"]'); await p.waitForTimeout(400);
  await p.click('#capBtn'); await p.fill('#capText', 'Lost reply event'); await p.click('#capSave'); await p.waitForTimeout(1500);
  console.log('event reply lost -> queue:', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length), '| server has it:', (await stats()).created.filter(t => t === 'Lost reply event').length);
  lose = false;
  await p.click('[data-screen="systems"]'); await p.click('[data-act="refresh"]'); await p.waitForTimeout(2000);
  console.log('after refresh -> queue:', await p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1')).length), '| server copies:', (await stats()).created.filter(t => t === 'Lost reply event').length);
  console.log('errors', errs); await b.close();
})();
