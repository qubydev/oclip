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

  const projectCards = await preview.webContents.executeJavaScript(`(async () => {
    const {renderProjects} = await import('./src/project-home.js');
    const container = document.getElementById('home-projects');
    const projects = [
      {id:'first',name:'First project',modified:0},
      {id:'second',name:'Second project',modified:0},
    ];
    const opened = [];
    let selectedId = null;
    const actions = {
      open:id=>opened.push(id), select:id=>{selectedId=id;},
      duplicate:()=>{}, remove:()=>{},
    };
    document.getElementById('home-screen').hidden = false;
    document.body.classList.add('on-home');
    renderProjects(container,projects,actions);
    const buttons = container.querySelectorAll('.home-open');
    buttons[0].click();
    const click = {selected:selectedId,opens:opened.length,pressed:buttons[0].getAttribute('aria-pressed')};
    buttons[1].click();
    const switched = {selected:selectedId,count:container.querySelectorAll('.selected').length,firstPressed:buttons[0].getAttribute('aria-pressed')};
    buttons[1].focus();
    document.getElementById('home-screen').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    const deselected = {
      selected:selectedId,count:container.querySelectorAll('.selected').length,
      pressed:buttons[1].getAttribute('aria-pressed'),focused:document.activeElement===buttons[1],
    };
    renderProjects(container,projects,actions,{selectedId});
    const staysDeselected = container.querySelector('.selected')===null;
    container.querySelectorAll('.home-open')[1].click();
    renderProjects(container,projects,actions,{sort:'name',selectedId});
    const preserved = container.querySelector('.selected').dataset.project;
    container.querySelector('.home-open').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
    const doubleClick = opened.slice();
    container.querySelector('.home-more').click();
    const menu = {opens:opened.length,collect:container.querySelector('[data-collect]')!==null,items:container.querySelectorAll('.home-project-menu button').length};
    container.querySelector('.home-project-menu').hidePopover();
    const button = container.querySelector('.home-open');
    button.focus();
    globalThis.projectCardOpened = opened;
    return {click,switched,deselected,staysDeselected,preserved,doubleClick,menu};
  })()`);
  assert.deepEqual(projectCards.click,{selected:'first',opens:0,pressed:'true'});
  assert.deepEqual(projectCards.switched,{selected:'second',count:1,firstPressed:'false'});
  assert.deepEqual(projectCards.deselected,{selected:null,count:0,pressed:'false',focused:false});
  assert.equal(projectCards.staysDeselected,true,'Cleared selection must stay cleared after rendering');
  assert.equal(projectCards.preserved,'second');
  assert.deepEqual(projectCards.doubleClick,['first']);
  assert.deepEqual(projectCards.menu,{opens:1,collect:false,items:4});
  preview.webContents.debugger.attach('1.3');
  try {
    await preview.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{
      type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
    });
    await preview.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{
      type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,
    });
  } finally {
    preview.webContents.debugger.detach();
  }
  const opened = await preview.webContents.executeJavaScript('globalThis.projectCardOpened.slice()');
  assert.deepEqual(opened,['first','first'],'Enter must open the focused project exactly once');

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
