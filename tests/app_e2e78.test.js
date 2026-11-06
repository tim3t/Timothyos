// BRIDGE as a Time Ribbon (2.63; simulated bridge :8105 with MEALS seeded and tonight's dinner planned, INBOX on).
// Timothy's pick of three mockups (B) and his nine postulates: no HORIZON or BALANCE; the condition is a pill beside
// the date with what needs you in a strip under it (a tap on the pill brings the strip into view); the ribbon holds
// NOW / NEXT, the day with names on its blocks, the + (CAPTURE) and pins (dinner at 18:00, opening MEALS); three columns
// ORDERS OF THE DAY, BODY + HOME, COMMS (rows always in the same order); one card style; no sideways scroll; a redraw
// leaves the page where it was; in portrait the columns stack in the same order.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), U = 'http://127.0.0.1:8105/macros/s/test/exec', B = U + '?key=' + K;
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const ORDER = ['BRIEFING', 'INBOX', 'SCIENCE', 'KEY DATE', 'BEARING', 'TAROT'];

(async () => {
  await fetch(B + '&action=mealmode&cap=1&reset=1&seed=1&tonight=m-tacos');
  await fetch(B + '&action=inboxmode&cap=1&reset=1');
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[1180, 820], [820, 1180]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8080/');
    await p.evaluate(([k, u]) => {
      localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', '"bridge"');
      localStorage.setItem('tos.bearings.v1', JSON.stringify(['Steady hands', 'Open door']));
    }, [K, U]);
    await p.reload(); await p.waitForSelector('.rb-ribbon'); await p.waitForTimeout(2500);
    const tag = w + 'x' + h + ': ';

    // ---- gone: HORIZON and BALANCE
    assert.strictEqual(await p.locator('.ov-day, .ov-bal, .ov-grid').count(), 0, tag + 'no HORIZON, BALANCE or the old stack');
    assert.ok(!/HORIZON|BALANCE/.test(await p.innerText('#content')), tag + 'not named either');

    // ---- the condition pill beside the date, and what needs you under it
    const pill = await p.$('#condSlot .ov-cond');
    assert.ok(pill && await pill.isVisible(), tag + 'the pill is in the header');
    const lvl = (await pill.getAttribute('class')).match(/\b(green|yellow|red)\b/)[1], pt = await txt(p, '#condSlot .ov-cond');
    const n = await p.locator('.rb-alerts .ov-alert').count();
    console.log(tag + 'pill:', pt, '| alerts:', n);
    if (lvl === 'green') assert.ok(n === 0 && pt === 'CONDITION GREEN', pt);
    else { assert.strictEqual(pt, 'CONDITION ' + lvl.toUpperCase() + ' · ' + n, 'the count on the pill'); assert.ok(n > 0); }
    assert.ok(await p.$eval('#condSlot', s => { const r = s.getBoundingClientRect(), t = document.getElementById('title').getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - (t.top + t.bottom) / 2) < 40; }), tag + 'beside the date');
    if (n) { await p.click('#condPill'); assert.ok(await p.$('.rb-alerts.flash'), tag + 'a tap brings what needs you to the eye'); }

    // ---- the ribbon
    assert.ok(/^(FREE|NOW|[A-Z]+) /.test(await txt(p, '.rb-ribbon .ov-now')), tag + 'the readout');
    assert.strictEqual(await p.locator('.rb-ribbon .ov-ticks span').count(), 8, tag + '07 to 21');
    const blocks = await p.locator('.rb-band .ov-blk').count(), named = await p.locator('.rb-band .ov-blk .rb-bl').count();
    assert.ok(blocks > 0 && named === blocks, tag + 'every block carries its name: ' + named + ' of ' + blocks);
    const din = await txt(p, '.rb-pin.pin-dinner');
    assert.ok(/DINNER Sample tacos$/.test(din), tag + 'tonight\'s dinner pinned: ' + din);
    const left = await p.$eval('.rb-pin.pin-dinner', e => e.style.left);
    assert.strictEqual(left, '78.57%', tag + 'at 18:00');
    await p.click('.rb-add'); await p.waitForSelector('#capScrim:not([hidden])');
    assert.ok(await p.isVisible('#capForm'), tag + '+ opens CAPTURE');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);

    // ---- three columns, one card style
    const cards = await p.$$eval('.rb-cols > .rb-card', cs => cs.map(c => { const r = c.getBoundingClientRect(), s = getComputedStyle(c); return { x: Math.round(r.left), y: Math.round(r.top), h2: c.querySelector('.phead h2').textContent, bg: s.backgroundColor, rad: s.borderRadius }; }));
    assert.deepStrictEqual(cards.map(c => c.h2), ['ORDERS OF THE DAY', 'BODY + HOME', 'COMMS'], tag + 'the columns, in order');
    assert.ok(cards.every(c => c.bg === cards[0].bg && c.rad === cards[0].rad), tag + 'one card style');
    const rib = await p.$eval('.rb-ribbon', e => getComputedStyle(e).backgroundColor);
    assert.strictEqual(rib, cards[0].bg, tag + 'the ribbon too');
    if (w > 860) assert.ok(cards[0].y === cards[1].y && cards[1].y === cards[2].y && cards[0].x < cards[1].x && cards[1].x < cards[2].x, tag + 'side by side: ' + JSON.stringify(cards));
    else assert.ok(cards[0].x === cards[1].x && cards[1].x === cards[2].x && cards[0].y < cards[1].y && cards[1].y < cards[2].y, tag + 'stacked in the same order: ' + JSON.stringify(cards));
    assert.ok(await p.$$eval('.rb-cols > .rb-card', (cs, wide) => { const g = wide ? cs[1].getBoundingClientRect().left - cs[0].getBoundingClientRect().right : cs[1].getBoundingClientRect().top - cs[0].getBoundingClientRect().bottom; return Math.round(g) === 12; }, w > 860), tag + '12 px apart');
    // ORDERS: priorities and the intent; BODY + HOME: habits, tonight, weather
    assert.ok(await p.$('[data-panel="prio"] #logIntent'), tag + 'the intent in ORDERS');
    assert.ok(await p.$('[data-panel="home"] [data-panel="habits"] .hb-chip') && await p.$('[data-panel="home"] .ml-line') && await p.$('[data-panel="home"] [data-panel="env"]'), tag + 'habits, tonight and the weather in BODY + HOME');
    // COMMS: always in the same order; a row with nothing to say is dimmed, not dropped
    const labels = await p.$$eval('.rb-comms .rb-row b', bs => bs.map(x => x.textContent.replace(/ · \d+$/, '')));
    console.log(tag + 'COMMS:', labels.join(' | '));
    assert.deepStrictEqual(labels, ORDER.filter(l => labels.includes(l)), tag + 'in the fixed order');
    assert.ok(labels.includes('INBOX') && labels.includes('BEARING') && labels.includes('KEY DATE'), labels.join());
    assert.ok(/^INBOX · 4 /.test(await txt(p, '.rb-comms .ib-line')), tag + 'the inbox count');
    const b1 = await txt(p, '.rb-comms .ov-bearing span'); await p.click('.rb-comms .ov-bearing'); await p.waitForTimeout(200);
    assert.notStrictEqual(await txt(p, '.rb-comms .ov-bearing span'), b1, tag + 'BEARING rotates on a tap');

    // ---- the page: no sideways scroll; a redraw leaves it where it was
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'no sideways scroll');
    const pos = () => p.evaluate(() => ({ y: Math.round(scrollY), c: document.getElementById('content').scrollTop }));
    await p.evaluate(() => { window.scrollTo(0, 300); document.getElementById('content').scrollTop = 300; });
    await p.waitForTimeout(100);
    const before = await pos();
    assert.ok(before.y + before.c > 100, tag + 'scrolled: ' + JSON.stringify(before));
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(600);   /* back to the app: the Bridge redraws */
    assert.deepStrictEqual(await pos(), before, tag + 'the redraw keeps the page where it was');
    await p.screenshot({ path: D + 'bridge-ribbon-' + (w > 860 ? 'landscape' : 'portrait') + '.png', fullPage: true });

    // ---- the dinner pin opens MEALS; leaving the Bridge hides the pill
    await p.click('.rb-pin.pin-dinner'); await p.waitForTimeout(600);
    assert.strictEqual(await p.textContent('#title'), 'MEALS');
    assert.ok(await p.isHidden('#condSlot'), tag + 'the pill is the Bridge\'s');
    await ctx.close();
  }
  await b.close();
  await fetch(B + '&action=mealmode&cap=0&reset=1'); await fetch(B + '&action=inboxmode&cap=0');
  console.log('errors', errs);
  console.log('ok app_e2e78');
})().catch(e => { console.error(e); process.exit(1); });
