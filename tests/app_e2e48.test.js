// AI VOICE (2.37, bridge 1.30; simulated on :8105 after e2e47, silent clips stand in for Nova): when the briefing
// compiles, its paragraphs go to speak once and the audio is kept on the iPad; READ IT TO ME plays them in order,
// lighting each paragraph, and STOP pauses; after a reload the audio comes from the iPad, not the bridge; tapped
// before the audio has arrived, a silent clip unlocks the player and the briefing plays when it lands; when OpenAI
// refuses, Moira reads it; Systems shows Nova and the month's estimate, plays a test line, turns it off (no audio
// asked for, Moira reads) and on, and names what an older bridge needs.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const brief = q => fetch(B + '&action=briefmode&' + q).then(r => r.json());
const voice = q => fetch(B + '&action=voicemode&' + q).then(r => r.json());
const calls = () => fetch(B + '&action=voicestats').then(r => r.json()).then(j => j.calls);
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const plays = p => p.evaluate(() => window.__plays.slice());
const ended = p => p.evaluate(() => window.__audio.dispatchEvent(new Event('ended')));
const bridge = async p => { await p.click('.elbow'); await p.waitForTimeout(250); };
const reset = () => Promise.all([brief('cap=0&fail=0&shape=0'), voice('cap=0&fail=0&slow=0')]);

