import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2 } from "lucide-react";
import { humanizeCategory } from "@/lib/jobPostingFormat";

interface Result {
  enough: boolean;
  sample: number;
  currency?: string;
  p10?: number; p25?: number; median?: number; p75?: number; p90?: number;
  your_percentile?: number | null;
  vs_median_pct?: number | null;
}

const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD"];
const SYMBOL: Record<string, string> = { USD: "$", CAD: "CA$", GBP: "£", EUR: "€", AUD: "A$" };

/** "How does my pay compare?" Compares one yearly figure with the pay ranges real employers advertise for
 * similar roles. It says plainly that this is advertised pay, not what people are actually paid, and refuses
 * to answer when too few postings match. */
export function PayCheck({ categories }: { categories: Array<{ category: string }> }) {
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const money = (n: number | undefined) => (n == null ? "" : `${SYMBOL[currency] ?? ""}${Math.round(n).toLocaleString("en-US")}`);
  const yearly = Number(amount.replace(/[^0-9.]/g, ""));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !(yearly >= 1000)) return;
    setBusy(true); setFailed(false); setResult(null); setCopied(false);
    const { data, error } = await supabase.rpc("salary_market_check" as never, {
      p_category: category || null, p_title_query: title.trim() || null, p_city: city.trim() || null,
      p_currency: currency, p_amount: yearly,
    } as never);
    setBusy(false);
    if (error || !data) { setFailed(true); return; }
    setResult(data as unknown as Result);
  };

  const summary = result?.enough && result.median
    ? `I checked my pay of ${money(yearly)} a year against ${result.sample} advertised ranges for similar roles on AYN. The median advertised is ${money(result.median)}, and mine sits at the ${result.your_percentile}th percentile. (Advertised ranges, not actual pay.)`
    : "";

  const copy = async () => {
    try { await navigator.clipboard.writeText(summary + " https://ayn.careers/salary-guide"); setCopied(true); } catch { /* clipboard blocked */ }
  };

  // Where "you" sit between the 10th and 90th percentile, for the little bar.
  const pos = result?.enough && result.p10 != null && result.p90 != null && result.p90 > result.p10
    ? Math.max(0, Math.min(100, ((yearly - result.p10) / (result.p90 - result.p10)) * 100))
    : null;

  return (
    <section aria-labelledby="paycheck-h" className="rounded-2xl border p-5 md:p-6">
      <h2 id="paycheck-h" className="text-xl font-bold tracking-tight">How does your pay compare?</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        Enter a yearly figure and a role. AYN compares it with the pay ranges employers advertise for similar roles right now. Nothing you type is saved.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm grid gap-1">
          <span className="font-medium">Role</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm">
            <option value="">Any role</option>
            {categories.map((c) => <option key={c.category} value={c.category}>{humanizeCategory(c.category)}</option>)}
          </select>
        </label>
        <label className="text-sm grid gap-1">
          <span className="font-medium">Job title (optional)</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. product manager" maxLength={60} />
        </label>
        <label className="text-sm grid gap-1">
          <span className="font-medium">City (optional)</span>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Toronto" maxLength={60} />
        </label>
        <label className="text-sm grid gap-1">
          <span className="font-medium">Yearly pay</span>
          <div className="flex gap-2">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="Currency">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="120000" aria-label="Yearly pay" />
          </div>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !(yearly >= 1000)} className="w-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Compare"}
          </Button>
        </div>
      </form>

      {failed && <p className="mt-4 text-sm text-muted-foreground" role="alert">The comparison is unavailable right now. Try again shortly.</p>}

      {result && !result.enough && (
        <p className="mt-4 text-sm" role="status">
          Only {result.sample} advertised {currency} ranges match, which is too few to compare fairly. Try a broader role, remove the city, or leave the title blank.
        </p>
      )}

      {result?.enough && result.median != null && (
        <div className="mt-5" role="status">
          <p className="text-lg font-semibold">
            {money(yearly)} is {Math.abs(result.vs_median_pct ?? 0) < 3 ? "right at" : (result.vs_median_pct ?? 0) > 0 ? `${result.vs_median_pct}% above` : `${Math.abs(result.vs_median_pct ?? 0)}% below`} the median advertised {money(result.median)}.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            It sits above {result.your_percentile}% of the {result.sample} advertised ranges for similar roles.
          </p>
          {pos != null && (
            <div className="mt-4 max-w-xl">
              <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
                <div className="absolute h-2 rounded-full bg-primary/30" style={{ left: "0%", width: "100%" }} />
                <div className="absolute -top-1 h-4 w-1.5 rounded bg-primary" style={{ left: `calc(${pos}% - 3px)` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1.5 tabular-nums">
                <span>{money(result.p10)} (low 10%)</span><span>{money(result.median)} median</span><span>{money(result.p90)} (top 10%)</span>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4 max-w-2xl">
            This compares your pay with the middle of each advertised range, not with what people are actually paid. Employers often hire below or above the range they post, and pay changes with level and experience.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copy}>
            <Copy className="w-4 h-4 mr-1.5" />{copied ? "Copied" : "Copy this result"}
          </Button>
        </div>
      )}
    </section>
  );
}
