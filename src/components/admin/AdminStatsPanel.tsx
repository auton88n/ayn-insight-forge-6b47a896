import { motion } from 'framer-motion';
import { 
  Activity, 
  TestTube, 
  ShieldAlert, 
  Ticket, 
  Zap, 
  Calculator,
  ChevronDown,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';

export interface QuickStats {
  systemHealth: number;
  testPassRate: number;
  blockedUsers: number;
  openTickets: number;
  llmFallbackRate: number;
  calcUsage24h: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  status: 'green' | 'yellow' | 'red' | 'neutral';
  onClick?: () => void;
}

const StatCard = ({ label, value, icon: Icon, status, onClick }: StatCardProps) => {
  const statusColors = {
    green: 'text-green-500 bg-green-500/10 border-green-500/20',
    yellow: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    red: 'text-red-500 bg-red-500/10 border-red-500/20',
    neutral: 'text-muted-foreground bg-muted border-border'
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-3 rounded-lg border transition-colors",
        "hover:bg-accent/50 cursor-pointer",
        statusColors[status]
      )}
    >
      <Icon className="w-4 h-4 mb-1" />
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-[10px] opacity-70">{label}</span>
    </motion.button>
  );
};

interface AdminStatsPanelProps {
  stats: QuickStats | null;
  isLoading: boolean;
  onStatClick: (query: string) => void;
  onRefresh: () => void;
}

export function AdminStatsPanel({ stats, isLoading, onStatClick, onRefresh }: AdminStatsPanelProps) {
  const getHealthStatus = (value: number): 'green' | 'yellow' | 'red' => {
    if (value >= 95) return 'green';
    if (value >= 80) return 'yellow';
    return 'red';
  };

  const getPassRateStatus = (value: number): 'green' | 'yellow' | 'red' => {
    if (value >= 90) return 'green';
    if (value >= 70) return 'yellow';
    return 'red';
  };

  const getBlockedStatus = (value: number): 'green' | 'yellow' | 'red' => {
    if (value === 0) return 'green';
    if (value <= 3) return 'yellow';
    return 'red';
  };

  const getTicketStatus = (value: number): 'green' | 'yellow' | 'red' | 'neutral' => {
    if (value === 0) return 'green';
    if (value <= 5) return 'yellow';
    return 'red';
  };

  const getFallbackStatus = (value: number): 'green' | 'yellow' | 'red' => {
    if (value <= 5) return 'green';
    if (value <= 15) return 'yellow';
    return 'red';
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 p-3 border-b border-border bg-muted/30">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <Collapsible defaultOpen>
      <div className="border-b border-border bg-muted/30">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="w-4 h-4 text-primary" />
            <span>Live System Stats</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="p-1 hover:bg-accent rounded-md transition-colors"
              title="Refresh stats"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="grid grid-cols-3 gap-2 p-3">
            <StatCard
              label="System Health"
              value={`${stats.systemHealth}%`}
              icon={Activity}
              status={getHealthStatus(stats.systemHealth)}
              onClick={() => onStatClick("Tell me about current system health and any issues")}
            />
            <StatCard
              label="Test Pass Rate"
              value={`${stats.testPassRate}%`}
              icon={TestTube}
              status={getPassRateStatus(stats.testPassRate)}
              onClick={() => onStatClick("Show me test results breakdown by suite")}
            />
            <StatCard
              label="Blocked Users"
              value={stats.blockedUsers}
              icon={ShieldAlert}
              status={getBlockedStatus(stats.blockedUsers)}
              onClick={() => onStatClick("Show me blocked users and why they were blocked")}
            />
            <StatCard
              label="Open Tickets"
              value={stats.openTickets}
              icon={Ticket}
              status={getTicketStatus(stats.openTickets)}
              onClick={() => onStatClick("How many support tickets are open?")}
            />
            <StatCard
              label="LLM Fallback"
              value={`${stats.llmFallbackRate}%`}
              icon={Zap}
              status={getFallbackStatus(stats.llmFallbackRate)}
              onClick={() => onStatClick("Why is the LLM fallback rate what it is?")}
            />
            <StatCard
              label="Calc Usage 24h"
              value={stats.calcUsage24h}
              icon={Calculator}
              status="neutral"
              onClick={() => onStatClick("Show engineering calculator usage breakdown")}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
