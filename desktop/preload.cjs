const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  onCloseRequest: callback => { ipcRenderer.on('request-close', () => callback()); },
  onDevReload: callback => { ipcRenderer.on('dev-reload', () => callback()); },
  reloadForDevelopment: () => ipcRenderer.invoke('dev-reload'),
  resolveClose: discard => ipcRenderer.invoke('resolve-close',discard),
  importMedia: audioOnly => ipcRenderer.invoke('import',audioOnly),
  openProject: () => ipcRenderer.invoke('open'),
  saveProject: (project,saveAs) => ipcRenderer.invoke('save',project,saveAs),
  setProjectPath: file => ipcRenderer.invoke('project-path',file),
  chooseExport: (name,extension) => ipcRenderer.invoke('choose-export',name,extension),
  saveExport: (id,bytes) => ipcRenderer.invoke('export',id,bytes),
});
