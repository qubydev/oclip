import {togglePanelsFromShortcut,panelShortcuts} from './layout.js';
import {splitSelection,removeSelection,closeGap,linkedSelection,planTimelineDrag} from './timeline-edits.js';
import {planGroupMove} from './model.js';
import {mediaPreview} from './media-previews.js';
import {renderProjects,projectThumbnail} from './project-home.js';
import {installSelects} from './select.js';
import {confirmAction} from './confirm-dialog.js';

import {FPS,MAX_FRAMES,MAX_TEXT_BOX_SIZE,clamp,applyGroupMove,createClip,createProject,dimensions,duration,editSpan,extractClipAudio,findClip,fittedZoom,id,pasteClipGroups,placeClip,planPlacement,timecode,timelineMetrics,timing,validateProject} from './model.js';
import {icon} from './icons.js';
import {Player,exportFormats,record} from './playback.js';
import {PreviewTransform} from './preview-transform.js';
import {PreviewView} from './preview-view.js';
import {sampleProject} from './sample.js';
import {layoutText} from './text-layout.js';

const $=name=>document.getElementById(name);
const desktop=window.desktop;
if (desktop) document.documentElement.dataset.desktop=desktop.platform;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kindIcon={image:'image',video:'film',audio:'music',text:'text'};
const history=[];
const future=[];
let project=desktop ? createProject() : sampleProject();
let saved=JSON.stringify(project);
let sample=!desktop;
let previewFrame=sample ? FPS*3 : 0;
let selected=null;
let additionalSelection=new Set();
let clipClipboard=[];
let selectedAsset=null;
let panel='canvas';
let tab='media';
let zoom=44;
let pixels=1;
let playing=false;
let playingFrom=0;
let playbackStart=0;
let raf;
let snapping=true;

let drag=null;
let exportJob=null;
let exportPicking=false;
let fileBusy=false;
let noticeTimeout;
let livePropertyEdit;
let canvasDimensionsLinked=false;
let projectFile=null;
let managedProject=false;
let onHome=false;
let checkpointKey='';
let recoveryReady=false;
let saveInFlight=null;
let saveError='';
const player=new Player($('preview'),()=>{if(!playing) draw();});

for(const node of document.querySelectorAll('[data-icon]')) node.innerHTML=icon(node.dataset.icon);
installSelects();

function notify(message) {
  clearTimeout(noticeTimeout);
  $('status').textContent=message;
  if(message) noticeTimeout=setTimeout(()=>notify(''),4000);
}



function rememberEdit() {
  history.push(project);
  if(history.length>100) history.shift();
  future.length=0;
}

function commit(next) {
  next.tracks=next.tracks.filter(track=>track.clips.length);
  if (JSON.stringify(next)===JSON.stringify(project)) return;
  stop();
  rememberEdit();
  project=next;
  previewFrame=clamp(previewFrame,0,duration(project));
  notify('');
  refresh();
}

function update(action) {
  const next=structuredClone(project);
  action(next);
  commit(next);
}

function undo(redo=false) {
  const from=redo?future:history;
  const to=redo?history:future;
  if (!from.length) return;
  stop();
  to.push(project);
  project=from.pop();
  previewFrame=clamp(previewFrame,0,duration(project));
  if (!findClip(project,selected)) selected=null;
  additionalSelection=new Set([...additionalSelection].filter(clipId=>findClip(project,clipId)));
  if(!selected&&additionalSelection.size) {
    [selected]=additionalSelection;
    additionalSelection.delete(selected);
  }
  refresh();
}

const previewView=new PreviewView($('viewport'),$('preview'));
const assetPreview=document.createElement('div');
assetPreview.className='asset-preview';
assetPreview.hidden=true;
$('viewport').append(assetPreview);
const previewTransform=new PreviewTransform(previewView,player,{
  state:()=>({project,frame:previewFrame,selected:assetPreview.hidden?selected:null}),
  select,stop,draw,
  showTextWidth:value=>{
    const input=$('property-textWidth');
    if(input) input.value=value??'';
  },
  editText:clipId=>{
    select(clipId);
    $('properties').closest('.inspector').dispatchEvent(new Event('reveal-properties'));
    $('properties').querySelector('textarea[data-field="text"]')?.focus();
  },
  commit:(clipId,values)=>update(next=>{
    const context=findClip(next,clipId);
    if(context&&!context.track.locked) Object.assign(context.clip,values);
  }),
});
previewView.onLayout=()=>previewTransform.render();
function frameFit() {
  previewView.layout({width:project.width,height:project.height});
}

function draw() {
  player.render(project,Math.min(previewFrame,Math.max(0,duration(project)-1)),playing);
  previewView.overview();
  previewTransform.render();
}

function previewMedia() {
  const media=assetPreview.firstElementChild;
  return media instanceof HTMLMediaElement ? media : null;
}

function refreshTransport() {
  const media=previewMedia();
  const asset=project.assets.find(item=>item.id===selectedAsset);
  const frames=asset ? (media ? asset.frames : 0) : duration(project);
  const active=asset ? Boolean(media&&!media.paused&&!media.ended) : playing;
  $('current-time').textContent=timecode(asset ? Math.floor((media?.currentTime??0)*FPS) : previewFrame);
  $('total-time').textContent=timecode(frames);
  $('play').innerHTML=icon(active?'pause':'play');
  $('play').setAttribute('aria-label',active?'Pause':'Play');
  for(const id of ['play','first','last','back','forward']) $(id).disabled=!frames;
}

function previewAsset(asset) {
  if((asset?.id??null)===selectedAsset) return;
  const previous=assetPreview.firstElementChild;
  if(previous instanceof HTMLMediaElement) previous.pause();
  selectedAsset=asset?.id??null;
  assetPreview.replaceChildren();
  assetPreview.hidden=!asset;
  $('viewport').classList.toggle('showing-asset',Boolean(asset));
  if(asset) {
    previewView.hideMinimap();
    stop();
    const media=document.createElement(asset.kind==='image'?'img':asset.kind);
    media.src=asset.url;
    if(media instanceof HTMLMediaElement) {
      media.preload='metadata';
      media.muted=player.muted;
      for(const name of ['play','pause','ended','timeupdate','loadedmetadata','seeked']) {
        media.addEventListener(name,()=>{if(media===previewMedia()) refreshTransport();});
      }
    } else media.alt=asset.name;
    assetPreview.append(media);
    previewView.fitAsset();
    select(null);
  } else previewTransform.render();
  buttons();
  document.querySelectorAll('[data-asset]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.asset===selectedAsset));
  });
}

document.addEventListener('pointerdown',event=>{
  if(selectedAsset&&!event.target.closest('[data-asset], .asset-preview, .transport, #delete, #item-menu')) {
    previewAsset(null);
  }
},true);

const assetDragType='application/x-oclip-asset';
$('viewport').addEventListener('dragover',event=>{
  if(!event.dataTransfer.types.includes(assetDragType)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect='copy';
});
$('viewport').addEventListener('drop',event=>{
  const asset=project.assets.find(item=>item.id===event.dataTransfer.getData(assetDragType));
  if(!asset?.url) return;
  event.preventDefault();
  previewAsset(null);
  insert(asset);
});

function drawPlayhead() {
  $('current-time').textContent=timecode(previewFrame);
  const position=previewFrame*pixels;
  document.querySelectorAll('.playhead').forEach(node=>node.style.left=position+'px');

}

function seek(frame, scroll=false) {
  previewAsset(null);
  previewFrame=clamp(Math.round(frame),0,duration(project));
  if (playing) {
    playbackStart=performance.now();
    playingFrom=previewFrame;
  }
  drawPlayhead();
  draw();
  buttons();
  if (scroll) {
    const viewport=$('timeline-scroll');
    const x=previewFrame*pixels;
    const usable=viewport.clientWidth-(document.querySelector('.ruler-head')?.offsetWidth||0);
    if (x>viewport.scrollLeft+usable-8) viewport.scrollLeft=x-usable+15;
    else if (x<viewport.scrollLeft) viewport.scrollLeft=x;
  }
}

function stop(redraw=true) {
  if (!playing) return;
  playing=false;
  cancelAnimationFrame(raf);
  $('play').innerHTML=icon('play');
  $('play').setAttribute('aria-label','Play');
  if(redraw) draw();
}

function togglePlay() {
  if(selectedAsset) {
    const media=previewMedia();
    if(!media) return;
    if(media.paused||media.ended) media.play().catch(error=>notify(error.message));
    else media.pause();
    return;
  }
  if (playing) { stop();return; }
  const frames=duration(project);
  if (!frames) return;
  if (previewFrame>=frames) seek(0,true);
  playing=true;
  playingFrom=previewFrame;
  playbackStart=performance.now();
  $('play').innerHTML=icon('pause');
  $('play').setAttribute('aria-label','Pause');
  function tick(now) {
    if (!playing) return;
    const frame=playingFrom+Math.floor((now-playbackStart)*FPS/1000);
    if (frame>=frames) {
      stop(false);
      seek(frames,true);
      return;
    }
    if (frame!==previewFrame) {
      previewFrame=frame;
      drawPlayhead();
      buttons();
      draw();
    }
    raf=requestAnimationFrame(tick);
  }
  draw();
  raf=requestAnimationFrame(tick);
}

let draggedAsset=null;
function clearDrop() {document.querySelector('.drop-target, .new-track-target')?.classList.remove('drop-target','new-track-target');}

function renderLibrary() {
  const grid=$('asset-grid');
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active=button.dataset.tab===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active);
  }
  $('library-title').textContent={media:'Project media',audio:'Project audio',text:'Text layers'}[tab];
  $('import').hidden=tab==='text';
  $('import').lastChild.textContent=tab==='audio'?'Import audio':'Import media';
  $('search-label').hidden=tab==='text';
  if (tab==='text') {
    grid.classList.remove('is-empty');
    grid.innerHTML='<button class="text-preset" id="text-preset">'+icon('text')+' Add text layer</button>';
    $('text-preset').onclick=()=>insert(null);
    return;
  }
  const search=$('asset-search').value.trim().toLowerCase();
  const assets=project.assets.filter(asset=>(tab==='audio')===(asset.kind==='audio'));
  const visible=assets.filter(asset=>asset.name.toLowerCase().includes(search));
  grid.classList.toggle('is-empty',!visible.length&&!search);
  grid.innerHTML=visible.map(asset=>{
    const thumbnail=asset.kind==='image' && asset.url ? '<img src="'+escape(asset.url)+'" alt="">' : asset.kind==='video' && asset.url ? '<video src="'+escape(asset.url)+'#t=0.01" muted preload="metadata" aria-hidden="true"></video>' : icon(kindIcon[asset.kind]);
    return '<button class="asset" draggable="'+Boolean(asset.url)+'" data-asset="'+escape(asset.id)+'" title="'+escape((asset.url?'Preview ':'Locate missing media: ')+asset.name)+'"><span class="asset-thumb '+asset.kind+'">'+thumbnail+'<span class="duration">'+timecode(asset.frames,true)+'</span></span><span class="asset-name">'+escape(asset.name)+'</span></button>';
  }).join('') || (search?'<p class="empty-library">No matching media</p>':'<button class="media-empty" id="media-empty">'+icon('upload')+'<strong>Import your media</strong><span>Choose '+(tab==='audio'?'audio files':'videos or images')+' to start editing</span><span class="empty-action">Browse files</span></button>');
  const empty=$('media-empty');
  if(empty) empty.onclick=importFiles;
  grid.querySelectorAll('[data-asset]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.asset===selectedAsset));
    button.onclick=()=>{
      const asset=project.assets.find(asset=>asset.id===button.dataset.asset);
      if(asset.url) previewAsset(asset);
      else void relinkAsset(asset);
    };
    button.ondragend=()=>{draggedAsset=null;clearDrop();};
    button.ondragstart=event=>{
      draggedAsset=button.dataset.asset;
      event.dataTransfer.setData(assetDragType,button.dataset.asset);
      event.dataTransfer.effectAllowed='copy';
    };
  });
}

