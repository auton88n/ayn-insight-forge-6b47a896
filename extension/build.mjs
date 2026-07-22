#!/usr/bin/env node
/**
 * extension/build.mjs
 * Bundles the Universal Question Engine + content bridge into two IIFE scripts,
 * then packages the extension into public/ayn-extension.zip.
 *
 * Usage: node extension/build.mjs
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EXT = __dirname;

const common = {
  bundle: true,
  format: "iife",
  target: "chrome110",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
  legalComments: "none",
};

async function main() {
  // v2.8.4 — wiring self-check runs FIRST. Fails the build on any seam mismatch.
  execSync(`node ${resolve(ROOT, "scripts/check-wiring.mjs")}`, { stdio: "inherit" });

  await build({
    ...common,
    entryPoints: [resolve(EXT, "question-engine/index.ts")],
    outfile: resolve(EXT, "question-engine.bundle.js"),
    globalName: "AYNQuestionEngine",
    footer: {
      js: "window.AYNQuestionEngine = AYNQuestionEngine;",
    },
  });

  await build({
    ...common,
    entryPoints: [resolve(EXT, "content.entry.js")],
    outfile: resolve(EXT, "content.bundle.js"),
  });

  // v2.7.0 — manifest.json is the single source of truth for extension version.
  const manifest = JSON.parse(readFileSync(resolve(EXT, "manifest.json"), "utf8"));
  const version = manifest.version;

  // Publish a lightweight version manifest the dashboard can fetch to
  // detect out-of-date installs without downloading the whole zip.
  const publicDir = resolve(ROOT, "public");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(
    resolve(publicDir, "ayn-extension-version.json"),
    JSON.stringify({ version, updatedAt: new Date().toISOString() }, null, 2),
  );

  const zipPath = resolve(publicDir, "ayn-extension.zip");
  if (existsSync(zipPath)) rmSync(zipPath);

  const excludes = [
    "question-engine/*",
    "question-engine/**/*",
    "content.entry.js",
    "build.mjs",
    "README.md",
  ]
    .map((p) => `-x "${p}"`)
    .join(" ");

  execSync(
    `zip -r "${zipPath}" . ${excludes}`,
    { cwd: EXT, stdio: "inherit" }
  );

  console.log(`\n✔ Built ${zipPath} (v${version})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
