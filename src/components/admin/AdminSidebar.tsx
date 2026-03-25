import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, DollarSign as DollarIcon, MessageCircle, UserSearch, Send as SendIcon, ShoppingBag } from 'lucide-react';
import {
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
;

interface AdminSection {
  id: AdminTabId;
  title: string;
  shortTitle: string;
  icon: React.ElementType;
  gradient: string;
  adminOnly: boolean;
  hasBadge?: boolean;
}

const mainSections: AdminSection[] = [
  { id: 'overview', title: 'Overview', shortTitle: 'Ovr', icon: LayoutDashboard, gradient: 'from-blue-500 to-cyan-500', adminOnly: true },
  { id: 'google-analytics', title: 'Analytics', shortTitle: 'Ana', icon: LineChart, gradient: 'from-green-500 to-emerald-500', adminOnly: true },
  { id: 'applications', title: 'Applications', shortTitle: 'App', icon: FileText, gradient: 'from-amber-500 to-orange-500', adminOnly: false, hasBadge: true },
  { id: 'support', title: 'Support', shortTitle: 'Sup', icon: MessageSquare, gradient: 'from-purple-500 to-pink-500', adminOnly: false },
  { id: 'users', title: 'Users', shortTitle: 'Usr', icon: Users, gradient: 'from-rose-500 to-red-500', adminOnly: true },
  { id: 'terms-consent', title: 'Terms Consent', shortTitle: 'Trms', icon: FileCheck, gradient: 'from-teal-500 to-emerald-500', adminOnly: true },
  { id: 'rate-limits', title: 'Rate Limits', shortTitle: 'Rate', icon: Shield, gradient: 'from-violet-500 to-purple-500', adminOnly: true },
  { id: 'settings', title: 'Settings', shortTitle: 'Set', icon: Settings, gradient: 'from-slate-500 to-gray-500', adminOnly: true },
];

const aiSections: AdminSection[] = [
  { id: 'ai-costs', title: 'AI Costs', shortTitle: 'Cost', icon: DollarSign, gradient: 'from-emerald-500 to-teal-500', adminOnly: true },
  { id: 'ai-limits', title: 'AI Limits', shortTitle: 'Lim', icon: Gauge, gradient: 'from-yellow-500 to-amber-500', adminOnly: true },
  { id: 'ai-assistant', title: 'AI Assistant', shortTitle: 'Asst', icon: Bot, gradient: 'from-cyan-500 to-blue-500', adminOnly: true },
  { id: 'message-feedback', title: 'Message Feedback', shortTitle: 'Fdbk', icon: ThumbsUp, gradient: 'from-rose-500 to-pink-500', adminOnly: true },
  { id: 'subscriptions', title: 'Subscriptions', shortTitle: 'Subs', icon: CreditCard, gradient: 'from-indigo-500 to-violet-500', adminOnly: true },
  { id: 'credit-history', title: 'Credit History', shortTitle: 'Gift', icon: Gift, gradient: 'from-purple-500 to-fuchsia-500', adminOnly: true },
  { id: 'beta-feedback', title: 'Beta Feedback', shortTitle: 'Beta', icon: Sparkles, gradient: 'from-amber-500 to-yellow-500', adminOnly: true },
  { id: 'test-results', title: 'Test Results', shortTitle: 'Test', icon: FlaskConical, gradient: 'from-pink-500 to-rose-500', adminOnly: true },
  { id: 'twitter-marketing', title: 'Twitter Marketing', shortTitle: 'Twtr', icon: Twitter, gradient: 'from-sky-500 to-blue-600', adminOnly: true },
  { id: 'ayn-logs', title: 'AYN Logs', shortTitle: 'Logs', icon: Activity, gradient: 'from-orange-500 to-red-500', adminOnly: true },
  { id: 'ayn-mind', title: 'AYN Mind', shortTitle: 'Mind', icon: Brain, gradient: 'from-violet-500 to-purple-600', adminOnly: true },
  { id: 'errors', title: 'Error Monitor', shortTitle: 'Err', icon: AlertTriangle, gradient: 'from-red-500 to-rose-600', adminOnly: true },
  { id: 'revenue', title: 'Revenue', shortTitle: 'Rev', icon: DollarIcon, gradient: 'from-emerald-500 to-green-600', adminOnly: true },
  { id: 'conversations', title: 'Conversations', shortTitle: 'Conv', icon: MessageCircle, gradient: 'from-blue-500 to-indigo-600', adminOnly: true },
  { id: 'user-detail', title: 'User Detail', shortTitle: 'Det', icon: UserSearch, gradient: 'from-purple-500 to-violet-600', adminOnly: true },
  { id: 'email-broadcast', title: 'Email Broadcast', shortTitle: 'Email', icon: SendIcon, gradient: 'from-cyan-500 to-blue-500', adminOnly: true },
  { id: 'nda', title: 'NDA Agreements', shortTitle: 'NDA', icon: FileText, gradient: 'from-violet-500 to-purple-600', adminOnly: true },
  { id: 'custom-orders', title: 'Custom Orders', shortTitle: 'Orders', icon: ShoppingBag, gradient: 'from-amber-500 to-orange-600', adminOnly: true },
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
  isAdmin
}: AdminSidebarProps) => {
  const filteredMainSections = mainSections.filter(s => isAdmin || !s.adminOnly);
  const filteredAiSections = isAdmin ? aiSections : [];

  const renderSectionButton = (section: AdminSection) => {
    const Icon = section.icon;
    const isActive = activeTab === section.id;
    const showBadge = section.hasBadge && newAppsCount > 0;

    const button = (
      <button
        key={section.id}
        onClick={() => onSelectTab(section.id)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 relative group",
          isActive
            ? "bg-background shadow-md border border-border"
            : "hover:bg-muted/50"
        )}
      >
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
          isActive 
            ? `bg-gradient-to-br ${section.gradient} text-white shadow-lg` 
            : "bg-muted text-muted-foreground group-hover:text-foreground"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        
        {!isCollapsed && (
          <span
            className={cn(
              "text-sm font-medium flex-1 text-left transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {section.title}
          </span>
        )}

        {showBadge && (
          <Badge 
            variant="destructive" 
            className={cn(
              "text-xs px-1.5 py-0 min-w-5 h-5 flex items-center justify-center",
              isCollapsed && "absolute -top-1 -right-1"
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
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {section.title}
            {showBadge && ` (${newAppsCount} new)`}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 64 : 220 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="relative z-30 shrink-0 min-h-0 border-r border-border bg-muted/30 backdrop-blur-sm flex flex-col"
    >
      {/* Main Sections */}
      <div className="flex-1 p-2 space-y-1 overflow-y-auto overscroll-contain min-h-0">
        {!isCollapsed && (
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Main
          </div>
        )}
        {filteredMainSections.map(renderSectionButton)}

        {/* AI Tools Section */}
        {filteredAiSections.length > 0 && (
          <>
            <div className="my-3 border-t border-border" />
            {!isCollapsed && (
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                AI Tools
              </div>
            )}
            {filteredAiSections.map(renderSectionButton)}
          </>
        )}
      </div>

      {/* Collapse Toggle */}
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
            <TooltipContent side="right">
              Expand sidebar
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </motion.aside>
  );
};
