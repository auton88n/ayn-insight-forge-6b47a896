/**
 * AgentSociety v3 — Full world simulation
 * 30+ agents: governments, banks, companies, social classes, markets
 * Categories filterable. Each agent has memory, personality, wins/loses.
 */
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

// ─── Emotion config ───────────────────────────────────────────────────────────
const EM: Record<string, { emoji: string; color: string; bg: string; border: string; label: string }> = {
  neutral:    { emoji:'😐', color:'#9ca3af', bg:'rgba(156,163,175,0.06)', border:'rgba(156,163,175,0.15)', label:'Neutral'    },
  confident:  { emoji:'😤', color:'#34d399', bg:'rgba(52,211,153,0.08)',  border:'rgba(52,211,153,0.25)',  label:'Confident'  },
  panicked:   { emoji:'😱', color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.4)',  label:'Panicking'  },
  happy:      { emoji:'😊', color:'#fde047', bg:'rgba(253,224,71,0.08)',  border:'rgba(253,224,71,0.25)',  label:'Happy'      },
  angry:      { emoji:'😡', color:'#ef4444', bg:'rgba(239,68,68,0.12)',   border:'rgba(239,68,68,0.45)',   label:'Furious'    },
  worried:    { emoji:'😟', color:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.25)',  label:'Worried'    },
  suspicious: { emoji:'🤨', color:'#a78bfa', bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.25)', label:'Suspicious' },
  excited:    { emoji:'🤩', color:'#22d3ee', bg:'rgba(34,211,238,0.08)',  border:'rgba(34,211,238,0.25)',  label:'Excited'    },
  sad:        { emoji:'😢', color:'#60a5fa', bg:'rgba(96,165,250,0.08)',  border:'rgba(96,165,250,0.2)',   label:'Sad'        },
  tense:      { emoji:'😬', color:'#fb923c', bg:'rgba(251,146,60,0.08)',  border:'rgba(251,146,60,0.3)',   label:'Tense'      },
};

const CAT_COLOR: Record<string, string> = {
  government:   '#06b6d4',
  central_bank: '#fbbf24',
  stock_market: '#f472b6',
  bank:         '#a78bfa',
  company:      '#34d399',
  social_class: '#fb923c',
  institution:  '#8b5cf6',
  market:       '#f472b6',
};

const CAT_ICON: Record<string, string> = {
  government:   '🏛',
  central_bank: '🏦',
  stock_market: '📈',
  bank:         '🏢',
  company:      '💼',
  social_class: '👥',
  institution:  '🌐',
  market:       '📊',
};

// ─── 3D Neural Globe ──────────────────────────────────────────────────────────
const AGENT_3D: Record<string, [number, number, number]> = {
  usa:[-0,3.6,0],china:[3.2,1.2,1.2],russia:[2.7,-1.3,2],eu:[-1,-3,1.6],
  iran:[-3.4,-1,-0.5],israel:[-3,1.8,-0.9],fed:[0,1.6,-3.2],opec:[3,-1.6,1],
  saudi:[-0.9,-0.9,3.3],blackrock:[1.2,0.7,3.3],india:[2.8,0.2,-2.2],
  japan:[-2.5,2.2,-2],germany:[-1.8,2.8,1.5],jpmorgan:[0.8,-2.4,-2.8],
  nvidia:[2.2,2.6,-1.8],us_middle:[1.8,-2.8,1.8],eu_citizen:[-2.2,-1.8,2.4],
};

// Normalize to sphere radius 3.6
Object.keys(AGENT_3D).forEach(id => {
  const p = AGENT_3D[id];
  const len = Math.sqrt(p[0]**2+p[1]**2+p[2]**2);
  if (len > 0) { const s = 3.6/len; AGENT_3D[id] = [p[0]*s,p[1]*s,p[2]*s]; }
});

