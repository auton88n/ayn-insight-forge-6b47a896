import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import {
  GitBranch, Database, Send, Plus, X,
  Zap, Terminal, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPABASE_URL } from '@/config';

const AGENT_URL = `${SUPABASE_URL}/functions/v1/ayn-dev-agent`;

interface Repo    { owner: string; repo: string; branch: string }
interface Msg     { role: 'user' | 'agent'; text: string; id: string }

const PRESETS = [
  { label: 'Fix security advisors',    prompt: 'Check Supabase security advisors for project dfkoxuokfkttjhfjcecx and fix any ERRORs you find' },
  { label: 'Diagnose errors from logs',prompt: 'Read edge function logs for project dfkoxuokfkttjhfjcecx and tell me what errors are happening' },
  { label: 'Fix double-fire bug',      prompt: 'Read the keep-warm edge function and fix the double-fire bug in ayn-market-intelligence for project dfkoxuokfkttjhfjcecx' },
  { label: 'Performance audit',        prompt: 'Check for unused and duplicate indexes in project dfkoxuokfkttjhfjcecx' },
  { label: 'List edge functions',      prompt: 'List all edge functions in project dfkoxuokfkttjhfjcecx and their versions' },
  { label: 'Audit ayn-unified',        prompt: 'Read the ayn-unified edge function source code and suggest performance improvements' },
];

