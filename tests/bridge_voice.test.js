// AI voice in the bridge (1.30): the capability follows OPENAI_API_KEY; speak sends each paragraph to OpenAI's
// gpt-4o-mini-tts in Nova with Timothy's style line, all at once, and returns base64 MP3s; checks its input, keeps a
// monthly estimate and a daily cap, maps OpenAI's errors; setup checks the key without returning audio.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const props = {}, cache = {};
let sent = [], fail = null, headers = [];
function speech(opts) {
  headers.push(opts.headers); const body = JSON.parse(opts.payload); sent.push(body);
  if (fail) return { getResponseCode: () => fail[0], getContentText: () => JSON.stringify({ error: fail[1] }), getContent: () => [] };
  const bytes = Array.from(Buffer.from('MP3:' + body.input));
  return { getResponseCode: () => 200, getContent: () => bytes, getContentText: () => '' };
}
const fetch = (url, opts) => {
  if (url === 'https://api.openai.com/v1/audio/speech') return speech(opts);
  return { getResponseCode: () => 400, getContentText: () => '{}' };
};
let fetchAlls = 0;
const ctx = {
  console: { log: (...a) => console.log('   log:', ...a) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), base64Encode: b => Buffer.from(b).toString('base64'),
    formatDate: (d, tz, f) => f === 'yyyy-MM' ? '2026-10' : f === 'yyyy-MM-dd' ? '2026-10-23' : d.toISOString().slice(0, 16).replace('T', ' '), parseDate: s => new Date(s + 'T05:00:00Z') },
  Session: { getScriptTimeZone: () => 'America/Chicago' }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetch, fetchAll: reqs => { fetchAlls++; return reqs.map(r => fetch(r.url, r)); } },
  CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getName: () => 'me', getTimeZone: () => 'UTC', getEvents: () => [] }), getCalendarById: () => null, getAllCalendars: () => [] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
ctx.setup(); const key = props.ACCESS_KEY;
const get = p => JSON.parse(ctx.doGet({ parameter: p }).text);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
const speak = texts => post({ key, action: 'speak', texts });

// without a key: no capability, a plain refusal, and setup says how to turn it on
assert.ok(!get({ action: 'ping', key }).capabilities.includes('voice'));
assert.strictEqual(speak(['Hello.']).error, 'voice_not_configured');
assert.strictEqual(sent.length, 0);

// with the key: setup checks it once (no audio kept), then the capability is listed
props.OPENAI_API_KEY = 'sk-test';
ctx.setup();
assert.strictEqual(sent.length, 1, 'setup made one short check'); assert.strictEqual(sent[0].input, 'Bridge voice check.');
assert.ok(get({ action: 'ping', key }).capabilities.includes('voice'));

// a briefing: one MP3 per paragraph, all asked for at once, Nova with his style line
sent = []; headers = [];
const paras = ['Good morning, Captain. Friday 23 October.', 'TODAY. Four meetings, the first at 09:00.', "RECOMMENDED Pick today's priorities before 10:00."];
const r = speak(paras);
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(sent.length, 3); assert.strictEqual(fetchAlls >= 1, true, 'in parallel');
sent.forEach((b, i) => {
  assert.strictEqual(b.model, 'gpt-4o-mini-tts'); assert.strictEqual(b.voice, 'nova'); assert.strictEqual(b.response_format, 'mp3'); assert.strictEqual(b.input, paras[i]);
  assert.ok(b.instructions.startsWith('Calm, measured starship computer') && b.instructions.includes('South African accent'));
});
assert.strictEqual(headers[0].Authorization, 'Bearer sk-test');
assert.strictEqual(Buffer.from(r.clips[1], 'base64').toString(), 'MP3:' + paras[1], 'clips in order, base64');
assert.strictEqual(r.voice, 'nova');
const chars = paras.join('').length;
assert.ok(Math.abs(r.est - chars * 0.015 / 900) < 1e-5, 'estimate from characters');
assert.strictEqual(r.spend.calls, 2, 'the setup check and this one');

// input is checked: empty, too many, too long
assert.strictEqual(speak([]).error, 'bad_request');
assert.strictEqual(speak(['  ']).error, 'bad_request');
assert.strictEqual(speak(new Array(13).fill('x')).error, 'bad_request');
assert.strictEqual(speak(['x'.repeat(4001)]).error, 'bad_request');

// OpenAI's errors, mapped
fail = [401, { message: 'Incorrect API key provided' }]; assert.strictEqual(speak(['Hi.']).error, 'voice_unauthorized');
fail = [429, { message: 'You exceeded your current quota', code: 'insufficient_quota' }]; assert.strictEqual(speak(['Hi.']).error, 'voice_no_credit');
fail = [429, { message: 'Rate limit reached' }]; assert.strictEqual(speak(['Hi.']).error, 'voice_busy');
fail = [500, { message: 'oops' }]; assert.strictEqual(speak(['Hi.']).error, 'voice_busy');
fail = [400, { message: 'bad voice' }]; const e4 = speak(['Hi.']); assert.strictEqual(e4.error, 'voice_error'); assert.strictEqual(e4.detail, 'bad voice');
fail = null;

// the daily cap: 30 requests a day
const sp = JSON.parse(props.VOICE_SPEND); sp.today = 30; props.VOICE_SPEND = JSON.stringify(sp);
sent = [];
assert.strictEqual(speak(['Hi.']).error, 'voice_daily_cap'); assert.strictEqual(sent.length, 0, 'nothing sent past the cap');
sp.day = '2026-10-22'; props.VOICE_SPEND = JSON.stringify(sp);
assert.ok(speak(['Hi.']).ok, 'a new day resets the count');

console.log('ALL VOICE CHECKS PASSED');
