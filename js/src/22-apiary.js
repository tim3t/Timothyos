  /* ---------- Apiary (2.31, bridge 1.26): the yard, each hive, its checks ---------- */
  /* Notion 🐝 Apiary holds one Yard page, a page per hive and a page per check (Hive relation). Three zoom
     levels on one screen: the yard (each hive drawn as its box stack), a hive (its stack large, its checks,
     ABOUT), then one check or a new one (five short steps). The stack is drawn from the hive's Data.boxes,
     top to bottom: { k: "super", fill 0..1 } or { k: "deep", drawn 0..10 }; null means not counted yet.
     Writes wait in tos.apiaryq.v1 until the bridge has them, so a check made at the hives without signal
     goes when the iPad is back online. Ask sees the apiary only when SHARE WITH ASK is on (tos.aiapiary.v1).
     Class names all start ap-. */
  var LS_APIARY = "tos.apiary.v1", LS_APIARYQ = "tos.apiaryq.v1", LS_AIAPIARY = "tos.aiapiary.v1", LS_APDRAFT = "tos.apdraft.v1";
  var AP_PAINTS = [["BLUE · RED", "#2f4a8f", "#b4423c"], ["RED · GOLD", "#9c2f2a", "#c99a2e"], ["GREEN · SAND", "#3b7d5a", "#d9c48a"], ["PURPLE · APRICOT", "#6a4c93", "#e8a27a"],
    ["TEAL · CREAM", "#2a6f8f", "#efe8dc"], ["BROWN · MINT", "#8f5a2f", "#56c7b8"], ["WHITE", "#e9e4da", "#e9e4da"]];
  var AP_STEPS = ["QUEEN", "FRAMES", "STORES", "PESTS", "WRAP UP"];
  var AP_MITE_OK = 2, AP_MITE_TREAT = 3, AP_MITES_YEAR = 4, AP_REMIND_DAYS = 7;
  var ap = { data: lsGet(LS_APIARY), q: lsGet(LS_APIARYQ) || {}, err: null, qErr: null, inflight: false, flushing: false,
    view: "yard", hive: null, check: null, box: null, draft: lsGet(LS_APDRAFT), form: null, arm: null, armAt: 0, fresh: null, alias: {}, yearOpen: false };
  function canApiary() { return state.caps.indexOf("apiary") > -1; }
  function apErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Apiary database with the bridge yet. In Notion open 🐝 Apiary → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge (steps in the README under Updating the Google bridge).";
    if (code === "bad_request") return "The bridge refused it. Mediums, feeders and excluders need the Google bridge updated (steps in the README under Updating the Google bridge).";
    return describe(err);
  }
  function apId(id) { return ap.alias[id] || id; }
  function apDay(d) { return p2(+d.slice(8)) + " " + MON[+d.slice(5, 7) - 1]; }
  function apAgo(d) { var n = Math.round((sod(new Date()) - parseYmd(d)) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : n + "d ago"; }
  function apOne(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

  /* --- data --- */
  function loadApiary(force) {
    if (!state.conn || !canApiary() || ap.inflight) return;
    if (!force && ap.data && Date.now() - ap.data.fetched < 120000) return;
    if (!force && ap.err && Date.now() - ap.err.at < FRESH_MS) return;
    ap.inflight = true;
    api({ action: "apiary" }).then(function (j) {
      ap.data = { fetched: Date.now(), yard: j.yard || null, hives: j.hives || [], checks: j.checks || [], url: j.url || "" };
      ap.err = null; lsSet(LS_APIARY, ap.data);
      flushApiary();
    }).catch(function (err) { ap.err = { at: Date.now(), msg: apErrText(err) }; })
      .then(function () { ap.inflight = false; if (state.screen === "apiary" || state.screen === "systems") render(true); cmdFresh(); });
  }
  function apQueue(key, body) { ap.q[key] = { body: body }; lsSet(LS_APIARYQ, ap.q); flushApiary(); }
  /* One write at a time, oldest first, so a new hive reaches Notion before its first check. */
  function flushApiary() {
    if (ap.flushing || !state.conn || !canApiary()) return;
    var keys = Object.keys(ap.q); if (!keys.length) return;
    var k = keys[0], it = ap.q[k];
    ap.flushing = true;
    apiPost(it.body).then(function (j) {
      if (ap.q[k] === it) delete ap.q[k];
      apApplySaved(it, j);
      lsSet(LS_APIARYQ, ap.q);
      ap.flushing = false; ap.qErr = null;
      if (Object.keys(ap.q).length) flushApiary(); else { if (ap.data) ap.data.fetched = 0; loadApiary(true); }
    }).catch(function (err) {
      ap.flushing = false;
      if (err && (err.code === "busy" || err.name === "AbortError") && (it.tries = (it.tries || 0) + 1) <= 6) { setTimeout(flushApiary, 4000 * it.tries); return; }
      if (err && (err.code === "not_writable" || err.code === "bad_request")) { delete ap.q[k]; lsSet(LS_APIARYQ, ap.q); }   /* Notion will never take this one: drop it rather than block the rest */
      ap.qErr = { at: Date.now(), msg: apErrText(err) };
      if (state.screen === "apiary") render(true);
    });
  }
  function apApplySaved(it, j) {
    if (!ap.data) return;
    var b = it.body, item = b.item;
    if (b.action === "apiaryremove") {
      ap.data.hives = ap.data.hives.filter(function (h) { return h.id !== b.id; });
      ap.data.checks = ap.data.checks.filter(function (c) { return c.id !== b.id; });
    }
    if (j.item) {
      var tmp = item && item.cid ? "cid:" + item.cid : null, real = j.item.id;
      if (tmp) {
        ap.alias[tmp] = real;
        /* later writes that still name the temporary id now point at the page */
        Object.keys(ap.q).forEach(function (k2) {
          var o = ap.q[k2].body.item;
          if (!o) return;
          if (o.hive === tmp) o.hive = real;
          if (o.cid === item.cid && !o.id) { o.id = real; delete o.cid; }
        });
        if (ap.hive === tmp) ap.hive = real;
        if (ap.check === tmp) ap.check = real;
        if (ap.fresh === tmp) ap.fresh = real;
      }
      var list = j.item.kind === "hive" ? "hives" : j.item.kind === "check" ? "checks" : null;
      if (list) { ap.data[list] = ap.data[list].filter(function (x) { return x.id !== real; }); ap.data[list].push(j.item); }
      else if (j.item.kind === "yard") ap.data.yard = j.item;
    }
    if (j.hive) ap.data.hives = ap.data.hives.map(function (h) { return h.id === j.hive.id ? j.hive : h; });
    lsSet(LS_APIARY, ap.data);
  }
  setInterval(function () { if (Object.keys(ap.q).length && !ap.flushing && navigator.onLine !== false) flushApiary(); }, 30000);

  /* What's in Notion with what's waiting to go over it. */
  function apPending(kind) {
    var out = [];
    Object.keys(ap.q).forEach(function (k) { var b = ap.q[k].body; if (b.action === "apiarysave" && b.item.kind === kind) out.push(b.item); });
    return out;
  }
  function apGone() { var g = {}; Object.keys(ap.q).forEach(function (k) { var b = ap.q[k].body; if (b.action === "apiaryremove") g[b.id] = 1; }); return g; }
  function apMerge(list, kind) {
    var gone = apGone(), out = list.filter(function (x) { return !gone[x.id]; }).map(function (x) { return Object.assign({}, x); });
    apPending(kind).forEach(function (it) {
      var id = it.id || "cid:" + it.cid, i = out.map(function (x) { return x.id; }).indexOf(id), pend = Object.assign({}, it, { id: id, pending: true });
      if (i > -1) out[i] = Object.assign(out[i], pend); else out.push(pend);
    });
    return out;
  }
  function apHives() {
    var hs = apMerge((ap.data && ap.data.hives) || [], "hive");
    /* a check waiting to go may carry the stack as it now stands */
    apPending("check").forEach(function (c) { if (c.boxes) hs.forEach(function (h) { if (h.id === apId(c.hive) || h.id === c.hive) h.data = Object.assign({}, h.data, { boxes: c.boxes }); }); });
    hs.forEach(function (h) { h.data = h.data || {}; if (!apBoxesOk(h.data.boxes)) h.data.boxes = [{ k: "deep", drawn: null }]; });
    return hs.sort(function (a, b) { return (+a.data.order || 99) - (+b.data.order || 99) || String(a.created || "~").localeCompare(String(b.created || "~")); });
  }
  function apBoxesOk(b) { return Array.isArray(b) && b.length > 0 && b.every(function (x) { return x && AP_PIECES[x.k]; }); }
  function apHive(id) { id = apId(id); return apHives().filter(function (h) { return h.id === id; })[0] || null; }
  function apChecks(hiveId) {
    var hid = hiveId ? apId(hiveId) : null;
    return apMerge((ap.data && ap.data.checks) || [], "check").filter(function (c) { return !hid || apId(c.hive) === hid; })
      .sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : String(b.created || "~").localeCompare(String(a.created || "~")); });
  }
  function apYard() {
    var y = ap.data && ap.data.yard ? Object.assign({}, ap.data.yard) : null, p = apPending("yard")[0];
    if (p) y = Object.assign(y || {}, p, { id: (y && y.id) || "cid:" + p.cid, pending: true });
    if (y) y.data = Object.assign({ list: [] }, y.data);
    return y;
  }
  function apYear(hiveId, y) {
    var honey = 0, mites = 0;
    apChecks(hiveId).forEach(function (c) { if (c.day.slice(0, 4) !== y) return; if (c.honey) honey += +c.honey; if (c.mites != null) mites++; });
    return { honey: Math.round(honey * 10) / 10, mites: mites };
  }

  /* --- the stack --- */
  /* Pieces (2.32), top to bottom in Data.boxes. Deeps, mediums and supers hold frames: n (default deep 10, medium 10,
     super 9; changeable per box) and drawn (frames drawn, or filled for a super; null = not counted). Mediums and
     supers also carry fill, the capped share 0..1. A feeder carries level (empty | low | full | null); a queen
     excluder nothing. rank sets where a new piece goes: on top of its own kind, below anything ranked above it. */
  var AP_PIECES = { feeder: { nm: "Feeder", rank: 0, max: 1 }, super: { nm: "Super", rank: 1, n: 9, cap: 1, max: 5 }, excluder: { nm: "Queen excluder", rank: 2, max: 1 },
    medium: { nm: "Medium", rank: 3, n: 10, cap: 1, max: 4 }, deep: { nm: "Deep", rank: 4, n: 10, max: 4 } };
  var AP_ADD = ["deep", "medium", "super", "excluder", "feeder"], AP_CAPS = [0, 25, 50, 75, 90, 100], AP_LEVELS = ["EMPTY", "LOW", "FULL"];
  function apLight(hex) { var n = parseInt(String(hex || "#000").slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; }
  function apN(b) { return +b.n || (AP_PIECES[b.k] || {}).n || 0; }
  function apBoxName(boxes, i) {
    var k = boxes[i].k, nm = AP_PIECES[k].nm, s = 0, ns = 0;
    boxes.forEach(function (b, j) { if (b.k === k) { ns++; if (j > i) s++; } });
    if (ns < 2) return k === "super" ? "Honey super" : nm;
    return s === 0 ? "Bottom " + nm.toLowerCase() : s === ns - 1 ? "Top " + nm.toLowerCase() : nm + " " + (s + 1);
  }
  function apNewPiece(k) { var P = AP_PIECES[k]; return P.n ? (P.cap ? { k: k, n: P.n, drawn: 0, fill: 0 } : { k: k, n: P.n, drawn: 0 }) : k === "feeder" ? { k: k, level: null } : { k: k }; }
  /* Where a new piece goes; returns its index. */
  function apSlot(boxes, k) { var r = AP_PIECES[k].rank, at = 0; while (at < boxes.length && AP_PIECES[boxes[at].k].rank < r) at++; return at; }
  function apInsert(boxes, k) { var at = apSlot(boxes, k); boxes.splice(at, 0, apNewPiece(k)); return at; }
  /* Box indexes kept in an object ({2: 1}) follow a piece put in (by 1) or taken off (by -1) at index at. */
  function apShiftKeys(o, at, by) {
    var c = {};
    Object.keys(o || {}).forEach(function (k) { var n = +k; if (by > 0) c[n >= at ? n + 1 : n] = 1; else if (n !== at) c[n > at ? n - 1 : n] = 1; });
    return c;
  }
  function apCount(boxes, k) { return boxes.filter(function (b) { return b.k === k; }).length; }
  /* One piece in words: "Bottom super 6/9 filled, 50% capped". Empty when nothing is known. */
  function apPieceText(boxes, i, what) {
    var b = boxes[i], P = AP_PIECES[b.k], parts = [];
    if (!P.n) return b.k === "feeder" && b.level && !what ? "Feeder " + b.level.toLowerCase() : "";
    if (b.drawn != null && (!what || what.d)) parts.push(b.drawn + "/" + apN(b) + (b.k === "super" ? " filled" : " drawn"));
    if (P.cap && b.fill != null && (!what || what.f)) parts.push(Math.round(b.fill * 100) + "% capped");
    return parts.length ? apBoxName(boxes, i) + " " + parts.join(", ") : "";
  }
  function apStack(h, u, pick, sel) {
    var boxes = h.data.boxes, html = '<div class="ap-stack" data-apstack="' + esc(h.id) + '" style="--u:' + u + 'px"' + (pick ? "" : ' aria-hidden="true"') + '><span class="lid"></span>', brood = 0;
    boxes.forEach(function (b) { if (b.k === "deep" || b.k === "medium") brood++; });
    boxes.forEach(function (b, i) {
      var tag = pick ? "button" : "span", attr = pick ? ' type="button" data-apbox="' + i + '" aria-label="' + esc(apBoxName(boxes, i)) + '"' : "", on = pick && sel === i ? " sel" : "", f = "", n = apN(b);
      for (var x = 0; x < n; x++) f += '<span class="f' + (b.drawn != null && x < b.drawn ? " on" : "") + '"></span>';
      if (b.k === "feeder") { html += "<" + tag + attr + ' class="box feeder' + (b.level ? "" : " unknown") + on + '"><i style="height:' + ({ FULL: 85, LOW: 30, EMPTY: 0 }[b.level] || 0) + '%"></i></' + tag + ">"; return; }
      if (b.k === "excluder") { html += "<" + tag + attr + ' class="box excluder' + on + '"></' + tag + ">"; return; }
      if (b.k === "super") { html += "<" + tag + attr + ' class="box super' + (b.fill == null && b.drawn == null ? " unknown" : "") + on + '"><i style="height:' + Math.round((b.fill || 0) * 100) + '%"></i>' + f + "</" + tag + ">"; return; }
      brood--;
      var paint = brood % 2 ? h.data.paint || "#2f4a8f" : h.data.paint2 || h.data.paint || "#b4423c";
      html += "<" + tag + attr + ' class="box ' + b.k + (b.drawn == null ? " unknown" : "") + on + '" style="--paint:' + paint + ";--tick:" + (apLight(paint) ? "#0a0a0d" : "#efe8dc") + '">' + f + "</" + tag + ">";
    });
    return html + '<span class="bottom"></span><span class="legs"><span></span><span></span></span></div>';
  }
  function apBoxRead(h, i) {
    var b = h.data.boxes[i];
    if (!b) return apBoxHint(h);
    var nm = apBoxName(h.data.boxes, i).toUpperCase(), t;
    if (b.k === "feeder") t = b.level ? "Syrup " + b.level.toLowerCase() + " at the last look." : "On the hive. Syrup level not logged.";
    else if (b.k === "excluder") t = "Keeps the queen in the boxes below it.";
    else {
      var parts = [];
      if (b.drawn != null) parts.push(b.drawn + " of " + apN(b) + " frames " + (b.k === "super" ? "filled" : "drawn"));
      if (AP_PIECES[b.k].cap && b.fill != null) parts.push("about " + Math.round(b.fill * 100) + "% capped");
      t = parts.length ? parts.join(", ").replace(/^./, function (c) { return c.toUpperCase(); }) + " at the last count." : "Not counted since it went on. The next check fills it in.";
    }
    return "<b>" + nm + "</b><span>" + t + "</span>";
  }
  function apBoxHint(h) { return "<b>THE STACK</b><span>Tap a box to see what was in it at the last check." + (h && h.data.trued ? " Trued up " + apDay(h.data.trued) + "." : "") + "</span>"; }

  /* --- TRUE UP STACK (2.32): set the stack as it really stands, without a check --- */
  function apTrueUpStart(h) { ap.tu = { hive: h.id, boxes: JSON.parse(JSON.stringify(h.data.boxes)), orig: JSON.stringify(h.data.boxes), sel: null, log: false, day: ymd(new Date()) }; }
  /* What changed, in words, for the optional log entry. */
  function apTuSummary(T) {
    var before = JSON.parse(T.orig), out = [], kinds = function (bs) { return bs.map(function (b) { return b.k; }).join(); };
    AP_ADD.forEach(function (k) {
      var d = apCount(T.boxes, k) - apCount(before, k), nm = AP_PIECES[k].nm.toLowerCase(), many = Math.abs(d) + " " + nm + "s";
      if (d > 0) out.push("Added " + (d === 1 ? "a " + nm : many));
      if (d < 0) out.push("Took off " + (d === -1 ? "a " + nm : many));
    });
    if (!out.length && kinds(T.boxes) !== kinds(before)) out.push("Rearranged the boxes");
    if (!out.length && JSON.stringify(T.boxes) !== T.orig) out.push("Trued up frame counts");
    return out.join("; ");
  }
  function apTrueUpHtml() {
    var h = apHive(ap.hive), T = ap.tu, bs = T.boxes, armed = ap.arm === "tux:" + T.sel && Date.now() - ap.armAt < 4000, sum = apTuSummary(T);
    var html = apCrumbs([["APIARY", "yard"], [h.name.toUpperCase(), "hive"], ["TRUE UP STACK"]]);
    html += '<div class="ap-hive"><div class="ap-stage">' + apStack({ id: h.id, data: Object.assign({}, h.data, { boxes: bs }) }, 1.7, true, T.sel) + '<div class="ap-readout"><b>' + esc(h.name.toUpperCase()) + "</b><span>" +
      AP_ADD.filter(function (k) { return apCount(bs, k); }).map(function (k) { var c = apCount(bs, k); return c + " " + (k === "excluder" ? "excluder" : AP_PIECES[k].nm.toLowerCase()) + (c > 1 ? "s" : ""); }).join(", ") + "</span></div></div>";
    html += '<article class="ap-card ap-form"><h2>TRUE UP STACK</h2><small class="muted">For changes made at the hive but not logged. Top of the hive first; tap a piece to set it.</small>' +
      '<div class="btnrow ap-adds">' + AP_ADD.map(function (k) { var full = apCount(bs, k) >= AP_PIECES[k].max; return '<button type="button" class="chip sm" data-aptuadd="' + k + '"' + (full ? " disabled" : "") + ">+ " + (k === "excluder" ? "EXCLUDER" : AP_PIECES[k].nm.toUpperCase()) + "</button>"; }).join("") + "</div>";
    html += '<div class="ap-pieces" role="list">' + bs.map(function (b, i) {
      var P = AP_PIECES[b.k], open = T.sel === i, line = apPieceText(bs, i) || (P.n ? apBoxName(bs, i) + " not counted" : b.k === "feeder" ? "Feeder, level not set" : apBoxName(bs, i));
      var row = '<div class="ap-piece' + (open ? " open" : "") + '" role="listitem"><button type="button" class="ap-prow" data-aptusel="' + i + '" aria-expanded="' + open + '"><span class="k k-' + b.k + '" aria-hidden="true"></span><span>' + esc(line) + '</span><span class="go" aria-hidden="true">' + (open ? "▴" : "▾") + "</span></button>";
      if (!open) return row + "</div>";
      row += '<div class="ap-pset">';
      if (P.n) {
        row += '<span class="ap-lab">FRAMES IN THIS BOX</span><div class="btnrow ap-picks">' + [8, 9, 10].map(function (v) { return '<button type="button" class="chip sm" data-aptun="' + v + '" aria-pressed="' + (apN(b) === v) + '">' + v + "</button>"; }).join("") + "</div>" +
          apStepper("tudrawn", i, b.drawn, b.k === "super" ? "FRAMES FILLED" : "FRAMES DRAWN", "of " + apN(b), apN(b));
        if (P.cap) row += '<span class="ap-lab">CAPPED</span><div class="btnrow ap-picks">' + AP_CAPS.map(function (v) { return '<button type="button" class="chip sm" style="--c: var(--hero)" data-aptucap="' + v + '" aria-pressed="' + (b.fill != null && Math.round(b.fill * 100) === v) + '">' + v + "%</button>"; }).join("") + "</div>";
      }
      if (b.k === "feeder") row += '<span class="ap-lab">SYRUP</span><div class="btnrow ap-picks">' + AP_LEVELS.map(function (v) { return '<button type="button" class="chip sm" data-aptulevel="' + v + '" aria-pressed="' + (b.level === v) + '">' + v + "</button>"; }).join("") + "</div>";
      row += '<div class="btnrow"><button type="button" class="chip sm" data-aptumove="-1"' + (i === 0 ? " disabled" : "") + '>▲ UP</button><button type="button" class="chip sm" data-aptumove="1"' + (i === bs.length - 1 ? " disabled" : "") + ">▼ DOWN</button>" +
        '<button type="button" class="chip sm' + (armed ? " ap-armed" : "") + '" data-aptux="' + i + '"' + (bs.length < 2 ? " disabled" : "") + ">" + (armed ? "TAP AGAIN TO REMOVE" : "REMOVE") + "</button></div></div>";
      return row + "</div>";
    }).join("") + "</div>";
    html += '<div class="btnrow"><button type="button" class="chip sm" data-aptulog="1" aria-pressed="' + T.log + '">LOG THIS TOO</button></div>' +
      (T.log ? '<label class="ap-lab" for="apTuDay">DATE YOU DID IT</label><input type="date" id="apTuDay" data-aptuday="1" value="' + esc(T.day) + '" max="' + ymd(new Date()) + '">' +
        '<small class="muted">Adds a check on that date: ' + esc((sum || "Trued up the stack") + " (logged later)") + ".</small>" : '<small class="muted">Only the stack changes. Turn on LOG THIS TOO to add it to the hive\'s history with the date you did it.</small>') +
      '<div class="ap-navrow"><button type="button" class="btn sm ghost" data-apgo="hive">CANCEL</button><button type="button" class="btn sm" data-apact="savetu">SAVE STACK</button></div></article></div>';
    return html;
  }
  /* The hive with its new stack; with LOG THIS TOO, a short check after it (the hive goes first in the queue). */
  function apSaveTrueUp() {
    var T = ap.tu, h = apHive(T.hive);
    if (JSON.stringify(T.boxes) === T.orig && !T.log) { toast("Nothing changed"); return false; }
    var data = Object.assign({}, h.data, { boxes: T.boxes, trued: ymd(new Date()) }), item = { kind: "hive", name: h.name, queen: h.queen || "", day: h.day || null, notes: h.notes || "", data: data }, key;
    if (String(h.id).indexOf("cid:") === 0) { item.cid = h.id.slice(4); key = "h:" + h.id; } else { item.id = h.id; key = "h:" + h.id; }
    apQueue(key, { action: "apiarysave", item: item });
    if (T.log && /^\d{4}-\d{2}-\d{2}$/.test(T.day || "")) {
      var cid = newCid(), frames = T.boxes.map(function (b, i) { return apPieceText(T.boxes, i); }).filter(Boolean).reverse().join("; ");
      apQueue("c:cid:" + cid, { action: "apiarysave", item: { kind: "check", cid: cid, hive: apId(h.id), day: T.day, who: "", queen: "", frames: frames, stores: "", feed: "", mood: "", pests: "",
        did: (apTuSummary(T) || "Trued up the stack") + " (logged later)", issue: "", notes: "", next: "", mites: null, honey: null, data: { v: 1, trueup: 1 } } });
    }
    ap.tu = null; ap.box = null;
    return true;
  }

  /* --- moving between levels: the stack you tapped flies to its place on the next level --- */
  var AP_DEPTH = { yard: 0, hiveedit: 1, hive: 1, check: 2, new: 2, stackedit: 2, checkedit: 3 };
  function apNav(view, from) {
    var deeper = (AP_DEPTH[view] || 0) > (AP_DEPTH[ap.view] || 0), src = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null, sid = from && from.dataset ? from.dataset.apstack : null;
    ap.view = view; ap.arm = null;
    if (state.screen !== "apiary") { go("apiary"); return; }
    render(false);
    $("content").scrollTop = 0;
    var root = document.querySelector("#content .ap-view");
    if (!root || calm()) return;
    root.classList.add(deeper ? "zin" : "zout");
    var dst = sid && document.querySelector('#content .ap-view .ap-stack[data-apstack="' + sid + '"]');
    if (!src || !dst || !src.width) return;
    var r = dst.getBoundingClientRect(), ghost = from.cloneNode(true);
    ghost.classList.add("ap-ghost"); ghost.style.left = src.left + "px"; ghost.style.top = src.top + "px";
    document.body.appendChild(ghost); dst.style.visibility = "hidden";
    var done = function () { ghost.remove(); dst.style.visibility = ""; };
    try {
      ghost.animate([{ transform: "none" }, { transform: "translate(" + (r.left - src.left) + "px," + (r.top - src.top) + "px) scale(" + r.width / src.width + "," + r.height / src.height + ")" }], { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)" }).onfinish = done;
    } catch (x) { done(); }
    setTimeout(done, 900);   /* in case the animation never reports back */
  }
  function apStackEl() { return document.querySelector("#content .ap-view .ap-stack"); }

  /* --- the screen --- */
  function apHead() {
    var h = ap.hive && apHive(ap.hive);
    if (ap.view === "yard" || !h) return { e: "APIARY · " + (ap.data ? apHives().length + (apHives().length === 1 ? " HIVE" : " HIVES") : "NOTION"), t: "APIARY" };
    if (ap.view === "hiveedit") return { e: "APIARY · " + (h.pending && !h.name ? "NEW HIVE" : "EDIT HIVE"), t: (h.name || "NEW HIVE").toUpperCase() };
    if (ap.view === "stackedit") return { e: "APIARY · TRUE UP STACK", t: h.name.toUpperCase() };
    return { e: "APIARY · " + (ap.view === "new" ? "NEW CHECK" : ap.view === "check" || ap.view === "checkedit" ? "CHECK" : h.queen ? "QUEEN " + h.queen.toUpperCase() : "HIVE"), t: h.name.toUpperCase() };
  }
  function renderApiary() {
    loadApiary(false);
    if (!canApiary()) { $("content").innerHTML = '<div class="ap">' + phead("APIARY", "SETUP") + stubBox(state.conn ? "Needs the 🐝 Apiary database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Connect Notion</b>." : "Link calendars first.") + "</div>"; return; }
    if (!ap.data) { $("content").innerHTML = '<div class="ap">' + phead("APIARY", "") + '<div class="empty">' + (ap.err ? esc(ap.err.msg) : "Loading your hives from Notion…") + "</div></div>"; return; }
    if (ap.view === "hiveedit" && !ap.form) ap.view = ap.hive ? "hive" : "yard";
    if (ap.view !== "yard" && ap.view !== "hiveedit" && !apHive(ap.hive)) ap.view = "yard";
    if ((ap.view === "check" || ap.view === "checkedit") && !apChecks(ap.hive).filter(function (c) { return c.id === apId(ap.check); }).length) ap.view = "hive";
    if (ap.view === "new" && (!ap.draft || apId(ap.draft.hive) !== apId(ap.hive))) ap.view = "hive";
    if (ap.view === "stackedit" && (!ap.tu || apId(ap.tu.hive) !== apId(ap.hive))) ap.view = "hive";
    var nq = Object.keys(ap.q).length;
    var html = '<div class="ap">' + (ap.qErr && nq ? '<div class="err">' + nq + " change" + (nq === 1 ? "" : "s") + " not in Notion yet: " + esc(ap.qErr.msg) + ' <button type="button" class="chip sm" data-apretry="1">RETRY</button></div>' : ap.qErr ? '<div class="err">Not saved: ' + esc(ap.qErr.msg) + "</div>" : "");
    html += '<div class="ap-view">' + ({ yard: apYardHtml, hive: apHiveHtml, check: apCheckHtml, new: apNewHtml, checkedit: apCheckEditHtml, hiveedit: apHiveEditHtml, stackedit: apTrueUpHtml })[ap.view]() + "</div>";
    $("content").innerHTML = html + "</div>";
  }
  function apCrumbs(parts) {
    return '<nav class="ap-crumbs" aria-label="Where you are">' + parts.map(function (p, i) {
      return (i ? '<span aria-hidden="true">›</span>' : "") + (p[1] ? '<button type="button" data-apgo="' + p[1] + '">' + esc(p[0]) + "</button>" : "<b>" + esc(p[0]) + "</b>");
    }).join("") + "</nav>";
  }

  /* level 1: the yard */
  function apYardHtml() {
    var hs = apHives(), y = String(new Date().getFullYear()), rh = hiveDue(new Date()), hv = !rh || (rh.due && !rh.winter) ? hiveCheck(new Date()) : null, yard = apYard();
    var honey = 0, mites = hs.length ? 99 : 0;
    hs.forEach(function (h) { var s = apYear(h.id, y); honey += s.honey; mites = Math.min(mites, s.mites); });
    var html = apCrumbs([["APIARY"]]);
    html += '<section class="ap-yard" aria-label="The yard"><div class="ap-sky"><div class="ap-quiet">' +
      (rh && !rh.due ? "<span>NEXT CHECK <b>~" + esc(shortDay(rh.next)) + "</b></span>" : rh && rh.winter ? '<span>OUTSIDE LOOK <b class="hold">DUE</b></span>' : "") +
      (hv ? "<span>HIVE CHECK " + esc(hv.label) + ' <b class="' + (hv.go ? "go" : "hold") + '">' + (hv.go ? "GO" : "HOLD") + " · " + esc(hv.text.toUpperCase()) + "</b></span>" : "") +
      "<span>HONEY " + y + " <b>" + (Math.round(honey * 10) / 10) + " LB</b></span>" +
      (hs.length ? "<span>MITE CHECKS <b class=\"" + (mites >= AP_MITES_YEAR ? "go" : "bad") + "\">" + Math.min(mites, AP_MITES_YEAR) + " OF " + AP_MITES_YEAR + "</b></span>" : "") + "</div>" +
      (yard && yard.data.facing ? '<span class="ap-facing">FACING ' + esc(String(yard.data.facing).toUpperCase()) + "</span>" : "") + '</div><div class="ap-pad">';
    hs.forEach(function (h) {
      var last = apChecks(h.id)[0];
      html += '<button type="button" class="ap-hivebtn" data-aphive="' + esc(h.id) + '" aria-label="' + esc(h.name + (h.queen ? ", queen " + h.queen : "")) + '"><span class="ap-base">' + apStack(h, 1.15, false) + '</span><span class="ap-hname"><b>' + esc(h.name.toUpperCase()) + "</b>" +
        (h.queen ? "<small>Queen " + esc(h.queen) + "</small>" : "") + "<small>" + (last ? "Checked " + apDay(last.day) + " · " + apAgo(last.day) : "No checks yet") + "</small>" +
        (last && last.issue ? '<span class="ap-flag">● ' + esc(last.issue.length > 60 ? last.issue.slice(0, 58) + "…" : last.issue) + "</span>" : "") + (h.pending ? '<span class="ap-flag dim">NOT IN NOTION YET</span>' : "") + "</span></button>";
    });
    html += '<button type="button" class="ap-addslot" data-apact="addhive">+ ADD HIVE<small>a package, a nuc or a split</small></button></div><div class="ap-mat" aria-hidden="true"></div>' +
      (yard && yard.notes ? '<span class="ap-site">' + esc(yard.notes) + "</span>" : "") + "</section>";
    html += '<details class="ap-year" id="apYear"' + (ap.yearOpen ? " open" : "") + "><summary>THIS YEAR · HONEY, MITES, CHECK RHYTHM, THE YARD LIST</summary><div class=\"ap-yeargrid\">";
    var top = 1; hs.forEach(function (h) { top = Math.max(top, apYear(h.id, y).honey); });
    html += '<div><h3 class="ap-h honey">HONEY ' + y + '</h3><div class="ap-bars">' + (hs.length ? hs.map(function (h) { var lbl = apYear(h.id, y).honey; return "<span>" + esc(h.name) + '</span><span class="b"><i style="width:' + Math.max(lbl ? 6 : 0, lbl / top * 100) + '%"></i></span><span class="tnum">' + lbl + " lb</span>"; }).join("") : '<span class="muted">No hives yet.</span>') + "</div></div>";
    html += '<div><h3 class="ap-h mites">MITE CHECKS</h3><div class="ap-mrows">' + hs.map(function (h) {
      var n = apYear(h.id, y).mites, dots = "";
      for (var i = 0; i < AP_MITES_YEAR; i++) dots += '<i class="' + (i < n ? "on" : "") + '"></i>';
      return "<span>" + esc(h.name) + '</span><span class="ap-dots" aria-label="' + Math.min(n, AP_MITES_YEAR) + " of " + AP_MITES_YEAR + '">' + dots + "</span>";
    }).join("") + '</div><small class="muted">Four a year at least. A check with a mite count lights one.</small></div>';
    var R = hiveRhythm(), cur = HIVE_SEASON[new Date().getMonth()];
    html += '<div><h3 class="ap-h rhythm">CHECK RHYTHM</h3><div class="ap-rhythm">' + [["active", "APR TO SEP"], ["shoulder", "MAR · OCT · NOV"], ["winter", "DEC TO FEB · OUTSIDE LOOK"]].map(function (x) {
      return '<div class="ap-rrow' + (x[0] === cur ? " ap-rnow" : "") + '"><span>' + x[1] + (x[0] === cur ? " · NOW" : "") + '</span><span class="ap-rstep"><button type="button" class="chip sm" data-aprhythm="' + x[0] + ':-1" aria-label="Fewer days, ' + x[1] + '">−</button><b class="tnum">' + R[x[0]] + ' DAYS</b><button type="button" class="chip sm" data-aprhythm="' + x[0] + ':1" aria-label="More days, ' + x[1] + '">+</button></span></div>';
    }).join("") + '</div><small class="muted">Days between checks, counted from the newest check on any hive. The hive window shows on the Bridge, and the briefing mentions the hives, only when a check is due.</small></div>';
    var list = (yard && yard.data.list) || [];
    html += '<div><h3 class="ap-h list">THE YARD LIST</h3><ul class="ap-list">' + list.map(function (it, i) {
      return '<li><button type="button" class="ap-tick' + (it.done ? " done" : "") + '" data-aplist="' + i + '" aria-pressed="' + !!it.done + '">' + esc(it.t) + '</button><button type="button" class="ap-x" data-aplistx="' + i + '" aria-label="Remove ' + esc(it.t) + '">✕</button></li>';
    }).join("") + '</ul><div class="ap-addrow"><input type="text" id="apListIn" maxlength="120" placeholder="Supplies, winter prep…" autocomplete="off"><button type="button" class="btn sm" data-apact="listadd">ADD</button></div></div>';
    return html + "</div></details>";
  }

  /* level 2: a hive */
  function apHiveHtml() {
    var h = apHive(ap.hive), cs = apChecks(h.id), last = cs[0], lbl = 0;
    cs.forEach(function (c) { if (c.honey) lbl += +c.honey; });
    var html = apCrumbs([["APIARY", "yard"], [h.name.toUpperCase()]]);
    if (ap.fresh) {
      var other = apHives().filter(function (x) { return x.id !== h.id && !apChecks(x.id).some(function (c) { return c.day === ymd(new Date()); }); })[0];
      html += '<div class="ap-saved"><span>✓ SAVED' + (cs.some(function (c) { return c.pending; }) ? " · GOES TO NOTION WHEN THE BRIDGE ANSWERS" : "") + "</span>" + (other ? '<button type="button" class="btn sm" data-apnextcheck="' + esc(other.id) + '">CHECK ' + esc(other.name.toUpperCase()) + " NEXT ›</button>" : "") + "</div>";
    }
    html += '<div class="ap-hive"><div class="ap-stage">' + apStack(h, 1.9, true, ap.box) + '<div class="ap-readout" id="apReadout">' + (ap.box == null ? apBoxHint(h) : apBoxRead(h, ap.box)) + '</div><button type="button" class="btn sm ghost ap-tubtn" data-apact="trueup">TRUE UP STACK</button></div>';
    html += '<div class="ap-info"><div class="ap-hhead"><div><h2>' + esc(h.name.toUpperCase()) + "</h2><p>" + [h.queen ? "Queen " + esc(h.queen) : "", cs.length + (cs.length === 1 ? " check" : " checks"), lbl ? (Math.round(lbl * 10) / 10) + " lb honey" : ""].filter(Boolean).join(" · ") + "</p></div>" +
      '<button type="button" class="btn" data-apact="new">' + (ap.draft && apId(ap.draft.hive) === h.id ? "RESUME CHECK" : "+ NEW CHECK") + "</button></div>";
    if (last && last.next) html += '<div class="ap-next"><span class="ap-lab">NEXT TIME · FROM ' + apDay(last.day) + "</span><p>" + esc(last.next) + "</p></div>";
    html += cs.length ? '<div class="ap-checks" role="list">' + cs.map(function (c) {
      var pills = [];
      if (c.honey) pills.push('<span class="pill honey">' + (Math.round(c.honey * 10) / 10) + " LB</span>");
      if (c.issue) pills.push('<span class="pill warn">ISSUE</span>');
      if (c.mites != null) pills.push('<span class="pill ' + (c.mites < AP_MITE_OK ? "ok" : c.mites <= AP_MITE_TREAT ? "warn" : "bad") + '">MITES ' + c.mites + "%</span>");
      if (c.pending) pills.push('<span class="pill">NOT SAVED YET</span>');
      return '<button type="button" role="listitem" class="ap-crow' + (ap.fresh && apId(ap.fresh) === apId(c.id) ? " fresh" : "") + '" data-apcheck="' + esc(c.id) + '"><span class="d">' + apDay(c.day) + '</span><span class="s">' + esc(c.did || c.frames || c.queen || "Check") + '</span><span class="p">' + pills.join("") + '<span class="go" aria-hidden="true">›</span></span></button>';
    }).join("") + "</div>" : '<div class="empty">No checks yet. + NEW CHECK starts the first.</div>';
    var ab = h.data.about || {};
    var rows = [["STARTED", h.day ? dLabel(parseYmd(h.day)) + " " + h.day.slice(0, 4) : ""], ["QUEEN", h.queen], ["SOURCE", ab.source], ["FOUNDATION", ab.foundation], ["EQUIPMENT", ab.equipment], ["PLACE", ab.place], ["NOTES", h.notes]].filter(function (r) { return r[1]; });
    html += '<details class="ap-about" id="apAbout"' + (ap.aboutOpen ? " open" : "") + '><summary>ABOUT THIS HIVE</summary><dl class="ap-kv">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>" +
      '<div class="btnrow ap-pad2"><button type="button" class="btn sm ghost" data-apact="edithive">EDIT HIVE</button>' + (ap.data.url ? '<a class="btn sm ghost" href="' + esc(ap.data.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div></details></div></div>";
    return html;
  }

  /* level 3: one check */
  var AP_FACTS = [["queen", "QUEEN AND BROOD"], ["frames", "FRAMES"], ["stores", "STORES"], ["feed", "FEED"], ["mood", "TEMPERAMENT"], ["pests", "PESTS"]];
  function apCheckHtml() {
    var h = apHive(ap.hive), cs = apChecks(h.id), i = cs.map(function (c) { return apId(c.id); }).indexOf(apId(ap.check)), c = cs[i];
    var f = function (lab, v, cls) { return v ? '<div class="ap-fact' + (cls ? " " + cls : "") + '"><span class="ap-lab">' + lab + "</span><p>" + esc(v) + "</p></div>" : ""; };
    var html = apCrumbs([["APIARY", "yard"], [h.name.toUpperCase(), "hive"], [apDay(c.day)]]);
    var armed = ap.arm === "del:" + c.id && Date.now() - ap.armAt < 4000;
    html += '<div class="ap-hive"><div class="ap-stage">' + apStack(h, 1.3, false) + '<div class="ap-readout"><b>' + esc(h.name.toUpperCase()) + "</b><span>" + (h.queen ? "Queen " + esc(h.queen) : "") + "</span></div></div>";
    html += '<article class="ap-card"><div><span class="ap-lab">' + esc([c.who, apAgo(c.day)].filter(Boolean).join(" · ").toUpperCase()) + "</span><h2>" + esc(dLabel(parseYmd(c.day))) + " " + c.day.slice(0, 4) + "</h2></div>" +
      '<div class="ap-facts">' + AP_FACTS.map(function (x) { return f(x[1], c[x[0]]); }).join("") +
      (c.mites != null ? f("MITE LOAD", c.mites + "%" + (c.mites < AP_MITE_OK ? " · fine" : c.mites <= AP_MITE_TREAT ? " · watch" : " · treat")) : "") +
      (c.honey ? f("HONEY", (Math.round(c.honey * 10) / 10) + " lb") : "") +
      f("WHAT YOU DID", c.did, "wide") + f("ISSUE", c.issue, "wide issue") + f("NOTES", c.notes, "wide") + f("NEXT TIME", c.next, "wide") + "</div>" +
      (c.pending ? '<small class="muted">Not in Notion yet. It goes when the bridge answers.</small>' : "") +
      '<div class="ap-navrow"><div class="btnrow"><button type="button" class="chip sm" data-apstep="1"' + (i >= cs.length - 1 ? " disabled" : "") + '>‹ EARLIER</button><button type="button" class="chip sm" data-apstep="-1"' + (i <= 0 ? " disabled" : "") + ">LATER ›</button></div>" +
      '<div class="btnrow"><button type="button" class="btn sm ghost" data-apact="editcheck">EDIT</button><button type="button" class="btn sm ' + (armed ? "warn" : "ghost") + '" data-apdel="' + esc(c.id) + '">' + (armed ? "TAP AGAIN TO DELETE" : "DELETE") + "</button></div></div></article></div>";
    return html;
  }

  /* level 3: a new check, one short step at a time */
  function apNewDraft(h) {
    return { hive: h.id, cid: newCid(), day: ymd(new Date()), step: 0, who: "", queen: {}, pattern: "", mood: "", boxes: JSON.parse(JSON.stringify(h.data.boxes)), counted: {}, capd: {}, moves: [],
      honey: "", pollen: "", heft: "", feeder: "", method: "", mites: 0, beetles: 0, other: {}, did: {}, harvest: 0, issue: "", notes: "", next: "", remind: false };
  }
  function apDraftSave() { lsSet(LS_APDRAFT, ap.draft); }
  function apPick(key, opts, multi, color) {
    var D = ap.draft;
    return '<div class="btnrow ap-picks" role="group">' + opts.map(function (o) {
      var on = multi ? !!D[key][o] : D[key] === o;
      return '<button type="button" class="chip sm" style="--c: var(--' + (color || "chrome-b") + ')" data-apf="' + key + '" data-apv="' + esc(String(o)) + '"' + (multi ? ' data-apmulti="1"' : "") + ' aria-pressed="' + on + '">' + esc(typeof o === "number" ? o + "%" : o) + "</button>";
    }).join("") + "</div>";
  }
  function apStepper(key, idx, val, lab, unit, max) {
    return '<div class="ap-sline"><span class="ap-lab">' + lab + '</span><span class="ap-stepper"><button type="button" data-apn="' + key + '" data-api="' + idx + '" data-apd="-1" aria-label="Less">−</button><output class="tnum">' + (val == null ? "–" : val) + '</output><button type="button" data-apn="' + key + '" data-api="' + idx + '" data-apd="1" aria-label="More">+</button></span>' + (unit ? '<span class="muted">' + unit + "</span>" : "") + "</div>";
  }
  function apMitePct(D) { return D.method === "SUGAR ROLL" || D.method === "ALCOHOL WASH" ? Math.round(D.mites / 3 * 10) / 10 : null; }
  function apNewHtml() {
    var h = apHive(ap.hive), D = ap.draft, q = "", last = apChecks(h.id)[0];
    D.capd = D.capd || {};
    if (D.step === 0) q = "<h3>WHAT DID YOU SEE?</h3>" + '<span class="ap-lab">PICK ALL THAT APPLY</span>' + apPick("queen", ["QUEEN", "EGGS", "LARVAE", "CAPPED BROOD", "QUEEN CELLS", "NONE OF THESE"], true) +
      '<span class="ap-lab">BROOD PATTERN</span>' + apPick("pattern", ["SOLID", "PATCHY", "SPOTTY"]) + '<span class="ap-lab">TEMPERAMENT</span>' + apPick("mood", ["CALM", "BUSY", "RUNNY", "DEFENSIVE"], false, "ok") +
      '<label class="ap-lab" for="apWho">WHO WAS THERE</label><input type="text" id="apWho" data-apt="who" maxlength="200" placeholder="Solo" value="' + esc(D.who) + '" autocomplete="off">';
    if (D.step === 1) {
      q = "<h3>HOW FAR HAVE THEY DRAWN?</h3>";
      for (var i = D.boxes.length - 1; i >= 0; i--) {   /* bottom first, the way you work down to it */
        var b = D.boxes[i], P = AP_PIECES[b.k], nm = apBoxName(D.boxes, i).toUpperCase();
        if (!P.n) continue;
        q += apStepper("drawn", i, D.counted[i] ? b.drawn : null, nm + (b.k === "super" ? " · FILLED" : ""), D.counted[i] ? "of " + apN(b) + " frames" : "last " + (b.drawn == null ? "not counted" : b.drawn + " of " + apN(b)) + " · tap + or − to count", apN(b));
        if (P.cap) q += '<span class="ap-lab">' + nm + " · CAPPED" + (D.capd[i] ? "" : " · LAST " + (b.fill == null ? "NOT LOGGED" : Math.round(b.fill * 100) + "%")) + '</span><div class="btnrow ap-picks">' +
          AP_CAPS.map(function (v) { return '<button type="button" class="chip sm" style="--c: var(--hero)" data-apfill="' + i + '" data-apv="' + v + '" aria-pressed="' + (!!D.capd[i] && Math.round((D.boxes[i].fill || 0) * 100) === v) + '">' + v + "%</button>"; }).join("") + "</div>";
      }
      q += '<span class="ap-lab">BOXES ON OR OFF</span><div class="btnrow">' + AP_ADD.map(function (k) { return '<button type="button" class="chip sm" data-apbx="' + k + '"' + (apCount(D.boxes, k) >= AP_PIECES[k].max ? " disabled" : "") + ">+ " + (k === "excluder" ? "EXCLUDER" : AP_PIECES[k].nm.toUpperCase()) + "</button>"; }).join("") +
        (D.boxes.length > 1 ? '<button type="button" class="chip sm" data-apbx="off">TOP PIECE OFF</button>' : "") + "</div>" + (D.moves.length ? '<small class="muted">' + esc(D.moves.join(", ")) + "</small>" : "") +
        '<small class="muted">The stack on the left follows what you enter. Add the second deep at 7 to 8 of 10 frames drawn.</small>';
    }
    if (D.step === 2) q = "<h3>STORES AND FEED</h3>" + [["honey", "HONEY", ["LOW", "OK", "HEAVY"]], ["pollen", "POLLEN", ["LOW", "OK", "HEAVY"]], ["heft", "HEFT", ["LIGHT", "OK", "HEAVY"]], ["feeder", "FEEDER", ["FULL", "LOW", "EMPTY", "REFILLED 1:1", "REFILLED 2:1", "NO FEEDER"]]]
      .map(function (r) { return '<div class="ap-sline"><span class="ap-lab">' + r[1] + "</span>" + apPick(r[0], r[2]) + "</div>"; }).join("");
    if (D.step === 3) {
      var pct = apMitePct(D);
      q = "<h3>MITES AND PESTS</h3>" + '<span class="ap-lab">MITE CHECK</span>' + apPick("method", ["SUGAR ROLL", "ALCOHOL WASH", "STICKY BOARD"], false, "bad") +
        (D.method ? apStepper("mites", 0, D.mites, "MITES COUNTED", D.method === "STICKY BOARD" ? "on the board" : "in ½ cup of bees (about 300)", 999) : "") +
        (pct != null ? '<div class="ap-sline"><span class="ap-lab">LOAD</span><span class="ap-pct tnum ' + (pct < AP_MITE_OK ? "ok" : pct <= AP_MITE_TREAT ? "warn" : "bad") + '">' + pct + '%</span><span class="muted">under ' + AP_MITE_OK + "% fine · " + AP_MITE_OK + " to " + AP_MITE_TREAT + "% watch · over " + AP_MITE_TREAT + "% treat</span></div>" : "") +
        apStepper("beetles", 0, D.beetles, "BEETLES IN TRAPS", "", 999) + '<span class="ap-lab">ANYTHING ELSE</span>' + apPick("other", ["WAX MOTH", "ANTS", "CHALKBROOD", "DEFORMED WINGS", "ROBBING"], true, "warn");
    }
    if (D.step === 4) q = "<h3>WHAT YOU DID, AND NEXT TIME</h3>" + apPick("did", ["FED", "PATTIES", "TRAPS REFRESHED", "TRAPS MOVED", "REDUCER", "MOUSE GUARD", "TREATED", "PULLED HONEY"], true, "chrome-c") +
      (D.did["PULLED HONEY"] ? apStepper("harvest", 0, D.harvest, "HONEY", "lb filtered", 999) : "") +
      '<label class="ap-lab" for="apIssue">ISSUE</label><input type="text" id="apIssue" data-apt="issue" maxlength="300" placeholder="Anything wrong, in a line" value="' + esc(D.issue) + '" autocomplete="off">' +
      '<label class="ap-lab" for="apNotes">NOTES</label><textarea id="apNotes" data-apt="notes" rows="3" maxlength="2000" placeholder="What stood out, in your words…">' + esc(D.notes) + "</textarea>" +
      '<label class="ap-lab" for="apNext">NEXT TIME</label><textarea id="apNext" data-apt="next" rows="2" maxlength="2000" placeholder="Shows on this hive until the next check…">' + esc(D.next) + "</textarea>" +
      (canPlan() ? '<div class="btnrow"><button type="button" class="chip sm" data-apremind="1" aria-pressed="' + !!D.remind + '">REMIND ME IN ' + AP_REMIND_DAYS + " DAYS</button></div>" + (D.remind ? '<small class="muted">Adds "Hive check: ' + esc(h.name) + '" to the Master Task List for ' + esc(dLabel(addDays(new Date(), AP_REMIND_DAYS))) + ".</small>" : "") : "");
    var html = apCrumbs([["APIARY", "yard"], [h.name.toUpperCase(), "hive"], ["NEW CHECK"]]);
    html += '<div class="ap-hive"><div class="ap-stage">' + apStack(Object.assign({}, h, { data: Object.assign({}, h.data, { boxes: D.boxes }) }), 1.3, false) + '<div class="ap-readout"><b>' + esc(dLabel(new Date())) + "</b><span>" + (last ? "Last check " + apDay(last.day) + " · " + apAgo(last.day) : "The first check for this hive") + "</span></div></div>";
    html += '<article class="ap-card"><nav class="ap-steps" aria-label="Steps">' + AP_STEPS.map(function (s, ix) { return '<button type="button" data-apgoto="' + ix + '"' + (ix === D.step ? ' aria-current="step"' : "") + (ix < D.step ? ' class="done"' : "") + "><i></i>" + s + "</button>"; }).join("") + "</nav>" +
      '<div class="ap-q">' + q + '</div><div class="ap-navrow"><button type="button" class="btn sm ghost" data-apact="' + (D.step ? "back" : "cancel") + '">' + (D.step ? "‹ BACK" : "CANCEL") + "</button>" +
      (D.step < AP_STEPS.length - 1 ? '<button type="button" class="btn sm" data-apact="fwd">NEXT ›</button>' : '<button type="button" class="btn sm" data-apact="save">SAVE CHECK</button>') + "</div></article></div>";
    return html;
  }
  /* The picks, written out as the plain sentences Notion shows. */
  function apSaveDraft() {
    var h = apHive(ap.hive), D = ap.draft, keys = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }); };
    var seen = keys(D.queen), other = keys(D.other), did = keys(D.did).filter(function (k) { return k !== "PULLED HONEY"; }).map(apOne);
    var frames = [];
    D.capd = D.capd || {};
    for (var i = D.boxes.length - 1; i >= 0; i--) { var ft = apPieceText(D.boxes, i, { d: D.counted[i], f: D.capd[i] }); if (ft) frames.push(ft); }
    var lvl = { FULL: "FULL", "REFILLED 1:1": "FULL", "REFILLED 2:1": "FULL", LOW: "LOW", EMPTY: "EMPTY" }[D.feeder];
    if (lvl) D.boxes.forEach(function (b) { if (b.k === "feeder") b.level = lvl; });
    var pct = apMitePct(D), stores = [D.honey && "honey " + D.honey.toLowerCase(), D.pollen && "pollen " + D.pollen.toLowerCase(), D.heft && "heft " + D.heft.toLowerCase()].filter(Boolean).join(", ");
    var pests = [D.method ? apOne(D.method) + ": " + D.mites + " mites" + (pct != null ? " (" + pct + "%)" : "") : "", D.beetles ? D.beetles + " beetles in traps" : "", other.length ? other.map(apOne).join(", ") : ""].filter(Boolean).join("; ");
    if (D.did["PULLED HONEY"]) did.push("Pulled honey" + (D.harvest ? ": " + D.harvest + " lb" : ""));
    var item = { kind: "check", cid: D.cid, hive: apId(D.hive), day: D.day, who: D.who.trim() || "Solo",
      queen: seen.length ? apOne(seen.join(", ")) + (D.pattern ? "; " + D.pattern.toLowerCase() + " pattern" : "") : D.pattern ? apOne(D.pattern) + " pattern" : "",
      frames: frames.join("; "), stores: apOne(stores), feed: D.feeder ? apOne(D.feeder) : "", mood: D.mood ? apOne(D.mood) : "", pests: pests,
      did: D.moves.concat(did).join("; "), issue: D.issue.trim(), notes: D.notes.trim(), next: D.next.trim(), mites: pct, honey: D.harvest || null,
      data: { v: 1, deeps: D.boxes.filter(function (b) { return b.k === "deep"; }).map(function (b) { return b.drawn; }).reverse(), picks: { queen: seen, pattern: D.pattern, mood: D.mood, honey: D.honey, pollen: D.pollen, heft: D.heft, feeder: D.feeder, method: D.method, mites: D.method ? D.mites : null, beetles: D.beetles, other: other, did: keys(D.did) } },
      boxes: D.boxes };
    apQueue("c:cid:" + D.cid, { action: "apiarysave", item: item });
    if (D.remind && canPlan()) {
      var areas = (state.tasks[ymd(new Date())] || {}).areas || [], area = areas.filter(function (a) { return /bee/i.test(a); })[0] || areas.filter(function (a) { return taskArea(a) === "farm"; })[0] || null;
      apiPost({ action: "addtask", task: { cid: newCid(), title: "Hive check: " + h.name, area: area, priority: null, day: ymd(addDays(new Date(), AP_REMIND_DAYS)) } })
        .then(function () { toast("Reminder added for " + dLabel(addDays(new Date(), AP_REMIND_DAYS))); })
        .catch(function (err) { toast("Check saved. Reminder not added: " + describeTasks(err)); });
    }
    ap.fresh = "cid:" + D.cid; ap.draft = null; lsDel(LS_APDRAFT); ap.box = null;
  }

  /* editing a check: every field as plain text, the way Notion holds it */
  var AP_EDIT = [["who", "WHO"], ["queen", "QUEEN AND BROOD"], ["frames", "FRAMES"], ["stores", "STORES"], ["feed", "FEED"], ["mood", "TEMPERAMENT"], ["pests", "PESTS"], ["did", "WHAT YOU DID"], ["issue", "ISSUE"], ["notes", "NOTES"], ["next", "NEXT TIME"]];
  function apCheckEditHtml() {
    var h = apHive(ap.hive), c = apChecks(h.id).filter(function (x) { return apId(x.id) === apId(ap.check); })[0], F = ap.form || (ap.form = Object.assign({ forId: c.id }, c));
    var html = apCrumbs([["APIARY", "yard"], [h.name.toUpperCase(), "hive"], [apDay(c.day), "check"], ["EDIT"]]);
    html += '<article class="ap-card ap-form"><h2>EDIT CHECK</h2><label class="ap-lab" for="apE-day">DATE</label><input type="date" id="apE-day" data-ape="day" value="' + esc(F.day) + '">' +
      AP_EDIT.map(function (r) { return '<label class="ap-lab" for="apE-' + r[0] + '">' + r[1] + '</label><textarea id="apE-' + r[0] + '" data-ape="' + r[0] + '" rows="1" maxlength="2000">' + esc(F[r[0]] || "") + "</textarea>"; }).join("") +
      '<div class="ap-two"><div><label class="ap-lab" for="apE-mites">MITES (%)</label><input type="number" id="apE-mites" data-ape="mites" min="0" max="100" step="0.1" inputmode="decimal" value="' + (F.mites == null ? "" : F.mites) + '"></div>' +
      '<div><label class="ap-lab" for="apE-honey">HONEY (LB)</label><input type="number" id="apE-honey" data-ape="honey" min="0" max="1000" step="0.1" inputmode="decimal" value="' + (F.honey == null ? "" : F.honey) + '"></div></div>' +
      '<div class="ap-navrow"><button type="button" class="btn sm ghost" data-apgo="check">CANCEL</button><button type="button" class="btn sm" data-apact="savecheck">SAVE</button></div></article>';
    return html;
  }
  function apSaveCheckEdit() {
    var F = ap.form, numAt = function (v) { return v === "" || v == null || isNaN(+v) ? null : +v; };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(F.day || "")) { toast("Pick a date first."); return false; }
    var item = { kind: "check", hive: apId(F.hive), day: F.day, mites: numAt(F.mites), honey: numAt(F.honey), data: F.data || {} };
    if (String(F.forId).indexOf("cid:") === 0) item.cid = F.forId.slice(4); else item.id = F.forId;
    AP_EDIT.forEach(function (r) { item[r[0]] = String(F[r[0]] || "").trim(); });
    var prior = ap.q["c:" + F.forId] && ap.q["c:" + F.forId].body.item;
    if (prior && prior.boxes) item.boxes = prior.boxes;
    apQueue("c:" + F.forId, { action: "apiarysave", item: item });
    ap.form = null;
    return true;
  }

  /* adding or editing a hive */
  function apHiveForm(h) {
    if (!h) return { forId: null, name: "", queen: "", day: ymd(new Date()), source: "", foundation: "", equipment: "", place: "", notes: "", paint: 0, deeps: 1, supers: 0, boxes: [{ k: "deep", drawn: null }] };
    var ab = h.data.about || {}, pi = AP_PAINTS.map(function (p) { return p[1] + p[2]; }).indexOf((h.data.paint || "") + (h.data.paint2 || ""));
    return { forId: h.id, name: h.name, queen: h.queen || "", day: h.day || "", source: ab.source || "", foundation: ab.foundation || "", equipment: ab.equipment || "", place: ab.place || "", notes: h.notes || "",
      paint: pi, boxes: JSON.parse(JSON.stringify(h.data.boxes)) };
  }
  /* A new hive's starting boxes, not counted yet. Later changes go through TRUE UP STACK. */
  function apFormBoxes(F, kind, d) {
    var bs = F.boxes, brood = apCount(bs, "deep") + apCount(bs, "medium");
    if (d > 0 && apCount(bs, kind) < AP_PIECES[kind].max) { var at = apInsert(bs, kind); bs[at].drawn = null; if (AP_PIECES[kind].cap) bs[at].fill = null; }
    if (d < 0 && apCount(bs, kind) && (kind === "super" || brood > 1)) bs.splice(bs.map(function (b) { return b.k; }).indexOf(kind), 1);
  }
  function apHiveEditHtml() {
    var F = ap.form, h = F.forId ? apHive(F.forId) : null, armed = h && ap.arm === "delh:" + h.id && Date.now() - ap.armAt < 4000;
    var nD = apCount(F.boxes, "deep"), nM = apCount(F.boxes, "medium"), nS = apCount(F.boxes, "super"), pv = AP_PAINTS[F.paint] || ["", (h && h.data.paint) || "#2f4a8f", (h && h.data.paint2) || "#b4423c"];
    var html = apCrumbs(h ? [["APIARY", "yard"], [h.name.toUpperCase(), "hive"], ["EDIT"]] : [["APIARY", "yard"], ["NEW HIVE"]]);
    var fld = function (k, lab, ph, max) { return '<label class="ap-lab" for="apH-' + k + '">' + lab + '</label><input type="text" id="apH-' + k + '" data-aph="' + k + '" maxlength="' + (max || 200) + '" placeholder="' + esc(ph) + '" value="' + esc(F[k]) + '" autocomplete="off">'; };
    html += '<div class="ap-hive"><div class="ap-stage">' + apStack({ id: "form", data: { paint: pv[1], paint2: pv[2], boxes: F.boxes } }, 1.6, false) + '<div class="ap-readout"><b>' + esc((F.name || "NEW HIVE").toUpperCase()) + "</b><span>" + [nD ? nD + (nD === 1 ? " deep" : " deeps") : "", nM ? nM + (nM === 1 ? " medium" : " mediums") : "", nS ? nS + (nS === 1 ? " super" : " supers") : ""].filter(Boolean).join(", ") + "</span></div></div>";
    html += '<article class="ap-card ap-form"><h2>' + (h ? "EDIT HIVE" : "NEW HIVE") + "</h2>" + fld("name", "NAME", "e.g. Thor", 60) + fld("queen", "QUEEN", "Her name, if she has one", 60) +
      '<label class="ap-lab" for="apH-day">STARTED</label><input type="date" id="apH-day" data-aph="day" value="' + esc(F.day) + '">' +
      fld("source", "SOURCE", "Package, nuc, split, swarm") + fld("foundation", "FOUNDATION", "Plastic, wax, foundationless") + fld("equipment", "EQUIPMENT", "Bottom board, feeder, covers") + fld("place", "PLACE", "Where it sits in the yard") +
      '<label class="ap-lab" for="apH-notes">NOTES</label><textarea id="apH-notes" data-aph="notes" rows="2" maxlength="2000">' + esc(F.notes) + "</textarea>" +
      '<span class="ap-lab">PAINT</span><div class="btnrow ap-paints" role="group" aria-label="Paint">' + AP_PAINTS.map(function (p, i) { return '<button type="button" class="ap-swatch" data-appaint="' + i + '" aria-pressed="' + (F.paint === i) + '" aria-label="' + p[0] + '"><i style="background:' + p[1] + '"></i><i style="background:' + p[2] + '"></i></button>'; }).join("") + "</div>" +
      '<span class="ap-lab">BOXES</span>' + (h ? '<small class="muted">Boxes, frame counts, the feeder and the excluder change with TRUE UP STACK on the hive page.</small>' :
        apStepper("fdeep", 0, nD, "DEEPS", "", 4) + apStepper("fmedium", 0, nM, "MEDIUMS", "", 4) + apStepper("fsuper", 0, nS, "SUPERS", "", 5)) +
      '<div class="ap-navrow"><div class="btnrow">' + (h ? '<button type="button" class="btn sm ' + (armed ? "warn" : "ghost") + '" data-apdelhive="' + esc(h.id) + '">' + (armed ? "TAP AGAIN TO REMOVE" : "REMOVE HIVE") + "</button>" : "") + "</div>" +
      '<div class="btnrow"><button type="button" class="btn sm ghost" data-apgo="' + (h ? "hive" : "yard") + '">CANCEL</button><button type="button" class="btn sm" data-apact="savehive">' + (h ? "SAVE" : "ADD TO THE YARD") + "</button></div></div>" +
      (h ? '<small class="muted">REMOVE HIVE puts it and nothing else in Notion\'s trash; its checks stay in the database.</small>' : "") + "</article></div>";
    return html;
  }
  function apSaveHive() {
    var F = ap.form, h = F.forId ? apHive(F.forId) : null, name = F.name.trim();
    if (!name) { toast("Give the hive a name first."); return null; }
    var pv = AP_PAINTS[F.paint], data = Object.assign({}, h ? h.data : { v: 1, order: apHives().reduce(function (m, x) { return Math.max(m, +x.data.order || 0); }, 0) + 1 });
    if (pv) { data.paint = pv[1]; data.paint2 = pv[2]; }
    data.boxes = F.boxes;
    data.about = Object.assign({}, data.about, { source: F.source.trim(), foundation: F.foundation.trim(), equipment: F.equipment.trim(), place: F.place.trim() });
    var item = { kind: "hive", name: name, queen: F.queen.trim(), day: F.day || null, notes: F.notes.trim(), data: data }, key;
    if (h && String(h.id).indexOf("cid:") !== 0) { item.id = h.id; key = "h:" + h.id; }
    else { item.cid = h ? h.id.slice(4) : newCid(); key = "h:cid:" + item.cid; }
    apQueue(key, { action: "apiarysave", item: item });
    ap.form = null;
    return item.id || "cid:" + item.cid;
  }
  function apSaveYard(mut) {
    var y = apYard() || { name: "Apiary", notes: "", data: { list: [] } }, data = JSON.parse(JSON.stringify(y.data || { list: [] }));
    mut(data);
    var item = { kind: "yard", name: y.name || "Apiary", notes: y.notes || "", day: y.day || null, data: data };
    if (y.id && String(y.id).indexOf("cid:") !== 0) item.id = y.id; else item.cid = y.id ? y.id.slice(4) : newCid();
    apQueue("y", { action: "apiarysave", item: item });
    render(true);
  }

  /* --- taps --- */
  function apClick(b) {
    var d = b.dataset;
    if (d.aiapiary) { if (d.aiapiary === "1") lsSet(LS_AIAPIARY, true); else lsDel(LS_AIAPIARY); askReshare(); render(true); return true; }
    if (d.apretry) { ap.qErr = null; flushApiary(); render(true); return true; }
    if (d.aprhythm) {   /* days between checks, in steps that fit the size: 3 to 14 by one, then 16, 18, 21, then by weeks to 90 */
      var rp = d.aprhythm.split(":"), R = hiveRhythm(), S = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 90], v = R[rp[0]], i = 0;
      while (i < S.length - 1 && S[i] < v) i++;
      R[rp[0]] = +rp[1] > 0 ? S[Math.min(S.length - 1, S[i] > v ? i : i + 1)] : S[Math.max(0, i - 1)];
      lsSet(LS_HIVERHYTHM, R); ap.yearOpen = true; render(true); return true;
    }
    if (state.screen !== "apiary") return false;
    var D = ap.draft, F = ap.form;
    if (d.aphive) { ap.hive = d.aphive; ap.box = null; ap.fresh = null; apNav("hive", b.querySelector(".ap-stack")); return true; }
    if (d.apgo) { if (d.apgo !== "check") ap.form = null; ap.tu = null; if (d.apgo === "yard") ap.fresh = null; ap.box = null; apNav(d.apgo, apStackEl()); return true; }
    var T = ap.view === "stackedit" ? ap.tu : null;
    if (d.apbox != null && T) { T.sel = T.sel === +d.apbox ? null : +d.apbox; ap.arm = null; render(true); return true; }
    if (d.aptusel != null && T) { T.sel = T.sel === +d.aptusel ? null : +d.aptusel; ap.arm = null; render(true); return true; }
    if (d.aptuadd && T) { if (apCount(T.boxes, d.aptuadd) < AP_PIECES[d.aptuadd].max) T.sel = apInsert(T.boxes, d.aptuadd); render(true); return true; }
    if (T && T.sel != null && T.boxes[T.sel]) {
      var tb = T.boxes[T.sel];
      if (d.aptun) { tb.n = +d.aptun; if (tb.drawn != null) tb.drawn = Math.min(tb.drawn, tb.n); render(true); return true; }
      if (d.aptucap != null) { tb.fill = tb.fill != null && Math.round(tb.fill * 100) === +d.aptucap ? null : +d.aptucap / 100; render(true); return true; }
      if (d.aptulevel) { tb.level = tb.level === d.aptulevel ? null : d.aptulevel; render(true); return true; }
      if (d.aptumove) { var to = T.sel + +d.aptumove; if (to >= 0 && to < T.boxes.length) { T.boxes.splice(to, 0, T.boxes.splice(T.sel, 1)[0]); T.sel = to; } render(true); return true; }
      if (d.aptux != null) {
        if (ap.arm === "tux:" + T.sel && Date.now() - ap.armAt < 4000) { if (T.boxes.length > 1) T.boxes.splice(T.sel, 1); T.sel = null; ap.arm = null; }
        else { ap.arm = "tux:" + T.sel; ap.armAt = Date.now(); setTimeout(function () { if (state.screen === "apiary" && ap.view === "stackedit") render(true); }, 4100); }
        render(true); return true;
      }
    }
    if (d.aptulog && T) { T.log = !T.log; render(true); return true; }
    if (d.apbox != null) {
      var h = apHive(ap.hive); ap.box = ap.box === +d.apbox ? null : +d.apbox;
      document.querySelectorAll("#content .ap-stack [data-apbox]").forEach(function (x) { x.classList.toggle("sel", +x.dataset.apbox === ap.box); });
      $("apReadout").innerHTML = ap.box == null ? apBoxHint(h) : apBoxRead(h, ap.box);
      return true;
    }
    if (d.apcheck) { ap.check = d.apcheck; apNav("check", apStackEl()); return true; }
    if (d.apstep) { var cs = apChecks(ap.hive), si = cs.map(function (c) { return apId(c.id); }).indexOf(apId(ap.check)) + +d.apstep; if (cs[si]) { ap.check = cs[si].id; ap.arm = null; render(false); } return true; }
    if (d.apnextcheck) { ap.hive = d.apnextcheck; ap.fresh = null; ap.draft = apNewDraft(apHive(ap.hive)); apDraftSave(); apNav("new", null); return true; }
    if (d.apdel) {
      if (ap.arm === "del:" + d.apdel && Date.now() - ap.armAt < 4000) {
        if (d.apdel.indexOf("cid:") === 0) delete ap.q["c:" + d.apdel]; else { delete ap.q["c:" + d.apdel]; apQueue("x:" + d.apdel, { action: "apiaryremove", id: d.apdel }); }
        lsSet(LS_APIARYQ, ap.q); toast("Check deleted. It's in Notion's trash if you need it back."); apNav("hive", apStackEl());
      } else { ap.arm = "del:" + d.apdel; ap.armAt = Date.now(); render(true); setTimeout(function () { if (state.screen === "apiary") render(true); }, 4100); }
      return true;
    }
    if (d.apdelhive) {
      if (ap.arm === "delh:" + d.apdelhive && Date.now() - ap.armAt < 4000) {
        var hid = d.apdelhive;
        if (hid.indexOf("cid:") === 0) delete ap.q["h:" + hid]; else { delete ap.q["h:" + hid]; apQueue("x:" + hid, { action: "apiaryremove", id: hid }); }
        lsSet(LS_APIARYQ, ap.q); ap.form = null; ap.hive = null; toast("Hive removed. Its checks stay in Notion."); apNav("yard", null);
      } else { ap.arm = "delh:" + d.apdelhive; ap.armAt = Date.now(); render(true); setTimeout(function () { if (state.screen === "apiary") render(true); }, 4100); }
      return true;
    }
    if (d.aplist != null) { apSaveYard(function (y) { var it = y.list[+d.aplist]; if (it) it.done = !it.done; }); return true; }
    if (d.aplistx != null) { apSaveYard(function (y) { y.list.splice(+d.aplistx, 1); }); return true; }
    if (d.appaint != null && F) { F.paint = +d.appaint; render(true); return true; }
    if (d.apremind && D) { D.remind = !D.remind; apDraftSave(); render(true); return true; }
    if (d.apgoto != null && D) { D.step = +d.apgoto; apDraftSave(); render(false); return true; }
    if (d.apbx && D) {
      var bs = D.boxes; D.capd = D.capd || {};
      if (d.apbx === "off") { if (bs.length > 1) { var off = bs.shift(); D.counted = apShiftKeys(D.counted, 0, -1); D.capd = apShiftKeys(D.capd, 0, -1); D.moves.push("Took off the top " + AP_PIECES[off.k].nm.toLowerCase()); } }
      else if (AP_PIECES[d.apbx] && apCount(bs, d.apbx) < AP_PIECES[d.apbx].max) {
        var at = apSlot(bs, d.apbx);
        D.counted = apShiftKeys(D.counted, at, 1); D.capd = apShiftKeys(D.capd, at, 1);
        apInsert(bs, d.apbx);
        if (AP_PIECES[d.apbx].n) D.counted[at] = 1;
        if (AP_PIECES[d.apbx].cap) D.capd[at] = 1;
        D.moves.push("Added a " + AP_PIECES[d.apbx].nm.toLowerCase());
      }
      apDraftSave(); render(true); return true;
    }
    if (d.apfill != null && D) { D.capd = D.capd || {}; D.boxes[+d.apfill].fill = +d.apv / 100; D.capd[+d.apfill] = 1; apDraftSave(); render(true); return true; }
    if (d.apn) {
      var step = +d.apd;
      if (d.apn === "fdeep" || d.apn === "fmedium" || d.apn === "fsuper") { if (F) { apFormBoxes(F, d.apn.slice(1), step); render(true); } return true; }
      if (d.apn === "tudrawn") { if (ap.tu) { var tub = ap.tu.boxes[+d.api]; tub.drawn = Math.max(0, Math.min(apN(tub), (tub.drawn == null ? (step > 0 ? 0 : 1) : tub.drawn) + step)); render(true); } return true; }
      if (!D) return true;
      if (d.apn === "drawn") {
        var bx = D.boxes[+d.api];
        if (!D.counted[+d.api]) { D.counted[+d.api] = 1; bx.drawn = bx.drawn == null ? (step > 0 ? 1 : 0) : Math.max(0, Math.min(apN(bx), bx.drawn + step)); }
        else bx.drawn = Math.max(0, Math.min(apN(bx), (bx.drawn || 0) + step));
      } else D[d.apn] = Math.max(0, Math.min(999, (+D[d.apn] || 0) + step));
      apDraftSave(); render(true); return true;
    }
    if (d.apf && D) {
      var fv = d.apv;
      if (d.apmulti) {
        if (d.apf === "queen" && fv === "NONE OF THESE") D.queen = D.queen[fv] ? {} : { "NONE OF THESE": true };
        else { D[d.apf][fv] = !D[d.apf][fv]; if (d.apf === "queen") delete D.queen["NONE OF THESE"]; }
      } else D[d.apf] = D[d.apf] === fv ? "" : fv;   /* tap again to clear */
      if (d.apf === "method" && !D.method) D.mites = 0;
      apDraftSave(); render(true); return true;
    }
    var act = d.apact;
    if (act === "new") { var hh = apHive(ap.hive); if (!ap.draft || apId(ap.draft.hive) !== apId(hh.id)) { ap.draft = apNewDraft(hh); apDraftSave(); } ap.fresh = null; apNav("new", apStackEl()); return true; }
    if (act === "fwd" && D) { D.step = Math.min(AP_STEPS.length - 1, D.step + 1); apDraftSave(); render(false); $("content").scrollTop = 0; return true; }
    if (act === "back" && D) { D.step = Math.max(0, D.step - 1); apDraftSave(); render(false); $("content").scrollTop = 0; return true; }
    if (act === "cancel") { ap.draft = null; lsDel(LS_APDRAFT); apNav("hive", apStackEl()); return true; }
    if (act === "save" && D) { var st = apStackEl(); apSaveDraft(); toast("Check saved to " + apHive(ap.hive).name); apNav("hive", st); return true; }
    if (act === "trueup") { apTrueUpStart(apHive(ap.hive)); ap.fresh = null; apNav("stackedit", apStackEl()); return true; }
    if (act === "savetu" && ap.tu) { var st2 = apStackEl(); if (apSaveTrueUp()) { toast("Stack saved"); apNav("hive", st2); } return true; }
    if (act === "editcheck") { ap.form = null; apNav("checkedit", null); return true; }
    if (act === "savecheck" && F) { if (apSaveCheckEdit()) { toast("Check updated"); apNav("check", null); } return true; }
    if (act === "edithive") { ap.form = apHiveForm(apHive(ap.hive)); apNav("hiveedit", apStackEl()); return true; }
    if (act === "addhive") { ap.form = apHiveForm(null); ap.hive = null; apNav("hiveedit", null); return true; }
    if (act === "savehive" && F) { var nid = apSaveHive(); if (nid) { ap.hive = nid; ap.box = null; toast(F.forId ? "Hive saved" : "Added to the yard"); apNav("hive", null); } return true; }
    if (act === "listadd") {
      var inp = $("apListIn"), t = inp ? inp.value.trim() : "";
      if (!t) { if (inp) inp.focus(); return true; }
      inp.value = ""; apSaveYard(function (y) { y.list.push({ t: t.slice(0, 120), done: false }); });
      return true;
    }
    return false;
  }
  document.addEventListener("input", function (e) {
    var t = e.target, d = t.dataset || {};
    if (d.apt && ap.draft) { ap.draft[d.apt] = t.value; apDraftSave(); return; }
    if (d.ape && ap.form) { ap.form[d.ape] = t.value; return; }
    if (d.aph && ap.form) ap.form[d.aph] = t.value;
    if (d.aptuday && ap.tu) ap.tu.day = t.value;
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "apListIn") { e.preventDefault(); var b = document.querySelector('[data-apact="listadd"]'); if (b) b.click(); } });
  document.addEventListener("toggle", function (e) { if (e.target && e.target.id === "apYear") ap.yearOpen = e.target.open; if (e.target && e.target.id === "apAbout") ap.aboutOpen = e.target.open; }, true);

  /* --- Systems and Ask --- */
  function apiarySection() {
    var on = !!lsGet(LS_AIAPIARY), isWaiting = Object.keys(ap.q).length;
    var html = "<section>" + phead("APIARY", canApiary() ? (ap.err ? "PROBLEM" : "NOTION") : "SETUP");
    if (!canApiary()) return html + stubBox("Needs the 🐝 Apiary database connected in Notion. Steps are in the README under <b>Connect Notion</b>.") + "</section>";
    var nh = apHives().length, nc = apChecks().length;
    html += '<div class="calrow"><span class="st" style="background:var(--farm)"></span><span><b>🐝 Apiary</b><small' + (ap.err ? ' class="errtxt">' + esc(ap.err.msg) : ">" + (ap.data ? nh + (nh === 1 ? " hive · " : " hives · ") + nc + (nc === 1 ? " check" : " checks") : "Not loaded yet") + (isWaiting ? " · " + isWaiting + " waiting to save" : "")) + "</small></span>" +
      '<span class="pill' + (ap.data && !ap.err ? " ok" : ap.err ? " bad" : "") + '">' + (ap.data && !ap.err ? "OK" : ap.err ? "ERROR" : "WAITING") + "</span></div>";
    html += '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND YOUR HIVES</label><div class="btnrow">' +
      '<button type="button" class="chip" data-aiapiary="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-aiapiary="1" aria-pressed="' + on + '">SHARE WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "Ask receives your hives (name, queen, boxes), each hive's last three checks, this year's honey and mite checks, and the open yard list with each question. They go to Anthropic with the question." : "Off: your hives and checks are never sent with Ask questions.") + "</small></section>";
    return html;
  }
  function apiaryBrief() {
    if (!lsGet(LS_AIAPIARY) || !canApiary() || !ap.data) return "";
    var y = String(new Date().getFullYear()), out = [];
    apHives().forEach(function (h) {
      var s = apYear(h.id, y), bx = h.data.boxes.map(function (b, i) { return apPieceText(h.data.boxes, i) || apBoxName(h.data.boxes, i); }).join(", ");
      out.push(h.name + (h.queen ? " (queen " + h.queen + ")" : "") + ": boxes top to bottom " + bx + "; honey " + y + " " + s.honey + " lb; mite checks " + y + " " + s.mites + " of " + AP_MITES_YEAR);
      apChecks(h.id).slice(0, 3).forEach(function (c) {
        out.push("- " + c.day + ": " + [c.queen && "queen/brood " + c.queen, c.frames && "frames " + c.frames, c.stores && "stores " + c.stores, c.feed && "feed " + c.feed, c.pests && "pests " + c.pests, c.mites != null && "mites " + c.mites + "%", c.honey && "honey " + c.honey + " lb", c.did && "did " + c.did, c.issue && "ISSUE " + c.issue, c.next && "next " + c.next].filter(Boolean).join("; "));
      });
    });
    var yard = apYard(), open = yard ? yard.data.list.filter(function (i) { return !i.done; }).map(function (i) { return i.t; }) : [];
    if (open.length) out.push("Yard list (open): " + open.join(" | "));
    if (!out.length) return "";
    var txt = "APIARY (his hives, shared by Timothy's choice):\n" + out.join("\n");
    return txt.length > 4000 ? txt.slice(0, 4000) + "…" : txt;
  }

