import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.0';

export function paidBaseRequestId(value: unknown): string {
  if (value == null) return crypto.randomUUID();
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid resume request identifier');
  }
  return value.toLowerCase();
}

export async function replayPaidBaseResume(admin: SupabaseClient, userId: string, action: string, id: string) {
  const { data, error } = await admin.from('ai_result_cache').select('payload')
    .eq('cache_key', `paid-base:v1:${userId}:${action}:${id}`).eq('user_id', userId).maybeSingle();
  if (error) throw error; // Do not regenerate when persistence is unavailable.
  return data?.payload ?? null;
}

export async function completePaidBaseResume(admin: SupabaseClient, userId: string, action: string, id: string, cost: number, result: Record<string, unknown>) {
  const { data, error } = await admin.rpc('complete_paid_base_resume', {
    p_user_id: userId, p_id: id, p_action: action, p_result: result, p_cost: cost,
  });
  if (error) throw error;
  if (!data) throw new Error('Resume completion returned no result');
  return data;
}
