  /* ---------- Header, nav, status ---------- */
  function renderHeader() {
    var e = $("eyebrow"), t = $("title"), a = state.anchor, now = new Date();
    var linked = !!state.conn;
    renderNav();
    $("pager").hidden = !linked || state.screen === "systems" || state.screen === "dates" || state.screen === "bridge" || state.screen === "ledger" || state.screen === "log" || state.screen === "library" || state.screen === "storage" || state.screen === "engineering" || state.screen === "tarot" || state.screen === "apiary" || state.screen === "meals" || state.screen === "arboretum" || state.screen === "sickbay" || state.screen === "inbox" || state.screen === "science" || state.screen === "ressikan" || state.screen === "holodeck" || (state.screen === "review" && state.rvLog);
    $("logBtn").hidden = state.screen !== "review";
    if (!linked || state.screen !== "bridge") $("condSlot").hidden = true;   /* the condition pill (2.63) is the Bridge's; renderBridge fills and shows it */
    $("todayBtn").hidden = (state.screen === "astrometrics" && as.y === now.getFullYear()) || state.screen === "meals" || state.screen === "arboretum" || state.screen === "sickbay" || state.screen === "inbox" || state.screen === "science" || state.screen === "ressikan" || state.screen === "holodeck" || state.screen === "review" || state.screen === "log" || state.screen === "library" || state.screen === "storage" || state.screen === "engineering" || state.screen === "tarot" || state.screen === "apiary";   /* ALL REVIEWS takes its place; this week is one tap away on the log */
    $("todayBtn").textContent = state.screen === "review" ? "THIS WEEK" : state.screen === "astrometrics" ? "THIS YEAR" : "TODAY";
    if (state.screen === "astrometrics") $("nextBtn").disabled = as.y >= now.getFullYear(); else $("nextBtn").disabled = false;
    $("topNote").textContent = !linked ? "CALENDAR CORE · NOT LINKED" : canCreate() ? "CALENDAR CORE · CAPTURE ON" : "CALENDAR CORE · READ-ONLY";
    $("capBtn").disabled = !linked;
    $("planBtn").disabled = !linked || !canPlan();
    $("planBtn").innerHTML = "PLAN DAY" + (linked && !canPlan() ? "<small>SETUP</small>" : "");
    $("cmdBtn").disabled = !linked;
    $("askBtn").disabled = !linked || !canAsk();
    $("askBtn").innerHTML = "ASK" + (linked && !canAsk() ? "<small>SETUP</small>" : "");
    if (!linked && state.screen !== "systems") { e.textContent = "FIRST RUN"; t.textContent = "LINK CALENDARS"; }
    else if (state.screen === "bridge") {
      e.textContent = "BRIDGE · " + hm(now) + (hiddenNote() ? " · " + hiddenNote() : "");
      t.textContent = DOWL[now.getDay()] + " " + p2(now.getDate()) + " " + MON[now.getMonth()];
    }
    else if (state.screen === "today") {
      var diff = Math.round((sod(a) - sod(now)) / 86400000);
      e.textContent = diff === 0 ? "TODAY" : diff === 1 ? "TOMORROW" : diff === -1 ? "YESTERDAY" : DOWL[a.getDay()];
      t.textContent = dLabel(a) + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    } else if (state.screen === "week") {
      var w0 = sow(a), w1 = addDays(w0, 6);
      e.textContent = "WEEK " + isoWeek(a) + (sow(now).getTime() === w0.getTime() ? " · THIS WEEK" : "");
      t.textContent = p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + MON[w0.getMonth()] : "") + " TO " + p2(w1.getDate()) + " " + MON[w1.getMonth()];
    } else if (state.screen === "month") {
      e.textContent = "MONTH" + (hiddenNote() ? " · " + hiddenNote() : "");
      t.textContent = MONL[a.getMonth()] + " " + a.getFullYear();
    } else if (state.screen === "review" && state.rvLog) {
      var nSaved = Object.keys(reviewMap()).concat(Object.keys(savedWeeks)).filter(function (k, i, arr) { return arr.indexOf(k) === i; }).length;
      e.textContent = "REVIEW · " + (nSaved ? nSaved + " SAVED" : "LOG");
      t.textContent = "WEEKLY REVIEWS";
    } else if (state.screen === "review") {
      var rw0 = sow(a), thisW = sow(now).getTime() === rw0.getTime(), lastW = addDays(sow(now), -7).getTime() === rw0.getTime();
      /* Same shape as the Week screen (week number above, dates as the title) so the header stays on one line beside ALL REVIEWS and the arrows. */
      e.textContent = "WEEK " + isoWeek(rw0) + " · " + (thisW ? "THIS WEEK" : lastW ? "LAST WEEK" : rw0 > now ? "AHEAD" : "PAST WEEK") + (reviewSaved(ymd(rw0)) ? " · SAVED" : "");
      t.textContent = weekLabel(rw0).replace(/^WEEK \d+ · /, "");
    } else if (state.screen === "dates") { e.textContent = "UPCOMING · NEXT 12 MONTHS"; t.textContent = "KEY DATES"; }
    else if (state.screen === "ledger") {
      var ly = state.ledger && state.ledger.ynab, lat = ly && ly.at ? Date.parse(ly.at) : state.ledger ? state.ledger.fetched : 0;
      e.textContent = "FINANCES · YNAB" + (state.ledgerInflight ? " · UPDATING…" : lat ? " · AS OF " + stamp(lat) : ""); t.textContent = "LEDGER";
    }
    else if (state.screen === "log") { e.textContent = (logTab === "sessions" && canSessions() ? "SESSIONS · " : "JOURNAL · ") + (logOpen() ? "OPEN" : "LOCKED"); t.textContent = "CAPTAIN'S LOG"; }
    else if (state.screen === "loom") lmHead();
    else if (state.screen === "habits") {
      var hd = Math.round((sod(now) - sod(a)) / 86400000);
      e.textContent = "HABITS · " + (hd === 0 ? "TODAY" : hd === 1 ? "YESTERDAY" : hd + " DAYS AGO");
      t.textContent = dLabel(a) + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    }
    else if (state.screen === "library") { e.textContent = "LIBRARY · " + (lb.data ? books().length + (books().length === 1 ? " BOOK" : " BOOKS") : "NOTION"); t.textContent = "LIBRARY"; }
    else if (state.screen === "storage") { var sh = storageHead(); e.textContent = sh.e; t.textContent = sh.t; }
    else if (state.screen === "tarot") { var th = trHead(); e.textContent = th.e; t.textContent = th.t; }
    else if (state.screen === "apiary") { var ah = apHead(); e.textContent = ah.e; t.textContent = ah.t; }
    else if (state.screen === "meals") { var mh = mlHead(); e.textContent = mh.e; t.textContent = mh.t; }
    else if (state.screen === "sickbay") { var skh = skHead(); e.textContent = skh.e; t.textContent = skh.t; }
    else if (state.screen === "arboretum") { var abh = arb.head(); e.textContent = abh.e; t.textContent = abh.t; }
    else if (state.screen === "astrometrics") { var xh = astroHead(); e.textContent = xh.e; t.textContent = xh.t; }
    else if (state.screen === "inbox") { var ih = inboxHead(); e.textContent = ih.e; t.textContent = ih.t; }
    else if (state.screen === "science") { var sh2 = scienceHead(); e.textContent = sh2.e; t.textContent = sh2.t; }
    else if (state.screen === "ressikan") { var rh = rs.head(); e.textContent = rh.e; t.textContent = rh.t; }
    else if (state.screen === "holodeck") { var hh = holo.head(); e.textContent = hh.e; t.textContent = hh.t; }
    else if (state.screen === "engineering") { var eo = upkeepOverdue(ymd(now)).length; e.textContent = eng.tab === "upkeep" ? "UPKEEP · " + (eo ? eo + " OVERDUE" : upkeepItems().length + (upkeepItems().length === 1 ? " ITEM" : " ITEMS")) : "CONTROLS · " + (haConf() ? haDevices().length + (haDevices().length === 1 ? " DEVICE" : " DEVICES") + (haDevices().filter(function (d) { return isOn(eng.states[d.id]); }).length ? " · " + haDevices().filter(function (d) { return isOn(eng.states[d.id]); }).length + " ON" : "") : "HOME ASSISTANT NOT SET"); t.textContent = "ENGINEERING"; }
    else { e.textContent = "SETTINGS + HEALTH"; t.textContent = "SYSTEMS"; }
    $("app").classList.toggle("on-bridge", linked && state.screen === "bridge");
    document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) {
      if (b.dataset.screen === navId()) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    /* Systems has no button of its own: the sync status opens it, and lights up while it's open. */
    if (state.screen === "systems") $("status").setAttribute("aria-current", "page"); else $("status").removeAttribute("aria-current");
    if (state.launch) {   /* ALL STATIONS is open over the screen */
      e.textContent = "STATIONS · " + pins().length + " IN THE BAR"; t.textContent = "ALL STATIONS";
      $("pager").hidden = true; $("logBtn").hidden = true;
      document.querySelectorAll(".nav[data-screen], .elbow[data-screen]").forEach(function (b) { b.removeAttribute("aria-current"); });
    }
  }
  function renderStatus() {
    var s = $("status"), st = state.sync, at = stamp(st.at), line1, line2, cls;
    if (!state.conn) { cls = "unlinked"; line1 = "NOT LINKED"; line2 = "SETUP NEEDED"; }
    else if (st.status === "syncing") { cls = "syncing"; line1 = "SYNCING"; line2 = at ? "LAST " + at : ""; }
    else if (st.status === "retrying") { cls = "ok"; line1 = "SYNCED"; line2 = (at ? at + " · " : "") + "RETRYING"; }
    else if (st.status === "offline") { cls = "offline"; line1 = "OFFLINE"; line2 = at ? "CACHED " + at : "NO DATA YET"; }
    else if (st.status === "error") { cls = "error"; line1 = "SYNC ERROR"; line2 = "SEE SYSTEMS"; }
    else { cls = "ok"; line1 = at ? "SYNCED" : "WAITING"; line2 = at; }
    if (Date.now() < egg.sdUntil) { line1 = "STARDATE"; line2 = stardate(new Date()); }
    var isWaiting = queued().length, failed = state.queue.length - isWaiting;
    if (state.conn && failed) { cls = "error"; line1 = "NOT SAVED"; line2 = failed + (failed === 1 ? " CAPTURE" : " CAPTURES"); }
    else if (state.conn && isWaiting) line2 = isWaiting + " QUEUED";
    s.className = "status " + cls;
    s.innerHTML = '<b><span class="dot"></span>' + line1 + "</b><span>" + esc(line2) + "</span>";
  }

  /* ---------- Day ---------- */
  function renderDay() {
    var r = viewRange(), list = eventsFor(r), day = state.anchor, now = new Date(), isToday = sameDay(day, now);
    var sc = makeScale(cssNum("--hh", 54));
    var all = dayEvents(list, day), de = dayEvents(visible(list), day), rows = layout(de.timed, day, sc, 24);
    var total = de.timed.length + de.allDay.length, allHidden = LIVE.every(function (k) { return state.hidden[k]; });
    var meta = !hasData(r) ? (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET") : allHidden ? "ALL CALENDARS HIDDEN" :
      (total ? total + (total === 1 ? " EVENT" : " EVENTS") : "OPEN DAY") + (hiddenNote() ? " · " + hiddenNote() : "");
    var html = '<div class="bridge"><section class="tlpanel">' + phead(isToday ? "TODAY TIMELINE" : "DAY TIMELINE", meta);
    var marks = kdMarks(ymd(day), true);
    if (de.allDay.length || marks.length) {
      html += '<div class="allday">' + marks.map(function (m) {
        return '<button type="button" class="adchip kdchip a-' + taskArea(m.o.d.area) + '" data-kd="' + esc(m.o.id) + '">◆ ' + esc(m.o.d.title) + (m.tag ? " · " + m.tag : "") + "</button>";
      }).join("") + de.allDay.map(function (ev) {
        state.index[ev.id] = ev;
        return '<button type="button" class="adchip a-' + ev.area + pendingCls(ev) + '" data-id="' + esc(ev.id) + '">ALL DAY · ' + esc(ev.title) + pendingTag(ev) + "</button>";
      }).join("") + "</div>";
    }
    html += '<div class="tlwrap" id="tlwrap"><div class="tl" style="height:' + sc.total + 'px">' + quietBands(sc, "quietband");
    for (var h = 0; h < 24; h++) {
      html += '<div class="hour' + (isFocus(h) ? "" : " quiet") + '" style="top:' + sc.y(h) + "px;height:" + (sc.y(h + 1) - sc.y(h)) + 'px"><span class="tnum">' + p2(h) + "</span></div>";
    }
    rows.forEach(function (row) {
      var ev = row.ev, top = row.ys + 1, height = Math.max(24, row.ye - row.ys - 3);
      state.index[ev.id] = ev;
      var cls = "ev a-" + ev.area + (height >= 50 ? " tall" : "") + (row.n > 2 && height >= 44 ? " narrow" : "") + (ev.busy ? " busy" : "") + pendingCls(ev) + pastCls(ev);
      html += '<button type="button" class="' + cls + '" data-id="' + esc(ev.id) + '" style="top:' + top + "px;height:" + height +
        "px;left:calc(58px + (100% - 62px) * " + row.col + " / " + row.n + ");width:calc((100% - 62px) / " + row.n + ' - 4px)">' +
        '<span class="lbl"><span class="t">' + esc(ev.title) + '</span><span class="tm tnum">' + hm(ev._s) + "-" + hm(ev._e) + pendingTag(ev) + "</span></span></button>";
    });
    var nowH = now.getHours() + now.getMinutes() / 60;
    if (isToday) html += '<div class="now" style="top:' + sc.y(nowH) + 'px"><span class="tnum">' + hm(now) + "</span></div>";
    html += "</div></div></section><section class=\"rcol\">";

    html += "<div>" + phead("LIFE AREAS", "TAP TO SHOW OR HIDE") + '<div class="arows">';
    LIVE.forEach(function (k) {
      var cs = calStatus(k), off = !!state.hidden[k];
      var items = all.timed.filter(function (e) { return e.area === k; });
      var adCount = all.allDay.filter(function (e) { return e.area === k; }).length;
      var next = items.filter(function (e) { return !isToday || e._e > now; })[0];
      var sub;
      if (off) sub = "Hidden on all views. Tap to show.";
      else if (cs && !cs.ok) sub = "Not connected. See Systems.";
      else if (next) sub = (isToday && next._s <= now ? "Now: " : "Next: ") + hm(next._s) + " " + esc(next.title);
      else sub = items.length ? "Done for the day" : adCount ? "All-day only" : "Nothing scheduled";
      html += '<button type="button" class="arow a-' + k + (off ? " off" : "") + '" data-toggle="' + k + '" aria-pressed="' + !off + '" aria-label="' +
        AREAS[k].name + (off ? " calendar hidden. Tap to show." : " calendar shown. Tap to hide.") + '"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name + "</b><small>" + sub +
        '</small></span><span class="ct"><b class="tnum">' + (items.length + adCount) + "</b>" + (off ? "HIDDEN" : AREAS[k].unit) + "</span></button>";
    });
    STANDBY_AREAS.forEach(function (k) {
      html += '<div class="arow stub a-' + k + '" aria-disabled="true"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name +
        '</b><small>Calendar not linked yet</small></span><span class="ct">STANDBY</span></div>';
    });
    html += "</div></div>";
    if (isToday) { var mlh = mealLine(); if (mlh) html += "<div>" + mlh + "</div>"; }   /* TONIGHT (2.59) */
    html += "<div>" + prioritiesPanel(ymd(day), isToday) + "</div>";
    html += "<div>" + keyDatesPanel(ymd(day)) + "</div>";
    html += "</section></div>";
    $("content").innerHTML = html;

    state.dayScale = sc;
    loadTasks(ymd(day), false);
    loadDates(false);
    var first = rows.length ? rows[0].s : 8;
    state.scrollTarget = Math.max(0, sc.y(isToday ? nowH - 2.5 : Math.max(FOCUS_START, Math.min(first, 18)) - 0.5));
  }

  /* ---------- Week ---------- */
  /* 2.67: the all-day strip across the week. An all-day event is one bar over the days it covers (cut square where it runs
     on past the week), packed into as few lanes as fit; key date marks keep their own day. Bars open the event. */
  function wkStrip(days) {
    var w0 = ymd(days[0].d), items = [], seen = {};
    days.forEach(function (x, c) {
      x.de.allDay.forEach(function (ev) {
        if (seen[ev.id]) return; seen[ev.id] = 1;
        var a = Math.max(0, daysBetween(w0, ev.start)), b = Math.min(days.length - 1, daysBetween(w0, ev.end) - 1);
        items.push({ ev: ev, a: a, b: Math.max(a, b), cl: daysBetween(w0, ev.start) < 0, cr: daysBetween(w0, ev.end) - 1 > days.length - 1 });
      });
    });
    items.sort(function (p, q) { return p.a - q.a || (q.b - q.a) - (p.b - p.a) || areaRank(p.ev.area) - areaRank(q.ev.area); });
    days.forEach(function (x, c) { x.marks.forEach(function (m) { items.push({ m: m, a: c, b: c }); }); });
    var lanes = [];
    items.forEach(function (it) {
      for (var l = 0; ; l++) {
        lanes[l] = lanes[l] || [];
        if (!lanes[l].some(function (o) { return o.a <= it.b && it.a <= o.b; })) { lanes[l].push(it); it.l = l; break; }
      }
    });
    return '<div class="wkads" style="grid-template-rows: repeat(' + Math.max(1, lanes.length) + ', auto)">' + items.map(function (it) {
      var pos = 'style="grid-column:' + (it.a + 1) + " / " + (it.b + 2) + ";grid-row:" + (it.l + 1) + '"';
      if (it.m) return '<button type="button" class="kdspan a-' + taskArea(it.m.o.d.area) + '" ' + pos + ' data-kd="' + esc(it.m.o.id) + '">◆ ' + esc(it.m.o.d.title) + (it.m.tag ? " · " + it.m.tag : "") + "</button>";
      state.index[it.ev.id] = it.ev;
      var n = it.b - it.a + 1;
      return '<button type="button" class="wkspan a-' + it.ev.area + (it.cl ? " cl" : "") + (it.cr ? " cr" : "") + pendingCls(it.ev) + '" ' + pos + ' data-id="' + esc(it.ev.id) + '" title="' + esc(it.ev.title) + '">' + esc(it.ev.title) +
        (n > 1 || it.cl || it.cr ? '<small class="tnum">' + esc(spanLabel(it.ev)) + "</small>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function spanLabel(ev) {   /* "16 to 19 NOV": the days it covers (end is the day after) */
    var a = parseYmd(ev.start), b = addDays(parseYmd(ev.end), -1);
    return sameDay(a, b) ? p2(a.getDate()) + " " + MON[a.getMonth()] : p2(a.getDate()) + (a.getMonth() === b.getMonth() ? "" : " " + MON[a.getMonth()]) + " to " + p2(b.getDate()) + " " + MON[b.getMonth()];
  }
  function renderWeek() {
    var r = viewRange(), list = visible(eventsFor(r)), now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
    var sc = makeScale(cssNum("--wh", 46));
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(r.from, i), de = dayEvents(list, d);
      days.push({ d: d, de: de, rows: layout(de.timed, d, sc, 20) });
    }
    days.forEach(function (x) { x.marks = kdMarks(ymd(x.d), false); });
    var hasAllDay = days.some(function (x) { return x.de.allDay.length || x.marks.length; });
    loadDates(false);
    var html = '<div class="wkpanel">' + phead(hiddenNote() ? "CALENDARS" : "ALL CALENDARS", !hasData(r) ? (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET") :
      hiddenNote() ? hiddenNote() + " · CHANGE ON TODAY" : "TAP A DAY TO OPEN IT") +
      '<div class="wkscroll"><div class="wk wkhead" id="wkhead"><div></div>';
    days.forEach(function (x) {
      html += '<button type="button" class="wkh' + (sameDay(x.d, now) ? " today" : "") + '" data-day="' + ymd(x.d) + '">' +
        DOW[x.d.getDay()] + '<b class="tnum">' + p2(x.d.getDate()) + "</b></button>";
    });
    if (hasAllDay) html += "<div></div>" + wkStrip(days);
    html += '</div><div class="wkbody" id="tlwrap"><div class="wk"><div class="wkgut" style="height:' + sc.total + 'px">';
    for (var h = 0; h < 24; h++) {
      html += '<span class="tnum' + (isFocus(h) ? "" : " quiet") + '" style="top:' + (sc.y(h) + 2) + 'px">' + p2(h) + "</span>";
    }
    html += "</div>";
    var lines = "";
    for (var k = 1; k < 24; k++) lines += '<div class="wkline" style="top:' + sc.y(k) + 'px"></div>';
    days.forEach(function (x) {
      html += '<div class="wkcol" data-ymd="' + ymd(x.d) + '" style="height:' + sc.total + 'px">' + quietBands(sc, "wkband") + lines;
      x.rows.forEach(function (row) {
        /* every block carries its title: one line (cut with …) when short, wrapped with its start time when tall */
        var ev = row.ev, hgt = Math.max(20, row.ye - row.ys - 2), tall = hgt >= 54;
        state.index[ev.id] = ev;
        html += '<button type="button" class="wkb a-' + ev.area + (ev.busy ? " busy" : "") + (tall ? " tall" : " one") + pendingCls(ev) + pastCls(ev) + '" data-id="' + esc(ev.id) + '" title="' + esc(ev.title) +
          '" style="top:' + (row.ys + 1) + "px;height:" + hgt + "px;left:calc(2px + (100% - 4px) * " + row.col + " / " + row.n +
          ");width:calc((100% - 4px) / " + row.n + ' - 2px)"><span class="lbl">' + (tall ? '<span class="tm tnum">' + hm(ev._s) + "</span>" : "") + esc(ev.title) + "</span></button>";
      });
      if (sameDay(x.d, now)) html += '<div class="wknow" style="top:' + sc.y(nowH) + 'px"></div>';
      html += "</div>";
    });
    html += "</div></div></div></div>";
    $("content").innerHTML = html;
    state.weekScale = sc;
    var thisWeek = days.some(function (x) { return sameDay(x.d, now); });
    state.scrollTarget = Math.max(0, sc.y(thisWeek ? Math.min(nowH, 18) - 2 : FOCUS_START) - 8);
  }

  /* ---------- Month ---------- */
  function renderMonth() {
    var r = viewRange(), list = visible(eventsFor(r)), now = new Date(), m = state.anchor.getMonth();
    loadDates(false);
    var html = '<div class="mo">';
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(function (d) { html += '<div class="moh">' + d + "</div>"; });
    for (var c = 0; c < 42; c++) {
      var d = addDays(r.from, c), de = dayEvents(list, d), all = de.allDay.concat(de.timed), marks = kdMarks(ymd(d), false);
      var lines = marks.map(function (mk) { return '<span class="li kdli a-' + taskArea(mk.o.d.area) + '">◆ ' + esc(mk.o.d.title) + (mk.tag ? " · " + mk.tag : "") + "</span>"; })
        .concat(all.map(function (ev) { return '<span class="li a-' + ev.area + pendingCls(ev) + '">' + (ev.allDay ? "" : '<span class="tnum">' + hm(ev._s) + "</span> ") + esc(ev.title) + "</span>"; }));
      var present = LIVE.filter(function (a) { return all.some(function (e) { return e.area === a; }); });
      html += '<button type="button" class="moc' + (d.getMonth() === m ? "" : " out") + (sameDay(d, now) ? " today" : "") + '" data-day="' + ymd(d) + '">' +
        '<span class="top1"><span class="n tnum">' + d.getDate() + '</span><span class="dots">' +
        present.map(function (a) { return '<i class="a-' + a + '"></i>'; }).join("") + "</span></span>" +
        lines.slice(0, 3).join("") +
        (lines.length > 3 ? '<span class="more">+' + (lines.length - 3) + " MORE</span>" : "") + "</button>";
    }
    html += "</div>";
    $("content").innerHTML = html;
  }

