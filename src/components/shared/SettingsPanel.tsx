/**
 * SettingsPanel.tsx
 *
 * Shared by both ResumeHub.tsx (its "Home" tab, since v3.174.0) and
 * EmployerHub.tsx (its "Settings" tab). Previously only ResumeHub.tsx had
 * this inline -- EmployerHub's own Settings item still navigated out to
 * the standalone /settings route (Settings.tsx/SettingsLayout.tsx), which
 * was never brought inside .resume-hub-theme and rendered on plain white
 * with the generic Inter font instead of the real design system. Reported
 * directly, live: "two different designs, two different types of
 * buttons... I don't go a different page." Extracted out of HomeTab.tsx
 * (which had already solved this once for the seeker side) rather than
 * duplicated, so both surfaces share one implementation instead of two
 * that can drift apart.
 *
 * The four section components (AccountPreferences, NotificationSettings,
 * PrivacySettings, SessionManagement) are untouched -- they already read
 * --rh-* tokens with a hsl(var(--x)) fallback, so they render correctly
 * the moment they're mounted inside a .resume-hub-theme scope, which both
 * callers already are.
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

export default function SettingsPanel({ userId, session }: Props) {
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
