// The app's BRIDGE_WANT (2.38) must be the bridge in this repository: a bridge release bumps Code.gs's VERSION,
// and the app has to expect that version, or Timothy is told to update to the wrong one (or not told at all).
const fs = require('fs'), path = require('path'), assert = require('assert');
const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8').match(/var VERSION = '([\d.]+)'/)[1];
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').match(/var BRIDGE_WANT = "([\d.]+)"/)[1];
assert.strictEqual(app, gs, 'js/app.js BRIDGE_WANT ' + app + ' must equal Code.gs VERSION ' + gs);
const feats = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').match(/BRIDGE_FEATURES = \[\["([\d.]+)"/)[1];
assert.strictEqual(feats, gs, 'the newest entry in BRIDGE_FEATURES names what ' + gs + ' added');
console.log('VERSIONS IN STEP: bridge ' + gs);
