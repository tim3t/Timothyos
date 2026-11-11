// A FULL STORE IS NEVER SILENT (2.77; simulated bridge :8105, invented meals). SYSTEMS has THIS IPAD'S STORAGE: what is
// in use, what is kept only here, the saved copies, the largest items. With the browser's storage filled to the brim:
// a setting that no longer fits makes room by dropping saved copies and is saved; with nothing left to drop it is held
// in memory (the screen still shows it, a dinner still reaches the bridge), the Bridge's Condition turns red, the fix
// card in SYSTEMS says what isn't saved; once there is room MAKE ROOM AND SAVE writes it, the Condition clears, and it
// is still there after a reload. CLEAR SAVED COPIES empties the copies. COMPUTER finds the section. Phone width.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const mode = q => fetch(B + '&action=mealmode&' + q).then(r => r.json());
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 120)); } };
const ymdIn = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = ymdIn(new Date());
const COPIES = ['tos.cache.v1', 'tos.tasks.v1', 'tos.dates.v1', 'tos.done.v1', 'tos.weeks.v1', 'tos.rlog.v1', 'tos.habits.v1', 'tos.library.v1', 'tos.tarot.v1', 'tos.apiary.v1', 'tos.inbox.v1', 'tos.ledger.v1',
  'tos.hols.v1', 'tos.schema.v1', 'tos.astro.v1', 'tos.wx.v1', 'tos.export.v1', 'tos.sickbay.v1', 'tos.meals.v1', 'tos.mealrc.v1', 'tos.nasart.v1', 'tos.nastags.v1', 'tos.naslen.v1', 'tos.hololen.v1', 'tos.holoadlen.v1', 'tos.hololoud.v1'];
// Fill what is left of the browser's storage under one key, down to the last character.
const fill = (p, key) => p.evaluate(k => { let s = '', c = 'x'.repeat(1 << 20); while (c.length) { try { localStorage.setItem(k, s + c); s += c; } catch (e) { c = c.slice(0, c.length >> 1); } } return s.length; }, key);
const copies = (p) => p.evaluate(l => l.filter(k => localStorage.getItem(k) !== null), COPIES);
const addItem = async (p, name) => { if (!await p.$('#mlAddN')) await p.click('[data-ml="add"]'); await p.fill('#mlAddN', name); await p.click('[data-ml="addsave"]'); };
const saved = (p, name) => p.evaluate(n => (localStorage.getItem('tos.mealgot.v1') || '').includes(n), name);

