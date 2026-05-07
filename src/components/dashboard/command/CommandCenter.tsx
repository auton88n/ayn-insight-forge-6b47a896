import { useEffect, useState, useCallback } from 'react';
import { Users, FileText, Crown, ListChecks, Sparkles, Inbox as InboxIcon, Send, Copy, Trash2, Loader2, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ccApi, type CCUpdate, type CCInbox, type GenKind, type Impact, type InboxKind } from './commandApi';

type Tool = 'updates' | 'manager' | 'ceo' | 'plan' | 'ask' | 'inbox';

const TOOLS: { id: Tool; label: string; icon: any; sub: string }[] = [
  { id: 'updates', label: 'Team Updates', icon: Users, sub: 'capture daily signals' },
  { id: 'manager', label: 'Manager Report', icon: FileText, sub: 'weekly synthesis' },
  { id: 'ceo', label: 'CEO Brief', icon: Crown, sub: 'one-page brief' },
  { id: 'plan', label: 'Action Plan', icon: ListChecks, sub: 'turn goal into steps' },
  { id: 'ask', label: 'Ask Anything', icon: Sparkles, sub: 'q&a on company data' },
  { id: 'inbox', label: 'Inbox', icon: InboxIcon, sub: 'sent to you' },
];

interface Props {
  userId: string;
  userName?: string;
}

