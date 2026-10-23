// BRIDGE VERSION CHECK (2.38; simulated on :8105, its reported version set by the test): an older Google bridge
// puts "Google bridge out of date" in Condition (YELLOW) with what's missing; it opens Systems' NEEDS YOU card with
// the five steps and a link to the code; APP shows UPDATE TO; once the bridge reports the right version, CHECK
// AGAIN clears it; a newer bridge never warns; no emoji.
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs'), path = require('path');
const WANT = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8').match(/var VERSION = '([\d.]+)'/)[1];
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const setv = v => fetch(B + '&action=setversion&v=' + v).then(r => r.json());

(async () => {
  await setv('1.29.0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload(); await p.waitForSelector('.ov-cond', { timeout: 10000 }); await p.waitForTimeout(1200);

  // ---- an older bridge: a YELLOW item in Condition, naming what's missing
  const item = p.locator('.ov-alert', { hasText: 'Google bridge out of date' });
  await item.waitFor({ timeout: 5000 });
  const it = (await item.innerText()).replace(/\s+/g, ' ');
  assert.ok(it.includes('Deployed 1.29.0, this app needs ' + WANT + '.') && it.includes('Missing: ') && !it.includes('the Morning Briefing') && it.includes('SYSTEMS'), 'what 1.29 lacks, never what it has: ' + it);
  assert.ok(await item.evaluate(el => el.classList.contains('warn')), 'YELLOW, not RED');
  await p.screenshot({ path: D + 'bridge-behind.png' });

  // ---- it opens Systems on the NEEDS YOU card, with the steps and the code's address
  await item.click(); await p.waitForSelector('#fix-bridge');
  const card = await txt(p, '#fix-bridge');
  assert.ok(card.includes('Google bridge out of date') && card.includes('Bridge version ' + WANT) && card.includes('Deploy → Manage deployments → pencil → Version: New version → Deploy.') && card.includes('CHECK AGAIN'), card);
  assert.strictEqual(await p.getAttribute('#fix-bridge a', 'href'), 'https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs');
  assert.ok((await txt(p, '#sec-app')).includes('BRIDGE VERSION 1.29.0 UPDATE TO ' + WANT), await txt(p, '#sec-app'));
  await p.screenshot({ path: D + 'bridge-behind-fix.png' });

  // ---- deployed: CHECK AGAIN finds it and the card turns green
  await setv('');
  await p.click('[data-act="fixbridge"]');
  await p.waitForFunction(() => !document.querySelector('#fix-bridge'), null, { timeout: 10000 });
  await p.waitForFunction(w => document.getElementById('toast').textContent.includes('Google bridge ' + w + ' found'), WANT, { timeout: 5000 });
  assert.ok((await txt(p, '#sec-app')).includes('BRIDGE VERSION ' + WANT + ' UP TO DATE'));
  await p.click('.elbow'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.ov-alert', { hasText: 'Google bridge out of date' }).count(), 0, 'gone from Condition');

  // ---- a newer bridge than the app knows: no warning
  await setv('9.0.0');
  await p.click('#status'); await p.click('#refreshBtn'); await p.waitForTimeout(1500);
  assert.ok((await txt(p, '#sec-app')).includes('BRIDGE VERSION 9.0.0 UP TO DATE'));
  await p.click('.elbow'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.ov-alert', { hasText: 'Google bridge out of date' }).count(), 0);

  await setv('');
  console.log('errors', errs);
  await b.close();
})().catch(async e => { await setv('').catch(() => {}); console.error(e); process.exit(1); });
