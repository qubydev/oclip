import type {DesktopApi} from '../src/desktop-api.js';
const {contextBridge, ipcRenderer} = require('electron') as typeof import('electron');
const desktop: DesktopApi = {
  platform: process.platform,
  onCloseRequest: callback => { ipcRenderer.on('request-close', () => callback()); },
  onDevReload: callback => { ipcRenderer.on('dev-reload', () => callback()); },
  reloadForDevelopment: () => ipcRenderer.invoke('dev-reload'),
  resolveClose: discard => ipcRenderer.invoke('resolve-close',discard),
  importMedia: audioOnly => ipcRenderer.invoke('import',audioOnly),
  openProject: () => ipcRenderer.invoke('open'),
  saveProject: (project,thumbnail) => ipcRenderer.invoke('save',project,thumbnail),
  listProjects: () => ipcRenderer.invoke('projects-list'),
  createProject: project => ipcRenderer.invoke('projects-create',project),
  openManagedProject: id => ipcRenderer.invoke('projects-open',id),
  duplicateProject: id => ipcRenderer.invoke('projects-duplicate',id),
  collectProject: id => ipcRenderer.invoke('projects-collect',id),
  deleteProject: id => ipcRenderer.invoke('projects-delete',id),
  setProjectPath: file => ipcRenderer.invoke('project-path',file),
  checkpoint: (project,view) => ipcRenderer.invoke('checkpoint',project,view),
  recover: () => ipcRenderer.invoke('recover'),
  relink: name => ipcRenderer.invoke('relink',name),
  relinkFolder: files => ipcRenderer.invoke('relink-folder',files),
  exportFolder: () => ipcRenderer.invoke('export-folder'),
  chooseExportFolder: () => ipcRenderer.invoke('choose-export-folder'),
  beginExport: (name,extension) => ipcRenderer.invoke('begin-export',name,extension),
  exportChunk: (id,bytes) => ipcRenderer.invoke('export-chunk',id,bytes),
  finishExport: (id,commit) => ipcRenderer.invoke('finish-export',id,commit),
};
contextBridge.exposeInMainWorld('desktop', desktop);
