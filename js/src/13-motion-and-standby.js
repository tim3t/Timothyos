  /* ---------- Motion ---------- */
  /* Small, quick and only when you do something: a light-up on press, screens that
     rise in, sheets that slide, bars that grow when a screen opens, panels that open
     smoothly. Background syncs re-render without animating. With Reduce Motion on,
     the CSS turns every animation off and these helpers do nothing. */
  function calm() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function restartClass(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  var enterTimer = null;
  function enterScreen() {
    var c = $("content");
    restartClass(c, "enter"); restartClass(c, "grow-in");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(function () { c.classList.remove("enter"); c.classList.remove("grow-in"); }, 700);
  }
  /* Animate an element from its old height to its new one (after a re-render). */
  function easeHeight(el, from) {
    if (!el || calm() || from == null) return;
    var to = el.offsetHeight;
    if (Math.abs(to - from) < 2) return;
    el.style.height = from + "px"; el.style.overflow = "hidden";
    void el.offsetHeight;
    el.style.transition = "height 240ms cubic-bezier(.2, .7, .2, 1)";
    el.style.height = to + "px";
    setTimeout(function () { el.style.height = ""; el.style.overflow = ""; el.style.transition = ""; }, 260);
  }
  /* Slide items from where they were to where they are now (after a re-render). */
  function slideFrom(sel, keyAttr, before) {
    if (calm()) return;
    document.querySelectorAll(sel).forEach(function (el) {
      var dy = before[el.getAttribute(keyAttr)] - el.getBoundingClientRect().top;
      if (!dy || !isFinite(dy)) return;
      el.style.transition = "none"; el.style.transform = "translateY(" + dy + "px)";
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = "transform 240ms cubic-bezier(.2, .7, .2, 1)"; el.style.transform = ""; }); });
    });
  }
  function tops(sel, keyAttr) {
    var o = {};
    document.querySelectorAll(sel).forEach(function (el) { o[el.getAttribute(keyAttr)] = el.getBoundingClientRect().top; });
    return o;
  }
  /* Sheets slide up when they open (CSS) and slide down before they hide. */
  var sheetTimers = {};
  function showSheet(id) { var s = $(id); clearTimeout(sheetTimers[id]); s.classList.remove("closing"); if (typeof fitViewport === "function") fitViewport(); s.hidden = false; pageLock(true); }
  function hideSheet(id) {
    var s = $(id);
    if (s.hidden) return;
    if (calm()) { s.hidden = true; pageLock(false); return; }
    s.classList.add("closing");
    clearTimeout(sheetTimers[id]);
    sheetTimers[id] = setTimeout(function () { s.hidden = true; s.classList.remove("closing"); pageLock(false); }, 200);
  }
  /* 2.56.1: the page stays put while a sheet is open. In portrait the Bridge is taller than the screen, so the page
     itself scrolls; when a field in a sheet takes the focus, iPadOS scrolls that page to "reveal" it, and from then on
     it tests taps against the sheet as if it had moved with the page: ADD, SET PRIORITIES and the selects missed, text
     beside them got selected, and only the dark backdrop answered. Pinned in place (body fixed at the same spot), the
     page can't scroll under a sheet; it's let go, at the same place, when the last sheet closes. */
  var pageLockY = null;
  function pageLock(on) {
    var de = document.documentElement, bd = document.body;
    if (on) {
      if (pageLockY !== null) return;
      pageLockY = window.scrollY || de.scrollTop || 0;
      bd.style.top = -pageLockY + "px"; de.classList.add("sheet-lock");
      return;
    }
    if (pageLockY === null || document.querySelector(".scrim:not([hidden])")) return;   /* another sheet is still open */
    var y = pageLockY; pageLockY = null;
    de.classList.remove("sheet-lock"); bd.style.top = "";
    window.scrollTo(0, y);
  }
  /* The LCARS light-up on every button press. */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".nav, .elbow, .btn, .chip, .ov-more, .status, .topbtn");
    if (!b || b.disabled) return;
    /* The BRIDGE corner, its inner curve and the top bar are one piece of colour: they light up
       together, or the join between them shows for a moment (2.14.1). */
    if (b.classList.contains("elbow")) { restartClass(b, "flash"); restartClass(document.querySelector(".topbar"), "flash"); restartClass(document.querySelector(".top"), "armflash"); }
    else restartClass(b, "flash");
  }, true);

  /* ---------- Standby ---------- */
  /* After a stretch without a touch (Systems → Standby, default 15 minutes) or from
     STANDBY in the top bar, the screen fades to a dim clock with weather, next up,
     the condition and the next key date. The screen is kept awake while standby is
     on (iPadOS releases that whenever the app is closed; it's asked for again on
     return). The first tap only wakes the screen. Night look from 22:00 to 06:00. */
  var STANDBY_CHOICES = [0, 5, 15, 30];
  var sb = { on: false, last: Date.now(), clock: null, drift: null, step: 0, wake: null, wakeState: "off", fade: 0, slept: false };
  function standbyMins() { var v = lsGet(LS_STANDBY); return STANDBY_CHOICES.indexOf(v) > -1 ? v : 15; }
  function noteTouch() { sb.last = Date.now(); sb.slept = false; }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (t) { document.addEventListener(t, noteTouch, { capture: true, passive: true }); });
  function holdAwake() {
    if (sb.wake || document.hidden || standbyMins() === 0) return;
    if (!("wakeLock" in navigator)) { sb.wakeState = "unsupported"; return; }
    navigator.wakeLock.request("screen").then(function (lock) {
      sb.wake = lock; sb.wakeState = "on";
      lock.addEventListener("release", function () { sb.wake = null; if (sb.wakeState === "on") sb.wakeState = "released"; });
    }).catch(function () { sb.wakeState = "refused"; });
  }
  function letSleep() { if (sb.wake) { sb.wakeState = "off"; sb.wake.release().catch(function () {}); sb.wake = null; } else sb.wakeState = "off"; }
  document.addEventListener("pointerdown", function () { if (!sb.wake && standbyMins()) holdAwake(); }, true);   /* some iPadOS versions want a tap first */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { noteTouch(); holdAwake(); } });

  function typing() { var a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function checkIdle() {
    var mins = standbyMins();
    if (sb.on || !mins || !state.conn || document.hidden || typing() || holoHold() || (state.screen === "meals" && ml.cook)) return;   /* no Standby while COOK is open (2.60) */
    if (Date.now() - sb.last >= mins * 60000) enterStandby();
  }
  setInterval(checkIdle, 15000);
  /* 2.49 (Timothy): no Standby on HOLODECK (the arch, VISUAL or AUDIO) or while its TV is on air, so a show or an episode
     isn't covered by the clock. Once a sleep timer has run out (sb.slept, until the next touch) Standby takes over as
     usual, so a night in front of the TV ends on the dim night clock, not a lit screen. */
  function holoHold() { return !sb.slept && (state.screen === "holodeck" || state.screen === "storage" || holo.onAir()); }

  function standbyHtml(now) {
    /* One centered column, one typeface, three sizes: the clock, the event title, and small
       spaced capitals for everything else. */
    var today = ymd(now), list = visible(eventsFor(bridgeRange()));
    var timed = dayEvents(list, now).timed.filter(function (e) { return e._e > now; }).sort(function (a, b) { return a._s - b._s; });
    var cur = timed.filter(function (e) { return e._s <= now; })[0], up = timed.filter(function (e) { return e._s > now; });
    var tomorrow = up.length || cur ? [] : dayEvents(list, addDays(sod(now), 1)).timed.sort(function (a, b) { return a._s - b._s; });
    var mins = function (ms) { var m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? m + " MIN" : durLabel(m).toUpperCase(); };
    var dot = function (cls) { return '<i class="sb-dot ' + cls + '"></i>'; };
    var j = wxData(), top = DOWL[now.getDay()] + " " + p2(now.getDate()) + " " + MONL[now.getMonth()];
    if (j && j.current) {
      var dly = j.daily, di = Math.max(0, dly.time.indexOf(today));
      top += '<span class="sb-sep">·</span>' + Math.round(j.current.temperature_2m) + "° " + esc(wxText(j.current.weather_code).toUpperCase()) +
        '<span class="sb-sep">·</span>H ' + Math.round(dly.temperature_2m_max[di]) + "° L " + Math.round(dly.temperature_2m_min[di]) + "°";
    }
    var html = '<div class="sb-tm tnum">' + hm(now) + '</div><div class="sb-lbl sb-acc">' + top + '</div><div class="sb-rule"></div>';
    var ev = cur || up[0], after = cur ? up[0] : up[1];
    if (ev) {
      var when = cur ? "NOW · UNTIL " + hm(cur._e) + " · " + mins(cur._e - now) + " LEFT" : "NEXT UP · " + hm(ev._s) + " · IN " + mins(ev._s - now);
      html += '<div class="sb-lbl">' + dot("a-" + ev.area) + when + '</div><div class="sb-title">' + esc(ev.title) + "</div>" +
        (after ? '<div class="sb-lbl sb-dim">THEN ' + hm(after._s) + " · " + esc(after.title.toUpperCase()) + "</div>" : "");
    } else {
      /* nothing left today: say so; tomorrow's first item waits in small print until midnight */
      html += '<div class="sb-lbl">REST OF TODAY</div><div class="sb-title">Clear for the rest of the day</div>' +
        (tomorrow[0] ? '<div class="sb-lbl sb-dim">NEXT · TOMORROW ' + hm(tomorrow[0]._s) + " · " + esc(tomorrow[0].title.toUpperCase()) + "</div>" : "");
    }
    var items = conditions(now, today, eventsFor(bridgeRange()));
    var level = items.some(function (i) { return i.lvl === "bad"; }) ? "red" : items.length ? "yellow" : "green";
    var foot = dot(level) + "CONDITION " + level.toUpperCase() + (items.length ? " · " + items.length + (items.length === 1 ? " ITEM" : " ITEMS") : "");
    var kd = canDates() && state.dates ? occurrences(today, ymd(addDays(now, 366))).filter(function (o) { return o.e >= today; })[0] : null;
    if (kd) {
      var running = kd.s < today, n = running ? daysBetween(today, kd.e) : daysBetween(today, kd.s);
      foot += '<span class="sb-sep wide"></span>◆ ' + esc(kd.d.title.toUpperCase()) + " · " + (running ? n + " D LEFT" : n === 0 ? "TODAY" : "IN " + n + " D");
    }
    if (briefUnread()) html += '<div class="sb-brief"><i aria-hidden="true"></i>BRIEFING READY · TAP TO READ</div>';
    return html + '<div class="sb-lbl sb-dim sb-foot">' + foot + "</div>";
  }
  var SB_WAKE_MS = 900;   /* matches .standby.waking in app.css */
  function paintStandby() {
    var now = new Date(), el = $("standby"), h = now.getHours();
    el.classList.toggle("night", h >= 22 || h < 6);
    $("sbBody").innerHTML = standbyHtml(now);
  }
  function enterStandby() {
    if (sb.on || !state.conn) return;
    if (logOpen() || lg.digits || lg.word) { lockLog(); if (state.screen === "log") render(false); }
    sb.on = true;
    var el = $("standby");
    paintStandby();
    sb.fade++; el.classList.remove("waking");
    el.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("on"); }); });
    sb.clock = setInterval(paintStandby, 15000);
    sb.step = 0;
    sb.drift = setInterval(function () {   /* a few pixels each minute, so nothing burns into an OLED screen */
      var o = [[0, 0], [7, -5], [-6, 6], [5, 7], [-7, -4]][++sb.step % 5];
      $("sbBody").style.transform = "translate(" + o[0] + "px, " + o[1] + "px)";
    }, 60000);
    holdAwake();
  }
  function exitStandby() {
    if (!sb.on) return;
    sb.on = false; noteTouch();
    if (briefUnread() && state.screen !== "bridge") go("bridge");   /* BRIEFING READY: the wake lands on it */
    clearInterval(sb.clock); clearInterval(sb.drift);
    var el = $("standby"), my = ++sb.fade;
    /* Redraw underneath first, so the fade never stalls on it; then fade out in full and only
       hide the layer once it's clear (it used to be hidden part-way, which looked like a pop). */
    if (state.screen === "bridge" || state.screen === "today") render(true);
    function done() { if (sb.on || my !== sb.fade) return; el.hidden = true; el.classList.remove("waking"); $("sbBody").style.transform = ""; }
    if (calm()) { el.classList.remove("on"); done(); return; }
    el.classList.add("waking");
    requestAnimationFrame(function () { el.classList.remove("on"); });
    el.addEventListener("transitionend", function te(e) { if (e.target !== el || e.propertyName !== "opacity") return; el.removeEventListener("transitionend", te); done(); });
    setTimeout(done, SB_WAKE_MS + 250);   /* in case the transition end never arrives */
  }
  /* The wake tap lands on the standby layer itself, so nothing underneath is pressed. */
  $("standby").addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); exitStandby(); });
  document.addEventListener("keydown", function (e) { if (sb.on) { e.preventDefault(); exitStandby(); } }, true);
  $("idleBtn").addEventListener("click", function () { enterStandby(); });

  function standbySection() {
    var mins = standbyMins();
    var ws = { on: "Yes, while TimothyOS is open.", released: "Released when the app went to the background; asked for again on your next tap.", refused: "iPadOS declined. When docked, set Settings → Display & Brightness → Auto-Lock → Never.",
      unsupported: "This iPadOS version can't keep a web app's screen on. When docked, set Auto-Lock to Never.", off: mins ? "Asked for on your next tap." : "No: standby is off, so the iPad locks as usual." }[sb.wakeState] || "";
    return "<section>" + phead("STANDBY", mins ? "AFTER " + mins + " MIN" : "OFF") +
      '<dl class="kv"><dt>STANDBY AFTER</dt><dd><div class="chips">' + STANDBY_CHOICES.map(function (m) {
        return '<button type="button" class="chip" data-standby="' + m + '" aria-pressed="' + (m === mins) + '">' + (m ? m + " MIN" : "OFF") + "</button>";
      }).join("") + "</div></dd><dt>SCREEN ON</dt><dd>" + ws + "</dd></dl>" +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn ghost" data-act="standbynow">STANDBY NOW</button></div>' +
      '<small class="muted">Without a touch for that long, the screen fades to a dim clock with weather, next up and the condition. Tap anywhere to wake; that tap only wakes the screen. STANDBY in the top bar does the same any time. Night look 22:00 to 06:00. A web app can\'t turn the backlight down, so keep the iPad plugged in when docked.</small></section>';
  }

