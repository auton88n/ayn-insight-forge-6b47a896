import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Send, Users, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Segment = 'all' | 'active' | 'inactive' | 'paid' | 'free';

export const EmailBroadcast = () => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [preview, setPreview] = useState<{ email: string; name: string }[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Auto-load on mount and segment change
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const { data } = await supabase.from('admin_users_view').select('email, display_name, subscription_tier, messages_7d, messages_30d, total_messages');
      const all = (data || []) as any[];
      let filtered = all;
      if (segment === 'active') filtered = all.filter(u => u.messages_7d > 0);
      else if (segment === 'inactive') filtered = all.filter(u => u.total_messages > 0 && u.messages_30d === 0);
      else if (segment === 'paid') filtered = all.filter(u => u.subscription_tier !== 'free');
      else if (segment === 'free') filtered = all.filter(u => u.subscription_tier === 'free');
      setPreview(filtered.map(u => ({ email: u.email, name: u.display_name })));
    } finally { setLoadingPreview(false); }
  }, [segment]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body are required'); return; }
    if (preview.length === 0) { toast.error('Load recipients first'); return; }
    if (!confirm(`Send to ${preview.length} users? This cannot be undone.`)) return;

    setSending(true);
    try {
      // Use send-email edge function for each recipient
      let successCount = 0;
      // Batch in groups of 10 to avoid timeouts
      for (let i = 0; i < preview.length; i += 10) {
        const batch = preview.slice(i, i + 10);
        await Promise.allSettled(batch.map(r =>
          supabase.functions.invoke('send-email', {
            body: {
              to: r.email,
              emailType: 'broadcast',
              data: { userName: r.name, subject, message: body }
            }
          }).then(res => { if (!res.error) successCount++; })
        ));
      }
      toast.success(`Sent to ${successCount} of ${preview.length} recipients`);
      setSent(true);
      setSubject(''); setBody(''); setPreview([]);
    } catch (e: any) {
      toast.error('Send failed: ' + e.message);
    } finally { setSending(false); }
  };

  const SEGMENTS = [
    { id: 'all', label: 'All Users', desc: 'Everyone' },
    { id: 'active', label: 'Active', desc: 'Used in last 7 days' },
    { id: 'inactive', label: 'Inactive', desc: 'No activity in 30d' },
    { id: 'paid', label: 'Paid', desc: 'Non-free plans' },
    { id: 'free', label: 'Free', desc: 'Free tier only' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2"><Mail className="w-4 h-4 text-blue-400" />Email Broadcast</h3>
          <p className="text-white/30 text-xs">Send emails to your users via segments</p>
        </div>
        {sent && <div className="flex items-center gap-1.5 text-green-400 text-sm"><CheckCircle className="w-4 h-4" />Email sent!</div>}
      </div>

      {/* Segment picker */}
      <div>
        <Label className="text-white/40 text-xs mb-2 block">Audience Segment</Label>
        <div className="flex gap-2 flex-wrap">
          {SEGMENTS.map(s => (
            <button key={s.id} onClick={() => { setSegment(s.id); setPreview([]); }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${segment === s.id ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/8'}`}>
              <div>{s.label}</div>
              <div className="font-normal opacity-60">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-white/40 text-xs">Recipients</Label>
          <Button variant="ghost" size="sm" onClick={loadPreview} disabled={loadingPreview}
            className="text-white/50 hover:text-white text-xs h-7">
            {loadingPreview ? 'Loading...' : preview.length > 0 ? `${preview.length} recipients loaded` : 'Load recipients'}
          </Button>
        </div>
        {preview.length > 0 && (
          <div className="bg-white/3 border border-white/8 rounded-xl p-3 max-h-28 overflow-y-auto">
            <div className="flex flex-wrap gap-1.5">
              {preview.slice(0, 20).map((r, i) => (
                <span key={i} className="text-xs bg-white/8 text-white/60 px-2 py-0.5 rounded-full">{r.name || r.email}</span>
              ))}
              {preview.length > 20 && <span className="text-xs text-white/30 px-2 py-0.5">+{preview.length - 20} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="space-y-3">
        <div>
          <Label className="text-white/40 text-xs mb-1.5 block">Subject</Label>
          <Input value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="Your message subject..." className="bg-white/5 border-white/10 text-white placeholder-white/30" />
        </div>
        <div>
          <Label className="text-white/40 text-xs mb-1.5 block">Message Body</Label>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            placeholder="Write your message here..."
            rows={8} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 resize-none" />
        </div>
      </div>

      {/* Resend setup guide */}
      <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-blue-400 text-sm font-medium">Set up Resend to send emails</span>
        </div>
        <div className="space-y-1.5 text-xs">
          {[
            { step: '1', text: 'Go to resend.com → Create account → API Keys', code: null },
            { step: '2', text: 'Create a new API Key', code: null },
            { step: '3', text: 'In Supabase → Settings → Edge Functions → Secrets, add:', code: 'RESEND_API_KEY = re_...' },
            { step: '4', text: 'In Resend → Domains, verify your domain:', code: 'mail.aynn.io' },
          ].map(({ step, text, code }) => (
            <div key={step} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{step}</span>
              <span className="text-white/50">{text} {code && <code className="bg-white/5 text-white/70 px-1 rounded font-mono">{code}</code>}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-white/25 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Emails sent from <code className="bg-white/5 px-1 rounded">noreply@mail.aynn.io</code></span>
        </div>
        <Button onClick={handleSend} disabled={sending || !subject || !body || preview.length === 0}
          className="ml-auto bg-blue-600 hover:bg-blue-500 text-white gap-2">
          <Send className="w-4 h-4" />
          {sending ? 'Sending...' : `Send to ${preview.length} users`}
        </Button>
      </div>
    </div>
  );
};
