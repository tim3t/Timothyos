  /* ---------- ON THIS DAY (2.81, bridge 1.48, D80; Timothy's approved mockup, 2026-11-13) ----------
     A Bridge panel under the three columns: this date in past years, or the week around it when the date itself is
     empty, from the calendars (never Work), tasks done, dinners, hive checks, books, tarot, the weekly review and habits
     (one bridge read, kept for the day), with that day's weather from Open-Meteo's archive (rounded coordinates only).
     Nothing from the Log: LOG locks whenever its screen is left, so the Bridge never sees it unlocked. Nothing here
     goes to ASK or the Morning Briefing. On a day with nothing in any year the panel isn't drawn. */
  var LS_OTD = "tos.otd.v1";
  var otd = { d: lsGet(LS_OTD), busy: false, err: 0, wxBusy: false };
  var OTD_K = { personal: ["PERSONAL", "--personal"], farm: ["FARM", "--farm"], hobby: ["GROWTH", "--hobby"], family: ["FAMILY", "--family"], tasks: ["TASKS DONE", "--chrome-b"],
    dinner: ["DINNER", "--chrome-d"], hive: ["HIVE CHECK", "--hero"], book: ["BOOK", "--chrome-c"], tarot: ["TAROT", "--chrome-a"], review: ["THE REVIEW", "--ok"], habits: ["HABITS", "--water"] };
  var OTD_ORDER = ["personal", "farm", "hobby", "family", "tasks", "dinner", "hive", "book", "tarot", "review", "habits"];
  var OTD_PARTIAL_MS = 30 * 60000;   /* an answer missing a source is asked for again after half an hour */
  function canOtd() { return state.caps.indexOf("onthisday") > -1; }
  function loadOtd() {
    var t = ymd(new Date()), have = otd.d && otd.d.today === t;
    if (!state.conn || !canOtd() || otd.busy || navigator.onLine === false) return;
    if (have && !(otd.d.partial && Date.now() - otd.d.partial > OTD_PARTIAL_MS)) { otdWeather(); return; }
    if (otd.err && Date.now() - otd.err < FRESH_MS) return;
    otd.busy = true;
    api({ action: "onthisday", today: t, years: 5 }).then(function (j) {
      otd.d = { today: t, years: j.years || [], wx: have ? otd.d.wx || {} : {}, partial: j.problems && j.problems.length ? Date.now() : 0 };
      lsSet(LS_OTD, otd.d); otd.err = 0;
      otdWeather();
    }, function () { otd.err = Date.now(); }).then(function () { otd.busy = false; if (state.screen === "bridge") render(true); });
  }
  /* a new or cleared location: the past days' weather is asked again (or not shown) */
  function otdWxReset() { if (otd.d) { otd.d.wx = {}; lsSet(LS_OTD, otd.d); } }
  /* each shown year's weather, once: high, low (°F), rain (in); kept with the day's answer */
  function otdWeather() {
    var here = place();
    if (!here || otd.wxBusy || !otd.d || navigator.onLine === false) return;
    var want = otdYears().map(function (v) { return v.y.date; }).filter(function (dt) { return !(dt in otd.d.wx); });
    if (!want.length) return;
    otd.wxBusy = true;
    var dt = want[0], u = "https://archive-api.open-meteo.com/v1/archive?latitude=" + here.lat + "&longitude=" + here.lon + "&start_date=" + dt + "&end_date=" + dt +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto";
    fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.json(); }).then(function (j) {
      var dd = j && j.daily, hi = dd && dd.temperature_2m_max && dd.temperature_2m_max[0], lo = dd && dd.temperature_2m_min && dd.temperature_2m_min[0], rain = dd && dd.precipitation_sum ? dd.precipitation_sum[0] : null;
      otd.d.wx[dt] = typeof hi === "number" && typeof lo === "number" ? { hi: Math.round(hi), lo: Math.round(lo), rain: typeof rain === "number" ? Math.round(rain * 100) / 100 : null } : null;
      lsSet(LS_OTD, otd.d);
      otd.wxBusy = false; if (state.screen === "bridge") render(true); otdWeather();
    }).catch(function () { otd.wxBusy = false; otd.d.wx[dt] = null; });   /* no weather for that day: the rest still shows */
  }

  /* ---- what each year holds: the date itself, else the week around it ---- */
  function otdItems(y) {   /* [kind, text, date] */
    var out = [], byDay = {};
    (y.events || []).forEach(function (e) { out.push([OTD_K[e.area] ? e.area : "personal", e.title + (e.time ? ", " + e.time : ""), e.date]); });
    (y.tasks || []).forEach(function (t) { (byDay[t.date] = byDay[t.date] || []).push(t.title); });
    Object.keys(byDay).forEach(function (dt) { var l = byDay[dt]; out.push(["tasks", l.length + " finished: " + l.join(" · "), dt]); });
    (y.dinners || []).forEach(function (x) { if (x.name) out.push(["dinner", x.name, x.date]); });
    (y.checks || []).forEach(function (c) { out.push(["hive", c.hive + (c.did ? ": " + c.did : "") + (typeof c.honey === "number" && c.honey > 0 ? " · " + c.honey + " lb honey" : ""), c.date]); });
    (y.books || []).forEach(function (b) { out.push(["book", "Finished " + b.title + (typeof b.rating === "number" ? " · " + b.rating + (b.rating === 1 ? " star" : " stars") : ""), b.date]); });
    (y.tarot || []).forEach(function (r) {
      var cards = (r.cards || []).map(function (c) { try { return trName(c.id) + (c.rev ? " (reversed)" : ""); } catch (e) { return ""; } }).filter(Boolean);
      if (cards.length) out.push(["tarot", cards.slice(0, 3).join(", ") + (cards.length > 3 ? " and " + (cards.length - 3) + " more" : "") + (r.spread ? ", in " + r.spread : ""), r.date]);
    });
    (y.habits || []).forEach(function (h) { out.push(["habits", [h.walk ? "Walk" : "", typeof h.water === "number" ? "Water " + h.water + " L" : "", h.med ? "Meditation" : "Meditation missed"].filter(Boolean).join(" · "), h.date]); });
    if (y.review && y.review.wentWell) out.push(["review", "Went well: " + y.review.wentWell, null]);
    return out.sort(function (a, b) { return OTD_ORDER.indexOf(a[0]) - OTD_ORDER.indexOf(b[0]) || (String(a[2] || "") < String(b[2] || "") ? -1 : String(a[2] || "") > String(b[2] || "") ? 1 : 0); });
  }
  function otdYears() {   /* the years with something, nearest first: { y, week, items } */
    return ((otd.d && otd.d.years) || []).map(function (y) {
      var all = otdItems(y), exact = all.filter(function (it) { return it[2] === y.date; });
      if (exact.length) return { y: y, week: false, items: exact.concat(all.filter(function (it) { return it[0] === "review"; })) };
      var week = all.filter(function (it) { return it[0] !== "habits" && (it[2] || it[0] === "review"); });
      return { y: y, week: true, items: week.filter(function (it) { return it[0] !== "review"; }).length ? week : [] };
    }).filter(function (v) { return v.items.length; });
  }
  function otdAgo(v) { var n = Number(otd.d.today.slice(0, 4)) - v.y.year; return n === 1 ? "A YEAR AGO" : n + " YEARS AGO"; }
  function otdShort(dt) { var p = parseYmd(dt); return DOW[p.getDay()] + " " + p.getDate() + " " + MON[p.getMonth()] + " " + p.getFullYear(); }
  function otdWx(dt) {
    var w = otd.d.wx && otd.d.wx[dt]; if (!w) return "";
    return '<span class="otd-wx">' + w.hi + "°F / " + w.lo + "°F" + (w.rain ? " · " + w.rain + " in rain" : w.rain === 0 ? " · dry" : "") + (w.lo <= 32 ? ' · <b>FROST</b>' : "") + "</span>";
  }
  function otdLine(it, withDay) {
    var k = OTD_K[it[0]], p = it[2] ? parseYmd(it[2]) : null;
    return '<span class="otd-it" style="--k: var(' + k[1] + ')"><span>' + k[0] + "</span><span>" + (withDay && p ? "<em>" + DOW[p.getDay()] + " " + p.getDate() + "</em> " : "") + esc(it[1]) + "</span></span>";
  }

  /* ---- the panel ---- */
  function otdPanel() {
    loadOtd();
    if (!canOtd() || !otd.d || otd.d.today !== ymd(new Date())) return "";
    var ys = otdYears();
    if (!ys.length) return "";   /* nothing on this date in any year: the Bridge looks as it always has */
    return '<section class="rb-card otd" data-panel="otd" aria-label="On this day">' + phead("ON THIS DAY", ys.length + (ys.length === 1 ? " YEAR" : " YEARS") + " · TAP ONE", "chrome-c") +
      '<div class="otd-years">' + ys.map(function (v, i) {
        var top = v.items.slice(0, 3), rest = v.items.length - top.length;
        return '<button type="button" class="otd-yr" data-otd="' + i + '" aria-label="' + esc(otdAgo(v) + ", " + (v.week ? "the week around " : "") + otdShort(v.y.date)) + '"><span class="otd-yh"><b>' + otdAgo(v) + "</b>" +
          (v.week ? '<span class="otd-wk">THAT WEEK</span>' : '<span class="otd-dt">' + otdShort(v.y.date) + "</span>") + "</span>" + otdWx(v.y.date) +
          top.map(function (it) { return otdLine(it, false); }).join("") + (rest > 0 ? '<span class="otd-more">+ ' + rest + " MORE</span>" : "") +
          "</button>";
      }).join("") + "</div></section>";
  }

  /* ---- a year's sheet ---- */
  function otdOpen(i) {
    var ys = otdYears(), v = ys[i];
    if (!v) { toast("Nothing on this date in past years."); return; }
    var p = parseYmd(v.y.date), long = SK_DOWL[p.getDay()].toUpperCase() + " " + p.getDate() + " " + MONL[p.getMonth()] + " " + p.getFullYear(), groups = {};
    v.items.forEach(function (it) { (groups[it[0]] = groups[it[0]] || []).push(it); });
    $("detailSheet").className = "sheet otd-sheet";
    $("detailSheet").style.setProperty("--c", "var(--chrome-c)");
    $("detailSheet").innerHTML = '<div class="sbar"><span>◆ ON THIS DAY</span><span>' + otdAgo(v) + (v.week ? " · THAT WEEK" : "") + "</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + (v.week ? "THE WEEK AROUND " + p.getDate() + " " + MONL[p.getMonth()] + " " + p.getFullYear() : long) + "</h3>" +
      (v.week ? '<div class="muted">Nothing on ' + p.getDate() + " " + MONL[p.getMonth()].charAt(0) + MONL[p.getMonth()].slice(1).toLowerCase() + " itself; this is the three days either side.</div>" : "") +
      (ys.length > 1 ? '<div class="btnrow otd-tabs" role="group" aria-label="Year">' + ys.map(function (w, j) { return '<button type="button" class="chip sm" style="--c: var(--chrome-c)" data-otd="' + j + '" aria-pressed="' + (j === i) + '">' + w.y.year + "</button>"; }).join("") + "</div>" : "") +
      (otdWx(v.y.date) ? '<div class="otd-grp" style="--k: var(--water)"><h4>WEATHER' + (v.week ? " ON THE " + p.getDate() + (p.getDate() % 10 === 1 && p.getDate() !== 11 ? "ST" : p.getDate() % 10 === 2 && p.getDate() !== 12 ? "ND" : p.getDate() % 10 === 3 && p.getDate() !== 13 ? "RD" : "TH") : "") + "</h4><p>" + otdWx(v.y.date) + "</p></div>" : "") +
      OTD_ORDER.filter(function (k) { return groups[k]; }).map(function (k) {
        return '<div class="otd-grp" style="--k: var(' + OTD_K[k][1] + ')"><h4>' + OTD_K[k][0] + "</h4>" + groups[k].map(function (it) {
          var q = it[2] ? parseYmd(it[2]) : null; return "<p>" + (v.week && q ? "<em>" + DOW[q.getDay()] + " " + q.getDate() + "</em> " : "") + esc(it[1]) + "</p>"; }).join("") + "</div>";
      }).join("") +
      '<div class="muted otd-note">From your calendars (not Work), Notion and the weather archive. Nothing here goes to ASK or the briefing.</div></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    var on = document.querySelector('#detailSheet [data-otd][aria-pressed="true"]'); (on || $("detailClose")).focus();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-otd]"); if (!b) return;
    otdOpen(+b.dataset.otd);
  });
