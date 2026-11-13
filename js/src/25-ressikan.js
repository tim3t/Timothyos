  /* ---------- RESSIKAN (2.44; 2.82 revamp): play with sound (REFLECT) ---------- */
  /* Named by Timothy after Picard's flute in "The Inner Light". All sound is made on this iPad with Web Audio: nothing to
     download, no keys, works offline. 2.82 (D82, Timothy's approved mockup, 2026-11-13: "more into making chords over a
     beat"): two cards. CHORDS: seven pads (the chords of the key, with colours and BORROW), a loop of 4 or 8 bars filled
     by tapping a slot then a pad or by CAPTURE in time, four sounds and four ways to play them, a bass on the root, and a
     16-step beat with kits. SOLO: scale pads to play a lead over the loop, the chord playing now lit so landing on it
     always fits. One room (echo on the beat, space, lo-fi, tape wow, vinyl), RECORD to Files, loops kept on this iPad
     (tos.ressikan.v1, in backups and PROFILE SYNC, compact), SAVE AS MIDI for GarageBand. The theremin and DRIFT are
     retired (Timothy: "retire the theremin for now"; DRIFT replaced by SOLO). Sound stops on leaving the station.
     Its own scope (an inner function) and rs- class names, so nothing here can collide with the rest of the app. */
  var LS_RESSIKAN = "tos.ressikan.v1";
  var rs = (function () {
    var SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"], FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
    var MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
    /* what each chord does in its key: home (tonic), away (subdominant), tension (dominant) */
    var FN = { major: ["tonic", "sub", "tonic", "sub", "dom", "tonic", "dom"], minor: ["tonic", "sub", "tonic", "sub", "dom", "sub", "dom"] };
    var FNC = { tonic: "personal", sub: "work", dom: "hobby" }, FNW = { tonic: "HOME", sub: "AWAY", dom: "TENSION" };
    var FOLLOW = { major: [[3, 4, 5, 1], [4, 6], [5, 3], [4, 0, 1], [0, 5], [1, 3, 4], [0, 2]], minor: [[3, 5, 6, 4], [4], [5, 3], [4, 0, 6], [0, 5], [3, 6, 1], [2, 0]] };
    var STARTS = {
      lofi: { n: "LOFI", mode: "major", s: ["1:7", "4:7", "0:7", "5:7"] }, pop: { n: "POP", mode: "major", s: ["0:", "4:", "5:", "3:"] },
      melancholy: { n: "MELANCHOLY", mode: "major", s: ["5:", "3:", "0:", "4:"] }, dreamy: { n: "DREAMY", mode: "major", s: ["0:7", "3:7", "0:7", "3:7"] },
      neosoul: { n: "NEO SOUL", mode: "major", s: ["1:9", "4:9", "0:9", "5:9"] }, spanish: { n: "SPANISH", mode: "minor", s: ["0:", "6:", "5:", "4::b"] } };
    var COLOURS = [["", "PLAIN"], ["7", "7"], ["9", "9"], ["sus2", "SUS2"], ["sus4", "SUS4"], ["6", "ADD6"]];
    var LANES = [["kick", "KICK", "#f6c66b", 36], ["snare", "SNARE", "#ff8b70", 38], ["clap", "CLAP", "#e8a27a", 39], ["hat", "CLOSED HAT", "#56c7b8", 42], ["ohat", "OPEN HAT", "#9db0ff", 46], ["shaker", "SHAKER", "#c99bc4", 70]];
    var PATS = {
      lofi: { n: "LOFI", g: ["2000000100200000", "0000200000002000", "0000000000000000", "1010101110101011", "0000000000000010", "0101010101010101"] },
      boombap: { n: "BOOM BAP", g: ["2000000010200000", "0000200000002001", "0000000000000000", "1010101010101010", "0000000000000000", "0000000000000000"] },
      house: { n: "HOUSE", g: ["2000200020002000", "0000000000000000", "0000200000002000", "0000000000000000", "0010001000100010", "1111111111111111"] },
      halftime: { n: "HALF-TIME", g: ["2000000000100000", "0000000020000000", "0000000000000000", "1010101010101010", "0000000000000000", "0001000100010001"] },
      clear: { n: "CLEAR", g: ["0000000000000000", "0000000000000000", "0000000000000000", "0000000000000000", "0000000000000000", "0000000000000000"] } };
    var KITS = {   /* kick [start Hz, end Hz, decay, level] · snare [tone, noise Hz, decay, level] · hats [Hz, decay, level] · clap/shaker [Hz, level] · the kit's top end */
      dusty: { n: "DUSTY", kick: [110, 42, .38, 1], snare: [190, 1600, .16, .62], hat: [8000, .04, .3], ohat: [7500, .32, .22], clap: [1300, .5], shaker: [5200, .2], lp: 4200 },
      "808": { n: "808", kick: [92, 38, .95, 1.1], snare: [230, 2600, .2, .55], hat: [9500, .035, .28], ohat: [9000, .45, .2], clap: [1500, .6], shaker: [6500, .18], lp: 18000 },
      acoustic: { n: "ACOUSTIC", kick: [140, 55, .26, 1], snare: [180, 2100, .24, .8], hat: [7000, .05, .32], ohat: [6500, .38, .25], clap: [1200, .55], shaker: [4800, .22], lp: 12000 },
      minimal: { n: "MINIMAL", kick: [72, 44, .26, .85], snare: [420, 3200, .06, .45], hat: [10000, .025, .2], ohat: [9500, .2, .15], clap: [1800, .35], shaker: [7000, .14], lp: 9000 } };
    var CSOUNDS = [["keys", "KEYS"], ["pad", "PAD"], ["pluck", "PLUCK"], ["organ", "ORGAN"]], STYLES = [["hold", "HOLD"], ["stab", "STAB"], ["strum", "STRUM"], ["arp", "ARP"]];
    var SSOUNDS = [["flute", "FLUTE"], ["lead", "LEAD"], ["bell", "BELL"], ["soft", "SOFT"]];
    var SSCALES = { pent: { n: "PENTATONIC", major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] }, full: { n: "FULL SCALE", major: MAJ, minor: MIN }, blues: { n: "BLUES", major: [0, 2, 3, 4, 7, 9], minor: [0, 3, 5, 6, 7, 10] } };
    var GM = { keys: 4, pad: 89, pluck: 24, organ: 16 };   /* General MIDI programs for SAVE AS MIDI */
    var MAXLOOPS = 12;

    /* ---- settings: kept compact (PROFILE SYNC carries up to 20,000 characters an item) ---- */
    var DEF = { v: 2, card: "chords", key: 5, mode: "major", k: { tempo: .275, swing: .3, chords: .8, bass: .7, beat: .75, solo: .8, glide: .2, vib: .3 },
      fx: { echo: .28, space: .5, lofi: .25, wow: .3 }, vinyl: true, bars: 4, every: 16, slots: STARTS.lofi.s.slice(), colour: "7", borrow: false, next: true,
      sound: "keys", style: "hold", arp: "up", rate: 2, bass: true, kit: "dusty", pat: "lofi", grid: PATS.lofi.g.slice(), mute: [], fill: true, human: true,
      solo: { sound: "flute", scale: "pent", oct: 0 }, loops: [] };
    var saved = lsGet(LS_RESSIKAN) || {}, S = {};
    if (saved.v !== 2) saved = { key: saved.key, fx: saved.fx, vinyl: saved.vinyl };   /* 2.82: only the key and the room come across from FIELD */
    Object.keys(DEF).forEach(function (k) { var d = DEF[k], v = saved[k]; S[k] = d && typeof d === "object" && !Array.isArray(d) ? Object.assign({}, d, v && typeof v === "object" && !Array.isArray(v) ? v : {}) : v != null ? v : d; });
    function oneOf(v, list, d) { return list.indexOf(v) > -1 ? v : d; }
    S.key = typeof S.key === "number" && S.key >= 0 && S.key < 12 ? Math.floor(S.key) : 5;
    S.card = oneOf(S.card, ["chords", "solo"], "chords"); S.mode = oneOf(S.mode, ["major", "minor"], "major");
    S.bars = oneOf(S.bars, [4, 8], 4); S.every = oneOf(S.every, [16, 8], 16);
    S.sound = oneOf(S.sound, ["keys", "pad", "pluck", "organ"], "keys"); S.style = oneOf(S.style, ["hold", "stab", "strum", "arp"], "hold");
    S.arp = oneOf(S.arp, ["up", "down", "updown", "random"], "up"); S.rate = oneOf(S.rate, [1, 2], 2); S.kit = KITS[S.kit] ? S.kit : "dusty";
    S.colour = oneOf(S.colour, COLOURS.map(function (c) { return c[0]; }), "7");
    S.solo.sound = oneOf(S.solo.sound, ["flute", "lead", "bell", "soft"], "flute"); S.solo.scale = SSCALES[S.solo.scale] ? S.solo.scale : "pent"; S.solo.oct = oneOf(S.solo.oct, [-1, 0, 1], 0);
    if (!Array.isArray(S.mute)) S.mute = []; if (!Array.isArray(S.loops)) S.loops = [];
    function dec(x) { if (typeof x !== "string" || !x) return null; var p = x.split(":"), d = parseInt(p[0], 10); return d >= 0 && d < 7 ? { d: d, c: oneOf(p[1] || "", ["", "7", "9", "sus2", "sus4", "6"], ""), b: p[2] === "b" } : null; }
    function enc(s) { return s ? s.d + ":" + s.c + (s.b ? ":b" : "") : ""; }
    function decGrid(g) { return LANES.map(function (l, i) { var r = Array.isArray(g) && typeof g[i] === "string" ? g[i] : ""; var a = []; for (var k = 0; k < 16; k++) a.push(Math.min(2, parseInt(r.charAt(k), 10) || 0)); return a; }); }
    function encGrid(G) { return G.map(function (r) { return r.join(""); }); }
    var slots = (Array.isArray(S.slots) ? S.slots : []).map(dec), G = decGrid(S.grid);
    function slotCount() { return S.bars * (16 / S.every); }
    function fitSlots() { var n = slotCount(), was = slots.slice(); for (var r = was.length; r < n; r++) slots.push(was.length ? was[r % was.length] : null); slots.length = n; }
    fitSlots();
    var X = { on: false, play: false, rec: null, takes: [], saveT: 0, sel: null, last: null, capture: false, pos: { step: -1, slot: -1 }, touch: {}, delAsk: -1, padAt: 0, ticking: false };
    X.last = slots.filter(Boolean).pop() || null;
    function keep() {
      clearTimeout(X.saveT);
      X.saveT = setTimeout(function () { var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = S[k]; }); o.slots = slots.map(enc); o.grid = encGrid(G); lsSet(LS_RESSIKAN, o); }, 400);
    }

    /* ---- harmony ---- */
    function homeScale() { return S.mode === "major" ? MAJ : MIN; }
    function scaleFor(b) { return (S.mode === "major") !== !!b ? MAJ : MIN; }
    function at(scl, i) { return scl[i % 7] + 12 * Math.floor(i / 7); }
    function useFlats() { var rel = S.mode === "major" ? S.key : (S.key + 3) % 12; return [5, 10, 3, 8, 1, 6].indexOf(rel) > -1; }
    function keyName(k, mode) { var rel = mode === "minor" ? (k + 3) % 12 : k; return ([5, 10, 3, 8, 1, 6].indexOf(rel) > -1 ? FLAT : SHARP)[((k | 0) % 12 + 12) % 12]; }
    function pcName(pc) { return (useFlats() ? FLAT : SHARP)[(pc % 12 + 12) % 12]; }
    function intervals(s) {
      var scl = scaleFor(s.b), d = s.d, iv = [at(scl, d), at(scl, d + 2), at(scl, d + 4)];
      if (s.c === "sus2") iv[1] = at(scl, d + 1);
      if (s.c === "sus4") iv[1] = at(scl, d + 3);
      if (s.c === "7" || s.c === "9") iv.push(at(scl, d + 6));
      if (s.c === "9") iv.push(at(scl, d + 8));
      if (s.c === "6") iv.push(at(scl, d + 5));
      return iv;
    }
    function quality(s) {
      var scl = scaleFor(s.b), d = s.d, r = at(scl, d), t = at(scl, d + 2) - r, f = at(scl, d + 4) - r;
      return { q: t === 4 && f === 7 ? "maj" : t === 3 && f === 7 ? "min" : t === 3 && f === 6 ? "dim" : "aug", sv: at(scl, d + 6) - r, root: (S.key + r) % 12 };
    }
    function chordName(s) {
      var q = quality(s), n = pcName(q.root), c = s.c;
      if (c === "sus2" || c === "sus4") return n + c;
      if (c === "6") return n + (q.q === "min" ? "m6" : q.q === "dim" ? "°add6" : "6");
      if (c === "7" || c === "9") {
        if (q.q === "maj") return n + (q.sv === 11 ? "maj" + c : c);
        if (q.q === "min") return n + (q.sv === 10 ? "m" + c : "m(maj" + c + ")");
        if (q.q === "dim") return n + (q.sv === 10 ? "m7♭5" : "°7");
        return n + "+" + c;
      }
      return n + (q.q === "min" ? "m" : q.q === "dim" ? "°" : q.q === "aug" ? "+" : "");
    }
    function numeral(s) {
      var q = quality(s), r = ROMAN[s.d], diff = scaleFor(s.b)[s.d] - homeScale()[s.d], sus = s.c === "sus2" || s.c === "sus4";
      if (q.q === "min" || q.q === "dim") r = r.toLowerCase();
      var tail = sus ? "" : q.q === "dim" ? (s.c === "7" || s.c === "9" ? "ø" : "°") : q.q === "aug" ? "+" : "";
      var ext = s.c === "7" || s.c === "9" ? (q.q === "maj" && q.sv === 11 ? "maj" : "") + s.c : s.c === "6" ? "6" : sus ? "sus" : "";
      return (diff < 0 ? "♭" : diff > 0 ? "♯" : "") + r + tail + ext;
    }
    function fnOf(s) { return (s.b ? FN[S.mode === "major" ? "minor" : "major"] : FN[S.mode])[s.d]; }
    /* voice leading: each note goes to the octave nearest the last chord's middle, drifting back toward middle C */
    var lastV = null;
    function voice(s) {
      var centre = lastV ? lastV.reduce(function (a, b) { return a + b; }, 0) / lastV.length * .6 + 62 * .4 : 62;
      var notes = intervals(s).map(function (x) { var m = 48 + S.key + x; while (m - centre > 6) m -= 12; while (centre - m > 6) m += 12; return m; }).sort(function (a, b) { return a - b; });
      for (var i = 1; i < notes.length; i++) if (notes[i] <= notes[i - 1]) notes[i] += 12;
      return (lastV = notes);
    }
    function bassNote(s) { var m = 36 + quality(s).root; return m > 45 ? m - 12 : m; }
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function bpm() { return Math.round(60 + S.k.tempo * 80); }

    /* ---- the room: everything plays through one chain ---- */
    var A = null, bus, chordBus, bassBus, beatBus, beatLp, soloBus, master, recDest, dly, dlySend, verbSend, lofiWet, lofiDry, wowDepth, vinylG, nbuf;
    /* A fresh engine for every SOUND ON (2.44.1). iPadOS pauses Web Audio when something else takes the sound (another
       app, a call, Siri, the lock screen, STORAGE or Nova) and Safari leaves it "interrupted", a state the old code never
       woke from: silence with every setting right. Now SOUND ON builds a new engine inside the tap, SOUND OFF and
       leaving the station set it aside, and an interruption mid-play turns SOUND OFF so the next tap starts clean. */
    function start() {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      if (A) { var old = A; A = null; old.onstatechange = null; try { old.close(); } catch (e) { /* already closed */ } }
      A = new C({ latencyHint: "interactive" }); nbuf = null; soloV = null;
      A.onstatechange = function () { if (this === A && this.state !== "running" && X.on && !X.quiet) lost(); };
      try { A.resume(); } catch (e) { /* resumes with the first sound */ }
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older iPadOS: the silent setting may mute it */ }
      bus = A.createGain(); chordBus = A.createGain(); bassBus = A.createGain(); beatBus = A.createGain(); soloBus = A.createGain(); beatLp = A.createBiquadFilter(); beatLp.type = "lowpass";
      chordBus.connect(bus); bassBus.connect(bus); beatBus.connect(beatLp); beatLp.connect(bus); soloBus.connect(bus);
      var wow = A.createDelay(.1); wow.delayTime.value = .012; var wl = A.createOscillator(); wl.frequency.value = .55; wowDepth = A.createGain(); wl.connect(wowDepth); wowDepth.connect(wow.delayTime); wl.start(); bus.connect(wow);
      var crush = A.createWaveShaper(), cv = new Float32Array(2048); for (var i = 0; i < 2048; i++) cv[i] = Math.round(Math.tanh((i / 1024 - 1) * 1.8) * 10) / 10; crush.curve = cv;
      var lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600; var hp = A.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90;
      lofiWet = A.createGain(); lofiDry = A.createGain(); wow.connect(lofiDry); wow.connect(crush); crush.connect(lp); lp.connect(hp); hp.connect(lofiWet);
      var mix = A.createGain(); lofiDry.connect(mix); lofiWet.connect(mix);
      var comp = A.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; master = A.createGain(); master.gain.value = 0; mix.connect(comp);
      dly = A.createDelay(2); var fb = A.createGain(); fb.gain.value = .36; var dlp = A.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 2300;
      dlySend = A.createGain(); chordBus.connect(dlySend); soloBus.connect(dlySend); dlySend.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(comp);
      var verb = A.createConvolver(), len = A.sampleRate * 3.4, ir = A.createBuffer(2, len, A.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var dd = ir.getChannelData(ch); for (var j = 0; j < len; j++) dd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.5); }
      verb.buffer = ir; verbSend = A.createGain(); mix.connect(verbSend); verbSend.connect(verb); verb.connect(comp);
      comp.connect(master); master.connect(A.destination);
      try { recDest = A.createMediaStreamDestination(); master.connect(recDest); } catch (e) { recDest = null; }
      var vb = A.createBuffer(1, A.sampleRate * 4, A.sampleRate), vd = vb.getChannelData(0); for (var k = 0; k < vd.length; k++) vd[k] = (Math.random() * 2 - 1) * .012 + (Math.random() < .0004 ? (Math.random() * 2 - 1) * .7 : 0);
      var vs = A.createBufferSource(); vs.buffer = vb; vs.loop = true; var vf = A.createBiquadFilter(); vf.type = "bandpass"; vf.frequency.value = 2400; vf.Q.value = .4; vinylG = A.createGain(); vinylG.gain.value = 0; vs.connect(vf); vf.connect(vinylG); vinylG.connect(mix); vs.start();
      if (!X.ticking) { X.ticking = true; setInterval(rsTick, 25); }
      return true;
    }
    function applyFx() {
      if (!A) return; var t = A.currentTime;
      dly.delayTime.setTargetAtTime(60 / bpm() * .75, t, .1);   /* echo on the beat: a dotted eighth */
      dlySend.gain.setTargetAtTime(S.fx.echo * .7, t, .05); verbSend.gain.setTargetAtTime(S.fx.space * 1.1, t, .05);
      lofiWet.gain.setTargetAtTime(S.fx.lofi, t, .05); lofiDry.gain.setTargetAtTime(1 - S.fx.lofi * .8, t, .05);
      wowDepth.gain.setTargetAtTime(S.fx.wow * .0035, t, .1);
      vinylG.gain.setTargetAtTime(S.vinyl && X.play && X.on ? .9 : 0, t, .2);
      chordBus.gain.setTargetAtTime(S.k.chords * .55, t, .05); bassBus.gain.setTargetAtTime(S.k.bass * .8, t, .05);
      beatBus.gain.setTargetAtTime(S.k.beat * 1.1, t, .05); beatLp.frequency.setTargetAtTime(KITS[S.kit].lp, t, .05); soloBus.gain.setTargetAtTime(S.k.solo * .9, t, .05);
    }
    function setPower(on) {
      if (on && !start()) { toast("This browser can't make sound here"); return; }
      if (!on && X.rec) X.rec.mr.stop();
      X.on = on; X.lost = false;
      if (A) {
        master.gain.setTargetAtTime(on ? .85 : 0, A.currentTime, .05);
        if (!on) { soloAllOff(); X.play = false; X.quiet = true; var a = A; setTimeout(function () { X.quiet = false; if (a === A && !X.on) try { a.suspend(); } catch (e) { /* closed */ } }, 300); }   /* hand the iPad's sound back */
      }
      applyFx(); paint();
    }
    function lost() {   /* iPadOS took the sound away mid-play */
      X.on = false; X.play = false; X.lost = true; X.touch = {}; soloV = null;
      if (X.rec) X.rec.mr.stop();
      if (state.screen === "ressikan") draw();
    }
    function noise() { if (nbuf) return nbuf; nbuf = A.createBuffer(1, A.sampleRate, A.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }

    /* ---- the chord sounds ---- */
    function envAt(g, t, a, peak, dur, rel) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(0, t + dur, rel); }
    var CHORD = {
      keys: function (t, m, dur, v) {   /* an electric piano: FM, the bright attack fading */
        var f = hz(m), car = A.createOscillator(), mod = A.createOscillator(), mg = A.createGain(), g = A.createGain();
        car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * .35, t, .25);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(chordBus);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.32 * v, t + .006); g.gain.setTargetAtTime(.12 * v, t + .006, .5); g.gain.setTargetAtTime(0, t + dur, .18);
        car.start(t); mod.start(t); car.stop(t + dur + 1.2); mod.stop(t + dur + 1.2);
      },
      pad: function (t, m, dur, v) {   /* warm and slow: two detuned saws through a soft filter */
        var f = hz(m), g = A.createGain(), lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300; lp.Q.value = .6;
        [-7, 7].forEach(function (c) { var o = A.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = c; o.connect(lp); o.start(t); o.stop(t + dur + 2.2); });
        lp.connect(g); g.connect(chordBus); envAt(g, t, .32, .11 * v, dur, .45);
      },
      pluck: function (t, m, dur, v) {   /* a bright pick that closes quickly */
        var f = hz(m), o = A.createOscillator(), lp = A.createBiquadFilter(), g = A.createGain(); o.type = "sawtooth"; o.frequency.value = f;
        lp.type = "lowpass"; lp.Q.value = 2; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(500, t + .28);
        o.connect(lp); lp.connect(g); g.connect(chordBus);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.22 * v, t + .004); g.gain.setTargetAtTime(0, t + .004, Math.min(.35, dur * .5 + .1));
        o.start(t); o.stop(t + dur + 1);
      },
      organ: function (t, m, dur, v) {   /* drawbars at 8', 4' and 2 2/3', with a slow wobble */
        var f = hz(m), g = A.createGain(), vib = A.createOscillator(), vg = A.createGain(); vib.frequency.value = 5.6; vg.gain.value = 4; vib.connect(vg);
        [[1, .5], [2, .28], [3, .14]].forEach(function (h) { var o = A.createOscillator(), og = A.createGain(); o.frequency.value = f * h[0]; vg.connect(o.detune); og.gain.value = h[1]; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .4); });
        vib.start(t); vib.stop(t + dur + .4); g.connect(chordBus); envAt(g, t, .012, .14 * v, dur, .05);
      } };
    function bassVoice(t, m, dur, v) {
      var f = hz(m), o = A.createOscillator(), o2 = A.createOscillator(), lp = A.createBiquadFilter(), g = A.createGain();
      o.frequency.value = f; o2.type = "triangle"; o2.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 600;
      o.connect(g); o2.connect(lp); lp.connect(g); g.connect(bassBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.42 * v, t + .01); g.gain.setTargetAtTime(.3 * v, t + .01, .2); g.gain.setTargetAtTime(0, t + dur, .06);
      o.start(t); o2.start(t); o.stop(t + dur + .5); o2.stop(t + dur + .5);
    }

    /* ---- the beat ---- */
    function nz(t, type, freq, q, dur, peak) {
      var s = A.createBufferSource(), f = A.createBiquadFilter(), g = A.createGain(); s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      s.connect(f); f.connect(g); g.connect(beatBus); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      s.start(t, Math.random() * .5); s.stop(t + dur + .05);
    }
    var DRUM = {
      kick: function (t, v, k) { var o = A.createOscillator(), g = A.createGain(); o.frequency.setValueAtTime(k[0], t); o.frequency.exponentialRampToValueAtTime(k[1], t + .09); o.connect(g); g.connect(beatBus); g.gain.setValueAtTime(k[3] * v, t); g.gain.exponentialRampToValueAtTime(.001, t + k[2]); o.start(t); o.stop(t + k[2] + .05); },
      snare: function (t, v, k) { var o = A.createOscillator(), g = A.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(k[0], t); o.frequency.exponentialRampToValueAtTime(k[0] * .6, t + .08); o.connect(g); g.connect(beatBus); g.gain.setValueAtTime(.35 * v, t); g.gain.exponentialRampToValueAtTime(.001, t + .1); o.start(t); o.stop(t + .12); nz(t, "bandpass", k[1], .8, k[2], k[3] * v); },
      clap: function (t, v, k) { [0, .011, .023].forEach(function (d) { nz(t + d, "bandpass", k[0], 1.2, .05, k[1] * v); }); nz(t + .03, "bandpass", k[0], 1, .18, k[1] * .5 * v); },
      hat: function (t, v, k) { nz(t, "highpass", k[0], .7, k[1], k[2] * v); },
      ohat: function (t, v, k) { nz(t, "highpass", k[0], .7, k[1], k[2] * v); },
      shaker: function (t, v, k) { nz(t, "bandpass", k[0], 1.4, .07, k[1] * v); } };

    /* ---- the clock: 16ths, looked ahead (further while the page is hidden, where timers slow down) ---- */
    var bt = { step: 0, nextAt: 0 };
    function six() { return 60 / bpm() / 4; }
    function schedule(n, t) {
      var stp = n % 16, bar = Math.floor(n / 16) % S.bars, ls = n % (S.bars * 16), si = Math.floor(ls / S.every), pos = ls % S.every, kit = KITS[S.kit], fillNow = S.fill && bar === S.bars - 1 && stp >= 12;
      LANES.forEach(function (l, li) {
        if (S.mute.indexOf(l[0]) > -1) return;
        var v = G[li][stp];
        if (fillNow && l[0] === "snare") v = stp % 2 ? 1 : 2;   /* a fill on the last bar: the snare rolls in, the hats step aside */
        if (fillNow && (l[0] === "hat" || l[0] === "ohat")) v = 0;
        if (!v) return;
        DRUM[l[0]](Math.max(A.currentTime, t + (S.human ? (Math.random() - .5) * .014 : 0)), v === 2 ? 1 : .6 * (fillNow ? .5 + (stp - 12) * .15 : 1), kit[l[0]]);
      });
      var s = slots[si], sx = six();
      if (s) {
        var left = (S.every - pos) * sx, play = CHORD[S.sound];
        if (pos === 0) {
          var notes = s.vv = voice(s);
          if (S.style === "hold") notes.forEach(function (m) { play(t, m, left * .96, .9); });
          if (S.style === "strum") notes.forEach(function (m, i) { play(t + i * .024, m, left * .96 - i * .024, .9); });
          if (S.bass) bassVoice(t, bassNote(s), Math.min(left * .9, 1.4), 1);
        }
        var vv = s.vv || voice(s);
        if (S.style === "strum" && pos === 8 && S.every === 16) vv.slice().reverse().forEach(function (m, i) { play(t + i * .02, m, left * .9, .6); });
        if (S.style === "stab" && stp % 4 === 2) vv.forEach(function (m) { play(t, m, sx * 1.3, .85); });
        if (S.style === "arp" && pos % S.rate === 0) {
          var seq = vv.concat(vv.map(function (m) { return m + 12; })), k = pos / S.rate, m;
          if (S.arp === "up") m = seq[k % seq.length];
          else if (S.arp === "down") m = seq[seq.length - 1 - k % seq.length];
          else if (S.arp === "updown") { var span = seq.length * 2 - 2, kk = k % span; m = seq[kk < seq.length ? kk : span - kk]; }
          else m = seq[Math.floor(Math.random() * seq.length)];
          play(t, m, sx * S.rate * .9, .8);
        }
        if (S.bass && pos === 10 && S.every === 16) bassVoice(t, bassNote(s), sx * 2.5, .7);
      }
      setTimeout(function () { X.pos = { step: stp, slot: si, n: n, at: performance.now() }; paintPlay(); }, Math.max(0, (t - A.currentTime) * 1000));
    }
    function rsTick() {
      if (!A || !X.play || !X.on) return;
      var now = A.currentTime, ahead = document.hidden ? 1.5 : .12;
      if (bt.nextAt < now - .2) bt.nextAt = now + .05;
      while (bt.nextAt < now + ahead) { schedule(bt.step, bt.nextAt + (bt.step % 2 ? six() * S.k.swing * .6 * .66 : 0)); bt.step++; bt.nextAt += six(); }
    }
    function setPlay(on) {
      if (on && !X.on) setPower(true); if (!X.on) return;
      X.play = on; lastV = null;
      if (on) { bt.step = 0; bt.nextAt = A.currentTime + .08; } else X.pos = { step: -1, slot: -1 };
      applyFx(); rsTick();
    }

    /* ---- SOLO: one lead voice, gliding between notes; BELL strikes each note ---- */
    var soloV = null;
    function soloScale() { return SSCALES[S.solo.scale][S.mode]; }
    function soloBase() { var b = 60 + S.key; if (b > 66) b -= 12; return b + S.solo.oct * 12; }
    function soloNotes() {   /* two octaves and the top note: [lower row, upper row] */
      var scl = soloScale(), b = soloBase();
      return [scl.map(function (x) { return b + x; }), scl.map(function (x) { return b + 12 + x; }).concat([b + 24])];
    }
    function bell(m) {
      var t = A.currentTime, f = hz(m), car = A.createOscillator(), mod = A.createOscillator(), mg = A.createGain(), g = A.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(f * .2, t + 1.2);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(soloBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .004); g.gain.exponentialRampToValueAtTime(.001, t + 2.6);
      car.start(t); mod.start(t); car.stop(t + 2.7); mod.stop(t + 2.7);
    }
    function soloMake(m) {
      var t = A.currentTime, f = hz(m), v = { m: m, o: [], g: A.createGain(), f: A.createBiquadFilter(), lfo: A.createOscillator(), lg: A.createGain() }, kind = S.solo.sound;
      v.f.type = "lowpass"; v.f.frequency.value = kind === "lead" ? 2600 : kind === "soft" ? 1100 : 5000; v.f.Q.value = kind === "lead" ? 4 : .7;
      var add = function (type, mul, lvl, det) { var o = A.createOscillator(), og = A.createGain(); o.type = type; o.frequency.value = f * mul; o.detune.value = det || 0; og.gain.value = lvl; o.connect(og); og.connect(v.f); v.lg.connect(o.detune); o.mul = mul; v.o.push(o); };
      if (kind === "flute") { add("sine", 1, .9); add("triangle", 2, .07); var n = A.createBufferSource(), nf = A.createBiquadFilter(), ng = A.createGain(); n.buffer = noise(); n.loop = true; nf.type = "bandpass"; nf.frequency.value = f * 2; nf.Q.value = 2; ng.gain.value = .05; n.connect(nf); nf.connect(ng); ng.connect(v.f); n.start(t); v.breath = n; v.nf = nf; }
      else if (kind === "lead") { add("sawtooth", 1, .35); add("square", 1, .22, 8); }
      else { add("triangle", 1, .8); add("sine", .5, .3); }
      v.f.connect(v.g); v.g.connect(soloBus); v.lfo.frequency.value = 5.2; v.lfo.connect(v.lg);
      v.lg.gain.setValueAtTime(0, t); v.lg.gain.linearRampToValueAtTime(S.k.vib * 28, t + .35);   /* vibrato comes in as the note settles */
      v.g.gain.setValueAtTime(0, t); v.g.gain.linearRampToValueAtTime(kind === "lead" ? .2 : .26, t + (kind === "flute" ? .06 : .015));
      v.o.forEach(function (o) { o.start(t); }); v.lfo.start(t);
      return v;
    }
    function soloGo(m) {
      if (!X.on) return;
      if (S.solo.sound === "bell") { bell(m); return; }
      var t = A.currentTime;
      if (!soloV) { soloV = soloMake(m); return; }
      var gl = .004 + S.k.glide * .18;
      soloV.o.forEach(function (o) { o.frequency.setTargetAtTime(hz(m) * o.mul, t, gl); }); if (soloV.nf) soloV.nf.frequency.setTargetAtTime(hz(m) * 2, t, gl);
      soloV.m = m;
    }
    function soloAllOff() {
      var v = soloV; soloV = null; X.touch = {}; if (!v || !A) return;
      var t = A.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, S.solo.sound === "flute" ? .09 : .06);
      v.o.concat([v.lfo]).forEach(function (o) { try { o.stop(t + .6); } catch (e) { /* stopped */ } }); if (v.breath) v.breath.stop(t + .6);
    }
    function soloLit() {   /* the chord sounding now (or the first in the loop): its notes glow on the pads */
      var s = slots[X.play && X.pos.slot > -1 ? X.pos.slot : 0] || slots.filter(Boolean)[0];
      return s ? { s: s, pcs: intervals(s).map(function (x) { return (S.key + x) % 12; }), root: quality(s).root } : null;
    }
    function bindSolo(el) {
      var under = function (e) { var p = document.elementFromPoint(e.clientX, e.clientY); p = p && p.closest ? p.closest("[data-rsnote]") : null; return p && el.contains(p) ? p : null; };
      var mark = function () { var on = {}; Object.keys(X.touch).forEach(function (k) { on[X.touch[k]] = true; }); el.querySelectorAll("[data-rsnote]").forEach(function (b) { b.classList.toggle("down", !!on[b.dataset.rsnote]); }); };
      el.addEventListener("pointerdown", function (e) {
        var p = under(e); if (!p) return; e.preventDefault();
        if (!X.on) setPower(true); if (!X.on) return;
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* already released */ }
        X.touch[e.pointerId] = p.dataset.rsnote; soloGo(+p.dataset.rsnote); mark();
      });
      el.addEventListener("pointermove", function (e) {
        if (X.touch[e.pointerId] == null) return; var p = under(e);
        if (p && p.dataset.rsnote !== X.touch[e.pointerId]) { X.touch[e.pointerId] = p.dataset.rsnote; soloGo(+p.dataset.rsnote); mark(); }   /* sliding glides to the next note */
      });
      ["pointerup", "pointercancel"].forEach(function (ev) { el.addEventListener(ev, function (e) {
        if (X.touch[e.pointerId] == null) return; delete X.touch[e.pointerId];
        var rest = Object.keys(X.touch); if (rest.length) soloGo(+X.touch[rest[rest.length - 1]]); else soloAllOff();
        mark();
      }); });
    }

    /* ---- chords: live, written, captured ---- */
    function preview(s) {
      if (!X.on) setPower(true); if (!X.on) return;
      var t = A.currentTime + .02, was = lastV, notes = voice(s);
      if (X.play) lastV = was;   /* a live tap over the loop doesn't move the loop's voicing */
      notes.forEach(function (m, i) { CHORD[S.sound](t + (S.style === "strum" ? i * .024 : 0), m, 1.1, .85); });
      if (S.bass && !X.play) bassVoice(t, bassNote(s), 1, .9);
    }
    function capturePos() {
      if (X.pos.step < 0) return 0;
      var n = X.pos.n + (performance.now() - X.pos.at) / 1000 / six(), ls = n % (S.bars * 16), si = Math.floor(ls / S.every);
      if ((ls % S.every) / S.every > .75) si = (si + 1) % slotCount();   /* a touch early for the next bar counts as the next bar */
      return si;
    }
    function padTap(d) {
      var s = { d: d, c: S.colour, b: S.borrow };
      preview(s); X.last = s;
      if (X.play && X.capture) slots[capturePos()] = s;
      else if (X.sel !== null) { slots[X.sel] = s; X.sel = (X.sel + 1) % slotCount(); }
      keep(); draw();
    }
    function surprise() {
      var n = slotCount(), out = [], d = Math.random() < .7 ? 0 : 5;
      for (var i = 0; i < n; i++) {
        if (i === n - 1) { var leads = S.mode === "major" ? [4, 3, 1] : [4, 6, 3]; d = leads[Math.floor(Math.random() * leads.length)]; }   /* the last bar leads home */
        out.push({ d: d, c: Math.random() < .55 ? "7" : Math.random() < .3 ? "9" : "", b: false });
        var f = FOLLOW[S.mode][d]; d = f[Math.floor(Math.random() * f.length)];
      }
      slots = out; X.sel = null; X.last = out[n - 1]; lastV = null;
      toast("A fresh one: " + out.map(numeral).join(" – "));
    }
    function loadStart(k) {
      var p = STARTS[k]; S.mode = p.mode; S.bars = 4; S.every = 16; X.sel = null; slots = p.s.map(dec); X.last = slots[3]; lastV = null;
      toast(p.n + ": " + slots.map(chordName).join(" · "));
    }

    /* ---- loops kept on this iPad, and SAVE AS MIDI ---- */
    function snapshot(name) {
      return { n: name, at: Date.now(), key: S.key, mode: S.mode, tempo: S.k.tempo, swing: S.k.swing, bars: S.bars, every: S.every, slots: slots.map(enc), sound: S.sound, style: S.style,
        arp: S.arp, rate: S.rate, bass: S.bass, kit: S.kit, grid: encGrid(G), mute: S.mute.slice(), fill: S.fill, human: S.human };
    }
    function openLoop(L) {
      S.key = typeof L.key === "number" && L.key >= 0 && L.key < 12 ? Math.floor(L.key) : S.key; S.mode = oneOf(L.mode, ["major", "minor"], "major"); S.k.tempo = L.tempo; S.k.swing = L.swing; S.bars = oneOf(L.bars, [4, 8], 4); S.every = oneOf(L.every, [16, 8], 16);
      slots = (L.slots || []).map(dec); fitSlots(); S.sound = oneOf(L.sound, ["keys", "pad", "pluck", "organ"], "keys"); S.style = oneOf(L.style, ["hold", "stab", "strum", "arp"], "hold");
      S.arp = oneOf(L.arp, ["up", "down", "updown", "random"], "up"); S.rate = oneOf(L.rate, [1, 2], 2); S.bass = L.bass !== false; S.kit = KITS[L.kit] ? L.kit : "dusty";
      G = decGrid(L.grid); S.pat = ""; S.mute = Array.isArray(L.mute) ? L.mute.slice() : []; S.fill = L.fill !== false; S.human = L.human !== false;
      X.sel = null; X.last = slots.filter(Boolean).pop() || null; lastV = null; applyFx(); keep();
    }
    function saveLoop() {
      var inp = document.getElementById("rsLoopName"), name = (inp && inp.value.trim()) || "Loop " + (S.loops.length + 1);
      var i = S.loops.findIndex(function (L) { return L.n.toLowerCase() === name.toLowerCase(); }), snap = snapshot(name.slice(0, 40));
      if (i > -1) S.loops[i] = snap; else if (S.loops.length >= MAXLOOPS) { toast("12 loops kept: remove one to save another"); return; } else S.loops.unshift(snap);
      keep(); toast(i > -1 ? "Saved over " + snap.n : "Saved " + snap.n);
    }
    function be32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
    function vlq(n) { var b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }
    function mtrack(ev) {   /* [rsTick, bytes, order]: note-offs before note-ons at the same rsTick */
      var out = [], last = 0;
      ev.sort(function (a, b) { return a[0] - b[0] || a[2] - b[2]; }).forEach(function (e) { out.push.apply(out, vlq(e[0] - last)); out.push.apply(out, e[1]); last = e[0]; });
      out.push(0, 255, 47, 0);
      return [77, 84, 114, 107].concat(be32(out.length), out);
    }
    function midiFile() {   /* type 1, 96 ticks a beat: tempo, chords (held), bass, drums (General MIDI channel 10) */
      var T = 24, us = Math.round(60000000 / bpm()), meta = [[0, [255, 81, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255], 0], [0, [255, 88, 4, 4, 2, 24, 8], 0]];
      var ch = [[0, [192, GM[S.sound]], 0]], bs = [[0, [193, 33], 0]], dr = [], was = lastV; lastV = null;
      slots.forEach(function (s, i) {
        if (!s) return; var a = i * S.every * T, b = a + S.every * T - 2;
        voice(s).forEach(function (m) { ch.push([a, [144, m, 88], 1], [b, [128, m, 0], 0]); });
        if (S.bass) { var r = bassNote(s); bs.push([a, [145, r, 96], 1], [a + Math.round(S.every * T * .9), [129, r, 0], 0]); }
      });
      lastV = was;
      for (var bar = 0; bar < S.bars; bar++) for (var stp = 0; stp < 16; stp++) LANES.forEach(function (l, li) {
        if (S.mute.indexOf(l[0]) > -1) return; var v = G[li][stp], fillNow = S.fill && bar === S.bars - 1 && stp >= 12;
        if (fillNow && l[0] === "snare") v = stp % 2 ? 1 : 2; if (fillNow && (l[0] === "hat" || l[0] === "ohat")) v = 0;
        if (!v) return; var tk = (bar * 16 + stp) * T; dr.push([tk, [153, l[3], v === 2 ? 112 : 76], 1], [tk + 12, [137, l[3], 0], 0]);
      });
      var bytes = [77, 84, 104, 100].concat(be32(6), [0, 1, 0, 4, 0, 96], mtrack(meta), mtrack(ch), mtrack(bs), mtrack(dr));
      return new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
    }
    function saveFile(blob, file, url) {   /* the share sheet's Save to Files, or a download where sharing files isn't offered */
      var f = typeof File === "function" ? new File([blob], file, { type: blob.type }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: file }).catch(function () { /* closed the sheet */ }); return; }
      var u = url || URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = file; document.body.appendChild(a); a.click(); a.remove();
      if (!url) setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
    }
    function toggleRec() {
      if (X.rec) { X.rec.mr.stop(); return; }
      if (!X.on) setPower(true);
      if (!recDest || typeof MediaRecorder === "undefined") { toast("This iPad can't record here"); return; }
      var type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0], chunks = [], mr;
      try { mr = new MediaRecorder(recDest.stream, type ? { mimeType: type } : undefined); } catch (e) { toast("This iPad can't record here"); return; }
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        var mime = mr.mimeType || type || "audio/webm", blob = new Blob(chunks, { type: mime }), n = new Date();
        X.takes.unshift({ n: "TAKE " + (X.takes.length + 1), url: URL.createObjectURL(blob), blob: blob, file: "Ressikan " + ymd(n) + " " + p2(n.getHours()) + p2(n.getMinutes()) + p2(n.getSeconds()) + (/mp4/.test(mime) ? ".m4a" : ".webm") });
        if (X.takes.length > 6) URL.revokeObjectURL(X.takes.pop().url);
        X.rec = null; if (state.screen === "ressikan") draw();
      };
      mr.start(250); X.rec = { mr: mr, at: Date.now() }; draw();
      clearInterval(X.recT); X.recT = setInterval(function () { var el = document.querySelector("[data-rsrecinfo]"); if (!X.rec) { clearInterval(X.recT); return; } if (el) el.textContent = "Recording · " + Math.floor((Date.now() - X.rec.at) / 1000) + " s"; }, 500);
    }

    /* ---- the screen ---- */
    var KN = { "k.tempo": ["TEMPO", "bpm"], "k.swing": ["SWING", "swing"], "k.chords": ["CHORDS", "pct"], "k.bass": ["BASS", "pct"], "k.beat": ["BEAT", "pct"], "k.solo": ["SOLO", "pct"],
      "k.glide": ["GLIDE", "pct"], "k.vib": ["VIBRATO", "pct"], "fx.echo": ["ECHO", "pct"], "fx.space": ["SPACE", "pct"], "fx.lofi": ["LO-FI", "pct"], "fx.wow": ["WOW", "pct"] };
    var FMT = { pct: function (v) { return Math.round(v * 100) + "%"; }, bpm: function (v) { return Math.round(60 + v * 80) + " BPM"; }, swing: function (v) { return Math.round(v * 60) + "%"; } };
    function K(id, c) { var p = id.split("."), v = S[p[0]][p[1]]; return '<div class="rs-knob"><div class="rs-dial" role="slider" tabindex="0" aria-label="' + KN[id][0] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v * 100) + '" data-rsk="' + id + '" style="--v:' + v + (c ? ";--kc: var(--" + c + ")" : "") + '"><i></i></div><span class="rs-kl">' + KN[id][0] + '</span><span class="rs-kv" data-rskv="' + id + '">' + FMT[KN[id][1]](v) + "</span></div>"; }
    function chips(attr, opts, cur, c) { return '<div class="rs-chips">' + opts.map(function (o) { return '<button type="button" class="chip sm" data-' + attr + '="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '"' + (c ? ' style="--c: var(--' + c + ')"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>"; }
    function tog(act, on, label, c) { return '<button type="button" class="chip sm" data-rsact="' + act + '" aria-pressed="' + !!on + '"' + (c ? ' style="--c: var(--' + c + ')"' : "") + ">" + label + "</button>"; }
    function frow(label, inner) { return '<div class="rs-frow"><span class="rs-lab">' + label + '</span><div class="rs-fc">' + inner + "</div></div>"; }   /* 2.82.1: one labelled row per group, so groups never run on */
    function panel(c, title, meta, inner, cls) { return '<section class="rs-panel' + (cls ? " " + cls : "") + '" style="--c: var(--' + c + ')">' + phead(title, meta, c) + inner + "</section>"; }
    function readText() { return !X.on ? (X.lost ? "IPADOS PAUSED THE SOUND · TAP TO START AGAIN" : "SOUND OFF · TAP PLAY OR A PAD") : X.play ? "BAR " + (X.pos.slot > -1 ? Math.floor(X.pos.slot * S.every / 16) + 1 : 1) + " OF " + S.bars : "STOPPED · " + pcName(S.key) + " " + S.mode.toUpperCase(); }
    function soundStrip() {
      return panel("chrome-b", "SOUND", "ON THIS IPAD · ONE ROOM FOR EVERYTHING", '<div class="rs-row"><button type="button" class="rs-power" data-rsact="power" aria-pressed="' + X.on + '">' + (X.on ? "■ SOUND OFF" : "▶ SOUND ON") + "</button>" +
        '<div class="rs-knobs">' + K("fx.echo") + K("fx.space") + K("fx.lofi", "chrome-d") + K("fx.wow", "chrome-d") + '</div><span class="rs-sep"></span>' + tog("vinyl", S.vinyl, "VINYL", "chrome-d") +
        '<button type="button" class="rs-rec" data-rsact="rec" aria-pressed="' + !!X.rec + '"><i></i>' + (X.rec ? "STOP" : "RECORD") + '</button><span class="muted" data-rsrecinfo>' + (X.rec ? "Recording · 0 s" : "Takes save to Files") + "</span></div>" +
        (X.takes.length ? '<div class="rs-takes">' + X.takes.map(function (tk, i) { return '<div class="rs-take"><b>' + esc(tk.n) + '</b><audio controls src="' + tk.url + '"></audio><button type="button" class="chip sm" data-rssave="' + i + '">SAVE TO FILES</button></div>'; }).join("") + "</div>" : ""));
    }
    function cardsHtml() {
      var now = X.play && X.pos.slot > -1 && slots[X.pos.slot] ? chordName(slots[X.pos.slot]) : "";
      return '<div class="rs-cards">' +
        '<button type="button" class="rs-card" data-rscard="chords" aria-pressed="' + (S.card === "chords") + '" style="--c: var(--chrome-d)"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="5" y="9" width="9" height="26" rx="3"/><rect x="18" y="9" width="9" height="26" rx="3"/><rect x="31" y="9" width="9" height="26" rx="3"/></svg><b>CHORDS</b><small data-rscardinfo="chords">' + (X.play ? '<span class="rs-live">● ' + bpm() + " BPM</span> · " + esc(now) : "Chords over a beat") + "</small></button>" +
        '<button type="button" class="rs-card" data-rscard="solo" aria-pressed="' + (S.card === "solo") + '" style="--c: var(--chrome-a)"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M4 30c5-10 9-14 14-8s9 2 13-8 7-6 9-4"/><circle cx="14" cy="34" r="3" fill="currentColor"/><circle cx="31" cy="12" r="3" fill="currentColor"/></svg><b>SOLO</b><small data-rscardinfo="solo">' + (S.solo.sound.toUpperCase() + " · " + SSCALES[S.solo.scale].n) + "</small></button></div>";
    }
    function loopHtml() {
      var n = slotCount(), sl = "";
      for (var i = 0; i < n; i++) {
        var s = slots[i], bar = Math.floor(i * S.every / 16) + 1;
        sl += '<div class="rs-slotw"><button type="button" class="rs-slot' + (s ? "" : " empty") + (X.sel === i ? " sel" : "") + '" data-rsslot="' + i + '" style="--f: var(--' + (s ? FNC[fnOf(s)] : "line") + ')"><span class="rs-bar">BAR ' + bar + (S.every === 8 ? (i % 2 ? "·B" : "·A") : "") + "</span>" +
          '<span class="rs-num">' + (s ? numeral(s) : "—") + '</span><span class="rs-nm">' + (s ? chordName(s) : "Empty") + "</span></button>" +
          (X.sel === i && s ? '<button type="button" class="rs-x" data-rsclear="' + i + '" aria-label="Clear bar ' + bar + '">✕</button>' : "") + "</div>";
      }
      return panel("chrome-c", "THE LOOP", '<span data-rsloopinfo>' + S.bars + " BARS · " + pcName(S.key) + " " + S.mode.toUpperCase() + "</span>",
        '<div class="rs-row"><button type="button" class="rs-go" data-rsact="play" aria-pressed="' + X.play + '">' + (X.play ? "■ STOP" : "▶ PLAY") + "</button>" +
          '<div class="rs-knobs">' + K("k.tempo", "hero") + K("k.swing", "hero") + "</div>" +
          '<span class="rs-key"><span class="rs-lab">KEY</span><button type="button" class="chip sm" data-rskey="-1" aria-label="Key down">−</button><b>' + pcName(S.key) + '</b><button type="button" class="chip sm" data-rskey="1" aria-label="Key up">+</button></span>' +
          chips("rsmode", [["major", "MAJOR"], ["minor", "MINOR"]], S.mode, "personal") + '<span class="rs-read" data-rsread>' + readText() + "</span></div>" +
        '<div class="rs-row"><span class="rs-lab">START FROM</span>' + chips("rsstart", Object.keys(STARTS).map(function (k) { return [k, STARTS[k].n]; }), "") + tog("surprise", false, "✦ SURPRISE", "hero") + "</div>" +
        '<div class="rs-slots' + (S.every === 8 ? " half" : "") + '" style="--n: ' + Math.min(n, 8) + '">' + sl + "</div>" +
        '<div class="rs-row"><span class="rs-lab">LENGTH</span>' + chips("rsbars", [[4, "4 BARS"], [8, "8 BARS"]], S.bars) + '<span class="rs-lab">A CHORD EVERY</span>' + chips("rsevery", [[16, "BAR"], [8, "HALF BAR"]], S.every) +
          '<span class="rs-grow"></span>' + tog("capture", X.capture, "● CAPTURE", "hobby") + "</div>" +
        '<p class="muted">' + (X.capture ? "CAPTURE is on: play the loop and tap pads in time; each lands in the bar it's played in." : "Tap a bar, then a pad, to write a chord. Or play the loop, turn on CAPTURE and tap pads in time.") + "</p>");
    }
    function padsHtml() {
      var follow = S.next && X.last && !S.borrow ? FOLLOW[S.mode][X.last.d] : [];
      return panel("chrome-d", "CHORDS", pcName(S.key) + " " + S.mode.toUpperCase() + (S.borrow ? " · BORROWED FROM " + S.mode.replace("major", "MINOR").replace("minor", "MAJOR").toUpperCase() : " · THE SEVEN THAT FIT"),
        '<div class="rs-pads">' + [0, 1, 2, 3, 4, 5, 6].map(function (d) {
          var s = { d: d, c: S.colour, b: S.borrow }, fn = fnOf(s);
          return '<button type="button" class="rs-pad' + (follow.indexOf(d) > -1 ? " next" : "") + '" data-rspad="' + d + '" style="--f: var(--' + FNC[fn] + ')"><span class="rs-pn">' + numeral(s) + '</span><span class="rs-pc">' + chordName(s) + '</span><span class="rs-fn">' + FNW[fn] + "</span></button>";
        }).join("") + "</div>" +
        '<div class="rs-row"><span class="rs-lab">COLOUR</span>' + chips("rscolour", COLOURS, S.colour) + tog("borrow", S.borrow, "BORROW", "work") + tog("next", S.next, "NEXT?", "hero") +
          '<span class="rs-grow"></span><span class="rs-legend"><i style="--f: var(--personal)"></i>HOME <i style="--f: var(--work)"></i>AWAY <i style="--f: var(--hobby)"></i>TENSION</span></div>');
    }
    function playHtml() {
      return panel("chrome-b", "HOW THEY PLAY", "VOICE LEADING ON",
        '<div class="rs-form">' + frow("SOUND", chips("rssound", CSOUNDS, S.sound, "chrome-b")) + frow("STYLE", chips("rsstyle", STYLES, S.style, "chrome-b")) +
          (S.style === "arp" ? frow("ARP", chips("rsarp", [["up", "UP"], ["down", "DOWN"], ["updown", "UP·DOWN"], ["random", "RANDOM"]], S.arp, "chrome-b") + chips("rsrate", [[2, "8THS"], [1, "16THS"]], S.rate, "chrome-b")) : "") +
          frow("BASS", tog("bass", S.bass, "FOLLOWS THE ROOT", "chrome-b")) + frow("LEVELS", '<div class="rs-knobs">' + K("k.chords", "chrome-b") + K("k.bass", "chrome-b") + "</div>") + "</div>");
    }
    function beatHtml() {
      var top = '<span></span>' + [0, 1, 2, 3].map(function (g) { return '<div class="rs-bg">' + ["", "e", "&", "a"].map(function (x, i) { return '<span class="rs-cn' + (i ? "" : " b") + '">' + (i ? x : g + 1) + "</span>"; }).join("") + "</div>"; }).join("");
      var rows = LANES.map(function (l, li) {
        var muted = S.mute.indexOf(l[0]) > -1, cells = "";
        for (var g = 0; g < 4; g++) { cells += '<div class="rs-bg">'; for (var i = 0; i < 4; i++) { var k = g * 4 + i, v = G[li][k]; cells += '<button type="button" class="rs-cell' + (v ? " on" : "") + (v === 2 ? " acc" : "") + '" data-rscell="' + li + ":" + k + '" style="--lc: ' + l[2] + '" aria-label="' + l[1] + " step " + (k + 1) + (v === 2 ? ", accent" : v ? ", on" : ", off") + '"></button>'; } cells += "</div>"; }
        return '<button type="button" class="rs-lane' + (muted ? " muted" : "") + '" data-rslane="' + l[0] + '" aria-pressed="' + muted + '">' + l[1] + (muted ? " <small>MUTED</small>" : "") + "</button>" + cells;
      }).join("");
      return panel("hobby", "THE BEAT", "16 STEPS · ONE BAR, REPEATED",
        '<div class="rs-form">' + frow("KIT", chips("rskit", ["dusty", "808", "acoustic", "minimal"].map(function (k) { return [k, KITS[k].n]; }), S.kit, "hobby")) + frow("PATTERN", chips("rspat", Object.keys(PATS).map(function (k) { return [k, PATS[k].n]; }), S.pat, "hobby")) + "</div>" +
        '<div class="rs-gridw"><div class="rs-grid">' + top + rows + "</div></div>" +
        '<div class="rs-row">' + tog("fill", S.fill, "FILL ON THE LAST BAR", "hobby") + tog("human", S.human, "HUMANIZE", "hobby") + '<div class="rs-knobs">' + K("k.beat", "hobby") + "</div>" +
          '<p class="muted">Tap a step to turn it on, again for an accent, again to clear. Tap a lane\'s name to mute it.</p></div>');
    }
    function loopsHtml() {
      var full = S.loops.length >= MAXLOOPS;
      return panel("chrome-c", "MY LOOPS", S.loops.length + " OF " + MAXLOOPS + " · THIS IPAD",
        '<div class="rs-row"><input id="rsLoopName" class="rs-name" maxlength="40" placeholder="Loop ' + (S.loops.length + 1) + '" aria-label="Name for this loop"><button type="button" class="chip" data-rsact="saveloop"' + (full ? " disabled" : "") + ">SAVE THIS LOOP</button>" +
          '<button type="button" class="chip" data-rsact="midi">SAVE AS MIDI</button></div>' +
        (full ? '<p class="muted">12 loops kept: remove one to save another, or save over one by using its name.</p>' : "") +
        (S.loops.length ? '<div class="rs-loops">' + S.loops.map(function (L, i) {
          var s = (L.slots || []).map(dec).filter(Boolean).length;
          return '<div class="rs-lp"><button type="button" class="rs-lpo" data-rsloop="' + i + '"><b>' + esc(L.n) + "</b><span>" + esc(keyName(L.key, L.mode) + " " + L.mode) + " · " + Math.round(60 + L.tempo * 80) + " BPM · " + s + " chords</span></button>" +
            '<button type="button" class="chip sm" data-rsdel="' + i + '"' + (X.delAsk === i ? ' style="--c: var(--bad)" aria-pressed="true">REMOVE?' : ">✕") + "</button></div>"; }).join("") + "</div>" :
          '<p class="muted">Save the loop you\'re playing (chords, beat and how they play) to come back to it. SAVE AS MIDI sends it to Files for GarageBand: chords, bass and drums on their own tracks.</p>'));
    }
    function soloHtml() {
      var lit = soloLit(), rows = soloNotes(), nx = X.play && X.pos.slot > -1 ? slots[(X.pos.slot + 1) % slotCount()] : null;
      var pad = function (m) { var pc = ((m % 12) + 12) % 12, cls = lit && lit.pcs.indexOf(pc) > -1 ? (pc === lit.root ? " tone root" : " tone") : ""; return '<button type="button" class="rs-note' + cls + '" data-rsnote="' + m + '"><b>' + pcName(pc) + "</b><span>" + Math.floor(m / 12 - 1) + "</span></button>"; };
      return panel("chrome-a", "SOLO", "OVER THE LOOP · " + SSCALES[S.solo.scale].n + " IN " + pcName(S.key) + " " + S.mode.toUpperCase(),
        '<div class="rs-row"><button type="button" class="rs-go" data-rsact="play" aria-pressed="' + X.play + '">' + (X.play ? "■ STOP" : "▶ PLAY") + "</button>" +
          '<span class="rs-now" data-rsnow>' + (lit ? "<b>" + (X.play ? "NOW" : "FIRST") + "</b> " + esc(chordName(lit.s)) + " <i>" + esc(numeral(lit.s)) + "</i>" + (nx ? " <b>NEXT</b> " + esc(chordName(nx)) : "") : "<b>NO CHORDS YET</b> Write some on CHORDS") + "</span>" +
          '<span class="rs-grow"></span><span class="rs-read" data-rsread>' + readText() + "</span></div>" +
        '<div class="rs-solo" data-rssolo style="--cols: ' + rows[1].length + '">' + rows.slice().reverse().map(function (r) { return '<div class="rs-srow">' + r.map(pad).join("") + "</div>"; }).join("") + "</div>" +
        '<div class="rs-form">' + frow("SOUND", chips("rsssound", SSOUNDS, S.solo.sound, "chrome-a")) + frow("NOTES", chips("rsscale", Object.keys(SSCALES).map(function (k) { return [k, SSCALES[k].n]; }), S.solo.scale, "chrome-a")) + "</div>" +
        '<div class="rs-row"><span class="rs-key"><span class="rs-lab">OCTAVE</span><button type="button" class="chip sm" data-rsoct="-1" aria-label="Octave down"' + (S.solo.oct < 0 ? " disabled" : "") + '>−</button><b>' + (S.solo.oct > 0 ? "+1" : S.solo.oct < 0 ? "−1" : "0") + '</b><button type="button" class="chip sm" data-rsoct="1" aria-label="Octave up"' + (S.solo.oct > 0 ? " disabled" : "") + ">+</button></span>" +
          '<div class="rs-knobs">' + K("k.glide", "chrome-a") + K("k.vib", "chrome-a") + K("k.solo", "chrome-a") + "</div></div>" +
        '<p class="muted">Lit notes are in the chord playing now: land on one and it always fits. Hold for a long note, slide across to glide between notes. Every note here belongs to the key, so nothing is wrong.</p>');
    }
    function head() { return { e: "REFLECT · RESSIKAN · " + S.card.toUpperCase() + (X.play ? " · " + bpm() + " BPM" : ""), t: "RESSIKAN" }; }
    function draw() {
      $("content").innerHTML = '<div class="rs">' + soundStrip() + cardsHtml() + (S.card === "chords" ? loopHtml() + padsHtml() + playHtml() + beatHtml() + loopsHtml() : soloHtml()) + "</div>";
      document.querySelectorAll("#content [data-rsk]").forEach(bindKnob);
      document.querySelectorAll("#content [data-rspad]").forEach(function (b) { b.addEventListener("pointerdown", function (e) { if (e.button > 0) return; X.padAt = performance.now(); padTap(+b.dataset.rspad); }); });   /* on touch, not on lift: an instrument */
      var so = document.querySelector("#content [data-rssolo]"); if (so) bindSolo(so);
      var root = document.querySelector("#content .rs");   /* 2.82.1: a held press must never lift a bar or pad out as an iPadOS drag, or open a menu */
      ["dragstart", "contextmenu", "selectstart"].forEach(function (ev) { root.addEventListener(ev, function (e) { if (!e.target.closest || !e.target.closest("input, audio")) e.preventDefault(); }); });
      paint(); paintPlay();
    }
    function paint() {
      if (state.screen !== "ressikan") return;
      var h = head(), e = $("eyebrow"); if (e) e.textContent = h.e;
      document.querySelectorAll("#content [data-rsread]").forEach(function (el) { el.textContent = readText(); });
      var p = document.querySelector('#content [data-rsact="power"]'); if (p) { p.setAttribute("aria-pressed", X.on); p.textContent = X.on ? "■ SOUND OFF" : "▶ SOUND ON"; }
    }
    var lastSlot = -2;
    function paintPlay() {   /* the playhead, the bar playing, the chord to solo over: classes only, so a touch in progress is never redrawn */
      if (state.screen !== "ressikan") return;
      var c = $("content"); if (!c) return;
      c.querySelectorAll(".rs-cell.ph").forEach(function (el) { el.classList.remove("ph"); });
      if (X.play && X.pos.step > -1) c.querySelectorAll('[data-rscell$=":' + X.pos.step + '"]').forEach(function (el) { el.classList.add("ph"); });
      c.querySelectorAll(".rs-slot").forEach(function (b) { b.classList.toggle("now", X.play && +b.dataset.rsslot === X.pos.slot); });
      c.querySelectorAll("[data-rsread]").forEach(function (el) { el.textContent = readText(); });
      if (X.pos.slot !== lastSlot) {
        lastSlot = X.pos.slot;
        var lit = soloLit(), nowEl = c.querySelector("[data-rsnow]");
        c.querySelectorAll("[data-rsnote]").forEach(function (b) { var pc = ((+b.dataset.rsnote % 12) + 12) % 12, on = lit && lit.pcs.indexOf(pc) > -1; b.classList.toggle("tone", !!on); b.classList.toggle("root", !!on && pc === lit.root); });
        if (nowEl && lit) { var nx = X.play && X.pos.slot > -1 ? slots[(X.pos.slot + 1) % slotCount()] : null; nowEl.innerHTML = "<b>" + (X.play ? "NOW" : "FIRST") + "</b> " + esc(chordName(lit.s)) + " <i>" + esc(numeral(lit.s)) + "</i>" + (nx ? " <b>NEXT</b> " + esc(chordName(nx)) : ""); }
        var ci = c.querySelector('[data-rscardinfo="chords"]'); if (ci) ci.innerHTML = X.play ? '<span class="rs-live">● ' + bpm() + " BPM</span> · " + esc(lit ? chordName(lit.s) : "") : "Chords over a beat";
      }
      var h = $("eyebrow"); if (h) h.textContent = head().e;
    }
    function bindKnob(el) {
      var id = el.dataset.rsk, p = id.split("."), y0 = 0, v0 = 0;
      var set = function (v) { v = Math.max(0, Math.min(1, v)); S[p[0]][p[1]] = v; el.style.setProperty("--v", v); el.setAttribute("aria-valuenow", Math.round(v * 100)); var t = document.querySelector('#content [data-rskv="' + id + '"]'); if (t) t.textContent = FMT[KN[id][1]](v); applyFx(); keep(); };
      el.addEventListener("pointerdown", function (e) { try { el.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } y0 = e.clientY; v0 = S[p[0]][p[1]]; e.preventDefault(); });
      el.addEventListener("pointermove", function (e) { if (el.hasPointerCapture(e.pointerId)) set(v0 + (y0 - e.clientY) / 180); });
      el.addEventListener("keydown", function (e) { if (e.key === "ArrowUp" || e.key === "ArrowRight") { set(S[p[0]][p[1]] + .05); e.preventDefault(); } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { set(S[p[0]][p[1]] - .05); e.preventDefault(); } });
    }
    function click(b) {
      if (state.screen !== "ressikan") return false;
      var d = b.dataset;
      if (d.rsact === "power") { setPower(!X.on); draw(); }
      else if (d.rsact === "play") { setPlay(!X.play); draw(); }
      else if (d.rsact === "rec") toggleRec();
      else if (d.rsact === "vinyl") { S.vinyl = !S.vinyl; applyFx(); keep(); draw(); }
      else if (d.rsact === "capture") { X.capture = !X.capture; if (X.capture && !X.play) toast("CAPTURE is on: tap PLAY, then play pads in time"); draw(); }
      else if (d.rsact === "surprise") { surprise(); keep(); draw(); }
      else if (d.rsact === "borrow") { S.borrow = !S.borrow; keep(); draw(); }
      else if (d.rsact === "next") { S.next = !S.next; keep(); draw(); }
      else if (d.rsact === "bass") { S.bass = !S.bass; keep(); draw(); }
      else if (d.rsact === "fill") { S.fill = !S.fill; keep(); draw(); }
      else if (d.rsact === "human") { S.human = !S.human; keep(); draw(); }
      else if (d.rsact === "saveloop") { saveLoop(); draw(); }
      else if (d.rsact === "midi") { var n = new Date(); saveFile(midiFile(), "Ressikan " + pcName(S.key).replace("♭", "b").replace("♯", "#") + " " + S.mode + " " + ymd(n) + " " + p2(n.getHours()) + p2(n.getMinutes()) + ".mid"); }
      else if (d.rssave) { var tk = X.takes[+d.rssave]; if (tk) saveFile(tk.blob, tk.file, tk.url); }
      else if (d.rscard) { S.card = d.rscard; if (S.card !== "solo") soloAllOff(); lastSlot = -2; keep(); draw(); }
      else if (d.rskey) { S.key = (S.key + Number(d.rskey) + 12) % 12; lastV = null; keep(); draw(); }
      else if (d.rsmode) { S.mode = d.rsmode; lastV = null; keep(); draw(); }
      else if (d.rsstart) { loadStart(d.rsstart); keep(); draw(); }
      else if (d.rsclear !== undefined) { slots[+d.rsclear] = null; keep(); draw(); }
      else if (d.rsslot !== undefined) { var i = +d.rsslot; X.sel = X.sel === i ? null : i; if (slots[i]) { X.last = slots[i]; preview(slots[i]); } draw(); }
      else if (d.rsbars) { S.bars = +d.rsbars; fitSlots(); if (X.sel !== null && X.sel >= slotCount()) X.sel = null; keep(); draw(); }
      else if (d.rsevery) { var ne = +d.rsevery; if (ne !== S.every) { var res = []; if (ne === 8) slots.forEach(function (s) { res.push(s, s); }); else for (var j = 0; j < slots.length; j += 2) res.push(slots[j]); slots = res; S.every = ne; X.sel = null; } keep(); draw(); }
      else if (d.rspad !== undefined) { if (performance.now() - X.padAt > 800) padTap(+d.rspad); }   /* the keyboard's Enter or Space; a touch already played on pointerdown */
      else if (d.rscolour !== undefined) { S.colour = d.rscolour; keep(); draw(); }
      else if (d.rssound) { S.sound = d.rssound; keep(); draw(); if (X.last && X.on) preview(X.last); }
      else if (d.rsstyle) { S.style = d.rsstyle; keep(); draw(); }
      else if (d.rsarp) { S.arp = d.rsarp; S.style = "arp"; keep(); draw(); }
      else if (d.rsrate) { S.rate = +d.rsrate; S.style = "arp"; keep(); draw(); }
      else if (d.rskit) { S.kit = d.rskit; applyFx(); keep(); draw(); }
      else if (d.rspat) { S.pat = d.rspat; G = decGrid(PATS[d.rspat].g); keep(); draw(); }
      else if (d.rslane) { var mi = S.mute.indexOf(d.rslane); if (mi > -1) S.mute.splice(mi, 1); else S.mute.push(d.rslane); keep(); draw(); }
      else if (d.rscell) { var pc = d.rscell.split(":"), li = +pc[0], k = +pc[1]; G[li][k] = (G[li][k] + 1) % 3; S.pat = ""; keep(); draw(); if (G[li][k] && X.on && !X.play) DRUM[LANES[li][0]](A.currentTime + .01, G[li][k] === 2 ? 1 : .6, KITS[S.kit][LANES[li][0]]); }
      else if (d.rsloop !== undefined) { var L = S.loops[+d.rsloop]; if (L) { openLoop(L); X.delAsk = -1; toast("Opened " + L.n); draw(); } }
      else if (d.rsdel !== undefined) { var di = +d.rsdel; if (X.delAsk === di) { var gone = S.loops.splice(di, 1)[0]; X.delAsk = -1; keep(); toast("Removed " + (gone ? gone.n : "the loop")); } else X.delAsk = di; draw(); }
      else if (d.rsssound) { S.solo.sound = d.rsssound; soloAllOff(); keep(); draw(); }
      else if (d.rsscale) { S.solo.scale = d.rsscale; keep(); draw(); }
      else if (d.rsoct) { S.solo.oct = Math.max(-1, Math.min(1, S.solo.oct + Number(d.rsoct))); soloAllOff(); keep(); draw(); }
      else return false;
      return true;
    }
    function leave() { if (X.rec) X.rec.mr.stop(); if (X.on) setPower(false); X.capture = false; X.sel = null; X.delAsk = -1; }   /* leaving the station: quiet */
    return { render: draw, head: head, click: click, leave: leave, card: function (k) { S.card = k === "solo" ? "solo" : "chords"; keep(); } };
  })();
  function renderRessikan() { rs.render(); }

