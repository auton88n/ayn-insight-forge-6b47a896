import { useState } from 'react';
import { Loader2, Copy, CheckCheck, FileSearch, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';

interface ScoreResult {
  score: number;
  verdict: string;
  missingKeywords: string[];
  matchedStrengths: string[];
  suggestedEdits: string[];
  redFlags: string[];
}

function normalizeScoreResult(raw: unknown): ScoreResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    score: Math.max(0, Math.min(10, Math.round(Number(r.score) || 0))),
    verdict: String(r.verdict || ''),
    missingKeywords: Array.isArray(r.missingKeywords) ? (r.missingKeywords as string[]) : [],
    matchedStrengths: Array.isArray(r.matchedStrengths) ? (r.matchedStrengths as string[]) : [],
    suggestedEdits: Array.isArray(r.suggestedEdits) ? (r.suggestedEdits as string[]) : [],
    redFlags: Array.isArray(r.redFlags) ? (r.redFlags as string[]) : [],
  };
}

function ScoreGauge({ score }: { score: number }) {
  const isLow = score < 5;
  const isMid = score >= 5 && score < 7.5;
  const isHigh = score >= 7.5;

  const colorClass = isHigh
    ? 'text-emerald-500 border-emerald-500'
    : isMid
    ? 'text-amber-500 border-amber-500'
    : 'text-rose-500 border-rose-500';

  const bgClass = isHigh
    ? 'bg-emerald-50 dark:bg-emerald-950/30'
    : isMid
    ? 'bg-amber-50 dark:bg-amber-950/30'
    : 'bg-rose-50 dark:bg-rose-950/30';

  const label = isHigh ? 'Strong Match' : isMid ? 'Fair Match' : 'Low Match';

  return (
    <div className={cn('flex flex-col items-center py-8 px-6 rounded-lg border-2', colorClass, bgClass)}>
      <div className={cn('text-7xl font-bold font-mono tabular-nums', colorClass)}>
        {score}<span className="text-3xl font-normal opacity-60">/10</span>
      </div>
      <div className={cn('mt-2 text-sm font-mono uppercase tracking-widest font-semibold', colorClass)}>
        {label}
      </div>
    </div>
  );
}

const ResumeMatch = () => {
  const { toast } = useToast();

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setScoring(false);
    }
  };

  const handleRewrite = async () => {
    if (!result) return;
    if (resume.trim().length < 50 || job.trim().length < 50) return;

    setRewriting(true);
    setRewriteMarkdown(null);

    try {
      const { data, error } = await supabase.functions.invoke('resume-match', {
        body: { resume: resume.trim(), job: job.trim(), mode: 'rewrite' },
      });

      if (error) throw new Error(error.message || 'Function error');
      if (data?.error) throw new Error(data.error);

      setRewriteMarkdown(data?.markdown || '');
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

  return (
    <>
      <SEO
        title="Resume Match - AYN AI | See How Well You Fit"
        description="Paste your resume and a job description. Get an instant match score, keyword gaps, and a one-click AI rewrite tailored to the role."
        canonical="/resume-match"
      />
      <div className="min-h-screen bg-background">
        <Header />

        <section className="pt-32 pb-16 px-6">
          <div className="container max-w-5xl mx-auto">

            {/* Hero */}
            <div className="text-center mb-10 md:mb-14">
              <span className="text-sm font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
                AI Career Tool
              </span>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-serif font-bold mb-4">
                Resume Match
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
                Paste your resume and a job description. Get a match score, keyword gaps, and a tailored rewrite in seconds.
              </p>
            </div>

            {/* Input area */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                  Your Resume
                </label>
                <Textarea
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  placeholder="Paste your full resume here..."
                  rows={14}
                  className={cn(
                    'bg-transparent border-2 border-border rounded-none text-sm transition-all duration-300 resize-none',
                    'focus:border-foreground focus:ring-0',
                    'hover:border-muted-foreground'
                  )}
                  disabled={scoring || rewriting}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                  Job Description
                </label>
                <Textarea
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="Paste the job description here..."
                  rows={14}
                  className={cn(
                    'bg-transparent border-2 border-border rounded-none text-sm transition-all duration-300 resize-none',
                    'focus:border-foreground focus:ring-0',
                    'hover:border-muted-foreground'
                  )}
                  disabled={scoring || rewriting}
                />
              </div>
            </div>

            {/* Primary CTA */}
            <div className="flex justify-center mb-12">
              <Button
                size="lg"
                onClick={handleScore}
                disabled={scoring || rewriting}
                className="h-14 px-10 rounded-none font-mono uppercase tracking-wider transition-all duration-300 hover:shadow-2xl"
              >
                {scoring ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <FileSearch className="mr-2 h-5 w-5" />
                    Check My Match
                  </>
                )}
              </Button>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Score + verdict */}
                <div className="grid md:grid-cols-3 gap-6 items-start">
                  <div className="md:col-span-1">
                    <ScoreGauge score={result.score} />
                  </div>
                  <div className="md:col-span-2 flex flex-col justify-center space-y-4 py-2">
                    {result.verdict && (
                      <p className="text-base md:text-lg text-foreground leading-relaxed border-l-2 border-foreground pl-4">
                        {result.verdict}
                      </p>
                    )}

                    {/* Missing keywords */}
                    {result.missingKeywords.length > 0 && (
                      <div>
                        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Missing Keywords</p>
                        <div className="flex flex-wrap gap-2">
                          {result.missingKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Matched strengths */}
                    {result.matchedStrengths.length > 0 && (
                      <div>
                        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">Where You Align</p>
                        <div className="flex flex-wrap gap-2">
                          {result.matchedStrengths.map((s) => (
                            <span
                              key={s}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

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

                {/* Improve CTA */}
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleRewrite}
                    disabled={rewriting || scoring}
                    className="h-14 px-10 rounded-none font-mono uppercase tracking-wider border-2 transition-all duration-300 hover:shadow-xl"
                  >
                    {rewriting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Rewriting Resume...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-5 w-5" />
                        Improve My Resume for This Job
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Rewrite result */}
            {rewriteMarkdown && (
              <div className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Improved Resume</p>
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
