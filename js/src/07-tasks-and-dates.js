  /* ---------- Key Dates (Notion) ---------- */
  var DATES_FRESH_MS = 5 * 60 * 1000;
  function canDates() { return state.caps.indexOf("dates") > -1; }
  /* Holidays (bridge 1.23): read from Google's holidays calendar, shown beside Key Dates as HOLIDAY.
     Never written anywhere, never counted in hours, meetings or BALANCE (they aren't calendar events
     here). A title on the IGNORED EVENTS list hides that holiday. */
  var LS_HOLS = "tos.hols.v1";
  function canHolidays() { return state.caps.indexOf("holidays") > -1; }
  function loadHolidays(force) {
    if (!state.conn || !canHolidays() || state.holsInflight) return;
    if (!force && state.hols && Date.now() - state.hols.fetched < 43200000) return;
    if (!force && state.holsErr && Date.now() - state.holsErr < FRESH_MS) return;
    state.holsInflight = true;
    var now = new Date();
    api({ action: "holidays", from: ymd(addDays(now, -7)), to: ymd(addDays(now, 400)) }).then(function (j) {
      state.hols = { fetched: Date.now(), calendar: j.calendar || null, list: (j.holidays || []).map(function (h) { return { d: h.date, t: h.title }; }) };
      state.holsErr = null; lsSet(LS_HOLS, state.hols);
    }).catch(function () { state.holsErr = Date.now(); })
      .then(function () { state.holsInflight = false; if (["bridge", "today", "week", "month", "dates", "systems", "loom"].indexOf(state.screen) > -1) render(true); });
  }
  function holidayDates() {
    if (!canHolidays() || !state.hols) return [];
    return state.hols.list.filter(function (h) { return !ignored({ title: h.t }); }).map(function (h) {
      return { id: "hol:" + h.d + ":" + h.t, title: h.t, start: h.d, end: null, area: null, type: "Holiday", yearly: false, holiday: true };
    });
  }
  function loadDates(force) {
    loadHolidays(force);
    if (!state.conn || !canDates() || state.datesInflight) return;
    if (!force && state.dates && Date.now() - state.dates.fetched < DATES_FRESH_MS) return;
    if (!force && state.datesErr && Date.now() - state.datesErr.at < FRESH_MS) return;
    state.datesInflight = true;
    api({ action: "dates" }).then(function (j) {
      state.dates = { fetched: Date.now(), dates: j.dates || [], areas: j.areas || [], types: j.types || [] };
      state.datesErr = null;
      lsSet(LS_DATES, state.dates);
      reconcileQueue();
    }).catch(function (err) {
      state.datesErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.datesInflight = false;
      if (["bridge", "today", "week", "month", "dates", "systems", "loom"].indexOf(state.screen) > -1) render(true);
    });
  }
  function addKeyDate(d) {
    if (!state.dates) state.dates = { fetched: 0, dates: [], areas: [], types: [] };
    if (!state.dates.dates.some(function (x) { return x.id === d.id; })) state.dates.dates.push(d);
    lsSet(LS_DATES, state.dates);
  }
  function leap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function shiftYear(s, by) {
    var y = +s.slice(0, 4) + by, m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (m === 2 && d === 29 && !leap(y)) d = 28;
    return y + "-" + p2(m) + "-" + p2(d);
  }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  /* Every occurrence overlapping [from, to] (yyyy-mm-dd, inclusive). Yearly dates repeat. */
  function occurrences(from, to) {
    var out = [], fy = +from.slice(0, 4), ty = +to.slice(0, 4);
    ((state.dates && state.dates.dates) || []).concat(holidayDates()).forEach(function (d) {
      var s = d.start, e = d.end || d.start;
      var add = function (os, oe) { if (os <= to && oe >= from) { var o = { d: d, s: os, e: oe, id: d.id + "@" + os }; state.index["kd:" + o.id] = o; out.push(o); } };
      if (!d.yearly) { add(s, e); return; }
      for (var y = fy - 1; y <= ty; y++) add(shiftYear(s, y - +s.slice(0, 4)), shiftYear(e, y - +s.slice(0, 4)));
    });
    return out.sort(function (a, b) { return a.s.localeCompare(b.s) || a.d.title.localeCompare(b.d.title); });
  }
  function countdown(o, ref) {
    if (o.s > ref) { var n = daysBetween(ref, o.s); return n === 1 ? "TOMORROW" : "IN " + n + " D"; }
    if (o.s === ref) return o.e > ref ? "STARTS TODAY" : "TODAY";
    if (o.e >= ref) return o.e === ref ? "ENDS TODAY" : daysBetween(ref, o.e) + " D LEFT";
    return "PAST";
  }
  function soon(o, ref) { return o.s <= ref || daysBetween(ref, o.s) <= 7; }
  function shortDay(s) { var d = parseYmd(s); return p2(d.getDate()) + " " + MON[d.getMonth()]; }
  function rangeLabel(o) { return o.e !== o.s ? shortDay(o.s) + " TO " + shortDay(o.e) : shortDay(o.s); }
  /* Key dates to mark on one day: single dates, window starts and ends (and, if asked, days inside a window). */
  function kdMarks(day, inside) {
    if (!(canDates() && state.dates) && !holidayDates().length) return [];
    return occurrences(day, day).filter(function (o) { return o.s === day || o.e === day || inside; }).map(function (o) {
      var tag = "";
      if (o.e !== o.s) tag = o.s === day ? "STARTS" : o.e === day ? "ENDS" : "DAY " + (daysBetween(o.s, day) + 1) + " OF " + (daysBetween(o.s, o.e) + 1);
      return { o: o, tag: tag };
    });
  }
  function kdRow(o, ref) {
    var d = o.d, meta = d.holiday ? "HOLIDAY" : [bare(d.type), bare(d.area), d.yearly ? "YEARLY" : ""].filter(Boolean).map(esc).join(" · ");
    return '<button type="button" class="kd ' + (d.holiday ? "a-holiday" : "a-" + taskArea(d.area)) + '" data-kd="' + esc(o.id) + '"><span class="st"></span>' +
      '<span class="dt tnum">' + rangeLabel(o) + '</span><span class="tt"><b>' + esc(d.title) + "</b>" + (meta ? "<small>" + meta + "</small>" : "") + "</span>" +
      '<span class="pill tnum' + (soon(o, ref) ? " soon" : "") + '">' + countdown(o, ref) + "</span></button>";
  }
  function keyDatesPanel(day) {
    if (!canDates()) return phead("KEY DATES", "") + stubBox(state.conn ? "Needs the Key Dates database connected in Notion. Steps are in the README." : "Link calendars first.");
    if (!state.dates) return phead("KEY DATES", "") + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div>";
    var list = occurrences(day, ymd(addDays(parseYmd(day), 30)));
    var html = phead("KEY DATES", "NEXT 30 DAYS");
    if (!list.length) html += '<div class="empty">Nothing in the next 30 days.</div>';
    list.slice(0, 5).forEach(function (o) { html += kdRow(o, day); });
    if (list.length > 5) html += '<div class="muted" style="font-size:14px;margin-top:6px">+' + (list.length - 5) + " more in the next 30 days</div>";
    html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="dates">ALL KEY DATES</button>' +
      '<button type="button" class="btn" data-act="adddate">+ ADD</button></div>';
    if (state.datesErr) html += stale(state.dates.fetched);
    return html;
  }
  function renderDatesScreen() {
    loadDates(false);
    var html = '<div class="kdscreen">';
    if (!canDates()) {
      $("content").innerHTML = html + phead("KEY DATES", "SETUP") + stubBox("Needs the Key Dates database connected to the TimothyOS integration in Notion. Steps are in the README under <b>Connect Notion</b>.") + "</div>";
      return;
    }
    var today = ymd(new Date()), end = ymd(addDays(new Date(), 365)), f = state.kdFilter;
    var areas = [["", "ALL"], ["work", "WORK"], ["personal", "PERSONAL"], ["farm", AREAS.farm.name], ["hobby", AREAS.hobby.name]].concat(holidayDates().length ? [["holiday", "HOLIDAYS"]] : []);
    html += '<div class="kdtools"><div class="chips">' + areas.map(function (a) {
      return '<button type="button" class="chip' + (a[0] ? " a-" + a[0] : "") + '" data-kdf="' + a[0] + '" aria-pressed="' + ((f || "") === a[0]) + '">' + a[1] + "</button>";
    }).join("") + '</div><button type="button" class="btn" data-act="adddate">+ ADD KEY DATE</button></div>';
    if (!state.dates) { $("content").innerHTML = html + '<div class="empty">' + (state.datesErr ? esc(state.datesErr.msg) : "Loading key dates…") + "</div></div>"; return; }
    var list = occurrences(today, end).filter(function (o) { return !f || (f === "holiday" ? !!o.d.holiday : !o.d.holiday && taskArea(o.d.area) === f); });
    var now = list.filter(function (o) { return o.s < today; }), later = list.filter(function (o) { return o.s >= today; });
    if (now.length) html += '<div class="dgroup">' + phead("HAPPENING NOW", now.length + (now.length === 1 ? " WINDOW" : " WINDOWS")) + now.map(function (o) { return kdRow(o, today); }).join("") + "</div>";
    var byMonth = {};
    later.forEach(function (o) { var k = o.s.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(o); });
    Object.keys(byMonth).sort().forEach(function (k) {
      var g = byMonth[k], d = parseYmd(k + "-01");
      html += '<div class="dgroup">' + phead(MONL[d.getMonth()] + " " + d.getFullYear(), g.length + (g.length === 1 ? " DATE" : " DATES")) + g.map(function (o) { return kdRow(o, today); }).join("") + "</div>";
    });
    if (!list.length) html += '<div class="empty" style="margin-top:20px">' + (f ? "No key dates in this area for the next 12 months." : "No key dates yet. Tap + ADD KEY DATE, or add them in Notion.") + "</div>";
    html += '<div class="muted" style="margin-top:22px;font-size:14px">Past dates stay in Notion. Edit or delete key dates there.</div>';
    if (state.datesErr) html += stale(state.dates.fetched);
    $("content").innerHTML = html + "</div>";
  }
  function openKeyDate(o) {
    var d = o.d, ref = ymd(new Date());
    var when = o.e !== o.s ? dLabel(parseYmd(o.s)) + " TO " + dLabel(parseYmd(o.e)) : dLabel(parseYmd(o.s));
    if (d.holiday) {
      $("detailSheet").className = "sheet a-holiday";
      $("detailSheet").style.setProperty("--c", "var(--chrome-c)");
      $("detailSheet").innerHTML = '<div class="sbar"><span>◆ HOLIDAY</span><span>' + esc((state.hols && state.hols.calendar) || "HOLIDAYS").toUpperCase() + "</span></div>" +
        '<div class="sbody"><h3 id="detailTitle">' + esc(d.title) + '</h3><div class="tnum">' + esc(when) + " · " + countdown(o, ref) + "</div>" +
        '<div class="muted">From Google\'s holidays calendar, read-only. Not counted in hours or BALANCE.</div></div>' +
        '<div class="sfoot btnrow"><button type="button" class="btn ghost" data-ignore="' + esc(d.title) + '">HIDE THIS HOLIDAY</button><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
      showSheet("detailScrim"); $("detailClose").focus();
      return;
    }
    $("detailSheet").className = "sheet a-" + taskArea(d.area);
    $("detailSheet").style.setProperty("--c", "var(--" + taskArea(d.area) + ")");
    $("detailSheet").innerHTML = '<div class="sbar"><span>◆ KEY DATE</span><span>' + esc(bare(d.type)) + "</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + esc(d.title) + '</h3><div class="tnum">' + esc(when) + " · " + countdown(o, ref) + "</div>" +
      '<div class="muted">' + [bare(d.area), d.yearly ? "Repeats every year" : ""].filter(Boolean).map(esc).join(" · ") + "</div>" +
      (d.notes ? "<div>" + esc(d.notes) + "</div>" : "") +
      '</div><div class="sfoot btnrow">' + (d.url ? '<a class="btn ghost" href="' + esc(d.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") +
      '<button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("detailClose").focus();
  }
  function fillDateSelects() {
    var areas = (state.dates && state.dates.areas.length ? state.dates.areas : (state.tasks[ymd(new Date())] || {}).areas) || [];
    var types = (state.dates && state.dates.types) || [];
    $("capLifeArea").innerHTML = '<option value="">Life Area</option>' + areas.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("");
    $("capKdType").innerHTML = '<option value="">Type</option>' + types.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("");
    if (capPrefs.kdArea && areas.indexOf(capPrefs.kdArea) > -1) $("capLifeArea").value = capPrefs.kdArea;
    if (capPrefs.kdType && types.indexOf(capPrefs.kdType) > -1) $("capKdType").value = capPrefs.kdType;
  }

  /* ---------- Plan Day + Priorities (Notion Master Task List) ---------- */
  var DONE = "✅ Done", TODO = "⬜ To Do", INPROG = "🔄 In Progress", BLOCKED = "🚫 Blocked";
  var PRI_RANK = { "🔴 High": 0, "🟡 Medium": 1, "🟢 Low": 2 };
  var plan = null;

  function canPlan() { return state.caps.indexOf("tasks") > -1; }
  /* Map a Notion Life Area onto the four TimothyOS colors. */
  function taskArea(name) {
    if (!name) return "personal";
    if (/Work/i.test(name)) return "work";
    if (/Farm|Bee/i.test(name)) return "farm";
    if (/Growth|Creative|Hobb/i.test(name)) return "hobby";
    return "personal";
  }
  function dueLabel(due, day) {
    if (!due) return "";
    var n = Math.round((parseYmd(due) - parseYmd(day)) / 86400000);
    if (n < 0) return "OVERDUE " + -n + "D";
    if (n === 0) return "DUE TODAY";
    if (n === 1) return "DUE TOMORROW";
    return "DUE " + dLabel(parseYmd(due));
  }
  function taskMeta(t, day) {
    return [bare(t.priority), t.status === INPROG || t.status === BLOCKED ? bare(t.status) : "", bare(t.area), dueLabel(t.due, day)].filter(Boolean).map(esc).join(" · ");
  }
  function rankTasks(list) {
    return list.slice().sort(function (a, b) {
      var pa = PRI_RANK[a.priority] === undefined ? 3 : PRI_RANK[a.priority], pb = PRI_RANK[b.priority] === undefined ? 3 : PRI_RANK[b.priority];
      return (a.status === INPROG ? -1 : 0) - (b.status === INPROG ? -1 : 0) || pa - pb || (a.due || "9999").localeCompare(b.due || "9999");
    });
  }
  /* Which day lists to keep: today, the day Plan Day is on, then the most recently fetched, up to
     eight, nothing older than three days. (Until 2.12.2 it kept the four latest dates, so a few
     later days pushed today's list out the moment it was saved, and the app fetched it forever.)
     Provisional lists stay in memory but aren't stored. */
  function saveTasks() {
    var today = ymd(new Date()), from = ymd(addDays(new Date(), -3)), pin = plan ? plan.day : null, keep = {}, stored = {};
    var days = Object.keys(state.tasks).filter(function (d) { return state.tasks[d] && (d >= from || d === pin); });
    days.sort(function (a, b) {
      var ra = a === today || a === pin ? 1 : 0, rb = b === today || b === pin ? 1 : 0;
      return rb - ra || (state.tasks[b].fetched || 0) - (state.tasks[a].fetched || 0);
    });
    days.slice(0, 8).forEach(function (d) { keep[d] = state.tasks[d]; if (!keep[d].provisional) stored[d] = keep[d]; });
    state.tasks = keep;
    lsSet(LS_TASKS, stored);
  }
  function describeTasks(err) {
    var code = err && (err.code || err.message);
    return {
      notion_not_configured: "Notion isn't set up yet. Add NOTION_TOKEN to the bridge's Script Properties.",
      notion_unauthorized: "Notion rejected the bridge's key. Check NOTION_TOKEN in Script Properties.",
      notion_not_shared: "The Master Task List isn't connected to the TimothyOS integration in Notion.",
      notion_busy: "Notion is busy. Try again in a moment.",
      not_writable: "That task isn't in your Master Task List."
    }[code] || describe(err);
  }

  /* A new day has no list yet, but the open tasks hardly change overnight: until the bridge
     answers, show the most recent list (within 3 days), with this day's picks taken from each
     task's Focus Date. Marked provisional, so it's always replaced (2.12.1). */
  function tasksStandIn(day) {
    var src = null;
    Object.keys(state.tasks).forEach(function (k) { var t = state.tasks[k]; if (k !== day && t && !t.provisional && (!src || t.fetched > src.fetched)) src = t; });
    if (!src || Date.now() - src.fetched > 3 * 86400000) return null;
    var seen = {}, focus = [];
    src.focus.concat(src.open).forEach(function (t) { if (t.focus === day && !seen[t.id]) { seen[t.id] = 1; focus.push(t); } });
    return { fetched: src.fetched, focus: focus, open: src.open, areas: src.areas, priorities: src.priorities, provisional: true };
  }
  function loadTasks(day, force) {
    if (!state.conn || !canPlan()) return;
    if (!state.tasks[day]) { var standIn = tasksStandIn(day); if (standIn) state.tasks[day] = standIn; }
    if (state.tasksInflight[day]) return;
    var have = state.tasks[day];
    if (!force && have && !have.provisional && Date.now() - have.fetched < TASKS_FRESH_MS) return;
    if (!force && Date.now() - (state.tasksAsked[day] || 0) < 15000) return;   /* a safety net: never a fetch loop */
    state.tasksAsked[day] = Date.now();
    if (!force && state.tasksErr && Date.now() - state.tasksErr.at < FRESH_MS) return;
    state.tasksInflight[day] = true;
    return api({ action: "tasks", day: day }).then(function (j) {
      state.tasks[day] = { fetched: Date.now(), focus: j.focus || [], open: j.open || [], areas: j.areas || [], priorities: j.priorities || [] };
      state.tasksErr = null;
      saveTasks();
    }).catch(function (err) {
      state.tasksErr = { at: Date.now(), msg: describeTasks(err), code: errCode(err) };
    }).then(function () {
      delete state.tasksInflight[day];
      if (plan && plan.day === day) renderPlan();
      if (state.screen === "today" || state.screen === "bridge" || state.screen === "systems") render(true);
    });
  }

  function prioritiesPanel(day, isToday, extra, title) {
    title = title || "PRIORITIES";   /* the Bridge calls them ORDERS OF THE DAY (2.63) */
    if (!canPlan()) {
      return phead(title, "") + stubBox(state.conn ? "Needs the Notion link: a Notion key in the Google bridge. Steps are in the README." : "Link calendars first.");
    }
    var data = state.tasks[day], past = day < ymd(new Date());
    if (!data) {
      return phead(title, "") + '<div class="empty">' + (state.tasksErr ? esc(state.tasksErr.msg) : "Loading your Master Task List…") + "</div>";
    }
    var focus = data.focus.slice().sort(function (a, b) { return (a.status === DONE) - (b.status === DONE); });
    var done = focus.filter(function (t) { return t.status === DONE; }).length;
    var html = phead(title, focus.length ? done + " OF " + focus.length + " DONE" : "", null, extra);
    if (!focus.length) {
      html += '<div class="empty">' + (past ? "No priorities were picked for this day." : "No priorities picked yet.") + "</div>";
    }
    focus.forEach(function (t) {
      var isDone = t.status === DONE, busy = !!state.taskBusy[t.id];
      html += '<button type="button" class="prio a-' + taskArea(t.area) + (isDone ? " done" : "") + (busy ? " busy" : "") + '" data-task="' + esc(t.id) + '" data-day="' + day +
        '" aria-pressed="' + isDone + '" aria-label="' + esc(t.title) + (isDone ? ", done. Tap to reopen." : ". Tap to mark done.") + '">' +
        '<span class="box">' + (isDone ? "✓" : "") + '</span><span class="pt"><b>' + esc(t.title) + "</b><small>" + taskMeta(t, day) + "</small></span></button>";
    });
    if (!past) {
      html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn plan" data-act="plan" data-day="' + day + '">' +
        (focus.length ? "CHANGE PICKS" : "PLAN " + (isToday ? "TODAY" : dLabel(parseYmd(day)))) + "</button></div>";
    }
    if (state.tasksErr) html += stale(data.fetched);
    return html;
  }

  /* Tap a priority: Done in Notion, or back to its previous status. */
  function toggleDone(id, day) {
    var data = state.tasks[day];
    if (!data || state.taskBusy[id]) return;
    var t = data.focus.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var before = t.status, next = before === DONE ? (t._prev && t._prev !== DONE ? t._prev : TODO) : DONE;
    t._prev = before;
    t.status = next;
    state.taskBusy[id] = true;
    render(true);
    if (next === DONE) document.querySelectorAll('.prio[data-task="' + id + '"]').forEach(function (el) { restartClass(el, "justdone"); });
    apiPost({ action: "status", id: id, status: next }).then(function () {
      delete state.taskBusy[id];
      saveTasks();
      toast(next === DONE ? "Done. Marked Done in Notion." : "Reopened in Notion.");
      render(true);
    }).catch(function (err) {
      delete state.taskBusy[id];
      t.status = before;
      toast("Not changed: " + describeTasks(err));
      render(true);
    });
  }

  function notionSection() {
    var data = state.tasks[ymd(new Date())];
    var html = '<section id="sec-notion">' + phead("NOTION", canPlan() ? "MASTER TASK LIST" : "NOT LINKED");
    if (!canPlan()) {
      html += '<div class="stubbox"><span class="pill">SETUP</span><span>Plan Day and Priorities need a Notion key in its Script Properties. Steps are in the README under <b>Connect Notion</b>.</span></div>';
    } else if (state.tasksErr) {
      html += '<div class="calrow a-personal"><span class="st"></span><span><b>Master Task List</b><small class="errtxt">' + esc(state.tasksErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>';
    } else {
      html += '<div class="calrow a-personal"><span class="st"></span><span><b>Master Task List</b><small>' +
        (data ? data.open.length + " open tasks · " + data.focus.length + " picked for today · synced " + esc(stamp(data.fetched)) : "Not loaded yet") +
        '</small></span><span class="pill ok">OK</span></div>';
    }
    if (canBalance()) {
      html += state.doneErr
        ? '<div class="calrow a-hobby"><span class="st"></span><span><b>Balance</b><small class="errtxt">' + esc(state.doneErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>'
        : '<div class="calrow a-hobby"><span class="st"></span><span><b>Balance</b><small>' + (state.done ? state.done.done.length + " tasks finished in the last 30 days · synced " + esc(stamp(state.done.fetched)) : "Not loaded yet") +
          '</small></span><span class="pill ok">OK</span></div>';
    } else if (canPlan()) {
      html += '<div class="calrow a-hobby" style="opacity:.6"><span class="st"></span><span><b>Balance</b><small>Needs the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>.</small></span><span class="pill">SETUP</span></div>';
    }
    if (canReviews()) {
      var lw = state.weeks[ymd(sow(new Date()))] || state.weeks[ymd(addDays(sow(new Date()), -7))];
      html += lw && lw.reviewsError
        ? '<div class="calrow a-personal"><span class="st"></span><span><b>Weekly Reviews</b><small class="errtxt">' + (lw.reviewsError === "notion_not_shared" ? "Not connected. In Notion: Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: lw.reviewsError }))) + '</small></span><span class="pill bad">SETUP</span></div>'
        : '<div class="calrow a-personal"><span class="st"></span><span><b>Weekly Reviews</b><small>' + Object.keys(savedWeeks).length + " saved from this iPad · open REVIEW to write this week's</small></span><span class=\"pill ok\">OK</span></div>";
    } else if (canPlan()) {
      html += '<div class="calrow a-personal" style="opacity:.6"><span class="st"></span><span><b>Weekly Reviews</b><small>Needs the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>.</small></span><span class="pill">SETUP</span></div>';
    }
    if (canDates()) {
      html += state.datesErr
        ? '<div class="calrow a-farm"><span class="st"></span><span><b>Key Dates</b><small class="errtxt">' + esc(state.datesErr.msg) + '</small></span><span class="pill bad">ERROR</span></div>'
        : '<div class="calrow a-farm"><span class="st"></span><span><b>Key Dates</b><small>' + (state.dates ? state.dates.dates.length + " key dates · synced " + esc(stamp(state.dates.fetched)) : "Not loaded yet") +
          '</small></span><span class="pill ok">OK</span></div>';
    } else if (canPlan()) {
      html += '<div class="calrow a-farm" style="opacity:.6"><span class="st"></span><span><b>Key Dates</b><small>Needs the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>.</small></span><span class="pill">SETUP</span></div>';
    }
    if (canHolidays()) html += '<div class="calrow a-holiday"><span class="st"></span><span><b>Holidays</b><small>' + (state.hols ? (state.hols.calendar ? esc(state.hols.calendar) + " · " + holidayDates().length + " shown in the next 13 months · read-only" : "No holidays calendar found. Subscribe to one in Google Calendar, or set HOLIDAY_CALENDAR_ID.") : "Not loaded yet") +
      '</small></span><span class="pill' + (state.hols && state.hols.calendar ? " ok\">OK" : "\">" + (state.hols ? "NOT FOUND" : "…")) + "</span></div>";
    if (canPlan()) {
      var sp = schemaProblems(), conn = sch.d ? sch.d.dbs.filter(function (d) { return !d.error; }).length : 0;
      html += '<div class="calrow a-personal"><span class="st"></span><span><b>Columns</b><small' + (sp.length ? ' class="errtxt">' + schemaText(sp).map(esc).join("<br>") :
        ">" + (!canSchema() ? "The column check needs the Google bridge updated." : sch.err && !sch.d ? esc(sch.err) : sch.d ? "Every connected database (" + conn + ") has the columns the bridge uses · checked " + esc(stamp(sch.d.fetched)) : "Checking…")) +
        '</small></span><span class="pill' + (sp.length ? ' warn">CHANGED' : canSchema() && sch.d ? ' ok">OK' : '">…') + "</span></div>" +
        (canSchema() ? '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn sm ghost" data-act="schemacheck">CHECK NOTION COLUMNS</button></div>' : "") + exportRowHtml();
    }
    return html + "</section>";
  }

  /* --- the Plan Day sheet --- */
  function openPlan(day) {
    if (!canPlan()) return;
    var d = ymd(day || (state.screen === "today" && ymd(state.anchor) >= ymd(new Date()) ? state.anchor : new Date()));
    plan = { day: d, picks: {}, initial: {}, showAll: false, saving: false, err: "", touched: false, seeded: false, seededProv: false };
    loadTasks(d, true);   /* first, so a new day's provisional list is there to draw */
    renderPlan();
    showSheet("planScrim");
  }
  function closePlan() { hideSheet("planScrim"); plan = null; }
  function openPicks() {
    var data = state.tasks[plan.day];
    if (!data) return 0;
    var all = data.open.concat(data.focus);
    return Object.keys(plan.picks).filter(function (id) {
      var t = all.filter(function (x) { return x.id === id; })[0];
      return t && t.status !== DONE;
    }).length;
  }
  function kdComing(day) {
    if (!canDates() || !state.dates) return "";
    var list = occurrences(day, ymd(addDays(parseYmd(day), 14))).slice(0, 3);
    return list.length ? '<div class="dayline kdline">◆ COMING UP: ' + list.map(function (o) { return esc(o.d.title) + " " + countdown(o, day); }).join(" · ") + "</div>" : "";
  }
  function dayContext(day) {
    var d = parseYmd(day), r = { from: sow(d), to: addDays(sow(d), 7) };
    var de = dayEvents(visible(eventsFor(r)), d), timed = de.timed;
    if (!hasData(r)) return "Calendar for this day isn't loaded yet.";
    var parts = [timed.length + (timed.length === 1 ? " EVENT" : " EVENTS")];
    if (timed.length) parts.push("FIRST " + hm(timed[0]._s) + " " + esc(timed[0].title).toUpperCase());
    /* longest open stretch between 07:00 and 21:00 */
    var d0 = sod(d), cursor = FOCUS_START, best = 0, bestAt = null;
    timed.forEach(function (ev) {
      var s = posInDay(ev._s, d0), e = posInDay(ev._e, d0);
      if (s > cursor && Math.min(s, FOCUS_END) - cursor > best) { best = Math.min(s, FOCUS_END) - cursor; bestAt = cursor; }
      cursor = Math.max(cursor, e);
    });
    if (FOCUS_END - cursor > best) { best = FOCUS_END - cursor; bestAt = cursor; }
    if (best >= 0.5) {
      var a = new Date(d0), b = new Date(d0);
      a.setMinutes(Math.round(bestAt * 60)); b.setMinutes(Math.round((bestAt + best) * 60));
      parts.push("LONGEST OPEN STRETCH " + hm(a) + " TO " + hm(b));
    }
    return parts.join(" · ");
  }
  function planRow(t, day) {
    var on = !!plan.picks[t.id], isDone = t.status === DONE;
    return '<button type="button" class="cand a-' + taskArea(t.area) + (isDone ? " isdone" : "") + '" data-pick="' + esc(t.id) + '" aria-pressed="' + on + '">' +
      '<span class="st"></span><span class="ct"><b>' + esc(t.title) + "</b><small>" + (isDone ? "DONE · " : "") + taskMeta(t, day) + "</small></span>" +
      '<span class="box">' + (on ? "✓" : "") + "</span></button>";
  }
  function renderPlan() {
    if (!plan) return;
    var day = plan.day, data = state.tasks[day], html;
    /* picks seeded from a provisional list are re-seeded from the real one, unless you've changed them */
    if (data && (!plan.seeded || (plan.seededProv && !data.provisional && !plan.touched))) {
      plan.picks = {}; plan.initial = {};
      data.focus.forEach(function (t) { plan.picks[t.id] = true; plan.initial[t.id] = true; });
      plan.seeded = true; plan.seededProv = !!data.provisional;
    }
    var title = sameDay(parseYmd(day), new Date()) ? "PLAN TODAY · " + dLabel(parseYmd(day)) : "PLAN " + dLabel(parseYmd(day));
    html = '<div class="sbar"><span>' + title + '</span><span id="planCount">' + (data ? openPicks() + " OF 3 PICKED" + (data.provisional ? " · UPDATING" : "") : "") + "</span></div>" +
      '<div class="sbody"><div class="dayline">' + dayContext(day) + "</div>" + kdComing(day);
    if (!data) {
      html += '<div class="empty">' + (state.tasksErr ? esc(state.tasksErr.msg) : "Loading your Master Task List…") + "</div>";
    } else {
      var used = {}, groups = [], day7 = ymd(addDays(parseYmd(day), 7));
      var pool = rankTasks(data.open.filter(function (t) { return t.status !== DONE; }));
      var take = function (label, list) { list = list.filter(function (t) { return !used[t.id]; }); list.forEach(function (t) { used[t.id] = 1; }); if (list.length) groups.push([label, list]); };
      take("PICKED FOR THIS DAY", rankTasks(data.focus));
      take("CARRIED OVER", pool.filter(function (t) { return t.focus && t.focus < day; }));
      take("OVERDUE", pool.filter(function (t) { return t.due && t.due < day; }));
      take("DUE IN THE NEXT 7 DAYS", pool.filter(function (t) { return t.due && t.due <= day7; }));
      take("HIGH PRIORITY OR IN PROGRESS", pool.filter(function (t) { return t.priority === "🔴 High" || t.status === INPROG; }));
      var rest = pool.filter(function (t) { return !used[t.id] && t.status !== BLOCKED; }).concat(pool.filter(function (t) { return !used[t.id] && t.status === BLOCKED; }));
      groups.forEach(function (g) {
        html += '<div class="pgroup">' + g[0] + '</div><div class="cands">' + g[1].map(function (t) { return planRow(t, day); }).join("") + "</div>";
      });
      if (rest.length) {
        html += '<button type="button" class="chip" data-showall="1">' + (plan.showAll ? "HIDE" : "SHOW") + " ALL OTHER OPEN TASKS (" + rest.length + ")</button>";
        if (plan.showAll) html += '<div class="cands" style="margin-top:8px">' + rest.map(function (t) { return planRow(t, day); }).join("") + "</div>";
      }
      if (!groups.length && !rest.length) html += '<div class="empty">No open tasks in your Master Task List. Add one below.</div>';
      html += '<div class="pgroup">ADD A NEW TASK FOR THIS DAY</div><div class="newtask">' +
        '<input type="text" id="planNew" maxlength="200" placeholder="New task" enterkeyhint="done">' +
        '<select id="planArea" aria-label="Life Area"><option value="">Life Area</option>' + data.areas.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("") + "</select>" +
        '<select id="planPri" aria-label="Priority"><option value="">Priority</option>' + data.priorities.map(function (a) { return '<option value="' + esc(a) + '">' + esc(bare(a)) + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="btn" id="planAdd">ADD</button></div>';
    }
    html += '<div class="err" id="planErr" role="alert">' + esc(plan.err) + "</div></div>" +
      '<div class="sfoot capfoot"><span class="muted">Saved to Notion as Focus Date. Check them off on Today.</span><span class="btnrow">' +
      '<button type="button" class="btn ghost" id="planCancel">CANCEL</button>' +
      '<button type="button" class="btn capture" id="planSave"' + (!data || plan.saving || navigator.onLine === false ? " disabled" : "") + ">" +
      (plan.saving ? esc(plan.saving) : navigator.onLine === false ? "OFFLINE" : "SET PRIORITIES") + "</button></span></div>";
    var sheet = $("planSheet"), top = sheet.scrollTop;
    sheet.innerHTML = html;
    sheet.scrollTop = top;
  }
  function togglePick(id) {
    plan.touched = true;
    if (plan.picks[id]) delete plan.picks[id];
    else if (openPicks() >= 3) { toast("Three is the limit. Unpick one first."); return; }
    else plan.picks[id] = true;
    var b = document.querySelector('[data-pick="' + id.replace(/"/g, "") + '"]');
    if (b) { b.setAttribute("aria-pressed", String(!!plan.picks[id])); b.querySelector(".box").textContent = plan.picks[id] ? "✓" : ""; }
    $("planCount").textContent = openPicks() + " OF 3 PICKED";
  }
  function addPlanTask() {
    var title = $("planNew").value.trim();
    if (!title) { plan.err = "Type the new task first."; renderPlan(); return; }
    if (openPicks() >= 3) { toast("Three is the limit. Unpick one first."); return; }
    var btn = $("planAdd");
    btn.disabled = true; btn.textContent = "ADDING…";
    apiPost({ action: "addtask", task: { cid: newCid(), title: title.slice(0, 200), area: $("planArea").value || null, priority: $("planPri").value || null, day: plan.day } })
      .then(function (j) {
        var data = state.tasks[plan.day];
        data.focus.push(j.task); data.open.push(j.task);
        plan.picks[j.task.id] = true; plan.initial[j.task.id] = true;   /* already focused on this day */
        plan.err = "";
        saveTasks();
        toast("Added to Master Task List and picked");
        renderPlan();
      }).catch(function (err) { plan.err = "Not added: " + describeTasks(err); renderPlan(); });
  }
  /* Save the difference: new picks get Focus Date = day, removed picks are cleared. */
  function savePlan() {
    var day = plan.day, add = [], drop = [];
    Object.keys(plan.picks).forEach(function (id) { if (!plan.initial[id]) add.push([id, day]); });
    Object.keys(plan.initial).forEach(function (id) { if (!plan.picks[id]) drop.push([id, null]); });
    var jobs = add.concat(drop), done = 0;
    if (!jobs.length) { closePlan(); return; }
    var step = function () {
      if (!plan) return;
      if (done === jobs.length) {
        var n = openPicks();
        closePlan();
        toast(n + (n === 1 ? " priority" : " priorities") + " set for " + dLabel(parseYmd(day)));
        loadTasks(day, true);
        return;
      }
      plan.saving = "SAVING " + (done + 1) + " OF " + jobs.length + "…";
      renderPlan();
      apiPost({ action: "focus", id: jobs[done][0], day: jobs[done][1] }).then(function () {
        if (jobs[done][1]) plan.initial[jobs[done][0]] = true; else delete plan.initial[jobs[done][0]];
        done++;
        step();
      }).catch(function (err) {
        plan.saving = false;
        plan.err = "Stopped after " + done + " of " + jobs.length + ": " + describeTasks(err) + " Tap SET PRIORITIES to try the rest.";
        renderPlan();
      });
    };
    step();
  }
  $("planBtn").addEventListener("click", function () { openPlan(); });
  $("askBtn").addEventListener("click", openAsk);
  $("askClose").addEventListener("click", closeAsk);
  $("askSend").addEventListener("click", askSend);
  $("askOpen").addEventListener("click", openInClaude);
  $("askNew").addEventListener("click", function () { askState = null; freshAsk(); $("askErr").textContent = ""; renderAsk(); $("askText").focus(); });
  $("askDeep").addEventListener("click", function () { freshAsk(); askState.deep = !askState.deep; saveAsk(); renderAsk(); });
  /* At the monthly reminder: CONTINUE for the rest of the month (the Claude Console's own limit still applies), then send again. */
  $("askErr").addEventListener("click", function (e) {
    if (!e.target.closest("#askContinue")) return;
    e.target.closest("#askContinue").disabled = true;
    apiPost({ action: "aicontinue" }).then(function (j) {
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      $("askErr").textContent = "";
      renderAsk();
      askSend();
    }).catch(function (err) { $("askErr").textContent = describeAi(err); });
  });
  $("askText").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); } });
  $("askScrim").addEventListener("click", function (e) {
    if (e.target === $("askScrim")) { closeAsk(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    var k = (b.dataset.pok || b.dataset.pcancel || "").split(":");
    if (b.dataset.pok) runProposal(+k[0], +k[1]);
    else if (b.dataset.pcancel) { askState.msgs[+k[0]].proposals[+k[1]].state = "cancelled"; saveAsk(); renderAsk(); }
  });
  $("planScrim").addEventListener("click", function (e) {
    if (e.target === $("planScrim")) { closePlan(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled || !plan) return;
    if (b.dataset.pick) togglePick(b.dataset.pick);
    else if (b.dataset.showall) { plan.showAll = !plan.showAll; renderPlan(); }
    else if (b.id === "planAdd") addPlanTask();
    else if (b.id === "planCancel") closePlan();
    else if (b.id === "planSave") savePlan();
  });
  $("planScrim").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.id === "planNew") { e.preventDefault(); addPlanTask(); } });

