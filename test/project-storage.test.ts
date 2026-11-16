import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createProject} from '../src/model.js';

async function desktopFixture(t) {
  const temp=await mkdtemp(path.join(tmpdir(),'oclip-storage-'));
  t.after(()=>rm(temp,{force:true,recursive:true}));
  const projectStore=path.join(temp,'app-data');
  await mkdir(projectStore);
  const handlers=new Map();
  let selectedPath=temp;
  let pickerArgs;
  class Window {
    static fromWebContents() {return window;}
    webContents={setWindowOpenHandler(){},on(){}};
    setAppDetails(){}
    on(){}
    loadURL(){}
    isDestroyed(){return false;}
    focus(){}
  }
  const window=new Window();
  const electron={
    app:{whenReady:()=>Promise.resolve(),getPath:()=>projectStore,on(){},isPackaged:true},
    BrowserWindow:Window,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1040}})},Menu:{setApplicationMenu(){}},
    dialog:{showOpenDialog:async (...args)=>{
      pickerArgs=args;
      return {canceled:!selectedPath,filePaths:selectedPath?[selectedPath]:[]};
    }},
    ipcMain:{handle:(name,callback)=>handlers.set(name,callback)},
    protocol:{registerSchemesAsPrivileged(){},handle(){}},
  };
  const main=fileURLToPath(new URL('../desktop/main.cjs',import.meta.url));
  const require=createRequire(main);
  vm.runInNewContext(await readFile(main,'utf8'),{
    require:name=>name==='electron'?electron:require(name),
    __dirname:path.dirname(main),process,console,Uint8Array,exports:{},
  });
  await new Promise(resolve=>setImmediate(resolve));
  const call=(name,...args)=>handlers.get(name)({senderFrame:{url:'oclip://editor/'},sender:{}},...args);
  return {temp,projectStore,call,select:value=>{selectedPath=value;},pickerArgs:()=>pickerArgs};
}

test('managed projects reopen with media, and a saved checkpoint does not prompt for recovery',async t=>{
  const {temp,call}=await desktopFixture(t);
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
  const opened=await call('projects-open',managed.id);
  assert.equal(opened.project.name,'Example');
  assert.match(opened.project.assets[0].url,/^oclip:\/\/editor\/media\//);
  assert.equal(await readFile(opened.project.assets[0].path,'utf8'),'test media bytes');
});

test('export remembers a folder and saves without overwriting existing exports',async t=>{
  const {temp,projectStore,call,select,pickerArgs}=await desktopFixture(t);
  assert.equal(await call('export-folder'),projectStore);
  assert.equal(await call('choose-export-folder'),temp);
  assert.equal(pickerArgs().length,1);
  assert.ok(pickerArgs()[0].properties.includes('openDirectory'));
  assert.equal(JSON.parse(await readFile(path.join(projectStore,'export-folder.json'),'utf8')),temp);
  select(null);
  assert.equal(await call('choose-export-folder'),null);
  assert.equal(await call('export-folder'),temp);
  const existing=path.join(temp,'Example.mp4');
  await writeFile(existing,'existing video');
  const id=await call('begin-export','Example','mp4');
  await call('export-chunk',id,new Uint8Array([1,2,3]));
  const output=await call('finish-export',id,true);
  assert.equal(output,path.join(temp,'Example (2).mp4'));
  assert.equal(await readFile(existing,'utf8'),'existing video');
  assert.deepEqual([...await readFile(output)],[1,2,3]);
});
