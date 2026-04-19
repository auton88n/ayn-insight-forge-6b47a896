import { useEffect, useState } from 'react';
import { supabaseApi } from '@/lib/supabaseApi';
import { spineAuth, tokenStore } from '@/lib/spineAuth';
import { cn } from '@/lib/utils';


// ─── World Simulator Component ────────────────────────────────────────────────
const TIME_LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  historical: { label: 'Historical Anchor', color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/20', icon: '📜' },
  present:    { label: 'Now',              color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20',  icon: '⚡' },
  near_future:{ label: 'Next 2–8 Weeks',  color: 'text-blue-400',   bg: 'bg-blue-500/8 border-blue-500/20',    icon: '🔮' },
  far_future:  { label: '3–6 Months',     color: 'text-emerald-400',bg: 'bg-emerald-500/8 border-emerald-500/20',icon: '🌐' },
};

const ACTOR_EMOJI: Record<string, string> = {
  'United States': '🇺🇸', 'China': '🇨🇳', 'Russia': '🇷🇺', 'European Union': '🇪🇺',
  'Federal Reserve': '🏦', 'OPEC+': '🛢', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷',
  'Israel': '🇮🇱', 'BlackRock / Institutional Capital': '💰',
};

const MARKET_IMPACT_COLOR: Record<string, string> = {
  spike: 'text-red-400', rally: 'text-emerald-400', selloff: 'text-red-400',
  weaken: 'text-red-400', strengthen: 'text-emerald-400', volatile: 'text-amber-400',
  stable: 'text-white/40', drop: 'text-red-400', recovery: 'text-emerald-400',
};

function SimEventNode({ event, isRoot }: { event: any; isRoot?: boolean }) {
  const [expanded, setExpanded] = useState(isRoot || false);
  const layer = TIME_LAYER_CONFIG[event.time_layer] || TIME_LAYER_CONFIG.present;
  const reactions = event.actor_reactions || [];
  const impact = event.market_impact || {};
  const prob = event.probability;

  return (
    <div className={cn('rounded-xl border p-3 transition-all', layer.bg, isRoot && 'ring-1 ring-amber-500/30')}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="text-base flex-shrink-0 mt-0.5">{layer.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-[8px] font-mono font-bold uppercase tracking-widest', layer.color)}>{layer.label}</span>
            {prob !== undefined && prob < 100 && (
              <span className="text-[8px] font-mono text-white/30">{prob}% likely</span>
            )}
            {event.cascade_depth > 0 && (
              <span className="text-[8px] font-mono text-white/20">depth {event.cascade_depth}</span>
            )}
          </div>
          <p className="text-[11px] font-mono font-bold text-white/85 leading-snug">{event.title}</p>
          {event.summary && (
            <p className="text-[9px] text-white/45 mt-1 leading-relaxed line-clamp-2">{event.summary}</p>
          )}

          {/* Market impact pills */}
          {Object.keys(impact).length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {Object.entries(impact).filter(([k]) => k !== 'lesson').map(([asset, val]: [string, any]) => (
                <span key={asset} className={cn('text-[8px] font-mono', MARKET_IMPACT_COLOR[String(val)] || 'text-white/40')}>
                  {asset === 'oil' ? '🛢' : asset === 'gold' ? 'Au' : asset === 'btc' ? '₿' : asset === 'usd' ? '$' : asset === 'equities' ? '📈' : ''} {String(val)}
                </span>
              ))}
            </div>
          )}

          {/* Expand/collapse */}
          {(reactions.length > 0 || event.historical_outcome || event.historical_parallel) && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-[8px] font-mono text-white/25 hover:text-white/50 mt-2 transition-colors">
              {expanded ? '↑ collapse' : `↓ ${reactions.length > 0 ? `${reactions.length} actor reactions` : 'details'}`}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: actor reactions */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/6 space-y-2">
          {event.historical_outcome && (
            <div className="bg-purple-500/8 rounded-lg px-3 py-2">
              <div className="text-[8px] font-mono text-purple-400/70 uppercase mb-1">What happened last time</div>
              <p className="text-[9px] text-white/50 leading-relaxed">{event.historical_outcome}</p>
            </div>
          )}
          {reactions.map((r: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-white/3 rounded-lg px-3 py-2">
              <span className="text-sm flex-shrink-0">{ACTOR_EMOJI[r.actor] || '🏛'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold text-white/70">{r.actor}</span>
                  <span className="text-[8px] font-mono text-white/25">{r.timeline}</span>
                  {r.confidence && <span className="text-[8px] font-mono text-white/20">{r.confidence}%</span>}
                </div>
                <p className="text-[9px] text-white/50 mt-0.5">{r.action}</p>
                {r.secondary_effect && (
                  <p className="text-[8px] text-amber-400/50 mt-0.5">→ {r.secondary_effect}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorldSimulator({ signals }: { signals: any[] }) {
  const [simulations, setSimulations] = useState<any[]>([]);
  const [activeSimId, setActiveSimId] = useState<string | null>(null);
  const [cascadeEvents, setCascadeEvents] = useState<any[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [loadingCascade, setLoadingCascade] = useState(false);
  const SUPABASE_URL_LOCAL = (window as any).__SUPABASE_URL__ || '';

  // Load existing simulations
  useEffect(() => {
    const load = async () => {
      try {
        const token = tokenStore.getAccessToken() || '';
        const data = await supabaseApi.get<any[]>(
          'ayn_world_simulations?order=created_at.desc&limit=10',
          token
        );
        const results = (data || []) as any[];
        if (results.length) {
          setSimulations(results);
          setActiveSimId(results[0].id);
        }
      } catch {}
    };
    load();
  }, []);

  // Load cascade when simulation selected
  useEffect(() => {
    if (!activeSimId) return;
    const load = async () => {
      setLoadingCascade(true);
      try {
        const token = tokenStore.getAccessToken() || '';
        const data = await supabaseApi.get<any[]>(
          `ayn_world_events?simulation_run_id=eq.${activeSimId}&order=cascade_depth.asc`,
          token
        );
        setCascadeEvents(data || []);
      } catch {} finally { setLoadingCascade(false); }
    };
    load();
  }, [activeSimId]);

  const runSim = async (signalId?: string) => {
    setSimulating(true);
    try {
      // TODO(spine): confirm /intelligence/simulate route exists; using escape-hatch req() for now
      const result: any = await spineApi.req(
        'POST',
        '/intelligence/simulate',
        signalId ? { mode: 'simulate_signal', signal_id: signalId } : { mode: 'simulate_signal' }
      ).catch((e) => { console.error(e); return null; });
      if (result?.simulation_id) {
        setSimulations([]);
        setActiveSimId(result.simulation_id);
      }
    } catch(e) { console.error(e); } finally { setSimulating(false); }
  };

  // Group events by time layer
  const byLayer = {
    historical: cascadeEvents.filter(e => e.time_layer === 'historical'),
    present: cascadeEvents.filter(e => e.time_layer === 'present'),
    near_future: cascadeEvents.filter(e => e.time_layer === 'near_future'),
    far_future: cascadeEvents.filter(e => e.time_layer === 'far_future'),
  };

  const activeSim = simulations.find(s => s.id === activeSimId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-[10px] font-mono font-bold text-amber-400 tracking-[0.15em] uppercase">World Simulator</span>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent" />
        <button
          onClick={() => runSim()}
          disabled={simulating}
          className="text-[9px] font-mono text-amber-400/60 hover:text-amber-400 transition-colors disabled:opacity-40 flex items-center gap-1"
        >
          {simulating ? '⟳ simulating...' : '⚡ simulate new signal'}
        </button>
      </div>

      {/* Simulation selector */}
      {simulations.length > 0 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {simulations.slice(0, 5).map(sim => (
            <button
              key={sim.id}
              onClick={() => setActiveSimId(sim.id)}
              className={cn(
                'text-[8px] font-mono px-2.5 py-1 rounded-lg border transition-all text-left max-w-[200px] truncate',
                activeSimId === sim.id
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-white/3 border-white/8 text-white/35 hover:text-white/60'
              )}
            >
              {sim.trigger_title?.slice(0, 40) || 'Simulation'}
            </button>
          ))}
        </div>
      )}

      {/* No simulations yet */}
      {simulations.length === 0 && !simulating && (
        <div className="border border-dashed border-amber-500/20 rounded-xl p-8 text-center mb-4">
          <div className="text-2xl mb-2">🌐</div>
          <p className="text-[11px] font-mono text-white/40 mb-3">No simulations yet. Run one to see the full causal chain.</p>
          <button onClick={() => runSim()} className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-lg hover:bg-amber-500/20 transition-all">
            ⚡ Run First Simulation
          </button>
        </div>
      )}

      {simulating && (
        <div className="border border-amber-500/20 rounded-xl p-6 text-center mb-4 bg-amber-500/5">
          <div className="text-[10px] font-mono text-amber-400 animate-pulse">⟳ Simulating causal cascade... analyzing actors, market impacts, historical parallels...</div>
        </div>
      )}

      {/* Active simulation: timeline */}
      {activeSim && cascadeEvents.length > 0 && (
        <div className="space-y-4">
          {/* Simulation meta */}
          <div className="flex items-center gap-3 text-[8px] font-mono text-white/25 px-1">
            <span>🌐 {activeSim.total_events_generated} events</span>
            <span>·</span>
            <span>🏛 {(activeSim.actors_activated || []).length} actors activated</span>
            <span>·</span>
            <span>{new Date(activeSim.created_at).toLocaleDateString()}</span>
          </div>

          {/* Time layers as columns/sections */}
          {(['historical', 'present', 'near_future', 'far_future'] as const).map(layer => {
            const events = byLayer[layer];
            if (!events.length) return null;
            const cfg = TIME_LAYER_CONFIG[layer];
            return (
              <div key={layer}>
                {/* Layer header with connecting line */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-[9px] font-mono font-bold uppercase tracking-widest', cfg.color)}>{cfg.icon} {cfg.label}</span>
                  <div className={cn('flex-1 h-px opacity-30', layer === 'historical' ? 'bg-purple-400' : layer === 'present' ? 'bg-amber-400' : layer === 'near_future' ? 'bg-blue-400' : 'bg-emerald-400')} />
                  {layer !== 'historical' && layer !== 'present' && (
                    <span className="text-[8px] font-mono text-white/20">↑ caused by present</span>
                  )}
                </div>
                <div className={cn('space-y-2', layer !== 'present' && 'pl-3 border-l border-white/6')}>
                  {events.map(ev => (
                    <SimEventNode key={ev.id} event={ev} isRoot={ev.event_type === 'trigger' && layer === 'present'} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Signals that triggered this */}
          {signals.length > 0 && (
            <div className="pt-3 border-t border-white/6">
              <div className="text-[8px] font-mono text-white/20 mb-2 uppercase tracking-widest">Simulate a specific signal</div>
              <div className="grid grid-cols-1 gap-1.5">
                {signals.slice(0, 4).map((sig, i) => (
                  <button
                    key={i}
                    onClick={() => runSim(sig.id)}
                    disabled={simulating}
                    className="text-left bg-white/3 border border-white/6 rounded-lg px-3 py-2 hover:bg-white/6 transition-all disabled:opacity-40 group"
                  >
                    <span className="text-[9px] font-mono text-white/50 group-hover:text-white/70 transition-colors">{sig.headline?.slice(0, 80)}</span>
                    <span className="text-[8px] font-mono text-amber-400/50 ml-2">→ simulate</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WorldSimulator;
