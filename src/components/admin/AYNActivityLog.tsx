import { useState, useEffect, useRef, useCallback } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, Mail, Trash2, AlertTriangle, Terminal, 
  RefreshCw, ChevronDown, ChevronUp, Filter, Wrench, Circle
} from 'lucide-react';
import { format } from 'date-fns';

interface ActivityLog {
  id: string;
  action_type: string;
  summary: string;
  target_id: string | null;
  target_type: string | null;
  details: Record<string, unknown> | null;
  triggered_by: string;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  // Reply-type actions
  reply: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Reply' },
  application_replied: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Reply' },
  contact_replied: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Reply' },
  ticket_auto_reply: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Reply' },
  proactive_auto_reply: { icon: MessageSquare, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Reply' },
  // Email actions
  email: { icon: Mail, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'Email' },
  email_sent: { icon: Mail, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'Email' },
  // Delete actions
  delete: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  bulk_delete: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  ticket_deleted: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  message_deleted: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  application_deleted: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  contact_deleted: { icon: Trash2, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Delete' },
  // Alert actions
  alert: { icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', label: 'Alert' },
  // Command actions
  command: { icon: Terminal, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20', label: 'Command' },
  ai_chat_actions: { icon: Terminal, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20', label: 'Command' },
  errors_cleared: { icon: Terminal, color: 'bg-violet-500/10 text-violet-500 border-violet-500/20', label: 'Command' },
  // Maintenance actions
  maintenance_activated: { icon: Wrench, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', label: 'Maintenance' },
};

const FILTER_GROUPS: Record<string, string[]> = {
  all: [],
  reply: ['reply', 'application_replied', 'contact_replied', 'ticket_auto_reply', 'proactive_auto_reply'],
  email: ['email', 'email_sent'],
  delete: ['delete', 'bulk_delete', 'ticket_deleted', 'message_deleted', 'application_deleted', 'contact_deleted'],
  alert: ['alert'],
  command: ['command', 'ai_chat_actions', 'errors_cleared'],
  maintenance: ['maintenance_activated'],
};

const FILTER_LABELS: Record<string, string> = {
  all: 'All',
  reply: 'Replies',
  email: 'Emails',
  delete: 'Deletions',
  alert: 'Alerts',
  command: 'Commands',
  maintenance: 'Maintenance',
};

const AI_EMPLOYEES: Record<string, { name: string; emoji: string }> = {
  system: { name: 'AYN (Co-Founder)', emoji: '🧠' },
  advisor: { name: 'Advisor', emoji: '📊' },
  lawyer: { name: 'Lawyer', emoji: '⚖️' },
  security_guard: { name: 'Security Guard', emoji: '🛡️' },
  sales: { name: 'Sales', emoji: '💼' },
  investigator: { name: 'Investigator', emoji: '🔍' },
  follow_up: { name: 'Follow-Up Agent', emoji: '📬' },
  customer_success: { name: 'Customer Success', emoji: '🤝' },
  qa_watchdog: { name: 'QA Watchdog', emoji: '🐕' },
  marketing: { name: 'Marketing Strategist', emoji: '📣' },
};

export const AYNActivityLog = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const liveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data: rawData, error } = await supabase.rpc('get_admin_activity_log', { p_limit: 500 });
    let data = (rawData || []).filter((r: any) => {
      if (filter !== 'all' && FILTER_GROUPS[filter] && !FILTER_GROUPS[filter].includes(r.action_type)) return false;
      if (employeeFilter !== 'all' && r.triggered_by !== employeeFilter) return false;
      return true;
    });
    if (!error && data) {
      setLogs(data as ActivityLog[]);
    }
    setLoading(false);
  }, [filter, employeeFilter]);

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel('ayn-activity-log-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ayn_activity_log' }, (payload) => {
        const newLog = payload.new as ActivityLog;
        const filterTypes = FILTER_GROUPS[filter];
        if (filter === 'all' || filterTypes?.includes(newLog.action_type)) {
          setLogs(prev => [newLog, ...prev].slice(0, 200));
        }
        // Pulse live indicator
        setIsLive(true);
        if (liveTimeout.current) clearTimeout(liveTimeout.current);
        liveTimeout.current = setTimeout(() => setIsLive(false), 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (liveTimeout.current) clearTimeout(liveTimeout.current);
    };
  }, [fetchLogs, filter]);

  const getConfig = (type: string) => ACTION_CONFIG[type] || ACTION_CONFIG.command;

  // Extract inline details based on action type
  const getInlineDetail = (log: ActivityLog): string | null => {
    const d = log.details as Record<string, unknown> | null;
    if (!d) return null;

    const type = log.action_type;

    // Replies: show the message text
    if (type.includes('replied') || type === 'reply') {
      const msg = d.message || d.reply_text || d.content;
      if (typeof msg === 'string') return `"${msg.slice(0, 120)}${msg.length > 120 ? '…' : ''}"`;
    }

    // Emails: show recipient + subject
    if (type.includes('email')) {
      const to = d.to || d.recipient;
      const subject = d.subject;
      if (to && subject) return `→ ${to} — "${subject}"`;
      if (to) return `→ ${to}`;
    }

    // Deletions: show what was deleted
    if (type.includes('deleted')) {
      const name = d.full_name || d.name || d.subject || d.content_preview;
      if (typeof name === 'string') return name.slice(0, 100);
    }

    return null;
  };

  const isDeleteAction = (type: string) => type.includes('deleted') || type === 'delete' || type === 'bulk_delete';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">AYN Activity Log</h2>
            <p className="text-sm text-muted-foreground">Everything AYN has done, in real-time</p>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <Circle className={`w-2.5 h-2.5 fill-current ${isLive ? 'text-green-500 animate-pulse' : 'text-muted-foreground/30'}`} />
            <span className={`text-xs ${isLive ? 'text-green-500' : 'text-muted-foreground/50'}`}>
              {isLive ? 'Live' : 'Idle'}
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Action type filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {Object.keys(FILTER_LABELS).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs"
          >
            {FILTER_LABELS[f]}
          </Button>
        ))}
      </div>

      {/* Employee filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Employee:</span>
        <Button
          variant={employeeFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEmployeeFilter('all')}
          className="text-xs"
        >
          All Employees
        </Button>
        {Object.entries(AI_EMPLOYEES).map(([key, { name, emoji }]) => (
          <Button
            key={key}
            variant={employeeFilter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEmployeeFilter(key)}
            className="text-xs"
          >
            {emoji} {name}
          </Button>
        ))}
      </div>

      {/* Log entries */}
      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="space-y-2 pr-4">
          {logs.length === 0 && !loading && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No activity logs found</CardContent></Card>
          )}
          {logs.map(log => {
            const config = getConfig(log.action_type);
            const Icon = config.icon;
            const isExpanded = expandedId === log.id;
            const inlineDetail = getInlineDetail(log);
            const isDeletion = isDeleteAction(log.action_type);

            return (
              <Card key={log.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg border ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          by {AI_EMPLOYEES[log.triggered_by]
                            ? `${AI_EMPLOYEES[log.triggered_by].emoji} ${AI_EMPLOYEES[log.triggered_by].name}`
                            : log.triggered_by}
                        </span>
                      </div>
                      <p className={`text-sm mt-1 font-medium ${isDeletion ? 'line-through text-red-400' : ''}`}>
                        {log.summary}
                      </p>
                      
                      {/* Inline detail */}
                      {inlineDetail && (
                        <p className={`text-xs mt-1 ${isDeletion ? 'text-red-400/70 line-through' : 'text-muted-foreground italic'}`}>
                          {inlineDetail}
                        </p>
                      )}
                      
                      {log.details && Object.keys(log.details).length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-6 px-2 text-xs text-muted-foreground"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                          Details
                        </Button>
                      )}
                      
                      {isExpanded && log.details && (
                        <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs overflow-auto max-h-40">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
