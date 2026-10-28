// MORNING BRIEFING (2.36, bridge 1.29; simulated on :8105 after e2e46, a canned invented briefing): nothing before
// 06:00; the first time Bridge is in front after 06:00 it compiles once (ASK's snapshot without tarot or the apiary
// even when they're shared, no habits, a short ask, mode "brief", the ignore list) and prints like a teleprinter (a tap finishes it); − folds it to one line without the
// condition and the Condition banner moves up; it stays folded, opens already printed, folds itself at 10:30 unless
// opened; READ IT TO ME queues every paragraph in the iPad voice Moira (2.37; Nova is e2e48) and lights each as it starts; REFRESH writes a new one; a failed
// compile offers COMPILE NOW, a malformed answer keeps the old one; yesterday's shows folded before 06:00; compiled
// while away, Standby shows BRIEFING READY and the wake lands on it; Systems turns it off and on and names the
// bridge it needs; COMPUTER finds it; phone width fits; no emoji.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const mode = q => fetch(B + '&action=briefmode&' + q).then(r => r.json());
const stats = () => fetch(B + '&action=briefstats').then(r => r.json());
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const at = s => new Date('2026-10-' + s + ':00-05:00');
const bridge = async p => { await p.click('.elbow'); await p.waitForTimeout(250); };

