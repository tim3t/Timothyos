// Bridge 1.9 Ledger: YNAB is read-only (every call is a GET), past months are cached,
// spending excludes card payments, hidden and internal categories; the fund category is
// found by name; the Replicator Queue adds (idempotent), reorders and marks bought, and
// only touches its own items. Errors from YNAB and Notion are reported separately.
const assert = require('assert');
const { bridge } = require('./lib/gas');
let ynabCalls = [], ynabStatus = 200, planStart = null, onlyBudgets = false, fundCatName = 'Discretionary';
// sample plan: today 2026-10-07; months Oct 2025 .. Sep 2026 + Oct 2026 so far
const cat = (id, name, group, activity, extra = {}) => Object.assign({ id, name, category_group_name: group, activity, balance: 0, hidden: false, deleted: false, internal: false }, extra);
function monthDetail(month) {
  const i = month === '2026-10-01' ? 99 : +month.slice(5, 7);
  return { month, age_of_money: 40 + (i % 12), categories: [
    cat('c-groc', 'Groceries', 'Everyday', -600000 - i * 1000),
    cat('c-fuel', 'Fuel', 'Everyday', month === '2026-10-01' ? -74000 : -230000),
    cat('c-disc', fundCatName, 'Fun', -20000, { balance: 340000 }),
    cat('c-ccp', 'Visa', 'Credit Card Payments', -500000),
    cat('c-rta', 'Inflow: Ready to Assign', 'Internal Master Category', 4000000, { internal: true }),
    cat('c-old', 'Old hobby', 'Fun', -10000, { hidden: true })
  ] };
}
function fetch(url, opts, res) {
  if (url.indexOf('https://api.ynab.com/v1') === 0) {
    ynabCalls.push((opts.method || 'get').toUpperCase() + ' ' + url.replace('https://api.ynab.com/v1', ''));
    if (opts.headers.Authorization !== 'Bearer ynab_test' || ynabStatus === 401) return res(401, { error: { id: '401', name: 'unauthorized', detail: 'Unauthorized' } });
    if (url.endsWith('/v1/plans') || url.endsWith('/v1/budgets')) return res(200, { data: { [onlyBudgets ? 'budgets' : 'plans']: [{ id: 'p-123', name: 'Household', last_modified_on: '2026-10-06' }] } });
    if (onlyBudgets && url.indexOf('/v1/plans/') > -1) return res(404, { error: { id: '404.2', name: 'resource_not_found', detail: 'Resource not found' } });
    const path = url.replace(/https:\/\/api\.ynab\.com\/v1\/(plans|budgets)\/last-used/, '');
    if (path === '/nothing') return res(404, { error: { detail: 'Resource not found' } });
    if (path === '/accounts') return res(200, { data: { server_knowledge: 1, accounts: [
      { id: 'a1', name: 'Checking', type: 'checking', balance: 4812370, deleted: false, closed: false },
      { id: 'a2', name: 'Emergency Fund', type: 'savings', balance: 8250000, deleted: false, closed: false },
      { id: 'a3', name: 'Truck Loan', type: 'autoLoan', balance: -11420180, debt_original_balance: -18400000, deleted: false, closed: false },
      { id: 'a4', name: 'Old card', type: 'creditCard', balance: 0, deleted: false, closed: true }] } });
    const mm = path.match(/^\/months\/(\d{4}-\d{2}-01)$/);
    if (mm && planStart && mm[1] < planStart) return res(404, { error: { id: '404.2', name: 'resource_not_found', detail: 'Resource not found' } });
    if (mm) return res(200, { data: { month: monthDetail(mm[1]) } });
    return res(404, { error: { detail: 'not found' } });
  }
}
const NOW = '2026-10-07T12:00:00Z';
const br = bridge({ tz: 'America/New_York', props: { NOTION_TOKEN: 'ntn_test' }, notion: { now: () => new Date(NOW) }, fetch }), { ctx, props, cache, nx } = br;
const RealDate = Date; ctx.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return new RealDate(NOW).getTime(); } };
const qpage = (id, title, cost, priority, bought, created) => nx.add('queue', { Name: title, Cost: cost, Priority: priority, Bought: bought }, { id, created_time: created });
qpage('q'.repeat(31) + '1', 'New glasses', 280, 10, null, '2026-10-01T10:00:00.000Z'); qpage('q'.repeat(31) + '2', 'Honey extractor', 450, 20, null, '2026-10-02T10:00:00.000Z');
qpage('q'.repeat(31) + '3', 'Rain barrels', 160, null, null, '2026-10-03T10:00:00.000Z'); qpage('q'.repeat(31) + '4', 'Hive tool', 25, 5, '2026-09-20', '2026-09-01T10:00:00.000Z');
nx.define('other', { columns: { Name: 'title' } });
nx.add('other', { Name: 'A page elsewhere' }, { id: 'f'.repeat(32), in_trash: true });
const patches = () => nx.calls.filter(c => c.method === 'patch');
const get = br.post, post = br.post;

