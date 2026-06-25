import { useState } from 'react';
import { Loader2, Copy, CheckCheck, FileSearch, Sparkles, Check, AlertTriangle, X, ArrowRight } from 'lucide-react';
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

interface Keyword {
  text: string;
  matched: boolean;
}

interface ScoreResult {
  score: number;
  matchLabel: 'Poor' | 'Fair' | 'Good' | 'Strong';
  verdict: string;
  comparisonRows: ComparisonRow[];
  keywords: Keyword[];
  suggestedEdits: string[];
  redFlags: string[];
}

type Step = 1 | 2 | 3;

function labelFromScore(score: number): ScoreResult['matchLabel'] {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
}

function normalizeScoreResult(raw: unknown): ScoreResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));

  const rawRows = Array.isArray(r.comparisonRows) ? r.comparisonRows : [];
  const comparisonRows: ComparisonRow[] = rawRows.slice(0, 6).map((row) => {
    const o = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const status = o.status === 'match' || o.status === 'partial' || o.status === 'miss' ? o.status : 'miss';
    return {
      label: String(o.label || ''),
      jobRequires: String(o.jobRequires || ''),
      candidateHas: String(o.candidateHas || ''),
      status: status as ComparisonRow['status'],
    };
  });

  const rawKw = Array.isArray(r.keywords) ? r.keywords : [];
  const keywords: Keyword[] = rawKw.slice(0, 10).map((k) => {
    const o = (k && typeof k === 'object' ? k : {}) as Record<string, unknown>;
    return { text: String(o.text || ''), matched: Boolean(o.matched) };
  }).filter((k) => k.text);

  const allowed = r.matchLabel === 'Poor' || r.matchLabel === 'Fair' || r.matchLabel === 'Good' || r.matchLabel === 'Strong';
  const matchLabel = allowed ? (r.matchLabel as ScoreResult['matchLabel']) : labelFromScore(score);

  return {
    score,
    matchLabel,
    verdict: String(r.verdict || ''),
    comparisonRows,
    keywords,
    suggestedEdits: Array.isArray(r.suggestedEdits) ? (r.suggestedEdits as string[]).slice(0, 5).map(String) : [],
    redFlags: Array.isArray(r.redFlags) ? (r.redFlags as string[]).slice(0, 4).map(String) : [],
  };
}

function colorForScore(score: number) {
  if (score >= 70) return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-500' };
  if (score >= 50) return { stroke: '#f59e0b', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500' };
  return { stroke: '#f43f5e', text: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-500' };
}

function ArcGauge({ score, label }: { score: number; label: string }) {
  const colors = colorForScore(score);
  // Arc geometry: semicircle from (20,120) to (220,120), radius 100, center (120,120)
  const radius = 100;
  const cx = 120;
  const cy = 120;
  const circumference = Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circumference * pct;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 150" className="w-full max-w-[260px]">
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-muted opacity-30"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 900ms ease-out' }}
        />
        <text x={cx} y={cy - 10} textAnchor="middle" className={cn('font-mono font-bold', colors.text)} style={{ fontSize: '46px', fill: 'currentColor' }}>
          {score}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '12px' }}>
          out of 100
        </text>
      </svg>
      <div className={cn('mt-2 px-4 py-1 rounded-full text-xs font-mono uppercase tracking-widest font-semibold border', colors.text, colors.border, colors.bg)}>
        {label} Match
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ComparisonRow['status'] }) {
  if (status === 'match') return <Check className="h-4 w-4 text-emerald-500" />;
  if (status === 'partial') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <X className="h-4 w-4 text-rose-500" />;
}

