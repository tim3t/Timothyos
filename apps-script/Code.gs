/**
 * TimothyOS bridge, v1.10
 *
 * Runs inside your personal Google account as a web app.
 *  - Calendars: reads Work + Personal, plus your farm calendar once linked
 *    (Script Property FARM_CALENDAR_ID) and your Growth calendar once linked
 *    (Script Property GROWTH_CALENDAR_ID, bridge 1.22). Creates events you capture
 *    on Personal, the farm calendar or Growth; never on Work. Reads Google's
 *    US Holidays calendar (bridge 1.23, read-only; found on its own, or Script
 *    Property HOLIDAY_CALENDAR_ID) so holidays show beside Key Dates. Nothing
 *    about holidays is written anywhere.
 *  - Notion: reads your Master Task List for Plan Day; sets Focus Date, marks
 *    tasks done, and adds new tasks. Reads and adds Key Dates. Counts tasks
 *    finished recently (for the Bridge's Balance panel). Reads a week's
 *    finished and picked tasks, and saves your Weekly Review (one page per week).
 *    Lists saved reviews for the Review log and its trends.
 *  - Ledger: reads your YNAB plan (Script Property YNAB_TOKEN; read-only, it never
 *    writes to YNAB) and the Replicator Queue in Notion (add, reorder, mark bought).
 *  - Captain's Log: one Notion page per day, the entry in its body. Every log
 *    request must carry your authorization code (Script Property LOG_PIN: a Greek
 *    code word and four digits, like OMEGA-0000, or six digits); five wrong tries
 *    lock the log for 15 minutes, twice as long for each lockout in a row. Editing an entry rewrites only that
 *    entry's own text. Search (bridge 1.16) reads a copy of each entry's text kept
 *    in its page's Search Text field. The ASK button never sees the log; Log Ask
 *    (bridge 1.20) reads only entries Timothy picks in the open LOG, with the PIN,
 *    at most 62 entries and about 60K tokens per question.
 *  - Apiary (bridge 1.26): reads and saves the yard, hives and hive checks in 🐝 Apiary.
 *  - Ask: answers questions with Claude (key in Script Properties: ANTHROPIC_API_KEY).
 *    Claude only reads; every change it suggests waits for your tap in the app.
 *    A monthly budget pauses it (AI_BUDGET_USD, default $8).
 *    Nothing else in Notion is touched.
 *
 * The work calendar can never be written to. Nothing is ever deleted, except
 * paragraphs you remove from your own log entry when you edit it.
 * Your Notion key lives in Script Properties (NOTION_TOKEN), never in this code.
 * Setup and update steps are in README.md.
 */

// ---- Your settings ---------------------------------------------------------
var CONFIG = {
  // Your personal calendar. "primary" means the default calendar of the
  // Google account this script runs in.
  PERSONAL_CALENDAR_ID: 'primary',

  // Your work calendar, shared to this personal account. Usually your work
  // email address. Run setup() to list every calendar this account can see.
  // setup() also saves it, so future code updates keep it even if this line
  // goes back to the placeholder.
  WORK_CALENDAR_ID: 'you@your-employer.com',

  // Your Notion Master Task List (the ID is the 32 characters in its link).
  // Not a secret on its own: the bridge also needs NOTION_TOKEN, which lives in
  // Project Settings > Script Properties and never in this file.
  NOTION_TASKS_DATABASE: '6c4a440d571e49e0b4076c18d5712c1f',

  // Your Notion Key Dates database.
  NOTION_DATES_DATABASE: '8184db37aacb4d96943b2067558b92ab',

  // Your Notion Weekly Reviews database.
  NOTION_REVIEWS_DATABASE: '459bcacdc38d4bad9f58b4579fa9f4fd',

  // Your Notion Replicator Queue (things to buy once the Discretionary category allows).
  NOTION_QUEUE_DATABASE: '6f9b8c3888f74ec18a503bd197f37c8c',

  // Your Notion Captain's Log (one page per day). Its PIN is Script Property LOG_PIN.
  NOTION_LOG_DATABASE: '4c395160e1a84702a3a6861c20ddf748',

  // Your Notion Habits database (one page per day).
  NOTION_HABITS_DATABASE: '441619b34ada41d49e05bed92372589b',

  // Your Notion Library (one page per book).
  NOTION_LIBRARY_DATABASE: '47fdad1d1217402fa84731a8aa146cba',

  // Your Notion Tarot (readings, card meanings, spreads).
  NOTION_TAROT_DATABASE: '414eee50818e4ffd948e38f3923c0faf',

  // Your Notion Tarot Books: passages from two tarot books you own, one page per card per book.
  // Private to your Notion; the passages are never in this code.
  NOTION_TAROT_BOOKS_DATABASE: '29cd26305cea4270a6c40f36cbe75511',

  // Your Notion Apiary: the yard, one page per hive, one page per hive check.
  NOTION_APIARY_DATABASE: '548f88460e014b17a521dba092160da2',

  // Your Notion Inbox: notes captured to sort later (CAPTURE → NOTE), one page per note.
  NOTION_INBOX_DATABASE: '5712ada1ef2742daad5629d70bf3f4d4',

  // Your Notion Science Log: events the SCIENCE station noticed, one page per event.
  NOTION_SCIENCE_DATABASE: '497256af405747a3a9bb064759865cf6'
};
// ---------------------------------------------------------------------------

var VERSION = '1.34.0';
var NOTION_VERSION = '2025-09-03';
var TASK_STATUSES = ['⬜ To Do', '🔄 In Progress', '✅ Done', '🚫 Blocked'];
var TASK_PRIORITIES = ['🔴 High', '🟡 Medium', '🟢 Low'];
function capabilities_() {
  var props = PropertiesService.getScriptProperties();
  return ['read', 'create', 'holidays', 'science'].concat(props.getProperty('NOTION_TOKEN') ? ['tasks', 'dates', 'done', 'reviews', 'reviewlog', 'queue', 'log', 'habits', 'library', 'tarot', 'tarotbooks', 'apiary', 'schema', 'year', 'inbox', 'sciencelog'] : [], logPin_() ? ['logpin'] : [], logPin_().indexOf('-') > -1 ? ['logcode'] : [], props.getProperty('NOTION_TOKEN') && props.getProperty('LOG_SEARCH_READY') === '1' ? ['logsearch'] : [], props.getProperty('ANTHROPIC_API_KEY') ? ['ask', 'brief', 'shipsyear', 'inboxsort'] : [], props.getProperty('ANTHROPIC_API_KEY') && props.getProperty('NOTION_TOKEN') ? ['logask', 'tarotsuggest'] : [], props.getProperty('YNAB_TOKEN') ? ['ledger'] : [], props.getProperty('OPENAI_API_KEY') ? ['voice'] : []);
}
var MAX_RANGE_DAYS = 62;
var CACHE_SECONDS = 120;
var PLACEHOLDER = 'your-employer.com';
var SOURCES = [
  { area: 'work', id: workCalendarId_ },
  { area: 'personal', id: function () { return CONFIG.PERSONAL_CALENDAR_ID; } },
  { area: 'farm', id: farmCalendarId_, optional: true },   // left out until FARM_CALENDAR_ID is set
  { area: 'hobby', id: growthCalendarId_, optional: true }  // Growth; left out until GROWTH_CALENDAR_ID is set
];
// Calendars the app may add events to. Work is deliberately absent.
var WRITABLE = {
  personal: function () { return CONFIG.PERSONAL_CALENDAR_ID; },
  farm: farmCalendarId_,
  hobby: growthCalendarId_
};
/** Sources in use: optional calendars only once they're set. */
function sources_() { return SOURCES.filter(function (src) { return !src.optional || src.id(); }); }

/** Read requests. Every request must carry the access key. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var refused = keyRefusal_(p.key);
    if (refused) return json_({ ok: false, error: refused });
    if (p.action === 'logunlock' || p.action === 'logdates' || p.action === 'logday' || p.action === 'logsearch') return json_(logAction_(p));   // reads travel as GET: nothing to lose on a redirect
    if (p.action === 'ping') return json_({ ok: true, version: VERSION, capabilities: capabilities_(), calendars: calendarStatus_(), notion: notionStatus_(), ai: aiKey_() ? aiSpend_() : null });
    if (p.action === 'batch') return json_(batch_(p.calls));
    return json_(read_(p) || { ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_(readError_(err));
  }
}

/** The everyday reads, by action. Null for anything else. */
var BATCH_READS = ['aispend', 'events', 'tasks', 'dates', 'done', 'week', 'reviews', 'ledger', 'habits', 'library', 'tarot', 'apiary', 'year', 'inbox', 'sciencefeeds', 'sciencelog'];
function read_(p) {
  if (p.action === 'aispend') return { ok: true, version: VERSION, ai: aiKey_() ? aiSpend_() : null, log: aiKey_() ? aiLog_() : [] };
  if (p.action === 'events') return events_(Number(p.from), Number(p.to));
  if (p.action === 'tasks') return tasks_(String(p.day || ''));
  if (p.action === 'dates') return dates_();
  if (p.action === 'holidays') return holidays_(String(p.from || ''), String(p.to || ''));
  if (p.action === 'done') return done_(p.days);
  if (p.action === 'week') return week_(String(p.week || ''), String(p.from || ''), String(p.to || ''));
  if (p.action === 'reviews') return reviews_(p.limit);
  if (p.action === 'ledger') return ledger_(p.fresh === '1' || p.fresh === 1 || p.fresh === true);
  if (p.action === 'habits') return habits_(p.from, p.to);
  if (p.action === 'library') return library_();
  if (p.action === 'tarot') return tarot_(p.from, p.to);
  if (p.action === 'tarotbooks') return tarotBooks_();
  if (p.action === 'apiary') return apiary_();
  if (p.action === 'inbox') return inbox_();
  if (p.action === 'sky') return sky_(p.lat, p.lon);
  if (p.action === 'sciencefeeds') return sciFeeds_(p.lat, p.lon);
  if (p.action === 'sciencelog') return scienceLog_(String(p.from || ''), String(p.to || ''));
  if (p.action === 'year') return year_(String(p.from || ''), String(p.to || ''));
  if (p.action === 'schema') return schema_(p.fresh === '1' || p.fresh === 1 || p.fresh === true);
  if (p.action === 'tarotbook') return tarotBook_(String(p.card || ''), p.fresh === '1' || p.fresh === 1 || p.fresh === true);
  return null;
}
/** Another request held the script lock past its wait (LockService throws "Lock timeout"): the app retries "busy" quietly. */
function lockBusy_(err) { return /lock timeout|another process was holding the lock/i.test(String((err && err.message) || err)); }
function readError_(err) {
  if (err && err.notion) return { ok: false, error: err.notion, detail: err.message };
  if (lockBusy_(err)) return { ok: false, error: 'busy' };
  return { ok: false, error: 'server_error', detail: String((err && err.message) || err) };
}

/**
 * Several reads in one request (calls = JSON list of {action, ...}). The app bundles the reads it
 * needs at the same moment, such as on returning to the app, so Google runs one execution instead
 * of five: fewer chances for its result page to go missing. Each read answers on its own; one
 * failing doesn't stop the others.
 */
function batch_(raw) {
  var calls;
  try { calls = JSON.parse(String(raw || '')); } catch (x) { return { ok: false, error: 'bad_request' }; }
  if (!Array.isArray(calls) || !calls.length || calls.length > 8) return { ok: false, error: 'bad_request' };
  return { ok: true, version: VERSION, results: calls.map(function (c) {
    if (!c || BATCH_READS.indexOf(c.action) === -1) return { ok: false, error: 'bad_request' };
    try { return read_(c); } catch (err) { return readError_(err); }
  }) };
}

/** Write requests (Capture). The body is JSON: { key, action: "create", item }. */
function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    var refusedP = keyRefusal_(body.key);
    if (refusedP) return json_({ ok: false, error: refusedP });
    if (body.action === 'create') return json_(create_(body.item || {}));
    if (body.action === 'focus') return json_(setFocus_(body.id, body.day));
    if (body.action === 'status') return json_(setStatus_(body.id, body.status));
    if (body.action === 'addtask') return json_(addTask_(body.task || {}));
    if (body.action === 'adddate') return json_(addDate_(body.date || {}));
    if (body.action === 'savereview') return json_(saveReview_(body.review || {}));
    if (body.action === 'ask') return json_(ask_(body));
    if (body.action === 'aicontinue') return json_(aiContinue_());
    if (body.action === 'aispendset') return json_(aiSpendSet_(body.usd));
    if (body.action === 'queueadd') return json_(queueAdd_(body.item || {}));
    if (body.action === 'inboxadd') return json_(inboxAdd_(body.note || {}));
    if (body.action === 'sciencelogadd') return json_(scienceLogAdd_(body.events));
    if (body.action === 'sciencestar') return json_(scienceStar_(String(body.id || ''), body.starred === true));
    if (body.action === 'inboxset') return json_(inboxSet_(String(body.id || ''), String(body.status || ''), body.as === null || body.as === undefined ? null : String(body.as)));
    if (body.action === 'inboxremove') return json_(inboxRemove_(String(body.id || '')));
    if (body.action === 'queueorder') return json_(queueOrder_(body.ids));
    if (body.action === 'habitset') return json_(habitSet_(body.day));
    if (body.action === 'booksave') return json_(bookSave_(body.book));
    if (body.action === 'bookremove') return json_(bookRemove_(body.id));
    if (body.action === 'tarotsave') return json_(tarotSave_(body.reading));
    if (body.action === 'tarotmeaning') return json_(tarotMeaning_(body.card, body.text));
    if (body.action === 'tarotspread') return json_(tarotSpread_(body.spread));
    if (body.action === 'tarotremove') return json_(tarotRemove_(body.id));
    if (body.action === 'tarotbookimport') return json_(tarotBookImport_());
    if (body.action === 'tarotsuggest') return json_(tarotSuggest_(body));
    if (body.action === 'apiarysave') return json_(apiarySave_(body.item));
    if (body.action === 'apiaryremove') return json_(apiaryRemove_(body.id));
    if (body.action === 'speak') return json_(speak_(body));
    if (/^log/.test(String(body.action || ''))) return json_(logAction_(body));
    if (body.action === 'queuebought') return json_(queueBought_(String(body.id || ''), body.day === null ? null : String(body.day || '')));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    if (err && err.notion) return json_({ ok: false, error: err.notion, detail: err.message });
    if (lockBusy_(err)) return json_({ ok: false, error: 'busy' });
    return json_({ ok: false, error: 'server_error', detail: String((err && err.message) || err) });
  }
}

/**
 * Run this from the editor (select "setup", then Run) after first install
 * and after every code update. Creates your access key if there is none,
 * saves your work calendar ID, and lists every calendar this account can see.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ACCESS_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ACCESS_KEY', key);
  }
  if (CONFIG.WORK_CALENDAR_ID && CONFIG.WORK_CALENDAR_ID.indexOf(PLACEHOLDER) === -1) {
    props.setProperty('WORK_CALENDAR_ID', CONFIG.WORK_CALENDAR_ID);
  }
  console.log('Calendars this account can see (name -> ID):');
  CalendarApp.getAllCalendars().forEach(function (c) {
    console.log('  ' + c.getName() + '  ->  ' + c.getId());
  });
  calendarStatus_().forEach(function (s) {
    console.log('TimothyOS ' + s.area + ' calendar: ' + (s.ok ? 'OK (' + s.name + ')' : 'PROBLEM: ' + s.error + (s.area === 'farm' ? '. Check FARM_CALENDAR_ID in Script Properties against the list above' : s.area === 'hobby' ? '. Check GROWTH_CALENDAR_ID in Script Properties against the list above' : '')));
  });
  if (!farmCalendarId_()) console.log('TimothyOS farm calendar: OFF. Add FARM_CALENDAR_ID in Script Properties (the ID from the list above) to link it');
  var hol = holidayCalendar_();
  console.log('TimothyOS holidays: ' + (hol ? 'OK (' + hol.getName() + ')' : 'OFF. Subscribe to a holidays calendar in Google Calendar, or add HOLIDAY_CALENDAR_ID in Script Properties'));
  if (!growthCalendarId_()) console.log('TimothyOS Growth calendar: OFF. Add GROWTH_CALENDAR_ID in Script Properties (the ID from the list above) to link it');
  var n = notionStatus_();
  console.log('Notion tasks: ' + (n.ok ? 'OK (' + n.name + ', ' + n.open + ' open tasks)' : 'NOT READY: ' + n.error + (n.help ? '. ' + n.help : '')));
  var kd = n.dates || {};
  console.log('Notion key dates: ' + (kd.ok ? 'OK (' + kd.name + ', ' + kd.count + ' dates)' : 'NOT READY: ' + (kd.error || n.error) + (kd.help ? '. ' + kd.help : '')));
  var wr = n.reviews || {};
  console.log('Notion weekly reviews: ' + (wr.ok ? 'OK (' + wr.name + ', ' + wr.count + ' reviews)' : 'NOT READY: ' + (wr.error || n.error) + (wr.help ? '. ' + wr.help : '')));
  var lg = ledgerStatus_();
  console.log('Ledger (YNAB): ' + lg.ynab);
  console.log('Notion replicator queue: ' + lg.queue);
  console.log("Captain's Log: " + logStatus_());
  console.log("Captain's Log search: " + logSearchSetup_());
  console.log('Notion habits: ' + habitsStatus_());
  console.log('Notion library: ' + libraryStatus_());
  console.log('Notion tarot: ' + tarotStatus_());
  console.log('Notion tarot books: ' + tarotBooksStatus_());
  console.log('Notion apiary: ' + apiaryStatus_());
  console.log('Notion inbox: ' + inboxStatus_());
  console.log('Notion science log: ' + scienceStatus_());
  console.log('SCIENCE feeds: ' + sciStatus_());
  if (PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN')) {
    try {
      var sc = schema_(true), bad = sc.dbs.filter(function (d) { return d.missing.length || d.wrong.length; }), conn = sc.dbs.filter(function (d) { return !d.error; });
      console.log('Notion columns: ' + (bad.length ? 'PROBLEM: ' + bad.map(schemaLine_).join(' | ') : 'OK (' + conn.length + ' connected ' + (conn.length === 1 ? 'database has' : 'databases have') + ' every column the bridge uses)'));
    } catch (e) { console.log('Notion columns: could not check (' + e.message + ')'); }
  }
  var ai = aiKey_() ? aiSpend_() : null;
  if (voiceKey_()) {
    try {
      var vt = speak_({ texts: ['Bridge voice check.'] }, true);
      console.log('AI voice (OpenAI): ' + (vt.ok ? 'OK (' + VOICE.NAME + ', ' + VOICE.MODEL + '). About $' + vt.spend.usd.toFixed(2) + ' this month, estimated' : 'PROBLEM: ' + vt.error + (vt.detail ? ' (' + vt.detail + ')' : '')));
    } catch (e) { console.log('AI voice (OpenAI): PROBLEM: ' + e.message); }
  } else console.log('AI voice (OpenAI): OFF. Add OPENAI_API_KEY in Script Properties to read the briefing in Nova');
  console.log('Ask Claude: ' + (ai ? 'OK (questions ' + aiFast_() + ', THINK HARDER ' + AI.DEEP + '). This month $' + ai.usd.toFixed(2) + ', reminder at $' + ai.budget.toFixed(2) + (ai.cont ? ' (continued)' : '') + ' (' + ai.calls + ' calls)' : 'OFF. Add ANTHROPIC_API_KEY in Script Properties to turn it on'));
  console.log('Bridge version ' + VERSION + '. Can write to: ' + Object.keys(WRITABLE).filter(function (k) { return WRITABLE[k](); }).join(', ') + (n.ok ? ', Notion tasks' : '') + '.');
  console.log('ACCESS KEY (paste into the iPad app): ' + key);
}

/** Run this only if your access key leaks. The iPad app will need the new key. */
function rotateKey() {
  PropertiesService.getScriptProperties().deleteProperty('ACCESS_KEY');
  setup();
}

/**
 * Run this from the editor (select "compareModels", then Run) to see Ask on Sonnet 5.5
 * (low effort, everyday), Opus 5.5 (medium, THINK HARDER) and Haiku 5.5 (low) side by
 * side with your own calendar and tasks. Five questions, three setups: roughly 30 to 70
 * cents in total, counted in this month's Ask spend. Nothing is changed: proposals are
 * only listed. Results stay in this log.
 */
function compareModels() {
  if (!aiKey_()) { console.log('Add ANTHROPIC_API_KEY first.'); return; }
  var tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'EEEE yyyy-MM-dd HH:mm');
  var context = 'TODAY: ' + today + ' (' + tz + ')\nThis is a model comparison run from the script editor: the app snapshot is not included, so use your tools to look things up.';
  var questions = [
    'What should I do first today?',
    "What's on my calendar tomorrow, and is anything back to back?",
    'Which of my open tasks are overdue?',
    'Remind me Friday at 3pm to call the vet.',
    'How busy is my next week compared with this one?'
  ];
  var setups = [{ model: 'claude-sonnet-5-5', effort: 'low' }, { model: 'claude-opus-5-5', effort: 'medium' }, { model: 'claude-haiku-5-5', effort: 'low' }];
  var totals = setups.map(function () { return { usd: 0, ms: 0, ok: 0 }; });
  questions.forEach(function (q, qi) {
    console.log('\n=== Q' + (qi + 1) + ': ' + q);
    setups.forEach(function (st, si) {
      var t0 = Date.now(), r;
      try { r = ask_({ cid: 'cmp-' + Utilities.getUuid().slice(0, 18), mode: 'fast', context: context, messages: [{ role: 'user', text: q }] }, st); }
      catch (e) { r = { ok: false, error: String(e.message || e) }; }
      var ms = Date.now() - t0, label = st.model.replace('claude-', '') + (st.effort ? ' (' + st.effort + ')' : '');
      if (!r.ok) { console.log('--- ' + label + ': ERROR ' + r.error + (r.detail ? ' ' + r.detail : '')); return; }
      totals[si].usd += r.costExact || 0; totals[si].ms += ms; totals[si].ok++;
      console.log('--- ' + label + ' · ' + (ms / 1000).toFixed(1) + ' s · $' + (r.costExact || 0).toFixed(5) + ' · ' + r.steps + ' step(s) · ' + r.stop +
        (r.proposals.length ? ' · proposes: ' + r.proposals.map(function (x) { return x.kind; }).join(', ') : '') + '\n' + r.reply);
    });
  });
  console.log('\n=== TOTALS');
  setups.forEach(function (st, si) {
    var t = totals[si];
    console.log(st.model + (st.effort ? ' (' + st.effort + ')' : '') + ': ' + t.ok + '/' + questions.length + ' answered · $' + t.usd.toFixed(4) + ' · avg ' + (t.ok ? (t.ms / t.ok / 1000).toFixed(1) : '-') + ' s');
  });
  console.log('Everyday Ask is using: ' + aiFast_() + '. To switch back to Haiku 4.5, add Script Property AI_FAST_MODEL = claude-haiku-4-5.');
}

// ---- Internals -------------------------------------------------------------

/**
 * null when the key matches; otherwise why not. The three refusals are told apart so the
 * app can retry the two that aren't your fault:
 *  - no_key: the request arrived without its details (Google can turn a POST into an
 *    empty GET on a redirect), so the key never reached us;
 *  - key_unreadable: Google's settings store answered empty for a moment;
 *  - unauthorized: a key arrived and it's the wrong one.
 */
