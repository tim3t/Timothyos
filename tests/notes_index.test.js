// The working notes stay short and findable (D74). CLAUDE.md loads in full at the start of every session, so it holds
// only what applies to every change, plus an index; a station's notes live in docs/notes/. This fails when CLAUDE.md
// grows past 30 KB (move the new text to the station's notes file), when a notes file isn't in the index, when the
// index names a file that isn't there, or when the backlog loses one of its sections.
const fs = require('fs'), path = require('path'), assert = require('assert');
const R = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(R, f), 'utf8');
const main = read('CLAUDE.md');
assert.ok(Buffer.byteLength(main) < 30000, 'CLAUDE.md is ' + Buffer.byteLength(main) + ' bytes: keep it under 30,000 by moving station detail to docs/notes/');
const listed = [...main.matchAll(/`docs\/notes\/([a-z0-9-]+\.md)`/g)].map(m => m[1]);
const have = fs.readdirSync(path.join(R, 'docs', 'notes')).filter(f => f.endsWith('.md'));
assert.deepStrictEqual(have.filter(f => !listed.includes(f)), [], 'a notes file that the index in CLAUDE.md does not list');
assert.deepStrictEqual([...new Set(listed)].filter(f => !have.includes(f)), [], 'the index names a notes file that is not there');
have.forEach(f => assert.ok(read('docs/notes/' + f).trim().length > 200, f + ' is empty'));
['Architecture', 'Rules', 'Code conventions', 'Release checklist', 'Testing', 'Notes index'].forEach(h => assert.ok(main.includes('\n## ' + h + '\n'), 'CLAUDE.md lost its section: ' + h));
assert.ok(/Current versions: \*\*app \d+\.\d+\.\d+\*\*, \*\*bridge \d+\.\d+\.\d+\*\*/.test(main), 'the Current versions line');
const backlog = read('docs/BACKLOG.md');
['Waiting on Timothy', 'Agreed, not started', 'Put off, to return to', 'Decided against', 'Roadmap'].forEach(h => assert.ok(new RegExp('\\n## ' + h).test(backlog), 'docs/BACKLOG.md lost its section: ' + h));
assert.ok(main.includes('docs/BACKLOG.md'), 'CLAUDE.md points at the backlog');
console.log('notes: CLAUDE.md ' + Math.round(Buffer.byteLength(main) / 1024) + ' KB, ' + have.length + ' notes files indexed, backlog in place');
