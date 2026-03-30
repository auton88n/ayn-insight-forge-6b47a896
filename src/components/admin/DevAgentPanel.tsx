import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  GitBranch, Database, ArrowUp, Plus, X,
  Zap, Code2, Trash2, Bot, MessageSquare,
  PenSquare, Settings2, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AGENT_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/ayn-dev-agent';

interface Repo { owner: string; repo: string }
interface Msg  { role: 'user' | 'agent'; text: string; id: string }
interface Conv  { id: string; title: string; updated_at: string }
interface Skill { id: string; name: string; category: string; description: string; content: string; enabled: boolean }

const PRESETS = [
  { icon: '🔒', label: 'Fix security advisors',     prompt: 'Check Supabase security advisors for project dfkoxuokfkttjhfjcecx and fix any ERRORs' },
  { icon: '📋', label: 'Diagnose errors from logs', prompt: 'Read edge function logs for project dfkoxuokfkttjhfjcecx and tell me what errors are happening' },
  { icon: '🐛', label: 'Fix double-fire bug',       prompt: 'Read the keep-warm edge function and fix the double-fire bug in ayn-market-intelligence for project dfkoxuokfkttjhfjcecx' },
  { icon: '⚡', label: 'Performance audit',         prompt: 'Check for unused and duplicate indexes in project dfkoxuokfkttjhfjcecx' },
  { icon: '📊', label: 'List edge functions',       prompt: 'List all edge functions in project dfkoxuokfkttjhfjcecx with their versions' },
  { icon: '🔧', label: 'Audit ayn-unified',         prompt: 'Read the ayn-unified edge function source code and suggest improvements' },
];

function getStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 py-1">
    {[0, 1, 2].map(i => (
      <motion.div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/60"
        animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
    ))}
  </div>
);

type Tab = 'chat' | 'history' | 'skills';

const categoryColor: Record<string, string> = {
  coding: 'from-violet-500 to-purple-600',
  design: 'from-pink-500 to-rose-600',
  architecture: 'from-cyan-500 to-blue-600',
  security: 'from-red-500 to-orange-600',
  testing: 'from-green-500 to-emerald-600',
  general: 'from-slate-500 to-gray-600',
};

