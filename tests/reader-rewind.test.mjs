import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LineHistory} from '../web/rewind.mjs';
test('rewind snapshots are isolated and bounded, preserve repeated source encounters',()=>{
 const history=new LineHistory({limit:2,maxBytes:1000});
 const save={state:{pc:1,variables:{a:2}},media:{music:{time:3}}};
 history.push(save,'same');save.state.pc=2;history.push(save,'same');save.state.pc=3;
 assert.equal(history.peek().state.pc,2);history.peek().state.pc=99;assert.equal(history.peek().state.pc,2);
 history.pop();assert.equal(history.peek().state.pc,1);
 history.push(save,'third');history.push({state:{pc:4}},'fourth');assert.equal(history.length,2);
 history.pop();assert.equal(history.peek().state.pc,3);
 history.push({tooBig:'x'.repeat(1000)},'oversize');assert.equal(history.length,0);
 history.push(save,null);assert.equal(history.length,0);
 history.push(save,'ok');history.clear();assert.equal(history.bytes,0);assert.equal(history.peek(),null);
});