export function CommandCenter({ userId, userName }: Props) {
  const [tool, setTool] = useState<Tool>('updates');
  const [updates, setUpdates] = useState<CCUpdate[]>([]);
  const [inbox, setInbox] = useState<CCInbox[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [u, i] = await Promise.all([ccApi.listUpdates(), ccApi.listInbox()]);
      setUpdates(u);
      setInbox(i);
    } catch (e: any) {
      console.error('cc load', e);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const unread = inbox.filter((m) => !m.read_at).length;

  return (
    <div className="flex h-full w-full bg-background text-foreground" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Tool rail */}
      <aside className="w-[260px] shrink-0 border-r border-border/40 flex flex-col">
        <div className="px-5 py-5 border-b border-border/40">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">command</p>
          <h2 className="text-lg font-semibold mt-1">Intelligence Center</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors',
                  active ? 'bg-foreground text-background' : 'hover:bg-muted/60'
                )}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t.label}</span>
                    {t.id === 'inbox' && unread > 0 && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-mono',
                        active ? 'bg-background text-foreground' : 'bg-foreground text-background')}>
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className={cn('text-[11px] mt-0.5', active ? 'text-background/70' : 'text-muted-foreground')}>{t.sub}</p>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/40">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/60">signed in as</p>
          <p className="text-sm font-medium truncate mt-1">{userName || 'You'}</p>
        </div>
      </aside>

      {/* Working area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[920px] mx-auto px-6 md:px-10 py-8">
          {tool === 'updates' && <UpdatesTool updates={updates} onChange={refresh} />}
          {tool === 'manager' && <GenerateTool kind="manager_report" title="Manager Report" updates={updates} />}
          {tool === 'ceo' && <GenerateTool kind="ceo_brief" title="CEO Brief" updates={updates} />}
          {tool === 'plan' && <ActionPlanTool updates={updates} />}
          {tool === 'ask' && <AskTool updates={updates} />}
          {tool === 'inbox' && <InboxView items={inbox} onChange={refresh} />}
        </div>
      </main>
    </div>
  );
}

/* ───────────── Team Updates ───────────── */
function UpdatesTool({ updates, onChange }: { updates: CCUpdate[]; onChange: () => void }) {
  const [department, setDepartment] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [impact, setImpact] = useState<Impact>('medium');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!department.trim() || !author.trim() || !text.trim()) {
      toast.error('Fill department, author and update');
      return;
    }
    if (text.length > 2000) { toast.error('Update too long (2000 max)'); return; }
    setBusy(true);
    try {
      await ccApi.addUpdate({ department: department.trim(), author: author.trim(), text: text.trim(), impact });
      setText('');
      onChange();
      toast.success('Update logged');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Header title="Team Updates" sub="What changed today? Add a quick signal so the AI can build reports later." />

      <div className="rounded-2xl border border-border/40 bg-card/40 p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Department (e.g. Sales)" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={60} />
          <Input placeholder="Author name" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60} />
        </div>
        <Textarea placeholder="Update… what happened, what changed, what's needed" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} />
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as Impact[]).map((i) => (
              <button key={i} onClick={() => setImpact(i)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-colors',
                  impact === i ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {i}
              </button>
            ))}
          </div>
          <Button onClick={submit} disabled={busy} className="rounded-xl">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Log update
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">recent ({updates.length})</p>
        {updates.length === 0 && <p className="text-sm text-muted-foreground/70 py-8 text-center">No updates yet. Add one above.</p>}
        {updates.map((u) => (
          <div key={u.id} className="rounded-xl border border-border/40 bg-card/30 p-4 group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2 py-0.5 rounded bg-muted">{u.department}</span>
                <span className={cn('px-2 py-0.5 rounded',
                  u.impact === 'high' ? 'bg-red-500/15 text-red-400' :
                  u.impact === 'low' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-400')}>{u.impact}</span>
                <span className="text-muted-foreground">{u.author}</span>
                <span className="text-muted-foreground/60">· {new Date(u.created_at).toLocaleString()}</span>
              </div>
              <button
                onClick={async () => { await ccApi.deleteUpdate(u.id); onChange(); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap">{u.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Manager / CEO Generators ───────────── */
function GenerateTool({ kind, title, updates }: { kind: GenKind; title: string; updates: CCUpdate[] }) {
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (updates.length === 0) { toast.error('Add some team updates first'); return; }
    setOut(''); setBusy(true);
    try {
      await ccApi.generateStream({ kind, updates }, (chunk) => setOut((p) => p + chunk));
    } catch (e: any) {
      toast.error(e?.message || 'Generation failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Header title={title} sub={`Built from your last ${Math.min(updates.length, 50)} team update${updates.length === 1 ? '' : 's'}.`} />
      <Button onClick={run} disabled={busy} className="rounded-xl">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
        {out ? 'Regenerate' : 'Generate'}
      </Button>
      {out && <OutputCard title={title} body={out} kind={kind === 'ceo_brief' ? 'report' : 'report'} />}
    </div>
  );
}

/* ───────────── Action Plan ───────────── */
function ActionPlanTool({ updates }: { updates: CCUpdate[] }) {
  const [goal, setGoal] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!goal.trim()) { toast.error('Describe the goal'); return; }
    setOut(''); setBusy(true);
    try {
      await ccApi.generateStream({ kind: 'action_plan', updates, question: goal }, (c) => setOut((p) => p + c));
    } catch (e: any) {
      toast.error(e?.message || 'Generation failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Header title="Action Plan" sub="Give a goal or problem. AYN turns it into 5 steps with owners and a KPI." />
      <Textarea placeholder="Goal or problem to solve…" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={500} />
      <Button onClick={run} disabled={busy} className="rounded-xl">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ListChecks className="w-4 h-4 mr-2" />}
        Build plan
      </Button>
      {out && <OutputCard title="Action Plan" body={out} kind="report" />}
    </div>
  );
}

/* ───────────── Ask Anything ───────────── */
function AskTool({ updates }: { updates: CCUpdate[] }) {
  const [q, setQ] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!q.trim()) return;
    setOut(''); setBusy(true);
    try {
      await ccApi.generateStream({ kind: 'qa', updates, question: q }, (c) => setOut((p) => p + c));
    } catch (e: any) {
      toast.error(e?.message || 'Question failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Header title="Ask Anything" sub="Questions answered only from your logged team updates." />
      <Textarea placeholder="e.g. What were the biggest blockers this week?" value={q} onChange={(e) => setQ(e.target.value)} rows={3} maxLength={500} />
      <Button onClick={run} disabled={busy} className="rounded-xl">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
        Ask
      </Button>
      {out && <OutputCard title={q.slice(0, 80)} body={out} kind="question" />}
    </div>
  );
}

/* ───────────── Output Card with Copy + Send ───────────── */
function OutputCard({ title, body, kind }: { title: string; body: string; kind: InboxKind }) {
  const [showSend, setShowSend] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    toast.success('Copied');
  };

  const send = async () => {
    if (!email.trim()) { toast.error('Recipient email required'); return; }
    setBusy(true);
    try {
      await ccApi.sendToUser({ recipient_email: email.trim(), kind, title, body });
      toast.success(`Sent to ${email}`);
      setShowSend(false); setEmail('');
    } catch (e: any) {
      toast.error(e?.message || 'Send failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">output</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={copy} className="h-8"><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSend((s) => !s)} className="h-8"><Send className="w-3.5 h-3.5 mr-1.5" />Send to @user</Button>
        </div>
      </div>
      {showSend && (
        <div className="px-5 py-3 border-b border-border/40 bg-muted/30 flex gap-2">
          <Input type="email" placeholder="@ teammate email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
          <Button onClick={send} disabled={busy} size="sm" className="h-9">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      )}
      <div className="px-6 py-5 prose prose-sm prose-invert max-w-none">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
    </div>
  );
}

/* ───────────── Inbox ───────────── */
function InboxView({ items, onChange }: { items: CCInbox[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);

  const openItem = async (m: CCInbox) => {
    setOpen(m.id === open ? null : m.id);
    if (!m.read_at && m.id !== open) {
      try { await ccApi.markRead(m.id); onChange(); } catch {}
    }
  };

  return (
    <div className="space-y-4">
      <Header title="Inbox" sub="Reports, questions and messages teammates @sent to you." />
      {items.length === 0 && <p className="text-sm text-muted-foreground/70 py-12 text-center">Nothing here yet.</p>}
      {items.map((m) => (
        <div key={m.id} className={cn('rounded-xl border bg-card/30 transition-colors',
          m.read_at ? 'border-border/30' : 'border-foreground/30')}>
          <button onClick={() => openItem(m)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">{m.kind}</span>
                <span>{m.sender_name || 'unknown'}</span>
                <span className="text-muted-foreground/60">· {new Date(m.created_at).toLocaleString()}</span>
                {!m.read_at && <span className="px-2 py-0.5 rounded bg-foreground text-background">new</span>}
              </div>
              <p className="text-sm font-medium mt-1 truncate">{m.title}</p>
            </div>
            <button
              onClick={async (e) => { e.stopPropagation(); await ccApi.deleteInbox(m.id); onChange(); }}
              className="text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </button>
          </button>
          {open === m.id && (
            <div className="px-6 py-4 border-t border-border/40 prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{m.body}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground/70">command center</p>
      <h1 className="text-2xl md:text-3xl font-semibold mt-1 tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1.5">{sub}</p>
    </div>
  );
}
