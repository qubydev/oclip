import {spawn} from 'node:child_process';
import {watch} from 'node:fs';
import electron from 'electron';
import {copyStatic} from './copy-static.ts';

const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '--watch', '--preserveWatchOutput'], {stdio:'inherit'});
const app = spawn(electron as unknown as string, ['.', '--oclip-dev'], {stdio:'inherit'});
let copyTimer: ReturnType<typeof setTimeout>;
let pendingCopy = Promise.resolve();
const watchers = ['.', 'src', 'assets'].map(directory => watch(directory, (_event, name) => {
  if (!name || !(directory === 'assets' || name === 'index.html' || name.endsWith('.css'))) return;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    pendingCopy = pendingCopy.then(copyStatic).catch(error => console.error('Could not refresh static files:', error));
  }, 80);
}));
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  clearTimeout(copyTimer);
  watchers.forEach(watcher => watcher.close());
  compiler.kill();
  app.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
app.on('error', error => { console.error(error); stop(); process.exitCode = 1; });
compiler.on('error', error => { console.error(error); stop(); process.exitCode = 1; });
app.on('exit', code => { stop(); process.exitCode = code ?? 1; });
compiler.on('exit', code => { if (!stopped) { stop(); process.exitCode = code ?? 1; } });
