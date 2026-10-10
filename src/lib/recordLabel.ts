/** Human-readable display only; API keys, filters and stored values are unchanged. */
export function recordLabel(value?: string | null): string {
  if (!value?.trim()) return 'Not recorded';
  const labels: Record<string, string> = {
    pending_approval: 'Awaiting approval', past_due: 'Payment overdue',
    trialing: 'In trial', job_seeker: 'Job seeker', c_level: 'Executive',
    seeker_free: 'Job seeker · Free', employer_trial: 'Employer · Trial',
    resume_optimize: 'Resume optimization', resume_generate: 'Resume generation',
  };
  return labels[value] || value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./u, c => c.toUpperCase());
}
