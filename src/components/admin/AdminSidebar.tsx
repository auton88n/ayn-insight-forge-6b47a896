// v3.20.0 — six sections, nothing else. Icon rail in the AYN language.
import { LayoutDashboard, Building2, Users, Handshake, DollarSign, Settings, ChevronLeft, ChevronsRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AdminTabId = 'overview' | 'employers' | 'candidates' | 'marketplace' | 'money' | 'system';

const ITEMS: { id: AdminTabId; title: string; hint: string; icon: React.ElementType }[] = [
  { id: 'overview',    title: 'Overview',    hint: 'Is the product alive',        icon: LayoutDashboard },
  { id: 'employers',   title: 'Employers',   hint: 'Approve and manage plans',    icon: Building2 },
  { id: 'candidates',  title: 'Candidates',  hint: 'Talent pool health',          icon: Users },
  { id: 'marketplace', title: 'Marketplace', hint: 'Proposals and assessments',   icon: Handshake },
  { id: 'money',       title: 'Money',       hint: 'Subscriptions and credits',   icon: DollarSign },
  { id: 'system',      title: 'System',      hint: 'Accounts, errors, settings',  icon: Settings },
];

interface Props {
  activeTab: AdminTabId;
  onSelectTab: (id: AdminTabId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  pendingEmployers?: number;
}

export const AdminSidebar = ({ activeTab, onSelectTab, isCollapsed, onToggleCollapse, pendingEmployers = 0 }: Props) => {
  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border/60 bg-card/60 flex flex-col transition-all duration-200',
        isCollapsed ? 'w-[72px]' : 'w-[220px]'
      )}
    >
      <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const badge = item.id === 'employers' && pendingEmployers > 0 ? pendingEmployers : 0;

          const button = (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors relative',
                active
                  ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                isCollapsed && 'justify-center px-0'
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!isCollapsed && (
                <span className="flex-1 text-left leading-tight">
                  {item.title}
                  <span className="block text-[11px] font-normal text-muted-foreground">{item.hint}</span>
                </span>
              )}
              {badge > 0 && (
                <Badge className={cn('bg-primary text-primary-foreground text-[10px] px-1.5', isCollapsed && 'absolute -top-0.5 right-1.5')}>
                  {badge}
                </Badge>
              )}
            </button>
          );

          return isCollapsed ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right">{item.title}</TooltipContent>
            </Tooltip>
          ) : button;
        })}
      </nav>

      <button
        onClick={onToggleCollapse}
        className="m-2.5 rounded-xl border border-border/60 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center"
      >
        {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
};
