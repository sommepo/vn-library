// Original PSone-inspired UI. No firmware assets or commercial game content.
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const action=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
function artwork(kind){
  const node=el('span',null,`one-art one-${kind}`);node.setAttribute('aria-hidden','true');
  node.innerHTML=kind==='disc'?'<i></i>':'<i></i><i></i><i></i><i></i>';return node;
}
export function psoneLibrary(body,games,{launch,soundTest,saveLocation,display,settings,music}){
  const shell=el('section',null,'one-shell');shell.setAttribute('aria-label','one library');
  const tabs=el('div',null,'one-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Library categories');
  const content=el('div',null,'one-content');content.id='one-content';content.setAttribute('role','tabpanel');
  let selected='games';const buttons=[];
  const categories=[['settings','Settings','card'],['games','Games','disc']];
  const show=id=>{
    selected=id;content.replaceChildren();content.setAttribute('aria-labelledby',`one-${id}`);
    for(const b of buttons){const active=b.dataset.category===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
    if(id==='settings'){
      const tools=el('div',null,'one-actions');tools.append(action('Display',display),action('Reading',settings));content.append(tools);
      const audio=el('div',null,'one-audio');music(audio);content.append(audio);
    }else{
      if(!games.length)content.append(el('p','No games yet.','one-empty'));
      for(const game of games){
        const row=el('details',null,'one-game'),heading=el('summary',game.title);row.append(heading);
        if(['blocked','unsupported','extraction-only'].includes(game.compatibility?.status))row.append(el('p','Not playable yet.'));
        else{const actions=el('div',null,'one-actions');actions.append(action('Read / resume',()=>launch(game)),action('Start again',()=>launch(game,false)),action('Sound test',()=>soundTest(game)),action('Save location',()=>saveLocation(game)));row.append(actions);}
        row.addEventListener('toggle',()=>{if(row.open)for(const other of content.querySelectorAll('.one-game'))if(other!==row)other.open=false;});content.append(row);
      }
      const tools=el('div',null,'one-actions'),notice=el('p',null,'one-availability');notice.setAttribute('role','status');
      tools.append(action('Add game',()=>{notice.textContent='Memories Off CUE/BIN imports use the local importer.';}));content.append(tools,notice);
    }
  };
  for(const [id,label,art]of categories){
    const b=action('',()=>show(id));b.className='one-category';b.id=`one-${id}`;b.dataset.category=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',content.id);b.append(el('span',label,'one-label'),artwork(art));buttons.push(b);tabs.append(b);
  }
  shell.append(tabs,content);body.append(shell);
  const footer=el('footer',null,'one-footer');footer.append(el('span','one','one-wordmark'),el('span','← →  Select     ↑ ↓  Browse','one-hint'));body.append(footer);
  show(selected);
  shell.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.matches('input,select,textarea'))return;
    if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=selected==='games'?0:1;show(categories[next][0]);buttons[next].focus();}
    else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      const targets=[...content.querySelectorAll('button,summary')].filter(n=>!n.disabled&&n.getClientRects().length&&(!n.closest('.one-game')||n.tagName==='SUMMARY'||n.closest('.one-game').open));
      if(!targets.length)return;event.preventDefault();const index=targets.indexOf(document.activeElement);
      if(event.key==='ArrowUp'&&index===0){buttons[selected==='games'?1:0].focus();return;}
      const next=event.key==='Home'?0:event.key==='End'?targets.length-1:Math.max(0,Math.min(targets.length-1,index+(event.key==='ArrowDown'?1:-1)));targets[next].focus();
    }
  });
  buttons[1].focus({preventScroll:true});
  return ()=>{};
}
