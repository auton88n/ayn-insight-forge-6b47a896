/**
 * ProfileTab.tsx — v3.2.0 "one profile, and show what it powers"
 *
 * There used to be two surfaces here: a "Profile" and a "Canonical Profile".
 * Canonical is an internal engineering concept and it leaked into the UI.
 * A job seeker sees exactly one profile now. _shared/identity.ts already
 * resolves precedence (profile > canonical > resume > account), so this view
 * mirrors that order, shows one value per field with a small source label,
 * and always writes edits to the user-entered layer so they win afterwards.
 *
 * Fields are grouped by what they power, because since autofill was removed
 * their purpose changed: they are matching signals for the talent pool and
 * generation inputs for scoring, tailoring, and cover letters.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Plus, X, FileUp, ArrowRight, Download, RefreshCw, Trash2 } from "lucide-react";
import { notifyProfileUpdated } from "@/lib/extension";
import { ResumeUpload } from "@/components/resume-hub/ResumeUpload";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { reindexTalentPool } from "@/lib/talentPoolSync";
import { resumeToText, buildTextPdfBlob, buildTextDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";

// ── Types (mirror the edge-function profile shape) ───────────────────────────
type Skill = { name: string; years?: number; level?: string };
type Exp = { company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[] };
type Edu = { school: string; degree?: string; field?: string; start?: string; end?: string };
type Cert = { name: string; issuer?: string; year?: string };
type WorkAuth = {
  citizenship?: string; countries?: string[];
  work_authorized_us?: boolean; work_authorized_ca?: boolean;
  needs_sponsorship_now?: boolean; needs_sponsorship_future?: boolean;
  visa_type?: string; notes?: string;
};
type Prefs = {
  open_to_remote?: boolean; open_to_relocation?: boolean;
  salary_min_usd?: number; salary_currency?: string;
  desired_titles?: string[]; desired_locations?: string[];
};
type Derived = {
  total_yoe?: number; seniority?: string; primary_function?: string;
  top_skills?: string[]; education_level?: string;
  current_title?: string; current_company?: string;
};
type Career = {
  skills: Skill[]; experiences: Exp[]; education: Edu[]; certifications: Cert[];
  work_auth: WorkAuth; preferences: Prefs; derived: Derived;
};

const EMPTY: Career = { skills: [], experiences: [], education: [], certifications: [], work_auth: {}, preferences: {}, derived: {} };

const WORK_COUNTRIES = ["Canada", "United States", "United Kingdom", "European Union", "Australia", "United Arab Emirates"];

type SourceTag = "entered" | "resume" | "account" | "none";
const SOURCE_LABEL: Record<SourceTag, string> = {
  entered: "You entered this",
  resume: "From your resume",
  account: "From your account",
  none: "",
};

/** Personal fields live in user_profile_data, the user-entered layer. */
type PersonalKey = "first_name" | "last_name" | "email" | "phone" | "city" | "linkedin" | "github" | "portfolio";
type Personal = Record<PersonalKey, string>;
const EMPTY_PERSONAL: Personal = { first_name: "", last_name: "", email: "", phone: "", city: "", linkedin: "", github: "", portfolio: "" };

function mapResumeToCareer(resume: ResumeContent, prev: Career): Career {
  const work = resume.work || [];
  const edu = resume.education || [];
  const skills = (resume.skills || []).filter(Boolean);
  const startYears = work.map(w => parseInt(String(w.start || "").slice(0, 4))).filter(y => y > 1950 && y < 2100);
  const earliest = startYears.length ? Math.min(...startYears) : undefined;
  const total_yoe = earliest ? Math.max(0, new Date().getFullYear() - earliest) : prev.derived?.total_yoe;
  return {
    ...prev,
    skills: skills.length ? skills.map(name => ({ name })) : prev.skills,
    experiences: work.length
      ? work.map(w => ({ company: w.company || "", title: w.title || "", location: w.location, start: w.start, end: w.end, current: !w.end, bullets: w.bullets || [] }))
      : prev.experiences,
    education: edu.length
      ? edu.map(e => ({ school: e.school || "", degree: e.degree, field: e.field, start: e.start, end: e.end }))
      : prev.education,
    derived: {
      ...prev.derived,
      current_title: prev.derived?.current_title || resume.basics?.title || work[0]?.title,
      current_company: prev.derived?.current_company || work[0]?.company,
      education_level: prev.derived?.education_level || edu[0]?.degree,
      total_yoe,
      top_skills: skills.length ? skills.slice(0, 8) : prev.derived?.top_skills,
    },
  };
}

