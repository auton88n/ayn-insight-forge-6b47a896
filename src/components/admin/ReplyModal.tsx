import { spineApi } from '@/lib/spineApi';
import { useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Send, Eye, Loader2 } from 'lucide-react';
import type { ServiceApplication } from './ApplicationManagement';

interface ReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: ServiceApplication;
  session: Session;
  onSuccess: () => void;
}

const getServiceLabel = (type: string) => {
  switch (type) {
    case 'content_creator':
      return 'Content Creator Sites';
    case 'ai_agents':
      return 'AI Agents';
    case 'automation':
      return 'Automation';
    default:
      return type;
  }
};

export const ReplyModal = ({
  isOpen,
  onClose,
  application,
  session,
  onSuccess,
}: ReplyModalProps) => {
  const [subject, setSubject] = useState(
    `Re: Your ${getServiceLabel(application.service_type)} Application`
  );
  const [message, setMessage] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);

    try {
      const data: any = await spineApi.sendReplyEmail(application.id, message, application.email);

      if (data?.success !== false) {
        toast.success('Reply sent successfully');
        onSuccess();
      } else {
        throw new Error(data?.error || 'Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reply to {application.full_name}</DialogTitle>
          <DialogDescription>
            Send a reply to {application.email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reply-subject">Subject</Label>
            <Input
              id="reply-subject"
              name="reply-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reply-message">Message</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="reply-preview" className="text-sm font-normal">
                  Preview
                </Label>
                <Switch
                  id="reply-preview"
                  checked={isPreview}
                  onCheckedChange={setIsPreview}
                />
              </div>
            </div>

            {isPreview ? (
              <div className="min-h-[200px] p-4 rounded-lg border bg-muted/50">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap">{message || 'No message entered'}</p>
                </div>
              </div>
            ) : (
              <Textarea
                id="reply-message"
                name="reply-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                className="min-h-[200px] resize-none"
              />
            )}
          </div>

          {/* Email Preview Card */}
          {isPreview && (
            <div className="p-4 rounded-lg border bg-card space-y-3">
              <p className="text-xs text-muted-foreground uppercase font-semibold">
                Email Preview
              </p>
              <div className="space-y-1 text-sm">
                <p><strong>To:</strong> {application.email}</p>
                <p><strong>From:</strong> noreply@aynn.io</p>
                <p><strong>Reply-To:</strong> info@aynn.io</p>
                <p><strong>Subject:</strong> {subject}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          {isPreview ? (
            <Button onClick={() => setIsPreview(false)} variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : null}
          <Button onClick={handleSend} disabled={isSending || !message.trim()}>
            {isSending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {isSending ? 'Sending...' : 'Send Reply'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};