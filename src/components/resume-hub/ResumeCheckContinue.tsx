import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { resumeHubApi } from '@/lib/resumeHub';
import { createPendingResumeOperation } from '@/lib/pendingResumeOperation';
import { HOME_TAB_HANDOFF_KEY } from '@/components/landing/HomeTabs';
import type { Json } from '@/integrations/supabase/types';

export function ResumeCheckContinue({ resumeText, jdText, onSignIn }: {
  resumeText: string; jdText: string; onSignIn: () => void;
}) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<'optimize' | 'tailor'>('tailor');
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setUserId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null); setConsent(false);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  const operation = useMemo(() => createPendingResumeOperation<Awaited<ReturnType<typeof resumeHubApi.parseFile>>>(), [userId, resumeText, jdText]);
  useEffect(() => { setConsent(false); setError(''); }, [resumeText, jdText]);

  const continueToWorkspace = async () => {
    if (!userId) { onSignIn(); return; }
    if (!consent || busy) return;
    setBusy(true); setError('');
    let savedJobId = '';
    try {
      await operation.run(async () => {
        const bytes = new TextEncoder().encode(resumeText);
        return resumeHubApi.parseFile(btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')), 'text/plain');
      }, async (parsed, id) => {
        const { data } = await supabase.auth.getUser();
        if (data.user?.id !== userId) throw new Error('Your session changed. Please sign in again.');
        // Save the JD first. Both steps are idempotent; a partial failure
        // leaves useful owned data and never deletes the previous resume.
        const { error: jobError } = await supabase.from('jobs').upsert({
          id, user_id: userId, source: 'manual', title: 'Job from resume check', jd_text: jdText,
        }, { onConflict: 'id' });
        if (jobError) throw jobError;
        savedJobId = id;
        const { error: resumeError } = await supabase.rpc('save_primary_resume', {
          p_id: id, p_title: 'Resume from your free check', p_content: parsed.resume as unknown as Json,
          p_ats_score: null, p_ats_issues: [],
        });
        if (resumeError) throw resumeError;
      });
      // Tailoring also reads canonical profile facts. Always review Profile
      // first rather than silently combining this draft with an older profile.
      sessionStorage.setItem(HOME_TAB_HANDOFF_KEY, 'profile');
      if (intent === 'tailor') sessionStorage.setItem('ayn_focus_job', savedJobId);
      navigate('/');
    } catch {
      setError('Could not finish saving. Keep this page open and retry. Any received resume extraction will be reused. No optimization or tailoring charge was made.');
    } finally { setBusy(false); }
  };

  return <section className="resume-check-next" aria-labelledby="resume-check-next-title">
    <h2 id="resume-check-next-title" className="lp-display text-2xl">Turn the review into a finished resume</h2>
    <p>Choose the work you need. Next, review your saved resume and profile together. Saving a document does not overwrite your profile facts.</p>
    <fieldset disabled={busy} className="mt-5 space-y-3">
      <legend className="font-semibold mb-2">Your next step</legend>
      <label className="flex gap-3 items-start"><input type="radio" name="resume-next" checked={intent === 'tailor'} onChange={() => setIntent('tailor')} /><span>Tailor for this job <span className="block text-sm">2 credits. Align supported experience with this job.</span></span></label>
      <label className="flex gap-3 items-start"><input type="radio" name="resume-next" checked={intent === 'optimize'} onChange={() => setIntent('optimize')} /><span>Optimize my base resume <span className="block text-sm">15 credits. Improve the writing across your resume.</span></span></label>
    </fieldset>
    {userId && <label className="flex gap-3 items-start mt-5 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Save this pasted resume as my active resume and save the job description to my account. Retain my previous resume. I will check the extracted content before paying.</span></label>}
    <button type="button" className="lp-btn lp-btn-primary mt-5" disabled={busy || (!!userId && !consent)} onClick={continueToWorkspace}>
      {busy ? 'Saving your draft…' : userId ? 'Save draft and continue' : 'Create an account or sign in'}
    </button>
    <p className="text-sm mt-3">No charge to save. The free check sends your text for analysis; saving it to your account is a separate choice. Keep this tab open during signup; refreshing clears the draft.</p>
    <p className="text-sm mt-3">{intent === 'tailor' ? 'After reviewing Profile, open Saved jobs and select “Job from resume check” to tailor it.' : 'After reviewing Profile, use Optimize to improve your base resume.'}</p>
    {error && <p role="alert" className="text-sm mt-3 text-destructive">{error}</p>}
  </section>;
}
