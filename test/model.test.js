import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_FRAMES,applyGroupMove,planGroupMove,createClip,createProject,createTrack,editSpan,extractClipAudio,fittedZoom,id,pasteClipGroups,splitClip,timecode,timelineMetrics,validateProject} from '../src/model.js';
import {sampleProject} from '../src/sample.js';
import {closeGap,linkedSelection,planTimelineDrag,removeSelection,splitSelection} from '../src/timeline-edits.js';
import {compositionAt} from '../src/playback.js';

test('ripple delete preserves existing gaps and close gap moves the downstream clips together',()=>{
  const project=createProject();
  const track=createTrack('text');
  const first={...createClip(null,10),length:8};
  const second={...createClip(null,22),length:5};
  const third={...createClip(null,35),length:6};
  track.clips.push(first,second,third);
  project.tracks.push(track);
  removeSelection(project,[first.id],true);
  assert.deepEqual(track.clips.map(clip=>clip.start),[14,27]);
  closeGap(project,second.id);
  assert.deepEqual(track.clips.map(clip=>clip.start),[0,13]);
});

test('drag snapping skips a blocked candidate and picks a valid nearby edge',()=>{
  const project=createProject();
  const track=createTrack('text');
  const moving={...createClip(null,0),length:10};
  track.clips.push(moving,{...createClip(null,20),length:10});
  project.tracks.push(track);
  const planned=planTimelineDrag(project,[moving.id],13,0,false,[22,20],4);
  assert.equal(planned.snap,20);
  assert.equal(planned.moves[0].clip.start,10);
});

test('linked extracted audio follows its matching half after splitting both clips',()=>{
  const project=createProject();
  const video={id:id(),name:'source.mp4',kind:'video',url:'assets/source.mp4',frames:60};
  const track=createTrack('video');
  const source=createClip(video);
  project.assets.push(video);
  track.clips.push(source);
  project.tracks.push(track);
  const audio=extractClipAudio(project,source.id);
  const [rightVideo,rightAudio]=splitSelection(project,[source.id,audio.id],25);
  assert.deepEqual(linkedSelection(project,[rightAudio]),[rightAudio,rightVideo]);
  assert.deepEqual(linkedSelection(project,[source.id]),[source.id,audio.id]);
  assert.ok(validateProject(project));
});

test('composition resolves clip boundaries, source offsets, track mute and fades',()=>{
  const project=createProject();
  const track=createTrack('text');
  track.muted=true;
  const clip={...createClip(null,20),length:12,fadeIn:4,fadeOut:4};
  track.clips.push(clip);
  project.tracks.push(track);
  assert.deepEqual(compositionAt(project,19),[]);
  assert.deepEqual(compositionAt(project,32),[]);
  const [start]=compositionAt(project,22);
  assert.equal(start.sourceTime,2/30);
  assert.equal(start.fade,.5);
  assert.equal(start.muted,true);
  assert.equal(compositionAt(project,31)[0].fade,0);
});

test('group moves preserve time and track offsets and reject conflicts atomically',()=>{
  const project=createProject();
  project.tracks=Array.from({length:3},()=>createTrack('text'));
  const a={...createClip(null,20),length:10};
  const b={...createClip(null,40),length:10};
  project.tracks[0].clips.push(a);
  project.tracks[1].clips.push(b);
  const ids=[a.id,b.id];
  const before=JSON.stringify(project);
  assert.equal(planGroupMove(project,ids,0,-1),null);
  project.tracks[2].locked=true;
  assert.equal(planGroupMove(project,ids,10,1),null);
  project.tracks[2].locked=false;
  assert.equal(JSON.stringify(project),before);
  const moves=planGroupMove(project,ids,15,1);
  applyGroupMove(project,moves);
  assert.equal(project.tracks[1].clips[0].start,35);
  assert.equal(project.tracks[2].clips[0].start,55);
  assert.ok(validateProject(project));
  project.tracks[1].clips.push({...createClip(null,70),length:10});
  assert.equal(planGroupMove(project,ids,30),null);
  const bounded=planGroupMove(project,ids,-100);
  assert.deepEqual(bounded.map(move=>move.clip.start),[0,20]);
});

test('pasting multiple clips aligns the group to the playhead and preserves spacing',()=>{
  const project=createProject();
  const video=createTrack('video');
  const titles=createTrack('text');
  const asset={id:id(),kind:'video',name:'Scene.mp4',frames:180,url:'assets/scene.mp4'};
  const first={...createClip(asset,20),length:40,in:6,muted:true};
  const second={...createClip(asset,70),length:30};
  const title={...createClip(null,35),length:10};
  project.assets.push(asset);
  video.clips.push(first,second);
  titles.clips.push(title);
  titles.locked=true;
  project.tracks.push(video,titles);
  const groups=[
    {trackId:video.id,kind:video.kind,clips:[first,second]},
    {trackId:titles.id,kind:titles.kind,clips:[title]},
  ];

  assert.deepEqual(pasteClipGroups(project,groups,MAX_FRAMES-10),[]);
  assert.equal(project.tracks.length,2);
  const copies=pasteClipGroups(project,groups,40);
  assert.deepEqual(copies.map(clip=>clip.start),[40,90,55]);
  assert.equal(copies[0].in,6);
  assert.equal(copies[0].muted,true);
  assert.notEqual(copies[0].id,first.id);
  assert.deepEqual(project.tracks[2].clips,copies.slice(0,2));
  assert.equal(project.tracks[3].clips[0],copies[2]);
  assert.ok(validateProject(project));
});

