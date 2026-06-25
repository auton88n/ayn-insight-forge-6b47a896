import { useState, useRef } from 'react';
import { Loader2, Copy, CheckCheck, Sparkles, CheckCircle2, XCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';

interface ComparisonRow {
  label: string;
  jobRequires: string;
  candidateHas: string;
  status: 'match' | 'partial' | 'miss';
}
interface Keyword { text: string; matched: boolean; }
interface ScoreResult {
  score: number; matchLabel: string; verdict: string;
  comparisonRows: ComparisonRow[]; keywords: Keyword[];
  suggestedEdits: string[]; redFlags: string[];
}

function normalizeResult(raw: unknown): ScoreResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  const validLabels = ['Poor', 'Fair', 'Good', 'Strong'];
  const rawLabel = String(r.matchLabel || '');
  const matchLabel = validLabels.includes(rawLabel) ? rawLabel
    : score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
  return {
    score, matchLabel,
    verdict: String(r.verdict || ''),
    comparisonRows: (Array.isArray(r.comparisonRows) ? r.comparisonRows : []).map((row: unknown) => {
      const ro = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        label: String(ro.label || ''), jobRequires: String(ro.jobRequires || ''),
        candidateHas: String(ro.candidateHas || ''),
        status: (['match','partial','miss'].includes(String(ro.status)) ? ro.status : 'miss') as 'match'|'partial'|'miss',
      };
    }),
    keywords: (Array.isArray(r.keywords) ? r.keywords : []).map((k: unknown) => {
      const kw = (k && typeof k === 'object' ? k : {}) as Record<string, unknown>;
      return { text: String(kw.text || ''), matched: Boolean(kw.matched) };
    }),
    suggestedEdits: Array.isArray(r.suggestedEdits) ? (r.suggestedEdits as string[]) : [],
    redFlags: Array.isArray(r.redFlags) ? (r.redFlags as string[]) : [],
  };
}

