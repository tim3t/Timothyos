/* TimothyOS: Bridge overview, calendars, capture, Plan Day and Key Dates.
   Reads work + personal calendars and Notion through the Apps Script bridge.
   The Bridge screen sums it all up; Day, Week and Month show the detail. */
(function (start) {
  /* 2.85 (A4): the deep store. The browser gives this app about 5 MB for everything kept between visits, and saved
     copies (meal photos, calendars, health days) were crowding the settings and the changes on their way. These
     copies now live in IndexedDB ("tos-deep"), which has far more room. The app reads its storage synchronously all
     through, so the deep store is read here, once, before the app starts: then lsGet answers from memory as before.
     Only SAVED COPIES go here (each sync brings them back), never a setting or a change waiting to be sent.
     Each record carries this browser's mark (tos.deep.v1, in the 5 MB store): when that store is cleared, the old
     records no longer match and are ignored, so the two never disagree. No IndexedDB, or no answer within 3 seconds:
     the app starts with everything in the 5 MB store, as before 2.85. */
  var dpKeys = ["tos.cache.v1", "tos.meals.v1", "tos.mealrc.v1", "tos.nasart.v1", "tos.sickbay.v1", "tos.astro.v1", "tos.weeks.v1", "tos.library.v1", "tos.tarot.v1", "tos.otd.v1"];
  var dpDone = false, dpMark = null;
  function dpGo(db, mem, stale) { if (dpDone) return; dpDone = true; start({ keys: dpKeys, db: db, mem: mem || {}, mark: dpMark, stale: !!stale }); }
  try { dpMark = localStorage.getItem("tos.deep.v1"); } catch (e) { dpMark = null; }
  try {
    var dpOpen = indexedDB.open("tos-deep", 1);
    dpOpen.onupgradeneeded = function () { dpOpen.result.createObjectStore("kv"); };
    dpOpen.onsuccess = function () {
      var db = dpOpen.result, mem = {}, stale = false;
      try {
        var cur = db.transaction("kv", "readonly").objectStore("kv").openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) { dpGo(db, mem, stale); return; }
          var rec = c.value;
          if (rec && dpMark && rec.e === dpMark && typeof rec.v === "string" && dpKeys.indexOf(c.key) > -1) mem[c.key] = rec.v; else stale = true;
          c.continue();
        };
        cur.onerror = function () { dpGo(null); };
      } catch (e) { dpGo(null); }
    };
    dpOpen.onerror = function () { dpGo(null); };
  } catch (e) { dpGo(null); }
  setTimeout(function () { dpGo(null); }, 3000);
})(function (DEEP) {
  "use strict";