function NeuralGlobe() {
  const count = 400; const r = 3.6;
  const { positions, linePositions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2*(i+0.5)/count);
      const theta = Math.PI*(1+Math.sqrt(5))*(i+0.5);
      const x = r*Math.cos(theta)*Math.sin(phi);
      const y = r*Math.cos(phi);
      const z = r*Math.sin(theta)*Math.sin(phi);
      pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      pts.push(new THREE.Vector3(x,y,z));
    }
    const lines: number[] = [];
    for (let i = 0; i < count; i++) {
      let conn = 0;
      for (let j = i+1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < 1.0) {
          lines.push(pts[i].x,pts[i].y,pts[i].z,pts[j].x,pts[j].y,pts[j].z);
          if (++conn > 3) break;
        }
      }
    }
    return { positions: pos, linePositions: new Float32Array(lines) };
  }, []);

  const pointsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  const linesGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    return g;
  }, [linePositions]);

  const groupRef = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.2,'rgba(168,85,247,0.8)'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useFrame((_,dt) => {
    if (groupRef.current) { groupRef.current.rotation.y+=dt*0.04; groupRef.current.rotation.x+=dt*0.015; }
  });

  return (
    <group ref={groupRef}>
      <points geometry={pointsGeo}>
        <pointsMaterial size={0.14} map={tex} transparent opacity={0.85} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      <lineSegments geometry={linesGeo}>
        <lineBasicMaterial color="#7c3aed" transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <mesh>
        <sphereGeometry args={[r*0.97,32,32]} />
        <meshBasicMaterial color="#020008" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

function AgentNode3D({ id, pos, state, isSelected, onClick }: {
  id: string; pos: [number,number,number]; state: any; isSelected: boolean; onClick: () => void;
}) {
  const em = EM[state?.current_emotion||'neutral'] || EM.neutral;
  const catCol = CAT_COLOR[state?.agent_category||'government'] || '#06b6d4';
  const meshRef = useRef<THREE.Mesh>(null);
  const intense = (state?.emotion_intensity||50) >= 75;

  useFrame((_,dt) => {
    if (!meshRef.current) return;
    if (intense) {
      const s = 1 + Math.sin(Date.now()*0.008)*0.18;
      meshRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={pos}>
      <mesh ref={meshRef} onClick={(e)=>{e.stopPropagation();onClick();}}>
        <sphereGeometry args={[isSelected?0.22:0.16,16,16]} />
        <meshBasicMaterial color={catCol} transparent opacity={isSelected?0.9:0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.06,8,8]} />
        <meshBasicMaterial color="#fff" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {isSelected && (
        <Billboard>
          <Text position={[0.25,0.3,0]} fontSize={0.11} color={catCol} anchorX="left" fillOpacity={0.9} outlineWidth={0.02} outlineColor="#020008">
            {state?.agent_name||id}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// ─── Agent card in the roster ─────────────────────────────────────────────────
function AgentCard({ state, isSelected, onClick }: { state: any; isSelected: boolean; onClick: () => void }) {
  const em = EM[state.current_emotion||'neutral'] || EM.neutral;
  const catCol = CAT_COLOR[state.agent_category||'government'] || '#9ca3af';
  const intense = (state.emotion_intensity||0) >= 75;

  return (
    <button
      onClick={onClick}
      className={cn('text-left rounded-xl p-3 border transition-all duration-200 relative overflow-hidden group w-full',
        isSelected ? 'border-white/20 [border-top-color:rgba(255,255,255,0.35)]' : 'border-white/6 hover:border-white/14')}
      style={{
        background: isSelected ? `${catCol}12` : 'rgba(255,255,255,0.02)',
        boxShadow: isSelected ? `0 0 0 1px ${catCol}30, 0 8px 24px rgba(0,0,0,0.4)` : undefined,
      }}>
      {/* Beam on selected */}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(90deg, transparent, ${catCol}cc, transparent)`,
          animation: 'as-beam 2s ease-in-out infinite',
        }} />
      )}
      <div className="flex items-center gap-2 mb-2">
        {/* Emotion face */}
        <div className="text-lg leading-none shrink-0" title={em.label}>{em.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-black text-white/85 truncate leading-tight">{state.agent_name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[7px] font-black uppercase tracking-wider" style={{ color: catCol }}>{CAT_ICON[state.agent_category||'government']} {state.agent_category}</span>
            {state.country && state.country !== 'GLOBAL' && (
              <span className="text-[7px] font-mono text-white/20">· {state.country}</span>
            )}
          </div>
        </div>
        {/* Intensity bar */}
        <div className="shrink-0 flex flex-col justify-center gap-0.5" style={{ width: 4, height: 28 }}>
          {[100,80,60,40,20].map(t => (
            <div key={t} className="rounded-full w-1" style={{
              height: 4,
              background: (state.emotion_intensity||0) >= t ? em.color : 'rgba(255,255,255,0.06)',
              boxShadow: (state.emotion_intensity||0) >= t ? `0 0 3px ${em.color}` : undefined,
            }} />
          ))}
        </div>
      </div>
      {/* Emotion label + intensity */}
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: em.color }}>{em.label}</span>
        <span className="text-[8px] font-mono text-white/25">{state.emotion_intensity||0}%</span>
      </div>
      {/* Key concern preview */}
      {state.key_concern && (
        <div className="text-[9px] font-mono text-white/35 mt-1.5 leading-snug line-clamp-1">{state.key_concern}</div>
      )}
      {/* Hover: wins/loses */}
      {(state.wins_from || state.loses_from) && (
        <div className="hidden group-hover:block mt-2 pt-2 border-t border-white/5 space-y-1">
          {state.wins_from && <div className="text-[8px] font-mono text-emerald-400/70 leading-snug">✅ {state.wins_from.slice(0,60)}</div>}
          {state.loses_from && <div className="text-[8px] font-mono text-red-400/70 leading-snug">❌ {state.loses_from.slice(0,60)}</div>}
        </div>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function AgentMessage({ msg, idx }: { msg: any; idx: number }) {
  const [showThought, setShowThought] = useState(false);
  const em = EM[msg.emotion||'neutral'] || EM.neutral;
  const catCol = CAT_COLOR[msg.agent_role === 'upper_class' || msg.agent_role === 'middle_class' || msg.agent_role === 'working_class' ? 'social_class' : 'government'] || em.color;
  const intense = (msg.emotion_intensity||0) >= 80;

  return (
    <motion.div initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay: idx*0.04, duration:0.3 }}
      className="flex gap-3">
      {/* Avatar */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg relative"
          style={{ background: em.bg, border: `1px solid ${em.border}`, boxShadow: intense ? `0 0 16px ${em.color}40` : undefined }}>
          {msg.agent_flag || '🌐'}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
            style={{ background: 'rgba(0,0,0,0.9)', border: `1px solid ${em.border}` }}>{em.emoji}</div>
        </div>
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[10px] font-black" style={{ color: em.color }}>{msg.agent_name}</span>
          <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase" style={{ color:em.color, background:em.bg, border:`1px solid ${em.border}` }}>
            {em.emoji} {em.label} {intense && `· ${msg.emotion_intensity}%`}
          </span>
          {msg.message_type && msg.message_type !== 'statement' && (
            <span className="text-[7px] font-mono text-white/25 uppercase ml-auto">[{msg.message_type}]</span>
          )}
        </div>

        <div className="rounded-xl px-4 py-3 text-[10px] font-mono text-white/75 leading-relaxed relative"
          style={{ background:`linear-gradient(135deg,${em.bg},rgba(0,0,0,0.4))`, border:`1px solid ${em.border}`, boxShadow:intense?`0 0 20px ${em.color}18`:undefined }}>
          {msg.responding_to_agent && (
            <div className="text-[8px] text-white/30 mb-1.5 flex items-center gap-1">
              <span>↩</span><span>responding to {msg.responding_to_agent}</span>
            </div>
          )}
          {msg.message}
        </div>

        {/* Internal thought */}
        {msg.internal_thought && (
          <div className="mt-1.5 ml-1">
            <button onClick={() => setShowThought(!showThought)}
              className="text-[7px] font-mono italic flex items-center gap-1 transition-colors"
              style={{ color: showThought ? '#a78bfa' : 'rgba(255,255,255,0.2)' }}>
              💭 {showThought ? 'hide inner thought' : 'reveal inner thought'}
            </button>
            <AnimatePresence>
              {showThought && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="mt-1.5 rounded-lg px-3 py-2 text-[9px] font-mono italic leading-relaxed text-purple-200/60"
                    style={{ background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.18)', borderLeft:'2px solid rgba(167,139,250,0.4)' }}>
                    "{msg.internal_thought}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Market action */}
        {msg.market_action && (
          <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[8px] font-mono"
            style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
            📊 <span className="font-black">{msg.market_action.action}</span>
            {msg.market_action.reason && <span className="opacity-50">— {msg.market_action.reason}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AgentSociety() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);
  const prevMsgCount = useRef(0);

  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId]   = useState<string|null>(null);
  const [messages, setMessages]           = useState<any[]>([]);
  const [agentStates, setAgentStates]     = useState<any[]>([]);
  const [categories, setCategories]       = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string|null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [generating, setGenerating]       = useState(false);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);

  // Intersection observer for 3D canvas
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setCanvasVisible(true); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Scroll control
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; prevMsgCount.current = messages.length; return; }
    if (messages.length > prevMsgCount.current) {
      prevMsgCount.current = messages.length;
      msgsEndRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }
  }, [messages]);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mode:'get_conversations' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations||[]);
      setAgentStates(data.agent_states||[]);
      setCategories(data.categories||[]);
      if (data.conversations?.length && !activeConvId) setActiveConvId(data.conversations[0].id);
    } catch {}
  }, [activeConvId]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!activeConvId) return;
    setLoadingMsgs(true);
    fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'get_messages', conversation_id:activeConvId }),
    }).then(r=>r.json()).then(d=>setMessages(d.messages||[])).catch(()=>{}).finally(()=>setLoadingMsgs(false));
  }, [activeConvId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const body: any = { mode:'generate_conversation' };
      if (activeCategory !== 'all') body.category = activeCategory;
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadData();
      if (data.conversation_id) { setActiveConvId(data.conversation_id); setMessages(data.messages||[]); }
    } finally { setGenerating(false); }
  };

  // Filtered agents by category
  const filteredAgents = useMemo(() =>
    activeCategory === 'all' ? agentStates : agentStates.filter(s => s.agent_category === activeCategory),
  [agentStates, activeCategory]);

  // Agents in 3D
  const agentStateMap = useMemo(() => {
    const m: Record<string,any> = {};
    for (const s of agentStates) m[s.agent_id] = s;
    return m;
  }, [agentStates]);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const hasPanic   = messages.some(m => m.emotion === 'panicked');
  const avgTension = messages.length
    ? Math.round(messages.reduce((s,m) => s+(m.emotion_intensity||50),0)/messages.length) : 0;

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes as-beam{0%{background-position:-100% 0}100%{background-position:200% 0}}
        @keyframes as-pulse{0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
        .as-scroll::-webkit-scrollbar{width:2px} .as-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:99px}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.7)]" style={{ animation:'as-pulse 2s ease-in-out infinite' }} />
          <span className="text-[10px] font-black text-purple-400 tracking-[0.18em] uppercase">Agent Society</span>
          {agentStates.length > 0 && <span className="text-[8px] font-mono text-white/20">{agentStates.length} agents · world simulation</span>}
        </div>
        {avgTension > 0 && (
          <div className="text-[8px] font-mono px-2 py-0.5 rounded-full font-black"
            style={{ color:avgTension>=75?'#f87171':avgTension>=55?'#fb923c':'#9ca3af', background:avgTension>=75?'rgba(248,113,113,0.1)':'rgba(255,255,255,0.04)', border:`1px solid ${avgTension>=75?'rgba(248,113,113,0.3)':'rgba(255,255,255,0.08)'}` }}>
            TENSION {avgTension}%
          </div>
        )}
        <div className="flex-1" />
        <button onClick={generate} disabled={generating}
          className="flex items-center gap-1.5 text-[8px] font-black px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 uppercase tracking-wider"
          style={{ color:'#a855f7', background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)' }}>
          {generating ? '⟳ Generating...' : '⚡ New Conversation'}
        </button>
      </div>

      {/* ── Category filter ────────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1 p-1.5 rounded-xl" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
          {categories.map((cat: any) => {
            const col = cat.id === 'all' ? '#a855f7' : CAT_COLOR[cat.id] || '#9ca3af';
            const count = cat.id === 'all' ? agentStates.length : agentStates.filter(s=>s.agent_category===cat.id).length;
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black transition-all uppercase tracking-wider"
                style={{ color: activeCategory===cat.id ? col : 'rgba(255,255,255,0.3)', background: activeCategory===cat.id ? `${col}14` : 'transparent', border: activeCategory===cat.id ? `1px solid ${col}35` : '1px solid transparent' }}>
                {CAT_ICON[cat.id] || '🌐'} {cat.label}
                {count > 0 && <span className="opacity-50 font-mono">({count})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main layout: 3D globe + agent roster + conversation ────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">

        {/* Left: agent roster */}
        <div className="space-y-3">
          {/* Agent roster */}
          <div className="as-scroll overflow-y-auto space-y-1.5" style={{ maxHeight: 520 }}>
            {filteredAgents.length === 0 && (
              <div className="text-center py-8 text-[9px] font-mono text-white/25">
                {agentStates.length === 0 ? 'Generate a conversation to load agents' : 'No agents in this category'}
              </div>
            )}
            {filteredAgents.map(state => (
              <AgentCard key={state.agent_id} state={state}
                isSelected={selectedAgent === state.agent_id}
                onClick={() => setSelectedAgent(selectedAgent === state.agent_id ? null : state.agent_id)} />
            ))}
          </div>

          {/* 3D Globe */}
          <div ref={canvasRef} className="rounded-2xl overflow-hidden" style={{ height: 280, background:'#020008', border:'1px solid rgba(168,85,247,0.15)' }}>
            {canvasVisible && agentStates.length > 0 ? (
              <Canvas camera={{ position:[0,2,12], fov:50 }}>
                <color attach="background" args={['#020008']} />
                <ambientLight intensity={0.12} />
                <pointLight position={[0,8,0]} intensity={1} color="#a855f7" />
                <OrbitControls enablePan={false} minDistance={7} maxDistance={18} autoRotate autoRotateSpeed={0.25} enableDamping dampingFactor={0.08} />
                <NeuralGlobe />
                {Object.entries(AGENT_3D).map(([id, pos]) => {
                  const state = agentStateMap[id];
                  if (!state) return null;
                  return <AgentNode3D key={id} id={id} pos={pos} state={state} isSelected={selectedAgent===id} onClick={() => setSelectedAgent(selectedAgent===id?null:id)} />;
                })}
              </Canvas>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-[9px] font-mono text-purple-400/40 tracking-[0.2em]">SCROLL INTO VIEW TO LOAD</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: conversation feed */}
        <div className="flex flex-col gap-3">

          {/* Conversation tabs */}
          {conversations.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 as-scroll" style={{ scrollbarWidth:'thin' }}>
              {conversations.slice(0, 6).map(conv => (
                <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                  className="text-[7px] font-mono px-3 py-1.5 rounded-full border transition-all text-left shrink-0 max-w-[180px] truncate"
                  style={{ background: activeConvId===conv.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)', borderColor: activeConvId===conv.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.07)', color: activeConvId===conv.id ? '#a855f7' : 'rgba(255,255,255,0.3)' }}>
                  {conv.topic?.slice(0,45) || 'Conversation'}
                </button>
              ))}
            </div>
          )}

          {/* Empty / generating states */}
          {conversations.length === 0 && !generating && (
            <div className="flex-1 flex items-center justify-center rounded-2xl py-16"
              style={{ border:'1px dashed rgba(168,85,247,0.2)', background:'rgba(168,85,247,0.03)' }}>
              <div className="text-center space-y-4">
                <div className="text-5xl opacity-40">🌍</div>
                <p className="text-[11px] font-mono text-white/30">The agent society is silent.</p>
                <p className="text-[9px] font-mono text-white/15 max-w-xs">Generate a conversation to watch {'>'}30 world agents — governments, banks, companies, social classes — react to global events.</p>
                <button onClick={generate} className="text-[9px] font-mono px-6 py-3 rounded-xl font-black"
                  style={{ color:'#a855f7', background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)' }}>
                  ⚡ Activate Agent Society
                </button>
              </div>
            </div>
          )}

          {generating && (
            <div className="rounded-2xl p-10 text-center" style={{ border:'1px solid rgba(168,85,247,0.2)', background:'rgba(168,85,247,0.04)' }}>
              <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto mb-4" />
              <div className="text-[10px] font-mono text-purple-400/60 tracking-widest">
                AGENTS FORMING OPINIONS · PROCESSING WORLD EVENTS
              </div>
            </div>
          )}

          {/* Active conversation */}
          {activeConv && (
            <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border:'1px solid rgba(168,85,247,0.15)', background:'linear-gradient(180deg,rgba(5,0,15,0.95),rgba(0,0,0,0.98))', minHeight:400 }}>
              {/* Topic bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 shrink-0"
                style={{ background:'linear-gradient(90deg,rgba(168,85,247,0.06),transparent)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest shrink-0">Live Discussion</span>
                <span className="text-[9px] font-mono text-white/60 font-black flex-1 truncate">{activeConv.topic}</span>
                {hasPanic && (
                  <span className="text-[7px] font-black px-2 py-0.5 rounded-full shrink-0"
                    style={{ color:'#f87171', background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.3)', animation:'as-pulse 0.8s ease-in-out infinite' }}>
                    🚨 PANIC
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto as-scroll px-5 py-4 space-y-5" style={{ maxHeight:480 }}>
                {loadingMsgs && <div className="text-center py-6 text-[9px] font-mono text-white/20">Loading conversation...</div>}
                {selectedAgent && (
                  <div className="text-[8px] font-mono text-white/25 flex items-center gap-2 pb-2 border-b border-white/5">
                    <span>Filtering:</span>
                    <span className="text-purple-400">{agentStates.find(s=>s.agent_id===selectedAgent)?.agent_name}</span>
                    <button onClick={() => setSelectedAgent(null)} className="ml-1 text-white/20 hover:text-white/50">✕ show all</button>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {(selectedAgent
                    ? messages.filter(m => m.agent_id===selectedAgent || m.responding_to_agent===selectedAgent)
                    : messages
                  ).map((msg, i) => <AgentMessage key={msg.id} msg={msg} idx={i} />)}
                </AnimatePresence>
                <div ref={msgsEndRef} />
              </div>

              {/* Footer stats */}
              {messages.length > 0 && (
                <div className="flex items-center gap-4 px-5 py-2.5 border-t border-white/4 shrink-0" style={{ background:'rgba(0,0,0,0.5)' }}>
                  <span className="text-[7px] font-mono text-white/20">{messages.length} messages</span>
                  <span className="text-[7px] font-mono text-white/12">·</span>
                  <span className="text-[7px] font-mono text-white/20">{messages.filter(m=>m.internal_thought).length} hidden thoughts</span>
                  {messages.some(m=>(m.emotion_intensity||0)>=80) && (
                    <span className="ml-auto text-[7px] font-mono text-red-400/70">⚠ extreme emotions</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