function keyRefusal_(given) {
  if (typeof given !== 'string' || !given) return 'no_key';
  for (var i = 0; i < 3; i++) {
    var key = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
    if (key) return given === key ? null : 'unauthorized';
    if (i < 2) Utilities.sleep(300);
  }
  return 'key_unreadable';
}
function keyMatches_(given) { return keyRefusal_(given) === null; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function workCalendarId_() {
  if (CONFIG.WORK_CALENDAR_ID && CONFIG.WORK_CALENDAR_ID.indexOf(PLACEHOLDER) === -1) return CONFIG.WORK_CALENDAR_ID;
  return PropertiesService.getScriptProperties().getProperty('WORK_CALENDAR_ID') || '';
}

/** The farm calendar's ID, from Script Properties (so its name never sits in this code). Empty until linked. */
/* ---------- Holidays (bridge 1.23): Google's holidays calendar, read-only ---------- */
/** The holidays calendar: HOLIDAY_CALENDAR_ID if set, else the subscribed Google holidays
 *  calendar (its ID ends in #holiday@group.v.calendar.google.com), US first. Remembered 6 hours. */
function holidayCalendar_() {
  var id = String(PropertiesService.getScriptProperties().getProperty('HOLIDAY_CALENDAR_ID') || '').trim();
  var cache = CacheService.getScriptCache();
  if (!id) id = cache.get('holcal') || '';
  if (!id) {
    var all = CalendarApp.getAllCalendars().filter(function (c) { return /#holiday@group\.v\.calendar\.google\.com$/.test(c.getId()); });
    var us = all.filter(function (c) { return /usa|united.states|\.us#/i.test(c.getId() + ' ' + c.getName()); })[0] || all[0];
    if (!us) return null;
    id = us.getId();
    cache.put('holcal', id, 21600);
  }
  return CalendarApp.getCalendarById(id);
}
/** Holidays between two dates (yyyy-MM-dd, up to about 14 months): [{ date, title }]. All-day only. */
function holidays_(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { ok: false, error: 'bad_range' };
  var tz = Session.getScriptTimeZone(), a = Utilities.parseDate(from, tz, 'yyyy-MM-dd'), b = Utilities.parseDate(to, tz, 'yyyy-MM-dd');
  if ((b - a) / 86400000 > 430) return { ok: false, error: 'range_too_long' };
  var cache = CacheService.getScriptCache(), key = 'hol:' + VERSION + ':' + from + ':' + to, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var cal = holidayCalendar_();
  if (!cal) return { ok: true, version: VERSION, calendar: null, holidays: [] };
  var seen = {}, out = [];
  cal.getEvents(a, new Date(b.getTime() + 86400000)).forEach(function (ev) {
    if (!ev.isAllDayEvent()) return;
    var d = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd'), t = String(ev.getTitle() || '').trim();
    if (!t || seen[d + t]) return;
    seen[d + t] = 1; out.push({ date: d, title: t });
  });
  out.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  var res = { ok: true, version: VERSION, calendar: cal.getName(), holidays: out };
  try { cache.put(key, JSON.stringify(res), 21600); } catch (e) { /* too large to cache; fine */ }
  return res;
}
/** The Growth calendar's ID (area 'hobby' in the app, shown as GROWTH), from Script Properties. Empty until linked. */
function growthCalendarId_() {
  return String(PropertiesService.getScriptProperties().getProperty('GROWTH_CALENDAR_ID') || '').trim();
}
function farmCalendarId_() {
  return String(PropertiesService.getScriptProperties().getProperty('FARM_CALENDAR_ID') || '').trim();
}

function openCalendar_(id) {
  if (!id || id.indexOf(PLACEHOLDER) > -1) return { cal: null, error: 'not_configured' };
  var cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  return cal ? { cal: cal } : { cal: null, error: 'not_found' };
}

function calendarStatus_() {
  return sources_().map(function (src) {
    var o = openCalendar_(src.id());
    return o.cal ? { area: src.area, ok: true, name: o.cal.getName() } : { area: src.area, ok: false, error: o.error };
  });
}

/** One event in the shape the app expects. */
function toItem_(ev, area, tz) {
  var title = ev.getTitle();
  var item = {
    id: area + ':' + ev.getId() + ':' + ev.getStartTime().getTime(),
    area: area,
    title: title || 'Busy',
    busy: !title,
    allDay: ev.isAllDayEvent(),
    location: ev.getLocation() || ''
  };
  if (item.allDay) {
    item.start = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
    item.end = Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd');
  } else {
    item.start = ev.getStartTime().toISOString();
    item.end = ev.getEndTime().toISOString();
  }
  return item;
}

function events_(from, to) {
  if (!isFinite(from) || !isFinite(to) || to <= from) return { ok: false, error: 'bad_range' };
  if ((to - from) / 86400000 > MAX_RANGE_DAYS) return { ok: false, error: 'range_too_long' };

  var cache = CacheService.getScriptCache();
  var cacheKey = 'ev:' + VERSION + ':' + (cache.get('gen') || '0') + ':' + from + ':' + to;
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  var start = new Date(from), end = new Date(to);
  var calendars = [], events = [];
  sources_().forEach(function (src) {
    var o = openCalendar_(src.id());
    if (!o.cal) { calendars.push({ area: src.area, ok: false, error: o.error }); return; }
    var tz = o.cal.getTimeZone();
    calendars.push({ area: src.area, ok: true, name: o.cal.getName() });
    o.cal.getEvents(start, end).forEach(function (ev) {
      if (src.area !== 'work' && declined_(ev)) return;
      events.push(toItem_(ev, src.area, tz));
    });
  });

  var out = { ok: true, version: VERSION, capabilities: capabilities_(), generated: new Date().toISOString(), calendars: calendars, events: events };
  try { cache.put(cacheKey, JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* too large to cache; fine */ }
  return out;
}

/**
 * Create one event. item: { cid, area, title, allDay, start, end }
 *   cid    unique ID from the app, so a resent capture never makes a duplicate
 *   timed  start/end are ISO timestamps
 *   allDay start/end are yyyy-MM-dd dates (end is the day after)
 */
function create_(item) {
  if (!Object.prototype.hasOwnProperty.call(WRITABLE, item.area)) return { ok: false, error: 'not_writable' };
  var title = String(item.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(item.cid || ''))) return { ok: false, error: 'bad_request' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache();
    var seen = cache.get('cid:' + item.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }

    var o = openCalendar_(WRITABLE[item.area]());
    if (!o.cal) return { ok: false, error: o.error };
    var ev, now = Date.now();
    if (item.allDay) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.start || ''))) return { ok: false, error: 'bad_time' };
      var day = Utilities.parseDate(item.start, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (Math.abs(day.getTime() - now) > 400 * 86400000) return { ok: false, error: 'bad_time' };
      ev = o.cal.createAllDayEvent(title, day);
    } else {
      var s = new Date(item.start), e = new Date(item.end);
      if (!isFinite(s.getTime()) || !isFinite(e.getTime()) || e <= s || e - s > 86400000) return { ok: false, error: 'bad_time' };
      if (s.getTime() < now - 2 * 86400000 || s.getTime() > now + 400 * 86400000) return { ok: false, error: 'bad_time' };
      ev = o.cal.createEvent(title, s, e);
    }
    try { ev.setDescription('Added from TimothyOS'); ev.setTag('tosCid', item.cid); } catch (x) { /* optional */ }

    var out = { ok: true, version: VERSION, event: toItem_(ev, item.area, o.cal.getTimeZone()) };
    cache.put('cid:' + item.cid, JSON.stringify(out), 21600);   // remember for 6 hours
    cache.put('gen', String(now), 21600);                         // fresh reads include the new event
    return out;
  } finally {
    lock.releaseLock();
  }
}

function declined_(ev) {
  try { return ev.getMyStatus() === CalendarApp.GuestStatus.NO; } catch (e) { return false; }
}

// ---- Notion: Master Task List ---------------------------------------------

function notion_(method, path, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) { var e0 = new Error('No NOTION_TOKEN in Script Properties'); e0.notion = 'notion_not_configured'; throw e0; }
  var opts = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION } };
  if (payload) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch('https://api.notion.com/v1' + path, opts);
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  if (code >= 300) {
    var e = new Error((body && body.message) || ('Notion HTTP ' + code));
    e.notion = code === 401 ? 'notion_unauthorized' : code === 404 ? 'notion_not_shared' : code === 429 ? 'notion_busy' : 'notion_error';
    throw e;
  }
  return body;
}

/** A database's data source ID, looked up once and remembered. */
function sourceFor_(dbIdRaw, memo) {
  var props = PropertiesService.getScriptProperties();
  var dbId = String(dbIdRaw || '').replace(/-/g, '');
  var known = props.getProperty(memo);
  if (known && known.indexOf(dbId + ':') === 0) return known.split(':')[1];
  var db = notion_('get', '/databases/' + dbId);
  var ds = db.data_sources && db.data_sources[0] && db.data_sources[0].id;
  if (!ds) { var e = new Error('That database has no data source'); e.notion = 'notion_error'; throw e; }
  props.setProperty(memo, dbId + ':' + ds);
  return ds;
}
function tasksSource_() { return sourceFor_(CONFIG.NOTION_TASKS_DATABASE, 'NOTION_TASKS_SOURCE'); }
function datesSource_() { return sourceFor_(CONFIG.NOTION_DATES_DATABASE, 'NOTION_DATES_SOURCE'); }
function reviewsSource_() { return sourceFor_(CONFIG.NOTION_REVIEWS_DATABASE, 'NOTION_REVIEWS_SOURCE'); }

function notionStatus_() {
  if (!PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN')) {
    return { ok: false, error: 'not_configured', help: 'Add NOTION_TOKEN in Project Settings > Script Properties' };
  }
  try {
    var ds = tasksSource_();
    var src = notion_('get', '/data_sources/' + ds);
    var open = queryAll_(ds, { property: 'Status', select: { does_not_equal: '✅ Done' } }, 1).length;
    return { ok: true, name: plain_(src.title), open: open, dates: datesStatus_(), reviews: reviewsStatus_() };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to the Master Task List (... > Connections)' : String(e.message), dates: datesStatus_(), reviews: reviewsStatus_() };
  }
}
function datesStatus_() {
  try {
    var ds = datesSource_();
    var src = notion_('get', '/data_sources/' + ds);
    return { ok: true, name: plain_(src.title), count: queryAll_(ds, null, 1).length };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to Key Dates (... > Connections)' : String(e.message) };
  }
}

function reviewsStatus_() {
  try {
    var ds = reviewsSource_();
    var src = notion_('get', '/data_sources/' + ds);
    return { ok: true, name: plain_(src.title), count: queryAll_(ds, null, 1).length };
  } catch (e) {
    return { ok: false, error: e.notion || 'notion_error', help: e.notion === 'notion_not_shared' ? 'Connect the TimothyOS integration to Weekly Reviews (... > Connections)' : String(e.message) };
  }
}

function plain_(rich) { return (rich || []).map(function (r) { return r.plain_text || ''; }).join(''); }
function sel_(prop) { return prop && prop.select ? prop.select.name : null; }
function day_(prop) { return prop && prop.date && prop.date.start ? prop.date.start.slice(0, 10) : null; }

function toTask_(pg) {
  var p = pg.properties || {};
  return {
    id: pg.id, url: pg.url,
    title: plain_(p.Task && p.Task.title) || 'Untitled',
    status: sel_(p.Status), priority: sel_(p.Priority), area: sel_(p['Life Area']),
    due: day_(p['Due Date']), focus: day_(p['Focus Date'])
  };
}

/** Several queries on one data source, their first pages fetched in parallel (UrlFetchApp.fetchAll);
    any further pages follow one by one. Returns one result list per query. */
function queryFirstPages_(ds, queries) {
  if (typeof UrlFetchApp.fetchAll !== 'function') return queries.map(function (q) { return queryAll_(ds, q.filter, q.maxPages || 1, q.sorts); });
  var token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  if (!token) { var e0 = new Error('No NOTION_TOKEN in Script Properties'); e0.notion = 'notion_not_configured'; throw e0; }
  var bodies = queries.map(function (q) { var b = { page_size: 100 }; if (q.filter) b.filter = q.filter; if (q.sorts) b.sorts = q.sorts; return b; });
  var res = UrlFetchApp.fetchAll(bodies.map(function (b) {
    return { url: 'https://api.notion.com/v1/data_sources/' + ds + '/query', method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION }, payload: JSON.stringify(b) };
  }));
  return res.map(function (r, i) {
    var code = r.getResponseCode(), body = {};
    try { body = JSON.parse(r.getContentText() || '{}'); } catch (x) { body = {}; }
    if (code >= 300) {
      if (code === 429) return queryAll_(ds, queries[i].filter, queries[i].maxPages || 1, queries[i].sorts);   // asked to slow down: this one alone, the usual way
      var e = new Error((body && body.message) || ('Notion HTTP ' + code));
      e.notion = code === 401 ? 'notion_unauthorized' : code === 404 ? 'notion_not_shared' : 'notion_error';
      throw e;
    }
    var out = body.results || [], cursor = body.next_cursor;
    for (var pg = 1; body.has_more && pg < (queries[i].maxPages || 1); pg++) {
      var more = { page_size: 100, start_cursor: cursor }; if (queries[i].filter) more.filter = queries[i].filter; if (queries[i].sorts) more.sorts = queries[i].sorts;
      body = notion_('post', '/data_sources/' + ds + '/query', more);
      out = out.concat(body.results || []); cursor = body.next_cursor;
    }
    return out;
  });
}

/** Query with pagination; maxPages x 100 rows at most. */
function queryAll_(ds, filter, maxPages, sorts) {
  var out = [], cursor = null;
  for (var i = 0; i < (maxPages || 3); i++) {
    var body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;
    if (cursor) body.start_cursor = cursor;
    var r = notion_('post', '/data_sources/' + ds + '/query', body);
    out = out.concat(r.results || []);
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

/* ---------- Notion schema check (1.31) ----------
   Every column the bridge reads or writes, by database, with its Notion type. A renamed column or a changed type used
   to make saves fail vaguely; schema_ reads each connected database's columns (read-only, never changes Notion) and
   names what's missing or of the wrong type. Keep this list in step with the code when a column is added. */
function schemaSpec_() {
  var t = function (names, type) { return names.map(function (n) { return [n, type]; }); };
  var vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  return [
    { key: 'tasks', name: 'Master Task List', src: tasksSource_, need: [['Task', 'title'], ['Status', 'select'], ['Priority', 'select'], ['Life Area', 'select'], ['Due Date', 'date'], ['Focus Date', 'date']] },
    { key: 'dates', name: 'Key Dates', src: datesSource_, need: [['Name', 'title'], ['Date', 'date'], ['Life Area', 'select'], ['Type', 'select'], ['Repeats Yearly', 'checkbox'], ['Notes', 'rich_text']] },
    { key: 'reviews', name: 'Weekly Reviews', src: reviewsSource_, need: [['Week', 'title'], ['Week Start', 'date']].concat(t(vals(REVIEW_TEXT), 'rich_text'), t(vals(REVIEW_NUM), 'number')) },
    { key: 'queue', name: 'Replicator Queue', src: queueSource_, need: [['Name', 'title'], ['Cost', 'number'], ['Priority', 'number'], ['Note', 'rich_text'], ['Link', 'url'], ['Bought', 'date']] },
    { key: 'log', name: "Captain's Log", src: logSource_, need: [['Name', 'title'], ['Date', 'date'], ['Source', 'select']].concat(logSearchReady_() ? [[LOG_SEARCH_PROP, 'rich_text']] : []) },
    { key: 'habits', name: 'Habits', src: habitsSource_, need: [['Name', 'title'], ['Date', 'date'], ['Meditated', 'checkbox'], ['Evening Walk', 'checkbox'], ['Water (L)', 'number'], ['Debit Card', 'select']] },
    { key: 'library', name: 'Library', src: librarySource_, need: [['Title', 'title'], ['Author', 'rich_text'], ['Status', 'select'], ['Started', 'date'], ['Finished', 'date'], ['Rating', 'number'], ['Notes', 'rich_text'], ['Cover', 'url'], ['Open Library', 'url'], ['Published', 'number']] },
    { key: 'tarot', name: 'Tarot', src: tarotSource_, need: [['Title', 'title'], ['Date', 'date'], ['Kind', 'select'], ['Weekly', 'checkbox'], ['Spread', 'rich_text'], ['Cards', 'rich_text'], ['Interpretation', 'rich_text'], ['Card', 'rich_text'], ['Data', 'rich_text']] },
    { key: 'tarotbooks', name: 'Tarot Books', src: tarotBooksSource_, need: [['Title', 'title'], ['Card', 'rich_text'], ['Book', 'select'], ['Source', 'rich_text'], ['Order', 'number']] },
    { key: 'apiary', name: 'Apiary', src: apiarySource_, need: [['Name', 'title'], ['Kind', 'select'], ['Date', 'date'], ['Hive', 'relation'], ['Mites (%)', 'number'], ['Honey (lb)', 'number'], ['Data', 'rich_text']].concat(t(vals(APIARY_TEXT), 'rich_text')) },
    { key: 'inbox', name: 'Inbox', src: inboxSource_, need: [['Note', 'title'], ['Captured', 'date'], ['Status', 'select'], ['Sorted As', 'select']] },
    { key: 'science', name: 'Science Log', src: scienceSource_, need: [['Event', 'title'], ['When', 'date'], ['Department', 'select'], ['Kind', 'select'], ['Detail', 'rich_text'], ['Value', 'number'], ['Starred', 'checkbox'], ['Key', 'rich_text']] }
  ];
}
var SCHEMA_TYPE = { title: 'title', rich_text: 'text', select: 'select', date: 'date', number: 'number', checkbox: 'checkbox', url: 'URL', relation: 'relation' };
function schemaLine_(d) {
  return d.name + ': ' + d.missing.map(function (m) { return '"' + m.name + '" (' + (SCHEMA_TYPE[m.type] || m.type) + ') not found'; })
    .concat(d.wrong.map(function (w) { return '"' + w.name + '" is ' + (SCHEMA_TYPE[w.got] || w.got) + ', needs ' + (SCHEMA_TYPE[w.want] || w.want); })).join(', ');
}
/** Each database: { key, name, missing[{name, type}], wrong[{name, want, got}] } or { key, name, error } when not connected. Cached 6 h. */
function schema_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get('schema'); if (hit) return JSON.parse(hit); }
  if (!PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN')) return { ok: false, error: 'notion_not_configured' };
  var spec = schemaSpec_(), out = [];
  spec.forEach(function (d) {
    var row = { key: d.key, name: d.name, missing: [], wrong: [] };
    try {
      var props = notion_('get', '/data_sources/' + d.src()).properties || {};
      d.need.forEach(function (n) {
        var have = props[n[0]];
        if (!have) row.missing.push({ name: n[0], type: n[1] });
        else if (have.type !== n[1]) row.wrong.push({ name: n[0], want: n[1], got: have.type });
      });
    } catch (e) { row.error = e.notion || 'notion_error'; }
    out.push(row);
  });
  var res = { ok: true, version: VERSION, at: new Date().toISOString(), dbs: out };
  cache.put('schema', JSON.stringify(res), 21600);
  return res;
}

/** A select field's choices, read from the database so new options appear automatically. */
function selectOptions_(ds, field) {
  var cache = CacheService.getScriptCache(), key = 'opts:' + ds + ':' + field, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var src = notion_('get', '/data_sources/' + ds);
  var prop = src.properties && src.properties[field];
  var names = prop && prop.select ? prop.select.options.map(function (o) { return o.name; }) : [];
  cache.put(key, JSON.stringify(names), 21600);
  return names;
}
function areaOptions_(ds) { return selectOptions_(ds, 'Life Area'); }

/** Plan Day data for one day: today's picks plus every open task. */
function tasks_(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache();
  var key = 'tasks:' + (cache.get('tgen') || '0') + ':' + day;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_();
  // Both lists are asked for at once (bridge 1.18): about half the wait of one after the other.
  var both = queryFirstPages_(ds, [
    { filter: { property: 'Focus Date', date: { equals: day } } },
    { filter: { property: 'Status', select: { does_not_equal: '✅ Done' } }, sorts: [{ property: 'Due Date', direction: 'ascending' }], maxPages: 3 }]);
  var focus = both[0].map(toTask_), open = both[1].map(toTask_);
  var out = { ok: true, version: VERSION, day: day, focus: focus, open: open, areas: areaOptions_(ds), priorities: TASK_PRIORITIES };
  try { cache.put(key, JSON.stringify(out), 60); } catch (e) { /* too large to cache */ }
  return out;
}

/**
 * Balance: tasks marked Done in the last few days, with their Life Area only
 * (no titles). Notion has no "completed on" field, so each page's last edit
 * stands in for the day it was finished.
 */
function done_(days) {
  days = Math.max(1, Math.min(60, Math.floor(Number(days)) || 30));
  var cache = CacheService.getScriptCache();
  var key = 'done:' + (cache.get('tgen') || '0') + ':' + days;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_();
  var since = new Date(Date.now() - days * 86400000).toISOString();
  var done = queryAll_(ds, { and: [
    { property: 'Status', select: { equals: '✅ Done' } },
    { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } }
  ] }, 3).map(function (pg) {
    return { area: sel_((pg.properties || {})['Life Area']), at: pg.last_edited_time || null };
  });
  var out = { ok: true, version: VERSION, days: days, done: done };
  try { cache.put(key, JSON.stringify(out), 300); } catch (e) { /* too large to cache */ }
  return out;
}

/**
 * ASTROMETRICS (app 2.40): a year's finished tasks (Life Area and last edit only, no titles; the last edit stands
 * in for the day it was finished, as in done_) and Replicator Queue items bought (day and cost only). from and to
 * are local midnights (ISO), at most 400 days apart. Read-only; each part reports its own error.
 */
function year_(from, to) {
  if (!ISO.test(from) || !ISO.test(to) || !(Date.parse(to) > Date.parse(from)) || Date.parse(to) - Date.parse(from) > 400 * 86400000) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), key = 'year:' + (cache.get('tgen') || '0') + ':' + from + ':' + to, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = { ok: true, version: VERSION, from: from, to: to, done: [], bought: [] };
  try {
    out.done = queryAll_(tasksSource_(), { and: [
      { property: 'Status', select: { equals: '✅ Done' } },
      { timestamp: 'last_edited_time', last_edited_time: { on_or_after: from } },
      { timestamp: 'last_edited_time', last_edited_time: { before: to } }
    ] }, 20).map(function (pg) { return { area: sel_((pg.properties || {})['Life Area']), at: pg.last_edited_time || null }; });
  } catch (e) { if (!e.notion) throw e; out.doneError = e.notion; }
  try {
    out.bought = queryAll_(queueSource_(), { and: [
      { property: 'Bought', date: { on_or_after: from.slice(0, 10) } },
      { property: 'Bought', date: { before: to.slice(0, 10) } }
    ] }, 5).map(toQueue_).map(function (q) { return { day: q.bought, cost: q.cost }; });
  } catch (e2) { if (!e2.notion) throw e2; out.boughtError = e2.notion; }
  try { cache.put(key, JSON.stringify(out), 300); } catch (x) { /* too large to cache */ }
  return out;
}

