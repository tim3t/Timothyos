// HEALTH THAT TRUES UP, AND A QUIETER WAKE (2.81.2; simulated SICKBAY bridge :8106, every value invented). Timothy saw
// a day marked ARRIVED with steps short of Health: every measure was in by 13:32 that day and nothing came after 14:42.
// A day is ARRIVED only once a send came in after it ended; until then PARTIAL, saying when it was last sent. Over 14
// hours without a send, every tab says NO SEND SINCE … with SYNC FROM HEALTH. After the iPad wakes, requests the
// network drops while it reconnects wait and try again, and leave nothing in the error log.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8106/macros/s/test/exec', CTL = 'http://127.0.0.1:8106/?action=';
const ctl = q => fetch(CTL + q).then(r => r.json());
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayBack = n => { const [y, m, d] = ymdIn(new Date()).split('-').map(Number); return ymdIn(new Date(Date.UTC(y, m - 1, d - n, 18))); };   // n days before today in Chicago

(async () => {
  await ctl('skreset'); await ctl('skmode&early=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const txt = async s => (await p.innerText(s)).replace(/\s+/g, ' ').trim();
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true');
    localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'sickbay'])); }, [K, U]);
  await p.reload();
  await p.click('[data-screen="sickbay"].nav'); await p.waitForSelector('.sk-arrive');

  // ---- yesterday: every measure in, but last sent on the day itself → PARTIAL, saying when
  const yd = dayBack(1);
  await p.click('[data-sktab="days"]');
  await p.click('.sk-dchip[data-skday="' + yd + '"]');
  await p.waitForSelector('.sk-pill');
  assert.ok(/PARTIAL/.test(await txt('.sk-pill')), 'not ARRIVED: ' + await txt('.sk-pill'));
  const st = await txt('.sk-stamp');
  assert.ok(/Arrived .*13:32.*the same day/.test(st) && /Last sent at 14:42 on the day itself: the rest of the day \(steps, rings, anything later\) comes with the next send\./.test(st), st);
  assert.ok(new RegExp('Still coming in: [^.]*\\(partial\\)').test(await txt('.sk-arrive')), await txt('.sk-arrive'));
  // two days back, sent again after it ended: ARRIVED as before
  const d2 = dayBack(2);
  await p.click('.sk-dchip[data-skday="' + d2 + '"]'); await until(async () => /ARRIVED/.test(await txt('.sk-pill')));
  await p.screenshot({ path: 'out/e90-days.png' });

  // ---- 72 hours without a send: NO SEND SINCE, with SYNC FROM HEALTH, on every tab
  await ctl('skmode&stale=1');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // back in front: SICKBAY reads again
  await until(async () => /NO SEND SINCE/.test(await txt('.sk-arrive')));
  const ban = await txt('.sk-arrive');
  assert.ok(/^NO SEND SINCE \d+ [A-Z]{3} \d\d:\d\d The Health shortcut's runs aren't arriving\. On HUB, SYNC FROM HEALTH runs it now; Auto-Lock set to Never keeps the timed runs working\./.test(ban), ban);
  assert.ok(await p.$('.sk-arrive.sk-late [data-skact="sync"]'), 'SYNC FROM HEALTH in the banner');
  await p.click('[data-sktab="vitals"]').catch(() => {});
  await until(async () => /NO SEND SINCE/.test(await txt('.sk-arrive')));
  await (await p.$('.sk-arrive')).screenshot({ path: 'out/e90-late.png' });
  // three hours since the last send: the usual banner
  await ctl('skmode');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(async () => /HEALTH ARRIVES A DAY OR TWO LATE/.test(await txt('.sk-arrive')));
  assert.strictEqual(await p.$('.sk-late'), null);

  // ---- a wake: the first requests are dropped while the network reconnects; they wait, try again, and log nothing
  const errsBefore = await p.evaluate(() => (JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]')).length);
  let drop = 3, dropped = 0;
  await ctx.route(/127\.0\.0\.1:8106\/macros/, r => { if (drop > 0) { drop--; dropped++; return r.abort('internetdisconnected'); } return r.continue(); });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await until(async () => dropped === 3, 10000);
  await until(async () => /SYNCED/.test(await txt('#status')), 30000);
  await until(async () => (await p.evaluate(() => JSON.parse(localStorage.getItem('tos.netlog.v1') || '[]').filter(n => n.r === 'dropped · waking').length)) === 3, 20000);
  assert.strictEqual(await p.evaluate(() => (JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]')).length), errsBefore, 'nothing in the error log');
  const day = await p.evaluate(() => JSON.parse(localStorage.getItem('tos.netday.v1') || '{}'));
  assert.strictEqual(day.f, 0, 'not counted as failed today');

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await ctl('skreset');
  console.log('HEALTH TRUES UP: PARTIAL until a send after the day, NO SEND SINCE, a quiet wake: ok');
})().catch(e => { console.error(e); process.exit(1); });
