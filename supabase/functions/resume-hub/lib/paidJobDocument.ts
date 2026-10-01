import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.0';
import { paidBaseRequestId } from './paidBaseResume.ts';

export async function prepareJobDocument(admin: SupabaseClient, user: string, action: string, job: unknown, request: unknown) {
  if (typeof job !== 'string' || !job) throw new Error('Select a saved job before generating a document');
  const jobId = paidBaseRequestId(job);
  const id = paidBaseRequestId(request);
  const { data: owned, error: ownershipError } = await admin.from('jobs').select('id').eq('id', jobId).eq('user_id', user).maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!owned) throw new Error('Saved job not found');
  const { data, error } = await admin.from('ai_result_cache').select('payload')
    .eq('cache_key', `paid-job:v1:${user}:${action}:${id}`).eq('user_id', user).maybeSingle();
  if (error) throw error;
  if (data?.payload && data.payload.jobId !== jobId) throw new Error('Request belongs to another job');
  return { id, jobId, replay: data?.payload ?? null };
}

export async function completeJobDocument(admin: SupabaseClient, user: string, action: string,
  pending: { id: string; jobId: string }, resumeId: string | null | undefined, result: Record<string, unknown>, cost: number) {
  if (!resumeId) throw new Error('Save a primary resume first');
  const { data, error } = await admin.rpc('complete_paid_job_document', {
    p_user_id: user, p_id: pending.id, p_job_id: pending.jobId, p_resume_id: resumeId,
    p_action: action, p_result: result, p_cost: cost,
  });
  if (error) throw error;
  if (!data) throw new Error('Document completion returned no result');
  return data;
}
