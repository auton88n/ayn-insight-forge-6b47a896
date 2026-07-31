// v3.14.0 — seeker pricing. Credits buy the two things that cost real
// model time: a tailored resume (2 credits) and a cover letter (1 credit).
// Everything else is free forever on every plan. Payments are not wired
// yet, so choosing a plan records the intent and the team follows up.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SEO } from '@/components/shared/SEO';
import { AuthModal } from '@/components/auth/AuthModal';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { billingApi, priceLabel, type SeekerBilling } from '@/lib/billing';
import { toast } from 'sonner';

const PLANS = [
  { key: 'seeker_free', name: 'Free', cents: 0, interval: 'month', credits: 6, line: 'Three tailored resumes a month, or six cover letters.' },
  { key: 'seeker_week', name: 'Week pass', cents: 499, interval: 'week', credits: 30, line: 'For the week you are applying hard.' },
  { key: 'seeker_starter', name: 'Starter', cents: 1200, interval: 'month', credits: 80, line: 'A steady search, around forty tailored resumes.' },
  { key: 'seeker_pro', name: 'Pro', cents: 2400, interval: 'month', credits: 200, line: 'A full time search with room to spare.' },
];

const FREE_FOREVER = [
  'Match scoring on any job page',
  'Ask AYN about the role you are reading',
  'The Chrome extension',
  'Your profile and your resume',
  'Being discovered by employers',
  'Receiving and answering proposals',
  'Taking assessments',
  'Downloading every document you make',
];

const EMPLOYER_STEPS = [
  { title: 'Request access', line: 'Tell us the company and the role you are hiring for.' },
  { title: 'We approve you', line: 'A person reviews it. We keep the pool small on purpose.' },
  { title: 'A free month', line: 'Search, contact candidates and send assessments, no card needed.' },
  { title: 'Then a plan', line: 'Priced by how many candidates you contact, from $199 a month.' },
];


const Pricing = () => {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [billing, setBilling] = useState<SeekerBilling | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setSignedIn(false); return; }
      setSignedIn(true);
      try { setBilling(await billingApi.seeker()); } catch { /* silent */ }
    })();
  }, []);

  const choose = async (key: string) => {
    if (!signedIn) { setShowAuth(true); return; }
    if (key === 'seeker_free') { navigate('/resume-hub'); return; }
    setBusy(key);
    try {
      const url = await billingApi.checkout(key);
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };


  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Pricing | AYN"
        description="AYN credits pay for tailored resumes and cover letters. Match scoring, Ask AYN, the extension and being discovered by employers are free on every plan."
      />
      <Header />

      <main className="flex-1 pt-28 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-4 mb-10">
            <Badge className="ayn-ember-badge">Pricing</Badge>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Pay for the writing, nothing else</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A tailored resume costs 2 credits. A cover letter costs 1. That is the whole meter.
              Scoring a job, asking AYN about it, the extension, and being found by employers are free forever, on every plan.
            </p>
          </div>

          {billing && (
            <div className="mb-10 mx-auto max-w-xl rounded-2xl border bg-card p-5 text-center">
              <p className="text-sm text-muted-foreground">
                You are on {billing.plan?.name || 'Free'} with{' '}
                <span className="font-semibold text-foreground">{billing.balance} credits</span> left.
                {billing.current_period_end
                  ? ` Credits reset on ${new Date(billing.current_period_end).toLocaleDateString()}.`
                  : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Unused credits do not roll over.</p>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {PLANS.map(p => {
              const current = billing?.plan?.key === p.key;
              return (
                <div
                  key={p.key}
                  className={cn(
                    'rounded-2xl border bg-card p-6 flex flex-col transition-all duration-500 hover:-translate-y-1',
                    p.key === 'seeker_starter' && 'border-primary shadow-lg',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">{p.name}</h2>
                    {current && <Badge variant="secondary">Your plan</Badge>}
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{priceLabel(p.cents, p.interval)}</p>
                  <p className="mt-2 text-sm text-primary font-medium">{p.credits} credits</p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{p.line}</p>
                  <Button
                    className="mt-5 w-full"
                    variant={p.key === 'seeker_starter' ? 'default' : 'outline'}
                    disabled={current || busy === p.key}
                    onClick={() => choose(p.key)}
                  >
                    {busy === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : current ? 'Current plan' : p.cents === 0 ? 'Start free' : 'Choose plan'}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-14 rounded-2xl border bg-card p-7">
            <h2 className="font-semibold">Free on every plan, including Free</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {FREE_FOREVER.map(f => (
                <div key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
              Regenerating the same document for the same job and the same resume costs nothing.
              If a generation fails you are not charged. Credits reset at the start of each period and do not roll over.
            </p>
          </div>

          {/*
            v3.19.0 — employer pricing moved to the landing "For employers"
            section, which is now the single public source. Nothing about
            employer tiers belongs on this page.
          */}

        </div>
      </main>


      <Footer />
      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </div>
  );
};

export default Pricing;