(async () => {
  await mode('cap=1&fail=0&shape=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {   // the iPad's voice, simulated: utterances are kept so the test can start and end them
    window.__said = []; window.__cancels = 0;
    function U(t) { this.text = t; }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
    const voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha' }, { name: 'Moira', lang: 'en-IE', voiceURI: 'com.apple.voice.compact.en-IE.Moira' }, { name: 'Moira (Enhanced)', lang: 'en-IE', voiceURI: 'com.apple.voice.enhanced.en-IE.Moira' }];
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u) { window.__said.push(u); }, cancel() { window.__cancels++; }, getVoices() { return voices; }, addEventListener() {} }, configurable: true });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(at('23T05:30'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k }));
    localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); localStorage.setItem('tos.ignore.v1', JSON.stringify(['Away block']));
    localStorage.setItem('tos.aitarot.v1', 'true'); localStorage.setItem('tos.aiapiary.v1', 'true');   // shared with ASK, still left out of the briefing
  }, [K, U]);
  await p.reload(); await p.waitForSelector('.ov-cond', { timeout: 10000 }); await p.waitForTimeout(1500);
  // load the tarot readings and the hives, so ASK's snapshot would carry them
  for (const s of ['tarot', 'apiary']) { await p.click('#allBtn'); await p.click('[data-station="' + s + '"]'); await p.waitForTimeout(1200); }
  await bridge(p);

  // ---- before 06:00: nothing is written
  assert.strictEqual((await stats()).n, 0, 'nothing compiles before 06:00');
  assert.strictEqual(await p.locator('.br, .br-fold').count(), 0);

  // ---- 06:30, first time in front: compiles once, from the snapshot plus yesterday's habits
  await p.clock.setFixedTime(at('23T06:30'));
  await bridge(p);
  await p.waitForSelector('#brComp');
  assert.ok((await txt(p, '.br')).includes('COMPILING · SONNET'));
  await p.waitForSelector('#brPaper', { timeout: 10000 });
  let st = await stats();
  assert.strictEqual(st.n, 1, 'one compile');
  assert.ok(st.ctx.includes('CONDITION:') && st.ctx.includes('TODAY:'), st.ctx.slice(0, 300));
  assert.ok(!/^TAROT|^APIARY|YESTERDAY'S HABITS/m.test(st.ctx), 'no tarot, apiary or habits in the briefing');
  assert.ok(st.ask.includes('about 80 words') && st.ask.includes('No YESTERDAY, APIARY or TAROT'), st.ask);
  assert.ok(!/captain'?s log/i.test(st.ctx), 'never the log');
  assert.deepStrictEqual(st.ignore, ['Away block'], 'ignored titles go along');
  // prints like a teleprinter: the caret is there part way; a tap finishes it
  assert.ok(await p.isVisible('#brPaper .br-caret'), 'printing');
  const partial = (await txt(p, '#brPaper')).length;
  await p.click('#brPaper'); await p.waitForTimeout(150);
  assert.ok(!(await p.isVisible('#brPaper .br-caret')), 'finished at a tap');
  const full = await txt(p, '#brPaper');
  assert.ok(partial < full.length, 'was part way');
  assert.ok(full.startsWith('Good morning, Captain. Friday 23 October. Condition yellow:') && full.includes('TODAY. Four meetings') && full.includes('OUTSIDE. 41°F') && full.includes("RECOMMENDED Pick today's priorities before 10:00."), full);
  assert.strictEqual(await txt(p, '#brPaper .c-yellow'), 'Condition yellow:');
  assert.strictEqual(await p.locator('#brPaper p').count(), 5, 'four paragraphs and the action');
  assert.ok((await txt(p, '.br .phead')).includes('COMPILED 06:30 · SONNET · 3.5¢'), await txt(p, '.br .phead'));
  assert.strictEqual(await p.locator('.br').evaluate(el => el.nextElementSibling.classList.contains('ov-cond')), true, 'right above the Condition banner');
  await p.screenshot({ path: D + 'briefing-open.png' });
  // redrawing the Bridge keeps it printed and never compiles again
  await bridge(p); await bridge(p);
  assert.ok(!(await p.isVisible('#brPaper .br-caret')));
  assert.strictEqual((await stats()).n, 1, 'once a day');

  // ---- − folds it: one line, no condition; the Condition banner comes back up
  const condOpen = await p.locator('.ov-cond').evaluate(el => el.getBoundingClientRect().top);
  await p.click('[data-brief="fold"]'); await p.waitForTimeout(200);
  const fold = await txt(p, '.br-fold');
  assert.ok(fold.startsWith('MORNING BRIEFING · 06:30') && fold.includes('4 meetings from 09:00 · hive check GO 11:00 to 15:00'), fold);
  assert.ok(!/condition|yellow/i.test(fold), 'the folded line leaves the condition to the banner');
  const condFold = await p.locator('.ov-cond').evaluate(el => el.getBoundingClientRect().top);
  assert.ok(condOpen - condFold > 150, 'the Condition banner moved up (' + condOpen + ' to ' + condFold + ')');
  await p.screenshot({ path: D + 'briefing-folded.png' });
  // stays folded after a reload; opens already printed
  await p.reload(); await p.waitForSelector('.br-fold', { timeout: 10000 });
  await p.click('.br-fold'); await p.waitForSelector('#brPaper');
  assert.ok(!(await p.isVisible('#brPaper .br-caret')), 'opens already printed');
  assert.strictEqual((await stats()).n, 1);

  // ---- READ IT TO ME: every paragraph queued inside the tap; each lights up as it starts
  await p.click('[data-brief="say"]'); await p.waitForTimeout(150);
  const said = await p.evaluate(() => window.__said.map(u => u.text));
  assert.strictEqual(said.length, 5, said.join(' | '));
  assert.ok(said[2].includes('41 degrees') && !said[2].includes('°'), said[2]);
  const v = await p.evaluate(() => window.__said.map(u => (u.voice && u.voice.name) + '|' + u.lang));
  assert.ok(v.every(x => x === 'Moira (Enhanced)|en-IE'), 'Moira reads it, the Enhanced one first: ' + v.join(', '));
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'STOP READING');
  await p.evaluate(() => window.__said[2].onstart());
  await p.waitForTimeout(100);
  assert.strictEqual(await p.getAttribute('#brPaper p.say', 'data-bp'), '2', 'the third paragraph is lit');
  await p.evaluate(() => window.__said[4].onend());
  await p.waitForTimeout(100);
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'READ IT TO ME'); assert.strictEqual(await p.locator('#brPaper p.say').count(), 0);
  await p.click('[data-brief="say"]'); await p.click('[data-brief="say"]');
  assert.ok(await p.evaluate(() => window.__cancels) >= 2, 'STOP READING cancels the voice');

  // ---- 10:30: folds itself unless opened after; opened, it stays open
  await p.evaluate(() => { const b = JSON.parse(localStorage.getItem('tos.brief.v1')); b.fold = null; localStorage.setItem('tos.brief.v1', JSON.stringify(b)); });
  await p.clock.setFixedTime(at('23T10:45'));
  await p.reload(); await p.waitForSelector('.br-fold', { timeout: 10000 });
  await p.click('.br-fold'); await p.waitForSelector('#brPaper'); await bridge(p);
  assert.ok(await p.isVisible('#brPaper'), 'opened after 10:30, it stays open');
  assert.ok(!(await txt(p, '.br')).includes('Folds to one line at 10:30'), 'no 10:30 note after 10:30');

  // ---- REFRESH writes a new one, which prints again; a malformed answer keeps this one
  await p.click('[data-brief="again"]'); await p.waitForSelector('#brPaper .br-caret', { timeout: 10000 });
  assert.strictEqual((await stats()).n, 2);
  await mode('shape=1');
  await p.click('#brPaper'); await p.click('[data-brief="again"]');
  await until(async () => (await p.isVisible('#toast')) && (await txt(p, '#toast')).includes('Briefing not refreshed'));
  assert.ok(await p.isVisible('#brPaper'), "this morning's stays");
  await mode('shape=0');

  // ---- next morning before 06:00: yesterday's, folded; at 06:30 a failure offers COMPILE NOW
  await p.clock.setFixedTime(at('24T05:30'));
  await p.reload(); await p.waitForSelector('.br-fold', { timeout: 10000 });
  assert.ok((await txt(p, '.br-fold')).startsWith("YESTERDAY'S MORNING BRIEFING"));
  await mode('fail=1');
  await p.clock.setFixedTime(at('24T06:30'));
  await bridge(p);
  await p.waitForSelector('[data-brief="now"]', { timeout: 10000 });
  assert.ok((await txt(p, '.br')).includes('NOT COMPILED'));
  const n0 = (await stats()).n;
  await bridge(p); await p.waitForTimeout(500);
  assert.strictEqual((await stats()).n, n0, 'no retry straight away');
  await p.click('[data-brief="now"]'); await p.waitForSelector('#brPaper', { timeout: 10000 });
  assert.strictEqual((await stats()).n, n0 + 1);

  // ---- compiled while on another screen: Standby says BRIEFING READY, and the wake lands on it
  await p.clock.setFixedTime(at('25T06:30'));
  await p.evaluate(() => localStorage.setItem('tos.start.v1', JSON.stringify('today')));
  const n1 = (await stats()).n;
  await p.reload(); await p.waitForSelector('#idleBtn');
  await until(async () => (await stats()).n === n1 + 1);
  await p.waitForTimeout(300);
  assert.strictEqual(await txt(p, '#title').then(t => /OCT/.test(t)), true);
  await p.click('#idleBtn'); await p.waitForSelector('.sb-brief', { timeout: 5000 });
  assert.strictEqual(await txt(p, '.sb-brief'), 'BRIEFING READY · TAP TO READ');
  await p.screenshot({ path: D + 'briefing-standby.png' });
  await p.click('#standby'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#brPaper'), 'woke on the Bridge, on the briefing');
  assert.ok(await p.isVisible('#brPaper .br-caret'), 'printing');

  // ---- COMPUTER finds it
  await p.keyboard.press('Meta+k'); await p.fill('#cmdText', 'briefing'); await p.waitForTimeout(150);
  assert.ok((await txt(p, '#cmdList')).includes('Morning briefing'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---- Systems: off and on; an older bridge is named
  await p.click('#status'); await p.waitForSelector('[data-brief="off"]');
  assert.ok((await txt(p, '#content')).includes('MORNING BRIEFING On: written the first time Bridge is in front after 06:00'));
  assert.ok((await txt(p, '#content')).includes('iPad voice: Moira (Enhanced) · en-IE.'), 'Systems names the iPad voice');
  const before = await p.evaluate(() => window.__said.length);
  await p.click('[data-brief="test"]');
  assert.strictEqual(await p.evaluate(n => window.__said.length - n + '|' + window.__said[window.__said.length - 1].voice.name, before), '1|Moira (Enhanced)', 'TEST VOICE speaks in Moira');
  // an iPad without Moira: every English voice to audition, novelty voices last
  await p.evaluate(() => { const vs = [{ name: 'Zarvox', lang: 'en-US', voiceURI: 'com.apple.speech.synthesis.voice.Zarvox' }, { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha' }, { name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.compact.en-GB.Daniel' }, { name: 'Thomas', lang: 'fr-FR', voiceURI: 'com.apple.voice.compact.fr-FR.Thomas' }]; speechSynthesis.getVoices = () => vs; });
  await p.click('#status'); await p.waitForSelector('[data-vtest]');
  assert.strictEqual((await p.$$eval('[data-vtest]', bs => bs.map(b => b.firstChild.textContent.trim()))).join(','), 'Daniel,Samantha,Zarvox', 'English only, novelty last');
  assert.ok((await txt(p, '#content')).includes("Moira isn't among the 4 voices"));
  await p.click('[data-vtest="com.apple.voice.compact.en-GB.Daniel"]');
  assert.strictEqual(await p.evaluate(() => window.__said[window.__said.length - 1].voice.name), 'Daniel', 'a tap plays that voice');
  await p.click('[data-brief="off"]'); await p.waitForSelector('[data-brief="on"]');
  await bridge(p);
  assert.strictEqual(await p.locator('.br, .br-fold').count(), 0, 'off: no panel');
  await p.click('#status'); await p.click('[data-brief="on"]'); await bridge(p);
  assert.strictEqual(await p.locator('.br, .br-fold').count(), 1);
  await mode('cap=0');
  await p.click('#status'); await p.click('#refreshBtn'); await p.waitForTimeout(1500);
  assert.ok((await txt(p, '#content')).includes('Needs the Google bridge updated'));
  await bridge(p);
  assert.strictEqual(await p.locator('.br, .br-fold').count(), 0, 'an older bridge: no panel on the Bridge');
  await mode('cap=1');
  await p.click('#status'); await p.click('#refreshBtn'); await p.waitForTimeout(1500); await bridge(p);

  // ---- no emoji; phone width fits
  const all = await txt(p, '.br, .br-fold');
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(all), 'no emoji');
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  if (await p.isVisible('.br-fold')) await p.click('.br-fold');
  await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => document.documentElement.scrollWidth), 400, 'no sideways scroll');
  await p.screenshot({ path: D + 'briefing-phone.png' });

  await mode('cap=0&fail=0&shape=0');
  console.log('errors', errs);
  await b.close();
})().catch(async e => { await mode('cap=0&fail=0&shape=0').catch(() => {}); console.error(e); process.exit(1); });
