  /* ---------- ASTROMETRICS (2.40, bridge 1.32): the year at a glance ---------- */
  /* Every station's year as one row of weeks (Monday to Sunday, every week that touches the year), each row shaded
     against its own busiest week (✦), hatched before its first record that year. Built from what the bridge already
     reads: the calendars eight weeks at a time (hours counted as Review counts them: ignored titles and breaks left
     out), the year read (tasks marked Done by their last edit, Replicator Queue items bought), habits, reviews, books,
     tarot readings, apiary checks, upkeep marked done on this iPad (kept from 2.40) and, only after the LOG PIN, the
     days written: counts held in memory, never stored, never sent. Kept on this iPad (tos.astro.v1, not in backups),
     refreshed every six hours; RESCAN asks again. Past years are kept once read after the year ended.
     The Ship's Year: Sonnet writes about 200 words from the counts (ask mode "year"; never the Log; tarot, the
     apiary and the queue's spend only with their SHARE WITH ASK switches), at the first open after 06:00 on
     31 December or whenever asked. Kept in tos.shipyear.v1 (in backups); Nova reads it, Moira when Nova can't. */
  var LS_ASTRO = "tos.astro.v1", LS_SHIPYEAR = "tos.shipyear.v1", AS_FRESH_MS = 6 * 3600000, AS_CHUNK = 8, AS_TYPE_MS = 7000;
  var AS_ROWS = [
    { id: "cal", name: "CALENDAR", c: "work" },
    { id: "tasks", name: "TASKS", c: "personal" },
    { id: "habits", name: "HABITS", c: "chrome-b" },
    { id: "log", name: "LOG", c: "chrome-c" },
    { id: "review", name: "REVIEW", c: "chrome-a", flat: true },
    { id: "library", name: "LIBRARY", c: "chrome-d", flat: true },
    { id: "tarot", name: "TAROT", c: "chrome-c" },
    { id: "apiary", name: "APIARY", c: "farm" },
    { id: "queue", name: "QUEUE", c: "chrome-a" },
    { id: "upkeep", name: "UPKEEP", c: "chrome-b" },
    { id: "science", name: "SCIENCE", c: "personal" }
  ];
  var AS_AREAS = ["work", "farm", "personal", "hobby"];   /* stacking order: farm never next to Growth (their colours are close) */
  var SHIP_ASK = "Write the Ship's Year. About 200 words in all, one to three sentences a paragraph.";
  var as = { y: new Date().getFullYear(), sel: "cal", cell: null, bar: null, store: lsGet(LS_ASTRO) || {}, busy: {}, err: {}, log: null,
    ship: lsGet(LS_SHIPYEAR) || {}, shipBusy: false, shipErr: "", shipErrAt: 0, typeT0: 0, raf: 0, fold: {}, placed: false,
    el: null, urls: null, at: "", vbusy: "", vp: null, verr: "", verrAt: 0, say: -1, speaking: false, prep: false };
  function canYear() { return state.caps.indexOf("year") > -1; }
  function canShipsYear() { return state.caps.indexOf("shipsyear") > -1; }
  function asSave() { lsSet(LS_ASTRO, as.store); }
  function asYd(y) { if (!as.store[y]) as.store[y] = {}; return as.store[y]; }
  /* Weeks: the Monday on or before 1 January is week 0. Day numbers in UTC so a clock change never shifts a week. */
  function asDay(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function asW0(y) { return sow(new Date(y, 0, 1)); }
  function asWk(y, s) { return Math.floor((asDay(s) - asDay(ymd(asW0(y)))) / 7); }
  function asCols(y) { return asWk(y, y + "-12-31") + 1; }
  function asStart(y, w) { return addDays(asW0(y), w * 7); }
  function asNowW(y) { var t = new Date().getFullYear(); return t > y ? asCols(y) - 1 : t < y ? -1 : asWk(y, ymd(new Date())); }
  function asMonth(y, w) { var s = asStart(y, w); return s.getFullYear() < y ? 0 : s.getMonth(); }
  function asWkLabel(y, w) {
    var s = asStart(y, w), e = addDays(s, 6);
    if (s.getFullYear() < y) s = new Date(y, 0, 1);
    if (e.getFullYear() > y) e = new Date(y, 11, 31);
    var a = s.getDate() + (s.getMonth() === e.getMonth() ? "" : " " + MON[s.getMonth()]);
    return "WK " + (w + 1) + " · " + (sameDay(s, e) ? "" : a + "–") + e.getDate() + " " + MON[e.getMonth()];
  }
  function asZeros(y) { var a = []; for (var i = 0; i < asCols(y); i++) a.push(0); return a; }
  function asStale(y, part) {
    if (!part || !part.at) return true;
    if (y < new Date().getFullYear()) return part.at < new Date(y + 1, 0, 2).getTime();   /* read after the year ended: kept */
    return Date.now() - part.at > AS_FRESH_MS;
  }
  /* Which rows this setup can fill, in order. */
  function asRows() {
    return AS_ROWS.filter(function (r) {
      if (r.id === "tasks") return canYear();
      if (r.id === "queue") return canYear() && canQueue();
      if (r.id === "habits") return canHabits();
      if (r.id === "log") return canLog();
      if (r.id === "review") return canReviews();
      if (r.id === "library") return canLibrary();
      if (r.id === "tarot") return canTarot();
      if (r.id === "apiary") return canApiary();
      if (r.id === "upkeep") return upkeepItems().length > 0;
      if (r.id === "science") return canSciLog();
      return true;
    });
  }

  /* ---- loading: each part on its own, kept as it lands ---- */
  function asPending(y) { return Object.keys(as.busy).some(function (k) { return k.indexOf(y + ":") === 0; }); }
  function asRun(y, part, work) {
    var k = y + ":" + part;
    if (as.busy[k]) return;
    as.busy[k] = true;
    work().then(function () { delete as.err[k]; asSave(); }).catch(function (err) { as.err[k] = { at: Date.now(), msg: describe(err) }; })
      .then(function () { delete as.busy[k]; if (state.screen === "astrometrics") render(true); if (!asPending(y)) shipMaybe(); });
  }
  function asLoad(y, force) {
    if (!state.conn) return;
    var yd = asYd(y), want = function (p) { var e = as.err[y + ":" + p]; return (force || asStale(y, yd[p])) && (force || !e || Date.now() - e.at > FRESH_MS); };
    var jan1 = new Date(y, 0, 1), next = new Date(y + 1, 0, 1), last = ymd(new Date(Math.min(Date.now(), new Date(y, 11, 31).getTime())));
    if (want("cal")) asRun(y, "cal", function () { return asCal(y, force); });
    if (canYear() && (want("tasks") || want("queue"))) asRun(y, "year", function () {
      return api({ action: "year", from: jan1.toISOString(), to: next.toISOString() }).then(function (j) {
        var t = { at: Date.now(), wk: asZeros(y), area: {} }, q = { at: Date.now(), wk: asZeros(y), cost: 0, n: 0 };
        (j.done || []).forEach(function (d) {
          var w = d.at && asWk(y, ymd(new Date(d.at))); if (!(w >= 0 && w < t.wk.length)) return;
          t.wk[w]++; var a = taskArea(d.area); t.area[a] = (t.area[a] || 0) + 1;
        });
        (j.bought || []).forEach(function (b) { var w = b.day ? asWk(y, b.day) : -1; if (w >= 0 && w < q.wk.length) { q.wk[w]++; q.n++; q.cost += b.cost || 0; } });
        if (!j.doneError) yd.tasks = t; else as.err[y + ":tasks"] = { at: Date.now(), msg: describeTasks({ code: j.doneError }) };
        if (!j.boughtError) yd.queue = q;
      });
    });
    if (canHabits() && want("habits")) asRun(y, "habits", function () {
      return api({ action: "habits", from: ymd(jan1), to: last }).then(function (j) {
        var h = { at: Date.now(), wk: asZeros(y), med: 0, walk: 0, water: 0, run: 0, first: "" }, run = 0, prev = "";
        (j.days || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (d) {
          var w = asWk(y, d.date); if (w < 0 || w >= h.wk.length) return;
          if (!h.first) h.first = d.date;
          if (d.med) { h.wk[w]++; h.med++; run = prev && daysBetween(prev, d.date) === 1 ? run + 1 : 1; prev = d.date; h.run = Math.max(h.run, run); }
          if (d.walk) h.walk++;
          if (d.water != null && d.water >= waterGoal(d.date)) h.water++;
        });
        yd.habits = h;
      });
    });
    if (canReviews() && want("review")) asRun(y, "review", function () {
      return api({ action: "reviews", limit: 104 }).then(function (j) {
        var r = { at: Date.now(), wk: asZeros(y) };
        (j.reviews || []).forEach(function (x) { var w = x.week ? asWk(y, x.week) : -1; if (w >= 0 && w < r.wk.length) r.wk[w] = 1; });
        yd.review = r;
      });
    });
    if (canLibrary() && want("library")) asRun(y, "library", function () {
      var got = lb.data && Date.now() - lb.data.fetched < 300000 ? Promise.resolve({ books: books() }) : api({ action: "library" });
      return got.then(function (j) {
        var l = { at: Date.now(), wk: asZeros(y), rated: 0, sum: 0, top: null, reading: 0 };
        (j.books || []).forEach(function (b) {
          if (b.status === "reading") l.reading++;
          if (b.status !== "read" || !b.finished || +b.finished.slice(0, 4) !== y) return;
          var w = asWk(y, b.finished); if (w >= 0 && w < l.wk.length) l.wk[w]++;
          if (b.rating) { l.rated++; l.sum += b.rating; if (!l.top || b.rating > l.top.rating || (b.rating === l.top.rating && b.finished > l.top.finished)) l.top = { title: b.title, rating: b.rating, finished: b.finished }; }
        });
        yd.library = l;
      });
    });
    if (canTarot() && want("tarot")) asRun(y, "tarot", function () {
      return api({ action: "tarot", from: ymd(jan1), to: y + "-12-31" }).then(function (j) {
        var t = { at: Date.now(), wk: asZeros(y), cards: {}, n: 0, major: 0 };
        (j.readings || []).forEach(function (r) {
          var w = r.day ? asWk(y, r.day) : -1; if (w < 0 || w >= t.wk.length) return;
          t.wk[w]++;
          (r.cards || []).forEach(function (c) { if (!c || !c.id) return; t.cards[c.id] = (t.cards[c.id] || 0) + 1; t.n++; if (c.id[0] === "M") t.major++; });
        });
        yd.tarot = t;
      });
    });
    if (canSciLog() && want("science")) asRun(y, "science", function () {
      return api({ action: "sciencelog", from: ymd(jan1), to: last }).then(function (j) {
        var o = { at: Date.now(), wk: asZeros(y), dept: {}, starred: [] };
        (j.events || []).forEach(function (e) {
          var d = e.at ? ymd(new Date(e.at)) : ""; if (+d.slice(0, 4) !== y) return;
          var w = asWk(y, d); if (w < 0 || w >= o.wk.length) return;
          o.wk[w]++; if (e.dept) o.dept[e.dept] = (o.dept[e.dept] || 0) + 1;
          if (e.starred) o.starred.push({ day: d, title: e.title });
        });
        yd.science = o;
      });
    });
    if (canApiary() && want("apiary")) asRun(y, "apiary", function () {
      var got = ap.data && Date.now() - ap.data.fetched < 300000 ? Promise.resolve(ap.data) : api({ action: "apiary" });
      return got.then(function (j) {
        var a = { at: Date.now(), wk: asZeros(y), honey: 0, pulls: 0, mites: null }, names = {};
        (j.hives || []).forEach(function (h) { names[h.id] = h.name; });
        (j.checks || []).forEach(function (c) {
          var w = c.day ? asWk(y, c.day) : -1; if (w < 0 || w >= a.wk.length || +c.day.slice(0, 4) !== y) return;
          a.wk[w]++;
          if (c.honey) { a.honey += c.honey; a.pulls++; }
          if (c.mites != null && (!a.mites || c.mites > a.mites.v)) a.mites = { v: c.mites, hive: names[c.hive] || "", m: +c.day.slice(5, 7) - 1 };
        });
        yd.apiary = a;
      });
    });
  }
  /* The calendars eight weeks at a time, oldest first; weeks already complete are kept and not asked for again. */
  function asCal(y, force) {
    var yd = asYd(y), c = yd.cal && yd.cal.wk && yd.cal.wk.length === asCols(y) && !force ? yd.cal : { wk: asZeros(y).map(function () { return [0, 0, 0, 0]; }), through: -1 };
    var nowW = asNowW(y), stop = new Date(Math.min(addDays(sod(new Date()), 1).getTime(), new Date(y + 1, 0, 1).getTime()));
    var chunks = [], fresh = {};
    for (var w = 0; w <= nowW; w += AS_CHUNK) if (w + AS_CHUNK - 1 > c.through) chunks.push(w);
    var step = function (i) {
      if (i >= chunks.length) { c.at = Date.now(); yd.cal = c; return Promise.resolve(); }
      var w0 = chunks[i], from = asStart(y, w0), to = new Date(Math.min(asStart(y, w0 + AS_CHUNK).getTime(), stop.getTime()));
      return api({ action: "events", from: from.getTime(), to: to.getTime() }).then(function (j) {
        var list = (j.events || []).filter(function (ev) { return asBreak(ev) || !ignored(ev); }), now = new Date();
        for (var d = new Date(from); d < to; d = addDays(d, 1)) {
          if (d.getFullYear() !== y || d > now) continue;
          var wi = asWk(y, ymd(d)), timed = dayEvents(list, d).timed, end = sameDay(d, now) ? posInDay(now, sod(now)) : 24;
          if (!fresh[wi]) { c.wk[wi] = [0, 0, 0, 0]; fresh[wi] = 1; }   /* a week asked for again starts from zero */
          AS_AREAS.forEach(function (a, k) { c.wk[wi][k] += unionHours(timed.filter(function (e) { return e.area === a; }), d, 0, end); });
        }
        c.through = Math.max(c.through, Math.min(w0 + AS_CHUNK - 1, nowW - 1));
        yd.cal = Object.assign({}, c, { at: yd.cal ? yd.cal.at : 0 });
        if (state.screen === "astrometrics") render(true);
        return step(i + 1);
      });
    };
    return step(0).then(function () { c.wk = c.wk.map(function (x) { return x.map(function (h) { return Math.round(h * 10) / 10; }); }); yd.cal = c; });
  }
  /* Upkeep marked done on this iPad (2.40 keeps each day); the Log's days only while unlocked here (memory). */
  function asUpkeepDone(u) { u.hist = (u.hist || []).concat([ymd(new Date())]).slice(-400); }
  function asLocal(y, id) {
    var wk = asZeros(y), any = false;
    if (id === "upkeep") upkeepItems().forEach(function (u) { (u.hist || []).forEach(function (d) { var w = asWk(y, d); if (+d.slice(0, 4) === y && w >= 0 && w < wk.length) { wk[w]++; any = true; } }); });
    if (id === "log" && as.log) Object.keys(as.log).forEach(function (d) { var w = asWk(y, d); if (+d.slice(0, 4) === y && w >= 0 && w < wk.length) { wk[w]++; any = true; } });
    return any ? wk : null;
  }
  /* One row: { v: values (null before its first record or after this week), locked, wait } */
  function asRow(y, id) {
    var yd = asYd(y), nowW = asNowW(y), raw = null;
    if (id === "log" && !as.log) return { locked: true, v: [] };
    if (id === "cal") raw = yd.cal ? yd.cal.wk.map(function (x) { return x[0] + x[1] + x[2] + x[3]; }) : null;
    else if (id === "upkeep" || id === "log") raw = asLocal(y, id);
    else raw = yd[id] ? yd[id].wk : null;
    if (!raw) return { wait: !!as.busy[y + ":" + (id === "tasks" || id === "queue" ? "year" : id)], none: true, v: [] };
    var first = -1;
    for (var i = 0; i < raw.length; i++) if (raw[i]) { first = i; break; }
    if (id === "cal") first = 0;
    var v = raw.map(function (x, w) { return w > nowW || first < 0 || w < first ? null : Math.round(x * 10) / 10; });
    return { v: v, first: first };
  }
  function asTotal(r) { return Math.round(r.v.reduce(function (s, x) { return s + (x || 0); }, 0) * 10) / 10; }
  function asPeak(r) { var b = -1, bw = -1; r.v.forEach(function (x, w) { if (x !== null && x > b) { b = x; bw = w; } }); return b > 0 ? bw : -1; }
  function asRunW(r) { var best = 0, cur = 0; r.v.forEach(function (x) { if (x) { cur++; best = Math.max(best, cur); } else if (x === 0) cur = 0; }); return best; }
  function asCount(r) { return r.v.filter(function (x) { return x !== null; }).length; }
  function asLevel(r, x) {
    var mx = Math.max.apply(null, r.v.map(function (z) { return z || 0; }));
    if (!x || !mx) return 0;
    var f = x / mx; return f > .75 ? 4 : f > .5 ? 3 : f > .25 ? 2 : 1;
  }
  function asMonthly(y, r, k) {
    var out = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], cal = asYd(y).cal;
    r.v.forEach(function (x, w) { if (x !== null) out[asMonth(y, w)] += k == null ? x : cal.wk[w][k]; });
    return out.map(function (x) { return Math.round(x * 10) / 10; });
  }
  function asAreaTotal(y, k) { var r = asRow(y, "cal"); return Math.round(r.v.reduce(function (s, x, w) { return s + (x === null ? 0 : asYd(y).cal.wk[w][k]); }, 0)); }
  function asHrs(n) { return n >= 100 ? fmtN(Math.round(n)) : String(Math.round(n * 10) / 10); }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function asCellText(y, id, w) {
    var row = asRow(y, id), x = row.v[w], name = AS_ROWS.filter(function (r) { return r.id === id; })[0].name;
    if (row.locked) return "Locked. Unlock LOG to see which days you wrote (only how many; the words stay in LOG).";
    if (w > asNowW(y)) return "Still ahead.";
    if (x === null || x === undefined) return "No " + name.toLowerCase() + " records yet this early in the year.";
    var t;
    if (id === "cal") { var c = asYd(y).cal.wk[w]; t = asHrs(x) + " h planned: " + AS_AREAS.map(function (a, k) { return (a === "hobby" ? "growth" : a) + " " + asHrs(c[k]); }).filter(function (s, k) { return AS_AREAS[k] === "work" || AS_AREAS[k] === "personal" || c[k]; }).join(", ") + "."; }
    else if (id === "tasks") t = x + (x === 1 ? " task" : " tasks") + " done.";
    else if (id === "habits") t = "Meditated " + x + " of 7 days.";
    else if (id === "log") t = "Wrote on " + x + " of 7 days.";
    else if (id === "review") t = x ? "Weekly review saved." : "No review saved.";
    else if (id === "library") t = x ? x + (x === 1 ? " book" : " books") + " finished." : "No book finished.";
    else if (id === "tarot") t = x + (x === 1 ? " reading." : " readings.");
    else if (id === "apiary") t = x + (x === 1 ? " hive check." : " hive checks.");
    else if (id === "queue") t = x + (x === 1 ? " item" : " items") + " bought from the queue.";
    else if (id === "science") t = x + (x === 1 ? " event" : " events") + " logged by SCIENCE.";
    else t = x + (x === 1 ? " upkeep item" : " upkeep items") + " done.";
    var flat = AS_ROWS.filter(function (r) { return r.id === id; })[0].flat;
    if (!flat && w === asPeak(row)) t += " ✦ The busiest week of the year for " + name + ".";
    return t;
  }
  /* Key dates that fall in the year: one-offs by their date, yearly ones on this year's day. */
  function asKeyDates(y) {
    var out = {};
    ((state.dates && state.dates.dates) || []).forEach(function (d) {
      if (!d.start) return;
      var day = d.yearly ? y + d.start.slice(4) : d.start;
      if (+day.slice(0, 4) !== y) return;
      var w = asWk(y, day); (out[w] = out[w] || []).push(d.title);
    });
    ((asYd(y).science && asYd(y).science.starred) || []).forEach(function (e) { var w = asWk(y, e.day); (out[w] = out[w] || []).push("★ " + e.title); });   /* SCIENCE events of interest */
    return out;
  }

  /* ---- the screen ---- */
  function astroHead() {
    var now = new Date(), y = as.y, cur = y === now.getFullYear();
    var doy = Math.round((sod(now) - new Date(y, 0, 1)) / 864e5) + 1;
    return { e: "ASTROMETRICS · " + (cur ? "THE YEAR SO FAR" : "THE YEAR IN FULL"), t: cur ? y + " · DAY " + doy : String(y) };
  }
  function renderAstro() {
    var y = as.y;
    asLoad(y, false);
    loadDates(false);
    var rows = asRows(), html = '<div class="as">' + shipPanel(y);
    html += asTiles(y, rows);
    html += '<section class="as-panel" style="--c: var(--hero)">' + phead("STAR CHART", asCols(y) + " WEEKS · TAP A WEEK OR A ROW", "hero") + '<div class="as-wrap" id="asWrap">' + asChart(y, rows) + "</div>" +
      '<div class="as-legend"><span>LESS <span class="as-ramp"><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></span> MORE</span>' +
      "<span>✦ each row's busiest week (each row is shaded against itself)</span><span><i class=\"as-sw pre\"></i>before its first record this year</span><span><b class=\"as-kdi\">✦</b> key date</span></div>" +
      '<div class="as-readout" aria-live="polite" id="asReadout">' + asReadout(y) + "</div></section>";
    html += asSector(y, rows);
    html += asFoot(y);
    var old = $("asWrap"), keepX = old && as.placed ? old.scrollLeft : null;
    $("content").innerHTML = html + "</div>";
    if (keepX !== null && $("asWrap")) $("asWrap").scrollLeft = keepX;   /* a redraw keeps the chart where it was scrolled */
    asPlace();
    shipLoop();
  }
  function asTiles(y, rows) {
    var has = function (id) { return rows.some(function (r) { return r.id === id; }); }, T = [];
    var tile = function (id, k, v, u, s, c, lock) { T.push('<button type="button" class="as-tile' + (lock ? " locked" : "") + '" data-asrow="' + id + '" style="--c: var(--' + c + ')"><span class="k">' + k + '</span><span class="v tnum">' + v + (u ? "<small>" + u + "</small>" : "") + '</span><span class="s">' + s + "</span></button>"); };
    var dash = function (r) { return r.none ? "–" : null; };
    if (has("tasks")) { var t = asRow(y, "tasks"), tp = asPeak(t); tile("tasks", "TASKS DONE", dash(t) || fmtN(asTotal(t)), "", t.none ? "WAITING" : tp > -1 ? "BEST " + asWkLabel(y, tp).split(" · ")[0] : "", "personal"); }
    var c = asRow(y, "cal"); tile("cal", "HOURS PLANNED", dash(c) || asHrs(asTotal(c)), "h", c.none ? "WAITING" : asTotal(c) ? "WORK " + Math.round(asAreaTotal(y, 0) / asTotal(c) * 100) + "% OF IT" : "", "work");
    if (has("library")) { var l = asRow(y, "library"), ld = asYd(y).library; tile("library", "BOOKS FINISHED", l.none ? (ld ? "0" : "–") : asTotal(l), "", ld && ld.rated ? "AVG " + (Math.round(ld.sum / ld.rated * 10) / 10) + "★" : ld ? "" : "WAITING", "chrome-d"); }
    if (has("log")) { var g = asRow(y, "log"); tile("log", "LOG DAYS", g.locked ? "LOCKED" : g.none ? "0" : asTotal(g), "", g.locked ? "UNLOCK IN LOG" : "COUNTS ONLY", "chrome-c", g.locked); }
    if (has("apiary") && asYd(y).apiary && asYd(y).apiary.honey) tile("apiary", "HONEY", Math.round(asYd(y).apiary.honey * 10) / 10, "lb", asYd(y).apiary.pulls + (asYd(y).apiary.pulls === 1 ? " PULL" : " PULLS"), "farm");
    else if (has("tarot")) { var tr2 = asRow(y, "tarot"); tile("tarot", "TAROT READINGS", tr2.none ? (asYd(y).tarot ? "0" : "–") : asTotal(tr2), "", "", "chrome-c"); }
    if (has("review")) { var r = asRow(y, "review"); tile("review", "REVIEWS", r.none ? (asYd(y).review ? "0" : "–") : asTotal(r), r.none ? "" : "/ " + asCount(r), r.none ? "" : "RUN OF " + asRunW(r) + (asRunW(r) === 1 ? " WEEK" : " WEEKS"), "chrome-a"); }
    return '<section class="as-sweep">' + phead("SENSOR SWEEP", y === new Date().getFullYear() ? "1 JAN TO TODAY" : "THE WHOLE YEAR", "chrome-b") + '<div class="as-tiles">' + T.slice(0, 6).join("") + "</div></section>";
  }
  function asChart(y, rows) {
    var n = asCols(y), nowW = asNowW(y), kd = asKeyDates(y), h = '<div class="as-chart" id="asChart" style="--n: ' + n + '"><span class="as-lab0"></span>', lastM = -1;
    for (var w = 0; w < n; w++) { var m = asMonth(y, w); h += '<span class="as-mo">' + (m !== lastM ? MON[m] : "") + "</span>"; lastM = m; }
    h += '<span class="as-rowlab kd"><i></i>KEY DATES</span>';
    for (w = 0; w < n; w++) h += kd[w] ? '<button type="button" class="as-kd' + (w > nowW ? " fut" : "") + '" data-askd="' + w + '" aria-label="' + esc(asWkLabel(y, w)) + ', key date">✦</button>' : "<span></span>";
    rows.forEach(function (row) {
      var r = asRow(y, row.id), pk = row.flat ? -1 : asPeak(r);
      h += '<button type="button" class="as-rowlab" data-asrow="' + row.id + '" aria-pressed="' + (row.id === as.sel) + '" style="--c: var(--' + row.c + ')"><i></i>' + row.name + "</button>";
      for (var w2 = 0; w2 < n; w2++) {
        var x = r.v[w2], cls = "as-cell";
        if (w2 > nowW) cls += " fut";
        else if (r.locked) cls += " lock";
        else if (r.none) cls += r.wait ? " wait" : " pre";
        else if (x === null) cls += " pre";
        else { cls += " l" + asLevel(r, x); if (w2 === pk) cls += " peak"; }
        if (as.cell && as.cell[0] === row.id && as.cell[1] === w2) cls += " on";
        h += '<button type="button" class="' + cls + '" data-ascell="' + row.id + ":" + w2 + '" aria-label="' + row.name + ", " + esc(asWkLabel(y, w2)) + '"></button>';
      }
    });
    return h + "</div>";
  }
  /* The TODAY line, placed after drawing; on a narrow screen the chart opens scrolled to it. */
  function asPlace() {
    var ch = $("asChart"), y = as.y, nowW = asNowW(y);
    if (!ch || y !== new Date().getFullYear()) return;
    var cell = ch.querySelector('[data-ascell$=":' + nowW + '"]');
    if (!cell) return;
    var mark = document.createElement("div"); mark.className = "as-today"; mark.style.left = (cell.offsetLeft + cell.offsetWidth + 1) + "px"; mark.innerHTML = "<b>TODAY</b>";
    ch.appendChild(mark);
    var wrap = $("asWrap");
    if (!as.placed && wrap && wrap.scrollWidth > wrap.clientWidth) { wrap.scrollLeft = Math.max(0, mark.offsetLeft - wrap.clientWidth + 60); as.placed = true; }
  }
  function asReadout(y) {
    if (as.cell) return "<b>" + esc(AS_ROWS.filter(function (r) { return r.id === as.cell[0]; })[0].name + " · " + asWkLabel(y, as.cell[1])) + "</b><span>" + esc(asCellText(y, as.cell[0], as.cell[1])) + "</span>";
    if (as.kd != null) return "<b>" + esc(asWkLabel(y, as.kd)) + "</b><span>" + esc("Key date" + ((asKeyDates(y)[as.kd] || []).length > 1 ? "s: " : ": ") + (asKeyDates(y)[as.kd] || []).join(", ") + ".") + "</span>";
    return "<b>READOUT</b><span>Tap any week for its numbers. Tap a row name for that sector below.</span>";
  }
  function asSector(y, rows) {
    var row = rows.filter(function (r) { return r.id === as.sel; })[0] || rows[0];
    as.sel = row.id;
    var r = asRow(y, row.id), body;
    if (r.locked) body = '<div class="as-lock">Captain\'s Log is locked. Unlock it and this sector shows which days you wrote: only how many. The words stay in LOG, and the Ship\'s Year never sees the Log.' +
      '<div class="btnrow"><button type="button" class="btn sm" data-as="unlock">UNLOCK LOG</button></div></div>';
    else if (r.none) body = '<div class="empty">' + (r.wait ? "Reading " + row.name.toLowerCase() + " for " + y + "…" : as.err[y + ":" + row.id] ? esc(as.err[y + ":" + row.id].msg) : "Nothing recorded in " + y + " yet.") + "</div>";
    else body = '<div class="as-sector"><div class="as-bars">' + asBars(y, row, r) + '</div><ul class="as-facts">' + asFacts(y, row, r).map(function (f) { return "<li><span>" + f[0] + (f[1] ? "<small>" + esc(f[1]) + "</small>" : "") + "</span></li>"; }).join("") + "</ul></div>";
    return '<section class="as-panel" style="--c: var(--' + row.c + ')">' + phead("SECTOR · " + row.name, row.id === "cal" ? "HOURS BY MONTH · BY AREA" : "BY MONTH", row.c) + body + "</section>";
  }
  function asBars(y, row, r) {
    var areas = row.id === "cal" ? AS_AREAS.filter(function (a) { return LIVE.indexOf(a) > -1; }) : null;
    var series = areas ? areas.map(function (a) { return asMonthly(y, r, AS_AREAS.indexOf(a)); }) : [asMonthly(y, r)];
    var tot = series[0].map(function (_, m) { return series.reduce(function (s, x) { return s + x[m]; }, 0); });
    var W = 560, H = 210, L = 34, B = 22, T = 18, slot = (W - L) / 12, bw = Math.min(30, slot - 8), mx = Math.max.apply(null, tot) || 1;
    var nice = Math.ceil(mx * 1.12 / 4) * 4 || 4, yy = function (v) { return T + (H - T - B) * (1 - v / nice); }, best = tot.indexOf(Math.max.apply(null, tot));
    var lastM = y === new Date().getFullYear() ? new Date().getMonth() : 11;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + row.name + ' by month">';
    [0, .5, 1].forEach(function (f) { var v = yy(nice * f); s += '<line x1="' + L + '" x2="' + W + '" y1="' + v + '" y2="' + v + '" class="gl"/><text class="ax" x="' + (L - 6) + '" y="' + (v + 4) + '" text-anchor="end">' + Math.round(nice * f) + "</text>"; });
    for (var m = 0; m < 12; m++) {
      var x = L + m * slot + (slot - bw) / 2, base = 0;
      s += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + MON[m].charAt(0) + MON[m].slice(1).toLowerCase() + "</text>";
      if (m > lastM) { s += '<circle cx="' + (x + bw / 2) + '" cy="' + (yy(0) - 3) + '" r="1.5" class="fut"/>'; continue; }
      s += '<rect class="hitm" data-asbar="' + m + '" x="' + (x - 4) + '" y="' + T + '" width="' + (bw + 8) + '" height="' + (H - T - B) + '"/>';
      series.forEach(function (ser, i) {
        var v = ser[m]; if (!v) return;
        var y1 = yy(base + v), hh = Math.max(0, yy(base) - y1 - (base ? 2 : 0));
        s += '<rect class="b" data-asbar="' + m + '" x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + hh + '" rx="' + (i === series.length - 1 ? 4 : 1.5) + '" style="fill: var(--' + (areas ? areas[i] : row.c) + ')"/>';
        base += v;
      });
      if (m === best && tot[m]) s += '<text class="vl" x="' + (x + bw / 2) + '" y="' + (yy(tot[m]) - 5) + '" text-anchor="middle">' + asHrs(tot[m]) + "</text>";
    }
    s += "</svg>";
    var bm = as.bar != null && as.bar <= lastM ? as.bar : best, lg = areas ? '<div class="as-blegend">' + areas.map(function (a) { return '<span><i style="background: var(--' + a + ')"></i>' + AREAS[a].name + "</span>"; }).join("") + "</div>" : "";
    var line = areas ? asHrs(tot[bm]) + " h: " + areas.map(function (a, i) { return AREAS[a].name.toLowerCase() + " " + asHrs(series[i][bm]); }).join(", ") + "." : asMonthText(row, series[0][bm]);
    return lg + s + '<div class="as-readout sm"><b>' + MONL[bm] + "</b><span>" + esc(line) + "</span></div>";
  }
  function asMonthText(row, v) {
    var u = { tasks: ["task done", "tasks done"], habits: ["day meditated", "days meditated"], log: ["day written", "days written"], review: ["weekly review", "weekly reviews"], library: ["book finished", "books finished"],
      tarot: ["reading", "readings"], apiary: ["hive check", "hive checks"], queue: ["item bought", "items bought"], upkeep: ["upkeep item done", "upkeep items done"], science: ["event logged", "events logged"] }[row.id];
    return v + " " + (v === 1 ? u[0] : u[1]) + ".";
  }
  function asFacts(y, row, r) {
    var t = asTotal(r), pk = asPeak(r), yd = asYd(y), F = [], big = function (v) { return '<span class="big tnum">' + v + "</span>"; };
    if (row.id === "cal") {
      F.push([big(asHrs(t) + " h"), "on the calendars"]);
      var parts = AS_AREAS.filter(function (a) { return LIVE.indexOf(a) > -1; }).map(function (a) { return AREAS[a].name.toLowerCase() + " " + fmtN(asAreaTotal(y, AS_AREAS.indexOf(a))) + " h"; });
      F.push([esc(parts.slice(0, 2).join(" · ")), parts.slice(2).join(" · ")]);
      if (pk > -1) F.push(["Busiest: " + esc(asWkLabel(y, pk)), asHrs(r.v[pk]) + " h"]);
      F.push(["Ignored titles and breaks left out", "counted as REVIEW counts them"]);
    } else if (row.id === "tasks") {
      F.push([big(t), "tasks done"]);
      if (pk > -1) F.push(["Best: " + esc(asWkLabel(y, pk)), r.v[pk] + " done"]);
      var ar = Object.keys(yd.tasks.area).sort(function (a, b) { return yd.tasks.area[b] - yd.tasks.area[a]; });
      if (ar.length) F.push(["Most done in " + AREAS[ar[0]].name, ar.slice(1).map(function (a) { return AREAS[a].name; }).join(", ") ? "then " + ar.slice(1).map(function (a) { return AREAS[a].name; }).join(", ") : ""]);
      F.push(["Counted on the day each was last edited", "Notion keeps no finished date"]);
    } else if (row.id === "habits") {
      F.push([big(t), "days meditated" + (yd.habits.first ? ", since " + shortDay(yd.habits.first) : "")]);
      F.push(["Longest run: " + yd.habits.run + (yd.habits.run === 1 ? " day" : " days"), "meditated, day after day"]);
      F.push(["Evening walks: " + yd.habits.walk, "water goal met on " + yd.habits.water + (yd.habits.water === 1 ? " day" : " days")]);
    } else if (row.id === "log") {
      F.push([big(t), "days written"]);
      F.push(["Longest run: " + asRunW(r) + (asRunW(r) === 1 ? " week" : " weeks"), "with at least one entry"]);
      F.push(["Only how many", "the words stay in LOG; held until the app is put away"]);
    } else if (row.id === "review") {
      F.push([big(t + " / " + asCount(r)), "weeks reviewed"]);
      F.push(["Longest run: " + asRunW(r) + (asRunW(r) === 1 ? " week" : " weeks"), ""]);
    } else if (row.id === "library") {
      var lb2 = yd.library;
      F.push([big(t), t === 1 ? "book finished" : "books finished"]);
      if (lb2.top) F.push(["Highest rated: " + esc(lb2.top.title), lb2.top.rating + "★"]);
      F.push([lb2.rated ? "Average " + (Math.round(lb2.sum / lb2.rated * 10) / 10) + "★" : "No ratings yet", "reading now: " + lb2.reading]);
    } else if (row.id === "tarot") {
      var tc = yd.tarot, topc = Object.keys(tc.cards).sort(function (a, b) { return tc.cards[b] - tc.cards[a]; })[0];
      F.push([big(t), t === 1 ? "reading" : "readings"]);
      if (topc) F.push(["Most drawn: " + esc(trName(topc)), tc.cards[topc] + (tc.cards[topc] === 1 ? " time" : " times")]);
      if (tc.n) F.push(["Major Arcana: " + Math.round(tc.major / tc.n * 100) + "% of cards", tc.n + " cards in all"]);
    } else if (row.id === "apiary") {
      var a = yd.apiary;
      F.push([big(t), t === 1 ? "hive check" : "hive checks"]);
      F.push(["Honey: " + (Math.round(a.honey * 10) / 10) + " lb", a.pulls ? a.pulls + (a.pulls === 1 ? " pull" : " pulls") : "none recorded"]);
      if (a.mites) F.push(["Mites peaked at " + a.mites.v + "%", (a.mites.hive ? a.mites.hive + ", " : "") + MONL[a.mites.m].charAt(0) + MONL[a.mites.m].slice(1).toLowerCase()]);
    } else if (row.id === "queue") {
      F.push([big(t), t === 1 ? "item bought from the Replicator Queue" : "items bought from the Replicator Queue"]);
      if (yd.queue.cost) F.push(["$" + fmtN(Math.round(yd.queue.cost)) + " in all", "from the Cost column"]);
    } else if (row.id === "science") {
      var sd = yd.science.dept;
      F.push([big(t), t === 1 ? "event logged by SCIENCE" : "events logged by SCIENCE"]);
      F.push([esc(Object.keys(sd).sort(function (a, b) { return sd[b] - sd[a]; }).map(function (k) { return SCI_DEPTS[k][0].toLowerCase() + " " + sd[k]; }).join(" · ")), "by department"]);
      F.push([yd.science.starred.length + " starred", "on the key-date line above"]);
    } else {
      F.push([big(t), "upkeep items marked done"]);
      F.push(["Kept on this iPad since 2.40", "earlier ones only show their last date in ENGINEERING"]);
    }
    return F;
  }
  function asFoot(y) {
    var parts = ["cal", "year", "habits", "review", "library", "tarot", "apiary"], busy = asPending(y), yd = asYd(y);
    var ats = Object.keys(yd).map(function (k) { return yd[k] && yd[k].at; }).filter(Boolean), at = ats.length ? Math.min.apply(null, ats) : 0;
    var errs = parts.map(function (p) { return as.err[y + ":" + p]; }).filter(Boolean).map(function (e) { return e.msg; });
    var need = canYear() ? "" : "TASKS and QUEUE need the Google bridge updated. ";
    return '<div class="as-foot"><small class="muted">' + (busy ? "Reading " + y + " from the bridge…" : at ? "Read " + esc(stamp(at)) + "." : "") + " " + need +
      (errs.length ? '<span class="warntxt">' + esc(errs[0]) + "</span>" : "") + "</small>" +
      '<button type="button" class="chip sm" data-as="rescan"' + (busy ? " disabled" : "") + ">RESCAN</button></div>";
  }
  function astroClick(b) {
    if (state.screen !== "astrometrics") return false;
    var d = b.dataset;
    if (d.asrow) { as.sel = d.asrow; as.bar = null; render(true); if (b.classList.contains("as-tile")) { var p = document.querySelectorAll(".as-panel")[1]; if (p) p.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "nearest" }); } return true; }
    if (d.ascell) { var c = d.ascell.split(":"); as.cell = [c[0], +c[1]]; as.kd = null; as.sel = c[0]; as.bar = asMonth(as.y, +c[1]); render(true); return true; }
    if (d.askd) { as.kd = +d.askd; as.cell = null; render(true); return true; }
    if (d.as === "rescan") { as.err = {}; asLoad(as.y, true); render(true); return true; }
    if (d.as === "unlock") { go("log"); lg.after = "astro"; return true; }
    if (d.ship) return shipClick(d.ship);
    return false;
  }
  function asBarClick(el) { as.bar = +el.getAttribute("data-asbar"); render(true); }
  function asYear(dir) {
    var y = as.y + dir, now = new Date().getFullYear();
    if (y > now || y < 2000) return;
    as.y = y; as.cell = null; as.kd = null; as.bar = null; as.placed = false;
    shipQuiet(); render(false); enterScreen();
  }
  /* LOG unlocked for ASTROMETRICS: the days written come back with us (counts only), then LOG locks as always. */
  function asFromLog() { as.log = Object.assign({}, lg.dates || {}); as.sel = "log"; go("astrometrics"); }
  document.addEventListener("visibilitychange", function () { if (document.hidden) as.log = null; });   /* put away: the Log's days are forgotten */

  /* ---- the Ship's Year ---- */
  function shipFor(y) { return as.ship[y] || null; }
  function shipPanel(y) {
    if (!state.conn || !canAsk()) return "";
    var s = shipFor(y), cur = y === new Date().getFullYear();
    if (!canShipsYear()) return '<div class="as-fold"><b>SHIP\'S YEAR</b><span>Needs the Google bridge updated (Ask Claude is already on).</span></div>';
    if (as.shipBusy) return '<section class="br as-ship" aria-busy="true">' + phead("SHIP'S YEAR", "COMPILING · SONNET", "chrome-a") + '<div class="br-comp">Reading the counts for ' + y + "…<br><b>› Sonnet writing the Ship's Year…</b></div><div class=\"br-sweep\"><i></i></div></section>";
    if (!s || as.fold[y]) return '<button type="button" class="as-fold" data-ship="' + (s ? "open" : "now") + '"><b>SHIP\'S YEAR</b><span>' +
      (s ? esc(s.paras[0].text) : as.shipErr ? esc(as.shipErr) : cur ? "Compiles at 06:00 on 31 December. Tap for the year so far, now." : "Tap to compile " + y + ".") + '</span><span class="btn sm" aria-hidden="true">' + (s ? "OPEN" : "COMPILE") + "</span></button>";
    if (!s.typed && !document.hidden) { s.typed = true; lsSet(LS_SHIPYEAR, as.ship); as.typeT0 = calm() ? 0 : performance.now(); }
    var segs = briefSegs(s), n = as.typeT0 ? Math.floor((performance.now() - as.typeT0) / AS_TYPE_MS * briefLen(segs)) : null;
    return '<section class="br as-ship">' + phead("SHIP'S YEAR", (s.final ? y + " · COMPILED " : "YEAR SO FAR · ") + esc(shortDay(ymd(new Date(s.at)))) + " · " + modelName(s.model) + " · " + money(s.cost), "chrome-a",
      '<button type="button" class="ov-more" data-ship="fold" aria-expanded="true" aria-label="Fold the Ship\'s Year"></button>') +
      '<div class="br-paper" id="asPaper">' + briefHtml(segs, n, as.say) + "</div>" +
      '<div class="btnrow br-tools"><button type="button" class="btn sm br-say" data-ship="say" aria-pressed="' + as.speaking + '"><span class="br-bars" aria-hidden="true"><i></i><i></i><i></i></span>' + (as.prep ? "PREPARING VOICE…" : as.speaking ? "STOP READING" : "READ IT TO ME") + "</button>" +
      '<button type="button" class="btn sm ghost" data-ship="now">' + (cur ? "COMPILE AGAIN" : "REFRESH") + "</button>" +
      '<span class="muted">From counts only. Never the Log.</span></div></section>';
  }
  function shipLoop() {
    if (as.raf || !as.typeT0) return;
    var frame = function () {
      as.raf = 0;
      if (!as.typeT0) return;
      var el = $("asPaper"), s = shipFor(as.y);
      if (!el || !s || state.screen !== "astrometrics") { as.typeT0 = 0; return; }
      var segs = briefSegs(s), total = briefLen(segs), n = Math.floor((performance.now() - as.typeT0) / AS_TYPE_MS * total);
      if (n >= total) { as.typeT0 = 0; el.innerHTML = briefHtml(segs, null, as.say); return; }
      el.innerHTML = briefHtml(segs, n, as.say);
      as.raf = requestAnimationFrame(frame);
    };
    as.raf = requestAnimationFrame(frame);
  }
  /* Counts only, line by line. Never the Captain's Log; tarot, the apiary and the queue's spend follow SHARE WITH ASK. */
  function shipContext(y) {
    var now = new Date(), cur = y === now.getFullYear(), yd = asYd(y), L = [], has = function (id) { return asRows().some(function (r) { return r.id === id; }); };
    var doy = Math.round((sod(now) - new Date(y, 0, 1)) / 864e5) + 1, days = Math.round((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 864e5);
    L.push("SHIP'S YEAR " + y + ": " + (cur && !(now.getMonth() === 11 && now.getDate() === 31) ? "the year so far, day " + doy + " of " + days + " (through " + shortDay(ymd(now)) + ")" : "the whole year") + ". Weeks run Monday to Sunday.");
    var mline = function (arr) { return arr.map(function (v, m) { return MON[m] + " " + asHrs(v); }).filter(function (s, m) { return !cur || m <= now.getMonth(); }).join(", "); };
    var c = asRow(y, "cal");
    if (!c.none) {
      var live = AS_AREAS.filter(function (a) { return LIVE.indexOf(a) > -1; });
      L.push("CALENDAR HOURS: " + asHrs(asTotal(c)) + " h in all; " + live.map(function (a) { return AREAS[a].name.toLowerCase() + " " + asAreaTotal(y, AS_AREAS.indexOf(a)) + " h"; }).join(", ") + ".");
      live.forEach(function (a) { L.push("  " + AREAS[a].name.toLowerCase() + " hours by month: " + mline(asMonthly(y, c, AS_AREAS.indexOf(a)))); });
      var cp = asPeak(c); if (cp > -1) L.push("  busiest week: " + asWkLabel(y, cp) + ", " + asHrs(c.v[cp]) + " h.");
    }
    var t = has("tasks") && asRow(y, "tasks");
    if (t && !t.none) {
      var ar = yd.tasks.area, tp = asPeak(t);
      L.push("TASKS DONE: " + asTotal(t) + " (by area: " + Object.keys(ar).map(function (a) { return AREAS[a].name.toLowerCase() + " " + ar[a]; }).join(", ") + ")" + (tp > -1 ? "; best week " + asWkLabel(y, tp) + " with " + t.v[tp] : "") + ".");
      L.push("  by month: " + mline(asMonthly(y, t)));
    }
    var r = has("review") && asRow(y, "review");
    if (r && !r.none) L.push("WEEKLY REVIEWS: " + asTotal(r) + " of " + asCount(r) + " weeks since the first this year; longest run " + asRunW(r) + " weeks.");
    var h = has("habits") && yd.habits;
    if (h && h.first) L.push("HABITS (recorded from " + shortDay(h.first) + "): meditated " + h.med + " days, longest run " + h.run + " days; evening walk " + h.walk + " days; water goal met " + h.water + " days.");
    var lb3 = has("library") && yd.library;
    if (lb3) L.push("BOOKS FINISHED: " + asTotal(asRow(y, "library")) + (lb3.rated ? ", average rating " + (Math.round(lb3.sum / lb3.rated * 10) / 10) + " of 5" : "") + ".");
    if (has("tarot") && lsGet(LS_AITAROT) && yd.tarot) {
      var tc = yd.tarot, topc = Object.keys(tc.cards).sort(function (a, b) { return tc.cards[b] - tc.cards[a]; })[0];
      L.push("TAROT: " + asTotal(asRow(y, "tarot")) + " readings" + (topc ? "; most drawn " + trName(topc) + " (" + tc.cards[topc] + " times)" : "") + (tc.n ? "; Major Arcana " + Math.round(tc.major / tc.n * 100) + "% of cards" : "") + ".");
    }
    if (has("apiary") && lsGet(LS_AIAPIARY) && yd.apiary) {
      var a = yd.apiary;
      L.push("APIARY: " + asTotal(asRow(y, "apiary")) + " hive checks; honey " + (Math.round(a.honey * 10) / 10) + " lb" + (a.mites ? "; mites peaked at " + a.mites.v + "%" + (a.mites.hive ? " (" + a.mites.hive + ")" : "") + " in " + MONL[a.mites.m].toLowerCase() : "") + ".");
    }
    if (has("queue") && lsGet(LS_AIFIN) && yd.queue) L.push("REPLICATOR QUEUE: " + yd.queue.n + " items bought, $" + Math.round(yd.queue.cost) + " in all.");
    var u = has("upkeep") && asRow(y, "upkeep");
    if (u && !u.none) L.push("UPKEEP: " + asTotal(u) + " items marked done.");
    return L.join("\n");
  }
  function shipCompile(y, final) {
    if (!canShipsYear() || as.shipBusy) return;
    shipQuiet();
    as.shipBusy = true; as.shipErr = "";
    if (state.screen === "astrometrics") render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "year", messages: [{ role: "user", text: SHIP_ASK }], context: shipContext(y) }, 150000).then(function (j) {
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      var b = briefParse(j.reply);
      if (!b) throw { code: "brief_shape" };
      b.id = newCid(); b.y = y; b.at = Date.now(); b.final = !!final || y < new Date().getFullYear(); b.model = j.model || ""; b.cost = j.cost || 0; b.typed = false;
      delete b.headline;
      as.ship[y] = b; as.fold[y] = false; lsSet(LS_SHIPYEAR, as.ship);
      if (canVoice()) shipVoice(b);
    }).catch(function (err) {
      if (err && err.spend) { state.aiSpend = err.spend; lsSet(LS_AISPEND, err.spend); }
      as.shipErr = "Not compiled: " + (err && err.code === "brief_shape" ? "Claude's answer didn't come back in the Ship's Year's shape." : describeAi(err));
      as.shipErrAt = Date.now();
      if (shipFor(y)) toast(as.shipErr);
    }).then(function () { as.shipBusy = false; if (state.screen === "astrometrics") render(true); });
  }
  /* 31 December, the first open after 06:00: the year is read (if it isn't already), then written. */
  function shipMaybe() {
    var now = new Date(), y = now.getFullYear(), s = as.ship[y];
    if (!state.conn || !canShipsYear() || as.shipBusy || document.hidden || now.getMonth() !== 11 || now.getDate() !== 31 || minsOf(now) < BRIEF_FROM) return;
    if ((s && s.final) || (as.shipErrAt && Date.now() - as.shipErrAt < BRIEF_RETRY_MS)) return;
    asLoad(y, false);
    if (asPending(y)) return;   /* asLoad's last part calls back here */
    shipCompile(y, true);
  }
  function shipClick(d) {
    var y = as.y, s = shipFor(y);
    if (d === "now") { shipCompile(y, false); return true; }
    if (d === "fold") { as.fold[y] = true; as.typeT0 = 0; shipQuiet(); render(true); return true; }
    if (d === "open") { as.fold[y] = false; render(true); return true; }
    if (d === "say" && s) { shipSay(s); return true; }
    return true;
  }
  /* Nova, as for the briefing: asked for when it's written, kept on this iPad (IndexedDB "year"); Moira otherwise. */
  function shipTexts(b) { return vaTexts(b); }
  function shipKey(b) { return b.id + ":" + VA_SPEECH; }
  function shipIdb(rec) {
    return vaDb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction("clips", rec ? "readwrite" : "readonly"), st = tx.objectStore("clips");
        if (rec) { st.put(rec, "year"); tx.oncomplete = function () { res(rec); }; tx.onerror = function () { res(null); }; }
        else { var q = st.get("year"); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }
      });
    }).catch(function () { return null; });
  }
  function shipVoice(b) {
    if (!b || !canVoice()) return Promise.resolve(false);
    var k = shipKey(b);
    if (as.urls && as.at === k) return Promise.resolve(true);
    if (as.vbusy === k && as.vp) return as.vp;
    as.vbusy = k; as.verr = "";
    as.vp = shipIdb(null).then(function (rec) {
      if (rec && rec.at === k && rec.clips && rec.clips.length) return rec.clips;
      return apiPost({ action: "speak", texts: shipTexts(b) }, VA_TIMEOUT_MS, true).then(function (j) {
        if (j.spend) lsSet(LS_VOICESPEND, j.spend);
        var blobs = (j.clips || []).map(b64Blob);
        if (blobs.length) shipIdb({ at: k, clips: blobs });
        return blobs;
      });
    }).then(function (blobs) {
      if (!blobs.length) return false;
      (as.urls || []).forEach(function (u) { URL.revokeObjectURL(u); });
      as.urls = blobs.map(function (x) { return URL.createObjectURL(x); }); as.at = k;
      return true;
    }).catch(function (err) { as.verr = describeVoice(err); as.verrAt = Date.now(); return false; })
      .then(function (ok) { as.vbusy = ""; as.vp = null; return ok; });
    return as.vp;
  }
  function shipQuiet() {
    as.speaking = false; as.say = -1; as.prep = false;
    if (as.el) as.el.pause();
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
  }
  function shipPlay(i) {
    as.say = i; as.el.src = as.urls[i];
    var pr = as.el.play();
    if (pr && pr.catch) pr.catch(function () { if (as.speaking) { shipQuiet(); as.verr = "the iPad didn't let it play"; as.verrAt = Date.now(); toast("The AI voice couldn't start. Tap READ IT TO ME again for Moira."); render(true); } });
    if (state.screen === "astrometrics") render(true);
  }
  function shipSay(b) {
    if (as.speaking) { shipQuiet(); render(true); return; }
    briefQuiet(); as.typeT0 = 0;
    if (canVoice() && (!as.verr || Date.now() - as.verrAt > VA_RETRY_MS)) {
      if (!as.el) { as.el = new Audio(); as.el.addEventListener("ended", function () { if (!as.speaking || as.el.src.indexOf("blob:") !== 0) return; if (as.urls && as.say + 1 < as.urls.length) shipPlay(as.say + 1); else { shipQuiet(); render(true); } }); }
      as.speaking = true;
      if (as.urls && as.at === shipKey(b)) { shipPlay(0); return; }
      as.el.src = VA_SILENT; var pr = as.el.play(); if (pr && pr.catch) pr.catch(function () { /* the real clip tries */ });
      as.prep = true; render(true);
      shipVoice(b).then(function (ok) {
        as.prep = false;
        if (!as.speaking) return;
        if (ok) shipPlay(0); else { as.speaking = false; toast("The AI voice isn't available (" + as.verr + "). Tap READ IT TO ME again for Moira."); render(true); }
      });
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast("This iPad has no voice to read with."); return; }
    var texts = shipTexts(b), voice = briefVoice();
    try { speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ }
    as.speaking = true; as.say = 0;
    texts.forEach(function (t, i) {
      var u = new SpeechSynthesisUtterance(t);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
      u.onstart = function () { if (!as.speaking) return; as.say = i; if (state.screen === "astrometrics") render(true); };
      u.onend = u.onerror = function () { if (i === texts.length - 1 && as.speaking) { shipQuiet(); if (state.screen === "astrometrics") render(true); } };
      speechSynthesis.speak(u);
    });
    render(true);
  }

