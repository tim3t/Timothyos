  /* ---------- Ledger (YNAB, read-only) + Replicator Queue (Notion) ---------- */
  /* Checking, savings and loans, age of money and average spend come from YNAB
     through the bridge (bridge 1.9, YNAB_TOKEN); nothing here can change YNAB.
     The Replicator Queue is a Notion list of things to buy once the Discretionary
     category can cover them. Each item is measured against the whole balance on its own (2.51.2, Timothy's choice),
     so every one the balance covers reads FUNDS READY and he picks which to buy; the order is his preference only. */
  var LEDGER_FRESH_MS = 60 * 1000;   /* opening LEDGER asks again after a minute (2.15.1; was 5) */
  var LEDGER_RANGES = [3, 6, 12];
  function canLedger() { return state.caps.indexOf("ledger") > -1; }
  function canQueue() { return state.caps.indexOf("queue") > -1; }
  /* fresh: straight from YNAB, past the bridge's 10-minute copy (pull to refresh, REFRESH, opening the screen). */
  function loadLedger(force, fresh) {
    if (!state.conn || !(canLedger() || canQueue()) || state.ledgerInflight) return Promise.resolve();
    if (!force && state.ledger && Date.now() - state.ledger.fetched < LEDGER_FRESH_MS) return Promise.resolve();
    if (!force && state.ledgerErr && Date.now() - state.ledgerErr.at < FRESH_MS) return Promise.resolve();
    state.ledgerInflight = true;
    if (state.screen === "ledger") renderHeader();
    return api(fresh ? { action: "ledger", fresh: "1" } : { action: "ledger" }).then(function (j) {
      state.ledger = { fetched: Date.now(), ynab: j.ynab || null, ynabError: j.ynabError || null, queue: j.queue || null, queueError: j.queueError || null };
      state.ledgerErr = null;
      lsSet(LS_LEDGER, state.ledger);
    }).catch(function (err) {
      state.ledgerErr = { at: Date.now(), msg: describeTasks(err) };
    }).then(function () {
      state.ledgerInflight = false;
      if (state.screen === "ledger" || state.screen === "systems") render(true);
    });
  }
  /* Pull to refresh, on LEDGER only: drag down from the top of the screen and let go. */
  var ptr = { y0: null, dy: 0, busy: false };
  var PTR_AT = 70;
  function ptrPaint() {
    var el = $("ptr"); if (!el) return;
    var h = ptr.busy ? 48 : Math.min(ptr.dy * 0.55, 90);
    el.style.height = h + "px"; el.style.opacity = ptr.busy || ptr.dy > 8 ? 1 : 0;
    el.className = "ptr" + (ptr.busy ? " busy" : ptr.dy * 0.55 >= PTR_AT ? " ready" : "");
    el.innerHTML = ptr.busy ? '<span class="spin" aria-hidden="true"></span>REFRESHING FROM YNAB…' : ptr.dy * 0.55 >= PTR_AT ? "RELEASE TO REFRESH" : "PULL TO REFRESH";
  }
  function ledgerRefresh() {
    if (ptr.busy) return;
    ptr.busy = true; ptr.dy = 0; ptrPaint();
    var started = Date.now();
    loadLedger(true, true).then(function () {
      setTimeout(function () { ptr.busy = false; ptrPaint(); if (state.screen === "ledger" && !state.ledgerErr) toast("Ledger updated from YNAB"); }, Math.max(0, 500 - (Date.now() - started)));
    });
  }
  (function () {
    var c = $("content");
    c.addEventListener("touchstart", function (e) {
      ptr.y0 = state.screen === "ledger" && c.scrollTop <= 0 && !ptr.busy && e.touches.length === 1 ? e.touches[0].clientY : null; ptr.dy = 0;
    }, { passive: true });
    c.addEventListener("touchmove", function (e) {
      if (ptr.y0 === null) return;
      var dy = e.touches[0].clientY - ptr.y0;
      if (dy <= 0 || c.scrollTop > 0) { if (ptr.dy) { ptr.dy = 0; ptrPaint(); } return; }
      e.preventDefault();   /* the page stays put while you pull */
      ptr.dy = dy; ptrPaint();
    }, { passive: false });
    var end = function () {
      if (ptr.y0 === null) return;
      var go = ptr.dy * 0.55 >= PTR_AT;
      ptr.y0 = null; ptr.dy = 0;
      if (go) ledgerRefresh(); else ptrPaint();
    };
    c.addEventListener("touchend", end); c.addEventListener("touchcancel", end);
  })();
  function usd(v, cents) {
    if (typeof v !== "number" || !isFinite(v)) return "";
    var s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
    return (v < 0 ? "−$" : "$") + s;
  }
  function ynabErrText(code) {
    return ({
      ynab_not_configured: "Add YNAB_TOKEN in the bridge's Script Properties. Steps are in the README under <b>Ledger</b>.",
      ynab_unauthorized: "YNAB didn't accept the token. Make a new Personal Access Token in YNAB and replace YNAB_TOKEN.",
      ynab_not_found: "YNAB couldn't find that plan. Check YNAB_PLAN_ID, or remove it to use the plan you opened last.",
      ynab_busy: "YNAB asked us to slow down (200 requests an hour). Showing the last numbers; it retries shortly."
    })[code] || "YNAB didn't answer (" + esc(code || "error") + "). Usually temporary.";
  }
  /* Average monthly spend over the last n full months, counting only months the plan was in use. */
  function avgSpend(y, n) {
    var idx = [];
    for (var i = Math.max(0, y.months.length - n); i < y.months.length; i++) {
      if (y.cats.some(function (c) { return c.m[i]; })) idx.push(i);
    }
    return { months: idx.length, cats: y.cats.map(function (c) {
      var tot = idx.reduce(function (s, i) { return s + Math.max(0, c.m[i] || 0); }, 0);
      return { id: c.id, name: c.name, group: c.group, avg: idx.length ? tot / idx.length : 0, now: Math.max(0, c.now || 0), all: c };
    }).filter(function (c) { return c.avg > 0.5 || c.now > 0.5; }).sort(function (a, b) { return b.avg - a.avg || b.now - a.now; }) };
  }
  function aomChart(age) {
    var pts = age.filter(function (a) { return typeof a.days === "number"; });
    if (pts.length < 2) return "";
    var VW = 300, VH = 86, L = 6, R = 10, T = 10, B = 20, n = pts.length, vals = pts.map(function (a) { return a.days; });
    var lo = Math.max(0, Math.floor(Math.min.apply(null, vals) / 10) * 10 - 10), hi = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 10;
    var x = function (i) { return L + i * (VW - L - R) / (n - 1); }, yv = function (v) { return T + (VH - T - B) * (1 - (v - lo) / (hi - lo)); };
    var line = pts.map(function (a, i) { return x(i).toFixed(1) + "," + yv(a.days).toFixed(1); }).join(" ");
    var mon = function (a) { return MON[+a.month.slice(5, 7) - 1]; };
    return '<svg class="lg-spark" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Age of money by month, ' + pts[0].days + " days in " + mon(pts[0]) + " to " + pts[n - 1].days + ' days now">' +
      '<line class="g" x1="' + L + '" x2="' + (VW - R) + '" y1="' + yv(lo) + '" y2="' + yv(lo) + '"/>' +
      '<polygon class="a" points="' + x(0) + "," + yv(lo) + " " + line + " " + x(n - 1) + "," + yv(lo) + '"/><polyline class="l" points="' + line + '"/>' +
      '<circle class="d" cx="' + x(n - 1) + '" cy="' + yv(pts[n - 1].days) + '" r="4.5"/>' +
      '<text x="' + x(0) + '" y="' + (VH - 4) + '">' + mon(pts[0]) + " · " + pts[0].days + 'D</text><text x="' + x(n - 1) + '" y="' + (VH - 4) + '" text-anchor="end">' + mon(pts[n - 1]) + "</text></svg>";
  }

  function renderLedger() {
    var L = state.ledger, now = new Date(), html = '<div class="lg"><div class="ptr" id="ptr" aria-live="polite"></div>';
    if (!canLedger() && !canQueue()) {
      $("content").innerHTML = html + "<section>" + phead("LEDGER", "") + stubBox(state.conn ? "The Ledger needs the Google bridge updated. Steps are in the README under <b>Ledger</b>." : "Link calendars first.") + "</section></div>";
      return;
    }
    if (!L) {
      $("content").innerHTML = html + "<section>" + phead("LEDGER", "") + '<div class="empty">' + (state.ledgerErr ? esc(state.ledgerErr.msg) : "Loading your ledger…") + "</div></section></div>";
      loadLedger(false);
      return;
    }
    var y = L.ynab;

    /* accounts */
    html += "<section>" + phead("ACCOUNTS", y ? "FROM YNAB · AS OF YOUR LAST ENTRY" : "", null, '<button type="button" class="chip" data-act="ledgerrefresh"' + (state.ledgerInflight ? " disabled" : "") + ">REFRESH</button>" + '<a class="chip lg-open" href="https://app.ynab.com" target="_blank" rel="noopener">OPEN YNAB</a>');
    if (!canLedger()) html += stubBox("Add YNAB_TOKEN in the bridge's Script Properties to show your accounts. Steps are in the README under <b>Ledger</b>.");
    else if (!y) html += '<div class="err">' + ynabErrText(L.ynabError) + "</div>";
    else {
      var chk = y.checking.reduce(function (s, a) { return s + a.balance; }, 0), age = y.age.filter(function (a) { return typeof a.days === "number"; });
      var last = age.length ? age[age.length - 1].days : null, prev = age.length > 3 ? age[age.length - 4].days : null;
      var whole = usd(chk < 0 ? Math.ceil(chk) : Math.floor(chk)), cents = String(Math.round(Math.abs(chk) * 100) % 100); while (cents.length < 2) cents = "0" + cents;
      html += '<div class="lg-money"><div class="lg-hero"><span class="st"></span><div class="in"><span class="ov-sub">CHECKING' + (y.checking.length > 1 ? " · " + y.checking.length + " ACCOUNTS" : "") + "</span>" +
        '<span class="lg-big tnum">' + (y.checking.length ? whole + '<span class="c">.' + cents + "</span>" : "NONE") + "</span>" +
        (y.checking.length > 1 ? '<span class="muted lg-note">' + y.checking.map(function (a) { return esc(a.name) + " " + usd(a.balance, true); }).join(" · ") + "</span>" : '<span class="muted lg-note">Working balance in YNAB, including anything not yet cleared.</span>') + "</div></div>" +
        '<div class="lg-aom"><span class="ov-sub">AGE OF MONEY</span><span class="n tnum">' + (last === null ? "NONE" : last + "<small>DAYS</small>") + "</span>" +
        '<span class="muted lg-note">' + (last === null ? "YNAB shows this after about ten transactions." : (prev === null ? "" : (last >= prev ? "Up " : "Down ") + Math.abs(last - prev) + " days in 3 months. ") + "Money you spend today arrived about " + last + " days ago.") + "</span>" + aomChart(y.age) + "</div></div>";
      var group = function (title, list, loans) {
        if (!list.length) return "";
        var tot = list.reduce(function (s, a) { return s + a.balance; }, 0);
        return '<div class="lg-agroup"><h3 class="ov-sub">' + title + " · " + usd(tot) + (loans ? " OWED" : "") + "</h3>" + list.map(function (a) {
          var paid = loans && a.original ? Math.max(0, Math.min(100, Math.round((1 - Math.abs(a.balance) / a.original) * 100))) : null;
          return '<div class="lg-arow"><span class="nm">' + esc(a.name) + '</span><span class="v tnum">' + usd(a.balance, true) + "</span>" +
            (paid !== null ? '<span class="bar" role="img" aria-label="' + paid + '% paid off"><span style="width:' + paid + '%"></span></span><span class="sub">' + paid + "% paid off · started at " + usd(a.original) + "</span>" : "") + "</div>";
        }).join("") + "</div>";
      };
      var groups = group("SAVINGS", y.savings, false) + group("LOANS", y.loans, true);
      if (groups) html += '<div class="lg-accts">' + groups + "</div>";
    }
    html += "</section>";

    /* average spend */
    if (y) {
      var range = lsGet(LS_LEDGERRANGE) || 6;
      if (LEDGER_RANGES.indexOf(range) === -1) range = 6;
      var av = avgSpend(y, range), open = !!bridgeOpen.lspend, shown = open ? av.cats : av.cats.slice(0, 8);
      var maxA = Math.max.apply(null, [1].concat(av.cats.map(function (c) { return Math.max(c.avg, c.now); })));
      var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      var total = av.cats.reduce(function (s, c) { return s + c.avg; }, 0), nowTot = av.cats.reduce(function (s, c) { return s + c.now; }, 0);
      html += pnl("lspend", phead("AVERAGE SPEND", "PER MONTH · " + (av.months ? "LAST " + av.months + (av.months === 1 ? " MONTH" : " MONTHS") : "NO FULL MONTHS YET"), "chrome-c", av.cats.length > 8 ? moreBtn("lspend", "spending") : "") +
        '<div class="lg-tools"><div class="lg-seg" role="group" aria-label="Averaging period">' + LEDGER_RANGES.map(function (r) {
          return '<button type="button" class="chip" data-lrange="' + r + '" aria-pressed="' + (r === range) + '">' + r + "M</button>";
        }).join("") + '</div><div class="lg-legend"><span><i class="b"></i>AVERAGE MONTH</span><span><i class="t"></i>' + MONL[now.getMonth()] + " SO FAR · DAY " + now.getDate() + " OF " + dim + "</span></div></div>" +
        (av.cats.length ? '<div class="lg-cats">' + shown.map(function (c) {
          var isOpen = state.ledgerCat === c.id;
          return '<button type="button" class="lg-crow" data-lcat="' + esc(c.id) + '" aria-expanded="' + isOpen + '"><span class="nm"><b>' + esc(bare(c.name) || c.name) + "</b><small>" + esc(bare(c.group).toUpperCase()) + "</small></span>" +
            '<span class="track"><span class="b" style="width:' + (c.avg / maxA * 100).toFixed(1) + '%"></span><span class="t" style="left:' + (c.now / maxA * 100).toFixed(1) + '%"></span></span><span class="v tnum">' + usd(c.avg) + "</span></button>" +
            (isOpen ? '<div class="lg-cdetail">' + esc(bare(c.name) || c.name) + ": " + usd(c.avg) + " a month on average over " + av.months + (av.months === 1 ? " month" : " months") + " (" + LEDGER_RANGES.map(function (r) {
              var a2 = avgSpend(y, r).cats.filter(function (x) { return x.id === c.id; })[0];
              return r + "M " + usd(a2 ? a2.avg : 0);
            }).join(" · ") + "). " + MONL[now.getMonth()].charAt(0) + MONL[now.getMonth()].slice(1).toLowerCase() + " so far " + usd(c.now) + ".</div>" : "");
        }).join("") + "</div>" + (open || av.cats.length <= 8 ? "" : '<div class="muted lg-note ov-hint">+' + (av.cats.length - 8) + " smaller categories behind +</div>") +
        '<div class="lg-total"><span class="ov-sub">AVERAGE MONTH</span><span class="muted lg-note">' + MONL[now.getMonth()].charAt(0) + MONL[now.getMonth()].slice(1).toLowerCase() + " so far " + usd(nowTot) + '</span><span class="v tnum">' + usd(total) + "</span></div>"
          : '<div class="empty">No spending recorded in these months yet.</div>'));
    }

    /* replicator queue */
    html += "<section>" + phead("REPLICATOR QUEUE", L.queue ? L.queue.items.length + (L.queue.items.length === 1 ? " ITEM" : " ITEMS") + " · TOP OF THE QUEUE IS FUNDED FIRST" : "", "chrome-d");
    if (!canQueue()) html += stubBox("Needs the Notion link. Steps are in the README under <b>Ledger</b>.");
    else if (!L.queue) html += '<div class="err">' + (L.queueError === "notion_not_shared" ? "The Replicator Queue isn't connected to the TimothyOS integration. In Notion: Replicator Queue → ••• → Connections → add TimothyOS bridge." : esc(describeTasks({ code: L.queueError }))) + "</div>";
    else {
      var fund = y && y.fund, bal = fund ? Math.max(0, fund.balance) : 0, busy = state.queueBusy || navigator.onLine === false;
      html += '<div class="lg-fund"><span class="st"></span><span><span class="ov-sub">REPLICATOR RATIONS · YNAB CATEGORY "' + esc(((y && y.fundName) || "Discretionary").toUpperCase()) + '"</span><br>' +
        (fund ? '<b class="tnum">' + usd(fund.balance) + '</b> <span class="muted lg-note">available</span>' : '<span class="muted lg-note">' + (y ? 'No category called "' + esc(y.fundName) + '" in YNAB yet. Create it and the bars below fill from it.' : "Shows once YNAB is connected.") + "</span>") +
        '</span><span class="muted lg-note lg-fundhint">Each bar: the whole balance<br>against that item alone</span></div><div class="lg-queue">';
      if (!L.queue.items.length) html += '<div class="empty">The queue is empty. Add something below so you don\'t forget it.</div>';
      var inPrice = priceSorted(L.queue.items).every(function (x, i) { return x === L.queue.items[i]; });
      if (L.queue.items.length > 1 && !inPrice) html += '<div class="lg-sortrow"><span class="muted lg-note">Your own order. New items still land by price.</span><button type="button" class="btn ghost sm" data-qprice="1"' + (busy ? " disabled" : "") + ">PRICE ORDER</button></div>";
      L.queue.items.forEach(function (w, i) {
        var cost = typeof w.cost === "number" ? w.cost : 0, got = fund && cost ? Math.min(cost, bal) : 0;
        var ready = fund && cost && got >= cost - 0.005;
        var status = !cost ? '<span class="pill">NO PRICE YET</span>' : !fund ? "" : ready ? '<span class="pill ok">FUNDS READY</span>' : '<span class="pill' + (got > 0 ? " warn" : "") + '">' + usd(cost - got) + " TO GO</span>";
        html += '<div class="lg-witem" data-qid="' + esc(w.id) + '"><span class="rank tnum">' + (i + 1) + '</span><span class="tx"><b>' + esc(w.title) + "</b>" +
          (w.note ? "<small>" + esc(w.note) + "</small>" : "") + (w.link ? '<small><a href="' + esc(w.link) + '" target="_blank" rel="noopener">' + esc(w.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)) + "</a></small>" : "") +
          (fund && cost ? '<span class="fb" role="img" aria-label="' + usd(got) + " of " + usd(cost) + ' funded"><span style="width:' + (got / cost * 100).toFixed(1) + '%"></span></span>' : "") + "</span>" +
          '<span class="right"><span class="cost tnum">' + (cost ? usd(cost) : "") + "</span>" + status + '</span><span class="acts">' +
          (state.queueConfirm === w.id
            ? '<span class="ov-sub">BOUGHT?</span><button type="button" class="btn" data-qyes="' + esc(w.id) + '"' + (busy ? " disabled" : "") + '>YES</button><button type="button" class="btn ghost" data-qno="1">NO</button>'
            : '<button type="button" class="lg-icon" data-qmove="-1" data-qi="' + i + '" aria-label="Move ' + esc(w.title) + ' up"' + (i === 0 || busy ? " disabled" : "") + '><span class="tri u"></span></button>' +
              '<button type="button" class="lg-icon" data-qmove="1" data-qi="' + i + '" aria-label="Move ' + esc(w.title) + ' down"' + (i === L.queue.items.length - 1 || busy ? " disabled" : "") + '><span class="tri d"></span></button>' +
              '<button type="button" class="btn ghost" data-qbought="' + esc(w.id) + '"' + (busy ? " disabled" : "") + ">BOUGHT</button>") + "</span></div>";
      });
      html += '</div><form class="lg-add" id="qForm" autocomplete="off">' +
        '<label class="wide"><span class="ov-sub">ADD TO THE QUEUE</span><input id="qName" maxlength="120" placeholder="e.g. New glasses"></label>' +
        '<label><span class="ov-sub">ROUGH COST</span><input id="qCost" inputmode="decimal" placeholder="$"></label>' +
        '<label class="wide"><span class="ov-sub">NOTE (OPTIONAL)</span><input id="qNote" maxlength="200" placeholder="Why, or where to buy it"></label>' +
        '<button type="submit" class="btn capture"' + (busy ? " disabled" : "") + ">" + (state.queueBusy ? "SAVING…" : "ADD") + "</button></form>";
      if (L.queue.bought.length) html += '<div class="lg-bought"><div class="ov-sub">BOUGHT RECENTLY</div>' + L.queue.bought.map(function (b) {
        return '<div class="lg-brow"><span>' + esc(b.title) + (typeof b.cost === "number" ? " · " + usd(b.cost) : "") + " · " + dLabel(parseYmd(b.bought)) + '</span><button type="button" class="btn ghost" data-qundo="' + esc(b.id) + '"' + (busy ? " disabled" : "") + ">UNDO</button></div>";
      }).join("") + "</div>";
    }
    html += "</section>";
    if (state.ledgerErr) html += stale(L.fetched);
    html += '<small class="muted">Read-only from YNAB: nothing here changes your plan. Ask Claude ' + (lsGet(LS_AIFIN) ? "can see these figures (Systems → Ask Claude)." : "can't see this screen unless you turn it on in Systems.") + "</small></div>";
    $("content").innerHTML = html;
    ptrPaint();   /* a redraw mid-refresh keeps the indicator */
    loadLedger(false);   /* a redraw asks the bridge (its copy is fine); opening the screen goes to YNAB (go()) */
  }

  function queueSend(body, okMsg) {
    state.queueBusy = true;
    render(true);
    return apiPost(body).then(function (j) {
      if (j.queue && state.ledger) { state.ledger.queue = j.queue; lsSet(LS_LEDGER, state.ledger); }
      if (okMsg) toast(okMsg);
      return j;
    }).catch(function (err) {
      toast("Not saved: " + describeTasks(err));
      loadLedger(true);
    }).then(function (j) { state.queueBusy = false; state.queueConfirm = null; render(true); return j; });
  }
  function queueMove(i, dir) {
    var q = state.ledger && state.ledger.queue;
    if (!q || i + dir < 0 || i + dir >= q.items.length) return;
    var items = q.items.slice(), it = items.splice(i, 1)[0];
    items.splice(i + dir, 0, it);
    q.items = items;   /* shown at once; the bridge confirms */
    var before = tops(".lg-witem", "data-qid");
    var sent = queueSend({ action: "queueorder", ids: items.map(function (x) { return x.id; }) });
    slideFrom(".lg-witem", "data-qid", before);
    sent.then(function () {
      var again = document.querySelector('[data-qid="' + it.id + '"] [data-qmove="' + dir + '"]:not(:disabled)') || document.querySelector('[data-qid="' + it.id + '"] .lg-icon:not(:disabled)');
      if (again) again.focus();
    });
  }
  function queueAddSubmit() {
    var name = $("qName").value.trim(), costRaw = $("qCost").value.trim(), note = $("qNote").value.trim();
    if (!name) { toast("Type what you want to add first."); $("qName").focus(); return; }
    if (isEarlGrey(name)) { var qn = $("qName"); qn.value = ""; qn.defaultValue = ""; $("qCost").value = ""; $("qNote").value = ""; qn.blur(); replicate(); return; }
    var cost = costRaw ? parseFloat(costRaw.replace(/[^0-9.]/g, "")) : null;
    if (costRaw && !isFinite(cost)) { toast("The cost should be a number, like 280."); $("qCost").focus(); return; }
    var item = { cid: newCid(), title: name.slice(0, 120), cost: cost, note: note.slice(0, 200) };
    queueSend({ action: "queueadd", item: item }).then(function (j) {
      if (!j || !j.item || !state.ledger || !state.ledger.queue) return;
      var q = state.ledger.queue;
      q.items = q.items.filter(function (x) { return x.id !== j.item.id; });
      /* A new item goes where its price puts it: just above the first item that costs more (unpriced ones
         stay at the bottom). Everything already in the queue keeps the order you gave it. */
      var at = priceSlot(q.items, j.item.cost);
      q.items.splice(at, 0, j.item);
      lsSet(LS_LEDGER, state.ledger);
      ["qName", "qCost", "qNote"].forEach(function (id) { if ($(id)) $(id).value = ""; });
      var where = "Added at #" + (at + 1) + " of " + q.items.length + (typeof j.item.cost === "number" ? ", by price" : ", at the bottom (no price yet)") + ". Move it to change.";
      if (at < q.items.length - 1) queueSend({ action: "queueorder", ids: q.items.map(function (x) { return x.id; }) }, where);
      else { toast(where); render(true); }
      if ($("qName")) $("qName").focus();
    });
  }
  /* Where a cost belongs in the queue as it stands: before the first item that costs more or has no price. */
  function priceSlot(items, cost) {
    if (typeof cost !== "number") return items.length;
    for (var i = 0; i < items.length; i++) if (typeof items[i].cost !== "number" || items[i].cost > cost) return i;
    return items.length;
  }
  function priceSorted(items) {
    return items.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      var ca = typeof a.x.cost === "number" ? a.x.cost : Infinity, cb = typeof b.x.cost === "number" ? b.x.cost : Infinity;
      return ca - cb || a.i - b.i;
    }).map(function (o) { return o.x; });
  }
  /* PRICE ORDER: lowest to highest, once; any moves after that are remembered as usual. */
  function queuePriceOrder() {
    var q = state.ledger && state.ledger.queue;
    if (!q) return;
    var before = tops(".lg-witem", "data-qid");
    q.items = priceSorted(q.items);
    var sent = queueSend({ action: "queueorder", ids: q.items.map(function (x) { return x.id; }) }, "Sorted lowest to highest. Move anything to set your own order.");
    slideFrom(".lg-witem", "data-qid", before);
    return sent;
  }

  /* For Ask, only when turned on in Systems: the figures on this screen, in plain text. */
  function ledgerBrief() {
    var L = state.ledger, y = L && L.ynab, out = [];
    if (!lsGet(LS_AIFIN) || !L) return "";
    if (y) {
      out.push("Checking " + usd(y.checking.reduce(function (s, a) { return s + a.balance; }, 0), true) +
        (y.savings.length ? "; savings " + y.savings.map(function (a) { return a.name + " " + usd(a.balance, true); }).join(", ") : "") +
        (y.loans.length ? "; loans " + y.loans.map(function (a) { return a.name + " " + usd(a.balance, true) + (a.original ? " of " + usd(a.original) : ""); }).join(", ") : ""));
      var ag = y.age.filter(function (a) { return typeof a.days === "number"; });
      if (ag.length) out.push("Age of money " + ag[ag.length - 1].days + " days");
      if (y.fund) out.push(y.fund.name + " category available " + usd(y.fund.balance, true));
      var av = avgSpend(y, 6);
      out.push("Average monthly spend (" + av.months + " months): " + av.cats.slice(0, 12).map(function (c) { return c.name + " " + usd(c.avg) + " (this month " + usd(c.now) + ")"; }).join("; "));
    }
    if (L.queue) out.push("Replicator Queue (wish list, priority order): " + (L.queue.items.map(function (w, i) { return (i + 1) + ". " + w.title + (typeof w.cost === "number" ? " " + usd(w.cost) : ""); }).join("; ") || "empty"));
    return out.length ? "FINANCES (YNAB, read-only; shared by Timothy's choice):\n" + out.join("\n") : "";
  }
  function ledgerSection() {
    var L = state.ledger, html = "<section>" + phead("LEDGER", canLedger() ? "YNAB READ-ONLY" : "SETUP");
    if (!canLedger() && !canQueue()) return html + stubBox("Needs the Google bridge updated. Steps are in the README under <b>Ledger</b>.") + "</section>";
    var y = L && L.ynab;
    html += '<div class="calrow"><span class="st" style="background:var(--chrome-b)"></span><span><b>YNAB</b><small' + (L && L.ynabError ? ' class="errtxt">' + ynabErrText(L.ynabError) : ">" + (y ? y.checking.length + " checking · " + y.savings.length + " savings · " + y.loans.length + " loans · fund category " + (y.fund ? '"' + esc(bare(y.fund.name).trim() || y.fund.name) + '" found' : '"' + esc(y.fundName) + '" not found') : canLedger() ? "Not loaded yet" : "Add YNAB_TOKEN in Script Properties")) + "</small></span>" +
      '<span class="pill' + (y ? " ok" : L && L.ynabError ? " bad" : "") + '">' + (y ? "OK" : L && L.ynabError ? "ERROR" : canLedger() ? "WAITING" : "SETUP") + "</span></div>";
    html += '<div class="calrow"><span class="st" style="background:var(--ok)"></span><span><b>Replicator Queue</b><small' + (L && L.queueError ? ' class="errtxt">' + (L.queueError === "notion_not_shared" ? "Not connected. In Notion: Replicator Queue → ••• → Connections → add TimothyOS bridge." : esc(L.queueError)) : ">" + (L && L.queue ? L.queue.items.length + " waiting · " + L.queue.bought.length + " bought recently" : "Not loaded yet")) + "</small></span>" +
      '<span class="pill' + (L && L.queue ? " ok" : L && L.queueError ? " bad" : "") + '">' + (L && L.queue ? "OK" : L && L.queueError ? "SETUP" : "WAITING") + "</span></div>";
    var on = !!lsGet(LS_AIFIN);
    html += '<label class="ov-sub" style="margin-top:14px;display:block">ASK CLAUDE AND YOUR FINANCES</label><div class="btnrow">' +
      '<button type="button" class="chip" data-aifin="0" aria-pressed="' + !on + '">OFF</button><button type="button" class="chip" data-aifin="1" aria-pressed="' + on + '">SHARE WITH ASK</button></div>' +
      '<small class="muted">' + (on ? "Ask receives your balances, average spend and the Replicator Queue with each question, so it can answer things like whether the extractor fits this month. They go to Anthropic with the question." : "Off: your finances are never sent with Ask questions.") + "</small></section>";
    return html;
  }