export function DevAgentPanel() {
  const [tab, setTab]             = useState<Tab>('chat');
  const [repos, setRepos]         = useState<Repo[]>(() => getStored('ayn_dev_repos', []));
  const [projects, setProjects]   = useState<string[]>(() => getStored('ayn_dev_projs', ['dfkoxuokfkttjhfjcecx']));
  const [ghToken, setGhToken]     = useState<string>(() => getStored('ayn_dev_ghtoken', ''));
  const [msgs, setMsgs]           = useState<Msg[]>([]);
  const [convId, setConvId]       = useState<string | null>(null);
  const [convTitle, setConvTitle] = useState('New conversation');
  const [conversations, setConvs] = useState<Conv[]>([]);
  const [skills, setSkills]       = useState<Skill[]>([]);
  const [input, setInput]         = useState('');
  const [running, setRunning]     = useState(false);
  const [repoIn, setRepoIn]       = useState('');
  const [projIn, setProjIn]       = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { localStorage.setItem('ayn_dev_repos', JSON.stringify(repos)); } catch {} }, [repos]);
  useEffect(() => { try { localStorage.setItem('ayn_dev_projs', JSON.stringify(projects)); } catch {} }, [projects]);
  useEffect(() => { try { localStorage.setItem('ayn_dev_ghtoken', ghToken); } catch {} }, [ghToken]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  useEffect(() => { loadConvs(); loadSkills(); }, []);

  const loadConvs = async () => {
    const { data } = await supabase
      .from('ayn_dev_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (data) setConvs(data as Conv[]);
  };

  const loadSkills = async () => {
    const { data } = await supabase
      .from('ayn_dev_skills')
      .select('id, name, category, description, content, enabled')
      .order('category');
    if (data) setSkills(data as Skill[]);
  };

  const loadConv = async (id: string, title: string) => {
    const { data } = await supabase
      .from('ayn_dev_messages')
      .select('id, role, content')
      .eq('conversation_id', id)
      .order('created_at');
    if (data) {
      setMsgs(data.map((r: any) => ({ id: r.id, role: r.role, text: r.content })));
      setConvId(id);
      setConvTitle(title);
      setTab('chat');
    }
  };

  const saveMsg = async (cid: string, role: string, content: string) => {
    await supabase.from('ayn_dev_messages').insert({ conversation_id: cid, role, content });
    await supabase.from('ayn_dev_conversations').update({ updated_at: new Date().toISOString() }).eq('id', cid);
  };

  const toggleSkill = async (id: string, enabled: boolean) => {
    await supabase.from('ayn_dev_skills').update({ enabled }).eq('id', id);
    setSkills(s => s.map(sk => sk.id === id ? { ...sk, enabled } : sk));
  };

  const deleteConv = async (id: string) => {
    await supabase.from('ayn_dev_conversations').delete().eq('id', id);
    setConvs(c => c.filter(x => x.id !== id));
    if (convId === id) newChat();
  };

  const newChat = () => {
    setMsgs([]);
    setConvId(null);
    setConvTitle('New conversation');
    setTab('chat');
    setInput('');
  };

  const addRepo = () => {
    let v = repoIn.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (!v || !v.includes('/')) return;
    const idx = v.indexOf('/');
    const owner = v.slice(0, idx), repo = v.slice(idx + 1);
    if (!owner || !repo || repos.find(r => r.owner === owner && r.repo === repo)) return;
    setRepos(p => [...p, { owner, repo }]);
    setRepoIn('');
  };

  const addProj = () => {
    const v = projIn.trim();
    if (!v || projects.includes(v)) return;
    setProjects(p => [...p, v]);
    setProjIn('');
  };

  const fire = async (text: string) => {
    const msg = text.trim();
    if (!msg || running) return;
    setInput('');
    if (textRef.current) textRef.current.style.height = 'auto';

    // Create or reuse conversation
    let cid = convId;
    if (!cid) {
      const title = msg.slice(0, 60) + (msg.length > 60 ? '...' : '');
      const { data } = await supabase
        .from('ayn_dev_conversations')
        .insert({ title })
        .select('id')
        .single();
      if (!data) return;
      cid = data.id;
      setConvId(cid);
      setConvTitle(title);
      loadConvs();
    }

    const uid = 'u' + Date.now();
    setMsgs(p => [...p, { role: 'user', text: msg, id: uid }]);
    await saveMsg(cid, 'user', msg);

    setRunning(true);
    const aid = 'a' + Date.now();
    setMsgs(p => [...p, { role: 'agent', text: '', id: aid }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      // Build skills context
      const enabledSkills = skills.filter(s => s.enabled).map(s => s.content ?? s.description).join('\n\n---\n\n');

      const res = await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: msg,
          repos,
          projects,
          github_token: ghToken,
          skills: enabledSkills,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => `HTTP ${res.status}`);
        const errText = `**Error ${res.status}:** ${err}`;
        setMsgs(p => p.map(m => m.id === aid ? { ...m, text: errText } : m));
        await saveMsg(cid, 'agent', errText);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const obj = JSON.parse(payload);
            if (obj.text) {
              full += obj.text;
              setMsgs(p => p.map(m => m.id === aid ? { ...m, text: full } : m));
            }
          } catch {}
        }
      }

      if (full) await saveMsg(cid, 'agent', full);
      loadConvs();
    } catch (e: any) {
      const errText = `**Error:** ${e?.message ?? 'Unknown error'}`;
      setMsgs(p => p.map(m => m.id === aid ? { ...m, text: errText } : m));
    } finally {
      setRunning(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fire(input); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Code2 className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              AYN Dev Agent
              <Badge variant="secondary" className="text-[10px] font-normal">BETA</Badge>
            </h2>
            <p className="text-sm text-muted-foreground truncate max-w-xs">
              {tab === 'chat' ? convTitle : tab === 'history' ? 'Conversation history' : 'Skills & knowledge'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(['chat', 'history', 'skills'] as Tab[]).map(t => (
            <Button key={t} variant="ghost" size="sm"
              onClick={() => { setTab(t); if (t === 'history') loadConvs(); if (t === 'skills') loadSkills(); }}
              className={cn('gap-1.5 text-xs capitalize', tab === t && 'bg-muted')}>
              {t === 'chat' && <MessageSquare className="w-3.5 h-3.5" />}
              {t === 'history' && <MessageSquare className="w-3.5 h-3.5" />}
              {t === 'skills' && <Sparkles className="w-3.5 h-3.5" />}
              {t}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={newChat} className="gap-1.5 text-xs">
            <PenSquare className="w-3.5 h-3.5" />New
          </Button>
          {msgs.length > 0 && tab === 'chat' && (
            <Button variant="ghost" size="sm" onClick={() => setMsgs([])}
              className="text-muted-foreground hover:text-foreground text-xs">
              <Trash2 className="w-3.5 h-3.5 mr-1" />Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">

        {/* Sidebar */}
        <div className="w-52 flex-shrink-0 space-y-3">

          {/* Connections */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <button onClick={() => setShowSetup(v => !v)}
                className="w-full flex items-center gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                <Settings2 className="w-3 h-3" />Connections
                <span className="ml-auto">{showSetup ? '▲' : '▼'}</span>
              </button>

              {showSetup && (
                <div className="mt-3 space-y-3 pt-3 border-t border-border/50">
                  {/* GitHub Repos */}
                  <div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <GitBranch className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Repos</span>
                    </div>
                    {repos.map((r, i) => (
                      <div key={i} className="flex items-center gap-1 bg-muted rounded px-2 py-1 mb-1 group text-[9px]">
                        <span className="flex-1 truncate">{r.owner}/{r.repo}</span>
                        <button onClick={() => setRepos(p => p.filter((_, j) => j !== i))}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <input value={repoIn} onChange={e => setRepoIn(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRepo()}
                        placeholder="owner/repo"
                        className="flex-1 min-w-0 text-[9px] bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/40 text-foreground"
                      />
                      <button onClick={addRepo} className="p-1 bg-muted border border-border rounded hover:bg-muted/80 text-foreground">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* GitHub Token */}
                  <div>
                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">GitHub Token</div>
                    <input type="password" value={ghToken} onChange={e => setGhToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full text-[9px] bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/40 text-foreground"
                    />
                  </div>

                  {/* Supabase */}
                  <div>
                    <div className="flex items-center gap-1 mb-1.5">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Supabase</span>
                    </div>
                    {projects.map(p => (
                      <div key={p} className="flex items-center gap-1 bg-muted rounded px-2 py-1 mb-1 group text-[9px]">
                        <span className="flex-1 truncate">{p}</span>
                        <button onClick={() => setProjects(prev => prev.filter(x => x !== p))}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <input value={projIn} onChange={e => setProjIn(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addProj()}
                        placeholder="project-ref"
                        className="flex-1 min-w-0 text-[9px] bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/40 text-foreground"
                      />
                      <button onClick={addProj} className="p-1 bg-muted border border-border rounded hover:bg-muted/80 text-foreground">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Tasks */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-1 mb-2">
                <Zap className="w-3 h-3 text-muted-foreground" />
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Quick Tasks</span>
              </div>
              {PRESETS.map(p => (
                <button key={p.label}
                  onClick={() => { setTab('chat'); fire(p.prompt); }}
                  disabled={running}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors mb-0.5 disabled:opacity-40 group">
                  <span className="text-xs">{p.icon}</span>
                  <span className="text-[9px] text-muted-foreground group-hover:text-foreground">{p.label}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">

          {/* CHAT */}
          {tab === 'chat' && (
            <Card className="border border-border bg-card overflow-hidden">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]" ref={scrollRef}>
                  <div className="p-4 space-y-4">
                    {msgs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <Bot className="w-6 h-6 text-foreground" />
                        </div>
                        <div>
                          <p className="font-semibold mb-1">AYN Dev Agent</p>
                          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                            Describe what to fix or build. The agent reads your code, diagnoses the issue, writes the fix, and deploys — autonomously.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                          {PRESETS.slice(0, 4).map(p => (
                            <button key={p.label} onClick={() => fire(p.prompt)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors text-sm">
                              <span>{p.icon}</span><span className="text-xs">{p.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {msgs.map(msg => (
                      <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        {msg.role === 'user' ? (
                          <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-foreground text-background">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                          </div>
                        ) : (
                          <div className="w-full min-w-0 rounded-2xl px-4 py-3 bg-muted border border-border overflow-hidden">
                            {msg.text ? (
                              <div className="text-sm text-foreground leading-relaxed break-words min-w-0
                                [&_p]:my-1 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold
                                [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_h1]:mb-1 [&_h2]:mb-1
                                [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5
                                [&_code]:text-xs [&_code]:bg-background [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:border [&_code]:border-border
                                [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre]:border [&_pre]:border-border [&_pre]:max-w-full
                                [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0
                                [&_a]:underline [&_a]:text-foreground [&_strong]:font-semibold">
                                <ReactMarkdown>{msg.text}</ReactMarkdown>
                              </div>
                            ) : (
                              <TypingIndicator />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-3 border-t border-border">
                  <div className="relative bg-muted/50 border border-border rounded-xl overflow-hidden">
                    <div className="flex items-end gap-2 p-2">
                      <Textarea
                        ref={textRef}
                        placeholder="Ask the agent to fix something, read code, or diagnose an issue..."
                        value={input}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyPress}
                        disabled={running}
                        className="flex-1 resize-none min-h-[44px] max-h-[160px] text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2"
                      />
                      <AnimatePresence>
                        {input.trim() && !running && (
                          <motion.button
                            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                            onClick={() => fire(input)}
                            className="shrink-0 w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity">
                            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 px-1">
                    Commits to feature branches · Deploys edge functions instantly · Gemini 2.5 Pro
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            <Card className="border border-border bg-card">
              <CardContent className="p-0">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-semibold">Conversation History</span>
                  <Button variant="ghost" size="sm" onClick={newChat} className="gap-1.5 text-xs">
                    <PenSquare className="w-3.5 h-3.5" />New Chat
                  </Button>
                </div>
                <ScrollArea className="h-[520px]">
                  {conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                      <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No conversations yet</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {conversations.map(conv => (
                        <div key={conv.id}
                          className={cn('flex items-center gap-2 px-3 py-2.5 rounded-lg group cursor-pointer hover:bg-muted transition-colors',
                            convId === conv.id && 'bg-muted border border-border')}
                          onClick={() => loadConv(conv.id, conv.title)}>
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{conv.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(conv.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); deleteConv(conv.id); }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* SKILLS */}
          {tab === 'skills' && (
            <Card className="border border-border bg-card">
              <CardContent className="p-0">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-semibold">Agent Skills</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Toggle skills to inject domain knowledge into the agent. Enabled skills are included in every prompt.
                  </p>
                </div>
                <ScrollArea className="h-[520px]">
                  <div className="p-3 space-y-3">
                    {skills.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                        <Sparkles className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No skills loaded</p>
                      </div>
                    )}
                    {skills.map(skill => (
                      <div key={skill.id} className={cn('rounded-xl border p-4 transition-all',
                        skill.enabled ? 'border-border bg-muted/30' : 'border-border/40 bg-muted/10 opacity-60')}>
                        <div className="flex items-start gap-3">
                          <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold',
                            categoryColor[skill.category] ?? categoryColor.general)}>
                            {skill.category.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold">{skill.name}</span>
                              <Badge variant="outline" className="text-[9px] capitalize">{skill.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{skill.description}</p>
                          </div>
                          {/* Toggle */}
                          <button onClick={() => toggleSkill(skill.id, !skill.enabled)}
                            className={cn('w-10 h-5 rounded-full transition-colors flex-shrink-0 relative mt-0.5',
                              skill.enabled ? 'bg-foreground' : 'bg-muted border border-border')}>
                            <span className={cn('absolute top-0.5 w-4 h-4 rounded-full transition-all',
                              skill.enabled ? 'bg-background right-0.5' : 'bg-muted-foreground left-0.5')} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
