// Fit the complete source frame to the space actually left by browser chrome.
// Graphics and selectable dialogue share that frame in every orientation.
export class ReaderLayout {
  constructor(area,stage){
    this.area=area;this.stage=stage;this.viewport={width:800,height:500};
    this.resize=()=>{
      const visual=window.visualViewport;
      // Do not reflow the reader to the shrunken viewport during pinch zoom.
      const height=visual&&visual.scale===1?visual.height:window.innerHeight;
      document.documentElement.style.setProperty('--reader-height',`${height}px`);
      this.fit();
    };
    this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(area);
    window.addEventListener('resize',this.resize);
    window.visualViewport?.addEventListener('resize',this.resize);
    document.addEventListener('fullscreenchange',()=>{
      const active=document.fullscreenElement===document.documentElement;
      document.body.classList.toggle('reader-fullscreen',active);
      const button=document.getElementById('fullscreenButton');
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active?'Exit fullscreen':'Fullscreen');
      this.resize();
    });
    this.resize();
  }
  setViewport(view){if(view?.width>0&&view?.height>0)this.viewport=view;this.fit();}
  fit(){
    const area=getComputedStyle(this.area),stage=getComputedStyle(this.stage),px=value=>parseFloat(value)||0;
    const w=this.area.clientWidth-px(area.paddingLeft)-px(area.paddingRight);
    const h=this.area.clientHeight-px(area.paddingTop)-px(area.paddingBottom);
    const bx=px(stage.borderLeftWidth)+px(stage.borderRightWidth),by=px(stage.borderTopWidth)+px(stage.borderBottomWidth);
    const ratio=this.viewport.width/this.viewport.height;
    const maximum=document.body.classList.contains('reader-fullscreen')?Infinity:1200;
    const width=Math.max(1,Math.min(w-bx,(h-by)*ratio,maximum));
    this.stage.style.setProperty('--fit-width',`${width+bx}px`);
    this.stage.style.setProperty('--fit-height',`${width/ratio+by}px`);
    this.stage.style.setProperty('--text-scale',String(Math.min(1,width/this.viewport.width)));
  }
}
