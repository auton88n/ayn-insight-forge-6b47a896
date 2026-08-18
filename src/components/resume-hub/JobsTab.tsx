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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { Loader2, Sparkles, ExternalLink, Plus, Trash2, FileText, Download, X, ArrowLeft } from "lucide-react";
import { resumeToText, buildResumeDocxBlob, buildTextDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";
import ResumeDiffViewer from "./ResumeDiffViewer";
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

interface JobRow { id: string; company: string; title: string; location: string | null; source_url: string | null; jd_text: string | null; created_at: string }
interface TailoredRow { id: string; created_at: string; content: ResumeContent }
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
  const [busy, setBusy] = useState(false);
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
  const [adding, setAdding] = useState(false);
  const [newJob, setNewJob] = useState({ url: "", text: "" });

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

  const load = async () => {
    const { data } = await supabase.from("jobs").select("id, company, title, location, source_url, jd_text, created_at").eq("user_id", userId).order("created_at", { ascending: false });
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
      supabase.from("resume_versions").select("id, created_at, content")
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
      const { resume, gapAnalysis } = await resumeHubApi.tailor(selected.jd_text, idemKey);
      delete pendingIdemKeys.current[idemMapKey]; // succeeded — next click is a genuinely new charge
      // Regenerating replaces the stored copy for this job.
      await supabase.from("resume_versions").delete().eq("user_id", userId).eq("created_for_job_id", selected.id);
      const { error } = await supabase.from("resume_versions").insert({
        user_id: userId, resume_id: primaryResume.id, content: resume as never, created_for_job_id: selected.id,
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


  const addManually = async () => {
    if (!newJob.url && !newJob.text) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("jobs").insert({
        user_id: userId,
        source: "manual",
        source_url: newJob.url || null,
        jd_text: newJob.text || null,
        company: "New company",
        title: "Untitled role",
      });
      if (error) throw error;
      setNewJob({ url: "", text: "" });
      setAdding(false);
      load();
      toast({ title: "Job added", description: "Open it to fill in details." });
    } catch (e) {
      toast({ title: "Add failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
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
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" />{backTarget === "browse" ? "Browse jobs" : "Saved jobs"}
        </button>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center font-semibold shrink-0 ${companyAvatar(selected.company || "?").className}`}>
                {companyAvatar(selected.company || "?").initial}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-snug">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">{selected.company} {selected.location && `• ${selected.location}`}</p>
                {selected.source_url && (
                  <a href={selected.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs mt-1" style={{ color: "var(--rh-accent-2)" }}>
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
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Card className="p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] overflow-y-auto">
            <h3 className="font-semibold mb-2">Job description</h3>
            {selected.jd_text
              ? <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground">{selected.jd_text}</pre>
              : <p className="text-sm text-muted-foreground">No description was saved for this job.</p>}
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-semibold mb-3">AYN</h3>
              <MaintenanceNotice feature="tailoring" className="mb-3" />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={calcMatch}
                  disabled={activeAction !== null || !primaryResume}
                  style={{ background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }}
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
                <p className="text-xs text-amber-500 mt-3">Add your resume in Profile to enable AI actions.</p>
              )}
              {primaryResume && primaryResume.ats_score != null && primaryResume.ats_score < 70 && (
                <p className="text-xs text-amber-500 mt-3">
                  Your resume scores {primaryResume.ats_score}/100 for ATS readiness. Tailoring still works,
                  but a weak base resume means a weaker one for every job.{" "}
                  <button type="button" className="underline hover:text-foreground" onClick={onOpenProfile}>
                    Improve it in Profile
                  </button>
                </p>
              )}
            </Card>

            {matchData && (
              <Card className="p-5">
                <h3 className="font-semibold mb-3">Match breakdown</h3>
                <p className="text-sm mb-3">{matchData.summary}</p>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {Object.entries(matchData.breakdown).map(([k, v]) => (
                    <div
                      key={k}
                      className="text-center p-3 rounded-lg border"
                      style={{ background: "var(--rh-tint)", borderColor: "#f9731633" }}
                    >
                      <div className="text-2xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--rh-accent-2)" }}>{v}</div>
                      <div className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</div>
                    </div>
                  ))}
                </div>
                {matchData.missing_keywords.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Missing keywords</p>
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
              <Card className="p-5 space-y-4">
                <div>
                  <h3 className="font-semibold">Documents for this job</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
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

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Saved jobs</h2>
        <Button onClick={() => setAdding(true)} variant="outline">
          <Plus className="w-4 h-4 mr-2" />Add job manually
        </Button>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a job manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Job URL (optional)" value={newJob.url} onChange={(e) => setNewJob({ ...newJob, url: e.target.value })} />
            <Textarea placeholder="Paste job description" value={newJob.text} onChange={(e) => setNewJob({ ...newJob, text: e.target.value })} rows={6} />
            <Button
              onClick={addManually}
              disabled={busy}
              style={{ background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }}
              className="w-full hover:opacity-90"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save job"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {jobs.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
            No saved jobs yet. Install the Chrome extension to save jobs from LinkedIn, Indeed, or any career page.
          </Card>
        )}

        {jobs.map((j) => {
          const avatar = companyAvatar(j.company || "?");
          return (
            <button
              key={j.id}
              onClick={() => openJob(j)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg border transition hover:bg-muted/40"
              style={{ borderColor: "var(--rh-hair)" }}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-xs shrink-0 ${avatar.className}`}>
                {avatar.initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{j.title}</div>
                <div className="text-xs text-muted-foreground truncate">{j.company} {j.location && `• ${j.location}`}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
