import test from 'node:test';import assert from 'node:assert/strict';
import {cartagraExpression} from '../web/adapters/cartagra-expression.mjs';
const v=value=>({value}),o=(op,precedence)=>({op,precedence});
const context=()=>{const banks={40:{},41:{},45:{}};return{banks,read:(b,i)=>banks[b][i]||0,write:(b,i,v)=>banks[b][i]=v,special:()=>{throw Error('Unimplemented function');}};};
test('source precedence, computed references and 32-bit overflow',()=>{
  const c=context();
  assert.equal(cartagraExpression([o(40,10),v(3),o(20,0),v(7),o(3,7),v(5),o(1,9),v(4)],c),27);
  assert.equal(c.banks[40][3],27);
  assert.equal(cartagraExpression([v(0x7fffffff),o(3,7),v(1)],c),-2147483648);
  assert.equal(cartagraExpression([o(40,10),v(3),o(24,0),v(2)],c),25);
});
test('post increment changes referenced state; comparisons are boolean integers',()=>{
  const c=context();c.banks[40][1]=10;
  assert.equal(cartagraExpression([o(40,10),v(1),o(32,0)],c),11);
  assert.equal(cartagraExpression([o(40,10),v(1),o(15,1),v(11)],c),1);
});
test('unknown functions, leftover tokens and invalid assignment fail closed',()=>{
  const c=context();
  assert.throws(()=>cartagraExpression([o(51,10),v(4)],c),/Unimplemented/);
  assert.throws(()=>cartagraExpression([v(1),v(2)],c),/Unconsumed/);
  assert.throws(()=>cartagraExpression([v(1),o(20,0),v(2)],c),/requires a variable/);
});
