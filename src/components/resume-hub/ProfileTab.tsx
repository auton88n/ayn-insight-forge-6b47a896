import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Save, Plus, X, ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";

function computeCompleteness(p: Canonical): { pct: number; checks: { label: string; done: boolean }[] } {
  const checks = [
    { label: "Current title", done: !!p.derived?.current_title },
    { label: "Total years of experience", done: typeof p.derived?.total_yoe === "number" },
    { label: "5+ skills", done: (p.skills?.length || 0) >= 5 },
    { label: "1+ experience", done: (p.experiences?.length || 0) >= 1 },
    { label: "1+ education", done: (p.education?.length || 0) >= 1 },
    { label: "Work authorization set", done: !!(p.work_auth?.citizenship || p.work_auth?.work_authorized_us || p.work_auth?.work_authorized_ca) },
    { label: "Salary preference", done: typeof p.preferences?.salary_min_usd === "number" },
    { label: "Desired titles", done: (p.preferences?.desired_titles?.length || 0) >= 1 },
  ];
  const pct = Math.round((checks.filter(c => c.done).length / checks.length) * 100);
  return { pct, checks };
}

// Canonical profile types must mirror the edge-function CanonicalProfile.
type Skill = { name: string; years?: number; last_used?: string; level?: string };
type Exp = { company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[]; tech?: string[] };
type Edu = { school: string; degree?: string; field?: string; start?: string; end?: string; gpa?: string };
type Cert = { name: string; issuer?: string; year?: string };
type WorkAuth = {
  citizenship?: string;
  work_authorized_us?: boolean; work_authorized_ca?: boolean;
  needs_sponsorship_now?: boolean; needs_sponsorship_future?: boolean;
  visa_type?: string; notes?: string;
};
type Prefs = {
  open_to_remote?: boolean; open_to_relocation?: boolean; open_to_travel?: boolean;
  salary_min_usd?: number; salary_currency?: string;
  start_date_availability?: string;
  desired_titles?: string[]; desired_locations?: string[];
};
type Derived = {
  total_yoe?: number; seniority?: string; primary_function?: string;
  top_skills?: string[]; education_level?: string;
  current_title?: string; current_company?: string;
};
type Canonical = {
  skills: Skill[]; experiences: Exp[]; education: Edu[]; certifications: Cert[];
  work_auth: WorkAuth; preferences: Prefs; derived: Derived;
};

const EMPTY: Canonical = { skills: [], experiences: [], education: [], certifications: [], work_auth: {}, preferences: {}, derived: {} };

