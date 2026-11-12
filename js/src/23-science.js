  /* ---------- SCIENCE (2.42, bridge 1.34): free public feeds about the sky and surroundings ---------- */
  /* One station, the hub of a SCIENCE group, opening on SKY TRAFFIC. Everything comes from free public sources, with
     the Bridge's location rounded to about 1 km as for the weather. Feeds that allow it are read straight from this
     iPad (adsbdb, wheretheiss.at, NOAA SWPC, USGS, the National Weather Service, Open-Meteo, NASA NeoWs, iNaturalist);
     the rest through the Google bridge (aircraft from adsb.lol, orbits from CelesTrak, band conditions, eBird).
     Refreshed only while the station is open (aircraft every 10 s, the rest every 15 to 60 minutes), except a light,
     slow read (orbits, the Kp forecast, nearby quakes) for the Bridge's SCIENCE line and the Morning Briefing.
     Orbits and the night sky are worked out here (satellite.js, Astronomy Engine, loaded on first need).
     Events of interest (military, emergency or low aircraft; bright space station passes; storms and M/X flares;
     nearby or big quakes; weather alerts; full and new moons, meteor peaks, eclipses, close asteroids; notable birds)
     go to the event log: 30 days on this iPad (tos.scilog.v1) and every one in 🔭 Science Log in Notion, once each
     (Key), through tos.sciq.v1 so nothing is lost offline. ☆ stars one in both. Never a Condition item. */
  var LS_SCI = "tos.sci.v1", LS_SCILOG = "tos.scilog.v1", LS_SCIQ = "tos.sciq.v1", LS_SCILINEOFF = "tos.scilineoff.v1";
  var SCI_KM = 50, SCI_SKY_MS = 10000, SCI_KEEP_DAYS = 30;
  var SCI_DEPTS = { sky: ["SKY TRAFFIC", "personal"], space: ["SPACE WEATHER", "chrome-a"], earth: ["EARTH", "farm"], night: ["NIGHT SKY", "work"], nature: ["NATURE", "ok"] };
  var SCI_SAT = { iss: "ISS", css: "Tiangong", hst: "Hubble" };
  var SCI_PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  /* Peak dates of the major meteor showers (IMO): month-day. */
  var SCI_METEORS = [["Quadrantids", "01-03"], ["Lyrids", "04-22"], ["Eta Aquariids", "05-06"], ["Perseids", "08-12"], ["Orionids", "10-21"], ["Leonids", "11-17"], ["Geminids", "12-14"]];
  var sc = { tab: "sky", d: lsGet(LS_SCI) || {}, sky: null, skyErr: "", sel: null, info: {}, busy: {}, err: {}, log: lsGet(LS_SCILOG) || [], q: lsGet(LS_SCIQ) || { add: [], star: {} },
    evf: "all", libs: null, timer: 0, flushing: false, iss: null };
  function canScience() { return state.caps.indexOf("science") > -1; }
  function canSciLog() { return state.caps.indexOf("sciencelog") > -1; }
  function sciSave() { lsSet(LS_SCI, sc.d); }
  function sciPlace() { var p = place(); return p ? { lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100 } : null; }
  function sciStale(k, ms) { return !sc.d[k] || Date.now() - sc.d[k].at > ms; }
  function sciCompass(b) { return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(((b % 360) + 360) % 360 / 22.5) % 16]; }
  function sciKm(a, b) {
    var R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad, la1 = a.lat * rad, la2 = b.lat * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var brg = Math.atan2(Math.sin(dLon) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)) / rad;
    return { km: Math.round(2 * R * Math.asin(Math.sqrt(h))), dir: Math.round((brg + 360) % 360) };
  }
  function sciFt(n) { return n == null ? "–" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  /* A public feed, straight from this iPad: JSON, 20 s at most. */
  function sciGet(url) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null, t = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : 0;
    return fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
      if (!r.ok) throw { code: "http_" + r.status, message: url.split("/")[2] + " answered " + r.status };
      return r.json();
    }).finally(function () { if (t) clearTimeout(t); });
  }
  function sciRun(k, ms, work) {
    if (sc.busy[k] || !sciStale(k, ms)) return;
    var e = sc.err[k]; if (e && Date.now() - e.at < 5 * 60000) return;
    sc.busy[k] = true;
    Promise.resolve().then(work).then(function (data) { sc.d[k] = { at: Date.now(), v: data }; delete sc.err[k]; sciSave(); sciDetect(k); if (k === "feeds") sciPasses(); })
      .catch(function (err) { sc.err[k] = { at: Date.now(), msg: err && (err.message || err.code) ? String(err.message || err.code) : "not available" }; })
      .then(function () { delete sc.busy[k]; if (state.screen === "science" || (state.screen === "bridge" && (k === "feeds" || k === "kpf" || k === "quakes"))) render(true); });
  }
  function sciV(k) { return sc.d[k] ? sc.d[k].v : null; }
  /* The two libraries, loaded once, on first need. */
  function sciLibs() {
    if (window.satellite && window.Astronomy) return Promise.resolve(true);
    if (sc.libs) return sc.libs;
    var one = function (src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("couldn't load " + src)); }; document.head.appendChild(s); }); };
    sc.libs = Promise.all([one("js/vendor/satellite.min.js"), one("js/vendor/astronomy.min.js")]).then(function () { return true; }, function (e) { sc.libs = null; throw e; });
    return sc.libs;
  }

  /* ---- loading: each feed on its own clock ---- */
  function sciLoad(all) {
    var loc = sciPlace(); if (!loc || !state.conn || !canScience()) return;
    var t = sc.tab, M = 60000, q = "&latitude=" + loc.lat + "&longitude=" + loc.lon, here = state.screen === "science";   /* away from the station: a light, slow read */
    /* orbits and band conditions change slowly (12 h), but eBird's notable birds are worth an hourly look while SCIENCE is
       open (the bridge keeps them an hour), and NATURE without birds asks again every 5 minutes, so a key just added to
       Script Properties shows up the next time NATURE is opened rather than up to 12 hours later (2.50.1) */
    var fd = sciV("feeds") || {}, fMin = !here ? 12 * 60 : fd.ebird ? 60 : t === "nature" ? 5 : 12 * 60;
    sciRun("feeds", fMin * M, function () { return api({ action: "sciencefeeds", lat: loc.lat, lon: loc.lon }); });
    sciRun("kpf", (here ? 30 : 180) * M, function () { return sciGet("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"); });
    sciRun("quakes", (here ? 15 : 60) * M, function () {
      var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      return Promise.all([sciGet("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=40&minmagnitude=2&maxradiuskm=500&latitude=" + loc.lat + "&longitude=" + loc.lon + "&starttime=" + since),
        sciGet("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=10&minmagnitude=6&starttime=" + new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))])
        .then(function (r) {
          var seen = {}, out = [];
          r[0].features.concat(r[1].features).forEach(function (f) {
            if (seen[f.id]) return; seen[f.id] = 1;
            var c = f.geometry.coordinates, d = sciKm(loc, { lat: c[1], lon: c[0] });
            out.push({ id: f.id, mag: Math.round(f.properties.mag * 10) / 10, place: f.properties.place || "", at: f.properties.time, km: d.km, dir: d.dir, depth: Math.round(c[2]), url: f.properties.url });
          });
          return out.sort(function (a, b) { return b.at - a.at; });
        });
    });
    sciPasses();
    if (!all && !here) return;
    sciNight();
    if (all || t === "space") {
      sciRun("kp", 15 * M, function () { return sciGet("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"); });
      sciRun("flares", 15 * M, function () { return sciGet("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json"); });
      sciRun("flux", 60 * M, function () { return sciGet("https://services.swpc.noaa.gov/json/f107_cm_flux.json"); });
    }
    if (all || t === "earth") {
      sciRun("alerts", 15 * M, function () { return sciGet("https://api.weather.gov/alerts/active?point=" + loc.lat + "," + loc.lon).then(function (j) { return (j.features || []).map(function (f) { var p = f.properties; return { id: p.id, event: p.event, headline: p.headline, sev: p.severity, ends: p.ends || p.expires, sent: p.sent }; }); }); });
      sciRun("air", 30 * M, function () { return sciGet("https://air-quality-api.open-meteo.com/v1/air-quality?current=us_aqi,pm2_5,ozone,uv_index&timezone=auto" + q).then(function (j) { return j.current || null; }); });
    }
    if (all || t === "night") sciRun("neo", 6 * 60 * M, function () {
      var d0 = ymd(new Date()), d1 = ymd(addDays(new Date(), 6));
      return sciGet("https://api.nasa.gov/neo/rest/v1/feed?start_date=" + d0 + "&end_date=" + d1 + "&api_key=DEMO_KEY").then(function (j) {
        var out = [];
        Object.keys(j.near_earth_objects || {}).forEach(function (day) { j.near_earth_objects[day].forEach(function (o) { var c = (o.close_approach_data || [])[0]; if (!c) return;
          out.push({ id: o.id, name: o.name.replace(/[()]/g, ""), at: c.epoch_date_close_approach, ld: Math.round(parseFloat(c.miss_distance.lunar) * 10) / 10, m: Math.round((o.estimated_diameter.meters.estimated_diameter_min + o.estimated_diameter.meters.estimated_diameter_max) / 2), haz: !!o.is_potentially_hazardous_asteroid }); }); });
        return out.sort(function (a, b) { return a.ld - b.ld; }).slice(0, 5);
      });
    });
    if (all || t === "nature") sciRun("inat", 60 * M, function () {
      return sciGet("https://api.inaturalist.org/v1/observations?quality_grade=research&radius=25&per_page=30&order_by=observed_on&lat=" + loc.lat + "&lng=" + loc.lon + "&d1=" + ymd(addDays(new Date(), -7))).then(function (j) {
        var seen = {}, out = [];
        (j.results || []).forEach(function (o) { var tx = o.taxon; if (!tx || seen[tx.id]) return; seen[tx.id] = 1; out.push({ name: tx.preferred_common_name || tx.name, sci: tx.name, group: tx.iconic_taxon_name || "", day: o.observed_on, place: o.place_guess || "" }); });
        return out;
      });
    });
  }
  /* SKY: aircraft every 10 s while the station is open on SKY TRAFFIC; the ISS's place every minute. */
  function sciSky() {
    var loc = sciPlace(); if (!loc || !canScience() || sc.skyBusy) return;
    sc.skyBusy = true;
    api({ action: "sky", lat: loc.lat, lon: loc.lon }).then(function (j) { sc.sky = { at: Date.now(), list: j.aircraft || [], source: j.source || "" }; sc.skyErr = ""; sciDetect("sky"); sciRoutes(); })
      .catch(function (err) { sc.skyErr = describe(err); })
      .then(function () { sc.skyBusy = false; if (state.screen === "science" && sc.tab === "sky") sciPaintSky(); });
    if (!sc.iss || Date.now() - sc.iss.at > 60000) sciGet("https://api.wheretheiss.at/v1/satellites/25544").then(function (j) { sc.iss = { at: Date.now(), lat: j.latitude, lon: j.longitude, alt: j.altitude, vel: j.velocity, vis: j.visibility }; }).catch(function () { /* the passes still show */ });
  }
  /* Routes and aircraft details from adsbdb, kept for the day: the nearest twelve, and the one you open. */
  function sciRoutes() {
    var day = ymd(new Date());
    ((sc.sky && sc.sky.list) || []).slice(0, 12).forEach(function (a) {
      var k = "r:" + a.cs; if (!a.cs || /^N\d/.test(a.cs) || (sc.info[k] && sc.info[k].day === day)) return;
      sc.info[k] = { day: day, v: null };
      sciGet("https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(a.cs)).then(function (j) { sc.info[k].v = j.response && j.response.flightroute || null; if (state.screen === "science" && sc.tab === "sky") sciPaintSky(); }).catch(function () { /* no route known */ });
    });
  }
  function sciAircraftInfo(a) {
    var k = "a:" + a.hex; if (!a.hex || sc.info[k]) return;
    sc.info[k] = { v: null };
    sciGet("https://api.adsbdb.com/v0/aircraft/" + encodeURIComponent(a.hex)).then(function (j) { sc.info[k].v = j.response && j.response.aircraft || null; if (state.screen === "science") sciPaintSky(); }).catch(function () { /* unknown aircraft */ });
  }

  /* ---- landmarks on the scope (2.43, Timothy's ask): a few towns and airports to judge distance by ----
     Suggested once from OpenStreetMap (towns by size, spread round the scope and across the rings, plus the main
     airport and one airfield), then kept, hidden, renamed and added to by hand in SYSTEMS → SCIENCE. Privacy first:
     the list lives only on this iPad (tos.scilm.v1, and in backups); never in the code, the bridge, Notion or an event.
     Only the rounded location goes to OpenStreetMap (or a place name to Open-Meteo's search). */
  var LS_SCILM = "tos.scilm.v1", LS_SCILMOFF = "tos.scilmoff.v1", SCI_LM_MAX = 8, SCI_LM_GAP = 6, SCI_NEAR_KM = 8;
  var SCI_OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  var slm = { d: lsGet(LS_SCILM), busy: false, err: "", errAt: 0, sel: null, edit: false, found: null, findMsg: "" };
  function lmOn() { return !lsGet(LS_SCILMOFF); }
  function lmSave() { lsSet(LS_SCILM, slm.d); }
  function lmAll() { return (slm.d && slm.d.list) || []; }
  function lmHome() { return (slm.d && slm.d.home) || "home"; }
  /* East and north of here, in km: flat is close enough inside 50 km. */
  function sciXY(loc, p) { return { x: (p.lon - loc.lon) * 111.32 * Math.cos(loc.lat * Math.PI / 180), y: (p.lat - loc.lat) * 110.57 }; }
  function lmShown() {
    var loc = sciPlace(); if (!loc) return [];
    return lmAll().filter(function (x) { return !x.hidden; }).map(function (x) { var w = sciKm(loc, x); return Object.assign({ km: w.km, dir: w.dir, xy: sciXY(loc, x) }, x); }).filter(function (x) { return x.km <= SCI_KM; });
  }
  /* Where an aircraft is, in his own terms: "4 km NE of Riverton" (the nearest landmark within 8 km). */
  function sciNear(a) {
    if (!lmOn() || a.km == null || a.dir == null) return null;
    var r = a.dir * Math.PI / 180, ax = a.km * Math.sin(r), ay = a.km * Math.cos(r), best = null;
    lmShown().forEach(function (x) { var dx = ax - x.xy.x, dy = ay - x.xy.y, d = Math.sqrt(dx * dx + dy * dy); if (d <= SCI_NEAR_KM && (!best || d < best.km)) best = { lm: x, km: d, dir: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 }; });
    if (!best) return null;
    best.text = best.km < 1 ? "over " + best.lm.name : Math.round(best.km) + " km " + sciCompass(best.dir) + " of " + best.lm.name;
    return best;
  }
  function sciPostForm(url, body) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null, t = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : 0;
    return fetch(url, { method: "POST", body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
      if (!r.ok) throw { code: "http_" + r.status, message: url.split("/")[2] + " answered " + r.status };
      return r.json();
    }).finally(function () { if (t) clearTimeout(t); });
  }
  /* Ask OpenStreetMap once (the first time the scope shows with landmarks on), or again on SUGGEST AGAIN. */
  function lmSuggest(force) {
    var loc = sciPlace(); if (!loc || slm.busy || !lmOn()) return;
    if (!force && ((slm.d && slm.d.asked) || Date.now() - slm.errAt < 10 * 60000)) return;
    slm.busy = true; slm.err = "";
    var around = "(around:50000," + loc.lat + "," + loc.lon + ")";
    var q = '[out:json][timeout:25];(node["place"~"^(city|town|village)$"]' + around + ';nwr["aeroway"="aerodrome"]' + around + ';way["aeroway"="runway"]' + around + ";);out center tags;";
    var one = function (i) { return sciPostForm(SCI_OVERPASS[i], "data=" + encodeURIComponent(q)).catch(function (e) { if (i + 1 < SCI_OVERPASS.length) return one(i + 1); throw e; }); };
    one(0).then(function (j) {
      var old = {}; lmAll().forEach(function (x) { old[x.id] = x; });
      var picks = lmPick(j.elements || [], loc).map(function (x) { var o = old[x.id]; return o ? Object.assign(x, { name: o.name, hidden: !!o.hidden }) : x; });
      slm.d = { home: slm.d && slm.d.home || "", asked: true, at: Date.now(), list: lmAll().filter(function (x) { return !x.auto; }).concat(picks) };
      lmSave();
      if (!picks.length) slm.err = "OpenStreetMap had no towns or airports within 50 km. Add your own in SYSTEMS → SCIENCE.";
    }).catch(function (e) { slm.err = "Couldn't reach OpenStreetMap for landmarks (" + (e && (e.message || e.code) || "no answer") + "). Tries again in a few minutes."; slm.errAt = Date.now(); })
      .then(function () { slm.busy = false; if (state.screen === "science") sciPaintSky(); else if (state.screen === "systems") render(true); });
  }
  /* A few, spread out: the main airport (and one airfield), then the biggest town in each direction, one in each ring
     band first (inside 10 km, 10 to 25, 25 to 50), none within 6 km of another, at most 8 in all. */
  function lmPick(els, loc) {
    var rank = { city: 3, town: 2, village: 1 }, towns = [], ports = [], rwys = [], out = [];
    els.forEach(function (e) {
      var t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
      if (lat == null || lon == null) return;
      var p = { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
      if (t.aeroway === "runway") { var h = parseInt(String(t.ref || "").split("/")[0], 10); if (h >= 1 && h <= 36) rwys.push(Object.assign({ rwy: (h % 18) * 10 || 180 }, p)); return; }
      if (!t.name) return;
      var w = sciKm(loc, p); if (w.km > SCI_KM || w.km < 2) return;   /* inside 2 km is the centre itself */
      var base = { id: e.type.charAt(0) + e.id, name: t.name, lat: p.lat, lon: p.lon, auto: true, km: w.km, dir: w.dir };
      if (t.aeroway === "aerodrome") { if (!/^(private|no)$/.test(t.access || "")) ports.push(Object.assign(base, { kind: "airport", score: (t.iata ? 3 : t.icao ? 2 : 1) * 1000 - w.km })); }
      else if (rank[t.place]) towns.push(Object.assign(base, { kind: "town", score: rank[t.place] * 1e7 + (parseInt(String(t.population || "").replace(/\D/g, ""), 10) || 0) }));
    });
    var far = function (x) { return out.every(function (y) { var a = sciXY(loc, x), b = sciXY(loc, y); return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)) >= SCI_LM_GAP; }); };
    var take = function (x) { if (out.length < SCI_LM_MAX && out.indexOf(x) < 0 && far(x)) { out.push(x); return true; } return false; };
    var by = function (a, b) { return b.score - a.score; };
    ports.sort(by);
    if (ports[0]) take(ports[0]);
    for (var i = 1; i < ports.length && out.length < 2; i++) take(ports[i]);   /* and one more airfield, 6 km or more from it */
    towns.sort(by);
    var oct = {}; towns.forEach(function (x) { var o = Math.floor(((x.dir + 22.5) % 360) / 45); if (!oct[o]) oct[o] = x; });
    var winners = Object.keys(oct).map(function (k) { return oct[k]; }).sort(by), band = function (x) { return x.km < 10 ? 0 : x.km < 25 ? 1 : 2; };
    [0, 1, 2].forEach(function (b) { winners.filter(function (x) { return band(x) === b; }).some(take); });
    winners.forEach(take);
    towns.forEach(take);
    out.forEach(function (x) {
      if (x.kind === "airport") { var r = rwys.map(function (y) { var a = sciXY(loc, x), c = sciXY(loc, y); return { r: y.rwy, d: Math.sqrt((a.x - c.x) * (a.x - c.x) + (a.y - c.y) * (a.y - c.y)) }; }).sort(function (a, b) { return a.d - b.d; })[0]; if (r && r.d <= 4) x.rwy = r.r; }
      delete x.km; delete x.dir; delete x.score;
    });
    return out;
  }
  /* Drawn under the aircraft, muted; a label that would overlap another (or a ring's) is left off. */
  function lmSvg(pt) {
    if (!lmOn()) return "";
    lmSuggest(false);
    var boxes = [10, 25, 50].map(function (k) { var y = 210 + k / SCI_KM * 190 - 5; return [170, y - 11, 205, y + 2]; }), s = '<g class="lms">';
    var list = lmShown().sort(function (a, b) { return (b.kind === "airport") - (a.kind === "airport"); });
    list.forEach(function (x) {
      var q = pt(x.dir, x.km), right = q[0] >= 210, name = x.name.length > 18 ? x.name.slice(0, 17) + "…" : x.name, w = name.length * 5.4 + 4;
      var bx = right ? [q[0] + 8, q[1] - 7, q[0] + 8 + w, q[1] + 5] : [q[0] - 8 - w, q[1] - 7, q[0] - 8, q[1] + 5];
      var clash = boxes.some(function (b) { return !(bx[2] < b[0] || bx[0] > b[2] || bx[3] < b[1] || bx[1] > b[3]); });
      if (!clash) boxes.push(bx);
      var icon = x.kind === "airport" ? '<circle r="4.5"/>' + (x.rwy != null ? '<line transform="rotate(' + x.rwy + ')" y1="-8" y2="8"/>' : "") : x.kind === "own" ? '<rect x="-4" y="-4" width="8" height="8"/>' : '<path d="M0 -5 L5 0 L0 5 L-5 0 Z"/>';
      s += '<g class="lm' + (x.id === slm.sel ? " sel" : "") + '" data-scilm="' + esc(x.id) + '" transform="translate(' + q[0].toFixed(1) + " " + q[1].toFixed(1) + ')"><circle class="tap" r="12"/>' + icon +
        (clash ? "" : '<text x="' + (right ? 8 : -8) + '" y="3.5" text-anchor="' + (right ? "start" : "end") + '">' + esc(name) + "</text>") + "</g>";
    });
    return s + "</g>";
  }
  function lmLegend() {
    var on = lmOn(), sel = on && lmShown().filter(function (x) { return x.id === slm.sel; })[0];
    var kinds = { town: "town", airport: "airport", own: "your place" };
    return '<button type="button" class="chip sm sci-lmt" data-scilmt aria-pressed="' + on + '">LANDMARKS</button>' +
      (sel ? '<span class="sci-lmsel">' + esc(sel.name) + " · " + kinds[sel.kind] + " · " + sel.km + " km " + sciCompass(sel.dir) + " of " + esc(lmHome()) + "</span>" :
        on && slm.busy ? '<span class="sci-lmsel">Finding landmarks…</span>' : on && slm.err ? '<span class="sci-lmsel">' + esc(slm.err) + "</span>" : "");
  }
  /* SYSTEMS → SCIENCE: the list, kept on this iPad. */
  function lmEditor() {
    var loc = sciPlace(), kinds = { town: "town", airport: "airport", own: "your place" };
    var rows = lmAll().map(function (x) {
      var w = loc ? sciKm(loc, x) : null;
      return '<div class="lm-row' + (x.hidden ? " off" : "") + '"><span class="lm-ic ' + x.kind + '" aria-hidden="true"></span><input type="text" class="lm-name" id="lmName-' + esc(x.id) + '" data-scilmname="' + esc(x.id) + '" value="' + esc(x.name) + '" maxlength="40" aria-label="Name for this landmark">' +
        '<small class="muted">' + kinds[x.kind] + (w ? " · " + w.km + " km " + sciCompass(w.dir) : "") + '</small><button type="button" class="chip sm" data-scilmhide="' + esc(x.id) + '" aria-pressed="' + !x.hidden + '">' + (x.hidden ? "HIDDEN" : "SHOWN") + "</button>" +
        (x.auto ? "<span></span>" : '<button type="button" class="chip sm" data-scilmdel="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">✕</button>') + "</div>";
    }).join("");
    var found = (slm.found || []).map(function (r, i) { return '<button type="button" class="chip sm" data-scilmadd="' + i + '">+ ' + esc(r.name) + (r.sub ? " · " + esc(r.sub) : "") + " · " + r.km + " km " + sciCompass(r.dir) + "</button>"; }).join("");
    return '<div class="lm-edit">' +
      '<label class="lm-home"><span class="ov-sub">THE CENTRE IS CALLED</span><input type="text" id="lmHome" data-scilmhome value="' + esc(slm.d && slm.d.home || "") + '" placeholder="home" maxlength="30"></label>' +
      (rows || '<div class="empty">' + (slm.busy ? "Finding landmarks…" : "None yet.") + "</div>") +
      '<div class="lm-add"><input type="text" id="lmFind" placeholder="A place name, or latitude, longitude" aria-label="Find a place to add"><button type="button" class="chip sm" data-scilmact="find">FIND</button><button type="button" class="chip sm" data-scilmact="here">ADD WHERE I AM</button></div>' +
      (found ? '<div class="btnrow lm-found">' + found + "</div>" : "") + (slm.findMsg ? '<small class="muted">' + esc(slm.findMsg) + "</small>" : "") +
      '<div class="btnrow"><button type="button" class="chip sm" data-scilmact="suggest">SUGGEST AGAIN</button><button type="button" class="chip sm" data-scilmact="done">DONE</button></div>' +
      '<small class="muted">Kept only on this iPad (and in your backups). SUGGEST AGAIN asks OpenStreetMap afresh and keeps the ones you added, renamed or hid.</small></div>';
  }
  function lmAdd(name, kind, lat, lon) {
    var loc = sciPlace(); if (!loc) return;
    var w = sciKm(loc, { lat: lat, lon: lon });
    if (w.km > SCI_KM) { slm.findMsg = name + " is " + w.km + " km away, outside the scope's 50 km."; render(true); return; }
    slm.d = slm.d || { home: "", asked: false, list: [] };
    slm.d.list.push({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, kind: kind, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, auto: false });
    lmSave(); slm.found = null; slm.findMsg = name + " added, " + w.km + " km " + sciCompass(w.dir) + "."; render(true);
  }
  function lmFind() {
    var el = $("lmFind"), v = el ? el.value.trim() : "", loc = sciPlace(); if (!v || !loc) return;
    var m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { if (Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) { slm.findMsg = "Those aren't a latitude and longitude."; render(true); return; } lmAdd("My place", "own", +m[1], +m[2]); return; }
    slm.findMsg = "Looking…"; slm.found = null; render(true);
    sciGet("https://geocoding-api.open-meteo.com/v1/search?count=20&format=json&name=" + encodeURIComponent(v)).then(function (j) {
      slm.found = (j.results || []).map(function (r) { var w = sciKm(loc, { lat: r.latitude, lon: r.longitude }); return { name: r.name, sub: r.admin2 || r.admin1 || "", lat: r.latitude, lon: r.longitude, km: w.km, dir: w.dir, kind: /^AIRP|^AIRF/.test(r.feature_code || "") ? "airport" : /^PPL/.test(r.feature_code || "") ? "town" : "own" }; })
        .filter(function (r) { return r.km <= SCI_KM; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 6);
      slm.findMsg = slm.found.length ? "" : "Nothing called that within 50 km. Coordinates work too (latitude, longitude), or ADD WHERE I AM when you're there.";
    }).catch(function (e) { slm.findMsg = "The place search didn't answer (" + describe(e) + ")."; })
      .then(function () { if (state.screen === "systems") render(true); });
  }
  function lmClick(b) {
    var d = b.dataset;
    if (d.scilmt !== undefined) { if (lmOn()) lsSet(LS_SCILMOFF, true); else lsDel(LS_SCILMOFF); slm.sel = null; sciPaintSky(); return true; }
    if (d.scilmhide) { lmAll().forEach(function (x) { if (x.id === d.scilmhide) x.hidden = !x.hidden; }); lmSave(); render(true); return true; }
    if (d.scilmdel) { slm.d.list = lmAll().filter(function (x) { return x.id !== d.scilmdel; }); lmSave(); render(true); return true; }
    if (d.scilmadd) { var r = (slm.found || [])[+d.scilmadd]; if (r) lmAdd(r.name, r.kind, r.lat, r.lon); return true; }
    if (d.scilmact === "edit") { slm.edit = true; render(true); return true; }
    if (d.scilmact === "done") { slm.edit = false; slm.found = null; slm.findMsg = ""; render(true); return true; }
    if (d.scilmact === "find") { lmFind(); return true; }
    if (d.scilmact === "suggest") { lmSuggest(true); render(true); return true; }
    if (d.scilmact === "here") {
      if (!navigator.geolocation) { slm.findMsg = "This browser can't share its location. Type the numbers instead."; render(true); return true; }
      slm.findMsg = "Asking for location…"; render(true);
      navigator.geolocation.getCurrentPosition(function (pos) { lmAdd("My place", "own", pos.coords.latitude, pos.coords.longitude); },
        function () { slm.findMsg = "Location wasn't shared. Type the numbers instead."; render(true); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
      return true;
    }
    return false;
  }
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.dataset) return;
    if (t.dataset.scilmname) { var v = t.value.trim(); lmAll().forEach(function (x) { if (x.id === t.dataset.scilmname && v) x.name = v.slice(0, 40); }); lmSave(); }
    else if (t.dataset.scilmhome !== undefined && slm.d) { slm.d.home = t.value.trim().slice(0, 30); lmSave(); }
    else if (t.dataset.scilmhome !== undefined) { slm.d = { home: t.value.trim().slice(0, 30), asked: false, list: [] }; lmSave(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "lmFind") { e.preventDefault(); lmFind(); } });

  /* ---- orbits: visible passes, worked out here ---- */
  function sciPasses() {
    var loc = sciPlace(), f = sciV("feeds"), day = ymd(new Date());
    if (!loc || !f || !f.tle || (sc.d.passes && sc.d.passes.day === day && sc.d.passes.tle === f.tle.iss.l1 && sc.d.passes.at > Date.now() - 6 * 3600000)) return;
    if (sc.busy.passes) return;
    sc.busy.passes = true;
    sciLibs().then(function () {
      var list = [];
      Object.keys(SCI_SAT).forEach(function (k) { if (f.tle[k]) list = list.concat(sciPassesFor(k, f.tle[k], loc)); });
      list.sort(function (a, b) { return a.rise - b.rise; });
      sc.d.passes = { day: day, at: Date.now(), tle: f.tle.iss.l1, v: list }; sciSave(); sciDetect("passes");
    }).catch(function (e) { sc.err.passes = { at: Date.now(), msg: String(e.message || e) }; })
      .then(function () { delete sc.busy.passes; if (state.screen === "science" || state.screen === "bridge") render(true); });
  }
  function sciPassesFor(k, tle, loc) {
    var S = window.satellite, A = window.Astronomy, rec = S.twoline2satrec(tle.l1, tle.l2), obs = { latitude: loc.lat * Math.PI / 180, longitude: loc.lon * Math.PI / 180, height: 0.2 };
    var aobs = new A.Observer(loc.lat, loc.lon, 200), out = [], cur = null, t0 = Date.now() - 10 * 60000, t1 = Date.now() + 5 * 864e5;
    var look = function (ms) {
      var d = new Date(ms), pv = S.propagate(rec, d); if (!pv || !pv.position) return null;
      var la = S.ecfToLookAngles(obs, S.eciToEcf(pv.position, S.gstime(d)));
      return { el: la.elevation * 180 / Math.PI, az: la.azimuth * 180 / Math.PI, p: pv.position };
    };
    var lit = function (ms, p) {   /* in sunlight: outside Earth's shadow (a cylinder behind it) */
      var s = A.GeoVector(A.Body.Sun, new Date(ms), true), n = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z), u = { x: s.x / n, y: s.y / n, z: s.z / n };
      var dot = p.x * u.x + p.y * u.y + p.z * u.z; if (dot > 0) return true;
      var px = p.x - dot * u.x, py = p.y - dot * u.y, pz = p.z - dot * u.z; return Math.sqrt(px * px + py * py + pz * pz) > 6371;
    };
    var sunAlt = function (ms) { var d = new Date(ms), eq = A.Equator(A.Body.Sun, d, aobs, true, true); return A.Horizon(d, aobs, eq.ra, eq.dec, null).altitude; };
    for (var ms = t0; ms < t1; ms += 30000) {
      var l = look(ms); if (!l) continue;
      if (l.el >= 10) {
        if (!cur) cur = { sat: k, name: SCI_SAT[k], rise: ms, riseAz: l.az, max: l.el, maxAt: ms, maxAz: l.az, maxP: l.p };
        if (l.el > cur.max) { cur.max = l.el; cur.maxAt = ms; cur.maxAz = l.az; cur.maxP = l.p; }
        cur.set = ms; cur.setAz = l.az;
      } else if (cur) {
        if (sunAlt(cur.maxAt) < -6 && lit(cur.maxAt, cur.maxP)) { delete cur.maxP; cur.max = Math.round(cur.max); out.push(cur); }
        cur = null;
      }
    }
    return out.filter(function (p) { return p.set > Date.now() - 5 * 60000; });
  }
  function sciPassLook(p) { return p.sat === "hst" ? "Faint; binoculars help" : p.max >= 40 ? (p.sat === "iss" ? "Bright, easy to see" : "Bright") : "Low, " + p.max + "° up"; }
  function sciTonight() {   /* a bright station pass still to come today */
    var p = (sc.d.passes && sc.d.passes.v) || [], now = Date.now(), end = addDays(sod(new Date()), 1).getTime();
    return p.filter(function (x) { return x.sat !== "hst" && x.max >= 40 && x.set > now && x.rise < end; })[0] || null;
  }

  /* ---- the night sky, worked out here ---- */
  function sciNight() {
    var loc = sciPlace(), day = ymd(new Date());
    if (!loc || sc.busy.night || (sc.d.night && sc.d.night.day === day && sc.d.night.lat === loc.lat)) return;
    sc.busy.night = true;
    sciLibs().then(function () {
      var A = window.Astronomy, o = new A.Observer(loc.lat, loc.lon, 200), now = new Date(), d0 = sod(now), t = function (x) { return x ? x.date.getTime() : null; };
      var n = { day: day, lat: loc.lat };
      n.sunset = t(A.SearchRiseSet(A.Body.Sun, o, -1, d0, 1)); n.sunrise = t(A.SearchRiseSet(A.Body.Sun, o, +1, addDays(d0, 1), 1));
      n.dark = t(A.SearchAltitude(A.Body.Sun, o, -1, d0, 1, -18)); n.dawn = t(A.SearchAltitude(A.Body.Sun, o, +1, addDays(d0, 1), 1, -18));
      n.phase = A.MoonPhase(now); n.lit = Math.round(A.Illumination(A.Body.Moon, now).phase_fraction * 100);
      n.moonrise = t(A.SearchRiseSet(A.Body.Moon, o, +1, d0, 1)); n.moonset = t(A.SearchRiseSet(A.Body.Moon, o, -1, d0, 1.5));
      n.full = t(A.SearchMoonPhase(180, d0, 40)); n.newm = t(A.SearchMoonPhase(0, d0, 40));
      var look = (n.dark || n.sunset || now.getTime()) + 3600000;
      n.planets = SCI_PLANETS.map(function (b) {
        var at = function (ms) { var d = new Date(ms), eq = A.Equator(A.Body[b], d, o, true, true), h = A.Horizon(d, o, eq.ra, eq.dec, null); return { alt: h.altitude, az: h.azimuth }; };
        var eve = at(look), pre = at((n.dawn || look + 9 * 3600000) - 1800000);
        return { name: b, eve: eve.alt > 10 ? Math.round(eve.alt) : null, eveAz: Math.round(eve.az), dawn: pre.alt > 10 ? Math.round(pre.alt) : null, dawnAz: Math.round(pre.az) };
      }).filter(function (p) { return p.eve != null || p.dawn != null; });
      var le = A.SearchLunarEclipse(d0);
      if (le && le.peak.date.getTime() - now < 365 * 864e5) { var mq = A.Equator(A.Body.Moon, le.peak.date, o, true, true), mh = A.Horizon(le.peak.date, o, mq.ra, mq.dec, null); n.lunar = { kind: le.kind, at: le.peak.date.getTime(), up: mh.altitude > 0 }; }
      var se = A.SearchLocalSolarEclipse(d0, o);
      if (se && se.peak.time.date.getTime() - now < 365 * 864e5) n.solar = { kind: se.kind, at: se.peak.time.date.getTime(), alt: Math.round(se.peak.altitude) };
      sc.d.night = n; sciSave(); sciDetect("night");
    }).catch(function (e) { sc.err.night = { at: Date.now(), msg: String(e.message || e) }; })
      .then(function () { delete sc.busy.night; if (state.screen === "science") render(true); });
  }
  function sciPhaseName(deg) {   /* the named phases are moments: within about 10° of them */
    var d = ((deg % 360) + 360) % 360;
    return d < 10 || d >= 350 ? "New moon" : d < 80 ? "Waxing crescent" : d < 100 ? "First quarter" : d < 170 ? "Waxing gibbous" : d < 190 ? "Full moon" : d < 260 ? "Waning gibbous" : d < 280 ? "Last quarter" : "Waning crescent";
  }
  function sciMeteor(now) {
    var y = now.getFullYear(), list = SCI_METEORS.map(function (m) { var d = parseYmd(y + "-" + m[1]); if (d < addDays(sod(now), -1)) d = parseYmd((y + 1) + "-" + m[1]); return { name: m[0], d: d }; });
    return list.sort(function (a, b) { return a.d - b.d; })[0];
  }
  /* Aurora here: roughly the Kp at which NOAA's view line (low on the northern horizon) reaches this latitude in North America. */
  function sciAuroraKp(lat) { var a = Math.abs(lat); return a >= 62 ? 2 : a >= 58 ? 3 : a >= 55 ? 4 : a >= 50 ? 5 : a >= 47 ? 6 : a >= 44 ? 7 : a >= 40 ? 8 : 9; }
  function sciKpNow() { var k = sciV("kp"); if (!k || !k.length) return null; var r = k[k.length - 1], v = parseFloat(r.Kp != null ? r.Kp : r[1]); return isNaN(v) ? null : { kp: Math.round(v * 10) / 10, at: r.time_tag || r[0] }; }
  function sciKpTonight() {
    var f = sciV("kpf"); if (!f) return null;
    var now = Date.now(), end = addDays(sod(new Date()), 1).getTime() + 6 * 3600000, best = null;
    f.forEach(function (r) { var tt = Date.parse((r.time_tag || r[0]) + "Z"), kp = parseFloat(r.kp != null ? r.kp : r[1]); if (!isNaN(kp) && tt > now - 3 * 3600000 && tt < end && (best == null || kp > best)) best = kp; });
    return best;
  }

  /* ---- events of interest: detected, logged here for 30 days, and in Notion ---- */
  function sciEmer(a) { return a.emergency || ({ 7500: "hijack", 7600: "radio failure", 7700: "emergency" })[a.sq] || ""; }
  function sciDetect(k) {
    var loc2 = sciPlace(), now = new Date(), day = ymd(now), add = sciEvent;
    if (k === "sky" && sc.sky) sc.sky.list.forEach(function (a) {
      var emer = sciEmer(a), low = a.alt != null && a.alt < 2000 && a.km <= 10;
      if (!a.mil && !emer && !low) return;
      add({ key: "ac:" + a.hex + ":" + day, at: now.toISOString(), dept: "sky", kind: "aircraft", value: a.alt,
        title: (a.cs || a.reg || a.hex.toUpperCase()) + (emer ? " squawking " + emer : a.mil ? ", military," : ", low,") + " at " + sciFt(a.alt) + " ft",
        detail: [a.type, a.reg, a.km + " km " + sciCompass(a.dir), a.gs ? a.gs + " kt" : ""].filter(Boolean).join(" · ") });
    });
    if (k === "passes") ((sc.d.passes && sc.d.passes.v) || []).forEach(function (p) {
      if (p.sat === "hst" || p.max < 40 || ymd(new Date(p.maxAt)) !== day) return;
      add({ key: "pass:" + p.sat + ":" + day + "T" + hm(new Date(p.rise)).replace(":", ""), at: new Date(p.maxAt).toISOString(), dept: "sky", kind: "station", value: p.max,
        title: p.name + " visible pass, " + p.max + "° high", detail: "Rises " + sciCompass(p.riseAz) + " " + hm(new Date(p.rise)) + ", highest " + sciCompass(p.maxAz) + ", sets " + sciCompass(p.setAz) + " " + hm(new Date(p.set)) });
    });
    if (k === "kp") (sciV("kp") || []).slice(-16).forEach(function (r) {
      var kp = parseFloat(r.Kp != null ? r.Kp : r[1]), tt = r.time_tag || r[0]; if (!(kp >= 5)) return;
      add({ key: "kp:" + String(tt).replace(/[^0-9T]/g, ""), at: new Date(Date.parse(tt + "Z")).toISOString(), dept: "space", kind: "storm", value: kp, title: "Geomagnetic storm G" + Math.min(5, Math.floor(kp) - 4) + " (Kp " + kp + ")",
        detail: loc2 && kp >= sciAuroraKp(loc2.lat) ? "Strong enough for aurora at this latitude" : "Aurora further north" });
    });
    if (k === "flares") (sciV("flares") || []).forEach(function (f) {
      var c = f.max_class || f.current_class || ""; if (!/^[MX]/.test(c) || !f.begin_time) return;
      add({ key: "flare:" + f.begin_time.replace(/[^0-9T]/g, ""), at: new Date(Date.parse(f.max_time || f.begin_time)).toISOString(), dept: "space", kind: "flare", value: null, title: c + " solar flare", detail: c[0] === "X" ? "Strong: shortwave fade-outs on the sunlit side" : "Moderate: brief shortwave fades possible" });
    });
    if (k === "quakes") (sciV("quakes") || []).forEach(function (q) {
      if (!((q.km <= 300 && q.mag >= 2.5) || q.mag >= 6) || Date.now() - q.at > 7 * 864e5) return;
      add({ key: "eq:" + q.id, at: new Date(q.at).toISOString(), dept: "earth", kind: "quake", value: q.mag, title: "M " + q.mag + " earthquake, " + (q.km <= 300 ? q.km + " km " + sciCompass(q.dir) : q.place), detail: q.place + " · " + q.depth + " km deep" });
    });
    if (k === "alerts") (sciV("alerts") || []).forEach(function (a) {
      add({ key: "nws:" + String(a.id).replace(/[^A-Za-z0-9.]/g, "").slice(-60), at: new Date(Date.parse(a.sent) || Date.now()).toISOString(), dept: "earth", kind: "alert", value: null, title: a.event, detail: String(a.headline || "").slice(0, 300) });
    });
    if (k === "night" && sc.d.night) {
      var n = sc.d.night;
      if (n.full && ymd(new Date(n.full)) === day) add({ key: "moon:full:" + day, at: new Date(n.full).toISOString(), dept: "night", kind: "moon", value: 100, title: "Full moon", detail: "Exactly full at " + hm(new Date(n.full)) });
      if (n.newm && ymd(new Date(n.newm)) === day) add({ key: "moon:new:" + day, at: new Date(n.newm).toISOString(), dept: "night", kind: "moon", value: 0, title: "New moon", detail: "Darkest skies of the month" });
      var m = sciMeteor(now); if (ymd(m.d) === day) add({ key: "met:" + m.name.replace(/\s/g, "") + ":" + now.getFullYear(), at: new Date(m.d.getTime() + 3 * 3600000).toISOString(), dept: "night", kind: "meteors", value: null, title: m.name + " meteor shower peaks tonight", detail: "Best after midnight, away from lights" });
      if (n.lunar && n.lunar.up && ymd(new Date(n.lunar.at)) === day) add({ key: "ecl:lunar:" + day, at: new Date(n.lunar.at).toISOString(), dept: "night", kind: "eclipse", value: null, title: "Lunar eclipse (" + n.lunar.kind + ")", detail: "Peak " + hm(new Date(n.lunar.at)) });
      if (n.solar && ymd(new Date(n.solar.at)) === day) add({ key: "ecl:solar:" + day, at: new Date(n.solar.at).toISOString(), dept: "night", kind: "eclipse", value: n.solar.alt, title: "Solar eclipse (" + n.solar.kind + ")", detail: "Peak " + hm(new Date(n.solar.at)) + ", Sun " + n.solar.alt + "° high. Never look without eclipse glasses." });
    }
    if (k === "neo") (sciV("neo") || []).forEach(function (o) {
      if (o.ld > 1) return;
      add({ key: "neo:" + o.id + ":" + ymd(new Date(o.at)), at: new Date(o.at).toISOString(), dept: "night", kind: "asteroid", value: o.ld, title: "Asteroid " + o.name + " passes inside the Moon's distance", detail: "About " + o.m + " m across, " + o.ld + " lunar distances" });
    });
    if (k === "feeds") ((sciV("feeds") || {}).birds || []).forEach(function (b) {
      add({ key: "bird:" + String(b.id).replace(/[^A-Za-z0-9:]/g, ""), at: new Date(Date.parse(String(b.at).replace(" ", "T")) || Date.now()).toISOString(), dept: "nature", kind: "bird", value: b.count, title: b.name + " reported " + b.km + " km " + sciCompass(b.dir), detail: "Notable (eBird) · " + (b.loc || "") });
    });
  }
  function sciEvent(e) {
    if (sc.log.some(function (x) { return x.key === e.key; })) return;
    if (isNaN(Date.parse(e.at))) e.at = new Date().toISOString();
    sc.log.unshift(e); sciTrim();
    lsSet(LS_SCILOG, sc.log);
    if (canSciLog()) { sc.q.add.push(e.key); lsSet(LS_SCIQ, sc.q); clearTimeout(sc.qT); sc.qT = setTimeout(sciFlush, 1500); }
  }
  function sciTrim() { var cut = Date.now() - SCI_KEEP_DAYS * 864e5; sc.log = sc.log.filter(function (x) { return Date.parse(x.at) > cut || sc.q.add.indexOf(x.key) > -1; }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); }).slice(0, 400); }
  /* To Notion, 25 at a time; a star waits for its event's page. Kept on this iPad until the bridge takes them. */
  function sciFlush() {
    if (sc.flushing || !state.conn || !canSciLog()) return;
    var keys = sc.q.add.slice(0, 25), evs = keys.map(function (k) { return sc.log.filter(function (x) { return x.key === k; })[0]; }).filter(Boolean);
    if (keys.length && !evs.length) { sc.q.add = sc.q.add.slice(keys.length); lsSet(LS_SCIQ, sc.q); return sciFlush(); }
    var starList = Object.keys(sc.q.star).filter(function (k) { var e = sc.log.filter(function (x) { return x.key === k; })[0]; return e && e.id; });
    if (!evs.length && !starList.length) return;
    sc.flushing = true;
    var job = evs.length ? apiPost({ action: "sciencelogadd", events: evs.map(function (e) { return { key: e.key, at: e.at, dept: e.dept, kind: e.kind, title: e.title.slice(0, 200), detail: (e.detail || "").slice(0, 500), value: e.value == null ? null : e.value, starred: !!e.starred }; }) })
      .then(function (j) {
        (j.added || []).concat(j.skipped || []).forEach(function (r) { sc.log.forEach(function (x) { if (x.key === r.key) x.id = r.id; }); });
        sc.q.add = sc.q.add.filter(function (k) { return keys.indexOf(k) < 0; });
        evs.forEach(function (e) { if (sc.q.star[e.key] === !!e.starred && (j.added || []).some(function (r) { return r.key === e.key; })) delete sc.q.star[e.key]; });   /* sent with its star */
      })
      : (function () { var k = starList[0], e = sc.log.filter(function (x) { return x.key === k; })[0]; return apiPost({ action: "sciencestar", id: e.id, starred: sc.q.star[k] }).then(function () { delete sc.q.star[k]; }, function (err) { if (err && err.code === "not_writable") delete sc.q.star[k]; else throw err; }); })();
    job.then(function () { sc.qErr = ""; }, function (err) { sc.qErr = describe(err); clearTimeout(sc.qT); sc.qT = setTimeout(sciFlush, 60000); })
      .then(function () { sc.flushing = false; lsSet(LS_SCILOG, sc.log); lsSet(LS_SCIQ, sc.q); if (!sc.qErr && (sc.q.add.length || Object.keys(sc.q.star).some(function (k) { return sc.log.some(function (x) { return x.key === k && x.id; }); }))) sciFlush(); if (state.screen === "science" || state.screen === "systems") render(true); });
  }
  function sciStar(key) {
    var e = sc.log.filter(function (x) { return x.key === key; })[0]; if (!e) return;
    e.starred = !e.starred; lsSet(LS_SCILOG, sc.log);
    if (canSciLog()) { sc.q.star[key] = e.starred; lsSet(LS_SCIQ, sc.q); sciFlush(); }
    render(true);
  }

  /* ---- the screen ---- */
  function scienceHead() {
    var n = sc.sky ? sc.sky.list.length : null;
    return { e: "SCIENCE · " + SCI_DEPTS[sc.tab][0] + (sc.tab === "sky" && n != null ? " · " + n + " AIRCRAFT IN RANGE" : ""), t: "SENSORS" };
  }
  function renderScience() {
    if (!canScience()) { $("content").innerHTML = '<div class="sci">' + phead("SCIENCE", "SETUP") + stubBox(state.conn ? "Needs the Google bridge updated (README: Updating the Google bridge)." : "Link calendars first.") + "</div>"; return; }
    if (!sciPlace()) { $("content").innerHTML = '<div class="sci">' + phead("SCIENCE", "SETUP") + stubBox("Set your location in <b>SYSTEMS → BRIDGE</b> (it's rounded to about 1 km, as for the weather). Every SCIENCE feed works from it.") + "</div>"; return; }
    sciLoad(true);
    sciStart();
    var body = { sky: sciSkyHtml, space: sciSpaceHtml, earth: sciEarthHtml, night: sciNightHtml, nature: sciNatureHtml }[sc.tab]();
    var photo = document.querySelector("#content .sci-photo");   /* an open card's photo survives a full redraw too */
    $("content").innerHTML = '<div class="sci">' + sciSweep() + body + sciLogHtml() + "</div>";
    var again = photo && document.querySelector("#content .sci-photo"); if (again && again.getAttribute("src") === photo.getAttribute("src")) again.replaceWith(photo);
  }
  function sciStart() {
    if (sc.timer) return;
    var beat = function () {
      if (state.screen !== "science" || document.hidden) { clearInterval(sc.timer); sc.timer = 0; return; }
      if (sc.tab === "sky") sciSky();
      sciLoad(false);
    };
    sc.timer = setInterval(beat, SCI_SKY_MS); setTimeout(beat, 0);
  }
  function sciSec(c, t, meta, inner) { return '<section class="sci-panel" style="--c: var(--' + c + ')">' + phead(t, meta, c) + inner + "</section>"; }
  function sciErr(k) { var e = sc.err[k]; return e ? '<div class="sci-src warntxt">Couldn\'t read it: ' + esc(e.msg) + ". Tries again in a few minutes.</div>" : ""; }
  function sciWait(k) { return sc.busy[k] || !sc.d[k] ? '<div class="empty">' + (sc.err[k] ? esc(sc.err[k].msg) : "Reading…") + "</div>" : ""; }
  function sciSweep() {
    var loc = sciPlace(), n = sc.sky ? sc.sky.list.length : null, ton = sciTonight(), next = ((sc.d.passes && sc.d.passes.v) || []).filter(function (p) { return p.sat === "iss" && p.set > Date.now(); })[0];
    var kp = sciKpNow(), air = sciV("air"), al = sciV("alerts") || [], q = (sciV("quakes") || []).filter(function (x) { return x.km <= 500; })[0], night = sc.d.night, inat = sciV("inat"), birds = ((sciV("feeds") || {}).birds || []), tn = sciKpTonight();
    var T = [
      ["sky", n == null ? "–" : n + " aircraft", ton ? ton.name + " " + hm(new Date(ton.rise)) + " · " + ton.max + "° high" : next ? "ISS next " + DOW[new Date(next.rise).getDay()] + " " + hm(new Date(next.rise)) : "Passes once the orbits load"],
      ["space", kp ? "Kp " + kp.kp : "–", kp ? (kp.kp >= 5 ? "Storm" : kp.kp >= 4 ? "Unsettled" : "Quiet") + " · aurora " + (loc && tn != null && tn >= sciAuroraKp(loc.lat) ? "possible tonight" : "unlikely here") : "Reading NOAA"],
      ["earth", air && air.us_aqi != null ? "AQI " + Math.round(air.us_aqi) : al.length ? al.length + (al.length === 1 ? " alert" : " alerts") : "–", (al.length ? al[0].event : "No alerts") + (q ? " · M" + q.mag + " " + q.km + " km" : "")],
      ["night", night ? night.lit + "% moon" : "–", night ? sciPhaseName(night.phase) + " · " + (night.dark ? "dark at " + hm(new Date(night.dark)) : "sunset " + hm(new Date(night.sunset))) : "Working it out"],
      ["nature", inat ? inat.length + " species" : "–", (birds.length ? birds.length + " notable birds · " : "") + "seen within 25 km this week"]
    ];
    return '<section class="sci-sweep">' + phead("SENSOR SWEEP", "LIVE · TAP A DEPARTMENT", "chrome-b") + '<div class="sci-tiles">' + T.map(function (t) {
      return '<button type="button" class="sci-tile" data-scitab="' + t[0] + '" aria-pressed="' + (sc.tab === t[0]) + '" style="--c: var(--' + SCI_DEPTS[t[0]][1] + ')"><span class="k">' + SCI_DEPTS[t[0]][0] + '</span><span class="v">' + esc(t[1]) + '</span><span class="s">' + esc(t[2]) + "</span></button>";
    }).join("") + "</div></section>";
  }

  /* SKY TRAFFIC */
  function sciScope() {
    var C = 210, R = 190, pt = function (b, d) { var a = (b - 90) * Math.PI / 180, r = Math.min(d, SCI_KM) / SCI_KM * R; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
    var s = '<svg viewBox="0 0 420 420" role="img" aria-label="Aircraft within 50 km"><defs><radialGradient id="sciSweep" cx="0" cy="0" r="1"><stop offset="0" stop-color="#56c7b8" stop-opacity="0"/><stop offset="1" stop-color="#56c7b8" stop-opacity=".25"/></radialGradient></defs>';
    [10, 25, 50].forEach(function (k) { s += '<circle class="ring" cx="' + C + '" cy="' + C + '" r="' + (k / SCI_KM * R) + '"/><text class="lab" x="' + (C - 5) + '" y="' + (C + k / SCI_KM * R - 5) + '" text-anchor="end">' + k + " KM</text>"; });
    s += '<line class="axis" x1="210" y1="20" x2="210" y2="400"/><line class="axis" x1="20" y1="210" x2="400" y2="210"/><text class="card" x="210" y="14" text-anchor="middle">N</text><text class="card" x="210" y="416" text-anchor="middle">S</text><text class="card" x="410" y="215" text-anchor="end">E</text><text class="card" x="10" y="215">W</text>';
    if (!calm()) s += '<g class="sweepg" style="animation-delay:-' + (Date.now() / 1000 % 6).toFixed(2) + 's"><path class="sweepw" d="M210 210 L210 20 A190 190 0 0 1 344 76 Z"/><line class="sweepl" x1="210" y1="210" x2="210" y2="20"/></g>';
    s += lmSvg(pt);
    var on = ((sc.d.passes && sc.d.passes.v) || []).filter(function (p) { return p.rise <= Date.now() && p.set >= Date.now(); })[0];
    if (on) { var e = pt(on.maxAz, SCI_KM); s += '<g class="iss"><circle cx="' + e[0] + '" cy="' + e[1] + '" r="7"/><text x="' + (e[0] + 10) + '" y="' + (e[1] + 16) + '">' + esc(on.name.toUpperCase()) + " · LOOK " + sciCompass(on.maxAz) + "</text></g>"; }
    ((sc.sky && sc.sky.list) || []).forEach(function (a) {
      var q = pt(a.dir, a.km), low = a.alt != null && a.alt < 5000, sel = a.hex === sc.sel;
      s += '<g class="ac' + (sel ? " sel" : "") + (low ? " low" : "") + (a.mil ? " mil" : "") + '" data-sciac="' + esc(a.hex) + '" transform="translate(' + q[0].toFixed(1) + " " + q[1].toFixed(1) + ')"><circle class="tap" r="16"/>' +   /* not .hit: that class opens the charts' tooltips and swallowed the tap */
        '<path transform="rotate(' + (a.track || 0) + ')" d="M0 -9 L6 7 L0 3 L-6 7 Z"/><text x="10" y="4">' + esc(a.cs || a.reg || a.hex.toUpperCase()) + "</text></g>";
    });
    return s + '<circle class="home" cx="210" cy="210" r="5"/></svg>';
  }
  function sciRoute(a) { var r = sc.info["r:" + a.cs]; return r && r.v && r.v.origin && r.v.destination ? r.v : null; }
  function sciAcRow(a) {
    var r = sciRoute(a), low = a.alt != null && a.alt < 5000, ac = sc.info["a:" + a.hex] && sc.info["a:" + a.hex].v;
    var who = r && r.airline ? r.airline.name : ac && ac.registered_owner ? ac.registered_owner : a.mil ? "Military" : "", near = sciNear(a);
    return '<button type="button" class="sci-row" data-sciac="' + esc(a.hex) + '" aria-pressed="' + (a.hex === sc.sel) + '" style="--c: var(--' + (sciEmer(a) ? "bad" : low ? "warn" : a.mil ? "chrome-d" : "personal") + ')"><i></i><span><b>' + esc(a.cs || a.reg || a.hex.toUpperCase()) + "</b>" + (who ? " · " + esc(who) : "") +
      "<small>" + esc([a.type, r ? r.origin.iata_code + " → " + r.destination.iata_code : ""].filter(Boolean).join(" · ") || "Type not broadcast") + (near ? ' <span class="sci-near">· near ' + esc(near.lm.name) + "</span>" : "") + '</small></span><span class="r tnum">' + sciFt(a.alt) + " FT<small>" + a.km + " km " + sciCompass(a.dir) + "</small></span></button>";
  }
  /* The open aircraft's card. Its photo stays put while the radar updates (2.44.2: every 10 s the whole card, photo
     included, was rebuilt and the picture fetched again, which flashed); only the words below it change. */
  function sciAcPhoto(ac) { return ac ? ac.url_photo || ac.url_photo_thumbnail || "" : ""; }   /* the full-size photo first: the thumbnail was too small to use */
  function sciAcDetail() {
    var a = ((sc.sky && sc.sky.list) || []).filter(function (x) { return x.hex === sc.sel; })[0];
    if (!a) return "";
    sciAircraftInfo(a);
    var ph = sciAcPhoto(sc.info["a:" + a.hex] && sc.info["a:" + a.hex].v);
    return '<div class="sci-detail" data-hex="' + esc(a.hex) + '" data-photo="' + esc(ph) + '">' + (ph ? '<a class="sci-photo-a" href="' + esc(ph) + '" target="_blank" rel="noopener" aria-label="Open the photo"><img class="sci-photo" src="' + esc(ph) + '" alt="" referrerpolicy="no-referrer"></a>' : "") +
      '<div class="sci-dbody">' + sciAcBody(a) + "</div></div>";
  }
  function sciAcBody(a) {
    var r = sciRoute(a), ac = sc.info["a:" + a.hex] && sc.info["a:" + a.hex].v, emer = sciEmer(a);
    var kv = function (k, v) { return v ? "<dt>" + k + "</dt><dd>" + v + "</dd>" : ""; };
    return "<h3>" + esc(a.cs || a.reg || a.hex.toUpperCase()) + (ac && ac.type ? " · " + esc((ac.manufacturer ? ac.manufacturer + " " : "") + ac.type) : a.type ? " · " + esc(a.type) : "") + '</h3><dl class="kv">' +
      kv("OPERATOR", esc(r && r.airline ? r.airline.name : ac && ac.registered_owner ? ac.registered_owner : a.mil ? "Military" : "")) +
      kv("ROUTE", r ? esc(r.origin.name + " (" + r.origin.iata_code + ") → " + r.destination.name + " (" + r.destination.iata_code + ")") : "") +
      kv("NOW", esc(sciFt(a.alt) + " ft · " + (a.gs != null ? a.gs + " kt · " : "") + (a.track != null ? "heading " + a.track + "° · " : "") + a.km + " km " + sciCompass(a.dir))) +
      kv("NEAR", sciNear(a) ? esc(sciNear(a).text) : "") +
      kv("AIRCRAFT", esc([a.reg, ac && ac.registered_owner_country_name, "squawk " + (a.sq || "–")].filter(Boolean).join(" · "))) +
      kv("NOTE", esc(emer ? "Squawking " + emer : a.mil ? "Military aircraft" : a.alt != null && a.alt < 5000 ? "Low: under 5,000 ft" : "")) + "</dl>" +
      '<div class="btnrow"><a class="chip sm" href="https://globe.adsb.lol/?icao=' + esc(a.hex) + '" target="_blank" rel="noopener">TRACK LIVE</a>' + (a.reg ? '<a class="chip sm" href="https://www.planespotters.net/search?q=' + encodeURIComponent(a.reg) + '" target="_blank" rel="noopener">PHOTOS</a>' : "") + "</div>";
  }
  function sciLegend() { return '<span><i style="background: var(--fg)"></i>aircraft, pointing where it flies</span><span><i style="background: var(--warn)"></i>low, under 5,000 ft</span><span><i style="background: var(--chrome-d)"></i>military</span>' + lmLegend(); }
  function sciRows() { var list = (sc.sky && sc.sky.list) || []; return list.length ? list.slice(0, 14).map(sciAcRow).join("") : '<div class="empty">' + (sc.skyErr ? esc(sc.skyErr) : sc.sky ? "No aircraft within 50 km right now." : "Listening…") + "</div>"; }
  function sciSrcLine() { return 'Aircraft: the community ADS-B network (' + esc((sc.sky && sc.sky.source) || "adsb.lol") + "), routes and aircraft from adsbdb. Coverage is what volunteers' receivers hear." + (sc.sky ? " Updated " + hm(new Date(sc.sky.at)) + ":" + p2(new Date(sc.sky.at).getSeconds()) + "." : ""); }
  function sciSkyInner() {
    return '<div class="sci-sky"><div><div class="sci-scope" id="sciScopeBox">' + sciScope() + '</div><div class="sci-legend" id="sciLegend">' + sciLegend() + "</div></div>" +
      '<div><div class="sci-rows" id="sciRows">' + sciRows() + '</div><div id="sciDet">' + sciAcDetail() + "</div></div></div>" +
      '<div class="sci-src" id="sciSrc">' + sciSrcLine() + "</div>";
  }
  function sciPaintSky() {   /* in place: the scope, legend, list and words refresh; an open card's photo is left alone */
    var el = $("sciSky"); if (!el) return;
    if (!$("sciScopeBox")) el.innerHTML = sciSkyInner();
    else {
      $("sciScopeBox").innerHTML = sciScope(); $("sciLegend").innerHTML = sciLegend(); $("sciRows").innerHTML = sciRows(); $("sciSrc").innerHTML = sciSrcLine();
      var host = $("sciDet"), cur = host.querySelector(".sci-detail"), a = ((sc.sky && sc.sky.list) || []).filter(function (x) { return x.hex === sc.sel; })[0];
      if (a && cur && cur.dataset.hex === a.hex && cur.dataset.photo === sciAcPhoto(sc.info["a:" + a.hex] && sc.info["a:" + a.hex].v)) {
        var b = sciAcBody(a), db = cur.querySelector(".sci-dbody"); if (db.innerHTML !== b) db.innerHTML = b;
      } else host.innerHTML = sciAcDetail();
    }
    var h = scienceHead(); $("eyebrow").textContent = h.e;
  }
  function sciSkyHtml() {
    var ps = ((sc.d.passes && sc.d.passes.v) || []).filter(function (p) { return p.set > Date.now(); }), on = ps.filter(function (p) { return p.rise <= Date.now(); })[0], iss = sc.iss;
    var nx = ps.filter(function (p) { return p.sat === "iss"; })[0], nxd = nx && new Date(nx.rise);
    var head = on ? '<div class="sci-detail hot"><h3>' + esc(on.name.toUpperCase()) + ' OVERHEAD NOW</h3><div>Look <b>' + sciCompass(on.maxAz) + ", " + on.max + "° up</b>: a bright, steady point, no blinking. It sets in the " + sciCompass(on.setAz) + " at " + hm(new Date(on.set)) + ".</div></div>"
      : '<div class="sci-detail"><h3>ISS NOW' + (iss ? ": " + Math.round(iss.alt) + " KM UP" : "") + '</h3><div class="muted tnum">' + (iss ? Math.round(iss.vel).toLocaleString("en-US") + " km/h · " + (iss.vis === "daylight" ? "in sunlight" : "in Earth's shadow") + " · " : "") +
        (nx ? "next visible here " + (sameDay(nxd, new Date()) ? "tonight" : DOW[nxd.getDay()]) + " at " + hm(nxd) : "no visible ISS pass in the next five days") + "</div></div>";
    var rows = ps.slice(0, 8).map(function (p) {
      var d = new Date(p.rise), same = sameDay(d, new Date());
      return '<tr><td><b class="sat-' + p.sat + '">' + esc(p.name) + '</b><br><span class="muted">' + esc(sciPassLook(p)) + '</span></td><td class="t">' + (same ? "Tonight" : DOW[d.getDay()] + " " + p2(d.getDate())) + "<br>" + hm(d) + "</td><td>" + sciCompass(p.riseAz) + "</td><td>" + p.max + "° " + sciCompass(p.maxAz) + "</td><td>" + sciCompass(p.setAz) + " " + hm(new Date(p.set)) + '</td><td class="tnum">' + Math.max(1, Math.round((p.set - p.rise) / 60000)) + " min</td></tr>";
    }).join("");
    return sciSec("personal", "SKY TRAFFIC", "WITHIN 50 KM · EVERY 10 S WHILE OPEN", '<div id="sciSky">' + sciSkyInner() + "</div>") +
      sciSec("chrome-a", "SPACE STATIONS + SATELLITES", "VISIBLE PASSES · NEXT 5 DAYS", head + (sc.busy.passes || (sc.busy.feeds && !sc.d.feeds) ? '<div class="empty">Working out the passes…</div>' : rows ? '<div class="sci-table"><table class="sci-passes"><thead><tr><th>WHAT</th><th>WHEN</th><th>RISES</th><th>HIGHEST</th><th>SETS</th><th>FOR</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty">' + ((sciV("feeds") || {}).tleError ? "The orbits couldn't be read from CelesTrak. Tries again later." : "No visible passes in the next five days. Passes only show in a dark sky with the station in sunlight.") + "</div>") +
        '<div class="sci-src">Orbits from CelesTrak, worked out on this iPad for your rounded location; only passes in a dark sky with the station in sunlight are listed. Live position: wheretheiss.at.</div>' + sciErr("feeds"));
  }

  /* SPACE WEATHER */
  function sciSpaceHtml() {
    var kp = sciV("kp") || [], kf = sciV("kpf") || [], loc = sciPlace(), now = sciKpNow(), tn = sciKpTonight(), need = loc ? sciAuroraKp(loc.lat) : 9, b = (sciV("feeds") || {}).bands;
    var obs = kp.slice(-8).map(function (r) { return parseFloat(r.Kp != null ? r.Kp : r[1]); }).filter(function (v) { return !isNaN(v); }), fc = kf.filter(function (r) { return (r.observed || r[2]) !== "observed" && Date.parse((r.time_tag || r[0]) + "Z") > Date.now(); }).slice(0, 16).map(function (r) { return parseFloat(r.kp != null ? r.kp : r[1]); }).filter(function (v) { return !isNaN(v); });
    var bars = obs.concat(fc).map(function (v, i) { return '<i class="' + (v >= 5 ? "g2" : v >= 4 ? "g1" : "") + (i === obs.length - 1 ? " kp-now" : "") + '" style="height:' + Math.max(4, v / 9 * 100) + '%" title="Kp ' + v + '"></i>'; }).join("");
    var flares = (sciV("flares") || []).filter(function (f) { return f.max_class; }).slice(-3).reverse(), flux = (sciV("flux") || []).slice().sort(function (x, y) { return x.time_tag < y.time_tag ? 1 : -1; })[0];   /* NOAA lists it newest first */
    var bandRows = b && b.bands ? (function () {
      var names = []; b.bands.forEach(function (x) { if (names.indexOf(x.name) < 0) names.push(x.name); });
      var cell = function (n, t) { var x = b.bands.filter(function (y) { return y.name === n && y.time === t; })[0], c = x ? x.cond : "–"; return '<td><span class="pill ' + (c === "Good" ? "ok" : c === "Fair" ? "warn" : c === "Poor" ? "bad" : "") + '">' + esc(c.toUpperCase()) + "</span></td>"; };
      return names.map(function (n) { return "<tr><td>" + esc(n.replace("m-", " to ")) + "</td>" + cell(n, "day") + cell(n, "night") + "</tr>"; }).join("");
    })() : "";
    return sciSec("chrome-a", "SPACE WEATHER", "NOAA SPACE WEATHER PREDICTION CENTER", '<div class="sci-two"><div>' +
      (now ? '<div class="sci-big tnum">Kp ' + now.kp + "<small>" + (now.kp >= 5 ? "STORM" : now.kp >= 4 ? "UNSETTLED" : "QUIET") + "</small></div>" : sciWait("kp")) +
      '<div class="muted">Geomagnetic activity: the last day, then the forecast (3-hour steps)</div><div class="sci-kp">' + bars + '</div><div class="sci-kpax"><span>' + (obs.length ? "LAST DAY" : "") + "</span><span>NOW</span><span>FORECAST</span></div>" +
      '<p><span class="pill">AURORA</span> ' + (tn == null ? "Waiting for the forecast." : tn >= need ? "<b>Possible tonight</b>: the forecast reaches Kp " + tn + ", and about Kp " + need + " brings it to your latitude." : "Unlikely here: it needs about <b>Kp " + need + "</b> at your latitude; tonight's forecast peaks at Kp " + tn + ".") + "</p>" + sciErr("kp") + "</div>" +
      '<div><dl class="kv"><dt>SOLAR FLUX</dt><dd class="tnum">' + (flux ? Math.round(flux.flux) + " sfu" : b && b.flux ? esc(b.flux) + " sfu" : "–") + "</dd><dt>SUNSPOTS</dt><dd>" + (b && b.sunspots ? esc(b.sunspots) : "–") + "</dd>" +
      "<dt>FLARES</dt><dd>" + (flares.length ? flares.map(function (f) { var fd = new Date(Date.parse(f.max_time || f.begin_time)); return esc(f.max_class) + " " + DOW[fd.getDay()] + " " + hm(fd); }).join(" · ") : "None this week") + "</dd></dl>" +
      '<h3 class="sci-h">SHORTWAVE BANDS</h3>' + (bandRows ? '<table class="sci-bands"><thead><tr><th>BAND</th><th>DAY</th><th>NIGHT</th></tr></thead><tbody>' + bandRows + "</tbody></table>" : '<div class="empty">' + ((sciV("feeds") || {}).bandsError ? "Band conditions aren't available right now." : "Reading…") + "</div>") +
      '<div class="sci-src">Band conditions: N0NBH (hamqsl.com), through the Google bridge. Ready for a LISTENING POST.</div></div></div>');
  }

  /* EARTH */
  function sciEarthHtml() {
    var qs = (sciV("quakes") || []).slice(0, 8), al = sciV("alerts"), air = sciV("air");
    var aq = air && air.us_aqi != null ? Math.round(air.us_aqi) : null, aqName = aq == null ? "" : aq <= 50 ? "GOOD" : aq <= 100 ? "MODERATE" : aq <= 150 ? "UNHEALTHY FOR SOME" : aq <= 200 ? "UNHEALTHY" : "VERY UNHEALTHY";
    return sciSec("farm", "EARTH", "QUAKES · ALERTS · AIR", '<div class="sci-two"><div><h3 class="sci-h">EARTHQUAKES · 500 KM, AND M6 ANYWHERE</h3>' +
      (qs.length ? '<div class="sci-rows">' + qs.map(function (q) { var d = new Date(q.at); return '<a class="sci-row" href="' + esc(q.url) + '" target="_blank" rel="noopener" style="--c: var(--' + (q.mag >= 6 ? "bad" : q.mag >= 4 ? "warn" : "farm") + ')"><i></i><span><b>M ' + q.mag + "</b> · " + (q.km <= 500 ? q.km + " km " + sciCompass(q.dir) : esc(q.place)) + "<small>" + esc(q.place) + " · " + q.depth + ' km deep</small></span><span class="r">' + (sameDay(d, new Date()) ? "Today " : DOW[d.getDay()] + " " + p2(d.getDate()) + " ") + hm(d) + "</span></a>"; }).join("") + "</div>" : sciWait("quakes") || '<div class="empty">None in the last 30 days.</div>') +
      sciErr("quakes") + '<div class="sci-src">USGS earthquake feed.</div></div><div><h3 class="sci-h">WEATHER ALERTS</h3>' +
      (al ? (al.length ? '<div class="sci-rows">' + al.map(function (a) { return '<div class="sci-row" style="--c: var(--' + (/Extreme|Severe/.test(a.sev) ? "bad" : "warn") + ')"><i></i><span><b>' + esc(a.event) + "</b><small>" + esc(a.headline || "") + "</small></span><span></span></div>"; }).join("") + "</div>" : '<div class="sci-row" style="--c: var(--ok)"><i></i><span><b>No active alerts</b><small>National Weather Service</small></span><span></span></div>') : sciErr("alerts") || sciWait("alerts")) +
      '<h3 class="sci-h">AIR QUALITY</h3>' + (aq != null ? '<div class="sci-big tnum">' + aq + "<small>US AQI · " + aqName + '</small></div><div class="sci-aq"><b style="left:' + Math.min(98, aq / 3) + '%"></b></div><dl class="kv"><dt>PM2.5</dt><dd class="tnum">' + Math.round(air.pm2_5) + " µg/m³</dd><dt>OZONE</dt><dd class=\"tnum\">" + Math.round(air.ozone) + " µg/m³</dd><dt>UV</dt><dd>" + (air.uv_index != null ? Math.round(air.uv_index) : "–") + "</dd></dl>" : sciErr("air") || sciWait("air")) +
      '<div class="sci-src">Alerts: National Weather Service (US only). Air: Open-Meteo, the weather source Bridge already uses.</div></div></div>');
  }

  /* NIGHT SKY */
  function sciNightHtml() {
    var n = sc.d.night, neo = sciV("neo") || [], m = sciMeteor(new Date()), d = function (ms) { return ms ? hm(new Date(ms)) : "–"; }, day = function (ms) { var x = new Date(ms); return DOW[x.getDay()] + " " + p2(x.getDate()) + " " + MON[x.getMonth()]; };
    if (!n) return sciSec("work", "NIGHT SKY", "TONIGHT", sciErr("night") || '<div class="empty">Working out tonight\'s sky…</div>');
    var lit = Math.max(0, Math.min(100, n.lit)), waxing = n.phase < 180;
    return sciSec("work", "NIGHT SKY", "TONIGHT · WORKED OUT ON THIS IPAD", '<div class="sci-two"><div><div class="sci-tonight"><span class="sci-moon ' + (waxing ? "wax" : "wane") + '" style="--dark:' + (100 - lit) + '%" aria-hidden="true"></span><div><div class="sci-big" style="font-size:28px">' + sciPhaseName(n.phase) + '</div><div class="muted tnum">' + lit + "% lit · rises " + d(n.moonrise) + " · sets " + d(n.moonset) + "</div></div></div>" +
      '<dl class="kv"><dt>SUNSET</dt><dd class="tnum">' + d(n.sunset) + "</dd><dt>DARK SKY</dt><dd class=\"tnum\">" + (n.dark ? d(n.dark) + " to " + d(n.dawn) : "Never fully dark tonight") + "</dd>" +
      "<dt>PLANETS</dt><dd>" + (n.planets.length ? n.planets.map(function (p) { return "<b>" + p.name + "</b> " + (p.eve != null ? p.eve + "° up in the " + sciCompass(p.eveAz) + " after dark" : "before dawn in the " + sciCompass(p.dawnAz)); }).join(" · ") : "None well placed tonight") + "</dd>" +
      "<dt>MOON</dt><dd>Full " + day(n.full) + " · new " + day(n.newm) + "</dd>" +
      "<dt>METEORS</dt><dd>" + esc(m.name) + ", peak " + day(m.d.getTime()) + "</dd>" +
      (n.lunar ? "<dt>LUNAR ECLIPSE</dt><dd>" + esc(n.lunar.kind) + ", " + day(n.lunar.at) + " " + d(n.lunar.at) + (n.lunar.up ? "" : " (Moon below the horizon here)") + "</dd>" : "") +
      (n.solar ? "<dt>SOLAR ECLIPSE</dt><dd>" + esc(n.solar.kind) + ", " + day(n.solar.at) + ", Sun " + n.solar.alt + "° high</dd>" : "") + "</dl></div>" +
      '<div><h3 class="sci-h">CLOSEST ASTEROIDS · THIS WEEK</h3>' + (neo.length ? '<div class="sci-rows">' + neo.map(function (o) { return '<div class="sci-row" style="--c: var(--' + (o.ld <= 1 ? "warn" : "work") + ')"><i></i><span><b>' + esc(o.name) + "</b><small>About " + o.m + " m across" + (o.haz ? " · on NASA's watch list" : "") + '</small></span><span class="r tnum">' + o.ld + " LD<small>" + day(o.at) + "</small></span></div>"; }).join("") + "</div>" : sciErr("neo") || sciWait("neo")) +
      '<div class="sci-src">LD: lunar distances (1 LD is the Moon\'s distance, 384,400 km). Sun, Moon, planets and eclipses: Astronomy Engine on this iPad; asteroids: NASA NeoWs.</div></div></div>');
  }

  /* NATURE */
  function sciNatureHtml() {
    var f = sciV("feeds") || {}, birds = f.birds || [], inat = sciV("inat");
    return sciSec("ok", "NATURE", "REPORTED NEARBY · 25 KM · THIS WEEK", '<div class="sci-two"><div><h3 class="sci-h">NOTABLE BIRDS</h3>' +
      (f.ebird ? (birds.length ? '<div class="sci-rows">' + birds.slice(0, 10).map(function (b) { return '<div class="sci-row" style="--c: var(--ok)"><i></i><span><b>' + esc(b.name) + "</b><small>" + esc(b.loc || "") + (b.count ? " · " + b.count : "") + '</small></span><span class="r">' + b.km + " km " + sciCompass(b.dir) + "</span></div>"; }).join("") + "</div>" : '<div class="empty">No notable birds reported nearby this week.</div>')
        : '<div class="stubbox"><span class="pill">OPTIONAL</span><span>Notable birds come from eBird with a free key: request one at ebird.org/api/keygen, then add <b>EBIRD_API_KEY</b> to the Google bridge\'s Script Properties.</span></div>') +
      '</div><div><h3 class="sci-h">OTHER SIGHTINGS</h3>' + (inat ? (inat.length ? '<div class="sci-rows">' + inat.slice(0, 10).map(function (o) { return '<div class="sci-row" style="--c: var(--chrome-b)"><i></i><span><b>' + esc(o.name) + "</b><small>" + esc([o.group, o.place].filter(Boolean).join(" · ")) + '</small></span><span class="r">' + (o.day ? shortDay(o.day) : "") + "</span></div>"; }).join("") + "</div>" : '<div class="empty">Nothing confirmed nearby this week.</div>') : sciErr("inat") || sciWait("inat")) +
      '<div class="sci-src">iNaturalist research-grade observations. Later, a BirdNET-Pi adds the birds singing in your own yard.</div></div></div>');
  }

  /* EVENT LOG: the camera's timeline */
  function sciLogHtml() {
    var list = sc.log.filter(function (e) { return sc.evf === "all" || e.dept === sc.tab; }).slice(0, 40), pend = sc.q.add.length + Object.keys(sc.q.star).length;
    return sciSec("chrome-c", "EVENT LOG", "LAST 30 DAYS ON THIS IPAD" + (canSciLog() ? " · EVERY ONE IN NOTION" : ""), '<div class="btnrow sci-evf"><button type="button" class="chip sm" data-scievf="all" aria-pressed="' + (sc.evf === "all") + '">ALL DEPARTMENTS</button>' +
      '<button type="button" class="chip sm" data-scievf="one" aria-pressed="' + (sc.evf !== "all") + '" style="--c: var(--' + SCI_DEPTS[sc.tab][1] + ')">' + SCI_DEPTS[sc.tab][0] + " ONLY</button></div>" +
      '<div class="sci-log">' + (list.length ? list.map(function (e) {
        var d = new Date(e.at);
        return '<div class="sci-ev" style="--c: var(--' + SCI_DEPTS[e.dept][1] + ')"><span class="tm tnum">' + (sameDay(d, new Date()) ? hm(d) : p2(d.getDate()) + " " + MON[d.getMonth()]) + "</span><i></i><span><b>" + esc(e.title) + "</b><small>" + esc(e.detail || "") + "</small></span>" +
          '<button type="button" class="sci-star" data-scistar="' + esc(e.key) + '" aria-pressed="' + !!e.starred + '" aria-label="' + (e.starred ? "Unstar" : "Star") + ' this event">' + (e.starred ? "★" : "☆") + "</button></div>";
      }).join("") : '<div class="empty">Nothing of interest logged yet. Military, emergency or low aircraft, bright station passes, storms, nearby quakes, alerts, moons, meteor peaks and close asteroids land here.</div>') + "</div>" +
      (canSciLog() ? '<div class="sci-src">' + (pend ? pend + " waiting to reach Notion" + (sc.qErr ? ": " + esc(sc.qErr) : "") + ". " : "") + "☆ marks an event of interest; ASTROMETRICS shows starred ones on its key-date line.</div>" : '<div class="sci-src">Kept on this iPad only: the Science Log in Notion needs the Notion key on the bridge.</div>'));
  }
  function scienceClick(b) {
    if (state.screen !== "science") return false;
    var d = b.dataset;
    if (d.scitab) { sc.tab = d.scitab; render(true); return true; }
    if (d.sciac) { sc.sel = sc.sel === d.sciac ? null : d.sciac; sciPaintSky(); return true; }
    if (d.scievf) { sc.evf = d.scievf; render(true); return true; }
    if (d.scistar) { sciStar(d.scistar); return true; }
    return false;
  }
  function sciActs(b) {
    if (lmClick(b)) return true;
    if (b.dataset.act === "science") { go("science"); return true; }
    if (b.dataset.act === "sciline") { if (lsGet(LS_SCILINEOFF)) lsDel(LS_SCILINEOFF); else lsSet(LS_SCILINEOFF, true); render(true); return true; }
    return false;
  }

  /* ---- the Bridge's line and the Morning Briefing: only what's worth knowing today ---- */
  function sciDaily() {
    if (!state.conn || !canScience() || !sciPlace() || (lsGet(LS_SCILINEOFF) && lsGet(LS_BRIEFOFF))) return;
    sciLoad(false);
  }
  function sciHeadline() {
    var loc = sciPlace(); if (!loc) return null;
    var p = sciTonight(); if (p) return { d: "sky", t: p.name + " visible tonight " + hm(new Date(p.rise)), s: p.max + "° high, " + sciCompass(p.riseAz) + " to " + sciCompass(p.setAz) };
    var tn = sciKpTonight(); if (tn != null && tn >= sciAuroraKp(loc.lat)) return { d: "space", t: "Aurora possible tonight", s: "Kp " + tn + " forecast; look north after dark" };
    var q = (sciV("quakes") || []).filter(function (x) { return x.km <= 300 && x.mag >= 4 && Date.now() - x.at < 864e5; })[0];
    if (q) return { d: "earth", t: "M " + q.mag + " earthquake " + q.km + " km " + sciCompass(q.dir), s: hm(new Date(q.at)) + " · " + q.place };
    var m = sciMeteor(new Date()); if (sameDay(m.d, new Date())) return { d: "night", t: m.name + " meteor shower peaks tonight", s: "Best after midnight, away from lights" };
    return null;
  }

  function sciBrief() {
    if (!canScience() || !sciPlace()) return "";
    var out = [], p = sciTonight(), loc = sciPlace(), tn = sciKpTonight(), q = (sciV("quakes") || []).filter(function (x) { return x.km <= 300 && x.mag >= 3.5 && Date.now() - x.at < 864e5; })[0], m = sciMeteor(new Date());
    if (p) out.push(p.name + " visible tonight " + hm(new Date(p.rise)) + " to " + hm(new Date(p.set)) + ", " + p.max + " degrees high, from the " + sciCompass(p.riseAz) + " to the " + sciCompass(p.setAz));
    if (tn != null && tn >= sciAuroraKp(loc.lat)) out.push("aurora possible tonight (Kp " + tn + " forecast)");
    if (q) out.push("M" + q.mag + " earthquake " + q.km + " km " + sciCompass(q.dir) + " at " + hm(new Date(q.at)));
    if (sameDay(m.d, new Date())) out.push(m.name + " meteor shower peaks tonight");
    return out.length ? "SKY: " + out.join("; ") + "." : "";
  }
  function scienceSection() {
    if (!state.conn) return "";
    var html = '<section id="sec-science">' + phead("SCIENCE", canScience() ? (sciPlace() ? "FREE PUBLIC FEEDS" : "NEEDS A LOCATION") : "SETUP", "personal");
    if (!canScience()) return html + stubBox("SCIENCE needs the Google bridge updated.") + "</section>";
    var off = !!lsGet(LS_SCILINEOFF), pend = sc.q.add.length + Object.keys(sc.q.star).length, f = sciV("feeds") || {};
    html += '<div class="calrow"><span class="st" style="--c: var(--personal)"></span><span><b>Bridge line</b><small>' + (off ? "Off." : "One line under Condition on days with something worth knowing (a bright ISS pass tonight, an aurora chance, a nearby quake). Never a Condition item.") + '</small></span><button type="button" class="chip sm" data-act="sciline">' + (off ? "TURN ON" : "TURN OFF") + "</button></div>";
    html += '<div class="calrow"><span class="st" style="--c: var(--chrome-c)"></span><span><b>Science Log</b><small>' + (canSciLog() ? sc.log.length + " events on this iPad (30 days)" + (pend ? "; " + pend + " waiting to reach Notion" : "; all in Notion") + "." : "Needs the Notion key on the bridge.") + "</small></span><span></span></div>";
    var lmn = lmAll().filter(function (x) { return !x.hidden; }).length, lmh = lmAll().length - lmn;
    html += '<div class="calrow"><span class="st" style="--c: var(--dim)"></span><span><b>Landmarks on the scope</b><small>' + (lmAll().length ? lmn + " shown" + (lmh ? ", " + lmh + " hidden" : "") + "." : "Suggested from OpenStreetMap the first time SKY TRAFFIC opens.") + (lmOn() ? "" : " Off on the scope.") + " Kept only on this iPad.</small></span>" + (slm.edit ? "<span></span>" : '<button type="button" class="chip sm" data-scilmact="edit">EDIT</button>') + "</div>" + (slm.edit ? lmEditor() : "");
    html += '<div class="calrow"><span class="st" style="--c: var(--ok)"></span><span><b>eBird</b><small>' + (f.ebird ? "Key set: notable birds on." : "Optional: add EBIRD_API_KEY to the Google bridge's Script Properties for notable birds (free key at ebird.org/api/keygen).") + "</small></span><span></span></div>";
    return html + '<small class="muted">Your location goes out rounded to about 1 km, as for the weather. Feeds refresh only while SCIENCE is open, plus a light, slow read for this line and the Morning Briefing.</small></section>';
  }

