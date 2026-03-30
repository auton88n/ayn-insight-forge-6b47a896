import { useState, useCallback, useEffect } from 'react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { Send, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Segment = 'all' | 'active' | 'inactive' | 'paid' | 'free';

const SEGMENTS = [
  { id: 'all' as Segment, label: 'All Users', desc: 'Everyone' },
  { id: 'active' as Segment, label: 'Active', desc: 'Used in last 7 days' },
  { id: 'inactive' as Segment, label: 'Inactive', desc: 'No activity in 30d' },
  { id: 'paid' as Segment, label: 'Paid', desc: 'Non-free plans' },
  { id: 'free' as Segment, label: 'Free', desc: 'Free tier only' },
];

export const EmailBroadcast = () => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [recipients, setRecipients] = useState<{ email: string; name: string }[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const loadRecipients = useCallback(async (seg: Segment) => {
    setLoadingRecipients(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_email_broadcast_users');
      if (error) throw error;
      const all = (Array.isArray(data) ? data : []) as any[];
      let filtered = all;
      if (seg === 'active') filtered = all.filter(u => (u.messages_7d ?? 0) > 0);
      else if (seg === 'inactive') filtered = all.filter(u => (u.total_messages ?? 0) > 0 && (u.messages_30d ?? 0) === 0);
      else if (seg === 'paid') filtered = all.filter(u => u.subscription_tier !== 'free');
      else if (seg === 'free') filtered = all.filter(u => u.subscription_tier === 'free');
      setRecipients(filtered.filter((u: any) => u.email).map((u: any) => ({
        email: u.email,
        name: u.display_name || u.email.split('@')[0],
      })));
    } catch (e: any) {
      toast.error('Failed to load recipients: ' + e.message);
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  useEffect(() => { loadRecipients('all'); }, [loadRecipients]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body required'); return; }
    if (recipients.length === 0) { toast.error('No recipients'); return; }
    if (!confirm(`Send to ${recipients.length} users?`)) return;
    setSending(true);
    let ok = 0;
    try {
      for (let i = 0; i < recipients.length; i += 10) {
        await Promise.allSettled(recipients.slice(i, i + 10).map(r =>
          supabase.functions.invoke('send-email', {
            body: { to: r.email, emailType: 'broadcast', data: { userName: r.name, subject, message: body } }
          }).then(res => { if (!res.error) ok++; })
        ));
      }
      toast.success(`Sent to ${ok}/${recipients.length}`);
      setSent(true); setSubject(''); setBody('');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSending(false); }
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-400" />Email Broadcast
          </h3>
          <p className="text-white/30 text-sm">Send emails to your users via segments</p>
        </div>
        {sent && <div className="flex items-center gap-1.5 text-green-400 text-sm"><CheckCircle className="w-4 h-4" />Sent!</div>}
      </div>

      <div>
        <Label className="text-white/40 text-xs mb-2 block">Audience Segment</Label>
        <div className="flex gap-2 flex-wrap">
          {SEGMENTS.map(s => (
            <button key={s.id} onClick={() => { setSegment(s.id); loadRecipients(s.id); }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${segment === s.id ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
              <div>{s.label}</div><div className="font-normal opacity-60">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-white/40 text-xs">{loadingRecipients ? 'Loading...' : `${recipients.length} recipients`}</Label>
          <button onClick={() => loadRecipients(segment)} disabled={loadingRecipients} className="text-white/40 hover:text-white/70 text-xs">Refresh</button>
        </div>
        {recipients.length > 0 && (
          <div className="bg-white/3 border border-white/8 rounded-xl p-3 max-h-24 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {recipients.slice(0, 20).map((r, i) => (
                <span key={i} className="text-xs bg-white/8 text-white/60 px-2 py-0.5 rounded-full">{r.name || r.email}</span>
              ))}
              {recipients.length > 20 && <span className="text-xs text-white/30 px-2 py-0.5">+{recipients.length - 20} more</span>}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-white/40 text-xs mb-1.5 block">Subject</Label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your message subject..."
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
        </div>
        <div>
          <Label className="text-white/40 text-xs mb-1.5 block">Message Body</Label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message here..."
            rows={8} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-2 bg-white/3 border border-white/8 rounded-lg px-3 py-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-white/50 text-xs">Resend Connected</span>
        </div>
        <div className="flex items-center gap-1.5 text-white/25 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>From <code className="bg-white/5 px-1 rounded">noreply@mail.aynn.io</code></span>
        </div>
        <Button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim() || recipients.length === 0}
          className="ml-auto bg-blue-600 hover:bg-blue-500 text-white gap-2">
          <Send className="w-4 h-4" />
          {sending ? 'Sending...' : `Send to ${recipients.length} users`}
        </Button>
      </div>
    </div>
  );
};
