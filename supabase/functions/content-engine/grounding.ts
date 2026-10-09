// Keep numeric checks independent of the Deno handler so they can be tested
// without calling the AI relay or a production database.
const FIGURE_RE = /(?:[$€£¥]\s?\d[\d,.]*(?:\s?(?:k|m|b|bn|million|billion)\b)?|\d[\d,.]*\s?%|\b(?:19|20)\d{2}\b|\b\d[\d,.]*\s?(?:k|m|x|\+)?\b)/gi;

export function extractFigures(text: string): string[] {
  const raw = String(text || "").match(FIGURE_RE) || [];
  const out = new Set<string>();
  for (const f of raw) {
    let t = f.trim().toLowerCase().replace(/\s+/g, "");
    t = t.replace(/^[$€£¥]/, "");
    t = t.replace(/[.,]+$/, "");
    t = t.replace(/(?<=\d),(?=\d)/g, "");
    if (!t || /^[.,]+$/.test(t)) continue;
    out.add(t);
  }
  return Array.from(out);
}

export function invalidFigures(generatedText: string, sourceData: unknown): string[] {
  const source = JSON.stringify(sourceData).toLowerCase().replace(/\s+/g, "");
  return extractFigures(generatedText).filter((figure) => {
    // A substring check wrongly accepts "20" as grounded by a source value
    // of 120, or "20" by 20.5. Match an entire numeric token instead.
    const escaped = figure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(source);
  });
}

// A pay figure from a handful of postings is an anecdote, not a market. Below
// this many salary-stating postings no pay number is handed to the model or
// stored with the article, so a report can never publish a "median" built from
// one salary. The sample is annual USD midpoints (job_pay, USD only), so the
// currency basis is stated whenever pay is reported.
export const MIN_SALARY_SAMPLE = 10;

export function applySalaryFloor<T extends Record<string, unknown>>(data: T): T & { salary_note?: string; salary_basis?: string } {
  const n = Number(data?.salary_sample_size) || 0;
  const out: Record<string, unknown> = { ...data };
  if (n >= MIN_SALARY_SAMPLE) {
    out.salary_basis = 'Annual midpoints in US dollars, from postings in this market that state a USD salary.';
    return out as T;
  }
  for (const key of ['median_salary', 'p25_salary', 'p75_salary', 'salary_sample_size']) delete out[key];
  out.salary_note = `Fewer than ${MIN_SALARY_SAMPLE} postings in this market state a USD salary, so no pay figures are reported.`;
  return out as T;
}

export function hasEnoughPayData(data: Record<string, unknown>): boolean {
  return (Number(data?.salary_sample_size) || 0) >= MIN_SALARY_SAMPLE;
}
