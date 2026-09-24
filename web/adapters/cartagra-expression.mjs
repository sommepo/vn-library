/* Cartagra SLPM-66231 expression tokens. No JavaScript eval or native execution.
 * SC3 token layout: MAGES Engine Compendium. Semantics checked against the
 * edition's 0x116618/0x116cc8 evaluator; uncommon operations remain unverified.
 * The parser design also consulted impacto's ISC expression evaluator; retain
 * third_party/LICENSE-impacto.txt. Context owns every memory operation.
 */
export function cartagraExpression(tokens, context){
  if(!Array.isArray(tokens)||!tokens.length||tokens.length>256)throw Error('Invalid SC3 expression');
  let at=0;
  const binary=new Set([1,2,3,4,5,6,7,8,9,10,12,13,14,15,16,17,20,21,22,23,24,25,26,27,28,29,30]);
  function parse(min=0){
    const t=tokens[at++];if(!t)throw Error('Truncated SC3 expression');
    let left;
    if(Number.isInteger(t.value))left={value:t.value|0};
    else if([11,40,41,43,45,51].includes(t.op))left={op:t.op,right:parse(t.precedence+1)};
    else if([42,44,46].includes(t.op))left={op:t.op,left:parse(t.precedence+1),right:parse(t.precedence+1)};
    else if([47,48,49,50].includes(t.op))left={op:t.op};
    else throw Error(`Unknown SC3 expression term ${t.op}`);
    while(at<tokens.length&&tokens[at].precedence>=min){
      const t=tokens[at];
      if(t.op===32||t.op===33){at++;left={op:t.op,left};continue;}
      if(!binary.has(t.op))break;
      at++;left={op:t.op,left,right:parse(t.precedence+1)};
    }
    return left;
  }
  const tree=parse();if(at!==tokens.length)throw Error(`Unconsumed SC3 expression token ${at}`);
  function ref(n){
    if(![40,41,45].includes(n.op))throw Error('SC3 assignment requires a variable');
    return {bank:n.op,index:read(n.right)};
  }
  function put(n,value){const r=ref(n);context.write(r.bank,r.index,value|0);return value|0;}
  const calculate=(op,x,y)=>{
    switch(op){
      case 1:return Math.imul(x,y);case 2:return y?Math.trunc(x/y)|0:0x7fffffff;
      case 3:return(x+y)|0;case 4:return(x-y)|0;case 5:return y?x%y:0x7fffffff;
      case 6:return x<<(y&31);case 7:return x>>(y&31);case 8:return x&y;case 9:return x^y;case 10:return x|y;
      case 12:return +(x===y);case 13:return +(x!==y);case 14:return +(x<=y);case 15:return +(x>=y);case 16:return +(x<y);case 17:return +(x>y);
      default:throw Error(`Unknown SC3 arithmetic ${op}`);
    }
  };
  function read(n){
    if('value'in n)return n.value;
    if([40,41,45].includes(n.op))return context.read(n.op,read(n.right))|0;
    if(n.op===11)return ~read(n.right);
    if(n.op===20)return put(n.left,read(n.right));
    if(n.op>=21&&n.op<=30){const op={21:1,22:2,23:3,24:4,25:5,26:6,27:7,28:8,29:10,30:9}[n.op];return put(n.left,calculate(op,read(n.left),read(n.right)));}
    if(n.op===32||n.op===33)return put(n.left,(read(n.left)+(n.op===32?1:-1))|0);
    if(n.op>=42)return context.special(n.op,n.left?read(n.left):null,n.right?read(n.right):null)|0;
    return calculate(n.op,read(n.left),read(n.right));
  }
  return read(tree);
}
