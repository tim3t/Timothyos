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
  CalendarApp: { GuestStatus:{NO:'NO'}, getDefaultCalendar:()=>personal, getCalendarById:id=> id==='tim@work.com'?work:id==='farm-id@group.calendar.google.com'?farm:null, getAllCalendars:()=>[personal, work, farm] },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'),'utf8'), ctx);
const get = p => JSON.parse(ctx.doGet({parameter:p}).text);
const post = b => JSON.parse(ctx.doPost({postData:{contents: typeof b === 'string' ? b : JSON.stringify(b)}}).text);
vm.runInContext("CONFIG.WORK_CALENDAR_ID = 'tim@work.com'", ctx);
ctx.setup(); const key = props.ACCESS_KEY;
console.log('work id saved to properties:', props.WORK_CALENDAR_ID);
vm.runInContext("CONFIG.WORK_CALENDAR_ID = 'you@your-employer.com'", ctx);
console.log('ping after code reset (work still found):', JSON.stringify(get({action:'ping', key})));
const now = Date.now(), s = new Date(now + 3600e3).toISOString(), e = new Date(now + 7200e3).toISOString();
const item = { cid: 'abc12345-0001', area: 'personal', title: 'Pick up bee feeder', start: s, end: e, allDay: false };
console.log('no key:', JSON.stringify(post({ action:'create', item })));
console.log('wrong key:', JSON.stringify(post({ key:'x', action:'create', item })));
console.log('work target:', JSON.stringify(post({ key, action:'create', item: Object.assign({}, item, { area:'work', cid:'abc12345-0002' }) })));
console.log('create:', JSON.stringify(post({ key, action:'create', item })));
console.log('resend same cid:', JSON.stringify(post({ key, action:'create', item })).slice(0, 80), '| events created:', created.length);
console.log('empty title:', JSON.stringify(post({ key, action:'create', item: Object.assign({}, item, { title:'  ', cid:'abc12345-0003' }) })));
console.log('end before start:', JSON.stringify(post({ key, action:'create', item: Object.assign({}, item, { start:e, end:s, cid:'abc12345-0004' }) })));
console.log('all day:', JSON.stringify(post({ key, action:'create', item: { cid:'abc12345-0005', area:'personal', title:'Farmers market', allDay:true, start:'2026-10-10', end:'2026-10-11' } })));
console.log('bad json:', JSON.stringify(post('{nope')));
const ev = get({action:'events', key, from: now - 864e5, to: now + 5*864e5});
console.log('events now include created:', ev.events.map(x => x.title).join(' | '), '| caps', ev.capabilities);

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
