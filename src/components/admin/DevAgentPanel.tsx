import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Send, Plus, X, GitBranch, Database, Zap, Terminal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const AGENT_FN  = `${SUPA_URL}/functions/v1/ayn-dev-agent`;

interface Repo    { owner: string; repo: string; branch: string; }
interface Message { role: 'user'|'agent'; text: string; id: string; }

const PRESETS = [
  { icon: '🔒', label: 'Security audit',       prompt: 'Check the Supabase security advisors and fix any ERRORs you find' },
  { icon: '📋', label: 'Diagnose errors',       prompt: 'Read the edge function logs and tell me what errors are happening' },
  { icon: '🐛', label: 'Fix double-fire bug',   prompt: 'Read the keep-warm edge function and fix the double-fire bug in ayn-market-intelligence' },
  { icon: '⚡', label: 'Performance audit',     prompt: 'Check for unused and duplicate indexes in the database and remove them' },
  { icon: '📁', label: 'Explore repo',          prompt: 'List the src/ directory and identify the largest files' },
  { icon: '✂️', label: 'Split large component', prompt: 'The WorldIntelligence page is 2700 lines. Identify the best components to lazy-load and split out.' },
];

export function DevAgentPanel() {
  const [repos, setRepos]       = useState<Repo[]>(() => JSON.parse(localStorage.getItem('ayn_dev_repos') || '[]'));
  const [projects, setProjects] = useState<string[]>(() => JSON.parse(localStorage.getItem('ayn_dev_projects') || '["dfkoxuokfkttjhfjcecx"]'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [running, setRunning]   = useState(false);
  const [repoInput, setRepoInput]   = useState('auton88n/ayn-insight-forge-6b47a896');
  const [projInput, setProjInput]   = useState('');
  const [showSetup, setShowSetup]   = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { localStorage.setItem('ayn_dev_repos', JSON.stringify(repos)); }, [repos]);
  useEffect(() => { localStorage.setItem('ayn_dev_projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const addRepo = () => {
    const parts = repoInput.trim().split('/');
    if (parts.length < 2) return;
    const [owner, repo] = parts;
    if (repos.find(r => r.owner === owner && r.repo === repo)) return;
    setRepos(prev => [...prev, { owner, repo, branch: 'main' }]);
    setRepoInput('');
  };
  const removeRepo = (i: number) => setRepos(prev => prev.filter((_, idx) => idx !== i));

  const addProject = () => {
    const ref = projInput.trim();
    if (!ref || projects.includes(ref)) return;
    setProjects(prev => [...prev, ref]);
    setProjInput('');
  };
  const removeProject = (ref: string) => setProjects(prev => prev.filter(p => p !== ref));

  const sendMessage = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || running) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text, id: 'u' + Date.now() }]);
    setRunning(true);

    const agentId = 'a' + Date.now();
    setMessages(prev => [...prev, { role: 'agent', text: '', id: agentId }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';

      const res = await fetch(AGENT_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, repos, projects, stream: true }),
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages(prev => prev.map(m => m.id === agentId ? { ...m, text: `**Error ${res.status}:** ${err}` } : m));
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const { text: chunk } = JSON.parse(data);
            full += chunk;
            setMessages(prev => prev.map(m => m.id === agentId ? { ...m, text: full } : m));
          } catch (_) {}
        }
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === agentId ? { ...m, text: `**Network error:** ${e.message}` } : m));
    } finally {
      setRunning(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col gap-0 overflow-y-auto flex-shrink-0 bg-muted/20">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black text-cyan-400 tracking-widest">DEV AGENT</span>
          </div>
          <p className="text-[10px] text-muted-foreground">AI engineer: reads code, fixes bugs, deploys changes</p>
        </div>

        {/* Setup toggle */}
        <button onClick={() => setShowSetup(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-b border-border">
          <Zap className="w-3 h-3" />
          {showSetup ? 'HIDE SETUP' : 'SETUP CONNECTIONS'}
        </button>

        {showSetup && (
          <div className="p-3 border-b border-border space-y-3 bg-muted/10">
            {/* Repos */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3 h-3 text-purple-400" />
                <span className="text-[9px] font-bold text-purple-400 tracking-widest">GITHUB REPOS</span>
              </div>
              {repos.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded px-2 py-1 mb-1">
                  <span className="text-[9px] text-purple-300 truncate">{r.owner}/{r.repo}</span>
                  <button onClick={() => removeRepo(i)} className="text-red-400/60 hover:text-red-400 ml-1 flex-shrink-0"><X className="w-2.5 h-2.5"/></button>
                </div>
              ))}
              <div className="flex gap-1">
                <input value={repoInput} onChange={e => setRepoInput(e.target.value)}
                  placeholder="owner/repo"
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-[9px] outline-none focus:border-purple-400/50"
                  onKeyDown={e => e.key === 'Enter' && addRepo()}/>
                <button onClick={addRepo} className="bg-purple-500/20 border border-purple-500/30 rounded px-2 py-1 text-purple-400 hover:bg-purple-500/30 transition-colors">
                  <Plus className="w-3 h-3"/>
                </button>
              </div>
            </div>

            {/* Projects */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database className="w-3 h-3 text-cyan-400" />
                <span className="text-[9px] font-bold text-cyan-400 tracking-widest">SUPABASE PROJECTS</span>
              </div>
              {projects.map(p => (
                <div key={p} className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/20 rounded px-2 py-1 mb-1">
                  <span className="text-[9px] text-cyan-300 truncate">{p}</span>
                  <button onClick={() => removeProject(p)} className="text-red-400/60 hover:text-red-400 ml-1 flex-shrink-0"><X className="w-2.5 h-2.5"/></button>
                </div>
              ))}
              <div className="flex gap-1">
                <input value={projInput} onChange={e => setProjInput(e.target.value)}
                  placeholder="project-ref"
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-[9px] outline-none focus:border-cyan-400/50"
                  onKeyDown={e => e.key === 'Enter' && addProject()}/>
                <button onClick={addProject} className="bg-cyan-500/20 border border-cyan-500/30 rounded px-2 py-1 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                  <Plus className="w-3 h-3"/>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick prompts */}
        <div className="p-3 flex-1">
          <div className="text-[9px] font-bold text-muted-foreground tracking-widest mb-2">QUICK TASKS</div>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => sendMessage(p.prompt)}
              disabled={running}
              className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mb-1 disabled:opacity-40">
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            className="m-3 py-1.5 text-[9px] text-red-400/60 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-colors">
            Clear conversation
          </button>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="text-4xl">🤖</div>
              <div className="text-sm font-bold text-foreground">AYN Dev Agent</div>
              <div className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                Describe what to fix or build. The agent reads your code, diagnoses issues, writes fixes, and commits to a feature branch — without you touching another tool.
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 max-w-sm">
                {PRESETS.slice(0,4).map(p => (
                  <button key={p.label} onClick={() => sendMessage(p.prompt)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-left">
                    <span>{p.icon}</span><span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-[70%] bg-cyan-500/10 border border-cyan-500/25 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-foreground">
                  {msg.text}
                </div>
              ) : (
                <div className="max-w-full flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-sm">🤖</div>
                    <span className="text-[9px] font-bold text-violet-400 tracking-widest">AYN DEV AGENT</span>
                    {running && msg.id === messages[messages.length-1]?.id && (
                      <div className="flex gap-1 ml-1">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.text ? (
                    <div className="prose prose-invert prose-sm max-w-none text-[11px] leading-relaxed
                      prose-code:text-cyan-300 prose-code:bg-cyan-500/10 prose-code:border prose-code:border-cyan-500/20 prose-code:rounded prose-code:px-1
                      prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl
                      prose-headings:text-cyan-400 prose-strong:text-white prose-a:text-cyan-400"
                      dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) as string }}/>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <div className="flex gap-1">
                        {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
                      </div>
                      Reading code & thinking...
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-muted/10">
          <div className="flex gap-3 items-end">
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Describe what to fix or build... (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={running}
              className="flex-1 resize-none bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-400/40 transition-colors placeholder:text-muted-foreground/50 min-h-[44px] max-h-[160px] disabled:opacity-50"
              style={{ height: 'auto' }}
              onInput={e => { const el = e.currentTarget; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,160)+'px'; }}
            />
            <button onClick={() => sendMessage()} disabled={running || !input.trim()}
              className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/25 transition-colors disabled:opacity-40 disabled:cursor-default flex-shrink-0">
              <Send className="w-4 h-4"/>
            </button>
          </div>
          <div className="text-[9px] text-muted-foreground/50 mt-2 tracking-wide">
            Agent reads before editing · Commits to feature branches · Edge functions deploy instantly
          </div>
        </div>
      </div>
    </div>
  );
}
