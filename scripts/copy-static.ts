import {cp, mkdir, copyFile} from 'node:fs/promises';
export async function copyStatic(): Promise<void> {
  await mkdir('.build/src', {recursive:true});
  await Promise.all([
    cp('assets', '.build/assets', {recursive:true}),
    copyFile('index.html', '.build/index.html'),
    copyFile('src/editor.css', '.build/src/editor.css'),
    copyFile('src/workspace.css', '.build/src/workspace.css'),
  ]);
}
await copyStatic();
