import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { 
  Mail, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Users
} from 'lucide-react';
import { format } from 'date-fns';

interface RecipientResult {
  masked: string;
  status: 'sent' | 'failed';
  error?: string;
}

interface NotificationLog {
  id: string;
  notification_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  created_at: string;
  metadata: {
    success_count?: number;
    fail_count?: number;
    recipients?: RecipientResult[];
  } | null;
}

export const NotificationLogViewer = () => {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_notification_log');
      if (error) throw error;
      setLogs((data || []) as NotificationLog[]);
    } catch (error) {
      console.error('Failed to fetch notification logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'partial':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'failed':
        return 'bg-red-500/15 text-red-600 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'maintenance_announcement':
        return 'Maintenance';
      case 'access_request':
        return 'Access Request';
      case 'security_alert':
        return 'Security Alert';
      default:
        return type;
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            Email Notification Log
          </CardTitle>
          <CardDescription className="text-sm">
            View delivery details for sent notifications
          </CardDescription>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchLogs}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>No notification logs found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const hasRecipients = log.metadata?.recipients && log.metadata.recipients.length > 0;
                const isExpanded = expandedLog === log.id;
                
                return (
                  <Collapsible 
                    key={log.id} 
                    open={isExpanded}
                    onOpenChange={(open) => setExpandedLog(open ? log.id : null)}
                  >
                    <div className="border rounded-lg overflow-hidden bg-background/50">
                      <CollapsibleTrigger asChild>
                        <button className="w-full p-3 hover:bg-muted/30 transition-colors text-left">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {hasRecipients ? (
                                isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                )
                              ) : (
                                <div className="w-4" />
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {getTypeLabel(log.notification_type)}
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${getStatusColor(log.status)}`}
                                  >
                                    {log.status}
                                  </Badge>
                                  {log.metadata?.success_count !== undefined && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {log.metadata.success_count} sent
                                      {log.metadata.fail_count ? `, ${log.metadata.fail_count} failed` : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-medium truncate mt-1">
                                  {log.subject}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              {format(new Date(log.created_at), 'MMM d, HH:mm')}
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      
                      {hasRecipients && (
                        <CollapsibleContent>
                          <div className="border-t px-3 py-2 bg-muted/20">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Per-Recipient Delivery Details
                            </p>
                            <div className="grid gap-1.5 max-h-[200px] overflow-y-auto">
                              {log.metadata?.recipients?.map((recipient, idx) => (
                                <div 
                                  key={`${recipient.masked}-${idx}`}
                                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-background/50"
                                >
                                  <code className="text-xs font-mono">
                                    {recipient.masked}
                                  </code>
                                  <div className="flex items-center gap-2">
                                    {recipient.status === 'sent' ? (
                                      <span className="flex items-center gap-1 text-green-600 text-xs">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Sent
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 text-red-600 text-xs" title={recipient.error}>
                                        <XCircle className="w-3.5 h-3.5" />
                                        Failed
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
