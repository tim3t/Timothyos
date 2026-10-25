// SCIENCE (2.42): the sky worked out on the iPad. Visible passes from a real ISS orbit (CelesTrak, 24 Oct 2026) for a
// public test spot (Kansas City), with the clock held: rises at 10° or more, only in a dark sky with the station in
// sunlight; the predicted position matched wheretheiss.at to 0.02°. The aurora rule of thumb by latitude.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const R = path.join(__dirname, '..');
const NOW = Date.parse('2026-10-25T01:00:00Z'), RealDate = Date;
class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = { console, Math, Date: FixedDate }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js/vendor/satellite.min.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js/vendor/astronomy.min.js'), 'utf8'), ctx);
const src = fs.readFileSync(path.join(R, 'js/app.js'), 'utf8');
const cut = (a, z) => { const i = src.indexOf(a), j = src.indexOf(z); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };
const fns = vm.runInContext('(function () {' + cut('  var SCI_SAT = ', '  var SCI_PLANETS') + cut('  function sciPassesFor(', '  function sciTonight(') + cut('  function sciAuroraKp(', '  function sciKpNow(') +
  cut('  function sciCompass(', '  function sciKm(') + '; return { sciPassesFor, sciPassLook, sciAuroraKp, sciCompass }; })()', ctx);
const TLE = { l1: '1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991', l2: '2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752' };
const S = ctx.satellite, rec = S.twoline2satrec(TLE.l1, TLE.l2), at = new FixedDate(1792889833000), g = S.eciToGeodetic(S.propagate(rec, at).position, S.gstime(at));
assert.ok(Math.abs(S.degreesLat(g.latitude) - -33.976) < 0.05 && Math.abs(S.degreesLong(g.longitude) - -62.271) < 0.05, 'matches wheretheiss.at');

const ps = fns.sciPassesFor('iss', TLE, { lat: 39.1, lon: -94.58 });
assert.strictEqual(ps.length, 4, JSON.stringify(ps));
const first = ps[0];
assert.strictEqual(new RealDate(first.rise).toISOString().slice(0, 16), '2026-10-26T11:37');   // 06:37 CDT, before dawn
assert.strictEqual(first.max, 12); assert.strictEqual(fns.sciCompass(first.riseAz), 'NNW');
const best = ps.reduce((a, b) => b.max > a.max ? b : a);
assert.strictEqual(new RealDate(best.rise).toISOString().slice(0, 10), '2026-10-28'); assert.strictEqual(best.max, 19);
ps.forEach(p => { assert.ok(p.set > p.rise && p.set - p.rise < 12 * 60000 && p.max >= 10 && p.max <= 90, JSON.stringify(p)); assert.ok(!('maxP' in p)); });
assert.ok(ps.every(p => { const h = new RealDate(p.maxAt).getUTCHours(); return h >= 9 && h <= 12; }), 'mornings: evenings are in daylight or shadow this week');
assert.strictEqual(fns.sciPassLook(first), 'Low, 12° up');
assert.strictEqual(fns.sciPassLook({ sat: 'iss', max: 67 }), 'Bright, easy to see');
assert.strictEqual(fns.sciPassLook({ sat: 'css', max: 45 }), 'Bright');
assert.strictEqual(fns.sciPassLook({ sat: 'hst', max: 70 }), 'Faint; binoculars help');
assert.deepStrictEqual([65, 56, 53, 50, 47, 43, 39, 30].map(fns.sciAuroraKp), [2, 4, 5, 5, 6, 8, 9, 9]);
assert.strictEqual(fns.sciAuroraKp(-47), 6, 'south too'); assert.strictEqual(fns.sciAuroraKp(44.98), 7);
console.log('ALL SCIENCE SKY CHECKS PASSED');
