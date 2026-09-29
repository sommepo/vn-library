// Original vector artwork and DOM menu; no firmware or game assets.
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const paths={
  games:'M8 15h32c4 0 7 17 4 19-3 2-8-5-10-5H14c-2 0-7 7-10 5-3-2 0-19 4-19ZM12 19v9m-4-4.5h8m17-3h.1m6 5h.1',
  add:'M24 6a18 18 0 1 0 18 18M24 18a6 6 0 1 0 6 6M37 6v12m-6-6h12',
  settings:'M9 7v34m15-34v34M39 7v34M4 17h10m5 15h10m5-18h10',
  disc:'M24 5a19 19 0 1 0 0 38 19 19 0 0 0 0-38Zm0 13a6 6 0 1 0 0 12 6 6 0 0 0 0-12M10 17l6 3m16 8 6 3',
  display:'M5 9h38v26H5ZM16 42h16m-8-7v7',
  text:'m7 36 11-26 11 26M11 27h14m8-4c10-5 9 4 9 13m0-9c-14-4-14 13 0 6',
};
function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','xmb-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.disc);svg.append(path);return svg;
}
const action=(label,fn,name)=>{const node=element('button',null,'xmb-action');node.type='button';if(name)node.append(icon(name));node.append(element('span',label));node.onclick=fn;return node;};
const playable=game=>!['blocked','unsupported','extraction-only'].includes(game.compatibility?.status);

export function pspLibrary(body,games,{launch,saveLocation,display,settings,music}){
  const waves=element('div',null,'xmb-waves');waves.setAttribute('aria-hidden','true');
  waves.innerHTML='<svg viewBox="0 0 1200 600" preserveAspectRatio="none"><defs><linearGradient id="xmb-silk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g><path fill="url(#xmb-silk)" d="M-120 380C180 100 400 470 720 270S1090 130 1320 235V365C990 220 1000 190 720 340S170 210-120 510Z"/><path d="M-120 380C180 100 400 470 720 270S1090 130 1320 235"/><path d="M-120 410C180 130 400 495 720 300S1090 160 1320 265"/><path d="M-120 445C180 190 420 480 730 330S1100 210 1320 295"/></g></svg>';
  body.append(waves);
  const clock=element('time',null,'xmb-clock');
  const tick=()=>{const now=new Date();clock.dateTime=now.toISOString();clock.textContent=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};tick();
  const clockTimer=setInterval(tick,30000);body.append(clock);
  const shell=element('section',null,'xmb');shell.setAttribute('aria-label','portable library');
  const tabs=element('div',null,'xmb-categories');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Library categories');
  const content=element('div',null,'xmb-content');content.id='xmb-content';content.setAttribute('role','tabpanel');
  const categories=[['settings','Settings'],['games','Games'],['add','Add game']];
  let selected='games';
  const buttons=[];
  const show=id=>{
    selected=id;shell.dataset.category=id;
    for(const button of buttons){const active=button.dataset.category===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
    content.setAttribute('aria-labelledby',`xmb-${id}`);content.replaceChildren();
    if(id==='games'){
      if(!games.length){
        const empty=element('div',null,'xmb-empty');empty.append(icon('disc'),element('p','No games yet'));content.append(empty,action('Add game',()=>{show('add');buttons[2].focus();}));
      }
      for(const game of games){
        const row=element('details',null,'xmb-game'),summary=element('summary');summary.append(icon('disc'),element('span',game.title));row.append(summary);
        const actions=element('div',null,'xmb-game-actions');
        if(playable(game))actions.append(action('Read / resume',()=>launch(game)),action('Start again',()=>launch(game,false)),action('Save location',()=>saveLocation(game)));
        else actions.append(element('p','Not playable yet.'));
        row.append(actions);row.addEventListener('toggle',()=>{if(row.open)for(const other of content.querySelectorAll('details'))if(other!==row)other.open=false;});content.append(row);
      }
    }else if(id==='settings'){
      content.append(action('Display',display,'display'),action('Reading',settings,'text'));
      const audio=element('div',null,'xmb-audio');music(audio);content.append(audio);
    }else{
      const notice=element('div',null,'xmb-empty');notice.append(icon('add'),element('p','PSP imports aren’t supported yet.'));content.append(notice);
    }
  };
  for(const [id,label]of categories){
    const button=action(label,()=>show(id),id);button.className='xmb-category';button.dataset.category=id;button.id=`xmb-${id}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',content.id);buttons.push(button);tabs.append(button);
  }
  shell.append(tabs,content);body.append(shell);
  const footer=element('footer',null,'xmb-footer');footer.append(element('span','portable','xmb-wordmark'),element('span','← →  Select     ↑ ↓  Browse','xmb-hint'));body.append(footer);
  show(selected);
  shell.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.matches('input,select,textarea'))return;
    if(['ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();const index=categories.findIndex(([id])=>id===selected),next=(index+(event.key==='ArrowRight'?1:-1)+categories.length)%categories.length;show(categories[next][0]);buttons[next].focus();
    }else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      const items=[...content.querySelectorAll('button,summary')].filter(node=>node.getClientRects().length&&!node.disabled);
      // Closed disclosure contents have layout boxes in some engines.
      const visible=items.filter(node=>!node.closest('.xmb-game')||node.closest('.xmb-game').open||node.tagName==='SUMMARY');
      if(!visible.length)return;event.preventDefault();const index=visible.indexOf(document.activeElement);
      if(event.key==='ArrowUp'&&index===0){buttons[categories.findIndex(([id])=>id===selected)].focus();return;}
      const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));visible[next].focus();
    }
  });
  buttons[1].focus({preventScroll:true});
  return ()=>clearInterval(clockTimer);
}
