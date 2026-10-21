// APIARY (2.31, bridge 1.26; simulated on :8105, invented hives and checks): the yard draws each hive as its box
// stack with the last check and an open issue; tapping a hive zooms to it (its stack, NEXT TIME, its checks, ABOUT);
// a box tells what it held; a check opens with EARLIER / LATER; a new check in five steps (picks, frame counts,
// a super added, mite load worked out) is saved as plain sentences with the stack and a reminder task, and offers
// the other hive next; a check edited and deleted (two taps); a hive added from the yard; the yard list ticked and
// added to; a failed save waits with RETRY; Systems' row and SHARE WITH ASK; no emoji; phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), B = 'http://127.0.0.1:8105/macros/s/test/exec?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const aps = () => fetch(B + '&action=apstats').then(r => r.json());
const stats = () => fetch(B + '&action=stats').then(r => r.json());
const mode = q => fetch(B + '&action=apmode&' + q).then(r => r.json());
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const emoji = p => p.evaluate(() => (document.querySelector('#content').innerText.match(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).join(''));

(async () => {
  await mode('on=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'week', 'apiary']));
  }, K);
  await p.reload(); await p.waitForSelector('[data-screen="apiary"].nav', { timeout: 10000 });

  // ---- the yard
  await p.click('[data-screen="apiary"].nav'); await p.waitForSelector('.ap-hivebtn');
  assert.strictEqual(await txt(p, '#title'), 'APIARY');
  assert.ok((await txt(p, '#eyebrow')).includes('2 HIVES'));
  assert.strictEqual(await p.locator('.ap-hivebtn').count(), 2);
  let yard = await txt(p, '.ap-yard');
  assert.ok(yard.includes('JUNIPER') && yard.includes('Queen Ivy') && yard.includes('BRAMBLE') && yard.includes('● Traps left on the lower box'), yard);
  assert.ok(yard.includes('18 LB') && yard.includes('MITE CHECKS 0 OF 4') && yard.includes('FACING SE') && yard.includes('Sample site note.'), yard);
  assert.strictEqual(await p.locator('[data-aphive="ap-h1"] .ap-stack .box').count(), 3, 'super and two deeps');
  assert.strictEqual(await p.locator('[data-aphive="ap-h1"] .box.deep:not(.unknown) .f.on').count(), 8, 'eight frames drawn in the bottom deep');
  assert.strictEqual(await emoji(p), '', 'no emoji in the yard');
  await p.screenshot({ path: D + 'apiary-yard.png' });

  // ---- zoom to a hive
  await p.click('[data-aphive="ap-h1"]'); await p.waitForSelector('.ap-hive .ap-stage');
  assert.strictEqual(await txt(p, '#title'), 'JUNIPER');
  assert.ok((await txt(p, '#eyebrow')).includes('QUEEN IVY'));
  assert.strictEqual(await txt(p, '.ap-crumbs'), 'APIARY › JUNIPER');
  assert.ok((await txt(p, '.ap-next')).includes('Move the traps up'));
  assert.strictEqual(await p.locator('.ap-crow').count(), 2);
  assert.ok((await txt(p, '.ap-crow:nth-child(1)')).includes('ISSUE'));
  assert.ok((await txt(p, '.ap-crow:nth-child(2)')).includes('MITES 1.3%'));
  await p.click('.ap-stage [data-apbox="1"]');
  assert.ok((await txt(p, '#apReadout')).startsWith('TOP DEEP Not counted'), await txt(p, '#apReadout'));
  await p.click('.ap-stage [data-apbox="2"]');
  assert.ok((await txt(p, '#apReadout')).includes('BOTTOM DEEP 8 of 10'));
  await p.click('#apAbout summary');
  assert.ok((await txt(p, '#apAbout')).includes('Sample foundation'));
  await p.screenshot({ path: D + 'apiary-hive.png' });

  // ---- one check, then the one before it
  await p.click('[data-apcheck="ap-c1"]'); await p.waitForSelector('.ap-card .ap-facts');
  let card = await txt(p, '.ap-card');
  assert.ok(card.includes('ISSUE Traps left on the lower box') && card.includes('NEXT TIME Move the traps up') && card.includes('SOLO'), card);
  await p.click('[data-apstep="1"]');
  assert.ok((await txt(p, '.ap-card')).includes('MITE LOAD 1.3% · fine'));
  assert.ok(await p.isDisabled('[data-apstep="1"]'), 'nothing earlier');
  await p.click('.ap-crumbs [data-apgo="hive"]'); await p.waitForSelector('.ap-checks');

  // ---- a new check, five steps
  await p.click('[data-apact="new"]'); await p.waitForSelector('.ap-steps');
  assert.strictEqual(await txt(p, '.ap-crumbs'), 'APIARY › JUNIPER › NEW CHECK');
  for (const v of ['EGGS', 'LARVAE', 'SOLID', 'CALM']) await p.click('.ap-q [data-apv="' + v + '"]');
  await p.fill('#apWho', 'Solo, sample');
  await p.click('[data-apact="fwd"]');
  await p.click('[data-apn="drawn"][data-api="2"][data-apd="1"]');              // bottom deep: last 8, now 9
  for (let i = 0; i < 3; i++) await p.click('[data-apn="drawn"][data-api="1"][data-apd="1"]');   // top deep: first count
  await p.click('[data-apfill="0"][data-apv="50"]');
  await p.click('[data-apbx="super"]');
  assert.strictEqual(await p.locator('.ap-stage .ap-stack .box').count(), 4, 'the stack follows: a second super');
  assert.strictEqual(await p.locator('.ap-stage .box.deep').nth(0).locator('.f.on').count(), 3);
  await p.click('[data-apact="fwd"]');
  await p.click('.ap-q [data-apf="honey"][data-apv="OK"]'); await p.click('.ap-q [data-apv="REFILLED 1:1"]');
  await p.click('[data-apact="fwd"]');
  await p.click('.ap-q [data-apv="SUGAR ROLL"]');
  for (let i = 0; i < 5; i++) await p.click('[data-apn="mites"][data-apd="1"]');
  assert.strictEqual(await txt(p, '.ap-pct'), '1.7%');
  await p.click('[data-apact="fwd"]');
  await p.click('.ap-q [data-apv="FED"]');
  await p.fill('#apNotes', 'Sample note about the check');
  await p.fill('#apNext', 'Sample next time');
  await p.click('[data-apremind]');
  assert.ok((await txt(p, '.ap-q')).includes('Hive check: Juniper'));
  await p.screenshot({ path: D + 'apiary-new.png' });
  await p.click('[data-apact="save"]'); await p.waitForSelector('.ap-saved');
  assert.ok((await txt(p, '.ap-saved')).includes('CHECK BRAMBLE NEXT'));
  await until(async () => (await aps()).saves.length === 1);
  const sv = (await aps()).saves[0];
  assert.deepStrictEqual([sv.kind, sv.hive, sv.who, sv.queen, sv.mood, sv.feed, sv.mites, sv.notes, sv.next], ['check', 'ap-h1', 'Solo, sample', 'Eggs, larvae; solid pattern', 'Calm', 'Refilled 1:1', 1.7, 'Sample note about the check', 'Sample next time']);
  assert.strictEqual(sv.frames, 'Bottom deep 9/10 drawn; Top deep 3/10 drawn; Bottom super 50% capped; Top super 0% capped');
  assert.strictEqual(sv.pests, 'Sugar roll: 5 mites (1.7%)');
  assert.strictEqual(sv.did, 'Added a super; Fed');
  assert.strictEqual(sv.stores, 'Honey ok');
  assert.deepStrictEqual(sv.boxes.map(x => x.k + ':' + (x.k === 'deep' ? x.drawn : x.fill)), ['super:0', 'super:0.5', 'deep:3', 'deep:9']);
  assert.deepStrictEqual(sv.data.deeps, [9, 3]);
  await until(async () => (await stats()).tasks.some(t => t[0] === 'Hive check: Juniper'));
  await until(async () => (await p.locator('.ap-crow.fresh').count()) === 1 && !(await txt(p, '.ap-checks')).includes('NOT SAVED YET'));
  assert.strictEqual(await p.locator('.ap-crow').count(), 3);
  assert.strictEqual(await p.locator('.ap-stage .ap-stack .box').count(), 4, 'the hive keeps the new stack');
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.apdraft.v1')), null, 'the draft is gone once saved');

  // ---- the next hive straight away, then back
  await p.click('[data-apnextcheck="ap-h2"]'); await p.waitForSelector('.ap-steps');
  assert.strictEqual(await txt(p, '#title'), 'BRAMBLE');
  await p.click('[data-apact="cancel"]'); await p.waitForSelector('.ap-checks');

  // ---- edit, then delete, the new check on Juniper
  await p.click('.ap-crumbs [data-apgo="yard"]'); await p.waitForSelector('.ap-hivebtn');
  await p.click('[data-aphive="ap-h1"]'); await p.waitForSelector('.ap-checks');
  const nid = sv.id || (await aps()).checks.filter(c => c.hive === 'ap-h1').sort((x, y) => (x.created < y.created ? 1 : -1))[0].id;
  await p.click('.ap-crow:nth-child(1)'); await p.waitForSelector('.ap-card .ap-facts');
  await p.click('[data-apact="editcheck"]'); await p.waitForSelector('#apE-notes');
  await p.fill('#apE-notes', 'Changed sample note');
  await p.fill('#apE-honey', '2.5');
  await p.click('[data-apact="savecheck"]'); await p.waitForSelector('.ap-card .ap-facts');
  await until(async () => (await aps()).saves.length === 2);
  const ed = (await aps()).saves[1];
  assert.deepStrictEqual([ed.id, ed.notes, ed.honey, ed.cid], [nid, 'Changed sample note', 2.5, undefined]);
  assert.ok((await txt(p, '.ap-card')).includes('HONEY 2.5 lb'));
  await p.click('[data-apdel]');
  assert.strictEqual(await txt(p, '[data-apdel]'), 'TAP AGAIN TO DELETE');
  await p.click('[data-apdel]'); await p.waitForSelector('.ap-checks');
  await until(async () => (await aps()).removes.includes(nid));
  assert.strictEqual(await p.locator('.ap-crow').count(), 2);

  // ---- add a hive from the yard
  await p.click('.ap-crumbs [data-apgo="yard"]'); await p.waitForSelector('.ap-addslot');
  await p.click('[data-apact="addhive"]'); await p.waitForSelector('#apH-name');
  await p.fill('#apH-name', 'Clover'); await p.fill('#apH-queen', 'Mint');
  await p.click('[data-appaint="2"]');
  await p.click('[data-apn="fdeep"][data-apd="1"]');
  assert.strictEqual(await p.locator('.ap-stage .box.deep').count(), 2);
  await p.click('[data-apact="savehive"]'); await p.waitForSelector('.ap-hhead');
  assert.strictEqual(await txt(p, '#title'), 'CLOVER');
  await until(async () => (await aps()).saves.some(x => x.kind === 'hive' && x.name === 'Clover'));
  const nh = (await aps()).saves.filter(x => x.kind === 'hive')[0];
  assert.deepStrictEqual([nh.queen, nh.data.order, nh.data.paint, nh.data.boxes.length], ['Mint', 3, '#3b7d5a', 2]);
  await p.click('.ap-crumbs [data-apgo="yard"]'); await p.waitForSelector('.ap-hivebtn');
  await until(async () => (await p.locator('.ap-hivebtn').count()) === 3);

  // ---- the yard list
  await p.click('#apYear summary');
  await p.click('[data-aplist="0"]');
  await p.fill('#apListIn', 'Sample mouse guards'); await p.press('#apListIn', 'Enter');
  await until(async () => { const y = (await aps()).yard; return y.data.list.length === 3 && y.data.list[0].done; });
  assert.strictEqual(await p.getAttribute('[data-aplist="0"]', 'aria-pressed'), 'true');
  assert.ok(await p.evaluate(() => document.getElementById('apYear').open), 'the drawer stays open across redraws');

  // ---- a save that fails waits, with RETRY
  await mode('on=1&fail=1');
  await p.click('[data-aphive="ap-h2"]'); await p.waitForSelector('.ap-checks');
  assert.ok(await p.evaluate(() => document.getElementById('apAbout').open), 'ABOUT stays as you left it');
  await p.click('[data-apact="edithive"]'); await p.waitForSelector('#apH-notes');
  await p.fill('#apH-notes', 'Sample edited note');
  await p.click('[data-apact="savehive"]');
  await p.waitForSelector('.ap .err [data-apretry]');
  assert.ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tos.apiaryq.v1')))['h:ap-h2'], 'waiting on the iPad');
  await p.click('[data-apretry]');
  await until(async () => (await aps()).hives.find(h => h.id === 'ap-h2').notes === 'Sample edited note');
  await until(async () => (await p.locator('.ap .err').count()) === 0);

  // ---- Systems
  await p.click('#status'); await p.waitForSelector('[data-aiapiary]');
  const sys = await txt(p, 'section:has([data-aiapiary])');
  assert.ok(sys.includes('🐝 Apiary') && sys.includes('3 hives') && sys.includes('OK') && sys.includes('never sent'), sys);
  await p.click('[data-aiapiary="1"]');
  assert.ok((await txt(p, 'section:has([data-aiapiary])')).includes('Ask receives your hives'));
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.aiapiary.v1')), 'true');
  await p.click('[data-aiapiary="0"]');

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('[data-screen="apiary"].nav'); await p.waitForSelector('.ap-checks');   // back where you were: Bramble
  await p.click('[data-screen="apiary"].nav'); await p.waitForSelector('.ap-hivebtn');   // tapping APIARY again: the yard
  assert.strictEqual(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll');
  await p.screenshot({ path: D + 'apiary-phone.png', fullPage: true });
  await p.click('[data-aphive="ap-h1"]'); await p.waitForSelector('.ap-checks');
  assert.strictEqual(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  assert.strictEqual(await emoji(p), '', 'no emoji on a hive');
  await p.screenshot({ path: D + 'apiary-phone-hive.png', fullPage: true });

  await mode('on=0');
  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(async e => { await mode('on=0').catch(() => {}); console.error(e); process.exit(1); });
