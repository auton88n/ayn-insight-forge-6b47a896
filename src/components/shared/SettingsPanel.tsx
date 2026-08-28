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
 *
 * v3.193.0 -- a QA pass right after the above shipped found two real,
 * scoped gaps, both fixed here:
 * 1. The segmented control was four plain buttons with no tab semantics
 *    at all -- a screen reader had no way to know these were related,
 *    mutually-exclusive views, or which one was selected. Real
 *    role="tablist"/role="tab"/aria-selected, a matching role="tabpanel"
 *    for the content below, and roving-tabindex arrow-key navigation
 *    (the actual expected keyboard behavior once role="tab" is used --
 *    adding the role without it would have been a worse mismatch than
 *    not using it at all).
 * 2. Because the parent conditionally renders (and so unmounts) this
 *    component when its own tab isn't active, a plain useState reset
 *    back to "account" every time someone left Settings and came back.
 *    Persisted to sessionStorage instead, the same pattern
 *    ResumeHub.tsx's own top-level tab already uses, read as the lazy
 *    initial state so a remount picks the real last section back up.
 *
 * v3.251.0 -- swapped every --rh-* token reference for its --lp-* real
 * equivalent, matching the marketing pages' actual classes instead of
 * resume-hub-theme's separate copy of the same colors. Safe for both
 * callers (ResumeHub.tsx's Home tab and EmployerHub.tsx's Settings tab):
 * both now sit under a real .lp ancestor, so --lp-* resolves correctly
 * either way, the same reason EmployerHub.tsx's other tabs (Search,
 * Proposals, Company) got the identical treatment in the same pass.
 */
import { useRef, useState } from "react";
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

const SECTION_STORAGE_KEY = "ayn_settings_section";

function readStoredSection(): SettingsSection {
  const v = sessionStorage.getItem(SECTION_STORAGE_KEY);
  return (SETTINGS_SECTIONS.some(s => s.key === v)) ? (v as SettingsSection) : "account";
}

export default function SettingsPanel({ userId, session }: Props) {
  const [settingsSection, setSettingsSectionRaw] = useState<SettingsSection>(readStoredSection);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const setSettingsSection = (next: SettingsSection) => {
    sessionStorage.setItem(SECTION_STORAGE_KEY, next);
    setSettingsSectionRaw(next);
  };

  const focusAndSelect = (index: number) => {
    const wrapped = (index + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    const next = SETTINGS_SECTIONS[wrapped];
    setSettingsSection(next.key);
    tabRefs.current[next.key]?.focus();
  };

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") { e.preventDefault(); focusAndSelect(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); focusAndSelect(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusAndSelect(0); }
    else if (e.key === "End") { e.preventDefault(); focusAndSelect(SETTINGS_SECTIONS.length - 1); }
  };

  return (
    // v3.271.0 — reported directly against a real screenshot: every card
    // here (Plan, Profile, Security) rendered as a wide, mostly-empty
    // horizontal bar, stretched full width with nothing on the page ever
    // capping it -- a couple of short lines and a button spread across
    // ~1300px reads as "spread out, no spacing," even though the actual
    // internal padding was fine. A settings page is a form, not a wide
    // dashboard grid; capped to a real reading width instead.
    <div style={{ maxWidth: 720 }}>
      <h2 className="lp-display flex items-center gap-2.5 text-xl">
        <span aria-hidden="true" style={{ width: 18, height: 3, borderRadius: 2, background: "hsl(var(--lp-ember))", flexShrink: 0 }} />
        Settings
      </h2>
      <p className="text-sm mt-1.5 mb-3" style={{ color: "hsl(var(--lp-muted))" }}>
        Your plan, notifications, data, and where you're signed in.
      </p>
      <div role="tablist" aria-label="Settings sections" className="flex items-center gap-1.5 flex-wrap mb-4">
        {SETTINGS_SECTIONS.map(({ key, label, icon: Icon }, index) => {
          const active = settingsSection === key;
          return (
            <button
              key={key}
              ref={el => { tabRefs.current[key] = el; }}
              type="button"
              role="tab"
              id={`settings-tab-${key}`}
              aria-selected={active}
              aria-controls={`settings-panel-${key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSettingsSection(key)}
              onKeyDown={e => onTabKeyDown(e, index)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition"
              style={active
                ? { background: "var(--lp-gradient-ember)", color: "#fff" }
                : { background: "hsl(var(--lp-border-soft))", color: "hsl(var(--lp-muted))" }}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          );
        })}
      </div>

      {!session ? (
        <div className="flex items-center justify-center py-10" style={{ color: "hsl(var(--lp-dim))" }}>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`settings-panel-${settingsSection}`}
          aria-labelledby={`settings-tab-${settingsSection}`}
          aria-live="polite"
          tabIndex={0}
        >
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
        </div>
      )}
    </div>
  );
}