// ---- Weekly Review ------------------------------------------------------------
var REVIEW_TEXT = { wentWell: 'Went Well', drained: 'Drained Me', nextFocus: 'Next Focus', bearing: 'Bearing', intents: 'Intents', byArea: 'Done By Area', summary: 'Claude Summary' };
var REVIEW_NUM = { hoursWork: 'Hours Work', hoursPersonal: 'Hours Personal', hoursFarm: 'Hours Farm', hoursHobbies: 'Hours Hobbies', tasksDone: 'Tasks Done', picked: 'Priorities Picked', pickedDone: 'Priorities Done' };
var YMD = /^\d{4}-\d{2}-\d{2}$/, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function addDaysYmd_(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** Rich text in Notion's 2000-character pieces. */
function rt_(text) {
  var out = [];
  for (var i = 0; i < text.length && out.length < 3; i += 2000) out.push({ text: { content: text.slice(i, i + 2000) } });
  return out;
}
function toReview_(pg) {
  var p = pg.properties || {}, out = { id: pg.id, url: pg.url, saved: pg.last_edited_time || null, week: day_(p['Week Start']), title: plain_(p.Week && p.Week.title) };
  Object.keys(REVIEW_TEXT).forEach(function (k) { out[k] = plain_(p[REVIEW_TEXT[k]] && p[REVIEW_TEXT[k]].rich_text); });
  Object.keys(REVIEW_NUM).forEach(function (k) { out[k] = p[REVIEW_NUM[k]] && typeof p[REVIEW_NUM[k]].number === 'number' ? p[REVIEW_NUM[k]].number : null; });
  return out;
}
function findReview_(ds, week) {
  return queryAll_(ds, { property: 'Week Start', date: { equals: week } }, 1)[0] || null;
}

/**
 * One week for the Review screen. week = its Monday (yyyy-mm-dd); from and to =
 * that Monday and the next at local midnight (ISO), so "finished this week"
 * follows the iPad's time zone. Returns tasks finished (by last edit), tasks
 * picked (Focus Date in the week), and the saved review if there is one.
 */
function week_(week, from, to) {
  if (!YMD.test(week) || !ISO.test(from) || !ISO.test(to) || !(Date.parse(to) > Date.parse(from))) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache();
  var key = 'week:' + (cache.get('tgen') || '0') + ':' + (cache.get('rgen') || '0') + ':' + week + ':' + from;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tasksSource_(), next = addDaysYmd_(week, 7);
  var done = queryAll_(ds, { and: [
    { property: 'Status', select: { equals: '✅ Done' } },
    { timestamp: 'last_edited_time', last_edited_time: { on_or_after: from } },
    { timestamp: 'last_edited_time', last_edited_time: { before: to } }
  ] }, 3).map(function (pg) { var t = toTask_(pg); t.at = pg.last_edited_time || null; return t; });
  var picked = queryAll_(ds, { and: [
    { property: 'Focus Date', date: { on_or_after: week } },
    { property: 'Focus Date', date: { before: next } }
  ] }, 2).map(toTask_);
  var review = null, reviewsError = null;
  try {
    var pg = findReview_(reviewsSource_(), week);
    if (pg) review = toReview_(pg);
  } catch (e) {
    if (!e.notion) throw e;
    reviewsError = e.notion;
  }
  var out = { ok: true, version: VERSION, week: week, done: done, picked: picked, review: review, reviewsError: reviewsError };
  try { cache.put(key, JSON.stringify(out), 60); } catch (x) { /* too large to cache */ }
  return out;
}

/** Saved reviews, newest first, for the Review log and its trends. */
function reviews_(limit) {
  limit = Math.max(1, Math.min(104, Math.floor(Number(limit)) || 60));
  var cache = CacheService.getScriptCache(), key = 'reviews:' + (cache.get('rgen') || '0') + ':' + limit, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(reviewsSource_(), null, Math.ceil(limit / 100), [{ property: 'Week Start', direction: 'descending' }])
    .map(toReview_).filter(function (r) { return r.week; }).slice(0, limit);
  var out = { ok: true, version: VERSION, reviews: rows };
  try { cache.put(key, JSON.stringify(out), 300); } catch (e) { /* too large to cache */ }
  return out;
}

/** Save the review for one week: updates that week's page, or creates it. Only fields that are sent change. Safe to repeat. */
function saveReview_(r) {
  var week = String(r.week || '');
  if (!YMD.test(week)) return { ok: false, error: 'bad_request' };
  var props = {
    Week: { title: rt_(String(r.title || week).trim().slice(0, 120) || week) },
    'Week Start': { date: { start: week } }
  };
  Object.keys(REVIEW_TEXT).forEach(function (k) { if (r[k] !== undefined) props[REVIEW_TEXT[k]] = { rich_text: rt_(String(r[k] == null ? '' : r[k]).trim().slice(0, 6000)) }; });
  Object.keys(REVIEW_NUM).forEach(function (k) {
    if (r[k] === undefined) return;
    var v = Number(r[k]);
    props[REVIEW_NUM[k]] = { number: r[k] === null || r[k] === undefined || r[k] === '' || !isFinite(v) ? null : Math.round(v * 10) / 10 };
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = reviewsSource_(), found = findReview_(ds, week), pg;
    if (found) pg = notion_('patch', '/pages/' + found.id, { properties: props });
    else pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    CacheService.getScriptCache().put('rgen', String(Date.now()), 21600);
    return { ok: true, version: VERSION, created: !found, review: toReview_(pg) };
  } finally {
    lock.releaseLock();
  }
}

/** Only pages inside the Master Task List may be changed. */
function ownTask_(id) {
  if (!/^[A-Za-z0-9-]{20,40}$/.test(String(id || ''))) return null;
  var pg = notion_('get', '/pages/' + id);
  var ds = tasksSource_(), parent = pg.parent || {};
  return parent.data_source_id === ds ? pg : null;
}
function touched_() { CacheService.getScriptCache().put('tgen', String(Date.now()), 21600); }

function setFocus_(id, day) {
  if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return { ok: false, error: 'bad_request' };
  if (!ownTask_(id)) return { ok: false, error: 'not_writable' };
  var pg = notion_('patch', '/pages/' + id, { properties: { 'Focus Date': { date: day ? { start: day } : null } } });
  touched_();
  return { ok: true, task: toTask_(pg) };
}

function setStatus_(id, status) {
  if (TASK_STATUSES.indexOf(status) === -1) return { ok: false, error: 'bad_request' };
  if (!ownTask_(id)) return { ok: false, error: 'not_writable' };
  var pg = notion_('patch', '/pages/' + id, { properties: { Status: { select: { name: status } } } });
  touched_();
  return { ok: true, task: toTask_(pg) };
}

/** task: { cid, title, area, priority, day } -> new To Do task, focused on day. */
function addTask_(task) {
  var title = String(task.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(task.cid || ''))) return { ok: false, error: 'bad_request' };
  if (task.day && !/^\d{4}-\d{2}-\d{2}$/.test(String(task.day))) return { ok: false, error: 'bad_request' };
  if (task.due && !/^\d{4}-\d{2}-\d{2}$/.test(String(task.due))) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('tcid:' + task.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var ds = tasksSource_();
    var props = { Task: { title: [{ text: { content: title } }] }, Status: { select: { name: '⬜ To Do' } } };
    if (task.area) {
      if (areaOptions_(ds).indexOf(task.area) === -1) return { ok: false, error: 'bad_request' };
      props['Life Area'] = { select: { name: task.area } };
    }
    if (task.priority) {
      if (TASK_PRIORITIES.indexOf(task.priority) === -1) return { ok: false, error: 'bad_request' };
      props.Priority = { select: { name: task.priority } };
    }
    if (task.day) props['Focus Date'] = { date: { start: task.day } };
    if (task.due) props['Due Date'] = { date: { start: task.due } };   // 1.33: a due date (INBOX sorting)
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    var out = { ok: true, version: VERSION, task: toTask_(pg) };
    cache.put('tcid:' + task.cid, JSON.stringify(out), 21600);
    touched_();
    return out;
  } finally {
    lock.releaseLock();
  }
}

// ---- Notion: Key Dates ------------------------------------------------------

function toDate_(pg) {
  var p = pg.properties || {}, d = (p.Date && p.Date.date) || {};
  return {
    id: pg.id, url: pg.url,
    title: plain_(p.Name && p.Name.title) || 'Untitled',
    start: d.start ? d.start.slice(0, 10) : null,
    end: d.end ? d.end.slice(0, 10) : null,
    area: sel_(p['Life Area']), type: sel_(p.Type),
    yearly: !!(p['Repeats Yearly'] && p['Repeats Yearly'].checkbox),
    notes: plain_(p.Notes && p.Notes.rich_text)
  };
}

/** Every key date (the app works out countdowns and yearly repeats). */
function dates_() {
  var cache = CacheService.getScriptCache();
  var key = 'dates:' + (cache.get('dgen') || '0');
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = datesSource_();
  var dates = queryAll_(ds, null, 5, [{ property: 'Date', direction: 'ascending' }]).map(toDate_).filter(function (d) { return d.start; });
  var out = { ok: true, version: VERSION, dates: dates, areas: areaOptions_(ds), types: selectOptions_(ds, 'Type') };
  try { cache.put(key, JSON.stringify(out), 120); } catch (e) { /* too large to cache */ }
  return out;
}

/** date: { cid, title, start, end, area, type, yearly, notes } -> new key date. */
function addDate_(date) {
  var title = String(date.title || '').trim();
  if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(date.cid || ''))) return { ok: false, error: 'bad_request' };
  var ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(String(date.start || ''))) return { ok: false, error: 'bad_time' };
  if (date.end && (!ymd.test(String(date.end)) || date.end < date.start)) return { ok: false, error: 'bad_time' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('dcid:' + date.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var ds = datesSource_();
    var props = {
      Name: { title: [{ text: { content: title } }] },
      Date: { date: date.end && date.end !== date.start ? { start: date.start, end: date.end } : { start: date.start } },
      'Repeats Yearly': { checkbox: !!date.yearly }
    };
    if (date.area) {
      if (areaOptions_(ds).indexOf(date.area) === -1) return { ok: false, error: 'bad_request' };
      props['Life Area'] = { select: { name: date.area } };
    }
    if (date.type) {
      if (selectOptions_(ds, 'Type').indexOf(date.type) === -1) return { ok: false, error: 'bad_request' };
      props.Type = { select: { name: date.type } };
    }
    var notes = String(date.notes || '').trim().slice(0, 1000);
    if (notes) props.Notes = { rich_text: [{ text: { content: notes } }] };
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    var out = { ok: true, version: VERSION, date: toDate_(pg) };
    cache.put('dcid:' + date.cid, JSON.stringify(out), 21600);
    cache.put('dgen', String(Date.now()), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}

// ---- Ledger: YNAB (read-only) + Replicator Queue (Notion) ---------------------
//
// YNAB: Script Property YNAB_TOKEN (a Personal Access Token). Optional YNAB_PLAN_ID
// (default: the plan you used last). The bridge only ever sends GET requests to YNAB.
// The fund for the Replicator Queue is the category named in LEDGER_FUND_CATEGORY
// (Script Property, default "Discretionary").

var YNAB_BASE = 'https://api.ynab.com/v1';
var LEDGER_SECONDS = 600;          // the current state, cached 10 minutes
var MONTH_SECONDS = 21600;         // past months, cached 6 hours (the longest Apps Script allows)
var LEDGER_MONTHS = 12;
var LOAN_TYPES = ['mortgage', 'autoLoan', 'studentLoan', 'personalLoan', 'medicalDebt', 'otherDebt'];
var SKIP_GROUPS = ['Credit Card Payments', 'Internal Master Category', 'Hidden Categories'];

function ynabToken_() { return PropertiesService.getScriptProperties().getProperty('YNAB_TOKEN'); }
function ynabPlan_() { return String(PropertiesService.getScriptProperties().getProperty('YNAB_PLAN_ID') || 'last-used').trim(); }
function fundName_() { return String(PropertiesService.getScriptProperties().getProperty('LEDGER_FUND_CATEGORY') || 'Discretionary').trim(); }

/** One GET to YNAB. Returns { code, body }; never throws for HTTP errors. GET only: there is no write path to YNAB. */
function ynabGet_(url) {
  var token = ynabToken_();
  if (!token) { var e0 = new Error('No YNAB_TOKEN in Script Properties'); e0.ynab = 'ynab_not_configured'; throw e0; }
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } });
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  return { code: res.getResponseCode(), body: body };
}
/** YNAB renamed budgets to plans (API 1.79). Use /plans, and fall back to the older /budgets if an account only answers there. */
function ynabPrefix_() { return CacheService.getScriptCache().get('ynab:prefix') || 'plans'; }
/** Read one YNAB resource for the plan. */
function ynab_(path) {
  var plan = encodeURIComponent(ynabPlan_()), prefix = ynabPrefix_();
  var r = ynabGet_(YNAB_BASE + '/' + prefix + '/' + plan + path);
  if (r.code === 404 && prefix === 'plans' && !/^\/months\//.test(path)) {
    var old = ynabGet_(YNAB_BASE + '/budgets/' + plan + path);
    if (old.code < 300) { CacheService.getScriptCache().put('ynab:prefix', 'budgets', 21600); r = old; }
  }
  if (r.code >= 300) {
    var e = new Error(((r.body.error && r.body.error.detail) || ('YNAB HTTP ' + r.code)) + ' (reading ' + path.replace(/^\//, '') + ')');
    e.ynab = r.code === 401 ? 'ynab_unauthorized' : r.code === 404 ? 'ynab_not_found' : r.code === 429 ? 'ynab_busy' : 'ynab_error';
    throw e;
  }
  return r.body.data || {};
}
/** Your plans (name and ID), to help pick YNAB_PLAN_ID. */
function ynabPlans_() {
  var r = ynabGet_(YNAB_BASE + '/plans');
  if (r.code >= 300) r = ynabGet_(YNAB_BASE + '/budgets');
  var d = r.body.data || {};
  return (d.plans || d.budgets || []).map(function (b) { return { id: b.id, name: b.name, last: b.last_modified_on || '' }; });
}

/** yyyy-mm-01 for this month and the n months before it, oldest first. */
function ledgerMonths_(n) {
  var t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), y = +t.slice(0, 4), m = +t.slice(5, 7), out = [];
  for (var i = n; i >= 0; i--) {
    var mm = m - i, yy = y;
    while (mm < 1) { mm += 12; yy--; }
    out.push(yy + '-' + (mm < 10 ? '0' : '') + mm + '-01');
  }
  return out;
}
function money_(milli) { return typeof milli === 'number' ? Math.round(milli) / 1000 : null; }
/** Names compared without emoji, symbols, extra spaces or capitals: "🪽 Discretionary" matches "Discretionary". */
function plainName_(s) { return String(s || '').replace(/[^A-Za-z0-9\u00C0-\u024F]+/g, ' ').trim().toLowerCase(); }
function spendable_(c) { return !c.deleted && !c.hidden && !c.internal && SKIP_GROUPS.indexOf(c.category_group_name) === -1; }

/** One past month, reduced to what the Ledger needs: age of money and spending per category. */
function ledgerMonth_(month) {
  var cache = CacheService.getScriptCache(), key = 'ym:' + ynabPlan_() + ':' + month, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var m = {};
  try { m = ynab_('/months/' + month).month || {}; }
  catch (e) { if (e.ynab !== 'ynab_not_found') throw e; }   // a month before the plan began
  var out = { age: typeof m.age_of_money === 'number' ? m.age_of_money : null, spend: {} };
  (m.categories || []).forEach(function (c) { if (spendable_(c) && c.activity) out.spend[c.id] = -money_(c.activity); });
  try { cache.put(key, JSON.stringify(out), MONTH_SECONDS); } catch (x) { /* too large to cache */ }
  return out;
}

/** Accounts, age of money, spending by category (12 months + this month so far), and the fund category. */
function ynabLedger_(fresh) {
  var cache = CacheService.getScriptCache(), key = 'ynab:' + ynabPlan_(), hit = fresh ? null : cache.get(key);   // fresh: a pull to refresh skips the 10-minute copy
  if (hit) return JSON.parse(hit);
  var months = ledgerMonths_(LEDGER_MONTHS), thisMonth = months.pop();
  var accts = (ynab_('/accounts').accounts || []).filter(function (a) { return !a.deleted && !a.closed; });
  var acct = function (a) { return { id: a.id, name: a.name, type: a.type, balance: money_(a.balance), original: a.debt_original_balance == null ? null : Math.abs(money_(a.debt_original_balance)) }; };
  var cur = ynab_('/months/' + thisMonth).month || {};
  var cats = (cur.categories || []).filter(spendable_);
  var past = months.map(ledgerMonth_);
  var want = plainName_(fundName_()), fund = null;
  (cur.categories || []).forEach(function (c) { if (!fund && !c.deleted && plainName_(c.name) === want) fund = { name: c.name, balance: money_(c.balance) }; });
  var out = {
    month: thisMonth, months: months,
    checking: accts.filter(function (a) { return a.type === 'checking'; }).map(acct),
    savings: accts.filter(function (a) { return a.type === 'savings'; }).map(acct),
    loans: accts.filter(function (a) { return LOAN_TYPES.indexOf(a.type) > -1; }).map(acct),
    age: past.map(function (p, i) { return { month: months[i], days: p.age }; }).concat([{ month: thisMonth, days: typeof cur.age_of_money === 'number' ? cur.age_of_money : null }]),
    cats: cats.map(function (c) {
      return { id: c.id, name: c.name, group: c.category_group_name || '', m: past.map(function (p) { return p.spend[c.id] || 0; }), now: -money_(c.activity || 0) };
    }),
    fundName: fundName_(), fund: fund, at: new Date().toISOString()   // when YNAB was asked, so the app can say how current this is
  };
  try { cache.put(key, JSON.stringify(out), LEDGER_SECONDS); } catch (x) { /* too large to cache */ }
  return out;
}

function queueSource_() { return sourceFor_(CONFIG.NOTION_QUEUE_DATABASE, 'NOTION_QUEUE_SOURCE'); }
function toQueue_(pg) {
  var p = pg.properties || {};
  return {
    id: pg.id, url: pg.url, title: plain_(p.Name && p.Name.title) || 'Untitled',
    cost: p.Cost && typeof p.Cost.number === 'number' ? p.Cost.number : null,
    priority: p.Priority && typeof p.Priority.number === 'number' ? p.Priority.number : null,
    note: plain_(p.Note && p.Note.rich_text), link: (p.Link && p.Link.url) || '',
    bought: day_(p.Bought), created: pg.created_time || ''
  };
}
/** Waiting items in priority order (lowest first; unranked go last, oldest first), plus the last 10 bought. */
function queueRows_() {
  var rows = queryAll_(queueSource_(), null, 3).map(toQueue_);
  var rank = function (r) { return r.priority === null ? 1e9 : r.priority; };
  return {
    items: rows.filter(function (r) { return !r.bought; }).sort(function (a, b) { return rank(a) - rank(b) || (a.created < b.created ? -1 : 1); }),
    bought: rows.filter(function (r) { return r.bought; }).sort(function (a, b) { return a.bought < b.bought ? 1 : -1; }).slice(0, 10)
  };
}

/** Everything the LEDGER screen shows. A YNAB problem and a Notion problem are reported separately. */
function ledger_(fresh) {
  var out = { ok: true, version: VERSION };
  try { out.ynab = ynabLedger_(fresh); } catch (e) { out.ynabError = e.ynab || 'ynab_error'; out.ynabDetail = String(e.message || e); }
  try { out.queue = queueRows_(); } catch (e2) { out.queueError = e2.notion || 'notion_error'; }
  return out;
}

function queueAdd_(item) {
  var title = String(item.title || '').trim();
  if (!title || title.length > 120) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(item.cid || ''))) return { ok: false, error: 'bad_request' };
  var cost = item.cost === null || item.cost === undefined || item.cost === '' ? null : Number(item.cost);
  if (cost !== null && (!isFinite(cost) || cost < 0 || cost > 1e7)) return { ok: false, error: 'bad_request' };
  var link = String(item.link || '').trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('qcid:' + item.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var q = queueRows_(), last = q.items.reduce(function (m, r) { return Math.max(m, r.priority || 0); }, 0);
    var props = { Name: { title: rt_(title) }, Priority: { number: last + 10 } };
    if (cost !== null) props.Cost = { number: Math.round(cost * 100) / 100 };
    if (String(item.note || '').trim()) props.Note = { rich_text: rt_(String(item.note).trim().slice(0, 500)) };
    if (link) props.Link = { url: link.slice(0, 1000) };
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: queueSource_() }, properties: props });
    var out = { ok: true, version: VERSION, item: toQueue_(pg) };
    cache.put('qcid:' + item.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Set the order of waiting items: ids top to bottom. Only items in the queue can be touched. Safe to repeat. */
function queueOrder_(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var q = queueRows_(), byId = {};
    q.items.forEach(function (r) { byId[r.id] = r; });
    if (ids.some(function (id) { return !byId[id]; })) return { ok: false, error: 'not_writable' };
    ids.forEach(function (id, i) {
      var want = (i + 1) * 10;
      if (byId[id].priority !== want) notion_('patch', '/pages/' + id, { properties: { Priority: { number: want } } });
    });
    return { ok: true, version: VERSION, queue: queueRows_() };
  } finally {
    lock.releaseLock();
  }
}

/** Mark an item bought on a day, or put it back in the queue (day null). */
function queueBought_(id, day) {
  if (day !== null && !YMD.test(String(day || ''))) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var q = queueRows_();
    if (!q.items.concat(q.bought).some(function (r) { return r.id === id; })) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + id, { properties: { Bought: { date: day ? { start: day } : null } } });
    return { ok: true, version: VERSION, queue: queueRows_() };
  } finally {
    lock.releaseLock();
  }
}

function ledgerStatus_() {
  var out = {};
  if (!ynabToken_()) out.ynab = 'OFF. Add YNAB_TOKEN in Script Properties to turn on the Ledger';
  else {
    try {
      CacheService.getScriptCache().remove('ynab:' + ynabPlan_());
      var y = ynabLedger_();
      out.ynab = 'OK. ' + y.checking.length + ' checking, ' + y.savings.length + ' savings, ' + y.loans.length + ' loan accounts. Fund category "' + y.fundName + '": ' + (y.fund ? 'found' : 'NOT FOUND (create it in YNAB, or set LEDGER_FUND_CATEGORY)');
    } catch (e) {
      out.ynab = 'PROBLEM: ' + (e.ynab || 'ynab_error') + '. ' + e.message;
      if (e.ynab === 'ynab_not_found') {
        try {
          out.ynab += '. Plans this token can see (add YNAB_PLAN_ID with the right ID): ' + (ynabPlans_().map(function (b) { return b.name + ' -> ' + b.id; }).join(' | ') || 'none');
        } catch (x) { /* listing failed too */ }
      }
    }
  }
  try { var q = queueRows_(); out.queue = 'OK (' + q.items.length + ' waiting)'; }
  catch (e2) { out.queue = 'NOT READY: ' + (e2.notion || 'notion_error') + (e2.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to the Replicator Queue (... > Connections)' : ''); }
  return out;
}

// ---- Captain's Log ---------------------------------------------------------
// One page per day in the Captain's Log database; the entry is the page body,
// one paragraph block per paragraph. Every request needs the 6-digit PIN in
// Script Property LOG_PIN (bridge 1.17: a code word and four digits, see logPin_).
// Nothing here is cached with its text, and Ask has no
// way in: the log is not in its snapshot and it has no tool that reads it.
var LOG_FAIL_LIMIT = 5, LOG_LOCK_SECONDS = 900, LOG_MAX_CHARS = 120000;
var LOG_TEXT_BLOCKS = ['paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote', 'heading_1', 'heading_2', 'heading_3', 'to_do'];
var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** LOG_PIN is either six digits or, like a Starfleet authorization, a Greek code word and
    four digits: "OMEGA-1234", "omega 1234" or "Ω1234" all read as OMEGA-1234. The panel
    offers these six words; anything else isn't a valid PIN. */
var LOG_WORDS = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'THETA', 'OMEGA'];
var LOG_GLYPHS = { 'Α': 'ALPHA', 'Β': 'BETA', 'Γ': 'GAMMA', 'Δ': 'DELTA', 'Θ': 'THETA', 'Ω': 'OMEGA' };
function logCode_(raw) {
  var m = String(raw == null ? '' : raw).trim().toUpperCase().match(/^([A-Z]+|[ΑΒΓΔΘΩ])[\s\-]*(\d{4})$/);
  if (!m) return '';
  var word = LOG_GLYPHS[m[1]] || m[1];
  return LOG_WORDS.indexOf(word) > -1 ? word + '-' + m[2] : '';
}
function logPin_() {
  var p = String(PropertiesService.getScriptProperties().getProperty('LOG_PIN') || '').trim();
  return /^\d{6}$/.test(p) ? p : logCode_(p);
}
function logSource_() { return sourceFor_(CONFIG.NOTION_LOG_DATABASE, 'NOTION_LOG_SOURCE'); }
/** The list of written days is kept for 6 hours and updated in place when a day is added,
    so opening the log rarely has to read all of Notion. setup() clears it. */
function logDatesAdd_(days) {
  var cache = CacheService.getScriptCache(), hit = cache.get('logdates');
  if (!hit) return;
  var seen = {}; JSON.parse(hit).concat(days).forEach(function (d) { seen[d] = true; });
  try { cache.put('logdates', JSON.stringify(Object.keys(seen).sort()), 21600); } catch (x) { cache.remove('logdates'); }
}

/** PIN check with a lockout. Compares every character so timing says nothing. Five misses
    lock it for 15 minutes; each lockout in a row doubles that (up to a day), since a code
    word and four digits has fewer combinations than six digits. A right answer resets it. */
function logGate_(pin) {
  var want = logPin_();
  if (!want) return { ok: false, error: 'log_pin_not_set' };
  var props = PropertiesService.getScriptProperties(), until = Number(props.getProperty('LOG_LOCK_UNTIL') || 0);
  if (Date.now() < until) return { ok: false, error: 'log_locked', until: until };
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('logfail') || 0);
  if (fails >= LOG_FAIL_LIMIT) return { ok: false, error: 'log_locked' };
  var given = /^\d{6}$/.test(want) ? String(pin == null ? '' : pin) : logCode_(pin) || String(pin == null ? '' : pin);
  var diff = given.length === want.length ? 0 : 1;
  for (var i = 0; i < want.length; i++) diff |= (given.charCodeAt(i) || 0) ^ want.charCodeAt(i);
  if (diff) {
    fails++;
    if (fails >= LOG_FAIL_LIMIT) {
      var strikes = Number(props.getProperty('LOG_STRIKES') || 0), secs = Math.min(86400, LOG_LOCK_SECONDS * Math.pow(2, strikes));
      until = Date.now() + secs * 1000;
      props.setProperty('LOG_LOCK_UNTIL', String(until)); props.setProperty('LOG_STRIKES', String(strikes + 1));
      cache.remove('logfail');
      return { ok: false, error: 'log_locked', until: until, left: 0 };
    }
    cache.put('logfail', String(fails), LOG_LOCK_SECONDS);
    return { ok: false, error: 'bad_pin', left: LOG_FAIL_LIMIT - fails };
  }
  if (fails) cache.remove('logfail');
  if (props.getProperty('LOG_STRIKES')) { props.deleteProperty('LOG_STRIKES'); props.deleteProperty('LOG_LOCK_UNTIL'); }
  return null;
}

function logAction_(body) {
  var shut = logGate_(body.pin);
  if (shut) return shut;
  if (body.action === 'logunlock' || body.action === 'logdates') return logDates_();
  if (body.action === 'logday') return logDay_(String(body.date || ''));
  if (body.action === 'logsave') return logSave_(String(body.date || ''), body.text);
  if (body.action === 'logimport') return logImport_(body.entries);
  if (body.action === 'logsearch') return logSearch_(body.q, !(body.whole === '0' || body.whole === 0 || body.whole === false));
  if (body.action === 'logindex') return logIndex_(body.run ? LOG_INDEX_MS : 0);
  if (body.action === 'logask') return logAsk_(body);
  if (body.action === 'logasksave') return logInsightSave_(body.insight || {});
  if (body.action === 'loginsights') return logInsights_();
  if (body.action === 'loginsight') return logInsight_(String(body.id || ''));
  return { ok: false, error: 'unknown_action' };
}

/** "Wednesday, October 7, 2026" for a yyyy-mm-dd. */
function longDay_(ymd) {
  var d = new Date(ymd + 'T12:00:00Z');
  return WEEKDAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}
function realDay_(ymd) { var d = YMD.test(ymd) ? new Date(ymd + 'T12:00:00Z') : null; return !!d && !isNaN(d) && d.toISOString().slice(0, 10) === ymd; }

