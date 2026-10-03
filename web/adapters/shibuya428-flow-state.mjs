/* Compact mutable FLO records, separate from SNS reading records and source
 * metadata. This is a transaction snapshot, not a complete reader save. Native
 * pointers, executable memory and immutable source rows are never serialized. */
export class Shibuya428FlowState {
 constructor(signature,count){
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!Number.isInteger(count)||count<1||count>2000)throw Error('428 flow identity');
  this.signature=signature;this.count=count;this.words=new Uint32Array(count*8);this.globals=new Uint32Array(11);
 }
 snapshot(){
  const records=[];for(let n=1;n<this.count;n++){const words=Array.from(this.words.subarray(n*8,n*8+8));if(words.some(Boolean))records.push([n,...words]);}
  return {version:1,signature:this.signature,count:this.count,globals:Array.from(this.globals),records};
 }
 restore(value){
  const word=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
  if(value?.version!==1||value.signature!==this.signature||value.count!==this.count||!Array.isArray(value.globals)||value.globals.length!==11||!value.globals.every(word)||!Array.isArray(value.records)||value.records.length>=this.count)throw Error('428 flow snapshot identity or bound');
  const words=new Uint32Array(this.words.length);let previous=0;
  for(const row of value.records){
   if(!Array.isArray(row)||row.length!==9||!row.every(word)||row[0]<=previous||row[0]>=this.count)throw Error('428 flow record order or bound');
   words.set(row.slice(1),row[0]*8);previous=row[0];
  }
  this.words=words;this.globals=Uint32Array.from(value.globals);
 }
}
