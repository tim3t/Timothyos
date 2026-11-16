// Notion schema check in the bridge (1.31): each connected database's columns against the ones the bridge uses
// (name and type); a renamed column is "not found", a changed type names both; databases not connected say so
// instead; read-only (GETs only); cached for six hours unless asked fresh; setup's log names the problem.
const assert = require('assert');
const { bridge } = require('./lib/gas');
const br = bridge({ props: { ACCESS_KEY: null, NOTION_TOKEN: 'ntn_test' }, notion: {} });
const { ctx, props, cache, nx, log: logs } = br;

// connected: tasks (an extra column too), dates (Date renamed to When), library (Rating made text); the rest not
const SHARED = ['tasks', 'dates', 'library'];
const unshared = ctx.schemaSpec_().map(d => d.key).filter(k => SHARED.indexOf(k) < 0);
unshared.forEach(k => nx.unshare(k));
nx.column('tasks', 'Extra', 'people');
nx.rename('dates', 'Date', 'When');
nx.drop('library', 'Rating'); nx.column('library', 'Rating', 'rich_text');

ctx.setup(); const key = props.ACCESS_KEY;
const get = p => br.call(p);

// setup's log names the problems
const line = logs.find(l => l.startsWith('Notion columns:'));
assert.ok(line && line.includes('PROBLEM') && line.includes('Key Dates: "Date" (date) not found') && line.includes('Library: "Rating" is text, needs number'), line);
assert.ok(get({ action: 'ping', key }).capabilities.includes('schema'));

// the schema action: one row per database
let c0 = nx.calls.length;
const s = get({ action: 'schema', key, fresh: '1' });
assert.ok(s.ok); assert.strictEqual(s.dbs.length, 17);   /* 1.36: + Upkeep; 1.39: + Meals, Dinners; 1.43: + Sickbay */
const by = k => s.dbs.find(d => d.key === k);
assert.deepStrictEqual([by('tasks').missing, by('tasks').wrong], [[], []], 'Master Task List complete (extra columns are fine)');
assert.deepStrictEqual(by('dates').missing, [{ name: 'Date', type: 'date' }]);
assert.deepStrictEqual(by('library').wrong, [{ name: 'Rating', want: 'number', got: 'rich_text' }]);
assert.strictEqual(by('apiary').error, 'notion_not_shared', 'not connected is said, not counted as missing columns');
assert.strictEqual(by('apiary').missing.length, 0);
const fresh = nx.calls.slice(c0);
assert.ok(fresh.length && fresh.every(c => c.method === 'get'), 'read-only: ' + fresh.filter(c => c.method !== 'get').map(c => c.method + ' ' + c.path).join(', '));

// cached: no Notion calls the second time; fresh asks again
c0 = nx.calls.length;
get({ action: 'schema', key }); assert.strictEqual(nx.calls.length, c0, 'from the cache');
nx.rename('dates', 'When', 'Date');
assert.strictEqual(get({ action: 'schema', key }).dbs.find(d => d.key === 'dates').missing.length, 1, 'still the cached answer');
assert.strictEqual(get({ action: 'schema', key, fresh: '1' }).dbs.find(d => d.key === 'dates').missing.length, 0, 'fresh sees the fix');

// without the Notion key
delete props.NOTION_TOKEN; delete cache.schema;
assert.strictEqual(get({ action: 'schema', key }).error, 'notion_not_configured');

const notShared = new Set(unshared.map(k => nx.dbId(k)));
assert.deepStrictEqual(nx.refused().filter(c => !(c.method === 'get' && /^404 object_not_found/.test(c.refused) && notShared.has(c.path.replace('/databases/', '')))).map(c => c.method + ' ' + c.path + ' ' + c.refused), [],
  'the bridge sent nothing Notion refuses (the 404s are the databases not connected)');
console.log('ALL SCHEMA CHECKS PASSED');
