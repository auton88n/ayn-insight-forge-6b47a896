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
 *
 * v3.174.0 — reported directly: "the settings needs to be in home page
 * have everything," after the account menu was trimmed down to a single
 * Settings item that still navigated away to a separate /settings route.
 * The same four sections that page has always held (Account,
 * Notifications, Privacy, Sessions -- src/components/settings/*, none of
 * them rewritten, just reused here) now render inline, below Next, so
 * nothing about managing the account means leaving Resume Hub. The
 * standalone /settings route is untouched, not deleted -- EmployerHub's
 * own account menu still points there, and it's still reachable directly.
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, FileText, User, Users, Target, ChevronRight, CheckCircle2,
  Mail, Shield, Monitor,
} from "lucide-react";
import { loadHubSnapshot, type HubSnapshot } from "@/lib/hubSnapshot";
import { AccountPreferences } from "@/components/settings/AccountPreferences";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { SessionManagement } from "@/components/settings/SessionManagement";

interface Props {
  userId: string;
  session: Session | null;
  onOpenProfile: () => void;
  onOpenJobs: () => void;
  onOpenProposals: () => void;
}

type SettingsSection = "account" | "notifications" | "privacy" | "sessions";
const SETTINGS_SECTIONS: { key: SettingsSection; label: string; icon: typeof User }[] = [
  { key: "account", label: "Account", icon: User },
  { key: "notifications", label: "Notifications", icon: Mail },
  { key: "privacy", label: "Privacy", icon: Shield },
  { key: "sessions", label: "Sessions", icon: Monitor },
];


interface Action {
  key: string;
  icon: typeof FileText;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
  primary?: boolean;
}

export default function HomeTab({ userId, session, onOpenProfile, onOpenJobs, onOpenProposals }: Props) {
  const [snap, setSnap] = useState<HubSnapshot | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("account");

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

      {/* v3.174.0 — everything the old /settings route held, in one place,
          reachable without ever leaving Resume Hub. Same section pill
          pattern already used for Saved jobs' status filter and Browse
          jobs' List/Swipe toggle, deliberately not shadcn's Tabs (its
          default active-tab state renders un-tokened black outside the
          .settings-surface scope that page used to fix it).
          v3.175.0 — Home moved to the last nav slot with a gear icon
          (ResumeHub.tsx), so it's reached directly now instead of via the
          account menu's old cross-tab handoff; the one-shot scroll that
          handoff needed is gone since nothing sets it anymore. */}
      <div className="pt-2">
        <h2 className="rh-display text-xl">Settings</h2>
        <p className="text-sm mt-0.5 mb-3" style={{ color: "var(--rh-muted)" }}>
          Your plan, notifications, data, and where you're signed in.
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {SETTINGS_SECTIONS.map(({ key, label, icon: Icon }) => {
            const active = settingsSection === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSettingsSection(key)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition"
                style={active
                  ? { background: "var(--rh-ink)", color: "#fff" }
                  : { background: "var(--rh-raised)", color: "var(--rh-muted)" }}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            );
          })}
        </div>

        {!session ? (
          <div className="flex items-center justify-center py-10" style={{ color: "var(--rh-faint)" }}>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {settingsSection === "account" && (
              <AccountPreferences userId={userId} userEmail={session.user.email || ""} accessToken={session.access_token} />
            )}
            {settingsSection === "notifications" && (
              <NotificationSettings userId={userId} accessToken={session.access_token} />
            )}
            {settingsSection === "privacy" && (
              <PrivacySettings userId={userId} session={session} />
            )}
            {settingsSection === "sessions" && (
              <SessionManagement userId={userId} userEmail={session.user.email || ""} accessToken={session.access_token} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