/** Text into blocks: blank lines separate paragraphs, single line breaks stay inside one, and a
    line starting "• " or "- " is a bulleted list item of its own (bridge 1.19). The app's logNorm()
    uses the same rules, so "unchanged" means the same thing on both sides. Returns [{type, text}]. */
var LOG_BULLET = /^[ \t]*[•\-][ \t]+(.*)$/;
function logParas_(text) {
  var out = [];
  String(text == null ? '' : text).replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).forEach(function (chunk) {
    var run = [];
    var flush = function () { var p = run.join('\n').replace(/^\n+|\s+$/g, ''); if (p.length) out.push({ type: 'paragraph', text: p }); run = []; };
    chunk.split('\n').forEach(function (line) {
      var m = line.match(LOG_BULLET);
      if (!m) { run.push(line); return; }
      flush();
      var t = m[1].replace(/\s+$/, '');
      if (t.length) out.push({ type: 'bulleted_list_item', text: t });
    });
    flush();
  });
  return out;
}
/** Blocks back into text: list items one per line, everything else a blank line apart. */
function logJoin_(blocks) {
  var s = '', prev = null;
  blocks.forEach(function (b) {
    var bul = b.type === 'bulleted_list_item';
    if (prev) s += bul && prev === 'bulleted_list_item' ? '\n' : '\n\n';
    s += bul ? '• ' + b.raw : b.text;
    prev = b.type;
  });
  return s;
}
function logRich_(text) {
  var out = [];
  for (var i = 0; i < text.length && out.length < 100; i += 2000) out.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return out;
}
function logBlock_(p) { var b = { object: 'block', type: p.type }; b[p.type] = { rich_text: logRich_(p.text) }; return b; }

/** Notion asks callers to slow down now and then; a log save waits and tries again. */
function logNotion_(method, path, payload) {
  for (var i = 0; ; i++) {
    try { return notion_(method, path, payload); } catch (e) {
      if (e.notion !== 'notion_busy' || i >= 3) throw e;
      Utilities.sleep(800 * (i + 1));
    }
  }
}

function logFind_(ds, ymd) { return queryAll_(ds, { property: 'Date', date: { equals: ymd } }, 1)[0] || null; }

/** Every day that has an entry (no text), for the calendar. */
function logDates_() {
  var cache = CacheService.getScriptCache(), key = 'logdates', hit = cache.get(key);
  if (hit) return { ok: true, version: VERSION, dates: JSON.parse(hit) };
  var seen = {};
  queryAll_(logSource_(), null, 40, [{ property: 'Date', direction: 'ascending' }]).forEach(function (pg) {
    var d = day_((pg.properties || {}).Date); if (d) seen[d] = true;
  });
  var dates = Object.keys(seen).sort();
  try { cache.put(key, JSON.stringify(dates), 21600); } catch (x) { /* too large to cache */ }
  return { ok: true, version: VERSION, dates: dates };
}

/** A page's body as blocks we can read back as text. */
function logBlocks_(pageId) {
  var out = [], cursor = null;
  for (var i = 0; i < 20; i++) {
    var r = notion_('get', '/blocks/' + pageId + '/children?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
    (r.results || []).forEach(function (b) {
      var t = b.type, inner = b[t] || {}, raw = LOG_TEXT_BLOCKS.indexOf(t) > -1 ? plain_(inner.rich_text) : null, txt = raw;
      if (txt !== null && t === 'bulleted_list_item') txt = '• ' + txt;
      if (txt !== null && t === 'to_do') txt = (inner.checked ? '[x] ' : '[ ] ') + txt;
      out.push({ id: b.id, type: t, text: txt, raw: raw, kids: !!b.has_children });
    });
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

function logBlocksText_(blocks) { return logJoin_(blocks.filter(function (b) { return b.text !== null; })); }

/** One day's entry. other = the page also holds things the LOG can't show (images, tables); edit those in Notion. */
function logDay_(ymd) {
  if (!realDay_(ymd)) return { ok: false, error: 'bad_request' };
  var pg = logFind_(logSource_(), ymd);
  if (!pg) return { ok: true, version: VERSION, date: ymd, entry: null };
  var blocks = logBlocks_(pg.id);
  var other = blocks.some(function (b) { return b.text === null || b.kids; });
  var text = logBlocksText_(blocks);
  return { ok: true, version: VERSION, date: ymd, entry: { id: pg.id, url: pg.url, text: text, saved: pg.last_edited_time || null, other: other } };
}

/** Create or update one day's entry. Unchanged paragraphs are left alone. Safe to repeat. */
function logSave_(ymd, text) {
  if (!realDay_(ymd) || typeof text !== 'string') return { ok: false, error: 'bad_request' };
  if (text.length > LOG_MAX_CHARS) return { ok: false, error: 'too_long' };
  var paras = logParas_(text);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ds = logSource_(), pg = logFind_(ds, ymd), created = false;
    if (!pg) {
      if (!paras.length) return { ok: true, version: VERSION, date: ymd, saved: null, created: false };
      pg = logNotion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds },
        properties: logSearchProps_({ Name: { title: rt_(longDay_(ymd)) }, Date: { date: { start: ymd } }, Source: { select: { name: 'Bridge' } } }, paras),
        children: paras.slice(0, 100).map(logBlock_) });
      created = true;
      paras = paras.slice(100);
      if (paras.length) logAppend_(pg.id, paras);
    } else {
      var old = logBlocks_(pg.id);
      if (old.some(function (b) { return b.text === null || b.kids; })) return { ok: false, error: 'log_edit_in_notion' };
      var k = 0;
      var same = function (o, p) { return o.type === p.type && (o.type === 'paragraph' || o.type === 'bulleted_list_item'); };
      while (k < old.length && k < paras.length && same(old[k], paras[k]) && old[k].raw === paras[k].text) k++;
      var j = k;
      while (j < old.length && j < paras.length && same(old[j], paras[j])) {   // same kind of block: rewrite its text in place
        if (old[j].raw !== paras[j].text) { var upd = {}; upd[paras[j].type] = { rich_text: logRich_(paras[j].text) }; logNotion_('patch', '/blocks/' + old[j].id, upd); }
        j++;
      }
      for (var x = j; x < old.length; x++) logNotion_('delete', '/blocks/' + old[x].id);
      if (j < paras.length) logAppend_(pg.id, paras.slice(j));
      if (logSearchReady_()) logNotion_('patch', '/pages/' + pg.id, { properties: logSearchProps_({}, paras) });
    }
    if (created) logDatesAdd_([ymd]);
    return { ok: true, version: VERSION, date: ymd, created: created, saved: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}
function logAppend_(pageId, paras) {
  for (var i = 0; i < paras.length; i += 100) logNotion_('patch', '/blocks/' + pageId + '/children', { children: paras.slice(i, i + 100).map(logBlock_) });
}

/** Bring in old entries, up to 10 per request. Days that already have a page are skipped, so a resent batch adds nothing twice. */
function logImport_(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 10) return { ok: false, error: 'bad_request' };
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i] || {};
    if (!realDay_(String(e.date || '')) || typeof e.text !== 'string' || e.text.length > LOG_MAX_CHARS) return { ok: false, error: 'bad_request' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ds = logSource_(), sorted = entries.map(function (e) { return e.date; }).sort(), have = {};
    queryAll_(ds, { and: [{ property: 'Date', date: { on_or_after: sorted[0] } }, { property: 'Date', date: { on_or_before: sorted[sorted.length - 1] } }] }, 2)
      .forEach(function (pg) { var d = day_((pg.properties || {}).Date); if (d) have[d] = true; });
    var created = [], skipped = [];
    entries.forEach(function (e) {
      var paras = logParas_(e.text);
      if (have[e.date] || !paras.length) { skipped.push(e.date); return; }
      var pg = logNotion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds },
        properties: logSearchProps_({ Name: { title: rt_(longDay_(e.date)) }, Date: { date: { start: e.date } }, Source: { select: { name: 'Diary import' } } }, paras),
        children: paras.slice(0, 100).map(logBlock_) });
      if (paras.length > 100) logAppend_(pg.id, paras.slice(100));
      have[e.date] = true;
      created.push(e.date);
    });
    if (created.length) logDatesAdd_(created);
    return { ok: true, version: VERSION, created: created, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function logStatus_() {
  CacheService.getScriptCache().remove('logdates');
  var raw = String(PropertiesService.getScriptProperties().getProperty('LOG_PIN') || '').trim(), code = logPin_();
  var pin = code ? (code.indexOf('-') > -1 ? 'Authorization code set (' + code.split('-')[0] + ' and four digits)' : 'PIN set (six digits)')
    : raw ? 'LOG_PIN NOT VALID: use a code word (' + LOG_WORDS.join(', ') + ') and four digits, like OMEGA-0000, or six digits'
    : 'NO PIN: add LOG_PIN in Script Properties (a code word and four digits, like OMEGA-0000)';
  try { var n = logDates_().dates.length; return 'OK (' + n + ' days written). ' + pin; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? ". Connect the TimothyOS integration to the Captain's Log (... > Connections)" : '') + '. ' + pin; }
}

// ---- Captain's Log search (bridge 1.16) --------------------------------------
// Notion can't search inside page bodies, and reading every body would cost a call
// per day. So each entry's text is also kept in its page's "Search Text" field:
// saves and imports write it (on one line), logindex fills it for older entries (newest first),
// and one query then finds every entry holding a word. Same PIN as the log, no
// cache, and Ask still has no way in. setup() adds the field (with Timothy's OK).
var LOG_SEARCH_PROP = 'Search Text', LOG_INDEX_MS = 20000, LOG_EMPTY = '\u00b7', LOG_SEARCH_PAGES = 20;
/** One line, single spaces: a phrase matches across line and paragraph breaks. */
function logFlat_(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function logSearchReady_() { return PropertiesService.getScriptProperties().getProperty('LOG_SEARCH_READY') === '1'; }
/** Adds Search Text to a page's properties once the field exists. */
function logSearchProps_(props, paras) {
  if (!logSearchReady_()) return props;
  props[LOG_SEARCH_PROP] = { rich_text: logRich_(logFlat_(paras.map(function (p) { return p.text; }).join(' ')) || LOG_EMPTY) };
  return props;
}
/** Entries whose Search Text is still empty (up to maxPages x 100). */
function logUnindexed_(maxPages) {
  var f = { property: LOG_SEARCH_PROP, rich_text: { is_empty: true } };
  return queryAll_(logSource_(), f, maxPages, [{ property: 'Date', direction: 'descending' }]);
}
/** Fill Search Text for older entries for up to budget ms; budget 0 only counts what's left. */
function logIndex_(budget) {
  if (!logSearchReady_()) return { ok: false, error: 'log_search_not_ready' };
  if (!budget) return { ok: true, version: VERSION, did: 0, left: logUnindexed_(40).length };
  var t0 = Date.now(), todo = logUnindexed_(1), did = 0, busy = false, lock = LockService.getScriptLock();
  for (var i = 0; i < todo.length && Date.now() - t0 < budget; i++) {
    lock.waitLock(20000);   // a save in progress finishes first, so its fresh text is never overwritten
    try {
      var text = logFlat_(logBlocksText_(logBlocks_(todo[i].id))), pr = {};
      pr[LOG_SEARCH_PROP] = { rich_text: logRich_(text || LOG_EMPTY) };
      logNotion_('patch', '/pages/' + todo[i].id, { properties: pr });
      did++;
    } catch (e) {
      if (e.notion !== 'notion_busy') throw e;
      busy = true; break;
    } finally { lock.releaseLock(); }
  }
  var left = todo.length - did;
  if (todo.length === 100 && left < 100) left = logUnindexed_(40).length;   // there may be more beyond the first hundred
  return { ok: true, version: VERSION, did: did, left: left, busy: busy };
}
/** Run from the script editor to index older entries in one go (about five minutes per run). */
function buildLogSearch() {
  var r = logIndex_(300000);
  console.log(r.ok ? 'Indexed ' + r.did + ' entries. ' + (r.left ? r.left + ' left: run buildLogSearch again.' : 'Every entry is searchable.') : r.error);
}
function logSearchRe_(q, whole) {
  var body = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return whole ? new RegExp('(?<![\\p{L}\\p{N}_])' + body + '(?![\\p{L}\\p{N}_])', 'giu') : new RegExp(body, 'giu');
}
/** A few words either side of a match, cut at word edges, as [text, match, text, match, ..., text]. */
function logSnip_(text, at, len, re) {
  var a = Math.max(0, at - 70), b = Math.min(text.length, at + len + 90);
  var win = text.slice(a, b), lead = '', tail = '';
  if (a > 0) { var cut = win.indexOf(' '); if (cut > -1 && cut < at - a) { win = win.slice(cut + 1); a += cut + 1; } lead = '…'; }
  if (b < text.length) { var back = win.lastIndexOf(' '); if (back > at - a + len) { win = win.slice(0, back); b = a + back; } tail = '…'; }
  var parts = [], last = 0, m, r = new RegExp(re.source, re.flags);
  while ((m = r.exec(win))) { parts.push(win.slice(last, m.index), m[0]); last = m.index + m[0].length; if (!m[0].length) r.lastIndex++; }
  parts.push(win.slice(last));
  parts[0] = lead + parts[0]; parts[parts.length - 1] += tail;
  return { parts: parts, end: b };
}
/** Every entry holding a word or phrase (case ignored), newest first, with where it appears. */
function logSearch_(q, whole) {
  if (!logSearchReady_()) return { ok: false, error: 'log_search_not_ready' };
  q = String(q == null ? '' : q).replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 80) return { ok: false, error: 'bad_request' };
  // Notion narrows it down; the case variants are in case its match minds case. The exact rule is applied here.
  var cap = q.charAt(0).toUpperCase() + q.slice(1), seen = {}, ors = [];
  var title = q.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, c) { return a + c.toUpperCase(); });
  [q, q.toLowerCase(), q.toUpperCase(), cap, q.charAt(0).toUpperCase() + q.slice(1).toLowerCase(), title].forEach(function (v) {
    if (!seen[v]) { seen[v] = true; ors.push({ property: LOG_SEARCH_PROP, rich_text: { contains: v } }); }
  });
  var pages = queryAll_(logSource_(), ors.length === 1 ? ors[0] : { or: ors }, LOG_SEARCH_PAGES, [{ property: 'Date', direction: 'descending' }]);
  var re = logSearchRe_(q, whole), entries = [], mentions = 0;
  pages.forEach(function (pg) {
    var d = day_((pg.properties || {}).Date), text = plain_(((pg.properties || {})[LOG_SEARCH_PROP] || {}).rich_text);
    if (!d || !text) return;
    var m, count = 0, snips = [], shown = 0;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      count++;
      if (snips.length < 2 && m.index >= shown) { var sn = logSnip_(text, m.index, m[0].length, re); snips.push(sn.parts); shown = sn.end; }
      if (!m[0].length) re.lastIndex++;
    }
    if (!count) return;
    mentions += count;
    entries.push({ date: d, count: count, snips: snips });
  });
  var left = logUnindexed_(1).length;
  return { ok: true, version: VERSION, q: q, whole: whole, entries: entries, mentions: mentions, left: left, more: pages.length >= LOG_SEARCH_PAGES * 100 };
}
/** setup(): add the Search Text field to the Captain's Log if it isn't there, then say how much is left to index. */
function logSearchSetup_() {
  try {
    var ds = logSource_(), src = notion_('get', '/data_sources/' + ds), have = src.properties && src.properties[LOG_SEARCH_PROP];
    if (have && have.type !== 'rich_text') return 'PROBLEM: the Log has a "' + LOG_SEARCH_PROP + '" field that isn\'t Text. Rename it in Notion, then run setup again';
    if (!have) { var add = {}; add[LOG_SEARCH_PROP] = { type: 'rich_text', rich_text: {} }; notion_('patch', '/data_sources/' + ds, { properties: add }); }
    PropertiesService.getScriptProperties().setProperty('LOG_SEARCH_READY', '1');
    var left = logUnindexed_(40).length;
    return 'OK' + (have ? '' : ' (added the "' + LOG_SEARCH_PROP + '" field)') + (left ? '. ' + left + ' older entries to index: unlock LOG on the iPad and it fills in, or run buildLogSearch here' : '. Every entry is searchable');
  } catch (e) {
    return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? ". Connect the TimothyOS integration to the Captain's Log (... > Connections)" : '');
  }
}

// ---- Captain's Log: Ask about chosen entries (bridge 1.20) -----------------
// Timothy narrows the field in the open LOG (a search, a month, two months, or one week
// for REVIEW's summary); only those entries go to Claude, for that one question and its
// follow-ups. Behind the PIN like the rest of the log. Capped per question at 62 entries
// and about 60K tokens, and a date range at 62 days, so a whole year can't be sent at
// once. Claude has no tools here: it can't fetch more entries or change anything. Nothing
// is cached; answers are saved only when he taps SAVE, as an undated page in the Log
// database (Source "Claude insight"), which every date-based log view skips.
var LOG_ASK_MAX_ENTRIES = 62, LOG_ASK_MAX_TOKENS = 60000, LOG_ASK_MAX_DAYS = 62, LOG_ASK_OUT = { fast: 900, deep: 1500, summary: 500 };
var LOG_INSIGHT = 'Claude insight';
var LOG_ASK_RULES = [
  "You are the ship's computer inside TimothyOS, reading entries from Timothy's private journal, the Captain's Log. He chose these entries for this question. Address him as Captain.",
  "Use only the entries given (and any other context he sent). Never invent events, people, feelings or dates. If the entries don't answer the question, say so plainly.",
  "Cite the date of anything you mention as yyyy-mm-dd in brackets, like [2026-10-04]; the app turns those into links. Quote at most a short phrase at a time.",
  "Style: calm, warm, concise. Plain text: short paragraphs or lines starting with '- '. No headings, tables, emoji or em dashes. Lead with the answer.",
  "Reflect, don't diagnose: no medical or therapeutic judgments, and no advice unless he asks for it."
].join('\n');

/** The entries in scope, oldest first: { from, to } (at most 62 days) or { dates: [...] } (at most 62). */
function logAskEntries_(scope) {
  scope = scope || {};
  var ds = logSource_(), pages = [];
  if (Array.isArray(scope.dates)) {
    var want = {}; scope.dates.forEach(function (d) { d = String(d); if (realDay_(d)) want[d] = true; });
    var list = Object.keys(want).sort();
    if (!list.length) return { error: 'bad_request' };
    if (list.length > LOG_ASK_MAX_ENTRIES) return { error: 'log_ask_too_big', count: list.length };
    for (var i = 0; i < list.length; i += 20) {
      var ors = list.slice(i, i + 20).map(function (d) { return { property: 'Date', date: { equals: d } }; });
      pages = pages.concat(queryAll_(ds, ors.length === 1 ? ors[0] : { or: ors }, 1));
    }
  } else {
    var from = String(scope.from || ''), to = String(scope.to || '');
    if (!realDay_(from) || !realDay_(to) || to < from) return { error: 'bad_request' };
    if ((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000 + 1 > LOG_ASK_MAX_DAYS) return { error: 'log_ask_too_big', days: true };
    pages = queryAll_(ds, { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] }, 2);
  }
  var seen = {}, out = [];
  pages.forEach(function (pg) {
    var d = day_((pg.properties || {}).Date); if (!d || seen[d]) return;
    seen[d] = pg;
  });
  var days = Object.keys(seen).sort();
  if (days.length > LOG_ASK_MAX_ENTRIES) return { error: 'log_ask_too_big', count: days.length };
  days.forEach(function (d) {
    var pg = seen[d], copy = plain_(((pg.properties || {})[LOG_SEARCH_PROP] || {}).rich_text);
    // the one-line search copy when it's there (one query for all), else the page itself
    var text = copy && copy !== LOG_EMPTY ? copy : copy === LOG_EMPTY ? '' : logBlocksText_(logBlocks_(pg.id));
    if (text.trim()) out.push({ date: d, text: text });
  });
  return { entries: out };
}
function logAskBlock_(entries) {
  if (!entries.length) return "CAPTAIN'S LOG ENTRIES: none in this period.";
  return "CAPTAIN'S LOG ENTRIES (" + entries.length + ', ' + entries[0].date + ' to ' + entries[entries.length - 1].date + ')\n\n' +
    entries.map(function (e) { return '=== ' + e.date + ' (' + WEEKDAYS[new Date(e.date + 'T12:00:00Z').getUTCDay()] + ')\n' + e.text; }).join('\n\n');
}
/** Rough tokens (about 3.6 characters each) and cost: the entries are written to the prompt cache on the first question. */
function logAskEstimate_(block, extra) {
  var entTok = Math.ceil(block.length / 3.6), otherTok = Math.ceil((LOG_ASK_RULES.length + (extra || 0)) / 3.6) + 300;
  var usd = function (model, out) { var p = aiPrice_(model) || AI_PRICE_OTHER; return Math.round((entTok * p[2] + otherTok * p[0] + out * p[1]) / 1e6 * 10000) / 10000; };
  return { tokens: entTok + otherTok, usd: { fast: usd(aiFast_(), LOG_ASK_OUT.fast * 3), deep: usd(AI.DEEP, LOG_ASK_OUT.deep * 3) } };
}
function logAsk_(body) {
  if (!aiKey_()) return { ok: false, error: 'ai_not_configured' };
  var mode = body.mode === 'deep' || body.mode === 'summary' ? body.mode : 'fast';
  var got = logAskEntries_(body.scope);
  if (got.error) return { ok: false, error: got.error, count: got.count, days: got.days };
  var entries = got.entries;
  if (!entries.length && mode !== 'summary') return { ok: false, error: 'log_ask_empty' };
  var context = String(body.context || '').slice(0, 20000), block = logAskBlock_(entries), est = logAskEstimate_(block, context.length);
  if (est.tokens > LOG_ASK_MAX_TOKENS) return { ok: false, error: 'log_ask_too_big', count: entries.length, tokens: est.tokens };
  var info = { count: entries.length, from: entries.length ? entries[0].date : null, to: entries.length ? entries[entries.length - 1].date : null, tokens: est.tokens, usd: est.usd };
  if (body.preview) return { ok: true, version: VERSION, preview: info };

  var turns = (Array.isArray(body.messages) ? body.messages : []).slice(-12).filter(function (m) {
    return (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim();
  }).map(function (m) { return { role: m.role, content: m.text.slice(0, 4000) }; });
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { ok: false, error: 'bad_request' };
  var spend = aiSpend_();
  if (aiPaused_(spend)) return { ok: false, error: 'ai_budget', spend: spend };
  // the entries come first and are cached, so a follow-up on the same entries costs a fraction
  turns[0].content = [{ type: 'text', text: block, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: (context ? 'OTHER CONTEXT FROM THE APP\n' + context + '\n\n' : '') + 'QUESTION\n' + turns[0].content }];
  var model = mode === 'deep' ? AI.DEEP : mode === 'summary' ? AI.SUMMARY : aiFast_();
  var system = LOG_ASK_RULES + (mode === 'summary' ? "\nTask: write this week's summary in 4 to 6 sentences from the review in OTHER CONTEXT and the journal entries: what the week held, what moved forward, what slipped, one observation about balance, and one suggestion for next week. Plain prose, no lists, no dates or brackets, and don't quote the journal." : '');
  var payload = { model: model, max_tokens: mode === 'deep' ? 8000 : 4000, system: system, messages: turns };
  if (model !== 'claude-haiku-4-5') payload.output_config = { effort: mode === 'fast' ? AI.FAST_EFFORT : AI.DEEP_EFFORT };
  var betas = [];
  if (/^claude-(sonnet-5-5|opus-5-5)/.test(model)) { payload.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }
  var res;
  try { res = claude_(payload, betas); } catch (e) {
    if (!e.ai) throw e;
    return { ok: false, error: e.ai, detail: String(e.message).slice(0, 300), spend: aiSpend_() };
  }
  var served = res.model || model, u = res.usage || {}, cost = aiCost_(served, u);
  spend = aiAddSpend_(cost);
  aiLogAdd_({ t: new Date().toISOString(), mode: mode === 'summary' ? 'logsummary' : 'log', model: served, steps: 1, in: u.input_tokens || 0, out: u.output_tokens || 0,
    cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, usd: Math.round(cost * 100000) / 100000, unknown: aiPrice_(served) ? undefined : true });
  var text = (res.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n\n').trim();
  if (res.stop_reason === 'refusal') text = "That's outside what I can help with here.";
  else if (res.stop_reason === 'max_tokens') text += '\n\n(Answer cut short.)';
  return { ok: true, version: VERSION, reply: text || '(No answer.)', model: served, cost: Math.round(cost * 10000) / 10000, spend: aiSpend_(), info: info };
}
/** SAVE: an answer kept as an undated page in the Log database, Source "Claude insight". */
function logInsightSave_(ins) {
  var title = String(ins.title || '').trim().slice(0, 200), text = String(ins.text || '').slice(0, 20000), q = String(ins.question || '').slice(0, 2000), scope = String(ins.scope || '').slice(0, 300);
  if (!title || !text.trim()) return { ok: false, error: 'bad_request' };
  var paras = [{ type: 'paragraph', text: 'Question: ' + q }, { type: 'paragraph', text: 'Entries: ' + scope }].concat(logParas_(text)).filter(function (p) { return p.text.trim(); });
  var pg = logNotion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: logSource_() },
    properties: logSearchProps_({ Name: { title: rt_(title) }, Source: { select: { name: LOG_INSIGHT } } }, []), children: paras.slice(0, 100).map(logBlock_) });
  return { ok: true, version: VERSION, insight: { id: pg.id, title: title, url: pg.url || '', created: pg.created_time || new Date().toISOString() } };
}
function logInsights_() {
  var pages = queryAll_(logSource_(), { property: 'Source', select: { equals: LOG_INSIGHT } }, 1, [{ timestamp: 'created_time', direction: 'descending' }]);
  return { ok: true, version: VERSION, insights: pages.map(function (pg) { return { id: pg.id, title: plain_(((pg.properties || {}).Name || {}).title) || 'Insight', url: pg.url || '', created: pg.created_time || null }; }) };
}
function logInsight_(id) {
  if (!/^[0-9A-Za-z-]{20,40}$/.test(id)) return { ok: false, error: 'bad_request' };
  var pg = notion_('get', '/pages/' + id);
  var src = ((pg.parent || {}).data_source_id || '').replace(/-/g, ''), mine = String(logSource_()).replace(/-/g, '');
  if (src !== mine || sel_((pg.properties || {}).Source) !== LOG_INSIGHT) return { ok: false, error: 'not_writable' };
  return { ok: true, version: VERSION, insight: { id: pg.id, title: plain_(((pg.properties || {}).Name || {}).title), url: pg.url || '', text: logBlocksText_(logBlocks_(pg.id)) } };
}

