/**
 * SkillsToLearnTab.tsx — v3.315.0
 *
 * The other half of a deliberate, confirm-first choice made in JobsTab: when
 * a role asks for something not on the resume yet and the person decides to
 * add it anyway (never automatic — see JobsTab's own gapSuggestions block),
 * the same skill lands here too, grouped by the job it came from. Not a
 * static claim on a document and nothing more — a real, ongoing checklist
 * of what to actually go learn before an interview happens.
 */
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, GraduationCap, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { companyAvatar } from "./BrowseJobs";

type Row = {
  id: string;
  job_id: string | null;
  job_title: string | null;
  company: string | null;
  skill: string;
  added_at: string;
  learned_at: string | null;
};

// v3.316.0 — asked directly: when a skill is missing, show a real
// suggestion for a course that could help. Never a specific invented
// course title or provider (see BrowseJobs.tsx's own resolveLogoUrl
// history — this app's standing rule is code decides facts, never a
// guess dressed up as a real thing), so this is a plain, always-valid
// search link for the exact skill name already on the row, not a claim
// that any particular course exists.
function courseSearchUrl(skill: string): string {
  return `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`;
}

type Group = { key: string; job_title: string | null; company: string | null; rows: Row[] };

export default function SkillsToLearnTab({ userId, onOpenJob }: { userId: string; onOpenJob?: (jobId: string) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("skills_to_learn")
      .select("id, job_id, job_title, company, skill, added_at, learned_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggleLearned = async (row: Row) => {
    setBusy(b => ({ ...b, [row.id]: true }));
    const nextLearnedAt = row.learned_at ? null : new Date().toISOString();
    const { error } = await supabase.from("skills_to_learn").update({ learned_at: nextLearnedAt }).eq("id", row.id);
    if (error) {
      toast({ title: "Couldn't update that", description: error.message, variant: "destructive" });
    } else {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, learned_at: nextLearnedAt } : r));
    }
    setBusy(b => ({ ...b, [row.id]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--rh-muted)" }} />
      </div>
    );
  }

  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const r of rows) {
    const key = r.job_id || `${r.job_title || ""}::${r.company || ""}`;
    let g = byKey.get(key);
    if (!g) { g = { key, job_title: r.job_title, company: r.company, rows: [] }; byKey.set(key, g); groups.push(g); }
    g.rows.push(r);
  }

  const totalSkills = rows.length;
  const learnedCount = rows.filter(r => r.learned_at).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="lp-eyebrow" style={{ marginBottom: 8 }}>Skills to learn</h2>
        <p className="text-sm" style={{ color: "var(--rh-muted)" }}>
          {totalSkills === 0
            ? "Nothing here yet."
            : `${learnedCount} of ${totalSkills} marked learned.`}
        </p>
      </div>

      {groups.length === 0 && (
        <Card className="p-8 text-center space-y-2 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <GraduationCap className="w-6 h-6 mx-auto" style={{ color: "var(--rh-faint)" }} />
          <p className="rh-display text-[15px]">No skills tracked yet</p>
          <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
            When you tailor a resume and confirm adding a skill a job wants that you don't have yet, it shows up
            here — a real reminder of what to actually go learn, not just a line on a document.
          </p>
        </Card>
      )}

      {groups.map(g => (
        <Card
          key={g.key}
          className="rh-lift p-4 sm:p-5 space-y-3 rounded-2xl"
          style={{ background: "var(--rh-surface)", border: "1.5px solid var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${companyAvatar(g.company || g.job_title || "?").className}`}>
                {companyAvatar(g.company || g.job_title || "?").initial}
              </div>
              <div className="min-w-0">
                <p className="rh-display text-[14.5px] truncate">{g.job_title || "A role"}</p>
                {g.company && <p className="text-xs truncate" style={{ color: "var(--rh-muted)" }}>{g.company}</p>}
              </div>
            </div>
            {g.rows[0]?.job_id && onOpenJob && (
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOpenJob(g.rows[0].job_id!)}>
                Open job <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            {g.rows.map(r => (
              <div
                key={r.id}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors"
                style={{ background: r.learned_at ? "transparent" : "var(--rh-tint)" }}
              >
                <button
                  type="button"
                  disabled={busy[r.id]}
                  onClick={() => toggleLearned(r)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                >
                  {r.learned_at
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--rh-trust, #0f9d6b)" }} />
                    : <Circle className="w-4 h-4 shrink-0" style={{ color: "var(--rh-muted)" }} />}
                  <span
                    className="text-sm truncate"
                    style={r.learned_at ? { color: "var(--rh-muted)", textDecoration: "line-through" } : undefined}
                  >
                    {r.skill}
                  </span>
                </button>
                {/* v3.316.0 — a real, always-valid search link, not a claim
                    a specific course exists. Only shown while the skill is
                    still unlearned; nothing left to suggest once it's checked off. */}
                {!r.learned_at && (
                  <a
                    href={courseSearchUrl(r.skill)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs shrink-0 whitespace-nowrap"
                    style={{ color: "var(--rh-accent-2)" }}
                  >
                    Find a course <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
