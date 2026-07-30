import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Save, Plus, X, ShieldCheck, FileUp, Users } from "lucide-react";
import { notifyProfileUpdated } from "@/lib/extension";
import { Progress } from "@/components/ui/progress";
import { ResumeUpload } from "@/components/resume-hub/ResumeUpload";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { employerApi, type RevealRequest } from "@/lib/employer";
import CanadianProfileForm, { type CanadianProfileFormHandle } from "./CanadianProfileForm";

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

function mapResumeToCanonical(resume: ResumeContent, prev: Canonical): Canonical {
  const work = resume.work || [];
  const edu = resume.education || [];
  const skills = (resume.skills || []).filter(Boolean);
  const startYears = work.map(w => parseInt(String(w.start || "").slice(0, 4))).filter(y => y > 1950 && y < 2100);
  const earliest = startYears.length ? Math.min(...startYears) : undefined;
  const total_yoe = earliest ? Math.max(0, new Date().getFullYear() - earliest) : prev.derived?.total_yoe;
  return {
    ...prev,
    skills: skills.length ? skills.map(name => ({ name })) : prev.skills,
    experiences: work.length ? work.map(w => ({ company: w.company || "", title: w.title || "", location: w.location, start: w.start, end: w.end, current: !w.end, bullets: w.bullets || [] })) : prev.experiences,
    education: edu.length ? edu.map(e => ({ school: e.school || "", degree: e.degree, field: e.field, start: e.start, end: e.end })) : prev.education,
    derived: {
      ...prev.derived,
      current_title: resume.basics?.title || work[0]?.title || prev.derived?.current_title,
      current_company: work[0]?.company || prev.derived?.current_company,
      education_level: edu[0]?.degree || prev.derived?.education_level,
      total_yoe,
      top_skills: skills.length ? skills.slice(0, 8) : prev.derived?.top_skills,
    },
  };
}

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

