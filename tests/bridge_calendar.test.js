const fs = require('fs'); const vm = require('vm');
const props = {}; const cache = {};
let created = [];
function mkEv(title, s, e, opts={}) {
  return { getTitle:()=>title, getId:()=> 'uid-'+title, getStartTime:()=>new Date(s), getEndTime:()=>new Date(e),
    isAllDayEvent:()=>!!opts.allDay, getLocation:()=>'', getMyStatus:()=>'YES',
    getAllDayStartDate:()=>new Date(s), getAllDayEndDate:()=>new Date(e), setDescription(){}, setTag(){} };
}
const personal = { getName:()=>'personal@example.com', getTimeZone:()=>'America/Chicago', getId:()=>'personal@example.com',
  getEvents:()=>created.slice(),
  createEvent:(t,s,e)=>{ const ev = mkEv(t,s,e); created.push(ev); return ev; },
  createAllDayEvent:(t,d)=>{ const ev = mkEv(t,d,new Date(d.getTime()+864e5),{allDay:true}); created.push(ev); return ev; } };
const farmEvents = [];
const farm = { getName:()=>'Farm cal', getTimeZone:()=>'America/Chicago', getId:()=>'farm-id@group.calendar.google.com',
  getEvents:()=>farmEvents.slice(),
  createEvent:(t,s,e)=>{ const ev = mkEv(t,s,e); farmEvents.push(ev); return ev; },
  createAllDayEvent:(t,d)=>{ const ev = mkEv(t,d,new Date(d.getTime()+864e5),{allDay:true}); farmEvents.push(ev); return ev; } };
const growthEvents = [];
const growth = { getName:()=>'Growth', getTimeZone:()=>'America/Chicago', getId:()=>'growth-id@group.calendar.google.com',
  getEvents:()=>growthEvents.slice(),
  createEvent:(t,s,e)=>{ const ev = mkEv(t,s,e); growthEvents.push(ev); return ev; },
  createAllDayEvent:(t,d)=>{ const ev = mkEv(t,d,new Date(d.getTime()+864e5),{allDay:true}); growthEvents.push(ev); return ev; } };
const family = { getName:()=>'Family', getTimeZone:()=>'America/Chicago', getId:()=>'family-id@group.calendar.google.com',
  getEvents:()=>[mkEv('Sample trip', '2026-11-16T06:00:00Z', '2026-11-20T06:00:00Z', { allDay:true }), mkEv('School concert', '2026-11-17T00:00:00Z', '2026-11-17T01:30:00Z')],
  createEvent:()=>{ throw new Error('FAMILY WRITE ATTEMPTED'); }, createAllDayEvent:()=>{ throw new Error('FAMILY WRITE ATTEMPTED'); } };
const holEv = (t, d) => ({ getTitle:()=>t, isAllDayEvent:()=>true, getAllDayStartDate:()=>new Date(d + 'T05:00:00Z') });
const holidays = { getName:()=>'Holidays in United States', getId:()=>'en.usa#holiday@group.v.calendar.google.com', getTimeZone:()=>'America/Chicago',
  getEvents:()=>[holEv('Veterans Day', '2026-11-11'), holEv('Thanksgiving Day', '2026-11-26'), holEv('Thanksgiving Day', '2026-11-26')],
  createEvent:()=>{ throw new Error('HOLIDAY WRITE ATTEMPTED'); } };
const work = { getName:()=>'Work', getTimeZone:()=>'America/Chicago', getId:()=>'tim@work.com', getEvents:()=>[],
  createEvent:()=>{ throw new Error('WORK WRITE ATTEMPTED'); } };
