import {clamp,MAX_TEXT_BOX_SIZE,timing} from './model.js';
import {layoutText} from './text-layout.js';

export class PreviewTransform {
  constructor(view,player,actions) {
    this.view=view;
    this.player=player;
    this.actions=actions;
    this.gesture=null;
    this.overlay=document.createElement('div');
    this.overlay.className='transform-box';
    for(const corner of ['nw','ne','sw','se','w','e']) {
      const handle=document.createElement('span');
      handle.className='transform-handle '+corner;
      handle.dataset.corner=corner;
      this.overlay.append(handle);
    }
    this.vertical=document.createElement('div');
    this.horizontal=document.createElement('div');
    this.vertical.className='transform-guide vertical';
    this.horizontal.className='transform-guide horizontal';
    view.viewport.append(this.vertical,this.horizontal,this.overlay);
    view.viewport.addEventListener('pointerdown',event=>this.start(event),true);
    view.viewport.addEventListener('pointermove',event=>this.move(event));
    view.viewport.addEventListener('pointerup',event=>this.end(event));
    view.viewport.addEventListener('pointercancel',event=>this.end(event,true));
    view.viewport.addEventListener('lostpointercapture',event=>this.end(event,true));
    view.viewport.addEventListener('dblclick',event=>{
      if(event.button!==0||event.altKey||view.map.contains(event.target)||view.viewport.classList.contains('showing-asset')) return;
      const hit=this.hitTest(this.point(event));
      if(hit?.clip.kind==='text'&&!hit.track.locked) this.actions.editText(hit.clip.id);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&this.gesture) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.end({pointerId:this.gesture.id},true);
      }
    },true);
  }

  layers() {
    const {project,frame}=this.actions.state();
    return project.tracks.flatMap(track=>track.enabled?track.clips
      .filter(clip=>clip.kind!=='audio'&&frame>=clip.start&&frame<timing(clip)&&clip.opacity>0)
      .map(clip=>({clip,track})):[]);
  }

  bounds(clip) {
    const {project}=this.actions.state();
    let width,height;
    if(clip.kind==='text') {
      const ctx=this.player.context;
      ctx.save();
      ({width,height}=layoutText(ctx,clip));
      ctx.restore();
    } else {
      const asset=project.assets.find(item=>item.id===clip.assetId);
      const media=this.player.source(clip,asset)?.element;
      const w=media?.naturalWidth||media?.videoWidth;
      const h=media?.naturalHeight||media?.videoHeight;
      if(!w||!h) return null;
      const fit=Math.min(project.width/w,project.height/h);
      width=w*fit;
      height=h*fit;
    }
    return {cx:project.width/2+clip.x,cy:project.height/2+clip.y,
      width:width*clip.scale/100,height:height*clip.scale/100};
  }

  point(event) {
    const rect=this.view.canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)/this.view.scale,y:(event.clientY-rect.top)/this.view.scale};
  }

  hitTest(point) {
    return this.layers().find(({clip})=>{
      const box=this.bounds(clip);
      return box&&Math.abs(point.x-box.cx)<=box.width/2&&Math.abs(point.y-box.cy)<=box.height/2;
    });
  }

  start(event) {
    if(this.view.viewport.classList.contains('showing-asset')) return;
    if(event.button!==0||(event.altKey&&!event.target.dataset.corner)||this.view.map.contains(event.target)) return;
    event.preventDefault();
    this.actions.stop();
    const point=this.point(event);
    const {selected}=this.actions.state();
    const corner=event.target.dataset.corner;
    const hit=corner?this.layers().find(item=>item.clip.id===selected):this.hitTest(point);
    this.actions.select(hit?.clip.id??null);
    if(!hit||hit.track.locked) return;
    const {clip}=hit;
    const box=this.bounds(clip);
    this.gesture={id:event.pointerId,clip,start:point,box,corner,
      original:{x:clip.x,y:clip.y,scale:clip.scale,...(corner==='w'||corner==='e'?{textWidth:clip.textWidth}:{})}};
    this.view.viewport.setPointerCapture(event.pointerId);
  }

  move(event) {
    const gesture=this.gesture;
    if(!gesture||gesture.id!==event.pointerId) return;
    const {project}=this.actions.state();
    const point=this.point(event);
    const {clip,original,box,corner}=gesture;
    let snapX=null;
    let snapY=null;
    if(corner==='w'||corner==='e') {
      const direction=corner==='e'?1:-1;
      const factor=original.scale/100;
      const delta=(point.x-gesture.start.x)*direction;
      if(clip.textWidth==null&&Math.abs(delta)*this.view.scale<1) return;
      clip.textWidth=clamp(Math.round((box.width+delta*(event.altKey?2:1))/factor),1,MAX_TEXT_BOX_SIZE);
      clip.x=event.altKey?original.x:clamp(Math.round(original.x+direction*(clip.textWidth*factor-box.width)/2),-3840,3840);
      this.actions.showTextWidth(clip.textWidth);
    } else if(corner) {
      const sx=corner.endsWith('e')?1:-1;
      const sy=corner.startsWith('s')?1:-1;
      const centered=event.altKey;
      const ax=centered?box.cx:box.cx-sx*box.width/2;
      const ay=centered?box.cy:box.cy-sy*box.height/2;
      const ratio=((point.x-ax)*sx*box.width+(point.y-ay)*sy*box.height)/(box.width**2+box.height**2)*(centered?2:1);
      clip.scale=clamp(Math.round(original.scale*ratio),1,400);
      const factor=clip.scale/original.scale;
      clip.x=event.altKey?original.x:clamp(Math.round(ax+sx*box.width*factor/2-project.width/2),-3840,3840);
      clip.y=event.altKey?original.y:clamp(Math.round(ay+sy*box.height*factor/2-project.height/2),-3840,3840);
    } else {
      clip.x=clamp(Math.round(original.x+point.x-gesture.start.x),-3840,3840);
      clip.y=clamp(Math.round(original.y+point.y-gesture.start.y),-3840,3840);
      const threshold=6/this.view.scale;
      if(!event.shiftKey) {
        const snap=(offset,size,frame)=>{
          const candidates=[{offset:0,line:frame/2},{offset:(size-frame)/2,line:0},{offset:(frame-size)/2,line:frame}];
          candidates.sort((a,b)=>Math.abs(a.offset-offset)-Math.abs(b.offset-offset));
          return Math.abs(candidates[0].offset-offset)<=threshold?candidates[0]:null;
        };
        snapX=snap(clip.x,box.width,project.width);
        snapY=snap(clip.y,box.height,project.height);
        if(snapX) clip.x=Math.round(snapX.offset);
        if(snapY) clip.y=Math.round(snapY.offset);
      }
    }
    this.actions.draw();
    this.vertical.hidden=!snapX;
    this.horizontal.hidden=!snapY;
    if(snapX) this.vertical.style.left=(parseFloat(this.view.canvas.style.left)+snapX.line*this.view.scale)+'px';
    if(snapY) this.horizontal.style.top=(parseFloat(this.view.canvas.style.top)+snapY.line*this.view.scale)+'px';
  }

  end(event,canceled=false) {
    const gesture=this.gesture;
    if(!gesture||gesture.id!==event.pointerId) return;
    this.gesture=null;
    const {clip,original}=gesture;
    const values=Object.fromEntries(Object.keys(original).map(key=>[key,clip[key]]));
    for(const [key,value] of Object.entries(original)) {
      if(value===undefined) delete clip[key];
      else clip[key]=value;
    }
    if('textWidth' in original) this.actions.showTextWidth(original.textWidth);
    if(!canceled) this.actions.commit(clip.id,values);
    this.actions.draw();
  }

  render() {
    const {selected,project}=this.actions.state();
    const item=this.layers().find(item=>item.clip.id===selected);
    const box=item&&this.bounds(item.clip);
    this.overlay.hidden=!box;
    this.vertical.hidden=this.horizontal.hidden=true;
    if(!box) return;
    const scale=this.view.scale;
    const left=parseFloat(this.view.canvas.style.left)||0;
    const top=parseFloat(this.view.canvas.style.top)||0;
    Object.assign(this.overlay.style,{left:left+(box.cx-box.width/2)*scale+'px',
      top:top+(box.cy-box.height/2)*scale+'px',width:box.width*scale+'px',height:box.height*scale+'px'});
    this.overlay.classList.toggle('locked',item.track.locked);
    this.overlay.classList.toggle('text-box',item.clip.kind==='text');
    Object.assign(this.vertical.style,{left:left+project.width*scale/2+'px',top:top+'px',height:project.height*scale+'px'});
    Object.assign(this.horizontal.style,{left:left+'px',top:top+project.height*scale/2+'px',width:project.width*scale+'px'});
  }
}
