  /* ---------- HOLODECK (2.45): a TV that's always on air, from one NAS folder ---------- */
  /* Timothy's idea: tune in and it's mid-broadcast, like MTV or VH1 in the day. Each channel is one folder on the NAS
     (through the STORAGE relay, under its /Video share), with one level of subfolders for a series in seasons. The
     schedule is computed, never stored: a channel's videos in order (seasons by number, episodes by number, then the
     specials and extras) laid end to end from the moment the channel was added, round again at the end, so the clock
     alone says what is on and how far in. Every channel keeps running whichever one is on the screen. Nothing about
     viewing is remembered. Files the iPad can't play are skipped. Lengths are read once with a hidden player (metadata
     only) and kept on the iPad. One <video> for the app, kept outside the page so PICTURE IN PICTURE can carry on across
     stations. Its own scope (`holo`; `hd` is taken inside renderHeader) and hd- class names.
     2.47: HOLODECK opens on the arch, as on the ship: PROGRAM 01 VISUAL (this TV) or PROGRAM 02 AUDIO (the NAS folders,
     STORAGE's screen as it was, still state.screen "storage"). Each program has only an ◇ ARCH button back (Timothy chose
     the extra tap to reorient). One at a time: tuning in pauses audio, and audio starting turns the TV off.
     2.48: a channel's style is IN ORDER (above) or NETWORK: a folder of show folders programmed like a TV network. Each
     broadcast day (from 6:00) has its own lineup, worked out from the date: a show at random (never the same twice in a
     row; no blocks of two since 2.53.5), each show working through that day's shuffle of its episodes. Unmeasured lengths count as the show's typical length, so it's on air at once; the times settle as the
     real lengths come in (once, kept). UP NEXT shows in an episode's last seconds. */
  var LS_HOLO = "tos.holo.v1", LS_HOLOLEN = "tos.hololen.v1", LS_HOLOADLEN = "tos.holoadlen.v1", LS_HOLOLOUD = "tos.hololoud.v1";
  var holo = (function () {
    var cfg = Object.assign({ chans: [], ch: 0, look: "crt", muted: false, ads: "", level: true }, lsGet(LS_HOLO) || {});   /* ads: the one Commercials folder (2.52); each channel's breaks: c.breaks; level: LEVEL (2.61) */
    var lens = lsGet(LS_HOLOLEN) || {};
    /* Commercials' lengths are kept apart under a short key (2.52.1): a split folder holds thousands, which would crowd
       the episodes out of `lens` (5,000 at most) and fill the iPad's storage with long paths */
    var adLens = lsGet(LS_HOLOADLEN) || {};
    if (cfg.ads) { var moved = 0; Object.keys(lens).forEach(function (k) { if (k.indexOf(cfg.ads + "/") === 0) { adLens[adKey(k)] = lens[k]; delete lens[k]; moved++; } }); if (moved) { lsSet(LS_HOLOLEN, lens); lsSet(LS_HOLOADLEN, adLens); } }   /* measured under 2.52.0 */
    var F = {};   /* each channel's folder as read, by folder: { play, skip, series, seasons, specials, at, busy, err } */
    var X = { sleep: null, sleepAt: 0, sleepT: 0, lv: 0, pt: 0, pw: {}, prog: null, fade: 0, fails: 0, on: false, pick: false, pickFor: "", open: {}, sleepOpen: false, pickDir: "/Video", pickErr: "", probing: false, tuneAt: 0, cur: null, v: null, keep: null, timer: 0, wait: 0, rm: 0, ren: 0, note: "", typed: "", kmsg: "", kt: 0, last: 0, gw: 0, gh: "", gk: "", gAt: 0, asT: 0, asHold: 0, asWrap: false };
    var KINDS = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" }, VIDEO = /\.(mp4|m4v|mov|webm|avi|mkv|wmv|flv|mpe?g|vob|divx|3gp|ts|m2ts)$/i;
    var PARTIAL = /\.(f\d+|temp)\.[a-z0-9]+$/i;   /* yt-dlp's pieces of an unfinished download ("….f136.mp4" is video without sound, "….temp.mp4" a merge in progress): never episodes (2.51.4) */
    if (!chById(cfg.ch) && cfg.chans.length) { cfg.ch = cfg.chans[0].id; save(); }   /* the channel shown was removed: the first one */
    function save() { lsSet(LS_HOLO, cfg); }
    function chById(id) { return cfg.chans.filter(function (c) { return c.id === id; })[0] || null; }
    function cur() { return chById(cfg.ch); }
    function numAt(c) { return cfg.chans.indexOf(c) + 1; }
    function folderName(p) { return baseName(p).replace(/_+/g, " ").trim(); }
    function ext(n) { var m = /\.([a-z0-9]+)$/i.exec(n); return m ? m[1].toLowerCase() : ""; }
    var CANPLAY = {};   /* asked once per type (2.53.1): a video element per file name made thousands at once for a big folder, and froze a new iPad */
    function canPlay(n) { var t = KINDS[ext(n)]; if (!t) return false; if (CANPLAY[t] == null) { var v = document.createElement("video"); CANPLAY[t] = !!v.canPlayType && v.canPlayType(t) !== ""; } return CANPLAY[t]; }
    function url(p) { return nasBase() + encPath(p) + "?k=" + encodeURIComponent(nasConf().token); }
    /* Never measured, or the file has changed, or it couldn't be read for a reason that may pass (2.51.1): a timeout or a
       network error is tried again after 10 minutes; "format" (the iPad can't decode it) stands until the file changes.
       Before 2.51.1 an unreadable file was marked for good, with no reason kept: those are measured again too. */
    var HD_RETRY_MS = 10 * 60000;
    function adKey(p) { var r = ""; for (var i = p.length - 1; i >= 0; i--) r += p.charAt(i); return hashStr(p).toString(36) + hashStr(r).toString(36); }   /* two hashes: a clash would have two commercials measured in turn for ever */
    function rec(it) { return it.ad ? adLens[it._k || (it._k = adKey(it.f.path))] : lens[it.f.path]; }
    function keepLen(it, x) {   /* store a length and save that store */
      if (!it.ad) { lens[it.f.path] = x; var ks = Object.keys(lens); if (ks.length > 5000) ks.slice(0, ks.length - 5000).forEach(function (k) { delete lens[k]; }); lsSet(LS_HOLOLEN, lens); return; }
      adLens[it._k || (it._k = adKey(it.f.path))] = x; var ka = Object.keys(adLens); if (ka.length > 12000) ka.slice(0, ka.length - 12000).forEach(function (k) { delete adLens[k]; }); lsSet(LS_HOLOADLEN, adLens);
    }
    function unknown(it) { var x = rec(it); return !(x && x.z === it.f.size) || (x.s < 0 && x.why !== "format" && !(Date.now() - (x.at || 0) < HD_RETRY_MS)); }
    function unreadable(it) { var x = rec(it); return !unknown(it) && x.s < 0; }
    /* 2.72 (Timothy, D68): a video this iPad's chip can't decode (AV1 on an A16) is a limit of the iPad, not a fault:
       it's left out quietly. Only what can be fixed (the NAS not answering, a missing folder) still asks for a look. */
    function cantDecode(it) { return unreadable(it) && rec(it).why === "format"; }
    function loudBad(it) { return unreadable(it) && rec(it).why !== "format"; }
    function lengthOf(it) { var x = rec(it); return x && x.z === it.f.size && x.s > 0 ? x.s : null; }

    /* ---- a channel's folder: the running order, what's skipped, the lengths ---- */
    function seasonOf(n) { var m = /\b(?:season|series)\s*(\d+)/i.exec(n) || /\bS(\d{1,2})\b/i.exec(n) || /^\s*(\d{1,2})\s*$/.exec(n); return m ? +m[1] : null; }
    function epOf(n) { n = n.replace(/\[[^\]]*\]/g, ""); var m = /\bepisode\s*(\d+)/i.exec(n) || /\bS\d{1,2}\s*E(\d{1,3})\b/i.exec(n) || /\b\d{1,2}x(\d{1,3})\b/.exec(n) || /\bep\.?\s*(\d+)/i.exec(n); return m ? +m[1] : null; }
    function nat(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }); }
    function arrange(root, kids) {   /* seasons by number, episodes by number; then other folders (specials), episodes without a number, loose files beside the seasons */
      var video = function (x) { return !x.dir && VIDEO.test(x.name) && !PARTIAL.test(x.name); }, seas = [], others = [], extras = [], items;
      kids.forEach(function (k) {
        var fs = k.items.filter(video), n = seasonOf(k.d.name); if (!fs.length) return;
        if (n == null) { others.push({ name: k.d.name, fs: fs.sort(nat) }); return; }
        seas.push({ n: n, name: k.d.name, eps: fs.filter(function (f) { return epOf(f.name) != null; }).sort(function (a, b) { return epOf(a.name) - epOf(b.name) || nat(a, b); }) });
        fs.filter(function (f) { return epOf(f.name) == null; }).sort(nat).forEach(function (f) { extras.push(f); });
      });
      var series = seas.length > 0;
      items = [];
      seas.sort(function (a, b) { return a.n - b.n || nat(a, b); }).forEach(function (s) { s.eps.forEach(function (f) { items.push({ f: f, s: s.n, e: epOf(f.name) }); }); });
      others.sort(nat).forEach(function (o) { o.fs.forEach(function (f) { items.push({ f: f, sp: series }); }); });
      extras.concat(root.filter(video).sort(nat)).forEach(function (f) { items.push({ f: f, sp: series }); });
      return { play: items.filter(function (it) { return canPlay(it.f.name); }), skip: items.filter(function (it) { return !canPlay(it.f.name); }), series: series, seasons: seas.length, specials: items.filter(function (it) { return it.sp; }).length };
    }
    function sub(d, force) { return nasList(d.path, force).then(function (k) { return { d: d, items: k.items }; }); }
    function load(c, force) {
      var s = F[c.dir] || (F[c.dir] = { play: null, skip: [], at: 0, busy: false, err: "" }), style = net(c) ? "network" : "order";
      if (s.busy || (!force && s.style === style && s.at && Date.now() - s.at < (s.play ? 10 * 60000 : 30000))) return;
      s.busy = true; s.err = "";
      nasList(c.dir, true).then(function (l) {
        return Promise.all(l.items.filter(function (x) { return x.dir; }).map(function (d) { return sub(d, force); })).then(function (kids) {
          if (style !== "network") return arrange(l.items, kids);
          return Promise.all(kids.map(function (k) { return Promise.all(k.items.filter(function (x) { return x.dir; }).map(function (g) { return sub(g, force); })).then(function (gk) { return { k: k, gk: gk }; }); })).then(function (list) { return lineupOf(list, l.items); });
        });
      }).then(function (r) { r.style = style; r.shows = r.shows || null; Object.assign(s, r); PK = {}; probe(); }).catch(function (e) { s.err = nasErrText(e); s.style = style; })   /* 2.54: a folder that can't be listed waits 30 seconds too, not one redraw (it asked the NAS hundreds of times a second) */
        .then(function () { s.busy = false; s.at = Date.now(); if (state.screen === "holodeck") draw2(); });
    }
    /* ---- NETWORK: a folder of show folders ---- */
    function net(c) { return !!c && c.style === "network"; }
    function showName(n) {   /* "night_owl_theatre" → "Night Owl Theatre"; a name with capitals is kept as it is */
      n = n.replace(/_+/g, " ").replace(/\s+/g, " ").trim(); if (/[A-Z]/.test(n)) return n;
      return n.split(" ").map(function (w, i) { return i && /^(and|of|the|a|an|in|on|to|for|vs)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
    }
    function lineupOf(list, root) {   /* each show folder: its episodes in its own order (seasons and episodes by number, or by name). Videos loose in the channel's folder are one more "show" with no name (2.48.2): a folder of music videos is a daily shuffle */
      var shows = [], play = [], skipIt = [], loose = arrange(root || [], []);
      if (loose.play.length) { loose.play.forEach(function (it) { it.show = ""; }); shows.push({ name: "", items: loose.play }); play = loose.play.slice(); }
      skipIt = loose.skip.slice();
      list.forEach(function (x) {
        var r = arrange(x.k.items, x.gk), name = showName(x.k.d.name);
        r.play.forEach(function (it) { it.show = name; if (it.e == null) it.ep = epOf(it.f.name); });
        if (r.play.length) shows.push({ name: name, items: r.play });
        play = play.concat(r.play); skipIt = skipIt.concat(r.skip);
      });
      return { play: play, skip: skipIt, shows: shows, series: false, seasons: 0, specials: 0 };
    }
    var PK = {};
    function rng(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
    function hashStr(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function dayStart(ms) { var d = new Date(ms), s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6); if (s.getTime() > ms) s.setDate(s.getDate() - 1); return s.getTime(); }   /* the broadcast day starts at 6:00 */
    function picks(c, s, ds) {   /* the day's running order, from the date alone */
      var key = c.dir + "|" + ymd(new Date(ds)) + "|" + s.play.length; if (PK[key]) return PK[key];
      var r = rng(hashStr(key)), sh = s.shows, out = [], last = -1, ord = {}, ptrState = {}, used = {};
      var order = function (k) { if (!ord[k]) { var a = sh[k].items.map(function (_, i) { return i; }), q = rng(hashStr(key + "|" + sh[k].name)); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(q() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } ord[k] = a; ptrState[k] = 0; } return ord[k]; };
      var take = function (k) {   /* the show's next episode in today's shuffle that hasn't aired today; all aired: round again */
        var o = order(k), n = o.length, u = used[k] || (used[k] = {}), cc = 0;
        if (Object.keys(u).length >= n) u = used[k] = {};
        while (u[o[ptrState[k] % n]] && cc++ < n) ptrState[k]++;
        var i = o[ptrState[k]++ % n]; u[i] = 1; return i;
      };
      out.more = function () {   /* the lineup grows as far as the day needs: the same picks every time, from the date */
        for (var m = out.length + 120; out.length < m && sh.length;) {
          var k = Math.floor(r() * sh.length); if (sh.length > 1 && k === last) k = (last + 1 + Math.floor(r() * (sh.length - 1))) % sh.length;   /* never the same show twice in a row… */
          var it = sh[k].items[take(k)];
          if (it === out[out.length - 1] && sh[k].items.length > 1) it = sh[k].items[take(k)];   /* one show alone, as its shuffle starts again: never the same video twice running */
          out.push(it); last = k;   /* 2.53.5: no blocks of two in a row (Timothy: with vlogs they read as the same video twice) */
        }
      };
      out.more();
      if (Object.keys(PK).length > 12) PK = {};
      return (PK[key] = out);
    }
    function typical(s, show) {   /* an unmeasured episode counts as the show's middle length, else the channel's, else 23 min */
      s.est = s.est && s.est.v === X.lv ? s.est : { v: X.lv };
      if (s.est[show] == null) {
        var med = function (a) { a = a.filter(function (x) { return x > 0; }).sort(function (x, y) { return x - y; }); return a.length ? a[a.length >> 1] : 0; };
        var ofShow = s.play.filter(function (it) { return it.show === show; }).map(function (it) { return lengthOf(it) || 0; });
        s.est[show] = med(ofShow) || med(s.play.map(function (it) { return lengthOf(it) || 0; })) || 1380;
      }
      return s.est[show];
    }
    function netLen(s, it) { return unknown(it) ? typical(s, it.show) : lengthOf(it); }   /* null: measured and unreadable, skipped */
    function netAt(c, s, ms) {   /* with BREAKS (2.52): the day's commercials are a shuffle of their own, from the date */
      var ds = dayStart(ms), list = picks(c, s, ds), t = ds, E = breaks(c), seed = E ? hashStr(c.dir + "|ads|" + ymd(new Date(ds)) + "|" + E.length) : 0, j = 0, p = 0, acc = 0;
      if (E === false) return null;
      for (var i = 0; ; i++) {
        if (i >= list.length) { if (list.length > 30000 || !s.shows.length) return null; list.more(); if (i >= list.length) return null; }
        var d = netLen(s, list[i]); if (d == null) continue; if (ms < t + d * 1000) return { c: c, it: list[i], pos: (ms - t) / 1000, dur: d, startMs: t }; t += d * 1000;
        if (E && brkDue(d, acc += d)) { var b = brkAt(E, seed, j++, p, t), a = inBreak(c, b, ms); if (a) return a; p = b.p; acc = 0; t += b.d * 1000; }
      }
    }

    /* ---- commercial breaks (2.52): one Commercials folder for every channel, BREAKS on or off per channel ---- */
    /* A break of 1 or 2 commercials after each episode, or about every 12 minutes on a channel of short videos. Each
       channel deals the commercials like a deck, so none repeats until all have aired. Picks are seeded, so the breaks
       are computed from the clock like everything else. Over 3 minutes is skipped; an unmeasured one counts as 30 s. */
    var A = { play: null, dir: "", at: 0, busy: false, err: "", v: -1, ok: [] }, BK = {}, PM = {}, AD_MAX = 180, AD_GUESS = 30;
    function adLen(it) { if (unknown(it)) return AD_GUESS; var d = lengthOf(it); return d && d <= AD_MAX ? d : null; }   /* null: too long, or unreadable */
    function adPool() { if (!A.play) return []; if (A.v !== X.lv) { A.v = X.lv; A.ok = A.play.filter(function (it) { return adLen(it) != null; }); } return A.ok; }
    function breaks(c) {   /* the commercials this channel's breaks draw from; null: no breaks; false: wait, the folder is being read */
      if (!c || !c.breaks || !cfg.ads) return null;
      if (A.dir !== cfg.ads || !A.play) return A.dir === cfg.ads && A.err ? null : false;   /* can't reach them: the channel runs without */
      var E = adPool(); return E.length ? E : null;
    }
    function loadAds(force) {   /* the Commercials folder and one level of folders inside it */
      var dir = cfg.ads; if (!dir || !nasConf()) return;
      if (A.dir !== dir) A = { play: null, dir: dir, at: 0, busy: false, err: "", v: -1, ok: [] };
      var a = A; if (a.busy || (!force && a.at && Date.now() - a.at < (a.play ? 10 * 60000 : 30000))) return;
      a.busy = true; a.err = "";
      nasList(dir, true).then(function (l) { return Promise.all(l.items.filter(function (x) { return x.dir; }).map(function (d) { return sub(d, force); })).then(function (kids) { return arrange(l.items, kids); }); })
        .then(function (r) { a.play = r.play.map(function (it) { return { f: it.f, ad: true }; }); a.skip = r.skip; a.v = -1; a.medz = null; BK = {}; probe(); }, function (e) { a.err = nasErrText(e); })
        .then(function () { a.busy = false; a.at = Date.now(); if (state.screen === "holodeck" && a === A) draw2(); });
    }
    function mixInt(x) { x = (x ^ x >>> 16) >>> 0; x = Math.imul(x, 0x7feb352d) >>> 0; x = (x ^ x >>> 15) >>> 0; x = Math.imul(x, 0x846ca68b) >>> 0; return (x ^ x >>> 16) >>> 0; }
    function shuffleOf(seed, q, n) { var r = rng(mixInt((seed + Math.imul(q + 1, 0x9e3779b1)) >>> 0)), a = []; for (var i = 0; i < n; i++) a.push(i); for (i = n - 1; i > 0; i--) { var k = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[k]; a[k] = t; } return a; }
    function deckAt(seed, q, n) {   /* the q-th time through the commercials; it never opens with the one the last time ended on */
      var key = seed + "|" + q + "|" + n; if (PM[key]) return PM[key];
      var a = shuffleOf(seed, q, n), z = q > 0 && n > 1 ? shuffleOf(seed, q - 1, n)[n - 1] : -1; if (a[0] === z) { a[0] = a[1]; a[1] = z; }
      if (Object.keys(PM).length > 40) PM = {};
      return (PM[key] = a);
    }
    function brkDue(d, acc) { return d >= 480 || acc >= 720; }   /* after an episode; short videos: once 12 minutes have played */
    function brkAt(E, seed, j, p, t) {   /* break j, dealt from deck position p, starting at t (ms) */
      var n = E.length > 1 ? 1 + (mixInt((seed + j) >>> 0) & 1) : 1, ads = [], d = 0;
      for (var i = 0; i < n; i++, p++) { var it = E[deckAt(seed, Math.floor(p / E.length), E.length)[p % E.length]], l = adLen(it); ads.push({ it: it, d: l }); d += l; }
      return { ads: ads, d: d, p: p, startMs: t };
    }
    function inBreak(c, b, ms) {   /* the commercial on at ms, or null once the break is over */
      for (var i = 0, t = b.startMs; i < b.ads.length; t += b.ads[i].d * 1000, i++) if (ms < t + b.ads[i].d * 1000) return { c: c, it: b.ads[i].it, pos: (ms - t) / 1000, dur: b.ads[i].d, startMs: t, brk: { startMs: b.startMs, dur: b.d } };
      return null;
    }
    function roundAt(c, s, E, seed, st, ms) {   /* IN ORDER with breaks: one time through the order from st; its breaks come after the same episodes each time */
      var t = st.t, j = st.j, p = st.p, acc = 0;
      for (var i = 0; i < s.play.length; i++) {
        var it = s.play[i]; if (unknown(it)) return { wait: true }; var d = lengthOf(it); if (d == null) continue;
        if (ms < t + d * 1000) return { seg: { c: c, it: it, pos: (ms - t) / 1000, dur: d, startMs: t } }; t += d * 1000;
        if (brkDue(d, acc += d)) { var b = brkAt(E, seed, j++, p, t), a = inBreak(c, b, ms); if (a) return { seg: a }; p = b.p; acc = 0; t += b.d * 1000; }
      }
      return { end: { t: t, j: j, p: p } };
    }
    function orderAt(c, s, ms, E) {   /* each round's length differs with its commercials, so where each began is kept, from the premiere on */
      var seed = hashStr(c.dir + "|ads|" + E.length), key = [seed, X.lv, c.premiere, s.at, s.play.length].join("|"), R = BK[c.id];
      if (!R || R.key !== key) R = BK[c.id] = { key: key, r: [{ t: c.premiere, j: 0, p: 0 }] };
      ms = Math.max(ms, c.premiere);
      var k = R.r.length - 1; while (k > 0 && R.r[k].t > ms) k--;
      for (;;) {
        var w = roundAt(c, s, E, seed, R.r[k], ms); if (w.seg) return w.seg; if (w.wait || w.end.t === R.r[k].t) return null;
        if (k === R.r.length - 1) R.r.push(w.end); k++;
      }
    }
    function brkInfo(c) {
      if (!c.breaks) return ""; if (!cfg.ads) return " · breaks on, no commercials folder yet";
      if (A.dir === cfg.ads && A.err) return " · breaks off: can't reach the commercials"; if (A.dir !== cfg.ads || !A.play) return " · reading the commercials…";
      return adPool().length ? " · commercial breaks" : " · breaks off: no commercials of 3 minutes or less";
    }
    function adsInfo() {   /* the Commercials folder's line: kept up to date as they're measured */
      if (A.dir !== cfg.ads || (!A.play && !A.err)) return "Reading the folder…";
      if (!A.play) return esc(A.err);
      var n = A.play.length, ok = adPool().length, m = A.play.filter(function (it) { return !unknown(it); }).length, long = A.play.filter(function (it) { var d = lengthOf(it); return d && d > AD_MAX; }).length, bad = A.play.filter(loudBad).length, on = cfg.chans.filter(function (x) { return x.breaks; }).length;
      return n + (n === 1 ? " commercial" : " commercials") + (long ? ' · <span class="pill warn">' + long + " over 3 min, skipped</span>" : "") + (bad ? ' · <span class="pill warn">' + bad + " unreadable</span>" : "") + (A.skip && A.skip.length ? ' · <span class="pill warn">' + kinds(A.skip) + " skipped</span>" : "") +
        " · " + ok + " can air · " + m + " measured, the rest as they come up · breaks on " + on + (on === 1 ? " channel" : " channels");
    }
    function adsSum() {   /* the Commercials row folded: how many can air */
      if (!cfg.ads) return "NO FOLDER YET";
      if (A.dir !== cfg.ads || (!A.play && !A.err)) return "READING THE FOLDER…";
      if (!A.play) return '<span class="hd-att">CAN\'T REACH THE FOLDER</span>';
      var on = cfg.chans.filter(function (x) { return x.breaks; }).length;
      return adPool().length + " CAN AIR · BREAKS ON " + on + (on === 1 ? " CHANNEL" : " CHANNELS");
    }
    function adsRow() {   /* under the channels: the one Commercials folder, folded like a channel (2.53) */
      var open = !cfg.ads || !!X.open.ads || (X.pick && X.pickFor === "ads");
      return '<div class="hd-ads' + (open ? " open" : "") + '"><div class="hd-chrow"><span class="hd-n hd-adsic" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/></svg></span>' +
        '<span class="hd-cm"><span class="hd-nm"><b>Commercials</b></span><small class="hd-sum" id="hdAdsSum">' + adsSum() + "</small></span>" +
        (cfg.ads ? '<button type="button" class="hd-pm" data-hdopen="ads" aria-expanded="' + open + '" aria-label="' + (open ? "Hide" : "Show") + ' commercials details">' + (open ? "−" : "+") + "</button>" : "") + "</div>" +
        '<div class="hd-more"' + (open ? "" : " hidden") + ">" + (cfg.ads ? '<small class="muted">' + esc(cfg.ads) + '</small><small id="hdAdsInfo">' + adsInfo() + "</small>" : '<small class="muted">Choose a folder of commercials, then turn on BREAKS for a channel.</small>') +
        '<span class="hd-acts"><button type="button" class="chip sm" data-hd="adpick" aria-expanded="' + (X.pick && X.pickFor === "ads") + '">' + (cfg.ads ? "CHANGE FOLDER" : "CHOOSE FOLDER") + "</button>" + (cfg.ads ? '<button type="button" class="chip sm" data-hd="adclear">CLEAR</button>' : "") + "</span></div></div>";
    }
    function badList(x) {   /* an opened row names the videos this iPad can't play (2.53.4), so they can be found and converted */
      var s = F[x.dir], bad = s && s.play ? s.play.filter(unreadable) : []; if (!bad.length) return "";
      var names = function (l) { return esc(l.slice(0, 6).map(function (it) { return it.f.name.replace(/\.[^.]+$/, ""); }).join(" · ")) + (l.length > 6 ? " · and " + (l.length - 6) + " more" : ""); };
      var fmt = bad.filter(function (it) { return rec(it).why === "format"; }), gone = bad.filter(function (it) { return rec(it).why !== "format"; });
      var back = gone.length ? Math.max.apply(null, gone.map(function (it) { return (rec(it).at || 0) + HD_RETRY_MS; })) : 0;   /* 2.69: why each one, and what to do */
      return (gone.length ? '<small class="hd-bad net"><b>COULDN\'T REACH (' + gone.length + ') · TRYING AGAIN AT ' + hm(new Date(back)) + "</b> " + names(gone) + "</small>" : "") +
        (fmt.length ? '<small class="hd-noton">NOT ON THIS IPAD · ' + fmt.length + "</small>" : "");   /* 2.72: one dim line, no names, nothing to do */
    }
    function chanSum(x) {   /* a channel's row folded: its style, and anything that needs a look */
      var s = F[x.dir], w = "";
      if (s && s.err && !s.play) w = "CAN'T REACH THE FOLDER";
      else if (s && s.play) {
        var nb = s.play.filter(loudBad).length, m = s.play.filter(function (it) { return !unknown(it); }).length;
        w = nb ? nb + " UNREADABLE" : s.play.length && s.play.every(cantDecode) ? "NONE PLAY ON THIS IPAD" : s.skip.length ? s.skip.length + " SKIPPED" : m < s.play.length ? "MEASURING " + m + " OF " + s.play.length : "";
      }
      return (net(x) ? "NETWORK" : "IN ORDER") + (x.breaks ? " · BREAKS" : "") + (w ? ' · <span class="hd-att">' + esc(w) + "</span>" : "");
    }
    function nowPanel() {   /* under the screen: what's on, time left, what's next */
      var ch = cur(), c = ch && (X.on && X.cur && X.cur.c === ch ? X.cur : at(ch, Date.now()));
      if (!c) return '<span class="hd-nprow"><span class="hd-npt">' + (ch ? "CH " + numAt(ch) : "HOLODECK") + "</span><b>" + esc(ch ? ch.name : "Add a channel below") + "</b></span>";
      var pos = X.on && X.v && X.cur === c && isFinite(X.v.currentTime) ? X.v.currentTime : (Date.now() - c.startMs) / 1000;
      var dur = c.brk ? c.brk.dur : c.dur, p = c.brk ? (c.startMs - c.brk.startMs) / 1000 + pos : pos, n = c.brk ? pastBreak(c) : after(c);
      if (n && n.brk) n = pastBreak(n);
      return '<span class="hd-nprow"><span class="hd-npt">' + (X.on ? "NOW" : "ON CH " + numAt(ch)) + "</span><b>" + esc(line(label(c.it))) + "</b><small>" + mmssOf(dur - p) + " left" + (n ? " · next: " + esc(line(label(n.it))) : "") + "</small></span>" +
        '<span class="hd-prog"><i style="width:' + Math.max(0, Math.min(100, p / dur * 100)).toFixed(1) + '%"></i></span>';
    }
    function want(c, wide) {   /* the next length to measure: today's lineup first (NETWORK), or the running order (IN ORDER) */
      var s = c && F[c.dir]; if (!s || !s.play) return null;
      if (s.shows && !wide) { var l = picks(c, s, dayStart(Date.now())); for (var i = 0; i < l.length; i++) if (unknown(l[i])) return l[i]; return null; }
      return s.play.filter(unknown)[0] || null;
    }
    function adWant() {   /* 2.53.1: only the commercials worth measuring ahead: any much bigger than the rest (likely over 3 minutes: a compilation left beside its singles), biggest first, then those in this channel's next breaks. The rest count as 30 s until they air, so a new iPad never reads thousands of headers over the network */
      if (!A.play || A.dir !== cfg.ads) return null;
      if (A.medz == null) { var zs = A.play.map(function (it) { return it.f.size || 0; }).sort(function (a, b) { return a - b; }); A.medz = zs.length ? zs[zs.length >> 1] : 0; }
      var big = null; A.play.forEach(function (it) { if (it.f.size > 3 * A.medz && unknown(it) && (!big || it.f.size > big.f.size)) big = it; });
      if (big) return big;
      var c = cur(), n = c && breaks(c) ? at(c, Date.now()) : null;
      for (var i = 0; n && i < 16; i++) { if (n.it.ad && unknown(n.it)) return n.it; n = after(n); }
      return null;
    }
    function probe() {   /* each new file's length, one at a time, from its header only: this channel first */
      if (X.probing) return;
      if (document.hidden) { X.probeLater = true; return; }   /* not while Bridge is in the background: no second player loading beside the sound (2.56.2) */
      var list = [cur()].concat(cfg.chans), it = null;
      [false, true].forEach(function (wide) { for (var i = 0; i < list.length && !it; i++) it = want(list[i], wide); if (!it && !wide) it = adWant(); });   /* the commercials after the channels' lineups (2.52) */
      if (!it) { paint(); return; }
      X.probing = true;
      var f = it.f, v = X.pv || (X.pv = document.createElement("video")), done = false, fin = function (s, why) { if (done) return; done = true; clearTimeout(t); v.onloadedmetadata = v.onerror = null; keepLen(it, s > 0 ? { s: s, z: f.size } : { s: -1, z: f.size, why: why, at: Date.now() }); X.lv++; v.removeAttribute("src"); v.load();
        paint(); setTimeout(function () { X.probing = false; probe(); }, X.on ? 1500 : 300); };   /* one element, reused, and a pause between files (2.53.1): gentler on the iPad, and on the picture while on air */
      var t = setTimeout(function () { fin(-1, "timeout"); }, 45000);   /* a big file without +faststart is read from both ends over Tailscale: give it time */
      v.preload = "metadata"; v.muted = true; v.onloadedmetadata = function () { fin(isFinite(v.duration) && v.duration > 1 ? Math.round(v.duration * 10) / 10 : -1, "format"); };
      v.onerror = function () {   /* 4: MEDIA_ERR_SRC_NOT_SUPPORTED, which a 404 or an unreachable NAS reads as too (2.53.5): it's "format" only if the file answers */
        if (!(v.error && v.error.code === 4)) { fin(-1, "net"); return; }
        fetch(url(f.path), { headers: { Range: "bytes=0-0" } }).then(function (r) { fin(-1, r.ok ? "format" : "net"); }, function () { fin(-1, "net"); });
      };
      v.src = url(f.path);
    }

    /* ---- the broadcast: computed from the clock ---- */
    function walk(items, offset) {   /* what's at `off` seconds into the order; the first time round needs only the lengths up to there */
      for (var i = 0; i < items.length; i++) { if (unknown(items[i])) return { wait: true }; var d = lengthOf(items[i]); if (d == null) continue; if (offset < d) return { it: items[i], pos: offset, dur: d }; offset -= d; }
      return { left: offset };
    }
    function at(c, ms) {
      var s = c && F[c.dir]; if (!s || !s.play) return null;
      if (s.shows) return net(c) ? netAt(c, s, ms) : null;   /* read for the other style: wait for the reread */
      var E = breaks(c); if (E === false) return null; if (E) return orderAt(c, s, ms, E);
      var sec = Math.max(0, (ms - c.premiere) / 1000), w = walk(s.play, sec);
      if (w.left != null) { var L = sec - w.left; if (L <= 0) return null; w = walk(s.play, sec % L); }   /* round again from the top */
      return w.it ? { c: c, it: w.it, pos: w.pos, dur: w.dur, startMs: ms - w.pos * 1000 } : null;
    }
    function after(c) { return at(c.c, c.startMs + c.dur * 1000 + 20); }
    function endMs(c) { return c.brk ? c.brk.startMs + c.brk.dur * 1000 : c.startMs + c.dur * 1000; }   /* a commercial: the end of its whole break */
    function pastBreak(c) { return at(c.c, endMs(c) + 20); }
    function next(c) { var n = after(c); return n && n.it === c.it ? after(n) : n; }   /* a length that settled mid-episode never replays it */
    function loopLen(c) { var s = F[c.dir]; if (!s || !s.play || s.shows || s.play.some(unknown)) return 0; return s.play.reduce(function (n, it) { return n + (lengthOf(it) || 0); }, 0); }
    function label(it) {   /* a name and a line: "Artist - Title" for a music video; the season and episode, and a title if the name has one, for a series */
      if (it.ad) return { a: "COMMERCIAL BREAK", t: "", ad: true };
      var n = it.f.name.replace(/\.[^.]+$/, "").replace(/\[[^\]]*\]/g, " ").replace(/_/g, " ").replace(/\s+/g, " ").trim();
      if (it.show) {   /* NETWORK: the show, then the season and episode and whatever title the name has (a loose video, show "", reads as a music video) */
        var sn = it.show.toLowerCase(), bits = n.replace(/\.f\d+$/i, "").replace(/\b(?:season|series)\s*\d+\s*,?\s*(?:episode|ep\.?)\s*\d+|\bS\d{1,2}\s*E\d{1,3}\b|\b(?:episode|ep\.?)\s*\d+/i, "|").replace(/\s+[-–—]\s+/g, "|").split("|")
          .map(function (p) { return p.replace(/^[\s,"'“”‘’–—-]+|[\s,"'“”‘’–—-]+$/g, ""); })
          .filter(function (p) { var q = p.toLowerCase(); return p && q !== sn && !/^(?:updated |new |the )?full episode$/.test(q) && !/^watch (?:the )?(?:full )?episode/.test(q); });
        var se = it.s != null && it.e != null ? "S" + it.s + " E" + it.e : it.ep != null ? "E" + it.ep : "";
        return { a: it.show, t: [se, bits.join(" – ")].filter(Boolean).join(" · "), net: true };
      }
      if (it.s == null && !it.sp) { n = n.replace(/^\s*\d{1,3}\s*[-.)_]\s*/, "").trim(); var m = n.split(/\s+[-–—]\s+/); return m.length > 1 ? { a: m[0], t: m.slice(1).join(" – ") } : { a: n, t: "" }; }
      var show = folderName(parentOf(it.f.path)).replace(/\s*[-–—,]?\s*\b(?:season|series)\s*\d+.*$/i, "").trim().toLowerCase(), chn = (cur() || {}).name || "";
      var parts = n.replace(/\b(?:season|series)\s*\d+\s*,?\s*(?:episode|ep\.?)\s*\d+|\bS\d{1,2}\s*E\d{1,3}\b|\b(?:episode|ep\.?)\s*\d+/i, "|").replace(/\s+[-–—]\s+/g, "|").split("|")
        .map(function (p) { return p.replace(/^[\s,–—-]+|[\s,–—-]+$/g, ""); })
        .filter(function (p) { var q = p.toLowerCase(); return p && q !== show && q !== chn.toLowerCase() && !/^(?:updated |new |the )?full episode$/.test(q); });
      var t = parts.join(" – ");
      return it.sp ? { a: "Special", long: "Special", t: t || n } : { a: "S" + it.s + " E" + it.e, long: "Season " + it.s + ", Episode " + it.e, t: t };
    }
    function line(l) { return l.a + (l.t ? " · " + l.t : ""); }

    /* ---- the set: one video element for the app ---- */
    function mkVid() {   /* a TV video element; its handlers act only while it's the one on screen (LEVEL's backup waits beside it, 2.62) */
      var v = document.createElement("video"); v.setAttribute("playsinline", ""); v.preload = "auto"; v.className = "hd-video";
      v.addEventListener("ended", function () { if (X.v !== v || !X.on || !X.cur) return; if (X.sleep === "end") { sleepOff("Sleep timer: the TV went off at the end of the show"); return; } var n = next(X.cur); if (n) start(n, false); else resume(); });
      v.addEventListener("error", function () {   /* its header loaded (or a decode error): the iPad can't decode it. Before that: the NAS or the network (a 404 or an outage reads like an unsupported file), tried again later */
        if (X.v !== v || !X.on || !X.cur || !v.getAttribute("src") || v.getAttribute("src") === VA_SILENT) return;
        var c = X.cur, me = v.error, fmt = !!(me && (me.code === 3 || (me.code === 4 && X.meta)));   /* 2.69: a decode error, or "not supported" once its header was read; a network error (2) never marks a file for good */
        hdErr(fmt ? "video didn't decode" : "video didn't load", "MediaError " + (me ? me.code + (me.message ? " · " + me.message : "") : "?"), c);
        if (!fmt) { nasGate(v, c, function () { afterFail(v, c, fmt); }); return; }   /* 2.68: is the NAS there at all? */
        afterFail(v, c, fmt);
      });
      v.addEventListener("playing", function () { if (X.v === v) { X.fails = 0; X.nasMiss = 0; } });
      v.addEventListener("timeupdate", function () { if (X.v !== v) return; if (v.currentTime !== X.ct) { X.ct = v.currentTime; X.tp = Date.now(); } tickOnce(); });
      return v;
    }
    function afterFail(v, c, fmt) {   /* the NAS answered (or it's a decode failure): LEVEL steps aside, else the file is passed over */
        if (X.v !== v || !X.on || X.cur !== c) return;
        var why = "the video " + (fmt ? "didn't decode" : "didn't load") + " with LEVEL on";
        if (lvOn() && X.bkp && !X.bk) {   /* 2.66: failed before the backup finished unlocking (a slow moment right after TUNE IN): wait for it, up to 2 s, rather than skip the show */
          var t0 = Date.now(), w = setInterval(function () {
            if (X.v !== v || !X.on || X.cur !== c) { clearInterval(w); return; }
            if (X.bk || !X.bkp || Date.now() - t0 > 2000) { clearInterval(w); if (!lvFallback(why)) failed(c, fmt ? "format" : "net"); }
          }, 50);
          return;
        }
        if (lvOn() && lvFallback(why)) return;   /* 2.62: LEVEL steps aside first; the file isn't marked */
        failed(c, fmt ? "format" : "net");
    }
    /* 2.68, from Timothy's ERROR LOG: six "didn't load" (MediaError 4, NotSupportedError) in two seconds, then the TV went off.
       Safari reports a video it couldn't fetch at all that way; the iPad's link to the NAS was down (waking, Tailscale
       reconnecting), not the files or LEVEL. So a load failure first asks the NAS for that file (HEAD, 5 s): no answer =
       WAITING FOR THE NAS: the same channel is tried again at its live point after 2, 4, 8, 15 and 30 s, then every 30 s, for
       5 minutes; nothing is marked or counted and LEVEL isn't paused. An answer = the file's own problem, handled as before. */
    var NAS_WAITS = [2, 4, 8, 15, 30];
    function nasProbe(c) {
      if (navigator.onLine === false) return Promise.resolve({ ok: false, why: "the iPad is offline" });
      var ac = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ac) ac.abort(); }, 5000);
      return fetch(url(c.it.f.path), { method: "HEAD", cache: "no-store", signal: ac ? ac.signal : undefined }).then(function (r) { clearTimeout(t); return { ok: true, code: r.status }; },
        function (e) { clearTimeout(t); return { ok: false, why: e && e.name === "AbortError" ? "no answer in 5 s" : "no connection" }; });
    }
    function nasGate(v, c, proceed) {
      if (X.nasWait) return;   /* already waiting */
      if (X.nasCheck === c) return; X.nasCheck = c;
      nasProbe(c).then(function (r) {
        X.nasCheck = null;
        if (X.v !== v || !X.on || X.cur !== c) return;
        if (r.ok) { hdErr("NAS answered", "HTTP " + r.code + " for this file, so the file itself didn't load", c); proceed(); return; }
        nasWaitStart(c, r.why);
      });
    }
    function nasWaitStart(c, why) {
      var v = X.v; if (v) { try { v.pause(); } catch (e) { /* fine */ } }
      X.nasWait = { since: Date.now(), n: 0, why: why, t: 0 };
      hdErr("waiting for the NAS", "NAS unreachable (" + why + "); nothing marked, LEVEL left on; trying again", c);
      X.note = "WAITING FOR THE NAS · " + why + ". The show picks up as soon as it's back.";
      paint(); if (state.screen === "holodeck") draw2(true);
      nasRetry();
    }
    function nasRetry() {
      var w = X.nasWait; if (!w || !X.on) { X.nasWait = null; return; }
      var d = NAS_WAITS[Math.min(w.n, NAS_WAITS.length - 1)] * 1000;
      if (Date.now() - w.since + d > 300000) { X.nasWait = null; hdErr("TV went off", "the NAS stayed unreachable for 5 minutes (" + w.why + ")", X.cur); off(); X.note = "The NAS was out of reach for 5 minutes. Check the iPad's Wi-Fi and Tailscale, then TUNE IN again."; draw2(); return; }
      clearTimeout(w.t);
      w.t = setTimeout(function () {
        if (X.nasWait !== w || !X.on) return;
        var c = at(cur(), Date.now()); if (!c) { w.n++; nasRetry(); return; }
        nasProbe(c).then(function (r) {
          if (X.nasWait !== w || !X.on) return;
          if (!r.ok) { w.why = r.why; w.n++; nasRetry(); return; }
          X.nasWait = null; X.fails = 0;
          errLog("holodeck", "NAS back", "after " + Math.round((Date.now() - w.since) / 1000) + " s; the show picked up at its live point", "CH " + numAt(c.c));
          X.note = ""; start(c, true); if (state.screen === "holodeck") draw2(true);
        });
      }, d);
    }
    window.addEventListener("online", function () { var w = X.nasWait; if (w) { w.n = 0; clearTimeout(w.t); w.t = setTimeout(nasRetry, 0); } });   /* back on Wi-Fi: try at once */
    function vid() {
      if (X.v) return X.v;
      var k = X.keep; if (!k) { k = document.createElement("div"); k.className = "hd-keep"; document.body.appendChild(k); X.keep = k; }   /* once: LEVEL can swap the video element (2.61) */
      var v = mkVid(); v.id = "hdVideo"; k.appendChild(v);
      return (X.v = v);
    }
    function hdErr(what, why, c) {   /* SYSTEMS → ERROR LOG (2.62): the file, the channel and what LEVEL was doing */
      errLog("holodeck", what, why, (c && c.it ? baseName(c.it.f.path) + (c.it.ad ? " (commercial)" : "") : "?") + (c && c.c ? " · CH " + numAt(c.c) : "") + " · LEVEL " + (lvOn() ? "on, engine " + lvS.ac.state : !cfg.level ? "off" : lvS.paused ? "paused" : "not routed"));
    }
    /* Full screen (2.53.3): Bridge draws it itself. The TV screen covers the whole app (X.big), so CRT, LIVE, the
       channel mark, credits and UP NEXT come too, and a redraw keeps it. Where the browser can also hide its own bars
       (Safari), the page asks for that too; a Home Screen app has none and isn't offered it (2.53.2 relied on it and
       fell back to the iPad's player, which shows the video alone). Picture in Picture was taken out in 2.53.2: the
       iPad offers it to no web app on the Home Screen, not even in its own player. */
    function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function fullOn() {
      if (!X.on) return; X.big = true; draw2();
      var d = document.documentElement, proceed = d.requestFullscreen || d.webkitRequestFullscreen;
      if (proceed) { try { var r = proceed.call(d); if (r && r.catch) r.catch(function () { /* drawn full screen all the same */ }); } catch (e) { /* drawn full screen all the same */ } }
    }
    function fullOff() {
      var was = X.big; X.big = false;
      if (fsEl()) { var x = document.exitFullscreen || document.webkitExitFullscreen; try { var r = x && x.call(document); if (r && r.catch) r.catch(function () {}); } catch (e) { /* already out */ } }
      if (was && state.screen === "holodeck") draw2();
    }
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) { document.addEventListener(ev, function () { if (!fsEl() && X.big) fullOff(); }); });   /* the browser's own way out */
    /* A video that won't play (2.53.4). Its header can read fine (so it was measured) while the picture can't be decoded,
       and the channel kept landing on it: tuning in skipped from title to title and gave up after five. Now a decode
       failure takes it off the schedule for good on this iPad (LOOK AGAIN tries it afresh), and a network failure or a
       stall for 10 minutes, like a failed measurement. */
    function failed(c, why) {
      clearInterval(X.wd); keepLen(c.it, { s: -1, z: c.it.f.size, why: why, at: Date.now() }); X.lv++;
      var nm = line(label(c.it));
      if (why !== "format" && ++X.fails > 4) { hdErr("TV went off", "five videos in a row didn't load", c); off(); X.note = "Five videos in a row didn't load. Check the NAS and Tailscale, then TUNE IN again. SYSTEMS → ERROR LOG has the details."; draw2(); return; }   /* a decode failure doesn't count: each one leaves the schedule, so the run ends */
      X.note = why === "format" ? "" : nm + (why === "timeout" ? " didn't start; on to the next." : " didn't load; on to the next.");   /* 2.72: a decode failure moves on without a word */
      var n = next(c), s = F[c.c.dir];
      if (n) start(n, false);
      else if (s && s.play && s.play.every(unreadable)) { off(); X.note = why === "format" ? "None of this channel's videos play on this iPad." : "None of this channel's videos would load. Check the NAS and Tailscale, then TUNE IN again."; draw2(); }
      else resume();
    }
    function start(c, seekLive) {
      if (!c) return; if (X.nasWait) { clearTimeout(X.nasWait.t); X.nasWait = null; }   /* a new start (a channel change, or the NAS back) ends the wait */
      var v = vid(); X.cur = c; X.note = X.note || "";
      X.meta = false; X.tp = Date.now(); clearInterval(X.wd);   /* 2.53.5: stalled = playing but no progress for 30 s, from the start or part way (data that stopped coming) */
      X.wd = setInterval(function () { if (!X.on || X.cur !== c) { clearInterval(X.wd); return; } if (!v.paused && !document.hidden && Date.now() - X.tp > 30000) { hdErr("video stalled", "no progress for 30 s (ready state " + v.readyState + ", network state " + v.networkState + ")", c); if (lvOn() && lvFallback("the video stalled with LEVEL on")) return; failed(c, "timeout"); } }, 5000);
      if (pl.el && !pl.el.paused) pl.el.pause();   /* one at a time: the TV pauses AUDIO */
      lvBegin(c);
      v.muted = cfg.muted; v.src = url(c.it.f.path);
      var p = v.play(); if (p && p.catch) p.catch(function (e) { if (e && e.name !== "AbortError" && X.cur === c) hdErr("video wouldn't start", e.name + (e.message ? " · " + e.message : ""), c); });   /* the next tap starts it; AbortError is only the next src replacing this one */   /* inside the tap the first time, so the iPad lets it play with sound */
      v.onloadedmetadata = function () { X.meta = true;
        if (isFinite(v.duration) && v.duration > 1) { if (unknown(c.it)) { keepLen(c.it, { s: Math.round(v.duration * 10) / 10, z: c.it.f.size }); X.lv++; } c.dur = v.duration; }   /* playing measures it: the schedule never runs on a guess for what's on */
        var pos = seekLive !== false ? (Date.now() - c.startMs) / 1000 : Math.max(0, (Date.now() - c.startMs) / 1000); if (pos > .5 && isFinite(v.duration)) v.currentTime = Math.min(pos, Math.max(0, v.duration - 1)); };
      meta(c); paint();
    }
    function resume() {   /* on air: what's on this channel now, or as soon as its lengths say */
      clearTimeout(X.wait); if (!X.on) return;
      var c = at(cur(), Date.now()); if (c) start(c, true); else X.wait = setTimeout(resume, 1500);
    }
    function meta(c) { if (!("mediaSession" in navigator) || !window.MediaMetadata) return; var l = label(c.it), ser = l.long != null || !!l.net; try { navigator.mediaSession.metadata = new MediaMetadata({ title: ser ? line(l) : l.t || l.a, artist: ser ? c.c.name : l.t ? l.a : "", album: "HOLODECK · CH " + numAt(c.c) + " · " + c.c.name }); } catch (e) { /* older iPadOS */ } }
    function tune() {
      var c = at(cur(), Date.now()); if (!c) return;
      X.on = true; X.tuneAt = Date.now(); X.note = ""; lvS.paused = ""; radioUnlock(); lvRoute(); lvBackup(); burst(); start(c, true); draw2();
    }
    function off() { if (X.nasWait) clearTimeout(X.nasWait.t); X.nasWait = null; X.nasCheck = null; lvEnd(true); clearInterval(X.wd); X.big = false; if (fsEl()) fullOff(); X.on = false; X.cur = null; clearTimeout(X.wait); radioStop(); var v = X.v; if (v) { v.pause(); v.removeAttribute("src"); v.load(); if (v.parentNode !== X.keep) X.keep.appendChild(v); } }
    /* ---- 2.56.2: the TV's sound when Bridge goes to the background ----
       iPadOS keeps an audio player going when a Home Screen app goes to the background (AUDIO does), but stops an
       inline video. Until 2.53.3 FULL SCREEN used the iPad's own player, which carries on, so leaving the app from full
       screen kept the sound; since Bridge draws full screen itself, every exit went quiet. Now, leaving the app (Home,
       another app, the lock), the broadcast moves to an audio player at the same point, follows the schedule show after
       show, and shows on the lock screen; coming back, the picture takes over at the live point. The player is unlocked
       by the tap that tunes in (iPadOS only lets a tap start sound). A muted TV stays silent. */
    function radio() {
      if (X.au) return X.au;
      vid();
      var a = document.createElement("audio"); a.id = "hdRadio"; a.preload = "auto"; X.keep.appendChild(a);
      a.addEventListener("ended", function () {
        if (!X.radio || !X.on || !X.cur) return;
        if (X.sleep === "end") { sleepOff("Sleep timer: the TV went off at the end of the show"); return; }
        var n = next(X.cur) || at(cur(), Date.now()); if (n) radioPlay(n);
      });
      a.addEventListener("error", function () {   /* one that won't play as sound: on to what's on next, without marking it (the picture may still be fine) */
        if (!X.radio || !X.on || !X.cur || !a.getAttribute("src") || a.getAttribute("src") === VA_SILENT) return;
        clearTimeout(X.rw); var c = X.cur; hdErr("background sound didn't play", "MediaError " + (a.error ? a.error.code + (a.error.message ? " · " + a.error.message : "") : "?"), c); X.rw = setTimeout(function () { if (X.radio && X.cur === c) { var n = next(c); if (n) radioPlay(n); } }, 1500);
      });
      return (X.au = a);
    }
    function radioUnlock() { var a = radio(); if (a.getAttribute("src") && a.getAttribute("src") !== VA_SILENT) return; a.src = VA_SILENT; var p = a.play(); if (p && p.catch) p.catch(function () { /* unlocked or not, the picture plays */ }); }
    function radioPlay(c) {
      var a = radio(); X.cur = c;
      a.onloadedmetadata = function () { var pos = (Date.now() - c.startMs) / 1000; if (pos > .5 && isFinite(a.duration)) a.currentTime = Math.min(pos, Math.max(0, a.duration - 1)); };
      a.src = url(c.it.f.path); a.muted = false;
      var p = a.play(); if (p && p.catch) p.catch(function () { /* iPadOS said no: the picture catches up on return */ });
      if ("mediaSession" in navigator && window.MediaMetadata) {
        try { var lbl = label(c.it); navigator.mediaSession.metadata = new MediaMetadata({ title: line(lbl), artist: (c.c && c.c.name) || "HOLODECK", album: "TimothyOS · HOLODECK" }); navigator.mediaSession.playbackState = "playing"; } catch (e) { /* not offered here */ }
      }
    }
    function toRadio() {
      if (!X.on || X.radio || cfg.muted) return;
      var c = at(cur(), Date.now()) || X.cur; if (!c) return;
      X.radio = true; clearInterval(X.wd); clearTimeout(X.wait); if (X.v) X.v.pause(); lvEnd(false);
      radioPlay(c);
    }
    function radioStop() {
      clearTimeout(X.rw); X.radio = false;
      var a = X.au; if (a && a.getAttribute("src") && a.getAttribute("src") !== VA_SILENT) { a.pause(); a.removeAttribute("src"); a.load(); }
    }
    /* ---- LEVEL (2.61, Timothy: "Is there a way to equalize volume?", his five postulates) ----
       Channels came in at different loudness (public access quiet, music videos loud). The iPad ignores a volume set on a
       video from code, so with LEVEL on the TV's sound runs through Web Audio: the video → a gain → a limiter → the
       speakers. All of it comes before the iPad's own volume, so the side buttons work as before. A tap with the ear's
       weighting (ITU-R BS.1770's K filter: a high shelf and a low cut) reads 0.34 s blocks while the picture plays; blocks
       are gated as BS.1770 gates them (-70 absolute, 10 below the mean) in a 0.5 dB histogram, so silences don't count.
       Each file's loudness is kept in tos.hololoud.v1 {key: {l, n seconds, z size}} (a cache, like the lengths): a file
       heard before starts at its level; one never heard starts at its folder's average and eases toward its own at LV_RATE
       dB a second, within ±LV_MAX of no change. The video element is crossOrigin "anonymous" (the relay already allows
       Bridge, as its folder reads need). In the background the radio <audio> plays at the file's own volume: iPadOS pauses
       Web Audio there. An element routed into Web Audio stays routed, so LEVEL OFF (and TAP FOR SOUND, when iPadOS won't
       give the sound back) swaps in a new video element. */
    var LV_T = -18, LV_MAX = 12, LV_RATE = .4, LV_MIN = 6, LV_BLK = .4, LV_K = 3.01 - .691;   /* LV_K: the analyser's mono mix read as stereo, and BS.1770's offset */
    var louds = lsGet(LS_HOLOLOUD) || {};
    var lvS = { ac: null, gn: null, an: null, v: null, buf: null, t: 0, g: 0, it: null, c: null, p: null, seed: null, lost: 0, tries: 0, paused: "", told: 0 };
    function lvKey(it) { return it.ad ? "a" + (it._k || (it._k = adKey(it.f.path))) : it.f.path; }   /* paths start with "/", commercials with "a" */
    function lvRec(it) { var x = louds[lvKey(it)]; return x && x.z === it.f.size && x.n > 0 ? x : null; }
    function lvMix(a, b) { if (!a) return b; if (!b) return a; var n = a.n + b.n; return { l: 10 * Math.log10((Math.pow(10, a.l / 10) * a.n + Math.pow(10, b.l / 10) * b.n) / n), n: n }; }
    function lvGuess(it, dir) {   /* never heard: its folder's average (the commercials' for a commercial), weighed as 20 seconds */
      var pre = dir + "/", sum = 0, k = 0;
      Object.keys(louds).forEach(function (key) { if (it.ad ? key.charAt(0) === "a" : key.indexOf(pre) === 0) { sum += louds[key].l; k++; } });
      return k ? { l: sum / k, n: 20 } : null;
    }
    function lvAir() {   /* this airing so far, gated */
      if (!lvS.c) return null; var e = 0, k = 0, i;
      for (i = 0; i < 160; i++) if (lvS.c[i]) { e += lvS.p[i]; k += lvS.c[i]; }
      if (!k) return null;
      var thr = 10 * Math.log10(e / k) + LV_K - 10, e2 = 0, k2 = 0;
      for (i = 0; i < 160; i++) if (lvS.c[i] && i / 2 - 79.75 >= thr) { e2 += lvS.p[i]; k2 += lvS.c[i]; }
      return k2 ? { l: 10 * Math.log10(e2 / k2) + LV_K, n: k2 * LV_BLK } : null;
    }
    function lvEst() { var a = lvAir(); if (!lvS.seed && !(a && a.n >= LV_MIN)) return null; return lvMix(lvS.seed, a); }
    function lvWant(e) { return e ? Math.max(-LV_MAX, Math.min(LV_MAX, LV_T - e.l)) : 0; }
    function lvSet(db, now) {
      lvS.g = db; if (!lvS.gn) return;
      var g = lvS.gn.gain, t = lvS.ac.currentTime, x = Math.pow(10, db / 20);
      try { g.cancelScheduledValues(t); if (now) g.setValueAtTime(x, t); else g.setTargetAtTime(x, t, .15); } catch (e) { g.value = x; }
    }
    function lvBegin(c) {   /* a file on screen: keep what the last one measured; this one starts at its level */
      lvEnd(false); lvS.it = c.it; lvS.c = new Float64Array(160); lvS.p = new Float64Array(160);
      var r = lvRec(c.it); lvS.seed = r ? { l: r.l, n: r.n } : lvGuess(c.it, c.c.dir);
      lvSet(lvWant(lvEst()), true);
    }
    function lvEnd(stop) {   /* this airing joins the file's measure (5 seconds of sound or more) */
      var it = lvS.it, a = lvAir(); lvS.it = null; lvS.c = lvS.p = null; lvS.seed = null;
      if (it && a && a.n >= 5) {
        var k = lvKey(it), r = lvRec(it), m = lvMix(r && { l: r.l, n: r.n }, a);
        delete louds[k]; louds[k] = { l: Math.round(m.l * 10) / 10, n: Math.min(Math.round(m.n), 36000), z: it.f.size };   /* re-added last, so the oldest go first */
        var ks = Object.keys(louds); if (ks.length > 8000) ks.slice(0, ks.length - 8000).forEach(function (x) { delete louds[x]; });
        lsSet(LS_HOLOLOUD, louds);
      }
      if (stop && lvS.ac && lvS.ac.state === "running") { try { lvS.ac.suspend(); } catch (e) { /* closed */ } }
    }
    function lvWake() { if (lvS.ac && lvS.ac.state !== "running") { try { var r = lvS.ac.resume(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* the next tap */ } } }
    function lvRoute() {   /* inside a tap: the TV's sound through Web Audio, once per video element */
      if (!cfg.level) return;
      var v = vid(); if (lvS.ac && lvS.v === v) { lvWake(); return; }
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      var ac, src;
      try { ac = new C(); v.crossOrigin = "anonymous"; src = ac.createMediaElementSource(v); }
      catch (e) { v.removeAttribute("crossorigin"); try { if (ac) ac.close(); } catch (x) { /* never opened */ } errLog("holodeck", "LEVEL couldn't start", (e && e.name) + (e && e.message ? " · " + e.message : ""), ""); return; }   /* no Web Audio here: the TV plays as before */
      lvS.ac = ac; lvS.v = v; lvS.lost = 0; lvS.tries = 0;
      try {
        var gn = ac.createGain(), lim = ac.createDynamicsCompressor(), hs = ac.createBiquadFilter(), hp = ac.createBiquadFilter(), an = ac.createAnalyser();
        lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .003; lim.release.value = .25;   /* a boosted quiet show never clips */
        src.connect(gn); gn.connect(lim); lim.connect(ac.destination);
        hs.type = "highshelf"; hs.frequency.value = 1500; hs.gain.value = 4; hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = .5; an.fftSize = 16384;
        src.connect(hs); hs.connect(hp); hp.connect(an);
        lvS.gn = gn; lvS.an = an; lvS.buf = new Float32Array(an.fftSize);
      } catch (e) { lvS.gn = lvS.an = null; try { src.connect(ac.destination); } catch (x) { /* nothing more to try */ } }
      ac.onstatechange = function () { if (this === lvS.ac && this.state === "running") { lvS.lost = 0; lvS.tries = 0; lvShow(); } };
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older iPadOS */ }
      lvWake(); lvSet(lvS.g, true);
      clearInterval(lvS.t); lvS.t = setInterval(lvTick, LV_BLK * 1000);
    }
    function lvTick() {
      var v = X.v, ac = lvS.ac;
      if (!ac || !v || lvS.v !== v || !X.on || X.radio || document.hidden || v.paused || v.muted) return;   /* muted: nothing to hear or measure */
      if (ac.state !== "running") {   /* iPadOS took the sound (a call, Siri, another app): ask for it back, then for a tap */
        if (!lvS.lost) lvS.lost = Date.now();
        if (lvS.tries < 3 && Date.now() - lvS.lost >= lvS.tries * 1500) { lvS.tries++; lvWake(); }
        else if (Date.now() - lvS.lost > 2500) {
          if (lvFallback("iPadOS kept the sound engine " + ac.state)) return;   /* 2.62: the plain player takes over without a tap; without one, TAP FOR SOUND (lvShow) */
        }
        lvShow(); return;
      }
      if (lvS.lost) { lvS.lost = 0; lvS.tries = 0; lvS.told = 0; lvShow(); }
      if (!lvS.an || !lvS.c || v.readyState < 3 || !X.cur || !lvS.it || X.cur.it.f.path !== lvS.it.f.path) return;
      lvS.an.getFloatTimeDomainData(lvS.buf); var b = lvS.buf, s = 0; for (var i = 0; i < b.length; i++) s += b[i] * b[i];
      var ms = s / b.length, ld = ms > 0 ? 10 * Math.log10(ms) + LV_K : -200;
      if (ld >= -70) { var j = Math.min(159, Math.floor((ld + 80) * 2)); lvS.c[j]++; lvS.p[j] += ms; }
      var d = lvWant(lvEst()) - lvS.g, st = LV_RATE * LV_BLK;
      if (Math.abs(d) > .05) lvSet(lvS.g + Math.max(-st, Math.min(st, d)), false);
    }
    function lvOn() { return !!(X.v && lvS.ac && lvS.v === X.v); }
    function lvBackup() {   /* inside the TUNE IN tap (2.62): a plain player, unlocked for sound, ready in case LEVEL has to step aside */
      if (!cfg.level || X.bk || X.bkp || !X.keep || !lvOn()) return;
      var b = mkVid(); b.id = "hdVideoB"; X.keep.appendChild(b); b.src = VA_SILENT; X.bkp = true;
      var drop = function () { X.bkp = false; if (b.parentNode) b.parentNode.removeChild(b); };   /* not unlocked: no backup, so TAP FOR SOUND stays the way back */
      try { var p = b.play(); if (p && p.then) p.then(function () { X.bkp = false; b.pause(); X.bk = b; }, drop); else { X.bkp = false; X.bk = b; } } catch (e) { drop(); }
    }
    function lvFallback(why) {   /* LEVEL steps aside (2.62): the backup player takes the same show at the live point; LEVEL tries again at the next TUNE IN */
      var b = X.bk; if (!b || !X.on) return false;
      errLog("holodeck", "LEVEL paused", why, X.cur && X.cur.it ? baseName(X.cur.it.f.path) : "");
      lvEnd(false); clearInterval(X.wd); X.bk = null;
      var old = X.v; if (old) { old.pause(); old.removeAttribute("src"); old.load(); if (old.parentNode) old.parentNode.removeChild(old); }
      clearInterval(lvS.t); lvS.t = 0;
      if (lvS.ac) { var a = lvS.ac; lvS.ac = null; a.onstatechange = null; try { a.close(); } catch (e) { /* already closed */ } }
      lvS.gn = lvS.an = lvS.v = null; lvS.lost = 0; lvS.tries = 0; lvS.told = 0; lvS.g = 0; lvS.paused = why;
      b.pause(); b.id = "hdVideo"; X.v = b;
      X.note = "LEVEL stepped aside (" + why + "), so the TV plays on without it. It tries again at the next TUNE IN.";
      X.cur = null; var c = at(cur(), Date.now()); if (c) start(c, true); else resume();
      if (state.screen === "holodeck") draw2();
      return true;
    }
    function lvLost() { return !!(X.on && lvS.ac && lvS.v === X.v && lvS.lost && Date.now() - lvS.lost > 2500 && !X.bk); }   /* with a backup ready, LEVEL steps aside instead (2.62) */
    function lvText() {
      if (!cfg.level) return "OFF";
      if (lvLost()) return "TAP FOR SOUND";
      if (lvS.paused) return X.on ? "PAUSED" : "ON";
      if (!X.on || !lvS.it || !lvS.ac || lvS.v !== X.v) return "ON";
      return lvEst() ? (lvS.g < 0 ? "−" : "+") + Math.abs(lvS.g).toFixed(1) + " DB" : "LEARNING";
    }
    function lvShow() {
      var e = $("hdLvl"); if (e) { var t = lvText(); if (e.textContent !== t) e.textContent = t; }
      var lost = lvLost(), b = $("hdSnd"); if (b) b.hidden = !lost;
      if (lost && !lvS.told) { lvS.told = 1; hdErr("TAP FOR SOUND shown", "the sound engine stayed " + lvS.ac.state + " and no backup player was ready", X.cur); }
    }
    function lvSwap() {   /* a new video element (LEVEL switched, or TAP FOR SOUND): inside a tap, back at the live point */
      lvEnd(false);
      var old = X.v; if (old) { old.pause(); old.removeAttribute("src"); old.load(); if (old.parentNode) old.parentNode.removeChild(old); }
      X.v = null; clearInterval(lvS.t); lvS.t = 0;
      if (lvS.ac) { var a = lvS.ac; lvS.ac = null; a.onstatechange = null; try { a.close(); } catch (e) { /* already closed */ } }
      lvS.gn = lvS.an = lvS.v = null; lvS.lost = 0; lvS.tries = 0; lvS.g = 0;
      vid();
      lvS.paused = ""; lvS.told = 0;
      if (X.bk) { var ob = X.bk; X.bk = null; ob.pause(); ob.removeAttribute("src"); ob.load(); if (ob.parentNode) ob.parentNode.removeChild(ob); }   /* a fresh backup with the fresh element, unlocked by this tap */
      if (X.on) { lvRoute(); lvBackup(); X.cur = null; var c = at(cur(), Date.now()); if (c) start(c, true); else resume(); }
    }
    document.addEventListener("pointerdown", function () { if (X.on && lvS.ac && lvS.ac.state !== "running" && !document.hidden) lvWake(); }, true);   /* any tap may give the sound back */
    function switchTo(id) {   /* change channel: a moment of static, then whatever that channel is showing now */
      if (!chById(id)) return; var didMove = id !== cfg.ch; if (didMove) X.last = cfg.ch; cfg.ch = id; X.rm = 0; X.ren = 0; save();
      if (X.on && didMove) { X.tuneAt = Date.now(); X.note = ""; X.cur = null; if (X.v) X.v.pause(); burst(); resume(); }
      draw2();
    }
    function step(d) { var n = cfg.chans.length; if (n < 2) return; var i = cfg.chans.indexOf(cur()); switchTo(cfg.chans[(i + d + n) % n].id); }
    function burst() {   /* a moment of static as the set warms up or changes channel */
      try { var C = window.AudioContext || window.webkitAudioContext; if (!C || cfg.muted) return; var a = new C(), b = a.createBuffer(1, a.sampleRate * .6, a.sampleRate), d = b.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        var s = a.createBufferSource(), g = a.createGain(); g.gain.value = .12; s.buffer = b; s.connect(g); g.connect(a.destination); s.start(); setTimeout(function () { a.close(); }, 1200); } catch (e) { /* no static, no matter */ }
    }

    /* ---- the screen ---- */
    function head() { var c = cur(); if (!X.prog) return { e: "RESOURCES · HOLODECK · ARCH", t: "HOLODECK" }; return { e: "RESOURCES · HOLODECK · VISUAL" + (c ? " · CH " + numAt(c) + " · " + c.name.toUpperCase() : "") + (X.on ? " · ON AIR" : ""), t: "HOLODECK" }; }
    function panel(c, title, metaInfo, inner) { return '<section class="hd-panel" style="--c: var(--' + c + ')">' + phead(title, metaInfo, c) + inner + "</section>"; }
    function mmssOf(s) { s = Math.max(0, Math.round(s)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ":" + p2(m) : m) + ":" + p2(s % 60); }
    function hmLong(s) { var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.round(s % 3600 / 60); return s < 60 ? Math.round(s) + " s" : d ? d + " d " + h + " h" : h ? h + " h " + p2(m) + " m" : m + " min"; }
    function kinds(list) { var k = {}; list.forEach(function (it) { var e = ext(it.f.name).toUpperCase(); k[e] = (k[e] || 0) + 1; }); return Object.keys(k).map(function (e) { return k[e] + " " + e; }).join(", "); }
    function count(s, n) { return s.series ? s.seasons + (s.seasons === 1 ? " season" : " seasons") + (s.specials ? " + specials" : "") + " · " + n + (n === 1 ? " episode" : " episodes") : n + (n === 1 ? " video" : " videos"); }
    function chanInfo(c) {
      var s = F[c.dir]; if (!s || !s.play) return esc(s && s.err ? s.err : "Reading the folder…");
      var n = s.play.length, L = loopLen(c), m = s.play.filter(function (it) { return !unknown(it); }).length, d = new Date(c.premiere);
      if (s.shows) {
        var named = s.shows.filter(function (x) { return x.name; }), lz = s.shows.filter(function (x) { return !x.name; })[0], ne = named.reduce(function (t, x) { return t + x.items.length; }, 0);
        return (named.length ? named.length + (named.length === 1 ? " show · " : " shows · ") + ne + (ne === 1 ? " episode" : " episodes") : "") + (lz ? (named.length ? " + " : "") + lz.items.length + (lz.items.length === 1 ? " video" : " videos") : "") + (!named.length && !lz ? "0 shows · 0 episodes" : "") +
          (s.skip.length ? ' · <span class="pill warn">' + kinds(s.skip) + " skipped</span>" : "") + " · network · a new " + (named.length ? "lineup" : "shuffle") + " every day at 6:00" + (m < n ? " · lengths " + m + " of " + n : "") + brkInfo(c);
      }
      var nb = s.play.filter(unreadable).length, nl = s.play.filter(loudBad).length;
      return count(s, n) + (s.skip.length ? ' · <span class="pill warn">' + kinds(s.skip) + " skipped</span>" : "") + (nl ? ' · <span class="pill warn">' + nl + " unreadable</span>" : "") + " · in order · " + (L ? hmLong(L) + " round" : nb === n ? "nothing playable yet" : "measuring " + m + " of " + n) + brkInfo(c) +
        " · on air since " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + hm(d);
    }
    function tuneSub() {
      var c = cur(), s = c && F[c.dir];
      if (at(c, Date.now())) return "CHANNEL " + numAt(c) + " · " + c.name.toUpperCase();
      if (!c) return "ADD A CHANNEL BELOW";
      if (!s || !s.play) return s && s.err ? "CAN'T REACH THE FOLDER" : "READING THE FOLDER…";
      if (!s.play.length) return "NO VIDEOS HERE THE IPAD CAN PLAY";
      if (breaks(c) === false) return "READING THE COMMERCIALS…";
      var bad = s.play.filter(unreadable);
      if (bad.length === s.play.length) {   /* every one measured and none readable: say why rather than "measuring" for ever */
        var fmt = bad.filter(function (it) { return rec(it).why === "format"; }).length;
        return fmt === bad.length ? "NONE OF THESE " + bad.length + " VIDEOS PLAY ON THIS IPAD" : "COULDN'T READ THESE VIDEOS FROM THE NAS · TRYING AGAIN IN A FEW MINUTES";
      }
      return "MEASURING " + s.play.filter(function (it) { return !unknown(it); }).length + " OF " + s.play.length + " VIDEOS…";
    }
    /* ---- the remote (2.57): a keypad where the dial was ---- */
    function padHtml() {   /* the green display: the number being typed and its channel, else the channel on */
      var t = X.typed, n = cfg.chans.length, c = t ? cfg.chans[+t - 1] : cur(), more = t.length === 1 && n >= +t * 10;
      if (X.kmsg) return '<b class="hd-chnum">' + esc(X.kmsg) + "</b><small>" + (n ? "CHANNELS 1 TO " + n : "NO CHANNELS YET") + "</small>";
      if (t) return '<b class="hd-chnum">CH ' + t + (more ? "_" : "") + "</b><small>" + (c ? esc(c.name.toUpperCase()) + " · ENTER OR WAIT" : "…") + "</small>";
      return '<b class="hd-chnum">CH ' + (c ? numAt(c) : "–") + "</b><small>" + esc(c ? c.name.toUpperCase() : "NO CHANNELS YET") + "</small>";
    }
    function padShow() {   /* the display and the number on the screen, in place: no redraw while typing */
      var e = $("hdLcd"); if (e) e.innerHTML = padHtml();
      var o = $("hdOsd"); if (o) { o.textContent = X.typed ? X.typed + (X.typed.length === 1 && cfg.chans.length >= +X.typed * 10 ? "_" : "") : ""; o.hidden = !X.typed; }
    }
    function padKey(k) {   /* a digit waits 1.5 s for ENTER or a second digit; two digits tune at once */
      clearTimeout(X.kt); X.kmsg = "";
      if (k === "last") { X.typed = ""; if (X.last && chById(X.last)) switchTo(X.last); else padShow(); return; }
      if (k === "ok") { padGo(); return; }
      X.typed = (X.typed + k).slice(-2);
      if (X.typed.length === 2) { padGo(); return; }
      padShow(); X.kt = setTimeout(padGo, 1500);
    }
    function padGo() {   /* tune to the number typed; a number with no channel says so, then clears */
      clearTimeout(X.kt); var t = X.typed; X.typed = ""; if (!t) { padShow(); return; }
      var c = cfg.chans[+t - 1];
      if (!c) { X.kmsg = "NO CHANNEL " + +t; padShow(); X.kt = setTimeout(function () { X.kmsg = ""; padShow(); }, 1500); return; }
      if (c.id !== cfg.ch) switchTo(c.id); else padShow();
    }
    function rail() {   /* 2.53, layout C: an LCARS rail beside the screen: the look, the keypad (2.57), the view, the sleep timer */
      var n = cfg.chans.length, to = cfg.look === "crt" ? "clean" : "crt", back = !!(X.last && chById(X.last));
      return '<div class="hd-rail">' +
        '<button type="button" class="hd-look" data-hdlook="' + to + '" aria-label="Look: ' + cfg.look.toUpperCase() + ". Tap for " + to.toUpperCase() + '"><small>LOOK</small><span>' + cfg.look.toUpperCase() + "</span></button>" +
        '<div class="hd-pad"><div class="hd-lcd" id="hdLcd" aria-live="polite">' + padHtml() + '</div><div class="hd-keys" role="group" aria-label="Channel keypad">' +
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "last", "0", "ok"].map(function (k) {
          var offset = !n || (k === "last" && !back);
          return '<button type="button" class="hd-key' + (k === "ok" ? " ok" : k === "last" ? " fn" : "") + '" data-hdkey="' + k + '"' + (k === "last" ? ' aria-label="Last channel"' : k === "ok" ? ' aria-label="Enter"' : "") + (offset ? " disabled" : "") + ">" + (k === "last" ? "↺ LAST" : k === "ok" ? "ENTER" : k) + "</button>";
        }).join("") + "</div></div>" +
        '<span class="hd-rpair"><button type="button" class="hd-rb" data-hd="up"' + (n > 1 ? "" : " disabled") + '>CH ▲</button><button type="button" class="hd-rb" data-hd="down"' + (n > 1 ? "" : " disabled") + ">CH ▼</button></span>" +
        '<button type="button" class="hd-rv" data-hd="full"' + (X.on ? "" : " disabled") + ">FULL SCREEN</button>" +
        '<button type="button" class="hd-lvb' + (cfg.level ? " set" : "") + (cfg.level && lvS.paused && X.on ? " paused" : "") + '" data-hd="level" aria-pressed="' + !!cfg.level + '" aria-label="Level the volume between shows: ' + (cfg.level ? "on" : "off") + '"><small>LEVEL</small><span id="hdLvl">' + lvText() + "</span></button>" +
        '<button type="button" class="hd-sleepb' + (X.sleep ? " set" : "") + '" data-hd="sleep" aria-haspopup="dialog" aria-expanded="' + X.sleepOpen + '"><small>SLEEP</small><span>' + (typeof X.sleep === "number" ? '<span id="hdSleepLeft">' + sleepLeft() + "</span> MIN LEFT" : X.sleep === "end" ? "END OF SHOW" : "OFF") + "</span></button>" +
        "</div>";
    }

    /* ---- the guide (2.57): every channel, now and the next two hours, like the TV Guide channel ---- */
    var TG_SPAN = 2 * 3600e3, TG_HALF = 1800e3, TG_SHORT = 600, TG_CAP = 3000;
    function tgFrom(now) { var d = new Date(now); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); return d.getTime() - TG_HALF + X.gw * 3600e3; }   /* from the half hour before the one now (2.57.1: what just began stays in view), then ◀ ▶ an hour at a time */
    function tgName(list) {   /* a block of short videos: their show if they share one, else what they are */
      var sh = list[0].it.show; if (sh && list.every(function (u) { return u.it.show === sh; })) return sh;
      if (list.every(function (u) { return !u.it.show && u.it.s == null && !u.it.sp; })) return "MUSIC VIDEOS";
      return tgEps(list) ? "EPISODES" : "SHORT VIDEOS";
    }
    function tgEps(list) { return list.every(function (u) { return u.it.s != null || u.it.sp || (u.it.show && (u.it.ep != null || u.it.e != null)); }); }
    function tgWhy(c) { var s = F[c.dir]; return !s || (!s.play && !s.err) ? "READING THE FOLDER…" : !s.play ? "CAN'T REACH THE FOLDER" : !s.play.length ? "NO VIDEOS THE IPAD CAN PLAY" : breaks(c) === false ? "READING THE COMMERCIALS…" : "MEASURING…"; }
    function tgBlocks(c, W0, W1) {   /* blocks from W0 to W1: a programme each, short videos together per half hour, a break folded into the show before it */
      var out = [], q = null, carry = 0, k = 0, u = at(c, net(c) ? W0 : Math.max(W0, c.premiere)), capped = false;
      while (u) {
        if (++k > TG_CAP) { capped = true; break; }
        if (u.brk && !q && !carry) {   /* 2.70: the window opens in a break: it belongs to the show before it (off to the left, ◂), not to the next one, which has its own */
          var pv = at(c, u.brk.startMs - 1);
          if (pv && !pv.brk && pv.startMs < u.brk.startMs) q = { a: pv.startMs, b: endMs(u), short: pv.dur < TG_SHORT, slot: Math.floor((pv.startMs - W0) / TG_HALF), list: [pv] };
        }
        if (u.brk) { if (q) q.b = endMs(u); else carry = carry || u.brk.startMs; var nb = pastBreak(u); if (!nb || nb.startMs <= u.startMs) { u = null; break; } u = nb; continue; }
        var st = u.startMs; if (st >= W1) break;
        var en = st + u.dur * 1000, short = u.dur < TG_SHORT, slotAt = Math.floor((st - W0) / TG_HALF);
        if (short && q && q.short && q.slot === slotAt) { q.list.push(u); q.b = en; }
        else { if (q) out.push(q); q = { a: carry || st, b: en, short: short, slot: slotAt, list: [u] }; carry = 0; }
        var n = after(u); if (!n || n.startMs <= st) { u = null; break; } u = n;
      }
      if (q) out.push(q);
      var last = out.length ? out[out.length - 1].b : W0;
      if (capped && out.length) out[out.length - 1].b = Math.max(last, W1);
      else if (!u && last < W1) out.push({ a: last, b: W1, wait: true });
      return out;
    }
    function tgRow(c, W0, W1, now) {
      var on = c.id === cfg.ch, pct = function (ms) { return ((ms - W0) / TG_SPAN * 100).toFixed(3); };
      var cells = tgBlocks(c, W0, W1).map(function (q) {
        var a = Math.max(q.a, W0), b = Math.min(q.b, W1); if (b <= a) return "";
        var pos = 'style="left: ' + pct(a) + "%; width: calc(" + ((b - a) / TG_SPAN * 100).toFixed(3) + '% - 4px)"';
        if (q.wait) return '<button type="button" class="hd-gc wait" data-hdg="' + c.id + '" ' + pos + "><b>" + esc(q.a === W0 ? tgWhy(c) : "MEASURING…") + "</b></button>";
        var one = !q.short || q.list.length === 1, l = label(q.list[0].it), live = now >= q.a && now < q.b;
        var shown = live ? q.list.filter(function (u) { return u.startMs + u.dur * 1000 > now; }) : q.list;
        var tip = hm(new Date(q.a)) + "–" + hm(new Date(q.b)) + "\n" + shown.slice(0, 12).map(function (u) { return line(label(u.it)); }).join("\n") + (shown.length > 12 ? "\nand " + (shown.length - 12) + " more" : "");
        return '<button type="button" class="hd-gc' + (live ? " live" : "") + (q.b <= now ? " past" : "") + '" data-hdg="' + c.id + '" ' + pos + ' title="' + esc(tip) + '"><b>' + (q.a < W0 ? "◂ " : "") + esc(one ? l.a : tgName(q.list)) + "</b><small>" + esc(one ? l.t || (q.short ? "" : mmssOf((q.list[0].dur))) : q.list.length + (tgEps(q.list) ? " episodes" : " videos")) + (q.b > W1 ? " ▸" : "") + "</small></button>";
      }).join("");
      return '<div class="hd-grow" aria-current="' + on + '"><button type="button" class="hd-gch" data-hdg="' + c.id + '" aria-label="Channel ' + numAt(c) + ", " + esc(c.name) + (on ? ", on screen" : ", tune in") + '"><b>' + numAt(c) + '</b><span><span class="hd-gnm">' + esc(c.name) + "</span><small>" + (net(c) ? "NETWORK" : "IN ORDER") + (c.breaks && cfg.ads ? " · BREAKS" : "") + '</small></span></button><div class="hd-gtl">' + cells + "</div></div>";
    }
    function tgHtml(now) {
      var W0 = tgFrom(now), W1 = W0 + TG_SPAN;
      if (!cfg.chans.length) return '<p class="hd-gempty">The guide fills in once there\'s a channel: add one under CHANNELS.</p>';
      return '<div class="hd-gh"><span class="hd-gday">' + esc(new Date(W0).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()) + '</span><div class="hd-gtimes">' +
        [0, 1, 2, 3].map(function (i) { return '<span style="left: ' + i * 25 + '%">' + hm(new Date(W0 + i * TG_HALF)) + "</span>"; }).join("") + "</div></div>" +
        (function (rows) {   /* 2.70: with AUTO-SCROLL on, the rows again below, so channel 1 follows the last for ever (tgLoop); out of the way of VoiceOver and Tab */
          return rows + (cfg.gauto ? '<div class="hd-gloop" id="hdGLoop" aria-hidden="true">' + rows.replace(/<button type="button"/g, '<button type="button" tabindex="-1"') + "</div>" : "");
        })(cfg.chans.map(function (c) { return tgRow(c, W0, W1, now); }).join("")) + '<span class="hd-gnow" id="hdGNow" aria-hidden="true"></span>';
    }
    function tgKey(now) { return [tgFrom(now), cfg.ch, X.lv, A.at || 0, A.dir, cfg.ads, cfg.chans.map(function (c) { var s = F[c.dir]; return [c.id, c.name, c.style, c.breaks, c.premiere, s ? (s.at || 0) + (s.err ? "e" : "") : "-"].join(","); }).join(";")].join("|"); }
    function tgPaint(force) {   /* worked out again every 15 ticks, or two ticks after anything it shows changes; redrawn only when it differs, so taps land; the line for now moves each second */
      var g = $("hdTg"); if (!g) return; var now = Date.now(), k = tgKey(now); X.gAt++;   /* counted in ticks, so a paused clock can't hold it */
      if (force || X.gAt >= 15 || (k !== X.gk && X.gAt >= 2)) {
        X.gAt = 0; X.gk = k; var h = tgHtml(now);
        if (h !== X.gh) { var b = $("hdTgBody"), st = b ? b.scrollTop : 0, sl = b ? b.scrollLeft : 0, py = window.scrollY || 0, pc = $("content").scrollTop; g.innerHTML = h; X.gh = h; if (b) { b.scrollTop = st; b.scrollLeft = sl; } keepPlace(py, pc); }   /* the page stays put too (2.62.1) */
      }
      var W0 = tgFrom(now), nl = $("hdGNow"), p = (now - W0) / TG_SPAN; if (nl) { nl.hidden = p < 0 || p > 1; nl.style.setProperty("--p", Math.max(0, Math.min(1, p)).toFixed(4)); }
      var w = $("hdTgWhen"), t = X.gw ? "FROM " + hm(new Date(W0)) : "NOW · " + hm(new Date(now)); if (w && w.textContent !== t) w.textContent = t;
    }
    function tgShell() {
      return '<section class="hd-tg" aria-label="Guide"><div class="hd-tgbar"><b>GUIDE</b><span id="hdTgWhen"></span><span class="hd-tgsp"></span>' +
        (cfg.chans.length > 5 ? '<button type="button" class="hd-tgb" data-hd="gauto" aria-pressed="' + !!cfg.gauto + '">AUTO-SCROLL</button>' : "") +
        '<button type="button" class="hd-tgb" id="hdGBack" data-hd="gback" aria-label="An hour earlier"' + (X.gw ? "" : " disabled") + '>◀</button><button type="button" class="hd-tgb" id="hdGNext" data-hd="gnext" aria-label="An hour later"' + (X.gw < 6 ? "" : " disabled") + ">▶</button></div>" +
        '<div class="hd-tgbody" id="hdTgBody"><div class="hd-tgin" id="hdTg"></div></div></section>';
    }
    function tgLoop() {   /* 2.70: the height of one set of rows when the repeat is in use (more rows than fit), else 0; the repeat is hidden when they fit */
      var b = $("hdTgBody"), cp = $("hdGLoop"), r0 = b && b.querySelector(".hd-tgin > .hd-grow"); if (!b || !cp || !r0) return 0;
      var h = cp.offsetTop - r0.offsetTop, fits = h + r0.offsetTop <= b.clientHeight + 2;
      if (cp.hidden !== fits) cp.hidden = fits;
      return fits ? 0 : h;
    }
    function tgAuto() {   /* AUTO-SCROLL: the rows roll up slowly, like the guide channel; a touch holds it for 30 s; channel 1 follows the last without a pause (2.70) */
      clearInterval(X.asT); X.asT = 0; if (!cfg.gauto) return;
      X.asT = setInterval(function () {
        var b = $("hdTgBody"); if (!b || state.screen !== "holodeck" || !cfg.gauto) { clearInterval(X.asT); X.asT = 0; return; }
        var lh = tgLoop();
        if (lh) { if (document.hidden || Date.now() < X.asHold) return; b.scrollTop += 1; if (b.scrollTop >= lh) b.scrollTop -= lh; return; }
        if (document.hidden || Date.now() < X.asHold || b.scrollHeight <= b.clientHeight + 2) return;
        if (X.asWrap) { X.asWrap = false; b.scrollTop = 0; X.asHold = Date.now() + 3000; return; }
        if (b.scrollTop + b.clientHeight >= b.scrollHeight - 1) { X.asWrap = true; X.asHold = Date.now() + 3000; return; }
        b.scrollTop += 1;
      }, 60);
    }
    function tgBind() {
      var b = $("hdTgBody"); if (!b) return; ["pointerdown", "wheel", "touchstart"].forEach(function (ev) { b.addEventListener(ev, function () { X.asHold = Date.now() + 30000; X.asWrap = false; }, { passive: true }); });
      b.addEventListener("scroll", function () { if (!cfg.gauto) return; var lh = tgLoop(); if (lh && b.scrollTop >= lh) b.scrollTop -= lh; }, { passive: true });   /* scrolled by hand past the last channel: into channel 1 (2.70) */
    }
    function foldSum() {   /* the channels folded: how many, the commercials, breaks, and anything that needs a look */
      var n = cfg.chans.length, bk = cfg.chans.filter(function (x) { return x.breaks; }).length;
      var look = cfg.chans.filter(function (x) { var s = F[x.dir]; return s && ((s.err && !s.play) || (s.play && s.play.some(loudBad))); }).length + (cfg.ads && A.dir === cfg.ads && A.err && !A.play ? 1 : 0);
      return n + (n === 1 ? " CHANNEL" : " CHANNELS") + " · " + (cfg.ads ? "COMMERCIALS SET" : "NO COMMERCIALS") + (bk ? " · " + bk + " WITH BREAKS" : "") + (look ? ' · <span class="hd-att">' + look + (look === 1 ? " NEEDS" : " NEED") + " A LOOK</span>" : "");
    }
    /* ---- the arch: pick a program ---- */
    function archBtn() { return '<div class="hd-archrow"><button type="button" class="chip hd-archb" data-hdgo="arch">◇ ARCH</button></div>'; }
    function archHtml() {
      var now = Date.now(), lines = [], pn = !!pl.path && !pl.closed, ks, root = nasConf() && nas.lists["/"];
      cfg.chans.forEach(function (x) { if (nasConf()) load(x, false); }); loadAds(false);
      if (nasConf() && !root && !nas.inflight["/"]) nasList("/").then(function () { if (state.screen === "holodeck" && !X.prog) draw2(); }, function () { /* the line says so */ });
      var vis = cfg.chans.slice(0, 3).map(function (x) { var o = at(x, now); return "<span><em>CH " + numAt(x) + "</em><b>" + esc(o ? x.name + " · " + line(label(o.it)) : x.name) + "</b></span>"; }).join("") || '<span><em>NONE YET</em><b>Add a channel inside</b></span>';
      if (pn) lines.push("<span><em>" + (pl.el && !pl.el.paused ? "PLAYING" : "PAUSED") + "</em><b>" + esc(dispName(pl.path)) + "</b></span>");
      ks = Object.keys(plays).filter(function (k) { var r = plays[k]; return !r.done && r.p > 30 && k !== pl.path; }).sort(function (a, b) { return plays[b].at - plays[a].at; });
      if (ks.length) lines.push("<span><em>CONTINUE</em><b>" + esc(dispName(ks[0]) + " · " + baseName(parentOf(ks[0]))) + "</b></span>");
      if (root) lines.push("<span><em>FOLDERS</em><b>" + esc(root.items.filter(function (x) { return x.dir && !isHidden(x.path) && !/^video$/i.test(x.name); }).map(function (x) { return x.name; }).join(" · ") || "None shared yet") + "</b></span>");
      if (!nasConf()) lines.push("<span><em>SETUP</em><b>NAS RELAY in Systems</b></span>");
      var playing = pn && pl.el && !pl.el.paused;
      return '<div class="hd-arch' + (X.fade ? " leaving" : "") + '"><div class="hd-grid" aria-hidden="true"><i class="hd-wall"></i><i class="hd-floor"></i><i class="hd-fade"></i></div><div class="hd-px">' +
        '<div class="hd-atop"><span class="cap"></span><span class="rule"></span><h2>ENTER PROGRAM</h2></div><div class="hd-progs">' +
        '<button type="button" class="hd-pg" data-hdprog="visual" style="--c: var(--chrome-d)"><span class="no">PROGRAM 01</span><span class="nm">VISUAL</span><span class="kind">TELEVISION · ' + (cfg.chans.length ? cfg.chans.length + (cfg.chans.length === 1 ? " CHANNEL" : " CHANNELS") + " ALWAYS ON AIR" : "CHANNELS FROM NAS FOLDERS") + '</span><span class="lu">' + vis + '</span><span class="go">ENTER ▸ ' + (cur() ? "CH " + numAt(cur()) : "ADD A CHANNEL") + "</span></button>" +
        '<button type="button" class="hd-pg" data-hdprog="audio" style="--c: var(--personal)"><span class="no">PROGRAM 02</span><span class="nm">AUDIO</span><span class="kind">RADIO · YOUR NAS FOLDERS</span><span class="lu">' + lines.join("") + '</span><span class="go">ENTER ▸ ' + (playing ? "THE PLAYER" : "THE FOLDERS") + "</span></button></div>" +
        '<div class="hd-voice">SELECT A PROGRAM</div></div></div>';
    }
    function arch() { X.prog = null; X.fade = 0; X.pick = false; }
    function enter(p) {   /* from the arch: the panel fades, then the program */
      var go2 = function () {
        X.fade = 0;
        if (p === "audio") { var playing = pl.path && !pl.closed && pl.el && !pl.el.paused; nas.view = playing ? "now" : "home"; if (!playing) { nas.dir = "/"; nas.q = ""; } X.prog = null; go("storage"); if (nasConf()) nasLoad("/", true); return; }   /* entering AUDIO reads the shares afresh */
        X.prog = "visual"; if (state.screen === "holodeck") { draw2(); $("content").scrollTop = 0; }
      };
      if (calm() || state.screen !== "holodeck") { go2(); return; }
      X.fade = 1; draw2(); setTimeout(go2, 380);
    }
    /* ---- the sleep timer (2.49), as AUDIO's: minutes, or the end of what's on ---- */
    var SLEEPS = [["off", "OFF"], ["15", "15 MIN"], ["30", "30 MIN"], ["60", "1 HOUR"], ["120", "2 HOURS"], ["end", "END OF THIS SHOW"]];
    function setSleepAt(v) {
      clearInterval(X.sleepT); X.sleepT = 0;
      X.sleep = v === "off" ? null : v === "end" ? "end" : +v;
      X.sleepAt = typeof X.sleep === "number" ? Date.now() + X.sleep * 60000 : 0;
      if (typeof X.sleep === "number") X.sleepT = setInterval(checkSleep, 5000);   /* keeps time in full screen too */
      if (X.sleep) toast(X.sleep === "end" ? "The TV goes off at the end of this show" : "The TV goes off in " + (X.sleep >= 60 ? X.sleep / 60 + (X.sleep === 60 ? " hour" : " hours") : X.sleep + " minutes"));
    }
    function checkSleep() { if (typeof X.sleep === "number" && Date.now() >= X.sleepAt) sleepOff("Sleep timer: the TV is off"); }
    function sleepOff(msg) {
      clearInterval(X.sleepT); X.sleepT = 0; X.sleep = null;
      if (!X.on) return;
      off(); sb.slept = true; toast(msg);   /* Standby may take over now (see holoHold) */
      if (state.screen === "holodeck") draw2();
    }
    function sleepLeft() { return Math.max(1, Math.ceil((X.sleepAt - Date.now()) / 60000)); }
    function sleepWin() {   /* 2.53: the sleep timer in a window of its own, large choices for a dark room */
      if (!X.sleepOpen) return "";
      return '<div class="hd-modal"><button type="button" class="hd-scrim" data-hd="sleepclose" aria-label="Close the sleep timer"></button><div class="hd-win" role="dialog" aria-modal="true" aria-labelledby="hdSleepT">' +
        '<div class="phead" style="--c: var(--chrome-d)"><span class="cap"></span><h2 id="hdSleepT">SLEEP TIMER</h2></div><p class="muted">The TV turns off by itself, in full screen too.</p>' +
        '<div class="hd-sleepgrid" role="group" aria-label="Sleep timer">' + SLEEPS.map(function (o) {
          var on = o[0] === "off" ? !X.sleep : String(X.sleep) === o[0];
          return '<button type="button" class="hd-sl" data-hdsleep="' + o[0] + '" aria-pressed="' + on + '">' + o[1] + (on && typeof X.sleep === "number" ? '<small>· <span id="hdSleepLeft2">' + sleepLeft() + "</span> LEFT</small>" : "") + "</button>";
        }).join("") + '</div><div class="btnrow hd-winend"><button type="button" class="chip sm" data-hd="sleepclose">CLOSE</button></div></div></div>';
    }
    function quiet() { if (!X.on) return; off(); X.note = "The TV went off while audio plays."; if (state.screen === "holodeck") draw2(); }
    function draw2() {
      if (X.v && X.v.parentNode !== X.keep) X.keep.appendChild(X.v);   /* out of the way while the page is redrawn, so it keeps playing */
      /* 2.62.1 (Timothy: CH ▲▼ moved the TV up and down): replacing the page let the browser lay it out half built
         and drop the scroll to the top (in portrait the page itself scrolls, in landscape #content), so where the page
         was is put back once it's whole */
      var sy = window.scrollY || 0, scv = $("content").scrollTop;
      if (!X.prog) { $("content").innerHTML = archHtml(); clearInterval(X.timer); X.timer = 0; paint(); return; }
      if (!nasConf()) { $("content").innerHTML = '<div class="hd">' + archBtn() + panel("chrome-d", "HOLODECK", "SETUP", stubBox("HOLODECK plays video from the NAS through its relay. Set it up first in <b>SYSTEMS → NAS RELAY</b>.")) + "</div>"; return; }
      var c = cur(), k = numAt(c), ready = !!at(c, Date.now()), s = c && F[c.dir];
      if (!c) X.pick = true;
      cfg.chans.forEach(function (x) { load(x, false); }); loadAds(false);
      var tv = '<div class="hd-stage"><div class="hd-main"><div class="hd-tv' + (cfg.look === "crt" ? " crt" : "") + (X.on ? " on" : "") + (X.on && X.big ? " big" : "") + '"><div class="hd-screen" id="hdScreen"><canvas class="hd-static" id="hdStatic" aria-hidden="true"></canvas><span class="hd-bug">HOLODECK' + (k ? " " + k : "") + '</span><span class="hd-osd" id="hdOsd" aria-hidden="true" hidden></span>' +
        (X.on ? '<button type="button" class="hd-snd" id="hdSnd" data-hd="sound"' + (lvLost() ? "" : " hidden") + '>TAP FOR SOUND</button><button type="button" class="hd-fsx" data-hd="fullexit" aria-label="Leave full screen">✕ EXIT FULL SCREEN</button><span class="hd-live" id="hdLive"></span><div class="hd-credit" id="hdCredit" hidden></div><div class="hd-upnext" id="hdUpNext" hidden><small>UP NEXT</small><b></b></div>' : '<button type="button" class="hd-tune" id="hdTune" data-hd="tune"' + (ready ? "" : " disabled") + '><span>⏻ TUNE IN</span><small id="hdTuneSub">' + esc(tuneSub()) + "</small></button>") + "</div></div>" +
        '<div class="hd-bar"><button type="button" class="chip" id="hdPower" data-hd="tune" aria-pressed="' + X.on + '" style="--c: var(--chrome-d)"' + (ready || X.on ? "" : " disabled") + ">" + (X.on ? "⏻ OFF" : "⏻ TUNE IN") + "</button>" +
        '<button type="button" class="hd-mute" data-hd="mute" aria-pressed="' + cfg.muted + '" aria-label="' + (cfg.muted ? "Muted: tap for sound" : "Mute") + '"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/>' + (cfg.muted ? '<path d="m22 9-6 6M16 9l6 6"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>') + "</svg></button>" +
        '<div class="hd-np" id="hdNow">' + nowPanel() + "</div></div>" +
        (X.note ? '<p class="muted">' + esc(X.note) + "</p>" : "") + "</div>" + rail() + "</div>";
      var rows = cfg.chans.map(function (x, i) {
        var on = x.id === cfg.ch, arm = X.rm === x.id, open = !!X.open[x.id] || X.ren === x.id || arm;
        return '<div class="hd-chan' + (open ? " open" : "") + '" aria-current="' + on + '"><div class="hd-chrow"><span class="hd-n">' + (i + 1) + '</span><span class="hd-cm"><span class="hd-nm"><b>' + esc(x.name) + "</b>" + (on ? '<em class="hd-here">ON SCREEN</em>' : "") + '</span><small class="hd-sum" id="hdSum' + x.id + '">' + chanSum(x) + "</small></span>" +
          '<button type="button" class="hd-pm" data-hdopen="' + x.id + '" aria-expanded="' + open + '" aria-label="' + (open ? "Hide " : "Show ") + esc(x.name) + ' details">' + (open ? "−" : "+") + "</button></div>" +
          '<div class="hd-more"' + (open ? "" : " hidden") + '><small class="muted">' + esc(x.dir) + '</small><small id="hdInfo' + x.id + '">' + chanInfo(x) + "</small>" + badList(x) +
          (X.ren === x.id ? '<span class="hd-ren"><input id="hdRename" maxlength="40" autocomplete="off" value="' + esc(x.name) + '" aria-label="Channel name"><button type="button" class="chip sm" data-hd="rensave">SAVE</button></span>' : "") +
          '<span class="hd-acts"><span class="hd-style" role="group" aria-label="Style">' + [["order", "IN ORDER"], ["network", "NETWORK"]].map(function (st) { return '<button type="button" class="chip sm" data-hdstyle="' + x.id + "|" + st[0] + '" aria-pressed="' + ((x.style || "order") === st[0]) + '">' + st[1] + "</button>"; }).join("") + "</span>" + '<button type="button" class="chip sm" data-hdbrk="' + x.id + '" aria-pressed="' + !!x.breaks + '"' + (cfg.ads ? "" : " disabled") + ">BREAKS</button>" + (on ? "" : '<button type="button" class="chip sm" data-hdch="' + x.id + '">WATCH</button>') + '<button type="button" class="chip sm" data-hdren="' + x.id + '" aria-expanded="' + (X.ren === x.id) + '">RENAME</button>' +
          '<button type="button" class="chip sm" data-hdrm="' + x.id + '"' + (arm ? ' style="--c: var(--bad)"' : "") + ">" + (arm ? "REMOVE IT" : "REMOVE") + "</button></span></div></div>";
      }).join("");
      var anyOpen = Object.keys(X.open).some(function (id) { return X.open[id]; });
      var src = (rows ? '<div class="hd-chans">' + rows + "</div>" : '<p class="muted">Choose the folder for channel 1: a folder of videos, or a series with one folder per season.</p>') +
        (s && s.skip && s.skip.length ? '<p class="muted">The iPad can\'t play ' + esc(kinds(s.skip).replace(/\d+ /g, "")) + " files, so the channel skips them. README → HOLODECK has a one-time fix on the NAS.</p>" : "") +
        adsRow() + (X.pick && X.pickFor === "ads" ? picker() : "") +
        '<div class="btnrow"><button type="button" class="chip sm" data-hd="pick" aria-expanded="' + X.pick + '">+ ADD CHANNEL</button>' + (rows ? '<button type="button" class="chip sm" data-hd="rescan">LOOK AGAIN</button>' : "") + (anyOpen ? '<button type="button" class="chip sm" data-hd="collapse">COLLAPSE ALL</button>' : "") + "</div>" + (X.pick && X.pickFor !== "ads" ? picker() : "");
      var copen = !!cfg.copen || !cfg.chans.length || X.pick;   /* 2.57: folded to one line unless opened (remembered), empty, or choosing a folder */
      var fold = '<section class="hd-cfold' + (copen ? " open" : "") + '">' + (cfg.chans.length ? '<button type="button" class="hd-cfh" data-hd="chans" aria-expanded="' + copen + '"><i aria-hidden="true"></i><b>CHANNELS</b><small id="hdCSum">' + foldSum() + '</small><span class="hd-cfs" aria-hidden="true">' + (copen ? "−" : "+") + "</span></button>" : '<div class="hd-cfh"><i aria-hidden="true"></i><b>CHANNELS</b><small>ONE NAS FOLDER EACH · IN ORDER OR NETWORK</small></div>') + (copen ? '<div class="hd-cfb">' + src + "</div>" : "") + "</section>";
      var gb = $("hdTgBody"), gs = gb ? [gb.scrollTop, gb.scrollLeft] : null;
      $("content").innerHTML = '<div class="hd">' + archBtn() + tv + tgShell() + fold + sleepWin() + "</div>";
      var v = vid(); if (X.on) $("hdScreen").insertBefore(v, $("hdStatic"));
      X.gh = ""; tgPaint(true); gb = $("hdTgBody"); if (gb && gs) { gb.scrollTop = gs[0]; gb.scrollLeft = gs[1]; }
      tgBind(); tgAuto(); padShow(); paint();
      keepPlace(sy, scv);
      clearInterval(X.timer); X.timer = setInterval(function () { if (state.screen !== "holodeck") { clearInterval(X.timer); X.timer = 0; return; } tickOnce(); status(); if (!X.probing && ++X.pt % 60 === 0) probe(); }, 1000);   /* once a minute: anything due to be measured again (2.51.1) */
      if (X.on && Date.now() - X.tuneAt < 700) noise();
    }
    function keepPlace(sy, scv) {
      var ce = $("content");
      if (ce.scrollTop !== scv) ce.scrollTop = scv;
      if ((window.scrollY || 0) !== sy) window.scrollTo({ top: sy, left: 0, behavior: "instant" });
    }
    function pickInfo(dir) {   /* what USE THIS FOLDER would make, from one level of subfolders */
      var l = nas.lists[dir]; if (!l) return null;
      var subs = dir.split("/").filter(Boolean).length < 2 ? [] : l.items.filter(function (x) { return x.dir; }), kids = [];   /* a top share (/Video) is a shelf of channels, not one */
      var missing = subs.filter(function (d) { var k = nas.lists[d.path]; if (k) kids.push({ d: d, items: k.items }); return !k; });
      if (missing.length && !X.pw[dir]) X.pw[dir] = Promise.all(missing.map(function (d) { return nasList(d.path); }))   /* asked once for the lot, one redraw when all are in (2.47.1: a redraw per folder, each adding more, froze the app on 18 folders) */
        .then(function () { delete X.pw[dir]; if (state.screen === "holodeck" && X.pick && X.pickDir === dir) draw2(); }, function () { X.pw[dir] = "err"; if (state.screen === "holodeck" && X.pick && X.pickDir === dir) draw2(); });
      return missing.length ? { wait: true, err: X.pw[dir] === "err" } : arrange(l.items, kids);
    }
    function fresh(dir) {   /* the picker reads a folder afresh each time it's opened, so a folder just added to the relay shows (2.48.1: it kept the list from earlier in the session) */
      nasList(dir, true).then(function () { if (state.screen === "holodeck" && X.pick && X.pickDir === dir) draw2(); }, function (e) { X.pickErr = nasErrText(e); if (state.screen === "holodeck" && X.pick && X.pickDir === dir) draw2(); });
    }
    function picker() {
      var l = nas.lists[X.pickDir], parts = X.pickDir.split("/").filter(Boolean), crumbList = '<button type="button" class="chip sm" data-hdpick="/">NAS</button>' + parts.map(function (p, i) { return '<button type="button" class="chip sm" data-hdpick="/' + esc(parts.slice(0, i + 1).join("/")) + '">' + esc(p) + "</button>"; }).join("");
      if (!l) nasList(X.pickDir).then(function () { if (state.screen === "holodeck" && X.pick) draw2(); }, function (e) { X.pickErr = nasErrText(e); if (state.screen === "holodeck") draw2(); });
      var dirs = l ? l.items.filter(function (x) { return x.dir; }) : [], pi = pickInfo(X.pickDir), n = pi && !pi.wait ? pi.play.length + pi.skip.length : 0, used = X.pickFor === "ads" ? null : cfg.chans.filter(function (x) { return x.dir === X.pickDir; })[0];
      if (X.pickFor === "ads" && n) return pickBox(crumbList, l, dirs, X.pickDir === cfg.ads ? '<p class="muted">These are the commercials.</p>' : '<button type="button" class="btn" data-hd="useads">USE FOR COMMERCIALS · ' + n + (n === 1 ? " VIDEO" : " VIDEOS") + '</button><p class="muted">Any over 3 minutes are skipped.</p>');
      var act = used ? '<p class="muted">This folder is channel ' + numAt(used) + ".</p>" : n ? '<button type="button" class="btn" data-hd="use">USE THIS FOLDER · ' + count(pi, n).toUpperCase() + "</button>" + (pi.series ? '<p class="muted">Seasons play in number order and episodes by their number, then the specials and extras.</p>' : "") :
        '<p class="muted">' + (pi && pi.err ? "Couldn't read the folders inside. Go up a level and back in to try again." : pi && pi.wait ? "Reading the folders inside…" : dirs.length ? "Open a folder of videos, or a series with a folder per season." : "No videos here.") + "</p>";
      return pickBox(crumbList, l, dirs, act);
    }
    function pickBox(crumbList, l, dirs, act) { return '<div class="hd-pick"><div class="btnrow">' + crumbList + "</div>" + (l ? (dirs.length ? '<div class="hd-dirs">' + dirs.map(function (x) { return '<button type="button" class="hd-dir" data-hdpick="' + esc(x.path) + '"><i></i><span>' + esc(x.name) + "</span><span class=\"muted\">›</span></button>"; }).join("") + "</div>" : "") + act : '<p class="muted">' + esc(X.pickErr || "Reading…") + "</p>") + "</div>"; }
    function tickOnce() {
      if (state.screen !== "holodeck") return;
      tgPaint(false); lvShow();
      var np = $("hdNow"); if (np) np.innerHTML = nowPanel();
      var v = X.v, l = $("hdLive"), c = $("hdCredit");
      if (l && v) l.innerHTML = "<b>●</b> LIVE · " + mmssOf(v.currentTime || 0) + " IN";
      if (c && v && X.cur) { var lbl = label(X.cur.it), d = isFinite(v.duration) ? v.duration : X.cur.dur, t = v.currentTime || 0; c.innerHTML = lbl.long != null ? "<b>" + esc(X.cur.c.name) + "</b>" + esc(lbl.long) + (lbl.t ? "<br>" + esc(lbl.t) : "") : "<b>" + esc(lbl.a) + "</b>" + (lbl.t ? esc(lbl.t) : ""); c.hidden = !!X.cur.it.ad || !(t < 8 || d - t < 8 || Date.now() - X.tuneAt < 7000); }   /* no credit for a commercial */
      var u = $("hdUpNext");   /* NETWORK: UP NEXT in an episode's last 15 seconds, like a network bumper */
      if (u && v && X.cur) { var left = (isFinite(v.duration) ? v.duration : X.cur.dur) - (v.currentTime || 0), nx = net(X.cur.c) && !X.cur.it.ad && left < 15 && left > .3 ? after(X.cur) : null;
        if (nx && nx.brk) nx = pastBreak(nx);   /* before a break: what's on after it */
        if (nx) { var b = u.querySelector("b"), nm = !nx.it.show ? line(label(nx.it)).toUpperCase() : nx.it.show === X.cur.it.show ? "MORE " + nx.it.show.toUpperCase() : nx.it.show.toUpperCase(); if (b.textContent !== nm) b.textContent = nm; }
        u.hidden = !nx; }
    }
    function status() {   /* the parts that change as lengths come in, without redrawing the page */
      var ready = !!at(cur(), Date.now()), tb = $("hdTune"), ts = $("hdTuneSub"), pw = $("hdPower");
      if (tb) tb.disabled = !ready; if (ts) ts.textContent = tuneSub(); if (pw && !X.on) pw.disabled = !ready;
      cfg.chans.forEach(function (x) { var e = $("hdInfo" + x.id), h = chanInfo(x); if (e && e.innerHTML !== h) e.innerHTML = h; });
      var ai = $("hdAdsInfo"); if (ai) { var ah = adsInfo(); if (ai.innerHTML !== ah) ai.innerHTML = ah; }
      var cs = $("hdCSum"); if (cs) { var csh = foldSum(); if (cs.innerHTML !== csh) cs.innerHTML = csh; }
      var as = $("hdAdsSum"); if (as) { var sh = adsSum(); if (as.innerHTML !== sh) as.innerHTML = sh; }
      cfg.chans.forEach(function (x) { var e = $("hdSum" + x.id), h = chanSum(x); if (e && e.innerHTML !== h) e.innerHTML = h; });
      ["hdSleepLeft", "hdSleepLeft2"].forEach(function (id) { var sl = $(id); if (sl && typeof X.sleep === "number") sl.textContent = sleepLeft(); });
    }
    function paint() { if (state.screen !== "holodeck") return; var h = head(), e = $("eyebrow"); if (e) e.textContent = h.e; if (X.prog) { tickOnce(); status(); } }
    function noise() {   /* the static, drawn for half a second */
      var cv = $("hdStatic"); if (!cv) return; cv.classList.add("on"); var t0 = performance.now();
      var draw = function () { if (!cv.isConnected) return; var w = 160, h = 100; cv.width = w; cv.height = h; var x = cv.getContext("2d"), img = x.createImageData(w, h); for (var i = 0; i < img.data.length; i += 4) { var g = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255; } x.putImageData(img, 0, 0);
        if (performance.now() - t0 < 600 && !calm()) requestAnimationFrame(draw); else cv.classList.remove("on"); };
      draw();
    }
    function click(b) {
      var d = b.dataset;
      if (d.hd === undefined && d.hdpick === undefined && d.hdlook === undefined && d.hdch === undefined && d.hdrm === undefined && d.hdren === undefined && d.hdprog === undefined && d.hdgo === undefined && d.hdstyle === undefined && d.hdsleep === undefined && d.hdbrk === undefined && d.hdopen === undefined && d.hdkey === undefined && d.hdg === undefined) return false;
      if (d.hdkey) { padKey(d.hdkey); return true; }
      if (d.hdg) { var gid = +d.hdg; if (gid !== cfg.ch) switchTo(gid); if (!X.on && at(cur(), Date.now())) tune(); return true; }   /* the guide: a channel or a show tunes to that channel (2.57) */
      if (d.hd === "chans") { cfg.copen = !(cfg.copen || X.pick); if (!cfg.copen) { X.pick = false; X.pickFor = ""; } save(); draw2(); return true; }
      if (d.hd === "gback" || d.hd === "gnext") { X.gw = Math.max(0, Math.min(6, X.gw + (d.hd === "gnext" ? 1 : -1))); tgPaint(true); var gk0 = $("hdGBack"), gk1 = $("hdGNext"); if (gk0) gk0.disabled = !X.gw; if (gk1) gk1.disabled = X.gw >= 6; return true; }
      if (d.hd === "gauto") { cfg.gauto = !cfg.gauto; save(); b.setAttribute("aria-pressed", String(cfg.gauto)); X.asHold = 0; X.asWrap = false; tgPaint(true); tgLoop(); tgAuto(); return true; }
      if (d.hdsleep) { setSleepAt(d.hdsleep); X.sleepOpen = false; draw2(); var sb0 = document.querySelector("[data-hd=\"sleep\"]"); if (sb0) sb0.focus(); return true; }
      if (d.hdopen) { X.open[d.hdopen] = !X.open[d.hdopen]; if (!X.open[d.hdopen]) { if (X.ren === +d.hdopen) X.ren = 0; if (X.rm === +d.hdopen) X.rm = 0; } draw2(); return true; }   /* + / − on a row (2.53) */
      if (d.hd === "sleep" || d.hd === "sleepclose") { X.sleepOpen = d.hd === "sleep"; draw2(); var f = X.sleepOpen ? document.querySelector(".hd-win [aria-pressed=\"true\"]") : document.querySelector("[data-hd=\"sleep\"]"); if (f) f.focus(); return true; }
      if (d.hd === "collapse") { X.open = {}; X.ren = 0; X.rm = 0; draw2(); return true; }
      if (d.hdstyle) {   /* IN ORDER or NETWORK: reread the folder for that style; if it's on screen, whatever the new style has on now */
        var sp = d.hdstyle.split("|"), scv = chById(+sp[0]); if (!scv || (scv.style || "order") === sp[1]) return true;
        scv.style = sp[1]; save(); load(scv, true);
        if (X.on && scv.id === cfg.ch) { X.cur = null; if (X.v) X.v.pause(); X.tuneAt = Date.now(); burst(); resume(); }
        draw2(); return true;
      }
      if (d.hdbrk) {   /* BREAKS on or off: that channel's schedule is dealt afresh from now */
        var bc = chById(+d.hdbrk); if (!bc) return true;
        bc.breaks = !bc.breaks; save(); delete BK[bc.id]; loadAds(false);
        if (X.on && bc.id === cfg.ch) { X.cur = null; if (X.v) X.v.pause(); X.tuneAt = Date.now(); burst(); resume(); }
        draw2(); return true;
      }
      if (d.hdprog) { if (!X.fade) enter(d.hdprog); return true; }
      if (d.hdgo) { leave(); arch(); draw2(); $("content").scrollTop = 0; return true; }   /* ◇ ARCH: the TV goes off (unless floating) */
      if (d.hd === "tune") { if (X.on) { off(); setSleepAt("off"); } else tune(); draw2(); }   /* turning it off by hand clears the sleep timer */
      else if (d.hd === "up" || d.hd === "down") step(d.hd === "up" ? 1 : -1);
      else if (d.hdch !== undefined) switchTo(+d.hdch);
      else if (d.hd === "mute") { cfg.muted = !cfg.muted; save(); if (X.v) X.v.muted = cfg.muted; draw2(); }
      else if (d.hd === "level") { cfg.level = !cfg.level; save(); lvSwap(); draw2(); }   /* 2.61 */
      else if (d.hd === "sound") { lvSwap(); draw2(); }   /* iPadOS kept the sound: a new start, inside this tap */
      else if (d.hd === "full" && X.v) fullOn();
      else if (d.hd === "fullexit") fullOff();
      else if (d.hd === "pick") { X.pick = !cur() || !X.pick || X.pickFor === "ads"; X.pickFor = ""; X.pickErr = ""; if (X.pick && cur()) X.pickDir = parentOf(cur().dir); if (X.pick) fresh(X.pickDir); draw2(); }
      else if (d.hd === "adpick") { X.pick = !(X.pick && X.pickFor === "ads"); X.pickFor = X.pick ? "ads" : ""; X.pickErr = ""; if (X.pick) { X.pickDir = cfg.ads ? parentOf(cfg.ads) : cur() ? parentOf(cur().dir) : "/"; fresh(X.pickDir); } draw2(); }
      else if (d.hd === "useads" || d.hd === "adclear") {   /* the one Commercials folder: every channel with BREAKS draws from it */
        cfg.ads = d.hd === "useads" ? X.pickDir : ""; X.pick = false; X.pickFor = ""; save(); BK = {}; loadAds(true);
        if (X.on && (cur() || {}).breaks) { X.cur = null; if (X.v) X.v.pause(); X.tuneAt = Date.now(); burst(); resume(); }
        draw2();
      }
      else if (d.hdpick !== undefined) { X.pickDir = d.hdpick || "/"; X.pickErr = ""; if (X.pw[X.pickDir] === "err") delete X.pw[X.pickDir]; fresh(X.pickDir); draw2(); }
      else if (d.hd === "use") {   /* a new channel, on air from now: it starts at the beginning */
        var id = cfg.chans.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
        cfg.chans.push({ id: id, name: folderName(X.pickDir), dir: X.pickDir, premiere: Date.now() }); X.pick = false; X.pickFor = ""; X.open[id] = true; cfg.copen = true; save(); switchTo(id);
      }
      else if (d.hdren !== undefined) { X.ren = X.ren === +d.hdren ? 0 : +d.hdren; X.rm = 0; draw2(); var inp = $("hdRename"); if (inp) inp.focus(); }
      else if (d.hd === "rensave") { var c = chById(X.ren), nm = ($("hdRename") || {}).value; if (c) { c.name = String(nm || "").trim().slice(0, 40) || folderName(c.dir); save(); } X.ren = 0; draw2(); }
      else if (d.hdrm !== undefined) {   /* two taps: REMOVE, then REMOVE IT. The folder on the NAS is untouched */
        var rid = +d.hdrm; if (X.rm !== rid) { X.rm = rid; draw2(); return true; }
        X.rm = 0; var was = rid === cfg.ch; cfg.chans = cfg.chans.filter(function (x) { return x.id !== rid; }); save();
        if (was) { if (cfg.chans.length) switchTo(cfg.chans[0].id); else { cfg.ch = 0; save(); off(); } }
        draw2();
      }
      else if (d.hd === "rescan") { [[lens, LS_HOLOLEN], [adLens, LS_HOLOADLEN]].forEach(function (m) { Object.keys(m[0]).forEach(function (k) { if (m[0][k].s < 0) delete m[0][k]; }); lsSet(m[1], m[0]); }); X.lv++; cfg.chans.forEach(function (x) { load(x, true); }); loadAds(true); draw2(); }   /* unreadable ones are measured again too */
      else if (d.hdlook) { cfg.look = d.hdlook; save(); draw2(); }
      return true;
    }
    document.addEventListener("keydown", function (e) {
      if (state.screen !== "holodeck") return;
      if (e.key === "Escape") { if (X.sleepOpen) { X.sleepOpen = false; draw2(); } else if (X.big) fullOff(); return; }
      var t = e.target || {}; if (X.prog !== "visual" || X.sleepOpen || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable || !nasConf()) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); padKey(e.key); }   /* a keyboard's digits work the keypad (2.57) */
      else if (e.key === "Enter" && X.typed && t.tagName !== "BUTTON") { e.preventDefault(); padGo(); }
    });
    function leave() { X.sleepOpen = false; clearTimeout(X.kt); X.typed = ""; X.kmsg = ""; X.gw = 0; clearInterval(X.asT); X.asT = 0; if (X.on) off(); }   /* leaving: off */
    document.addEventListener("visibilitychange", function () {   /* away: the sound goes on as audio (2.56.2); back to the app: catch up with the broadcast */
      X.tp = Date.now();   /* time away isn't a stall */
      if (document.hidden) { if (X.on) toRadio(); return; }
      if (X.probeLater) { X.probeLater = false; probe(); }
      if (X.on) lvWake();   /* LEVEL: iPadOS paused Web Audio while away */
      if (X.radio) { radioStop(); if (X.on) { X.cur = null; resume(); } return; }
      if (!X.on || state.screen !== "holodeck") return;
      var c = at(cur(), Date.now()); if (c && X.cur && c.it.f.path === X.cur.it.f.path) { var pos = (Date.now() - c.startMs) / 1000; if (Math.abs((X.v.currentTime || 0) - pos) > 3) X.v.currentTime = pos; if (X.v.paused) X.v.play().catch(function () {}); } else if (c) start(c, true);
    });
    return { render: draw2, head: head, click: click, leave: leave, arch: arch, enter: enter, archBtn: archBtn, quiet: quiet, onAir: function () { return X.on; } };
  })();
  function renderHolodeck() { holo.render(); }

