// A wait that times out says what it saw (B3, 2026-11-15).
//
// The HOLODECK test (e56) failed about one full run in four with nothing but "Timeout 60000ms exceeded" to go on; one
// line reporting the screen's state found the cause from a single failure. This makes that the rule for every browser
// test, with no change to the tests themselves: run.sh loads this file into every test (NODE_OPTIONS --require), and it
// wraps each Playwright call that waits (page.waitForSelector, click, locator.waitFor, …). When one throws a
// TimeoutError, the first line of its message gains " · saw: " and what the page showed at that moment: the screen's
// eyebrow, the status, any toast or open sheet, the start of the content, the newest error-log line. Nothing else
// changes: the same error, the same call log, the same test result.
//
// The tests' own polling helper is here too: until(fn, ms) retries fn until it returns something truthy, and when it
// gives up, its "timed out waiting" carries the same report for every open page (and `what`, naming what it waited for).
//   const until = require('./lib/explain').until(10000, 150);   // default ms and poll interval for this test
//   await until(async () => …, 20000, 'the RECOVERED row');
// A test that knows better what to report (e56's HOLODECK state) adds it with saw(page, async () => '…').
//
// Run a single test with the same reports:  node -r ./lib/explain.js app_e2e56.test.js   (from tests/)
// It never reads or prints a key: the snapshot is DOM text from the test's own invented data, cut to about 400 characters.

const pages = new Set(), extra = new WeakMap();
const WAITS = ['waitForSelector', 'waitForFunction', 'waitForEvent', 'waitForURL', 'waitForResponse', 'waitForRequest', 'waitForLoadState',
  'click', 'dblclick', 'tap', 'fill', 'press', 'type', 'hover', 'check', 'uncheck', 'selectOption', 'setInputFiles', 'focus', 'dispatchEvent',
  'textContent', 'innerText', 'innerHTML', 'getAttribute', 'inputValue', 'waitFor', 'goto', 'reload'];

