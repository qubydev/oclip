import {icon} from './icons.js';

const main=document.querySelector<HTMLElement>('main');
const workspace=document.querySelector<HTMLElement>('.workspace');
const defaults={left:264,right:244,bottom:300,library:false,inspector:false,timeline:false};
let state={...defaults};
try {
  const saved=JSON.parse(localStorage.getItem('oclip.layout.v1'));
  for(const key of Object.keys(defaults)) {
    if(typeof saved?.[key]===typeof defaults[key]) state[key]=saved[key];
  }
} catch {}
for(const key of ['left','right','bottom']) {
  if(!Number.isFinite(state[key])) state[key]=defaults[key];
}
const panels={
  library:document.querySelector<HTMLElement>('.library'),
  inspector:document.querySelector<HTMLElement>('.inspector'),
  timeline:document.querySelector<HTMLElement>('.timeline-panel'),
};
const names={library:'Media panel',viewer:'Player',inspector:'Properties',timeline:'Timeline'};
const controls: Record<string, HTMLElement>={};
const shortcuts={Digit1:'library',Digit2:'inspector',Digit3:'timeline'};
export const panelShortcuts=[
  ...Object.entries(shortcuts).map(([code,key])=>['Toggle '+names[key],'Alt+Shift+'+code.slice(-1)]),
  ['Toggle all panels','Alt+Shift+0'],
];

export function togglePanelsFromShortcut(event) {
  if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey) return false;
  const panel=shortcuts[event.code];
  if(!panel&&event.code!=='Digit0') return false;
  event.preventDefault();
  if(event.repeat) return true;
  if(panel) toggle(panel);
  else {
    const keys=Object.keys(panels);
    const collapse=keys.some(key=>!state[key]);
    for(const key of keys) state[key]=collapse;
    apply();
    save();
  }
  return true;
}
let gesture=null;

function save() {
  try {localStorage.setItem('oclip.layout.v1',JSON.stringify(state));} catch {}
}

function sizes() {
  const width=workspace.clientWidth;
  const center=320;
  const railWidth=parseFloat(getComputedStyle(panels.library).getPropertyValue('--library-rail'));
  let left=state.library?railWidth:Math.max(220,Math.min(460,state.left));
  let right=state.inspector?40:Math.max(200,Math.min(420,state.right));
  let excess=Math.max(0,left+right+center+12-width);
  const takeLeft=Math.min(excess,Math.max(0,left-(state.library?railWidth:220)));
  left-=takeLeft;
  excess-=takeLeft;
  right-=Math.min(excess,Math.max(0,right-(state.inspector?40:200)));
  const bottom=state.timeline?39:Math.max(160,Math.min(state.bottom,main.clientHeight-242));
  return {left,right,bottom,center};
}

function apply() {
  const value=sizes();
  workspace.style.gridTemplateColumns=value.left+'px 6px minmax('+value.center+'px,1fr) 6px '+value.right+'px';
  main.style.gridTemplateRows='minmax(220px,1fr) 6px '+value.bottom+'px';
  for(const key of Object.keys(panels)) {
    panels[key].classList.toggle('panel-collapsed',state[key]);
    const button=controls[key];
    button.setAttribute('aria-expanded',String(!state[key]));
    button.setAttribute('aria-label',String((state[key]?'Expand ':'Collapse ')+names[key]));
    button.title=button.getAttribute('aria-label');
  }
  for(const [key,handle] of Object.entries(handles)) {
    const limits=range(key);
    handle.setAttribute('aria-valuemin',String(limits.min));
    handle.setAttribute('aria-valuemax',String(limits.max));
    handle.setAttribute('aria-valuenow',String(Math.round(value[key])));
    handle.setAttribute('aria-disabled',String(state[panelFor[key]]));
    handle.tabIndex=state[panelFor[key]]?-1:0;
  }
}

function toggle(key, collapsed=!state[key]) {
  state[key]=collapsed;
  apply();
  save();
}

for(const [key,panel] of Object.entries(panels)) {
  const button=document.createElement('button');
  button.className='icon-button panel-toggle';
  button.innerHTML=icon('panel-toggle');
  button.type='button';
  panel.id ||= 'panel-'+key;
  button.setAttribute('aria-controls',String(panel.id));
  controls[key]=button;
  button.onclick=()=>toggle(key);
  const heading=key==='library'?panel:panel.querySelector<HTMLElement>(key==='timeline'?'.timeline-heading':'.titlebar');
  heading.append(button);
}
document.querySelectorAll<HTMLElement>('[data-tab]').forEach(button=>{
  button.addEventListener('click',()=>{if(state.library) toggle('library',false);});
});
panels.inspector.addEventListener('reveal-properties',()=>{
  if(state.inspector) toggle('inspector',false);
});

const panelFor={left:'library',right:'inspector',bottom:'timeline'};
const handles: Record<string, HTMLElement>={};
for(const key of ['left','right','bottom']) {
  const handle=document.createElement('div');
  handle.className='panel-divider '+(key==='bottom'?'horizontal':'vertical');
  handle.setAttribute('role','separator');
  handle.setAttribute('aria-label',String('Resize '+names[panelFor[key]]));
  handle.setAttribute('aria-orientation',String(key==='bottom'?'horizontal':'vertical'));
  handles[key]=handle;
  if(key==='left') panels.library.after(handle);
  else if(key==='right') panels.inspector.before(handle);
  else workspace.after(handle);

  handle.onpointerdown=event=>{
    if(event.button!==0||state[panelFor[key]]) return;
    event.preventDefault();
    gesture={key,id:event.pointerId,start:key==='bottom'?event.clientY:event.clientX,size:sizes()[key],original:state[key]};
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-'+(key==='bottom'?'rows':'columns'));
  };
  handle.onpointermove=event=>{
    if(!gesture||gesture.id!==event.pointerId||gesture.key!==key) return;
    const position=key==='bottom'?event.clientY:event.clientX;
    resize(key,gesture.size+(position-gesture.start)*(key==='left'?1:-1));
  };
  const end=(event,cancel=false)=>{
    if(!gesture||gesture.id!==event.pointerId||gesture.key!==key) return;
    if(cancel) state[key]=gesture.original;
    gesture=null;
    document.body.classList.remove('resizing-rows','resizing-columns');
    apply();
    save();
  };
  handle.onpointerup=event=>end(event);
  handle.onpointercancel=event=>end(event,true);
  handle.onlostpointercapture=event=>end(event,true);
  handle.ondblclick=()=>{
    state[key]=defaults[key];
    toggle(panelFor[key],false);
  };
  handle.onkeydown=event=>{
    if(state[panelFor[key]]) return;
    const limits=range(key);
    let value=sizes()[key];
    if(event.key==='Home') value=limits.min;
    else if(event.key==='End') value=limits.max;
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      const positive=event.key===(key==='bottom'?'ArrowUp':key==='right'?'ArrowLeft':'ArrowRight');
      value+=(positive?1:-1)*(event.shiftKey?40:10);
    } else return;
    event.preventDefault();
    event.stopPropagation();
    resize(key,value);
    save();
  };
}

function range(key) {
  const value=sizes();
  if(key==='bottom') return {min:160,max:Math.max(160,main.clientHeight-242)};
  const opposite=key==='left'?value.right:value.left;
  const min=key==='left'?220:200;
  return {min,max:Math.max(min,Math.min(key==='left'?460:420,workspace.clientWidth-opposite-value.center-12))};
}

function resize(key,value) {
  const limits=range(key);
  state[key]=Math.round(Math.min(limits.max,Math.max(limits.min,value)));
  apply();
}

new ResizeObserver(apply).observe(main);
apply();
