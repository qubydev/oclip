import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createProject} from '../src/model.js';

test('collected projects reopen after moving, and a saved checkpoint does not prompt for recovery',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'oclip-storage-'));
  t.after(()=>rm(temp,{force:true,recursive:true}));
  const projectStore=path.join(temp,'app-data');
  await mkdir(projectStore);
  const handlers=new Map();
  let selectedPath=temp;
  class Window {
    static fromWebContents() {return window;}
    webContents={setWindowOpenHandler(){},on(){}};
    setAppDetails(){}
    on(){}
    loadURL(){}
  }
  const window=new Window();
  const electron={
    app:{whenReady:()=>Promise.resolve(),getPath:()=>projectStore,on(){},isPackaged:true},
    BrowserWindow:Window,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1040}})},Menu:{setApplicationMenu(){}},
    dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selectedPath]})},
    ipcMain:{handle:(name,callback)=>handlers.set(name,callback)},
    protocol:{registerSchemesAsPrivileged(){},handle(){}},
  };
  const main=fileURLToPath(new URL('../desktop/main.cjs',import.meta.url));
  const require=createRequire(main);
  vm.runInNewContext(await readFile(main,'utf8'),{
    require:name=>name==='electron'?electron:require(name),
    __dirname:path.dirname(main),process,console,
  });
  await new Promise(resolve=>setImmediate(resolve));
  const call=(name,...args)=>handlers.get(name)({senderFrame:{url:'oclip://editor/'},sender:{}},...args);
  const source=path.join(temp,'original.wav');
  await writeFile(source,'test media bytes');
  const project=createProject('Example');
  project.assets.push({id:'source',name:'original.wav',kind:'audio',frames:30,path:source,url:''});
  const managed=await call('projects-create',project);
  await call('project-path',managed.file);
  await call('checkpoint',project,{frame:0});
  assert.equal(await call('recover'),null);
  const unsaved={...project,name:'Unsaved edit'};
  await call('checkpoint',unsaved,{frame:4});
  assert.equal((await call('recover')).project.name,'Unsaved edit');
  const copy=await call('projects-collect',managed.id);
  const manifest=JSON.parse(await readFile(copy.file,'utf8'));
  assert.equal(manifest.assets[0].path,'media/1-original.wav');
  const moved=path.join(temp,'moved-project');
  await rename(copy.folder,moved);
  await rm(source);
  selectedPath=path.join(moved,'Project.oclip');
  const opened=await call('open');
  assert.match(opened.project.assets[0].url,/^oclip:\/\/editor\/media\//);
  assert.equal(await readFile(opened.project.assets[0].path,'utf8'),'test media bytes');
});
