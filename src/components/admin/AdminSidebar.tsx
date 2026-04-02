import {
  AlertTriangle,
  DollarSign as DollarIcon,
  MessageCircle,
  UserSearch,
  Send as SendIcon,
  ShoppingBag,
  LayoutDashboard,
  LineChart,
  FileText,
  MessageSquare,
  Users,
  Shield,
  Settings,
  DollarSign,
  FileCheck,
  Gauge,
  Bot,
  FlaskConical,
  ChevronLeft,
  ChevronsRight,
  CreditCard,
  Gift,
  Sparkles,
  ThumbsUp,
  Twitter,
  Activity,
  Brain,
  FilePen,
  Notebook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AdminTabId =
  | 'overview'
  | 'google-analytics'
  | 'applications'
  | 'support'
  | 'users'
  | 'user-detail'
  | 'conversations'
  | 'rate-limits'
  | 'settings'
  | 'ai-costs'
  | 'ai-limits'
  | 'ai-assistant'
  | 'test-results'
  | 'subscriptions'
  | 'credit-history'
  | 'beta-feedback'
  | 'message-feedback'
  | 'twitter-marketing'
  | 'terms-consent'
  | 'ayn-logs'
  | 'ayn-mind'
  | 'errors'
  | 'revenue'
  | 'email-broadcast'
  | 'custom-orders'
  | 'nda'
  | 'document-studio';

interface AdminSection {
  id: AdminTabId;
  title: string;
  icon: React.ElementType;
  gradient: string;
  adminOnly: boolean;
  hasBadge?: boolean;
}

interface SidebarGroup {
  label: string;
  adminOnly: boolean;
  items: AdminSection[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Overview',
    adminOnly: true,
    items: [
      { id: 'overview',          title: 'Dashboard',        icon: LayoutDashboard, gradient: 'from-blue-500 to-cyan-500',       adminOnly: true },
      { id: 'google-analytics',  title: 'Analytics',        icon: LineChart,       gradient: 'from-green-500 to-emerald-500',   adminOnly: true },
      { id: 'revenue',           title: 'Revenue',          icon: DollarIcon,      gradient: 'from-emerald-500 to-green-600',   adminOnly: true },
    ],
  },
  {
    label: 'Users & Access',
    adminOnly: true,
    items: [
      { id: 'users',            title: 'Users',             icon: Users,      gradient: 'from-rose-500 to-red-500',         adminOnly: true },
      { id: 'subscriptions',    title: 'Subscriptions',     icon: CreditCard, gradient: 'from-indigo-500 to-violet-500',   adminOnly: true },
      { id: 'credit-history',   title: 'Credit History',    icon: Gift,       gradient: 'from-purple-500 to-fuchsia-500',  adminOnly: true },
      { id: 'applications',     title: 'Applications',      icon: FileText,   gradient: 'from-amber-500 to-orange-500',    adminOnly: false, hasBadge: true },
      { id: 'terms-consent',    title: 'Terms Consent',     icon: FileCheck,  gradient: 'from-teal-500 to-emerald-500',    adminOnly: true },
      { id: 'rate-limits',      title: 'Rate Limits',       icon: Shield,     gradient: 'from-violet-500 to-purple-500',   adminOnly: true },
    ],
  },
  {
    label: 'Engagement',
    adminOnly: false,
    items: [
      { id: 'support',           title: 'Support',           icon: MessageSquare, gradient: 'from-purple-500 to-pink-500',    adminOnly: false },
      { id: 'conversations',     title: 'Conversations',     icon: MessageCircle, gradient: 'from-blue-500 to-indigo-600',    adminOnly: true },
      { id: 'email-broadcast',   title: 'Email Broadcast',   icon: SendIcon,      gradient: 'from-cyan-500 to-blue-500',      adminOnly: true },
      { id: 'twitter-marketing', title: 'Twitter Marketing', icon: Twitter,       gradient: 'from-sky-500 to-blue-600',       adminOnly: true },
      { id: 'beta-feedback',     title: 'Beta Feedback',     icon: Sparkles,      gradient: 'from-amber-500 to-yellow-500',   adminOnly: true },
      { id: 'message-feedback',  title: 'Message Feedback',  icon: ThumbsUp,      gradient: 'from-rose-500 to-pink-500',      adminOnly: true },
    ],
  },
  {
    label: 'Documents',
    adminOnly: true,
    items: [
      { id: 'custom-orders',    title: 'Custom Orders',     icon: ShoppingBag, gradient: 'from-amber-500 to-orange-600',  adminOnly: true },
      { id: 'nda',              title: 'NDA Agreements',    icon: FilePen,     gradient: 'from-violet-500 to-purple-600', adminOnly: true },
      { id: 'document-studio',  title: 'Document Studio',   icon: Notebook,    gradient: 'from-blue-500 to-indigo-500',   adminOnly: true },
    ],
  },
  {
    label: 'System',
    adminOnly: true,
    items: [
      { id: 'ai-costs',      title: 'AI Costs',       icon: DollarSign,    gradient: 'from-emerald-500 to-teal-500',  adminOnly: true },
      { id: 'ai-limits',     title: 'AI Limits',      icon: Gauge,         gradient: 'from-yellow-500 to-amber-500',  adminOnly: true },
      { id: 'ai-assistant',  title: 'AI Assistant',   icon: Bot,           gradient: 'from-cyan-500 to-blue-500',     adminOnly: true },
      { id: 'ayn-logs',      title: 'AYN Logs',       icon: Activity,      gradient: 'from-orange-500 to-red-500',    adminOnly: true },
      { id: 'ayn-mind',      title: 'AYN Mind',       icon: Brain,         gradient: 'from-violet-500 to-purple-600', adminOnly: true },
      { id: 'errors',        title: 'Error Monitor',  icon: AlertTriangle, gradient: 'from-red-500 to-rose-600',      adminOnly: true },
      { id: 'test-results',  title: 'Test Results',   icon: FlaskConical,  gradient: 'from-pink-500 to-rose-500',     adminOnly: true },
      { id: 'settings',      title: 'Settings',       icon: Settings,      gradient: 'from-slate-500 to-gray-500',    adminOnly: true },
    ],
  },
];

interface AdminSidebarProps {
  activeTab: AdminTabId;
  onSelectTab: (tab: AdminTabId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  newAppsCount?: number;
  isAdmin: boolean;
}

export const AdminSidebar = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  newAppsCount = 0,
  isAdmin,
}: AdminSidebarProps) => {
  const renderItem = (section: AdminSection) => {
    const Icon = section.icon;
    const isActive = activeTab === section.id;
    const showBadge = section.hasBadge && newAppsCount > 0;

    const button = (
      <button
        key={section.id}
        onClick={() => onSelectTab(section.id)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors duration-150 relative group',
          isActive ? 'bg-background shadow-sm border border-border' : 'hover:bg-muted/50'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 shrink-0',
            isActive
              ? `bg-gradient-to-br ${section.gradient} text-white shadow-md`
              : 'bg-muted text-muted-foreground group-hover:text-foreground'
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        {!isCollapsed && (
          <span
            className={cn(
              'text-sm font-medium flex-1 text-left truncate transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {section.title}
          </span>
        )}

        {showBadge && (
          <Badge
            variant="destructive"
            className={cn(
              'text-xs px-1.5 py-0 min-w-5 h-5 flex items-center justify-center shrink-0',
              isCollapsed && 'absolute -top-1 -right-1'
            )}
          >
            {newAppsCount}
          </Badge>
        )}
      </button>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={section.id} delayDuration={0}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {section.title}
            {showBadge && ` (${newAppsCount} new)`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  const visibleGroups = sidebarGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isAdmin || !item.adminOnly),
    }))
    .filter((group) => group.items.length > 0 && (isAdmin || !group.adminOnly));

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 60 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="relative z-30 shrink-0 min-h-0 border-r border-border bg-muted/30 backdrop-blur-sm flex flex-col"
    >
      <div className="flex-1 p-2 space-y-0.5 overflow-y-auto overscroll-contain min-h-0">
        {visibleGroups.map((group, groupIdx) => (
          <div key={group.label}>
            {/* Group divider (not before first group) */}
            {groupIdx > 0 && <div className="my-2 border-t border-border/60" />}

            {/* Group label */}
            {!isCollapsed && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest select-none">
                {group.label}
              </div>
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </div>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="w-full justify-center hover:bg-background/50"
            >
              {isCollapsed ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  <span className="text-xs">Collapse</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          {isCollapsed && (
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          )}
        </Tooltip>
      </div>
    </motion.aside>
  );
};