const ctx = {
  console: { log(){} },
  PropertiesService: { getScriptProperties: ()=>({ getProperty:k=>props[k]||null, setProperty:(k,v)=>{props[k]=v}, deleteProperty:k=>{delete props[k]} }) },
  CacheService: { getScriptCache: ()=>({ get:k=>cache[k]||null, put:(k,v)=>{cache[k]=v}, remove:k=>{delete cache[k]} }) },
  ContentService: { MimeType:{JSON:'json'}, createTextOutput: t=>({ text:t, setMimeType(){ return this; } }) },
  Utilities: { getUuid: ()=>require('crypto').randomUUID(), formatDate: (d)=> d.toISOString().slice(0,10), parseDate: (s)=> new Date(s+'T05:00:00Z') },
  Session: { getScriptTimeZone: ()=>'America/Chicago' },
  LockService: { getScriptLock: ()=>({ waitLock(){}, releaseLock(){} }) },
  CalendarApp: { GuestStatus:{NO:'NO'}, getDefaultCalendar:()=>personal, getCalendarById:id=> id==='tim@work.com'?work:id==='farm-id@group.calendar.google.com'?farm:id==='growth-id@group.calendar.google.com'?growth:id==='family-id@group.calendar.google.com'?family:id==='en.usa#holiday@group.v.calendar.google.com'?holidays:null, getAllCalendars:()=>[personal, work, farm, growth, holidays] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'),'utf8'), ctx);
const get = p => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(p) } }).text);
const post = b => JSON.parse(ctx.doPost({postData:{contents: typeof b === 'string' ? b : JSON.stringify(b)}}).text);
vm.runInContext("CONFIG.WORK_CALENDAR_ID = 'tim@work.com'", ctx);
ctx.setup(); const key = props.ACCESS_KEY;
console.log('work id saved to properties:', props.WORK_CALENDAR_ID);
vm.runInContext("CONFIG.WORK_CALENDAR_ID = 'you@your-employer.com'", ctx);
console.log('ping after code reset (work still found):', JSON.stringify(get({action:'ping', key})));
const now = Date.now(), s = new Date(now + 3600e3).toISOString(), e = new Date(now + 7200e3).toISOString();
const item = { cid: 'abc12345-0001', area: 'personal', title: 'Pick up bee feeder', start: s, end: e, allDay: false };
const A = require('assert');
A.strictEqual(post({ action:'create', item }).error, 'no_key', 'no key, no write');
A.strictEqual(post({ key:'x', action:'create', item }).error, 'unauthorized', 'a wrong key, no write');
A.strictEqual(post({ key, action:'create', item: Object.assign({}, item, { area:'work', cid:'abc12345-0002' }) }).error, 'not_writable', 'the Work calendar is read-only forever');
A.strictEqual(created.length, 0, 'nothing created by refused requests');
const c1 = post({ key, action:'create', item }); A.ok(c1.ok && c1.event.title === 'Pick up bee feeder' && c1.event.area === 'personal', JSON.stringify(c1));
const c2 = post({ key, action:'create', item }); A.ok(c2.ok && c2.event.id === c1.event.id, 'a resend returns the same event');
A.strictEqual(created.length, 1, 'the same capture id twice makes one calendar event');
A.strictEqual(post({ key, action:'create', item: Object.assign({}, item, { title:'  ', cid:'abc12345-0003' }) }).error, 'bad_title');
A.strictEqual(post({ key, action:'create', item: Object.assign({}, item, { start:e, end:s, cid:'abc12345-0004' }) }).error, 'bad_time');
const ad = post({ key, action:'create', item: { cid:'abc12345-0005', area:'personal', title:'Farmers market', allDay:true, start:'2026-10-10', end:'2026-10-11' } });
A.ok(ad.ok && ad.event.allDay === true && ad.event.start === '2026-10-10', JSON.stringify(ad));
A.strictEqual(post('{nope').error, 'bad_request', 'broken JSON is refused');
A.strictEqual(created.length, 2);
const ev = get({action:'events', key, from: now - 864e5, to: now + 5*864e5});
A.deepStrictEqual(ev.events.map(x => x.title).sort(), ['Farmers market', 'Pick up bee feeder']);
console.log('calendar write checks passed');

// --- farm calendar (bridge 1.8): off until FARM_CALENDAR_ID is set, then read and writable; Work still never
const assert = require('assert');
assert.deepStrictEqual(get({ action:'ping', key }).calendars.map(c => c.area), ['work', 'personal'], 'farm left out until linked');
const fitem = { cid:'farm-0001', area:'farm', title:'Inspect hive 2', start: s, end: e, allDay:false };
const off = post({ key, action:'create', item: fitem });
console.log('farm create before linking:', JSON.stringify(off));
assert.strictEqual(off.ok, false);
props.FARM_CALENDAR_ID = ' farm-id@group.calendar.google.com ';
const cals = get({ action:'ping', key }).calendars;
console.log('calendars once linked:', JSON.stringify(cals));
assert.deepStrictEqual(cals.map(c => c.area + ':' + c.ok), ['work:true', 'personal:true', 'farm:true']);
const on = post({ key, action:'create', item: Object.assign({}, fitem, { cid:'farm-0002' }) });
assert.ok(on.ok && on.event.area === 'farm', 'farm takes captures');
assert.strictEqual(farmEvents.length, 1);
const ev2 = get({ action:'events', key, from: now - 864e5, to: now + 5*864e5 });
assert.ok(ev2.events.some(x => x.area === 'farm' && x.title === 'Inspect hive 2'), 'farm events read');
assert.strictEqual(post({ key, action:'create', item: Object.assign({}, fitem, { area:'work', cid:'farm-0003' }) }).error, 'not_writable');
props.FARM_CALENDAR_ID = 'wrong-id';
assert.deepStrictEqual(get({ action:'ping', key }).calendars[2], { area:'farm', ok:false, error:'not_found' });
delete props.FARM_CALENDAR_ID;
console.log('farm calendar checks passed');