/* What the page shows, in one line. Runs in the page; nothing here may throw. */
function snapshotInPage() {
  const t = s => { const e = document.querySelector(s); return e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
  const vis = s => [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
  const out = [];
  const eb = t('#eyebrow'); if (eb) out.push('screen ' + eb);
  const st = t('#status'); if (st) out.push('status ' + st);
  const toast = vis('.toast, #toast').map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)[0]; if (toast) out.push('toast "' + toast.slice(0, 80) + '"');
  const sheet = vis('.sheet, [role="dialog"]').map(e => { const h = e.querySelector('h1,h2,h3,.sh-title,.title'); return (h ? h.innerText : e.innerText).replace(/\s+/g, ' ').trim(); }).filter(Boolean)[0];
  if (sheet) out.push('sheet "' + sheet.slice(0, 60) + '"');
  const busy = document.querySelectorAll('[aria-busy="true"], [disabled]').length; if (busy) out.push(busy + ' busy or disabled');
  const c = t('#content') || t('body'); if (c) out.push('content "' + c.slice(0, 220) + (c.length > 220 ? '…' : '') + '"');
  try { const l = JSON.parse(localStorage.getItem('tos.errlog.v1') || '[]').pop(); if (l) out.push('last error ' + l.s + ' ' + l.a + ': ' + l.m); } catch (e) { /* none */ }
  return out.join(' | ') || '(empty page)';
}

async function describe(page) {
  if (!page || page.isClosed()) return 'page closed';
  const timeout = new Promise(r => setTimeout(() => r('(the page did not answer)'), 1500));
  const s = await Promise.race([page.evaluate(snapshotInPage).catch(e => '(could not look: ' + String(e.message || e).split('\n')[0] + ')'), timeout]);
  const more = extra.get(page);
  if (!more) return s;
  const m = await Promise.race([more().catch(e => '(' + String(e.message || e).split('\n')[0] + ')'), timeout]);
  return s + ' | ' + m;
}
async function describeAll() {
  const open = [...pages].filter(p => !p.isClosed());
  if (!open.length) return 'no page open';
  const parts = await Promise.all(open.map(describe));
  return parts.length === 1 ? parts[0] : parts.map((s, i) => 'page ' + (i + 1) + ': ' + s).join(' || ');
}

/* Put the report in the error's first line (and its stack), where run.sh's FAIL output and the CI log show it. */
function annotate(err, seen) {
  if (!err || err.__saw) return err;
  const msg = String(err.message || ''), first = msg.split('\n')[0], line = first + ' · saw: ' + seen;
  try { err.message = msg.replace(first, line); if (err.stack) err.stack = err.stack.replace(first, line); err.__saw = true; } catch (e) { /* frozen error */ }
  return err;
}

/* SYSTEMS shows one group at a time (2.86, C1). A test that reaches for something in a group not shown taps that
   group's tab first, as a person would: before a call that names a selector, if it matches something inside a hidden
   SYSTEMS section (each carries data-sysg, its group), the tab is clicked. The index itself, its lights and its
   jumps are tested directly by app_e2e94; this only saves every other test from knowing which tab holds what. */
const SEL_CALLS = new Set(['waitForSelector', 'click', 'dblclick', 'tap', 'fill', 'press', 'type', 'hover', 'check', 'uncheck', 'selectOption', 'setInputFiles', 'focus', 'dispatchEvent',
  'textContent', 'innerText', 'innerHTML', 'getAttribute', 'inputValue', 'waitFor']);
let rawFind = null, rawWait = null;
/* actions that need the element on screen: before one, wait (in the same slices) for it to show, then act once */
const ACTIONS = new Set(['click', 'dblclick', 'tap', 'fill', 'press', 'type', 'hover', 'check', 'uncheck', 'selectOption', 'focus']);
const OPT_AT = { page: { fill: 2, press: 2, type: 2, selectOption: 2 }, loc: { fill: 1, press: 1, type: 1, selectOption: 1 } };
async function sysVisible(pg, sel, lim) {
  const t0 = Date.now();
  for (;;) {
    await sysTab(pg, sel);
    const left = lim ? lim - (Date.now() - t0) : 1000;
    try { await rawWait.call(pg, sel, { state: 'visible', timeout: Math.max(1, Math.min(1000, left)) }); return; } catch (e) { if (!(e && e.name === 'TimeoutError') || (lim && Date.now() - t0 >= lim)) return; }
  }
}
async function sysTab(page, sel) {
  if (!rawFind || !page || typeof sel !== 'string' || page.isClosed()) return;
  let h = null;
  try { h = await rawFind.call(page, sel); } catch (e) { return; }
  if (!h) return;
  try { await h.evaluate(el => { const sec = el.closest('#content .sys > section[hidden]'); const t = sec && sec.dataset.sysg && document.querySelector('.sys-tab[data-sysg="' + sec.dataset.sysg + '"]'); if (t) t.click(); }); } catch (e) { /* gone meanwhile */ }
  try { await h.dispose(); } catch (e) { /* gone */ }
}

function wrap(proto, pageOf, selOf) {
  for (const name of WAITS) {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__explained) continue;
    const fn = async function (...args) {
      let slices = null;
      if (selOf && SEL_CALLS.has(name)) {
        let pg = null, sel = null; try { pg = pageOf(this); sel = selOf(this, args); } catch (e) { /* none */ }
        if (pg && sel) {
          const isWait = name === 'waitForSelector' || name === 'waitFor', oi = name === 'waitFor' ? 0 : 1, o = (args[oi] && typeof args[oi] === 'object') ? args[oi] : {};
          if (isWait && (!o.state || o.state === 'visible')) slices = { pg, sel, oi, o, t0: Date.now(), lim: o.timeout != null ? o.timeout : 30000 };
          else if (ACTIONS.has(name)) {
            const ai = (OPT_AT[pageOf(this) === this ? 'page' : 'loc'][name]) != null ? OPT_AT[pageOf(this) === this ? 'page' : 'loc'][name] : (pageOf(this) === this ? 1 : 0);
            const ao = (args[ai] && typeof args[ai] === 'object') ? args[ai] : {};
            if (ao.force) await sysTab(pg, sel);
            else {
              const t0 = Date.now(), lim = ao.timeout != null ? ao.timeout : 30000;
              await sysVisible(pg, sel, lim);
              if (lim) { args = args.slice(); args[ai] = Object.assign({}, ao, { timeout: Math.max(1, lim - (Date.now() - t0)) }); }
            }
          } else await sysTab(pg, sel);
        }
      }
      try {
        if (!slices) return await orig.apply(this, args);
        /* a wait for something to show: in slices of a second, each after tapping its SYSTEMS tab if it's in a hidden
           group (it may be drawn a moment later, or SYSTEMS drawn again on STATUS), until the test's own limit */
        for (;;) {
          await sysTab(slices.pg, slices.sel);
          const left = slices.lim ? slices.lim - (Date.now() - slices.t0) : 1000, a = args.slice();
          a[slices.oi] = Object.assign({}, slices.o, { timeout: Math.max(1, Math.min(1000, left)) });
          try { return await orig.apply(this, a); } catch (e) { if (!(e && e.name === 'TimeoutError') || (slices.lim && Date.now() - slices.t0 >= slices.lim)) throw e; }
        }
      } catch (err) {
        if (err && err.name === 'TimeoutError') { let pg = null; try { pg = pageOf(this); } catch (e) { /* none */ } annotate(err, pg ? await describe(pg) : await describeAll()); }
        throw err;
      }
    };
    fn.__explained = true;
    proto[name] = fn;
  }
}

