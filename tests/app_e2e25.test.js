// NEEDS YOU (2.10.0). A Condition item that is fixed on Systems (here: the task list didn't load)
// opens Systems with a card at the top naming the problem, numbered steps back to green that match
// the error, a button that does the first step and a jump to the section with the details. A
// right-edge tab brings you back to the card once it's scrolled away. When it's fixed the card says
// so and offers BACK TO BRIDGE. All tasks are invented sample data.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8102/x/exec?key=' + K + '&action=';
const call = async q => (await (await fetch(M + q)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const inView = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(), c = document.getElementById('content').getBoundingClientRect(); return r.top >= c.top - 2 && r.top < c.bottom - 40; }, sel);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-08T16:40:00-05:00'));
  await call('tfail&n=50&code=notion_not_shared');
  await p.goto('http://localhost:8080/');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8102/macros/s/test/exec', key: 'k'.repeat(64) })); });
  await p.reload(); await p.waitForTimeout(2500);

  // ---- the Bridge: the item says where it's fixed
  const item = p.locator('.ov-alert', { hasText: "Task list didn't load" });
  assert.strictEqual(await item.count(), 1, 'condition item shown');
  assert.strictEqual(await item.getAttribute('data-fix'), 'tasks');
  const others = await p.locator('.ov-alert').count() - 1;

  // ---- tap it: Systems opens on the matching card, steps fit the error
  await item.click(); await p.waitForTimeout(700);
  assert.strictEqual(await p.evaluate(() => document.querySelector('.sys').firstElementChild.id), 'fixPanel', 'NEEDS YOU is first on Systems');
  const card = await txt(p, '#fix-tasks');
  console.log('card:', card);
  assert.ok(card.includes("Task list didn't load") && card.includes('YELLOW') && card.includes('TO RETURN TO GREEN'));
  assert.ok(card.includes('Connections') && card.includes('TimothyOS') && card.includes('RETRY NOW'), 'steps for a database not connected');
  assert.ok(card.includes('DETAILS IN NOTION'));
  if (others > 0) assert.ok((await txt(p, '#fixPanel .phead')).includes(others + ' MORE ON THE BRIDGE'));
  assert.ok(await p.evaluate(() => document.getElementById('fix-tasks').classList.contains('flash')), 'the card flashes on arrival');
  assert.ok(await p.isHidden('#fixJump'), 'no tab while the card is in view');
  await p.screenshot({ path: D + 'needs-you.png' });

  // ---- DETAILS jumps to the Notion section
  await p.click('#fix-tasks [data-jump="sec-notion"]'); await p.waitForTimeout(900);
  assert.ok(await inView(p, '#sec-notion'), 'Notion section in view');
  assert.ok((await txt(p, '#sec-notion')).includes('ERROR'));

  // ---- the right-edge tab brings the card back
  await p.waitForSelector('#fixJump:not([hidden])', { timeout: 2000 });
  const tab = await p.evaluate(() => { const r = document.getElementById('fixJump').getBoundingClientRect(); return [Math.round(r.right), innerWidth, document.getElementById('fixJump').textContent]; });
  console.log('tab:', tab);
  assert.ok(Math.abs(tab[0] - tab[1]) <= 1 && tab[2].includes('1 NEEDS YOU'), 'right-aligned tab');
  await p.screenshot({ path: D + 'needs-you-tab.png' });
  await p.click('#fixJump'); await p.waitForTimeout(900);
  assert.ok(await inView(p, '#fixPanel'), 'back at the card');
  await p.waitForTimeout(200);
  assert.ok(await p.isHidden('#fixJump'));

  // ---- RETRY NOW while it's still broken: says so, card stays
  await p.click('[data-act="fixtasks"]'); await p.waitForTimeout(1500);
  assert.ok((await p.textContent('#toast')).includes('Still not working'));
  assert.strictEqual(await p.locator('#fix-tasks').count(), 1);

  // ---- a slow Notion gets the general steps
  await call('tfail&n=50&code=notion_busy');
  await p.click('[data-act="fixtasks"]'); await p.waitForTimeout(500);
  await p.waitForSelector('[data-act="fixtasks"]:not([disabled])', { timeout: 30000 });   // Notion busy is retried before it gives up
  const busy = await txt(p, '#fix-tasks');
  assert.ok(busy.includes('Most of these clear on the next try') && busy.includes('Executions'), busy);

  // ---- fixed: the card says so and offers the way back
  await call('tfail&n=0');
  await p.click('[data-act="fixtasks"]'); await p.waitForTimeout(1500);
  assert.ok((await p.textContent('#toast')).includes('Task list loaded'));
  const done = await txt(p, '#fixPanel');
  console.log('done:', done);
  assert.ok(done.includes('ALL FIXED') && done.includes('BACK TO BRIDGE'));
  assert.ok(await p.isHidden('#fixJump'));
  assert.ok((await txt(p, '#sec-notion')).includes('OK'));
  await p.screenshot({ path: D + 'needs-you-fixed.png' });
  await p.click('[data-act="fixdone"]'); await p.waitForTimeout(800);
  assert.strictEqual(await p.locator('.ov-alert', { hasText: "Task list didn't load" }).count(), 0, 'gone from the Condition');

  // ---- Systems on its own, nothing to fix: no panel
  await p.click('#status'); await p.waitForTimeout(600);
  assert.strictEqual(await p.locator('#fixPanel').count(), 0);

  // ---- phone width
  await call('tfail&n=50&code=notion_busy');
  await p.evaluate(() => { localStorage.removeItem('tos.tasks.v1'); });
  await p.setViewportSize({ width: 400, height: 860 });
  await p.reload(); await p.waitForTimeout(2500);
  await p.locator('.ov-alert', { hasText: "Task list didn't load" }).click(); await p.waitForTimeout(700);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400, 'no sideways scroll');
  await p.screenshot({ path: D + 'needs-you-phone.png' });
  await call('tfail&n=0');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
