// The app's BRIDGE_WANT (2.38) must be the bridge in this repository: a bridge release bumps Code.gs's VERSION,
// and the app has to expect that version, or Timothy is told to update to the wrong one (or not told at all).
const fs = require('fs'), path = require('path'), assert = require('assert');
const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8').match(/var VERSION = '([\d.]+)'/)[1];
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').match(/var BRIDGE_WANT = "([\d.]+)"/)[1];
assert.strictEqual(app, gs, 'js/app.js BRIDGE_WANT ' + app + ' must equal Code.gs VERSION ' + gs);
const feats = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').match(/BRIDGE_FEATURES = \[\["([\d.]+)"/)[1];
assert.strictEqual(feats, gs, 'the newest entry in BRIDGE_FEATURES names what ' + gs + ' added');
console.log('VERSIONS IN STEP: bridge ' + gs);

// 2.50: the app's own version is the same everywhere a release writes it, and every file the service worker caches for
// offline use exists (one missing file stops the new version installing: no offline, no UPDATE READY).
const R = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(R, f), 'utf8');
const ver = JSON.parse(read('version.json')).version;
assert.strictEqual(read('js/app.js').match(/var VERSION = "([\d.]+)"/)[1], ver, 'js/app.js VERSION = version.json');
const sw = read('sw.js');
assert.strictEqual(sw.match(/var VERSION = "([\d.]+)"/)[1], ver, 'sw.js VERSION = version.json');
const vs = read('index.html').match(/\?v=[\d.]+/g); assert.ok(vs && vs.length >= 2, 'index.html loads the app with ?v=');
vs.forEach(v => assert.strictEqual(v, '?v=' + ver, 'index.html ' + v + ' = ' + ver));
const shell = JSON.parse(sw.match(/var SHELL_FILES = (\[[\s\S]*?\]);/)[1]);
shell.forEach(u => {
  if (u === './') return;
  const [file, q] = u.split('?');
  assert.ok(fs.existsSync(path.join(R, file)), 'sw.js caches ' + file + ', which must exist');
  if (q) assert.strictEqual(q, 'v=' + ver, file + ' is cached at this version');
});
console.log('APP ' + ver + ' IN STEP: app.js, sw.js, index.html, version.json; ' + (shell.length - 1) + ' offline files present');
