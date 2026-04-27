import { useState } from 'react';
import { Sparkles, Upload, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESETS = [
  { label: 'Suez bypass becomes permanent', seed: 'Major shippers permanently reroute around the Suez Canal via the Cape of Good Hope after sustained Red Sea disruption. Insurance, fuel, and transit times reprice.', question: 'Which industries gain or lose the most over the next 12 months?' },
  { label: 'Fed cuts 50bps surprise',         seed: 'The U.S. Federal Reserve announces an unexpected 50bps rate cut citing labor-market softness. Treasury yields drop sharply.',                                                                                  question: 'How do EM currencies, gold, and tech equities react over 30 days?' },
  { label: 'AI agent labor displacement',     seed: 'A leading SaaS vendor releases autonomous task-completion agents priced at one-tenth the cost of human BPO labor.',                                                                                          question: 'Which job categories collapse first and how do governments respond?' },
];

interface Props {
  loading: boolean;
  onStart: (input: { seed: string; question: string; rounds: number; agents: number }) => void;
}

export function SeedInput({ loading, onStart }: Props) {
  const [seed, setSeed] = useState('');
  const [question, setQuestion] = useState('');
  const [rounds, setRounds] = useState(20);
  const [agents, setAgents] = useState(60);

  const usePreset = (p: typeof PRESETS[number]) => { setSeed(p.seed); setQuestion(p.question); };

  const handleFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setSeed(String(reader.result || '').slice(0, 20000));
    reader.readAsText(file);
  };

  const canStart = seed.trim().length > 20 && question.trim().length > 5 && !loading;

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">
      <div className="text-center space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground/60">stage 01 · seed</p>
        <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Drop a seed into the world</h2>
        <p className="text-sm text-muted-foreground/70 max-w-lg mx-auto">News, brief, doc, novel, or market event. The engine will build a parallel society around it.</p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 justify-center">
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => usePreset(p)}
            className="text-xs font-mono px-3 py-1.5 rounded-full bg-card/40 border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
            <Sparkles className="w-3 h-3 inline mr-1.5 opacity-60" />{p.label}
          </button>
        ))}
      </div>

      {/* Seed textarea */}
      <div className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-xl p-5 space-y-4">
        <div>
          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 block">Seed material</label>
          <textarea
            value={seed} onChange={e => setSeed(e.target.value)} rows={6}
            placeholder="Paste an article, brief, scenario description, novel excerpt…"
            className="w-full bg-background/40 border border-border/40 rounded-xl p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <label className="text-[10px] font-mono text-muted-foreground/50 cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5">
              <Upload className="w-3 h-3" /> upload .txt / .md / .csv
              <input type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            <span className="text-[10px] font-mono text-muted-foreground/40">{seed.length} chars</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 block">Prediction question</label>
          <input
            value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="What do you want the swarm to predict?"
            className="w-full bg-background/40 border border-border/40 rounded-xl p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
          />
        </div>

        {/* Knobs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-1 block">Rounds <span className="text-foreground/80">{rounds}</span></label>
            <input type="range" min={5} max={60} value={rounds} onChange={e => setRounds(+e.target.value)} className="w-full accent-primary" />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-1 block">Agents <span className="text-foreground/80">{agents}</span></label>
            <input type="range" min={10} max={150} value={agents} onChange={e => setAgents(+e.target.value)} className="w-full accent-primary" />
          </div>
        </div>

        <button
          onClick={() => onStart({ seed: seed.trim(), question: question.trim(), rounds, agents })}
          disabled={!canStart}
          className={cn(
            'w-full mt-2 py-3 rounded-xl font-mono text-sm font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2',
            canStart
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
              : 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed',
          )}
        >
          {loading ? 'building world…' : 'launch simulation'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
