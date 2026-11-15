
import {createClip,createProject,createTrack,FPS,id} from './model.js';

export function sampleProject() {
  const project=createProject('After Hours');
  project.tracks=['text','video','audio'].map(kind=>createTrack(kind));
  project.color='#181229';
  const media=[
    {name:'Nightfall.png',file:'nightfall.png',kind:'image',frames:FPS*8},
    {name:'Violet haze.png',file:'violet.png',kind:'image',frames:FPS*7},
    {name:'Blue hour.png',file:'blue.png',kind:'image',frames:FPS*9},
    {name:'Night ambience.wav',file:'ambience.wav',kind:'audio',frames:FPS*24}
  ].map(asset=>({...asset,id:id(),url:'assets/'+asset.file}));
  project.assets=media;
  project.tracks[0].clips=[{...createClip(null,FPS),name:'After Hours',text:'AFTER HOURS',fontSize:136,y:-40,length:FPS*6},{...createClip(null,FPS*15),name:'End title',text:'THE NIGHT IS OURS',fontSize:96,length:FPS*5}];
  project.tracks[1].clips=[createClip(media[0]),createClip(media[1],FPS*8),createClip(media[2],FPS*15)];
  project.tracks[2].clips=[{...createClip(media[3]),volume:45}];
  return project;
}
