import type {Asset, Clip, Project} from './types.js';
interface MediaSource {
  element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  url: string; gain?: GainNode; frame?: HTMLCanvasElement; pending?: boolean;
}

import {FPS,timing} from './model.js';
import {layoutText} from './text-layout.js';

export function compositionAt(project: Project,frame: number) {
  const assets=new Map(project.assets.map(asset=>[asset.id,asset]));
  const layers=[];
  for(const track of [...project.tracks].reverse()) {
    if(!track.enabled) continue;
    for(const clip of track.clips) {
      if(frame<clip.start||frame>=timing(clip)) continue;
      const elapsed=frame-clip.start;
      const remaining=clip.length-1-elapsed;
      const fade=Math.min(1,clip.fadeIn?elapsed/clip.fadeIn:1,clip.fadeOut?remaining/clip.fadeOut:1);
      layers.push({clip,asset:assets.get(clip.assetId),sourceTime:(elapsed+clip.in)/FPS,
        muted:track.muted===true||clip.muted===true,fade});
    }
  }
  return layers;
}

export class Player {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  sources: Map<string, MediaSource>;
  onDraw: () => void;
  muted: boolean;
  audio?: AudioContext;
  destination?: MediaStreamAudioDestinationNode;

  constructor(canvas: HTMLCanvasElement, onDraw = () => {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', {alpha:false});
    this.sources = new Map();
    this.onDraw = onDraw;
    this.muted = false;
  }

  source(clip: Clip,asset?: Asset): MediaSource {
    if (!asset?.url) return null;
    const key = clip.kind === 'image' ? asset.id : clip.id;
    const existing = this.sources.get(key);
    if (existing?.url === asset.url) return existing;
    if (existing) this.release(existing);
    const element = clip.kind === 'image' ? new Image() : document.createElement(clip.kind === 'audio' ? 'audio' : 'video');
    const entry: MediaSource = {element,url:asset.url};
    this.sources.set(key,entry);
    for (const event of ['load','loadeddata','seeked']) element.addEventListener(event,this.onDraw);
    if (element instanceof HTMLMediaElement) {
      element.preload = 'auto';
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      if (this.audio) {
        entry.gain = this.audio.createGain();
        this.audio.createMediaElementSource(element).connect(entry.gain).connect(this.destination);
      }
    }
    element.src = asset.url;
    return entry;
  }

  release({element,gain}: MediaSource) {
    if (element instanceof HTMLMediaElement) {
      element.pause();
      element.removeAttribute('src');
      element.load();
      gain?.disconnect();
    }
  }

  dispose() {
    for (const source of this.sources.values()) this.release(source);
    this.sources.clear();
    this.audio?.close().catch(()=>{});
  }

  reconcile(project: Project) {
    const ids = new Set(project.tracks.flatMap(track=>track.clips.map(clip=>clip.kind==='image'?clip.assetId:clip.id)));
    for (const [key,source] of this.sources) {
      if (ids.has(key)) continue;
      this.release(source);
      this.sources.delete(key);
    }
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (track.enabled) this.source(clip,project.assets.find(asset=>asset.id===clip.assetId));
      }
    }
  }

  render(project: Project,frame: number,playing = false,force = false) {
    const {canvas,context:ctx} = this;
    const {width,height} = project;
    if (canvas.width!==width) canvas.width=width;
    if (canvas.height!==height) canvas.height=height;
    ctx.fillStyle=project.color;
    ctx.fillRect(0,0,width,height);
    const active = new Set();

    for (const {clip,asset,sourceTime,muted:layerMuted,fade} of compositionAt(project,frame)) {
        const entry = this.source(clip,asset);
        const media = entry?.element;
        if (media instanceof HTMLMediaElement) {
          const time = sourceTime;
          // Retain the decoded frame before a seek invalidates readyState.
          if (media instanceof HTMLVideoElement && media.readyState>=2 && !media.seeking) {
            entry.frame ??= document.createElement('canvas');
            if (entry.frame.width!==media.videoWidth) entry.frame.width=media.videoWidth;
            if (entry.frame.height!==media.videoHeight) entry.frame.height=media.videoHeight;
            entry.frame.getContext('2d').drawImage(media,0,0);
          }
          const muted=this.muted||layerMuted;
          if (entry.gain) entry.gain.gain.value=muted?0:clip.volume/100*fade;
          else {
            media.muted=muted;
            media.volume=clip.volume/100*fade;
          }
          if (media.readyState && !media.seeking && Math.abs(media.currentTime-time)>(playing && !force ? .3 : .001)) media.currentTime=time;
          active.add(media);
          if (playing && media.paused && !entry.pending) {
            entry.pending=true;
            media.play().catch(()=>{}).finally(()=>{entry.pending=false;});
          } else if (!playing) media.pause();
        }
        if (clip.kind==='audio') continue;
        ctx.save();
        ctx.translate(width/2+clip.x,height/2+clip.y);
        ctx.scale(clip.scale/100,clip.scale/100);
        ctx.globalAlpha=clip.opacity/100*fade;
        if (clip.kind==='text') {
          ctx.fillStyle=clip.color;
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          const {lines,spacing,width:boxWidth,height:boxHeight}=layoutText(ctx,clip);
          if(clip.textHeight!=null) {
            ctx.beginPath();
            ctx.rect(-boxWidth/2-1,-boxHeight/2,boxWidth+2,boxHeight);
            ctx.clip();
          }
          const firstLine=(clip.fontSize-boxHeight)/2;
          lines.forEach((line,i)=>ctx.fillText(line,0,firstLine+i*spacing));
        } else {
          const w = media instanceof HTMLImageElement ? media.naturalWidth : media instanceof HTMLVideoElement ? media.videoWidth : 0;
          const h = media instanceof HTMLImageElement ? media.naturalHeight : media instanceof HTMLVideoElement ? media.videoHeight : 0;
          const drawable=media instanceof HTMLVideoElement && (media.seeking || media.readyState<2) ? entry.frame : media;
          if (w && h && drawable) {
            const scale = Math.min(width/w,height/h);
            ctx.drawImage(drawable as CanvasImageSource,-w*scale/2,-h*scale/2,w*scale,h*scale);
          }
        }
        ctx.restore();
    }
    for (const {element} of this.sources.values()) {
      if (element instanceof HTMLMediaElement && !active.has(element)) element.pause();
    }
  }
}

