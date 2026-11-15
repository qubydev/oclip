import {findClip, splitClip, timing, planGroupMove} from './model.js';

export function splitSelection(project, ids, frame) {
  const rightIds=new Map();
  const selection=ids.map(id=>{
    const context=findClip(project,id);
    if(!context||context.track.locked) return id;
    const {track,clip}=context;
    const pieces=splitClip(clip,frame);
    if(!pieces) return id;
    track.clips.splice(track.clips.indexOf(clip),1,...pieces);
    rightIds.set(id,pieces[1].id);
    return pieces[1].id;
  });
  for(const rightId of rightIds.values()) {
    const {clip}=findClip(project,rightId);
    if(!clip.audioFor) continue;
    if(rightIds.has(clip.audioFor)) clip.audioFor=rightIds.get(clip.audioFor);
    else delete clip.audioFor;
  }
  return selection;
}

export function removeSelection(project, ids, ripple=false) {
  const selected=new Set(ids);
  for(const track of project.tracks) {
    if(track.locked) continue;
    if(!track.clips.some(clip=>selected.has(clip.id))) continue;
    if(!ripple) {
      track.clips=track.clips.filter(clip=>!selected.has(clip.id));
      continue;
    }
    let shift=0;
    const kept=[];
    for(const clip of [...track.clips].sort((a,b)=>a.start-b.start)) {
      if(selected.has(clip.id)) shift+=clip.length;
      else kept.push(shift?{...clip,start:clip.start-shift}:clip);
    }
    track.clips=kept;
  }
}

export function closeGap(project,id) {
  const context=findClip(project,id);
  if(!context||context.track.locked) return;
  const {clip,track}=context;
  const preceding=track.clips.reduce((end,item)=>timing(item)<=clip.start?Math.max(end,timing(item)):end,0);
  const gap=clip.start-preceding;
  track.clips=track.clips.map(item=>item.start>=clip.start?{...item,start:item.start-gap}:item);
}

export function linkedSelection(project,ids) {
  const selected=new Set(ids);
  for(const track of project.tracks) {
    for(const clip of track.clips) {
      if(!clip.audioFor||!findClip(project,clip.audioFor)) continue;
      if(selected.has(clip.id)||selected.has(clip.audioFor)) {
        selected.add(clip.id);
        selected.add(clip.audioFor);
      }
    }
  }
  return [...selected];
}

export function planTimelineDrag(project, ids, delta, offset, append, targets, radius) {
  const candidates=[];
  if(radius>0) {
    for(const id of ids) {
      const {clip}=findClip(project,id);
      for(const edge of [clip.start,timing(clip)]) {
        for(const target of targets) {
          const shift=target-edge-delta;
          if(Math.abs(shift)<=radius) candidates.push({shift,target,edge});
        }
      }
    }
    candidates.sort((a,b)=>Math.abs(a.shift)-Math.abs(b.shift));
  }
  for(const {shift,target,edge} of candidates) {
    const moves=planGroupMove(project,ids,delta+shift,offset,append);
    if(moves&&moves[0].clip.start-findClip(project,ids[0]).clip.start===target-edge) return {moves,snap:target};
  }
  return {moves:planGroupMove(project,ids,delta,offset,append),snap:null};
}
