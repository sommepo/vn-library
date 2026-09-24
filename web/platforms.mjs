// Platform is content metadata, independent of the story interpreter.
export const PLATFORMS = Object.freeze([
  Object.freeze({id:'ps2',name:'PlayStation 2',label:'PLAYSTATION 2'}),
  // PC-98 presentation is parked; metadata/research below is retained.
]);
export const PLATFORM_KEY='vnkit.platform.v1';
// Keep the exact-edition bridge in sync with vnkit/platforms.py. A browser can
// receive new static files while the running server still has the old catalogue
// code loaded. Missing metadata must not hide these existing imports.
const LEGACY_PS2=new Set([
  'clannad-slpm66302-1.01','remember11-slpm65550-1.02',
  'remember11-slpm65550-1.0','never7-slps25256-1.01',
]);
export const platformId=game=>game?.platform?.id||(LEGACY_PS2.has(game?.id)?'ps2':'unknown');
export const platformGames=(games,id)=>games.filter(game=>platformId(game)===id);
export function storedPlatform(storage){
  try {const id=storage.getItem(PLATFORM_KEY);if(PLATFORMS.some(p=>p.id===id))return id;}catch{}
  return 'ps2';
}
export function platformNavigation(id,onSelect){
  const nav=document.createElement('nav');nav.className='platform-navigation';nav.setAttribute('aria-label','Platform');
  for(const platform of PLATFORMS){
    const button=document.createElement('button');button.type='button';button.textContent=platform.label;button.dataset.platform=platform.id;
    button.setAttribute('aria-pressed',String(platform.id===id));button.onclick=()=>onSelect(platform.id);nav.append(button);
  }
  nav.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();
    const next=PLATFORMS[(PLATFORMS.findIndex(p=>p.id===id)+1)%PLATFORMS.length];onSelect(next.id,true);
  });return nav;
}

// A fixed 640×400 desktop composition; small screens use an accessible reflow.
// Everything here is original UI. Game artwork is supplied by private imports.
export function pc98Library(body,games,{launch,saveLocation,importMedia,display,settings}){
  const desktop=document.createElement('section');desktop.className='pc98-desktop';desktop.setAttribute('aria-label','PC-9800 library');
  const title=document.createElement('header');title.className='pc98-titlebar';title.textContent='VN Library　／　ゲーム選択';desktop.append(title);
  const workspace=document.createElement('div');workspace.className='pc98-workspace';desktop.append(workspace);
  const shelf=document.createElement('section');shelf.className='pc98-shelf';
  const heading=document.createElement('h2');heading.textContent='ゲーム / Games';shelf.append(heading);
  const list=document.createElement('div');list.className='pc98-game-list';list.setAttribute('role','group');list.setAttribute('aria-label','Installed PC-98 games');shelf.append(list);workspace.append(shelf);
  const detail=document.createElement('section');detail.className='pc98-game-detail';detail.setAttribute('aria-live','polite');workspace.append(detail);
  const action=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
  const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
  const select=(game,index)=>{
    for(const [i,b]of [...list.children].entries())b.setAttribute('aria-pressed',String(i===index));
    detail.replaceChildren(text('p',`MEDIA ${String(index+1).padStart(2,'0')}`),text('h2',game.title));
    const blocked=['blocked','unsupported','extraction-only'].includes(game.compatibility?.status);
    detail.append(text('p',game.compatibility?.summary||'Ready to read.'));
    if(!blocked)detail.append(action('Read / resume',()=>launch(game)),action('Start again',()=>launch(game,false)),action('Save location',()=>saveLocation(game)));
    else detail.append(text('p','Resource recovery only. Playable support is not ready.'));
  };
  games.forEach((game,i)=>{
    const b=action(`${String(i+1).padStart(2,'0')}  ${game.title}`,()=>select(game,i));
    const open=()=>{if(!['blocked','unsupported','extraction-only'].includes(game.compatibility?.status))launch(game);};
    b.ondblclick=open;
    b.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();open();}});
    list.append(b);
  });
  if(games.length)select(games[0],0);
  else{
    list.append(text('p','No games imported.'));
    detail.append(text('div','PC-9800'),text('h2','Your PC-98 collection'),text('p','Add a supported game from your own media.'));
  }
  const tools=document.createElement('nav');tools.className='pc98-tools';tools.setAttribute('aria-label','Library tools');
  tools.append(action('Add game / Import media',importMedia),action('Display',display),action('Settings',settings));desktop.append(tools);
  const status=text('footer',`${games.length} game${games.length===1?'':'s'}　　↑↓ Select　 Enter Open`);status.className='pc98-status';desktop.append(status);body.append(desktop);
  list.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||!games.length)return;e.preventDefault();const at=[...list.children].indexOf(document.activeElement),n=e.key==='Home'?0:e.key==='End'?games.length-1:(at+(e.key==='ArrowDown'?1:-1)+games.length)%games.length;list.children[n].focus();select(games[n],n);});
  const resize=()=>{const room=body.clientWidth-16,available=window.innerHeight-180;const scale=Math.min(room/640,available/400);desktop.style.setProperty('--pc98-scale',String(Math.max(1,Math.floor(scale))));};
  const observer=new ResizeObserver(resize);observer.observe(body);resize();
  return ()=>observer.disconnect();
}
