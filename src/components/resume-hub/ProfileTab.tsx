/**
 * ProfileTab.tsx — v3.5.0 "a profile that can actually be matched"
 *
 * This form IS the matching index. Before v3.5.0 it was too thin to match on
 * (bare skill strings, invisible work history) and too noisy to fill in
 * ("You entered this" eight times). Now:
 *
 * FIVE GROUPS, in the order a job seeker thinks about them: Your resume,
 * About you, Your experience, What you are looking for, Work eligibility.
 * Each is a collapsible card with a purpose line, open state remembered for
 * the session.
 *
 * PROVENANCE only where it informs: "From your resume" on resume-derived
 * values, "Edited by you" with a revert when the user moved away from the
 * resume value, and nothing at all for fields they simply typed.
 *
 * AUTOSAVE on blur with a small saved indicator. No giant Save button.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, X, FileUp, ArrowRight, Download, RefreshCw, Trash2,
  ChevronDown, Check, Undo2, Sparkles, AlertTriangle, ShieldCheck, Users,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResumeUpload } from "@/components/resume-hub/ResumeUpload";
import GuidedIntake from "@/components/resume-hub/GuidedIntake";
import GapProbeDialog from "@/components/resume-hub/GapProbeDialog";
import { classifyProbableIssue, type ProbeTarget } from "@/lib/gapProbe";
import { resumeHubApi, type ResumeContent, type TalentPoolStatus, type GuidedIntakeExtraction, type GapProbeResult } from "@/lib/resumeHub";
import { reindexTalentPool, setPoolOptInCache } from "@/lib/talentPoolSync";
import { buildResumeDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";
import { computeReadiness } from "@/lib/profileGaps";

/** v3.5.1 — bump whenever the consent wording changes. */
const DISCOVERY_CONSENT_VERSION = "v3.5.1-full-profile";

// ── Types (mirror the edge-function canonical shape) ─────────────────────────
export type SkillLevel = "familiar" | "proficient" | "advanced" | "expert";
export type LastUsed = "this_year" | "within_2_years" | "over_2_years";

type Skill = { name: string; years?: number | null; level?: SkillLevel | null; last_used?: LastUsed | null };
type Exp = {
  company: string; title: string; location?: string; start?: string; end?: string; current?: boolean;
  bullets?: string[]; bullets_from_resume?: boolean; industry?: string; team_size?: number | null;
};
type Edu = { school: string; degree?: string; field?: string; start?: string; end?: string };
type Cert = { name: string; issuer?: string; year?: string };
type WorkAuth = {
  citizenship?: string; countries?: string[];
  work_authorized_us?: boolean; work_authorized_ca?: boolean;
  needs_sponsorship_now?: boolean; needs_sponsorship_future?: boolean;
  visa_type?: string; notes?: string; work_permit_expires?: string;
};
type Prefs = {
  open_to_remote?: boolean; open_to_relocation?: boolean;
  salary_min_usd?: number; salary_currency?: string;
  desired_titles?: string[]; desired_locations?: string[];
  employment_types?: string[]; availability?: string; company_stages?: string[];
};
type Derived = {
  total_yoe?: number; seniority?: string; primary_function?: string;
  top_skills?: string[]; education_level?: string;
  current_title?: string; current_company?: string;
  known_for?: string[];
};
// v3.265.0 — the auto-apply answer bank. Free-text, user-typed only, never
// AI-generated: application_answer_match (backend) copies these verbatim
// into a matching question on a real job application form. Keys are the
// same slugs that matcher's KNOWN_QUESTIONS registry resolves against.
type ScreeningAnswers = Record<string, string>;
// v3.284.0 -- asked directly, "add all questions to the profile": expanded
// from the original 6 to cover the rest of the common, near-universal ATS
// screening questions found live across real applications this session
// (Ashby/Greenhouse/Lever all ask some subset of these). Still the same
// rule as every entry here since v3.265.0 -- autofill copies whatever is
// typed here verbatim, it never guesses or invents one on its own.
const SCREENING_QUESTIONS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "non_compete", label: "Are you subject to a non-compete or restrictive covenant?", placeholder: "e.g. No" },
  { key: "outside_employment", label: "Would you continue other work or self-employment if hired?", placeholder: "e.g. No, or describe it honestly if yes" },
  { key: "related_to_employees", label: "Are you related to any employees at companies you apply to?", placeholder: "e.g. No" },
  { key: "referral_source", label: "How did you usually hear about roles like this?", placeholder: "e.g. Online job search" },
  { key: "referral_name", label: "Default referral name, if you have none to give", placeholder: "e.g. N/A" },
  { key: "eighteen_or_older", label: "Are you at least 18 years old?", placeholder: "e.g. Yes" },
  { key: "legal_drinking_age", label: "Are you of legal drinking age where required for the role?", placeholder: "e.g. Yes" },
  { key: "background_check", label: "Willing to complete a background check if offered the role?", placeholder: "e.g. Yes" },
  { key: "drug_test", label: "Willing to complete a drug test if offered the role?", placeholder: "e.g. Yes" },
  { key: "notice_period", label: "What is your notice period at your current job?", placeholder: "e.g. 2 weeks, or Immediately available" },
  { key: "preferred_name", label: "Preferred name, if different from your legal name", placeholder: "Leave blank if it's the same" },
  { key: "hr_contact_consent", label: "OK for HR to contact you about other open roles at the same company?", placeholder: "e.g. Yes" },
];

type Career = {
  skills: Skill[]; experiences: Exp[]; education: Edu[]; certifications: Cert[];
  work_auth: WorkAuth; preferences: Prefs; derived: Derived; screening_answers: ScreeningAnswers;
};

const EMPTY: Career = { skills: [], experiences: [], education: [], certifications: [], work_auth: {}, preferences: {}, derived: {}, screening_answers: {} };

// v3.185.0 trimmed this to Canada/US only, back when job-board-sync was
// deliberately scoped to those two countries alone (v3.163.0) -- every
// other country was a real dead option, no postings behind it to match
// against. That scope itself was always disclosed as a later expansion,
// not a permanent exclusion, and it since expanded for real (v3.309.0):
// job-board-sync and ats-direct-sync now source real postings across
// North America, Europe, Middle East, and Australia. Widened here to
// match -- the exact same real country set _shared/geoScope.ts's own
// classifyRegion() already checks against, not a new, separate list that
// could quietly drift out of sync with what AYN can actually match a
// person against. Ordered by region so the chip row reads in clusters.
const WORK_COUNTRIES = [
  // North America
  "Canada", "United States",
  // Europe
  "United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands",
  "Belgium", "Switzerland", "Ireland", "Portugal", "Poland", "Sweden",
  "Norway", "Denmark", "Austria", "Finland", "Romania", "Greece",
  "Hungary", "Czech Republic",
  // Middle East
  "United Arab Emirates", "Saudi Arabia", "Israel", "Qatar", "Kuwait",
  "Bahrain", "Oman",
  // Australia
  "Australia",
];
const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: "familiar", label: "Familiar" },
  { value: "proficient", label: "Proficient" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];
const LAST_USED: { value: LastUsed; label: string }[] = [
  { value: "this_year", label: "This year" },
  { value: "within_2_years", label: "Within 2 years" },
  { value: "over_2_years", label: "Over 2 years ago" },
];
const INDUSTRIES = ["Fintech", "Healthcare", "Ecommerce", "Enterprise SaaS", "Government", "Education", "Logistics", "Gaming", "Energy"];
const EMPLOYMENT_TYPES = ["Full time", "Contract", "Part time", "Internship"];
const AVAILABILITY = ["Immediately", "2 weeks", "1 month", "3 months", "Just looking"];
const COMPANY_STAGES = ["Early startup", "Growth", "Large company", "No preference"];
// Same vocabulary the backend's derived.seniority is documented and scored
// against (supabase/functions/resume-hub/index.ts, canonicalDigest / the
// resume-parsing prompt) — a datalist so an existing free-text value is
// never lost, but a fresh pick lines up with what the matcher actually reads.
const SENIORITY_LEVELS = ["Intern", "Entry", "Mid", "Senior", "Staff", "Principal", "Manager", "Director", "VP", "C-level"];
const PRIMARY_FUNCTIONS = ["Engineering", "Product", "Design", "Data", "Marketing", "Sales", "Operations", "Finance", "HR", "Customer success", "Legal"];
const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "AED"];

