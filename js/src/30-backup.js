  /* ---------- Backup and restore (2.33) ---------- */
  /* One file holding everything kept only on this iPad: the three keys and links, and the setup (ENGINEERING
     devices, rooms and upkeep, pins, ignored events, breaks, bearings, podcast places…). Locked with AES-GCM
     under a key derived (PBKDF2, SHA-256) from a passphrase Timothy types; the passphrase is never stored.
     Copies of Notion and Google data are left out (the next sync refills them), and so are pending saves and
     drafts: the Captain's Log draft never goes into a file. BACKUP waits until nothing is pending. RESTORE
     (Systems, and the link screen of a fresh install) shows what the file holds before anything is written,
     writes only keys on BK_KEYS, then reloads. */
  var BK_KEYS = ["tos.conn.v1", "tos.nas.v1", "tos.ha.v1", "tos.mealgot.v1", "tos.mealview.v1", "tos.arb.v1",
    "tos.pins.v1", "tos.ignore.v1", "tos.breaks.v1", "tos.place.v1", "tos.bearings.v1", "tos.log.v1", "tos.baltarget.v1", "tos.habitcfg.v1",
    "tos.upkeep.v1", "tos.upview.v1", "tos.hiverhythm.v1", "tos.newsoff.v1", "tos.hadev.v1", "tos.hagroups.v1", "tos.hascnord.v1", "tos.haroom.v1", "tos.haview.v1", "tos.engtab.v1",
    "tos.nashide.v1", "tos.nassort.v1", "tos.naspref.v1", "tos.nasdir.v1", "tos.plays.v1",
    "tos.capprefs.v1", "tos.standby.v1", "tos.start.v1", "tos.hidden.v1", "tos.bopen.v1", "tos.lrange.v1", "tos.shelf.v1", "tos.rsaved.v1", "tos.rpatterns.v1",
    "tos.aifin.v1", "tos.aitarot.v1", "tos.aiapiary.v1", "tos.logai.v1", "tos.briefoff.v1", "tos.shipyear.v1", "tos.scilineoff.v1", "tos.scilm.v1", "tos.scilmoff.v1", "tos.ressikan.v1", "tos.holo.v1", "tos.voiceoff.v1", "tos.snai.v1", "tos.sntopics.v1"];
  var BK_FORMAT = "TimothyOS backup", BK_ITER = 600000, LS_BKAT = "tos.bkat.v1";
  var bk = { p1: "", p2: "", rp: "", busy: false, out: null, msg: "", err: "", r: null };
  function bkB64(buf) { var a = new Uint8Array(buf), s = ""; for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function bkUnB64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function bkKey(pass, salt, iter) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  /* Saves still on their way to Notion or Google (they'd be lost with the app). */
  /* What's still waiting to be sent, by kind, each list counted by its own shape (2.58.1: SCIENCE's {add, star} counted
     as 2 for ever, so every iPad that had opened SCIENCE couldn't back up from 2.42 on). */
  var BK_QUEUES = [["tos.queue.v1", "capture", "captures"], ["tos.habitq.v1", "habit day", "habit days"], ["tos.tarotq.v1", "tarot change", "tarot changes"], ["tos.apiaryq.v1", "hive change", "hive changes"],
    ["tos.inboxq.v1", "inbox change", "inbox changes"], ["tos.sciq.v1", "science log entry", "science log entries"], ["tos.upkeepq.v1", "upkeep change", "upkeep changes"], ["tos.mealq.v1", "meals change", "meals changes"]];
  function bkCount(k, v) {
    if (!v) return 0;
    if (Array.isArray(v)) return v.length;
    if (k === "tos.sciq.v1") return (Array.isArray(v.add) ? v.add.length : 0) + Object.keys(v.star || {}).length;
    if (Array.isArray(v.ops)) return v.ops.length;   /* upkeep and meals: { ops } */
    return typeof v === "object" ? Object.keys(v).length : 0;
  }
  function bkPendingList() { return BK_QUEUES.map(function (q) { var n = bkCount(q[0], lsGet(q[0])); return n ? n + " " + (n === 1 ? q[1] : q[2]) : ""; }).filter(Boolean); }
  function bkPending() { return BK_QUEUES.reduce(function (n, q) { return n + bkCount(q[0], lsGet(q[0])); }, 0); }
  function bkSend() { flushQueue(true); flushHabits(); flushTarot(); flushApiary(); flushInbox(); sciFlush(); flushUpkeep(); flushMeals(); toast("Sending what's waiting…"); setTimeout(function () { if (state.screen === "systems") render(true); }, 5000); }
  function bkDrafts() {
    return [["tos.ldraft.v1", "Captain's Log writing"], ["tos.sndraft.v1", "session notes not yet saved"], ["tos.rdraft.v1", "a review draft"], ["tos.tarotdraft.v1", "a new tarot reading"], ["tos.apdraft.v1", "a hive check in progress"]]
      .filter(function (d) { var v = lsGet(d[0]); return v && (typeof v !== "object" || Object.keys(v).length); }).map(function (d) { return d[1]; });
  }
  function bkMake() {
    if (bk.busy) return;
    if (bkPending()) { bk.err = "Changes are still waiting to reach Notion or Google. Back up once they've gone."; render(true); return; }
    if (bk.p1.length < 8) { bk.err = "Use a passphrase of at least 8 characters."; render(true); return; }
    if (bk.p1 !== bk.p2) { bk.err = "The two passphrases don't match."; render(true); return; }
    var keys = {};
    BK_KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) keys[k] = v; } catch (x) { /* unreadable: skipped */ } });
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), made = new Date();
    bk.busy = true; bk.err = ""; bk.msg = ""; render(true);
    bkKey(bk.p1, salt, BK_ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(JSON.stringify({ keys: keys })));
    }).then(function (ct) {
      var file = { format: BK_FORMAT, v: 1, made: made.toISOString(), app: VERSION, kdf: { name: "PBKDF2", hash: "SHA-256", iter: BK_ITER, salt: bkB64(salt) }, cipher: { name: "AES-GCM", iv: bkB64(iv) }, data: bkB64(ct) };
      bk.out = { name: "timothyos-backup-" + ymd(made) + "-" + p2(made.getHours()) + p2(made.getMinutes()) + ".json", text: JSON.stringify(file) };
      bk.p1 = bk.p2 = ""; lsSet(LS_BKAT, made.toISOString());
    }).catch(function () { bk.err = "This iPad couldn't lock the file. Nothing was saved."; })
      .then(function () { bk.busy = false; render(true); });
  }
  /* The Share sheet (Save to Files) where the iPad offers it, else a download. A second tap, so iPadOS sees it as yours. */
  function bkSave() {
    if (!bk.out) return;
    var o = bk.out, blob = new Blob([o.text], { type: "application/json" }), done = function () { bk.msg = "Backup handed to the iPad as " + o.name + ". Keep the passphrase somewhere safe: it is the only way to open the file."; render(true); };
    var dl = function () { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); done(); };
    try {
      var f = new File([blob], o.name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: o.name }).then(done, function (e) { if (!e || e.name !== "AbortError") dl(); }); return; }
    } catch (x) { /* no Share sheet here */ }
    dl();
  }
  function bkRead(file) {
    bk.r = null; bk.err = "";
    if (!file) { render(true); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var j = null;
      try { j = JSON.parse(String(rd.result)); } catch (x) { j = null; }
      if (!j || j.format !== BK_FORMAT || j.v !== 1 || !j.kdf || !j.cipher || !j.data) bk.err = "That file isn't a TimothyOS backup.";
      else bk.r = { file: j, name: file.name, plan: null };
      render(true);
    };
    rd.onerror = function () { bk.err = "The iPad couldn't read that file."; render(true); };
    rd.readAsText(file);
  }
  function bkOpen() {
    var j = bk.r && bk.r.file;
    if (!j || bk.busy) return;
    bk.busy = true; bk.err = ""; render(true);
    bkKey(bk.rp, bkUnB64(j.kdf.salt), +j.kdf.iter || BK_ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: bkUnB64(j.cipher.iv) }, key, bkUnB64(j.data));
    }).then(function (pt) {
      var all = JSON.parse(new TextDecoder().decode(pt)).keys || {}, keys = {};
      BK_KEYS.forEach(function (k) { if (typeof all[k] === "string") { try { JSON.parse(all[k]); keys[k] = all[k]; } catch (x) { /* damaged: left out */ } } });
      bk.r.plan = keys; bk.rp = "";
    }).catch(function () { bk.err = "That passphrase doesn't open this backup."; })
      .then(function () { bk.busy = false; render(true); });
  }
  function bkSummary(keys) {
    var g = function (k) { try { return keys[k] ? JSON.parse(keys[k]) : null; } catch (x) { return null; } }, n = function (v) { return Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0; };
    var links = [g("tos.conn.v1") && "the bridge", g("tos.nas.v1") && "the NAS relay", g("tos.ha.v1") && "Home Assistant"].filter(Boolean);
    var c = function (v, one, many) { var k = n(v); return k + " " + (k === 1 ? one : many); };
    var rows = [["LINKS", links.length ? links.join(", ") : "none"],
      ["ENGINEERING", c(g("tos.hadev.v1"), "device", "devices") + " · " + c(g("tos.hagroups.v1"), "room", "rooms") + " · " + c(g("tos.upkeep.v1"), "upkeep item", "upkeep items")],
      ["HOLODECK · AUDIO", c(g("tos.plays.v1"), "podcast place", "podcast places") + " · " + c(g("tos.nashide.v1"), "hidden folder", "hidden folders")],
      ["CALENDARS", c(g("tos.ignore.v1"), "ignored title", "ignored titles") + " · " + c(g("tos.breaks.v1"), "break", "breaks")],
      ["BRIDGE", c(g("tos.pins.v1"), "pinned station", "pinned stations") + " · " + c(g("tos.bearings.v1"), "bearing", "bearings") + (g("tos.place.v1") ? " · location set" : "")]];
    return rows;
  }
  function bkApply() {
    var keys = bk.r && bk.r.plan;
    if (!keys) return;
    try { Object.keys(keys).forEach(function (k) { localStorage.setItem(k, keys[k]); }); sessionStorage.setItem("tos.restored", "1"); }
    catch (x) { bk.err = "The iPad wouldn't store the settings. Nothing was changed."; render(true); return; }
    location.reload();
  }
  function bkRestoreHtml() {
    var r = bk.r, html = '<label class="ov-sub" for="bkFile">RESTORE FROM A BACKUP</label><input type="file" id="bkFile" class="bk-file" accept=".json,application/json">';
    if (r && !r.plan) html += '<small class="muted">' + esc(r.name) + " · made " + esc(stamp(Date.parse(r.file.made))) + (r.file.app ? " on version " + esc(r.file.app) : "") + "</small>" +
      '<label class="ov-sub" for="bkRPass">PASSPHRASE</label><input type="password" id="bkRPass" autocomplete="off" value="' + esc(bk.rp) + '">' +
      '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn" data-act="bkopen"' + (bk.busy ? " disabled" : "") + ">" + (bk.busy ? "OPENING…" : "OPEN BACKUP") + "</button></div>";
    if (r && r.plan) html += '<div class="bk-plan"><b>THIS BACKUP HOLDS</b><dl class="kv">' + bkSummary(r.plan).map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>"; }).join("") + "</dl>" +
      '<small class="muted">Restoring replaces those settings on this iPad and reloads the app. Your Notion and Google data are untouched and come back with the next sync.</small>' +
      '<div class="btnrow" style="margin-top:10px"><button type="button" class="btn" data-act="bkapply">RESTORE</button><button type="button" class="btn ghost" data-act="bkcancel">CANCEL</button></div></div>';
    return html;
  }
  function backupSection() {
    var pend = bkPending(), drafts = bkDrafts(), at = lsGet(LS_BKAT);
    var html = '<section id="sec-backup">' + phead("BACKUP AND RESTORE", at ? "LAST BACKUP " + esc(stamp(Date.parse(at))) : "NO BACKUP YET") +
      '<small class="muted">One file with everything kept only on this iPad: the bridge, NAS and Home Assistant links, ENGINEERING devices, rooms and upkeep, pins, ignored events, breaks, bearings, podcast places and the other settings. It is locked with a passphrase you choose, which is never stored. Notion and Google data are not in it (they come back on the next sync), and neither is any unsaved writing.</small>';
    if (pend) html += '<div class="err">' + pend + (pend === 1 ? " change is" : " changes are") + " still waiting to reach Notion or Google (" + esc(bkPendingList().join(", ")) + "). Back up once they've gone.</div>" +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn ghost" data-act="bksend">SEND NOW</button></div>';
    if (drafts.length) html += '<small class="muted">Not in a backup: ' + esc(drafts.join(", ")) + ". Save or finish it first if it matters.</small>";
    if (bk.out) html += '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn capture" data-act="bksave">SAVE TO FILES</button></div><small class="muted">' + esc(bk.out.name) + ". Choose Save to Files, then iCloud Drive or On My iPad.</small>";
    else html += '<label class="ov-sub" for="bkPass">PASSPHRASE (8 OR MORE CHARACTERS)</label><input type="password" id="bkPass" autocomplete="new-password" value="' + esc(bk.p1) + '">' +
      '<label class="ov-sub" for="bkPass2">THE SAME AGAIN</label><input type="password" id="bkPass2" autocomplete="new-password" value="' + esc(bk.p2) + '">' +
      '<div class="btnrow" style="margin-top:12px"><button type="button" class="btn" data-act="bkmake"' + (pend || bk.busy ? " disabled" : "") + ">" + (bk.busy ? "LOCKING…" : "MAKE BACKUP") + "</button></div>";
    if (bk.msg) html += '<div class="ok-note">' + esc(bk.msg) + "</div>";
    if (bk.err) html += '<div class="err">' + esc(bk.err) + "</div>";
    return html + bkRestoreHtml() + "</section>";
  }
  function bkClick(b) {
    var a = b.dataset.act;
    if (a === "bkmake") { bkMake(); return true; }
    if (a === "bksend") { bkSend(); return true; }
    if (a === "bksave") { bkSave(); return true; }
    if (a === "bkopen") { bkOpen(); return true; }
    if (a === "bkapply") { bkApply(); return true; }
    if (a === "bkcancel") { bk.r = null; bk.err = ""; render(true); return true; }
    return false;
  }
  document.addEventListener("input", function (e) {
    var id = e.target && e.target.id;
    if (id === "bkPass") bk.p1 = e.target.value; else if (id === "bkPass2") bk.p2 = e.target.value; else if (id === "bkRPass") bk.rp = e.target.value;
  });
  document.addEventListener("change", function (e) { if (e.target && e.target.id === "bkFile") bkRead(e.target.files && e.target.files[0]); });
  try { if (sessionStorage.getItem("tos.restored")) { sessionStorage.removeItem("tos.restored"); setTimeout(function () { toast("Restored from backup. Syncing your data."); }, 800); } } catch (x) { /* private mode */ }

