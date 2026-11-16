// A strict simulated Notion (API version 2025-09-03) for the bridge tests (B1). It refuses what real Notion refuses,
// so a request the bridge gets wrong fails here before it fails on Timothy's iPad. Limits are Notion's published ones
// (developers.notion.com: request-limits, filter-data-source-entries, status-codes, pagination; read 16 Nov 2026):
//   filters nested more than two levels deep; a property that doesn't exist (filter, sort or write); a value of the
//   wrong type; page_size outside 1 to 100 (results come in pages with has_more and next_cursor); a text piece over
//   2,000 characters or an array over 100 elements; a wrong token (401) or Notion-Version (400); and, when a test
//   asks, 429 rate_limited with Retry-After, or any other status.
//
// The databases and their columns come from the bridge's own list (schemaSpec_ in Code.gs, the list setup checks
// against the real Notion), so the code and that list are held to each other here, and the list to Notion by setup.
//
//   const nx = b.nx;                                    (lib/gas.js builds and attaches it)
//   nx.add('tasks', { Task: 'Order bulbs', Status: '⬜ To Do', 'Due Date': '2026-10-04' }) → page id
//   nx.rows('tasks') → [{ id, Task: 'Order bulbs', ... }]   plain values, for asserting what Notion holds
//   nx.fail({ status: 429, match: 'post /data_sources', times: 1 })
//   nx.calls → [{ method, path, body }]
const crypto = require('crypto');

const TYPES = ['title', 'rich_text', 'select', 'multi_select', 'status', 'date', 'number', 'checkbox', 'url', 'relation', 'people', 'files', 'email', 'phone_number'];
const TEXT_MAX = 2000, ARRAY_MAX = 100, PAGE_MAX = 100, NEST_MAX = 2, PAYLOAD_BLOCKS_MAX = 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/, ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const CONFIG_KEY = { tarotbooks: 'NOTION_TAROT_BOOKS_DATABASE' };
const BLOCK_TYPES = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle', 'quote', 'callout', 'divider', 'code', 'image', 'bookmark', 'child_page', 'child_database', 'table', 'table_row', 'embed', 'video', 'file', 'pdf', 'equation', 'column_list', 'column', 'synced_block', 'link_preview', 'table_of_contents', 'breadcrumb'];
const RICH_IN = { paragraph: 1, heading_1: 1, heading_2: 1, heading_3: 1, bulleted_list_item: 1, numbered_list_item: 1, to_do: 1, toggle: 1, quote: 1, callout: 1, code: 1 };
const FAULT = { 400: 'validation_error', 401: 'unauthorized', 403: 'restricted_resource', 404: 'object_not_found', 409: 'conflict_error', 429: 'rate_limited', 500: 'internal_server_error', 502: 'bad_gateway', 503: 'service_unavailable', 504: 'gateway_timeout' };

