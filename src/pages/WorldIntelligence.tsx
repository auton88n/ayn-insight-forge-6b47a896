import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Globe2 } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { StageStepper } from '@/components/dashboard/simulator/SimulatorShell';
import { SeedInput } from '@/components/dashboard/simulator/SeedInput';
import { AgentRoster } from '@/components/dashboard/simulator/AgentRoster';
import { SimulationView } from '@/components/dashboard/simulator/SimulationView';
import { ReportPanel } from '@/components/dashboard/simulator/ReportPanel';
import { SignalsTicker } from '@/components/dashboard/simulator/SignalsTicker';
import { AgentChatDrawer } from '@/components/dashboard/simulator/AgentChatDrawer';
import { useEnginSim } from '@/components/dashboard/simulator/useEnginSim';
import { EnginAgent } from '@/lib/enginApi';

/**
 * /world-intelligence — MiroFish-style swarm simulator wired to engin.aynn.io.
 * Five stages: Seed → Graph → Simulate → Report → Chat.
 */
export default function WorldIntelligence() {
  const navigate = useNavigate();
  const { state, start, reset } = useEnginSim();
  const [chatTarget, setChatTarget] = useState<
    { kind: 'agent'; agent: EnginAgent } | { kind: 'report' } | null
  >(null);

  const onSelectAgent = (a: EnginAgent) => setChatTarget({ kind: 'agent', agent: a });

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <SEO
        title="World Simulator | AYN"
        description="Drop a seed event into a parallel world of LLM-powered agents and predict what happens next."
      />

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <button onClick={() => navigate('/')}
          className="p-2 rounded-xl bg-card/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-card/70 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Globe2 className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-base font-display font-bold tracking-tight">AYN ENGIN · Swarm Simulator</h1>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
            seed → graph → simulate → report → chat
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">live</span>
        </div>
      </header>

      <StageStepper stage={state.stage} onReset={reset} />

      {/* Main */}
      <div className="flex-1 min-h-0 flex flex-col">
        {state.stage === 'seed' ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-10">
            <SeedInput loading={state.loading} onStart={start} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr_360px]">
            {/* Left: agent roster */}
            <aside className="border-r border-border/40 bg-background/40 backdrop-blur-xl min-h-0 hidden lg:flex flex-col">
              <AgentRoster
                agents={state.agents}
                emotions={state.emotions}
                selectedId={chatTarget?.kind === 'agent' ? chatTarget.agent.id : null}
                onSelect={onSelectAgent}
              />
            </aside>

            {/* Center: simulation canvas */}
            <main className="flex flex-col min-h-0 p-3 sm:p-4">
              <SimulationView
                agents={state.agents}
                graph={state.graph}
                emotions={state.emotions}
                loading={state.loading}
                onSelectAgent={(id) => {
                  const agent = state.agents.find(a => a.id === id);
                  if (agent) setChatTarget({ kind: 'agent', agent });
                }}
              />
            </main>

            {/* Right: report */}
            <aside className="border-l border-border/40 bg-background/40 backdrop-blur-xl min-h-0 hidden lg:flex flex-col">
              <ReportPanel
                report={state.report}
                onChatReport={() => setChatTarget({ kind: 'report' })}
              />
            </aside>
          </div>
        )}

        {/* Signals ticker */}
        {state.stage !== 'seed' && (
          <SignalsTicker signals={state.signals} />
        )}
      </div>

      {/* Chat drawer */}
      <AnimatePresence>
        {chatTarget && (
          <AgentChatDrawer
            simId={null}
            target={chatTarget}
            onClose={() => setChatTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
