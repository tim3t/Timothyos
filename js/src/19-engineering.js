  /* ---------- Engineering (2.24): Home Assistant controls and upkeep ---------- */
  /* CONTROLS: devices picked from Home Assistant, reached through the NAS relay's /ha path
     (or a direct HTTPS address). The HA token is typed in Systems and kept on this iPad; only the
     devices added here are shown. UPKEEP: recurring maintenance by time (days to years) or by a
     reading (miles, hours), kept on this iPad. Overdue items join the Bridge's CONDITION. */
  var LS_HA = "tos.ha.v1";            /* { url, token } */
  var LS_HADEV = "tos.hadev.v1";      /* [{ id: entity_id, name, style, g, caps }] */
  var LS_UPKEEP = "tos.upkeep.v1";    /* [{ id, name, cat, every, unit, last, lastRead, read }] */
  var LS_ENGTAB = "tos.engtab.v1";
  var HA_TOGGLE = ["switch", "light", "fan", "input_boolean"];
  var HA_SHOW = HA_TOGGLE.concat(["sensor", "binary_sensor", "climate"]);
  var UNITS = [["days", "DAYS"], ["weeks", "WEEKS"], ["months", "MONTHS"], ["years", "YEARS"], ["miles", "MILES"], ["hours", "HOURS"]];
  var eng = { tab: lsGet(LS_ENGTAB) === "upkeep" ? "upkeep" : "controls", states: {}, err: null, at: 0, inflight: false, pick: null, arm: null, armAt: 0, sheetKind: null, sheetId: null, sheetMode: "hs", dragging: null };
  function haConf() { var c = lsGet(LS_HA); return c && c.url && c.token ? c : null; }
  function haViaRelay(url) { var n = nasConf(); return !!(n && url.indexOf(nasBase()) === 0); }
  function haUrl(path) {
    var c = haConf(), base = c.url.replace(/\/+$/, ""), n = nasConf();
    return base + path + (haViaRelay(base) ? (path.indexOf("?") > -1 ? "&" : "?") + "k=" + encodeURIComponent(n.token) : "");
  }
  function haFetch(path, opts) {
    var c = haConf();
    if (!c) return Promise.reject({ code: "not_set" });
    opts = opts || {};
    var h = { Authorization: "Bearer " + c.token };
    if (opts.body) h["Content-Type"] = "application/json";
    return fetch(haUrl(path), { method: opts.method || "GET", headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" })
      .catch(function () { throw { code: navigator.onLine === false ? "offline" : "unreachable" }; })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw { code: "unauthorized" };
        if (!r.ok) return r.json().then(function (j) { throw { code: "http_" + r.status, msg: j && typeof j.message === "string" ? j.message : "" }; }, function () { throw { code: "http_" + r.status }; });   /* Home Assistant says why (2.64: a scene it won't take) */
        return r.json();
      });
  }
  function haErrText(err) {
    var c = err && err.code;
    if (c === "unauthorized") return "Home Assistant (or the relay) refused the token. Check both under HOME ASSISTANT in Systems.";
    if (c === "offline") return "This iPad is offline.";
    if (c === "unreachable") return "Can't reach Home Assistant. Check Tailscale is on, and that the relay's /ha path points at Home Assistant.";
    if (c === "http_502" || c === "http_504") return "The relay is up but can't reach Home Assistant. Check HA_URL in the relay's settings on the NAS.";
    if (/^http_/.test(c || "")) return "Home Assistant answered with an error (" + c.slice(5) + ").";
    return "Something went wrong talking to Home Assistant.";
  }
  function sinceLabel(d) { return ymd(d) === ymd(new Date()) ? hm(d) : shortDay(ymd(d)); }
  function haDevices() { return lsGet(LS_HADEV) || []; }
  function haDomain(id) { return String(id).split(".")[0]; }
  /* 2.25: card styles, CARDS / LIST, groups and a full light panel. Groups, styles, folds and the view
     are this iPad's own (never Home Assistant's rooms). Light changes go out at most ~3 a second while
     you drag, then once more when you let go; a re-read follows. */
  var LS_HAGROUPS = "tos.hagroups.v1";   /* [{ id, nm }] */
  var LS_HAROOM = "tos.haroom.v1";       /* 2.28: the room shown under LIGHTS AND SWITCHES ("all", a room id, "_none") */
  var LS_HAVIEW = "tos.haview.v1";       /* "cards" | "list" */
  var HA_GCOL = ["chrome-d", "chrome-a", "chrome-b", "chrome-c"];
  var HA_STYLES = [
    ["toggle", "TOGGLE", "Big on / off tile", function (c) { return c.sw; }],
    ["dimmer", "DIMMER", "Tile with a brightness bar", function (c) { return c.b; }],
    ["color", "COLOR", "Tile in the light's colour", function (c) { return c.col || c.ct; }],
    ["mini", "COMPACT", "One slim button", function () { return true; }],
    ["reading", "READING", "Large number", function (c) { return !c.sw; }]
  ];
  var hq = {};   /* light changes on their way: { id: { data, last, t, rr } } */
  function haLoad(force) {
    var devs = haDevices();
    if (!haConf() || eng.inflight || !devs.length) return;
    if (!force && Date.now() - eng.at < 20000) return;
    eng.inflight = true;
    if (eng.unit === undefined && devs.some(function (d) { return haDomain(d.id) === "climate"; })) { eng.unit = null; haFetch("/api/config").then(function (j) { eng.unit = (j && j.unit_system && j.unit_system.temperature) || "°"; haRepaint(); }, function () { eng.unit = undefined; }); }
    Promise.all(devs.map(function (d) {
      return haFetch("/api/states/" + encodeURIComponent(d.id)).then(function (s) {
        if (eng.dragging === d.id || Date.now() - ((hq[d.id] && hq[d.id].last) || 0) < 1500) return;   /* a change of yours is still on its way */
        eng.states[d.id] = s;
      }, function (e) {
        if (e.code === "http_404") eng.states[d.id] = { missing: true }; else throw e;
      });
    })).then(function () { eng.err = null; }, function (e) { eng.err = { code: e.code, msg: haErrText(e) }; })
      .then(function () { eng.at = Date.now(); eng.inflight = false; haRepaint(); });
  }
  function haRepaint() {
    if (eng.dragging) return;
    if (state.screen === "engineering") render(true);
    if (eng.sheetKind === "dev" && !$("detailScrim").hidden) paintDevSheet();
  }
  setInterval(function () { if (state.screen === "engineering" && eng.tab === "controls" && !document.hidden) haLoad(true); }, 30000);

  /* --- what a device can do, and how it looks --- */
  function capsOf(id, s) {
    var dom = haDomain(id), a = (s && s.attributes) || {}, m = a.supported_color_modes || [];
    var col = dom === "light" && m.some(function (x) { return ["hs", "xy", "rgb", "rgbw", "rgbww"].indexOf(x) > -1; }), ct = dom === "light" && m.indexOf("color_temp") > -1;
    return { sw: HA_TOGGLE.indexOf(dom) > -1, clim: dom === "climate", b: dom === "light" && (col || ct || m.indexOf("brightness") > -1 || m.indexOf("white") > -1), col: col, ct: ct,
      kmin: a.min_color_temp_kelvin || 2000, kmax: a.max_color_temp_kelvin || 6500, fx: a.effect_list && a.effect_list.length ? a.effect_list.slice(0, 12) : null };
  }
  function devCaps(d) { var s = eng.states[d.id]; return s && !s.missing ? capsOf(d.id, s) : d.caps || capsOf(d.id, null); }
  function capsWords(c) { return c.clim ? "thermostat" : !c.sw ? "reading" : [c.col ? "color" : "", c.ct ? "white" : "", c.b ? "brightness" : "", !c.b ? "on and off" : ""].filter(Boolean).join(", "); }
  function bestStyle(c) { return c.clim ? "climate" : !c.sw ? "reading" : c.col || c.ct ? "color" : c.b ? "dimmer" : "toggle"; }
  function styleOf(d) { var c = devCaps(d); if (c.clim) return "climate"; var st = HA_STYLES.filter(function (x) { return x[0] === d.style; })[0]; return st && st[3](c) ? d.style : bestStyle(c); }
  function haGroups() { return lsGet(LS_HAGROUPS) || []; }
  function haGroupOf(d) { return haGroups().some(function (g) { return g.id === d.g; }) ? d.g : null; }
  function saveDev(id, patch) { lsSet(LS_HADEV, haDevices().map(function (d) { return d.id === id ? Object.assign({}, d, patch) : d; })); }
  function newGroup(nm) { var g = { id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nm: nm.toUpperCase().slice(0, 30) }; lsSet(LS_HAGROUPS, haGroups().concat([g])); return g; }

  /* --- state and colour --- */
  function hsvRgb(h, s) { s /= 100; var f = function (n) { var k = (n + h / 60) % 6; return 1 - s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(function (v) { return Math.round(v * 255); }); }
  function kelvinRgb(k) { var t = Math.max(0, Math.min(1, (k - 2200) / 4300)), a = [255, 170, 90], b = [228, 238, 255]; return a.map(function (x, i) { return Math.round(x + (b[i] - x) * t); }); }
  function rgbCss(c) { return "rgb(" + c.join(",") + ")"; }
  function isOn(s) { return !!s && !s.missing && s.state === "on"; }
  function isDead(s) { return !s || !!s.missing || s.state === "unavailable"; }
  function pctOf(s) { var b = s && s.attributes && s.attributes.brightness; return b != null ? Math.max(1, Math.round(b / 2.55)) : null; }
  function lampCss(id, s) {
    if (!isOn(s)) return null;
    var a = s.attributes || {};
    if (haDomain(id) !== "light") return "var(--chrome-d)";
    if (a.rgb_color) return rgbCss(a.rgb_color);
    if (a.hs_color) return rgbCss(hsvRgb(a.hs_color[0], a.hs_color[1]));
    if (a.color_temp_kelvin) return rgbCss(kelvinRgb(a.color_temp_kelvin));
    return "#ffd48a";
  }
  function haStateTxt(d, s) {
    if (!s) return "…";
    if (s.missing) return "NOT FOUND";
    if (s.state === "unavailable") return "OFFLINE";
    var c = devCaps(d), a = s.attributes || {};
    if (!c.sw) return haDomain(d.id) === "binary_sensor" ? String(s.state).toUpperCase() : s.state + (a.unit_of_measurement ? " " + a.unit_of_measurement : "");
    if (s.state !== "on") return "OFF";
    var p = pctOf(s);
    return "ON" + (c.b && p != null ? " · " + p + "%" : "") + (c.col && /^(hs|xy|rgb)/.test(a.color_mode || "") ? " · COLOR" : c.ct && a.color_mode === "color_temp" && a.color_temp_kelvin ? " · " + a.color_temp_kelvin + " K" : "");
  }

  /* --- sending --- */
  function haToggle(id) {
    var s = eng.states[id];
    if (s && !s.missing) { s.state = s.state === "on" ? "off" : "on"; haRepaint(); }   /* shown at once, confirmed by a re-read */
    haFetch("/api/services/" + haDomain(id) + "/toggle", { method: "POST", body: { entity_id: id } })
      .then(function () { setTimeout(function () { haLoad(true); }, 700); })
      .catch(function (e) { toast("Not switched: " + haErrText(e)); haLoad(true); });
  }
  function haAllOff(gid) {
    var ids = haDevices().filter(function (d) { return (gid === "all" || (gid === "_none" ? !haGroupOf(d) : d.g === gid)) && devCaps(d).sw && isOn(eng.states[d.id]); }).map(function (d) { return d.id; });
    if (!ids.length) return;
    ids.forEach(function (id) { eng.states[id].state = "off"; });
    haRepaint();
    Promise.all(ids.map(function (id) { return haFetch("/api/services/" + haDomain(id) + "/turn_off", { method: "POST", body: { entity_id: id } }); }))
      .then(function () { toast(ids.length + (ids.length === 1 ? " device" : " devices") + " turned off"); }, function (e) { toast("Not all turned off: " + haErrText(e)); })
      .then(function () { setTimeout(function () { haLoad(true); }, 700); });
  }
  function haLightSet(id, data, final) {
    var q = hq[id] || (hq[id] = { data: {}, last: 0, t: 0, rr: 0 }), s = eng.states[id];
    if (data.hs_color) delete q.data.color_temp_kelvin;
    if (data.color_temp_kelvin) delete q.data.hs_color;
    Object.assign(q.data, data);
    if (s && !s.missing) {   /* shown at once */
      var a = s.attributes = s.attributes || {};
      s.state = "on";
      if (data.brightness_pct != null) a.brightness = Math.round(data.brightness_pct * 2.55);
      if (data.hs_color) { a.hs_color = data.hs_color; a.color_mode = "hs"; a.rgb_color = hsvRgb(data.hs_color[0], data.hs_color[1]); }
      if (data.color_temp_kelvin) { a.color_temp_kelvin = data.color_temp_kelvin; a.color_mode = "color_temp"; a.rgb_color = kelvinRgb(data.color_temp_kelvin); }
      if (data.effect) a.effect = data.effect;
    }
    var send = function () {
      clearTimeout(q.t); q.t = 0;
      var body = q.data; q.data = {}; q.last = Date.now();
      if (!Object.keys(body).length) return;
      haFetch("/api/services/light/turn_on", { method: "POST", body: Object.assign({ entity_id: id }, body) }).catch(function (e) { toast("Not changed: " + haErrText(e)); });
    };
    if (final || Date.now() - q.last >= 330) send(); else if (!q.t) q.t = setTimeout(send, 330 - (Date.now() - q.last));
    if (final) { clearTimeout(q.rr); q.rr = setTimeout(function () { haLoad(true); }, 1600); }
  }
  /* While dragging: the panel's readout and the screen behind it follow, without redrawing the panel. */
  function haLive(id) {
    var d = haDevices().filter(function (x) { return x.id === id; })[0], s = eng.states[id];
    if (!d) return;
    var v = $("hpVal"); if (v) v.textContent = haStateTxt(d, s);
    var top = document.querySelector(".hp-top"), lc = lampCss(id, s) || "var(--chrome-d)";
    if (top) { top.style.setProperty("--lc", lc); var pw = top.querySelector(".hp-pwr"); pw.setAttribute("aria-pressed", "true"); pw.textContent = "ON"; }
    var bt = $("haB"); if (bt) bt.style.setProperty("--track", "linear-gradient(90deg, var(--panel-2), " + lc + ")");
    if (state.screen === "engineering") render(true);
  }

  /* ---------- upkeep ---------- */
  function upkeepItems() { return lsGet(LS_UPKEEP) || []; }
  /* 2.54 (bridge 1.36): upkeep lives in Notion's Upkeep database, so both iPads and Notion see the same list. This iPad
     keeps a copy to show at once; every change is queued (tos.upkeepq.v1, never in a backup) and sent, an item at a time,
     found again by its App ID. The first time the bridge has Upkeep, items made on this iPad go up. Without it, upkeep
     stays on the iPad as before. */
  var LS_UPKEEPQ = "tos.upkeepq.v1";   /* { ops: [{ op: "save", item } | { op: "remove", id }], mig: true once this iPad's items went up } */
  var upQ = Object.assign({ ops: [], mig: false }, lsGet(LS_UPKEEPQ) || {}), upX = { busy: false, at: 0, err: "" };
  function canUpkeep() { return state.caps.indexOf("upkeep") > -1; }
  function upQueue(op) { upQ.ops = upQ.ops.filter(function (o) { return (o.item ? o.item.id : o.id) !== (op.item ? op.item.id : op.id); }); upQ.ops.push(op); lsSet(LS_UPKEEPQ, upQ); }
  function saveUpkeep(list) {
    var old = {}; upkeepItems().forEach(function (u) { old[u.id] = u; });
    lsSet(LS_UPKEEP, list);
    if (!canUpkeep()) return;
    list.forEach(function (u) { if (!old[u.id] || JSON.stringify(old[u.id]) !== JSON.stringify(u)) upQueue({ op: "save", item: u }); delete old[u.id]; });
    Object.keys(old).forEach(function (id) { upQueue({ op: "remove", id: id }); });
    flushUpkeep();
  }
  function upItem(u) { return { id: u.id, name: u.name, cat: u.cat || "", every: u.every, unit: u.unit, last: u.last || null, lastRead: u.lastRead == null ? null : u.lastRead, read: u.read == null ? null : u.read, hist: u.hist || [] }; }
  function flushUpkeep() {
    if (upX.busy || !upQ.ops.length || !canUpkeep() || !navigator.onLine) return Promise.resolve();
    var op = upQ.ops[0];
    upX.busy = true;
    return apiPost(op.op === "save" ? { action: "upkeepsave", item: upItem(op.item) } : { action: "upkeepremove", id: op.id }, 30000).then(function (j) {
      upQ.ops = upQ.ops.filter(function (o) { return o !== op; }); lsSet(LS_UPKEEPQ, upQ);
      upX.busy = false; return flushUpkeep();
    }, function (e) {
      upX.busy = false; upX.err = describe(e);
      if (e && e.code === "bad_request") { upQ.ops = upQ.ops.filter(function (o) { return o !== op; }); lsSet(LS_UPKEEPQ, upQ); upX.err = "Notion refused " + (op.item ? op.item.name : "a removal") + ". It stays on this iPad."; }
    });
  }
  function loadUpkeep(force) {
    if (!canUpkeep() || upX.busy || (!force && Date.now() - upX.at < 60000)) return Promise.resolve();
    upX.at = Date.now();
    return api({ action: "upkeep" }).then(function (j) {
      var got = (j.items || []).map(function (u) { var x = upItem(u); return x; }), ids = {};
      got.forEach(function (u) { ids[u.id] = 1; });
      if (!upQ.mig) { upkeepItems().forEach(function (u) { if (!ids[u.id]) upQueue({ op: "save", item: u }); }); upQ.mig = true; lsSet(LS_UPKEEPQ, upQ); }
      var list = got.slice();
      upQ.ops.forEach(function (o) {   /* what hasn't gone up yet still shows */
        list = list.filter(function (u) { return u.id !== (o.item ? o.item.id : o.id); });
        if (o.op === "save") list.push(o.item);
      });
      var before = JSON.stringify(upkeepItems());
      lsSet(LS_UPKEEP, list); upX.err = "";
      if (state.screen === "engineering" && JSON.stringify(list) !== before && !document.querySelector("#detailScrim:not([hidden])")) render(true);
      return flushUpkeep();
    }, function (e) { upX.err = describe(e); });
  }
  function byReading(u) { return u.unit === "miles" || u.unit === "hours"; }
  function addInterval(day, n, unit) {
    var d = parseYmd(day);
    if (unit === "days") d = addDays(d, n); else if (unit === "weeks") d = addDays(d, 7 * n);
    else { var m = unit === "years" ? 12 * n : n, dd = d.getDate(); d = new Date(d.getFullYear(), d.getMonth() + m, 1); d.setDate(Math.min(dd, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    return ymd(d);
  }
  /* Where an item stands: lvl ok / warn (within 14 days or the last tenth) / bad (overdue). */
  function upkeepStatus(u, today) {
    var unitWord = u.unit === "miles" ? "MI" : "H";
    if (byReading(u)) {
      if (u.lastRead == null || u.read == null) return { lvl: "warn", pct: 0, due: "ADD A READING", sort: 0 };
      var used = u.read - u.lastRead, left = u.every - used;
      return { lvl: left < 0 ? "bad" : left <= u.every * 0.1 ? "warn" : "ok", pct: Math.max(0, Math.min(100, used / u.every * 100)),
        due: left < 0 ? Math.round(-left).toLocaleString() + " " + unitWord + " OVER" : Math.round(left).toLocaleString() + " " + unitWord + " LEFT", sort: left / u.every * 365 };
    }
    if (!u.last) return { lvl: "warn", pct: 0, due: "NEVER DONE", sort: 0 };
    var due = addInterval(u.last, u.every, u.unit), n = daysBetween(today, due), span = Math.max(1, daysBetween(u.last, due));
    return { lvl: n < 0 ? "bad" : n <= 14 ? "warn" : "ok", pct: Math.max(0, Math.min(100, (span - n) / span * 100)), dueDay: due,
      due: n < 0 ? -n + (n === -1 ? " DAY" : " DAYS") + " OVER" : n === 0 ? "DUE TODAY" : n <= 14 ? "IN " + n + (n === 1 ? " DAY" : " DAYS") : shortDay(due) + (due.slice(0, 4) !== today.slice(0, 4) ? " " + due.slice(0, 4) : ""), sort: n };
  }
  function upkeepOverdue(today) { return upkeepItems().filter(function (u) { return upkeepStatus(u, today).lvl === "bad"; }); }

  /* ---------- screen ---------- */
  function haView() { return lsGet(LS_HAVIEW) === "list" ? "list" : "cards"; }
  function renderEngineering() {
    var ctl = eng.tab === "controls", view = haView();
    if (!ctl) loadUpkeep(false);
    var html = '<div class="eng"><div class="eng-tabs"><div class="chips">' + [["controls", "CONTROLS"], ["upkeep", "UPKEEP"]].map(function (t) {
      return '<button type="button" class="chip" data-engtab="' + t[0] + '" aria-pressed="' + (eng.tab === t[0]) + '">' + t[1] + "</button>";
    }).join("") + "</div>";
    if (ctl && haConf()) html += '<div class="eng-tools"><div class="hseg" role="group" aria-label="View">' + [["cards", "CARDS"], ["list", "LIST"]].map(function (v) {
      return '<button type="button" data-haview="' + v[0] + '" aria-pressed="' + (view === v[0]) + '">' + v[1] + "</button>";
    }).join("") + '</div><button type="button" class="btn sm ghost" data-eng="groups">ROOMS</button><button type="button" class="btn sm" data-eng="add">+ ADD DEVICE</button></div>';
    else if (!ctl) html += '<div class="eng-tools"><div class="hseg" role="group" aria-label="Upkeep view">' + [["groups", "GROUPS"], ["horizon", "HORIZON"]].map(function (x) {
      return '<button type="button" data-upview="' + x[0] + '" aria-pressed="' + ((upView().view === "horizon" ? "horizon" : "groups") === x[0]) + '">' + x[1] + "</button>";
    }).join("") + '</div><button type="button" class="btn sm" data-eng="newitem">+ ITEM</button></div>';
    html += "</div>" + (ctl ? haControlsHtml(view) : upkeepHtml());
    $("content").innerHTML = html + "</div>";
  }
  /* 2.28: laid out by type, as in the first Engineering mockup. LIGHTS AND SWITCHES on the left with the
     rooms as chips (ALL, each room that has some, OTHER for the rest; remembered in tos.haroom.v1),
     CLIMATE and SENSORS on the right. Each tile carries its room. Doors and scenes are for later. */
  function haRoomName(d) { var g = haGroups().filter(function (x) { return x.id === d.g; })[0]; return g ? g.nm : ""; }
  function haKind(d) { var c = devCaps(d); return c.clim ? "climate" : c.sw ? "light" : "sensor"; }
  function haControlsHtml(view) {
    if (!haConf()) return '<div class="stubbox"><span class="pill">SETUP</span><span>Controls talk to Home Assistant. Add its address and a token under <b>HOME ASSISTANT</b> in Systems. Steps are in the README under <b>Home Assistant</b>.</span></div>' +
      '<div class="btnrow"><button type="button" class="btn" data-eng="systems">OPEN SYSTEMS</button></div>';
    var devs = haDevices();
    haLoad(false);
    if (!devs.length) return '<div class="empty">No devices yet. Tap <b>+ ADD DEVICE</b> to pick one from Home Assistant. Only the devices you add appear here.</div>';
    var lights = devs.filter(function (d) { return haKind(d) === "light"; }), clim = devs.filter(function (d) { return haKind(d) === "climate"; }), sens = devs.filter(function (d) { return haKind(d) === "sensor"; });
    var html = eng.err ? '<div class="err">' + esc(eng.err.msg) + "</div>" : "";
    if (scnSw().length) html += scnBarHtml();   /* 2.64: SCENES above the lights */
    html += '<div class="ec-cols' + (lights.length && (clim.length || sens.length) ? "" : " one") + '">';
    if (lights.length) {
      var rooms = haGroups(), used = rooms.filter(function (g) { return lights.some(function (d) { return d.g === g.id; }); }), loose = lights.some(function (d) { return !haGroupOf(d); });
      var room = lsGet(LS_HAROOM) || "all";
      if (room === "_none" ? !loose : room !== "all" && !used.some(function (g) { return g.id === room; })) room = "all";
      var shown = lights.filter(function (d) { return room === "all" || (room === "_none" ? !haGroupOf(d) : d.g === room); });
      var non = shown.filter(function (d) { return isOn(eng.states[d.id]); }).length;
      var chip = function (id, nm, i) { return '<button type="button" class="chip sm" data-haroom="' + id + '" aria-pressed="' + (room === id) + '"' + (i != null ? ' style="--c: var(--' + HA_GCOL[i % HA_GCOL.length] + ')"' : "") + ">" + esc(nm) + "</button>"; };
      html += '<section class="ec-sec ec-lights">' + phead("LIGHTS AND SWITCHES", non ? non + " ON" : "ALL OFF", "chrome-b") +
        '<div class="ec-rooms">' + (used.length ? '<div class="chips" role="group" aria-label="Rooms">' + chip("all", "ALL") + used.map(function (g) { return chip(g.id, g.nm, rooms.indexOf(g)); }).join("") + (loose ? chip("_none", "OTHER") : "") + "</div>" : "<span></span>") +
        (non ? '<button type="button" class="chip sm" data-haalloff="' + room + '">ALL OFF' + (room === "all" ? "" : " HERE") + "</button>" : "") + "</div>";
      if (view === "list") html += '<div class="hr-rows">' + shown.map(haRowHtml).join("") + "</div>";
      else {
        var big = shown.filter(function (d) { return styleOf(d) !== "mini"; }), small = shown.filter(function (d) { return styleOf(d) === "mini"; });
        if (big.length) html += '<div class="hc-grid">' + big.map(haCardHtml).join("") + "</div>";
        if (small.length) html += '<div class="hm-row">' + small.map(haMiniHtml).join("") + "</div>";
      }
      html += "</section>";
    }
    if (clim.length || sens.length) {
      html += '<div class="ec-side">';
      if (clim.length) html += '<section class="ec-sec">' + phead("CLIMATE", clim.length > 1 ? clim.length + " ZONES" : "", "chrome-d") + clim.map(haClimateHtml).join("") + "</section>";
      if (sens.length) {
        html += '<section class="ec-sec ec-sens">' + phead("SENSORS", "", "chrome-c");
        if (view === "list") html += '<div class="hr-rows">' + sens.map(haRowHtml).join("") + "</div>";
        else {
          var sbox = sens.filter(function (d) { return styleOf(d) !== "mini"; }), ss = sens.filter(function (d) { return styleOf(d) === "mini"; });
          if (sbox.length) html += '<div class="hc-grid">' + sbox.map(haCardHtml).join("") + "</div>";
          if (ss.length) html += '<div class="hm-row">' + ss.map(haMiniHtml).join("") + "</div>";
        }
        html += "</section>";
      }
      html += "</div>";
    }
    return html + '</div><small class="muted">Updates every 30 seconds while this screen is open. Rooms, card styles and the view are kept on this iPad.</small>';
  }
  /* A thermostat: target with + and −, the room's temperature and humidity, and its modes. */
  var HA_HVAC = { heat: "HEAT", cool: "COOL", heat_cool: "AUTO", auto: "AUTO", off: "OFF" };
  function haClimateHtml(d) {
    var s = eng.states[d.id], a = (s && s.attributes) || {}, dead = isDead(s), u = eng.unit || "°", rm = haRoomName(d);
    var one = typeof a.temperature === "number", step = a.target_temp_step || (u === "°C" ? 0.5 : 1);
    var act = { heating: "Heating", cooling: "Cooling", idle: "Holding", off: "Off", fan: "Fan only", drying: "Drying" }[a.hvac_action] || (s && s.state === "off" ? "Off" : "");
    var sub = [act && one && act !== "Off" ? act + " to " + a.temperature + u : act, typeof a.current_humidity === "number" ? "humidity " + a.current_humidity + "%" : ""].filter(Boolean).join(" · ");
    var modes = (a.hvac_modes || []).filter(function (m) { return HA_HVAC[m]; }).slice(0, 4);
    return '<div class="ec-clim' + (dead && s ? " dead" : "") + '"><div class="cl-main"><span class="rm">' + esc(((rm ? rm + " · " : "") + d.name).toUpperCase()) + (typeof a.current_temperature === "number" ? " · NOW " + a.current_temperature + esc(u) : "") + "</span>" +
      '<span class="tgt tnum">' + (dead ? esc(haStateTxt(d, s)) : one ? esc(String(a.temperature)) + "<small>" + esc(u) + "</small>" : typeof a.target_temp_low === "number" ? a.target_temp_low + "–" + a.target_temp_high + "<small>" + esc(u) + "</small>" : esc(String(s.state).toUpperCase())) + "</span>" +
      '<span class="sub">' + esc(sub) + "</span>" +
      (modes.length && !dead ? '<div class="chips">' + modes.map(function (m) { return '<button type="button" class="chip sm" data-hahvac="' + m + '" data-dev="' + esc(d.id) + '" aria-pressed="' + (s.state === m) + '">' + HA_HVAC[m] + "</button>"; }).join("") + "</div>" : "") + "</div>" +
      (one && !dead ? '<div class="cl-step"><button type="button" data-haclim="' + step + '" data-dev="' + esc(d.id) + '" aria-label="Warmer">+</button><button type="button" data-haclim="' + -step + '" data-dev="' + esc(d.id) + '" aria-label="Cooler">−</button></div>' : "") + haMore(d) + "</div>";
  }
  function haClimStep(id, dlt) {
    var s = eng.states[id]; if (!s || s.missing) return;
    var a = s.attributes, lo = a.min_temp != null ? a.min_temp : -50, hi = a.max_temp != null ? a.max_temp : 150;
    a.temperature = Math.max(lo, Math.min(hi, Math.round((a.temperature + dlt) * 10) / 10));
    var q = hq["clim:" + id] || (hq["clim:" + id] = {});
    hq[id] = hq[id] || { data: {}, last: 0, t: 0, rr: 0 }; hq[id].last = Date.now();   /* hold off re-reads while you tap */
    clearTimeout(q.t);
    q.t = setTimeout(function () {
      hq[id].last = Date.now();
      haFetch("/api/services/climate/set_temperature", { method: "POST", body: { entity_id: id, temperature: a.temperature } })
        .then(function () { setTimeout(function () { haLoad(true); }, 1600); }, function (e) { toast("Not changed: " + haErrText(e)); haLoad(true); });
    }, 900);
    render(true);
  }
  function haHvac(id, mode) {
    var s = eng.states[id]; if (!s || s.missing) return;
    s.state = mode; render(true);
    haFetch("/api/services/climate/set_hvac_mode", { method: "POST", body: { entity_id: id, hvac_mode: mode } })
      .then(function () { setTimeout(function () { haLoad(true); }, 1000); }, function (e) { toast("Not changed: " + haErrText(e)); haLoad(true); });
  }
  function haMore(d) { return '<button type="button" class="hc-more" data-hadev="' + esc(d.id) + '" aria-label="' + esc(d.name) + ' settings">⋯</button>'; }
  function haNm(d) { var rm = haRoomName(d); return (rm ? '<span class="rm">' + esc(rm) + "</span>" : "") + '<span class="nm">' + esc(d.name) + "</span>"; }
  function haCardHtml(d) {
    var s = eng.states[d.id], st = styleOf(d), on = isOn(s), dead = isDead(s), lc = lampCss(d.id, s), txt = haStateTxt(d, s), p = pctOf(s);
    var since = s && s.last_changed && !dead ? " · SINCE " + esc(sinceLabel(new Date(s.last_changed))) : "";
    var cls = "hc hc-" + st + (on ? " on" : "") + (dead && s ? " dead" : "");
    if (st === "reading") {
      var a = (s && s.attributes) || {};
      return '<div class="' + cls + '"><div class="hc-main ro">' + haNm(d) + '<span class="val tnum">' + esc(dead ? txt : s.state) + (a.unit_of_measurement && !dead ? "<small> " + esc(a.unit_of_measurement) + "</small>" : "") +
        '</span><span class="sub">READING' + since + "</span></div>" + haMore(d) + "</div>";
    }
    if (st === "color") return '<div class="' + cls + '" style="--lc: ' + (lc || "var(--panel-2)") + '"><button type="button" class="hc-main" data-hadev="' + esc(d.id) + '"><span class="bulb" aria-hidden="true"></span>' + haNm(d) + '<span class="sub">' + esc(txt) + "</span></button>" + haMore(d) +
      '<button type="button" class="hc-pwr" data-hatoggle="' + esc(d.id) + '"' + (dead ? " disabled" : "") + ">" + (on ? "TURN OFF" : "TURN ON") + "</button></div>";
    var main = '<button type="button" class="hc-main" data-hatoggle="' + esc(d.id) + '" aria-pressed="' + on + '"' + (dead ? " disabled" : "") + '>' + haNm(d) + '<span class="val tnum">' +
      esc(dead ? txt : st === "dimmer" && on && p != null ? p + "%" : on ? "ON" : "OFF") + '</span><span class="sub">' + (dead ? "" : on ? "TAP TO TURN OFF" : "TAP TO TURN ON") + since + "</span></button>";
    return '<div class="' + cls + '">' + main + haMore(d) + (st === "dimmer" && !dead ? '<div class="hc-lvl" data-halvl="' + esc(d.id) + '" role="slider" tabindex="0" aria-label="' + esc(d.name) + ' brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="' + (on ? p || 100 : 0) + '">' +
      '<i style="width:' + (on ? p || 100 : 0) + '%"></i><span>' + (on && p != null ? p + "%" : "DRAG TO DIM") + "</span></div>" : "") + "</div>";
  }
  function haMiniHtml(d) {
    var s = eng.states[d.id], c = devCaps(d), on = isOn(s), dead = isDead(s);
    var inner = '<span class="lamp" aria-hidden="true"></span><span class="nm">' + esc(d.name) + '</span><span class="st tnum">' + esc(c.sw && !dead ? (on ? "ON" : "OFF") : haStateTxt(d, s)) + "</span>";
    return '<span class="hm' + (on ? " on" : "") + '" style="--lc: ' + (lampCss(d.id, s) || "var(--chrome-d)") + '">' +
      (c.sw ? '<button type="button" class="hm-main" data-hatoggle="' + esc(d.id) + '" aria-pressed="' + on + '"' + (dead ? " disabled" : "") + ">" + inner + "</button>" : '<span class="hm-main ro">' + inner + "</span>") + haMore(d) + "</span>";
  }
  function haRowHtml(d) {
    var s = eng.states[d.id], c = devCaps(d), on = isOn(s), dead = isDead(s);
    return '<div class="hr' + (on ? " on" : "") + '" style="--lc: ' + (lampCss(d.id, s) || "var(--chrome-d)") + '"><button type="button" class="hr-main" data-hadev="' + esc(d.id) + '"><span class="lamp" aria-hidden="true"></span><span class="nm">' + esc(d.name) + '</span><span class="st tnum">' + esc(haStateTxt(d, s)) + "</span></button>" +
      (c.sw ? '<button type="button" class="hsw" data-hatoggle="' + esc(d.id) + '" aria-pressed="' + on + '" aria-label="' + esc(d.name) + (on ? ", on" : ", off") + '"' + (dead ? " disabled" : "") + "></button>" : '<span class="hsw-ph"></span>') + "</div>";
  }
  /* 2.55: two ways to see UPKEEP (Timothy chose them from three mockups). GROUPS, the default: what needs you on top
     (up to three cards: overdue, then the next 14 days), then a panel per category, the most pressing first; GROUP BY
     STATUS swaps the panels for OVERDUE / NEXT 14 DAYS / NEXT 3 MONTHS / LATER. HORIZON: a lane per category from today
     across the next 30 days, 90 days or year, overdue items in a bay before today, mileage and hours items below as
     gauges (they have no date). Every name opens its sheet; MARK DONE everywhere. tos.upview.v1 holds the view, the
     grouping, the range and each category's color (given in the order categories first appear, so it never moves);
     PROFILE SYNC carries it. Categories match without regard to capitals; blank is OTHER. */
  var LS_UPVIEW = "tos.upview.v1";   /* { view: "groups" | "horizon", by: "cat" | "status", range: 30 | 90 | 365, cols: { category (lower case): palette index } } */
  var UP_COLS = ["chrome-b", "work", "chrome-a", "personal", "chrome-d", "chrome-c", "hobby"];
  function upView() { return Object.assign({ view: "groups", by: "cat", range: 90, cols: {} }, lsGet(LS_UPVIEW) || {}); }
  function upSet(patch) { lsSet(LS_UPVIEW, Object.assign(upView(), patch)); render(true); }
  function upCatOf(u) { return String(u.cat || "").trim() || "Other"; }
  function upColor(v, cat) {   /* a category's color, kept once given */
    var k = cat.toLowerCase();
    if (v.cols[k] == null) { v.cols[k] = Object.keys(v.cols).length % UP_COLS.length; lsSet(LS_UPVIEW, v); }
    return UP_COLS[v.cols[k]];
  }
  function upCadence(u) { return u.every === 1 ? "every " + u.unit.replace(/s$/, "") : "every " + Number(u.every).toLocaleString() + " " + u.unit; }
  function upRowHtml(x, small) {
    var u = x.u, s = x.s;
    return '<div class="up-row ' + s.lvl + '"><button type="button" class="up-main" data-upedit="' + esc(u.id) + '"><span class="nm">' + esc(u.name) + "<small>" + esc(small) + "</small></span>" +
      '<span class="meter"><span class="tr"><i style="width:' + Math.round(s.pct) + '%"></i></span></span><span class="due tnum">' + s.due + "</span></button>" +
      '<button type="button" class="up-tick" data-updone="' + esc(u.id) + '" aria-label="Mark ' + esc(u.name) + ' done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div>';
  }
  function upkeepHtml() {
    var today = ymd(new Date()), v = upView(), list = upkeepItems().map(function (u) { return { u: u, s: upkeepStatus(u, today) }; });
    if (!list.length) return '<div class="empty">Nothing tracked yet. Tap <b>+ ITEM</b> to add something that needs doing every so often, like an oil change every 5,000 miles or a furnace filter every 3 months.</div>';
    list.sort(function (a, b) { return a.s.sort - b.s.sort; });
    list.forEach(function (x) { x.cat = upCatOf(x.u); x.c = upColor(v, x.cat); });
    var over = list.filter(function (x) { return x.s.lvl === "bad"; }).length, isSoon = list.filter(function (x) { return x.s.lvl === "warn"; }).length;
    var chip = function (attr, val, label, on) { return '<button type="button" class="chip sm" ' + attr + '="' + val + '" aria-pressed="' + on + '">' + label + "</button>"; };
    var html = '<div class="up-head"><div class="eng-sum"><span class="pill ' + (over ? "bad" : "ok") + '">' + over + " OVERDUE</span><span class=\"pill" + (isSoon ? " warn" : "") + '">' + isSoon + " DUE SOON</span><span class=\"pill\">" + (list.length - over - isSoon) + " ON SCHEDULE</span></div>" +
      (v.view === "horizon" ? '<div class="up-opts"><span class="ov-sub">LOOK AHEAD</span>' + [[30, "30 DAYS"], [90, "90 DAYS"], [365, "YEAR"]].map(function (r) { return chip("data-uprange", r[0], r[1], v.range === r[0]); }).join("") + "</div>"
        : '<div class="up-opts"><span class="ov-sub">GROUP BY</span>' + chip("data-upby", "cat", "CATEGORY", v.by !== "status") + chip("data-upby", "status", "STATUS", v.by === "status") + "</div>") + "</div>";
    html += v.view === "horizon" ? upHorizonHtml(list, v, today) : upGroupsHtml(list, v);
    return html + '<small class="muted">' + (canUpkeep() ? "In Notion, on both iPads." : "Saved on this iPad.") + " Overdue items also show in CONDITION on the Bridge.</small>";
  }
  function upGroupsHtml(list, v) {
    var html = "", groups;
    if (v.by !== "status") {
      var attn = list.filter(function (x) { return x.s.lvl !== "ok"; }).slice(0, 3);
      if (attn.length) html += '<div class="up-attn"><span class="ov-sub">NEEDS ATTENTION</span><div class="up-cards">' + attn.map(function (x) {
        return '<div class="up-card ' + x.s.lvl + '" style="--c: var(--' + x.c + ')"><button type="button" class="up-cmain" data-upedit="' + esc(x.u.id) + '"><small><i></i>' + esc(x.cat.toUpperCase()) + "</small><b>" + esc(x.u.name) + '</b><span class="due tnum">' + x.s.due + "</span></button>" +
          '<button type="button" class="chip sm" data-updone="' + esc(x.u.id) + '">MARK DONE</button></div>';
      }).join("") + "</div></div>";
      var by = {};
      list.forEach(function (x) { var k = x.cat.toLowerCase(); (by[k] = by[k] || { title: x.cat, c: x.c, rows: [] }).rows.push(x); });
      var RANK = { bad: 0, warn: 1, ok: 2 };
      groups = Object.keys(by).map(function (k) { return by[k]; });   /* the list is soonest first; a group with something overdue, then due soon, comes first */
      groups.forEach(function (g) { g.rank = Math.min.apply(null, g.rows.map(function (x) { return RANK[x.s.lvl]; })); });
      groups.sort(function (a, b) { return a.rank - b.rank || a.rows[0].s.sort - b.rows[0].s.sort; });
      groups.forEach(function (g) {
        var o = g.rows.filter(function (x) { return x.s.lvl === "bad"; }).length, w = g.rows.filter(function (x) { return x.s.lvl === "warn"; }).length;
        g.meta = o ? o + " OVERDUE" : w ? w + " DUE SOON" : "ALL ON SCHEDULE"; g.lvl = o ? "bad" : w ? "warn" : "";
        g.small = function (x) { return upCadence(x.u); };
      });
    } else {
      groups = [["OVERDUE", "bad", function (x) { return x.s.lvl === "bad"; }], ["NEXT 14 DAYS", "warn", function (x) { return x.s.lvl === "warn"; }],
        ["NEXT 3 MONTHS", "ok", function (x) { return x.s.lvl === "ok" && x.s.sort <= 92; }], ["LATER", "dim", function (x) { return x.s.lvl === "ok" && x.s.sort > 92; }]].map(function (b) {
        var rows = list.filter(b[2]);
        return { title: b[0], c: b[1], rows: rows, meta: rows.length + (rows.length === 1 ? " ITEM" : " ITEMS"), lvl: "", small: function (x) { return x.cat + " · " + upCadence(x.u); } };
      }).filter(function (g) { return g.rows.length; });
    }
    return html + '<div class="up-grps">' + groups.map(function (g) {
      return '<section class="up-grp" style="--c: var(--' + g.c + ')"><div class="up-gh"><span class="cap"></span><h3>' + esc(g.title.toUpperCase()) + '</h3><span class="rule"></span><small class="' + g.lvl + '">' + g.meta + "</small></div>" +
        '<div class="eng-up">' + g.rows.map(function (x) { return upRowHtml(x, g.small(x)); }).join("") + "</div></section>";
    }).join("") + "</div>";
  }
  function upHorizonHtml(list, v, today) {
    var R = v.range === 30 || v.range === 365 ? v.range : 90, t0 = parseYmd(today), at = function (day) { return daysBetween(today, day) / R * 100; }, ticks = [], d;
    var narrow = innerWidth <= 640, trkW = Math.max(120, ($("content").clientWidth || 900) - (narrow ? 84 : 224) - 50), gap = function (px) { return px / trkW * 100; };   /* spacing in % of the track, from its width now */
    if (R === 30) for (d = addDays(t0, (8 - t0.getDay()) % 7 || 7); daysBetween(today, ymd(d)) < R; d = addDays(d, 7)) ticks.push([ymd(d), shortDay(ymd(d))]);
    else for (d = addDays(t0, 1); daysBetween(today, ymd(d)) < R; d = addDays(d, 1)) if (d.getDate() === 1 || (R === 90 && d.getDate() === 15)) ticks.push([ymd(d), R === 365 ? MON[d.getMonth()] : shortDay(ymd(d))]);
    var lines = ticks.map(function (k) { return '<span class="up-tl" style="left:' + at(k[0]).toFixed(2) + '%"></span>'; }).join("");
    var cats = [], by = {};
    list.forEach(function (x) { var k = x.cat.toLowerCase(); if (!by[k]) { by[k] = { title: x.cat, c: x.c, xs: [] }; cats.push(by[k]); } by[k].xs.push(x); });
    var html = '<div class="up-hz"><div class="up-lane up-axis"><span></span><span class="up-bayh">OVERDUE</span><div class="up-trk"><span class="up-now">TODAY</span>' +
      ticks.filter(function (k) { var p = at(k[0]), ok = p > gap(50) && p < 100 - gap(26) && p - (ticks.lastAt || -99) > gap(56); if (ok) ticks.lastAt = p; return ok; }).map(function (k) { return '<span class="up-tk" style="left:' + at(k[0]).toFixed(2) + '%">' + k[1] + "</span>"; }).join("") + "</div></div>";   /* none under TODAY or past the edge */
    cats.forEach(function (g) {
      var dated = g.xs.filter(function (x) { return !byReading(x.u); });
      if (!dated.length) return;
      var bay = dated.filter(function (x) { return x.s.lvl === "bad" || !x.s.dueDay; }), inR = dated.filter(function (x) { return x.s.lvl !== "bad" && x.s.dueDay && daysBetween(today, x.s.dueDay) < R; }),
        later = dated.length - bay.length - inR.length, last = [-99, -99];
      html += '<div class="up-lane" style="--c: var(--' + g.c + ')"><span class="up-ln"><b>' + esc(g.title.toUpperCase()) + "</b><small>" + dated.length + (dated.length === 1 ? " item" : " items") + "</small></span>" +
        '<span class="up-bay">' + bay.map(function (x) { return '<button type="button" data-upedit="' + esc(x.u.id) + '">' + esc(x.u.name) + "<small>" + x.s.due + "</small></button>"; }).join("") + "</span>" +
        '<div class="up-trk">' + lines + inR.map(function (x) {
          var p = Math.max(0, at(x.s.dueDay)), w = gap(narrow ? 140 : 190), row = p - last[0] > w ? 0 : p - last[1] > w ? 1 : last[0] <= last[1] ? 0 : 1; last[row] = p;
          return '<button type="button" class="up-mk ' + x.s.lvl + (row ? " low" : "") + (p > 100 - gap(narrow ? 130 : 180) ? " end" : "") + '" style="left:' + p.toFixed(2) + "%;max-width:" + Math.round(Math.min(narrow ? 150 : 190, p > 100 - gap(narrow ? 130 : 180) ? p / 100 * trkW + 7 : (100 - p) / 100 * trkW + 7)) + 'px" data-upedit="' + esc(x.u.id) + '"><i></i><span><b>' + esc(x.u.name) + "</b><small>" + x.s.due + "</small></span></button>";
        }).join("") + (later > 0 ? '<span class="up-later">+' + later + " LATER</span>" : "") + "</div></div>";
    });
    html += "</div>";
    var read = list.filter(function (x) { return byReading(x.u); });
    if (read.length) html += '<div class="up-grp up-readg" style="--c: var(--chrome-b)"><div class="up-gh"><span class="cap"></span><h3>BY READING</h3><span class="rule"></span><small>NO DATE TO PLACE</small></div><div class="eng-up">' +
      read.map(function (x) { return upRowHtml(x, x.cat + " · " + upCadence(x.u)); }).join("") + "</div></div>";
    return html;
  }

  /* ---------- sheets ---------- */
  function engSheet(cls, html) {
    $("detailSheet").className = "sheet eng-sheet " + cls;
    $("detailSheet").style.setProperty("--c", "var(--chrome-d)");
    $("detailSheet").innerHTML = html;
    showSheet("detailScrim");
  }
  function openAddDevice() {
    eng.sheetKind = "add";
    eng.pick = { q: "", list: null, err: null, d: null };
    engSheet("", '<div class="sbar"><span>+ ADD DEVICE</span><span>FROM HOME ASSISTANT</span></div><div class="sbody"><div class="hp-steps"><b>1 PICK</b><em>2 STYLE + ROOM</em></div><input type="search" id="haQ" placeholder="Search by name, e.g. Pond" autocomplete="off" aria-label="Search devices"><div id="haList"><div class="empty">Asking Home Assistant…</div></div></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>');
    haFetch("/api/states").then(function (all) {
      eng.pick.list = (all || []).filter(function (s) { return HA_SHOW.indexOf(haDomain(s.entity_id)) > -1; }).map(function (s) {
        return { id: s.entity_id, name: (s.attributes && s.attributes.friendly_name) || s.entity_id, state: s.state, caps: capsOf(s.entity_id, s) };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    }).catch(function (e) { eng.pick.err = haErrText(e); }).then(paintPick);
  }
  function paintPick() {
    var el = $("haList"), p = eng.pick;
    if (!el || !p) return;
    if (p.err) { el.innerHTML = '<div class="err">' + esc(p.err) + "</div>"; return; }
    if (!p.list) return;
    var q = p.q.trim().toLowerCase(), have = haDevices().map(function (d) { return d.id; });
    var hits = p.list.filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) > -1 || d.id.indexOf(q) > -1; });
    el.innerHTML = (hits.length ? hits.slice(0, 60).map(function (d) {
      var added = have.indexOf(d.id) > -1;
      return '<div class="ha-hit"><span><b>' + esc(d.name) + "</b><small>" + esc(d.id) + " · " + esc(String(d.state).toUpperCase()) + " · " + esc(capsWords(d.caps)) + "</small></span>" +
        (added ? '<span class="pill ok">ADDED</span>' : '<button type="button" class="btn sm" data-hapick="' + esc(d.id) + '">NEXT</button>') + "</div>";
    }).join("") : '<div class="empty">Nothing matches.</div>') + (hits.length > 60 ? '<div class="muted">' + (hits.length - 60) + " more. Narrow the search.</div>" : "") +
      '<small class="muted">' + p.list.length + " switches, lights and sensors in Home Assistant.</small>";
  }
  function stylePickHtml(c, cur) {
    if (c.clim) return '<small class="muted">Shown as a thermostat under CLIMATE: target temperature, + and −, and its modes.</small>';
    return '<div class="hp-styles">' + HA_STYLES.map(function (x) {
      var ok = x[3](c);
      return '<button type="button" class="hp-style" data-hastyle="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '"' + (ok ? "" : " disabled") + '><span class="pv pv-' + x[0] + '" aria-hidden="true">' + (x[0] === "reading" ? "61.4°" : "") + "</span><b>" + x[1] + "</b><small>" + (ok ? x[2] : "Not for this device") + "</small></button>";
    }).join("") + "</div>";
  }
  function groupChipsHtml(cur) {
    var gs = haGroups();
    return '<div class="chips">' + gs.map(function (g, i) {
      return '<button type="button" class="chip sm" style="--c: var(--' + HA_GCOL[i % HA_GCOL.length] + ')" data-hagrp="' + g.id + '" aria-pressed="' + (cur === g.id) + '">' + esc(g.nm) + "</button>";
    }).join("") + '<button type="button" class="chip sm" data-hagrp="_none" aria-pressed="' + !gs.some(function (g) { return g.id === cur; }) + '">NONE</button></div>';
  }
  function paintAddStep2() {
    var d = eng.pick.d;
    $("detailSheet").innerHTML = '<div class="sbar"><span>+ ADD DEVICE</span><span>FROM HOME ASSISTANT</span></div><div class="sbody"><div class="hp-steps"><em>1 PICK</em><b>2 STYLE + ROOM</b></div>' +
      '<div class="hp-read"><b>' + esc(d.name.toUpperCase()) + "</b><small>" + esc(d.id) + " · " + esc(capsWords(d.caps)) + "</small></div>" +
      '<div class="hp-sec"><span class="ov-sub">HOW IT LOOKS</span>' + stylePickHtml(d.caps, d.style) + "</div>" +
      '<div class="hp-sec"><span class="ov-sub">WHICH ROOM</span>' + groupChipsHtml(d.g) +
      '<div class="hp-newg"><input type="text" id="haAddNewG" maxlength="30" placeholder="Or a new room, e.g. Kitchen" aria-label="New room name"><button type="button" class="btn sm ghost" data-hanewg="add">+ ROOM</button></div></div></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-haaddgo="1">ADD TO ENGINEERING</button></div>';
  }

  function openUpkeepItem(id) {
    var u = id ? upkeepItems().filter(function (x) { return x.id === id; })[0] : null, today = ymd(new Date());
    var unit = u ? u.unit : "months";
    engSheet("up-sheet", '<div class="sbar"><span>' + (u ? "EDIT ITEM" : "+ UPKEEP ITEM") + "</span><span>" + (canUpkeep() ? "IN NOTION" : "SAVED ON THIS IPAD") + "</span></div><div class=\"sbody\">" +
      '<label class="ov-sub" for="upName">WHAT</label><input type="text" id="upName" maxlength="80" placeholder="e.g. Oil change" value="' + esc(u ? u.name : "") + '">' +
      '<label class="ov-sub" for="upCat">FOR</label><input type="text" id="upCat" maxlength="40" placeholder="e.g. Car, House, Tractor" value="' + esc(u ? u.cat || "" : "") + '">' + upCatChips(u ? u.cat : "") +
      '<label class="ov-sub" for="upEvery">EVERY</label><div class="up-every"><input type="number" id="upEvery" inputmode="numeric" min="1" step="1" value="' + (u ? u.every : 3) + '"><div class="chips" id="upUnit">' +
        UNITS.map(function (x) { return '<button type="button" class="chip sm" data-upunit="' + x[0] + '" aria-pressed="' + (unit === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div id="upTimeRow"' + (byReading({ unit: unit }) ? " hidden" : "") + '><label class="ov-sub" for="upLast">LAST DONE</label><input type="date" id="upLast" value="' + esc(u ? u.last || "" : today) + '"></div>' +
      '<div id="upReadRow"' + (byReading({ unit: unit }) ? "" : " hidden") + '><label class="ov-sub" for="upLastRead">READING WHEN LAST DONE</label><input type="number" id="upLastRead" inputmode="numeric" min="0" value="' + (u && u.lastRead != null ? u.lastRead : "") + '">' +
        '<label class="ov-sub" for="upRead">READING NOW</label><input type="number" id="upRead" inputmode="numeric" min="0" value="' + (u && u.read != null ? u.read : "") + '"></div>' +
      '<div class="err" id="upErr" role="alert"></div></div><div class="sfoot btnrow">' + (u ? '<button type="button" class="btn ghost" data-updel="' + esc(u.id) + '">DELETE</button>' : "") +
      '<button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-upsave="' + esc(u ? u.id : "") + '">SAVE</button></div>');
    $("detailSheet").dataset.unit = unit;
  }
  function upCatChips(cur) {   /* the categories already in use, so House and house stay one */
    var seen = {}, cats = [];
    upkeepItems().forEach(function (x) { var c = String(x.cat || "").trim(); if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; cats.push(c); } });
    if (!cats.length) return "";
    return '<div class="chips up-cats">' + cats.sort().map(function (c) { return '<button type="button" class="chip sm" data-upcatpick="' + esc(c) + '" aria-pressed="' + (String(cur || "").trim().toLowerCase() === c.toLowerCase()) + '">' + esc(c) + "</button>"; }).join("") + "</div>";
  }
  function saveUpkeepItem(id) {
    var name = $("upName").value.trim(), every = parseInt($("upEvery").value, 10), unit = $("detailSheet").dataset.unit, err = $("upErr");
    if (!name) { err.textContent = "Give it a name."; return; }
    if (!(every > 0)) { err.textContent = "EVERY needs a number above 0."; return; }
    var item = { id: id || "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, cat: $("upCat").value.trim(), every: every, unit: unit };
    if (byReading(item)) {
      var lr = $("upLastRead").value, r = $("upRead").value;
      item.lastRead = lr === "" ? null : +lr; item.read = r === "" ? (lr === "" ? null : +lr) : +r; item.last = null;
      if (item.lastRead != null && item.read != null && item.read < item.lastRead) { err.textContent = "READING NOW can't be lower than the reading when last done."; return; }
    } else item.last = $("upLast").value || null;
    var list = upkeepItems().filter(function (x) { return x.id !== item.id; }); list.push(item); saveUpkeep(list);
    closeDetail(); toast(id ? "Saved" : "Added: " + name); render(true);
  }
  function markDone(id, force) {
    var list = upkeepItems(), u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    if (byReading(u)) {
      engSheet("up-sheet", '<div class="sbar"><span>MARK DONE</span><span>' + esc(u.name.toUpperCase()) + '</span></div><div class="sbody"><label class="ov-sub" for="upDoneRead">' + (u.unit === "miles" ? "ODOMETER" : "HOUR METER") + ' NOW</label>' +
        '<input type="number" id="upDoneRead" inputmode="numeric" min="0" value="' + (u.read != null ? u.read : "") + '"><div class="err" id="upErr" role="alert"></div>' +
        (function () { var rs = upkeepStatus(u, ymd(new Date())); return u.lastRead != null && u.read != null && /LEFT$/.test(rs.due) && !/^0 /.test(rs.due) ? '<p class="up-early-q">' + rs.due.replace(/ MI LEFT$/, " MI").replace(/ H LEFT$/, " HOURS") + " left before it's due.</p>" : ""; })() + "</div>" +
        '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-updoneread="' + esc(u.id) + '">DONE</button></div>');
      return;
    }
    var today = ymd(new Date()), st = upkeepStatus(u, today), early = u.last ? daysBetween(today, st.dueDay) : 0;
    if (early > 0 && !force) {   /* 2.73 (Timothy): marking done before it's due asks first, however early */
      engSheet("up-sheet up-early", '<div class="sbar"><span>NOT DUE FOR ' + early + (early === 1 ? " DAY" : " DAYS") + '</span><span>' + esc(u.name.toUpperCase()) + "</span></div>" +
        '<div class="sbody"><p class="up-early-q">' + esc(u.name) + " is due " + esc(dayWords(st.dueDay)) + ". Mark it done today?</p>" +
        '<p class="muted">The next would be due ' + esc(dayWords(addInterval(today, u.every, u.unit))) + ".</p></div>" +
        '<div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn" data-updoneforce="' + esc(u.id) + '">MARK DONE TODAY</button></div>');
      return;
    }
    var was = { last: u.last, hist: (u.hist || []).slice() };
    u.last = today; asUpkeepDone(u); saveUpkeep(list); render(true);
    toastUndo(u.name + " done. Next " + shortDay(addInterval(u.last, u.every, u.unit)), function () { upUndo(id, was); });
  }
  function dayWords(d) {   /* "Sun 15 Nov" (with the year when it isn't this one), for sentences */
    var x = parseYmd(d), t = function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); };
    return t(DOWL[x.getDay()].slice(0, 3)) + " " + x.getDate() + " " + t(MON[x.getMonth()]) + (x.getFullYear() !== new Date().getFullYear() ? " " + x.getFullYear() : "");
  }
  function upUndo(id, was) {   /* UNDO on the toast: the item as it was before MARK DONE */
    var list = upkeepItems(), u = list.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    Object.keys(was).forEach(function (k) { if (was[k] === undefined) delete u[k]; else u[k] = was[k]; });
    saveUpkeep(list); toast(u.name + ": back as it was"); render(true);
  }
  function engSheetClick(b) {
    var d = b.dataset;
    if (scnSheetClick(b) || scnOrderClick(b)) return true;
    if (haSheetClick(b)) return true;
    if (d.upunit) {
      $("detailSheet").dataset.unit = d.upunit;
      document.querySelectorAll("[data-upunit]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      $("upTimeRow").hidden = byReading({ unit: d.upunit }); $("upReadRow").hidden = !byReading({ unit: d.upunit });
      return true;
    }
    if (d.upsave !== undefined) { saveUpkeepItem(d.upsave); return true; }
    if (d.upcatpick !== undefined) { $("upCat").value = d.upcatpick; document.querySelectorAll("[data-upcatpick]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); return true; }
    if (d.updel) {
      if (eng.arm === "up:" + d.updel && Date.now() - eng.armAt < 4000) { saveUpkeep(upkeepItems().filter(function (x) { return x.id !== d.updel; })); eng.arm = null; closeDetail(); toast("Deleted"); render(true); }
      else { eng.arm = "up:" + d.updel; eng.armAt = Date.now(); b.textContent = "TAP AGAIN TO DELETE"; }
      return true;
    }
    if (d.updoneforce) { closeDetail(); markDone(d.updoneforce, true); return true; }
    if (d.updoneread) {
      var list = upkeepItems(), u = list.filter(function (x) { return x.id === d.updoneread; })[0], v = $("upDoneRead").value;
      if (v === "" || +v < 0) { $("upErr").textContent = "Enter the reading."; return true; }
      var was = { lastRead: u.lastRead, read: u.read, last: u.last, hist: (u.hist || []).slice() }, uid = u.id;
      u.lastRead = +v; u.read = +v; u.last = ymd(new Date()); asUpkeepDone(u); saveUpkeep(list); closeDetail(); render(true);
      toastUndo(u.name + " done. Next at " + (u.lastRead + u.every).toLocaleString() + (u.unit === "miles" ? " mi" : " h"), function () { upUndo(uid, was); });
      return true;
    }
    return false;
  }
  function engClick(b) {
    var d = b.dataset;
    if (d.engtab) { eng.tab = d.engtab; lsSet(LS_ENGTAB, eng.tab); render(false); return true; }
    if (haScreenClick(b)) return true;
    if (d.upedit) { openUpkeepItem(d.upedit); return true; }
    if (d.upview) { upSet({ view: d.upview }); return true; }
    if (d.upby) { upSet({ by: d.upby }); return true; }
    if (d.uprange) { upSet({ range: +d.uprange }); return true; }
    if (d.updone) { markDone(d.updone); return true; }
    if (!d.eng) return false;
    if (d.eng === "add") openAddDevice();
    else if (d.eng === "newitem") openUpkeepItem(null);
    else if (d.eng === "systems") go("systems");
    else if (d.eng === "groups") openGroups();
    return true;
  }
  /* --- one device: power, colour, white, brightness, effect, then this iPad's style and group --- */
  var HA_PRESETS = [["WARM", "ct", 2700], ["DAYLIGHT", "ct", 5000], ["POND BLUE", "hs", 205, 62], ["EVENING", "hs", 28, 80], ["FOREST", "hs", 130, 55], ["NIGHT RED", "hs", 0, 95]];
  function openDevSheet(id) {
    var d = haDevices().filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var s = eng.states[id], a = (s && s.attributes) || {}, c = devCaps(d);
    eng.sheetKind = "dev"; eng.sheetId = id; eng.arm = null;
    eng.sheetMode = c.col && (a.color_mode !== "color_temp" || !c.ct) ? "hs" : "ct";
    engSheet("hp-sheet", "");
    paintDevSheet();
  }
  function paintDevSheet() {
    var d = haDevices().filter(function (x) { return x.id === eng.sheetId; })[0];
    if (!d) { closeDetail(); return; }
    var s = eng.states[d.id], c = devCaps(d), on = isOn(s), dead = isDead(s), a = (s && s.attributes) || {}, lc = lampCss(d.id, s) || "var(--chrome-d)", p = pctOf(s);
    var gname = (haGroups().filter(function (g) { return g.id === d.g; })[0] || { nm: "NO ROOM" }).nm;
    var h = '<div class="sbar"><span>' + esc(d.name.toUpperCase()) + "</span><span>" + esc(gname) + '</span></div><div class="sbody">';
    if (!c.sw) h += '<div class="hp-read"><b class="tnum">' + esc(haStateTxt(d, s)) + "</b><small>" + esc(d.id) + (s && s.last_changed ? " · changed " + esc(sinceLabel(new Date(s.last_changed))) : "") + "</small></div>";
    else {
      h += '<div class="hp-top" style="--lc: ' + lc + '"><button type="button" class="hp-pwr" data-hatoggle="' + esc(d.id) + '" aria-pressed="' + on + '"' + (dead ? " disabled" : "") + ">" + (dead ? "—" : on ? "ON" : "OFF") + '</button><div class="hp-read"><b class="tnum" id="hpVal">' + esc(haStateTxt(d, s)) + "</b><small>" + esc(d.id) + "</small></div></div>";
      if (!dead && (c.col || c.ct || c.b)) {
        var mode = c.col && (eng.sheetMode === "hs" || !c.ct) ? "hs" : c.ct ? "ct" : null;
        if (c.col && c.ct) h += '<div class="chips">' + [["hs", "COLOR"], ["ct", "WHITE"]].map(function (m) { return '<button type="button" class="chip sm" data-hamode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>";
        if (mode === "hs") {
          h += '<div class="hp-color"><div class="hp-wheel' + (on ? "" : " off") + '" id="haWheel" role="slider" tabindex="0" aria-label="Colour. Arrow keys change hue and strength."><span class="knob" id="haKnob"></span></div>' +
            '<div class="hp-sec"><span class="ov-sub">QUICK COLORS</span><div class="hp-swatches">' + HA_PRESETS.filter(function (x) { return x[1] === "hs" || c.ct; }).map(function (x) {
              return '<button type="button" class="hp-swatch" data-hapreset="' + x.slice(1).join(",") + '"><i style="background:' + rgbCss(x[1] === "hs" ? hsvRgb(x[2], x[3]) : kelvinRgb(x[2])) + '"></i>' + x[0] + "</button>";
            }).join("") + "</div></div></div>";
        } else if (mode === "ct") {
          var k = Math.max(c.kmin, Math.min(c.kmax, a.color_temp_kelvin || Math.round((c.kmin + c.kmax) / 200) * 100));
          h += '<div class="hp-sec"><label class="ov-sub" for="haK">WHITE · WARM TO COOL</label><div class="hp-srow"><input class="hp-slider" id="haK" type="range" min="' + c.kmin + '" max="' + c.kmax + '" step="50" value="' + k + '" style="--track: linear-gradient(90deg, ' + rgbCss(kelvinRgb(c.kmin)) + ", " + rgbCss(kelvinRgb(c.kmax)) + ')"><output id="haKOut" class="tnum">' + k + " K</output></div></div>";
        }
        if (c.b) h += '<div class="hp-sec"><label class="ov-sub" for="haB">BRIGHTNESS</label><div class="hp-srow"><input class="hp-slider" id="haB" type="range" min="1" max="100" value="' + (on && p ? p : 100) + '" style="--track: linear-gradient(90deg, var(--panel-2), ' + lc + ')"><output id="haBOut" class="tnum">' + (on && p ? p : 100) + "%</output></div></div>";
        if (c.fx) h += '<div class="hp-sec"><span class="ov-sub">EFFECT</span><div class="chips">' + c.fx.map(function (f) { return '<button type="button" class="chip sm" data-hafx="' + esc(f) + '" aria-pressed="' + (a.effect === f) + '">' + esc(String(f).toUpperCase()) + "</button>"; }).join("") + "</div></div>";
      }
    }
    h += '<hr class="hp-split"><div class="hp-sec"><span class="ov-sub">CARD STYLE · ON THIS IPAD</span>' + stylePickHtml(c, styleOf(d)) + "</div>";
    h += '<div class="hp-sec"><span class="ov-sub">ROOM · ON THIS IPAD</span>' + groupChipsHtml(haGroupOf(d)) + "</div></div>";
    h += '<div class="sfoot btnrow"><button type="button" class="btn ghost" data-harm="' + esc(d.id) + '">' + (eng.arm === "rm" && Date.now() - eng.armAt < 4000 ? "TAP AGAIN TO REMOVE" : "REMOVE FROM SCREEN") + '</button><button type="button" class="btn" id="detailClose">DONE</button></div>';
    $("detailSheet").style.setProperty("--c", c.sw && on ? lc : "var(--chrome-d)");
    $("detailSheet").innerHTML = h;
    wireWheel();
  }
  function wireWheel() {
    var w = $("haWheel"), k = $("haKnob"), id = eng.sheetId;
    if (!w) return;
    var spot = function () {
      var s = eng.states[id], hs = (s && s.attributes && s.attributes.hs_color) || [0, 0], ang = hs[0] * Math.PI / 180, r = hs[1] / 2;
      k.style.left = (50 + Math.sin(ang) * r) + "%"; k.style.top = (50 - Math.cos(ang) * r) + "%"; k.style.background = rgbCss(hsvRgb(hs[0], hs[1]));
      w.setAttribute("aria-valuetext", "hue " + Math.round(hs[0]) + ", strength " + Math.round(hs[1]) + "%");
    };
    var at = null;
    var pick = function (e, final) {
      if (e) { var r = w.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; at = [Math.round((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360), Math.round(Math.min(1, Math.hypot(x, y) / (r.width / 2)) * 100)]; }
      if (!at) return;
      haLightSet(id, { hs_color: at }, final); spot(); haLive(id);
    };
    spot();
    w.addEventListener("pointerdown", function (e) { e.preventDefault(); try { w.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } eng.dragging = id; w.classList.remove("off"); pick(e, false); });
    w.addEventListener("pointermove", function (e) { if (eng.dragging === id) pick(e, false); });
    var end = function () { if (eng.dragging !== id) return; pick(null, true); eng.dragging = null; haRepaint(); };
    w.addEventListener("pointerup", end); w.addEventListener("pointercancel", end);
    w.addEventListener("keydown", function (e) {
      var dh = { ArrowLeft: -10, ArrowRight: 10 }[e.key], ds = { ArrowUp: 10, ArrowDown: -10 }[e.key];
      if (!dh && !ds) return;
      e.preventDefault();
      var s = eng.states[id], hs = (s && s.attributes && s.attributes.hs_color) || [0, 50];
      at = [(Math.round(hs[0]) + (dh || 0) + 360) % 360, Math.max(0, Math.min(100, Math.round(hs[1]) + (ds || 0)))];
      pick(null, true); setTimeout(haRepaint, 0);
    });
  }

  /* --- groups: rename, order, delete, new --- */
  function openGroups() { eng.sheetKind = "groups"; eng.arm = null; engSheet("hg-sheet", ""); paintGroups(); }
  function paintGroups() {
    var gs = haGroups(), devs = haDevices();
    $("detailSheet").innerHTML = '<div class="sbar"><span>ROOMS</span><span>ON THIS IPAD ONLY</span></div><div class="sbody"><div class="hg-edit">' + (gs.length ? gs.map(function (g, i) {
      var n = devs.filter(function (d) { return d.g === g.id; }).length;
      return '<div class="hg-row" style="--c: var(--' + HA_GCOL[i % HA_GCOL.length] + ')"><i aria-hidden="true"></i><input type="text" id="hgn-' + g.id + '" maxlength="30" value="' + esc(g.nm) + '" aria-label="Room name" data-hagname="' + g.id + '">' +
        '<button type="button" class="btn sm ghost" data-hagmove="' + g.id + ',-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Move up">▲</button><button type="button" class="btn sm ghost" data-hagmove="' + g.id + ',1"' + (i === gs.length - 1 ? " disabled" : "") + ' aria-label="Move down">▼</button>' +
        '<button type="button" class="btn sm ghost hg-del" data-hagdel="' + g.id + '">' + (eng.arm === "gdel:" + g.id && Date.now() - eng.armAt < 4000 ? "TAP AGAIN" : "DELETE" + (n ? " (" + n + ")" : "")) + "</button></div>";
    }).join("") : '<div class="empty">No rooms yet. Make one below, then put devices in it from each device\'s ⋯ button.</div>') +
      '</div><div class="hp-newg"><input type="text" id="haNewG" maxlength="30" placeholder="New room, e.g. Outside" aria-label="New room name"><button type="button" class="btn sm" data-hanewg="groups">+ ROOM</button></div>' +
      '<small class="muted">Kept on this iPad, separate from the areas in Home Assistant. Deleting a room keeps its devices; they show under OTHER. The order here is the order of the room chips.</small></div>' +
      '<div class="sfoot btnrow"><button type="button" class="btn" id="detailClose">DONE</button></div>';
  }

  /* --- taps --- */
  function haScreenClick(b) {
    var d = b.dataset;
    if (scnScreenClick(b)) return true;
    if (d.hatoggle) { haToggle(d.hatoggle); return true; }
    if (d.hadev) { openDevSheet(d.hadev); return true; }
    if (d.haview) { lsSet(LS_HAVIEW, d.haview); render(true); return true; }
    if (d.haroom) { lsSet(LS_HAROOM, d.haroom); render(true); return true; }
    if (d.haclim) { haClimStep(d.dev, +d.haclim); return true; }
    if (d.hahvac) { haHvac(d.dev, d.hahvac); return true; }
    if (d.haalloff) { haAllOff(d.haalloff); return true; }
    return false;
  }
  function haSheetClick(b) {
    var d = b.dataset, p = eng.pick;
    if (d.hatoggle) { haToggle(d.hatoggle); return true; }
    if (d.hapick) {
      var it = p && p.list && p.list.filter(function (x) { return x.id === d.hapick; })[0];
      if (!it) return true;
      p.d = { id: it.id, name: it.name, caps: it.caps, style: bestStyle(it.caps), g: null };
      paintAddStep2(); return true;
    }
    if (d.hastyle) {
      if (eng.sheetKind === "add" && p && p.d) { p.d.style = d.hastyle; paintAddStep2(); }
      else if (eng.sheetKind === "dev") { saveDev(eng.sheetId, { style: d.hastyle }); paintDevSheet(); render(true); }
      return true;
    }
    if (d.hagrp) {
      var g = d.hagrp === "_none" ? null : d.hagrp;
      if (eng.sheetKind === "add" && p && p.d) { p.d.g = g; paintAddStep2(); }
      else if (eng.sheetKind === "dev") { saveDev(eng.sheetId, { g: g }); paintDevSheet(); render(true); }
      return true;
    }
    if (d.hanewg) {
      var inp = $(d.hanewg === "add" ? "haAddNewG" : "haNewG"), nm = inp ? inp.value.trim() : "";
      if (!nm) { toast("Type a name for the room first"); if (inp) inp.focus(); return true; }
      var ng = newGroup(nm);
      if (d.hanewg === "add") { p.d.g = ng.id; paintAddStep2(); } else paintGroups();
      render(true); return true;
    }
    if (d.haaddgo) {
      var nd = p.d, devs = haDevices().filter(function (x) { return x.id !== nd.id; });
      devs.push({ id: nd.id, name: nd.name, style: nd.style, g: nd.g, caps: nd.caps }); lsSet(LS_HADEV, devs);
      if ((lsGet(LS_HAROOM) || "all") !== "all") lsSet(LS_HAROOM, nd.g || "_none");   /* show where it landed */
      eng.at = 0; closeDetail(); toast("Added: " + nd.name); render(true); return true;
    }
    if (d.hamode) { eng.sheetMode = d.hamode; paintDevSheet(); return true; }
    if (d.hapreset) {
      var pr = d.hapreset.split(",");
      haLightSet(eng.sheetId, pr[0] === "hs" ? { hs_color: [+pr[1], +pr[2]] } : { color_temp_kelvin: +pr[1] }, true);
      eng.sheetMode = pr[0]; paintDevSheet(); render(true); return true;
    }
    if (d.hafx) { haLightSet(eng.sheetId, { effect: d.hafx }, true); paintDevSheet(); return true; }
    if (d.harm) {
      if (eng.arm === "rm" && Date.now() - eng.armAt < 4000) {
        lsSet(LS_HADEV, haDevices().filter(function (x) { return x.id !== d.harm; })); eng.arm = null;
        closeDetail(); toast("Removed from this screen. Still in Home Assistant."); render(true);
      } else { eng.arm = "rm"; eng.armAt = Date.now(); paintDevSheet(); }
      return true;
    }
    if (d.hagmove) {
      var mv = d.hagmove.split(","), gs = haGroups(), i = gs.map(function (x) { return x.id; }).indexOf(mv[0]), j = i + +mv[1];
      if (i < 0 || j < 0 || j >= gs.length) return true;
      var t = gs[i]; gs[i] = gs[j]; gs[j] = t; lsSet(LS_HAGROUPS, gs); paintGroups(); render(true); return true;
    }
    if (d.hagdel) {
      if (eng.arm === "gdel:" + d.hagdel && Date.now() - eng.armAt < 4000) {
        lsSet(LS_HAGROUPS, haGroups().filter(function (x) { return x.id !== d.hagdel; })); eng.arm = null;
        toast("Room deleted. Its devices are under OTHER."); paintGroups(); render(true);
      } else { eng.arm = "gdel:" + d.hagdel; eng.armAt = Date.now(); paintGroups(); }
      return true;
    }
    return false;
  }
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "haQ" && eng.pick) { eng.pick.q = t.value; paintPick(); return; }
    if (t.dataset && t.dataset.hagname) {
      var nm = t.value.trim().toUpperCase().slice(0, 30);
      if (nm) { lsSet(LS_HAGROUPS, haGroups().map(function (g) { return g.id === t.dataset.hagname ? { id: g.id, nm: nm } : g; })); render(true); }
      return;
    }
    if (t.id === "haB" || t.id === "haK") {
      var id = eng.sheetId, v = +t.value;
      eng.dragging = id;
      if (t.id === "haB") { $("haBOut").textContent = v + "%"; haLightSet(id, { brightness_pct: v }, false); }
      else { $("haKOut").textContent = v + " K"; haLightSet(id, { color_temp_kelvin: v }, false); }
      haLive(id);
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id !== "haB" && t.id !== "haK") return;
    haLightSet(eng.sheetId, t.id === "haB" ? { brightness_pct: +t.value } : { color_temp_kelvin: +t.value }, true);
    eng.dragging = null; haRepaint();
  });
  /* The DIMMER card's bar: drag along it (or arrow keys) to set brightness. */
  document.addEventListener("pointerdown", function (e) {
    var bar = e.target.closest && e.target.closest("[data-halvl]");
    if (!bar) return;
    e.preventDefault();
    var id = bar.dataset.halvl, r = bar.getBoundingClientRect(), last = null, card = bar.closest(".hc");
    eng.dragging = id;
    try { bar.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
    var set = function (x) {
      last = Math.max(1, Math.min(100, Math.round((x - r.left) / r.width * 100)));
      haLightSet(id, { brightness_pct: last }, false);
      bar.querySelector("i").style.width = last + "%"; bar.querySelector("span").textContent = last + "%"; bar.setAttribute("aria-valuenow", last);
      card.classList.add("on"); var v = card.querySelector(".val"); if (v) v.textContent = last + "%";
    };
    set(e.clientX);
    var mv = function (ev) { set(ev.clientX); };
    var up = function () {
      bar.removeEventListener("pointermove", mv); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up);
      if (last != null) haLightSet(id, { brightness_pct: last }, true);
      eng.dragging = null; haRepaint();
    };
    bar.addEventListener("pointermove", mv); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
  });
  document.addEventListener("keydown", function (e) {
    var bar = e.target.dataset && e.target.dataset.halvl ? e.target : null;
    if (!bar || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    var p = pctOf(eng.states[bar.dataset.halvl]) || 50;
    haLightSet(bar.dataset.halvl, { brightness_pct: Math.max(1, Math.min(100, p + (e.key === "ArrowRight" ? 10 : -10))) }, true);
    render(true); var again = document.querySelector('[data-halvl="' + bar.dataset.halvl + '"]'); if (again) again.focus();
  });

  /* --- Systems: Home Assistant --- */
  function haSection() {
    var c = haConf(), n = nasConf(), armed = eng.arm === "haforget" && Date.now() - eng.armAt < 4000;
    return '<section id="sec-ha">' + phead("HOME ASSISTANT", c ? (eng.err ? "PROBLEM" : "SET") : "NOT SET") + '<dl class="kv">' +
      "<dt>ADDRESS</dt><dd>" + (c ? esc(c.url) + (haViaRelay(c.url) ? ' <span class="muted">· through the NAS relay</span>' : "") : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>TOKEN</dt><dd>" + (c ? "•••• " + esc(c.token.slice(-4)) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>DEVICES</dt><dd>" + haDevices().length + " on ENGINEERING</dd>" + (c ? scnSysHtml() : "") +
      '<dt>CHANGE</dt><dd><div class="ov-place"><input type="url" id="haUrl" placeholder="' + (n ? esc(nasBase()) + "/ha" : "https://home-assistant-address") + '" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + (c ? esc(c.url) : "") + '">' +
      '<input type="password" id="haTok" placeholder="' + (c ? "Token (leave blank to keep)" : "Long-lived access token") + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="btnrow" style="margin-top:8px">' + (n ? '<button type="button" class="btn ghost" data-act="harelay">USE THE NAS RELAY</button>' : "") + '<button type="button" class="btn" data-act="hasave">SAVE AND TEST</button>' +
      (c ? '<button type="button" class="btn ghost" data-act="haforget">' + (armed ? "TAP AGAIN TO FORGET" : "FORGET") + "</button>" : "") + "</div>" +
      '<div class="err" id="haErr" role="alert">' + (eng.err ? esc(eng.err.msg) : "") + "</div></dd></dl>" +
      '<small class="muted">Use a token from a Home Assistant user made for TimothyOS. The address and token stay on this iPad. Only devices you add on ENGINEERING are shown.</small></section>';
  }
  function haSave() {
    var url = ($("haUrl").value || "").trim().replace(/\/+$/, ""), tok = ($("haTok").value || "").trim(), cur = haConf(), errEl = $("haErr");
    if (!/^https:\/\/[^\s]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) { errEl.textContent = "Use an https address (the NAS relay's address plus /ha works)."; return; }
    if (!tok && !cur) { errEl.textContent = "Enter the long-lived access token."; return; }
    lsSet(LS_HA, { url: url, token: tok || cur.token });
    eng.err = null; eng.states = {}; eng.at = 0; errEl.textContent = "Testing…";
    lsDel(LS_HASCNCHK);   /* a new token: SCENES is checked again */
    haFetch("/api/").then(function () { toast("Home Assistant connected"); }, function (e) { eng.err = { code: e.code, msg: haErrText(e) }; }).then(function () { render(true); });
  }
  function haSysClick(b) {
    var a = b.dataset.act;
    if (a === "harelay") { $("haUrl").value = nasBase() + "/ha"; $("haUrl").focus(); return true; }
    if (a === "hasave") { haSave(); return true; }
    if (a === "hascncheck") { lsDel(LS_HASCNCHK); scnCheck(); render(true); return true; }
    if (a === "haforget") {
      if (eng.arm === "haforget" && Date.now() - eng.armAt < 4000) { lsDel(LS_HA); eng.arm = null; eng.err = null; eng.states = {}; toast("Home Assistant forgotten on this iPad"); }
      else { eng.arm = "haforget"; eng.armAt = Date.now(); setTimeout(function () { if (state.screen === "systems") render(true); }, 4100); }
      render(true); return true;
    }
    if (a === "engineering") { eng.tab = "upkeep"; lsSet(LS_ENGTAB, "upkeep"); go("engineering"); return true; }
    return false;
  }

