// Original synthetic Japanese for layout checks; no game text.
export function soundFixture(kind='text') {
  const p={kind,id:'synthetic-page',text:'これは表示の試験です。\n文字を絵に重ねます。',
    page:{width:320,height:240,fontSize:14,lineHeight:21,colour:'#eeeeee',choiceColour:'#ee6666',
      blocks:[{x:16,y:18,width:288,height:42,text:'これは表示の試験です。\n文字を絵に重ねます。'}]}};
  if(kind==='choice') {
    delete p.text;p.options=[{id:7,text:'Ａ　先へ進む\n　　足元を確かめる。'},{id:19,text:'Ｂ　ここで待つ'}];
    p.page.blocks.push({x:24,y:72,width:280,height:42,text:p.options[0].text,choiceId:7},
      {x:24,y:125,width:280,height:21,text:p.options[1].text,choiceId:19});
  }
  return p;
}

// Varied advances/bearings and a wrapped choice exercise native glyph geometry.
export function soundGlyphFixture() {
  const block=(text,y,choiceId)=>({x:16,y,width:288,height:48,text,...(choiceId==null?{}:{choiceId}),
    glyphs:[...text].map((text,i)=>({text,x:(i%6)*18+(i%2),y:Math.floor(i/6)*22+i%2,
      width:[7,11,14][i%3],height:12,u:0,v:0}))});
  return {kind:'choice',id:'synthetic-glyphs',options:[{id:7,text:'日本語の図書館で読む'}],
    page:{width:320,height:240,fontSize:14,lineHeight:22,colour:'#eeeeee',choiceColour:'#ee6666',
      font:{asset:'synthetic-font',width:32,height:32},blocks:[block('図書館で日本語を読む。',18),block('日本語の図書館で読む',82,7)]}};
}
