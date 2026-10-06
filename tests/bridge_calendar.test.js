const fs = require('fs'); const vm = require('vm');
const props = {}; const cache = {};
let created = [];
function mkEv(title, s, e, opts={}) {
  return { getTitle:()=>title, getId:()=> 'uid-'+title, getStartTime:()=>new Date(s), getEndTime:()=>new Date(e),
    isAllDayEvent:()=>!!opts.allDay, getLocation:()=>'', getMyStatus:()=>'YES',
    getAllDayStartDate:()=>new Date(s), getAllDayEndDate:()=>new Date(e), setDescription(){}, setTag(){} };
}
const personal = { getName:()=>'tim@gmail.com', getTimeZone:()=>'America/Chicago', getId:()=>'tim@gmail.com',
  getEvents:()=>created.slice(),
  createEvent:(t,s,e)=>{ const ev = mkEv(t,s,e); created.push(ev); return ev; },
  createAllDayEvent:(t,d)=>{ const ev = mkEv(t,d,new Date(d.getTime()+864e5),{allDay:true}); created.push(ev); return ev; } };
const work = { getName:()=>'Work', getTimeZone:()=>'America/Chicago', getId:()=>'tim@work.com', getEvents:()=>[],
  createEvent:()=>{ throw new Error('WORK WRITE ATTEMPTED'); } };
const ctx = {
  console: { log(){} },
  PropertiesService: { getScriptProperties: ()=>({ getProperty:k=>props[k]||null, setProperty:(k,v)=>{props[k]=v}, deleteProperty:k=>{delete props[k]} }) },
  CacheService: { getScriptCache: ()=>({ get:k=>cache[k]||null, put:(k,v)=>{cache[k]=v} }) },
  ContentService: { MimeType:{JSON:'json'}, createTextOutput: t=>({ text:t, setMimeType(){ return this; } }) },
  Utilities: { getUuid: ()=>require('crypto').randomUUID(), formatDate: (d)=> d.toISOString().slice(0,10), parseDate: (s)=> new Date(s+'T05:00:00Z') },
  Session: { getScriptTimeZone: ()=>'America/Chicago' },
  LockService: { getScriptLock: ()=>({ waitLock(){}, releaseLock(){} }) },
  CalendarApp: { GuestStatus:{NO:'NO'}, getDefaultCalendar:()=>personal, getCalendarById:id=> id==='tim@work.com'?work:null, getAllCalendars:()=>[personal, work] },
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
