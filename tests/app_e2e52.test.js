// INBOX (2.41, bridge 1.33; simulated on :8105): CAPTURE → NOTE saves a note to the Inbox; the Bridge shows INBOX · N
// while notes wait (Condition never counts them); INBOX lists them oldest first; SUGGEST SORTING sends the notes and
// Notion's own lists to Sonnet and shows a card per note (checked against those lists; an unknown id is ignored);
// CHANGE opens the form filled in, CONFIRM saves through the app's own saves (task with a due date, farm event, key
// date), SKIP drops a card; QUEUE by hand; KEEP moves a note to KEPT; ✕ asks twice; SORT IT NOW brings a kept note
// back; each note is marked Sorted with what it became; COMPUTER finds notes. Invented notes throughout.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=inboxmode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=inboxstats').then(r => r.json());
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const id = n => String(n).padStart(32, '0');
const note = async n => (await stats()).notes.find(x => x.id === id(n));

(async () => {
  await mode('cap=1&fail=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-24T07:58:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); }, [K, U]);
  await p.reload();

  // ---- the Bridge: INBOX · 4 under Condition
  await p.waitForSelector('.ib-line', { timeout: 10000 });
  assert.strictEqual(await txt(p, '.ib-line'), 'INBOX · 4 4 notes to sort, the oldest from MON 19 OCT');
  assert.ok(!/INBOX|note/i.test(await txt(p, '.ov-cond')), 'Condition never counts notes');

  // ---- CAPTURE → NOTE: one box, no area or day
  await p.click('#capBtn'); await p.click('[data-ctype="note"]');
  assert.strictEqual(await txt(p, '#capMode'), 'NOTION · INBOX');
  assert.ok(await p.isHidden('#capDayRow') && await p.isHidden('#capAreaRow') && await p.isHidden('#capTimeRow') && await p.isHidden('#capText') && await p.isVisible('#capNoteText'));
  assert.strictEqual(await txt(p, '#capSave'), 'SAVE NOTE');
  await p.fill('#capNoteText', 'Ask the feed store about winter patties\nand the price of syrup');
  await p.click('#capSave');
  await until(async () => (await stats()).notes.some(n => n.text === 'Ask the feed store about winter patties\nand the price of syrup'));
  await p.waitForFunction(() => /INBOX · 5/.test((document.querySelector('.ib-line') || {}).textContent || ''), null, { timeout: 5000 });

  // ---- INBOX: oldest first, two tabs
  await p.click('.ib-line'); await p.waitForSelector('.ib-note');
  assert.strictEqual(await txt(p, '#title'), 'INBOX'); assert.strictEqual(await txt(p, '#eyebrow'), 'CAPTURE · 5 WAITING');
  const order = await p.$$eval('.ib-note .tx', els => els.map(e => e.textContent.slice(0, 20)));
  assert.deepStrictEqual(order, ['Get a quote for the ', 'Juniper felt light o', 'Truck registration r', 'Look into a second h', 'Ask the feed store a'], order.join('|'));
  assert.ok((await txt(p, '[data-ibtab="kept"]')).endsWith('1'));

  // ---- SUGGEST SORTING: the notes and Notion's lists go; a card per note, checked
  await p.click('[data-ib="suggest"]');
  await p.waitForSelector('.ib-prop', { timeout: 8000 });
  const st = await stats();
  assert.ok(st.ctx.startsWith('TODAY: SATURDAY 24 October 2026 (2026-10-24).') || st.ctx.startsWith('TODAY: Saturday 24 October 2026 (2026-10-24).'), st.ctx.slice(0, 60));
  assert.ok(st.ctx.includes('LIFE AREAS: ') && st.ctx.includes('🏡 Home & Property') && st.ctx.includes('KEY DATE TYPES: ⏰ Deadline') && st.ctx.includes('CALENDARS HE CAN ADD TO: personal, farm, growth'), st.ctx);
  assert.ok(st.ctx.includes(id(1) + ': Get a quote for the north fence before winter') && st.ctx.includes('Ask the feed store about winter patties and the price of syrup'));
  assert.ok(!st.ctx.includes('Book idea'), 'kept notes are not sent');
  assert.strictEqual(await p.$$eval('.ib-prop', e => e.length), 4, 'four cards; the invented id is ignored');
  const card3 = await txt(p, '#ibn-' + id(3) + ' .ib-prop');
  assert.ok(card3.includes('SUGGESTED · KEY DATE') && card3.includes('30 NOV · every year') && !card3.includes('Not a type'), card3);
  await p.screenshot({ path: D + 'inbox-suggest.png', fullPage: true });

  // CHANGE: the task form, filled in; High instead of Medium
  await p.click('[data-ibchange="' + id(1) + '"]');
  assert.strictEqual(await p.inputValue('#ibf-title'), 'Get a quote for the north fence');
  assert.strictEqual(await p.inputValue('#ibf-life'), '🏡 Home & Property');
  assert.strictEqual(await p.inputValue('#ibf-due'), '2026-11-06');
  assert.strictEqual(await p.getAttribute('[data-ibpri="🟡 Medium"]', 'aria-pressed'), 'true');
  await p.click('[data-ibpri="🔴 High"]');
  await p.click('[data-ibsave="' + id(1) + '"]');
  await until(async () => (await stats()).tasks.some(t => t[0] === 'Get a quote for the north fence'));
  assert.deepStrictEqual((await stats()).tasks.find(t => t[0] === 'Get a quote for the north fence'), ['Get a quote for the north fence', '🏡 Home & Property', '🔴 High', '2026-11-06']);
  await until(async () => (await note(1)).status === 'sorted');
  assert.strictEqual((await note(1)).as, 'task');

  // CONFIRM: an event on the farm calendar
  await p.click('[data-ibok="' + id(2) + '"]');
  await until(async () => (await stats()).created.some(e => e[0] === 'Heft Juniper'));
  const ev = (await stats()).created.find(e => e[0] === 'Heft Juniper');
  assert.strictEqual(ev[1], 'farm'); assert.strictEqual(new Date(ev[2]).toISOString(), '2026-10-28T21:00:00.000Z');
  await until(async () => (await note(2)).as === 'event');

  // CONFIRM: a key date (the type Claude made up is left blank)
  await p.click('[data-ibok="' + id(3) + '"]');
  await until(async () => (await stats()).dates.some(d => d[0] === 'Truck registration renewal'));
  assert.deepStrictEqual((await stats()).dates.find(d => d[0] === 'Truck registration renewal'), ['Truck registration renewal', '2026-11-30', null, true]);
  await until(async () => (await note(3)).as === 'date');

  // SKIP, then QUEUE by hand
  await p.click('[data-ibskip="' + id(4) + '"]');
  assert.strictEqual(await p.$('#ibn-' + id(4) + ' .ib-prop'), null);
  await p.click('[data-ibkind="queue"][data-ibid="' + id(4) + '"]');
  assert.strictEqual(await p.inputValue('#ibf-title'), 'Look into a second honey extractor');
  await p.fill('#ibf-cost', 'abc'); await p.click('[data-ibsave="' + id(4) + '"]');
  assert.ok((await txt(p, '#ibf-err')).includes('The cost is a number'));
  await p.fill('#ibf-cost', '425'); await p.click('[data-ibsave="' + id(4) + '"]');
  await until(async () => (await stats()).queue.some(q => q[0] === 'Look into a second honey extractor' && q[1] === 425));
  await until(async () => (await note(4)).as === 'queue');

  // KEEP
  const fresh = (await stats()).notes.find(n => n.text.startsWith('Ask the feed store'));
  await p.click('[data-ibkind="keep"][data-ibid="' + fresh.id + '"]'); await p.click('[data-ibsave="' + fresh.id + '"]');
  await until(async () => (await stats()).notes.find(n => n.id === fresh.id).status === 'kept');
  assert.ok((await txt(p, '.ib-notes')).includes('Inbox clear.'));
  assert.strictEqual(await txt(p, '#eyebrow'), 'CAPTURE · ALL SORTED');

  // KEPT: ✕ asks twice; SORT IT NOW brings one back
  await p.click('[data-ibtab="kept"]');
  assert.strictEqual(await p.$$eval('.ib-note', e => e.length), 2);
  await p.click('[data-ibdel="' + id(11) + '"]');
  assert.strictEqual(await txt(p, '[data-ibdel="' + id(11) + '"]'), 'DELETE IT');
  assert.ok(await note(11), 'one tap deletes nothing');
  await p.click('[data-ibdel="' + id(11) + '"]');
  await until(async () => !(await note(11)));
  await p.click('[data-ibback="' + fresh.id + '"]');
  await p.waitForSelector('#ibf-title');
  assert.strictEqual(await p.inputValue('#ibf-title'), 'Ask the feed store about winter patties and the price of syrup');
  await until(async () => (await stats()).notes.find(n => n.id === fresh.id).status === 'new');
  await p.click('[data-ib="cancel"]');

  // ---- COMPUTER finds a note
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'feed store');
  const found = await txt(p, '#cmdList');
  assert.ok(found.includes('Ask the feed store') && found.includes('INBOX · WAITING'), found);
  await p.keyboard.press('Escape');

  // ---- back on the Bridge: one waiting
  await p.click('.elbow'); await p.waitForSelector('.ib-line');
  assert.ok((await txt(p, '.ib-line')).startsWith('INBOX · 1'));
  // Systems: the INBOX section, and no standby placeholder any more
  await p.click('#status'); await p.waitForSelector('#sec-inbox');
  const sec = await txt(p, '#sec-inbox'); assert.ok(sec.startsWith('INBOX 1 WAITING · 0 KEPT'), sec);
  assert.ok(!(await txt(p, '#content')).includes('STANDBY MODULES'));
  const posts = (await stats()).posts;
  assert.ok(posts.filter(x => x === 'inboxadd').length === 1, 'one note, one page: ' + posts.join(','));

  await mode('cap=0&fail=0');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await mode('cap=0&fail=0').catch(() => {}); console.error(e); process.exit(1); });