// --- no token: ledger capability off, YNAB reported separately, queue still works
assert.ok(!get({ action: 'ping' }).capabilities.includes('ledger'));
assert.ok(get({ action: 'ping' }).capabilities.includes('queue'));
let L = get({ action: 'ledger' });
assert.strictEqual(L.ynabError, 'ynab_not_configured'); assert.strictEqual(L.queue.items.length, 3);

// --- with a token
props.YNAB_TOKEN = 'ynab_test';
assert.ok(get({ action: 'ping' }).capabilities.includes('ledger'));
L = get({ action: 'ledger' });
const y = L.ynab;
console.log('ynab calls (cold):', ynabCalls.length, ynabCalls.slice(0, 3).join(' | '));
assert.ok(ynabCalls.every(c => c.startsWith('GET ')), 'only GET requests to YNAB');
assert.strictEqual(ynabCalls.length, 14, 'accounts + this month + 12 past months');
assert.deepStrictEqual(y.months.slice(0, 2).concat(y.months.slice(-1)), ['2025-10-01', '2025-11-01', '2026-09-01']);
assert.strictEqual(y.month, '2026-10-01');
assert.deepStrictEqual(y.checking.map(a => a.name + ' ' + a.balance), ['Checking 4812.37']);
assert.deepStrictEqual(y.savings.map(a => a.balance), [8250]);
assert.deepStrictEqual(y.loans, [{ id: 'a3', name: 'Truck Loan', type: 'autoLoan', balance: -11420.18, original: 18400 }], 'loan with its starting balance');
assert.deepStrictEqual(y.cats.map(c => c.name), ['Groceries', 'Fuel', 'Discretionary'], 'card payments, internal and hidden categories left out');
assert.strictEqual(y.cats[0].m.length, 12); assert.strictEqual(y.cats[0].m[11], 609); assert.strictEqual(y.cats[1].now, 74);
assert.strictEqual(y.age.length, 13); assert.strictEqual(y.age[12].days, 40 + (99 % 12));
assert.deepStrictEqual(y.fund, { name: 'Discretionary', balance: 340 });
assert.deepStrictEqual(L.queue.items.map(i => i.title), ['New glasses', 'Honey extractor', 'Rain barrels'], 'priority order, unranked last');
assert.deepStrictEqual(L.queue.bought.map(i => i.title), ['Hive tool']);

// --- warm: cached; after the 10-minute cache ends only accounts and this month are fetched again
ynabCalls = []; get({ action: 'ledger' }); assert.strictEqual(ynabCalls.length, 0, 'served from cache');
delete cache['ynab:last-used']; get({ action: 'ledger' });
console.log('ynab calls (past months cached):', ynabCalls.join(' | '));
assert.strictEqual(ynabCalls.length, 2);

// --- fund category by another name
props.LEDGER_FUND_CATEGORY = 'Slush'; delete cache['ynab:last-used'];
assert.strictEqual(get({ action: 'ledger' }).ynab.fund, null); delete props.LEDGER_FUND_CATEGORY; delete cache['ynab:last-used'];

// --- queue: add (idempotent), reorder, bought, undo, foreign ids refused
const a1 = post({ action: 'queueadd', item: { cid: 'qadd-0001', title: 'Pruning saw', cost: '129.5', note: 'For the orchard' } });
const a2 = post({ action: 'queueadd', item: { cid: 'qadd-0001', title: 'Pruning saw', cost: 129.5 } });
console.log('added:', JSON.stringify(a1.item), '| resend duplicate:', a2.duplicate);
assert.ok(a1.ok && a1.item.priority === 30 && a1.item.cost === 129.5 && a2.duplicate && nx.rows('queue').length === 5);
assert.deepStrictEqual([nx.row(a1.item.id).Name, nx.row(a1.item.id).Cost, nx.row(a1.item.id).Note], ['Pruning saw', 129.5, 'For the orchard']);
assert.strictEqual(post({ action: 'queueadd', item: { cid: 'qadd-0002', title: '  ' } }).error, 'bad_title');
assert.strictEqual(post({ action: 'queueadd', item: { cid: 'qadd-0003', title: 'x', link: 'javascript:alert(1)' } }).error, 'bad_request');
const ids = L.queue.items.map(i => i.id).concat([a1.item.id]);
let r = post({ action: 'queueorder', ids: [ids[3], ids[0], ids[1], ids[2]] });
console.log('reordered:', r.queue.items.map(i => i.title + ' ' + i.priority).join(' | '));
assert.deepStrictEqual(r.queue.items.map(i => i.title), ['Pruning saw', 'New glasses', 'Honey extractor', 'Rain barrels']);
assert.deepStrictEqual(ids.map(i => nx.row(i).Priority), [20, 30, 40, 10], 'the order is in Notion');
const n1 = patches().length; post({ action: 'queueorder', ids: [ids[3], ids[0], ids[1], ids[2]] });
assert.strictEqual(patches().length, n1, 'repeating the same order changes nothing');
assert.strictEqual(post({ action: 'queueorder', ids: ['f'.repeat(32)] }).error, 'not_writable', 'only queue items');
r = post({ action: 'queuebought', id: ids[0], day: '2026-10-07' });
assert.deepStrictEqual(r.queue.bought.map(i => i.title), ['New glasses', 'Hive tool']);
r = post({ action: 'queuebought', id: ids[0], day: null });
assert.ok(r.queue.items.some(i => i.title === 'New glasses'), 'undo puts it back');
assert.strictEqual(post({ action: 'queuebought', id: 'f'.repeat(32), day: '2026-10-07' }).error, 'not_writable');
assert.strictEqual(post({ action: 'queuebought', id: ids[0], day: 'soon' }).error, 'bad_request');
// 1.47: off the queue without buying it: to Notion's trash, and back with undo; only this queue's waiting items
r = post({ action: 'queueremove', id: ids[1] });
assert.ok(r.ok && !r.queue.items.some(i => i.id === ids[1]) && !r.queue.bought.some(i => i.id === ids[1]), 'gone, and not bought');
assert.ok(patches().some(c => c.path === '/pages/' + ids[1] && c.body.in_trash === true) && nx.row(ids[1]).in_trash, 'moved to the trash');
r = post({ action: 'queueremove', id: ids[1], undo: true });
assert.ok(r.ok && r.queue.items.some(i => i.id === ids[1]), 'undo brings it back');
r = post({ action: 'queueremove', id: ids[1], undo: true });
assert.ok(r.ok, 'undo twice is harmless');
assert.deepStrictEqual([post({ action: 'queueremove', id: 'f'.repeat(32) }).error, post({ action: 'queueremove', id: 'f'.repeat(32), undo: true }).error, post({ action: 'queueremove', id: '../x' }).error],
  ['not_writable', 'not_writable', 'bad_request'], 'only waiting items of this queue; a page elsewhere is never restored');
