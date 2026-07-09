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
import { rmSync, existsSync } from "node:fs";
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

  const zipPath = resolve(ROOT, "public/ayn-extension.zip");
  if (existsSync(zipPath)) rmSync(zipPath);

  // Zip the extension folder, excluding source-only files that don't need to ship.
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

  console.log(`\n✔ Built ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
