/* Two shared native streaming channels. Music searches 0 then 1; the movie
 * allocator searches 1 then 0. Ordinary sound voices use a different backend.
 * Ownership is transient presentation state, not a reader save format. */
export class Shibuya428Channels {
 constructor(){this.owners=[null,null];}
 freeMovie(){return this.owners[1]===null?1:this.owners[0]===null?0:-1;}
 acquire(owner,kind){
  if(typeof owner!=='string'||!owner||!['music','movie'].includes(kind)||this.owners.includes(owner))throw Error('428 channel ownership');
  const channel=(kind==='music'?[0,1]:[1,0]).find(n=>this.owners[n]===null);
  if(channel===undefined)throw Error('428 streaming channels are occupied');
  this.owners[channel]=owner;return channel;
 }
 release(owner){const channel=this.owners.indexOf(owner);if(channel>=0)this.owners[channel]=null;}
 reset(){this.owners=[null,null];}
}
