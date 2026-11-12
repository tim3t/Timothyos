  /* ---------- RESSIKAN (2.44): play with sound (REFLECT) ---------- */
  /* Named by Timothy after Picard's flute in "The Inner Light". All sound is made on this iPad with Web Audio: nothing to
     download, no keys, works offline. Two view cards: FIELD (a theremin over a beat ring: fixed slots and a sweeping beam,
     so beats are easy to place) and DRIFT (ambient that plays, lets you play, and sometimes answers). One room for both
     (echo on the beat, space, lo-fi, tape wow), scale lock with FREEFORM, and RECORD to Files. Settings are kept on this
     iPad (tos.ressikan.v1, and in backups); recordings go only where he saves them. Sound stops on leaving the station.
     Its own scope (an inner function) and rs- class names, so nothing here can collide with the rest of the app. */
  var LS_RESSIKAN = "tos.ressikan.v1";
  var rs = (function () {
    var DEF = { card: "field", place: "beside", scale: "pent", key: 9, fx: { echo: .28, space: .5, lofi: .25, wow: .3 },
      th: { wave: .3, glide: .3, range: .45, vib: .25, fold: 0, reso: .3, sub: 0, spread: .2, vowel: 0, ring: 0, trem: 0 }, across: "tone",
      bt: { tempo: .3, swing: .45, level: .7 }, vinyl: true, pat: "lofi", steps: null, lens: null,
      dr: { density: .4, bright: .45, depth: .5, answer: .5, bed: .4 }, dmode: "duet", bedKind: "surf" };
    var saved = lsGet(LS_RESSIKAN) || {}, S = {};
    Object.keys(DEF).forEach(function (k) { var d = DEF[k], v = saved[k]; S[k] = d && typeof d === "object" && !Array.isArray(d) ? Object.assign({}, d, v && typeof v === "object" ? v : {}) : v != null ? v : d; });
    var X = { on: false, beat: false, hold: false, sleep: 0, sleepAt: 0, rec: null, takes: [], raf: 0, saveT: 0 };
    function keep() { clearTimeout(X.saveT); X.saveT = setTimeout(function () { var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = S[k]; }); o.steps = steps; o.lens = LANES.map(function (l) { return l.len; }); lsSet(LS_RESSIKAN, o); }, 400); }

    var SCALES = { pent: { n: "PENTATONIC", s: [0, 3, 5, 7, 10] }, dorian: { n: "DORIAN", s: [0, 2, 3, 5, 7, 9, 10] }, hira: { n: "HIRAJOSHI", s: [0, 2, 3, 7, 8] }, whole: { n: "WHOLE TONE", s: [0, 2, 4, 6, 8, 10] }, free: { n: "FREEFORM", s: null } };
    var KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    var HUE = ["#56c7b8", "#c99bc4", "#f6c66b", "#9db0ff", "#e8a27a", "#7bd88f", "#dcc6a0"];
    if (!SCALES[S.scale]) S.scale = "pent";
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function snap(semi) { var scv = SCALES[S.scale].s; if (!scv) return semi; var o = Math.floor(semi / 12), r = semi - o * 12, best = 0, bd = 99; scv.concat([12]).forEach(function (d) { if (Math.abs(d - r) < bd) { bd = Math.abs(d - r); best = d; } }); return o * 12 + best; }
    function noteText(deg, oct) { var scv = SCALES[S.scale].s || [0, 2, 3, 5, 7, 9, 10], n = scv.length, o = Math.floor(deg / n); return 48 + S.key + (oct || 0) * 12 + o * 12 + scv[((deg % n) + n) % n]; }
    function mname(m) { return KEYS[((Math.round(m) % 12) + 12) % 12] + Math.floor(Math.round(m) / 12 - 1); }

    /* ---- the room: everything plays through one chain ---- */
    var A = null, bus, beatBus, master, recDest, dly, dlySend, verbSend, lofiWet, lofiDry, wowDepth, vinylG, bedG, bedF, bedLfo, bedLfoG;
    /* A fresh engine for every SOUND ON (2.44.1). iPadOS pauses Web Audio when something else takes the sound (another
       app, a call, Siri, the lock screen, STORAGE or Nova) and Safari leaves it "interrupted", a state the old code never
       woke from: silence with every setting right. Now SOUND ON builds a new engine inside the tap, SOUND OFF and
       leaving the station set it aside, and an interruption mid-play turns SOUND OFF so the next tap starts clean. */
    function start() {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      if (A) { var old = A; A = null; old.onstatechange = null; try { old.close(); } catch (e) { /* already closed */ } }
      A = new C({ latencyHint: "interactive" }); nbuf = null;
      A.onstatechange = function () { if (this === A && this.state !== "running" && X.on && !X.quiet) lost(); };
      try { A.resume(); } catch (e) { /* resumes with the first sound */ }
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older iPadOS: the silent setting may mute it */ }
      bus = A.createGain(); beatBus = A.createGain(); beatBus.connect(bus);
      var wow = A.createDelay(.1); wow.delayTime.value = .012; var wl = A.createOscillator(); wl.frequency.value = .55; wowDepth = A.createGain(); wl.connect(wowDepth); wowDepth.connect(wow.delayTime); wl.start(); bus.connect(wow);
      var crush = A.createWaveShaper(), cv = new Float32Array(2048); for (var i = 0; i < 2048; i++) cv[i] = Math.round(Math.tanh((i / 1024 - 1) * 1.8) * 10) / 10; crush.curve = cv;
      var lp = A.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600; var hp = A.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 90;
      lofiWet = A.createGain(); lofiDry = A.createGain(); wow.connect(lofiDry); wow.connect(crush); crush.connect(lp); lp.connect(hp); hp.connect(lofiWet);
      var mix = A.createGain(); lofiDry.connect(mix); lofiWet.connect(mix);
      var comp = A.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; master = A.createGain(); master.gain.value = 0; mix.connect(comp);
      dly = A.createDelay(2); var fb = A.createGain(); fb.gain.value = .36; var dlp = A.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 2300;
      dlySend = A.createGain(); mix.connect(dlySend); dlySend.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(comp);
      var verb = A.createConvolver(), len = A.sampleRate * 3.4, ir = A.createBuffer(2, len, A.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var dd = ir.getChannelData(ch); for (var j = 0; j < len; j++) dd[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.5); }
      verb.buffer = ir; verbSend = A.createGain(); mix.connect(verbSend); verbSend.connect(verb); verb.connect(comp);
      comp.connect(master); master.connect(A.destination);
      try { recDest = A.createMediaStreamDestination(); master.connect(recDest); } catch (e) { recDest = null; }
      var vb = A.createBuffer(1, A.sampleRate * 4, A.sampleRate), vd = vb.getChannelData(0); for (var k = 0; k < vd.length; k++) vd[k] = (Math.random() * 2 - 1) * .012 + (Math.random() < .0004 ? (Math.random() * 2 - 1) * .7 : 0);
      var vs = A.createBufferSource(); vs.buffer = vb; vs.loop = true; var vf = A.createBiquadFilter(); vf.type = "bandpass"; vf.frequency.value = 2400; vf.Q.value = .4; vinylG = A.createGain(); vinylG.gain.value = 0; vs.connect(vf); vf.connect(vinylG); vinylG.connect(mix); vs.start();
      var nb = A.createBuffer(1, A.sampleRate * 3, A.sampleRate), nd = nb.getChannelData(0); for (var q = 0, last = 0; q < nd.length; q++) { var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; nd[q] = last * 1.75 + w * .5; }
      var bs = A.createBufferSource(); bs.buffer = nb; bs.loop = true; bedF = A.createBiquadFilter(); bedG = A.createGain(); bedG.gain.value = 0; bedLfo = A.createOscillator(); bedLfoG = A.createGain(); bedLfo.connect(bedLfoG);
      bs.connect(bedF); bedF.connect(bedG); bedG.connect(bus); bs.start(); bedLfo.start();
      if (!X.ticking) { X.ticking = true; setInterval(beatTick, 25); driftTick(); }
      return true;
    }
    function applyFx() {
      if (!A) return; var t = A.currentTime;
      dly.delayTime.setTargetAtTime(60 / bpm() * .75, t, .1);   /* echo on the beat: a dotted eighth */
      dlySend.gain.setTargetAtTime(S.fx.echo * .7, t, .05); verbSend.gain.setTargetAtTime(S.fx.space * 1.1, t, .05);
      lofiWet.gain.setTargetAtTime(S.fx.lofi, t, .05); lofiDry.gain.setTargetAtTime(1 - S.fx.lofi * .8, t, .05);
      wowDepth.gain.setTargetAtTime(S.fx.wow * .0035, t, .1);
      vinylG.gain.setTargetAtTime(S.vinyl && X.beat && X.on ? .9 : 0, t, .2);
      beatBus.gain.setTargetAtTime(S.bt.level * 1.1, t, .05);
    }
    function applyBed() {
      if (!A) return; var t = A.currentTime, k = S.bedKind, lvl = X.on && S.card === "drift" ? S.dr.bed : 0;   /* the bed and the drift belong to DRIFT; the beat carries on across both */
      bedLfoG.disconnect(); bedLfoG.connect(k === "surf" ? bedG.gain : bedF.frequency);
      if (k === "wind") { bedF.type = "bandpass"; bedF.Q.value = 3; bedF.frequency.setTargetAtTime(600, t, .3); bedLfo.frequency.value = .09; bedLfoG.gain.value = 420; bedG.gain.setTargetAtTime(lvl * .5, t, .5); }
      else if (k === "surf") { bedF.type = "lowpass"; bedF.Q.value = .5; bedF.frequency.setTargetAtTime(900, t, .3); bedLfo.frequency.value = .11; bedLfoG.gain.value = lvl * .22; bedG.gain.setTargetAtTime(lvl * .24, t, .5); }
      else if (k === "rain") { bedF.type = "highpass"; bedF.Q.value = .5; bedF.frequency.setTargetAtTime(2600, t, .3); bedLfo.frequency.value = .3; bedLfoG.gain.value = 300; bedG.gain.setTargetAtTime(lvl * .35, t, .5); }
      else bedG.gain.setTargetAtTime(0, t, .5);
    }
    function setPower(on) {
      if (on && !start()) { toast("This browser can't make sound here"); return; }
      if (!on && X.rec) X.rec.mr.stop();
      X.on = on; X.lost = false;
      if (A) {
        master.gain.setTargetAtTime(on ? .85 : 0, A.currentTime, .05);
        if (!on) { thRelease(true); X.beat = false; X.quiet = true; var a = A; setTimeout(function () { X.quiet = false; if (a === A && !X.on) try { a.suspend(); } catch (e) { /* closed */ } }, 300); }   /* hand the iPad's sound back */
      }
      applyFx(); applyBed(); paint();
    }
    function lost() {   /* iPadOS took the sound away mid-play */
      X.on = false; X.beat = false; X.lost = true; thV = {}; held = []; dr.touches = {};
      if (X.rec) X.rec.mr.stop();
      if (state.screen === "ressikan") draw();
    }

    /* ---- FIELD: the theremin ---- */
    var foldCurves = {};
    function foldCurve(f) { var k = Math.round(f * 20); if (foldCurves[k]) return foldCurves[k]; var c = new Float32Array(1024), g = 1 + k / 20 * 7; for (var i = 0; i < 1024; i++) c[i] = Math.sin((i / 512 - 1) * g * Math.PI / 2); return (foldCurves[k] = c); }
    var VOWELS = [[800, 1150, 2900], [400, 1600, 2700], [350, 2300, 3000], [450, 800, 2830], [325, 700, 2530]];   /* a, e, i, o, u */
    function vowelAt(p) { var f = Math.max(0, Math.min(.999, p)) * 4, i = Math.floor(f), r = f - i; return VOWELS[i].map(function (v, j) { return v + (VOWELS[i + 1][j] - v) * r; }); }
    var thV = {}, held = [];
    function thVoice() {
      var v = { o1: A.createOscillator(), o2: A.createOscillator(), o3: A.createOscillator(), sub: A.createOscillator(), g1: A.createGain(), g2: A.createGain(), g3: A.createGain(), gs: A.createGain(),
        sum: A.createGain(), fold: A.createWaveShaper(), rm: A.createOscillator(), rmG: A.createGain(), ringAmp: A.createGain(), f: A.createBiquadFilter(),
        fd: A.createGain(), fw: A.createGain(), bp: [A.createBiquadFilter(), A.createBiquadFilter(), A.createBiquadFilter()], trem: A.createOscillator(), tremG: A.createGain(), tremAmp: A.createGain(),
        lfo: A.createOscillator(), lg: A.createGain(), g: A.createGain(), pan: A.createStereoPanner ? A.createStereoPanner() : A.createGain(), x: .5, y: .5, p: .5, semi: 0, m: 60, trail: [] };
      v.o1.type = "sine"; v.o2.type = "sawtooth"; v.o3.type = "sawtooth"; v.sub.type = "sine"; v.f.type = "lowpass"; v.lfo.frequency.value = 5.5; v.trem.frequency.value = 6; v.g.gain.value = 0;
      v.o1.connect(v.g1); v.o2.connect(v.g2); v.o3.connect(v.g3); v.sub.connect(v.gs); [v.g1, v.g2, v.g3, v.gs].forEach(function (n) { n.connect(v.sum); });
      v.sum.connect(v.fold); v.fold.connect(v.ringAmp); v.rm.connect(v.rmG); v.rmG.connect(v.ringAmp.gain);
      v.ringAmp.connect(v.f); v.f.connect(v.fd); v.bp.forEach(function (b) { b.type = "bandpass"; b.Q.value = 9; v.f.connect(b); b.connect(v.fw); });
      v.fd.connect(v.tremAmp); v.fw.connect(v.tremAmp); v.trem.connect(v.tremG); v.tremG.connect(v.tremAmp.gain); v.tremAmp.connect(v.g); v.g.connect(v.pan); v.pan.connect(bus);
      v.lfo.connect(v.lg); [v.o1, v.o2, v.o3, v.sub].forEach(function (o) { v.lg.connect(o.frequency); });
      [v.o1, v.o2, v.o3, v.sub, v.rm, v.trem, v.lfo].forEach(function (o) { o.start(); });
      return v;
    }
    function thApply(v) {   /* every knob, live, on a sounding voice */
      var t = A.currentTime, T = S.th, fq = hz(v.m), x = v.x, gl = .005 + T.glide * .35;
      [v.o1, v.o2].forEach(function (o) { o.frequency.setTargetAtTime(fq, t, gl); });
      v.o3.frequency.setTargetAtTime(fq * Math.pow(2, (4 + T.spread * 30) / 1200), t, gl); v.sub.frequency.setTargetAtTime(fq / 2, t, gl);
      v.g1.gain.setTargetAtTime((1 - T.wave) * .9, t, .03); v.g2.gain.setTargetAtTime(T.wave * .4, t, .03); v.g3.gain.setTargetAtTime(T.wave * .4 * T.spread * 1.6, t, .03); v.gs.gain.setTargetAtTime(T.sub * .8, t, .03);
      v.fold.curve = foldCurve(S.across === "fold" ? x : T.fold);
      var ringAmt = S.across === "ring" ? x : T.ring; v.rm.frequency.setTargetAtTime(fq * (1.41 + ringAmt * 2.3), t, .05); v.rmG.gain.setTargetAtTime(ringAmt * .9, t, .05); v.ringAmp.gain.setTargetAtTime(1 - ringAmt * .9, t, .05);
      v.f.frequency.setTargetAtTime(S.across === "tone" ? 180 + x * x * 7600 : 600 + T.reso * 200 + (1 - T.fold) * 5200, t, .04); v.f.Q.value = .7 + T.reso * 16;
      var vw = S.across === "vowel" ? 1 : T.vowel; vowelAt(S.across === "vowel" ? x : T.vowel).forEach(function (fr, i) { v.bp[i].frequency.setTargetAtTime(fr, t, .05); });
      v.fd.gain.setTargetAtTime(1 - vw * .9, t, .05); v.fw.gain.setTargetAtTime(vw * 3.2, t, .05);
      v.trem.frequency.setTargetAtTime(2 + T.trem * 10, t, .1); v.tremG.gain.setTargetAtTime(T.trem * .5, t, .05); v.tremAmp.gain.setTargetAtTime(1 - T.trem * .5, t, .05);
      v.lg.gain.setTargetAtTime(fq * .012 * (T.vib + (v.p > 0 && v.p !== .5 ? v.p : 0)), t, .05);   /* Apple Pencil pressure adds vibrato */
      if (v.pan.pan) v.pan.pan.setTargetAtTime((x - .5) * .8, t, .05);
    }
    function thMove(id, x, y, p) {
      if (!X.on) return;
      var v = thV[id] || (thV[id] = thVoice()), span = 12 + Math.round(S.th.range * 36);
      v.x = x; v.y = y; v.p = p; v.semi = snap((1 - y) * span); v.m = 48 + S.key - 12 + v.semi;
      thApply(v); v.g.gain.setTargetAtTime(.2, A.currentTime, .04);
      v.trail.push([x, y]); if (v.trail.length > 40) v.trail.shift();
    }
    function thKill(v) { v.g.gain.setTargetAtTime(0, A.currentTime, .15); setTimeout(function () { ["o1", "o2", "o3", "sub", "rm", "trem", "lfo"].forEach(function (k) { try { v[k].stop(); } catch (e) { /* stopped */ } }); }, 1200); }
    function thUp(id) { var v = thV[id]; if (!v) return; delete thV[id]; if (X.hold) { v.held = true; held.push(v); if (held.length > 4) thKill(held.shift()); draw(); } else { thKill(v); paint(); } }
    function thRelease(all) { held.forEach(thKill); held = []; if (all) Object.keys(thV).forEach(function (k) { thKill(thV[k]); delete thV[k]; }); }
    function thAll() { return Object.keys(thV).map(function (k) { return thV[k]; }).concat(held); }

    /* ---- FIELD: the beat ring (fixed slots, a sweeping beam) ---- */
    var LANES = [{ id: "kick", n: "KICK", c: "#e8a27a", len: 16 }, { id: "snare", n: "SNARE", c: "#dcc6a0", len: 16 }, { id: "hat", n: "HAT", c: "#9a86b5", len: 16 }, { id: "keys", n: "KEYS", c: "#56c7b8", len: 16 }];
    var PATS = {
      lofi: { n: "LOFI", s: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], keys: [0, 11] } },
      boom: { n: "BOOM BAP", s: { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], keys: [0] } },
      dub: { n: "DUB", s: { kick: [0, 8], snare: [12], hat: [2, 6, 10, 14], keys: [4, 12] } },
      motorik: { n: "MOTORIK", s: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], keys: [] } },
      sparse: { n: "SPARSE", s: { kick: [0], snare: [], hat: [8], keys: [0, 10] } },
      clear: { n: "CLEAR", s: { kick: [], snare: [], hat: [], keys: [] } } };
    var steps = {};
    function loadPat(k) { S.pat = k; LANES.forEach(function (l) { l.len = 16; steps[l.id] = PATS[k].s[l.id].slice(); }); keep(); }
    if (saved.steps && typeof saved.steps === "object") LANES.forEach(function (l, i) { var ln = saved.lens && [16, 12, 10, 8].indexOf(saved.lens[i]) > -1 ? saved.lens[i] : 16; l.len = ln; steps[l.id] = (saved.steps[l.id] || []).filter(function (s) { return s >= 0 && s < ln; }); });
    else loadPat(PATS[S.pat] ? S.pat : "lofi");
    var bt = { step: 0, nextAt: 0, flash: {}, t0: 0 };
    function bpm() { return 66 + S.bt.tempo * 54; }
    function beatTick() {
      if (!A || !X.beat || !X.on) return;
      var now = A.currentTime, sixteenth = 60 / bpm() / 4, ahead = document.hidden ? 1.5 : .12;   /* further ahead in the background, where timers slow down */
      if (bt.nextAt < now - .2) bt.nextAt = now + .05;
      while (bt.nextAt < now + ahead) {
        var g = bt.step, at = bt.nextAt + (g % 2 ? S.bt.swing * .33 * sixteenth : 0);
        LANES.forEach(function (l) { if (steps[l.id].indexOf(g % l.len) > -1) { hit(l.id, at, g); (function (id, w) { setTimeout(function () { bt.flash[id] = performance.now(); }, Math.max(0, (w - now) * 1000)); })(l.id, at); } });
        bt.step++; bt.nextAt += sixteenth;
      }
    }
    var nbuf; function noise() { if (nbuf) return nbuf; nbuf = A.createBuffer(1, A.sampleRate, A.sampleRate); var d = nbuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return nbuf; }
    var PROG = [0, 5, 3, 4];   /* a slow four-bar turn, in scale degrees */
    function hit(id, t, g) {
      var out = A.createGain(); out.connect(beatBus);
      if (id === "kick") { var o = A.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(44, t + .12); out.gain.setValueAtTime(.9, t); out.gain.exponentialRampToValueAtTime(.001, t + .42); o.connect(out); o.start(t); o.stop(t + .5); }
      else if (id === "snare") { var n = A.createBufferSource(); n.buffer = noise(); var f = A.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 4200; var h = A.createBiquadFilter(); h.type = "highpass"; h.frequency.value = 700; n.connect(f); f.connect(h); h.connect(out);
        out.gain.setValueAtTime(.42, t); out.gain.exponentialRampToValueAtTime(.001, t + .2); n.start(t); n.stop(t + .3);
        var b = A.createOscillator(), bg = A.createGain(); b.type = "triangle"; b.frequency.value = 180; bg.gain.setValueAtTime(.18, t); bg.gain.exponentialRampToValueAtTime(.001, t + .08); b.connect(bg); bg.connect(beatBus); b.start(t); b.stop(t + .1); }
      else if (id === "hat") { var hn = A.createBufferSource(); hn.buffer = noise(); var hf = A.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 7000; hn.connect(hf); hf.connect(out); out.gain.setValueAtTime(g % 4 === 2 ? .16 : .09, t); out.gain.exponentialRampToValueAtTime(.001, t + .05); hn.start(t); hn.stop(t + .08); }
      else { var root = PROG[Math.floor(g / 16) % 4], len = (SCALES[S.scale].s || [0, 2, 3, 5, 7, 9, 10]).length;
        [0, 2, 4, 6].forEach(function (k, i) { if (len < 6 && i === 3) return; var m = noteText(root + k, 0), c = A.createOscillator(), mo = A.createOscillator(), mg = A.createGain(), eg = A.createGain();
          c.frequency.value = hz(m); mo.frequency.value = hz(m) * 2; mg.gain.setValueAtTime(hz(m) * .9, t); mg.gain.exponentialRampToValueAtTime(hz(m) * .05, t + .8); mo.connect(mg); mg.connect(c.frequency);   /* a soft electric piano */
          eg.gain.setValueAtTime(.0001, t); eg.gain.exponentialRampToValueAtTime(.075, t + .01 + i * .012); eg.gain.exponentialRampToValueAtTime(.001, t + 1.8); c.connect(eg); eg.connect(out); c.start(t); mo.start(t); c.stop(t + 2); mo.stop(t + 2); }); }
    }
    function setBeat(on) { if (on && !X.on) setPower(true); if (!X.on) return; X.beat = on; if (on) { bt.step = 0; bt.nextAt = A.currentTime + .08; bt.t0 = bt.nextAt; } applyFx(); }

    /* ---- DRIFT: it plays, you play, it answers ---- */
    var dr = { blobs: [], ripples: [], timer: 0, touches: {} };
    function tone(m, t, dur, o) {
      o = o || {}; var f = A.createBiquadFilter(), g = A.createGain(), p = A.createStereoPanner ? A.createStereoPanner() : A.createGain();
      f.type = "lowpass"; f.frequency.value = 300 + (o.bright != null ? o.bright : S.dr.bright) * 3800; if (p.pan) p.pan.value = o.pan || 0;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || .1, t + (o.atk || dur * .35)); if (!o.hold) g.gain.linearRampToValueAtTime(0, t + dur);
      f.connect(g); g.connect(p); p.connect(bus);
      var os = (o.chime ? [0] : [0, 7, -5]).map(function (cents, i) { var osc = A.createOscillator(); osc.type = o.chime ? "sine" : i ? "triangle" : "sine"; osc.frequency.value = hz(m) * Math.pow(2, cents / 1200) * (i === 2 ? .5 : 1); osc.connect(f); osc.start(t); if (!o.hold) osc.stop(t + dur + .1); return osc; });
      return { g: g, os: os };
    }
    function driftTick() {
      clearTimeout(dr.timer); dr.timer = setTimeout(driftTick, 900 + (1 - S.dr.density) * 5200);
      if (X.sleep && Date.now() > X.sleepAt) { X.sleep = 0; setPower(false); if (state.screen === "ressikan") draw(); return; }
      if (!X.on || S.card !== "drift" || S.dmode === "play") return;
      var t = A.currentTime, deg = Math.floor(Math.random() * 7), m = noteText(deg, Math.round(S.dr.depth * 2) - 1), dur = 6 + Math.random() * 8;
      tone(m, t, dur, { pan: Math.random() * 1.2 - .6 }); if (Math.random() < .18) tone(noteText(deg + 7, 1), t, 4, { chime: true, vol: .08, atk: .01 });
      dr.blobs.push({ x: Math.random(), y: .15 + Math.random() * .6, r: .1 + Math.random() * .2, hue: deg, born: performance.now(), life: dur * 1000 }); if (dr.blobs.length > 16) dr.blobs.shift();
    }
    function driftDown(id, x, y) {
      if (S.dmode === "listen") return;
      var semi = snap((1 - y) * 24), m = 48 + S.key + semi - 6, t = A.currentTime;
      var bloom = tone(m, t, 8, { hold: true, atk: .04, vol: .14, pan: (x - .5) * 1.4, bright: x });
      tone(m + 12, t, 3, { chime: true, vol: .06, atk: .005, pan: (x - .5) * 1.4 });
      dr.touches[id] = { x: x, y: y, at: performance.now(), v: bloom, lastSemi: semi };
      dr.ripples.push({ x: x, y: y, born: performance.now(), hue: ((semi % 7) + 7) % 7, big: true });
      if (S.dmode === "duet" && Math.random() < S.dr.answer) {   /* the room answers back, later and softer, from the other side */
        var up = Math.random() < .5 ? 12 : 7;
        setTimeout(function () { if (!X.on || S.card !== "drift") return; tone(m + up, A.currentTime, 6, { chime: Math.random() < .5, vol: .06, pan: -(x - .5), atk: .02 }); dr.ripples.push({ x: 1 - x, y: Math.max(.05, y - .12), born: performance.now(), hue: 3, answer: true }); }, (2 + Math.random() * 7) * 1000);
      }
    }
    function driftMove(id, x, y) {   /* a drag scatters chimes as it crosses notes */
      var tc = dr.touches[id]; if (!tc) return; var semi = snap((1 - y) * 24);
      if (semi !== tc.lastSemi) { tc.lastSemi = semi; tone(48 + S.key + semi + 6, A.currentTime, 2.5, { chime: true, vol: .05, atk: .005, pan: (x - .5) * 1.4 }); dr.ripples.push({ x: x, y: y, born: performance.now(), hue: ((semi % 7) + 7) % 7 }); }
      tc.x = x; tc.y = y;
    }
    function driftUp(id) {   /* longer holds, longer tails */
      var tc = dr.touches[id]; if (!tc) return; delete dr.touches[id]; var t = A.currentTime, rel = 2 + Math.min(10, (performance.now() - tc.at) / 1000 * 1.5);
      tc.v.g.gain.cancelScheduledValues(t); tc.v.g.gain.setValueAtTime(tc.v.g.gain.value, t); tc.v.g.gain.linearRampToValueAtTime(0, t + rel); tc.v.os.forEach(function (o) { o.stop(t + rel + .1); });
    }

    /* ---- drawing ---- */
    var canv = [];
    function fit(cv) { var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); } return d; }
    function drawField(cv) {
      var d = fit(cv), x = cv.getContext("2d"), W = cv.width, H = cv.height, now = performance.now() / 1000, span = 12 + Math.round(S.th.range * 36), scv = SCALES[S.scale].s, vs = thAll(), still = calm();
      x.fillStyle = "rgba(4,4,8,.28)"; x.fillRect(0, 0, W, H); x.lineWidth = d; x.font = (11 * d) + "px Antonio, sans-serif";
      for (var s = 0; s <= span; s++) { var r = s % 12; if (scv && scv.indexOf(r) < 0) continue; var y = H - (s / span) * H; x.strokeStyle = r === 0 ? "rgba(246,198,107,.22)" : "rgba(154,134,181,.10)"; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); if (r === 0) { x.fillStyle = "rgba(246,198,107,.5)"; x.fillText(KEYS[S.key] + (2 + Math.floor(s / 12)), 8 * d, y - 4 * d); } }
      var pulse = !still && bt.flash.kick && performance.now() - bt.flash.kick < 140 ? .12 : 0;   /* the field breathes with the kick */
      for (var k = 0; k < 7; k++) { x.beginPath(); var yy = (k + .5) / 7 * H; for (var px = 0; px <= W; px += 12 * d) { var off = still ? 0 : Math.sin(px / W * 6 + now * .7 + k) * (4 + pulse * 60) * d; vs.forEach(function (v) { var dx = px - v.x * W, dy = yy - v.y * H, dd = Math.sqrt(dx * dx + dy * dy) + 40 * d; off += (v.y * H - yy) * 60 * d / dd * .6; }); if (px === 0) x.moveTo(px, yy + off); else x.lineTo(px, yy + off); } x.strokeStyle = "rgba(86,199,184," + (vs.length ? .22 : .08 + pulse) + ")"; x.stroke(); }
      vs.forEach(function (v, i) {
        var cx = v.x * W, cy = v.y * H, col = v.held ? "#f6c66b" : HUE[i % HUE.length];
        x.strokeStyle = col; x.globalAlpha = .5; x.lineWidth = 2 * d; x.beginPath(); v.trail.forEach(function (p, j) { if (j) x.lineTo(p[0] * W, p[1] * H); else x.moveTo(p[0] * W, p[1] * H); }); x.stroke(); x.globalAlpha = 1;
        var gr = x.createRadialGradient(cx, cy, 0, cx, cy, 70 * d); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.globalAlpha = .5; x.beginPath(); x.arc(cx, cy, 70 * d, 0, 7); x.fill(); x.globalAlpha = 1;
        x.strokeStyle = col; x.lineWidth = 2 * d; for (var rr = 0; rr < 3; rr++) { x.globalAlpha = .6 - rr * .18; x.beginPath(); x.arc(cx, cy, (14 + rr * 12 + (still ? 0 : Math.sin(now * (6 + S.th.trem * 20) + rr) * (2 + S.th.fold * 6))) * d, 0, 7); x.stroke(); } x.globalAlpha = 1;
        x.fillStyle = "#efe8dc"; x.font = (13 * d) + "px Antonio, sans-serif"; x.fillText(mname(v.m) + (v.held ? " · HELD" : ""), cx + 18 * d, cy - 18 * d);
      });
    }
    function drawRing(cv) {
      var d = fit(cv), x = cv.getContext("2d"), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * .45, six = 60 / bpm() / 4;
      x.clearRect(0, 0, W, H);
      var ph = X.beat && A ? Math.max(0, (A.currentTime - bt.t0) / six) : 0;
      LANES.forEach(function (l, i) {
        var rad = R * (.36 + i * .2), fl = bt.flash[l.id] && performance.now() - bt.flash[l.id] < 150, pos = (ph % l.len) / l.len;
        l.rad = rad / d; l.cx = cx / d; l.cy = cy / d;
        x.strokeStyle = fl ? l.c : "rgba(154,134,181,.22)"; x.lineWidth = (fl ? 3 : 1.4) * d; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.stroke();
        for (var si = 0; si < l.len; si++) {
          var a = si / l.len * Math.PI * 2 - Math.PI / 2, px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad, on = steps[l.id].indexOf(si) > -1, beat = si % (l.len === 16 ? 4 : l.len === 12 ? 3 : 2) === 0;
          x.beginPath(); x.arc(px, py, (on ? 7 : beat ? 3.2 : 2.2) * d, 0, 7);
          if (on) { x.fillStyle = l.c; x.globalAlpha = .85; x.fill(); x.globalAlpha = 1; } else { x.fillStyle = beat ? "rgba(239,232,220,.35)" : "rgba(239,232,220,.16)"; x.fill(); }
        }
        if (X.beat && l.len !== 16) { var ha = pos * Math.PI * 2 - Math.PI / 2; x.strokeStyle = l.c; x.lineWidth = 2 * d; x.beginPath(); x.arc(cx, cy, rad, ha - .12, ha + .02); x.stroke(); }
      });
      if (X.beat) { var ba = (ph % 16) / 16 * Math.PI * 2 - Math.PI / 2; x.strokeStyle = "rgba(246,198,107,.75)"; x.lineWidth = 2.5 * d; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(ba) * (R + 6 * d), cy + Math.sin(ba) * (R + 6 * d)); x.stroke();
        x.fillStyle = "rgba(246,198,107,.08)"; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R + 6 * d, ba - .5, ba); x.closePath(); x.fill(); }
      var kp = bt.flash.kick && performance.now() - bt.flash.kick < 120, sun = x.createRadialGradient(cx, cy, 0, cx, cy, 22 * d); sun.addColorStop(0, kp ? "#fff1cc" : "#f6c66b"); sun.addColorStop(1, "rgba(246,198,107,0)"); x.fillStyle = sun; x.beginPath(); x.arc(cx, cy, (kp ? 26 : 22) * d, 0, 7); x.fill();
    }
    function drawDrift(cv) {
      var d = fit(cv), x = cv.getContext("2d"), W = cv.width, H = cv.height, t = performance.now();
      x.fillStyle = "rgba(4,4,8,.09)"; x.fillRect(0, 0, W, H);
      dr.blobs.forEach(function (b) { var age = (t - b.born) / b.life; if (age > 1.2) return; var a = Math.sin(Math.min(1, age) * Math.PI) * .32, px = (b.x + age * .06) * W, py = (b.y - age * .05) * H, rr = b.r * Math.min(W, H) * (1 + age * .4);
        var g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, HUE[b.hue % HUE.length]); g.addColorStop(1, "rgba(0,0,0,0)"); x.globalAlpha = a; x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill(); x.globalAlpha = 1; });
      dr.ripples = dr.ripples.filter(function (r) { return t - r.born < (r.big ? 5000 : 3000); });
      dr.ripples.forEach(function (r) { var age = (t - r.born) / (r.big ? 5000 : 3000); x.strokeStyle = r.answer ? "#f6c66b" : HUE[r.hue % HUE.length]; x.lineWidth = (r.big ? 2.5 : 1.5) * d; x.globalAlpha = (1 - age) * .8;
        for (var k = 0; k < (r.big ? 3 : 1); k++) { var rad = 8 + age * (r.big ? 160 : 70) - k * 22; if (rad <= 0) continue; x.beginPath(); x.arc(r.x * W, r.y * H, rad * d, 0, 7); x.stroke(); }
        if (r.answer) { x.setLineDash([4 * d, 6 * d]); x.beginPath(); x.arc(r.x * W, r.y * H, (14 + age * 40) * d, 0, 7); x.stroke(); x.setLineDash([]); } x.globalAlpha = 1; });
      Object.keys(dr.touches).forEach(function (k) { var tc = dr.touches[k], rr = (40 + Math.min(120, (t - tc.at) / 1000 * 30)) * d, g = x.createRadialGradient(tc.x * W, tc.y * H, 0, tc.x * W, tc.y * H, rr); g.addColorStop(0, "rgba(201,155,196,.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.beginPath(); x.arc(tc.x * W, tc.y * H, rr, 0, 7); x.fill(); });
      x.strokeStyle = "rgba(201,155,196,.18)"; x.lineWidth = d; x.beginPath();
      for (var px = 0; px <= W; px += 8 * d) { var amp = S.bedKind === "surf" ? 26 : S.bedKind === "wind" ? 12 : 6, yy = H * .82 + Math.sin(px / W * 5 + t / 2400) * amp * d + Math.sin(px / W * 13 + t / 900) * 5 * d; if (px) x.lineTo(px, yy); else x.moveTo(px, yy); } x.stroke();
      if (S.bedKind === "rain" && X.on) { x.strokeStyle = "rgba(157,176,255,.25)"; for (var i = 0; i < 18; i++) { var rx = (i * 97 + t / 7) % W, ry = (i * 53 + t / 3) % H; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 3 * d, ry + 12 * d); x.stroke(); } }
    }
    var DRAW = { field: drawField, ring: drawRing, drift: drawDrift };
    function loop() {
      X.raf = 0; if (state.screen !== "ressikan") return;
      canv.forEach(function (c) { if (c.el.isConnected) DRAW[c.k](c.el); });
      if (X.rec) { var el = document.querySelector("[data-rsrecinfo]"); if (el) el.textContent = "Recording · " + Math.floor((Date.now() - X.rec.at) / 1000) + " s"; }
      X.raf = requestAnimationFrame(loop);
    }

    /* ---- the screen ---- */
    var KN = {
      "th.wave": ["WAVE", "pct"], "th.glide": ["GLIDE", "pct"], "th.range": ["RANGE", "oct"], "th.vib": ["VIBRATO", "pct"],
      "th.fold": ["FOLD", "pct"], "th.reso": ["RESO", "pct"], "th.sub": ["SUB", "pct"], "th.spread": ["SPREAD", "cents"], "th.vowel": ["VOWEL", "vowel"], "th.ring": ["RING MOD", "pct"], "th.trem": ["TREMOLO", "hz"],
      "bt.tempo": ["TEMPO", "bpm"], "bt.swing": ["SWING", "pct"], "bt.level": ["BEAT LEVEL", "pct"],
      "dr.density": ["DENSITY", "dens"], "dr.bright": ["GLOW", "pct"], "dr.depth": ["DEPTH", "pct"], "dr.answer": ["ANSWER", "pct"], "dr.bed": ["BED", "pct"],
      "fx.echo": ["ECHO", "pct"], "fx.space": ["SPACE", "pct"], "fx.lofi": ["LO-FI", "pct"], "fx.wow": ["WOW", "pct"] };
    var FMT = { pct: function (v) { return Math.round(v * 100) + "%"; }, oct: function (v) { return (1 + Math.round(v * 3)) + " OCT"; }, bpm: function (v) { return Math.round(66 + v * 54) + " BPM"; },
      dens: function (v) { return v < .33 ? "SPARSE" : v < .66 ? "GENTLE" : "FULL"; }, cents: function (v) { return "±" + Math.round(4 + v * 30) + "¢"; }, vowel: function (v) { return v < .05 ? "OFF" : ["A", "E", "I", "O", "U"][Math.min(4, Math.round(v * 4))]; }, hz: function (v) { return v < .02 ? "OFF" : (2 + v * 10).toFixed(1) + " HZ"; } };
    function K(id, c) { var p = id.split("."), v = S[p[0]][p[1]]; return '<div class="rs-knob"><div class="rs-dial" role="slider" tabindex="0" aria-label="' + KN[id][0] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v * 100) + '" data-rsk="' + id + '" style="--v:' + v + (c ? ";--kc: var(--" + c + ")" : "") + '"><i></i></div><span class="rs-kl">' + KN[id][0] + '</span><span class="rs-kv" data-rskv="' + id + '">' + FMT[KN[id][1]](v) + "</span></div>"; }
    function chips(attr, opts, cur, c) { return '<div class="rs-chips">' + opts.map(function (o) { return '<button type="button" class="chip sm" data-' + attr + '="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '"' + (c ? ' style="--c: var(--' + c + ')"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>"; }
    function panel(c, title, meta, inner) { return '<section class="rs-panel" style="--c: var(--' + c + ')">' + phead(title, meta, c) + inner + "</section>"; }
    function soundStrip() {
      return panel("chrome-b", "SOUND", "ON THIS IPAD · ONE ROOM FOR EVERYTHING", '<div class="rs-row"><button type="button" class="rs-power" data-rsact="power" aria-pressed="' + X.on + '">' + (X.on ? "■ SOUND OFF" : "▶ SOUND ON") + "</button>" +
        '<div class="rs-knobs">' + K("fx.echo") + K("fx.space") + K("fx.lofi", "chrome-d") + K("fx.wow", "chrome-d") + '</div><span class="rs-sep"></span>' +
        '<button type="button" class="rs-rec" data-rsact="rec" aria-pressed="' + !!X.rec + '"><i></i>' + (X.rec ? "STOP" : "RECORD") + '</button><span class="muted" data-rsrecinfo>' + (X.rec ? "" : "Takes save to Files") + "</span></div>" +
        '<div class="rs-row"><span class="rs-lab">SCALE LOCK</span>' + chips("rsscale", Object.keys(SCALES).map(function (k) { return [k, (k === "free" ? "◌ " : "") + SCALES[k].n]; }), S.scale) +
        '<span class="rs-key"><span class="rs-lab">KEY</span><button type="button" class="chip sm" data-rskey="-1" aria-label="Key down">−</button><b>' + KEYS[S.key] + '</b><button type="button" class="chip sm" data-rskey="1" aria-label="Key up">+</button></span></div>' +
        (X.takes.length ? '<div class="rs-takes">' + X.takes.map(function (tk, i) { return '<div class="rs-take"><b>' + esc(tk.n) + '</b><audio controls src="' + tk.url + '"></audio><button type="button" class="chip sm" data-rssave="' + i + '">SAVE TO FILES</button></div>'; }).join("") + "</div>" : ""));
    }
    function cardsHtml() {
      var fi = X.beat ? '<span class="rs-live">● BEAT ' + Math.round(bpm()) + " BPM · " + (PATS[S.pat] ? PATS[S.pat].n : "YOUR PATTERN") + "</span>" : "Theremin + beat ring", di = X.on && S.card === "drift" ? '<span class="rs-live">● ' + ({ listen: "LISTENING", play: "PLAYING", duet: "DUET" })[S.dmode] + "</span> · " + (S.bedKind === "none" ? "NO BED" : S.bedKind.toUpperCase()) : "Ambient you can play";
      return '<div class="rs-cards">' +
        '<button type="button" class="rs-card" data-rscard="field" aria-pressed="' + (S.card === "field") + '" style="--c: var(--personal)"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M4 30c7-18 11-18 18 0s11 18 18-6"/><circle cx="34" cy="12" r="7" stroke-width="2"/><circle cx="34" cy="5" r="2" fill="currentColor"/></svg><b>FIELD</b><small data-rscardinfo="field">' + fi + (held.length ? " · " + held.length + " held" : "") + "</small></button>" +
        '<button type="button" class="rs-card" data-rscard="drift" aria-pressed="' + (S.card === "drift") + '" style="--c: var(--chrome-a)"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 26c6-6 12-6 19 0s13 6 19 0M3 16c6-6 12-6 19 0s13 6 19 0"/><circle cx="30" cy="34" r="4" stroke-width="2"/></svg><b>DRIFT</b><small data-rscardinfo="drift">' + di + "</small></button></div>";
    }
    function fieldHtml() {
      var thS = '<div class="rs-surface rs-th" data-rssurf="field"><canvas data-rscv="field"></canvas><span class="rs-hint">TOUCH AND HOLD · HEIGHT IS PITCH · ACROSS IS ' + ({ tone: "TONE", vowel: "VOWEL", ring: "RING MOD", fold: "FOLD" })[S.across] + ' · TWO FINGERS, TWO VOICES</span><span class="rs-read" data-rsread="field"></span></div>';
      var ringS = '<div class="rs-surface rs-ring" data-rssurf="ring"><canvas data-rscv="ring" role="img" aria-label="Beat ring: four rings of steps; tap a dot to turn it on or off"></canvas></div>';
      var beat = '<div class="rs-beat"><div class="rs-row"><button type="button" class="rs-go" data-rsact="beat" aria-pressed="' + X.beat + '">' + (X.beat ? "■ STOP" : "▶ BEAT") + '</button><button type="button" class="chip sm" data-rsact="vinyl" aria-pressed="' + S.vinyl + '" style="--c: var(--chrome-d)">VINYL</button>' +
        '<button type="button" class="chip sm" data-rsact="place" aria-pressed="false">RING ' + (S.place === "beside" ? "INSIDE" : "BESIDE") + "</button></div>" +
        chips("rspat", Object.keys(PATS).map(function (k) { return [k, PATS[k].n]; }), S.pat, "chrome-d") +
        '<div class="rs-lanes">' + LANES.map(function (l) { return '<button type="button" class="rs-lane" data-rslane="' + l.id + '" style="--c:' + l.c + '" aria-label="' + l.n + ": " + l.len + ' steps; tap to change">' + l.n + "<i>" + l.len + "</i></button>"; }).join("") + "</div>" +
        '<div class="rs-knobs">' + K("bt.tempo", "chrome-d") + K("bt.swing", "chrome-d") + K("bt.level", "chrome-d") + "</div>" +
        '<p class="muted">Tap a dot to light it. The beam sweeps; the dots stay put. A ring\'s length (16, 12, 10 or 8 steps) makes it drift against the others.</p></div>';
      var banks = '<div class="rs-banks"><div><h3>VOICE</h3><div class="rs-knobs">' + K("th.wave", "personal") + K("th.sub", "personal") + K("th.spread", "personal") + K("th.range", "personal") + "</div></div>" +
        '<div><h3>COLOUR</h3><div class="rs-knobs">' + K("th.fold", "chrome-a") + K("th.reso", "chrome-a") + K("th.vowel", "chrome-a") + K("th.ring", "chrome-a") + "</div></div>" +
        '<div><h3>MOTION</h3><div class="rs-knobs">' + K("th.glide", "hero") + K("th.vib", "hero") + K("th.trem", "hero") + "</div></div></div>" +
        '<div class="rs-row"><span class="rs-lab">ACROSS THE FIELD</span>' + chips("rsacross", [["tone", "TONE"], ["vowel", "VOWEL"], ["ring", "RING MOD"], ["fold", "FOLD"]], S.across, "personal") +
        '<span class="rs-sep"></span><button type="button" class="chip sm" data-rsact="hold" aria-pressed="' + X.hold + '" style="--c: var(--hero)">HOLD NOTES</button>' + (held.length ? '<button type="button" class="chip sm" data-rsact="release">RELEASE ' + held.length + "</button>" : "") + "</div>";
      var synth = '<div class="rs-synth">' + phead("SYNTH", "SHAPES EVERY VOICE, LIVE", "personal") + banks + "</div>";
      if (S.place === "beside") return panel("personal", "FIELD", "THEREMIN + BEAT RING · PLAY OVER THE BEAT", '<div class="rs-field"><div>' + thS + synth + "</div><div>" + ringS + beat + "</div></div>");
      return panel("personal", "FIELD", "THEREMIN + BEAT RING · PLAY OVER THE BEAT", '<div class="rs-field inside"><div class="rs-host">' + thS + ringS + "</div>" + beat + "</div>") + panel("personal", "SYNTH", "SHAPES EVERY VOICE, LIVE", banks);
    }
    function driftHtml() {
      return panel("chrome-a", "DRIFT", "IT PLAYS · YOU PLAY · IT ANSWERS",
        '<div class="rs-row"><span class="rs-lab">MODE</span>' + chips("rsdmode", [["listen", "LISTEN"], ["play", "PLAY"], ["duet", "DUET"]], S.dmode, "chrome-a") +
        '<span class="rs-sep"></span><span class="rs-lab">BED</span>' + chips("rsbed", [["none", "NONE"], ["wind", "WIND"], ["surf", "SURF"], ["rain", "RAIN"]], S.bedKind, "chrome-a") + "</div>" +
        '<div class="rs-surface rs-dr" data-rssurf="drift"><canvas data-rscv="drift"></canvas><span class="rs-hint">' + ({ listen: "LISTEN · IT NEVER PLAYS THE SAME WAY TWICE", play: "TAP TO BLOOM A NOTE · HOLD TO SWELL · DRAG TO SCATTER CHIMES", duet: "PLAY ALONG · SOMETIMES THE ROOM ANSWERS, LATER AND SOFTER" })[S.dmode] + '</span><span class="rs-read" data-rsread="drift"></span></div>' +
        '<div class="rs-row"><div class="rs-knobs">' + K("dr.density", "chrome-a") + K("dr.bright", "chrome-a") + K("dr.depth", "chrome-a") + K("dr.answer", "hero") + K("dr.bed", "work") + "</div>" +
        '<span class="rs-sep"></span><span class="rs-lab">SLEEP</span>' + chips("rssleep", [["0", "OFF"], ["15", "15 MIN"], ["30", "30 MIN"], ["60", "60 MIN"]], String(X.sleep)) + "</div>" +
        '<p class="muted">Height is pitch (locked to the scale), across is brightness and left to right in your headphones. A beat that\'s on keeps playing here.</p>');
    }
    function head() { return { e: "REFLECT · RESSIKAN · " + (S.card === "field" ? "FIELD" : "DRIFT") + (X.beat ? " · BEAT " + Math.round(bpm()) + " BPM" : ""), t: "RESSIKAN" }; }
    function draw() {
      $("content").innerHTML = '<div class="rs">' + soundStrip() + cardsHtml() + (S.card === "field" ? fieldHtml() : driftHtml()) + "</div>";
      canv = [].map.call(document.querySelectorAll("#content canvas[data-rscv]"), function (el) { return { el: el, k: el.dataset.rscv }; });
      document.querySelectorAll("#content [data-rssurf]").forEach(bindSurface);
      document.querySelectorAll("#content [data-rsk]").forEach(bindKnob);
      paint();
      if (!X.raf) X.raf = requestAnimationFrame(loop);
    }
    function paint() {
      if (state.screen !== "ressikan") return;
      var h = head(), e = $("eyebrow"); if (e) e.textContent = h.e;
      document.querySelectorAll("#content [data-rsread]").forEach(function (el) { el.textContent = !X.on ? (X.lost ? "IPADOS PAUSED THE SOUND · TAP TO START AGAIN" : "SOUND OFF · TAP TO START") : el.dataset.rsread === "field" ? (SCALES[S.scale].s ? SCALES[S.scale].n + " IN " + KEYS[S.key] : "FREEFORM · EVERY PITCH") : (X.sleep ? "SLEEPS IN " + Math.max(0, Math.ceil((X.sleepAt - Date.now()) / 60000)) + " MIN" : "NO SLEEP TIMER"); });
      var p = document.querySelector('#content [data-rsact="power"]'); if (p) { p.setAttribute("aria-pressed", X.on); p.textContent = X.on ? "■ SOUND OFF" : "▶ SOUND ON"; }
    }
    function bindSurface(el) {
      var k = el.dataset.rssurf;
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault(); if (!X.on) setPower(true); if (!X.on) return;
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* already released */ }
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        if (k === "field") thMove(e.pointerId, px, py, e.pressure); else if (k === "drift") driftDown(e.pointerId, px, py); else ringTap(e.clientX - r.left, e.clientY - r.top);
      });
      el.addEventListener("pointermove", function (e) { if (!A) return; var r = el.getBoundingClientRect(), px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); if (k === "field" && thV[e.pointerId]) thMove(e.pointerId, px, py, e.pressure); else if (k === "drift") driftMove(e.pointerId, px, py); });
      ["pointerup", "pointercancel"].forEach(function (ev) { el.addEventListener(ev, function (e) { if (!A) return; if (k === "field") thUp(e.pointerId); else if (k === "drift") driftUp(e.pointerId); }); });
    }
    function ringTap(x, y) {   /* the nearest dot on the nearest ring */
      var best = null;
      LANES.forEach(function (l) { if (!l.rad) return; var dd = Math.abs(Math.sqrt((x - l.cx) * (x - l.cx) + (y - l.cy) * (y - l.cy)) - l.rad); if (dd < 16 && (!best || dd < best.dd)) best = { l: l, dd: dd }; });
      if (!best) return;
      var l = best.l, ang = (Math.atan2(y - l.cy, x - l.cx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2), si = Math.round(ang / (Math.PI * 2) * l.len) % l.len, arr = steps[l.id], at = arr.indexOf(si);
      if (at > -1) arr.splice(at, 1); else arr.push(si);
      if (!X.beat && A) hit(l.id, A.currentTime + .01, 0);   /* a tap previews the sound */
      S.pat = "custom"; document.querySelectorAll("#content [data-rspat]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      keep();
    }
    function bindKnob(el) {
      var id = el.dataset.rsk, p = id.split("."), y0 = 0, v0 = 0;
      var set = function (v) { v = Math.max(0, Math.min(1, v)); S[p[0]][p[1]] = v; el.style.setProperty("--v", v); el.setAttribute("aria-valuenow", Math.round(v * 100)); var t = document.querySelector('#content [data-rskv="' + id + '"]'); if (t) t.textContent = FMT[KN[id][1]](v);
        if (p[0] === "th" && A) thAll().forEach(thApply); if (p[0] === "fx" || p[0] === "bt") applyFx(); if (id === "dr.bed") applyBed(); keep(); paint(); };
      el.addEventListener("pointerdown", function (e) { try { el.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } y0 = e.clientY; v0 = S[p[0]][p[1]]; e.preventDefault(); });
      el.addEventListener("pointermove", function (e) { if (el.hasPointerCapture(e.pointerId)) set(v0 + (y0 - e.clientY) / 180); });
      el.addEventListener("keydown", function (e) { if (e.key === "ArrowUp" || e.key === "ArrowRight") { set(S[p[0]][p[1]] + .05); e.preventDefault(); } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { set(S[p[0]][p[1]] - .05); e.preventDefault(); } });
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
    }
    function saveTake(tk) {   /* the share sheet's Save to Files, or a download where sharing files isn't offered */
      var f = typeof File === "function" ? new File([tk.blob], tk.file, { type: tk.blob.type }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: tk.file }).catch(function () { /* closed the sheet */ }); return; }
      var a = document.createElement("a"); a.href = tk.url; a.download = tk.file; document.body.appendChild(a); a.click(); a.remove();
    }
    function click(b) {
      if (state.screen !== "ressikan") return false;
      var d = b.dataset;
      if (d.rsact === "power") { setPower(!X.on); draw(); }
      else if (d.rsact === "beat") { setBeat(!X.beat); draw(); }
      else if (d.rsact === "vinyl") { S.vinyl = !S.vinyl; applyFx(); keep(); draw(); }
      else if (d.rsact === "place") { S.place = S.place === "beside" ? "inside" : "beside"; keep(); draw(); }
      else if (d.rsact === "hold") { X.hold = !X.hold; if (!X.hold && A) thRelease(false); draw(); }
      else if (d.rsact === "release") { if (A) thRelease(false); draw(); }
      else if (d.rsact === "rec") toggleRec();
      else if (d.rssave) { var tk = X.takes[+d.rssave]; if (tk) saveTake(tk); }
      else if (d.rscard) { S.card = d.rscard; keep(); applyBed(); draw(); }
      else if (d.rsscale) { S.scale = d.rsscale; keep(); draw(); }
      else if (d.rskey) { S.key = (S.key + Number(d.rskey) + 12) % 12; keep(); draw(); }
      else if (d.rspat) { loadPat(d.rspat); draw(); }
      else if (d.rslane) { LANES.forEach(function (l) { if (l.id !== d.rslane) return; var L = [16, 12, 10, 8], nl = L[(L.indexOf(l.len) + 1) % L.length]; steps[l.id] = steps[l.id].map(function (s) { return Math.round(s / l.len * nl) % nl; }).filter(function (s, i, a) { return a.indexOf(s) === i; }); l.len = nl; }); S.pat = "custom"; keep(); draw(); }
      else if (d.rsacross) { S.across = d.rsacross; if (A) thAll().forEach(thApply); keep(); draw(); }
      else if (d.rsdmode) { S.dmode = d.rsdmode; keep(); applyBed(); draw(); }
      else if (d.rsbed) { S.bedKind = d.rsbed; keep(); applyBed(); draw(); }
      else if (d.rssleep !== undefined) { X.sleep = Number(d.rssleep); X.sleepAt = Date.now() + X.sleep * 60000; draw(); }
      else return false;
      return true;
    }
    function leave() { if (X.rec) X.rec.mr.stop(); if (X.on) setPower(false); X.sleep = 0; }   /* leaving the station: quiet */
    return { render: draw, head: head, click: click, leave: leave, card: function (k) { S.card = k; keep(); } };
  })();
  function renderRessikan() { rs.render(); }

