/**
 * HomeTabs -- the seven explanation sections, each a real tab within Home,
 * not a separate route. v3.216.0, direct instruction: "when you make a
 * page open dont take me to new page keep within the same page all
 * sections should open within it" -- the same architecture Resume Hub's
 * own tabs already use (local state, never a route change). Clicking a
 * tab in SeekerSidebar swaps which of these renders in the main pane;
 * the URL and the sidebar itself never move.
 *
 * Two of the nine pages from v3.214.0 are folded into a sibling here
 * rather than kept as their own tab: Real AI (three chips and one
 * paragraph) reads thin on its own and restates a claim Why AYN already
 * makes, and Where jobs come from is largely the same sourcing claim
 * Home's own hero and TrustBento already lead with. Merged, not deleted:
 * every real fact from both survives, just placed where it earns its
 * spot rather than padded into a page of its own.
 */
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { billingApi, priceLabel, type SeekerBilling } from "@/lib/billing";
import { toast } from "sonner";
import type { TabProps } from "../homeTabMeta";

// v3.219.0 -- Pricing, Contact, About and Help all used to be real routes
// with their own <Header/>/<Footer/> chrome -- exactly the thing reported
// directly: "i click pricing... i dont see the sidebar anymore." Same
// content, same real logic (Pricing's billing state, Help's search),
// just rendered as a tab instead of a page. /pricing, /contact, /about
// and /help still exist as real URLs (old links/bookmarks keep working)
// but now redirect into this same tab, never their own separate chrome.

const PLANS: { key: string; name: string; cents: number; interval: string; credits: number; line: string; tag?: string }[] = [
  { key: 'seeker_free', name: 'Free', cents: 0, interval: 'month', credits: 6, line: 'Three tailored resumes a month, or six cover letters.' },
  { key: 'seeker_week', name: 'Week pass', cents: 499, interval: 'week', credits: 30, line: 'For the week you are applying hard.' },
  { key: 'seeker_starter', name: 'Starter', cents: 1200, interval: 'month', credits: 80, line: 'A steady search, around forty tailored resumes.', tag: 'Steady search' },
  { key: 'seeker_pro', name: 'Pro', cents: 2400, interval: 'month', credits: 200, line: 'A full time search with room to spare.' },
];

const FREE_FOREVER = [
  'Match scoring on any job you add',
  'Your profile and your resume',
  'Being discovered by employers',
  'Receiving and answering proposals',
  'Taking assessments',
  'Downloading every document you make',
];

export const PricingTab = ({ onStartFree }: TabProps) => {
  const [signedIn, setSignedIn] = useState(false);
  const [billing, setBilling] = useState<SeekerBilling | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setSignedIn(false); return; }
      setSignedIn(true);
      try { setBilling(await billingApi.seeker()); } catch { /* silent */ }
    })();
  }, []);

  const choose = async (key: string) => {
    if (!signedIn) { onStartFree(); return; }
    if (key === 'seeker_free') return;
    setBusy(key);
    setCheckoutError(null);
    try {
      const url = await billingApi.checkout(key);
      window.location.href = url;
    } catch (e) {
      const msg = (e as Error).message || 'Checkout could not start. Please try again.';
      setCheckoutError(msg);
      toast.error(msg);
      setBusy(null);
    }
  };

  return (
    <section className="lp-section">
      {/* v3.234.0 -- reported directly: "layout sizes... you are just
          keeping using what we built." 1080px across four cards at a
          220px floor left each card around 256px wide, tight for a price,
          a credit line, a description and a full-width button. Widened
          the shell and the column floor so a card actually has room to
          breathe; the price itself now reads as the card's own headline
          (Outfit, larger, tighter) instead of matching the body font at
          barely more than paragraph size. */}
      {/* v3.237.0 -- reported directly: "every page we have it have
          diffrent hight and wedith also difrent postiong." Measured live:
          this shell's own 1160px cap plus .lp-shell's `margin: 0 auto`
          centering put this tab's heading a real, confirmed 268px further
          right than Features' own left-aligned heading in the identical
          sidebar layout at the identical viewport, not just a difference
          in copy or card width. Cap removed (now the same 1360px default
          shell every left-aligned tab already uses, so every tab's
          content starts at the same x position); the intro block
          switched from centered to left-aligned to match. */}
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 34 }}>
          <h2 className="lp-display lp-h2">Plans & credits</h2>
          <p className="lp-lead" style={{ maxWidth: 620 }}>
            A tailored resume costs 2 credits. A cover letter costs 1. Building or optimizing your base resume costs 15 credits. Browsing and match scoring are free.
          </p>
        </div>

        {billing && (
          <div className="lp-reveal" style={{ marginBottom: 34, maxWidth: 480 }}>
            <p className="lp-note">
              You are on {billing.plan?.name || 'Free'} with{' '}
              <strong>{billing.balance} credits</strong> left.
              {billing.current_period_end
                ? ` Credits reset on ${new Date(billing.current_period_end).toLocaleDateString()}.`
                : ''}
            </p>
          </div>
        )}

        <div className="lp-reveal ayn-plan-grid">
          {PLANS.map((p) => {
            const current = billing?.plan?.key === p.key;
            const featured = p.key === 'seeker_starter';
            return (
              <div
                key={p.key}
                className={`lp-tile ayn-plan${featured ? ' ayn-plan-featured' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {current ? (
                    <span className="lp-chip">Your plan</span>
                  ) : p.tag ? (
                    <Badge className="ayn-ember-badge" style={{ fontSize: 11, padding: '3px 10px' }}>{p.tag}</Badge>
                  ) : null}
                </div>
                <p className="lp-display" style={{ fontSize: 32, margin: '14px 0 0', lineHeight: 1 }}>{priceLabel(p.cents, p.interval)}</p>
                <p className="ayn-plan-credits">{p.credits} credits</p>
                <p style={{ flex: 1, margin: '12px 0 0' }}>{p.line}</p>
                <button
                  type="button"
                  className={`lp-btn ${p.key === 'seeker_starter' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  disabled={current || busy === p.key}
                  onClick={() => choose(p.key)}
                >
                  {busy === p.key ? <Loader2 size={15} className="animate-spin" /> : current ? 'Current plan' : p.cents === 0 ? 'Start free' : `Choose ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
        {checkoutError && (
          <p role="alert" style={{ marginTop: 16, color: '#b42318', fontWeight: 600 }}>
            {checkoutError}
          </p>
        )}

        <div className="lp-reveal" style={{ marginTop: 40 }}>
          <h3 className="lp-display" style={{ fontSize: 18 }}>Free on every plan, including Free</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 16 }}>
            {FREE_FOREVER.map((f) => (
              <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={16} style={{ color: 'hsl(var(--lp-ember))', flexShrink: 0, marginTop: 2 }} />
                <span className="lp-note" style={{ margin: 0 }}>{f}</span>
              </div>
            ))}
          </div>
          <p className="lp-note" style={{ marginTop: 18 }}>
            Regenerating the same document is free. Failed generations are not charged. Credits reset each period and do not roll over.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingTab;
