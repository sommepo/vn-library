import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeProbe} from '../web/adapters/shibuya428-native.mjs';
const op=(code,rs,rt,imm)=>(code<<26|rs<<21|rt<<16|imm&65535)>>>0;
function probe(words,globalPointer=0,float32=false){
  const bytes=new Uint8Array(words.length*4),v=new DataView(bytes.buffer);words.forEach((w,n)=>v.setUint32(n*4,w,true));
  return new NativeProbe({segments:[{address:0x1000,bytes},{address:0x2000,bytes:new Uint8Array(128),writable:true}],ranges:[[0x1000,0x1000+bytes.length]],stackTop:0x2070,globalPointer,float32});
}

const cop=(fmt,ft,fs,fd,fn)=>(17<<26|fmt<<21|ft<<16|fs<<11|fd<<6|fn)>>>0;
test('single-precision probes require explicit admission and round each operation',()=>{
  const words=[op(9,0,8,1),cop(4,8,0,0,0),cop(20,0,0,0,32),
    op(9,0,8,3),cop(4,8,1,0,0),cop(20,0,1,1,32),cop(16,1,0,2,3),
    op(57,29,2,0),cop(0,2,2,0,0),0x03e00008,0];
  assert.throws(()=>probe(words).call(0x1000),/Unsupported instruction/);
  const p=probe(words,0,true),b=new ArrayBuffer(4),v=new DataView(b);
  v.setFloat32(0,1/3,true);assert.equal(p.call(0x1000).value,v.getUint32(0,true));
  assert.equal(p.read(0x2070),v.getUint32(0,true));
});
test('float comparison branches retain delay-slot semantics and invalid math rolls back',()=>{
  const words=[op(9,0,8,-2),cop(4,8,1,0,0),cop(20,0,1,1,32),cop(16,0,1,0,60),
    op(17,8,3,1),op(9,0,2,7),0x03e00008,0];
  assert.equal(probe(words,0,true).call(0x1000).value,7);
  for(const fail of [cop(16,0,0,1,3),cop(17,0,0,0,0),cop(16,0,0,1,36)]){
    const p=probe([op(9,0,2,1),op(43,29,2,0),fail,0x03e00008,0],0,true);
    assert.throws(()=>p.call(0x1000));assert.equal(p.read(0x2070),0);
  }
});
test('an explicit native global pointer aliases the same mapped state as absolute loads',()=>{
  const p=probe([op(9,0,2,31),op(43,28,2,4),op(35,28,2,4),0x03e00008,0],0x2000);
  assert.equal(p.call(0x1000).value,31);assert.equal(p.read(0x2004),31);
  assert.throws(()=>probe([0],-1),/global pointer/);
});
test('native branch delay slots and not-taken likely annulment',()=>{
  const p=probe([op(9,0,2,1),op(20,4,0,1),op(9,2,2,10),0x03e00008,op(9,2,2,2)]);
  assert.equal(p.call(0x1000,[0]).value,13);
  assert.equal(p.call(0x1000,[1]).value,3);
});
test('native sign extension, EXT and signed memory',()=>{
  const p=probe([op(9,0,8,-2),op(41,29,8,0),op(33,29,2,0),0x03e00008,0]);
  assert.equal(p.call(0x1000).value,0xfffffffe);
  const q=probe([op(15,0,4,0x1234),(31<<26|4<<21|2<<16|7<<11|16<<6),0x03e00008,0]);
  assert.equal(q.call(0x1000).value,0x34);
});
test('INS replaces only the requested bit field and rejects reversed bounds',()=>{
 const ins=(31<<26|4<<21|5<<16|19<<11|8<<6|4)>>>0;
 const p=probe([ins,0x00a01021,0x03e00008,0]);
 assert.equal(p.call(0x1000,[0x12345678,0xabcdef01]).value,0xabc67801);
 const whole=probe([(31<<26|4<<21|5<<16|31<<11|4)>>>0,0x00a01021,0x03e00008,0]);
 assert.equal(whole.call(0x1000,[0x12345678,0xffffffff]).value,0x12345678);
 assert.throws(()=>probe([(31<<26|4<<21|5<<16|7<<11|8<<6|4)>>>0]).call(0x1000),/Invalid INS/);
});
test('Allegrex min/max compare signed operands without floating-point admission',()=>{
 for(const [fn,expected]of [[0x2c,7],[0x2d,0xffffffff]]){
  const p=probe([(4<<21|5<<16|2<<11|fn)>>>0,0x03e00008,0]);
  assert.equal(p.call(0x1000,[0xffffffff,7]).value,expected);
  assert.equal(p.call(0x1000,[7,0xffffffff]).value,expected);
 }
});
test('unmapped writes, system calls and budget exhaustion roll back memory',()=>{
  for(const tail of [0x0000000c,op(43,0,2,0),op(4,0,0,-1),0x08000c00,0x00200002]){
    const p=probe([op(9,0,2,12),op(43,29,2,0),tail,0]);
    assert.throws(()=>p.call(0x1000,[],20));assert.equal(p.read(0x2070),0);
  }
});
test('code bytes cannot be overwritten and unaligned access fails',()=>{
  const p=probe([0x03e00008,0]);
  assert.throws(()=>p.write(0x1000,0),/mutable/);
  assert.throws(()=>p.read(0x2001),/Unaligned/);
});

test('little-endian unaligned word pairs preserve surrounding bytes at all offsets',()=>{
 for(let offset=0;offset<4;offset++){
  const p=probe([op(34,4,2,3),op(38,4,2,0),op(42,5,2,3),op(46,5,2,0),0x03e00008,0]);
  for(let i=0;i<12;i++){p.write(0x2000+i,i+1,1);p.write(0x2020+i,0xaa,1);}
  assert.equal(p.call(0x1000,[0x2000+offset,0x2020+offset]).value,((offset+4)<<24|(offset+3)<<16|(offset+2)<<8|offset+1)>>>0);
  for(let i=0;i<12;i++)assert.equal(p.read(0x2020+i,1),i>=offset&&i<offset+4?i+1:0xaa);
 }
});
test('absolute float is opt-in and normalizes negative zero',()=>{
 const words=[cop(4,4,0,0,0),cop(16,0,0,1,5),cop(0,2,1,0,0),0x03e00008,0];
 assert.throws(()=>probe(words).call(0x1000,[0xbf800000]),/Unsupported/);
 const p=probe(words,0,true);assert.equal(p.call(0x1000,[0xbf800000]).value,0x3f800000);assert.equal(p.call(0x1000,[0x80000000]).value,0);
});
