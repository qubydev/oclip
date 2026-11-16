import type {Asset, Clip, ClipKind, Track, TrackKind, Project, ClipContext, Placement, ClipGroup, ClipMove} from './types.js';

export const FPS = 30;
export const MAX_FRAMES = 60 * 60 * FPS;
export const id = (): string => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const timing = (clip: Clip) => clip.start + clip.length;
export const duration = (project: Project) => project.tracks.reduce((end,track)=>
  track.clips.reduce((maximum,clip)=>Math.max(maximum,timing(clip)),end),0);
export const dimensions: [number, number, string][] = [[1920,1080,'16:9'],[1080,1920,'9:16'],[1080,1080,'1:1'],[1080,1350,'4:5'],[1080,1440,'3:4']];
const trackTypes: Record<TrackKind, [string, string]> = {text:['Text','text'],video:['Video','film'],audio:['Audio','music']};

export function createTrack(kind: TrackKind, tracks: Track[]=[]): Track {
  const [label,icon]=trackTypes[kind];
  let name=label;
  let number=2;
  const names=new Set(tracks.map(track=>track.name));
  while(names.has(name)) name=label+' '+number++;
  return {id:id(),kind,name,icon,enabled:true,locked:false,clips:[]};
}

export function createProject(name = 'Untitled project'): Project {
  return {version:1,name,width:1920,height:1080,color:'#111216',assets:[],tracks:[]};
}

export function planPlacement(tracks: Track[], clip: Clip, position: number, target: Track=null): Placement {
  if(target?.locked) return null;
  const edit={...clip,start:clamp(Math.round(position),0,MAX_FRAMES-clip.length)};
  const fits=track=>!track.locked&&accepts(track,clip.kind)&&track.clips.every(item=>
    item.id===clip.id||timing(item)<=edit.start||item.start>=timing(edit));
  const track=target ? (fits(target)?target:null) : tracks.findLast(fits);
  const kind=clip.kind==='image'?'video':clip.kind;
  const above=target??tracks.find(item=>item.kind===kind);
  return {edit,track,newIndex:above?tracks.indexOf(above):tracks.length,kind};
}

export function placeClip(project: Project, placement: Placement) {
  const {edit,track,newIndex,kind}=placement;
  const source=findClip(project,edit.id)?.track;
  if(source) source.clips=source.clips.filter(clip=>clip.id!==edit.id);
  const destination=track?project.tracks.find(item=>item.id===track.id):createTrack(kind,project.tracks);
  if(!track) project.tracks.splice(newIndex,0,destination);
  destination.clips.push(edit);
}

export function pasteClipGroups(project: Project, groups: ClipGroup[], frame: number): Clip[] {
  const clips=groups.flatMap(group=>group.clips);
  if(!clips.length) return [];
  const first=clips.reduce((earliest,clip)=>Math.min(earliest,clip.start),MAX_FRAMES);
  const offset=frame-first;
  if(clips.some(clip=>timing(clip)+offset>MAX_FRAMES)) return [];
  const needsTracks=groups.some(({trackId,clips})=>{
    const track=project.tracks.find(item=>item.id===trackId);
    return !track||track.locked||clips.some(clip=>track.clips.some(existing=>
      clip.start+offset<timing(existing)&&timing(clip)+offset>existing.start));
  });
  const sourceIndices=groups.map(group=>project.tracks.findIndex(track=>track.id===group.trackId)).filter(index=>index>=0);
  const copyIds=new Map(clips.map(clip=>[clip.id,id()]));
  let insertAt=sourceIndices.length?Math.max(...sourceIndices)+1:project.tracks.length;
  return groups.flatMap(({trackId,kind,clips})=>{
    const copies=clips.map(clip=>{
      const copy={...clip,id:copyIds.get(clip.id),start:clip.start+offset};
      if(copyIds.has(clip.audioFor)) copy.audioFor=copyIds.get(clip.audioFor);
      else delete copy.audioFor;
      return copy;
    });
    const source=project.tracks.find(track=>track.id===trackId);
    const fits=!needsTracks;
    const destination=fits?source:createTrack(kind,project.tracks);
    if(!fits) project.tracks.splice(insertAt++,0,destination);
    destination.clips.push(...copies);
    return copies;
  });
}