// --- Growth calendar (bridge 1.22): area 'hobby', off until GROWTH_CALENDAR_ID is set, then read and writable
const gitem = { cid:'grow-0001', area:'hobby', title:'Pottery class', start: s, end: e, allDay:false };
assert.strictEqual(post({ key, action:'create', item: gitem }).ok, false, 'no Growth captures before linking');
assert.ok(!get({ action:'ping', key }).calendars.some(c => c.area === 'hobby'), 'Growth left out until linked');
props.GROWTH_CALENDAR_ID = 'growth-id@group.calendar.google.com';
assert.deepStrictEqual(get({ action:'ping', key }).calendars.map(c => c.area + ':' + c.ok), ['work:true', 'personal:true', 'hobby:true']);
const gon = post({ key, action:'create', item: Object.assign({}, gitem, { cid:'grow-0002' }) });
assert.ok(gon.ok && gon.event.area === 'hobby' && growthEvents.length === 1, 'Growth takes captures');
assert.ok(get({ action:'events', key, from: now - 2*864e5, to: now + 6*864e5 }).events.some(x => x.area === 'hobby' && x.title === 'Pottery class'), 'Growth events read');
delete props.GROWTH_CALENDAR_ID;
console.log('growth calendar checks passed');

// --- Family calendar (bridge 1.42): area 'family', off until FAMILY_CALENDAR_ID is set, then read, never written
assert.ok(!get({ action:'ping', key }).calendars.some(c => c.area === 'family'), 'Family left out until linked');
props.FAMILY_CALENDAR_ID = 'family-id@group.calendar.google.com';
assert.deepStrictEqual(get({ action:'ping', key }).calendars.map(c => c.area + ':' + c.ok), ['work:true', 'personal:true', 'family:true']);
const fev = get({ action:'events', key, from: Date.parse('2026-11-15T06:00:00Z'), to: Date.parse('2026-11-22T06:00:00Z') }).events.filter(x => x.area === 'family');
assert.deepStrictEqual(fev.map(x => [x.title, x.allDay]), [['Sample trip', true], ['School concert', false]], 'Family events read, the trip as all day');
assert.ok(fev[0].start < fev[0].end, 'a multi-day span');
for (const it of [{ area:'family', allDay:false, start: s, end: e }, { area:'family', allDay:true, start:'2026-11-18', end:'2026-11-19' }])
  assert.strictEqual(post({ key, action:'create', item: Object.assign({ cid:'fam-' + Math.random().toString(36).slice(2, 10), title:'Should not save' }, it) }).error, 'not_writable', 'Family is read-only');
assert.ok(!Object.keys(ctx.WRITABLE).includes('family'));
assert.strictEqual(ctx.AREA_LABEL.family, 'Family');
delete props.FAMILY_CALENDAR_ID;
console.log('family calendar checks passed');

// --- holidays (bridge 1.23): found on its own, read-only, all-day, de-duplicated; never a source of events
assert.ok(get({ action:'ping', key }).capabilities.includes('holidays'));
const hol = get({ action:'holidays', key, from:'2026-10-14', to:'2027-10-14' });
console.log('holidays:', JSON.stringify(hol));
assert.strictEqual(hol.calendar, 'Holidays in United States');
assert.deepStrictEqual(hol.holidays, [{ date:'2026-11-11', title:'Veterans Day' }, { date:'2026-11-26', title:'Thanksgiving Day' }]);
assert.strictEqual(get({ action:'holidays', key, from:'2026-10-14', to:'2028-10-14' }).error, 'range_too_long');
assert.strictEqual(get({ action:'holidays', key, from:'nope', to:'2027-01-01' }).error, 'bad_range');
assert.ok(!get({ action:'ping', key }).calendars.some(c => /holiday/i.test(c.area)), 'not a calendar source: no hours, no meetings');
console.log('holiday checks passed');
