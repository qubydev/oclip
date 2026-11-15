const {app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell} = require('electron');
const {readFile, writeFile, appendFile, stat, rename, rm, mkdir, readdir, mkdtemp, copyFile, rmdir} = require('node:fs/promises');
const {isDeepStrictEqual} = require('node:util');
const {createReadStream, watch} = require('node:fs');
const {Readable} = require('node:stream');
const {randomUUID} = require('node:crypto');
const path = require('node:path');

const root = path.join(__dirname, '..');
const development = !app.isPackaged && process.argv.includes('--oclip-dev');
const media = new Map();
const mediaByPath=new Map();
const types = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', m4v:'video/mp4', wav:'audio/wav', mp3:'audio/mpeg', ogg:'audio/ogg', m4a:'audio/mp4', aac:'audio/aac', flac:'audio/flac'};
const mediaExtensions = Object.keys(types);
const audioExtensions = mediaExtensions.filter(extension => types[extension].startsWith('audio/'));
const bundledAssets = new Set(['assets/nightfall.png','assets/violet.png','assets/blue.png','assets/ambience.wav']);
const bundledTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const pngIcon = path.join(root,'assets','oclip.png');
const windowIcon = process.platform === 'win32' ? path.join(root,'assets','oclip.ico') : pngIcon;
const projects = [{name:'Oclip project', extensions:['oclip']}];
const origin = 'oclip://editor';
protocol.registerSchemesAsPrivileged([{scheme:'oclip', privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);

async function register(file) {
  const type = types[path.extname(file).slice(1).toLowerCase()];
  if (!type || !path.isAbsolute(file) || !(await stat(file)).isFile()) throw Error('Unsupported media file.');
  const normalized=path.normalize(file);
  let key=mediaByPath.get(normalized);
  if(!key) {
    key=randomUUID();
    mediaByPath.set(normalized,key);
    media.set(key,{file:normalized,type});
  }
  return {name:path.basename(file), path:file, kind:type.split('/')[0], url:origin + '/media/' + key};
}

async function stream(request, entry) {
  if (!entry) return new Response(null,{status:404});
  const {size} = await stat(entry.file);
  if (!size) return new Response(null,{status:404});
  const headers = {'Content-Type':entry.type,'Accept-Ranges':'bytes'};
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else if (range[2]) start = Math.max(0, size - Number(range[2]));
    if (start > end) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
    headers['Content-Range'] = 'bytes '+start+'-'+end+'/'+size;
  }
  headers['Content-Length'] = String(end-start+1);
  const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(entry.file,{start,end}));
  return new Response(body,{status:range?206:200,headers});
}

async function atomicWrite(file, value) {
  const temp = path.join(path.dirname(file), '.' + randomUUID() + '.tmp');
  try {
    await writeFile(temp, value, {flag:'wx'});
    await rename(temp, file);
  } finally {
    await rm(temp, {force:true});
  }
}

function projectForDisk(project) {
  return {...project,assets:project.assets.map(({url,...asset})=>({
    ...asset,...(bundledAssets.has(url)?{bundled:url}:{}),
  }))};
}

async function loadProject(project, file) {
  if(!project||project.version!==1||!Array.isArray(project.assets)) throw Error('Unsupported project.');
  for(const asset of project.assets) {
    if(!asset||typeof asset!=='object') throw Error('Invalid media record.');
    if(typeof asset.path==='string'&&asset.path) {
      try {
        if(!path.isAbsolute(asset.path)) {
          if(!file) throw Error('Missing project directory.');
          const folder=path.dirname(file);
          const resolved=path.resolve(folder,asset.path);
          const relative=path.relative(folder,resolved);
          if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep)) throw Error('Invalid relative media path.');
          asset.path=resolved;
        }
        asset.url=(await register(asset.path)).url;
      }
      catch { asset.url=''; }
    } else {
      const bundled=asset.bundled??asset.url;
      asset.url=bundledAssets.has(bundled)?bundled:'';
    }
  }
  return project;
}

