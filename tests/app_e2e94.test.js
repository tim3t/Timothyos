// THE SYSTEMS INDEX (2.86, C1; mock :8105). SYSTEMS in six groups, one shown at a time (option A of the 16 Nov mockup).
// Every section is in exactly one group (the tab counts add up to the sections drawn); SYSTEMS opens on STATUS; a tab
// shows its group alone; it stays picked through a redraw while you stay, and STATUS comes back the next time you come
// in. Lights: yellow on STATIONS (sections still to set up, and the line under the tabs counts them); red on STATUS for
// an error in the last 24 hours; with a calendar that can't be found, GOOGLE + NOTION is red and SYSTEMS opens there.
// COMPUTER, ENGINEERING's OPEN SYSTEMS and AUDIO's link open the group they point into. NEEDS YOU stays above the tabs.
// Phone width: the tabs wrap, nothing wider than the screen.
const { chromium } = require('playwright');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const until = require('./lib/explain').until(10000, 150);
const deep = require('./lib/deep');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec';
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const TABS = ['STATUS', 'THIS IPAD', 'GOOGLE + NOTION', 'STATIONS', 'HOME NETWORK', 'PREFERENCES'];
const shown = p => p.$$eval('#content .sys > section:not([hidden]):not(#fixPanel) .phead h2', l => l.map(h => h.textContent.trim()));
const tabs = p => p.$$eval('.sys-tab', l => l.map(b => ({ n: b.querySelector('.sys-tn').textContent, k: b.dataset.sysg, c: +b.querySelector('.sys-n').textContent, on: b.getAttribute('aria-selected') === 'true', light: (b.querySelector('.sys-light') || { className: '' }).className.replace('sys-light', '').trim() })));

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await lane(ctx);
  let lostCal = false;
  await ctx.route(new RegExp('127\\.0\\.0\\.1:' + P8105 + '/macros'), async route => {
    if (!lostCal) return route.continue();
    const res = await route.fetch(), j = await res.json();
    const fix = o => { if (o && Array.isArray(o.calendars)) o.calendars = o.calendars.map(c => c.area === 'personal' ? { area: 'personal', ok: false, error: 'not_found' } : c); };
    fix(j); (j.results || []).forEach(fix);
    return route.fulfill({ response: res, json: j });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, u]) => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.briefoff.v1', 'true'); }, [K, U]);
  await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });

  // ---- opens on STATUS; six tabs; every section in exactly one of them
  await p.click('#status'); await p.waitForSelector('#sysIndex');
  let t = await tabs(p);
  assert.deepStrictEqual(t.map(x => x.n), TABS);
  assert.deepStrictEqual(t.filter(x => x.on).map(x => x.n), ['STATUS']);
  const all = await p.$$eval('#content .sys > section:not(#fixPanel)', l => l.length);
  assert.strictEqual(t.reduce((a, x) => a + x.c, 0), all, 'the tab counts add up to every section: none left out, none twice');
  assert.deepStrictEqual(await shown(p), ['CONNECTION', 'DIAGNOSTICS', 'RECENT REQUESTS', 'ERROR LOG', 'APP']);
  assert.ok(/^STATUS Is Bridge reaching Google/.test(await txt(p, '.sys-about')), await txt(p, '.sys-about'));
  assert.strictEqual(t.find(x => x.n === 'STATUS').light, '', 'nothing wrong yet');

  // ---- yellow: STATIONS has sections still to set up
  const st = t.find(x => x.n === 'STATIONS');
  assert.strictEqual(st.light, 'sys-warn', JSON.stringify(st));
  await p.click('[data-sysg="stations"]');
  assert.ok(/STATIONS Each station's own Notion database and settings \d need setting up/.test(await txt(p, '.sys-about')), await txt(p, '.sys-about'));
  assert.deepStrictEqual((await shown(p)).sort(), ["APIARY", "CAPTAIN'S LOG", 'INBOX', 'MEALS', 'SCIENCE', 'SICKBAY', 'TAROT'].sort());

  // ---- a tab shows its group alone, and stays picked through a redraw while you stay
  await p.click('[data-sysg="ipad"]');
  assert.deepStrictEqual(await shown(p), ['BACKUP AND RESTORE', "THIS IPAD'S STORAGE", 'PROFILE SYNC']);
  await p.click('#status');   // tapping the status again redraws SYSTEMS in place
  await p.waitForSelector('#sysIndex');
  assert.deepStrictEqual((await tabs(p)).filter(x => x.on).map(x => x.n), ['THIS IPAD'], 'kept while you stay');
  await p.click('.elbow'); await p.click('#status'); await p.waitForSelector('#sysIndex');
  assert.deepStrictEqual((await tabs(p)).filter(x => x.on).map(x => x.n), ['STATUS'], 'STATUS again next time');

  // ---- red: an error in the last 24 hours lights STATUS
  await p.evaluate(() => { const t0 = Date.now() - 3600e3; localStorage.setItem('tos.errlog.v1', JSON.stringify([{ t: t0, s: 'bridge', a: 'sync: tasks', m: 'timeout', d: '45.0 s', v: '2.86.0', n: 1 }])); });
  await p.reload(); await p.waitForSelector('#status'); await p.click('#status'); await p.waitForSelector('#sysIndex');
  t = await tabs(p);
  assert.strictEqual(t.find(x => x.n === 'STATUS').light, 'sys-bad');
  // an old one (two days) no longer counts, though its row stays red in the log
  await p.evaluate(() => { const t0 = Date.now() - 2 * 864e5; localStorage.setItem('tos.errlog.v1', JSON.stringify([{ t: t0, s: 'bridge', a: 'sync: tasks', m: 'timeout', d: '45.0 s', v: '2.86.0', n: 1 }])); });
  await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 }); await p.click('#status'); await p.waitForSelector('#sysIndex');
  const why = () => p.evaluate(() => [...document.querySelectorAll('#content .sys > section[data-sysg="status"]')].map(x => x.querySelector('.phead h2').textContent + ': ' + ((x.querySelector('.phead').getAttribute('style') || '') + ' ' + [...x.querySelectorAll('.pill.bad, .err')].filter(e => !e.closest('.el-list') && e.textContent.trim()).map(e => e.textContent.trim()).join(', '))).join(' | ') + ' · log ' + localStorage.getItem('tos.errlog.v1'));
  assert.strictEqual((await tabs(p)).find(x => x.n === 'STATUS').light, '', 'a row from two days ago does not light STATUS: ' + await why());
  assert.ok(await p.$('#sec-errlog .el-row .pill.bad'), 'the row itself is still red');

  // ---- a calendar that can't be found: GOOGLE + NOTION is red, and SYSTEMS opens there
  lostCal = true;
  await deep.drop(p, 'tos.cache.v1');   // so the next sync reads the calendars again
  await p.click('.elbow'); await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });
  await p.click('#status'); await p.waitForSelector('#sysIndex');
  await until(async () => (await tabs(p)).find(x => x.n === 'GOOGLE + NOTION').light === 'sys-bad', 15000, 'GOOGLE + NOTION to turn red');
  await p.click('.elbow'); await p.click('#status'); await p.waitForSelector('#sysIndex');   // coming in again
  t = await tabs(p);
  assert.deepStrictEqual(t.filter(x => x.on).map(x => x.n), ['GOOGLE + NOTION'], 'opens on the group that needs you');
  assert.ok((await shown(p)).includes('CALENDARS'));
  lostCal = false;
  await p.click('.elbow'); await p.reload(); await p.waitForSelector('#status:has-text("SYNCED")', { timeout: 20000 });

  // ---- COMPUTER opens the group it points into
  await p.click('#cmdBtn'); await p.fill('#cmdText', 'storage full');
  await p.waitForSelector('#cmdList [role="option"]');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#sec-store:not([hidden])');
  assert.deepStrictEqual((await tabs(p)).filter(x => x.on).map(x => x.n), ['THIS IPAD']);

  // ---- ENGINEERING's OPEN SYSTEMS (no Home Assistant yet): HOME NETWORK, at HOME ASSISTANT
  await p.click('#allBtn'); await p.click('[data-station="engineering"]');
  await p.click('[data-eng="systems"]');
  await p.waitForSelector('#sec-ha:not([hidden])');
  assert.deepStrictEqual((await tabs(p)).filter(x => x.on).map(x => x.n), ['HOME NETWORK']);
  assert.deepStrictEqual(await shown(p), ['NAS RELAY', 'HOME ASSISTANT']);

  // ---- phone width: the tabs wrap; nothing wider than the screen
  await p.setViewportSize({ width: 400, height: 860 });
  await p.click('#status'); await p.waitForSelector('#sysIndex');
  const w = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth));
  assert.ok(w <= 400, 'no sideways scroll: ' + w);
  const rows = await p.$$eval('.sys-tab', l => new Set(l.map(x => Math.round(x.getBoundingClientRect().top))).size);
  assert.ok(rows >= 2, 'the tabs wrap onto ' + rows + ' rows');
  await p.screenshot({ path: __dirname + '/out/e94-systems-phone.png' });

  console.log('errors', JSON.stringify(errs));
  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('THE SYSTEMS INDEX: six groups, one at a time, lights, kept while you stay, jumps, phone width: ok');
})().catch(e => { console.error(e); process.exit(1); });
