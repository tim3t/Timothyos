  /* ---------- Text boxes grow with their text (2.26.1) ---------- */
  /* Every textarea except the Log's editor (growLog) sizes itself to its text: as you type, after any
     redraw or sheet opening (one pass per frame), and when the window changes width. A box with a
     max-height in CSS (Ask) stops there and scrolls inside. Scroll positions around it are kept. */
  function growBox(ta, typing) {
    if (!ta || ta.tagName !== "TEXTAREA" || ta.classList.contains("cl-text") || ta.classList.contains("cl-mirror") || !ta.offsetParent) return;
    /* a pass after a redraw only sizes new boxes and ones that overflow; shrinking waits for typing
       (and never touches scroll needlessly: setting it would stop a smooth scroll under way) */
    if (!typing && ta.style.height && ta.scrollHeight <= ta.clientHeight) return;
    var keep = [], el = ta.parentElement;
    for (; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight) keep.push([el, el.scrollTop]);
    var edge = ta.offsetHeight - ta.clientHeight, cap = parseFloat(getComputedStyle(ta).maxHeight) || Infinity;
    ta.style.height = "auto";
    var want = ta.scrollHeight + edge;
    ta.style.height = Math.min(want, cap) + "px";
    ta.style.overflowY = want > cap ? "auto" : "hidden";
    keep.forEach(function (k) { if (k[0].scrollTop !== k[1]) k[0].scrollTop = k[1]; });
  }
  var growPending = 0;
  function growAll() {
    if (growPending) return;
    growPending = requestAnimationFrame(function () { growPending = 0; document.querySelectorAll("textarea:not(.cl-text):not(.cl-mirror)").forEach(function (ta) { growBox(ta, false); }); });
  }
  document.addEventListener("input", function (e) { if (e.target.tagName === "TEXTAREA") growBox(e.target, true); }, true);
  new MutationObserver(growAll).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  var growW = window.innerWidth;
  window.addEventListener("resize", function () { if (window.innerWidth !== growW) { growW = window.innerWidth; document.querySelectorAll("textarea:not(.cl-text):not(.cl-mirror)").forEach(function (ta) { growBox(ta, true); }); } });

  var renderHeld = false, actAt = 0;
  document.addEventListener("click", function (e) { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) actAt = Date.now(); }, true);
  document.addEventListener("submit", function () { actAt = Date.now(); }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Enter") actAt = Date.now(); }, true);
  var WRITE_LIVE = /^(clFind|haQ|lmFind|nasQ|olq|trQ|laQ|laF|aiMatch|connKey)$/;   /* search and question boxes: their results come in while you're in them */
  function writingNow() {
    var a = document.activeElement;
    return !!a && !!a.id && $("content").contains(a) && !WRITE_LIVE.test(a.id) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|search|)$/.test(a.type)));
  }
  $("content").addEventListener("focusout", function () { setTimeout(function () { if (renderHeld && !writingNow()) { renderHeld = false; render(true); } }, 0); });
  function render(keepScroll) {
    var wrap = $("tlwrap");
    var keep = keepScroll && wrap ? wrap.scrollTop : null;
    var active = document.activeElement, typing = active && active.id && $("content").contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)
      ? { id: active.id, value: active.value, a: active.selectionStart, b: active.selectionEnd } : null;
    /* Text typed into any field since the last draw survives a redraw (a sync landing while you
       fill in a form), not just the field in use. A field you haven't touched shows fresh data. */
    /* Writing in the log: a background redraw would cost the keyboard its place. Leave the page alone. */
    if (keepScroll && state.screen === "log" && active && /^clText-/.test(active.id)) { setAreas(); renderHeader(); renderStatus(); return; }
    if (keepScroll && state.screen === "storage" && pl.scrub) { setAreas(); renderHeader(); renderStatus(); return; }   /* a finger is on the scrubber: a background redraw would take it away */
    /* 2.54.1: writing in any field, a redraw nobody asked for (the clock, a sync landing) waits until you leave it. It
       used to swap the field for a fresh copy and put the focus back, and on the iPad an emoji picked from the keyboard
       in that moment went nowhere. Search boxes still redraw, so their results show while the keyboard is up. */
    if (writingNow() && !window.event && Date.now() - actAt > 15000) { renderHeld = true; setAreas(); renderHeader(); renderStatus(); return; }   /* the answer to a button, Return or a form you just sent still shows at once */
    var typed = {};
    $("content").querySelectorAll("input[id], textarea[id]").forEach(function (f) {
      if ((f.tagName === "TEXTAREA" || /^(text|search|url|tel|email|number|)$/.test(f.type)) && f.value !== f.defaultValue) typed[f.id] = f.value;
    });
    state.index = {};
    setAreas();
    renderHeader();
    renderStatus();
    if (!state.conn && state.screen !== "systems") { renderConnect(); return; }
    ({ bridge: renderBridge, review: function () { if (state.rvLog) renderReviewLog(); else renderReview(); }, ledger: renderLedger, log: renderLog, loom: renderLoom, habits: renderHabits, library: renderLibrary, storage: renderStorage, engineering: renderEngineering, tarot: renderTarot, apiary: renderApiary, meals: renderMeals, arboretum: renderArboretum, sickbay: renderSickbay, astrometrics: renderAstro, inbox: renderInbox, science: renderScience, ressikan: renderRessikan, holodeck: renderHolodeck, today: renderDay, week: renderWeek, month: renderMonth, dates: renderDatesScreen, systems: renderSystems })[state.screen]();
    Object.keys(typed).forEach(function (id) { var f = $(id); if (f && f.value !== typed[id]) f.value = typed[id]; });
    fixJumpPaint();
    miniPaint();
    if (typing && $(typing.id)) {
      var el = $(typing.id);
      el.value = typing.value;
      el.focus();
      try { el.setSelectionRange(typing.a, typing.b); } catch (x) { /* not a text field */ }
    }
    var w2 = $("tlwrap");
    if (w2) w2.scrollTop = keep !== null ? keep : state.scrollTarget || 0;
    var head = $("wkhead");
    if (head && w2) head.style.paddingRight = (w2.offsetWidth - w2.clientWidth) + "px";
  }
  function go(screen, anchor) {
    if (state.screen === "ressikan" && screen !== "ressikan") rs.leave();   /* RESSIKAN goes quiet when you leave it */
    if (state.screen === "holodeck" && screen !== "holodeck") holo.leave();   /* the HOLODECK TV turns off */
    if (screen === "holodeck") holo.arch();   /* entering HOLODECK, or tapping it again: the arch, every time (Timothy, 2.47) */
    if (screen === "log" || state.screen === "log") lockLog();   /* opening LOG always asks for the PIN */
    if (screen === "loom" && state.screen !== "loom") { lm.t = calm() ? 0 : -5; lm.target = null; lm.vel = 0; lm.base = 0; }   /* arrive with a short glide into today */
    if (screen === "habits" && state.screen !== "habits" && !anchor) anchor = new Date();
    if (screen === "ledger" && state.screen !== "ledger") loadLedger(false, true);   /* opening LEDGER: from YNAB itself when the copy here is over a minute old (before the redraw's own, cheaper ask) */
    if (state.launch) openLaunch(false);
    if (screen !== "systems") { state.fixSeen = false; state.fixFocus = null; }
    if (screen === "systems" && state.screen !== "systems") { loadLedger(false); loadApiary(false); loadTarot(false); loadMeals(false); loadSickbay(false); }
    if (screen === "meals" && state.screen === "meals") { ml.sel = null; ml.form = null; ml.editing = false; ml.imp = null; if (ml.cook) { ml.cook = null; mlWake(false); } }
    if (state.screen === "meals" && screen !== "meals" && ml.cook) { ml.cook = null; mlWake(false); }   /* COOK ends when you leave MEALS */   /* tapping MEALS again: the week, nothing selected */   /* 2.58: its rows read for themselves (after a restore they sat at WAITING until LEDGER or APIARY was opened); each skips what is fresh */
    if (screen === "storage" && state.screen === "storage") { nas.view = "home"; nas.dir = "/"; }
    if (screen === "arboretum" && state.screen === "arboretum") arb.home();
    if (screen === "sickbay" && state.screen === "sickbay") { skSet({ tab: "vitals" }); sk.form = null; }   /* tapping SICKBAY again: VITALS */   /* tapping ARBORETUM again: back to the map */
    if (screen === "engineering" && state.screen !== "engineering") eng.at = 0;
    if (screen === "apiary" && state.screen === "apiary") { ap.view = "yard"; ap.form = null; ap.fresh = null; ap.box = null; }   /* tapping APIARY again goes back to the yard */
    if (screen === "science" && state.screen === "science") { sc.tab = "sky"; sc.sel = null; }   /* tapping SCIENCE again: back to SKY TRAFFIC */
    if (screen === "inbox" && state.screen === "inbox") { ib.tab = "waiting"; ib.open = null; ib.armed = null; }   /* tapping INBOX again: back to the waiting notes */
    if (screen === "inbox") loadInbox(true);
    if (screen === "astrometrics") { as.placed = false; if (state.screen === "astrometrics") { as.y = new Date().getFullYear(); as.cell = null; as.kd = null; } }   /* tapping it again comes back to this year */
    if (state.screen === "astrometrics" && screen !== "astrometrics") { shipQuiet(); as.typeT0 = 0; }
    if (screen === "tarot" && state.screen === "tarot") { tr.view = "home"; tr.arm = null; }   /* tapping TAROT again goes back to its front page */   /* arriving: read the devices fresh */   /* tapping STORAGE again goes back to its front page */
    state.screen = screen;
    cmdSeen(screen);
    if (screen === "review") state.rvLog = !anchor;
    if (anchor) state.anchor = sod(anchor);
    render(false);
    if (screen === "loom") lmGo(0);
    $("content").scrollTop = 0;
    fixJumpPaint();
    enterScreen();
    refresh(false);
  }
  function page(dir) {
    if (state.screen === "loom") { lmGo(lmFocus() + dir); return; }   /* the arrows step the loom a day */
    if (state.screen === "astrometrics") { asYear(dir); return; }   /* a year at a time */
    if (state.screen === "habits") { var hn = addDays(state.anchor, dir); if (hn > sod(new Date())) return; state.anchor = hn; render(false); enterScreen(); return; }
    var a = state.anchor;
    if (state.screen === "today") state.anchor = addDays(a, dir);
    else if (state.screen === "week" || state.screen === "review") state.anchor = addDays(a, 7 * dir);
    else state.anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    render(false);
    enterScreen();
    refresh(false);
  }

  document.querySelectorAll(".navbridge[data-screen], .elbow[data-screen]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null); });
  });
  $("status").addEventListener("click", function () { if (sdFired) { sdFired = false; return; } go("systems"); });   /* a hold shows the stardate instead */
  $("fixJump").addEventListener("click", function () { fixJump("fixPanel"); });
  $("toast").addEventListener("click", function (e) { if (!e.target.closest("[data-toastundo]") || !toastUndoFn) return; var f = toastUndoFn; toastUndoFn = null; clearTimeout(toastTimer); $("toast").hidden = true; f(); });
  var fixRaf = 0;
  $("content").addEventListener("scroll", function () { if (state.screen !== "systems" || fixRaf) return; fixRaf = requestAnimationFrame(function () { fixRaf = 0; fixJumpPaint(); }); }, { passive: true });
  $("prevBtn").addEventListener("click", function () { page(-1); });
  $("nextBtn").addEventListener("click", function () { page(1); });
  $("logBtn").addEventListener("click", function () { go("review"); });
  $("todayBtn").addEventListener("click", function () { if (state.screen === "astrometrics") { asYear(new Date().getFullYear() - as.y); return; } go(state.screen, state.screen === "review" ? sow(new Date()) : new Date()); });

  /* A tap on the paper finishes the printing. On press, not click: the printing replaces the text under the finger every frame. */
  $("content").addEventListener("pointerdown", function (e) { if (br.typeT0 && e.target.closest("#brPaper")) { br.typeT0 = 0; render(true); } if (as.typeT0 && e.target.closest("#asPaper")) { as.typeT0 = 0; render(true); } });
  $("content").addEventListener("click", function (e) {
    var hit = e.target.closest(".hit");
    if (hit) { showTip(hit); return; }
    hideTip();
    var bar = e.target.closest("[data-asbar]");
    if (bar) { asBarClick(bar); return; }
    var acg = e.target.closest("g[data-sciac]");
    if (acg) { sc.sel = sc.sel === acg.getAttribute("data-sciac") ? null : acg.getAttribute("data-sciac"); sciPaintSky(); return; }
    var lmg = e.target.closest("g[data-scilm]");
    if (lmg) { slm.sel = slm.sel === lmg.getAttribute("data-scilm") ? null : lmg.getAttribute("data-scilm"); sciPaintSky(); return; }
    var b = e.target.closest("button");
    if (!b) { tapToCapture(e); return; }
    if (b.disabled) return;
    if ((state.screen === "holodeck" && holo.click(b)) || (state.screen === "arboretum" && arb.click(b)) || skClick(b) || skAiClick(b) || (state.screen === "systems" && prof.click(b)) || rs.click(b) || astroClick(b) || inboxClick(b) || sciActs(b) || scienceClick(b) || bkClick(b) || briefClick(b) || habitsClick(b) || libraryClick(b) || storageSysClick(b) || haSysClick(b) || trClick(b) || apClick(b) || mlClick(b) || (state.screen === "storage" && storageClick(b)) || (state.screen === "engineering" && engClick(b))) return;
    if (b.dataset.id && state.index[b.dataset.id]) openDetail(state.index[b.dataset.id]);
    else if (b.dataset.kd && state.index["kd:" + b.dataset.kd]) openKeyDate(state.index["kd:" + b.dataset.kd]);
    else if (b.dataset.task) toggleDone(b.dataset.task, b.dataset.day);
    else if (b.dataset.act === "dates") go("dates");
    else if (b.dataset.act === "aimatch") aiMatch();
    else if (b.dataset.act === "adddate") openCapture(null, null, "date");
    else if (b.dataset.kdf !== undefined) { state.kdFilter = b.dataset.kdf || null; render(false); }
    else if (b.dataset.act === "plan") openPlan(parseYmd(b.dataset.day));
    else if (b.dataset.act === "systems") { state.fixFocus = b.dataset.fix || null; go("systems"); if (state.fixFocus) setTimeout(function () { var c = $("fix-" + state.fixFocus); if (c) restartClass(c, "flash"); }, 350); }
    else if (b.dataset.act === "fixtasks") fixTasks();
    else if (b.dataset.act === "fixsync") fixSync();
    else if (b.dataset.act === "fixbridge") fixBridge();
    else if (b.dataset.act === "fixschema") fixSchema();
    else if (b.dataset.act === "exportnow") exportNow();
    else if (b.dataset.act === "schemacheck") loadSchema(true).then(function () { var n = schemaText(schemaProblems()).length; toast(sch.err ? "Couldn't check: " + sch.err : n ? n + (n === 1 ? " Notion column changed: NEEDS YOU has the steps" : " Notion columns changed: NEEDS YOU has the steps") : "Notion columns checked: they all match"); });
    else if (b.dataset.act === "fixqueue") fixQueue();
    else if (b.dataset.act === "fixdone") go("bridge");
    else if (b.dataset.jump) fixJump(b.dataset.jump);
    else if (b.dataset.act === "bearing") { state.wmShift++; render(true); }
    else if (b.dataset.act === "capnow") openCapture();   /* the ribbon's + (2.63) */
    else if (b.dataset.act === "tarot") go("tarot");
    else if (b.dataset.act === "briefup") { var brTop = document.querySelector(".rb .br"); if (brTop) brTop.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" }); }
    else if (b.dataset.start) { lsSet(LS_START, b.dataset.start); toast("Opens on " + b.dataset.start.toUpperCase() + " from now on"); render(true); }
    else if (["placesave", "geo", "placeclear", "bearsave"].indexOf(b.dataset.act) > -1) bridgeAct(b.dataset.act);
    else if (b.dataset.more) {
      var mk = b.dataset.more, pnlSel = '[data-panel="' + mk + '"]', h0 = document.querySelector(pnlSel) ? document.querySelector(pnlSel).offsetHeight : null;
      bridgeOpen[mk] = !bridgeOpen[mk]; lsSet(LS_BOPEN, bridgeOpen); render(true);
      var pnlNow = document.querySelector(pnlSel);
      easeHeight(pnlNow, h0);
      if (pnlNow && bridgeOpen[mk]) restartClass(pnlNow, "opening");
      var again = document.querySelector('[data-more="' + mk + '"]'); if (again) { restartClass(again, "turn"); again.focus(); }
    }
    else if (b.dataset.act === "review") go("review", defaultReviewWeek());
    else if (b.dataset.rweek) go("review", parseYmd(b.dataset.rweek));
    else if (b.dataset.act === "patterns") findPatterns();
    else if (b.dataset.lrange) { lsSet(LS_LEDGERRANGE, +b.dataset.lrange); render(true); }
    else if (b.dataset.lcat) { state.ledgerCat = state.ledgerCat === b.dataset.lcat ? null : b.dataset.lcat; render(true); }
    else if (b.dataset.qmove) queueMove(+b.dataset.qi, +b.dataset.qmove);
    else if (b.dataset.qprice) queuePriceOrder();
    else if (b.dataset.qbought) { state.queueConfirm = b.dataset.qbought; render(true); }
    else if (b.dataset.qno) { state.queueConfirm = null; render(true); }
    else if (b.dataset.qyes) {
      var qname = (state.ledger.queue.items.filter(function (x) { return x.id === b.dataset.qyes; })[0] || {}).title || "Item";
      queueSend({ action: "queuebought", id: b.dataset.qyes, day: ymd(new Date()) }, qname + " marked bought. Log it in YNAB as usual.");
    }
    else if (b.dataset.qundo) queueSend({ action: "queuebought", id: b.dataset.qundo, day: null }, "Back in the queue.");
    else if (b.dataset.sxtab) sess.tab(b.dataset.sxtab);
    else if (b.dataset.sx) sess.click(b);
    else if (b.dataset.lpin) logPress(b.dataset.lpin);
    else if (b.dataset.lday) { if (lg.find) lg.find.view = false; if (lg.ai) lg.ai.view = false; logPick(b.dataset.lday); }
    else if (b.dataset.lascope) { lg.ai.scope = logAiScope(b.dataset.lascope); lg.ai.preview = null; lg.ai.msgs = []; lg.ai.err = null; if ($("laQ")) lg.ai.q = $("laQ").value; render(true); }
    else if (b.dataset.lapreset) { var pr = LOG_AI_PRESETS.filter(function (x) { return x[0] === b.dataset.lapreset; })[0]; lg.ai.preset = pr[0]; lg.ai.q = pr[2]; lg.ai.preview = null; render(true); }
    else if (b.dataset.lasave) logAiSave(+b.dataset.lasave);
    else if (b.dataset.lains) logAiInsight(b.dataset.lains);
    else if (b.dataset.laday) { lg.ai.view = false; logPick(b.dataset.laday); var pg1 = document.querySelector(".cl-page"); if (pg1 && pg1.getBoundingClientRect().top < 0) pg1.scrollIntoView({ block: "start" }); }
    else if (b.dataset.lfound) { lg.find.view = false; logPick(b.dataset.lfound); var pg0 = document.querySelector(".cl-page"); if (pg0 && pg0.getBoundingClientRect().top < 0) pg0.scrollIntoView({ block: "start" }); }
    else if (b.dataset.lyear) { lg.pickYear = +b.dataset.lyear; render(true); }
    else if (b.dataset.ljump) { var jp = b.dataset.ljump.split("-"); lg.month = new Date(+jp[0], +jp[1] - 1, 1); lg.pick = false; lg.pickYear = null; render(true); enterScreen(); }
    else if (b.dataset.lmon) { lg.month = new Date(lg.month.getFullYear(), lg.month.getMonth() + +b.dataset.lmon, 1); render(true); enterScreen(); }
    else if (b.dataset.lact) {
      var la = b.dataset.lact;
      if (la === "lock") { lockLog(); render(false); }
      else if (la === "pick") { lg.pick = !lg.pick; lg.pickYear = null; render(true); }
      else if (la === "today") { lg.month = som(new Date()); logPick(ymd(new Date())); }
      else if (la === "save") { if (lg.timer) { clearTimeout(lg.timer); lg.timer = null; } if (logDrafts[lg.day]) { lg.manual = true; logSave(lg.pin); } else { logSavedFx(true); toast("Already saved"); } }
      else if (la === "bearings") logInsertBearings();
      else if (la === "retry") { delete lg.err[lg.day]; loadLogDay(lg.day); render(true); }
      else if (la === "import") { lg.imp = { stage: "paste", entries: [], notes: [], have: {}, created: 0, fails: 0, retryAt: 0, err: null }; render(true); }
      else if (la === "impcheck") logImportCheck();
      else if (la === "imprun") logImportRun();
      else if (la === "impcancel") { lg.imp = null; loadLogDay(lg.day); render(true); }
      else if (la === "find") logFind();
      else if (la === "aiopen") logAiOpen("month");
      else if (la === "aisearch") logAiOpen("search");
      else if (la === "aiclose") { lg.ai = null; render(true); }
      else if (la === "aipreview") logAiPreview();
      else if (la === "aisend") logAiSend(false);
      else if (la === "aifollow") logAiSend(true);
      else if (la === "ainew") { var ka = lg.ai; lg.ai.msgs = []; lg.ai.preview = null; lg.ai.q = ""; lg.ai.preset = null; lg.ai.err = null; render(true); }
      else if (la === "aideep") { lg.ai.deep = !lg.ai.deep; if ($("laQ")) lg.ai.q = $("laQ").value; render(true); }
      else if (la === "aiinsights") logAiInsights();
      else if (la === "aiopenback") { lg.ai.open = null; render(true); }
      else if (la === "aiback") { lg.ai.view = true; render(true); }
      else if (la === "findwhole") { lg.whole = !lg.whole; if (lg.find && lg.find.q) { $("clFind").value = lg.find.q; logFind(); } else render(true); }
      else if (la === "findclose") { lg.find = null; render(true); }
      else if (la === "findback") { lg.find.view = true; render(true); var cur = document.querySelector(".cl-hit.cur"); if (cur) cur.scrollIntoView({ block: "center" }); }
      else if (la === "findstep") { var hi = logHitAt(lg.day) + +b.dataset.dir, hl = logHits(); if (hl[hi]) logPick(hl[hi].date); }
    }
    else if (b.dataset.standby !== undefined) { lsSet(LS_STANDBY, +b.dataset.standby); if (+b.dataset.standby) holdAwake(); else letSleep(); noteTouch(); render(true); }
    else if (b.dataset.act === "standbynow") enterStandby();
    else if ((b.dataset.elf || /^err(all|clear|copy)$/.test(b.dataset.act || "")) && errClick(b)) { /* the error log (2.62) */ }
    else if (b.dataset.logai) { if (b.dataset.logai === "1") lsSet(LS_LOGAI, true); else lsDel(LS_LOGAI); render(true); }
    else if (b.dataset.aifin) { if (b.dataset.aifin === "1") lsSet(LS_AIFIN, true); else lsDel(LS_AIFIN); askReshare(); render(true); }
    else if (b.dataset.act === "savereview") submitReview();
    else if (b.dataset.act === "writesummary") { if (canLogAsk()) openSummaryAuth(); else writeSummary(); }
    else if (b.dataset.act === "balsave") balSave();
    else if (b.dataset.act === "brksave") { setBreaks($("brkIn").value.split("\n")); toast(breakList.length ? "Breaks: " + breakList.join(", ") : "No breaks"); render(true); }
    else if (b.dataset.act === "ignsave") {
      setIgnore($("ignIn").value.split("\n"));
      toast(ignoreList.length ? ignoreList.length + (ignoreList.length === 1 ? " title ignored" : " titles ignored") + " · " + ignoredCount() + " events left out" : "Nothing ignored");
      render(true);
    }
    else if (b.dataset.day) go("today", parseYmd(b.dataset.day));
    else if (b.dataset.toggle) toggleArea(b.dataset.toggle);
    else if (b.dataset.act === "refresh") refreshNow();
    else if (b.dataset.act === "ledgerrefresh") ledgerRefresh();
    else if (b.dataset.act === "flush") flushQueue(true);
    else if (b.dataset.qretry) retryCapture(b.dataset.qretry);
    else if (b.dataset.qdiscard) discardCapture(b.dataset.qdiscard);
    else if (b.dataset.act === "setup") go("today");
    else if (b.dataset.act === "disconnect") {
      if (Date.now() - state.disarmAt < 4000) {
        state.conn = null;
        state.ranges = {};
        state.calendars = [];
        state.caps = [];
        lsDel(LS_CONN); lsDel(LS_CACHE); lsDel(LS_SYNC);   /* unsent captures stay queued for the next link */
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
  $("content").addEventListener("mouseover", function (e) { var h = e.target.closest && e.target.closest(".hit"); if (h) showTip(h); });
  $("content").addEventListener("mouseout", function (e) { if (e.target.closest && e.target.closest(".hit")) hideTip(); });
  $("content").addEventListener("submit", function (e) {
    if (e.target.id === "connForm") { e.preventDefault(); submitConnect(); }
    else if (e.target.id === "qForm") { e.preventDefault(); queueAddSubmit(); }
  });
  $("content").addEventListener("input", function (e) {
    bulOnInput(e);   /* may rewrite "- " as "• " first; that edit fires its own input event */
    if (e.target.id === "logIntent") saveLog(e.target.value.trim());
    else if (/^clText-/.test(e.target.id) && logOpen()) { onLogInput(e.target.id.slice(7), e.target.value); growLog(e.target); }
    else if (e.target.dataset.rv && state.screen === "review") saveDraft(ymd(sow(state.anchor)), e.target.dataset.rv, e.target.value);
    else if (e.target.dataset.rvb !== undefined && state.screen === "review") saveDraft(ymd(sow(state.anchor)), "bearing", bearJoin(bearNames()));
  });
  $("content").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "logIntent") e.target.blur();
    if (e.key === "Enter" && e.target.id === "clFind") { e.preventDefault(); logFind(); }
  });
  $("detailScrim").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b && (bookSheetClick(b) || engSheetClick(b) || trSheetClick(b))) return;
    if (b && b.dataset.spin) { summaryPress(b.dataset.spin); return; }
    if (b && b.dataset.act === "sumplain") { lsum = null; closeDetail(); writeSummary(); return; }
    if (b && b.dataset.qretry) { closeDetail(); retryCapture(b.dataset.qretry); return; }
    if (b && b.dataset.qdiscard) { closeDetail(); discardCapture(b.dataset.qdiscard); return; }
    if (b && b.dataset.ignore) {
      setIgnore(ignoreList.concat([b.dataset.ignore]));
      closeDetail();
      render(true);
      toast("Ignored everywhere: \u201C" + b.dataset.ignore + "\u201D. Undo in SYSTEMS");
      return;
    }
    if (e.target === $("detailScrim") || e.target.id === "detailClose") closeDetail();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (state.launch && $("detailScrim").hidden) openLaunch(false); closeDetail(); closeCapture(); closePlan(); closeAsk(); closeComputer(); } });

  /* ---------- Update notice ---------- */
  var UPDATE_CHECK_MS = 10 * 60 * 1000, lastUpdateCheck = 0;
  function newer(a, b) {
    var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  }
  function checkForUpdate(force) {
    if (!force && Date.now() - lastUpdateCheck < UPDATE_CHECK_MS) return;
    lastUpdateCheck = Date.now();
    fetch("version.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.version && newer(j.version, VERSION)) { $("updateBtn").hidden = false; } })
      .catch(function () { /* offline: check again later */ });
  }
  /* UPDATE READY (2.43.2): fetch the new version, let it install completely, ask it to take over, and reload only once
     it controls the page, so no request is caught between two versions (the cause of a header over a black screen, or
     unstyled HTML, after tapping it). Fifteen seconds at most, then a plain reload. */
  $("updateBtn").addEventListener("click", function () {
    var b = $("updateBtn");
    b.disabled = true;
    b.textContent = "LOADING UPDATE…";
    var done = false, reload = function () { if (!done) { done = true; location.reload(); } };
    var sw = navigator.serviceWorker;
    if (!sw || !sw.controller) { reload(); return; }
    setTimeout(reload, 15000);
    sw.addEventListener("controllerchange", reload);
    var take = function (w) { w.postMessage("skipWaiting"); };
    var watch = function (w) {
      if (!w) return;
      if (w.state === "installed") { take(w); return; }
      w.addEventListener("statechange", function () { if (w.state === "installed") take(w); else if (w.state === "redundant") reload(); });
    };
    sw.getRegistration().then(function (reg) {
      if (!reg) { reload(); return; }
      if (reg.waiting) { take(reg.waiting); return; }
      if (reg.installing) { watch(reg.installing); return; }
      reg.addEventListener("updatefound", function () { watch(reg.installing); });
      var check = function (again) {   /* a check already running can answer "nothing new": ask once more */
        return reg.update().then(function () { if (reg.installing || reg.waiting) return; if (again) setTimeout(function () { check(false).catch(reload); }, 1500); else reload(); });
      };
      return check(true);
    }).catch(reload);
  });

  /* ---------- Clock + background refresh ---------- */
  function tick() {
    var today = sod(new Date()).getTime();
    if (today !== state.lastDay) {
      if (state.anchor.getTime() === state.lastDay) state.anchor = new Date(today);
      state.lastDay = today;
    }
    if (document.hidden) return;
    if ($("detailScrim").hidden && (state.screen === "bridge" || state.screen === "today" || state.screen === "week" || state.screen === "loom") && state.conn) render(true);
    if (state.screen === "bridge") loadWeather(false);
    if (Date.now() - state.lastAuto > AUTO_MS) { state.lastAuto = Date.now(); refresh(true); }
    flushQueue(false);
    checkForUpdate(false);
    briefMaybe();
    shipMaybe();
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); refresh(false); checkForUpdate(true); } });
  /* TimothyOS stays full screen: Safari's pinch zoom is ignored (double-tap zoom is off in the CSS). */
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("touchmove", function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  window.addEventListener("online", function () { refresh(true); flushQueue(true); flushHabits(); });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(function () { /* app still works without offline cache */ });
  }

  state.lastAuto = Date.now();
  render(false);
  refresh(false);
  flushQueue(false);
  setTimeout(function () { checkForUpdate(true); }, 3000);
  if (state.conn) maybeQ();
