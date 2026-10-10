import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, symlink, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('main sitemap survives a live dist rebuild and logs no request secrets', { timeout: 20000 }, async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'ayn-sitemap-test-'));
  let child;
  let output = '';
  try {
    await mkdir(path.join(fixture, 'dist'));
    await mkdir(path.join(fixture, 'public'));
    await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'));
    await copyFile(path.join(root, 'server.js'), path.join(fixture, 'server.mjs'));
    await mkdir(path.join(fixture, 'src/lib'), { recursive: true });
    await copyFile(path.join(root, 'src/lib/jobLocation.mjs'), path.join(fixture, 'src/lib/jobLocation.mjs'));
    await mkdir(path.join(fixture, 'supabase/functions/_shared'), { recursive: true });
    await copyFile(path.join(root, 'supabase/functions/_shared/articlePresentation.mjs'), path.join(fixture, 'supabase/functions/_shared/articlePresentation.mjs'));
    await copyFile(path.join(root, 'index.html'), path.join(fixture, 'dist/index.html'));
    for (const folder of ['dist', 'public']) {
      await copyFile(path.join(root, 'public/sitemap.xml'), path.join(fixture, folder, 'sitemap.xml'));
    }
    const expected = await readFile(path.join(root, 'public/sitemap.xml'), 'utf8');
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    child = spawn(process.execPath, [path.join(fixture, 'server.mjs')], {
      env: { ...process.env, PORT: String(port), VITE_SUPABASE_URL: 'https://backend.invalid' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; !output.includes('Server running'); attempt++) {
      assert.ok(attempt < 300 && child.exitCode === null, output || 'Server failed to start');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const base = `http://127.0.0.1:${port}`;
    const missingAsset = await fetch(`${base}/assets/JobsTab-obsolete123.js`);
    assert.equal(missingAsset.status, 404);
    assert.match(missingAsset.headers.get('content-type'), /text\/plain/);
    assert.equal(missingAsset.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await missingAsset.text(), /<html|<!doctype/i);
    for (const route of ['/', '/pricing', '/salary-guide']) {
      const response = await fetch(base + route);
      const html = await response.text();
      assert.equal(response.status, 200);
      // Crawler text is present but visually hidden, so people never see a flash.
      assert.match(html, /data-prerender style="position:absolute/);
      assert.match(html, /<h1>/);
      assert.match(html, /aria-label="Main navigation"/);
      assert.doesNotMatch(html, /display:\s*none|visibility:\s*hidden/);
      if (route === '/pricing') assert.match(html, /canonical" href="https:\/\/ayn.careers\/pricing"/);
    }
    const initial = await fetch(`${base}/sitemap.xml`);
    assert.equal(initial.status, 200);
    assert.equal(await initial.text(), expected);
    // Reproduce Vite emptyOutDir without ever touching the real build.
    await rename(path.join(fixture, 'dist'), path.join(fixture, 'previous-dist'));
    const duringBuild = await fetch(`${base}/sitemap.xml?token=PRIVATE_QUERY`, {
      headers: { 'User-Agent': 'Googlebot PRIVATE_AGENT', Cookie: 'session=PRIVATE_COOKIE' },
    });
    assert.equal(duringBuild.status, 200, 'Sitemap must not become a 404 HTML shell during builds');
    assert.match(duringBuild.headers.get('content-type'), /application\/xml/);
    assert.equal(await duringBuild.text(), expected);
    const head = await fetch(`${base}/sitemap.xml`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    // Explicit policy prevents fetch from adding no-cache to a conditional
    // request (which correctly forces Express to return a full response).
    const conditional = await fetch(`${base}/sitemap.xml`, { headers: { 'If-None-Match': initial.headers.get('etag'), 'Cache-Control': 'max-age=0' } });
    assert.equal(conditional.status, 304);
    await fetch(`${base}/unknown?PRIVATE_UNRELATED`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const logs = output.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    assert.equal(logs.length, 4);
    assert.ok(logs.every((entry) => entry.event === 'sitemap_response' && entry.path === '/sitemap.xml'));
    assert.equal(logs[1].agentClaim, 'googlebot');
    assert.equal(logs[3].status, 304);
    assert.doesNotMatch(output, /PRIVATE_/);
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(fixture, { recursive: true, force: true });
  }
});