export function planGroupMove(project: Project, ids: string[], delta: number, trackOffset=0, append=false): ClipMove[] {
  const selected=new Set(ids);
  const contexts=ids.map(id=>findClip(project,id));
  if(contexts.some(item=>!item||item.track.locked)) return null;
  const min=-Math.min(...contexts.map(item=>item.clip.start));
  const max=MAX_FRAMES-Math.max(...contexts.map(item=>timing(item.clip)));
  delta=clamp(Math.round(delta),min,max);
  const destinations=new Map<string, Track>();
  if(append) {
    for(const track of project.tracks) {
      if(contexts.some(item=>item.track===track)) destinations.set(track.id,createTrack(track.kind,[...project.tracks,...destinations.values()]));
    }
  }
  const moves=contexts.map(({clip,track})=>({
    clip:{...clip,start:clip.start+delta},
    track:append?destinations.get(track.id):project.tracks[project.tracks.indexOf(track)+trackOffset],
  }));
  if(moves.some(({clip,track})=>!track||track.locked||!accepts(track,clip.kind)||
    track.clips.some(other=>!selected.has(other.id)&&clip.start<timing(other)&&timing(clip)>other.start))) return null;
  return moves;
}

export function applyGroupMove(project: Project, moves: ClipMove[]) {
  const ids=new Set(moves.map(move=>move.clip.id));
  for(const track of project.tracks) track.clips=track.clips.filter(clip=>!ids.has(clip.id));
  for(const {clip,track} of moves) {
    let destination=project.tracks.find(item=>item.id===track.id);
    if(!destination) {
      destination={...track,clips:[]};
      project.tracks.push(destination);
    }
    destination.clips.push(clip);
  }
}

export const MAX_TEXT_BOX_SIZE=32768;

export function createClip(asset: Asset | null, start = 0): Clip {
  return {id:id(),assetId:asset?.id ?? null,kind:asset?.kind ?? 'text',name:asset?.name ?? 'Title',start,length:asset?.frames ?? FPS*4,in:0,x:0,y:0,scale:100,opacity:100,volume:100,text:'Your title',fontSize:84,color:'#ffffff'};
}

export function findClip(project: Project, clipId: string): ClipContext {
  for (const track of project.tracks) {
    const clip = track.clips.find(item => item.id === clipId);
    if (clip) return {clip,track,asset:project.assets.find(item => item.id === clip.assetId)};
  }
  return null;
}

export function extractClipAudio(project: Project, clipId: string): Clip {
  const context = findClip(project, clipId);
  if (!context || context.track.locked || context.clip.kind !== 'video' || !context.asset?.url) return null;
  const {clip,asset} = context;
  const audio: Asset = {...asset,id:id(),kind:'audio',name:asset.name+' (audio)'};
  const audioClip = {...createClip(audio,clip.start),in:clip.in,length:clip.length,volume:clip.volume,audioFor:clip.id};
  const placement = planPlacement(project.tracks.filter(track=>track.enabled),audioClip,clip.start);
  if (!placement.track) placement.newIndex=project.tracks.length;
  project.assets.push(audio);
  placeClip(project,placement);
  clip.muted=true;
  return audioClip;
}

export function accepts(track: Track, kind: ClipKind) {
  return track.kind === kind || (track.kind === 'video' && kind === 'image');
}

export function bounds(track: Track, clip: Clip, mode: string, position = clip.start): number | [number, number] {
  const rest = track.clips.filter(item => item.id !== clip.id).sort((a,b)=>a.start-b.start);
  if (mode === 'move') {
    const gaps = [];
    let cursor = 0;
    for (const item of rest) {
      if (item.start - cursor >= clip.length) gaps.push([cursor,item.start-clip.length]);
      cursor = Math.max(cursor,timing(item));
    }
    if (MAX_FRAMES - cursor >= clip.length) gaps.push([cursor,MAX_FRAMES-clip.length]);
    const values = gaps.map(([min,max]) => clamp(position,min,max));
    values.sort((a,b)=>Math.abs(a-position)-Math.abs(b-position));
    return values[0] ?? null;
  }
  const previous = Math.max(0,...rest.filter(item => timing(item)<=clip.start).map(timing));
  const next = Math.min(MAX_FRAMES,...rest.filter(item => item.start>=timing(clip)).map(item=>item.start));
  return [previous,next];
}

export function editSpan(track: Track, clip: Clip, mode: string, position: number, asset?: Asset): Clip {
  const frame = Math.round(Number(position));
  if (!Number.isFinite(frame)) return clip;
  if (mode === 'move') {
    const start = bounds(track,clip,mode,frame) as number | null;
    return start === null ? null : {...clip,start};
  }
  const [previous,next] = bounds(track,clip,mode) as [number, number];
  const sourceLength = /^(video|audio)$/.test(clip.kind) ? asset?.frames ?? timing(clip)-clip.start+clip.in : Infinity;
  if (mode === 'left') {
    const start = clamp(frame,Math.max(previous,Number.isFinite(sourceLength) ? clip.start-clip.in : 0),timing(clip)-1);
    const delta = start - clip.start;
    return {...clip,start,length:clip.length-delta,in:Number.isFinite(sourceLength) ? clip.in+delta : 0};
  }
  const end = clamp(frame,clip.start+1,Math.min(next,clip.start+sourceLength-clip.in));
  return {...clip,length:end-clip.start};
}

