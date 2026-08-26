/**
 * CompanyProfile.tsx — v3.11.0 "company profile first".
 *
 * A candidate deciding whether to accept a proposal mostly wants to know who
 * is reaching out, so six fields are now required before AYN will search or
 * send anything: company name, website, industry, headquarters, company size,
 * and an about paragraph of at least 80 characters. LinkedIn and a logo stay
 * optional and are labelled that way so nobody is blocked hunting a file.
 *
 * The same component renders twice: as onboarding when the required fields
 * are incomplete, and as an always editable card once they are not.
 *
 * v3.251.0 -- converted off the shadcn Card/Button-plus-inline-var(--rh-*)-
 * override pattern onto .lp-panel/.lp-btn, the real classes the marketing
 * pages use, same as IntakeWizard.tsx and AssessmentsPanel.tsx in the same
 * pass.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ChevronDown, Loader2, Upload, Check } from "lucide-react";
import {
  employerApi, isValidUrl, missingOrgFields, normaliseUrl,
  ABOUT_MIN, type Org, type OrgPatch,
} from "@/lib/employer";

const SIZES = ["1 to 10", "11 to 50", "51 to 200", "201 to 1000", "1000 plus"];

/** Same option card language as the intake wizard, ember when selected. */
function SizeOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group relative flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={selected
        ? { background: "var(--lp-gradient-ember)", borderColor: "transparent", color: "#fff", boxShadow: "0 6px 16px -6px hsl(var(--lp-ember) / 0.5)" }
        : { borderColor: "hsl(var(--lp-border-soft))", background: "hsl(var(--lp-surface))" }}
    >
      {selected && <Check className="w-4 h-4 shrink-0" />}
      <span className="font-medium">{label}</span>
    </button>
  );
}

