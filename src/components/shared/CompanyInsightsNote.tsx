import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Insights {
  open_roles: number;
  pay: { postings: number; with_pay: number; pct: number } | null;
  speed: { closed_tracked: number; median_days_open: number; typical_low_days: number; typical_high_days: number } | null;
}

/** What AYN has observed about a company: how openly it shows pay, and how long its roles really stay open.
 * Each line appears only once there is enough behind it; with nothing to say it renders nothing. Also the way
 * into the company's own page. */
export function CompanyInsightsNote({ slug, company, className }: { slug?: string | null; company: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["company-insights", slug],
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_insights" as never, { p_company_slug: slug } as never);
      if (error) throw error;
      return (data as unknown as Insights | null) ?? null;
    },
  });
  if (!data || !slug) return null;
  const speed = data.speed;
  const spread = speed && speed.typical_low_days !== speed.typical_high_days ? ` (usually ${speed.typical_low_days} to ${speed.typical_high_days})` : "";
  const showLines = !!data.pay || !!speed;
  if (!showLines && data.open_roles < 2) return null;
  return (
    <div className={className ?? "text-xs"} style={{ display: "grid", gap: 2 }}>
      {data.pay && (
        <p title="Share of this company's live postings that state a pay range, in the feed or in the posting text.">
          {company} shows pay on {data.pay.pct}% of its {data.pay.postings} open postings.
        </p>
      )}
      {speed && (
        <p title="Worked out from the time between AYN first seeing a posting and it being taken down. Only shown once enough closed postings have been tracked.">
          At {company}, roles typically stay open about {speed.median_days_open} days{spread}, based on {speed.closed_tracked} closed postings AYN has tracked.
        </p>
      )}
      <p>
        <Link to={`/companies/${encodeURIComponent(slug)}`} style={{ textDecoration: "underline" }}>
          See all {data.open_roles} open roles and hiring stats for {company}
        </Link>
      </p>
    </div>
  );
}
