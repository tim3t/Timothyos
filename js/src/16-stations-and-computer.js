  /* ---------- Stations: the pinned side bar and ALL STATIONS ---------- */
  /* The bar holds up to seven stations Timothy picks (EDIT PINS in ALL STATIONS); every station,
     pinned or not, is in the launcher. BRIDGE always keeps the corner. Pins live on this iPad. */
  var LS_PINS = "tos.pins.v1", MAX_PINS = 7;
  var STATIONS = [
    { id: "bridge", name: "BRIDGE", g: "TIME", sub: "Everything at a glance. Always in the corner.", fixed: true },
    { id: "today", name: "TODAY", g: "TIME", sub: "Day timeline, priorities, key dates" },
    { id: "week", name: "WEEK", g: "TIME", sub: "Seven days side by side" },
    { id: "month", name: "MONTH", g: "TIME", sub: "The month at a glance" },
    { id: "loom", name: "LOOM", g: "TIME", sub: "The infinity loop of days" },
    { id: "dates", name: "DATES", g: "TIME", sub: "Key dates, next 12 months" },
    { id: "inbox", name: "INBOX", g: "TIME", sub: "Notes to sort into tasks, dates, events or the queue" },
    { id: "review", name: "REVIEW", g: "REFLECT", sub: "Weekly reviews and trends" },
    { id: "log", name: "LOG", g: "REFLECT", sub: "Captain's Log, PIN locked" },
    { id: "habits", name: "HABITS", g: "REFLECT", sub: "Meditation, walk, water, debit card" },
    { id: "tarot", name: "TAROT", g: "REFLECT", sub: "This week's card, readings and patterns" },
    { id: "astrometrics", name: "ASTROMETRICS", g: "REFLECT", sub: "The year at a glance, and the Ship's Year" },
    { id: "ressikan", name: "RESSIKAN", g: "REFLECT", sub: "Play with sound: chords over a beat, and a solo on top" },
    { id: "ledger", name: "LEDGER", g: "RESOURCES", sub: "YNAB at a glance, read only" },
    { id: "library", name: "LIBRARY", g: "RESOURCES", sub: "Reading, want to read, read" },
    { id: "storage", name: "HOLODECK · AUDIO", g: "RESOURCES", sub: "Your NAS folders: podcasts, music, audiobooks", inside: "holodeck" },   /* 2.47: STORAGE became HOLODECK's AUDIO program; reached from the arch, never listed on its own */
    { id: "holodeck", name: "HOLODECK", g: "RESOURCES", sub: "The arch: TV channels always on air, and your NAS audio" },
    { id: "engineering", name: "ENGINEERING", g: "RESOURCES", sub: "Home Assistant devices and upkeep" },
    { id: "apiary", name: "APIARY", g: "RESOURCES", sub: "Hives, checks and honey" },
    { id: "science", name: "SCIENCE", g: "SCIENCE", sub: "Sky traffic, space weather, earth, night sky, nature" },
    { id: "sickbay", name: "SICKBAY", g: "SCIENCE", sub: "Health from your watch: vitals, sleep, medicines, readings" },
    { id: "meals", name: "MEALS", g: "RESOURCES", sub: "Plan dinners, the grocery list, what was for dinner" },
    { id: "arboretum", name: "ARBORETUM", g: "RESOURCES", sub: "The garden from above: zones, beds, what's planted, the season's jobs" }
  ];
  var ST_GROUPS = [["TIME", "chrome-b"], ["REFLECT", "chrome-a"], ["RESOURCES", "chrome-d"], ["SCIENCE", "personal"], ["STANDBY", "line"]];
  var BAR_COLORS = ["chrome-b", "chrome-d", "chrome-a", "chrome-c", "chrome-b", "chrome-d", "chrome-a"];   /* no two neighbours alike; ALL STATIONS is lavender, SYSTEMS orchid */
  var DEFAULT_PINS = ["today", "week", "loom", "review", "log", "habits", "library"];
  var navSig = "";
  function station(id) { return STATIONS.filter(function (s) { return s.id === id; })[0]; }
  function navId() { var s = station(state.screen); return s && s.inside ? s.inside : state.screen; }   /* the station a screen belongs to: AUDIO lights HOLODECK */
  function pins() {
    var p = lsGet(LS_PINS), seen = {};
    if (!Array.isArray(p)) p = DEFAULT_PINS;
    p = p.map(function (id) { var s = station(id); return s && s.inside ? s.inside : id; });   /* a STORAGE pin is a HOLODECK pin now */
    return p.filter(function (id) { var s = station(id); if (!s || s.fixed || s.standby || seen[id]) return false; seen[id] = 1; return true; }).slice(0, MAX_PINS);
  }
  function renderNav() {
    var on = pins(), here = station(navId()), loose = !!here && !here.fixed && on.indexOf(here.id) < 0;
    var sig = on.join(",");
    if (sig !== navSig) {   /* rebuilt only when the pins change, so a press's light-up isn't cut short */
      navSig = sig;
      $("pins").innerHTML = STATIONS.filter(function (s) { return on.indexOf(s.id) > -1; }).map(function (s, i) {
        return '<button class="nav" data-screen="' + s.id + '" style="--c: var(--' + BAR_COLORS[i % BAR_COLORS.length] + ')" type="button">' + s.name + "</button>";
      }).join("");
    }
    var all = $("allBtn");
    all.setAttribute("aria-expanded", String(!!state.launch));
    all.innerHTML = '<span class="st-grid" aria-hidden="true">' + new Array(10).join("<i></i>") + '</span><span class="st-lbl">ALL STATIONS' + (loose ? "<small>· " + here.name + "</small>" : "") + "</span>";
    if (loose && !state.launch) all.setAttribute("aria-current", "page"); else all.removeAttribute("aria-current");
  }
  function renderLaunch() {
    var on = pins(), edit = !!state.pinEdit, html = '<div class="st-head">' + phead((STATIONS.filter(function (s) { return !s.inside; }).length - 3) + " STATIONS", on.length + " OF " + MAX_PINS + " IN THE BAR") +
      '<button type="button" class="btn sm' + (edit ? "" : " ghost") + '" data-pins="1" aria-pressed="' + edit + '">' + (edit ? "DONE" : "EDIT PINS") + "</button>" +
      '<button type="button" class="btn sm ghost" data-launch="close">CLOSE</button></div>';
    if (edit) html += '<div class="st-note"><b>EDIT PINS</b>Tap a station to pin or unpin it. Up to ' + MAX_PINS + " sit in the bar, in this order. BRIDGE always keeps the corner. The bar changes as you tap.</div>";
    ST_GROUPS.forEach(function (g) {
      if (!STATIONS.some(function (s) { return s.g === g[0] && !s.inside; })) return;   /* STANDBY is empty since MEALS (2.59) */
      html += '<div class="st-group">' + phead(g[0], g[0] === "STANDBY" ? "COMING LATER" : "", g[1]) + '<div class="st-tiles">';
      STATIONS.filter(function (s) { return s.g === g[0] && !s.inside; }).forEach(function (s) {
        var pinned = on.indexOf(s.id) > -1;
        var tag = s.standby ? '<span class="pill">STANDBY</span>' :
          edit ? '<span class="st-pin' + (pinned || s.fixed ? " on" : "") + '">' + (s.fixed ? "CORNER" : pinned ? "PINNED" : on.length >= MAX_PINS ? "BAR FULL" : "+ PIN") + "</span>" :
          (pinned || s.fixed ? "" : '<span class="pill">IN HERE</span>');
        html += '<button type="button" class="st-tile' + (s.standby ? " st-off" : "") + '" style="--c: var(--' + (s.standby ? "line" : g[1]) + ')" data-station="' + s.id + '"' +
          (navId() === s.id && !edit ? ' aria-current="page"' : "") + (s.standby ? " disabled" : "") +
          '><span class="st-row"><b>' + s.name + "</b>" + tag + "</span><small>" + esc(s.sub) + "</small></button>";
      });
      html += "</div></div>";
    });
    $("launch").innerHTML = html;
  }
  function openLaunch(open) {
    state.launch = !!open;
    if (!open) state.pinEdit = false;
    $("launch").hidden = !open;
    $("content").hidden = !!open;
    if (open) { renderLaunch(); $("launch").scrollTop = 0; if (!calm()) restartClass($("launch"), "enter"); }
    renderHeader();
  }
  $("allBtn").addEventListener("click", function () { openLaunch(!state.launch); });
  $("pins").addEventListener("click", function (e) {
    var b = e.target.closest("[data-screen]");
    if (b) go(b.dataset.screen, b.dataset.screen === "today" ? new Date() : null);
  });
  $("launch").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.launch === "close") { openLaunch(false); return; }
    if (b.dataset.pins) { state.pinEdit = !state.pinEdit; renderLaunch(); return; }
    var id = b.dataset.station, s = id && station(id);
    if (!s || s.standby) return;
    if (!state.pinEdit) { go(id, id === "today" ? new Date() : null); return; }
    if (s.fixed) { toast("BRIDGE keeps the corner"); return; }
    var on = pins(), at = on.indexOf(id);
    if (at > -1) on.splice(at, 1);
    else if (on.length >= MAX_PINS) { toast("The bar holds " + MAX_PINS + ". Unpin one first."); return; }
    else on.push(id);
    lsSet(LS_PINS, STATIONS.map(function (x) { return x.id; }).filter(function (x) { return on.indexOf(x) > -1; }));
    renderLaunch(); renderHeader();
  });

  /* ---------- COMPUTER (2.35): find any station, or something to do inside one ---------- */
  /* Opens from COMPUTER in the header, ⌘K (or Ctrl+K) on a keyboard, or a swipe down on the bar.
     Empty, it lists what's waiting (the Bridge's Condition items), recent stations and unpinned ones
     not opened lately; typing narrows stations, actions, books, hives, episodes and cards. Matching
     runs on this iPad: nothing typed here goes to the bridge or Claude. A row only opens things; every
     change still happens on the screen it opens, with that screen's own buttons. */
  var LS_VISITS = "tos.visits.v1", CMD_QUIET_DAYS = 14, CMD_MAX = 12;
  var visits = lsGet(LS_VISITS) || {};
  if (!visits._since) { visits._since = Date.now(); lsSet(LS_VISITS, visits); }   /* "not opened lately" counts from the first run with COMPUTER */
  function cmdSeen(id) { if (!visits || !id) return; visits[id] = Date.now(); lsSet(LS_VISITS, visits); }
  var CMD_WORDS = {
    bridge: "home overview condition dashboard", today: "day calendar schedule agenda priorities", week: "calendar schedule",
    month: "calendar", loom: "infinity timeline calendar days", dates: "key dates birthdays anniversaries holidays countdown",
    review: "weekly reflection", log: "journal diary captains entries", habits: "water meditation meditated walk debit card",
    tarot: "cards reading deck", ressikan: "music sound chords chord progression loop synth synthesizer beat beats lofi drums solo melody lead play instrument flute midi garageband", science: "sky aircraft planes flights radar iss space station satellites aurora space weather shortwave earthquakes quakes air quality alerts moon planets stars night meteors asteroids birds nature sensors", inbox: "notes note capture sort ideas thoughts later jot", astrometrics: "year annual stats statistics star chart ships year how did the year go", ledger: "money budget ynab finances spending replicator queue", library: "books reading",
    storage: "storage nas podcasts podcast audio music files listen radio audiobooks", holodeck: "tv television video videos music videos channel watch broadcast mtv vh1 cartoons shows", engineering: "home assistant lights devices thermostat upkeep maintenance",
    apiary: "bees hives beekeeping honey mites", systems: "settings setup health sync connection"
  };
  var CMD_G = { TIME: "chrome-b", REFLECT: "chrome-a", RESOURCES: "chrome-d", SCIENCE: "personal", SYSTEMS: "chrome-c" };
  var CMD_RANK = { STATION: 0, ACTION: 1, SETTING: 3 };
  var cmd = { sel: 0, shown: [] };
  function cmdStation(id) {
    var s = id === "systems" ? { id: "systems", name: "SYSTEMS", g: "SYSTEMS", sub: "Settings, connections and health" } : station(id);
    return s && { t: s.name, s: s.sub, g: s.g, k: "STATION", w: CMD_WORDS[id] || "", run: function () { go(id, id === "today" ? new Date() : null); } };
  }
  /* Systems, scrolled to a section by its heading. */
  function sysJump(title) {
    go("systems");
    var sec = Array.prototype.filter.call(document.querySelectorAll("#content section"), function (s) { var h = s.querySelector(".phead h2"); return h && h.textContent.trim().indexOf(title) === 0; })[0];
    if (sec) { sec.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" }); restartClass(sec, "flash"); }
  }
  function cmdClick(sel) { var b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; }
  function cmdHive(h, then) {
    go("apiary");
    if (!ap.data) return;
    ap.hive = h.id; ap.box = null; ap.fresh = null; ap.form = null; ap.tu = null; ap.view = "hive";
    render(false); $("content").scrollTop = 0;
    if (then) cmdClick('[data-apact="' + then + '"]');
  }
  function cmdItems() {
    var out = [], A = function (t, s, g, w, run, k) { out.push({ t: t, s: s, g: g, k: k || "ACTION", w: w || "", run: run }); };
    STATIONS.forEach(function (s) { if (!s.standby) out.push(cmdStation(s.id)); });
    out.push(cmdStation("systems"));
    if (!state.conn) return out;
    var today = sod(new Date());
    if (canPlan()) {
      A("Plan the day", "TODAY · PLAN DAY", "TIME", "priorities pick tasks", function () { openPlan(today); });
      A("Plan tomorrow", "TODAY · PLAN DAY", "TIME", "priorities pick tasks", function () { openPlan(addDays(today, 1)); });
    }
    if (canCreate()) A("Capture an event", "CAPTURE · ON A CALENDAR", "TIME", "add new event calendar reminder", function () { openCapture(); });
    if (canDates()) A("Add a key date", "CAPTURE · KEY DATE", "TIME", "new birthday anniversary deadline", function () { openCapture(null, null, "date"); });
    if (canReviews()) {
      A("Write this week's review", "REVIEW · " + weekLabel(defaultReviewWeek()), "REFLECT", "weekly reflection", function () { go("review", defaultReviewWeek()); });
      A("Review trends and patterns", "REVIEW · ALL REVIEWS", "REFLECT", "weekly history", function () { go("review"); });
    }
    if (canScience()) {
      var sciGo = function (t) { return function () { sc.tab = t; go("science"); }; };
      A("Aircraft overhead", "SCIENCE · SKY TRAFFIC", "SCIENCE", "planes flights radar sky", sciGo("sky"));
      A("When is the ISS overhead?", "SCIENCE · SPACE STATIONS", "SCIENCE", "iss space station passes satellites tiangong hubble", sciGo("sky"));
      A("Aurora and space weather", "SCIENCE · SPACE WEATHER", "SCIENCE", "kp geomagnetic storm solar flare shortwave bands", sciGo("space"));
      A("Earthquakes and alerts", "SCIENCE · EARTH", "SCIENCE", "quake usgs weather alert air quality aqi", sciGo("earth"));
      A("Tonight's sky", "SCIENCE · NIGHT SKY", "SCIENCE", "moon planets meteors eclipse asteroid stars", sciGo("night"));
    }
    A("Tune in to the HOLODECK", "HOLODECK · VISUAL", "RESOURCES", "tv watch video videos channel", function () { go("holodeck"); holo.enter("visual"); });
    A("Play chords over a beat", "RESSIKAN · CHORDS", "REFLECT", "music chords progression loop synth beat lofi drums", function () { rs.card("chords"); go("ressikan"); });
    A("Solo over the loop", "RESSIKAN · SOLO", "REFLECT", "solo melody lead flute improvise jam", function () { rs.card("solo"); go("ressikan"); });
    if (canInbox()) {
      A("Write a note", "CAPTURE · NOTE", "TIME", "jot idea thought inbox later", function () { openCapture(null, null, "note"); });
      ((ib.data && ib.data.waiting) || []).concat((ib.data && ib.data.kept) || []).forEach(function (n) {
        A(String(n.text).replace(/\s+/g, " ").slice(0, 90), "INBOX · " + (n.status === "kept" ? "KEPT" : "WAITING"), "TIME", "note", function () {
          go("inbox"); ib.tab = n.status === "kept" ? "kept" : "waiting"; render(false);
          var el = $("ibn-" + n.id); if (el) { el.scrollIntoView({ block: "center" }); restartClass(el, "flash"); }
        }, "NOTE");
      });
    }
    if (canShipsYear()) A("Compile the Ship's Year", "ASTROMETRICS · SHIP'S YEAR", "REFLECT", "year annual summary review of the year", function () { go("astrometrics"); shipCompile(as.y, false); });
    if (canLog()) {
      if (canLogSearch()) A("Search the log", "LOG · SEARCH THE LOG", "REFLECT", "journal diary find", function () { go("log"); lg.after = "find"; });
      if (canLogAsk()) A("Ask Claude about the log", "LOG · ASK CLAUDE", "REFLECT", "journal diary themes", function () { go("log"); lg.after = "ask"; });
      if (canSessions()) A("Session notes", "LOG · SESSIONS", "REFLECT", "therapy counseling counselling counselor sessions solo couples", function () { logTab = "sessions"; go("log"); });
    }
    if (canTarot()) {
      A("Record this week's card", "TAROT · THIS WEEK'S CARD", "REFLECT", "cards weekly draw", function () { go("tarot"); if (!cmdClick('[data-trgo="weekly"]') && tr.data) toast("This week's card is already recorded"); });
      A("New tarot reading", "TAROT · + NEW READING", "REFLECT", "cards spread draw", function () { trGo("new"); });
      A("Build a spread", "TAROT · MY SPREADS", "REFLECT", "cards layout positions", function () { trGo("builder"); });
      TR_DECK.forEach(function (id) { A(trName(id), "TAROT · EVERY TIME THIS CARD CAME UP", "REFLECT", "card history meaning", function () { go("tarot"); if (tr.data) trHistory(id); }, "CARD"); });
    }
    if (canAsk()) A("Ask the ship's computer", "ASK · CLAUDE", "TIME", "question claude ai", function () { openAsk(); });
    if (canBrief()) A("Morning briefing", "BRIDGE · MORNING BRIEFING", "TIME", "brief report summary morning read aloud", function () {
      go("bridge");
      if (briefToday()) { br.b.fold = false; briefSave(); render(true); } else if (!br.busy && minsOf(new Date()) >= BRIEF_FROM) briefCompile(true);
    });
    if (canLedger()) A("Add to the Replicator Queue", "LEDGER · REPLICATOR QUEUE", "RESOURCES", "buy wish list want", function () { go("ledger"); var q = $("qName"); if (q) { q.scrollIntoView({ block: "center" }); q.focus(); } });
    if (canLibrary()) {
      A("Add a book", "LIBRARY · + ADD BOOK", "RESOURCES", "books new search", function () { go("library"); openAddBook(); });
      books().forEach(function (b) {
        var sh = SHELVES.filter(function (x) { return x[0] === b.status; })[0];
        A(b.title, "LIBRARY · " + (sh ? sh[1] : "BOOK") + (b.author ? " · " + b.author : ""), "RESOURCES", "book", function () { go("library"); openBook(b.id); }, "BOOK");
      });
    }
    if (canApiary() && ap.data) {
      A("Add a hive", "APIARY · + ADD HIVE", "RESOURCES", "bees new package nuc split", function () { go("apiary"); ap.view = "yard"; ap.hive = null; render(false); cmdClick('[data-apact="addhive"]'); });
      apHives().forEach(function (h) {
        A(h.name, "APIARY · HIVE", "RESOURCES", "bees", function () { cmdHive(h); }, "HIVE");
        A("New hive check · " + h.name, "APIARY · + NEW CHECK", "RESOURCES", "bees inspection inspect", function () { cmdHive(h, "new"); });
        A("True up stack · " + h.name, "APIARY · TRUE UP STACK", "RESOURCES", "bees boxes supers deeps feeder", function () { cmdHive(h, "trueup"); });
      });
    }
    if (nasConf()) Object.keys(plays).filter(function (k) { var r = plays[k]; return !r.done && r.p > 30; }).sort(function (a, b) { return plays[b].at - plays[a].at; }).slice(0, 5).forEach(function (k) {
      var r = plays[k];
      A("Continue · " + dispName(k), "HOLODECK · AUDIO · " + baseName(parentOf(k)) + (r.d ? " · " + mmss(r.d - r.p) + " left" : ""), "RESOURCES", "listen podcast episode resume", function () { go("storage"); storageClick({ dataset: { nasresume: k } }); }, "EPISODE");
    });
    if (canMeals()) {
      var mlGo = function (tab, sel) { mlView.tab = tab; ml.wk = 0; ml.sel = sel || null; ml.form = null; go("meals"); };
      A("Record dinner", "MEALS · TONIGHT", "RESOURCES", "dinner supper ate had food meal tonight", function () { mlGo("plan", mlToday()); });
      A("Plan meals", "MEALS · THIS WEEK", "RESOURCES", "menu dinner week plan food", function () { mlGo("plan"); });
      if (canMealImport()) A("Add a recipe", "MEALS · + FROM A RECIPE", "RESOURCES", "recipe import pinterest link paste photo cookbook", function () { mlGo("plan"); mlClick({ dataset: { ml: "imp" } }); });
      A("Grocery list", "MEALS · GROCERIES", "RESOURCES", "shopping groceries buy store list print", function () { mlGo("plan"); var g = document.querySelector(".ml-groc"); if (g) g.scrollIntoView({ block: "start" }); });
      mlMeals().forEach(function (m) { var r = mlRot(m.id); A(m.name, "MEALS · " + (r.since === null ? "NOT MADE YET" : "LAST " + mlAgo(r.since).toUpperCase()), "RESOURCES", "meal dinner recipe", function () { mlGo("log"); }, "MEAL"); });
    }
    A("Garden jobs this season", "ARBORETUM · QUICK GLANCE", "RESOURCES", "garden plants season jobs prune plant beds", function () { arbGo("glance"); });
    A("Garden map", "ARBORETUM · MAP", "RESOURCES", "garden plants zones beds pond meadow", function () { arbGo("map"); });
    ["z1", "z2", "z3", "pond", "meadow"].forEach(function (z) { var nm = { z1: "Zone 1", z2: "Zone 2", z3: "Zone 3", pond: "The Pond", meadow: "The Meadow" }[z]; A(nm, "ARBORETUM · WHAT'S PLANTED", "RESOURCES", "garden zone beds plants", function () { arbGo("zone", z); }); });
    if (canSickbay()) {
      A("Health and vitals", "SICKBAY · VITALS", "SCIENCE", "health heart rate hrv readiness watch vitals", function () { skClick({ dataset: { skgo: "vitals" } }); });
      A("Last night's sleep", "SICKBAY · SLEEP", "SCIENCE", "sleep night deep rem bed", function () { skClick({ dataset: { skgo: "sleep" } }); });
      A("Medicines and readings", "SICKBAY · RECORDS", "SCIENCE", "medicine pills supplements blood pressure weight notes doctor appointment", function () { skClick({ dataset: { skgo: "records" } }); });
      A("Sync from Health", "SICKBAY · SYNC FROM HEALTH", "SCIENCE", "apple watch health shortcut sync", function () { go("sickbay"); skSync(); });
    }
    A("Upkeep", "ENGINEERING · UPKEEP", "RESOURCES", "maintenance filter overdue", function () { eng.tab = "upkeep"; lsSet(LS_ENGTAB, "upkeep"); go("engineering"); });
    upkeepItems().forEach(function (u) { A(u.name, "ENGINEERING · UPKEEP" + (u.cat ? " · " + u.cat : ""), "RESOURCES", "maintenance", function () { eng.tab = "upkeep"; lsSet(LS_ENGTAB, "upkeep"); go("engineering"); }, "UPKEEP"); });
    var S = function (t, sec, w, run) { A(t, run ? sec : "SYSTEMS · " + sec, "SYSTEMS", w, run || function () { sysJump(sec); }, "SETTING"); };
    S("Refresh now", "SYSTEMS · REFRESH NOW", "sync reload update", function () { go("systems"); refreshNow(); });
    S("Make a backup", "BACKUP AND RESTORE", "restore save file");
    S("Ignored events and breaks", "CALENDARS", "hide lunch out of office");
    S("Location, bearings and start screen", "BRIDGE", "weather opens on");
    S("Balance targets", "BALANCE TARGETS", "hours areas");
    S("Standby timer", "STANDBY", "dim clock screen");
    S("Standby now", "STANDBY", "dim clock sleep", function () { enterStandby(); });
    S("Edit pins", "ALL STATIONS · EDIT PINS", "bar sidebar stations", function () { openLaunch(true); state.pinEdit = true; renderLaunch(); });
    S("Ask spending", "ASK CLAUDE", "cost budget claude");
    S("Recent requests", "RECENT REQUESTS", "network errors timeout");
    S("Error log", "ERROR LOG", "errors failures problems crash diagnostic report");
    S("This iPad's storage", "THIS IPAD'S STORAGE", "space full room memory saved copies clear cache");
    S("On this day", "BRIDGE", "on this day past years ago history memories year back", function () { go("bridge"); setTimeout(function () { otdOpen(0); }, 50); });
    S("Copy diagnostics", "DIAGNOSTICS", "report problem debug support claude help broken", function () { diagCopy(false); });
    if (nasConf()) S("NAS relay", "NAS RELAY", "storage nas token tailscale holodeck");
    S("Home Assistant", "HOME ASSISTANT", "token devices");
    return out;
  }
  function cmdNorm(s) { return String(s).toLowerCase().replace(/['’]/g, ""); }
  function cmdSearch(q) {
    var nq = cmdNorm(q).trim(), words = nq.split(/\s+/).filter(Boolean), lead = new RegExp("(^|[^a-z0-9])" + words[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return cmdItems().map(function (it, i) {
      var t = cmdNorm(it.t), hay = t + " " + cmdNorm(it.s) + " " + it.w;
      if (!words.every(function (w) { return hay.indexOf(w) > -1; })) return null;
      var sc = t.indexOf(nq) === 0 ? 0 : lead.test(t) ? 1 : words.every(function (w) { return t.indexOf(w) > -1; }) ? 2 : 3;
      return { it: it, sc: sc * 10 + (CMD_RANK[it.k] == null ? 2 : CMD_RANK[it.k]), i: i };
    }).filter(Boolean).sort(function (a, b) { return a.sc - b.sc || a.i - b.i; }).map(function (x) { return x.it; });
  }
  /* What runs when a Condition item is chosen here: the same as tapping it on the Bridge. */
  function cmdCond(c, today) {
    if (c.kd) return function () { var o = state.index["kd:" + c.kd]; if (o) openKeyDate(o); else go("dates"); };
    if (c.day) return function () { go("today", parseYmd(c.day)); };
    if (c.act === "plan") return function () { openPlan(parseYmd(today)); };
    if (c.act === "review") return function () { go("review", defaultReviewWeek()); };
    if (c.act === "engineering") return function () { eng.tab = "upkeep"; lsSet(LS_ENGTAB, "upkeep"); go("engineering"); };
    if (c.act === "systems") return function () { state.fixFocus = c.fix || null; go("systems"); };
    return null;
  }
  function cmdEmpty() {
    var secs = [], now = new Date(), today = ymd(now);
    if (state.conn) {
      var wait = conditions(now, today, eventsFor(bridgeRange())).map(function (c) {
        var run = cmdCond(c, today);
        return run && { t: c.txt, s: c.sub, html: true, g: c.lvl === "bad" ? "bad" : "warn", k: c.go || "OPEN", run: run };
      }).filter(Boolean).slice(0, 4);
      if (wait.length) secs.push(["WAITING ON YOU", wait]);
    }
    var ids = STATIONS.map(function (s) { return s.id; }).concat(["systems"]);
    var recent = ids.filter(function (id) { return visits[id] && id !== state.screen; }).sort(function (a, b) { return visits[b] - visits[a]; }).slice(0, 4);
    if (recent.length) secs.push(["RECENT", recent.map(cmdStation)]);
    var on = pins(), quiet = STATIONS.filter(function (s) { return !s.fixed && !s.standby && !s.inside && on.indexOf(s.id) < 0 && s.id !== state.screen && Date.now() - (visits[s.id] || visits._since) > CMD_QUIET_DAYS * 864e5; })
      .sort(function (a, b) { return (visits[a.id] || 0) - (visits[b.id] || 0); }).slice(0, 3);
    if (quiet.length) secs.push(["NOT OPENED LATELY", quiet.map(function (s) {
      var it = cmdStation(s.id), d = Math.floor((Date.now() - (visits[s.id] || visits._since)) / 864e5);
      it.s = visits[s.id] ? "Last opened " + d + " days ago" : "Not opened in " + d + " days";
      return it;
    })]);
    if (!secs.length) secs.push(["STATIONS", ids.filter(function (id) { var s = station(id); return !s || !s.standby; }).map(cmdStation)]);
    return secs;
  }
  function cmdRow(it, i, q) {
    var t = esc(it.t);
    if (q) {
      var k = cmdNorm(it.t).indexOf(cmdNorm(q).trim().split(/\s+/)[0]);
      if (k > -1 && cmdNorm(it.t).length === it.t.length) { var n = cmdNorm(q).trim().split(/\s+/)[0].length; t = esc(it.t.slice(0, k)) + "<mark>" + esc(it.t.slice(k, k + n)) + "</mark>" + esc(it.t.slice(k + n)); }
    }
    var c = it.g === "bad" || it.g === "warn" ? it.g : CMD_G[it.g] || "chrome-c";
    return '<button type="button" class="cmd-row' + (it.k === "STATION" ? " st" : "") + '" role="option" id="cmd-o' + i + '" data-ci="' + i + '" aria-selected="' + (i === cmd.sel) + '" style="--c: var(--' + c + ')">' +
      '<i aria-hidden="true"></i><span class="tx"><b>' + t + "</b><small>" + (it.html ? it.s : esc(it.s)) + '</small></span><span class="k">' + esc(it.k) + "</span></button>";
  }
  function renderComputer(keep) {
    var q = $("cmdText").value, html = "", i = 0, was = keep && cmd.moved && cmd.shown[cmd.sel], key = function (it) { return it.k + "|" + it.t + "|" + it.s; };
    if (!q.trim()) {
      cmd.shown = [];
      cmdEmpty().forEach(function (sec) {
        html += '<div class="cmd-sec">' + sec[0] + "</div>" + sec[1].map(function (it) { cmd.shown.push(it); return cmdRow(it, i++, ""); }).join("");
      });
      html += '<div class="cmd-hint">Type to find a station, or something to do: a book, a hive, a card, a setting.</div>';
    } else {
      var all = cmdSearch(q);
      cmd.shown = all.slice(0, CMD_MAX);
      html = cmd.shown.length ? cmd.shown.map(function (it, n) { return cmdRow(it, n, q); }).join("") + (all.length > CMD_MAX ? '<div class="cmd-hint">' + (all.length - CMD_MAX) + " more. Keep typing to narrow it.</div>" : "")
        : '<div class="cmd-hint">Nothing here matches “' + esc(q.trim()) + '”. For questions about your days, try ASK.</div>';
    }
    if (was) cmd.shown.some(function (it, n) { if (key(it) === key(was)) { cmd.sel = n; return true; } return false; });   /* books or hives arriving don't move a choice made with the arrows; untouched, it stays on the first row */
    if (cmd.sel >= cmd.shown.length) cmd.sel = 0;
    $("cmdList").innerHTML = html;
    cmdMark();
  }
  function cmdMark() {
    var rows = $("cmdList").querySelectorAll(".cmd-row");
    rows.forEach(function (r) { r.setAttribute("aria-selected", String(+r.dataset.ci === cmd.sel)); });
    var cur = rows[cmd.sel];
    if (cur) { $("cmdText").setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    else $("cmdText").removeAttribute("aria-activedescendant");
  }
  function openComputer() {
    if (!state.conn || sb.on) return;
    if (cmdShown()) { closeComputer(); return; }   /* ⌘K again closes it */
    closeDetail(); closeCapture(); closePlan(); closeAsk();
    cmd.sel = 0; cmd.moved = false; $("cmdText").value = "";
    loadLibrary(false); loadApiary(false);   /* books and hives are searchable by name; the list fills in as they arrive */
    renderComputer();
    showSheet("cmdScrim");
    $("cmdText").focus();
  }
  /* Open and not on its way out: a sheet closing still shows for 200 ms, and ⌘K then means "open". */
  function cmdShown() { var s = $("cmdScrim"); return !s.hidden && !s.classList.contains("closing"); }
  function cmdFresh() { if (cmdShown()) renderComputer(true); }
  function closeComputer() { if (cmdShown()) { $("cmdText").blur(); hideSheet("cmdScrim"); } }
  function cmdRun(i) {
    var it = cmd.shown[i];
    if (!it) return;
    closeComputer();
    it.run();
  }
  $("cmdBtn").addEventListener("click", openComputer);
  $("cmdText").addEventListener("input", function () { cmd.sel = 0; cmd.moved = false; renderComputer(); $("cmdList").scrollTop = 0; });
  $("cmdText").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); var n = cmd.shown.length; if (n) { cmd.sel = (cmd.sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n; cmd.moved = true; cmdMark(); } }
    else if (e.key === "Enter") { e.preventDefault(); cmdRun(cmd.sel); }
  });
  $("cmdList").addEventListener("click", function (e) { var b = e.target.closest(".cmd-row"); if (b) cmdRun(+b.dataset.ci); });
  $("cmdScrim").addEventListener("click", function (e) { if (e.target === this) closeComputer(); });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); openComputer(); }
  });
  /* A swipe down on the bar (where it stands as a column): the same as COMPUTER. The tap that ends it opens nothing. */
  (function () {
    var side = document.querySelector(".side"), y0 = null, x0 = 0, t0 = 0, fired = false, swallow = 0;
    side.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1 || getComputedStyle(side).flexDirection !== "column") { y0 = null; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = Date.now(); fired = false;
    }, { passive: true });
    side.addEventListener("touchmove", function (e) {
      if (y0 == null || fired) return;
      var dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (dy > 70 && dx < 45 && Date.now() - t0 < 800) { fired = true; swallow = Date.now(); openComputer(); }
    }, { passive: true });
    side.addEventListener("touchend", function () { y0 = null; }, { passive: true });
    side.addEventListener("click", function (e) { if (Date.now() - swallow < 600) { e.preventDefault(); e.stopPropagation(); } }, true);
  })();
  cmdSeen(state.screen);

