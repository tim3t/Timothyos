  /* ---------- Tarot (2.26, bridge 1.24): readings, this week's card, meanings, spreads ---------- */
  /* Notion 🔮 Tarot holds everything (Kind: Reading, Meaning, Spread). The app keeps a copy of the last
     13 weeks on the iPad for offline reading; writes wait in tos.tarotq.v1 until the bridge has them.
     Ask sees readings only when SHARE WITH ASK is on (tos.aitarot.v1). Cards are drawn as type and suit
     marks, no deck artwork. Class names all start tr- (2.25.1: never borrow another screen's class). */
  var LS_TAROT = "tos.tarot.v1", LS_TAROTQ = "tos.tarotq.v1", LS_AITAROT = "tos.aitarot.v1", LS_TAROTDRAFT = "tos.tarotdraft.v1";
  var TR_MAJ = ["The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor", "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit", "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance", "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World"];
  var TR_MAJ_KW = [["beginnings, leap of faith", "hesitation, recklessness"], ["skill, will, resources", "scattered focus"], ["intuition, stillness", "ignoring the inner voice"], ["growth, care, abundance", "neglect, smothering"], ["structure, authority", "rigidity, control"], ["tradition, teaching", "breaking convention"], ["union, values, choice", "misalignment"], ["drive, direction", "lost bearings"], ["courage, gentle power", "self-doubt"], ["solitude, reflection", "isolation"], ["cycles, turning point", "resisting change"], ["fairness, truth", "imbalance"], ["pause, new angle", "stalling"], ["endings, transition", "clinging"], ["balance, patience", "excess"], ["attachment, habit", "release"], ["upheaval, revelation", "averted crisis"], ["hope, renewal", "discouragement"], ["uncertainty, dreams", "clarity returning"], ["joy, vitality", "clouded joy"], ["reckoning, calling", "self-judgement"], ["completion, wholeness", "loose ends"]];
  var TR_RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
  var TR_RANK_KW = ["a new start", "choice, balance", "growth, collaboration", "stability, rest", "struggle, loss", "harmony, moving on", "a test, assessment", "momentum, practice", "nearly there", "completion, weight", "curiosity, news", "action, pursuit", "mastery within", "mastery shown"];
  var TR_SUITS = { W: { id: "wands", nm: "Wands", theme: "drive, creativity" }, C: { id: "cups", nm: "Cups", theme: "feeling, relationships" }, S: { id: "swords", nm: "Swords", theme: "thought, conflict" }, P: { id: "pent", nm: "Pentacles", theme: "work, money, body" } };
  var TR_DECK = TR_MAJ.map(function (_, i) { return "M" + i; });
  "WCSP".split("").forEach(function (s) { for (var r = 1; r <= 14; r++) TR_DECK.push(s + r); });
  var TR_TABS = [["major", "MAJOR"], ["wands", "WANDS"], ["cups", "CUPS"], ["swords", "SWORDS"], ["pent", "PENTACLES"]];
  /* Card faces (2.27): each Major Arcana card has its own mark; Minor Arcana show their count as pips
     (Two to Ten), one large mark for the Ace, and a small sign above the mark for the courts (Page a star,
     Knight a chevron, Queen a three-point crown, King a five-point crown). All drawn here, nothing stored. */
  var TR_F = 'fill="currentColor" stroke="none"', TR_INF = '<path d="M20 10c-3-4-10-4-10 0s7 4 10 0 10-4 10 0-7 4-10 0z"/>';
  var TR_MAJOR_ART = [
    /* 0 The Fool: the flower in his hand */ '<circle cx="20" cy="7.5" r="3.8" ' + TR_F + '/><circle cx="25.2" cy="11.3" r="3.8" ' + TR_F + '/><circle cx="23.2" cy="17.4" r="3.8" ' + TR_F + '/><circle cx="16.8" cy="17.4" r="3.8" ' + TR_F + '/><circle cx="14.8" cy="11.3" r="3.8" ' + TR_F + '/><circle cx="20" cy="13" r="2.4" stroke="none" style="fill:var(--tr-face)"/><path d="M20 21v15"/><path d="M20 30c-5 0-8-3-8-6 5 0 8 3 8 6z" ' + TR_F + "/>",
    /* I The Magician */ TR_INF + '<path d="M20 18v18"/><path d="M16 22h8M16 33h8"/>',
    /* II The High Priestess */ '<path d="M8 6v29M32 6v29M5 6h6M29 6h6M5 35h6M29 35h6"/><path d="M24 13a8 8 0 1 0 0 14a6 6 0 1 1 0-14z" ' + TR_F + "/>",
    /* III The Empress */ '<circle cx="20" cy="14" r="8"/><path d="M20 22v14M13 30h14"/>',
    /* IV The Emperor */ '<path d="M7 29V14l7 6 6-10 6 10 7-6v15z"/><path d="M7 34h26"/>',
    /* V The Hierophant */ '<circle cx="10" cy="30" r="4"/><path d="M13 27L31 9M27 13l3 3M24 16l3 3"/><circle cx="30" cy="30" r="4"/><path d="M27 27L9 9M13 13l-3 3M16 16l-3 3"/>',
    /* VI The Lovers */ '<circle cx="15" cy="24" r="8"/><circle cx="25" cy="24" r="8"/><path d="M20 4l1.6 3.4 3.4 1.6-3.4 1.6L20 14l-1.6-3.4L15 9l3.4-1.6z" ' + TR_F + "/>",
    /* VII The Chariot */ '<path d="M6 12h28"/><path d="M10 12v4M30 12v4"/><path d="M9 17h22v8H9z"/><circle cx="13" cy="31" r="4"/><circle cx="27" cy="31" r="4"/>',
    /* VIII Strength */ TR_INF + '<path d="M20 36c-7-5-11-9-11-13a5 5 0 0 1 11-2 5 5 0 0 1 11 2c0 4-4 8-11 13z"/>',
    /* IX The Hermit */ '<path d="M20 3v4M15 7h10l2 4H13z"/><path d="M13 11h14v18H13z"/><path d="M20 15l1.3 3h3l-2.4 2 1 3-2.9-1.8-2.9 1.8 1-3-2.4-2h3z" ' + TR_F + '/><path d="M15 29l-1 4h12l-1-4"/>',
    /* X Wheel of Fortune */ '<circle cx="20" cy="20" r="15"/><circle cx="20" cy="20" r="4"/><path d="M20 5v11M20 24v11M5 20h11M24 20h11M9.4 9.4l7.8 7.8M22.8 22.8l7.8 7.8M30.6 9.4l-7.8 7.8M17.2 22.8l-7.8 7.8"/>',
    /* XI Justice */ '<path d="M20 5v29M13 35h14M8 10h24"/><path d="M8 10l-5 11h10zM32 10l-5 11h10z"/><path d="M3 21a5 3 0 0 0 10 0M27 21a5 3 0 0 0 10 0"/>',
    /* XII The Hanged Man */ '<path d="M7 5h26M20 5v6"/><path d="M20 11v13"/><path d="M20 15l6 4-6 3"/><path d="M14 19l6 3 6-3"/><circle cx="20" cy="29" r="4"/>',
    /* XIII Death */ '<path d="M11 36L27 5"/><path d="M27 5c-9-3-18 2-21 11 7-6 14-7 21-5"/>',
    /* XIV Temperance */ '<path d="M5 9h10l-2 8H7z"/><path d="M25 25h10l-2 8h-6z"/><path d="M13 13c6 0 13 4 15 12" stroke-dasharray="2 3"/>',
    /* XV The Devil */ '<rect x="4" y="15" width="14" height="9" rx="4.5" transform="rotate(-30 11 19.5)"/><rect x="13" y="16" width="14" height="9" rx="4.5" transform="rotate(30 20 20.5)"/><rect x="22" y="15" width="14" height="9" rx="4.5" transform="rotate(-30 29 19.5)"/>',
    /* XVI The Tower */ '<path d="M12 36V14h16v22"/><path d="M11 14V9h4v3h3V9h4v3h3V9h4v5"/><path d="M18 36v-6h4v6"/><path d="M33 2l-6 9h5l-6 9" stroke-width="2"/>',
    /* XVII The Star */ '<path d="M20 6l3 9 9-3-6 8 6 8-9-3-3 9-3-9-9 3 6-8-6-8 9 3z" ' + TR_F + '/><circle cx="6" cy="6" r="1.6" ' + TR_F + '/><circle cx="34" cy="6" r="1.6" ' + TR_F + '/><circle cx="34" cy="35" r="1.6" ' + TR_F + '/><circle cx="6" cy="35" r="1.6" ' + TR_F + "/>",
    /* XVIII The Moon */ '<path d="M24 5a13 13 0 1 0 0 24a10 10 0 1 1 0-24z" ' + TR_F + '/><path d="M13 33v2M20 33v4M27 33v2"/>',
    /* XIX The Sun */ '<circle cx="20" cy="20" r="6" ' + TR_F + '/><path d="M20 3v8M20 29v8M3 20h8M29 20h8M8 8l5.5 5.5M26.5 26.5L32 32M32 8l-5.5 5.5M13.5 26.5L8 32"/>',
    /* XX Judgement */ '<path d="M6 30l20-20"/><path d="M24 6l10 10-4 2-8-8z"/><path d="M10 26l4 4"/><path d="M13 23l5 2-2 5"/>',
    /* XXI The World */ '<path d="M18 35C10 33 6 27 6 20S9 8 14 4M22 35c8-2 12-8 12-15S31 8 26 4"/><path d="M7 27l-4 1M6 20l-4-1M8 13l-3-3M11 8l-1-4M33 27l4 1M34 20l4-1M32 13l3-3M29 8l1-4"/><path d="M15 38l5-4 5 4"/>'
  ];
  /* The suit marks, 40 x 40, with the line width as a parameter so pips stay crisp when drawn small. */
  function trSuitArt(s, sw) {
    var g = function (inner) { return '<g stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" fill="none">' + inner + "</g>"; };
    if (s === "wands") return g('<path d="M14 36L27 4"/><path d="M22 15c4-1 7 1 8 4M19 22c-4-1-7 1-8 4"/>');
    if (s === "cups") return '<path d="M9 6h22c0 10-4 15-11 15S9 16 9 6z" fill="currentColor"/>' + g('<path d="M20 21v10M12 34h16"/>');
    if (s === "swords") return g('<path d="M20 3v25M12 27h16M20 28v8"/>') + '<path d="M20 3l3 5h-6z" fill="currentColor"/>';
    return '<circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="' + sw * 0.87 + '"/><path d="M20 8l3.4 10.4H34l-8.6 6.3 3.3 10.3L20 28.6 11.3 35l3.3-10.3L6 18.4h10.6z" fill="currentColor"/>';
  }
  /* pip centres in a 40 x 60 box, playing-card style */
  var TR_PIPS = { 2: [[20, 12], [20, 48]], 3: [[20, 10], [20, 30], [20, 50]], 4: [[11, 12], [29, 12], [11, 48], [29, 48]], 5: [[11, 12], [29, 12], [20, 30], [11, 48], [29, 48]],
    6: [[11, 12], [29, 12], [11, 30], [29, 30], [11, 48], [29, 48]], 7: [[11, 12], [29, 12], [20, 21], [11, 30], [29, 30], [11, 48], [29, 48]],
    8: [[11, 10], [29, 10], [20, 20], [11, 30], [29, 30], [20, 40], [11, 50], [29, 50]], 9: [[11, 9], [29, 9], [11, 23], [29, 23], [20, 30], [11, 37], [29, 37], [11, 51], [29, 51]],
    10: [[11, 8], [29, 8], [20, 15], [11, 23], [29, 23], [11, 37], [29, 37], [20, 45], [11, 52], [29, 52]] };
  var TR_COURT = { 11: '<path d="M20 2l1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.3 3.3-.5z" fill="currentColor"/>', 12: '<path d="M13 9l7-6 7 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    13: '<path d="M12 11V4l4 4 4-5 4 5 4-4v7z" fill="currentColor"/>', 14: '<path d="M10 11V3l3 4 3-5 4 4 4-4 3 5 3-4v8z" fill="currentColor"/>' };
  function trArt(id) {
    var s = trSuit(id), n = +id.slice(1);
    if (id[0] === "M") return '<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none">' + TR_MAJOR_ART[n] + "</g></svg>";
    if (n === 1) return '<svg viewBox="0 0 40 40" aria-hidden="true">' + trSuitArt(s, 3) + "</svg>";
    if (n <= 10) {
      var k = n >= 9 ? 0.26 : 0.3;
      return '<svg class="pips" viewBox="0 0 40 60" aria-hidden="true">' + TR_PIPS[n].map(function (p) { return '<g class="pip" transform="translate(' + p[0] + " " + p[1] + ") scale(" + k + ') translate(-20 -20)">' + trSuitArt(s, 5.5) + "</g>"; }).join("") + "</svg>";
    }
    return '<svg class="court" viewBox="0 0 40 46" aria-hidden="true">' + TR_COURT[n] + '<g transform="translate(0 10)">' + trSuitArt(s, 3) + "</g></svg>";
  }
  /* Spreads: x, y in card units; c = crossing. */
  var TR_SPREADS = [
    { id: "one", nm: "ONE CARD", why: "A single pull", pos: [{ l: "THE CARD", x: 0, y: 0 }] },
    { id: "ppf", nm: "PAST · PRESENT · FUTURE", why: "Three in a row", pos: [{ l: "PAST", x: 0, y: 0 }, { l: "PRESENT", x: 1, y: 0 }, { l: "FUTURE", x: 2, y: 0 }] },
    { id: "sao", nm: "SITUATION · ACTION · OUTCOME", why: "Three in a row", pos: [{ l: "SITUATION", x: 0, y: 0 }, { l: "ACTION", x: 1, y: 0 }, { l: "OUTCOME", x: 2, y: 0 }] },
    { id: "five", nm: "FIVE-CARD CROSS", why: "Centre and four around", pos: [{ l: "PRESENT", x: 1, y: 1 }, { l: "PAST", x: 0, y: 1 }, { l: "FUTURE", x: 2, y: 1 }, { l: "WHAT HELPS", x: 1, y: 0 }, { l: "WHAT HINDERS", x: 1, y: 2 }] },
    { id: "horse", nm: "HORSESHOE", why: "Seven in an arc", pos: [{ l: "PAST", x: 0, y: 0 }, { l: "PRESENT", x: 1, y: 0.55 }, { l: "HIDDEN", x: 2, y: 1 }, { l: "OBSTACLE", x: 3, y: 1.15 }, { l: "OTHERS", x: 4, y: 1 }, { l: "ADVICE", x: 5, y: 0.55 }, { l: "OUTCOME", x: 6, y: 0 }] },
    { id: "celtic", nm: "CELTIC CROSS", why: "Ten cards, the full picture", pos: [{ l: "PRESENT", x: 1, y: 1.5 }, { l: "CHALLENGE", x: 1, y: 1.5, c: 1 }, { l: "FOUNDATION", x: 1, y: 2.5 }, { l: "RECENT PAST", x: 0, y: 1.5 }, { l: "BEST OUTCOME", x: 1, y: 0.5 }, { l: "NEAR FUTURE", x: 2, y: 1.5 }, { l: "SELF", x: 3.4, y: 3 }, { l: "SURROUNDINGS", x: 3.4, y: 2 }, { l: "HOPES AND FEARS", x: 3.4, y: 1 }, { l: "OUTCOME", x: 3.4, y: 0 }] },
    { id: "free", nm: "FREE", why: "Any number, in a row", free: true, pos: [] }
  ];
  var tr = { data: lsGet(LS_TAROT), q: lsGet(LS_TAROTQ) || {}, err: null, inflight: false, flushing: false, view: "home", open: null, draft: lsGet(LS_TAROTDRAFT), bld: null, pickTab: "major", pickRev: false, hist: null, arm: null, armAt: 0, timers: {}, sheet: null, dirty: {}, alias: {}, uk: {}, mdirty: {}, mtimers: {} };
  function canTarot() { return state.caps.indexOf("tarot") > -1; }
  function trName(id) { return id[0] === "M" ? TR_MAJ[+id.slice(1)] : TR_RANKS[+id.slice(1) - 1] + " of " + TR_SUITS[id[0]].nm; }
  function trSuit(id) { return id[0] === "M" ? "major" : TR_SUITS[id[0]].id; }
  function trRoman(n) { if (!n) return "0"; var v = [10, 9, 5, 4, 1], r = ["X", "IX", "V", "IV", "I"], o = ""; v.forEach(function (x, i) { while (n >= x) { o += r[i]; n -= x; } }); return o; }
  function trNum(id) { if (id[0] === "M") return trRoman(+id.slice(1)); var r = +id.slice(1); return r === 1 ? "ACE" : r <= 10 ? trRoman(r) : TR_RANKS[r - 1].toUpperCase(); }
  function trKw(id, rev) { if (id[0] === "M") return TR_MAJ_KW[+id.slice(1)][rev ? 1 : 0]; var k = TR_RANK_KW[+id.slice(1) - 1] + " · " + TR_SUITS[id[0]].theme; return rev ? "blocked or inward: " + k : k; }
  function trCard(id, rev, extra) {
    var s = trSuit(id);
    return '<span class="tr-card tr-' + s + (rev ? " rev" : "") + (extra ? " " + extra : "") + '" role="img" aria-label="' + esc(trName(id)) + (rev ? ", reversed" : "") + '"><span class="num">' + trNum(id) + '</span><span class="art">' + trArt(id) + '</span><span class="nm">' + esc(trName(id)) + "</span>" + (rev ? '<span class="rv">R</span>' : "") + "</span>";
  }
  function trErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Tarot database with the bridge yet. In Notion open 🔮 Tarot → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge (steps in the README under Updating the Google bridge).";
    return describe(err);
  }

  /* --- data --- */
  function trFrom() { return ymd(addDays(sow(new Date()), -91)); }
  function loadTarot(force) {
    if (!state.conn || !canTarot() || tr.inflight) return;
    if (!force && tr.data && Date.now() - tr.data.fetched < 120000) return;
    if (!force && tr.err && Date.now() - tr.err.at < FRESH_MS) return;
    tr.inflight = true;
    api({ action: "tarot", from: trFrom(), to: ymd(addDays(new Date(), 1)) }).then(function (j) {
      var mean = {};
      (j.meanings || []).forEach(function (m) { mean[m.card] = m.text; });
      tr.data = { fetched: Date.now(), readings: j.readings || [], meanings: mean, spreads: j.spreads || [] };
      tr.err = null; lsSet(LS_TAROT, tr.data);
      flushTarot();
    }).catch(function (err) { tr.err = { at: Date.now(), msg: trErrText(err) }; })
      .then(function () { tr.inflight = false; if (["tarot", "bridge", "review"].indexOf(state.screen) > -1) render(true); });
  }
  /* Everything waiting to reach Notion, sent one after another. A failure stays queued (shown as NOT SAVED YET). */
  function trQueue(key, item) { tr.q[key] = item; lsSet(LS_TAROTQ, tr.q); flushTarot(); }
  function flushTarot() {
    if (tr.flushing || !state.conn || !canTarot()) return;
    var keys = Object.keys(tr.q); if (!keys.length) return;
    var k = keys[0], it = tr.q[k];
    tr.flushing = true;
    apiPost(it.body).then(function (j) {
      if (tr.q[k] === it) delete tr.q[k];
      lsSet(LS_TAROTQ, tr.q);
      trApplySaved(it, j);
      tr.flushing = false; tr.qErr = null; it.tries = 0;
      if (Object.keys(tr.q).length) flushTarot(); else { tr.data && (tr.data.fetched = 0); loadTarot(true); }
    }).catch(function (err) {
      tr.flushing = false;
      /* the bridge busy with another request (its lock), or Google slow to answer: not a failure yet, try again shortly */
      if (err && (err.code === "busy" || err.name === "AbortError") && (it.tries = (it.tries || 0) + 1) <= 6) { setTimeout(flushTarot, 4000 * it.tries); return; }
      tr.qErr = { at: Date.now(), msg: trErrText(err) };
      if (["tarot", "bridge"].indexOf(state.screen) > -1) render(true);
    });
  }
  function trApplySaved(it, j) {
    if (!tr.data) return;
    if (j.reading) {
      var rs = tr.data.readings.filter(function (r) { return r.id !== j.reading.id && r.id !== "cid:" + (it.body.reading && it.body.reading.cid); });
      rs.unshift(j.reading); tr.data.readings = rs;
      /* later edits queued against the temporary id now point at the real page */
      Object.keys(tr.q).forEach(function (k2) { var b = tr.q[k2].body; if (b.reading && b.reading.cid === it.body.reading.cid && !b.reading.id) { b.reading.id = j.reading.id; delete b.reading.cid; } });
      var tmp = "cid:" + (it.body.reading && it.body.reading.cid);
      if (it.body.reading && it.body.reading.cid && tmp !== j.reading.id) {
        tr.alias[tmp] = j.reading.id; tr.uk[j.reading.id] = it.body.reading.cid;
        if (tr.dirty[tmp]) { tr.dirty[j.reading.id] = Object.assign({}, tr.dirty[tmp], tr.dirty[j.reading.id]); delete tr.dirty[tmp]; }
      }
      if (tr.open === tmp) tr.open = j.reading.id;
      lsSet(LS_TAROTQ, tr.q);
    }
    if (j.spread) tr.data.spreads = tr.data.spreads.filter(function (s) { return s.id !== j.spread.id && s.id !== it.tmp; }).concat([j.spread]);
    lsSet(LS_TAROT, tr.data);
  }
  setInterval(function () { if (Object.keys(tr.q).length && !tr.flushing && navigator.onLine !== false) flushTarot(); }, 30000);
  function trReadings() {
    var rs = ((tr.data && tr.data.readings) || []).slice();
    Object.keys(tr.q).forEach(function (k) {   /* not in Notion yet: shown from the queue */
      var b = tr.q[k].body; if (b.action !== "tarotsave") return;
      var r = b.reading, id = r.id || "cid:" + r.cid, i = rs.map(function (x) { return x.id; }).indexOf(id), pend = Object.assign({}, r, { id: id, pending: true });
      if (i > -1) rs[i] = Object.assign({}, rs[i], pend); else rs.unshift(pend);
    });
    rs = rs.map(function (r) { var dk = tr.dirty[r.id]; return dk ? Object.assign({}, r, dk) : r; });
    return rs.sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : 0; });
  }
  function trMeaning(card) { if (tr.mdirty[card] != null) return tr.mdirty[card]; var m = tr.data && tr.data.meanings && tr.data.meanings[card]; var qd = tr.q["m:" + card]; return qd ? qd.body.text : m || ""; }
  function trMeanNow(card) { clearTimeout(tr.mtimers[card]); delete tr.mtimers[card]; var text = tr.mdirty[card]; delete tr.mdirty[card]; if (text != null) trQueue("m:" + card, { body: { action: "tarotmeaning", card: card, text: text } }); }
  function trMySpreads() { return ((tr.data && tr.data.spreads) || []).map(function (s) { return { id: s.id, nm: s.title, why: "My spread", mine: true, pos: s.pos }; }); }
  function trFreePos(n) { var o = []; for (var i = 0; i < n; i++) o.push({ l: "CARD " + (i + 1), x: i % 6, y: Math.floor(i / 6) }); return o; }
  function trSpread(id, n) {
    var s = TR_SPREADS.concat(trMySpreads()).filter(function (x) { return x.id === id; })[0] || TR_SPREADS[1];
    return s.free ? Object.assign({}, s, { pos: trFreePos(n || 3) }) : s;
  }
  function trWeekly(w0) {
    var a = ymd(w0), b = ymd(addDays(w0, 6));
    return trReadings().filter(function (r) { return r.weekly && r.day >= a && r.day <= b; })[0] || null;
  }
  function trOpen() { var id = trId(tr.open); return trReadings().filter(function (r) { return r.id === id; })[0] || null; }
  function trSaveReading(r) {
    var body = { cid: r.id && r.id.indexOf("cid:") === 0 ? r.id.slice(4) : undefined, id: r.id && r.id.indexOf("cid:") !== 0 ? r.id : undefined, day: r.day, spread: r.spread, sname: r.sname, q: r.q || "", pos: r.pos, cards: r.cards, notes: r.notes || [], sum: r.sum || "", weekly: !!r.weekly };
    trQueue("r:" + (body.id || "cid:" + body.cid), { body: { action: "tarotsave", reading: body } });
  }
  /* Typing in a note or the reading: saved 1.2 s after the last key, or at once when you leave the app.
     Until then the words live in tr.dirty, drawn over every other copy (Notion's, a save still on its way),
     so a reload or a save landing mid-sentence can't take back what you typed (2.29.1). A brand-new
     reading's temporary id (cid:…) is followed to its Notion id when its first save lands (tr.alias). */
  function trId(id) { while (tr.alias[id]) id = tr.alias[id]; return id; }
  function trUk(id) { return String(tr.uk[id] || id).replace(/^cid:/, "").replace(/[^\w-]/g, ""); }
  function trEdit(r, patch) {
    var key = trId(r.id);
    Object.assign(r, patch);
    tr.dirty[key] = Object.assign(tr.dirty[key] || {}, patch);
    clearTimeout(tr.timers[key]);
    tr.timers[key] = setTimeout(function () { trSaveNow(key); }, 1200);
  }
  function trSaveNow(key) {
    key = trId(key); clearTimeout(tr.timers[key]); delete tr.timers[key];
    Object.keys(tr.timers).forEach(function (k) { if (trId(k) === key) { clearTimeout(tr.timers[k]); delete tr.timers[k]; } });
    var r = trReadings().filter(function (x) { return x.id === key; })[0];
    delete tr.dirty[key];
    if (r) trSaveReading(r);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) { Object.keys(tr.timers).forEach(trSaveNow); Object.keys(tr.mtimers).forEach(trMeanNow); } });

  /* --- the board: a spread laid out --- */
  var TR_CW = 1, TR_CH = 5 / 3, TR_GX = 0.16, TR_GY = 0.14;
  function trBoard(sp, cards, opts) {
    opts = opts || {};
    var pos = sp.pos, mx = 0, my = 0;
    pos.forEach(function (p) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); });
    var bw = (mx + 1) * (TR_CW + TR_GX) - TR_GX, bh = (my + 1) * (TR_CH + TR_GY) - TR_GY, max = Math.min(opts.max || 760, (mx + 1) * (opts.cardPx || 130));
    var h = '<div class="tr-board" style="max-width:' + max + "px; aspect-ratio:" + bw.toFixed(3) + " / " + bh.toFixed(3) + '">';
    pos.forEach(function (p, i) {
      var c = cards[i], next = !c && opts.edit && cards.slice(0, i).every(Boolean);
      h += '<button type="button" class="tr-slot' + (p.c ? " cross" : "") + '" style="left:' + (p.x * (TR_CW + TR_GX) / bw * 100) + "%;top:" + (p.y * (TR_CH + TR_GY) / bh * 100) + "%;width:" + (TR_CW / bw * 100) + "%;height:" + (TR_CH / bh * 100) + '%" data-trslot="' + i + '" aria-label="' + esc((i + 1) + ". " + p.l + (c ? ": " + trName(c.id) + (c.rev ? ", reversed" : "") : ": empty")) + '">' +
        '<span class="pos">' + (i + 1) + "</span>" + (c ? trCard(c.id, c.rev, opts.flip === i ? "flip" : "") : '<span class="tr-card empty' + (next ? " next" : "") + '"><span class="lab">' + esc(p.l) + "</span></span>") + "</button>";
    });
    return h + "</div>";
  }
  function trMini(sp) {
    var pos = sp.free ? trFreePos(4) : sp.pos, mx = 0, my = 0;
    pos.forEach(function (p) { mx = Math.max(mx, p.x); my = Math.max(my, p.y); });
    var k = Math.min(140 / ((mx + 1) * 1.2), 54 / ((my + 1) * 1.8));
    return '<span class="tr-mini" aria-hidden="true">' + pos.map(function (p) {
      var w = k, hh = k * 1.6;
      return '<i class="' + (p.c ? "x" : "") + '" style="left:' + (p.x * 1.2 * k) + "px;top:" + (p.y * 1.8 * k) + "px;width:" + (p.c ? hh : w) + "px;height:" + (p.c ? w : hh) + "px;" + (p.c ? "margin:" + (hh - w) / 2 + "px 0 0 " + -(hh - w) / 2 + "px" : "") + '"></i>';
    }).join("") + "</span>";
  }

  /* --- the screen --- */
  function trHead() {
    var w0 = sow(new Date());
    return { e: tr.view === "new" ? "TAROT · NEW READING" : tr.view === "reading" && trOpen() ? "TAROT · " + dLabel(parseYmd(trOpen().day)) : tr.view === "builder" ? "TAROT · MY SPREADS" : weekLabel(w0).replace(/^WEEK/, "TAROT · WEEK"), t: "TAROT" };
  }
  function renderTarot() {
    loadTarot(false);
    if (!canTarot()) { $("content").innerHTML = '<div class="tr">' + phead("TAROT", "SETUP") + stubBox(state.conn ? "Needs the 🔮 Tarot database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Connect Notion</b>." : "Link calendars first.") + "</div>"; return; }
    if (!tr.data) { $("content").innerHTML = '<div class="tr">' + phead("TAROT", "") + '<div class="empty">' + (tr.err ? esc(tr.err.msg) : "Loading your readings from Notion…") + "</div></div>"; return; }
    if (tr.view === "reading" && !trOpen()) tr.view = "home";
    var html = '<div class="tr">' + (tr.qErr && Object.keys(tr.q).length ? '<div class="err">' + Object.keys(tr.q).length + " change" + (Object.keys(tr.q).length === 1 ? "" : "s") + " not in Notion yet: " + esc(tr.qErr.msg) + ' <button type="button" class="chip sm" data-trretry="1">RETRY</button></div>' : "");
    html += tr.view === "new" ? trNewHtml() : tr.view === "reading" ? trReadingHtml() : tr.view === "builder" ? trBuilderHtml() : trHomeHtml();
    $("content").innerHTML = html + "</div>";
  }
  function trTools() {
    return '<div class="tr-tools"><span></span><div class="btnrow"><button type="button" class="btn sm ghost" data-trgo="builder">MY SPREADS</button><button type="button" class="btn sm" data-trgo="new">+ NEW READING</button></div></div>';
  }
  function trHomeHtml() {
    var w0 = sow(new Date()), wk = trWeekly(w0), today = ymd(new Date());
    var html = trTools() + '<div class="tr-cols"><div class="tr-col">';
    html += phead("THIS WEEK'S CARD", wk ? "PULLED " + dLabel(parseYmd(wk.day)) : weekLabel(w0).replace(/^WEEK \d+ · /, ""), "chrome-a");
    if (wk) {
      var c = wk.cards[0], mine = trMeaning(c.id);
      html += '<div class="tr-week"><button type="button" class="tr-big" data-trhist="' + c.id + '" aria-label="Every time ' + esc(trName(c.id)) + ' came up">' + trCard(c.id, c.rev) + '</button><div class="tx"><span class="ov-sub">' + esc(weekLabel(w0)) + "</span><h3>" + esc(trName(c.id).toUpperCase()) + (c.rev ? " · REVERSED" : "") + '</h3><span class="kw">' + esc(trKw(c.id, c.rev)) + "</span>" +
        (mine ? '<p><span class="muted">Mine:</span> ' + esc(mine) + "</p>" : "") +
        '<label class="ov-sub" for="trWkSum">WHAT IT MEANS THIS WEEK</label><textarea id="trWkSum" data-trsum="' + esc(wk.id) + '" rows="3" placeholder="A line or two for the week…">' + esc(wk.sum || "") + "</textarea>" + (wk.pending ? '<small class="muted">Not in Notion yet. It will go when the bridge answers.</small>' : "") + "</div></div>";
    } else html += '<div class="tr-week none"><span class="tr-card back" aria-hidden="true"></span><div class="tx"><h3>NO CARD YET</h3><p class="muted">Draw your card for ' + esc(weekLabel(w0).replace(/^WEEK \d+ · /, "").toLowerCase()) + ' and record it here.</p><div class="btnrow"><button type="button" class="btn" data-trgo="weekly">RECORD THIS WEEK\'S CARD</button></div></div></div>';
    var recent = trReadings().filter(function (r) { return r.day >= ymd(addDays(new Date(), -13)) && r.day <= today && !r.weekly; });   /* week's cards live in the strip */
    html += phead("READINGS", recent.length ? recent.length + " IN 14 DAYS" : "", "chrome-c") + '<div class="tr-list">' + (recent.length ? recent.map(trRowHtml).join("") : '<div class="empty">No readings in the last two weeks. <b>+ NEW READING</b> records one.</div>') + "</div>";
    var older = trReadings().filter(function (r) { return r.day < ymd(addDays(new Date(), -13)) && !r.weekly; });
    if (older.length) html += '<details class="tr-older"><summary>EARLIER · ' + older.length + "</summary><div class=\"tr-list\">" + older.map(trRowHtml).join("") + "</div></details>";
    html += '</div><div class="tr-col">' + trPatternsHtml() + "</div></div>";
    return html;
  }
  function trRowHtml(r) {
    var sp = trSpread(r.spread, r.cards.length);
    return '<button type="button" class="tr-row" data-tropen="' + esc(r.id) + '"><span class="t"><b>' + esc(r.q || (r.weekly ? "Card for the week" : "Open reading")) + "</b><small>" + esc(dLabel(parseYmd(r.day)) + " · " + (r.sname || sp.nm) + " · " + r.cards.length + (r.cards.length === 1 ? " CARD" : " CARDS")) + (r.pending ? " · NOT IN NOTION YET" : "") + '</small></span><span class="th">' +
      r.cards.slice(0, 5).map(function (c) { return trCard(c.id, c.rev); }).join("") + (r.cards.length > 5 ? '<span class="more">+' + (r.cards.length - 5) + "</span>" : "") + "</span></button>";
  }
  function trPatternsHtml() {
    var from = ymd(addDays(new Date(), -90)), all = [], cnt = {}, rev = 0, by = { major: 0, wands: 0, cups: 0, swords: 0, pent: 0 };
    trReadings().forEach(function (r) { if (r.day >= from) r.cards.forEach(function (c) { all.push(c); }); });
    var html = phead("PATTERNS", "LAST 90 DAYS", "chrome-d") + '<div class="tr-pat">';
    if (!all.length) return html + '<div class="empty">Patterns appear once you\'ve recorded a few readings.</div></div>';
    all.forEach(function (c) { by[trSuit(c.id)]++; cnt[c.id] = (cnt[c.id] || 0) + 1; if (c.rev) rev++; });
    var mx = Math.max.apply(null, Object.keys(by).map(function (k) { return by[k]; })) || 1;
    var top = Object.keys(cnt).filter(function (k) { return cnt[k] > 1; }).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 3);
    html += '<div class="tr-facts"><span class="pill">' + all.length + ' CARDS DRAWN</span><span class="pill">' + Math.round(rev / all.length * 100) + '% REVERSED</span><span class="pill">' + by.major + " MAJOR ARCANA</span></div>";
    html += '<div class="tr-bars" role="list" aria-label="Cards by suit">' + TR_TABS.map(function (s) {
      return '<div class="tr-bar tr-' + s[0] + '" role="listitem"><span>' + s[1] + '</span><span class="tk"><i style="width:' + (by[s[0]] / mx * 100) + '%"></i></span><span class="n tnum">' + by[s[0]] + "</span></div>";
    }).join("") + "</div>";
    if (top.length) html += '<span class="ov-sub">KEEPS COMING BACK</span><div class="tr-rep">' + top.map(function (id) { return '<button type="button" data-trhist="' + id + '">' + trCard(id, false) + "<span>" + cnt[id] + " TIMES</span></button>"; }).join("") + "</div>";
    var strip = "";
    for (var i = 8; i >= 1; i--) {
      var w = addDays(sow(new Date()), -7 * i), r = trWeekly(w);
      strip += r ? '<button type="button" data-trhist="' + r.cards[0].id + '">' + trCard(r.cards[0].id, r.cards[0].rev) + "<span>WK " + isoWeek(w) + "</span></button>" : '<span class="gap"><span class="tr-card empty">—</span><span>WK ' + isoWeek(w) + "</span></span>";
    }
    return html + '<span class="ov-sub">WEEKLY CARDS · LAST 8 WEEKS</span><div class="tr-strip">' + strip + "</div></div>";
  }

  /* --- new reading --- */
  function trDraft() { if (!tr.draft) tr.draft = { spread: "ppf", n: 3, q: "", cards: [], weekly: false, sel: 0 }; return tr.draft; }
  function trDraftSave() { lsSet(LS_TAROTDRAFT, tr.draft); }
  function trNewHtml() {
    var d = trDraft(), sp = trSpread(d.spread, d.n), filled = d.cards.filter(Boolean).length;
    var html = phead("1 · THE SPREAD", "", "chrome-a") + '<div class="tr-spreads">' + TR_SPREADS.concat(trMySpreads()).map(function (s) {
      return '<button type="button" class="tr-sp' + (s.mine ? " mine" : "") + '" data-trspread="' + esc(s.id) + '" aria-pressed="' + (d.spread === s.id) + '">' + trMini(s) + "<b>" + esc(s.nm) + "</b><small>" + esc(s.free ? "Any number, in a row" : s.pos.length + (s.pos.length === 1 ? " card · " : " cards · ") + s.why) + "</small></button>";
    }).join("") + '<button type="button" class="tr-sp mine" data-trgo="builder"><span class="tr-mini" aria-hidden="true"></span><b>+ MY OWN</b><small>Place and name positions</small></button></div>';
    if (sp.free) html += '<div class="tr-step"><span class="ov-sub">CARDS</span><button type="button" class="btn sm ghost" data-trn="-1" aria-label="One fewer">−</button><b class="tnum">' + d.n + '</b><button type="button" class="btn sm ghost" data-trn="1" aria-label="One more">+</button></div>';
    html += phead("2 · THE QUESTION", "OPTIONAL", "chrome-c") + '<input type="text" id="trQ" maxlength="200" placeholder="What are you asking? Leave blank for an open reading." value="' + esc(d.q) + '" aria-label="Question">' +
      (sp.pos.length === 1 ? '<label class="tr-check"><input type="checkbox" id="trWk"' + (d.weekly ? " checked" : "") + "> THIS IS MY CARD FOR THE WEEK</label>" : "");
    html += phead("3 · THE CARDS", filled + " OF " + sp.pos.length, "chrome-b") + '<div class="tr-tools"><span class="muted">Tap a position, then pick the card you drew. Or let the iPad draw.</span><div class="btnrow"><button type="button" class="btn sm ghost" data-tract="clear"' + (filled ? "" : " disabled") + '>CLEAR</button><button type="button" class="btn sm ghost" data-tract="draw">DRAW HERE</button></div></div>';
    html += trBoard(sp, d.cards, { edit: true, flip: d.flip, cardPx: 140 });
    html += '<div class="tr-tools"><span></span><div class="btnrow"><button type="button" class="btn ghost" data-trgo="home">CANCEL</button><button type="button" class="btn" data-tract="save"' + (filled === sp.pos.length ? "" : " disabled") + ">SAVE READING</button></div></div>";
    return html;
  }

  /* --- one reading --- */
  function trReadingHtml() {
    var r = trOpen(), sp = { pos: r.pos && r.pos.length === r.cards.length ? r.pos : trSpread(r.spread, r.cards.length).pos }, armed = tr.arm === "del:" + r.id && Date.now() - tr.armAt < 4000;
    var html = '<div class="tr-tools"><button type="button" class="btn sm ghost" data-trgo="home">‹ TAROT</button><button type="button" class="btn sm ghost" data-trdel="' + esc(r.id) + '"' + (r.pending && r.id.indexOf("cid:") === 0 ? " disabled" : "") + ">" + (armed ? "TAP AGAIN TO DELETE" : "DELETE") + "</button></div>";
    html += '<div class="tr-cols"><div class="tr-col">' + phead(esc(r.sname || trSpread(r.spread, r.cards.length).nm), dLabel(parseYmd(r.day)) + (r.weekly ? " · THIS WEEK'S CARD" : ""), "chrome-a") +
      '<h3 class="tr-q">' + esc(r.q || (r.weekly ? "Card for the week" : "Open reading")) + "</h3>" + trBoard(sp, r.cards, { cardPx: sp.pos.length > 6 ? 110 : 150 }) +
      phead("WHAT IT SAYS", "YOUR READING", "chrome-c") + '<textarea id="trSum-' + trUk(r.id) + '" data-trsum="' + esc(r.id) + '" rows="4" placeholder="The reading as a whole…">' + esc(r.sum || "") + "</textarea>" + (r.pending ? '<small class="muted">Not in Notion yet. It will go when the bridge answers.</small>' : "") + trbBox("s") + "</div>";
    html += '<div class="tr-col">' + phead("POSITIONS", sp.pos.length + (sp.pos.length === 1 ? " CARD" : " CARDS"), "chrome-b") + '<div class="tr-pos">' + sp.pos.map(function (p, i) {
      var c = r.cards[i]; if (!c) return "";
      var mine = trMeaning(c.id);
      return '<div class="tr-pr tr-' + trSuit(c.id) + '">' + trCard(c.id, c.rev) + '<div class="who"><span class="ov-sub">' + (i + 1) + " · " + esc(p.l) + "</span><b>" + esc(trName(c.id).toUpperCase()) + (c.rev ? " · REVERSED" : "") + "</b><em>" + esc(trKw(c.id, c.rev)) + "</em>" + (mine ? '<small><span class="muted">Mine:</span> ' + esc(mine) + "</small>" : "") +
        '<textarea id="trNote-' + trUk(r.id) + "-" + i + '" data-trnote="' + i + '" data-trid="' + esc(r.id) + '" rows="2" aria-label="Your note for ' + esc(p.l) + '" placeholder="What it means here…">' + esc((r.notes || [])[i] || "") + "</textarea>" + trbBox("p:" + i) + "</div></div>";
    }).join("") + "</div></div></div>";
    return html;
  }

  /* --- my spreads --- */
  function trBuilderHtml() {
    var b = tr.bld || (tr.bld = { nm: "", pos: [] });
    var html = '<div class="tr-tools"><button type="button" class="btn sm ghost" data-trgo="home">‹ TAROT</button><span></span></div><div class="tr-cols"><div class="tr-col">' + phead("NEW SPREAD", "TAP TO PLACE", "chrome-a") +
      '<input type="text" id="trBName" maxlength="40" placeholder="Name, e.g. New moon" value="' + esc(b.nm) + '" aria-label="Spread name"><div class="tr-grid" role="grid" aria-label="Layout grid">';
    for (var y = 0; y < 4; y++) for (var x = 0; x < 6; x++) {
      var i = b.pos.map(function (p) { return p.x + "," + p.y; }).indexOf(x + "," + y);
      html += '<button type="button" class="tr-cell' + (i > -1 ? " on" + (b.pos[i].c ? " x" : "") : "") + '" data-trcell="' + x + "," + y + '" aria-label="Row ' + (y + 1) + ", column " + (x + 1) + (i > -1 ? ", position " + (i + 1) : ", empty") + '">' + (i > -1 ? i + 1 : "") + "</button>";
    }
    html += '</div><small class="muted">Positions are numbered in the order you place them. Tap a placed square again to remove it.</small></div><div class="tr-col">' + phead("POSITIONS", b.pos.length ? b.pos.length + (b.pos.length === 1 ? " CARD" : " CARDS") : "NONE YET", "chrome-b") + '<div class="tr-plist">' + (b.pos.length ? b.pos.map(function (p, ix) {
      return '<div class="tr-pl"><b>' + (ix + 1) + '</b><input type="text" id="trPL' + ix + '" maxlength="40" data-trplabel="' + ix + '" value="' + esc(p.l) + '" placeholder="What this position means" aria-label="Position ' + (ix + 1) + ' label"><button type="button" class="chip sm" data-trpcross="' + ix + '" aria-pressed="' + !!p.c + '">CROSSING</button></div>';
    }).join("") : '<span class="muted">Place a position on the grid to start.</span>') + "</div>";
    if (b.pos.length) html += phead("PREVIEW", "", "chrome-c") + trBoard({ pos: trNorm(b.pos) }, [], { edit: true, cardPx: 90 });
    html += '<div class="tr-tools"><span></span><button type="button" class="btn" data-tract="bsave"' + (b.pos.length && b.nm.trim() ? "" : " disabled") + ">SAVE SPREAD</button></div>";
    var mine = trMySpreads();
    html += phead("SAVED", mine.length ? String(mine.length) : "NONE YET", "chrome-d") + '<div class="tr-spreads">' + mine.map(function (s) {
      var armed = tr.arm === "sp:" + s.id && Date.now() - tr.armAt < 4000;
      return '<div class="tr-sp mine">' + trMini(s) + "<b>" + esc(s.nm) + "</b><small>" + esc(s.pos.map(function (p) { return p.l; }).join(" · ")) + '</small><button type="button" class="chip sm" data-trspdel="' + esc(s.id) + '">' + (armed ? "TAP AGAIN" : "REMOVE") + "</button></div>";
    }).join("") + "</div></div></div>";
    return html;
  }
  function trNorm(pos) {
    var mx = Math.min.apply(null, pos.map(function (p) { return p.x; })), my = Math.min.apply(null, pos.map(function (p) { return p.y; }));
    return pos.map(function (p, i) { return { l: (p.l || "CARD " + (i + 1)).trim().toUpperCase().slice(0, 40), x: p.x - mx, y: p.y - my, c: p.c ? 1 : 0 }; });
  }

  /* --- sheets: pick a card, a card's history --- */
  function trSheet(cls, html, c) {
    $("detailSheet").className = "sheet tr-sheet " + cls;
    $("detailSheet").style.setProperty("--c", "var(--" + (c || "chrome-a") + ")");
    $("detailSheet").innerHTML = html;
    if ($("detailScrim").hidden) showSheet("detailScrim");
  }
  function trPicker() {
    var d = trDraft(), sp = trSpread(d.spread, d.n), used = d.cards.filter(Boolean).map(function (c) { return c.id; });
    tr.sheet = "pick";
    trSheet("tr-picksheet", '<div class="sbar"><span>' + (d.sel + 1) + " · " + esc(sp.pos[d.sel].l) + '</span><span>PICK THE CARD YOU DREW</span></div><div class="sbody"><div class="tr-tools"><div class="chips">' +
      TR_TABS.map(function (t) { return '<button type="button" class="chip sm" data-trtab="' + t[0] + '" aria-pressed="' + (tr.pickTab === t[0]) + '">' + t[1] + "</button>"; }).join("") +
      '</div><label class="tr-check"><input type="checkbox" id="trRev"' + (tr.pickRev ? " checked" : "") + "> REVERSED</label></div>" +
      '<div class="tr-pick">' + TR_DECK.filter(function (id) { return trSuit(id) === tr.pickTab; }).map(function (id) { return '<button type="button" data-trpick="' + id + '"' + (used.indexOf(id) > -1 ? " disabled" : "") + ">" + trCard(id, tr.pickRev) + "</button>"; }).join("") + "</div></div>" +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>');
  }
  function trHistory(id) {
    tr.sheet = "hist"; tr.hist = id;
    var rows = [], from = ymd(addDays(new Date(), -90));
    trReadings().forEach(function (r) {
      var pos = r.pos && r.pos.length === r.cards.length ? r.pos : trSpread(r.spread, r.cards.length).pos;
      r.cards.forEach(function (c, i) { if (c.id === id) rows.push({ r: r, l: pos[i] ? pos[i].l : "", rev: c.rev, note: (r.notes || [])[i] || (r.weekly ? r.sum : "") }); });
    });
    var recent = rows.filter(function (x) { return x.r.day >= from; }), revN = recent.filter(function (x) { return x.rev; }).length;
    trSheet("tr-histsheet", '<div class="sbar"><span>' + esc(trName(id).toUpperCase()) + '</span><span>LAST 90 DAYS</span></div><div class="sbody"><div class="tr-hist">' + trCard(id, false) + '<div class="tx"><h3>' + esc(trName(id).toUpperCase()) + '</h3><span class="ov-sub">UPRIGHT</span><span>' + esc(trKw(id, false)) + '</span><span class="ov-sub">REVERSED</span><span>' + esc(trKw(id, true)) + "</span>" +
      '<div class="tr-facts"><span class="pill">' + recent.length + (recent.length === 1 ? " TIME" : " TIMES") + '</span><span class="pill">' + revN + ' REVERSED</span></div><label class="ov-sub" for="trMean">MY MEANING</label><textarea id="trMean" data-trmean="' + id + '" rows="3" maxlength="2000" placeholder="Your own words for this card. They show wherever it turns up.">' + esc(trMeaning(id)) + "</textarea>" + trbBox("h:" + id) + "</div></div>" +
      '<span class="ov-sub">WHERE IT CAME UP</span><div class="tr-hrows">' + (rows.length ? rows.map(function (x) {
        return '<button type="button" class="tr-hrow" data-tropen="' + esc(x.r.id) + '"><small>' + esc(dLabel(parseYmd(x.r.day)) + " · " + (x.r.weekly ? "THIS WEEK'S CARD" : (x.r.sname || "") + " · " + x.l) + (x.rev ? " · REVERSED" : "")) + "</small><span>" + esc(x.r.q || (x.r.weekly ? "Card for the week" : "Open reading")) + "</span>" + (x.note ? '<span class="muted">' + esc(x.note) + "</span>" : "") + "</button>";
      }).join("") : '<span class="muted">Not in any reading in the last 13 weeks.</span>') + "</div></div>" +
      '<div class="sfoot btnrow"><button type="button" class="btn" id="detailClose">DONE</button></div>', "chrome-b");
  }

  /* --- taps --- */
  function trGo(v) {
    if (v === "weekly") { tr.draft = { spread: "one", n: 1, q: "", cards: [], weekly: true, sel: 0 }; trDraftSave(); v = "new"; }
    if (v === "builder") tr.bld = null;
    tr.view = v; tr.arm = null;
    if (state.screen !== "tarot") go("tarot"); else { render(false); $("content").scrollTop = 0; }
  }
  function trClick(b) {
    var d = b.dataset;
    if (d.trgo) { trGo(d.trgo); return true; }
    if (d.tropen) { tr.open = d.tropen; tr.view = "reading"; tr.arm = null; trb.opened = {}; if (!$("detailScrim").hidden) closeDetail(); if (state.screen !== "tarot") go("tarot"); else { render(false); $("content").scrollTop = 0; } return true; }
    if (d.trhist) { trHistory(d.trhist); return true; }
    if (d.aitarot) { if (d.aitarot === "1") lsSet(LS_AITAROT, true); else lsDel(LS_AITAROT); askReshare(); render(true); return true; }
    if (d.trretry) { tr.qErr = null; flushTarot(); render(true); return true; }
    if (trbClick(b)) return true;
    if (state.screen !== "tarot") return false;
    if (d.trspread) { var dr = trDraft(); dr.spread = d.trspread; dr.cards = []; dr.sel = 0; dr.flip = null; if (trSpread(dr.spread, dr.n).pos.length !== 1) dr.weekly = false; trDraftSave(); render(true); return true; }
    if (d.trn) { var dn = trDraft(); dn.n = Math.max(1, Math.min(12, dn.n + +d.trn)); dn.cards = dn.cards.slice(0, dn.n); trDraftSave(); render(true); return true; }
    if (d.trslot != null) {
      if (tr.view === "new") { var ds = trDraft(); ds.sel = +d.trslot; ds.flip = null; trDraftSave(); trPicker(); }
      else if (tr.view === "reading") { var c = trOpen().cards[+d.trslot]; if (c) trHistory(c.id); }
      return true;
    }
    if (d.tract === "clear") { var dc = trDraft(); dc.cards = []; dc.sel = 0; trDraftSave(); render(true); return true; }
    if (d.tract === "draw") {
      var dd = trDraft(), sp = trSpread(dd.spread, dd.n), used = dd.cards.filter(Boolean).map(function (x) { return x.id; }), pool = TR_DECK.filter(function (id) { return used.indexOf(id) < 0; });
      var rnd = function (n) { var a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); return a[0] % n; };
      for (var j = 0; j < sp.pos.length; j++) if (!dd.cards[j]) { var k = rnd(pool.length); dd.cards[j] = { id: pool[k], rev: rnd(4) === 0 }; pool.splice(k, 1); }
      dd.flip = null; trDraftSave(); render(true);
      document.querySelectorAll(".tr-board .tr-card").forEach(function (el, n) { el.style.animationDelay = n * 70 + "ms"; el.classList.add("flip"); });
      toast("Shuffled and drawn on this iPad");
      return true;
    }
    if (d.tract === "save") {
      var dv = trDraft(), spv = trSpread(dv.spread, dv.n), cid = newCid();
      var r = { id: "cid:" + cid, day: ymd(new Date()), spread: dv.spread, sname: spv.nm, q: (dv.q || "").trim(), pos: spv.pos.map(function (p) { return { l: p.l, x: p.x, y: p.y, c: p.c ? 1 : 0 }; }), cards: dv.cards.slice(0, spv.pos.length), notes: [], sum: "", weekly: !!(dv.weekly && spv.pos.length === 1) };
      trSaveReading(r);
      tr.draft = null; lsDel(LS_TAROTDRAFT); tr.open = r.id; tr.view = "reading";
      toast(r.weekly ? "Saved as this week's card" : "Reading saved"); render(false); $("content").scrollTop = 0;
      return true;
    }
    if (d.trdel) {
      if (tr.arm === "del:" + d.trdel && Date.now() - tr.armAt < 4000) {
        var rid = d.trdel; tr.arm = null;
        delete tr.q["r:" + rid]; lsSet(LS_TAROTQ, tr.q);
        if (tr.data) { tr.data.readings = tr.data.readings.filter(function (x) { return x.id !== rid; }); lsSet(LS_TAROT, tr.data); }
        trQueue("x:" + rid, { body: { action: "tarotremove", id: rid } });
        tr.view = "home"; toast("Deleted. It's in Notion's trash if you change your mind"); render(false);
      } else { tr.arm = "del:" + d.trdel; tr.armAt = Date.now(); render(true); setTimeout(function () { if (state.screen === "tarot") render(true); }, 4100); }
      return true;
    }
    if (d.trcell) {
      var xy = d.trcell.split(",").map(Number), bl = tr.bld, ix = bl.pos.map(function (p) { return p.x + "," + p.y; }).indexOf(d.trcell);
      if (ix > -1) bl.pos.splice(ix, 1); else if (bl.pos.length < 20) bl.pos.push({ l: "", x: xy[0], y: xy[1] });
      render(true); return true;
    }
    if (d.trpcross) { var pc = tr.bld.pos[+d.trpcross]; pc.c = !pc.c; render(true); return true; }
    if (d.tract === "bsave") {
      var bs = tr.bld, tmp = "tmp:" + newCid(), spread = { nm: bs.nm.trim().toUpperCase(), pos: trNorm(bs.pos) };
      if (tr.data) { tr.data.spreads = tr.data.spreads.concat([{ id: tmp, title: spread.nm, pos: spread.pos }]); lsSet(LS_TAROT, tr.data); }
      trQueue("s:" + tmp, { tmp: tmp, body: { action: "tarotspread", spread: spread } });
      tr.bld = null; toast("Spread saved. It's under NEW READING."); render(true); return true;
    }
    if (d.trspdel) {
      if (tr.arm === "sp:" + d.trspdel && Date.now() - tr.armAt < 4000) {
        var sid = d.trspdel; tr.arm = null;
        if (tr.data) { tr.data.spreads = tr.data.spreads.filter(function (s) { return s.id !== sid; }); lsSet(LS_TAROT, tr.data); }
        if (sid.indexOf("tmp:") === 0) { delete tr.q["s:" + sid]; lsSet(LS_TAROTQ, tr.q); } else trQueue("x:" + sid, { body: { action: "tarotremove", id: sid } });
        render(true);
      } else { tr.arm = "sp:" + d.trspdel; tr.armAt = Date.now(); render(true); }
      return true;
    }
    return false;
  }
  function trSheetClick(b) {
    var d = b.dataset;
    if (d.trtab) { tr.pickTab = d.trtab; trPicker(); return true; }
    if (d.trpick) {
      var dp = trDraft(), sp = trSpread(dp.spread, dp.n);
      dp.cards[dp.sel] = { id: d.trpick, rev: tr.pickRev }; dp.flip = dp.sel; tr.pickRev = false;
      var nx = -1; for (var i = 0; i < sp.pos.length; i++) if (!dp.cards[i]) { nx = i; break; }
      trDraftSave(); render(true);
      if (nx > -1) { dp.sel = nx; trDraftSave(); setTimeout(function () { if (state.screen === "tarot" && tr.view === "new") trPicker(); }, 320); trPicker(); }
      else closeDetail();
      return true;
    }
    if (d.tropen || d.trhist) return trClick(b);
    return trbClick(b);
  }
  document.addEventListener("input", function (e) {
    var t = e.target, d = t.dataset || {};
    if (t.id === "trQ") { trDraft().q = t.value; trDraftSave(); return; }
    if (t.id === "trBName" && tr.bld) { tr.bld.nm = t.value; var sbox = document.querySelector('[data-tract="bsave"]'); if (sbox) sbox.disabled = !(tr.bld.pos.length && t.value.trim()); return; }
    if (d.trplabel != null && tr.bld) { tr.bld.pos[+d.trplabel].l = t.value; return; }
    if (d.trsum) { var r = trReadings().filter(function (x) { return x.id === trId(d.trsum); })[0]; if (r) trEdit(r, { sum: t.value }); return; }
    if (d.trnote != null) { var rn = trReadings().filter(function (x) { return x.id === trId(d.trid); })[0]; if (rn) { var notes = (rn.notes || []).slice(); while (notes.length < rn.cards.length) notes.push(""); notes[+d.trnote] = t.value; trEdit(rn, { notes: notes }); } return; }
    if (d.trmean) {
      var card = d.trmean;
      if (tr.data) { tr.data.meanings[card] = t.value; lsSet(LS_TAROT, tr.data); }
      tr.mdirty[card] = t.value;
      clearTimeout(tr.mtimers[card]);
      tr.mtimers[card] = setTimeout(function () { trMeanNow(card); }, 1200);
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "trWk") { trDraft().weekly = e.target.checked; trDraftSave(); }
    if (e.target.id === "trRev") { tr.pickRev = e.target.checked; trPicker(); }
  });

  /* --- the Bridge, the Review, Systems and Ask --- */

  function tarotWeek(w0) {
    if (!canTarot()) return "";
    loadTarot(false);
    if (!tr.data) return "<section>" + phead("TAROT", "") + '<div class="empty">' + (tr.err ? esc(tr.err.msg) : "Loading your readings from Notion…") + "</div></section>";
    var a = ymd(w0), b = ymd(addDays(w0, 6)), wk = trWeekly(w0), rs = trReadings().filter(function (r) { return r.day >= a && r.day <= b && !(wk && r.id === wk.id); });
    if (!wk && !rs.length) return "<section>" + phead("TAROT", "THIS WEEK") + '<div class="empty">No card or readings recorded this week.</div></section>';
    var html = "<section>" + phead("TAROT", rs.length + (rs.length === 1 ? " READING" : " READINGS") + (wk ? " · WEEK'S CARD" : "")) + '<div class="tr-review">';
    if (wk) { var c = wk.cards[0]; html += '<button type="button" class="tr-tile" data-tropen="' + esc(wk.id) + '">' + trCard(c.id, c.rev) + "<span><b>" + esc(trName(c.id).toUpperCase()) + (c.rev ? " · REVERSED" : "") + "</b><small>" + esc(trMeaning(c.id) || trKw(c.id, c.rev)) + "</small>" + (wk.sum ? "<small>" + esc(wk.sum) + "</small>" : "") + "</span></button>"; }
    if (rs.length) html += '<div class="tr-list">' + rs.map(trRowHtml).join("") + "</div>";
    return html + "</div></section>";
  }
  function tarotSection() {
    var on = !!lsGet(LS_AITAROT), n = trReadings().length, isWaiting = Object.keys(tr.q).length;
    var html = "<section>" + phead("TAROT", canTarot() ? (tr.err ? "PROBLEM" : "NOTION") : "SETUP");
    if (!canTarot()) return html + stubBox("Needs the 🔮 Tarot database connected in Notion. Steps are in the README under <b>Connect Notion</b>.") + "</section>";
    html += '<div class="calrow"><span class="st" style="background:var(--chrome-a)"></span><span><b>🔮 Tarot</b><small' + (tr.err ? ' class="errtxt">' + esc(tr.err.msg) : ">" + (tr.data ? n + (n === 1 ? " reading" : " readings") + " in 13 weeks · " + trMySpreads().length + " of your spreads · " + Object.keys(tr.data.meanings || {}).filter(function (k) { return tr.data.meanings[k]; }).length + " meanings" : "Not loaded yet") + (isWaiting ? " · " + isWaiting + " waiting to save" : "")) + "</small></span>" +
      '<span class="pill' + (tr.data && !tr.err ? " ok" : tr.err ? " bad" : "") + '">' + (tr.data && !tr.err ? "OK" : tr.err ? "ERROR" : "WAITING") + "</span></div>" + trbSystemsRow();
    html += '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND YOUR READINGS</label><div class="btnrow">' +
      '<button type="button" class="chip" data-aitarot="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-aitarot="1" aria-pressed="' + on + '">SHARE WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "Ask receives this week's card, the last 14 days of readings (cards, positions, your notes) and your meanings for those cards with each question. They go to Anthropic with the question." : "Off: your readings are never sent with Ask questions.") + "</small></section>";
    return html;
  }
  /* For Ask, only when turned on: this week's card and the last 14 days, in plain text. */
  function tarotBrief() {
    if (!lsGet(LS_AITAROT) || !canTarot() || !tr.data) return "";
    var from = ymd(addDays(new Date(), -13)), out = [], seen = {}, wk = trWeekly(sow(new Date()));
    if (wk) { var c = wk.cards[0]; seen[c.id] = 1; out.push("This week's card: " + trName(c.id) + (c.rev ? " (reversed)" : "") + (wk.sum ? ". His note: " + wk.sum : "")); }
    trReadings().filter(function (r) { return r.day >= from && !(wk && r.id === wk.id); }).slice(0, 12).forEach(function (r) {
      var pos = r.pos && r.pos.length === r.cards.length ? r.pos : trSpread(r.spread, r.cards.length).pos;
      out.push(r.day + " · " + (r.sname || "reading") + (r.q ? ' · "' + r.q + '"' : "") + ": " + r.cards.map(function (cc, i) { seen[cc.id] = 1; var n = (r.notes || [])[i]; return (pos[i] ? pos[i].l.toLowerCase() + " " : "") + trName(cc.id) + (cc.rev ? " (reversed)" : "") + (n ? " [" + n + "]" : ""); }).join("; ") + (r.sum ? ". His reading: " + r.sum : ""));
    });
    var mean = Object.keys(seen).filter(function (k) { return trMeaning(k); }).map(function (k) { return trName(k) + ": " + trMeaning(k); });
    if (mean.length) out.push("His own meanings: " + mean.join(" | "));
    if (!out.length) return "";
    var txt = "TAROT (his readings, shared by Timothy's choice):\n" + out.join("\n");
    return txt.length > 4000 ? txt.slice(0, 4000) + "…" : txt;
  }

  /* ---------- Your tarot books (2.29, bridge 1.25) ---------- */
  /* Passages from Liz Dean's and Jessa Crispin's books, one Notion page per card per book in 📖 Tarot Books
     (private, in Timothy's Notion). BOOKS under a card reads that card's two pages through the bridge; the
     text is kept in memory only, never in the iPad's storage, and never in this repository. SUGGEST sends
     the card's passages, its position, the question, MY MEANING and the note to Claude, only when tapped;
     the answer waits in a dashed box marked NOT SAVED until ADD puts it in the note (saved like your own
     typing) or DISMISS drops it. Boxes are drawn by key (p:i a position, s the whole reading, h:CARD the
     card's history sheet) so they redraw in place without disturbing the text around them. */
  var trb = { cards: {}, opened: {}, tab: "dean", sug: {}, busy: null, err: {}, status: null, statusAt: 0, statusErr: null, importing: false, importMsg: "" };
  function canBooks() { return state.caps.indexOf("tarotbooks") > -1; }
  function canSuggest() { return state.caps.indexOf("tarotsuggest") > -1; }
  function trbErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share 📖 Tarot Books with the bridge yet. In Notion open it → ••• → Connections → add TimothyOS bridge.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge (steps in the README under Updating the Google bridge).";
    if (code === "tarot_books_no_file") return "The import file isn't in 📖 Tarot Books any more, and no card pages are there yet.";
    if (code === "tarot_books_bad_file") return "The import file in 📖 Tarot Books couldn't be read.";
    if (code === "tarot_books_empty") return "Your books aren't in Notion yet. Systems → TAROT → IMPORT BOOKS.";
    if (code === "tarot_books_importing") return "An import is already running. Give it a minute.";
    return /^ai_/.test(code || "") ? describeAi(err) : describe(err);
  }
  function trbLoad(card, fresh) {
    var c = trb.cards[card];
    if (c && (c.loading || (c.books && !fresh))) return;
    trb.cards[card] = { loading: true, books: c && c.books };
    api({ action: "tarotbook", card: card, fresh: fresh ? "1" : "0" }).then(function (j) { trb.cards[card] = { books: j.books || [] }; })
      .catch(function (err) { trb.cards[card] = { err: trbErrText(err) }; })
      .then(trbPaint);
  }
  function trbPaint() { document.querySelectorAll("[data-trbox]").forEach(function (el) { el.outerHTML = trbBox(el.dataset.trbox); }); if (typeof growAll === "function") growAll(); }
  /* Dean's sections in reading order: what's at a glance, then the meaning for the way the card fell, the other way, the rest. */
  function trbSections(b, rev) {
    var rank = function (h) { h = h.toUpperCase(); return /GLANCE/.test(h) ? 0 : /^REVERSED/.test(h) ? (rev ? 1 : 2) : /^UPRIGHT/.test(h) ? (rev ? 2 : 1) : /WISDOM/.test(h) ? 3 : 4; };
    var secs = (b.sections || []).map(function (s, i) { return { s: s, i: i }; });
    if (b.book === "dean") secs.sort(function (x, y) { return rank(x.s.h) - rank(y.s.h) || x.i - y.i; });
    return secs.map(function (x) { return x.s; });
  }
  function trbPassage(b, rev) {
    return '<div class="tr-bk-text" tabindex="0">' + trbSections(b, rev).map(function (s) {
      return (s.h ? '<span class="tr-bk-h">' + esc(s.h) + "</span>" : "") + s.p.map(function (p) { return /^• /.test(p) ? '<p class="li">' + esc(p.slice(2)) + "</p>" : "<p>" + esc(p) + "</p>"; }).join("");
    }).join("") + "</div>";
  }
  function trbSugHtml(at, s) {
    return '<div class="tr-sug" role="status"><div class="tr-sug-top"><span>SUGGESTED FROM YOUR BOOKS · NOT SAVED</span><span>' + esc(modelName(s.model)) + " · " + money(s.cost || 0) + '</span></div><p>' + esc(s.text).replace(/\n+/g, "</p><p>") + '</p><div class="btnrow"><button type="button" class="btn sm" data-trbadd="' + at + '">' + (at < 0 ? "ADD TO WHAT IT SAYS" : "ADD TO MY NOTE") + '</button><button type="button" class="btn sm ghost" data-trbdis="' + at + '">DISMISS</button></div></div>';
  }
  function trbSugArea(r, at) {
    if (!canSuggest() || !r) return "";
    var k = r.id + ":" + at, s = trb.sug[k];
    if (trb.busy === k) return '<div class="tr-bk-wait">READING YOUR BOOKS…</div>';
    if (s) return trbSugHtml(at, s);
    var n = r.cards.length, est = at < 0 ? Math.max(2, Math.round(1 + n * 0.6)) : 1;
    return (trb.err[k] ? '<div class="err">' + esc(trb.err[k]) + "</div>" : "") + '<div class="tr-bk-row"><button type="button" class="tr-bk-btn" data-trbsug="' + at + '"' + (trb.busy ? " disabled" : "") + ">" + (at < 0 ? "SUGGEST A READING FROM MY BOOKS" : "SUGGEST A MEANING HERE") + '</button><small class="muted">≈ ' + est + "¢ · " + (at < 0 ? "all " + n + " cards, your question and notes" : "both books, this position, your question") + "</small></div>";
  }
  function trbBox(key) {
    var r = trOpen(), card, rev = false, at = null;
    if (key === "s") return canBooks() && r && r.cards.length > 1 ? '<div class="tr-bk-box" data-trbox="s">' + trbSugArea(r, -1) + "</div>" : '<div data-trbox="s"></div>';
    if (key.indexOf("h:") === 0) card = key.slice(2);
    else { at = +key.slice(2); var c = r && r.cards[at]; if (!c) return '<div data-trbox="' + key + '"></div>'; card = c.id; rev = !!c.rev; }
    var open = !!trb.opened[key], hist = at === null;
    var html = '<div class="tr-bk-box" data-trbox="' + key + '"><div class="tr-bk-row">' + (canBooks() ? '<button type="button" class="tr-bk-chip" data-trbk="' + key + '" aria-expanded="' + open + '">' + (open ? "CLOSE BOOKS" : hist ? "FROM YOUR BOOKS" : "BOOKS") + "</button>" : "") +
      (hist ? "" : '<button type="button" class="tr-link" data-trhist="' + card + '">EVERY TIME THIS CARD CAME UP</button>') + "</div>";
    if (!open || !canBooks()) return html + "</div>";
    var got = trb.cards[card];
    if (!got || got.loading && !got.books) { trbLoad(card); return html + '<div class="tr-bk"><div class="tr-bk-wait">OPENING YOUR BOOKS…</div></div></div>'; }
    if (got.err) return html + '<div class="tr-bk"><div class="err">' + esc(got.err) + '</div><button type="button" class="chip sm" data-trbfresh="' + card + '">TRY AGAIN</button></div></div>';
    var bookList = got.books || [];
    if (!bookList.length) return html + '<div class="tr-bk"><span class="muted">' + esc(trbErrText({ code: "tarot_books_empty" })) + "</span></div></div>";
    var b = bookList.filter(function (x) { return x.book === trb.tab; })[0] || bookList[0];
    html += '<div class="tr-bk"><div class="tr-bk-tabs" role="group" aria-label="Book">' + bookList.map(function (x) { return '<button type="button" class="tr-bk-tab" data-trbtab="' + x.book + '" aria-pressed="' + (x === b) + '">' + esc(x.name.toUpperCase()) + "</button>"; }).join("") + "</div>" +
      trbPassage(b, rev) + '<small class="tr-bk-src">' + esc(b.title + (b.source ? " · " + b.source : "")) + (b.url ? ' · <a href="' + esc(b.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</small>";
    if (!hist) html += trbSugArea(r, at);
    return html + "</div></div>";
  }
  function trbSuggest(r, at) {
    var k = r.id + ":" + at;
    if (trb.busy || !canSuggest()) return;
    var pos = r.pos && r.pos.length === r.cards.length ? r.pos : trSpread(r.spread, r.cards.length).pos;
    var body = { action: "tarotsuggest", mode: at < 0 ? "reading" : "card", at: at, q: r.q || "", sname: r.sname || "", sum: r.sum || "",
      cards: r.cards.map(function (c, i) { return { id: c.id, rev: !!c.rev, pos: pos[i] ? pos[i].l : "", note: (r.notes || [])[i] || "", mine: trMeaning(c.id) }; }) };
    trb.busy = k; delete trb.err[k]; trbPaint();
    apiPost(body, 120000).then(function (j) {
      trb.sug[k] = { text: j.text, cost: j.cost, model: j.model };
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
    }).catch(function (err) {
      if (err && err.spend) { state.aiSpend = err.spend; lsSet(LS_AISPEND, err.spend); }
      trb.err[k] = trbErrText(err);
    }).then(function () { trb.busy = null; trbPaint(); });
  }
  /* ADD: the suggestion goes into the note (or WHAT IT SAYS) after anything already there, and is saved like typing. */
  function trbAdd(r, at) {
    var k = r.id + ":" + at, s = trb.sug[k]; if (!s) return;
    if (at < 0) trEdit(r, { sum: (r.sum ? r.sum.replace(/\s+$/, "") + "\n\n" : "") + s.text });
    else { var notes = (r.notes || []).slice(); while (notes.length < r.cards.length) notes.push(""); notes[at] = (notes[at] ? notes[at].replace(/\s+$/, "") + "\n\n" : "") + s.text; trEdit(r, { notes: notes }); }
    delete trb.sug[k];
    render(true); toast(at < 0 ? "Added to WHAT IT SAYS. Make it your own." : "Added to your note. Make it your own.");
  }
  function trbClick(b) {
    var d = b.dataset, r = trOpen();
    if (d.trbk) { trb.opened[d.trbk] = !trb.opened[d.trbk]; trbPaint(); return true; }
    if (d.trbtab) { trb.tab = d.trbtab; trbPaint(); return true; }
    if (d.trbfresh) { trbLoad(d.trbfresh, true); trbPaint(); return true; }
    if (d.trbimport) { trbImport(); return true; }
    if (!r) return false;
    if (d.trbsug != null) { trbSuggest(r, +d.trbsug); return true; }
    if (d.trbadd != null) { trbAdd(r, +d.trbadd); return true; }
    if (d.trbdis != null) { delete trb.sug[r.id + ":" + d.trbdis]; trbPaint(); return true; }
    return false;
  }
  /* Systems: how many card pages each book has; IMPORT BOOKS while the import file is waiting. */
  function trbStatus(force) {
    if (!canBooks() || trb.statusLoading || (!force && Date.now() - trb.statusAt < 600000)) return;
    trb.statusLoading = true;
    api({ action: "tarotbooks" }).then(function (j) { trb.status = j; trb.statusErr = null; })
      .catch(function (err) { trb.statusErr = trbErrText(err); })
      .then(function () { trb.statusLoading = false; trb.statusAt = Date.now(); if (state.screen === "systems") render(true); });
  }
  function trbSystemsRow() {
    if (!canBooks()) return "";
    trbStatus(false);
    var s = trb.status, n = s ? (s.books.dean || 0) + (s.books.crispin || 0) : 0, all = s && n >= (s.per || 78) * 2;
    var sub = trb.statusErr ? '<small class="errtxt">' + esc(trb.statusErr) + "</small>" : s ? "<small>Liz Dean " + s.books.dean + " of " + s.per + " · Jessa Crispin " + s.books.crispin + " of " + s.per + (s.url ? ' · <a href="' + esc(s.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</small>" : "<small>Not loaded yet</small>";
    var html = '<div class="calrow"><span class="st" style="background:var(--chrome-c)"></span><span><b>📖 Tarot Books</b>' + sub + "</span>" +
      '<span class="pill' + (all && !trb.statusErr ? " ok" : trb.statusErr ? " bad" : "") + '">' + (trb.statusErr ? "ERROR" : !s ? "WAITING" : all ? "OK" : n ? "PARTLY" : "EMPTY") + "</span></div>";
    if (trb.importing || trb.importMsg) html += '<small class="muted">' + esc(trb.importMsg) + "</small>";
    if (s && s.file && !all && !trb.importing) html += '<div class="btnrow"><button type="button" class="btn sm" data-trbimport="1">IMPORT BOOKS</button></div><small class="muted">Makes one Notion page per card per book from the import file in 📖 Tarot Books. About three minutes; keep the app open. Pages already there are left alone.</small>';
    return html;
  }
  function trbImport() {
    if (trb.importing) return;
    trb.importing = true; trb.importMsg = "Importing… keep the app open."; render(true);
    (function step() {
      apiPost({ action: "tarotbookimport" }, 150000).then(function (j) {
        var n = (j.books.dean || 0) + (j.books.crispin || 0);
        trb.status = Object.assign({}, trb.status || { per: 78 }, { books: j.books });
        if (j.left > 0 && j.made > 0) { trb.importMsg = "Importing… " + n + " of 156 pages. Keep the app open."; render(true); step(); return; }
        trb.importing = false; trb.importMsg = j.left > 0 ? "Stopped with " + j.left + " still to make. Tap IMPORT BOOKS again." : n + " pages in 📖 Tarot Books. You can delete the import file page in Notion.";
        trb.cards = {}; trbStatus(true); render(true);
      }).catch(function (err) { trb.importing = false; trb.importMsg = trbErrText(err); render(true); });
    })();
  }

