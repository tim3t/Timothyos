// LOG: an ASK THE LOG answer held for a session (2.90, bridge 1.52; simulated on :8105, invented entries and wording).
// SAVE FOR SESSION under an answer holds it in Notion; a new session's first step lists what's held under FROM THE LOG;
// NOT NOW sets one aside for this session (SHOW AGAIN brings it back), REMOVE takes two taps and sends it to the trash;
// DROP IN puts a copy into the session under BROUGHT FROM THE LOG, to edit (TAKE OUT returns it to the list); SAVE sends
// it with the session, the bridge files it as an ordinary insight, and the saved session shows it with its dates as
// links that open those journal days.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', B = U + '?key=' + K, PIN = '135790';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=sesmode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=stats').then(r => r.json()).then(j => j.ses);
const logPost = body => fetch(U, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ key: K, pin: PIN }, body)) }).then(r => r.json());
const until = require('./lib/explain').until(10000, 150);

(async () => {
  await mode('cap=1&reset=1&fail=0');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-28T15:00:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('today')); localStorage.setItem('tos.logai.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('#allBtn'); await p.click('[data-station="log"]');
  await p.waitForSelector('[data-lpin="1"]'); for (const d of PIN) await p.click('[data-lpin="' + d + '"]');
  await p.waitForSelector('.sx-tabs');

  // ---- ASK THE LOG: an answer, then SAVE FOR SESSION beside SAVE TO NOTION
  await p.click('[data-lact="aiopen"]'); await p.click('[data-lapreset="moments"]');
  await p.click('[data-lact="aipreview"]'); await p.waitForSelector('.la-pv');
  await p.click('[data-lact="aisend"]'); await p.waitForSelector('.la-msg.a .la-meta', { timeout: 8000 });
  assert.strictEqual(await txt(p, '[data-lahold="1"]'), 'SAVE FOR SESSION');
  await p.click('[data-lahold="1"]');
  await until(async () => (await txt(p, '[data-lahold="1"]')) === 'HELD FOR A SESSION ✓', 8000, 'the answer held');
  assert.ok(await p.isDisabled('[data-lahold="1"]'), 'held once');
  assert.strictEqual(await txt(p, '[data-lasave="1"]'), 'SAVE TO NOTION', 'the ordinary save is still its own choice');
  const other = await logPost({ action: 'logasksave', insight: { title: 'For a session · a second sample', question: 'Anything else?', scope: '2026-10-05', text: 'A second sample thread.', hold: true } });
  assert.ok(other.ok && other.insight.held, JSON.stringify(other));
  assert.strictEqual((await logPost({ action: 'loginsights' })).insights.filter(x => /For a session/.test(x.title)).length, 0, 'held answers are not among the saved insights');

  // ---- SESSIONS → a new solo session: FROM THE LOG lists both
  await p.click('[data-sxtab="sessions"]'); await p.waitForSelector('.sx-type');
  await p.click('[data-sx="new"][data-t="solo"]'); await p.waitForSelector('.sx-form');
  await until(async () => (await p.locator('.sx-held').count()) === 2, 8000, 'both held answers listed');
  assert.ok((await txt(p, '.sx-form')).includes('FROM THE LOG · HELD FOR A SESSION'));
  const first = (await p.$$eval('.sx-held [data-sx="pin"]', e => e.map(x => x.dataset.id))).find(id => id !== other.insight.id);
  assert.ok(first, 'the held answer from ASK THE LOG');
  // NOT NOW, SHOW AGAIN
  await p.click(`[data-sx="pnot"][data-id="${other.insight.id}"]`);
  assert.strictEqual(await p.locator('.sx-held').count(), 1);
  assert.ok((await txt(p, '.sx-form')).includes('1 held answer set aside for this session'));
  await p.click('[data-sx="pshow"]');
  assert.strictEqual(await p.locator('.sx-held').count(), 2);
  // REMOVE: two taps, to the trash
  await p.click(`[data-sx="prm"][data-id="${other.insight.id}"]`);
  assert.strictEqual(await txt(p, `[data-sx="prm"][data-id="${other.insight.id}"]`), 'REMOVE IT', 'the first tap asks');
  await p.click(`[data-sx="prm"][data-id="${other.insight.id}"]`);
  await until(async () => (await p.locator('.sx-held').count()) === 1, 8000, 'removed');
  assert.ok(!(await logPost({ action: 'logpreps' })).preps.some(x => x.id === other.insight.id), 'gone from Notion\'s held answers');

  // ---- DROP IN: a copy to edit; TAKE OUT returns it to the list
  await p.click(`[data-sx="pin"][data-id="${first}"]`);
  assert.strictEqual(await p.locator('.sx-held').count(), 0, 'no longer offered once dropped in');
  const box = '.sx-prep textarea';
  assert.ok((await p.inputValue(box)).includes('a moment [2026-10-05]'), await p.inputValue(box));
  assert.ok((await txt(p, '.sx-form')).includes('BROUGHT FROM THE LOG'));
  await p.click('[data-sx="pout"][data-i="0"]');
  assert.strictEqual(await p.locator('.sx-prep').count(), 0);
  assert.strictEqual(await p.locator('.sx-held').count(), 1, 'back on the list until the session is saved');
  await p.click(`[data-sx="pin"][data-id="${first}"]`);
  await p.fill(box, (await p.inputValue(box)) + '\nA sample line added before the session.');
  await p.click('[data-sx="step"][data-v="1"]'); await p.click('[data-sx="step"][data-v="0"]');
  assert.ok((await p.inputValue(box)).endsWith('A sample line added before the session.'), 'the edit is kept in the draft');

  // ---- SAVE: the session carries it, the bridge files it, the session shows it
  const n0 = (await stats()).posts.length;
  await p.click('[data-sx="save"]');
  await p.waitForSelector('.sx-one');
  const sent = (await until(async () => (await stats()).posts.length > n0 && (await stats()).posts.slice(-1)[0]));
  assert.strictEqual(sent.prep.length, 1);
  assert.strictEqual(sent.prep[0].id, first);
  assert.ok(sent.prep[0].text.includes('a moment [2026-10-05]') && sent.prep[0].text.endsWith('A sample line added before the session.'));
  assert.ok(/^For a session · /.test(sent.prep[0].title), sent.prep[0].title);
  assert.deepStrictEqual((await logPost({ action: 'logpreps' })).preps, [], 'filed once the session is saved');
  assert.ok((await logPost({ action: 'loginsights' })).insights.some(x => x.id === first), 'now an ordinary saved insight');
  const view = await txt(p, '.sx-one');
  assert.ok(view.includes('BROUGHT FROM THE LOG') && view.includes('A sample line added before the session.'), view.slice(0, 400));
  // a date in it opens that journal day
  await p.click('.sx-prepview [data-sx="day"][data-v="2026-10-05"]');
  await until(async () => (await txt(p, '#eyebrow')).startsWith('JOURNAL'), 5000, 'the journal');
  await until(async () => (await p.evaluate(() => [...document.querySelectorAll('#content textarea')].map(t => t.value).join(' '))).includes('Planted the garlic.'), 5000, 'that day\'s entry in the journal');

  // ---- phone width: the form fits
  await p.click('[data-sxtab="sessions"]'); await p.click('.sx-nav [data-sx="list"]'); await p.click('[data-sx="new"][data-t="solo"]'); await p.waitForSelector('.sx-form');
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');

  assert.deepStrictEqual(errs, []);
  await b.close(); await mode('reset=1');
  console.log('A HELD ANSWER: held, listed, set aside, removed, dropped in, edited, saved with the session and filed: ok');
})().catch(async e => { console.error(e); await mode('reset=1').catch(() => {}); process.exit(1); });
