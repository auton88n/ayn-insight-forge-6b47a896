/**
 * AgentSociety v4 — Full-screen immersive world simulation
 * Layout: Large 3D globe LEFT | Agent list + conversation RIGHT
 * Clicking a node on the globe or a card filters the conversation feed
 */
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

// ─── Emotion config ───────────────────────────────────────────────────────────
const EM: Record<string, { emoji: string; color: string; bg: string; border: string; label: string }> = {
  neutral:    { emoji:'😐', color:'#9ca3af', bg:'rgba(156,163,175,0.06)', border:'rgba(156,163,175,0.2)',  label:'Neutral'    },
  confident:  { emoji:'😤', color:'#34d399', bg:'rgba(52,211,153,0.08)',  border:'rgba(52,211,153,0.3)',   label:'Confident'  },
  panicked:   { emoji:'😱', color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.45)', label:'Panicking'  },
  happy:      { emoji:'😊', color:'#fde047', bg:'rgba(253,224,71,0.08)',  border:'rgba(253,224,71,0.3)',   label:'Happy'      },
  angry:      { emoji:'😡', color:'#ef4444', bg:'rgba(239,68,68,0.14)',   border:'rgba(239,68,68,0.5)',    label:'Furious'    },
  worried:    { emoji:'😟', color:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.3)',   label:'Worried'    },
  suspicious: { emoji:'🤨', color:'#a78bfa', bg:'rgba(167,139,250,0.08)', border:'rgba(167,139,250,0.3)',  label:'Suspicious' },
  excited:    { emoji:'🤩', color:'#22d3ee', bg:'rgba(34,211,238,0.08)',  border:'rgba(34,211,238,0.3)',   label:'Excited'    },
  sad:        { emoji:'😢', color:'#60a5fa', bg:'rgba(96,165,250,0.08)',  border:'rgba(96,165,250,0.25)',  label:'Sad'        },
  tense:      { emoji:'😬', color:'#fb923c', bg:'rgba(251,146,60,0.1)',   border:'rgba(251,146,60,0.35)',  label:'Tense'      },
};

const CAT_COLOR: Record<string, string> = {
  government:'#06b6d4', central_bank:'#fbbf24', stock_market:'#f472b6',
  bank:'#a78bfa', company:'#34d399', social_class:'#fb923c',
  institution:'#8b5cf6', market:'#f472b6',
};
const CAT_ICON: Record<string, string> = {
  government:'🏛', central_bank:'🏦', stock_market:'📈',
  bank:'🏢', company:'💼', social_class:'👥',
  institution:'🌐', market:'📊',
};

