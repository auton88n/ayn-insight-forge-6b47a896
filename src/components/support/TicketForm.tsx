import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, CheckCircle, Loader2 } from 'lucide-react';
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
      // A guest submission is public by design, but it must not be a public
      // database write or email relay. support-submit validates and rate-limits
      // the request server-side, derives a signed-in person's identity from
      // their JWT, writes both rows atomically, then sends the notifications.
      const { error } = await supabase.functions.invoke('support-submit', {
        body: {
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          category: formData.category,
          message: formData.message,
        },
      });

      if (error) throw error;

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

        {/* v3.234.0 -- was a shadcn <Button>, the one control on this page
            not shaped like every other call-to-action on the site (a pill,
            .lp-btn). This is the same class every other primary action on
            Home uses, since this form now only ever renders on Contact. */}
        <button
          type="submit"
          className="lp-btn lp-btn-primary"
          style={{ width: '100%' }}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending</>
          ) : (
            <><Send className="h-4 w-4" /> Send message</>
          )}
        </button>
      </form>
    </ScrollArea>
  );
};

export default TicketForm;
