import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Ticket, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

interface TicketListProps {
  onNewTicket: () => void;
  onSelectTicket: (ticketId: string) => void;
}

interface SupportTicket {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  created_at: string;
  updated_at: string;
  has_unread_reply: boolean;
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  in_progress: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  waiting_reply: 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  resolved: 'bg-green-500/20 text-green-600 dark:text-green-400',
  closed: 'bg-muted text-muted-foreground',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_reply: 'Response Received',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function TicketList({ onNewTicket, onSelectTicket }: TicketListProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Ticket className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-lg mb-2">No Tickets Yet</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Create your first support ticket to get help from our team.
        </p>
        <Button onClick={onNewTicket} className="gap-2">
          <Plus className="w-4 h-4" />
          Create First Ticket
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/50">
        <Button onClick={onNewTicket} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {tickets.map((ticket, index) => (
            <motion.button
              key={ticket.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelectTicket(ticket.id)}
              className="w-full text-left p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-border/30 hover:border-border/50"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {ticket.has_unread_reply && (
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  )}
                  <h4 className="font-medium text-sm line-clamp-2">{ticket.subject}</h4>
                </div>
                <Badge variant="secondary" className={`text-xs shrink-0 ${statusColors[ticket.status]}`}>
                  {statusLabels[ticket.status]}
                </Badge>
              </div>
              
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(ticket.created_at), 'MMM d, yyyy')}
                </span>
                {ticket.priority === 'urgent' || ticket.priority === 'high' ? (
                  <span className="flex items-center gap-1 text-orange-500">
                    <AlertCircle className="w-3 h-3" />
                    {ticket.priority}
                  </span>
                ) : null}
              </div>
            </motion.button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
