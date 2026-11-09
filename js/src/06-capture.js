  /* ---------- First-run link ---------- */
  function renderConnect() {
    var html = '<div class="connect">' + phead("CALENDAR BRIDGE", "ONE-TIME SETUP") +
      "<ol><li>Create the Apps Script bridge and run <b>setup</b>. Copy the access key from the log.</li>" +
      "<li>Deploy it as a web app (execute as you, access: Anyone). Copy the URL ending in <b>/exec</b>.</li>" +
      "<li>Paste both below. Full steps are in the README.</li></ol>" +
      '<form id="connForm" class="connect" autocomplete="off" novalidate>' +
      '<div><label for="connUrl">WEB APP URL</label><input type="url" id="connUrl" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div><label for="connKey">ACCESS KEY</label><input type="text" id="connKey" placeholder="64 characters from the setup log" autocapitalize="off" autocorrect="off" spellcheck="false"></div>' +
      '<div class="err" id="connErr" role="alert"></div>' +
      '<div class="btnrow"><button type="submit" class="btn capture" id="connBtn">LINK</button></div></form>' +
      '<section class="bk-connect">' + phead("OR RESTORE THIS IPAD", "FROM A BACKUP FILE") + '<small class="muted">Made in SYSTEMS → BACKUP AND RESTORE. It brings back the link, NAS, Home Assistant and every setting kept on the iPad.</small>' +
      bkRestoreHtml() + (bk.err ? '<div class="err">' + esc(bk.err) + "</div>" : "") + "</section></div>";
    $("content").innerHTML = html;
  }
  function submitConnect() {
    var url = $("connUrl").value.trim(), key = $("connKey").value.trim().replace(/\s+/g, ""), err = $("connErr");
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) { err.textContent = "The URL should start with https://script.google.com/ and end in /exec."; return; }
    if (key.length < 20) { err.textContent = "That key looks too short. Copy the whole line from the setup log."; return; }
    err.textContent = "";
    var btn = $("connBtn");
    btn.disabled = true;
    btn.textContent = "CHECKING…";
    var conn = { url: url, key: key };
    api({ action: "ping" }, conn).then(function (j) {
      state.conn = conn;
      lsSet(LS_CONN, conn);
      state.calendars = j.calendars || [];
      state.bridgeVersion = j.version || null;
      state.caps = j.capabilities || [];
      persist();
      prof.kick();
      var bad = state.calendars.filter(function (c) { return !c.ok; });
      toast(bad.length ? "Linked. One calendar needs attention, see Systems." : "Linked. Loading your calendars.");
      go(lsGet(LS_START) === "today" ? "today" : "bridge", sod(new Date()));
    }).catch(function (e) {
      err.textContent = describe(e);
      btn.disabled = false;
      btn.textContent = "LINK";
    });
  }

  /* ---------- Detail sheet ---------- */
  function openDetail(ev) {
    norm(ev);
    var when;
    if (ev.allDay) {
      var s = parseYmd(ev.start), last = addDays(parseYmd(ev.end), -1);
      when = "All day · " + dLabel(s) + (sameDay(s, last) ? "" : " to " + dLabel(last));
    } else {
      when = dLabel(ev._s) + " · " + hm(ev._s) + " to " + (sameDay(ev._s, ev._e) ? "" : dLabel(ev._e) + " ") + hm(ev._e);
    }
    $("detailSheet").className = "sheet a-" + ev.area;
    $("detailSheet").style.setProperty("--c", "var(--" + ev.area + ")");
    var q = ev.pending ? queueItem(ev.cid) : null;
    $("detailSheet").innerHTML = '<div class="sbar"><span>' + AREAS[ev.area].name + "</span><span>" +
      (q ? (q.failed ? "NOT SAVED" : "WAITING TO SAVE") : ev.area === "work" || ev.area === "family" ? "READ-ONLY" : "VIEW ONLY") + "</span></div>" +
      '<div class="sbody"><h3 id="detailTitle">' + esc(ev.title) + '</h3><div class="tnum">' + esc(when) + "</div>" +
      (ev.location ? '<div class="muted">' + esc(ev.location) + "</div>" : "") +
      (ev.busy ? '<div class="muted">Details are hidden. This calendar is shared as free/busy only, or the event is private.</div>' : "") +
      (q ? '<div class="' + (q.failed ? "err" : "muted") + '">' + (q.failed ? esc(q.lastError || "Not saved.") :
        "Captured on this iPad. It saves to your Personal calendar as soon as Google answers.") + "</div>" : "") +
      '</div><div class="sfoot btnrow">' +
      (q ? (q.failed ? '<button type="button" class="btn" data-qretry="' + esc(q.cid) + '">RETRY</button>' : "") +
        '<button type="button" class="btn ghost" data-qdiscard="' + esc(q.cid) + '">DISCARD</button>' : "") +
      (!q && !ev.busy ? '<button type="button" class="btn ghost" data-ignore="' + esc(ev.title) + '">IGNORE THIS TITLE</button>' : "") +
      '<button type="button" class="btn ghost" id="detailClose">CLOSE</button></div>';
    showSheet("detailScrim");
    $("detailClose").focus();
  }
  function closeDetail() { lsum = null; if (eng) { eng.sheetKind = null; eng.sheetId = null; eng.dragging = null; if (eng.scn) eng.scn.pick = null; } hideSheet("detailScrim"); }


  /* ---------- Capture ---------- */
  var WRITABLE = ["personal"];              /* Work is never offered */
  var RETRYABLE = { bad_json: 1, server_error: 1, bad_response: 1, http_404: 1 };
  var DURS = [["0.25", "15 MIN"], ["0.5", "30 MIN"], ["1", "1 HR"], ["2", "2 HR"], ["all", "ALL DAY"]];
  var capPrefs = lsGet(LS_CAPPREFS) || { dur: "1" };
  var cap = null;

  function canCreate() { return state.caps.indexOf("create") > -1; }
  function areaName(k) { return AREAS[k].name.charAt(0) + AREAS[k].name.slice(1).toLowerCase(); }
  function queued() { return state.queue.filter(function (q) { return !q.failed; }); }
  function queueItem(cid) { return state.queue.filter(function (q) { return q.cid === cid; })[0]; }
  function saveQueue() { lsSet(LS_QUEUE, state.queue); }
  function newCid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (v, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return p2(b.toString(16)); }).join("");
  }
  function whenLabel(q) {
    if (q.kind === "note") return "NOTE · " + dLabel(new Date(q.at || q.created));
    if (q.kind === "date") return dLabel(parseYmd(q.start)) + (q.end ? " TO " + dLabel(parseYmd(q.end)) : "") + " · KEY DATE";
    if (q.allDay) return dLabel(parseYmd(q.start)) + " · ALL DAY";
    var s = new Date(q.start);
    return dLabel(s) + " " + hm(s);
  }
  /* Captures still on this iPad, drawn on the calendar as dashed blocks. */
  function pendingEvents() {
    return state.queue.filter(function (q) { return q.kind !== "date" && q.kind !== "note"; }).map(function (q) {
      return { id: "pending:" + q.cid, cid: q.cid, area: q.area, title: q.title, allDay: !!q.allDay, start: q.start, end: q.end, location: "",
        pending: q.failed ? "failed" : q.attempts ? "queued" : "saving" };
    });
  }
  /* An event whose end has passed (2.22): dimmed with a check on Today, Week and the Bridge strip. */
  function pastCls(ev) { return !ev.allDay && ev._e && +ev._e <= Date.now() ? " past" : ""; }
  function pendingCls(ev) { return ev.pending ? " pending" + (ev.pending === "failed" ? " failed" : "") : ""; }
  function pendingTag(ev) { return ev.pending ? " · " + { saving: "SAVING", queued: "QUEUED", failed: "NOT SAVED" }[ev.pending] : ""; }
  /* Put a confirmed event into the cached ranges so it shows before the next sync. */
  function addConfirmed(ev) {
    var at = ev.allDay ? parseYmd(ev.start).getTime() : Date.parse(ev.start);
    Object.keys(state.ranges).forEach(function (k) {
      var r = state.ranges[k];
      if (at >= r.from && at < r.to && !r.events.some(function (x) { return x.id === ev.id; })) r.events.push(ev);
    });
    persist();
  }
  function describeCapture(err) {
    var code = err && (err.code || err.message);
    return {
      not_writable: "That calendar is read-only.",
      bad_title: "The title is empty or longer than 200 characters.",
      bad_time: "The bridge only accepts times from 2 days ago to about a year ahead.",
      bad_request: "The bridge couldn't read this capture.",
      unauthorized: "The access key was rejected. Re-link in Systems.",
      unknown_action: "The bridge needs an update before it can save this. See Systems.",
      retries: "Google kept failing after " + MAX_ATTEMPTS + " tries."
    }[code] || describe(err);
  }

  /* A capture whose reply was lost may already be saved. Before resending,
     look for it in what we already loaded; if it's there, it's done. */
  function norm1(t) { return String(t || "").trim().toLowerCase(); }
  function alreadySaved(q) {
    if (q.kind === "note") return !!(ib.data && ib.data.waiting.concat(ib.data.kept).some(function (n) { return n.text === q.text; }));
    if (q.kind === "date") {
      return !!(state.dates && state.dates.dates.some(function (d) {
        return norm1(d.title) === norm1(q.title) && d.start === q.start && (d.end || null) === (q.end || null);
      }));
    }
    var at = q.allDay ? q.start : Date.parse(q.start);
    return Object.keys(state.ranges).some(function (k) {
      return state.ranges[k].events.some(function (ev) {
        return ev.area === q.area && norm1(ev.title) === norm1(q.title) && (q.allDay ? ev.allDay && ev.start === at : !ev.allDay && Date.parse(ev.start) === at);
      });
    });
  }
  function reconcileQueue() {
    var done = state.queue.filter(function (q) { return (q.attempts || q.failed) && alreadySaved(q); });
    if (!done.length) return;
    state.queue = state.queue.filter(function (q) { return done.indexOf(q) === -1; });
    saveQueue();
    toast(done.length === 1 ? "\"" + done[0].title + "\" was already saved. Cleared from the queue." : done.length + " queued items were already saved. Cleared.");
    render(true);
  }

  /* Send queued captures one at a time. Network trouble and temporary Google
     errors keep the item queued; anything else marks it NOT SAVED. */
  function flushQueue(announce) {
    if (!state.conn || state.flushing) return;
    reconcileQueue();
    var next = queued().filter(function (q) { return q.kind === "note" ? canInbox() : q.kind === "date" ? canDates() : canCreate(); })[0];
    if (!next) return;
    state.flushing = true;
    var req = next.kind === "note" ? { action: "inboxadd", note: { cid: next.cid, text: next.text, at: next.at } } : next.kind === "date"
      ? { action: "adddate", date: { cid: next.cid, title: next.title, start: next.start, end: next.end || null, area: next.area || null, type: next.type || null, yearly: !!next.yearly } }
      : { action: "create", item: { cid: next.cid, area: next.area, title: next.title, allDay: !!next.allDay, start: next.start, end: next.end } };
    apiPost(req)
      .then(function (j) {
        state.flushing = false;
        state.queue = state.queue.filter(function (q) { return q.cid !== next.cid; });
        saveQueue();
        if (j.event) addConfirmed(j.event);
        if (j.date) addKeyDate(j.date);
        if (j.note && ib.data && !ib.data.waiting.some(function (n) { return n.id === j.note.id; })) { ib.data.waiting.push(j.note); ibSave(); }
        if (announce) toast(next.kind === "note" ? "Note saved to the inbox · " + ibCount() + " waiting" : next.kind === "date" ? "Key date saved to Notion · " + whenLabel(next) : "Saved to " + areaName(next.area) + " · " + whenLabel(next));
        render(true);
        if (queued().length) flushQueue(announce); else if (next.kind !== "date" && next.kind !== "note") refresh(true);
      })
      .catch(function (err) {
        state.flushing = false;
        var code = err && err.code;
        next.attempts = (next.attempts || 0) + 1;
        if ((isNetworkError(err) || RETRYABLE[code] || /^http_5/.test(code || "")) && next.attempts < MAX_ATTEMPTS) {
          next.lastError = describeCapture(err);
          saveQueue();
          if (announce) toast(isNetworkError(err) || navigator.onLine === false ? "Queued. It saves when you're back online." : "Google didn't answer. Queued to retry.");
          render(true);
          return;
        }
        next.failed = isNetworkError(err) || RETRYABLE[code] ? "retries" : code || "error";
        next.lastError = describeCapture(next.failed === "retries" ? { code: "retries" } : err);
        saveQueue();
        toast("Not saved: " + next.lastError);
        render(true);
        flushQueue(false);
      });
  }
  function retryCapture(cid) {
    var q = queueItem(cid);
    if (!q) return;
    delete q.failed; q.attempts = 0; q.lastError = "";
    saveQueue(); render(true); flushQueue(true);
  }
  function discardCapture(cid) {
    state.queue = state.queue.filter(function (q) { return q.cid !== cid; });
    saveQueue(); render(true);
    toast("Discarded. Nothing was saved.");
  }

  function captureSection() {
    var html = '<section id="sec-capture">' + phead("CAPTURE", canCreate() ? "SAVES TO PERSONAL" : "BRIDGE UPDATE NEEDED");
    if (!canCreate()) {
      html += '<div class="stubbox"><span class="pill">UPDATE</span><span>Your bridge is version ' + esc(state.bridgeVersion || "1.0") +
        ". Capture needs the Google bridge updated: paste the latest Code.gs, run <b>setup</b>, then deploy a new version. Steps are in the README.</span></div>";
    }
    if (!state.queue.length) html += '<div class="empty">Nothing waiting. Every capture has been saved.</div>';
    state.queue.forEach(function (q) {
      html += '<div class="calrow a-' + (q.kind === "note" ? "personal" : q.kind === "date" ? taskArea(q.area) : q.area) + '"><span class="st"></span><span><b>' + esc(q.title) + '</b><small class="tnum">' + esc(whenLabel(q)) + " · " +
        (q.failed ? '<span class="errtxt">' + esc(q.lastError || "Not saved") + "</span>" : q.attempts ? "Queued, " + q.attempts + (q.attempts === 1 ? " try" : " tries") + (q.lastError ? '</small><small class="errtxt">Last reply: ' + esc(q.lastError) : "") : "Saving") +
        '</small></span><span class="btnrow">' + (q.failed ? '<button type="button" class="chip" data-qretry="' + esc(q.cid) + '">RETRY</button>' : "") +
        '<button type="button" class="chip" data-qdiscard="' + esc(q.cid) + '">DISCARD</button></span></div>';
    });
    if (queued().length && canCreate()) html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn" data-act="flush">SEND NOW</button></div>';
    return html + "</section>";
  }

  /* --- the sheet --- */
  function openCapture(day, hour, type) {
    if (!state.conn) return;
    var now = new Date(), d = sod(day || (state.screen === "today" ? state.anchor : now)), h;
    if (typeof hour === "number") h = hour;
    else if (sameDay(d, now)) h = Math.min(23.75, Math.ceil((now.getHours() + now.getMinutes() / 60) * 2) / 2);
    else h = 9;
    cap = { day: d, hour: h, dur: capPrefs.dur || "1", type: type === "date" && canDates() ? "date" : type === "note" && canInbox() ? "note" : "event", yearly: false, area: capPrefs.area || "personal" };
    $("capText").value = "";
    $("capNoteText").value = "";
    $("capUntil").value = "";
    fillDateSelects();
    $("capErr").textContent = "";
    renderCapture();
    showSheet("capScrim");
    setTimeout(function () { if (cap) $(cap.type === "note" ? "capNoteText" : "capText").focus(); }, 60);   /* closed already (Escape at once): nothing to focus */
  }
  function closeCapture() { hideSheet("capScrim"); cap = null; }
  function renderCapture() {
    var now = new Date(), allDay = cap.dur === "all", notes = [], isDate = cap.type === "date", isNote = cap.type === "note";
    setAreas();
    if (WRITABLE.indexOf(cap.area) === -1) cap.area = "personal";
    $("capMode").textContent = navigator.onLine === false ? "OFFLINE · WILL QUEUE" : isNote ? "NOTION · INBOX" : isDate ? "NOTION · KEY DATES" : AREAS[cap.area].name + " CALENDAR";
    $("capForm").style.setProperty("--c", isNote ? "var(--chrome-c)" : isDate ? "var(--chrome-b)" : "var(--" + cap.area + ")");
    document.querySelectorAll("[data-carea]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.carea === cap.area)); });
    var fb = $("capFarm"), farmOn = WRITABLE.indexOf("farm") > -1;
    fb.disabled = !farmOn;
    fb.innerHTML = esc(AREAS.farm.name) + (farmOn ? "" : "<small>STANDBY</small>");
    var gb = $("capGrowth"), growOn = WRITABLE.indexOf("hobby") > -1;
    gb.disabled = !growOn;
    gb.innerHTML = esc(AREAS.hobby.name) + (growOn ? "" : "<small>STANDBY</small>");
    document.querySelectorAll("[data-ctype]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.ctype === cap.type)); });
    $("capTypeDate").disabled = !canDates();
    $("capTypeDate").innerHTML = "KEY DATE" + (canDates() ? "" : "<small>SETUP</small>");
    $("capTypeNote").disabled = !canInbox();
    $("capTypeNote").innerHTML = "NOTE" + (canInbox() ? "" : "<small>SETUP</small>");
    $("capAreaRow").hidden = isDate || isNote; $("capTimeRow").hidden = isDate || isNote; $("capDayRow").hidden = isNote;
    $("capKdRow").hidden = !isDate; $("capUntilRow").hidden = !isDate;
    $("capText").hidden = isNote; $("capNoteText").hidden = !isNote;
    $("capYearly").setAttribute("aria-pressed", String(!!cap.yearly));
    $("capText").placeholder = isDate ? "What's the date? e.g. First frost risk" : "What goes in? e.g. Pick up bee feeder";
    $("capFootText").textContent = isNote ? "Waits in INBOX to sort later. The keyboard's microphone takes dictation." : isDate ? "Saves to Key Dates in Notion." : "Saves to your " + areaName(cap.area) + " Google Calendar. Work is read-only.";
    if (!isDate && !canCreate()) notes.push("Your bridge needs the 1.1 update before events can be saved. See Systems.");
    if (!isDate && state.hidden[cap.area]) notes.push(areaName(cap.area) + " is hidden. New events save, but stay hidden until you tap " + areaName(cap.area) + " on Today.");
    $("capNote").hidden = !notes.length;
    $("capNote").textContent = notes.join(" ");
    $("capSave").disabled = isNote ? !canInbox() : isDate ? !canDates() : !canCreate();
    $("capSave").textContent = isNote ? "SAVE NOTE" : "SAVE";
    var today = sod(now), tomorrow = addDays(today, 1);
    document.querySelectorAll("[data-capday]").forEach(function (b) {
      var target = b.dataset.capday === "today" ? today : tomorrow;
      b.setAttribute("aria-pressed", String(sameDay(cap.day, target)));
    });
    $("capDate").value = ymd(cap.day);
    $("capTime").value = String(cap.hour);
    $("capTime").hidden = allDay;
    document.querySelectorAll("[data-dur]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.dur === cap.dur)); });
  }
  function submitCapture() {
    var err = $("capErr");
    if (cap.type === "note") {
      var text = $("capNoteText").value.replace(/\r\n/g, "\n").trim();
      if (!text) { err.textContent = "Type or dictate the note first."; $("capNoteText").focus(); return; }
      if (!canInbox()) return;
      state.queue.push({ kind: "note", cid: newCid(), title: text.replace(/\s+/g, " ").slice(0, 200), text: text.slice(0, 2000), at: new Date().toISOString(), created: Date.now(), attempts: 0 });
      saveQueue(); closeCapture(); render(true); flushQueue(true);
      return;
    }
    var title = $("capText").value.trim();
    if (!title) { err.textContent = "Type what you want to add first."; $("capText").focus(); return; }
    if (cap.type === "date") {
      if (!canDates()) return;
      var until = $("capUntil").value;
      if (until && until < ymd(cap.day)) { err.textContent = "The end date is before the start date."; return; }
      capPrefs.kdArea = $("capLifeArea").value; capPrefs.kdType = $("capKdType").value; lsSet(LS_CAPPREFS, capPrefs);
      state.queue.push({ kind: "date", cid: newCid(), title: title.slice(0, 200), start: ymd(cap.day), end: until && until !== ymd(cap.day) ? until : null,
        area: $("capLifeArea").value || null, type: $("capKdType").value || null, yearly: !!cap.yearly, created: Date.now(), attempts: 0 });
      saveQueue(); closeCapture(); render(true); flushQueue(true);
      return;
    }
    if (!canCreate()) return;
    var item = { cid: newCid(), area: WRITABLE.indexOf(cap.area) > -1 ? cap.area : "personal", title: title.slice(0, 200), created: Date.now(), attempts: 0 };
    if (cap.dur === "all") {
      item.allDay = true; item.start = ymd(cap.day); item.end = ymd(addDays(cap.day, 1));
    } else {
      var s = new Date(cap.day);
      s.setHours(Math.floor(cap.hour), Math.round((cap.hour % 1) * 60), 0, 0);
      if (s.getTime() < Date.now() - 2 * 86400000) { err.textContent = "That's more than 2 days ago. Pick a later day."; return; }
      item.allDay = false; item.start = s.toISOString(); item.end = new Date(s.getTime() + Number(cap.dur) * 3600000).toISOString();
    }
    state.queue.push(item);
    saveQueue();
    closeCapture();
    render(true);
    flushQueue(true);
  }
  /* Tap an empty spot on the Day or Week timeline to capture at that time. */
  function tapToCapture(e) {
    if (!state.conn) return;
    var tl = e.target.closest(".tl"), col = e.target.closest(".wkcol"), host = tl || col, sc = tl ? state.dayScale : state.weekScale;
    if (!host || !sc) return;
    var y = e.clientY - host.getBoundingClientRect().top;
    var hour = Math.max(0, Math.min(23.75, Math.floor(sc.hourAt(y) * 4) / 4));
    openCapture(col ? parseYmd(col.dataset.ymd) : state.anchor, hour);
  }
  (function buildCaptureSheet() {
    var t = "";
    for (var q = 0; q < 96; q++) t += '<option value="' + q / 4 + '">' + p2(Math.floor(q / 4)) + ":" + p2((q % 4) * 15) + "</option>";
    $("capTime").innerHTML = t;
    $("capDurs").innerHTML = DURS.map(function (d) { return '<button type="button" class="chip" data-dur="' + d[0] + '">' + d[1] + "</button>"; }).join("");
  })();
  $("capBtn").addEventListener("click", function () { openCapture(); });
  $("capCancel").addEventListener("click", closeCapture);
  $("capForm").addEventListener("submit", function (e) { e.preventDefault(); submitCapture(); });
  $("capScrim").addEventListener("click", function (e) {
    if (e.target === $("capScrim")) { closeCapture(); return; }
    var b = e.target.closest("button");
    if (!b || b.disabled || !cap) return;
    if (b.dataset.ctype) {
      var from = cap.type === "note" ? $("capNoteText") : $("capText"), to = b.dataset.ctype === "note" ? $("capNoteText") : $("capText");
      if (from !== to && from.value && !to.value) to.value = from.value.replace(/\s+/g, to === $("capText") ? " " : "$&").slice(0, to.maxLength);   /* switching type keeps what was typed */
      cap.type = b.dataset.ctype; renderCapture(); to.focus();
    }
    else if (b.id === "capYearly") { cap.yearly = !cap.yearly; renderCapture(); }
    else if (b.dataset.capday) { cap.day = b.dataset.capday === "today" ? sod(new Date()) : addDays(sod(new Date()), 1); renderCapture(); }
    else if (b.dataset.dur) { cap.dur = b.dataset.dur; capPrefs.dur = cap.dur; lsSet(LS_CAPPREFS, capPrefs); renderCapture(); }
    else if (b.dataset.carea) { cap.area = b.dataset.carea; capPrefs.area = cap.area; lsSet(LS_CAPPREFS, capPrefs); renderCapture(); }
  });
  $("capDate").addEventListener("change", function () { if (cap && /^\d{4}-\d{2}-\d{2}$/.test(this.value)) { cap.day = parseYmd(this.value); renderCapture(); } });
  $("capTime").addEventListener("change", function () { if (cap) cap.hour = Number(this.value); });
  $("capForm").addEventListener("input", function () { $("capErr").textContent = ""; });
  $("capForm").addEventListener("change", function () { $("capErr").textContent = ""; });



