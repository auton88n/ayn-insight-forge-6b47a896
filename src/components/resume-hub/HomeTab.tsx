/**
 * HomeTab.tsx — v3.3.0 "Home replaces Overview"
 *
 * v3.174.0 — reported directly: "the settings needs to be in home page
 * have everything," after the account menu was trimmed down to a single
 * Settings item that still navigated away to a separate /settings route.
 * The same four sections that page has always held (Account,
 * Notifications, Privacy, Sessions -- src/components/settings/*, none of
 * them rewritten, just reused here) render inline, so nothing about
 * managing the account means leaving Resume Hub. The standalone /settings
 * route is untouched, not deleted -- EmployerHub's own account menu still
 * points there, and it's still reachable directly.
 *
 * v3.179.0 — reported directly, plainly: "the settings needs to remove
 * next just settings." Home used to lead with a "Next" section (up to
 * four onboarding/next-action cards) above the settings sections merged
 * in above -- with Home now the last nav item, carrying a gear icon, and
 * reached deliberately rather than being the landing tab (Browse jobs is,
 * per readStoredTab in ResumeHub.tsx), "Next"'s own job -- surfacing what
 * to do first -- had already stopped being this tab's actual job. Cut
 * outright rather than kept smaller: this tab is Settings now, not
 * Settings-plus-onboarding-nudges. loadHubSnapshot and the whole Action-
 * card model that only ever fed "Next" go with it, along with the
 * onOpenProfile/onOpenJobs/onOpenProposals props that existed solely to
 * power those cards' own buttons (ResumeHub.tsx updated to match).
 */
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2, User, Mail, Shield, Monitor } from "lucide-react";
import { AccountPreferences } from "@/components/settings/AccountPreferences";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { SessionManagement } from "@/components/settings/SessionManagement";

interface Props {
  userId: string;
  session: Session | null;
}

type SettingsSection = "account" | "notifications" | "privacy" | "sessions";
const SETTINGS_SECTIONS: { key: SettingsSection; label: string; icon: typeof User }[] = [
  { key: "account", label: "Account", icon: User },
  { key: "notifications", label: "Notifications", icon: Mail },
  { key: "privacy", label: "Privacy", icon: Shield },
  { key: "sessions", label: "Sessions", icon: Monitor },
];

export default function HomeTab({ userId, session }: Props) {
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("account");

  return (
    <div>
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
  );
}