export default function CompanyProfile({
  org, onSaved, onboarding = false, page = false,
}: { org: Org; onSaved: (org: Org) => void; onboarding?: boolean; page?: boolean }) {

  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Org>(org);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Tracks the org snapshot form was last reconciled against, so an
  // incoming save (which only ever changes the field(s) that were actually
  // saved) can be merged in without stomping edits sitting in other,
  // not-yet-blurred fields.
  const lastOrgRef = useRef<Org>(org);

  useEffect(() => {
    setForm(prev => {
      const merged = { ...prev };
      (Object.keys(org) as (keyof Org)[]).forEach(key => {
        if (prev[key] === lastOrgRef.current[key]) (merged as Record<string, unknown>)[key as string] = org[key];
      });
      return merged;
    });
    lastOrgRef.current = org;
  }, [org]);

  const save = useCallback(async (patch: OrgPatch) => {
    setSaving(true);
    try {
      const r = await employerApi.orgUpdate(org.id, patch);
      if (r.org) onSaved(r.org);
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  }, [org.id, onSaved, toast]);

  /** Autosave on blur, the same pattern the seeker profile uses. */
  const blurSave = (key: keyof Org) => () => {
    const next = (form[key] ?? "") as string;
    const prev = (org[key] ?? "") as string;
    if (next.trim() === prev.trim()) return;
    void save({ [key]: next.trim() } as OrgPatch);
  };

  /** Websites accept a bare domain: normalise it rather than reject it. */
  const blurSaveUrl = (key: "website" | "linkedin_url", label: string) => () => {
    const raw = ((form[key] ?? "") as string).trim();
    if (raw && !isValidUrl(raw)) {
      toast({ title: `That ${label} does not look like a link`, description: "For example example.com or https://example.com", variant: "destructive" });
      return;
    }
    const next = normaliseUrl(raw);
    setForm(f => ({ ...f, [key]: next }));
    if (next === ((org[key] ?? "") as string).trim()) return;
    void save({ [key]: next } as OrgPatch);
  };

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Images only", variant: "destructive" }); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Keep the logo under 2MB", variant: "destructive" }); return;
    }
    setUploading(true);
    try {
      const { data: s } = await supabase.auth.getUser();
      const uid = s.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${uid}/org-logo-${org.id}.${ext}`;
      const { error } = await supabase.storage.from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      setForm(f => ({ ...f, logo_url: url }));
      await save({ logo_url: url });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const missing = missingOrgFields(org);
  const expanded = onboarding || page || open;
  const aboutLen = (form.about ?? "").trim().length;


  const fields = (
    <div className="space-y-4 employer-step-in">
      {missing.length > 0 && (
        <ul className="space-y-1 border-l-2 pl-3" style={{ borderColor: "hsl(var(--lp-ember))" }}>
          {missing.map(m => (
            <li key={m.key} className="text-xs text-muted-foreground">{m.nudge}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Company name">
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={blurSave("name")} />
        </Field>
        <Field label="Website">
          <Input value={form.website ?? ""} placeholder="example.com" onChange={e => setForm({ ...form, website: e.target.value })} onBlur={blurSaveUrl("website", "website")} />
        </Field>
        <Field label="Industry">
          <Input value={form.industry ?? ""} placeholder="For example healthcare software" onChange={e => setForm({ ...form, industry: e.target.value })} onBlur={blurSave("industry")} />
        </Field>
        <Field label="Headquarters">
          <Input value={form.headquarters ?? ""} placeholder="City, country" onChange={e => setForm({ ...form, headquarters: e.target.value })} onBlur={blurSave("headquarters")} />
        </Field>
        <Field label="LinkedIn, optional">
          <Input value={form.linkedin_url ?? ""} placeholder="linkedin.com/company/" onChange={e => setForm({ ...form, linkedin_url: e.target.value })} onBlur={blurSaveUrl("linkedin_url", "LinkedIn link")} />
        </Field>
        <Field label="Logo, optional">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef} type="file" accept="image/*" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }}
            />
            <button type="button" className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {org.logo_url ? "Replace" : "Upload"}
            </button>
            {org.logo_url && (
              <button type="button" className="text-xs text-muted-foreground underline underline-offset-2"
                onClick={() => { setForm(f => ({ ...f, logo_url: "" })); void save({ logo_url: "" }); }}>
                Remove
              </button>
            )}
          </div>
        </Field>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Company size</Label>
        <div className="flex flex-wrap gap-2">
          {SIZES.map(s => (
            <SizeOption
              key={s} label={s} selected={form.company_size === s}
              onClick={() => { setForm(f => ({ ...f, company_size: s })); void save({ company_size: s }); }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">About the company</Label>
          <span className="text-[11px]" style={{ color: aboutLen > 0 && aboutLen < ABOUT_MIN ? "hsl(var(--lp-ember-soft))" : "hsl(var(--lp-muted))" }}>
            {aboutLen < ABOUT_MIN ? `${aboutLen} of ${ABOUT_MIN} minimum` : `${aboutLen} of 600`}
          </span>
        </div>
        <Textarea
          value={form.about ?? ""} maxLength={600}
          placeholder="What the company does, in a couple of plain sentences. Candidates read this before they decide."
          className="min-h-[90px]"
          onChange={e => setForm({ ...form, about: e.target.value })}
          onBlur={blurSave("about")}
        />
        <p className="text-[11px] text-muted-foreground">
          AYN uses this when it drafts a proposal. It never invents facts about your company.
        </p>
      </div>
    </div>
  );

  if (onboarding || page) {
    return (
      <div className="lp-panel space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            {org.logo_url
              ? <img src={org.logo_url} alt={`${org.name} logo`} className="w-10 h-10 rounded-lg object-cover border border-border/60" loading="lazy" />
              : <span className="w-10 h-10 rounded-lg grid place-items-center" style={{ background: "hsl(var(--lp-ember) / 0.12)" }}><Building2 className="w-4 h-4" style={{ color: "hsl(var(--lp-ember-soft))" }} /></span>}
            <h1 className="lp-display" style={{ fontSize: 18 }}>
              {onboarding ? "Tell candidates who you are" : org.name || "Company profile"}
            </h1>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground">
            {onboarding
              ? "Candidates see this on every proposal. AYN cannot search until it is filled in."
              : "Candidates see this on every proposal you send. Changes save as you go."}
          </p>
        </div>
        {fields}
      </div>
    );
  }


  return (
    <div className="lp-panel space-y-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 min-w-0">
          {org.logo_url
            ? <img src={org.logo_url} alt={`${org.name} logo`} className="w-9 h-9 rounded-lg object-cover border border-border/60" loading="lazy" />
            : <span className="w-9 h-9 rounded-lg grid place-items-center bg-muted border border-border/60"><Building2 className="w-4 h-4 text-muted-foreground" /></span>}
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">Company profile</span>
            <span className="block text-xs text-muted-foreground truncate">
              {[org.industry, org.company_size, org.headquarters].filter(Boolean).join(" · ") || "Candidates see this on every proposal you send."}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {missing.length > 0 && !expanded && (
        <ul className="space-y-1 border-l-2 pl-3" style={{ borderColor: "hsl(var(--lp-ember))" }}>
          {missing.map(m => <li key={m.key} className="text-xs text-muted-foreground">{m.nudge}</li>)}
        </ul>
      )}

      {expanded && fields}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
