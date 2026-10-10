import { useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JobPosting } from '@/lib/resumeHub';
import { cleanApplyUrl } from '@/lib/applyUrl';
import { savedJobsQueryKey } from '@/lib/queryKeys';
import { toast } from 'sonner';

/** Account data is owner-keyed and disabled for public visitors. Paid actions
 * stay in Saved jobs; this hook only uses the existing free board score/save. */
export function useJobsAccount(userId: string | null, matches: boolean, pages: Array<{ rows: Array<Omit<JobPosting, 'description'> & { description?: string }> }> = []) {
  const client = useQueryClient();
  const saving = useRef(false);
  const profile = useQuery({
    queryKey: ['jobs-resume-version', userId], enabled: !!userId && matches,
    queryFn: async () => {
      const { data, error } = await supabase.from('resumes').select('id,updated_at').eq('user_id', userId!).eq('is_primary', true).maybeSingle();
      if (error) throw error;
      return data;
    }, staleTime: 0,
  });
  const scores = useQueries({ queries: (userId && matches ? pages : []).map(page => ({
    queryKey: ['jobs-match-scores', userId, profile.data?.id, profile.data?.updated_at, page.rows.map(j => [j.id, j.description])],
    enabled: !!userId && matches && profile.isSuccess && !!profile.data && page.rows.length > 0,
    queryFn: async () => {
      const { resumeHubApi } = await import('@/lib/resumeHub');
      const result = await resumeHubApi.jobBoardScore(page.rows.map(j => ({ id: j.id, title: j.title, description: j.description || '', skills: j.skills })));
      return result.scores;
    }, staleTime: 60_000, retry: 1,
  })) });
  const saved = useQuery({
    queryKey: ['jobs-saved-links', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select('id,source_url').eq('user_id', userId!);
      if (error) throw error;
      return data || [];
    }, staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: async (job: JobPosting) => {
      if (!userId) throw new Error('Sign in to save jobs.');
      const url = cleanApplyUrl(job.apply_url);
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('This posting does not have a valid application link.');
      const find = () => supabase.from('jobs').select('id').eq('user_id', userId).in('source_url', [job.apply_url, url]).limit(1).maybeSingle();
      const existing = await find();
      if (existing.error) throw existing.error;
      if (existing.data) return existing.data.id;
      const result = await supabase.from('jobs').insert({ user_id: userId, source: 'job_board', source_url: url,
        title: job.title, company: job.company, location: job.location, jd_text: job.description }).select('id').single();
      // The unique URL constraint is the final race guard; preparation must
      // still open the existing row when a competing save wins.
      if (result.error?.code === '23505') {
        const raced = await find();
        if (raced.error) throw raced.error;
        if (raced.data) return raced.data.id;
      }
      if (result.error) throw result.error;
      return result.data.id;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: savedJobsQueryKey(userId!) });
      client.invalidateQueries({ queryKey: ['jobs-saved-links', userId] });
    },
  });
  const saveJob = async (job: JobPosting, onSaved?: (id: string) => void) => {
    if (saving.current) return;
    saving.current = true;
    try {
      const id = await save.mutateAsync(job);
      if (onSaved) onSaved(id); else toast.success('Saved. Find this role in Saved jobs.');
    } catch { toast.error('This job could not be saved. Please try again.'); }
    finally { saving.current = false; }
  };
  const scoreMap = new Map(scores.flatMap(result => result.data || []).map(s => [s.id, s.match_pct]));
  return { saveJob, saving: save.isPending, savedUrls: new Set((saved.data || []).map(j => cleanApplyUrl(j.source_url))),
    scoreMap, scoring: !!userId && matches && (profile.isPending || scores.some(s => s.isFetching)), scoreError: scores.some(s => s.isError) || profile.isError,
    noResume: profile.isSuccess && !profile.data, retryScores: () => { profile.refetch(); scores.forEach(s => s.refetch()); } };
}
