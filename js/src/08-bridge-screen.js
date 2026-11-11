  /* ---------- Bridge (overview) ---------- */
  /* One screen above the calendars: what needs you now, what's coming, and
     whether the week is in balance. Everything here is read from data the app
     already loads, plus weather (Open-Meteo) and the bridge's "done" counts. */
  var HEAVY_HOURS = 7, KD_WARN_DAYS = 3, PICK_BY_HOUR = 10, STALE_SYNC_MS = 6 * 3600 * 1000;
  var HIGH = "🔴 High";
  var BAL_AREAS = ["work", "personal", "farm", "hobby"];
  var HIVE = { minF: 60, maxWind: 12, maxRain: 30, from: 10, to: 17 };
  var WX_FRESH_MS = 30 * 60 * 1000, DONE_FRESH_MS = 10 * 60 * 1000;

  function canBalance() { return state.caps.indexOf("done") > -1; }
  function durLabel(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return h && m ? h + "H " + m + "M" : h ? h + "H" : m + "M";
  }
  function hrsLabel(h) { return (Math.round(h * 10) / 10) + "H"; }
  /* Hours covered by events between hours a and b of one day (overlaps counted once). */
  function unionHours(timed, day, a, b) {
    var d0 = sod(day), tot = 0, cs = null, ce = null;
    timed.map(function (ev) { return [Math.max(a, posInDay(ev._s, d0)), Math.min(b, posInDay(ev._e, d0))]; })
      .filter(function (x) { return x[1] > x[0]; })
      .sort(function (x, y) { return x[0] - y[0]; })
      .forEach(function (x) {
        if (ce === null || x[0] > ce) { if (ce !== null) tot += ce - cs; cs = x[0]; ce = x[1]; } else if (x[1] > ce) ce = x[1];
      });
    if (ce !== null) tot += ce - cs;
    return tot;
  }
  function titles(list) {
    var t = list.slice(0, 2).map(function (x) { return esc(x.title); }).join(" · ");
    return t + (list.length > 2 ? " · +" + (list.length - 2) + " more" : "");
  }
  function bridgeRange() { var t = sod(new Date()); return { from: addDays(t, -6), to: addDays(t, 7) }; }
  /* Work and Personal events that overlap later today (all calendars, even hidden ones). */
  function clashes(list, now) {
    var timed = dayEvents(list, now).timed.filter(function (e) { return e._e > now && !e.pending; }), out = [];
    timed.forEach(function (a, i) {
      timed.slice(i + 1).forEach(function (b) {
        if (a.area !== b.area && a._s < b._e && b._s < a._e) out.push(a.area === "work" ? [a, b] : [b, a]);
      });
    });
    return out;
  }

  /* --- condition: GREEN, YELLOW or RED, with every item that needs you --- */
  function conditions(now, today, list) {
    var items = [], data = canPlan() ? state.tasks[today] : null;
    var unsaved = lsFull();   /* 2.77: a write that didn't fit, even after making room */
    if (unsaved.length) items.push({ lvl: "bad", ic: "✕", txt: "This iPad's storage is full", sub: unsaved.length + (unsaved.length === 1 ? " thing isn't" : " things aren't") + " saved on this iPad yet. Keep Bridge open, and make room in SYSTEMS.", act: "systems", fix: "store", go: "SYSTEMS" });
    if (data) {
      var picked = {};
      data.focus.forEach(function (t) { picked[t.id] = 1; });
      var overdue = rankTasks(data.open.filter(function (t) { return t.due && t.due < today && t.status !== DONE; }));
      var hi = overdue.filter(function (t) { return t.priority === HIGH; }), lo = overdue.filter(function (t) { return t.priority !== HIGH; });
      if (hi.length) items.push({ lvl: "bad", ic: "▲", txt: hi.length === 1 ? "Overdue, High priority" : hi.length + " High-priority tasks overdue", sub: titles(hi), act: "plan", go: "PLAN DAY" });
      if (lo.length) items.push({ lvl: "warn", ic: "▲", txt: lo.length === 1 ? "1 task overdue" : lo.length + " tasks overdue", sub: titles(lo), act: "plan", go: "PLAN DAY" });
      var dueNow = rankTasks(data.open.filter(function (t) { return t.due === today && !picked[t.id] && t.status !== DONE; }));
      if (dueNow.length) items.push({ lvl: "warn", ic: "▲", txt: "Due today, not in your picks", sub: titles(dueNow), act: "plan", go: "PLAN DAY" });
      if (!data.focus.length && now.getHours() >= PICK_BY_HOUR) items.push({ lvl: "warn", ic: "▲", txt: "No priorities picked yet", sub: "Plan Day takes a minute.", act: "plan", go: "PLAN DAY" });
    }
    if (hasData(bridgeRange())) {
      clashes(list, now).slice(0, 2).forEach(function (c) {
        items.push({ lvl: "bad", ic: "✕", txt: "Calendar clash at " + hm(c[0]._s > c[1]._s ? c[0]._s : c[1]._s), sub: esc(c[0].title) + " (" + areaName(c[0].area) + ") overlaps " + esc(c[1].title) + " (" + areaName(c[1].area) + ")", day: today, go: "TODAY" });
      });
    }
    if (canDates() && state.dates) {
      occurrences(today, ymd(addDays(now, KD_WARN_DAYS))).filter(function (o) { return o.s >= today; }).forEach(function (o) {
        var n = daysBetween(today, o.s);
        items.push({ lvl: "warn", ic: "◆", txt: n === 0 ? "Key date today" : n === 1 ? "Key date tomorrow" : "Key date in " + n + " days", sub: esc(o.d.title) + " · " + dLabel(parseYmd(o.s)), kd: o.id, go: "DETAILS" });
      });
    }
    items.push.apply(items, skConditions(now));   /* SICKBAY (2.74): no health data for two days; resting heart rate up two mornings */
    var upOver = upkeepOverdue(today);
    if (upOver.length) items.push({ lvl: "warn", ic: "▲", txt: upOver.length === 1 ? "Upkeep overdue" : upOver.length + " upkeep items overdue", sub: upOver.slice(0, 3).map(function (u) { return esc(u.name) + (u.cat ? " (" + esc(u.cat) + ")" : ""); }).join(" · ") + (upOver.length > 3 ? " · …" : ""), act: "engineering", go: "UPKEEP" });
    var rdue = reviewDue(now);
    if (rdue && canReviews() && !reviewSaved(ymd(rdue))) items.push({ lvl: "warn", ic: "◆", txt: "Weekly review due", sub: weekLabel(rdue) + " · about 5 minutes", act: "review", go: "REVIEW" });
    var fr = frost(now);
    if (fr && fr.low <= 32) items.push({ lvl: "warn", ic: "▼", txt: "Frost tonight", sub: "Low " + Math.round(fr.low) + "°F around " + fr.at, act: "none", go: "" });
    var st = state.sync;
    if (state.conn && (st.status === "error" || st.status === "offline") && (!st.at || Date.now() - st.at > STALE_SYNC_MS)) {
      items.push({ lvl: "bad", ic: "◌", txt: "Sync failing for over 6 hours", sub: st.at ? "Showing data from " + esc(stamp(st.at)) + "." : "No data loaded yet.", act: "systems", fix: "sync", go: "SYSTEMS" });
    }
    var sp = schemaProblems();
    if (sp.length) {
      var sl = schemaText(sp, 2), n = schemaText(sp).length;
      items.push({ lvl: "warn", ic: "▲", txt: n === 1 ? "A Notion column changed" : n + " Notion columns changed", sub: esc(sl.join(" · ")), act: "systems", fix: "schema", go: "SYSTEMS" });
    }
    var exc = exportCondition(); if (exc) items.push(exc);
    if (bridgeBehind()) {
      var miss = bridgeMissing();
      items.push({ lvl: "warn", ic: "▲", txt: "Google bridge out of date", sub: "Deployed " + esc(state.bridgeVersion) + ", this app needs " + BRIDGE_WANT + "." + (miss.length ? " Missing: " + esc(miss.slice(0, 3).join(", ") + (miss.length > 3 ? " and " + (miss.length - 3) + " more" : "")) + "." : ""), act: "systems", fix: "bridge", go: "SYSTEMS" });
    }
    var stuck = state.queue.filter(function (q) { return q.failed || (q.attempts || 0) >= 2; });
    if (stuck.length) items.push({ lvl: "warn", ic: "▲", txt: stuck.length === 1 ? "1 capture not saved yet" : stuck.length + " captures not saved yet", sub: titles(stuck), act: "systems", fix: "queue", go: "SYSTEMS" });
    if (canPlan() && state.tasksErr && !data) items.push({ lvl: "warn", ic: "◌", txt: "Task list didn't load", sub: esc(state.tasksErr.msg), act: "systems", fix: "tasks", go: "SYSTEMS" });
    items.sort(function (a, b) { return (a.lvl === "bad" ? 0 : 1) - (b.lvl === "bad" ? 0 : 1); });
    return items;
  }


  /* --- now / next --- */


  /* --- priorities + what's due outside them --- */


  /* --- the next seven days --- */


  /* --- key dates: the next three --- */


  /* --- environment (Open-Meteo, no key needed; only rounded coordinates are sent) --- */
  function place() { return lsGet(LS_PLACE); }
  function placeKey(pl) { return pl.lat + "," + pl.lon; }
  function loadWeather(force) {
    var pl = place();
    if (!pl || state.wxInflight || navigator.onLine === false) return;
    if (!force && state.wx && state.wx.key === placeKey(pl) && Date.now() - state.wx.fetched < WX_FRESH_MS) return;
    if (!force && state.wxErr && Date.now() - state.wxErr < FRESH_MS) return;
    state.wxInflight = true;
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + pl.lat + "&longitude=" + pl.lon +
      "&current=temperature_2m,weather_code,wind_speed_10m" +
      "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=3";
    fetch(u, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.hourly || !j.daily) throw new Error("bad_json");
      state.wx = { fetched: Date.now(), key: placeKey(pl), data: j };
      state.wxErr = null;
      lsSet(LS_WX, state.wx);
    }).catch(function () { state.wxErr = Date.now(); })
      .then(function () { state.wxInflight = false; if (state.screen === "bridge") render(true); });
  }
  function wxData() { var pl = place(); return pl && state.wx && state.wx.key === placeKey(pl) ? state.wx.data : null; }
  function wxText(c) {
    if (c === 0) return "CLEAR"; if (c === 1) return "MOSTLY CLEAR"; if (c === 2) return "PARTLY CLOUDY"; if (c === 3) return "OVERCAST";
    if (c === 45 || c === 48) return "FOG"; if (c >= 51 && c <= 57) return "DRIZZLE"; if (c >= 61 && c <= 67) return "RAIN";
    if (c >= 71 && c <= 77) return "SNOW"; if (c >= 80 && c <= 82) return "SHOWERS"; if (c === 85 || c === 86) return "SNOW SHOWERS";
    if (c >= 95) return "THUNDERSTORMS"; return "";
  }
  function wxHours(j) {
    var h = j.hourly;
    return h.time.map(function (t, i) {
      return { t: t, day: t.slice(0, 10), hr: +t.slice(11, 13), temp: h.temperature_2m[i], wind: h.wind_speed_10m[i], rain: h.precipitation_probability[i], code: h.weather_code[i] };
    });
  }
  /* Best stretch for opening hives: warm, calm and dry, between 10:00 and 17:00. */
  /* 2.56: the hive rhythm. Checks happen every 10 days at most in the active season and less often as it cools, so the
     weather's hive window only matters when a check is due. From the newest check on any hive (APIARY) and the days
     between checks for the season (tos.hiverhythm.v1, set in APIARY → THIS YEAR; PROFILE SYNC carries it): due means
     within 2 days or overdue. Winter has no inspections, only an outside look about monthly, so the window doesn't apply.
     Without APIARY (or with no hives) there is no rhythm and the hive check shows as before. */
  var LS_HIVERHYTHM = "tos.hiverhythm.v1";   /* { active, shoulder, winter }: days between checks */
  var HIVE_SEASON = ["winter", "winter", "shoulder", "active", "active", "active", "active", "active", "active", "shoulder", "shoulder", "winter"];   /* Jan to Dec */
  var HIVE_SEASON_NAME = { active: "active season, April to September", shoulder: "shoulder season, March, October and November", winter: "winter, December to February" };
  function hiveRhythm() { return Object.assign({ active: 10, shoulder: 21, winter: 30 }, lsGet(LS_HIVERHYTHM) || {}); }
  function hiveDue(now) {
    if (!canApiary() || !ap.data) return null;
    var hs = apHives();
    if (!hs.length) return null;
    var last = "";
    hs.forEach(function (h) { var c = apChecks(h.id)[0]; if (c && c.day > last) last = c.day; });
    var today = ymd(now), season = HIVE_SEASON[now.getMonth()], every = hiveRhythm()[season], winter = season === "winter";
    if (!last) return { due: true, over: false, winter: winter, season: season, every: every, last: null, next: today, n: 0, ago: null };
    var next = ymd(addDays(parseYmd(last), every)), n = daysBetween(today, next);
    return { due: n <= 2, over: n < 0, winter: winter, season: season, every: every, last: last, next: next, n: n, ago: daysBetween(last, today) };
  }
  /* For Claude: one line, always, so it knows the rhythm and doesn't treat the hives as daily work. */
  function hiveLine(now) {
    var r = hiveDue(now);
    if (!r) return "";
    var when = r.n < 0 ? (-r.n) + (r.n === -1 ? " day" : " days") + " overdue" : r.n === 0 ? "today" : r.n === 1 ? "tomorrow" : "in " + r.n + " days";
    return "HIVES: " + (r.last ? "last checked " + r.last + " (" + r.ago + (r.ago === 1 ? " day" : " days") + " ago)" : "no check on record") + "; " +
      (r.winter ? "winter: no inspections, an outside look about every " + r.every + " days" : "a check every " + r.every + " days in the " + HIVE_SEASON_NAME[r.season]) + "; " +
      (r.due ? (r.winter ? "an outside look is due " : "a check is due ") + (r.last ? when : "now") + "." : "next due about " + r.next + ". Nothing to do for the hives today.");
  }
  function hiveCheck(now) {
    var j = wxData();
    if (!j) return null;
    var hours = wxHours(j), today = ymd(now), start = now.getHours() + (now.getMinutes() ? 1 : 0), label = "TODAY", day = today;
    if (Math.max(start, HIVE.from) >= HIVE.to) { day = ymd(addDays(now, 1)); start = 0; label = "TOMORROW"; }
    var slot = hours.filter(function (x) { return x.day === day && x.hr >= Math.max(start, HIVE.from) && x.hr < HIVE.to; });
    if (!slot.length) return null;
    var why = { cool: 0, wind: 0, rain: 0 }, best = null, run = null, hiT = -99;
    slot.forEach(function (x) {
      hiT = Math.max(hiT, x.temp);
      var wet = x.code >= 51 || (x.rain != null && x.rain > HIVE.maxRain);
      var ok = x.temp >= HIVE.minF && x.wind <= HIVE.maxWind && !wet;
      if (!ok) { if (x.temp < HIVE.minF) why.cool++; else if (x.wind > HIVE.maxWind) why.wind++; else why.rain++; run = null; return; }
      if (!run) run = { from: x.hr, to: x.hr + 1, lo: x.temp, hi: x.temp }; else { run.to = x.hr + 1; run.lo = Math.min(run.lo, x.temp); run.hi = Math.max(run.hi, x.temp); }
      if (!best || run.to - run.from > best.to - best.from) best = { from: run.from, to: run.to, lo: run.lo, hi: run.hi };
    });
    if (best) return { go: true, label: label, text: "Best window " + p2(best.from) + ":00 to " + p2(best.to) + ":00", sub: (Math.round(best.lo) === Math.round(best.hi) ? "" : Math.round(best.lo) + " to ") + Math.round(best.hi) + "°F, light wind, dry" };
    var reason = why.cool >= why.wind && why.cool >= why.rain ? "Too cool, high " + Math.round(hiT) + "°F" : why.wind >= why.rain ? "Too windy" : "Rain likely";
    return { go: false, label: label, text: reason, sub: "Needs " + HIVE.minF + "°F+, wind under " + HIVE.maxWind + " mph, dry" };
  }
  /* Lowest temperature from now until 09:00 tomorrow. */
  function frost(now) {
    var j = wxData();
    if (!j) return null;
    var end = ymd(addDays(now, 1)) + "T09:00", from = ymd(now) + "T" + p2(now.getHours()) + ":00", low = null;
    wxHours(j).forEach(function (x) { if (x.t >= from && x.t <= end && (low === null || x.temp < low.temp)) low = x; });
    return low ? { low: low.temp, at: low.t.slice(11, 16) } : null;
  }
  function envPanel(now) {
    var pl = place(), html = phead("ENVIRONMENT", pl ? (pl.name ? esc(pl.name) : "") : "SETUP", "farm", pl ? moreBtn("env", "environment") : "");
    if (!pl) return html + '<div class="stubbox"><span class="pill">SETUP</span><span>Weather, hive check and frost watch need your location. Set it in Systems.</span></div>' +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="systems">SET LOCATION</button></div>';
    var j = wxData();
    if (!j) return html + '<div class="empty">' + (state.wxErr ? "Weather didn't load. It retries in a minute." : "Loading weather…") + "</div>";
    var c = j.current || {}, dly = j.daily, today = ymd(now), di = Math.max(0, dly.time.indexOf(today));
    html += '<div class="ov-env"><span class="ov-temp tnum">' + Math.round(c.temperature_2m) + '°F</span><span class="tx"><b>' + wxText(c.weather_code) + "</b><small>High " +
      Math.round(dly.temperature_2m_max[di]) + "° · Low " + Math.round(dly.temperature_2m_min[di]) + "°</small></span></div>" +
      '<div class="ov-facts ov-extra tnum"><span>WIND <b>' + Math.round(c.wind_speed_10m) + " MPH</b></span><span>RAIN <b>" + (dly.precipitation_probability_max[di] == null ? "–" : dly.precipitation_probability_max[di] + "%") +
      "</b></span><span>SUNRISE <b>" + dly.sunrise[di].slice(11, 16) + "</b></span><span>SUNSET <b>" + dly.sunset[di].slice(11, 16) + "</b></span></div>";
    var hv = hiveCheck(now), fr = frost(now), rh = hiveDue(now);
    if (rh && !rh.due) html += '<div class="ov-envrow"><span class="k">HIVE CHECK · NEXT ~' + esc(shortDay(rh.next)) + '</span><span class="tx"><b>Last checked ' + esc(shortDay(rh.last)) + "</b><small class=\"ov-extra\">" +
      (rh.winter ? "Winter: an outside look about every " + rh.every + " days" : "Every " + rh.every + " days this time of year") + '</small></span><span class="pill">REST</span></div>';
    else if (rh && rh.winter) html += '<div class="ov-envrow"><span class="k">HIVE CHECK · OUTSIDE LOOK</span><span class="tx"><b>' + (rh.last ? "Last checked " + esc(shortDay(rh.last)) : "No check on record") + '</b><small class="ov-extra">Winter: no inspections. A look at the entrance and the weight.</small></span><span class="pill warn">DUE</span></div>';
    else if (hv) html += '<div class="ov-envrow"><span class="k">HIVE CHECK · ' + hv.label + (rh ? (rh.over ? " · OVERDUE" : " · DUE") : "") + '</span><span class="tx"><b>' + hv.text + '</b><small class="ov-extra">' + hv.sub + (rh && rh.last ? " · last checked " + esc(shortDay(rh.last)) : "") + '</small></span><span class="pill ' + (hv.go ? "ok" : "warn") + '">' + (hv.go ? "GO" : "HOLD") + "</span></div>";
    html += skEnvRow();
    if (fr) {
      var lvl = fr.low <= 32 ? "bad" : fr.low <= 36 ? "warn" : "ok";
      html += '<div class="ov-envrow"><span class="k">FROST WATCH · TONIGHT</span><span class="tx"><b>Low ' + Math.round(fr.low) + "°F around " + fr.at + '</b><small class="ov-extra">' +
        (lvl === "ok" ? "No frost expected" : lvl === "warn" ? "Near frost. Cover tender plants." : "Frost likely. Protect plants and water lines.") + '</small></span><span class="pill ' + lvl + '">' +
        (lvl === "ok" ? "NO FROST" : lvl === "warn" ? "NEAR FROST" : "FROST") + "</span></div>";
    }
    return html + '<div class="ov-foot ov-extra">Weather by Open-Meteo · updated ' + esc(stamp(state.wx.fetched)) + "</div>";
  }

  /* --- balance: tasks finished per area, hours per calendar, quiet areas --- */
  function loadDone(force) {
    if (!state.conn || !canBalance() || state.doneInflight) return;
    if (!force && state.done && Date.now() - state.done.fetched < DONE_FRESH_MS) return;
    if (!force && state.doneErr && Date.now() - state.doneErr.at < FRESH_MS) return;
    state.doneInflight = true;
    api({ action: "done", days: 30 }).then(function (j) {
      state.done = { fetched: Date.now(), done: j.done || [] };
      state.doneErr = null;
      lsSet(LS_DONE, state.done);
    }).catch(function (err) {
      state.doneErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.doneInflight = false;
      if (state.screen === "bridge") render(true);
    });
  }
  /* BALANCE (2.19): Work is time to contain, everything else is attention to keep up.
     Work: calendar hours over the last 7 days against a ceiling. Other areas: seven dots, one per
     day, lit when the area got attention (a task finished that day, or time on its calendar), plus
     hours against a minimum where the area has a calendar. Targets are set in Systems (0 = none). */
  var LS_BALT = "tos.baltarget.v1";
  var BAL_DEF = { work: 45, personal: 0, farm: 6, hobby: 3 };
  function balTargets() { var t = lsGet(LS_BALT) || {}, o = {}; Object.keys(BAL_DEF).forEach(function (k) { o[k] = typeof t[k] === "number" && t[k] >= 0 ? t[k] : BAL_DEF[k]; }); return o; }

  function balanceSection() {
    var t = balTargets(), row = function (k, label) { return "<dt>" + label + '</dt><dd class="bal-in"><input type="number" inputmode="decimal" min="0" max="168" step="0.5" id="balT-' + k + '" value="' + t[k] + '"><span class="muted">HOURS / 7 DAYS</span></dd>'; };
    return '<section id="sec-balance">' + phead("BALANCE TARGETS", "SAVED ON THIS IPAD") + '<dl class="kv">' +
      row("work", "WORK CEILING") + row("personal", "PERSONAL AT LEAST") + row("farm", AREAS.farm.name + " AT LEAST") + row("hobby", AREAS.hobby.name + " AT LEAST") +
      '</dl><div class="btnrow" style="margin-top:12px"><button type="button" class="btn" data-act="balsave">SAVE TARGETS</button></div>' +
      '<small class="muted">Counted over the last 7 days on the Bridge\'s BALANCE panel. 0 turns a target off. Areas without their own calendar show attention dots only.</small></section>';
  }
  function balSave() {
    var o = {};
    Object.keys(BAL_DEF).forEach(function (k) { var v = parseFloat(($("balT-" + k) || {}).value); o[k] = isFinite(v) && v >= 0 ? Math.min(168, Math.round(v * 2) / 2) : BAL_DEF[k]; });
    lsSet(LS_BALT, o); toast("Balance targets saved"); render(true);
  }

  /* --- captain's log + bearing (both stay on this iPad) --- */
  function bearings() { return lsGet(LS_BEARINGS) || []; }
  function bearingFor(today) {
    var b = bearings();
    return b.length ? b[((daysBetween("2000-01-01", today) + state.wmShift) % b.length + b.length) % b.length] : "";
  }

  function saveLog(text) {
    var log = lsGet(LS_LOG) || {}, today = ymd(new Date());
    if (text) log[today] = text; else delete log[today];
    var keep = {};
    Object.keys(log).sort().slice(-30).forEach(function (k) { keep[k] = log[k]; });
    lsSet(LS_LOG, keep);
  }

  /* Each Bridge panel shows its essentials; secondary readouts sit behind the + beside its title. */
  function moreBtn(key, title) {
    var open = !!bridgeOpen[key];
    return '<button type="button" class="ov-more" data-more="' + key + '" aria-expanded="' + open + '" aria-label="' + (open ? "Hide" : "Show") + " details for " + title + '"></button>';
  }

  function pnl(key, inner) { return '<section class="ov-pnl' + (bridgeOpen[key] ? " open" : "") + '" data-panel="' + key + '">' + inner + "</section>"; }   /* a panel whose extras open behind its + (REVIEW's TRENDS, LEDGER's spend) */

  /* ---------- BRIDGE (2.63, Timothy's pick of three mockups: B, the TIME RIBBON; his nine postulates) ----------
     HORIZON and BALANCE left the Bridge ("I don't reference Horizon or Balance basically at all"); what feeds ASK and
     REVIEW stays. The header carries the condition as a pill (#condSlot, filled here; renderHeader hides it on other
     screens): GREEN alone (a tap shows the nominal line), YELLOW or RED with a count and what needs you in a strip under
     the header (.rb-alerts, the same .ov-alert buttons as before). An unread briefing prints above the ribbon; folded,
     it is COMMS' first row. The ribbon: NOW / NEXT, the day 07-21 with names on the blocks, pins under it (what's due,
     today's key date, dinner at 18:00). Three columns: ORDERS OF THE DAY, BODY + HOME, COMMS (rows in a fixed order,
     dim when there's nothing, left out when not set up). One card style, 12 px apart. */
  var condOpen = false;
  function condLevel(items) { return items.some(function (i) { return i.lvl === "bad"; }) ? "red" : items.length ? "yellow" : "green"; }
  function condItemHtml(i, today) {
    var attrs = i.kd ? ' data-kd="' + esc(i.kd) + '"' : i.day ? ' data-day="' + i.day + '"' : i.act === "plan" ? ' data-act="plan" data-day="' + today + '"' : ' data-act="' + i.act + '"' + (i.fix ? ' data-fix="' + i.fix + '"' : "");
    return '<button type="button" class="ov-alert ' + i.lvl + '"' + attrs + '><span class="ic">' + i.ic + "</span><span class=\"tx\"><b>" + i.txt + "</b><small>" + i.sub + "</small></span>" +
      (i.go ? '<span class="go">' + i.go + "</span>" : "") + "</button>";
  }
  function condNominal(today) {
    var data = canPlan() ? state.tasks[today] : null, facts = [];
    if (data) facts.push(data.focus.length + (data.focus.length === 1 ? " priority" : " priorities") + " picked", "nothing overdue");
    facts.push("no clashes");
    if (state.sync.at) facts.push("synced " + stamp(state.sync.at));
    return '<div class="ov-nominal"><b>ALL SYSTEMS NOMINAL</b><small>' + esc(facts.join(" · ")) + "</small></div>";
  }
  function rbPill(level, n) {
    var s = $("condSlot"); if (!s) return;
    s.hidden = false;
    var h = '<button type="button" class="ov-cond ' + level + '" id="condPill" aria-expanded="' + (n ? "true" : String(condOpen)) + '" aria-label="Condition ' + level + ", " +
      (n ? n + (n === 1 ? " item needs" : " items need") + " you" : "nothing needs you") + '"><span class="lvl"><small>CONDITION</small><span>' + level.toUpperCase() + (n ? '<i class="tnum"> · ' + n + "</i>" : "") + "</span></span></button>";
    if (s.innerHTML !== h) s.innerHTML = h;
  }
  $("condSlot").addEventListener("click", function () {
    if (state.screen !== "bridge") return;
    var st = document.querySelector(".rb-alerts .ov-alert");
    if (st) { var box = st.parentNode; box.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" }); restartClass(box, "flash"); return; }   /* YELLOW or RED: what needs you is already in view */
    condOpen = !condOpen; render(true);
  });
  function rbAlerts(level, items, today) {
    if (!items.length && !condOpen) return "";
    return '<div class="rb-alerts ' + level + '" role="region" aria-label="Condition ' + level + '">' + (items.length ? items.map(function (i) { return condItemHtml(i, today); }).join("") : condNominal(today)) + "</div>";
  }
  function renderBridge() {
    var now = new Date(), today = ymd(now), list = eventsFor(bridgeRange());
    var items = conditions(now, today, list), level = condLevel(items);
    rbPill(level, items.length);
    if (canExport() && (!exs.d || Date.now() - exs.d.fetched > EXPORT_MS)) setTimeout(function () { loadExport(false); }, 0);   /* the export's state, for the condition */
    var brief = briefPanel(now), folded = brief.indexOf('class="br-fold"') > -1;
    var html = '<div class="rb">' + (folded ? "" : brief) + rbAlerts(level, items, today) +
      '<section class="rb-card rb-ribbon" data-panel="now">' + rbRibbon(now, list, today) + "</section>" +
      '<div class="rb-cols"><section class="rb-card" data-panel="prio">' + rbOrders(today) + "</section>" +
      '<section class="rb-card" data-panel="home">' + rbHome(now, today) + "</section>" +
      '<section class="rb-card rb-comms" data-panel="comms">' + rbComms(now, today, brief, folded) + "</section></div></div>";
    var c = $("content"), sy = window.scrollY || 0, sc = c.scrollTop;   /* the minute redraw never moves the page (2.62.1's rule) */
    c.innerHTML = html;
    if (c.scrollTop !== sc) c.scrollTop = sc;
    if ((window.scrollY || 0) !== sy) window.scrollTo({ top: sy, left: 0, behavior: "instant" });
    /* when the condition changes, the pill's color crossfades from the old one */
    var cEl = $("condPill");
    if (cEl && state.lastCond && state.lastCond !== level) { cEl.style.setProperty("--prev", "var(--" + { green: "ok", yellow: "warn", red: "bad" }[state.lastCond] + ")"); restartClass(cEl, "changed"); }
    state.lastCond = level;
    briefLoop();
    loadTasks(today, false);
    loadDates(false);
    loadDone(false);
    loadWeather(false);
    var rdue = reviewDue(now);
    if (rdue && canReviews() && !reviewSaved(ymd(rdue))) loadWeek(rdue, false);
    briefMaybe();
  }
  /* --- the ribbon: now / next and the day, 07:00 to 21:00 --- */
  function rbDueList(today) {
    var data = canPlan() ? state.tasks[today] : null;
    if (!data) return [];
    var picked = {};
    data.focus.forEach(function (t) { picked[t.id] = 1; });
    return data.open.filter(function (t) { return t.due && t.due <= today && !picked[t.id] && t.status !== DONE; })
      .sort(function (a, b) { return a.due.localeCompare(b.due) || (PRI_RANK[a.priority] === undefined ? 3 : PRI_RANK[a.priority]) - (PRI_RANK[b.priority] === undefined ? 3 : PRI_RANK[b.priority]); });
  }
  function rbFreeAfter(timed, from) {   /* the first gap of 30 minutes or more after `from`, before 21:00 */
    var d0 = sod(from), end = new Date(+d0 + FOCUS_END * 36e5), t = from;
    var later = timed.filter(function (e) { return e._e > from; }).sort(function (a, b) { return a._s - b._s; });
    for (var i = 0; i < later.length; i++) {
      if (later[i]._s - t >= 30 * 60000) return { a: t, b: later[i]._s };
      if (later[i]._e > t) t = later[i]._e;
    }
    return end - t >= 30 * 60000 ? { a: t, b: null } : null;
  }
  function rbRibbon(now, list, today) {
    var de = dayEvents(visible(list), now), timed = de.timed, d0 = sod(now);
    var cur = timed.filter(function (e) { return e._s <= now && e._e > now; })[0];
    var next = timed.filter(function (e) { return e._s > now; })[0];
    var hn = hiddenNote(), add = '<button type="button" class="rb-add" data-act="capnow" aria-label="Add an event">+</button>';
    var html = '<div class="rb-top"><div class="ov-now">';
    if (!hasData(bridgeRange()) && !timed.length) return html + '<span class="muted">' + (state.sync.status === "syncing" ? "Loading your calendars…" : "Calendar not loaded yet.") + "</span></div>" + add + "</div>";
    if (cur) html += '<span class="pill a-' + cur.area + ' ov-state">' + (cur.area === "break" ? esc(cur.breakWord.toUpperCase()) : "NOW") + '</span><span class="ov-cd tnum">' + durLabel((cur._e - now) / 60000) + '</span><span class="muted">left · ' + esc(cur.title) + "</span>";
    else if (next) html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd tnum">' + durLabel((next._s - now) / 60000) + '</span><span class="muted">until ' + hm(next._s) + "</span>";
    else html += '<span class="pill ok ov-state">FREE</span><span class="ov-cd">CLEAR</span>';
    html += '</div><div class="rb-next">';
    if (next) {
      state.index[next.id] = next;
      var after = timed.filter(function (e) { return e._s > next._s; }).length, gap = rbFreeAfter(timed, next._e);
      html += '<button type="button" class="ov-next a-' + next.area + pendingCls(next) + '" data-id="' + esc(next.id) + '"><span class="st"></span><span class="tx"><b>' + esc(next.title) + "</b><small>Next · " +
        hm(next._s) + " to " + hm(next._e) + " · " + areaName(next.area) + pendingTag(next) + '</small></span><span class="go tnum">IN ' + durLabel((next._s - now) / 60000) + "</span></button>" +
        '<small class="rb-then">' + (after ? "Then " + after + (after === 1 ? " more" : " more") : "Nothing after it") + (gap ? " · free " + hm(gap.a) + (gap.b ? " to " + hm(gap.b) : " on") : "") + "</small>";
    } else html += '<small class="rb-then">Nothing else on the calendar today</small>';
    html += (hn ? '<small class="rb-then">' + esc(hn) + "</small>" : "") + "</div>" + add + "</div>";
    if (de.allDay.length) html += '<div class="ov-allday">ALL DAY · ' + de.allDay.map(function (e) { return esc(e.title); }).join(" · ") + "</div>";
    var span = FOCUS_END - FOCUS_START, pct = function (h) { return ((h - FOCUS_START) / span * 100).toFixed(2); };
    var clash = {};
    clashes(visible(list), sod(now)).forEach(function (c) { clash[c[0].id] = 1; clash[c[1].id] = 1; });
    html += '<div class="ov-strip rb-band">';
    layout(timed, now, { y: function (h) { return h * 60; } }, 0).forEach(function (r) {
      var s = Math.max(FOCUS_START, r.s), e = Math.min(FOCUS_END, r.e);
      if (e <= s) return;
      state.index[r.ev.id] = r.ev;
      html += '<button type="button" class="ov-blk a-' + r.ev.area + (clash[r.ev.id] ? " clash" : "") + (r.ev.busy ? " busy" : "") + pendingCls(r.ev) + pastCls(r.ev) + '" data-id="' + esc(r.ev.id) +
        '" aria-label="' + esc(r.ev.title) + ", " + hm(r.ev._s) + " to " + hm(r.ev._e) + '" style="left:' + pct(s) + "%;width:" + (pct(e) - pct(s)).toFixed(2) +
        "%;top:calc(5px + (100% - 10px) * " + r.col + " / " + r.n + ");height:calc((100% - 10px) / " + r.n + ' - 2px)"><span class="rb-bl">' + esc(r.ev.title) + "</span></button>";
    });
    var nowH = posInDay(now, d0);
    if (nowH >= FOCUS_START && nowH <= FOCUS_END) html += '<span class="ov-nowln" style="left:' + pct(nowH) + '%"><i class="tnum">' + hm(now) + "</i></span>";
    html += '</div><div class="ov-ticks">' + [7, 9, 11, 13, 15, 17, 19, 21].map(function (h) { return '<span class="tnum" style="left:' + pct(h) + '%">' + p2(h) + "</span>"; }).join("") + "</div>";
    /* pins: what's due and today's key date at the left, dinner at 18:00 */
    var pins = "", due = rbDueList(today);
    if (due.length) pins += '<button type="button" class="rb-pin pin-due" data-act="plan" data-day="' + today + '"><b>' + (due.some(function (t) { return t.due < today; }) ? "OVERDUE" : "DUE TODAY") + "</b><span>" + esc(due[0].title) + (due.length > 1 ? " +" + (due.length - 1) : "") + "</span></button>";
    if (canDates() && state.dates) {
      var kd = occurrences(today, today).filter(function (o) { return o.s <= today && o.e >= today; })[0];
      if (kd) pins += '<button type="button" class="rb-pin pin-kd" data-kd="' + esc(kd.id) + '"><b>TODAY</b><span>' + esc(kd.d.title) + "</span></button>";
    }
    var dn = state.conn && canMeals() && ml.data ? mlDinner(mlToday()) : null;
    var dpin = dn ? '<button type="button" class="rb-pin pin-dinner" data-mlnow="open" style="left:' + pct(18) + '%"><b>' + (dn.status === "eaten" ? "DINNER ✓" : "18:00 DINNER") + "</b><span>" + esc(mlDName(dn)) + "</span></button>" : "";
    if (pins || dpin) html += '<div class="rb-pins"><div class="rb-pinl">' + pins + "</div>" + dpin + "</div>";
    return html;
  }
  /* --- ORDERS OF THE DAY: the picks, what's due outside them, the intent --- */
  function rbOrders(today) {
    var log = lsGet(LS_LOG) || {}, due = rbDueList(today);
    var html = prioritiesPanel(today, true, "", "ORDERS OF THE DAY");
    if (due.length) html += '<div class="ov-sub">' + due.length + (due.length === 1 ? " TASK" : " TASKS") + " DUE OR OVERDUE, NOT PICKED</div>" + due.slice(0, 3).map(function (t) {
      return '<button type="button" class="ov-due a-' + taskArea(t.area) + '" data-act="plan" data-day="' + today + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" +
        [bare(t.priority), bare(t.area)].filter(Boolean).map(esc).join(" · ") + '</small></span><span class="pill ' + (t.due < today ? "bad" : "warn") + '">' + dueLabel(t.due, today) + "</span></button>";
    }).join("") + (due.length > 3 ? '<div class="muted ov-morenote">+' + (due.length - 3) + " more in Plan Day</div>" : "");
    return html + '<div class="rb-intent"><label class="ov-sub" for="logIntent">TODAY\'S INTENT</label>' +
      '<input type="text" id="logIntent" maxlength="160" placeholder="One line: what makes today a good day?" autocomplete="off" enterkeyhint="done" value="' + esc(log[today] || "") + '"></div>';
  }
  /* --- BODY + HOME: habits, tonight, the weather (its details behind its +) --- */
  function rbNoHead(h) { return String(h || "").replace(/^<div class="phead"[\s\S]*?<\/div>/, ""); }
  function rbHome(now, today) {
    var html = phead("BODY + HOME", "", "chrome-c");
    if (canHabits()) html += '<div data-panel="habits"><div class="rb-sub">HABITS<span>' + habitMeta() + "</span></div>" + rbNoHead(habitsPanel(today)) + "</div>";
    var meal = mealLine(); if (meal) html += '<div class="rb-meal">' + meal + "</div>";
    var pl = place();
    html += '<div class="ov-pnl rb-wx' + (bridgeOpen.env ? " open" : "") + '" data-panel="env"><div class="rb-sub">WEATHER' + (pl && pl.name ? " · " + esc(pl.name.toUpperCase()) : "") + (pl ? moreBtn("env", "the weather") : "") + "</div>" + rbNoHead(envPanel(now)) + "</div>";
    return html;
  }
  /* --- COMMS: briefing, inbox, science, key date, bearing, tarot; always in this order --- */
  function rbRow(cls, attrs, label, text, color, dim) {
    return '<button type="button" class="rb-row' + (cls ? " " + cls : "") + (dim ? " dim" : "") + '" ' + attrs + ' style="--c: var(--' + color + ')"><b>' + label + "</b><span>" + text + "</span></button>";
  }
  function rbComms(now, today, brief, folded) {
    var rows = "";
    if (state.conn && canAsk() && !lsGet(LS_BRIEFOFF) && state.caps.indexOf("brief") > -1) {
      var b = br.b;
      rows += folded && b ? rbRow("br-fold", 'data-brief="open" aria-label="Open the morning briefing"', "BRIEFING", esc((briefToday(now) ? "" : "Yesterday's · ") + hm(new Date(b.at)) + " · " + (b.headline || (b.paras[0] && b.paras[0].text) || "")), "chrome-b")
        : brief ? rbRow("", 'data-act="briefup"', "BRIEFING", "Above, ready to read", "chrome-b", true)
        : rbRow("", 'data-act="briefup"', "BRIEFING", "Compiles after 06:00", "chrome-b", true);
    }
    if (state.conn && canInbox()) {
      loadInbox(false);
      var n = ibCount(), w = ibWaiting(), first = w[0] || ibQueued()[0], at = first && first.at ? new Date(first.at) : null;
      rows += rbRow("ib-line", 'data-act="inbox"', "INBOX" + (n ? " · " + n : ""), n ? (n === 1 ? "1 note" : n + " notes") + " to sort" + (at && !isNaN(at) ? ", oldest " + DOW[at.getDay()] + " " + p2(at.getDate()) : "") : "Clear", "chrome-c", !n);
    }
    if (state.conn && canScience() && !lsGet(LS_SCILINEOFF)) {
      sciDaily();
      var h = sciHeadline();
      rows += rbRow("sci-line", 'data-act="science"', "SCIENCE", h ? esc(h.t) : "Nothing notable tonight", h ? SCI_DEPTS[h.d][1] : "personal", !h);
    }
    if (canDates()) {
      var nh = 0, o = state.dates ? occurrences(today, ymd(addDays(parseYmd(today), 366))).filter(function (x) { return x.e >= today && (!x.d.holiday || nh++ < 1); })[0] : null;
      if (o) { var running = o.s < today, k = running ? daysBetween(today, o.e) : daysBetween(today, o.s); rows += rbRow("ov-kd", 'data-kd="' + esc(o.id) + '"', "KEY DATE", esc(o.d.title) + (o.d.holiday ? " · holiday" : "") + " · " + (running ? k + " days left" : k === 0 ? "today" : k === 1 ? "tomorrow" : "in " + k + " days"), "chrome-a", false); }
      else rows += rbRow("", 'data-act="dates"', "KEY DATE", state.dates ? "None in the next 12 months" : "Loading…", "chrome-a", true);
    }
    var bw = bearingFor(today);
    rows += bw ? rbRow("ov-bearing", 'data-act="bearing" aria-label="Bearing: ' + esc(bw) + '. Tap to rotate"', "BEARING", esc(bw), "hero", false) : rbRow("ov-bearing", 'data-act="systems"', "BEARING", "Set your guiding words in SYSTEMS", "hero", true);
    if (canTarot()) {
      loadTarot(false);
      var wk = tr.data ? trWeekly(sow(now)) : null, cd = wk && wk.cards[0];
      rows += '<div data-panel="tarot">' + (cd ? rbRow("", 'data-tropen="' + esc(wk.id) + '"', "TAROT", esc(trName(cd.id)) + (cd.rev ? " · reversed" : "") + " · this week", "chrome-a", false)
        : rbRow("", tr.data ? 'data-trgo="weekly"' : 'data-act="tarot"', "TAROT", tr.data ? "No card yet this week" : tr.err ? esc(tr.err.msg) : "Loading…", "chrome-a", true)) + "</div>";
    }
    return phead("COMMS", "", "chrome-a") + '<div class="rb-rows">' + rows + "</div>";
  }


