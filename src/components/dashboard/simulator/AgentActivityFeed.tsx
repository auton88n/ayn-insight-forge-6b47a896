/**
 * AgentActivityFeed — Live scrolling feed of agent reactions during simulation.
 * Shows which agents are reacting in real time with their emotion and statement.
 */
import { useEffect, useRef } from 'react';
import { EnginAgent } from '@/lib/enginApi';

interface FeedItem {
  id: string;
  agent: string;
  flag: string;
  category: string;
  emotion: string;
  statement: string;
  layer: number;
  ts: number;
}

interface Props {
  agents: EnginAgent[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading: boolean;
  layerSummaries?: Record<string, string>;
}

const EMOTION_COLOR: Record<string, string> = {
  panic: 'text-red-400', fear: 'text-orange-400', anger: 'text-red-500',
  excited: 'text-yellow-400', optimistic: 'text-emerald-400',
  cautious: 'text-violet-400', neutral: 'text-slate-400', calm: 'text-cyan-400',
};

const LAYER_LABELS: Record<number, string> = {
  1:'Economic', 2:'Institutional', 3:'Elite', 4:'Narrative', 5:'Community', 6:'Human', 7:'Synthesis'
};

export function AgentActivityFeed({ agents, emotions, loading }: Props) {
  const feedRef    = useRef<HTMLDivElement>(null);
  const itemsRef   = useRef<FeedItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = [0, () => {}];
  const renderCount = useRef(0);

  // Simulate live feed by cycling through agents with emotions
  useEffect(() => {
    if (!loading || agents.length === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const LAYER_STATEMENTS: Record<string, string[]> = {
      government:   ['Monitoring situation closely. Emergency meeting convened.', 'Consulting allies. Preparing policy response.', 'National interest requires decisive action.', 'We will not allow this to destabilize our region.'],
      central_bank: ['Markets are pricing in significant uncertainty.', 'Watching inflation expectations carefully.', 'Rate path may need revision.', 'Financial stability remains our primary mandate.'],
      stock_market: ['Volatility spiking. Investors rotating to safe havens.', 'Liquidity tightening in credit markets.', 'Risk-off sentiment dominating.', 'Futures pointing to sharp open.'],
      bank:         ['Increasing hedging positions.', 'Credit quality concerns emerging.', 'Repricing risk across the portfolio.', 'Reducing exposure to affected sectors.'],
      company:      ['Reviewing supply chain dependencies.', 'Scenario planning for multiple outcomes.', 'Customers are asking about continuity plans.', 'Accelerating inventory builds.'],
      media:        ['Breaking: major development unfolding.', 'Experts divided on implications.', 'Social media amplifying fear narratives.', 'Fact-checking claims circulating online.'],
      religion:     ['Our community is praying for peace and stability.', 'This tests our values of compassion and justice.', 'We call on leaders to protect the vulnerable.'],
      social_class: ['Prices already rising in local markets.', 'People are anxious about what this means for jobs.', 'The rich will be fine. We will suffer.', 'My family is worried. We live paycheck to paycheck.'],
      persona:      ['Just saw the news. This is going to affect everything.', 'Checking my savings. Not feeling secure right now.', 'Told my kids not to worry but I am worried.', 'My boss mentioned possible layoffs this morning.', 'Already seeing prices go up at the grocery store.'],
    };

    let layerNum = 1;
    let agentIdx = 0;

    intervalRef.current = setInterval(() => {
      if (agentIdx >= agents.length) {
        layerNum = Math.min(layerNum + 1, 6);
        agentIdx = 0;
      }

      const agent = agents[agentIdx % agents.length];
      agentIdx++;

      const stmts = LAYER_STATEMENTS[agent.category] || LAYER_STATEMENTS.persona;
      const stmt  = stmts[Math.floor(Math.random() * stmts.length)];
      const ems   = Object.keys(EMOTION_COLOR);
      const emotion = emotions[agent.id]?.emotion || ems[Math.floor(Math.random() * ems.length)];

      const item: FeedItem = {
        id: `${agent.id}-${Date.now()}`,
        agent: agent.name,
        flag:  agent.flag || '●',
        category: agent.category,
        emotion,
        statement: stmt,
        layer: layerNum,
        ts: Date.now(),
      };

      itemsRef.current = [item, ...itemsRef.current].slice(0, 30);
      renderCount.current++;

      // Force re-render
      if (feedRef.current) {
        feedRef.current.dispatchEvent(new CustomEvent('feed-update'));
      }
    }, 800);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loading, agents, emotions]);

  // Listen for feed updates
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const handler = () => {
      // Trigger re-render by mutating a ref and forcing update via style
      el.style.setProperty('--render', String(renderCount.current));
    };
    el.addEventListener('feed-update', handler);
    return () => el.removeEventListener('feed-update', handler);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/20 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
          {loading ? 'Agent Activity' : 'Awaiting simulation'}
        </span>
        {loading && (
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
            Layer {Math.min(Math.ceil((itemsRef.current.length || 0) / 10), 6)} / 6
          </span>
        )}
      </div>

      <div ref={feedRef} className="flex-1 overflow-y-auto space-y-0 p-2">
        {!loading && itemsRef.current.length === 0 && (
          <div className="text-center text-muted-foreground/30 text-[11px] font-mono mt-8">
            Launch a simulation to see<br/>agents react in real time
          </div>
        )}
        <AgentFeedList items={itemsRef.current} />
      </div>
    </div>
  );
}

// Separate component so it can re-render independently
function AgentFeedList({ items }: { items: FeedItem[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [items.length]);

  return (
    <div ref={listRef}>
      {items.map((item, i) => (
        <div key={item.id}
          className="flex gap-2 p-2 rounded-lg hover:bg-card/20 transition-colors border-b border-border/10"
          style={{ opacity: Math.max(0.3, 1 - i * 0.025), animation: i === 0 ? 'fadeIn 0.3s ease' : undefined }}>
          <span className="text-base leading-none mt-0.5 shrink-0">{item.flag}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-semibold text-foreground truncate">{item.agent}</span>
              <span className="text-[9px] font-mono text-muted-foreground/40 uppercase">{LAYER_LABELS[item.layer]}</span>
              <span className={`text-[9px] font-mono uppercase ml-auto ${EMOTION_COLOR[item.emotion] || 'text-slate-400'}`}>
                {item.emotion}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">{item.statement}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
