  /* ---------- Ask (Claude) ---------- */
  /* Questions go to the bridge with a snapshot of what the app knows; the bridge
     asks Claude, which can read more through the bridge but never changes
     anything. Suggested changes come back as cards: nothing happens until
     CONFIRM, and then the app makes the change exactly as a tap would.
     The conversation stays on this iPad (6 hours, or until NEW CHAT). */
  var ASK_TTL_MS = 6 * 3600 * 1000, SNAPSHOT_MS = 30 * 60 * 1000;
  var askState = lsGet(LS_ASK);
  var askBusy = false;
  function canAsk() { return state.caps.indexOf("ask") > -1; }
  function saveAsk() { lsSet(LS_ASK, askState); }
  /* A sharing switch changed (finances, tarot): the next question rebuilds its snapshot, so turning one off takes effect at once. */
  function askReshare() { if (askState) { askState.context = ""; askState.contextAt = 0; saveAsk(); } }
  function freshAsk() {
    if (!askState || Date.now() - askState.started > ASK_TTL_MS) askState = { started: Date.now(), deep: askState ? askState.deep : false, msgs: [], context: "", contextAt: 0 };
    if (!askState.context || Date.now() - askState.contextAt > SNAPSHOT_MS) { askState.context = briefing(); askState.contextAt = Date.now(); }
    saveAsk();
  }
  function money(usdAmt) { return usdAmt < 1 ? (Math.round(usdAmt * 1000) / 10) + "¢" : "$" + usdAmt.toFixed(2); }
  function spendLine(s) { return s ? "$" + s.usd.toFixed(2) + " THIS MONTH · " + (s.usd >= s.budget && s.cont ? "CONTINUED PAST $" + s.budget.toFixed(2) : "REMINDER AT $" + s.budget.toFixed(2)) : ""; }
  function modelName(m) { return /haiku/.test(m || "") ? "HAIKU" : /sonnet/.test(m || "") ? "SONNET" : /opus/.test(m || "") ? "OPUS" : String(m || "").toUpperCase(); }
  function describeAi(err) {
    var code = err && (err.code || err.message), s = state.aiSpend;
    return {
      ai_not_configured: "Ask isn't set up yet. Add ANTHROPIC_API_KEY to the bridge's Script Properties (README, Ask Claude).",
      ai_budget: "Ask paused at this month's reminder" + (s ? " ($" + s.usd.toFixed(2) + " of $" + s.budget.toFixed(2) + ")" : "") + ". CONTINUE carries on for the rest of the month, until the Claude Console stops it" + (s && s.cap ? " (your $" + s.cap.toFixed(0) + " ceiling there)" : "") + ".",
      ai_console_limit: "The spend limit in the Claude Console was reached. It resumes next month, or raise it at platform.claude.com.",
      ai_no_credit: "Your Claude Console credit is used up. Add credit at platform.claude.com (auto-reload stays off).",
      ai_unauthorized: "Claude didn't accept the API key. Check ANTHROPIC_API_KEY in Script Properties.",
      ai_busy: "Claude is busy right now. Try again in a minute.",
      ai_error: "Claude returned an error" + (err && err.detail ? ": " + err.detail : ".")
    }[code] || describeTasks(err);
  }

  /* What the app knows right now, as plain text for Claude. Ignored events are already left out. */
  /* The snapshot as named sections (parts = true), or as one text. A section's name is what OPEN IN CLAUDE says it
     left out when the link has to be shortened (2.30.2); unnamed sections are never left out. */
  function briefing(parts) {
    var now = new Date(), today = ymd(now), list = eventsFor(bridgeRange()), out = [];
    var add = function (txt, name) { out.push({ t: txt, k: name || "" }); };
    var line = function (e) { return e.allDay ? "all day · " + AREAS[e.area].name + " · " + e.title : hm(e._s) + "-" + hm(e._e) + " · " + AREAS[e.area].name + " · " + e.title + (e.pending ? " (not saved yet)" : ""); };
    add("NOW: " + DOWL[now.getDay()] + " " + today + " " + hm(now) + " (iPad local time). Week starts Monday.");
    if (hasFarm() || hasGrowth()) add("CALENDARS: WORK (read-only), PERSONAL" + (hasFarm() ? ", " + AREAS.farm.name + " (farm and bees; calendar 'farm' for proposals)" : "") + (hasGrowth() ? ", GROWTH (personal growth and hobbies; calendar 'growth' for proposals)" : ""));
    var items = conditions(now, today, list).filter(function (i) { return !i.health || lsGet(LS_AISICK); });   /* SICKBAY's items only when shared (2.74) */
    add("CONDITION: " + (items.some(function (i) { return i.lvl === "bad"; }) ? "RED" : items.length ? "YELLOW" : "GREEN") +
      (items.length ? " · " + items.map(function (i) { return i.txt + " (" + unesc(i.sub.replace(/<[^>]+>/g, "")) + ")"; }).join(" · ") : ""));
    var de = dayEvents(list, now);
    add("TODAY:\n" + (de.allDay.concat(de.timed).map(function (e) { return "- " + line(e); }).join("\n") || "- nothing on the calendar"));
    var days = [];
    for (var i = 1; i < 7; i++) {
      var d = addDays(sod(now), i), dd = dayEvents(list, d);
      days.push(DOW[d.getDay()] + " " + ymd(d) + ": " + (dd.allDay.concat(dd.timed).map(line).join("; ") || "nothing"));
    }
    add("NEXT 6 DAYS:\n" + days.join("\n"), "the next 6 days");
    if (!hasData(bridgeRange())) add("(Calendar data may be incomplete: last sync " + (state.sync.at ? stamp(state.sync.at) : "never") + ".)");
    var data = canPlan() ? state.tasks[today] : null;
    if (data) {
      var t = function (x) { return "- [" + x.id + "] " + x.title + " · " + [x.status, x.priority, x.area, x.due ? "due " + x.due : "", x.focus ? "picked " + x.focus : ""].filter(Boolean).join(" · "); };
      add("PRIORITIES PICKED FOR TODAY:\n" + (data.focus.map(t).join("\n") || "- none picked yet"));
      add("OPEN TASKS (most urgent first, up to 40 of " + data.open.length + "):\n" + (rankTasks(data.open).slice(0, 40).map(t).join("\n") || "- none"), "open tasks");
    } else add("TASKS: not loaded. Use get_tasks.");
    if (canDates() && state.dates) {
      var kd = occurrences(today, ymd(addDays(now, 60))).map(function (o) { return "- " + o.s + (o.e !== o.s ? " to " + o.e : "") + " · " + o.d.title + " · " + [o.d.type, o.d.area, o.d.yearly ? "yearly" : "", countdown(o, today)].filter(Boolean).join(" · "); });
      add("KEY DATES (next 60 days):\n" + (kd.join("\n") || "- none"), "key dates");
    }
    var j = wxData();
    if (j) {
      var c = j.current || {}, dl = j.daily, di = Math.max(0, dl.time.indexOf(today)), rh = hiveDue(now), hv = !rh || (rh.due && !rh.winter) ? hiveCheck(now) : null, fr = frost(now);   /* the hive window only when a check is due (2.56) */
      add("WEATHER: " + Math.round(c.temperature_2m) + "°F " + wxText(c.weather_code).toLowerCase() + ", high " + Math.round(dl.temperature_2m_max[di]) + " low " + Math.round(dl.temperature_2m_min[di]) +
        (hv ? "; hive check " + (hv.go ? "GO, " : "HOLD, ") + hv.text.toLowerCase() + " (" + hv.label.toLowerCase() + ")" : "") + (fr ? "; tonight's low " + Math.round(fr.low) + "°F" : ""), "weather");
    }
    var hl = hiveLine(now);
    if (hl) add(hl, "hive rhythm");
    var upd = upkeepItems().map(function (u) { return { u: u, s: upkeepStatus(u, today) }; }).filter(function (x) { return x.s.lvl === "bad" || (x.s.dueDay && daysBetween(today, x.s.dueDay) <= 0); });
    var mdn = canMeals() && ml.data ? mlDinner(today) : null;
    if (mdn) add("DINNER TONIGHT: " + mlDName(mdn) + (mdn.status === "planned" ? " (planned)" : " (eaten)"), "dinner");
    if (upd.length) add("UPKEEP DUE: " + upd.map(function (x) { return x.u.name + (x.u.cat ? " (" + x.u.cat + ")" : "") + ", " + x.s.due.toLowerCase(); }).join("; "), "upkeep");
    var log = (lsGet(LS_LOG) || {})[today], b = bearingFor(today);
    if (log) add("TODAY'S INTENT: " + log);
    if (b) add("TODAY'S BEARING: " + b);
    if (data) add("LIFE AREAS: " + data.areas.join(" | ") + "\nPRIORITY NAMES: " + data.priorities.join(" | "), "lists of life areas and types");
    if (state.dates && state.dates.types) add("KEY DATE TYPES: " + state.dates.types.join(" | "), "lists of life areas and types");
    if (ignoreList.length) add("IGNORED EVENT TITLES (booking blocks, left out everywhere): " + ignoreList.join(" | "), "ignored event titles");
    var fin = ledgerBrief();
    if (fin) add(fin, "finances");
    var tar = tarotBrief();
    if (tar) add(tar, "tarot readings");
    var api2 = apiaryBrief();
    if (api2) add(api2, "apiary");
    var skb = sickbayBrief();
    if (skb) add(skb, "health");
    return parts ? out : out.map(function (x) { return x.t; }).join("\n\n");
  }

  function unesc(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
  /* Weekly summary for the Review screen: Sonnet, no tools, from the week's numbers and your reflection. */
  /* With a pin: this week's Log entries go along (bridge logask, mode summary). Resolves true when
     written, or with a message for the code panel. */
  function writeSummary(pin) {
    var w0 = sow(state.anchor), wk = ymd(w0), st = weekStats(w0), w = state.weeks[wk], d = drafts()[wk] || {}, saved = w && w.review;
    var f = function (k) { if (k === "bearing" && $("rv-bear-0")) return bearJoin(bearNames()); var el = $("rv-" + k); return el ? el.value.trim() : d[k] || (saved && saved[k]) || ""; };
    var lines = [weekLabel(w0) + (st.cur ? " (in progress, numbers so far)" : ""),
      "Hours: Work " + hrsLabel(st.work) + (st.cur ? "" : " (week before " + hrsLabel(st.prevWork) + ")") + ", Personal " + hrsLabel(st.personal) + (st.cur ? "" : " (week before " + hrsLabel(st.prevPersonal) + ")") +
        (hasFarm() ? ", " + areaName("farm") + " " + hrsLabel(st.farm) + (st.cur ? "" : " (week before " + hrsLabel(st.prevFarm) + ")") : "") +
        (hasGrowth() ? ", Growth " + hrsLabel(st.hobby) + (st.cur ? "" : " (week before " + hrsLabel(st.prevHobby) + ")") : "") +
        ". Busiest day " + (st.busiest && st.busiest.h ? DOW[st.busiest.d.getDay()] + " " + hrsLabel(st.busiest.h) : "none") + ". Open time 07:00 to 21:00: " + hrsLabel(st.open) + " of 98H. Work events: " + st.meetings + "."];
    if (w) {
      lines.push("Finished (" + st.done + "): " + (w.done.map(function (t) { return t.title + " [" + (bare(t.area) || "no area") + "]"; }).join("; ") || "none"));
      lines.push("Priorities: " + st.pickedDone + " of " + st.picked + " done. Still open: " + (w.picked.filter(function (t) { return t.status !== DONE; }).map(function (t) { return t.title; }).join("; ") || "none"));
    }
    var hl = hiveLine(new Date());
    if (hl) lines.push(hl.replace(/ Nothing to do for the hives today\.$/, "") + " Hives are checked on this rhythm, not daily; mention them only if a check was missed or something stood out.");
    var ins = intents(w0).filter(function (x) { return x.text; });
    if (ins.length) lines.push("Daily intents: " + ins.map(function (x) { return DOW[x.d.getDay()] + " " + x.text; }).join("; "));
    lines.push("His reflection so far. What went well: " + (f("wentWell") || "(blank)") + ". What drained me: " + (f("drained") || "(blank)") + ". Next focus: " + (f("nextFocus") || "(blank)") + ". Where I held my bearing: " + (f("bearing") || "(blank)") + ".");
    state.summaryBusy = true;
    render(true);
    var ask = { role: "user", text: "Write my weekly summary for " + weekLabel(w0) + "." };
    var req = pin ? apiPost({ action: "logask", pin: pin, mode: "summary", scope: { from: wk, to: ymd(addDays(w0, 6)) }, messages: [ask], context: lines.join("\n") }, 150000)
      : apiPost({ action: "ask", cid: newCid(), mode: "summary", messages: [ask], context: lines.join("\n"), ignore: ignoreList, breaks: breakList }, 150000);
    return req.then(function (j) {
      saveDraft(wk, "summary", j.reply);
      if ($("rv-summary")) $("rv-summary").value = j.reply;   /* replaces anything typed there, on purpose */
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Summary written" + (pin ? " with this week's log" : "") + " (" + money(j.cost) + "). Edit it, then save.");
      return true;
    }).catch(function (err) {
      var msg = pin ? logErrText(err && err.code, err && err.left, err && err.until) || describeAi(err) : describeAi(err);
      if (!pin) toast(msg);
      return msg;
    }).then(function (r) { state.summaryBusy = false; render(true); return r; });
  }

  function openAsk() {
    if (!canAsk()) return;
    freshAsk();
    $("askErr").textContent = "";
    renderAsk();
    showSheet("askScrim");
    setTimeout(function () { $("askText").focus(); }, 50);
    loadAiSpend(false);
  }
  function closeAsk() { hideSheet("askScrim"); }
  function propTitle(p) {
    var i = p.input;
    if (p.kind === "add_task") return "ADD TASK · " + i.title;
    if (p.kind === "set_focus") return (i.day === "none" ? "UNPICK · " : "PICK FOR " + dLabel(parseYmd(i.day)) + " · ") + i.task_title;
    if (p.kind === "set_status") return "MARK " + bare(i.status).toUpperCase() + " · " + i.task_title;
    if (p.kind === "add_key_date") return "ADD KEY DATE · " + i.title;
    if (p.kind === "add_event") return "ADD TO " + (i.calendar === "farm" ? AREAS.farm.name : i.calendar === "growth" ? AREAS.hobby.name : "PERSONAL") + " CALENDAR · " + i.title;
    if (p.kind === "review_draft") return "DRAFT REVIEW · " + weekLabel(sow(parseYmd(i.week_start)));
    return p.kind;
  }
  function propSub(p) {
    var i = p.input;
    if (p.kind === "add_task") return [bare(i.life_area), bare(i.priority), i.focus_day ? "PICKED FOR " + dLabel(parseYmd(i.focus_day)) : ""].filter(Boolean).join(" · ");
    if (p.kind === "add_key_date") return [i.end ? shortDay(i.start) + " TO " + shortDay(i.end) : dLabel(parseYmd(i.start)), bare(i.type), bare(i.life_area), i.yearly ? "YEARLY" : ""].filter(Boolean).join(" · ");
    if (p.kind === "add_event") return dLabel(parseYmd(i.date)) + " · " + (i.all_day ? "ALL DAY" : i.start_time + " · " + (i.minutes || 30) + " MIN");
    if (p.kind === "review_draft") return ["went_well", "drained", "next_focus", "bearing", "summary"].filter(function (k) { return i[k]; }).map(function (k) { return k.replace("_", " ").toUpperCase(); }).join(" · ") + " · YOU SAVE IT ON REVIEW";
    return "";
  }
  function renderAsk() {
    var log = $("askLog"), html = "";
    if (!askState.msgs.length) {
      html = '<div class="askhint"><b>Ask anything about your days.</b><br>For example: What needs me today? · What did I get done this week? · Remind me to call the vet Thursday at 3 · Add a task to order hive frames.' +
        '<br><span class="muted">Answers use your calendars, tasks and key dates. Nothing changes until you tap CONFIRM. Questions use Sonnet; THINK HARDER uses Opus, about three times the cost.</span></div>';
    }
    askState.msgs.forEach(function (m, mi) {
      if (m.role === "user") { html += '<div class="amsg user">' + esc(m.text) + "</div>"; return; }
      html += '<div class="amsg bot"><div class="atext">' + esc(m.text).replace(/\n/g, "<br>") + '</div><div class="ameta">' + modelName(m.model) + (m.cost != null ? " · " + money(m.cost) : "") + "</div>";
      (m.proposals || []).forEach(function (p, pi) {
        var st = p.state || "pending";
        html += '<div class="prop ' + st + '"><span class="st"></span><span class="tx"><b>' + esc(propTitle(p)) + "</b>" + (propSub(p) ? "<small>" + esc(propSub(p)) + "</small>" : "") +
          (p.note ? '<small class="' + (st === "failed" ? "errtxt" : "") + '">' + esc(p.note) + "</small>" : "") + "</span>" +
          (st === "pending" ? '<span class="btnrow"><button type="button" class="btn ghost" data-pcancel="' + mi + ":" + pi + '">CANCEL</button><button type="button" class="btn" data-pok="' + mi + ":" + pi + '">CONFIRM</button></span>'
            : '<span class="pill' + (st === "done" ? " ok" : st === "failed" ? " bad" : "") + '">' + { working: "WORKING", done: "DONE", cancelled: "CANCELLED", failed: "NOT DONE" }[st] + "</span>") + "</div>";
      });
      html += "</div>";
    });
    if (askBusy) html += '<div class="amsg bot thinking"><div class="atext">' + (askState.deep ? "Thinking harder…" : "Working…") + "</div></div>";
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
    $("askDeep").setAttribute("aria-pressed", String(!!askState.deep));
    $("askSend").disabled = askBusy || navigator.onLine === false;
    $("askSend").textContent = askBusy ? "…" : navigator.onLine === false ? "OFFLINE" : "SEND";
    $("askMeter").textContent = spendLine(state.aiSpend);
  }
  function askSend() {
    var text = $("askText").value.trim();
    if (!text || askBusy) return;
    if (askEgg(text)) { $("askText").value = ""; return; }
    if (mlAskRoute(text)) { $("askText").value = ""; return; }   /* a recipe to bring in: MEALS, not the chat (2.60) */
    freshAsk();
    askState.msgs.push({ role: "user", text: text.slice(0, 2000) });
    $("askText").value = "";
    $("askErr").textContent = "";
    askBusy = true;
    saveAsk(); renderAsk();
    var turns = askState.msgs.map(function (m) { return { role: m.role, text: m.text }; });
    apiPost({ action: "ask", cid: newCid(), mode: askState.deep ? "deep" : "fast", messages: turns, context: askState.context, ignore: ignoreList, breaks: breakList }, 150000).then(function (j) {
      askState.msgs.push({ role: "assistant", text: j.reply, model: j.model, cost: j.cost, proposals: (j.proposals || []).map(function (p) { p.state = "pending"; return p; }) });
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
    }).catch(function (err) {
      askState.msgs.pop();
      $("askText").value = text;
      if (err && err.spend) state.aiSpend = err.spend;
      $("askErr").textContent = describeAi(err);
      if (err && err.code === "ai_budget") $("askErr").insertAdjacentHTML("beforeend", ' <button type="button" class="btn sm" id="askContinue">CONTINUE THIS MONTH</button>');
    }).then(function () {
      askBusy = false;
      saveAsk(); renderAsk();
    });
  }
  /* CONFIRM: make the change exactly as the app's own buttons would. */
  function runProposal(mi, pi) {
    var p = askState.msgs[mi].proposals[pi], i = p.input, today = ymd(new Date());
    var finish = function (ok, noteText) { p.state = ok ? "done" : "failed"; p.note = noteText || ""; saveAsk(); renderAsk(); render(true); };
    var fail = function (err) { finish(false, "Not done: " + describeTasks(err)); };
    p.state = "working"; renderAsk();
    if (p.kind === "add_task") {
      apiPost({ action: "addtask", task: { cid: newCid(), title: i.title.slice(0, 200), area: i.life_area || null, priority: i.priority || null, day: i.focus_day || null } })
        .then(function () { loadTasks(today, true); if (i.focus_day && i.focus_day !== today) loadTasks(i.focus_day, true); finish(true, "Added to your Master Task List."); }, fail);
    } else if (p.kind === "set_focus") {
      apiPost({ action: "focus", id: i.task_id, day: i.day === "none" ? null : i.day })
        .then(function () { loadTasks(today, true); if (i.day !== "none" && i.day !== today) loadTasks(i.day, true); finish(true, i.day === "none" ? "Unpicked." : "Picked."); }, fail);
    } else if (p.kind === "set_status") {
      apiPost({ action: "status", id: i.task_id, status: i.status }).then(function () { loadTasks(today, true); finish(true, "Updated in Notion."); }, fail);
    } else if (p.kind === "add_key_date") {
      state.queue.push({ kind: "date", cid: newCid(), title: i.title.slice(0, 200), start: i.start, end: i.end && i.end !== i.start ? i.end : null, area: i.life_area || null, type: i.type || null, yearly: !!i.yearly, created: Date.now(), attempts: 0 });
      saveQueue(); flushQueue(true); finish(true, "Saving to Key Dates.");
    } else if (p.kind === "add_event") {
      var area = i.calendar === "farm" && WRITABLE.indexOf("farm") > -1 ? "farm" : i.calendar === "growth" && WRITABLE.indexOf("hobby") > -1 ? "hobby" : "personal";
      var item = { cid: newCid(), area: area, title: i.title.slice(0, 200), created: Date.now(), attempts: 0 };
      if (i.all_day) { item.allDay = true; item.start = i.date; item.end = ymd(addDays(parseYmd(i.date), 1)); }
      else {
        var s = parseYmd(i.date), hmv = String(i.start_time).split(":");
        s.setHours(+hmv[0], +hmv[1], 0, 0);
        item.allDay = false; item.start = s.toISOString(); item.end = new Date(s.getTime() + Math.max(5, Math.min(600, i.minutes || 30)) * 60000).toISOString();
      }
      state.queue.push(item); saveQueue(); flushQueue(true); finish(true, "Saving to your " + areaName(area) + " calendar.");
    } else if (p.kind === "review_draft") {
      var wk = ymd(sow(parseYmd(i.week_start)));
      [["went_well", "wentWell"], ["drained", "drained"], ["next_focus", "nextFocus"], ["bearing", "bearing"], ["summary", "summary"]].forEach(function (f) {
        if (!i[f[0]]) return;
        saveDraft(wk, f[1], i[f[0]]);
        if (state.screen === "review" && ymd(sow(state.anchor)) === wk && $("rv-" + f[1])) $("rv-" + f[1]).value = i[f[0]];
      });
      finish(true, "Placed in Review as a draft. Open REVIEW to check and save.");
    } else finish(false, "Unknown change.");
  }
  /* OPEN IN CLAUDE: the question first, then the snapshot. The whole text goes to the clipboard. The link carries at
     most CLAUDE_LINK_MAX characters (a longer address risks claude.ai opening empty), so when it doesn't fit, whole
     sections are left out, least needed first, the prompt starts with a marker, and a line says what was left out
     (2.30.2: it used to be cut mid-sentence, the question last and lost). */
  var CLAUDE_LINK_MAX = 6000;
  var CLAUDE_DROP = ["apiary", "tarot readings", "finances", "ignored event titles", "lists of life areas and types", "weather", "key dates", "open tasks", "the next 6 days"];
  function claudePrompt(q) {
    var head = (q ? "My question: " + q + "\n\n" : "") + "Here is a snapshot from my TimothyOS dashboard. Use it to help me.\n\n";
    var secs = briefing(true).map(function (x) { return { t: x.t.replace(/\[[0-9a-f-]{32,36}\] /g, ""), k: x.k }; });
    var join = function (list) { return list.map(function (x) { return x.t; }).join("\n\n"); };
    var full = head + join(secs);
    if (full.length <= CLAUDE_LINK_MAX) return { full: full, link: full, left: [] };
    var mark = "[SNAPSHOT SHORTENED · PASTE FROM CLIPBOARD FOR THE FULL VERSION]\n\n", left = [], keep = secs, link = full;
    for (var i = 0; i < CLAUDE_DROP.length; i++) {
      var k = CLAUDE_DROP[i];
      if (!keep.some(function (x) { return x.k === k; })) continue;
      keep = keep.filter(function (x) { return x.k !== k; }); left.push(k);
      link = mark + head + join(keep) + "\n\n(Left out to fit: " + left.join(", ") + ".)";
      if (link.length <= CLAUDE_LINK_MAX) break;
    }
    if (link.length > CLAUDE_LINK_MAX) link = link.slice(0, CLAUDE_LINK_MAX);   /* still too long (a very long question): cut, as before */
    return { full: full, link: link, left: left };
  }
  function openInClaude() {
    var q = $("askText").value.trim() || (askState && askState.msgs.length ? askState.msgs.filter(function (m) { return m.role === "user"; }).slice(-1)[0].text : "");
    var pr = claudePrompt(q), text = pr.full;
    try { navigator.clipboard.writeText(text).catch(function () {}); } catch (e) { /* clipboard not allowed */ }
    var a = document.createElement("a");
    a.href = "https://claude.ai/new?q=" + encodeURIComponent(pr.link);
    a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Snapshot copied. If Claude opens empty, paste it.");
  }
  var aiSpendAt = 0;
  function loadAiSpend(force) {
    if (!state.conn || !canAsk() || (!force && Date.now() - aiSpendAt < FRESH_MS)) return;
    aiSpendAt = Date.now();
    api({ action: "aispend" }).then(function (j) {
      if (j.ai) { state.aiSpend = j.ai; lsSet(LS_AISPEND, j.ai); }
      state.aiLog = j.log || null;
      if (!$("askScrim").hidden) renderAsk();
      if (state.screen === "systems") render(true);
    }).catch(function () { /* shown next time */ });
  }
  function aiSection() {
    var s = state.aiSpend, html = "<section>" + phead("ASK CLAUDE", canAsk() ? "ON" : "OFF");
    if (!canAsk()) return html + '<div class="stubbox"><span class="pill">SETUP</span><span>Needs ANTHROPIC_API_KEY in its Script Properties. Steps are in the README under <b>Ask Claude</b>.</span></div></section>';
    var capText = (s && s.cap) || 10, pct = s ? Math.min(100, Math.round(s.usd / capText * 100)) : 0, mark = s ? Math.min(100, Math.round(s.budget / capText * 100)) : 80;
    html += '<dl class="kv"><dt>THIS MONTH</dt><dd>' + (s ? '<div class="aimeter" style="--mark:' + mark + '%"><span style="width:' + pct + '%" class="' + (s.usd >= s.budget ? "hot" : pct >= 60 ? "warm" : "") + '"></span><i aria-hidden="true"></i></div><span class="tnum">$' + s.usd.toFixed(2) + " · reminder at $" + s.budget.toFixed(2) + (s.usd >= s.budget && s.cont ? " (continued)" : "") + " · $" + capText.toFixed(0) + " ceiling in the Claude Console · " + s.calls + " calls</span>" : '<span class="muted">Not loaded yet</span>') + "</dd>" +
      "<dt>MODELS</dt><dd>Sonnet 5.5 for questions, weekly summaries and the morning briefing · Opus 5.5 for THINK HARDER</dd>" +
      "<dt>MORNING BRIEFING</dt><dd>" + (state.caps.indexOf("brief") < 0 ? "Needs the Google bridge updated (README, Updating the Google bridge)." : (lsGet(LS_BRIEFOFF) ? "Off. " : "On: written the first time Bridge is in front after 06:00, about 1 to 2¢ a day. ") +
        '<button type="button" class="chip sm" data-brief="' + (lsGet(LS_BRIEFOFF) ? "on" : "off") + '">' + (lsGet(LS_BRIEFOFF) ? "TURN ON" : "TURN OFF") + "</button>" + vaLine() + briefVoiceLine() + newsSetLine()) + "</dd>" +
      "<dt>SAFEGUARDS</dt><dd>Pauses at the reminder (AI_BUDGET_USD) with CONTINUE for the rest of the month. The hard stop is the Claude Console: prepaid credit, auto-reload off. Every change waits for CONFIRM.</dd>" +
      '<dt>MATCH THE CONSOLE</dt><dd><div class="ai-match"><input type="text" id="aiMatch" inputmode="decimal" placeholder="$ this month in the Console" aria-label="This month\'s spend shown in the Claude Console"><button type="button" class="btn sm" data-act="aimatch">MATCH</button></div>' +
      '<small class="muted">The count here is worked out from each answer\'s tokens at list prices. Enter the Console\'s figure to line the two up; new questions add on from there.</small></dd></dl>';
    var log = state.aiLog;
    if (log && log.length) html += '<div class="ov-sub" style="margin-top:14px">RECENT QUESTIONS</div><div class="ai-log">' + log.slice(0, 8).map(function (x) {
      var d = new Date(x.t), when = DOW[d.getDay()] + " " + hm(d);
      if (x.mode === "matched") return '<div class="ai-row"><span class="tnum">' + when + "</span><span>MATCHED TO THE CONSOLE</span><span></span><span class=\"tnum\">$" + Number(x.usd).toFixed(2) + "</span></div>";
      var k = function (n) { return n >= 1000 ? (Math.round(n / 100) / 10) + "K" : String(n || 0); };
      return '<div class="ai-row"><span class="tnum">' + when + "</span><span>" + ({ fast: "QUESTION", deep: "THINK HARDER", summary: "SUMMARY", patterns: "PATTERNS", tarot: "TAROT SUGGESTION", brief: "BRIEFING", year: "SHIP'S YEAR", sort: "INBOX SORTING", sessions: "SESSIONS" }[x.mode] || "ASK") + " · " + modelName(x.model) + (x.unknown ? ' <span class="warntxt">PRICE UNKNOWN</span>' : "") +
        '</span><span class="muted tnum">' + k((x.in || 0) + (x.cw || 0) + (x.cr || 0)) + " in · " + k(x.out) + ' out</span><span class="tnum">' + money(x.usd || 0) + "</span></div>";
    }).join("") + "</div>";
    html += '<small class="muted">Questions and the snapshot of your calendars, tasks and key dates are sent to Anthropic to answer them.</small></section>';
    return html;
  }
  function aiMatch() {
    var v = parseFloat(String(($("aiMatch") || {}).value || "").replace(/[^0-9.]/g, ""));
    if (!isFinite(v)) { toast("Type the Console's figure for this month, like 0.01."); return; }
    apiPost({ action: "aispendset", usd: v }).then(function (j) {
      if (j.spend) { state.aiSpend = j.spend; lsSet(LS_AISPEND, j.spend); }
      toast("Matched: $" + v.toFixed(2) + " this month");
      loadAiSpend(true);
      render(true);
    }).catch(function (err) { toast("Not matched: " + describeAi(err)); });
  }

