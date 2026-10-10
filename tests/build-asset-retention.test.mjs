import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('keeps current and recent chunks, pruning only obsolete hash-named files', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ayn-assets-test-'));
  await mkdir(resolve(root, 'dist/assets'), { recursive: true });
  await mkdir(resolve(root, 'dist/.vite'), { recursive: true });
  await writeFile(resolve(root, 'dist/.vite/manifest.json'), JSON.stringify({ 'index.html': { file: 'assets/current-abcdefgh.js', css: ['assets/current-abcdefgh.css'] } }));
  const old = new Date(Date.now() - 8 * 86400000);
  for (const name of ['current-abcdefgh.js', 'current-abcdefgh.css', 'obsolete-abcdefgh.js', 'recent-abcdefgh.js', 'keep.txt']) {
    const path = resolve(root, 'dist/assets', name);
    await writeFile(path, 'fixture');
    if (!name.startsWith('recent')) await utimes(path, old, old);
  }
  await writeFile(resolve(root, 'outside-abcdefgh.js'), 'outside');
  await symlink(resolve(root, 'outside-abcdefgh.js'), resolve(root, 'dist/assets/link-abcdefgh.js'));
  execFileSync(process.execPath, [resolve('scripts/prune-build-assets.mjs')], { cwd: root });
  for (const name of ['current-abcdefgh.js', 'current-abcdefgh.css', 'recent-abcdefgh.js', 'keep.txt']) assert.equal(await readFile(resolve(root, 'dist/assets', name), 'utf8'), 'fixture');
  await assert.rejects(readFile(resolve(root, 'dist/assets/obsolete-abcdefgh.js')), { code: 'ENOENT' });
  assert.equal(await readFile(resolve(root, 'outside-abcdefgh.js'), 'utf8'), 'outside');
});
