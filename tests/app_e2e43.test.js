// OPEN IN CLAUDE (2.30.2; bridge simulated on :8105): the question comes first; the whole snapshot goes to the clipboard;
// when the claude.ai link can't hold it all, whole sections are left out (tarot readings first), the prompt starts with
// [SNAPSHOT SHORTENED · PASTE FROM CLIPBOARD FOR THE FULL VERSION], a closing line names what was left out, and nothing
// is cut mid-sentence. The clipboard copy has no marker. The in-app ASK still gets the whole snapshot.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), MARK = '[SNAPSHOT SHORTENED · PASTE FROM CLIPBOARD FOR THE FULL VERSION]';
const stats = () => fetch('http://127.0.0.1:8105/macros/s/test/exec?key=' + K + '&action=stats').then(r => r.json());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  let opened = null;
  await ctx.route('https://claude.ai/**', r => { opened = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }); });
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => {
    localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8105/macros/s/test/exec', key: k }));
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'tarot']));
  }, K);
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile', { timeout: 10000 }); await p.waitForTimeout(800);
  const handOff = async question => {
    opened = null;
    await p.click('#askBtn'); await p.waitForSelector('#askText');
    await p.fill('#askText', question);
    await p.click('#askOpen');
    for (let i = 0; i < 40 && !opened; i++) await p.waitForTimeout(100);
    assert.ok(opened && opened.startsWith('https://claude.ai/new?q='), 'claude.ai opened');
    const link = decodeURIComponent(opened.split('q=')[1]), clip = await p.evaluate(() => navigator.clipboard.readText());
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    return { link, clip };
  };

  // ---- a short snapshot: question first, nothing left out, link and clipboard the same
  let r = await handOff('What else could go in Engineering besides an oil change?');
  assert.ok(r.link.startsWith('My question: What else could go in Engineering besides an oil change?\n\nHere is a snapshot from my TimothyOS dashboard.'), r.link.slice(0, 160));
  assert.ok(!r.link.includes(MARK) && !r.link.includes('Left out to fit'));
  assert.strictEqual(r.clip, r.link);
  assert.ok(r.link.length <= 6000);

  // ---- a long one (tarot shared, a long question): whole sections left out, least needed first, the question kept
  await p.click('#status'); await p.waitForSelector('[data-aitarot]'); await p.click('[data-aitarot="1"]');
  // the Ask box takes up to 2,000 characters; a long ignored-titles list makes the snapshot overflow too
  await p.evaluate(() => localStorage.setItem('tos.ignore.v1', JSON.stringify(Array.from({ length: 60 }, (_, i) => 'Sample booking block number ' + (i + 1)))));
  await p.reload(); await p.waitForSelector('[data-panel="tarot"] .tr-tile', { timeout: 10000 }); await p.waitForTimeout(800);
  const longQ = 'Here is some context for my question. ' + Array.from({ length: 36 }, (_, i) => 'Line ' + (i + 1) + ' of background I want Claude to know about.').join(' ') + ' So what should I focus on?';
  assert.ok(longQ.length < 2000);
  r = await handOff(longQ);
  assert.ok(r.link.startsWith(MARK + '\n\nMy question: ' + longQ + '\n\nHere is a snapshot'), r.link.slice(0, 200));
  assert.ok(r.link.length <= 6000, 'fits the link: ' + r.link.length);
  const leftLine = r.link.match(/\n\n\(Left out to fit: ([^)]+)\.\)$/);
  assert.ok(leftLine, 'ends with what was left out: ' + r.link.slice(-200));
  assert.deepStrictEqual(leftLine[1].split(', '), ['tarot readings', 'ignored event titles'], 'tarot goes first, then only what it takes');
  assert.ok(!r.link.includes("TAROT (his readings"), 'tarot left out of the link');
  assert.ok(r.link.includes('NOW: ') && r.link.includes('TODAY:') && r.link.includes('NEXT 6 DAYS:'), 'what matters most stays');
  assert.ok(!r.link.includes('IGNORED EVENT TITLES'), 'the ignored titles left out whole');
  // the clipboard: everything, question first, no marker, no note
  assert.ok(r.clip.startsWith('My question: ' + longQ) && r.clip.includes("TAROT (his readings") && !r.clip.includes(MARK) && !r.clip.includes('Left out to fit'));
  assert.ok(r.clip.length > 6000);
  // every section in the link is whole: each one in the link appears in the clipboard as is
  const body = r.link.slice(r.link.indexOf('Here is a snapshot')).replace(/\n\n\(Left out to fit: [^)]+\.\)$/, '');
  assert.ok(r.clip.includes(body.split('\n\n').slice(-1)[0]), 'the last section in the link is complete');

  // ---- the in-app ASK still sends the whole snapshot, tarot included
  await p.click('#askBtn'); await p.fill('#askText', 'And the cards?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  const s = await stats(); assert.ok(s.asks[s.asks.length - 1].ctx.includes("TAROT (his readings"), 'Ask: whole snapshot');
  await p.keyboard.press('Escape');
  await p.click('#status'); await p.waitForSelector('[data-aitarot]'); await p.click('[data-aitarot="0"]');

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
