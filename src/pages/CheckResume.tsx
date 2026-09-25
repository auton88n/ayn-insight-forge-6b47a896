import { useEffect, useState } from 'react';
import { SEO, createBreadcrumbSchema } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { SectionHeading } from '@/components/shared/SectionHeading';
import { Textarea } from '@/components/ui/textarea';
import { AuthModal } from '@/components/auth/AuthModal';
import { resumeCheckPublic, type ResumeCheckPublicResult } from '@/lib/resumeHub';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { reviewResumeText } from '@/lib/resumeTextReview';
import { ResumeCheckContinue } from '@/components/resume-hub/ResumeCheckContinue';
import '@/styles/resume-check.css';

// v3.200.0 — the public resume-vs-job checker. No account needed to use
// it: paste a resume and a job description, get the same literal keyword
// match AYN already runs internally for free (computeGap, zero AI cost,
// zero auth). The deeper AI-powered layer (catches a real match even when
// the wording doesn't line up, e.g. "led a team of 3" satisfying "team
// leadership experience") is the one thing gated behind signing up --
// same credit-metered pipeline every other AI action in the product
// already uses, not a new cost surface.
const CheckResume = () => {
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState(() => {
    try { const text = sessionStorage.getItem('ayn_check_jd') || ''; sessionStorage.removeItem('ayn_check_jd'); return text; }
    catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResumeCheckPublicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const findings = result ? reviewResumeText(resumeText) : [];

  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  const jsonLd = createBreadcrumbSchema([
    { name: 'Home', url: 'https://ayn.careers/' },
    { name: 'Check your resume', url: 'https://ayn.careers/check-resume' },
  ]);

  const canCheck = resumeText.trim().length > 0 && jdText.trim().length > 0 && !loading;

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await resumeCheckPublic(resumeText.trim(), jdText.trim());
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO
        title="Check Your Resume Against a Job, Free"
        description="Paste your resume and a job description for a free text-based review. See matching requirements and a few specific areas to review, with no account needed."
        canonical="/check-resume"
        jsonLd={jsonLd}
      />
      <div className="lp lp-shell-with-sidebar contact-surface resume-check-page">
        <SeekerSidebar />
        <main className="lp-sidebar-main">
        {/* v3.237.0 -- reported directly: every page needs to match in
            width and positioning. `container mx-auto max-w-3xl` was its
            own third convention (768px, centered), neither this page's
            own tabs' 1360px .lp-shell nor any other standalone route's
            width -- and the two-column resume/JD paste layout genuinely
            wants more room than 768px gives it, not less. Swapped to the
            same .lp-shell/.lp-section every tab uses, full width, no cap. */}
        <section className="lp-section">
        <div className="lp-shell">
          {/* v3.239.0 -- reported directly against a live screenshot: "missing
              highlitghts." Same gap as Salary guide -- a bare decorative bar
              with no label, never reached by the v3.236.0 eyebrow rebuild
              since this is its own standalone route, not a HomeTabs tab. */}
          <p className="lp-eyebrow">Check my resume</p>
          <h1 className="lp-display text-3xl md:text-4xl">Know what to improve before you apply.</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Compare your resume with a job description. Get a free wording check and up to three practical improvement opportunities. No account needed.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="resume-text" className="block text-sm font-semibold mb-2">Your resume</label>
              <Textarea
                id="resume-text"
                value={resumeText}
                onChange={(e) => { setResumeText(e.target.value); setResult(null); }}
                disabled={loading}
                placeholder="Paste your resume text here..."
                className="min-h-[220px]"
                maxLength={20000}
              />
            </div>
            <div>
              <label htmlFor="jd-text" className="block text-sm font-semibold mb-2">The job description</label>
              <Textarea
                id="jd-text"
                value={jdText}
                onChange={(e) => { setJdText(e.target.value); setResult(null); }}
                disabled={loading}
                placeholder="Paste the job posting text here..."
                className="min-h-[220px]"
                maxLength={20000}
              />
            </div>
          </div>

          {/* v3.235.0 -- was a shadcn Button with an inline background
              override to fake the site's own pill/ember look; now the
              real thing every other primary action already uses. */}
          <button
            type="button"
            className="lp-btn lp-btn-primary mt-6"
            disabled={!canCheck}
            onClick={runCheck}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Checking' : 'Check my resume'}
          </button>

          {error && (
            <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>
          )}

          {result && (
            <div className="mt-10 space-y-8" aria-live="polite">
              <section className="resume-check-review">
                <h2 className="lp-display text-2xl">{findings.length ? 'Where your resume can be clearer' : 'No obvious writing flags in this check'}</h2>
                <p className="mt-2">This is a limited text review, not an employer decision or a test of the original file’s layout.</p>
                {findings.length > 0 ? <ol className="resume-check-findings">
                  {findings.map(finding => <li key={finding.id}>
                    <h3 className="font-semibold">{finding.title}</h3>
                    {finding.excerpt && <blockquote>{finding.excerpt}</blockquote>}
                    <p>{finding.explanation}</p>
                  </li>)}
                </ol> : <p className="mt-3">That does not establish that the resume is complete or suitable for this role. Review the job requirements below.</p>}
              </section>
              {result.matchPct !== null && (
                <div className="rounded-xl border p-5" style={{ background: 'var(--accent, #fdf3ee)' }}>
                  <div className="text-sm font-semibold text-muted-foreground">Literal keyword match</div>
                  <div className="text-4xl font-bold mt-1" style={{ color: '#e85d3a' }}>{result.matchPct}%</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    AYN’s text-based requirement check. Different wording may hide relevant experience; this is not your likelihood of being hired.
                  </p>
                </div>
              )}

              {result.matched.length > 0 && (
                <div>
                  <SectionHeading>Requirements with matching text</SectionHeading>
                  <ul className="mt-3 space-y-2">
                    {result.matched.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.missing.length > 0 && (
                <div>
                  <SectionHeading>Requirements to check more closely</SectionHeading>
                  <p className="text-sm mt-2">Not found by this wording check does not mean you lack the skill. Rewriting cannot replace a qualification you do not have.</p>
                  <ul className="mt-3 space-y-2">
                    {result.missing.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.matched.length === 0 && result.missing.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Couldn't find clearly listed requirements in that job description. Try pasting a posting with a bulleted "Requirements" or "Qualifications" section for a real read.
                </p>
              )}

              <ResumeCheckContinue resumeText={resumeText} jdText={jdText} onSignIn={() => setAuthOpen(true)} />
            </div>
          )}
        </div>
        </section>
        <LandingFooter />
        </main>
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="job_seeker" initialTab="signup" />
    </>
  );
};

export default CheckResume;
