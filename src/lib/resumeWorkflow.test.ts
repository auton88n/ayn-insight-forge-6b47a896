// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual rewrite branch with mocked external services. This
// covers billing decisions without calling production, spending credits,
// or substituting a second implementation of the handler.
const backend = readFileSync(new URL('../../supabase/functions/resume-hub/index.ts', import.meta.url), 'utf8');
const start = backend.indexOf('if (action === "rewrite")');
const end = backend.indexOf('// ---------------- guided_intake_extract', start);
if (start < 0 || end < 0) throw new Error('Rewrite handler boundaries changed; update the harness.');
const branch = backend.slice(start, end);

async function runRewrite(unchanged: boolean, insufficient = false, violations: { kind: string; detail: string }[] = [], replayed: object | null = null) {
  const spend = vi.fn(async (_admin: unknown, _user: string, _cost: number, _reason: string, _ref?: string) => ({ ok: true, balance: 25 }));
  const dependencies = {
    action: 'rewrite',
    payload: { resume: { basics: { name: 'Test Applicant' } }, idempotency_key: 'request-1' },
    supabaseUrl: 'unused', serviceKey: 'unused', user: { id: 'user-1' },
    createClient: () => ({}),
    featureGate: async () => null, accountGate: async () => null, rateLimitGate: async () => null,
    assertCredits: async () => insufficient ? { status: 402 } : null,
    COST_OPTIMIZE: 15, DEFAULT_MODEL: 'test-model', RESUME_SCHEMA: {},
    paidBaseRequestId: (value: string) => value,
    replayPaidBaseResume: async () => replayed,
    completePaidBaseResume: async (_admin: unknown, userId: string, _action: string, id: string, cost: number, value: object) => {
      const charge = cost ? await spend({}, userId, cost, 'resume_optimize', `req:${id}`) : { balance: 40 };
      return { ...value, credits: { spent: cost, balance: charge.balance } };
    },
    callAI: async () => ({ structured: { resume: { basics: { name: 'Test Applicant' }, skills: [] }, suggestions: ['Improved wording'] } }),
    verifyWriteQuality: () => violations, violationsToRetryNote: () => '',
    resumeContentUnchanged: () => unchanged,
    scoreResumeContent: async () => ({ ats_score: 85, verdict: 'Strong', issues: [] }),
    groupSkills: async () => null,
    creditSpend: spend, creditBalance: async () => 40,
    insufficientCredits: () => ({ status: 402 }), json: (value: object, status = 200) => ({ ...value, status }),
  };
  const javascript = ts.transpileModule(`async function run() { ${branch} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const execute = new Function(...Object.keys(dependencies), `${javascript}; return run();`);
  const result = await execute(...Object.values(dependencies));
  return { result, spend };
}

describe('rewrite billing', () => {
  it('recovers a paid result even when the remaining balance is below the upfront gate', async () => {
    const recovered = { resume: { basics: { name: 'Already saved' } }, credits: { spent: 15, balance: 0 } };
    const { result, spend } = await runRewrite(false, true, [], recovered);
    expect(result).toEqual({ ...recovered, status: 200 });
    expect(spend).not.toHaveBeenCalled();
  });
  it('refuses unsupported output after retries without charging', async () => {
    const { result, spend } = await runRewrite(false, false, [{ kind: 'invented_figure', detail: '35%' }]);
    expect(result.status).toBe(422);
    expect(result.code).toBe('resume_facts_unresolved');
    expect(spend).not.toHaveBeenCalled();
    expect(result.resume).toBeUndefined();
  });

  it('discloses remaining wording issues', async () => {
    const { result } = await runRewrite(false, false, [{ kind: 'banned_phrase', detail: 'proven track record' }]);
    expect(result.suggestions).toContain('Still needs review: proven track record');
  });
  it('does not debit an unchanged resume and reports zero spent', async () => {
    const { result, spend } = await runRewrite(true);
    expect(spend).not.toHaveBeenCalled();
    expect(result.credits).toEqual({ spent: 0, balance: 40 });
    expect(result.suggestions[0]).toContain('nothing needed to change');
  });

  it('charges a changed resume with the existing request reference', async () => {
    const { result, spend } = await runRewrite(false);
    expect(spend).toHaveBeenCalledWith({}, 'user-1', 15, 'resume_optimize', 'req:request-1');
    expect(result.credits).toEqual({ spent: 15, balance: 25 });
  });

  it('retains the upfront credit gate', async () => {
    const { result, spend } = await runRewrite(false, true);
    expect(result.status).toBe(402);
    expect(spend).not.toHaveBeenCalled();
  });
});

describe('saved-job source contracts', () => {
  const source = readFileSync(new URL('../components/resume-hub/JobsTab.tsx', import.meta.url), 'utf8');

  it('does not replace the backend-resolved headline with the job title', () => {
    expect(source).not.toMatch(/resume\.basics\.title\s*=\s*selected\.title/);
  });

  it('does not mutate application status from the original-posting link', () => {
    const link = source.match(/<a\s+href=\{selected\.source_url\}[\s\S]*?<\/a>/)?.[0];
    expect(link).toBeDefined();
    expect(link).not.toContain('updateStatus');
    expect(link).not.toContain('onClick');
  });
});
