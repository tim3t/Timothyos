  /* ---------- Bridge API ---------- */
  /* Google answers in two steps (script, then a result page). The second step
     occasionally returns a 404 or an HTML error page even though the script ran
     fine. Those are retried, and so are dropped connections. Every bridge action
     is safe to repeat: reads, and writes that carry a unique ID or set a field
     to a fixed value. */
  var RETRY_DELAYS = [700, 1800, 4000];
  var MAX_PARALLEL = 2;                 /* bridge requests at once; more just queue inside Google */
  function transient(err) {
    var code = err && err.code;
    /* no_key: Google delivered the request without its details (a redirect turned it into an empty GET);
       key_unreadable: Google's settings store answered empty for a moment. Neither is a wrong key. */
    return code === "http_404" || code === "bad_json" || /^http_5/.test(code || "") || code === "no_key" || code === "key_unreadable" || code === "notion_busy" || code === "busy" || (!!err && err.name === "TypeError");
  }
  /* iPadOS cuts off requests when the screen locks or you switch apps. */
  var lastHidden = 0;
  document.addEventListener("visibilitychange", function () { if (document.hidden) lastHidden = Date.now(); });
  function waitVisible() {
    return new Promise(function (res) {
      if (!document.hidden) { res(); return; }
      var f = function () { if (!document.hidden) { document.removeEventListener("visibilitychange", f); res(); } };
      document.addEventListener("visibilitychange", f);
    });
  }
  function withRetry(run) {
    var attempt = 0, paused = 0;
    function proceed() {
      var started = Date.now();
      return run().catch(function (err) {
        /* Cut off by the iPad going to sleep or to another app: try again once it's back. */
        if (isNetworkError(err) && (document.hidden || lastHidden >= started) && paused < 3) { paused++; markRetried(err); return waitVisible().then(proceed); }
        if (navigator.onLine === false || !transient(err) || attempt >= RETRY_DELAYS.length) throw err;
        markRetried(err);
        var wait = RETRY_DELAYS[attempt++];
        return new Promise(function (res) { setTimeout(res, wait); }).then(proceed);
      });
    }
    return proceed();
  }
  /* Run at most MAX_PARALLEL requests at once; the rest wait their turn. */
  var active = 0, waiting = [];
  function slot(fn) {
    return new Promise(function (res, rej) {
      waiting.push(function () {
        active++;
        fn().then(res, rej).then(function () {
          active--;
          if (waiting.length) waiting.shift()();
        });
      });
      if (active < MAX_PARALLEL) waiting.shift()();
    });
  }
  /* A short log of recent requests, shown in Systems, to tell slow from dropped from refused. */
  var netlog = lsGet(LS_NETLOG) || [];
  function logged(action, started, p) {
    return p.then(function (j) { note(action, started, "ok"); netDay(started, false); return j; }, function (err) {
      var r = err && err.name === "AbortError" ? "timeout" : err && err.name === "TypeError" ? "dropped" : (err && err.code) || "error";
      var bg = document.hidden || lastHidden >= started ? " · in background" : "";
      if (err && typeof err === "object") { err.netEntry = note(action, started, r + bg); err.errEntry = errLog("bridge", action || "?", r + bg, (err.message && err.message !== r ? err.message + " · " : "") + ((Date.now() - started) / 1000).toFixed(1) + " s"); }
      netDay(started, true);
      throw err;
    });
  }
  function note(action, started, result) {
    var n = { t: started, a: action || "?", ms: Date.now() - started, r: result };
    netlog.push(n);
    netlog = netlog.slice(-30);
    lsSet(LS_NETLOG, netlog);
    return n;
  }
  /* 2.58: something the Content-Security-Policy (index.html) blocked shows in SYSTEMS → NETWORK, so a service missing from its list is found. */
  document.addEventListener("securitypolicyviolation", function (e) {
    var to = String(e.blockedURI || "inline").replace(/^(https?:\/\/[^\/?#]+).*$/, "$1");
    note("blocked by the page's rules: " + (e.effectiveDirective || e.violatedDirective || "?"), Date.now(), "blocked · " + to);
    errLog("rules", "blocked: " + (e.effectiveDirective || e.violatedDirective || "?"), to);
  });
  /* A failed attempt that is tried again isn't a failure yet: the log shows it as RETRIED. */
  function markRetried(err) { if (err && err.netEntry) { err.netEntry.retried = true; lsSet(LS_NETLOG, netlog); } if (err && err.errEntry) { err.errEntry.rt = (err.errEntry.rt || 0) + 1; lsSet(LS_ERRLOG, errlog); } }

  /* ---------- ERROR LOG (2.62, Timothy: "the last 30 calls list moves quickly and if failures occur they disappear
     without us being able to truly triage") ----------
     Every failure kept on this iPad until cleared, in SYSTEMS → ERROR LOG: bridge requests that failed (retried ones
     too), page script errors, what the page's rules blocked, HOLODECK and AUDIO playback (Safari's own error code and
     message), LEVEL stepping aside. 200 lines at most, 30 days. The same failure again within 10 minutes adds to its
     count (×n) instead of a line, so a burst can't push the history out. Never data: action names, codes, Safari's
     messages, and for playback the file's name (kept only here); keys, tokens and PINs are scrubbed out (errScrub).
     COPY REPORT puts it all on the clipboard, with versions, to paste to Claude. Left out of backups. */
  var LS_ERRLOG = "tos.errlog.v1", LS_NETDAY = "tos.netday.v1";
  var errlog = lsGet(LS_ERRLOG) || [], errView = { f: "all", all: false, clr: 0 };
  var ERR_SRC = { bridge: "BRIDGE", holodeck: "HOLODECK", audio: "AUDIO", engineering: "ENGINEERING", page: "PAGE", rules: "PAGE RULES", voice: "VOICE" };
  function errScrub(x) {
    return String(x == null ? "" : x).replace(/([?&#](?:k|key|pin|token|code|auth)=)[^&\s"']+/gi, "$1•••").replace(/(Bearer\s+)\S+/gi, "$1•••").replace(/[A-Za-z0-9_\-]{32,}/g, "•••").slice(0, 400);
  }
  function errLog(src, what, msg, detail) {
    var now = Date.now(), a = errScrub(what), m = errScrub(msg), d = errScrub(detail), hit = null;
    errlog = errlog.filter(function (e) { return now - (e.l || e.t) < 30 * 864e5; });
    for (var i = errlog.length - 1; i >= 0 && i >= errlog.length - 10; i--) { var e = errlog[i]; if (e.s === src && e.a === a && e.m === m && now - (e.l || e.t) < 600000) { hit = e; break; } }
    if (hit) { hit.n = (hit.n || 1) + 1; hit.l = now; if (d) hit.d = d; errlog.splice(errlog.indexOf(hit), 1); errlog.push(hit); }
    else { hit = { t: now, s: src, a: a, m: m, d: d, v: VERSION, n: 1 }; errlog.push(hit); }
    if (errlog.length > 200) errlog = errlog.slice(-200);
    lsSet(LS_ERRLOG, errlog);
    if (state.screen === "systems") { clearTimeout(errView.pt); errView.pt = setTimeout(errPaint, 300); }
    return hit;
  }
  function netDay(started, bad) {   /* today's bridge requests on this iPad: a runaway loop or a bad day shows here */
    var k = ymd(new Date()), x = lsGet(LS_NETDAY); if (!x || x.d !== k) x = { d: k, n: 0, f: 0, max: 0 };
    x.n++; if (bad) x.f++;
    if (!document.hidden && !(lastHidden >= started)) x.max = Math.max(x.max, Date.now() - started);   /* 2.68: a request open while the iPad slept isn't "slow" */
    lsSet(LS_NETDAY, x);
  }
  window.addEventListener("error", function (e) { if (e && e.message) errLog("page", "script error", e.message, (e.filename ? String(e.filename).replace(/[?#].*$/, "").replace(/^.*\//, "") : "?") + ":" + (e.lineno || 0) + ":" + (e.colno || 0)); });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason; if (r && (r.errEntry || r.netEntry)) return;   /* a bridge failure, already logged */
    errLog("page", "unhandled promise", r ? r.message || r.code || r.name || String(r) : "no reason", r && r.name && r.message ? r.name : "");
  });
  function errWhen(ms) { var d = new Date(ms); return MON[d.getMonth()].slice(0, 3).toUpperCase() + " " + d.getDate() + " · " + hm(d) + ":" + p2(d.getSeconds()); }
  function errList() { return errlog.filter(function (e) { return errView.f === "all" || e.s === errView.f; }).slice().reverse(); }
  function errSection() {
    var day = lsGet(LS_NETDAY), today = day && day.d === ymd(new Date()) ? day : null, now = Date.now();
    var recent = errlog.filter(function (e) { return now - (e.l || e.t) < 864e5; }).length;
    var srcs = Object.keys(ERR_SRC).filter(function (k) { return errlog.some(function (e) { return e.s === k; }); });
    if (errView.f !== "all" && srcs.indexOf(errView.f) === -1) errView.f = "all";
    var list = errList(), shown = errView.all ? list : list.slice(0, 25);
    var h = '<section id="sec-errlog">' + phead("ERROR LOG", errlog.length ? (recent ? recent + " IN 24 H · " : "") + errlog.length + " KEPT" : "NOTHING LOGGED", errlog.some(function (e) { return now - (e.l || e.t) < 864e5 && !(e.s === "bridge" && e.rt >= e.n); }) ? "bad" : "") +
      '<p class="el-day tnum">' + (today ? "<b>BRIDGE TODAY</b> " + today.n + (today.n === 1 ? " request" : " requests") + " · " + (today.f ? '<span class="errtxt">' + today.f + " failed</span>" : "none failed") + " · slowest " + (today.max / 1000).toFixed(1) + " s" : "<b>BRIDGE TODAY</b> no requests yet") + "</p>";
    if (srcs.length > 1) h += '<div class="el-f" role="group" aria-label="Show">' + ["all"].concat(srcs).map(function (k) { return '<button type="button" class="chip" data-elf="' + k + '" aria-pressed="' + (errView.f === k) + '">' + (k === "all" ? "ALL" : ERR_SRC[k]) + "</button>"; }).join("") + "</div>";
    h += '<div class="el-list" id="errList">' + (shown.length ? shown.map(function (e) {
      var allRetried = e.s === "bridge" && e.rt >= e.n;
      return '<div class="el-row' + (allRetried ? " soft" : "") + '"><span class="el-t tnum">' + errWhen(e.t) + (e.l && e.n > 1 ? " → " + hm(new Date(e.l)) : "") + '</span><span class="pill' + (allRetried ? "" : " bad") + '">' + (ERR_SRC[e.s] || esc(String(e.s).toUpperCase())) + "</span>" +
        '<span class="el-m"><b>' + esc(e.a) + "</b> " + esc(e.m) + (e.n > 1 ? ' <span class="el-n">×' + e.n + "</span>" : "") + (e.rt ? ' <span class="warntxt">' + (allRetried ? "ALL RETRIED" : e.rt + " RETRIED") + "</span>" : "") + (e.d ? "<small>" + esc(e.d) + (e.v && e.v !== VERSION ? " · app " + esc(e.v) : "") + "</small>" : e.v && e.v !== VERSION ? "<small>app " + esc(e.v) + "</small>" : "") + "</span></div>";
    }).join("") : '<p class="muted">Nothing has failed' + (errView.f === "all" ? "" : " here") + " since the log was last cleared.</p>") + "</div>";
    if (list.length > shown.length) h += '<button type="button" class="btn ghost" data-act="errall">SHOW ALL ' + list.length + "</button>";
    h += '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn" data-act="errcopy"' + (errlog.length ? "" : " disabled") + '>COPY REPORT</button>' +
      '<button type="button" class="btn ghost" data-act="errclear"' + (errlog.length ? "" : " disabled") + ">" + (now - errView.clr < 4000 ? "TAP AGAIN TO CLEAR" : "CLEAR") + "</button></div>" +
      '<small class="muted">Kept on this iPad for 30 days (200 lines at most), never in backups or sent anywhere. Each line: when, where, what failed and the reason. ×3 means the same failure three times within 10 minutes; RETRIED means Bridge tried again on its own (dimmed when every one was). COPY REPORT copies it all with the app and bridge versions, to paste into a message to Claude.</small></section>';
    return h;
  }
  function errPaint() { var s = $("sec-errlog"); if (s && state.screen === "systems") s.outerHTML = errSection(); }
  function errReport() {
    var day = lsGet(LS_NETDAY);
    return ["TimothyOS ERROR LOG · copied " + new Date().toISOString(), "App " + VERSION + " · bridge " + (state.bridgeVersion || "unknown") + " · " + errScrub(navigator.userAgent),
      day ? "Bridge on " + day.d + ": " + day.n + " requests, " + day.f + " failed, slowest " + (day.max / 1000).toFixed(1) + " s" : "", ""]
      .concat(errlog.slice().reverse().map(function (e) {
        return new Date(e.t).toISOString().replace("T", " ").slice(0, 19) + (e.n > 1 ? " (×" + e.n + ", last " + new Date(e.l).toISOString().slice(11, 19) + ")" : "") + " [" + (ERR_SRC[e.s] || e.s) + "] " + e.a + ": " + e.m + (e.rt ? " · " + e.rt + " retried" : "") + (e.d ? " · " + e.d : "") + (e.v !== VERSION ? " · app " + e.v : "");
      })).join("\n");
  }
  function errClick(b) {
    var a = b.dataset.act;
    if (b.dataset.elf) { errView.f = b.dataset.elf; errView.all = false; errPaint(); return true; }
    if (a === "errall") { errView.all = true; errPaint(); return true; }
    if (a === "errclear") { if (Date.now() - errView.clr < 4000) { errlog = []; lsSet(LS_ERRLOG, errlog); errView.clr = 0; toast("Error log cleared"); } else { errView.clr = Date.now(); setTimeout(errPaint, 4100); } errPaint(); return true; }
    if (a === "errcopy") {
      var text = errReport(), ok = function () { toast("Error log copied. Paste it into a message."); }, no = function () { toast("Couldn't copy. Try again."); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, no); else no(); } catch (e) { no(); }
      return true;
    }
    return false;
  }
  /* Requests still on their way, counting retries and pauses: REFRESH NOW spins until this is 0. */
  var netPending = 0;
  function tracked(p) { netPending++; p.then(function () { netPending--; }, function () { netPending--; }); return p; }
  /* Reads asked for at the same moment (returning to the app, REFRESH NOW) travel together as one
     request (bridge 1.13), so Google runs one execution instead of five. Fewer requests, fewer of
     Google's lost answers (HTTP 404). An older bridge doesn't know "batch": then each goes alone. */
  var BATCHABLE = ["aispend", "events", "tasks", "dates", "done", "week", "reviews", "ledger", "habits", "library", "tarot", "apiary", "meals", "year", "sciencefeeds", "sciencelog"];
  /* Google answers a batch one read after another, so a long batch keeps everything waiting.
     What's on screen first (calendars, tasks, key dates, habits) travels in one batch; the rest
     (balance, reviews, ledger, library, Ask's spend) in a second, at the same time (2.12.1). */
  var BATCH_LATER = ["aispend", "done", "week", "reviews", "ledger", "library", "tarot", "apiary", "meals"];
  var batchQ = null, batchOk = true;
  function api(params, conn) {
    if (conn || !batchOk || BATCHABLE.indexOf(params.action) === -1) return tracked(withRetry(function () { return apiOnce(params, conn); }));
    return tracked(new Promise(function (res, rej) {
      if (!batchQ) { batchQ = []; setTimeout(flushBatch, 40); }
      batchQ.push({ params: params, res: res, rej: rej });
    }));
  }
  function flushBatch() {
    var q = batchQ; batchQ = null;
    var now = q.filter(function (x) { return BATCH_LATER.indexOf(x.params.action) === -1; }), later = q.filter(function (x) { return BATCH_LATER.indexOf(x.params.action) > -1; });
    if (now.length && later.length) { sendBatch(now); sendBatch(later); } else sendBatch(q);
  }
  function sendBatch(q) {
    var alone = function (x) { withRetry(function () { return apiOnce(x.params); }).then(x.res, x.rej); };
    if (!batchOk) { q.forEach(alone); return; }
    if (q.length === 1) { alone(q[0]); return; }
    var calls = q.map(function (x) { return x.params; });
    withRetry(function () { return apiOnce({ action: "batch", calls: JSON.stringify(calls) }, null, "sync: " + calls.map(function (c) { return c.action; }).join(", "), 90000); }).then(function (j) {
      q.forEach(function (x, i) {
        var r = j.results && j.results[i];
        if (r && r.ok === true) x.res(r); else x.rej(replyError(r));
      });
    }, function (err) {
      if (err && err.code === "unknown_action") { batchOk = false; markRetried(err); q.forEach(alone); return; }   /* older bridge: each goes alone instead */
      q.forEach(function (x) { x.rej(err); });
    });
  }
  function apiPost(body, timeoutMs, own) { return tracked(withRetry(function () { return apiPostOnce(body, timeoutMs, own); })); }
  /* 2.58 (bridge 1.38): reads travel as a POST too, so the access key (and the Log's PIN) never ride in a URL, where
     Google's request logs and the browser's history would keep them. An older bridge answers a read by POST with
     unknown_action: reads to that bridge then go as GET, as before. Bridge 1.38 refuses a GET (use_post). Learned per
     bridge address from its first answer. */
  var readVia = {};
  function apiOnce(params, conn, label, timeoutMs) {
    conn = conn || state.conn;
    var url = conn.url, how = readVia[url];
    var proceed = function (m) { return m === "get" ? apiGetOnce(params, conn, label, timeoutMs) : postOnce(conn, readBody(params), label || params.action, timeoutMs || 45000, false); };
    return proceed(how || "post").then(function (j) { if (!readVia[url]) readVia[url] = "post"; return j; }, function (err) {
      var code = err && err.code;
      if (!how && code === "unknown_action") {   /* an older bridge, unless the GET doesn't know it either (a read that bridge lacks) */
        readVia[url] = "get"; markRetried(err);
        return proceed("get").catch(function (e2) { if (e2 && e2.code === "unknown_action" && readVia[url] === "get") delete readVia[url]; throw e2; });
      }
      if (how === "get" && code === "use_post") { readVia[url] = "post"; markRetried(err); return proceed("post"); }   /* updated since */
      throw err;
    });
  }
  function readBody(params) { var b = {}; Object.keys(params).forEach(function (k) { b[k] = String(params[k]); }); return b; }   /* as a URL would carry them: text */
  function apiGetOnce(params, conn, label, timeoutMs) {   /* an older bridge (before 1.38) */
    var u = new URL(conn.url);
    u.searchParams.set("key", conn.key);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return slot(function () {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
      /* Plain GET with no custom headers, so Apps Script answers without a CORS preflight. */
      return logged(label || params.action, Date.now(), fetch(u.toString(), { method: "GET", redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(readReply)
        .finally(function () { if (timer) clearTimeout(timer); }));
    });
  }
  /* Writes (and, from bridge 1.38, reads) go as a POST with a plain-text JSON body (no custom headers, so no CORS preflight). */
  /* own: a long request (the AI voice, about two minutes) that runs outside the two shared slots, so syncing isn't held up behind it. */
  function apiPostOnce(body, timeoutMs, own) { return postOnce(state.conn, body, body.action, timeoutMs || 60000, own); }
  function postOnce(conn, body, label, timeoutMs, own) {
    return (own ? function (fn) { return fn(); } : slot)(function () {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
      return logged(label, Date.now(), fetch(conn.url, { method: "POST", body: JSON.stringify(Object.assign({ key: conn.key }, body)), redirect: "follow", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then(readReply)
        .finally(function () { if (timer) clearTimeout(timer); }));
    });
  }
  function readReply(r) {
    if (!r.ok) { var e = new Error("http_" + r.status); e.code = "http_" + r.status; throw e; }
    return r.text().then(function (txt) {
      var j;
      try { j = JSON.parse(txt); } catch (x) { var e1 = new Error("bad_json"); e1.code = "bad_json"; throw e1; }
      if (!j || j.ok !== true) throw replyError(j);
      return j;
    });
  }
  function replyError(j) {
    var e2 = new Error((j && j.error) || "bad_response");
    e2.code = (j && j.error) || "bad_response"; e2.detail = j && j.detail; e2.spend = j && j.spend; e2.left = j && j.left; e2.until = j && j.until;
    return e2;
  }
  function isNetworkError(err) { return !!err && (err.name === "TypeError" || err.name === "AbortError"); }
  function describe(err) {
    var code = err && (err.code || err.message);
    if (code === "unauthorized") return "The access key doesn't match. Copy it again from the Apps Script log (run setup).";
    if (code === "no_key") return "Google delivered the request without its details, even after retrying. Usually temporary; try again in a moment.";
    if (code === "key_unreadable") return "Google's settings store didn't answer, even after retrying. Usually temporary; try again in a moment.";
    if (code === "server_error") return "The script hit an error: " + (err.detail || "unknown") + ".";
    if (code === "busy") return "The bridge was busy with another request, even after retrying. It will try again on its own.";
    if (code === "bad_json") return "Google sent an error page instead of data, even after retrying. Usually temporary. If it persists, check that the URL ends in /exec.";
    if (code === "http_404") return "Google's servers didn't return the result (HTTP 404), even after retrying. Usually temporary; try Refresh in a minute.";
    if (code === "unknown_action") return "The script is out of date. Deploy a new version of the latest Code.gs." + bridgeNote();
    if (code === "use_post") return "The bridge takes requests only by POST now (1.38). Reload Bridge to update it.";
    if (code === "bad_request" && bridgeBehind()) return "The bridge refused it." + bridgeNote();
    if (/^http_/.test(code || "")) return "The script answered with " + code.replace("http_", "HTTP ") + ". Check the deployment.";
    if (err && err.name === "AbortError") return "Google took too long to answer, even after retrying. Usually temporary.";
    if (isNetworkError(err)) return navigator.onLine === false ? "No connection. Showing saved data." : "Couldn't reach the script, even after retrying. If this keeps happening, check that the URL ends in /exec and access is set to Anyone.";
    return "Sync failed (" + esc(code) + ").";
  }

