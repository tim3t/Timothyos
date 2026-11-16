// Every test file is run by the suite (B1, 16 Nov): bridge_meals.test.js existed for weeks without a line in run.sh,
// so neither the suite nor CI ever ran it. A test file run.sh doesn't name fails here.
const fs = require('fs'), path = require('path'), assert = require('assert');
const run = fs.readFileSync(path.join(__dirname, 'run.sh'), 'utf8').split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');   // a commented-out line runs nothing
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
const missing = files.filter(f => !new RegExp('(^|[\\s"\'|])' + f.replace(/\./g, '\\.') + '($|[\\s"\'])', 'm').test(run));
assert.deepStrictEqual(missing, [], 'test files run.sh never runs: ' + missing.join(', '));
console.log('RUN INDEX: all ' + files.length + ' test files are in run.sh');