function field(label,key,value,attrs='') {
  return '<label class="field"><span>'+label+'</span><input data-field="'+key+'" value="'+escape(value)+'" '+attrs+'></label>';
}

const isTextDimension=key=>key==='textWidth'||key==='textHeight';

function numberField(label,key,value,min,max,disabled=false) {
  return '<div class="field"><label for="property-'+key+'">'+label+'</label>'+
    numberControl(label,key,value,min,max,disabled)+'</div>';
}

function numberControl(label,key,value,min,max,disabled=false) {
  const disabledAttribute=disabled?' disabled':'';
  const auto=isTextDimension(key)?' placeholder="Auto" title="Clear the value to return to Auto"':'';
  return '<div class="number-control"><input aria-label="'+label+'" id="property-'+key+'" data-field="'+key+'" type="number" min="'+min+'" max="'+max+'" step="1" value="'+(value??'')+'"'+auto+disabledAttribute+'>'+
    (disabled?'':'<span class="number-scrub" aria-hidden="true" title="Drag left or right to adjust">'+icon('move-horizontal')+'</span>')+'</div>';
}

function numberValue(input,clipId) {
  if(Number.isFinite(input.valueAsNumber)) return input.valueAsNumber;
  const key=input.dataset.field;
  const clip=isTextDimension(key)?findClip(project,clipId)?.clip:null;
  if(!clip) return Number(input.min);
  const ctx=player.context;
  ctx.save();
  const {width,height}=layoutText(ctx,clip);
  ctx.restore();
  return clamp(Math.round(key==='textWidth'?width:height),Number(input.min),Number(input.max));
}

function applyProperty(next,clipId,key,value,reference=next) {
  if(!clipId) {
    if(canvasDimensionsLinked&&(key==='width'||key==='height')) {
      const other=key==='width'?'height':'width';
      const ratio=reference[other]/reference[key];
      value=clamp(value,Math.max(64,Math.ceil(64/ratio)),Math.min(3840,Math.floor(3840/ratio)));
      next[other]=Math.round(value*ratio);
    }
    next[key]=value;
    return next[key];
  }
  const context=findClip(next,clipId);
  if(!context||context.track.locked) return;
  const {clip,track,asset}=context;
  if(key==='length') Object.assign(clip,editSpan(track,clip,'right',clip.start+value,asset));
  else if(key==='start') Object.assign(clip,editSpan(track,clip,'move',value,asset));
  else if(isTextDimension(key)&&value==null) delete clip[key];
  else clip[key]=value;
  return clip[key];
}