// ---- Habits ----------------------------------------------------------------
// One page per day in the Habits database: Meditated and Evening Walk (checkboxes),
// Water (L) in half-litre steps (a 1 L bottle), Debit Card (Did Not Swipe / Swiped).
// The app sends the whole day at once, so a repeat is harmless.
var HABIT_CARD = { kept: 'Did Not Swipe', swiped: 'Swiped' }, HABIT_MAX_DAYS = 400;
function habitsSource_() { return sourceFor_(CONFIG.NOTION_HABITS_DATABASE, 'NOTION_HABITS_SOURCE'); }
function toHabit_(pg) {
  var p = pg.properties || {}, w = p['Water (L)'], card = sel_(p['Debit Card']);
  return {
    id: pg.id, date: day_(p.Date),
    med: !!(p.Meditated && p.Meditated.checkbox), walk: !!(p['Evening Walk'] && p['Evening Walk'].checkbox),
    water: w && typeof w.number === 'number' ? w.number : null,
    card: card === HABIT_CARD.kept ? 'kept' : card === HABIT_CARD.swiped ? 'swiped' : null
  };
}
function habitsGen_() { return CacheService.getScriptCache().get('hgen') || '0'; }
function habitsBump_() { CacheService.getScriptCache().put('hgen', Utilities.getUuid().slice(0, 8), 21600); }
/** Recorded days from `from` to `to` (yyyy-mm-dd, inclusive, at most 400 days). */
function habits_(from, to) {
  from = String(from || ''); to = String(to || '');
  if (!realDay_(from) || !realDay_(to) || to < from || (new Date(to) - new Date(from)) / 86400000 > HABIT_MAX_DAYS) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), key = 'habits:' + habitsGen_() + ':' + from + ':' + to, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(habitsSource_(), { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] }, 5)
    .map(toHabit_).filter(function (h) { return h.date; });
  var out = { ok: true, version: VERSION, from: from, to: to, days: rows };
  try { cache.put(key, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
/** One day's habits, whole: creates the day's page if there is none, otherwise sets every field. */
function habitSet_(d) {
  d = d || {};
  var date = String(d.date || '');
  if (!realDay_(date)) return { ok: false, error: 'bad_request' };
  var water = d.water === null || d.water === undefined || d.water === '' ? null : Number(d.water);
  if (water !== null && (!isFinite(water) || water < 0 || water > 12 || Math.round(water * 2) !== water * 2)) return { ok: false, error: 'bad_request' };
  if (d.card !== null && d.card !== undefined && !HABIT_CARD[d.card]) return { ok: false, error: 'bad_request' };
  var props = {
    Meditated: { checkbox: d.med === true }, 'Evening Walk': { checkbox: d.walk === true },
    'Water (L)': { number: water }, 'Debit Card': { select: d.card ? { name: HABIT_CARD[d.card] } : null }
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = habitsSource_(), found = queryAll_(ds, { property: 'Date', date: { equals: date } }, 1)[0], pg;
    if (found) pg = notion_('patch', '/pages/' + found.id, { properties: props });
    else {
      props.Name = { title: rt_(longDay_(date)) };
      props.Date = { date: { start: date } };
      pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    habitsBump_();
    return { ok: true, version: VERSION, day: toHabit_(pg) };
  } finally {
    lock.releaseLock();
  }
}
function habitsStatus_() {
  try { var n = queryAll_(habitsSource_(), null, 1).length; return 'OK (' + (n >= 100 ? '100+' : n) + ' days recorded)'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Habits (... > Connections)' : ''); }
}

// ---- Library -----------------------------------------------------------------
// One page per book. The app finds books on Open Library itself (titles, authors,
// cover links); the bridge only keeps the shelf in Notion.
var BOOK_STATUS = { want: 'Want to Read', reading: 'Reading', read: 'Read', aside: 'Set Aside' };
function librarySource_() { return sourceFor_(CONFIG.NOTION_LIBRARY_DATABASE, 'NOTION_LIBRARY_SOURCE'); }
function toBook_(pg) {
  var p = pg.properties || {}, st = sel_(p.Status), status = 'want';
  Object.keys(BOOK_STATUS).forEach(function (k) { if (BOOK_STATUS[k] === st) status = k; });
  var num = function (x) { return x && typeof x.number === 'number' ? x.number : null; };
  return {
    id: pg.id, url: pg.url, title: plain_(p.Title && p.Title.title) || 'Untitled', author: plain_(p.Author && p.Author.rich_text),
    status: status, started: day_(p.Started), finished: day_(p.Finished), rating: num(p.Rating), notes: plain_(p.Notes && p.Notes.rich_text),
    cover: (p.Cover && p.Cover.url) || '', ol: (p['Open Library'] && p['Open Library'].url) || '', year: num(p.Published), created: pg.created_time || ''
  };
}
function libraryGen_() { return CacheService.getScriptCache().get('lgen') || '0'; }
function library_() {
  var cache = CacheService.getScriptCache(), key = 'library:' + libraryGen_(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var out = { ok: true, version: VERSION, books: queryAll_(librarySource_(), null, 10).map(toBook_) };
  try { cache.put(key, JSON.stringify(out), 300); } catch (x) { /* too large to cache */ }
  return out;
}
var OL_COVER = /^https:\/\/covers\.openlibrary\.org\/[\w\/.-]+$/, OL_PAGE = /^https:\/\/openlibrary\.org\/[\w\/.-]+$/;
/** Add a book (with cid) or change one (with id). Only the fields sent are written. */
function bookSave_(b) {
  b = b || {};
  var props = {}, has = function (k) { return Object.prototype.hasOwnProperty.call(b, k); };
  if (has('title') || !b.id) {
    var title = String(b.title || '').trim();
    if (!title || title.length > 200) return { ok: false, error: 'bad_title' };
    props.Title = { title: rt_(title) };
  }
  if (has('author')) { var au = String(b.author || '').trim(); if (au.length > 200) return { ok: false, error: 'bad_request' }; props.Author = { rich_text: au ? rt_(au) : [] }; }
  if (has('status') || !b.id) { if (!BOOK_STATUS[b.status || 'want']) return { ok: false, error: 'bad_request' }; props.Status = { select: { name: BOOK_STATUS[b.status || 'want'] } }; }
  var dates = { started: 'Started', finished: 'Finished' }, bad = false;
  Object.keys(dates).forEach(function (k) {
    if (!has(k)) return;
    if (b[k] !== null && !realDay_(String(b[k]))) bad = true;
    props[dates[k]] = { date: b[k] ? { start: String(b[k]) } : null };
  });
  if (has('rating')) { var r = b.rating === null ? null : Number(b.rating); if (r !== null && !(r >= 1 && r <= 5 && Math.round(r) === r)) bad = true; props.Rating = { number: r }; }
  if (has('notes')) { var nt = String(b.notes || ''); if (nt.length > 4000) bad = true; props.Notes = { rich_text: nt.trim() ? rt_(nt.trim()) : [] }; }
  if (has('cover')) { var cv = String(b.cover || ''); if (cv && !OL_COVER.test(cv)) bad = true; props.Cover = { url: cv || null }; }
  if (has('ol')) { var ol = String(b.ol || ''); if (ol && !OL_PAGE.test(ol)) bad = true; props['Open Library'] = { url: ol || null }; }
  if (has('year')) { var y = b.year === null ? null : Number(b.year); if (y !== null && !(y > 0 && y < 3000 && Math.round(y) === y)) bad = true; props.Published = { number: y }; }
  if (bad) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = librarySource_(), cache = CacheService.getScriptCache(), pg;
    if (b.id) {
      var cur = notion_('get', '/pages/' + String(b.id));
      if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== ds.replace(/-/g, '')) return { ok: false, error: 'not_writable' };
      pg = notion_('patch', '/pages/' + cur.id, { properties: props });
    } else {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(b.cid || ''))) return { ok: false, error: 'bad_request' };
      var seen = cache.get('bcid:' + b.cid);
      if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
      pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    cache.put('lgen', Utilities.getUuid().slice(0, 8), 21600);
    var out = { ok: true, version: VERSION, book: toBook_(pg) };
    if (!b.id) cache.put('bcid:' + b.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}
/** Take a book off the shelf (to Notion's trash, where it can be restored). */
function bookRemove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = librarySource_(), cur = notion_('get', '/pages/' + String(id || ''));
    if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== ds.replace(/-/g, '')) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + cur.id, { in_trash: true });
    CacheService.getScriptCache().put('lgen', Utilities.getUuid().slice(0, 8), 21600);
    return { ok: true, version: VERSION, removed: cur.id };
  } finally {
    lock.releaseLock();
  }
}
function libraryStatus_() {
  try { var n = library_().books.length; return 'OK (' + n + (n === 1 ? ' book)' : ' books)'); }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Library (... > Connections)' : ''); }
}

// ---- Inbox (bridge 1.33) ------------------------------------------------------------
// Notes captured in TimothyOS (CAPTURE → NOTE) to sort later, one page per note: Note (the text, as the title),
// Captured (when), Status (New, Sorted, Kept) and Sorted As (Task, Key Date, Event, Queue). The app makes the task,
// key date, event or queue item through their own actions, then marks the note Sorted; a sorted note stays in
// Notion as the record. Remove moves a page to Notion's trash. Only pages in the Inbox can be changed.
var INBOX_STATUS = { new: 'New', sorted: 'Sorted', kept: 'Kept' };
var INBOX_AS = { task: 'Task', date: 'Key Date', event: 'Event', queue: 'Queue' };
function inboxSource_() { return sourceFor_(CONFIG.NOTION_INBOX_DATABASE, 'NOTION_INBOX_SOURCE'); }
function inboxGen_() { return CacheService.getScriptCache().get('igen') || '0'; }
function inboxBump_() { CacheService.getScriptCache().put('igen', Utilities.getUuid().slice(0, 8), 21600); }
function toNote_(pg) {
  var p = pg.properties || {}, st = sel_(p.Status), as = sel_(p['Sorted As']), key = function (map, v) { return Object.keys(map).filter(function (k) { return map[k] === v; })[0] || null; };
  var cap = p.Captured && p.Captured.date && p.Captured.date.start;
  return { id: pg.id, url: pg.url, text: plain_(p.Note && p.Note.title), at: cap || pg.created_time || null, status: key(INBOX_STATUS, st) || 'new', as: key(INBOX_AS, as) };
}
/** Notes waiting (oldest first) and kept (newest first, at most 200). */
function inbox_() {
  var cache = CacheService.getScriptCache(), k = 'inbox:' + inboxGen_(), hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  var ds = inboxSource_();
  var waiting = queryAll_(ds, { property: 'Status', select: { equals: 'New' } }, 3, [{ property: 'Captured', direction: 'ascending' }, { timestamp: 'created_time', direction: 'ascending' }]).map(toNote_);
  var kept = queryAll_(ds, { property: 'Status', select: { equals: 'Kept' } }, 2, [{ property: 'Captured', direction: 'descending' }]).map(toNote_);
  var out = { ok: true, version: VERSION, waiting: waiting, kept: kept, url: 'https://www.notion.so/' + String(CONFIG.NOTION_INBOX_DATABASE).replace(/-/g, '') };
  try { cache.put(k, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
/** A new note: { cid, text (at most 2000 characters), at (ISO, when it was captured) }. Safe to repeat (cid). */
function inboxAdd_(n) {
  var text = String(n.text || '').replace(/\r\n/g, '\n').trim();
  if (!text || text.length > 2000) return { ok: false, error: 'bad_title' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(n.cid || ''))) return { ok: false, error: 'bad_request' };
  var at = n.at && ISO.test(String(n.at)) ? new Date(String(n.at)) : new Date();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cache = CacheService.getScriptCache(), seen = cache.get('icid:' + n.cid);
    if (seen) { var prior = JSON.parse(seen); prior.duplicate = true; return prior; }
    var tz = Session.getScriptTimeZone();
    var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: inboxSource_() }, properties: {
      Note: { title: rt_(text) }, Captured: { date: { start: Utilities.formatDate(at, tz, "yyyy-MM-dd'T'HH:mm:ss"), time_zone: tz } }, Status: { select: { name: 'New' } } } });
    inboxBump_();
    var out = { ok: true, version: VERSION, note: toNote_(pg) };
    cache.put('icid:' + n.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}
function inboxOwn_(id) {
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return null;
  var cur = notion_('get', '/pages/' + id);
  return cur.parent && String(cur.parent.data_source_id || '').replace(/-/g, '') === inboxSource_().replace(/-/g, '') && !cur.in_trash ? cur : null;
}
/** Mark a note: status new | sorted | kept; as (task | date | event | queue) only with sorted. Set-to-value, safe to repeat. */
function inboxSet_(id, status, as) {
  if (!INBOX_STATUS[status] || (as !== null && !INBOX_AS[as]) || (as && status !== 'sorted')) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!inboxOwn_(id)) return { ok: false, error: 'not_writable' };
    var pg = notion_('patch', '/pages/' + id, { properties: { Status: { select: { name: INBOX_STATUS[status] } }, 'Sorted As': { select: as ? { name: INBOX_AS[as] } : null } } });
    inboxBump_();
    return { ok: true, version: VERSION, note: toNote_(pg) };
  } finally {
    lock.releaseLock();
  }
}
function inboxRemove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!inboxOwn_(id)) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + id, { in_trash: true });
    inboxBump_();
    return { ok: true, version: VERSION, removed: id };
  } finally {
    lock.releaseLock();
  }
}
function inboxStatus_() {
  try { var b = inbox_(); return 'OK (' + b.waiting.length + ' waiting, ' + b.kept.length + ' kept)'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Inbox (... > Connections)' : ''); }
}

// ---- SCIENCE (bridge 1.34) ----------------------------------------------------------
// Free public feeds the iPad can't call itself (they don't allow browser requests): aircraft near the rounded
// location the app sends, from the community ADS-B network (adsb.lol, with adsb.fi if it doesn't answer); orbits
// of the ISS, China's station and Hubble from CelesTrak; shortwave band conditions from N0NBH (hamqsl.com); and
// eBird's notable sightings, only once EBIRD_API_KEY is in Script Properties. Read-only, cached briefly.
// The Science Log is a Notion database of events the station noticed: logged once each (by Key), starrable.
var SCI_SATS = { iss: [25544, 'ISS'], css: [48274, 'Tiangong'], hst: [20580, 'Hubble'] };
var SCI_DEPTS = { sky: 'Sky', space: 'Space', earth: 'Earth', night: 'Night', nature: 'Nature' };
var SCI_KINDS = { aircraft: 'Aircraft', station: 'Space Station', storm: 'Geomagnetic Storm', flare: 'Solar Flare', quake: 'Earthquake', alert: 'Weather Alert',
  moon: 'Moon', eclipse: 'Eclipse', meteors: 'Meteor Shower', asteroid: 'Asteroid', bird: 'Bird' };
var SCI_NM = 27;   // the scope's 50 km, in the nautical miles the ADS-B feeds use
function sciPlace_(lat, lon) {
  lat = Number(lat); lon = Number(lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };   // about 1 km, as for the weather
}
function sciFetch_(url, headers) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: headers || {} });
  if (r.getResponseCode() !== 200) { var e = new Error('HTTP ' + r.getResponseCode() + ' from ' + url.split('/')[2]); e.sci = 'feed_unavailable'; throw e; }
  return r.getContentText();
}
function sciKm_(a, b) {   // distance (km) and bearing (degrees) from a to b
  var R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad, la1 = a.lat * rad, la2 = b.lat * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var brg = Math.atan2(Math.sin(dLon) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)) / rad;
  return { km: Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10, dir: Math.round((brg + 360) % 360) };
}
/** Aircraft within 50 km: { hex, cs, reg, type, alt, gs, track, km, dir, sq, mil, emergency, cat }. Cached 8 s. */
function sky_(lat, lon) {
  var pl = sciPlace_(lat, lon);
  if (!pl) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), key = 'sky:' + pl.lat + ':' + pl.lon, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var list, src = 'adsb.lol';
  try { list = JSON.parse(sciFetch_('https://api.adsb.lol/v2/lat/' + pl.lat + '/lon/' + pl.lon + '/dist/' + SCI_NM)).ac; }
  catch (e) {
    try { src = 'adsb.fi'; list = JSON.parse(sciFetch_('https://opendata.adsb.fi/api/v2/lat/' + pl.lat + '/lon/' + pl.lon + '/dist/' + SCI_NM)).aircraft; }
    catch (e2) { return { ok: false, error: 'feed_unavailable', detail: String(e2.message || e2) }; }
  }
  var num = function (x) { return typeof x === 'number' && isFinite(x) ? x : null; };
  var aircraft = (list || []).filter(function (a) { return num(a.lat) !== null && num(a.lon) !== null && a.alt_baro !== 'ground'; }).map(function (a) {
    var d = sciKm_(pl, { lat: a.lat, lon: a.lon });
    return { hex: String(a.hex || '').replace(/^~/, ''), cs: String(a.flight || '').trim(), reg: a.r || '', type: a.t || '', alt: num(a.alt_baro), gs: num(a.gs) === null ? null : Math.round(a.gs),
      track: num(a.track) === null ? null : Math.round(a.track), km: d.km, dir: d.dir, sq: a.squawk || '', mil: !!(Number(a.dbFlags) & 1), emergency: a.emergency && a.emergency !== 'none' ? String(a.emergency) : '', cat: a.category || '' };
  }).filter(function (a) { return a.km <= 50.5; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 60);
  var out = { ok: true, version: VERSION, at: new Date().toISOString(), source: src, aircraft: aircraft };
  try { cache.put(key, JSON.stringify(out), 8); } catch (x) { /* too large to cache */ }
  return out;
}
function sciTle_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('tle');
  if (hit) return JSON.parse(hit);
  var out = {};
  Object.keys(SCI_SATS).forEach(function (k) {
    var lines = sciFetch_('https://celestrak.org/NORAD/elements/gp.php?CATNR=' + SCI_SATS[k][0] + '&FORMAT=TLE').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var i = lines.findIndex(function (l) { return l.indexOf('1 ') === 0; });
    if (i < 0 || !lines[i + 1] || lines[i + 1].indexOf('2 ') !== 0) { var e = new Error('No orbit for ' + SCI_SATS[k][1]); e.sci = 'feed_unavailable'; throw e; }
    out[k] = { name: SCI_SATS[k][1], l1: lines[i], l2: lines[i + 1] };
  });
  cache.put('tle', JSON.stringify(out), 43200);
  return out;
}
function sciBands_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('bands');
  if (hit) return JSON.parse(hit);
  var x = sciFetch_('https://www.hamqsl.com/solarxml.php'), tag = function (n) { var m = x.match(new RegExp('<' + n + '>\\s*([^<]*?)\\s*</' + n + '>')); return m ? m[1] : ''; };
  var bands = [], re = /<band name="([^"]+)" time="(day|night)">\s*([^<]*?)\s*<\/band>/g, m;
  while ((m = re.exec(x))) bands.push({ name: m[1], time: m[2], cond: m[3] });
  var out = { updated: tag('updated'), flux: tag('solarflux'), sunspots: tag('sunspots'), kindex: tag('kindex'), xray: tag('xray'), noise: tag('signalnoise'), bands: bands };
  cache.put('bands', JSON.stringify(out), 3600);
  return out;
}
function sciBirds_(pl) {
  var k = PropertiesService.getScriptProperties().getProperty('EBIRD_API_KEY');
  if (!k || !pl) return null;
  var cache = CacheService.getScriptCache(), key = 'ebird:' + pl.lat + ':' + pl.lon, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = JSON.parse(sciFetch_('https://api.ebird.org/v2/data/obs/geo/recent/notable?lat=' + pl.lat + '&lng=' + pl.lon + '&dist=25&back=7&detail=simple', { 'X-eBirdApiToken': k }));
  var seen = {}, out = [];
  rows.forEach(function (r) {
    if (seen[r.speciesCode]) return; seen[r.speciesCode] = 1;
    var d = sciKm_(pl, { lat: r.lat, lon: r.lng });
    out.push({ id: r.subId + ':' + r.speciesCode, name: r.comName, sci: r.sciName, at: r.obsDt, loc: r.locName, count: r.howMany || null, km: d.km, dir: d.dir });
  });
  out = out.slice(0, 40);
  cache.put(key, JSON.stringify(out), 3600);
  return out;
}
/** The slow feeds in one call: orbits (12 h), band conditions (1 h), eBird notables (1 h, with a key). Each part reports its own error. */
function sciFeeds_(lat, lon) {
  var pl = sciPlace_(lat, lon), out = { ok: true, version: VERSION };
  try { out.tle = sciTle_(); } catch (e) { out.tleError = e.sci || 'feed_unavailable'; }
  try { out.bands = sciBands_(); } catch (e2) { out.bandsError = e2.sci || 'feed_unavailable'; }
  try { out.birds = sciBirds_(pl); if (out.birds === null) delete out.birds; } catch (e3) { out.birdsError = e3.sci || 'feed_unavailable'; }
  out.ebird = !!PropertiesService.getScriptProperties().getProperty('EBIRD_API_KEY');
  return out;
}
function sciStatus_() {
  var s = sciFeeds_(null, null);
  return [s.tle ? 'orbits OK' : 'orbits: ' + s.tleError, s.bands ? 'band conditions OK' : 'band conditions: ' + s.bandsError, s.ebird ? 'eBird key set' : 'eBird OFF (add EBIRD_API_KEY for notable birds)'].join(', ');
}
function scienceSource_() { return sourceFor_(CONFIG.NOTION_SCIENCE_DATABASE, 'NOTION_SCIENCE_SOURCE'); }
function scienceGen_() { return CacheService.getScriptCache().get('sgen') || '0'; }
function scienceBump_() { CacheService.getScriptCache().put('sgen', Utilities.getUuid().slice(0, 8), 21600); }
function toSci_(pg) {
  var p = pg.properties || {}, key = function (map, v) { return Object.keys(map).filter(function (k) { return map[k] === v; })[0] || null; };
  return { id: pg.id, url: pg.url, title: plain_(p.Event && p.Event.title), at: (p.When && p.When.date && p.When.date.start) || null, dept: key(SCI_DEPTS, sel_(p.Department)), kind: key(SCI_KINDS, sel_(p.Kind)),
    detail: plain_(p.Detail && p.Detail.rich_text), value: p.Value && typeof p.Value.number === 'number' ? p.Value.number : null, starred: !!(p.Starred && p.Starred.checkbox), key: plain_(p.Key && p.Key.rich_text) };
}
/** Events between two days (yyyy-mm-dd, at most 400 apart), newest first. */
function scienceLog_(from, to) {
  if (!YMD.test(from) || !YMD.test(to) || to < from || (new Date(to) - new Date(from)) / 864e5 > 400) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), k = 'sci:' + scienceGen_() + ':' + from + ':' + to, hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(scienceSource_(), { and: [{ property: 'When', date: { on_or_after: from } }, { property: 'When', date: { on_or_before: to } }] }, 10, [{ property: 'When', direction: 'descending' }]).map(toSci_);
  var out = { ok: true, version: VERSION, events: rows, url: 'https://www.notion.so/' + String(CONFIG.NOTION_SCIENCE_DATABASE).replace(/-/g, '') };
  try { cache.put(k, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
/** Up to 25 events: { key, at (ISO), dept, kind, title, detail, value, starred }. An event whose Key is already logged is skipped. */
function scienceLogAdd_(events) {
  if (!Array.isArray(events) || !events.length || events.length > 25) return { ok: false, error: 'bad_request' };
  var bad = events.some(function (e) {
    return !e || !/^[A-Za-z0-9:._\-]{3,120}$/.test(String(e.key || '')) || !ISO.test(String(e.at || '')) || !SCI_DEPTS[e.dept] || !SCI_KINDS[e.kind] ||
      !String(e.title || '').trim() || String(e.title).length > 200 || String(e.detail || '').length > 500 || (e.value !== null && e.value !== undefined && !isFinite(Number(e.value)));
  });
  if (bad) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = scienceSource_(), cache = CacheService.getScriptCache(), tz = Session.getScriptTimeZone();
    var first = events.map(function (e) { return e.at; }).sort()[0], since = Utilities.formatDate(new Date(Date.parse(first) - 2 * 864e5), tz, 'yyyy-MM-dd'), have = {};
    queryAll_(ds, { property: 'When', date: { on_or_after: since } }, 5).forEach(function (pg) { var k = plain_((pg.properties || {}).Key && pg.properties.Key.rich_text); if (k) have[k] = pg.id; });
    var added = [], skipped = [];
    events.forEach(function (e) {
      var known = have[e.key] || cache.get('skey:' + e.key);
      if (known) { skipped.push({ key: e.key, id: known }); return; }
      var pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: {
        Event: { title: rt_(String(e.title).trim()) }, When: { date: { start: Utilities.formatDate(new Date(e.at), tz, "yyyy-MM-dd'T'HH:mm:ss"), time_zone: tz } },
        Department: { select: { name: SCI_DEPTS[e.dept] } }, Kind: { select: { name: SCI_KINDS[e.kind] } }, Detail: { rich_text: rt_(String(e.detail || '').trim()) },
        Value: { number: e.value === null || e.value === undefined ? null : Number(e.value) }, Starred: { checkbox: e.starred === true }, Key: { rich_text: rt_(e.key) } } });
      have[e.key] = pg.id; cache.put('skey:' + e.key, pg.id, 21600);
      added.push({ key: e.key, id: pg.id });
    });
    if (added.length) scienceBump_();
    return { ok: true, version: VERSION, added: added, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}
function scienceStar_(id, starred) {
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return { ok: false, error: 'not_writable' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cur = notion_('get', '/pages/' + id);
    if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== scienceSource_().replace(/-/g, '') || cur.in_trash) return { ok: false, error: 'not_writable' };
    var pg = notion_('patch', '/pages/' + id, { properties: { Starred: { checkbox: starred } } });
    scienceBump_();
    return { ok: true, version: VERSION, event: toSci_(pg) };
  } finally {
    lock.releaseLock();
  }
}
function scienceStatus_() {
  try { var t = new Date(), f = new Date(t.getTime() - 30 * 864e5), n = scienceLog_(f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)).events.length; return 'OK (' + n + (n === 1 ? ' event' : ' events') + ' in 30 days)'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Science Log (... > Connections)' : ''); }
}

