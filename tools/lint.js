#!/usr/bin/env node
// The lint check (D78): node tools/lint.js. Prints each finding as file:line, the rule and what it found; exit 1 if any.
// The app is checked as the iPad gets it (js/app.js, the parts in js/src joined into one function), so a name defined in
// one part and used in another is understood; each finding is reported in the part it's in. --summary adds counts by rule.
const fs = require('fs'), path = require('path');
const { ESLint } = require('eslint');
const ROOT = path.join(__dirname, '..');

async function main() {
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(['js/app.js', 'sw.js', 'apps-script/Code.gs', 'tests', 'tools', 'eslint.config.js']);
  // js/app.js line → the part it came from (the build adds one notice line at the top, then the parts in order)
  const parts = fs.readdirSync(path.join(ROOT, 'js/src')).filter(f => f.endsWith('.js')).sort();
  const starts = []; let line = 2;
  for (const f of parts) { starts.push([line, 'js/src/' + f]); line += fs.readFileSync(path.join(ROOT, 'js/src', f), 'utf8').split('\n').length - 1; }
  const where = (file, ln) => {
    if (file !== 'js/app.js') return file + ':' + ln;
    let hit = starts[0]; for (const s of starts) if (s[0] <= ln) hit = s;
    return hit[1] + ':' + (ln - hit[0] + 1);
  };
  const out = [], byRule = {};
  for (const r of results) {
    const file = path.relative(ROOT, r.filePath).split(path.sep).join('/');
    for (const m of r.messages) {
      const rule = m.ruleId || (m.fatal ? 'parse error' : 'eslint');
      byRule[rule] = (byRule[rule] || 0) + 1;
      out.push(where(file, m.line) + '  ' + rule + '  ' + m.message);
    }
  }
  out.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  out.forEach(l => console.log(l));
  if (process.argv.includes('--summary')) Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + String(n).padStart(4) + '  ' + k));
  console.log(out.length ? 'LINT: ' + out.length + ' finding' + (out.length === 1 ? '' : 's') : 'LINT: clean (' + results.length + ' files)');
  process.exit(out.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