function renderInspector() {
  livePropertyEdit=undefined;
  const context=findClip(project,selected);
  const isCanvas=panel==='canvas'||!context;
  $('canvas-tab').classList.toggle('active',isCanvas);
  $('clip-tab').classList.toggle('active',!isCanvas);
  $('canvas-tab').setAttribute('aria-pressed',isCanvas);
  $('clip-tab').setAttribute('aria-pressed',!isCanvas);
  $('clip-tab').disabled=!context;
  const properties=$('properties');
  const clipId=isCanvas?null:selected;
  if (isCanvas) {
    const preset=dimensions.find(([w,h])=>project.width===w&&project.height===h);
    properties.innerHTML='<section class="property-section"><h3>Frame</h3><label class="field"><span>Aspect ratio</span><select id="aspect">'+dimensions.map(([w,h,name])=>'<option value="'+w+'x'+h+'" '+(preset?.[0]===w&&preset?.[1]===h?'selected':'')+'>'+name+'</option>').join('')+'<option value="custom" '+(!preset?'selected':'')+'>Custom</option></select></label>'+
      '<div class="canvas-dimensions" role="group" aria-label="Dimension"><span>Dimension</span><div class="canvas-dimension-inputs">'+
      numberControl('Width','width',project.width,64,3840)+
      '<button id="link-canvas-dimensions" type="button" class="icon-button" aria-label="Link canvas width and height" aria-pressed="'+canvasDimensionsLinked+'" title="Link canvas width and height">'+icon('link')+'</button>'+
      numberControl('Height','height',project.height,64,3840)+'</div></div>'+
      '<div class="field"><span>Frame rate</span><span>30 fps</span></div></section><section class="property-section"><h3>Background</h3>'+
      field('Base color','color',project.color,'type="color"')+'</section>';
    $('link-canvas-dimensions').onclick=event=>{
      canvasDimensionsLinked=!canvasDimensionsLinked;
      event.currentTarget.setAttribute('aria-pressed',String(canvasDimensionsLinked));
    };
    $('aspect').onchange=event=>{
      if(event.target.value==='custom') {properties.querySelector('[data-field=width]').focus();return;}
      const [width,height]=event.target.value.split('x').map(Number);
      update(next=>Object.assign(next,{width,height}));
    };
  } else {
    const {clip,track}=context;
    const locked=track.locked;
    const n=(label,key,value,min,max)=>numberField(label,key,value,min,max,locked);
    const selectedAudio=[selected,...additionalSelection].map(id=>findClip(project,id)).filter(canMuteClip);
    const muted=selectedAudio.length>0&&selectedAudio.every(item=>item.clip.muted===true);
    const audio=clip.kind==='audio'||clip.kind==='video'
      ? '<section class="property-section"><h3>Audio</h3><div class="field"><span>Mute clip</span>'+
        '<button type="button" class="icon-button inspector-mute" id="inspector-mute-clip" aria-label="Mute clip" aria-pressed="'+muted+'" title="'+
        (muted?'Unmute clip':'Mute clip')+'" '+(locked?'disabled':'')+'>'+icon(muted?'mute':'volume')+'</button></div>'+
        n('Volume %','volume',clip.volume,0,100)+'</section>'
      : '';
    const transform=clip.kind==='audio'?'':'<section class="property-section"><h3>Transform</h3>'+
      n('Position X','x',clip.x,-3840,3840)+n('Position Y','y',clip.y,-3840,3840)+
      n('Scale %','scale',clip.scale,1,400)+n('Opacity %','opacity',clip.opacity,0,100)+'</section>';
    const text=clip.kind==='text'?'<section class="property-section"><h3>Text</h3>'+
      '<textarea data-field="text" aria-label="Text content" maxlength="500" '+(locked?'disabled':'')+'>'+escape(clip.text)+'</textarea>'+
      n('Font size','fontSize',clip.fontSize,8,500)+field('Color','color',clip.color,'type="color" '+(locked?'disabled':''))+
      n('Box width','textWidth',clip.textWidth,1,MAX_TEXT_BOX_SIZE)+n('Box height','textHeight',clip.textHeight,1,MAX_TEXT_BOX_SIZE)+'</section>':'';
    properties.innerHTML='<section class="property-section"><h3 class="name-line">'+icon(kindIcon[clip.kind])+' '+escape(additionalSelection.size?(additionalSelection.size+1)+' clips selected':clip.name)+'</h3>'+
      (locked?'<p class="locked-note">Track is locked</p>':'')+'</section>'+
      text+audio+transform+'<section class="property-section"><h3>Timing</h3>'+
      n('Start frame','start',clip.start,0,MAX_FRAMES-1)+n('Duration (fr)','length',clip.length,1,MAX_FRAMES)+'</section>'+
      '<section class="property-section"><h3>Fades</h3>'+n('Fade in (fr)','fadeIn',clip.fadeIn??0,0,MAX_FRAMES)+
      n('Fade out (fr)','fadeOut',clip.fadeOut??0,0,MAX_FRAMES)+'</section>';
    const muteButton=$('inspector-mute-clip');
    if(muteButton) muteButton.onclick=()=>{
      toggleClipMute(clipId);
      $('inspector-mute-clip')?.focus({preventScroll:true});
    };
  }
  properties.onpointerdown=event=>startNumberScrub(event,properties,clipId);
  properties.onkeydown=event=>{
    const input=event.target;
    if(input.matches('input[type="number"]')&&(event.key==='ArrowUp'||event.key==='ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      if(input.disabled||input.readOnly) return;
      const key=input.dataset.field;
      const current=numberValue(input,clipId);
      const direction=event.key==='ArrowUp'?1:-1;
      const value=clamp(current+direction*(event.shiftKey?10:1),Number(input.min),Number(input.max));
      if(value===input.valueAsNumber) return;
      const scrollTop=properties.scrollTop;
      input.value=value;
      if(key==='fontSize') input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      properties.querySelector('[data-field="'+key+'"]')?.focus({preventScroll:true});
      properties.scrollTop=scrollTop;
      return;
    }
    if(event.key==='Enter'&&event.target.matches('input')) {
      event.preventDefault();
      event.target.blur();
    }
  };
  properties.oninput=event=>{
    const input=event.target;
    if(!input.matches('[data-field="color"], textarea[data-field="text"], [data-field="fontSize"]')||input.disabled) return;
    const key=input.dataset.field;
    const value=key==='fontSize'?input.valueAsNumber:input.value;
    if(key==='fontSize'&&(!Number.isInteger(value)||value<Number(input.min)||value>Number(input.max))) return;
    if(livePropertyEdit?.input!==input||livePropertyEdit.project!==project) {
      const next=structuredClone(project);
      const target=clipId?findClip(next,clipId)?.clip:next;
      if(!target||target[key]===value) return;
      rememberEdit();
      project=next;
      livePropertyEdit={input,project,target};
      buttons();
    }
    livePropertyEdit.target[key]=value;
    draw();
  };
  properties.onchange=event=>{
    const input=event.target;
    const key=input.dataset.field;
    if(!key) return;
    if(livePropertyEdit?.input===input&&livePropertyEdit.project===project) {
      if(key==='fontSize') input.value=livePropertyEdit.target.fontSize;
      livePropertyEdit=undefined;
      return;
    }
    if(key==='text') return;
    if(isTextDimension(key)&&input.value===''&&!input.validity.badInput) {
      update(next=>applyProperty(next,clipId,key,null));
      return;
    }
    if(input.type==='number' && input.value==='') {renderInspector();return;}
    const value=input.type==='number'?clamp(Math.round(input.valueAsNumber),Number(input.min),Number(input.max)):input.value;
    if(input.type==='number'&&!Number.isFinite(value)) {renderInspector();return;}
    update(next=>applyProperty(next,clipId,key,value));
    if(input.isConnected) {
      renderInspector();
      if(input.type==='color') draw();
    }
  };
}

function startNumberScrub(event,properties,clipId) {
  if(event.button!==0||!event.isPrimary||!event.target.closest('.number-scrub')) return;
  event.preventDefault();
  const key=event.target.closest('.number-control').querySelector('input').dataset.field;
  if(properties.contains(document.activeElement)) document.activeElement.blur();
  const input=properties.querySelector('input[data-field="'+key+'"]');
  if(!input||input.disabled) return;
  const control=input.closest('.number-control');
  const initial=numberValue(input,clipId);
  const original=project;
  const draft=structuredClone(original);
  const pointerId=event.pointerId;
  const changesFrame=!clipId;
  const changesTiming=key==='start'||key==='length';
  const min=Number(input.min);
  const max=Number(input.max);
  let lastX=event.clientX;
  let position=initial;
  let requested=initial;
  let locked=false;
  let finished=false;
  stop();
  properties.setPointerCapture(pointerId);
  control.classList.add('scrubbing');
  document.body.classList.add('scrubbing-number');
  properties.addEventListener('pointermove',move);
  properties.addEventListener('pointerup',end);
  properties.addEventListener('pointercancel',end);
  properties.addEventListener('lostpointercapture',end);
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('pointerlockchange',onLockChange);
  document.addEventListener('mousemove',onLockedMove);
  document.addEventListener('mouseup',onMouseUp,true);
  window.addEventListener('blur',cancel);
  if(event.pointerType==='mouse'&&!document.pointerLockElement&&properties.requestPointerLock) {
    properties.requestPointerLock()?.then(()=>{
      if(finished&&document.pointerLockElement===properties) document.exitPointerLock();
    }).catch(()=>{});
  }

  function move(event) {
    if(event.pointerId!==pointerId||document.pointerLockElement===properties) return;
    const delta=event.clientX-lastX;
    lastX=event.clientX;
    adjust(delta);
  }

  function onLockedMove(event) {
    if(document.pointerLockElement===properties) adjust(event.movementX);
  }

  function onLockChange() {
    if(document.pointerLockElement===properties) locked=true;
    else if(locked) cancel();
  }

  function onMouseUp(event) {
    if(event.button===0&&document.pointerLockElement===properties) end({pointerId,type:'pointerup'});
  }

  function adjust(delta) {
    position=clamp(position+delta/2,min,max);
    const value=Math.round(position);
    if(value===requested) return;
    requested=value;
    project=draft;
    input.value=applyProperty(draft,clipId,key,value,original);
    if(changesFrame&&canvasDimensionsLinked&&(key==='width'||key==='height')) {
      const other=key==='width'?'height':'width';
      properties.querySelector('[data-field="'+other+'"]').value=draft[other];
    }
    if(changesFrame) frameFit();
    if(changesTiming) {
      renderTimeline();
      drawPlayhead();
    }
    draw();
  }

  function onKey(event) {
    if(event.key!=='Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  }

  function cancel() {
    end({pointerId,type:'pointercancel'});
  }

  function end(event) {
    if(event.pointerId!==pointerId||finished) return;
    if(event.type==='lostpointercapture'&&document.pointerLockElement===properties) return;
    finished=true;
    properties.removeEventListener('pointermove',move);
    properties.removeEventListener('pointerup',end);
    properties.removeEventListener('pointercancel',end);
    properties.removeEventListener('lostpointercapture',end);
    document.removeEventListener('keydown',onKey,true);
    document.removeEventListener('pointerlockchange',onLockChange);
    document.removeEventListener('mousemove',onLockedMove);
    document.removeEventListener('mouseup',onMouseUp,true);
    window.removeEventListener('blur',cancel);
    if(document.pointerLockElement===properties) document.exitPointerLock();
    if(properties.hasPointerCapture(pointerId)) properties.releasePointerCapture(pointerId);
    control.classList.remove('scrubbing');
    document.body.classList.remove('scrubbing-number');
    if(project!==draft) return;
    project=original;
    const scrollTop=properties.scrollTop;
    if(event.type==='pointerup') commit(draft);
    if(project===original) refresh();
    properties.scrollTop=scrollTop;
  }
}

function timelineScale() {
  const viewport=$('timeline-scroll');
  const head=Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--track-head'));
  const available=Math.max(1,viewport.clientWidth-head);
  return timelineMetrics(available,duration(project),zoom);
}

function patchTimeline(grid,markup) {
  const template=document.createElement('template');
  template.innerHTML=markup;
  const key=node=>{
    if(node.dataset.trackHead) return 'head:'+node.dataset.trackHead;
    if(node.dataset.track) return 'lane:'+node.dataset.track;
    if(node.dataset.clip) return 'clip:'+node.dataset.clip;
    return node.className.split(' ')[0];
  };
  const reconcile=(parent,source)=>{
    const existing=new Map([...parent.children].map(node=>[key(node),node]));
    let anchor=parent.firstElementChild;
    for(const incoming of [...source.children]) {
      const id=key(incoming);
      const current=existing.get(id);
      existing.delete(id);
      let node=current;
      if(current?.dataset.clip) {
        const preview=current.querySelector('[data-preview-asset]');
        const replacement=incoming.querySelector('[data-preview-asset]');
        if(preview&&replacement&&preview.dataset.previewSource===replacement.dataset.previewSource) {
          replacement.style.backgroundImage=preview.style.backgroundImage;
        }
      }
      if(current?.matches('.track-lane')&&incoming.matches('.track-lane')) reconcile(current,incoming);
      else if(!current||current.outerHTML!==incoming.outerHTML) {
        node=incoming;
        if(current===anchor) anchor=current.nextElementSibling;
        if(current) current.replaceWith(node);
      }
      if(node!==anchor) parent.insertBefore(node,anchor);
      anchor=node.nextElementSibling;
    }
    for(const node of existing.values()) node.remove();
  };
  reconcile(grid,template.content);
}

function renderTimeline() {
  const metrics=timelineScale();
  pixels=metrics.pixels;
  const {width}=metrics;
  const major=[1,2,5,10,15,30,60,120,300,600,1800].find(seconds=>seconds*FPS*pixels>=73)||3600;
  const step=major*FPS*pixels;
  const ratio=window.devicePixelRatio||1;
  const ticks=Array.from({length:Math.floor(width/step)+1},(_,i)=>{
    const position=Math.round(i*step*ratio)/ratio;
    return '<span class="tick" style="left:'+position+'px">'+timecode(i*major*FPS,true)+'</span>';
  }).join('');
  const grid=$('timeline-grid');
  grid.style.gridTemplateRows='var(--ruler) '+'49px '.repeat(project.tracks.length)+'minmax(49px, 1fr)';
  grid.style.setProperty('--time-width',width+'px');
  grid.style.setProperty('--tick',step+'px');
  grid.style.setProperty('--minor',step/5+'px');
  const markup='<div class="ruler-head">'+icon('timeline')+' 00:00:00:00</div><div class="ruler">'+ticks+'<i class="playhead"><i class="playhead-cap"></i></i></div>'+
    project.tracks.map(track=>'<div class="track-head" data-track-head="'+escape(track.id)+'"><div class="track-grip" draggable="true" title="Drag to reorder track"><span class="track-icon-slot" aria-hidden="true"><span class="track-kind-icon">'+icon(track.icon)+'</span><span class="track-reorder-icon">⠿</span></span><span class="track-label">'+escape(track.name)+'</span></div>'+
      '<button data-toggle="'+escape(track.id)+'" aria-label="'+(track.kind==='audio'?'Mute audio track':'Hide '+track.name)+'" aria-pressed="'+!track.enabled+'">'+icon(track.kind==='audio'?(track.enabled?'volume':'mute'):(track.enabled?'eye':'hidden'))+'</button>'+
      (track.kind==='video'?'<button data-track-mute="'+escape(track.id)+'" aria-label="Mute '+escape(track.name)+' audio" aria-pressed="'+(track.muted===true)+'">'+icon(track.muted?'mute':'volume')+'</button>':'')+
      '<button data-lock="'+escape(track.id)+'" aria-label="Lock '+escape(track.name)+'" aria-pressed="'+track.locked+'">'+icon(track.locked?'lock':'unlock')+'</button></div>'+
      '<div class="track-lane" data-track="'+escape(track.id)+'">'+track.clips.map(clip=>clipHTML(clip,track)).join('')+'<i class="playhead"></i></div>').join('')+
    '<div class="track-head track-gutter" aria-hidden="true"></div>'+
    '<div class="track-drop-space" data-new-track>'+(project.tracks.length?'':'Drop media here')+'<i class="playhead"></i></div>';
  const focused=document.activeElement?.closest('[data-clip]')?.dataset.clip;
  patchTimeline(grid,markup);
  if(focused&&document.activeElement===document.body) {
    grid.querySelector('[data-clip="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
  }
  drawPlayhead();
  const assets=new Map(project.assets.map(asset=>[asset.id,asset]));
  for(const node of grid.querySelectorAll('[data-preview-asset]')) {
    const asset=assets.get(node.dataset.previewAsset);
    if(!asset?.url) continue;
    void mediaPreview(asset).then(url=>{
      if(url&&node.isConnected) node.style.backgroundImage='url("'+url+'")';
    });
  }
}

function clipHTML(clip,track) {
  const asset=project.assets.find(asset=>asset.id===clip.assetId);
  const audio=clip.kind==='audio';
  const waveformStyle=audio&&asset?' style="background-size:'+(asset.frames/clip.length*100)+'% 100%;background-position:'+
    (clip.in/Math.max(1,asset.frames-clip.length)*100)+'% 50%"':'';
  const film=clip.kind==='image' && asset?.url ? '<span class="filmstrip" style="background-image:url(&quot;'+escape(asset.url)+'&quot;)"></span>':
    asset?.url&&['video','audio'].includes(clip.kind)?'<span class="filmstrip '+(audio?'waveform':'')+'" data-preview-asset="'+escape(asset.id)+
    '" data-preview-source="'+escape(asset.url)+'"'+waveformStyle+'></span>':'';
  const active=isClipSelected(clip.id);
  return '<div class="clip '+clip.kind+(active?' selected':'')+(track.locked?' locked':'')+(!track.enabled?' inactive':'')+'" data-clip="'+escape(clip.id)+'" tabindex="0" role="button" aria-label="'+escape(clip.name+', '+timecode(clip.start)+' to '+timecode(timing(clip)))+'" aria-pressed="'+active+'" style="left:'+clip.start*pixels+'px;width:'+Math.max(2,clip.length*pixels)+'px" title="'+escape(clip.name)+'"><span class="clip-name">'+icon(kindIcon[clip.kind])+'<span>'+escape(clip.name)+'</span></span>'+film+
    (track.locked?'':'<span class="trim left" data-mode="left"></span><span class="trim right" data-mode="right"></span>')+'</div>';
}

function canMuteClip(context) {
  return context&&!context.track.locked&&(context.clip.kind==='audio'||context.clip.kind==='video');
}

function toggleClipMute(clipId) {
  const ids=isClipSelected(clipId)?[selected,...additionalSelection]:[clipId];
  const contexts=ids.map(id=>findClip(project,id)).filter(canMuteClip);
  const muted=!contexts.every(context=>context.clip.muted===true);
  update(next=>{
    for(const context of contexts) findClip(next,context.clip.id).clip.muted=muted;
  });
}

function buttons() {
  const context=findClip(project,selected);
  $('undo').disabled=!history.length;
  $('redo').disabled=!future.length;
  const editableClip=context&&!context.track.locked;
  $('delete').disabled=!selectedAsset&&!editableClip&&![...additionalSelection].some(id=>findClip(project,id)?.track.locked===false);
  $('delete').setAttribute('aria-label',selectedAsset?'Remove media':'Delete layer');
  $('split').disabled=![selected,...additionalSelection].some(id=>{
    const item=findClip(project,id);
    return item&&!item.track.locked&&previewFrame>item.clip.start&&previewFrame<timing(item.clip);
  });
  const muteButton=$('mute-clip');
  const audioSelection=[selected,...additionalSelection].map(id=>findClip(project,id)).filter(canMuteClip);
  const muted=audioSelection.length>0&&audioSelection.every(item=>item.clip.muted===true);
  muteButton.disabled=!audioSelection.length;
  muteButton.setAttribute('aria-pressed',String(muted));
  muteButton.title=muted?'Unmute clip':'Mute clip';
  const muteIcon=muted?'mute':'volume';
  if(muteButton.dataset.icon!==muteIcon) {
    muteButton.dataset.icon=muteIcon;
    muteButton.innerHTML=icon(muteIcon);
  }
  $('export').disabled=!duration(project)||!!exportJob;
  $('export').title=duration(project)?'Export video':'Add a layer to the timeline to export';
  refreshTransport();
}

function refresh() {
  if(selectedAsset&&!project.assets.some(asset=>asset.id===selectedAsset)) previewAsset(null);
  $('project-name').value=project.name;
  const frames=duration(project);
  $('empty-preview').hidden=frames>0;
  $('total-time').textContent=timecode(frames);

  renderLibrary();
  renderInspector();
  renderTimeline();
  player.reconcile(project);
  frameFit();
  draw();
  buttons();
}

function isClipSelected(clipId) {
  return selected===clipId||additionalSelection.has(clipId);
}

function select(clipId,others=[]) {
  selected=clipId;
  additionalSelection=new Set(others);
  previewTransform.render();
  panel=clipId?'clip':'canvas';
  document.querySelectorAll('[data-clip]').forEach(node=>{
    const active=isClipSelected(node.dataset.clip);
    node.classList.toggle('selected',active);
    node.setAttribute('aria-pressed',active);
  });
  renderInspector();
  buttons();
}

function insert(asset, position=previewFrame, trackId=null, appendTrack=false) {
  previewAsset(null);
  const target=project.tracks.find(track=>track.id===trackId);
  const clip=createClip(asset,position);
  const placement=planPlacement(project.tracks,clip,position,target);
  if(!placement) {notify('This track is locked.');return;}
  if(!asset||appendTrack) {
    placement.track=null;
    placement.newIndex=asset?project.tracks.length:0;
  }
  selected=clip.id;
  additionalSelection.clear();
  panel='clip';
  update(next=>placeClip(next,placement));
  seek(placement.edit.start,true);
  buttons();
}

function split() {
  const next=structuredClone(project);
  const ids=linkedSelection(project,[selected,...additionalSelection].filter(Boolean));
  if(ids.some(id=>{
    const context=findClip(project,id);
    return context?.track.locked&&previewFrame>context.clip.start&&previewFrame<timing(context.clip)&&
      linkedSelection(project,[id]).length>1;
  })) {
    notify('Unlock linked tracks or unlink the audio before splitting.');
    return;
  }
  const result=splitSelection(next,ids,previewFrame);
  selected=result[0]??null;
  additionalSelection=new Set(result.slice(1));
  commit(next);
}

function remove(ripple=false) {
  if(selectedAsset) {
    if(!ripple) void removeAsset(selectedAsset);
    return;
  }
  const ids=[selected,...additionalSelection].filter(clipId=>findClip(project,clipId)?.track.locked===false);
  if(!ids.length) return;
  const removed=new Set(ids);
  const remaining=[selected,...additionalSelection].filter(clipId=>clipId&&!removed.has(clipId));
  select(remaining[0]??null,remaining.slice(1));
  update(next=>removeSelection(next,ids,ripple));
}

function copyClips() {
  clipClipboard=structuredClone(project.tracks.flatMap(track=>{
    const clips=track.clips.filter(clip=>isClipSelected(clip.id));
    return clips.length?[{trackId:track.id,kind:track.kind,clips}]:[];
  }));
  const count=clipClipboard.reduce((total,group)=>total+group.clips.length,0);
  if(count) notify(count===1?'Clip copied':count+' clips copied');
}

function pasteClips() {
  const clips=clipClipboard.flatMap(group=>group.clips);
  if(clips.some(clip=>clip.assetId&&!project.assets.some(asset=>asset.id===clip.assetId))) {
    notify('A copied clip’s source media was removed.');
    return;
  }
  const next=structuredClone(project);
  const pasted=pasteClipGroups(next,clipClipboard,previewFrame);
  if(!pasted.length) {
    notify('The copied clips extend past the timeline limit.');
    return;
  }
  selected=pasted[0].id;
  additionalSelection=new Set(pasted.slice(1).map(clip=>clip.id));
  panel='clip';
  commit(next);
  grid.focus({preventScroll:true});
}

async function removeAsset(assetId) {
  const asset=project.assets.find(item=>item.id===assetId);
  if(!asset||$('confirm-dialog').open) return;
  const usedTracks=project.tracks.filter(track=>track.clips.some(clip=>clip.assetId===assetId));
  if(usedTracks.some(track=>track.locked)) {
    notify('Unlock the tracks using this media before removing it.');
    return;
  }
  const clipCount=usedTracks.reduce((count,track)=>count+track.clips.filter(clip=>clip.assetId===assetId).length,0);
  if(clipCount) {
    stop();
    const media=previewMedia();
    media?.pause();
    const current=project;
    const decision=await confirmAction({title:'Remove media?',description:'Removing '+asset.name+' also removes '+clipCount+
      (clipCount===1?' clip from the timeline.':' clips from the timeline.'),action:'Remove media'});
    if(decision!=='confirm'||project!==current) return;
  }
  if(selectedAsset===assetId) previewAsset(null);
  update(next=>{
    next.assets=next.assets.filter(item=>item.id!==assetId);
    for(const track of next.tracks) track.clips=track.clips.filter(clip=>clip.assetId!==assetId);
  });
}

const itemMenu=$('item-menu');
let menuInvoker;
const pendingAudioExtractions=new Set();

function videoHasAudio(url) {
  return new Promise((resolve,reject)=>{
    const video=document.createElement('video');
    const timeout=setTimeout(()=>done(Error('Could not read the video audio tracks.')),10000);
    function done(error,hasAudio) {
      clearTimeout(timeout);
      video.onloadeddata=video.onerror=null;
      video.removeAttribute('src');
      video.load();
      if(error) reject(error);
      else resolve(hasAudio);
    }
    video.preload='auto';
    video.onerror=()=>done(Error('Could not load the source video.'));
    video.onloadeddata=()=>{
      try {
        if(video.audioTracks) {
          done(null,video.audioTracks.length>0);
          return;
        }
        const stream=video.captureStream?.()??video.mozCaptureStream?.();
        if(!stream) throw Error('Audio track detection is unavailable in this browser.');
        const hasAudio=stream.getAudioTracks().length>0;
        stream.getTracks().forEach(track=>track.stop());
        done(null,hasAudio);
      } catch(error) {done(error);}
    };
    video.src=url;
  });
}

async function extractAudio(clipId,asset) {
  pendingAudioExtractions.add(clipId);
  const epoch=assetEpoch;
  try {
    const hasAudio=await videoHasAudio(asset.url);
    if(epoch!==assetEpoch||findClip(project,clipId)?.asset?.url!==asset.url) return;
    if(!hasAudio) {notify('This video has no audio track.');return;}
    const next=structuredClone(project);
    const audioClip=extractClipAudio(next,clipId);
    if(!audioClip) return;
    if(selected===clipId) {
      selected=audioClip.id;
      additionalSelection.clear();
    }
    commit(next);
    notify('Audio extracted and video clip muted.');
  } catch(error) {
    if(epoch===assetEpoch) notify(error.message);
  } finally {
    pendingAudioExtractions.delete(clipId);
  }
}

document.addEventListener('contextmenu',event=>{
  const node=event.target.closest('[data-asset], [data-clip]');
  if(!node) return;
  event.preventDefault();
  if(itemMenu.matches(':popover-open')) itemMenu.hidePopover();
  let actions;
  if(node.dataset.asset) {
    const asset=project.assets.find(item=>item.id===node.dataset.asset);
    if(!asset) return;
    previewAsset(asset);
    actions=[
      {label:'Add at playhead',symbol:'plus',run:()=>insert(asset),disabled:!asset.url},
      {label:'Remove media',symbol:'trash',run:()=>remove(),danger:true},
    ];
    if(!asset.url&&desktop) actions.unshift(
      {label:'Locate missing media',symbol:'folder',run:()=>relinkAsset(asset)},
      {label:'Find missing media in folder',symbol:'folder',run:relinkFolder},
    );
  } else {
    const context=findClip(project,node.dataset.clip);
    if(!context) return;
    previewAsset(null);
    if(!isClipSelected(context.clip.id)) select(context.clip.id);
    const {clip,track,asset}=context;
    actions=[
      {label:'Go to clip start',symbol:'first',run:()=>{stop();seek(clip.start,true);}},
      {label:'Go to clip end',symbol:'last',run:()=>{stop();seek(timing(clip),true);}},
      {label:'Split at playhead',symbol:'split',run:split,disabled:$('split').disabled},
      {label:'Delete selection',symbol:'trash',run:()=>remove(),disabled:$('delete').disabled,danger:true},
      {label:'Ripple delete selection',symbol:'trash',run:()=>remove(true),disabled:$('delete').disabled,danger:true},
      {label:'Close gap before clip',symbol:'first',run:()=>{
        const next=structuredClone(project);
        if(closeGap(next,clip.id)) commit(next);
        else notify('Cannot close the gap without overlapping or moving locked clips.');
      },disabled:track.locked||!clip.start},
    ];
    const linkedAudio=project.tracks.flatMap(item=>item.clips).filter(item=>item.audioFor===clip.id||item.id===clip.id&&item.audioFor);
    if(linkedAudio.length) actions.splice(2,0,{
      label:'Unlink audio',symbol:'music',disabled:track.locked||linkedAudio.some(item=>findClip(project,item.id).track.locked),
      run:()=>update(next=>{for(const item of linkedAudio) delete findClip(next,item.id).clip.audioFor;}),
    });
    if(clip.kind==='video') {
      actions.splice(-1,0,{
        label:'Extract audio',symbol:'music',run:()=>extractAudio(clip.id,asset),
        disabled:track.locked||!asset?.url||pendingAudioExtractions.has(clip.id),
      });
    }
  }
  menuInvoker=node;
  itemMenu.replaceChildren(...actions.map(({label,symbol,run,disabled,danger})=>{
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('role','menuitem');
    button.disabled=Boolean(disabled);
    button.classList.toggle('danger',Boolean(danger));
    button.innerHTML=icon(symbol);
    button.append(label);
    button.onclick=()=>{
      itemMenu.hidePopover();
      menuInvoker.focus({preventScroll:true});
      run();
    };
    return button;
  }));
  const rect=node.getBoundingClientRect();
  const atPointer=event.clientX!==0||event.clientY!==0;
  itemMenu.style.left='0px';
  itemMenu.style.top='0px';
  itemMenu.showPopover();
  itemMenu.style.left=clamp(atPointer?event.clientX:rect.left,4,Math.max(4,innerWidth-itemMenu.offsetWidth-4))+'px';
  itemMenu.style.top=clamp(atPointer?event.clientY:rect.bottom,4,Math.max(4,innerHeight-itemMenu.offsetHeight-4))+'px';
  itemMenu.querySelector('button:enabled')?.focus({preventScroll:true});
});
itemMenu.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'||event.key==='Tab') {
    event.preventDefault();
    itemMenu.hidePopover();
    menuInvoker.focus({preventScroll:true});
    return;
  }
  const items=[...itemMenu.querySelectorAll('button:enabled')];
  const index=items.indexOf(document.activeElement);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End') {
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:
      (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus({preventScroll:true});
  }
});

function mediaFrames(asset) {
  if(asset.kind==='image') {
    const image=new Image();
    image.src=asset.url;
    return image.decode().then(()=>FPS*5);
  }
  return new Promise((resolve,reject)=>{
    const media=document.createElement(asset.kind);
    const timeout=setTimeout(()=>done(Error('Media metadata timed out.')),10000);
    function done(error) {
      clearTimeout(timeout);
      media.onloadedmetadata=media.onerror=null;
      const frames=Math.floor(media.duration*FPS+1e-6);
      media.removeAttribute('src');
      media.load();
      if(error||!Number.isFinite(frames)||frames<1) reject(error||Error('Invalid media duration.'));
      else resolve(clamp(frames,1,MAX_FRAMES));
    }
    media.preload='metadata';
    media.onloadedmetadata=()=>done();
    media.onerror=()=>done(Error('Unsupported media codec.'));
    media.src=asset.url;
  });
}

async function addAssets(inputs, epoch=assetEpoch) {
  const results=await Promise.allSettled(inputs.map(async asset=>{
    if(asset.error) throw Error(asset.error);
    return {...asset,id:id(),frames:await mediaFrames(asset)};
  }));
  if(assetEpoch!==epoch) return;
  const assets=results.filter(item=>item.status==='fulfilled').map(item=>item.value);
  if(assets.length) {
    if(tab!=='text') tab=assets.every(asset=>asset.kind==='audio')?'audio':'media';
    update(next=>next.assets.push(...assets));
  }
  const failed=results.length-assets.length;
  if(failed) notify(failed+' file'+(failed===1?'':'s')+' could not be imported. Check the media format and codec.');
  else if(assets.length) notify(assets.length+' '+(assets.length===1?'file':'files')+' imported');
}

async function relinkAsset(asset) {
  if(!desktop||fileBusy) return;
  fileBusy=true;
  try {
    const replacement=await desktop.relink(asset.name);
    if(!replacement) return;
    const media=await checkReplacement(asset,replacement);
    previewAsset(null);
    if(!project.assets.some(item=>item.id===asset.id)) return;
    update(next=>Object.assign(next.assets.find(item=>item.id===asset.id),media));
    notify('Media relinked');
  } catch(error) {notify(error.message);}
  finally {fileBusy=false;}
}

async function checkReplacement(asset,replacement) {
  const extracted=asset.kind==='audio'&&replacement.kind==='video'&&/ \(audio\)$/.test(asset.name);
  if(asset.kind!==replacement.kind&&!extracted) throw Error('Choose a matching media type.');
  const frames=await mediaFrames(replacement);
  const required=project.tracks.flatMap(track=>track.clips).reduce((max,clip)=>
    clip.assetId===asset.id&&asset.kind!=='image'?Math.max(max,clip.in+clip.length):max,0);
  if(frames<required) throw Error('The replacement is shorter than the clips that use it.');
  return {path:replacement.path,url:replacement.url,frames};
}

async function relinkFolder() {
  if(!desktop||fileBusy) return;
  fileBusy=true;
  try {
    const missing=project.assets.filter(asset=>!asset.url);
    const matches=await desktop.relinkFolder(missing.map(asset=>({id:asset.id,file:asset.path??asset.name})));
    if(!matches) return;
    const found=new Map();
    for(const {id,replacement} of matches) {
      try {found.set(id,await checkReplacement(missing.find(asset=>asset.id===id),replacement));} catch {}
    }
    if(found.size) {
      previewAsset(null);
      update(next=>{for(const asset of next.assets) if(found.has(asset.id)) Object.assign(asset,found.get(asset.id));});
    }
    notify(found.size?'Relinked '+found.size+' of '+missing.length+' missing files.':'No matching media found in that folder.');
  } catch(error) {notify(error.message);}
  finally {fileBusy=false;}
}

let assetEpoch=0;
const audioFileExtensions=['.wav','.mp3','.ogg','.m4a','.aac','.flac'];
async function importFiles() {
  const audioOnly=tab==='audio';
  if (!desktop) {
    const picker=$('browser-files');
    picker.accept=audioOnly?audioFileExtensions.join(','):'video/*,image/*,audio/*';
    picker.dataset.audioOnly=String(audioOnly);
    picker.click();
    return;
  }
  if(fileBusy) return;
  fileBusy=true;
  try {
    const epoch=assetEpoch;
    const files=await desktop.importMedia(audioOnly);
    if(files.length&&epoch===assetEpoch) {
      await addAssets(files,epoch);
    }
  } catch(error) {notify(error.message);}
  finally {fileBusy=false;}
}

$('browser-files').onchange=event=>{
  const picker=event.currentTarget;
  const audioOnly=picker.dataset.audioOnly==='true';
  const files=[...picker.files].map(file=>{
    const extension=file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (audioOnly&&!audioFileExtensions.includes(extension)) return {error:file.name};
    const kind=audioOnly?'audio':file.type.split('/')[0];
    return ['image','audio','video'].includes(kind)?{name:file.name,kind,url:URL.createObjectURL(file)}:{error:file.name};
  });
  void addAssets(files);
  picker.value='';
};

function reset(next,isSample=false) {
  canvasDimensionsLinked=false;
  previewAsset(null);
  stop();
  assetEpoch++;
  previewView.fit();
  next.tracks=next.tracks.filter(track=>track.clips.length);
  project=next;
  sample=isSample;
  saved=JSON.stringify(next);
  history.length=0;
  future.length=0;
  selected=null;
  additionalSelection.clear();
  clipClipboard=[];
  panel='canvas';
  tab='media';
  $('asset-search').value='';
  previewFrame=isSample?FPS*3:0;
  notify('');
  refresh();
  const missing=next.assets.filter(asset=>!asset.url).length;
  if(missing) notify(missing+' source '+(missing===1?'file is':'files are')+' missing from this project.');
}

function projectView() {
  return {zoom,frame:previewFrame,left:scroll.scrollLeft,top:scroll.scrollTop};
}

function saveProjectView() {
  if(!projectFile) return;
  try {localStorage.setItem('oclip.view:'+projectFile,JSON.stringify(projectView()));} catch {}
}

function restoreProjectView(view) {
  if(!view&&projectFile) {
    try {view=JSON.parse(localStorage.getItem('oclip.view:'+projectFile));} catch {}
  }
  if(!view) return;
  if(Number.isFinite(view.zoom)) setZoom(clamp(view.zoom,-140,100),false);
  if(Number.isFinite(view.frame)) seek(view.frame);
  scroll.scrollLeft=view.left||0;
  scroll.scrollTop=view.top||0;
}

async function checkpoint() {
  if(!desktop||!recoveryReady||fileBusy||drag||previewTransform.gesture||document.body.classList.contains('scrubbing-number')) return;
  const snapshot=JSON.stringify(project);
  const dirty=snapshot!==saved;
  const key=dirty?JSON.stringify([projectFile,snapshot]):'';
  if(key===checkpointKey) return;
  checkpointKey=key;
  try {await desktop.checkpoint(dirty?project:null,projectView());}
  catch {if(checkpointKey===key) checkpointKey=undefined;}
}

async function startRecovery() {
  try {
    const entry=await desktop.recover();
    if(!entry) return;
    const decision=await confirmAction({title:'Recover unsaved edits?',description:entry.project.name,
      action:'Recover',cancel:'Discard',danger:false});
    if(decision==='cancel') await desktop.checkpoint(null);
    if(decision!=='confirm') return;
    if(!validateProject(entry.project)) throw Error('The recovery copy could not be opened.');
    projectFile=entry.managed?entry.file:(await desktop.createProject(entry.project)).file;
    managedProject=true;
    await desktop.setProjectPath(projectFile);
    switchHome(false);
    reset(entry.project);
    saved='';
    restoreProjectView(entry.view);
    notify('Unsaved edits recovered');
  } catch(error) {notify(error.message);}
  finally {recoveryReady=true;}
}

function switchHome(show) {
  onHome=show;
  $('home-screen').hidden=!show;
  document.body.classList.toggle('on-home',show);
  if(show) $('home-new').focus({preventScroll:true});
}

function homeMessage(message='') {
  $('home-status').textContent=message;
  $('home-status').hidden=!message;
}

let homeProjects=[];
function drawHomeProjects() {
    $('home-tools').hidden=!homeProjects.length;
    renderProjects($('home-projects'),homeProjects,{
      open:id=>homeAction('open',id),
      duplicate:id=>homeAction('duplicate',id),
      collect:id=>homeAction('collect',id),
      remove:project=>homeAction('remove',project),
    },{query:$('home-search').value,sort:$('home-sort').value});
}

async function refreshHome() {
  try {
    homeProjects=await desktop.listProjects();
    drawHomeProjects();
  } catch(error) {homeMessage(error.message);}
}

async function enterProject(entry) {
  if(!validateProject(entry.project)) throw Error('The project contains invalid or unsupported data.');
  await desktop.setProjectPath(entry.file);
  projectFile=entry.file;
  managedProject=entry.managed===true;
  switchHome(false);
  reset(entry.project);
  restoreProjectView();
}

function saveCurrent() {
  if(saveInFlight) return saveInFlight;
  const snapshot=structuredClone(project);
  const view=projectView();
  saveInFlight=(async()=>{
    const frame=Math.min(view.frame,Math.max(0,duration(snapshot)-1));
    const thumbnail=await projectThumbnail(snapshot,frame,$('preview'),player).catch(()=>undefined);
    await desktop.saveProject(snapshot,thumbnail);
    saved=JSON.stringify(snapshot);
    sample=false;
    saveProjectView();
    saveError='';
  })().finally(()=>{saveInFlight=null;});
  return saveInFlight;
}

async function autosave() {
  if(!desktop||!recoveryReady||onHome||!managedProject||fileBusy||drag||previewTransform.gesture||saveInFlight||
    document.body.classList.contains('scrubbing-number')) return;
  if(JSON.stringify(project)===saved) return;
  try {await saveCurrent();}
  catch(error) {
    if(saveError!==error.message) notify('Autosave failed. '+error.message);
    saveError=error.message;
  }
}

async function homeAction(action,target) {
  if(fileBusy||!recoveryReady) return;
  fileBusy=true;
  homeMessage();
  try {
    if(action==='collect') {
      const result=await desktop.collectProject(target);
      if(result) homeMessage('Project and media copied to '+result.folder);
      return;
    }
    if(action==='duplicate'||action==='remove') {
      if(action==='duplicate') await desktop.duplicateProject(target);
      else if(await confirmAction({title:'Delete project?',description:'“'+target.name+'” will move to the Recycle Bin.',
        action:'Move to Recycle Bin'})==='confirm') await desktop.deleteProject(target.id);
      await refreshHome();
      return;
    }
    if(action==='open') {
      await enterProject(await desktop.openManagedProject(target));
      return;
    }
    const entry=action==='import'?await desktop.openProject():{project:createProject()};
    if(!entry) return;
    if(!validateProject(entry.project)) throw Error('The project contains invalid or unsupported data.');
    if(entry.managed) {
      await enterProject(entry);
      return;
    }
    const {file}=await desktop.createProject(entry.project);
    await enterProject({file,project:entry.project,managed:true});
    if(action==='import') {
      try {await saveCurrent();}
      catch(error) {notify(error.message);}
    }
  } catch(error) {homeMessage(error.message);}
  finally {fileBusy=false;}
}

async function goHome() {
  if(!desktop||fileBusy||exportJob||exportPicking) return;
  fileBusy=true;
  try {
    stop();
    await finishSaving();
    saveProjectView();
    await desktop.setProjectPath(null);
    projectFile=null;
    managedProject=false;
    reset(createProject());
    switchHome(true);
    homeMessage();
    await refreshHome();
  } catch(error) {notify(error.message);}
  finally {fileBusy=false;void checkpoint();}
}

async function finishSaving() {
  $('project-name').blur();
  if(saveInFlight) await saveInFlight;
  while(managedProject&&JSON.stringify(project)!==saved) await saveCurrent();
}

desktop?.onCloseRequest(async ()=>{
  // A project change already has its own confirmation and may open a file dialog.
  if(!recoveryReady||fileBusy||exportJob||exportPicking||$('confirm-dialog').open) {
    await desktop.resolveClose(false);
    return;
  }
  let close=false;
  fileBusy=true;
  try {await finishSaving();close=true;}
  catch(error) {notify(error.message);}
  finally {fileBusy=false;}
  if(close) {
    saveProjectView();
    await desktop.checkpoint(null).catch(()=>{});
  }
  await desktop.resolveClose(close);
});



const grid=$('timeline-grid');
const scroll=$('timeline-scroll');
scroll.addEventListener('scroll',()=>{
  scroll.classList.toggle('scrolled-from-start',scroll.scrollLeft>0);
},{passive:true});
grid.tabIndex=-1;
const snapLine=document.createElement('div');
snapLine.className='timeline-snap-line';
snapLine.setAttribute('aria-hidden','true');
function showTimelineSnap(frame) {
  if(frame==null) {snapLine.remove();return;}
  const ruler=grid.querySelector('.ruler');
  snapLine.style.left=(ruler.offsetLeft+frame*pixels)+'px';
  if(!snapLine.isConnected) grid.append(snapLine);
}

let edgeFrame;
let pointerPosition;
function scrollDuringDrag() {
  if(!drag||!pointerPosition) {edgeFrame=null;return;}
  const rect=scroll.getBoundingClientRect();
  const left=grid.querySelector('.ruler-head').getBoundingClientRect().right;
  const {clientX:x,clientY:y}=pointerPosition;
  const velocity=(value,min,max)=>clamp((value-max+30)/2,0,18)-clamp((min+30-value)/2,0,18);
  const previousX=scroll.scrollLeft;
  const previousY=scroll.scrollTop;
  scroll.scrollLeft+=velocity(x,left,rect.right);
  scroll.scrollTop+=velocity(y,rect.top,rect.bottom);
  if(previousX!==scroll.scrollLeft||previousY!==scroll.scrollTop) grid.onpointermove(pointerPosition);
  edgeFrame=requestAnimationFrame(scrollDuringDrag);
}
function frameAt(event,lane) {
  const timeArea=lane.hasAttribute('data-new-track')?grid.querySelector('.ruler'):lane;
  return (event.clientX-timeArea.getBoundingClientRect().left)/pixels;
}

function snapPosition(value,clip=null,mode='scrub') {
  if(!snapping) return value;
  const targets=clip?[0,previewFrame]:[0];
  for(const candidate of project.tracks) {
    for(const item of candidate.clips) {
      if(item.id!==clip?.id) targets.push(item.start,timing(item));
    }
  }
  const edges=mode==='move'?[0,clip.length]:[0];
  let result=value;
  let distance=7/pixels;
  for (const edge of edges) for (const target of targets) {
    const offset=Math.abs(value+edge-target);
    if(offset<distance) {result=target-edge;distance=offset;}
  }
  return result;
}

grid.onpointerdown=event=>{
  if(event.button!==0||event.target.closest('button')) return;
  if(event.target.closest('.track-gutter')) {select(null);return;}
  const node=event.target.closest('.clip');
  const lane=event.target.closest('.ruler,.track-lane,[data-new-track]');
  if(!lane) return;
  stop();
  if(node) {
    const context=findClip(project,node.dataset.clip);
    if(event.shiftKey||event.ctrlKey||event.metaKey) {
      const ids=new Set([selected,...additionalSelection].filter(Boolean));
      if(ids.has(context.clip.id)) ids.delete(context.clip.id); else ids.add(context.clip.id);
      const list=[...ids];
      select(list[0]??null,list.slice(1));
      node.focus({preventScroll:true});
      return;
    }
    if(!isClipSelected(context.clip.id)) select(context.clip.id);
    node.focus({preventScroll:true});
    if(context.track.locked) return;
    const mode=event.target.dataset.mode||'move';
    drag={node,lane,context,mode,scrollLeft:scroll.scrollLeft,pointer:event.pointerId,x:event.clientX,y:event.clientY,edit:context.clip,target:context.track};
    const moving=mode==='move'?linkedSelection(project,[selected,...additionalSelection]):[];
    if(moving.length>1) {
      drag.group=moving.map(id=>findClip(project,id)).filter(Boolean);
      if(drag.group.some(item=>item.track.locked)) {drag=null;notify('Unlock selected tracks to move this group.');return;}
      drag.delta=0;
    }
  } else if(lane.matches('.ruler')) {
    grid.focus({preventScroll:true});
    select(null);
    seek(snapPosition(frameAt(event,lane)));
    drag={lane,pointer:event.pointerId};
  } else {
    event.preventDefault();
    grid.focus({preventScroll:true});
    const rect=grid.getBoundingClientRect();
    drag={lane,pointer:event.pointerId,marquee:true,x:event.clientX-rect.left,y:event.clientY-rect.top,
      prior:[selected,...additionalSelection]};
  }
  grid.setPointerCapture(event.pointerId);
};

function updateMarquee(event) {
  const rect=grid.getBoundingClientRect();
  const ruler=grid.querySelector('.ruler').getBoundingClientRect();
  const x=clamp(event.clientX,Math.max(ruler.left,grid.querySelector('.ruler-head').getBoundingClientRect().right),rect.right)-rect.left;
  const y=clamp(event.clientY,ruler.bottom,rect.bottom)-rect.top;
  if(!drag.moved&&Math.hypot(x-drag.x,y-drag.y)<3) return;
  drag.moved=true;
  if(!drag.box) {
    drag.box=document.createElement('div');
    drag.box.className='timeline-marquee';
    drag.box.setAttribute('aria-hidden','true');
    grid.append(drag.box);
  }
  const left=Math.min(x,drag.x);
  const top=Math.min(y,drag.y);
  const right=Math.max(x,drag.x);
  const bottom=Math.max(y,drag.y);
  Object.assign(drag.box.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
  const hits=[...grid.querySelectorAll('[data-clip]')].filter(node=>{
    const clip=node.getBoundingClientRect();
    return clip.right>rect.left+left&&clip.left<rect.left+right&&clip.bottom>rect.top+top&&clip.top<rect.top+bottom;
  }).map(node=>node.dataset.clip);
  if((hits[0]??null)!==selected||Math.max(0,hits.length-1)!==additionalSelection.size||
      hits.some(id=>!isClipSelected(id))) select(hits[0]??null,hits.slice(1));
}

function showDragClip(node,lane,clip) {
  drag.previews??=new Map();
  let preview=drag.previews.get(node);
  if(!preview) {
    preview=node.cloneNode(true);
    preview.removeAttribute('data-clip');
    preview.removeAttribute('tabindex');
    preview.classList.add('clip-drag-preview');
    preview.setAttribute('aria-hidden','true');
    drag.previews.set(node,preview);
    node.classList.add('clip-drag-source');
  }
  if(preview.parentElement!==lane) lane.append(preview);
  preview.style.left=clip.start*pixels+'px';
  preview.style.width=Math.max(2,clip.length*pixels)+'px';
}

grid.onpointermove=event=>{
  if(drag?.pointer!==event.pointerId) return;
  pointerPosition=event;
  if(edgeFrame==null) edgeFrame=requestAnimationFrame(scrollDuringDrag);
  if(drag.marquee) {updateMarquee(event);return;}
  const {context,mode,node,lane}=drag;
  if(!context) {seek(snapPosition(frameAt(event,lane)));buttons();return;}
  if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<3) return;
  drag.moved=true;
  if(drag.group) {
    const ids=drag.group.map(item=>item.clip.id);
    const hovered=document.elementFromPoint(event.clientX,event.clientY)?.closest('.track-lane,[data-new-track]');
    const targetIndex=project.tracks.findIndex(track=>track.id===hovered?.dataset.track);
    const sourceIndex=project.tracks.indexOf(context.track);
    const trackOffset=targetIndex<0?0:targetIndex-sourceIndex;
    const delta=Math.round((event.clientX-drag.x+scroll.scrollLeft-drag.scrollLeft)/pixels);
    const selectedIds=new Set(ids);
    const targets=snapping?[0,previewFrame,...project.tracks.flatMap(track=>
      track.clips.filter(clip=>!selectedIds.has(clip.id)).flatMap(clip=>[clip.start,timing(clip)]))]:[];
    const append=hovered?.hasAttribute('data-new-track');
    const {moves,snap}=planTimelineDrag(project,ids,delta,trackOffset,append,targets,snapping?7/pixels:0);
    showTimelineSnap(snap);
    drag.moves=moves;
    clearDrop();
    if(append&&moves) hovered.classList.add('new-track-target');
    for(const item of drag.group) {
      const move=moves?.find(move=>move.clip.id===item.clip.id)??item;
      const element=grid.querySelector('[data-clip="'+CSS.escape(item.clip.id)+'"]');
      const lane=grid.querySelector('[data-track="'+CSS.escape(move.track.id)+'"]')??
        grid.querySelector('[data-track="'+CSS.escape(item.track.id)+'"]');
      showDragClip(element,lane,move.clip);
    }
    notify(moves?'':'This group cannot fit on those tracks.');
    return;
  }
  const hovered=document.elementFromPoint(event.clientX,event.clientY)?.closest('.track-lane, [data-new-track]');
  const destination=project.tracks.find(track=>track.id===hovered?.dataset.track);
  const target=mode==='move'&&destination?destination:context.track;
  const delta=(event.clientX-drag.x+scroll.scrollLeft-drag.scrollLeft)/pixels;
  const base=mode==='right'?timing(context.clip):context.clip.start;
  const position=snapPosition(base+delta,context.clip,mode);
  const placement=mode==='move'?planPlacement(project.tracks,context.clip,position,target):null;
  const appendTrack=mode==='move'&&hovered?.hasAttribute('data-new-track');
  if(appendTrack&&placement) {
    placement.track=null;
    placement.newIndex=project.tracks.length;
  }
  const edit=mode==='move'?placement?.edit:editSpan(target,context.clip,mode,position,context.asset);
  const appliedEdge=edit&&(mode==='right'?timing(edit):edit.start);
  showTimelineSnap(snapping&&position!==base+delta&&appliedEdge===position?position:null);
  drag.edit=edit;
  drag.placement=placement;
  clearDrop();
  if(!edit) {
    showDragClip(node,lane,context.clip);
    return;
  }
  const edge=mode==='right'?timing(edit):edit.start;
  notify((mode==='move'?'Start ':'Trim ') + timecode(edge) + '   |   Duration ' + timecode(edit.length));
  const targetLane=grid.querySelector('[data-track="'+CSS.escape(target.id)+'"]');
  if(placement&&!placement.track) (appendTrack?hovered:targetLane).classList.add('new-track-target');
  showDragClip(node,targetLane,edit);
};

function finishDrag(event,canceled=false) {
  if(drag?.pointer!==event.pointerId) return;
  const {context,lane,node,moved,edit,placement,marquee,box,prior,group,moves,previews}=drag;
  for(const [original,preview] of previews??[]) {
    original.classList.remove('clip-drag-source');
    preview.remove();
  }
  clearDrop();
  drag=null;
  pointerPosition=null;
  cancelAnimationFrame(edgeFrame);
  edgeFrame=null;
  showTimelineSnap(null);
  if(marquee) {
    box?.remove();
    if(canceled) select(prior[0],prior.slice(1));
    else if(!moved) {
      select(null);
      if(lane.matches('.track-lane')) seek(snapPosition(frameAt(event,lane)));
    }
    return;
  }
  if(!context||!moved) return;
  if(group) {
    if(!canceled&&moves) update(next=>applyGroupMove(next,moves));
    notify('');
    return;
  }
  if (!canceled&&edit) {
    update(next=>{
      if(placement) placeClip(next,placement);
      else {
        const {clip,track}=findClip(next,context.clip.id);
        track.clips[track.clips.indexOf(clip)]=edit;
      }
    });
  }
  if(node.isConnected) {
    notify('');
  }
}
grid.onpointerup=event=>finishDrag(event);
grid.onpointercancel=event=>finishDrag(event,true);
grid.onlostpointercapture=event=>finishDrag(event,true);
grid.ondblclick=event=>{
  if(event.target.closest('.ruler')) togglePlay();
};
grid.onclick=event=>{
  const action=event.target.closest('[data-toggle],[data-lock],[data-track-mute]');
  if(!action) return;
  update(next=>{
    const track=next.tracks.find(item=>item.id===(action.dataset.toggle||action.dataset.lock||action.dataset.trackMute));
    if(action.hasAttribute('data-track-mute')) track.muted=!track.muted;
    else if(action.hasAttribute('data-toggle')) track.enabled=!track.enabled;
    else track.locked=!track.locked;
  });
};
grid.onkeydown=event=>{
  const clip=event.target.closest('[data-clip]');
  if(clip&&event.key==='Enter') {event.preventDefault();select(clip.dataset.clip);}
};
let draggedTrack=null;
let reorderMarker=null;
function clearReorder() {
  reorderMarker?.classList.remove('reorder-before','reorder-after');
  reorderMarker=null;
}

grid.ondragstart=event=>{
  const grip=event.target.closest('.track-grip');
  if(!grip) return;
  draggedTrack=grip.closest('[data-track-head]').dataset.trackHead;
  event.dataTransfer.setData('application/x-oclip-track',draggedTrack);
  event.dataTransfer.effectAllowed='move';
};
grid.ondragend=()=>{
  draggedTrack=null;
  clearReorder();
};

function reorderTarget(event) {
  const row=event.target.closest('[data-track-head], .track-lane, [data-new-track]');
  if(!row) return null;
  return {row,id:row.dataset.trackHead??row.dataset.track,
    after:event.clientY>row.getBoundingClientRect().top+row.offsetHeight/2};
}

grid.ondragover=event=>{
  if(draggedTrack) {
    const target=reorderTarget(event);
    clearReorder();
    if(!target||target.id===draggedTrack) return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    reorderMarker=target.row;
    reorderMarker.classList.add(target.after?'reorder-after':'reorder-before');
    return;
  }
  const lane=event.target.closest('.track-lane, [data-new-track]');
  const track=project.tracks.find(item=>item.id===lane?.dataset.track);
  const asset=project.assets.find(item=>item.id===draggedAsset);
  if(!lane||track?.locked||!asset) {clearDrop();return;}
  event.preventDefault();
  event.dataTransfer.dropEffect='copy';
  const placement=planPlacement(project.tracks,createClip(asset),frameAt(event,lane),track);
  clearDrop();
  lane.classList.add(track&&placement.track?'drop-target':'new-track-target');
};
grid.ondragleave=event=>{if(!grid.contains(event.relatedTarget)) {clearDrop();clearReorder();}};
grid.ondrop=event=>{
  clearDrop();
  clearReorder();
  if(draggedTrack) {
    const target=reorderTarget(event);
    const source=draggedTrack;
    draggedTrack=null;
    if(!target||target.id===source) return;
    event.preventDefault();
    update(next=>{
      const index=next.tracks.findIndex(track=>track.id===source);
      if(index<0) return;
      const [track]=next.tracks.splice(index,1);
      const destination=next.tracks.findIndex(item=>item.id===target.id);
      next.tracks.splice(destination<0?next.tracks.length:destination+Number(target.after),0,track);
    });
    return;
  }
  const lane=event.target.closest('.track-lane, [data-new-track]');
  const asset=project.assets.find(item=>item.id===event.dataTransfer.getData('application/x-oclip-asset'));
  if(!lane||!asset) return;
  event.preventDefault();
  insert(asset,Math.round(frameAt(event,lane)),lane.dataset.track,lane.hasAttribute('data-new-track'));
};

function setZoom(value, keepPosition=true, clientX=null) {
  const nextZoom=clamp(value,-140,100);
  if(nextZoom===zoom&&keepPosition) return;
  const old=pixels;
  const head=grid.querySelector('.ruler-head')?.offsetWidth||154;
  const visible=Math.max(1,scroll.clientWidth-head);
  const anchorOffset=clientX===null
    ? previewFrame*old-scroll.scrollLeft
    : clientX-scroll.getBoundingClientRect().left-head;
  const offset=clamp(anchorOffset,0,visible);
  const anchor=(scroll.scrollLeft+offset)/old;
  zoom=nextZoom;
  $('zoom').value=zoom;
  renderTimeline();
  scroll.scrollLeft=keepPosition?Math.max(0,anchor*pixels-offset):0;
}

scroll.addEventListener('wheel',event=>{
  if(!event.ctrlKey&&!event.metaKey) return;
  event.preventDefault();
  if(drag||!event.deltaY) return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?scroll.clientHeight:1;
  const delta=clamp(event.deltaY*unit,-120,120);
  setZoom(zoom-delta*.08,true,event.clientX);
},{passive:false});

let availableFormats=[];
let exportDestination=null;
const canChooseExport=Boolean(desktop||window.showSaveFilePicker);
const exportFormat=()=>availableFormats.find(format=>format.extension===$('export-format').value);

function exportMessage(message='') {
  $('export-message').textContent=message;
  $('export-message').hidden=!message;
}

function syncExportControls() {
  const busy=Boolean(exportJob||exportPicking);
  const location=exportDestination?.file??exportDestination?.name;
  $('export-location').textContent=location??(canChooseExport?'Choose a file location':'Browser downloads');
  $('export-location').title=location??'';
  $('export-format').disabled=busy||!availableFormats.length;
  $('export-quality').disabled=busy;
  $('choose-export').hidden=!canChooseExport;
  $('choose-export').disabled=busy||!exportFormat();
  $('start-export').disabled=busy||!exportFormat()||(canChooseExport&&!exportDestination);
  $('close-export').disabled=busy;
  $('cancel-export').disabled=exportPicking;
}

$('export').onclick=()=>{
  const frames=duration(project);
  if(!frames) return;
  availableFormats=exportFormats(project);
  $('export-format').replaceChildren(...availableFormats.map(format=>new Option(format.label,format.extension)));
  exportDestination=null;
  $('export-details').textContent=project.width+' × '+project.height+' · '+FPS+' fps · '+timecode(frames);
  exportMessage(availableFormats.length?'':'No compatible video encoder is available on this device.');
  $('export-progress').hidden=true;
  syncExportControls();
  $('export-dialog').showModal();
};
$('export-format').onchange=()=>{
  exportDestination=null;
  exportMessage();
  syncExportControls();
};
$('choose-export').onclick=async ()=>{
  const format=exportFormat();
  if(!format||exportPicking||exportJob) return;
  exportPicking=true;
  exportMessage();
  syncExportControls();
  try {
    const {extension,contentType,label}=format;
    const destination=desktop?await desktop.chooseExport(project.name,extension):await window.showSaveFilePicker({
      suggestedName:project.name+'.'+extension,
      types:[{description:label,accept:{[contentType]:['.'+extension]}}],
      excludeAcceptAllOption:true,
    });
    if(destination) exportDestination=destination;
  } catch(error) {
    if(error.name!=='AbortError') exportMessage(error.message);
  } finally {
    exportPicking=false;
    syncExportControls();
  }
};
$('export-dialog').addEventListener('cancel',event=>{
  if(!exportJob&&!exportPicking) return;
  event.preventDefault();
  if(!$('cancel-export').disabled) exportJob?.abort();
});
$('cancel-export').onclick=event=>{
  if(!exportJob) return;
  event.preventDefault();
  exportJob.abort();
};
$('start-export').onclick=async ()=>{
  const format=exportFormat();
  if(!format||exportJob||exportPicking||(canChooseExport&&!exportDestination)) return;
  const snapshot=project;
  const missing=snapshot.tracks.some(track=>track.enabled&&track.clips.some(clip=>clip.assetId&&!snapshot.assets.find(asset=>asset.id===clip.assetId)?.url));
  if(missing) {exportMessage('An enabled track contains missing media.');return;}
  stop();
  exportJob=new AbortController();
  exportMessage();
  syncExportControls();
  const progress=$('export-progress');
  const indicator=progress.querySelector('progress');
  indicator.value=0;
  $('export-phase').textContent='Rendering video';
  progress.hidden=false;
  let saving=false;
  try {
    const writeChunk=desktop?bytes=>desktop.exportChunk(exportDestination.id,bytes):undefined;
    const bitrate=Number($('export-quality').value);
    const blob=await record(snapshot,duration(snapshot),format.mimeType,value=>indicator.value=value,exportJob.signal,writeChunk,bitrate);
    exportJob.signal.throwIfAborted();
    indicator.value=1;
    $('export-phase').textContent='Saving video';
    $('cancel-export').disabled=true;
    saving=true;
    if(desktop) {
      await desktop.finishExport(exportDestination.id,true);
    } else if(exportDestination) {
      await blob.stream().pipeTo(await exportDestination.createWritable());
    } else {
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=snapshot.name+'.'+format.extension;
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    $('export-dialog').close();
    notify('Video exported');
  } catch(error) {
    if(desktop&&exportDestination) await desktop.finishExport(exportDestination.id,false).catch(()=>{});
    if(error.name==='AbortError') $('export-dialog').close();
    else {
      if(saving&&desktop) exportDestination=null;
      exportMessage(error.message);
    }
  } finally {
    exportJob=null;
    progress.hidden=true;
    syncExportControls();
    buttons();
  }
};

document.addEventListener('pointerdown',event=>{
  const name=$('project-name');
  if(document.activeElement===name&&event.target!==name) name.blur();
},true);
$('project-name').addEventListener('keydown',event=>{
  if(event.key==='Enter') {event.preventDefault();event.currentTarget.blur();}
  if(event.key==='Escape') {event.currentTarget.value=project.name;event.currentTarget.blur();}
});
$('project-name').onchange=event=>update(next=>next.name=event.target.value.trim()||'Untitled project');
$('asset-search').oninput=renderLibrary;
for(const button of document.querySelectorAll('[data-tab]')) button.onclick=()=>{
  tab=button.dataset.tab;
  $('asset-search').value='';
  renderLibrary();
};
$('import').onclick=importFiles;

$('canvas-tab').onclick=()=>{panel='canvas';renderInspector();};
$('clip-tab').onclick=()=>{panel='clip';renderInspector();};
$('play').onclick=togglePlay;
$('fullscreen').onclick=async ()=>{
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else await $('viewport').requestFullscreen();
  } catch(error) {notify(error.message);}
};
$('monitor-audio').onclick=()=>{
  player.muted=!player.muted;
  const media=previewMedia();
  if(media) media.muted=player.muted;
  $('monitor-audio').innerHTML=icon(player.muted?'mute':'volume');
  $('monitor-audio').setAttribute('aria-pressed',player.muted);
  draw();
};
function jumpTransport(action) {
  const delta=action==='back'?-1:1;
  if(selectedAsset) {
    const media=previewMedia();
    if(!media||!Number.isFinite(media.duration)) return;
    media.pause();
    media.currentTime=action==='first'?0:action==='last'?media.duration:clamp(media.currentTime+delta/FPS,0,media.duration);
    refreshTransport();
    return;
  }
  if(action==='back'||action==='forward') stop();
  seek(action==='first'?0:action==='last'?duration(project):previewFrame+delta,true);
}
for(const id of ['first','last','back','forward']) $(id).onclick=()=>jumpTransport(id);
$('undo').onclick=()=>undo();
$('redo').onclick=()=>undo(true);
$('split').onclick=split;
$('delete').onclick=()=>remove();
$('mute-clip').onclick=()=>toggleClipMute(selected);
$('snap').onclick=()=>{
  snapping=!snapping;
  $('snap').classList.toggle('active',snapping);
  $('snap').setAttribute('aria-pressed',snapping);
};
$('zoom').oninput=event=>setZoom(Number(event.target.value));
$('zoom-in').onclick=()=>setZoom(zoom+7);
$('zoom-out').onclick=()=>setZoom(zoom-7);
$('zoom-fit').onclick=()=>setZoom(fittedZoom(duration(project)),false);

const shortcuts=[
  ['Select all timeline clips','Ctrl+A'],
  ['Copy selected clips','Ctrl+C'],
  ['Paste clips at playhead','Ctrl+V'],
  ['Add or remove a clip from selection','Shift / Ctrl+click'],
  ['Select clips with a box','Drag empty timeline space'],
  ['Move selected clips together','Drag a selected clip'],
  ['Clear clip selection / close popup','Escape'],
  ['Delete selected unlocked clips','Delete'],
  ['Ripple delete on selected tracks','Shift+Delete'],
  ['Mute / unmute selected clips','M'],
  ['Toggle snapping','N'],
  ['Split selected clips at playhead','S'],
  ['Play / pause timeline','Tab'],
  ['Play / pause active preview','Space'],
  ['Previous / next frame','Left / Right arrow'],
  ['Previous / next cut','Shift+Left / Right arrow'],
  ...panelShortcuts,
  ['Nudge selection by one frame','Alt+Left / Right arrow'],
  ['Undo','Ctrl+Z'],
  ['Redo','Ctrl+Shift+Z / Ctrl+Y'],
  ['Save project','Ctrl+S'],
  ['Adjust focused numeric value','Up / Down arrow'],
  ['Adjust numeric value by ten','Shift+Up / Down arrow'],
  ['Commit focused field','Enter'],
  ['Select focused clip','Enter'],
  ['Navigate context menu','Up / Down / Home / End'],
];
function renderShortcuts() {
  const query=$('shortcut-search').value.trim().toLowerCase();
  const matches=shortcuts.filter(row=>row.join(' ').toLowerCase().includes(query));
  $('shortcut-list').innerHTML=matches.length?matches.map(([label,keys])=>
    '<div class="shortcut-row"><span>'+escape(label)+'</span><kbd>'+escape(keys)+'</kbd></div>').join(''):
    '<p>No matching shortcuts</p>';
}
$('shortcut-search').oninput=renderShortcuts;
$('shortcuts').onclick=()=>{
    $('shortcut-search').value='';
    renderShortcuts();
    $('shortcut-dialog').showModal();
    $('shortcut-search').focus();
};
$('close-shortcuts').onclick=()=>$('shortcut-dialog').close();
$('shortcut-dialog').addEventListener('click',event=>{
  if(event.target!==event.currentTarget) return;
  const rect=event.currentTarget.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) event.currentTarget.close();
});

