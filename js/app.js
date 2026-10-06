/* TimothyOS 1.0: calendar core.
   Reads work + personal calendars through the Apps Script bridge and shows
   them in Day, Week and Month views. Everything else is on standby. */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var LS_CONN = "tos.conn.v1";
  var LS_CACHE = "tos.cache.v1";
  var LS_SYNC = "tos.sync.v1";
  var FRESH_MS = 60 * 1000;          /* don't refetch a range newer than this */
  var AUTO_MS = 5 * 60 * 1000;       /* background refresh while the app is open */
  var KEEP_RANGES = 8;

  var AREAS = {
    work: { name: "WORK", unit: "MTGS" },
    personal: { name: "PERSONAL", unit: "ITEMS" },
    farm: { name: "FARM + BEES" },
    hobby: { name: "HOBBIES" }
  };
  var LIVE = ["work", "personal"];
  var STANDBY_AREAS = ["farm", "hobby"];
  var STANDBY_MODULES = [
    ["QUICK CAPTURE", "Add events and notes in seconds."],
    ["ASK CLAUDE", "Questions about your days and projects."],
    ["PLAN DAY", "Pick up to three priorities each morning."],
    ["PRIORITIES", "Daily priorities, stored in Notion."],
    ["KEY DATES", "Upcoming dates, stored in Notion."],
    ["WEEKLY REVIEW", "Hours by life area and a short reflection."]
  ];
  var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var DOWL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var MONL = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  /* ---------- Storage (never throws) ---------- */
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v, function (key, val) { return key.charAt(0) === "_" ? undefined : val; })); } catch (e) { /* storage full or blocked */ }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  /* ---------- Dates ---------- */
  function p2(n) { return String(n).padStart(2, "0"); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sow(d) { var x = sod(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  function som(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function ymd(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function parseYmd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hm(d) { return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function dLabel(d) { return DOW[d.getDay()] + " " + p2(d.getDate()) + " " + MON[d.getMonth()]; }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  /* Hour position inside a day, using wall-clock time so DST days stay correct. */
  function posInDay(d, d0) {
    if (d <= d0) return 0;
    if (d >= addDays(d0, 1)) return 24;
    return d.getHours() + d.getMinutes() / 60;
  }
  function stamp(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    return (sameDay(d, new Date()) ? "" : p2(d.getDate()) + " " + MON[d.getMonth()] + " ") + hm(d);
  }

  /* ---------- Small helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cssNum(name, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }
  function phead(title, meta, c) {
    return '<div class="phead"' + (c ? ' style="--c: var(--' + c + ')"' : "") + '><span class="cap"></span><h2>' + title +
      '</h2><span class="rule"></span>' + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</div>";
  }
  function stubBox(text) { return '<div class="stubbox"><span class="pill">STANDBY</span><span>' + text + "</span></div>"; }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }

  /* ---------- State ---------- */
  var cached = lsGet(LS_CACHE) || {};
  var state = {
    screen: "today",
    anchor: sod(new Date()),
    conn: lsGet(LS_CONN),
    ranges: cached.ranges || {},
    calendars: cached.calendars || [],
    bridgeVersion: cached.bridgeVersion || null,
    sync: lsGet(LS_SYNC) || { status: "idle", at: null, error: null },
    inflight: {},
    index: {},
    lastDay: sod(new Date()).getTime(),
    lastAuto: 0,
    disarmAt: 0,
    scrollTarget: null
  };
  if (state.sync.status === "syncing") state.sync.status = "idle";

  /* ---------- Bridge API ---------- */
  function api(params, conn) {
    conn = conn || state.conn;
    var u = new URL(conn.url);
    u.searchParams.set("key", conn.key);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    /* Plain GET with no custom headers, so Apps Script answers without a CORS preflight. */
    return fetch(u.toString(), { method: "GET", redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) { var e = new Error("http_" + r.status); e.code = "http_" + r.status; throw e; }
        return r.text();
      })
      .then(function (txt) {
        var j;
        try { j = JSON.parse(txt); } catch (x) { var e1 = new Error("bad_json"); e1.code = "bad_json"; throw e1; }
        if (!j || j.ok !== true) { var e2 = new Error((j && j.error) || "bad_response"); e2.code = (j && j.error) || "bad_response"; e2.detail = j && j.detail; throw e2; }
        return j;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  function isNetworkError(err) { return !!err && (err.name === "TypeError" || err.name === "AbortError"); }
  function describe(err) {
    var code = err && (err.code || err.message);
    if (code === "unauthorized") return "The access key doesn't match. Copy it again from the Apps Script log (run setup).";
    if (code === "server_error") return "The script hit an error: " + (err.detail || "unknown") + ".";
    if (code === "bad_json") return "The script didn't send calendar data. Use the web app URL that ends in /exec.";
    if (code === "unknown_action") return "The script is out of date. Deploy a new version of the latest Code.gs.";
    if (/^http_/.test(code || "")) return "The script answered with " + code.replace("http_", "HTTP ") + ". Check the deployment.";
    if (isNetworkError(err)) return "Couldn't reach the script. Check your connection, that the URL ends in /exec, and that access is set to Anyone.";
    return "Sync failed (" + esc(code) + ").";
  }

  /* ---------- Ranges + events ---------- */
  function viewRange() {
    var a = state.anchor;
    if (state.screen === "month") { var g = sow(som(a)); return { from: g, to: addDays(g, 42) }; }
    var w = sow(a);
    return { from: w, to: addDays(w, 7) };
  }
  function rkey(r) { return r.from.getTime() + "_" + r.to.getTime(); }
  function eventsFor(r) {
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
  /* Side-by-side columns for overlapping events. */
  function layout(timed, day) {
    var d0 = sod(day);
    var rows = timed.map(function (ev) {
      var s = posInDay(ev._s, d0), e = posInDay(ev._e, d0);
      return { ev: ev, s: s, e: e, ve: Math.max(e, s + 0.45) };
    });
    var clusters = [], cur = [], end = -1;
    rows.forEach(function (r) {
      if (cur.length && r.s >= end) { clusters.push(cur); cur = []; end = -1; }
      cur.push(r);
      end = Math.max(end, r.ve);
    });
    if (cur.length) clusters.push(cur);
    clusters.forEach(function (cl) {
      var cols = [];
      cl.forEach(function (r) {
        var c = 0;
        while (cols[c] !== undefined && cols[c] > r.s) c++;
        cols[c] = r.ve;
        r.col = c;
      });
      cl.forEach(function (r) { r.n = cols.length; });
    });
    return rows;
  }
  function hourWindow(rowSets) {
    var a = 6, b = 22;
    rowSets.forEach(function (rows) { rows.forEach(function (r) { a = Math.min(a, Math.floor(r.s)); b = Math.max(b, Math.ceil(r.e)); }); });
    return { a: Math.max(0, a), b: Math.min(24, b) };
  }
  function calStatus(area) { return state.calendars.filter(function (c) { return c.area === area; })[0]; }

  /* ---------- Sync ---------- */
  function setSync(status, error) {
    state.sync = { status: status, at: status === "ok" ? Date.now() : state.sync.at, error: error || null };
    lsSet(LS_SYNC, state.sync);
    renderStatus();
  }
  function persist() {
    var keys = Object.keys(state.ranges).sort(function (a, b) { return state.ranges[b].fetched - state.ranges[a].fetched; });
    keys.slice(KEEP_RANGES).forEach(function (k) { delete state.ranges[k]; });
    lsSet(LS_CACHE, { ranges: state.ranges, calendars: state.calendars, bridgeVersion: state.bridgeVersion });
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
      persist();
      setSync("ok");
      if (state.screen === "systems") toast("Synced");
      if (rkey(viewRange()) === k || state.screen === "systems") render(true);
    }).catch(function (err) {
      setSync(isNetworkError(err) || navigator.onLine === false ? "offline" : "error", describe(err));
      if (state.screen === "systems") render(true);
    }).then(function () { delete state.inflight[k]; });
  }

  /* ---------- Header, nav, status ---------- */
  function renderHeader() {
    var e = $("eyebrow"), t = $("title"), a = state.anchor, now = new Date();
    var linked = !!state.conn;
    $("pager").hidden = !linked || state.screen === "systems";
    $("topNote").textContent = linked ? "CALENDAR CORE · READ-ONLY" : "CALENDAR CORE · NOT LINKED";
    if (!linked && state.screen !== "systems") { e.textContent = "FIRST RUN"; t.textContent = "LINK CALENDARS"; }
    else if (state.screen === "today") {
      var diff = Math.round((sod(a) - sod(now)) / 86400000);
      e.textContent = diff === 0 ? "TODAY" : diff === 1 ? "TOMORROW" : diff === -1 ? "YESTERDAY" : DOWL[a.getDay()];
      t.textContent = dLabel(a) + (a.getFullYear() !== now.getFullYear() ? " " + a.getFullYear() : "");
    } else if (state.screen === "week") {
      var w0 = sow(a), w1 = addDays(w0, 6);
      e.textContent = "WEEK " + isoWeek(a) + (sow(now).getTime() === w0.getTime() ? " · THIS WEEK" : "");
      t.textContent = p2(w0.getDate()) + (w0.getMonth() !== w1.getMonth() ? " " + MON[w0.getMonth()] : "") + " TO " + p2(w1.getDate()) + " " + MON[w1.getMonth()];
    } else if (state.screen === "month") {
      e.textContent = "MONTH";
      t.textContent = MONL[a.getMonth()] + " " + a.getFullYear();
    } else { e.textContent = "SETTINGS + HEALTH"; t.textContent = "SYSTEMS"; }
    document.querySelectorAll(".nav[data-screen]").forEach(function (b) {
      if (b.dataset.screen === state.screen) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  function renderStatus() {
    var s = $("status"), st = state.sync, at = stamp(st.at), line1, line2, cls;
    if (!state.conn) { cls = "unlinked"; line1 = "NOT LINKED"; line2 = "SETUP NEEDED"; }
    else if (st.status === "syncing") { cls = "syncing"; line1 = "SYNCING"; line2 = at ? "LAST " + at : ""; }
    else if (st.status === "offline") { cls = "offline"; line1 = "OFFLINE"; line2 = at ? "CACHED " + at : "NO DATA YET"; }
    else if (st.status === "error") { cls = "error"; line1 = "SYNC ERROR"; line2 = "SEE SYSTEMS"; }
    else { cls = "ok"; line1 = at ? "SYNCED" : "WAITING"; line2 = at; }
    s.className = "status " + cls;
    s.innerHTML = '<b><span class="dot"></span>' + line1 + "</b><span>" + esc(line2) + "</span>";
  }

  /* ---------- Day ---------- */
  function renderDay() {
    var r = viewRange(), list = eventsFor(r), day = state.anchor, now = new Date(), isToday = sameDay(day, now);
    var de = dayEvents(list, day), rows = layout(de.timed, day), w = hourWindow([rows]), hh = cssNum("--hh", 54);
    var total = de.timed.length + de.allDay.length;
    var meta = !hasData(r) ? (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET") : total ? total + (total === 1 ? " EVENT" : " EVENTS") : "OPEN DAY";
    var html = '<div class="bridge"><section class="tlpanel">' + phead(isToday ? "TODAY TIMELINE" : "DAY TIMELINE", meta);
    if (de.allDay.length) {
      html += '<div class="allday">' + de.allDay.map(function (ev) {
        state.index[ev.id] = ev;
        return '<button type="button" class="adchip a-' + ev.area + '" data-id="' + esc(ev.id) + '">ALL DAY · ' + esc(ev.title) + "</button>";
      }).join("") + "</div>";
    }
    html += '<div class="tlwrap" id="tlwrap"><div class="tl" style="height:' + (w.b - w.a) * hh + 'px">';
    for (var h = w.a; h < w.b; h++) {
      html += '<div class="hour" style="top:' + (h - w.a) * hh + 'px"><span class="tnum">' + p2(h) + "</span></div>";
    }
    rows.forEach(function (row) {
      var ev = row.ev, top = (row.s - w.a) * hh + 2, height = Math.max(24, (row.e - row.s) * hh - 4);
      state.index[ev.id] = ev;
      var cls = "ev a-" + ev.area + (height >= 50 ? " tall" : "") + (row.n > 2 && height >= 44 ? " narrow" : "") + (ev.busy ? " busy" : "");
      html += '<button type="button" class="' + cls + '" data-id="' + esc(ev.id) + '" style="top:' + top + "px;height:" + height +
        "px;left:calc(58px + (100% - 62px) * " + row.col + " / " + row.n + ");width:calc((100% - 62px) / " + row.n + ' - 4px)">' +
        '<span class="t">' + esc(ev.title) + '</span><span class="tm tnum">' + hm(ev._s) + "-" + hm(ev._e) + "</span></button>";
    });
    var nowH = now.getHours() + now.getMinutes() / 60;
    if (isToday && nowH >= w.a && nowH <= w.b) {
      html += '<div class="now" style="top:' + (nowH - w.a) * hh + 'px"><span class="tnum">' + hm(now) + "</span></div>";
    }
    html += "</div></div></section><section class=\"rcol\">";

    html += "<div>" + phead("LIFE AREAS", "") + '<div class="arows">';
    LIVE.forEach(function (k) {
      var cs = calStatus(k);
      var items = de.timed.filter(function (e) { return e.area === k; });
      var adCount = de.allDay.filter(function (e) { return e.area === k; }).length;
      var next = items.filter(function (e) { return !isToday || e._e > now; })[0];
      var sub;
      if (cs && !cs.ok) sub = "Not connected. See Systems.";
      else if (next) sub = (isToday && next._s <= now ? "Now: " : "Next: ") + hm(next._s) + " " + esc(next.title);
      else sub = items.length ? "Done for the day" : adCount ? "All-day only" : "Nothing scheduled";
      html += '<div class="arow a-' + k + '"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name + "</b><small>" + sub +
        '</small></span><span class="ct"><b class="tnum">' + (items.length + adCount) + "</b>" + AREAS[k].unit + "</span></div>";
    });
    STANDBY_AREAS.forEach(function (k) {
      html += '<div class="arow stub a-' + k + '" aria-disabled="true"><span class="sw"></span><span class="nm"><b>' + AREAS[k].name +
        '</b><small>Calendar not linked yet</small></span><span class="ct">STANDBY</span></div>';
    });
    html += "</div></div>";
    html += "<div>" + phead("PRIORITIES", "") + stubBox("Picked each morning with Plan Day. Arrives with the Notion link.") + "</div>";
    html += "<div>" + phead("KEY DATES", "") + stubBox("Upcoming dates from Notion, with countdowns.") + "</div>";
    html += "</section></div>";
    $("content").innerHTML = html;

    var first = rows.length ? rows[0].s : 8;
    state.scrollTarget = Math.max(0, ((isToday ? nowH - 2.5 : first - 1) - w.a) * hh);
  }

  /* ---------- Week ---------- */
  function renderWeek() {
    var r = viewRange(), list = eventsFor(r), now = new Date(), px = cssNum("--wh", 32);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(r.from, i), de = dayEvents(list, d);
      days.push({ d: d, de: de, rows: layout(de.timed, d) });
    }
    var w = hourWindow(days.map(function (x) { return x.rows; }));
    var hasAllDay = days.some(function (x) { return x.de.allDay.length; });
    var html = phead("ALL CALENDARS", hasData(r) ? "TAP A DAY TO OPEN IT" : (state.sync.status === "syncing" ? "LOADING" : "NO DATA YET")) +
      '<div class="wkscroll"><div class="wk"><div></div>';
    days.forEach(function (x) {
      html += '<button type="button" class="wkh' + (sameDay(x.d, now) ? " today" : "") + '" data-day="' + ymd(x.d) + '">' +
        DOW[x.d.getDay()] + '<b class="tnum">' + p2(x.d.getDate()) + "</b></button>";
    });
    if (hasAllDay) {
      html += "<div></div>";
      days.forEach(function (x) {
        html += '<div class="wkad">' + x.de.allDay.map(function (ev) { return '<span class="a-' + ev.area + '">' + esc(ev.title) + "</span>"; }).join("") + "</div>";
      });
    }
    var height = (w.b - w.a) * px;
    html += '<div class="wkgut" style="height:' + height + 'px">';
    for (var h = w.a + 1; h < w.b; h++) {
      if (h % 2 === 0) html += '<span class="tnum" style="top:' + (h - w.a) * px + 'px">' + p2(h) + "</span>";
    }
    html += "</div>";
    days.forEach(function (x) {
      html += '<div class="wkcol" style="height:' + height + 'px">';
      x.rows.forEach(function (row) {
        var ev = row.ev, hgt = Math.max(14, (row.e - row.s) * px - 2);
        state.index[ev.id] = ev;
        html += '<button type="button" class="wkb a-' + ev.area + (ev.busy ? " busy" : "") + '" data-id="' + esc(ev.id) + '" title="' + esc(ev.title) +
          '" style="top:' + ((row.s - w.a) * px + 1) + "px;height:" + hgt + "px;left:calc(2px + (100% - 4px) * " + row.col + " / " + row.n +
          ");width:calc((100% - 4px) / " + row.n + ' - 2px)">' + (hgt >= 26 ? esc(ev.title) : "") + "</button>";
      });
      var nowH = now.getHours() + now.getMinutes() / 60;
      if (sameDay(x.d, now) && nowH >= w.a && nowH <= w.b) html += '<div class="wknow" style="top:' + (nowH - w.a) * px + 'px"></div>';
      html += "</div>";
    });
    html += "</div></div>";
    $("content").innerHTML = html;
  }

  /* ---------- Month ---------- */
  function renderMonth() {
    var r = viewRange(), list = eventsFor(r), now = new Date(), m = state.anchor.getMonth();
    var html = '<div class="mo">';
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(function (d) { html += '<div class="moh">' + d + "</div>"; });
    for (var c = 0; c < 42; c++) {
      var d = addDays(r.from, c), de = dayEvents(list, d), all = de.allDay.concat(de.timed);
      var present = LIVE.filter(function (a) { return all.some(function (e) { return e.area === a; }); });
      html += '<button type="button" class="moc' + (d.getMonth() === m ? "" : " out") + (sameDay(d, now) ? " today" : "") + '" data-day="' + ymd(d) + '">' +
        '<span class="top1"><span class="n tnum">' + d.getDate() + '</span><span class="dots">' +
        present.map(function (a) { return '<i class="a-' + a + '"></i>'; }).join("") + "</span></span>" +
        all.slice(0, 3).map(function (ev) {
          return '<span class="li a-' + ev.area + '">' + (ev.allDay ? "" : '<span class="tnum">' + hm(ev._s) + "</span> ") + esc(ev.title) + "</span>";
        }).join("") +
        (all.length > 3 ? '<span class="more">+' + (all.length - 3) + " MORE</span>" : "") + "</button>";
    }
    html += "</div>";
    $("content").innerHTML = html;
  }

  /* ---------- Systems ---------- */
  function maskUrl(u) { return u.length > 52 ? u.slice(0, 38) + "…" + u.slice(-10) : u; }
  function calHelp(c) {
    if (c.error === "not_configured") return "Set WORK_CALENDAR_ID in the Apps Script, then deploy a new version.";
    if (c.error === "not_found") return "This Google account can't see that calendar yet. Accept the share invite, then check the ID.";
    return "Problem: " + esc(c.error);
  }
  function renderSystems() {
    var c = state.conn, st = state.sync;
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var pill = !c ? '<span class="pill bad">NOT LINKED</span>' : st.status === "error" ? '<span class="pill bad">ERROR</span>' :
      st.status === "offline" ? '<span class="pill">OFFLINE</span>' : '<span class="pill ok">LINKED</span>';
    var html = '<div class="sys"><section>' + phead("CONNECTION", "") + '<dl class="kv">' +
      "<dt>STATUS</dt><dd>" + pill + (st.error && c ? ' <span class="muted">' + esc(st.error) + "</span>" : "") + "</dd>" +
      "<dt>BRIDGE URL</dt><dd>" + (c ? esc(maskUrl(c.url)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>ACCESS KEY</dt><dd>" + (c ? "•••• " + esc(c.key.slice(-4)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>LAST SYNC</dt><dd class=\"tnum\">" + (st.at ? esc(stamp(st.at)) : '<span class="muted">Never</span>') + "</dd>" +
      "</dl><div class=\"btnrow\" style=\"margin-top:14px\">" +
      (c ? '<button type="button" class="btn" data-act="refresh">REFRESH NOW</button>' +
        '<button type="button" class="btn ghost" data-act="disconnect">' + (Date.now() - state.disarmAt < 4000 ? "TAP AGAIN TO UNLINK" : "UNLINK") + "</button>"
        : '<button type="button" class="btn capture" data-act="setup">LINK CALENDARS</button>') +
      "</div></section>";

    html += "<section>" + phead("CALENDARS", "READ-ONLY");
    LIVE.forEach(function (k) {
      var cs = calStatus(k);
      html += '<div class="calrow a-' + k + '"><span class="st"></span><span><b>' + AREAS[k].name + "</b><small>" +
        (cs ? (cs.ok ? esc(cs.name) : calHelp(cs)) : "Status appears after the first sync.") + "</small></span>" +
        (cs ? (cs.ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">' + (cs.error === "not_configured" ? "NOT SET" : "NOT FOUND") + "</span>") : '<span class="pill">UNKNOWN</span>') + "</div>";
    });
    STANDBY_AREAS.forEach(function (k) {
      html += '<div class="calrow a-' + k + '" style="opacity:.5"><span class="st"></span><span><b>' + AREAS[k].name +
        "</b><small>Separate calendar, linked in a later stage.</small></span><span class=\"pill\">STANDBY</span></div>";
    });
    html += "</section>";

    html += "<section>" + phead("STANDBY MODULES", "NOT ACTIVE YET") + '<div class="stublist">' +
      STANDBY_MODULES.map(function (m) { return '<div class="stubbox"><span><b style="color:var(--fg)">' + m[0] + "</b><br>" + m[1] + "</span></div>"; }).join("") + "</div></section>";

    html += "<section>" + phead("APP", "") + '<dl class="kv"><dt>APP VERSION</dt><dd class="tnum">' + VERSION + "</dd>" +
      "<dt>BRIDGE VERSION</dt><dd class=\"tnum\">" + (state.bridgeVersion ? esc(state.bridgeVersion) : '<span class="muted">Unknown</span>') + "</dd>" +
      "<dt>RUNNING AS</dt><dd>" + (standalone ? "Home screen app" : "Browser tab. In Safari, tap Share, then Add to Home Screen.") + "</dd></dl></section></div>";
    $("content").innerHTML = html;
  }

  /* ---------- First-run link ---------- */
  function renderConnect() {
    var html = '<div class="connect">' + phead("CALENDAR BRIDGE", "ONE-TIME SETUP") +
      "<ol><li>Create the Apps Script bridge and run <b>setup</b>. Copy the access key from the log.</li>" +
      "<li>Deploy it as a web app (execute as you, access: Anyone). Copy the URL ending in <b>/exec</b>.</li>" +
      "<li>Paste both below. Full steps are in the README.</li></ol>" +
      '<form id="connForm" class="connect" autocomplete="off" novalidate>' +
      '<div><label for="connUrl">WEB APP URL</label><input type="url" id="connUrl" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div><label for="connKey">ACCESS KEY</label><input type="text" id="connKey" placeholder="64 characters from the setup log" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div class="err" id="connErr" role="alert"></div>' +
      '<div class="btnrow"><button type="submit" class="btn capture" id="connBtn">LINK ▶</button></div></form></div>';
    $("content").innerHTML = html;
  }
  function submitConnect() {
    var url = $("connUrl").value.trim(), key = $("connKey").value.trim().replace(/\s+/g, ""), err = $("connErr");
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { err.textContent = "The URL should start with https://script.google.com/ and end in /exec."; return; }
    if (key.length < 20) { err.textContent = "That key looks too short. Copy the whole line from the setup log."; return; }
    err.textContent = "";
    var btn = $("connBtn");
    btn.disabled = true;
    btn.textContent = "CHECKING…";
    var conn = { url: url, key: key };
    api({ action: "ping" }, conn).then(function (j) {
      state.conn = conn;
      lsSet(LS_CONN, conn);
      state.calendars = j.calendars || [];
      state.bridgeVersion = j.version || null;
      persist();
      var bad = state.calendars.filter(function (c) { return !c.ok; });
      toast(bad.length ? "Linked. One calendar needs attention, see Systems." : "Linked. Loading your calendars.");
      go("today", sod(new Date()));
    }).catch(function (e) {
      err.textContent = describe(e);
      btn.disabled = false;
      btn.textContent = "LINK ▶";
    });
  }

  /* ---------- Detail sheet ---------- */
  function openDetail(ev) {
    norm(ev);
    var when;
    if (ev.allDay) {
      var s = parseYmd(ev.start), last = addDays(parseYmd(ev.end), -1);
      when = "All day · " + dLabel(s) + (sameDay(s, last) ? "" : " to " + dLabel(last));
    } else {
      when = dLabel(ev._s) + " · " + hm(ev._s) + " to " + (sameDay(ev._s, ev._e) ? "" : dLabel(ev._e) + " ") + hm(ev._e);
    }
    $("detailSheet").className = "sheet a-" + ev.area;
    $("detailSheet").style.setProperty("--c", "var(--" + ev.area + ")");
    $("detailSheet").innerHTML = '<div class="sbar"><span>' + AREAS[ev.area].name + "</span><span>READ-ONLY</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + esc(ev.title) + '</h3><div class="tnum">' + esc(when) + "</div>" +
      (ev.location ? '<div class="muted">' + esc(ev.location) + "</div>" : "") +
      (ev.busy ? '<div class="muted">Details are hidden. This calendar is shared as free/busy only, or the event is private.</div>' : "") +
      '</div><div class="sfoot"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    $("detailScrim").hidden = false;
    $("detailClose").focus();
  }
  function closeDetail() { $("detailScrim").hidden = true; }

  /* ---------- Render + navigation ---------- */
  function render(keepScroll) {
    var wrap = $("tlwrap");
    var keep = keepScroll && wrap ? wrap.scrollTop : null;
    state.index = {};
    renderHeader();
    renderStatus();
    if (!state.conn && state.screen !== "systems") { renderConnect(); return; }
    ({ today: renderDay, week: renderWeek, month: renderMonth, systems: renderSystems })[state.screen]();
    var w2 = $("tlwrap");
    if (w2) w2.scrollTop = keep !== null ? keep : state.scrollTarget || 0;
  }
  function go(screen, anchor) {
    state.screen = screen;
    if (anchor) state.anchor = sod(anchor);
    render(false);
    $("content").scrollTop = 0;
    refresh(false);
  }
  function page(dir) {
    var a = state.anchor;
    if (state.screen === "today") state.anchor = addDays(a, dir);
    else if (state.screen === "week") state.anchor = addDays(a, 7 * dir);
    else state.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    render(false);
    refresh(false);
  }

  document.querySelectorAll(".nav[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null); });
  });
  $("status").addEventListener("click", function () { go("systems"); });
  $("prevBtn").addEventListener("click", function () { page(-1); });
  $("nextBtn").addEventListener("click", function () { page(1); });
  $("todayBtn").addEventListener("click", function () { go(state.screen, new Date()); });

  $("content").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.id && state.index[b.dataset.id]) openDetail(state.index[b.dataset.id]);
    else if (b.dataset.day) go("today", parseYmd(b.dataset.day));
    else if (b.dataset.act === "refresh") refresh(true);
    else if (b.dataset.act === "setup") go("today");
    else if (b.dataset.act === "disconnect") {
      if (Date.now() - state.disarmAt < 4000) {
        state.conn = null;
        state.ranges = {};
        state.calendars = [];
        lsDel(LS_CONN); lsDel(LS_CACHE); lsDel(LS_SYNC);
        state.sync = { status: "idle", at: null, error: null };
        state.disarmAt = 0;
        toast("Unlinked. Calendar data removed from this device.");
        render(false);
      } else {
        state.disarmAt = Date.now();
        render(false);
        setTimeout(function () { if (state.screen === "systems") render(false); }, 4100);
      }
    }
  });
  $("content").addEventListener("submit", function (e) {
    if (e.target.id === "connForm") { e.preventDefault(); submitConnect(); }
  });
  $("detailScrim").addEventListener("click", function (e) {
    if (e.target === $("detailScrim") || e.target.id === "detailClose") closeDetail();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });

  /* ---------- Clock + background refresh ---------- */
  function tick() {
    var today = sod(new Date()).getTime();
    if (today !== state.lastDay) {
      if (state.anchor.getTime() === state.lastDay) state.anchor = new Date(today);
      state.lastDay = today;
    }
    if (document.hidden) return;
    if ($("detailScrim").hidden && (state.screen === "today" || state.screen === "week") && state.conn) render(true);
    if (Date.now() - state.lastAuto > AUTO_MS) { state.lastAuto = Date.now(); refresh(true); }
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); refresh(false); } });
  window.addEventListener("online", function () { refresh(true); });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* app still works without offline cache */ });
  }

  state.lastAuto = Date.now();
  render(false);
  refresh(false);
})();