function hasExportAudio(project: Project) {
  return project.tracks.some(track=>track.enabled&&track.clips.some(clip=>clip.kind==='audio'||clip.kind==='video'));
}

export function exportFormats(project: Project) {
  if(typeof MediaRecorder==='undefined') return [];
  const mp4=hasExportAudio(project)?'video/mp4;codecs=avc1,mp4a.40.2':'video/mp4;codecs=avc1';
  return [
    {extension:'mp4',label:'MP4 (H.264)',mimeType:mp4,contentType:'video/mp4'},
    {extension:'webm',label:'WebM',mimeType:'video/webm',contentType:'video/webm'},
  ].filter(format=>MediaRecorder.isTypeSupported(format.mimeType));
}

function waitForMedia(element: HTMLMediaElement,event: string,signal: AbortSignal,start?: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve,reject)=>{
    const controller=new AbortController();
    const done=(error?: unknown)=>{
      controller.abort();
      clearTimeout(timeout);
      if(error) reject(error);
      else resolve();
    };
    const timeout=setTimeout(()=>done(Error('Timed out preparing source media.')),12000);
    const options={once:true,signal:controller.signal};
    signal.addEventListener('abort',()=>done(signal.reason),options);
    element.addEventListener(event,()=>done(),options);
    element.addEventListener('error',()=>done(Error('A source file could not be decoded.')),options);
    try {
      if(element.error) done(Error('A source file could not be decoded.'));
      else start?.();
    } catch(error) {done(error);}
  });
}

