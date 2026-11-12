  /* ---------- Time Loom ---------- */
  /* An infinity loop with the focused day at the crossing. The coming days ride the top of the right
     loop and slide down into the crossing; the days just past carry on round the lower-left loop.
     Swipe left to move forward (the finger pulls the coming days in from the right); swipe right goes back. Events hang from each day as beads in their calendar's color; key
     dates sit below as diamonds. Drawn on a canvas, and only while something moves. */
  var LM_N = 24, LM_REACH = 12, LM_BLOCK = 14;
  var lm = { t: 0, vel: 0, target: null, drag: null, base: 0, raf: 0, days: {}, hits: [], col: null, W: 0, H: 0, U: 1, dpr: 1, shownK: null };
  function lmRange() { var t0 = sod(new Date()); return { from: addDays(t0, lm.base - 21), to: addDays(t0, lm.base + 35) }; }
  function lmDay(k) { return addDays(sod(new Date()), k); }
  function lmRel(k) { return k === 0 ? "TODAY" : k === 1 ? "TOMORROW" : k === -1 ? "YESTERDAY" : k > 0 ? "IN " + k + " DAYS" : -k + " DAYS AGO"; }
  function lmFocus() { return Math.round(lm.target !== null ? lm.target : lm.t); }
  /* Each day near the loom: its events (hidden calendars and ignored titles left out) and key dates. */
  function lmData() {
    var r = lmRange(), list = visible(eventsFor(r)), t0 = sod(new Date()), days = {};
    var k0 = Math.round((r.from - t0) / 86400000), k1 = Math.round((r.to - t0) / 86400000);
    for (var k = k0; k < k1; k++) {
      var day = addDays(t0, k), de = dayEvents(list, day), kd = kdMarks(ymd(day), false);
      days[k] = {
        ev: de.allDay.map(function (ev) { return { ev: ev, area: ev.area, time: "ALL DAY" }; })
          .concat(de.timed.map(function (ev) { return { ev: ev, area: ev.area, time: sameDay(ev._s, day) ? hm(ev._s) : "CONT" }; })),
        kd: kd
      };
    }
    lm.days = days;
  }
  function lmPlace(d) {
    var W = lm.W, H = lm.H, u = Math.PI / 2 - d / LM_N * Math.PI * 2, s2 = Math.sin(u) * Math.sin(u), A = Math.min(W * .47, H * .78);
    var x = A * Math.cos(u) / (1 + s2), y = A * Math.sin(u) * Math.cos(u) / (1 + s2);
    var z = Math.cos(d / LM_N * Math.PI * 2), f = Math.pow((z + 1) / 2, 1.4), g = Math.exp(-(d / 1.3) * (d / 1.3));
    return { x: W / 2 + x, y: H * .5 - y * 1.5, s: (.22 + .78 * f) * (.72 + .28 * g), a: .1 + .9 * f * f, z: z, top: z > 0 };
  }
  function lmColors() {
    var cs = getComputedStyle(document.documentElement), v = function (n) { return cs.getPropertyValue(n).trim(); };
    lm.col = { work: v("--work"), personal: v("--personal"), farm: v("--farm"), hobby: v("--hobby"), family: v("--family"), break: v("--chrome-b"), fg: v("--fg"), dim: v("--dim"),
      a: v("--chrome-a"), b: v("--chrome-b"), c: v("--chrome-c"), bg: v("--bg"), display: v("--display"), body: v("--body") };
  }
  function lmSize() {
    var cv = $("lmCv"); if (!cv) return;
    var r = cv.getBoundingClientRect();
    lm.dpr = Math.min(2, window.devicePixelRatio || 1); lm.W = r.width; lm.H = r.height;
    cv.width = Math.round(lm.W * lm.dpr); cv.height = Math.round(lm.H * lm.dpr);
    lm.U = Math.max(.75, Math.min(1.3, Math.min(lm.W, lm.H * 1.4) / 640));
    lmDraw();
  }
  function lmDraw() {
    var cv = $("lmCv"); if (!cv || !lm.W) return;
    var cx = cv.getContext("2d"), C = lm.col, U = lm.U, W = lm.W, H = lm.H, t = lm.t, TAU = Math.PI * 2;
    cx.setTransform(lm.dpr, 0, 0, lm.dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    cx.lineCap = "round";
    cx.font = "600 " + Math.round(12 * U) + "px " + C.display; cx.fillStyle = C.dim; cx.globalAlpha = .8;
    cx.textAlign = "left"; cx.fillText("◀  P A S T", 14, H - 14);
    cx.textAlign = "right"; cx.fillText("F U T U R E  ▶", W - 14, H - 14);
    // the thread: weeks shaded in turn; at the crossing the strand you're on passes over the other
    var segs = [], prev = null, ft = Math.round(t), off = (lmDay(0).getDay() + 6) % 7;
    for (var q = -LM_REACH; q <= LM_REACH + 1e-9; q += .1) {
      var p = lmPlace(q);
      if (prev) segs.push({ a: prev, b: p, wk: ((Math.floor((ft + q + off) / 7) % 2) + 2) % 2, top: p.top && prev.top });
      prev = p;
    }
    function seg(sg, halo) {
      var w = (1 + 2.4 * sg.b.s) * U;
      if (halo) { cx.strokeStyle = C.bg; cx.lineWidth = w + 7 * U; cx.globalAlpha = 1; }
      else { cx.strokeStyle = sg.wk ? C.a : C.c; cx.lineWidth = w; cx.globalAlpha = .1 + .45 * sg.b.a; }
      cx.beginPath(); cx.moveTo(sg.a.x, sg.a.y); cx.lineTo(sg.b.x, sg.b.y); cx.stroke();
    }
    segs.forEach(function (sg) { if (!sg.top) seg(sg); });
    segs.forEach(function (sg) { if (sg.top) seg(sg, true); });
    segs.forEach(function (sg) { if (sg.top) seg(sg); });
    cx.globalAlpha = 1;
    var items = [], labels = [], beads = [];
    for (var k = Math.floor(t - LM_REACH) - 1; k <= Math.ceil(t + LM_REACH) + 1; k++) {
      var d = k - t;
      if (d < -LM_REACH - .5 || d > LM_REACH + .5) continue;
      var pl = lmPlace(d);
      if (pl.a > .02) items.push({ k: k, d: d, p: pl });
    }
    items.sort(function (a, b) { return a.p.z - b.p.z; });
    lm.hits = [];
    items.forEach(function (it) {
      var pt = it.p, dt = lmDay(it.k), near = Math.abs(it.d), info = lm.days[it.k] || { ev: [], kd: [] }, gap = (9 + 13 * pt.s) * U, top = pt.y;
      cx.globalAlpha = pt.a;
      cx.fillStyle = it.k === 0 ? C.b : C.c;
      cx.beginPath(); cx.arc(pt.x, pt.y, (2.5 + 4 * pt.s) * U, 0, TAU); cx.fill();
      // events hang from the day like beads on a warp thread; past seven, the column stops growing
      var ev = info.ev, show = ev.slice(0, 7), back = near < .5 ? 1 : Math.min(1, .4 + .6 * (near - .5) / 1.5);   /* the days beside the crossing step back */
      cx.globalAlpha = pt.a * back;
      /* read top to bottom, start of the day to its end: the earliest bead is highest, the latest sits on the loop */
      show.forEach(function (e, i) {
        var by = pt.y - gap * (show.length - i) - 4 * U, brk = (2.2 + 6.8 * pt.s) * U;
        cx.fillStyle = C[e.area] || C.c;
        cx.beginPath(); cx.arc(pt.x, by, brk, 0, TAU); cx.fill();
        if (i === 0) top = by - brk;
        if (near < .5) {
          beads.push({ x: pt.x - brk, y: by - brk, w: brk * 2, h: brk * 2 });
          lm.hits.push({ ev: e.ev, x: pt.x, y: by, r: Math.max(brk, 14) });
          if (pt.s > .5) labels.push({ t: e.time + "  " + (e.ev.title || "Busy"), x: pt.x - brk - 7 * U, y: by + 4.5 * U, f: "500 " + Math.round(13 * U) + "px " + C.body, c: C.fg, al: "right", a: pt.a, pr: 200 - i * .1, plate: true });
        }
      });
      if (ev.length > show.length && pt.s > .5) labels.push({ t: "+" + (ev.length - show.length) + " LATER", x: pt.x, y: top - 6 * U, f: "600 " + Math.round(12 * U) + "px " + C.display, c: C.dim, al: "center", a: pt.a, pr: near < .5 ? 190 : 40 });
      cx.globalAlpha = pt.a;
      // a key date sits below the day as a diamond
      var o = (16 + 14 * pt.s) * U;
      if (info.kd.length) {
        var kr = (4 + 7 * pt.s) * U, ky = pt.y + o;
        cx.fillStyle = C.b; cx.beginPath(); cx.moveTo(pt.x, ky - kr); cx.lineTo(pt.x + kr, ky); cx.lineTo(pt.x, ky + kr); cx.lineTo(pt.x - kr, ky); cx.closePath(); cx.fill();
        if (near < .5) lm.hits.push({ kd: info.kd[0].o, x: pt.x, y: ky, r: Math.max(kr, 14) });
        o += kr + (12 + 6 * pt.s) * U;
        if (pt.s > .4) labels.push({ t: String(info.kd[0].o.d.title || "").toUpperCase() + (info.kd.length > 1 ? " +" + (info.kd.length - 1) : ""), x: pt.x, y: pt.y + o + (14 + 6 * pt.s) * U, f: "600 " + Math.round((11 + 4 * pt.s) * U) + "px " + C.display, c: C.b, al: "center", a: pt.a, pr: (near < .5 ? 205 : 70) + pt.s * 10 - near });
      } else o += 4 * U;
      if (pt.s > .36) labels.push({ t: DOW[dt.getDay()] + " " + dt.getDate(), x: pt.x, y: pt.y + o, f: (near < .5 ? "700 " : "400 ") + Math.round((10 + 9 * pt.s) * U) + "px " + C.display, c: it.k === 0 ? C.b : C.dim, al: "center", a: pt.a, pr: (near < .5 ? 210 : 60) + pt.s * 20 });
      if (dt.getDate() === 1 && pt.s > .25) labels.push({ t: MON[dt.getMonth()] + " " + dt.getFullYear(), x: pt.x, y: top - 14 * U, f: "600 " + Math.round((11 + 9 * pt.s) * U) + "px " + C.display, c: C.a, al: "center", a: pt.a, pr: 75 });
      cx.globalAlpha = 1;
      lm.hits.push({ k: it.k, x: pt.x, y: pt.y, top: top, r: Math.max(18, 26 * pt.s) * U, z: pt.z });
    });
    // the focus ring at the crossing; no other day's label may sit on it or on today's beads
    var fp = lmPlace(0), rr = (14 + 8 * fp.s) * U, taken = [], ring = { x: fp.x - rr, y: fp.y - rr, w: rr * 2, h: rr * 2 };
    cx.strokeStyle = C.b; cx.globalAlpha = .55; cx.lineWidth = 1.5 * U;
    cx.beginPath(); cx.arc(fp.x, fp.y, rr, 0, TAU); cx.stroke();
    cx.globalAlpha = 1;
    labels.sort(function (a, b) { return b.pr - a.pr; });
    labels.forEach(function (l) {
      if (ring && l.pr < 150) { taken.push(ring); taken.push.apply(taken, beads); ring = null; }
      cx.font = l.f;
      var w = cx.measureText(l.t).width, hgt = parseFloat(l.f.split(" ")[1]) * 1.1;
      var x0 = l.al === "center" ? l.x - w / 2 : l.al === "right" ? l.x - w : l.x, r = { x: x0 - 3, y: l.y - hgt, w: w + 6, h: hgt + 4 };
      if (r.x < 4 || r.x + r.w > W - 4 || r.y < 2 || r.y + r.h > H - 2) return;
      for (var i = 0; i < taken.length; i++) { var o2 = taken[i]; if (r.x < o2.x + o2.w && o2.x < r.x + r.w && r.y < o2.y + o2.h && o2.y < r.y + r.h) return; }
      taken.push(r);
      if (l.plate) { cx.globalAlpha = .82; cx.fillStyle = C.bg; cx.fillRect(r.x - 2, r.y, r.w + 2, r.h); }   /* today's titles stay readable over the beads behind */
      cx.globalAlpha = l.a; cx.fillStyle = l.c; cx.textAlign = l.al; cx.fillText(l.t, l.x, l.y);
    });
    cx.globalAlpha = 1;
    if (Math.round(t) !== lm.shownK) lmPanel();
  }
  /* Motion: one time cursor that glides, coasts after a swipe, and settles on a day. */
  function lmGo(k) { lm.target = k; lm.vel = 0; if (calm()) { lm.t = k; lm.target = null; lmSettle(); } lmKick(); }
  function lmKick() { if (!lm.raf) lm.raf = requestAnimationFrame(lmStep); }
  function lmStep() {
    lm.raf = 0;
    if (!$("lmCv")) return;
    var moving = !!lm.drag;
    if (!lm.drag) {
      if (lm.target !== null) { lm.t += (lm.target - lm.t) * .14; moving = true; if (Math.abs(lm.target - lm.t) < .002) { lm.t = lm.target; lm.target = null; moving = false; lmSettle(); } }
      else if (lm.vel) { lm.t += lm.vel; lm.vel *= .93; moving = true; if (Math.abs(lm.vel) < .004) { lm.vel = 0; lmGo(Math.round(lm.t)); } }
    }
    lmDraw();
    if (moving) lmKick();
  }
  /* Settled on a day: if it has moved into a new fortnight, fetch the events around it. */
  function lmSettle() {
    var b = Math.round(lm.t / LM_BLOCK) * LM_BLOCK;
    if (b !== lm.base) { lm.base = b; lmData(); lmDraw(); refresh(false); }
  }
  function lmHead() {
    var k = Math.round(lm.t), day = lmDay(k);
    $("eyebrow").textContent = "TIME LOOM · " + lmRel(k) + (hiddenNote() ? " · " + hiddenNote() : "");
    $("title").textContent = dLabel(day) + (day.getFullYear() !== new Date().getFullYear() ? " " + day.getFullYear() : "");
  }
  function lmPanel() {
    var k = Math.round(lm.t), day = lmDay(k), key = ymd(day), info = lm.days[k] || { ev: [], kd: [] };
    lm.shownK = k;
    if (state.screen === "loom") lmHead();
    var f = $("lmFocus"), a = $("lmAhead");
    if (!f || !a) return;
    var rows = info.kd.map(function (m) { return kdRow(m.o, key); }).join("") + info.ev.map(function (e) {
      state.index[e.ev.id] = e.ev;
      return '<button type="button" class="kd a-' + e.area + pendingCls(e.ev) + '" data-id="' + esc(e.ev.id) + '"><span class="st"></span><span class="dt tnum">' + e.time + '</span><span class="tt"><b>' + esc(e.ev.title || "Busy") + "</b>" + (e.ev.location ? "<small>" + esc(e.ev.location) + "</small>" : "") + "</span>" + (e.ev.pending ? '<span class="pill">' + pendingTag(e.ev).slice(3) + "</span>" : "") + "</button>";
    }).join("");
    f.innerHTML = phead(k === 0 ? "TODAY" : dLabel(day), info.ev.length ? info.ev.length + (info.ev.length === 1 ? " EVENT" : " EVENTS") : "") +
      (rows || '<div class="empty">' + (hasData(lmRange()) ? "A clear day." : state.sync.status === "syncing" ? "Loading…" : "No data for this day yet.") + "</div>");
    if (!canDates()) { a.innerHTML = ""; return; }
    var ahead = state.dates ? occurrences(ymd(addDays(day, 1)), ymd(addDays(day, 60))).filter(function (o) { return o.s > key; }).slice(0, 4) : [];
    a.innerHTML = phead("KEY DATES AHEAD", "NEXT 60 DAYS", "chrome-a") + (ahead.length ? ahead.map(function (o) { return kdRow(o, key); }).join("") :
      '<div class="empty">' + (state.dates ? "Nothing in the next 60 days." : "Loading key dates…") + "</div>");
  }
  function renderLoom() {
    loadDates(false);
    lmColors();
    lmData();
    if (!$("lmCv")) {
      $("content").innerHTML = '<div class="lm"><div class="lm-stage" id="lmStage" tabindex="0" role="application" aria-roledescription="time loom" ' +
        'aria-label="Time Loom. Swipe or press the right arrow to move forward a day, left to go back; Page Up and Page Down move a week; T returns to today."><canvas id="lmCv"></canvas></div>' +
        '<div class="lm-side"><section id="lmFocus"></section><section id="lmAhead"></section></div></div>';
      lmBind();
      lmSize();
    } else lmDraw();
    lmPanel();
  }
  function lmBind() {
    var st = $("lmStage"), cv = $("lmCv");
    if (window.ResizeObserver) new ResizeObserver(function () { lmSize(); }).observe(cv);
    function pxDay() { return Math.max(38, lm.W / 9); }
    st.addEventListener("pointerdown", function (e) {
      lm.drag = { x: e.clientX, t: lm.t, lx: e.clientX, lt: performance.now(), moved: false };
      lm.vel = 0; lm.target = null;
      st.setPointerCapture(e.pointerId); st.classList.add("drag"); lmKick();
    });
    st.addEventListener("pointermove", function (e) {
      var g = lm.drag; if (!g) return;
      if (Math.abs(e.clientX - g.x) > 4) g.moved = true;
      lm.t = g.t - (e.clientX - g.x) / pxDay();   /* finger left: forward in time (Timothy's thumb, 2.10.1) */
      var now = performance.now();
      lm.vel = (g.lx - e.clientX) / pxDay() * (16 / Math.max(1, now - g.lt));
      g.lx = e.clientX; g.lt = now;
      lmKick();
    });
    function release(e) {
      var g = lm.drag; if (!g) return;
      lm.drag = null; st.classList.remove("drag");
      if (!g.moved) {   /* a tap: today's beads and diamond open their details; any other day glides to the crossing */
        var r = st.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null;
        lm.hits.forEach(function (h) {
          if (h.ev || h.kd) { if (Math.hypot(x - h.x, y - h.y) < h.r + 4 && Math.abs(lm.t - Math.round(lm.t)) < .1) best = h; return; }
          if (best && (best.ev || best.kd)) return;
          var inCol = Math.abs(x - h.x) < h.r && y > h.top - h.r && y < h.y + h.r * 2.2;
          if ((inCol || Math.hypot(x - h.x, y - h.y) < h.r * 1.6) && (!best || h.z > best.z)) best = h;
        });
        if (best && best.ev) openDetail(best.ev);
        else if (best && best.kd) openKeyDate(best.kd);
        else if (best) lmGo(best.k);
        else lmGo(Math.round(lm.t));
        return;
      }
      if (calm()) { lm.vel = 0; lmGo(Math.round(lm.t)); } else { lm.vel = Math.max(-1.2, Math.min(1.2, lm.vel)); lmKick(); }
    }
    st.addEventListener("pointerup", release);
    st.addEventListener("pointercancel", release);
    st.addEventListener("wheel", function (e) {
      var dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;   /* trackpad matches the finger: swipe left, forward */
      if (!dx) return;
      e.preventDefault(); lm.target = null;
      if (calm()) { lmGo(Math.round(lm.t) + (dx > 0 ? 1 : -1)); return; }
      lm.vel = Math.max(-1.2, Math.min(1.2, lm.vel + dx / 900)); lmKick();
    }, { passive: false });
    st.addEventListener("keydown", function (e) {
      var m = { ArrowRight: 1, ArrowLeft: -1, PageDown: 7, PageUp: -7 }[e.key];
      if (m) { e.preventDefault(); lmGo(lmFocus() + m); }
      else if (e.key === "t" || e.key === "T" || e.key === "Home") { e.preventDefault(); lmGo(0); }
    });
  }

  /* ---------- Bulleted lists in the LOG and REVIEW boxes (2.14) ---------- */
  /* Plain text boxes, so a bullet is the character "• ". Typing "- " at the start of a line makes
     one; Return on a bullet starts the next; Return on an empty bullet ends the list; • LIST turns
     the current or selected lines into bullets and back. Edits go through execCommand so they
     fire the usual input event (drafts and saves) and stay undoable; setRangeText if it's missing. */
  function bulletBox(el) { return !!el && el.tagName === "TEXTAREA" && (/^clText-/.test(el.id) || !!el.dataset.rv); }
  function bulReplace(el, from, to, text) {
    var want = el.value.slice(0, from) + text + el.value.slice(to);
    el.focus();
    el.setSelectionRange(from, to);
    try { document.execCommand(text ? "insertText" : "delete", false, text); } catch (x) { /* checked below */ }
    if (el.value !== want) {   /* no execCommand, or it did something else: set it directly */
      el.value = want;
      el.setSelectionRange(from + text.length, from + text.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function bulLine(el) {
    var v = el.value, pos = el.selectionStart, a = v.lastIndexOf("\n", pos - 1) + 1, b = v.indexOf("\n", pos);
    return { start: a, end: b < 0 ? v.length : b, text: v.slice(a, b < 0 ? v.length : b), pos: pos };
  }
  /* "- " at the start of a line becomes "• " */
  function bulOnInput(e) {
    var el = e.target;
    if (!bulletBox(el) || e.inputType !== "insertText" || e.data !== " ") return;
    var L = bulLine(el), head = el.value.slice(L.start, L.pos);
    if (/^[ \t]*- $/.test(head)) bulReplace(el, L.pos - 2, L.pos, "• ");
  }
  function bulOnKey(e) {
    var el = e.target;
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || !bulletBox(el) || el.selectionStart !== el.selectionEnd) return;
    var L = bulLine(el), m = L.text.match(/^([ \t]*)• (.*)$/);
    if (!m) return;
    e.preventDefault();
    if (!m[2].trim() && L.pos === L.end) bulReplace(el, L.start, L.end, "");   /* an empty bullet: the list ends here */
    else bulReplace(el, L.pos, L.pos, "\n" + m[1] + "• ");
  }
  function bulToggle(el) {
    if (!bulletBox(el)) return;
    var v = el.value, s0 = el.selectionStart, s1 = el.selectionEnd;
    var a = v.lastIndexOf("\n", s0 - 1) + 1, bEnd = v.indexOf("\n", Math.max(s1 - (s1 > s0 && v[s1 - 1] === "\n" ? 1 : 0), s0)), b = bEnd < 0 ? v.length : bEnd;
    var lines = v.slice(a, b).split("\n"), filled = lines.filter(function (l) { return l.trim(); });
    var all = filled.length && filled.every(function (l) { return /^[ \t]*• /.test(l); });
    var next = lines.map(function (l) {
      if (all) return l.replace(/^([ \t]*)• /, "$1");
      if (!l.trim()) return lines.length === 1 ? "• " : l;
      return /^[ \t]*• /.test(l) ? l : l.replace(/^([ \t]*)(?:- )?/, "$1• ");
    }).join("\n");
    bulReplace(el, a, b, next);
    if (lines.length > 1) el.setSelectionRange(a, a + next.length);
  }
  function bulChip(target) {
    return '<button type="button" class="chip sm bulchip" data-bul="' + target + '" aria-label="Bulleted list">• LIST</button>';
  }
  /* The chip acts on pointerdown and keeps the box's focus, so the keyboard stays up. */
  $("content").addEventListener("pointerdown", function (e) {
    var c = e.target.closest("[data-bul]"); if (!c) return;
    e.preventDefault();
    bulToggle($(c.dataset.bul));
  });
  $("content").addEventListener("click", function (e) { if (e.target.closest("[data-bul]")) { e.preventDefault(); e.stopPropagation(); } }, true);
  $("content").addEventListener("keydown", bulOnKey);

  /* ---------- Easter eggs (2.13) ---------- */
  /* Six small things for fun, deliberately left out of the README and the app's own text.
     None changes any data, each dismisses with a tap, and Reduce Motion turns them into fades.
       1. "Tea, Earl Grey, hot" typed as a Replicator Queue item: replicated, not added.
       2. Hold the CONDITION block on the Bridge for 3 seconds: Red Alert, then stand down.
       3. Hold the SYNCED block for a moment: the time as a stardate.
       4. "Make it so" or "Engage" in ASK: warp streaks. Never sent to Claude.
       5. "Computer, end program" in ASK: the holodeck grid, then Standby. Never sent.
       6. About one launch in 500: Q drops by. */
  var egg = { timer: null, sdUntil: 0, audio: null };
  function eggNorm(t) { return String(t || "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function eggLayer(cls, html, ms, after) {
    var el = $("egg");
    clearTimeout(egg.timer);
    el.className = "egg " + cls; el.innerHTML = html; el.hidden = false;
    var done = function () { clearTimeout(egg.timer); el.hidden = true; el.className = "egg"; el.innerHTML = ""; el.onclick = null; if (after) { var a = after; after = null; a(); } };
    el.onclick = done;
    egg.timer = setTimeout(done, ms);
  }
  /* A soft synthesized tone: created inside the touch that asked for it, so iPadOS lets it play. */
  function eggAudio() {
    try { if (!egg.audio) egg.audio = new (window.AudioContext || window.webkitAudioContext)(); if (egg.audio.state === "suspended") egg.audio.resume(); } catch (x) { egg.audio = null; }
    return egg.audio;
  }
  function eggKlaxon(n) {
    var a = egg.audio; if (!a) return;
    for (var i = 0; i < n; i++) {
      var t = a.currentTime + i * 0.95, o = a.createOscillator(), g = a.createGain();
      o.type = "sawtooth"; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.55);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.75);
    }
  }
  /* 1. the replicator */
  function isEarlGrey(name) { return /^(computer )?tea earl gr[ae]y hot$/.test(eggNorm(name)); }
  function replicate() {
    eggLayer("rep", '<div class="egg-rep" role="status"><div class="egg-beam" aria-hidden="true"></div><svg class="egg-cup" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path class="steam" d="M24 18c-3-4 3-6 0-10M32 18c-3-4 3-6 0-10M40 18c-3-4 3-6 0-10"/>' +
      '<path class="cup" d="M14 24h32v14a14 14 0 0 1-14 14h-4a14 14 0 0 1-14-14z"/><path class="cup" d="M46 28h4a6 6 0 0 1 0 12h-5"/><path class="cup" d="M10 56h40"/></svg>' +
      "<b>TEA. EARL GREY. HOT.</b></div>", 5200);
  }
  /* 2. red alert */
  function redAlert() {
    var real = (document.querySelector(".ov-cond") || {}).className || "", lv = (real.match(/\b(green|yellow|red)\b/) || ["", "green"])[1];
    eggKlaxon(3);
    eggLayer("red", '<div class="egg-ra"><b>RED ALERT</b><span>ALL HANDS TO BATTLE STATIONS</span></div>', 5200, function () {
      eggLayer("stand", '<div class="egg-ra"><span>STANDING DOWN · CONDITION ' + lv.toUpperCase() + "</span></div>", 1400);
    });
  }
  var raHold = null;
  document.addEventListener("pointerdown", function (e) {   /* the condition is a pill in the header since 2.63 */
    if (!e.target.closest || !e.target.closest(".ov-cond .lvl")) return;
    eggAudio();
    var x = e.clientX, y = e.clientY;
    clearTimeout(raHold);
    raHold = setTimeout(function () { raHold = null; redAlert(); }, 3000);
    var stop = function (ev) { if (ev.type === "pointermove" && Math.hypot(ev.clientX - x, ev.clientY - y) < 12) return; clearTimeout(raHold); raHold = null; ["pointerup", "pointercancel", "pointermove"].forEach(function (t) { document.removeEventListener(t, stop); }); };
    ["pointerup", "pointercancel", "pointermove"].forEach(function (t) { document.addEventListener(t, stop); });
  });
  /* 3. stardate: the year since 1946 in thousands, plus how far through the year, to a tenth */
  function stardate(d) {
    var y0 = new Date(d.getFullYear(), 0, 1), y1 = new Date(d.getFullYear() + 1, 0, 1);
    return ((d.getFullYear() - 1946) * 1000 + (d - y0) / (y1 - y0) * 1000).toFixed(1);
  }
  var sdHold = null, sdFired = false;
  $("status").addEventListener("pointerdown", function () {
    sdFired = false; clearTimeout(sdHold);
    sdHold = setTimeout(function () { sdFired = true; egg.sdUntil = Date.now() + 6000; renderStatus(); setTimeout(renderStatus, 6100); }, 700);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) { $("status").addEventListener(t, function () { clearTimeout(sdHold); }); });
  /* 4 and 5: said to ASK, answered here */
  function askEgg(text) {
    var t = eggNorm(text);
    if (/^(make it so|engage)( number one| mr [a-z]+| ensign)?$/.test(t)) {
      closeAsk();
      var streaks = ""; for (var i = 0; i < 48; i++) streaks += '<i style="--a:' + (i * 7.5 + (i % 3) * 2) + "deg;--d:" + (0.15 + (i % 5) * 0.12).toFixed(2) + 's"></i>';
      eggLayer("warp", '<div class="egg-warp" aria-hidden="true">' + streaks + '</div><div class="egg-ra small"><span>ENGAGING</span></div>', 2600);
      return true;
    }
    if (/^(computer )?end program$/.test(t)) {
      closeAsk();
      eggLayer("holo", '<div class="egg-grid" aria-hidden="true"></div><div class="egg-ra small"><span>PROGRAM ENDED</span></div>', 2800, function () { enterStandby(); });
      return true;
    }
    return false;
  }
  /* 6. Q */
  function maybeQ() {
    if (Math.random() >= 1 / 500) return;
    setTimeout(function () {
      if (sb.on || !$("egg").hidden || document.hidden) return;
      eggLayer("q", '<div class="egg-flash" aria-hidden="true"></div><div class="egg-q"><span>Mon Capitaine. Still playing with your little calendar?</span><b>Q</b></div>', 9000);
    }, 4500);
  }

