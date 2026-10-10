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
import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AynLoader } from '@/components/shared/AynLoader';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { poolStatusQueryKey } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

import { useToast } from "@/hooks/use-toast";
import {
  Loader2, FileUp, Download, RefreshCw, Check, Sparkles, AlertTriangle, ShieldCheck, Users,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResumeUpload } from "@/components/resume-hub/ResumeUpload";
const GuidedIntake = lazy(() => import('./GuidedIntake'));
const GapProbeDialog = lazy(() => import('./GapProbeDialog'));
import { classifyProbableIssue, type ProbeTarget } from "@/lib/gapProbe";
import { resumeHubApi, type ResumeContent, type TalentPoolStatus, type GuidedIntakeExtraction, type GapProbeResult } from "@/lib/resumeHub";
import { ResumeDocumentPreview } from '@/components/shared/DocumentPreview';
import { reindexTalentPool, setPoolOptInCache } from "@/lib/talentPoolSync";
import { downloadBlob, fileBase, resumeToText } from "@/lib/resumeText";
const ResumeDiffViewer = lazy(() => import('./ResumeDiffViewer'));
import { computeReadiness } from "@/lib/profileGaps";
import { createPendingResumeOperation } from "@/lib/pendingResumeOperation";
import type { Json } from "@/integrations/supabase/types";

/** v3.5.1 — bump whenever the consent wording changes. */
const DISCOVERY_CONSENT_VERSION = "v3.5.1-full-profile";

import {
  type Exp, type WorkAuth, type Prefs, type Derived, type Career, EMPTY, type PersonalKey, type Personal, EMPTY_PERSONAL, normalizeSkills, mapResumeToCareer,
} from "./profileTypes";
import { Group, updateAt, removeAt } from "./ProfileFormPrimitives";
import { SkillsSection, WorkHistorySection, CertificationsSection, EducationSection, DerivedSection } from "./ProfileExperienceSections";
import { LookingForFields, EligibilityFields } from "./ProfilePreferenceSections";
import { AboutYouFields } from "./ProfileAboutFields";

