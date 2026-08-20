// v3.34.0 — in-app billing, behind sign in. Public /pricing sells; this
// screen manages. Seekers see plan, credit balance, renewal date and the
// ledger for this period. Employers see plan, trial end, proposal and
// assessment usage, and the FULL employer tier list including Growth and
// Scale, which are deliberately absent from the public page.
// Self service is complete here: move up a tier, move down a tier, move down
// to Free, undo a cancellation before the period ends, and download receipts.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, ExternalLink, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/shared/SEO";
import { toast } from "sonner";
import {
  billingApi, priceLabel,
  type Plan, type SeekerBilling, type EmployerBilling,
  type Invoice, type StripeSubscriptionState,
} from "@/lib/billing";
import { employerApi } from "@/lib/employer";

const CREDITS_NOTE =
  "Credits are for the period they were granted in. Unused credits expire at the end of the period and do not roll over.";


const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

export default function Billing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<"seeker" | "employer">("seeker");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [seeker, setSeeker] = useState<SeekerBilling | null>(null);
  const [employer, setEmployer] = useState<EmployerBilling | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subState, setSubState] = useState<StripeSubscriptionState | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const loadStripeSide = async () => {
    try { setSubState((await billingApi.state()).subscription); } catch { /* no billing account yet */ }
    try { setInvoices(await billingApi.invoices()); } catch { /* no billing account yet */ }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // v3.88.0 — a real server check disagreeing with Index.tsx's
        // cached "signed in" state (session present but actually gone
        // bad) must correct that shared cache before leaving, or "/"
        // just bounces back here on the same stale trust. See ResumeHub.tsx.
        await supabase.auth.signOut().catch(() => { /* already signed out server-side is fine */ });
        navigate("/");
        return;
      }
      let role = "job_seeker";
      try {
        const { data: prof } = await supabase
          .from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
        role = (prof as { role?: string } | null)?.role || "job_seeker";
      } catch { /* default seeker */ }
      const isEmployer = role === "employer";
      setAudience(isEmployer ? "employer" : "seeker");
      try { setPlans(await billingApi.plans()); } catch { /* silent */ }
      try {
        if (isEmployer) {
          const { org } = await employerApi.orgGet();
          if (org?.id) setEmployer(await billingApi.employer(org.id));
        } else {
          setSeeker(await billingApi.seeker());
        }
      } catch (e) { toast.error((e as Error).message); }
      await loadStripeSide();
      setLoading(false);
    })();
  }, [navigate]);

  const upgrade = async (key: string) => {
    setBusy(key);
    try {
      const url = await billingApi.checkout(key);
      window.location.href = url;
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  };

  const openPortal = async () => {
    setBusy("portal");
    try { window.location.href = await billingApi.portal(); }
    catch (e) { toast.error((e as Error).message); setBusy(null); }
  };

  // v3.30.0 — cancelling is possible from inside the product, not only by
  // emailing support. It takes effect at the end of the paid period.
  const cancelSubscription = async () => {
    const ok = window.confirm(
      `Cancel your subscription? You keep access until the end of the period you have already paid for, it does not renew after that, and fees already paid are not refunded. ${CREDITS_NOTE}`
    );
    if (!ok) return;
    setBusy("cancel");
    try {
      await billingApi.cancel();
      toast.success("Cancelled. You keep access until the end of this period.");
      await loadStripeSide();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  // v3.34.0 — undo a cancellation while the paid period is still running.
  const resumeSubscription = async () => {
    setBusy("resume");
    try {
      await billingApi.resume();
      toast.success("Your subscription will renew as normal again.");
      await loadStripeSide();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  // v3.34.0 — moving in either direction. Down to Free is a stop, not a
  // switch, so it is worded that way and it says what happens to credits.
  const changePlan = async (p: Plan) => {
    const toFree = p.price_cents === 0;
    const ok = window.confirm(
      toFree
        ? `Move down to ${p.name}? Your paid plan keeps running until the end of the period you have already paid for and then stops. Fees already paid are not refunded. ${CREDITS_NOTE}`
        : `Move to ${p.name} at ${priceLabel(p.price_cents, p.interval)}? The change applies now and Stripe adjusts the difference on your next invoice. ${CREDITS_NOTE}`
    );
    if (!ok) return;
    setBusy(p.key);
    try {
      const out = await billingApi.changePlan(p.key);
      if (out?.needs_checkout) {
        const url = await billingApi.checkout(p.key);
        window.location.href = url;
        return;
      }
      toast.success(toFree ? "You will move to Free at the end of this period." : `You are on ${p.name}.`);
      await loadStripeSide();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  const tiers = plans.filter(p => p.audience === audience);
  const currentKey = audience === "employer" ? employer?.plan?.key : seeker?.plan?.key;
  const currentPrice = tiers.find(p => p.key === currentKey)?.price_cents ?? 0;
  const hasSubscription = Boolean(subState);
  const endingSoon = Boolean(subState?.cancel_at_period_end);


  if (loading) {
    return (
      <div className={`min-h-screen grid place-items-center bg-background ${audience === "employer" ? "employer-surface" : "resume-hub-theme"}`}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: audience === "employer" ? undefined : "var(--rh-accent)" }} />
      </div>
    );
  }

  // v3.179.0 — reported directly: "the page of billing is not branded."
  // The employer half of this page already had its own scope
  // (.employer-surface) applied conditionally; the seeker half never got
  // the matching .resume-hub-theme treatment, so a job seeker landed on
  // this page's plain shadcn default (bg-foreground buttons, no rh-*
  // tokens anywhere) every single time. Same fix as every other bare
  // surface this app has hit: apply the scope class, which already
  // retints button.bg-foreground/border-foreground to ember on its own,
  // then hand-retint the handful of literal text-primary/border-primary/
  // border spots the scope's CSS doesn't reach automatically.
  const seekerBranded = audience !== "employer";

  return (
    <div className={`min-h-screen bg-background ${audience === "employer" ? "employer-surface" : "resume-hub-theme"}`}>
      <SEO title="Billing | AYN" description="Your AYN plan, credits and usage." noIndex />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <button
          onClick={() => navigate(audience === "employer" ? "/" : "/resume-hub")}
          className="inline-flex items-center gap-2 text-sm hover:opacity-80"
          style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to your hub
        </button>

        <div>
          <h1 className={seekerBranded ? "rh-display text-2xl" : "text-2xl font-semibold tracking-tight"}>Billing</h1>
          <p className="text-sm mt-1" style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}>
            {audience === "employer"
              ? "Your plan, your free month, and how many candidates you have contacted this period."
              : "Your plan, your credit balance and what you spent them on this period."}
          </p>
        </div>

        {/* Current state */}
        <div className="rounded-2xl border p-6" style={seekerBranded ? { borderColor: "var(--rh-hair)", background: "var(--rh-surface)", boxShadow: "var(--rh-shadow-card)" } : undefined}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: seekerBranded ? "var(--rh-faint)" : undefined }}>Current plan</p>
              <p className={seekerBranded ? "rh-display text-xl mt-1" : "text-xl font-semibold mt-1"}>
                {audience === "employer" ? employer?.plan?.name || "—" : seeker?.plan?.name || "Free"}
              </p>
            </div>
            <Badge
              variant="secondary"
              style={seekerBranded ? { background: "var(--rh-trust-tint)", color: "var(--rh-trust)" } : undefined}
            >
              {(audience === "employer" ? employer?.status : seeker?.status) || "active"}
            </Badge>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {audience === "seeker" ? (
              <>
                <Stat label="Credit balance" value={`${seeker?.balance ?? 0}`} />
                <Stat label="Renews" value={fmtDate(seeker?.current_period_end)} />
                <Stat
                  label="Costs"
                  value={`${seeker?.costs?.tailored_resume ?? 2} resume / ${seeker?.costs?.cover_letter ?? 1} letter`}
                />
              </>
            ) : (
              <>
                <Stat
                  label="Proposals used"
                  value={`${employer?.proposals_used ?? 0}${employer?.plan?.proposals_limit ? ` / ${employer.plan.proposals_limit}` : ""}`}
                />
                <Stat
                  label="Assessments used"
                  value={`${employer?.assessments_used ?? 0}${employer?.plan?.assessments_limit ? ` / ${employer.plan.assessments_limit}` : ""}`}
                />
                <Stat
                  label={employer?.trial_ends_at ? "Free month ends" : "Renews"}
                  value={fmtDate(employer?.trial_ends_at || employer?.current_period_end)}
                />
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={openPortal} disabled={busy === "portal"}>
              {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Manage payment method <ExternalLink className="w-3.5 h-3.5 ml-2" /></>}
            </Button>
            {endingSoon ? (
              <Button variant="outline" onClick={resumeSubscription} disabled={busy === "resume"}>
                {busy === "resume" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Keep my subscription"}
              </Button>
            ) : (
              <Button variant="ghost" onClick={cancelSubscription} disabled={busy === "cancel" || !hasSubscription}>
                {busy === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel subscription"}
              </Button>
            )}
          </div>
          {endingSoon && (
            <p className="mt-3 text-xs font-semibold" style={{ color: seekerBranded ? "var(--rh-gold)" : undefined }}>
              This subscription is set to end and will not renew. You can keep it with one click above.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed" style={{ color: seekerBranded ? "var(--rh-faint)" : undefined }}>
            Your plan renews automatically. You can cancel at any time. Cancellation takes
            effect at the end of the period you have already paid for, and fees already paid
            are not refunded. {CREDITS_NOTE}
          </p>
        </div>

        {/* Billing history */}
        <div className="rounded-2xl border p-6" style={seekerBranded ? { borderColor: "var(--rh-hair)", background: "var(--rh-surface)", boxShadow: "var(--rh-shadow-card)" } : undefined}>
          <h2 className={seekerBranded ? "rh-display" : "font-semibold"}>Billing history</h2>
          {invoices.length ? (
            <ul className="mt-4 divide-y" style={seekerBranded ? { borderColor: "var(--rh-hair)" } : undefined}>
              {invoices.map(inv => (
                <li key={inv.id} className="py-2.5 flex items-center justify-between gap-4 text-sm" style={seekerBranded ? { borderColor: "var(--rh-hair)" } : undefined}>
                  <span style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}>
                    {new Date(inv.created * 1000).toLocaleDateString()} {inv.number ? `· ${inv.number}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">
                      {(inv.amount_paid / 100).toFixed(2)} {inv.currency.toUpperCase()}
                    </span>
                    <Badge variant="secondary" style={seekerBranded ? { background: "var(--rh-raised)", color: "var(--rh-muted)" } : undefined}>{inv.status || "unknown"}</Badge>
                    {inv.invoice_pdf && (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
                        style={{ color: seekerBranded ? "var(--rh-accent-2)" : undefined }}
                      >
                        <Download className="w-3.5 h-3.5" /> Receipt
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm" style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}>No invoices yet.</p>
          )}
        </div>


        {/* Usage this period */}
        {audience === "seeker" && (
          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--rh-hair)", background: "var(--rh-surface)", boxShadow: "var(--rh-shadow-card)" }}>
            <h2 className="rh-display">Usage this period</h2>
            {seeker?.ledger?.length ? (
              <ul className="mt-4 divide-y" style={{ borderColor: "var(--rh-hair)" }}>
                {seeker.ledger.slice(0, 12).map((l, i) => (
                  <li key={`${l.created_at}-${i}`} className="py-2.5 flex items-center justify-between gap-4 text-sm" style={{ borderColor: "var(--rh-hair)" }}>
                    <span style={{ color: "var(--rh-muted)" }}>{l.reason}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium" style={{ color: l.delta < 0 ? "var(--rh-ink)" : "var(--rh-trust)" }}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </span>
                      <span className="text-xs w-20 text-right" style={{ color: "var(--rh-faint)" }}>{fmtDate(l.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--rh-muted)" }}>Nothing spent yet this period.</p>
            )}
          </div>
        )}

        {/* Full tier list, including the employer tiers we do not publish. */}
        <div className="rounded-2xl border p-6" style={seekerBranded ? { borderColor: "var(--rh-hair)", background: "var(--rh-surface)", boxShadow: "var(--rh-shadow-card)" } : undefined}>
          <h2 className={seekerBranded ? "rh-display" : "font-semibold"}>Change your plan</h2>
          <p className="mt-1 text-sm" style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}>
            You can move up or down at any time, including down to Free. {CREDITS_NOTE}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {tiers.map(p => {
              const current = p.key === currentKey;
              const isDown = p.price_cents < currentPrice;
              const label = current ? "Current plan" : isDown ? (p.price_cents === 0 ? "Move to Free" : "Move down") : "Move up";
              return (
                <div
                  key={p.key}
                  className="rounded-xl border p-4 flex flex-col"
                  style={seekerBranded
                    ? { borderColor: current ? "var(--rh-accent)" : "var(--rh-hair)", background: current ? "var(--rh-tint)" : undefined }
                    : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={seekerBranded ? "rh-display text-[15px]" : "font-medium"}>{p.name}</h3>
                    {current && <Badge variant="secondary" style={seekerBranded ? { background: "var(--rh-accent)", color: "#fff" } : undefined}>Current</Badge>}
                  </div>
                  <p className={seekerBranded ? "mt-2 rh-display text-lg" : "mt-2 text-lg font-semibold"}>{priceLabel(p.price_cents, p.interval)}</p>
                  <p className="mt-1 text-sm flex-1" style={{ color: seekerBranded ? "var(--rh-muted)" : undefined }}>
                    {p.audience === "seeker"
                      ? `${p.credits ?? 0} credits`
                      : `${p.proposals_limit ?? "Unlimited"} proposals, ${p.assessments_limit ?? "unlimited"} assessments`}
                  </p>
                  <Button
                    className="mt-4 w-full hover:opacity-90"
                    variant={current || isDown ? "outline" : "default"}
                    disabled={current || busy === p.key || (p.price_cents === 0 && !hasSubscription)}
                    onClick={() => (hasSubscription ? changePlan(p) : upgrade(p.key))}
                    style={seekerBranded && !current && !isDown ? { background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" } : undefined}
                  >
                    {busy === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : label}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-medium mt-1">{value}</p>
    </div>
  );
}