test('extracting trimmed video audio preserves sync and mutes only the source clip',()=>{
  const project=createProject();
  const video=createTrack('video');
  const occupied=createTrack('audio');
  const asset={id:id(),kind:'video',name:'Scene.mp4',frames:200,url:'assets/scene.mp4'};
  const music={id:id(),kind:'audio',name:'Music.wav',frames:200,url:'assets/music.wav'};
  const clip={...createClip(asset,40),in:15,length:70,volume:65};
  const other={...createClip(asset,120),length:50};
  video.clips.push(clip,other);
  occupied.clips.push(createClip(music));
  project.assets.push(asset,music);
  project.tracks.push(video,occupied);

  const audio=extractClipAudio(project,clip.id);
  assert.deepEqual([audio.kind,audio.start,audio.in,audio.length,audio.volume],['audio',40,15,70,65]);
  assert.equal(clip.muted,true);
  assert.equal(clip.volume,65);
  assert.ok(!audio.muted);
  assert.ok(!other.muted);
  assert.equal(other.volume,100);
  assert.equal(project.assets.find(item=>item.id===audio.assetId).url,asset.url);
  assert.equal(project.tracks.at(-1).clips[0].id,audio.id);
  assert.ok(validateProject(project));
});

test('move finds the nearest nonoverlapping slot',()=>{
  const track=createTrack('video');
  const asset={id:id(),kind:'image',name:'Image',frames:40};
  track.clips.push(createClip(asset,60));
  const clip=createClip(asset);
  assert.equal(editSpan(track,clip,'move',31,asset).start,20);
  assert.equal(editSpan(track,clip,'move',90,asset).start,100);
});

test('trimming respects source in-point, media duration and adjacent clips',()=>{
  const track=createTrack('audio');
  const asset={id:id(),kind:'audio',name:'Audio',frames:90};
  const clip={...createClip(asset,100),in:12,length:30};
  track.clips.push(clip,{...createClip(asset,155),length:15});
  const left=editSpan(track,clip,'left',0,asset);
  assert.deepEqual([left.start,left.in,left.length],[88,0,42]);
  assert.equal(editSpan(track,clip,'right',300,asset).length,55);
  assert.equal(editSpan({...track,clips:[clip]},clip,'right',300,asset).length,78);
});

test('split preserves source continuity at the exact frame',()=>{
  const asset={id:id(),kind:'video',name:'Shot',frames:90};
  const clip={...createClip(asset,60),in:10,length:70};
  const [left,right]=splitClip(clip,83);
  assert.deepEqual([left.length,right.start,right.in,right.length],[23,83,33,47]);
  assert.equal(splitClip(clip,60),null);
});

test('sample validates and corrupted spans are rejected',()=>{
  const project=sampleProject();
  assert.equal(validateProject(project),true);
  project.tracks[1].clips[1].start--;
  assert.equal(validateProject(project),false);
});

test('adding media changes timeline width without changing scale',()=>{
  const short=timelineMetrics(1000,600,44);
  const long=timelineMetrics(1000,7200,44);
  assert.equal(short.pixels,long.pixels);
  assert.ok(long.width>short.width);
  const fit=timelineMetrics(1000,108000,fittedZoom(108000));
  assert.ok(108000*fit.pixels<=1000);
  assert.equal(timecode(108000,true),'01:00:00');
});

test('an overlapping drop creates an upper track and keeps both clip start times',async()=>{
  const {planPlacement,placeClip}=await import('../src/model.js');
  const project=createProject();
  assert.deepEqual(project.tracks,[]);
  assert.equal(validateProject(project),true);
  project.tracks=['text','video','audio'].map(kind=>createTrack(kind));
  const asset={id:id(),kind:'image',name:'Image',frames:40,url:'assets/image.png'};
  project.assets.push(asset);
  const video=project.tracks[1];
  const original=createClip(asset,30);
  video.clips.push(original);
  const dropped=createClip(asset);
  assert.equal(planPlacement(project.tracks,dropped,70,video).track,video);
  placeClip(project,planPlacement(project.tracks,dropped,45,video));
  assert.equal(project.tracks[1].clips[0].start,45);
  assert.equal(project.tracks[2].clips[0].start,30);
  assert.equal(validateProject(project),true);
  const moved=planPlacement(project.tracks,dropped,80,video);
  placeClip(project,moved);
  assert.equal(project.tracks[1].clips.length,0);
  assert.equal(video.clips.length,2);
  assert.equal(validateProject(project),true);
});
