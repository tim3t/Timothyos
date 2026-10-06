const { chromium } = require('playwright');
const D = __dirname + '/out/';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T10:40:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8094/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('[data-screen="week"]'); await p.waitForTimeout(900);
  const pt = await p.evaluate(() => {
    const col = document.querySelector('.wkcol[data-ymd="2026-10-08"]'); const line = col.querySelectorAll('.wkline')[15]; // line at 16:00
    line.scrollIntoView({ block: 'center' }); const r = line.getBoundingClientRect(); const c = col.getBoundingClientRect();
    return { x: c.left + c.width / 2, y: r.top + 10 };
  });
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  console.log('week tap -> sheet', await p.isVisible('#capScrim'), 'date', await p.inputValue('#capDate'), 'time', await p.inputValue('#capTime'));
  await p.click('#capCancel');
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(200); await p.click('#capBtn'); await p.waitForTimeout(200);
  await p.screenshot({ path: D + 'cap-phone.png' });
  console.log('phone scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  const st = await (await fetch('http://127.0.0.1:8094/x/exec?action=stats&key=' + 'k'.repeat(64))).json();
  console.log('POST content type seen by bridge (latest run):', st.posts);
  console.log('errors', errs); await b.close();
})();
