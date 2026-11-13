  /* ---------- Systems ---------- */
  function maskUrl(u) { return u.length > 52 ? u.slice(0, 38) + "…" + u.slice(-10) : u; }
  function calHelp(c) {
    if (c.error === "not_configured") return "Set WORK_CALENDAR_ID in the Apps Script, then deploy a new version.";
    if (c.error === "not_found") return "This Google account can't see that calendar yet. Accept the share invite, then check the ID.";
    return "Problem: " + esc(c.error);
  }
  function renderSystems() {
    var c = state.conn, st = state.sync;
    loadAiSpend(false);
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var pill = !c ? '<span class="pill bad">NOT LINKED</span>' : st.status === "error" ? '<span class="pill bad">ERROR</span>' :
      st.status === "offline" ? '<span class="pill">OFFLINE</span>' : '<span class="pill ok">LINKED</span>';
    var html = '<div class="sys">' + fixPanel() + '<section id="sec-conn">' + phead("CONNECTION", "") + '<dl class="kv">' +
      "<dt>STATUS</dt><dd>" + pill + (st.error && c ? ' <span class="muted">' + esc(st.error) + "</span>" : "") + "</dd>" +
      "<dt>BRIDGE URL</dt><dd>" + (c ? esc(maskUrl(c.url)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>ACCESS KEY</dt><dd>" + (c ? "•••• " + esc(c.key.slice(-4)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>LAST SYNC</dt><dd class=\"tnum\">" + (st.at ? esc(stamp(st.at)) : '<span class="muted">Never</span>') + "</dd>" +
      "</dl><div class=\"btnrow\" style=\"margin-top:14px\">" +
      (c ? refreshBtn() +
        '<button type="button" class="btn ghost" data-act="disconnect">' + (Date.now() - state.disarmAt < 4000 ? "TAP AGAIN TO UNLINK" : "UNLINK") + "</button>"
        : '<button type="button" class="btn capture" data-act="setup">LINK CALENDARS</button>') +
      "</div></section>";

    html += diagSection();
    html += backupSection();
    html += storeSection();
    html += prof.section();
    html += netSection();
    html += errSection();
    html += "<section>" + phead("CALENDARS", canCreate() ? (hasFamily() ? "WORK + FAMILY" : "WORK") + " READ-ONLY · " + WRITABLE.map(function (k) { return AREAS[k].name; }).join(" + ") + (WRITABLE.length > 1 ? " TAKE" : " TAKES") + " CAPTURES" : "READ-ONLY");
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
    if (!hasFamily() && state.calendars.length) html += '<div class="calrow a-family" style="opacity:.5"><span class="st"></span><span><b>FAMILY</b><small>Optional, read-only: add FAMILY_CALENDAR_ID in the bridge\'s Script Properties (README → Family calendar).</small></span><span class="pill">OFF</span></div>';
    var nIgn = ignoredCount();
    html += '<label class="ov-sub" for="ignIn">IGNORED EVENTS</label>' +
      '<textarea id="ignIn" rows="3" placeholder="One title per line. Any event whose title contains it is left out of every view, count and total.">' + esc(ignoreList.join("\n")) + "</textarea>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="ignsave">SAVE IGNORED</button></div>' +
      '<small class="muted">' + (ignoreList.length ? nIgn + (nIgn === 1 ? " event" : " events") + " left out of the loaded calendars. " : "") +
      "Quickest way to add one: tap the event, then IGNORE THIS TITLE. Saved on this iPad; your calendars are not changed.</small>";
    html += '<label class="ov-sub" for="brkIn">BREAKS</label>' +
      '<textarea id="brkIn" rows="2" placeholder="One word per line, e.g. Lunch">' + esc(breakList.join("\n")) + "</textarea>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="brksave">SAVE BREAKS</button></div>' +
      '<small class="muted">A timed event whose whole title is one of these (capitals aside, and also with Out of office in front) is always shown, even if it matches an ignored title, as a break: never counted as Work hours, meetings, BALANCE or Review hours. Saved on this iPad.</small>';
    html += "</section>";

    html += aiSection();
    html += ledgerSection();
    html += tarotSection();
    html += apiarySection();
    html += sickbaySection();
    html += mealsSection();
    html += storageSection();
    html += haSection();
    html += logSection();
    html += balanceSection();
    html += standbySection();
    html += bridgeSection();
    html += captureSection();
    html += notionSection();
    html += inboxSection();
    html += scienceSection();

    html += '<section id="sec-app">' + phead("APP", "", "chrome-d") + '<dl class="kv"><dt>APP VERSION</dt><dd class="tnum">' + VERSION + "</dd>" +
      "<dt>BRIDGE VERSION</dt><dd class=\"tnum\">" + (state.bridgeVersion ? esc(state.bridgeVersion) + (bridgeBehind() ? ' <span class="pill warn">UPDATE TO ' + BRIDGE_WANT + "</span>" : ' <span class="pill ok">UP TO DATE</span>') : '<span class="muted">Unknown</span>') + "</dd>" +
      "<dt>RUNNING AS</dt><dd>" + (standalone ? "Home screen app" : "Browser tab. In Safari, tap Share, then Add to Home Screen.") + "</dd>" +
      "</dl></section></div>";
    $("content").innerHTML = html;
  }

  /* ---------- PROFILE SYNC (2.54, bridge 1.36) ---------- */
  /* Timothy works on two iPads, HUB and MOBILE. What each kept only on itself (HOLODECK's channels, AUDIO's places,
     pins, intent lines, landmarks and the rest, grouped in PROF_GROUPS) is kept in step through the Google bridge,
     in its own private storage. Local-first: every read stays on the iPad; a change goes up a few seconds later
     (AUDIO's places every 30 seconds while playing), and what the other iPad changed comes in when Bridge opens,
     when it's come back to, and every few minutes. A newer change wins, item by item; AUDIO's places merge episode by
     episode. A change that came in is written to this iPad's storage, and the app reloads to show it once nothing
     would be lost (no audio or TV playing, nothing being typed, no LOG open, no panel open). Keys and tokens, drafts,
     the AI switches and caches never take part. Each item can be kept to this iPad alone (its switch in SYSTEMS).
     This iPad's side: tos.profile.v1 { on, name, paused, at: {key: ms changed}, by: {key: iPad}, sent: {key: ms},
     off: {row: true}, last, rev }, never in a backup. */
  var LS_PROFILE = "tos.profile.v1";
  var lsHook = null;   /* lsSet / lsDel tell profile sync what changed */
  var PROF_GROUPS = [
    ["AUDIO", [["plays", "Resume points and finished episodes", ["tos.plays.v1"]], ["nashide", "Hidden folders and sort order", ["tos.nashide.v1", "tos.nassort.v1"]], ["naspref", "Speed, autoplay and last folder", ["tos.naspref.v1", "tos.nasdir.v1"]]]],
    ["HOLODECK", [["holo", "Channels, styles, BREAKS, Commercials folder, look", ["tos.holo.v1"]]]],
    ["BRIDGE AND TODAY", [["log", "Intent lines (30 days) and bearings", ["tos.log.v1", "tos.bearings.v1"]], ["pins", "Pins, start screen, open panels", ["tos.pins.v1", "tos.start.v1", "tos.bopen.v1"]], ["hidden", "Calendars hidden on Today", ["tos.hidden.v1"]]]],
    ["CALENDAR AND LEDGER", [["ignore", "Ignored events and break names", ["tos.ignore.v1", "tos.breaks.v1"]], ["bal", "Balance targets and Ledger range", ["tos.baltarget.v1", "tos.lrange.v1"]]]],
    ["ENGINEERING", [["ha", "Home Assistant devices, rooms, groups, scene order", ["tos.hadev.v1", "tos.hagroups.v1", "tos.hascnord.v1"]], ["engview", "Tabs, rooms and views (UPKEEP's too)", ["tos.engtab.v1", "tos.haroom.v1", "tos.haview.v1", "tos.upview.v1"]]]],
    ["LOG", [["sntopics", "Session topic lists", ["tos.sntopics.v1"]], ["review", "Review: saved weeks and last patterns answer", ["tos.rsaved.v1", "tos.rpatterns.v1"]]]],
    ["APIARY", [["rhythm", "Hive check rhythm", ["tos.hiverhythm.v1"]]]],
    ["MEALS", [["meals", "Grocery ticks and items added by hand, PLAN or LOG", ["tos.mealgot.v1", "tos.mealview.v1"]]]],
    ["ARBORETUM", [["arb", "The garden: its name, beds, plantings, jobs and ticks", ["tos.arb.v1"]]]],
    ["SICKBAY", [["sickview", "SICKBAY tabs, measure and range, activity goals, appointment words", ["tos.sickview.v1"]]]],
    ["SCIENCE AND ASTROMETRICS", [["scilm", "Landmarks and overlays", ["tos.scilm.v1", "tos.scilmoff.v1", "tos.scilineoff.v1"]], ["ship", "Ship's Year", ["tos.shipyear.v1"]]]],
    ["EVERYTHING ELSE", [["standby", "Standby minutes", ["tos.standby.v1"]], ["place", "Location for weather", ["tos.place.v1"]], ["misc", "Water goal, Capture length, Briefing, headlines and voice, RESSIKAN, Library shelf", ["tos.habitcfg.v1", "tos.capprefs.v1", "tos.briefoff.v1", "tos.newsoff.v1", "tos.voiceoff.v1", "tos.ressikan.v1", "tos.shelf.v1"]]]]
  ];
  var prof = (function () {
    var M = Object.assign({ on: false, name: "", paused: false, at: {}, by: {}, sent: {}, off: {}, h: {}, last: 0, rev: 0 }, lsGet(LS_PROFILE) || {});
    var KEY = {}, LABEL = {};
    PROF_GROUPS.forEach(function (g) { g[1].forEach(function (r) { LABEL[r[0]] = r[1]; r[2].forEach(function (k) { KEY[k] = r[0]; }); }); });
    var X = { busy: false, t: 0, due: 0, err: "", join: null, applying: false, pending: false, from: "", touch: 0 };
    var PLAYS = "tos.plays.v1", UNION = ["tos.ignore.v1", "tos.breaks.v1", "tos.bearings.v1", "tos.nashide.v1"];
    function save() { lsSet(LS_PROFILE, M); }
    function me() { return M.name || ""; }
    function synced(k) { return !!KEY[k] && !M.off[KEY[k]]; }
    function can() { return !!state.conn && state.caps.indexOf("profile") > -1; }
    function live() { return M.on && !M.paused && can(); }
    function hashStr(str) { var h = 5381, i = str.length; while (i) h = (h * 33) ^ str.charCodeAt(--i); return (h >>> 0).toString(36) + "." + str.length; }
    function stored(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
    lsHook = function (k) {   /* a change on this iPad: when, and by which iPad; sent a little later. The same value written again is no change. */
      if (X.applying || !KEY[k]) return;
      var h = hashStr(stored(k));
      if (M.h[k] === h) return;
      M.h[k] = h; M.at[k] = Date.now(); M.by[k] = me(); save();
      if (live() && synced(k)) isSoon(k === PLAYS && pl.el && !pl.el.paused ? 30000 : 4000);   /* while playing, every 30 seconds; paused, at once */
    };
    function isSoon(ms) { var due = Date.now() + ms; if (X.t && X.due <= due) return; clearTimeout(X.t); X.due = due; X.t = setTimeout(sync, ms); }
    function raw(k) { var v = lsGet(k); return v === undefined ? null : v; }
    function sync(asked) {   /* asked: SYNC NOW or joining, so a change that came in shows at once */
      clearTimeout(X.t); X.t = 0;
      if (!live() || X.busy) return Promise.resolve();
      var out = {}, n = 0;
      Object.keys(KEY).forEach(function (k) { if (synced(k) && (M.at[k] || 0) > (M.sent[k] || 0)) { out[k] = { v: k === PLAYS ? newPlays() : raw(k), at: M.at[k], by: M.by[k] || me() }; n++; } });
      X.busy = true; X.err = ""; paint();
      return (n ? apiPost({ action: "profileput", items: out }, 60000) : api({ action: "profile" })).then(function (j) {
        Object.keys(out).forEach(function (k) { if ((M.sent[k] || 0) < out[k].at) M.sent[k] = out[k].at; });
        take(j.items || {}, asked); M.last = Date.now(); M.rev = j.rev || 0; save();
      }, function (e) { X.err = describe(e); }).then(function () { X.busy = false; paint(); });
    }
    function newPlays() {   /* AUDIO's places: only the episodes changed since the last send (the bridge merges them in) */
      var since = M.sent[PLAYS] || 0, o = {};
      Object.keys(plays).forEach(function (p) { if ((plays[p].at || 0) > since) o[p] = plays[p]; });
      return o;
    }
    function put(k, v, at, by) { X.applying = true; if (v === null || v === undefined) lsDel(k); else lsSet(k, v); X.applying = false; M.h[k] = hashStr(stored(k)); M.at[k] = at; M.by[k] = by || ""; M.sent[k] = at; }
    function mergePlays(r) {   /* each episode keeps its newer place; the one playing now keeps going */
      var inc = (r && r.v) || {}, n = 0;
      Object.keys(inc).forEach(function (p) {
        var e = inc[p];
        if (!e || typeof e.at !== "number" || (plays[p] && e.at <= (plays[p].at || 0)) || (pl.path === p && pl.el && !pl.el.paused)) return;
        plays[p] = e; if (!e.by) e.by = r.by || ""; n++;
        if (pl.path === p && pl.el && pl.ready && !e.done && isFinite(pl.el.duration) && e.p < pl.el.duration - 5) { pl.el.currentTime = e.p; paintPlayer(); toast("Picked up from " + (e.by || "your other iPad") + " at " + mmss(e.p)); }   /* loaded here but paused: it moves to where the other iPad stopped */
      });
      if (n) { X.applying = true; savePlays(); X.applying = false; if (state.screen === "storage" && !pl.scrub) render(true); }
      if (r && (r.at || 0) > (M.at[PLAYS] || 0)) { M.at[PLAYS] = r.at; M.sent[PLAYS] = Math.max(M.sent[PLAYS] || 0, r.at); }
      return n;
    }
    function take(items, asked) {   /* what came back: anything newer than this iPad's own */
      var changed = [];
      Object.keys(items).forEach(function (k) {
        if (!synced(k)) return;
        var r = items[k] || {};
        if (k === PLAYS) { mergePlays(r); return; }
        if ((r.at || 0) <= (M.at[k] || 0)) return;
        var was = raw(k);
        put(k, r.v, r.at, r.by);
        if (!same(was, r.v)) { changed.push(k); X.from = r.by || X.from; }   /* the same value, newer: nothing to show */
      });
      if (changed.length) { X.pending = true; reloadWhenSafe(asked); }
      return changed;
    }
    document.addEventListener("pointerdown", function () { X.touch = Date.now(); }, true);
    function safe(asked) {
      if (document.hidden || typing() || state.screen === "log") return false;
      if (!asked && Date.now() - X.touch < 45000) return false;   /* in use right now: wait until it's been left a moment */
      if (pl.el && !pl.el.paused) return false;
      if (holo.onAir()) return false;
      return !document.querySelector(".scrim:not([hidden]), .hd-modal, .pf-modal");
    }
    function reloadWhenSafe(asked) {
      if (!X.pending || !safe(asked)) return;
      var last = 0; try { last = Number(sessionStorage.getItem("tos.profreload") || 0); } catch (e) { /* private window */ }
      if (Date.now() - last < 20000) return;   /* never a reload loop */
      try { sessionStorage.setItem("tos.profreload", String(Date.now())); sessionStorage.setItem("tos.profmsg", X.from ? "Updated from " + X.from : "Updated from your other iPad"); } catch (e) { /* fine */ }
      location.reload();
    }
    function markAll(at) { Object.keys(KEY).forEach(function (k) { if (synced(k) && raw(k) !== null) { M.at[k] = at || M.at[k] || Date.now(); M.by[k] = me(); M.sent[k] = 0; } }); }
    /* ---- joining: the first time an iPad turns sync on and the other one already has ---- */
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function diffs(items) {   /* where this iPad and the profile differ, by row */
      var rows = {};
      Object.keys(items).forEach(function (k) {
        if (!synced(k)) return;
        var mine = raw(k), theirs = items[k].v;
        if (k === PLAYS) { var a = mine || {}, b = theirs || {}, n = 0; Object.keys(b).forEach(function (p) { if (!a[p] || a[p].p !== b[p].p || !!a[p].done !== !!b[p].done) n++; }); if (n) rows.plays = n + (n === 1 ? " RESUME POINT DIFFERS" : " RESUME POINTS DIFFER"); return; }
        if (mine !== null && !same(mine, theirs)) rows[KEY[k]] = "DIFFERENT";
      });
      return Object.keys(rows).map(function (r) { return (r === "plays" ? "AUDIO" : LABEL[r].split(/,| and /)[0].toUpperCase()) + " · " + rows[r]; });
    }
    function union(k, mine, theirs) {   /* MERGE: lists from both iPads */
      if (k === "tos.holo.v1") {
        var out = JSON.parse(JSON.stringify(theirs || {})), have = {}; out.chans = out.chans || [];
        var top = out.chans.reduce(function (m, c) { have[c.dir] = 1; return Math.max(m, c.id || 0); }, 0);
        ((mine && mine.chans) || []).forEach(function (c) { if (!have[c.dir]) { var x = JSON.parse(JSON.stringify(c)); x.id = ++top; out.chans.push(x); have[c.dir] = 1; } });
        if (!out.ads && mine && mine.ads) out.ads = mine.ads;
        return out;
      }
      if (k === "tos.scilm.v1") {
        var o2 = JSON.parse(JSON.stringify(theirs || {})), seen = {}; o2.list = o2.list || [];
        o2.list.forEach(function (l) { seen[(l.name || "") + "|" + l.lat + "|" + l.lon] = 1; });
        ((mine && mine.list) || []).forEach(function (l) { if (!seen[(l.name || "") + "|" + l.lat + "|" + l.lon]) o2.list.push(l); });
        return o2;
      }
      if (Array.isArray(mine) && Array.isArray(theirs)) return theirs.concat(mine.filter(function (x) { return !theirs.some(function (y) { return same(x, y); }); }));
      return theirs;
    }
    function join(pick) {
      var items = (X.join && X.join.items) || {}, now = Date.now(), changed = [];
      if (pick === "mine") markAll(now);
      else Object.keys(items).forEach(function (k) {
        if (!synced(k)) return;
        var r = items[k], mine = raw(k);
        if (k === PLAYS) { mergePlays(r); M.sent[PLAYS] = 0; M.at[PLAYS] = now; return; }   /* and send this iPad's places up */
        if (pick === "merge" && mine !== null && (k === "tos.holo.v1" || k === "tos.scilm.v1" || UNION.indexOf(k) > -1)) {
          var u = union(k, mine, r.v);
          if (!same(u, mine)) { put(k, u, now, me()); changed.push(k); }
          M.at[k] = now; M.sent[k] = 0;   /* the combined list goes up */
          return;
        }
        if (pick === "cloud" || mine === null || (r.at || 0) > (M.at[k] || 0)) { if (!same(mine, r.v)) changed.push(k); put(k, r.v, r.at, r.by); }
        else { M.at[k] = M.at[k] || now; M.sent[k] = 0; }   /* this iPad's newer change goes up */
      });
      Object.keys(KEY).forEach(function (k) { if (synced(k) && !items[k] && raw(k) !== null) { M.at[k] = M.at[k] || now; M.sent[k] = 0; } });   /* only here: goes up */
      M.on = true; M.paused = false; X.join = null; save();
      X.from = Object.keys(items).map(function (k) { return items[k].by; }).filter(Boolean)[0] || "";
      return sync(true).then(function () { if (changed.length) { X.pending = true; reloadWhenSafe(true); } toast(changed.length ? "Profile sync is on. Reloading with " + (X.from || "the other iPad") + "'s settings" : "Profile sync is on"); paint(); });
    }
    function turnOn() {
      if (!me()) { toast("Name this iPad first: HUB or MOBILE"); return; }
      if (!can()) { toast("Profile sync needs bridge 1.36"); return; }
      X.busy = true; X.err = ""; paint();
      api({ action: "profile" }).then(function (j) {
        X.busy = false;
        var items = j.items || {};
        if (!Object.keys(items).length) { M.on = true; M.paused = false; markAll(); save(); sync().then(function () { toast("Profile sync is on. " + me() + "'s settings are the profile now"); paint(); }); return; }
        var d = diffs(items);
        if (!d.length) { X.join = { items: items }; join("merge"); return; }
        X.join = { items: items, diff: d, pick: "merge" }; paint();
      }, function (e) { X.busy = false; X.err = describe(e); paint(); });
    }
    /* ---- SYSTEMS → PROFILE SYNC ---- */
    function ago(ms) { if (!ms) return ""; var m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "JUST NOW" : m < 60 ? m + " MIN AGO" : new Date(ms).toDateString() === new Date().toDateString() ? "TODAY " + hm(new Date(ms)) : stamp(ms).toUpperCase(); }
    function rowMeta(r) {
      if (M.off[r[0]]) return { t: "STAYS ON THIS IPAD", warn: true };
      var at = 0, by = "";
      r[2].forEach(function (k) { if ((M.at[k] || 0) > at) { at = M.at[k]; by = M.by[k] || ""; } });
      return { t: at ? (by ? by + " · " : "") + ago(at) : "NOT SET ON THIS IPAD", warn: false };
    }
    function section() {
      var st = !M.on ? "off" : M.paused ? "paused" : X.busy ? "busy" : X.err ? "err" : "ok";
      var big = { off: "OFF", paused: "PAUSED ON THIS IPAD", busy: "SYNCING…", err: "COULDN'T SYNC", ok: "IN SYNC" }[st];
      var line = st === "off" ? (can() ? "Hub and Mobile keep the same settings, through your Google bridge. Name this iPad, then turn it on." : "Needs bridge 1.36 (SYSTEMS → BRIDGE shows what's new).")
        : st === "paused" ? "Changes here stay here until you resume; nothing from the other iPad comes in."
        : st === "err" ? X.err : st === "busy" ? "Sending and fetching changes." : "Last synced " + (M.last ? hm(new Date(M.last)) : "–") + " · checks again when you open Bridge or come back to it";
      var h = '<section id="sec-sync">' + phead("PROFILE SYNC", "YOUR GOOGLE BRIDGE'S PRIVATE STORAGE", "chrome-c") +
        '<div class="pf-status"><span class="pf-dot ' + st + '"></span><span class="pf-st"><b>' + big + "</b><small>" + esc(line) + "</small></span><span class=\"pf-acts\">" +
        (M.on ? '<button type="button" class="btn sm" data-pf="sync"' + (M.paused || X.busy ? " disabled" : "") + '>SYNC NOW</button><button type="button" class="btn sm ghost" data-pf="pause" aria-pressed="' + M.paused + '">' + (M.paused ? "RESUME" : "PAUSE ON THIS IPAD") + "</button>"
          : '<button type="button" class="btn sm" data-pf="on"' + (can() && me() && !X.busy ? "" : " disabled") + ">TURN ON</button>") + "</span></div>" +
        '<div class="pf-name"><span class="ov-sub">THIS IPAD IS</span>' + ["HUB", "MOBILE"].map(function (n) { return '<button type="button" class="chip sm" data-pfname="' + n + '" aria-pressed="' + (M.name === n) + '">' + n + "</button>"; }).join("") +
        '<small class="muted">Shown beside each change, and on the top bar.</small></div>';
      if (M.on) h += '<div class="pf-groups">' + PROF_GROUPS.map(function (g) {
        var rows = g[1], on = rows.filter(function (r) { return !M.off[r[0]]; }).length;
        return '<div class="pf-group"><div class="pf-gh"><b>' + g[0] + "</b><small>" + (on === rows.length ? "ALL SYNCED" : on + " OF " + rows.length + " SYNCED") + "</small></div>" + rows.map(function (r) {
          var m = rowMeta(r), onr = !M.off[r[0]];
          return '<div class="pf-row"><button type="button" class="pf-sw" role="switch" data-pfrow="' + r[0] + '" aria-checked="' + onr + '" aria-label="' + esc(r[1]) + (onr ? ": synced" : ": this iPad only") + '"><i></i></button><span><span>' + esc(r[1]) + '</span><small class="' + (m.warn ? "pf-here" : "") + '">' + esc(m.t) + "</small></span></div>";
        }).join("") + "</div>";
      }).join("") + "</div>";
      h += '<div class="pf-notes"><div class="pf-note"><b>STAYS ON THIS IPAD</b><span>Keys and tokens (Google bridge, NAS relay, Home Assistant) · AI switches · Log and session drafts · unsent saves · measured lengths and other caches</span><small class="muted">Set up a new iPad from a backup.</small></div>' +
        '<div class="pf-note"><b>IN NOTION</b><span>ENGINEERING upkeep lives in the Upkeep database' + (canUpkeep() ? "" : " once the bridge is 1.36") + ". Check one off in ENGINEERING or in Notion; both iPads see it.</span></div></div>";
      if (X.join) h += joinHtml();
      return h + "</section>";
    }
    function joinHtml() {
      var J = X.join, from = Object.keys(J.items).map(function (k) { return J.items[k].by; }).filter(Boolean)[0] || "Your other iPad";
      var O = [["merge", "MERGE (RECOMMENDED)", "Item by item, the newer change wins. Lists combine: channels, landmarks, ignored events from both iPads. Resume points keep the latest of each."],
        ["cloud", "USE " + from.toUpperCase() + "'S", "This iPad takes " + from + "'s profile. Its own differences are replaced."],
        ["mine", "USE THIS IPAD'S", "This iPad's settings replace the profile. " + from + " picks them up the next time it opens."]];
      return '<div class="pf-modal"><div class="pf-win" role="dialog" aria-modal="true" aria-labelledby="pfJoinT">' + phead('<span id="pfJoinT">' + esc((me() || "THIS IPAD") + " JOINS PROFILE SYNC") + "</span>", "", "chrome-c") +
        "<p>" + esc(from) + " already keeps its profile in your Google bridge. This iPad has settings of its own, and they differ in places:</p>" +
        '<div class="pf-diffs">' + J.diff.map(function (d) { return "<span>" + esc(d) + "</span>"; }).join("") + "</div>" +
        '<div class="pf-opts" role="radiogroup" aria-label="Which settings to keep">' + O.map(function (o) {
          return '<button type="button" class="pf-opt" role="radio" data-pfpick="' + o[0] + '" aria-checked="' + (J.pick === o[0]) + '"><i></i><span><b>' + esc(o[1]) + "</b><small>" + esc(o[2]) + "</small></span></button>";
        }).join("") + "</div>" + '<p class="muted">Keys, AI switches and drafts are never part of this. You can pause sync on either iPad later.</p>' +
        '<div class="btnrow pf-end"><button type="button" class="btn ghost" data-pf="joincancel">NOT NOW</button><button type="button" class="btn" data-pf="join">' + esc(J.pick === "merge" ? "MERGE AND SYNC" : J.pick === "cloud" ? "USE " + from.toUpperCase() + "'S AND SYNC" : "USE THIS IPAD'S AND SYNC") + "</button></div></div></div>";
    }
    function paint() { var el = $("sec-sync"); if (el && state.screen === "systems") el.outerHTML = section(); topbar(); }   /* only this section: nothing being typed elsewhere in SYSTEMS is lost */
    function topbar() { var t = document.querySelector(".topbar > span"); if (!t) return; var base = t.textContent.replace(/ · (HUB|MOBILE)$/, ""); t.textContent = base + (M.name ? " · " + M.name : ""); }
    function click(b) {
      var d = b.dataset;
      if (d.pfname) { M.name = d.pfname; save(); topbar(); paint(); return true; }
      if (d.pfrow) { M.off[d.pfrow] = !M.off[d.pfrow]; if (!M.off[d.pfrow]) delete M.off[d.pfrow]; save(); paint(); if (!M.off[d.pfrow]) sync(); return true; }
      if (d.pfpick && X.join) { X.join.pick = d.pfpick; paint(); return true; }
      if (!d.pf) return false;
      if (d.pf === "on") turnOn();
      else if (d.pf === "sync") sync(true);
      else if (d.pf === "pause") { M.paused = !M.paused; save(); if (!M.paused) sync(); paint(); }
      else if (d.pf === "join" && X.join) join(X.join.pick);
      else if (d.pf === "joincancel") { X.join = null; paint(); }
      return true;
    }
    /* when to sync: on opening (once the bridge has answered), on coming back, every 5 minutes while open */
    function kick() { if (live()) sync().then(reloadWhenSafe); }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { kick(); setTimeout(reloadWhenSafe, 1500); }
      else if (live() && X.t) sync();   /* leaving with a change not yet sent: send it now, for the other iPad */
    });
    setInterval(function () { if (!document.hidden) { if (live() && Date.now() - (M.last || 0) > 5 * 60000) sync(); reloadWhenSafe(); } }, 15000);
    setTimeout(function () {
      topbar();
      try { var msg = sessionStorage.getItem("tos.profmsg"); if (msg) { sessionStorage.removeItem("tos.profmsg"); toast(msg); } } catch (e) { /* fine */ }
    }, 400);
    return { section: section, click: click, kick: kick, me: me, sync: sync, on: function () { return M.on; } };
  })();

  /* Recent bridge requests: how long each took and how it ended. */
  /* REFRESH NOW spins until every request it set off (and any retries) has finished, then says so. */
  var refreshing = false, refreshTimer = null, refreshDone = false;
  /* ---------- NEEDS YOU: Condition items that are fixed here, each with its steps ---------- */
  /* The Bridge's condition sends three kinds of trouble to Systems (task list, sync, captures).
     Each gets a card at the top: what happened, what to do, a button that does the first step,
     and a jump to the section below with the details. A right-edge tab brings you back. */
  function fixSteps(code, retry) {
    if (code === "unauthorized") return ["In Apps Script, run <b>setup</b> and copy the access key from the log.", "Here, tap <b>UNLINK</b> under CONNECTION, then link again with that key."];
    if (code === "notion_not_shared") return ["In Notion, open the Master Task List, tap <b>•••</b> → <b>Connections</b>, and add <b>TimothyOS</b>.", "Come back and tap <b>" + retry + "</b>."];
    if (code === "notion_unauthorized" || code === "notion_not_configured") return ["In Apps Script: <b>Project Settings → Script Properties</b>. Check <b>NOTION_TOKEN</b> is there and current.", "Tap <b>" + retry + "</b>."];
    if (code === "unknown_action" || /^http_(40[0-3]|405)$/.test(code || "")) return ["The bridge is out of date or its deployment changed. Paste the latest Code.gs, run <b>setup</b>, then <b>Deploy → New version</b> (README: Updating the Google bridge).", "Tap <b>" + retry + "</b>."];
    if (code === "offline") return ["Check the iPad's Wi-Fi.", "Tap <b>" + retry + "</b> once you're back online."];
    return ["Tap <b>" + retry + "</b>. Most of these clear on the next try.", "Still failing? Google or Notion is slow. Wait a few minutes; TimothyOS also retries on its own.", "Failing for an hour or more? Open <b>script.google.com → Executions</b> and look for red errors."];
  }
  /* ---------- Bridge version check (2.38) ---------- */
  /* The app updates itself; the Google bridge changes only when Timothy pastes the code, runs setup and deploys a
     new version (the step that's easy to miss). BRIDGE_WANT is the bridge this app was built with (a test keeps it
     equal to Code.gs's VERSION). An older bridge puts a YELLOW item in Condition, a NEEDS YOU card in Systems naming
     what's missing with the steps, and errors an old bridge causes say so. A newer bridge is fine. */
  var BRIDGE_WANT = "1.48.1";
  var BRIDGE_FEATURES = [["1.48.1", "ON THIS DAY reads your tasks and tarot (1.48.0's filters were refused by Notion)"], ["1.48.0", "ON THIS DAY on the Bridge"], ["1.47.1", "SICKBAY: the STAND ring counts the hours you stood in, as Apple does"], ["1.47.0", "SICKBAY: when each day arrived and caught up; LEDGER: take an item off the queue"], ["1.46.0", "MEALS: recipe photos kept small with the meal, and Claude told to treat your data as data"], ["1.45.0", "the Health shortcut can check what it sends, and says why a line was left out"], ["1.44.1", "SICKBAY: health days always land on the right date, and a partial day never overwrites a whole one"], ["1.44.0", "MEALS: a photo for a meal you typed in"], ["1.43.1", "the Health shortcut's notification always says what happened"], ["1.43.0", "SICKBAY: health from your watch, medicines, readings and notes"], ["1.42.0", "the Family calendar"], ["1.41.1", "clearer Drive setup messages for the export"], ["1.41.0", "the weekly Notion export, and ASK seeing your breaks"], ["1.40.0", "recipes from a link, text or photo, and COOK"], ["1.39.0", "MEALS"], ["1.38.0", "reads without the access key in the address"], ["1.37.0", "headlines, and hives mentioned only when a check is due"], ["1.36.1", "emoji kept whole in long text sent to Notion"], ["1.36.0", "profile sync between your iPads, and Upkeep in Notion"], ["1.35.0", "LOG session notes"], ["1.34.0", "SCIENCE and the Science Log"], ["1.33.0", "CAPTURE → NOTE and the INBOX"], ["1.32.0", "ASTROMETRICS tasks and queue, and the Ship's Year"], ["1.31.0", "the Notion column check"], ["1.30.0", "the AI voice (Nova)"], ["1.29.0", "the Morning Briefing"], ["1.28.0", "APIARY TRUE UP STACK"], ["1.27.0", "ASK's corrected tools"],
    ["1.26.0", "APIARY"], ["1.25.0", "the tarot books"], ["1.24.0", "TAROT"], ["1.23.0", "holidays"], ["1.22.0", "the Growth calendar"], ["1.20.0", "Log Ask"],
    ["1.17.0", "the authorization code"], ["1.16.0", "Log search"], ["1.14.0", "HABITS and LIBRARY"], ["1.10.0", "the Captain's Log"], ["1.9.0", "LEDGER"], ["1.8.0", "the farm calendar"]];
  var BRIDGE_CODE_URL = "https://raw.githubusercontent.com/tim3t/Timothyos/main/apps-script/Code.gs";
  function verCmp(a, b) {
    var x = String(a || "0").split(".").map(Number), y = String(b || "0").split(".").map(Number);
    for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  function bridgeBehind() { return !!(state.conn && state.bridgeVersion && verCmp(state.bridgeVersion, BRIDGE_WANT) < 0); }
  function bridgeMissing() { return BRIDGE_FEATURES.filter(function (f) { return verCmp(state.bridgeVersion, f[0]) < 0; }).map(function (f) { return f[1]; }); }
  function bridgeNote() { return bridgeBehind() ? " The Google bridge is " + state.bridgeVersion + "; this app needs " + BRIDGE_WANT + ": SYSTEMS → NEEDS YOU has the steps." : ""; }
  function fixBridge() {
    fixRun("bridge", function () {
      refresh(true);
      return new Promise(function (res) { var n = 0, t = setInterval(function () { if (++n > 120 || (state.sync.status !== "syncing" && state.sync.status !== "retrying")) { clearInterval(t); res(); } }, 250); });
    }, "Google bridge " + BRIDGE_WANT + " found. Up to date");
  }
  /* ---------- Notion schema check (2.39, bridge 1.31) ---------- */
  /* The bridge reads every connected database's columns (read-only) against the ones it uses. A renamed column or a
     changed type is a YELLOW Condition item and a NEEDS YOU card naming each one; SYSTEMS → NOTION lists them too.
     Checked at most every six hours (the bridge caches it), and at once by CHECK AGAIN. */
  var LS_SCHEMA = "tos.schema.v1", SCHEMA_MS = 6 * 3600000;
  var SCHEMA_TYPE = { title: "title", rich_text: "text", select: "select", date: "date", number: "number", checkbox: "checkbox", url: "URL", relation: "relation" };
  var sch = { d: lsGet(LS_SCHEMA), inflight: false, err: null };
  function canSchema() { return state.caps.indexOf("schema") > -1; }
  function loadSchema(force) {
    if (!state.conn || !canSchema() || sch.inflight) return Promise.resolve();
    if (!force && sch.d && Date.now() - sch.d.fetched < SCHEMA_MS) return Promise.resolve();
    sch.inflight = true;
    return api({ action: "schema", fresh: force ? 1 : 0 }).then(function (j) {
      sch.d = { fetched: Date.now(), at: j.at, dbs: j.dbs || [] }; sch.err = null; lsSet(LS_SCHEMA, sch.d);
    }).catch(function (err) { sch.err = describe(err); }).then(function () {
      sch.inflight = false;
      if (state.screen === "systems" || state.screen === "bridge") render(true);
    });
  }
  /* ---------- Weekly Notion export (2.65, bridge 1.41) ---------- */
  /* The bridge copies every connected database (page text too) to Google Drive each Sunday; this only shows how that went
     and starts one on EXPORT NOW. Status from "exportstatus" (cheap: Script Properties), every 3 hours, and every 20 s
     on SYSTEMS while one runs. Kept as a cache (backup LEFT_OUT). */
  var LS_EXPORT = "tos.export.v1", EXPORT_MS = 3 * 3600000, EXPORT_OLD_DAYS = 9;
  var exs = { d: lsGet(LS_EXPORT), inflight: false, err: null, poll: 0, seq: 0 };
  function canExport() { return state.caps.indexOf("export") > -1; }
  function loadExport(force) {
    if (!state.conn || !canExport() || exs.inflight) return Promise.resolve();
    if (!force && exs.d && Date.now() - exs.d.fetched < EXPORT_MS) return Promise.resolve();
    exs.inflight = true;
    var seq = exs.seq;   /* EXPORT NOW's answer is newer than a read already on its way: that read is dropped */
    return api({ action: "exportstatus" }).then(function (j) { if (seq !== exs.seq) return; exs.d = { fetched: Date.now(), st: j.export || null }; exs.err = null; lsSet(LS_EXPORT, exs.d); })
      .catch(function (err) { exs.err = describe(err); }).then(function () {
        exs.inflight = false;
        if (state.screen === "systems" || state.screen === "bridge") render(true);
        exportPoll();
      });
  }
  function exportPoll() {   /* while a run goes on and SYSTEMS is open, look again every 20 s */
    clearTimeout(exs.poll);
    var st = exs.d && exs.d.st;
    if (st && st.running && !st.running.stalled && state.screen === "systems") exs.poll = setTimeout(function () { if (state.screen === "systems") loadExport(true); }, 20000);
  }
  function exportAge(st) { var l = st && st.last; return l && l.ok ? Math.floor((Date.now() - Date.parse(l.done)) / 864e5) : null; }
  var EXPORT_ERR = { drive_api_off: "The Drive API is switched off for the bridge: in the script editor, Services (+) → Drive API → Add, then run setup (README → Weekly Notion export).", drive_scope: "The bridge has no Drive access yet: add the oauthScopes block to appsscript.json, then run setup and allow access (README → Weekly Notion export).", drive_full: "Google Drive is full. Free some space, then EXPORT NOW.", drive_error: "Google Drive refused the files. EXPORT NOW tries again.", notion_not_configured: "Notion isn't connected to the bridge." };
  function exportErrText(code) { return EXPORT_ERR[code] || "Stopped: " + code + ". EXPORT NOW tries again."; }
  function exportCondition() {
    var st = canExport() && exs.d && exs.d.st, l = st && st.last;
    if (!l || st.running) return null;
    if (!l.ok) return { lvl: "warn", ic: "▲", txt: "Notion export failed", sub: l.error === "drive_scope" || l.error === "drive_api_off" ? "The bridge needs Drive access. SYSTEMS → NOTION has the steps." : l.error === "drive_full" ? "Google Drive is full." : "Stopped: " + esc(l.error) + ".", act: "systems", go: "SYSTEMS" };
    var age = exportAge(st);
    return st.weekly && age > EXPORT_OLD_DAYS ? { lvl: "warn", ic: "▲", txt: "Notion export is " + age + " days old", sub: "The weekly copy to Google Drive hasn't run. SYSTEMS → NOTION → EXPORT NOW.", act: "systems", go: "SYSTEMS" } : null;
  }
  function kbmb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function exportRowHtml() {
    if (!canExport()) return '<div class="calrow a-farm" style="opacity:.6"><span class="st"></span><span><b>Weekly export</b><small>Needs the Google bridge updated to ' + BRIDGE_WANT + '.</small></span><span class="pill">SETUP</span></div>';
    var st = exs.d && exs.d.st, l = st && st.last, r = st && st.running, age = exportAge(st), txt, pill;
    if (!exs.d || Date.now() - exs.d.fetched > EXPORT_MS) setTimeout(function () { loadExport(false); }, 0);
    if (!st) { txt = exs.err ? esc(exs.err) : "Checking…"; pill = '">…'; }
    else if (r) { txt = (r.stalled ? "Stalled at " : "Exporting · ") + r.n + " of " + r.of + " · " + esc(r.db) + " · " + r.pages + " pages so far" + (r.stalled ? ". EXPORT NOW wakes it." : ". A few minutes; it carries on with the iPad asleep."); pill = r.stalled ? ' warn">STALLED' : ' ok">RUNNING'; }
    else if (l && !l.ok) { txt = '<span class="errtxt">' + esc(exportErrText(l.error)) + "</span>"; pill = ' bad">' + (l.error === "drive_scope" || l.error === "drive_api_off" ? "SETUP" : "FAILED"); }
    else if (l) {
      txt = (st.weekly ? "Sundays about 03:00 to Google Drive · " : "Not scheduled: run setup in the script editor once · ") + "last " + esc(stamp(Date.parse(l.done))) + " · " + l.pages + " pages from " + l.dbs + " databases · " + kbmb(l.bytes) + " · newest " + st.keep + " kept" +
        (l.failed && l.failed.length ? '<br><span class="errtxt">Left out: ' + esc(l.failed.join(", ")) + "</span>" : "");
      pill = age > EXPORT_OLD_DAYS || !st.weekly ? ' warn">' + (st.weekly ? "OLD" : "NOT SCHEDULED") : ' ok">OK';
    } else { txt = st.weekly ? "Sundays about 03:00 to Google Drive. No export yet: EXPORT NOW makes the first." : "Not scheduled: run setup in the script editor once (README → Weekly Notion export)."; pill = '">NONE'; }
    var root = l && l.ok && l.root;
    return '<div class="calrow a-farm"><span class="st"></span><span><b>Weekly export</b><small>' + txt + '</small></span><span class="pill' + pill + "</span></div>" +
      '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn sm ghost" data-act="exportnow"' + (r && !r.stalled ? " disabled" : "") + ">EXPORT NOW</button>" +
      (root ? '<a class="btn sm ghost" href="https://drive.google.com/drive/folders/' + encodeURIComponent(root) + '" target="_blank" rel="noopener">OPEN IN DRIVE</a>' : "") + "</div>";
  }
  function exportNow() {
    toast("Starting the Notion export…");
    exs.seq++;
    apiPost({ action: "exportnow" }).then(function (j) {
      exs.seq++;
      exs.d = { fetched: Date.now(), st: j.export || (exs.d && exs.d.st) }; lsSet(LS_EXPORT, exs.d);
      toast(j.export && j.export.running && j.export.running.n > 1 ? "The export is already running" : "Export starting. It copies to Google Drive over a few minutes");
      render(true); exportPoll();
    }, function (err) {
      var code = err && err.code;
      if (EXPORT_ERR[code]) { exs.d = { fetched: Date.now(), st: Object.assign({}, exs.d && exs.d.st, { last: { ok: false, error: code } }) }; lsSet(LS_EXPORT, exs.d); }
      toast(EXPORT_ERR[code] ? "Not started: " + exportErrText(code) : "Not started: " + describe(err));
      render(true);
    });
  }
  function schemaProblems() { return canSchema() && sch.d ? sch.d.dbs.filter(function (d) { return !d.error && ((d.missing || []).length || (d.wrong || []).length); }) : []; }
  function schemaLines(d) {
    var t = function (x) { return SCHEMA_TYPE[x] || x; };
    return (d.missing || []).map(function (m) { return "\u201c" + m.name + "\u201d (" + t(m.type) + ") not found"; })
      .concat((d.wrong || []).map(function (w) { return "\u201c" + w.name + "\u201d is " + t(w.got) + ", needs " + t(w.want); }));
  }
  function schemaText(list, max) {
    var out = [];
    list.forEach(function (d) { schemaLines(d).forEach(function (l) { out.push(d.name + ": " + l); }); });
    return max && out.length > max ? out.slice(0, max).concat(["and " + (out.length - max) + " more"]) : out;
  }
  /* 2.78: DIAGNOSTICS. One plain-text report to paste into a conversation with Claude, in place of screenshots:
     versions, the connection, Condition, what is waiting to be sent, storage, the links that are set, and the error
     log. Never in it: keys, tokens, PINs, the bridge's or the relay's address, task, event, meal or page titles, health
     values, Log text. Condition items go by their headline only (their second line can name a task or an event).
     Everything passes errScrub once more on the way out. */
  function diagReport() {
    var now = new Date(), c = state.conn, st = state.sync, day = lsGet(LS_NETDAY), u = lsUsage(), P = lsGet(LS_PROFILE) || {};
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* older Safari */ }
    var cond = []; try { cond = conditions(now, ymd(now), eventsFor(bridgeRange())); } catch (e) { cond = []; }
    var shell = (caches && caches.keys ? caches.keys() : Promise.resolve([])).then(function (k) { return k.filter(function (x) { return /^tos-shell-/.test(x); }).map(function (x) { return x.slice(10); }); }, function () { return []; });
    return shell.then(function (sw) {
      var L = ["TimothyOS DIAGNOSTICS · " + now.toISOString().replace("T", " ").slice(0, 19) + " UTC · " + ymd(now) + " " + hm(now) + " here" + (tz ? " (" + tz + ")" : ""),
        "APP " + VERSION + " · offline copy " + (sw.length ? sw.join(", ") : "none") + " · " + (standalone ? "home-screen app" : "in the browser") + " · " + (navigator.onLine ? "online" : "OFFLINE") + " · open now: " + String(state.screen || "").toUpperCase(),
        "DEVICE " + navigator.userAgent + " · screen " + innerWidth + "×" + innerHeight,
        "BRIDGE " + (!c ? "not linked" : "deployed " + (state.bridgeVersion || "unknown") + " · this app needs " + BRIDGE_WANT + (bridgeBehind() ? " (OUT OF DATE)" : " (up to date)")),
        "FEATURES " + (state.caps && state.caps.length ? state.caps.join(", ") : "none reported"),
        "SYNC " + (st.status || "unknown") + " · last " + (st.at ? stamp(st.at) : "never") + (st.code ? " · code " + st.code : "") + (st.error ? " · " + st.error : ""),
        "BRIDGE TODAY " + (day && day.d === ymd(now) ? day.n + " requests, " + day.f + " failed, slowest " + (day.max / 1000).toFixed(1) + " s" : "no requests yet"),
        "CONDITION " + (cond.length ? cond.length + ": " + cond.map(function (i) { return "[" + (i.lvl === "bad" ? "RED" : "YELLOW") + "] " + String(i.txt).replace(/<[^>]*>/g, ""); }).join(" · ") : "green"),
        "WAITING TO SEND " + (bkPendingList().join(", ") || "nothing"),
        "ON THIS DAY " + otdDiag(),
        "STORAGE " + storeMb(u.total) + " of about 5 MB · kept here " + storeMb(u.own) + " · saved copies " + storeMb(u.copies) + (lsFull().length ? " · NOT SAVED: " + lsFull().map(lsName).join(", ") : "") +
          (Object.keys(store.skipped).length ? " · no room to keep: " + Object.keys(store.skipped).map(lsName).join(", ") : "") + (store.dropped ? " · room made " + store.dropped + "×" : ""),
        "PROFILE SYNC " + (P.on ? "on" + (P.paused ? ", PAUSED" : "") + " · this iPad: " + (P.name || "unnamed") + " · last " + (P.last ? stamp(P.last) : "never") : "off"),
        "LINKS NAS relay " + (nasConf() ? "set" : "not set") + " · Home Assistant " + (haConf() ? "set" : "not set") + " · pinned " + ((lsGet(LS_PINS) || []).join(", ") || "none"),
        "", "ERRORS " + (errlog.length ? errlog.length + " kept, newest first" + (errlog.length > 40 ? " (the 40 newest)" : "") : "none logged")];
      return L.concat(errReport().split("\n").slice(4, 44)).map(errScrubLine).join("\n");
    });
  }
  function errScrubLine(x) { return String(x).replace(/([?&#](?:k|key|pin|token|code|auth)=)[^&\s"']+/gi, "$1•••").replace(/(Bearer\s+)\S+/gi, "$1•••").replace(/[A-Za-z0-9_\-]{32,}/g, "•••").replace(/https?:\/\/[^\s"'<>]+/g, "(an address)"); }
  function diagSection() {
    return '<section id="sec-diag">' + phead("DIAGNOSTICS", "FOR CLAUDE") +
      '<small class="muted">One report to paste into a conversation with Claude when something isn\'t right: versions, the connection, Condition, what is waiting to be sent, storage, and the error log. No keys, no addresses, no titles of tasks, events or meals, no health values.</small>' +
      '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn" data-act="diagcopy">COPY DIAGNOSTICS</button>' +
      (navigator.share ? '<button type="button" class="btn ghost" data-act="diagshare">SHARE</button>' : "") + "</div></section>";
  }
  function diagCopy(share) {
    diagReport().then(function (text) {
      if (share && navigator.share) { navigator.share({ title: "TimothyOS diagnostics", text: text }).catch(function () { /* closed: nothing to do */ }); return; }
      var ok = function () { toast("Diagnostics copied. Paste them into your message to Claude."); }, no = function () { toast("Couldn't copy. Try SHARE instead."); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, no); else no(); } catch (e) { no(); }
    });
  }

  /* 2.77: what this browser's storage holds, and making room in it. */
  function storeMb(n) { var mb = n * 2 / 1048576; return (mb < 0.1 ? mb.toFixed(2) : mb.toFixed(1)) + " MB"; }
  function storeSection() {
    var u = lsUsage(), full = lsFull(), skipped = Object.keys(store.skipped);
    var h = '<section id="sec-store">' + phead("THIS IPAD'S STORAGE", full.length ? "FULL · " + full.length + " NOT SAVED" : storeMb(u.total) + " USED", full.length ? "bad" : "") +
      '<small class="muted">Bridge keeps its settings, changes on their way, and saved copies of your data in this browser, which allows about 5 MB. When something doesn\'t fit, saved copies are dropped to make room (the next sync brings them back); if that isn\'t enough, the Bridge\'s Condition says so.</small>' +
      '<dl class="kv" style="margin-top:10px"><dt>IN USE</dt><dd class="tnum">' + storeMb(u.total) + " of about 5 MB</dd>" +
      '<dt>KEPT ONLY HERE</dt><dd class="tnum">' + storeMb(u.own) + ' <span class="muted">settings, changes on their way, things in a backup</span></dd>' +
      '<dt>SAVED COPIES</dt><dd class="tnum">' + storeMb(u.copies) + ' <span class="muted">refilled by a sync, or measured again</span></dd>' +
      "<dt>LARGEST</dt><dd>" + (u.items.slice(0, 4).map(function (x) { return esc(lsName(x.k)) + ' <span class="muted tnum">' + storeMb(x.n) + (x.copy ? ", a copy" : "") + "</span>"; }).join(" · ") || '<span class="muted">Nothing yet</span>') + "</dd></dl>";
    if (full.length) h += '<div class="err">Not saved on this iPad yet: ' + esc(full.map(lsName).join(", ")) + ". Held in memory while Bridge stays open, and tried again every 30 seconds.</div>";
    else if (store.dropped) h += '<small class="muted">Room was made at ' + esc(stamp(store.droppedAt)) + " by dropping " + store.dropped + (store.dropped === 1 ? " saved copy" : " saved copies") + ". Nothing was lost.</small>";
    if (skipped.length && !full.length) h += '<small class="muted">No room to keep a copy of: ' + esc(skipped.map(lsName).join(", ")) + ". It shows as usual while you are online.</small>";
    return h + '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="storeclear"' + (u.copies ? "" : " disabled") + ">CLEAR SAVED COPIES</button></div></section>";
  }
  function storeClear(quiet) {
    LS_COPIES.concat(LS_REMADE).forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } });
    var ok = lsRetry();
    if (!quiet) toast(ok ? "Saved copies cleared. They come back as each station syncs." : "Cleared, but there still isn't room for everything.");
    render(true);
    return ok;
  }
  function fixStore() { fixRun("store", function () { storeClear(true); }, "Room made: everything is saved on this iPad"); }
  function fixSchema() { fixRun("schema", function () { return loadSchema(true); }, "Notion columns checked: they all match"); }
  function fixTickets() {
    var now = new Date();
    return conditions(now, ymd(now), eventsFor(bridgeRange())).filter(function (i) { return i.fix; }).map(function (i) {
      var t = { id: i.fix, lvl: i.lvl, ic: i.ic, txt: i.txt, busy: !!state.fixBusy[i.fix] };
      if (i.fix === "tasks") { t.why = esc(state.tasksErr.msg); t.btn = ["fixtasks", "RETRY NOW"]; t.steps = fixSteps(state.tasksErr.code, "RETRY NOW"); t.sec = ["sec-notion", "NOTION"]; }
      else if (i.fix === "bridge") {
        t.why = i.sub; t.btn = ["fixbridge", "CHECK AGAIN"]; t.sec = ["sec-app", "APP"];
        t.steps = ['Open the latest code: <a href="' + BRIDGE_CODE_URL + '" target="_blank" rel="noopener">Code.gs on GitHub</a> (in Safari, aA → Request Desktop Website). Select all, copy.',
          "In <b>script.google.com → TimothyOS bridge</b>: select all the old code, delete it, paste, save.",
          "Choose <b>setup</b>, tap <b>Run</b>, approve anything Google asks. The log ends with <b>Bridge version " + BRIDGE_WANT + "</b>.",
          "<b>Deploy → Manage deployments → pencil → Version: New version → Deploy.</b> The step that's easy to miss: without it the old version keeps answering.",
          "Come back and tap <b>CHECK AGAIN</b>."];
      }
      else if (i.fix === "schema") {
        t.why = schemaText(schemaProblems()).map(esc).join("<br>"); t.btn = ["fixschema", "CHECK AGAIN"]; t.sec = ["sec-notion", "NOTION"];
        t.steps = ["In Notion, open the database named above (the bridge reads its columns, it never changes them).",
          "Rename each column back to exactly the name shown (capitals, spaces and brackets count), or set its type back: the column's menu → <b>Edit property</b> → <b>Type</b>.",
          "Renamed it on purpose? Tell Claude the new name, so the bridge can follow it.",
          "Come back and tap <b>CHECK AGAIN</b>."];
      }
      else if (i.fix === "store") {
        t.why = "Not saved on this iPad yet: " + esc(lsFull().map(lsName).join(", ")) + ". Bridge is holding " + (lsFull().length === 1 ? "it" : "them") + " in memory: changes still go to Notion and Google, but closing or reloading Bridge now would lose what isn't saved here.";
        t.btn = ["fixstore", "MAKE ROOM AND SAVE"]; t.sec = ["sec-store", "THIS IPAD'S STORAGE"];
        t.steps = ["Tap <b>MAKE ROOM AND SAVE</b>. It drops the saved copies of your calendars, meals and other data (the next sync brings them back) and saves what was waiting.",
          "Still red? <b>THIS IPAD'S STORAGE</b> below lists what takes the most room. Measured lengths and artwork for AUDIO and HOLODECK can go too: they are measured again as you use them.",
          "Keep Bridge open until this card says it is fixed."];
      }
      else if (i.fix === "sync") { t.why = esc(state.sync.error || "The bridge hasn't answered."); t.btn = ["fixsync", "REFRESH NOW"]; t.steps = fixSteps(state.sync.code, "REFRESH NOW"); t.sec = ["sec-conn", "CONNECTION"]; }
      else { t.why = i.sub; t.btn = ["fixqueue", "SEND NOW"]; t.sec = ["sec-capture", "CAPTURE"];
        t.steps = ["Tap <b>SEND NOW</b> to try every waiting capture again.", "A capture that still fails shows the reason under CAPTURE. Fix it there, or <b>DISCARD</b> it and capture again."]; }
      return t;
    });
  }
  function fixPanel() {
    var tk = fixTickets(), now = new Date();
    if (tk.length) state.fixSeen = true;
    if (!tk.length) {
      if (!state.fixSeen) return "";
      var left = conditions(now, ymd(now), eventsFor(bridgeRange())).length;
      return '<section class="fix ok" id="fixPanel">' + phead("NEEDS YOU", "ALL FIXED", "ok") + '<div class="fix-card ok"><div class="fix-head"><span class="ic">●</span><b>' +
        (left ? "Fixed here. " + left + (left === 1 ? " item remains" : " items remain") + " on the Bridge." : "Condition green. Nothing needs you here.") +
        '</b></div><div class="btnrow"><button type="button" class="btn" data-act="fixdone">BACK TO BRIDGE</button></div></div></section>';
    }
    var others = conditions(now, ymd(now), eventsFor(bridgeRange())).length - tk.length;
    return '<section class="fix" id="fixPanel">' + phead("NEEDS YOU", tk.length + (tk.length === 1 ? " ITEM" : " ITEMS") + " TO FIX HERE" + (others > 0 ? " · " + others + " MORE ON THE BRIDGE" : ""), tk.some(function (t) { return t.lvl === "bad"; }) ? "bad" : "warn") +
      tk.map(function (t) {
        return '<div class="fix-card ' + t.lvl + (state.fixFocus === t.id ? " focus" : "") + '" id="fix-' + t.id + '"><div class="fix-head"><span class="ic">' + t.ic + "</span><b>" + t.txt + '</b><span class="pill ' + (t.lvl === "bad" ? "bad" : "warn") + '">' + (t.lvl === "bad" ? "RED" : "YELLOW") + "</span></div>" +
          '<p class="fix-why">' + t.why + '</p><div class="ov-sub">TO RETURN TO GREEN</div><ol class="fix-steps">' + t.steps.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>" +
          '<div class="btnrow"><button type="button" class="btn' + (t.busy ? " busy" : "") + '" data-act="' + t.btn[0] + '"' + (t.busy ? ' aria-busy="true" disabled' : "") + ">" + (t.busy ? '<span class="spin" aria-hidden="true"></span>TRYING…' : t.btn[1]) + "</button>" +
          '<button type="button" class="btn ghost" data-jump="' + t.sec[0] + '">DETAILS IN ' + t.sec[1] + " ↓</button></div></div>";
      }).join("") + "</section>";
  }
  function fixRun(id, work, okMsg) {
    state.fixBusy[id] = true; render(true);
    Promise.resolve(work()).catch(function () { /* the card shows what's still wrong */ }).then(function () {
      setTimeout(function () {
        delete state.fixBusy[id];
        var still = fixTickets().some(function (t) { return t.id === id; });
        toast(still ? "Still not working. Try the next step." : okMsg);
        render(true); fixJumpPaint();
      }, 300);
    });
  }
  function fixTasks() { fixRun("tasks", function () { return loadTasks(ymd(new Date()), true); }, "Task list loaded"); }
  function fixSync() {
    fixRun("sync", function () {
      refresh(true);
      return new Promise(function (res) { var n = 0, t = setInterval(function () { if (++n > 120 || (state.sync.status !== "syncing" && state.sync.status !== "retrying")) { clearInterval(t); res(); } }, 250); });
    }, "Synced");
  }
  function fixQueue() {
    fixRun("queue", function () {
      state.queue.forEach(function (q) { if (q.failed || (q.attempts || 0) >= 2) { delete q.failed; q.attempts = 0; q.lastError = ""; } });
      saveQueue(); flushQueue(true);
      return new Promise(function (res) { var n = 0, t = setInterval(function () { if (++n > 120 || !state.flushing) { clearInterval(t); res(); } }, 250); });
    }, "Captures saved");
  }
  function fixJump(id) {
    var el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
    restartClass(el, "flash");
  }
  /* The right-edge tab: on Systems while something needs fixing and the panel is scrolled away. */
  function fixJumpPaint() {
    var b = $("fixJump");
    if (!b) return;
    var tk = state.screen === "systems" && state.conn ? fixTickets() : [], p = $("fixPanel");
    var away = p && p.getBoundingClientRect().bottom < $("content").getBoundingClientRect().top + 40;
    b.hidden = !tk.length || !away;
    if (tk.length) {
      b.className = "fix-jump " + (tk.some(function (t) { return t.lvl === "bad"; }) ? "bad" : "warn");
      b.innerHTML = '<span aria-hidden="true">▲</span>' + tk.length + (tk.length === 1 ? " NEEDS" : " NEED") + " YOU";
    }
  }

  function refreshBtn() {
    return '<button type="button" class="btn' + (refreshing ? " busy" : refreshDone ? " done" : "") + '" id="refreshBtn" data-act="refresh"' + (refreshing ? ' aria-busy="true" disabled' : "") + ">" +
      (refreshing ? '<span class="spin" aria-hidden="true"></span>REFRESHING…' : refreshDone ? "SYNCED ✓" : "REFRESH NOW") + "</button>";
  }
  function paintRefresh() { var b = $("refreshBtn"); if (b) b.outerHTML = refreshBtn(); }
  function refreshNow() {
    if (refreshing) return;
    refreshing = true; refreshDone = false;
    refresh(true);
    paintRefresh();
    clearInterval(refreshTimer);
    var ticks = 0;
    refreshTimer = setInterval(function () {
      if (++ticks < 3 || netPending > 0 || batchQ) return;   /* at least ¾ s, so a quick answer still registers */
      clearInterval(refreshTimer); refreshing = false; refreshDone = true;
      paintRefresh();
      setTimeout(function () { refreshDone = false; paintRefresh(); }, 1600);
    }, 250);
  }
  function netSection() {
    if (!state.conn || !netlog.length) return "";
    var hour = netlog.filter(function (n) { return Date.now() - n.t < 3600000; }), bad = hour.filter(function (n) { return n.r !== "ok" && !n.retried; }), again = hour.filter(function (n) { return n.retried; });
    var slow = netlog.filter(function (n) { return n.r === "ok"; }).map(function (n) { return n.ms; }).sort(function (a, b) { return a - b; });
    var median = slow.length ? (slow[Math.floor(slow.length / 2)] / 1000).toFixed(1) + " s" : "–";
    return "<section>" + phead("RECENT REQUESTS", hour.length ? hour.length + " IN THE LAST HOUR · " + (bad.length ? bad.length + " FAILED" : "NONE FAILED") + (again.length ? " · " + again.length + " RETRIED" : "") + " · TYPICAL " + median : "TYPICAL " + median) +
      '<div class="netlog tnum">' + netlog.slice(-12).reverse().map(function (n) {
        return '<span>' + hm(new Date(n.t)) + "</span><span>" + esc(String(n.a).toUpperCase()) + "</span><span>" + (n.ms / 1000).toFixed(1) + " s</span>" +
          '<span class="' + (n.r === "ok" ? "okmsg" : n.retried ? "warntxt" : "errtxt") + '">' + esc(n.r === "ok" ? "OK" : n.r.toUpperCase() + (n.retried ? " · RETRIED" : "")) + "</span>";
      }).join("") + '</div><small class="muted">RETRIED: that attempt failed and was tried again on its own; the next line for it shows how it ended. HTTP_404: Google ran the request but lost the answer on the way back, a known Google quirk. DROPPED: the connection was cut. TIMEOUT: no answer in 45 s. IN BACKGROUND: the iPad slept or switched apps mid-request. SYNC: several reads sent together as one request. Only red lines are real failures.</small></section>';
  }

