// A private plan records source-bound recipes and earned-progress dependencies.
// Each case is independently replayed from its native new-game/menu entry.
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
const [input,planFile,destination]=process.argv.slice(2),out=path.resolve(destination),base=path.dirname(path.resolve(planFile));
await fs.mkdir(out,{recursive:false});const plan=JSON.parse(await fs.readFile(planFile));
const report={cases:[],errors:[],segments:0,restores:0,choices:0,scripts:[],policy:'Source-earned dependencies; complete native-entry replays; simulated media/timing'};
for(const item of plan.cases){
 if(!/^[a-z0-9-]+$/.test(item.id)||report.cases.some(c=>c.id===item.id))throw Error('Invalid/duplicate test case ID');
 const progress=item.progressFrom?path.join(out,item.progressFrom,'progress.json'):item.progressFile?path.resolve(base,item.progressFile):null;
 if(item.progressFrom&&!report.cases.some(c=>c.id===item.progressFrom&&!c.errors.length))throw Error('Progress must come from an earlier successful case');
 const args=[path.resolve(import.meta.dirname,'never7-route-replay.mjs'),path.resolve(input),path.resolve(base,item.recipe),path.join(out,item.id)];if(progress)args.push(progress);
 const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['ignore','ignore','inherit']});child.once('error',reject);child.once('exit',resolve);});
 const result=JSON.parse(await fs.readFile(path.join(out,item.id,'report.json')));
 report.cases.push({id:item.id,ending:result.ending,segments:result.segments,choices:result.choices.length,restores:result.restores,globals:result.globals,errors:result.errors});
 report.segments+=result.segments;report.restores+=result.restores;report.choices+=result.choices.length;
 report.scripts=[...new Set([...report.scripts,...result.scripts])].sort();
 if(status!==0)report.errors.push({id:item.id,errors:result.errors});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(`${item.id}: ${result.ending}, ${result.segments} segments, ${result.restores} restores, ${result.errors.length} errors`);
 if(status!==0){process.exitCode=1;break;}
}
