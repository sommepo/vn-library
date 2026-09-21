import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Activity,readingDay,SESSION_GAP,validateActivity} from '../web/statistics.mjs';
const clone=structuredClone;
const line=(id,occurrenceId=id)=>({kind:'text',id,occurrenceId,text:'日本語。',speaker:''});
function setup(){let time=new Date(2026,8,19,3,59).getTime(),id=0;const options={now:()=>time,makeId:()=>String(++id)};return{options,move:n=>time+=n,at:n=>time=n,activity:new Activity('test',null,options)};}
test('reload resumes within four hours; idle heartbeats never postpone a new session',()=>{
 const x=setup();let a=x.activity;a.present(line('a'));const id=a.session.id;x.move(SESSION_GAP-1);a=new Activity('test',clone(a.data),x.options);assert.equal(a.session.id,id);
 x.move(1);a.tick({visible:false});a.interact();assert.notEqual(a.session.id,id);assert.equal(a.session.characters,0);assert.equal(a.data.sessions.length,2);assert.equal(a.totals().characters,4);
 a.present(line('b'));x.move(SESSION_GAP-1);a.interact();x.move(SESSION_GAP-1);a.interact();assert.equal(a.data.sessions.length,2);
});
test('local reading day switches at 04:01, not midnight or 04:00',()=>{
 for(const [h,m,day]of [[0,0,'2026-09-18'],[4,0,'2026-09-18'],[4,1,'2026-09-19'],[23,59,'2026-09-19']])assert.equal(readingDay(new Date(2026,8,19,h,m).getTime()),day);
 assert.equal(readingDay(new Date(2026,0,1,4,0).getTime()),'2025-12-31');
});
test('persisted ledger supports cross-day reset and individual deletion without forgetting text',()=>{
 const x=setup();let a=x.activity;a.present(line('a'));x.move(120000);a.interact();a.present(line('b'));assert.equal(Object.keys(a.session.days).length,2);
 a=new Activity('test',clone(a.data),x.options);assert.equal(a.session.characters,8);a.resetSession();assert.equal(a.totals().characters,0);assert.equal(a.present(line('a')),null);
 a.present(line('c'));const old=a.session.id;x.move(SESSION_GAP);a.interact();a.present(line('d'));const history=clone(a.data.backlog);a.deleteSession(old);assert.equal(a.totals().characters,4);assert.deepEqual(a.data.backlog,history);
 a.deleteSession(a.session.id);assert.equal(a.totals().characters,0);assert.equal(a.data.sessions.length,1);assert.ok(validateActivity(a.data,'test'));assert.equal(a.present(line('d')),null);
});
test('v1 migration retains totals and IDs, labels estimated days and validates ledger',()=>{
 const x=setup();x.activity.present(line('a'));const old=clone(x.activity.data);old.version=1;for(const s of old.sessions){delete s.days;delete s.lastActivityAt;}
 const a=new Activity('test',old,x.options);assert.equal(a.totals().characters,4);assert.equal(a.session.dayEstimated,true);assert.ok(validateActivity(a.data,'test'));a.data.sessions[0].days[Object.keys(a.session.days)[0]].characters++;assert.equal(validateActivity(a.data,'test'),false);
});
