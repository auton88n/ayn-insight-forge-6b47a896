import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface HiringSpeed {
  closed_tracked: number;
  median_days_open: number;
  typical_low_days: number;
  typical_high_days: number;
}

/** How long this company's roles really stay open, from postings AYN has watched come and go. Shown only
 * once at least 5 closed postings have been tracked; before that it renders nothing at all. */
export function CompanyHiringSpeedNote({ slug, company, className }: { slug?: string | null; company: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["company-hiring-speed", slug],
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_hiring_speed" as never, { p_company_slug: slug } as never);
      if (error) throw error;
      return (data as unknown as HiringSpeed | null) ?? null;
    },
  });
  if (!data || !data.closed_tracked) return null;
  const spread = data.typical_low_days !== data.typical_high_days ? ` (usually ${data.typical_low_days} to ${data.typical_high_days})` : "";
  return (
    <p
      className={className ?? "text-xs"}
      title="Worked out from the time between AYN first seeing a posting and it being taken down. Only shown once enough closed postings have been tracked."
    >
      At {company}, roles typically stay open about {data.median_days_open} days{spread}, based on {data.closed_tracked} closed postings AYN has tracked.
    </p>
  );
}