// ─── Agent 3D positions (all 80+ mapped to sphere surface) ───────────────────
const AGENT_3D: Record<string, [number,number,number]> = {
  // Governments
  usa:[0,3.6,0], china:[3.2,1.2,1.2], russia:[2.7,-1.3,2], eu:[-1,-3,1.6],
  germany:[-1.8,2.8,1.5], france:[-2.2,2.2,1.8], uk:[-2.8,2,0.8],
  saudi:[-0.9,-0.9,3.3], iran:[-3.4,-1,-0.5], israel:[-3,1.8,-0.9],
  india:[2.8,0.2,-2.2], japan:[-2.5,2.2,-2], turkey:[-2,0.5,2.8],
  uae:[0.5,-1.5,3.3], south_korea:[-3,1,-1.8], brazil:[-0.5,-3.2,-1.5],
  mexico:[1.5,-2.5,-2.2], south_africa:[0.5,-3.5,0.5], nigeria:[-1.5,-3,1.2], indonesia:[2,-2,2.5],
  // Central banks
  fed:[0,1.6,-3.2], ecb:[-1.2,1.4,-3.2], pboc:[2.5,0,-2.5],
  boj:[-2.8,0.8,-2.2], boe:[-2.5,1.5,-2.5], rbi:[2.2,-1,-2.8], rba:[2.5,-2.5,-1.5],
  // Stock markets
  sp500:[1.2,3,1], nasdaq:[0.8,3.2,0.5], shanghai_comp:[3,0.8,-1.5],
  nikkei:[-2.2,2.5,-1.5], ftse:[-2.8,1.8,-1], dax:[-2,2.4,1.2],
  crypto_mkt:[2,-0.5,-3], gold_market:[1.5,-0.5,-3.3], oil_market:[3.5,-0.5,0.5],
  // Banks
  jpmorgan:[0.8,-2.4,-2.8], goldman:[1.2,-2.2,-2.8], blackrock:[1.2,0.7,3.3],
  hsbc:[-0.5,1,-3.5], ubs:[-1.5,0.5,-3.3], deutsche_bank:[-2.2,1,-2.8],
  boc:[3.5,0.5,0.5], saudiarabia_ndb:[0,-1.5,-3.4],
  // Companies
  nvidia:[2.2,2.6,-1.8], apple:[1.8,2.8,-1.5], microsoft:[1.4,2.6,-2],
  tesla:[2,2,-2.5], aramco:[1,0,-3.5], byd:[3.2,0.2,-1.2],
  amazon:[2.2,1.8,-2.2], tsmc:[-3,0.5,-1.8], imf:[0,-2,-3],
  // Social classes
  us_upper:[0.4,3.4,0.8], us_upper_middle:[0.8,3.2,1], us_middle:[1.8,-2.8,1.8],
  us_working:[2.2,-2.5,1.5], china_urban_youth:[3.2,0,-1.8],
  china_middle:[3,-0.5,-1.2], china_rural:[3.5,-0.5,0.2],
  eu_middle:[-2,-2.5,1.5], german_worker:[-2.5,-2,1.2],
  uk_middle:[-3,-1.2,-1.5], saudi_youth:[-0.2,-1.2,3.4],
  india_middle:[2.5,-1.2,-2.2], india_poor:[3,-1.5,-1.5],
  global_south_poor:[0,-3,-2], russian_citizen:[3,-0.8,1.5],
  japanese_salaryman:[-2.8,1,-2],
};

// Normalize all to sphere radius 4.2 (bigger globe = more impressive)
const R = 4.2;
Object.keys(AGENT_3D).forEach(id => {
  const p = AGENT_3D[id];
  const len = Math.sqrt(p[0]**2+p[1]**2+p[2]**2);
  if (len > 0) AGENT_3D[id] = [p[0]*R/len, p[1]*R/len, p[2]*R/len];
});

