  /* ---------- MEALS (2.59, bridge 1.39; Timothy's mockup: option A is PLAN, option C is LOG) ----------
     🍽 Meals (a page per meal, its ingredients by aisle) and 🍽 Dinners (a page per night, Planned or Eaten) in Notion.
     PLAN: the week as seven nights, the MEAL LIBRARY (2.76: rows, search, kind, order; tap a night, then a meal), and the grocery list built
     from the nights still to come; PRINT and SHARE. LOG: five weeks of dinners and the rotation table. TODAY and the
     Bridge carry TONIGHT, which from 4 PM asks what dinner was. Every change goes through tos.mealq.v1, in order. */
  var LS_MEALS = "tos.meals.v1", LS_MEALQ = "tos.mealq.v1", LS_MEALGOT = "tos.mealgot.v1", LS_MEALVIEW = "tos.mealview.v1", LS_MEALRC = "tos.mealrc.v1";
  var ML_KINDS = ["Beef + Pork", "Chicken", "Fish", "Meatless", "Breakfast", "Other"];
  var ML_KC = { "Beef + Pork": "#e8a27a", Chicken: "#f6c66b", Fish: "#9db0ff", Meatless: "#7bd88f", Breakfast: "#c99bc4", Other: "#9d978c" };
  var ML_AISLES = ["Produce", "Meat + Fish", "Dairy", "Bakery", "Frozen", "Pantry", "Household", "Other"];
  var mlView = Object.assign({ tab: "plan", sort: "last", lsort: "last", kind: "" }, lsGet(LS_MEALVIEW) || {});
  var ML_CAP = 24, ML_TH = 160;   /* 2.76: the MEAL LIBRARY shows 24 meals until you search, filter or SHOW ALL; a meal's own photo is a 160 px square */
  var ml = { data: lsGet(LS_MEALS), err: null, inflight: false, flushing: false, q: Object.assign({ ops: [] }, lsGet(LS_MEALQ) || {}), qErr: "", qT: 0,
    sel: null, wk: 0, editing: false, form: null, arm: null, armAt: 0, plan: null, planBusy: false, planErr: "", add: false,
    imp: null, cook: null, rc: lsGet(LS_MEALRC) || {}, wl: null, find: "", all: false };   /* 2.60: + FROM A RECIPE, COOK (recipes read back, kept for the kitchen) */
  function canMeals() { return state.caps.indexOf("meals") > -1; }
  function canMealPlan() { return state.caps.indexOf("mealplan") > -1; }
  function canMealImport() { return state.caps.indexOf("mealimport") > -1; }
  function canRecipes() { return state.caps.indexOf("recipes") > -1; }
  function canMealImg() { return state.caps.indexOf("mealimg") > -1; }
  function mlMeals(all) { return ((ml.data && ml.data.meals) || []).filter(function (m) { return all || !m.retired; }); }
  function mlMeal(id) { return ((ml.data && ml.data.meals) || []).filter(function (m) { return m.id === id; })[0] || null; }
  function mlDinner(day) { return ((ml.data && ml.data.dinners) || []).filter(function (d) { return d.date === day; })[0] || null; }
  function mlToday() { return ymd(new Date()); }
  function mlEvening() { return new Date().getHours() >= 16; }
  function mlStatusFor(day) { var t = mlToday(); return day < t || (day === t && mlEvening()) ? "eaten" : "planned"; }   /* a night past, or tonight from 4 PM, is recorded; later nights are planned */
  function mlDName(dn) { if (dn.kind === "leftovers") return "Leftovers"; if (dn.kind === "out") return "Eating out"; var m = mlMeal(dn.meal); return m ? m.name : dn.name || "A meal"; }
  function mlMonday(off) { var d = sod(new Date()); return addDays(d, -((d.getDay() + 6) % 7) + 7 * off); }
  function mlAgo(n) { return n === null ? "not yet" : n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago"; }
  function mlErrText(err) { var c = err && err.code; return c === "notion_not_shared" ? "Not connected: in Notion, open 🍽 Meals and 🍽 Dinners, ... → Connections → TimothyOS (README → MEALS)." : describe(err); }
  function mlSaveView() { lsSet(LS_MEALVIEW, mlView); }
  function mlRedraw() { if (state.screen === "meals" || state.screen === "bridge" || (state.screen === "today" && sameDay(state.anchor, new Date()))) render(true); }

  /* ---- reading, and changes on their way ---- */
  function loadMeals(force) {
    if (!state.conn || !canMeals() || ml.inflight) return;
    if (!force && ml.data && Date.now() - ml.data.fetched < 120000) return;
    if (!force && ml.err && Date.now() - ml.err.at < FRESH_MS) return;
    ml.inflight = true;
    api({ action: "meals" }).then(function (j) {
      ml.data = { fetched: Date.now(), meals: j.meals || [], dinners: j.dinners || [], url: j.url || "", dinnersUrl: j.dinnersUrl || "" };
      ml.q.ops.forEach(mlApply);   /* what hasn't reached Notion yet still shows */
      ml.err = null; lsSet(LS_MEALS, ml.data);
      mlBackfill();
    }).catch(function (err) { ml.err = { at: Date.now(), msg: mlErrText(err) }; })
      .then(function () { ml.inflight = false; mlRedraw(); cmdFresh(); flushMeals(); });
  }
  function mlApply(op) {
    var d = ml.data; if (!d) return;
    if (op.op === "meal") d.meals = d.meals.filter(function (m) { return m.id !== op.meal.id; }).concat([(function (mm) { delete mm.full; return mm; })(Object.assign({}, op.meal))]).sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (op.op === "remove") d.meals = d.meals.filter(function (m) { return m.id !== op.id; });
    else if (op.op === "dinner") {
      var x = op.dinner, m = x.kind === "meal" ? mlMeal(x.meal) : null;
      d.dinners = d.dinners.filter(function (y) { return y.date !== x.date; });
      if (x.kind !== "none") d.dinners.push({ date: x.date, status: x.status, kind: x.kind, meal: m ? m.id : null, name: m ? m.name : x.kind === "out" ? "Eating out" : "Leftovers", note: x.note || "" });
      d.dinners.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    }
  }
  function mlQueue(op) {
    op.k = op.op === "dinner" ? "d:" + op.dinner.date : "m:" + (op.meal ? op.meal.id : op.id);
    var i = -1; ml.q.ops.forEach(function (o, j) { if (o.k === op.k) i = j; });
    if (i > -1 && op.op === "meal" && ml.q.ops[i].op === "meal" && ml.q.ops[i].meal.full && !op.meal.full) op.meal.full = ml.q.ops[i].meal.full;   /* an imported recipe not sent yet stays with it */
    if (i > -1) ml.q.ops[i] = op; else ml.q.ops.push(op);
    if (op.op === "meal" && op.meal.full) delete ml.rc[op.meal.id];   /* in place: a meal stays ahead of the dinners that name it */
    lsSet(LS_MEALQ, ml.q);
    mlApply(op); if (ml.data) lsSet(LS_MEALS, ml.data);
    flushMeals();
  }
  function flushMeals() {
    if (ml.flushing || !state.conn || !canMeals() || !ml.q.ops.length) return;
    var op = ml.q.ops[0]; ml.flushing = true;
    apiPost(op.op === "meal" ? { action: "mealsave", meal: op.meal } : op.op === "remove" ? { action: "mealremove", id: op.id } : { action: "dinnerset", dinner: op.dinner }, 30000).then(function () {
      ml.q.ops = ml.q.ops.filter(function (o) { return o !== op; }); lsSet(LS_MEALQ, ml.q); ml.qErr = "";
      ml.flushing = false; flushMeals();
    }, function (err) {
      ml.flushing = false;
      if (err && (err.code === "bad_request" || err.code === "not_found")) {   /* Notion will never take this one: drop it rather than hold the rest */
        ml.q.ops = ml.q.ops.filter(function (o) { return o !== op; }); lsSet(LS_MEALQ, ml.q);
        ml.qErr = "Notion refused a change (" + (op.op === "dinner" ? shortDay(op.dinner.date) : op.meal ? op.meal.name : "a removal") + "), so it was dropped. Reload MEALS to see Notion's copy.";
        flushMeals();
      } else { ml.qErr = describe(err); clearTimeout(ml.qT); ml.qT = setTimeout(flushMeals, 30000); }
      mlRedraw();
    });
  }
  function mlSet(day, kind, meal) { mlQueue({ op: "dinner", dinner: { date: day, status: kind === "none" ? "eaten" : mlStatusFor(day), kind: kind, meal: kind === "meal" ? meal : null } }); }

  /* ---- the rotation: from the dinners eaten ---- */
  function mlRot(id) {
    var t = mlToday(), ds = ((ml.data && ml.data.dinners) || []).filter(function (d) { return d.kind === "meal" && d.meal === id && d.status === "eaten" && d.date <= t; }).map(function (d) { return d.date; }).sort();
    var gaps = []; for (var i = 1; i < ds.length; i++) gaps.push(daysBetween(ds[i - 1], ds[i]));
    gaps.sort(function (a, b) { return a - b; });
    var since = ds.length ? daysBetween(ds[ds.length - 1], t) : null, usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    var late = since !== null && (usual ? since > usual * 1.5 : since > 45);   /* NOT IN A WHILE: half again its usual gap, or six weeks for one made once */
    return { since: since, last: ds.length ? ds[ds.length - 1] : null, times: ds.filter(function (x) { return daysBetween(x, t) <= 90; }).length, usual: usual, late: late, due: !late && usual !== null && since !== null && since >= usual };
  }
  function mlByAgo() {
    return mlMeals().map(function (m) { return { m: m, r: mlRot(m.id) }; }).sort(function (a, b) { var x = a.r.since === null ? -1 : a.r.since, y = b.r.since === null ? -1 : b.r.since; return y - x || a.m.name.localeCompare(b.m.name); });
  }

  function mlSorter(S) {
    return S === "times" ? function (a, b) { return b.r.times - a.r.times || a.m.name.localeCompare(b.m.name); } : S === "name" ? function (a, b) { return a.m.name.localeCompare(b.m.name); } :
      function (a, b) { var x = a.r.since === null ? -1 : a.r.since, y = b.r.since === null ? -1 : b.r.since; return y - x || a.m.name.localeCompare(b.m.name); };
  }

  /* ---- the MEAL LIBRARY (2.76): a row per meal with a small picture, found by search, kind and order, never an endless wall ---- */
  function mlIni(name) {
    var w = String(name || "").split(/\s+/).filter(function (x) { return /^[A-Za-z0-9]/.test(x) && !/^(and|with|the|of|a|an|n|on|in)$/i.test(x); });
    return w.slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join("") || "·";
  }
  function mlPic(m, cls) {   /* its small copy (Thumb), or its initials on the kind's colour. 2.79: never an image from a recipe site */
    var src = m.thumb, c = "ml-pic" + (cls ? " " + cls : "");
    return src ? '<img class="' + c + '" src="' + esc(src) + '" alt="" loading="lazy">' : '<i class="' + c + '" data-ini="' + esc(mlIni(m.name)) + '" aria-hidden="true"></i>';
  }
  function mlRow(x) {
    var m = x.m, r = x.r, flag = r.late ? "NOT IN A WHILE" : r.due ? "DUE" : r.since === null ? "NEW" : "";
    return '<button type="button" class="ml-row' + (r.late ? " late" : "") + '" data-mlcard="' + esc(m.id) + '" style="--k: ' + ML_KC[m.kind] + '">' + mlPic(m) +
      "<span><b>" + esc(m.name) + "</b><small>" + esc(m.kind.toUpperCase()) + " · " + (r.since === null ? "Not made yet" : mlAgo(r.since).replace(/^./, function (c) { return c.toUpperCase(); }) + " · " + r.times + "×") + "</small></span>" +
      (flag ? '<em class="' + (r.late ? "late" : r.due ? "due" : "") + '">' + flag + "</em>" : "") + "</button>";
  }
  function mlLibRows() {
    var words = ml.find.toLowerCase().split(/\s+/).filter(Boolean), K = mlView.kind;
    return mlMeals().filter(function (m) {
      if (K && m.kind !== K) return false;
      var hay = (m.name + " " + m.kind + " " + m.ing.map(function (i) { return i.n; }).join(" ")).toLowerCase();   /* "chicken" finds what has chicken in it, too */
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    }).map(function (m) { return { m: m, r: mlRot(m.id) }; }).sort(mlSorter(mlView.lsort));
  }
  function mlRowsHtml() {
    var total = mlMeals().length;
    if (!total) return '<p class="muted">No meals yet. <b>+ MEAL</b> adds one: its name, its kind, a photo, and what it needs from the store. Or add them in Notion (🍽 Meals).</p>';
    var rows = mlLibRows(), open = ml.all || ml.find.trim(), show = open ? rows : rows.slice(0, ML_CAP);
    if (!rows.length) return '<p class="muted">No meal matches' + (ml.find.trim() ? " \u201c" + esc(ml.find.trim()) + "\u201d" : "") + (mlView.kind ? " in " + esc(mlView.kind.toUpperCase()) : "") + ".</p>";
    return '<div class="ml-rows">' + show.map(mlRow).join("") + "</div>" + (show.length < rows.length ? '<div class="ml-more"><small class="muted">' + show.length + " of " + rows.length + '. Search, or pick a kind, to find the rest.</small><button type="button" class="chip sm" data-ml="all">SHOW ALL ' + rows.length + "</button></div>" : "");
  }
  function mlLibHtml() {
    var have = {}; mlMeals().forEach(function (m) { have[m.kind] = 1; });
    var kinds = ML_KINDS.filter(function (k) { return have[k] || mlView.kind === k; });
    return '<div class="ml-libbar"><input id="mlFind" type="search" maxlength="60" autocomplete="off" placeholder="Find a meal or an ingredient" aria-label="Find a meal" value="' + esc(ml.find) + '">' +
      '<span class="btnrow" role="group" aria-label="Order">' + [["last", "LONGEST AGO"], ["times", "MOST MADE"], ["name", "A TO Z"]].map(function (s) { return '<button type="button" class="chip sm" data-mllsort="' + s[0] + '" aria-pressed="' + (mlView.lsort === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</span>" +
      '<span class="btnrow ml-kinds" role="group" aria-label="Kind"><button type="button" class="chip sm" data-mlkindf="" aria-pressed="' + !mlView.kind + '">ALL</button>' +
      kinds.map(function (k) { return '<button type="button" class="chip sm" data-mlkindf="' + esc(k) + '" aria-pressed="' + (mlView.kind === k) + '" style="--c: ' + ML_KC[k] + '">' + esc(k.toUpperCase()) + "</button>"; }).join("") + "</span></div>" +
      '<div id="mlRows">' + mlRowsHtml() + "</div>";
  }
  document.addEventListener("input", function (e) { if (e.target && e.target.id === "mlFind") { ml.find = e.target.value.slice(0, 60); var el = $("mlRows"); if (el) el.innerHTML = mlRowsHtml(); } });

  /* ---- a meal's own photo (2.76): the camera or the library, cropped square and made small, kept as text in Notion (Thumb) ---- */
  function mlThumb(file) {   /* a File (the camera or the library), or a data: URL (2.79: a recipe's photo, fetched by the bridge) */
    return new Promise(function (res, rej) {
      var own = typeof file !== "string", url = own ? URL.createObjectURL(file) : file, img = new Image();
      if (!own && !/^data:image\/(jpeg|png|webp|gif);base64,/.test(url)) { rej(new Error("photo")); return; }
      img.onload = function () {
        if (own) URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h), c = document.createElement("canvas"), d = "", qs = [0.72, 0.56, 0.42, 0.3];
        if (!s) { rej(new Error("photo")); return; }
        c.width = c.height = ML_TH;
        c.getContext("2d").drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, ML_TH, ML_TH);
        for (var i = 0; i < qs.length; i++) { d = c.toDataURL("image/jpeg", qs[i]); if (d.length <= 15000) break; }
        if (/^data:image\/jpeg;base64,/.test(d) && d.length <= 15000) res(d); else rej(new Error("photo"));
      };
      img.onerror = function () { if (own) URL.revokeObjectURL(url); rej(new Error("photo")); };
      img.src = url;
    });
  }
  /* 2.79: a recipe's photo becomes a small copy kept with the meal (Thumb). The bridge fetches the picture; the iPad makes
     it small and never loads images from recipe sites itself. Used for an imported recipe, a pasted image link, and
     (once, in the background) each older meal that has only a link. */
  function mlThumbFromLink(url) {
    return apiPost({ action: "mealimg", url: url }, 60000).then(function (j) { return mlThumb(j.data); });
  }
  function mlBackfill() {
    if (ml.bf || !canMealImg() || !state.conn) return;
    var tried = mlView.nothumb || {}, now = Date.now();
    var todo = mlMeals(true).filter(function (m) { return m.photo && !m.thumb && !(tried[m.id] && now - tried[m.id] < 14 * 864e5); });
    if (!todo.length) return;
    ml.bf = true;
    (function next(i) {
      var m = todo[i]; if (!m) { ml.bf = false; return; }
      mlThumbFromLink(m.photo).then(function (d) { return apiPost({ action: "mealthumb", id: m.id, thumb: d }, 60000).then(function () { return d; }); }).then(function (d) {
        var have = mlMeal(m.id); if (have && have.photo === m.photo) { have.thumb = d; lsSet(LS_MEALS, ml.data); mlRedraw(); }
        next(i + 1);
      }, function (err) {
        var c = err && err.code;
        if (err && (err.message === "photo" || /^photo_|^bad_request$|^not_found$/.test(c || ""))) { (mlView.nothumb = mlView.nothumb || {})[m.id] = Date.now(); mlSaveView(); next(i + 1); }   /* that picture can't be had: try again in two weeks */
        else ml.bf = false;   /* offline, or the bridge is busy: the next load carries on */
      });
    })(0);
  }
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "mlPhotoUrl" && ml.form) {   /* 2.79: a pasted image link becomes a small copy, too */
      mlFormRead(); var f = ml.form, u = f.photo;
      if (!u || u === f.photo0 || !canMealImg()) return;
      if (!/^https:\/\/\S+$/.test(u) || u.length > 1000) { f.err = "The image link should start with https://"; render(true); return; }
      f.busy = true; f.err = ""; render(true);
      mlThumbFromLink(u).then(function (d) { if (ml.form === f) f.thumb = d; }, function () { if (ml.form === f) { f.photo = ""; f.err = "Couldn't use that image link. Choose a photo instead, or try another link."; } })
        .then(function () { f.busy = false; if (ml.form === f && state.screen === "meals") render(true); });
      return;
    }
    if (!e.target || e.target.id !== "mlThumbFile" || !ml.form) return;
    var file = e.target.files && e.target.files[0]; if (!file) return;
    mlFormRead(); ml.form.busy = true; ml.form.err = ""; render(true);
    mlThumb(file).then(function (d) { if (ml.form) ml.form.thumb = d; }, function () { if (ml.form) ml.form.err = "Couldn't open that photo. Try another."; })
      .then(function () { if (ml.form) ml.form.busy = false; if (state.screen === "meals") render(true); });
  });

  /* ---- the grocery list: the nights still to come in the week shown, merged; ticks and extras kept on the iPad (PROFILE SYNC) ---- */
  function mlGot() {
    var g = Object.assign({ wk: "", got: {}, extra: [] }, lsGet(LS_MEALGOT) || {}), wk = ymd(mlMonday(0));
    if (g.wk !== wk) { g = { wk: wk, got: {}, extra: g.extra.filter(function (x) { return !g.got[x.n.toLowerCase()]; }) }; lsSet(LS_MEALGOT, g); }   /* a new week: ticks clear, bought extras go */
    return g;
  }
  function mlNights() { var t = mlToday(), out = []; for (var i = 0; i < 7; i++) { var d = ymd(addDays(mlMonday(ml.wk), i)); if (d >= t) out.push(d); } return out; }
  function mlGroceries() {
    var g = mlGot(), need = {}, staples = 0;
    mlNights().forEach(function (day) {
      var dn = mlDinner(day), m = dn && dn.status === "planned" && dn.kind === "meal" ? mlMeal(dn.meal) : null; if (!m) return;
      m.ing.forEach(function (x) {
        if (x.have) { staples++; return; }
        var k = x.n.toLowerCase(); if (!need[k]) need[k] = { n: x.n, a: x.a, ct: 0, for: [] };
        need[k].ct++; need[k].for.push(DOW[parseYmd(day).getDay()]);
      });
    });
    g.extra.forEach(function (x) { var k = x.n.toLowerCase(); if (!need[k]) need[k] = { n: x.n, a: x.a, ct: 1, for: [], extra: true }; });
    var items = Object.keys(need).map(function (k) { var x = need[k]; x.k = k; x.got = !!g.got[k]; return x; }).sort(function (a, b) { return a.n.localeCompare(b.n); });
    return { items: items, staples: staples, left: items.filter(function (x) { return !x.got; }).length };
  }
  function mlAisles(items) { return ML_AISLES.map(function (a) { return [a, items.filter(function (x) { return x.a === a; })]; }).filter(function (g) { return g[1].length; }); }
  function mlRangeText() { var n = mlNights(); return n.length ? DOW[parseYmd(n[0]).getDay()] + " " + parseYmd(n[0]).getDate() + " to " + DOW[parseYmd(n[n.length - 1]).getDay()] + " " + parseYmd(n[n.length - 1]).getDate() + " " + MON[parseYmd(n[n.length - 1]).getMonth()] : "this week"; }
  function mlPrint() {
    var G = mlGroceries(), left = G.items.filter(function (x) { return !x.got; });
    if (!left.length) { toast("Nothing left to buy on this list."); return; }
    var el = $("printSheet"); if (!el) { el = document.createElement("div"); el.id = "printSheet"; document.body.appendChild(el); }
    el.innerHTML = '<h1>GROCERIES</h1><p>For ' + esc(mlRangeText()) + "</p>" + mlAisles(left).map(function (g) {
      return "<h2>" + esc(g[0].toUpperCase()) + "</h2><ul>" + g[1].map(function (x) { return '<li><span class="ps-box"></span>' + esc(x.n + (x.ct > 1 ? " ×" + x.ct : "")) + (x.for.length ? " <small>" + esc(x.for.join(" · ")) + "</small>" : "") + "</li>"; }).join("") + "</ul>";
    }).join("");
    document.documentElement.classList.add("printing");
    var done = function () { document.documentElement.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    try { window.print(); } catch (e) { done(); mlShare(); }
  }
  function mlShareText() { var G = mlGroceries(), left = G.items.filter(function (x) { return !x.got; }); return "Groceries, " + mlRangeText() + "\n" + mlAisles(left).map(function (g) { return "\n" + g[0].toUpperCase() + "\n" + g[1].map(function (x) { return "☐ " + x.n + (x.ct > 1 ? " ×" + x.ct : ""); }).join("\n"); }).join("\n"); }
  function mlShare() {
    var text = mlShareText();
    if (navigator.share) { navigator.share({ title: "Groceries", text: text }).catch(function () { /* closed: nothing to do */ }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast("The list is copied. Paste it anywhere."); }, function () { toast("Couldn't copy the list."); });
  }

  /* ---- PLAN MY WEEK (Claude, about 1¢): proposals for the open nights; nothing changes until PLAN THESE ---- */
  function mlPlanAsk() {
    var nights = mlNights().filter(function (d) { return !mlDinner(d); }).slice(0, 7);
    if (!nights.length) { toast("Every night from today is planned already."); return; }
    ml.planBusy = true; ml.planErr = ""; ml.plan = null; render(true);
    apiPost({ action: "mealplan", nights: nights }, 90000).then(function (j) {
      ml.plan = (j.plan || []).map(function (p) { return { date: p.date, meal: p.meal, why: p.why || "", take: true }; });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
    }, function (err) { ml.planErr = err && err.code === "meals_too_few" ? "Add a few more meals first: Claude plans from your own list." : describeAi(err); })
      .then(function () { ml.planBusy = false; if (state.screen === "meals") render(true); });
  }

  /* ---- drawing ---- */
  function mlHead() { var cm = ml.cook && mlMeal(ml.cook.id); return { e: "RESOURCES · MEALS · " + (cm ? "COOK" : mlView.tab === "log" ? "LOG AND ROTATION" : ml.imp ? "FROM A RECIPE" : ml.form ? (ml.form.isNew ? "NEW MEAL" : "EDIT MEAL") : "PLAN THE WEEK"), t: cm ? cm.name.toUpperCase() : "MEALS" }; }
  function mlDayBtn(day, small) {
    var t = mlToday(), dn = mlDinner(day), d = parseYmd(day), sel = ml.sel === day, past = day < t;
    var cls = "ml-day" + (small ? " sm" : "") + (day === t ? " today" : "") + (sel ? " sel" : "") + (dn ? (dn.status === "eaten" ? " eaten" : " planned") : past ? " blank" : " open");
    var m = dn && dn.kind === "meal" ? mlMeal(dn.meal) : null;
    return '<button type="button" class="' + cls + '" data-mlday="' + day + '" aria-pressed="' + sel + '"' + (m ? ' style="--k: ' + ML_KC[m.kind] + '"' : "") + "><small>" + (small ? (d.getDate() === 1 ? MON[d.getMonth()] + " " : "") + d.getDate() : DOW[d.getDay()] + " " + d.getDate()) + (day === t ? " · TODAY" : "") + "</small><b>" +
      esc(dn ? mlDName(dn) : past ? (small ? "" : "Not recorded") : small ? "" : "+ PLAN") + "</b>" + (small ? "" : "<span>" + (dn ? (dn.status === "eaten" ? "EATEN ✓" : "PLANNED") : past ? "TAP TO FILL IN" : "OPEN") + "</span>") + "</button>";
  }
  function mlDayBar(hint) {
    var day = ml.sel, dn = mlDinner(day), d = parseYmd(day), t = mlToday(), rec = mlStatusFor(day) === "eaten";
    return '<div class="ml-daybar" id="mlDayBar"><span><b>' + DOWL[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()] + "</b> · " + (dn ? esc(mlDName(dn)) + ", " + (dn.status === "eaten" ? "eaten" : "planned") : "nothing yet") +
      ". " + hint + (rec ? " to record it." : " to plan it.") + '</span><span class="btnrow">' +
      (dn && dn.status === "planned" && day <= t ? '<button type="button" class="chip sm" data-mlset="had" style="--c: var(--ok)">✓ HAD IT</button>' : "") +
      '<button type="button" class="chip sm" data-mlset="leftovers">LEFTOVERS</button><button type="button" class="chip sm" data-mlset="out">EATING OUT</button>' +
      (dn ? '<button type="button" class="chip sm" data-mlset="none">CLEAR</button>' : "") + (dn && dn.kind === "meal" && mlMeal(dn.meal) && canRecipes() ? '<button type="button" class="chip sm" data-mlcook="' + esc(dn.meal) + '" style="--c: var(--chrome-d)">COOK</button>' : "") + '<button type="button" class="chip sm" data-ml="unsel">DONE</button></span></div>';
  }
  function mlPlanHtml() {
    var mon = mlMonday(ml.wk), html = '<div class="ml-plan"><div class="ml-main">';
    var wl = ml.wk === 0 ? "THIS WEEK" : ml.wk === 1 ? "NEXT WEEK" : ml.wk === -1 ? "LAST WEEK" : "IN " + ml.wk + " WEEKS";
    html += '<section class="ml-panel ml-week" aria-label="' + wl + '"><div class="ml-ph"><h3>' + wl + '</h3><span class="ml-sub">' + p2(mon.getDate()) + " " + MON[mon.getMonth()] + " TO " + p2(addDays(mon, 6).getDate()) + " " + MON[addDays(mon, 6).getMonth()] + "</span>" +
      '<span class="ml-wkn"><button type="button" class="chip sm" data-ml="wkprev" aria-label="The week before"' + (ml.wk <= -1 ? " disabled" : "") + '>◀</button><button type="button" class="chip sm" data-ml="wknext" aria-label="The week after"' + (ml.wk >= 2 ? " disabled" : "") + ">▶</button></span></div>";
    html += '<div class="ml-days">'; for (var i = 0; i < 7; i++) html += mlDayBtn(ymd(addDays(mon, i))); html += "</div>";
    if (ml.sel) html += mlDayBar("Tap a meal");
    var open = mlNights().filter(function (d) { return !mlDinner(d); }).length;
    if (canMealPlan() && mlMeals().length >= 2 && (open || ml.plan)) {
      html += '<div class="ml-ai">' + (ml.plan ? "" : '<button type="button" class="chip" data-ml="plan" style="--c: var(--chrome-a)"' + (ml.planBusy ? " disabled" : "") + ">" + (ml.planBusy ? "PLANNING…" : "PLAN MY WEEK") + "</button><small class=\"muted\">" +
        (ml.planBusy ? "Claude is looking at your rotation…" : "Claude proposes the " + open + " open " + (open === 1 ? "night" : "nights") + " from your meals, favouring what is due. About 1¢. Nothing is planned until you confirm.") + "</small>") +
        (ml.planErr ? '<div class="errtxt">' + esc(ml.planErr) + "</div>" : "");
      if (ml.plan) {
        var n = ml.plan.filter(function (p) { return p.take; }).length;
        html += '<div class="ml-props"><b class="ml-sub">CLAUDE PROPOSES</b>' + ml.plan.map(function (p, ix) {
          var m = mlMeal(p.meal), d = parseYmd(p.date);
          return '<button type="button" class="ml-prop" data-mltake="' + ix + '" aria-pressed="' + p.take + '"><i aria-hidden="true">' + (p.take ? "✓" : "") + "</i><span><small>" + DOW[d.getDay()] + " " + d.getDate() + "</small><b>" + esc(m ? m.name : p.meal) + "</b><small>" + esc(p.why) + "</small></span></button>";
        }).join("") + '<span class="btnrow"><button type="button" class="chip" data-ml="planok"' + (n ? "" : " disabled") + ' style="--c: var(--ok)">PLAN THESE (' + n + ')</button><button type="button" class="chip" data-ml="planno">NOT NOW</button></span></div>';
      }
      html += "</div>";
    }
    html += "</section>";
    html += '<section class="ml-panel ml-cards" aria-label="Meal library"><div class="ml-ph"><h3>' + (ml.imp ? "FROM A RECIPE" : ml.form ? (ml.form.isNew ? "NEW MEAL" : "EDIT MEAL") : "MEAL LIBRARY") + '</h3><span class="ml-sub">' +
      (ml.imp ? "A LINK, THE TEXT, OR A PHOTO" : ml.form ? "" : ml.editing ? "TAP A MEAL TO EDIT IT" : ml.sel ? "TAP A MEAL FOR " + DOW[parseYmd(ml.sel).getDay()] + " " + parseYmd(ml.sel).getDate() : "TAP A NIGHT, THEN A MEAL") + "</span>" +
      (ml.form || ml.imp ? "" : '<span class="btnrow"><button type="button" class="chip sm" data-ml="edit" aria-pressed="' + ml.editing + '">' + (ml.editing ? "DONE EDITING" : "EDIT MEALS") + '</button><button type="button" class="chip sm" data-ml="new">+ MEAL</button>' +
        (canMealImport() ? '<button type="button" class="chip sm" data-ml="imp" style="--c: var(--chrome-a)">+ FROM A RECIPE</button>' : "") + "</span>") + "</div>";
    if (ml.imp) html += mlImpHtml();
    else if (ml.form) html += mlFormHtml();
    else html += mlLibHtml();
    html += "</section>";
    var late = mlByAgo().filter(function (x) { return x.r.late; });
    if (late.length && !ml.form && !ml.imp) html += '<section class="ml-panel ml-lates"><b>NOT IN A WHILE</b>' + late.slice(0, 8).map(function (x) { return '<button type="button" class="chip sm" data-mlcard="' + esc(x.m.id) + '" style="--c: var(--warn)">' + esc(x.m.name) + " · " + x.r.since + " DAYS</button>"; }).join("") + "</section>";
    return html + "</div>" + mlGroceryHtml() + "</div>";
  }
  function mlGroceryHtml() {
    var G = mlGroceries(), html = '<section class="ml-panel ml-groc" aria-label="Groceries"><div class="ml-ph"><h3>GROCERIES</h3><span class="ml-sub" id="mlLeft">' + G.left + " TO BUY</span></div><small class=\"muted\">For " + esc(mlRangeText()) + ", from the nights planned.</small>";
    if (!G.items.length) html += '<p class="muted">Nothing on it yet. Plan a night and what that meal needs appears here, by aisle.</p>';
    mlAisles(G.items).forEach(function (g) {
      html += '<div class="ml-aisle"><h4>' + esc(g[0].toUpperCase()) + "</h4>" + g[1].map(function (x) {
        return '<span class="ml-itemrow"><button type="button" class="ml-item' + (x.got ? " got" : "") + '" data-mlgot="' + esc(x.k) + '" aria-pressed="' + x.got + '"><i aria-hidden="true">' + (x.got ? "✓" : "") + "</i><span><b>" + esc(x.n) + (x.ct > 1 ? " ×" + x.ct : "") + "</b><small>" + (x.extra ? "added by hand" : "for " + esc(x.for.join(", "))) + "</small></span></button>" +
          (x.extra ? '<button type="button" class="ml-x" data-mlrmx="' + esc(x.k) + '" aria-label="Take ' + esc(x.n) + ' off the list">×</button>' : "") + "</span>";
      }).join("") + "</div>";
    });
    if (G.staples) html += '<small class="muted">' + G.staples + (G.staples === 1 ? " pantry staple" : " pantry staples") + " left off (marked HAVE on the meal).</small>";
    if (ml.add) html += '<div class="ml-addrow"><input id="mlAddN" maxlength="60" placeholder="Something else to buy" autocomplete="off" aria-label="Item"><select id="mlAddA" aria-label="Aisle">' + ML_AISLES.map(function (a) { return "<option" + (a === "Pantry" ? " selected" : "") + ">" + a + "</option>"; }).join("") + '</select><button type="button" class="chip sm" data-ml="addsave">ADD</button></div>';
    html += '<div class="btnrow"><button type="button" class="chip" data-ml="print" style="--c: var(--ok)"' + (G.left ? "" : " disabled") + '>PRINT</button><button type="button" class="chip" data-ml="share"' + (G.left ? "" : " disabled") + '>SHARE</button><button type="button" class="chip" data-ml="add" aria-expanded="' + ml.add + '">+ ITEM</button></div>';
    return html + "</section>";
  }
  function mlFormHtml() {
    var f = ml.form;
    var html = '<div class="ml-form">' + (f.full ? mlImported(f) : "") + '<label class="ov-sub" for="mlName">NAME</label><input id="mlName" maxlength="200" autocomplete="off" value="' + esc(f.name) + '">' +
      '<span class="ov-sub">KIND</span><div class="btnrow">' + ML_KINDS.map(function (k) { return '<button type="button" class="chip sm" data-mlkind="' + k + '" aria-pressed="' + (f.kind === k) + '" style="--c: ' + ML_KC[k] + '">' + k.toUpperCase() + "</button>"; }).join("") + "</div>" +
      '<span class="ov-sub">PHOTO</span><div class="ml-photo" style="--k: ' + ML_KC[f.kind] + '">' + mlPic(f, "lg") + '<span class="ml-photoc"><span class="btnrow"><label class="chip sm ml-file' + (f.busy ? " busy" : "") + '">' + (f.busy ? "MAKING IT SMALL…" : f.thumb ? "A DIFFERENT PHOTO" : "TAKE OR CHOOSE A PHOTO") +
        '<input id="mlThumbFile" type="file" accept="image/*"' + (f.busy ? " disabled" : "") + "></label>" + (f.thumb || f.photo ? '<button type="button" class="chip sm" data-ml="thumbrm">REMOVE</button>' : "") + "</span>" +
        (f.thumb ? '<small class="muted">Kept small with the meal in Notion.</small>' : '<input id="mlPhotoUrl" type="url" maxlength="1000" autocomplete="off" placeholder="or paste an image link (https://)" aria-label="Image link" value="' + esc(f.photo || "") + '">') + "</span></div>" +
      '<span class="ov-sub">WHAT IT NEEDS FROM THE STORE</span><div class="ml-ings">' + f.ing.map(function (x, i) {
        return '<div class="ml-ing"><input class="ml-ingn" data-i="' + i + '" maxlength="100" autocomplete="off" placeholder="Ingredient" aria-label="Ingredient ' + (i + 1) + '" value="' + esc(x.n) + '"><select class="ml-inga" data-i="' + i + '" aria-label="Aisle for ingredient ' + (i + 1) + '">' +
          ML_AISLES.map(function (a) { return "<option" + (x.a === a ? " selected" : "") + ">" + a + "</option>"; }).join("") + '</select><button type="button" class="chip sm" data-mlhave="' + i + '" aria-pressed="' + !!x.have + '" title="Always in the pantry: left off the list">HAVE</button><button type="button" class="ml-x" data-mlingrm="' + i + '" aria-label="Remove ingredient ' + (i + 1) + '">×</button></div>';
      }).join("") + '</div><div class="btnrow"><button type="button" class="chip sm" data-ml="ingadd">+ INGREDIENT</button></div>' +
      '<label class="ov-sub" for="mlRecipe">RECIPE LINK</label><input id="mlRecipe" type="url" maxlength="1000" autocomplete="off" placeholder="https://" value="' + esc(f.recipe) + '">' +
      '<label class="ov-sub" for="mlNotes">NOTES</label><textarea id="mlNotes" rows="3" maxlength="4000">' + esc(f.notes) + "</textarea>" +
      (f.err ? '<div class="errtxt">' + esc(f.err) + "</div>" : "") +
      '<div class="btnrow"><button type="button" class="btn capture" data-ml="save">SAVE</button><button type="button" class="btn ghost" data-ml="cancel">CANCEL</button>';
    if (!f.isNew) {
      var armed = ml.arm === "del" && Date.now() - ml.armAt < 4000;
      if (canRecipes()) html += '<button type="button" class="chip" data-mlcook="' + esc(f.id) + '" style="--c: var(--chrome-d)">COOK</button>';
      html += '<button type="button" class="chip" data-ml="retire" aria-pressed="' + !!f.retired + '">' + (f.retired ? "RETIRED · OFF THE LIST" : "RETIRE") + '</button><button type="button" class="chip" data-ml="del"' + (armed ? ' style="--c: var(--bad)"' : "") + ">" + (armed ? "TAP AGAIN TO REMOVE" : "REMOVE") + "</button>";
    }
    return html + "</div></div>";
  }
  function mlFormRead() {
    var f = ml.form; if (!f) return;
    var v = function (id) { var el = $(id); return el ? el.value : null; };
    if (v("mlName") !== null) f.name = v("mlName");
    if (v("mlRecipe") !== null) f.recipe = v("mlRecipe");
    if (v("mlNotes") !== null) f.notes = v("mlNotes");
    if (v("mlPhotoUrl") !== null) f.photo = v("mlPhotoUrl").trim();
    Array.prototype.forEach.call(document.querySelectorAll(".ml-ingn"), function (el) { var x = f.ing[+el.dataset.i]; if (x) x.n = el.value; });
    Array.prototype.forEach.call(document.querySelectorAll(".ml-inga"), function (el) { var x = f.ing[+el.dataset.i]; if (x) x.a = el.value; });
  }
  function mlFormSave() {
    mlFormRead();
    var f = ml.form, name = f.name.trim(), recipe = f.recipe.trim();
    if (!name) { f.err = "Give the meal a name."; render(true); return; }
    if (recipe && !/^https?:\/\/\S+$/.test(recipe)) { f.err = "The recipe link should start with https://"; render(true); return; }
    if (f.photo && f.photo !== f.photo0 && (!/^https:\/\/\S+$/.test(f.photo) || f.photo.length > 1000)) { f.err = "The image link should start with https://"; render(true); return; }
    if (f.busy) { f.err = "One moment: the photo is still being made small."; render(true); return; }
    var ing = f.ing.map(function (x) { return { n: x.n.replace(/[\r\n·]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100), a: x.a, have: !!x.have }; }).filter(function (x) { return x.n; });
    var meal = { id: f.id, name: name.slice(0, 200), kind: f.kind, ing: ing, recipe: recipe, photo: f.photo || "", thumb: f.thumb || "", notes: f.notes.trim().slice(0, 4000), retired: !!f.retired };
    if (f.full) meal.full = f.full;   /* an import: the recipe becomes the Notion page's body */
    mlQueue({ op: "meal", meal: meal });
    ml.form = null; toast((f.isNew ? "Added " : "Saved ") + name);
    render(true);
  }
  function mlLogHtml() {
    var start = mlMonday(-4), html = '<section class="ml-panel ml-log" aria-label="Five weeks of dinners"><div class="ml-ph"><h3>FIVE WEEKS</h3><span class="ml-sub">SOLID: EATEN · OUTLINED: PLANNED · TAP A NIGHT</span></div><div class="ml-cal">';
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(function (d) { html += '<span class="ml-dow">' + d + "</span>"; });
    for (var i = 0; i < 35; i++) html += mlDayBtn(ymd(addDays(start, i)), true);
    html += "</div>";
    if (ml.sel) {
      html += mlDayBar("Tap a meal below");
      html += '<div class="ml-pick">' + mlLibHtml() + "</div>";
    }
    html += "</section>";
    var S = mlView.sort, rows = mlMeals().map(function (m) { return { m: m, r: mlRot(m.id) }; }).sort(mlSorter(S));
    html += '<section class="ml-panel ml-rot" aria-label="Rotation"><div class="ml-ph"><h3>ROTATION</h3><span class="btnrow" role="group" aria-label="Sort">' +
      [["last", "LONGEST AGO"], ["times", "MOST MADE"], ["name", "A TO Z"]].map(function (s) { return '<button type="button" class="chip sm" data-mlsort="' + s[0] + '" aria-pressed="' + (S === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</span></div>";
    html += rows.length ? '<div class="ml-table" role="table" aria-label="Rotation"><div class="ml-tr ml-th" role="row"><span role="columnheader">MEAL</span><span role="columnheader">LAST MADE</span><span role="columnheader">IN 90 DAYS</span><span role="columnheader">USUALLY</span><span role="columnheader"></span></div>' +
      rows.map(function (x) {
        var r = x.r;
        return '<div class="ml-tr' + (r.late ? " late" : "") + '" role="row"><span role="cell"><i style="background: ' + ML_KC[x.m.kind] + '"></i>' + esc(x.m.name) + '</span><span role="cell">' + (r.last ? esc(shortDay(r.last)) + " · " + mlAgo(r.since) : "not yet") +
          '</span><span role="cell">' + r.times + '×</span><span role="cell">' + (r.usual ? "every " + r.usual + " days" : "–") + '</span><span role="cell" class="ml-flag">' + (r.late ? "NOT IN A WHILE" : r.due ? "DUE" : "") + "</span></div>";
      }).join("") + "</div>" : '<p class="muted">No meals yet.</p>';
    return html + "</section>";
  }
  function renderMeals() {
    loadMeals(false);
    if (!canMeals()) { $("content").innerHTML = '<div class="ml">' + phead("MEALS", "SETUP") + stubBox(state.conn ? "Needs the Google bridge updated to 1.39, and 🍽 Meals and 🍽 Dinners connected to the TimothyOS integration in Notion. Steps are in the README under <b>MEALS</b>." : "Link the bridge first, in SYSTEMS.") + "</div>"; return; }
    if (!ml.data) { $("content").innerHTML = '<div class="ml">' + phead("MEALS", "") + '<div class="empty">' + (ml.err ? esc(ml.err.msg) : "Loading your meals from Notion…") + "</div></div>"; return; }
    if (ml.cook && !mlMeal(ml.cook.id)) { ml.cook = null; mlWake(false); }
    if (ml.cook) { $("content").innerHTML = '<div class="ml">' + mlCookHtml() + "</div>"; return; }
    var nq = ml.q.ops.length, html = '<div class="ml">';
    html += '<div class="ml-tabs"><div role="tablist" aria-label="MEALS" class="btnrow">' + [["plan", "PLAN"], ["log", "LOG · ROTATION"]].map(function (x) { return '<button type="button" class="chip" role="tab" data-mltab="' + x[0] + '" aria-selected="' + (mlView.tab === x[0]) + '" aria-pressed="' + (mlView.tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>" +
      (ml.data.url ? '<a class="chip sm" href="' + esc(ml.data.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
    if (ml.err) html += '<div class="err">' + esc(ml.err.msg) + "</div>";
    if (ml.qErr && nq) html += '<div class="err">' + nq + (nq === 1 ? " change" : " changes") + " not in Notion yet: " + esc(ml.qErr) + "</div>";
    else if (ml.qErr) html += '<div class="err">' + esc(ml.qErr) + "</div>";
    html += mlView.tab === "log" ? mlLogHtml() : mlPlanHtml();
    $("content").innerHTML = html + "</div>";
  }
  function mlClick(b) {
    var d = b.dataset;
    if (d.mlnow) {   /* TONIGHT on TODAY and the Bridge */
      var t = mlToday(), dn = mlDinner(t);
      if (d.mlnow === "had" && dn) mlQueue({ op: "dinner", dinner: { date: t, status: "eaten", kind: dn.kind, meal: dn.meal } });
      else if (d.mlnow === "leftovers" || d.mlnow === "out") mlQueue({ op: "dinner", dinner: { date: t, status: "eaten", kind: d.mlnow, meal: null } });
      else if (d.mlnow === "undo" && dn) mlQueue({ op: "dinner", dinner: dn.kind === "meal" ? { date: t, status: "planned", kind: "meal", meal: dn.meal } : { date: t, status: "eaten", kind: "none", meal: null } });
      else if (d.mlnow === "else" || d.mlnow === "open") { mlView.tab = "plan"; ml.wk = 0; ml.sel = d.mlnow === "else" ? t : null; ml.form = null; go("meals"); return true; }
      if (d.mlnow !== "else" && d.mlnow !== "open") toast(d.mlnow === "undo" ? "Tonight: back as it was" : "Dinner recorded");
      render(true); return true;
    }
    if (d.mlcook) { mlCookOpen(d.mlcook); return true; }
    if (state.screen !== "meals") return false;
    if (d.mlimp) { mlImpRead(); ml.imp.mode = d.mlimp; ml.imp.err = ""; render(true); return true; }
    if (d.mltick !== undefined && ml.cook) { ml.cook.got[d.mltick] = !ml.cook.got[d.mltick]; render(true); return true; }
    if (d.mlstep !== undefined && ml.cook) { ml.cook.step = +d.mlstep; render(true); return true; }
    if (d.mltab) { mlView.tab = d.mltab; ml.sel = null; ml.all = false; ml.find = ""; mlSaveView(); render(true); return true; }   /* SHOW ALL and a search last for the tab they were made on */
    if (d.mlsort) { mlView.sort = d.mlsort; mlSaveView(); render(true); return true; }
    if (d.mllsort) { mlView.lsort = d.mllsort; mlSaveView(); render(true); return true; }
    if (d.mlkindf !== undefined && !ml.form) { mlView.kind = ML_KINDS.indexOf(d.mlkindf) > -1 ? d.mlkindf : ""; mlSaveView(); render(true); return true; }
    if (d.mlday) { ml.sel = ml.sel === d.mlday ? null : d.mlday; ml.form = null; render(true); return true; }
    if (d.mlset && ml.sel) {
      var day = ml.sel, cur = mlDinner(day);
      if (d.mlset === "had" && cur) mlQueue({ op: "dinner", dinner: { date: day, status: "eaten", kind: cur.kind, meal: cur.meal } });
      else if (d.mlset !== "had") mlSet(day, d.mlset);
      render(true); return true;
    }
    if (d.mlcard) {
      var m = mlMeal(d.mlcard); if (!m) return true;
      if (ml.editing) { ml.form = { id: m.id, name: m.name, kind: m.kind, ing: m.ing.map(function (x) { return { n: x.n, a: x.a, have: !!x.have }; }), recipe: m.recipe || "", photo: m.photo || "", photo0: m.photo || "", thumb: m.thumb || "", notes: m.notes || "", retired: !!m.retired, isNew: false, err: "" }; ml.arm = null; render(true); return true; }
      if (!ml.sel) { toast("Tap a night first, then the meal."); return true; }
      var sd = ml.sel; mlSet(sd, "meal", m.id); ml.find = ""; var fi = $("mlFind"); if (fi) { fi.value = ""; fi.blur(); }   /* the next night starts from the whole library (emptied here, or the redraw keeps what was typed) */
      if (mlStatusFor(sd) === "planned" && mlView.tab === "plan") { var nx = mlNights().filter(function (x) { return x > sd && !mlDinner(x); })[0]; ml.sel = nx || null; }   /* on to the next open night */
      else ml.sel = null;
      render(true); return true;
    }
    if (d.mltake !== undefined && ml.plan) { var p = ml.plan[+d.mltake]; if (p) p.take = !p.take; render(true); return true; }
    if (d.mlgot) { var g = mlGot(); g.got[d.mlgot] = !g.got[d.mlgot]; lsSet(LS_MEALGOT, g); render(true); return true; }
    if (d.mlrmx) { var g2 = mlGot(); g2.extra = g2.extra.filter(function (x) { return x.n.toLowerCase() !== d.mlrmx; }); delete g2.got[d.mlrmx]; lsSet(LS_MEALGOT, g2); render(true); return true; }
    if (d.mlkind && ml.form) { mlFormRead(); ml.form.kind = d.mlkind; render(true); return true; }
    if (d.mlhave !== undefined && ml.form) { mlFormRead(); var it = ml.form.ing[+d.mlhave]; if (it) it.have = !it.have; render(true); return true; }
    if (d.mlingrm !== undefined && ml.form) { mlFormRead(); ml.form.ing.splice(+d.mlingrm, 1); render(true); return true; }
    var a = d.ml; if (!a) return false;
    if (a === "wkprev" || a === "wknext") { ml.wk = Math.max(-1, Math.min(2, ml.wk + (a === "wknext" ? 1 : -1))); ml.sel = null; ml.plan = null; render(true); }
    else if (a === "unsel") { ml.sel = null; render(true); }
    else if (a === "edit") { ml.editing = !ml.editing; ml.sel = null; render(true); }
    else if (a === "new") { ml.form = { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: "", kind: "Other", ing: [{ n: "", a: "Produce", have: false }], recipe: "", photo: "", photo0: "", thumb: "", notes: "", retired: false, isNew: true, err: "" }; ml.sel = null; render(true); var nm = $("mlName"); if (nm) nm.focus(); }
    else if (a === "ingadd" && ml.form) { mlFormRead(); ml.form.ing.push({ n: "", a: "Produce", have: false }); render(true); var ins = document.querySelectorAll(".ml-ingn"); if (ins.length) ins[ins.length - 1].focus(); }
    else if (a === "save" && ml.form) mlFormSave();
    else if (a === "cancel") { ml.form = null; render(true); }
    else if (a === "all") { ml.all = true; render(true); }
    else if (a === "thumbrm" && ml.form) { mlFormRead(); ml.form.thumb = ""; ml.form.photo = ""; render(true); }
    else if (a === "retire" && ml.form) { mlFormRead(); ml.form.retired = !ml.form.retired; render(true); }
    else if (a === "del" && ml.form) {
      if (ml.arm === "del" && Date.now() - ml.armAt < 4000) { mlQueue({ op: "remove", id: ml.form.id }); toast("Removed " + ml.form.name + " (in Notion's trash; its dinners keep their names)"); ml.form = null; ml.arm = null; }
      else { mlFormRead(); ml.arm = "del"; ml.armAt = Date.now(); setTimeout(function () { if (state.screen === "meals") render(true); }, 4100); }
      render(true);
    }
    else if (a === "plan") mlPlanAsk();
    else if (a === "planno") { ml.plan = null; ml.planErr = ""; render(true); }
    else if (a === "planok" && ml.plan) {
      var n = 0; ml.plan.forEach(function (pt) { if (pt.take && !mlDinner(pt.date) && mlMeal(pt.meal)) { mlQueue({ op: "dinner", dinner: { date: pt.date, status: "planned", kind: "meal", meal: pt.meal } }); n++; } });
      ml.plan = null; toast(n + (n === 1 ? " night planned" : " nights planned")); render(true);
    }
    else if (a === "add") { ml.add = !ml.add; render(true); var an = $("mlAddN"); if (an) an.focus(); }
    else if (a === "addsave") {
      var nmv = ($("mlAddN") || {}).value || "", av = ($("mlAddA") || {}).value || "Pantry", g3 = mlGot(), n3 = nmv.replace(/\s+/g, " ").trim().slice(0, 60);
      if (n3 && !g3.extra.some(function (x) { return x.n.toLowerCase() === n3.toLowerCase(); })) { g3.extra.push({ n: n3, a: ML_AISLES.indexOf(av) > -1 ? av : "Other" }); lsSet(LS_MEALGOT, g3); }
      render(true); var an2 = $("mlAddN"); if (an2) an2.focus();
    }
    else if (a === "imp") { ml.imp = { mode: "link", url: "", text: "", file: null, busy: false, err: "" }; ml.form = null; ml.sel = null; ml.editing = false; render(true); var iu = $("mlImpUrl"); if (iu) iu.focus(); }
    else if (a === "impno") { ml.imp = null; render(true); }
    else if (a === "paste" && ml.imp) {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (tt) { var u = (String(tt || "").match(/https?:\/\/\S+/) || [""])[0]; if (u) { ml.imp.url = u; render(true); } else toast("No link on the clipboard. Copy the recipe's link first."); }, function () { toast("Couldn't read the clipboard. Paste the link into the box."); });
      else toast("Paste the link into the box.");
    }
    else if (a === "impgo" && ml.imp) mlImpGo();
    else if (a === "cookx") mlCookClose();
    else if (a === "cookprev" || a === "cooknext") { if (ml.cook) { var nst = ml.cook.data ? ml.cook.data.steps.length : 0; ml.cook.step = Math.max(0, Math.min(nst - 1, ml.cook.step + (a === "cooknext" ? 1 : -1))); render(true); var cs = document.querySelector(".ml-step.now"); if (cs) cs.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" }); } }
    else if (a === "cookbig") { mlView.big = !mlView.big; mlSaveView(); render(true); }
    else if (a === "print") mlPrint();
    else if (a === "share") mlShare();
    else return false;
    return true;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "mlAddN") { e.preventDefault(); var b = document.querySelector('[data-ml="addsave"]'); if (b) b.click(); } });
  /* ---- + FROM A RECIPE (2.60, bridge 1.40): a link, the text, or a photo → the editor, filled in, to review ---- */
  function mlImpHtml() {
    var I = ml.imp, tabs = [["link", "A LINK"], ["text", "THE TEXT"], ["photo", "A PHOTO"]];
    var html = '<div class="ml-imp"><div class="btnrow" role="group" aria-label="From">' + tabs.map(function (t) { return '<button type="button" class="chip sm" data-mlimp="' + t[0] + '" aria-pressed="' + (I.mode === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (I.mode === "link") html += '<label class="ov-sub" for="mlImpUrl">THE RECIPE\'S LINK (A RECIPE SITE, OR A PINTEREST PIN)</label><div class="ml-addrow ml-two"><input id="mlImpUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="' + esc(I.url) + '"><button type="button" class="chip sm" data-ml="paste">PASTE</button></div>' +
      '<small class="muted">Most recipe sites carry the recipe in a form Bridge reads directly, so Claude only names it and makes the shopping list (about ½¢).</small>';
    else if (I.mode === "text") html += '<label class="ov-sub" for="mlImpText">THE RECIPE, PASTED</label><textarea id="mlImpText" rows="8" maxlength="40000" placeholder="Paste the ingredients and steps">' + esc(I.text) + "</textarea><small class=\"muted\">About 1¢.</small>";
    else html += '<label class="ov-sub" for="mlImpPhoto">A PHOTO OF THE RECIPE (A COOKBOOK PAGE, A CARD)</label><input id="mlImpPhoto" type="file" accept="image/*">' + (I.file ? '<small class="muted">' + esc(I.file.name || "Photo") + " chosen.</small>" : "") + '<small class="muted">About 2¢. The photo goes to Claude to read, and isn\'t kept.</small>';
    if (I.err) html += '<div class="errtxt">' + esc(I.err) + "</div>";
    return html + '<div class="btnrow"><button type="button" class="btn capture" data-ml="impgo"' + (I.busy ? " disabled" : "") + ">" + (I.busy ? "READING THE RECIPE…" : "BUILD THE CARD") + '</button><button type="button" class="btn ghost" data-ml="impno">CANCEL</button></div><small class="muted">Nothing is saved until you check the card and tap SAVE.</small></div>';
  }
  function mlImpRead() { var I = ml.imp; if (!I) return; var u = $("mlImpUrl"), t = $("mlImpText"); if (u) I.url = u.value.trim(); if (t) I.text = t.value; }
  function mlImpErr(err) {
    var c = err && err.code;
    return { recipe_blocked: "That site won't let Bridge read it. Copy the recipe's text and use THE TEXT instead.", recipe_unreachable: "Couldn't open that link. Check it, or use THE TEXT.",
      pin_no_source: "That pin doesn't say where its recipe is. Open the pin, tap through to the recipe's own site, and copy that link.", recipe_not_found: "Claude couldn't find a recipe there.",
      bad_request: "That isn't a link, text or photo Bridge can read." }[c] || describeAi(err);
  }
  function mlPhoto(file) {   /* a photo, smaller (1600 px on its long side) and as JPEG, so it travels quickly */
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.82).split(",")[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("photo")); };
      img.src = url;
    });
  }
  function mlImpGo() {
    mlImpRead();
    var I = ml.imp, body = { action: "mealimport" };
    if (I.mode === "link") { if (!/^https?:\/\/\S+$/.test(I.url)) { I.err = "Paste the recipe's link (it starts with https://)."; render(true); return; } body.url = I.url; }
    else if (I.mode === "text") { if (I.text.trim().length < 30) { I.err = "Paste the whole recipe: its ingredients and steps."; render(true); return; } body.text = I.text; }
    else if (!I.file) { I.err = "Choose a photo first."; render(true); return; }
    I.busy = true; I.err = ""; render(true);
    (I.mode === "photo" ? mlPhoto(I.file).then(function (b64) { body.image = b64; body.mime = "image/jpeg"; }) : Promise.resolve()).then(function () { return apiPost(body, 150000); }).then(function (j) {
      var r = j.recipe; if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      ml.imp = null;
      ml.form = { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: r.name, kind: ML_KINDS.indexOf(r.kind) > -1 ? r.kind : "Other", ing: r.ing.length ? r.ing : [{ n: "", a: "Produce", have: false }],
        recipe: r.source || "", photo: r.photo || "", photo0: r.photo || "", thumb: "", notes: r.notes || "", retired: false, isNew: true, err: "", via: j.via, cost: j.cost,
        full: { lines: r.lines, steps: r.steps, servings: r.servings || "", time: r.time || "", source: r.source || "" } };
      if (r.photoData) {   /* 2.79: the recipe's photo, as the bridge fetched it, made small here */
        var f = ml.form; f.busy = true;
        mlThumb(r.photoData).then(function (d) { f.thumb = d; }, function () { /* initials, then */ }).then(function () { f.busy = false; if (ml.form === f && state.screen === "meals") render(true); });
      }
    }, function (err) { I.busy = false; I.err = err && err.message === "photo" ? "Couldn't open that photo. Try another." : mlImpErr(err); })
      .then(function () { if (state.screen === "meals") render(true); });
  }
  function mlImported(f) {   /* in the editor: what the import found, to check before SAVE */
    var F = f.full, host = F.source ? F.source.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] : "";
    return '<div class="ml-imported">' + (f.thumb ? '<img src="' + esc(f.thumb) + '" alt="">' : "") + "<span><b>" + (f.via === "photo" ? "FROM YOUR PHOTO" : host ? "FROM " + esc(host.toUpperCase()) : "FROM YOUR TEXT") + "</b><small>" +
      F.lines.length + (F.lines.length === 1 ? " ingredient" : " ingredients") + " as written · " + F.steps.length + (F.steps.length === 1 ? " step" : " steps") + (F.servings ? " · serves " + esc(F.servings) : "") + (F.time ? " · " + esc(F.time) : "") +
      ". Check the name, kind and shopping list below; the recipe goes into the meal's Notion page.</small></span>" +
      '<details class="ml-full"><summary>THE RECIPE</summary><ul>' + F.lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul><ol>" + F.steps.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></details></div>";
  }
  document.addEventListener("change", function (e) { if (e.target && e.target.id === "mlImpPhoto" && ml.imp) { ml.imp.file = e.target.files && e.target.files[0] || null; ml.imp.err = ""; render(true); } });
  /* ASK: a recipe link (or "add this recipe" with one) goes to + FROM A RECIPE instead of to Claude's chat */
  function mlAskRoute(text) {
    if (!canMealImport()) return false;
    var u = (text.match(/https?:\/\/\S+/) || [""])[0];
    if (!(u && (/recipe|pinterest\.|pin\.it/i.test(text))) && !/^(add|import|save) (this |a )?recipe\b/i.test(text)) return false;
    closeAsk();
    mlView.tab = "plan"; go("meals");   /* first: opening MEALS clears what was open in it */
    ml.form = null; ml.cook = null; ml.imp = { mode: u ? "link" : "text", url: u, text: u ? "" : text.replace(/^(add|import|save) (this |a )?recipe:?\s*/i, ""), file: null, busy: false, err: "" };
    if (u || ml.imp.text.trim().length >= 30) mlImpGo(); else render(true);
    return true;
  }

  /* ---- COOK (2.60): the recipe large, for the kitchen; ingredients to tick, the step you're on; the screen kept on ---- */
  function mlCookOpen(id) {
    var m = mlMeal(id); if (!m) return;
    ml.cook = { id: id, data: ml.rc[id] ? ml.rc[id].d : null, err: "", got: {}, step: 0 };
    ml.form = null; ml.imp = null; mlView.tab = "plan";
    if (state.screen !== "meals") go("meals"); else render(true);
    mlWake(true);
    api({ action: "mealrecipe", id: id }).then(function (j) {
      ml.rc[id] = { at: Date.now(), d: { lines: j.lines || [], steps: j.steps || [], other: j.other || [], recipe: j.recipe || "", photo: j.photo || "" } };
      Object.keys(ml.rc).sort(function (a, b) { return ml.rc[b].at - ml.rc[a].at; }).slice(20).forEach(function (k) { delete ml.rc[k]; });   /* the 20 cooked most lately stay for no signal */
      lsSet(LS_MEALRC, ml.rc);
      if (ml.cook && ml.cook.id === id) { ml.cook.data = ml.rc[id].d; ml.cook.err = ""; }
    }, function (err) { if (ml.cook && ml.cook.id === id && !ml.cook.data) ml.cook.err = mlErrText(err); })
      .then(function () { if (state.screen === "meals" && ml.cook) render(true); });
  }
  function mlCookClose() { ml.cook = null; mlWake(false); render(true); }
  function mlWake(on) {   /* the screen stays on while COOK is open, whatever Standby is set to */
    if (!on) { if (ml.wl) { ml.wl.release().catch(function () {}); ml.wl = null; } return; }
    if (ml.wl || !("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (l) { ml.wl = l; l.addEventListener("release", function () { ml.wl = null; }); }, function () { /* refused: Standby still waits while COOK is open */ });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && ml.cook && state.screen === "meals") mlWake(true); });