/** Personal fields live in user_profile_data, the user-entered layer. */
type PersonalKey = "first_name" | "last_name" | "email" | "phone" | "city" | "linkedin" | "github" | "portfolio";
type Personal = Record<PersonalKey, string>;
const EMPTY_PERSONAL: Personal = { first_name: "", last_name: "", email: "", phone: "", city: "", linkedin: "", github: "", portfolio: "" };

function normalizeSkills(raw: unknown): Skill[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => {
    if (typeof s === "string") return { name: s, level: null, years: null, last_used: null };
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? ""),
      level: (o.level as SkillLevel) ?? null,
      years: typeof o.years === "number" ? o.years : null,
      last_used: (o.last_used as LastUsed) ?? null,
    };
  }).filter(s => s.name !== undefined);
}

function mapResumeToCareer(resume: ResumeContent, prev: Career): Career {
  const work = resume.work || [];
  const edu = resume.education || [];
  const skills = (resume.skills || []).filter(Boolean);
  const startYears = work.map(w => parseInt(String(w.start || "").slice(0, 4))).filter(y => y > 1950 && y < 2100);
  const earliest = startYears.length ? Math.min(...startYears) : undefined;
  const total_yoe = earliest ? Math.max(0, new Date().getFullYear() - earliest) : prev.derived?.total_yoe;
  return {
    ...prev,
    skills: skills.length ? skills.map(name => ({ name, level: null, years: null, last_used: null })) : prev.skills,
    experiences: work.length
      ? work.map(w => ({
          company: w.company || "", title: w.title || "", location: w.location,
          start: w.start, end: w.end, current: !w.end,
          bullets: (w.bullets || []).slice(0, 5),
          bullets_from_resume: (w.bullets || []).length > 0,
        }))
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

export default function ProfileTab({ userId, onCreditsChanged }: { userId: string; onCreditsChanged?: () => void }) {
  const { toast } = useToast();
  const [career, setCareer] = useState<Career>(EMPTY);
  const [personal, setPersonal] = useState<Personal>(EMPTY_PERSONAL);
  const [personalTouched, setPersonalTouched] = useState<Partial<Record<PersonalKey, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [uploading, setUploading] = useState(false);
  const [primaryResume, setPrimaryResume] = useState<{ id: string; title: string; created_at: string; ats_score: number | null; ats_issues: string[] | null } | null>(null);
  const [probeState, setProbeState] = useState<{ issue: string; question: string; target: ProbeTarget } | null>(null);
  const [probeApplying, setProbeApplying] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [resumeContent, setResumeContent] = useState<ResumeContent | null>(null);
  const [checkingResume, setCheckingResume] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeChanges, setOptimizeChanges] = useState<string[] | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [openSkill, setOpenSkill] = useState<number | null>(null);
  const [levelPromptDone, setLevelPromptDone] = useState(
    () => sessionStorage.getItem("ayn_skill_level_prompt") === "done"
  );

  // ── Discoverability toggle ("Let employers find me"), moved here from the
  // Get discovered tab so it sits right where the profile it controls is
  // being edited, instead of being one tab away and easy to miss. ─────────
  const [poolStatus, setPoolStatus] = useState<TalentPoolStatus | null>(null);
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolConfirmOpen, setPoolConfirmOpen] = useState(false);
  const poolOptedIn = !!poolStatus?.opted_in;
  const poolRestricted = !!poolStatus?.discovery_restricted;

  const loadPool = useCallback(async () => {
    try {
      const r = await resumeHubApi.talentPoolGet();
      setPoolStatus(r);
      setPoolOptInCache(!!r.opted_in);
    } catch { /* silent */ }
  }, []);

  const togglePool = async (next: boolean) => {
    setPoolSaving(true);
    setPoolConfirmOpen(false);
    try {
      await resumeHubApi.talentPoolSet(next, next ? DISCOVERY_CONSENT_VERSION : undefined);
      setPoolOptInCache(next);
      toast({
        title: next ? "You're discoverable" : "Left the pool",
        description: next
          ? "Employers searching AYN can now see your full profile. Contact details stay private until you approve an intro."
          : "Your profile left the pool.",
      });
      await loadPool();
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setPoolSaving(false); }
  };

  // ── Resumes list only: used on initial load AND after an upload, where a
  // full load() would re-fetch career from the DB before the freshly parsed
  // resume's skills/experience/education (merged into local state, not yet
  // persisted) ever reached the server, silently reverting them. ───────────
  type ResumeRow = { id: string; title: string; content: unknown; created_at: string; is_primary: boolean; ats_score: number | null; ats_issues: string[] | null };
  const loadResumes = useCallback(async () => {
    const { data: resumeRows } = await supabase.from("resumes").select("id, title, content, created_at, is_primary, ats_score, ats_issues")
      .eq("user_id", userId).order("created_at", { ascending: false });
    const rows = ((resumeRows ?? []) as ResumeRow[]);
    const active = rows.find(r => r.is_primary) ?? rows[0] ?? null;
    if (active) {
      setPrimaryResume({ id: active.id, title: active.title, created_at: active.created_at, ats_score: active.ats_score, ats_issues: active.ats_issues });
      setResumeContent((active.content as ResumeContent) ?? null);
    } else {
      setPrimaryResume(null);
      setResumeContent(null);
    }
  }, [userId]);

  // ── Load everything the single profile reads from ───────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: canon }, { data: prof }, , { data: auth }] = await Promise.all([
        supabase.from("user_profile_canonical")
          .select("skills, experiences, education, certifications, work_auth, preferences, derived, screening_answers")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("user_profile_data")
          .select("legal_first_name, legal_last_name, email, phone, address, links")
          .eq("user_id", userId).maybeSingle(),
        loadResumes(),
        supabase.auth.getUser(),
      ]);

      const c = { ...EMPTY, ...((canon ?? {}) as unknown as Partial<Career>) };
      // v3.5.0 migration: bare string skills become objects with empty level.
      c.skills = normalizeSkills((canon as { skills?: unknown } | null)?.skills);
      setCareer(c);

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

      setAccountEmail(auth?.user?.email ?? "");
    } catch (e) {
      toast({ title: "Couldn't load profile", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userId, loadResumes]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPool(); }, [loadPool]);

  // ── Fallback layer: resume, then account. Mirrors identity.ts order. ────
  const fallback = useMemo(() => {
    const b = resumeContent?.basics ?? {};
    const nameParts = (b.name || "").trim().split(/\s+/).filter(Boolean);
    const links = (b.links ?? []) as Array<{ label?: string; url?: string }>;
    const findLink = (needle: string) =>
      links.find(l => `${l.label || ""} ${l.url || ""}`.toLowerCase().includes(needle))?.url || "";
    const map: Record<PersonalKey, string> = {
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" "),
      email: b.email || accountEmail || "",
      phone: b.phone || "",
      city: b.location || "",
      linkedin: findLink("linkedin"),
      github: findLink("github"),
      portfolio: findLink("portfolio"),
    };
    return map;
  }, [resumeContent, accountEmail]);

  /**
   * v3.5.0 provenance rules. Only three states reach the UI:
   *  resume  — the shown value came from the resume and was not changed
   *  edited  — there is a resume value and the user moved away from it
   *  none    — the user typed it and there is nothing to compare against
   */
  const field = (k: PersonalKey): { value: string; source: "resume" | "edited" | "none"; original?: string } => {
    const entered = personal[k];
    const fromResume = fallback[k];
    if (!personalTouched[k] && !entered) {
      return { value: fromResume, source: fromResume ? "resume" : "none" };
    }
    if (fromResume && entered.trim() !== fromResume.trim()) {
      return { value: entered, source: "edited", original: fromResume };
    }
    return { value: entered, source: fromResume ? "resume" : "none" };
  };

  // v3.71.0 — Current title/company are just as resume-derived as the fields
  // above but had no provenance badge or revert, unlike every other field in
  // this group. No separate "touched" layer needed here (unlike Personal):
  // career.derived.current_title IS the single stored value, so it is
  // compared directly against a live resume-computed fallback.
  const derivedFallback = useMemo(() => {
    const w0 = resumeContent?.work?.[0];
    return {
      current_title: resumeContent?.basics?.title || w0?.title || "",
      current_company: w0?.company || "",
    };
  }, [resumeContent]);

  const derivedField = (k: "current_title" | "current_company"): { value: string; source: "resume" | "edited" | "none"; original?: string } => {
    const entered = career.derived[k] || "";
    const fromResume = derivedFallback[k];
    if (!entered) {
      return { value: fromResume, source: fromResume ? "resume" : "none" };
    }
    if (fromResume && entered.trim() !== fromResume.trim()) {
      return { value: entered, source: "edited", original: fromResume };
    }
    return { value: entered, source: fromResume ? "resume" : "none" };
  };

  const setPersonalField = (k: PersonalKey, v: string) => {
    setPersonal(p => ({ ...p, [k]: v }));
    setPersonalTouched(t => ({ ...t, [k]: true }));
  };

  // ── Autosave ─────────────────────────────────────────────────────────────
  const stateRef = useRef({ career, personal, personalTouched, fallback });
  stateRef.current = { career, personal, personalTouched, fallback };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v3.160.0 — see optimizeResume's own comment for why these persist a
  // retry's idempotency key rather than generating a fresh one every call.
  const optimizeIdemKey = useRef<string | null>(null);
  const generateIdemKey = useRef<string | null>(null);

  const persist = useCallback(async () => {
    const { career: c, personal: p, personalTouched: t, fallback: fb } = stateRef.current;
    const val = (k: PersonalKey) => (t[k] || p[k] ? p[k] : fb[k]);
    setSaveState("saving");
    try {
      const [{ error: cErr }, { error: pErr }] = await Promise.all([
        supabase.from("user_profile_canonical").upsert({
          user_id: userId,
          skills: c.skills ?? [],
          experiences: c.experiences ?? [],
          education: c.education ?? [],
          certifications: c.certifications ?? [],
          work_auth: c.work_auth ?? {},
          preferences: c.preferences ?? {},
          derived: c.derived ?? {},
          screening_answers: c.screening_answers ?? {},
          updated_at: new Date().toISOString(),
        } as unknown as never, { onConflict: "user_id" }),
        supabase.from("user_profile_data").upsert({
          user_id: userId,
          legal_first_name: val("first_name") || null,
          legal_last_name: val("last_name") || null,
          email: val("email") || null,
          phone: val("phone") || null,
          address: { city: val("city") || "" },
          links: { linkedin: val("linkedin") || "", github: val("github") || "", portfolio: val("portfolio") || "" },
          updated_at: new Date().toISOString(),
        } as unknown as never, { onConflict: "user_id" }),
      ]);
      if (cErr) throw new Error(cErr.message);
      if (pErr) throw new Error(pErr.message);
      reindexTalentPool("profile_save");
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    }
  }, [toast, userId]);

  /** Called on blur and on every discrete control change. */
  const queueSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void persist(); }, 900);
  }, [persist]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // ── Resume upload: becomes THE active resume. A replacement resume
  // deletes the one it replaces outright — there is no history to keep,
  // just the one resume that's actually current. (Tailored, job-specific
  // documents in resume_versions are unaffected: that table stores its own
  // independent copy of the content, not a reference to this row.) ──
  const handleResumeParsed = async ({ resume }: { resume: ResumeContent; plainText: string }) => {
    setUploading(true);
    try {
      await supabase.from("resumes").delete().eq("user_id", userId);
      const autoTitle = resume.basics?.name ? `${resume.basics.name} Resume` : "Uploaded Resume";
      const { data: inserted, error } = await supabase.from("resumes").insert({
        user_id: userId, title: autoTitle, content: resume as never, is_primary: true,
      }).select("id").single();
      if (error) throw error;
      setResumeContent(resume);
      setCareer(prev => mapResumeToCareer(resume, prev));
      reindexTalentPool("resume_upload");
      setReplaceOpen(false);
      setOptimizeChanges(null);
      // v3.41.0 — refresh only the resumes list (title/id for the new row),
      // not the full load(), which would re-fetch career from the DB before
      // the merge above is ever persisted and silently revert it.
      await loadResumes();
      queueSave();
      toast({ title: "Resume saved", description: "AYN filled in what it could read. Check your skills and achievements below." });
      // Free, silent — so a score is already sitting there next time this
      // person opens the tab, no extra click needed for a fresh upload.
      if (inserted?.id) {
        resumeHubApi.diagnose(resume, inserted.id)
          .then(d => setPrimaryResume(p => p ? { ...p, ats_score: d.ats_score, ats_issues: d.issues } : p))
          .catch(() => { /* best effort — the manual "Check my resume" button still works */ });
      }
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const checkResume = async () => {
    if (!resumeContent || !primaryResume) return;
    setCheckingResume(true);
    try {
      const d = await resumeHubApi.diagnose(resumeContent, primaryResume.id);
      setPrimaryResume(p => p ? { ...p, ats_score: d.ats_score, ats_issues: d.issues } : p);
    } catch (e) {
      toast({ title: "Couldn't check your resume", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCheckingResume(false);
    }
  };

  // ── Gap probe (free): patches one specific flagged weak point with a
  // real answer the person just gave, then re-scores the exact resume
  // that's currently on file. Never touches career/Profile fields — this
  // fixes the resume file itself, the same thing the score is about. ──
  const applyGapFix = async (result: GapProbeResult, target: ProbeTarget) => {
    if (!resumeContent || !primaryResume) return;
    const patched: ResumeContent = JSON.parse(JSON.stringify(resumeContent));
    if (target.kind === "weak_bullet" && result.kind === "bullet" && result.revised_bullet) {
      const bullets = patched.work?.[target.workIndex]?.bullets;
      if (!bullets) return;
      bullets[target.bulletIndex] = result.revised_bullet;
    } else if (target.kind === "generic_summary" && result.kind === "summary" && result.revised_summary) {
      patched.basics = { ...(patched.basics ?? {}), summary: result.revised_summary };
    } else if (target.kind === "gap" && result.kind === "new_work_entry" && result.new_work_entry) {
      const e = result.new_work_entry;
      patched.work = [
        ...(patched.work ?? []),
        { company: e.company || "", title: e.title || "", start: e.start, end: e.end, bullets: e.bullets ?? [] },
      ];
    } else {
      return;
    }
    setProbeApplying(true);
    try {
      const { error } = await supabase.from("resumes").update({ content: patched as never }).eq("id", primaryResume.id);
      if (error) throw error;
      setResumeContent(patched);
      const d = await resumeHubApi.diagnose(patched, primaryResume.id);
      setPrimaryResume(p => p ? { ...p, ats_score: d.ats_score, ats_issues: d.issues } : p);
      toast({ title: "Added", description: "Your resume was updated and rescored." });
    } catch (e) {
      toast({ title: "Couldn't save that", description: (e as Error).message, variant: "destructive" });
    } finally {
      setProbeApplying(false);
    }
  };

  // ── Optimize (15 credits): rewrite, then automatically replace the resume
  // in AYN with the improved version — same delete-then-insert as an upload,
  // no old copy kept around. ──
  const optimizeResume = async () => {
    if (!resumeContent || !primaryResume) return;
    setOptimizing(true);
    setOptimizeChanges(null);
    // v3.160.0 — a paid action that fails client side (network drop, gateway
    // timeout) can leave the server-side charge already applied with the
    // client never seeing the success response. Reusing the same key across
    // a retry lets the server recognize that and skip charging twice.
    if (!optimizeIdemKey.current) optimizeIdemKey.current = crypto.randomUUID();
    try {
      const r = await resumeHubApi.rewrite(resumeContent, undefined, optimizeIdemKey.current);
      optimizeIdemKey.current = null; // succeeded — next click is a genuinely new charge
      await supabase.from("resumes").delete().eq("user_id", userId);
      const title = r.resume.basics?.name ? `${r.resume.basics.name} Resume (Optimized)` : "Optimized Resume";
      const { error } = await supabase.from("resumes").insert({
        user_id: userId, title, content: r.resume as never, is_primary: true,
        ats_score: r.ats_score, ats_issues: r.issues ?? null,
      });
      if (error) throw error;
      setResumeContent(r.resume);
      setCareer(prev => mapResumeToCareer(r.resume, prev));
      setOptimizeChanges(r.suggestions);
      reindexTalentPool("resume_optimize");
      await loadResumes();
      onCreditsChanged?.();
      toast({
        title: "Resume optimized",
        description: `Your new resume replaced the old one. ${r.credits.balance} credits left.`,
      });
    } catch (e) {
      toast({ title: "Optimize failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setOptimizing(false);
    }
  };

  // ── Build from scratch: the guided interview's answers land here, merged
  // into the same career fields the form below edits, so review is just the
  // normal Skills/Work history/Education sections, pre-filled instead of
  // blank. Nothing is "from your resume" here since there is no resume yet. ──
  const handleIntakeComplete = (extracted: GuidedIntakeExtraction) => {
    setCareer(prev => ({
      ...prev,
      experiences: extracted.experiences?.length
        ? extracted.experiences.map(e => ({
            company: e.company || "", title: e.title || "", location: e.location,
            start: e.start, end: e.end, current: e.current ?? !e.end,
            bullets: (e.bullets || []).slice(0, 5),
          }))
        : prev.experiences,
      education: extracted.education?.length
        ? extracted.education.map(ed => ({ school: ed.school || "", degree: ed.degree, field: ed.field, start: ed.start, end: ed.end }))
        : prev.education,
      skills: extracted.skills?.length
        ? extracted.skills.filter(Boolean).map(name => ({ name, level: null, years: null, last_used: null }))
        : prev.skills,
      certifications: extracted.certifications?.length
        ? extracted.certifications.filter(Boolean).map(name => ({ name }))
        : prev.certifications,
      derived: {
        ...prev.derived,
        current_title: extracted.derived?.current_title || prev.derived?.current_title,
        current_company: extracted.derived?.current_company || prev.derived?.current_company,
        total_yoe: extracted.derived?.total_yoe ?? prev.derived?.total_yoe,
        top_skills: extracted.skills?.length ? extracted.skills.slice(0, 8) : prev.derived?.top_skills,
      },
    }));
    queueSave();
  };

  // ── Generate my resume (15 credits): same paid tier and same document
  // pipeline as Optimize, just built from the profile instead of a rewrite
  // of an upload. Same delete-then-insert as upload/optimize. ──────────────
  const generateResume = async () => {
    setGenerating(true);
    if (!generateIdemKey.current) generateIdemKey.current = crypto.randomUUID();
    try {
      const r = await resumeHubApi.generateResume(generateIdemKey.current);
      generateIdemKey.current = null; // succeeded — next click is a genuinely new charge
      await supabase.from("resumes").delete().eq("user_id", userId);
      const title = r.resume.basics?.name ? `${r.resume.basics.name} Resume` : "Your Resume";
      const { error } = await supabase.from("resumes").insert({
        user_id: userId, title, content: r.resume as never, is_primary: true,
        ats_score: r.ats_score, ats_issues: r.issues ?? null,
      });
      if (error) throw error;
      setResumeContent(r.resume);
      setCareer(prev => mapResumeToCareer(r.resume, prev));
      setOptimizeChanges(r.suggestions);
      reindexTalentPool("resume_generate");
      await loadResumes();
      onCreditsChanged?.();
      toast({
        title: "Resume built",
        description: `Your new resume is ready to download. ${r.credits.balance} credits left.`,
      });
    } catch (e) {
      toast({ title: "Couldn't build your resume", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // v3.143.0 — asked directly to drop PDF for anything AYN itself writes,
  // since it's the harder format for an ATS or an AI reader to parse
  // reliably. Word only, from here on.
  const downloadResume = async (content: ResumeContent, name: string) => {
    try {
      const base = fileBase(name || "Resume");
      downloadBlob(await buildResumeDocxBlob(content), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const setDerived = (k: keyof Derived, v: unknown) => setCareer(p => ({ ...p, derived: { ...p.derived, [k]: v } }));
  const setWA = (k: keyof WorkAuth, v: unknown) => setCareer(p => ({ ...p, work_auth: { ...p.work_auth, [k]: v } }));
  const setPref = (k: keyof Prefs, v: unknown) => setCareer(p => ({ ...p, preferences: { ...p.preferences, [k]: v } }));
  const setScreening = (k: string, v: string) => setCareer(p => ({ ...p, screening_answers: { ...p.screening_answers, [k]: v } }));

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
    queueSave();
  };

  const updateSkill = (i: number, next: Skill) => { updateAt(setCareer, "skills", i, next); queueSave(); };
  const updateExp = (i: number, next: Exp) => { updateAt(setCareer, "experiences", i, next); queueSave(); };
  const updateEdu = (i: number, next: Edu) => { updateAt(setCareer, "education", i, next); queueSave(); };
  const updateCert = (i: number, next: Cert) => { updateAt(setCareer, "certifications", i, next); queueSave(); };

  const skillsWithLevel = career.skills.filter(s => !!s.level).length;
  const rolesWithAchievements = career.experiences.filter(e => (e.bullets ?? []).filter(Boolean).length > 0).length;

  const gapInput = {
    firstName: field("first_name").value,
    email: field("email").value,
    currentTitle: career.derived.current_title,
    city: field("city").value,
    desiredTitles: career.preferences.desired_titles,
    countries,
    citizenship: career.work_auth.citizenship,
    skillsCount: career.skills.length,
    experiencesCount: career.experiences.length,
    skillsWithLevel,
    rolesWithAchievements,
    availability: career.preferences.availability,
    employmentTypes: career.preferences.employment_types,
    knownForCount: (career.derived.known_for ?? []).length,
  };
  const readiness = computeReadiness(gapInput);

  const needsLevelPrompt =
    !levelPromptDone && career.skills.length > 0 && skillsWithLevel === 0;

  const nonCitizenCountries = countries.filter(
    c => !career.work_auth.citizenship || c.toLowerCase() !== career.work_auth.citizenship.toLowerCase()
  );

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading profile…</div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Matching readiness, and the autosave indicator ───────────────── */}
      <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3" style={{ background: "var(--rh-raised)", border: "1px solid var(--rh-hair)" }}>
        <div className="flex items-start gap-2 min-w-0">
          {readiness.ready
            ? <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--rh-trust)" }} />
            : <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--rh-accent-2)" }} />}
          <p className="text-xs leading-relaxed">{readiness.line}</p>
        </div>
        <span className="text-[11px] shrink-0 flex items-center gap-1.5" style={{ color: "var(--rh-faint)" }}>
          {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>}
          {saveState === "saved" && <><Check className="w-3 h-3" /> Saved</>}
        </span>
      </div>

      {/* ── Let employers find me — moved here from Get discovered so the
          on/off decision sits right next to the profile it controls. Solid
          color means on, grey means off, on purpose: this is a visibility
          switch, not a settings checkbox, and it should read at a glance.
          v3.172.0 — recolored from a raw Tailwind emerald to the same
          trust teal every other "verified/on/positive" signal in the app
          now uses (Browse Jobs' own "sourced directly" line, work-mode
          chips), so this reads as one consistent color language instead
          of two different greens depending on which page you're on. ──── */}
      <Card
        className="p-4 sm:p-6 flex items-center justify-between gap-4 flex-wrap rounded-xl"
        style={poolOptedIn
          ? { border: "1.5px solid var(--rh-trust)", background: "var(--rh-trust-tint)" }
          : { border: "1px solid var(--rh-hair)", background: "var(--rh-raised)" }}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Users className="w-4 h-4 mt-0.5 shrink-0" style={{ color: poolOptedIn ? "var(--rh-trust)" : "var(--rh-faint)" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Let employers find me</span>
              <span
                className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={poolOptedIn ? { background: "var(--rh-trust)", color: "#fff" } : { background: "var(--rh-hair)", color: "var(--rh-faint)" }}
              >
                {poolOptedIn ? "On" : "Off"}
              </span>
            </div>
            {poolRestricted ? (
              <p className="text-xs mt-1 max-w-md leading-relaxed" style={{ color: "#9a5348" }}>
                An administrator has removed your profile from the talent pool, so employers cannot
                find you right now.{poolStatus?.discovery_restriction_reason ? ` Reason given: ${poolStatus.discovery_restriction_reason}.` : ""}
              </p>
            ) : (
              <p className="text-xs mt-1 max-w-md leading-relaxed" style={{ color: "var(--rh-muted)" }}>
                {poolOptedIn
                  ? "You are discoverable. Employers can send you job proposals. Your contact details stay private until you accept one."
                  : "Turn this on to be recommended to employers hiring for roles like yours."}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {poolSaving && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--rh-faint)" }} />}
          <Switch
            checked={poolOptedIn}
            disabled={poolSaving || poolRestricted}
            onCheckedChange={(next) => (next ? setPoolConfirmOpen(true) : togglePool(false))}
            style={poolOptedIn ? { backgroundColor: "var(--rh-trust)" } : undefined}
          />
        </div>
      </Card>

      <AlertDialog open={poolConfirmOpen} onOpenChange={setPoolConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share your profile with employers</AlertDialogTitle>
            <AlertDialogDescription>
              Employers searching AYN will see your profile and can send you job proposals. Your
              email and phone are only shared if you accept one. You can turn this off anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => togglePool(true)}>Turn on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GuidedIntake open={intakeOpen} onOpenChange={setIntakeOpen} onComplete={handleIntakeComplete} />
      {probeState && (
        <GapProbeDialog
          open={!!probeState}
          onOpenChange={(o) => { if (!o) setProbeState(null); }}
          issue={probeState.issue}
          question={probeState.question}
          onApplied={(result) => {
            void applyGapFix(result, probeState.target);
            setProbeState(null);
          }}
        />
      )}

      {/* ── 1. Your resume ───────────────────────────────────────────────── */}
      <Group id="resume" title="Your resume" line="Everything AYN writes starts from this.">
        {primaryResume ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <FileUp className="w-4 h-4 shrink-0" style={{ color: "var(--rh-accent-2)" }} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{primaryResume.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Added {new Date(primaryResume.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadResume(resumeContent ?? {}, primaryResume.title)}>
                <Download className="w-4 h-4 mr-1.5" /> Download (Word)
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

        {!replaceOpen && (
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {primaryResume ? "Want to build a fresh one from scratch instead?" : "Don't have a resume yet?"}
            </p>
            <Button variant="outline" size="sm" onClick={() => setIntakeOpen(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Build one with AYN
            </Button>
          </div>
        )}

        {career.experiences.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground max-w-sm">
              {primaryResume
                ? "AYN can write a fresh resume from your profile below. This replaces your current one."
                : "AYN has enough to write a real, ATS-formatted resume from your profile below."}
            </p>
            <Button
              size="sm"
              disabled={generating}
              onClick={() => {
                if (primaryResume && !confirm("Build a new resume from your profile? Your current resume becomes inactive.")) return;
                generateResume();
              }}
            >
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Building…</>
                : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate my resume · 15 credits</>}
            </Button>
          </div>
        )}

        {primaryResume && !replaceOpen && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            {primaryResume.ats_score == null ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  See how your resume reads: quantified bullets, strong verbs, no thin sections.
                </p>
                <Button variant="outline" size="sm" onClick={checkResume} disabled={checkingResume}>
                  {checkingResume
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Checking…</>
                    : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Check my resume · free</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {primaryResume.ats_score >= 70
                      ? <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: "var(--rh-trust)" }} />
                      : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--rh-gold)" }} />}
                    <p className="text-sm font-semibold">
                      {primaryResume.ats_score}/100 · {
                        primaryResume.ats_score >= 85 ? "Strong" : primaryResume.ats_score >= 70 ? "Good"
                          : primaryResume.ats_score >= 50 ? "Fair" : "Poor"
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={checkResume} disabled={checkingResume}>
                      {checkingResume ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      onClick={optimizeResume}
                      disabled={optimizing}
                      style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                      className="hover:opacity-90"
                    >
                      {optimizing
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Rewriting…</>
                        : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Optimize my resume · 15 credits</>}
                    </Button>
                  </div>
                </div>
                {(primaryResume.ats_issues?.length ?? 0) > 0 && (
                  <ul className="space-y-1.5 pl-1">
                    {(primaryResume.ats_issues ?? []).map((issue, i) => {
                      const probe = resumeContent ? classifyProbableIssue(issue, resumeContent) : null;
                      return (
                        <li key={i} className="text-xs flex items-start gap-1.5 flex-wrap" style={{ color: "var(--rh-muted)" }}>
                          <span className="shrink-0" style={{ color: "var(--rh-gold)" }}>•</span>
                          <span className="flex-1 min-w-[180px]">{issue}</span>
                          {probe && (
                            <button
                              type="button"
                              className="text-[11px] font-semibold underline underline-offset-2 shrink-0"
                              style={{ color: "var(--rh-accent-2)" }}
                              onClick={() => setProbeState({ issue, question: probe.question, target: probe.target })}
                              disabled={probeApplying}
                            >
                              Tell AYN more
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>
                  Optimizing rewrites your resume for clarity and impact and replaces the one above.
                  Nothing is invented, and you can download the result right after.
                </p>
              </div>
            )}
            {optimizeChanges && optimizeChanges.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--rh-hair)" }}>
                <p className="text-[11px] font-semibold mb-1.5">What changed</p>
                <ul className="space-y-1 pl-1">
                  {optimizeChanges.map((c, i) => (
                    <li key={i} className="text-xs flex gap-1.5" style={{ color: "var(--rh-muted)" }}>
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--rh-trust)" }} /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {uploading && (
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </span>
        )}

        {(!primaryResume || replaceOpen) && <ResumeUpload onParsed={handleResumeParsed} variant="full" />}
      </Group>

      {/* ── 2. About you ─────────────────────────────────────────────────── */}
      <Group id="about" title="About you" line="Used in your tailored resumes and cover letters.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SourcedField label="First name" f={field("first_name")} onChange={v => setPersonalField("first_name", v)} onBlur={queueSave} onRevert={v => { setPersonalField("first_name", v); queueSave(); }} />
          <SourcedField label="Last name" f={field("last_name")} onChange={v => setPersonalField("last_name", v)} onBlur={queueSave} onRevert={v => { setPersonalField("last_name", v); queueSave(); }} />
          <SourcedField label="Email" f={field("email")} onChange={v => setPersonalField("email", v)} onBlur={queueSave} onRevert={v => { setPersonalField("email", v); queueSave(); }} />
          <SourcedField label="Phone" f={field("phone")} onChange={v => setPersonalField("phone", v)} onBlur={queueSave} onRevert={v => { setPersonalField("phone", v); queueSave(); }} />
          <SourcedField label="Location" f={field("city")} onChange={v => setPersonalField("city", v)} onBlur={queueSave} placeholder="City, region" onRevert={v => { setPersonalField("city", v); queueSave(); }} />
          <SourcedField label="Current title" f={derivedField("current_title")} onChange={v => setDerived("current_title", v)} onBlur={queueSave} onRevert={v => { setDerived("current_title", v); queueSave(); }} />
          <SourcedField label="Current company" f={derivedField("current_company")} onChange={v => setDerived("current_company", v)} onBlur={queueSave} onRevert={v => { setDerived("current_company", v); queueSave(); }} />
          <SourcedField label="LinkedIn" f={field("linkedin")} onChange={v => setPersonalField("linkedin", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("linkedin", v); queueSave(); }} />
          <SourcedField label="GitHub" f={field("github")} onChange={v => setPersonalField("github", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("github", v); queueSave(); }} />
          <SourcedField label="Portfolio" f={field("portfolio")} onChange={v => setPersonalField("portfolio", v)} onBlur={queueSave} placeholder="https://" onRevert={v => { setPersonalField("portfolio", v); queueSave(); }} />
        </div>
      </Group>

      {/* ── 3. Your experience ───────────────────────────────────────────── */}
      <Group id="experience" title="Your experience" line="This is what AYN scores against a job and tailors from.">
        {/* Skills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Skills ({career.skills.length})</p>
            <span className="text-[11px]" style={{ color: "var(--rh-faint)" }}>
              {skillsWithLevel} of {career.skills.length} have a level
            </span>
          </div>

          {needsLevelPrompt && (
            <div className="rounded-md px-3 py-2 text-xs flex items-start justify-between gap-3" style={{ border: "1px solid var(--rh-accent)", background: "var(--rh-tint)" }}>
              <span className="leading-relaxed">
                Your skills came across as names only. Add a level to your top five, not all of them. That is
                what an employer search actually ranks on.
              </span>
              <button
                type="button"
                className="underline shrink-0"
                style={{ color: "var(--rh-accent-2)" }}
                onClick={() => { sessionStorage.setItem("ayn_skill_level_prompt", "done"); setLevelPromptDone(true); }}
              >
                Dismiss
              </button>
            </div>
          )}

          {career.skills.length === 0 && <p className="text-xs" style={{ color: "var(--rh-muted)" }}>No skills yet. Upload a resume and AYN fills these in.</p>}

          <div className="flex flex-wrap gap-1.5">
            {career.skills.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOpenSkill(openSkill === i ? null : i)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
                style={openSkill === i ? { borderColor: "var(--rh-accent)", background: "var(--rh-tint)" } : { borderColor: "var(--rh-hair)" }}
              >
                <span className="font-medium">{s.name || "Untitled skill"}</span>
                {s.level && <span className="text-muted-foreground">{LEVELS.find(l => l.value === s.level)?.label}</span>}
                {s.last_used && <span className="text-muted-foreground">· {LAST_USED.find(l => l.value === s.last_used)?.label}</span>}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setCareer(p => ({ ...p, skills: [...p.skills, { name: "", level: null, years: null, last_used: null }] })); setOpenSkill(career.skills.length); }}
            >
              <Plus className="w-3 h-3" /> Add skill
            </button>
          </div>

          {openSkill !== null && career.skills[openSkill] && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Skill</Label>
                  <Input
                    value={career.skills[openSkill].name}
                    onChange={e => updateSkill(openSkill, { ...career.skills[openSkill], name: e.target.value })}
                    onBlur={queueSave}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Years (optional)</Label>
                  <Input
                    type="number"
                    value={career.skills[openSkill].years ?? ""}
                    onChange={e => updateSkill(openSkill, { ...career.skills[openSkill], years: e.target.value === "" ? null : Number(e.target.value) })}
                    onBlur={queueSave}
                  />
                </div>
              </div>
              <OptionRow
                label="Level"
                options={LEVELS}
                value={career.skills[openSkill].level ?? null}
                onChange={v => updateSkill(openSkill, { ...career.skills[openSkill], level: v as SkillLevel | null })}
              />
              <OptionRow
                label="Last used"
                options={LAST_USED}
                value={career.skills[openSkill].last_used ?? null}
                onChange={v => updateSkill(openSkill, { ...career.skills[openSkill], last_used: v as LastUsed | null })}
              />
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "skills", openSkill); setOpenSkill(null); queueSave(); }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOpenSkill(null)}>Done</Button>
              </div>
            </div>
          )}

          <BulkAdd
            placeholder="Paste several skills separated by commas"
            onAdd={names => {
              setCareer(p => ({ ...p, skills: [...p.skills, ...names.map(n => ({ name: n, level: null, years: null, last_used: null }))] }));
              queueSave();
            }}
          />
        </div>

        {/* Work history — content visible by default */}
        <div className="space-y-2 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Work history ({career.experiences.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, experiences: [...p.experiences, { company: "", title: "", bullets: [""] }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add role
            </Button>
          </div>
          {career.experiences.length === 0 && <p className="text-xs text-muted-foreground">No roles yet.</p>}

          {career.experiences.map((e, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PlainField label="Title" value={e.title} onChange={v => updateExp(i, { ...e, title: v })} onBlur={queueSave} />
                <PlainField label="Company" value={e.company} onChange={v => updateExp(i, { ...e, company: v })} onBlur={queueSave} />
                <PlainField label="Start" value={e.start || ""} onChange={v => updateExp(i, { ...e, start: v })} onBlur={queueSave} placeholder="2022-01" />
                <PlainField
                  label="End"
                  value={e.current ? "Present" : (e.end || "")}
                  onChange={v => updateExp(i, { ...e, end: v })}
                  onBlur={queueSave}
                  placeholder="2024-06"
                  disabled={e.current}
                />
                <PlainField label="Location" value={e.location || ""} onChange={v => updateExp(i, { ...e, location: v })} onBlur={queueSave} placeholder="City, or Remote" />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Industry or domain</Label>
                  <Input
                    list="ayn-industries"
                    value={e.industry || ""}
                    onChange={ev => updateExp(i, { ...e, industry: ev.target.value })}
                    onBlur={queueSave}
                    placeholder="Fintech, healthcare, enterprise SaaS"
                  />
                </div>
                <PlainField
                  label="Team size managed (optional)"
                  type="number"
                  value={e.team_size == null ? "" : String(e.team_size)}
                  onChange={v => updateExp(i, { ...e, team_size: v === "" ? null : Number(v) })}
                  onBlur={queueSave}
                />
                <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm self-end">
                  <span>Current role</span>
                  {/* v3.71.0 fix: End previously kept whatever date was
                      already typed even after this was switched on, so the
                      toggle could silently have no effect. Turning it on now
                      clears End (shown disabled with "Present" above);
                      turning it off hands End back for a real date. */}
                  <Switch checked={!!e.current} onCheckedChange={v => updateExp(i, { ...e, current: v, end: v ? "" : e.end })} />
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Achievements</Label>
                  {e.bullets_from_resume && <Badge variant="outline" className="text-[10px] font-normal">From your resume</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  These are the lines tailoring rewrites for each job. Empty here means tailoring has nothing to work with.
                </p>
                {(e.bullets ?? []).map((b, bi) => (
                  <div key={bi} className="flex gap-2">
                    <Textarea
                      rows={2}
                      value={b}
                      placeholder="Cut checkout latency by 40 percent for 2 million monthly users"
                      onChange={ev => {
                        const next = [...(e.bullets ?? [])];
                        next[bi] = ev.target.value;
                        updateExp(i, { ...e, bullets: next });
                      }}
                      onBlur={queueSave}
                    />
                    <Button variant="ghost" size="icon" onClick={() => {
                      updateExp(i, { ...e, bullets: (e.bullets ?? []).filter((_, j) => j !== bi) });
                    }}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
                {(e.bullets ?? []).length < 5 && (
                  <Button variant="ghost" size="sm" onClick={() => updateExp(i, { ...e, bullets: [...(e.bullets ?? []), ""] })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add achievement
                  </Button>
                )}
                {(e.bullets ?? []).filter(Boolean).length > 0 && (e.bullets ?? []).filter(Boolean).length < 2 && (
                  <p className="text-[11px] text-muted-foreground">Two to five achievements give tailoring enough to choose from.</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "experiences", i); queueSave(); }}>Remove role</Button>
              </div>
            </div>
          ))}
          <datalist id="ayn-industries">
            {INDUSTRIES.map(x => <option key={x} value={x} />)}
          </datalist>
        </div>

        {/* Education */}
        <div className="space-y-2 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Education ({career.education.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, education: [...p.education, { school: "" }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add school
            </Button>
          </div>
          {career.education.length === 0 && <p className="text-xs text-muted-foreground">No education entries yet.</p>}
          {career.education.map((e, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border rounded-lg p-3">
              <PlainField label="School" value={e.school} onChange={v => updateEdu(i, { ...e, school: v })} onBlur={queueSave} />
              <PlainField label="Degree" value={e.degree || ""} onChange={v => updateEdu(i, { ...e, degree: v })} onBlur={queueSave} placeholder="BSc" />
              <PlainField label="Field of study" value={e.field || ""} onChange={v => updateEdu(i, { ...e, field: v })} onBlur={queueSave} placeholder="Computer science" />
              <PlainField label="End year" value={e.end || ""} onChange={v => updateEdu(i, { ...e, end: v })} onBlur={queueSave} />
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "education", i); queueSave(); }}>Remove</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Certificates */}
        <div className="space-y-2 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Certificates ({career.certifications.length})</p>
            <Button variant="ghost" size="sm" onClick={() => setCareer(p => ({ ...p, certifications: [...p.certifications, { name: "" }] }))}>
              <Plus className="w-4 h-4 mr-1" /> Add certificate
            </Button>
          </div>
          {career.certifications.length === 0 && <p className="text-xs text-muted-foreground">No certificates yet.</p>}
          {career.certifications.map((c, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 border rounded-lg p-3">
              <PlainField label="Certificate" value={c.name} onChange={v => updateCert(i, { ...c, name: v })} onBlur={queueSave} placeholder="AWS Certified Solutions Architect" />
              <PlainField label="Issuer" value={c.issuer || ""} onChange={v => updateCert(i, { ...c, issuer: v })} onBlur={queueSave} placeholder="Amazon Web Services" />
              <PlainField label="Year" value={c.year || ""} onChange={v => updateCert(i, { ...c, year: v })} onBlur={queueSave} />
              <div className="sm:col-span-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => { removeAt(setCareer, "certifications", i); queueSave(); }}>Remove</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Derived signals employers and scoring both use */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="space-y-1">
            <PlainField
              label="Total years of experience"
              type="number"
              value={career.derived.total_yoe == null ? "" : String(career.derived.total_yoe)}
              onChange={v => setDerived("total_yoe", v === "" ? undefined : Number(v))}
              onBlur={queueSave}
            />
            <p className="text-[11px] text-muted-foreground">Calculated from your earliest role. Overwrite it if that is wrong.</p>
          </div>
          {/* v3.71.0 fix: was free text with a comma-separated placeholder
              ("entry, mid, senior, staff") that read like a list of things to
              type in, not one example. Datalist keeps free entry (so an
              existing value is never lost) but suggests the same vocabulary
              the matcher itself scores seniority against. */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Seniority</Label>
            <Input
              list="ayn-seniority"
              value={career.derived.seniority || ""}
              onChange={ev => setDerived("seniority", ev.target.value)}
              onBlur={queueSave}
              placeholder="e.g. Senior"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Primary function</Label>
            <Input
              list="ayn-functions"
              value={career.derived.primary_function || ""}
              onChange={ev => setDerived("primary_function", ev.target.value)}
              onBlur={queueSave}
              placeholder="e.g. Engineering"
            />
          </div>
          <datalist id="ayn-seniority">
            {SENIORITY_LEVELS.map(x => <option key={x} value={x} />)}
          </datalist>
          <datalist id="ayn-functions">
            {PRIMARY_FUNCTIONS.map(x => <option key={x} value={x} />)}
          </datalist>
        </div>

        {/* What you are known for */}
        <div className="space-y-1.5 pt-4">
          <Label className="text-xs text-muted-foreground">What you are known for (optional)</Label>
          <p className="text-[11px] text-muted-foreground">
            The two or three things you would want a hiring manager to know first. AYN uses these in cover
            letters and in the summary employers see.
          </p>
          {[0, 1, 2].map(idx => (
            <Input
              key={idx}
              value={(career.derived.known_for ?? [])[idx] ?? ""}
              placeholder={idx === 0 ? "Shipped payments infrastructure at scale" : "Add another"}
              onChange={ev => {
                const next = [...(career.derived.known_for ?? ["", "", ""])];
                while (next.length < 3) next.push("");
                next[idx] = ev.target.value;
                setDerived("known_for", next);
              }}
              onBlur={() => { setDerived("known_for", (career.derived.known_for ?? []).filter(Boolean)); queueSave(); }}
            />
          ))}
        </div>
      </Group>

      {/* ── 4. What you are looking for ──────────────────────────────────── */}
      <Group id="looking" title="What you are looking for" line="Employers searching for candidates match on this first.">
        <ChipList
          label="Desired titles"
          values={career.preferences.desired_titles || []}
          onChange={v => { setPref("desired_titles", v); queueSave(); }}
          placeholder="Add a title"
        />
        <ChipList
          label="Desired locations"
          hint="Where you want to work, not the same as your legal work eligibility below."
          values={career.preferences.desired_locations || []}
          onChange={v => { setPref("desired_locations", v); queueSave(); }}
          placeholder="Add a city or region"
        />
        <MultiSelect
          label="Employment type"
          options={EMPLOYMENT_TYPES}
          values={career.preferences.employment_types || []}
          onChange={v => { setPref("employment_types", v); queueSave(); }}
        />
        <SingleSelect
          label="Availability"
          options={AVAILABILITY}
          value={career.preferences.availability || ""}
          onChange={v => { setPref("availability", v); queueSave(); }}
        />
        <MultiSelect
          label="Company stage"
          options={COMPANY_STAGES}
          values={career.preferences.company_stages || []}
          onChange={v => { setPref("company_stages", v); queueSave(); }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlainField
            label="Minimum salary"
            type="number"
            value={career.preferences.salary_min_usd == null ? "" : String(career.preferences.salary_min_usd)}
            onChange={v => setPref("salary_min_usd", v === "" ? undefined : Number(v))}
            onBlur={queueSave}
            placeholder="80000"
          />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Input
              list="ayn-currencies"
              value={career.preferences.salary_currency || ""}
              onChange={ev => setPref("salary_currency", ev.target.value)}
              onBlur={queueSave}
              placeholder="e.g. CAD"
            />
            <datalist id="ayn-currencies">
              {CURRENCIES.map(x => <option key={x} value={x} />)}
            </datalist>
          </div>
          <Toggle label="Open to remote" value={!!career.preferences.open_to_remote} onChange={v => { setPref("open_to_remote", v); queueSave(); }} />
          <Toggle label="Open to relocation" value={!!career.preferences.open_to_relocation} onChange={v => { setPref("open_to_relocation", v); queueSave(); }} />
        </div>
      </Group>

      {/* ── 5. Work eligibility ──────────────────────────────────────────── */}
      <Group id="eligibility" title="Work eligibility" line="Employers filter on this before anything else.">
        <div>
          <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>Countries you can work in</Label>
          <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>Legal eligibility, separate from the cities you'd actually want to work in above.</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {WORK_COUNTRIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCountry(c)}
                className="px-3 py-1.5 text-xs rounded-md border transition-colors font-medium"
                style={countries.includes(c)
                  ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
                  : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlainField
            label="Citizenship"
            value={career.work_auth.citizenship || ""}
            onChange={v => setWA("citizenship", v)}
            onBlur={queueSave}
            placeholder="e.g. Canada"
          />
          {nonCitizenCountries.length > 0 && (
            <>
              <PlainField
                label="Work permit expires (optional)"
                type="date"
                value={career.work_auth.work_permit_expires || ""}
                onChange={v => setWA("work_permit_expires", v)}
                onBlur={queueSave}
              />
              {/* v3.71.0 — this was already asked in every scoring/tailoring
                  prompt (WORK_AUTH: ..., visa=n/a) with no field anywhere to
                  answer it, so the AI never once actually knew it. */}
              <PlainField
                label="Visa type (optional)"
                value={career.work_auth.visa_type || ""}
                onChange={v => setWA("visa_type", v)}
                onBlur={queueSave}
                placeholder="e.g. H-1B, TN, Work permit"
              />
            </>
          )}
          <Toggle label="I need sponsorship now" value={!!career.work_auth.needs_sponsorship_now} onChange={v => { setWA("needs_sponsorship_now", v); queueSave(); }} />
          <Toggle label="I will need sponsorship later" value={!!career.work_auth.needs_sponsorship_future} onChange={v => { setWA("needs_sponsorship_future", v); queueSave(); }} />
        </div>
        {/* v3.265.0 — the auto-apply answer bank. Real applications ask
            questions no other field on this page answers (non-compete,
            referral defaults). Kept in this same group, not a separate
            section, since it's the same "what employers ask before
            anything else" territory as sponsorship above. Autofill copies
            these verbatim, never guesses one. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SCREENING_QUESTIONS.map(q => (
            <PlainField
              key={q.key}
              label={q.label}
              value={career.screening_answers[q.key] || ""}
              onChange={v => setScreening(q.key, v)}
              onBlur={queueSave}
              placeholder={q.placeholder}
            />
          ))}
        </div>
      </Group>

      <p className="text-xs text-muted-foreground">
        This profile is what employers search when "Let employers find me" above is on.
      </p>
    </div>
  );
}

// ── Presentation helpers ─────────────────────────────────────────────────────
// v3.172.0 — extended the same Charcoal & Ember system onto Profile that
// Browse Jobs, Saved jobs, Home, Proposals and Assessments already picked
// up in this same pass. Fixed at the shared primitives every field group
// on this page is built from (Group/PlainField/OptionRow/Toggle/ChipList
// etc.), not at each of the ~30 individual call sites, so the whole
// 1,600-line page picks up the system from one real fix instead of
// dozens of copy-pasted ones. Found the same un-tokened-button bug this
// app has already fixed in several other places (employer-surface,
// contact-surface, settings-surface, resume-hub.css's own button.bg-
// foreground retint): OptionRow/OptionRowMulti's own active-chip state
// used shadcn's bare `bg-primary`, which resolves to this app's default
// near-black, not AYN's own ember — every selected chip on this entire
// page (seniority, work eligibility, employment type, dozens of others)
// was rendering black instead of on-brand.
// v3.235.0 -- the heading here was plain rh-display at 15px, no accent,
// no more visual weight than the muted description line right under it.
// The marketing pages' own section headings all carry a short ember
// accent mark ahead of the eyebrow text (.lp-eyebrow::before); this is
// the same signature scaled down for a dense, repeated form section
// rather than a full page heading.
function Group({ id, title, line, children }: { id: string; title: string; line: string; children: React.ReactNode }) {
  const key = `ayn_profile_group_${id}`;
  const [open, setOpen] = useState(() => sessionStorage.getItem(key) !== "closed");
  const toggle = () => setOpen(o => { sessionStorage.setItem(key, o ? "closed" : "open"); return !o; });
  return (
    <Card className="p-4 sm:p-6 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
      <button type="button" onClick={toggle} className="w-full flex items-start justify-between gap-3 text-left">
        <div>
          <h3 className="rh-display flex items-center gap-2" style={{ fontSize: 16.5 }}>
            <span aria-hidden="true" style={{ width: 14, height: 2, borderRadius: 2, background: "var(--rh-accent)", flexShrink: 0 }} />
            {title}
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--rh-muted)" }}>{line}</p>
        </div>
        <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} style={{ color: "var(--rh-faint)" }} />
      </button>
      {open && <div className="space-y-4 mt-4">{children}</div>}
    </Card>
  );
}

function PlainField({
  label, value, onChange, onBlur, placeholder, type, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} type={type} disabled={disabled} />
    </div>
  );
}

function SourcedField({
  label, f, onChange, onBlur, onRevert, placeholder, type,
}: {
  label: string;
  f: { value: string; source: "resume" | "edited" | "none"; original?: string };
  onChange: (v: string) => void;
  onBlur?: () => void;
  onRevert?: (original: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <Input value={f.value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} type={type} />
      {f.source === "resume" && <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>From your resume</p>}
      {f.source === "edited" && (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--rh-faint)" }}>
          Edited by you
          <button
            type="button"
            className="inline-flex items-center gap-1 underline"
            style={{ color: "var(--rh-accent-2)" }}
            onClick={() => onRevert?.(f.original || "")}
          >
            <Undo2 className="w-3 h-3" /> Use resume value
          </button>
        </p>
      )}
    </div>
  );
}

function OptionRow({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(active ? null : o.value)}
              className="px-2.5 py-1 text-xs rounded-md border transition-colors font-medium"
              style={active
                ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
                : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelect({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <OptionRowMulti label={label} options={options} values={values} onChange={onChange} />
  );
}

function OptionRowMulti({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(on ? values.filter(v => v !== o) : [...values, o])}
              className="px-2.5 py-1 text-xs rounded-md border transition-colors font-medium"
              style={on
                ? { background: "var(--rh-gradient)", color: "#fff", borderColor: "transparent" }
                : { borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SingleSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <OptionRow
      label={label}
      options={options.map(o => ({ value: o, label: o }))}
      value={value || null}
      onChange={v => onChange(v || "")}
    />
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--rh-hair)" }}>
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

function BulkAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const names = draft.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    onAdd(names);
    setDraft("");
  };
  return (
    <div className="flex gap-2">
      <Input
        placeholder={placeholder}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
      <Button type="button" variant="outline" size="sm" onClick={commit}>Add</Button>
    </div>
  );
}

function ChipList({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "var(--rh-muted)" }}>{label}</Label>
      {hint && <p className="text-[11px]" style={{ color: "var(--rh-faint)" }}>{hint}</p>}
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}>
            {v}
            <button onClick={() => onChange(values.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
          </span>
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
