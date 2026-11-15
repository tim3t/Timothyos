// Rules from elsewhere reaching into a station (B2, 2026-11-15).
//
// The app's stylesheet is one file and every class in it is global. Three times a station has used a class name that
// another part of the app had already styled, and the other rule reached in: RESSIKAN's playing bar took TODAY's
// `.now` (absolutely placed, white labels) and jumped out of the loop (2.82.2). Prefixes (rs-, hd-, sk-, …) prevent it,
// but nothing checked them, and the older screens own plenty of short global names (.ev, .kd, .today, .hour).
//
// reachIns(page, id) asks the page itself: for every selector in the loaded stylesheets, skipping those that belong to
// this station (they name its root or one of its own classes or prefixes) and the shared kit (every class in them is a
// shared piece: buttons, chips, pills, section heads, the Overview's ov- cards, the calendar colours a-…), does it match
// anything inside the station as drawn now? Each one that does is a rule from elsewhere reaching in, and is returned
// with the classes of the first element it hits. A station test calls it at its fullest state; app_e2e92 walks them all.
//
// STATIONS: the station's root selector (inside #content) and what is its own: a string ending in "-" is a prefix,
// any other a class it owns. The time screens predate prefixes, so their own short names are listed one by one; a
// newer station owns its prefix only. `borrows` names another station's piece it shows on purpose (BRIDGE shows
// HABITS' chips, REVIEW its HABITS PER WEEK chart).
const SHARED = [
  // the kit every screen uses
  'btn', 'btnrow', 'ghost', 'sm', 'kv', 'sheet', 'sbar', 'sbody', 'sfoot', 'chip', 'chips', 'pill', 'phead', 'meta', 'cap', 'rule', 'muted', 'tnum', 'empty', 'stubbox',
  'warn', 'bad', 'ok', 'busy', 'saved', 'done', 'on', 'off', 'sel', 'active', 'hidden', 'open', 'go', 'dot', 'spin', 'errtxt', 'warntxt', 'okmsg',
  // calendar colours and the Overview's cards (BRIDGE, REVIEW, LEDGER, TAROT share them)
  'a-', 'b-', 'ov-',
  // button kinds
  'plan', 'ask', 'capture',
  // the frame around every screen (its entry animations on #content)
  'enter', 'grow-in',
];

const STATIONS = {
  bridge: { root: '.rb', own: ['rb-', 'clash', 'dim', 'red', 'ic', 'st', 'tx', 'pin-due', 'tick'], borrows: ['hb-'] },
  today: { root: '.bridge', own: ['bridge', 'tl', 'tlpanel', 'tlwrap', 'ev', 'hour', 'now', 'quietband', 'quiet', 'rcol', 'arow', 'arows', 'kd', 'dt', 'tt', 'st', 'soon', 'past', 'tall', 'tm', 'lbl', 't', 'nm', 'ct', 'sw', 'prio'] },
  week: { root: '.wkpanel', own: ['wk', 'wk-', 'wkpanel', 'wka', 'wkb', 'wkads', 'wkband', 'wkbody', 'wkcol', 'wkgut', 'wkh', 'wkhead', 'wkline', 'wknow', 'wkscroll', 'wkspan', 'one', 'past', 'tall', 'tm', 'lbl', 'quiet', 'today'] },
  month: { root: '.mo', own: ['mo', 'moc', 'moh', 'mo-', 'li', 'kdli', 'more', 'n', 'out', 'dots', 'top1', 'today'] },
  loom: { root: '.lm', own: ['lm-', 'kd', 'dt', 'tt', 'st', 'soon'] },
  dates: { root: '.kdscreen', own: ['kdscreen', 'kdtools', 'dgroup', 'kd', 'dt', 'tt', 'st', 'soon'] },
  inbox: { root: '.ib', own: ['ib-'], borrows: ['prop'] },   // ASK's proposal card
  review: { root: '.rv', own: ['rv-', 'rl-', 'rlw', 'tri', 'track', 'bn'], borrows: ['hb-'] },   // HABITS PER WEEK
  log: { root: '.cl', own: ['cl-'] },
  habits: { root: '.hb', own: ['hb-'] },
  tarot: { root: '.tr', own: ['tr-'] },
  astrometrics: { root: '.as', own: ['as-'] },
  ressikan: { root: '.rs', own: ['rs-'] },
  ledger: { root: '.lg', own: ['lg-', 'tri', 'track', 'bn'] },
  library: { root: '.lb', own: ['lb-'] },
  holodeck: { root: '.hd-arch, .hd', own: ['hd', 'hd-'] },   // the arch, or on air
  engineering: { root: '.eng', own: ['eng-', 'up-', 'scn-', 'ec-', 'hc', 'hc-', 'hm', 'hm-', 'hp-', 'hg-', 'hr-', 'hseg'] },   // its Home Assistant pieces predate eng-
  apiary: { root: '.ap', own: ['ap-'] },
  science: { root: '.sci', own: ['sci-', 'sat-'] },
  sickbay: { root: '.sk', own: ['sk-'] },
  meals: { root: '.ml', own: ['ml-'] },
  arboretum: { root: '.arb', own: ['arb-'] },
};

async function reachIns(page, id) {
  const st = STATIONS[id]; if (!st) throw new Error('classguard: no station ' + id);
  const rootCls = st.root.split(',')[0].trim().slice(1);
  return page.evaluate(({ rootSel, root, own, borrows, shared }) => {
    const box = document.getElementById('content'), el = (box && box.querySelector(rootSel)) || document.querySelector(rootSel);
    if (!el) return ['(no ' + rootSel + ' on screen)'];
    const mine = c => c === root || own.some(o => o.endsWith('-') ? c.startsWith(o) : c === o) || borrows.some(o => o.endsWith('-') ? c.startsWith(o) : c === o);
    const kit = c => shared.some(o => o.endsWith('-') ? c.startsWith(o) : c === o);
    const sels = [];
    const walk = rules => { for (const r of rules) { if (r.selectorText) sels.push(r.selectorText); else if (r.cssRules) walk(r.cssRules); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* another origin */ } }
    const out = [], seen = new Set();
    for (const list of sels) for (let sel of list.split(',')) {
      sel = sel.replace(/::?[a-z-]+(\((?:[^()]|\([^()]*\))*\))?/gi, '').trim();   // states and pseudo-elements: what's left is what it reaches
      if (!sel || seen.has(sel)) continue; seen.add(sel);
      const cls = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).map(x => x.slice(1));
      const kitRule = sel.split(/\s*[\s>+~]\s*/).every(part => { const pc = (part.match(/\.[A-Za-z0-9_-]+/g) || []).map(x => x.slice(1)); return !pc.length || pc.some(kit); });   // a kit piece in a state (.ov-blk.past) is the kit's
      if (!cls.length || cls.some(mine) || kitRule) continue;
      let hit = null; try { hit = el.matches(sel) ? el : el.querySelector(sel); } catch (e) { continue; }
      if (hit) out.push(sel + ' → ' + (hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : hit.className));
    }
    return out;
  }, { rootSel: st.root, root: rootCls, own: st.own, borrows: st.borrows || [], shared: SHARED });
}

module.exports = { reachIns, STATIONS, SHARED };
