// WEEKLY NOTION EXPORT and ASK's breaks (2.65, bridge 1.41; simulated bridge :8105, invented status only). SYSTEMS →
// NOTION → Weekly export: the last copy (when, pages, databases, size, what was left out, OPEN IN DRIVE), EXPORT NOW
// (starts a run, the row follows it, a second tap waits), the run finishing, a stalled run woken, no Drive access yet
// (SETUP with the fix), Drive full on EXPORT NOW, not scheduled, an older bridge. The Bridge's condition says when the
// export failed or is over 9 days old. ASK sends the break names with each question so the bridge keeps a lunch held as
// Out of office as a BREAK. Phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=exportmode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=stats').then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const row = p => txt(p, '#sec-notion').then(t => t.slice(t.indexOf('Weekly export')));

(async () => {
  await mode('cap=1&state=ok&nowerr=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.breaks.v1', JSON.stringify(['Lunch', 'Walk'])); localStorage.setItem('tos.ignore.v1', JSON.stringify(['Out of office'])); }, [K, U]);
  const fresh = async st => { await mode('state=' + st); await p.evaluate(() => localStorage.removeItem('tos.export.v1')); await p.reload(); await p.waitForTimeout(1800); };
  const systems = async () => { await p.click('#status'); await p.waitForSelector('#sec-notion'); await until(async () => !/Checking…/.test(await row(p))); return row(p); };
  const cond = async (re) => { await p.locator('[data-screen="bridge"]:visible').first().click(); await p.waitForSelector('#content .rb-alerts');
    const t = async () => (await p.textContent('#content .rb-alerts')).replace(/\s+/g, ' ').trim();
    if (re) { try { await until(async () => re.test(await t()), 5000); } catch (e) { /* the assert below shows the text */ } } else await p.waitForTimeout(800);
    return t(); };
  await p.reload(); await p.waitForTimeout(1800);

  // ---- the last copy, in SYSTEMS
  let r = await systems();
  console.log('ok:', r.slice(0, 240));
  assert.ok(/^Weekly export Sundays about 03:00 to Google Drive · last .+ · 1234 pages from 15 databases · 5\.1 MB · newest 12 kept Left out: Tarot Books \(notion_not_shared\) OK EXPORT NOW OPEN IN DRIVE/.test(r), r);
  assert.strictEqual(await p.getAttribute('#sec-notion a.btn', 'href'), 'https://drive.google.com/drive/folders/root-1');
  assert.strictEqual(await p.getAttribute('#sec-notion a.btn', 'target'), '_blank');
  assert.ok(!/Notion export/.test(await cond()), 'a fresh export puts nothing in the condition');

  // ---- EXPORT NOW starts a run; the row follows it; a second tap waits; the run finishing is picked up
  await systems();
  await p.click('[data-act="exportnow"]');
  await until(async () => /Exporting · 1 of 16 · Master Task List · 0 pages so far/.test(await row(p)));
  assert.ok(/RUNNING/.test(await row(p)) && await p.isDisabled('[data-act="exportnow"]'), 'one run at a time');
  assert.ok(/Export starting/.test(await txt(p, '#toast')));
  assert.strictEqual((await mode('')).now, 1);
  await mode('finish=1');
  await until(async () => /OK EXPORT NOW/.test(await row(p)), 26000);   // looked at again within 20 s while SYSTEMS is open
  assert.ok(!(await p.isDisabled('[data-act="exportnow"]')));

  // ---- a stalled run: STALLED, and EXPORT NOW wakes it
  await fresh('stalled'); r = await systems();
  assert.ok(/Stalled at 5 of 16 · Captain's Log · 230 pages so far\. EXPORT NOW wakes it\. STALLED/.test(r), r);
  await p.click('[data-act="exportnow"]');
  await until(async () => /Exporting · 1 of 16/.test(await row(p)));

  // ---- no Drive access yet: SETUP with the fix, and the condition says so
  await fresh('failed&err=drive_scope'); r = await systems();
  assert.ok(/The bridge has no Drive access yet: add the oauthScopes block to appsscript.json, then run setup and allow access \(README → Weekly Notion export\)\. SETUP/.test(r), r);
  assert.ok(!(await p.$('#sec-notion a.btn')), 'no Drive link without an export');
  let c = await cond(/Notion export failed/);
  assert.ok(/Notion export failed\s*The bridge needs Drive access\. SYSTEMS → NOTION has the steps\./.test(c), c);

  // ---- over 9 days old: the condition
  await fresh('old'); c = await cond(/Notion export is/);
  assert.ok(/Notion export is 15 days old\s*The weekly copy to Google Drive hasn't run\. SYSTEMS → NOTION → EXPORT NOW\./.test(c), c);
  r = await systems(); assert.ok(/ OLD EXPORT NOW/.test(r), r);

  // ---- Drive full on EXPORT NOW: said plainly, logged, and the row shows it
  await mode('nowerr=drive_full'); await p.click('[data-act="exportnow"]');
  await until(async () => /Not started: Google Drive is full/.test(await txt(p, '#toast')));
  await until(async () => /Google Drive is full\. Free some space, then EXPORT NOW\. FAILED/.test(await row(p)));
  assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.errlog.v1'))).some(e => e.s === 'bridge' && e.a === 'exportnow' && /drive_full/.test(e.m)), 'in the error log');
  await mode('nowerr=0');

  // ---- not scheduled yet, and never exported
  await fresh('unscheduled'); r = await systems();
  assert.ok(/Not scheduled: run setup in the script editor once \(README → Weekly Notion export\)\. NONE/.test(r), r);
  await fresh('none'); r = await systems();
  assert.ok(/No export yet: EXPORT NOW makes the first\. NONE/.test(r), r);

  // ---- an older bridge: the row asks for the update, nothing else changes
  await mode('cap=0&state=ok');
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (!/^tos\.(conn|start|breaks|ignore)\.v1$/.test(k)) localStorage.removeItem(k); });
  await p.reload(); await p.waitForTimeout(2500); r = await systems();
  assert.ok(/^Weekly export Needs the Google bridge updated to \d+\.\d+\.\d+\. SETUP/.test(r), r);
  await mode('cap=1');

  // ---- ASK sends the break names with the ignored titles
  await p.locator('[data-screen="bridge"]:visible').first().click(); await p.waitForTimeout(500);
  await p.click('#askBtn'); await p.waitForSelector('#askText');
  await p.fill('#askText', 'When am I free today?'); await p.click('#askSend');
  const a = await until(async () => (await stats()).asks.filter(x => x.last === 'When am I free today?').pop());
  assert.deepStrictEqual([a.ignore, a.breaks], [['Out of office'], ['Lunch', 'Walk']]);
  await p.keyboard.press('Escape');

  // ---- phone width: the row fits
  await mode('state=ok'); await p.setViewportSize({ width: 390, height: 844 }); await fresh('ok'); await systems();
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  await b.close();
  await mode('cap=0&state=none&nowerr=0');
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  console.log('ok app_e2e80');
})().catch(e => { console.error(e); process.exit(1); });