function ArcGauge({ score }: { score: number }) {
  const pct = score / 100;
  const cx = 100, cy = 105, r = 78;
  const startAngle = 145, totalDeg = 250;
  function polar(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  const ts = polar(startAngle), te = polar(startAngle + totalDeg), fe = polar(startAngle + pct * totalDeg);
  const trackLarge = totalDeg > 180 ? 1 : 0;
  const fillLarge = pct * totalDeg > 180 ? 1 : 0;
  const isGood = score >= 70, isMid = score >= 50 && score < 70;
  const arcColor = isGood ? '#22c55e' : isMid ? '#f59e0b' : '#ef4444';
  const textColor = isGood ? 'text-emerald-500' : isMid ? 'text-amber-500' : 'text-rose-500';
  const labelColor = isGood ? 'text-emerald-600 dark:text-emerald-400' : isMid ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500';
  const label = score >= 85 ? 'Strong Match' : score >= 70 ? 'Good Match' : score >= 50 ? 'Fair Match' : 'Low Match';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-52 h-36">
        <svg viewBox="0 0 200 160" className="w-full h-full">
          <path d={`M ${ts.x} ${ts.y} A ${r} ${r} 0 ${trackLarge} 1 ${te.x} ${te.y}`}
            fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-muted/25" />
          {pct > 0 && <path d={`M ${ts.x} ${ts.y} A ${r} ${r} 0 ${fillLarge} 1 ${fe.x} ${fe.y}`}
            fill="none" stroke={arcColor} strokeWidth="12" strokeLinecap="round" />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span className={cn('text-5xl font-bold font-mono tabular-nums leading-none', textColor)}>{score}</span>
          <span className="text-[11px] text-muted-foreground font-mono mt-0.5">out of 100</span>
        </div>
      </div>
      <span className={cn('text-xs font-bold font-mono uppercase tracking-widest mt-1', labelColor)}>{label}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'match') return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
  if (status === 'partial') return <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />;
  return <XCircle className="w-5 h-5 text-rose-500 shrink-0" />;
}

function Stepper({ step }: { step: number }) {
  const steps = ['See Your Difference', 'Align Your Resume', 'Review New Resume'];
  return (
    <div className="flex items-center justify-center gap-1 mb-10">
      {steps.map((label, i) => {
        const n = i + 1, isActive = step === n, isDone = step > n;
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                isActive ? 'bg-foreground text-background border-foreground' :
                isDone ? 'bg-emerald-500 text-white border-emerald-500' :
                'bg-transparent text-muted-foreground border-muted-foreground/30')}>
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
              </div>
              <span className={cn('text-xs font-mono hidden sm:block',
                isActive ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/30 mx-2 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

const ResumeMatch = () => {
  const { toast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState('');
  const [job, setJob] = useState('');
  const [step, setStep] = useState(1);
  const [scoring, setScoring] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [rewriteMarkdown, setRewriteMarkdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollToResults = () => setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);

  const handleScore = async () => {
    if (resume.trim().length < 50 || job.trim().length < 50) {
      toast({ title: 'Not enough content', description: 'Paste your full resume and job description (50+ characters each).', variant: 'destructive' });
      return;
    }
    setScoring(true); setResult(null); setRewriteMarkdown(null);
    try {
      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: { resume: resume.trim(), job: job.trim(), mode: 'score' },
      });
      if (error) throw new Error(error.message || 'Function error');
      if (data?.error) throw new Error(data.error);
      setResult(normalizeResult(data)); setStep(2); scrollToResults();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Something went wrong', variant: 'destructive' });
    } finally { setScoring(false); }
  };

  const handleRewrite = async () => {
    if (!result) return;
    setRewriting(true); setRewriteMarkdown(null);
    try {
      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: { resume: resume.trim(), job: job.trim(), mode: 'rewrite' },
      });
      if (error) throw new Error(error.message || 'Function error');
      if (data?.error) throw new Error(data.error);
      setRewriteMarkdown(data?.markdown || ''); setStep(3); scrollToResults();
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Something went wrong', variant: 'destructive' });
    } finally { setRewriting(false); }
  };

  const handleCopy = async () => {
    if (!rewriteMarkdown) return;
    await navigator.clipboard.writeText(rewriteMarkdown);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => { setStep(1); setResult(null); setRewriteMarkdown(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const matchedCount = result?.keywords.filter(k => k.matched).length ?? 0;

  return (
    <>
      <SEO title="Resume Match - AYN AI | See Your Fit Score"
        description="Paste your resume and a job description. Get an instant match score, keyword gaps, comparison table, and a one-click AI rewrite."
        canonical="/resume-match" />
      <div className="min-h-screen bg-background">
        <Header />
        <section className="pt-28 pb-20 px-6">
          <div className="container max-w-4xl mx-auto">

            <div className="text-center mb-8">
              <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-3 block">AI Career Tool</span>
              <h1 className="text-3xl md:text-5xl font-serif font-bold mb-3">Resume Match</h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                Paste your resume and a job posting. Know exactly where you stand before you apply.
              </p>
            </div>

            <Stepper step={step} />

            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Your Resume</label>
                    <Textarea value={resume} onChange={e => setResume(e.target.value)}
                      placeholder="Paste your full resume here..." rows={16}
                      className="bg-transparent border-2 border-border rounded-none text-sm resize-none focus:border-foreground focus:ring-0 hover:border-muted-foreground transition-all duration-200"
                      disabled={scoring} />
                    <p className="text-xs text-muted-foreground text-right">{resume.length} chars</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Job Description</label>
                    <Textarea value={job} onChange={e => setJob(e.target.value)}
                      placeholder="Paste the job description here..." rows={16}
                      className="bg-transparent border-2 border-border rounded-none text-sm resize-none focus:border-foreground focus:ring-0 hover:border-muted-foreground transition-all duration-200"
                      disabled={scoring} />
                    <p className="text-xs text-muted-foreground text-right">{job.length} chars</p>
                  </div>
                </div>
                <div className="flex justify-center pt-2">
                  <Button size="lg" onClick={handleScore} disabled={scoring}
                    className="h-12 px-10 rounded-none font-mono uppercase tracking-wider hover:shadow-2xl transition-all duration-300">
                    {scoring ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Analyzing...</>
                      : <>See Your Difference<ChevronRight className="ml-2 h-5 w-5" /></>}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && result && (
              <div ref={resultsRef} className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500">

                <div className={cn('border-2 p-6 flex flex-col md:flex-row items-center gap-6',
                  result.score >= 70 ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/10' :
                  result.score >= 50 ? 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10' :
                  'border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/10')}>
                  <ArcGauge score={result.score} />
                  <div className="flex-1 text-center md:text-left space-y-2">
                    <h2 className="text-xl md:text-2xl font-bold font-serif">
                      Your Resume is a {result.matchLabel === 'Poor' ? 'Low' : result.matchLabel} Match for This Job
                    </h2>
                    {result.verdict && <p className="text-sm text-muted-foreground leading-relaxed">{result.verdict}</p>}
                    {result.score < 70 && <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
                      Scores under 70 are likely to be filtered out — improve your resume below.
                    </p>}
                  </div>
                </div>

                {result.comparisonRows.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Requirement Comparison</p>
                    <div className="border border-border divide-y divide-border overflow-hidden">
                      <div className="grid grid-cols-[28px_1fr_1fr_1fr] gap-3 px-4 py-2 bg-muted/40">
                        <div /><p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Requirement</p>
                        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Job Asks For</p>
                        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Your Resume</p>
                      </div>
                      {result.comparisonRows.map((row, i) => (
                        <div key={i} className={cn('grid grid-cols-[28px_1fr_1fr_1fr] gap-3 px-4 py-3 items-start',
                          row.status === 'match' ? 'bg-emerald-50/30 dark:bg-emerald-950/10' :
                          row.status === 'partial' ? 'bg-amber-50/30 dark:bg-amber-950/10' : 'bg-rose-50/30 dark:bg-rose-950/10')}>
                          <StatusIcon status={row.status} />
                          <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground pt-0.5">{row.label}</span>
                          <span className="text-sm leading-snug">{row.jobRequires}</span>
                          <span className={cn('text-sm leading-snug',
                            row.status === 'match' ? 'text-emerald-700 dark:text-emerald-400' :
                            row.status === 'partial' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                          )}>{row.candidateHas}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.keywords.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                      Keywords ({matchedCount}/{result.keywords.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {result.keywords.map(kw => (
                        <span key={kw.text} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                          kw.matched ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-muted text-muted-foreground border-border')}>
                          {kw.matched && <CheckCircle2 className="w-3 h-3" />}{kw.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.suggestedEdits.length > 0 && (
                  <div className="border border-border p-5">
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Suggested Edits</p>
                    <ol className="space-y-3">
                      {result.suggestedEdits.map((edit, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="font-mono text-muted-foreground shrink-0 w-4 pt-px">{i + 1}.</span>
                          <span className="leading-relaxed">{edit}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {result.redFlags.length > 0 && (
                  <div className="border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-5">
                    <p className="text-xs font-mono uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-3">What a Recruiter Might Flag</p>
                    <ul className="space-y-2">
                      {result.redFlags.map((flag, i) => (
                        <li key={i} className="flex gap-2 text-sm text-rose-800 dark:text-rose-300">
                          <XCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button variant="outline" size="lg" onClick={handleReset}
                    className="h-12 px-8 rounded-none font-mono uppercase tracking-wider border-2">Start Over</Button>
                  <Button size="lg" onClick={handleRewrite} disabled={rewriting}
                    className="h-12 px-10 rounded-none font-mono uppercase tracking-wider hover:shadow-2xl transition-all duration-300">
                    {rewriting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Rewriting...</>
                      : <><Sparkles className="mr-2 h-5 w-5" />Improve My Resume for This Job</>}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && rewriteMarkdown && (
              <div ref={resultsRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold font-serif">Your Improved Resume</h2>
                    <p className="text-sm text-muted-foreground mt-1">Keywords woven in, facts kept true. Copy and paste into your resume editor.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopy}
                    className="rounded-none font-mono text-xs uppercase tracking-wider gap-2 border-2 shrink-0">
                    {copied ? <><CheckCheck className="h-4 w-4 text-emerald-500" />Copied</> : <><Copy className="h-4 w-4" />Copy All</>}
                  </Button>
                </div>
                <div className="border-2 border-border p-6 bg-muted/20">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground">{rewriteMarkdown}</pre>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button variant="outline" size="lg" onClick={() => { setStep(2); scrollToResults(); }}
                    className="h-12 px-8 rounded-none font-mono uppercase tracking-wider border-2">Back to Score</Button>
                  <Button variant="outline" size="lg" onClick={handleReset}
                    className="h-12 px-8 rounded-none font-mono uppercase tracking-wider border-2">Match Another Job</Button>
                </div>
              </div>
            )}

          </div>
        </section>
        <Footer />
      </div>
    </>
  );
};

export default ResumeMatch;
