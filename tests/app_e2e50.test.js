// NOTION SCHEMA CHECK (2.39, bridge 1.31; simulated on :8105, its answer switched by the test): all columns in
// place shows OK in SYSTEMS → NOTION and nothing in Condition; a missing column and a changed type show as a YELLOW
// Condition item naming them, a NEEDS YOU card with the steps, and the NOTION row; CHECK AGAIN clears it; the answer
// is kept for six hours (a reload doesn't ask again); no emoji.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=schemamode&' + q).then(r => r.json());

(async () => {
  await mode('bad=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload(); await p.waitForSelector('.ov-cond', { timeout: 10000 }); await p.waitForTimeout(1500);

  // ---- every column in place: OK, nothing in Condition
  assert.strictEqual(await p.locator('.ov-alert', { hasText: 'Notion column' }).count(), 0);
  await p.click('#status'); await p.waitForSelector('#sec-notion');
  const ok = await txt(p, '#sec-notion');
  assert.ok(ok.includes('Columns Every connected database (10) has the columns the bridge uses') && /Columns .* OK/.test(ok), ok);
  const calls0 = (await mode('')).calls;
  assert.ok(calls0 >= 1);

  // ---- a column renamed and a type changed: named in Systems, Condition and NEEDS YOU
  await mode('bad=1');
  await p.click('[data-act="schemacheck"]');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('2 Notion columns changed: NEEDS YOU has the steps'), null, { timeout: 5000 });
  const row = await txt(p, '#sec-notion');
  assert.ok(row.includes('Master Task List: “Focus Date” (date) not found') && row.includes('Library: “Rating” is text, needs number') && row.includes('CHANGED'), row);
  assert.ok(await p.isVisible('#fix-schema'));
  const card = await txt(p, '#fix-schema');
  assert.ok(card.includes('2 Notion columns changed') && card.includes('Focus Date') && card.includes('Edit property') && card.includes('Tell Claude the new name') && card.includes('CHECK AGAIN'), card);
  await p.screenshot({ path: D + 'schema-fix.png' });
  await p.click('.elbow'); await p.waitForTimeout(300);
  const item = p.locator('.ov-alert', { hasText: 'Notion columns changed' });
  assert.strictEqual(await item.count(), 1);
  assert.ok(await item.evaluate(el => el.classList.contains('warn')), 'YELLOW');
  assert.ok((await item.innerText()).includes('Master Task List: “Focus Date” (date) not found'));

  // ---- fixed in Notion: CHECK AGAIN clears it everywhere
  await item.click(); await p.waitForSelector('#fix-schema');
  await mode('bad=0');
  await p.click('[data-act="fixschema"]');
  await p.waitForFunction(() => !document.querySelector('#fix-schema'), null, { timeout: 8000 });
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('Notion columns checked'), null, { timeout: 5000 });
  await p.click('.elbow'); await p.waitForTimeout(300);
  assert.strictEqual(await p.locator('.ov-alert', { hasText: 'Notion column' }).count(), 0);

  // ---- kept for six hours: a reload doesn't ask again
  const calls1 = (await mode('')).calls;
  await p.reload(); await p.waitForSelector('.ov-cond', { timeout: 10000 }); await p.waitForTimeout(1500);
  assert.strictEqual((await mode('')).calls, calls1, 'no new check after a reload');

  const all = await txt(p, 'body');
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{FE0F}]/u.test(all), 'no emoji');
  console.log('errors', errs);
  await b.close();
})().catch(async e => { await mode('bad=0').catch(() => {}); console.error(e); process.exit(1); });
