const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const minimapIdleMs=3000;
const minimumFitRatio=.5;

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
    document.getElementById('preview-fit').onclick=()=>{
      if(viewport.classList.contains('showing-asset')) this.fitAsset();
      else this.fit();
    };
    viewport.addEventListener('wheel',event=>{
      if(viewport.classList.contains('showing-asset')) {
        const media=viewport.querySelector('.asset-preview :is(img,video)');
        if(!media) return;
        event.preventDefault();
        const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
        if(event.ctrlKey||event.metaKey) {
          this.queueZoom(event,unit,media);
        }
        return;
      }
      if(this.map.contains(event.target)) return;
      event.preventDefault();
      const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
      if(event.ctrlKey||event.metaKey) {
        this.queueZoom(event,unit);
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
      if(viewport.classList.contains('showing-asset')) return;
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

  queueZoom(event,unit,media=null) {
    if(this.pendingZoom && this.pendingZoom.media!==media) this.cancelZoom();
    const delta=clamp(-event.deltaY*unit*.0013,-.14,.14);
    this.pendingZoom={
      media,
      delta:clamp((this.pendingZoom?.delta??0)+delta,-.14,.14),
      x:event.clientX,
      y:event.clientY,
    };
    if(this.zoomFrame) return;
    this.zoomFrame=requestAnimationFrame(()=>{
      const {media,delta,x,y}=this.pendingZoom;
      this.pendingZoom=null;
      this.zoomFrame=0;
      const factor=Math.exp(delta);
      if(media) {
        if(!media.isConnected) return;
        this.assetScale=clamp(this.assetScale*factor,minimumFitRatio,8);
        media.style.scale=this.assetScale;
      } else if(!this.viewport.classList.contains('showing-asset')) {
        const rect=this.viewport.getBoundingClientRect();
        this.zoom(this.scale*factor,x-rect.left,y-rect.top);
      }
    });
  }

  cancelZoom() {
    cancelAnimationFrame(this.zoomFrame);
    this.zoomFrame=0;
    this.pendingZoom=null;
  }

  fitScale(w,h) {
    const inset=Math.min(12,w/4,h/4);
    return Math.min((w-2*inset)/this.width,(h-2*inset)/this.height);
  }

  fitAsset() {
    this.cancelZoom();
    this.assetScale=1;
    const media=this.viewport.querySelector('.asset-preview :is(img,video)');
    if(media) media.style.scale='';
  }

  zoom(scale,px=this.viewport.clientWidth/2,py=this.viewport.clientHeight/2) {
    const minimum=this.fitScale(this.viewport.clientWidth,this.viewport.clientHeight)*minimumFitRatio;
    scale=clamp(scale,minimum,Math.max(8,minimum));
    if(scale===this.scale) return;
    const ratio=scale/this.scale;
    this.x=px-this.viewport.clientWidth/2-(px-this.viewport.clientWidth/2-this.x)*ratio;
    this.y=py-this.viewport.clientHeight/2-(py-this.viewport.clientHeight/2-this.y)*ratio;
    this.scale=scale;
    this.auto=false;
    this.layout({revealMinimap:true});
  }

  fit() {
    this.cancelZoom();
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
    const fit=this.fitScale(w,h);
    this.scale=this.auto?fit:Math.max(this.scale,fit*minimumFitRatio);
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
