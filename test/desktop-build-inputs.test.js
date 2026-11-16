import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('the repository includes the Electron entry points and NSIS build inputs', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const installer = manifest.build.nsis.include;
  await Promise.all([
    manifest.main,
    'desktop/preload.cjs',
    'desktop/preview.mjs',
    manifest.build.win.icon,
    installer,
  ].map(file => readFile(new URL(file, root))));

  const script = await readFile(new URL(installer, root), 'utf8');
  const hook = script.match(/__FILEDIR__\}\x5c([^"\r\n]+)"/)?.[1];
  assert.ok(hook, 'The installer must reference its styling hook');
  await readFile(new URL(hook, new URL(installer, root)));
});
