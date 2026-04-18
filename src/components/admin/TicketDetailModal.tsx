import { spineApi } from '@/lib/spineApi';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { spineAuth } from '@/lib/spineAuth';
import { motion } from 'framer-motion';
import { 
  X, 
  Send, 
  Bot, 
  User, 
  Shield, 
  Clock,
  Sparkles,
  StickyNote
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';

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
}

interface Message {
  id: string;
  sender_type: string;
  sender_id: string | null;
  message: string;
  is_internal_note: boolean;
  created_at: string;
}

interface TicketDetailModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen, fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);




  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      const { data: { user } } = await spineAuth.getUser();

      const { error } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          sender_type: 'admin',
          sender_id: user?.id,
          message: newMessage.trim(),
          is_internal_note: isInternalNote,
        });

      if (error) throw error;

      // Update ticket status to waiting_reply and mark as unread if it was open
      if (status === 'open' && !isInternalNote) {
        await supabase
          .from('support_tickets')
          .update({ status: 'waiting_reply', has_unread_reply: true })
          .eq('id', ticket.id);
        setStatus('waiting_reply');
      } else if (!isInternalNote) {
        // Mark as unread for any non-internal reply
        await supabase
          .from('support_tickets')
          .update({ has_unread_reply: true })
          .eq('id', ticket.id);
      }

      setNewMessage('');
      setIsInternalNote(false);
      fetchMessages();
      
      // Send email notification to user (if not internal note)
      if (!isInternalNote && ticket.guest_email) {
        try {
          await spineApi.sendTicketReply(ticketId, replyContent, userEmail);
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
      }

      toast.success(isInternalNote ? 'Internal note added' : 'Reply sent');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const updateStatus = async (newStatus: 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed') => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id);

      if (error) throw error;
      
      setStatus(newStatus);
      onUpdate();
      toast.success('Status updated');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const generateAIResponse = async () => {
    if (messages.length === 0) return;

    setIsGeneratingAI(true);
    try {
      const lastUserMessage = [...messages]
        .reverse()
        .find(m => m.sender_type === 'user')?.message || '';

      const data = await spineApi.supportBot(message, ''); const error = null;

      if (error) throw error;
      
      setNewMessage(data.answer);
      toast.success('AI draft generated');
    } catch (error) {
      console.error('Error generating AI response:', error);
      toast.error('Failed to generate AI response');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const getSenderIcon = (senderType: string) => {
    switch (senderType) {
      case 'admin': return <Shield className="h-4 w-4" />;
      case 'ai_bot': return <Bot className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const getSenderColor = (senderType: string, isInternal: boolean) => {
    if (isInternal) return 'bg-yellow-500/10 border-yellow-500/20';
    switch (senderType) {
      case 'admin': return 'bg-primary/10 border-primary/20';
      case 'ai_bot': return 'bg-purple-500/10 border-purple-500/20';
      default: return 'bg-muted border-border';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl mb-1">{ticket.subject}</DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{ticket.guest_name || 'User'}</span>
                {ticket.guest_email && (
                  <>
                    <span>•</span>
                    <span>{ticket.guest_email}</span>
                  </>
                )}
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(ticket.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {ticket.category.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {ticket.priority}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Status Selector */}
        <div className="flex items-center gap-4 py-2 border-b border-border">
          <span className="text-sm font-medium">Status:</span>
          <Select value={status} onValueChange={(val) => updateStatus(val as 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_reply">Waiting Reply</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-[300px]" ref={scrollRef}>
          <div className="space-y-4 p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No messages yet
              </div>
            ) : (
              messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${
                    message.sender_type !== 'user' ? 'justify-end' : ''
                  }`}
                >
                  {message.sender_type === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {getSenderIcon(message.sender_type)}
                    </div>
                  )}
                  
                  <div className={`max-w-[70%] rounded-xl px-4 py-3 border ${
                    getSenderColor(message.sender_type, message.is_internal_note)
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {message.is_internal_note && (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600">
                          <StickyNote className="h-3 w-3 mr-1" />
                          Internal Note
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground capitalize">
                        {message.sender_type === 'ai_bot' ? 'AI Bot' : message.sender_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>

                  {message.sender_type !== 'user' && (
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      message.sender_type === 'admin' ? 'bg-primary/10' : 'bg-purple-500/10'
                    }`}>
                      {getSenderIcon(message.sender_type)}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Reply Input */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="internal-note"
                checked={isInternalNote}
                onCheckedChange={setIsInternalNote}
              />
              <Label htmlFor="internal-note" className="text-sm">
                Internal note (not visible to user)
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generateAIResponse}
              disabled={isGeneratingAI || messages.length === 0}
              className="gap-1.5"
            >
              <Sparkles className={`h-4 w-4 ${isGeneratingAI ? 'animate-pulse' : ''}`} />
              {isGeneratingAI ? 'Generating...' : 'AI Draft'}
            </Button>
          </div>

          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isInternalNote ? "Add internal note..." : "Type your reply..."}
              rows={3}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSending}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TicketDetailModal;
