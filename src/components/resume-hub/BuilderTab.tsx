import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { resumeHubApi, type ResumeContent } from "@/lib/resumeHub";
import { Loader2, Sparkles, Plus, Trash2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { ResumeUpload } from "./ResumeUpload";
import { reindexTalentPool } from "@/lib/talentPoolSync";
import ResumeDiffViewer from "./ResumeDiffViewer";


interface Props { userId: string }

interface ResumeRow { id: string; title: string; is_primary: boolean; content: ResumeContent; ats_score: number | null }
interface VersionRow { id: string; created_at: string; content: ResumeContent; created_for_job_id: string | null }

/** Flatten a resume into plain text so the diff viewer can compare two of them. */
function resumeToText(c: ResumeContent): string {
  const b = c.basics ?? {};
  const lines: string[] = [b.name ?? "", b.title ?? "", b.summary ?? "", ""];
  (c.work ?? []).forEach(w => {
    lines.push(`${w.title ?? ""} — ${w.company ?? ""}`.trim());
    (w.bullets ?? []).forEach(x => lines.push(`• ${x}`));
    lines.push("");
  });
  if ((c.skills ?? []).length) lines.push(`Skills: ${(c.skills ?? []).join(", ")}`);
  return lines.join("\n");
}

export default function BuilderTab({ userId }: Props) {
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState<ResumeContent>({ basics: { name: "", summary: "" }, work: [], education: [], skills: [] });
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  // v3.3.0 — the Resumes tab holds the builder AND every tailored version, so
  // a version is where the diff viewer is reached from.
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("resumes").select("id, title, is_primary, content, ats_score").eq("user_id", userId).order("updated_at", { ascending: false });
    const rows = (data as unknown as ResumeRow[]) ?? [];
    setResumes(rows);
    if (rows.length && !activeId) {
      const r = rows.find((x) => x.is_primary) ?? rows[0];
      setActiveId(r.id);
      setTitle(r.title);
      setContent(r.content || {});
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  useEffect(() => {
    setCompareId(null);
    if (!activeId) { setVersions([]); return; }
    supabase.from("resume_versions")
      .select("id, created_at, content, created_for_job_id")
      .eq("user_id", userId).eq("resume_id", activeId)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setVersions((data as unknown as VersionRow[]) ?? []));
  }, [activeId, userId]);

  const selectResume = (r: ResumeRow) => {
    setActiveId(r.id);
    setTitle(r.title);
    setContent(r.content || {});
  };

  const save = async () => {
    setBusy(true);
    try {
      if (activeId) {
        const { error } = await supabase.from("resumes").update({ title, content: content as any }).eq("id", activeId);
        if (error) throw error;
        toast({ title: "Saved" });
      } else {
        const { data, error } = await supabase.from("resumes").insert({ user_id: userId, title: title || "My Resume", content: content as any, is_primary: resumes.length === 0 }).select("id").single();
        if (error) throw error;
        setActiveId(data.id);
        toast({ title: "Created" });
      }
      load();
      // v3.2.1 — resumes are written client side and bypass the edge function,
      // so the pool index would go stale. Fire and forget, opt-in gated.
      reindexTalentPool(activeId ? "resume_update" : "resume_insert");

    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const setPrimary = async () => {
    if (!activeId) return;
    setBusy(true);
    await supabase.from("resumes").update({ is_primary: false }).eq("user_id", userId);
    await supabase.from("resumes").update({ is_primary: true }).eq("id", activeId);
    toast({ title: "Set as primary" });
    setBusy(false);
    load();
    // profile_text is built from the primary resume, so a switch changes the index.
    reindexTalentPool("primary_resume_change");
  };


  const removeResume = async () => {
    if (!activeId) return;
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    const wasPrimary = resumes.find((r) => r.id === activeId)?.is_primary;
    await supabase.from("resumes").delete().eq("id", activeId);
    setActiveId(null);
    setTitle("");
    setContent({ basics: { name: "", summary: "" }, work: [], education: [], skills: [] });
    load();
    if (wasPrimary) reindexTalentPool("primary_resume_deleted");
  };


  const newResume = () => {
    setActiveId(null);
    setTitle("New Resume");
    setContent({ basics: { name: "", summary: "" }, work: [{ company: "", title: "", bullets: [""] }], education: [], skills: [] });
  };

  const handleFileParsed = async ({ resume }: { resume: ResumeContent }) => {
    setContent(resume);
    const name = resume.basics?.name;
    const autoTitle = name ? `${name} – Resume` : "Uploaded Resume";
    setTitle(autoTitle);

    // Auto-save as primary so the profile form and extension can use it immediately
    try {
      setBusy(true);
      // Unset any existing primary
      await supabase.from("resumes").update({ is_primary: false }).eq("user_id", userId);
      // Insert new primary resume
      const { data: inserted } = await supabase.from("resumes").insert({
        user_id: userId,
        title: autoTitle,
        content: resume as never,
        is_primary: true,
      }).select("id").single();
      if (inserted) setActiveId(inserted.id);
      await load();
      // Client-side resume write, so refresh the talent pool index.
      reindexTalentPool("resume_upload");

      toast({
        title: "Resume saved as primary",
        description: "Your profile has been pre-filled. Review each section and save it.",
      });
    } catch {

      toast({ title: "Resume loaded", description: "Click Save to store it." });
    } finally {
      setBusy(false);
    }
  };

  const importFromText = async () => {
    if (!importText.trim()) return;
    setBusy(true);
    try {
      const { resume } = await resumeHubApi.parse(importText);
      setContent(resume);
      setTitle(resume.basics?.name ? `${resume.basics.name} – Resume` : "Imported Resume");
      setImportText("");
      toast({ title: "Imported. Review and Save." });
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const aiImprove = async () => {
    setBusy(true);
    try {
      const r = await resumeHubApi.rewrite(content);
      setContent(r.resume);
      if (activeId) {
        await supabase.from("resumes").update({ content: r.resume as any, ats_score: r.ats_score }).eq("id", activeId);
        reindexTalentPool("resume_ai_rewrite");
      }
      toast({ title: `Improved (ATS: ${r.ats_score})`, description: r.suggestions.slice(0, 3).join(" • ") });
      load();

    } catch (e) {
      toast({ title: "AI rewrite failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setBusy(false); }
  };

  // ---- helpers ----
  const updateBasics = (patch: Partial<NonNullable<ResumeContent["basics"]>>) =>
    setContent((c) => ({ ...c, basics: { ...(c.basics || {}), ...patch } }));
  const updateWork = (idx: number, patch: Partial<NonNullable<ResumeContent["work"]>[number]>) =>
    setContent((c) => {
      const work = [...(c.work || [])];
      work[idx] = { ...work[idx], ...patch };
      return { ...c, work };
    });
  const addWork = () => setContent((c) => ({ ...c, work: [...(c.work || []), { company: "", title: "", bullets: [""] }] }));
  const removeWork = (idx: number) => setContent((c) => ({ ...c, work: (c.work || []).filter((_, i) => i !== idx) }));
  const setSkills = (s: string) => setContent((c) => ({ ...c, skills: s.split(",").map((x) => x.trim()).filter(Boolean) }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Sidebar list */}
      <aside className="space-y-2">
        <Button onClick={newResume} variant="outline" className="w-full"><Plus className="w-4 h-4 mr-2" />New resume</Button>
        {resumes.map((r) => (
          <button
            key={r.id}
            onClick={() => selectResume(r)}
            className={`w-full text-left p-3 rounded-lg border transition ${activeId === r.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm truncate">{r.title}</span>
              {r.is_primary && <Star className="w-3 h-3 text-primary fill-primary" />}
            </div>
            {r.ats_score != null && <span className="text-xs text-muted-foreground">ATS {r.ats_score}</span>}
          </button>
        ))}
      </aside>

      {/* Editor */}
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Your base resumes live here, along with every version AYN tailored for a specific job.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resume title" className="max-w-xs" />
            <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
            <Button onClick={aiImprove} variant="outline" disabled={busy || !content.basics?.name}>
              <Sparkles className="w-4 h-4 mr-2" />AI Improve
            </Button>
            {activeId && (
              <>
                <Button onClick={setPrimary} variant="outline" size="sm"><Star className="w-4 h-4 mr-2" />Set primary</Button>
                <Button onClick={removeResume} variant="ghost" size="sm"><Trash2 className="w-4 h-4" /></Button>
              </>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Import resume</h3>
            <button
              type="button"
              onClick={() => setShowImport(v => !v)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
            >
              Paste text instead {showImport ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* File upload — primary */}
          <ResumeUpload onParsed={handleFileParsed} />

          {/* Paste text — secondary, collapsible */}
          {showImport && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Or paste plain text:</p>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste your resume text here. AYN will structure it."
                rows={4}
              />
              <Button onClick={importFromText} disabled={busy || !importText} size="sm" className="mt-2">
                <Sparkles className="w-4 h-4 mr-2" />Parse with AI
              </Button>
            </div>
          )}
        </Card>

        {versions.length > 0 && (
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold">Tailored versions ({versions.length})</h3>
            <p className="text-xs text-muted-foreground">
              Each one was written for a specific job. Compare a version to see exactly what changed.
            </p>
            <div className="space-y-1.5">
              {versions.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    Tailored {new Date(v.created_at).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setCompareId(compareId === v.id ? null : v.id)}>
                    {compareId === v.id ? "Hide changes" : "Compare"}
                  </Button>
                </div>
              ))}
            </div>
            {compareId && (
              <ResumeDiffViewer
                original={resumeToText(content)}
                improved={resumeToText(versions.find(v => v.id === compareId)!.content)}
              />
            )}
          </Card>
        )}

        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Basics</h3>
          <Input placeholder="Full name" value={content.basics?.name ?? ""} onChange={(e) => updateBasics({ name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Title (e.g. Senior Engineer)" value={content.basics?.title ?? ""} onChange={(e) => updateBasics({ title: e.target.value })} />
            <Input placeholder="Location" value={content.basics?.location ?? ""} onChange={(e) => updateBasics({ location: e.target.value })} />
            <Input placeholder="Email" value={content.basics?.email ?? ""} onChange={(e) => updateBasics({ email: e.target.value })} />
            <Input placeholder="Phone" value={content.basics?.phone ?? ""} onChange={(e) => updateBasics({ phone: e.target.value })} />
          </div>
          <Textarea placeholder="Professional summary" value={content.basics?.summary ?? ""} onChange={(e) => updateBasics({ summary: e.target.value })} rows={3} />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Experience</h3>
            <Button variant="outline" size="sm" onClick={addWork}><Plus className="w-3 h-3 mr-1" />Add</Button>
          </div>
          {(content.work ?? []).map((w, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Company" value={w.company} onChange={(e) => updateWork(i, { company: e.target.value })} />
                <Input placeholder="Title" value={w.title} onChange={(e) => updateWork(i, { title: e.target.value })} />
                <Input placeholder="Start (e.g. 2022-01)" value={w.start ?? ""} onChange={(e) => updateWork(i, { start: e.target.value })} />
                <Input placeholder="End (or Present)" value={w.end ?? ""} onChange={(e) => updateWork(i, { end: e.target.value })} />
              </div>
              <Textarea
                placeholder="Bullet points (one per line)"
                value={(w.bullets ?? []).join("\n")}
                onChange={(e) => updateWork(i, { bullets: e.target.value.split("\n") })}
                rows={4}
              />
              <Button variant="ghost" size="sm" onClick={() => removeWork(i)}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Skills</h3>
          <Input
            placeholder="Comma-separated skills"
            value={(content.skills ?? []).join(", ")}
            onChange={(e) => setSkills(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(content.skills ?? []).map((s, i) => <Badge key={i} variant="secondary">{s}</Badge>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