assert.ok(nx.row('f'.repeat(32)).in_trash && !patches().some(c => c.path === '/pages/' + 'f'.repeat(32)), 'and nothing was sent to it');
const boughtId = r.queue.bought[0].id;
assert.strictEqual(post({ action: 'queueremove', id: boughtId }).error, 'not_writable', 'a bought item stays in the record');

// --- YNAB errors stay separate from the queue
ynabStatus = 401; L = get({ action: 'ledger' });
assert.strictEqual(L.ynabError, 'ynab_unauthorized'); assert.ok(L.queue.items.length >= 3);
assert.ok(!/ynab_test/.test(JSON.stringify(L)), 'token never echoed');

// --- bridge 1.9.1: a plan younger than 12 months (YNAB says "not found" for months before it began)
ynabStatus = 200; planStart = '2026-03-01'; Object.keys(cache).forEach(k => { delete cache[k]; });
L = get({ action: 'ledger' });
console.log('young plan:', L.ynabError || 'ok', '| months with data', L.ynab && L.ynab.age.filter(a => a.days !== null).length);
assert.ok(!L.ynabError, 'months before the plan are skipped, not an error');
assert.deepStrictEqual(L.ynab.age.slice(0, 5).map(a => a.days), [null, null, null, null, null]);
assert.strictEqual(L.ynab.cats[0].m[0], 0); assert.ok(L.ynab.cats[0].m[11] > 0);

// --- an account that only answers on the older /budgets address
onlyBudgets = true; planStart = null; Object.keys(cache).forEach(k => { delete cache[k]; }); ynabCalls = [];
L = get({ action: 'ledger' });
console.log('budgets fallback:', L.ynabError || 'ok', '|', ynabCalls.slice(0, 3).join(' | '));
assert.ok(!L.ynabError && L.ynab.checking.length === 1);
assert.ok(ynabCalls.every(c => c.startsWith('GET ')));
assert.ok(ynabCalls.filter(c => c.indexOf('/plans/') > -1).length === 1, 'after one miss, the older address is remembered');
onlyBudgets = false; Object.keys(cache).forEach(k => { delete cache[k]; });

// --- setup names the failing request and lists the plans
props.YNAB_PLAN_ID = 'wrong-id';
const st = ctx.ledgerStatus_();
console.log('setup line:', st.ynab);
assert.ok(/ynab_not_found\. .*\(reading accounts\)\. Plans this token can see .*Household -> p-123/.test(st.ynab));
delete props.YNAB_PLAN_ID;

// --- bridge 1.9.2: the fund category may carry an emoji
fundCatName = '\u{1FABD} Discretionary'; Object.keys(cache).forEach(k => { delete cache[k]; });
L = get({ action: 'ledger' });
assert.deepStrictEqual(L.ynab.fund, { name: '\u{1FABD} Discretionary', balance: 340 }, 'emoji ignored when matching');
props.LEDGER_FUND_CATEGORY = 'discretionary!'; Object.keys(cache).forEach(k => { delete cache[k]; });
assert.ok(get({ action: 'ledger' }).ynab.fund, 'symbols and capitals ignored on both sides');
delete props.LEDGER_FUND_CATEGORY;
assert.deepStrictEqual(nx.refused(), [], 'the bridge sent nothing Notion refuses');
console.log('ledger checks passed');