export default function ProfileTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Canonical>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("resume-hub", { body: { action: "profile_canonical_get" } });
    setLoading(false);
    if (error) { toast({ title: "Couldn't load profile", description: error.message, variant: "destructive" }); return; }
    setProfile((data?.canonical as Canonical) || EMPTY);
    setHasProfile(!!data?.hasProfile);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.functions.invoke("resume-hub", { body: { action: "profile_canonical_save", canonical: profile } });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setHasProfile(true);
    toast({ title: "Profile saved", description: "Used by Autofill, Score, Tailor, and Cover Letter." });
  };

  const extract = async () => {
    setExtracting(true);
    const { data, error } = await supabase.functions.invoke("resume-hub", { body: { action: "profile_canonical_extract" } });
    setExtracting(false);
    if (error) { toast({ title: "Extraction failed", description: error.message, variant: "destructive" }); return; }
    if (data?.canonical) {
      setProfile(data.canonical as Canonical);
      toast({ title: "Drafted from your resume", description: "Review, edit, then click Save." });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading profile…</div>;
  }

  const setDerived = (k: keyof Derived, v: unknown) => setProfile(p => ({ ...p, derived: { ...p.derived, [k]: v } }));
  const setWA = (k: keyof WorkAuth, v: unknown) => setProfile(p => ({ ...p, work_auth: { ...p.work_auth, [k]: v } }));
  const setPref = (k: keyof Prefs, v: unknown) => setProfile(p => ({ ...p, preferences: { ...p.preferences, [k]: v } }));

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="font-medium">Canonical Profile</span>
            {hasProfile ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            One source of truth for skills, experience, work authorization, and preferences.
            Used by Autofill, Job Score, Tailor, and Cover Letter so every answer stays consistent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={extract} disabled={extracting}>
            {extracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {hasProfile ? "Re-extract from resume" : "Draft from my resume"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </Card>

      {/* Derived snapshot */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold">Snapshot</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Current title" value={profile.derived.current_title || ""} onChange={v => setDerived("current_title", v)} />
          <Field label="Current company" value={profile.derived.current_company || ""} onChange={v => setDerived("current_company", v)} />
          <Field label="Primary function" value={profile.derived.primary_function || ""} onChange={v => setDerived("primary_function", v)} placeholder="e.g. Product, Backend, Design" />
          <Field label="Total YoE" value={String(profile.derived.total_yoe ?? "")} onChange={v => setDerived("total_yoe", v === "" ? undefined : Number(v))} placeholder="0" />
          <Field label="Seniority" value={profile.derived.seniority || ""} onChange={v => setDerived("seniority", v)} placeholder="entry | mid | senior | staff | manager" />
          <Field label="Education level" value={profile.derived.education_level || ""} onChange={v => setDerived("education_level", v)} placeholder="Bachelor's | Master's" />
        </div>
      </Card>

      {/* Work Auth */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold">Work authorization</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Citizenship" value={profile.work_auth.citizenship || ""} onChange={v => setWA("citizenship", v)} placeholder="e.g. Canada" />
          <Field label="Visa type (if any)" value={profile.work_auth.visa_type || ""} onChange={v => setWA("visa_type", v)} placeholder="e.g. H-1B, OPT, PR" />
          <Toggle label="Authorized to work in US" value={!!profile.work_auth.work_authorized_us} onChange={v => setWA("work_authorized_us", v)} />
          <Toggle label="Authorized to work in Canada" value={!!profile.work_auth.work_authorized_ca} onChange={v => setWA("work_authorized_ca", v)} />
          <Toggle label="Need sponsorship now" value={!!profile.work_auth.needs_sponsorship_now} onChange={v => setWA("needs_sponsorship_now", v)} />
          <Toggle label="Need sponsorship in future" value={!!profile.work_auth.needs_sponsorship_future} onChange={v => setWA("needs_sponsorship_future", v)} />
        </div>
        <Textarea
          placeholder="Notes (optional). Anything recruiters should know."
          value={profile.work_auth.notes || ""}
          onChange={e => setWA("notes", e.target.value)}
        />
      </Card>

      {/* Preferences */}
      <Card className="p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold">Preferences</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Toggle label="Open to remote" value={!!profile.preferences.open_to_remote} onChange={v => setPref("open_to_remote", v)} />
          <Toggle label="Open to relocation" value={!!profile.preferences.open_to_relocation} onChange={v => setPref("open_to_relocation", v)} />
          <Toggle label="Open to travel" value={!!profile.preferences.open_to_travel} onChange={v => setPref("open_to_travel", v)} />
          <Field label="Minimum salary" type="number" value={String(profile.preferences.salary_min_usd ?? "")} onChange={v => setPref("salary_min_usd", v === "" ? undefined : Number(v))} placeholder="80000" />
          <Field label="Currency" value={profile.preferences.salary_currency || ""} onChange={v => setPref("salary_currency", v)} placeholder="USD | CAD | EUR" />
          <Field label="Start date availability" value={profile.preferences.start_date_availability || ""} onChange={v => setPref("start_date_availability", v)} placeholder="Immediately | 2 weeks | 1 month" />
        </div>
        <ChipList
          label="Desired titles"
          values={profile.preferences.desired_titles || []}
          onChange={values => setPref("desired_titles", values)}
          placeholder="Add a title"
        />
        <ChipList
          label="Desired locations"
          values={profile.preferences.desired_locations || []}
          onChange={values => setPref("desired_locations", values)}
          placeholder="Add a city / region"
        />
      </Card>

      {/* Skills */}
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Skills ({profile.skills.length})</h3>
          <Button variant="ghost" size="sm" onClick={() => setProfile(p => ({ ...p, skills: [...p.skills, { name: "" }] }))}>
            <Plus className="w-4 h-4 mr-1" /> Add skill
          </Button>
        </div>
        <div className="space-y-2">
          {profile.skills.length === 0 && <p className="text-xs text-muted-foreground">No skills yet. Use "Draft from my resume" to auto-fill.</p>}
          {profile.skills.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Input className="col-span-7" placeholder="Skill name" value={s.name} onChange={e => updateAt(setProfile, "skills", i, { ...s, name: e.target.value })} />
              <Input className="col-span-2" type="number" placeholder="Years" value={s.years ?? ""} onChange={e => updateAt(setProfile, "skills", i, { ...s, years: e.target.value === "" ? undefined : Number(e.target.value) })} />
              <Input className="col-span-2" placeholder="Level" value={s.level || ""} onChange={e => updateAt(setProfile, "skills", i, { ...s, level: e.target.value })} />
              <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeAt(setProfile, "skills", i)}><X className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Experiences */}
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Experience ({profile.experiences.length})</h3>
          <Button variant="ghost" size="sm" onClick={() => setProfile(p => ({ ...p, experiences: [...p.experiences, { company: "", title: "" }] }))}>
            <Plus className="w-4 h-4 mr-1" /> Add role
          </Button>
        </div>
        <div className="space-y-3">
          {profile.experiences.map((e, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Title" value={e.title} onChange={ev => updateAt(setProfile, "experiences", i, { ...e, title: ev.target.value })} />
                <Input placeholder="Company" value={e.company} onChange={ev => updateAt(setProfile, "experiences", i, { ...e, company: ev.target.value })} />
                <Input placeholder="Start (e.g. Jan 2021)" value={e.start || ""} onChange={ev => updateAt(setProfile, "experiences", i, { ...e, start: ev.target.value })} />
                <Input placeholder="End (or Present)" value={e.end || ""} onChange={ev => updateAt(setProfile, "experiences", i, { ...e, end: ev.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={!!e.current} onCheckedChange={v => updateAt(setProfile, "experiences", i, { ...e, current: v })} />
                  Current role
                </label>
                <Button variant="ghost" size="sm" onClick={() => removeAt(setProfile, "experiences", i)}>Remove</Button>
              </div>
            </div>
          ))}
          {profile.experiences.length === 0 && <p className="text-xs text-muted-foreground">No experience yet.</p>}
        </div>
      </Card>

      {/* Education */}
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Education ({profile.education.length})</h3>
          <Button variant="ghost" size="sm" onClick={() => setProfile(p => ({ ...p, education: [...p.education, { school: "" }] }))}>
            <Plus className="w-4 h-4 mr-1" /> Add school
          </Button>
        </div>
        <div className="space-y-3">
          {profile.education.map((e, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-lg p-3">
              <Input placeholder="School" value={e.school} onChange={ev => updateAt(setProfile, "education", i, { ...e, school: ev.target.value })} />
              <Input placeholder="Degree" value={e.degree || ""} onChange={ev => updateAt(setProfile, "education", i, { ...e, degree: ev.target.value })} />
              <Input placeholder="Field" value={e.field || ""} onChange={ev => updateAt(setProfile, "education", i, { ...e, field: ev.target.value })} />
              <Input placeholder="End year" value={e.end || ""} onChange={ev => updateAt(setProfile, "education", i, { ...e, end: ev.target.value })} />
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => removeAt(setProfile, "education", i)}>Remove</Button>
              </div>
            </div>
          ))}
          {profile.education.length === 0 && <p className="text-xs text-muted-foreground">No education entries yet.</p>}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

function ChipList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map((v, i) => (
          <Badge key={i} variant="secondary" className="gap-1">
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="ml-1 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

// Update array item in canonical state by key + index.
function updateAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setProfile: React.Dispatch<React.SetStateAction<Canonical>>,
  key: K, i: number, value: Canonical[K][number]
) {
  setProfile(p => {
    const arr = [...p[key]] as Canonical[K];
    (arr as unknown as Array<Canonical[K][number]>)[i] = value;
    return { ...p, [key]: arr };
  });
}

function removeAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setProfile: React.Dispatch<React.SetStateAction<Canonical>>,
  key: K, i: number
) {
  setProfile(p => {
    const arr = (p[key] as unknown as Array<Canonical[K][number]>).filter((_, j) => j !== i);
    return { ...p, [key]: arr as Canonical[K] };
  });
}
