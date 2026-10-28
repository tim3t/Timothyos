// HOLODECK NETWORK scheduling (2.48, repeats fixed in 2.50), as pure logic lifted out of js/app.js: the broadcast day
// starts at 6:00 local (a daylight-saving day too), the same date and folder always give the same lineup, never the same
// show three times running (two only as a block, in episode order), and no episode airs twice in a day until its show has
// aired every one. Invented shows.
process.env.TZ = 'America/Chicago';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const cut = (a, z) => { const i = src.indexOf(a), j = src.indexOf(z, i); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };
const code = cut('    var PK = {};', '    function typical(');
const p2 = n => (n < 10 ? '0' : '') + n, ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const fresh = () => vm.runInNewContext('(function () {' + code + '; return { dayStart: dayStart, picks: picks, clear: function () { PK = {}; } }; })()', { ymd, Math, Date, Object });

// ---- the broadcast day: 6:00 local
const N = fresh(), at = s => new Date(s).getTime(), local = ms => { const d = new Date(ms); return ymd(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
assert.strictEqual(local(N.dayStart(at('2026-10-28T05:59:00-05:00'))), '2026-10-27 06:00', '05:59 still belongs to yesterday');
assert.strictEqual(local(N.dayStart(at('2026-10-28T06:00:00-05:00'))), '2026-10-28 06:00', '06:00 starts the new day');
assert.strictEqual(local(N.dayStart(at('2026-10-28T23:30:00-05:00'))), '2026-10-28 06:00');
assert.strictEqual(local(N.dayStart(at('2026-11-01T12:00:00-06:00'))), '2026-11-01 06:00', 'the day clocks go back');
assert.strictEqual(local(N.dayStart(at('2026-11-01T05:30:00-06:00'))), '2026-10-31 06:00');

// ---- a folder of shows (sizes 12, 5, 2, 1), with items that know their show and episode
const mk = (name, n) => ({ name, items: Array.from({ length: n }, (_, i) => ({ show: name, ep: i + 1, f: { path: '/Video/Net/' + name + '/' + (i + 1) } })) });
const shows = [mk('Night Owl Theatre', 12), mk('Kitchen Corner', 5), mk('Bowling Hour', 2), mk('One-Off Special', 1)];
const s = { shows, play: shows.reduce((a, x) => a.concat(x.items), []) }, c = { dir: '/Video/Net' };
const day = at('2026-10-28T06:00:00-05:00');
const grow = (P, n) => { const l = P.picks(c, s, day); while (l.length < n) l.more(); return l; };

// same date, same lineup (a fresh copy of the code, as after a reload); another date, another lineup
const A = grow(fresh(), 600).slice(0, 600).map(x => x.f.path), B = grow(fresh(), 600).slice(0, 600).map(x => x.f.path);
{ const k = A.findIndex((x, i) => x !== B[i]); assert.strictEqual(k, -1, 'the same date and folder always give the same lineup; first difference at ' + k + ': ' + A.slice(k - 1, k + 2) + ' vs ' + B.slice(k - 1, k + 2)); }
const other = fresh().picks(c, s, at('2026-10-29T06:00:00-05:00')).slice(0, 40).map(x => x.f.path);
assert.notStrictEqual(JSON.stringify(Array.from(other)), JSON.stringify(A.slice(0, 40)), 'a new day, a new lineup');   /* compared as text: the arrays come from separate sandboxes */
const more = { shows, play: s.play.concat([{ show: 'Kitchen Corner', ep: 6, f: { path: '/Video/Net/Kitchen Corner/6' } }]) };
assert.notStrictEqual(JSON.stringify(Array.from(fresh().picks(c, more, day).slice(0, 40), x => x.f.path)), JSON.stringify(A.slice(0, 40)), 'a new file reshuffles the day (the key includes the count)');

// never three of a show in a row; a pair is a block, in episode order
const L = grow(fresh(), 600).slice(0, 600);
for (let i = 2; i < L.length; i++) assert.ok(!(L[i].show === L[i - 1].show && L[i - 1].show === L[i - 2].show), 'three in a row at ' + i);
for (let i = 1; i < L.length; i++) if (L[i].show === L[i - 1].show) assert.ok(L[i].ep === L[i - 1].ep + 1, 'a block runs in episode order at ' + i + ': ' + L[i - 1].ep + ', ' + L[i].ep);
assert.ok(L.some((x, i) => i && x.show === L[i - 1].show), 'blocks do happen');

// no episode twice in a day until its show has aired every one
shows.forEach(sh => {
  const seq = L.filter(x => x.show === sh.name).map(x => x.ep), n = sh.items.length;
  for (let k = 0; k + n <= seq.length; k += n) {
    const round = seq.slice(k, k + n);
    assert.strictEqual(new Set(round).size, n, sh.name + ': every episode once before any repeats: ' + round.join(','));
  }
});
console.log('holo_net: ok');