// ---- Tarot ---------------------------------------------------------------------
// One database, three kinds of page: Reading (one per reading; Weekly marks the card for the week),
// Meaning (your own words for a card, one per card) and Spread (a layout you made). The app's own
// record of positions, cards and notes is in Data; Cards and Interpretation are there to read in Notion.
var TAROT_MAJOR = ['The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor', 'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance', 'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun', 'Judgement', 'The World'];
var TAROT_RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
var TAROT_SUITS = { W: 'Wands', C: 'Cups', S: 'Swords', P: 'Pentacles' };
var TAROT_CARD = /^(M([0-9]|1[0-9]|2[01])|[WCSP]([1-9]|1[0-4]))$/;
function tarotSource_() { return sourceFor_(CONFIG.NOTION_TAROT_DATABASE, 'NOTION_TAROT_SOURCE'); }
function tarotName_(c) { return c.charAt(0) === 'M' ? TAROT_MAJOR[Number(c.slice(1))] : TAROT_RANKS[Number(c.slice(1)) - 1] + ' of ' + TAROT_SUITS[c.charAt(0)]; }
function tarotGen_() { return CacheService.getScriptCache().get('tgen') || '0'; }
function tarotBump_() { CacheService.getScriptCache().put('tgen', Utilities.getUuid().slice(0, 8), 21600); }
/** Rich text for longer stored values: up to 40 pieces of 2,000 characters. */
function rtLong_(text) {
  var out = [];
  for (var i = 0; i < text.length && out.length < 40; i += 2000) out.push({ text: { content: text.slice(i, i + 2000) } });
  return out;
}
function tarotData_(p) { try { return JSON.parse(plain_(p.Data && p.Data.rich_text) || '{}') || {}; } catch (e) { return {}; } }
function toTarot_(pg) {
  var p = pg.properties || {}, kind = sel_(p.Kind) || 'Reading', d = tarotData_(p);
  var base = { id: pg.id, url: pg.url, kind: kind.toLowerCase(), title: plain_(p.Title && p.Title.title), day: day_(p.Date), created: pg.created_time || '' };
  if (kind === 'Meaning') { base.card = plain_(p.Card && p.Card.rich_text); base.text = plain_(p.Interpretation && p.Interpretation.rich_text); return base; }
  base.pos = Array.isArray(d.pos) ? d.pos : [];
  if (kind === 'Spread') return base;
  base.spread = d.spread || ''; base.sname = plain_(p.Spread && p.Spread.rich_text); base.q = typeof d.q === 'string' ? d.q : base.title;
  base.cards = Array.isArray(d.cards) ? d.cards : []; base.notes = Array.isArray(d.notes) ? d.notes : [];
  base.sum = plain_(p.Interpretation && p.Interpretation.rich_text); base.weekly = !!(p.Weekly && p.Weekly.checkbox);
  return base;
}
/** Readings dated from..to (at most 400 days), plus every Meaning and Spread. */
function tarot_(from, to) {
  from = String(from || ''); to = String(to || '');
  if (!realDay_(from) || !realDay_(to) || from > to) return { ok: false, error: 'bad_range' };
  if ((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 864e5 > 400) return { ok: false, error: 'range_too_long' };
  var cache = CacheService.getScriptCache(), key = 'tarot:' + tarotGen_() + ':' + from + ':' + to, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var ds = tarotSource_();
  var readings = queryAll_(ds, { and: [{ property: 'Kind', select: { equals: 'Reading' } }, { property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] }, 10,
    [{ property: 'Date', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }]).map(toTarot_);
  var other = queryAll_(ds, { or: [{ property: 'Kind', select: { equals: 'Meaning' } }, { property: 'Kind', select: { equals: 'Spread' } }] }, 5).map(toTarot_);
  var out = { ok: true, version: VERSION, readings: readings, meanings: other.filter(function (x) { return x.kind === 'meaning' && x.card; }), spreads: other.filter(function (x) { return x.kind === 'spread'; }) };
  try { cache.put(key, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
function tarotPos_(pos, n) {
  if (!Array.isArray(pos) || pos.length !== n) return null;
  var ok = true, out = pos.map(function (q) {
    q = q || {};
    var l = String(q.l || '').trim(), x = Number(q.x), y = Number(q.y);
    if (!l || l.length > 40 || !(x >= 0 && x <= 12) || !(y >= 0 && y <= 12)) ok = false;
    return { l: l, x: x, y: y, c: q.c ? 1 : 0 };
  });
  return ok ? out : null;
}
function tarotOwn_(id, ds) {
  var cur = notion_('get', '/pages/' + String(id || ''));
  return cur.parent && String(cur.parent.data_source_id || '').replace(/-/g, '') === ds.replace(/-/g, '') ? cur : null;
}
/** Save a reading: new (cid) or changed (id). The whole reading is sent each time. */
function tarotSave_(r) {
  r = r || {};
  var cards = Array.isArray(r.cards) ? r.cards : [], seen = {}, bad = !cards.length || cards.length > 20;
  cards = cards.map(function (c) { c = c || {}; var id = String(c.id || ''); if (!TAROT_CARD.test(id) || seen[id]) bad = true; seen[id] = 1; return { id: id, rev: !!c.rev }; });
  var pos = tarotPos_(r.pos, cards.length), notes = Array.isArray(r.notes) ? r.notes.slice(0, cards.length).map(function (x) { return String(x || '').slice(0, 2000); }) : [];
  var q = String(r.q || '').trim(), sum = String(r.sum || '').trim(), sname = String(r.sname || '').trim(), spread = String(r.spread || '');
  if (bad || !pos || !realDay_(String(r.day || '')) || q.length > 200 || sum.length > 6000 || sname.length > 60 || !/^[\w-]{1,40}$/.test(spread)) return { ok: false, error: 'bad_request' };
  if (r.weekly && cards.length !== 1) return { ok: false, error: 'bad_request' };
  var readable = cards.map(function (c, i) { return (i + 1) + ' ' + pos[i].l + ': ' + tarotName_(c.id) + (c.rev ? ' (reversed)' : ''); }).join('; ');
  var props = {
    Title: { title: rt_(q || (r.weekly ? 'Card for the week: ' + tarotName_(cards[0].id) : 'Open reading')) },
    Date: { date: { start: String(r.day) } }, Kind: { select: { name: 'Reading' } }, Weekly: { checkbox: !!r.weekly },
    Spread: { rich_text: sname ? rt_(sname) : [] }, Cards: { rich_text: rt_(readable) }, Interpretation: { rich_text: sum ? rt_(sum) : [] },
    Data: { rich_text: rtLong_(JSON.stringify({ spread: spread, q: q, pos: pos, cards: cards, notes: notes })) }
  };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = tarotSource_(), cache = CacheService.getScriptCache(), pg;
    if (r.id) {
      if (!tarotOwn_(r.id, ds)) return { ok: false, error: 'not_writable' };
      pg = notion_('patch', '/pages/' + String(r.id), { properties: props });
    } else {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(r.cid || ''))) return { ok: false, error: 'bad_request' };
      var prior = cache.get('tcid:' + r.cid);
      if (prior) { var p0 = JSON.parse(prior); p0.duplicate = true; return p0; }
      pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    if (r.weekly) {   /* one card for the week: any other in the same Monday-to-Sunday week is unmarked */
      var d0 = new Date(String(r.day) + 'T12:00:00Z'), mon = new Date(d0.getTime() - ((d0.getUTCDay() + 6) % 7) * 864e5), sun = new Date(mon.getTime() + 6 * 864e5);
      queryAll_(ds, { and: [{ property: 'Weekly', checkbox: { equals: true } }, { property: 'Date', date: { on_or_after: mon.toISOString().slice(0, 10) } }, { property: 'Date', date: { on_or_before: sun.toISOString().slice(0, 10) } }] }, 1)
        .forEach(function (o) { if (o.id.replace(/-/g, '') !== pg.id.replace(/-/g, '')) notion_('patch', '/pages/' + o.id, { properties: { Weekly: { checkbox: false } } }); });
    }
    tarotBump_();
    var out = { ok: true, version: VERSION, reading: toTarot_(pg) };
    if (!r.id) cache.put('tcid:' + r.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}
/** Your own meaning for a card: one page per card; empty text puts it in Notion's trash. */
function tarotMeaning_(card, text) {
  card = String(card || ''); text = String(text || '').trim();
  if (!TAROT_CARD.test(card) || text.length > 2000) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = tarotSource_(), have = queryAll_(ds, { and: [{ property: 'Kind', select: { equals: 'Meaning' } }, { property: 'Card', rich_text: { equals: card } }] }, 1), pg = null;
    if (!text) { have.forEach(function (o) { notion_('patch', '/pages/' + o.id, { in_trash: true }); }); }
    else {
      var props = { Title: { title: rt_(tarotName_(card)) }, Kind: { select: { name: 'Meaning' } }, Card: { rich_text: rt_(card) }, Interpretation: { rich_text: rt_(text) } };
      pg = have.length ? notion_('patch', '/pages/' + have[0].id, { properties: props }) : notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    tarotBump_();
    return { ok: true, version: VERSION, meaning: pg ? toTarot_(pg) : null, card: card };
  } finally {
    lock.releaseLock();
  }
}
/** A spread you made: name and positions (label, place on the grid, crossing). */
function tarotSpread_(s) {
  s = s || {};
  var nm = String(s.nm || '').trim().toUpperCase(), n = Array.isArray(s.pos) ? s.pos.length : 0, pos = tarotPos_(s.pos, n);
  if (!nm || nm.length > 40 || !n || n > 20 || !pos) return { ok: false, error: 'bad_request' };
  var props = { Title: { title: rt_(nm) }, Kind: { select: { name: 'Spread' } }, Spread: { rich_text: rt_(nm) }, Cards: { rich_text: rt_(pos.map(function (q, i) { return (i + 1) + ' ' + q.l; }).join('; ')) }, Data: { rich_text: rtLong_(JSON.stringify({ pos: pos })) } };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = tarotSource_(), pg;
    if (s.id) { if (!tarotOwn_(s.id, ds)) return { ok: false, error: 'not_writable' }; pg = notion_('patch', '/pages/' + String(s.id), { properties: props }); }
    else pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    tarotBump_();
    return { ok: true, version: VERSION, spread: toTarot_(pg) };
  } finally {
    lock.releaseLock();
  }
}
/** A reading or spread to Notion's trash (restorable there). */
function tarotRemove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = tarotSource_(), cur = tarotOwn_(id, ds);
    if (!cur) return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + cur.id, { in_trash: true });
    tarotBump_();
    return { ok: true, version: VERSION, removed: cur.id };
  } finally {
    lock.releaseLock();
  }
}
function tarotStatus_() {
  try { var t = new Date(), f = new Date(t.getTime() - 90 * 864e5), n = tarot_(f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)).readings.length; return 'OK (' + n + (n === 1 ? ' reading' : ' readings') + ' in 90 days)'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Tarot (... > Connections)' : ''); }
}

// ---- Tarot Books (bridge 1.25) ----------------------------------------------------
// Passages from two tarot books Timothy owns, one page per card per book in 📖 Tarot Books, a private
// database in his Notion. A page's body is the passage: a heading per section, then its paragraphs.
// The book text lives only there, never in this code or the app's repository. It is read when he opens
// BOOKS on a card, and sent to Claude only when he taps SUGGEST. A suggestion is never saved here.
var TAROT_BOOKS = { dean: { name: 'Liz Dean', title: 'The Ultimate Guide to Tarot' }, crispin: { name: 'Jessa Crispin', title: 'The Creative Tarot' } };
var TB_RUN_MS = 50000;   // one IMPORT call stops after about 50 seconds; the app calls again until every page is made
function tarotBooksSource_() { return sourceFor_(CONFIG.NOTION_TAROT_BOOKS_DATABASE, 'NOTION_TAROT_BOOKS_SOURCE'); }
function tbGen_() { return CacheService.getScriptCache().get('tbgen') || '0'; }
function tbBump_() { CacheService.getScriptCache().put('tbgen', Utilities.getUuid().slice(0, 8), 21600); }
function tbBookOf_(name) { for (var k in TAROT_BOOKS) if (TAROT_BOOKS[k].name === name) return k; return null; }
/** Deck order (Major Arcana, then Wands, Cups, Swords, Pentacles), the two books side by side. */
function tbOrder_(code, book) { var i = code.charAt(0) === 'M' ? Number(code.slice(1)) : 22 + 'WCSP'.indexOf(code.charAt(0)) * 14 + Number(code.slice(1)) - 1; return i * 2 + (book === 'crispin' ? 1 : 0); }
/** Every page in the database: card pages by book and code, and the pages without a card (the import file's). */
function tbPages_(ds) {
  var have = {}, loose = [];
  queryAll_(ds, null, 4).forEach(function (pg) {
    var p = pg.properties || {}, b = tbBookOf_(sel_(p.Book)), c = plain_(p.Card && p.Card.rich_text).trim();
    if (b && TAROT_CARD.test(c)) have[b + ':' + c] = pg; else if (!c) loose.push(pg);
  });
  return { have: have, loose: loose };
}
function tbCount_(have) { var n = { dean: 0, crispin: 0 }; Object.keys(have).forEach(function (k) { n[k.split(':')[0]]++; }); return n; }
/** How many card pages each book has, and whether the import file is still there. */
function tarotBooks_() {
  var cache = CacheService.getScriptCache(), key = 'tbooks:' + tbGen_(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var got = tbPages_(tarotBooksSource_()), n = tbCount_(got.have);
  var out = { ok: true, version: VERSION, books: n, per: 78, file: got.loose.length > 0, url: 'https://www.notion.so/' + String(CONFIG.NOTION_TAROT_BOOKS_DATABASE).replace(/-/g, '') };
  cache.put(key, JSON.stringify(out), 600);
  return out;
}
function tarotBooksStatus_() {
  try { var r = tarotBooks_(); return 'OK (Liz Dean ' + r.books.dean + ' of 78, Jessa Crispin ' + r.books.crispin + ' of 78' + (r.file && r.books.dean + r.books.crispin < 156 ? '; tap IMPORT BOOKS in Systems' : '') + ')'; }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to Tarot Books (... > Connections)' : ''); }
}
/** The children of several pages at once (first 100 blocks each, in parallel), then any further ones in turn. */
function tbChildren_(ids) {
  var first;
  if (typeof UrlFetchApp.fetchAll === 'function' && ids.length > 1) {
    var token = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
    first = UrlFetchApp.fetchAll(ids.map(function (id) {
      return { url: 'https://api.notion.com/v1/blocks/' + id + '/children?page_size=100', method: 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION } };
    })).map(function (res) {
      var code = res.getResponseCode(), body = {};
      try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
      if (code >= 300) { var e = new Error((body && body.message) || ('Notion HTTP ' + code)); e.notion = code === 404 ? 'notion_not_shared' : code === 429 ? 'notion_busy' : 'notion_error'; throw e; }
      return body;
    });
  } else first = ids.map(function (id) { return notion_('get', '/blocks/' + id + '/children?page_size=100'); });
  return first.map(function (body, i) {
    var out = body.results || [], cur = body;
    for (var k = 0; cur.has_more && k < 4; k++) { cur = notion_('get', '/blocks/' + ids[i] + '/children?page_size=100&start_cursor=' + encodeURIComponent(cur.next_cursor)); out = out.concat(cur.results || []); }
    return out;
  });
}
/** A page body as sections: a heading starts one; paragraphs and list items follow it. Anything else is left out. */
function tbSections_(blocks) {
  var secs = [], cur = null;
  blocks.forEach(function (b) {
    var t = b.type, text = plain_((b[t] || {}).rich_text);
    if (/^heading_[123]$/.test(t)) { cur = { h: text.trim(), p: [] }; secs.push(cur); return; }
    if (['paragraph', 'bulleted_list_item', 'numbered_list_item', 'quote'].indexOf(t) === -1 || !text.trim()) return;
    if (!cur) { cur = { h: '', p: [] }; secs.push(cur); }
    cur.p.push(/list_item$/.test(t) ? '• ' + text : text);
  });
  return secs;
}
/** Sections as blocks for a new page: headings, paragraphs, and list items for lines starting "• ". */
function tbBlocks_(sections) {
  var out = [];
  (Array.isArray(sections) ? sections : []).forEach(function (s) {
    if (s && s.h) out.push({ type: 'heading_3', heading_3: { rich_text: rt_(String(s.h).slice(0, 200)) } });
    ((s && s.p) || []).forEach(function (p) {
      p = String(p || '').trim(); if (!p) return;
      if (/^• /.test(p)) out.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rtLong_(p.slice(2)) } });
      else out.push({ type: 'paragraph', paragraph: { rich_text: rtLong_(p) } });
    });
  });
  return out.slice(0, 100);
}
/** One card's passages from both books (remembered 6 hours; fresh=1 reads Notion again). */
function tarotBook_(card, fresh) {
  if (!TAROT_CARD.test(card)) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), key = 'tbook:' + tbGen_() + ':' + card, hit = fresh ? null : cache.get(key);
  if (hit) return JSON.parse(hit);
  var pages = queryAll_(tarotBooksSource_(), { property: 'Card', rich_text: { equals: card } }, 1).filter(function (pg) { return tbBookOf_(sel_((pg.properties || {}).Book)); });
  pages.sort(function (a, b) { return tbBookOf_(sel_(a.properties.Book)) === 'dean' ? -1 : tbBookOf_(sel_(b.properties.Book)) === 'dean' ? 1 : 0; });
  var kids = pages.length ? tbChildren_(pages.map(function (pg) { return pg.id; })) : [];
  var books = pages.map(function (pg, i) {
    var k = tbBookOf_(sel_(pg.properties.Book));
    return { book: k, name: TAROT_BOOKS[k].name, title: TAROT_BOOKS[k].title, source: plain_(pg.properties.Source && pg.properties.Source.rich_text), url: pg.url || '', sections: tbSections_(kids[i]) };
  });
  var out = { ok: true, version: VERSION, card: card, books: books };
  try { cache.put(key, JSON.stringify(out), 21600); } catch (x) { /* too large to cache */ }
  return out;
}
/**
 * IMPORT BOOKS: turns the import file (a JSON file attached to a page in the database with no card) into
 * card pages. Pages that already exist are left alone, so running it again only fills gaps. Each call
 * works for about 50 seconds and says how many are left.
 */
