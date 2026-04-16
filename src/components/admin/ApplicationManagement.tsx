import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Session } from '@supabase/supabase-js';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { 
  Search, 
  Download, 
  MoreVertical,
  Filter,
  Eye,
  Mail,
  CheckCircle,
  Clock,
  MessageSquare,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { ApplicationDetailModal } from './ApplicationDetailModal';
import { ReplyModal } from './ReplyModal';

export interface ServiceApplication {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  service_type: string;
  status: string;
  custom_fields: Record<string, unknown> | null;
  assigned_to: string | null;
  email_sent: boolean | null;
  email_error: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationReply {
  id: string;
  application_id: string;
  subject: string;
  message: string;
  sent_by: string | null;
  email_sent: boolean | null;
  email_error: string | null;
  created_at: string;
}

interface ApplicationManagementProps {
  session: Session;
  applications: ServiceApplication[];
  onRefresh: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.2 }
  }
};

const SERVICE_TYPES = [
  { value: 'all', label: 'All Services' },
  { value: 'content_creator', label: 'Content Creator Sites' },
  { value: 'ai_agents', label: 'AI Agents' },
  { value: 'automation', label: 'Automation' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'new':
      return { icon: Sparkles, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', dot: 'bg-blue-500' };
    case 'reviewed':
      return { icon: Eye, color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', dot: 'bg-amber-500' };
    case 'contacted':
      return { icon: MessageSquare, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: 'bg-emerald-500' };
    case 'closed':
      return { icon: CheckCircle, color: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
    default:
      return { icon: Clock, color: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
  }
};

const getServiceLabel = (type: string) => {
  switch (type) {
    case 'content_creator':
      return 'Content Creator';
    case 'ai_agents':
      return 'AI Agents';
    case 'automation':
      return 'Automation';
    default:
      return type;
  }
};

const ITEMS_PER_PAGE = 20;

export const ApplicationManagement = ({ session, applications, onRefresh }: ApplicationManagementProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplication, setSelectedApplication] = useState<ServiceApplication | null>(null);
  const [replyingTo, setReplyingTo] = useState<ServiceApplication | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time: auto-refresh when AYN acts on applications
  useEffect(() => {
    const channel = supabase
      .channel('applications-realtime')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'service_applications' }, () => onRefresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'application_replies' }, () => onRefresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_applications' }, () => onRefresh())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onRefresh]);

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      const matchesSearch = 
        app.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.phone?.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      const matchesService = serviceFilter === 'all' || app.service_type === serviceFilter;
      
      return (matchesSearch || !searchQuery) && matchesStatus && matchesService;
    });
  }, [applications, searchQuery, statusFilter, serviceFilter]);

  const paginatedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredApplications.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredApplications, currentPage]);

  const totalPages = Math.ceil(filteredApplications.length / ITEMS_PER_PAGE);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const handleStatusChange = useCallback(async (appId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('service_applications')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appId);
      if (error) throw error;
      toast.success(`Status updated to ${newStatus}`);
      onRefresh();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }, [onRefresh]);

  const handleViewApplication = (app: ServiceApplication) => {
    if (app.status === 'new') {
      handleStatusChange(app.id, 'reviewed');
    }
    
    // Security: Log individual application detail access
    /* spine */;
    
    setSelectedApplication(app);
  };

  const exportApplications = () => {
    const csv = [
      ['Name', 'Email', 'Phone', 'Service', 'Status', 'Message', 'Date'],
      ...filteredApplications.map(app => [
        app.full_name,
        app.email,
        app.phone || '',
        getServiceLabel(app.service_type),
        app.status,
        app.message?.replace(/,/g, ';') || '',
        format(new Date(app.created_at), 'yyyy-MM-dd HH:mm'),
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newCount = applications.filter(a => a.status === 'new').length;

  return (
    <>
      <Card className="relative overflow-hidden border border-border/50 shadow-lg bg-card/80 backdrop-blur-xl">
        {/* Gradient accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500/60 via-violet-500 to-violet-500/60" />
        
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                <FileText className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span>Applications</span>
                  {newCount > 0 && (
                    <Badge variant="destructive" className="text-xs animate-pulse">
                      {newCount} new
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground font-normal mt-0.5">
                  {filteredApplications.length} total
                </p>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border border-border/50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportApplications}
                className="border-border/50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/30 border-border/50"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 border-border/50">
                  <Filter className="w-4 h-4" />
                  {STATUS_OPTIONS.find(s => s.value === statusFilter)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {STATUS_OPTIONS.map(option => (
                  <DropdownMenuItem 
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 border-border/50">
                  <Filter className="w-4 h-4" />
                  {SERVICE_TYPES.find(s => s.value === serviceFilter)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SERVICE_TYPES.map(option => (
                  <DropdownMenuItem 
                    key={option.value}
                    onClick={() => setServiceFilter(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Application List */}
          <ScrollArea className="h-[450px]">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {paginatedApplications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No applications found</p>
                </div>
              ) : (
                paginatedApplications.map((app) => {
                  const statusConfig = getStatusConfig(app.status);
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <motion.div
                      key={app.id}
                      variants={itemVariants}
                      whileHover={{ x: 4 }}
                      className="group flex items-center justify-between p-4 rounded-xl border bg-muted/20 border-border/30 hover:bg-muted/40 hover:border-border/50 transition-all cursor-pointer"
                      onClick={() => handleViewApplication(app)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-500/10 flex items-center justify-center ring-2 ring-background">
                          <span className="text-sm font-medium text-violet-600">
                            {app.full_name.charAt(0).toUpperCase()}
                          </span>
                          {app.status === 'new' && (
                            <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ${statusConfig.dot} ring-2 ring-card animate-pulse`} />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate group-hover:text-primary transition-colors">
                            {app.full_name}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">{app.email}</p>
                        </div>
                        
                        <Badge variant="outline" className="shrink-0 bg-muted/50">
                          {getServiceLabel(app.service_type)}
                        </Badge>
                        
                        <Badge variant="outline" className={`shrink-0 ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {app.status}
                        </Badge>
                        
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          {format(new Date(app.created_at), 'MMM d')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewApplication(app)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReplyingTo(app)}>
                              <Mail className="w-4 h-4 mr-2" />
                              Reply
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleStatusChange(app.id, 'reviewed')}>
                              <Eye className="w-4 h-4 mr-2" />
                              Mark as Reviewed
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(app.id, 'contacted')}>
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Mark as Contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(app.id, 'closed')}>
                              <XCircle className="w-4 h-4 mr-2" />
                              Mark as Closed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="border-border/50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="border-border/50"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedApplication && (
        <ApplicationDetailModal
          isOpen={true}
          onClose={() => setSelectedApplication(null)}
          application={selectedApplication}
          session={session}
          onStatusChange={handleStatusChange}
          onReply={() => {
            setReplyingTo(selectedApplication);
            setSelectedApplication(null);
          }}
          onRefresh={onRefresh}
        />
      )}

      {/* Reply Modal */}
      {replyingTo && (
        <ReplyModal
          isOpen={true}
          onClose={() => setReplyingTo(null)}
          application={replyingTo}
          session={session}
          onSuccess={() => {
            setReplyingTo(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
};
