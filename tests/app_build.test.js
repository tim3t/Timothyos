// js/app.js is built from js/src/ (2.73.1): the iPad still gets one file, but the source is split a part per station
// or concern. This fails when js/app.js isn't exactly the build of js/src/: a part edited without rebuilding, or
// js/app.js edited by hand (the next build would silently undo that). Fix: edit js/src/, run python3 tools/build_app.py.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py'), '--check'], { stdio: 'pipe' });
const parts = fs.readdirSync(path.join(ROOT, 'js', 'src')).filter(f => f.endsWith('.js')).sort();
assert.strictEqual(parts[0], '00-head.js'); assert.strictEqual(parts[parts.length - 1], '99-foot.js');
assert.ok(parts.every(f => /^\d\d-[a-z0-9-]+\.js$/.test(f)), 'parts are named NN-name.js: ' + parts.join(' '));
assert.ok(/^\/\* BUILT FILE:/.test(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')), 'the built file says so on its first line');
console.log('app.js is the build of ' + parts.length + ' parts');