const norm = id => String(id || '').replace(/-/g, '').toLowerCase();
const uuid = seed => { const h = seed ? crypto.createHash('md5').update(seed).digest('hex') : crypto.randomBytes(16).toString('hex'); return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-'); };

class Refusal extends Error { constructor(status, code, message, headers, extra) { super(message); Object.assign(this, { status, code, headers, extra }); } }
const invalid = msg => new Refusal(400, 'validation_error', msg);
const notFound = id => new Refusal(404, 'object_not_found', 'Could not find object with ID: ' + id + '. Make sure the relevant pages and databases are shared with your integration.');

function richRead(items) {
  return items.map(x => {
    const content = x.text ? String(x.text.content) : String(x.plain_text || '');
    return { type: 'text', text: { content, link: (x.text && x.text.link) || null }, annotations: Object.assign({ bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }, x.annotations), plain_text: content, href: (x.text && x.text.link && x.text.link.url) || null };
  });
}
function checkRich(items, where) {
  if (!Array.isArray(items)) throw invalid(where + ' should be an array, instead was `' + JSON.stringify(items) + '`.');
  if (items.length > ARRAY_MAX) throw invalid(where + '.length should be ≤ `' + ARRAY_MAX + '`, instead was `' + items.length + '`.');
  items.forEach((x, i) => {
    if (!x || typeof x !== 'object' || !x.text || typeof x.text.content !== 'string') throw invalid(where + '[' + i + '].text.content should be a string.');
    if (x.text.content.length > TEXT_MAX) throw invalid(where + '[' + i + '].text.content.length should be ≤ `' + TEXT_MAX + '`, instead was `' + x.text.content.length + '`.');
  });
}
const piecesOf = s => { const out = []; s = String(s); for (let i = 0; i < s.length; i += TEXT_MAX) out.push(s.slice(i, i + TEXT_MAX)); return out; };

function notion(opts = {}) {
  const token = opts.token || 'ntn_test', version = opts.version || '2025-09-03';
  const now = opts.now || (() => new Date());
  const dbs = {};                 // key → { key, dbId, dsId, title, columns: { name: { id, type, options } }, shared }
  const pages = new Map();        // norm(id) → { id, key, created_time, last_edited_time, in_trash, properties (read shape) }
  const blocks = new Map();       // norm(parent id) → [block]
  const blockIndex = new Map();   // norm(block id) → block
  const cursors = new Map();
  const faults = [];
  const calls = [];
  let seq = 0;

  const stamp = () => { const d = now(); return new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString(); };
  const dbByAny = id => Object.values(dbs).find(d => norm(d.dbId) === norm(id) || norm(d.dsId) === norm(id));
  const db = key => { const d = dbs[key]; if (!d) throw new Error('nx: no database ' + key + ' (known: ' + Object.keys(dbs).join(', ') + ')'); return d; };
  const visible = d => d && d.shared;

  function define(key, o) {
    const d = dbs[key] = { key, dbId: o.dbId || uuid('db:' + key).replace(/-/g, ''), dsId: o.dsId || uuid('ds:' + key), title: o.title || key, columns: {}, shared: true };
    Object.keys(o.columns).forEach(n => addColumn(d, n, o.columns[n]));
    return d;
  }
  function addColumn(d, name, type) {
    if (TYPES.indexOf(type) < 0) throw new Error('nx: unknown column type ' + type);
    d.columns[name] = { id: (++seq).toString(36), type, options: type === 'select' || type === 'multi_select' || type === 'status' ? [] : undefined };
  }
  function option(col, name, create) {
    let o = col.options.find(x => x.name === name);
    if (!o && create) { o = { id: (++seq).toString(36), name, color: 'default' }; col.options.push(o); }
    return o;
  }

  function attach(ctx) {
    const spec = ctx.schemaSpec_();
    spec.forEach(s => {
      const columns = {};
      s.need.forEach(n => { columns[n[0]] = n[1]; });
      if (s.key === 'log' && ctx.LOG_SEARCH_PROP) columns[ctx.LOG_SEARCH_PROP] = 'rich_text';
      define(s.key, { dbId: ctx.CONFIG[CONFIG_KEY[s.key] || 'NOTION_' + s.key.toUpperCase() + '_DATABASE'], title: s.name, columns });
    });
    Object.keys(opts.options || {}).forEach(k => Object.keys(opts.options[k]).forEach(c => options(k, c, opts.options[k][c])));
  }
  function options(key, column, names) {
    const col = db(key).columns[column];
    if (!col || !col.options) throw new Error('nx: ' + key + '.' + column + ' has no options');
    names.forEach(n => option(col, n, true));
  }

  // ---- values: seed (plain) → read shape, write (API) → read shape, read shape → plain
  function seedValue(col, v, name) {
    switch (col.type) {
      case 'title': case 'rich_text': return richRead((v == null ? [] : Array.isArray(v) ? v : piecesOf(v)).map(s => ({ text: { content: String(s) } })));
      case 'select': case 'status': return v == null ? null : Object.assign({}, option(col, String(v), true));
      case 'multi_select': return (v || []).map(n => Object.assign({}, option(col, String(n), true)));
      case 'date': return v == null ? null : typeof v === 'string' ? { start: v, end: null, time_zone: null } : Object.assign({ end: null, time_zone: null }, v);
      case 'number': return v == null ? null : Number(v);
      case 'checkbox': return !!v;
      case 'url': return v == null ? null : String(v);
      case 'relation': return (v || []).map(id => ({ id: String(id) }));
      default: throw new Error('nx: seeding ' + col.type + ' (' + name + ') is not simulated');
    }
  }
  function writeValue(col, name, w) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) throw invalid('body.properties.' + name + ' should be an object, instead was `' + JSON.stringify(w) + '`.');
    const keys = Object.keys(w).filter(k => k !== 'type' && k !== 'id');
    if (keys.length !== 1 || keys[0] !== col.type) throw invalid(name + ' is expected to be ' + col.type + '.');
    const v = w[col.type], at = 'body.properties.' + name + '.' + col.type;
    switch (col.type) {
      case 'title': case 'rich_text': checkRich(v, at); return richRead(v);
      case 'select': case 'status': {
        if (v === null) return null;
        if (typeof v !== 'object' || (typeof v.name !== 'string' && typeof v.id !== 'string')) throw invalid(at + ' should be an object with a name or an id.');
        if (v.name !== undefined && (v.name.length > 100 || v.name.indexOf(',') > -1 || !v.name.trim())) throw invalid(at + '.name is not a valid option name: `' + v.name + '`.');
        const o = v.id ? col.options.find(x => x.id === v.id) : option(col, v.name, col.type === 'select');
        if (!o) throw invalid('Invalid ' + col.type + ' option for ' + name + ': `' + (v.name || v.id) + '`.');
        return Object.assign({}, o);
      }
      case 'multi_select':
        if (!Array.isArray(v) || v.length > ARRAY_MAX) throw invalid(at + ' should be an array of at most ' + ARRAY_MAX + '.');
        return v.map(x => { if (!x || typeof x.name !== 'string' || x.name.indexOf(',') > -1 || !x.name.trim()) throw invalid(at + ' holds an invalid option `' + JSON.stringify(x) + '`.'); return Object.assign({}, option(col, x.name, true)); });
      case 'date':
        if (v === null) return null;
        if (typeof v !== 'object' || !(ISO_DAY.test(v.start) || ISO_TIME.test(v.start))) throw invalid(at + '.start should be a valid ISO 8601 date string, instead was `' + JSON.stringify(v && v.start) + '`.');
        if (v.end != null && !(ISO_DAY.test(v.end) || ISO_TIME.test(v.end))) throw invalid(at + '.end should be a valid ISO 8601 date string.');
        return { start: v.start, end: v.end || null, time_zone: v.time_zone || null };
      case 'number':
        if (v !== null && (typeof v !== 'number' || !isFinite(v))) throw invalid(at + ' should be a number or `null`, instead was `' + JSON.stringify(v) + '`.');
        return v;
      case 'checkbox':
        if (typeof v !== 'boolean') throw invalid(at + ' should be a boolean, instead was `' + JSON.stringify(v) + '`.');
        return v;
      case 'url':
        if (v !== null && (typeof v !== 'string' || v.length > TEXT_MAX)) throw invalid(at + ' should be a string of at most ' + TEXT_MAX + ' characters or `null`.');
        return v;
      case 'relation':
        if (!Array.isArray(v) || v.length > ARRAY_MAX || v.some(x => !x || typeof x.id !== 'string')) throw invalid(at + ' should be an array of at most ' + ARRAY_MAX + ' { id } objects.');
        return v.map(x => ({ id: x.id }));
      default: throw invalid(name + ' (' + col.type + ') cannot be written by this simulator.');
    }
  }
  function plain(type, v) {
    switch (type) {
      case 'title': case 'rich_text': return v.map(x => x.plain_text).join('');
      case 'select': case 'status': return v ? v.name : null;
      case 'multi_select': return v.map(x => x.name);
      case 'date': return !v ? null : v.end ? { start: v.start, end: v.end } : v.start;
      case 'relation': return v.map(x => x.id);
      default: return v;
    }
  }
  const propRead = (d, name, value) => ({ id: d.columns[name].id, type: d.columns[name].type, [d.columns[name].type]: value });

  function pageRead(p) {
    const d = dbs[p.key];
    const properties = {};
    Object.keys(d.columns).forEach(n => { properties[n] = propRead(d, n, n in p.values ? p.values[n] : seedValue(d.columns[n], null, n)); });
    return { object: 'page', id: p.id, created_time: p.created_time, last_edited_time: p.last_edited_time, in_trash: p.in_trash, archived: p.in_trash,
      icon: p.icon || null, cover: null, url: 'https://www.notion.so/' + norm(p.id),
      parent: { type: 'data_source_id', data_source_id: d.dsId, database_id: d.dbId }, properties };
  }

  function add(key, values = {}, meta = {}) {
    const d = db(key), id = meta.id || uuid(), t = meta.created_time || stamp();
    const p = { id, key, created_time: t, last_edited_time: meta.last_edited_time || t, in_trash: !!meta.in_trash, icon: meta.icon, values: {} };
    Object.keys(values).forEach(n => {
      if (!d.columns[n]) throw new Error('nx: ' + key + ' has no column ' + n + ' (columns: ' + Object.keys(d.columns).join(', ') + ')');
      p.values[n] = seedValue(d.columns[n], values[n], n);
    });
    pages.set(norm(id), p);
    if (meta.blocks) appendBlocks(id, meta.blocks, 'page_id');
    return id;
  }

  // ---- filters and sorts
  function depth(f) { return f && (f.and || f.or) ? 1 + Math.max(0, ...(f.and || f.or).map(depth)) : 0; }
  const OPS = {
    text: ['equals', 'does_not_equal', 'contains', 'does_not_contain', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
    select: ['equals', 'does_not_equal', 'is_empty', 'is_not_empty'],
    multi_select: ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'],
    date: ['equals', 'before', 'after', 'on_or_before', 'on_or_after', 'is_empty', 'is_not_empty'],
    number: ['equals', 'does_not_equal', 'greater_than', 'less_than', 'greater_than_or_equal_to', 'less_than_or_equal_to', 'is_empty', 'is_not_empty'],
    checkbox: ['equals', 'does_not_equal'],
    relation: ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'],
  };
  const FILTER_KEYS = { title: ['title', 'rich_text'], rich_text: ['rich_text'], url: ['url', 'rich_text'], select: ['select'], status: ['status'], multi_select: ['multi_select'], date: ['date'], number: ['number'], checkbox: ['checkbox'], relation: ['relation'] };
  const OP_FAMILY = { title: 'text', rich_text: 'text', url: 'text', select: 'select', status: 'select', multi_select: 'multi_select', date: 'date', number: 'number', checkbox: 'checkbox', relation: 'relation' };

  function compileFilter(d, f, at) {
    if (!f || typeof f !== 'object') throw invalid(at + ' should be an object.');
    if (f.and || f.or) {
      const list = f.and || f.or, keys = Object.keys(f);
      if (keys.length !== 1 || !Array.isArray(list)) throw invalid(at + ' should hold exactly one of `and` or `or`, an array.');
      if (list.length > ARRAY_MAX) throw invalid(at + '.' + keys[0] + '.length should be ≤ `' + ARRAY_MAX + '`.');
      const parts = list.map((x, i) => compileFilter(d, x, at + '.' + keys[0] + '[' + i + ']'));
      return f.and ? p => parts.every(t => t(p)) : p => parts.some(t => t(p));
    }
    if (f.timestamp) {
      if (f.timestamp !== 'created_time' && f.timestamp !== 'last_edited_time') throw invalid(at + '.timestamp should be `created_time` or `last_edited_time`.');
      const cond = f[f.timestamp];
      if (Object.keys(f).length !== 2 || !cond) throw invalid(at + ' should hold `' + f.timestamp + '` with its condition.');
      const t = dateTest(cond, at + '.' + f.timestamp);
      return p => t({ start: p[f.timestamp] });
    }
    if (typeof f.property !== 'string') throw invalid(at + ' should hold `property`, `timestamp`, `and` or `or`.');
    const col = d.columns[f.property];
    if (!col) throw invalid('Could not find property with name or id: ' + f.property);
    const keys = Object.keys(f).filter(k => k !== 'property');
    if (keys.length !== 1 || (FILTER_KEYS[col.type] || []).indexOf(keys[0]) < 0) throw invalid(at + ': the property `' + f.property + '` is ' + col.type + ', so its condition goes under `' + (FILTER_KEYS[col.type] || [col.type])[0] + '` (got `' + keys.join(', ') + '`).');
    const cond = f[keys[0]], fam = OP_FAMILY[col.type];
    const ops = cond && typeof cond === 'object' ? Object.keys(cond) : [];
    if (ops.length !== 1 || OPS[fam].indexOf(ops[0]) < 0) throw invalid(at + '.' + keys[0] + ' should hold one of ' + OPS[fam].join(', ') + ' (got `' + ops.join(', ') + '`).');
    const op = ops[0], arg = cond[op], name = f.property;
    if ((op === 'is_empty' || op === 'is_not_empty') && arg !== true) throw invalid(at + '.' + keys[0] + '.' + op + ' should be `true`.');
    const get = p => (name in p.values ? p.values[name] : seedValue(col, null, name));
    if (fam === 'date') { const t = dateTest(cond, at + '.date'); return p => t(get(p)); }
    if (fam === 'text') {
      if (op.indexOf('empty') < 0 && typeof arg !== 'string') throw invalid(at + '.' + keys[0] + '.' + op + ' should be a string.');
      return p => { const v = col.type === 'url' ? (get(p) || '') : plain(col.type, get(p));
        return { equals: v === arg, does_not_equal: v !== arg, contains: v.indexOf(arg) > -1, does_not_contain: v.indexOf(arg) < 0, starts_with: v.indexOf(arg) === 0, ends_with: v.endsWith(arg), is_empty: !v, is_not_empty: !!v }[op]; };
    }
    if (fam === 'select') return p => { const v = plain(col.type, get(p)); return { equals: v === arg, does_not_equal: v !== arg, is_empty: v == null, is_not_empty: v != null }[op]; };
    if (fam === 'multi_select') return p => { const v = plain(col.type, get(p)); return { contains: v.indexOf(arg) > -1, does_not_contain: v.indexOf(arg) < 0, is_empty: !v.length, is_not_empty: !!v.length }[op]; };
    if (fam === 'relation') return p => { const v = get(p).map(x => norm(x.id)); return { contains: v.indexOf(norm(arg)) > -1, does_not_contain: v.indexOf(norm(arg)) < 0, is_empty: !v.length, is_not_empty: !!v.length }[op]; };
    if (fam === 'checkbox') { if (typeof arg !== 'boolean') throw invalid(at + '.checkbox.' + op + ' should be a boolean.'); return p => (op === 'equals' ? get(p) === arg : get(p) !== arg); }
    if (op.indexOf('empty') < 0 && typeof arg !== 'number') throw invalid(at + '.number.' + op + ' should be a number.');
    return p => { const v = get(p); return { equals: v === arg, does_not_equal: v !== arg, greater_than: v != null && v > arg, less_than: v != null && v < arg, greater_than_or_equal_to: v != null && v >= arg, less_than_or_equal_to: v != null && v <= arg, is_empty: v == null, is_not_empty: v != null }[op]; };
  }
  function dateTest(cond, at) {
    const ops = Object.keys(cond || {});
    if (ops.length !== 1 || OPS.date.indexOf(ops[0]) < 0) throw invalid(at + ' should hold one of ' + OPS.date.join(', ') + ' (got `' + ops.join(', ') + '`).');
    const op = ops[0], arg = cond[op];
    if (op.indexOf('empty') > -1) { if (arg !== true) throw invalid(at + '.' + op + ' should be `true`.'); return v => (op === 'is_empty' ? !v || !v.start : !!(v && v.start)); }
    if (typeof arg !== 'string' || !(ISO_DAY.test(arg) || ISO_TIME.test(arg))) throw invalid(at + '.' + op + ' should be a valid ISO 8601 date string, instead was `' + JSON.stringify(arg) + '`.');
    const day = ISO_DAY.test(arg);
    return v => {
      if (!v || !v.start) return false;
      const a = day ? v.start.slice(0, 10) : Date.parse(ISO_DAY.test(v.start) ? v.start + 'T00:00:00Z' : v.start), b = day ? arg : Date.parse(arg);
      return { equals: a === b, before: a < b, after: a > b, on_or_before: a <= b, on_or_after: a >= b }[op];
    };
  }
  function compileSorts(d, sorts) {
    if (!Array.isArray(sorts)) throw invalid('body.sorts should be an array.');
    const keys = sorts.map((s, i) => {
      if (!s || (s.direction !== 'ascending' && s.direction !== 'descending')) throw invalid('body.sorts[' + i + '].direction should be `ascending` or `descending`.');
      if (s.timestamp) { if (s.timestamp !== 'created_time' && s.timestamp !== 'last_edited_time') throw invalid('body.sorts[' + i + '].timestamp is not valid.'); return { get: p => p[s.timestamp], dir: s.direction }; }
      const col = d.columns[s.property];
      if (!col) throw invalid('Could not find sort property with name or id: ' + s.property);
      return { get: p => { const v = plain(col.type, s.property in p.values ? p.values[s.property] : seedValue(col, null, s.property)); return v && typeof v === 'object' && !Array.isArray(v) ? v.start : v; }, dir: s.direction };
    });
    return (a, b) => {
      for (const k of keys) {
        const x = k.get(a), y = k.get(b), ex = x == null || x === '', ey = y == null || y === '';
        if (ex || ey) { if (ex !== ey) return ex ? 1 : -1; continue; }
        const c = x < y ? -1 : x > y ? 1 : 0;
        if (c) return k.dir === 'ascending' ? c : -c;
      }
      return 0;
    };
  }

  function page(list, body, scope, map) {
    if (body.page_size !== undefined && (!Number.isInteger(body.page_size) || body.page_size < 1 || body.page_size > PAGE_MAX)) throw invalid('body.page_size should be an integer from 1 to ' + PAGE_MAX + ', instead was `' + JSON.stringify(body.page_size) + '`.');
    let from = 0;
    if (body.start_cursor !== undefined) {
      const c = cursors.get(body.start_cursor);
      if (!c || c.scope !== scope) throw invalid('body.start_cursor should be a cursor from a previous response to the same request, instead was `' + JSON.stringify(body.start_cursor) + '`.');
      from = c.from;
    }
    const size = body.page_size || PAGE_MAX, results = list.slice(from, from + size), more = from + size < list.length;
    let next = null;
    if (more) { next = uuid(); cursors.set(next, { scope, from: from + size }); }
    return { object: 'list', results: results.map(map), next_cursor: next, has_more: more };
  }

  // ---- blocks
  function checkBlocks(list, at, count) {
    if (!Array.isArray(list)) throw invalid(at + ' should be an array.');
    if (list.length > ARRAY_MAX) throw invalid(at + '.length should be ≤ `' + ARRAY_MAX + '`, instead was `' + list.length + '`.');
    list.forEach((b, i) => {
      const type = b && (b.type || Object.keys(b).find(k => BLOCK_TYPES.indexOf(k) > -1));
      if (!type || BLOCK_TYPES.indexOf(type) < 0 || !b[type]) throw invalid(at + '[' + i + '] should be a block with one of the known block types.');
      if (RICH_IN[type]) checkRich(b[type].rich_text || [], at + '[' + i + '].' + type + '.rich_text');
      count.n++;
      if (b[type].children) checkBlocks(b[type].children, at + '[' + i + '].' + type + '.children', count);
    });
    if (count.n > PAYLOAD_BLOCKS_MAX) throw invalid('The request has more than ' + PAYLOAD_BLOCKS_MAX + ' blocks.');
  }
  function appendBlocks(parentId, list, parentType) {
    const kids = blocks.get(norm(parentId)) || [];
    list.forEach(b => {
      const type = b.type || Object.keys(b).find(k => BLOCK_TYPES.indexOf(k) > -1), content = Object.assign({}, b[type]);
      const children = content.children; delete content.children;
      if (content.rich_text) content.rich_text = richRead(content.rich_text);
      const blk = { object: 'block', id: b.id || uuid(), parent: { type: parentType, [parentType]: parentId }, type, has_children: false, in_trash: false, created_time: stamp(), last_edited_time: stamp(), [type]: content };
      kids.push(blk); blockIndex.set(norm(blk.id), blk);
      if (children && children.length) { appendBlocks(blk.id, children, 'block_id'); blk.has_children = true; }
    });
    blocks.set(norm(parentId), kids);
    return kids.slice(kids.length - list.length);
  }
  const ownerOf = id => { const p = pages.get(norm(id)); if (p) return p; const b = blockIndex.get(norm(id)); return b ? ownerOf(b.parent.page_id || b.parent.block_id) : null; };
  const reachable = id => { const p = ownerOf(id); return p && visible(dbs[p.key]) ? p : null; };

  // ---- the API
  function route(method, path, query, body) {
    let m;
    if (method === 'get' && (m = path.match(/^\/databases\/([\w-]+)$/))) {
      const d = dbByAny(m[1]); if (!visible(d) || norm(d.dbId) !== norm(m[1])) throw notFound(m[1]);
      return { object: 'database', id: d.dbId, title: richRead([{ text: { content: d.title } }]), data_sources: [{ id: d.dsId, name: d.title }] };
    }
    if ((m = path.match(/^\/data_sources\/([\w-]+)(\/query)?$/))) {
      const d = dbByAny(m[1]); if (!visible(d) || norm(d.dsId) !== norm(m[1])) throw notFound(m[1]);
      if (m[2] && method === 'post') {
        const allowed = ['filter', 'sorts', 'start_cursor', 'page_size', 'filter_properties', 'result_type', 'in_trash'];
        Object.keys(body).forEach(k => { if (allowed.indexOf(k) < 0) throw invalid('body.' + k + ' is not a valid query parameter.'); });
        if (body.filter && depth(body.filter) > NEST_MAX) throw invalid('body.filter: compound filters can be nested at most ' + NEST_MAX + ' levels deep, this one is ' + depth(body.filter) + '.');
        const test = body.filter ? compileFilter(d, body.filter, 'body.filter') : () => true;
        const cmp = body.sorts ? compileSorts(d, body.sorts) : null;
        let list = Array.from(pages.values()).filter(p => p.key === d.key && !p.in_trash && test(p));
        if (cmp) list = list.slice().sort(cmp);
        return Object.assign(page(list, body, 'q:' + d.key + ':' + JSON.stringify([body.filter, body.sorts]), pageRead), { type: 'page_or_data_source' });
      }
      if (m[2]) throw invalid('Use POST to query a data source.');
      if (method === 'get') return dataSourceRead(d);
      if (method === 'patch') {
        Object.keys(body.properties || {}).forEach(n => {
          const v = body.properties[n];
          if (v === null) { if (!d.columns[n]) throw invalid('Could not find property with name or id: ' + n); delete d.columns[n]; return; }
          const type = Object.keys(v).find(k => TYPES.indexOf(k) > -1);
          if (d.columns[n] && v.name) { d.columns[v.name] = d.columns[n]; delete d.columns[n]; pages.forEach(p => { if (n in p.values) { p.values[v.name] = p.values[n]; delete p.values[n]; } }); return; }
          if (!type) throw invalid('body.properties.' + n + ' should name a property type.');
          if (d.columns[n] && d.columns[n].type !== type) throw invalid('Changing ' + n + ' from ' + d.columns[n].type + ' to ' + type + ' is not simulated.');
          if (!d.columns[n]) addColumn(d, n, type);
        });
        return dataSourceRead(d);
      }
    }
    if (method === 'post' && path === '/pages') {
      Object.keys(body).forEach(k => { if (['parent', 'properties', 'children', 'icon', 'cover'].indexOf(k) < 0) throw invalid('body.' + k + ' is not a valid page property.'); });
      const par = body.parent || {};
      if (!par.data_source_id || (par.type && par.type !== 'data_source_id')) throw invalid('body.parent should be { type: "data_source_id", data_source_id }, instead was `' + JSON.stringify(par) + '`.');
      const d = dbByAny(par.data_source_id); if (!visible(d) || norm(d.dsId) !== norm(par.data_source_id)) throw notFound(par.data_source_id);
      const values = writeProps(d, body.properties || {});
      if (body.children) checkBlocks(body.children, 'body.children', { n: 0 });
      const id = uuid(), t = stamp();
      pages.set(norm(id), { id, key: d.key, created_time: t, last_edited_time: t, in_trash: false, icon: body.icon, values });
      if (body.children) appendBlocks(id, body.children, 'page_id');
      return pageRead(pages.get(norm(id)));
    }
    if ((m = path.match(/^\/pages\/([\w-]+)$/))) {
      const p = pages.get(norm(m[1])); if (!p || !visible(dbs[p.key])) throw notFound(m[1]);
      if (method === 'get') return pageRead(p);
      if (method === 'patch') {
        Object.keys(body).forEach(k => { if (['properties', 'in_trash', 'archived', 'icon', 'cover'].indexOf(k) < 0) throw invalid('body.' + k + ' is not a valid page property.'); });
        const trash = body.in_trash !== undefined ? body.in_trash : body.archived;
        if (p.in_trash && trash !== false && body.properties) throw invalid("Can't edit block that is archived. You must unarchive the block before editing.");
        const values = writeProps(dbs[p.key], body.properties || {});
        Object.assign(p.values, values);
        if (trash !== undefined) p.in_trash = !!trash;
        if (body.icon !== undefined) p.icon = body.icon;
        p.last_edited_time = stamp();
        return pageRead(p);
      }
    }
    if ((m = path.match(/^\/blocks\/([\w-]+)\/children$/))) {
      if (!reachable(m[1])) throw notFound(m[1]);
      if (method === 'get') {
        const size = query.page_size !== undefined ? Number(query.page_size) : undefined;
        return Object.assign(page((blocks.get(norm(m[1])) || []).filter(b => !b.in_trash), { page_size: size, start_cursor: query.start_cursor }, 'b:' + norm(m[1]), b => b), { type: 'block', block: {} });
      }
      if (method === 'patch') {
        Object.keys(body).forEach(k => { if (k !== 'children' && k !== 'after' && k !== 'position') throw invalid('body.' + k + ' is not a valid parameter.'); });
        checkBlocks(body.children, 'body.children', { n: 0 });
        const isPage = pages.has(norm(m[1]));
        const added = appendBlocks(m[1], body.children, isPage ? 'page_id' : 'block_id');
        if (!isPage) blockIndex.get(norm(m[1])).has_children = true;
        return { object: 'list', results: added, next_cursor: null, has_more: false, type: 'block', block: {} };
      }
    }
    if ((m = path.match(/^\/blocks\/([\w-]+)$/))) {
      const b = blockIndex.get(norm(m[1])); if (!b || b.in_trash || !reachable(m[1])) throw notFound(m[1]);
      if (method === 'get') return b;
      if (method === 'delete') { b.in_trash = true; return Object.assign({}, b, { archived: true }); }
      if (method === 'patch') {
        const type = b.type, v = body[type];
        if (!v || Object.keys(body).some(k => k !== type && k !== 'in_trash' && k !== 'archived')) throw invalid('body should hold `' + type + '` for this block.');
        if (RICH_IN[type] && v.rich_text) { checkRich(v.rich_text, 'body.' + type + '.rich_text'); v.rich_text = richRead(v.rich_text); }
        Object.assign(b[type], v); b.last_edited_time = stamp();
        return b;
      }
    }
    throw new Refusal(400, 'invalid_request_url', 'Invalid request URL: ' + method.toUpperCase() + ' ' + path);
  }
  function writeProps(d, props) {
    if (typeof props !== 'object' || Array.isArray(props)) throw invalid('body.properties should be an object.');
    const out = {};
    Object.keys(props).forEach(n => {
      const col = d.columns[n];
      if (!col) throw invalid(n + ' is not a property that exists.');
      out[n] = writeValue(col, n, props[n]);
    });
    return out;
  }
  function dataSourceRead(d) {
    const properties = {};
    Object.keys(d.columns).forEach(n => { const c = d.columns[n]; properties[n] = { id: c.id, name: n, type: c.type, [c.type]: c.options ? { options: c.options.map(o => Object.assign({}, o)) } : {} }; });
    return { object: 'data_source', id: d.dsId, title: richRead([{ text: { content: d.title } }]), parent: { type: 'database_id', database_id: d.dbId }, properties };
  }

  function respond(status, body, headers) {
    const text = JSON.stringify(body);
    return { getResponseCode: () => status, getContentText: () => text, getHeaders: () => Object.assign({}, headers), getAllHeaders: () => Object.assign({}, headers) };
  }
  function fetch(url, o = {}) {
    const u = new URL(url), method = String(o.method || 'get').toLowerCase(), path = u.pathname.replace(/^\/v1/, '');
    const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
    let body = {};
    const call = { method, path, query, body };
    calls.push(call);
    try {
      const h = o.headers || {};
      if (h.Authorization !== 'Bearer ' + token) throw new Refusal(401, 'unauthorized', 'API token is invalid.');
      if (h['Notion-Version'] !== version) throw new Refusal(400, h['Notion-Version'] ? 'validation_error' : 'missing_version', 'Notion-Version header should be ' + version + ', instead was ' + JSON.stringify(h['Notion-Version']) + '.');
      if (o.payload) {
        try { body = call.body = JSON.parse(o.payload); } catch (e) { throw invalid('Error parsing JSON body.'); }
        if (typeof body !== 'object' || Array.isArray(body) || body === null) throw invalid('The body should be a JSON object.');
      }
      if (u.origin !== 'https://api.notion.com' || u.pathname.indexOf('/v1/') !== 0) throw new Refusal(400, 'invalid_request_url', 'Invalid request URL.');
      const f = faults.find(x => x.times > 0 && x.test(method + ' ' + path, call));
      if (f) {
        f.times--;
        const code = f.code || FAULT[f.status] || 'internal_server_error';
        const headers = f.status === 429 ? { 'Retry-After': String(f.retryAfter || 1) } : {};
        throw new Refusal(f.status, code, f.message || 'Simulated ' + f.status + ' (' + code + ').', headers, f.status === 429 ? { additional_data: { retry_after: String(f.retryAfter || 1) } } : null);
      }
      return respond(200, route(method, path, query, body), {});
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      call.refused = e.status + ' ' + e.code + ': ' + e.message;
      return respond(e.status, Object.assign({ object: 'error', status: e.status, code: e.code, message: e.message, request_id: uuid() }, e.extra), e.headers || {});
    }
  }

  return {
    attach, define: (key, o) => define(key, o), options, add, fetch, calls,
    ds: key => db(key).dsId, dbId: key => db(key).dbId,
    columns: key => Object.assign({}, ...Object.keys(db(key).columns).map(n => ({ [n]: db(key).columns[n].type }))),
    drop(key, name) { if (!db(key).columns[name]) throw new Error('nx: ' + key + ' has no column ' + name); delete db(key).columns[name]; },
    rename(key, from, to) { const d = db(key); d.columns[to] = d.columns[from]; delete d.columns[from]; pages.forEach(p => { if (from in p.values) { p.values[to] = p.values[from]; delete p.values[from]; } }); },
    column(key, name, type) { addColumn(db(key), name, type); },
    unshare(key) { db(key).shared = false; }, share(key) { db(key).shared = true; },
    rows(key, o = {}) {
      const d = db(key);
      return Array.from(pages.values()).filter(p => p.key === key && (o.trash || !p.in_trash)).map(p => {
        const r = { id: p.id, in_trash: p.in_trash, created_time: p.created_time, last_edited_time: p.last_edited_time };
        Object.keys(d.columns).forEach(n => { r[n] = plain(d.columns[n].type, n in p.values ? p.values[n] : seedValue(d.columns[n], null, n)); });
        return r;
      });
    },
    row(id) { const p = pages.get(norm(id)); return p && this.rows(p.key, { trash: true }).find(r => r.id === p.id); },
    edit(id, values, meta = {}) {
      const p = pages.get(norm(id)), d = dbs[p.key];
      Object.keys(values).forEach(n => { if (!d.columns[n]) throw new Error('nx: ' + p.key + ' has no column ' + n); p.values[n] = seedValue(d.columns[n], values[n], n); });
      Object.assign(p, meta);
    },
    remove(id) { pages.delete(norm(id)); },
    clear(key) { Array.from(pages.values()).filter(p => p.key === key).forEach(p => pages.delete(norm(p.id))); },
    blocks: (id, list) => (list ? appendBlocks(id, list, pages.has(norm(id)) ? 'page_id' : 'block_id') : (blocks.get(norm(id)) || []).filter(b => !b.in_trash)),
    fail(f) {
      const m = f.match, test = typeof m === 'function' ? m : m instanceof RegExp ? s => m.test(s) : m ? s => s.indexOf(m) === 0 : () => true;
      faults.push(Object.assign({ times: 1 }, f, { test }));
    },
    refused: () => calls.filter(c => c.refused),
  };
}

module.exports = { notion };
