import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeCategory, seniorityLabel } from "@/lib/jobPostingFormat";

interface Comparison {
  enough: boolean; sample: number; currency: string; category: string;
  city: string; seniority: string; annual_min: number; annual_max: number;
  median: number | null; p25: number | null; p75: number | null;
  vs_median_pct: number | null;
}

/** Only fetch for the opened detail, never for each card in a search result. */
export function JobPayComparison({ jobId }: { jobId: string }) {
  const q = useQuery({
    queryKey: ["job-pay-comparison", jobId], staleTime: 10 * 60_000, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("job_salary_comparison" as never, { p_job_id: jobId } as never);
      if (error) throw error;
      return data as unknown as Comparison | null;
    },
  });
  const p = q.data;
  const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: p!.currency, maximumFractionDigits: 0 }).format(v);
  if (q.isError) return <p className="text-xs text-muted-foreground">Market pay comparison is temporarily unavailable.</p>;
  if (!p || typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)
    || !Number.isFinite(p.annual_min) || !Number.isFinite(p.annual_max)) return null;
  return <section className="rounded-xl border p-4 space-y-2" aria-label="Salary versus advertised market pay">
    <h3 className="font-semibold text-sm">Salary vs advertised market</h3>
    <p className="text-sm">{money(p.annual_min)}–{money(p.annual_max)} per year ({p.currency})</p>
    {p.enough && p.median != null ? <>
      <p className="text-sm">This range's midpoint is {p.vs_median_pct === 0 ? "at" : `${Math.abs(p.vs_median_pct!)}% ${p.vs_median_pct! > 0 ? "above" : "below"}`} the advertised median of {money(p.median)}.</p>
      <p className="text-xs text-muted-foreground">Middle half of comparable ranges: {money(p.p25!)}–{money(p.p75!)}.</p>
    </> : <p className="text-sm text-muted-foreground">Only {p.sample} other comparable ranges; at least 20 are needed for a comparison.</p>}
    <p className="text-xs text-muted-foreground">Compared with {p.sample} other {humanizeCategory(p.category)} postings in {p.city}, at {seniorityLabel(p.seniority)} level, in {p.currency}. Annualized advertised base pay, not actual salaries or total compensation. No currency conversion.</p>
  </section>;
}