function Stepper({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'See Your Difference' },
    { n: 2, label: 'Align Your Resume' },
    { n: 3, label: 'Review New Resume' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 md:gap-4 mb-10">
      {steps.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <div key={s.n} className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full border-2 font-mono text-xs font-bold transition-colors',
                  active && 'bg-foreground text-background border-foreground',
                  done && 'bg-emerald-500 text-white border-emerald-500',
                  !active && !done && 'border-border text-muted-foreground'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : s.n}
              </div>
              <span
                className={cn(
                  'hidden md:inline text-xs font-mono uppercase tracking-wider',
                  active ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

const ResumeMatch = () => {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [resume, setResume] = useState('');
  const [job, setJob] = useState('');
  const [scoring, setScoring] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [rewriteMarkdown, setRewriteMarkdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleScore = async () => {
    if (resume.trim().length < 50 || job.trim().length < 50) {
      toast({
        title: 'Too short',
        description: 'Please paste your full resume and job description (at least 50 characters each).',
        variant: 'destructive',
      });
      return;
    }

    setScoring(true);
    setResult(null);
    setRewriteMarkdown(null);

    try {
      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: { resume: resume.trim(), job: job.trim(), mode: 'score' },
      });

      if (error) throw new Error(error.message || 'Function error');
      if (data?.error) throw new Error(data.error);

      setResult(normalizeScoreResult(data));
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setScoring(false);
    }
  };

  const handleRewrite = async () => {
    if (!result) return;
    setRewriting(true);
    setRewriteMarkdown(null);

    try {
      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: { resume: resume.trim(), job: job.trim(), mode: 'rewrite' },
      });

      if (error) throw new Error(error.message || 'Function error');
      if (data?.error) throw new Error(data.error);

      setRewriteMarkdown(data?.markdown || '');
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setRewriting(false);
    }
  };

  const handleCopy = async () => {
    if (!rewriteMarkdown) return;
    await navigator.clipboard.writeText(rewriteMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setStep(1);
    setResult(null);
    setRewriteMarkdown(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <SEO
        title="Resume Match - AYN AI | See How Well You Fit"
        description="Paste your resume and a job description. Get an instant match score, requirement-by-requirement comparison, and a one-click AI rewrite tailored to the role."
        canonical="/resume-match"
      />
      <div className="min-h-screen bg-background">
        <Header />

        <section className="pt-32 pb-16 px-6">
          <div className="container max-w-5xl mx-auto">

            {/* Hero */}
            <div className="text-center mb-10">
              <span className="text-sm font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
                AI Career Tool
              </span>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4">
                Resume Match
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
                Paste your resume and a job description. See exactly where you fit, where you fall short, and how to fix it.
              </p>
            </div>

            <Stepper step={step} />

            {/* STEP 1: Input */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-2">
                    <label className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Your Resume</label>
                    <Textarea
                      value={resume}
                      onChange={(e) => setResume(e.target.value)}
                      placeholder="Paste your full resume here..."
                      rows={14}
                      className="bg-transparent border-2 border-border rounded-none text-sm focus:border-foreground focus:ring-0 hover:border-muted-foreground transition-all duration-300 resize-none"
                      disabled={scoring}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Job Description</label>
                    <Textarea
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      placeholder="Paste the job description here..."
                      rows={14}
                      className="bg-transparent border-2 border-border rounded-none text-sm focus:border-foreground focus:ring-0 hover:border-muted-foreground transition-all duration-300 resize-none"
                      disabled={scoring}
                    />
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={handleScore}
                    disabled={scoring}
                    className="h-14 px-10 rounded-none font-mono uppercase tracking-wider transition-all duration-300 hover:shadow-2xl"
                  >
                    {scoring ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Analyzing...</>
                    ) : (
                      <><FileSearch className="mr-2 h-5 w-5" />See Your Difference</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: Score + comparison */}
            {step === 2 && result && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Gauge + verdict */}
                <div className="grid md:grid-cols-3 gap-8 items-center">
                  <div className="md:col-span-1 flex justify-center">
                    <ArcGauge score={result.score} label={result.matchLabel} />
                  </div>
                  <div className="md:col-span-2">
                    {result.verdict && (
                      <p className="text-base md:text-lg text-foreground leading-relaxed border-l-2 border-foreground pl-4">
                        {result.verdict}
                      </p>
                    )}
                  </div>
                </div>

                {/* Comparison table */}
                {result.comparisonRows.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Requirement Comparison</p>
                    <div className="border border-border overflow-hidden">
                      <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-muted/40 text-xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                        <div className="col-span-1"></div>
                        <div className="col-span-3">Requirement</div>
                        <div className="col-span-4">Job Wants</div>
                        <div className="col-span-4">You Have</div>
                      </div>
                      {result.comparisonRows.map((row, i) => (
                        <div
                          key={i}
                          className={cn(
                            'grid md:grid-cols-12 gap-2 md:gap-4 px-4 py-4 text-sm',
                            i !== result.comparisonRows.length - 1 && 'border-b border-border'
                          )}
                        >
                          <div className="md:col-span-1 flex items-start">
                            <StatusIcon status={row.status} />
                          </div>
                          <div className="md:col-span-3 font-semibold">{row.label}</div>
                          <div className="md:col-span-4 text-muted-foreground">
                            <span className="md:hidden font-mono text-[10px] uppercase tracking-wider block mb-1">Job wants</span>
                            {row.jobRequires}
                          </div>
                          <div className="md:col-span-4">
                            <span className="md:hidden font-mono text-[10px] uppercase tracking-wider block mb-1 text-muted-foreground">You have</span>
                            {row.candidateHas}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Keywords */}
                {result.keywords.length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Job Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {result.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border',
                            kw.matched
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-muted text-muted-foreground border-border'
                          )}
                        >
                          {kw.matched && <Check className="h-3 w-3" />}
                          {kw.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested edits */}
                {result.suggestedEdits.length > 0 && (
                  <div className="border border-border p-6">
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Suggested Edits</p>
                    <ol className="space-y-3">
                      {result.suggestedEdits.map((edit, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="font-mono text-muted-foreground shrink-0 w-5 text-right">{i + 1}.</span>
                          <span>{edit}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Red flags */}
                {result.redFlags.length > 0 && (
                  <div className="border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 p-6">
                    <p className="text-xs font-mono uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-4">What a Recruiter Might Flag</p>
                    <ul className="space-y-2">
                      {result.redFlags.map((flag, i) => (
                        <li key={i} className="flex gap-2 text-sm text-rose-800 dark:text-rose-300">
                          <span className="shrink-0 mt-0.5">&#9655;</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleReset}
                    className="h-13 px-8 rounded-none font-mono uppercase tracking-wider border-2"
                  >
                    Start Over
                  </Button>
                  <Button
                    size="lg"
                    onClick={handleRewrite}
                    disabled={rewriting}
                    className="h-14 px-10 rounded-none font-mono uppercase tracking-wider transition-all duration-300 hover:shadow-2xl"
                  >
                    {rewriting ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Aligning...</>
                    ) : (
                      <><Sparkles className="mr-2 h-5 w-5" />Align My Resume</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Rewrite */}
            {step === 3 && rewriteMarkdown && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Your Aligned Resume</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="font-mono text-xs uppercase tracking-wider gap-2"
                  >
                    {copied ? (
                      <><CheckCheck className="h-4 w-4 text-emerald-500" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4" /> Copy</>
                    )}
                  </Button>
                </div>
                <div className="border border-border p-6 bg-muted/30">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                    {rewriteMarkdown}
                  </pre>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="h-13 px-8 rounded-none font-mono uppercase tracking-wider border-2"
                  >
                    Back to Score
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleReset}
                    className="h-13 px-8 rounded-none font-mono uppercase tracking-wider border-2"
                  >
                    Match Another Job
                  </Button>
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
