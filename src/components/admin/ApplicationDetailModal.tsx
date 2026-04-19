import { useState, useEffect } from 'react';
import { adminApi as supabase } from '@/lib/adminApi';

interface Session { user: { id: string; email?: string }; access_token?: string }
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Mail, 
  Phone, 
  Calendar, 
  MessageSquare, 
  Clock,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  Send
} from 'lucide-react';
import { format } from 'date-fns';
import type { ServiceApplication, ApplicationReply } from './ApplicationManagement';

interface ApplicationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: ServiceApplication;
  session: Session;
  onStatusChange: (appId: string, status: string) => void;
  onReply: () => void;
  onRefresh: () => void;
}

const getServiceLabel = (type: string) => {
  switch (type) {
    case 'content_creator':
      return 'Premium Content Creator Sites';
    case 'ai_agents':
      return 'Custom AI Agents';
    case 'automation':
      return 'Process Automation';
    default:
      return type;
  }
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-500/10 text-blue-600' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-yellow-500/10 text-yellow-600' },
  { value: 'contacted', label: 'Contacted', color: 'bg-green-500/10 text-green-600' },
  { value: 'closed', label: 'Closed', color: 'bg-muted text-muted-foreground' },
];

export const ApplicationDetailModal = ({
  isOpen,
  onClose,
  application,
  session,
  onStatusChange,
  onReply,
  onRefresh,
}: ApplicationDetailModalProps) => {
  const [replies, setReplies] = useState<ApplicationReply[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(true);

  useEffect(() => {
    const fetchReplies = async () => {
      try {
        const { data, error } = await supabase
          .from('application_replies')
          .select('*')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setReplies(data || []);
      } catch (error) {
        console.error('Error fetching replies:', error);
      } finally {
        setIsLoadingReplies(false);
      }
    };

    if (isOpen) {
      fetchReplies();
    }
  }, [isOpen, application.id, session.access_token]);

  const handleStatusChange = async (newStatus: string) => {
    onStatusChange(application.id, newStatus);
  };

  const statusConfig = STATUS_OPTIONS.find(s => s.value === application.status);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pr-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">{application.full_name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {getServiceLabel(application.service_type)}
              </p>
            </div>
            <Select value={application.status} onValueChange={handleStatusChange}>
              <SelectTrigger className={`w-[140px] shrink-0 ${statusConfig?.color}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Contact Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a 
                      href={`mailto:${application.email}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {application.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">
                      {application.phone || 'Not provided'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Applied</p>
                    <p className="text-sm font-medium">
                      {format(new Date(application.created_at), 'PPP p')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Contacted</p>
                    <p className="text-sm font-medium">
                      {application.last_contacted_at 
                        ? format(new Date(application.last_contacted_at), 'PPP p')
                        : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Message */}
            {application.message && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Message
                  </h3>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm whitespace-pre-wrap">{application.message}</p>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Custom Fields */}
            {application.custom_fields && Object.keys(application.custom_fields).length > 0 && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Additional Information
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(application.custom_fields).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          <p className="text-sm font-medium">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Reply History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Reply History
                </h3>
                <Badge variant="outline">
                  {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </Badge>
              </div>
              
              {isLoadingReplies ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : replies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No replies yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {replies.map(reply => (
                    <div 
                      key={reply.id} 
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{reply.subject}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {reply.email_sent ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Sent
                            </Badge>
                          ) : reply.email_error ? (
                            <Badge variant="outline" className="text-red-600">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(reply.created_at), 'PPP p')}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {reply.message}
                      </p>
                      {reply.email_error && (
                        <p className="mt-2 text-xs text-red-500">
                          Error: {reply.email_error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onReply}>
            <Send className="w-4 h-4 mr-2" />
            Reply to Applicant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};