export function splitClip(clip: Clip, frame: number): [Clip, Clip] | null {
  if (frame<=clip.start || frame>=timing(clip)) return null;
  const length = frame-clip.start;
  const input = /^(audio|video)$/.test(clip.kind) ? clip.in+length : 0;
  return [{...clip,length},{...clip,id:id(),start:frame,length:clip.length-length,in:input}];
}

export function timelineMetrics(available: number, frames: number, zoom: number) {
  const baseline = FPS * 27;
  const pixels = available / baseline * 2 ** ((zoom - 44) / 21);
  const span = Math.max(baseline, frames + FPS);
  return {pixels, width:Math.max(available,Math.ceil(span * pixels))};
}

export function fittedZoom(frames: number) {
  const baseline = FPS * 27;
  return Math.floor(44 + 21 * Math.log2(baseline / Math.max(baseline, frames + FPS)));
}

export function timecode(frame: number, short = false) {
  const parts = [Math.floor(frame/(3600*FPS)),Math.floor(frame/(60*FPS))%60,Math.floor(frame/FPS)%60,frame%FPS];
  return (short ? parts.slice(parts[0] ? 0 : 1,3) : parts).map(n=>String(n).padStart(2,'0')).join(':');
}

export function validateProject(project: Project): boolean {
  const integer = (n,min,max) => Number.isInteger(n) && n>=min && n<=max;
  const color = value => /^#[a-f\d]{6}$/i.test(value);
  if (!project || project.version !== 1 || typeof project.name !== 'string' ||
      !integer(project.width,64,3840) || !integer(project.height,64,3840) || !color(project.color) ||
      !Array.isArray(project.assets) || !Array.isArray(project.tracks)) return false;
  const assets = new Map<string, Asset>();
  for (const asset of project.assets) {
    if (!asset || typeof asset.id!=='string' || assets.has(asset.id) || typeof asset.name!=='string' || typeof asset.url!=='string' ||
        !['image','audio','video'].includes(asset.kind) || !integer(asset.frames,1,MAX_FRAMES) ||
        (asset.url && !/^(?:oclip:\/\/editor\/media\/[a-f0-9-]+|assets\/[\w.-]+)$/.test(asset.url))) return false;
    assets.set(asset.id,asset);
  }
  const seen = new Set();
  return project.tracks.every(track=>{
    if (!track || typeof track.id!=='string' || seen.has(track.id) || !Object.hasOwn(trackTypes,track.kind) ||
        typeof track.name!=='string' || track.icon!==trackTypes[track.kind][1] ||
        typeof track.enabled!=='boolean' || typeof track.locked!=='boolean' ||
        (track.muted!==undefined&&typeof track.muted!=='boolean') || !Array.isArray(track.clips)) return false;
    seen.add(track.id);
    let end = 0;
    return [...track.clips].sort((a,b)=>(a?.start??0)-(b?.start??0)).every(clip=>{
      if (!clip || typeof clip.id!=='string' || seen.has(clip.id) || !accepts(track,clip.kind) ||
          typeof clip.name!=='string' || typeof clip.text!=='string' || !color(clip.color) ||
          !integer(clip.start,end,MAX_FRAMES-1) || !integer(clip.length,1,MAX_FRAMES-clip.start) ||
          !integer(clip.in,0,MAX_FRAMES) || !integer(clip.x,-3840,3840) || !integer(clip.y,-3840,3840) ||
          !integer(clip.scale,1,400) || !integer(clip.opacity,0,100) || !integer(clip.volume,0,100) ||
          (clip.muted!==undefined&&typeof clip.muted!=='boolean') ||
          (clip.audioFor!==undefined&&(clip.kind!=='audio'||typeof clip.audioFor!=='string')) ||
          (clip.fadeIn!==undefined&&!integer(clip.fadeIn,0,MAX_FRAMES)) ||
          (clip.fadeOut!==undefined&&!integer(clip.fadeOut,0,MAX_FRAMES)) ||
          !integer(clip.fontSize,8,500) ||
          (clip.textWidth!=null&&!integer(clip.textWidth,1,MAX_TEXT_BOX_SIZE)) ||
          (clip.textHeight!=null&&!integer(clip.textHeight,1,MAX_TEXT_BOX_SIZE))) return false;
      const asset = assets.get(clip.assetId);
      if (clip.kind!=='text' && asset?.kind!==clip.kind) return false;
      if ((clip.kind==='audio'||clip.kind==='video') && clip.in+clip.length>asset.frames) return false;
      seen.add(clip.id);
      end = timing(clip);
      return true;
    });
  });
}
