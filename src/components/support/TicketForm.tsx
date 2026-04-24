import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TicketFormProps {
  onSuccess: () => void;
}

const TicketForm: React.FC<TicketFormProps> = ({ onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    category: 'general',
    priority: 'medium',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject.trim() || !formData.message.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user if logged in
      const { data: { user } } = await supabase.auth.getUser();

      // Create ticket
      const ticketData: Record<string, unknown> = {
        subject: formData.subject,
        category: formData.category as 'general' | 'billing' | 'technical' | 'feature_request' | 'bug_report',
        priority: formData.priority as 'low' | 'medium' | 'high' | 'urgent',
        status: 'open' as const,
      };

      if (user?.id) {
        ticketData.user_id = user.id;
        // Store email in guest_email for easier admin access (even for logged-in users)
        ticketData.guest_email = user.email;
        ticketData.guest_name = formData.name || user.email?.split('@')[0];
      } else {
        ticketData.guest_email = formData.email;
        ticketData.guest_name = formData.name;
      }

      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert(ticketData as never)
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Add initial message
      const { error: messageError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticket.id,
          sender_type: 'user',
          sender_id: user?.id || null,
          message: formData.message,
        });

      if (messageError) throw messageError;

      // Send email notification to admin (non-blocking)
      try {
        await supabase.functions.invoke('send-ticket-notification', {
          body: {
            ticketId: ticket.id,
            subject: formData.subject,
            message: formData.message,
            category: formData.category,
            priority: formData.priority,
            userName: formData.name || user?.email?.split('@')[0] || undefined,
            userEmail: formData.email || user?.email || undefined,
          },
        });
      } catch (emailError) {
        if (import.meta.env.DEV) {
          console.error('Failed to send notification email:', emailError);
        }
        // Don't fail the ticket creation if email fails
      }

      setIsSuccess(true);
      toast.success('Support ticket created successfully!');

      // Reset form after delay
      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          subject: '',
          category: 'general',
          priority: 'medium',
          message: '',
        });
        setIsSuccess(false);
        onSuccess();
      }, 2000);

    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Ticket creation error:', error);
      }
      toast.error("We couldn't submit your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full p-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4"
        >
          <CheckCircle className="h-8 w-8 text-green-500" />
        </motion.div>
        <h3 className="font-semibold text-lg mb-2">Ticket Created!</h3>
        <p className="text-sm text-muted-foreground text-center">
          We'll get back to you as soon as possible.
        </p>
      </motion.div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ticket-name">Your Name</Label>
          <Input
            id="ticket-name"
            name="ticket-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-email">Email Address</Label>
          <Input
            id="ticket-email"
            name="ticket-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-subject">Subject *</Label>
          <Input
            id="ticket-subject"
            name="ticket-subject"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            placeholder="Brief description of your issue"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="feature_request">Feature Request</SelectItem>
                <SelectItem value="bug_report">Bug Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-message">Message *</Label>
          <Textarea
            id="ticket-message"
            name="ticket-message"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Describe your issue in detail..."
            rows={4}
            required
          />
        </div>

        <Button
          type="submit"
          className="w-full gap-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>Submitting...</>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Ticket
            </>
          )}
        </Button>
      </form>
    </ScrollArea>
  );
};

export default TicketForm;
