/**
 * JobsTab.tsx — v3.4.0 "tailored outputs live on the job"
 *
 * A tailored resume is not a resume the user maintains, it is an output of a
 * job. So the generated documents are stored against the job and downloaded
 * from here. The source resume is the single active one in Profile.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { Loader2, Sparkles, ExternalLink, Plus, Trash2, FileText, Wand2, Download } from "lucide-react";
import { handoffUrl } from "@/lib/extension";
import { resumeToText, buildResumePdfBlob, buildResumeDocxBlob, downloadBlob, fileBase } from "@/lib/resumeDocs";
import ResumeDiffViewer from "./ResumeDiffViewer";
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { useFeature } from "@/hooks/useFeatureFlags";
import { isFeatureDisabled } from "@/lib/featureError";

interface Props { userId: string; onOpenJob: (id: string) => void; onOpenProfile: () => void }

interface JobRow { id: string; company: string; title: string; location: string | null; source_url: string | null; jd_text: string | null; created_at: string }
interface TailoredRow { id: string; created_at: string; content: ResumeContent }
interface CoverRow { id: string; created_at: string; body: string }

export default function JobsTab({ userId, onOpenProfile }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [primaryResume, setPrimaryResume] = useState<{ id: string; content: ResumeContent; ats_score: number | null } | null>(null);
  const [matchData, setMatchData] = useState<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string } | null>(null);
  const [tailored, setTailored] = useState<TailoredRow | null>(null);
  const tailoring = useFeature("tailoring");
  const [cover, setCover] = useState<CoverRow | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
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
      const { resume } = await resumeHubApi.tailor(selected.jd_text);
      // Regenerating replaces the stored copy for this job.
      await supabase.from("resume_versions").delete().eq("user_id", userId).eq("created_for_job_id", selected.id);
      const { error } = await supabase.from("resume_versions").insert({
        user_id: userId, resume_id: primaryResume.id, content: resume as never, created_for_job_id: selected.id,
      });
      if (error) throw error;
      await loadDocs(selected.id);
      toast({ title: "Tailored resume ready", description: "Download it below." });
    } catch (e) {
      toast(isFeatureDisabled(e)
        ? { title: "Under maintenance", description: e.message }
        : { title: "Tailor failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const writeCover = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setBusy(true);
    try {
      const { body } = await resumeHubApi.coverLetter(selected.jd_text, { company: selected.company });
      await supabase.from("cover_letters").delete().eq("user_id", userId).eq("job_id", selected.id);
      await supabase.from("cover_letters").insert({ user_id: userId, job_id: selected.id, resume_id: primaryResume.id, body });
      await loadDocs(selected.id);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside className="space-y-2">
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
                  <Badge variant="outline" className="text-lg px-3 py-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                    {matchData.score}/100
                  </Badge>
                )}
              </div>

              <MaintenanceNotice feature="tailoring" className="mt-4" />

              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={calcMatch} disabled={busy || !primaryResume}><Sparkles className="w-4 h-4 mr-2" />Score this job</Button>
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
                    <div key={k} className="text-center p-3 rounded-lg bg-muted/40">
                      <div className="text-2xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>{v}</div>
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
                      <div className="flex items-center gap-2">
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
                        <Button size="sm" variant="outline" onClick={() => downloadDoc(cover.body, fileBase(selected.company, selected.title, "Cover_Letter"), "pdf")}>
                          <Download className="w-4 h-4 mr-1.5" />PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadDoc(cover.body, fileBase(selected.company, selected.title, "Cover_Letter"), "docx")}>
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
