const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const minimapIdleMs=3000;

export class PreviewView {
  constructor(viewport,canvas) {
    this.viewport=viewport;
    this.canvas=canvas;
    this.width=1920;
    this.height=1080;
    this.scale=1;
    this.auto=true;
    this.x=0;
    this.y=0;
    this.map=document.createElement('div');
    this.map.hidden=true;
    this.map.className='preview-map';
    this.map.title='Drag to navigate the zoomed frame';
    this.thumbnail=document.createElement('canvas');
    this.box=document.createElement('div');
    this.box.className='preview-map-box';
    this.map.append(this.thumbnail,this.box);
    viewport.append(this.map);
    this.map.addEventListener('pointerleave',()=>this.scheduleMinimapHide());
    viewport.tabIndex=0;
    viewport.setAttribute('aria-label','Preview. Drag to pan. Control or Command plus wheel to zoom. Arrow keys to pan.');
    document.getElementById('preview-fit').onclick=()=>this.fit();
    viewport.addEventListener('wheel',event=>{
      if(viewport.classList.contains('showing-asset')) return;
      if(this.map.contains(event.target)) return;
      event.preventDefault();
      const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
      if(event.ctrlKey||event.metaKey) {
        const rect=viewport.getBoundingClientRect();
        this.zoom(this.scale*Math.exp(-event.deltaY*unit*.005),event.clientX-rect.left,event.clientY-rect.top);
      } else {
        this.x-=(event.shiftKey?event.deltaY:event.deltaX)*unit;
        this.y-=(event.shiftKey?0:event.deltaY)*unit;
        this.layout({revealMinimap:true});
      }
    },{passive:false});
    let drag=null;
    viewport.onpointerdown=event=>{
      if(viewport.classList.contains('showing-asset')) return;
      if(event.defaultPrevented) return;
      if(event.button!==0&&event.button!==1) return;
      event.preventDefault();
      viewport.focus({preventScroll:true});
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,map:this.map.contains(event.target)};
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('panning');
      if(drag.map) this.navigate(event);
    };
    viewport.onpointermove=event=>{
      if(drag?.id!==event.pointerId) return;
      if(drag.map) this.navigate(event);
      else {
        this.x+=event.clientX-drag.x;
        this.y+=event.clientY-drag.y;
        this.layout({revealMinimap:true});
      }
      drag.x=event.clientX;
      drag.y=event.clientY;
    };
    const end=()=>{
      if(!drag) return;
      drag=null;
      viewport.classList.remove('panning');
      this.scheduleMinimapHide();
    };
    viewport.onpointerup=end;
    viewport.onpointercancel=end;
    viewport.onlostpointercapture=end;
    viewport.onkeydown=event=>{
      const offset=event.shiftKey?80:20;
      const moves={ArrowLeft:[offset,0],ArrowRight:[-offset,0],ArrowUp:[0,offset],ArrowDown:[0,-offset]};
      if(!moves[event.key]) return;
      event.preventDefault();
      event.stopPropagation();
      this.x+=moves[event.key][0];
      this.y+=moves[event.key][1];
      this.layout({revealMinimap:true});
    };
  }

  zoom(scale,px=this.viewport.clientWidth/2,py=this.viewport.clientHeight/2) {
    const ratio=clamp(scale,.01,8)/this.scale;
    this.x=px-this.viewport.clientWidth/2-(px-this.viewport.clientWidth/2-this.x)*ratio;
    this.y=py-this.viewport.clientHeight/2-(py-this.viewport.clientHeight/2-this.y)*ratio;
    this.scale=clamp(scale,.01,8);
    this.auto=false;
    this.layout({revealMinimap:true});
  }

  fit() {
    this.auto=true;
    this.x=this.y=0;
    this.layout();
  }

  layout({width=this.width,height=this.height,revealMinimap=false}={}) {
    const frameChanged=width!==this.width||height!==this.height;
    this.width=width;
    this.height=height;
    const w=this.viewport.clientWidth;
    const h=this.viewport.clientHeight;
    if(!w||!h) {
      this.hideMinimap();
      return;
    }
    if(this.auto) this.scale=Math.min(w/width,h/height);
    const cw=width*this.scale;
    const ch=height*this.scale;
    this.x=clamp(this.x,-Math.max(0,(cw-w)/2),Math.max(0,(cw-w)/2));
    this.y=clamp(this.y,-Math.max(0,(ch-h)/2),Math.max(0,(ch-h)/2));
    Object.assign(this.canvas.style,{width:cw+'px',height:ch+'px',left:((w-cw)/2+this.x)+'px',top:((h-ch)/2+this.y)+'px'});
    const cropped=cw>w+.5||ch>h+.5;
    this.viewport.classList.toggle('can-pan',cropped);
    if(!cropped||frameChanged||this.viewport.classList.contains('showing-asset')) {
      this.hideMinimap();
    } else if(revealMinimap) {
      this.map.hidden=false;
      this.scheduleMinimapHide();
    }
    const mw=Math.min(144,100*width/height);
    const mh=mw*height/width;
    this.map.style.width=mw+'px';
    this.map.style.height=mh+'px';
    if(this.thumbnail.width!==Math.round(mw)) this.thumbnail.width=Math.round(mw);
    if(this.thumbnail.height!==Math.round(mh)) this.thumbnail.height=Math.round(mh);
    Object.assign(this.box.style,{
      left:Math.max(0,((cw-w)/2-this.x)/cw*mw)+'px',
      top:Math.max(0,((ch-h)/2-this.y)/ch*mh)+'px',
      width:Math.min(1,w/cw)*mw+'px',
      height:Math.min(1,h/ch)*mh+'px'
    });
    this.overview();
    this.onLayout?.();
  }

  navigate(event) {
    const rect=this.map.getBoundingClientRect();
    this.x=(.5-clamp((event.clientX-rect.left)/rect.width,0,1))*this.width*this.scale;
    this.y=(.5-clamp((event.clientY-rect.top)/rect.height,0,1))*this.height*this.scale;
    this.layout({revealMinimap:true});
  }

  hideMinimap() {
    clearTimeout(this.minimapTimer);
    this.map.hidden=true;
  }

  scheduleMinimapHide() {
    clearTimeout(this.minimapTimer);
    if(this.map.hidden) return;
    this.minimapTimer=setTimeout(()=>{
      if(!this.map.matches(':hover')&&!this.viewport.classList.contains('panning')) this.map.hidden=true;
    },minimapIdleMs);
  }

  overview() {
    if(this.map.hidden) return;
    this.thumbnail.getContext('2d').drawImage(this.canvas,0,0,this.thumbnail.width,this.thumbnail.height);
  }
}
