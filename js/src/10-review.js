  /* ---------- Weekly Review ---------- */
  /* Once a week (due Sunday 14:00 to Tuesday night): how the week went, then a
     short reflection saved to the Weekly Reviews database in Notion, one page
     per week, together with the week's numbers and Captain's Log lines. */
  var WEEK_FRESH_MS = 2 * 60 * 1000;
  var REVIEW_FIELDS = [
    ["wentWell", "1 · WHAT WENT WELL?", "Wins, good moments, what worked"],
    ["drained", "2 · WHAT DRAINED ME?", "What cost more than it gave"],
    ["nextFocus", "3 · WHAT'S MY NEXT FOCUS?", "The one or two things that matter most next week"],
    ["bearing", "4 · WHERE DID I HOLD MY BEARING?", "Moments you stayed on course, and what helped"]
  ];
  function canReviews() { return state.caps.indexOf("reviews") > -1; }
  /* The week a review is due for: from Sunday 14:00 it's this week; on Monday and Tuesday, last week. */
  function reviewDue(now) {
    var d = now.getDay();
    if (d === 0 && now.getHours() >= 14) return sow(now);
    if (d === 1 || d === 2) return addDays(sow(now), -7);
    return null;
  }
  function reviewSaved(wk) {
    var w = state.weeks[wk];
    return !!((w && w.review) || savedWeeks[wk]);
  }
  function defaultReviewWeek() {
    var now = new Date(), due = reviewDue(now);
    return due && !reviewSaved(ymd(due)) ? due : sow(now);
  }
  function weekLabel(w0) {
    var w1 = addDays(w0, 6);
    return "WEEK " + isoWeek(w0) + " · " + p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + MON[w0.getMonth()] : "") + " TO " + p2(w1.getDate()) + " " + MON[w1.getMonth()];
  }
  function loadWeek(w0, force) {
    var wk = ymd(w0), have = state.weeks[wk];
    if (!state.conn || !canReviews() || state.weekInflight[wk]) return;
    if (!force && have && Date.now() - have.fetched < WEEK_FRESH_MS) return;
    if (!force && state.weekErr && state.weekErr.wk === wk && Date.now() - state.weekErr.at < FRESH_MS) return;
    state.weekInflight[wk] = true;
    api({ action: "week", week: wk, from: w0.toISOString(), to: addDays(w0, 7).toISOString() }).then(function (j) {
      state.weeks[wk] = { fetched: Date.now(), done: j.done || [], picked: j.picked || [], review: j.review || null, reviewsError: j.reviewsError || null };
      if (j.review) savedWeeks[wk] = Date.parse(j.review.saved) || Date.now();
      state.weekErr = null;
      saveWeeks();
    }).catch(function (err) {
      state.weekErr = { wk: wk, at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      delete state.weekInflight[wk];
      if (state.screen === "review" || state.screen === "bridge") render(true);
    });
  }
  function saveWeeks() {
    var keep = {};
    Object.keys(state.weeks).sort().slice(-6).forEach(function (k) { keep[k] = state.weeks[k]; });
    state.weeks = keep;
    lsSet(LS_WEEKS, keep);
    var sw = {};
    Object.keys(savedWeeks).sort().slice(-20).forEach(function (k) { sw[k] = savedWeeks[k]; });
    savedWeeks = sw;
    lsSet(LS_RSAVED, sw);
  }
  function drafts() { return lsGet(LS_RDRAFT) || {}; }
  /* Question 4 a line per bearing (2.41.1). Saved as one paragraph, "Bearing: words" on each line, blanks left out.
     Text before the first "Bearing:" line (written before 2.41.1, or freely in Notion) shows in its own EARLIER NOTES
     box above the lines and saves first (2.41.2), so the lines appear at once and nothing is lost. */
  function bearNames() { return bearings().slice(0, 12); }
  function bearSplit(text, names) {
    var out = names.map(function () { return ""; }), pre = [], cur = -1, keys = names.map(function (n) { return n.toLowerCase() + ":"; });
    String(text || "").split("\n").forEach(function (line) {
      var i = keys.indexOf((line.match(/^[^:]*:/) || [""])[0].toLowerCase());
      if (i > -1) { cur = i; out[i] = line.slice(names[i].length + 1).trim(); }
      else if (cur > -1) out[cur] += "\n" + line;
      else pre.push(line);
    });
    return { pre: pre.join("\n").trim(), parts: out.map(function (x) { return x.trim(); }) };
  }
  function bearJoin(names) {
    var pre = $("rv-bear-pre"), lines = names.map(function (n, i) { var el = $("rv-bear-" + i), t = el ? el.value.trim() : ""; return t ? n + ": " + t : ""; });
    return [pre ? pre.value.trim() : ""].concat(lines).filter(Boolean).join("\n");
  }
  function saveDraft(wk, field, value) {
    var d = drafts();
    d[wk] = d[wk] || {};
    d[wk][field] = value;
    var keep = {};
    Object.keys(d).sort().slice(-4).forEach(function (k) { keep[k] = d[k]; });
    lsSet(LS_RDRAFT, keep);
  }
  /* The numbers for one week, from the calendars (ignored events left out) and the bridge. */
  function weekStats(w0) {
    var now = new Date(), list = eventsFor(viewRange()), cur = sow(now).getTime() === w0.getTime();
    var hours = function (start, area) {
      var tot = 0;
      for (var i = 0; i < 7; i++) {
        var d = addDays(start, i);
        if (d > now) break;
        var timed = dayEvents(list, d).timed.filter(function (e) { return !area || e.area === area; });
        tot += unionHours(timed, d, 0, sameDay(d, now) ? posInDay(now, sod(now)) : 24);
      }
      return tot;
    };
    var st = { cur: cur, work: hours(w0, "work"), personal: hours(w0, "personal"), prevWork: hours(addDays(w0, -7), "work"), prevPersonal: hours(addDays(w0, -7), "personal") };
    if (hasFarm()) { st.farm = hours(w0, "farm"); st.prevFarm = hours(addDays(w0, -7), "farm"); }
    if (hasGrowth()) { st.hobby = hours(w0, "hobby"); st.prevHobby = hours(addDays(w0, -7), "hobby"); }
    var busiest = null, open = 0, meetings = 0;
    for (var i = 0; i < 7; i++) {
      var d = addDays(w0, i), timed = dayEvents(list, d).timed, tot = unionHours(timed, d, 0, 24);
      if (!busiest || tot > busiest.h) busiest = { d: d, h: tot };
      open += (FOCUS_END - FOCUS_START) - unionHours(timed, d, FOCUS_START, FOCUS_END);
      meetings += timed.filter(function (e) { return e.area === "work" && sod(e._s).getTime() === d.getTime(); }).length;
    }
    st.busiest = busiest; st.open = open; st.meetings = meetings;
    var w = state.weeks[ymd(w0)];
    if (w) {
      st.done = w.done.length;
      var by = {};
      w.done.forEach(function (t) { var k = t.area || ""; by[k] = (by[k] || 0) + 1; });
      st.byArea = Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); }).map(function (k) { return { area: k, n: by[k] }; });
      st.picked = w.picked.length;
      st.pickedDone = w.picked.filter(function (t) { return t.status === DONE; }).length;
    }
    return st;
  }
  /* "Week 41 · 05 to 11 Oct", the page title in Notion. */
  function reviewTitle(w0) {
    var w1 = addDays(w0, 6), m = function (d) { return MON[d.getMonth()].charAt(0) + MON[d.getMonth()].slice(1).toLowerCase(); };
    return "Week " + isoWeek(w0) + " · " + p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + m(w0) : "") + " to " + p2(w1.getDate()) + " " + m(w1);
  }
  function delta(a, b) { var d = Math.round((a - b) * 10) / 10; return d === 0 ? "±0" : (d > 0 ? "+" : "") + d; }
  function intents(w0) {
    var log = lsGet(LS_LOG) || {};
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = addDays(w0, i); return { d: d, text: log[ymd(d)] || "" }; });
  }

  function renderReview() {
    var w0 = sow(state.anchor), wk = ymd(w0), now = new Date(), r = viewRange(), loaded = hasData(r);
    if (w0 > now) { $("content").innerHTML = '<div class="rv">' + phead("NOT YET", "") + '<div class="empty">This week hasn\'t started. Tap the left arrow or TODAY.</div></div>'; return; }
    var st = weekStats(w0), w = state.weeks[wk], html = '<div class="rv">';

    /* time */
    html += "<section>" + phead("TIME", st.cur ? "SO FAR THIS WEEK" : "VS THE WEEK BEFORE");
    if (!loaded) html += '<div class="empty">' + (state.sync.status === "syncing" ? "Loading your calendars…" : "Calendar for this week isn't loaded yet.") + "</div>";
    else {
      var maxH = Math.max(10, st.work, st.personal, st.farm || 0);
      [["work", st.work, st.prevWork], ["personal", st.personal, st.prevPersonal]].concat(hasFarm() ? [["farm", st.farm, st.prevFarm]] : [], hasGrowth() ? [["hobby", st.hobby, st.prevHobby]] : []).forEach(function (x) {
        html += '<div class="rv-row a-' + x[0] + '"><span class="bn">' + AREAS[x[0]].name + '</span><span class="track"><span style="width:' + Math.round(x[1] / maxH * 100) + '%"></span></span>' +
          '<span class="bv tnum">' + hrsLabel(x[1]) + "</span>" + (st.cur ? "<span></span>" : '<span class="dl tnum">' + delta(x[1], x[2]) + "</span>") + "</div>";
      });
      STANDBY_AREAS.forEach(function (k) {
        html += '<div class="rv-row a-' + k + ' off"><span class="bn">' + AREAS[k].name + '</span><span class="muted">No calendar yet</span><span></span><span></span></div>';
      });
      html += '<div class="ov-facts tnum"><span>BUSIEST <b>' + (st.busiest && st.busiest.h ? DOW[st.busiest.d.getDay()] + " " + hrsLabel(st.busiest.h) : "NONE") + "</b></span><span>OPEN 07:00 TO 21:00 <b>" + hrsLabel(st.open) +
        " OF 98H</b></span><span>WORK EVENTS <b>" + st.meetings + "</b></span>" + (ignoreList.length ? "<span>IGNORED EVENTS LEFT OUT</span>" : "") + "</div>";
    }
    html += "</section>";

    /* output + priorities kept (bridge 1.5) */
    if (!canReviews()) {
      html += "<section>" + phead("OUTPUT", "") + stubBox(state.conn ? "Finished tasks, priorities kept and saving reviews need the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>." : "Link calendars first.") + "</section>";
    } else if (!w) {
      html += "<section>" + phead("OUTPUT", "") + '<div class="empty">' + (state.weekErr && state.weekErr.wk === wk ? esc(state.weekErr.msg) : "Loading the week from Notion…") + "</div></section>";
    } else {
      var maxN = Math.max(3, st.byArea.length ? st.byArea[0].n : 0);
      html += "<section>" + phead("OUTPUT", st.done + (st.done === 1 ? " TASK" : " TASKS") + " FINISHED");
      if (!st.done) html += '<div class="empty">No tasks marked done this week.</div>';
      st.byArea.forEach(function (x) {
        html += '<div class="rv-row a-' + taskArea(x.area) + '"><span class="bn">' + esc(bare(x.area) || "No area") + '</span><span class="track"><span style="width:' + Math.round(x.n / maxN * 100) + '%"></span></span><span class="bv tnum">' + x.n + "</span><span></span></div>";
      });
      if (st.done) html += '<div class="rv-list">' + w.done.slice(0, 12).map(function (t) { return '<span class="a-' + taskArea(t.area) + '">' + esc(t.title) + "</span>"; }).join("") +
        (w.done.length > 12 ? '<span class="muted">+' + (w.done.length - 12) + " more</span>" : "") + "</div>";
      html += "</section>";
      var slipped = w.picked.filter(function (t) { return t.status !== DONE; });
      html += "<section>" + phead("PRIORITIES KEPT", st.picked ? st.pickedDone + " OF " + st.picked + " · " + Math.round(st.pickedDone / st.picked * 100) + "%" : "");
      if (!st.picked) html += '<div class="empty">No priorities were picked this week.</div>';
      else html += '<div class="rv-kept"><span class="kn tnum">' + st.pickedDone + '<small>DONE</small></span><span class="kn tnum">' + slipped.length + '<small>NOT DONE</small></span><span class="kn tnum">' + st.picked + "<small>PICKED</small></span></div>";
      if (slipped.length) html += '<div class="ov-sub">STILL OPEN</div>' + slipped.map(function (t) {
        return '<div class="ov-due a-' + taskArea(t.area) + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" + [bare(t.status), bare(t.area), t.focus ? "PICKED FOR " + dLabel(parseYmd(t.focus)) : ""].filter(Boolean).map(esc).join(" · ") + "</small></span><span></span></div>";
      }).join("");
      html += "</section>";
    }

    html += habitsWeek(w0);
    html += tarotWeek(w0);

    /* intent log */
    var ins = intents(w0), written = ins.filter(function (x) { return x.text; }).length;
    html += "<section>" + phead("INTENT LOG", written + " OF 7 DAYS") + '<div class="rv-log">' + ins.map(function (x) {
      return '<span class="dt tnum">' + DOW[x.d.getDay()] + " " + p2(x.d.getDate()) + "</span><span" + (x.text ? "" : ' class="muted"') + ">" + (x.text ? esc(x.text) : "No entry") + "</span>";
    }).join("") + '</div><small class="muted">From the Captain\'s Log on the Bridge. Saving the review keeps these lines in Notion.</small></section>';

    /* next week */
    var n0 = addDays(w0, 7), today = ymd(now), tdata = canPlan() ? state.tasks[today] : null, nl = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(n0, i), h = unionHours(dayEvents(eventsFor(r), d).timed, d, 0, 24);
      if (h >= HEAVY_HOURS) nl.push(DOW[d.getDay()] + " " + hrsLabel(h));
    }
    var kds = canDates() && state.dates ? occurrences(ymd(n0), ymd(addDays(n0, 6))) : [];
    var due = tdata ? rankTasks(tdata.open.filter(function (t) { return t.due && t.due >= ymd(n0) && t.due <= ymd(addDays(n0, 6)); })) : [];
    html += "<section>" + phead("NEXT WEEK", weekLabel(n0).replace(/^WEEK \d+ · /, "")) +
      '<div class="ov-facts"><span>HEAVY DAYS <b>' + (nl.length ? nl.join(" · ") : "NONE") + "</b></span></div>";
    kds.forEach(function (o) { html += kdRow(o, today); });
    if (due.length) html += '<div class="ov-sub">DUE NEXT WEEK</div>' + due.slice(0, 6).map(function (t) {
      return '<div class="ov-due a-' + taskArea(t.area) + '"><span class="st"></span><span class="tx"><b>' + esc(t.title) + "</b><small>" + taskMeta(t, today) + "</small></span><span></span></div>";
    }).join("");
    if (!kds.length && !due.length) html += '<div class="empty">No key dates or due tasks next week.</div>';
    html += "</section>";

    /* reflection + save */
    var saved = w && w.review, draft = drafts()[wk] || {};
    html += "<section>" + phead("REFLECTION", "4 QUESTIONS · " + (saved ? "SAVED " + esc(stamp(Date.parse(saved.saved))) : "NOT SAVED YET"));
    REVIEW_FIELDS.forEach(function (f) {
      var v = draft[f[0]] !== undefined ? draft[f[0]] : saved ? saved[f[0]] || "" : "";
      var names = f[0] === "bearing" ? bearNames() : [], sp = names.length ? bearSplit(v, names) : null;
      if (sp) {   /* 2.41.1: a line per bearing (Timothy's Waymarkers), saved as one paragraph, "Bearing: words" a line */
        html += '<div class="rv-lab"><span class="ov-sub">' + f[1] + '</span></div><div class="rv-bears">' +
          (sp.pre ? '<div class="rv-bear pre"><label for="rv-bear-pre">EARLIER NOTES</label><textarea id="rv-bear-pre" data-rvb="pre" rows="2" maxlength="2000">' + esc(sp.pre) + "</textarea></div>" : "") +
          names.map(function (nm, ix) {
            return '<div class="rv-bear"><label for="rv-bear-' + ix + '">' + esc(nm) + '</label><textarea id="rv-bear-' + ix + '" data-rvb="' + ix + '" rows="1" maxlength="600" placeholder="Where it showed this week">' + esc(sp.parts[ix]) + "</textarea></div>";
          }).join("") + "</div>";
        return;
      }
      html += '<div class="rv-lab"><label class="ov-sub" for="rv-' + f[0] + '">' + f[1] + "</label>" + bulChip("rv-" + f[0]) + '</div><textarea id="rv-' + f[0] + '" data-rv="' + f[0] + '" rows="3" maxlength="2000" placeholder="' + esc(f[2]) + '">' + esc(v) + "</textarea>";
    });
    var bad = w && w.reviewsError, sumV = draft.summary !== undefined ? draft.summary : saved ? saved.summary || "" : "";
    html += '<div class="rv-lab"><label class="ov-sub" for="rv-summary">CLAUDE SUMMARY</label>' + bulChip("rv-summary") + '</div><textarea id="rv-summary" data-rv="summary" rows="5" maxlength="4000" placeholder="' +
      (canAsk() ? "Tap WRITE SUMMARY for a short summary of the week. Edit it as you like." : "Needs Ask Claude. You can also write your own.") + '">' + esc(sumV) + "</textarea>";
    html += '<div class="btnrow" style="margin-top:14px"><button type="button" class="btn ask" data-act="writesummary"' + (!canAsk() || state.summaryBusy || navigator.onLine === false ? " disabled" : "") + ">" +
      (state.summaryBusy ? "WRITING…" : "WRITE SUMMARY") + (canAsk() ? "<small>CLAUDE · ABOUT 5¢</small>" : "<small>SETUP</small>") + "</button>" +
      '<button type="button" class="btn capture" data-act="savereview"' + (!canReviews() || state.reviewSaving || navigator.onLine === false || bad ? " disabled" : "") + ">" +
      (state.reviewSaving ? "SAVING…" : navigator.onLine === false ? "OFFLINE" : saved ? "UPDATE IN NOTION" : "SAVE TO NOTION") + "</button>" +
      (saved && saved.url ? '<a class="btn ghost" href="' + esc(saved.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
    if (bad) html += '<div class="err">' + (bad === "notion_not_shared" ? "Weekly Reviews isn't connected to the TimothyOS integration. In Notion: 🧭 Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: bad }))) + "</div>";
    html += '<small class="muted">Your writing is kept on this iPad as you type, so nothing is lost before you save.</small></section></div>';
    $("content").innerHTML = html;
    loadWeek(w0, false);
    loadTasks(today, false);
    loadDates(false);
  }
  function submitReview() {
    var w0 = sow(state.anchor), wk = ymd(w0), st = weekStats(w0), d = drafts()[wk] || {}, w = state.weeks[wk], saved = w && w.review;
    var field = function (k) { if (k === "bearing" && $("rv-bear-0")) return bearJoin(bearNames()); var el = $("rv-" + k); return el ? el.value.trim() : (d[k] !== undefined ? d[k] : saved ? saved[k] || "" : ""); };
    var review = {
      week: wk,
      title: reviewTitle(w0),
      wentWell: field("wentWell"), drained: field("drained"), nextFocus: field("nextFocus"), bearing: field("bearing"), summary: field("summary"),
      intents: intents(w0).filter(function (x) { return x.text; }).map(function (x) { return DOW[x.d.getDay()] + " " + p2(x.d.getDate()) + " · " + x.text; }).join("\n"),
      hoursWork: hasData(viewRange()) ? Math.round(st.work * 10) / 10 : null,
      hoursPersonal: hasData(viewRange()) ? Math.round(st.personal * 10) / 10 : null,
      hoursFarm: hasFarm() && hasData(viewRange()) ? Math.round(st.farm * 10) / 10 : null, hoursHobbies: hasGrowth() && hasData(viewRange()) ? Math.round(st.hobby * 10) / 10 : null,
      tasksDone: w ? st.done : null, picked: w ? st.picked : null, pickedDone: w ? st.pickedDone : null,
      byArea: w ? st.byArea.map(function (x) { return (bare(x.area) || "No area") + " " + x.n; }).join(" · ") : ""
    };
    state.reviewSaving = true;
    render(true);
    apiPost({ action: "savereview", review: review }).then(function (j) {
      state.weeks[wk] = state.weeks[wk] || { fetched: 0, done: [], picked: [], review: null };
      state.weeks[wk].review = j.review;
      savedWeeks[wk] = Date.now();
      if (state.rlog) {
        state.rlog.reviews = state.rlog.reviews.filter(function (r) { return r.week !== wk; }).concat([j.review]).sort(function (a, b) { return a.week < b.week ? 1 : -1; });
        lsSet(LS_RLOG, state.rlog);
      }
      var all = drafts(); delete all[wk]; lsSet(LS_RDRAFT, all);
      saveWeeks();
      toast(j.created ? "Review saved to Notion" : "Review updated in Notion");
    }).catch(function (err) {
      toast("Not saved: " + describeTasks(err) + " Your writing is kept on this iPad.");
    }).then(function () {
      state.reviewSaving = false;
      render(true);
    });
  }

  /* ---------- Review log (landing page) ---------- */
  /* REVIEW opens here: what's due, trends from saved reviews, and every week by
     month. Tapping a week opens it on the Review screen above; ALL REVIEWS comes
     back. The numbers are the ones stored with each saved review (bridge 1.7). */
  var RLOG_FRESH_MS = 2 * 60 * 1000;
  function canReviewLog() { return state.caps.indexOf("reviewlog") > -1; }
  function loadReviewLog(force) {
    if (!state.conn || !canReviewLog() || state.rlogInflight) return;
    if (!force && state.rlog && Date.now() - state.rlog.fetched < RLOG_FRESH_MS) return;
    if (!force && state.rlogErr && Date.now() - state.rlogErr.at < FRESH_MS) return;
    state.rlogInflight = true;
    api({ action: "reviews", limit: 60 }).then(function (j) {
      state.rlog = { fetched: Date.now(), reviews: j.reviews || [] };
      state.rlog.reviews.forEach(function (r) { savedWeeks[r.week] = Date.parse(r.saved) || Date.now(); });
      state.rlogErr = null;
      lsSet(LS_RLOG, state.rlog);
      saveWeeks();
    }).catch(function (err) {
      state.rlogErr = { at: Date.now(), code: err.code, msg: describeTasks(err) };
    }).then(function () {
      state.rlogInflight = false;
      if (state.screen === "review" && state.rvLog) render(true);
    });
  }
  /* Saved reviews by week; a week fetched or saved on the Review screen wins, being newer. */
  function reviewMap() {
    var m = {};
    ((state.rlog && state.rlog.reviews) || []).forEach(function (r) { m[r.week] = r; });
    Object.keys(state.weeks).forEach(function (k) { if (state.weeks[k].review) m[k] = state.weeks[k].review; });
    return m;
  }
  /* Every week from this one back to the first saved review (at least last week), newest first. */
  function logWeeks(now) {
    var cur = sow(now), map = reviewMap(), keys = Object.keys(map).concat(Object.keys(savedWeeks)).sort();
    var first = keys.length ? sow(parseYmd(keys[0])) : cur, due = reviewDue(now), dueK = due ? ymd(due) : "";
    if (first > addDays(cur, -7)) first = addDays(cur, -7);
    var out = [];
    for (var w = cur, i = 0; w >= first && i < 104; w = addDays(w, -7), i++) {
      var k = ymd(w), r = map[k] || null;
      out.push({ w0: w, wk: k, r: r, status: r || savedWeeks[k] ? "saved" : k === dueK ? "due" : k === ymd(cur) ? "cur" : "missed" });
    }
    return out;
  }
  function rlPill(st) {
    return { cur: '<span class="pill inprog">IN PROGRESS</span>', due: '<span class="pill warn">DUE</span>', saved: '<span class="pill ok">SAVED</span>', missed: '<span class="pill">NOT SAVED</span>' }[st];
  }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function hasDraft(wk) { var d = drafts()[wk]; return !!d && Object.keys(d).some(function (k) { return String(d[k] || "").trim(); }); }

  /* Charts: SVG drawn at about the screen's pixel width so labels stay at label size. Tap or hover a week for its values. */
  function chartWidth(half) {
    var c = $("content"), w = Math.max(280, Math.min(980, (c ? c.clientWidth : 900) - 34));
    return half && w > 640 ? Math.floor((w - 36) / 2) : w;
  }
  function svgOpen(vw, vh, label) { return '<svg class="rl-svg" viewBox="0 0 ' + vw + " " + vh + '" role="img" aria-label="' + label + '">'; }
  function gridLine(x1, x2, y, label) { return '<line class="g" x1="' + x1 + '" x2="' + x2 + '" y1="' + y + '" y2="' + y + '"/><text x="' + (x1 - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + label + "</text>"; }
  function hitRect(x, y, w, h, title, line) { return '<rect class="hit" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" data-tip="' + esc(title + "|" + line) + '"/>'; }
  function wkNo(x) { return isoWeek(x.w0); }
  function hoursChart(weeks) {
    var VW = chartWidth(false), VH = 210, L = 40, R = 8, T = 22, B = 28, n = weeks.length, cw = (VW - L - R) / n, bw = Math.max(8, Math.min(40, cw - 12));
    var top = 10;
    weeks.forEach(function (x) { if (x.r && num(x.r.hoursWork)) top = Math.max(top, x.r.hoursWork + (x.r.hoursPersonal || 0) + (x.r.hoursFarm || 0)); });
    top = Math.ceil(top / 10) * 10;
    var y = function (v) { return T + (VH - T - B) * (1 - v / top); }, best = null;
    var s = svgOpen(VW, VH, "Hours per week, Work and Personal") + gridLine(L, VW - R, y(0), "0") + gridLine(L, VW - R, y(top / 2), top / 2) + gridLine(L, VW - R, y(top), top);
    weeks.forEach(function (x, i) {
      var bx = L + i * cw + (cw - bw) / 2, r = x.r, lab = '<text x="' + (bx + bw / 2) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!r || !num(r.hoursWork)) {
        s += '<rect class="gap" x="' + bx + '" y="' + T + '" width="' + bw + '" height="' + (y(0) - T) + '" rx="4"/>' + lab +
          hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), x.status === "cur" ? "In progress" : x.status === "due" ? "Not saved yet" : r ? "Saved without hours" : "Not saved");
        return;
      }
      var wv = r.hoursWork, pv = r.hoursPersonal || 0, fv = r.hoursFarm || 0, yw = y(wv), yp = y(wv + pv), yf = y(wv + pv + fv);
      s += '<rect class="b-work" x="' + bx + '" y="' + yw + '" width="' + bw + '" height="' + Math.max(0, y(0) - yw) + '"' + (pv || fv ? "" : ' rx="4"') + "/>";
      if (pv) s += '<rect class="b-personal" x="' + bx + '" y="' + yp + '" width="' + bw + '" height="' + Math.max(0, yw - yp - 2) + '"' + (fv ? "" : ' rx="4"') + "/>";
      if (fv) s += '<rect class="b-farm" x="' + bx + '" y="' + yf + '" width="' + bw + '" height="' + Math.max(0, yp - yf - 2) + '" rx="4"/>';
      best = { x: bx + bw / 2, y: yf, v: wv + pv + fv };
      s += lab + hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), "Work " + hrsLabel(wv).toLowerCase() + " · Personal " + hrsLabel(pv).toLowerCase() + (fv ? " · " + areaName("farm") + " " + hrsLabel(fv).toLowerCase() : "") + " · " + hrsLabel(wv + pv + fv).toLowerCase() + " total");
    });
    if (best) s += '<text class="v" x="' + best.x + '" y="' + (best.y - 6) + '" text-anchor="middle">' + hrsLabel(best.v) + "</text>";
    return s + "</svg>";
  }
  function keptChart(weeks) {
    var VW = chartWidth(true), VH = 190, L = 44, R = 10, T = 16, B = 28, n = weeks.length, cw = (VW - L - R) / n;
    var y = function (v) { return T + (VH - T - B) * (1 - v / 100); }, xp = function (i) { return L + i * cw + cw / 2; };
    var s = svgOpen(VW, VH, "Priorities kept, percent per week") + gridLine(L, VW - R, y(0), "0%") + gridLine(L, VW - R, y(50), "50%") + gridLine(L, VW - R, y(100), "100%");
    var seg = [], segs = [], dots = "";
    weeks.forEach(function (x, i) {
      var r = x.r, ok = r && num(r.picked) && r.picked > 0 && num(r.pickedDone);
      s += '<text x="' + xp(i) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!ok) { if (seg.length) { segs.push(seg); seg = []; } return; }
      var pc = Math.round(r.pickedDone / r.picked * 100);
      seg.push([xp(i), y(pc)]);
      dots += '<circle class="dot" cx="' + xp(i) + '" cy="' + y(pc) + '" r="4.5"/>' + hitRect(xp(i) - cw / 2, T, cw, VH - T - B, "WEEK " + wkNo(x), r.pickedDone + " of " + r.picked + " kept · " + pc + "%");
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (sg) { s += '<polyline class="ln" points="' + sg.map(function (p) { return p.join(","); }).join(" ") + '"/>'; });
    return s + dots + "</svg>";
  }
  function doneChart(weeks) {
    var VW = chartWidth(true), VH = 190, L = 36, R = 10, T = 16, B = 28, n = weeks.length, cw = (VW - L - R) / n, bw = Math.max(6, Math.min(22, cw - 10)), top = 5;
    weeks.forEach(function (x) { if (x.r && num(x.r.tasksDone)) top = Math.max(top, x.r.tasksDone); });
    top = Math.ceil(top / 5) * 5;
    var y = function (v) { return T + (VH - T - B) * (1 - v / top); };
    var s = svgOpen(VW, VH, "Tasks finished per week") + gridLine(L, VW - R, y(0), "0") + gridLine(L, VW - R, y(top), top);
    weeks.forEach(function (x, i) {
      var bx = L + i * cw + (cw - bw) / 2, r = x.r;
      s += '<text x="' + (bx + bw / 2) + '" y="' + (VH - 8) + '" text-anchor="middle">' + wkNo(x) + "</text>";
      if (!r || !num(r.tasksDone)) return;
      s += '<rect class="b-done" x="' + bx + '" y="' + y(r.tasksDone) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(r.tasksDone)) + '" rx="' + (r.tasksDone ? 4 : 0) + '"/>' +
        hitRect(L + i * cw, T, cw, VH - T - B, "WEEK " + wkNo(x), r.tasksDone + (r.tasksDone === 1 ? " task" : " tasks") + " finished");
    });
    return s + "</svg>";
  }
  /* "Area 3 · Other area 1" (stored with each review) summed over the weeks. */
  function areaTotals(weeks) {
    var by = {};
    weeks.forEach(function (x) {
      String((x.r && x.r.byArea) || "").split(" · ").forEach(function (part) {
        var m = /^(.*\S)\s+(\d+)$/.exec(part.trim());
        if (m) by[m[1]] = (by[m[1]] || 0) + (+m[2]);
      });
    });
    return Object.keys(by).sort(function (a, b) { return by[b] - by[a] || a.localeCompare(b); }).slice(0, 8).map(function (k) { return { area: k, n: by[k] }; });
  }
  var rlTip = null;
  function showTip(el) {
    hideTip();
    var parts = (el.getAttribute("data-tip") || "").split("|"), box = el.closest(".rl-chart");
    if (!box) return;
    var r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    rlTip = document.createElement("div");
    rlTip.className = "rl-tip";
    rlTip.innerHTML = "<b>" + esc(parts[0]) + "</b><br>" + esc(parts[1] || "");
    rlTip.style.left = Math.max(80, Math.min(b.width - 80, r.left - b.left + r.width / 2)) + "px";
    rlTip.style.top = (r.top - b.top + 8) + "px";
    box.appendChild(rlTip);
  }
  function hideTip() { if (rlTip) { rlTip.remove(); rlTip = null; } }

  function renderReviewLog() {
    hideTip();
    var now = new Date(), cur = sow(now), all = logWeeks(now), due = reviewDue(now), html = '<div class="rv">';
    var stillDue = due && !reviewSaved(ymd(due));

    /* up next */
    var card = function (w0, kind) {
      var wk = ymd(w0), w = state.weeks[wk], sub;
      if (kind === "due") sub = "Due now. Not saved yet · about 5 minutes" + (hasDraft(wk) ? " · draft started" : "");
      else if (kind === "saved") sub = "Saved · tap to read or update";
      else sub = "In progress" + (w ? " · " + w.done.length + " finished so far" : "") + " · due Sunday" + (hasDraft(wk) ? " · draft started" : "");
      return '<button type="button" class="rl-card ' + kind + '" data-rweek="' + wk + '"><span class="st"></span><span class="tx"><b>' + weekLabel(w0) + "</b><small>" + sub + "</small></span>" +
        (kind === "due" ? '<span class="pill warn">REVIEW NOW</span>' : rlPill(kind)) + "</button>";
    };
    html += "<section>" + phead("UP NEXT", "DUE SUNDAY 14:00 TO TUESDAY NIGHT") + '<div class="rl-up">' +
      (stillDue ? card(due, "due") : "") + (stillDue && ymd(due) === ymd(cur) ? "" : card(cur, reviewSaved(ymd(cur)) ? "saved" : "cur")) + "</div>";
    if (!canReviews()) html += stubBox(state.conn ? "Saving reviews needs the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>." : "Link calendars first.");
    html += "</section>";

    /* trends */
    var win = all.slice(0, 12).reverse(), savedW = win.filter(function (x) { return x.r; });
    var meta = "LAST " + win.length + (win.length === 1 ? " WEEK" : " WEEKS");
    if (!canReviews()) { /* nothing to show yet */ }
    else if (!canReviewLog()) html += "<section>" + phead("TRENDS", "", "chrome-a") + stubBox("Trends and the full list of reviews need the Google bridge updated. Steps are in the README under <b>Updating the Google bridge</b>.") + "</section>";
    else if (state.rlogErr && !state.rlog) html += "<section>" + phead("TRENDS", "", "chrome-a") + '<div class="err">' + rlogErrText() + "</div></section>";
    else if (!state.rlog) html += "<section>" + phead("TRENDS", "", "chrome-a") + '<div class="empty">Loading your saved reviews from Notion…</div></section>';
    else if (!savedW.length) html += "<section>" + phead("TRENDS", meta, "chrome-a") + '<div class="empty">Trends appear here once you\'ve saved a review.</div></section>';
    else {
      var eligible = win.filter(function (x) { return x.r || x.status === "missed"; }).length, streak = 0;
      for (var i = 0; i < all.length; i++) {
        if (all[i].status === "saved") streak++;
        else if (all[i].status === "missed") break;
      }
      var avg = function (list, f) { return list.length ? list.reduce(function (s, x) { return s + f(x); }, 0) / list.length : null; };
      var kept = savedW.filter(function (x) { return num(x.r.picked) && x.r.picked > 0 && num(x.r.pickedDone); });
      var hrs = savedW.filter(function (x) { return num(x.r.hoursWork); });
      var kAvg = avg(kept, function (x) { return x.r.pickedDone / x.r.picked; }), wAvg = avg(hrs, function (x) { return x.r.hoursWork; }), pAvg = avg(hrs, function (x) { return x.r.hoursPersonal || 0; });
      var areas = areaTotals(win);
      html += pnl("rtrends", phead("TRENDS", meta + " · FROM SAVED REVIEWS", "chrome-a", moreBtn("rtrends", "trends")) +
        '<div class="rl-stats">' +
        '<div class="rl-stat"><b class="tnum">' + savedW.length + "/" + Math.max(eligible, savedW.length) + '</b><span>REVIEWS SAVED</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + streak + '</b><span>WEEK STREAK</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + (kAvg === null ? "NONE" : Math.round(kAvg * 100) + "%") + '</b><span>PRIORITIES KEPT, AVG</span></div>' +
        '<div class="rl-stat"><b class="tnum">' + (wAvg === null ? "NONE" : Math.round(wAvg) + "H · " + Math.round(pAvg) + "H") + '</b><span>WORK · PERSONAL, AVG</span></div></div>' +
        '<div class="rl-charts">' +
        '<div class="rl-chart wide"><h3>HOURS PER WEEK</h3><div class="sub">Calendar time, ignored events left out. Week numbers along the bottom.</div>' + hoursChart(win) +
        '<div class="rl-legend"><span><i class="a-work"></i>WORK</span><span><i class="a-personal"></i>PERSONAL</span>' + (win.some(function (x) { return x.r && x.r.hoursFarm; }) ? '<span><i class="a-farm"></i>' + AREAS.farm.name + "</span>" : "") + '<span><i class="gap"></i>NOT SAVED</span></div></div>' +
        habitsTrend(win) +
        '<div class="rl-chart ov-extra"><h3>PRIORITIES KEPT</h3><div class="sub">Share of the week\'s picks marked done.</div>' + keptChart(win) + "</div>" +
        '<div class="rl-chart ov-extra"><h3>TASKS FINISHED</h3><div class="sub">Marked done in the Master Task List.</div>' + doneChart(win) + "</div>" +
        '<div class="rl-chart wide ov-extra"><h3>WHERE THE WORK WENT</h3><div class="sub">Tasks finished by Life Area, ' + meta.toLowerCase().replace("last ", "") + ".</div>" +
        (areas.length ? '<div class="rl-areas">' + areas.map(function (a) {
          return '<div class="rl-arow"><span class="bn">' + esc(a.area) + '</span><span class="track"><span style="width:' + Math.round(a.n / areas[0].n * 100) + '%"></span></span><span class="v tnum">' + a.n + "</span></div>";
        }).join("") + "</div>" : '<div class="empty">No finished tasks in these reviews.</div>') + "</div></div>" +
        patternsBox(all) + (state.rlogErr ? stale(state.rlog.fetched) : ""));
    }

    /* all reviews */
    html += "<section>" + phead("ALL REVIEWS", "TAP A WEEK");
    var lastM = "";
    all.forEach(function (x) {
      var end = addDays(x.w0, 6), m = MONL[end.getMonth()] + " " + end.getFullYear(), r = x.r;
      if (m !== lastM) { html += (lastM ? "</div>" : "") + '<div class="rl-month"><div class="rl-mlabel">' + m + "</div>"; lastM = m; }
      var bits = [];
      if (r) {
        if (num(r.hoursWork)) bits.push("WORK <b>" + hrsLabel(r.hoursWork) + "</b>");
        if (num(r.hoursPersonal)) bits.push("PERSONAL <b>" + hrsLabel(r.hoursPersonal) + "</b>");
        if (num(r.tasksDone)) bits.push("<b>" + r.tasksDone + "</b> FINISHED");
        if (num(r.picked) && r.picked > 0) bits.push("<b>" + (r.pickedDone || 0) + "/" + r.picked + "</b> PICKS KEPT");
      }
      var nums = bits.length ? bits.join(" · ") : x.status === "saved" ? "Saved" : x.status === "missed" ? "No review saved" : x.status === "due" ? "Ready to review" : "Week in progress";
      var focus = r && (r.nextFocus || r.wentWell), snip = focus ? "<em>" + (r.nextFocus ? "NEXT FOCUS" : "WENT WELL") + "</em> " + esc(focus.split("\n")[0])
        : hasDraft(x.wk) ? "<em>DRAFT</em> Started on this iPad" : x.status === "missed" ? "<em>NOTE</em> You can still write it" : "";
      html += '<button type="button" class="rl-row ' + x.status + '" data-rweek="' + x.wk + '"><span class="st"></span><span class="rlw"><b>WEEK ' + wkNo(x) + "</b><small>" + weekLabel(x.w0).replace(/^WEEK \d+ · /, "") + "</small></span>" +
        '<span class="tx"><span class="nums tnum">' + nums + "</span>" + (snip ? '<span class="snip">' + snip + "</span>" : "") + '</span><span class="end">' + rlPill(x.status) + '<span class="tri r"></span></span></button>';
    });
    html += "</div></section></div>";
    $("content").innerHTML = html;
    loadReviewLog(false);
    if (due && canReviews() && !reviewSaved(ymd(due))) loadWeek(due, false);
    loadWeek(cur, false);
  }
  function rlogErrText() {
    var e = state.rlogErr;
    return e.code === "notion_not_shared" ? "Weekly Reviews isn't connected to the TimothyOS integration. In Notion: Weekly Reviews → ••• → Connections → add TimothyOS bridge." : esc(e.msg);
  }

  /* Patterns: Claude reads the saved reflections (Sonnet, no tools). Kept on this iPad until you ask again. */
  function patternSource(all) {
    return all.filter(function (x) { return x.r && (x.r.wentWell || x.r.drained || x.r.nextFocus || x.r.bearing); }).slice(0, 26);
  }
  function patternsBox(all) {
    var src = patternSource(all), p = lsGet(LS_RPAT), enough = src.length >= 2;
    var btn = '<button type="button" class="btn ask" data-act="patterns"' + (!canAsk() || !enough || state.patternsBusy || navigator.onLine === false ? " disabled" : "") + ">" +
      (state.patternsBusy ? "READING…" : p ? "FIND AGAIN" : "FIND PATTERNS") + "<small>" + (canAsk() ? "SONNET · ABOUT 8¢" : "SETUP") + "</small></button>";
    var html = '<div class="rl-pat"><span class="st"></span><span class="tx"><b>PATTERNS ACROSS YOUR REVIEWS</b><small>' +
      (!enough ? "Needs two saved reviews with writing." : "Claude reads your " + src.length + " saved reflections and names what keeps coming up.") + "</small></span>" + btn + "</div>";
    if (p && p.text) {
      var lines = p.text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      html += '<div class="rl-patout"><div class="ov-sub">FROM ' + p.n + " REVIEWS · " + esc(stamp(p.at)) + " · " + money(p.cost || 0) + "</div><ul>" +
        lines.map(function (l) { return "<li>" + esc(l.replace(/^[-*•]\s*/, "")) + "</li>"; }).join("") + "</ul></div>";
    }
    return html;
  }
  function findPatterns() {
    var src = patternSource(logWeeks(new Date()));
    if (src.length < 2 || !canAsk()) return;
    var ctx = src.map(function (x) {
      var r = x.r, n = [];
      if (num(r.hoursWork)) n.push("Work " + r.hoursWork + "h, Personal " + (r.hoursPersonal || 0) + "h");
      if (num(r.tasksDone)) n.push(r.tasksDone + " tasks finished");
      if (num(r.picked) && r.picked) n.push((r.pickedDone || 0) + " of " + r.picked + " priorities kept");
      return weekLabel(x.w0) + (n.length ? " (" + n.join(", ") + ")" : "") +
        "\nWhat went well: " + (r.wentWell || "(blank)") + "\nWhat drained me: " + (r.drained || "(blank)") +
        "\nNext focus: " + (r.nextFocus || "(blank)") + "\nWhere I held my bearing: " + (r.bearing || "(blank)");
    }).join("\n\n");
    state.patternsBusy = true;
    render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "patterns", messages: [{ role: "user", text: "What patterns do you see across my weekly reviews?" }], context: "SAVED WEEKLY REVIEWS, NEWEST FIRST\n\n" + ctx, ignore: ignoreList, breaks: breakList }, 150000).then(function (j) {
      lsSet(LS_RPAT, { at: Date.now(), text: j.reply, cost: j.cost, n: src.length });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Patterns found (" + money(j.cost) + ")");
    }).catch(function (err) { toast(describeAi(err)); }).then(function () { state.patternsBusy = false; render(true); });
  }

  /* --- Systems: Bridge settings --- */
  function bridgeSection() {
    var pl = place(), start = lsGet(LS_START) || "bridge";
    return "<section>" + phead("BRIDGE", "SAVED ON THIS IPAD") + '<dl class="kv">' +
      '<dt>OPENS ON</dt><dd><div class="chips">' + [["bridge", "BRIDGE"], ["today", "TODAY"]].map(function (o) {
        return '<button type="button" class="chip" data-start="' + o[0] + '" aria-pressed="' + (start === o[0]) + '">' + o[1] + "</button>";
      }).join("") + "</div></dd>" +
      "<dt>LOCATION</dt><dd>" + (pl ? '<span class="tnum">' + esc(placeKey(pl)) + "</span>" + (pl.name ? " · " + esc(pl.name) : "") : '<span class="muted">Not set. Weather, hive check and frost watch stay off.</span>') +
      '<div class="ov-place"><input type="text" id="placeIn" placeholder="Latitude, longitude (e.g. 44.98, -93.27)" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn" data-act="placesave">SAVE</button><button type="button" class="btn ghost" data-act="geo">USE THIS IPAD\'S LOCATION</button>' +
      (pl ? '<button type="button" class="btn ghost" data-act="placeclear">CLEAR</button>' : "") + "</div>" +
      '<small class="muted">Rounded to about 1 km. Weather requests send only these numbers to Open-Meteo.</small></dd>' +
      '<dt>BEARINGS</dt><dd><textarea id="bearIn" rows="5" placeholder="One per line. The Bridge shows one each day.">' + esc(bearings().join("\n")) + "</textarea>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="bearsave">SAVE BEARINGS</button></div></dd>' +
      '</dl><div class="err" id="bridgeErr" role="alert"></div></section>';
  }
  function setPlace(lat, lon, name) {
    lat = Math.round(lat * 100) / 100; lon = Math.round(lon * 100) / 100;
    lsSet(LS_PLACE, { lat: lat, lon: lon, name: name || "" });
    state.wx = null; state.wxErr = null; lsDel(LS_WX);
    toast("Location saved. Weather loads on the Bridge.");
    render(true);
    loadWeather(true);
  }
  function bridgeAct(act) {
    var err = $("bridgeErr");
    if (act === "placesave") {
      var m = ($("placeIn").value || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { err.textContent = "Type latitude and longitude as two numbers, like 44.98, -93.27."; return; }
      setPlace(+m[1], +m[2]);
    } else if (act === "geo") {
      if (!navigator.geolocation) { err.textContent = "This browser can't share its location. Type the numbers instead."; return; }
      err.textContent = "";
      toast("Asking for location…");
      navigator.geolocation.getCurrentPosition(function (pos) { setPlace(pos.coords.latitude, pos.coords.longitude); },
        function () { var e2 = $("bridgeErr"); if (e2) e2.textContent = "Location wasn't shared. Allow it in Settings, or type the numbers instead."; },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    } else if (act === "placeclear") {
      lsDel(LS_PLACE); lsDel(LS_WX); state.wx = null;
      toast("Location cleared. Weather is off.");
      render(true);
    } else if (act === "bearsave") {
      var list = $("bearIn").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
      if (list.length) lsSet(LS_BEARINGS, list); else lsDel(LS_BEARINGS);
      toast(list.length ? list.length + (list.length === 1 ? " bearing saved" : " bearings saved") : "Bearings cleared");
      render(true);
    }
  }

