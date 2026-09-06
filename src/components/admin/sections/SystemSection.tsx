// v3.22.0 SYSTEM — everything that keeps the product running, in one place.
// Every pane is AYN branded and reads a real admin RPC.
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from './ui';
import {
  AccountsPane, SupportPane, ErrorsPane, LimitsPane,
  AiPane, EmailPane, ConsentPane, CookieConsentPane, SettingsPane, ActivityPane,
  ExtDiagnosticsPane,
} from './system/SystemPanes';
import { ModerationPane, FlagsPane, CreditsPane, AdminsPane } from './system/ControlPanes';

type Pane = 'accounts' | 'credits' | 'moderation' | 'flags' | 'support' | 'errors' | 'limits' | 'ai' | 'email' | 'consent' | 'cookies' | 'settings' | 'admins' | 'activity' | 'extdiag';

const PANES: { id: Pane; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'credits', label: 'Credits' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'flags', label: 'Kill switches' },
  { id: 'support', label: 'Support' },
  { id: 'errors', label: 'Errors' },
  { id: 'limits', label: 'Rate limits' },
  { id: 'ai', label: 'AI cost' },
  // v3.113.0 — Email and Inbox merged into one pane (received + sent, one
  // click apart) so there is a single place to see everything email-related.
  { id: 'email', label: 'Email' },
  { id: 'consent', label: 'Terms consent' },
  { id: 'cookies', label: 'Cookie consent' },
  { id: 'admins', label: 'Admins' },
  { id: 'activity', label: 'Activity' },
  // v3.354.0 — the extension's own "Send diagnostics to AYN" button wrote
  // to a real table with zero readers anywhere until now.
  { id: 'extdiag', label: 'Extension reports' },
  { id: 'settings', label: 'Settings' },
];


export default function SystemSection() {
  const [pane, setPane] = useState<Pane>('accounts');


  return (
    <div>
      <SectionHeader title="System" subtitle="Accounts, support, errors, limits and configuration." />

      <div className="flex flex-wrap gap-2 mb-6">
        {PANES.map(p => (
          <button
            key={p.id}
            onClick={() => setPane(p.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-sm border transition-colors',
              pane === p.id
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-card text-muted-foreground border-border/60 hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === 'accounts' && <AccountsPane />}
      {pane === 'credits' && <CreditsPane />}
      {pane === 'moderation' && <ModerationPane />}
      {pane === 'flags' && <FlagsPane />}
      {pane === 'support' && <SupportPane />}
      {pane === 'errors' && <ErrorsPane />}
      {pane === 'limits' && <LimitsPane />}
      {pane === 'ai' && <AiPane />}
      {pane === 'email' && <EmailPane />}
      {pane === 'consent' && <ConsentPane />}
      {pane === 'cookies' && <CookieConsentPane />}
      {pane === 'admins' && <AdminsPane />}
      {pane === 'activity' && <ActivityPane />}
      {pane === 'extdiag' && <ExtDiagnosticsPane />}
      {pane === 'settings' && <SettingsPane onGoToFlags={() => setPane('flags')} />}
    </div>
  );
}