app.whenReady().then(() => {
  app.dock?.setIcon(pngIcon);
  protocol.handle('oclip', async request => {
    const url = new URL(request.url);
    if (url.host !== 'editor') return new Response(null,{status:404});
    try {
      if (url.pathname.startsWith('/media/')) return await stream(request,media.get(url.pathname.slice(7)));
      const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      if (!/^\/(?:index\.html|src\/[\w.-]+|assets\/[\w.-]+)$/.test(name)) return new Response(null,{status:404});
      const extension = path.extname(name);
      const contentType = bundledTypes[extension] ?? types[extension.slice(1)];
      if (!contentType) return new Response(null,{status:404});
      if (name.startsWith('/assets/')) return await stream(request,{file:path.join(root,name),type:contentType});
      return new Response(await readFile(path.join(root,name)),{headers:{
        'Content-Type':contentType,
        ...(development ? {'Cache-Control':'no-store'} : {}),
      }});
    } catch {
      return new Response(null,{status:404});
    }
  });

  const handle = (channel, action) => ipcMain.handle(channel, (event,...args) => {
    if (event.senderFrame?.url !== origin + '/') throw Error('Unexpected sender.');
    return action(BrowserWindow.fromWebContents(event.sender), ...args);
  });
  handle('import', async (win,audioOnly) => {
    const extensions = audioOnly === true ? audioExtensions : mediaExtensions;
    const result = await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:audioOnly === true ? 'Audio' : 'Media',extensions}]});
    return Promise.all(result.filePaths.map(async file => {
      if (!extensions.includes(path.extname(file).slice(1).toLowerCase())) return {error:path.basename(file)};
      try { return await register(file); }
      catch { return {error:path.basename(file)}; }
    }));
  });
  handle('open', async win => {
    const result = await dialog.showOpenDialog(win,{properties:['openFile'],filters:projects});
    if (result.canceled) return null;
    const [file] = result.filePaths;
    if ((await stat(file)).size > 10_000_000) throw Error('Project file is too large.');
    const {thumbnail,...data}=JSON.parse(await readFile(file,'utf8'));
    const project=await loadProject(data,file);
    return {file,project,managed:path.dirname(file)===projectFolder};
  });
  const savePaths = new WeakMap();
  const projectFolder=path.join(app.getPath('userData'),'projects');
  const projectIdPattern=/^[a-f0-9-]{36}$/;
  function managedFile(id) {
    if(typeof id!=='string'||!projectIdPattern.test(id)) throw Error('Invalid project.');
    return path.join(projectFolder,id+'.oclip');
  }
  function thumbnailData(value) {
    return typeof value==='string'&&value.length<=150_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)?value:undefined;
  }
  async function managedRead(id) {
    const file=managedFile(id);
    if((await stat(file)).size>10_000_000) throw Error('Project file is too large.');
    return JSON.parse(await readFile(file,'utf8'));
  }
  async function createManaged(project) {
    await mkdir(projectFolder,{recursive:true});
    const id=randomUUID();
    const file=managedFile(id);
    await atomicWrite(file,JSON.stringify(project,null,2));
    return {id,file};
  }
  handle('projects-list',async ()=>{
    let entries;
    try {entries=await readdir(projectFolder,{withFileTypes:true});}
    catch(error) {if(error.code==='ENOENT') return [];throw error;}
    const records=await Promise.allSettled(entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.oclip')&&
      projectIdPattern.test(entry.name.slice(0,-6))).map(async entry=>{
      const id=entry.name.slice(0,-6);
      const {name,thumbnail}=await managedRead(id);
      return {id,name:String(name||'Untitled project'),thumbnail:thumbnailData(thumbnail),modified:(await stat(managedFile(id))).mtimeMs};
    }));
    return records.filter(record=>record.status==='fulfilled').map(record=>record.value).sort((a,b)=>b.modified-a.modified);
  });
  handle('projects-create',async (_win,project)=>createManaged(projectForDisk(project)));
  handle('projects-open',async (_win,id)=>{
    const {thumbnail,...project}=await managedRead(id);
    const file=managedFile(id);
    return {file,project:await loadProject(project,file),managed:true};
  });
  handle('projects-duplicate',async (_win,id)=>{
    const project=await managedRead(id);
    await createManaged({...project,name:project.name+' copy'});
  });
  handle('projects-delete',async (_win,id)=>{
    await shell.trashItem(managedFile(id));
  });
  handle('projects-collect',async (win,id)=>{
    const project=await managedRead(id);
    const choice=await dialog.showOpenDialog(win,{title:'Choose where to save the project copy',properties:['openDirectory']});
    if(choice.canceled||!choice.filePaths.length) return null;
    const title=String(project.name||'Oclip project').replace(/[^\w -]/g,'_').trim().slice(0,70)||'Oclip project';
    const folder=await mkdtemp(path.join(choice.filePaths[0],title+'-'));
    const mediaFolder=path.join(folder,'media');
    const copied=new Map();
    const file=path.join(folder,'Project.oclip');
    try {
      await mkdir(mediaFolder);
      for(const asset of project.assets) {
        if(!asset.path) {
          if(bundledAssets.has(asset.bundled)) continue;
          throw Error('Locate missing media before collecting the project: '+asset.name);
        }
        const source=path.resolve(path.dirname(managedFile(id)),asset.path);
        if(!copied.has(source)) {
          const name=(copied.size+1)+'-'+path.basename(source);
          const destination=path.join(mediaFolder,name);
          copied.set(source,destination);
          try {await copyFile(source,destination);}
          catch {throw Error('Could not copy '+asset.name+'. Check that the source file is available.');}
        }
        asset.path=path.relative(folder,copied.get(source)).split(path.sep).join('/');
      }
      await atomicWrite(file,JSON.stringify(project,null,2));
      return {folder,file};
    } catch(error) {
      for(const destination of copied.values()) await rm(destination,{force:true}).catch(()=>{});
      await rmdir(mediaFolder).catch(()=>{});
      await rmdir(folder).catch(()=>{});
      throw error;
    }
  });
  const recoveryFile=path.join(app.getPath('userData'),'recovery.json');
  let recoveryWrite=Promise.resolve();
  handle('checkpoint', (win,project,view)=>{
    const value=project?JSON.stringify({file:savePaths.get(win)??null,project:projectForDisk(project),view}):null;
    recoveryWrite=recoveryWrite.catch(()=>{}).then(async()=>{
      if(value) await atomicWrite(recoveryFile,value);
      else await rm(recoveryFile,{force:true});
    });
    return recoveryWrite;
  });
  handle('recover', async ()=>{
    let checkpoint;
    try { checkpoint=JSON.parse(await readFile(recoveryFile,'utf8')); }
    catch(error) { if(error.code==='ENOENT') return null; throw error; }
    const managed=typeof checkpoint.file==='string'&&path.dirname(checkpoint.file)===projectFolder;
    if(managed) {
      const id=path.basename(checkpoint.file,'.oclip');
      let saved;
      try {saved=await managedRead(id);}
      catch(error) {if(error.code==='ENOENT') return {...checkpoint,file:null,managed:false,project:await loadProject(checkpoint.project)};throw error;}
      const {thumbnail,...content}=saved;
      if(isDeepStrictEqual(content,checkpoint.project)) {
        await rm(recoveryFile,{force:true});
        return null;
      }
    }
    return {...checkpoint,managed,project:await loadProject(checkpoint.project,checkpoint.file)};
  });
  handle('relink', async (win,name)=>{
    const result=await dialog.showOpenDialog(win,{title:'Locate '+String(name),properties:['openFile'],
      filters:[{name:'Media',extensions:mediaExtensions}]});
    return result.canceled?null:register(result.filePaths[0]);
  });
  handle('relink-folder', async (win,files)=>{
    const result=await dialog.showOpenDialog(win,{title:'Find missing media in a folder',properties:['openDirectory']});
    if(result.canceled) return null;
    const folder=result.filePaths[0];
    const matches=[];
    for(const {id,file} of files) {
      if(typeof file!=='string'||!file) continue;
      try {matches.push({id,replacement:await register(path.join(folder,path.basename(file)))});}
      catch {}
    }
    return matches;
  });
  handle('save', async (win, project, thumbnail) => {
    const file=savePaths.get(win);
    if(!file||path.dirname(file)!==projectFolder) throw Error('No managed project is open.');
    const stored=projectForDisk(project);
    const image=thumbnailData(thumbnail);
    if(image) stored.thumbnail=image;
    else if(project.tracks.some(track=>track.enabled&&track.clips.some(clip=>clip.kind!=='audio'))) {
      try {stored.thumbnail=thumbnailData(JSON.parse(await readFile(file,'utf8')).thumbnail);} catch {}
    }
    await atomicWrite(file,JSON.stringify(stored,null,2));
    return file;
  });
  handle('project-path', (win,file) => {
    if (file === null) savePaths.delete(win);
    else if (typeof file === 'string' && path.isAbsolute(file) && path.extname(file).toLowerCase() === '.oclip') savePaths.set(win,file);
  });
  const exportPaths = new WeakMap();
  handle('choose-export', async (win,name,extension) => {
    if (!['mp4','webm'].includes(extension)||typeof name!=='string') throw Error('Invalid export format or name.');
    const filename=(name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'Untitled')+'.'+extension;
    const result=await dialog.showSaveDialog(win,{
      defaultPath:path.join(app.getPath('videos'),filename),
      filters:[{name:extension==='mp4'?'MP4 video':'WebM video',extensions:[extension]}],
    });
    if(result.canceled||!result.filePath) return null;
    if(path.extname(result.filePath).toLowerCase()!=='.'+extension) {
      throw Error('Choose a filename ending in .'+extension+'.');
    }
    const id=randomUUID();
    exportPaths.set(win,{id,file:result.filePath});
    return {id,file:result.filePath};
  });
  handle('export-chunk', async (win,id,bytes) => {
    const destination=exportPaths.get(win);
    if(!destination||id!==destination.id) throw Error('Choose an export location again.');
    if(!(bytes instanceof Uint8Array)||!bytes.byteLength) throw Error('The export contains no video data.');
    if(!destination.temp) {
      destination.temp=path.join(path.dirname(destination.file),'.'+randomUUID()+'.tmp');
      await writeFile(destination.temp,bytes,{flag:'wx'});
    } else await appendFile(destination.temp,bytes);
  });
  handle('finish-export', async (win,id,commit)=>{
    const destination=exportPaths.get(win);
    if(!destination||id!==destination.id) throw Error('Choose an export location again.');
    if(!destination.temp) {
      if(commit) throw Error('The export contains no video data.');
      return;
    }
    try {
      if(commit) await rename(destination.temp,destination.file);
    } finally {
      await rm(destination.temp,{force:true});
      delete destination.temp;
      if(commit) exportPaths.delete(win);
    }
  });

  const pendingCloses = new WeakSet();
  if (development) handle('dev-reload', win => win?.webContents.reloadIgnoringCache());
  const approvedCloses = new WeakSet();
  handle('resolve-close', (win, discard) => {
    if (!win || !pendingCloses.delete(win)) return;
    if (discard !== true) return;
    approvedCloses.add(win);
    win.close();
  });

  function createWindow() {
    const window = new BrowserWindow({icon:windowIcon,titleBarStyle:'hidden',titleBarOverlay:{color:'#17181b',symbolColor:'#c9cdd5',height:45},width:1480,height:960,minWidth:960,minHeight:680,backgroundColor:'#111215',title:'Oclip',webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    if (process.platform === 'win32') {
      window.setAppDetails({appId:'oclip.editor',appIconPath:windowIcon});
    }
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate',event => event.preventDefault());
    window.on('close', event => {
      if (approvedCloses.delete(window) || !window.webContents.getURL() || window.webContents.isCrashed()) return;
      event.preventDefault();
      if (pendingCloses.has(window)) return;
      pendingCloses.add(window);
      window.webContents.send('request-close');
    });
    window.webContents.on('render-process-gone', () => pendingCloses.delete(window));
    if (development) {
      let reloadTimer;
      const watchers = [
        [root, name => name === 'index.html'],
        [path.join(root,'src'), name => /\.(js|css)$/.test(name)],
        [__dirname, name => name === 'preload.cjs' || name === 'main.cjs'],
      ].map(([directory, matches]) => {
        const watcher = watch(directory, (_event, filename) => {
          if (filename && !matches(filename)) return;
          if (filename === 'main.cjs') {
            console.log('Electron main process changed. Restart npm run dev to apply it.');
            return;
          }
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => {
            if (!window.isDestroyed()) window.webContents.send('dev-reload');
          },180);
        });
        watcher.on('error',error => console.error('Dev watcher:',error.message));
        return watcher;
      });
      window.once('closed', () => {
        clearTimeout(reloadTimer);
        for (const watcher of watchers) watcher.close();
      });
    }
    window.loadURL(origin + '/');
  }
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
