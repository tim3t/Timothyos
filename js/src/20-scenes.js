  /* ---------- SCENES (2.64, Timothy's pick: Option A's scene bar, edited in IF / THEN sentences; his ten postulates) ----------
     "I would want the scenes to function independent of the Bridge/iPad": each scene is a Home Assistant automation that
     Bridge writes through Home Assistant's config API (POST/DELETE /api/config/automation/config/<id>), so it runs with the
     iPads asleep. Timothy confirmed this new write path explicitly (2026-11-06). Bridge reads, changes, pauses and deletes
     only its own: ids that start "tos_", aliases "TimothyOS · NAME"; every other automation is never touched. A scene that
     was changed in the Home Assistant app into something the modal can't show (scnFromHa marks it foreign) can be run and
     paused, never saved over. Tap = automation.trigger with skip_condition (the THEN alone). Needs an admin token; deleting
     needs DELETE in the relay's Access-Control-Allow-Methods (README → NAS relay). Both iPads read the same list from Home
     Assistant; tos.hascenes.v1 is only this iPad's copy for drawing the bar at once (a cache). */
  var LS_HASCN = "tos.hascenes.v1", LS_HASCNCHK = "tos.hascnchk.v1";
  /* 2.66: the bar's order, as scene ids; shared by PROFILE SYNC and kept in backups. Home Assistant isn't asked to change
     anything for it. No order yet: alphabetical. A scene the order doesn't know (new, or made on the other iPad) goes last. */
  var LS_HASCNORD = "tos.hascnord.v1";
  function scnOrdered() {
    var o = lsGet(LS_HASCNORD) || [], ix = function (d) { var i = o.indexOf(d.id); return i < 0 ? 1e6 : i; };
    return eng.scn.list.slice().sort(function (a, b) { return ix(a) - ix(b) || a.name.localeCompare(b.name); });
  }
  function scnOrderOpen() { eng.sheetKind = "scnord"; eng.sheetId = null; engSheet("scn-ord", ""); scnOrderPaint(); }
  function scnOrderPaint() {
    var L = scnOrdered();
    $("detailSheet").innerHTML = '<div class="sbar"><span>SCENE ORDER</span><span>BOTH IPADS</span></div><div class="sbody"><div class="hg-edit">' + L.map(function (d, i) {
      return '<div class="scn-ordrow"><span><b>' + esc(d.name.toUpperCase()) + "</b><small>" + esc(scnLine(d)) + "</small></span>" +
        '<button type="button" class="btn sm ghost" data-scnmv="' + esc(d.id) + ',-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Move ' + esc(d.name) + ' up">▲</button>' +
        '<button type="button" class="btn sm ghost" data-scnmv="' + esc(d.id) + ',1"' + (i === L.length - 1 ? " disabled" : "") + ' aria-label="Move ' + esc(d.name) + ' down">▼</button></div>';
    }).join("") + '</div><small class="muted">The order of the SCENES bar on ENGINEERING. PROFILE SYNC shares it with your other iPad; Home Assistant isn\'t changed. New scenes go last.</small></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn" id="detailClose">DONE</button></div>';
  }
  function scnOrderClick(b) {
    if (eng.sheetKind !== "scnord" || !b.dataset.scnmv) return false;
    var m = b.dataset.scnmv.split(","), ids = scnOrdered().map(function (d) { return d.id; }), i = ids.indexOf(m[0]), j = i + Number(m[1]);
    if (i < 0 || j < 0 || j >= ids.length) return true;
    ids.splice(j, 0, ids.splice(i, 1)[0]); lsSet(LS_HASCNORD, ids);
    scnOrderPaint(); render(true);
    var mv = document.querySelector('[data-scnmv="' + m[0] + "," + m[1] + '"]:not([disabled])') || document.querySelector('[data-scnmv^="' + m[0] + ',"]:not([disabled])');
    if (mv) mv.focus();   /* keep the place for the next tap */
    return true;
  }
  var SCN_PRE = "tos_", SCN_ALIAS = "TimothyOS · ";
  var SCN_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], SCN_DAYNM = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var SCN_FADES = [[0, "AT ONCE"], [5, "5 SEC"], [60, "1 MIN"], [300, "5 MIN"], [900, "15 MIN"], [1800, "30 MIN"]];
  var SCN_WAITS = [[60, "1 MIN"], [300, "5 MIN"], [900, "15 MIN"], [1800, "30 MIN"], [3600, "1 HR"], [7200, "2 HR"]];
  eng.scn = { list: lsGet(LS_HASCN) || [], at: 0, busy: false, err: null, d: null, pick: null, orig: "", hold: 0, held: false, msg: "", chk: false };
  function scnById(id) { return eng.scn.list.filter(function (x) { return x.id === id; })[0] || null; }
  function scnOpenNow() { return eng.sheetKind === "scn" && !$("detailScrim").hidden; }
  function scnSw() { return haDevices().filter(function (d) { return devCaps(d).sw; }); }

  /* --- words --- */
  function scnDaysWord(days) {
    if (!days || !days.length || days.length === 7) return "every day";
    var k = days.join(",");
    return k === "mon,tue,wed,thu,fri" ? "weekdays" : k === "sat,sun" ? "weekends" : days.map(function (x) { return SCN_DAYNM[SCN_DAYS.indexOf(x)]; }).join(" ");
  }
  function scnSunWord(f) { return f.off ? f.ev + " " + (f.off > 0 ? "+" : "−") + Math.abs(f.off) + " min" : f.ev; }
  function scnDurWord(s, list) { var x = list.filter(function (y) { return y[0] === s; })[0]; return x ? x[1] : s >= 3600 && s % 3600 === 0 ? s / 3600 + " HR" : s >= 60 && s % 60 === 0 ? s / 60 + " MIN" : s + " SEC"; }
  function scnSetWord(s) { return s.b + "%" + (s.k ? " · " + (s.k <= 3000 ? "warm " : s.k >= 5000 ? "cool " : "") + s.k + " K" : s.hs ? " · color" : ""); }
  function scnNames(ids) {
    if (!ids || !ids.length) return "choose…";
    var ds = haDevices(), gs = haGroups(), sw = scnSw();
    var room = gs.filter(function (g) { var inG = sw.filter(function (d) { return d.g === g.id; }).map(function (d) { return d.id; }); return inG.length > 1 && inG.length === ids.length && inG.every(function (id) { return ids.indexOf(id) > -1; }); })[0];
    if (room) return "the " + room.nm + " lights";
    var nm = ids.map(function (id) { return (ds.filter(function (x) { return x.id === id; })[0] || { name: id }).name; });
    return nm.length > 3 ? nm.length + " devices" : nm.join(" + ");
  }
  function scnDotCss(s) { return s.hs ? rgbCss(hsvRgb(s.hs[0], s.hs[1])) : rgbCss(kelvinRgb(s.k || 2700)); }
  function scnIfShort(f) { var dw = scnDaysWord(f.days); return (f.t === "time" ? f.at : scnSunWord(f)) + " " + (dw === "every day" ? "daily" : dw); }
  function scnLine(d) {
    if (d.foreign) return "EDITED IN HOME ASSISTANT";
    if (d.on === false) return "PAUSED";
    if (!d.ifs.length) return "Tap only";
    return "IF " + scnIfShort(d.ifs[0]) + (d.ifs.length > 1 ? " +" + (d.ifs.length - 1) : "");
  }
  function scnSentence(d) {
    var ifs = d.ifs.map(function (f) { var dw = scnDaysWord(f.days); return "it's " + (f.t === "time" ? f.at : scnSunWord(f)) + (dw === "every day" ? " any day" : " on " + dw); });
    var w = ifs.length ? "If " + ifs.join(", or ") + ", or you tap it" : "When you tap it";
    if (d.only.length) w += ", and " + d.only.map(function (o) { return "the " + scnNames([o.id]) + " is " + o.st; }).join(" and ");
    var t = d.steps.map(function (s) {
      var fade = s.fade ? " over " + scnDurWord(s.fade, SCN_FADES).toLowerCase() : "";
      return s.t === "wait" ? "wait " + scnDurWord(s.s, SCN_WAITS).toLowerCase() : s.t === "set" ? "set " + scnNames(s.ids) + " to " + scnSetWord(s) + fade : "turn " + s.t + " " + scnNames(s.ids) + fade;
    });
    return w + ": " + (t.length ? t.join(", then ") : "nothing yet") + ".";
  }

  /* --- to and from Home Assistant (the long-standing keys platform / service / trigger / condition / action, which every
     version reads; the plural keys of 2024.10 are read back too) --- */
  function scnOff(min) { var m = Math.abs(min); return (min < 0 ? "-" : "") + p2(Math.floor(m / 60)) + ":" + p2(m % 60) + ":00"; }
  function scnDur(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string") { var m = /^(-)?(\d+):(\d{2})(?::(\d{2}))?$/.exec(v.trim()); if (!m) return null; var s = +m[2] * 3600 + +m[3] * 60 + +(m[4] || 0); return m[1] ? -s : s; }
    if (v && typeof v === "object" && Object.keys(v).every(function (k) { return ["days", "hours", "minutes", "seconds", "milliseconds"].indexOf(k) > -1 && typeof v[k] === "number"; }))
      return (v.days || 0) * 86400 + (v.hours || 0) * 3600 + (v.minutes || 0) * 60 + (v.seconds || 0) + (v.milliseconds || 0) / 1000;
    return null;
  }
  function scnToHa(d) {
    var trig = d.ifs.map(function (f, i) { return f.t === "time" ? { platform: "time", at: f.at + ":00", id: "if" + i } : { platform: "sun", event: f.ev, offset: scnOff(f.off || 0), id: "if" + i }; });
    var part = function (f) { return f.days && f.days.length && f.days.length < 7; }, cond = [];
    if (d.ifs.some(part)) cond.push({ condition: "or", conditions: d.ifs.map(function (f, i) {
      return part(f) ? { condition: "and", conditions: [{ condition: "trigger", id: "if" + i }, { condition: "time", weekday: f.days.slice() }] } : { condition: "trigger", id: "if" + i };
    }) });
    d.only.forEach(function (o) { cond.push({ condition: "state", entity_id: o.id, state: o.st }); });
    var act = d.steps.map(function (s) {
      if (s.t === "wait") return { delay: { seconds: s.s } };
      if (s.t === "set") { var data = { brightness_pct: s.b }; if (s.k) data.color_temp_kelvin = s.k; else if (s.hs) data.hs_color = s.hs.slice(); if (s.fade) data.transition = s.fade; return { service: "light.turn_on", target: { entity_id: s.ids.slice() }, data: data }; }
      var lights = s.ids.every(function (id) { return haDomain(id) === "light"; });
      return lights ? { service: "light.turn_" + s.t, target: { entity_id: s.ids.slice() }, data: s.fade ? { transition: s.fade } : {} } : { service: "homeassistant.turn_" + s.t, target: { entity_id: s.ids.slice() } };
    });
    return { id: d.id, alias: SCN_ALIAS + d.name, description: "Made in Bridge (TimothyOS) on ENGINEERING. Change it there to keep it editable in Bridge.", mode: "restart", trigger: trig, condition: cond, action: act };
  }
  function scnFromHa(cfg, ent) {
    var arr = function (x) { return x == null ? [] : Array.isArray(x) ? x : [x]; };
    var d = { id: cfg.id, name: String(cfg.alias || "").replace(/^TimothyOS · /, "").trim() || "SCENE", ifs: [], only: [], steps: [], foreign: false, entity: ent ? ent.entity_id : null, on: !ent || ent.state !== "off" };
    var bad = function () { d.foreign = true; }, ids = {};
    arr(cfg.triggers || cfg.trigger).forEach(function (t) {
      var p = t.platform || t.trigger, f;
      if (p === "time" && typeof t.at === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t.at)) { var hm = t.at.split(":"); f = { t: "time", at: p2(+hm[0]) + ":" + hm[1], days: null }; }
      else if (p === "sun" && (t.event === "sunset" || t.event === "sunrise")) { var o = t.offset ? scnDur(t.offset) : 0; if (o == null) { bad(); return; } f = { t: "sun", ev: t.event, off: Math.round(o / 60), days: null }; }
      else { bad(); return; }
      if (t.id) ids[t.id] = d.ifs.length;
      d.ifs.push(f);
    });
    arr(cfg.conditions || cfg.condition).forEach(function (c) {
      if (c.condition === "state" && typeof c.entity_id === "string" && (c.state === "on" || c.state === "off")) d.only.push({ id: c.entity_id, st: c.state });
      else if (c.condition === "or" && Array.isArray(c.conditions)) c.conditions.forEach(function (x) {
        var tid = null, wd = null;
        if (x.condition === "trigger") tid = x.id;
        else if (x.condition === "and" && Array.isArray(x.conditions)) x.conditions.forEach(function (y) { if (y.condition === "trigger") tid = y.id; else if (y.condition === "time" && y.weekday && !y.after && !y.before) wd = arr(y.weekday); else bad(); });
        else bad();
        tid = Array.isArray(tid) ? tid[0] : tid;
        if (tid == null || ids[tid] == null) { bad(); return; }
        if (wd) d.ifs[ids[tid]].days = SCN_DAYS.filter(function (k) { return wd.indexOf(k) > -1; });
      });
      else bad();
    });
    arr(cfg.actions || cfg.action).forEach(function (a) {
      if (a.delay != null) { var s = scnDur(a.delay); if (s == null || s < 0) bad(); else d.steps.push({ t: "wait", s: Math.round(s) }); return; }
      var svc = a.action || a.service, dt = a.data || {}, idl = arr((a.target && a.target.entity_id) || a.entity_id || dt.entity_id);
      if (!svc || !idl.length || idl.some(function (x) { return typeof x !== "string"; })) { bad(); return; }
      if (svc === "light.turn_on" && dt.brightness_pct != null) d.steps.push({ t: "set", ids: idl, b: dt.brightness_pct, k: dt.color_temp_kelvin || null, hs: dt.hs_color || null, fade: dt.transition || 0 });
      else if (/^(light|switch|fan|input_boolean|homeassistant)\.turn_(on|off)$/.test(svc) && Object.keys(dt).every(function (k) { return k === "transition" || k === "entity_id"; })) d.steps.push({ t: /on$/.test(svc) ? "on" : "off", ids: idl, fade: dt.transition || 0 });
      else bad();
    });
    return d;
  }
  /* --- reading the list: Home Assistant's automations whose id starts tos_, then each one's config --- */
  function scnLoad(force) {
    var S = eng.scn;
    if (!haConf()) return Promise.resolve();
    if (S.busy) return S.p;
    if (!force && Date.now() - S.at < 60000) return Promise.resolve();
    S.busy = true;
    return (S.p = haFetch("/api/states").then(function (all) {
      var ents = (all || []).filter(function (s) { return haDomain(s.entity_id) === "automation" && s.attributes && typeof s.attributes.id === "string" && s.attributes.id.indexOf(SCN_PRE) === 0; });
      return Promise.all(ents.map(function (e) {
        return haFetch("/api/config/automation/config/" + encodeURIComponent(e.attributes.id)).then(function (cfg) { return scnFromHa(Object.assign({ id: e.attributes.id }, cfg), e); }, function (err) { if (err.code === "http_404") return null; throw err; });
      }));
    }).then(function (list) {
      S.list = list.filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name); }); S.err = null; lsSet(LS_HASCN, S.list);
    }, function (e) { S.err = e.code === "unauthorized" ? "admin" : haErrText(e); })
      .then(function () { S.at = Date.now(); S.busy = false; if (state.screen === "engineering" && eng.tab === "controls") render(true); }));
  }

  /* --- the bar on CONTROLS: a tap runs the THEN; a hold (or ⋯) opens the IF / THEN --- */
  function scnBarHtml() {
    var S = eng.scn;
    scnLoad(false);
    var n = S.list.length, h = '<section class="ec-sec ec-scn">' + phead("SCENES", (n ? n + (n === 1 ? " SCENE · " : " SCENES · ") : "") + "ON HOME ASSISTANT", "chrome-a", (n > 1 ? '<button type="button" class="btn sm ghost" data-scnorder="1">ORDER</button>' : "") + '<button type="button" class="btn sm" data-scnnew="1">+ SCENE</button>');
    if (S.err === "admin") h += '<div class="err">Home Assistant refused the scenes: they need a token from an admin user. Check under <b>HOME ASSISTANT</b> in Systems.</div>';
    else if (S.err) h += '<div class="err">' + esc(S.err) + "</div>";
    h += n ? '<div class="scn-bar">' + scnOrdered().map(function (d) {
      return '<div class="scn-b' + (d.on === false || d.foreign ? " dim" : "") + '"><button type="button" class="scn-run" data-scnrun="' + esc(d.id) + '" aria-label="Run ' + esc(d.name) + '. Hold to edit."><b>' + esc(d.name.toUpperCase()) + "</b><small>" + esc(scnLine(d)) + "</small></button>" +
        '<button type="button" class="scn-more" data-scnedit="' + esc(d.id) + '" aria-label="Edit ' + esc(d.name) + '">⋯</button></div>';
    }).join("") + "</div>" : '<div class="empty">No scenes yet. <b>+ SCENE</b> makes one: IF a time, sunrise or sunset, THEN set your lights. It runs on Home Assistant, the iPads asleep or not.</div>';
    return h + "</section>";
  }
  function scnRun(id, again) {
    var d = scnById(id); if (!d) return;
    if (!d.entity) {   /* just saved: Home Assistant is still adding it; look again once, then run */
      if (again) { toast("Home Assistant is still adding " + d.name.toUpperCase() + ". Try again in a moment."); return; }
      scnLoad(true).then(function () { scnRun(id, true); }); return;
    }
    haFetch("/api/services/automation/trigger", { method: "POST", body: { entity_id: d.entity, skip_condition: true } })
      .then(function () { toast(d.name.toUpperCase() + " running"); setTimeout(function () { haLoad(true); }, 1500); },
        function (e) { toast("Not run: " + haErrText(e)); errLog("engineering", "scene run", e.code || "error", d.name); });
  }
  function scnSetOn(d, on) {
    return haFetch("/api/services/automation/turn_" + (on ? "on" : "off"), { method: "POST", body: { entity_id: d.entity } }).then(function () {
      var x = scnById(d.id); if (x) x.on = on; d.on = on; lsSet(LS_HASCN, eng.scn.list);
    });
  }
  $("content").addEventListener("pointerdown", function (e) {   /* hold a scene to edit it */
    var b = e.target.closest && e.target.closest("[data-scnrun]"), S = eng.scn;
    if (!b) return;
    S.held = false; clearTimeout(S.hold);
    S.hold = setTimeout(function () { S.held = true; scnOpen(b.dataset.scnrun); }, 550);
    var stop = function () { clearTimeout(S.hold); ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { b.removeEventListener(t, stop); }); };
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { b.addEventListener(t, stop); });
  });
  function scnScreenClick(b) {
    var d = b.dataset, S = eng.scn;
    if (d.scnrun) { if (S.held) { S.held = false; return true; } scnRun(d.scnrun); return true; }
    if (d.scnedit) { scnOpen(d.scnedit); return true; }
    if (d.scnnew) { scnOpen(null); return true; }
    if (d.scnorder) { scnOrderOpen(); return true; }
    return false;
  }

  /* --- the IF / THEN modal --- */
  function scnOpen(id) {
    var S = eng.scn, src = id ? scnById(id) : null;
    if (id && !src) return;
    eng.sheetKind = "scn"; eng.sheetId = null; eng.arm = null;
    S.d = src ? JSON.parse(JSON.stringify(src)) : { id: SCN_PRE + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: "", ifs: [], only: [], steps: [], on: true, isNew: true };
    S.orig = src ? JSON.stringify(scnToHa(src)) : ""; S.pick = null; S.msg = "";
    engSheet("scn-sheet", ""); scnPaint();
  }
  function scnW(attr, txt, cls) { return '<button type="button" class="scn-w' + (cls ? " " + cls : "") + '" ' + attr + ">" + esc(txt) + "</button>"; }
  function scnX(kind, i) { return '<button type="button" class="scn-x" data-scnx="' + kind + ":" + i + '" aria-label="Remove">✕</button>'; }
  function scnStepHtml(s, i) {
    var P = function (k, txt, c) { return scnW('data-scnp="' + k + ":" + i + '"', txt, c); };
    if (s.t === "wait") return "<span>Wait " + P("wait", scnDurWord(s.s, SCN_WAITS).toLowerCase(), "y") + "</span>";
    var lights = s.ids.length && s.ids.every(function (id) { return haDomain(id) === "light"; });
    if (s.t === "set") return '<i class="scn-dot" style="background:' + scnDotCss(s) + '"></i><span>Set ' + P("ids", scnNames(s.ids), "o") + " to " + P("set", scnSetWord(s), "o") + " over " + P("fade", scnDurWord(s.fade, SCN_FADES).toLowerCase(), "y") + "</span>";
    return '<i class="scn-dot' + (s.t === "off" ? " off" : "") + '"></i><span>Turn ' + s.t + " " + P("ids", scnNames(s.ids), "o") + (lights ? " over " + P("fade", scnDurWord(s.fade, SCN_FADES).toLowerCase(), "y") : "") + "</span>";
  }
  function scnPaint() {
    var S = eng.scn, d = S.d; if (!d) return;
    var ni = $("scnName"); if (ni) d.name = ni.value;
    if (S.pick) { scnPaintPick(); return; }
    var ro = !!d.foreign, armed = eng.arm === "scndel" && Date.now() - eng.armAt < 4000;
    var h = '<div class="sbar"><span>' + (d.isNew ? "NEW SCENE" : "SCENE") + "</span><span>" + (d.isNew ? "SAVES TO HOME ASSISTANT" : d.foreign ? "EDITED IN HOME ASSISTANT" : "SAVED IN HOME ASSISTANT") + "</span></div><div class=\"sbody scn-body\">" +
      '<div class="scn-name"><label class="ov-sub" for="scnName">NAME</label><input type="text" id="scnName" maxlength="40" value="' + esc(d.name) + '" placeholder="e.g. Bedtime" autocomplete="off"' + (ro ? " readonly" : "") + "></div>";
    if (ro) h += '<div class="stubbox"><span class="pill warn">EDITED IN HOME ASSISTANT</span><span>This scene was changed in the Home Assistant app and now holds something Bridge can\'t show. Run it or pause it here; change it there, so nothing you added is lost.</span></div>';
    else {
      h += '<div class="scn-cols"><div class="scn-col"><div class="scn-k"><span class="scn-tag if">IF</span><small>ANY OF THESE HAPPENS</small></div>';
      d.ifs.forEach(function (f, i) { var a = 'data-scnp="if:' + i + '"'; h += '<div class="scn-row"><span>It\'s ' + scnW(a, f.t === "time" ? f.at : scnSunWord(f), "y") + " " + scnW(a, scnDaysWord(f.days), "y") + "</span>" + scnX("if", i) + "</div>"; });
      h += '<div class="scn-row fixed"><span>I tap <b>' + esc((d.name || "it").toUpperCase()) + '</b> here</span><small>ALWAYS</small></div>' +
        '<button type="button" class="scn-add" data-scnadd="if">+ OR IF… (A TIME · SUNRISE · SUNSET)</button>' +
        '<div class="scn-k"><span class="scn-tag only">ONLY IF</span><small>OPTIONAL</small></div>';
      d.only.forEach(function (o, i) { h += '<div class="scn-row"><span>The ' + scnW('data-scnp="only:' + i + '"', scnNames([o.id]), "o") + " is " + scnW('data-scnonly="' + i + '"', o.st, "y") + "</span>" + scnX("only", i) + "</div>"; });
      h += '<button type="button" class="scn-add" data-scnadd="only">+ ONLY IF A DEVICE IS ON OR OFF</button></div>' +
        '<div class="scn-col"><div class="scn-k"><span class="scn-tag then">THEN</span><small>IN THIS ORDER</small><button type="button" class="chip sm" data-scntake="1">TAKE CURRENT LIGHTS</button></div>';
      d.steps.forEach(function (s, i) { h += '<div class="scn-row step">' + scnStepHtml(s, i) + (i ? '<button type="button" class="scn-x" data-scnup="' + i + '" aria-label="Move up">▲</button>' : "") + scnX("step", i) + "</div>"; });
      if (!d.steps.length) h += '<div class="empty">What happens: set lights, turn things on or off, or wait.</div>';
      h += '<div class="scn-adds"><span class="ov-sub">+ AND THEN</span>' + [["set", "SET LIGHTS"], ["on", "TURN ON"], ["off", "TURN OFF"], ["wait", "WAIT"]].map(function (x) { return '<button type="button" class="chip sm" data-scnadd="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        '<div class="scn-reads"><b>READS AS</b><span id="scnReads">' + esc(scnSentence(d)) + "</span></div></div></div>";
    }
    h += '<div class="err" id="scnErr" role="alert">' + esc(S.msg) + "</div></div>" +
      '<div class="sfoot btnrow">' + (d.isNew ? "" : '<button type="button" class="btn ghost" data-scndel="1">' + (armed ? "TAP AGAIN TO DELETE" : "DELETE SCENE") + '</button><button type="button" class="btn ghost" data-scnon="1" aria-pressed="' + (d.on !== false) + '">' + (d.on !== false ? "RULE ON" : "RULE OFF") + "</button>") +
      '<button type="button" class="btn ghost" data-scntry="1">' + (ro ? "RUN NOW" : "TRY THE THEN NOW") + "</button>" + (ro ? "" : '<button type="button" class="btn" data-scnsave="1">SAVE</button>') + '<button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    $("detailSheet").innerHTML = h;
    var inp = $("scnName"); if (inp && !ro) inp.addEventListener("input", function () { d.name = inp.value; var r = $("scnReads"); if (r) r.textContent = scnSentence(d); });
  }
  function scnMsg(m) { eng.scn.msg = m; var e = $("scnErr"); if (e) e.textContent = m; }

  /* --- a word's picker: it takes the modal's place until DONE --- */
  function scnPaintPick() {
    var S = eng.scn, d = S.d, p = S.pick, i = p.i, h = "", sw = scnSw();
    var chip = function (attr, txt, on) { return '<button type="button" class="chip" ' + attr + ' aria-pressed="' + !!on + '">' + esc(txt) + "</button>"; };
    var step = function (attr, dir, lbl) { return '<button type="button" class="scn-step" ' + attr + '="' + dir + '" aria-label="' + lbl + '">' + (dir > 0 ? "▲" : "▼") + "</button>"; };
    if (p.k === "if") {
      var f = d.ifs[i], kind = f.t === "time" ? "time" : f.ev, all = !f.days || f.days.length === 7;
      h += '<div class="ov-sub">WHEN</div><div class="chips">' + chip('data-scnft="time"', "A TIME", kind === "time") + chip('data-scnft="sunrise"', "SUNRISE", kind === "sunrise") + chip('data-scnft="sunset"', "SUNSET", kind === "sunset") + "</div>";
      if (f.t === "time") h += '<div class="scn-clock"><div>' + step("data-scnhh", 1, "Hour up") + '<b class="tnum">' + f.at.slice(0, 2) + "</b>" + step("data-scnhh", -1, "Hour down") + '</div><b class="tnum sep">:</b><div>' + step("data-scnmm", 5, "Minutes up") + '<b class="tnum">' + f.at.slice(3) + "</b>" + step("data-scnmm", -5, "Minutes down") + "</div></div>";
      else h += '<div class="scn-clock"><div>' + step("data-scnoff", 5, "Later") + '<b class="tnum">' + (f.off ? (f.off > 0 ? "+" : "−") + Math.abs(f.off) : "0") + "</b>" + step("data-scnoff", -5, "Earlier") + '</div><span class="muted">minutes ' + (f.off < 0 ? "before " : f.off > 0 ? "after " : "at ") + f.ev + "</span></div>";
      h += '<div class="ov-sub">ON</div><div class="chips">' + chip('data-scndays="all"', "EVERY DAY", all) + chip('data-scndays="wd"', "WEEKDAYS", scnDaysWord(f.days) === "weekdays") + chip('data-scndays="we"', "WEEKENDS", scnDaysWord(f.days) === "weekends") + "</div>" +
        '<div class="chips scn-daychips">' + SCN_DAYS.map(function (k, j) { return chip('data-scnday="' + k + '"', SCN_DAYNM[j].toUpperCase(), !all && f.days.indexOf(k) > -1); }).join("") + "</div>";
    } else if (p.k === "only") {
      var o = d.only[i];
      h += '<div class="ov-sub">WHICH DEVICE</div><div class="scn-list">' + sw.map(function (x) { return chip('data-scnonlyid="' + esc(x.id) + '"', x.name, o.id === x.id); }).join("") + '</div><div class="ov-sub">IS</div><div class="chips">' + chip('data-scnonlyst="on"', "ON", o.st === "on") + chip('data-scnonlyst="off"', "OFF", o.st === "off") + "</div>";
    } else if (p.k === "ids" || p.k === "take") {
      var sel = p.k === "take" ? p.sel : d.steps[i].ids, setOnly = p.k === "ids" && d.steps[i].t === "set";
      var cand = sw.filter(function (x) { return !setOnly || devCaps(x).b; }), rooms = haGroups().filter(function (g) { return cand.some(function (x) { return x.g === g.id; }); });
      h += '<div class="ov-sub">' + (p.k === "take" ? "TAKE HOW THESE ARE RIGHT NOW" : setOnly ? "WHICH LIGHTS (DIMMABLE)" : "WHICH DEVICES") + "</div>" +
        (rooms.length ? '<div class="chips">' + rooms.map(function (g) { return '<button type="button" class="chip sm" data-scnroom="' + g.id + '">ALL ' + esc(g.nm) + "</button>"; }).join("") + "</div>" : "") +
        '<div class="scn-list">' + cand.map(function (x) { return chip('data-scnid="' + esc(x.id) + '"', x.name + " · " + haStateTxt(x, eng.states[x.id]), sel.indexOf(x.id) > -1); }).join("") + "</div>";
    } else if (p.k === "set") {
      var s = d.steps[i], devs = haDevices().filter(function (x) { return s.ids.indexOf(x.id) > -1; }), cs = devs.map(devCaps);
      var col = cs.some(function (c) { return c.col; }), ct = !cs.length || cs.some(function (c) { return c.ct; }) || !col;
      var kmin = Math.min.apply(null, cs.map(function (c) { return c.kmin; }).concat([2200])), kmax = Math.max.apply(null, cs.map(function (c) { return c.kmax; }).concat([6500]));
      var mode = s.hs && col ? "hs" : "ct";
      h += '<label class="ov-sub" for="scnB">BRIGHTNESS</label><div class="hp-srow"><input class="hp-slider" id="scnB" type="range" min="1" max="100" value="' + s.b + '"><output id="scnBOut" class="tnum">' + s.b + "%</output></div>";
      if (col && ct) h += '<div class="chips">' + chip('data-scnmode="ct"', "WHITE", mode === "ct") + chip('data-scnmode="hs"', "COLOR", mode === "hs") + "</div>";
      if (mode === "ct") h += '<label class="ov-sub" for="scnK">WHITE · WARM TO COOL</label><div class="hp-srow"><input class="hp-slider" id="scnK" type="range" min="' + kmin + '" max="' + kmax + '" step="50" value="' + (s.k || 2700) + '" style="--track: linear-gradient(90deg, ' + rgbCss(kelvinRgb(kmin)) + ", " + rgbCss(kelvinRgb(kmax)) + ')"><output id="scnKOut" class="tnum">' + (s.k || 2700) + " K</output></div>";
      else h += '<div class="hp-color"><div class="hp-wheel" id="scnWheel" role="slider" tabindex="0" aria-label="Colour"><span class="knob" id="scnKnob"></span></div><div class="hp-swatches">' + HA_PRESETS.filter(function (x) { return x[1] === "hs"; }).map(function (x) {
        return '<button type="button" class="hp-swatch" data-scnpreset="' + x[2] + "," + x[3] + '"><i style="background:' + rgbCss(hsvRgb(x[2], x[3])) + '"></i>' + x[0] + "</button>"; }).join("") + "</div></div>";
    } else if (p.k === "fade" || p.k === "wait") {
      var cur = p.k === "fade" ? d.steps[i].fade : d.steps[i].s;
      h += '<div class="ov-sub">' + (p.k === "fade" ? "FADE OVER" : "WAIT FOR") + '</div><div class="chips">' + (p.k === "fade" ? SCN_FADES : SCN_WAITS).map(function (x) { return chip('data-scndur="' + x[0] + '"', x[1], cur === x[0]); }).join("") + "</div>";
    }
    var title = { "if": "IF · WHEN", only: "ONLY IF", ids: "THEN · WHICH", take: "TAKE CURRENT LIGHTS", set: "THEN · SET TO", fade: "THEN · FADE", wait: "THEN · WAIT" }[p.k];
    var rm = p.k === "if" || p.k === "only" ? '<button type="button" class="btn ghost" data-scnrm="1">REMOVE THIS ' + (p.k === "if" ? "IF" : "ONLY IF") + "</button>" : "";
    $("detailSheet").innerHTML = '<div class="sbar"><span>' + title + "</span><span>" + esc((d.name || "NEW SCENE").toUpperCase()) + '</span></div><div class="sbody scn-pick">' + h + "</div>" +
      '<div class="sfoot btnrow">' + rm + (p.k === "take" ? '<button type="button" class="btn ghost" data-scndone="1">CANCEL</button><button type="button" class="btn" data-scntakego="1">TAKE ' + p.sel.length + "</button>" : '<button type="button" class="btn" data-scndone="1">DONE</button>') + "</div>";
    if (p.k === "set") scnWireSet(d.steps[i]);
  }
  function scnWireSet(s) {
    var b = $("scnB"), k = $("scnK"), w = $("scnWheel"), kn = $("scnKnob");
    if (b) b.addEventListener("input", function () { s.b = +b.value; $("scnBOut").textContent = s.b + "%"; });
    if (k) k.addEventListener("input", function () { s.k = +k.value; s.hs = null; $("scnKOut").textContent = s.k + " K"; });
    if (!w) return;
    var place = function () { var hs = s.hs || [30, 70], ang = hs[0] * Math.PI / 180, r = hs[1] / 2; kn.style.left = (50 + Math.sin(ang) * r) + "%"; kn.style.top = (50 - Math.cos(ang) * r) + "%"; kn.style.background = rgbCss(hsvRgb(hs[0], hs[1])); w.setAttribute("aria-valuetext", "hue " + hs[0] + ", strength " + hs[1] + "%"); };
    var pick = function (e) { var r = w.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; s.hs = [Math.round((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360), Math.round(Math.min(1, Math.hypot(x, y) / (r.width / 2)) * 100)]; s.k = null; place(); };
    var dn = false;
    w.addEventListener("pointerdown", function (e) { e.preventDefault(); dn = true; try { w.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } pick(e); });
    w.addEventListener("pointermove", function (e) { if (dn) pick(e); });
    ["pointerup", "pointercancel"].forEach(function (t) { w.addEventListener(t, function () { dn = false; }); });
    w.addEventListener("keydown", function (e) { var dh = { ArrowLeft: -10, ArrowRight: 10 }[e.key], ds = { ArrowUp: 10, ArrowDown: -10 }[e.key]; if (!dh && !ds) return; e.preventDefault(); var hs = s.hs || [30, 70]; s.hs = [(hs[0] + (dh || 0) + 360) % 360, Math.max(0, Math.min(100, hs[1] + (ds || 0)))]; s.k = null; place(); });
    place();
  }
  function scnTake(ids) {   /* the chosen lights as they are now: one step per setting shared, then what's off */
    var steps = [], by = {}, on = [], off = [];
    ids.forEach(function (id) {
      var s = eng.states[id], x = haDevices().filter(function (y) { return y.id === id; })[0], c = x ? devCaps(x) : {};
      if (!isOn(s)) { off.push(id); return; }
      if (haDomain(id) !== "light" || !c.b) { on.push(id); return; }
      var a = s.attributes || {}, st = { t: "set", ids: [id], b: pctOf(s) || 100, k: a.color_mode === "color_temp" && a.color_temp_kelvin ? a.color_temp_kelvin : null, hs: /^(hs|xy|rgb)/.test(a.color_mode || "") && a.hs_color ? a.hs_color.map(Math.round) : null, fade: 0 };
      if (!st.k && !st.hs) st.k = 2700;
      var key = [st.b, st.k, st.hs && st.hs.join("/")].join("|");
      if (by[key]) by[key].ids.push(id); else { by[key] = st; steps.push(st); }
    });
    if (on.length) steps.push({ t: "on", ids: on, fade: 0 });
    if (off.length) steps.push({ t: "off", ids: off, fade: 0 });
    return steps;
  }
  function scnTry() {
    var S = eng.scn, d = S.d;
    if (d.foreign || (!d.isNew && JSON.stringify(scnToHa(d)) === S.orig)) { scnRun(d.id); return; }   /* as saved: Home Assistant runs it */
    var calls = [], waits = d.steps.some(function (s) { return s.t === "wait"; });
    d.steps.forEach(function (s) {
      if (s.t === "wait") return;
      s.ids.forEach(function (id) {
        var dom = haDomain(id);
        if (s.t === "set") calls.push(["light/turn_on", Object.assign({ entity_id: id, brightness_pct: s.b }, s.k ? { color_temp_kelvin: s.k } : s.hs ? { hs_color: s.hs } : {}, s.fade ? { transition: s.fade } : {})]);
        else calls.push([dom + "/turn_" + s.t, Object.assign({ entity_id: id }, s.fade && dom === "light" ? { transition: s.fade } : {})]);
      });
    });
    if (!calls.length) { scnMsg("Add a THEN first."); return; }
    calls.reduce(function (p, c) { return p.then(function () { return haFetch("/api/services/" + c[0], { method: "POST", body: c[1] }); }); }, Promise.resolve())
      .then(function () { toast("Tried" + (waits ? " (waits skipped)" : "")); setTimeout(function () { haLoad(true); }, 1200); }, function (e) { scnMsg("Not tried: " + haErrText(e)); });
  }
  function scnSave() {
    var S = eng.scn, d = S.d, nm = (($("scnName") || {}).value || d.name || "").trim();
    var why = !nm ? "Give it a name." : !d.steps.length ? "Add at least one THEN." : d.steps.some(function (s) { return s.t !== "wait" && !s.ids.length; }) ? "Choose the devices for every step." :
      S.list.some(function (x) { return x.id !== d.id && x.name.toLowerCase() === nm.toLowerCase(); }) ? "Another scene already has that name." : d.id.indexOf(SCN_PRE) !== 0 ? "Not one of Bridge's scenes." : "";
    if (why) { scnMsg(why); return; }
    d.name = nm; scnMsg("Saving to Home Assistant…");
    var wasNew = !!d.isNew;
    haFetch("/api/config/automation/config/" + encodeURIComponent(d.id), { method: "POST", body: scnToHa(d) }).then(function () {
      var saved = JSON.parse(JSON.stringify(d)); delete saved.isNew;
      S.list = S.list.filter(function (x) { return x.id !== d.id; }).concat([saved]).sort(function (a, b) { return a.name.localeCompare(b.name); }); lsSet(LS_HASCN, S.list);
      toast(nm.toUpperCase() + (wasNew ? " saved to Home Assistant" : " updated in Home Assistant"));
      closeDetail(); render(true);
      setTimeout(function () { scnLoad(true); }, 1200);   /* Home Assistant reloads its automations; a new one comes back with its entity */
    }, function (e) {
      scnMsg(e.code === "unauthorized" ? "Home Assistant refused: scenes need a token from an admin user." : haErrText(e) + (e.msg ? " " + e.msg : ""));
      errLog("engineering", "scene save", e.code || "error", nm + (e.msg ? " · " + e.msg : ""));
    });
  }
  function scnBlocked(e) {   /* a DELETE the relay won't let through reads like a dropped connection; if a GET still works, it's the relay */
    if (!e || e.code !== "unreachable") return Promise.resolve(false);
    return haFetch("/api/").then(function () { return true; }, function () { return false; });
  }
  var SCN_RELAY = "The NAS relay doesn't let deletes through yet. Add DELETE to the relay's Access-Control-Allow-Methods line (README → NAS relay), redeploy, then try again.";
  function scnDelete() {
    var S = eng.scn, d = S.d;
    if (!d || d.id.indexOf(SCN_PRE) !== 0) return;   /* never anything Bridge didn't make */
    scnMsg("Deleting…");
    haFetch("/api/config/automation/config/" + encodeURIComponent(d.id), { method: "DELETE" }).then(function () {
      S.list = S.list.filter(function (x) { return x.id !== d.id; }); lsSet(LS_HASCN, S.list);
      lsSet(LS_HASCNCHK, { at: Date.now(), res: "ready" });   /* a delete that went through proves the whole path */
      toast(d.name.toUpperCase() + " deleted from Home Assistant"); closeDetail(); render(true);
    }, function (e) {
      scnBlocked(e).then(function (relay) {
        scnMsg(relay ? SCN_RELAY : haErrText(e));
        errLog("engineering", "scene delete", relay ? "relay blocks DELETE" : e.code || "error", d.name);
        if (relay) lsSet(LS_HASCNCHK, { at: Date.now(), res: "relay" });
      });
    });
  }
  function scnSheetClick(b) {
    if (eng.sheetKind !== "scn") return false;
    var S = eng.scn, d = S.d, a = b.dataset, p = S.pick;
    if (!d) return false;
    var two = function (v) { return v.split(":"); };
    if (a.scnp) { var x = two(a.scnp); var ni = $("scnName"); if (ni) d.name = ni.value; S.pick = { k: x[0], i: +x[1] }; scnPaint(); return true; }
    if (a.scnadd) {
      var ni2 = $("scnName"); if (ni2) d.name = ni2.value;
      if (a.scnadd === "if") { d.ifs.push({ t: "time", at: "22:00", days: null }); S.pick = { k: "if", i: d.ifs.length - 1 }; }
      else if (a.scnadd === "only") { var f0 = scnSw()[0]; if (!f0) return true; d.only.push({ id: f0.id, st: "off" }); S.pick = { k: "only", i: d.only.length - 1 }; }
      else if (a.scnadd === "wait") { d.steps.push({ t: "wait", s: 900 }); S.pick = { k: "wait", i: d.steps.length - 1 }; }
      else { d.steps.push(a.scnadd === "set" ? { t: "set", ids: [], b: 50, k: 2700, hs: null, fade: 0 } : { t: a.scnadd, ids: [], fade: 0 }); S.pick = { k: "ids", i: d.steps.length - 1 }; }
      scnPaint(); return true;
    }
    if (a.scnx) { var y = two(a.scnx); (y[0] === "if" ? d.ifs : y[0] === "only" ? d.only : d.steps).splice(+y[1], 1); scnPaint(); return true; }
    if (a.scnup) { var u = +a.scnup, t = d.steps[u]; d.steps[u] = d.steps[u - 1]; d.steps[u - 1] = t; scnPaint(); return true; }
    if (a.scnonly) { var o = d.only[+a.scnonly]; o.st = o.st === "on" ? "off" : "on"; scnPaint(); return true; }
    if (a.scntake) { var ni3 = $("scnName"); if (ni3) d.name = ni3.value; var mine = []; d.steps.forEach(function (s) { (s.ids || []).forEach(function (id) { if (mine.indexOf(id) < 0) mine.push(id); }); }); S.pick = { k: "take", sel: mine.length ? mine : scnSw().map(function (z) { return z.id; }) }; scnPaint(); return true; }
    if (a.scntakego) { var waits = d.steps.filter(function (s) { return s.t === "wait"; }).length; d.steps = scnTake(p.sel); S.pick = null; scnPaint(); toast("THEN filled from " + p.sel.length + (p.sel.length === 1 ? " device" : " devices") + (waits ? "; the waits were left out" : "")); return true; }
    if (a.scndone !== undefined) { S.pick = null; scnPaint(); return true; }
    if (a.scnrm !== undefined) { (p.k === "if" ? d.ifs : d.only).splice(p.i, 1); S.pick = null; scnPaint(); return true; }
    if (p && p.k === "if") {
      var f = d.ifs[p.i];
      if (a.scnft) { if (a.scnft === "time") { f.t = "time"; f.at = f.at || "22:00"; delete f.ev; } else { f.t = "sun"; f.ev = a.scnft; f.off = f.off || 0; } }
      else if (a.scnhh) { var hh = (+f.at.slice(0, 2) + +a.scnhh + 24) % 24; f.at = p2(hh) + f.at.slice(2); }
      else if (a.scnmm) { var mm = (Math.round(+f.at.slice(3) / 5) * 5 + +a.scnmm + 60) % 60; f.at = f.at.slice(0, 3) + p2(mm); }
      else if (a.scnoff) f.off = Math.max(-120, Math.min(120, (f.off || 0) + +a.scnoff));
      else if (a.scndays) f.days = a.scndays === "all" ? null : a.scndays === "wd" ? SCN_DAYS.slice(0, 5) : SCN_DAYS.slice(5);
      else if (a.scnday) { var ds = f.days && f.days.length ? f.days.slice() : SCN_DAYS.slice(), j = ds.indexOf(a.scnday); if (!f.days || f.days.length === 7) ds = [a.scnday]; else if (j > -1) ds.splice(j, 1); else ds.push(a.scnday); f.days = ds.length ? SCN_DAYS.filter(function (k) { return ds.indexOf(k) > -1; }) : null; }
      else return false;
      if (!f.at) f.at = "22:00";
      scnPaint(); return true;
    }
    if (p && p.k === "only") { if (a.scnonlyid) d.only[p.i].id = a.scnonlyid; else if (a.scnonlyst) d.only[p.i].st = a.scnonlyst; else return false; scnPaint(); return true; }
    if (p && (p.k === "ids" || p.k === "take")) {
      var sel = p.k === "take" ? p.sel : d.steps[p.i].ids;
      if (a.scnid) { var k = sel.indexOf(a.scnid); if (k > -1) sel.splice(k, 1); else sel.push(a.scnid); }
      else if (a.scnroom) { var setOnly = p.k === "ids" && d.steps[p.i].t === "set"; scnSw().filter(function (z) { return z.g === a.scnroom && (!setOnly || devCaps(z).b); }).forEach(function (z) { if (sel.indexOf(z.id) < 0) sel.push(z.id); }); }
      else return false;
      scnPaint(); return true;
    }
    if (p && p.k === "set") {
      var s = d.steps[p.i];
      if (a.scnmode) { if (a.scnmode === "hs") { s.hs = s.hs || [30, 70]; s.k = null; } else { s.k = s.k || 2700; s.hs = null; } }
      else if (a.scnpreset) { s.hs = a.scnpreset.split(",").map(Number); s.k = null; }
      else return false;
      scnPaint(); return true;
    }
    if (p && (p.k === "fade" || p.k === "wait") && a.scndur) { if (p.k === "fade") d.steps[p.i].fade = +a.scndur; else d.steps[p.i].s = +a.scndur; scnPaint(); return true; }
    if (a.scnsave !== undefined) { scnSave(); return true; }
    if (a.scntry !== undefined) { scnTry(); return true; }
    if (a.scnon !== undefined) {
      var src = scnById(d.id); if (!src || !src.entity) { scnMsg("Home Assistant is still adding it. Try again in a moment."); return true; }
      scnSetOn(src, src.on === false).then(function () { d.on = src.on; scnPaint(); render(true); toast(d.name.toUpperCase() + (d.on ? " on: it runs on its schedule" : " paused: only a tap runs it")); }, function (e) { scnMsg(haErrText(e)); });
      return true;
    }
    if (a.scndel !== undefined) {
      if (eng.arm === "scndel" && Date.now() - eng.armAt < 4000) { eng.arm = null; scnDelete(); }
      else { eng.arm = "scndel"; eng.armAt = Date.now(); b.textContent = "TAP AGAIN TO DELETE"; }
      return true;
    }
    return false;
  }
  /* --- SYSTEMS: can Bridge keep scenes here? an admin token, and a relay that lets DELETE through --- */
  function scnCheck() {
    var S = eng.scn, done = function (res) { S.chk = false; lsSet(LS_HASCNCHK, { at: Date.now(), res: res }); if (state.screen === "systems") render(true); };
    if (!haConf() || S.chk) return;
    S.chk = true;
    var probe = "/api/config/automation/config/" + SCN_PRE + "probe";   /* an id no scene ever has: reading or deleting it changes nothing */
    haFetch(probe).catch(function (e) { if (e.code === "unauthorized") throw { admin: true }; if (e.code !== "http_404" && e.code !== "http_400") throw e; })
      .then(function () {
        return haFetch(probe, { method: "DELETE" }).then(function () { return "ready"; }, function (e) {
          if (e.code === "http_404" || e.code === "http_400") return "ready";
          return scnBlocked(e).then(function (relay) { if (relay) return "relay"; throw e; });
        });
      })
      .then(done, function (e) { done(e && e.admin ? "admin" : "err"); });
  }
  function scnSysHtml() {
    var c = lsGet(LS_HASCNCHK), r = c && c.res;
    if (haConf() && (!c || Date.now() - c.at > 864e5)) setTimeout(scnCheck, 0);
    var t = !r ? '<span class="muted">Checking…</span>' : r === "ready" ? '<span class="pill ok">READY</span> Bridge can keep scenes in Home Assistant' :
      r === "admin" ? '<span class="pill bad">NEEDS ADMIN</span> Use a token from a Home Assistant admin user' :
      r === "relay" ? '<span class="pill warn">RELAY BLOCKS DELETE</span> Add <code>DELETE</code> to the relay\'s <code>Access-Control-Allow-Methods</code> line (README → NAS relay) and redeploy. Everything else works' :
      '<span class="pill bad">NOT CHECKED</span> Home Assistant didn\'t answer';
    return "<dt>SCENES</dt><dd>" + t + ' <button type="button" class="btn sm ghost" data-act="hascncheck">CHECK</button></dd>';
  }

