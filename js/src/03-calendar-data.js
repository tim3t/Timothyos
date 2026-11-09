  /* ---------- Ranges + events ---------- */
  function viewRange() {
    var a = state.anchor;
    if (state.screen === "bridge") return bridgeRange();
    if (state.screen === "loom") return lmRange();
    if (state.screen === "review") { var rw = state.rvLog ? sow(new Date()) : sow(a); return { from: addDays(rw, -7), to: addDays(rw, 14) }; }
    if (state.screen === "month") { var g = sow(som(a)); return { from: g, to: addDays(g, 42) }; }
    var w = sow(a);
    return { from: w, to: addDays(w, 7) };
  }
  function rkey(r) { return r.from.getTime() + "_" + r.to.getTime(); }
  function eventsFor(r) { return cachedEventsFor(r).filter(function (ev) { return asBreak(ev) || !ignored(ev); }).concat(pendingEvents()); }
  /* ---------- Breaks (2.23) ---------- */
  /* Protected time booked on a calendar, like lunch held as an Out of Office on the Work calendar.
     A timed event whose title contains a word on this list is always shown, even if it also matches
     an ignored title, as its own "break" area: never Work hours, meetings, BALANCE or Review hours.
     The "Out of office —" prefix is dropped from its label. The list stays on this iPad. */
  var LS_BREAKS = "tos.breaks.v1";
  var breakList = lsGet(LS_BREAKS) || ["Lunch"];
  /* 2.31.1: the whole title must be the break word (case, spacing and end punctuation aside), after an
     "Out of office —" / "OOO -" prefix; "Team Lunch" is a meeting, not a break. */
  var OOO_PREFIX = /^\s*(out of office|ooo)\s*[-–—:·|]\s*/i;
  function breakKey(t) { return norm1(String(t || "").replace(OOO_PREFIX, "")).replace(/\s+/g, " ").replace(/[\s.!:;,]+$/, ""); }
  function breakWord(title) { var t = breakKey(title); return breakList.filter(function (w) { return breakKey(w) && t === breakKey(w); })[0] || ""; }
  /* Sets the event's area and label for the current list (kept reversible: srcArea, srcTitle). */
  function asBreak(ev) {
    if (ev.pending) return false;
    if (!ev.srcArea) { ev.srcArea = ev.area; ev.srcTitle = ev.title; }
    var w = !ev.allDay && breakWord(ev.srcTitle);
    ev.area = w ? "break" : ev.srcArea;
    ev.title = w ? ev.srcTitle.replace(OOO_PREFIX, "") || ev.srcTitle : ev.srcTitle;
    ev.breakWord = w || "";
    return !!w;
  }
  function setBreaks(list) {
    var seen = {};
    breakList = list.map(function (x) { return String(x).trim(); }).filter(function (x) { var k = norm1(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
    lsSet(LS_BREAKS, breakList);
  }
  /* ---------- Ignored events ---------- */
  /* Some events exist only to stop others booking time (for example an all-weekend
     "out of office" block on the work calendar). Any event whose title contains a
     phrase on this list is left out of every view, count, clash and total.
     The list stays on this iPad; the calendars themselves are untouched. */
  var ignoreList = lsGet(LS_IGNORE) || [];
  function ignored(ev) {
    if (!ignoreList.length || ev.pending) return false;
    var t = norm1(ev.title);
    return ignoreList.some(function (p) { return t.indexOf(norm1(p)) > -1; });
  }
  function setIgnore(list) {
    var seen = {};
    ignoreList = list.map(function (s) { return String(s).trim(); }).filter(function (s) {
      var k = norm1(s);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    }).slice(0, 30);
    if (ignoreList.length) lsSet(LS_IGNORE, ignoreList); else lsDel(LS_IGNORE);
  }
  function ignoredCount() {
    var seen = {};
    Object.keys(state.ranges).forEach(function (k) { state.ranges[k].events.forEach(function (ev) { if (ignored(ev)) seen[ev.id] = 1; }); });
    return Object.keys(seen).length;
  }
  function cachedEventsFor(r) {
    var exact = state.ranges[rkey(r)];
    if (exact) return exact.events;
    var seen = {}, out = [], f = r.from.getTime(), t = r.to.getTime();
    Object.keys(state.ranges).forEach(function (k) {
      var e = state.ranges[k];
      if (e.to > f && e.from < t) e.events.forEach(function (ev) { if (!seen[ev.id]) { seen[ev.id] = 1; out.push(ev); } });
    });
    return out;
  }
  function hasData(r) {
    var f = r.from.getTime(), t = r.to.getTime();
    return Object.keys(state.ranges).some(function (k) { var e = state.ranges[k]; return e.from <= f && e.to >= t; });
  }
  function norm(ev) {
    if (!ev.allDay && !(ev._s instanceof Date)) { ev._s = new Date(ev.start); ev._e = new Date(ev.end); }
    return ev;
  }
  function areaRank(a) { return LIVE.indexOf(a); }
  function dayEvents(list, day) {
    var d0 = sod(day), d1 = addDays(d0, 1), key = ymd(d0), timed = [], allDay = [];
    list.forEach(function (ev) {
      norm(ev);
      if (ev.allDay) { if (ev.start <= key && key < ev.end) allDay.push(ev); }
      else if (ev._s < d1 && ev._e > d0) timed.push(ev);
    });
    timed.sort(function (a, b) { return a._s - b._s || b._e - a._e; });
    allDay.sort(function (a, b) { return areaRank(a.area) - areaRank(b.area); });
    return { timed: timed, allDay: allDay };
  }
  /* Every hour is shown. Focus hours (07-21) are twice as tall as the rest. */
  var FOCUS_START = 7, FOCUS_END = 21, QUIET_RATIO = 0.5;
  function isFocus(h) { return h >= FOCUS_START && h < FOCUS_END; }
  function makeScale(full) {
    var slim = full * QUIET_RATIO;
    function y(h) {
      h = Math.max(0, Math.min(24, h));
      if (h <= FOCUS_START) return h * slim;
      if (h <= FOCUS_END) return FOCUS_START * slim + (h - FOCUS_START) * full;
      return FOCUS_START * slim + (FOCUS_END - FOCUS_START) * full + (h - FOCUS_END) * slim;
    }
    function hourAt(px) {
      var a = FOCUS_START * slim, b = a + (FOCUS_END - FOCUS_START) * full;
      if (px <= a) return px / slim;
      if (px <= b) return FOCUS_START + (px - a) / full;
      return Math.min(24, FOCUS_END + (px - b) / slim);
    }
    return { y: y, total: y(24), hourAt: hourAt };
  }
  /* Faint shading behind the quieter hours. */
  function quietBands(sc, cls) {
    var top = sc.y(FOCUS_START), late = sc.y(FOCUS_END);
    return '<div class="' + cls + '" style="top:0;height:' + top + 'px"></div>' +
      '<div class="' + cls + '" style="top:' + late + "px;height:" + (sc.total - late) + 'px"></div>';
  }
  /* Side-by-side columns for overlapping events, worked out in pixels so
     short events in the compressed bands still get their own column. */
  function layout(timed, day, sc, minPx) {
    var d0 = sod(day);
    var rows = timed.map(function (ev) {
      var s = posInDay(ev._s, d0), e = posInDay(ev._e, d0), ys = sc.y(s), ye = sc.y(e);
      return { ev: ev, s: s, e: e, ys: ys, ye: ye, vye: Math.max(ye, ys + minPx) };
    });
    var clusters = [], cur = [], end = -1;
    rows.forEach(function (r) {
      if (cur.length && r.ys >= end) { clusters.push(cur); cur = []; end = -1; }
      cur.push(r);
      end = Math.max(end, r.vye);
    });
    if (cur.length) clusters.push(cur);
    clusters.forEach(function (cl) {
      var cols = [];
      cl.forEach(function (r) {
        var c = 0;
        while (cols[c] !== undefined && cols[c] > r.ys) c++;
        cols[c] = r.vye;
        r.col = c;
      });
      cl.forEach(function (r) { r.n = cols.length; });
    });
    return rows;
  }
  /* ---------- Calendar visibility ---------- */
  function visible(list) { return list.filter(function (ev) { return !state.hidden[ev.area]; }); }
  function hiddenNote() {
    var off = LIVE.filter(function (k) { return state.hidden[k]; });
    return off.length ? off.map(function (k) { return AREAS[k].name; }).join(" + ") + " HIDDEN" : "";
  }
  function toggleArea(k) {
    if (state.hidden[k]) delete state.hidden[k]; else state.hidden[k] = true;
    lsSet(LS_HIDDEN, state.hidden);
    render(true);
    var name = AREAS[k].name.charAt(0) + AREAS[k].name.slice(1).toLowerCase();
    toast(name + " calendar " + (state.hidden[k] ? "hidden on all views" : "shown on all views"));
  }
  function calStatus(area) { return state.calendars.filter(function (c) { return c.area === area; })[0]; }
  /* The farm calendar joins Work and Personal once the bridge lists it (bridge 1.8, FARM_CALENDAR_ID).
     Its label is the calendar's own name, so nothing personal is written into this code. */
  /* The Growth calendar joins the same way (bridge 1.22, GROWTH_CALENDAR_ID, area "hobby"); its label stays GROWTH. */
  function setAreas() {
    var f = calStatus("farm"), g = calStatus("hobby"), fm = calStatus("family");
    LIVE = ["work", "personal"].concat(f ? ["farm"] : [], g ? ["hobby"] : [], fm ? ["family"] : []);
    STANDBY_AREAS = (f ? [] : ["farm"]).concat(g ? [] : ["hobby"]);
    AREAS.farm.name = f && f.ok && bare(f.name || "").trim() ? bare(f.name).trim().toUpperCase().slice(0, 20) : "FARM + BEES";
    WRITABLE = ["personal"].concat(f && f.ok ? ["farm"] : [], g && g.ok ? ["hobby"] : []);
  }
  function hasFarm() { return LIVE.indexOf("farm") > -1; }
  function hasGrowth() { return LIVE.indexOf("hobby") > -1; }
  function hasFamily() { return LIVE.indexOf("family") > -1; }

  /* ---------- Sync ---------- */
  function errCode(err) { return !err ? "" : err.name === "AbortError" ? "timeout" : navigator.onLine === false ? "offline" : isNetworkError(err) ? "network" : String(err.code || err.message || ""); }
  function setSync(status, error, code) {
    state.sync = { status: status, at: status === "ok" ? Date.now() : state.sync.at, error: error || null, code: code || null };
    lsSet(LS_SYNC, state.sync);
    renderStatus();
  }
  function persist() {
    var keys = Object.keys(state.ranges).sort(function (a, b) { return state.ranges[b].fetched - state.ranges[a].fetched; });
    keys.slice(KEEP_RANGES).forEach(function (k) { delete state.ranges[k]; });
    lsSet(LS_CACHE, { ranges: state.ranges, calendars: state.calendars, bridgeVersion: state.bridgeVersion, caps: state.caps });
  }
  function refresh(force) {
    if (!state.conn || (state.screen === "systems" && !force)) return;
    var r = viewRange(), k = rkey(r), have = state.ranges[k];
    if (!force && have && Date.now() - have.fetched < FRESH_MS) return;
    if (state.inflight[k]) return;
    state.inflight[k] = true;
    setSync("syncing");
    api({ action: "events", from: r.from.getTime(), to: r.to.getTime() }).then(function (j) {
      state.ranges[k] = { from: r.from.getTime(), to: r.to.getTime(), fetched: Date.now(), events: j.events || [] };
      state.calendars = j.calendars || state.calendars;
      if (j.version) state.bridgeVersion = j.version;
      state.caps = j.capabilities || [];
      persist();
      prof.kick(); loadUpkeep(false);
      state.syncFails = 0;
      setSync("ok");
      reconcileQueue();
      if (state.screen === "systems") { toast("Synced"); loadTasks(ymd(new Date()), true); loadDates(true); loadDone(true); loadHabits(true); loadLibrary(true); loadTarot(true); loadApiary(true); }
      flushQueue(false);
      flushHabits();
      flushInbox();
      sciFlush();
      flushMeals();
      if (rkey(viewRange()) === k || state.screen === "systems") render(true);
      briefMaybe();
      shipMaybe();
      loadSchema(false);
      loadExport(false);
    }).catch(function (err) {
      var offline = navigator.onLine === false;
      state.syncFails = (state.syncFails || 0) + 1;
      if (!offline && state.syncFails < 3 && hasData(r) && (transient(err) || isNetworkError(err))) {
        /* Showing saved data that's still good: stay quiet and try again shortly. */
        state.sync.status = "retrying";
        state.sync.error = describe(err);
        renderStatus();
        setTimeout(function () { refresh(true); }, 30000 * state.syncFails);
      } else {
        setSync(isNetworkError(err) || offline ? "offline" : "error", describe(err), errCode(err));
      }
      if (state.screen === "systems") render(true);
    }).then(function () { delete state.inflight[k]; });
  }

