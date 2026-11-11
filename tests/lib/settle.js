// Waiting for the app to settle, in place of fixed waits (D76, 2026-11-11).
//
// The browser tests used to pause for a fixed time after a click or a reload (761 waits, 623 s, 43% of all test time),
// sized for the slowest case. settled(page, ms) proceeds as soon as nothing more can happen within those ms, and never
// waits longer than the fixed wait it replaces: a test can only get faster, and a step that relied on the full wait
// shows up as a failure, not a slower run.
//
// Nothing more can happen when, for QUIET_MS in a row: no request is in flight (fetch or XMLHttpRequest); no timer set
// by the app is due before the old wait would have ended (a timer due later couldn't have been seen by the fixed wait
// either); no video or audio is playing; and the page's DOM hasn't changed. Intervals and animation frames never end,
// so they don't count. CSS animations don't count either: the app restarts its entry animations on every redraw, and a
// frozen page clock freezes them, so they'd hold nearly every wait open; a step that needs one finished waits for it
// by name (page.waitForFunction on getAnimations, or the element's final state).
//
// What it can't see: a step that measures time passing by the clock alone (holding a button down, "after 3 seconds",
// standby): those stay fixed waits (page.waitForTimeout). The converter leaves every wait between mouse.down() and
// mouse.up() alone; anything else of that kind shows up as a failing step and goes back to a fixed wait, with a comment.
//
// quiet(ctxOrPage) installs the watch before the page's own script runs; call it right after newContext (or newPage).
// A page without it falls back to the plain fixed wait. Only timers set from the app's own files (js/…) count:
// Playwright's fake clock (setFixedTime) schedules its own ticks through setTimeout too. Times are read from a real
// clock captured before any fake clock is installed, and the quiet period is timed in Node, so a frozen page clock
// can't stall a wait.
const QUIET_MS = 100;

function watch(opts) {
  if (window.__settle) return;
  const now = performance.now.bind(performance);   // the real clock, captured before a fake one can replace it
  const S = window.__settle = { req: 0, due: new Map(), seq: 0 };
  const touch = () => { S.seq++; };
  const ofetch = window.fetch;
  if (ofetch) window.fetch = function () { S.req++; touch(); const done = (x) => { S.req--; touch(); return x; }; return ofetch.apply(this, arguments).then(done, (e) => { done(); throw e; }); };
  const XS = window.XMLHttpRequest && window.XMLHttpRequest.prototype.send;
  if (XS) window.XMLHttpRequest.prototype.send = function () { S.req++; touch(); this.addEventListener('loadend', () => { S.req--; touch(); }, { once: true }); return XS.apply(this, arguments); };
  const ost = window.setTimeout, oct = window.clearTimeout;
  window.setTimeout = function (fn, ms) {
    // Set directly by the app's own files (js/…). Under Playwright's fake clock the app's timers arrive here relayed by
    // the clock, which re-arms them in small steps without end: those aren't counted, and such a page settles on its
    // requests and its DOM alone.
    const mine = /\/js\/[^\s):]+\.js/.test((new Error().stack || '').split('\n')[2] || '');
    let id;
    const run = typeof fn === 'function' ? function () { S.due.delete(id); touch(); return fn.apply(this, arguments); } : fn;
    id = ost.apply(this, [run].concat([].slice.call(arguments, 1)));
    if (mine) { S.due.set(id, now() + (Number(ms) || 0)); if (opts.debug) (S.site = S.site || {})[id] = ms + ' ' + ((new Error().stack || '').split('\n')[2] || '').trim().slice(0, 100); }
    return id;
  };
  window.clearTimeout = function (id) { S.due.delete(id); return oct.apply(this, arguments); };
  const mo = new MutationObserver(touch);
  const go = () => mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) go(); else document.addEventListener('readystatechange', go, { once: true });
  // -1 when something can still happen within the next `within` ms; otherwise the activity count (the caller checks it holds still)
  S.state = (within) => {
    const why = (r) => { if (opts.debug) S.why = r; return -1; };
    if (S.req) return why('request');
    const by = now() + within;
    const late = now() - 50;
    for (const [id, t] of S.due) if (t < late) S.due.delete(id);   // overdue and never seen to run: cleared or run past this watch (a fake clock)
    for (const [id, t] of S.due) if (t <= by) return why('timer ' + ((S.site || {})[id] || ''));
    for (const m of document.querySelectorAll('video, audio')) if (!m.paused && !m.ended) return why('media playing');
    return S.seq;
  };
}

async function quiet(target) { await target.addInitScript(watch, { debug: !!process.env.SETTLE_DEBUG }); }

async function settled(page, max = 1000) {
  const t0 = Date.now(), end = t0 + max;
  let seen = null, since = 0;
  while (Date.now() < end) {
    let st;
    // A page navigating mid-check (a reload the app starts itself) throws here: treat it as busy and look again.
    try { st = await page.evaluate((w) => (window.__settle ? window.__settle.state(w) : null), end - Date.now()); } catch (e) { st = -1; }
    if (st === null) return page.waitForTimeout(Math.max(0, end - Date.now()));   // no watch on this page: the old fixed wait
    if (st >= 0 && st === seen) { if (Date.now() - since >= QUIET_MS) return; }
    else { seen = st; since = Date.now(); }
    await new Promise(r => setTimeout(r, 20));
  }
  // Not quiet within the old fixed wait: carry on exactly as the fixed wait did.
  if (process.env.SETTLE_DEBUG) { let w = ''; try { w = await page.evaluate(() => window.__settle && window.__settle.why); } catch (e) { w = 'navigating'; } console.log('settled: busy for all ' + max + ' ms: ' + w); }
}

module.exports = { quiet, settled, QUIET_MS };
