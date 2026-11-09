  /* ---------- Morning Briefing (2.36, bridge 1.29) ---------- */
  /* The first time Bridge is in front after 06:00 (at 06:00 itself when it stood by overnight), the app sends ASK's
     snapshot plus yesterday's habits to the bridge (mode "brief": Sonnet, low effort, no tools) and gets back a
     headline, labelled paragraphs and one recommended action. It prints once like a teleprinter, reads aloud in the
     iPad's own voice on request, and folds to one line by hand (−) or at 10:30. Never the Captain's Log. */
  var LS_BRIEF = "tos.brief.v1", LS_BRIEFOFF = "tos.briefoff.v1";
  var BRIEF_SKIP = ["tarot readings", "apiary"];   /* snapshot parts the briefing leaves out (habits were never in it) */
  var BRIEF_ASK = "Write this morning's briefing. Keep it short: about 80 words in all, one or two sentences a paragraph, only what matters today. No YESTERDAY, APIARY or TAROT paragraphs.";
  var BRIEF_VOICE = /\bmoira\b/i;   /* the iPad voice (2.37): Moira, Timothy's pick of those iPadOS offers web apps (it keeps downloaded Premium voices, Isha included, from them). Reads when the AI voice can't */
  var BRIEF_FROM = 6 * 60, BRIEF_FOLD = 10 * 60 + 30, BRIEF_TYPE_MS = 5000, BRIEF_WAIT_MS = 60000, BRIEF_RETRY_MS = 10 * 60000;
  var br = { b: lsGet(LS_BRIEF), busy: false, err: "", errAt: 0, t0: 0, ci: 0, typeT0: 0, raf: 0, say: -1, speaking: false, waitFrom: 0, showOld: false };
  function canBrief() { return state.caps.indexOf("brief") > -1 && !lsGet(LS_BRIEFOFF); }
  /* 2.56 (bridge 1.37): NEWS, the two newest US headlines from NPR's National feed, added by the app after Claude's
     paragraphs exactly as NPR wrote them, with links to read on. Never sent to Claude. Off in SYSTEMS → MORNING BRIEFING. */
  var LS_NEWSOFF = "tos.newsoff.v1";
  function canNews() { return state.caps.indexOf("news") > -1 && !lsGet(LS_NEWSOFF); }
  function newsSetLine() {
    var on = !lsGet(LS_NEWSOFF);
    return '<div class="br-newsset"><span>' + (state.caps.indexOf("news") < 0 ? "Headlines: need the Google bridge updated to 1.37." : "Headlines: " + (on ? "the two newest from NPR's National news, as NPR wrote them, never sent to Claude." : "off.")) + "</span>" +
      (state.caps.indexOf("news") < 0 ? "" : '<button type="button" class="chip sm" data-brief="' + (on ? "newsoff" : "newson") + '">' + (on ? "NO HEADLINES" : "ADD HEADLINES") + "</button>") + "</div>";
  }
  function minsOf(d) { return d.getHours() * 60 + d.getMinutes(); }
  function briefToday(now) { return br.b && br.b.day === ymd(now || new Date()) ? br.b : null; }
  function briefSave() { lsSet(LS_BRIEF, br.b); }
  function briefUnread() { var b = briefToday(); return !!(b && !b.typed && canBrief()); }
  /* Today's facts are in: events, today's tasks, the weather (once a location is set) and the habits. */
  function briefReady() {
    var t = ymd(new Date());
    return hasData(bridgeRange()) && (!canPlan() || !!state.tasks[t]) && (!lsGet(LS_PLACE) || !!wxData()) &&
      (!canApiary() || !!(ap.data && Date.now() - ap.data.fetched < 6 * 3600000));   /* the hive rhythm needs the newest check (2.56) */
  }
  function briefMaybe() {
    var now = new Date();
    if (!state.conn || !canBrief() || br.busy || document.hidden || minsOf(now) < BRIEF_FROM || briefToday(now)) return;
    if (br.err && Date.now() - br.errAt < BRIEF_RETRY_MS) return;
    if (!briefReady()) {
      briefFetch();   /* a minute at most, looking again every few seconds: then it goes with what's there */
      if (!br.waitFrom) br.waitFrom = Date.now();
      if (Date.now() - br.waitFrom < BRIEF_WAIT_MS) { clearTimeout(br.retry); br.retry = setTimeout(briefMaybe, 3000); return; }
    }
    briefCompile();
  }
  /* Opened on another screen: fetch what the Bridge would have (its 14 days of calendars, today's tasks, the weather). */
  function briefFetch() {
    var r = bridgeRange(), k = rkey(r), today = ymd(new Date());
    if (!hasData(r) && !state.inflight[k]) {
      state.inflight[k] = true;
      api({ action: "events", from: r.from.getTime(), to: r.to.getTime() }).then(function (j) {
        state.ranges[k] = { from: r.from.getTime(), to: r.to.getTime(), fetched: Date.now(), events: j.events || [] }; persist();
      }).catch(function () { /* the briefing goes with what's there after a minute */ }).then(function () { delete state.inflight[k]; });
    }
    if (canPlan()) loadTasks(today, false);
    loadWeather(false);
    loadApiary(false);   /* the hive rhythm counts from the newest check (2.56) */
  }
  function briefSteps() {
    var st = ["Calendars"].concat(canPlan() ? ["Tasks and priorities"] : [], canDates() ? ["Key dates"] : [], wxData() ? ["Weather and hive check"] : [], ["Sonnet writing the briefing"]);
    var k = Math.min(st.length - 1, Math.floor((Date.now() - br.t0) / 380));
    return st.map(function (s, i) { return i < k ? '<span class="ok">✓</span> ' + s : i === k ? "<b>› " + s + "…</b>" : '<span class="dim">' + s + "</span>"; }).join("<br>");
  }
  function briefCompile(asked) {
    var now = new Date(), today = ymd(now), prev = briefToday(now);
    briefQuiet(); br.typeT0 = 0;
    br.busy = true; br.err = ""; br.t0 = Date.now(); br.waitFrom = 0; br.showOld = false;
    clearInterval(br.ci); br.ci = setInterval(function () { var c = $("brComp"); if (c) c.innerHTML = briefSteps(); }, 200);
    if (state.screen === "bridge") render(true);
    /* Timothy (2.36.1): shorter, and no habits, apiary or tarot. Those parts stay out of the snapshot, and the ask asks for brevity. */
    var ctx = briefing(true).filter(function (x) { return BRIEF_SKIP.indexOf(x.k) < 0; }).map(function (x) { return x.t; }).join("\n\n");
    var skyLine = sciBrief(); if (skyLine) ctx += "\n\n" + skyLine;   /* 2.42: only what's worth knowing from SCIENCE today */
    var newsP = canNews() ? api({ action: "news" }).then(function (n) { return n.items || []; }, function () { return []; }) : Promise.resolve([]);   /* no headlines is no reason to fail the briefing */
    return Promise.all([apiPost({ action: "ask", cid: newCid(), mode: "brief", messages: [{ role: "user", text: BRIEF_ASK }], context: ctx, ignore: ignoreList, breaks: breakList }, 150000), newsP]).then(function (res) {
      var j = res[0];
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      var b = briefParse(j.reply);
      if (!b) throw { code: "brief_shape" };
      var hl = res[1].filter(function (x) { return x && x.title && /^https:\/\//.test(x.link || ""); }).slice(0, 2);
      if (hl.length) {
        b.news = hl.map(function (x) { return { t: String(x.title).slice(0, 200), u: String(x.link) }; });
        b.paras.push({ label: "NEWS · NPR", text: b.news.map(function (x) { return /[.?!…]$/.test(x.t) ? x.t : x.t + "."; }).join(" ") });
      }
      /* asked for after 10:30 (REFRESH, COMPILE NOW, COMPUTER), it opens; a refresh keeps the fold you chose */
      b.id = newCid(); b.day = today; b.at = Date.now(); b.model = j.model || ""; b.cost = j.cost || 0; b.typed = false; b.fold = asked && minsOf(now) >= BRIEF_FOLD ? false : prev ? prev.fold : null;
      br.b = b; briefSave();
      if (canVoice()) vaLoad(b);   /* Nova's audio, ready before READ IT TO ME */
    }).catch(function (err) {
      if (err && err.spend) { state.aiSpend = err.spend; lsSet(LS_AISPEND, err.spend); }
      var msg = err && err.code === "brief_shape" ? "Claude's answer didn't come back in the briefing's shape." : describeAi(err);
      if (briefToday()) toast("Briefing not refreshed: " + msg);   /* this morning's stays */
      else { br.err = msg; br.errAt = Date.now(); }
    }).then(function () { br.busy = false; clearInterval(br.ci); if (state.screen === "bridge") render(true); if (sb.on) paintStandby(); });
  }
  /* Claude answers {headline, paras[{label, text}], action}; anything else is refused rather than shown half-right. */
  function briefParse(reply) {
    var s = String(reply || ""), a = s.indexOf("{"), z = s.lastIndexOf("}"), o;
    if (a < 0 || z <= a) return null;
    try { o = JSON.parse(s.slice(a, z + 1)); } catch (e) { return null; }
    var str = function (x, n) { return typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, n) : ""; };
    var paras = (Array.isArray(o.paras) ? o.paras : []).map(function (p) { return { label: str(p && p.label, 24).replace(/[.:]+$/, "").toUpperCase(), text: str(p && p.text, 600) }; })
      .filter(function (p) { return p.text; }).slice(0, 10);
    if (!paras.length) return null;
    /* the Condition panel sits right below, so the folded line never repeats the level */
    var head = str(o.headline, 160).split(/\s+·\s+/).filter(function (x) { return !/^condition\b/i.test(x); }).join(" · ");
    return { headline: head, paras: paras, action: str(o.action, 300) };
  }
  /* Each paragraph as [class, text] pieces: its label, the condition level in its colour, the recommended action. */
  function briefSegs(b) {
    var out = b.paras.map(function (p) {
      var segs = p.label ? [["lbl", p.label + ". "]] : [], m = !p.label && p.text.match(/^(.*?)(\bcondition (green|yellow|red)\b:?)(.*)$/i);
      if (m) { if (m[1]) segs.push(["", m[1]]); segs.push(["c-" + m[3].toLowerCase(), m[2]]); if (m[4]) segs.push(["", m[4]]); }
      else segs.push(["", p.text]);
      return segs;
    });
    if (b.action) out.push([["act", "RECOMMENDED"], ["", " " + b.action]]);
    return out;
  }
  function briefLen(segs) { var n = 0; segs.forEach(function (p) { p.forEach(function (s) { n += s[1].length; }); }); return n; }
  /* The paper with n characters printed (all when n is null), the caret after the last one. */
  function briefHtml(segs, n, say) {
    if (say === undefined) say = br.say;
    var left = n == null ? Infinity : Math.max(0, n), html = "";
    for (var i = 0; i < segs.length; i++) {
      html += '<p data-bp="' + i + '"' + (say === i ? ' class="say"' : "") + ">";
      for (var j = 0; j < segs[i].length; j++) {
        var s = segs[i][j], t = s[1].slice(0, left);
        html += (s[0] ? '<span class="' + s[0] + '">' : "<span>") + esc(t) + "</span>";
        left -= t.length;
        if (left <= 0 && n != null && (j < segs[i].length - 1 || i < segs.length - 1 || t.length < s[1].length)) return html + '<span class="br-caret"></span></p>';
      }
      html += "</p>";
    }
    return html;
  }
  function briefFolded(b, now) {
    if (b.day !== ymd(now)) return !br.showOld;
    if (b.fold === true) return true;
    if (b.fold === false) return false;
    return minsOf(now) >= BRIEF_FOLD;
  }
  function briefHead(meta, btn) {
    return '<div class="phead" style="--c: var(--chrome-b)"><span class="cap"></span><h2>MORNING BRIEFING</h2><span class="rule"></span><span class="meta">' + meta + "</span>" + (btn || "") + "</div>";
  }
  function briefPanel(now) {
    if (!state.conn || !canAsk() || lsGet(LS_BRIEFOFF)) return "";
    if (state.caps.indexOf("brief") < 0) return "";   /* an older bridge: Systems says to update it */
    var b = br.b, today = briefToday(now);
    if (br.busy) return '<section class="br" aria-busy="true">' + briefHead("COMPILING · SONNET") + '<div class="br-comp" id="brComp">' + briefSteps() + '</div><div class="br-sweep"><i></i></div></section>';
    if (br.err && !today) return '<section class="br">' + briefHead("NOT COMPILED") + '<div class="br-err">' + esc(br.err) + "</div>" +
      '<div class="btnrow br-tools"><button type="button" class="btn sm" data-brief="now">COMPILE NOW</button><span class="muted">It tries again on its own in a few minutes.</span></div></section>';
    if (!b) return "";
    if (briefFolded(b, now)) return '<button type="button" class="br-fold" data-brief="open" aria-label="Open the morning briefing"><b>' + (today ? "" : "YESTERDAY'S ") + "MORNING BRIEFING · " + hm(new Date(b.at)) +
      "</b><span>" + esc(b.headline || b.paras[0].text) + '</span><span class="ov-more" aria-hidden="true"></span></button>';
    if (today && canVoice() && !vaReady(b) && !va.busy && vaRetryOk()) vaLoad(b);   /* Nova's audio from this iPad, or the bridge if it's missing */
    if (today && !b.typed && !sb.on && !document.hidden) { b.typed = true; briefSave(); br.typeT0 = calm() ? 0 : performance.now(); }   /* prints once, the first time it's seen */
    var segs = briefSegs(b), n = br.typeT0 ? Math.floor((performance.now() - br.typeT0) / BRIEF_TYPE_MS * briefLen(segs)) : today && !b.typed ? 0 : null;
    return '<section class="br">' + briefHead("COMPILED " + hm(new Date(b.at)) + " · " + modelName(b.model) + " · " + money(b.cost),
      '<button type="button" class="ov-more" data-brief="fold" aria-expanded="true" aria-label="Fold the briefing to one line"></button>') +
      '<div class="br-paper" id="brPaper">' + briefHtml(segs, n) + "</div>" +
      (b.news && b.news.length ? '<div class="br-news"><span class="ov-sub">READ AT NPR</span>' + b.news.map(function (x) { return '<a href="' + esc(x.u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.t) + "</a>"; }).join("") + "</div>" : "") +
      '<div class="btnrow br-tools"><button type="button" class="btn sm br-say" data-brief="say" aria-pressed="' + br.speaking + '"><span class="br-bars" aria-hidden="true"><i></i><i></i><i></i></span>' + (va.prep ? "PREPARING VOICE…" : br.speaking ? "STOP READING" : "READ IT TO ME") + "</button>" +
      '<button type="button" class="btn sm ghost" data-brief="again">REFRESH</button>' +
      (today && b.fold == null && minsOf(now) < BRIEF_FOLD ? '<span class="muted">Folds to one line at 10:30, or tap −.</span>' : "") + "</div></section>";
  }
  /* Typing runs on its own frames and finds the paper by id, so the Bridge redrawing underneath never restarts it. */
  function briefLoop() {
    if (br.raf || !br.typeT0) return;
    var frame = function () {
      br.raf = 0;
      if (!br.typeT0) return;   /* finished by a tap, or folded */
      var el = $("brPaper");
      if (!el || state.screen !== "bridge") { br.typeT0 = 0; return; }   /* left the Bridge: next time it's simply there */
      var segs = briefSegs(br.b), total = briefLen(segs), n = Math.floor((performance.now() - br.typeT0) / BRIEF_TYPE_MS * total);
      if (n >= total) { br.typeT0 = 0; el.innerHTML = briefHtml(segs, null); return; }
      el.innerHTML = briefHtml(segs, n);
      br.raf = requestAnimationFrame(frame);
    };
    br.raf = requestAnimationFrame(frame);
  }
  /* READ IT TO ME: every paragraph queued at once, inside the tap, so iPadOS lets it speak; each lights up as it starts. */
  function briefSay() {
    if (br.speaking) { briefQuiet(); render(true); return; }
    if (canVoice() && vaRetryOk()) { vaSay(); return; }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { toast("This iPad has no voice to read with."); return; }
    br.typeT0 = 0;
    var texts = vaTexts(br.b);
    try { speechSynthesis.cancel(); } catch (e) { /* nothing was speaking */ }
    var voice = briefVoice();
    br.speaking = true; br.say = 0;
    texts.forEach(function (t, i) {
      var u = new SpeechSynthesisUtterance(t);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
      u.onstart = function () { if (!br.speaking) return; br.say = i; if (state.screen === "bridge") render(true); };
      u.onend = u.onerror = function () { if (i === texts.length - 1 && br.speaking) { br.speaking = false; br.say = -1; if (state.screen === "bridge") render(true); } };
      speechSynthesis.speak(u);
    });
    render(true);
  }
  /* The iPad voice (BRIEF_VOICE), a Premium or Enhanced one first when there are two. Safari fills its voice list a moment after load, so it's asked early and again here. */
  function briefVoice() {
    var vs = [];
    try { vs = speechSynthesis.getVoices() || []; } catch (e) { return null; }
    var isha = vs.filter(function (v) { return BRIEF_VOICE.test(v.name || "") || BRIEF_VOICE.test(v.voiceURI || ""); });
    return isha.filter(function (v) { return /premium|enhanced/i.test((v.name || "") + " " + (v.voiceURI || "")); })[0] || isha[0] || null;
  }
  try { if (window.speechSynthesis) { speechSynthesis.getVoices(); speechSynthesis.addEventListener("voiceschanged", function () { speechSynthesis.getVoices(); }); } } catch (e) { /* no voices on this device */ }
  /* Systems: which voice READ IT TO ME uses, and what this iPad offers Bridge (iPadOS may keep downloaded voices from web apps). */
  function briefVoiceLine() {
    var vs = [], v = briefVoice();
    try { vs = speechSynthesis.getVoices() || []; } catch (e) { /* no voices */ }
    /* Isha missing: every English voice this iPad offers Bridge, as buttons that play the test line (an audition, nothing is kept).
       Timothy picks one by name and it becomes BRIEF_VOICE. Apple's novelty voices (Zarvox, Bubbles…) sort last. */
    var seen = {}, en = vs.filter(function (x) { var k = x.voiceURI || x.name + x.lang; if (!/^en[-_]/i.test(x.lang || "") || seen[k]) return false; seen[k] = 1; return true; });
    var odd = function (x) { return /speech\.synthesis|eloquence/i.test(x.voiceURI || "") ? 1 : 0; };
    en.sort(function (a, b) { return odd(a) - odd(b) || String(a.lang).localeCompare(String(b.lang)) || String(a.name).localeCompare(String(b.name)); });
    return '<div class="br-voice"><small class="muted">' + (v ? "iPad voice: " + esc(v.name) + " · " + esc(v.lang) + "."
      : "iPad voice: Moira isn't among the " + vs.length + " voices this iPad offers Bridge, so the iPad's default reads it." + (en.length ? " Tap a voice to hear it, then tell Claude the one you like:" : "")) +
      '</small> <button type="button" class="chip sm" data-brief="test">TEST VOICE</button></div>' +
      (!v && en.length ? '<div class="br-voices">' + en.map(function (x) {
        return '<button type="button" class="chip sm" data-vtest="' + esc(x.voiceURI || x.name) + '">' + esc(x.name) + " <small>" + esc(x.lang) + "</small></button>";
      }).join("") + "</div>" : "");
  }
  function briefTestSay(voice) {
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance("Good morning, Captain. This is the voice that reads your briefing.");
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      speechSynthesis.speak(u);
    } catch (e) { toast("This iPad has no voice to read with."); }
  }
  function briefQuiet() {
    if (!br.speaking) return;
    br.speaking = false; br.say = -1; va.prep = false;
    if (va.el) va.el.pause();
    try { speechSynthesis.cancel(); } catch (e) { /* already quiet */ }
  }

  /* ---------- AI voice (2.37, bridge 1.30): the briefing read by OpenAI's Nova ---------- */
  /* When a briefing compiles, the bridge asks OpenAI for one MP3 per paragraph (Nova, Timothy's style line); they're
     kept on this iPad (IndexedDB, today's only), so READ IT TO ME starts at once and costs nothing to replay. Tapped
     before they've arrived, a silent clip unlocks the player inside the tap (iPadOS only lets a tap start sound) and
     playback starts when they land. If OpenAI can't, Moira reads it on the next tap. Off in Systems. */
  var LS_VOICEOFF = "tos.voiceoff.v1", LS_VOICESPEND = "tos.voicespend.v1";
  var VA_SILENT = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAykAWlpaWlpaWlpaWlpaWlpaWnt7e3t7e3t7e3t7e3t7e3t7nJycnJycnJycnJycnJycnL29vb29vb29vb29vb29vb293t7e3t7e3t7e3t7e3t7e3t7/////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCowAAAAAAAAMpso+sIAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";
  var VA_TIMEOUT_MS = 300000, VA_RETRY_MS = 10 * 60000;   /* OpenAI took 130 s for a whole briefing (2026-10-23); Apps Script stops at 6 min */
  var va = { log: [], errAt: 0, at: "", urls: null, busy: "", err: "", el: null, i: -1, prep: false, p: null };
  function canVoice() { return state.caps.indexOf("voice") > -1 && !lsGet(LS_VOICEOFF); }
  /* Voice log (2.37.1): each step of asking for and playing Nova, shown in Systems, so a silent failure on the iPad can be read. */
  function vaLog(m) {
    var d = new Date();
    va.log.push(hm(d) + ":" + p2(d.getSeconds()) + " " + m);
    if (va.log.length > 14) va.log.shift();
    if (state.screen === "systems") render(true);
  }
  function vaSig(b64) {   /* MP3s start with an ID3 tag or a frame sync (FF Ex / FF Fx) */
    var h = "", bin = ""; try { bin = atob(String(b64 || "").slice(0, 8)); } catch (e) { return "unreadable"; }
    for (var i = 0; i < Math.min(3, bin.length); i++) h += ("0" + bin.charCodeAt(i).toString(16)).slice(-2) + " ";
    return bin.slice(0, 3) === "ID3" || (bin.charCodeAt(0) === 255 && (bin.charCodeAt(1) & 224) === 224) ? "MP3" : "not MP3 (" + h.trim() + ")";
  }
  function vaErrText(err) { return [err && err.code, err && (err.detail || err.message)].filter(Boolean).join(": ") || "unknown"; }
  /* Spoken text (2.40.1): what Nova and Moira are given, never what's printed. Times in ship's style (08:00 "oh eight
     hundred", 21:05 "twenty-one oh five", Timothy's choice) and symbols in words, so a voice never guesses (Nova read
     08:00 as "8 OK"). VA_SPEECH is part of each recording's key: change the rules, bump it, and the audio is made again. */
  var VA_SPEECH = "s2", SAY_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  function sayNum(n) { var t = ["", "", "twenty", "thirty", "forty", "fifty"]; return n < 20 ? SAY_ONES[n] : t[Math.floor(n / 10)] + (n % 10 ? "-" + SAY_ONES[n % 10] : ""); }
  function sayTime(h, m) { return (h === 0 ? "zero" : h < 10 ? "oh " + SAY_ONES[h] : sayNum(h)) + " " + (m === 0 ? "hundred" : m < 10 ? "oh " + SAY_ONES[m] : sayNum(m)); }
  function speakable(t) {
    return String(t)
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, function (x, h, m) { return sayTime(+h, +m); })
      .replace(/\s*°\s*F\b/g, " degrees Fahrenheit").replace(/\s*°\s*C\b/g, " degrees Celsius").replace(/°/g, " degrees")
      .replace(/(\d)\s*¢/g, "$1 cents").replace(/(\d)\s*%/g, "$1 percent")
      .replace(/\b1\s*lbs?\b/g, "1 pound").replace(/(\d)\s*lbs?\b/g, "$1 pounds")
      .replace(/\s+·\s+/g, ", ").replace(/\s{2,}/g, " ").trim();
  }
  function vaTexts(b) { return briefSegs(b).map(function (p) { return speakable(p.map(function (s) { return s[1]; }).join("")); }); }
  function vaDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error("no IndexedDB")); return; }
      var r = indexedDB.open("tos-voice", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("clips"); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function vaGet() {
    return vaDb().then(function (db) { return new Promise(function (res) { var q = db.transaction("clips").objectStore("clips").get("brief"); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; }); })
      .catch(function () { return null; });
  }
  function vaPut(rec) {
    return vaDb().then(function (db) { return new Promise(function (res) { var t = db.transaction("clips", "readwrite"); t.objectStore("clips").put(rec, "brief"); t.oncomplete = res; t.onerror = res; }); })
      .catch(function () { /* kept in memory only */ });
  }
  function vaRetryOk() { return !va.err || Date.now() - va.errAt > VA_RETRY_MS; }   /* after a failure, Moira reads; Nova is tried again 10 minutes on */
  function vaKey(b) { return b ? (b.id || String(b.at)) + ":" + VA_SPEECH : ""; }   /* which briefing, read by which rules, the audio belongs to */
  function vaFree() { (va.urls || []).forEach(function (u) { URL.revokeObjectURL(u); }); va.urls = null; va.at = ""; }
  function vaUse(k, blobs) { vaFree(); va.at = k; va.urls = blobs.map(function (x) { return URL.createObjectURL(x); }); }
  function vaReady(b) { return !!(b && va.urls && va.at === vaKey(b)); }
  function b64Blob(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: "audio/mpeg" }); }
  function describeVoice(err) {
    var c = err && err.code;
    return c === "voice_unauthorized" ? "OpenAI didn't accept the key (OPENAI_API_KEY in the bridge's Script Properties)" : c === "voice_no_credit" ? "the OpenAI credit is used up" :
      c === "voice_busy" ? "OpenAI is busy right now" : c === "voice_daily_cap" ? "today's 30 voice requests are used" : c === "voice_not_configured" ? "the bridge has no OPENAI_API_KEY" : describe(err);
  }
  /* This briefing's audio: from this iPad if it's here, else from the bridge. Resolves true when ready. */
  function vaLoad(b) {
    if (!b || !canVoice()) return Promise.resolve(false);
    if (vaReady(b)) return Promise.resolve(true);
    var k = vaKey(b);
    if (va.busy === k && va.p) return va.p;
    va.busy = k; va.err = "";
    va.p = vaGet().then(function (rec) {
      if (rec && rec.at === k && rec.clips && rec.clips.length) { vaUse(k, rec.clips); vaLog("Briefing audio from this iPad: " + rec.clips.length + " clips"); return true; }
      var texts = vaTexts(b), t0 = Date.now();
      vaLog("Asking the bridge for the briefing in Nova: " + texts.length + " clips");
      return apiPost({ action: "speak", texts: texts }, VA_TIMEOUT_MS, true).then(function (j) {
        var cl = j.clips || [], kb = Math.round(cl.reduce(function (n, c) { return n + c.length * 0.75; }, 0) / 1024);
        vaLog("Bridge answered in " + Math.round((Date.now() - t0) / 100) / 10 + " s: " + cl.length + " clips, " + kb + " KB, " + (cl.length ? vaSig(cl[0]) : "no audio"));
        if (j.spend) lsSet(LS_VOICESPEND, j.spend);
        if (!br.b || vaKey(br.b) !== k) return false;   /* a newer briefing came in meanwhile */
        var blobs = (j.clips || []).map(b64Blob);
        vaUse(k, blobs); vaPut({ at: k, clips: blobs });
        return true;
      });
    }).catch(function (err) {
      va.err = err && err.name === "AbortError" ? "it took over " + VA_TIMEOUT_MS / 60000 + " minutes" : describeVoice(err); va.errAt = Date.now();
      vaLog("Briefing audio failed: " + (err && err.name === "AbortError" ? "no answer in " + VA_TIMEOUT_MS / 60000 + " minutes" : vaErrText(err)));
      return false;
    }).then(function (ok) {
      if (va.busy === k) { va.busy = ""; va.p = null; }
      return ok;
    });
    return va.p;
  }
  function vaEl() {
    if (va.el) return va.el;
    va.el = new Audio();
    vaLog("This iPad can play MP3: " + (va.el.canPlayType("audio/mpeg") || "no"));
    va.el.addEventListener("ended", function () { if (va.el.src.indexOf("blob:") === 0) vaNext(); });
    va.el.addEventListener("error", function () { if (va.el.src.indexOf("blob:") === 0) vaLog("Player error: MediaError " + (va.el.error ? va.el.error.code + " " + (va.el.error.message || "") : "?")); if (br.speaking && va.el.src.indexOf("blob:") === 0) { briefQuiet(); toast("The AI voice couldn't play. Tap READ IT TO ME again for Moira."); va.err = "it couldn't play"; render(true); } });
    return va.el;
  }
  function vaPlay(i) {
    var el = vaEl();
    va.i = i; br.say = i;
    el.src = va.urls[i];
    var pr = el.play();
    if (pr && pr.then) pr.then(function () { if (i === 0) vaLog("Playing the briefing in Nova"); });
    if (pr && pr.catch) pr.catch(function (e) { vaLog("Player refused clip " + (i + 1) + ": " + (e && e.name) + " " + (e && e.message || "")); if (br.speaking && va.i === i) { briefQuiet(); va.err = "the iPad didn't let it play"; toast("The AI voice couldn't start. Tap READ IT TO ME again for Moira."); render(true); } });
    if (state.screen === "bridge") render(true);
  }
  function vaNext() {
    if (!br.speaking) return;
    if (va.urls && va.i + 1 < va.urls.length) vaPlay(va.i + 1);
    else { br.speaking = false; br.say = -1; va.i = -1; if (state.screen === "bridge") render(true); }
  }
  function vaSay() {
    br.typeT0 = 0;
    var el = vaEl(), b = br.b;
    try { speechSynthesis.cancel(); } catch (e) { /* no iPad voice was speaking */ }
    br.speaking = true;
    if (vaReady(b)) { vaPlay(0); return; }
    el.src = VA_SILENT; var pr = el.play(); if (pr && pr.catch) pr.catch(function () { /* unlocked or not, the real clip tries */ });
    va.prep = true; br.say = -1; render(true);
    vaLoad(b).then(function (ok) {
      va.prep = false;
      if (!br.speaking || br.b !== b) return;
      if (ok) vaPlay(0);
      else { br.speaking = false; toast("The AI voice isn't available (" + va.err + "). Tap READ IT TO ME again for Moira."); render(true); }
    });
  }
  /* TEST AI VOICE in Systems: one line, not kept. */
  function vaTest() {
    var el = vaEl(), t0 = Date.now();
    el.src = VA_SILENT; var pr = el.play();
    if (pr && pr.then) pr.then(function () { vaLog("Player unlocked by the tap"); }, function (e) { vaLog("Unlock refused: " + (e && e.name) + " " + (e && e.message || "")); });
    vaLog("TEST AI VOICE: asking the bridge for one line");
    toast("Asking OpenAI for a test line…");
    apiPost({ action: "speak", texts: ["Good morning, Captain. This is Nova, reading your briefing."] }, 60000).then(function (j) {
      if (j.spend) lsSet(LS_VOICESPEND, j.spend);
      var c = (j.clips || [])[0];
      vaLog("Bridge answered in " + Math.round((Date.now() - t0) / 100) / 10 + " s: " + (c ? Math.round(c.length * 0.75 / 1024) + " KB, " + vaSig(c) : "no audio"));
      if (!c) return;
      el.src = URL.createObjectURL(b64Blob(c));
      var p2r = el.play();
      if (p2r && p2r.then) p2r.then(function () { vaLog("Playing the test line"); }, function (e) { vaLog("Player refused the test line: " + (e && e.name) + " " + (e && e.message || "")); toast("The iPad didn't play it: " + (e && e.name)); });
    }).catch(function (err) { vaLog("Test failed: " + vaErrText(err)); toast("Test failed: " + describeVoice(err)); });
  }
  function vaLine() {
    if (state.caps.indexOf("voice") < 0) return '<div class="br-voice"><small class="muted">AI voice: off. Add OPENAI_API_KEY to the Google bridge\'s Script Properties and update it to 1.30 to read the briefing in Nova.</small></div>';
    var off = !!lsGet(LS_VOICEOFF), sp = lsGet(LS_VOICESPEND), mo = ymd(new Date()).slice(0, 7);
    return '<div class="br-voice"><small class="muted">AI voice: ' + (off ? "off; Moira reads it." : "Nova (OpenAI), prepared when the briefing compiles, under 1¢ a day." +
      (sp && sp.month === mo ? " About " + money(sp.usd) + " this month (estimated; the OpenAI dashboard has the exact figure)." : "")) +
      '</small> <button type="button" class="chip sm" data-brief="' + (off ? "von" : "voff") + '">' + (off ? "TURN ON" : "TURN OFF") + "</button>" +
      (off ? "" : ' <button type="button" class="chip sm" data-brief="aitest">TEST AI VOICE</button>') + "</div>" +
      (va.log.length ? '<div class="br-diag" aria-label="Voice log"><b>VOICE LOG · THIS SESSION</b>' + va.log.map(esc).join("<br>") + "</div>" : "");
  }
  function briefClick(b) {
    if (b.dataset.vtest) {
      var vs = []; try { vs = speechSynthesis.getVoices() || []; } catch (e) { /* none */ }
      briefTestSay(vs.filter(function (x) { return (x.voiceURI || x.name) === b.dataset.vtest; })[0] || null);
      return true;
    }
    var d = b.dataset.brief;
    if (!d) return false;
    if (d === "newsoff" || d === "newson") { if (d === "newsoff") lsSet(LS_NEWSOFF, true); else lsDel(LS_NEWSOFF); render(true); return true; }
    if (d === "off" || d === "on") { if (d === "off") { lsSet(LS_BRIEFOFF, true); briefQuiet(); } else lsDel(LS_BRIEFOFF); render(true); return true; }
    if (d === "say") { if (br.b) briefSay(); return true; }
    if (d === "test") { briefTestSay(briefVoice()); return true; }
    if (d === "aitest") { vaTest(); return true; }
    if (d === "voff" || d === "von") { if (d === "voff") { lsSet(LS_VOICEOFF, true); briefQuiet(); } else { lsDel(LS_VOICEOFF); va.err = ""; } render(true); return true; }
    if (d === "again" || d === "now") { if (!br.busy) briefCompile(true); return true; }
    if (!br.b) return true;
    if (d === "fold") { briefQuiet(); br.typeT0 = 0; br.showOld = false; if (briefToday()) { br.b.fold = true; briefSave(); } render(true); return true; }
    if (d === "open") { if (briefToday()) { br.b.fold = false; briefSave(); } else br.showOld = true; render(true); return true; }
    return false;
  }

