/**
 * JobsTab.tsx — v3.4.0 "tailored outputs live on the job"
 *
 * A tailored resume is not a resume the user maintains, it is an output of a
 * job. So the generated documents are stored against the job and downloaded
 * from here. The source resume is the single active one in Profile.
 *
 * v3.136.0 — asked directly to remove "Should I apply?" (job_fit_advice):
 * a real, paid AI call sitting behind a button that wasn't earning its
 * keep. Removed the button, its state, and the frontend client wrapper
 * (resumeHub.ts) — nothing in this app calls that action anymore, so it
 * can no longer fire from here. The backend action itself was left alone,
 * not deleted, matching this codebase's own standing practice for an
 * orphaned-but-harmless action (see delete-account/resume-match in
 * CLAUDE.md) rather than assuming it should be torn out unasked.
 * Same pass: the detail view's primary CTA and score badges picked up
 * real AYN branding (--rh-accent ember, plus the same tiered emerald/
 * amber/neutral scheme BrowseJobs.tsx already uses for its own quick-match
 * pill) — this whole panel was rendering on shadcn's plain black default,
 * the one part of Resume Hub that hadn't been re-skinned.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { Loader2, Sparkles, ExternalLink, Plus, Trash2, FileText, Download, X, ArrowLeft, Search } from "lucide-react";
import { resumeToText, buildResumeDocxBlob, buildTextDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";
import ResumeDiffViewer from "./ResumeDiffViewer";
import AutoApplyPanel from "./AutoApplyPanel";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { useFeature } from "@/hooks/useFeatureFlags";
import { isFeatureDisabled } from "@/lib/featureError";
import { companyAvatar } from "./BrowseJobs";

interface Props { userId: string; onOpenJob: (id: string) => void; onOpenProfile: () => void; onCreditsChanged?: () => void; onBackToBrowse: () => void }

// v3.145.0 — reported directly: refreshing the page always dropped the
// person on Home with nothing open, even if they'd been looking at a
// specific saved job. Kept for the whole session (not one-shot like
// ayn_focus_job below), so a refresh can restore it without a fresh
// handoff from Browse jobs having just happened.
const LAST_OPEN_KEY = "ayn_jobs_last_open";

interface JobRow { id: string; company: string; title: string; location: string | null; source_url: string | null; jd_text: string | null; created_at: string; application_status: string; application_status_changed_at: string; auto_apply_charged_at: string | null }

// v3.182.0 — "status silence is the #1 killer": research consistently found
// candidates expect a reply within days and disengage after 1-2 weeks of
// nothing, and once a job flips to Applied here AYN goes completely quiet --
// there's no ATS to watch, so it never says anything again. This can't
// promise a response (AYN has no visibility into what happens after the
// click-through), only be honest that it's been a while and suggest a real,
// low-effort next step. Ten days -- meaningfully past the fast end of what
// research calls a normal reply window, not so long it reads as nagging.
const SILENCE_NUDGE_DAYS = 10;
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// v3.173.0's own favicon-by-hostname guess (icons.duckduckgo.com/ip3/...)
// is gone as of v3.263.0. Traced with a real curl on the same guess Browse
// Jobs used: DuckDuckGo answers a domain it has no real favicon for with a
// genuine HTTP 404 status but still serves a real, valid image body -- its
// own generic placeholder, rendering indistinguishably from a real logo,
// since an <img> tag never sees the status code on a load that otherwise
// succeeds and DuckDuckGo sends no CORS headers a fetch()-based check
// could use to tell the two apart. This tab never had a real, verified
// logo source to fall back to in the first place (only source_url, no
// company_logo_url), so it now always shows the deterministic
// colored-initial avatar instead of guessing.

// v3.172.0 — asked directly to bring the same research-driven pass to the
// rest of Resume Hub. The single most-loved feature across the whole
// "application tracker" competitor category (Huntr, Teal, Simplify) is
// real pipeline tracking, not a flat saved-jobs list -- checked live and
// confirmed AYN had no status column at all, so once a resume was
// tailored for a job there was no way to record what happened next. This
// is deliberately self-tracked, not read from any employer's own ATS
// (AYN has no way to see that) -- but it still closes the same real gap
// the earlier LinkedIn/Indeed research found (unclear application status
// as a top complaint), just the honest way AYN can: one place the
// candidate keeps their own record instead of a spreadsheet.
// "rejected" deliberately displays as "Not this time" -- the underlying
// value stays a plain, technical "rejected" for filtering, but Gen Z
// candidates specifically report real anxiety around rejection language,
// and there's no reason this app's own tone should be harsher than it
// needs to be about something already hard to go through.
const STATUS_ORDER = ["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"] as const;
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  saved: { label: "Saved", color: "var(--rh-muted)", bg: "var(--rh-raised)" },
  applied: { label: "Applied", color: "var(--rh-trust)", bg: "var(--rh-trust-tint)" },
  interviewing: { label: "Interviewing", color: "var(--rh-gold)", bg: "var(--rh-gold-tint)" },
  offer: { label: "Offer", color: "#fff", bg: "var(--rh-accent)" },
  rejected: { label: "Not this time", color: "#9a5348", bg: "#f5e6e2" },
  withdrawn: { label: "Withdrawn", color: "var(--rh-faint)", bg: "var(--rh-raised)" },
};
interface TailoredRow { id: string; created_at: string; content: ResumeContent; match_pct: number | null; still_missing: string[] }
interface CoverRow { id: string; created_at: string; body: string }

// v3.136.0 — same tiering BrowseJobs.tsx uses for its own quick-match pill
// (score >=50 strong / >=20 some overlap / below that neutral), reused here
// for the real match/100 score so the two surfaces read as one system
// instead of two different color languages for the same idea.
function scoreBadgeStyle(score: number): CSSProperties {
  if (score >= 50) return { background: "#d1fae5", color: "#047857" };
  if (score >= 20) return { background: "#fef3c7", color: "#b45309" };
  return { background: "var(--rh-raised)", color: "var(--rh-muted)" };
}

export default function JobsTab({ userId, onOpenProfile, onCreditsChanged, onBackToBrowse }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
  // v3.145.0 — "list" means back returns to the Saved jobs list, the
  // existing behavior; "browse" means this job was opened by a handoff
  // from Browse jobs' "Score and tailor", so back should return there
  // instead — a job opened from Browse was never reached through this
  // list to begin with.
  const [backTarget, setBackTarget] = useState<"list" | "browse">("list");
  const [primaryResume, setPrimaryResume] = useState<{ id: string; content: ResumeContent; ats_score: number | null } | null>(null);
  const [matchData, setMatchData] = useState<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string } | null>(null);
  const [tailored, setTailored] = useState<TailoredRow | null>(null);
  // v3.99.0 — required-but-not-evidenced skills the job asked for, shown as
  // an opt-in add, never applied automatically. Each carries its own
  // editable value so a person can add their own real wording instead of
  // the job posting's exact phrase if that fits better.
  const [gapSuggestions, setGapSuggestions] = useState<{ text: string; value: string }[]>([]);
  const tailoring = useFeature("tailoring");
  const [cover, setCover] = useState<CoverRow | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  // v3.146.0 — reported directly: clicking Score/Tailor/Write cover letter
  // just disabled the buttons with no visible change, reading as a stuck
  // page instead of AYN actually working on a real AI call that takes a
  // few seconds. Tracks which one is running so that specific button can
  // show a spinner and say so, instead of a shared, silent `busy` flag.
  const [activeAction, setActiveAction] = useState<null | "score" | "tailor" | "cover">(null);
  // v3.160.0 — a paid action (tailor/cover letter) that fails client side
  // (network drop, gateway timeout) can leave the server-side charge
  // already applied with the client never seeing the success response.
  // The button re-enables and a retry click would otherwise be a genuinely
  // new request, double-charging. Keyed by "action:jobId" so it survives a
  // retry for the same job but a different job (or a later, separate
  // attempt after real success) gets its own fresh key.
  const pendingIdemKeys = useRef<Record<string, string>>({});

  // v3.152.0 — asked directly for informed consent before a tailor run, not
  // just after it. The gap-suggestion cards below (title match, missing
  // skills) already require a separate click per item before anything is
  // added -- that part was already true. What was missing was telling the
  // person, before they spend the credit, that tailoring rewrites their
  // resume's wording for this one job and may afterward offer a title or
  // skill change they still have to approve individually. Numbers and
  // facts are never touched by any of this, tailor or otherwise -- that's
  // enforced server side (figuresVerified) and stated here so the person
  // knows it's not part of what they're being asked to decide on.
  const [tailorConfirmOpen, setTailorConfirmOpen] = useState(false);

  // v3.172.0 — a real filter/status view over the pipeline, not a full
  // drag-and-drop kanban board -- delivers the same "see where everything
  // stands at a glance" value the research found without the much bigger
  // UI investment a real board would need for a list this size.
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // v3.173.0 — reported directly: no way to search a growing saved-jobs
  // list at all, unlike Browse jobs' own search box. All-client-side is
  // the right call here (unlike Browse jobs' server-side, debounced search
  // over a 1,000+ row catalog) — a saved-jobs list is realistically dozens
  // of rows, already loaded in full.
  const [jobQuery, setJobQuery] = useState("");
  const [nudgeSnoozed, setNudgeSnoozed] = useState(false);
  // v3.271.0 — set only when Browse jobs' own "Auto-apply" button is what
  // brought us here; cleared the moment AutoApplyPanel actually consumes it,
  // so re-opening the same job later (or any other job) never re-triggers it.
  const [autoStartApplyJobId, setAutoStartApplyJobId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("jobs").select("id, company, title, location, source_url, jd_text, created_at, application_status, application_status_changed_at, auto_apply_charged_at").eq("user_id", userId).order("created_at", { ascending: false });
    const rows = (data as JobRow[]) ?? [];
    setJobs(rows);
    // v3.137.0 — Browse jobs adds a posting then hands off here, naming the
    // new job id. Nothing ever read this flag before, so a job added from
    // the board landed in the list unselected and the person had to find it.
    // v3.145.0 — ayn_focus_job_from rides alongside it now, so the back
    // button on a job opened this way knows to return to Browse jobs
    // instead of the Saved jobs list. When neither flag is set (a plain
    // mount, not a fresh handoff), fall back to whatever job was open the
    // last time this tab was looked at — a page refresh shouldn't lose it.
    const focus = sessionStorage.getItem("ayn_focus_job");
    if (focus) {
      sessionStorage.removeItem("ayn_focus_job");
      const from = sessionStorage.getItem("ayn_focus_job_from");
      sessionStorage.removeItem("ayn_focus_job_from");
      setBackTarget(from === "browse" ? "browse" : "list");
      // v3.271.0 — Browse jobs' own "Auto-apply" button rides the same
      // handoff, naming which job should skip straight to reading the real
      // application form instead of landing on a page where the person has
      // to find and click the button themselves a second time.
      const autoStart = sessionStorage.getItem("ayn_autostart_autoapply");
      sessionStorage.removeItem("ayn_autostart_autoapply");
      if (autoStart === focus) setAutoStartApplyJobId(focus);
      const hit = rows.find((r) => r.id === focus);
      if (hit) openJob(hit);
      return;
    }
    const lastOpen = sessionStorage.getItem(LAST_OPEN_KEY);
    if (lastOpen) {
      const hit = rows.find((r) => r.id === lastOpen);
      if (hit) openJob(hit);
    }
  };
  useEffect(() => {
    load();
    supabase.from("resumes").select("id, content, ats_score").eq("user_id", userId).eq("is_primary", true).maybeSingle()
      .then(({ data }) => data && setPrimaryResume({ id: data.id, content: data.content as ResumeContent, ats_score: data.ats_score }));
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  // v3.145.0 — keeps LAST_OPEN_KEY in sync with whatever's actually open,
  // so a refresh restores it and going back to the list correctly forgets
  // it (a refresh right after "Saved jobs" should show the list, not
  // silently re-open the job that was last viewed before that).
  useEffect(() => {
    if (selected) sessionStorage.setItem(LAST_OPEN_KEY, selected.id);
    else sessionStorage.removeItem(LAST_OPEN_KEY);
  }, [selected]);

  /** Documents generated for this job, newest first. */
  const loadDocs = async (jobId: string) => {
    const [{ data: v }, { data: c }] = await Promise.all([
      supabase.from("resume_versions").select("id, created_at, content, match_pct, still_missing")
        .eq("user_id", userId).eq("created_for_job_id", jobId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("cover_letters").select("id, created_at, body")
        .eq("user_id", userId).eq("job_id", jobId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setTailored((v as unknown as TailoredRow) ?? null);
    setCover((c as unknown as CoverRow) ?? null);
  };

  const openJob = async (j: JobRow) => {
    setSelected(j);
    setMatchData(null);
    setShowDiff(false);
    setTailored(null);
    setCover(null);
    setGapSuggestions([]);
    setNudgeSnoozed(isNudgeSnoozed(j.id));
    loadDocs(j.id);
  };

  const calcMatch = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setActiveAction("score");
    try {
      const m = await resumeHubApi.match(selected.jd_text);
      setMatchData(m);
      await supabase.from("job_matches").insert({
        user_id: userId, job_id: selected.id, resume_id: primaryResume.id,
        score: m.score, breakdown: m.breakdown,
      });
    } catch (e) {
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Match failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setActiveAction(null); }
  };

  const tailorResume = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setActiveAction("tailor");
    const idemMapKey = `tailor:${selected.id}`;
    if (!pendingIdemKeys.current[idemMapKey]) pendingIdemKeys.current[idemMapKey] = crypto.randomUUID();
    const idemKey = pendingIdemKeys.current[idemMapKey];
    try {
      const { resume, gapAnalysis } = await resumeHubApi.tailor(selected.jd_text, idemKey, selected.title);
      delete pendingIdemKeys.current[idemMapKey]; // succeeded — next click is a genuinely new charge
      // Regenerating replaces the stored copy for this job.
      await supabase.from("resume_versions").delete().eq("user_id", userId).eq("created_for_job_id", selected.id);
      const { error } = await supabase.from("resume_versions").insert({
        user_id: userId, resume_id: primaryResume.id, content: resume as never, created_for_job_id: selected.id,
        match_pct: gapAnalysis?.matchPct ?? null, still_missing: gapAnalysis?.missing ?? [],
      });
      if (error) throw error;
      await loadDocs(selected.id);
      setGapSuggestions((gapAnalysis?.missing ?? []).map(text => ({ text, value: text })));
      onCreditsChanged?.();
      toast({ title: "Tailored resume ready", description: "Download it below." });
    } catch (e) {
      // idemKey deliberately left in the ref — a retry click reuses it, so
      // the server recognizes it as the same request if the earlier one
      // actually went through server-side despite the client-side failure.
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Tailor failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setActiveAction(null); }
  };

  // v3.99.0 — patches the already-generated, already-paid-for tailored
  // resume in place. No new AI call, no new credit charge: the person is
  // just confirming something AYN is showing them, not asking it to
  // generate anything new.
  const patchTailoredContent = async (updater: (c: ResumeContent) => ResumeContent) => {
    if (!tailored) return;
    const nextContent = updater(tailored.content);
    const { error } = await supabase.from("resume_versions").update({ content: nextContent as never }).eq("id", tailored.id);
    if (error) { toast({ title: "Couldn't save that change", description: error.message, variant: "destructive" }); return; }
    setTailored({ ...tailored, content: nextContent });
  };

  const useJobTitle = () => {
    if (!selected) return;
    patchTailoredContent(c => ({ ...c, basics: { ...c.basics, title: selected.title } }));
  };

  const addSuggestedSkill = (idx: number) => {
    const item = gapSuggestions[idx];
    if (!item || !item.value.trim()) return;
    patchTailoredContent(c => ({ ...c, skills: [...(c.skills ?? []), item.value.trim()] }));
    setGapSuggestions(prev => prev.filter((_, i) => i !== idx));
  };

  const dismissSuggestion = (idx: number) => setGapSuggestions(prev => prev.filter((_, i) => i !== idx));

  const writeCover = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setActiveAction("cover");
    const idemMapKey = `cover:${selected.id}`;
    if (!pendingIdemKeys.current[idemMapKey]) pendingIdemKeys.current[idemMapKey] = crypto.randomUUID();
    const idemKey = pendingIdemKeys.current[idemMapKey];
    try {
      const { body } = await resumeHubApi.coverLetter(selected.jd_text, { company: selected.company, idempotencyKey: idemKey });
      delete pendingIdemKeys.current[idemMapKey]; // succeeded — next click is a genuinely new charge
      await supabase.from("cover_letters").delete().eq("user_id", userId).eq("job_id", selected.id);
      await supabase.from("cover_letters").insert({ user_id: userId, job_id: selected.id, resume_id: primaryResume.id, body });
      await loadDocs(selected.id);
      onCreditsChanged?.();
      // v3.183.0 — reported directly: this ran silently while its sibling
      // (Tailor resume) both toasted AND showed the new document. Matching
      // that confirmation now instead of only the new card quietly appearing.
      toast({ title: "Cover letter ready", description: "Download it below." });
    } catch (e) {
      // idemKey deliberately left in the ref — see tailorResume's comment.
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Cover letter failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setActiveAction(null); }
  };

  // v3.143.0 — asked directly to drop PDF for anything AYN itself writes
  // (a tailored resume, a cover letter, a generated/optimized resume):
  // PDF is widely reported as the harder format for an ATS or an AI reader
  // to parse reliably, and there's nothing lost by dropping it here since
  // AYN's own renderer is producing this file either way, not preserving
  // an original upload's formatting. Word only, from here on.
  const downloadDoc = async (content: ResumeContent, base: string) => {
    try {
      downloadBlob(await buildResumeDocxBlob(content), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    }
  };

  const downloadText = async (text: string, base: string) => {
    try {
      downloadBlob(await buildTextDocxBlob(text), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    }
  };


  const removeJob = async (id: string) => {
    if (!confirm("Remove this job?")) return;
    await supabase.from("jobs").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  // v3.172.0 — one click, no ceremony, matching the exact thing the
  // research flagged as what people actually want from a tracker ("capture
  // and move an application through a real pipeline without ceremony").
  // Updates both the open detail view and the list's own row so neither
  // ever shows a stale status after the other changes it.
  const updateStatus = async (id: string, status: string) => {
    const changedAt = new Date().toISOString();
    const { error } = await supabase.from("jobs").update({ application_status: status, application_status_changed_at: changedAt }).eq("id", id);
    if (error) { toast({ title: "Couldn't update status", description: error.message, variant: "destructive" }); return; }
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, application_status: status, application_status_changed_at: changedAt } : j)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, application_status: status, application_status_changed_at: changedAt } : prev));
    dismissNudgeSnooze(id, true); // a fresh status change means any prior silence nudge no longer applies
  };

  // v3.182.0 — a snooze, not a permanent dismiss: re-surfaces after another
  // week rather than being silenced forever the first time someone closes
  // it, since the whole point is a person genuinely might not check back in.
  // `clear` is used on any real status change (see updateStatus above) so a
  // stale snooze from a prior "Applied" spell can't suppress a nudge that's
  // now about a completely different silence.
  const dismissNudgeSnooze = (jobId: string, clear = false) => {
    const key = `ayn_nudge_snooze_${jobId}`;
    if (clear) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, String(Date.now()));
  };
  const isNudgeSnoozed = (jobId: string): boolean => {
    const raw = localStorage.getItem(`ayn_nudge_snooze_${jobId}`);
    if (!raw) return false;
    return daysSince(new Date(Number(raw)).toISOString()) < 7;
  };


  // v3.142.0 — reported directly against a screenshot: the detail view was
  // squeezed next to a 320px list, the description sat stacked all the way
  // at the bottom under two other cards, and "Add job manually" ate space
  // at the top of the list every time it was opened. Selecting a job now
  // hides the list entirely and uses the full width for a real two-column
  // split — description on the left, AYN's own actions and results on the
  // right — with a back control to return to the list. "Add job manually"
  // moved into a dialog instead of an inline card. "Open job with AYN"
  // (handoff to the extension) is gone; the exact same actions are already
  // right here.
  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => (backTarget === "browse" ? onBackToBrowse() : setSelected(null))}
          className="inline-flex items-center gap-1.5 text-sm transition"
          style={{ color: "var(--rh-muted)" }}
        >
          <ArrowLeft className="w-4 h-4" />{backTarget === "browse" ? "Browse jobs" : "Saved jobs"}
        </button>

        <Card className="p-5 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0 ${companyAvatar(selected.company || "?").className}`}
                style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
              >
                {companyAvatar(selected.company || "?").initial}
              </div>
              <div className="min-w-0">
                <h2 className="rh-display text-xl leading-snug">{selected.title}</h2>
                <p className="text-sm" style={{ color: "var(--rh-muted)" }}>{selected.company} {selected.location && `• ${selected.location}`}</p>
                {selected.source_url && (
                  <a
                    href={selected.source_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      // v3.173.0 — the one status transition AYN can actually
                      // observe: clicking through to the real posting is what
                      // "applying" looks like from here. Everything past this
                      // (interviewing, offer, rejected) happens in someone's
                      // inbox or on a call, nowhere AYN has visibility, so
                      // those stay a manual pill. Never overwrite a status
                      // already moved past "saved" — a re-click on an
                      // already-applied job shouldn't roll it backward.
                      if (selected.application_status === "saved") updateStatus(selected.id, "applied");
                    }}
                    className="inline-flex items-center text-xs mt-1"
                    style={{ color: "var(--rh-accent-2)" }}
                  >
                    View original <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {matchData && (
                <div
                  className="text-lg px-3 py-1 rounded-full font-semibold"
                  style={{ fontFamily: "JetBrains Mono, monospace", ...scoreBadgeStyle(matchData.score) }}
                >
                  {matchData.score}/100
                </div>
              )}
              <Button onClick={() => removeJob(selected.id)} variant="ghost" size="icon" aria-label="Remove job"><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* v3.172.0 — "where do things stand," one click, no ceremony —
              the exact thing the application-tracker research (Huntr,
              Teal, Simplify) found candidates loved most. Self-tracked
              since AYN has no employer ATS to read a real status from. */}
          <div className="flex items-center gap-1.5 flex-wrap mt-4 pt-4 border-t" style={{ borderColor: "var(--rh-hair)" }}>
            <span className="text-[11px] font-bold uppercase tracking-wide mr-1" style={{ color: "var(--rh-faint)" }}>Status</span>
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const active = selected.application_status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateStatus(selected.id, s)}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
                  style={active
                    ? { background: meta.bg, color: meta.color, boxShadow: s === "offer" ? "var(--rh-glow)" : undefined }
                    : { background: "var(--rh-raised)", color: "var(--rh-faint)" }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* v3.182.0 — "status silence is the #1 killer": research consistently
            names no-response-for-weeks as the single biggest source of job-
            search anxiety, and this is the honest, AYN-can-actually-say
            version of it. Not a promise of a response (AYN has no way to
            see one), just naming the specific job and company by name --
            "feel seen, not processed" -- and a real, low-effort next step
            instead of silence answered with more silence. Snoozable, not
            permanently dismissible, since the silence itself doesn't end
            just because someone closed the card once. */}
        {selected.application_status === "applied" && !nudgeSnoozed && daysSince(selected.application_status_changed_at) >= SILENCE_NUDGE_DAYS && (
          <Card className="p-4 rounded-xl flex items-start justify-between gap-3" style={{ background: "var(--rh-tint)", borderColor: "#e85d3a33" }}>
            <p className="text-sm leading-relaxed" style={{ color: "var(--rh-ink)" }}>
              It's been <span className="font-semibold">{daysSince(selected.application_status_changed_at)} days</span> since you applied to{" "}
              <span className="font-semibold">{selected.company}</span> for {selected.title} — still no word? Most replies land faster than
              this, so it's fair to look for another way in: a warm intro, a direct follow-up, or just refocusing your energy while you wait.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => { dismissNudgeSnooze(selected.id); setNudgeSnoozed(true); }}
            >
              Got it
            </Button>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Card className="p-5 rounded-xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] overflow-y-auto" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
            <h3 className="rh-display text-sm mb-2">Job description</h3>
            {selected.jd_text
              ? <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: "var(--rh-muted)" }}>{selected.jd_text}</pre>
              : <p className="text-sm" style={{ color: "var(--rh-muted)" }}>No description was saved for this job.</p>}
          </Card>

          <div className="space-y-4">
            <Card className="p-5 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
              <h3 className="rh-display text-sm mb-3">AYN</h3>
              <MaintenanceNotice feature="tailoring" className="mb-3" />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={calcMatch}
                  disabled={activeAction !== null || !primaryResume}
                  style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }}
                  className="hover:opacity-90"
                >
                  {activeAction === "score"
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scoring…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Score this job</>}
                </Button>
                <Button onClick={() => setTailorConfirmOpen(true)} disabled={activeAction !== null || !primaryResume || !tailoring.enabled} variant="outline">
                  {activeAction === "tailor"
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Tailoring…</>
                    : "Tailor resume"}
                </Button>
                <Button onClick={writeCover} disabled={activeAction !== null || !primaryResume || !tailoring.enabled} variant="outline">
                  {activeAction === "cover"
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Writing…</>
                    : "Write cover letter"}
                </Button>
              </div>
              {!primaryResume && (
                <p className="text-xs mt-3" style={{ color: "var(--rh-gold)" }}>Add your resume in Profile to enable AI actions.</p>
              )}
              {primaryResume && primaryResume.ats_score != null && primaryResume.ats_score < 70 && (
                <p className="text-xs mt-3" style={{ color: "var(--rh-gold)" }}>
                  Your resume scores {primaryResume.ats_score}/100 for ATS readiness. Tailoring still works,
                  but a weak base resume means a weaker one for every job.{" "}
                  <button type="button" className="underline" style={{ color: "var(--rh-ink)" }} onClick={onOpenProfile}>
                    Improve it in Profile
                  </button>
                </p>
              )}
            </Card>

            {tailoring.enabled && (
              <AutoApplyPanel
                userId={userId}
                jobId={selected.id}
                jobTitle={selected.title}
                company={selected.company}
                sourceUrl={selected.source_url}
                resumeContent={tailored?.content ?? primaryResume?.content ?? null}
                coverLetterBody={cover?.body ?? null}
                alreadyCharged={!!selected.auto_apply_charged_at}
                onMarkApplied={() => updateStatus(selected.id, "applied")}
                autoStart={autoStartApplyJobId === selected.id}
                onAutoStartConsumed={() => setAutoStartApplyJobId(null)}
              />
            )}

            {matchData && (
              <Card className="p-5 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
                <h3 className="rh-display text-sm mb-3">Match breakdown</h3>
                <p className="text-sm mb-3">{matchData.summary}</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {Object.entries(matchData.breakdown).map(([k, v]) => (
                    <div
                      key={k}
                      className="text-center p-3 rounded-lg border"
                      style={{ background: "var(--rh-tint)", borderColor: "#e85d3a33" }}
                    >
                      <div className="text-2xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--rh-accent-2)" }}>{v}</div>
                      <div className="text-xs capitalize" style={{ color: "var(--rh-muted)" }}>{k.replace("_", " ")}</div>
                    </div>
                  ))}
                </div>
                {matchData.missing_keywords.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--rh-faint)" }}>Missing keywords</p>
                    <div className="flex flex-wrap gap-1">
                      {/* v3.143.0 — a badge is meant to read as one short
                          chip; a long-but-legitimate requirement line
                          shouldn't blow that up into a wall of text, so it
                          truncates here with the full line on hover, on top
                          of the backend now being much stricter about what
                          counts as a requirement at all. */}
                      {matchData.missing_keywords.map((k, i) => (
                        <Badge key={i} variant="outline" title={k.length > 64 ? k : undefined} className="max-w-[280px] truncate">
                          {k.length > 64 ? `${k.slice(0, 64)}…` : k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {(tailored || cover) && (
              <Card className="p-5 rounded-xl space-y-4" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
                <div>
                  <h3 className="rh-display text-sm">Documents for this job</h3>
                  <p className="text-xs mt-0.5" style={{ color: "var(--rh-faint)" }}>
                    Written from your resume and this posting. Generating again replaces the copy stored here.
                  </p>
                </div>

                {tailored && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium">Tailored resume</p>
                        <p className="text-[11px] text-muted-foreground">
                          Generated {new Date(tailored.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => downloadDoc(tailored.content, fileBase(selected.company, selected.title, "Resume"))}>
                          <Download className="w-4 h-4 mr-1.5" />Word
                        </Button>
                        {primaryResume && (
                          <Button size="sm" variant="ghost" onClick={() => setShowDiff(v => !v)}>
                            {showDiff ? "Hide changes" : "See what changed"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {tailored.match_pct != null && (
                      <div className="flex items-start gap-2 pt-1">
                        <span
                          className="text-xs font-semibold rounded-full px-2 py-0.5 shrink-0"
                          style={{ fontFamily: "JetBrains Mono, monospace", ...scoreBadgeStyle(tailored.match_pct) }}
                        >
                          {tailored.match_pct}%
                        </span>
                        <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
                          {tailored.still_missing.length === 0
                            ? "Everything this job asks for that you've done is now on the page."
                            : `Still missing because you haven't done ${tailored.still_missing.length === 1 ? "it" : "them"} yet: ${tailored.still_missing.join(", ")}.`}
                        </p>
                      </div>
                    )}
                    {showDiff && primaryResume && (
                      <ResumeDiffViewer
                        original={resumeToText(primaryResume.content)}
                        improved={resumeToText(tailored.content)}
                      />
                    )}
                  </div>
                )}

                {/* v3.129.0 — a manually-added job defaults to the literal
                    placeholder title "Untitled role" until the person edits
                    it; without this guard, the mismatch below fires on that
                    placeholder and offers to overwrite the resume's real
                    title with the word "Untitled role". */}
                {tailored && selected.title && selected.title !== "Untitled role" && tailored.content.basics?.title &&
                  tailored.content.basics.title.trim().toLowerCase() !== selected.title.trim().toLowerCase() && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This role's title is <span className="font-medium text-foreground">"{selected.title}"</span>.
                      Your resume says <span className="font-medium text-foreground">"{tailored.content.basics.title}"</span>.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={useJobTitle}>Use this job's title</Button>
                      <span className="text-[11px] text-muted-foreground">Nothing changes unless you choose this.</span>
                    </div>
                  </div>
                )}

                {tailored && gapSuggestions.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2.5">
                    <p className="text-xs text-muted-foreground">
                      This role also asks for a few things not on your resume. Only add one if it's genuinely true.
                      Edit the text first if your own wording fits better.
                    </p>
                    {gapSuggestions.map((s, idx) => (
                      <div key={s.text} className="flex items-center gap-2">
                        <Input
                          value={s.value}
                          onChange={e => setGapSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                          className="h-8 text-sm"
                        />
                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => addSuggestedSkill(idx)}>
                          <Plus className="w-3.5 h-3.5 mr-1" />Add
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => dismissSuggestion(idx)} aria-label="Skip this suggestion">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {cover && (
                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium">Cover letter</p>
                        <p className="text-[11px] text-muted-foreground">
                          Generated {new Date(cover.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => downloadText(cover.body, fileBase(selected.company, selected.title, "Cover_Letter"))}>
                          <Download className="w-4 h-4 mr-1.5" />Word
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(cover.body); toast({ title: "Copied" }); }}>Copy</Button>
                      </div>
                    </div>
                    <pre className="text-sm whitespace-pre-wrap font-sans max-h-72 overflow-auto">{cover.body}</pre>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* v3.152.0 — informed consent before the credit is spent and the AI
            call runs, not just after. The per-item title/skill confirm cards
            above this dialog already gate anything being added; this gate is
            for the tailor run itself, so the person knows up front what
            "tailor" changes before agreeing to it. */}
        <Dialog open={tailorConfirmOpen} onOpenChange={setTailorConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tailor this resume?</DialogTitle>
              <DialogDescription>
                AYN rewrites your resume's wording for this one job to improve your ATS match. It never invents a number, a skill, or an employer you don't have.
              </DialogDescription>
            </DialogHeader>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>If this job's title differs from yours, or it asks for a skill not on your resume, you'll see a suggestion afterward. Nothing is added or changed unless you approve it yourself, one item at a time.</li>
              <li>Numbers, dates, and employers are never changed.</li>
              <li>This uses 2 credits.</li>
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTailorConfirmOpen(false)}>Cancel</Button>
              <Button
                onClick={() => { setTailorConfirmOpen(false); tailorResume(); }}
                style={{ background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }}
                className="hover:opacity-90"
              >
                Tailor my resume
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // v3.172.0 — "see the whole pipeline at a glance," the exact value the
  // application-tracker research says candidates want most from a real
  // one. A count per stage, clickable to filter -- delivers that without
  // a full drag-and-drop kanban rebuild.
  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = jobs.filter((j) => j.application_status === s).length;
    return acc;
  }, {});
  const statusScoped = statusFilter ? jobs.filter((j) => j.application_status === statusFilter) : jobs;
  const q = jobQuery.trim().toLowerCase();
  const visibleJobs = q
    ? statusScoped.filter((j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q))
    : statusScoped;

  return (
    // v3.174.0 — reported directly, from a screenshot: "half the page is
    // split," a real bug, not a feeling. This list's own root div capped
    // at max-w-2xl (672px) while it renders inside .rh-main, which runs up
    // to ~1240px wide -- roughly half the panel was dead space on every
    // wide screen. BrowseJobs.tsx's own root has no such cap. Dropped it
    // here too, and the single-column list became a responsive two-column
    // grid instead of one very wide row, so the freed-up width goes into
    // more cards on screen at once, not one oddly stretched column.
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="rh-display flex items-center gap-2.5 text-xl">
          <span aria-hidden="true" style={{ width: 18, height: 3, borderRadius: 2, background: "var(--rh-accent)", flexShrink: 0 }} />
          Saved jobs
        </h2>
      </div>

      {jobs.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--rh-faint)" }} />
          <Input
            value={jobQuery}
            onChange={(e) => setJobQuery(e.target.value)}
            placeholder="Search by title or company"
            className="pl-9"
            style={{ borderColor: "var(--rh-hair)" }}
          />
        </div>
      )}

      {jobs.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
            style={!statusFilter
              ? { background: "var(--rh-ink)", color: "#fff" }
              : { background: "var(--rh-raised)", color: "var(--rh-muted)" }}
          >
            All · {jobs.length}
          </button>
          {STATUS_ORDER.filter((s) => statusCounts[s] > 0).map((s) => {
            const meta = STATUS_META[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(active ? null : s)}
                className="text-xs font-semibold rounded-full px-3 py-1.5 transition"
                style={active ? { background: meta.bg, color: meta.color } : { background: "var(--rh-raised)", color: "var(--rh-muted)" }}
              >
                {meta.label} · {statusCounts[s]}
              </button>
            );
          })}
        </div>
      )}

      {jobs.length === 0 && (
        <Card className="p-10 text-center rounded-xl" style={{ borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}>
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No saved jobs yet. Browse jobs to get started.
        </Card>
      )}

      {visibleJobs.length === 0 && jobs.length > 0 && (
        <Card className="p-8 text-center rounded-xl" style={{ borderColor: "var(--rh-hair)", color: "var(--rh-muted)" }}>
          {q ? `Nothing matches "${jobQuery.trim()}".` : "Nothing in this stage yet."}
        </Card>
      )}

      {/* v3.177.0 — reported directly against the exact Browse jobs swipe
          card. v3.178.0 — reported directly against the exact reference
          card, side by side with this one: the earlier pass was close but
          not it. Two real gaps closed. One, height -- that reference card
          is a fixed 440px (BrowseJobs.tsx's own SwipeDeck), so a short
          description still leaves generous empty space before the
          footer; this list's cards were only ever as tall as their own
          content, so a short posting looked visibly thinner than a long
          one sitting right beside it. min-h-[420px] plus a flex-1 spacer
          between the description and the footer gets the same effect
          without needing a literal fixed height on every card, which
          would clip a genuinely long description instead of just
          scrolling past what a fixed-height deck card cannot show either.
          Two, the footer -- the reference card's own footer is one
          left-side indicator (a match-score gauge there, honestly not
          available here without a paid `match` call run for free across
          a whole list) plus one right-side "Read full posting" link, not
          two competing links. The status pill moved down into that left
          slot -- real data, not invented, and the actual at-a-glance
          state this specific card needs -- and "View posting" (the
          external apply link) was dropped from the card entirely: it is
          not lost, the exact same link with the exact same auto-apply
          click behavior already lives one tap away on the detail view
          this card opens into. */}
      {/* v3.180.0 — reported directly, repeatedly, that this still didn't
          look like the reference: the actual gap was never the padding or
          the footer, it was the shape. The reference card (BrowseJobs.tsx's
          SwipeDeck) is a narrow, tall portrait card, min(360px, 92vw) wide.
          A two-column grid stretches each card to roughly half the panel's
          own ~1240px width -- a wide landscape card no amount of internal
          polish reads as "the same card" as a narrow one. Switched to an
          auto-fill grid with a 280px floor, so cards size close to the
          reference's own width and the column count adapts to the panel,
          instead of being fixed at two regardless of how many would
          actually fit at that size.
          v3.271.0 — same fix as AssessmentsTab.tsx's own grid: auto-fill
          reserves a real, empty 280px track for every bit of container
          width regardless of how many jobs there actually are, so a small
          saved-jobs list on a wide page reads as a couple of cards
          stranded in mostly-blank space. Capped at roughly four columns'
          worth -- unaffected once there's enough content to fill it. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", maxWidth: 1180 }}>
        {visibleJobs.map((j) => {
          const avatar = companyAvatar(j.company || "?");
          const meta = STATUS_META[j.application_status] ?? STATUS_META.saved;
          const snippet = (j.jd_text || "").trim();
          // v3.182.0 — a lightweight, always-visible version of the silence
          // nudge above: discoverable across the whole pipeline at a glance,
          // without opening every card one at a time.
          const silentDays = j.application_status === "applied" ? daysSince(j.application_status_changed_at) : 0;
          const showSilentDays = silentDays >= SILENCE_NUDGE_DAYS;
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => openJob(j)}
              className="rh-lift w-full rounded-2xl p-5 flex flex-col text-left min-h-[420px]"
              style={{ background: "var(--rh-surface)", border: "1px solid var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}
            >
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mb-3 ${avatar.className}`}
                style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
              >
                {avatar.initial}
              </div>
              <p className="rh-display text-[18px] leading-snug mb-1">{j.title}</p>
              <p className="text-[13px] mb-3" style={{ color: "var(--rh-muted)" }}>
                {j.company}{j.location ? ` · ${j.location}` : ""}
              </p>
              {snippet && (
                <p className="text-[13px] leading-relaxed line-clamp-6" style={{ color: "var(--rh-muted)" }}>
                  {snippet}
                </p>
              )}
              <div className="flex-1" />
              <div className="flex items-center justify-between pt-3 mt-3 border-t w-full" style={{ borderColor: "var(--rh-hair)" }}>
                <span
                  className="text-[11px] font-semibold rounded-full px-2.5 py-1"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.label}{showSilentDays ? ` · ${silentDays}d silent` : ""}
                </span>
                <span className="text-[11px] font-bold underline" style={{ color: "var(--rh-accent-2)" }}>
                  Read full posting
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
