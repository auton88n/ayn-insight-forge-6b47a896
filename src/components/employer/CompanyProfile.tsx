/**
 * CompanyProfile.tsx — v3.10.0 "employer profile, saved intake, one visual language".
 *
 * A candidate deciding whether to accept a proposal mostly wants to know who
 * is reaching out. Until now they saw a company name and nothing else, which
 * is the main reason someone says no. Everything here is editable at any
 * time, and every field is optional except the name.
 *
 * The nudge names the one missing field that actually weakens a proposal.
 * No percentage bar, no score, no gamification.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ChevronDown, Loader2, Upload, Check } from "lucide-react";
import { employerApi, type Org, type OrgPatch } from "@/lib/employer";

const SIZES = ["1 to 10", "11 to 50", "51 to 200", "201 to 1000", "1000 plus"];

/** The one missing field that most weakens their proposals, in priority order. */
function nudgeFor(org: Org): string | null {
  if (!org.about?.trim()) return "Candidates are more likely to accept when they can see what your company does. Add a short about paragraph.";
  if (!org.industry?.trim()) return "Add your industry so a candidate can tell straight away whether the work is in their field.";
  if (!org.website?.trim()) return "Add your website. A proposal with nothing to look up is easy to ignore.";
  if (!org.headquarters?.trim()) return "Add your headquarters so candidates know where the company is based.";
  if (!org.company_size?.trim()) return "Add your company size. Some people only want a small team, some only want a large one.";
  if (!org.logo_url?.trim()) return "Add a logo so your proposal is recognisable.";
  return null;
}

export default function CompanyProfile({
  org, onSaved,
}: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Org>(org);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setForm(org); }, [org]);

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

  const nudge = nudgeFor(org);

  return (
    <Card className="p-4 sm:p-6 space-y-4">
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

      {nudge && !open && (
        <p className="text-xs text-muted-foreground border-l-2 border-primary/60 pl-3">{nudge}</p>
      )}

      {open && (
        <div className="space-y-4 employer-step-in">
          {nudge && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/60 pl-3">{nudge}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company name">
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={blurSave("name")} />
            </Field>
            <Field label="Website">
              <Input value={form.website ?? ""} placeholder="https://" onChange={e => setForm({ ...form, website: e.target.value })} onBlur={blurSave("website")} />
            </Field>
            <Field label="Industry">
              <Input value={form.industry ?? ""} placeholder="For example healthcare software" onChange={e => setForm({ ...form, industry: e.target.value })} onBlur={blurSave("industry")} />
            </Field>
            <Field label="Headquarters">
              <Input value={form.headquarters ?? ""} placeholder="City, country" onChange={e => setForm({ ...form, headquarters: e.target.value })} onBlur={blurSave("headquarters")} />
            </Field>
            <Field label="LinkedIn">
              <Input value={form.linkedin_url ?? ""} placeholder="https://linkedin.com/company/" onChange={e => setForm({ ...form, linkedin_url: e.target.value })} onBlur={blurSave("linkedin_url")} />
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef} type="file" accept="image/*" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                  {org.logo_url ? "Replace" : "Upload"}
                </Button>
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
              {SIZES.map(s => {
                const on = form.company_size === s;
                return (
                  <Button
                    key={s} type="button" size="sm" variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    onClick={() => { setForm(f => ({ ...f, company_size: s })); void save({ company_size: s }); }}
                  >
                    {on && <Check className="w-3.5 h-3.5 mr-1.5" />}{s}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">About the company</Label>
              <span className="text-[11px] text-muted-foreground">{(form.about ?? "").length} of 600</span>
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
      )}
    </Card>
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
