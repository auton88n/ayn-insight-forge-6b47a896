import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  MessageSquare, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  User,
  Mail,
  Calendar,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Download,
  MoreVertical,
  Eye,
  Reply,
  XCircle,
  Inbox,
  MailOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import TicketDetailModal from './TicketDetailModal';
import ContactMessagesView from './ContactMessagesView';

interface Ticket {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2 }
  }
};

const ITEMS_PER_PAGE = 15;

const SupportManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchTickets();

    // Real-time: AYN deletions & reply inserts
    const channel = supabase
      .channel('support-realtime')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'support_tickets' }, (payload) => {
        setTickets(prev => prev.filter(t => t.id !== (payload.old as any)?.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, (payload) => {
        const updated = payload.new as Ticket;
        setTickets(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, (payload) => {
        const newTicket = payload.new as Ticket;
        setTickets(prev => [newTicket, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTickets = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_support_tickets', { p_limit: 200, p_offset: 0 });
      if (error) throw error;
      const result = data as any;
      setTickets(result?.tickets || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching tickets:', error);
      }
      toast.error("Couldn't load tickets. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'urgent': return { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: '🔴' };
      case 'high': return { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: '🟠' };
      case 'medium': return { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: '🟡' };
      default: return { color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: '🟢' };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'open': 
        return { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Open' };
      case 'in_progress': 
        return { icon: MessageSquare, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'In Progress' };
      case 'waiting_reply': 
        return { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Waiting Reply' };
      case 'resolved': 
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Resolved' };
      case 'closed':
        return { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/50', label: 'Closed' };
      default: 
        return { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/50', label: status };
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const matchesSearch = 
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.guest_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.guest_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;
      const matchesCategory = categoryFilter === 'all' || ticket.category === categoryFilter;
      
      return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
    });
  }, [tickets, searchQuery, statusFilter, priorityFilter, categoryFilter]);

  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTickets.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTickets, currentPage]);

  const totalPages = Math.ceil(filteredTickets.length / ITEMS_PER_PAGE);

  const stats = useMemo(() => ({
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    waitingReply: tickets.filter(t => t.status === 'waiting_reply').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  }), [tickets]);

  const exportToCSV = () => {
    const headers = ['Subject', 'Name', 'Email', 'Category', 'Priority', 'Status', 'Created At'];
    const csvData = filteredTickets.map(ticket => [
      ticket.subject,
      ticket.guest_name || 'N/A',
      ticket.guest_email || 'N/A',
      ticket.category,
      ticket.priority,
      ticket.status,
      new Date(ticket.created_at).toLocaleString()
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `support_tickets_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Tickets exported successfully');
  };

  const handleStatusChange = async (ticketId: string, newStatus: 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed') => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (error) throw error;
      toast.success('Status updated');
      fetchTickets();
    } catch (error) {
      toast.error("Couldn't update status. Please try again.");
    }
  };

  const isNewTicket = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
  };

  return (
    <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-serif">Support & Messages</CardTitle>
            <CardDescription>
              Manage support tickets and contact messages
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="tickets" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Tickets ({tickets.length})
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MailOpen className="h-4 w-4" />
              Contact Messages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messages" className="mt-6">
            <ContactMessagesView />
          </TabsContent>

          <TabsContent value="tickets" className="mt-6 space-y-6">
            {/* Ticket Export/Refresh buttons */}
            <div className="flex items-center justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={fetchTickets}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Open', value: stats.open, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', filter: 'open' },
            { label: 'In Progress', value: stats.inProgress, icon: MessageSquare, color: 'text-yellow-500', bg: 'bg-yellow-500/10', filter: 'in_progress' },
            { label: 'Waiting Reply', value: stats.waitingReply, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10', filter: 'waiting_reply' },
            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', filter: 'resolved' },
            { label: 'Closed', value: stats.closed, icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/50', filter: 'closed' },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setStatusFilter(stat.filter)}
              className={`bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 ${statusFilter === stat.filter ? 'ring-2 ring-primary/50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by subject, name, or email..."
              className="pl-9 bg-background/50"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] bg-background/50">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_reply">Waiting Reply</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px] bg-background/50">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🟢 Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] bg-background/50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
              <SelectItem value="bug_report">Bug Report</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tickets List */}
        <ScrollArea className="h-[550px] rounded-xl border border-border/50 bg-background/30">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : paginatedTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Inbox className="h-12 w-12 opacity-50" />
              </div>
              <p className="text-lg font-medium">No tickets found</p>
              <p className="text-sm">Try adjusting your filters or search query</p>
            </div>
          ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="p-2 space-y-2"
              >
                {paginatedTickets.map((ticket) => {
                  const statusConfig = getStatusConfig(ticket.status);
                  const priorityConfig = getPriorityConfig(ticket.priority);
                  const StatusIcon = statusConfig.icon;

                  return (
                    <motion.div
                      key={ticket.id}
                      variants={itemVariants}
                      className="group bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer"
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`p-1.5 rounded-lg ${statusConfig.bg}`}>
                              <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
                            </div>
                            <h4 className="font-medium truncate">{ticket.subject}</h4>
                            {isNewTicket(ticket.created_at) && (
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              {ticket.guest_name || 'Anonymous'}
                            </span>
                            {ticket.guest_email && (
                              <span className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5" />
                                {ticket.guest_email}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(ticket.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`${priorityConfig.color} text-xs`}>
                            {priorityConfig.icon} {ticket.priority}
                          </Badge>
                          <Badge variant="outline" className="capitalize text-xs bg-muted/30">
                            {ticket.category.replace('_', ' ')}
                          </Badge>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}>
                                <Reply className="h-4 w-4 mr-2" />
                                Reply
                              </DropdownMenuItem>
                              {ticket.status !== 'resolved' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, 'resolved'); }}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Mark Resolved
                                </DropdownMenuItem>
                              )}
                              {ticket.status !== 'closed' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(ticket.id, 'closed'); }}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Close Ticket
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredTickets.length)} of {filteredTickets.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket as { id: string; user_id: string | null; guest_email: string | null; guest_name: string | null; subject: string; category: 'general' | 'billing' | 'technical' | 'feature_request' | 'bug_report'; priority: 'low' | 'medium' | 'high' | 'urgent'; status: 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed'; created_at: string; updated_at: string; }}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={fetchTickets}
        />
      )}
    </Card>
  );
};

export default SupportManagement;
