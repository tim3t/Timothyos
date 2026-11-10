  /* ---------- ARBORETUM (2.71, D67): the garden from above ----------
     Timothy's design (2026-11-08 mockups, D SKYGARDEN): the house as a droplet, Zones 1 to 3 as ripples around it, the
     Pond (its own zone, between Zones 1 and 2) and the Meadow out to the apiary. Each zone's sides (the pond's depth
     bands, the meadow's stretches) hold any number of beds, pots and plots in the order they really sit; each holds
     plantings and jobs through the year, and QUICK GLANCE gathers the jobs by season. Starts empty (his choice).
     One key, tos.arb.v1 {name, items[{id, zone, side, name, type, plants[], jobs[{id, s, t, n}]}], done{jobId: "AUTUMN-2026"}},
     on the iPad, in PROFILE SYNC (row "arb") and in backups. The garden's name is his to type (never in this repo). */
  var LS_ARB = "tos.arb.v1";
  var arb = (function () {
    var ZONES = [
      { id: "z1", name: "ZONE 1", short: "Zone 1", sub: "NEAREST THE HOUSE", kind: "ring", inner: "HOME" },
      { id: "z2", name: "ZONE 2", short: "Zone 2", sub: "THE MIDDLE RIPPLE", kind: "ring", inner: "ZONE 1 · HOME" },
      { id: "z3", name: "ZONE 3", short: "Zone 3", sub: "THE OUTER RIPPLE", kind: "ring", inner: "ZONES 1 AND 2 · HOME" },
      { id: "pond", name: "THE POND", short: "Pond", sub: "WATER GARDEN", kind: "pond" },
      { id: "meadow", name: "THE MEADOW", short: "Meadow", sub: "OUT TO THE APIARY", kind: "meadow" }
    ];
    var SIDES = {
      ring: [["BACK", "BACK · TOWARD THE MEADOW"], ["LEFT", "LEFT"], ["RIGHT", "RIGHT"], ["FRONT", "FRONT"]],
      pond: [["BANK", "BANK · GRASSES AND BOG"], ["MARGIN", "MARGIN · SHALLOW EDGE"], ["SHELF", "SHELF · PLANTING LEDGE"], ["DEEP", "DEEP WATER"]],
      meadow: [["FAR", "FAR END · TOWARD THE APIARY"], ["MIDDLE", "MIDDLE"], ["NEAR", "NEAR THE HOUSE"]]
    };
    var SIDE_WORD = { ring: ["side", "SIDE"], pond: ["depth band", "DEPTH"], meadow: ["stretch", "PART"] };
    var KINDS = {   /* label, default name */
      RAISED: ["RAISED BED", "Raised bed"], "IN-GROUND": ["IN-GROUND", "Plot"], BORDER: ["BORDER", "Border"], POTS: ["POT", "Pot"],
      TREES: ["TREE", "Tree"], COMPOST: ["COMPOST", "Compost"], WATER: ["DEEP WATER", "Deep water"], MARGINAL: ["MARGINAL", "Marginals"],
      GRASSES: ["GRASSES", "Grasses"], MEADOW: ["MEADOW", "Meadow patch"]
    };
    var ZKINDS = { ring: ["RAISED", "IN-GROUND", "BORDER", "POTS", "TREES", "COMPOST"], pond: ["WATER", "MARGINAL", "GRASSES", "POTS"], meadow: ["MEADOW", "GRASSES", "TREES"] };
    var SEAS = ["WINTER", "SPRING", "SUMMER", "AUTUMN"];
    /* The map, drawn in a 600 × 630 box and placed in percentages so it scales with the screen. Glyphs: where each
       side's beds and pots show on the ripples (x, y, w, h, 1 = runs top to bottom). */
    var GLYPH = {
      z1: { BACK: [214, 380, 172, 26], LEFT: [188, 414, 48, 90, 1], RIGHT: [364, 414, 48, 90, 1], FRONT: [272, 508, 120, 26] },
      z2: { BACK: [196, 338, 234, 26], LEFT: [112, 412, 62, 124, 1], RIGHT: [426, 378, 62, 160, 1], FRONT: [236, 550, 200, 26] },
      z3: { BACK: [110, 298, 380, 24], LEFT: [40, 340, 62, 240, 1], RIGHT: [498, 340, 62, 240, 1], FRONT: [180, 590, 300, 24] }
    };
    /* Typical jobs, offered (never added by themselves) when a bed's name or plantings mention the plant. */
    var TIPS = [
      [/\brose/, [["WINTER", "Prune the roses", "Late winter, as the buds swell"], ["SPRING", "Feed the roses", "As the leaves open"], ["SUMMER", "Deadhead the roses", ""]]],
      [/tomato/, [["SPRING", "Plant out the tomatoes", "After the last frost"], ["AUTUMN", "Pull the tomato vines", "Before a hard frost"]]],
      [/garlic/, [["AUTUMN", "Plant the garlic", "Before the ground freezes"], ["SUMMER", "Lift the garlic", "When the lower leaves brown"]]],
      [/dahlia/, [["AUTUMN", "Lift the dahlia tubers", "Once frost blackens the leaves"], ["SPRING", "Plant the dahlias out", "After the last frost"]]],
      [/hosta/, [["SPRING", "Divide the hostas", "As the shoots appear"]]],
      [/water lil/, [["SPRING", "Divide the water lilies", "Every few years, as they crowd"], ["AUTUMN", "Cut back the lily leaves", "As they yellow"]]],
      [/blueberr/, [["AUTUMN", "Mulch the blueberries", "Pine needles or bark"], ["WINTER", "Prune the blueberries", "While dormant"]]],
      [/\b(apple|pear|plum|peach|cherry|fruit)/, [["WINTER", "Prune the fruit trees", "While dormant"], ["SPRING", "Feed the fruit trees", ""]]],
      [/\bfig/, [["SPRING", "Prune the fig", "Once the hard frosts are past"], ["SUMMER", "Pick the figs", ""]]],
      [/lavender/, [["SUMMER", "Trim the lavender", "After flowering"]]],
      [/basil|rosemary|thyme|sage|oregano|\bherb/, [["AUTUMN", "Bring tender herbs in", "Before frost"]]],
      [/strawberr/, [["SUMMER", "Peg down the runners", ""], ["AUTUMN", "Mulch the strawberries", "With straw, once the ground cools"]]],
      [/grass|sedge/, [["SPRING", "Cut the grasses back", "Before new growth shows"]]],
      [/hydrangea/, [["SPRING", "Prune the hydrangea", "Check which kind it is first"]]],
      [/lettuce|kale|spinach|chard|greens/, [["SPRING", "Sow greens", "As soon as the soil can be worked"], ["AUTUMN", "Sow a fall crop of greens", "Early autumn"]]],
      [/asparagus/, [["SPRING", "Harvest the asparagus", "About six weeks, then let it fern"], ["AUTUMN", "Cut down the asparagus ferns", "Once they yellow"]]],
      [/pepper/, [["SPRING", "Plant out the peppers", "When nights stay warm"]]]
    ];
    var KTIPS = {
      RAISED: [["SPRING", "Top up the bed with compost", ""], ["AUTUMN", "Clear the bed and mulch it", ""]],
      "IN-GROUND": [["AUTUMN", "Clear the plot and mulch it", ""]],
      POTS: [["AUTUMN", "Bring the pot in on frost nights", ""]],
      COMPOST: [["AUTUMN", "Turn the compost", ""], ["SPRING", "Spread the finished compost", ""]],
      WATER: [["AUTUMN", "Net the pond against leaves", "Until the trees are bare"], ["WINTER", "Keep a hole in the ice", "Float a ball; never break the ice"], ["SUMMER", "Top up the pond", "Rainwater if you can"]],
      MARGINAL: [["AUTUMN", "Cut back the marginals", "Just above the waterline"]],
      MEADOW: [["AUTUMN", "Last mow of the paths", "Leave the meadow standing for winter"], ["SPRING", "Overseed bare patches", ""]],
      TREES: [["WINTER", "Prune while dormant", ""]],
      BORDER: [["SPRING", "Cut back last year's stems", ""]]
    };
    var DROP = '<svg width="24" height="32" viewBox="0 0 26 34" aria-hidden="true" focusable="false"><path d="M13 2 C13 2 3 15 3 22 a10 10 0 0 0 20 0 C23 15 13 2 13 2 Z" fill="none" stroke="var(--personal)" stroke-width="2.5"/></svg>';
    var X = { view: "map", zone: null, sel: null, ak: null, js: null, gs: null, gz: "all", arm: 0 };

    function zone(id) { return ZONES.filter(function (z) { return z.id === id; })[0] || null; }
    function okItem(i) { return i && typeof i.id === "string" && !!zone(i.zone) && !!KINDS[i.type] && typeof i.side === "string"; }
    function data() {
      var v = lsGet(LS_ARB); if (!v || typeof v !== "object") v = {};
      return { name: typeof v.name === "string" ? v.name : "",
        items: (Array.isArray(v.items) ? v.items : []).filter(okItem).map(function (i) {
          return { id: i.id, zone: i.zone, side: i.side, name: typeof i.name === "string" ? i.name : "", type: i.type,
            plants: (Array.isArray(i.plants) ? i.plants : []).filter(function (p) { return typeof p === "string"; }),
            jobs: (Array.isArray(i.jobs) ? i.jobs : []).filter(function (j) { return j && typeof j.id === "string" && SEAS.indexOf(j.s) > -1 && typeof j.t === "string"; }) };
        }),
        done: v.done && typeof v.done === "object" && !Array.isArray(v.done) ? v.done : {} };
    }
    function save(D) { lsSet(LS_ARB, D); }
    function item(D, id) { return D.items.filter(function (i) { return i.id === id; })[0] || null; }
    function newId(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }
    function itName(i) { return i.name.trim() || KINDS[i.type][1]; }
    function gname(D) { return (D || data()).name.trim() || "the garden"; }
    function seasonOf(d) { var m = d.getMonth(); return m === 11 || m < 2 ? "WINTER" : m < 5 ? "SPRING" : m < 8 ? "SUMMER" : "AUTUMN"; }
    function phase(d) { return ["EARLY", "MID", "LATE"][(d.getMonth() + 1) % 3]; }
    /* A season's ticks belong to its current or next turn: AUTUMN-2026, WINTER-2027 (a winter is named for its January). */
    function cycle(s, d) {
      d = d || new Date();
      var t = new Date(d.getFullYear(), d.getMonth(), 1);
      for (var i = 0; i < 12 && seasonOf(t) !== s; i++) t.setMonth(t.getMonth() + 1);
      return s + "-" + (t.getMonth() === 11 ? t.getFullYear() + 1 : t.getFullYear());
    }
    function isDone(D, j) { return D.done[j.id] === cycle(j.s); }
    function zItems(D, zid) { return D.items.filter(function (i) { return i.zone === zid; }); }
    function jobsIn(D, s, zid) {   /* [{it, j, done}] for a season, open first, then by zone and the order the beds sit */
      var out = [];
      D.items.forEach(function (it, n) { if (zid && zid !== "all" && it.zone !== zid) return; it.jobs.forEach(function (j) { if (j.s === s) out.push({ it: it, j: j, done: isDone(D, j), o: ZONES.indexOf(zone(it.zone)) * 10000 + n }); }); });
      return out.sort(function (a, b) { return (a.done - b.done) || (a.o - b.o); });
    }
    function openN(D, s, zid) { return jobsIn(D, s, zid).filter(function (r) { return !r.done; }).length; }
    function P(x, y, w, h, W, H) {
      W = W || 600; H = H || 630;
      var r = function (v) { return Math.round(v * 10000) / 100 + "%"; };
      return "left: " + r(x / W) + "; top: " + r(y / H) + "; width: " + r(w / W) + "; height: " + r(h / H);
    }
    function kc(k) { return "k-" + k.toLowerCase().replace("-", ""); }
    function pl(n, one, many) { return n + " " + (n === 1 ? one : many); }
    function countLine(D, zid) {
      var l = zItems(D, zid), pots = l.filter(function (i) { return i.type === "POTS"; }).length, nb = l.length - pots, np = l.reduce(function (a, i) { return a + i.plants.length; }, 0);
      if (!l.length) return "Nothing added yet";
      var z = zone(zid), noun = z.kind === "pond" ? ["area", "areas"] : z.kind === "meadow" ? ["patch", "patches"] : ["bed", "beds"];
      return (nb ? pl(nb, noun[0], noun[1]) + " · " : "") + (pots ? pl(pots, "pot", "pots") + " · " : "") + pl(np, "planting", "plantings");
    }
    function addKind(z) { var ks = ZKINDS[z.kind]; return X.ak && ks.indexOf(X.ak) > -1 ? X.ak : ks[0]; }
    function tips(it) {
      var txt = (it.name + " " + it.plants.join(" ")).toLowerCase(), all = [], have = {};
      it.jobs.forEach(function (j) { have[j.s + "|" + j.t.toLowerCase()] = 1; });
      TIPS.forEach(function (t) { if (t[0].test(txt)) all = all.concat(t[1]); });
      all = all.concat(KTIPS[it.type] || []);
      return all.filter(function (t) { var k = t[0] + "|" + t[1].toLowerCase(); if (have[k]) return false; have[k] = 1; return true; }).slice(0, 6);
    }

    /* ----- writes ----- */
    function upd(id, fn) { var D = data(), it = item(D, id); if (!it) return null; fn(it, D); save(D); return it; }
    function addItem(side) {
      var z = zone(X.zone); if (!z) return;
      var D = data(), k = addKind(z), base = KINDS[k][1], re = new RegExp("^" + base + " (\\d+)$"), n = 0;
      if (D.items.length >= 400) { toast("That's the most ARBORETUM keeps (400)."); return; }
      D.items.forEach(function (i) { var m = re.exec(i.name.trim()); if (m) n = Math.max(n, +m[1]); });
      var it = { id: newId("a"), zone: z.id, side: side, name: base + " " + (n + 1), type: k, plants: [], jobs: [] };
      D.items.push(it); save(D); X.sel = it.id; X.arm = 0; X.js = null;
    }
    function moveSide(side) {
      var D = data(), it = item(D, X.sel); if (!it || it.side === side) return;
      D.items = D.items.filter(function (i) { return i.id !== it.id; }); it.side = side; D.items.push(it); save(D);
    }
    function step(dir) {
      var D = data(), it = item(D, X.sel); if (!it) return;
      var same = D.items.filter(function (i) { return i.zone === it.zone && i.side === it.side; }), o = same[same.indexOf(it) + dir];
      if (!o) return;
      var a = D.items.indexOf(it), b = D.items.indexOf(o); D.items[a] = o; D.items[b] = it; save(D);
    }
    function addPlant() {
      var f = $("arbPlant"), v = f ? f.value.trim().slice(0, 60) : "";
      if (!v) { toast("Type a plant first"); return; }
      upd(X.sel, function (it) { if (it.plants.length < 40) it.plants.push(v); });
      f.value = "";
    }
    function addJob(t, n, s) {
      var f = $("arbJob"), typed = t === undefined;
      t = typed ? (f ? f.value.trim().slice(0, 80) : "") : t;
      if (!t) { toast("Type a job first"); return; }
      upd(X.sel, function (it) { if (it.jobs.length < 30) it.jobs.push({ id: newId("j"), s: s || X.js || seasonOf(new Date()), t: t, n: n || "" }); });
      if (typed && f) f.value = "";
    }
    function removeItem() {
      var D = data(), it = item(D, X.sel); if (!it) return;
      it.jobs.forEach(function (j) { delete D.done[j.id]; });
      D.items = D.items.filter(function (i) { return i.id !== it.id; }); save(D);
      X.sel = null; X.arm = 0; toast(itName(it) + " removed");
    }

    /* ----- drawing ----- */
    function head() {
      var D = data(), g = gname(D).toUpperCase(), now = new Date();
      if (X.view === "zone" && zone(X.zone)) { var z = zone(X.zone); return { e: g + " · " + z.sub + " · " + countLine(D, z.id).toUpperCase(), t: z.name }; }
      if (X.view === "glance") return { e: g + " · QUICK GLANCE · " + (X.gs || seasonOf(now)), t: "ARBORETUM" };
      return { e: g + " · " + phase(now) + " " + seasonOf(now), t: "ARBORETUM" };
    }
    function chips(list, attr, isOn, c) {
      return list.map(function (x) { return '<button type="button" class="chip sm" style="--c: var(--' + (c || "personal") + ')" data-' + attr + '="' + x[0] + '" aria-pressed="' + isOn(x[0]) + '">' + x[1] + "</button>"; }).join("");
    }
    function mapHtml(D) {
      var now = new Date(), cs = seasonOf(now), h = '<div class="arb-cols"><div class="arb-map" role="group" aria-label="Map of ' + esc(gname(D)) + '">';
      var mp = zItems(D, "meadow").reduce(function (a, i) { return a + i.plants.length; }, 0), pp = zItems(D, "pond").reduce(function (a, i) { return a + i.plants.length; }, 0);
      h += '<button type="button" class="arb-mz arb-meadow" data-arbz="meadow" style="' + P(60, 0, 480, 250) + '" aria-label="The Meadow: ' + esc(countLine(D, "meadow")) + '"><span>THE MEADOW</span><small>' + (mp ? pl(mp, "planting", "plantings") : zItems(D, "meadow").length ? countLine(D, "meadow") : "") + "</small></button>";
      h += '<span class="arb-shed" aria-hidden="true" style="' + P(0, 262, 58, 28) + '">SHED</span>';
      [["z3", 30, 290, 540, 335], ["z2", 105, 330, 390, 255], ["z1", 180, 370, 240, 175]].forEach(function (r) {
        h += '<button type="button" class="arb-mz arb-ring ' + r[0] + '" data-arbz="' + r[0] + '" style="' + P(r[1], r[2], r[3], r[4]) + '" aria-label="' + zone(r[0]).name.replace("ZONE", "Zone") + ": " + esc(countLine(D, r[0])) + '"></button>';
      });
      ["z1", "z2", "z3"].forEach(function (zid) {
        Object.keys(GLYPH[zid]).forEach(function (side) {
          var g = GLYPH[zid][side], its = D.items.filter(function (i) { return i.zone === zid && i.side === side; });
          if (its.length) h += '<span class="arb-gl' + (g[4] ? " v" : "") + '" aria-hidden="true" style="' + P(g[0], g[1], g[2], g[3]) + '">' + its.map(function (i) { return '<span class="arb-g ' + kc(i.type) + '"></span>'; }).join("") + "</span>";
        });
      });
      [["ZONE 1", 218, 512], ["ZONE 2", 178, 554], ["ZONE 3", 120, 594]].forEach(function (t) { h += '<span class="arb-tag" aria-hidden="true" style="left: ' + Math.round(t[1] / 6 * 100) / 100 + "%; top: " + Math.round(t[2] / 6.3 * 100) / 100 + '%">' + t[0] + "</span>"; });
      h += '<button type="button" class="arb-mz arb-pond" data-arbz="pond" style="' + P(116, 344, 74, 58) + '" aria-label="The Pond: ' + esc(countLine(D, "pond")) + '">POND' + (pp ? "<small>" + pp + "</small>" : "") + "</button>";
      h += '<div class="arb-home" aria-hidden="true" style="' + P(240, 412, 120, 92) + '">' + DROP + "<span>HOME</span></div></div>";
      h += '<aside class="arb-side"><div class="arb-lbl">ZONES · TAP ONE, ON THE MAP OR HERE</div>' + ZONES.map(function (z) {
        var j = openN(D, cs, z.id);
        return '<button type="button" class="arb-zrow" data-arbz="' + z.id + '"><span class="arb-sw ' + z.id + '" aria-hidden="true"></span><span class="arb-zt"><b>' + z.name + " <span>" + z.sub + "</span></b><small>" + esc(countLine(D, z.id)) + "</small></span>" +
          (j ? '<span class="arb-jobs">' + j + " TO DO</span>" : "") + "</button>";
      }).join("");
      var open = jobsIn(D, cs).filter(function (r) { return !r.done; });
      h += '<button type="button" class="arb-seas" data-arbv="glance"><b>' + phase(now) + " " + cs + " · " + pl(open.length, "JOB", "JOBS") + " TO DO</b><span>" +
        (open.length ? esc(open.slice(0, 2).map(function (r) { return r.j.t + ", " + zone(r.it.zone).short; }).join(" · ")) + (open.length > 2 ? " · and more" : "") : D.items.length ? "Nothing left this " + cs.toLowerCase() + ". Every season is in QUICK GLANCE." : "Start with a zone: add its beds, what's planted, and their jobs through the year.") + "</span></button>";
      h += '<label class="arb-lbl arb-gname" for="arbGName">THE GARDEN\'S NAME<input id="arbGName" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Name it" value="' + esc(D.name) + '"></label>';
      return h + "</aside></div>";
    }
    function itemBtn(it, vert) {
      var lab = itName(it);
      if (it.type === "POTS") lab = lab.split(/\s+/)[0].slice(0, 5).toUpperCase();
      return '<button type="button" class="arb-it ' + kc(it.type) + (vert ? " v" : "") + '" data-arbit="' + esc(it.id) + '" aria-pressed="' + (it.id === X.sel) + '" aria-label="' + esc(itName(it) + ", " + KINDS[it.type][0].toLowerCase() + (it.plants.length ? ": " + it.plants.join(", ") : "")) + '">' + esc(lab) + "</button>";
    }
    function stripIn(z, sd, D, vert) {
      var its = D.items.filter(function (i) { return i.zone === z.id && i.side === sd[0]; }), k = addKind(z);
      return '<div class="arb-sh">' + sd[1] + " · " + its.length + '</div><div class="arb-flow">' + its.map(function (i) { return itemBtn(i, vert); }).join("") +
        '<button type="button" class="arb-add" data-arbadd="' + sd[0] + '" aria-label="Add a ' + KINDS[k][0].toLowerCase() + " to " + sd[1].toLowerCase() + '">+ ' + KINDS[k][0] + "</button></div>";
    }
    function zoneHtml(D) {
      var z = zone(X.zone), body;
      if (z.kind === "ring") body = '<div class="arb-zone ring ' + z.id + '">' + SIDES.ring.map(function (sd) {
        var v = sd[0] === "LEFT" || sd[0] === "RIGHT";
        return '<section class="arb-strip s-' + sd[0].toLowerCase() + '" aria-label="' + sd[1] + '">' + stripIn(z, sd, D, v) + "</section>";
      }).join("") + '<div class="arb-zhome" aria-hidden="true">' + DROP + "<span>" + z.inner + "</span></div></div>";
      else if (z.kind === "pond") {
        var inner = "";
        for (var i = SIDES.pond.length - 1; i >= 0; i--) inner = '<section class="arb-band b' + i + '" aria-label="' + SIDES.pond[i][1] + '">' + stripIn(z, SIDES.pond[i], D, false) + inner + "</section>";
        body = '<div class="arb-zone pond">' + inner + "</div>";
      }
      else body = '<div class="arb-zone meadow">' + SIDES.meadow.map(function (sd) { return '<section class="arb-strip" aria-label="' + sd[1] + '">' + stripIn(z, sd, D, false) + "</section>"; }).join("") + "</div>";
      var it = X.sel ? item(D, X.sel) : null;
      return '<div class="arb-cols">' + body + '<aside class="arb-side arb-ed" aria-label="' + (it ? "Change " + esc(itName(it)) : "Add to " + z.name.toLowerCase()) + '">' + (it ? editHtml(D, z, it) : addHtml(D, z)) + "</aside></div>";
    }
    function addHtml(D, z) {
      var help = z.kind === "pond" ? "The pond from above, in depth bands: grasses and bog on the bank, rushes at the shallow margin, marginals on the planting shelf, lilies and oxygenators in the deep."
        : z.kind === "meadow" ? "The Meadow in three stretches, from the house out to the apiary end."
        : "Each side of the house holds as many beds, pots and plots as you like, in the order they really sit. Left and right run top to bottom.";
      var n = zItems(D, z.id).length;
      return '<div class="arb-lbl c">' + z.name + " · " + z.sub + '</div><p class="arb-p">' + help + '</p><div class="arb-lbl">ADD WHAT</div><div class="btnrow" role="group" aria-label="Add what">' +
        chips(ZKINDS[z.kind].map(function (k) { return [k, KINDS[k][0]]; }), "arbak", function (k) { return k === addKind(z); }) + "</div>" +
        '<p class="arb-p muted">Then tap <b>+</b> on the ' + SIDE_WORD[z.kind][0] + " it goes in. Tap anything already there to change it, move it or say what's planted.</p>" +
        '<p class="arb-p">' + (n ? esc(countLine(D, z.id)) + "." : "Nothing here yet.") + "</p>";
    }
    function editHtml(D, z, it) {
      var same = D.items.filter(function (i) { return i.zone === z.id && i.side === it.side; }), pos = same.indexOf(it), sw = SIDE_WORD[z.kind][1];
      var h = '<div class="arb-lbl c">' + z.name + " · " + esc(it.side) + " · " + (pos + 1) + " OF " + same.length + "</div>";
      h += '<label class="arb-lbl" for="arbName">NAME</label><input id="arbName" class="arb-in" type="text" maxlength="60" autocomplete="off" value="' + esc(it.name) + '">';
      h += '<div class="arb-lbl">KIND</div><div class="btnrow" role="group" aria-label="Kind">' + chips(ZKINDS[z.kind].map(function (k) { return [k, KINDS[k][0]]; }), "arbkind", function (k) { return k === it.type; }) + "</div>";
      h += '<div class="arb-lbl">' + sw + '</div><div class="btnrow" role="group" aria-label="' + sw + '">' + chips(SIDES[z.kind].map(function (s) { return [s[0], s[0]]; }), "arbside", function (s) { return s === it.side; }, "chrome-b") + "</div>";
      h += '<div class="btnrow" role="group" aria-label="Order"><button type="button" class="chip sm" data-arbmove="-1"' + (pos > 0 ? "" : " disabled") + '>◂ EARLIER</button><button type="button" class="chip sm" data-arbmove="1"' + (pos < same.length - 1 ? "" : " disabled") + ">LATER ▸</button></div>";
      h += '<div class="arb-lbl c">PLANTED</div>' + (it.plants.length ? '<ul class="arb-pl">' + it.plants.map(function (p, i) { return "<li><span>" + esc(p) + '</span><button type="button" class="arb-x" data-arbpdel="' + i + '" aria-label="Remove ' + esc(p) + '">✕</button></li>'; }).join("") + "</ul>" : '<p class="arb-p muted">Nothing planted yet.</p>');
      h += '<div class="arb-addrow"><input id="arbPlant" type="text" maxlength="60" autocomplete="off" placeholder="Add a plant" aria-label="Add a plant"><button type="button" class="chip sm" data-arbpadd="1">ADD</button></div>';
      h += '<div class="arb-lbl o">THROUGH THE YEAR</div>' + (it.jobs.length ? '<ul class="arb-jl">' + SEAS.map(function (s) { return it.jobs.filter(function (j) { return j.s === s; }).map(function (j) {
        return '<li><span class="s">' + s + '</span><span class="t">' + esc(j.t) + (j.n ? "<small>" + esc(j.n) + "</small>" : "") + '</span><button type="button" class="arb-x" data-arbjdel="' + esc(j.id) + '" aria-label="Remove ' + esc(j.t) + '">✕</button></li>'; }).join(""); }).join("") + "</ul>" : '<p class="arb-p muted">No jobs yet.</p>');
      var js = X.js || seasonOf(new Date());
      h += '<div class="btnrow" role="group" aria-label="Season for a new job">' + chips(SEAS.map(function (s) { return [s, s]; }), "arbjs", function (s) { return s === js; }, "farm") + "</div>";
      h += '<div class="arb-addrow"><input id="arbJob" type="text" maxlength="80" autocomplete="off" placeholder="Add ' + (js === "AUTUMN" ? "an " : "a ") + js.toLowerCase() + ' job" aria-label="Add a job for ' + js.toLowerCase() + '"><button type="button" class="chip sm" data-arbjadd="1">ADD</button></div>';
      var tp = tips(it);
      if (tp.length) h += '<div class="arb-lbl">TYPICAL · TAP TO ADD</div><div class="arb-tips">' + tp.map(function (t, i) { return '<button type="button" class="arb-tip" data-arbsug="' + i + '"><b>+ ' + t[0] + "</b> " + esc(t[1]) + (t[2] ? "<small>" + esc(t[2]) + "</small>" : "") + "</button>"; }).join("") + "</div>";
      var armed = X.arm && Date.now() - X.arm < 4000;
      h += '<div class="btnrow arb-end"><button type="button" class="chip sm' + (armed ? " ap-armed" : "") + '" data-arbdel="1">' + (armed ? "TAP AGAIN TO REMOVE" : "REMOVE") + '</button><span class="arb-fill"></span><button type="button" class="chip sm" style="--c: var(--personal)" aria-pressed="true" data-arbdone="1">DONE</button></div>';
      return h;
    }
    function glanceHtml(D) {
      var now = new Date(), cur = seasonOf(now), gs = X.gs || cur, h = '<div class="arb-g2"><div class="arb-gside"><div class="arb-mini" role="group" aria-label="Show one zone">';
      var mz = function (zid, cls, box, lb) {
        var n = openN(D, gs, zid);
        return '<button type="button" class="arb-mz ' + cls + '" data-arbgz="' + zid + '" aria-pressed="' + (X.gz === zid) + '" aria-label="' + zone(zid).short + ": " + pl(n, "job", "jobs") + ' to do" style="' + P(box[0], box[1], box[2], box[3], 300, 330) + '">' + (lb ? '<span class="lb ' + lb + '">' : "") + (zid === "pond" ? "P · " : zid === "meadow" ? "MEADOW · " : zone(zid).short.replace("Zone ", "Z") + " · ") + n + (lb ? "</span>" : "") + "</button>";
      };
      h += mz("meadow", "arb-meadow", [30, 0, 240, 125]) + mz("z3", "arb-ring z3", [15, 145, 270, 180], "tr") + mz("z2", "arb-ring z2", [55, 172, 190, 128], "tr") + mz("z1", "arb-ring z1", [92, 200, 116, 80], "tr") + mz("pond", "arb-pond", [60, 180, 46, 30]);
      h += '<div class="arb-home" aria-hidden="true" style="' + P(123, 232, 54, 36, 300, 330) + '"></div></div>';
      h += '<button type="button" class="chip" style="--c: var(--chrome-d)" data-arbgz="all" aria-pressed="' + (X.gz === "all") + '">ALL ZONES</button><p class="arb-p muted">Tap a zone to see its jobs only. The numbers are what is still to do this ' + gs.toLowerCase() + ".</p></div>";
      h += '<div class="arb-gmain"><div class="btnrow" role="group" aria-label="Season">' + chips(SEAS.map(function (s) { return [s, s === cur ? s + " · NOW" : s]; }), "arbgs", function (s) { return s === gs; }, "chrome-d") + "</div>";
      var rows = jobsIn(D, gs, X.gz);
      if (!rows.length) h += '<div class="empty">No ' + gs.toLowerCase() + " jobs yet" + (X.gz !== "all" ? " in " + zone(X.gz).short : "") + ". On the MAP, open a zone, tap a bed and add its jobs under THROUGH THE YEAR (typical ones are offered).</div>";
      else h += '<div class="arb-cards">' + rows.map(function (r) {
        return '<button type="button" class="arb-card' + (r.done ? " done" : "") + '" data-arbtick="' + esc(r.j.id) + '" aria-pressed="' + r.done + '"><span class="r"><span class="arb-ztag ' + r.it.zone + '">' + zone(r.it.zone).short.toUpperCase() + '</span><span class="it">' + esc(itName(r.it)) + '</span><span class="arb-box" aria-hidden="true">' + (r.done ? "✓" : "") + "</span></span><b>" + esc(r.j.t) + "</b>" + (r.j.n ? "<small>" + esc(r.j.n) + "</small>" : "") + "</button>";
      }).join("") + "</div>";
      return h + "</div></div>";
    }
    function draw() {
      var D = data();
      if (X.view === "zone" && !zone(X.zone)) X.view = "map";
      if (X.sel && !item(D, X.sel)) X.sel = null;
      var h = '<div class="arb"><div class="arb-top"><div class="btnrow" role="group" aria-label="ARBORETUM view">' + [["map", "MAP"], ["glance", "QUICK GLANCE"]].map(function (t) {
        return '<button type="button" class="chip" style="--c: var(--chrome-d)" data-arbv="' + t[0] + '" aria-pressed="' + (X.view === t[0] || (t[0] === "map" && X.view === "zone")) + '">' + t[1] + "</button>";
      }).join("") + "</div>" + (X.view === "zone" ? '<button type="button" class="chip" data-arbv="map">◂ MAP</button>' : "") + "</div>";
      h += X.view === "zone" ? zoneHtml(D) : X.view === "glance" ? glanceHtml(D) : mapHtml(D);
      $("content").innerHTML = h + "</div>";
    }
    function show(view, zid) { X.view = view; X.zone = zid || null; X.sel = null; X.arm = 0; if (view === "glance") { X.gs = null; X.gz = "all"; } }
    function home() { show("map"); }
    function redraw(top) { render(!top); if (top) $("content").scrollTop = 0; }   /* the app's render(): header, status, then draw() */
    function click(b) {
      if (state.screen !== "arboretum") return false;
      var d = b.dataset, now = new Date();
      if (d.arbv) { show(d.arbv); redraw(true); return true; }
      if (d.arbz) { show("zone", d.arbz); X.ak = null; redraw(true); return true; }
      if (d.arbgz) { X.gz = X.gz === d.arbgz && d.arbgz !== "all" ? "all" : d.arbgz; redraw(); return true; }
      if (d.arbgs) { X.gs = d.arbgs; redraw(); return true; }
      if (d.arbtick) {
        var Dt = data(), jr = null;
        Dt.items.forEach(function (i) { i.jobs.forEach(function (j) { if (j.id === d.arbtick) jr = j; }); });
        if (jr) { if (isDone(Dt, jr)) delete Dt.done[jr.id]; else Dt.done[jr.id] = cycle(jr.s, now); save(Dt); }
        redraw(); return true;
      }
      if (d.arbit) { X.sel = X.sel === d.arbit ? null : d.arbit; X.arm = 0; X.js = null; redraw(); return true; }
      if (d.arbak) { X.ak = d.arbak; redraw(); return true; }
      if (d.arbadd) { addItem(d.arbadd); redraw(); return true; }
      if (d.arbdone) { X.sel = null; X.arm = 0; redraw(); return true; }
      if (!X.sel) return false;
      if (d.arbkind) upd(X.sel, function (it) { it.type = d.arbkind; });
      else if (d.arbside) moveSide(d.arbside);
      else if (d.arbmove) step(+d.arbmove);
      else if (d.arbpdel !== undefined) upd(X.sel, function (it) { it.plants.splice(+d.arbpdel, 1); });
      else if (d.arbpadd) addPlant();
      else if (d.arbjs) X.js = d.arbjs;
      else if (d.arbjadd) addJob();
      else if (d.arbjdel) upd(X.sel, function (it, D) { it.jobs = it.jobs.filter(function (j) { return j.id !== d.arbjdel; }); delete D.done[d.arbjdel]; });
      else if (d.arbsug !== undefined) { var cur = item(data(), X.sel), t = cur && tips(cur)[+d.arbsug]; if (t) { addJob(t[1], t[2], t[0]); toast(t[0].charAt(0) + t[0].slice(1).toLowerCase() + ": " + t[1]); } }
      else if (d.arbdel) {
        if (X.arm && Date.now() - X.arm < 4000) removeItem();
        else { X.arm = Date.now(); setTimeout(function () { if (state.screen === "arboretum" && X.arm) render(true); }, 4100); }
      }
      else return false;
      redraw(); return true;
    }
    document.addEventListener("input", function (e) {
      var t = e.target;
      if (state.screen !== "arboretum" || !t) return;
      if (t.id === "arbName" && X.sel) upd(X.sel, function (it) { it.name = t.value.slice(0, 60); });
      else if (t.id === "arbGName") { var D = data(); D.name = t.value.slice(0, 40); save(D); }
    });
    document.addEventListener("keydown", function (e) {
      var t = e.target;
      if (state.screen !== "arboretum" || e.key !== "Enter" || !t) return;
      if (t.id === "arbPlant") { e.preventDefault(); addPlant(); redraw(); }
      else if (t.id === "arbJob") { e.preventDefault(); addJob(); redraw(); }
      else if (t.id === "arbName" || t.id === "arbGName") { e.preventDefault(); t.blur(); render(true); }
    });
    return { render: draw, head: head, click: click, show: show, home: home, data: data, cycle: cycle, seasonOf: seasonOf, tips: tips, openN: openN };
  })();
  function renderArboretum() { arb.render(); }
  function arbGo(view, zid) { if (state.screen !== "arboretum") go("arboretum"); arb.show(view, zid); render(false); $("content").scrollTop = 0; }   /* COMPUTER: go() alone would send a second tap to the map */
  function mlCookHtml() {
    var C = ml.cook, m = mlMeal(C.id), D = C.data, big = !!mlView.big;
    var lines = D && D.lines.length ? D.lines : m.ing.map(function (x) { return x.n; }), steps = D ? D.steps : [];
    var html = '<section class="ml-cook' + (big ? " big" : "") + '" aria-label="Cook ' + esc(m.name) + '"><div class="ml-cookhead">' + (m.photo || m.thumb ? '<img src="' + esc(m.photo || m.thumb) + '" alt="">' : "") + "<span><small>COOK · " + esc(m.kind.toUpperCase()) + "</small><b>" + esc(m.name) + "</b>" +
      (D && D.other.length ? "<small>" + esc(D.other.filter(function (x) { return !/^From /.test(x); }).join(" · ")) + "</small>" : "") + '</span><span class="btnrow"><button type="button" class="chip sm" data-ml="cookbig" aria-pressed="' + big + '">' + (big ? "A−" : "A+") + "</button>" +
      ((D && D.recipe) || m.recipe ? '<a class="chip sm" href="' + esc((D && D.recipe) || m.recipe) + '" target="_blank" rel="noopener">THE RECIPE PAGE</a>' : "") + '<button type="button" class="chip" data-ml="cookx">DONE</button></span></div>';
    if (C.err && !D) html += '<div class="err">' + esc(C.err) + "</div>";
    else if (!D) html += '<div class="empty">Reading the recipe…</div>';
    html += '<div class="ml-cookbody"><div><h3>INGREDIENTS</h3>' + lines.map(function (l, i) { return '<button type="button" class="ml-tick' + (C.got[i] ? " got" : "") + '" data-mltick="' + i + '" aria-pressed="' + !!C.got[i] + '"><i aria-hidden="true">' + (C.got[i] ? "✓" : "") + "</i><span>" + esc(l) + "</span></button>"; }).join("") + "</div>";
    html += "<div><h3>STEPS" + (steps.length ? " · " + (C.step + 1) + " OF " + steps.length : "") + "</h3>" + (steps.length ? steps.map(function (x, i) { return '<button type="button" class="ml-step' + (i === C.step ? " now" : i < C.step ? " done" : "") + '" data-mlstep="' + i + '" aria-current="' + (i === C.step) + '"><b>' + (i + 1) + "</b><span>" + esc(x) + "</span></button>"; }).join("") +
      '<div class="btnrow ml-stepnav"><button type="button" class="btn ghost" data-ml="cookprev"' + (C.step ? "" : " disabled") + '>◀ STEP</button><button type="button" class="btn capture" data-ml="cooknext"' + (C.step < steps.length - 1 ? "" : " disabled") + ">NEXT STEP ▶</button></div>"
      : '<p class="muted">' + (D ? "No steps in this meal's Notion page yet. Add them there as a numbered list (or under a Steps heading), or bring the recipe in with + FROM A RECIPE." : "") + "</p>") + "</div></div></section>";
    return html;
  }

  /* TONIGHT, on TODAY and the Bridge: what's planned, and from 4 PM, what it was */
  function mealLine() {
    if (!state.conn || !canMeals()) return "";
    loadMeals(false);
    if (!ml.data) return "";
    var t = mlToday(), dn = mlDinner(t), eve = mlEvening(), tm = mlDinner(ymd(addDays(new Date(), 1))), r = dn && dn.kind === "meal" ? mlRot(dn.meal) : null, G = mlGroceries();
    var sub = dn ? (dn.status === "eaten" ? "Recorded" : "Planned" + (r && r.since ? " · last made " + mlAgo(r.since) : "")) : eve ? "What was dinner?" : "Nothing planned yet";
    var acts = eve && (!dn || dn.status === "planned")
      ? (dn && dn.kind === "meal" ? '<button type="button" class="chip sm" data-mlnow="had" style="--c: var(--ok)">✓ HAD IT</button>' : "") + '<button type="button" class="chip sm" data-mlnow="leftovers">LEFTOVERS</button><button type="button" class="chip sm" data-mlnow="out">EATING OUT</button><button type="button" class="chip sm" data-mlnow="else">SOMETHING ELSE</button>'
      : dn && dn.status === "eaten" ? '<button type="button" class="chip sm" data-mlnow="undo">UNDO</button>' : '<button type="button" class="chip sm" data-mlnow="open">' + (dn ? "MEALS" : "PLAN") + "</button>";
    if (dn && dn.kind === "meal" && mlMeal(dn.meal) && canRecipes()) acts = '<button type="button" class="chip sm" data-mlcook="' + esc(dn.meal) + '" style="--c: var(--chrome-d)">COOK</button>' + acts;
    return '<div class="ml-line" id="mlLine"><span class="ml-lt"><small>TONIGHT · DINNER</small><b>' + esc(dn ? mlDName(dn) : eve ? "Not recorded" : "Nothing planned") + "</b><small>" + esc(sub) +
      (tm ? " · tomorrow: " + esc(mlDName(tm)) : "") + (G.left ? " · " + G.left + " to buy" : "") + '</small></span><span class="btnrow">' + acts + "</span></div>";
  }
  function mealsSection() {   /* SYSTEMS */
    var html = "<section>" + phead("MEALS", canMeals() ? (ml.err ? "PROBLEM" : "NOTION") : "SETUP");
    if (!canMeals()) return html + stubBox("Needs bridge 1.39 and 🍽 Meals and 🍽 Dinners connected in Notion. Steps are in the README under <b>MEALS</b>.") + "</section>";
    var nm = mlMeals(true).length, nd = ml.data ? ml.data.dinners.length : 0;
    return html + '<div class="calrow"><span class="st" style="background:#e8a27a"></span><span><b>🍽 Meals and Dinners</b><small' + (ml.err ? ' class="errtxt">' + esc(ml.err.msg) : ">" + (ml.data ? nm + (nm === 1 ? " meal · " : " meals · ") + nd + (nd === 1 ? " dinner" : " dinners") + " in the last four months and planned" : "Reading…")) + "</small></span>" +
      '<span class="pill' + (ml.data && !ml.err ? " ok" : ml.err ? " bad" : "") + '">' + (ml.data && !ml.err ? "OK" : ml.err ? "ERROR" : "WAITING") + "</span></div></section>";
  }

