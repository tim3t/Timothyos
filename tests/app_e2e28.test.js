// Faster task list (2.12.1, bridge 1.18). Startup reads go in two batches (what's on screen first,
// the rest alongside), so the task list doesn't wait behind the ledger, library and balance. On a new
// day, Plan Day and Priorities show the most recent list at once (marked UPDATING), with today's picks
// from each task's Focus Date, then swap in the fresh list; picks you've changed meanwhile are kept.
// All tasks are invented sample data.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), M = 'http://127.0.0.1:8103/x/exec?key=' + K + '&action=';
const call = async q => (await (await fetch(M + q)).json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const picked = p => p.$$eval('#planSheet .cand[aria-pressed="true"] b', bs => bs.map(b => b.textContent));

(async () => {
  // yesterday's list as the iPad last saw it, with "Send Q4 deck draft" picked for today
  const y = await call('tasks&day=2026-10-05');
  y.open.forEach(t => { if (t.title === 'Send Q4 deck draft') t.focus = '2026-10-06'; });
  const cached = { '2026-10-05': { fetched: Date.parse('2026-10-05T21:00:00-05:00'), focus: y.focus, open: y.open, areas: y.areas, priorities: y.priorities } };
  await call('tslow&s=3');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T08:27:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8103/macros/s/test/exec', key: 'k'.repeat(64) })); localStorage.setItem('tos.tasks.v1', JSON.stringify(c)); }, cached);
  const before = (await call('stats')).batches.length;
  await p.reload(); await p.waitForTimeout(500);

  // ---- Plan Day opens on yesterday's list straight away, marked UPDATING, today's pick from Focus Date
  await p.click('#planBtn'); await p.waitForTimeout(300);
  const head = await txt(p, '#planSheet .sbar');
  console.log('at once:', head, '|', await picked(p));
  assert.ok(head.includes('· UPDATING'), 'provisional');
  assert.ok(!(await txt(p, '#planSheet')).includes('Loading your Master Task List'));
  assert.deepStrictEqual(await picked(p), ['Send Q4 deck draft']);
  await p.screenshot({ path: D + 'plan-provisional.png' });

  // ---- the fresh list arrives: UPDATING goes, picks follow Notion (nothing was touched)
  await p.waitForFunction(() => !document.getElementById('planCount').textContent.includes('UPDATING'), null, { timeout: 15000 });
  console.log('fresh:', await txt(p, '#planSheet .sbar'), '|', await picked(p));
  assert.deepStrictEqual(await picked(p), ['Renew registration']);
  await p.click('#planSheet [data-act="cancel"], #planCancel').catch(async () => { await p.keyboard.press('Escape'); });
  await p.waitForTimeout(400);

  // ---- the reads went in two batches: on-screen first, the rest alongside
  const batches = (await call('stats')).batches.slice(before);
  console.log('batches:', JSON.stringify(batches));
  const withTasks = batches.filter(x => x.includes('tasks'));
  assert.ok(withTasks.length >= 1);
  withTasks.forEach(x => ['done', 'ledger', 'library', 'aispend', 'week', 'reviews'].forEach(a => assert.ok(!x.includes(a), 'tasks never waits behind ' + a)));

  // ---- a pick changed while UPDATING is kept when the fresh list lands
  await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('tos.tasks.v1')); delete t['2026-10-06']; localStorage.setItem('tos.tasks.v1', JSON.stringify(t)); });
  await p.evaluate(c => localStorage.setItem('tos.tasks.v1', JSON.stringify(c)), cached);
  await p.reload(); await p.waitForTimeout(500);
  await p.click('#planBtn'); await p.waitForTimeout(300);
  assert.ok((await txt(p, '#planSheet .sbar')).includes('UPDATING'));
  await p.click('#planSheet .cand:has-text("Sugar syrup for Hive 2")');
  await p.waitForFunction(() => !document.getElementById('planCount').textContent.includes('UPDATING'), null, { timeout: 15000 });
  const kept = await picked(p);
  console.log('kept:', kept);
  assert.ok(kept.includes('Sugar syrup for Hive 2') && kept.includes('Send Q4 deck draft'), 'your changes stand');

  await call('tslow&s=0');
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
