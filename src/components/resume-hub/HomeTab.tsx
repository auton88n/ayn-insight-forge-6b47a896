/**
 * HomeTab.tsx — v3.3.0 "Home replaces Overview"
 *
 * Overview counted things. Counting told a user nothing to do, and after the
 * tracker was removed some of those counts had no home at all. Home shows at
 * most four next actions, each only when it is genuinely true, and otherwise a
 * single calm line. No streaks, no completion percentage.
 *
 * v3.172.0 — the "next actions" model itself was already right (the
 * research pass into the rest of Resume Hub found nothing to change
 * functionally here), but this is the very first screen a job seeker
 * sees and it was rendering on shadcn's plain defaults -- the one part of
 * the hub that had never picked up any of AYN's own branding at all, not
 * even the earlier version of it. Extended onto the same Charcoal &
 * Ember system Browse Jobs and Saved jobs now use: real typography, a
 * color-coded action per kind (a proposal reads as an event, not the
 * same visual weight as "your profile needs a field"), motion on hover.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, User, Users, Target, ChevronRight, CheckCircle2 } from "lucide-react";
import { loadHubSnapshot, type HubSnapshot } from "@/lib/hubSnapshot";

interface Props {
  userId: string;
  onOpenProfile: () => void;
  onOpenJobs: () => void;
  onOpenProposals: () => void;
}


interface Action {
  key: string;
  icon: typeof FileText;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
  primary?: boolean;
}

export default function HomeTab({ userId, onOpenProfile, onOpenJobs, onOpenProposals }: Props) {
  const [snap, setSnap] = useState<HubSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    loadHubSnapshot(userId).then(s => { if (alive) setSnap(s); }).catch(() => { if (alive) setSnap(null); });
    return () => { alive = false; };
  }, [userId]);

  if (!snap) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
      </div>
    );
  }

  const incomplete = snap.groupGaps.filter(g => !g.complete);
  const actions: Action[] = [];

  // Intro requests always sort first when present.
  // v3.6.0 — job proposals always sort first when present.
  if (snap.pendingIntros > 0) {
    actions.push({
      key: "proposals",
      icon: Users,
      primary: true,
      title: `${snap.pendingIntros} new job ${snap.pendingIntros === 1 ? "proposal" : "proposals"}`,
      body: "An employer wants to hire for a role like yours. Your contact details stay private until you accept.",
      cta: "Read proposals",
      onClick: onOpenProposals,
    });
  }


  if (snap.resumeCount === 0) {
    actions.push({
      key: "resume",
      icon: FileText,
      title: "Add your resume",
      body: "Nothing else works without it. AYN reads it once to build your profile, scoring, and tailoring.",
      cta: "Go to Profile",
      onClick: onOpenProfile,
    });
  }

  if (incomplete.length > 0) {
    actions.push({
      key: "profile",
      icon: User,
      title: "Complete your profile",
      body: `Still missing: ${incomplete.map(g => g.group).join(", ")}.`,
      cta: "Go to Profile",
      onClick: onOpenProfile,
    });
  }

  if (snap.unscoredJobs > 0) {
    actions.push({
      key: "jobs",
      icon: Target,
      title: `${snap.unscoredJobs} saved ${snap.unscoredJobs === 1 ? "job is" : "jobs are"} not scored yet`,
      body: "Score them to see where you already match and what is missing.",
      cta: "Go to Jobs",
      onClick: onOpenJobs,
    });
  }

  const shown = actions.slice(0, 4);

  return (
    <div className="space-y-3">
      {shown.length > 0 ? (
        <>
          <div>
            <h2 className="rh-display text-xl">Next</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--rh-muted)" }}>The shortest path to a better match.</p>
          </div>
          {shown.map(a => {
            const Icon = a.icon;
            return (
              <Card
                key={a.key}
                className="rh-lift p-4 sm:p-5 rounded-xl"
                style={a.primary
                  ? { background: "var(--rh-tint)", borderColor: "var(--rh-accent)", boxShadow: "var(--rh-shadow-card)" }
                  : { borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={a.primary
                      ? { background: "var(--rh-gradient)", boxShadow: "var(--rh-glow)" }
                      : { background: "var(--rh-raised)" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: a.primary ? "#fff" : "var(--rh-muted)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="rh-display text-[15px]">{a.title}</p>
                    <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--rh-muted)" }}>{a.body}</p>
                    <Button
                      size="sm"
                      className={a.primary ? "mt-3 hover:opacity-90" : "mt-2 -ml-2"}
                      variant={a.primary ? undefined : "ghost"}
                      style={a.primary ? { background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" } : undefined}
                      onClick={a.onClick}
                    >
                      {a.cta} <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      ) : (
        <Card className="p-5 sm:p-6 space-y-2 rounded-xl" style={{ borderColor: "var(--rh-hair)", boxShadow: "var(--rh-shadow-card)" }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" style={{ color: "var(--rh-trust)" }} />
            <p className="rh-display text-[15px]">You are set up. Open a job posting and AYN will score it.</p>
          </div>
          <p className="text-xs" style={{ color: "var(--rh-muted)" }}>
            Your resume: {snap.primaryResumeTitle || "none yet"} · Talent pool:{" "}
            {snap.poolOptedIn ? "employers can find you" : "off"}
          </p>
        </Card>
      )}
    </div>
  );
}
