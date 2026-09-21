import {test} from 'node:test';import assert from 'node:assert/strict';
import {isRead} from '../web/read-status.mjs';
import {validateReadPaths,inheritedRead} from '../web/adapters/clannad-read-paths.mjs';
import {Activity} from '../web/statistics.mjs';
import {seekNextChoice} from '../web/navigation.mjs';
test('completed canonical path is read without adding counts, occurrences or normal read IDs',async()=>{
 const a=new Activity('test'),before=structuredClone(a.data),id='SEEN0414.MZX:00000001';
 const e={content:{id:'test',runtime:{scripts:{'SEEN0414.MZX':{}}}},signature:'sig',routeProgress:()=>[{id:'misae',complete:false}]};
 const data={format:'vnkit.read-paths',version:1,gameId:'test',gameSignature:'sig',paths:{misae:{ids:[id]}}};e.readPaths=validateReadPaths(data,e);e.isInheritedRead=id=>inheritedRead(e,id);
 assert.equal(isRead(a,e,id),false);e.routeProgress=()=>[{id:'misae',complete:true}];assert.equal(isRead(a,e,id),true);assert.equal(isRead(a,e,'SEEN0414.MZX:alternate'),false);assert.deepEqual(a.data,before);
 const pages=[{kind:'text',id:'start'},{kind:'text',id},{kind:'text',id:'alternate'},{kind:'choice',id:'choice'}];let n=0;e.current=pages[0];e.advance=async()=>({pending:e.current=pages[++n],effects:[]});
 const result=await seekNextChoice(e);assert.equal(result.skippedSegments,2);assert.equal(isRead(a,e,id),true);assert.equal(isRead(a,e,'alternate'),false);assert.deepEqual(a.data,before);
 a.present({kind:'text',id:'alternate',occurrenceId:'one',text:'日本語',speaker:''});assert.equal(isRead(a,e,'alternate'),true);assert.equal(a.totals().characters,3);
 assert.throws(()=>validateReadPaths({...data,gameSignature:'wrong'},e));assert.throws(()=>validateReadPaths({...data,paths:{invented:{ids:[id]}}},e));
});
