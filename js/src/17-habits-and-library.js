  /* ---------- Habits ---------- */
  /* One page per day in the Habits database (bridge 1.14): Meditated, Evening Walk, Water in litres
     (half-bottle steps of a 1 L bottle) and the debit card (Did Not Swipe / Swiped). A tap changes the
     day here at once; the whole day is sent a moment later and kept on this iPad until it lands. */
  var LS_HABITS = "tos.habits.v1", LS_HABITQ = "tos.habitq.v1", LS_HABITCFG = "tos.habitcfg.v1";
  var HABITS = [
    { id: "med", name: "MEDITATED", c: "chrome-c" },
    { id: "walk", name: "EVENING WALK", c: "personal" },
    { id: "water", name: "WATER", c: "work" },
    { id: "card", name: "NO CARD SWIPE", c: "chrome-b" }
  ];
  var WATER_GOALS = [2, 2.5, 3, 3.5, 4];
  var hb = { data: lsGet(LS_HABITS), q: lsGet(LS_HABITQ) || {}, err: null, inflight: false, flushing: false, timer: null, pop: null };
  function canHabits() { return state.caps.indexOf("habits") > -1; }
  /* The water goal keeps its history (2.30): a change starts on the day it's made, and every earlier day is judged
     by the goal it had then. tos.habitcfg.v1 = { goal, hist: [{ from: yyyy-mm-dd, goal }] }, oldest first; the
     first entry's from is "" (every day before the first change). waterGoal() is today's, waterGoal(key) that day's. */
  function hGoals() {
    var c = lsGet(LS_HABITCFG) || {}, g = WATER_GOALS.indexOf(c.goal) > -1 ? c.goal : 3;
    var h = (Array.isArray(c.hist) ? c.hist : []).filter(function (x) { return x && typeof x.from === "string" && WATER_GOALS.indexOf(x.goal) > -1; });
    return h.length ? h : [{ from: "", goal: g }];
  }
  function waterGoal(key) {
    key = key || ymd(new Date());
    var g = null;
    hGoals().forEach(function (x) { if (g === null || x.from <= key) g = x.goal; });
    return g;
  }
  function setWaterGoal(goal) {
    var today = ymd(new Date()), h = hGoals().filter(function (x) { return x.from < today; });
    if (!h.length) h = [{ from: "", goal: goal }];
    else if (h[h.length - 1].goal !== goal) h.push({ from: today, goal: goal });
    lsSet(LS_HABITCFG, { goal: goal, hist: h });
  }
  function litres(n) { return (n % 1 ? n.toFixed(1) : String(n)) + " L"; }
  function hDay(key) { return hb.q[key] || (hb.data && hb.data.days[key]) || null; }
  function hWin(id, d, key) {
    if (!d) return null;
    if (id === "med" || id === "walk") return !!d[id];
    if (id === "water") return d.water == null ? null : d.water >= waterGoal(key);
    return d.card == null ? null : d.card === "kept";
  }
  function hStreak(id) {
    var t = sod(new Date()), n = 0;
    var at = function (i) { var k = ymd(addDays(t, -i)); return hWin(id, hDay(k), k); };
    for (var i = at(0) ? 0 : 1; i < 400 && at(i) === true; i++) n++;
    return n;
  }
  function hBest(id) {
    var t = sod(new Date()), best = 0, run = 0;
    for (var i = 370; i >= 0; i--) { var k = ymd(addDays(t, -i)); if (hWin(id, hDay(k), k) === true) { run++; best = Math.max(best, run); } else run = 0; }
    return best;
  }
  function hRate(id, days) {
    var t = sod(new Date()), w = 0, c = 0;
    for (var i = 1; i <= days; i++) { var k = ymd(addDays(t, -i)), x = hWin(id, hDay(k), k); if (x !== null) { c++; if (x) w++; } }
    return c ? Math.round(w / c * 100) : null;
  }
  function habitsErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Habits database with the bridge yet. In Notion open 🔁 Habits → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge (steps in the README under Updating the Google bridge).";
    return describe(err);
  }
  function loadHabits(force) {
    if (!state.conn || !canHabits() || hb.inflight) return;
    if (!force && hb.data && Date.now() - hb.data.fetched < 120000) return;
    if (!force && hb.err && !hb.err.write && Date.now() - hb.err.at < FRESH_MS) return;
    hb.inflight = true;
    api({ action: "habits", from: ymd(addDays(new Date(), -370)), to: ymd(new Date()) }).then(function (j) {
      var days = {};
      (j.days || []).forEach(function (d) { days[d.date] = { med: !!d.med, walk: !!d.walk, water: d.water == null ? null : d.water, card: d.card || null }; });
      hb.data = { fetched: Date.now(), days: days };
      if (!hb.err || !hb.err.write) hb.err = null;
      lsSet(LS_HABITS, hb.data);
      flushHabits();
    }).catch(function (err) {
      hb.err = { at: Date.now(), msg: habitsErrText(err) };
    }).then(function () {
      hb.inflight = false;
      if (["habits", "bridge", "review"].indexOf(state.screen) > -1) render(true);
    });
  }
  function setHabit(key, patch) {
    var cur = hDay(key) || { med: false, walk: false, water: null, card: null };
    hb.q[key] = Object.assign({}, cur, patch);
    lsSet(LS_HABITQ, hb.q);
    clearTimeout(hb.timer);
    hb.timer = setTimeout(flushHabits, 700);
    render(true);
  }
  function flushHabits() {
    if (hb.flushing || !state.conn || !canHabits()) return;
    var keys = Object.keys(hb.q);
    if (!keys.length) return;
    var key = keys[0], sent = hb.q[key];
    hb.flushing = true;
    apiPost({ action: "habitset", day: { date: key, med: !!sent.med, walk: !!sent.walk, water: sent.water, card: sent.card } }).then(function (j) {
      if (!hb.data) hb.data = { fetched: 0, days: {} };
      hb.data.days[key] = { med: !!j.day.med, walk: !!j.day.walk, water: j.day.water == null ? null : j.day.water, card: j.day.card || null };
      lsSet(LS_HABITS, hb.data);
      if (hb.q[key] === sent) delete hb.q[key];
      lsSet(LS_HABITQ, hb.q);
      hb.err = null;
      hb.flushing = false;
      if (Object.keys(hb.q).length) flushHabits();
      else if (["habits", "bridge"].indexOf(state.screen) > -1) render(true);
    }).catch(function (err) {
      hb.flushing = false;
      hb.err = { at: Date.now(), msg: habitsErrText(err), write: true };
      clearTimeout(hb.timer); hb.timer = setTimeout(flushHabits, 30000);   /* kept on the iPad; tried again shortly */
      if (["habits", "bridge"].indexOf(state.screen) > -1) render(true);
    });
  }
  function habitMeta() {
    if (hb.err && hb.err.write) return '<span class="warntxt">NOT SAVED YET · RETRIES ON ITS OWN</span>';
    if (Object.keys(hb.q).length) return "SAVING…";
    if (!hb.data) return hb.err ? "" : "LOADING";
    return "SAVED TO NOTION";
  }
  function bottles(w, goal, big) {
    var n = Math.max(1, Math.ceil(Math.max(goal, w || 0))), out = "";
    for (var k = 1; k <= n; k++) {
      var fill = (w || 0) >= k ? " full" : (w || 0) >= k - .5 ? " half" : "";
      out += '<button type="button" class="hb-bottle' + fill + (big ? "" : " sm") + '" data-hwater="' + k + '" aria-label="Bottle ' + k + (fill === " full" ? ", full" : fill ? ", half" : ", empty") + '"><i></i></button>';
    }
    return out;
  }
  function habitTile(h, key, d) {
    var isToday = key === ymd(new Date()), st = isToday ? hStreak(h.id) : 0, win = hWin(h.id, d, key);
    var cls = "hb-tile" + (win ? " done" : "") + (hb.pop === h.id ? " pop" : ""), foot = '<span class="hb-st">' + (isToday ? (st ? st + "-DAY STREAK" : "START A STREAK") : "") + "</span>";
    var style = ' style="--c: var(--' + h.c + ')"';
    if (h.id === "med" || h.id === "walk") {
      var on = !!(d && d[h.id]);
      return '<button type="button" class="' + cls + '"' + style + ' data-hbool="' + h.id + '" aria-pressed="' + on + '"><span class="hb-nm">' + h.name + '</span><span class="hb-big">' +
        (on ? (h.id === "med" ? "DONE" : "WALKED") : "NOT YET") + "</span>" + foot + "</button>";
    }
    if (h.id === "water") {
      var w = d && d.water != null ? d.water : 0, goal = waterGoal(key);
      return '<div class="' + cls + '"' + style + '><span class="hb-nm">WATER</span><span class="hb-big">' + litres(w) + ' <small>OF ' + litres(goal) + ' · 1 L BOTTLES</small></span><div class="hb-bottles">' + bottles(w, goal, true) +
        '</div><div class="hb-seg"><button type="button" class="chip" data-hstep="-0.5" aria-label="Half a bottle less">− ½</button><button type="button" class="chip" data-hstep="0.5">+ ½ BOTTLE</button></div>' + foot + "</div>";
    }
    var c = d ? d.card : null;
    return '<div class="' + cls + '"' + style + '><span class="hb-nm">DEBIT CARD</span><span class="hb-big">' + (c === "kept" ? "DID NOT SWIPE" : c === "swiped" ? "SWIPED" : "NOT YET") + '</span><div class="hb-seg">' +
      '<button type="button" class="chip" style="--c: var(--chrome-b)" data-hcard="kept" aria-pressed="' + (c === "kept") + '">DID NOT SWIPE</button>' +
      '<button type="button" class="chip" style="--c: var(--warn)" data-hcard="swiped" aria-pressed="' + (c === "swiped") + '">SWIPED</button></div>' + foot + "</div>";
  }
  function habitGrid(h) {
    var t = sod(new Date()), dow = (t.getDay() + 6) % 7, start = 77 + dow, cells = "";
    for (var i = start; i > start - 84; i--) {
      if (i < 0) { cells += '<span class="hb-cell future"></span>'; continue; }
      var dt = addDays(t, -i), key = ymd(dt), d = hDay(key), x = hWin(h.id, d, key), cls = "hb-cell", style = "";
      if (x === null) cls += " none";
      else if (h.id === "water") style = ' style="background: color-mix(in srgb, var(--work) ' + Math.round(18 + 82 * Math.min(1, d.water / waterGoal(key))) + '%, var(--panel-2))"';
      else if (x) cls += " win";
      if (i === 0) cls += " today";
      var tip = dLabel(dt) + " · " + (x === null ? "not recorded" : h.id === "water" ? litres(d.water) + " of " + litres(waterGoal(key)) : h.id === "card" ? (x ? "did not swipe" : "swiped") : x ? "done" : "missed");
      cells += '<button type="button" class="' + cls + '"' + style + ' data-hday="' + key + '" title="' + tip + '" aria-label="' + tip + '"></button>';
    }
    return '<div class="hb-g" style="--c: var(--' + h.c + ')"><h3>' + h.name + '</h3><div class="hb-cells">' + cells + "</div></div>";
  }
  function renderHabits() {
    loadHabits(false);
    if (!canHabits()) { $("content").innerHTML = '<div class="hb">' + phead("HABITS", "SETUP") + stubBox(state.conn ? "Needs the 🔁 Habits database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Connect Notion</b>." : "Link calendars first.") + "</div>"; return; }
    var key = ymd(state.anchor), d = hDay(key), today = key === ymd(new Date());
    var html = '<div class="hb"><div class="hb-top"><section>' + phead(today ? "TODAY" : dLabel(state.anchor), habitMeta());
    if (hb.err && !hb.data) html += '<div class="err">' + esc(hb.err.msg) + "</div>";
    html += '<div class="hb-tiles">' + HABITS.map(function (h) { return habitTile(h, key, d); }).join("") + "</div>" +
      '<div class="hb-goal"><span>WATER GOAL</span>' + WATER_GOALS.map(function (g) { return '<button type="button" class="chip" style="--c: var(--work)" data-hgoal="' + g + '" aria-pressed="' + (g === waterGoal()) + '">' + litres(g) + "</button>"; }).join("") + "</div>" + goalHistNote() +
      (hb.err && hb.err.write ? '<div class="err">' + esc(hb.err.msg) + "</div>" : "") +
      '<p class="muted hb-note">A day you don\'t touch stays blank, never counted as a miss. Earlier days: the arrows, or tap a square below.</p></section>';
    html += "<section>" + phead("STREAKS", "", "chrome-a") + '<div class="hb-srow head"><span></span><span></span><span>NOW</span><span>BEST</span><span>30 DAYS</span></div>' + HABITS.map(function (h) {
      var r = hRate(h.id, 30);
      return '<div class="hb-srow" style="--c: var(--' + h.c + ')"><span class="sw"></span><span>' + h.name + (h.id === "water" ? '<small class="muted"> · ' + litres(waterGoal()) + "+</small>" : "") + '</span><span class="n tnum">' + hStreak(h.id) +
        '<small>DAYS</small></span><span class="n tnum">' + hBest(h.id) + '<small>DAYS</small></span><span class="n tnum">' + (r === null ? "–" : r) + "<small>%</small></span></div>";
    }).join("") + "</section></div>";
    html += '<section class="hb-weeks">' + phead("LAST 12 WEEKS", "MONDAY AT TOP · THIS WEEK ON THE RIGHT", "chrome-c") + '<div class="hb-grids">' + HABITS.map(habitGrid).join("") + "</div>" +
      '<div class="hb-legend"><span><i style="background: var(--chrome-c)"></i>DONE</span><span><i style="background: var(--panel-2)"></i>MISSED</span><span><i class="none"></i>NOT RECORDED</span>' +
      '<span><i style="background: color-mix(in srgb, var(--work) 35%, var(--panel-2))"></i><i style="background: color-mix(in srgb, var(--work) 70%, var(--panel-2))"></i><i style="background: var(--work)"></i>WATER, LESS TO GOAL</span></div></section></div>';
    hb.pop = null;
    $("content").innerHTML = html;
  }
  /* Under the goal chips: a change counts from today; earlier goals stay with their days. */
  function goalHistNote() {
    var all = hGoals(), h = all.map(function (x, i) { return { x: x, prev: all[i - 1] }; }).filter(function (y) { return y.x.from; }).slice(-3).reverse();
    return '<p class="muted hb-note">A new goal counts from today; earlier days keep the goal they had.' + (h.length ? " " + h.map(function (y) { return litres(y.x.goal) + " from " + dLabel(parseYmd(y.x.from)) + (y.prev ? " (was " + litres(y.prev.goal) + ")" : ""); }).join(" · ") : "") + "</p>";
  }
  /* The same four, one tap each, on the Bridge. */
  function habitsPanel(today) {
    if (!canHabits()) return "";
    loadHabits(false);
    var d = hDay(today), goal = waterGoal(), c = d ? d.card : null, w = d && d.water != null ? d.water : 0;
    var chip = function (attr, c2, on, label, extra) { return '<button type="button" class="chip hb-chip" style="--c: var(--' + c2 + ")" + (extra || "") + '" ' + attr + ' aria-pressed="' + on + '"><span class="tick"></span>' + label + "</button>"; };
    /* 2.75 (Timothy): water short of the goal tints the chip, deeper as it nears the goal (10% to 50% of WORK blue, as HABITS'
       12-week grid shades a part-day); light text stays readable up to 50%. At the goal it fills solid, as before. */
    var wTint = w > 0 && w < goal ? "; background: color-mix(in srgb, var(--work) " + Math.round(10 + 40 * w / goal) + "%, transparent); border-color: color-mix(in srgb, var(--work) 60%, var(--line))" : "";
    return phead("HABITS · TODAY", habitMeta()) + '<div class="hb-strip">' +
      chip('data-hbool="med"', "chrome-c", !!(d && d.med), "MEDITATED") + chip('data-hbool="walk"', "personal", !!(d && d.walk), "EVENING WALK") +
      chip('data-hstep="0.5"', "work", w >= goal, "WATER " + litres(w) + " / " + litres(goal) + " · + ½", wTint) +
      chip('data-hcycle="1"', c === "swiped" ? "warn" : "chrome-b", c !== null, c === "kept" ? "DID NOT SWIPE" : c === "swiped" ? "SWIPED" : "DEBIT CARD · NOT YET") + "</div>" +
      (hb.err && hb.err.write ? '<div class="err" style="margin-top:10px">' + esc(hb.err.msg) + "</div>" : "");
  }
  /* Review: the week's habits, day by day, against the 12 weeks before. */
  function habitsWeek(w0) {
    if (!canHabits()) return "";
    loadHabits(false);
    if (!hb.data) return "<section>" + phead("HABITS", "") + '<div class="empty">' + (hb.err ? esc(hb.err.msg) : "Loading your habits from Notion…") + "</div></section>";
    var t = ymd(new Date()), goal = waterGoal(ymd(addDays(w0, 6)) < t ? ymd(addDays(w0, 6)) : t);
    var html = "<section>" + phead("HABITS", "THIS WEEK, DAY BY DAY") + '<div class="hb-wk head"><span></span>' + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return "<span>" + x + "</span>"; }).join("") + '<span>WEEK</span><span>VS 12 WEEKS</span></div>';
    HABITS.forEach(function (h) {
      var cells = "", wins = 0, cnt = 0, sum = 0;
      for (var k = 0; k < 7; k++) {
        var key = ymd(addDays(w0, k));
        if (key > t) { cells += '<span class="d future"></span>'; continue; }
        var d = hDay(key), x = hWin(h.id, d, key);
        if (x === null) { cells += '<span class="d none"></span>'; continue; }
        cnt++; if (x) wins++;
        if (h.id === "water") { sum += d.water; cells += '<span class="d ' + (x ? "win" : "part") + ' tnum">' + (d.water % 1 ? d.water.toFixed(1) : d.water) + "</span>"; }
        else cells += '<span class="d' + (x ? " win" : "") + '"></span>';
      }
      var pw = 0, pc = 0;
      for (var j = 1; j <= 84; j++) { var kj = ymd(addDays(w0, -j)), y = hWin(h.id, hDay(kj), kj); if (y !== null) { pc++; if (y) pw++; } }
      var exp = pc ? pw / pc * cnt : null, diff = exp === null ? null : wins - exp;
      var tot = h.id === "water" ? (cnt ? litres(Math.round(sum / cnt * 10) / 10) + '<small class="muted"> AVG</small>' : "–") : wins + '<small class="muted"> / ' + cnt + "</small>";
      var vs = diff === null || !cnt ? '<span class="vs">–</span>' : Math.abs(diff) < .5 ? '<span class="vs">ON PACE</span>' : diff > 0 ? '<span class="vs up">▲ ' + diff.toFixed(1) + " DAYS</span>" : '<span class="vs down">▼ ' + Math.abs(diff).toFixed(1) + " DAYS</span>";
      html += '<div class="hb-wk" style="--c: var(--' + h.c + ')"><span class="nm">' + h.name + "</span>" + cells + '<span class="tot tnum">' + tot + "</span>" + vs + "</div>";
    });
    return html + '<small class="muted">Water shows litres each day; a full square means that day\'s goal (' + litres(goal) + " at the end of the week) or more. Read live from the Habits database, so a day changed later shows here too.</small></section>";
  }
  /* ALL REVIEWS trends: share of recorded days won, week by week. */
  function habitsTrend(win) {
    if (!canHabits() || !hb.data) return "";
    var t = ymd(new Date());
    return '<div class="rl-chart wide"><h3>HABITS PER WEEK</h3><div class="sub">Days won of days recorded, from the Habits database.</div><div class="hb-trend" style="grid-template-columns: 130px repeat(' + win.length + ', minmax(0, 1fr))">' +
      HABITS.map(function (h) {
        return '<span class="nm" style="color: var(--' + h.c + ')">' + h.name + "</span>" + win.map(function (x) {
          var w = 0, c = 0;
          for (var k = 0; k < 7; k++) { var key = ymd(addDays(x.w0, k)); if (key > t) break; var y = hWin(h.id, hDay(key), key); if (y !== null) { c++; if (y) w++; } }
          return '<span class="c tnum" style="--c: var(--' + h.c + '); --f: ' + (c ? Math.round(w / c * 100) : 0) + '%"' + (c ? "" : ' data-none="1"') + ' title="Week ' + isoWeek(x.w0) + ": " + w + " of " + c + '">' + (c ? w : "") + "</span>";
        }).join("");
      }).join("") + '<span></span>' + win.map(function (x) { return '<span class="wkn tnum">' + isoWeek(x.w0) + "</span>"; }).join("") + "</div></div>";
  }
  function habitsClick(b) {
    var key = state.screen === "habits" ? ymd(state.anchor) : ymd(new Date()), d = hDay(key) || {};
    if (b.dataset.hbool) { var id = b.dataset.hbool, on = !d[id], p = {}; p[id] = on; hb.pop = on ? id : null; setHabit(key, p); return true; }
    if (b.dataset.hwater) { var k = +b.dataset.hwater; setHabit(key, { water: d.water === k ? k - .5 : k }); return true; }
    if (b.dataset.hstep) { var nw = Math.max(0, Math.min(12, (d.water || 0) + Number(b.dataset.hstep))); hb.pop = nw >= waterGoal(key) && (d.water || 0) < waterGoal(key) ? "water" : null; setHabit(key, { water: nw }); return true; }
    if (b.dataset.hcard) { var v = b.dataset.hcard; hb.pop = d.card !== v && v === "kept" ? "card" : null; setHabit(key, { card: d.card === v ? null : v }); return true; }
    if (b.dataset.hcycle) { setHabit(key, { card: d.card == null ? "kept" : d.card === "kept" ? "swiped" : null }); return true; }
    if (b.dataset.hgoal) { setWaterGoal(Number(b.dataset.hgoal)); render(true); return true; }
    if (b.dataset.hday) { state.anchor = parseYmd(b.dataset.hday); render(true); return true; }
    return false;
  }

  /* ---------- Library ---------- */
  /* One page per book in the Library database (bridge 1.14). Books are found on Open Library
     (free, no account) straight from the iPad; covers load from Open Library too. */
  var LS_LIBRARY = "tos.library.v1", LS_SHELF = "tos.shelf.v1";
  var SHELVES = [["reading", "READING"], ["want", "WANT TO READ"], ["read", "READ"], ["aside", "SET ASIDE"]];
  var COVER_TINTS = ["chrome-a", "chrome-b", "chrome-c", "work", "personal", "farm", "hobby"];
  var lb = { data: lsGet(LS_LIBRARY), err: null, inflight: false, draft: null, search: null, sTimer: null, sSeq: 0, removeArm: false };
  function canLibrary() { return state.caps.indexOf("library") > -1; }
  function shelfNow() { var s = lsGet(LS_SHELF); return SHELVES.some(function (x) { return x[0] === s; }) ? s : "reading"; }
  function libraryErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Library with the bridge yet. In Notion open 📚 Library → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge (steps in the README under Updating the Google bridge).";
    return describe(err);
  }
  function loadLibrary(force) {
    if (!state.conn || !canLibrary() || lb.inflight) return;
    if (!force && lb.data && Date.now() - lb.data.fetched < 300000) return;
    if (!force && lb.err && Date.now() - lb.err.at < FRESH_MS) return;
    lb.inflight = true;
    api({ action: "library" }).then(function (j) {
      lb.data = { fetched: Date.now(), books: j.books || [] }; lb.err = null; lsSet(LS_LIBRARY, lb.data);
    }).catch(function (err) { lb.err = { at: Date.now(), msg: libraryErrText(err) }; })
      .then(function () { lb.inflight = false; if (state.screen === "library") render(true); cmdFresh(); });
  }
  function books() { return (lb.data && lb.data.books) || []; }
  function bookById(id) { return books().filter(function (b) { return b.id === id; })[0]; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function cover(b, cls) {
    var longest = Math.max.apply(null, String(b.title).split(" ").map(function (w) { return w.length; })), fs = longest > 9 || b.title.length > 26 ? 11 : longest > 7 || b.title.length > 16 ? 13 : 15;
    return '<span class="lb-cover' + (cls ? " " + cls : "") + '" lang="en" style="--cc: var(--' + COVER_TINTS[hash(b.title) % COVER_TINTS.length] + "); --fs: " + fs + 'px"><span class="ct">' + esc(b.title) + '</span><span class="ca">' + esc(b.author || "") + "</span>" +
      (b.cover ? '<img src="' + esc(b.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + "</span>";
  }
  function stars(n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= (n || 0) ? "★" : '<span class="off">★</span>'; return '<span class="lb-stars" aria-label="' + (n || 0) + ' of 5 stars">' + s + "</span>"; }
  function bookDays(b) { return b.started && b.finished ? Math.max(1, daysBetween(b.started, b.finished)) : null; }
  function renderLibrary() {
    loadLibrary(false);
    if (!canLibrary()) { $("content").innerHTML = '<div class="lb">' + phead("LIBRARY", "SETUP") + stubBox(state.conn ? "Needs the 📚 Library database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Connect Notion</b>." : "Link calendars first.") + "</div>"; return; }
    if (!lb.data) { $("content").innerHTML = '<div class="lb">' + phead("LIBRARY", "") + '<div class="empty">' + (lb.err ? esc(lb.err.msg) : "Loading your library from Notion…") + "</div></div>"; return; }
    var all = books(), yr = new Date().getFullYear(), read = all.filter(function (b) { return b.status === "read"; }), sh = shelfNow();
    var thisYear = read.filter(function (b) { return b.finished && +b.finished.slice(0, 4) === yr; }).length;
    var spans = read.map(bookDays).filter(function (x) { return x; }).sort(function (a, b) { return a - b; }), typical = spans.length ? spans[Math.floor(spans.length / 2)] : null;
    var by = {}; read.forEach(function (b) { if (b.author) by[b.author] = (by[b.author] || 0) + 1; });
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    var html = '<div class="lb"><div class="lb-stats">' +
      '<div class="lb-stat" style="--c: var(--chrome-b)"><span class="k">READ IN ' + yr + '</span><span class="v tnum">' + thisYear + "<small>" + (thisYear === 1 ? "BOOK" : "BOOKS") + "</small></span></div>" +
      '<div class="lb-stat" style="--c: var(--chrome-d)"><span class="k">TYPICAL BOOK</span><span class="v tnum">' + (typical === null ? "–" : typical) + "<small>DAYS START TO FINISH</small></span></div>" +
      '<div class="lb-stat" style="--c: var(--chrome-c)"><span class="k">MOST READ AUTHOR</span><span class="v name">' + (top && by[top] > 1 ? esc(top.toUpperCase()) : "–") + '</span><span class="k">' + (top && by[top] > 1 ? by[top] + " BOOKS READ" : "TWO BOOKS BY ONE AUTHOR TO SHOW") + "</span></div></div>";
    html += '<div class="lb-tools"><div class="chips">' + SHELVES.map(function (s) {
      var n = all.filter(function (b) { return b.status === s[0]; }).length;
      return '<button type="button" class="chip" data-shelf="' + s[0] + '" aria-pressed="' + (sh === s[0]) + '">' + s[1] + " · " + n + "</button>";
    }).join("") + '</div><button type="button" class="btn sm" data-act="addbook">+ ADD BOOK</button></div>';
    var list = all.filter(function (b) { return b.status === sh; });
    if (sh === "reading") {
      html += "<section>" + phead("ON THE NIGHTSTAND", list.length + " IN PROGRESS") + (list.length ? '<div class="lb-reading">' + list.map(function (b) {
        var day = b.started ? daysBetween(b.started, ymd(new Date())) + 1 : null;
        return '<div class="lb-card"><button type="button" class="lb-book" data-book="' + esc(b.id) + '" aria-label="' + esc(b.title) + '">' + cover(b) + '</button><div><div class="t">' + esc(b.title) + '</div><div class="muted">' + esc(b.author || "") + "</div>" +
          '<div class="meta">' + (b.started ? "STARTED " + dLabel(parseYmd(b.started)) + " · DAY " + day : "NO START DATE") + '</div><div class="btnrow"><button type="button" class="btn sm" data-bfinish="' + esc(b.id) + '">FINISHED</button><button type="button" class="btn sm ghost" data-baside="' + esc(b.id) + '">SET ASIDE</button></div></div></div>';
      }).join("") + "</div>" : '<div class="empty">Nothing on the nightstand. Tap a book under WANT TO READ, or + ADD BOOK.</div>') + "</section>";
      var next = all.filter(function (b) { return b.status === "want"; });
      if (next.length) html += "<section>" + phead("UP NEXT", "FROM WANT TO READ", "chrome-a") + '<div class="lb-shelf">' + next.slice(0, 6).map(bookTile).join("") + "</div></section>";
    } else if (sh === "read") {
      var years = {};
      list.forEach(function (b) { var y = b.finished ? b.finished.slice(0, 4) : "NO DATE"; (years[y] = years[y] || []).push(b); });
      Object.keys(years).sort().reverse().forEach(function (y) {
        var g = years[y].sort(function (a, b) { return (b.finished || "").localeCompare(a.finished || ""); });
        html += "<section>" + phead(y, g.length + (g.length === 1 ? " BOOK" : " BOOKS"), "chrome-c") + '<div class="lb-read">' + g.map(function (b) {
          var n = bookDays(b);
          return '<button type="button" class="lb-row" data-book="' + esc(b.id) + '">' + cover(b, "mini") + '<span class="dt tnum">' + (b.finished ? shortDay(b.finished) : "") + '</span><span class="tt"><b>' + esc(b.title) + "</b><small>" + esc(b.author || "") + "</small></span>" +
            (n ? '<span class="pill tnum">' + n + (n === 1 ? " DAY" : " DAYS") + "</span>" : "<span></span>") + stars(b.rating) + "</button>";
        }).join("") + "</div></section>";
      });
      if (!list.length) html += '<div class="empty">No finished books yet.</div>';
    } else {
      html += "<section>" + phead(sh === "want" ? "WANT TO READ" : "SET ASIDE", list.length + (list.length === 1 ? " BOOK" : " BOOKS")) +
        (list.length ? '<div class="lb-shelf">' + list.map(bookTile).join("") + "</div>" : '<div class="empty">Nothing here.</div>') + "</section>";
    }
    if (lb.err) html += stale(lb.data.fetched);
    $("content").innerHTML = html + "</div>";
  }
  function bookTile(b) { return '<button type="button" class="lb-book" data-book="' + esc(b.id) + '">' + cover(b) + '<span class="bt">' + esc(b.title) + '</span><span class="ba">' + esc(b.author || "") + "</span></button>"; }
  /* Save a change: shown at once, sent to Notion, put back if Notion refuses. */
  function bookSave(id, patch, msg) {
    var b = bookById(id), before = b ? JSON.parse(JSON.stringify(b)) : null;
    if (b) { Object.assign(b, patch); lsSet(LS_LIBRARY, lb.data); }
    if (state.screen === "library") render(true);
    apiPost({ action: "booksave", book: Object.assign({ id: id }, patch) }).then(function (j) {
      var cur = bookById(id); if (cur) Object.assign(cur, j.book); lsSet(LS_LIBRARY, lb.data);
      if (msg) toast(msg);
    }).catch(function (err) {
      var cur = bookById(id); if (cur && before) Object.assign(cur, before); lsSet(LS_LIBRARY, lb.data);
      toast("Not saved: " + libraryErrText(err));
      if (state.screen === "library") render(true);
    });
  }
  function bookAdd(found, status) {
    var today = ymd(new Date()), cid = newCid();
    var b = { cid: cid, title: found.title, author: found.author || "", status: status, cover: found.cover || "", ol: found.ol || "", year: found.year || null };
    if (status === "reading") b.started = today;
    if (status === "read") b.finished = today;
    var temp = Object.assign({ id: "tmp-" + cid, started: b.started || null, finished: b.finished || null, rating: null, notes: "", created: new Date().toISOString() }, b);
    if (!lb.data) lb.data = { fetched: 0, books: [] };
    lb.data.books.unshift(temp);
    lsSet(LS_SHELF, status);
    closeDetail();
    render(true);
    var send = { cid: cid, title: b.title, author: b.author, status: status, started: b.started || null, finished: b.finished || null };
    if (b.cover) send.cover = b.cover; if (b.ol) send.ol = b.ol; if (b.year) send.year = b.year;
    apiPost({ action: "booksave", book: send }).then(function (j) {
      var i = lb.data.books.indexOf(temp); if (i > -1) lb.data.books[i] = j.book; else lb.data.books.unshift(j.book);
      lsSet(LS_LIBRARY, lb.data);
      toast("Added to " + SHELVES.filter(function (s) { return s[0] === status; })[0][1]);
      if (state.screen === "library") render(true);
    }).catch(function (err) {
      var i = lb.data.books.indexOf(temp); if (i > -1) lb.data.books.splice(i, 1);
      toast("Not added: " + libraryErrText(err));
      if (state.screen === "library") render(true);
    });
  }
  /* + ADD BOOK: search Open Library as you type; or add by hand. */
  function openAddBook() {
    lb.search = { q: "", results: null, busy: false, err: null };
    $("detailSheet").className = "sheet lb-sheet";
    $("detailSheet").style.setProperty("--c", "var(--chrome-b)");
    $("detailSheet").innerHTML = '<div class="sbar"><span>+ ADD BOOK</span><span>SEARCH · OPEN LIBRARY</span></div><div class="sbody"><input type="search" id="olq" placeholder="Title or author" autocomplete="off" enterkeyhint="search" aria-label="Title or author"><div id="olres"></div></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("olq").focus();
  }
  function olResults() {
    var s = lb.search, el = $("olres");
    if (!s || !el) return;
    var add = function (i) { return '<div class="hb-seg"><button type="button" class="chip" data-addas="want" data-r="' + i + '">WANT</button><button type="button" class="chip" data-addas="reading" data-r="' + i + '">READING NOW</button><button type="button" class="chip" data-addas="read" data-r="' + i + '">ALREADY READ</button></div>'; };
    var html = s.busy ? '<div class="empty">Searching Open Library…</div>' : s.err ? '<div class="err">' + esc(s.err) + "</div>" : "";
    if (s.results) html += s.results.length ? s.results.map(function (r, i) {
      var have = books().some(function (b) { return b.title.toLowerCase() === r.title.toLowerCase() && (b.author || "") === (r.author || ""); });
      return '<div class="lb-result">' + cover(r, "mini") + '<div><b>' + esc(r.title) + "</b><small>" + esc([r.author, r.year].filter(Boolean).join(" · ")) + (have ? " · ALREADY IN YOUR LIBRARY" : "") + "</small>" + add(i) + "</div></div>";
    }).join("") : '<div class="empty">Nothing found on Open Library.</div>';
    if (s.q.length >= 2) html += '<div class="lb-manual"><span class="muted">Not listed? Add “' + esc(s.q) + '” by hand:</span>' + add(-1) + "</div>";
    el.innerHTML = html;
  }
  function olSearch(q) {
    var s = lb.search; if (!s) return;
    s.q = q.trim();
    clearTimeout(lb.sTimer);
    if (s.q.length < 3) { s.results = null; s.busy = false; s.err = null; olResults(); return; }
    lb.sTimer = setTimeout(function () {
      var seq = ++lb.sSeq;
      s.busy = true; s.err = null; olResults();
      fetch("https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,first_publish_year,cover_i&q=" + encodeURIComponent(s.q))
        .then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.json(); })
        .then(function (j) {
          if (seq !== lb.sSeq) return;
          s.results = (j.docs || []).map(function (d) {
            return { title: String(d.title || "").slice(0, 200), author: (d.author_name || []).slice(0, 2).join(", ").slice(0, 200), year: d.first_publish_year || null,
              cover: d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-M.jpg" : "", ol: /^\/works\/\w+$/.test(d.key || "") ? "https://openlibrary.org" + d.key : "" };
          }).filter(function (d) { return d.title; });
        })
        .catch(function () { if (seq === lb.sSeq) s.err = "Couldn't reach Open Library. Add it by hand below, or try again in a moment."; })
        .then(function () { if (seq === lb.sSeq) { s.busy = false; olResults(); } });
    }, 450);
  }
  /* A book's sheet: shelf, dates, stars and notes, saved together on DONE. */
  function openBook(id) {
    var b = bookById(id); if (!b) return;
    lb.draft = { id: id, status: b.status, started: b.started || "", finished: b.finished || "", rating: b.rating || 0, notes: b.notes || "" };
    lb.removeArm = false;
    $("detailSheet").innerHTML = "";   /* drawBook() keeps what's typed in Notes; never carry over the last book's (2.14.2) */
    $("detailSheet").className = "sheet lb-sheet";
    $("detailSheet").style.setProperty("--c", "var(--chrome-b)");
    drawBook();
    showSheet("detailScrim");
  }
  function drawBook() {
    var dr = lb.draft, b = bookById(dr.id); if (!b) return;
    var notesEl = $("bkNotes"); if (notesEl) dr.notes = notesEl.value;
    $("detailSheet").innerHTML = '<div class="sbar"><span>📖 BOOK</span><span>' + SHELVES.filter(function (s) { return s[0] === dr.status; })[0][1] + "</span></div>" +
      '<div class="sbody"><div class="lb-detail">' + cover(b, "big") + '<div class="lb-dbody"><h3 id="detailTitle">' + esc(b.title) + '</h3><div class="muted">' + esc([b.author, b.year].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="hb-seg">' + SHELVES.map(function (s) { return '<button type="button" class="chip" data-bstatus="' + s[0] + '" aria-pressed="' + (dr.status === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<div class="lb-dates"><label>STARTED<input type="date" id="bkStarted" value="' + esc(dr.started) + '"></label><label>FINISHED<input type="date" id="bkFinished" value="' + esc(dr.finished) + '"></label></div>' +
      '<div class="lb-starpick" role="group" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-brate="' + n + '" class="' + (n <= dr.rating ? "on" : "") + '" aria-label="' + n + (n === 1 ? " star" : " stars") + '">★</button>'; }).join("") + "</div></div></div>" +
      '<textarea id="bkNotes" rows="3" maxlength="4000" placeholder="Notes, quotes, who recommended it" aria-label="Notes">' + esc(dr.notes) + "</textarea></div>" +
      '<div class="sfoot btnrow">' + (b.url ? '<a class="btn ghost" href="' + esc(b.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") +
      '<button type="button" class="btn ghost" data-bremove="1">' + (lb.removeArm ? "TAP AGAIN TO REMOVE" : "REMOVE") + '</button><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-bdone="1">DONE</button></div>';
  }
  function bookSheetClick(b) {
    var dr = lb.draft;
    if (b.dataset.addas) {
      var i = +b.dataset.r, s = lb.search, found = i === -1 ? { title: s.q.slice(0, 200) } : s.results[i];
      if (found && found.title) bookAdd(found, b.dataset.addas);
      return true;
    }
    if (!dr) return false;
    var keep = function () { dr.started = ($("bkStarted") || {}).value || ""; dr.finished = ($("bkFinished") || {}).value || ""; };
    if (b.dataset.bstatus) {
      keep(); dr.status = b.dataset.bstatus; var t = ymd(new Date());
      if (dr.status === "reading" && !dr.started) dr.started = t;
      if (dr.status === "read" && !dr.finished) dr.finished = t;
      drawBook(); return true;
    }
    if (b.dataset.brate) { keep(); var n = +b.dataset.brate; dr.rating = dr.rating === n ? 0 : n; drawBook(); return true; }
    if (b.dataset.bremove) {
      keep();
      if (!lb.removeArm) { lb.removeArm = true; drawBook(); return true; }
      var id = dr.id, bk = bookById(id), idx = books().indexOf(bk);
      lb.draft = null; closeDetail();
      if (idx > -1) lb.data.books.splice(idx, 1);
      lsSet(LS_LIBRARY, lb.data); render(true);
      apiPost({ action: "bookremove", id: id }).then(function () { toast("Removed. It's in Notion's trash if you change your mind"); }).catch(function (err) {
        if (bk) lb.data.books.splice(Math.max(0, idx), 0, bk); lsSet(LS_LIBRARY, lb.data); render(true); toast("Not removed: " + libraryErrText(err));
      });
      return true;
    }
    if (b.dataset.bdone) {
      keep(); dr.notes = ($("bkNotes") || {}).value || "";
      var cur = bookById(dr.id), patch = {};
      if (!cur) { closeDetail(); return true; }
      if (dr.status !== cur.status) patch.status = dr.status;
      if ((dr.started || null) !== (cur.started || null)) patch.started = dr.started || null;
      if ((dr.finished || null) !== (cur.finished || null)) patch.finished = dr.finished || null;
      if ((dr.rating || null) !== (cur.rating || null)) patch.rating = dr.rating || null;
      if (dr.notes.trim() !== (cur.notes || "").trim()) patch.notes = dr.notes.trim();
      lb.draft = null; closeDetail();
      if (Object.keys(patch).length) bookSave(cur.id, patch, "Saved to Notion");
      return true;
    }
    return false;
  }
  function libraryClick(b) {
    if (b.dataset.shelf) { lsSet(LS_SHELF, b.dataset.shelf); render(true); return true; }
    if (b.dataset.act === "addbook") { openAddBook(); return true; }
    if (b.dataset.book) { if (!/^tmp-/.test(b.dataset.book)) openBook(b.dataset.book); return true; }
    if (b.dataset.bfinish) { var t = ymd(new Date()), id = b.dataset.bfinish; bookSave(id, { status: "read", finished: t }, "Finished. Tap it to rate it"); return true; }
    if (b.dataset.baside) { bookSave(b.dataset.baside, { status: "aside" }, "Moved to SET ASIDE"); return true; }
    return false;
  }
  $("detailScrim").addEventListener("input", function (e) { if (e.target.id === "olq") olSearch(e.target.value); });
  /* A cover that doesn't load leaves the lettered cover underneath. */
  document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("lb-cover")) t.remove(); }, true);

  /* ---------- Top spacing below the status bar ---------- */
  /* Panels (ASK, CAPTURE, details) sit inside the part of the screen you can actually see: below the
     status bar and, while typing, above the keyboard. iPadOS shrinks the visual viewport for the keyboard
     and may scroll it; the scrims follow it through --vv-top and --vv-h. */
  lsDel(LS_TOPGAP);
  /* 2.51.5: only while a text field has the keyboard. With audio playing the app keeps running in the background, and
     iPadOS reports a tiny visual viewport during the app switcher or lock screen and sends no resize on the way back:
     the stored height (77 px once) left every panel as a sliver under the top bar. So a hidden page changes nothing,
     no keyboard means the whole screen, and it's measured again on coming back and as a panel opens. */
  function fitViewport() {
    var v = window.visualViewport, r = document.documentElement.style;
    if (!v || document.hidden) return;
    var f = document.activeElement, isTyping = f && (f.tagName === "TEXTAREA" || (f.tagName === "INPUT" && !/^(button|checkbox|radio|range|submit|reset|file|color)$/i.test(f.type || ""))) || (f && f.isContentEditable);
    if (!isTyping || v.height < 120) { r.removeProperty("--vv-top"); r.removeProperty("--vv-h"); return; }
    r.setProperty("--vv-top", Math.max(0, v.offsetTop) + "px");
    r.setProperty("--vv-h", v.height + "px");
  }
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport);
    document.addEventListener("visibilitychange", fitViewport); window.addEventListener("pageshow", fitViewport); window.addEventListener("resize", fitViewport);
    document.addEventListener("focusin", function () { setTimeout(fitViewport, 0); }); document.addEventListener("focusout", function () { setTimeout(fitViewport, 50); });
    fitViewport();
  }

