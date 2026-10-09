import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staticClosure } from '../scripts/check-bundle.mjs';

test('counts shared chunks once and never follows optional dynamic imports', () => {
  const manifest = {
    entry: { imports: ['react', 'shell'], dynamicImports: ['editor'] },
    shell: { imports: ['react'] }, react: {}, editor: { imports: ['pdf'] }, pdf: {},
  };
  assert.deepEqual(staticClosure(manifest, ['entry']), ['entry', 'react', 'shell']);
  assert.deepEqual(staticClosure(manifest, ['entry', 'editor']), ['entry', 'react', 'shell', 'editor', 'pdf']);
});
test('handles cycles and fails closed on a broken graph', () => {
  assert.deepEqual(staticClosure({ a: { imports: ['b'] }, b: { imports: ['a'] } }, ['a']), ['a', 'b']);
  assert.throws(() => staticClosure({ a: { imports: ['missing'] } }, ['a']), /Missing manifest dependency/);
});