function tarotBookImport_() {
  // Not the script lock: an import step runs for most of a minute, and holding the lock that long made every
  // save (tarot notes, tasks, the log) wait and fail. A flag in the cache keeps two imports from overlapping.
  var t0 = Date.now(), cache = CacheService.getScriptCache();
  if (cache.get('tbimporting')) return { ok: false, error: 'tarot_books_importing' };
  cache.put('tbimporting', '1', 120);
  try {
    var ds = tarotBooksSource_(), got = tbPages_(ds), url = null;
    for (var i = 0; i < got.loose.length && !url; i++) {
      (notion_('get', '/blocks/' + got.loose[i].id + '/children?page_size=50').results || []).forEach(function (b) {
        if (!url && b.type === 'file' && b.file) url = (b.file.file && b.file.file.url) || (b.file.external && b.file.external.url) || null;
      });
    }
    var n = tbCount_(got.have);
    if (!url) return n.dean + n.crispin ? { ok: true, version: VERSION, made: 0, books: n, left: 0 } : { ok: false, error: 'tarot_books_no_file' };
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true }), data = null;
    try { data = res.getResponseCode() < 300 ? JSON.parse(res.getContentText()) : null; } catch (x) { data = null; }
    if (!data || !Array.isArray(data.cards)) return { ok: false, error: 'tarot_books_bad_file' };
    var todo = data.cards.filter(function (c) { return c && TAROT_BOOKS[c.book] && TAROT_CARD.test(String(c.code)) && !got.have[c.book + ':' + c.code]; }), made = 0;
    for (var j = 0; j < todo.length && Date.now() - t0 < TB_RUN_MS; j++) {
      var c = todo[j], bk = TAROT_BOOKS[c.book];
      notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds },
        properties: { Title: { title: rt_(tarotName_(c.code) + ' · ' + bk.name) }, Card: { rich_text: rt_(c.code) }, Book: { select: { name: bk.name } },
          Source: { rich_text: rt_(String(c.source || '').slice(0, 200)) }, Order: { number: tbOrder_(c.code, c.book) } },
        children: tbBlocks_(c.sections) });
      n[c.book]++; made++;
    }
    tbBump_();
    return { ok: true, version: VERSION, made: made, books: n, left: todo.length - made };
  } finally {
    cache.remove('tbimporting');
  }
}
var TAROT_SUGGEST_RULES = [
  'You help Timothy interpret tarot cards he has drawn. Your answer is a starting point for his own notes on the reading.',
  'Use only the passages from his two tarot books given below (Liz Dean, The Ultimate Guide to Tarot; Jessa Crispin, The Creative Tarot) and his own meaning for a card when one is given. Bring in nothing from other tarot sources or general lore.',
  'Say which book an idea comes from (Dean or Crispin). Where the books differ, say so briefly. When he has his own meaning for a card, start from it.',
  "Weigh the card's position, the question and the other cards. For a reversed card use Dean's reversed meaning; Crispin rarely treats reversals, so don't invent one for her.",
  'Plain prose in the second person, calm and concrete. No headings, no lists, no emoji, no em dashes. Quote no more than a few words from either book. Never present health, legal or money outcomes as certain.'
].join('\n');
/** For a whole reading, the core of each passage: key meanings, upright or reversed, the wisdom line, Crispin's reading. */
function tbText_(books, core, rev) {
  return books.map(function (b) {
    var secs = b.sections.filter(function (s) {
      if (!core) return true;
      var h = s.h.toUpperCase();
      if (/SYMBOL|KABBALA|ASTROLOGY|UNDERSTANDING|REFLECTION|MATERIALS/.test(h)) return false;
      if (/^UPRIGHT/.test(h)) return !rev;
      return true;
    }).map(function (s) {
      var p = core && /GLANCE/.test(s.h) ? s.p.filter(function (x) { return /Key Meaning/i.test(x); }) : s.p;
      return p.length ? (s.h ? s.h + '\n' : '') + p.join('\n') : '';
    }).filter(Boolean);
    return '--- ' + b.name + ', ' + b.title + (b.source ? ' (' + b.source + ')' : '') + '\n' + secs.join('\n\n');
  }).join('\n\n');
}
/** SUGGEST: Claude's reading of one card in its position (mode card, at = its index) or of the whole spread. Nothing is saved. */
function tarotSuggest_(body) {
  if (!aiKey_()) return { ok: false, error: 'ai_not_configured' };
  var mode = body.mode === 'reading' ? 'reading' : 'card', raw = Array.isArray(body.cards) ? body.cards : [];
  if (!raw.length || raw.length > 20) return { ok: false, error: 'bad_request' };
  var cards = raw.map(function (c) { c = c || {}; return { id: String(c.id || ''), rev: !!c.rev, pos: String(c.pos || '').slice(0, 40), note: String(c.note || '').slice(0, 2000), mine: String(c.mine || '').slice(0, 2000) }; });
  var at = mode === 'card' ? Number(body.at) : -1;
  if (cards.some(function (c) { return !TAROT_CARD.test(c.id); }) || (mode === 'card' && !(at >= 0 && at < cards.length && at === Math.floor(at)))) return { ok: false, error: 'bad_request' };
  var q = String(body.q || '').slice(0, 200), sname = String(body.sname || '').slice(0, 60), sum = String(body.sum || '').slice(0, 6000);
  var spend = aiSpend_();
  if (aiPaused_(spend)) return { ok: false, error: 'ai_budget', spend: spend };
  var need = mode === 'card' ? [cards[at]] : cards, any = false;
  var passages = need.map(function (c) {
    var books = tarotBook_(c.id, false).books || [];
    if (books.length) any = true;
    return '=== ' + tarotName_(c.id) + (mode === 'reading' && c.rev ? ' (reversed)' : '') + '\n' + (books.length ? tbText_(books, mode === 'reading', c.rev) : '(No passages in his books for this card.)');
  }).join('\n\n');
  if (!any) return { ok: false, error: 'tarot_books_empty' };
  var reading = 'THE READING\n' + (sname ? 'Spread: ' + sname + '\n' : '') + (q ? 'Question: ' + q + '\n' : 'Question: none given\n') +
    cards.map(function (c, i) { return (i + 1) + '. ' + (c.pos || 'Card') + ': ' + tarotName_(c.id) + (c.rev ? ' (reversed)' : '') + (c.mine ? '\n   His own meaning for this card: ' + c.mine : '') + (c.note ? '\n   His note here so far: ' + c.note : ''); }).join('\n') +
    (mode === 'reading' && sum ? '\nWhat he has written about the whole reading so far: ' + sum : '');
  var task = mode === 'card' ? 'TASK\nSuggest what card ' + (at + 1) + ' (' + (cards[at].pos || 'Card') + ': ' + tarotName_(cards[at].id) + (cards[at].rev ? ', reversed' : '') + ') could mean in this position, for this question. Two to four sentences.'
    : 'TASK\nSuggest a reading of the whole spread: how the cards answer the question together, in order. Four to six sentences.';
  var model = AI.SUMMARY, payload = { model: model, max_tokens: mode === 'card' ? 800 : 1500, system: TAROT_SUGGEST_RULES,
    messages: [{ role: 'user', content: 'PASSAGES FROM HIS BOOKS\n\n' + passages + '\n\n' + reading + '\n\n' + task }], output_config: { effort: AI.FAST_EFFORT } };
  var betas = [];
  if (/^claude-(sonnet-5-5|opus-5-5)/.test(model)) { payload.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }
  var res;
  try { res = claude_(payload, betas); } catch (e) {
    if (!e.ai) throw e;
    return { ok: false, error: e.ai, detail: String(e.message).slice(0, 300), spend: aiSpend_() };
  }
  var served = res.model || model, u = res.usage || {}, cost = aiCost_(served, u);
  aiAddSpend_(cost);
  aiLogAdd_({ t: new Date().toISOString(), mode: 'tarot', model: served, steps: 1, in: u.input_tokens || 0, out: u.output_tokens || 0,
    cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, usd: Math.round(cost * 100000) / 100000, unknown: aiPrice_(served) ? undefined : true });
  var text = (res.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n\n').trim();
  if (res.stop_reason === 'refusal') text = '';
  if (!text) return { ok: false, error: 'ai_error', detail: 'no_text', spend: aiSpend_() };
  return { ok: true, version: VERSION, mode: mode, text: text, model: served, cost: Math.round(cost * 10000) / 10000, spend: aiSpend_() };
}

// ---- Apiary (bridge 1.26) ------------------------------------------------------
// 🐝 Apiary: one Yard page (site notes, supply list), one page per hive, one page per hive check
// (Hive relation to its hive). Text columns are plain and editable in Notion; Data holds what the app
// draws (boxes, colors, frame counts). Data is read from its first "{", so a note before it is fine.

var APIARY_KINDS = { yard: 'Yard', hive: 'Hive', check: 'Check' };
var APIARY_TEXT = { who: 'Who', queen: 'Queen', frames: 'Frames', stores: 'Stores', feed: 'Feed', mood: 'Temperament', pests: 'Pests', did: 'Did', issue: 'Issue', next: 'Next', notes: 'Notes' };
var APIARY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function apiarySource_() { return sourceFor_(CONFIG.NOTION_APIARY_DATABASE, 'NOTION_APIARY_SOURCE'); }
function apiaryGen_() { return CacheService.getScriptCache().get('agen') || '0'; }
function apiaryBump_() { CacheService.getScriptCache().put('agen', Utilities.getUuid().slice(0, 8), 21600); }
function apiaryData_(p) {
  var raw = plain_(p.Data && p.Data.rich_text), at = raw.indexOf('{');
  if (at < 0) return {};
  try { var d = JSON.parse(raw.slice(at)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (e) { return {}; }
}
function toApiary_(pg) {
  var p = pg.properties || {}, kind = String(sel_(p.Kind) || '').toLowerCase();
  var num = function (x) { return x && typeof x.number === 'number' ? x.number : null; };
  var out = { id: pg.id, url: pg.url, kind: kind, name: plain_(p.Name && p.Name.title), day: day_(p.Date), data: apiaryData_(p), created: pg.created_time || '' };
  Object.keys(APIARY_TEXT).forEach(function (k) { out[k] = plain_(p[APIARY_TEXT[k]] && p[APIARY_TEXT[k]].rich_text); });
  if (kind === 'check') {
    var rel = p.Hive && p.Hive.relation;
    out.hive = rel && rel[0] ? rel[0].id : null;
    out.mites = num(p['Mites (%)']); out.honey = num(p['Honey (lb)']);
  }
  return out;
}
/** Everything in the Apiary: the yard, hives (by Data.order) and checks (newest first). */
function apiary_() {
  var cache = CacheService.getScriptCache(), key = 'apiary:' + apiaryGen_(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var rows = queryAll_(apiarySource_(), null, 10, [{ property: 'Date', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }]).map(toApiary_);
  var hives = rows.filter(function (r) { return r.kind === 'hive'; });
  hives.sort(function (a, b) { return (Number(a.data.order) || 99) - (Number(b.data.order) || 99) || (a.created < b.created ? -1 : 1); });
  var out = { ok: true, version: VERSION, yard: rows.filter(function (r) { return r.kind === 'yard'; })[0] || null, hives: hives, checks: rows.filter(function (r) { return r.kind === 'check'; }),
    url: 'https://www.notion.so/' + String(CONFIG.NOTION_APIARY_DATABASE).replace(/-/g, '') };
  try { cache.put(key, JSON.stringify(out), 120); } catch (x) { /* too large to cache */ }
  return out;
}
function apiaryOwn_(id, ds, kind) {
  if (!/^[A-Za-z0-9-]{20,40}$/.test(String(id || ''))) return null;
  var cur = notion_('get', '/pages/' + String(id));
  if (!cur.parent || String(cur.parent.data_source_id || '').replace(/-/g, '') !== ds.replace(/-/g, '') || cur.in_trash || cur.archived) return null;
  if (kind && sel_((cur.properties || {}).Kind) !== APIARY_KINDS[kind]) return null;
  return cur;
}
function apiaryLong_(d) { return d ? d.slice(8).replace(/^0/, '') + ' ' + APIARY_MONTHS[Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4) : ''; }
/** Data must be a small JSON object; a hive's boxes are checked here so the stack can always be drawn. */
function apiaryCleanData_(d) {
  if (d == null) return {};
  if (typeof d !== 'object' || Array.isArray(d)) return null;
  if (d.boxes != null && !apiaryBoxes_(d.boxes)) return null;
  var s = JSON.stringify(d);
  return s.length > 6000 ? null : d;
}
/* The pieces a stack can hold (bridge 1.28): frames n 6..12 (deep, medium, super), drawn 0..n, fill 0..1
   (medium, super), a feeder's level, a queen excluder with nothing. null means not counted yet. */
var APIARY_PIECES = { deep: { n: 1 }, medium: { n: 1, cap: 1 }, super: { n: 1, cap: 1 }, feeder: {}, excluder: {} };
function apiaryBoxes_(b) {
  if (!Array.isArray(b) || !b.length || b.length > 12) return false;
  return b.every(function (x) {
    var P = x && APIARY_PIECES[x.k];
    if (!P) return false;
    var n = x.n == null ? 10 : x.n;
    if (P.n && !(n === Math.floor(n) && n >= 6 && n <= 12)) return false;
    if (x.drawn != null && !(P.n && typeof x.drawn === 'number' && x.drawn >= 0 && x.drawn <= n)) return false;
    if (x.fill != null && !(P.cap && typeof x.fill === 'number' && x.fill >= 0 && x.fill <= 1)) return false;
    if (x.level != null && !(x.k === 'feeder' && ['EMPTY', 'LOW', 'FULL'].indexOf(x.level) > -1)) return false;
    return true;
  });
}
/**
 * Save the yard, a hive or a check: new (cid) or changed (id); the whole record each time.
 * A check may carry boxes: the hive's stack as it stood at that check, written to the hive too.
 */
function apiarySave_(it) {
  it = it || {};
  var kind = String(it.kind || ''), bad = !APIARY_KINDS[kind], props = {}, data = apiaryCleanData_(it.data);
  if (bad || data === null) return { ok: false, error: 'bad_request' };
  var name = String(it.name || '').trim(), day = it.day == null || it.day === '' ? null : String(it.day);
  if (name.length > 60 || (day && !realDay_(day)) || (kind === 'check' && !day) || (kind === 'hive' && !name)) return { ok: false, error: 'bad_request' };
  var tooLong = false;
  Object.keys(APIARY_TEXT).forEach(function (k) {
    if (it[k] == null) return;
    var v = String(it[k]).trim();
    if (v.length > 2000) tooLong = true;
    props[APIARY_TEXT[k]] = { rich_text: v ? rt_(v) : [] };
  });
  var nums = { mites: ['Mites (%)', 100], honey: ['Honey (lb)', 1000] }, badNum = false;
  if (kind === 'check') Object.keys(nums).forEach(function (k) {
    var v = it[k];
    if (v === null || v === undefined || v === '') { props[nums[k][0]] = { number: null }; return; }
    v = Number(v);
    if (!(v >= 0 && v <= nums[k][1])) badNum = true; else props[nums[k][0]] = { number: Math.round(v * 10) / 10 };
  });
  if (tooLong || badNum || (it.boxes != null && !apiaryBoxes_(it.boxes))) return { ok: false, error: 'bad_request' };
  props.Kind = { select: { name: APIARY_KINDS[kind] } };
  props.Date = { date: day ? { start: day } : null };
  props.Data = { rich_text: rtLong_(JSON.stringify(data)) };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = apiarySource_(), cache = CacheService.getScriptCache(), pg, hive = null;
    if (kind === 'check') {
      hive = apiaryOwn_(it.hive, ds, 'hive');
      if (!hive) return { ok: false, error: 'not_writable' };
      props.Hive = { relation: [{ id: hive.id }] };
      name = plain_(hive.properties.Name && hive.properties.Name.title) + ' · ' + apiaryLong_(day);
    }
    if (kind === 'yard' && !name) name = 'Apiary';
    props.Name = { title: rt_(name) };
    if (it.id) {
      if (!apiaryOwn_(it.id, ds, kind)) return { ok: false, error: 'not_writable' };
      pg = notion_('patch', '/pages/' + String(it.id), { properties: props });
    } else {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(it.cid || ''))) return { ok: false, error: 'bad_request' };
      var prior = cache.get('acid:' + it.cid);
      if (prior) { var p0 = JSON.parse(prior); p0.duplicate = true; return p0; }
      if (kind === 'yard') {   /* one yard: a second save without its id lands on the first */
        var have = queryAll_(ds, { property: 'Kind', select: { equals: 'Yard' } }, 1)[0];
        if (have) pg = notion_('patch', '/pages/' + have.id, { properties: props });
      }
      if (!pg) pg = notion_('post', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    }
    var hiveOut = null;
    if (hive && it.boxes != null) {
      var hd = apiaryData_(hive.properties || {});
      hd.boxes = it.boxes;
      hiveOut = toApiary_(notion_('patch', '/pages/' + hive.id, { properties: { Data: { rich_text: rtLong_(JSON.stringify(hd)) } } }));
    }
    apiaryBump_();
    var out = { ok: true, version: VERSION, item: toApiary_(pg), hive: hiveOut };
    if (!it.id) cache.put('acid:' + it.cid, JSON.stringify(out), 21600);
    return out;
  } finally {
    lock.releaseLock();
  }
}
/** A check or a hive to Notion's trash (restorable there). The yard stays. */
function apiaryRemove_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ds = apiarySource_(), cur = apiaryOwn_(id, ds);
    if (!cur || sel_((cur.properties || {}).Kind) === 'Yard') return { ok: false, error: 'not_writable' };
    notion_('patch', '/pages/' + cur.id, { in_trash: true });
    apiaryBump_();
    return { ok: true, version: VERSION, removed: cur.id };
  } finally {
    lock.releaseLock();
  }
}
function apiaryStatus_() {
  try { var a = apiary_(); return 'OK (' + a.hives.length + (a.hives.length === 1 ? ' hive, ' : ' hives, ') + a.checks.length + (a.checks.length === 1 ? ' check)' : ' checks)'); }
  catch (e) { return 'NOT READY: ' + (e.notion || 'notion_error') + (e.notion === 'notion_not_shared' ? '. Connect the TimothyOS integration to 🐝 Apiary (... > Connections)' : ''); }
}

// ---- Ask Claude ---------------------------------------------------------------
// The in-app assistant. Claude reads through the same functions the app uses and
// never changes anything itself: every change comes back as a proposal that
// Timothy confirms in the app. No web, no work-calendar writes, no code.
// The API key lives in Script Properties (ANTHROPIC_API_KEY), never in this file.
var AI = {
  FAST: 'claude-sonnet-5-5',   // everyday questions (Script Property AI_FAST_MODEL = claude-haiku-5-5 or claude-haiku-4-5 steps down)
  FAST_EFFORT: 'low',          // quick, plain answers; Sonnet 5.5 recalibrated its levels, low suits chat
  DEEP: 'claude-opus-5-5',     // THINK HARDER
  DEEP_EFFORT: 'medium',       // Opus 5.5's own default
  SUMMARY: 'claude-sonnet-5-5',// weekly summaries and patterns
  BUDGET_USD: 8,               // monthly pause and reminder; CONTINUE carries on until the Claude Console stops it. Script Property AI_BUDGET_USD
  CAP_USD: 10,                 // the real ceiling is the Console (prepaid credit, spend limit); shown for reference. Script Property AI_CAP_USD
  MAX_STEPS: 6                 // model calls per question, at most
};
// US$ per million tokens: input, output, cache write (5 min), cache read. Matched by model family, longest first,
// so a dated or regional model name is priced like its family rather than at the catch-all rate.
var AI_PRICES = [
  ['claude-opus-5-5', [4, 20, 5, 0.20]],
  ['claude-opus-5', [5, 25, 6.25, 0.50]],
  ['claude-opus-4', [5, 25, 6.25, 0.50]],
  ['claude-sonnet-5-5', [2, 10, 2.5, 0.20]],
  ['claude-sonnet-5', [2, 10, 2.5, 0.20]],
  ['claude-sonnet-4', [3, 15, 3.75, 0.30]],
  ['claude-haiku-5-5', [0.10, 0.50, 0.125, 0.01]],   // prompts up to 100K tokens; Ask stays far below that
  ['claude-haiku-4-5', [1, 5, 1.25, 0.10]]
];
var AI_PRICE_OTHER = [10, 50, 12.5, 1];   // a model not listed is counted high, and marked in the log
function aiPrice_(model) {
  var m = String(model || '').replace(/^[a-z]+\./, '');
  for (var i = 0; i < AI_PRICES.length; i++) if (m.indexOf(AI_PRICES[i][0]) === 0) return AI_PRICES[i][1];
  return null;
}

/* The Morning Briefing (app 2.36): written the first time Bridge is in front after 06:00, from the same snapshot ASK
   uses (plus yesterday's habits). Sonnet, no tools, answered as JSON the app prints like a teleprinter. */
var BRIEF_RULES = [
  "Task: write this morning's briefing, as the ship's computer reporting to the captain at the start of the watch. Use only the snapshot; don't use tools.",
  "This task replaces the style line above: answer with one JSON object and nothing else, shaped {\"headline\": \"...\", \"paras\": [{\"label\": \"...\", \"text\": \"...\"}], \"action\": \"...\"}.",
  "paras, in this order, leaving out any with nothing worth saying: label \"\" opening with 'Good morning, Captain.', the weekday and date, then the condition level and why in one sentence;",
  "TODAY (how many meetings, the first and the last, the longest open stretch between 07:00 and 21:00, whether priorities are picked; BREAK entries are breaks, not meetings; HOLIDAY is not an event);",
  "OUTSIDE (temperature now and the high, wind or rain if notable, the hive check window, frost tonight); AHEAD (heavy days and key dates in the next 7 days);",
  "YESTERDAY (habits, if the snapshot has them); and only when the snapshot includes them: APIARY, TAROT (this week's card), LEDGER (the fund and the queue), SKY (a visible space station pass tonight, an aurora chance, a nearby earthquake: one or two sentences).",
  "Each text: 1 to 3 short sentences, plain words, 24-hour times, degrees as °F, no lists, no emoji, no em dashes, no markdown. Never mention the snapshot itself.",
  "action: one recommended first action, one sentence, starting with a verb. headline: under 90 characters, the 3 or 4 facts that matter most today joined by ' · ', without the condition level (the Condition panel sits just below it)."
].join('\n');

/* The Ship's Year (app 2.40): the year in ASTROMETRICS told from counts only (never the Captain's Log), on 31 December
   or whenever asked. Sonnet, no tools, answered as JSON in the briefing's shape so the app prints it the same way. */
var YEAR_RULES = [
  "Task: write the Ship's Year, the ship's computer's account of the captain's year, from the counts in the snapshot. Use only the snapshot; don't use tools.",
  "This task replaces the style line above: answer with one JSON object and nothing else, shaped {\"paras\": [{\"label\": \"...\", \"text\": \"...\"}], \"action\": \"...\"}.",
  "paras, in this order, leaving out any the snapshot has nothing for: label \"\" opening with 'Captain,' and saying whether this is the whole year or the year so far;",
  "THE YEAR (the two or three numbers that sum it up); TIME (calendar hours by area and how they moved through the months); DONE (tasks finished and the strongest stretch);",
  "KEPT (weekly reviews and habits); SHELF AND DECK (books, and tarot only if the snapshot has it); THE YARD (only if the snapshot has the apiary); QUEUE (only if the snapshot has it).",
  "Each text: 1 to 3 short sentences, about 200 words in all, plain words, numbers only from the snapshot, no lists, no emoji, no em dashes, no markdown. Never mention the snapshot itself.",
  "action: one recommendation for the year ahead (or the rest of this one), one sentence, starting with a verb."
].join('\n');

/* SUGGEST SORTING (app 2.41): a destination for each waiting Inbox note, from the note and the lists in the snapshot.
   Sonnet, no tools, JSON; the app shows each as a card and saves nothing until CONFIRM. */
var SORT_RULES = [
  "Task: suggest where each note in the snapshot's INBOX belongs. Use only the snapshot; don't use tools.",
  "This task replaces the style line above: answer with one JSON object and nothing else, shaped {\"items\": [{\"id\": \"...\", \"kind\": \"...\", \"title\": \"...\", \"why\": \"...\"}]}, one item per note, ids exactly as given.",
  "kind is one of: task (something to do), date (a fixed date to remember: a deadline, renewal, birthday), event (something at a set time on a calendar), queue (something to buy), keep (an idea or reference to keep as it is).",
  "title: short and clear, in his words where possible. why: under 12 words.",
  "For task add life_area (exactly one of the snapshot's Life Areas), priority (exactly one of its priority names) and due (yyyy-mm-dd or null).",
  "For date add date (yyyy-mm-dd), type (exactly one of the snapshot's key date types) and yearly (true or false). For event add calendar (personal, farm or growth, only those listed), day (yyyy-mm-dd), start_time (HH:MM, 24-hour) and minutes.",
  "For queue add cost (a number, or null when unknown). Work out relative days (Thursday, next week) from TODAY in the snapshot. Never invent a date the note doesn't imply: use task with due null instead."
].join('\n');

var AI_RULES = [
  "You are the ship's computer inside TimothyOS, Timothy's personal life dashboard. Address him as Captain.",
  "Style: calm, brief, concrete. Plain text: short paragraphs or simple lines starting with '- '. No headings, no tables, no emoji, no em dashes. Lead with the answer.",
  "Facts: use only the snapshot below and your tools. Never invent events, tasks, dates or numbers. If something isn't in the data, say so. Times are local.",
  "You can read his Work and Personal calendars (and his farm calendar, area 'farm', and his Growth calendar, area 'hobby', when the snapshot lists them), his Master Task List, Key Dates and Weekly Reviews. You cannot browse the web, read email, or change the app itself. Notion pages outside those databases are private and out of reach.",
  "Changes: you never change anything directly. To add a task, pick or unpick a priority, set a task's status, add a key date, add an event or reminder to the Personal calendar (or the farm calendar for farm and bee work, or the Growth calendar for personal growth and hobbies, when linked), or draft a weekly review, call the matching propose_ tool. Timothy confirms each one with a tap. After proposing, say in one line what you proposed.",
  "The Work calendar is read-only: never propose anything for it. A reminder is a short Personal calendar event at the reminder time; his devices alert him.",
  "Use exact task ids from the snapshot or get_tasks. Use Life Area, priority and key date type names exactly as listed in the snapshot."
].join('\n');

function aiKey_() { return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'); }
function aiBudget_() { var b = Number(PropertiesService.getScriptProperties().getProperty('AI_BUDGET_USD')); return isFinite(b) && b > 0 ? b : AI.BUDGET_USD; }
function aiCap_() { var b = Number(PropertiesService.getScriptProperties().getProperty('AI_CAP_USD')); return isFinite(b) && b > 0 ? b : AI.CAP_USD; }
function aiMonth_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'); }
/** This month's spend, kept in Script Properties: { month, usd, calls }. */
function aiSpend_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('AI_SPEND') || '{}'); } catch (e) { s = {}; }
  if (s.month !== aiMonth_()) s = { month: aiMonth_(), usd: 0, calls: 0 };
  var cont = PropertiesService.getScriptProperties().getProperty('AI_CONTINUE') === s.month;
  return { month: s.month, usd: Math.round((s.usd || 0) * 10000) / 10000, calls: s.calls || 0, budget: aiBudget_(), cap: aiCap_(), cont: cont };
}
/** Paused at the monthly reminder, unless Timothy chose CONTINUE this month. */
function aiPaused_(s) { return s.usd >= s.budget && !s.cont; }
/** The last 25 questions: when, which mode and model, tokens and cost. No text. */
function aiLog_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('AI_LOG') || '[]'); } catch (e) { return []; } }
function aiLogAdd_(entry) { var l = aiLog_(); l.unshift(entry); PropertiesService.getScriptProperties().setProperty('AI_LOG', JSON.stringify(l.slice(0, 25))); }
/** CONTINUE past the reminder for the rest of this month. */
function aiContinue_() { PropertiesService.getScriptProperties().setProperty('AI_CONTINUE', aiMonth_()); return { ok: true, version: VERSION, spend: aiSpend_() }; }
/** Set this month's total to the figure the Claude Console shows, so the two agree from here on. */
function aiSpendSet_(usd) {
  usd = Number(usd);
  if (!isFinite(usd) || usd < 0 || usd > 10000) return { ok: false, error: 'bad_request' };
  var s = aiSpend_();
  PropertiesService.getScriptProperties().setProperty('AI_SPEND', JSON.stringify({ month: s.month, usd: usd, calls: s.calls }));
  aiLogAdd_({ t: new Date().toISOString(), mode: 'matched', usd: Math.round(usd * 10000) / 10000 });
  return { ok: true, version: VERSION, spend: aiSpend_() };
}
/** The everyday model: Haiku 5.5 unless Script Property AI_FAST_MODEL picks Haiku 4.5. */
function aiFast_() {
  var m = String(PropertiesService.getScriptProperties().getProperty('AI_FAST_MODEL') || '').trim();
  return m === 'claude-haiku-4-5' || m === 'claude-haiku-5-5' || m === 'claude-sonnet-5-5' ? m : AI.FAST;
}
function aiCost_(model, u) {
  var p = aiPrice_(model) || AI_PRICE_OTHER;
  u = u || {};
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_creation_input_tokens || 0) * p[2] + (u.cache_read_input_tokens || 0) * p[3]) / 1e6;
}
function aiAddSpend_(usd) {
  var s = aiSpend_();
  s.usd += usd; s.calls += 1;
  PropertiesService.getScriptProperties().setProperty('AI_SPEND', JSON.stringify({ month: s.month, usd: s.usd, calls: s.calls }));
  return s;
}

