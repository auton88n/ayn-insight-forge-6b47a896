#!/usr/bin/env node
/**
 * scripts/check-wiring.mjs (v2.8.4)
 *
 * Wiring self-check across the three seams that keep breaking:
 *  A) Every message type sent by extension/sidepanel.js has a handler in
 *     extension/background.js or extension/content.js.
 *  B) Every callFunction('x')/bgFunc('x') action used by the extension is
 *     registered in EXT_ACTIONS in supabase/functions/resume-hub/index.ts.
 *  C) Every action: "x" invoked from src/lib/resumeHub.ts is reachable
 *     with a session JWT: either it's a web-lane handler in the edge
 *     function, or it's in DUAL_AUTH_ACTIONS.
 *
 * Exit 1 on any mismatch with a clear list.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const sidepanelJs = read('extension/sidepanel.js');
const backgroundJs = read('extension/background.js');
const contentJs = read('extension/content.js');
const edgeTs = read('supabase/functions/resume-hub/index.ts');
const resumeHubTs = read('src/lib/resumeHub.ts');

// ── Extract sets ────────────────────────────────────────────────────
function uniq(arr) { return [...new Set(arr)]; }

// Sidepanel message types: match `type: 'X'` and `type: "X"` — includes
// both chrome.runtime.sendMessage and chrome.tabs.sendMessage payloads
// (nested TAB_SEND payload.type is also picked up).
const sentTypes = uniq([...sidepanelJs.matchAll(/\btype:\s*['"]([A-Z_][A-Z0-9_]*)['"]/g)].map(m => m[1]));

// Handlers in background.js + content.js:
//   `message.type === 'X'`, `msg.type === 'X'`, `['A','B'].includes(message.type)`
function extractHandlers(src) {
  const set = new Set();
  for (const m of src.matchAll(/message\.type\s*===\s*['"]([A-Z_][A-Z0-9_]*)['"]/g)) set.add(m[1]);
  for (const m of src.matchAll(/msg\.type\s*===\s*['"]([A-Z_][A-Z0-9_]*)['"]/g)) set.add(m[1]);
  for (const m of src.matchAll(/\[([^\]]+)\]\s*\.includes\(\s*(?:message|msg)\.type\s*\)/g)) {
    for (const s of m[1].matchAll(/['"]([A-Z_][A-Z0-9_]*)['"]/g)) set.add(s[1]);
  }
  return set;
}
const handlers = new Set([...extractHandlers(backgroundJs), ...extractHandlers(contentJs)]);

// Meta types the sidepanel synthesizes but doesn't send to a listener.
const META_TYPES = new Set(['radio', 'checkbox', 'file', 'text', 'submit', 'button', 'reset', 'image', 'hidden']);

// Extension edge-function actions: callFunction('x') and bgFunc('x')
// plus BG_FUNC { action: 'x' } wrappers.
const extActionsUsed = uniq([
  ...[...backgroundJs.matchAll(/callFunction\(\s*['"]([a-z_][a-z0-9_]*)['"]/g)].map(m => m[1]),
  ...[...sidepanelJs.matchAll(/bgFunc\(\s*['"]([a-z_][a-z0-9_]*)['"]/g)].map(m => m[1]),
  ...[...sidepanelJs.matchAll(/BG_FUNC[^}]*?action:\s*['"]([a-z_][a-z0-9_]*)['"]/g)].map(m => m[1]),
  ...[...backgroundJs.matchAll(/actionMap\s*=\s*\{([^}]*)\}/g)].flatMap(m =>
    [...m[1].matchAll(/['"]([a-z_][a-z0-9_]*)['"]/g)].map(x => x[1])
  ),
]);

// Parse EXT_ACTIONS Set literal in edge function.
const extActionsMatch = edgeTs.match(/const\s+EXT_ACTIONS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
if (!extActionsMatch) { console.error('check-wiring: could not find EXT_ACTIONS in resume-hub/index.ts'); process.exit(1); }
const extActionsRegistry = new Set(
  [...extActionsMatch[1].matchAll(/["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1])
);

// Parse DUAL_AUTH_ACTIONS.
const dualMatch = edgeTs.match(/const\s+DUAL_AUTH_ACTIONS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
const dualAuth = new Set(dualMatch ? [...dualMatch[1].matchAll(/["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1]) : []);

// Web-lane handlers: `if (action === "x")` occurrences below the EXT block.
// Simpler: collect ALL `action === "x"` occurrences, then subtract EXT_ACTIONS
// (those inside the ext gate are ext-lane only). What remains is web-lane
// reachable OR link-public — either way, session JWT lane can reach them.
const allActionHandlers = new Set(
  [...edgeTs.matchAll(/action\s*===\s*["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1])
);
const webLaneReachable = new Set([...allActionHandlers].filter(a => !extActionsRegistry.has(a)));

// Hub actions used from src/lib/resumeHub.ts
const hubActionsUsed = uniq(
  [...resumeHubTs.matchAll(/action:\s*["']([a-z_][a-z0-9_]*)["']/g)].map(m => m[1])
);

// ── Report ───────────────────────────────────────────────────────────
const errors = [];
const warnings = [];

for (const t of sentTypes) {
  if (META_TYPES.has(t)) continue;
  if (!handlers.has(t)) errors.push(`A) sidepanel sends message type "${t}" with no handler in background.js or content.js`);
}
for (const a of extActionsUsed) {
  if (!extActionsRegistry.has(a)) errors.push(`B) extension calls edge action "${a}" not registered in EXT_ACTIONS`);
}
for (const a of hubActionsUsed) {
  const reachable = webLaneReachable.has(a) || dualAuth.has(a);
  if (!reachable) errors.push(`C) src/lib/resumeHub.ts uses action "${a}" that is not reachable with a session JWT (not in web lane, not in DUAL_AUTH_ACTIONS)`);
}

// D) REVERSE (v2.12.0): every registered EXT_ACTION must have at least one
// caller in extension/ or src/. A dead handler is an audit blind spot —
// duplicated logic can sit unnoticed and diverge from the live twin.
let extCallerHaystack = [sidepanelJs, backgroundJs, contentJs, resumeHubTs].join('\n');
try {
  const { execSync } = await import('node:child_process');
  extCallerHaystack += '\n' + execSync(`grep -RhoE "action[\\"' :]+[a-z_]+" ${resolve(ROOT, 'src')} 2>/dev/null || true`, { encoding: 'utf8' });
} catch { /* ignore */ }
for (const a of extActionsRegistry) {
  const re = new RegExp(`['"\`]${a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"\`]`);
  if (!re.test(extCallerHaystack)) {
    errors.push(`D) EXT_ACTIONS registers "${a}" but no caller references it in extension/ or src/ (dead handler)`);
  }
}

// E) WARN (v2.12.0): report direct PostgREST table access from extension code
// so the direct lane stays visible to future audits. Not a failure — the
// learning store intentionally uses PostgREST for hot-path speed.
try {
  const { execSync } = await import('node:child_process');
  const out = execSync(`grep -RhoE "restBaseUrl}?/[a-z_][a-z0-9_]*" ${resolve(ROOT, 'extension')} 2>/dev/null || true`, { encoding: 'utf8' });
  const tables = uniq(out.split(/\n/).map(l => (l.match(/\/([a-z_][a-z0-9_]*)/) || [])[1]).filter(Boolean));
  for (const t of tables) warnings.push(`direct PostgREST access to public.${t} from extension/`);
} catch { /* grep unavailable */ }

if (warnings.length) {
  console.warn('⚠ check-wiring: ' + warnings.length + ' direct-lane note(s):');
  for (const w of warnings) console.warn('  - ' + w);
}
if (errors.length) {
  console.error('\n✗ check-wiring: ' + errors.length + ' mismatch(es):');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✔ check-wiring: sidepanel=${sentTypes.length} types, ext=${extActionsUsed.length} actions, hub=${hubActionsUsed.length} actions all wired.`);
