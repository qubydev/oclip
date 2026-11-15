const previews=new Map();
let pending=Promise.resolve();

async function thumbnail(url) {
  const video=document.createElement('video');
  try {
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Preview timed out')),5000);
      video.onloadeddata=()=>{clearTimeout(timeout);resolve();};
      video.onerror=()=>{clearTimeout(timeout);reject(Error('Preview unavailable'));};
      video.muted=true;
      video.preload='auto';
      video.src=url;
    });
    const canvas=document.createElement('canvas');
    canvas.width=128;
    canvas.height=Math.max(1,Math.round(128*video.videoHeight/video.videoWidth));
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    return canvas.toDataURL();
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

async function waveform(url) {
  const signal=AbortSignal.timeout(10000);
  const response=await fetch(url,{method:'HEAD',signal});
  const size=Number(response.headers.get('content-length'));
  if(!response.ok||!size||size>12_000_000) return null;
  const audio=await fetch(url,{signal});
  if(!audio.ok) return null;
  const context=new OfflineAudioContext(1,1,8000);
  const buffer=await context.decodeAudioData(await audio.arrayBuffer());
  const canvas=document.createElement('canvas');
  canvas.width=512;
  canvas.height=32;
  const drawing=canvas.getContext('2d');
  drawing.fillStyle='#79cdb6';
  const mono=buffer.getChannelData(0);
  for(let x=0;x<canvas.width;x++) {
    const start=Math.floor(x*mono.length/canvas.width);
    const end=Math.floor((x+1)*mono.length/canvas.width);
    let peak=0;
    for(let i=start;i<end;i++) peak=Math.max(peak,Math.abs(mono[i]));
    const height=Math.max(1,Math.min(30,Math.round(peak*30)));
    drawing.fillRect(x,(32-height)/2,1,height);
  }
  return canvas.toDataURL();
}

export function mediaPreview(asset) {
  if(asset.kind==='audio'&&asset.frames>30*60*10) return Promise.resolve(null);
  const key=asset.kind+':'+asset.url;
  if(!previews.has(key)) {
    if(previews.size>=128) previews.delete(previews.keys().next().value);
    const load=asset.kind==='video'?thumbnail:waveform;
    const result=pending.then(()=>load(asset.url)).catch(()=>null);
    pending=result;
    previews.set(key,result);
  }
  return previews.get(key);
}