document.addEventListener('keydown',event=>{
  if(onHome) return;
  if($('shortcut-dialog').open) return;
  if($('export-dialog').open||$('confirm-dialog').open) return;
  const editing=event.target.matches('input,textarea,select')||event.target.isContentEditable;
  const key=event.key.toLowerCase();
  if(togglePanelsFromShortcut(event)) return;
  if(event.altKey) {
    if(!editing&&!drag&&!selectedAsset&&selected&&(key==='arrowleft'||key==='arrowright')) {
      event.preventDefault();
      const moves=planGroupMove(project,linkedSelection(project,[selected,...additionalSelection]),key==='arrowleft'?-1:1);
      if(moves) update(next=>applyGroupMove(next,moves));
    }
    return;
  }
  if(drag&&key!=='escape') return;
  if(event.ctrlKey||event.metaKey) {
    const timelineShortcut=!editing&&!selectedAsset&&
      (event.target.closest('.timeline-panel')||event.target===document.body);
    if(timelineShortcut&&!drag&&key==='a') {
      event.preventDefault();
      const ids=project.tracks.flatMap(track=>track.clips.map(clip=>clip.id));
      select(ids[0]??null,ids.slice(1));
    }
    if(timelineShortcut&&!drag&&key==='c'&&selected) {event.preventDefault();copyClips();}
    if(timelineShortcut&&!drag&&key==='v'&&clipClipboard.length) {event.preventDefault();if(!event.repeat) pasteClips();}
    if(key==='z'&&!editing) {event.preventDefault();undo(event.shiftKey);}
    if(key==='y'&&!editing) {event.preventDefault();undo(true);}
    if(desktop&&key==='s') {
      event.preventDefault();
      if(editing) event.target.blur();
      void autosave();
    }
    return;
  }
  if(key==='tab'&&!event.shiftKey) {
    event.preventDefault();
    if(!event.repeat) {
      if(document.activeElement?.matches('button')) document.activeElement.blur();
      previewAsset(null);
      togglePlay();
    }
    return;
  }
  if(editing||event.target.isContentEditable) return;
  if(key==='escape') {
    if(drag) finishDrag({pointerId:drag.pointer},true);
    else select(null);
    return;
  }
  if(key==='m'&&!event.repeat) {toggleClipMute(selected);return;}
  if(key==='n'&&!event.repeat) {$('snap').click();return;}
  if(key===' ') {
    event.preventDefault();
    if(!event.repeat) {
      if(document.activeElement?.matches('button')) document.activeElement.blur();
      togglePlay();
    }
    return;
  }
  if(key==='delete') {event.preventDefault();remove(event.shiftKey);}
  if(key==='s') split();
  if(key==='arrowleft'||key==='arrowright') {
    event.preventDefault();
    if(event.shiftKey&&!selectedAsset) {
      stop();
      const cuts=[0,duration(project),...project.tracks.flatMap(track=>track.clips.flatMap(clip=>[clip.start,timing(clip)]))];
      if(key==='arrowleft') seek(cuts.reduce((cut,frame)=>frame<previewFrame?Math.max(cut,frame):cut,0),true);
      else seek(cuts.reduce((cut,frame)=>frame>previewFrame?Math.min(cut,frame):cut,duration(project)),true);
    } else jumpTransport(key==='arrowleft'?'back':'forward');
  }
});

