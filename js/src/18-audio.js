  /* ---------- Render + navigation ---------- */
  /* ---------- Storage (the NAS) ---------- */
  /* Browses NAS folders and plays audio through a small read-only relay on the NAS (Caddy behind
     Tailscale; setup in the README under NAS relay). The relay address and token are typed in Systems
     and kept on this iPad only, like the access key. Folder listings come as JSON (Accept header);
     audio streams straight from the relay with the token in the address, since an <audio> element
     can't send headers. Where you stopped in each file is kept on this iPad only. */
  var LS_NAS = "tos.nas.v1";            /* { url, token }: the relay, typed in Systems */
  var LS_PLAYS = "tos.plays.v1";        /* { path: { p: seconds, d: duration, done, at } } */
  var LS_NASDIR = "tos.nasdir.v1";      /* folder last open in Storage */
  var LS_NASPREF = "tos.naspref.v1";    /* { speed, auto } */
  var LS_NASHIDE = "tos.nashide.v1";    /* folders hidden from Storage on this iPad (unhide in Systems) */
  var LS_NASART = "tos.nasart.v1";      /* folder art: "f:/path/cover.jpg" (a picture in the folder) or a small JPEG from an episode's tags */
  var LS_NASTAGS = "tos.nastags.v1";    /* titles read from files' tags: { path: { t, a, al } } */
  var COVER_NAME = /^(cover|folder|front|album|albumart|artwork|art|poster)\.(jpe?g|png|webp)$/i, IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
  var nasArt = lsGet(LS_NASART) || {}, nasTags = lsGet(LS_NASTAGS) || {};
  var LS_NASSORT = "tos.nassort.v1";    /* sort chosen per folder: { dir: "name" | "newest" | "track" } */
  var nasSorts = lsGet(LS_NASSORT) || {};
  function sortOf(dir) { return nasSorts[dir] || "name"; }
  function sorterFor(srt) {
    var byName = function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); };
    var tk = function (x) { var t = nasTags[x.path]; return t && t.n ? [t.d || 1, t.n] : [1e9, 1e9]; };
    return srt === "newest" ? function (a, b) { return (b.mod || 0) - (a.mod || 0) || byName(a, b); }
      : srt === "track" ? function (a, b) { var ka = tk(a), kb = tk(b); return ka[0] - kb[0] || ka[1] - kb[1] || byName(a, b); } : byName;
  }
  var AUDIO_EXT = /\.(mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac)$/i;
  var NAS_HIDE = ["cdrom", "floppy", "usb"];   /* empty folders built into the relay's image, not NAS folders */
  var nas = { view: "home", dir: lsGet(LS_NASDIR) || "/", lists: {}, err: null, inflight: {}, q: "", filter: "all", sort: "name", ok: null, sleep: null, sleepAt: 0, armClear: 0, armWhat: "" };
  var plays = lsGet(LS_PLAYS) || {};
  var nasPref = Object.assign({ speed: 1, auto: true }, lsGet(LS_NASPREF) || {});
  var pl = { path: null, list: [], el: null, lastSave: 0, ready: false, artBig: null, artSmall: null, pre: null, blob: null, scrub: null, scrubDraw: false };
  function nasHidden() { return lsGet(LS_NASHIDE) || []; }
  function isHidden(path) { return nasHidden().indexOf(path) > -1; }
  function nasConf() { var c = lsGet(LS_NAS); return c && c.url && c.token ? c : null; }
  function nasBase() { return nasConf().url.replace(/\/+$/, ""); }
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function joinPath(dir, name) { return (dir.replace(/\/+$/, "") + "/" + name).replace(/\/+/g, "/"); }
  function parentOf(p) { var s = p.replace(/\/+$/, "").split("/"); s.pop(); return s.join("/") || "/"; }
  function baseName(p) { return p.replace(/\/+$/, "").split("/").pop() || "NAS"; }
  function niceName(p) { return baseName(p).replace(AUDIO_EXT, "").replace(/[_]+/g, " "); }
  function nasErrText(err) {
    var code = err && (err.code || err.message);
    if (code === "unauthorized") return "The NAS refused the token. Check it under NAS RELAY in Systems.";
    if (code === "offline") return "This iPad is offline.";
    if (code === "unreachable") return "Can't reach the NAS. Check that Tailscale is on, and that the timothyos project is running in Docker on the NAS.";
    if (/^http_/.test(code || "")) return "The NAS answered with an error (" + code.slice(5) + ").";
    return "Something went wrong reading the NAS.";
  }
  /* One folder, as the relay lists it: folders first, hidden and system names left out. */
  function nasList(dir, force) {
    var c = nasConf();
    if (!c) return Promise.reject({ code: "not_set" });
    var have = nas.lists[dir];
    if (!force && have && Date.now() - have.at < 60000) return Promise.resolve(have);
    if (nas.inflight[dir]) return nas.inflight[dir];
    var req = fetch(nasBase() + encPath(dir.replace(/\/?$/, "/")), { headers: { Accept: "application/json", Authorization: "Bearer " + c.token }, cache: "no-store" })
      .catch(function () { throw { code: navigator.onLine === false ? "offline" : "unreachable" }; })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw { code: "unauthorized" };
        if (!r.ok) throw { code: "http_" + r.status };
        return r.json();
      }).then(function (arr) {
        var items = (Array.isArray(arr) ? arr : []).map(function (x) {
          var name = String(x.name || "").replace(/\/+$/, "");
          return { name: name, path: joinPath(dir, name), dir: !!x.is_dir, size: x.size || 0, mod: x.mod_time ? Date.parse(x.mod_time) : 0 };
        }).filter(function (x) { return x.name && !/^[.@#]/.test(x.name) && !(dir === "/" && x.dir && NAS_HIDE.indexOf(x.name) > -1); });
        var out = { at: Date.now(), items: items };
        var pics = items.filter(function (x) { return !x.dir && IMAGE_EXT.test(x.name); });
        var cov = pics.filter(function (x) { return COVER_NAME.test(x.name); })[0] || pics[0];
        if (cov && nasArt[dir] !== "f:" + cov.path) setArt(dir, "f:" + cov.path);
        else if (!cov && /^f:/.test(nasArt[dir] || "")) setArt(dir, null);
        nas.lists[dir] = out; nas.ok = true; nas.err = null;
        return out;
      }).catch(function (err) { nas.ok = false; nas.err = { at: Date.now(), code: err.code, msg: nasErrText(err) }; throw err; })
      .then(function (v) { delete nas.inflight[dir]; return v; }, function (e) { delete nas.inflight[dir]; throw e; });
    nas.inflight[dir] = req;
    return req;
  }
  function nasLoad(dir, force) { nasList(dir, force).catch(function () {}).then(function () { if (state.screen === "storage") render(true); }); }
  function savePlays() {
    var keys = Object.keys(plays);
    if (keys.length > 1500) keys.sort(function (a, b) { return (plays[a].at || 0) - (plays[b].at || 0); }).slice(0, keys.length - 1500).forEach(function (k) { delete plays[k]; });
    lsSet(LS_PLAYS, plays);
  }
  function playOf(path) { return plays[path] || null; }
  function mmss(s) { s = Math.max(0, Math.round(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + p2(m) : m) + ":" + p2(x); }
  function sizeLabel(b) { return b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : b + " B"; }
  function initials(p) { var w = baseName(p).replace(/^the\s+/i, "").split(/[\s_-]+/).filter(Boolean); return ((w[0] || "?")[0] + (w[1] ? w[1][0] : "")).toUpperCase(); }

  function setArt(dir, v) {
    if (v) nasArt[dir] = v; else delete nasArt[dir];
    var keys = Object.keys(nasArt);
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (k) { delete nasArt[k]; });
    lsSet(LS_NASART, nasArt);
  }
  function artSrc(dir) {
    var a = nasArt[dir], c = nasConf();
    if (!a || !c) return null;
    return /^f:/.test(a) ? nasBase() + encPath(a.slice(2)) + "?k=" + encodeURIComponent(c.token) : a;
  }
  /* A square of art: the folder's picture when there is one, its initials underneath as the fallback. */
  function artHtml(dir, cls, big) {
    var src = big && pl.artBig && parentOf(pl.path) === dir ? pl.artBig : artSrc(dir);
    return '<span class="' + cls + '">' + esc(initials(dir)) + (src ? '<img class="nas-img" src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : "") + "</span>";
  }
  function dispName(path) { var t = nasTags[path]; return t && t.t ? t.t : niceName(path); }
  document.addEventListener("error", function (e) { if (e.target && e.target.classList && e.target.classList.contains("nas-img")) e.target.remove(); }, true);

  /* ---------- tags: ID3v2 at the start of an MP3 (title, show, album, artwork) ---------- */
  /* Two small ranged reads: the 10-byte header, then the tag itself (capped). Read when a file
     starts playing; titles are remembered on this iPad, artwork becomes the folder's art when the
     folder has no picture of its own. */
  function rangeGet(path, a, b) {
    var c = nasConf();
    return fetch(nasBase() + encPath(path), { headers: { Authorization: "Bearer " + c.token, Range: "bytes=" + a + "-" + b }, cache: "no-store" })
      .then(function (r) { if (!r.ok) throw { code: "http_" + r.status }; return r.arrayBuffer(); });
  }
  function id3Text(u8, enc) {
    var label = enc === 1 ? "utf-16" : enc === 2 ? "utf-16be" : enc === 3 ? "utf-8" : "latin1";
    try { return new TextDecoder(label).decode(u8).replace(/\u0000+$/, "").split("\u0000")[0].trim(); } catch (e) { return ""; }
  }
  /* ID3v2.2, 2.3 and 2.4. Frames are walked over a buffer holding bytes [base, base + b.length) of the file; when a
     frame runs past what was read (usually a big picture placed before the text frames), the walk stops and says where
     the next frame starts, so a second read can carry on from there without fetching the picture (2.30.1). */
  var ID3_V22 = { TT2: "TIT2", TP1: "TPE1", TAL: "TALB", TRK: "TRCK", TPA: "TPOS", TLE: "TLEN", PIC: "APIC" };
  function id3Head(b) {
    if (b.length < 10 || b[0] !== 73 || b[1] !== 68 || b[2] !== 51 || b[3] < 2 || b[3] > 4) return null;   /* "ID3" */
    var ss = function (i) { return (b[i] & 127) << 21 | (b[i + 1] & 127) << 14 | (b[i + 2] & 127) << 7 | (b[i + 3] & 127); };
    var ver = b[3], flags = b[5], size = ss(6), pos = 10;
    if (flags & 0x40 && ver > 2 && b.length >= 14) pos += ver === 4 ? ss(10) : ((b[10] << 24 | b[11] << 16 | b[12] << 8 | b[13]) >>> 0) + 4;
    return { ver: ver, unsync: !!(flags & 0x80) && ver < 4, pos: pos, end: 10 + size, total: 10 + size + (flags & 0x10 ? 10 : 0) };
  }
  /* Unsynchronisation: an encoder put a 0x00 after every 0xFF; take them out again. */
  function deUnsync(u8) {
    var out = new Uint8Array(u8.length), n = 0;
    for (var i = 0; i < u8.length; i++) { out[n++] = u8[i]; if (u8[i] === 255 && u8[i + 1] === 0) i++; }
    return out.subarray(0, n);
  }
  function id3Walk(b, base, h, pos, out, wantPic) {
    var hl = h.ver === 2 ? 6 : 10;
    while (pos + hl <= h.end) {
      var i = pos - base;
      if (i < 0 || i + hl > b.length) return pos;   /* the next frame header isn't in this read */
      var id = h.ver === 2 ? String.fromCharCode(b[i], b[i + 1], b[i + 2]) : String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) return null;   /* padding: the end of the frames */
      var size = h.ver === 2 ? (b[i + 3] << 16 | b[i + 4] << 8 | b[i + 5]) : h.ver === 4 ? ((b[i + 4] & 127) << 21 | (b[i + 5] & 127) << 14 | (b[i + 6] & 127) << 7 | (b[i + 7] & 127)) : ((b[i + 4] << 24 | b[i + 5] << 16 | b[i + 6] << 8 | b[i + 7]) >>> 0);
      var fmt = h.ver === 2 ? 0 : b[i + 9], key = h.ver === 2 ? ID3_V22[id] : id, at = i + hl, next = pos + hl + size;
      if (size <= 0 || next > h.end + 4) return null;
      var useful = key === "TIT2" || key === "TPE1" || key === "TALB" || key === "TRCK" || key === "TPOS" || key === "TLEN" || (wantPic && key === "APIC" && !out.pic);
      if (!useful) { pos = next; continue; }
      if (at + size > b.length) return pos;   /* this frame runs past the read: start the next read here */
      var data = b.subarray(at, at + size);
      if (h.ver === 4) {
        if (fmt & 0x0C) { pos = next; continue; }   /* compressed or encrypted: not read */
        if (fmt & 0x40) data = data.subarray(1);    /* grouping identity */
        if (fmt & 0x01) data = data.subarray(4);    /* data length indicator */
        if (fmt & 0x02) data = deUnsync(data);
      } else if (h.ver === 3) {
        if (fmt & 0xC0) { pos = next; continue; }
        if (fmt & 0x20) data = data.subarray(1);    /* grouping identity */
      }
      if (key === "APIC") {
        var enc = data[0], j = 1, mime;
        if (h.ver === 2) { mime = "image/" + new TextDecoder("latin1").decode(data.subarray(1, 4)).toLowerCase().replace("jpg", "jpeg"); j = 4; }
        else { while (j < data.length && data[j]) j++; mime = new TextDecoder("latin1").decode(data.subarray(1, j)) || "image/jpeg"; j++; }
        j++;   /* the picture type */
        if (enc === 1 || enc === 2) { while (j + 1 < data.length && (data[j] || data[j + 1])) j += 2; j += 2; } else { while (j < data.length && data[j]) j++; j++; }
        if (j < data.length) out.pic = { mime: /^image\//.test(mime) ? mime : "image/" + mime.toLowerCase().replace("jpg", "jpeg"), data: data.slice(j) };
      } else {
        var txt = id3Text(data.subarray(1), data[0]);
        if (key === "TLEN") { var ms = parseInt(txt, 10); if (ms > 0) out.len = ms / 1000; }
        else if (key === "TRCK" || key === "TPOS") { var nv = parseInt(txt, 10); if (nv > 0) out[key === "TRCK" ? "n" : "d"] = nv; }   /* "3/12" or "003" → 3 */
        else out[{ TIT2: "t", TPE1: "a", TALB: "al" }[key]] = txt;
      }
      pos = next;
    }
    return null;
  }
  /* A tag already in hand (from byte 0): what it holds, null if there's no tag. */
  function parseId3(buf) {
    var b = new Uint8Array(buf), h = id3Head(b), out = {};
    if (!h) return null;
    if (h.unsync) { b = new Uint8Array([].slice.call(b, 0, 10).concat([].slice.call(deUnsync(b.subarray(10, Math.min(b.length, h.end)))))); h.end = Math.min(h.end, b.length); }
    id3Walk(b, 0, h, h.pos, out, true);
    return out;
  }
  /* For the TRACK # scan: the text frames however the tag is laid out. 64 KB first; if a frame runs past it, read on
     from the next frame (up to six more reads, skipping pictures). An unsynchronised tag is read whole (up to 1 MB).
     No number in an ID3v2 tag: the ID3v1.1 tag in the last 128 bytes may carry one. */
  function scanTags(it) {
    return rangeGet(it.path, 0, 65535).then(function (buf) {
      var b = new Uint8Array(buf), h = id3Head(b), out = {};
      var v1 = function () {
        if (out.n || !it.size || it.size < 256) return out;
        return rangeGet(it.path, it.size - 128, it.size - 1).then(function (e) {
          var x = new Uint8Array(e);
          if (x.length === 128 && x[0] === 84 && x[1] === 65 && x[2] === 71) {   /* "TAG" */
            if (x[125] === 0 && x[126] > 0) out.n = x[126];
            if (!out.t) { var tt = new TextDecoder("latin1").decode(x.subarray(3, 33)).replace(/\u0000.*$/, "").trim(); if (tt) out.t = tt; }
          }
          return out;
        }, function () { return out; });
      };
      if (!h) return v1();
      if (h.unsync) return (h.end <= b.length ? Promise.resolve(buf) : rangeGet(it.path, 0, Math.min(h.end, 1048576) - 1)).then(function (whole) { out = parseId3(whole) || {}; delete out.pic; return v1(); });
      var go = function (bb, base, pos, hops) {
        var stop = id3Walk(bb, base, h, pos, out, false);
        if (stop === null || hops >= 6) return v1();
        return rangeGet(it.path, stop, Math.min(h.end, stop + 65535)).then(function (nb) { return go(new Uint8Array(nb), stop, stop, hops + 1); });
      };
      return go(b, 0, h.pos, 0);
    });
  }
  /* Remembered per file. "s" marks a file whose tag has been read, so a file without one isn't asked again. */
  function saveTag(path, t, quiet, it) {
    var was = nasTags[path] || {};
    nasTags[path] = { t: t.t || "", a: t.a || "", al: t.al || "", n: t.n || 0, d: t.d || 0, s: 1, m: it ? it.mod : was.m || 0, z: it ? it.size : was.z || 0 };
    var keys = Object.keys(nasTags); if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(function (k) { delete nasTags[k]; });
    if (!quiet) lsSet(LS_NASTAGS, nasTags);
  }
  /* TRACK #: read the start of every MP3 in a folder (64 KB, where the text tags sit; artwork is
     skipped), four at a time, then sort by disc and track. Files without a number go last. */
  function scanFolder(dir) {
    var l = nas.lists[dir];
    if (!l || (nas.scan && nas.scan.dir === dir)) return;
    /* read again when the file has changed since (retagged), or was read before 2.30.1 (no m) */
    var todo = l.items.filter(function (x) { var e = nasTags[x.path]; return !x.dir && /\.mp3$/i.test(x.name) && !(e && e.s && e.m === x.mod && e.z === x.size); });
    if (!todo.length) return;
    var sc = nas.scan = { dir: dir, done: 0, total: todo.length }, lastPaint = 0;
    var paint = function (force) { if (state.screen === "storage" && nas.view === "browse" && nas.dir === dir && (force || Date.now() - lastPaint > 400)) { lastPaint = Date.now(); render(true); } };
    var one = function () {
      var it = todo.shift();
      if (!it || nas.scan !== sc) return Promise.resolve();
      return scanTags(it).then(function (tg) { saveTag(it.path, tg || {}, true, it); }, function () { /* unreadable: its filename stands in */ })
        .then(function () { sc.done++; paint(false); return one(); });
    };
    Promise.all([one(), one(), one(), one()]).then(function () {
      if (nas.scan === sc) nas.scan = null;
      lsSet(LS_NASTAGS, nasTags); paint(true);
    });
  }
  function readTags(path) {
    if (!/\.mp3$/i.test(path)) return;
    rangeGet(path, 0, 9).then(function (h) {
      var b = new Uint8Array(h);
      if (b.length < 10 || b[0] !== 73 || b[1] !== 68 || b[2] !== 51) return null;
      var size = (b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127);
      return rangeGet(path, 0, Math.min(size + 9, 4194303)).then(parseId3);   /* up to 4 MB: enough for any tag with its artwork */
    }).then(function (t) {
      if (!t) return;
      saveTag(path, t);
      if (t.pic && pl.path === path) {
        var blob = new Blob([t.pic.data], { type: t.pic.mime }), url = URL.createObjectURL(blob);
        if (pl.artBig) URL.revokeObjectURL(pl.artBig);
        pl.artBig = url;
        var img = new Image();
        img.onload = function () {
          try {
            var n = 240, cv = document.createElement("canvas"), sc = Math.max(n / img.width, n / img.height);
            cv.width = n; cv.height = n;
            cv.getContext("2d").drawImage(img, (n - img.width * sc) / 2, (n - img.height * sc) / 2, img.width * sc, img.height * sc);
            var small = cv.toDataURL("image/jpeg", 0.78), dir = parentOf(path);
            if (!/^f:/.test(nasArt[dir] || "")) setArt(dir, small);
            pl.artSmall = small;
          } catch (e) { /* the picture couldn't be drawn; the big one still shows */ }
          mediaMeta(); paintPlayer();
        };
        img.src = url;
      }
      if (pl.path === path) { mediaMeta(); paintPlayer(); }
    }).catch(function () { /* no tags: the filename stands in */ });
  }
  /* ---------- track lengths (2.30): read from the files themselves ---------- */
  /* A folder's lengths are read when it opens, two files at a time, with small ranged reads (no download):
     MP3, the first frame after the ID3 tag: its Xing/Info or VBRI header counts the frames (exact even for
     variable bitrate), else the tag's TLEN, else bitrate and file size. M4A/M4B, the movie header (mvhd),
     hopping over the audio when the header sits at the end. FLAC, STREAMINFO. WAV, byte rate and data size.
     Remembered on this iPad by path and file size (tos.naslen.v1); -1 marks one that couldn't be read, so it
     isn't asked again. A file you've played shows the length the player measured. */
  var LS_NASLEN = "tos.naslen.v1", nasLen = lsGet(LS_NASLEN) || {}, LEN_EXT = /\.(mp3|m4a|m4b|flac|wav)$/i;
  function lenOf(it) {
    var r = playOf(it.path); if (r && r.d) return r.d;
    var x = nasLen[it.path]; return x && x.s > 0 && (x.z === it.size || !it.size) ? x.s : null;
  }
  function u32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
  function le32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  function tag4(b, i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); }
  var MP3_BR = { 1: [[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]],
    2: [[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]] };
  var MP3_SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  /* b: bytes starting at file offset base; the first real frame at or after index from (the next frame must follow it). */
  function mp3Len(b, from, base, total, tlen) {
    for (var i = from; i + 4 < b.length && i < from + 16384; i++) {
      if (b[i] !== 255 || (b[i + 1] & 0xE0) !== 0xE0) continue;
      var v = (b[i + 1] >> 3) & 3, lay = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
      if (v === 1 || lay === 0 || bri === 0 || bri === 15 || sri === 3) continue;
      var l = 4 - lay, sr = MP3_SR[v][sri], br = MP3_BR[v === 3 ? 1 : 2][l - 1][bri], pad = (b[i + 2] >> 1) & 1, mono = (b[i + 3] >> 6) === 3;
      var spf = l === 1 ? 384 : l === 2 || v === 3 ? 1152 : 576, flen = l === 1 ? (Math.floor(12 * br * 1000 / sr) + pad) * 4 : Math.floor(spf / 8 * br * 1000 / sr) + pad;
      if (i + flen + 1 < b.length && (b[i + flen] !== 255 || (b[i + flen + 1] & 0xE0) !== 0xE0)) continue;   /* not followed by a frame: a false sync */
      var xo = i + 4 + (l === 3 ? (v === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17)) : 0), x = xo + 12 <= b.length ? tag4(b, xo) : "";
      if ((x === "Xing" || x === "Info") && (u32(b, xo + 4) & 1)) return u32(b, xo + 8) * spf / sr;
      if (i + 54 <= b.length && tag4(b, i + 36) === "VBRI") return u32(b, i + 50) * spf / sr;
      if (tlen) return tlen;
      return (total - base - i) * 8 / (br * 1000);
    }
    return tlen || null;
  }
  function mp3LenRead(it) {
    return rangeGet(it.path, 0, 65535).then(function (buf) {
      var b = new Uint8Array(buf), end = 0, tag = parseId3(buf);
      if (b.length >= 10 && b[0] === 73 && b[1] === 68 && b[2] === 51) end = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127)) + (b[5] & 0x10 ? 10 : 0);
      if (tag && tag.n && !(nasTags[it.path] && nasTags[it.path].s)) saveTag(it.path, tag, true, it);   /* found the number: the track scan needn't read it again */
      var tlen = tag && tag.len;
      if (end + 8192 <= b.length) return mp3Len(b, end, 0, it.size, tlen);
      return rangeGet(it.path, end, end + 32767).then(function (b2) { return mp3Len(new Uint8Array(b2), 0, end, it.size, tlen); });   /* a big tag (artwork): read past it */
    });
  }
  function mp4LenRead(it) {
    var hop = function (off, n) {
      if (n > 8 || off + 8 > it.size) return null;
      return rangeGet(it.path, off, off + 65535).then(function (buf) {
        var b = new Uint8Array(buf), i = 0;
        while (i + 8 <= b.length) {
          var size = u32(b, i), type = tag4(b, i + 4), hdr = 8;
          if (size === 1) { if (i + 16 > b.length) break; size = u32(b, i + 8) * 4294967296 + u32(b, i + 12); hdr = 16; }
          else if (size === 0) size = it.size - off - i;
          if (size < hdr) return null;
          if (type === "moov") {
            for (var j = i + hdr; j + 8 <= Math.min(b.length, i + size);) {
              var s2 = u32(b, j);
              if (tag4(b, j + 4) === "mvhd") {
                var p = j + 8, v1 = b[p] === 1;
                if (p + (v1 ? 32 : 20) > b.length) return null;
                var ts = v1 ? u32(b, p + 20) : u32(b, p + 12), du = v1 ? u32(b, p + 24) * 4294967296 + u32(b, p + 28) : u32(b, p + 16);
                return ts ? du / ts : null;
              }
              if (s2 < 8) break;
              j += s2;
            }
            return null;
          }
          if (i + size > b.length) return hop(off + i + size, n + 1);   /* the audio (mdat) runs past this read: jump over it */
          i += size;
        }
        return hop(off + i, n + 1);
      });
    };
    return Promise.resolve(hop(0, 0));
  }
  function flacLenRead(it) {
    return rangeGet(it.path, 0, 4095).then(function (buf) {
      var b = new Uint8Array(buf);
      if (b.length < 42 || tag4(b, 0) !== "fLaC" || (b[4] & 127) !== 0) return null;
      var sr = (b[18] << 12) | (b[19] << 4) | (b[20] >> 4), n = (b[21] & 15) * 4294967296 + u32(b, 22);
      return sr && n ? n / sr : null;
    });
  }
  function wavLenRead(it) {
    return rangeGet(it.path, 0, 65535).then(function (buf) {
      var b = new Uint8Array(buf), rate = 0;
      if (b.length < 12 || tag4(b, 0) !== "RIFF" || tag4(b, 8) !== "WAVE") return null;
      for (var i = 12; i + 8 <= b.length;) {
        var id = tag4(b, i), sz = le32(b, i + 4);
        if (id === "fmt " && i + 20 <= b.length) rate = le32(b, i + 16);
        if (id === "data") return rate ? (sz && sz !== 0xFFFFFFFF ? sz : it.size - i - 8) / rate : null;
        i += 8 + sz + (sz & 1);
      }
      return null;
    });
  }
  function lenRead(it) {
    var n = it.name.toLowerCase();
    return /\.mp3$/.test(n) ? mp3LenRead(it) : /\.m4[ab]$/.test(n) ? mp4LenRead(it) : /\.flac$/.test(n) ? flacLenRead(it) : wavLenRead(it);
  }
  function lenScan(dir) {
    var l = nas.lists[dir];
    if (!l || nas.lscan === dir) return;
    var todo = l.items.filter(function (x) { return !x.dir && LEN_EXT.test(x.name) && lenOf(x) === null && !(nasLen[x.path] && nasLen[x.path].z === x.size); });
    if (!todo.length) return;
    var tok = nas.lscan = dir, lastPaint = 0;
    var paint = function (force) { if (state.screen === "storage" && nas.view === "browse" && nas.dir === dir && (force || Date.now() - lastPaint > 500)) { lastPaint = Date.now(); render(true); } };
    var one = function () {
      var it = todo.shift();
      if (!it || nas.lscan !== tok) return Promise.resolve();
      return lenRead(it).then(function (s) { nasLen[it.path] = { s: s > 0 && isFinite(s) ? Math.round(s) : -1, z: it.size }; }, function () { /* unreachable now: tried again next time */ })
        .then(function () { paint(false); return one(); });
    };
    Promise.all([one(), one()]).then(function () {
      if (nas.lscan === tok) nas.lscan = null;
      var keys = Object.keys(nasLen); if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(function (k) { delete nasLen[k]; });
      lsSet(LS_NASLEN, nasLen); lsSet(LS_NASTAGS, nasTags); paint(true);
    });
  }
  function mediaMeta() {
    if (!("mediaSession" in navigator) || !window.MediaMetadata || !pl.path) return;
    var t = nasTags[pl.path] || {}, dir = parentOf(pl.path), art = pl.artSmall || (/^f:/.test(nasArt[dir] || "") ? artSrc(dir) : nasArt[dir]);
    navigator.mediaSession.metadata = new MediaMetadata({ title: dispName(pl.path), artist: t.a || baseName(dir), album: t.al || "TimothyOS · Storage", artwork: art ? [{ src: art, sizes: "240x240" }] : [] });
  }
  /* ---------- the player: one <audio> for the whole app, so it keeps playing on other screens ---------- */
  function audioEl() {
    if (pl.el) return pl.el;
    var a = document.createElement("audio");
    a.id = "nasAudio"; a.preload = "metadata"; a.setAttribute("playsinline", "");
    document.body.appendChild(a);
    a.addEventListener("loadedmetadata", function () {
      var r = playOf(pl.path);
      if (r && !r.done && r.p > 5 && r.p < a.duration - 5) { a.currentTime = r.p; if (r.by && prof.me() && r.by !== prof.me()) toast("Picked up from " + r.by + " at " + mmss(r.p)); }
      pl.ready = true; markPlay(false); paintPlayer();
    });
    a.addEventListener("timeupdate", function () {
      if (Date.now() - pl.lastSave > 10000) markPlay(false);
      paintPlayer(true); sleepCheck(); preNext();
      var left = isFinite(a.duration) ? a.duration - a.currentTime : 1e9;
      if (pl.pre && pl.pre.url && !a.paused && left <= PRE_HANDOFF && autoNext()) toNext();   /* still playing: iPadOS keeps the app awake */
      else if (pl.pre && pl.pre.url && !a.paused && left < 2 && !pl.preT) {   /* and a timer for the moment itself, in case no time update lands in that last fraction */
        var at = pl.path; pl.preT = setTimeout(function () { pl.preT = 0; var e2 = pl.el; if (pl.path === at && e2 && !e2.paused && e2.duration - e2.currentTime <= PRE_HANDOFF + .2 && pl.pre && pl.pre.url && autoNext()) toNext(); }, Math.max(0, (left - PRE_HANDOFF / 2) * 1000 / (a.playbackRate || 1)));
      }
    });
    a.addEventListener("play", function () { pl.closed = false; paintPlayer(); mediaState(); });
    a.addEventListener("pause", function () { markPlay(false); paintPlayer(); mediaState(); });
    a.addEventListener("seeked", function () { markPlay(false); });
    a.addEventListener("ended", function () {
      markPlay(true);
      if (nas.sleep === "end") { nas.sleep = null; sb.slept = true; paintPlayer(); toast("Sleep timer: stopped at the end of the episode"); return; }
      if (autoNext()) toNext(); else paintPlayer();
    });
    a.addEventListener("error", function () { if (pl.path) { toast(nas.ok === false ? "Can't reach the NAS to play this" : "This file won't play on the iPad"); errLog("audio", "file didn't play", "MediaError " + (a.error ? a.error.code + (a.error.message ? " · " + a.error.message : "") : "?"), baseName(pl.path) + (nas.ok === false ? " · NAS unreachable" : "")); } paintPlayer(); });
    if ("mediaSession" in navigator) {
      var ms = navigator.mediaSession, on = function (k, f) { try { ms.setActionHandler(k, f); } catch (e) { /* not supported here */ } };
      on("play", function () { a.play(); });
      on("pause", function () { a.pause(); });
      on("seekbackward", function () { skip(-15); });
      on("seekforward", function () { skip(30); });
      on("nexttrack", function () { var nx = nextUp()[0]; if (nx) playPath(nx.path, pl.list); });
    }
    a.addEventListener("play", function () { holo.quiet(); });   /* one at a time: audio turns the HOLODECK's TV off */
    pl.el = a;
    return a;
  }
  function markPlay(ended) {
    var a = pl.el;
    if (!a || !pl.path || (!pl.ready && !ended)) return;   /* not before the file's start point is set, or a resume would be lost */
    var d = isFinite(a.duration) ? a.duration : (playOf(pl.path) || {}).d || 0, p = a.currentTime || 0;
    var done = !!ended || (d > 0 && p >= d - 1) || (d > 60 && p > d - 30);   /* at the very end counts too: a short track handed on stays played */
    plays[pl.path] = { p: done ? 0 : p, d: d, done: done, at: Date.now(), by: prof.me() };
    pl.lastSave = Date.now(); savePlays();
  }
  /* The next track, ready before this one ends (2.43.1). iPadOS keeps a home-screen web app running in the background
     only while it's making sound. At the end of a track the app falls quiet, and if iPadOS pauses it before the next
     file has started loading over the NAS link, the next track waits until Bridge is opened again. So in a track's last
     90 seconds the next file (up to 150 MB) is read into memory, and the hand-off happens a moment before the end,
     while still playing, with no network wait. Without it ready in time, 'ended' moves on as before. */
  var PRE_SECS = 90, PRE_MAX = 150 * 1048576, PRE_HANDOFF = 0.4;
  function autoNext() { return nasPref.auto && nas.sleep !== "end" && !!nextUp()[0]; }
  function toNext() { var nx = nextUp()[0]; clearTimeout(pl.preT); pl.preT = 0; if (!nx) return; markPlay(true); playPath(nx.path, pl.list); }
  function preDrop() { if (pl.pre && pl.pre.ctrl) pl.pre.ctrl.abort(); if (pl.pre && pl.pre.url) URL.revokeObjectURL(pl.pre.url); pl.pre = null; }
  function preNext() {
    var a = pl.el, nx = autoNext() && nextUp()[0], c = nasConf();
    if (!a || !nx || !c || !isFinite(a.duration) || a.duration - a.currentTime > PRE_SECS) return;
    if (pl.pre && pl.pre.path === nx.path) return;
    preDrop();
    var job = pl.pre = { path: nx.path, url: null, ctrl: typeof AbortController === "function" ? new AbortController() : null };
    fetch(nasBase() + encPath(nx.path), { headers: { Authorization: "Bearer " + c.token }, signal: job.ctrl ? job.ctrl.signal : undefined }).then(function (r) {
      if (!r.ok) throw { code: "http_" + r.status };
      if (+r.headers.get("Content-Length") > PRE_MAX) throw { code: "too_big" };   /* a long episode: streamed as before */
      return r.blob();
    }).then(function (b) { if (pl.pre === job) { job.url = URL.createObjectURL(b); job.ctrl = null; } }, function () { if (pl.pre === job) job.ctrl = null; });
  }
  function playPath(path, list) {
    var c = nasConf();
    if (!c) { toast("Set up the NAS RELAY in Systems first"); return; }
    var a = audioEl();
    if (pl.path && pl.path !== path) markPlay(false);
    if (pl.path === path) { if (a.paused) a.play().catch(function () {}); return; }
    var r = playOf(path);
    if (r && r.done) { r.done = false; r.p = 0; savePlays(); }   /* playing a finished one starts it again */
    pl.path = path; pl.list = list || pl.list; pl.ready = false; pl.closed = false;
    if (pl.blob) { URL.revokeObjectURL(pl.blob); pl.blob = null; }
    if (pl.pre && pl.pre.path === path && pl.pre.url) { pl.blob = pl.pre.url; pl.pre.url = null; a.src = pl.blob; }   /* already here: no wait */
    else a.src = nasBase() + encPath(path) + "?k=" + encodeURIComponent(c.token);
    if (pl.pre && pl.pre.path === path) pl.pre = null; else preDrop();
    a.playbackRate = nasPref.speed;
    a.play().catch(function () { /* the first tap on the iPad may be needed; PLAY works from the bar */ });
    if (pl.artBig) { URL.revokeObjectURL(pl.artBig); pl.artBig = null; }
    pl.artSmall = null;
    mediaMeta(); readTags(path);
    paintPlayer();
  }
  function skip(sec) { var a = pl.el; if (!a || !pl.path) return; a.currentTime = Math.max(0, Math.min((a.duration || 1e9) - 1, a.currentTime + sec)); paintPlayer(true); }
  function togglePlay() { var a = pl.el; if (!a || !pl.path) return; if (a.paused) { pl.closed = false; a.play().catch(function () {}); } else a.pause(); }
  function mediaState() {
    if (!("mediaSession" in navigator) || !pl.el) return;
    navigator.mediaSession.playbackState = pl.el.paused ? "paused" : "playing";
    try { if (isFinite(pl.el.duration)) navigator.mediaSession.setPositionState({ duration: pl.el.duration, position: Math.min(pl.el.currentTime, pl.el.duration), playbackRate: pl.el.playbackRate }); } catch (e) { /* older iPadOS */ }
  }
  function nextUp() {
    var i = pl.list.indexOf(pl.path);
    return i < 0 ? [] : pl.list.slice(i + 1).map(function (p) { return { path: p }; });
  }
  function sleepCheck() {
    if (typeof nas.sleep === "number" && Date.now() >= nas.sleepAt && pl.el && !pl.el.paused) { pl.el.pause(); nas.sleep = null; sb.slept = true; toast("Sleep timer: paused"); paintPlayer(); }
  }
  function setSleep(v) {
    nas.sleep = v === "off" ? null : v === "end" ? "end" : +v;
    nas.sleepAt = typeof nas.sleep === "number" ? Date.now() + nas.sleep * 60000 : 0;
    if (nas.sleep) toast(nas.sleep === "end" ? "Stops at the end of this episode" : "Pauses in " + nas.sleep + " minutes");
  }
  setInterval(sleepCheck, 15000);

  /* The bar under Storage, the full player, and the small pill on every other screen. */
  function scrubHtml(id) {
    var a = pl.el, d = a && isFinite(a.duration) ? a.duration : (playOf(pl.path) || {}).d || 0, t = a ? a.currentTime : 0;
    return '<div class="nas-scrub"><span class="tnum" data-np="t">' + mmss(t) + '</span><input type="range" id="' + id + '" min="0" max="' + Math.max(1, Math.round(d)) + '" step="1" value="' + Math.round(t) + '" style="--fill: ' + (d ? (t / d * 100).toFixed(2) : 0) + '%" aria-label="Position"' + (d ? "" : " disabled") + '><span class="tnum" data-np="left">−' + mmss(Math.max(0, d - t)) + "</span></div>";
  }
  function controlsHtml(big) {
    var paused = !pl.el || pl.el.paused;
    return '<div class="nas-ctl' + (big ? " big" : "") + '"><button type="button" class="chip" data-nas="back" aria-label="Back 15 seconds">−15</button>' +
      '<button type="button" class="nas-play" data-nas="toggle" aria-label="' + (paused ? "Play" : "Pause") + '">' + (paused ? "▶" : "❚❚") + "</button>" +
      '<button type="button" class="chip" data-nas="fwd" aria-label="Forward 30 seconds">+30</button>' + (big ? "" : '<button type="button" class="chip" data-nas="open">OPEN</button>') + "</div>";
  }
  function barHtml() {
    if (!pl.path) return "";
    var tg = nasTags[pl.path] || {};
    return '<div class="nas-bar" id="nasBar">' + artHtml(parentOf(pl.path), "nas-art", true) + '<span class="nas-bt"><b>' + esc(dispName(pl.path)) + "</b><small>" + esc((tg.a || baseName(parentOf(pl.path))).toUpperCase()) + (nasPref.speed !== 1 ? " · " + nasPref.speed + "×" : "") + "</small>" + scrubHtml("nasSeek") + "</span>" + controlsHtml(false) + "</div>";
  }
  function paintPlayer(timeOnly) {
    var a = pl.el;
    if (timeOnly && a) {
      var d = isFinite(a.duration) ? a.duration : 0;
      document.querySelectorAll(".nas-scrub").forEach(function (s) {
        var r = s.querySelector("input");
        if (r && pl.scrub && pl.scrub.id === r.id) return;   /* a finger is on it: leave the thumb and the clock where the finger put them */
        if (r && document.activeElement !== r) { if (d) { r.max = Math.round(d); r.disabled = false; } r.value = Math.round(a.currentTime); r.style.setProperty("--fill", (d ? a.currentTime / d * 100 : 0).toFixed(2) + "%"); }
        var t = s.querySelector('[data-np="t"]'), l = s.querySelector('[data-np="left"]');
        if (t) t.textContent = mmss(a.currentTime); if (l) l.textContent = "−" + mmss(Math.max(0, d - a.currentTime));
      });
      miniPaint(true); return;
    }
    if (pl.scrub) { pl.scrubDraw = true; miniPaint(); return; }   /* redraw once the finger lifts, not under it */
    if (state.screen === "storage") render(true);
    miniPaint();
  }
  /* The pill on other screens: full (title, time, minimize, close) or minimized to a play button
     at the edge (remembered). Close pauses and puts it away until something plays again; the place
     is kept. Pages get room at the bottom so the pill never covers their last buttons. */
  function miniPaint(timeOnly) {
    var m = $("nasMini");
    if (!m) { m = document.createElement("div"); m.id = "nasMini"; m.className = "nas-mini"; m.hidden = true; document.body.appendChild(m);
      m.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        var k = b.dataset.nas;
        if (k === "toggle") togglePlay();
        else if (k === "min" || k === "max") { nasPref.mini = k === "min"; lsSet(LS_NASPREF, nasPref); miniPaint(); }
        else if (k === "close") { if (pl.el) pl.el.pause(); markPlay(false); pl.closed = true; miniPaint(); toast("Stopped. Pick it up again under HOLODECK → AUDIO → CONTINUE LISTENING"); }
        else { nas.view = "now"; go("storage"); }
      }); }
    var show = !!pl.path && !pl.closed && state.screen !== "storage" && !(pl.el && pl.el.paused && !pl.el.currentTime);
    m.hidden = !show;
    document.body.classList.toggle("nas-pad", show && !nasPref.mini);
    document.body.classList.toggle("nas-pad-min", show && !!nasPref.mini);
    if (!show) return;
    var paused = pl.el.paused, sig = pl.path + "|" + paused + "|" + !!nasPref.mini;
    if (timeOnly && m.dataset.sig === sig) { var tt = m.querySelector("[data-mt]"); if (tt) tt.textContent = (paused ? "PAUSED" : "PLAYING") + " · " + mmss(pl.el.currentTime); return; }
    m.dataset.sig = sig;
    m.classList.toggle("min", !!nasPref.mini);
    var play = '<button type="button" class="nas-play sm" data-nas="toggle" aria-label="' + (paused ? "Play" : "Pause") + '">' + (paused ? "▶" : "❚❚") + "</button>";
    m.innerHTML = nasPref.mini ? '<button type="button" class="nas-x" data-nas="max" aria-label="Show the player">‹</button>' + play
      : play + '<button type="button" class="nas-mt" data-nas="open"><b>' + esc(dispName(pl.path)) + '</b><small data-mt="1">' + (paused ? "PAUSED" : "PLAYING") + " · " + mmss(pl.el.currentTime) + "</small></button>" +
        '<button type="button" class="nas-x" data-nas="min" aria-label="Minimize">›</button><button type="button" class="nas-x" data-nas="close" aria-label="Close">✕</button>';
  }

  /* ---------- the screens ---------- */
  function rowState(it) {
    var r = playOf(it.path), cur = it.path === pl.path;
    if (cur && pl.el && !pl.el.paused) return '<span class="pill nas-on">PLAYING</span>';
    if (r && r.done) return '<span class="pill">PLAYED</span>';
    if (r && r.p > 5) return '<span class="pill tnum">' + (r.d ? mmss(r.d - r.p) + " LEFT" : "STARTED") + "</span>";
    return "";
  }
  function fileRow(it, listPaths) {
    var audio = AUDIO_EXT.test(it.name), r = playOf(it.path);
    if (it.dir) return '<button type="button" class="nas-row" data-nasdir="' + esc(it.path) + '">' + (nasArt[it.path] ? artHtml(it.path, "nas-ic aud") : '<span class="nas-ic dir"></span>') + '<span class="nas-nm">' + esc(it.name) + '</span><span class="nas-m"></span><span class="nas-m">OPEN ▸</span></button>';
    return '<button type="button" class="nas-row' + (it.path === pl.path ? " cur" : "") + (r && r.done ? " played" : "") + (audio ? "" : " other") + '"' + (audio ? ' data-nasplay="' + esc(it.path) + '"' : " disabled") + ">" + (audio ? artHtml(parentOf(it.path), "nas-ic aud") : '<span class="nas-ic doc"></span>') +
      '<span class="nas-nm">' + (audio && !r ? '<i class="nas-new" aria-label="New"></i>' : "") + (audio && nas.showTrack && state.screen === "storage" && nas.view === "browse" && nasTags[it.path] && nasTags[it.path].n ? '<span class="nas-tn">' + (nasTags[it.path].d > 1 ? nasTags[it.path].d + "·" : "") + p2(nasTags[it.path].n) + "</span>" : "") + esc(audio ? dispName(it.path) : it.name) + (it.mod ? "<small>" + esc(dLabel(new Date(it.mod))) + " " + new Date(it.mod).getFullYear() + "</small>" : "") + "</span>" +
      '<span class="nas-m tnum">' + (audio ? (lenOf(it) ? mmss(lenOf(it)) : "") : sizeLabel(it.size)) + '</span><span class="nas-m">' + (audio ? rowState(it) : "CAN'T PLAY") + "</span></button>";
  }
  function crumbs(dir) {
    var parts = dir.split("/").filter(Boolean), acc = "", out = '<button type="button" class="chip sm" data-nasdir="/">NAS</button>';
    parts.forEach(function (p, i) { acc += "/" + p; out += '<span class="nas-sep">▸</span><button type="button" class="chip sm" data-nasdir="' + esc(acc) + '"' + (i === parts.length - 1 ? ' aria-pressed="true"' : "") + ">" + esc(p.toUpperCase()) + "</button>"; });
    return '<div class="nas-crumbs">' + out + "</div>";
  }
  function renderStorage() {
    var c = nasConf();
    if (!c) { $("content").innerHTML = '<div class="nas">' + holo.archBtn() + phead("AUDIO", "SETUP") + '<div class="stubbox"><span class="pill">SETUP</span><span>AUDIO reads the NAS through its relay. Add the relay address and token under <b>NAS RELAY</b> in Systems. Steps are in the README under <b>NAS relay</b>.</span></div>' +
      '<div class="btnrow"><button type="button" class="btn" data-nas="systems">OPEN SYSTEMS</button></div></div>'; return; }
    var v = nas.view, html = '<div class="nas">' + holo.archBtn();
    if (v === "now" && pl.path) html += nowHtml();
    else if (v === "browse") html += browseHtml();
    else html += homeHtml();
    $("content").innerHTML = html + (v === "now" && pl.path ? "" : barHtml()) + "</div>";
    needle(false);
  }
  /* The radio band over the top folders: the needle sits on the last one tuned, and swings to a folder when it's tapped.
     Only a tap moves it; the band doesn't drag or scroll (Timothy, 2026-10-27). */
  function needle(swing, to) {
    var nd = $("nasNeedle"); if (!nd) return;
    var band = nd.parentNode, t = to || band.querySelector('.nas-share[data-nasdir="' + (nas.tuned || "").replace(/["\\]/g, "") + '"]') || band.querySelector(".nas-share");
    if (!t) { nd.hidden = true; return; }
    var r = t.getBoundingClientRect(), br = band.getBoundingClientRect();
    if (!swing) nd.classList.add("still");
    nd.style.left = Math.round(r.left + r.width / 2 - br.left - 1) + "px";
    if (!swing) { void nd.offsetWidth; nd.classList.remove("still"); }
  }
  function homeHtml() {
    var root = nas.lists["/"];
    if ((!root || Date.now() - root.at > 60000) && !nas.inflight["/"] && !(nas.err && Date.now() - nas.err.at < 15000)) nasLoad("/", false);   /* the shares, read again after a minute (2.48.3: once a session, so a share added to the relay never showed) */
    var host = nasBase().replace(/^https?:\/\//, "");
    var html = '<section class="nas-status"><div class="nas-card ' + (nas.ok === false ? "bad" : "ok") + '"><span class="pill ' + (nas.ok === false ? "bad" : nas.ok ? "ok" : "") + '">' + (nas.ok === false ? (nas.err && nas.err.code === "unauthorized" ? "TOKEN REFUSED" : "UNREACHABLE") : nas.ok ? "ONLINE" : "CHECKING") + "</span>" +
      '<span class="nas-host"><b>NAS</b><small>' + esc(host) + " · read-only</small></span></div>" + (nas.err && nas.ok === false ? '<div class="err">' + esc(nas.err.msg) + '</div><div class="btnrow"><button type="button" class="btn sm" data-nas="retry">TRY AGAIN</button></div>' : "") + "</section>";
    html += "<section>" + phead("FOLDERS", root ? root.items.filter(function (x) { return x.dir && !isHidden(x.path) && !/^video$/i.test(x.name); }).length + " SHARED WITH TIMOTHYOS" : "") + (root ? '<div class="nas-band"><div class="nas-scale" aria-hidden="true"><span>530</span><span>700</span><span>900</span><span>1100</span><span>1300</span><span>1600 KHZ</span></div><span class="nas-needle" id="nasNeedle" aria-hidden="true"></span><div class="nas-shares">' + root.items.filter(function (x) { return x.dir && !isHidden(x.path) && !/^video$/i.test(x.name); }).map(function (x) {
      return '<button type="button" class="nas-share' + (nasArt[x.path] ? " has-art" : "") + '" data-nasdir="' + esc(x.path) + '">' + (nasArt[x.path] ? artHtml(x.path, "nas-art") : "") + '<span><b>' + esc(x.name.toUpperCase()) + "</b><small>Open ▸</small></span></button>";
    }).join("") + "</div></div>" : '<div class="empty">' + (nas.ok === false ? "Folders appear once the NAS answers." : "Asking the NAS…") + "</div>") + "</section>";
    var cont = Object.keys(plays).filter(function (k) { var r = plays[k]; return !r.done && r.p > 30; }).sort(function (a, b) { return plays[b].at - plays[a].at; }).slice(0, 6);
    html += "<section>" + phead("CONTINUE LISTENING", "SAVED ON THIS IPAD", "personal") + (cont.length ? '<div class="nas-cont">' + cont.map(function (k) {
      var r = plays[k];
      return '<button type="button" class="nas-ep" data-nasresume="' + esc(k) + '">' + artHtml(parentOf(k), "nas-art") + '<span><b>' + esc(dispName(k)) + "</b><small>" + esc(baseName(parentOf(k))) + (r.d ? " · " + mmss(r.d - r.p) + " left" : "") + '</small><span class="nas-prog"><i style="width:' + (r.d ? Math.min(100, r.p / r.d * 100) : 0) + '%"></i></span></span></button>';
    }).join("") + "</div>" : '<div class="empty">Anything you start and stop part way shows here, ready to pick up.</div>') + "</section>";
    return html;
  }
  function browseHtml() {
    var dir = nas.dir, l = nas.lists[dir];
    if ((!l || Date.now() - l.at > 60000) && !nas.inflight[dir]) nasLoad(dir, false);
    var html = crumbs(dir);
    if (!l) return html + '<div class="empty">' + (nas.err && nas.ok === false ? esc(nas.err.msg) : nas.err && nas.err.code === "http_404" ? "That folder isn't there any more." : "Opening the folder…") + "</div>";
    var dirs = l.items.filter(function (x) { return x.dir && !isHidden(x.path); }), files = l.items.filter(function (x) { return !x.dir; });
    var audio = files.filter(function (x) { return AUDIO_EXT.test(x.name); });
    var q = nas.q.trim().toLowerCase();
    var match = function (x) { return !q || x.name.toLowerCase().indexOf(q) > -1 || (!x.dir && dispName(x.path).toLowerCase().indexOf(q) > -1); };
    var byName = function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); };
    var mp3s = audio.some(function (x) { return /\.mp3$/i.test(x.name); }), srt = sortOf(dir);
    if (srt === "track" && !mp3s) srt = "name";
    if (srt === "track") scanFolder(dir);
    lenScan(dir);
    var sorter = sorterFor(srt);
    nas.showTrack = srt === "track";
    var shown = files.filter(match).filter(function (x) {
      if (nas.filter === "all") return true;
      if (!AUDIO_EXT.test(x.name)) return false;
      var r = playOf(x.path);
      return nas.filter === "unplayed" ? !(r && r.done) : !!(r && !r.done && r.p > 5);
    }).sort(sorter);
    var order = audio.slice().sort(sorter).map(function (x) { return x.path; });
    html += '<div class="nas-tools"><input type="search" id="nasQ" placeholder="Search this folder" autocomplete="off" enterkeyhint="search" aria-label="Search this folder" value="' + esc(nas.q) + '">' +
      (audio.length ? '<div class="chips">' + [["all", "ALL"], ["unplayed", "UNPLAYED"], ["partial", "IN PROGRESS"]].map(function (f) { return '<button type="button" class="chip sm" data-nasfilter="' + f[0] + '" aria-pressed="' + (nas.filter === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div>" : "") +
      '<div class="chips">' + (mp3s ? [["track", "TRACK #"]] : []).concat([["name", "A TO Z"], ["newest", "NEWEST"]]).map(function (s) { return '<button type="button" class="chip sm" data-nassort="' + s[0] + '" aria-pressed="' + (srt === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="chip sm nas-hide" data-nas="hide">HIDE FOLDER</button></div>';
    if (nas.scan && nas.scan.dir === dir) html += '<div class="nas-scan">READING TRACK NUMBERS · ' + nas.scan.done + " OF " + nas.scan.total + "</div>";
    else if (srt === "track") {
      var mp3l = audio.filter(function (x) { return /\.mp3$/i.test(x.name); }), withN = mp3l.filter(function (x) { return nasTags[x.path] && nasTags[x.path].n; }).length;
      html += '<div class="nas-trk">' + (withN === mp3l.length ? "IN TRACK ORDER · " + withN + " MP3S NUMBERED" : withN + " OF " + mp3l.length + " MP3S HAVE A TRACK NUMBER" + (withN ? " · THE REST GO LAST" : "")) +
        ' <button type="button" class="chip sm" data-nas="rescan">READ TAGS AGAIN</button></div>';
    }
    var dshown = dirs.filter(match).sort(byName);
    if (!dshown.length && !shown.length) html += '<div class="empty">' + (q || nas.filter !== "all" ? "Nothing here matches." : "This folder is empty.") + "</div>";
    else html += '<div class="nas-list" data-order="' + esc(JSON.stringify(order)) + '">' + dshown.map(function (x) { return fileRow(x); }).join("") + shown.map(function (x) { return fileRow(x); }).join("") + "</div>";
    if (nas.err && nas.ok === false) html += stale(l.at);
    nasOrder = order;
    return html;
  }
  var nasOrder = [];
  function nowHtml() {
    var a = pl.el, paused = !a || a.paused, nx = nextUp().slice(0, 4);
    var tg = nasTags[pl.path] || {};
    var html = '<div class="nas-now">' + artHtml(parentOf(pl.path), "nas-bigart", true) + "<div>" +
      '<button type="button" class="chip sm" data-nasdir="' + esc(parentOf(pl.path)) + '">◂ ' + esc(baseName(parentOf(pl.path)).toUpperCase()) + "</button>" +
      "<h3>" + esc(dispName(pl.path)) + "</h3>" + (tg.a || tg.al ? '<div class="nas-by">' + esc([tg.a, tg.al].filter(Boolean).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(" · ")) + "</div>" : "") + scrubHtml("nasSeekBig") + controlsHtml(true) +
      '<dl class="kv nas-opts"><dt>SPEED</dt><dd><div class="chips">' + [1, 1.25, 1.5, 2].map(function (s) { return '<button type="button" class="chip sm" data-nasspeed="' + s + '" aria-pressed="' + (nasPref.speed === s) + '">' + s + "×</button>"; }).join("") + "</div></dd>" +
      '<dt>SLEEP</dt><dd><div class="chips">' + [["off", "OFF"], ["15", "15 MIN"], ["30", "30 MIN"], ["60", "1 HOUR"], ["end", "END OF EPISODE"]].map(function (s) {
        var on = s[0] === "off" ? !nas.sleep : String(nas.sleep) === s[0];
        return '<button type="button" class="chip sm" data-nassleep="' + s[0] + '" aria-pressed="' + on + '">' + s[1] + (on && typeof nas.sleep === "number" ? " · " + Math.max(1, Math.round((nas.sleepAt - Date.now()) / 60000)) + " LEFT" : "") + "</button>";
      }).join("") + "</div></dd>" +
      '<dt>AFTER THIS</dt><dd><div class="chips"><button type="button" class="chip sm" data-nasauto="1" aria-pressed="' + nasPref.auto + '">PLAY THE NEXT ONE</button><button type="button" class="chip sm" data-nasauto="0" aria-pressed="' + !nasPref.auto + '">STOP</button></div></dd></dl>' +
      '<div class="btnrow"><button type="button" class="btn sm ghost" data-nas="markplayed">MARK PLAYED</button><button type="button" class="btn sm ghost" data-nas="restart">START OVER</button></div></div></div>';
    if (nx.length) html += "<section>" + phead("UP NEXT", "IN THIS FOLDER", "personal") + '<div class="nas-list">' + nx.map(function (n) {
      var it = { name: baseName(n.path), path: n.path, dir: false, size: 0, mod: 0 };
      var l = nas.lists[parentOf(n.path)], f = l && l.items.filter(function (x) { return x.path === n.path; })[0];
      return fileRow(f || it);
    }).join("") + "</div></section>";
    return html;
  }
  function storageClick(b) {
    var d = b.dataset;
    if (d.hdgo) { go("holodeck"); return true; }   /* ◇ ARCH: back to HOLODECK's program select */
    if (d.nasdir !== undefined && b.classList && b.classList.contains("nas-share")) {   /* a folder on the band: the needle swings to it first */
      nas.tuned = d.nasdir;
      if (!calm() && !b.dataset.tuned && $("nasNeedle")) { b.dataset.tuned = "1"; needle(true, b); setTimeout(function () { if (b.isConnected && state.screen === "storage") storageClick(b); }, 380); return true; }
    }
    if (d.nasdir !== undefined) { nas.dir = d.nasdir || "/"; nas.q = ""; nas.view = nas.dir === "/" ? "home" : "browse"; lsSet(LS_NASDIR, nas.dir); render(false); $("content").scrollTop = 0; renderHeader(); return true; }
    if (d.nasplay) { playPath(d.nasplay, nasOrder.indexOf(d.nasplay) > -1 ? nasOrder.slice() : [d.nasplay]); return true; }
    if (d.nasresume) {
      var dir = parentOf(d.nasresume);
      playPath(d.nasresume, [d.nasresume]);
      nasList(dir, false).then(function (l) {
        var order = l.items.filter(function (x) { return !x.dir && AUDIO_EXT.test(x.name); }).sort(sorterFor(sortOf(dir))).map(function (x) { return x.path; });
        if (pl.path === d.nasresume && order.indexOf(d.nasresume) > -1) pl.list = order;
        if (state.screen === "storage" && nas.view === "now") render(true);   /* the rest of the folder shows under UP NEXT once it's in */
      }).catch(function () {});
      nas.view = "now"; render(false); renderHeader(); return true;
    }
    if (d.nasfilter) { nas.filter = d.nasfilter; render(true); return true; }
    if (d.nassort) { nasSorts[nas.dir] = d.nassort; lsSet(LS_NASSORT, nasSorts); render(true); return true; }
    if (d.nas === "rescan") { var rl = nas.lists[nas.dir]; (rl ? rl.items : []).forEach(function (x) { if (nasTags[x.path]) nasTags[x.path].s = 0; }); lsSet(LS_NASTAGS, nasTags); nas.scan = null; render(true); return true; }
    if (d.nasspeed) { nasPref.speed = +d.nasspeed; lsSet(LS_NASPREF, nasPref); if (pl.el) pl.el.playbackRate = nasPref.speed; render(true); mediaState(); return true; }
    if (d.nassleep) { setSleep(d.nassleep); render(true); return true; }
    if (d.nasauto) { nasPref.auto = d.nasauto === "1"; lsSet(LS_NASPREF, nasPref); render(true); return true; }
    if (!d.nas) return false;
    var k = d.nas;
    if (k === "toggle") togglePlay();
    else if (k === "back") skip(-15);
    else if (k === "fwd") skip(30);
    else if (k === "open") { nas.view = "now"; render(false); renderHeader(); }
    else if (k === "systems") go("systems");
    else if (k === "hide" && nas.dir !== "/") {
      var hid = nasHidden(); if (hid.indexOf(nas.dir) < 0) hid.push(nas.dir); lsSet(LS_NASHIDE, hid);
      toast("Hidden: " + baseName(nas.dir) + ". Unhide in Systems → NAS RELAY");
      nas.dir = parentOf(nas.dir); nas.q = ""; nas.view = nas.dir === "/" ? "home" : "browse"; lsSet(LS_NASDIR, nas.dir); render(false); renderHeader();
    }
    else if (k === "retry") { nas.err = null; nas.ok = null; nasLoad(nas.view === "browse" ? nas.dir : "/", true); render(true); }
    else if (k === "markplayed" && pl.path) { pl.ready = false; if (pl.el) pl.el.pause(); plays[pl.path] = { p: 0, d: (playOf(pl.path) || {}).d || (pl.el && pl.el.duration) || 0, done: true, at: Date.now(), by: prof.me() }; savePlays(); toast("Marked played"); var nx = nextUp()[0]; if (nasPref.auto && nx) playPath(nx.path, pl.list); else render(true); }
    else if (k === "restart" && pl.el) { pl.el.currentTime = 0; pl.el.play().catch(function () {}); }
    else return false;
    return true;
  }
  function storageHead() {
    var v = nas.view;
    return { e: "HOLODECK · AUDIO · " + (nas.ok === false ? (nas.err && nas.err.code === "unauthorized" ? "TOKEN REFUSED" : "NAS UNREACHABLE") : v === "browse" ? (nas.dir.split("/").filter(Boolean).slice(0, -1).join(" ▸ ").toUpperCase() || "NAS") : v === "now" ? "NOW PLAYING" : "NAS"),
      t: v === "browse" ? baseName(nas.dir).toUpperCase() : "HOLODECK" };
  }
  /* Seeking with the slider: applied when you let go, so the time doesn't jump around under your finger. Holding it
     (2.51.3): iPadOS never focuses a touched slider, so the playing time used to pull the thumb and the clock back under
     the finger four times a second, and letting go seeked to wherever they'd been pulled (often where it started). Now a
     held slider is marked (pl.scrub) from the first touch to the lift: nothing repaints it or redraws the player, the
     clock follows the finger, and the lift seeks to where the finger left it. */
  function scrubbing(t) { return t && (t.id === "nasSeek" || t.id === "nasSeekBig") ? t : null; }
  function scrubTo(v) { if (pl.el && isFinite(v) && Math.abs(pl.el.currentTime - v) > 0.5) { pl.el.currentTime = v; markPlay(false); } }
  function scrubEnd() {
    var s = pl.scrub; if (!s) return;
    pl.scrub = null;
    var r = $(s.id); scrubTo(r ? +r.value : s.v);
    if (pl.scrubDraw) { pl.scrubDraw = false; paintPlayer(); }
  }
  document.addEventListener("pointerdown", function (e) { var r = scrubbing(e.target); if (r && !r.disabled) pl.scrub = { id: r.id, v: +r.value }; }, true);
  ["pointerup", "pointercancel", "touchend", "touchcancel"].forEach(function (k) { document.addEventListener(k, function () { if (pl.scrub) setTimeout(scrubEnd, 0); }, true); });   /* after the slider's own last input */
  document.addEventListener("change", function (e) { if (scrubbing(e.target)) scrubTo(+e.target.value); });
  document.addEventListener("input", function (e) {
    if (scrubbing(e.target) && pl.el) {
      var s = e.target.closest(".nas-scrub"), d = +e.target.max, v = +e.target.value;
      if (pl.scrub && pl.scrub.id === e.target.id) pl.scrub.v = v;
      s.querySelector('[data-np="t"]').textContent = mmss(v); s.querySelector('[data-np="left"]').textContent = "−" + mmss(d - v);
      e.target.style.setProperty("--fill", (d ? v / d * 100 : 0).toFixed(2) + "%");
    }
    if (e.target.id === "nasQ") { nas.q = e.target.value; render(true); }
  });
  window.addEventListener("pagehide", function () { markPlay(false); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) markPlay(false); });

  /* --- Systems: the relay --- */
  function storageSection() {
    var c = nasConf(), n = Object.keys(plays).length;
    return '<section id="sec-storage">' + phead("NAS RELAY", "HOLODECK · " + (c ? (nas.ok === false ? (nas.err && nas.err.code === "unauthorized" ? "TOKEN REFUSED" : "UNREACHABLE") : nas.ok ? "CONNECTED" : "SET") : "NOT SET")) + '<dl class="kv">' +
      "<dt>RELAY ADDRESS</dt><dd>" + (c ? esc(c.url) : '<span class="muted">Not set</span>') + "</dd>" +
      "<dt>TOKEN</dt><dd>" + (c ? "•••• " + esc(c.token.slice(-4)) : '<span class="muted">Not set</span>') + "</dd>" +
      '<dt>CHANGE</dt><dd><div class="ov-place"><input type="url" id="nasUrl" placeholder="https://your-nas.your-tailnet.ts.net" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + (c ? esc(c.url) : "") + '">' +
      '<input type="password" id="nasTok" placeholder="' + (c ? "Token (leave blank to keep)" : "Relay token") + '" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<div class="btnrow" style="margin-top:8px"><button type="button" class="btn" data-act="nassave">SAVE AND TEST</button>' + (c ? '<button type="button" class="btn ghost" data-act="nasforget">' + (Date.now() - nas.armClear < 4000 && nas.armWhat === "forget" ? "TAP AGAIN TO FORGET" : "FORGET") + "</button>" : "") + "</div>" +
      '<div class="err" id="nasErr" role="alert">' + (nas.err && nas.ok === false ? esc(nas.err.msg) : "") + "</div></dd>" +
      "<dt>HIDDEN FOLDERS</dt><dd>" + (nasHidden().length ? '<div class="nas-hidlist">' + nasHidden().map(function (h) {
        return '<span class="nas-hid"><span>' + esc(h.replace(/^\//, "").split("/").join(" ▸ ")) + '</span><button type="button" class="btn sm ghost" data-nasunhide="' + esc(h) + '">UNHIDE</button></span>';
      }).join("") + "</div>" : '<span class="muted">None. HIDE FOLDER inside a folder keeps it out of HOLODECK → AUDIO on this iPad.</span>') + "</dd>" +
      "<dt>LISTENING</dt><dd>" + n + (n === 1 ? " file" : " files") + ' with a saved place <button type="button" class="btn sm ghost" data-act="nasplays">' + (Date.now() - nas.armClear < 4000 && nas.armWhat === "plays" ? "TAP AGAIN TO CLEAR" : "CLEAR") + "</button></dd>" +
      '</dl><small class="muted">The relay is read-only and reachable only through Tailscale. The address and token stay on this iPad. Where you stopped in each file is kept here too, never sent anywhere.</small></section>';
  }
  function nasSave() {
    var url = ($("nasUrl").value || "").trim().replace(/\/+$/, ""), tok = ($("nasTok").value || "").trim(), cur = nasConf(), errEl = $("nasErr");
    if (!/^https:\/\/[^\s/]+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) { errEl.textContent = "Use the https address of the relay, like https://name.tailnet.ts.net"; return; }
    if (!tok && !(cur && cur.url)) { errEl.textContent = "Enter the relay token."; return; }
    lsSet(LS_NAS, { url: url, token: tok || cur.token });
    nas.lists = {}; nas.err = null; nas.ok = null;
    errEl.textContent = "Testing…";
    nasList("/", true).then(function (l) { toast("Storage connected · " + l.items.filter(function (x) { return x.dir; }).length + " folders"); })
      .catch(function () { /* the section shows why */ }).then(function () { render(true); });
  }
  function storageSysClick(b) {
    if (b.dataset.nasunhide) { lsSet(LS_NASHIDE, nasHidden().filter(function (h) { return h !== b.dataset.nasunhide; })); toast("Back on Storage: " + baseName(b.dataset.nasunhide)); render(true); return true; }
    var a = b.dataset.act;
    if (a === "nassave") { nasSave(); return true; }
    if (a === "nasforget" || a === "nasplays") {
      var what = a === "nasforget" ? "forget" : "plays";
      if (Date.now() - nas.armClear < 4000 && nas.armWhat === what) {
        nas.armClear = 0;
        if (what === "forget") { if (pl.el) { pl.el.pause(); pl.el.removeAttribute("src"); } preDrop(); if (pl.blob) { URL.revokeObjectURL(pl.blob); pl.blob = null; } pl.path = null; lsDel(LS_NAS); nas.lists = {}; nas.err = null; nas.ok = null; toast("Storage forgotten on this iPad"); miniPaint(); }
        else { plays = {}; savePlays(); toast("Saved places cleared"); }
      } else { nas.armClear = Date.now(); nas.armWhat = what; setTimeout(function () { if (state.screen === "systems") render(true); }, 4100); }
      render(true); return true;
    }
    return false;
  }