/** One request to the Messages API (raw HTTP: Apps Script has no SDK). */
function claude_(payload, betas) {
  var headers = { 'x-api-key': aiKey_(), 'anthropic-version': '2023-06-01' };
  if (betas && betas.length) headers['anthropic-beta'] = betas.join(',');
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) { body = {}; }
  if (code >= 300) {
    var msg = (body.error && body.error.message) || ('HTTP ' + code), e = new Error(msg);
    var details = (body.error && body.error.details) || {};
    if (code === 401 || code === 403) e.ai = 'ai_unauthorized';
    else if (/credit balance/i.test(msg)) e.ai = 'ai_no_credit';
    else if (details.error_code === 'enforced_spend_limit_reached' || /specified (workspace )?API usage limits|usage limits/i.test(msg)) e.ai = 'ai_console_limit';
    else if (code === 429 || code === 529 || code >= 500) e.ai = 'ai_busy';
    else e.ai = 'ai_error';
    throw e;
  }
  return body;
}

/* ---------- AI voice (1.30): the Morning Briefing read by OpenAI's gpt-4o-mini-tts ----------
   Timothy's choice (2026-10-23): voice Nova with his own style line. The key lives only in Script Property
   OPENAI_API_KEY. The app sends the briefing's paragraphs (never the Captain's Log); each becomes one MP3, all
   asked for at once, returned as base64. The speech endpoint reports no usage, so the month's cost is an estimate
   from the characters spoken (about 1.5 cents a minute, about 15 characters a second). */
var VOICE = {
  MODEL: 'gpt-4o-mini-tts',
  NAME: 'nova',
  STYLE: 'Calm, measured starship computer. Even pacing, clear diction, warm but precise, with a slight South African accent.',
  MAX_CLIPS: 12,
  MAX_CHARS: 4000,      // a whole briefing is under 1,000
  PER_DAY: 30,          // requests a day, so nothing can run away with the credit
  USD_PER_CHAR: 0.015 / 900
};
function voiceKey_() { return PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY'); }
/** This month's estimate { month, usd, calls, chars } and today's request count. */
function voiceSpend_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('VOICE_SPEND') || '{}'); } catch (e) { s = {}; }
  var tz = Session.getScriptTimeZone(), month = Utilities.formatDate(new Date(), tz, 'yyyy-MM'), day = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (s.month !== month) s = { month: month, usd: 0, calls: 0, chars: 0 };
  if (s.day !== day) { s.day = day; s.today = 0; }
  return s;
}
function voiceErr_(code, text) {
  var body = {}; try { body = JSON.parse(text || '{}'); } catch (x) { body = {}; }
  var err = body.error || {}, msg = String(err.message || 'HTTP ' + code).slice(0, 200);
  var e = code === 401 || code === 403 ? 'voice_unauthorized' : err.code === 'insufficient_quota' || /quota|billing/i.test(msg) ? 'voice_no_credit' :
    code === 429 || code >= 500 ? 'voice_busy' : 'voice_error';
  return { ok: false, error: e, detail: msg };
}
function speak_(body, check) {
  var key = voiceKey_();
  if (!key) return { ok: false, error: 'voice_not_configured' };
  var texts = (Array.isArray(body.texts) ? body.texts : []).filter(function (t) { return typeof t === 'string' && t.trim(); }).map(function (t) { return t.trim(); });
  var chars = texts.join('').length;
  if (!texts.length || texts.length > VOICE.MAX_CLIPS || chars > VOICE.MAX_CHARS) return { ok: false, error: 'bad_request' };
  var sp = voiceSpend_();
  if (sp.today >= VOICE.PER_DAY) return { ok: false, error: 'voice_daily_cap' };
  var reqs = texts.map(function (t) {
    return { url: 'https://api.openai.com/v1/audio/speech', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify({ model: VOICE.MODEL, voice: VOICE.NAME, input: t, instructions: VOICE.STYLE, response_format: 'mp3' }) };
  });
  var res = typeof UrlFetchApp.fetchAll === 'function' && reqs.length > 1 ? UrlFetchApp.fetchAll(reqs) : reqs.map(function (r) { return UrlFetchApp.fetch(r.url, r); });
  var clips = [];
  for (var i = 0; i < res.length; i++) {
    var code = res[i].getResponseCode();
    if (code >= 300) return voiceErr_(code, res[i].getContentText());
    clips.push(Utilities.base64Encode(res[i].getContent()));
  }
  var est = chars * VOICE.USD_PER_CHAR;
  sp.usd = (sp.usd || 0) + est; sp.calls = (sp.calls || 0) + 1; sp.chars = (sp.chars || 0) + chars; sp.today = (sp.today || 0) + 1;
  PropertiesService.getScriptProperties().setProperty('VOICE_SPEND', JSON.stringify(sp));
  var out = { ok: true, version: VERSION, voice: VOICE.NAME, model: VOICE.MODEL, est: Math.round(est * 100000) / 100000,
    spend: { month: sp.month, usd: Math.round(sp.usd * 10000) / 10000, calls: sp.calls } };
  if (!check) out.clips = clips;
  return out;
}

// Claude sees only each tool's name, description and input_schema, never the code below them, so every
// description says what its handler actually does and refuses (bridge 1.27 audit). Keep them in step.
var AI_TOOLS = [
  { name: 'get_events', description: 'Calendar events from `from` to `to`, both days included, at most 62 days. Covers Work and Personal, plus the farm calendar (area Farm) and the Growth calendar (area Growth) once each is linked. Each line: weekday, date, start-end time (local) or "all day", area, title. Untitled events read "Busy". Events he declined (outside Work) and titles on his ignored list are left out. At most 200 events, earliest first.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'First day, yyyy-mm-dd' }, to: { type: 'string', description: 'Last day, yyyy-mm-dd, on or after from' } }, required: ['from', 'to'], additionalProperties: false } },
  { name: 'get_tasks', description: 'Two lists from the Master Task List: the tasks picked as priorities for `day` (any status, done ones included), then up to 120 OPEN tasks (every status except Done), soonest due date first, undated last. Each line: the task id in [brackets], title, status, priority, Life Area, due date and picked day. Finished tasks are not here: use get_week for what was done in a week.',
    input_schema: { type: 'object', properties: { day: { type: 'string', description: 'yyyy-mm-dd; the day whose picked priorities to list' } }, required: ['day'], additionalProperties: false } },
  { name: 'get_key_dates', description: 'Every key date in his Key Dates database (no public holidays), oldest first: start (and end for a window), title, type, Life Area, and "yearly" when it repeats. For a yearly date the start is the original year; work out this year\'s date yourself.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_week', description: 'One Monday-to-Sunday week: tasks marked Done whose last edit fell in that week, tasks picked as priorities on any day of it, and the saved weekly review if there is one. week_start must be a Monday; any other day is refused with the right Monday named, so call again with that.',
    input_schema: { type: 'object', properties: { week_start: { type: 'string', description: 'The Monday that starts the week, yyyy-mm-dd' } }, required: ['week_start'], additionalProperties: false } },
  { name: 'propose_add_task', description: 'Propose a new To Do task in the Master Task List, for something to do with no set time. Optionally pick it as a priority for focus_day. Use this, not an event, for "remind me to X" with no time given. Nothing is created until Timothy confirms.',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'At most 200 characters' }, life_area: { type: 'string', description: 'Exactly one of the LIFE AREAS names in the snapshot, emoji included; leave out if unsure' }, priority: { type: 'string', enum: TASK_PRIORITIES }, focus_day: { type: 'string', description: 'yyyy-mm-dd, to pick it as a priority for that day' } }, required: ['title'], additionalProperties: false } },
  { name: 'propose_set_focus', description: 'Propose picking an existing open task as a priority for a day, or unpicking it with day "none". Nothing changes until Timothy confirms.',
    input_schema: { type: 'object', properties: { task_id: { type: 'string', description: 'The id shown in [brackets] in the snapshot or get_tasks, copied exactly' }, task_title: { type: 'string', description: 'The task title, shown to Timothy on the proposal' }, day: { type: 'string', description: 'yyyy-mm-dd, or "none" to unpick' } }, required: ['task_id', 'task_title', 'day'], additionalProperties: false } },
  { name: 'propose_set_status', description: "Propose changing an existing task's status, for example marking it Done. Nothing changes until Timothy confirms.",
    input_schema: { type: 'object', properties: { task_id: { type: 'string', description: 'The id shown in [brackets] in the snapshot or get_tasks, copied exactly' }, task_title: { type: 'string', description: 'The task title, shown to Timothy on the proposal' }, status: { type: 'string', enum: TASK_STATUSES } }, required: ['task_id', 'task_title', 'status'], additionalProperties: false } },
  { name: 'propose_add_key_date', description: 'Propose a key date: a deadline, a window (give an end date), or something that repeats every year such as a birthday, anniversary or season (yearly true). Key dates count down on his dashboard; they are not timed calendar events and do not alert at a time. For something happening once at a time of day, use propose_add_event. Nothing is created until Timothy confirms.',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'At most 200 characters' }, start: { type: 'string', description: 'yyyy-mm-dd' }, end: { type: 'string', description: 'yyyy-mm-dd, on or after start; only for a window' }, life_area: { type: 'string', description: 'Exactly one of the LIFE AREAS names in the snapshot, emoji included; leave out if unsure' }, type: { type: 'string', description: 'Exactly one of the KEY DATE TYPES names in the snapshot, emoji included; leave out if unsure' }, yearly: { type: 'boolean', description: 'true if it repeats every year' } }, required: ['title', 'start'], additionalProperties: false } },
  { name: 'propose_add_event', description: 'Propose a one-time calendar event: something at a time on a day, or a reminder ("remind me at 3pm to...", which becomes a short event his devices alert him to). Goes on the Personal calendar unless calendar is farm (farm and bee work) or growth (personal growth and hobbies); those two are refused until linked. Never the Work calendar. Give start_time, or all_day true. For a deadline, a window or anything yearly, use propose_add_key_date. Nothing is created until Timothy confirms.',
    input_schema: { type: 'object', properties: { title: { type: 'string', description: 'At most 200 characters' }, calendar: { type: 'string', enum: ['personal', 'farm', 'growth'], description: 'Default personal' }, date: { type: 'string', description: 'yyyy-mm-dd' }, start_time: { type: 'string', description: 'HH:MM, 24-hour, local time; required unless all_day' }, minutes: { type: 'integer', minimum: 5, maximum: 600, description: 'Length in minutes, default 30' }, all_day: { type: 'boolean' } }, required: ['title', 'date'], additionalProperties: false } },
  { name: 'propose_review_draft', description: "Propose text for one week's review fields; only the fields you give are filled. They wait on the Review screen as an unsaved draft until Timothy edits and saves. week_start must be a Monday; any other day is refused with the right Monday named.",
    input_schema: { type: 'object', properties: { week_start: { type: 'string', description: 'The Monday that starts the week, yyyy-mm-dd' }, went_well: { type: 'string' }, drained: { type: 'string' }, next_focus: { type: 'string' }, bearing: { type: 'string' }, summary: { type: 'string' } }, required: ['week_start'], additionalProperties: false } }
];

var AREA_LABEL = { work: 'Work', personal: 'Personal', farm: 'Farm', hobby: 'Growth' };
function aiDay_(s) { return YMD.test(String(s || '')); }
/** '' for a Monday, else an error naming that week's Monday (so the model can retry with it). */
function aiMonday_(ymd, field) {
  if (!aiDay_(ymd) || !realDay_(ymd)) return field + ' must be a Monday, yyyy-mm-dd.';
  var dow = new Date(ymd + 'T12:00:00Z').getUTCDay();
  return dow === 1 ? '' : field + ' ' + ymd + ' is a ' + WEEKDAYS[dow] + ', not a Monday. The Monday of that week is ' + addDaysYmd_(ymd, -((dow + 6) % 7)) + '. Call again with that.';
}
function aiLine_(ev, tz) {
  var area = AREA_LABEL[ev.area] || ev.area;
  if (ev.allDay) return ev.start + ' all day · ' + area + ' · ' + ev.title;
  return Utilities.formatDate(new Date(ev.start), tz, 'EEE yyyy-MM-dd HH:mm') + '-' + Utilities.formatDate(new Date(ev.end), tz, 'HH:mm') + ' · ' + area + ' · ' + ev.title;
}
function aiTaskLine_(t) {
  return '[' + t.id + '] ' + t.title + ' · ' + [t.status, t.priority, t.area, t.due ? 'due ' + t.due : '', t.focus ? 'picked ' + t.focus : ''].filter(String).join(' · ');
}

/** Run one tool call. Reads return data; propose_ tools return a proposal for the app. */
function aiTool_(name, input, ctx) {
  var tz = Session.getScriptTimeZone();
  if (name === 'get_events') {
    if (!aiDay_(input.from) || !aiDay_(input.to) || input.to < input.from) return { error: 'Dates must be yyyy-mm-dd, with to on or after from.' };
    var f = Utilities.parseDate(input.from, tz, 'yyyy-MM-dd').getTime(), t = Utilities.parseDate(addDaysYmd_(input.to, 1), tz, 'yyyy-MM-dd').getTime();
    var ev = events_(f, t);
    if (!ev.ok) return { error: 'Range too long: at most 62 days.' };
    var ign = (ctx.ignore || []).map(function (p) { return String(p).toLowerCase(); });
    var lines = ev.events.filter(function (e) { var tl = String(e.title).toLowerCase(); return !ign.some(function (p) { return p && tl.indexOf(p) > -1; }); })
      .sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); }).slice(0, 200).map(function (e) { return aiLine_(e, tz); });
    return { text: lines.length ? lines.join('\n') : 'No events in that range.' };
  }
  if (name === 'get_tasks') {
    if (!aiDay_(input.day)) return { error: 'day must be yyyy-mm-dd.' };
    var tk = tasks_(input.day);
    return { text: 'PICKED FOR ' + input.day + ':\n' + (tk.focus.map(aiTaskLine_).join('\n') || 'none') + '\nOPEN TASKS:\n' + (tk.open.slice(0, 120).map(aiTaskLine_).join('\n') || 'none') };
  }
  if (name === 'get_key_dates') {
    var kd = dates_();
    return { text: kd.dates.map(function (d) { return d.start + (d.end ? ' to ' + d.end : '') + ' · ' + d.title + ' · ' + [d.type, d.area, d.yearly ? 'yearly' : ''].filter(String).join(' · '); }).join('\n') || 'No key dates.' };
  }
  if (name === 'get_week') {
    var notMon = aiMonday_(input.week_start, 'week_start');
    if (notMon) return { error: notMon };
    var w0 = Utilities.parseDate(input.week_start, tz, 'yyyy-MM-dd'), w1 = Utilities.parseDate(addDaysYmd_(input.week_start, 7), tz, 'yyyy-MM-dd');
    var wk = week_(input.week_start, w0.toISOString(), w1.toISOString());
    if (!wk.ok) return { error: 'Could not read that week.' };
    var r = wk.review;
    return { text: 'FINISHED:\n' + (wk.done.map(function (x) { return '- ' + x.title + ' · ' + (x.area || 'no area'); }).join('\n') || 'none') +
      '\nPICKED:\n' + (wk.picked.map(function (x) { return '- ' + x.title + ' · ' + x.status + (x.focus ? ' · for ' + x.focus : ''); }).join('\n') || 'none') +
      '\nSAVED REVIEW: ' + (r ? ['Went well: ' + r.wentWell, 'Drained me: ' + r.drained, 'Next focus: ' + r.nextFocus, 'Bearing: ' + r.bearing, 'Summary: ' + r.summary].join('\n') : 'none') };
  }
  if (name.indexOf('propose_') === 0) {
    var bad = aiCheck_(name, input);
    if (bad) return { error: bad };
    ctx.proposals.push({ kind: name.replace('propose_', ''), input: input });
    return { text: 'Shown to Timothy as proposal ' + ctx.proposals.length + '. Nothing changes until he taps CONFIRM.' };
  }
  return { error: 'Unknown tool ' + name };
}
/** '' when the value is empty or one of the database's own options, else an error listing them. Unreadable options don't block. */
function aiOption_(v, source, field, name) {
  if (v == null || v === '') return '';
  var opts;
  try { opts = selectOptions_(source(), field); } catch (e) { return ''; }
  return !opts.length || opts.indexOf(v) > -1 ? '' : name + ' must be exactly one of: ' + opts.join(' | ') + ' (or left out).';
}
function aiCheck_(name, i) {
  var str = function (v, max) { return typeof v === 'string' && v.trim() && v.length <= max; };
  if (name === 'propose_add_task') return !str(i.title, 200) ? 'title is required (200 characters at most).' : i.focus_day && !aiDay_(i.focus_day) ? 'focus_day must be yyyy-mm-dd.' : i.priority && TASK_PRIORITIES.indexOf(i.priority) === -1 ? 'priority must be one of: ' + TASK_PRIORITIES.join(', ') + '.' : aiOption_(i.life_area, tasksSource_, 'Life Area', 'life_area');
  if (name === 'propose_set_focus') return !/^[0-9a-f-]{32,36}$/i.test(String(i.task_id || '')) ? 'Use an exact task id.' : i.day !== 'none' && !aiDay_(i.day) ? 'day must be yyyy-mm-dd, or "none" to unpick.' : '';
  if (name === 'propose_set_status') return !/^[0-9a-f-]{32,36}$/i.test(String(i.task_id || '')) ? 'Use an exact task id.' : TASK_STATUSES.indexOf(i.status) === -1 ? 'Unknown status.' : '';
  if (name === 'propose_add_key_date') return !str(i.title, 200) ? 'title is required.' : !aiDay_(i.start) ? 'start must be yyyy-mm-dd.' : i.end && (!aiDay_(i.end) || i.end < i.start) ? 'end must be yyyy-mm-dd, on or after start.' : aiOption_(i.life_area, datesSource_, 'Life Area', 'life_area') || aiOption_(i.type, datesSource_, 'Type', 'type');
  if (name === 'propose_add_event') return !str(i.title, 200) ? 'title is required.' : i.calendar === 'farm' && !farmCalendarId_() ? 'The farm calendar is not linked yet. Use personal.' : i.calendar === 'growth' && !growthCalendarId_() ? 'The Growth calendar is not linked yet. Use personal.' : !aiDay_(i.date) ? 'date must be yyyy-mm-dd.' : !i.all_day && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(i.start_time || '')) ? 'Give start_time as HH:MM (24-hour), or all_day.' : i.minutes != null && !(i.minutes >= 5 && i.minutes <= 600) ? 'minutes must be 5 to 600.' : '';
  if (name === 'propose_review_draft') return aiMonday_(i.week_start, 'week_start');
  return '';
}

/**
 * Answer one message. body: { cid, mode: 'fast'|'deep'|'summary', messages: [{ role, text }],
 * context: snapshot text from the app, ignore: [title phrases] }.
 * Returns { reply, proposals, model, cost, spend }. Safe to repeat: replies are kept by cid for 10 minutes.
 */
function ask_(body, test) {
  if (!aiKey_()) return { ok: false, error: 'ai_not_configured' };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(body.cid || ''))) return { ok: false, error: 'bad_request' };
  var cache = CacheService.getScriptCache(), seen = cache.get('ask:' + body.cid);
  if (seen) return JSON.parse(seen);
  var mode = body.mode === 'deep' || body.mode === 'summary' || body.mode === 'patterns' || body.mode === 'brief' || body.mode === 'year' || body.mode === 'sort' ? body.mode : 'fast';
  var turns = (Array.isArray(body.messages) ? body.messages : []).slice(-20).filter(function (m) {
    return (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim();
  }).map(function (m) { return { role: m.role, content: m.text.slice(0, 4000) }; });
  if (!turns.length || turns[turns.length - 1].role !== 'user') return { ok: false, error: 'bad_request' };
  while (turns.length && turns[0].role !== 'user') turns.shift();

  var spend = aiSpend_();
  if (aiPaused_(spend)) return { ok: false, error: 'ai_budget', spend: spend };

  var model = test && test.model ? test.model : mode === 'fast' ? aiFast_() : mode === 'deep' ? AI.DEEP : AI.SUMMARY;   // the briefing is Sonnet, like summaries
  var system = [{ type: 'text', text: AI_RULES + (mode === 'summary' ? "\nTask: write a weekly summary in 4 to 6 sentences: what the week held, what moved forward, what slipped, one observation about balance, and one suggestion for next week. Plain prose, no lists. Don't use tools." :
      mode === 'brief' ? '\n' + BRIEF_RULES :
      mode === 'year' ? '\n' + YEAR_RULES :
      mode === 'sort' ? '\n' + SORT_RULES :
      mode === 'patterns' ? "\nTask: read the saved weekly reviews in the snapshot and name the patterns across them: what keeps draining him, what reliably goes well, focus areas that keep coming back or slipping, how he holds his bearing, and any trend in the numbers. 4 to 6 lines starting with '- ', each one concrete and tied to specific weeks. End with one suggestion. Don't use tools." : '') },
    { type: 'text', text: 'SNAPSHOT FROM THE APP\n' + String(body.context || 'No snapshot was sent.').slice(0, 40000) }];
  // Current models think by default and thinking counts toward max_tokens, so each cap leaves room for it.
  var payload = { model: model, max_tokens: mode === 'fast' || mode === 'brief' || mode === 'year' || mode === 'sort' ? 6000 : 12000, system: system, messages: turns, cache_control: { type: 'ephemeral' } };
  var effort = (test && test.effort) || (mode === 'fast' || mode === 'brief' || mode === 'year' || mode === 'sort' ? AI.FAST_EFFORT : mode === 'deep' ? AI.DEEP_EFFORT : 'medium');
  if (model !== 'claude-haiku-4-5') payload.output_config = { effort: effort };   // Haiku 4.5 rejects effort
  if (mode === 'fast' || mode === 'deep') payload.tools = AI_TOOLS;
  var betas = [];
  // A decline by a safety classifier is retried on a suitable model in the same call (Sonnet 5.5 and Opus 5.5; Haiku has none).
  if (/^claude-(sonnet-5-5|opus-5-5)/.test(model)) { payload.fallbacks = 'default'; betas.push('server-side-fallback-2026-07-01'); }

  var ctx = { ignore: Array.isArray(body.ignore) ? body.ignore.slice(0, 30) : [], proposals: [] }, cost = 0, res, served = model;
  var tok = { in: 0, out: 0, cw: 0, cr: 0 }, unknown = false;
  for (var step = 0; step < AI.MAX_STEPS; step++) {
    if (step > 0 && aiPaused_(aiSpend_())) break;
    try {
      res = claude_(payload, betas);
    } catch (e) {
      if (!e.ai) throw e;
      return { ok: false, error: e.ai, detail: String(e.message).slice(0, 300), spend: aiSpend_() };
    }
    served = res.model || model;
    var u = res.usage || {};
    tok.in += u.input_tokens || 0; tok.out += u.output_tokens || 0; tok.cw += u.cache_creation_input_tokens || 0; tok.cr += u.cache_read_input_tokens || 0;
    if (!aiPrice_(served)) unknown = true;
    var c = aiCost_(served, res.usage);
    cost += c;
    spend = aiAddSpend_(c);
    payload.messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'tool_use') break;
    var results = res.content.filter(function (b) { return b.type === 'tool_use'; }).map(function (b) {
      var out;
      try { out = aiTool_(b.name, b.input || {}, ctx); } catch (err) { out = { error: (err && err.notion) ? 'Notion is unavailable right now (' + err.notion + ').' : 'That lookup failed.' }; }
      return out.error ? { type: 'tool_result', tool_use_id: b.id, content: out.error, is_error: true } : { type: 'tool_result', tool_use_id: b.id, content: out.text };
    });
    payload.messages.push({ role: 'user', content: results });
  }
  var text = (res && res.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n\n').trim();
  if (res && res.stop_reason === 'refusal') text = "That's outside what I can help with here.";
  else if (res && res.stop_reason === 'tool_use') text = (text ? text + '\n\n' : '') + "(Stopped after " + AI.MAX_STEPS + " steps. Ask again more narrowly.)";
  else if (res && res.stop_reason === 'max_tokens') text += '\n\n(Answer cut short.)';
  if (!test) aiLogAdd_({ t: new Date().toISOString(), mode: mode, model: served, steps: step + 1, in: tok.in, out: tok.out, cw: tok.cw, cr: tok.cr, usd: Math.round(cost * 100000) / 100000, unknown: unknown || undefined });
  var out = { ok: true, version: VERSION, reply: text || '(No answer.)', proposals: ctx.proposals, model: served, cost: Math.round(cost * 10000) / 10000, spend: aiSpend_() };
  if (test) { out.stop = res && res.stop_reason; out.steps = step + 1; out.costExact = cost; }
  try { cache.put('ask:' + body.cid, JSON.stringify(out), 600); } catch (x) { /* too large to cache */ }
  return out;
}
