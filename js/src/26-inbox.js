  /* ---------- INBOX (2.41, bridge 1.33): notes captured to sort later ---------- */
  /* CAPTURE → NOTE saves a thought to 📥 Inbox in Notion through the capture queue (so it waits on the iPad offline).
     INBOX lists the waiting notes, oldest first. Each sorts into a TASK, KEY DATE, EVENT or the Replicator QUEUE through
     a form filled in from the note, or KEEP holds it as it is (the KEPT tab). The task, date, event or queue item is made
     with the app's own saves; then the note is marked Sorted with what it became (Notion keeps it as the record). ✕ asks
     twice, then moves the note to Notion's trash. Marks wait on the iPad until the bridge takes them (tos.inboxq.v1).
     SUGGEST SORTING: Sonnet proposes a place for each waiting note (ask mode "sort"); nothing is saved until CONFIRM,
     and CHANGE opens the form filled in. The Bridge shows INBOX · N under Condition while notes wait; Condition never
     counts them. Timothy confirmed all of this from the mockup, QUEUE included. */
  var LS_INBOX = "tos.inbox.v1", LS_INBOXQ = "tos.inboxq.v1";
  var IB_KINDS = { task: "TASK", date: "KEY DATE", event: "EVENT", queue: "QUEUE", keep: "KEEP" };
  var IB_COLORS = { task: "personal", date: "chrome-b", event: "work", queue: "chrome-d", keep: "chrome-b" };
  var IB_ASK = "Suggest where each note in the inbox belongs.";
  var ib = { data: lsGet(LS_INBOX), q: lsGet(LS_INBOXQ) || {}, inflight: false, err: null, tab: "waiting", open: null, armed: null, sug: {}, sugBusy: false, sugErr: "", busy: {}, flushing: false };
  function canInbox() { return state.caps.indexOf("inbox") > -1; }
  function canInboxSort() { return state.caps.indexOf("inboxsort") > -1 && canAsk(); }
  function ibSave() { lsSet(LS_INBOX, ib.data); }
  function ibQueued() { return state.queue.filter(function (q) { return q.kind === "note"; }); }
  function ibWaiting() { return ((ib.data && ib.data.waiting) || []).filter(function (n) { return !ib.q[n.id]; }); }
  function ibKept() { return ((ib.data && ib.data.kept) || []).filter(function (n) { return !ib.q[n.id] || ib.q[n.id].status === "kept"; }); }
  function ibCount() { return ibWaiting().length + ibQueued().length; }
  function ibNote(id) { return ((ib.data && ib.data.waiting) || []).concat((ib.data && ib.data.kept) || []).filter(function (n) { return n.id === id; })[0]; }
  function inboxErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "notion_not_shared") return "Notion won't share the Inbox with the bridge yet. In Notion open 📥 Inbox → ••• → Connections → add TimothyOS bridge, then REFRESH.";
    if (code === "unknown_action") return "The bridge is out of date. Update the Google bridge to 1.33 (README: Updating the Google bridge).";
    return describe(err);
  }
  function loadInbox(force) {
    if (!state.conn || !canInbox() || ib.inflight) return;
    if (!force && ib.data && Date.now() - ib.data.fetched < 120000) return;
    if (!force && ib.err && !ib.err.write && Date.now() - ib.err.at < FRESH_MS) return;
    ib.inflight = true;
    api({ action: "inbox" }).then(function (j) {
      ib.data = { fetched: Date.now(), waiting: j.waiting || [], kept: j.kept || [], url: j.url || "" };
      if (!ib.err || !ib.err.write) ib.err = null;
      ibSave(); flushInbox();
    }).catch(function (err) { ib.err = { at: Date.now(), msg: inboxErrText(err) }; })
      .then(function () { ib.inflight = false; if (state.screen === "inbox" || state.screen === "bridge") render(true); cmdFresh(); });
  }
  /* Marks (sorted, kept, removed), one at a time, oldest first; kept until the bridge takes them. */
  function flushInbox() {
    if (ib.flushing || !state.conn || !canInbox()) return;
    var ids = Object.keys(ib.q); if (!ids.length) return;
    var id = ids[0], m = ib.q[id];
    ib.flushing = true;
    apiPost(m.remove ? { action: "inboxremove", id: id } : { action: "inboxset", id: id, status: m.status, as: m.as || null }).then(function () {
      if (ib.q[id] === m) delete ib.q[id];
      ib.err = null;
    }).catch(function (err) {
      if (err && err.code === "not_writable") { delete ib.q[id]; return; }   /* already gone from the Inbox */
      ib.err = { at: Date.now(), msg: inboxErrText(err), write: true };
      clearTimeout(ib.timer); ib.timer = setTimeout(flushInbox, 30000);
    }).then(function () {
      lsSet(LS_INBOXQ, ib.q); ib.flushing = false;
      if (!ib.err || !ib.err.write) flushInbox();
      if (state.screen === "inbox") render(true);
    });
  }
  function ibMark(n, status, as) {
    ib.q[n.id] = status === "remove" ? { remove: true } : { status: status, as: as || null };
    lsSet(LS_INBOXQ, ib.q);
    if (ib.data) {
      ib.data.waiting = ib.data.waiting.filter(function (x) { return x.id !== n.id; });
      ib.data.kept = ib.data.kept.filter(function (x) { return x.id !== n.id; });
      if (status === "kept") ib.data.kept.unshift(Object.assign({}, n, { status: "kept" }));
      if (status === "new") ib.data.waiting.push(Object.assign({}, n, { status: "new" }));
      ibSave();
    }
    delete ib.sug[n.id];
    if (ib.open && ib.open.id === n.id) ib.open = null;
    flushInbox();
  }
  /* The lists the forms and Claude choose from: Notion's own names. */
  function ibAreas() { return (state.dates && state.dates.areas && state.dates.areas.length ? state.dates.areas : (state.tasks[ymd(new Date())] || {}).areas) || []; }
  function ibPris() { return (state.tasks[ymd(new Date())] || {}).priorities || Object.keys(PRI_RANK); }
  function ibTypes() { return (state.dates && state.dates.types) || []; }
  function ibCals() { return ["personal"].concat(WRITABLE.indexOf("farm") > -1 ? ["farm"] : [], WRITABLE.indexOf("hobby") > -1 ? ["hobby"] : []); }
  function ibDay(at) { var d = at ? new Date(at) : null; return d && !isNaN(d) ? DOW[d.getDay()] + " " + p2(d.getDate()) + " " + MON[d.getMonth()] + " · " + hm(d) : ""; }
  function ibDefaults(n, kind) {
    var t = String(n.text || "").replace(/\s+/g, " ").trim();
    return { title: t.slice(0, kind === "queue" ? 120 : 200), life: null, pri: null, due: null, date: null, type: null, yearly: false, area: "personal", day: ymd(new Date()), time: "09:00", mins: 60, cost: null };
  }

  /* ---- the screen ---- */
  function inboxHead() {
    var n = ibCount();
    return { e: "CAPTURE · " + (!ib.data && !n ? "NOTION" : n ? n + " WAITING" : "ALL SORTED"), t: "INBOX" };
  }
  function renderInbox() {
    loadInbox(false); loadDates(false); if (canPlan()) loadTasks(ymd(new Date()), false);
    if (!canInbox()) { $("content").innerHTML = '<div class="ib">' + phead("INBOX", "SETUP") + stubBox(state.conn ? "Needs the Google bridge updated and the 📥 Inbox database connected to the TimothyOS integration in Notion (••• → Connections). Steps are in the README under <b>Connect Notion</b>." : "Link calendars first.") + "</div>"; return; }
    var w = ibWaiting(), qd = ibQueued(), k = ibKept(), list = ib.tab === "kept" ? k : w, html = '<div class="ib">';
    html += '<div class="ib-tools"><div class="ib-tabs"><button type="button" class="chip" data-ibtab="waiting" aria-pressed="' + (ib.tab === "waiting") + '" style="--c: var(--chrome-c)">WAITING <span class="tnum">' + (w.length + qd.length) + "</span></button>" +
      '<button type="button" class="chip" data-ibtab="kept" aria-pressed="' + (ib.tab === "kept") + '">KEPT <span class="tnum">' + k.length + "</span></button></div>" +
      '<div class="ib-tabs"><button type="button" class="btn sm capture" data-ib="note">+ NOTE</button>' +
      (ib.tab === "waiting" && w.length && canInboxSort() ? '<button type="button" class="btn sm ask" data-ib="suggest"' + (ib.sugBusy || navigator.onLine === false ? " disabled" : "") + ">" + (ib.sugBusy ? "SUGGESTING…" : "SUGGEST SORTING") + "<small>CLAUDE · ABOUT 1¢</small></button>" : "") + "</div></div>";
    if (ib.sugErr) html += '<div class="err">' + esc(ib.sugErr) + "</div>";
    if (ib.err) html += '<div class="' + (ib.err.write ? "err" : "empty") + '">' + esc(ib.err.msg) + (ib.err.write ? " Kept on this iPad; it tries again on its own." : "") + "</div>";
    if (ib.tab === "waiting" && Object.keys(ib.sug).length) html += '<div class="ib-sugbar"><b>SUGGESTED</b><span>Nothing is saved until you tap CONFIRM. CHANGE opens the form, filled in.</span></div>';
    if (!ib.data && !ib.err) html += '<div class="empty">Loading the Inbox from Notion…</div>';
    else {
      html += '<div class="ib-notes">';
      if (ib.tab === "waiting") html += qd.map(function (q) {
        return '<article class="ib-note queued"><span class="st"></span><div class="in"><div class="tx">' + esc(q.text || q.title) + '</div><div class="meta"><span>CAPTURED ' + esc(ibDay(q.at)) + '</span><span class="pill">' + (q.failed ? "NOT SAVED · SYSTEMS → CAPTURE" : "QUEUED · SAVES WHEN ONLINE") + "</span></div></div></article>";
      }).join("");
      html += list.map(ibNoteHtml).join("");
      if (!list.length && !(ib.tab === "waiting" && qd.length)) html += '<div class="empty">' + (ib.tab === "waiting" ? "Inbox clear. CAPTURE → NOTE drops a thought here to sort later." : "Nothing kept yet. KEEP holds a note here as it is.") + "</div>";
      html += "</div>";
      if (ib.tab === "kept" && k.length) html += '<small class="muted">COMPUTER finds kept notes too: type a word from one.</small>';
      if (ib.data && ib.data.url) html += '<div class="btnrow"><a class="btn ghost sm" href="' + esc(ib.data.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a></div>';
    }
    $("content").innerHTML = html + "</div>";
  }
  function ibNoteHtml(n) {
    var kept = n.status === "kept", open = ib.open && ib.open.id === n.id, sug = ib.sug[n.id], busy = ib.busy[n.id];
    var h = '<article class="ib-note' + (kept ? " kept" : "") + '" id="ibn-' + esc(n.id) + '"><span class="st"></span><div class="in"><div class="tx">' + esc(n.text) + "</div>" +
      '<div class="meta"><span>' + (kept ? "KEPT · " : "") + "CAPTURED " + esc(ibDay(n.at)) + "</span>" + (busy ? '<span class="pill">SAVING…</span>' : "") + "</div>";
    if (sug && !open && !kept) h += ibPropHtml(n, sug);
    if (open) h += ibFormHtml(n, ib.open.kind, ib.open.v);
    else if (!busy) h += '<div class="ib-sort">' + (kept ? '<button type="button" class="chip" data-ibback="' + esc(n.id) + '">SORT IT NOW</button>' :
      ["task", "date", "event", "queue", "keep"].map(function (kd) { return '<button type="button" class="chip" data-ibkind="' + kd + '" data-ibid="' + esc(n.id) + '"' + ibKindOff(kd) + ">" + IB_KINDS[kd] + "</button>"; }).join("")) +
      '<button type="button" class="chip ib-del' + (ib.armed === n.id ? " armed" : "") + '" data-ibdel="' + esc(n.id) + '" aria-label="Delete this note">' + (ib.armed === n.id ? "DELETE IT" : "✕") + "</button></div>";
    return h + "</div></article>";
  }
  function ibKindOff(kd) { return (kd === "task" && !canPlan()) || (kd === "date" && !canDates()) || (kd === "event" && !canCreate()) || (kd === "queue" && !canQueue()) ? " disabled" : ""; }
  function ibLine(kind, v) {
    if (kind === "task") return [v.life ? bare(v.life) : "", v.pri ? bare(v.pri) + " priority" : "", v.due ? "due " + shortDay(v.due) : ""].filter(Boolean).join(" · ");
    if (kind === "date") return [v.date ? shortDay(v.date) : "", v.type ? bare(v.type) : "", v.yearly ? "every year" : ""].filter(Boolean).join(" · ");
    if (kind === "event") return AREAS[v.area].name + " · " + (v.day ? shortDay(v.day) : "") + " " + (v.time || "") + " · " + v.mins + " min";
    if (kind === "queue") return "Replicator Queue" + (v.cost != null ? " · $" + v.cost : "");
    return "Kept as it is";
  }
  function ibPropHtml(n, s) {
    return '<div class="prop ib-prop" style="--c: var(--' + IB_COLORS[s.kind] + ')"><span class="st"></span><span class="tx"><small class="ib-k">SUGGESTED · ' + IB_KINDS[s.kind] + "</small><b>" + esc(s.v.title) + "</b><small>" + esc([ibLine(s.kind, s.v), s.why].filter(Boolean).join(" · ")) + "</small></span>" +
      '<span class="btnrow"><button type="button" class="btn ghost sm" data-ibskip="' + esc(n.id) + '">SKIP</button><button type="button" class="btn ghost sm" data-ibchange="' + esc(n.id) + '">CHANGE</button><button type="button" class="btn sm" data-ibok="' + esc(n.id) + '"' + ibKindOff(s.kind) + ">CONFIRM</button></span></div>";
  }
  function ibFormHtml(n, kind, v) {
    var opt = function (list, cur, blank) { return (blank ? '<option value="">' + blank + "</option>" : "") + list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === cur ? " selected" : "") + ">" + esc(bare(x)) + "</option>"; }).join(""); };
    var h = '<div class="ib-form" data-ibform="' + esc(n.id) + '"><div class="ib-dest" style="--c: var(--' + IB_COLORS[kind] + ')">' + IB_KINDS[kind] + (kind === "keep" ? "" : " · FILLED IN FROM THE NOTE") + "</div>";
    if (kind === "keep") h += '<div class="muted">Kept as it is in the Inbox, under KEPT. Sort it any time later.</div>';
    else {
      h += '<div class="frow"><span>' + (kind === "queue" ? "ITEM" : "TITLE") + '</span><input type="text" id="ibf-title" maxlength="' + (kind === "queue" ? 120 : 200) + '" value="' + esc(v.title) + '"></div>';
      if (kind === "task") {
        h += '<div class="frow"><span>AREA</span><div class="chips"><select id="ibf-life" aria-label="Life Area">' + opt(ibAreas(), v.life, "Life Area") + "</select></div></div>";
        h += '<div class="frow"><span>PRIORITY</span><div class="chips">' + ibPris().map(function (p) { return '<button type="button" class="chip" data-ibpri="' + esc(p) + '" aria-pressed="' + (p === v.pri) + '">' + esc(bare(p).toUpperCase()) + "</button>"; }).join("") + "</div></div>";
        h += '<div class="frow"><span>DUE</span><div class="chips"><input type="date" id="ibf-due" value="' + esc(v.due || "") + '" aria-label="Due date"><span class="muted">Optional</span></div></div>';
      } else if (kind === "date") {
        h += '<div class="frow"><span>DATE</span><div class="chips"><input type="date" id="ibf-date" value="' + esc(v.date || "") + '" aria-label="Date"></div></div>';
        h += '<div class="frow"><span>TYPE</span><div class="chips"><select id="ibf-life" aria-label="Life Area">' + opt(ibAreas(), v.life, "Life Area") + '</select><select id="ibf-type" aria-label="Type">' + opt(ibTypes(), v.type, "Type") + "</select>" +
          '<button type="button" class="chip" data-ibyearly aria-pressed="' + !!v.yearly + '">YEARLY</button></div></div>';
      } else if (kind === "event") {
        h += '<div class="frow"><span>AREA</span><div class="chips">' + ibCals().map(function (a) { return '<button type="button" class="chip a-' + a + '" data-ibarea="' + a + '" aria-pressed="' + (a === v.area) + '">' + esc(AREAS[a].name) + "</button>"; }).join("") + "</div></div>";
        h += '<div class="frow"><span>WHEN</span><div class="chips"><input type="date" id="ibf-day" value="' + esc(v.day || "") + '" aria-label="Day"><input type="time" id="ibf-time" value="' + esc(v.time || "09:00") + '" aria-label="Start">' +
          '<select id="ibf-mins" aria-label="Length">' + [15, 30, 45, 60, 90, 120, 180].map(function (m) { return '<option value="' + m + '"' + (m === v.mins ? " selected" : "") + ">" + (m < 60 ? m + " MIN" : m / 60 + " HR") + "</option>"; }).join("") + "</select></div></div>";
      } else if (kind === "queue") {
        h += '<div class="frow"><span>COST</span><div class="chips"><input type="text" inputmode="decimal" id="ibf-cost" value="' + (v.cost != null ? esc(v.cost) : "") + '" placeholder="$ optional" style="max-width:160px"><span class="muted">Goes to the bottom of the Replicator Queue.</span></div></div>';
      }
    }
    return h + '<div class="err" id="ibf-err" role="alert"></div><div class="btnrow ib-formbtns"><button type="button" class="btn ghost sm" data-ib="cancel">CANCEL</button><button type="button" class="btn sm" data-ibsave="' + esc(n.id) + '">' + (kind === "keep" ? "KEEP" : "SAVE " + IB_KINDS[kind]) + "</button></div></div>";
  }
  /* What the open form says, read back. */
  function ibFormValues(kind) {
    var g = function (id) { var el = $(id); return el ? el.value.trim() : ""; }, v = Object.assign({}, ib.open.v);
    if (kind === "keep") return v;
    v.title = g("ibf-title");
    if (kind === "task") { v.life = g("ibf-life") || null; var pb = document.querySelector("[data-ibpri][aria-pressed=true]"); v.pri = pb ? pb.dataset.ibpri : null; v.due = g("ibf-due") || null; }
    if (kind === "date") { v.date = g("ibf-date") || null; v.life = g("ibf-life") || null; v.type = g("ibf-type") || null; var yb = document.querySelector("[data-ibyearly]"); v.yearly = !!yb && yb.getAttribute("aria-pressed") === "true"; }
    if (kind === "event") { var ab = document.querySelector("[data-ibarea][aria-pressed=true]"); v.area = ab ? ab.dataset.ibarea : "personal"; v.day = g("ibf-day") || null; v.time = g("ibf-time") || null; v.mins = +g("ibf-mins") || 60; }
    if (kind === "queue") { var c = g("ibf-cost").replace(/^\$/, ""); v.cost = c === "" ? null : +c; }
    return v;
  }
  /* Make it: the same saves the rest of the app uses, then the note is marked Sorted (or Kept). */
  function ibApply(n, kind, v) {
    var err = function (t) { var e = $("ibf-err"); if (e) e.textContent = t; else toast(t); return false; };
    if (kind !== "keep" && !v.title) return err("Give it a title first.");
    if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v.date || "")) return err("Pick the date.");
    if (kind === "event" && (!/^\d{4}-\d{2}-\d{2}$/.test(v.day || "") || !/^\d{2}:\d{2}$/.test(v.time || ""))) return err("Pick the day and the time.");
    if (kind === "queue" && v.cost != null && !(isFinite(v.cost) && v.cost >= 0)) return err("The cost is a number, like 45 or 12.50.");
    var today = ymd(new Date());
    if (kind === "keep") { ibMark(n, "kept"); toast("Kept in the inbox"); render(true); return true; }
    if (kind === "date") {
      state.queue.push({ kind: "date", cid: newCid(), title: v.title.slice(0, 200), start: v.date, end: null, area: v.life || null, type: v.type || null, yearly: !!v.yearly, created: Date.now(), attempts: 0 });
      saveQueue(); flushQueue(true); ibMark(n, "sorted", "date"); render(true); return true;
    }
    if (kind === "event") {
      var s = parseYmd(v.day), t = v.time.split(":"); s.setHours(+t[0], +t[1], 0, 0);
      state.queue.push({ cid: newCid(), area: WRITABLE.indexOf(v.area) > -1 ? v.area : "personal", title: v.title.slice(0, 200), allDay: false, start: s.toISOString(), end: new Date(s.getTime() + Math.max(5, Math.min(600, v.mins)) * 60000).toISOString(), created: Date.now(), attempts: 0 });
      saveQueue(); flushQueue(true); ibMark(n, "sorted", "event"); render(true); return true;
    }
    ib.busy[n.id] = true; ib.open = null; render(true);
    var req = kind === "task" ? { action: "addtask", task: { cid: newCid(), title: v.title.slice(0, 200), area: v.life || null, priority: v.pri || null, day: null, due: v.due || null } }
      : { action: "queueadd", item: { cid: newCid(), title: v.title.slice(0, 120), cost: v.cost } };
    apiPost(req).then(function () {
      ibMark(n, "sorted", kind);
      toast(kind === "task" ? "Task added to your Master Task List" : "Added to the Replicator Queue");
      if (kind === "task") loadTasks(today, true);
    }).catch(function (e) { toast("Not saved: " + describeTasks(e)); ib.open = { id: n.id, kind: kind, v: v }; })
      .then(function () { delete ib.busy[n.id]; render(true); });
    return true;
  }
  /* SUGGEST SORTING: the waiting notes and Notion's own lists to Sonnet; its answer checked against those lists. */
  function ibSuggest() {
    var w = ibWaiting(); if (!w.length || ib.sugBusy) return;
    var now = new Date(), cals = ibCals().map(function (a) { return a === "hobby" ? "growth" : a; });
    var ctx = ["TODAY: " + DOWL[now.getDay()] + " " + now.getDate() + " " + MONL[now.getMonth()].charAt(0) + MONL[now.getMonth()].slice(1).toLowerCase() + " " + now.getFullYear() + " (" + ymd(now) + ").",
      "LIFE AREAS: " + ibAreas().join(" | "), "PRIORITY NAMES: " + ibPris().join(" | "), "KEY DATE TYPES: " + ibTypes().join(" | "), "CALENDARS HE CAN ADD TO: " + cals.join(", "),
      "INBOX (id: note, when captured):"].concat(w.map(function (n) { return n.id + ": " + String(n.text).replace(/\s+/g, " ") + " (" + ibDay(n.at) + ")"; })).join("\n");
    ib.sugBusy = true; ib.sugErr = ""; render(true);
    apiPost({ action: "ask", cid: newCid(), mode: "sort", messages: [{ role: "user", text: IB_ASK }], context: ctx }, 150000).then(function (j) {
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      var s = String(j.reply || ""), a = s.indexOf("{"), z = s.lastIndexOf("}"), o = null;
      try { o = a > -1 && z > a ? JSON.parse(s.slice(a, z + 1)) : null; } catch (e) { o = null; }
      var items = o && Array.isArray(o.items) ? o.items : null;
      if (!items) throw { code: "sort_shape" };
      var got = 0;
      items.forEach(function (it) { var n = w.filter(function (x) { return x.id === it.id; })[0], sg = n && ibCheck(n, it); if (sg) { ib.sug[n.id] = sg; got++; } });
      toast(got ? "Suggested a place for " + got + (got === 1 ? " note" : " notes") + " · " + money(j.cost || 0) : "No suggestions came back");
    }).catch(function (err) {
      if (err && err.spend) { state.aiSpend = err.spend; lsSet(LS_AISPEND, err.spend); }
      ib.sugErr = "No suggestions: " + (err && err.code === "sort_shape" ? "Claude's answer didn't come back in the expected shape." : describeAi(err));
    }).then(function () { ib.sugBusy = false; render(true); });
  }
  /* One suggestion, held to Notion's lists and real dates; anything that doesn't fit falls back to a plain task. */
  function ibCheck(n, it) {
    var kind = IB_KINDS[it.kind] ? it.kind : null; if (!kind) return null;
    var str = function (x, len) { return typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, len) : ""; }, isDay = function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x || "") && !isNaN(parseYmd(x)); };
    var v = ibDefaults(n, kind), t = str(it.title, kind === "queue" ? 120 : 200);
    if (t) v.title = t;
    v.life = ibAreas().indexOf(it.life_area) > -1 ? it.life_area : null;
    v.pri = ibPris().indexOf(it.priority) > -1 ? it.priority : null;
    if (kind === "task") v.due = isDay(it.due) ? it.due : null;
    if (kind === "date") { if (!isDay(it.date)) kind = "task"; else { v.date = it.date; v.type = ibTypes().indexOf(it.type) > -1 ? it.type : null; v.yearly = it.yearly === true; } }
    if (kind === "event") {
      var cal = it.calendar === "growth" ? "hobby" : it.calendar;
      if (!isDay(it.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(it.start_time || "")) kind = "task";
      else { v.area = ibCals().indexOf(cal) > -1 ? cal : "personal"; v.day = it.day; v.time = it.start_time; v.mins = Math.max(5, Math.min(600, Math.round(+it.minutes || 60))); }
    }
    if (kind === "queue") v.cost = typeof it.cost === "number" && isFinite(it.cost) && it.cost >= 0 ? Math.round(it.cost * 100) / 100 : null;
    return { kind: kind, v: v, why: str(it.why, 120) };
  }
  function inboxClick(b) {
    var d = b.dataset;
    if (d.act === "inbox") { go("inbox"); return true; }
    if (state.screen !== "inbox") return false;
    if (d.ibtab) { ib.tab = d.ibtab; ib.open = null; ib.armed = null; render(true); return true; }
    if (d.ib === "note") { openCapture(null, null, "note"); return true; }
    if (d.ib === "suggest") { ibSuggest(); return true; }
    if (d.ib === "cancel") { ib.open = null; render(true); return true; }
    if (d.ibkind) { var n = ibNote(d.ibid); if (n) { ib.open = { id: n.id, kind: d.ibkind, v: ibDefaults(n, d.ibkind) }; ib.armed = null; render(true); } return true; }
    if (d.ibsave) { var n2 = ibNote(d.ibsave); if (n2 && ib.open) ibApply(n2, ib.open.kind, ibFormValues(ib.open.kind)); return true; }
    if (d.ibok) { var n3 = ibNote(d.ibok), s = n3 && ib.sug[n3.id]; if (s) ibApply(n3, s.kind, s.v); return true; }
    if (d.ibchange) { var n4 = ibNote(d.ibchange), s2 = n4 && ib.sug[n4.id]; if (s2) { ib.open = { id: n4.id, kind: s2.kind, v: Object.assign({}, s2.v) }; render(true); } return true; }
    if (d.ibskip) { delete ib.sug[d.ibskip]; render(true); return true; }
    if (d.ibback) { var n5 = ibNote(d.ibback); if (n5) { ibMark(n5, "new"); ib.tab = "waiting"; ib.open = { id: n5.id, kind: "task", v: ibDefaults(n5, "task") }; render(true); } return true; }
    if (d.ibdel) {
      var n6 = ibNote(d.ibdel);
      if (n6 && ib.armed === n6.id) { ib.armed = null; ibMark(n6, "remove"); toast("Note moved to Notion's trash"); }
      else ib.armed = d.ibdel;
      render(true); return true;
    }
    if (d.ibpri !== undefined) { b.parentNode.querySelectorAll("[data-ibpri]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b && b.getAttribute("aria-pressed") !== "true")); }); return true; }
    if (d.ibarea) { b.parentNode.querySelectorAll("[data-ibarea]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); return true; }
    if (b.hasAttribute("data-ibyearly")) { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); return true; }
    return false;
  }
  /* SYSTEMS → INBOX: what's there, marks still on this iPad, and what an older bridge needs. */
  function inboxSection() {
    if (!state.conn) return "";
    var html = '<section id="sec-inbox">' + phead("INBOX", canInbox() ? (ib.data ? ibCount() + " WAITING · " + ibKept().length + " KEPT" : "NOTION") : "SETUP", "chrome-c");
    if (!canInbox()) return html + stubBox("CAPTURE → NOTE and the INBOX need the Google bridge updated, then the 📥 Inbox database connected to the TimothyOS integration in Notion (••• → Connections).") + "</section>";
    var marks = Object.keys(ib.q).length, qd = ibQueued().length;
    html += '<div class="calrow"><span class="st" style="--c: var(--chrome-c)"></span><span><b>Notes</b><small>' + (ib.err ? esc(ib.err.msg) : ib.data ? "Read " + esc(stamp(ib.data.fetched)) + "." : "Not read yet.") +
      (qd ? " " + qd + (qd === 1 ? " note" : " notes") + " waiting on this iPad to save." : "") + (marks ? " " + marks + (marks === 1 ? " sorting mark" : " sorting marks") + " waiting to reach Notion." : "") + "</small></span>" +
      (ib.data && ib.data.url ? '<a class="chip sm" href="' + esc(ib.data.url) + '" target="_blank" rel="noopener">OPEN IN NOTION</a>' : "<span></span>") + "</div>";
    html += '<small class="muted">' + (canInboxSort() ? "SUGGEST SORTING asks Sonnet (about 1¢ a batch) and counts toward ASK's monthly total as INBOX SORTING." : "SUGGEST SORTING needs Ask Claude.") + "</small>";
    return html + "</section>";
  }
  /* The Bridge's line: only while notes wait. Condition never counts them. */