export default function ProfileTab({ userId, onCreditsChanged }: { userId: string; onCreditsChanged?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [career, setCareer] = useState<Career>(EMPTY);
  const [viewParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const profileView = ['facts', 'preferences'].includes(viewParams.get('profileView') || '') ? viewParams.get('profileView')! : 'resume';
  // Sept 2026 -- reported directly: "when i click to buttons or pages it
  // takes me to a diffrent page." Traced live: clicking a Profile sub-tab
  // (My resume / Profile facts / Preferences) silently dropped the page's
  // own #profile hash -- react-router's setSearchParams(), unlike
  // useNavigate() called with an explicit location object, does not carry
  // the current hash forward on its own. Since this whole app's tab
  // system (LandingPage.tsx's activeTab) reads location.hash to decide
  // which page is even showing, losing that hash didn't just lose the
  // sub-tab, it kicked the person all the way back to Job search, the
  // app's own hash-less default -- exactly the reported symptom. Fixed by
  // navigating with an explicit hash carried over, the same pattern
  // LandingPage.tsx's own tab switching already uses correctly.
  const setProfileView = (view: string) => {
    const next = new URLSearchParams(viewParams);
    next.set('profileView', view);
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { preventScrollReset: true });
  };
  const [compareOpen, setCompareOpen] = useState(false);
  const [personal, setPersonal] = useState<Personal>(EMPTY_PERSONAL);
  const [personalTouched, setPersonalTouched] = useState<Partial<Record<PersonalKey, boolean>>>({});
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
  const [resumeHistory, setResumeHistory] = useState<ResumeRow[]>([]);
  const [restoringResume, setRestoringResume] = useState<string | null>(null);
  const restoreRequestIds = useRef<Record<string, string>>({});
  const [accountEmail, setAccountEmail] = useState("");

  // ── Discoverability toggle ("Let employers find me"), moved here from the
  // Get discovered tab so it sits right where the profile it controls is
  // being edited, instead of being one tab away and easy to miss. ─────────
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolConfirmOpen, setPoolConfirmOpen] = useState(false);

  // Measured live against production: talent_pool_get is an edge-function
  // call (~100ms steady state, ~550ms cold), 3-4x slower than a direct
  // table read of comparable size, and this was firing fresh on every
  // single mount -- ProposalsTab.tsx makes the exact same call
  // independently for its own empty-state copy, so two components were
  // each paying this cost separately. One shared, cached query
  // (poolStatusQueryKey, src/lib/queryKeys.ts) now covers both.
  const poolQueryKey = poolStatusQueryKey();
  const { data: poolStatus = null } = useQuery({
    queryKey: poolQueryKey,
    queryFn: async () => {
      const r = await resumeHubApi.talentPoolGet();
      setPoolOptInCache(!!r.opted_in);
      return r;
    },
  });
  const poolOptedIn = !!poolStatus?.opted_in;
  const poolRestricted = !!poolStatus?.discovery_restricted;

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
      // A real, confirmed write -- update the shared cache directly
      // (both ProfileTab's own toggle and ProposalsTab's empty-state copy
      // read this same query) instead of a full re-fetch, matching the
      // exact "keep the cache honest after a save, don't just discard it
      // and hope for a lucky remount" fix already applied to persist().
      queryClient.setQueryData(poolQueryKey, (prev: TalentPoolStatus | undefined) =>
        prev ? { ...prev, opted_in: next } : prev
      );
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setPoolSaving(false); }
  };

  // ── Resumes list only: used on initial load AND after an upload, where a
  // full load() would re-fetch career from the DB before the freshly parsed
  // resume's skills/experience/education (merged into local state, not yet
  // persisted) ever reached the server, silently reverting them. ───────────
  type ResumeRow = { id: string; title: string; content: unknown; created_at: string; is_primary: boolean; ats_score: number | null; ats_issues: string[] | null };
  // Pure read, no state -- the one place the actual SELECT lives, so the
  // profile query below (which needs the DATA, not a side effect -- see
  // its own comment) and loadResumes() (which needs the side effect, for
  // its several direct callers after an upload/restore) share the exact
  // same query text instead of one silently drifting from the other.
  const fetchResumeRows = useCallback(async () => {
    const { data: resumeRows, error } = await supabase.from("resumes").select("id, title, content, created_at, is_primary, ats_score, ats_issues")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (resumeRows ?? []) as ResumeRow[];
  }, [userId]);

  const applyResumeRows = (rows: ResumeRow[]) => {
    const active = rows.find(r => r.is_primary) ?? rows[0] ?? null;
    setResumeHistory(rows.filter(row => row.id !== active?.id));
    if (active) {
      setPrimaryResume({ id: active.id, title: active.title, created_at: active.created_at, ats_score: active.ats_score, ats_issues: active.ats_issues });
      setResumeContent((active.content as ResumeContent) ?? null);
    } else {
      setPrimaryResume(null);
      setResumeContent(null);
    }
  };

  const loadResumes = useCallback(async () => {
    const rows = await fetchResumeRows();
    applyResumeRows(rows);
    // Same real bug as persist() below, same fix: a genuine fresh server
    // read here (an upload, a restore, ...) has to also land in the
    // profile query's own cache, or a remount within the cache's
    // freshness window would replay the pre-upload/pre-restore snapshot
    // straight back over this correct, freshly-fetched one. Query key
    // built inline (not the profileQueryKey below) since this function is
    // declared before it in the file and referencing it here would be a
    // real "used before initialization" crash, not just a lint nit.
    queryClient.setQueryData(["profile-load", userId], (prev: { canon: unknown; prof: unknown; auth: unknown } | undefined) =>
      prev ? { ...prev, resumeRows: rows } : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchResumeRows, queryClient, userId]);

  // ── Load everything the single profile reads from ───────────────────────
  // Reported directly, same fix as every other account tab: leaving
  // Profile and coming back re-fetched canonical/personal/auth from
  // scratch every time, with a full loading flash. Read through the
  // shared query cache instead -- a remount within the cache's freshness
  // window seeds career/personal instantly from the last known values.
  // Safe to do here specifically because this fetch was only ever
  // triggered once per mount (confirmed: nothing in this file calls it a
  // second time -- loadResumes() is its own separate, deliberately
  // isolated refresh, unaffected by this), so there's no background
  // revalidation that could ever clobber an in-progress unsaved edit; the
  // autosave path (scheduleSave/persist, below) writes directly and never
  // goes through this query at all.
  const profileQueryKey = useMemo(() => ["profile-load", userId] as const, [userId]);
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: async () => {
      const [{ data: canon }, { data: prof }, resumeRows, { data: auth }] = await Promise.all([
        supabase.from("user_profile_canonical")
          .select("skills, experiences, education, certifications, work_auth, preferences, derived")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("user_profile_data")
          .select("legal_first_name, legal_last_name, email, phone, address, links")
          .eq("user_id", userId).maybeSingle(),
        // A pure read here, not loadResumes() itself -- on a warm-cache
        // remount this queryFn never runs at all, and loadResumes() sets
        // state directly, so calling it here would leave the resume
        // section stuck empty forever after a cache hit. resumeRows
        // travels in the returned data instead, applied by the effect
        // below every time -- cold fetch or warm cache alike, unlike
        // this function itself.
        fetchResumeRows(),
        supabase.auth.getUser(),
      ]);
      return { canon, prof, resumeRows, auth };
    },
  });
  const loading = profileQuery.isLoading;

  useEffect(() => {
    if (!profileQuery.data) return;
    const { canon, prof, resumeRows, auth } = profileQuery.data;
    applyResumeRows(resumeRows);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  useEffect(() => {
    if (profileQuery.isError) {
      const message = profileQuery.error instanceof Error ? profileQuery.error.message : "Error";
      toast({ title: "Couldn't load profile", description: message, variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.isError]);

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
  const optimizeOperation = useMemo(() => createPendingResumeOperation<Awaited<ReturnType<typeof resumeHubApi.rewrite>>>(`ayn-paid-base:${userId}:rewrite`), [userId]);
  const generateOperation = useMemo(() => createPendingResumeOperation<Awaited<ReturnType<typeof resumeHubApi.generateResume>>>(`ayn-paid-base:${userId}:resume_generate`), [userId]);

  const saveGeneratedResume = async (
    result: Awaited<ReturnType<typeof resumeHubApi.generateResume>>, id: string, optimized = false,
  ) => {
    // Never let a response started for one account be saved into a newly
    // signed-in account. The RPC independently derives ownership from JWT.
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || data.user?.id !== userId) throw new Error("Your session changed. Sign back in before saving this resume.");
    const name = result.resume.basics?.name;
    const title = name ? `${name} Resume${optimized ? " (Optimized)" : ""}` : optimized ? "Optimized Resume" : "Your Resume";
    const { error } = await supabase.rpc("save_primary_resume", {
      p_id: id, p_title: title, p_content: result.resume as unknown as Json,
      p_ats_score: result.ats_score, p_ats_issues: result.issues ?? [],
    });
    if (error) throw new Error("Could not confirm the saved version. Retry this action to recover the same result. Completed paid base resumes are saved on the server before credits are charged.");
  };

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
      // Real, live bug found testing this: the profile query above is
      // deliberately never re-fetched in the background (see its own
      // comment -- that's what keeps a background revalidation from ever
      // clobbering an in-progress edit). But that cut both ways: a
      // successful save here left the CACHE still holding the pre-edit
      // snapshot, so leaving this tab and coming back within the cache's
      // freshness window replayed that stale snapshot over the top of the
      // fresh local state, visibly reverting an edit that had already
      // saved correctly server side. Confirmed live: the database had the
      // right value, the screen didn't. Fixed by writing the same values
      // into the cache right after they're confirmed saved, so a later
      // remount sees the update instead of undoing it.
      queryClient.setQueryData(profileQueryKey, (prev: typeof profileQuery.data) =>
        prev
          ? {
              ...prev,
              canon: {
                skills: c.skills ?? [], experiences: c.experiences ?? [], education: c.education ?? [],
                certifications: c.certifications ?? [], work_auth: c.work_auth ?? {},
                preferences: c.preferences ?? {}, derived: c.derived ?? {},
              },
              prof: {
                legal_first_name: val("first_name") || null, legal_last_name: val("last_name") || null,
                email: val("email") || null, phone: val("phone") || null,
                address: { city: val("city") || "" },
                links: { linkedin: val("linkedin") || "", github: val("github") || "", portfolio: val("portfolio") || "" },
              },
            }
          : prev
      );
    } catch (e) {
      setSaveState("idle");
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    }
  // profileQuery.data is deliberately NOT a dependency here, even though
  // it appears on the line above: that's a `typeof profileQuery.data`
  // type annotation, erased at compile time, never a runtime read (the
  // callback only ever touches its own `prev` argument). Keeping it in
  // this array meant `persist` got a fresh identity every time this same
  // function's own queryClient.setQueryData call above landed -- i.e.,
  // after every successful autosave -- which cascaded through queueSave
  // into updateExp and every other useCallback built on it, busting every
  // ExperienceCard's (and sibling row's) memoization once per save cycle
  // for no real reason. Found live: a single isolated keystroke in one
  // role's own field still showed a stray extra render on an untouched
  // sibling role, traced to this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, userId, queryClient, profileQueryKey]);

  /** Called on blur and on every discrete control change. */
  const queueSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void persist(); }, 900);
  }, [persist]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Upload uses the same atomic primary switch and retains prior rows.
  const handleResumeParsed = async ({ resume }: { resume: ResumeContent; plainText: string }) => {
    setUploading(true);
    try {
      const autoTitle = resume.basics?.name ? `${resume.basics.name} Resume` : "Uploaded Resume";
      const { data: insertedId, error } = await supabase.rpc("save_primary_resume", {
        p_id: crypto.randomUUID(), p_title: autoTitle, p_content: resume as unknown as Json,
        p_ats_score: null, p_ats_issues: [],
      });
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
      if (insertedId) {
        resumeHubApi.diagnose(resume, insertedId ?? undefined)
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

  // Optimize creates a new base version with an atomic primary switch.
  const optimizeResume = async () => {
    if (!resumeContent || !primaryResume) return;
    setOptimizing(true);
    setOptimizeChanges(null);
    // v3.160.0 — a paid action that fails client side (network drop, gateway
    // timeout) can leave the server-side charge already applied with the
    // client never seeing the success response. Reusing the same key across
    // a retry lets the server recognize that and skip charging twice.
    try {
      const r = await optimizeOperation.run(
        id => resumeHubApi.rewrite(resumeContent, undefined, id),
        async (result, id) => {
          if (result.credits.spent !== 0) await saveGeneratedResume(result, id, true);
        },
      );
      if (r.credits.spent === 0) {
        // The unchanged-result response must not replace the original or
        // cascade-delete its job-specific versions merely to show advice.
        setOptimizeChanges(r.suggestions);
        onCreditsChanged?.();
        toast({ title: "No rewrite needed", description: "Your resume is unchanged. No credits were charged." });
        return;
      }
      setResumeContent(r.resume);
      setCareer(prev => mapResumeToCareer(r.resume, prev));
      setOptimizeChanges(r.suggestions);
      reindexTalentPool("resume_optimize");
      await loadResumes();
      onCreditsChanged?.();
      toast({
        title: "Resume optimized",
        description: `Your new resume is active. The previous version is retained. ${r.credits.balance} credits left.`,
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
  // pipeline as Optimize, built from the profile with a safe primary switch.
  const generateResume = async () => {
    setGenerating(true);
    try {
      const r = await generateOperation.run(
        id => resumeHubApi.generateResume(id),
        (result, id) => saveGeneratedResume(result, id),
      );
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
  //
  // Sept 2026 — buildResumeDocxBlob (and the jsPDF/docx libraries behind
  // it) is now a dynamic import, not a static one, so opening Profile
  // never pays that ~230KB cost until someone actually clicks Download.
  const downloadResume = async (content: ResumeContent, name: string) => {
    try {
      const { buildResumeDocxBlob } = await import("@/lib/resumeDocs");
      const base = fileBase(name || "Resume");
      downloadBlob(await buildResumeDocxBlob(content), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const restoreResume = async (row: ResumeRow) => {
    if (restoringResume || !confirm('Make a copy of this earlier resume your active version? Your current version will be retained. This restores the document only; your profile facts stay unchanged. Review both before optimizing or tailoring.')) return;
    setRestoringResume(row.id);
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id !== userId) throw new Error('Your session changed. Sign in again.');
      const key = `${userId}:${row.id}`;
      restoreRequestIds.current[key] ??= crypto.randomUUID();
      const { error } = await supabase.rpc('save_primary_resume', {
        p_id: restoreRequestIds.current[key], p_title: row.title,
        p_content: row.content as Json, p_ats_score: row.ats_score, p_ats_issues: row.ats_issues ?? [],
      });
      if (error) throw error;
      await loadResumes();
      delete restoreRequestIds.current[key];
      setOptimizeChanges(null);
      reindexTalentPool('resume_restore');
      toast({ title: 'Earlier resume restored', description: 'A new active copy was saved. Your profile facts are unchanged; review them before optimizing or tailoring.' });
    } catch (e) {
      toast({ title: 'Could not restore resume', description: (e as Error).message, variant: 'destructive' });
    } finally { setRestoringResume(null); }
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
    queueSave();
  };

  // Stable identities (setCareer is stable; queueSave only changes after a
  // save) so memoized ExperienceCards aren't re-rendered by unrelated typing.
  const updateExp = useCallback((i: number, next: Exp) => { updateAt(setCareer, "experiences", i, next); queueSave(); }, [queueSave]);
  const removeExp = useCallback((i: number) => { removeAt(setCareer, "experiences", i); queueSave(); }, [queueSave]);

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

  const nonCitizenCountries = countries.filter(
    c => !career.work_auth.citizenship || c.toLowerCase() !== career.work_auth.citizenship.toLowerCase()
  );

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><AynLoader size="sm" label="Loading profile" /></div>;
  }

  return (
    <div className="space-y-4 ayn-profile-workspace">
      <header className="ayn-workspace-heading">
        <div><h1>Resume & profile</h1><p>Your experience, ready for the next opportunity.</p></div>
      </header>
      <nav className="ayn-workspace-tabs" aria-label="Profile views">
        {([['resume', 'My resume'], ['facts', 'Profile facts'], ['preferences', 'Preferences & discovery']] as const).map(([view, label]) => <button type="button" key={view} aria-current={profileView === view ? 'page' : undefined} onClick={() => setProfileView(view)}>{label}</button>)}
      </nav>
      <p className="ayn-workspace-description">{profileView === 'resume' ? 'Review your document, improve the writing, or return to an earlier version.' : profileView === 'facts' ? 'Keep these facts accurate. AYN uses them to match roles and prepare your documents. Changes save when you leave a field.' : 'Choose the work you want and whether employers can discover your profile.'}</p>
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
      <div hidden={profileView !== 'preferences'}>
      <Card
        className="p-4 sm:p-6 flex items-center justify-between gap-4 flex-wrap rounded-xl shadow-none hover:shadow-none"
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
            aria-label="Let employers find me"
            checked={poolOptedIn}
            disabled={poolSaving || poolRestricted}
            onCheckedChange={(next) => (next ? setPoolConfirmOpen(true) : togglePool(false))}
            style={poolOptedIn ? { backgroundColor: "var(--rh-trust)" } : undefined}
          />
        </div>
      </Card>
      </div>

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

      {intakeOpen && <Suspense fallback={<p role="status">Opening resume interview…</p>}>
        <GuidedIntake open={intakeOpen} onOpenChange={setIntakeOpen} onComplete={handleIntakeComplete} />
      </Suspense>}
      {probeState && (
        <Suspense fallback={<p role="status">Opening follow-up…</p>}><GapProbeDialog
          open={!!probeState}
          onOpenChange={(o) => { if (!o) setProbeState(null); }}
          issue={probeState.issue}
          question={probeState.question}
          onApplied={(result) => {
            void applyGapFix(result, probeState.target);
            setProbeState(null);
          }}
        /></Suspense>
      )}

      {/* ── 1. Your resume ───────────────────────────────────────────────── */}
      <Group hidden={profileView !== 'resume'} id="resume" title="Your resume" line="Your active document. Earlier versions stay available below.">
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

        {primaryResume?.title === 'Resume from your free check' && <p role="status" className="mt-4 text-sm border-l-2 border-primary pl-3">
          Your checked resume is saved. Download it to review the extraction, then check your profile fields below. Saving this document did not replace your existing profile facts; AYN uses both when writing. When they agree, use Optimize here or open Saved jobs and select the job you just saved to tailor it.
        </p>}

        {resumeHistory.length > 0 && <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">Previous versions ({resumeHistory.length})</summary>
          <p className="text-xs text-muted-foreground mt-2">Download an earlier document or restore a copy. Restoring does not use credits or change your profile facts.</p>
          <ul className="mt-3 space-y-3">
            {resumeHistory.map(row => <li key={row.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0"><p className="text-sm break-words">{row.title}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadResume(row.content as ResumeContent, row.title)}>Download</Button>
                <Button variant="outline" size="sm" disabled={!!restoringResume || optimizing || generating || uploading} onClick={() => restoreResume(row)}>{restoringResume === row.id ? 'Restoring…' : 'Restore'}</Button>
              </div>
            </li>)}
          </ul>
        </details>}

        {resumeContent && <details open className="mt-4 border-t pt-4 ayn-document-preview">
          <summary className="cursor-pointer text-sm font-medium">Read your current resume</summary>
          <p className="text-xs text-muted-foreground mt-2">Reading preview. Download the Word document to check pagination and final layout.</p>
          <div className="mt-3 max-h-[32rem] overflow-y-auto" tabIndex={0} role="region" aria-label="Current resume document"><ResumeDocumentPreview content={resumeContent} /></div>
        </details>}
        {resumeContent && resumeHistory.length > 0 && <details className="mt-4 border-t pt-4" onToggle={event => setCompareOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">Compare with your previous version</summary>
          <p className="text-xs text-muted-foreground mt-2 mb-3">Compared with {resumeHistory[0].title}, saved {new Date(resumeHistory[0].created_at).toLocaleString()}. This review does not change your saved document.</p>
          {compareOpen && <Suspense fallback={<p role="status">Loading comparison…</p>}><ResumeDiffViewer key={`${primaryResume?.id}:${resumeHistory[0].id}`} original={resumeToText(resumeHistory[0].content as ResumeContent)} improved={resumeToText(resumeContent)} /></Suspense>}
        </details>}

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
      <Group hidden={profileView !== 'facts'} id="about" title="About you" line="Used in your tailored resumes and cover letters.">
        <AboutYouFields field={field} derivedField={derivedField} setPersonalField={setPersonalField} setDerived={setDerived} queueSave={queueSave} />
      </Group>

      {/* ── 3. Your experience ───────────────────────────────────────────── */}
      <Group hidden={profileView !== 'facts'} id="experience" title="Your experience" line="This is what AYN scores against a job and tailors from.">
        <SkillsSection skills={career.skills} setCareer={setCareer} queueSave={queueSave} />

        <WorkHistorySection experiences={career.experiences} setCareer={setCareer} updateExp={updateExp} removeExp={removeExp} queueSave={queueSave} />

        <CertificationsSection certifications={career.certifications} setCareer={setCareer} queueSave={queueSave} />

        <EducationSection education={career.education} setCareer={setCareer} queueSave={queueSave} />

        <DerivedSection derived={career.derived} setDerived={setDerived} queueSave={queueSave} />
      </Group>

      {/* ── 4. What you are looking for ──────────────────────────────────── */}
      <Group hidden={profileView !== 'preferences'} id="looking" title="What you are looking for" line="Employers searching for candidates match on this first.">
        <LookingForFields preferences={career.preferences} setPref={setPref} queueSave={queueSave} />
      </Group>

      {/* ── 5. Work eligibility ──────────────────────────────────────────── */}
      <Group hidden={profileView !== 'preferences'} id="eligibility" title="Work eligibility" line="Employers filter on this before anything else.">
        <EligibilityFields workAuth={career.work_auth} countries={countries} toggleCountry={toggleCountry} nonCitizenCountries={nonCitizenCountries} setWA={setWA} queueSave={queueSave} />
      </Group>

      <p className="text-xs text-muted-foreground">
        This profile is what employers search when "Let employers find me" above is on.
      </p>
    </div>
  );
}
