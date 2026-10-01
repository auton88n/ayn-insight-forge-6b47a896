// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Load actual pure/backend modules without importing Deno's npm: type URLs
// into the frontend typecheck. No network or production credentials.
function backendModule(path: string): Record<string, (...args: any[]) => any> {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'Deno', js)(createRequire(import.meta.url), exports, { env: { get: () => undefined } });
  return exports;
}

describe('request-isolated AI usage', () => {
  it('attributes interleaved calls to their own user and feature', async () => {
    const ai = backendModule('../../supabase/functions/resume-hub/lib/ai.ts');
    const insert = vi.fn((_row: { user_id: string; intent_type: string }) => Promise.resolve({ error: null }));
    const admin = { from: () => ({ insert }) };
    await Promise.all(['alpha', 'beta'].map((user, i) => ai.withAiContext(async () => {
      ai.setAiCtx(admin, user, `feature-${user}`);
      await new Promise(resolve => setTimeout(resolve, i ? 1 : 10));
      ai.logAiUsage({ model: 'test', inputTokens: 2, outputTokens: 3, ms: 1, wasFallback: false });
    })));
    expect(insert.mock.calls.map(([row]) => [row.user_id, row.intent_type])).toEqual([
      ['beta', 'feature-beta'], ['alpha', 'feature-alpha'],
    ]);
    ai.logAiUsage({ model: 'test', inputTokens: 2, outputTokens: 3, ms: 1, wasFallback: false });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

describe('writing evidence checks', () => {
  const rules = backendModule('../../supabase/functions/_shared/tailoring.ts');
  it('flags a new unsupported metric and names it in the retry note', () => {
    const source = { basics: { summary: 'Python developer' }, skills: ['Python'], work: [{ bullets: ['Built reporting tools.'] }] };
    const changed = { ...source, work: [{ bullets: ['Built reporting tools that increased revenue by 35%.'] }] };
    const violations = rules.verifyWriteQuality(JSON.stringify(source), changed);
    expect(violations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'invented_figure' })]));
    expect(rules.violationsToRetryNote(violations)).toContain('unsupported figures');
  });
  it('does not flag a supported metric', () => {
    const source = { basics: { summary: 'Python developer' }, skills: ['Python'], work: [{ bullets: ['Reduced reporting time by 35%.'] }] };
    const violations = rules.verifyWriteQuality(JSON.stringify(source), source);
    expect(violations.filter((v: { kind: string }) => ['invented_figure', 'figure'].includes(v.kind))).toEqual([]);
  });
});
