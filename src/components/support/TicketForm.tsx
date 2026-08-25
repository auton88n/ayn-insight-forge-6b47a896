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
    
    if (!formData.subject.trim() || !formData.message.trim() || !formData.email.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user if logged in
      const { data: { user } } = await supabase.auth.getUser();

      // Generated here rather than read back from the insert: a guest's own
      // new ticket isn't visible under any SELECT policy (there is no
      // session tying an anonymous row to the person who made it), so
      // .select() after insert fails RLS even though the insert itself is
      // allowed. Supplying our own id sidesteps needing it read back at all.
      const ticketId = crypto.randomUUID();

      // A guest has no session, so nothing server-side can tell "this
      // request is really from the person who opened this ticket" apart
      // from a secret only that browser holds. Generated the same way as
      // ticketId above and never read back from the server; required by
      // the guest branch of every write against this ticket from here on.
      const guestToken = user?.id ? undefined : crypto.randomUUID();

      // Create ticket
      const ticketData: Record<string, unknown> = {
        id: ticketId,
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
        ticketData.guest_token = guestToken;
      }

      const { error: ticketError } = await supabase
        .from('support_tickets')
        .insert(ticketData as never);

      if (ticketError) throw ticketError;

      // Add initial message
      const { error: messageError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: ticketId,
          sender_type: 'user',
          sender_id: user?.id || null,
          message: formData.message,
          guest_token: guestToken,
        });

      if (messageError) throw messageError;

      // Send email notification to admin (non-blocking)
      try {
        await supabase.functions.invoke('send-ticket-notification', {
          body: {
            ticketId,
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
      toast.success('Message sent.');

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
        <h3 className="font-semibold text-lg mb-2">Message sent</h3>
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
          <Label htmlFor="ticket-email">Email Address *</Label>
          <Input
            id="ticket-email"
            name="ticket-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john@example.com"
            required
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

        {/* Priority removed: asking a first-time visitor to self-rate their
            own message before anyone has read it put the wrong person in
            charge of triage. Whoever answers can set that once they read
            it; the field still ships with the ticket (formData.priority),
            just at a fixed 'medium' default, never shown. Category kept,
            but relabeled to what a visitor would actually think in, not
            the raw admin-panel term. */}
        <div className="space-y-2">
          <Label>What's this about?</Label>
          <Select
            value={formData.category}
            onValueChange={(value) => setFormData({ ...formData, category: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">Something else</SelectItem>
              <SelectItem value="billing">Billing or a plan</SelectItem>
              <SelectItem value="technical">Something isn't working</SelectItem>
              <SelectItem value="feature_request">An idea or request</SelectItem>
              <SelectItem value="bug_report">A bug</SelectItem>
            </SelectContent>
          </Select>
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
            <>Sending...</>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send message
            </>
          )}
        </Button>
      </form>
    </ScrollArea>
  );
};

export default TicketForm;
