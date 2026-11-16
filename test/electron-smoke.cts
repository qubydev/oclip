import {app, BrowserWindow, ipcMain} from 'electron';
import {strict as assert} from 'node:assert';
import path from 'node:path';

const timeout = setTimeout(() => { console.error('Electron smoke check timed out'); app.exit(1); }, 20000);
const errors: string[] = [];
app.whenReady().then(async () => {
  const preview = new BrowserWindow({show:false, webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false}});
  preview.webContents.on('console-message', details => {
    if (details.level === 'error') errors.push(details.message);
  });
  await preview.loadFile(path.join(__dirname, '../index.html'));
  const state = await preview.webContents.executeJavaScript(
    "({clips:document.querySelectorAll('.clip').length,width:document.getElementById('preview').width})"
  );
  assert.ok(state.clips > 0, 'Sample timeline must render from compiled modules');
  assert.equal(state.width, 1920);
  assert.deepEqual(errors, [], 'Renderer must load without JavaScript errors');

  ipcMain.handle('projects-list', () => []);
  const bridge = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await bridge.loadURL('data:text/html,<title>Bridge check</title>');
  const result = await bridge.webContents.executeJavaScript(
    "window.desktop.listProjects().then(projects=>({platform:window.desktop.platform,projects,exposed:typeof window.require}))"
  );
  assert.deepEqual(result.projects, []);
  assert.equal(result.platform, process.platform);
  assert.equal(result.exposed, 'undefined');
  bridge.destroy();
  preview.destroy();
  console.log('Electron renderer and sandboxed preload checks passed');
  clearTimeout(timeout);
  app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