(async () => {
  await brief('cap=1&fail=0&shape=0&reset=1'); await voice('cap=1&fail=0&slow=0&reset=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__said = []; window.__plays = []; window.__pauses = 0;
    function U(t) { this.text = t; }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
    const voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha' }, { name: 'Moira', lang: 'en-IE', voiceURI: 'com.apple.voice.compact.en-IE.Moira' }];
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u) { window.__said.push(u); }, cancel() {}, getVoices() { return voices; }, addEventListener() {} }, configurable: true });
    // the player, simulated: what it was asked to play is kept; the test ends each clip
    HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src.slice(0, 22)); window.__audio = this; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { window.__pauses++; };
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-26T06:30:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge')); indexedDB.deleteDatabase('tos-voice'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#brPaper', { timeout: 15000 });

  // ---- compiled: the paragraphs go to speak once, as written
  let c = await until(async () => { const x = await calls(); return x.length === 1 && x; });
  assert.strictEqual(c[0].length, 5, 'four paragraphs and the action');
  assert.ok(c[0][0].startsWith('Good morning, Captain.') && c[0][2].includes('41 degrees Fahrenheit') && c[0][4].startsWith('RECOMMENDED Pick'), c[0].join(' | '));
  assert.ok(c[0][1].includes('the first at oh nine hundred and the last ending at sixteen thirty') && !/\d:\d\d/.test(c[0].join(' ')), 'times in ship\'s style (2.40.1): ' + c[0][1]);
  await p.click('#brPaper'); await p.waitForTimeout(300);

  // ---- READ IT TO ME: Nova's clips in order, each paragraph lit; never the iPad voice
  await p.click('[data-brief="say"]'); await p.waitForTimeout(150);
  assert.ok((await plays(p)).pop().startsWith('blob:'), 'plays the kept audio at once');
  assert.strictEqual(await p.getAttribute('#brPaper p.say', 'data-bp'), '0');
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'STOP READING');
  for (let i = 1; i < 5; i++) { await ended(p); await p.waitForTimeout(80); assert.strictEqual(await p.getAttribute('#brPaper p.say', 'data-bp'), String(i)); }
  assert.strictEqual((await plays(p)).filter(s => s.startsWith('blob:')).length, 5);
  await ended(p); await p.waitForTimeout(100);
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'READ IT TO ME'); assert.strictEqual(await p.locator('#brPaper p.say').count(), 0);
  assert.strictEqual(await p.evaluate(() => window.__said.length), 0, 'Moira stayed quiet');
  // STOP pauses
  await p.click('[data-brief="say"]'); await p.click('[data-brief="say"]');
  assert.ok(await p.evaluate(() => window.__pauses) > 0); assert.strictEqual(await txt(p, '[data-brief="say"]'), 'READ IT TO ME');
  await p.screenshot({ path: D + 'voice-reading.png' });

  // ---- after a reload the audio comes from this iPad
  await p.reload(); await p.waitForSelector('#brPaper', { timeout: 10000 }); await p.waitForTimeout(500);
  const n0 = (await plays(p)).length;
  await p.click('[data-brief="say"]');
  await until(async () => (await plays(p)).slice(n0).some(s => s.startsWith('blob:')));
  assert.strictEqual((await calls()).length, 1, 'nothing asked of the bridge again');
  await p.click('[data-brief="say"]');

  // ---- REFRESH: new text, new audio
  await p.click('[data-brief="again"]'); await p.waitForSelector('#brPaper .br-caret', { timeout: 10000 });
  await until(async () => (await calls()).length === 2);
  await p.click('#brPaper');

  // ---- tapped before the audio has arrived: PREPARING VOICE, a silent clip unlocks the player, then it plays
  await voice('slow=2500');
  await p.click('[data-brief="again"]'); await p.waitForSelector('#brPaper .br-caret', { timeout: 10000 });
  await p.click('#brPaper');
  const n1 = (await plays(p)).length;
  await p.click('[data-brief="say"]'); await p.waitForTimeout(150);
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'PREPARING VOICE…');
  assert.ok((await plays(p))[n1].startsWith('data:audio/mpeg'), 'unlocked inside the tap');
  await until(async () => (await plays(p)).slice(n1 + 1).some(s => s.startsWith('blob:')), 8000);
  assert.strictEqual(await txt(p, '[data-brief="say"]'), 'STOP READING');
  await p.click('[data-brief="say"]');
  await voice('slow=0');

  // ---- OpenAI refuses: Moira reads it
  await voice('fail=voice_no_credit');
  const n2 = (await calls()).length;
  await p.click('[data-brief="again"]'); await p.waitForSelector('#brPaper .br-caret', { timeout: 10000 });
  await until(async () => (await calls()).length === n2 + 1); await p.waitForTimeout(400);
  await p.click('#brPaper'); await p.click('[data-brief="say"]'); await p.waitForTimeout(150);
  const said = await p.evaluate(() => window.__said.map(u => u.voice && u.voice.name));
  assert.ok(said.length === 5 && said.every(n => n === 'Moira'), 'Moira reads it: ' + said.join(','));
  await p.click('[data-brief="say"]');
  await voice('fail=0');

  // ---- Systems: Nova and the month's estimate; a test line; off (Moira, no audio asked for) and on
  await p.click('#status'); await p.waitForSelector('[data-brief="aitest"]');
  const sys = await txt(p, '#content');
  assert.ok(sys.includes('AI voice: Nova (OpenAI), prepared when the briefing compiles') && sys.includes('About 1.2¢ this month'), sys.slice(sys.indexOf('AI voice'), sys.indexOf('AI voice') + 200));
  assert.ok(sys.includes('iPad voice: Moira · en-IE.'));
  const n3 = (await calls()).length, n4 = (await plays(p)).length;
  await p.click('[data-brief="aitest"]');
  await until(async () => (await calls()).length === n3 + 1 && (await plays(p)).slice(n4).some(s => s.startsWith('blob:')));
  assert.deepStrictEqual((await calls())[n3], ['Good morning, Captain. This is Nova, reading your briefing.']);
  // the voice log shows each step, so a silent failure on the iPad can be read
  await p.waitForTimeout(300);
  const log = await txt(p, '.br-diag');
  assert.ok(log.startsWith('VOICE LOG · THIS SESSION') && log.includes('This iPad can play MP3') && /Bridge answered in [\d.]+ s: 1 KB, MP3/.test(log) && log.includes('Playing the test line'), log);
  assert.ok(log.includes('Briefing audio failed: voice_no_credit'), 'the earlier refusal is in the log');
  await p.click('[data-brief="voff"]'); await p.waitForSelector('[data-brief="von"]');
  assert.ok((await txt(p, '#content')).includes('AI voice: off; Moira reads it.'));
  await bridge(p);
  const n5 = (await calls()).length, s0 = await p.evaluate(() => window.__said.length);
  await p.click('[data-brief="again"]'); await p.waitForSelector('#brPaper .br-caret', { timeout: 10000 }); await p.waitForTimeout(600);
  assert.strictEqual((await calls()).length, n5, 'off: no audio asked for');
  await p.click('#brPaper'); await p.click('[data-brief="say"]'); await p.waitForTimeout(150);
  assert.ok(await p.evaluate(n => window.__said.length > n, s0), 'off: Moira reads it');
  await p.click('[data-brief="say"]');
  await p.click('#status'); await p.click('[data-brief="von"]'); await p.waitForSelector('[data-brief="voff"]');

  // ---- an older bridge (no voice): Systems says what it needs
  await voice('cap=0');
  await p.click('#refreshBtn'); await p.waitForTimeout(1500);
  assert.ok((await txt(p, '#content')).includes("AI voice: off. Add OPENAI_API_KEY to the Google bridge's Script Properties and update it to 1.30"));

  await reset();
  console.log('errors', errs);
  await b.close();
})().catch(async e => { await reset().catch(() => {}); console.error(e); process.exit(1); });