(async () => {
  await mode('cap=1&reset=1&seed=1');
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(TODAY + 'T12:00:00-06:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'meals'])); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-row');

  // ---- SYSTEMS: the section, with room to spare
  await p.click('#status'); await p.waitForSelector('#sec-store');
  let sec = await txt(p, '#sec-store');
  assert.ok(/^THIS IPAD'S STORAGE [\d.]+ MB USED/.test(sec) && /IN USE [\d.]+ MB of about 5 MB/.test(sec) && sec.includes('KEPT ONLY HERE') && sec.includes('SAVED COPIES') && sec.includes('LARGEST'), sec);
  assert.ok(await p.$('#sec-store [data-act="storeclear"]:not([disabled])'), 'there are copies to clear');
  assert.ok((await copies(p)).includes('tos.meals.v1'), 'the meals are a saved copy');
  assert.strictEqual(await p.$('#fix-store'), null);

  // ---- full to the brim, copies still there: a setting makes room for itself
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-row');
  const before = (await copies(p)).length;
  assert.ok(await fill(p, 'zz.filler') > 100000, 'the store was filled');
  await addItem(p, 'Paper towels');
  assert.ok((await txt(p, '.ml-groc')).includes('Paper towels'));
  assert.ok(await saved(p, 'Paper towels'), 'saved, by making room');
  assert.ok((await copies(p)).length < before, 'a saved copy was dropped for it');
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  assert.ok(!(await txt(p, '#content')).includes("storage is full"), 'nothing to warn about: it was saved');
  await p.click('#status'); await p.waitForSelector('#sec-store');
  assert.ok(/Room was made at .* by dropping \d+ saved cop(y|ies)\. Nothing was lost\./.test(await txt(p, '#sec-store')), await txt(p, '#sec-store'));

  // ---- full, and nothing left to drop: held in memory, and said out loud
  await p.evaluate(l => l.forEach(k => localStorage.removeItem(k)), COPIES);
  await fill(p, 'zz.filler2');
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-groc');
  await addItem(p, 'Kitchen foil');
  assert.ok((await txt(p, '.ml-groc')).includes('Kitchen foil'), 'the screen still shows it');
  assert.ok(!await saved(p, 'Kitchen foil'), 'not in the store: there was no room');
  await until(async () => /storage is full/.test(await txt(p, '#toast')));
  // a change still goes out
  await p.click('[data-ml="wknext"]');
  const open = await p.$$eval('.ml-days .ml-day.open', e => e.map(x => x.dataset.mlday));
  await p.click(`.ml-day[data-mlday="${open[0]}"]`); await p.click('[data-mlcard="m-curry"]');
  await until(async () => { const x = (await mode('')).posts.filter(q => q[0] === 'dinnerset').pop(); return x && x[1].date === open[0] && x[1].meal === 'm-curry'; });
  // the Bridge: red, first
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  assert.ok((await txt(p, '.ov-cond')).startsWith('CONDITION RED'), await txt(p, '.ov-cond'));
  const cond = await txt(p, '[data-fix="store"]');
  assert.ok(/This iPad's storage is full \d+ things? (isn't|aren't) saved on this iPad yet\. Keep Bridge open, and make room in SYSTEMS\./.test(cond), cond);
  await p.click('[data-fix="store"]'); await p.waitForSelector('#fix-store');
  const card = await txt(p, '#fix-store');
  assert.ok(card.includes('Not saved on this iPad yet:') && card.includes('MAKE ROOM AND SAVE') && card.includes('closing or reloading Bridge now would lose'), card);
  sec = await txt(p, '#sec-store');
  assert.ok(/^THIS IPAD'S STORAGE FULL · \d+ NOT SAVED/.test(sec) && sec.includes('tried again every 30 seconds'), sec);
  await p.screenshot({ path: 'out/e86-full.png' });

  // ---- room again: MAKE ROOM AND SAVE writes what was waiting
  await p.evaluate(() => { localStorage.removeItem('zz.filler'); localStorage.removeItem('zz.filler2'); });
  await p.click('[data-act="fixstore"]');
  await until(() => saved(p, 'Kitchen foil'));
  await until(async () => /Room made: everything is saved on this iPad/.test(await txt(p, '#toast')));
  assert.ok(/^THIS IPAD'S STORAGE [\d.]+ MB USED/.test(await txt(p, '#sec-store')), await txt(p, '#sec-store'));
  await p.click('.elbow'); await p.waitForSelector('.ov-cond');
  assert.ok(!(await txt(p, '#content')).includes('storage is full'), 'Condition clear again');
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('[data-screen="meals"].nav'); await p.waitForSelector('.ml-groc');
  const groc = await txt(p, '.ml-groc');
  assert.ok(groc.includes('Kitchen foil') && groc.includes('Paper towels'), 'both are there after a reload: ' + groc);

  // ---- CLEAR SAVED COPIES (offline, so nothing refills them while we look)
  await p.click('#status'); await p.waitForSelector('#sec-store');
  await until(async () => (await copies(p)).length > 0);
  await ctx.setOffline(true);
  await p.click('#sec-store [data-act="storeclear"]');
  assert.deepStrictEqual(await copies(p), []);
  await until(async () => /Saved copies cleared/.test(await txt(p, '#toast')));
  assert.ok(await p.$('#sec-store [data-act="storeclear"][disabled]'), 'nothing left to clear');
  await ctx.setOffline(false);

  // ---- COMPUTER finds it; phone width
  await p.click('.elbow'); await p.click('#cmdBtn'); await p.fill('#cmdText', 'storage full');
  assert.ok((await txt(p, '#cmdList')).includes("This iPad's storage"), await txt(p, '#cmdList'));
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#status'); await p.waitForSelector('#sec-store');
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'fits at 400 px: ' + w);

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  await mode('reset=1&seed=1');
  console.log('STORAGE: the section, room made, full and said, held in memory, saved once there is room, cleared, found: ok');
})().catch(e => { console.error(e); process.exit(1); });
