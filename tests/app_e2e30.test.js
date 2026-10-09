// Bulleted lists (2.14.0, bridge 1.19) in the LOG and REVIEW boxes: "- " at the start of a line
// becomes "• ", Return carries the bullet on, Return on an empty bullet ends the list, • LIST turns
// lines into bullets and back without dropping the keyboard. The LOG saves the text as typed (the
// bridge makes real Notion list items); drafts keep the bullets. All text is invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8103/x/exec?key=' + K + '&action=';
const call = async q => (await (await fetch(M + q)).json());

(async () => {
  await call('pincode');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-09T20:10:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(1800);

  // ---- LOG
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);
  await p.keyboard.type('o1701'); await p.waitForSelector('#clText-2026-10-09', { timeout: 5000 });
  const ta = '#clText-2026-10-09';
  await p.click(ta);
  await p.keyboard.type('Chores:'); await p.keyboard.press('Enter');
  await p.keyboard.type('- feed the hens');
  assert.strictEqual(await p.inputValue(ta), 'Chores:\n• feed the hens', '"- " became a bullet');
  await p.keyboard.press('Enter'); await p.keyboard.type('check the hives');
  await p.keyboard.press('Enter');
  assert.strictEqual(await p.inputValue(ta), 'Chores:\n• feed the hens\n• check the hives\n• ', 'Return carries the bullet on');
  await p.keyboard.press('Enter'); await p.keyboard.type('Done for the day.');
  assert.strictEqual(await p.inputValue(ta), 'Chores:\n• feed the hens\n• check the hives\nDone for the day.', 'Return on an empty bullet ends the list');
  await p.screenshot({ path: D + 'bullets-log.png' });
  await p.click('[data-lact="save"]'); await p.waitForTimeout(1200);
  const st = await call('stats');
  assert.strictEqual(st.logsaves[st.logsaves.length - 1][1], 'Chores:\n• feed the hens\n• check the hives\nDone for the day.');
  assert.strictEqual(st.log['2026-10-09'], 'Chores:\n\n• feed the hens\n• check the hives\n\nDone for the day.', 'stored as list items');
  // reopened, it reads the same and isn't seen as a change
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(300); await p.keyboard.type('o1701'); await p.waitForSelector(ta);
  await p.waitForTimeout(800);
  assert.strictEqual(await p.inputValue(ta), 'Chores:\n\n• feed the hens\n• check the hives\n\nDone for the day.');
  assert.ok(!(await p.textContent('#clStatus')).includes('UNSAVED'), 'not a change');

  // ---- • LIST: whole lines in and out, keyboard stays with the box
  await p.click('[data-lday="2026-10-08"]'); await p.waitForTimeout(500);
  const t2 = '#clText-2026-10-08';
  await p.click(t2); await p.keyboard.type('eggs'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('milk');
  await p.evaluate(s => { const el = document.querySelector(s); el.setSelectionRange(0, el.value.length); }, t2);
  await p.click('[data-bul="clText-2026-10-08"]');
  assert.strictEqual(await p.inputValue(t2), '• eggs\n• milk');
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'clText-2026-10-08', 'focus stays in the box');
  await p.click('[data-bul="clText-2026-10-08"]');
  assert.strictEqual(await p.inputValue(t2), 'eggs\nmilk', 'and back');
  await p.evaluate(s => { const el = document.querySelector(s); el.setSelectionRange(el.value.length, el.value.length); }, t2);
  await p.keyboard.press('Shift+Enter'); await p.click('[data-bul="clText-2026-10-08"]'); await p.keyboard.type('bread');
  assert.strictEqual(await p.inputValue(t2), 'eggs\nmilk\n• bread', 'on an empty line it starts a bullet');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  assert.ok((await p.inputValue(t2)).length < 'eggs\nmilk\n• bread'.length, 'undo still works');
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(300);

  // ---- REVIEW
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  await p.locator('.rl-card[data-rweek]').first().click(); await p.waitForTimeout(800);
  await p.waitForSelector('#rv-wentWell', { timeout: 5000 });
  await p.click('#rv-wentWell'); await p.keyboard.type('- shipped the deck'); await p.keyboard.press('Enter'); await p.keyboard.type('hives checked');
  assert.strictEqual(await p.inputValue('#rv-wentWell'), '• shipped the deck\n• hives checked');
  const draft = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('tos.rdraft.v1'))));
  assert.ok(draft.includes('• shipped the deck\\n• hives checked'), 'kept in the draft');
  assert.strictEqual(await p.locator('.rv-lab [data-bul]').count(), 5, '• LIST on the four questions and the summary');
  await p.screenshot({ path: D + 'bullets-review.png' });
  // a plain dash in a sentence stays a dash
  await p.click('#rv-drained'); await p.keyboard.type('late calls - again');
  assert.strictEqual(await p.inputValue('#rv-drained'), 'late calls - again');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
