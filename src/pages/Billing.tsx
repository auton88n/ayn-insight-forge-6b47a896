// v3.18.0 — in-app billing, behind sign in. Public /pricing sells; this
// screen manages. Seekers see plan, credit balance, renewal date and the
// ledger for this period. Employers see plan, trial end, proposal and
// assessment usage, and the FULL employer tier list including Growth and
// Scale, which are deliberately absent from the public page.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/shared/SEO";
import { toast } from "sonner";
import {
  billingApi, priceLabel,
  type Plan, type SeekerBilling, type EmployerBilling,
} from "@/lib/billing";
import { employerApi } from "@/lib/employer";

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

export default function Billing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<"seeker" | "employer">("seeker");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [seeker, setSeeker] = useState<SeekerBilling | null>(null);
  const [employer, setEmployer] = useState<EmployerBilling | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate("/"); return; }
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
      "Cancel your subscription? You keep access until the end of the period you have already paid for, it does not renew after that, and fees already paid are not refunded."
    );
    if (!ok) return;
    setBusy("cancel");
    try {
      await billingApi.cancel();
      toast.success("Cancelled. You keep access until the end of this period.");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };


  const tiers = plans.filter(p => p.audience === audience);
  const currentKey = audience === "employer" ? employer?.plan?.key : seeker?.plan?.key;

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${audience === "employer" ? "employer-surface" : ""}`}>
      <SEO title="Billing | AYN" description="Your AYN plan, credits and usage." noIndex />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <button
          onClick={() => navigate(audience === "employer" ? "/" : "/resume-hub")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to your hub
        </button>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {audience === "employer"
              ? "Your plan, your free month, and how many candidates you have contacted this period."
              : "Your plan, your credit balance and what you spent them on this period."}
          </p>
        </div>

        {/* Current state */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
              <p className="text-xl font-semibold mt-1">
                {audience === "employer" ? employer?.plan?.name || "—" : seeker?.plan?.name || "Free"}
              </p>
            </div>
            <Badge variant="secondary">
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

          <Button variant="outline" className="mt-5" onClick={openPortal} disabled={busy === "portal"}>
            {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Manage payment method <ExternalLink className="w-3.5 h-3.5 ml-2" /></>}
          </Button>
        </div>

        {/* Usage this period */}
        {audience === "seeker" && (
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="font-semibold">Usage this period</h2>
            {seeker?.ledger?.length ? (
              <ul className="mt-4 divide-y">
                {seeker.ledger.slice(0, 12).map((l, i) => (
                  <li key={`${l.created_at}-${i}`} className="py-2.5 flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{l.reason}</span>
                    <span className="flex items-center gap-3">
                      <span className={l.delta < 0 ? "text-foreground" : "text-primary font-medium"}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </span>
                      <span className="text-xs text-muted-foreground w-20 text-right">{fmtDate(l.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nothing spent yet this period.</p>
            )}
          </div>
        )}

        {/* Full tier list, including the employer tiers we do not publish. */}
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Upgrade options</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
            {tiers.map(p => {
              const current = p.key === currentKey;
              return (
                <div key={p.key} className={`rounded-xl border p-4 flex flex-col ${current ? "border-primary" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{p.name}</h3>
                    {current && <Badge variant="secondary">Current</Badge>}
                  </div>
                  <p className="mt-2 text-lg font-semibold">{priceLabel(p.price_cents, p.interval)}</p>
                  <p className="mt-1 text-sm text-muted-foreground flex-1">
                    {p.audience === "seeker"
                      ? `${p.credits ?? 0} credits`
                      : `${p.proposals_limit ?? "Unlimited"} proposals, ${p.assessments_limit ?? "unlimited"} assessments`}
                  </p>
                  <Button
                    className="mt-4 w-full"
                    variant={current ? "outline" : "default"}
                    disabled={current || p.price_cents === 0 || busy === p.key}
                    onClick={() => upgrade(p.key)}
                  >
                    {busy === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : current ? "Current plan" : "Choose"}
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
