// Device-session navigation only. Saves and learning history stay independent.
export class LineHistory {
  constructor({limit=60,maxBytes=12*1024*1024}={}) {this.limit=limit;this.maxBytes=maxBytes;this.clear();}
  clear(){this.entries=[];this.bytes=0;}
  get length(){return this.entries.length;}
  push(save,id){
    if(!id)return;
    const json=JSON.stringify(save),bytes=json.length*2;
    if(bytes>this.maxBytes){this.clear();return;}
    this.entries.push({json,bytes});this.bytes+=bytes;
    while(this.entries.length>this.limit||this.bytes>this.maxBytes)this.shift();
  }
  shift(){const entry=this.entries.shift();if(entry)this.bytes-=entry.bytes;}
  peek(){const entry=this.entries.at(-1);return entry?JSON.parse(entry.json):null;}
  pop(){const entry=this.entries.pop();if(entry)this.bytes-=entry.bytes;}
}
