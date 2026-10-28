// LOG → SESSIONS (2.51, bridge 1.35; simulated on :8105): counseling session notes behind the log's code. The tab
// appears only with the bridge's "sessions"; the list is type > year > quarter > session, newest open; a session reads
// like a hive check; a new session walks five steps, carries last time's practice and BRING UP NEXT TIME, keeps its
// draft on the iPad through a lock and saves whole; edit and delete; SUGGEST TOPICS only with SHARE SESSIONS WITH ASK,
// previews before sending, and ADD TO NEXT TIME writes one line (UNDO takes it out); topic lists edited in Systems;
// locking forgets everything but an unsaved draft. Invented sessions and wording throughout.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=sesmode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=stats').then(r => r.json()).then(j => j.ses);
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  await mode('cap=1&reset=1&fail=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-28T15:00:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('today')); }, [K, U]);
  await p.reload(); await p.waitForTimeout(1200);
  const unlock = async () => { await p.waitForSelector('[data-lpin="1"]'); for (const d of '135790') await p.click('[data-lpin="' + d + '"]'); await p.waitForSelector('.sx-tabs'); };
  const toLog = async () => { await p.click('#allBtn'); await p.click('[data-station="log"]'); };

  // ---- locked as ever; once open, two tabs
  await toLog();
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · LOCKED');
  await unlock();
  assert.strictEqual(await txt(p, '.sx-tabs'), 'JOURNAL SESSIONS');
  assert.ok(await p.$('.cl-cal'), 'the journal is where it was');
  await p.click('[data-sxtab="sessions"]'); await p.waitForSelector('.sx-type');
  assert.strictEqual(await txt(p, '#eyebrow'), 'SESSIONS · OPEN');
  assert.ok(!(await p.$('.cl-cal')), 'no calendar on SESSIONS');

  // ---- the tree: type > year > quarter, the newest open
  const heads = await p.$$eval('.sx-thead .sx-tog', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepStrictEqual(heads, ['▼SOLO COUNSELING4 SESSIONS · LAST 22 OCT 2026 · NEXT 5 NOV 2026', '▼COUPLES COUNSELING1 SESSION · LAST 14 OCT 2026']);
  const solo = '.sx-type:nth-of-type(1)';
  assert.deepStrictEqual(await p.$$eval(solo + ' .sx-yhead', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim())), ['▼ 2026 3 SESSIONS', '▼ 2025 1 SESSION']);
  assert.deepStrictEqual(await p.$$eval(solo + ' .sx-row', e => e.map(x => x.querySelector('.sx-d').textContent)), ['22OCTTHU', '8OCTTHU'], 'only Q4 2026 open');
  assert.strictEqual(await p.getAttribute(solo + ' .sx-qtog[data-k="solo2026Q3"]', 'aria-expanded'), 'false');
  const row1 = await txt(p, solo + ' .sx-row');
  assert.ok(row1.includes('STRESS + WORK') && row1.includes('BOUNDARIES') && row1.includes('A fast yes dodges') && /2\s*→\s*3/.test(row1), row1);
  await p.click('[data-k="solo2026Q3"]');
  assert.strictEqual(await p.$$eval(solo + ' .sx-row', e => e.length), 3);
  await p.click('[data-k="solo2025"]');
  assert.strictEqual(await p.getAttribute('[data-k="solo2025Q4"]', 'aria-expanded'), 'false', 'an older year opens on its quarters');
  await p.click('[data-k="solo"]');
  assert.strictEqual(await p.$(solo + ' .sx-year'), null, 'a type folds away');
  await p.click('[data-k="solo"]');
  await p.screenshot({ path: D + 'sessions-list.png', fullPage: true });

  // ---- a session, read like a hive check
  await p.click('.sx-row >> text=Saying yes'.replace('Saying yes', 'A fast yes')); await p.waitForSelector('.sx-one');
  const one = await txt(p, '.sx-one');
  assert.ok(one.startsWith('SOLO · SESSION 4 THU 22 OCT 2026 · IN PERSON'), one);
  for (const want of ['ARRIVING 2 · HEAVY', 'ON MY MIND A loud week at the bench.', 'LEAVING 3 · STEADY', 'IT FELT HEAVY BUT USEFUL', 'NEXT SESSION THU 5 NOV 2026', 'WHAT LANDED A fast yes', 'A PHRASE TO KEEP “Check the plate first.”',
    'STRESS + WORK Saying yes before checking the plate.', "LAST TIME'S PRACTICE ✓ Note one thing done well each evening · DONE", 'PRACTICE UNTIL NEXT TIME Pause one breath before agreeing', 'BRING UP NEXT TIME How the pause went.'])
    assert.ok(one.includes(want), want + ' in ' + one);
  await p.click('.sx-nav [data-sx="open"]:has-text("EARLIER")');
  assert.ok((await txt(p, '.sx-one')).startsWith('SOLO · SESSION 3 THU 8 OCT 2026'));
  await p.click('[data-sx="list"]');

  // ---- a new session: five steps, carrying last time's practice and BRING UP NEXT TIME
  await p.click('[data-sx="new"][data-t="solo"]'); await p.waitForSelector('.sx-form');
  assert.ok((await txt(p, '.sx-form')).includes('From 22 OCT 2026, to bring up: How the pause went.'));
  await p.click('[data-sx="din"][data-v="2"]');
  await p.fill('#sxMind', 'Sleep again.');
  await p.click('[data-sx="step"][data-v="1"]');
  await p.click('[data-sx="dtopic"][data-v="STRESS + WORK"]');
  await p.fill('#sxNewTopic', 'sleep, mostly'); await p.click('[data-sx="addtopic"]');
  await p.fill('#sxNote-0', 'The pause worked twice.');
  await p.fill('#sxNote-1', 'Up at three most nights.');
  await p.click('[data-sx="step"][data-v="2"]');
  await p.fill('#sxLanded', 'Sleep is where the week shows first.');
  await p.click('[data-sx="step"][data-v="3"]');
  assert.deepStrictEqual(await p.$$eval('.sx-prac > span', e => e.map(x => x.textContent)), ['Pause one breath before agreeing', 'Phone out of the bedroom three nights'], 'last time\'s practice, to mark');
  await p.click('[data-sx="dcar"][data-i="0"][data-v="y"]'); await p.click('[data-sx="dcar"][data-i="1"][data-v="p"]');
  await p.fill('#sxPrac', 'Lights out by eleven'); await p.click('[data-sx="dpadd"]');
  await p.click('[data-sx="step"][data-v="4"]');
  await p.click('[data-sx="dout"][data-v="3"]'); await p.click('[data-sx="dfelt"][data-v="Lighter"]');
  await p.fill('#sxNextT', 'The three o\'clock waking.');
  await p.screenshot({ path: D + 'sessions-new.png', fullPage: true });
  await p.click('[data-sx="save"]'); await p.waitForSelector('.sx-one');
  const posted = (await stats()).posts.slice(-1)[0];
  assert.deepStrictEqual([posted.type, posted.day, posted.arriving, posted.leaving, posted.felt, posted.onMind, posted.landed, posted.nextTime], ['solo', '2026-10-28', 2, 3, 'Lighter', 'Sleep again.', 'Sleep is where the week shows first.', "The three o'clock waking."]);
  assert.deepStrictEqual(posted.topics, [{ name: 'STRESS + WORK', note: 'The pause worked twice.' }, { name: 'SLEEP MOSTLY', note: 'Up at three most nights.' }]);
  assert.deepStrictEqual(posted.carried, [{ text: 'Pause one breath before agreeing', did: 'y' }, { text: 'Phone out of the bedroom three nights', did: 'p' }]);
  assert.deepStrictEqual(posted.practice, ['Lights out by eleven']); assert.ok(posted.cid && !posted.id);
  assert.ok((await txt(p, '.sx-one')).startsWith('SOLO · SESSION 5 WED 28 OCT 2026'));
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.sndraft.v1')), null, 'saved: the draft is gone');

  // ---- edit, then delete (two taps)
  await p.click('[data-sx="edit"]'); await p.click('[data-sx="step"][data-v="2"]');
  await p.fill('#sxLanded', 'Sleep shows the week first.'); await p.click('[data-sx="save"]'); await p.waitForSelector('.sx-one');
  const edited = (await stats()).posts.slice(-1)[0];
  assert.ok(edited.id && !edited.cid && edited.landed === 'Sleep shows the week first.');
  await p.click('[data-sx="del"]'); assert.strictEqual(await txt(p, '[data-sx="del"]'), 'DELETE IT');
  await p.click('[data-sx="del"]'); await p.waitForSelector('.sx-type');
  assert.ok(!(await stats()).list.some(s => s.day === '2026-10-28'), 'removed');

  // ---- an unsaved session survives a lock (on this iPad only); everything else is forgotten
  await p.click('[data-sx="new"][data-t="couples"]');
  assert.strictEqual(await p.getAttribute('[data-sx="dtype"][data-v="couples"]', 'aria-pressed'), 'true', 'starts as the type tapped');
  await p.fill('#sxMind', 'Holiday plans again.');
  await p.click('[data-sx="step"][data-v="3"]');
  assert.deepStrictEqual(await p.$$eval('.sx-prac > span', e => e.map(x => x.textContent)), ['Sunday ten-minute check-in'], 'couples carries couples practice');
  await p.click('.sx-tabs [data-lact="lock"]'); await p.waitForSelector('[data-lpin="1"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'SESSIONS · LOCKED');
  const stored = await p.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\n'));
  assert.ok(stored.includes('Holiday plans again.') && !stored.includes('Check the plate') && !stored.includes('A fast yes'), 'only the unsaved draft is on the iPad');
  assert.ok(!(await p.$('.sx')));
  await unlock(); await p.waitForSelector('.sx-resume');
  assert.ok((await txt(p, '.sx-resume')).startsWith('NOT SAVED COUPLES · WED 28 OCT 2026 · stopped at PRACTICE'));
  await p.click('[data-sx="resume"]'); await p.click('[data-sx="step"][data-v="0"]');
  assert.strictEqual(await p.inputValue('#sxMind'), 'Holiday plans again.');
  await p.click('.sx-form [data-sx="list"]');
  await p.click('[data-sx="new"][data-t="solo"]');
  assert.ok(await p.$('.sx-resume'), 'a second new session asks first');
  await p.click('[data-sx="drop"]'); assert.strictEqual(await txt(p, '[data-sx="drop"]'), 'DISCARD IT');
  await p.click('[data-sx="drop"]'); assert.ok(!(await p.$('.sx-resume')));
  assert.strictEqual(await p.evaluate(() => localStorage.getItem('tos.sndraft.v1')), null);

  // ---- SUGGEST TOPICS: off until SHARE SESSIONS WITH ASK; Systems also edits the topic lists
  assert.ok(!(await p.$('[data-sx="suggest"]')));
  assert.ok((await txt(p, '.sx-foot')).includes('SUGGEST TOPICS is off'));
  await p.click('#status'); await p.waitForSelector('[data-sx="ai"][data-v="1"]');
  await p.click('[data-sx="ai"][data-v="1"]');
  await p.fill('#sxT-solo', 'Sleep'); await p.click('[data-sx="tadd"][data-t="solo"]');
  assert.ok((await p.$$eval('[data-sx="tdel"][data-t="solo"]', e => e.map(x => x.textContent))).includes('SLEEP ✕'));
  await toLog(); await unlock();
  assert.strictEqual(await txt(p, '#eyebrow'), 'SESSIONS · OPEN', 'LOG remembers the tab');
  await p.click('[data-sx="suggest"][data-t="solo"]'); await p.waitForSelector('.sx-sg');
  await p.click('[data-sx="sgpreview"]'); await p.waitForSelector('.sx-gauge');
  assert.strictEqual(await txt(p, '.sx-gauge'), '3 SESSIONS 23 JUL, 8 OCT, 22 OCT DATES ~1,600 TOKENS ~0.9¢ SONNET');
  assert.strictEqual((await stats()).suggests.length, 0, 'a preview sends nothing');
  await p.click('[data-sx="sgsend"]'); await p.waitForSelector('.sx-sugg');
  const asked = (await stats()).suggests[0];
  assert.strictEqual(asked.type, 'solo'); assert.strictEqual(asked.ids.length, 3); assert.strictEqual(asked.mode, 'fast');
  assert.deepStrictEqual(await p.$$eval('.sx-sugg > b', e => e.map(x => x.textContent)), ['1. How the pause went', '2. Energy and what is yours']);
  await p.click('.sx-sugg [data-sx="sgadd"][data-i="0"]'); await p.waitForSelector('.sx-sugg.on');
  assert.strictEqual((await stats()).nexts.slice(-1)[0], 'How the pause went.\n• How the pause went');
  await p.click('.sx-sugg [data-sx="sgadd"][data-i="0"]'); await until(async () => !(await p.$('.sx-sugg.on')));
  assert.strictEqual((await stats()).nexts.slice(-1)[0], 'How the pause went.', 'UNDO takes the line out');
  await p.click('[data-sx="sgdrop"][data-i="1"]'); assert.strictEqual(await p.$$eval('.sx-sugg', e => e.length), 1);
  await p.click('.sx-sugg .sx-from [data-sx="open"]'); await p.waitForSelector('.sx-one');
  // the new topic is offered in a new solo session
  await p.click('[data-sx="list"]'); await p.click('[data-sx="new"][data-t="solo"]'); await p.click('[data-sx="step"][data-v="1"]');
  assert.ok(await p.$('[data-sx="dtopic"][data-v="SLEEP"]'));
  await p.click('.sx-form [data-sx="list"]'); await p.click('[data-sx="drop"]'); await p.click('[data-sx="drop"]');

  // ---- COMPUTER goes straight to the tab (after the code)
  await p.click('[data-sxtab="journal"]');
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'counseling'); await p.keyboard.press('Enter');
  await p.waitForSelector('[data-lpin="1"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'SESSIONS · LOCKED');

  // ---- phone width
  await unlock();
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');
  await p.screenshot({ path: D + 'sessions-phone.png', fullPage: true });

  // ---- without bridge 1.35 there is no tab
  await mode('cap=0');
  await p.setViewportSize({ width: 1180, height: 900 });
  await p.evaluate(() => localStorage.removeItem('tos.cache.v1'));   /* the capabilities kept from the last sync */
  await p.reload(); await p.waitForTimeout(2000); await toLog(); await p.waitForSelector('[data-lpin="1"]');
  assert.strictEqual(await txt(p, '#eyebrow'), 'JOURNAL · LOCKED');
  for (const d of '135790') await p.click('[data-lpin="' + d + '"]');
  await p.waitForSelector('.cl-cal'); assert.ok(!(await p.$('.sx-tabs')));

  await mode('cap=0&reset=1');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(async e => { await mode('cap=0&reset=1').catch(() => {}); console.error(e); process.exit(1); });
