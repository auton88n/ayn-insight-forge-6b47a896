import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Text, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';


// ─── Agent Society Component ──────────────────────────────────────────────────
const EMOTION_CONFIG: Record<string, {
  emoji: string; color: string; bg: string; border: string; label: string; particle: string;
}> = {
  neutral:    { emoji: '😐', color: '#9ca3af', bg: 'rgba(156,163,175,0.06)', border: 'rgba(156,163,175,0.15)', label: 'Neutral',    particle: '' },
  confident:  { emoji: '😤', color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  label: 'Confident',  particle: '⬆' },
  panicked:   { emoji: '😱', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.4)',  label: 'PANICKING',  particle: '‼' },
  happy:      { emoji: '😊', color: '#fde047', bg: 'rgba(253,224,71,0.08)',  border: 'rgba(253,224,71,0.25)',  label: 'Happy',      particle: '✦' },
  angry:      { emoji: '😡', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.45)',   label: 'FURIOUS',    particle: '✕' },
  worried:    { emoji: '😟', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  label: 'Worried',    particle: '?' },
  suspicious: { emoji: '🤨', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)', label: 'Suspicious', particle: '•' },
  excited:    { emoji: '🤩', color: '#22d3ee', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.25)',  label: 'Excited',    particle: '★' },
  sad:        { emoji: '😢', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',   label: 'Sad',        particle: '▼' },
  tense:      { emoji: '😬', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.3)',   label: 'Tense',      particle: '~' },
};

const ROLE_BADGE: Record<string, { icon: string; color: string }> = {
  government:   { icon: '🏛', color: '#9ca3af' },
  central_bank: { icon: '🏦', color: '#fde047' },
  market:       { icon: '📊', color: '#34d399' },
  military:     { icon: '⚔',  color: '#f87171' },
};

function EmotionMeter({ intensity, color }: { intensity: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 items-center" style={{ height: 36 }}>
      {[...Array(5)].map((_, i) => {
        const threshold = (5 - i) * 20;
        const active = intensity >= threshold;
        return (
          <div key={i} className="w-1 rounded-full transition-all duration-500"
            style={{
              height: 5,
              backgroundColor: active ? color : 'rgba(255,255,255,0.06)',
              boxShadow: active ? `0 0 4px ${color}` : 'none',
              opacity: active ? 0.9 : 0.3,
            }} />
        );
      })}
    </div>
  );
}

function AgentAvatar({ flag, emotion, size = 'md' }: { flag: string; emotion: string; size?: 'sm' | 'md' | 'lg' }) {
  const em = EMOTION_CONFIG[emotion] || EMOTION_CONFIG.neutral;
  const sz = size === 'lg' ? 52 : size === 'md' ? 38 : 28;
  const fontSize = size === 'lg' ? 28 : size === 'md' ? 20 : 14;
  const isExtreme = ['panicked', 'angry'].includes(emotion);

  return (
    <div className="relative flex-shrink-0" style={{ width: sz, height: sz }}>
      {/* Outer glow ring — pulses on extreme emotion */}
      <div className="absolute inset-0 rounded-xl transition-all duration-700"
        style={{
          border: `1px solid ${em.border}`,
          boxShadow: isExtreme ? `0 0 20px ${em.color}55, 0 0 40px ${em.color}22` : `0 0 8px ${em.color}22`,
          animation: isExtreme ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />
      {/* Face */}
      <div className="absolute inset-0.5 rounded-xl flex items-center justify-center"
        style={{ background: em.bg, backdropFilter: 'blur(8px)' }}>
        <span style={{ fontSize }}>{flag}</span>
      </div>
      {/* Emotion emoji — bottom right */}
      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
        style={{ background: 'rgba(0,0,0,0.9)', border: `1px solid ${em.border}`, zIndex: 10 }}>
        {em.emoji}
      </div>
    </div>
  );
}

function AgentMessage({ msg, prev, idx }: { msg: any; prev: any; idx: number }) {
  const [showThought, setShowThought] = useState(false);
  const em = EMOTION_CONFIG[msg.emotion] || EMOTION_CONFIG.neutral;
  const intensity = msg.emotion_intensity || 50;
  const isExtreme = intensity >= 80;
  const isNew = idx === 0;

  // Message type accent
  const typeAccent = msg.message_type === 'warning' ? '#ef4444'
    : msg.message_type === 'decision' ? '#34d399'
    : msg.message_type === 'question' ? '#60a5fa'
    : msg.message_type === 'reaction' ? em.color
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 group"
    >
      {/* Avatar + meter */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
        <AgentAvatar flag={msg.agent_flag || '🏛'} emotion={msg.emotion} size="md" />
        <EmotionMeter intensity={intensity} color={em.color} />
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Name bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono font-black" style={{ color: em.color }}>{msg.agent_name}</span>
          {ROLE_BADGE[msg.agent_role] && (
            <span className="text-[8px]" style={{ color: ROLE_BADGE[msg.agent_role].color }}>
              {ROLE_BADGE[msg.agent_role].icon}
            </span>
          )}
          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-full font-bold"
            style={{ color: em.color, background: em.bg, border: `1px solid ${em.border}` }}>
            {em.emoji} {em.label}
            {em.particle && <span className="ml-0.5 opacity-70">{em.particle}</span>}
          </span>
          {isExtreme && (
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-[7px] font-mono font-black"
              style={{ color: em.color }}
            >
              {intensity}% INTENSITY
            </motion.span>
          )}
          {msg.message_type !== 'statement' && (
            <span className="ml-auto text-[6px] font-mono uppercase tracking-widest"
              style={{ color: typeAccent || 'rgba(255,255,255,0.2)' }}>
              [{msg.message_type}]
            </span>
          )}
        </div>

        {/* Message bubble */}
        <div className="relative rounded-xl px-4 py-3 text-[10px] font-mono text-white/75 leading-relaxed"
          style={{
            background: `linear-gradient(135deg, ${em.bg}, rgba(0,0,0,0.4))`,
            border: `1px solid ${em.border}`,
            boxShadow: isExtreme ? `0 0 24px ${em.color}22, inset 0 1px 0 ${em.color}15` : `inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
          {/* Type accent bar */}
          {typeAccent && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ background: typeAccent, boxShadow: `0 0 6px ${typeAccent}` }} />
          )}
          {msg.responding_to_agent && (
            <div className="text-[8px] mb-1.5 opacity-40 flex items-center gap-1">
              <span>↩</span>
              <span>responding to {msg.responding_to_agent}</span>
            </div>
          )}
          {msg.message}
        </div>

        {/* Internal thought toggle */}
        {msg.internal_thought && (
          <div className="mt-1.5 ml-1">
            <button onClick={() => setShowThought(!showThought)}
              className="text-[7px] font-mono italic transition-colors flex items-center gap-1"
              style={{ color: showThought ? '#a78bfa' : 'rgba(255,255,255,0.2)' }}>
              <span>💭</span>
              <span>{showThought ? 'hide inner thoughts' : 'reveal inner thoughts'}</span>
            </button>
            <AnimatePresence>
              {showThought && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg px-3 py-2 text-[9px] font-mono italic leading-relaxed"
                    style={{
                      color: '#c4b5fd',
                      background: 'rgba(167,139,250,0.06)',
                      border: '1px solid rgba(167,139,250,0.15)',
                      borderLeft: '2px solid rgba(167,139,250,0.4)',
                    }}>
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
            style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
            <span>📊</span>
            <span className="font-bold">{msg.market_action.action}</span>
            {msg.market_action.reason && <span className="opacity-50">— {msg.market_action.reason}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── 3D Agent Network using Three.js / R3F ─────────────────────────────────────

const AGENT_3D_DATA = [
  { id:'usa',       name:'United States',  flag:'🇺🇸', pos:[ 0.0,  3.6,  0.0 ] },
  { id:'china',     name:'China',          flag:'🇨🇳', pos:[ 3.2,  1.2,  1.2 ] },
  { id:'russia',    name:'Russia',         flag:'🇷🇺', pos:[ 2.7, -1.3,  2.0 ] },
  { id:'eu',        name:'EU',             flag:'🇪🇺', pos:[-1.0, -3.0,  1.6 ] },
  { id:'iran',      name:'Iran',           flag:'🇮🇷', pos:[-3.4, -1.0, -0.5 ] },
  { id:'israel',    name:'Israel',         flag:'🇮🇱', pos:[-3.0,  1.8, -0.9 ] },
  { id:'fed',       name:'Fed Reserve',    flag:'🏦',  pos:[ 0.0,  1.6, -3.2 ] },
  { id:'opec',      name:'OPEC+',          flag:'🛢',  pos:[ 3.0, -1.6,  1.0 ] },
  { id:'saudi',     name:'Saudi Arabia',   flag:'🇸🇦', pos:[-0.9, -0.9,  3.3 ] },
  { id:'blackrock', name:'BlackRock',      flag:'💰',  pos:[ 1.2,  0.7,  3.3 ] },
];

// Normalize agent positions to EXACTLY the Neural Globe radius (3.6) so they sit perfectly flush as "big nodes"
AGENT_3D_DATA.forEach(agent => {
  const len = Math.sqrt(agent.pos[0]**2 + agent.pos[1]**2 + agent.pos[2]**2);
  const scale = 3.6 / len;
  agent.pos[0] *= scale;
  agent.pos[1] *= scale;
  agent.pos[2] *= scale;
});

const AGENT_LINKS_3D = [
  { from:'usa',    to:'eu',        strength:0.90, type:'ally'    },
  { from:'usa',    to:'israel',    strength:0.95, type:'ally'    },
  { from:'usa',    to:'fed',       strength:1.00, type:'ally'    },
  { from:'usa',    to:'china',     strength:0.25, type:'rival'   },
  { from:'china',  to:'russia',    strength:0.80, type:'ally'    },
  { from:'china',  to:'opec',      strength:0.60, type:'trade'   },
  { from:'russia', to:'iran',      strength:0.85, type:'ally'    },
  { from:'russia', to:'eu',        strength:0.15, type:'hostile' },
  { from:'iran',   to:'israel',    strength:0.02, type:'hostile' },
  { from:'iran',   to:'opec',      strength:0.50, type:'trade'   },
  { from:'saudi',  to:'opec',      strength:0.90, type:'ally'    },
  { from:'saudi',  to:'usa',       strength:0.70, type:'ally'    },
  { from:'fed',    to:'blackrock', strength:0.85, type:'market'  },
  { from:'blackrock',to:'usa',     strength:0.70, type:'market'  },
  { from:'eu',     to:'fed',       strength:0.60, type:'market'  },
];

const EMOTION_COLORS: Record<string, string> = {
  neutral:'#9ca3af', confident:'#34d399', panicked:'#f87171',
  happy:'#fde047', angry:'#ef4444', worried:'#f59e0b',
  suspicious:'#a78bfa', excited:'#22d3ee', sad:'#60a5fa', tense:'#fb923c',
};

const LINK_COLORS: Record<string, string> = {
  ally:'#6366f1', rival:'#f59e0b', hostile:'#ef4444', trade:'#34d399', market:'#a78bfa',
};

function AgentNode3D({ agent, state, isSelected, isHovered, onClick, onHover }: any) {
  const meshRef = useRef<THREE.Group>(null);
  const intensity = (state?.emotion_intensity || 50) / 100;
  const isExtreme = intensity >= 0.8;
  const dotColor = '#8b5cf6';

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const time = Date.now() * 0.001;
    if (isExtreme) {
      const scale = 1 + Math.sin(time * 8) * 0.15;
      meshRef.current.scale.setScalar(scale);
    } else {
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <group position={agent.pos as [number,number,number]} ref={meshRef}>
      {/* Sci-fi "hot core" and "soft aura" look */}
      
      {/* Soft outer glow aura */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick(agent.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(agent.id); document.body.style.cursor='pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor='default'; }}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshBasicMaterial color={dotColor} transparent opacity={isSelected ? 0.7 : isHovered ? 0.5 : 0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Intense bright inner core */}
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Futuristic HUD text label */}
      <Billboard>
        {/* Connection line from core to label */}
        <Line points={[new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0.2, 0.3, 0)]} color="#a855f7" opacity={0.4} transparent lineWidth={1} />
        <Text position={[0.22, 0.3, 0]} fontSize={0.10} color="#e9d5ff" anchorX="left"
          font={undefined} fillOpacity={isHovered || isSelected ? 1 : 0.6} outlineWidth={0.02} outlineColor="#020008">
          {agent.name.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
}

// Invisible static link — only used when hover or specific UI asks for it
function AgentLink3D({ fromPos, toPos, linkType, isActive }: {
  fromPos: number[]; toPos: number[]; linkType: string; isActive: boolean;
}) {
  return null; // The user wants NO static lines, only the neural grid + moving signal lights!
}

// Glowing communication signal particle traveling between agents
function LinkParticle({ fromPos, toPos, color, speed }: any) {
  const meshRef = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random());

  useFrame((_, delta) => {
    t.current = (t.current + delta * speed) % 1;
    if (!meshRef.current) return;
    const from = new THREE.Vector3(...fromPos);
    const to = new THREE.Vector3(...toPos);
    // Add a slight arc/bulge out so it skips directly above the neural core and doesn't get fully lost inside
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(4.0); // arch through the sphere
    
    // Quadratic bezier curve interpolation
    const q0 = from.clone().lerp(mid, t.current);
    const q1 = mid.clone().lerp(to, t.current);
    meshRef.current.position.copy(q0.lerp(q1, t.current));
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// Dense Interactive Neural Sphere
function NeuralGlobe() {
  const count = 450;
  const radius = 3.6;
  const maxDistance = 1.0;

  const { positions, linePositions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const pts: THREE.Vector3[] = [];
    
    // Distribute points uniformly on a sphere using Fibonacci spiral
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      
      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(theta) * Math.sin(phi);
      
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
      pts.push(new THREE.Vector3(x, y, z));
    }

    // Connect nodes that are close to each other to form a neural mesh
    const lines: number[] = [];
    for (let i = 0; i < count; i++) {
      let connections = 0;
      for (let j = i + 1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < maxDistance) {
          lines.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
          connections++;
          if (connections > 3) break; // limit connections per node to avoid visual mess
        }
      }
    }

    return { 
      positions: pos, 
      linePositions: new Float32Array(lines) 
    };
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
  const ringsRef = useRef<THREE.Group>(null);
  
  // Custom glowing canvas texture for the neural points to make them soft circles instead of hard squares
  const pointTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(168,85,247,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
      groupRef.current.rotation.x += delta * 0.02;
    }
    if (ringsRef.current) {
      // Rotate data rings in opposite directions for sci-fi effect
      ringsRef.current.children[0].rotation.z -= delta * 0.15;
      ringsRef.current.children[1].rotation.z += delta * 0.2;
    }
  });

  return (
    <group>
      {/* Sci-fi Orbital Data Rings */}
      <group ref={ringsRef}>
        <mesh rotation={[Math.PI/2, 0, 0]}>
          <ringGeometry args={[radius * 1.08, radius * 1.085, 64, 1, 0, Math.PI * 1.6]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI/2.5, Math.PI/4, 0]}>
          <ringGeometry args={[radius * 1.25, radius * 1.253, 64, 1, 0, Math.PI * 1.3]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.3} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      <group ref={groupRef}>
        {/* Node points with soft glowing canvas texture */}
        <points geometry={pointsGeo}>
          <pointsMaterial size={0.15} map={pointTexture} transparent opacity={0.9} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
        {/* Subdued Neural connections */}
        <lineSegments geometry={linesGeo}>
          <lineBasicMaterial color="#8b5cf6" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
        {/* Hollow inner core to slightly dim back nodes */}
        <mesh>
          <sphereGeometry args={[radius * 0.98, 32, 32]} />
          <meshBasicMaterial color="#020008" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// The 3D scene
function AgentScene3D({ states, messages, selectedAgent, onSelectAgent }: any) {
  const stateMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of states) m[s.agent_id] = s;
    return m;
  }, [states]);

  const activityMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const msg of messages) m[msg.agent_id] = (m[msg.agent_id] || 0) + 1;
    return m;
  }, [messages]);

  const posMap = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const a of AGENT_3D_DATA) m[a.id] = a.pos;
    return m;
  }, []);

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      <color attach="background" args={['#020008']} />
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 8, 0]} intensity={1.2} color="#a855f7" />
      <pointLight position={[5, -4, 3]} intensity={0.8} color="#6366f1" />
      <pointLight position={[-5, 2, -3]} intensity={0.6} color="#22d3ee" />

      <OrbitControls
        enablePan={false} minDistance={8} maxDistance={22}
        autoRotate autoRotateSpeed={0.3}
        enableDamping dampingFactor={0.08}
      />

      {/* Replaced Chaotic ParticleField with Dense Neural Globe */}
      <NeuralGlobe />

      {/* Links */}
      {AGENT_LINKS_3D.map((link, i) => {
        const fromPos = posMap[link.from];
        const toPos = posMap[link.to];
        if (!fromPos || !toPos) return null;
        const isActive = (activityMap[link.from] || 0) > 0 && (activityMap[link.to] || 0) > 0;
        return (
          <group key={i}>
            <AgentLink3D fromPos={fromPos} toPos={toPos} linkType={link.type} isActive={isActive} />
            {isActive && (
              <LinkParticle fromPos={fromPos} toPos={toPos}
                color="#ffffff"
                speed={0.3 + Math.random() * 0.2} />
            )}
          </group>
        );
      })}

      {/* Agent nodes */}
      {AGENT_3D_DATA.map(agent => (
        <AgentNode3D
          key={agent.id}
          agent={agent}
          state={stateMap[agent.id]}
          isSelected={selectedAgent === agent.id}
          isHovered={hovered === agent.id}
          onClick={(id: string) => onSelectAgent(selectedAgent === id ? null : id)}
          onHover={setHovered}
        />
      ))}
    </>
  );
}

function AgentNodeGraph({ states, messages, onSelectAgent, selectedAgent }: {
  states: any[];
  messages: any[];
  onSelectAgent: (id: string | null) => void;
  selectedAgent: string | null;
}) {
  const activeAgent = selectedAgent ? states.find(s => s.agent_id === selectedAgent) : null;
  const em = activeAgent ? (EMOTION_CONFIG[activeAgent.current_emotion] || EMOTION_CONFIG.neutral) : null;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden mb-5"
      style={{
        height: 560,
        background: '#020008',
        border: '1px solid rgba(168,85,247,0.18)',
        boxShadow: '0 0 100px rgba(168,85,247,0.08), 0 0 200px rgba(0,0,0,0.9)',
      }}>

      {/* Mesh gradient background overlay */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(168,85,247,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.03) 0%, transparent 60%)',
        }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: 'linear-gradient(180deg, rgba(2,0,8,0.95) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ boxShadow: '0 0 8px #a855f7' }} />
          <span className="text-[10px] font-mono font-black text-purple-400 tracking-[0.2em]">AGENT SOCIETY // 3D NETWORK</span>
          <span className="text-[7px] font-mono text-white/20">{states.length} ACTIVE AGENTS</span>
        </div>
        <div className="flex items-center gap-4 text-[7px] font-mono text-white/20">
          <span>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK NODE</span>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 2, 14], fov: 50 }} className="w-full h-full" style={{ zIndex: 10 }}>
        <AgentScene3D
          states={states}
          messages={messages}
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
        />
      </Canvas>

      {/* Selected agent panel */}
      {activeAgent && em && (
        <div className="absolute bottom-4 left-4 z-20 rounded-xl px-4 py-3 min-w-[200px]"
          style={{ background: 'rgba(2,0,15,0.95)', border: `1px solid ${em.border}`, backdropFilter: 'blur(16px)', boxShadow: `0 0 30px ${em.color}22` }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{em.emoji}</span>
            <span className="text-[11px] font-mono font-black" style={{ color: em.color }}>{activeAgent.agent_name}</span>
          </div>
          <div className="text-[8px] font-mono mb-1" style={{ color: em.color }}>{em.label} · {activeAgent.emotion_intensity}% intensity</div>
          {activeAgent.key_concern && (
            <div className="text-[8px] font-mono text-white/35 leading-relaxed">{activeAgent.key_concern}</div>
          )}
          {activeAgent.stance_summary && (
            <div className="text-[8px] font-mono text-white/25 mt-1 italic">&ldquo;{activeAgent.stance_summary.slice(0,80)}&rdquo;</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5">
        {Object.entries(LINK_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <div className="w-5 h-px" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
            <span className="text-[6.5px] font-mono uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function AgentMoodBoard({ states }: { states: any[] }) {
  if (!states?.length) return null;
  return (
    <div className="grid grid-cols-5 gap-2 mb-4">
      {states.map(s => {
        const em = EMOTION_CONFIG[s.current_emotion] || EMOTION_CONFIG.neutral;
        const intensity = s.emotion_intensity || 50;
        return (
          <div key={s.agent_id} className="relative rounded-xl p-2.5 text-center transition-all group cursor-default"
            style={{
              background: `linear-gradient(135deg, ${em.bg}, rgba(0,0,0,0.5))`,
              border: `1px solid ${em.border}`,
              boxShadow: intensity >= 75 ? `0 0 16px ${em.color}22` : 'none',
            }}>
            <div className="text-xl mb-1">{em.emoji}</div>
            <div className="text-[7px] font-mono font-bold truncate" style={{ color: em.color }}>
              {s.agent_name.split(' ')[0].toUpperCase()}
            </div>
            <div className="text-[6px] font-mono opacity-60 mt-0.5">{em.label}</div>
            <div className="h-0.5 mt-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${intensity}%`, background: em.color, boxShadow: `0 0 4px ${em.color}` }} />
            </div>
            {s.key_concern && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                <div className="text-[7px] font-mono rounded-lg px-2 py-1"
                  style={{ background: 'rgba(0,0,0,0.95)', border: `1px solid ${em.border}`, color: em.color }}>
                  {s.key_concern.slice(0, 60)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AgentSociety() {
  const [canvasVisible, setCanvasVisible] = useState(false);
  const agentSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = agentSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setCanvasVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [agentStates, setAgentStates] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'get_conversations' }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setAgentStates(data.agent_states || []);
        if (data.conversations?.length && !activeConvId) setActiveConvId(data.conversations[0].id);
      }
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!activeConvId) return;
    const load = async () => {
      setLoadingMsgs(true);
      try {
        const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'get_messages', conversation_id: activeConvId }),
        });
        if (res.ok) { const d = await res.json(); setMessages(d.messages || []); }
      } catch {} finally { setLoadingMsgs(false); }
    };
    load();
  }, [activeConvId]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate_conversation' }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadData();
        if (data.conversation_id) { setActiveConvId(data.conversation_id); setMessages(data.messages || []); }
      }
    } catch {} finally { setGenerating(false); }
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const hasPanic = messages.some(m => m.emotion === 'panicked');
  const hasAnger = messages.some(m => m.emotion === 'angry');
  const avgTension = messages.length
    ? Math.round(messages.reduce((s, m) => s + (m.emotion_intensity || 50), 0) / messages.length)
    : 0;

  return (
    <div ref={agentSectionRef} className="mb-6">
      {/* ── Header bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-purple-400"
            style={{ boxShadow: '0 0 8px #a855f7' }}
          />
        </div>
        <span className="text-[11px] font-mono font-black text-purple-400 tracking-[0.18em] uppercase">Agent Society</span>
        <span className="text-[8px] font-mono text-white/20">// Live AI agents · World reaction simulation</span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.2), transparent)' }} />
        {avgTension > 0 && (
          <div className="text-[8px] font-mono px-2 py-0.5 rounded-full"
            style={{
              color: avgTension >= 75 ? '#f87171' : avgTension >= 55 ? '#fb923c' : '#9ca3af',
              background: avgTension >= 75 ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${avgTension >= 75 ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            TENSION {avgTension}%
          </div>
        )}
        <button onClick={generate} disabled={generating}
          className="text-[8px] font-mono px-3 py-1 rounded-full transition-all disabled:opacity-40"
          style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
          {generating ? '⟳ generating...' : '⚡ new conversation'}
        </button>
      </div>

      {/* ── Agent Network Graph — only mount when visible to avoid dual WebGL context */}
      {agentStates.length > 0 && canvasVisible && (
        <AgentNodeGraph
          states={agentStates}
          messages={messages}
          onSelectAgent={setSelectedAgent}
          selectedAgent={selectedAgent}
        />
      )}
      {agentStates.length > 0 && !canvasVisible && (
        <div style={{height:280,display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(168,85,247,0.04)',border:'1px solid rgba(168,85,247,0.12)',borderRadius:12}}>
          <span style={{fontFamily:'monospace',fontSize:9,color:'rgba(168,85,247,0.4)',letterSpacing:'0.2em'}}>
            SCROLL INTO VIEW TO LOAD 3D NETWORK
          </span>
        </div>
      )}

      {/* ── Mood board (compact row) */}
      {agentStates.length > 0 && <AgentMoodBoard states={agentStates} />}

      {/* ── Conversation tabs */}
      {conversations.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          {conversations.slice(0, 5).map(conv => (
            <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
              className="text-[7px] font-mono px-3 py-1.5 rounded-full border transition-all text-left flex-shrink-0 max-w-[180px] truncate"
              style={{
                background: activeConvId === conv.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)',
                borderColor: activeConvId === conv.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)',
                color: activeConvId === conv.id ? '#a855f7' : 'rgba(255,255,255,0.3)',
              }}>
              {conv.topic?.slice(0, 45) || 'Conversation'}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state */}
      {conversations.length === 0 && !generating && (
        <div className="rounded-2xl p-10 text-center"
          style={{ border: '1px dashed rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.03)' }}>
          <div className="text-4xl mb-4 opacity-60">🌍</div>
          <p className="text-[11px] font-mono text-white/30 mb-2">The agent society is silent.</p>
          <p className="text-[9px] font-mono text-white/15 mb-6">Generate a conversation to watch world powers react, argue, panic, and strategize.</p>
          <button onClick={generate}
            className="text-[9px] font-mono px-6 py-3 rounded-xl transition-all"
            style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
            ⚡ Activate Agent Society
          </button>
        </div>
      )}

      {generating && (
        <div className="rounded-2xl p-8 text-center"
          style={{ border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.04)' }}>
          <div style={{animation: 'ayn-fade-pulse 1.5s ease-in-out infinite'}}>
            <div className="text-[10px] font-mono text-purple-400 tracking-widest">
              ⟳  AGENTS FORMING OPINIONS  ·  PROCESSING WORLD EVENTS  ·  GENERATING REACTIONS
            </div>
          </div>
        </div>
      )}

      {/* ── Chat room */}
      {activeConv && (
        <div className="rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(168,85,247,0.15)',
            background: 'linear-gradient(180deg, rgba(5,0,15,0.95) 0%, rgba(0,0,0,0.98) 100%)',
            boxShadow: '0 0 60px rgba(168,85,247,0.06)',
          }}>

          {/* Topic bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5"
            style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.06) 0%, transparent 60%)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest">Live Discussion</span>
            <span className="text-[9px] font-mono text-white/55 font-bold flex-1 truncate">{activeConv.topic}</span>
            {hasPanic && (
              <span className="text-[7px] font-mono font-black px-2 py-0.5 rounded-full"
                style={{ animation: 'ayn-blink 0.6s ease-in-out infinite', color: '#f87171', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)' }}>
                🚨 AGENT PANIC DETECTED
              </span>
            )}
            {!hasPanic && hasAnger && (
              <span className="text-[7px] font-mono px-2 py-0.5 rounded-full"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                ⚠ HIGH TENSION
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="px-5 py-4 space-y-6 overflow-y-auto" style={{ maxHeight: 560 }}>
            {loadingMsgs && (
              <div className="text-center py-8 text-[9px] font-mono text-white/20">Loading conversation...</div>
            )}
            {selectedAgent && (
              <div className="text-[8px] font-mono text-white/25 mb-2 flex items-center gap-2">
                <span>Filtering by:</span>
                <span style={{ color: '#a855f7' }}>{agentStates.find(s => s.agent_id === selectedAgent)?.agent_name}</span>
                <button onClick={() => setSelectedAgent(null)} className="ml-1 text-white/20 hover:text-white/50">✕ show all</button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {(selectedAgent
                ? messages.filter(m => m.agent_id === selectedAgent || m.responding_to_agent === selectedAgent)
                : messages
              ).map((msg, i) => (
                <AgentMessage key={msg.id} msg={msg} prev={messages[i - 1]} idx={messages.length - 1 - i} />
              ))}
            </AnimatePresence>
            <div ref={msgsEndRef} />
          </div>

          {/* Footer stats */}
          {messages.length > 0 && (
            <div className="flex items-center gap-4 px-5 py-2.5 border-t border-white/4"
              style={{ background: 'rgba(0,0,0,0.5)' }}>
              <span className="text-[7px] font-mono text-white/20">{messages.length} messages</span>
              <span className="text-[7px] font-mono text-white/15">·</span>
              <span className="text-[7px] font-mono text-white/20">
                {messages.filter(m => m.internal_thought).length} thoughts hidden
              </span>
              <span className="text-[7px] font-mono text-white/15">·</span>
              <span className="text-[7px] font-mono text-white/20">
                {messages.filter(m => m.market_action).length} market actions
              </span>
              {messages.some(m => m.emotion_intensity >= 80) && (
                <span className="ml-auto text-[7px] font-mono" style={{ color: '#f87171' }}>
                  ⚠ extreme emotions detected
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentSociety;
