import { supabase } from '@/integrations/supabase/client';

export type Impact = 'low' | 'medium' | 'high';
export type GenKind = 'manager_report' | 'ceo_brief' | 'action_plan' | 'qa';
export type InboxKind = 'message' | 'report' | 'question';

export interface CCUpdate {
  id: string;
  user_id: string;
  department: string;
  author: string;
  text: string;
  impact: Impact;
  created_at: string;
}

export interface CCInbox {
  id: string;
  sender_id: string;
  sender_name: string | null;
  recipient_id: string;
  recipient_email: string | null;
  kind: InboxKind;
  title: string;
  body: string;
  source_ids: string[] | null;
  read_at: string | null;
  created_at: string;
}

export const ccApi = {
  async listUpdates(): Promise<CCUpdate[]> {
    const { data, error } = await supabase
      .from('cc_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []) as CCUpdate[];
  },

  async addUpdate(u: { department: string; author: string; text: string; impact: Impact }): Promise<CCUpdate> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('not signed in');
    const { data, error } = await supabase
      .from('cc_updates')
      .insert({ ...u, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as CCUpdate;
  },

  async deleteUpdate(id: string) {
    const { error } = await supabase.from('cc_updates').delete().eq('id', id);
    if (error) throw error;
  },

  async listInbox(): Promise<CCInbox[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('cc_inbox')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []) as CCInbox[];
  },

  async sendToUser(args: { recipient_email: string; kind: InboxKind; title: string; body: string }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('not signed in');

    // Resolve recipient by email via profiles table
    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('user_id, contact_person')
      .ilike('email', args.recipient_email)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prof) throw new Error('User not found with that email');

    const senderName = (user.user_metadata as any)?.name || user.email || 'AYN user';

    const { error } = await supabase.from('cc_inbox').insert({
      sender_id: user.id,
      sender_name: senderName,
      recipient_id: (prof as any).user_id,
      recipient_email: args.recipient_email,
      kind: args.kind,
      title: args.title,
      body: args.body,
    });
    if (error) throw error;
  },

  async markRead(id: string) {
    const { error } = await supabase.from('cc_inbox').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async deleteInbox(id: string) {
    const { error } = await supabase.from('cc_inbox').delete().eq('id', id);
    if (error) throw error;
  },

  async generateStream(args: { kind: GenKind; updates: CCUpdate[]; question?: string }, onDelta: (s: string) => void): Promise<string> {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-generate`;
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(args),
    });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || `request failed (${resp.status})`);
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (json === '[DONE]') { done = true; break; }
        try {
          const p = JSON.parse(json);
          const c = p.choices?.[0]?.delta?.content;
          if (c) { full += c; onDelta(c); }
        } catch {
          buf = line + '\n' + buf;
          break;
        }
      }
    }
    return full;
  },
};