new ResizeObserver(frameFit).observe($('viewport'));
let rulerWidth=scroll.clientWidth;
let rulerRatio=window.devicePixelRatio;
let rulerResizeFrame=0;
new ResizeObserver(()=>{
  const width=scroll.clientWidth;
  const ratio=window.devicePixelRatio;
  if(width===rulerWidth&&ratio===rulerRatio) return;
  rulerWidth=width;
  rulerRatio=ratio;
  cancelAnimationFrame(rulerResizeFrame);
  rulerResizeFrame=requestAnimationFrame(()=>{if(!drag) renderTimeline();});
}).observe(scroll);
window.addEventListener('beforeunload',event=>{
  if(!desktop&&JSON.stringify(project)!==saved) {event.preventDefault();event.returnValue='';}
});

const reloadStateKey='oclip.dev-reload';
if(desktop) {
  const snapshot=sessionStorage.getItem(reloadStateKey);
  sessionStorage.removeItem(reloadStateKey);
  if(snapshot) {
    const state=JSON.parse(snapshot);
    ({project,saved,sample,previewFrame,selected,panel,tab,zoom}=state);
    projectFile=state.projectFile??null;
    managedProject=state.managedProject===true;
    switchHome(state.onHome===true);
    history.push(...state.history);
    future.push(...state.future);
    $('zoom').value=zoom;
  }
  let reloadRetry;
  function reloadEditor() {
    clearTimeout(reloadRetry);
    if(fileBusy||exportJob||drag||previewTransform.gesture||$('confirm-dialog').open||$('export-dialog').open||
        document.activeElement?.matches('input:not([type="range"]), textarea, select')) {
      reloadRetry=setTimeout(reloadEditor,350);
      return;
    }
    try {
      const state={project,saved,sample,previewFrame,selected,panel,tab,zoom,history,future,projectFile,managedProject,onHome};
      try {
        sessionStorage.setItem(reloadStateKey,JSON.stringify(state));
      } catch {
        sessionStorage.setItem(reloadStateKey,JSON.stringify({...state,history:[],future:[]}));
      }
    } catch {
      notify('Dev reload skipped because the current edit could not be preserved.');
      return;
    }
    desktop.reloadForDevelopment().catch(error=>notify(error.message));
  }
  desktop.onDevReload(reloadEditor);
  $('go-home').onclick=goHome;
  $('home-new').onclick=()=>homeAction('new');
  $('home-import').onclick=()=>homeAction('import');
  $('home-search').oninput=drawHomeProjects;
  $('home-sort').onchange=drawHomeProjects;
  if(snapshot) {
    recoveryReady=true;
    if(onHome) void refreshHome();
  } else {
    switchHome(true);
    void refreshHome();
    void startRecovery();
  }
  setInterval(async()=>{
    await checkpoint();
    await autosave();
  },1500);
} else $('go-home').hidden=true;

refresh();