export default function ProfileTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Canonical>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [primaryResume, setPrimaryResume] = useState<{ id: string; title: string } | null>(null);
  const [primaryResumeContent, setPrimaryResumeContent] = useState<ResumeContent | null>(null);
  const [parsedResume, setParsedResume] = useState<ResumeContent | null>(null);
  const [uploading, setUploading] = useState(false);
  const canadianRef = useRef<CanadianProfileFormHandle>(null);

  // v2.9.0-A — Talent Pool consent state.
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolOptedIn, setPoolOptedIn] = useState(false);
  const [poolSkillsCount, setPoolSkillsCount] = useState(0);
  const [poolIndexed, setPoolIndexed] = useState(false);
  const loadPool = useCallback(async () => {
    try {
      const r = await resumeHubApi.talentPoolGet();
      setPoolOptedIn(!!r.opted_in);
      setPoolSkillsCount(r.skills_count || 0);
      setPoolIndexed(!!r.indexed);
    } catch { /* silent */ }
    finally { setPoolLoading(false); }
  }, []);
  useEffect(() => { loadPool(); }, [loadPool]);
  const togglePool = async (next: boolean) => {
    setPoolSaving(true);
    try {
      await resumeHubApi.talentPoolSet(next);
      setPoolOptedIn(next);
      toast({
        title: next ? "You're in the pool" : "Left the pool",
        description: next
          ? "Employers can discover your anonymized profile."
          : "Your data left the pool.",
      });
      await loadPool();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      toast({ title: "Couldn't update", description: msg, variant: "destructive" });
    } finally { setPoolSaving(false); }
  };

  // v2.9.0-B — Intro requests from employers who searched the pool.
  const [reveals, setReveals] = useState<RevealRequest[]>([]);
  const [revealBusy, setRevealBusy] = useState<Record<string, boolean>>({});
  const loadReveals = useCallback(async () => {
    try { const r = await employerApi.revealList(); setReveals(r.requests || []); } catch { /* silent */ }
  }, []);
  useEffect(() => { if (poolOptedIn) loadReveals(); }, [poolOptedIn, loadReveals]);
  const decideReveal = async (id: string, approve: boolean) => {
    setRevealBusy(p => ({ ...p, [id]: true }));
    try {
      await employerApi.revealDecide(id, approve);
      toast({ title: approve ? "Contact shared" : "Declined" });
      await loadReveals();
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setRevealBusy(p => ({ ...p, [id]: false })); }
  };

  const loadPrimary = useCallback(async () => {
    const { data } = await supabase
      .from("resumes")
      .select("id, title, content")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (data) {
      setPrimaryResume({ id: data.id, title: data.title });
      setPrimaryResumeContent((data.content as ResumeContent) ?? null);
    } else {
      setPrimaryResume(null);
      setPrimaryResumeContent(null);
    }
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_profile_canonical")
        .select("skills, experiences, education, certifications, work_auth, preferences, derived")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfile({ ...EMPTY, ...((data ?? {}) as unknown as Partial<Canonical>) });
        setHasProfile(true);
      } else {
        setProfile(EMPTY);
        setHasProfile(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      toast({ title: "Couldn't load profile", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userId]);


  useEffect(() => { load(); loadPrimary(); }, [load, loadPrimary]);

  const handleResumeParsed = async ({ resume }: { resume: ResumeContent; plainText: string }) => {
    setUploading(true);
    try {
      // Save as primary resume (replace existing primary)
      await supabase.from("resumes").update({ is_primary: false }).eq("user_id", userId);
      const autoTitle = resume.basics?.name ? `${resume.basics.name} – Resume` : "Uploaded Resume";
      const { error: insErr } = await supabase.from("resumes").insert({
        user_id: userId,
        title: autoTitle,
        content: resume as never,
        is_primary: true,
      });
      if (insErr) throw insErr;
      setParsedResume(resume);
      await loadPrimary();
      // v3.1.0 — keep the talent pool index in sync with client-side writes.
      resumeHubApi.talentPoolReindexSelf().catch(() => {});
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
      setUploading(false);
      return;
    }
    setUploading(false);
    setProfile(prev => mapResumeToCanonical(resume, prev));
    toast({ title: "Profile drafted from your resume", description: "Review the fields, then click Save all." });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        skills: profile.skills ?? [],
        experiences: profile.experiences ?? [],
        education: profile.education ?? [],
        certifications: profile.certifications ?? [],
        work_auth: profile.work_auth ?? {},
        preferences: profile.preferences ?? {},
        derived: profile.derived ?? {},
        updated_at: new Date().toISOString(),
      } as unknown as never;
      const { error } = await supabase.from("user_profile_canonical").upsert(payload, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await canadianRef.current?.save();
      setHasProfile(true);
      // v2.7.0 — invalidate the extension's profile cache so autofill picks up
      // these edits on the very next form, not 30 minutes later. No-op if the
      // extension isn't installed.
      void notifyProfileUpdated();
      toast({ title: "Profile saved", description: "Career profile and application details updated." });
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };


  const extract = () => {
    if (!primaryResumeContent) {
      toast({ title: "Upload a resume first", variant: "destructive" });
      return;
    }
    setProfile(prev => mapResumeToCanonical(primaryResumeContent, prev));
    toast({ title: "Filled from your resume", description: "Review, then Save all." });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading profile…</div>;
  }

  const setDerived = (k: keyof Derived, v: unknown) => setProfile(p => ({ ...p, derived: { ...p.derived, [k]: v } }));
  const setWA = (k: keyof WorkAuth, v: unknown) => setProfile(p => ({ ...p, work_auth: { ...p.work_auth, [k]: v } }));
  const setPref = (k: keyof Prefs, v: unknown) => setProfile(p => ({ ...p, preferences: { ...p.preferences, [k]: v } }));

  return (
    <div className="space-y-6">
      {/* Resume upload — feeds canonical extraction */}
      <Card className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <FileUp className="w-4 h-4 text-primary" />
            <span className="font-medium">Resume source</span>
            {primaryResume
              ? <Badge variant="secondary" className="truncate max-w-[260px]">Primary: {primaryResume.title}</Badge>
              : <Badge variant="outline">No primary resume yet</Badge>}
          </div>
          {uploading && (
            <span className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Upload a PDF, DOCX, or TXT. AYN saves it as your primary resume and instantly drafts your canonical profile below.
        </p>
        <ResumeUpload onParsed={handleResumeParsed} variant="full" />
      </Card>

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
        </div>
      </Card>

      {/* v2.9.0-A / v2.9.1 — Talent Pool consent */}
      <Card className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium">Let employers find me</span>
            {poolOptedIn
              ? <Badge variant="secondary">On</Badge>
              : <Badge variant="outline">Off</Badge>}
          </div>
          {poolOptedIn && reveals.filter(r => r.status === "pending").length > 0 && (
            <p className="text-xs font-medium text-primary mt-1">
              {reveals.filter(r => r.status === "pending").length} {reveals.filter(r => r.status === "pending").length === 1 ? "company wants" : "companies want"} an intro
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            When on, AYN can present your anonymized profile (skills, experience, seniority) to verified employers searching for candidates. Your name and contact details are never shared until you approve a specific request. Turn this off anytime and your data leaves the pool immediately.
          </p>
          {poolOptedIn && !poolLoading && (
            <p className="text-xs text-muted-foreground mt-2">
              In the pool · {poolSkillsCount} skills indexed{poolIndexed ? "" : " (indexing…)"}
              {" · "}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await resumeHubApi.talentPoolReindexSelf();
                    await loadPool();
                    toast({ title: "Profile re-indexed", description: `${r.skills_count} skills, ${r.model}` });
                  } catch (e) {
                    toast({ title: "Couldn't re-index", description: (e as Error).message, variant: "destructive" });
                  }
                }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Re-index my profile
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {poolSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Switch checked={poolOptedIn} disabled={poolLoading || poolSaving} onCheckedChange={togglePool} />
        </div>
      </Card>


      {/* v2.9.0-B — Intro requests from employers */}
      {poolOptedIn && reveals.length > 0 && (
        <Card className="p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4 text-primary" />
            Intro requests
          </div>
          <p className="text-xs text-muted-foreground">
            Employers who searched the pool and want to reach out. Your name and email stay private until you approve.
          </p>
          <div className="space-y-2">
            {reveals.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.org_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.job_title || "Role"} · {r.status}
                  </div>
                </div>
                {r.status === "pending" ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={revealBusy[r.id]} onClick={() => decideReveal(r.id, false)}>Decline</Button>
                    <Button size="sm" disabled={revealBusy[r.id]} onClick={() => decideReveal(r.id, true)}>
                      {revealBusy[r.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Share contact"}
                    </Button>
                  </div>
                ) : (
                  <Badge variant={r.status === "approved" ? "secondary" : "outline"}>{r.status}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Completeness meter */}
      {(() => {
        const { pct, checks } = computeCompleteness(profile);
        return (
          <Card className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Profile completeness</h3>
              <span className="text-sm font-mono tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {checks.map((c, i) => (
                <div key={i} className={`text-xs flex items-center gap-2 ${c.done ? "text-foreground" : "text-muted-foreground"}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.done ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  {c.label}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">A higher score means Autofill, Score, Tailor, and Cover Letter have more accurate facts to work with.</p>
          </Card>
        );
      })()}

      {/* Additional application fields — part of the one profile, powers Autofill */}
      <CanadianProfileForm
        ref={canadianRef}
        userId={userId}
        resumeData={parsedResume ?? primaryResumeContent ?? undefined}
        hideSaveButton
        middle={
          <>
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
          </>
        }
      />

      {/* Single Save all — saves both canonical career profile and application details */}
      <div className="sticky bottom-4 z-10 flex justify-end pt-2">
        <Button size="lg" onClick={save} disabled={saving} className="shadow-lg">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save all
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
