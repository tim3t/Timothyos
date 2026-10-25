// One name, one thing (2.44.0): js/app.js is one function, so two top-level `var`s or functions with the same name
// silently share (or replace) each other. That happened in 2.43.0: the SCIENCE landmarks' `lm` took over the Time
// Loom's state. Every top-level var and function name must be unique.
const fs = require('fs'), path = require('path'), assert = require('assert');
const lines = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').split('\n'), seen = {};
lines.forEach((l, i) => {
  const code = l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');   // string contents aside
  const fn = code.match(/^  function ([A-Za-z_$][\w$]*)/), v = code.match(/^  var (.*)/);
  const names = fn ? [fn[1]] : v ? [...(' ' + v[1]).matchAll(/[\s,]([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => m[1]).filter((n, j, a) => a.indexOf(n) === j) : [];
  names.forEach(n => { (seen[n] = seen[n] || []).push(i + 1); });
});
const dup = Object.keys(seen).filter(n => seen[n].length > 1).map(n => n + ' (lines ' + seen[n].join(', ') + ')');
assert.deepStrictEqual(dup, [], 'top-level names used twice: ' + dup.join('; '));
console.log('ALL TOP-LEVEL NAMES UNIQUE (' + Object.keys(seen).length + ')');
