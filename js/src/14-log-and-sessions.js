  /* ---------- Captain's Log ---------- */
  /* A plain journal: a calendar of days and a blank page, one Notion page per day
     (bridge 1.10). Opening LOG always asks for the 6-digit PIN. The PIN lives in the
     bridge (Script Property LOG_PIN) and is checked there; here it's held in memory
     only while the log is open. Entries are never stored on the iPad: leaving LOG,
     sending the app to the background, standby, or 10 minutes without a touch locks
     it and drops them. The only thing kept here is writing that hasn't reached Notion
     yet, removed as soon as it has. No reminders, no streaks, no counts. Never sent to Ask.
     Search (bridge 1.16) asks the bridge, which looks in each page's Search Text copy; results
     live only in memory and go when the log locks. Unlocking also tops up that copy for older
     entries, newest first, a batch at a time (logIndexStep). */
  var LS_LDRAFT = "tos.ldraft.v1";       /* Log: writing not yet saved to Notion, per day */
  var LOG_SAVE_MS = 5000;                /* save this long after you stop typing */
  var LOG_IDLE_MS = 10 * 60 * 1000;      /* lock after this long without a touch */
  var LOG_BATCH = 3;                     /* entries per import request (short requests fail less) */
  var lg = logFresh();
  var logDrafts = lsGet(LS_LDRAFT) || {};
  function logFresh() { return { pin: null, digits: "", word: null, msg: "", busy: false, dates: null, month: null, day: null, entries: {}, loading: {}, err: {}, timer: null, saving: false, again: false, saveErr: null, imp: null, manual: false, pick: false, pickYear: null, find: null, whole: true, idx: null, ai: null, sn: null }; }
  function canLog() { return state.caps.indexOf("log") > -1; }
  function canLogSearch() { return state.caps.indexOf("logsearch") > -1; }
  function canLogAsk() { return canLog() && state.caps.indexOf("logask") > -1 && !!lsGet(LS_LOGAI); }
  /* Bridge 1.17: the PIN can be a Starfleet-style authorization, a Greek code word then four
     digits ("Riker Alpha 6-9-3"). The panel shows the six words; the bridge knows which one. */
  var LOG_WORDS = [["ALPHA", "Α"], ["BETA", "Β"], ["GAMMA", "Γ"], ["DELTA", "Δ"], ["THETA", "Θ"], ["OMEGA", "Ω"]];
  var LOG_WORD_KEYS = { a: "ALPHA", b: "BETA", g: "GAMMA", d: "DELTA", t: "THETA", o: "OMEGA" };
  function logCodeMode() { return state.caps.indexOf("logcode") > -1; }
  function logNeed() { return logCodeMode() ? 4 : 6; }
  /* Reads go as GET (bridge 1.11): the key and PIN ride in the address, which survives Google's
     redirects; a POST body sometimes doesn't. An older bridge only takes POST, so fall back. */
  function logRead(params) {
    return api(params).catch(function (err) { if (err && err.code === "unknown_action") return apiPost(params); throw err; });
  }
  function logOpen() { return !!lg.pin; }
  function logDraftsSave() { lsSet(LS_LDRAFT, logDrafts); }
  /* The same block rules the bridge uses (logParas_ / logJoin_), so "unchanged" means the same thing
     on both sides: paragraphs a blank line apart, a "• " or "- " line is a list item, list items one
     per line (2.14). */
  function logNorm(t) {
    var out = "", prev = null;
    String(t == null ? "" : t).replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).forEach(function (chunk) {
      var run = [];
      var put = function (kind, text) { if (prev) out += kind === "b" && prev === "b" ? "\n" : "\n\n"; out += kind === "b" ? "• " + text : text; prev = kind; };
      var flush = function () { var p = run.join("\n").replace(/^\n+|\s+$/g, ""); if (p.length) put("p", p); run = []; };
      chunk.split("\n").forEach(function (line) {
        var m = line.match(/^[ \t]*[•\-][ \t]+(.*)$/);
        if (!m) { run.push(line); return; }
        flush();
        var tx = m[1].replace(/\s+$/, "");
        if (tx.length) put("b", tx);
      });
      flush();
    });
    return out;
  }
  function logText(d) { return logDrafts[d] ? logDrafts[d].text : lg.entries[d] ? lg.entries[d].text : ""; }

  function lockLog() {
    var pin = lg.pin;
    if (lg.timer) { clearTimeout(lg.timer); lg.timer = null; }
    if (pin && Object.keys(logDrafts).length) logSave(pin);   /* finish what was written, then forget the PIN */
    lg = logFresh();
    var f = document.activeElement;
    if (f && /^clText-/.test(f.id)) f.blur();
  }
  function logErrText(code, left, until) {
    var code2 = logCodeMode();
    return ({
      bad_pin: (code2 ? "Authorization not recognized." : "Not that one.") + (left ? " " + left + (left === 1 ? " try" : " tries") + " left before a lock." : ""),
      log_locked: until ? "Locked until " + hm(new Date(until)) + " after five wrong tries. Each lockout in a row lasts twice as long." : "Locked for 15 minutes after five wrong tries.",
      log_pin_not_set: "No PIN set yet. In Apps Script: Project Settings → Script Properties → add LOG_PIN: a code word and four digits (like OMEGA-0000) or six digits. Steps are in the README under Captain's Log.",
      notion_not_shared: "The Captain's Log database isn't connected. In Notion: Captain's Log → ••• → Connections → add TimothyOS bridge.",
      unknown_action: "The bridge is out of date. Deploy the latest Code.gs (1.10)."
    })[code] || null;
  }
  function logPress(k) {
    if (lg.busy) return;
    var coded = logCodeMode();
    lg.msg = "";
    if (k === "del") { if (lg.digits) lg.digits = lg.digits.slice(0, -1); else lg.word = null; }
    else if (/^[A-Z]+$/.test(k)) { if (coded && !lg.word) lg.word = k; }   /* the code word comes first */
    else if ((!coded || lg.word) && lg.digits.length < logNeed()) lg.digits += k;
    render(true);
    if (lg.digits.length === logNeed()) logUnlock(coded ? lg.word + "-" + lg.digits : lg.digits);
  }
  function logUnlock(pin) {
    lg.busy = true; render(true);
    logRead({ action: "logunlock", pin: pin }).then(function (j) {
      if (state.screen !== "log") return;
      lg.pin = pin; lg.digits = ""; lg.word = null; lg.dates = {};
      (j.dates || []).forEach(function (d) { lg.dates[d] = true; });
      var t = ymd(new Date());
      lg.day = t; lg.month = som(new Date());
      noteTouch();
      loadLogDay(t);
      if (Object.keys(logDrafts).length) logSave(pin);   /* anything left from last time */
      if (canLogSearch()) logIndexStart(pin);
    }).catch(function (err) {
      lg.digits = ""; lg.word = null;
      lg.msg = logErrText(err.code, err && err.left, err && err.until) || describe(err);
    }).then(function () {
      lg.busy = false;
      if (state.screen !== "log") return;
      render(true); enterScreen();
      if (logOpen() && lg.after) {   /* COMPUTER asked for search or Log Ask: go there once unlocked */
        var after = lg.after; lg.after = null;
        if (after === "find") { var f = $("clFind"); if (f) { f.scrollIntoView({ block: "center" }); f.focus(); } }
        else if (after === "ask") { var ab = document.querySelector('[data-lact="aiopen"]'); if (ab) ab.click(); }
        else if (after === "astro") asFromLog();
      }
    });
  }
  function loadLogDay(d) {
    if (!lg.pin || d in lg.entries || lg.loading[d]) return;
    if (!lg.dates[d]) { lg.entries[d] = null; return; }
    var pin = lg.pin;
    lg.loading[d] = true; delete lg.err[d];
    logRead({ action: "logday", pin: pin, date: d }).then(function (j) {
      if (lg.pin !== pin) return;
      lg.entries[d] = j.entry ? { text: j.entry.text || "", url: j.entry.url || "", other: !!j.entry.other, saved: j.entry.saved } : null;
    }).catch(function (err) {
      if (lg.pin === pin) lg.err[d] = logErrText(err.code) || describe(err);
    }).then(function () {
      if (lg.pin !== pin) return;
      delete lg.loading[d];
      if (state.screen === "log" && lg.day === d) render(true);
    });
  }
  /* ---- search ---- */
  function logFind() {
    var f = $("clFind"), q = f ? f.value.replace(/\s+/g, " ").trim() : "";
    if (q.length < 2) { toast("Type at least two letters to search."); return; }
    if (f) f.blur();
    var pin = lg.pin, whole = lg.whole;
    lg.imp = null;
    if (lg.ai) lg.ai.view = false;   /* the results show; ASK CLAUDE can then take them */
    lg.find = { q: q, whole: whole, busy: true, res: null, err: null, view: true };
    render(true);
    logRead({ action: "logsearch", pin: pin, q: q, whole: whole ? "1" : "0" }).then(function (j) {
      if (lg.pin !== pin || !lg.find || lg.find.q !== q || lg.find.whole !== whole) return;
      lg.find.res = { entries: j.entries || [], mentions: j.mentions || 0, left: j.left || 0, more: !!j.more };
    }).catch(function (err) {
      if (lg.pin !== pin || !lg.find || lg.find.q !== q) return;
      lg.find.err = err && err.code === "log_search_not_ready" ? "Search needs one run of setup. Steps are in the README under Captain's Log." : logErrText(err && err.code) || describe(err);
    }).then(function () {
      if (lg.pin !== pin || !lg.find || lg.find.q !== q) return;
      lg.find.busy = false;
      if (state.screen === "log") { render(true); var pg = document.querySelector(".cl-page"); if (pg && innerWidth <= 860) pg.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" }); }
    });
  }
  function logHits() { return lg.find && lg.find.res ? lg.find.res.entries : []; }
  function logHitAt(d) { var h = logHits(); for (var i = 0; i < h.length; i++) if (h[i].date === d) return i; return -1; }
  /* A snippet comes as [text, match, text, match, ..., text]: the matches are marked. */
  function snipHtml(sn) { return sn.map(function (x, i) { return i % 2 ? "<mark>" + esc(x) + "</mark>" : esc(x); }).join(""); }
  function logFindLabel(d) { var dt = parseYmd(d); return DOW[dt.getDay()] + " " + p2(dt.getDate()) + " " + MON[dt.getMonth()] + " " + dt.getFullYear(); }
  function logFindHtml() {
    var f = lg.find, r = f.res, quoted = "“" + esc(f.q) + "”";
    var meta = f.busy ? "SEARCHING…" : r ? r.entries.length + (r.entries.length === 1 ? " ENTRY" : " ENTRIES") + " · " + r.mentions + (r.mentions === 1 ? " MENTION" : " MENTIONS") : "";
    var html = phead("SEARCH", meta, "chrome-c") + '<div class="cl-fq"><b>' + quoted + "</b>" + (f.whole ? " as a whole word" : " anywhere, part words too") + ", any capitals</div>";
    if (f.busy) return html + '<div class="empty">Looking through the log…</div>';
    if (f.err) return html + '<div class="errtxt cl-note">' + esc(f.err) + '</div><div class="btnrow cl-row"><button type="button" class="btn ghost" data-lact="findclose">BACK TO THE PAGE</button></div>';
    if (r.left) html += '<div class="cl-note muted">' + r.left + (r.left >= 100 ? "+" : "") + " older " + (r.left === 1 ? "entry isn't" : "entries aren't") + " searchable yet. They're being added while the log is open.</div>";
    if (!r.entries.length) {
      html += '<div class="empty">No entries ' + (f.whole ? "use the word " : "contain ") + quoted + "." + (f.whole ? " EXACT WORD is on: turn it off to include longer words that start or end with it." : "") + "</div>";
    } else {
      var year = null, counts = {};
      r.entries.forEach(function (e) { var y = e.date.slice(0, 4); counts[y] = (counts[y] || 0) + 1; });
      html += '<div class="cl-hits">' + r.entries.map(function (e) {
        var y = e.date.slice(0, 4), head = "";
        if (y !== year) { year = y; head = '<div class="ov-sub cl-hy">' + y + " · " + counts[y] + (counts[y] === 1 ? " ENTRY" : " ENTRIES") + "</div>"; }
        return head + '<button type="button" class="cl-hit' + (e.date === lg.day ? " cur" : "") + '" data-lfound="' + e.date + '"><span class="cl-hitd">' + logFindLabel(e.date) + '</span><span class="cl-hitn">' + (e.count > 1 ? e.count + "×" : "") + "</span>" +
          '<span class="cl-hits-t">' + e.snips.map(function (sn) { return "<span>" + snipHtml(sn) + "</span>"; }).join("") + "</span></button>";
      }).join("") + "</div>";
      if (r.more) html += '<div class="cl-note muted">Showing the newest 2,000. Narrow the search to see older ones.</div>';
    }
    return html + '<div class="btnrow cl-row">' + (canLogAsk() && r.entries.length ? '<button type="button" class="btn" data-lact="aisearch"' + (r.entries.length > 62 ? " disabled" : "") + ">ASK ABOUT THESE " + r.entries.length + "</button>" : "") +
      '<button type="button" class="btn ghost" data-lact="findclose">CLOSE SEARCH</button></div>' + (canLogAsk() && r.entries.length > 62 ? '<div class="cl-note muted">Claude reads 62 entries at most: narrow the search to ask about these.</div>' : "");
  }
  /* Above an entry opened from the results: back to them, newer and older matches, and where the words are. */
  function logFindBar(d) {
    var i = logHitAt(d), h = logHits();
    if (i < 0) return "";
    return '<div class="cl-findbar"><button type="button" class="chip" data-lact="findback"><span class="tri l"></span>RESULTS</button>' +
      '<span class="cl-fbt">“' + esc(lg.find.q) + "” · " + (i + 1) + " OF " + h.length + "</span>" +
      '<button type="button" class="chip" data-lact="findstep" data-dir="-1"' + (i === 0 ? " disabled" : "") + ">NEWER</button>" +
      '<button type="button" class="chip" data-lact="findstep" data-dir="1"' + (i === h.length - 1 ? " disabled" : "") + ">OLDER</button>" +
      '<div class="cl-fbs">' + h[i].snips.map(function (sn) { return "<span>" + snipHtml(sn) + "</span>"; }).join("") + "</div></div>";
  }
  function logIdxHtml() {
    var x = lg.idx, total = Object.keys(lg.dates || {}).length, idx = "";
    if (x && x.left > 0 && total) {
      var ready = Math.max(0, total - x.left), pct = Math.round(ready / total * 100);
      idx = '<div class="cl-idx" role="status"><div class="cl-idxbar"><span style="width:' + pct + '%"></span></div><small class="muted">' +
        (x.err ? "Adding older entries paused: " + esc(x.err) + " It carries on next time you open the log." : "Making older entries searchable: " + ready.toLocaleString() + " of " + total.toLocaleString() + ". Carries on while the log is open.") + "</small></div>";
    } else if (x && x.did && !x.left) idx = '<div class="cl-idx"><small class="muted">Every entry is searchable now.</small></div>';
    return idx;
  }
  /* Progress is painted in place, so a field you're typing in keeps the keyboard. */
  function logIdxPaint() { var el = $("clIdx"); if (el && state.screen === "log") el.innerHTML = logIdxHtml(); }
  function logFindBox() {
    if (!canLogSearch()) return "";
    /* one bar across the top of LOG (2.15.3) */
    return '<section class="cl-find"><div class="cl-findrow"><label class="cl-findlab" for="clFind">SEARCH THE LOG</label>' +
      '<input type="search" id="clFind" value="' + esc(lg.find ? lg.find.q : "") + '" placeholder="A word or phrase" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn" data-lact="find">FIND</button><button type="button" class="chip sm" data-lact="findwhole" aria-pressed="' + lg.whole + '">EXACT WORD</button></div>' +
      '<div id="clIdx">' + logIdxHtml() + "</div></section>";
  }
  /* Fill Search Text for older entries a batch at a time while the log is open. */
  function logIndexStart(pin) {
    apiPost({ action: "logindex", pin: pin }).then(function (j) {
      if (lg.pin !== pin) return;
      lg.idx = { left: j.left || 0, did: 0, err: null, fails: 0 };
      if (lg.idx.left > 0) { logIdxPaint(); logIndexStep(pin); }
    }).catch(function () { /* searching still works on what's there */ });
  }
  function logIndexStep(pin) {
    if (lg.pin !== pin || !lg.idx) return;
    apiPost({ action: "logindex", pin: pin, run: 1 }, 60000).then(function (j) {
      if (lg.pin !== pin || !lg.idx) return;
      lg.idx.did += j.did || 0; lg.idx.left = j.left || 0; lg.idx.err = null; lg.idx.fails = 0;
      logIdxPaint();
      if (lg.idx.left > 0) setTimeout(function () { logIndexStep(pin); }, j.busy ? 8000 : 300);
    }).catch(function (err) {
      if (lg.pin !== pin || !lg.idx) return;
      lg.idx.fails++;
      if (lg.idx.fails >= 3) { lg.idx.err = describe(err); logIdxPaint(); return; }
      setTimeout(function () { logIndexStep(pin); }, 20000);
    });
  }

  /* ---- Log Ask (2.15, bridge 1.20): Claude reads only the entries you pick ---- */
  /* A month, that month and the one before, or the entries a search found (62 at most). PREVIEW
     shows the count, tokens and cost before anything is sent; follow-ups reuse the same entries.
     Everything lives in lg.ai, so it goes when the log locks. SAVE keeps an answer in Notion. */
  var LOG_AI_PRESETS = [
    ["moments", "KEY MOMENTS", "What were the key moments in these entries? List the 5 to 8 that matter most, each with its date and one line on why it mattered."],
    ["themes", "THEMES", "What themes keep coming up across these entries? Name each theme, roughly how often it appears, and two dated examples."],
    ["lift", "LIFTED · DRAINED", "What lifted me and what drained me in these entries? Two short lists, each item with a date."],
    ["phrase", "ONE PHRASE", "If this stretch had one phrase or title, what would it be? Give the phrase, then two or three sentences on why, citing dates."],
    ["changed", "WHAT CHANGED", "How did things change from the start of this period to the end? Note what grew, what faded and what stayed the same, with dates."]
  ];
  var LOG_AI_WARN = 25000;
  function logAiScope(kind) {
    var mo = lg.month || som(new Date()), today = ymd(new Date()), end = function (d) { var e = ymd(addDays(new Date(d.getFullYear(), d.getMonth() + 1, 1), -1)); return e > today ? today : e; };
    if (kind === "search" && lg.find && lg.find.res) {
      var ds = lg.find.res.entries.map(function (e) { return e.date; });
      return { kind: "search", dates: ds, label: "“" + lg.find.q + "” · " + ds.length + (ds.length === 1 ? " ENTRY" : " ENTRIES"), title: "“" + lg.find.q + "”" };
    }
    if (kind === "two") {
      var prev = new Date(mo.getFullYear(), mo.getMonth() - 1, 1);
      return { kind: "two", from: ymd(prev), to: end(mo), label: MON[prev.getMonth()] + " + " + MON[mo.getMonth()] + " " + mo.getFullYear(), title: tcase(MONL[prev.getMonth()]) + " and " + tcase(MONL[mo.getMonth()]) + " " + mo.getFullYear() };
    }
    return { kind: "month", from: ymd(mo), to: end(mo), label: MONL[mo.getMonth()] + " " + mo.getFullYear(), title: tcase(MONL[mo.getMonth()]) + " " + mo.getFullYear() };
  }
  function tcase(w) { return w.charAt(0) + w.slice(1).toLowerCase(); }
  function logAiWire(sc) { return sc.dates ? { dates: sc.dates } : { from: sc.from, to: sc.to }; }
  function logAiOpen(kind) {
    lg.imp = null; if (lg.find) lg.find.view = false;
    lg.ai = { scope: logAiScope(kind), q: "", preset: null, deep: false, preview: null, busy: false, err: null, msgs: [], view: true, insights: null, open: null };
    render(true); var pg = document.querySelector(".cl-page"); if (pg && innerWidth <= 860) pg.scrollIntoView({ block: "start" });
  }
  function logAiErr(err) {
    var c = err && err.code;
    if (c === "log_ask_too_big") return "Too much for one question" + (err.detail ? "" : "") + ": the limit is 62 entries, about 60K tokens and two months. Narrow it with a shorter period or a tighter search.";
    if (c === "log_ask_empty") return "No entries in this period.";
    return logErrText(c) || describeAi(err);
  }
  function logAiCall(params, timeout) { params.pin = lg.pin; return apiPost(params, timeout || 150000); }
  function logAiPreview() {
    var a = lg.ai, q = ($("laQ") || {}).value || a.q;
    a.q = q.trim();
    if (!a.q) { toast("Pick a question or type your own."); return; }
    var pin = lg.pin; a.busy = "preview"; a.err = null; a.preview = null; render(true);
    logAiCall({ action: "logask", preview: true, scope: logAiWire(a.scope) }, 60000).then(function (j) {
      if (lg.pin !== pin || lg.ai !== a) return; a.preview = j.preview;
    }).catch(function (err) { if (lg.ai === a) a.err = logAiErr(err); }).then(function () { if (lg.ai === a) { a.busy = false; render(true); } });
  }
  function logAiSend(follow) {
    var a = lg.ai, pin = lg.pin, text;
    if (follow) { text = (($("laF") || {}).value || "").trim(); if (!text) return; }
    else text = a.q;
    a.msgs.push({ role: "user", text: text });
    a.busy = "send"; a.err = null; render(true);
    var turns = a.msgs.map(function (m) { return { role: m.role, text: m.text }; });
    logAiCall({ action: "logask", mode: a.deep ? "deep" : "fast", scope: logAiWire(a.scope), messages: turns }).then(function (j) {
      if (lg.pin !== pin || lg.ai !== a) return;
      a.msgs.push({ role: "assistant", text: j.reply, model: j.model, cost: j.cost, q: text });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
    }).catch(function (err) {
      if (lg.ai !== a) return;
      a.msgs.pop(); if (follow && $("laF")) $("laF").value = text;
      a.err = logAiErr(err);
    }).then(function () { if (lg.ai === a) { a.busy = false; render(true); var last = document.querySelector(".la-msg:last-of-type"); if (last) last.scrollIntoView({ block: "nearest" }); } });
  }
  function logAiSave(i) {
    var a = lg.ai, m = a.msgs[i]; if (!m || m.saved || m.saving) return;
    var preset = LOG_AI_PRESETS.filter(function (p) { return p[0] === a.preset; })[0];
    var title = "Insight · " + a.scope.title + " · " + (i === 1 && preset ? preset[1].replace(" · ", " and ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) : m.q.slice(0, 60));
    var sc = a.scope, scopeText = sc.dates ? sc.dates.length + " entries found for " + sc.title : sc.from + " to " + sc.to;
    m.saving = true; render(true);
    logAiCall({ action: "logasksave", insight: { title: title, question: m.q, scope: scopeText, text: m.text } }, 60000).then(function () {
      m.saved = true; toast("Saved to the Captain's Log in Notion"); if (a.insights) a.insights = null;
    }).catch(function (err) { toast("Not saved: " + logAiErr(err)); }).then(function () { m.saving = false; if (lg.ai === a) render(true); });
  }
  function logAiInsights() {
    var a = lg.ai; a.busy = "insights"; render(true);
    logAiCall({ action: "loginsights" }, 60000).then(function (j) { if (lg.ai === a) a.insights = j.insights || []; })
      .catch(function (err) { if (lg.ai === a) a.err = logAiErr(err); }).then(function () { if (lg.ai === a) { a.busy = false; render(true); } });
  }
  function logAiInsight(id) {
    var a = lg.ai; a.busy = "insight"; render(true);
    logAiCall({ action: "loginsight", id: id }, 60000).then(function (j) { if (lg.ai === a) a.open = j.insight; })
      .catch(function (err) { if (lg.ai === a) a.err = logAiErr(err); }).then(function () { if (lg.ai === a) { a.busy = false; render(true); } });
  }
  /* Claude cites dates as [yyyy-mm-dd]: those become buttons that open the entry. */
  function logAiText(t) {
    return esc(t).split("\n").map(function (line) {
      return line.replace(/^- /, "• ").replace(/\[(\d{4}-\d{2}-\d{2})\]/g, function (m, d) { return '<button type="button" class="la-date" data-laday="' + d + '">' + logFindLabel(d) + "</button>"; });
    }).join("<br>");
  }
  function logAiHtml() {
    var a = lg.ai, sc = a.scope, busy = !!a.busy, html = phead("ASK THE LOG", sc.label, "chrome-c");
    if (a.open) {
      return html + '<div class="la-saved"><b>' + esc(a.open.title) + '</b><div class="la-text">' + logAiText(a.open.text) + "</div></div>" +
        '<div class="btnrow cl-row"><button type="button" class="btn ghost" data-lact="aiopenback">BACK</button>' + (a.open.url ? '<a class="btn ghost" href="' + esc(a.open.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
    }
    var srch = lg.find && lg.find.res && lg.find.res.entries.length ? lg.find.res.entries.length : 0;
    html += '<div class="btnrow la-scope" role="group" aria-label="Which entries">' +
      '<button type="button" class="chip" data-lascope="month" aria-pressed="' + (sc.kind === "month") + '"' + (busy ? " disabled" : "") + ">" + MON[(lg.month || new Date()).getMonth()] + " " + (lg.month || new Date()).getFullYear() + "</button>" +
      '<button type="button" class="chip" data-lascope="two" aria-pressed="' + (sc.kind === "two") + '"' + (busy ? " disabled" : "") + ">WITH THE MONTH BEFORE</button>" +
      (srch ? '<button type="button" class="chip" data-lascope="search" aria-pressed="' + (sc.kind === "search") + '"' + (busy || srch > 62 ? " disabled" : "") + ">SEARCH · " + srch + (srch > 62 ? " (62 AT MOST)" : "") + "</button>" : "") + "</div>";
    if (!a.msgs.length) {
      html += '<div class="ov-sub">ASK</div><div class="chips la-presets">' + LOG_AI_PRESETS.map(function (p) {
        return '<button type="button" class="chip" data-lapreset="' + p[0] + '" aria-pressed="' + (a.preset === p[0]) + '"' + (busy ? " disabled" : "") + ">" + p[1] + "</button>";
      }).join("") + "</div>" +
        '<textarea id="laQ" rows="3" maxlength="1500" placeholder="Or ask your own question about these entries">' + esc(a.q) + "</textarea>" +
        '<div class="btnrow cl-row"><button type="button" class="chip" data-lact="aideep" aria-pressed="' + a.deep + '">THINK HARDER</button>' +
        '<button type="button" class="btn' + (a.busy === "preview" ? " busy" : "") + '" data-lact="aipreview"' + (busy ? " disabled" : "") + ">" + (a.busy === "preview" ? '<span class="spin" aria-hidden="true"></span>COUNTING…' : "PREVIEW") + "</button></div>";
      var pv = a.preview;
      if (pv) {
        var big = pv.tokens > LOG_AI_WARN, cost = a.deep ? pv.usd.deep : pv.usd.fast;
        html += '<div class="la-pv' + (big ? " big" : "") + '" role="status"><b>' + pv.count + (pv.count === 1 ? " ENTRY" : " ENTRIES") + (pv.from ? " · " + logFindLabel(pv.from) + (pv.to !== pv.from ? " TO " + logFindLabel(pv.to) : "") : "") + "</b>" +
          "<span>About " + Math.round(pv.tokens / 100) / 10 + "K tokens · about " + money(cost) + " with " + (a.deep ? "Opus (THINK HARDER)" : "Sonnet") + (a.deep ? "" : " · THINK HARDER about " + money(pv.usd.deep)) + "</span>" +
          (big ? '<span class="warntxt">This is a larger read. Fine to send; a shorter period or a search costs less.</span>' : "") +
          '<span class="muted">These entries go to Anthropic for this question and its follow-ups only. Nothing is kept unless you tap SAVE.</span>' +
          '<div class="btnrow"><button type="button" class="btn' + (a.busy === "send" ? " busy" : "") + '" data-lact="aisend"' + (busy ? " disabled" : "") + ">" + (a.busy === "send" ? '<span class="spin" aria-hidden="true"></span>READING…' : "SEND") + "</button></div></div>";
      }
    } else {
      html += '<div class="la-chat">' + a.msgs.map(function (m, i) {
        if (m.role === "user") return '<div class="la-msg q">' + esc(m.text) + "</div>";
        return '<div class="la-msg a"><div class="la-text">' + logAiText(m.text) + '</div><div class="la-meta"><span>' + modelName(m.model) + " · " + money(m.cost || 0) + "</span>" +
          '<button type="button" class="chip" data-lasave="' + i + '"' + (m.saved || m.saving ? " disabled" : "") + ">" + (m.saved ? "SAVED ✓" : m.saving ? "SAVING…" : "SAVE TO NOTION") + "</button></div></div>";
      }).join("") + (a.busy === "send" ? '<div class="la-msg a"><span class="spin" aria-hidden="true"></span> Reading the entries…</div>' : "") + "</div>" +
        '<label class="ov-sub" for="laF">FOLLOW UP</label><textarea id="laF" rows="2" maxlength="1500" placeholder="Ask more about the same entries (usually under 1¢)"></textarea>' +
        '<div class="btnrow cl-row"><button type="button" class="chip" data-lact="aideep" aria-pressed="' + a.deep + '">THINK HARDER</button><button type="button" class="btn" data-lact="aifollow"' + (busy ? " disabled" : "") + ">ASK</button>" +
        '<button type="button" class="btn ghost" data-lact="ainew"' + (busy ? " disabled" : "") + ">NEW QUESTION</button></div>";
    }
    if (a.err) html += '<div class="errtxt cl-note" role="alert">' + esc(a.err) + "</div>";
    html += '<div class="ov-sub la-ins-h">SAVED INSIGHTS</div>';
    if (a.insights === null) html += '<div class="btnrow"><button type="button" class="chip" data-lact="aiinsights"' + (busy ? " disabled" : "") + ">" + (a.busy === "insights" ? "LOADING…" : "SHOW SAVED") + "</button></div>";
    else html += a.insights.length ? '<div class="la-ins">' + a.insights.map(function (x) {
      return '<button type="button" class="la-in" data-lains="' + esc(x.id) + '"><b>' + esc(x.title) + "</b><small>" + (x.created ? esc(stamp(Date.parse(x.created))) : "") + "</small></button>";
    }).join("") + "</div>" : '<div class="empty">Nothing saved yet. SAVE TO NOTION under an answer keeps it here.</div>';
    return html + '<div class="btnrow cl-row"><button type="button" class="btn ghost" data-lact="aiclose">CLOSE</button></div>';
  }
  /* REVIEW's WRITE SUMMARY with this week's entries: the authorization code first, every time. */
  var lsum = null;
  function openSummaryAuth() {
    lsum = { word: null, digits: "", busy: false, msg: "" };
    $("detailSheet").className = "sheet lsum-sheet"; $("detailSheet").style.setProperty("--c", "var(--chrome-c)");
    drawSummaryAuth(); showSheet("detailScrim");
  }
  function drawSummaryAuth() {
    if (!lsum) return;
    var coded = logCodeMode(), need = logNeed(), dots = coded ? '<i class="w' + (lsum.word ? " on" : "") + '"></i>' : "";
    for (var i = 0; i < need; i++) dots += '<i class="' + (i < lsum.digits.length ? "on" : "") + '"></i>';
    var noDigits = lsum.busy || (coded && !lsum.word), keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
    $("detailSheet").innerHTML = '<div class="sbar"><span>WRITE SUMMARY</span><span>WITH THIS WEEK\'S LOG</span></div><div class="sbody cl-lock coded">' +
      '<p class="muted lsum-p">Your authorization code lets the summary read this week\'s Captain\'s Log entries. They go to Claude for this summary only.</p>' +
      '<div class="cl-dots">' + dots + '</div><div class="cl-msg" role="status">' + (lsum.busy ? "WRITING THE SUMMARY…" : lsum.msg ? esc(lsum.msg) : coded ? (lsum.word ? "AUTHORIZATION: FOUR DIGITS" : "STATE AUTHORIZATION: CODE WORD") : "ENTER YOUR PIN") + "</div>" +
      (coded ? '<div class="cl-words">' + LOG_WORDS.map(function (w) { return '<button type="button" class="cl-word" data-spin="' + w[0] + '"' + (lsum.busy || lsum.word ? " disabled" : "") + ' aria-label="' + w[0] + '"><b>' + w[1] + "</b><span>" + w[0] + "</span></button>"; }).join("") + "</div>" : "") +
      '<div class="cl-pad">' + keys.map(function (k) {
        var off = k === "del" ? lsum.busy || (!lsum.digits && !lsum.word) : noDigits;
        return k === "" ? "<span></span>" : '<button type="button" class="cl-key' + (k === "del" ? " del" : "") + '" data-spin="' + k + '"' + (off ? " disabled" : "") + ' aria-label="' + (k === "del" ? "Delete" : k) + '">' + (k === "del" ? "⌫" : k) + "</button>";
      }).join("") + '</div></div><div class="sfoot btnrow"><button type="button" class="btn ghost" id="detailClose">CANCEL</button><button type="button" class="btn ghost" data-act="sumplain"' + (lsum.busy ? " disabled" : "") + ">WITHOUT THE LOG</button></div>";
  }
  function summaryPress(k) {
    if (!lsum || lsum.busy) return;
    var coded = logCodeMode(); lsum.msg = "";
    if (k === "del") { if (lsum.digits) lsum.digits = lsum.digits.slice(0, -1); else lsum.word = null; }
    else if (/^[A-Z]+$/.test(k)) { if (coded && !lsum.word) lsum.word = k; }
    else if ((!coded || lsum.word) && lsum.digits.length < logNeed()) lsum.digits += k;
    if (lsum.digits.length === logNeed()) {
      var pin = coded ? lsum.word + "-" + lsum.digits : lsum.digits, me = lsum;
      lsum.busy = true; drawSummaryAuth();
      writeSummary(pin).then(function (ok) {
        if (lsum !== me) return;
        if (ok === true) { lsum = null; closeDetail(); return; }
        me.busy = false; me.digits = ""; me.word = null; me.msg = ok; drawSummaryAuth();
      });
      return;
    }
    drawSummaryAuth();
  }

  function logPick(d) {
    lg.day = d; lg.imp = null;
    var dt = parseYmd(d); if (dt.getMonth() !== lg.month.getMonth() || dt.getFullYear() !== lg.month.getFullYear()) lg.month = som(dt);
    loadLogDay(d);
    render(true);
  }
  /* A plain word, no motion (2.42.2, Timothy's ask): SAVING from the first keystroke until Notion has it, then SAVED. */
  function logStatusText(d) {
    if (logDrafts[d] && lg.saveErr) return "NOT SAVED YET · KEPT ON THIS IPAD";
    if (lg.saving || logDrafts[d]) return "SAVING";
    return lg.entries[d] ? "SAVED" : "";
  }
  function logStatus() { var el = $("clStatus"), t = lg.day ? logStatusText(lg.day) : ""; if (el && lg.day) el.textContent = t ? " · " + t : ""; var er = $("clErr"); if (er) er.textContent = lg.saveErr || ""; }
  function onLogInput(d, value) {
    var server = lg.entries[d] ? lg.entries[d].text : "";
    if (logNorm(value) === server) delete logDrafts[d]; else logDrafts[d] = { text: value, at: Date.now() };
    logDraftsSave();
    lg.saveErr = null;
    logStatus();
    if (lg.timer) clearTimeout(lg.timer);
    lg.timer = setTimeout(function () { lg.timer = null; if (lg.pin) logSave(lg.pin); }, LOG_SAVE_MS);
  }
  /* Send unsaved writing to Notion, one day at a time. Writing kept here until it lands. */
  function logSave(pin) {
    if (lg.saving) { lg.again = true; return; }
    var d = Object.keys(logDrafts).sort()[0];
    if (!d || !pin) return;
    var text = logDrafts[d].text, mine = lg;
    mine.saving = true; logStatus();
    apiPost({ action: "logsave", pin: pin, date: d, text: text }).then(function (j) {
      if (logDrafts[d] && logDrafts[d].text === text) { delete logDrafts[d]; logDraftsSave(); }
      var norm = logNorm(text);
      mine.entries[d] = Object.assign({}, mine.entries[d] || {}, { text: norm, saved: j.saved || new Date().toISOString() });
      if (mine.dates) { if (norm) mine.dates[d] = true; else delete mine.dates[d]; }
      mine.saveErr = null;
      if (lg === mine && mine.day === d) logSavedFx(mine.manual);
      mine.manual = false;
    }).catch(function (err) {
      mine.manual = false;
      if (err.code === "log_edit_in_notion") {
        mine.saveErr = "This page holds things the LOG can't show (a photo or table, say), so it's edited in Notion only. Your text here is kept on this iPad.";
        return;
      }
      mine.saveErr = logErrText(err.code) || describe(err);
      if (err.code === "bad_pin" || err.code === "log_locked") return;
      if (lg === mine) setTimeout(function () { if (lg === mine && lg.pin) logSave(lg.pin); }, 30000);
    }).then(function () {
      mine.saving = false;
      if (lg !== mine) return;
      logStatus();
      var cell = document.querySelector('[data-lday="' + d + '"]');   /* update in place so the save animation and the caret survive */
      if (cell && mine.dates) cell.classList.toggle("has", !!mine.dates[d] || !!logDrafts[d]);
      var er = $("clErr"); if (er) er.textContent = mine.saveErr || "";
      var more = Object.keys(logDrafts).some(function (k) { return k !== d || logDrafts[k].text !== text; });
      if ((mine.again || more) && !mine.saveErr) { mine.again = false; logSave(pin); }
    });
  }
  /* A save landing: the status already reads SAVED (no bar or flash since 2.42.2, they distracted while writing).
     A tap on SAVE also reads SAVED ✓ for a moment. Done in place, never by redrawing, so the keyboard and caret stay. */
  function logSavedFx(manual) {
    var btn = document.querySelector('[data-lact="save"]');
    if (manual && btn) {
      btn.textContent = "SAVED ✓"; restartClass(btn, "saved");
      setTimeout(function () { if (btn.isConnected) { btn.textContent = "SAVE"; btn.classList.remove("saved"); } }, 1600);
    }
  }
  function logInsertBearings() {
    var d = lg.day, ta = $("clText-" + d), words = bearings();
    if (!ta || !words.length) return;
    var add = "—\n\n" + words.map(function (w) { return w + ": "; }).join("\n\n");
    var v = ta.value.replace(/\s+$/, "");
    ta.value = (v ? v + "\n\n" : "") + add;
    onLogInput(d, ta.value);
    growLog(ta);
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (x) { /* not a text field */ }
  }
  /* The editor grows with its text. 2.62.1 (Timothy: typing or Enter in LOG made the screen jump, to the top in
     portrait, the bottom in landscape): it used to be measured by setting its height to "auto", which shrank it to
     320 px for a moment on every key, so the page under the caret shrank too (a 3,000 px page to 1,650) and the iPad
     scrolled to suit before it grew back. Now a hidden copy of the same width is measured, and the editor only ever
     changes to its new height. */
  var logMirror = null;
  function growLog(ta) {
    if (!ta || !ta.parentNode) return;
    var m = logMirror || (logMirror = document.createElement("textarea"));
    if (m.parentNode !== ta.parentNode) { m.className = "cl-mirror"; m.setAttribute("aria-hidden", "true"); m.tabIndex = -1; m.readOnly = true; ta.parentNode.insertBefore(m, ta.nextSibling); }
    m.style.width = ta.offsetWidth + "px"; m.value = ta.value;
    var h = Math.max(m.scrollHeight + 4, 320) + "px";
    if (ta.style.height !== h) ta.style.height = h;
  }

  /* --- importing old entries ---
     Paste a text export from a diary app: days headed by lines like
     "Thursday, November 13, 2025". Read here, sent five days at a time; days that
     already have a page are skipped, so running it twice adds nothing twice. */
  var DAYSL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHSL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function parseDiary(raw) {
    var text = String(raw || "").replace(/\r\n?/g, "\n").replace(/ /g, " ");
    var re = new RegExp("^[ \\t]*(" + DAYSL.join("|") + "),[ \\t]+(" + MONTHSL.join("|") + ")[ \\t]+(\\d{1,2}),[ \\t]+(\\d{4})[ \\t]*$", "gm");
    var heads = [], m, out = [], notes = [], by = {};
    while ((m = re.exec(text))) heads.push({ at: m.index, end: m.index + m[0].length, wd: m[1], mo: MONTHSL.indexOf(m[2]), d: +m[3], y: +m[4] });
    if ((heads.length ? text.slice(0, heads[0].at) : text).trim()) notes.push(heads.length ? "Text before the first date is left out." : "No dated days found. Each day should start with a line like “Thursday, November 13, 2025”.");
    heads.forEach(function (h, i) {
      var body = text.slice(h.end, i + 1 < heads.length ? heads[i + 1].at : text.length)
        .replace(/\n[ \t]*Sent from my (iPad|iPhone)[ \t]*\s*$/, "\n")
        .split("\n").map(function (l) { return l.replace(/[ \t]+$/, ""); }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      var dt = new Date(h.y, h.mo, h.d);
      if (dt.getDate() !== h.d) { notes.push("Skipped an impossible date: " + h.wd + ", " + MONTHSL[h.mo] + " " + h.d + ", " + h.y + "."); return; }
      var d = ymd(dt), label = dLabel(dt) + " " + h.y;
      if (DAYSL[dt.getDay()] !== h.wd) notes.push(label + " is headed " + h.wd + "; imported on the date as written.");
      if (by[d]) { notes.push(label + " appears twice; both join one page, in order."); if (body) by[d].text += (by[d].text ? "\n\n· · ·\n\n" : "") + body; return; }
      by[d] = { date: d, text: body }; out.push(by[d]);
    });
    out = out.filter(function (e) { if (!e.text) notes.push(dLabel(parseYmd(e.date)) + " is empty and is left out."); return !!e.text; });
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { entries: out, notes: notes };
  }
  /* Progress is counted from what Notion actually holds (days with a page), so a
     re-paste after any interruption shows exactly what's left and sends only that.
     A failed request is retried on its own, with growing pauses; only a PIN or setup
     problem stops it. Every request is safe to repeat: days already written are skipped. */
  var LOG_RETRY_MS = [10000, 20000, 40000, 60000, 90000, 120000];
  var LOG_STOP = ["bad_pin", "log_locked", "log_pin_not_set", "notion_not_shared", "notion_unauthorized", "unknown_action"];
  function logImportCheck() {
    var f = $("clImp"), r = parseDiary(f ? f.value : ""), have = {};
    r.entries.forEach(function (e) { if (lg.dates && lg.dates[e.date]) have[e.date] = true; });
    lg.imp = { stage: r.entries.length ? "ready" : "paste", entries: r.entries, notes: r.notes, have: have, created: 0, fails: 0, retryAt: 0, err: null };
    if (f) f.value = "";
    render(true);
  }
  function impLeft(imp) { return imp.entries.filter(function (e) { return !imp.have[e.date]; }); }
  function logImportRun() {
    var imp = lg.imp, pin = lg.pin;
    if (!imp || !pin) return;
    imp.stage = "running"; imp.err = null; imp.fails = 0; imp.retryAt = 0; render(true);
    (function next() {
      if (lg.pin !== pin || lg.imp !== imp) return;
      var left = impLeft(imp);
      if (!left.length) {
        imp.stage = "done";
        return logRead({ action: "logdates", pin: pin }).then(function (j) {
          if (lg.pin !== pin) return;
          lg.dates = {}; (j.dates || []).forEach(function (d) { lg.dates[d] = true; });
          lg.entries = {};
        }).catch(function () { /* the calendar catches up on the next unlock */ }).then(function () { if (state.screen === "log") render(true); });
      }
      var batch = left.slice(0, LOG_BATCH);
      apiPost({ action: "logimport", pin: pin, entries: batch }, 120000).then(function (j) {
        (j.created || []).concat(j.skipped || []).forEach(function (d) { imp.have[d] = true; if (lg.dates && (j.created || []).indexOf(d) > -1) lg.dates[d] = true; });
        imp.created += (j.created || []).length;
        imp.fails = 0; imp.err = null; imp.retryAt = 0;
        noteTouch();
        if (state.screen === "log") render(true);
        next();
      }).catch(function (err) {
        if (lg.pin !== pin || lg.imp !== imp) return;
        var why = logErrText(err.code) || describe(err);
        if (LOG_STOP.indexOf(err.code) > -1 || imp.fails >= LOG_RETRY_MS.length) {
          imp.stage = "ready"; imp.err = why; imp.retryAt = 0;
        } else {
          var wait = LOG_RETRY_MS[imp.fails++];
          imp.err = why; imp.retryAt = Date.now() + wait;
          noteTouch();
          setTimeout(next, wait);
        }
        if (state.screen === "log") render(true);
      });
    })();
  }
  function logImportHtml() {
    var imp = lg.imp, n = imp.entries.length, first = n ? imp.entries[0].date : null, last = n ? imp.entries[n - 1].date : null;
    var range = n ? dLabel(parseYmd(first)) + " " + first.slice(0, 4) + " TO " + dLabel(parseYmd(last)) + " " + last.slice(0, 4) : "";
    var inN = n - impLeft(imp).length, left = n - inN;
    var html = phead("IMPORT", imp.stage === "running" ? inN + " OF " + n + " IN NOTION" : imp.stage === "done" ? "DONE" : "FROM A DIARY EXPORT", "chrome-c");
    if (imp.stage === "paste") {
      return html + (imp.notes.length ? '<div class="errtxt cl-note">' + esc(imp.notes.join(" ")) + "</div>" : "") +
        '<label class="ov-sub" for="clImp">PASTE THE TEXT EXPORT</label><textarea id="clImp" rows="10" spellcheck="false" placeholder="Each day starting with a line like: Thursday, November 13, 2025"></textarea>' +
        '<div class="btnrow cl-row"><button type="button" class="btn" data-lact="impcheck">CHECK</button><button type="button" class="btn ghost" data-lact="impcancel">CANCEL</button></div>' +
        '<small class="muted">Read on this iPad and sent straight to Notion. Nothing is kept here. Days that already have a page are skipped.</small>';
    }
    html += '<dl class="kv"><dt>ENTRIES</dt><dd class="tnum">' + n + "</dd><dt>FROM</dt><dd>" + range + "</dd>" +
      '<dt>IN NOTION</dt><dd class="tnum">' + inN + " of " + n + (left && imp.stage !== "done" ? " · " + left + " to go" : "") + "</dd>" +
      '<dt>PROGRESS</dt><dd><span class="cl-bar"><i style="width:' + (n ? Math.round(100 * inN / n) : 0) + '%"></i></span></dd></dl>';
    if (imp.notes.length) html += '<ul class="cl-notes">' + imp.notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
    if (imp.stage === "running" && imp.retryAt) html += '<div class="cl-note muted">That request didn\'t go through (' + esc(imp.err) + "). Trying again in " + Math.max(1, Math.round((imp.retryAt - Date.now()) / 1000)) + " s, on its own.</div>";
    else if (imp.stage === "ready" && imp.err) html += '<div class="errtxt cl-note">' + imp.err + " Everything already in Notion stays; IMPORT sends only what's left.</div>";
    if (imp.stage === "ready") html += '<div class="btnrow cl-row"><button type="button" class="btn" data-lact="imprun"' + (left ? "" : " disabled") + ">" + (inN ? "IMPORT THE " + left + " LEFT" : "IMPORT " + n + (n === 1 ? " ENTRY" : " ENTRIES")) + '</button><button type="button" class="btn ghost" data-lact="impcancel">CANCEL</button></div>' +
      '<small class="muted">About ' + Math.max(1, Math.round(left / LOG_BATCH * 4 / 60)) + " min. Keep TimothyOS open until it finishes; it locks if the app goes to the background. If it does, paste again: only what's left is sent.</small>";
    if (imp.stage === "running" && !imp.retryAt) html += '<small class="muted">Writing to Notion…</small>';
    if (imp.stage === "done") html += '<div class="cl-note">All ' + n + " days are in Notion" + (imp.created ? " (" + imp.created + " added just now)" : "") + '.</div><div class="btnrow cl-row"><button type="button" class="btn" data-lact="impcancel">BACK TO THE PAGE</button></div>';
    return html;
  }
  function renderLog() {
    var html = '<div class="cl">';
    if (!canLog()) { $("content").innerHTML = html + "<section>" + phead("CAPTAIN'S LOG", "") + stubBox("The log needs the Google bridge updated. Steps are in the README under <b>Captain's Log</b>.") + "</section></div>"; return; }
    if (!logOpen()) {
      var coded = logCodeMode(), need = logNeed(), dots = "";
      /* the code word shows only as a filled slot, never by name: the panel can be overlooked */
      if (coded) dots += '<i class="w' + (lg.word ? " on" : "") + '"></i>';
      for (var i = 0; i < need; i++) dots += '<i class="' + (i < lg.digits.length ? "on" : "") + '"></i>';
      var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"], noDigits = lg.busy || (coded && !lg.word);
      var prompt = !coded ? "ENTER YOUR PIN" : !lg.word ? "STATE AUTHORIZATION: CODE WORD" : "AUTHORIZATION: FOUR DIGITS";
      $("content").innerHTML = html + '<section class="cl-lock' + (coded ? " coded" : "") + '">' + phead("CAPTAIN'S LOG", coded ? "AUTHORIZATION REQUIRED" : "LOCKED", "chrome-c") +
        '<div class="cl-dots" aria-label="' + (coded ? (lg.word ? "Code word chosen, " : "No code word yet, ") + lg.digits.length + " of 4 digits" : lg.digits.length + " of 6 digits") + '">' + dots + "</div>" +
        '<div class="cl-msg" role="status">' + (lg.busy ? (coded ? "VERIFYING AUTHORIZATION…" : "CHECKING…") : lg.msg ? esc(lg.msg) : prompt) + "</div>" +
        (coded ? '<div class="cl-words">' + LOG_WORDS.map(function (w) {
          return '<button type="button" class="cl-word" data-lpin="' + w[0] + '"' + (lg.busy || lg.word ? " disabled" : "") + ' aria-label="' + w[0] + '"><b>' + w[1] + "</b><span>" + w[0] + "</span></button>";
        }).join("") + "</div>" : "") +
        '<div class="cl-pad">' + keys.map(function (k) {
          var off = k === "del" ? lg.busy || (!lg.digits && !lg.word) : noDigits;
          return k === "" ? "<span></span>" : '<button type="button" class="cl-key' + (k === "del" ? " del" : "") + '" data-lpin="' + k + '"' + (off ? " disabled" : "") + ' aria-label="' + (k === "del" ? "Delete" : k) + '">' + (k === "del" ? "⌫" : k) + "</button>";
        }).join("") + "</div></section></div>";
      return;
    }
    html += sess.tabs();
    if (logTab === "sessions" && canSessions()) { $("content").innerHTML = html + sess.html() + "</div>"; return; }
    var today = ymd(new Date()), mo = lg.month, g = sow(mo), cells = "";
    for (var c = 0; c < 42; c++) {
      var dd = addDays(g, c), k2 = ymd(dd), inMo = dd.getMonth() === mo.getMonth();
      if (c === 35 && !inMo) break;
      cells += '<button type="button" class="cl-day' + (inMo ? "" : " out") + (lg.dates[k2] || logDrafts[k2] ? " has" : "") + (k2 === today ? " today" : "") + '"' +
        (k2 === lg.day ? ' aria-current="date"' : "") + (k2 > today ? " disabled" : ' data-lday="' + k2 + '"') + ' aria-label="' + dLabel(dd) + (lg.dates[k2] ? ", written" : "") + '">' + dd.getDate() + "</button>";
    }
    var thisMo = mo.getFullYear() === new Date().getFullYear() && mo.getMonth() === new Date().getMonth();
    html += logFindBox();
    html += '<section class="cl-cal">' + phead("CAPTAIN'S LOG", '<button type="button" class="chip sm cl-lockbtn" data-lact="lock">LOCK</button>', "chrome-c") +
      '<div class="cl-mon"><button type="button" class="chip" data-lmon="-1" aria-label="Previous month"' + (lg.pick ? " disabled" : "") + '><span class="tri l"></span></button>' +
      '<button type="button" class="cl-title" data-lact="pick" aria-expanded="' + lg.pick + '" aria-label="Jump to a month">' + MONL[mo.getMonth()] + " " + mo.getFullYear() + '<span class="tri ' + (lg.pick ? "u" : "d") + '"></span></button>' +
      '<button type="button" class="chip" data-lmon="1" aria-label="Next month"' + (thisMo || lg.pick ? " disabled" : "") + '><span class="tri r"></span></button></div>' +
      (lg.pick ? logPickerHtml() : '<div class="cl-grid">' + ["M", "T", "W", "T", "F", "S", "S"].map(function (x) { return '<span class="cl-dow">' + x + "</span>"; }).join("") + cells + "</div>") +
      '<div class="cl-acts' + (canLogAsk() ? "" : " one") + '"><button type="button" class="chip" data-lact="today"' + (lg.day === today && thisMo ? " disabled" : "") + '>TODAY</button>' +
      (canLogAsk() ? '<button type="button" class="chip la-open" data-lact="aiopen">ASK CLAUDE</button>' : "") + "</div>" +
      '<button type="button" class="cl-link" data-lact="import">IMPORT A DIARY EXPORT</button></section>';
    html += '<section class="cl-page">';
    if (lg.imp) html += logImportHtml();
    else if (lg.ai && lg.ai.view) html += logAiHtml();
    else if (lg.find && lg.find.view) html += logFindHtml();
    else {
      var d = lg.day, dt = parseYmd(d), e = lg.entries[d], loading = lg.dates[d] && !(d in lg.entries), intent = (lsGet(LS_LOG) || {})[d];
      html += phead(DOWL[dt.getDay()], p2(dt.getDate()) + " " + MON[dt.getMonth()] + " " + dt.getFullYear() + '<span id="clStatus">' + (logStatusText(d) ? " · " + logStatusText(d) : "") + "</span>", "chrome-c");
      if (lg.ai && !lg.ai.view) html += '<div class="cl-findbar"><button type="button" class="chip" data-lact="aiback"><span class="tri l"></span>ASK THE LOG</button><span class="cl-fbt">BACK TO THE ANSWER</span></div>';
      else html += logFindBar(d);
      if (intent) html += '<div class="cl-intent"><span>INTENT</span>' + esc(intent) + "</div>";
      if (lg.err[d] && !logDrafts[d]) html += '<div class="errtxt cl-note">' + lg.err[d] + ' <button type="button" class="chip" data-lact="retry">TRY AGAIN</button></div>';
      else if (loading && !logDrafts[d]) html += '<div class="empty">Opening the page…</div>';
      else {
        var b = bearings();
        if (e && e.other) html += '<div class="cl-note muted">This page also holds things the LOG can\'t show (a photo or table, say). Read it here; change it in Notion.</div>';
        if (!(e && e.other)) html += '<div class="cl-tools">' + bulChip("clText-" + d) + (b.length ? '<button type="button" class="chip sm" data-lact="bearings">+ BEARINGS</button>' : "") +
          '<span class="cl-tools-gap"></span>' + (e && e.url ? '<a class="chip sm" href="' + esc(e.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") + "</div>";
        else if (e.url) html += '<div class="cl-tools"><span class="cl-tools-gap"></span><a class="chip sm" href="' + esc(e.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a></div>';
        html += '<textarea class="cl-text" id="clText-' + d + '" aria-label="Entry for ' + dLabel(dt) + '"' + (e && e.other ? " readonly" : "") + ' spellcheck="true" autocapitalize="sentences">' + esc(logText(d)) + "</textarea>" +
          '<div class="cl-err errtxt" id="clErr">' + (lg.saveErr || "") + "</div>" +
          (e && e.other ? "" : '<div class="btnrow cl-row cl-saverow"><button type="button" class="btn" data-lact="save">SAVE</button></div>');
      }
    }
    $("content").innerHTML = html + "</section></div>";
    growLog($("clText-" + lg.day));
  }
  /* Jump to a month: years you've written in, then the twelve months of the chosen one.
     A dot marks months with entries; months still ahead are closed. */
  function logPickerHtml() {
    var now = new Date(), cy = now.getFullYear(), have = {}, first = cy;
    Object.keys(lg.dates || {}).forEach(function (d) { have[d.slice(0, 7)] = true; first = Math.min(first, +d.slice(0, 4)); });
    var y = lg.pickYear || lg.month.getFullYear(), years = "";
    for (var yy = first; yy <= cy; yy++) years += '<button type="button" class="chip" data-lyear="' + yy + '" aria-pressed="' + (yy === y) + '">' + yy + "</button>";
    var months = MON.map(function (m, i) {
      var key = y + "-" + p2(i + 1), ahead = y > cy || (y === cy && i > now.getMonth()), cur = y === lg.month.getFullYear() && i === lg.month.getMonth();
      return '<button type="button" class="cl-mo' + (have[key] ? " has" : "") + '"' + (cur ? ' aria-current="date"' : "") + (ahead ? " disabled" : ' data-ljump="' + key + '"') + ' aria-label="' + MONL[i] + " " + y + (have[key] ? ", written" : "") + '">' + m + "</button>";
    }).join("");
    return '<div class="cl-pick"><div class="chips cl-years">' + years + '</div><div class="cl-months">' + months + "</div></div>";
  }
  function logAiToggle() {
    if (state.caps.indexOf("logask") === -1) return "";
    var on = !!lsGet(LS_LOGAI);
    return '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND THE LOG</label><div class="btnrow">' +
      '<button type="button" class="chip" data-logai="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-logai="1" aria-pressed="' + on + '">SHARE LOG WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "In the open LOG, ASK CLAUDE reads only the entries you pick (a month, two months or a search; 62 at most), after showing what it will send and the cost. REVIEW's WRITE SUMMARY can include that week's entries after your authorization code. Entries go to Anthropic for that question only; answers are kept only if you tap SAVE." : "Off: Claude never reads your log.") + "</small>";
  }
  function logSection() {
    var html = "<section>" + phead("CAPTAIN'S LOG", canLog() ? "PIN-LOCKED" : "SETUP");
    if (!canLog()) return html + stubBox("Needs the Google bridge updated. Steps are in the README under <b>Captain's Log</b>.") + "</section>";
    var pinSet = state.caps.indexOf("logpin") > -1, nd = Object.keys(logDrafts).length;
    return html + '<div class="calrow"><span class="st" style="background:var(--chrome-c)"></span><span><b>PIN</b><small' + (pinSet ? ">" + (logCodeMode() ? "Authorization code set (a code word and four digits)." : "Six-digit PIN set.") + " Change it any time: LOG_PIN in the bridge's Script Properties." : ' class="errtxt">' + logErrText("log_pin_not_set")) + "</small></span>" +
      '<span class="pill' + (pinSet ? " ok" : " bad") + '">' + (pinSet ? "OK" : "SETUP") + "</span></div>" +
      '<small class="muted">Entries open only after the PIN and are never stored on this iPad; leaving LOG, the background, standby or 10 minutes without a touch locks it. ' +
      (nd ? nd + (nd === 1 ? " day has" : " days have") + " writing waiting to reach Notion; it goes on your next unlock. " : "") + (canLogSearch() ? "SEARCH THE LOG looks through every entry on the bridge; results stay in memory and go when it locks. " : "") + "The ASK button never sees the log.</small>" + logAiToggle() + sess.systems() + "</section>";
  }
  /* ---------- LOG → SESSIONS: counseling session notes (2.51, bridge 1.35) ----------
     Timothy confirmed the mockup and eight postulates (2026-10-28). A second tab in LOG behind the same code: what the
     bridge returns lives in lg.sn and goes when the log locks. The only thing kept on this iPad is a session not yet
     saved (LS_SNDRAFT), removed once Notion has it, never in a backup. Never sent to the ASK button, the briefing, the
     Ship's Year, ASTROMETRICS, REVIEW or COMPUTER's search. SUGGEST TOPICS sends only the sessions picked, after a PREVIEW,
     and only with SHARE SESSIONS WITH ASK on (LS_SNAI). Topic chips per type are kept on this iPad (LS_SNTOPICS). */
  var LS_SNDRAFT = "tos.sndraft.v1", LS_SNAI = "tos.snai.v1", LS_SNTOPICS = "tos.sntopics.v1";
  var logTab = "journal";   /* the LOG tab last shown; not sensitive, so it outlives a lock */
  function canSessions() { return canLog() && state.caps.indexOf("sessions") > -1; }
  function canSesAsk() { return canSessions() && state.caps.indexOf("sessionsuggest") > -1 && !!lsGet(LS_SNAI); }
  var sess = (function () {
    var TYPES = { solo: { name: "SOLO COUNSELING", short: "SOLO", c: "chrome-c" }, couples: { name: "COUPLES COUNSELING", short: "COUPLES", c: "chrome-d" } };
    var DEF_TOPICS = {
      solo: ["STRESS + WORK", "ANXIETY", "MOOD", "SELF-WORTH", "BOUNDARIES", "FAMILY OF ORIGIN", "GRIEF + LOSS", "HABITS + HEALTH", "SPIRITUAL LIFE", "GOALS + DIRECTION", "RELATIONSHIPS"],
      couples: ["COMMUNICATION", "CONFLICT + REPAIR", "TRUST", "CONNECTION + INTIMACY", "ROLES + LOAD", "FINANCES", "EXTENDED FAMILY", "TIME TOGETHER", "FUTURE PLANS"]
    };
    var MOODS = ["", "LOW", "HEAVY", "STEADY", "GOOD", "BRIGHT"];
    var FELT = ["Hard", "Heavy but useful", "Steady", "Lighter", "Breakthrough"], WHERE = ["In person", "Video", "Phone"];
    var STEPS = ["SESSION", "TOPICS", "INSIGHT", "PRACTICE", "WRAP UP"], QN = ["JAN – MAR", "APR – JUN", "JUL – SEP", "OCT – DEC"];
    var DID = [["y", "DONE"], ["p", "PARTLY"], ["n", "NOT YET"]];
    function st() { return lg.sn || (lg.sn = { list: null, url: "", busy: false, err: null, view: "list", sel: null, open: {}, step: 0, saving: false, saveErr: null, del: null, drop: false, sg: null }); }
    function topics(type) { var t = lsGet(LS_SNTOPICS) || {}; return Array.isArray(t[type]) && t[type].length ? t[type] : DEF_TOPICS[type]; }
    function draft() { return lsGet(LS_SNDRAFT); }
    function setDraft(d) { if (d) lsSet(LS_SNDRAFT, d); else lsDel(LS_SNDRAFT); }
    function mine(type) { return (st().list || []).filter(function (s) { return s.type === type; }); }   /* newest first, as the bridge sends them */
    function byId(id) { return (st().list || []).filter(function (s) { return s.id === id; })[0] || null; }
    function txt(t) { return esc(t || "").replace(/\n/g, "<br>"); }
    function err(e) {
      if (e && e.code === "notion_not_shared") return "🛋️ Session Notes isn't connected. In Notion: Session Notes → ••• → Connections → add TimothyOS bridge.";
      return logErrText(e && e.code) || (e && /^ai_/.test(e.code || "") ? describeAi(e) : describe(e));
    }
    function dLong(d) { var x = parseYmd(d); return DOW[x.getDay()] + " " + x.getDate() + " " + MON[x.getMonth()] + " " + x.getFullYear(); }

    function load() {
      var S = st(), pin = lg.pin;
      if (!pin || S.busy) return;
      S.busy = true; S.err = null;
      logRead({ action: "logsessions", pin: pin }).then(function (j) {
        if (lg.pin !== pin) return;
        S.list = j.sessions || []; S.url = j.url || "";
      }).catch(function (e) { if (lg.pin === pin) S.err = err(e); }).then(function () {
        if (lg.pin !== pin) return;
        S.busy = false;
        if (state.screen === "log" && logTab === "sessions") render(true);
      });
    }
    /* A new session of a type carries last time's practice (to mark how it went) and shows what was to be brought up. */
    function fresh(type) {
      var last = mine(type)[0];
      return { cid: newCid(), id: null, type: type, day: ymd(new Date()), where: "", arriving: null, onMind: "", topics: [], landed: "", phrase: "",
        practice: [], carried: last ? (last.practice || []).map(function (x) { return { text: x, did: null }; }) : [], leaving: null, felt: "", nextTime: "", next: "", step: 0 };
    }
    function fromSession(s) {
      return { cid: null, id: s.id, type: s.type, day: s.day, where: s.where || "", arriving: s.arriving, onMind: s.onMind || "", topics: (s.topics || []).map(function (t) { return { name: t.name, note: t.note || "" }; }),
        landed: s.landed || "", phrase: s.phrase || "", practice: (s.practice || []).slice(), carried: (s.carried || []).map(function (c) { return { text: c.text, did: c.did || null }; }),
        leaving: s.leaving, felt: s.felt || "", nextTime: s.nextTime || "", next: s.next || "", step: 0 };
    }
    /* What's typed goes into the draft as it's typed (and so survives a lock or a reload). */
    function keep() {
      var d = draft(); if (!d) return;
      var v = function (id) { var e = $(id); return e ? e.value : null; };
      if (v("sxDate") != null && v("sxDate")) d.day = v("sxDate");
      if (v("sxMind") != null) d.onMind = v("sxMind");
      if (v("sxLanded") != null) d.landed = v("sxLanded");
      if (v("sxPhrase") != null) d.phrase = v("sxPhrase");
      if (v("sxNextT") != null) d.nextTime = v("sxNextT");
      if (v("sxNextD") != null) d.next = v("sxNextD");
      d.topics.forEach(function (t, i) { var n = v("sxNote-" + i); if (n != null) t.note = n; });
      setDraft(d);
    }

    /* ---- drawing ---- */
    function tabs() {
      if (!canSessions()) return "";
      return '<div class="sx-tabs" role="tablist"><button type="button" class="chip" role="tab" data-sxtab="journal" aria-selected="' + (logTab !== "sessions") + '" aria-pressed="' + (logTab !== "sessions") + '">JOURNAL</button>' +
        '<button type="button" class="chip" role="tab" data-sxtab="sessions" aria-selected="' + (logTab === "sessions") + '" aria-pressed="' + (logTab === "sessions") + '">SESSIONS</button>' +
        (logTab === "sessions" ? '<span class="sx-gap"></span><button type="button" class="chip sm" data-lact="lock">LOCK</button>' : "") + "</div>";
    }
    function html() {
      var S = st();
      if (S.list === null && !S.busy && !S.err) load();
      var out = '<div class="sx">';
      if (S.view === "form" && draft()) out += formHtml();
      else if (S.view === "one" && byId(S.sel)) out += oneHtml(byId(S.sel));
      else if (S.view === "suggest" && S.sg) out += suggestHtml();
      else out += listHtml();
      return out + "</div>";
    }
    function moodHtml(s) {
      if (!s.arriving && !s.leaving) return "<span></span>";
      return '<span class="sx-mood" aria-label="Arriving ' + (s.arriving || "not marked") + ", leaving " + (s.leaving || "not marked") + '"><i>' + (s.arriving || "–") + "</i>→<i" + (s.leaving > s.arriving ? ' class="up"' : "") + ">" + (s.leaving || "–") + "</i></span>";
    }
    function rowHtml(s) {
      var d = parseYmd(s.day);
      return '<button type="button" class="sx-row" style="--c: var(--' + TYPES[s.type].c + ')" data-sx="open" data-id="' + esc(s.id) + '"><span class="sx-d"><b>' + d.getDate() + "</b>" + MON[d.getMonth()] + "<br>" + DOW[d.getDay()] + "</span>" +
        '<span class="sx-mid"><span class="sx-tags">' + (s.topics || []).slice(0, 3).map(function (t) { return '<span class="sx-tag">' + esc(t.name) + "</span>"; }).join("") + "</span>" +
        '<span class="sx-take">' + esc(s.landed || s.phrase || (s.topics.length ? "" : "No notes")) + "</span></span>" + moodHtml(s) + "</button>";
    }
    function opened(k, dflt) { var o = st().open; return k in o ? o[k] : dflt; }
    function listHtml() {
      var S = st(), d = draft(), html = "";
      html += '<div class="btnrow sx-starts">' + Object.keys(TYPES).map(function (k) { return '<button type="button" class="btn sm" style="background: var(--' + TYPES[k].c + ')" data-sx="new" data-t="' + k + '">+ ' + TYPES[k].short + " SESSION</button>"; }).join("") + "</div>";
      if (d) html += '<div class="sx-resume"><span class="pill">NOT SAVED</span><span><b>' + TYPES[d.type].short + " · " + dLong(d.day) + "</b>" + (d.id ? " · changes" : "") + " · stopped at " + STEPS[d.step || 0] + "</span>" +
        '<span class="sx-gap"></span><button type="button" class="btn sm" data-sx="resume">RESUME</button><button type="button" class="btn sm ghost" data-sx="drop">' + (S.drop === true ? "DISCARD IT" : "DISCARD") + "</button></div>";
      if (S.err && !S.list) return html + '<div class="errtxt">' + esc(S.err) + '</div><div class="btnrow"><button type="button" class="btn sm" data-sx="reload">TRY AGAIN</button></div>';
      if (!S.list) return html + '<div class="empty">Opening session notes…</div>';
      if (!S.list.length) return html + '<div class="empty">No sessions yet. Start one above after your next session; it saves to 🛋️ Session Notes in Notion.</div>' + foot();
      Object.keys(TYPES).forEach(function (type) {
        var t = TYPES[type], list = mine(type);
        if (!list.length) return;
        var open = opened(type, true), last = list[0];
        html += '<section class="sx-type" style="--c: var(--' + t.c + ')"><div class="sx-thead"><button type="button" class="sx-tog" aria-expanded="' + open + '" data-sx="tog" data-k="' + type + '"><span class="sx-caret">▼</span><span><b>' + t.name + "</b><small>" +
          list.length + (list.length === 1 ? " SESSION" : " SESSIONS") + " · LAST " + dLong(last.day).slice(4) + (last.next && last.next >= ymd(new Date()) ? " · NEXT " + dLong(last.next).slice(4) : "") + "</small></span></button>" +
          (canSesAsk() ? '<button type="button" class="btn sm ask" data-sx="suggest" data-t="' + type + '">SUGGEST TOPICS</button>' : "") + "</div>";
        if (open) {
          var years = []; list.forEach(function (s) { var y = s.day.slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
          years.forEach(function (y, yi) {
            var ky = type + y, oy = opened(ky, yi === 0), iny = list.filter(function (s) { return s.day.slice(0, 4) === y; });
            html += '<div class="sx-year"><div class="sx-yhead"><button type="button" class="sx-tog" aria-expanded="' + oy + '" data-sx="tog" data-k="' + ky + '"><span class="sx-caret">▼</span><b>' + y + '</b></button><span class="sx-rule"></span><span class="sx-cnt">' + iny.length + (iny.length === 1 ? " SESSION" : " SESSIONS") + "</span></div>";
            if (oy) {
              var first = true;
              [3, 2, 1, 0].forEach(function (q) {
                var inq = iny.filter(function (s) { return Math.floor((+s.day.slice(5, 7) - 1) / 3) === q; });
                if (!inq.length) return;
                var kq = ky + "Q" + (q + 1), oq = opened(kq, yi === 0 && first); first = false;
                html += '<div class="sx-q"><button type="button" class="sx-tog sx-qtog" aria-expanded="' + oq + '" data-sx="tog" data-k="' + kq + '"><span class="sx-caret">▼</span><b>Q' + (q + 1) + " · " + QN[q] + '</b><span class="sx-cnt">· ' + inq.length + "</span></button>" +
                  (oq ? '<div class="sx-rows">' + inq.map(rowHtml).join("") + "</div>" : "") + "</div>";
              });
            }
            html += "</div>";
          });
        }
        html += "</section>";
      });
      return html + foot();
    }
    function foot() {
      return '<small class="muted sx-foot">Only saved sessions are listed. Arriving → leaving: how you came in and went out, 1 (LOW) to 5 (BRIGHT).' +
        (canSessions() && state.caps.indexOf("sessionsuggest") > -1 && !lsGet(LS_SNAI) ? " SUGGEST TOPICS is off: SYSTEMS → CAPTAIN'S LOG → SHARE SESSIONS WITH ASK." : "") + "</small>";
    }
    function oneHtml(s) {
      var S = st(), t = TYPES[s.type], list = mine(s.type), i = list.indexOf(s), num = list.length - i;
      var html = '<div class="btnrow sx-nav"><button type="button" class="btn sm ghost" data-sx="list">◀ ALL SESSIONS</button><span class="sx-gap"></span>' +
        '<button type="button" class="btn sm ghost" data-sx="open" data-id="' + esc(list[i + 1] ? list[i + 1].id : "") + '"' + (list[i + 1] ? "" : " disabled") + ">◀ EARLIER</button>" +
        '<button type="button" class="btn sm ghost" data-sx="open" data-id="' + esc(list[i - 1] ? list[i - 1].id : "") + '"' + (list[i - 1] ? "" : " disabled") + ">LATER ▶</button></div>";
      html += '<section class="sx-one" style="--c: var(--' + t.c + ')">' + phead(t.short + " · SESSION " + num, dLong(s.day) + (s.where ? " · " + s.where.toUpperCase() : ""), t.c) + '<div class="sx-grid"><dl class="kv">';
      if (s.arriving) html += "<dt>ARRIVING</dt><dd>" + s.arriving + " · " + MOODS[s.arriving] + "</dd>";
      if (s.onMind) html += "<dt>ON MY MIND</dt><dd>" + txt(s.onMind) + "</dd>";
      if (s.leaving) html += "<dt>LEAVING</dt><dd>" + s.leaving + " · " + MOODS[s.leaving] + "</dd>";
      if (s.felt) html += "<dt>IT FELT</dt><dd>" + esc(s.felt.toUpperCase()) + "</dd>";
      if (s.next) html += "<dt>NEXT SESSION</dt><dd>" + dLong(s.next) + "</dd>";
      html += "</dl><div>" + (s.landed ? '<div class="sx-lab">WHAT LANDED</div><div class="sx-quote">' + txt(s.landed) + "</div>" : "") + (s.phrase ? '<div class="sx-lab">A PHRASE TO KEEP</div><div class="sx-phrase">“' + esc(s.phrase) + "”</div>" : "") + "</div>";
      if (s.topics.length) html += '<div class="sx-wide"><div class="sx-lab">TOPICS</div>' + s.topics.map(function (x) { return '<div class="sx-topic"><b>' + esc(x.name) + "</b><span>" + (x.note ? txt(x.note) : '<span class="muted">No note</span>') + "</span></div>"; }).join("") + "</div>";
      if (s.carried.length) html += '<div><div class="sx-lab">LAST TIME\'S PRACTICE</div>' + s.carried.map(function (c) { return '<div class="sx-check"><span class="sx-box ' + (c.did || "") + '">' + (c.did === "y" ? "✓" : c.did === "p" ? "½" : "") + "</span><span>" + esc(c.text) + ' <span class="muted">· ' + (c.did ? DID.filter(function (x) { return x[0] === c.did; })[0][1] : "NOT MARKED") + "</span></span></div>"; }).join("") + "</div>";
      if (s.practice.length) html += '<div><div class="sx-lab">PRACTICE UNTIL NEXT TIME</div>' + s.practice.map(function (x) { return '<div class="sx-check"><span class="sx-box"></span><span>' + esc(x) + "</span></div>"; }).join("") + "</div>";
      if (s.nextTime) html += '<div class="sx-wide"><div class="sx-lab">BRING UP NEXT TIME</div><div>' + txt(s.nextTime) + "</div></div>";
      html += '</div><div class="btnrow"><button type="button" class="btn sm" data-sx="edit">EDIT</button>' + (s.url ? '<a class="btn sm ghost" href="' + esc(s.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "") +
        '<button type="button" class="btn sm ' + (S.del === s.id ? "warn" : "ghost") + '" data-sx="del"' + (S.saving ? " disabled" : "") + ">" + (S.del === s.id ? "DELETE IT" : "DELETE") + "</button></div>" +
        (S.del === s.id ? '<small class="muted">Moves the page to Notion\'s trash, where it can be restored.</small>' : "") + (S.saveErr ? '<div class="errtxt">' + esc(S.saveErr) + "</div>" : "") + "</section>";
      return html;
    }
    function chips(list, cur, act, label) {
      return '<div class="chips">' + list.map(function (v) { return '<button type="button" class="chip sm" data-sx="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (String(cur) === String(v)) + '">' + esc(label ? label(v) : String(v).toUpperCase()) + "</button>"; }).join("") + "</div>";
    }
    function formHtml() {
      var S = st(), d = draft(), t = TYPES[d.type], step = d.step || 0, last = mine(d.type).filter(function (s) { return s.id !== d.id; })[0];
      var html = '<section class="sx-form" style="--c: var(--' + t.c + ')">' + phead((d.id ? "CHANGE " : "NEW ") + t.short + " SESSION", "STEP " + (step + 1) + " OF 5 · KEPT ON THIS IPAD UNTIL SAVED", t.c);
      html += '<div class="sx-steps">' + STEPS.map(function (n, i) { return '<button type="button" data-sx="step" data-v="' + i + '"' + (i === step ? ' aria-current="step"' : "") + ">" + (i + 1) + " " + n + "</button>"; }).join("") + "</div>";
      if (step === 0) {
        if (!d.id) html += '<div class="sx-field"><div class="sx-lab">TYPE</div>' + chips(Object.keys(TYPES), d.type, "dtype", function (k) { return TYPES[k].short; }) + "</div>";
        html += '<div class="sx-field sx-date"><label class="sx-lab" for="sxDate">DATE</label><input type="date" id="sxDate" value="' + esc(d.day) + '" max="' + ymd(new Date()) + '"></div>' +
          '<div class="sx-field"><div class="sx-lab">WHERE</div>' + chips(WHERE, d.where, "dwhere") + "</div>" +
          '<div class="sx-field"><div class="sx-lab">HOW I\'M ARRIVING</div>' + chips([1, 2, 3, 4, 5], d.arriving, "din", function (v) { return v + " · " + MOODS[v]; }) + "</div>" +
          '<div class="sx-field"><label class="sx-lab" for="sxMind">ON MY MIND GOING IN</label><textarea id="sxMind" rows="2" placeholder="A line or two (optional)">' + esc(d.onMind) + "</textarea></div>" +
          (!d.id && last && last.nextTime ? '<div class="sx-carry"><b>From ' + dLong(last.day).slice(4) + ", to bring up:</b> " + txt(last.nextTime) + "</div>" : "");
      } else if (step === 1) {
        var names = d.topics.map(function (x) { return x.name; }), all = topics(d.type).concat(names.filter(function (n) { return topics(d.type).indexOf(n) < 0; }));
        html += '<div class="sx-field"><div class="sx-lab">WHAT CAME UP · TAP ANY THAT APPLY</div><div class="chips">' + all.map(function (n) { return '<button type="button" class="chip sm" data-sx="dtopic" data-v="' + esc(n) + '" aria-pressed="' + (names.indexOf(n) > -1) + '">' + esc(n) + "</button>"; }).join("") + "</div>" +
          '<div class="sx-add"><input type="text" id="sxNewTopic" maxlength="40" placeholder="Another topic" autocomplete="off" aria-label="Another topic"><button type="button" class="btn sm" data-sx="addtopic">ADD</button></div></div>';
        html += d.topics.length ? d.topics.map(function (x, i) { return '<div class="sx-tin"><label class="sx-lab" for="sxNote-' + i + '">' + esc(x.name) + '</label><textarea id="sxNote-' + i + '" rows="2" placeholder="What came up, in a sentence or two">' + esc(x.note) + "</textarea></div>"; }).join("")
          : '<div class="empty">Each topic you tap gets its own short box.</div>';
      } else if (step === 2) {
        html += '<div class="sx-field"><label class="sx-lab" for="sxLanded">WHAT LANDED</label><textarea id="sxLanded" rows="3" placeholder="The thing you want to remember from today">' + esc(d.landed) + "</textarea></div>" +
          '<div class="sx-field"><label class="sx-lab" for="sxPhrase">A PHRASE TO KEEP</label><input type="text" id="sxPhrase" maxlength="300" placeholder="Words worth carrying around (optional)" value="' + esc(d.phrase) + '"></div>';
      } else if (step === 3) {
        if (d.carried.length) html += '<div class="sx-field"><div class="sx-lab">LAST TIME\'S PRACTICE · HOW DID IT GO?</div>' + d.carried.map(function (c, i) {
          return '<div class="sx-prac"><span>' + esc(c.text) + '</span><div class="chips">' + DID.map(function (o) { return '<button type="button" class="chip sm" data-sx="dcar" data-i="' + i + '" data-v="' + o[0] + '" aria-pressed="' + (c.did === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>";
        }).join("") + "</div>";
        html += '<div class="sx-field"><div class="sx-lab">PRACTICE UNTIL NEXT TIME</div>' + d.practice.map(function (x, i) { return '<div class="sx-prac"><span>' + esc(x) + '</span><button type="button" class="chip sm" data-sx="dpdel" data-i="' + i + '" aria-label="Remove ' + esc(x) + '">✕</button></div>'; }).join("") +
          '<div class="sx-add"><input type="text" id="sxPrac" maxlength="300" placeholder="Something to try, notice or do" autocomplete="off" aria-label="Something to practise"><button type="button" class="btn sm" data-sx="dpadd"' + (d.practice.length >= 12 ? " disabled" : "") + ">ADD</button></div></div>";
      } else {
        html += '<div class="sx-field"><div class="sx-lab">HOW I\'M LEAVING</div>' + chips([1, 2, 3, 4, 5], d.leaving, "dout", function (v) { return v + " · " + MOODS[v]; }) + "</div>" +
          '<div class="sx-field"><div class="sx-lab">IT FELT</div>' + chips(FELT, d.felt, "dfelt") + "</div>" +
          '<div class="sx-field"><label class="sx-lab" for="sxNextT">BRING UP NEXT TIME</label><textarea id="sxNextT" rows="2" placeholder="What to start with next session (optional)">' + esc(d.nextTime) + "</textarea></div>" +
          '<div class="sx-field sx-date"><label class="sx-lab" for="sxNextD">NEXT SESSION</label><input type="date" id="sxNextD" value="' + esc(d.next) + '"></div>';
      }
      html += '<div class="btnrow"><button type="button" class="btn sm ghost" data-sx="step" data-v="' + Math.max(0, step - 1) + '"' + (step ? "" : " disabled") + ">◀ BACK</button>" +
        (step < 4 ? '<button type="button" class="btn sm" data-sx="step" data-v="' + (step + 1) + '">NEXT ▶</button>' : "") +
        '<button type="button" class="btn sm' + (step === 4 ? "" : " ghost") + (S.saving ? " busy" : "") + '" data-sx="save"' + (S.saving ? " disabled" : "") + ">" + (S.saving ? '<span class="spin" aria-hidden="true"></span>SAVING' : "SAVE SESSION") + "</button>" +
        '<button type="button" class="btn sm ghost" data-sx="list">CLOSE</button></div>' +
        (S.saveErr ? '<div class="errtxt">' + esc(S.saveErr) + "</div>" : "") +
        '<small class="muted">Tap a chip again to clear it. Only the type and date are needed. CLOSE keeps this on the iPad to RESUME later.</small></section>';
      return html;
    }
    function suggestHtml() {
      var S = st(), g = S.sg, t = TYPES[g.type], list = mine(g.type).slice(0, g.n);
      var html = '<div class="btnrow sx-nav"><button type="button" class="btn sm ghost" data-sx="list">◀ ALL SESSIONS</button></div><section class="sx-sg" style="--c: var(--' + t.c + ')">' + phead("SUGGEST TOPICS", t.name, t.c);
      if (!g.topics) {
        html += '<div class="sx-field"><div class="sx-lab">FROM WHICH SESSIONS</div>' + chips([3, 6, 12], g.n, "sgn", function (n) { return "THE LAST " + n; }) + "</div>" +
          '<div class="btnrow"><button type="button" class="chip sm" data-sx="sgdeep" aria-pressed="' + g.deep + '">THINK HARDER</button></div>';
        if (!g.preview) html += '<div class="btnrow"><button type="button" class="btn' + (g.busy ? " busy" : "") + '" data-sx="sgpreview"' + (g.busy ? " disabled" : "") + ">" + (g.busy ? '<span class="spin" aria-hidden="true"></span>CHECKING' : "PREVIEW") + "</button></div>" +
          '<small class="muted">PREVIEW shows what would go to Claude and the cost. Nothing is sent until SEND.</small>';
        else {
          var p = g.preview;
          html += '<div class="sx-gauge tnum"><span><b>' + p.count + "</b>SESSIONS</span><span><b>" + p.dates.map(function (x) { return dLong(x).slice(4, -5); }).join(", ") + "</b>DATES</span><span><b>~" + p.tokens.toLocaleString("en-US") + "</b>TOKENS</span><span><b>~" + money(g.deep ? p.usd.deep : p.usd.fast) + "</b>" + (g.deep ? "OPUS" : "SONNET") + "</span></div>" +
            '<div class="sx-carry">Goes to Claude: the notes of these ' + p.count + " " + t.short.toLowerCase() + " sessions only. Never the journal, never the other type. Claude has no tools and can't change anything." + (g.type === "couples" ? " Couples notes can mention your partner." : "") + "</div>" +
            '<div class="btnrow"><button type="button" class="btn' + (g.busy ? " busy" : "") + '" data-sx="sgsend"' + (g.busy ? " disabled" : "") + ">" + (g.busy ? '<span class="spin" aria-hidden="true"></span>ASKING' : "SEND") + '</button><button type="button" class="btn ghost" data-sx="sgchange"' + (g.busy ? " disabled" : "") + ">CHANGE</button></div>";
        }
      } else {
        var lastS = list[0];
        html += '<small class="muted">From ' + g.info.count + " sessions · " + modelName(g.model) + " · " + money(g.cost || 0) + " · not kept on this iPad, forgotten when LOG locks</small>";
        html += g.topics.map(function (x, i) {
          if (g.gone[i]) return "";
          var on = !!g.added[i];
          return '<div class="sx-sugg' + (on ? " on" : "") + '"><b>' + (i + 1) + ". " + esc(x.title) + "</b><div>" + esc(x.why) + "</div>" +
            (x.dates.length ? '<div class="sx-from"><span class="sx-lab">FROM</span>' + x.dates.map(function (dd) { var s = mine(g.type).filter(function (y) { return y.day === dd; })[0]; return s ? '<button type="button" class="chip sm" data-sx="open" data-id="' + esc(s.id) + '">' + dLong(dd).slice(4) + "</button>" : ""; }).join("") + "</div>" : "") +
            '<div class="btnrow">' + (on ? '<span class="pill ok">IN BRING UP NEXT TIME</span><button type="button" class="btn sm ghost" data-sx="sgadd" data-i="' + i + '"' + (g.busy ? " disabled" : "") + ">UNDO</button>"
              : '<button type="button" class="btn sm" data-sx="sgadd" data-i="' + i + '"' + (g.busy || !lastS ? " disabled" : "") + '>ADD TO NEXT TIME</button><button type="button" class="btn sm ghost" data-sx="sgdrop" data-i="' + i + '">DISMISS</button>') + "</div></div>";
        }).join("");
        html += '<div class="btnrow"><button type="button" class="btn sm ghost" data-sx="sgchange">ASK AGAIN</button></div>' +
          '<small class="muted">ADD TO NEXT TIME writes the topic into the ' + (lastS ? dLong(lastS.day).slice(4) : "latest") + " session's BRING UP NEXT TIME in Notion, so it greets you when you start the next one.</small>";
      }
      if (g.err) html += '<div class="errtxt">' + esc(g.err) + "</div>";
      return html + "</section>";
    }

    /* ---- actions ---- */
    function save() {
      keep();
      var S = st(), d = draft(), pin = lg.pin;
      if (!d || S.saving || !pin) return;
      if (!d.day) { S.saveErr = "Pick the date of the session."; render(true); return; }
      S.saving = true; S.saveErr = null; render(true);
      var body = { type: d.type, day: d.day, where: d.where || null, arriving: d.arriving, leaving: d.leaving, felt: d.felt || null, next: d.next || null, onMind: d.onMind, landed: d.landed, phrase: d.phrase, nextTime: d.nextTime,
        topics: d.topics.map(function (x) { return { name: x.name, note: x.note }; }), practice: d.practice, carried: d.carried.map(function (c) { return { text: c.text, did: c.did }; }) };
      if (d.id) body.id = d.id; else body.cid = d.cid;
      apiPost({ action: "logsessionsave", pin: pin, session: body }, 60000).then(function (j) {
        if (lg.pin !== pin) return;
        setDraft(null);
        var s = j.session, list = (S.list || []).filter(function (x) { return x.id !== s.id; });
        list.push(s); list.sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : 0; });
        S.list = list; S.view = "one"; S.sel = s.id;
        S.open[s.type] = S.open[s.type + s.day.slice(0, 4)] = S.open[s.type + s.day.slice(0, 4) + "Q" + (Math.floor((+s.day.slice(5, 7) - 1) / 3) + 1)] = true;
        toast("Session saved to Notion");
      }).catch(function (e) { if (lg.pin === pin) S.saveErr = err(e) + " Your notes stay on this iPad; try SAVE again."; }).then(function () {
        if (lg.pin !== pin) return;
        S.saving = false;
        if (state.screen === "log" && logTab === "sessions") { render(true); window.scrollTo(0, 0); }
      });
    }
    function remove(s) {
      var S = st(), pin = lg.pin;
      S.saving = true; S.saveErr = null; render(true);
      apiPost({ action: "logsessionremove", pin: pin, id: s.id }).then(function () {
        if (lg.pin !== pin) return;
        S.list = S.list.filter(function (x) { return x.id !== s.id; }); S.view = "list"; S.del = null;
        toast("Moved to Notion's trash");
      }).catch(function (e) { if (lg.pin === pin) S.saveErr = err(e); }).then(function () { if (lg.pin === pin) { S.saving = false; if (state.screen === "log") render(true); } });
    }
    function suggest(preview) {
      var S = st(), g = S.sg, pin = lg.pin, ids = mine(g.type).slice(0, g.n).map(function (s) { return s.id; });
      g.busy = true; g.err = null; render(true);
      apiPost({ action: "logsessionsuggest", pin: pin, type: g.type, ids: ids, preview: preview, mode: g.deep ? "deep" : "fast" }, preview ? 60000 : 150000).then(function (j) {
        if (lg.pin !== pin || S.sg !== g) return;
        if (preview) g.preview = j.preview;
        else { g.topics = j.topics; g.info = j.info; g.model = j.model; g.cost = j.cost; g.added = {}; g.gone = {}; if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); } }
      }).catch(function (e) { if (S.sg === g) g.err = err(e); }).then(function () { if (S.sg === g) { g.busy = false; if (state.screen === "log") render(true); } });
    }
    /* ADD TO NEXT TIME / UNDO: one line per topic in the latest session's Bring Up Next Time ("• title"). */
    function addNext(i) {
      var S = st(), g = S.sg, pin = lg.pin, last = mine(g.type)[0], line = "• " + g.topics[i].title;
      if (!last) return;
      var lines = (last.nextTime || "").split("\n").filter(function (x) { return x !== line; });
      if (!g.added[i]) lines.push(line);
      var text = lines.join("\n").replace(/^\n+|\n+$/g, "");
      g.busy = true; g.err = null; render(true);
      apiPost({ action: "logsessionnext", pin: pin, id: last.id, text: text }).then(function (j) {
        if (lg.pin !== pin || S.sg !== g) return;
        last.nextTime = j.session.nextTime; g.added[i] = !g.added[i];
      }).catch(function (e) { if (S.sg === g) g.err = err(e); }).then(function () { if (S.sg === g) { g.busy = false; if (state.screen === "log") render(true); } });
    }
    function setTopics(type, list) { var t = lsGet(LS_SNTOPICS) || {}; t[type] = list; lsSet(LS_SNTOPICS, t); }
    function click(b) {
      var a = b.dataset.sx, v = b.dataset.v, S = st(), d;
      /* Systems: the topic lists and the SHARE switch work without the log open */
      if (a === "ai") { if (v === "1") lsSet(LS_SNAI, true); else lsDel(LS_SNAI); render(true); return; }
      if (a === "tdel") { var tl = topics(b.dataset.t).slice(); tl.splice(+b.dataset.i, 1); setTopics(b.dataset.t, tl.length ? tl : DEF_TOPICS[b.dataset.t]); render(true); return; }
      if (a === "tadd") {
        var inp = $("sxT-" + b.dataset.t), nm = inp ? inp.value.replace(/[,]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 40) : "";
        if (nm && topics(b.dataset.t).indexOf(nm) < 0) { setTopics(b.dataset.t, topics(b.dataset.t).concat([nm])); if (inp) inp.value = ""; }
        render(true); return;
      }
      if (a === "treset") { setTopics(b.dataset.t, DEF_TOPICS[b.dataset.t].slice()); render(true); return; }
      if (!logOpen()) return;
      keep();
      d = draft();
      if (a !== "drop" && a !== "new") S.drop = false;
      if (a !== "del") S.del = null;
      if (a === "reload") { S.err = null; load(); }
      else if (a === "tog") { var k = b.dataset.k; S.open[k] = b.getAttribute("aria-expanded") !== "true"; }
      else if (a === "open") { if (!b.dataset.id) return; S.view = "one"; S.sel = b.dataset.id; S.saveErr = null; window.scrollTo(0, 0); }
      else if (a === "list") { S.view = "list"; S.saveErr = null; S.sg = null; }
      else if (a === "new") { if (d && !confirmNew(b)) return; setDraft(fresh(b.dataset.t)); S.view = "form"; S.saveErr = null; window.scrollTo(0, 0); }
      else if (a === "resume") { S.view = "form"; S.saveErr = null; }
      else if (a === "drop") { if (S.drop !== true) S.drop = true; else { setDraft(null); S.drop = false; S.view = "list"; } }
      else if (a === "edit") { var cur = byId(S.sel); if (!cur) return; setDraft(fromSession(cur)); S.view = "form"; S.saveErr = null; window.scrollTo(0, 0); }
      else if (a === "del") { var s1 = byId(S.sel); if (!s1) return; if (S.del === s1.id) { remove(s1); return; } S.del = s1.id; }
      else if (a === "save") { save(); return; }
      else if (a === "suggest") { S.sg = { type: b.dataset.t, n: 3, deep: false, busy: false, preview: null, topics: null, err: null, added: {}, gone: {} }; S.view = "suggest"; window.scrollTo(0, 0); }
      else if (a === "sgn") { S.sg.n = +v; S.sg.preview = null; }
      else if (a === "sgdeep") { S.sg.deep = !S.sg.deep; }
      else if (a === "sgpreview") { suggest(true); return; }
      else if (a === "sgsend") { suggest(false); return; }
      else if (a === "sgchange") { S.sg.preview = null; S.sg.topics = null; S.sg.err = null; }
      else if (a === "sgadd") { addNext(+b.dataset.i); return; }
      else if (a === "sgdrop") { S.sg.gone[+b.dataset.i] = true; }
      else if (d) {
        if (a === "step") { d.step = +v; window.scrollTo(0, 0); }
        else if (a === "dtype") { var nd = fresh(v); nd.cid = d.cid; nd.day = d.day; nd.onMind = d.onMind; d = nd; }
        else if (a === "dwhere") d.where = d.where === v ? "" : v;
        else if (a === "din") d.arriving = d.arriving === +v ? null : +v;
        else if (a === "dout") d.leaving = d.leaving === +v ? null : +v;
        else if (a === "dfelt") d.felt = d.felt === v ? "" : v;
        else if (a === "dtopic") { var at = d.topics.map(function (x) { return x.name; }).indexOf(v); if (at > -1) d.topics.splice(at, 1); else if (d.topics.length < 20) d.topics.push({ name: v, note: "" }); }
        else if (a === "addtopic") { var nt = ($("sxNewTopic") || {}).value || ""; nt = nt.replace(/[,]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 40); if (nt && d.topics.length < 20 && !d.topics.some(function (x) { return x.name === nt; })) d.topics.push({ name: nt, note: "" }); if ($("sxNewTopic")) $("sxNewTopic").value = ""; }
        else if (a === "dcar") { var c = d.carried[+b.dataset.i]; c.did = c.did === v ? null : v; }
        else if (a === "dpadd") { var pv = (($("sxPrac") || {}).value || "").trim().slice(0, 300); if (pv && d.practice.length < 12) d.practice.push(pv); if ($("sxPrac")) $("sxPrac").value = ""; }
        else if (a === "dpdel") d.practice.splice(+b.dataset.i, 1);
        setDraft(d);
      }
      render(true);
      if (a === "addtopic" || a === "dpadd") { var f = $(a === "addtopic" ? "sxNewTopic" : "sxPrac"); if (f) f.focus(); }
    }
    /* A second + SESSION while one is unsaved: the first tap says so, the second replaces it. */
    function confirmNew(b) {
      var S = st();
      if (S.drop === "new" + b.dataset.t) { S.drop = false; return true; }
      S.view = "list"; S.drop = "new" + b.dataset.t; toast("A session isn't saved yet. RESUME it, or tap again to start over."); render(true); return false;
    }
    function tab(t) {
      keep();
      logTab = t === "sessions" && canSessions() ? "sessions" : "journal";
      if (logTab === "sessions") { var S = st(); if (!S.list && !S.busy) { S.err = null; load(); } }
      render(true); enterScreen();
    }
    /* Systems → CAPTAIN'S LOG: the database, SHARE SESSIONS WITH ASK and the topic lists. */
    function systems() {
      var html = '<label class="ov-sub" style="margin-top:14px;display:block">SESSION NOTES</label>';
      if (!canSessions()) return html + '<small class="muted">Needs the Google bridge updated (README: Updating the Google bridge), then 🛋️ Session Notes connected to the TimothyOS integration in Notion.</small>';
      html += '<small class="muted">LOG → SESSIONS, behind the same code as the journal. Notes live only in 🛋️ Session Notes in Notion; a session not yet saved waits on this iPad (never in a backup) until it is.</small>';
      if (state.caps.indexOf("sessionsuggest") > -1) {
        var on = !!lsGet(LS_SNAI);
        html += '<div class="btnrow" style="margin-top:10px"><button type="button" class="chip" data-sx="ai" data-v="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-sx="ai" data-v="1" aria-pressed="' + on + '">SHARE SESSIONS WITH ASK</button></div>' +
          '<small class="muted">' + (on ? "SUGGEST TOPICS sends only the sessions you pick, of one type, after showing what it will send and the cost (about 1¢ with Sonnet). Counted in ASK's monthly total as SESSIONS. Nothing is sent until SEND." : "Off: Claude never reads your session notes.") + "</small>";
      }
      Object.keys(TYPES).forEach(function (k) {
        html += '<div class="ov-sub" style="margin-top:14px">' + TYPES[k].short + ' TOPICS</div><div class="chips sx-tlist">' + topics(k).map(function (n, i) { return '<button type="button" class="chip sm" data-sx="tdel" data-t="' + k + '" data-i="' + i + '" aria-label="Remove ' + esc(n) + '">' + esc(n) + " ✕</button>"; }).join("") + "</div>" +
          '<div class="sx-add"><input type="text" id="sxT-' + k + '" maxlength="40" placeholder="A topic to add" autocomplete="off" aria-label="Add a ' + TYPES[k].short.toLowerCase() + ' topic"><button type="button" class="btn sm" data-sx="tadd" data-t="' + k + '">ADD</button><button type="button" class="btn sm ghost" data-sx="treset" data-t="' + k + '">RESET</button></div>';
      });
      return html + '<small class="muted">Topic lists are kept on this iPad (and in your backups). A session keeps the topics it was saved with.</small>';
    }
    document.addEventListener("input", function (e) { if (state.screen === "log" && logTab === "sessions" && e.target && /^sx/.test(e.target.id || "") && !/^sx(NewTopic|Prac|T-)/.test(e.target.id)) keep(); });
    document.addEventListener("change", function (e) { if (state.screen === "log" && logTab === "sessions" && e.target && /^sx(Date|NextD)$/.test(e.target.id || "")) keep(); });
    return { tabs: tabs, html: html, click: click, tab: tab, systems: systems, load: load, keep: keep };
  })();

  document.addEventListener("keydown", function (e) {
    if (state.screen !== "log" || logOpen() || !canLog() || sb.on || e.metaKey || e.ctrlKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); logPress(e.key); }
    else if (logCodeMode() && LOG_WORD_KEYS[e.key.toLowerCase()]) { e.preventDefault(); logPress(LOG_WORD_KEYS[e.key.toLowerCase()]); }
    else if (e.key === "Backspace") { e.preventDefault(); logPress("del"); }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && (logOpen() || lg.digits || lg.word)) { lockLog(); if (state.screen === "log") render(false); }
  });
  setInterval(function () {
    if (logOpen() && Date.now() - sb.last >= LOG_IDLE_MS) { lockLog(); if (state.screen === "log") render(false); }
  }, 15000);

