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

function wrap(proto, pageOf) {
  for (const name of WAITS) {
    const orig = proto[name];
    if (typeof orig !== 'function' || orig.__explained) continue;
    const fn = async function (...args) {
      try { return await orig.apply(this, args); } catch (err) {
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
    wrap(Object.getPrototypeOf(page), pg => pg);
    wrap(Object.getPrototypeOf(page.locator('body')), loc => loc.page());
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
