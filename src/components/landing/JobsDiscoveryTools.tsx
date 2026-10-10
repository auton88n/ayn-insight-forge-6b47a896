import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { resumeHubApi } from '@/lib/resumeHub';
import { supabase } from '@/integrations/supabase/client';
import { RoleFinderDialog, TrendingDialog } from '@/components/resume-hub/BrowseJobsDialogs';

// The existing discovery capabilities remain optional and lazy. Opening Jobs
// never starts either catalog sweep or imports this dialog bundle.
export default function JobsDiscoveryTools({ userId, onPickRole, onOpenProfile }: {
  userId: string; onPickRole: (title: string) => void; onOpenProfile: () => void;
}) {
  const [rolesOpen, setRolesOpen] = useState(false);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  const roles = useQuery({ queryKey: ['jobs-role-finder', userId], queryFn: () => resumeHubApi.roleFinder(), enabled: rolesOpen, staleTime: 60_000 });
  const trending = useQuery({ queryKey: ['jobs-trending', userId, city], queryFn: () => resumeHubApi.jobBoardTrending(city), enabled: trendingOpen, staleTime: 60_000 });
  const cities = useQuery({ queryKey: ['jobs-discovery-cities'], enabled: trendingOpen, staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('job_postings').select('city').not('city', 'is', null).limit(5000);
      if (error) throw error;
      return [...new Set((data || []).map(j => j.city).filter((s): s is string => !!s))].sort();
    } });
  return <>
    <div className="lp-browser-actions"><button className="lp-btn lp-btn-ghost" onClick={() => setRolesOpen(true)}>Explore roles</button><button className="lp-btn lp-btn-ghost" onClick={() => setTrendingOpen(true)}>Trending</button></div>
    <RoleFinderDialog open={rolesOpen} onOpenChange={setRolesOpen} loading={roles.isPending} error={roles.isError} roles={roles.data?.roles || null} hasProfile={roles.data?.has_profile ?? true} onRetry={() => roles.refetch()} onPick={title => { setRolesOpen(false); onPickRole(title); }} onOpenProfile={onOpenProfile} />
    <TrendingDialog open={trendingOpen} onOpenChange={setTrendingOpen} cities={cities.data || []} city={city} onPickCity={setCity} loading={trending.isPending} error={trending.isError} data={trending.data || null} onRetry={() => trending.refetch()} />
  </>;
}