let patchedPage = false;
function track(page) {
  if (!page || pages.has(page)) return page;
  pages.add(page); page.on('close', () => pages.delete(page));
  if (!patchedPage) {
    patchedPage = true;
    rawFind = Object.getPrototypeOf(page).$; rawWait = Object.getPrototypeOf(page).waitForSelector;   // before wrapping
    wrap(Object.getPrototypeOf(page), pg => pg, (pg, args) => (typeof args[0] === 'string' ? args[0] : null));   // SEL_CALLS all take the selector first
    wrap(Object.getPrototypeOf(page.locator('body')), loc => loc.page(), loc => loc._selector || null);
    wrap(Object.getPrototypeOf(page.keyboard), () => null);
  }
  return page;
}
function trackContext(ctx) {
  if (!ctx || ctx.__explained) return ctx;
  ctx.__explained = true;
  ctx.pages().forEach(track);
  ctx.on('page', track);
  return ctx;
}

function install(pw) {
  if (!pw || pw.__explained) return pw;
  pw.__explained = true;
  for (const kind of ['chromium', 'firefox', 'webkit']) {
    const bt = pw[kind]; if (!bt) continue;
    const launch = bt.launch.bind(bt), persistent = bt.launchPersistentContext && bt.launchPersistentContext.bind(bt);
    bt.launch = async (...a) => {
      const b = await launch(...a), nc = b.newContext.bind(b), np = b.newPage.bind(b);
      b.newContext = async (...o) => trackContext(await nc(...o));
      b.newPage = async (...o) => { const pg = await np(...o); trackContext(pg.context()); return track(pg); };
      return b;
    };
    if (persistent) bt.launchPersistentContext = async (...a) => trackContext(await persistent(...a));
  }
  return pw;
}

/* until(defaultMs, everyMs) → a polling helper whose timeout says what every open page showed.
   tolerant: a check that throws counts as "not yet" (for a page mid-reload). */
function until(defMs = 10000, every = 150, tolerant = false) {
  return async (fn, ms = defMs, what = '') => {
    const t = Date.now();
    for (;;) {
      const v = tolerant ? await fn().catch(() => null) : await fn();
      if (v) return v;
      if (Date.now() - t > ms) throw new Error('timed out waiting' + (what ? ' for ' + what : '') + ' · saw: ' + await describeAll());
      await new Promise(r => setTimeout(r, every));
    }
  };
}
/* A test's own extra report for a page, added after the general one. */
function saw(page, fn) { extra.set(page, fn); }

// Installed on load: the first require('playwright') anywhere gets the wrapped launchers.
try { install(require('playwright')); } catch (e) { /* not a browser test (no Playwright here): nothing to do */ }

module.exports = { until, saw, describe, describeAll, install };