// ─── Dense Neural Globe ───────────────────────────────────────────────────────
function NeuralGlobe({ agentStateMap, selectedAgent, hoveredAgent, onAgentClick, onAgentHover }: {
  agentStateMap: Record<string,any>;
  selectedAgent: string|null;
  hoveredAgent: string|null;
  onAgentClick: (id:string) => void;
  onAgentHover: (id:string|null) => void;
}) {
  const count = 800; // More dots = denser globe
  const { positions, linePositions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2*(i+0.5)/count);
      const theta = Math.PI*(1+Math.sqrt(5))*(i+0.5);
      const x = R*Math.cos(theta)*Math.sin(phi);
      const y = R*Math.cos(phi);
      const z = R*Math.sin(theta)*Math.sin(phi);
      pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      pts.push(new THREE.Vector3(x,y,z));
    }
    const lines: number[] = [];
    for (let i = 0; i < count; i++) {
      let conn = 0;
      for (let j = i+1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < 0.85) {
          lines.push(pts[i].x,pts[i].y,pts[i].z,pts[j].x,pts[j].y,pts[j].z);
          if (++conn > 4) break;
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
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(0.25,'rgba(139,92,246,0.9)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useFrame((_,dt) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.035;
      groupRef.current.rotation.x += dt * 0.012;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Dense point cloud */}
      <points geometry={pointsGeo}>
        <pointsMaterial size={0.09} map={tex} transparent opacity={0.75}
          sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      {/* Neural connections */}
      <lineSegments geometry={linesGeo}>
        <lineBasicMaterial color="#6d28d9" transparent opacity={0.06}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {/* Inner atmosphere */}
      <mesh>
        <sphereGeometry args={[R*0.96,32,32]} />
        <meshBasicMaterial color="#010008" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* Outer glow shell */}
      <mesh>
        <sphereGeometry args={[R*1.02,32,32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.03}
          side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {/* Agent nodes */}
      {Object.entries(AGENT_3D).map(([id, pos]) => {
        const state = agentStateMap[id];
        if (!state) return null;
        const em = EM[state.current_emotion||'neutral'] || EM.neutral;
        const catCol = CAT_COLOR[state.agent_category||'government'] || '#06b6d4';
        const isSelected = selectedAgent === id;
        const isHovered  = hoveredAgent === id;
        const intense = (state.emotion_intensity||0) >= 75;
        return (
          <group key={id} position={pos as [number,number,number]}>
            {/* Outer glow aura */}
            <mesh
              onClick={(e) => { e.stopPropagation(); onAgentClick(id); }}
              onPointerOver={(e) => { e.stopPropagation(); onAgentHover(id); document.body.style.cursor='pointer'; }}
              onPointerOut={() => { onAgentHover(null); document.body.style.cursor='default'; }}>
              <sphereGeometry args={[isSelected?0.28:isHovered?0.24:0.18, 16,16]} />
              <meshBasicMaterial color={catCol} transparent
                opacity={isSelected?0.85:isHovered?0.65:intense?0.45:0.35}
                blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            {/* Bright core */}
            <mesh raycast={() => null}>
              <sphereGeometry args={[0.07,8,8]} />
              <meshBasicMaterial color={em.color} transparent opacity={0.95}
                blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            {/* Label on hover/select */}
            {(isSelected || isHovered) && (
              <Billboard>
                <Text position={[0.3, 0.3, 0]} fontSize={0.18} color={catCol}
                  anchorX="left" fillOpacity={1} outlineWidth={0.02} outlineColor="#010008">
                  {state.agent_name}
                </Text>
                <Text position={[0.3, 0.1, 0]} fontSize={0.12} color={em.color}
                  anchorX="left" fillOpacity={0.8} outlineWidth={0.015} outlineColor="#010008">
                  {em.emoji} {em.label}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ─── Agent card (slim list item) ─────────────────────────────────────────────
function AgentCard({ state, isSelected, onClick }: {
  state: any; isSelected: boolean; onClick: () => void;
}) {
  const em = EM[state.current_emotion||'neutral'] || EM.neutral;
  const catCol = CAT_COLOR[state.agent_category||'government'] || '#9ca3af';
  const intense = (state.emotion_intensity||0) >= 75;

  return (
    <button onClick={onClick} className="w-full text-left transition-all duration-150 group"
      style={{
        background: isSelected ? `${catCol}10` : 'rgba(255,255,255,0.015)',
        border: `1px solid ${isSelected ? `${catCol}35` : 'rgba(255,255,255,0.06)'}`,
        borderTop: `1px solid ${isSelected ? `${catCol}60` : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 10,
        padding: '9px 12px',
        marginBottom: 4,
      }}>
      <div className="flex items-center gap-2.5">
        {/* Emoji */}
        <div className="text-[16px] leading-none shrink-0 relative">
          {em.emoji}
          {intense && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: em.color, boxShadow: `0 0 4px ${em.color}`, animation:'as-pulse 1s ease-in-out infinite' }} />}
        </div>
        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-white/85 truncate leading-tight">{state.agent_name}</span>
          </div>
          <div className="text-[7.5px] font-mono uppercase tracking-wider mt-0.5 truncate"
            style={{ color: catCol, opacity: 0.75 }}>
            {CAT_ICON[state.agent_category||'government']} {state.agent_category?.replace('_',' ')}
            {state.country && state.country !== 'GLOBAL' && ` · ${state.country}`}
          </div>
        </div>
        {/* Emotion + intensity */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[8px] font-black uppercase" style={{ color: em.color }}>{em.label}</span>
          <div className="flex gap-0.5">
            {[20,40,60,80,100].map(t => (
              <div key={t} className="rounded-full" style={{
                width: 3, height: 10,
                background: (state.emotion_intensity||0) >= t ? em.color : 'rgba(255,255,255,0.06)',
                boxShadow: (state.emotion_intensity||0) >= t ? `0 0 3px ${em.color}` : undefined,
              }} />
            ))}
          </div>
        </div>
      </div>
      {/* Key concern on select */}
      {isSelected && state.key_concern && (
        <div className="mt-2 text-[9px] font-mono text-white/40 leading-snug line-clamp-2 pt-2 border-t border-white/6">
          {state.key_concern}
        </div>
      )}
      {/* Wins/loses on select */}
      {isSelected && (state.wins_from || state.loses_from) && (
        <div className="mt-1.5 space-y-0.5">
          {state.wins_from && <div className="text-[8px] font-mono text-emerald-400/60 leading-snug">✅ {state.wins_from.slice(0,70)}</div>}
          {state.loses_from && <div className="text-[8px] font-mono text-red-400/60 leading-snug">❌ {state.loses_from.slice(0,70)}</div>}
        </div>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function AgentMessage({ msg, idx }: { msg: any; idx: number }) {
  const [showThought, setShowThought] = useState(false);
  const em = EM[msg.emotion||'neutral'] || EM.neutral;
  const intense = (msg.emotion_intensity||0) >= 80;

  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      transition={{ delay: idx*0.03, duration:0.25 }}
      className="flex gap-3 pb-4 border-b border-white/4 last:border-0">
      {/* Avatar */}
      <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[18px] relative"
        style={{
          background: em.bg,
          border: `1px solid ${em.border}`,
          boxShadow: intense ? `0 0 20px ${em.color}35` : undefined,
        }}>
        {msg.agent_flag || '🌐'}
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
          style={{ background:'rgba(0,0,0,0.95)', border:`1px solid ${em.border}` }}>
          {em.emoji}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + emotion badge */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[11px] font-black" style={{ color: em.color }}>{msg.agent_name}</span>
          <span className="text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ color:em.color, background:em.bg, border:`1px solid ${em.border}` }}>
            {em.emoji} {em.label}{intense ? ` · ${msg.emotion_intensity}%` : ''}
          </span>
          {msg.responding_to_agent && (
            <span className="text-[7px] font-mono text-white/25 flex items-center gap-0.5">
              ↩ {msg.responding_to_agent}
            </span>
          )}
          {msg.message_type && msg.message_type !== 'statement' && (
            <span className="text-[7px] font-mono text-white/20 uppercase ml-auto">[{msg.message_type}]</span>
          )}
        </div>

        {/* Message */}
        <div className="rounded-xl px-4 py-3 text-[10.5px] font-mono text-white/78 leading-[1.8] relative"
          style={{
            background: `linear-gradient(135deg, ${em.bg}, rgba(0,0,0,0.45))`,
            border: `1px solid ${em.border}`,
            borderTop: `1px solid ${em.color}35`,
            boxShadow: intense ? `0 0 24px ${em.color}15` : undefined,
          }}>
          {msg.message}
        </div>

        {/* Internal thought */}
        {msg.internal_thought && (
          <div className="mt-2">
            <button onClick={() => setShowThought(!showThought)}
              className="text-[7.5px] font-mono italic flex items-center gap-1 transition-colors"
              style={{ color: showThought ? '#c4b5fd' : 'rgba(255,255,255,0.2)' }}>
              💭 {showThought ? 'hide thought' : 'reveal inner thought'}
            </button>
            <AnimatePresence>
              {showThought && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="mt-1.5 rounded-lg px-3 py-2.5 text-[9.5px] font-mono italic leading-relaxed"
                    style={{ color:'#c4b5fd', background:'rgba(167,139,250,0.06)', border:'1px solid rgba(167,139,250,0.2)', borderLeft:'2px solid rgba(167,139,250,0.45)' }}>
                    "{msg.internal_thought}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Market action */}
        {msg.market_action && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[8.5px] font-mono"
            style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
            📊 <span className="font-black">{msg.market_action.action}</span>
            {msg.market_action.reason && <span className="opacity-50">— {msg.market_action.reason}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AgentSociety() {
  const canvasRef    = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const msgsEndRef   = useRef<HTMLDivElement>(null);
  const isMounted    = useRef(false);
  const prevCount    = useRef(0);

  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId]   = useState<string|null>(null);
  const [messages, setMessages]           = useState<any[]>([]);
  const [agentStates, setAgentStates]     = useState<any[]>([]);
  const [categories, setCategories]       = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string|null>(null);
  const [hoveredAgent, setHoveredAgent]   = useState<string|null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [generating, setGenerating]       = useState(false);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);

  // Intersection observer for 3D canvas
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setCanvasReady(true); obs.disconnect(); }
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (!isMounted.current) { isMounted.current=true; prevCount.current=messages.length; return; }
    if (messages.length > prevCount.current) {
      prevCount.current = messages.length;
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

  const agentStateMap = useMemo(() => {
    const m: Record<string,any> = {};
    for (const s of agentStates) m[s.agent_id] = s;
    return m;
  }, [agentStates]);

  const filteredAgents = useMemo(() =>
    activeCategory === 'all' ? agentStates : agentStates.filter(s => s.agent_category === activeCategory),
  [agentStates, activeCategory]);

  // Filter messages by selected agent
  const visibleMessages = useMemo(() =>
    selectedAgent
      ? messages.filter(m => m.agent_id===selectedAgent || m.responding_to_agent===selectedAgent)
      : messages,
  [messages, selectedAgent]);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const hasPanic   = messages.some(m => m.emotion==='panicked');
  const avgTension = messages.length
    ? Math.round(messages.reduce((s,m)=>s+(m.emotion_intensity||50),0)/messages.length) : 0;

  return (
    <div style={{ height: 'calc(100vh - 130px)', minHeight: 600, display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes as-pulse{0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}
        @keyframes as-beam{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
        .as-scroll::-webkit-scrollbar{width:3px}
        .as-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:99px}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1 pb-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-400"
            style={{ boxShadow:'0 0 8px rgba(168,85,247,0.8)', animation:'as-pulse 2s ease-in-out infinite' }} />
          <span className="text-[10px] font-black text-purple-400 tracking-[0.18em] uppercase">Agent Society</span>
          {agentStates.length > 0 && (
            <span className="text-[8px] font-mono text-white/20">{agentStates.length} agents · world simulation</span>
          )}
        </div>
        {avgTension > 0 && (
          <div className="text-[8px] font-mono px-2.5 py-0.5 rounded-full font-black"
            style={{ color:avgTension>=75?'#f87171':avgTension>=55?'#fb923c':'#9ca3af', background:avgTension>=75?'rgba(248,113,113,0.1)':'rgba(255,255,255,0.04)', border:`1px solid ${avgTension>=75?'rgba(248,113,113,0.3)':'rgba(255,255,255,0.08)'}` }}>
            GLOBAL TENSION {avgTension}%
          </div>
        )}
        {hasPanic && (
          <div className="text-[8px] font-black px-2.5 py-0.5 rounded-full"
            style={{ color:'#f87171', background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)', animation:'as-pulse 0.8s ease-in-out infinite' }}>
            🚨 AGENT PANIC
          </div>
        )}
        <div className="flex-1" />
        <button onClick={generate} disabled={generating}
          className="flex items-center gap-1.5 text-[8px] font-black px-4 py-2 rounded-lg transition-all disabled:opacity-40 uppercase tracking-wider"
          style={{ color:'#a855f7', background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)' }}>
          {generating ? '⟳ Generating...' : '⚡ New Conversation'}
        </button>
      </div>

      {/* ── Category filter ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 pb-3 shrink-0">
        {categories.map((cat:any) => {
          const col = cat.id==='all' ? '#a855f7' : CAT_COLOR[cat.id] || '#9ca3af';
          const count = cat.id==='all' ? agentStates.length : agentStates.filter((s:any)=>s.agent_category===cat.id).length;
          return (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-black transition-all uppercase tracking-wider"
              style={{ color:activeCategory===cat.id?col:'rgba(255,255,255,0.3)', background:activeCategory===cat.id?`${col}14`:'rgba(255,255,255,0.03)', border:activeCategory===cat.id?`1px solid ${col}35`:'1px solid rgba(255,255,255,0.06)' }}>
              {CAT_ICON[cat.id]||'🌐'} {cat.label}
              {count > 0 && <span className="opacity-50 font-mono ml-0.5">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Main: Globe LEFT + Agents+Conversation RIGHT ──────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px] gap-4">

        {/* ── LEFT: Big 3D globe ──────────────────────────────────────────── */}
        <div ref={canvasRef} className="relative rounded-2xl overflow-hidden"
          style={{ background:'#010008', border:'1px solid rgba(168,85,247,0.15)', minHeight:400 }}>
          {/* Header overlay */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
            style={{ background:'linear-gradient(180deg,rgba(1,0,8,0.9),transparent)' }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"
                style={{ boxShadow:'0 0 6px rgba(168,85,247,0.8)' }} />
              <span className="text-[9px] font-black text-purple-400 tracking-[0.18em]">AGENT NETWORK // 3D</span>
              <span className="text-[7px] font-mono text-white/20">{Object.keys(agentStateMap).length} nodes</span>
            </div>
            <span className="text-[7px] font-mono text-white/20">DRAG · SCROLL · CLICK NODE</span>
          </div>

          {canvasReady ? (
            <Canvas camera={{ position:[0,0,14], fov:52 }} className="w-full h-full">
              <color attach="background" args={['#010008']} />
              <ambientLight intensity={0.1} />
              <pointLight position={[0,8,0]} intensity={1.2} color="#a855f7" />
              <pointLight position={[6,-4,4]} intensity={0.7} color="#6366f1" />
              <pointLight position={[-6,4,-4]} intensity={0.5} color="#22d3ee" />
              <OrbitControls enablePan={false} minDistance={9} maxDistance={22}
                autoRotate autoRotateSpeed={0.3} enableDamping dampingFactor={0.08} />
              <NeuralGlobe
                agentStateMap={agentStateMap}
                selectedAgent={selectedAgent}
                hoveredAgent={hoveredAgent}
                onAgentClick={(id) => setSelectedAgent(selectedAgent===id ? null : id)}
                onAgentHover={setHoveredAgent}
              />
            </Canvas>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto" />
                <p className="text-[9px] font-mono text-purple-400/40 tracking-[0.2em]">LOADING AGENT NETWORK</p>
              </div>
            </div>
          )}

          {/* Selected agent info overlay */}
          <AnimatePresence>
            {selectedAgent && agentStateMap[selectedAgent] && (() => {
              const state = agentStateMap[selectedAgent];
              const em = EM[state.current_emotion||'neutral'] || EM.neutral;
              const catCol = CAT_COLOR[state.agent_category||'government'] || '#9ca3af';
              return (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:8 }}
                  className="absolute bottom-4 left-4 right-4 rounded-xl overflow-hidden z-10"
                  style={{ background:'rgba(1,0,15,0.95)', backdropFilter:'blur(16px)', border:`1px solid ${catCol}30`, borderTop:`1px solid ${catCol}55` }}>
                  {/* Beam */}
                  <div className="absolute top-0 left-0 right-0 h-px"
                    style={{ background:`linear-gradient(90deg,transparent,${catCol}cc,transparent)`, animation:'as-beam 2.5s ease-in-out infinite' }} />
                  <div className="p-3 flex items-start gap-3">
                    <div className="text-2xl shrink-0">{state.agent_flag||'🌐'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-black" style={{ color:catCol }}>{state.agent_name}</span>
                        <span className="text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase"
                          style={{ color:em.color, background:em.bg, border:`1px solid ${em.border}` }}>
                          {em.emoji} {em.label}
                        </span>
                        <button onClick={() => setSelectedAgent(null)} className="ml-auto text-white/30 hover:text-white text-sm font-mono">✕</button>
                      </div>
                      {state.key_concern && (
                        <p className="text-[9px] font-mono text-white/45 leading-snug">{state.key_concern.slice(0,120)}</p>
                      )}
                      <div className="flex gap-3 mt-1.5">
                        {state.wins_from && <div className="text-[8px] font-mono text-emerald-400/60">✅ {state.wins_from.slice(0,50)}</div>}
                        {state.loses_from && <div className="text-[8px] font-mono text-red-400/60">❌ {state.loses_from.slice(0,50)}</div>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* ── RIGHT: Agent list + Conversation feed ───────────────────────── */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* Agent roster (scrollable) */}
          <div className="shrink-0" style={{ maxHeight:'35%', minHeight: 160, overflowY:'auto' }}
            data-class="as-scroll">
            <div style={{ paddingRight: 4 }}>
              {filteredAgents.length === 0 && (
                <div className="text-center py-6 text-[9px] font-mono text-white/25">
                  {agentStates.length === 0
                    ? 'Generate a conversation to load agents'
                    : 'No agents in this category'}
                </div>
              )}
              {filteredAgents.map(state => (
                <AgentCard key={state.agent_id} state={state}
                  isSelected={selectedAgent===state.agent_id}
                  onClick={() => setSelectedAgent(selectedAgent===state.agent_id ? null : state.agent_id)} />
              ))}
            </div>
          </div>

          {/* Conversation feed */}
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
            style={{ border:'1px solid rgba(168,85,247,0.15)', background:'linear-gradient(180deg,rgba(5,0,15,0.96),rgba(0,0,0,0.99))' }}>

            {/* Conv topic bar */}
            {activeConv ? (
              <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/5"
                style={{ background:'linear-gradient(90deg,rgba(168,85,247,0.07),transparent)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest shrink-0">Discussion</span>
                <span className="text-[9px] font-mono text-white/65 font-black flex-1 truncate">{activeConv.topic}</span>
                {selectedAgent && (
                  <button onClick={() => setSelectedAgent(null)}
                    className="text-[7px] font-mono text-purple-400/60 hover:text-purple-400 shrink-0 transition-colors">
                    ✕ Show all
                  </button>
                )}
              </div>
            ) : (
              <div className="shrink-0 px-4 py-2.5 border-b border-white/5">
                <span className="text-[9px] font-mono text-white/20">No conversation yet</span>
              </div>
            )}

            {/* Conv tabs */}
            {conversations.length > 0 && (
              <div className="shrink-0 flex gap-1 px-3 py-2 overflow-x-auto border-b border-white/4 as-scroll">
                {conversations.slice(0,6).map(conv => (
                  <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                    className="text-[7px] font-mono px-2.5 py-1 rounded-full border transition-all shrink-0 max-w-[160px] truncate"
                    style={{ background:activeConvId===conv.id?'rgba(168,85,247,0.14)':'rgba(255,255,255,0.02)', borderColor:activeConvId===conv.id?'rgba(168,85,247,0.4)':'rgba(255,255,255,0.06)', color:activeConvId===conv.id?'#a855f7':'rgba(255,255,255,0.28)' }}>
                    {conv.topic?.slice(0,40)||'Conversation'}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {conversations.length === 0 && !generating && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4 px-6">
                  <div className="text-5xl opacity-30">🌍</div>
                  <p className="text-[11px] font-mono text-white/30">The agent society is silent.</p>
                  <p className="text-[9px] font-mono text-white/15 leading-relaxed">
                    80+ world agents — governments, banks, companies, social classes — will react to live global events.
                  </p>
                  <button onClick={generate}
                    className="text-[9px] font-mono px-6 py-2.5 rounded-xl font-black"
                    style={{ color:'#a855f7', background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)' }}>
                    ⚡ Activate
                  </button>
                </div>
              </div>
            )}

            {generating && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto" />
                  <div className="text-[9px] font-mono text-purple-400/50 tracking-widest">AGENTS FORMING OPINIONS</div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto as-scroll px-4 py-4 space-y-0">
              {loadingMsgs && (
                <div className="text-center py-8 text-[9px] font-mono text-white/20">Loading conversation...</div>
              )}
              <AnimatePresence initial={false}>
                {visibleMessages.map((msg, i) => (
                  <AgentMessage key={msg.id} msg={msg} idx={i} />
                ))}
              </AnimatePresence>
              <div ref={msgsEndRef} />
            </div>

            {/* Footer stats */}
            {messages.length > 0 && (
              <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-t border-white/4"
                style={{ background:'rgba(0,0,0,0.6)' }}>
                <span className="text-[7px] font-mono text-white/20">{messages.length} messages</span>
                <span className="text-[7px] font-mono text-white/12">·</span>
                <span className="text-[7px] font-mono text-white/20">{messages.filter(m=>m.internal_thought).length} hidden thoughts</span>
                {messages.some(m=>(m.emotion_intensity||0)>=80) && (
                  <span className="ml-auto text-[7px] font-mono text-red-400/60">⚠ extreme emotions detected</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
