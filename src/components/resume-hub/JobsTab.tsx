import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { Loader2, Sparkles, ExternalLink, Plus, Trash2, FileText, Wand2 } from "lucide-react";
import { handoffUrl } from "@/lib/extension";

interface Props { userId: string; onOpenJob: (id: string) => void }

interface JobRow { id: string; company: string; title: string; location: string | null; source_url: string | null; jd_text: string | null; created_at: string }

export default function JobsTab({ userId }: Props) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [primaryResume, setPrimaryResume] = useState<{ id: string; content: ResumeContent } | null>(null);
  const [matchData, setMatchData] = useState<{ score: number; breakdown: Record<string, number>; missing_keywords: string[]; summary: string } | null>(null);
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newJob, setNewJob] = useState({ url: "", text: "" });

  const load = async () => {
    const { data } = await supabase.from("jobs").select("id, company, title, location, source_url, jd_text, created_at").eq("user_id", userId).order("created_at", { ascending: false });
    setJobs((data as JobRow[]) ?? []);
  };
  useEffect(() => {
    load();
    supabase.from("resumes").select("id, content").eq("user_id", userId).eq("is_primary", true).maybeSingle()
      .then(({ data }) => data && setPrimaryResume({ id: data.id, content: data.content as ResumeContent }));
  /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const openJob = async (j: JobRow) => {
    setSelected(j);
    setMatchData(null);
    setLetter("");
  };

  const calcMatch = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setBusy(true);
    try {
      const m = await resumeHubApi.match(primaryResume.content, selected.jd_text);
      setMatchData(m);
      await supabase.from("job_matches").insert({
        user_id: userId, job_id: selected.id, resume_id: primaryResume.id,
        score: m.score, breakdown: m.breakdown,
      });
    } catch (e) {
      toast({ title: "Match failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const tailorResume = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setBusy(true);
    try {
      const { resume } = await resumeHubApi.tailor(primaryResume.content, selected.jd_text);
      const { error } = await supabase.from("resume_versions").insert({
        user_id: userId, resume_id: primaryResume.id, content: resume as any, created_for_job_id: selected.id,
      });
      if (error) throw error;
      toast({ title: "Tailored resume saved", description: "Check Builder for the new version." });
    } catch (e) {
      toast({ title: "Tailor failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const writeCover = async () => {
    if (!selected || !primaryResume || !selected.jd_text) return;
    setBusy(true);
    try {
      const { body } = await resumeHubApi.coverLetter(primaryResume.content, selected.jd_text, { company: selected.company });
      setLetter(body);
      await supabase.from("cover_letters").insert({ user_id: userId, job_id: selected.id, resume_id: primaryResume.id, body });
    } catch (e) {
      toast({ title: "Cover letter failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
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

              <div className="flex flex-wrap gap-2 mt-4">
                <Button onClick={calcMatch} disabled={busy || !primaryResume}><Sparkles className="w-4 h-4 mr-2" />Score this job</Button>
                <Button onClick={tailorResume} disabled={busy || !primaryResume} variant="outline">Tailor resume</Button>
                <Button onClick={writeCover} disabled={busy || !primaryResume} variant="outline">Write cover letter</Button>
                
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
                <p className="text-xs text-amber-500 mt-3">Set a primary resume in Builder to enable AI actions.</p>
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

            {letter && (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Cover letter</h3>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(letter); toast({ title: "Copied" }); }}>Copy</Button>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans">{letter}</pre>
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
