import { readFile, readdir, lstat, unlink } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

// Never prune current manifest files, even if they happen to be old.
const dist = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'));
const current = new Set(Object.values(manifest).flatMap(row => [row.file, ...(row.css ?? []), ...(row.assets ?? [])]).filter(Boolean));
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
for (const name of await readdir(resolve(dist, 'assets'))) {
  // Restrict deletion to regular Vite hash-named files in the validated asset directory.
  if (basename(name) !== name || !/-[\w-]{8,}\.[\w.]+$/.test(name) || current.has(`assets/${name}`)) continue;
  const file = resolve(dist, 'assets', name);
  const info = await lstat(file);
  if (info.isFile() && info.mtimeMs < cutoff) await unlink(file);
}
