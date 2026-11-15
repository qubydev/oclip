import {icon} from './icons.js';
import {mediaPreview} from './media-previews.js';
import {compositionAt} from './playback.js';

export function renderProjects(container,projects,actions) {
  container.replaceChildren();
  if(!projects.length) {
    const empty=document.createElement('p');
    empty.className='home-empty';
    empty.textContent='No projects yet.';
    container.append(empty);
    return;
  }
  for(const project of projects) {
    const card=document.createElement('article');
    card.className='home-project';
    card.innerHTML='<button class="home-open" type="button"><span class="home-thumbnail"></span><span class="home-project-meta"><strong></strong><time></time></span></button>'+
      '<button class="icon-button home-more" type="button" title="Project options" aria-expanded="false">'+icon('more')+'</button>'+
      '<div class="home-project-menu" popover><button type="button" data-duplicate autofocus>'+icon('copy')+'Duplicate</button>'+
      '<button type="button" class="home-delete" data-delete>'+icon('trash')+'Delete</button></div>';
    const open=card.querySelector('.home-open');
    open.onclick=()=>actions.open(project.id);
    const title=card.querySelector('strong');
    title.textContent=project.name;
    title.title=project.name;
    const date=new Date(project.modified);
    const time=card.querySelector('time');
    time.dateTime=date.toISOString();
    time.textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(date);
    const thumbnail=card.querySelector('.home-thumbnail');
    thumbnail.innerHTML=icon('film');
    if(project.thumbnail) {
      const image=new Image();
      image.alt='';
      image.loading='lazy';
      image.onload=()=>thumbnail.replaceChildren(image);
      image.src=project.thumbnail;
    }
    const more=card.querySelector('.home-more');
    const menu=card.querySelector('.home-project-menu');
    more.setAttribute('aria-label','Options for '+project.name);
    more.onclick=()=>{
      if(menu.matches(':popover-open')) {menu.hidePopover();return;}
      const anchor=more.getBoundingClientRect();
      menu.showPopover({source:more});
      const {width,height}=menu.getBoundingClientRect();
      const below=anchor.bottom+5;
      menu.style.left=Math.max(8,Math.min(anchor.right-width,innerWidth-width-8))+'px';
      menu.style.top=(below+height<=innerHeight-8?below:Math.max(8,anchor.top-height-5))+'px';
    };
    menu.addEventListener('toggle',event=>more.setAttribute('aria-expanded',String(event.newState==='open')));
    menu.querySelector('[data-duplicate]').onclick=()=>{
      menu.hidePopover();
      actions.duplicate(project.id);
    };
    menu.querySelector('[data-delete]').onclick=()=>{
      menu.hidePopover();
      actions.remove(project);
    };
    container.append(card);
  }
}

function jpeg(source,width,height) {
  if(!width||!height) return undefined;
  const canvas=document.createElement('canvas');
  const ratio=Math.min(320/width,180/height);
  canvas.width=Math.max(1,Math.round(width*ratio));
  canvas.height=Math.max(1,Math.round(height*ratio));
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.78);
}

export async function projectThumbnail(project,frame,canvas,player) {
  const active=compositionAt(project,frame);
  if(active.some(({clip,asset})=>{
    if(clip.kind==='text'&&clip.text.trim()) return true;
    if(clip.kind==='audio') return false;
    const element=player.sources.get(clip.kind==='image'?asset?.id:clip.id)?.element;
    return element instanceof HTMLImageElement?element.complete&&element.naturalWidth:
      element?.readyState>=2&&!element.seeking;
  })) return jpeg(canvas,canvas.width,canvas.height);
  const assets=new Map(project.assets.map(asset=>[asset.id,asset]));
  const first=project.tracks.filter(track=>track.enabled).flatMap(track=>track.clips)
    .sort((a,b)=>a.start-b.start).map(clip=>assets.get(clip.assetId))
    .find(asset=>asset?.url&&['image','video'].includes(asset.kind));
  if(!first) return undefined;
  const url=first.kind==='video'?await mediaPreview(first):first.url;
  if(!url) return undefined;
  const image=new Image();
  image.src=url;
  await image.decode();
  return jpeg(image,image.naturalWidth,image.naturalHeight);
}
