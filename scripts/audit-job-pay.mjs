// Operator-only, pay-only reconciliation. Dry run by default; --apply preserves
// changed rows in a private recovery file and guards against concurrent edits.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const target = process.env.AYN_PAY_AUDIT_HOST;
if (!target || !/^[a-zA-Z0-9_.@-]+$/.test(target)) throw new Error('Set AYN_PAY_AUDIT_HOST to the reviewed SSH target.');
const sql = query => execFileSync('ssh', [target, 'docker exec -i supabase-db psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const source = readFileSync(new URL('../supabase/functions/_shared/jobFacts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { extractSalaryFromText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const fields = ['salary_text_min', 'salary_text_max', 'salary_text_currency', 'salary_text_period', 'salary_text_annual_min', 'salary_text_annual_max'];
const rows = sql(`select json_build_object('id',id,'description',description,'location',location,'before',jsonb_build_array(${fields.join(',')})) from public.job_postings where salary_text_min is not null;`).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const changes = [];
for (const row of rows) {
  const result = extractSalaryFromText(row.description || '', row.location);
  const after = result ? [result.min, result.max, result.currency, result.period, result.annual_min, result.annual_max] : fields.map(() => null);
  if (JSON.stringify(row.before) !== JSON.stringify(after)) changes.push({ ...row, after });
}
console.log(JSON.stringify({ reviewed: rows.length, changed: changes.length, cleared: changes.filter(r => r.after[0] === null).length, periodChanged: changes.filter(r => r.before[3] !== r.after[3]).length }));
if (process.argv.includes('--sample')) {
  const seen = new Set();
  for (const row of changes) {
    const context = (row.description || '').match(/.{0,65}(?:\$|£|€|USD|CAD|AUD|EUR|GBP|AED|CHF)\s*\d.{0,140}/g)?.slice(0, 4) || [];
    const signature = JSON.stringify(context);
    if (seen.has(signature)) continue;
    seen.add(signature);
    console.log(JSON.stringify({ id: row.id, before: row.before, after: row.after, context }));
    if (seen.size >= 24) break;
  }
}
if (process.argv.includes('--apply') && changes.length) {
  const folder = mkdtempSync(join(tmpdir(), 'ayn-pay-recovery-'));
  writeFileSync(join(folder, 'changes.json'), JSON.stringify(changes), { mode: 0o600 });
  const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const updates = changes.map(row => `update public.job_postings set ${fields.map((field, i) => `${field}=${quote(row.after[i])}`).join(',')} where id=${quote(row.id)} and description is not distinct from ${quote(row.description)} and location is not distinct from ${quote(row.location)} and jsonb_build_array(${fields.join(',')})=${quote(JSON.stringify(row.before))}::jsonb returning id;`);
  const applied = sql(`begin; set local lock_timeout='5s';\n${updates.join('\n')}\ncommit;`).trim().split('\n').filter(Boolean).length;
  console.log(JSON.stringify({ applied, skippedConcurrentChange: changes.length - applied, recovery: join(folder, 'changes.json') }));
}