export async function record(project: Project,frames: number,mimeType: string,onProgress: (progress: number) => void,signal: AbortSignal,writeChunk?: (bytes: Uint8Array) => Promise<void>,videoBitsPerSecond=10_000_000): Promise<Blob | null> {
  const canvas=document.createElement('canvas');
  const player=new Player(canvas);
  const hasAudio=hasExportAudio(project);
  let stream: MediaStream;
  let animation: number;
  let recorder: MediaRecorder;
  const preparation=new AbortController();
  const preparing=AbortSignal.any([signal,preparation.signal]);
  let writes=Promise.resolve();
  let writeError;
  try {
    if (hasAudio) {
      player.audio=new AudioContext();
      player.destination=player.audio.createMediaStreamDestination();
      await player.audio.resume();
    }
    if (signal.aborted) throw new DOMException('Export canceled','AbortError');
    player.reconcile(project);
    await Promise.all([...player.sources.values()].map(({element})=>{
      if (element instanceof HTMLImageElement) return element.decode();
      if (element.readyState>=2) return null;
      return waitForMedia(element,'loadeddata',preparing);
    }));
    await Promise.all(compositionAt(project,0).map(({clip,asset,sourceTime})=>{
      const element=player.source(clip,asset)?.element;
      if(!(element instanceof HTMLMediaElement)||Math.abs(element.currentTime-sourceTime)<=.001) return;
      return waitForMedia(element,'seeked',preparing,()=>{element.currentTime=sourceTime;});
    }));
    if (signal.aborted) throw new DOMException('Export canceled','AbortError');
    player.render(project,0);
    stream=canvas.captureStream(FPS);
    if (hasAudio) for (const track of player.destination.stream.getAudioTracks()) stream.addTrack(track);
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond});
    const chunks: Blob[]=[];
    recorder.ondataavailable=event=>{
      if(!event.data.size) return;
      if(!writeChunk) {chunks.push(event.data);return;}
      writes=writes.then(async()=>{
        if(!signal.aborted&&!writeError) await writeChunk(new Uint8Array(await event.data.arrayBuffer()));
      }).catch(error=>{
        writeError=error;
        cancelAnimationFrame(animation);
        if(recorder.state!=='inactive') recorder.stop();
      });
    };
    return await new Promise((resolve,reject)=>{
      const fail=error=>{
        signal.removeEventListener('abort',abort);
        cancelAnimationFrame(animation);
        if (recorder.state!=='inactive') recorder.stop();
        reject(error);
      };
      const abort=()=>fail(signal.reason);
      signal.addEventListener('abort',abort,{once:true});
      recorder.onerror=event=>fail((event as Event & {error?: DOMException}).error ?? Error('Video encoding failed.'));
      recorder.onstop=async ()=>{
        await writes;
        signal.removeEventListener('abort',abort);
        if(signal.aborted) reject(signal.reason);
        else if(writeError) reject(writeError);
        else if(writeChunk) resolve(null);
        else if(!chunks.length) reject(Error('The encoder did not produce any video.'));
        else resolve(new Blob(chunks,{type:chunks[0].type||recorder.mimeType}));
      };
      recorder.start(1000);
      const start=performance.now();
      let last=-1;
      const draw=now=>{
        try {
          const frame=Math.floor((now-start)*FPS/1000);
          if (frame>=frames) {recorder.stop();return;}
          if (frame!==last) {
            last=frame;
            player.render(project,frame,true);
            onProgress(frame/frames);
          }
          animation=requestAnimationFrame(draw);
        } catch(error) {
          fail(error);
        }
      };
      draw(start);
    });
  } finally {
    preparation.abort();
    cancelAnimationFrame(animation);
    if(recorder) recorder.ondataavailable=null;
    await writes;
    stream?.getTracks().forEach(track=>track.stop());
    player.dispose();
  }
}
