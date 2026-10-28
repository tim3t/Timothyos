// A lost reply never makes a duplicate: the server gets the write but the page never hears back, so the capture stays
// queued (Saving, DISCARD in Systems); when replies flow again the refresh finds it already saved and clears the queue.
// Key date and calendar event, each kept to exactly one server copy.
const { chromium } = require('playwright');
const assert = require('assert');
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
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8094/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);
  const planting = async () => (await stats()).dates.filter(d => d[0].startsWith('Planting')).length, lostEv = async () => (await stats()).created.filter(t => t === 'Lost reply event').length;
  const queue = () => p.evaluate(() => JSON.parse(localStorage.getItem('tos.queue.v1') || '[]'));
  const d0 = await planting(), e0 = await lostEv();
  await p.click('#capBtn'); await p.click('[data-ctype="date"]');
  await p.fill('#capText', 'Planting anniversary');
  await p.fill('#capDate', '2026-11-13'); await p.dispatchEvent('#capDate', 'change');
  await p.selectOption('#capLifeArea', '👨‍👩‍👧‍👦 Kin'); await p.selectOption('#capKdType', '💍 Anniversary'); await p.click('#capYearly');
  await p.click('#capSave'); await p.waitForTimeout(1500);
  assert.strictEqual(await planting(), d0 + 1, 'the server got it once');
  assert.deepStrictEqual((await queue()).map(q => q.title), ['Planting anniversary'], 'still queued: the page never heard back');
  await p.click('#status'); await p.waitForTimeout(300);
  const row = (await p.locator('.calrow:has-text("Planting")').textContent()).replace(/\s+/g, ' ');
  assert.ok(/Saving/.test(row) && /DISCARD/.test(row), 'shown in Systems as saving, with DISCARD: ' + row);
  // replies flow again; the dates refresh shows it is already in Notion
  lose = false;
  await p.click('[data-act="refresh"]'); await p.waitForTimeout(2000);
  assert.strictEqual((await queue()).length, 0, 'the refresh found it saved and cleared the queue');
  assert.strictEqual(await planting(), d0 + 1, 'and did not send it again');
  assert.ok((await p.textContent('#toast')).includes('Key date saved to Notion'), await p.textContent('#toast'));
  // same for a calendar event
  lose = true;
  await p.click('[data-screen="today"]'); await p.waitForTimeout(400);
  await p.click('#capBtn'); await p.fill('#capText', 'Lost reply event'); await p.click('#capSave'); await p.waitForTimeout(1500);
  assert.strictEqual((await queue()).length, 1, 'event queued while its reply is lost');
  assert.strictEqual(await lostEv(), e0 + 1, 'the server has it once');
  lose = false;
  await p.click('#status'); await p.click('[data-act="refresh"]'); await p.waitForTimeout(2000);
  assert.strictEqual((await queue()).length, 0, 'cleared once replies flow');
  assert.strictEqual(await lostEv(), e0 + 1, 'still one calendar event');
  console.log('errors', errs); await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
