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
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent, type JobPosting } from "@/lib/resumeHub";
import { Loader2, Sparkles, ExternalLink, Plus, Trash2, FileText, Wand2, Download, X, Compass } from "lucide-react";
import { handoffUrl } from "@/lib/extension";
import { resumeToText, buildResumePdfBlob, buildResumeDocxBlob, buildTextPdfBlob, buildTextDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";
import ResumeDiffViewer from "./ResumeDiffViewer";
import BrowseJobs from "./BrowseJobs";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { useFeature } from "@/hooks/useFeatureFlags";
import { isFeatureDisabled } from "@/lib/featureError";

interface Props { userId: string; onOpenJob: (id: string) => void; onOpenProfile: () => void; onCreditsChanged?: () => void }

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

export default function JobsTab({ userId, onOpenProfile, onCreditsChanged }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
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
  const [adding, setAdding] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [newJob, setNewJob] = useState({ url: "", text: "" });

  const load = async () => {
    const { data } = await supabase.from("jobs").select("id, company, title, location, source_url, jd_text, created_at").eq("user_id", userId).order("created_at", { ascending: false });
    setJobs((data as JobRow[]) ?? []);
  };
  useEffect(() => {
    load();
    supabase.from("resumes").select("id, content, ats_score").eq("user_id", userId).eq("is_primary", true).maybeSingle()
      .then(({ data }) => data && setPrimaryResume({ id: data.id, content: data.content as ResumeContent, ats_score: data.ats_score }));
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

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
    setBusy(true);
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
    } finally { setBusy(false); }
  };

  const tailorResume = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setBusy(true);
    try {
      const { resume, gapAnalysis } = await resumeHubApi.tailor(selected.jd_text);
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
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Tailor failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
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
    setBusy(true);
    try {
      const { body } = await resumeHubApi.coverLetter(selected.jd_text, { company: selected.company });
      await supabase.from("cover_letters").delete().eq("user_id", userId).eq("job_id", selected.id);
      await supabase.from("cover_letters").insert({ user_id: userId, job_id: selected.id, resume_id: primaryResume.id, body });
      await loadDocs(selected.id);
      onCreditsChanged?.();
    } catch (e) {
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Cover letter failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const downloadDoc = async (content: ResumeContent, base: string, kind: "pdf" | "docx") => {
    try {
      if (kind === "pdf") downloadBlob(buildResumePdfBlob(content), `${base}.pdf`);
      else downloadBlob(await buildResumeDocxBlob(content), `${base}.docx`);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    }
  };

  const downloadText = async (text: string, base: string, kind: "pdf" | "docx") => {
    try {
      if (kind === "pdf") downloadBlob(buildTextPdfBlob(text), `${base}.pdf`);
      else downloadBlob(await buildTextDocxBlob(text), `${base}.docx`);
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

  // v3.134.0 — a job picked from Browse Jobs lands in the exact same jobs
  // table, same shape as a manual add, then flows through the unchanged
  // score/tailor/cover-letter pipeline below. This function's only job is
  // getting it into that table and opening it — no separate code path.
  const addFromBoard = async (job: JobPosting) => {
    const { data, error } = await supabase.from("jobs").insert({
      user_id: userId,
      source: "job_board",
      source_url: job.apply_url,
      jd_text: job.description,
      company: job.company,
      title: job.title,
      location: job.location,
    }).select("id, company, title, location, source_url, jd_text, created_at").single();
    if (error) throw error;
    setBrowsing(false);
    await load();
    if (data) openJob(data as JobRow);
    toast({ title: "Job added", description: "Scoring and tailoring are ready below." });
  };

  if (browsing) {
    return <BrowseJobs onAdd={addFromBoard} onClose={() => setBrowsing(false)} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside className="space-y-2">
        <Button onClick={() => setBrowsing(true)} className="w-full">
          <Compass className="w-4 h-4 mr-2" />Browse jobs
        </Button>
        <Button onClick={() => setAdding((a) => !a)} variant="outline" className="w-full">
          <Plus className="w-4 h-4 mr-2" />Add job manually
        </Button>
        {adding && (
          <Card className="p-3 space-y-2">
            <Input placeholder="Job URL (optional)" value={newJob.url} onChange={(e) => setNewJob({ ...newJob, url: e.target.value })} />
            <Textarea placeholder="Paste job description" value={newJob.text} onChange={(e) => setNewJob({ ...newJob, text: e.target.value })} rows={4} />
            <Button onClick={addManually} disabled={busy} size="sm" className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save job"}
            </Button>
          </Card>
        )}

        {jobs.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">No saved jobs yet. Install the Chrome extension to save jobs from LinkedIn, Indeed, or any career page.</p>
        )}

        {jobs.map((j) => (
          <button
            key={j.id}
            onClick={() => openJob(j)}
            className={`w-full text-left p-3 rounded-lg border transition ${selected?.id === j.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
          >
            <div className="font-medium text-sm truncate">{j.title}</div>
            <div className="text-xs text-muted-foreground truncate">{j.company} {j.location && `• ${j.location}`}</div>
          </button>
        ))}
      </aside>

      <div className="space-y-4">
        {!selected && (
          <Card className="p-10 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Select a job to see its match score and generate tailored materials.
          </Card>
        )}

        {selected && (
          <>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected.title}</h2>
                  <p className="text-sm text-muted-foreground">{selected.company} {selected.location && `• ${selected.location}`}</p>
                  {selected.source_url && (
                    <a href={selected.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-primary mt-2">
                      View original <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>
                {matchData && (
                  <div
                    className="text-lg px-3 py-1 rounded-full font-semibold"
                    style={{ fontFamily: "JetBrains Mono, monospace", ...scoreBadgeStyle(matchData.score) }}
                  >
                    {matchData.score}/100
                  </div>
                )}
              </div>

              <MaintenanceNotice feature="tailoring" className="mt-4" />

              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  onClick={calcMatch}
                  disabled={busy || !primaryResume}
                  style={{ background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }}
                  className="hover:opacity-90"
                >
                  <Sparkles className="w-4 h-4 mr-2" />Score this job
                </Button>
                <Button onClick={tailorResume} disabled={busy || !primaryResume || !tailoring.enabled} variant="outline">Tailor resume</Button>
                <Button onClick={writeCover} disabled={busy || !primaryResume || !tailoring.enabled} variant="outline">Write cover letter</Button>

                {selected.source_url && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.open(handoffUrl(selected.source_url!, primaryResume?.id), "_blank", "noopener");
                      toast({ title: "Opening job page", description: "AYN opens with this job and resume selected." });
                    }}
                  >
                    <Wand2 className="w-4 h-4 mr-2" />Open job with AYN
                  </Button>
                )}
                <Button onClick={() => removeJob(selected.id)} variant="ghost" size="sm" className="ml-auto"><Trash2 className="w-4 h-4" /></Button>
              </div>
              {!primaryResume && (
                <p className="text-xs text-amber-500 mt-3">Add your resume in Profile to enable AI actions.</p>
              )}
              {primaryResume && primaryResume.ats_score != null && primaryResume.ats_score < 70 && (
                <p className="text-xs text-amber-500 mt-3">
                  Your resume scores {primaryResume.ats_score}/100 for ATS readiness — tailoring still works,
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
                      {matchData.missing_keywords.map((k, i) => <Badge key={i} variant="outline">{k}</Badge>)}
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
                        <Button size="sm" variant="outline" onClick={() => downloadDoc(tailored.content, fileBase(selected.company, selected.title, "Resume"), "pdf")}>
                          <Download className="w-4 h-4 mr-1.5" />PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadDoc(tailored.content, fileBase(selected.company, selected.title, "Resume"), "docx")}>
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
                      This role also asks for a few things not on your resume. Only add one if it's genuinely true —
                      edit the text first if your own wording fits better.
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
                        <Button size="sm" variant="outline" onClick={() => downloadText(cover.body, fileBase(selected.company, selected.title, "Cover_Letter"), "pdf")}>
                          <Download className="w-4 h-4 mr-1.5" />PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadText(cover.body, fileBase(selected.company, selected.title, "Cover_Letter"), "docx")}>

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


            {selected.jd_text && (
              <Card className="p-5">
                <h3 className="font-semibold mb-2">Job description</h3>
                <pre className="text-sm whitespace-pre-wrap font-sans max-h-96 overflow-auto text-muted-foreground">{selected.jd_text}</pre>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
