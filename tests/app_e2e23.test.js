// Time Loom (2.6.0): the LOOM screen under LOG. An infinity loop with the focused day at the crossing:
// swipe right (or the right arrow) moves forward, TODAY glides back, the side list shows the focused
// day's events and key dates, a tap on today's bead opens its details, and moving a fortnight on
// fetches the events around the new day. Runs against the simulated bridge 1.10 (invented data).
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64);
const conn = port => JSON.stringify({ url: 'http://127.0.0.1:' + port + '/macros/s/test/exec', key: K });
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
// where the loom draws a day d away from the focus (the same sums as the app)
function place(d, W, H) {
  const u = Math.PI / 2 - d / 24 * Math.PI * 2, s2 = Math.sin(u) ** 2, A = Math.min(W * .47, H * .78);
  const x = A * Math.cos(u) / (1 + s2), y = A * Math.sin(u) * Math.cos(u) / (1 + s2);
  return { x: W / 2 + x, y: H * .5 - y * 1.5 };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-07T20:14:00-05:00'));   // a Wednesday
  await p.goto('http://localhost:8080/');
  await p.evaluate(c => { localStorage.clear(); localStorage.setItem('tos.conn.v1', c); localStorage.setItem('tos.start.v1', '"today"'); }, conn(8101));
  await p.reload(); await p.waitForTimeout(1500);

  // LOOM is in the bar by default (2.7 pins)
  const navs = await p.$$eval('#pins .nav', bs => bs.map(x => x.textContent.trim()));
  assert.ok(navs.includes('LOOM') && navs.indexOf('LOOM') < navs.indexOf('LOG'), 'LOOM is pinned by default');
  await p.click('[data-screen="loom"].nav'); await p.waitForTimeout(1800);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT');
  assert.ok((await p.textContent('#eyebrow')).startsWith('TIME LOOM · TODAY'));
  assert.ok(await p.isVisible('#todayBtn') && await p.isVisible('#nextBtn'), 'TODAY and the arrows stay');
  let focus = await txt(p, '#lmFocus');
  console.log('today:', focus);
  assert.ok(focus.includes('Standup') && focus.includes('Roadmap review'));
  assert.ok((await txt(p, '#lmAhead')).includes('First frost risk'), 'key dates ahead');
  const inked = await p.evaluate(() => { const c = document.getElementById('lmCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  assert.ok(inked > 5000, 'the loom is drawn (' + inked + ' pixels)');
  // the side panel fits beside the loom and the page doesn't scroll sideways
  const box = await p.locator('#lmStage').boundingBox();
  assert.ok(box.width > 500 && box.height > 420, 'stage ' + box.width + 'x' + box.height);
  await p.screenshot({ path: D + 'e2e23_loom.png' });

  // right arrow: one day forward (an all-day event and a key date window)
  await p.focus('#lmStage'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1300);
  assert.strictEqual(await p.textContent('#title'), 'THU 08 OCT');
  assert.ok((await p.textContent('#eyebrow')).includes('TOMORROW'));
  focus = await txt(p, '#lmFocus');
  assert.ok(focus.includes('Vendor call') && focus.includes('Garlic planting window') && focus.includes('ALL DAY'), focus);

  // the arrows step a day
  await p.click('#nextBtn'); await p.waitForTimeout(1300);
  assert.strictEqual(await p.textContent('#title'), 'FRI 09 OCT');
  await p.click('#prevBtn'); await p.click('#prevBtn'); await p.waitForTimeout(1300);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT');
  // swipe right: forward in time
  await p.click('#todayBtn'); await p.waitForTimeout(1300);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT');
  const cx = box.x + box.width / 2, cy = box.y + box.height * .8;
  await p.mouse.move(cx - 180, cy); await p.mouse.down(); await p.mouse.move(cx + 180, cy, { steps: 14 }); await p.waitForTimeout(150); await p.mouse.up();
  await p.waitForTimeout(2500);
  let eb = await p.textContent('#eyebrow');
  console.log('after swipe right:', eb);
  assert.ok(/IN \d+ DAYS|TOMORROW/.test(eb), 'swipe right moves forward');
  // swipe left: back in time
  await p.mouse.move(cx + 200, cy); await p.mouse.down(); await p.mouse.move(cx - 200, cy, { steps: 14 }); await p.waitForTimeout(150); await p.mouse.up();
  await p.mouse.move(cx + 200, cy); await p.mouse.down(); await p.mouse.move(cx - 200, cy, { steps: 14 }); await p.waitForTimeout(150); await p.mouse.up();
  await p.waitForTimeout(2500);
  eb = await p.textContent('#eyebrow');
  console.log('after swipes left:', eb);
  assert.ok(/DAYS AGO|YESTERDAY/.test(eb), 'swipe left moves back');

  // TODAY glides home; a tap on one of today's beads opens it; a tap on a coming day glides to it
  await p.click('#todayBtn'); await p.waitForTimeout(1500);
  const U = Math.max(.75, Math.min(1.3, Math.min(box.width, box.height * 1.4) / 640));
  // 2.8.1: beads read top to bottom in time order, so the one on the loop is the day's last event
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 26 * U);
  await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#detailScrim'), 'bead opens the event');
  assert.ok((await txt(p, '#detailSheet')).includes('Roadmap review'), 'nearest the loop: the latest event');
  await p.click('#detailClose'); await p.waitForTimeout(300);
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 48 * U);
  await p.waitForTimeout(400);
  assert.ok((await txt(p, '#detailSheet')).includes('Standup'), 'highest: the earliest event');
  await p.click('#detailClose'); await p.waitForTimeout(300);
  const two = place(2, box.width, box.height);
  await p.mouse.click(box.x + two.x, box.y + two.y); await p.waitForTimeout(1500);
  assert.strictEqual(await p.textContent('#title'), 'FRI 09 OCT', 'tap glides to the day');
  // the side list opens details too
  await p.click('#lmFocus [data-id]'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#detailScrim'));
  await p.click('#detailClose'); await p.waitForTimeout(300);

  // four weeks on: the events around the new day are fetched
  await p.focus('#lmStage');
  for (let i = 0; i < 4; i++) { await p.keyboard.press('PageDown'); await p.waitForTimeout(250); }
  await p.waitForTimeout(3000);
  assert.strictEqual(await p.textContent('#title'), 'FRI 06 NOV');
  focus = await txt(p, '#lmFocus');
  console.log('four weeks on:', focus);
  assert.ok(focus.includes('Standup'), 'events fetched for the new fortnight');

  // leave and come back: rebuilt, gliding into today
  await p.click('[data-screen="week"].nav'); await p.waitForTimeout(600);
  await p.click('[data-screen="loom"].nav'); await p.waitForTimeout(1800);
  assert.strictEqual(await p.textContent('#title'), 'WED 07 OCT');
  assert.strictEqual(await p.getAttribute('[data-screen="loom"].nav', 'aria-current'), 'page');

  // the left panel still fits on a smaller iPad, with SYSTEMS at the foot
  await p.setViewportSize({ width: 1133, height: 744 }); await p.waitForTimeout(500);
  const st = await p.locator('#status').boundingBox();
  assert.ok(st.y + st.height <= 744 + 1 && st.height >= 69, 'status ' + JSON.stringify(st));

  // phone width: loom above the list, no sideways scroll
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(600);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 400), 'no sideways scroll');
  const pb = await p.locator('#lmStage').boundingBox();
  assert.ok(pb.height >= 440 && pb.width <= 400, 'phone stage ' + JSON.stringify(pb));
  await p.screenshot({ path: D + 'e2e23_phone.png' });

  console.log('errors', errs);
  await b.close();
})();
