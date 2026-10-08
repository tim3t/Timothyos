// Ask Claude in the app: the ASK sheet, the snapshot sent with each question,
// THINK HARDER, change cards that do nothing until CONFIRM, every kind of change,
// budget pause, OPEN IN CLAUDE, the Review summary, the Systems meter, phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const stats = async () => (await (await fetch('http://127.0.0.1:8097/x/exec?action=stats&key=' + K)).json());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  let opened = null;
  await ctx.route('https://claude.ai/**', r => { opened = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }); });
  await p.clock.setFixedTime(new Date('2026-10-06T07:40:00-05:00'));
  await p.goto('http://localhost:8080/');

  // --- bridge 1.5: ASK shows SETUP, Review's summary button waits
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); }, conn(8096));
  await p.reload(); await p.waitForTimeout(1500);
  assert.ok(await p.isDisabled('#askBtn')); assert.ok((await p.textContent('#askBtn')).includes('SETUP'));

  // --- bridge 1.6
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.ignore.v1', JSON.stringify(['away block'])); localStorage.setItem('tos.log.v1', JSON.stringify({ '2026-10-06': 'Deep work before noon' })); }, conn(8097));
  await p.reload(); await p.waitForTimeout(2000);
  assert.ok(!(await p.isDisabled('#askBtn')));
  await p.click('#askBtn'); await p.waitForTimeout(300);
  assert.ok(await p.isVisible('#askSheet')); assert.ok((await p.textContent('#askLog')).includes('Nothing changes until you tap CONFIRM'));
  assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'askText');

  await p.fill('#askText', 'What should I do first today?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  let s = await stats(), a = s.asks[s.asks.length - 1];
  console.log('snapshot sent (start):\n   ' + a.ctx.split('\n').slice(0, 6).join('\n   '));
  assert.strictEqual(a.mode, 'fast'); assert.deepStrictEqual(a.ignore, ['away block']);
  assert.ok(a.ctx.startsWith('NOW: TUESDAY 2026-10-06 07:40'));
  assert.ok(/CONDITION: RED · Overdue, High priority \(Order spring bulbs\)/.test(a.ctx), 'condition in plain text');
  assert.ok(/\[[0-9a-f]{32}\] Order spring bulbs/.test(a.ctx), 'task ids for proposals');
  assert.ok(a.ctx.includes("TODAY'S INTENT: Deep work before noon"));
  assert.ok(a.ctx.includes('LIFE AREAS: ') && a.ctx.includes('KEY DATE TYPES: '));
  assert.ok(!a.ctx.includes('Away block'), 'ignored events not sent');
  const bot = await p.innerText('.amsg.bot');
  console.log('answer:', bot.replace(/\s+/g, ' '));
  assert.ok(bot.includes('Order spring bulbs first') && bot.includes('SONNET · 1.2¢'));
  assert.ok((await p.textContent('#askMeter')).includes('$0.43 THIS MONTH · REMINDER AT $8.00'));

  // --- THINK HARDER: Opus, conversation history sent
  await p.click('#askDeep'); assert.strictEqual(await p.getAttribute('#askDeep', 'aria-pressed'), 'true');
  await p.fill('#askText', 'And after that?'); await p.click('#askSend'); await p.waitForTimeout(1200);
  s = await stats(); a = s.asks[s.asks.length - 1];
  assert.strictEqual(a.mode, 'deep'); assert.strictEqual(a.turns, 3, 'previous question and answer go along');
  assert.ok((await p.locator('.amsg.bot .ameta').last().textContent()).startsWith('OPUS'));
  await p.click('#askDeep');

  // --- proposals: nothing happens until CONFIRM
  const createdBefore = s.created.length;
  await p.fill('#askText', 'Remind me to call the vet Thursday at 3'); await p.click('#askSend'); await p.waitForTimeout(1200);
  const card = p.locator('.prop').last();
  console.log('card:', (await card.innerText()).replace(/\s+/g, ' '));
  assert.ok((await card.innerText()).includes('ADD TO PERSONAL CALENDAR · Call the vet') && (await card.innerText()).includes('THU 08 OCT · 15:00 · 15 MIN'));
  s = await stats(); assert.strictEqual(s.created.length, createdBefore, 'not created before CONFIRM');
  await card.locator('[data-pok]').click(); await p.waitForTimeout(1500);
  s = await stats(); console.log('created after confirm:', s.created.slice(-1));
  assert.ok(s.created.includes('Call the vet')); assert.ok((await card.innerText()).includes('DONE'));

  await p.fill('#askText', 'Add a task to order hive frames'); await p.click('#askSend'); await p.waitForTimeout(1200);
  const tcard = p.locator('.prop').last();
  assert.ok((await tcard.innerText()).includes('Beekeeping · Medium'), 'plain labels on cards');
  await tcard.locator('[data-pcancel]').click();
  assert.ok((await tcard.innerText()).includes('CANCELLED'));
  s = await stats(); assert.ok(!s.tasks.some(t => t[0] === 'Order hive frames'), 'cancelled task never added');

  await p.fill('#askText', 'Please pick the furnace one for today'); await p.click('#askSend'); await p.waitForTimeout(1200);
  await p.locator('.prop').last().locator('[data-pok]').click(); await p.waitForTimeout(1200);
  s = await stats(); assert.ok(s.tasks.some(t => t[0] === 'Book furnace service' && t[2] === '2026-10-06'), 'focus set after confirm');

  await p.fill('#askText', 'Add a key date for the seed order'); await p.click('#askSend'); await p.waitForTimeout(1200);
  await p.locator('.prop').last().locator('[data-pok]').click(); await p.waitForTimeout(1500);
  s = await stats(); assert.ok(s.dates.some(d => d[0] === 'Seed order deadline'), 'key date saved');

  await p.fill('#askText', 'Fill out my review'); await p.click('#askSend'); await p.waitForTimeout(1200);
  await p.locator('.prop').last().locator('[data-pok]').click(); await p.waitForTimeout(300);
  assert.ok((await p.locator('.prop').last().innerText()).includes('Open REVIEW'));
  await p.screenshot({ path: D + 'ask-ipad.png' });

  // --- conversation survives a reload; NEW CHAT clears it
  await p.click('#askClose'); await p.reload(); await p.waitForTimeout(1500);
  await p.click('#askBtn'); await p.waitForTimeout(300);
  assert.ok(await p.locator('.amsg.user').count() >= 6, 'conversation kept on the iPad');
  await p.click('#askNew'); assert.strictEqual(await p.locator('.amsg').count(), 0);

  // --- budget pause shows a clear message and keeps the question
  await p.fill('#askText', 'BUDGET test'); await p.click('#askSend'); await p.waitForTimeout(1000);
  console.log('budget msg:', await p.textContent('#askErr'));
  assert.ok((await p.textContent('#askErr')).includes("Ask paused at this month's reminder ($8.00 of $8.00)"));
  assert.ok((await p.textContent('#askErr')).includes('until the Claude Console stops it (your $10 ceiling there)'));
  assert.strictEqual(await p.inputValue('#askText'), 'BUDGET test');
  // CONTINUE carries on for the month and resends the question
  await p.click('#askContinue'); await p.waitForTimeout(1500);
  assert.ok((await stats()).spend.cont, 'continue recorded');
  assert.strictEqual(await p.locator('#askContinue').count(), 0);
  assert.ok((await p.textContent('#askMeter')).includes('CONTINUED PAST $8.00'));
  await p.click('#askNew');

  // --- OPEN IN CLAUDE
  await p.fill('#askText', 'Help me plan the weekend');
  await p.click('#askOpen'); await p.waitForTimeout(800);
  console.log('opened:', decodeURIComponent(opened || '').slice(0, 120));
  assert.ok(opened && opened.startsWith('https://claude.ai/new?q='));
  const q = decodeURIComponent(opened.split('q=')[1]);
  assert.ok(q.includes('My question: Help me plan the weekend') && !/\[[0-9a-f]{32}\]/.test(q), 'hand-off has the snapshot, without ids');
  await p.click('#askClose');

  // --- Review: review draft from Ask is there; WRITE SUMMARY; saved with the review
  await p.click('[data-screen="review"].nav'); await p.waitForTimeout(1000);
  await p.click('.rl-card.due'); await p.waitForTimeout(1000);
  assert.strictEqual(await p.textContent('#title'), '28 SEP TO 04 OCT', 'on a Tuesday, last week is the one due');
  await p.click('#nextBtn'); await p.waitForTimeout(1500);
  assert.strictEqual(await p.inputValue('#rv-wentWell'), 'Shipped the deck', 'Ask draft placed in Review');
  await p.click('[data-act="writesummary"]'); await p.waitForTimeout(1500);
  console.log('summary:', await p.inputValue('#rv-summary'), '| toast', await p.textContent('#toast'));
  assert.ok((await p.inputValue('#rv-summary')).startsWith('A steady week'));
  s = await stats(); a = s.asks[s.asks.length - 1];
  assert.strictEqual(a.mode, 'summary'); assert.ok(a.ctx.includes('Finished (3)') && a.ctx.includes('What went well: Shipped the deck'));
  await p.click('[data-act="savereview"]'); await p.waitForTimeout(1200);
  s = await stats(); assert.ok(s.reviews['2026-10-05'].summary.startsWith('A steady week'), 'summary saved to Notion');

  // --- Systems meter
  await p.click('#status'); await p.waitForTimeout(800);
  const sys = (await p.innerText('section:has(.phead:has-text("ASK CLAUDE"))')).replace(/\s+/g, ' ');
  console.log('systems:', sys.slice(0, 200));
  assert.ok(/\$\d\.\d\d · reminder at \$8\.00 \(continued\) · \$10 ceiling in the Claude Console · \d+ calls/.test(sys), 'meter line');
  assert.ok(sys.includes('Sonnet 5.5 for questions') && sys.includes('Opus 5.5 for THINK HARDER'));
  assert.ok(sys.includes('RECENT QUESTIONS') && sys.includes('QUESTION · SONNET') && sys.includes('THINK HARDER · OPUS'), 'per-question log');
  const mk = await p.evaluate(() => { const m = document.querySelector('.aimeter'), i = m.querySelector('i'); return { m: m.getBoundingClientRect().width, x: i.getBoundingClientRect().left - m.getBoundingClientRect().left, h: i.getBoundingClientRect().height }; });
  assert.ok(Math.abs(mk.x / mk.m - 0.8) < 0.02 && mk.h > 12, 'reminder mark at 80%, not clipped');
  await p.fill('#aiMatch', '$0.01'); await p.click('[data-act="aimatch"]'); await p.waitForTimeout(1200);
  assert.strictEqual((await stats()).spend.usd, 0.01, 'matched to the Console');
  const sys2 = (await p.innerText('section:has(.phead:has-text("ASK CLAUDE"))')).replace(/\s+/g, ' ');
  assert.ok(sys2.includes('$0.01 · reminder at $8.00') && sys2.includes('MATCHED TO THE CONSOLE'), sys2.slice(0, 300));
  await p.screenshot({ path: D + 'ask-systems.png' });

  // --- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#askBtn'); await p.waitForTimeout(300);
  await p.screenshot({ path: D + 'ask-phone.png' });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 400);

  console.log('errors', errs);
  assert.deepStrictEqual(errs, []);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
