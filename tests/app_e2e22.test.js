// Captain's Log (bridge 1.10): PIN pad (keys + keyboard), wrong tries, calendar of days,
// write + autosave + draft kept until saved, edit a past day, Notion-only pages read-only,
// locks on leaving / background / LOCK, nothing stored on the iPad, import from a diary
// export, kept out of Ask, lockout after five misses. All sample text is invented.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8101/x/exec?action=stats&key=' + K)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const stored = p => p.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\n'));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T20:14:00-05:00'));
  await p.goto('http://localhost:8080/');
  const setup = port => p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"today"'); localStorage.setItem('tos.bearings.v1', JSON.stringify(['Steady hands', 'Open door'])); localStorage.setItem('tos.log.v1', JSON.stringify({ '2026-10-07': 'Finish the pond edge' })); }, conn(port));

  // --- bridge 1.9: LOG explains what it needs
  await setup(8100); await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);
  assert.ok((await p.textContent('#content')).includes('needs bridge 1.10'));

  // --- bridge 1.10: locked on arrival
  await setup(8101); await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);
  assert.strictEqual(await p.textContent('#title'), "CAPTAIN'S LOG");
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · LOCKED');
  assert.ok(await p.isHidden('#pager')); assert.ok(await p.isHidden('#todayBtn'));
  assert.strictEqual(await p.locator('.cl-key').count(), 11);
  await p.screenshot({ path: D + 'e2e22_lock.png' });
  // a wrong PIN on the keypad
  for (const k of '111111') await p.click('[data-lpin="' + k + '"]');
  await p.waitForTimeout(700);
  console.log('wrong:', await txt(p, '.cl-msg'));
  assert.ok((await txt(p, '.cl-msg')).includes('Not that one. 4 tries left'));
  assert.strictEqual(await p.locator('.cl-dots i.on').count(), 0);
  // the right one from the keyboard, with a correction
  await p.keyboard.type('1357'); await p.keyboard.press('Backspace'); await p.keyboard.type('790');
  await p.waitForTimeout(1200);
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · OPEN');
  assert.strictEqual((await stats()).logfails, 0, 'right PIN resets the count');
  const cal = await txt(p, '.cl-cal');
  console.log('calendar:', cal.slice(0, 90));
  assert.ok(cal.includes('OCTOBER 2026'));
  assert.strictEqual(await p.getAttribute('[data-lday="2026-10-05"]', 'class'), 'cl-day has');
  assert.ok((await p.getAttribute('[data-lday="2026-10-07"]', 'class')).includes('today'));
  assert.strictEqual(await p.getAttribute('[data-lday="2026-10-07"]', 'aria-current'), 'date');
  assert.ok(await p.isDisabled('.cl-day:not(.out) >> text="8"'), 'future days closed');
  assert.ok((await txt(p, '.cl-page')).includes('INTENT Finish the pond edge'), "today's intent shown above the page");

  // write today: kept on the iPad until it reaches Notion, then removed
  await p.click('#clText-2026-10-07'); await p.keyboard.type('Quiet evening by the pond.');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('Bees calm.');
  assert.ok((await stored(p)).includes('Bees calm.'), 'draft kept while unsaved');
  assert.ok((await txt(p, '#clStatus')).includes('UNSAVED'));
  await p.waitForTimeout(6500);
  let s = await stats();
  assert.strictEqual(s.log['2026-10-07'], 'Quiet evening by the pond.\n\nBees calm.');
  assert.ok(!(await stored(p)).includes('Bees calm'), 'draft gone once saved');
  assert.ok((await txt(p, '#clStatus')).startsWith('SAVED'));
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'clText-2026-10-07', 'still writing');
  // + BEARINGS adds the guiding words as a closing block
  await p.click('[data-lact="bearings"]');
  assert.ok((await p.inputValue('#clText-2026-10-07')).endsWith('Bees calm.\n\n—\n\nSteady hands: \n\nOpen door: '));
  await p.keyboard.type('yes'); await p.click('[data-lact="save"]'); await p.waitForTimeout(800);
  assert.ok((await stats()).log['2026-10-07'].endsWith('Open door: yes'));

  // an earlier day: read, edit, save
  await p.click('[data-lday="2026-10-05"]'); await p.waitForTimeout(700);
  assert.strictEqual(await p.inputValue('#clText-2026-10-05'), 'Planted the garlic.\n\nQuiet evening.');
  assert.ok((await txt(p, '.cl-page')).startsWith('MONDAY'));
  await p.fill('#clText-2026-10-05', 'Planted the garlic. Two beds.\n\nQuiet evening.');
  await p.dispatchEvent('#clText-2026-10-05', 'input');
  await p.click('[data-lact="save"]'); await p.waitForTimeout(800);
  assert.strictEqual((await stats()).log['2026-10-05'], 'Planted the garlic. Two beds.\n\nQuiet evening.');
  // a page with a photo added in Notion: read here, change it in Notion
  await p.click('[data-lday="2026-10-01"]'); await p.waitForTimeout(700);
  assert.ok(await p.getAttribute('#clText-2026-10-01', 'readonly') !== null);
  assert.strictEqual(await p.locator('[data-lact="save"]').count(), 0);
  assert.ok((await txt(p, '.cl-page')).includes("change it in Notion"));
  // last month
  await p.click('[data-lmon="-1"]'); await p.waitForTimeout(200);
  assert.ok((await txt(p, '.cl-mon')).includes('SEPTEMBER 2026'));
  await p.click('[data-lday="2026-09-14"]'); await p.waitForTimeout(700);
  assert.strictEqual(await p.inputValue('#clText-2026-09-14'), 'A September page.');
  await p.screenshot({ path: D + 'e2e22_open.png' });

  // leaving LOG locks it and drops the text; nothing written stays on the iPad
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(400);
  const ls = await stored(p);
  assert.ok(!/garlic|September page|Bees calm|Quiet evening/.test(ls), 'no entry text in localStorage');
  assert.ok(!/garlic|September page/.test(await p.content()), 'none in the page either');
  assert.ok(!ls.includes('135790'), 'PIN never stored');
  await p.click('[data-screen="log"].nav'); await p.waitForTimeout(300);
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · LOCKED', 'asks again');
  // unsaved writing at lock time still reaches Notion
  await p.keyboard.type('135790'); await p.waitForTimeout(1000);
  await p.click('#clText-2026-10-07'); await p.keyboard.press('Control+End'); await p.keyboard.type(' Late note.');
  await p.click('[data-lact="lock"]'); await p.waitForTimeout(1000);
  assert.ok((await stats()).log['2026-10-07'].endsWith('Late note.'));
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · LOCKED');
  // going to the background locks it
  await p.keyboard.type('135790'); await p.waitForTimeout(1000);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; });
  await p.waitForTimeout(200);
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · LOCKED');
  assert.strictEqual(await p.locator('.cl-text').count(), 0);

  // import from a diary export
  await p.keyboard.type('135790'); await p.waitForTimeout(1000);
  await p.click('[data-lact="import"]');
  const exp = 'Exported from a diary app\n\nSaturday, March 7, 2026\nFirst imported page.\n\nSecond paragraph.\n\nSunday, March 8, 2026\nA short one.\n\nSunday, March 8, 2026\nA second note the same day.\n\nMonday, October 5, 2026\nThis day is already written.\n\nWednesday, March 10, 2026\nHeaded on the wrong weekday.\n\nSent from my iPad\n';
  await p.fill('#clImp', exp); await p.click('[data-lact="impcheck"]'); await p.waitForTimeout(200);
  const sum = await txt(p, '.cl-page');
  console.log('import check:', sum.slice(0, 260));
  assert.ok(sum.includes('ENTRIES 4') && sum.includes('ALREADY HERE 1'));
  assert.ok(sum.includes('appears twice') && sum.includes('headed Wednesday') && sum.includes('Text before the first date'));
  assert.ok(!(await stored(p)).includes('First imported page'), 'pasted text not stored');
  await p.click('[data-lact="imprun"]'); await p.waitForTimeout(2000);
  assert.ok((await txt(p, '.cl-page')).includes('3 added · 1 already there'));
  s = await stats();
  assert.strictEqual(s.log['2026-03-08'], 'A short one.\n\n· · ·\n\nA second note the same day.');
  assert.strictEqual(s.log['2026-03-10'], 'Headed on the wrong weekday.', 'iPad sign-off dropped');
  assert.strictEqual(s.log['2026-10-05'], 'Planted the garlic. Two beds.\n\nQuiet evening.', 'existing day untouched');
  await p.click('[data-lact="impcancel"]'); await p.waitForTimeout(300);
  for (let i = 0; i < 7; i++) await p.click('[data-lmon="-1"]');
  assert.ok((await p.getAttribute('[data-lday="2026-03-07"]', 'class')).includes('has'));

  // Ask never receives the log
  await p.click('[data-screen="today"].nav'); await p.waitForTimeout(300);
  await p.click('#askBtn'); await p.fill('#askText', 'What should I do first today?'); await p.click('#askSend'); await p.waitForTimeout(1000);
  s = await stats(); const ask = s.asks[s.asks.length - 1].ctx;
  assert.ok(!/garlic|Bees calm|imported page|September page/.test(ask), 'log text not in Ask');
  assert.ok(ask.includes("TODAY'S INTENT: Finish the pond edge"));
  await p.keyboard.press('Escape');

  // Systems: status, no entry text
  await p.click('#status'); await p.waitForTimeout(400);
  const sys = await txt(p, '#content');
  assert.ok(sys.includes("CAPTAIN'S LOG PIN-LOCKED") && sys.includes('never sent to Ask'));

  // phone width
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('[data-screen="log"].nav'); await p.keyboard.type('135790'); await p.waitForTimeout(1000);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
  await p.screenshot({ path: D + 'e2e22_phone.png', fullPage: true });
  await p.setViewportSize({ width: 1180, height: 820 });

  // five misses lock it, even for the right PIN
  await p.click('[data-lact="lock"]');
  for (let i = 0; i < 5; i++) { await p.keyboard.type('000000'); await p.waitForTimeout(500); }
  assert.ok((await txt(p, '.cl-msg')).includes('Locked for 15 minutes'));
  await p.keyboard.type('135790'); await p.waitForTimeout(600);
  assert.strictEqual(await p.textContent('#eyebrow'), 'JOURNAL · LOCKED');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
