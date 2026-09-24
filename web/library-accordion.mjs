// Native details/summary semantics, with measured, interruptible transitions.
// Close the old title before opening the new one: never expose two action sets.
export function libraryAccordion(catalogue) {
  const titles=[...catalogue.querySelectorAll('.console-title')];
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const contents=new Map(),listeners=[];
  let selected=null,revision=0,active=null,disposed=false;
  for(const title of titles){
    const content=document.createElement('div');content.className='console-title-content';
    content.append(...[...title.children].slice(1));title.append(content);contents.set(title,content);
    const summary=title.firstElementChild;
    const click=event=>{
      event.preventDefault();summary.focus({preventScroll:true});
      selected=selected===title?null:title;transition();
    };
    summary.addEventListener('click',click);listeners.push([summary,click]);
  }
  function cancel(){
    if(!active)return;
    const {title,content,height,fade}=active;
    // Freeze at the currently painted size before cancelling. Rapid taps can
    // reverse direction without jumping to the old animation's endpoint.
    title.style.height=`${title.getBoundingClientRect().height}px`;
    content.style.opacity=getComputedStyle(content).opacity;
    content.style.transform=getComputedStyle(content).transform;
    height.cancel();fade.cancel();active=null;
  }
  function clear(title){
    title.style.height='';title.classList.remove('is-transitioning');
    const content=contents.get(title);content.style.opacity='';content.style.transform='';content.inert=false;
  }
  async function animate(title,opening,turn){
    const content=contents.get(title),from=title.getBoundingClientRect().height;
    const opacity=title.open?getComputedStyle(content).opacity:'0';
    const transform=title.open?getComputedStyle(content).transform:'translateY(-5px)';
    if(opening)title.open=true;
    if(motion.matches||!title.animate){title.open=opening;clear(title);return;}
    title.style.height='';
    const to=opening?title.getBoundingClientRect().height:title.firstElementChild.getBoundingClientRect().height;
    title.style.height=`${from}px`;title.classList.add('is-transitioning');content.inert=!opening;
    const options={duration:opening?280:170,easing:opening?'cubic-bezier(.22,1,.36,1)':'cubic-bezier(.4,0,.2,1)',fill:'both'};
    const height=title.animate([{height:`${from}px`},{height:`${to}px`}],options);
    const fade=content.animate([{opacity,transform},{opacity:opening?1:0,transform:opening?'translateY(0)':'translateY(-5px)'}],options);
    active={title,content,height,fade};
    await height.finished.catch(()=>{});
    if(disposed||turn!==revision)return;
    title.open=opening;active=null;height.cancel();fade.cancel();clear(title);
  }
  async function transition(){
    const turn=++revision;cancel();
    for(const title of titles){
      if(title.open&&title!==selected)await animate(title,false,turn);
      if(disposed||turn!==revision)return;
    }
    if(selected)await animate(selected,true,turn);
  }
  const resize=()=>transition();
  window.addEventListener('resize',resize);motion.addEventListener('change',resize);
  return ()=>{
    disposed=true;++revision;cancel();
    window.removeEventListener('resize',resize);motion.removeEventListener('change',resize);
    for(const [summary,click]of listeners)summary.removeEventListener('click',click);
    for(const title of titles)clear(title);
  };
}
