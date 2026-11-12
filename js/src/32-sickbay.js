  /* ---------- SICKBAY (2.74, bridge 1.43, D70): health from the Apple Watch, medicines, readings, notes ----------
     Timothy's mockup (2026-11-09): VITALS, SLEEP, RECORDS; a SCIENCE station. Apple Health has no web API (its data
     never leaves his devices unencrypted), so a shortcut on HUB reads Health and POSTs it to the bridge with its own
     HEALTH_KEY; the bridge keeps one Day page per date in 🩺 Sickbay (Notion) and the app reads them with the main
     key. Medicines, readings and notes are pages of their own, saved through tos.sickbayq.v1 like UPKEEP's queue.
     "Your normal" is the middle of the last 30 days (20th to 80th percentile), never anyone else's. Claude sees any
     of it only with SYSTEMS → SICKBAY → SHARE WITH ASK (tos.aisickbay.v1); Condition items carrying `health` are left
     out of ASK's snapshot otherwise. Health values never go in the repo, tests or commits. */
  var LS_SICK = "tos.sickbay.v1", LS_SICKQ = "tos.sickbayq.v1", LS_SICKVIEW = "tos.sickview.v1", LS_AISICK = "tos.aisickbay.v1";
  var SK_SHORTCUT = "Bridge Health";
  var SK_WORDS = ["doctor", "dentist", "dr.", "physical", "appointment", "clinic", "eye exam", "checkup", "check-up", "lab work", "blood work"];
  var SK_M = [
    { k: "rhr", name: "RESTING HEART RATE", unit: "bpm", dp: 0, better: "low", note: "Lower is usually better. A rise of 5 or more for two mornings often comes before a cold, or after poor sleep or a late meal." },
    { k: "hrv", name: "HEART RATE VARIABILITY", unit: "ms", dp: 0, better: "high", note: "How much the time between beats varies; higher means more recovered. Compare it only with your own normal." },
    { k: "sleep", name: "SLEEP", unit: "hours", dp: 1, better: "high", note: "Time asleep, from the watch on your wrist overnight. SLEEP has the stages and the week." },
    { k: "steps", name: "STEPS", unit: "steps", dp: 0, better: "high", note: "Steps for the whole day; today's count grows until the next sync." },
    { k: "resp", name: "BREATHING RATE", unit: "per min", dp: 1, better: "mid", note: "Breaths a minute while asleep. Steady for most people; a jump can be an early sign of illness." },
    { k: "vo2", name: "CARDIO FITNESS", unit: "VO2 max", dp: 1, better: "high", note: "Estimated by the watch from outdoor walks and runs. It moves slowly: weeks, not days." }
  ];
  var SK_STAGES = [["a", "AWAKE", "--sk-awake"], ["r", "REM", "--sk-rem"], ["c", "CORE", "--sk-core"], ["d", "DEEP", "--sk-deep"]];
  var SK_READS = [["Blood pressure", "mmHg", "120/80"], ["Weight", "lb", "185.0"], ["Glucose", "mg/dL", "95"], ["Other", "", "Value"]];
  var SK_TAGS = ["GOOD", "NOTE", "PAIN", "SICK", "TIRED"];
  var sk = { data: lsGet(LS_SICK), q: lsGet(LS_SICKQ) || { ops: [] }, at: 0, busy: false, sending: false, err: "", form: null, arm: null, armAt: 0, night: null, day: null, bar: null, goals: false };   /* 2.80: day (DAYS), bar (a tapped chart bar), goals (the GOALS editor open) */
  if (!Array.isArray(sk.q.ops)) sk.q = { ops: [] };
  function canSickbay() { return state.caps.indexOf("sickbay") > -1; }
  var SK_GOALS = { move: 500, exercise: 30, stand: 12 };   /* 2.80: Shortcuts can't read his Apple Activity goals, so he sets them here (synced with the view) */
  function skView() {
    var v = Object.assign({ tab: "vitals", metric: "hrv", range: 30, words: SK_WORDS.slice() }, lsGet(LS_SICKVIEW) || {});
    if ([7, 14, 30].indexOf(v.range) === -1) v.range = v.range > 30 ? 30 : 14;   /* 2.80: 7, 14 or 30 days (it was 7, 30 or 90) */
    v.goals = Object.assign({}, SK_GOALS, v.goals || {});
    return v;
  }
  function skSet(p) { lsSet(LS_SICKVIEW, Object.assign(skView(), p)); }
  function skDays() { return (sk.data && Array.isArray(sk.data.days) ? sk.data.days : []).filter(function (d) { return d && /^\d{4}-\d{2}-\d{2}$/.test(d.date); }); }
  function skDay(date) { return skDays().filter(function (d) { return d.date === date; })[0] || null; }
  function skItems(kind) {   /* the server's list with what hasn't gone up yet laid over it */
    var list = (sk.data && Array.isArray(sk.data.items) ? sk.data.items : []).slice();
    sk.q.ops.forEach(function (o) {
      list = list.filter(function (i) { return i.id !== (o.item ? o.item.id : o.id); });
      if (o.op === "save") list.push(o.item);
    });
    return list.filter(function (i) { return !kind || i.kind === kind; });
  }
  function skVal(d, k) { if (!d) return null; if (k === "sleep") return d.sleep && d.sleep.asleep ? d.sleep.asleep / 60 : null; return typeof d[k] === "number" ? d[k] : null; }
  function skSeries(k, n) {   /* the last n days ending today, null where nothing was sent */
    var out = [], t = sod(new Date());
    for (var i = n - 1; i >= 0; i--) { var d = ymd(addDays(t, -i)); out.push({ date: d, v: skVal(skDay(d), k) }); }
    return out;
  }
  function skNormal(k) {   /* 20th to 80th percentile of the last 30 days before today; null until 7 days are in */
    var xs = skSeries(k, 31).slice(0, 30).map(function (x) { return x.v; }).filter(function (v) { return v !== null; }).sort(function (a, b) { return a - b; });
    if (xs.length < 7) return { n: xs.length, lo: null, hi: null, mid: null };
    var q = function (p) { var i = (xs.length - 1) * p, a = Math.floor(i), b = Math.ceil(i); return xs[a] + (xs[b] - xs[a]) * (i - a); };
    var lo = q(0.2), hi = q(0.8), mid = q(0.5);
    if (hi - lo < Math.abs(mid) * 0.04) { lo = mid * 0.98; hi = mid * 1.02; }
    return { n: xs.length, lo: lo, hi: hi, mid: mid };
  }
  function skLatest(k, n) { var s = skSeries(k, n || 3); for (var i = s.length - 1; i >= 0; i--) if (s[i].v !== null) return s[i]; return null; }   /* readiness looks 3 days back; the tiles (2.80) a month */
  /* ---- 2.80 (bridge 1.47, D78): days arrive a day or two late, by design; DAYS shows each one catching up ---- */
  var SK_WHAT = { sleep: "sleep", rhr: "resting heart rate", hrv: "heart rate variability", resp: "breathing rate", temp: "wrist temperature", steps: "steps", active: "move", exercise: "exercise", stand: "stand", vo2: "cardio fitness" };
  var SK_DAILY = ["sleep", "rhr", "hrv", "resp", "steps", "active", "exercise", "stand"];   /* what a whole day has; cardio fitness and wrist temperature come when they come */
  function skAge(date) { return Math.round((sod(new Date()) - parseYmd(date)) / 864e5); }
  function skHas(d) { return !!d && SK_DAILY.concat(["vo2", "temp"]).some(function (k) { return skVal(d, k) !== null; }); }
  function skExpected() {   /* the measures the shortcut sends: on at least half of the last 14 days that arrived */
    var got = skSeries("rhr", 14).map(function (p) { return skDay(p.date); }).filter(skHas);
    return SK_DAILY.filter(function (k) { return got.filter(function (d) { return skVal(d, k) !== null; }).length * 2 >= got.length && got.length > 0; });
  }
  function skStatus(date, exp) {   /* arrived · partial (some of the day still to come) · waiting (nothing yet, as expected) · missing (later days came, this one didn't) */
    var d = skDay(date), age = skAge(date);
    if (!skHas(d)) {
      if (age <= 1) return { s: "waiting", lack: [] };
      var later = skDays().some(function (x) { return x.date > date && skHas(x); });
      return { s: later ? "missing" : "waiting", lack: [] };
    }
    var lack = (exp || skExpected()).filter(function (k) { return skVal(d, k) === null; });
    return { s: age === 0 || lack.length ? "partial" : "arrived", lack: lack };
  }
  var SK_DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function skShort(date) { var d = parseYmd(date); return SK_DOWL[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + MON[d.getMonth()].charAt(0) + MON[d.getMonth()].slice(1).toLowerCase(); }   /* Wed 11 Nov */
  function skWhen(iso) { var t = new Date(iso); return isNaN(t) ? "" : skShort(ymd(t)) + " " + p2(t.getHours()) + ":" + p2(t.getMinutes()); }
  function skList(keys) { var w = keys.map(function (k) { return SK_WHAT[k] || k; }); return w.length > 1 ? w.slice(0, -1).join(", ") + " and " + w[w.length - 1] : w.join(""); }
  function skRing(d, size, stroke, g) {   /* MOVE, EXERCISE, STAND as three rings, outside in; dashed where nothing came */
    var rs = [[d && skVal(d, "active"), g.move, "--chrome-d"], [d && skVal(d, "exercise"), g.exercise, "--hero"], [d && skVal(d, "stand"), g.stand, "--work"]], c = size / 2;
    return '<svg viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' + rs.map(function (q, i) {
      var r = c - stroke / 2 - i * (stroke + 3), circ = 2 * Math.PI * r, f = q[0] === null || q[0] === undefined ? null : Math.min(q[0] / q[1], 1);
      return '<circle cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '" fill="none" stroke="#24262f" stroke-width="' + stroke + '"' + (f === null ? ' stroke-dasharray="3 4"' : "") + "/>" +
        (f ? '<circle cx="' + c + '" cy="' + c + '" r="' + r.toFixed(1) + '" fill="none" stroke="var(' + q[2] + ')" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + (circ * f).toFixed(1) + " " + circ.toFixed(1) + '" transform="rotate(-90 ' + c + " " + c + ')"/>' : "");
    }).join("") + "</svg>";
  }
  function skRel(date) { var a = skAge(date); return a === 0 ? "TODAY" : a === 1 ? "YESTERDAY" : a + " DAYS AGO"; }
  function skTileWhen(date) { var a = skAge(date); return a === 0 ? "TODAY" : a === 1 ? "YESTERDAY" : DOW[parseYmd(date).getDay()] + " " + parseYmd(date).getDate(); }
  function skFmt(m, v) { if (v === null || v === undefined) return "–"; return m.k === "steps" ? Math.round(v).toLocaleString() : m.k === "sleep" ? skHM(v * 60) : v.toFixed(m.dp); }
  function skHM(min) { min = Math.round(min); return Math.floor(min / 60) + " h " + p2(min % 60); }
  function skWhere(m, v, nm) { if (v === null || nm.lo === null) return ""; return v > nm.hi ? "above" : v < nm.lo ? "below" : "in"; }
  function skGood(m, w) { return w === "in" || (w === "above" && m.better === "high") || (w === "below" && m.better === "low"); }
  function skReady() {   /* a simple guide, never a diagnosis: HRV and resting heart rate against your normal, last night's sleep */
    var hrv = skLatest("hrv"), rhr = skLatest("rhr"), sl = skLatest("sleep"), nh = skNormal("hrv"), nr = skNormal("rhr");
    if (!sl && !hrv && !rhr) return null;
    if (nh.lo === null && nr.lo === null) return { learning: Math.max(nh.n, nr.n) };
    var s = 75, why = [];
    if (hrv && nh.lo !== null) { if (hrv.v > nh.hi) { s += 10; why.push("heart rate variability above your normal"); } else if (hrv.v < nh.lo) { s -= 15; why.push("heart rate variability below your normal"); } else why.push("heart rate variability in your normal"); }
    if (rhr && nr.lo !== null) { if (rhr.v > nr.hi + 3) { s -= 15; why.push("resting heart rate up"); } else if (rhr.v < nr.lo) { s += 5; why.push("resting heart rate low"); } else why.push("resting heart rate steady"); }
    if (sl) { if (sl.v >= 7) { s += 5; why.push(skHM(sl.v * 60) + " of sleep"); } else if (sl.v < 5) { s -= 25; why.push("only " + skHM(sl.v * 60) + " of sleep"); } else if (sl.v < 6) { s -= 15; why.push("a short night (" + skHM(sl.v * 60) + ")"); } else why.push(skHM(sl.v * 60) + " of sleep"); }
    s = Math.max(0, Math.min(100, Math.round(s)));
    return { score: s, lvl: s >= 80 ? "ok" : s >= 60 ? "fair" : "warn", word: s >= 80 ? "✓ GOOD" : s >= 60 ? "◆ FAIR" : "▲ LOW", why: why };
  }
  function skLastSync() { return sk.data && sk.data.last ? Date.parse(sk.data.last) : 0; }

  /* ---- reading and saving ---- */
  function loadSickbay(force) {
    if (!canSickbay() || sk.busy || (!force && Date.now() - sk.at < 120000)) return Promise.resolve();
    sk.busy = true; sk.at = Date.now();
    return api({ action: "health", from: ymd(addDays(new Date(), -100)) }).then(function (j) {
      sk.data = { days: j.days || [], items: j.items || [], last: j.last || null, url: j.url || "", at: Date.now() }; sk.err = "";
      lsSet(LS_SICK, sk.data);
    }, function (e) { sk.err = describe(e); }).then(function () { sk.busy = false; skRedraw(); flushSickbay(); });
  }
  function skRedraw() { if (state.screen === "sickbay" || state.screen === "bridge" || state.screen === "systems") render(true); }
  function skQueue(op) { var key = op.item ? op.item.id : op.id; sk.q.ops = sk.q.ops.filter(function (o) { return (o.item ? o.item.id : o.id) !== key; }).concat([op]); lsSet(LS_SICKQ, sk.q); flushSickbay(); }
  function flushSickbay() {
    if (sk.sending || !sk.q.ops.length || !canSickbay() || !navigator.onLine) return Promise.resolve();
    var op = sk.q.ops[0]; sk.sending = true;
    return apiPost(op.op === "save" ? { action: "sickbaysave", item: op.item } : { action: "sickbayremove", id: op.id }, 30000).then(function (j) {
      sk.q.ops = sk.q.ops.filter(function (o) { return o !== op; }); lsSet(LS_SICKQ, sk.q);
      if (sk.data) {
        sk.data.items = (sk.data.items || []).filter(function (i) { return i.id !== (op.item ? op.item.id : op.id); });
        if (op.op === "save" && j.item) sk.data.items.push(j.item);
        lsSet(LS_SICK, sk.data);
      }
      sk.sending = false; return flushSickbay();
    }, function (e) {
      sk.sending = false; sk.err = describe(e);
      if (e && e.code === "bad_request") { sk.q.ops = sk.q.ops.filter(function (o) { return o !== op; }); lsSet(LS_SICKQ, sk.q); sk.err = "Notion refused a SICKBAY change; it was dropped."; }
    });
  }
  function skNewId(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function skSync() {   /* SYNC FROM HEALTH: the shortcut sends, then SICKBAY reads again when Bridge is back in front */
    sk.at = 0; toast("Opening the " + SK_SHORTCUT + " shortcut…");
    try { window.location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(SK_SHORTCUT); } catch (e) { /* not on an iPad */ }
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.screen === "sickbay") loadSickbay(true); });
  document.addEventListener("change", function (e) {   /* 2.80: the activity goals */
    var id = e.target && e.target.id, k = { skGoalMove: ["move", 5000], skGoalEx: ["exercise", 600], skGoalStand: ["stand", 24] }[id];
    if (!k) return;
    var n = Math.round(+e.target.value), g = skView().goals;
    if (!(n >= 1)) { render(true); return; }
    g[k[0]] = Math.min(k[1], n); skSet({ goals: g }); render(true);
  });

  /* ---- the screens ---- */
  function skHead() {
    var l = skLastSync();
    return { e: "SICKBAY · " + (!canSickbay() ? "SETUP" : l ? "FROM HEALTH " + stamp(l).toUpperCase() : skDays().length ? "FROM HEALTH" : "NOT SYNCED YET"), t: "SICKBAY" };
  }
  function renderSickbay() {
    loadSickbay(false);
    var v = skView(), html = '<div class="sk">';
    if (!canSickbay()) { $("content").innerHTML = html + phead("SICKBAY", "SETUP", "personal") + stubBox(state.conn ? "Needs the Google bridge updated to 1.43, and 🩺 Sickbay connected to the TimothyOS integration in Notion. Steps are in the README under <b>SICKBAY</b>." : "Link the calendars first.") + "</div>"; return; }
    html += '<div class="sk-top"><div class="btnrow" role="tablist" aria-label="SICKBAY">' + [["vitals", "VITALS"], ["sleep", "SLEEP"], ["days", "DAYS"], ["records", "RECORDS"]].map(function (t) {
      return '<button type="button" class="chip" role="tab" style="--c: var(--chrome-d)" data-sktab="' + t[0] + '" aria-selected="' + (v.tab === t[0]) + '" aria-pressed="' + (v.tab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="chip" style="--c: var(--personal)" data-skact="sync">SYNC FROM HEALTH</button></div>';
    if (sk.err) html += '<div class="err">' + esc(sk.err) + "</div>";
    if (sk.q.ops.length) html += '<div class="stale">' + sk.q.ops.length + (sk.q.ops.length === 1 ? " change" : " changes") + " waiting to reach Notion.</div>";
    html += skArriveHtml();
    html += v.tab === "sleep" ? skSleepHtml(v) : v.tab === "records" ? skRecordsHtml(v) : v.tab === "days" ? skDaysHtml(v) : skVitalsHtml(v);
    $("content").innerHTML = html + "</div>";
  }
  function skEmpty() {
    return '<div class="sk-empty"><b>No health data yet.</b><span>Build the <b>' + SK_SHORTCUT + "</b> shortcut on this iPad (README → SICKBAY), run it once, then come back here. " +
      "Your iPhone stays on, charging and on Wi-Fi so the watch can pass its data to iCloud.</span></div>";
  }
  function skBars(vals, lo, hi, band, last) {   /* bars from the bottom of the box, a dashed band for your normal */
    var nums = vals.filter(function (x) { return x !== null; }).concat(band ? [band.lo, band.hi] : []);
    if (!nums.length) return "";
    var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums), pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.05 || 1; mn -= pad; mx += pad * 0.4;
    var H = function (x) { return ((x - mn) / (mx - mn) * 100).toFixed(1); };
    return (band && band.lo !== null ? '<span class="sk-band" aria-hidden="true" style="bottom:' + H(band.lo) + "%;height:" + (H(band.hi) - H(band.lo)).toFixed(1) + '%"><i>YOUR NORMAL</i></span>' : "") +
      '<span class="sk-bars" aria-hidden="true">' + vals.map(function (x, i) {
        var out = band && band.lo !== null && x !== null && (x > band.hi || x < band.lo);
        return '<i class="' + (x === null ? "sk-none" : i === vals.length - 1 && last ? "sk-now" : out ? "sk-out" : "") + '" style="height:' + (x === null ? "3" : Math.max(3, H(x))) + '%"></i>'; }).join("") + "</span>";
  }
  function skArriveHtml() {   /* 2.80 (S1): on every tab, how far behind Health is */
    if (!skDays().length) return "";
    var exp = skExpected(), recent = [], full = null;
    for (var i = 13; i >= 0; i--) { var dt = ymd(addDays(new Date(), -i)), st = skStatus(dt, exp); if (st.s === "arrived") full = dt; else recent.push(skShort(dt) + " (" + (st.s === "missing" ? "missed" : st.s) + ")"); }
    return '<div class="sk-arrive"><span class="sk-adot" aria-hidden="true"></span><span><b>HEALTH ARRIVES A DAY OR TWO LATE</b><small>' + (full ? "Latest complete day: " + skShort(full) + ". " : "No complete day in the last two weeks yet. ") +
      (recent.length ? "Still coming in: " + recent.join(", ") + "." : "Everything is in.") + "</small></span>" +
      (skView().tab !== "days" ? '<button type="button" class="chip sm" style="--c: var(--personal)" data-sktab="days">SEE THE DAYS</button>' : "") + "</div>";
  }
  function skVitalsHtml(v) {
    if (!skDays().length) return skEmpty();
    var r = skReady(), ls = skLatest("sleep"), html = '<div class="sk-row sk-row1">';
    html += '<section class="sk-ready" aria-label="Readiness"><span class="sk-lbl">READINESS · ' + (!ls || ls.date === ymd(new Date()) ? "THIS MORNING" : "FROM " + skShort(ls.date).toUpperCase() + ", THE LATEST NIGHT IN") + "</span>" + (!r ? '<b class="sk-big">–</b><small>Waiting for last night.</small>' : r.learning !== undefined
      ? '<b class="sk-big">…</b><small>Learning your normal: ' + r.learning + " of 7 days so far. Readiness starts once a week is in.</small>"
      : '<div class="sk-rs"><b class="sk-big">' + r.score + '</b><span class="sk-word ' + r.lvl + '">' + r.word + '</span></div><small>' + esc(r.why.join(", ").replace(/^./, function (c) { return c.toUpperCase(); })) + ". A guide, not a diagnosis.</small>") + "</section>";
    var g = v.goals, exp = skExpected();
    html += '<section class="sk-today" aria-label="Activity, the last 7 days"><div class="sk-dh"><span class="sk-lbl">ACTIVITY · THE LAST 7 DAYS · TAP A DAY</span><button type="button" class="chip sm" style="--c: var(--chrome-d)" data-skact="goals" aria-pressed="' + sk.goals + '">GOALS</button></div><div class="sk-week7">';
    for (var i = 6; i >= 0; i--) {
      var dt = ymd(addDays(new Date(), -i)), dd = skDay(dt), st = skStatus(dt, exp);
      html += '<button type="button" class="sk-dayring" data-skday="' + dt + '" aria-label="' + SK_DOWL[parseYmd(dt).getDay()] + ": " + (dd && skVal(dd, "active") !== null ? "move " + skVal(dd, "active") + " of " + g.move + ", exercise " + (skVal(dd, "exercise") === null ? "not in" : skVal(dd, "exercise")) + " of " + g.exercise + ", stand " + (skVal(dd, "stand") === null ? "not in" : skVal(dd, "stand")) + " of " + g.stand : "not in yet") + '">' +
        skRing(st.s === "missing" ? null : dd, 64, 7, g) + "<small>" + (i === 0 ? "TODAY" : DOW[parseYmd(dt).getDay()]) + "</small></button>";
    }
    html += '</div><div class="sk-legend"><span><i style="background:var(--chrome-d)"></i>MOVE ' + g.move + ' KCAL</span><span><i style="background:var(--hero)"></i>EXERCISE ' + g.exercise + ' MIN</span><span><i style="background:var(--work)"></i>STAND ' + g.stand + " H</span><span>DASHED: NOT IN YET</span></div>";
    if (sk.goals) html += '<div class="sk-goals"><label><span class="sk-lbl">MOVE (KCAL)</span><input id="skGoalMove" type="number" inputmode="numeric" min="1" max="5000" value="' + g.move + '"></label>' +
      '<label><span class="sk-lbl">EXERCISE (MIN)</span><input id="skGoalEx" type="number" inputmode="numeric" min="1" max="600" value="' + g.exercise + '"></label>' +
      '<label><span class="sk-lbl">STAND (H)</span><input id="skGoalStand" type="number" inputmode="numeric" min="1" max="24" value="' + g.stand + '"></label>' +
      '<small class="muted">Shortcuts can\'t read your Apple goals, so set them here once. They follow you to the other iPad.</small></div>';
    html += "</section></div>";
    var m = SK_M.filter(function (x) { return x.k === v.metric; })[0] || SK_M[1];
    html += '<div class="sk-row"><div class="sk-tiles">' + SK_M.map(function (x) {
      var l = skLatest(x.k, 30), nm = skNormal(x.k), w = skWhere(x, l && l.v, nm);
      return '<button type="button" class="sk-tile' + (l ? "" : " sk-unsent") + '" data-skm="' + x.k + '" aria-pressed="' + (x.k === m.k) + '"><span class="sk-th"><span>' + x.name + "</span>" +
        (w ? '<span class="sk-flag ' + (skGood(x, w) ? "ok" : "warn") + '">' + (w === "in" ? "✓ NORMAL" : "▲ " + w.toUpperCase() + " NORMAL") + "</span>" : nm.lo === null && l ? '<span class="sk-flag">LEARNING</span>' : "") + "</span>" +
        '<span class="sk-tv"><b>' + (l ? skFmt(x, l.v) : "NOT SENT YET") + "</b><small>" + (l && x.k !== "sleep" ? x.unit : "") + '</small></span><span class="sk-when">' + (l ? skTileWhen(l.date) : "ADD IT TO THE SHORTCUT") + "</span></button>";
    }).join("") + "</div>";
    var nm = skNormal(m.k), s = skSeries(m.k, v.range), l = skLatest(m.k, 30), got = s.filter(function (p) { return p.v !== null; });
    var nums = got.map(function (p) { return p.v; }).concat(nm.lo !== null ? [nm.lo, nm.hi] : []), lastGot = got.length ? got[got.length - 1].date : null;
    var mn = nums.length ? Math.min.apply(null, nums) : 0, mx = nums.length ? Math.max.apply(null, nums) : 1, pad = (mx - mn) * 0.15 || Math.abs(mx) * 0.05 || 1; mn -= pad; mx += pad * 0.4;
    var H = function (x) { return ((x - mn) / (mx - mn) * 100).toFixed(1); }, sel = s.filter(function (p) { return p.date === sk.bar; })[0];
    html += '<section class="sk-detail" aria-label="' + m.name + '"><div class="sk-dh"><span class="sk-lbl c">' + m.name + '</span><span class="btnrow">' + [7, 14, 30].map(function (n) {
      return '<button type="button" class="chip sm" style="--c: var(--personal)" data-skrange="' + n + '" aria-pressed="' + (v.range === n) + '">' + n + "D</button>"; }).join("") + "</span></div>" +
      '<div class="sk-dv"><b>' + skFmt(m, l && l.v) + "</b><small>" + (m.k === "sleep" ? "" : m.unit + " · ") + (l ? "on " + skShort(l.date) : "nothing yet") + "</small></div>" +
      '<p class="sk-p">Your normal: <b>' + (nm.lo === null ? "after 7 days (" + nm.n + " so far)" : skFmt(m, nm.lo) + " to " + skFmt(m, nm.hi) + (m.k === "sleep" ? "" : " " + m.unit)) + "</b>" + (nm.lo === null ? "" : " (the middle of your last 30 days)") + "</p>" +
      '<div class="sk-chart r' + v.range + '">' + (nm.lo !== null && nums.length ? '<span class="sk-band" aria-hidden="true" style="bottom:' + H(nm.lo) + "%;height:" + (H(nm.hi) - H(nm.lo)).toFixed(1) + '%"><i>YOUR NORMAL</i></span>' : "") +
      '<span class="sk-bars sk-tap">' + s.map(function (p) {
        var out = nm.lo !== null && p.v !== null && (p.v > nm.hi || p.v < nm.lo), cls = p.v === null ? "sk-none" : p.date === sk.bar ? "sk-sel" : p.date === lastGot ? "sk-now" : out ? "sk-out" : "";
        return '<button type="button" class="' + cls + '" data-skbar="' + p.date + '" aria-label="' + esc(SK_DOWL[parseYmd(p.date).getDay()] + " " + parseYmd(p.date).getDate() + ": " + (p.v === null ? "nothing yet" : skFmt(m, p.v) + (m.k === "sleep" ? "" : " " + m.unit))) + '"><i style="height:' + (p.v === null ? 100 : Math.max(3, H(p.v))) + '%"></i></button>';
      }).join("") + "</span></div>" +
      '<div class="sk-axis"><span>' + v.range + ' DAYS AGO</span><span>TODAY</span></div>' +
      '<div class="sk-bartip">' + (sel ? "<b>" + esc(SK_DOWL[parseYmd(sel.date).getDay()] + " " + parseYmd(sel.date).getDate() + " " + MONL[parseYmd(sel.date).getMonth()].charAt(0) + MONL[parseYmd(sel.date).getMonth()].slice(1).toLowerCase()) + ":</b> " +
        (sel.v === null ? "nothing arrived yet" : esc(skFmt(m, sel.v) + (m.k === "sleep" ? "" : " " + m.unit))) + ' <button type="button" class="chip sm" style="--c: var(--personal)" data-skday="' + sel.date + '">OPEN THE DAY</button>'
        : '<small class="muted">Tap a bar for that day. Hatched bars: nothing arrived yet.</small>') + "</div>" +
      '<p class="sk-p">' + esc(m.note) + "</p></section></div>";
    return html;
  }
  /* ---- DAYS (2.80, S1 to S3): the last 14 days, each one opened whole ---- */
  function skDaysHtml(v) {
    if (!skDays().length) return skEmpty();
    var exp = skExpected(), today = ymd(new Date()), oldest = skDays()[0].date;
    if (!sk.day) { for (var i = 0; i < 14 && !sk.day; i++) { var c = ymd(addDays(new Date(), -i)); if (skStatus(c, exp).s === "arrived") sk.day = c; } sk.day = sk.day || today; }
    var x = sk.day, d = skDay(x), st = skStatus(x, exp), html = '<section class="sk-panel" aria-label="The last 14 days"><div class="sk-dh"><span class="sk-lbl c">THE LAST 14 DAYS · TAP ONE</span>' +
      '<span class="sk-key"><span><i class="sk-s-arrived"></i>ARRIVED</span><span><i class="sk-s-partial"></i>PARTIAL</span><span><i class="sk-s-waiting"></i>WAITING</span><span><i class="sk-s-missing"></i>MISSED</span></span></div><div class="sk-strip">';
    for (var k = 13; k >= 0; k--) {
      var dt = ymd(addDays(new Date(), -k)), q = skStatus(dt, exp), pd = parseYmd(dt);
      html += '<button type="button" class="sk-dchip" data-skday="' + dt + '" aria-pressed="' + (dt === x) + '" aria-label="' + SK_DOWL[pd.getDay()] + " " + pd.getDate() + ", " + (q.s === "missing" ? "missed" : q.s) + '"><small>' + DOW[pd.getDay()] + "</small><b>" + pd.getDate() + '</b><i class="sk-s-' + q.s + '"></i></button>';
    }
    html += "</div></section>";
    var pd2 = parseYmd(x), pill = { arrived: "✓ ARRIVED", partial: "◐ PARTIAL", waiting: "… WAITING", missing: "✕ MISSED" }[st.s];
    html += '<section class="sk-ready sk-day" aria-label="The day"><div class="sk-dayhead"><div><span class="sk-lbl">' + skRel(x) + '</span><h3>' + SK_DOWL[pd2.getDay()].toUpperCase() + " " + pd2.getDate() + " " + MONL[pd2.getMonth()] + "</h3></div>" +
      '<div class="btnrow"><span class="sk-pill sk-p-' + st.s + '">' + pill + '</span><button type="button" class="chip sm" data-skstep="-1"' + (x <= oldest ? " disabled" : "") + '>◂ EARLIER</button><button type="button" class="chip sm" data-skstep="1"' + (x >= today ? " disabled" : "") + ">LATER ▸</button></div></div>";
    if (st.s === "waiting") return html + '<div class="sk-emptyday"><b>NOTHING HAS ARRIVED FOR ' + SK_DOWL[pd2.getDay()].toUpperCase() + ' YET</b><span>That\'s expected: the shortcut sends the last 3 days each morning, so a night\'s sleep comes with the next morning\'s send, and the whole day (steps, rings) the morning after. Expect it by ' + skShort(ymd(addDays(pd2, 2))) + ".</span></div></section>";
    if (st.s === "missing") return html + '<div class="sk-emptyday sk-missed"><b>NOTHING ARRIVED FOR THIS DAY</b><span>The sends before and after it came in, so this day was skipped (the iPhone may have been off or locked through the morning). The daily send covers only the last 3 days. To fill it in, run the ' + SK_SHORTCUT + " shortcut by hand with its Health range reaching back to this date; SICKBAY takes days up to 14 days back.</span></div></section>";
    var gotLine = d._got ? "<span><b>Arrived " + esc(skWhen(d._got)) + "</b>, " + (function () { var n = Math.round((parseYmd(ymd(new Date(d._got))) - pd2) / 864e5); return n <= 0 ? "the same day" : n === 1 ? "1 day later" : n + " days later"; })() + ".</span>" : "<span>Arrived before arrival times were kept (bridge 1.47).</span>";
    var updLine = d._upd ? "<span><b>Updated " + esc(skWhen(d._upd)) + "</b>: added " + esc(skList(Array.isArray(d._add) ? d._add : [])) + ".</span>" : "";
    var lackLine = st.s === "partial" ? '<span class="sk-lack">' + (x === today ? "Today is still under way: its steps and rings grow with each send." : "Still to come: " + esc(skList(st.lack)) + ", with the next morning's send.") + "</span>" : "";
    html += '<div class="sk-stamp">' + gotLine + updLine + lackLine + "</div>";
    var g = v.goals;
    html += '<div class="sk-daygrid"><div class="sk-col"><section class="sk-panel sk-inner" aria-label="Activity"><span class="sk-lbl">ACTIVITY</span><div class="sk-ringbox">' + skRing(d, 150, 16, g) + '<div class="sk-rv">' +
      [["MOVE", "active", g.move, "kcal", "--chrome-d"], ["EXERCISE", "exercise", g.exercise, "min", "--hero"], ["STAND", "stand", g.stand, "h", "--work"]].map(function (q) {
        var n = skVal(d, q[1]);
        return '<div><span style="color:var(' + q[4] + ')">' + q[0] + "</span><span>" + (n === null ? '<span class="muted">NOT IN YET</span>' : "<b>" + Math.round(n).toLocaleString() + "</b> of " + q[2] + " " + q[3] + (n >= q[2] ? ' <span class="sk-met">✓</span>' : "")) + "</span></div>";
      }).join("") + "</div></div></section>";
    if (d.sleep && d.sleep.asleep) {
      var S = d.sleep, len = S.len || (S.asleep + (S.awake || 0)) || 1, segs = (S.segs || []).slice().sort(function (a, b) { return a[1] - b[1]; });
      html += '<section class="sk-panel sk-inner" aria-label="Sleep"><div class="sk-dh"><span class="sk-lbl">THE NIGHT BEFORE · SLEEP</span><span class="sk-lbl">' + esc(S.bed || "") + (S.wake ? " TO " + esc(S.wake) : "") + "</span></div>" +
        '<div class="sk-dv"><b>' + skHM(S.asleep) + "</b><small>asleep" + (S.awake ? " · " + skHM(S.awake) + " awake" : "") + "</small></div>" +
        '<div class="sk-sleepbar" role="img" aria-label="Sleep stages through the night">' + (segs.length ? segs.map(function (g2) { var stg = SK_STAGES.filter(function (z) { return z[0] === g2[0]; })[0]; return '<i style="left:' + (g2[1] / len * 100).toFixed(2) + "%;width:" + Math.max(0.3, g2[2] / len * 100).toFixed(2) + "%;background:var(" + (stg ? stg[2] : "--line") + ')"></i>'; }).join("")
          : [["d", S.deep], ["c", S.core], ["r", S.rem], ["a", S.awake]].reduce(function (acc, q) { var stg = SK_STAGES.filter(function (z) { return z[0] === q[0]; })[0]; acc.h += '<i style="left:' + (acc.at / len * 100).toFixed(2) + "%;width:" + ((q[1] || 0) / len * 100).toFixed(2) + "%;background:var(" + stg[2] + ')"></i>'; acc.at += q[1] || 0; return acc; }, { h: "", at: 0 }).h) + "</div>" +
        '<div class="sk-legend">' + [["d", S.deep], ["c", S.core], ["r", S.rem], ["a", S.awake]].map(function (q) { var stg = SK_STAGES.filter(function (z) { return z[0] === q[0]; })[0]; return '<span><i style="background:var(' + stg[2] + ')"></i>' + stg[1] + " " + skHM(q[1] || 0) + "</span>"; }).join("") + "</div>" +
        '<button type="button" class="chip sm" style="--c: var(--personal)" data-sknight="' + x + '" data-sktab="sleep">OPEN IN SLEEP</button></section>';
    }
    html += "</div>";
    var nt = skNormal("temp"), lv = skLatest("vo2", 60);
    html += '<section class="sk-panel sk-inner" aria-label="Every measure"><span class="sk-lbl">EVERY MEASURE FOR THIS DAY</span><div class="sk-mfs">' + [["Resting heart rate", "rhr"], ["Heart rate variability", "hrv"], ["Breathing rate", "resp"], ["Wrist temperature", "temp"], ["Steps", "steps"], ["Cardio fitness", "vo2"]].map(function (q) {
      var m = SK_M.filter(function (z) { return z.k === q[1]; })[0], n = skVal(d, q[1]), nm = m ? skNormal(m.k) : null, w = m && n !== null ? skWhere(m, n, nm) : "", shown = "";
      if (n !== null) shown = q[1] === "temp" ? (nt.mid === null ? n.toFixed(1) + "<small>°</small>" : (n - nt.mid >= 0 ? "+" : "") + (n - nt.mid).toFixed(1) + "<small>° from your normal</small>") : esc(skFmt(m, n)) + "<small>" + esc(m.unit) + "</small>";
      var why = q[1] === "vo2" ? "The watch estimates it every few days, from outdoor walks. Latest: " + (lv ? lv.v.toFixed(1) + " on " + skShort(lv.date) : "none yet") + "." : st.s === "partial" && st.lack.indexOf(q[1]) > -1 ? "Comes with the next morning's send." : exp.indexOf(q[1]) === -1 && q[1] !== "temp" ? "Not part of the shortcut yet (README → SICKBAY)." : "Not sent for this day.";
      return '<div class="sk-mf"><span>' + q[0] + "</span>" + (n === null ? '<span class="sk-ns">' + (q[1] === "vo2" ? "NOT MEASURED" : "NOT IN") + '</span><span class="sk-why">' + esc(why) + "</span>"
        : '<span class="sk-mv">' + shown + "</span>" + (w ? '<span class="sk-vs ' + (skGood(m, w) ? "ok" : "warn") + '">' + (w === "in" ? "Within" : w === "above" ? "Above" : "Below") + " your normal (" + skFmt(m, nm.lo) + " to " + skFmt(m, nm.hi) + ")</span>" : "")) + "</div>";
    }).join("") + "</div></section></div></section>";
    return html;
  }
  function skNights() { return skDays().filter(function (d) { return d.sleep && d.sleep.asleep; }); }
  function skSleepHtml(v) {
    var nights = skNights();
    if (!nights.length) return skEmpty();
    var cur = nights.filter(function (d) { return d.date === sk.night; })[0] || nights[nights.length - 1], S = cur.sleep, len = S.len || (S.asleep + S.awake) || 1;
    var html = '<div class="sk-row"><div class="sk-col"><section class="sk-panel" aria-label="Sleep stages"><span class="sk-lbl">STAGES · NIGHT ENDING ' + esc(shortDay(cur.date)) + " · " + esc(S.bed || "") + " TO " + esc(S.wake || "") + "</span>";
    SK_STAGES.forEach(function (st) {
      var segs = (S.segs || []).filter(function (g) { return g[0] === st[0]; }), tot = { a: S.awake, r: S.rem, c: S.core, d: S.deep }[st[0]] || 0;
      html += '<div class="sk-lane"><span>' + st[1] + '</span><span class="sk-lt" role="img" aria-label="' + st[1] + ", " + skHM(tot) + " in " + segs.length + (segs.length === 1 ? " spell" : " spells") + '">' + segs.map(function (g) {
        return '<i style="left:' + (g[1] / len * 100).toFixed(2) + "%;width:" + Math.max(0.3, g[2] / len * 100).toFixed(2) + "%;background:var(" + st[2] + ')"></i>'; }).join("") + "</span><b>" + skHM(tot) + "</b></div>";
    });
    if (!(S.segs || []).length) html += '<small class="muted">Only the night\'s totals came across, not the stages through the night.</small>';
    html += "</section>";
    var week = nights.slice(-7), mx = Math.max.apply(null, week.map(function (d) { return d.sleep.asleep; }).concat([480]));
    html += '<section class="sk-panel sk-week" aria-label="The week"><div class="sk-dh"><span class="sk-lbl">THE LAST ' + week.length + (week.length === 1 ? " NIGHT" : " NIGHTS") + ' · HOURS ASLEEP · GOAL 7 H 30</span><span class="sk-legend">' + SK_STAGES.slice(1).map(function (st) { return '<span><i style="background:var(' + st[2] + ')"></i>' + st[1] + "</span>"; }).join("") + "</span></div>" +
      '<div class="sk-nights"><span class="sk-goal" aria-hidden="true" style="bottom:calc(' + (450 / mx * 78).toFixed(1) + '% + 30px)"></span>' + week.map(function (d) {
        var sl = d.sleep, on = d.date === cur.date;
        return '<button type="button" class="sk-night" data-sknight="' + d.date + '" aria-pressed="' + on + '" aria-label="' + esc(shortDay(d.date)) + ": " + skHM(sl.asleep) + ' asleep"><small>' + skHM(sl.asleep).replace(" h ", ":") + '</small><span class="sk-stack" style="height:' + (sl.asleep / mx * 78).toFixed(1) + '%">' +
          ["d", "r", "c"].map(function (k) { var st = SK_STAGES.filter(function (x) { return x[0] === k; })[0]; return '<i style="flex:' + ({ d: sl.deep, r: sl.rem, c: sl.core }[k] || 0) + " 0 0;background:var(" + st[2] + ')"></i>'; }).join("") +
          "</span><b>" + DOW[parseYmd(d.date).getDay()] + "</b></button>"; }).join("") + "</div></section></div>";
    var nt = skNormal("temp"), facts = [["In bed", skHM(len)], ["Fell asleep", S.bed || "–"], ["Woke", S.wake || "–"], ["Deep", S.asleep ? Math.round(S.deep / S.asleep * 100) + "% of the night" : "–"],
      ["Breathing", typeof cur.resp === "number" ? cur.resp.toFixed(1) + " a minute" : "–"], ["Wrist temperature", typeof cur.temp === "number" && nt.mid !== null ? (cur.temp - nt.mid >= 0 ? "+" : "") + (cur.temp - nt.mid).toFixed(1) + "° from your normal" : typeof cur.temp === "number" ? "learning your normal" : "–"]];
    var beds = week.map(function (d) { var p = String(d.sleep.bed || "").split(":"); var m2 = +p[0] * 60 + +p[1]; return m2 < 720 ? m2 + 1440 : m2; }).filter(function (x) { return isFinite(x); });
    var spread = beds.length > 2 ? Math.max.apply(null, beds) - Math.min.apply(null, beds) : 0;
    html += '<aside class="sk-panel sk-side" aria-label="The night"><div class="sk-dh"><span class="sk-lbl c">NIGHT ENDING ' + esc(shortDay(cur.date)) + '</span><button type="button" class="chip sm" style="--c: var(--personal)" data-skday="' + cur.date + '">OPEN THE DAY</button></div><div class="sk-dv"><b>' + skHM(S.asleep) + "</b><small>asleep</small></div>" +
      facts.map(function (f) { return '<div class="sk-fact"><span>' + f[0] + "</span><span>" + esc(f[1]) + "</span></div>"; }).join("") +
      (spread > 45 ? '<div class="sk-tip"><b>▲ THIS WEEK</b><span>Bedtime varied by ' + skHM(spread) + " across these nights. A steadier bedtime usually brings more deep sleep.</span></div>" : "") + "</aside></div>";
    return html;
  }
  function skAppts(v) {
    var now = new Date(), words = (v.words || []).map(function (w) { return String(w).toLowerCase().trim(); }).filter(Boolean);
    if (!words.length) return [];
    return eventsFor({ from: sod(now), to: addDays(sod(now), 62) }).filter(function (e) { var t = String(e.title || "").toLowerCase(); return e._e >= now && words.some(function (w) { return t.indexOf(w) > -1; }); })
      .sort(function (a, b) { return a._s - b._s; }).slice(0, 6);
  }
  function skRecordsHtml(v) {
    var f = sk.form, today = ymd(new Date()), armed = function (id) { return sk.arm === id && Date.now() - sk.armAt < 4000; };
    var meds = skItems("medicine").sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = '<div class="sk-grid"><div class="sk-col"><section class="sk-panel" aria-label="Medicines"><div class="sk-dh"><span class="sk-lbl c">MEDICINES AND SUPPLEMENTS · TODAY</span><button type="button" class="chip sm" style="--c: var(--personal)" data-skform="med">+ MEDICINE</button></div>';
    if (f && f.k === "med") html += '<div class="sk-form"><label class="ov-sub" for="skMedName">NAME</label><input id="skMedName" type="text" maxlength="80" autocomplete="off" value="' + esc(f.name || "") + '">' +
      '<label class="ov-sub" for="skMedWhen">WHEN</label><input id="skMedWhen" type="text" maxlength="80" autocomplete="off" placeholder="Morning, with breakfast" value="' + esc(f.when || "") + '">' +
      '<label class="ov-sub" for="skMedLeft">HOW MANY LEFT (OPTIONAL)</label><input id="skMedLeft" type="number" inputmode="numeric" min="0" max="9999" value="' + (f.left != null ? f.left : "") + '">' +
      '<div class="btnrow">' + (f.id ? '<button type="button" class="chip sm' + (armed(f.id) ? " ap-armed" : "") + '" data-skdel="' + esc(f.id) + '">' + (armed(f.id) ? "TAP AGAIN TO REMOVE" : "REMOVE") + "</button>" : "") +
      '<span class="sk-fill"></span><button type="button" class="chip sm" data-skform="">CANCEL</button><button type="button" class="chip sm" style="--c: var(--personal)" aria-pressed="true" data-sksave="med">SAVE</button></div></div>';
    html += meds.length ? meds.map(function (m) {
      var d = m.data || {}, done = (d.taken || []).indexOf(today) > -1, left = typeof d.left === "number" ? d.left : null;
      return '<div class="sk-med"><button type="button" class="sk-mn" data-skedit="' + esc(m.id) + '"><b>' + esc(m.name) + "</b><small>" + esc(d.when || "Tap to add when") + "</small></button>" +
        (left !== null ? '<span class="sk-left' + (left <= 7 ? " warn" : "") + '">' + (left <= 7 ? "▲ REFILL · " : "") + left + " LEFT</span>" : "") +
        '<button type="button" class="sk-tick" data-sktake="' + esc(m.id) + '" aria-pressed="' + done + '" aria-label="' + (done ? "Taken today: " : "Mark taken today: ") + esc(m.name) + '">' + (done ? "✓" : "") + "</button></div>";
    }).join("") : '<p class="sk-p muted">Nothing yet. + MEDICINE adds one; tick it each day you take it.</p>';
    var ap = skAppts(v);
    html += '</section><section class="sk-panel" aria-label="Appointments"><span class="sk-lbl c">APPOINTMENTS · FROM YOUR CALENDARS</span>' + (ap.length ? ap.map(function (e) {
      var dd = Math.round((sod(e._s) - sod(new Date())) / 86400000);
      return '<div class="sk-appt"><span class="sk-ad"><b>' + e._s.getDate() + "</b><small>" + MON[e._s.getMonth()] + '</small></span><span class="sk-at"><b>' + esc(e.title) + "</b><small>" + (e.allDay ? "All day" : hm(e._s)) + " · " + esc(AREAS[e.area] ? AREAS[e.area].name : "") + "</small></span><span class=\"sk-in\">" + (dd === 0 ? "TODAY" : dd === 1 ? "TOMORROW" : "IN " + dd + " DAYS") + "</span></div>"; }).join("")
      : '<p class="sk-p muted">None in the next two months. Events whose titles contain one of these words show here:</p>') +
      '<div class="sk-addrow"><input id="skWords" type="text" maxlength="400" autocomplete="off" aria-label="Words that mark an appointment, separated by commas" value="' + esc((v.words || []).join(", ")) + '"><button type="button" class="chip sm" data-skact="words">SAVE WORDS</button></div>' +
      '<button type="button" class="chip sk-doc" style="--c: var(--chrome-d)" data-skact="summary">FOR THE DOCTOR · 90-DAY SUMMARY</button></section></div>';
    var reads = skItems("reading"), groups = {};
    reads.forEach(function (r) { (groups[r.name] = groups[r.name] || []).push(r); });
    skDays().forEach(function (d) { if (typeof d.weight === "number") (groups.Weight = groups.Weight || []).push({ id: "h" + d.date, name: "Weight", date: d.date, data: { v: d.weight.toFixed(1), unit: "lb", health: true } }); });
    html += '<div class="sk-col"><section class="sk-panel" aria-label="Readings"><div class="sk-dh"><span class="sk-lbl c">READINGS · BY HAND OR FROM HEALTH</span><button type="button" class="chip sm" style="--c: var(--personal)" data-skform="read">+ READING</button></div>';
    if (f && f.k === "read") {
      var rw = SK_READS.filter(function (x) { return x[0] === f.what; })[0] || SK_READS[0];
      html += '<div class="sk-form"><div class="btnrow" role="group" aria-label="What">' + SK_READS.map(function (x) { return '<button type="button" class="chip sm" style="--c: var(--personal)" data-skwhat="' + x[0] + '" aria-pressed="' + (x[0] === rw[0]) + '">' + x[0].toUpperCase() + "</button>"; }).join("") + "</div>" +
        (rw[0] === "Other" ? '<label class="ov-sub" for="skRdName">WHAT</label><input id="skRdName" type="text" maxlength="60" autocomplete="off" value="' + esc(f.name || "") + '">' : "") +
        '<label class="ov-sub" for="skRdVal">VALUE' + (rw[1] ? " (" + rw[1] + ")" : "") + '</label><input id="skRdVal" type="text" maxlength="40" autocomplete="off" placeholder="' + rw[2] + '">' +
        '<div class="btnrow"><span class="sk-fill"></span><button type="button" class="chip sm" data-skform="">CANCEL</button><button type="button" class="chip sm" style="--c: var(--personal)" aria-pressed="true" data-sksave="read">SAVE</button></div></div>';
    }
    var gk = Object.keys(groups);
    html += gk.length ? gk.map(function (name) {
      var l = groups[name].sort(function (a, b) { return (a.date || "") < (b.date || "") ? -1 : 1; }).slice(-12), last = l[l.length - 1], nums = l.map(function (r) { var n = parseFloat(String(r.data.v)); return isFinite(n) ? n : null; });
      return '<div class="sk-read"><span class="sk-rn"><small>' + esc(name.toUpperCase()) + "</small><b>" + esc(String(last.data.v)) + " <small>" + esc(last.data.unit || "") + '</small></b></span><span class="sk-rspark" role="img" aria-label="' + esc(name + ", last " + l.length + " readings, newest " + last.data.v) + '">' + skBars(nums, null, null, null, true) + '</span><span class="sk-rw">' + esc(shortDay(last.date || today)) + (last.data.health ? " · HEALTH" : "") + "</span></div>";
    }).join("") : '<p class="sk-p muted">Nothing yet. A blood pressure cuff, a scale or a glucose meter: + READING adds what it shows. A scale that writes to Health comes across by itself.</p>';
    var notes = skItems("note").sort(function (a, b) { return (b.date || "") < (a.date || "") ? -1 : 1; }).slice(0, 12);
    html += '</section><section class="sk-panel" aria-label="Notes"><div class="sk-dh"><span class="sk-lbl c">HOW YOU FELT · NOTES</span><button type="button" class="chip sm" style="--c: var(--personal)" data-skform="note">+ NOTE</button></div>';
    if (f && f.k === "note") html += '<div class="sk-form"><label class="ov-sub" for="skNote">NOTE</label><input id="skNote" type="text" maxlength="500" autocomplete="off" placeholder="How you feel today">' +
      '<div class="btnrow" role="group" aria-label="Tag">' + SK_TAGS.map(function (t) { return '<button type="button" class="chip sm" style="--c: var(--personal)" data-sktag="' + t + '" aria-pressed="' + ((f.tag || "NOTE") === t) + '">' + t + "</button>"; }).join("") + "</div>" +
      '<div class="btnrow"><span class="sk-fill"></span><button type="button" class="chip sm" data-skform="">CANCEL</button><button type="button" class="chip sm" style="--c: var(--personal)" aria-pressed="true" data-sksave="note">SAVE</button></div></div>';
    html += notes.length ? notes.map(function (n) {
      var tag = (n.data && n.data.tag) || "NOTE";
      return '<div class="sk-note"><span class="sk-nd">' + esc(n.date ? shortDay(n.date) : "") + '</span><span class="sk-nt">' + esc(n.name) + '</span><span class="sk-tag' + (tag === "GOOD" ? " ok" : "") + '">' + esc(tag) + '</span><button type="button" class="sk-x' + (armed(n.id) ? " armed" : "") + '" data-skdel="' + esc(n.id) + '" aria-label="' + (armed(n.id) ? "Tap again to remove this note" : "Remove this note") + '">' + (armed(n.id) ? "?" : "✕") + "</button></div>"; }).join("")
      : '<p class="sk-p muted">A line on a bad night, a sore back, a good day: notes sit beside the numbers, so patterns show.</p>';
    return html + "</section></div></div>";
  }
  function skSummary() {   /* FOR THE DOCTOR: the last 90 days as plain text, to share or copy */
    var out = ["Health summary · " + ymd(new Date()) + " · last 90 days (from Apple Watch via Bridge)", ""];
    SK_M.forEach(function (m) {
      var s = skSeries(m.k, 90).filter(function (p) { return p.v !== null; }); if (!s.length) return;
      var vals = s.map(function (p) { return p.v; }), avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      out.push(m.name.charAt(0) + m.name.slice(1).toLowerCase() + ": average " + skFmt(m, avg) + (m.k === "sleep" ? "" : " " + m.unit) + ", range " + skFmt(m, Math.min.apply(null, vals)) + " to " + skFmt(m, Math.max.apply(null, vals)) + " (" + s.length + " days)");
    });
    var meds = skItems("medicine");
    if (meds.length) { out.push("", "Medicines and supplements:"); meds.forEach(function (m) { out.push("- " + m.name + (m.data && m.data.when ? " (" + m.data.when + ")" : "")); }); }
    var reads = skItems("reading").sort(function (a, b) { return (a.date || "") < (b.date || "") ? -1 : 1; });
    if (reads.length) { out.push("", "Readings:"); reads.slice(-30).forEach(function (r) { out.push("- " + (r.date || "") + " " + r.name + ": " + r.data.v + " " + (r.data.unit || "")); }); }
    var notes = skItems("note").sort(function (a, b) { return (a.date || "") < (b.date || "") ? -1 : 1; });
    if (notes.length) { out.push("", "Notes:"); notes.slice(-30).forEach(function (n) { out.push("- " + (n.date || "") + " " + n.name); }); }
    var text = out.join("\n");
    if (navigator.share) navigator.share({ title: "Health summary", text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("Summary copied"); }, function () { toast("Couldn't copy"); });
  }
  function skSaveForm(kind) {
    var f = sk.form || {}, today = ymd(new Date()), val = function (id) { var e = $(id); return e ? e.value.trim() : ""; };
    if (kind === "med") {
      var name = val("skMedName"); if (!name) { toast("Give it a name"); return; }
      var leftS = val("skMedLeft"), left = leftS === "" ? null : Math.max(0, Math.min(9999, Math.round(+leftS)));
      var cur = f.id ? skItems("medicine").filter(function (m) { return m.id === f.id; })[0] : null, d = Object.assign({}, cur ? cur.data : {}, { when: val("skMedWhen"), left: left, taken: cur && cur.data && cur.data.taken ? cur.data.taken : [] });
      skQueue({ op: "save", item: { kind: "medicine", id: f.id || skNewId("m"), name: name.slice(0, 80), date: null, data: d } }); toast(name + " saved");
    } else if (kind === "read") {
      var rw = SK_READS.filter(function (x) { return x[0] === f.what; })[0] || SK_READS[0], what = rw[0] === "Other" ? val("skRdName") : rw[0], v = val("skRdVal");
      if (!what || !v) { toast("Fill in the reading"); return; }
      skQueue({ op: "save", item: { kind: "reading", id: skNewId("r"), name: what.slice(0, 60), date: today, data: { v: v.slice(0, 40), unit: rw[1] } } }); toast(what + " saved");
    } else if (kind === "note") {
      var t = val("skNote"); if (!t) { toast("Write the note first"); return; }
      skQueue({ op: "save", item: { kind: "note", id: skNewId("n"), name: t.slice(0, 500), date: today, data: { tag: f.tag || "NOTE" } } }); toast("Note saved");
    }
    sk.form = null; render(true);
  }
  function skClick(b) {
    var d = b.dataset;
    if (d.skgo !== undefined) { skSet({ tab: d.skgo || "vitals" }); sk.form = null; go("sickbay"); return true; }
    if (state.screen !== "sickbay") return false;
    if (d.sknight && d.sktab) sk.night = d.sknight;
    if (d.sktab) { skSet({ tab: d.sktab }); sk.form = null; render(false); $("content").scrollTop = 0; return true; }
    if (d.skday) { sk.day = d.skday; skSet({ tab: "days" }); render(false); var dc = document.querySelector(".sk-day"); if (dc && b.closest && !b.closest(".sk-strip")) dc.scrollIntoView({ block: "start" }); return true; }
    if (d.skstep) { var nd = ymd(addDays(parseYmd(sk.day || ymd(new Date())), +d.skstep)); if (nd <= ymd(new Date())) { sk.day = nd; render(true); } return true; }
    if (d.skbar) { sk.bar = sk.bar === d.skbar ? null : d.skbar; render(true); return true; }
    if (d.skact === "goals") { sk.goals = !sk.goals; render(true); return true; }
    if (d.skact === "sync") { skSync(); return true; }
    if (d.skm) { skSet({ metric: d.skm }); sk.bar = null; render(true); return true; }
    if (d.skrange) { skSet({ range: +d.skrange }); sk.bar = null; render(true); return true; }
    if (d.sknight) { sk.night = d.sknight; render(true); return true; }
    if (d.skform !== undefined) { sk.form = d.skform ? { k: d.skform, what: "Blood pressure", tag: "NOTE" } : null; sk.arm = null; render(true); var first = document.querySelector(".sk-form input"); if (first) first.focus(); return true; }
    if (d.skedit) { var m = skItems("medicine").filter(function (x) { return x.id === d.skedit; })[0]; if (m) sk.form = { k: "med", id: m.id, name: m.name, when: (m.data || {}).when || "", left: (m.data || {}).left }; render(true); return true; }
    if (d.skwhat) { sk.form = Object.assign({}, sk.form, { what: d.skwhat }); render(true); return true; }
    if (d.sktag) { sk.form = Object.assign({}, sk.form, { tag: d.sktag }); render(true); return true; }
    if (d.sksave) { skSaveForm(d.sksave); return true; }
    if (d.sktake) {
      var today = ymd(new Date()), it = skItems("medicine").filter(function (x) { return x.id === d.sktake; })[0]; if (!it) return true;
      var dd = Object.assign({}, it.data || {}), taken = (dd.taken || []).slice(), was = taken.indexOf(today) > -1;
      dd.taken = was ? taken.filter(function (x) { return x !== today; }) : taken.concat([today]).slice(-60);
      if (typeof dd.left === "number") dd.left = Math.max(0, dd.left + (was ? 1 : -1));
      skQueue({ op: "save", item: Object.assign({}, it, { data: dd }) }); render(true); return true;
    }
    if (d.skdel) {
      if (sk.arm === d.skdel && Date.now() - sk.armAt < 4000) { skQueue({ op: "remove", id: d.skdel }); sk.arm = null; if (sk.form && sk.form.id === d.skdel) sk.form = null; toast("Removed"); }
      else { sk.arm = d.skdel; sk.armAt = Date.now(); setTimeout(function () { if (state.screen === "sickbay") render(true); }, 4100); }
      render(true); return true;
    }
    if (d.skact === "words") { skSet({ words: ($("skWords") ? $("skWords").value : "").split(",").map(function (w) { return w.trim(); }).filter(Boolean).slice(0, 30) }); toast("Appointment words saved"); render(true); return true; }
    if (d.skact === "summary") { skSummary(); return true; }
    return false;
  }

  /* ---- beyond the station: the Bridge, Condition, SYSTEMS and ASK ---- */
  function skEnvRow() {   /* the Bridge's weather panel: last night and readiness, on the iPad only (no AI) */
    if (!canSickbay() || !skDays().length) return "";
    var r = skReady(), sl = skLatest("sleep");
    if (!r && !sl) return "";
    return '<div class="ov-envrow"><span class="k">RECOVERY · SICKBAY</span><span class="tx"><b>' + (sl ? "Slept " + skHM(sl.v * 60) : "Sleep not in yet") + '</b><small class="ov-extra">' +
      (r && r.why ? esc(r.why.join(", ")) : r && r.learning !== undefined ? "Learning your normal (" + r.learning + " of 7 days)" : "") + "</small></span>" +
      (r && r.score !== undefined ? '<span class="pill ' + (r.lvl === "ok" ? "ok" : r.lvl === "warn" ? "warn" : "") + '">' + r.score + " · " + r.word.replace(/^[^A-Z]+/, "") + "</span>" : "") + "</div>";
  }
  function skConditions(now) {   /* `health: true` keeps them out of ASK unless SICKBAY is shared */
    if (!canSickbay() || !sk.data || !skDays().length) return [];
    var out = [], last = skLastSync();
    if (last && now - last > 48 * 3600000) out.push({ lvl: "warn", ic: "◌", health: true, txt: "No health data for " + Math.floor((now - last) / 86400000) + " days", sub: "Check the iPhone is on, charging and on Wi-Fi, then SYNC FROM HEALTH in SICKBAY.", act: "sickbay", go: "SICKBAY" });
    var nr = skNormal("rhr"), s = skSeries("rhr", 2);
    if (nr.mid !== null && s[0].v !== null && s[1].v !== null && s[0].v >= nr.mid + 5 && s[1].v >= nr.mid + 5)
      out.push({ lvl: "warn", ic: "▲", health: true, txt: "Take it easy", sub: "Resting heart rate " + Math.round(s[0].v) + " and " + Math.round(s[1].v) + ", about " + Math.round((s[0].v + s[1].v) / 2 - nr.mid) + " above your normal, two mornings running.", act: "sickbay", go: "SICKBAY" });
    return out;
  }
  function sickbaySection() {
    var on = !!lsGet(LS_AISICK), n = skDays().length, last = skLastSync(), hk = state.caps.indexOf("healthkey") > -1;
    var html = "<section>" + phead("SICKBAY", canSickbay() ? (sk.err ? "PROBLEM" : "NOTION") : "SETUP");
    if (!canSickbay()) return html + stubBox("Needs the Google bridge updated to 1.43 and 🩺 Sickbay connected to the TimothyOS integration. Steps are in the README under <b>SICKBAY</b>.") + "</section>";
    html += '<div class="calrow"><span class="st" style="background:var(--personal)"></span><span><b>🩺 Sickbay</b><small' + (sk.err ? ' class="errtxt">' + esc(sk.err) : ">" + (sk.data ? n + (n === 1 ? " day" : " days") + " · " + (last ? "last from Health " + esc(stamp(last)) : "nothing from Health yet") : "Not loaded yet") + (sk.q.ops.length ? " · " + sk.q.ops.length + " waiting" : "")) + "</small></span>" +
      '<span class="pill' + (sk.data && !sk.err ? " ok" : sk.err ? " bad" : "") + '">' + (sk.data && !sk.err ? "OK" : sk.err ? "ERROR" : "WAITING") + "</span></div>";
    html += '<div class="calrow"><span class="st" style="background:var(--personal)"></span><span><b>Health key</b><small>' + (hk ? "Set in the bridge. It goes in the " + SK_SHORTCUT + " shortcut only: it can send health data and nothing else." : "Not set: run setup in the bridge (it makes HEALTH_KEY).") + '</small></span><span class="pill' + (hk ? " ok" : " warn") + '">' + (hk ? "SET" : "NEEDED") + "</span></div>";
    html += '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND YOUR HEALTH</label><div class="btnrow">' +
      '<button type="button" class="chip" data-aisick="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-aisick="1" aria-pressed="' + on + '">SHARE WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "Ask and the Morning Briefing receive the last two weeks of sleep, resting heart rate, heart rate variability and steps with your normal, readiness, and your medicines' names. They go to Anthropic with the question." : "Off: your health data is never sent with Ask questions or the Morning Briefing.") + "</small></section>";
    return html;
  }
  function sickbayBrief() {   /* ASK and the Morning Briefing, only with SHARE WITH ASK */
    if (!lsGet(LS_AISICK) || !canSickbay() || !skDays().length) return "";
    var r = skReady(), lines = ["SICKBAY (Timothy's health from his Apple Watch, shared by his choice; a guide, never a diagnosis):"];
    if (r && r.score !== undefined) lines.push("Readiness this morning " + r.score + " (" + r.word.replace(/^[^A-Z]+/, "") + "): " + r.why.join(", ") + ".");
    ["sleep", "rhr", "hrv", "steps"].forEach(function (k) {
      var m = SK_M.filter(function (x) { return x.k === k; })[0], nm = skNormal(k), s = skSeries(k, 14).filter(function (p) { return p.v !== null; });
      if (s.length) lines.push(m.name.charAt(0) + m.name.slice(1).toLowerCase() + " (" + (k === "sleep" ? "hours asleep" : m.unit) + "), last 14 days: " + s.map(function (p) { return p.date.slice(5) + " " + skFmt(m, p.v); }).join(", ") + (nm.lo !== null ? "; normal " + skFmt(m, nm.lo) + " to " + skFmt(m, nm.hi) : ""));
    });
    var meds = skItems("medicine");
    if (meds.length) lines.push("Medicines and supplements: " + meds.map(function (m) { return m.name; }).join(", "));
    return lines.join("\n");
  }
  function skAiClick(b) { if (b.dataset.aisick === undefined) return false; if (b.dataset.aisick === "1") lsSet(LS_AISICK, true); else lsDel(LS_AISICK); askReshare(); render(true); return true; }