export default function ProfileTab({ userId, onOpenDiscovery }: { userId: string; onOpenDiscovery: () => void }) {
  const { toast } = useToast();
  const [career, setCareer] = useState<Career>(EMPTY);
  const [personal, setPersonal] = useState<Personal>(EMPTY_PERSONAL);
  const [personalTouched, setPersonalTouched] = useState<Partial<Record<PersonalKey, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [primaryResume, setPrimaryResume] = useState<{ id: string; title: string; created_at: string } | null>(null);
  // v3.4.0 — legacy accounts can hold several resumes from before the
  // one-resume rule. They are read only and exist so nobody loses a file.
  const [olderResumes, setOlderResumes] = useState<{ id: string; title: string; created_at: string; content: ResumeContent }[]>([]);
  const [showOlder, setShowOlder] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [resumeContent, setResumeContent] = useState<ResumeContent | null>(null);
  const [accountEmail, setAccountEmail] = useState("");

  // ── Load everything the single profile reads from ───────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: canon }, { data: prof }, { data: resumeRows }, { data: auth }] = await Promise.all([
        supabase.from("user_profile_canonical")
          .select("skills, experiences, education, certifications, work_auth, preferences, derived")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("user_profile_data")
          .select("legal_first_name, legal_last_name, email, phone, address, links")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("resumes").select("id, title, content, created_at, is_primary")
          .eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.auth.getUser(),
      ]);

      setCareer({ ...EMPTY, ...((canon ?? {}) as unknown as Partial<Career>) });

      if (prof) {
        const addr = (prof.address ?? {}) as Record<string, string>;
        const lk = (prof.links ?? {}) as Record<string, string>;
        const next: Personal = {
          first_name: prof.legal_first_name ?? "",
          last_name: prof.legal_last_name ?? "",
          email: prof.email ?? "",
          phone: prof.phone ?? "",
          city: addr.city ?? "",
          linkedin: lk.linkedin ?? "",
          github: lk.github ?? "",
          portfolio: lk.portfolio ?? "",
        };
        setPersonal(next);
        const touched: Partial<Record<PersonalKey, boolean>> = {};
        (Object.keys(next) as PersonalKey[]).forEach(k => { if (next[k]) touched[k] = true; });
        setPersonalTouched(touched);
      }

      type Row = { id: string; title: string; content: unknown; created_at: string; is_primary: boolean };
      const rows = ((resumeRows ?? []) as Row[]);
      const active = rows.find(r => r.is_primary) ?? rows[0] ?? null;
      if (active) {
        setPrimaryResume({ id: active.id, title: active.title, created_at: active.created_at });
        setResumeContent((active.content as ResumeContent) ?? null);
      } else {
        setPrimaryResume(null);
        setResumeContent(null);
      }
      setOlderResumes(
        rows.filter(r => r.id !== active?.id)
          .map(r => ({ id: r.id, title: r.title, created_at: r.created_at, content: (r.content ?? {}) as ResumeContent }))
      );
      setAccountEmail(auth?.user?.email ?? "");
    } catch (e) {
      toast({ title: "Couldn't load profile", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userId]);

  useEffect(() => { load(); }, [load]);


  // ── Fallback layer: resume, then account. Mirrors identity.ts order. ────
  const fallback = useMemo(() => {
    const b = resumeContent?.basics ?? {};
    const nameParts = (b.name || "").trim().split(/\s+/).filter(Boolean);
    const links = (b.links ?? []) as Array<{ label?: string; url?: string }>;
    const findLink = (needle: string) =>
      links.find(l => `${l.label || ""} ${l.url || ""}`.toLowerCase().includes(needle))?.url || "";
    const map: Record<PersonalKey, { value: string; source: SourceTag }> = {
      first_name: { value: nameParts[0] || "", source: nameParts.length ? "resume" : "none" },
      last_name: { value: nameParts.slice(1).join(" "), source: nameParts.length > 1 ? "resume" : "none" },
      email: b.email ? { value: b.email, source: "resume" } : { value: accountEmail, source: accountEmail ? "account" : "none" },
      phone: { value: b.phone || "", source: b.phone ? "resume" : "none" },
      city: { value: b.location || "", source: b.location ? "resume" : "none" },
      linkedin: { value: findLink("linkedin"), source: findLink("linkedin") ? "resume" : "none" },
      github: { value: findLink("github"), source: findLink("github") ? "resume" : "none" },
      portfolio: { value: findLink("portfolio"), source: findLink("portfolio") ? "resume" : "none" },
    };
    return map;
  }, [resumeContent, accountEmail]);

  const field = (k: PersonalKey) => {
    const entered = personal[k];
    if (personalTouched[k] || entered) return { value: entered, source: "entered" as SourceTag };
    return fallback[k];
  };
  const setPersonalField = (k: PersonalKey, v: string) => {
    setPersonal(p => ({ ...p, [k]: v }));
    setPersonalTouched(t => ({ ...t, [k]: true }));
  };

  const resumeSkillSet = useMemo(
    () => new Set((resumeContent?.skills ?? []).map(s => String(s).toLowerCase().trim())),
    [resumeContent]
  );

  // ── Resume upload: becomes THE active resume, previous one goes inactive ──
  const handleResumeParsed = async ({ resume }: { resume: ResumeContent; plainText: string }) => {
    setUploading(true);
    try {
      await supabase.from("resumes").update({ is_primary: false }).eq("user_id", userId);
      const autoTitle = resume.basics?.name ? `${resume.basics.name} Resume` : "Uploaded Resume";
      const { error } = await supabase.from("resumes").insert({
        user_id: userId, title: autoTitle, content: resume as never, is_primary: true,
      });
      if (error) throw error;
      setResumeContent(resume);
      setCareer(prev => mapResumeToCareer(resume, prev));
      // Resumes are written client side, so the pool index would go stale.
      // Fire and forget, opt-in gated, never blocks the save.
      reindexTalentPool("resume_upload");
      setReplaceOpen(false);
      await load();
      toast({ title: "Resume saved", description: "Review the fields below, then Save profile." });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const downloadResume = async (content: ResumeContent, name: string, kind: "pdf" | "docx") => {
    try {
      const text = resumeToText(content);
      const base = fileBase(name || "Resume");
      if (kind === "pdf") downloadBlob(buildTextPdfBlob(text), `${base}.pdf`);
      else downloadBlob(await buildTextDocxBlob(text), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const deleteOlderResume = async (id: string) => {
    if (!confirm("Delete this older resume? This cannot be undone.")) return;
    const { error } = await supabase.from("resumes").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setOlderResumes(list => list.filter(r => r.id !== id));
  };


  const save = async () => {
    setSaving(true);
    try {
      const [{ error: cErr }, { error: pErr }] = await Promise.all([
        supabase.from("user_profile_canonical").upsert({
          user_id: userId,
          skills: career.skills ?? [],
          experiences: career.experiences ?? [],
          education: career.education ?? [],
          certifications: career.certifications ?? [],
          work_auth: career.work_auth ?? {},
          preferences: career.preferences ?? {},
          derived: career.derived ?? {},
          updated_at: new Date().toISOString(),
        } as unknown as never, { onConflict: "user_id" }),
        supabase.from("user_profile_data").upsert({
          user_id: userId,
          legal_first_name: field("first_name").value || null,
          legal_last_name: field("last_name").value || null,
          email: field("email").value || null,
          phone: field("phone").value || null,
          address: { city: field("city").value || "" },
          links: {
            linkedin: field("linkedin").value || "",
            github: field("github").value || "",
            portfolio: field("portfolio").value || "",
          },
          updated_at: new Date().toISOString(),
        } as unknown as never, { onConflict: "user_id" }),
      ]);
      if (cErr) throw new Error(cErr.message);
      if (pErr) throw new Error(pErr.message);
      void notifyProfileUpdated();
      // Profile fields are upserted straight to Supabase here, they do not go
      // through profile_canonical_save, so nothing reindexes server side.
      reindexTalentPool("profile_save");
      toast({ title: "Profile saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setDerived = (k: keyof Derived, v: unknown) => setCareer(p => ({ ...p, derived: { ...p.derived, [k]: v } }));
  const setWA = (k: keyof WorkAuth, v: unknown) => setCareer(p => ({ ...p, work_auth: { ...p.work_auth, [k]: v } }));
  const setPref = (k: keyof Prefs, v: unknown) => setCareer(p => ({ ...p, preferences: { ...p.preferences, [k]: v } }));

  const countries = career.work_auth.countries ?? [
    ...(career.work_auth.work_authorized_ca ? ["Canada"] : []),
    ...(career.work_auth.work_authorized_us ? ["United States"] : []),
  ];
  const toggleCountry = (c: string) => {
    const next = countries.includes(c) ? countries.filter(x => x !== c) : [...countries, c];
    setCareer(p => ({
      ...p,
      work_auth: {
        ...p.work_auth,
        countries: next,
        work_authorized_ca: next.includes("Canada"),
        work_authorized_us: next.includes("United States"),
      },
    }));
  };


  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading profile…</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── 0. Your resume (v3.4.0: one active resume, no library) ──────── */}
      <Group title="Your resume" line="Everything AYN writes starts from this.">
        {primaryResume ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileUp className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{primaryResume.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Added {new Date(primaryResume.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadResume(resumeContent ?? {}, primaryResume.title, "pdf")}>
                <Download className="w-4 h-4 mr-1.5" /> Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (replaceOpen) { setReplaceOpen(false); return; }
                  if (confirm("Replace your resume? AYN will read the new file and update the fields below. Your current resume becomes inactive.")) {
                    setReplaceOpen(true);
                  }
                }}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> {replaceOpen ? "Cancel" : "Replace resume"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload a PDF, DOCX, or TXT. AYN reads it once and fills in everything below, so you only
            correct what it got wrong.
          </p>
        )}

        {uploading && (
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </span>
        )}

        {(!primaryResume || replaceOpen) && <ResumeUpload onParsed={handleResumeParsed} variant="full" />}

        {olderResumes.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] text-muted-foreground">
              You have {olderResumes.length} older {olderResumes.length === 1 ? "resume" : "resumes"} from an earlier version of AYN.{" "}
              <button type="button" className="underline hover:text-foreground" onClick={() => setShowOlder(v => !v)}>
                {showOlder ? "Hide" : "View"}
              </button>
            </p>
            {showOlder && (
              <div className="mt-2 space-y-1.5">
                {olderResumes.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => downloadResume(r.content, r.title, "pdf")}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteOlderResume(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Group>


      {/* ── 1. About you ───────────────────────────────────────────────── */}
      <Group title="About you" line="Used in your tailored resumes and cover letters.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SourcedField label="First name" f={field("first_name")} onChange={v => setPersonalField("first_name", v)} />
          <SourcedField label="Last name" f={field("last_name")} onChange={v => setPersonalField("last_name", v)} />
          <SourcedField label="Email" f={field("email")} onChange={v => setPersonalField("email", v)} />
          <SourcedField label="Phone" f={field("phone")} onChange={v => setPersonalField("phone", v)} />
          <SourcedField label="Location" f={field("city")} onChange={v => setPersonalField("city", v)} placeholder="City, region" />
          <SourcedField
            label="Current title"
            f={{
              value: career.derived.current_title || "",
              source: career.derived.current_title ? "entered" : "none",
            }}
            onChange={v => setDerived("current_title", v)}
          />
          <SourcedField
            label="Current company"
            f={{
              value: career.derived.current_company || "",
              source: career.derived.current_company ? "entered" : "none",
            }}
            onChange={v => setDerived("current_company", v)}
          />
          <SourcedField label="LinkedIn" f={field("linkedin")} onChange={v => setPersonalField("linkedin", v)} placeholder="https://" />
          <SourcedField label="GitHub" f={field("github")} onChange={v => setPersonalField("github", v)} placeholder="https://" />
          <SourcedField label="Portfolio" f={field("portfolio")} onChange={v => setPersonalField("portfolio", v)} placeholder="https://" />
        </div>
      </Group>

      {/* ── 2. What you're looking for ─────────────────────────────────── */}
      <Group title="What you're looking for" line="Helps employers searching the talent pool find you for the right roles.">
        <ChipList
          label="Desired titles"
          values={career.preferences.desired_titles || []}
          onChange={v => setPref("desired_titles", v)}
          placeholder="Add a title"
        />
        <ChipList
          label="Desired locations"
          values={career.preferences.desired_locations || []}
          onChange={v => setPref("desired_locations", v)}
          placeholder="Add a city or region"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SourcedField
            label="Minimum salary"
            type="number"
            f={{ value: String(career.preferences.salary_min_usd ?? ""), source: career.preferences.salary_min_usd != null ? "entered" : "none" }}
            onChange={v => setPref("salary_min_usd", v === "" ? undefined : Number(v))}
            placeholder="80000"
          />
          <SourcedField
            label="Currency"
            f={{ value: career.preferences.salary_currency || "", source: career.preferences.salary_currency ? "entered" : "none" }}
            onChange={v => setPref("salary_currency", v)}
            placeholder="CAD, USD, EUR"
          />
          <Toggle label="Open to remote" value={!!career.preferences.open_to_remote} onChange={v => setPref("open_to_remote", v)} />
          <Toggle label="Open to relocation" value={!!career.preferences.open_to_relocation} onChange={v => setPref("open_to_relocation", v)} />
        </div>
      </Group>

      {/* ── 3. Work eligibility ────────────────────────────────────────── */}
      <Group title="Work eligibility" line="Employers filter on this. Getting it right means fewer wrong matches.">
        <div>
          <Label className="text-xs text-muted-foreground">Countries you can work in</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {WORK_COUNTRIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCountry(c)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  countries.includes(c)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SourcedField
            label="Citizenship"
            f={{ value: career.work_auth.citizenship || "", source: career.work_auth.citizenship ? "entered" : "none" }}
            onChange={v => setWA("citizenship", v)}
            placeholder="e.g. Canada"
          />
          <Toggle label="I need sponsorship now" value={!!career.work_auth.needs_sponsorship_now} onChange={v => setWA("needs_sponsorship_now", v)} />
          <Toggle label="I will need sponsorship later" value={!!career.work_auth.needs_sponsorship_future} onChange={v => setWA("needs_sponsorship_future", v)} />
        </div>
      </Group>

      {/* ── 4. Your experience ─────────────────────────────────────────── */}
      <Group title="Your experience" line="This is what AYN scores against a job and tailors from.">
        {/* Skills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Skills ({career.skills.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, skills: [...p.skills, { name: "" }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add skill
            </Button>
          </div>
          {career.skills.length === 0 && <p className="text-xs text-muted-foreground">No skills yet. Upload a resume and AYN fills these in.</p>}
          {career.skills.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-6" placeholder="Skill" value={s.name} onChange={e => updateAt(setCareer, "skills", i, { ...s, name: e.target.value })} />
              <Input className="col-span-2" type="number" placeholder="Years" value={s.years ?? ""} onChange={e => updateAt(setCareer, "skills", i, { ...s, years: e.target.value === "" ? undefined : Number(e.target.value) })} />
              <span className="col-span-3 text-[11px] text-muted-foreground">
                {resumeSkillSet.has(s.name.toLowerCase().trim()) ? SOURCE_LABEL.resume : SOURCE_LABEL.entered}
              </span>
              <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeAt(setCareer, "skills", i)}><X className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>

        {/* Work history */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Work history ({career.experiences.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, experiences: [...p.experiences, { company: "", title: "" }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add role
            </Button>
          </div>
          {career.experiences.length === 0 && <p className="text-xs text-muted-foreground">No roles yet.</p>}
          {career.experiences.map((e, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Title" value={e.title} onChange={ev => updateAt(setCareer, "experiences", i, { ...e, title: ev.target.value })} />
                <Input placeholder="Company" value={e.company} onChange={ev => updateAt(setCareer, "experiences", i, { ...e, company: ev.target.value })} />
                <Input placeholder="Start" value={e.start || ""} onChange={ev => updateAt(setCareer, "experiences", i, { ...e, start: ev.target.value })} />
                <Input placeholder="End (or Present)" value={e.end || ""} onChange={ev => updateAt(setCareer, "experiences", i, { ...e, end: ev.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={!!e.current} onCheckedChange={v => updateAt(setCareer, "experiences", i, { ...e, current: v })} />
                  Current role
                </label>
                <Button variant="ghost" size="sm" onClick={() => removeAt(setCareer, "experiences", i)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Education */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Education ({career.education.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, education: [...p.education, { school: "" }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add school
            </Button>
          </div>
          {career.education.length === 0 && <p className="text-xs text-muted-foreground">No education entries yet.</p>}
          {career.education.map((e, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-lg p-3">
              <Input placeholder="School" value={e.school} onChange={ev => updateAt(setCareer, "education", i, { ...e, school: ev.target.value })} />
              <Input placeholder="Degree" value={e.degree || ""} onChange={ev => updateAt(setCareer, "education", i, { ...e, degree: ev.target.value })} />
              <Input placeholder="Field" value={e.field || ""} onChange={ev => updateAt(setCareer, "education", i, { ...e, field: ev.target.value })} />
              <Input placeholder="End year" value={e.end || ""} onChange={ev => updateAt(setCareer, "education", i, { ...e, end: ev.target.value })} />
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => removeAt(setCareer, "education", i)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Derived signals employers and scoring both use */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <SourcedField
            label="Total years of experience"
            type="number"
            f={{ value: String(career.derived.total_yoe ?? ""), source: career.derived.total_yoe != null ? "entered" : "none" }}
            onChange={v => setDerived("total_yoe", v === "" ? undefined : Number(v))}
          />
          <SourcedField
            label="Seniority"
            f={{ value: career.derived.seniority || "", source: career.derived.seniority ? "entered" : "none" }}
            onChange={v => setDerived("seniority", v)}
            placeholder="entry, mid, senior, staff"
          />
          <SourcedField
            label="Primary function"
            f={{ value: career.derived.primary_function || "", source: career.derived.primary_function ? "entered" : "none" }}
            onChange={v => setDerived("primary_function", v)}
            placeholder="Backend, Product, Design"
          />
        </div>
      </Group>

      <p className="text-xs text-muted-foreground">
        This profile is what employers search when you are in the talent pool.{" "}
        <button
          type="button"
          onClick={onOpenDiscovery}
          className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
        >
          Get discovered <ArrowRight className="w-3 h-3" />
        </button>
      </p>

      <div className="sticky bottom-4 z-10 flex justify-end pt-2">
        <Button size="lg" onClick={save} disabled={saving} className="shadow-lg">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}

// ── Presentation helpers ─────────────────────────────────────────────────────
function Group({ title, line, children }: { title: string; line: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{line}</p>
      </div>
      {children}
    </Card>
  );
}

function SourcedField({
  label, f, onChange, placeholder, type,
}: {
  label: string;
  f: { value: string; source: SourceTag };
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={f.value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} />
      {f.source !== "none" && <p className="text-[11px] text-muted-foreground">{SOURCE_LABEL[f.source]}</p>}
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

function updateAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setCareer: React.Dispatch<React.SetStateAction<Career>>, key: K, i: number, value: Career[K][number]
) {
  setCareer(p => {
    const arr = [...p[key]] as Career[K];
    (arr as unknown as Array<Career[K][number]>)[i] = value;
    return { ...p, [key]: arr };
  });
}

function removeAt<K extends "skills" | "experiences" | "education" | "certifications">(
  setCareer: React.Dispatch<React.SetStateAction<Career>>, key: K, i: number
) {
  setCareer(p => {
    const arr = (p[key] as unknown as Array<Career[K][number]>).filter((_, j) => j !== i);
    return { ...p, [key]: arr as Career[K] };
  });
}
