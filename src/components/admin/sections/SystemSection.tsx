// v3.22.0 SYSTEM — everything that keeps the product running, in one place.
// Every pane is AYN branded and reads a real admin RPC.
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from './ui';
import {
  AccountsPane, SupportPane, ErrorsPane, LimitsPane,
  AiPane, EmailPane, ConsentPane, SettingsPane,
} from './system/SystemPanes';

type Pane = 'accounts' | 'support' | 'errors' | 'limits' | 'ai' | 'email' | 'consent' | 'settings';

const PANES: { id: Pane; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'support', label: 'Support' },
  { id: 'errors', label: 'Errors' },
  { id: 'limits', label: 'Rate limits' },
  { id: 'ai', label: 'AI cost' },
  { id: 'email', label: 'Email' },
  { id: 'consent', label: 'Terms consent' },
  { id: 'settings', label: 'Settings' },
];

export default function SystemSection({
  systemConfig,
  onUpdateConfig,
}: {
  systemConfig: any;
  onUpdateConfig: (updates: any) => Promise<void>;
}) {
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
      {pane === 'support' && <SupportPane />}
      {pane === 'errors' && <ErrorsPane />}
      {pane === 'limits' && <LimitsPane />}
      {pane === 'ai' && <AiPane />}
      {pane === 'email' && <EmailPane />}
      {pane === 'consent' && <ConsentPane />}
      {pane === 'settings' && <SettingsPane systemConfig={systemConfig} onUpdateConfig={onUpdateConfig} />}
    </div>
  );
}
