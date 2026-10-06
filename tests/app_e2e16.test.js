// Weekly Review: Sunday reminder on the Bridge, the Review screen (time, output,
// priorities kept, intent log, next week, reflection), drafts that survive a
// reload, saving and updating in Notion, and older bridges / unconnected database.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8096/x/exec?action=stats&key=' + K)).json());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-11T15:00:00-05:00'));   // Sunday afternoon
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', c);
    localStorage.setItem('tos.ignore.v1', JSON.stringify(['away block']));
    localStorage.setItem('tos.log.v1', JSON.stringify({ '2026-10-06': 'Deep work before noon', '2026-10-08': 'Be present at dinner' }));
  }, conn(port));

  // --- bridge 1.4: Review works with calendar data, Notion parts wait for 1.5, no reminder
  await setup(8095); await p.reload(); await p.waitForTimeout(1800);
  assert.ok(!(await p.textContent('.ov-cond')).includes('Weekly review due'), 'no reminder without bridge 1.5');
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(800);
  assert.ok((await p.textContent('#content')).includes('need bridge 1.5'));
  assert.ok(await p.isDisabled('[data-act="savereview"]'));

  // --- bridge 1.5: Sunday reminder
  await setup(8096); await p.reload(); await p.waitForTimeout(2000);
  const due = p.locator('.ov-alert:has-text("Weekly review due")');
  assert.strictEqual(await due.count(), 1, 'Sunday reminder on the Bridge');
  console.log('reminder:', (await due.innerText()).replace(/\s+/g, ' '));
  assert.ok((await due.innerText()).includes('WEEK 41 · 05 TO 11 OCT'));
  await due.click(); await p.waitForTimeout(1500);
  console.log('header:', await p.textContent('#eyebrow'), '|', await p.textContent('#title'));
  assert.strictEqual(await p.textContent('#title'), 'WEEK 41 · 05 TO 11 OCT');
  assert.ok((await p.textContent('#eyebrow')).startsWith('REVIEW · THIS WEEK'));
  assert.strictEqual(await p.getAttribute('[data-screen="review"].nav', 'aria-current'), 'page');

  const rows = (await p.locator('.rv-row').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('rows:', rows.join(' | '));
  assert.ok(rows[0].startsWith('WORK 7.5H'), 'work hours, weekend block ignored');
  assert.ok(rows[1].startsWith('PERSONAL 8H'), 'personal hours so far, all-day excluded');
  assert.ok(rows.some(r => r.startsWith('BEEKEEPING 1')), 'output by Life Area, plain labels');
  const kept = (await p.innerText('.rv-kept')).replace(/\s+/g, ' ');
  console.log('kept:', kept, '|', await p.textContent('.phead:has-text("PRIORITIES KEPT") .meta'));
  assert.ok(kept.startsWith('1 DONE 1 NOT DONE 2 PICKED'));
  assert.ok((await p.textContent('.phead:has-text("INTENT LOG")')).includes('2 OF 7 DAYS'));
  assert.ok((await p.textContent('.rv-log')).includes('Be present at dinner'));
  assert.ok((await p.textContent('#content')).includes('First frost risk'), 'next week shows the key date');
  const emoji = await p.evaluate(() => (document.body.innerText.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).join(''));
  assert.strictEqual(emoji, '', 'no emoji on the Review screen');

  // --- draft survives a reload
  await p.fill('#rv-wentWell', 'Shipped the deck early');
  await p.fill('#rv-drained', 'Evening calls');
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(1200);
  assert.strictEqual(await p.inputValue('#rv-wentWell'), 'Shipped the deck early', 'draft kept on the iPad');
  await p.fill('#rv-nextFocus', 'Hive winter prep');
  await p.screenshot({ path: D + 'review-ipad.png', fullPage: false });

  // --- save, then update
  await p.click('[data-act="savereview"]'); await p.waitForTimeout(1200);
  console.log('toast:', await p.textContent('#toast'));
  assert.strictEqual(await p.textContent('#toast'), 'Review saved to Notion');
  let s = await stats(), r = s.reviews['2026-10-05'];
  console.log('notion got:', JSON.stringify(r).slice(0, 320));
  assert.strictEqual(r.title, 'Week 41 · 05 to 11 Oct');
  assert.strictEqual(r.wentWell, 'Shipped the deck early'); assert.strictEqual(r.nextFocus, 'Hive winter prep'); assert.strictEqual(r.bearing, '');
  assert.strictEqual(r.hoursWork, 7.5); assert.strictEqual(r.hoursPersonal, 8); assert.strictEqual(r.hoursFarm, null);
  assert.strictEqual(r.tasksDone, 3); assert.strictEqual(r.picked, 2); assert.strictEqual(r.pickedDone, 1);
  assert.strictEqual(r.intents, 'TUE 06 · Deep work before noon\nTHU 08 · Be present at dinner');
  assert.ok(/Work & Calling 1/.test(r.byArea) && !/\p{Extended_Pictographic}/u.test(r.byArea));
  assert.ok((await p.textContent('#eyebrow')).includes('SAVED'));
  assert.ok(await p.isVisible('a.btn:has-text("OPEN IN NOTION")'));
  await p.fill('#rv-bearing', 'Mostly, yes');
  await p.click('[data-act="savereview"]'); await p.waitForTimeout(1200);
  assert.strictEqual(await p.textContent('#toast'), 'Review updated in Notion');
  s = await stats();
  assert.strictEqual(Object.keys(s.reviews).length, 1); assert.strictEqual(s.reviews['2026-10-05'].bearing, 'Mostly, yes');
  await p.click('.elbow'); await p.waitForTimeout(500);
  assert.strictEqual(await p.locator('.ov-alert:has-text("Weekly review due")').count(), 0, 'reminder clears once saved');

  // --- browse to last week; database not connected
  await fetch('http://127.0.0.1:8096/x/exec?action=unshare&key=' + K);
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(500);
  await p.click('#prevBtn'); await p.waitForTimeout(1500);
  console.log('prev:', await p.textContent('#title'), '|', await p.textContent('#eyebrow'));
  assert.strictEqual(await p.textContent('#title'), 'WEEK 40 · 28 SEP TO 04 OCT');
  assert.ok((await p.textContent('#content .err')).includes("isn't connected"));
  assert.ok(await p.isDisabled('[data-act="savereview"]'));
  assert.ok(rows.length && (await p.locator('.rv-row .dl').count()) >= 2, 'past weeks compare with the week before');

  // --- phone width
  await p.click('#todayBtn'); await p.waitForTimeout(500);
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'review-phone.png', fullPage: true });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll on a phone');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
