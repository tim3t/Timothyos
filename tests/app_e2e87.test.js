// DIAGNOSTICS (2.78; simulated bridge :8105, invented data). SYSTEMS has a DIAGNOSTICS section near the top; COPY
// DIAGNOSTICS puts one plain-text report on the clipboard: versions, the bridge and what this app needs, features,
// sync, today's requests, Condition (headlines only), what is waiting to be sent, storage, profile sync, which links
// are set, and the error log. It never holds the access key, the bridge's or relay's address, a token, or a title
// (an error logged with a key and an address in it comes out scrubbed). COMPUTER's "Copy diagnostics" does the same.
// Phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const NAS = 'nas-token-' + 'n'.repeat(40);

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u, nas]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals']));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: 'https://nas.example-tailnet.ts.net', token: nas }));
    // an error as an older version might have logged it, key and address unscrubbed
    localStorage.setItem('tos.errlog.v1', JSON.stringify([{ t: Date.now() - 60000, s: 'bridge', a: 'events', m: 'timed out at https://script.google.com/macros/s/AKfyc' + 'x'.repeat(40) + '/exec?key=' + k, d: 'retry', v: '2.77.0', n: 2, l: Date.now() - 30000 }]));
    // a capture waiting to be sent, with a title that must not appear
    localStorage.setItem('tos.mealgot.v1', JSON.stringify({ wk: '', got: {}, extra: [{ n: 'Secret groceries', a: 'Pantry' }] }));
  }, [K, U, NAS]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-row');

  // ---- SYSTEMS: the section, near the top
  await p.click('#status'); await p.waitForSelector('#sec-diag');
  const order = await p.$$eval('#content section', l => l.map(s => s.id).filter(Boolean));
  assert.ok(order.indexOf('sec-diag') > -1 && order.indexOf('sec-diag') < order.indexOf('sec-backup'), 'after CONNECTION, before BACKUP: ' + order.join(' '));
  const sec = await txt(p, '#sec-diag');
  assert.ok(sec.startsWith('DIAGNOSTICS FOR CLAUDE') && sec.includes('No keys, no addresses') && sec.includes('COPY DIAGNOSTICS'), sec);

  // ---- COPY DIAGNOSTICS
  await p.evaluate(() => navigator.clipboard.writeText(''));
  await p.click('[data-act="diagcopy"]');
  await until(async () => /Diagnostics copied/.test(await txt(p, '#toast')));
  const r = await p.evaluate(() => navigator.clipboard.readText());
  const ver = await p.evaluate(() => fetch('version.json').then(x => x.json()).then(j => j.version));
  for (const want of ['TimothyOS DIAGNOSTICS', 'APP ' + ver, 'BRIDGE deployed ', 'this app needs ', 'FEATURES ', 'meals', 'SYNC ', 'BRIDGE TODAY ', 'CONDITION ', 'WAITING TO SEND ',
    'STORAGE ', 'of about 5 MB', 'PROFILE SYNC off', 'LINKS NAS relay set · Home Assistant not set · pinned today, meals', 'ERRORS 1 kept', '[BRIDGE] events: timed out at (an address)'])
    assert.ok(r.includes(want), 'the report has "' + want + '":\n' + r);
  for (const never of [K, NAS, '127.0.0.1:8105', 'script.google.com', 'ts.net', 'AKfyc', 'Secret groceries', 'Sample '])
    assert.ok(!r.includes(never), 'the report must not hold "' + never + '":\n' + r);
  assert.ok(r.split('\n').length < 80, 'short enough to paste');

  // ---- COMPUTER: "Copy diagnostics"
  await p.evaluate(() => navigator.clipboard.writeText(''));
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'diagnostics');
  assert.ok((await txt(p, '#cmdList')).includes('Copy diagnostics'));
  await p.keyboard.press('Enter');
  await until(async () => (await p.evaluate(() => navigator.clipboard.readText())).startsWith('TimothyOS DIAGNOSTICS'));

  // ---- phone width
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#status'); await p.waitForSelector('#sec-diag');
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'fits at 400 px: ' + w);
  await (await p.$('#sec-diag')).screenshot({ path: 'out/e87-diag.png' });

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await mode('reset=1&seed=1');
  console.log('DIAGNOSTICS: the section, the report (with no keys, addresses or titles), COMPUTER, narrow: ok');
})().catch(e => { console.error(e); process.exit(1); });
