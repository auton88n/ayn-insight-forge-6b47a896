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
  Zap, Code2, Trash2, Bot, KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AGENT_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/ayn-dev-agent';

interface Repo { owner: string; repo: string }
interface Msg  { role: 'user' | 'agent'; text: string; id: string }

const PRESETS = [
  { icon: '🔒', label: 'Fix security advisors',     prompt: 'Check Supabase security advisors for project dfkoxuokfkttjhfjcecx and fix any ERRORs you find' },
  { icon: '📋', label: 'Diagnose errors from logs', prompt: 'Read edge function logs for project dfkoxuokfkttjhfjcecx and tell me what errors are happening' },
  { icon: '🐛', label: 'Fix double-fire bug',       prompt: 'Read the keep-warm edge function and fix the double-fire bug in ayn-market-intelligence for project dfkoxuokfkttjhfjcecx' },
  { icon: '⚡', label: 'Performance audit',         prompt: 'Check for unused and duplicate indexes in project dfkoxuokfkttjhfjcecx and list them' },
  { icon: '📊', label: 'List edge functions',       prompt: 'List all edge functions in project dfkoxuokfkttjhfjcecx with their versions' },
  { icon: '🔧', label: 'Audit ayn-unified',         prompt: 'Read the ayn-unified edge function source code and suggest improvements' },
];

function getStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}

// Typing indicator — same as AdminAIAssistant
const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 px-4 py-3">
    {[0, 1, 2].map(i => (
      <motion.div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/60"
        animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
    ))}
  </div>
);

export function DevAgentPanel() {
  const [repos,    setRepos]    = useState<Repo[]>(() => getStored('ayn_dev_repos', []));
  const [projects, setProjects] = useState<string[]>(() => getStored('ayn_dev_projs', ['dfkoxuokfkttjhfjcecx']));
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [input,    setInput]    = useState('');
  const [running,  setRunning]  = useState(false);
  const [repoIn,   setRepoIn]   = useState('');
  const [ghToken,  setGhToken]  = useState(() => getStored<string>('ayn_dev_ghtoken', ''));
  const [projIn,   setProjIn]   = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { localStorage.setItem('ayn_dev_repos', JSON.stringify(repos)); } catch {} }, [repos]);
  useEffect(() => { try { localStorage.setItem('ayn_dev_ghtoken', ghToken); } catch {} }, [ghToken]);
  useEffect(() => { try { localStorage.setItem('ayn_dev_projs', JSON.stringify(projects)); } catch {} }, [projects]);
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [msgs, running]);

  const addRepo = () => {
    let v = repoIn.trim();
    // Strip full GitHub URLs e.g. https://github.com/owner/repo
    v = v.replace(/^https?:\/\/github\.com\//, '');
    if (!v || !v.includes('/')) return;
    const idx = v.indexOf('/');
    const owner = v.slice(0, idx), repo = v.slice(idx + 1).replace(/\.git$/, '');
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
    setMsgs(p => [...p, { role: 'user', text: msg, id: 'u' + Date.now() }]);
    setRunning(true);
    const aid = 'a' + Date.now();
    setMsgs(p => [...p, { role: 'agent', text: '', id: aid }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const res = await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, repos, projects, github_token: ghToken, stream: true }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => `HTTP ${res.status}`);
        setMsgs(p => p.map(m => m.id === aid ? { ...m, text: `**Error ${res.status}:** ${err}` } : m));
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
            if (obj.text) { full += obj.text; setMsgs(p => p.map(m => m.id === aid ? { ...m, text: full } : m)); }
          } catch {}
        }
      }
    } catch (e: any) {
      setMsgs(p => p.map(m => m.id === aid ? { ...m, text: `**Error:** ${e?.message ?? 'Unknown'}` } : m));
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

      {/* ── Header — matches AdminAIAssistant exactly ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Code2 className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              AYN Dev Agent
              <Badge variant="secondary" className="text-[10px] font-normal">BETA</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">reads code → diagnoses → fixes → deploys</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMsgs([])} className="text-muted-foreground hover:text-foreground">
          <Trash2 className="w-4 h-4 mr-2" />Clear
        </Button>
      </div>

      {/* ── Main layout — two columns below header ── */}
      <div className="flex gap-4 items-start">

        {/* Left — connections panel */}
        <div className="w-56 flex-shrink-0 space-y-3">

          {/* GitHub Repos */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">GitHub Repos</span>
              </div>
              {repos.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-1.5 group">
                  <span className="text-xs flex-1 truncate">{r.owner}/{r.repo}</span>
                  <button onClick={() => setRepos(p => p.filter((_, j) => j !== i))}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 mt-1.5">
                <input value={repoIn} onChange={e => setRepoIn(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRepo()}
                  placeholder="auton88n/ayn-insight-forge-6b47a896"
                  className="flex-1 min-w-0 text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/50"
                />
                <button onClick={addRepo} className="p-1.5 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* GitHub Token */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">GitHub Token</span>
              </div>
              <input
                type="password"
                value={ghToken}
                onChange={e => setGhToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/50"
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                github.com/settings/tokens → Classic → repo scope
              </p>
            </CardContent>
          </Card>

          {/* Supabase Projects */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supabase</span>
              </div>
              {projects.map(p => (
                <div key={p} className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5 mb-1.5 group">
                  <span className="text-xs flex-1 truncate">{p}</span>
                  <button onClick={() => setProjects(prev => prev.filter(x => x !== p))}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 mt-1.5">
                <input value={projIn} onChange={e => setProjIn(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addProj()}
                  placeholder="project-ref"
                  className="flex-1 min-w-0 text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-foreground/30 placeholder:text-muted-foreground/50"
                />
                <button onClick={addProj} className="p-1.5 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Tasks */}
          <Card className="border border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Tasks</span>
              </div>
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => fire(p.prompt)} disabled={running}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors mb-0.5 disabled:opacity-40 group">
                  <span className="text-sm">{p.icon}</span>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{p.label}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right — chat panel */}
        <div className="flex-1 min-w-0">
          <Card className="border border-border bg-card overflow-hidden">
            <CardContent className="p-0">

              {/* Messages */}
              <ScrollArea className="h-[480px]" ref={scrollRef}>
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
                            <span>{p.icon}</span>
                            <span>{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {msgs.map(msg => (
                    <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                      {msg.role === 'user' ? (
                        /* User bubble — exact same as AdminAIAssistant */
                        <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-foreground text-background">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ) : (
                        /* Agent bubble — exact same as AdminAIAssistant */
                        <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted border border-border">
                          {msg.text ? (
                            <div className="text-sm leading-relaxed
                              [&_p]:my-1 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold
                              [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_h1]:mb-1 [&_h2]:mb-1
                              [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-0.5
                              [&_code]:text-xs [&_code]:bg-background [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:border [&_code]:border-border
                              [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre]:border [&_pre]:border-border
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

                  {running && msgs[msgs.length - 1]?.text === '' && null}
                </div>
              </ScrollArea>

              {/* Input — exact same pattern as AdminAIAssistant */}
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
                      className={cn(
                        'flex-1 resize-none min-h-[44px] max-h-[160px]',
                        'text-sm bg-transparent',
                        'border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
                        'px-2 py-2'
                      )}
                    />
                    <AnimatePresence>
                      {input.trim() && !running && (
                        <motion.button
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          onClick={() => fire(input)}
                          className="shrink-0 w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity"
                        >
                          <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 px-1">
                  Commits to feature branches · Edge functions deploy with instant rollback · Uses Lovable AI gateway (Gemini) — no extra API keys needed
                </p>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
