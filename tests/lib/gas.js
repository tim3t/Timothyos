// The bridge (apps-script/Code.gs) loaded in a Node vm with simulated Apps Script services. Shared by the bridge tests
// (B1), so each test holds only its data and its checks.
//
//   const { bridge } = require('./lib/gas');
//   const b = bridge({ props: { NOTION_TOKEN: 'ntn_test' }, notion: {}, fetch: (url, opts, res) => ... });
//   b.post({ action: 'tasks', day: '2026-10-06' })   the key is added; b.call(body) sends the body as it is
//   b.nx                                              the strict simulated Notion (lib/notion.js) when `notion` is given
//
// Requests to api.notion.com go to the simulated Notion; any other address goes to `fetch`, which returns a response
// (build one with its third argument, res(code, body, headers)) or undefined, which fails the test with the address.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { notion } = require('./notion');

const CODE = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
const CACHE_MAX = 100 * 1024;

function res(code, body, headers) {
  const text = typeof body === 'string' ? body : JSON.stringify(body === undefined ? {} : body);
  return { getResponseCode: () => code, getContentText: () => text, getHeaders: () => Object.assign({}, headers), getAllHeaders: () => Object.assign({}, headers),
    getContent: () => Array.from(Buffer.from(text)), getBlob: () => blob(Buffer.from(text)) };
}

function blob(buf, type) {
  const b = Buffer.from(buf);
  return { getBytes: () => Array.from(b), getDataAsString: () => b.toString('utf8'), getContentType: () => type || null, setContentType(t) { type = t; return this; } };
}

// Apps Script's date patterns (Java's SimpleDateFormat) for the ones Code.gs uses, in the given time zone.
function formatDate(d, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'long' })
    .formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' }).format(d);
  const tokens = { yyyy: parts.year, MMM: month, MM: parts.month, dd: parts.day, d: String(Number(parts.day)), HH: parts.hour, mm: parts.minute, ss: parts.second, EEEE: parts.weekday, EEE: parts.weekday.slice(0, 3) };
  return pattern.replace(/'([^']*)'|yyyy|MMM|MM|dd|d|HH|mm|ss|EEEE|EEE/g, (m, lit) => lit !== undefined ? lit : tokens[m]);
}

// The instant at which a 'yyyy-MM-dd' day starts in tz.
function parseDate(s, tz, pattern) {
  if (pattern !== 'yyyy-MM-dd' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('parseDate: unsupported ' + pattern + ' ' + s);
  const noonUtc = new Date(s + 'T12:00:00Z');
  const local = formatDate(noonUtc, tz, 'HH:mm').split(':').map(Number);
  const offsetMin = (local[0] * 60 + local[1]) - 12 * 60;
  return new Date(Date.parse(s + 'T00:00:00Z') - offsetMin * 60000);
}

function bridge(o = {}) {
  const props = Object.assign({ ACCESS_KEY: 'k'.repeat(64) }, o.props);
  Object.keys(props).forEach(k => { if (props[k] == null) delete props[k]; });
  const cache = {}, ttl = {};
  const tz = o.tz || 'America/Chicago';
  const log = [];
  const ctx = {};
  const nx = o.notion ? notion(o.notion) : null;

  function fetch(url, opts = {}) {
    if (nx && url.indexOf('https://api.notion.com/') === 0) return nx.fetch(url, opts);
    const r = o.fetch && o.fetch(url, opts, res);
    if (!r) throw new Error('gas: no simulated service answers ' + (opts.method || 'get') + ' ' + url);
    return r;
  }
  const scriptProps = { getProperty: k => (k in props ? String(props[k]) : null), setProperty: (k, v) => { props[k] = String(v); return scriptProps; },
    deleteProperty: k => { delete props[k]; return scriptProps; }, getProperties: () => Object.assign({}, props) };
  const userProps = {}, userStore = { getProperty: k => userProps[k] || null, setProperty: (k, v) => { userProps[k] = String(v); }, deleteProperty: k => { delete userProps[k]; } };
  Object.assign(ctx, {
    console: { log: (...a) => { log.push(a.join(' ')); if (o.verbose) console.log('   log:', ...a); }, error: (...a) => log.push(a.join(' ')) },
    PropertiesService: { getScriptProperties: () => scriptProps, getUserProperties: () => userStore },
    CacheService: { getScriptCache: () => ({
      get: k => (k in cache ? cache[k] : null),
      put: (k, v, s) => { v = String(v); if (v.length > CACHE_MAX) throw new Error('Argument too large: value'); cache[k] = v; ttl[k] = s; },
      remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, hasLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json', TEXT: 'text' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Session: { getScriptTimeZone: () => tz },
    Utilities: {
      getUuid: () => crypto.randomUUID(), sleep() {},
      formatDate, parseDate,
      base64Encode: b => Buffer.from(typeof b === 'string' ? b : b).toString('base64'),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')),
      newBlob: (data, type) => blob(typeof data === 'string' ? Buffer.from(data) : Buffer.from(data), type),
      gzip: b => blob(zlib.gzipSync(Buffer.from(b.getBytes())), 'application/x-gzip'),
      ungzip: b => blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),
    },
    UrlFetchApp: { fetch, fetchAll: reqs => reqs.map(r => fetch(r.url, r)) },
    CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getId: () => 'me', getTimeZone: () => tz, getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
    ScriptApp: { WeekDay: { SUNDAY: 'SUNDAY' }, getProjectTriggers: () => [], newTrigger: () => { throw new Error('gas: triggers are not simulated'); }, deleteTrigger() {}, getOAuthToken: () => 'oauth-test' },
  }, o.globals);
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx, { filename: 'Code.gs' });
  if (nx) nx.attach(ctx);

  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return {
    ctx, props, cache, ttl, nx, log, res,
    get key() { return props.ACCESS_KEY; },
    call,
    post: body => call(Object.assign({ key: props.ACCESS_KEY }, body)),
  };
}

module.exports = { bridge, res, formatDate, parseDate };
