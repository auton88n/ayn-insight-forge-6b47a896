#!/usr/bin/env node
/**
 * scripts/check-wiring.mjs (v3.164.0)
 *
 * Wiring self-check for the one seam that keeps breaking: every action
 * called from src/lib/resumeHub.ts must have a real handler in the
 * resume-hub edge function, reachable with a session JWT.
 *
 * The Chrome extension (and the sidepanel/background-script/EXT_ACTIONS
 * checks this script used to run against it) is retired — every
 * capability it offered now lives in the web app. This is the surviving
 * half of the original three-part check.
 *
 * Exit 1 on any mismatch with a clear list.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const edgeTs = read('supabase/functions/resume-hub/index.ts');
const resumeHubTs = read('src/lib/resumeHub.ts');

function uniq(arr) { return [...new Set(arr)]; }

// Every `if (action === "x")` handler in the edge function.
const allActionHandlers = new Set(
  [...edgeTs.matchAll(/action\s*===\s*["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1])
);

// Hub actions used from src/lib/resumeHub.ts
const hubActionsUsed = uniq(
  [...resumeHubTs.matchAll(/action:\s*["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1])
);

const errors = [];
for (const a of hubActionsUsed) {
  if (!allActionHandlers.has(a)) {
    errors.push(`src/lib/resumeHub.ts uses action "${a}" with no matching handler in resume-hub/index.ts`);
  }
}

if (errors.length) {
  console.error('\n✗ check-wiring: ' + errors.length + ' mismatch(es):');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✔ check-wiring: hub=${hubActionsUsed.length} actions all wired.`);