export function DevAgentPanel() {
  const [repos,    setRepos]    = useState<Repo[]>(() =>
    JSON.parse(localStorage.getItem('ayn_dev_repos') || '[]'));
  const [projects, setProjects] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem('ayn_dev_projs') || '["dfkoxuokfkttjhfjcecx"]'));
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [input,    setInput]    = useState('');
  const [running,  setRunning]  = useState(false);
  const [repoIn,   setRepoIn]   = useState('');
  const [projIn,   setProjIn]   = useState('');
  const [sideOpen, setSideOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('ayn_dev_repos', JSON.stringify(repos));
  }, [repos]);
  useEffect(() => {
    localStorage.setItem('ayn_dev_projs', JSON.stringify(projects));
  }, [projects]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const addRepo = () => {
    const v = repoIn.trim();
    if (!v || !v.includes('/')) return;
    const [owner, ...rest] = v.split('/');
    const repo = rest.join('/');
    if (repos.find(r => r.owner === owner && r.repo === repo)) return;
    setRepos(p => [...p, { owner, repo, branch: 'main' }]);
    setRepoIn('');
  };

  const addProj = () => {
    const v = projIn.trim();
    if (!v || projects.includes(v)) return;
    setProjects(p => [...p, v]);
    setProjIn('');
  };

  const fire = async (text: string) => {
    if (!text.trim() || running) return;
    setInput('');
    setMsgs(p => [...p, { role: 'user', text, id: 'u' + Date.now() }]);
    setRunning(true);
    const aid = 'a' + Date.now();
    setMsgs(p => [...p, { role: 'agent', text: '', id: aid }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, repos, projects, stream: true }),
      });
      if (!res.ok) {
        const err = await res.text();
        setMsgs(p => p.map(m => m.id === aid ? { ...m, text: `**Error ${res.status}:** ${err}` } : m));
        return;
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') break;
          try {
            full += JSON.parse(d).text;
            setMsgs(p => p.map(m => m.id === aid ? { ...m, text: full } : m));
          } catch (_) {}
        }
      }
    } catch (e: any) {
      setMsgs(p => p.map(m => m.id === aid ? { ...m, text: `**Error:** ${e.message}` } : m));
    } finally {
      setRunning(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fire(input); }
  };

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ── */}
      <div className={cn(
        'flex flex-col border-r border-border bg-muted/20 transition-all duration-200 flex-shrink-0',
        sideOpen ? 'w-72' : 'w-0 overflow-hidden'
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black text-cyan-400 tracking-widest">DEV AGENT</span>
          </div>
          <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-400">BETA</Badge>
        </div>

        <ScrollArea className="flex-1">
          {/* GitHub repos */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <GitBranch className="w-3 h-3 text-violet-400" />
              <span className="text-[9px] font-bold text-violet-400 tracking-widest uppercase">GitHub Repos</span>
            </div>
            {repos.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-violet-500/8 border border-violet-500/20 rounded-md px-2 py-1 mb-1">
                <span className="text-[9px] text-violet-300 truncate flex-1">{r.owner}/{r.repo}</span>
                <button onClick={() => setRepos(p => p.filter((_, j) => j !== i))}
                  className="text-red-400/50 hover:text-red-400 ml-2 flex-shrink-0">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-1 mt-1">
              <input value={repoIn} onChange={e => setRepoIn(e.target.value)}
                placeholder="owner/repo"
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-[9px] text-foreground outline-none focus:border-violet-400/50 placeholder:text-muted-foreground/40"
                onKeyDown={e => e.key === 'Enter' && addRepo()} />
              <Button size="sm" variant="outline" onClick={addRepo} className="h-6 w-6 p-0">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Supabase projects */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <Database className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold text-cyan-400 tracking-widest uppercase">Supabase Projects</span>
            </div>
            {projects.map(p => (
              <div key={p} className="flex items-center justify-between bg-cyan-500/8 border border-cyan-500/20 rounded-md px-2 py-1 mb-1">
                <span className="text-[9px] text-cyan-300 truncate flex-1">{p}</span>
                <button onClick={() => setProjects(prev => prev.filter(x => x !== p))}
                  className="text-red-400/50 hover:text-red-400 ml-2 flex-shrink-0">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-1 mt-1">
              <input value={projIn} onChange={e => setProjIn(e.target.value)}
                placeholder="project-ref"
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-[9px] text-foreground outline-none focus:border-cyan-400/50 placeholder:text-muted-foreground/40"
                onKeyDown={e => e.key === 'Enter' && addProj()} />
              <Button size="sm" variant="outline" onClick={addProj} className="h-6 w-6 p-0">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Quick tasks */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] font-bold text-amber-400 tracking-widest uppercase">Quick Tasks</span>
            </div>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => fire(p.prompt)} disabled={running}
                className="w-full text-left text-[9px] text-muted-foreground hover:text-foreground hover:bg-muted/60 px-2 py-2 rounded-md mb-0.5 transition-colors disabled:opacity-40 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                {p.label}
              </button>
            ))}
          </div>
        </ScrollArea>

        {msgs.length > 0 && (
          <div className="p-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setMsgs([])}
              className="w-full text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-3 h-3 mr-1" /> Clear conversation
            </Button>
          </div>
        )}
      </div>

      {/* ── Chat ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background/50 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setSideOpen(v => !v)} className="h-7 w-7 p-0">
            {sideOpen ? <ChevronDown className="w-3.5 h-3.5 rotate-90" /> : <ChevronUp className="w-3.5 h-3.5 rotate-90" />}
          </Button>
          <span className="text-xs font-semibold text-foreground">AI Dev Agent</span>
          <span className="text-[10px] text-muted-foreground">Reads code → diagnoses → fixes → deploys</span>
          {running && (
            <Badge variant="outline" className="ml-auto text-[9px] border-cyan-500/40 text-cyan-400 animate-pulse">
              Working...
            </Badge>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="p-5 flex flex-col gap-4">
            {msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl">🤖</div>
                <div>
                  <p className="text-sm font-bold text-foreground mb-1">AYN Dev Agent</p>
                  <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                    Describe what to fix or build. The agent reads your code, diagnoses the issue,
                    writes the fix, commits to a feature branch, and deploys edge functions — all autonomously.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 max-w-md w-full">
                  {PRESETS.slice(0, 4).map(p => (
                    <button key={p.label} onClick={() => fire(p.prompt)}
                      className="text-left text-[10px] text-muted-foreground hover:text-foreground border border-border hover:border-cyan-500/30 hover:bg-cyan-500/5 rounded-lg px-3 py-2 transition-all">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map(msg => (
              <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'user' ? (
                  <div className="max-w-[70%] bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-foreground">
                    {msg.text}
                  </div>
                ) : (
                  <div className="flex-1 max-w-full">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-xs">🤖</div>
                      <span className="text-[9px] font-bold text-violet-400 tracking-widest uppercase">Dev Agent</span>
                      {running && msg.id === msgs[msgs.length - 1]?.id && (
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                      )}
                    </div>
                    {msg.text ? (
                      <div className="prose prose-sm prose-invert max-w-none text-[11px] leading-relaxed
                        [&_code]:text-cyan-300 [&_code]:bg-cyan-500/10 [&_code]:border [&_code]:border-cyan-500/20 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10px]
                        [&_pre]:bg-black/60 [&_pre]:border [&_pre]:border-white/8 [&_pre]:rounded-xl [&_pre]:p-3
                        [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0
                        [&_h1]:text-cyan-400 [&_h2]:text-cyan-400 [&_h3]:text-cyan-400
                        [&_strong]:text-white [&_a]:text-cyan-400">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        Reading code and thinking...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border bg-background/50 flex-shrink-0">
          <div className="flex gap-3 items-end">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Describe what to fix or build... (Enter to send, Shift+Enter for new line)"
              disabled={running}
              className="flex-1 resize-none min-h-[42px] max-h-[140px] text-sm"
              rows={1}
              onInput={(e: any) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
              }}
            />
            <Button onClick={() => fire(input)} disabled={running || !input.trim()} size="sm"
              className="h-[42px] w-[42px] p-0 flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-2">
            Agent reads before editing · GitHub changes go to feature branches · Edge functions deploy with instant rollback
          </p>
        </div>
      </div>
    </div>
  );
}
