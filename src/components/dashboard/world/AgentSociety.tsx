/**
 * AgentSociety v6
 * - Auto-activate on first load
 * - Responsive: mobile, tablet, desktop
 * - Better typography, contrast, spacing
 * - CIA ops center aesthetic
 */
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

// ─── Emotion / category config ────────────────────────────────────────────────
const EM: Record<string, { emoji:string; color:string; bg:string; border:string; label:string }> = {
  neutral:    { emoji:'😐', color:'#9ca3af', bg:'rgba(156,163,175,0.07)', border:'rgba(156,163,175,0.2)',  label:'Neutral'    },
  confident:  { emoji:'😤', color:'#34d399', bg:'rgba(52,211,153,0.09)',  border:'rgba(52,211,153,0.3)',   label:'Confident'  },
  panicked:   { emoji:'😱', color:'#f87171', bg:'rgba(248,113,113,0.13)', border:'rgba(248,113,113,0.45)', label:'Panicking'  },
  happy:      { emoji:'😊', color:'#fde047', bg:'rgba(253,224,71,0.09)',  border:'rgba(253,224,71,0.3)',   label:'Happy'      },
  angry:      { emoji:'😡', color:'#ef4444', bg:'rgba(239,68,68,0.14)',   border:'rgba(239,68,68,0.5)',    label:'Furious'    },
  worried:    { emoji:'😟', color:'#f59e0b', bg:'rgba(245,158,11,0.09)',  border:'rgba(245,158,11,0.3)',   label:'Worried'    },
  suspicious: { emoji:'🤨', color:'#a78bfa', bg:'rgba(167,139,250,0.09)', border:'rgba(167,139,250,0.3)',  label:'Suspicious' },
  excited:    { emoji:'🤩', color:'#22d3ee', bg:'rgba(34,211,238,0.09)',  border:'rgba(34,211,238,0.3)',   label:'Excited'    },
  sad:        { emoji:'😢', color:'#60a5fa', bg:'rgba(96,165,250,0.09)',  border:'rgba(96,165,250,0.25)',  label:'Sad'        },
  tense:      { emoji:'😬', color:'#fb923c', bg:'rgba(251,146,60,0.1)',   border:'rgba(251,146,60,0.35)',  label:'Tense'      },
};

const CAT_COLOR: Record<string,string> = {
  government:'#06b6d4', central_bank:'#fbbf24', stock_market:'#f472b6',
  bank:'#a78bfa', company:'#34d399', social_class:'#fb923c',
  institution:'#8b5cf6', market:'#f472b6',
};
const CAT_ICON: Record<string,string> = {
  government:'🏛', central_bank:'🏦', stock_market:'📈',
  bank:'🏢', company:'💼', social_class:'👥',
  institution:'🌐', market:'📊',
};

const LINK_COLOR: Record<string,string> = {
  ally:'#6366f1', rival:'#f59e0b', hostile:'#ef4444',
  trade:'#34d399', market:'#a78bfa', dependency:'#06b6d4',
};

// ─── Agent 3D positions (sphere radius 4.0) ───────────────────────────────────
const R = 4.0;
const RAW_POS: Record<string,[number,number,number]> = {
  usa:[0,4,0], china:[3.2,1.2,1.2], russia:[2.7,-1.3,2], eu:[-1,-3,1.6],
  germany:[-1.8,2.8,1.5], france:[-2.2,2.2,1.8], uk:[-2.8,2,0.8],
  saudi:[-0.9,-0.9,3.3], iran:[-3.4,-1,-0.5], israel:[-3,1.8,-0.9],
  india:[2.8,0.2,-2.2], japan:[-2.5,2.2,-2], turkey:[-2,0.5,2.8],
  uae:[0.5,-1.5,3.3], south_korea:[-3,1,-1.8], brazil:[-0.5,-3.2,-1.5],
  mexico:[1.5,-2.5,-2.2], south_africa:[0.5,-3.5,0.5], nigeria:[-1.5,-3,1.2], indonesia:[2,-2,2.5],
  fed:[0,1.6,-3.2], ecb:[-1.2,1.4,-3.2], pboc:[2.5,0,-2.5],
  boj:[-2.8,0.8,-2.2], boe:[-2.5,1.5,-2.5], rbi:[2.2,-1,-2.8], rba:[2.5,-2.5,-1.5],
  sp500:[1.2,3,1], nasdaq:[0.8,3.2,0.5], shanghai_comp:[3,0.8,-1.5],
  nikkei:[-2.2,2.5,-1.5], ftse:[-2.8,1.8,-1], dax:[-2,2.4,1.2],
  crypto_mkt:[2,-0.5,-3], gold_market:[1.5,-0.5,-3.3], oil_market:[3.5,-0.5,0.5],
  jpmorgan:[0.8,-2.4,-2.8], goldman:[1.2,-2.2,-2.8], blackrock:[1.2,0.7,3.3],
  hsbc:[-0.5,1,-3.5], ubs:[-1.5,0.5,-3.3], deutsche_bank:[-2.2,1,-2.8],
  boc:[3.5,0.5,0.5], saudiarabia_ndb:[0,-1.5,-3.4],
  nvidia:[2.2,2.6,-1.8], apple:[1.8,2.8,-1.5], microsoft:[1.4,2.6,-2],
  tesla:[2,2,-2.5], aramco:[1,0,-3.5], byd:[3.2,0.2,-1.2],
  amazon:[2.2,1.8,-2.2], tsmc:[-3,0.5,-1.8], imf:[0,-2,-3],
  us_upper:[0.4,3.4,0.8], us_upper_middle:[0.8,3.2,1], us_middle:[1.8,-2.8,1.8],
  us_working:[2.2,-2.5,1.5], china_urban_youth:[3.2,0,-1.8],
  china_middle:[3,-0.5,-1.2], china_rural:[3.5,-0.5,0.2],
  eu_middle:[-2,-2.5,1.5], german_worker:[-2.5,-2,1.2],
  uk_middle:[-3,-1.2,-1.5], saudi_youth:[-0.2,-1.2,3.4],
  india_middle:[2.5,-1.2,-2.2], india_poor:[3,-1.5,-1.5],
  global_south_poor:[0,-3,-2], russian_citizen:[3,-0.8,1.5],
  japanese_salaryman:[-2.8,1,-2],
};
const AGENT_POS: Record<string,[number,number,number]> = {};
Object.entries(RAW_POS).forEach(([id,p]) => {
  const len = Math.sqrt(p[0]**2+p[1]**2+p[2]**2);
  AGENT_POS[id] = [p[0]*R/len, p[1]*R/len, p[2]*R/len];
});

// ─── Agent relationship links ─────────────────────────────────────────────────
const LINKS = [
  { from:'usa', to:'eu', type:'ally' }, { from:'usa', to:'uk', type:'ally' },
  { from:'usa', to:'japan', type:'ally' }, { from:'usa', to:'israel', type:'ally' },
  { from:'usa', to:'south_korea', type:'ally' }, { from:'usa', to:'fed', type:'dependency' },
  { from:'usa', to:'sp500', type:'market' }, { from:'usa', to:'china', type:'rival' },
  { from:'china', to:'russia', type:'ally' }, { from:'china', to:'pboc', type:'dependency' },
  { from:'china', to:'byd', type:'market' }, { from:'china', to:'tsmc', type:'rival' },
  { from:'china', to:'saudi', type:'trade' }, { from:'china', to:'iran', type:'trade' },
  { from:'china', to:'boc', type:'dependency' }, { from:'china', to:'shanghai_comp', type:'market' },
  { from:'russia', to:'iran', type:'ally' }, { from:'russia', to:'eu', type:'hostile' },
  { from:'russia', to:'oil_market', type:'market' },
  { from:'saudi', to:'aramco', type:'dependency' }, { from:'saudi', to:'oil_market', type:'market' },
  { from:'iran', to:'israel', type:'hostile' },
  { from:'fed', to:'sp500', type:'market' }, { from:'fed', to:'nasdaq', type:'market' },
  { from:'fed', to:'gold_market', type:'market' }, { from:'fed', to:'crypto_mkt', type:'market' },
  { from:'fed', to:'blackrock', type:'market' },
  { from:'ecb', to:'dax', type:'market' }, { from:'ecb', to:'ftse', type:'market' },
  { from:'pboc', to:'shanghai_comp', type:'market' }, { from:'boj', to:'nikkei', type:'market' },
  { from:'blackrock', to:'sp500', type:'market' }, { from:'jpmorgan', to:'sp500', type:'market' },
  { from:'goldman', to:'nasdaq', type:'market' },
  { from:'nvidia', to:'nasdaq', type:'market' }, { from:'apple', to:'nasdaq', type:'market' },
  { from:'microsoft', to:'nasdaq', type:'market' }, { from:'tesla', to:'nasdaq', type:'market' },
  { from:'tsmc', to:'nvidia', type:'trade' },
  { from:'fed', to:'us_middle', type:'dependency' }, { from:'fed', to:'us_working', type:'dependency' },
  { from:'sp500', to:'us_upper', type:'market' }, { from:'sp500', to:'us_upper_middle', type:'market' },
  { from:'oil_market', to:'global_south_poor', type:'dependency' },
  { from:'pboc', to:'china_urban_youth', type:'dependency' },
  { from:'ecb', to:'eu_middle', type:'dependency' },
  { from:'nvidia', to:'us_upper', type:'market' }, { from:'tesla', to:'us_upper_middle', type:'market' },
  { from:'amazon', to:'us_middle', type:'trade' },
  { from:'india', to:'russia', type:'trade' }, { from:'india', to:'usa', type:'ally' },
  { from:'brazil', to:'china', type:'trade' }, { from:'indonesia', to:'china', type:'trade' },
];

// ─── 3D Components ────────────────────────────────────────────────────────────
function NeuralGlobe() {
  const count = 700;
  const { pGeo, lGeo } = useMemo(() => {
    const pos = new Float32Array(count*3);
    const pts: THREE.Vector3[] = [];
    for (let i=0;i<count;i++) {
      const phi=Math.acos(1-2*(i+0.5)/count);
      const theta=Math.PI*(1+Math.sqrt(5))*(i+0.5);
      const x=R*Math.cos(theta)*Math.sin(phi);
      const y=R*Math.cos(phi);
      const z=R*Math.sin(theta)*Math.sin(phi);
      pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
      pts.push(new THREE.Vector3(x,y,z));
    }
    const lines:number[]=[];
    for(let i=0;i<count;i++){let c=0;for(let j=i+1;j<count;j++){if(pts[i].distanceTo(pts[j])<0.9){lines.push(pts[i].x,pts[i].y,pts[i].z,pts[j].x,pts[j].y,pts[j].z);if(++c>3)break;}}}
    const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(lines),3));
    return { pGeo:pg, lGeo:lg };
  }, []);
  const tex = useMemo(()=>{
    const c=document.createElement('canvas');c.width=64;c.height=64;
    const ctx=c.getContext('2d')!;
    const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.2,'rgba(139,92,246,0.85)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  },[]);
  const gRef=useRef<THREE.Group>(null);
  useFrame((_,dt)=>{ if(gRef.current){gRef.current.rotation.y+=dt*0.03;gRef.current.rotation.x+=dt*0.01;} });
  return (
    <group ref={gRef}>
      <points geometry={pGeo}><pointsMaterial size={0.08} map={tex} transparent opacity={0.7} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false}/></points>
      <lineSegments geometry={lGeo}><lineBasicMaterial color="#5b21b6" transparent opacity={0.055} blending={THREE.AdditiveBlending} depthWrite={false}/></lineSegments>
      <mesh><sphereGeometry args={[R*0.97,32,32]}/><meshBasicMaterial color="#010008" transparent opacity={0.45} depthWrite={false}/></mesh>
      <mesh><sphereGeometry args={[R*1.04,32,32]}/><meshBasicMaterial color="#7c3aed" transparent opacity={0.025} side={THREE.BackSide} depthWrite={false}/></mesh>
    </group>
  );
}

function SignalParticle({ from, to, color, speed, size=0.07 }: {
  from:[number,number,number]; to:[number,number,number]; color:string; speed:number; size?:number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const t   = useRef(Math.random());
  const fromV = useMemo(()=>new THREE.Vector3(...from),[from]);
  const toV   = useMemo(()=>new THREE.Vector3(...to),[to]);
  const mid   = useMemo(()=>{
    const m = fromV.clone().add(toV).multiplyScalar(0.5);
    m.normalize().multiplyScalar(R*1.18);
    return m;
  },[fromV,toV]);
  useFrame((_,dt)=>{
    t.current=(t.current+dt*speed)%1;
    if(!ref.current)return;
    const q0=fromV.clone().lerp(mid,t.current);
    const q1=mid.clone().lerp(toV,t.current);
    ref.current.position.copy(q0.lerp(q1,t.current));
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size,10,10]}/>
      <meshBasicMaterial color={color} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false}/>
    </mesh>
  );
}

function AgentNode({ id, pos, state, isSelected, isHovered, onClick, onHover }: any) {
  const em     = EM[state?.current_emotion||'neutral']||EM.neutral;
  const catCol = CAT_COLOR[state?.agent_category||'government']||'#9ca3af';
  const intense= (state?.emotion_intensity||0)>=75;
  const gRef   = useRef<THREE.Group>(null);
  useFrame(()=>{
    if(!gRef.current)return;
    if(intense){const s=1+Math.sin(Date.now()*0.007)*0.2;gRef.current.scale.setScalar(s);}
    else gRef.current.scale.setScalar(1);
  });
  return (
    <group position={pos} ref={gRef}>
      <mesh
        onClick={(e)=>{e.stopPropagation();onClick(id);}}
        onPointerOver={(e)=>{e.stopPropagation();onHover(id);document.body.style.cursor='pointer';}}
        onPointerOut={()=>{onHover(null);document.body.style.cursor='default';}}>
        <sphereGeometry args={[isSelected?0.30:isHovered?0.25:0.19,20,20]}/>
        <meshBasicMaterial color={catCol} transparent opacity={isSelected?0.85:isHovered?0.65:intense?0.5:0.35} blending={THREE.AdditiveBlending} depthWrite={false}/>
      </mesh>
      <mesh raycast={()=>null}>
        <sphereGeometry args={[0.07,12,12]}/>
        <meshBasicMaterial color={em.color} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false}/>
      </mesh>
      <mesh raycast={()=>null}>
        <sphereGeometry args={[0.03,8,8]}/>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false}/>
      </mesh>
      {(isSelected||isHovered) && state?.agent_name && (
        <Billboard>
          <Line points={[[0,0.12,0],[0,0.32,0],[0.22,0.32,0]]} color={catCol} opacity={0.5} transparent lineWidth={1}/>
          <Text position={[0.24,0.32,0]} fontSize={0.12} color={catCol} anchorX="left" fillOpacity={1} outlineWidth={0.02} outlineColor="#010008">
            {state.agent_name.toUpperCase()}
          </Text>
          {state.current_emotion && (
            <Text position={[0.24,0.18,0]} fontSize={0.095} color={em.color} anchorX="left" fillOpacity={0.85} outlineWidth={0.015} outlineColor="#010008">
              {em.emoji} {em.label.toUpperCase()}
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );
}

function AgentScene({ agentStateMap, messages, selectedAgent, hoveredAgent, onSelect, onHover }: any) {
  const activeAgentIds = useMemo(()=>{
    const ids=new Set<string>();
    messages.forEach((m:any)=>{ if(m.agent_id)ids.add(m.agent_id); });
    return ids;
  },[messages]);
  const activeLinks = useMemo(()=>
    LINKS.filter(l=>activeAgentIds.has(l.from)&&activeAgentIds.has(l.to)&&AGENT_POS[l.from]&&AGENT_POS[l.to]),
  [activeAgentIds]);
  const bgLinks = useMemo(()=>
    LINKS.filter(l=>AGENT_POS[l.from]&&AGENT_POS[l.to]).slice(0,25),
  []);

  return (
    <>
      <color attach="background" args={['#010008']}/>
      <ambientLight intensity={0.08}/>
      <pointLight position={[0,10,0]} intensity={1.4} color="#a855f7"/>
      <pointLight position={[7,-5,5]} intensity={0.7} color="#6366f1"/>
      <pointLight position={[-7,5,-5]} intensity={0.5} color="#22d3ee"/>
      <OrbitControls enablePan={false} minDistance={8} maxDistance={20}
        autoRotate autoRotateSpeed={0.25} enableDamping dampingFactor={0.07}/>
      <NeuralGlobe/>
      {bgLinks.map((link,i)=>{
        const fp=AGENT_POS[link.from]; const tp=AGENT_POS[link.to];
        return <SignalParticle key={`bg-${i}`} from={fp} to={tp} color={LINK_COLOR[link.type]||'#6366f1'} speed={0.12+i*0.018} size={0.045}/>;
      })}
      {activeLinks.map((link,i)=>{
        const fp=AGENT_POS[link.from]; const tp=AGENT_POS[link.to];
        const col=LINK_COLOR[link.type]||'#a855f7';
        return (
          <group key={`act-${i}`}>
            <SignalParticle from={fp} to={tp} color={col} speed={0.28+Math.random()*0.15} size={0.07}/>
            <SignalParticle from={tp} to={fp} color={col} speed={0.22+Math.random()*0.12} size={0.055}/>
          </group>
        );
      })}
      {Object.entries(AGENT_POS).map(([id,pos])=>{
        const state=agentStateMap[id];
        if(!state) return null;
        return (
          <AgentNode key={id} id={id} pos={pos} state={state}
            isSelected={selectedAgent===id} isHovered={hoveredAgent===id}
            onClick={onSelect} onHover={onHover}/>
        );
      })}
    </>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────
function AgentCard({ state, isSelected, onClick, onChat, compact }: { state:any; isSelected:boolean; onClick:()=>void; onChat?:()=>void; compact?:boolean }) {
  const em=EM[state.current_emotion||'neutral']||EM.neutral;
  const catCol=CAT_COLOR[state.agent_category||'government']||'#9ca3af';
  const intense=(state.emotion_intensity||0)>=75;

  if (compact) {
    return (
      <button onClick={onClick}
        className="flex flex-col items-center gap-1 shrink-0 p-2 rounded-xl transition-all min-w-[64px]"
        style={{
          background: isSelected ? `${catCol}18` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isSelected ? catCol+'45' : 'rgba(255,255,255,0.06)'}`,
        }}>
        <div className="text-2xl relative">
          {state.agent_flag || em.emoji}
          {intense && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
            style={{ background:em.color, boxShadow:`0 0 6px ${em.color}`, animation:'as-pulse 1s ease-in-out infinite' }}/>}
        </div>
        <span className="text-[10px] font-bold font-mono text-white/70 truncate max-w-[60px] leading-tight text-center">
          {state.agent_name?.split(' ')[0] || state.agent_id}
        </span>
        <span className="text-[8px] font-mono" style={{ color: em.color }}>{em.emoji}</span>
      </button>
    );
  }

  return (
    <button onClick={onClick} className="w-full text-left transition-all duration-150 rounded-xl"
      style={{
        background: isSelected ? `${catCol}12` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isSelected ? catCol+'40' : 'rgba(255,255,255,0.07)'}`,
        borderLeft: `3px solid ${isSelected ? catCol : 'transparent'}`,
        padding: '12px 14px',
        marginBottom: 6,
      }}>
      <div className="flex items-center gap-3">
        <div className="text-xl leading-none shrink-0 relative">
          {state.agent_flag || em.emoji}
          {intense && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
            style={{ background:em.color, boxShadow:`0 0 6px ${em.color}`, animation:'as-pulse 1s ease-in-out infinite' }}/>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white/90 truncate leading-tight">{state.agent_name}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider mt-0.5 flex items-center gap-1" style={{ color:catCol, opacity:0.8 }}>
            {CAT_ICON[state.agent_category||'government']} {state.agent_category?.replace(/_/g,' ')}
            {state.country&&state.country!=='GLOBAL'?` · ${state.country}`:''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-[10px] font-bold" style={{ color:em.color }}>{em.label}</span>
          <div className="flex gap-0.5">
            {[20,40,60,80,100].map(t=>(
              <div key={t} className="rounded-sm" style={{ width:4, height:12, background:(state.emotion_intensity||0)>=t?em.color:'rgba(255,255,255,0.08)', boxShadow:(state.emotion_intensity||0)>=t?`0 0 4px ${em.color}`:undefined }}/>
            ))}
          </div>
        </div>
      </div>
      {isSelected&&state.key_concern&&(
        <div className="mt-3 text-xs font-mono text-white/50 leading-relaxed line-clamp-2 pt-3 border-t border-white/8">{state.key_concern}</div>
      )}
      {isSelected && onChat && (
        <button onClick={(e)=>{e.stopPropagation();onChat();}}
          className="mt-3 w-full text-[10px] font-bold py-2.5 rounded-lg uppercase tracking-wider transition-all"
          style={{color:'#a855f7',background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.3)'}}>
          💬 Chat with {state.agent_name.split(' ')[0]}
        </button>
      )}
      {isSelected&&(state.wins_from||state.loses_from)&&(
        <div className="mt-2 space-y-1">
          {state.wins_from&&<div className="text-[10px] font-mono text-emerald-400/70">✅ {state.wins_from.slice(0,80)}</div>}
          {state.loses_from&&<div className="text-[10px] font-mono text-red-400/70">❌ {state.loses_from.slice(0,80)}</div>}
        </div>
      )}
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function AgentMessage({ msg, idx }: { msg:any; idx:number }) {
  const [showThought, setShowThought] = useState(false);
  const em=EM[msg.emotion||'neutral']||EM.neutral;
  const catCol = CAT_COLOR[msg.agent_role || 'government'] || '#9ca3af';
  const intense=(msg.emotion_intensity||0)>=80;
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.03,duration:0.25}}
      className="flex gap-3 pb-5 mb-1 border-b border-white/[0.06] last:border-0">
      <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl relative"
        style={{ background:em.bg, border:`1px solid ${em.border}`, boxShadow:intense?`0 0 18px ${em.color}30`:undefined }}>
        {msg.agent_flag||'🌐'}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ background:'rgba(0,0,0,0.95)', border:`1px solid ${em.border}` }}>{em.emoji}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color:em.color }}>{msg.agent_name}</span>
          <span className="text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider"
            style={{ color:em.color, background:em.bg, border:`1px solid ${em.border}` }}>
            {em.emoji} {em.label}{intense?` · ${msg.emotion_intensity}%`:''}
          </span>
          {msg.responding_to_agent&&<span className="text-[10px] font-mono text-white/35">↩ {msg.responding_to_agent}</span>}
          {msg.message_type&&msg.message_type!=='statement'&&(
            <span className="text-[9px] font-mono text-white/25 uppercase ml-auto">[{msg.message_type}]</span>
          )}
        </div>
        <div className="rounded-xl px-4 py-3.5 text-[13px] font-mono text-white/80 leading-[1.85]"
          style={{
            background:`linear-gradient(135deg,${em.bg},rgba(0,0,0,0.45))`,
            border:`1px solid ${em.border}`,
            borderLeft:`3px solid ${catCol}`,
            boxShadow:intense?`0 0 22px ${em.color}12`:undefined,
          }}>
          {msg.message}
        </div>
        {msg.internal_thought&&(
          <div className="mt-2">
            <button onClick={()=>setShowThought(!showThought)}
              className="text-[10px] font-mono italic flex items-center gap-1 transition-colors"
              style={{ color:showThought?'#c4b5fd':'rgba(255,255,255,0.3)' }}>
              💭 {showThought?'hide thought':'reveal inner thought'}
            </button>
            <AnimatePresence>
              {showThought&&(
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="mt-2 rounded-lg px-4 py-3 text-xs font-mono italic leading-relaxed"
                    style={{ color:'#c4b5fd', background:'rgba(167,139,250,0.08)', border:'1px solid rgba(167,139,250,0.2)', borderLeft:'3px solid rgba(167,139,250,0.5)' }}>
                    "{msg.internal_thought}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {msg.market_action&&(
          <div className="mt-2.5 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-mono"
            style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399' }}>
            📊 <span className="font-bold">{msg.market_action.action}</span>
            {msg.market_action.reason&&<span className="opacity-60">— {msg.market_action.reason}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function StatusBar({ agentCount, avgTension, hasPanic, messageCount }: {
  agentCount: number; avgTension: number; hasPanic: boolean; messageCount: number;
}) {
  return (
    <div className="flex items-center gap-2 md:gap-4 flex-wrap font-mono">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]">
        <div className="w-2 h-2 rounded-full bg-emerald-400" style={{boxShadow:'0 0 6px rgba(52,211,153,0.6)'}}/>
        <span className="text-[11px] text-white/60">{agentCount} <span className="text-white/30">AGENTS</span></span>
      </div>
      {avgTension > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
          style={{
            background: avgTension >= 75 ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)',
            borderColor: avgTension >= 75 ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)',
          }}>
          <span className="text-[11px] font-bold" style={{
            color: avgTension >= 75 ? '#f87171' : avgTension >= 55 ? '#fb923c' : '#9ca3af'
          }}>TENSION {avgTension}%</span>
          <div className="flex gap-0.5">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-1.5 rounded-sm" style={{
                height: 10 + i * 2,
                background: (avgTension / 20) > i
                  ? (avgTension >= 75 ? '#f87171' : avgTension >= 55 ? '#fb923c' : '#9ca3af')
                  : 'rgba(255,255,255,0.08)',
              }}/>
            ))}
          </div>
        </div>
      )}
      {hasPanic && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-[11px]"
          style={{color:'#f87171',background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',animation:'as-pulse 0.8s ease-in-out infinite'}}>
          🚨 PANIC DETECTED
        </div>
      )}
      {messageCount > 0 && (
        <span className="text-[10px] text-white/25 ml-auto hidden md:block">{messageCount} messages</span>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AgentSociety() {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const msgsEnd    = useRef<HTMLDivElement>(null);
  const isMounted  = useRef(false);
  const prevCount  = useRef(0);
  const autoActivated = useRef(false);
  const { toast }  = useToast();
  const isMobile   = useIsMobile();

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
  const [godEyeOpen, setGodEyeOpen]       = useState(false);
  const [godEyeInput, setGodEyeInput]     = useState('');
  const [chatAgent, setChatAgent]         = useState<any|null>(null);
  const [chatHistory, setChatHistory]     = useState<{role:string;content:string}[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatLoading, setChatLoading]     = useState(false);
  const [showGlobe, setShowGlobe]         = useState(true);

  useEffect(()=>{
    const el=canvasRef.current; if(!el)return;
    const obs=new IntersectionObserver(([e])=>{ if(e.isIntersecting){setReady(true);obs.disconnect();} },{threshold:0.05});
    obs.observe(el); return()=>obs.disconnect();
  },[]);

  useEffect(()=>{
    if(!isMounted.current){isMounted.current=true;prevCount.current=messages.length;return;}
    if(messages.length>prevCount.current){
      prevCount.current=messages.length;
      const container = msgsEnd.current?.parentElement;
      if (container) container.scrollTop = container.scrollHeight;
    }
  },[messages]);

  const generate=useCallback(async()=>{
    setGenerating(true);
    try{
      const body:any={mode:'generate_conversation'};
      if(activeCategory!=='all')body.category=activeCategory;
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
      });
      if (!res.ok) return;
      const data = await res.json();
      await loadData();
      if(data.conversation_id){
        setActiveConvId(data.conversation_id);
        setMessages(data.messages||[]);
      }
    } finally {
      setGenerating(false);
    }
  },[activeCategory]);

  const loadData=useCallback(async()=>{
    try{
      const res=await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({mode:'get_conversations'})
      });
      if(!res.ok)return;
      const data=await res.json();
      setConversations(data.conversations||[]);
      setAgentStates(data.agent_states||[]);
      setCategories(data.categories||[]);
      if(data.conversations?.length&&!activeConvId)setActiveConvId(data.conversations[0].id);
      // Auto-activate if no conversations exist
      if ((!data.conversations || data.conversations.length === 0) && !autoActivated.current) {
        autoActivated.current = true;
        // Trigger after state settles
        setTimeout(() => generate(), 100);
      }
    }catch{}
  },[activeConvId, generate]);

  useEffect(()=>{loadData();},[loadData]);

  useEffect(()=>{
    if(!activeConvId) return;
    const fetchMsgs = async () => {
      setLoadingMsgs(true);
      try {
        const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({mode:'get_messages',conversation_id:activeConvId})
        });
        if (res.ok) { const data = await res.json(); setMessages(data.messages || []); }
      } catch {} finally { setLoadingMsgs(false); }
    };
    fetchMsgs();
  },[activeConvId]);

  const injectGodEye = async () => {
    if (!godEyeInput.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ mode: 'inject_event', event: godEyeInput })
      });
      if (!res.ok) { toast({ title: "Snag!", description: "God's Eye injection failed.", variant: "destructive" }); return; }
      const data = await res.json();
      setGodEyeInput(''); setGodEyeOpen(false);
      await loadData();
      if (data.conversation_id) { setActiveConvId(data.conversation_id); setMessages(data.messages || []); }
    } finally { setGenerating(false); }
  };

  const chatWithAgent = async () => {
    if (!chatInput.trim() || !chatAgent) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput(''); setChatLoading(true);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ mode: 'chat', agent_id: chatAgent.agent_id, message: chatInput, history: chatHistory })
      });
      if (!res.ok) { toast({ title: "Connection Lost", description: `${chatAgent.agent_name} is not responding.`, variant: "destructive" }); return; }
      const data = await res.json();
      if (data.response) setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }]);
    } finally { setChatLoading(false); }
  };

  const agentStateMap=useMemo(()=>{const m:Record<string,any>={};agentStates.forEach(s=>m[s.agent_id]=s);return m;},[agentStates]);
  const filteredAgents=useMemo(()=>activeCategory==='all'?agentStates:agentStates.filter(s=>s.agent_category===activeCategory),[agentStates,activeCategory]);
  const visibleMessages=useMemo(()=>selectedAgent?messages.filter(m=>m.agent_id===selectedAgent||m.responding_to_agent===selectedAgent):messages,[messages,selectedAgent]);
  const activeConv=conversations.find(c=>c.id===activeConvId);
  const hasPanic=messages.some(m=>m.emotion==='panicked');
  const avgTension=messages.length?Math.round(messages.reduce((s,m)=>s+(m.emotion_intensity||50),0)/messages.length):0;

  return (
    <>
      <style>{`
        @keyframes as-pulse{0%,100%{opacity:0.45;transform:scale(1)}50%{opacity:1;transform:scale(1.25)}}
        @keyframes as-beam{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
        .as-scroll::-webkit-scrollbar{width:4px}.as-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:99px}
      `}</style>

      <div className="flex flex-col gap-4" style={{ minHeight: isMobile ? 'auto' : 'calc(100vh - 130px)' }}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" style={{boxShadow:'0 0 10px rgba(168,85,247,0.8)',animation:'as-pulse 2s ease-in-out infinite'}}/>
            <span className="text-xs font-bold text-purple-400 tracking-[0.18em] uppercase font-mono">Agent Society</span>
          </div>
          <div className="flex-1"/>

          {/* Globe toggle - only show on desktop */}
          {!isMobile && (
            <button onClick={()=>setShowGlobe(!showGlobe)}
              className="text-[10px] font-mono font-bold px-3 py-2 rounded-lg transition-all uppercase tracking-wider"
              style={{
                color: showGlobe ? '#a855f7' : 'rgba(255,255,255,0.4)',
                background: showGlobe ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${showGlobe ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              🌐 3D
            </button>
          )}

          <button onClick={()=>setGodEyeOpen(true)}
            className="text-[10px] font-mono font-bold px-3 py-2 rounded-lg transition-all uppercase tracking-wider"
            style={{color:'rgba(251,191,36,0.8)',background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.25)'}}>
            👁 God's Eye
          </button>
          <button onClick={generate} disabled={generating}
            className="text-[10px] font-mono font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-40 uppercase tracking-wider"
            style={{color:'#a855f7',background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.3)'}}>
            {generating?'⟳ Generating...':'⚡ New'}
          </button>
        </div>

        {/* ── Status Bar ── */}
        <StatusBar agentCount={agentStates.length} avgTension={avgTension} hasPanic={hasPanic} messageCount={messages.length} />

        {/* ── Category Filter ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 as-scroll" style={{ scrollbarWidth: 'none' }}>
          {categories.map((cat:any)=>{
            const col=cat.id==='all'?'#a855f7':CAT_COLOR[cat.id]||'#9ca3af';
            const count=cat.id==='all'?agentStates.length:agentStates.filter((s:any)=>s.agent_category===cat.id).length;
            return (
              <button key={cat.id} onClick={()=>setActiveCategory(cat.id)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[10px] font-bold font-mono transition-all uppercase tracking-wider shrink-0"
                style={{
                  color: activeCategory===cat.id ? col : 'rgba(255,255,255,0.4)',
                  background: activeCategory===cat.id ? `${col}14` : 'rgba(255,255,255,0.03)',
                  border: activeCategory===cat.id ? `1px solid ${col}40` : '1px solid rgba(255,255,255,0.06)',
                  minHeight: 40,
                }}>
                {CAT_ICON[cat.id]||'🌐'} {cat.label}
                {count>0&&<span className="opacity-50 font-mono">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* ── Main Content ── */}
        <div className={`flex-1 min-h-0 grid gap-4 ${
          !isMobile && showGlobe
            ? 'lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_520px]'
            : ''
        }`} style={{ minHeight: isMobile ? undefined : 500 }}>

          {/* 3D Globe — desktop only */}
          {!isMobile && showGlobe && (
            <div ref={canvasRef} className="relative rounded-2xl overflow-hidden hidden md:block"
              style={{background:'#010008',border:'1px solid rgba(168,85,247,0.18)',minHeight:400}}>
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
                style={{background:'linear-gradient(180deg,rgba(1,0,8,0.92),transparent)'}}>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{boxShadow:'0 0 5px rgba(168,85,247,0.8)'}}/>
                  <span className="text-[10px] font-bold text-purple-400 tracking-[0.16em] font-mono">AGENT NETWORK</span>
                  <span className="text-[9px] font-mono text-white/25">{Object.keys(agentStateMap).length} nodes</span>
                </div>
                <span className="text-[9px] font-mono text-white/25">DRAG · SCROLL · CLICK</span>
              </div>

              {ready?(
                <Canvas camera={{position:[0,0,13],fov:52}} className="w-full h-full">
                  <AgentScene
                    agentStateMap={agentStateMap} messages={messages}
                    selectedAgent={selectedAgent} hoveredAgent={hoveredAgent}
                    onSelect={(id:string)=>setSelectedAgent(selectedAgent===id?null:id)}
                    onHover={setHoveredAgent}
                  />
                </Canvas>
              ):(
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto"/>
                    <p className="text-[10px] font-mono text-purple-400/50 tracking-[0.2em]">LOADING NETWORK</p>
                  </div>
                </div>
              )}

              {/* Selected agent overlay on globe */}
              <AnimatePresence>
                {selectedAgent&&agentStateMap[selectedAgent]&&(()=>{
                  const s=agentStateMap[selectedAgent];
                  const em2=EM[s.current_emotion||'neutral']||EM.neutral;
                  const catCol2=CAT_COLOR[s.agent_category||'government']||'#9ca3af';
                  return (
                    <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}
                      className="absolute bottom-3 left-3 right-3 rounded-xl overflow-hidden z-10"
                      style={{background:'rgba(1,0,15,0.96)',backdropFilter:'blur(16px)',border:`1px solid ${catCol2}28`,borderTop:`1px solid ${catCol2}50`}}>
                      <div className="absolute top-0 left-0 right-0 h-px"
                        style={{background:`linear-gradient(90deg,transparent,${catCol2}cc,transparent)`,animation:'as-beam 2.5s ease-in-out infinite'}}/>
                      <div className="p-4 flex items-start gap-3">
                        <div className="text-2xl shrink-0">{s.agent_flag||'🌐'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold" style={{color:catCol2}}>{s.agent_name}</span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase" style={{color:em2.color,background:em2.bg,border:`1px solid ${em2.border}`}}>{em2.emoji} {em2.label}</span>
                            <button onClick={()=>setSelectedAgent(null)} className="ml-auto text-white/40 hover:text-white/70 text-sm font-mono transition-colors">✕</button>
                          </div>
                          {s.key_concern&&<p className="text-xs font-mono text-white/50 leading-relaxed">{s.key_concern.slice(0,130)}</p>}
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
          )}

          {/* Right panel (or full width on mobile) */}
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden">

            {/* Agent roster — horizontal scroll on mobile, vertical list on desktop */}
            {isMobile ? (
              <div className="flex gap-2 overflow-x-auto pb-2 as-scroll shrink-0" style={{ scrollbarWidth: 'none' }}>
                {filteredAgents.length === 0 && (
                  <div className="text-center py-4 text-xs font-mono text-white/30 w-full">
                    {agentStates.length===0 ? 'Initializing agents...' : 'No agents in this category'}
                  </div>
                )}
                {filteredAgents.map(s=>(
                  <AgentCard key={s.agent_id} state={s} isSelected={selectedAgent===s.agent_id} compact
                    onClick={()=>setSelectedAgent(selectedAgent===s.agent_id?null:s.agent_id)}
                    onChat={()=>{ setChatAgent(s); setChatHistory([]); }}/>
                ))}
              </div>
            ) : (
              <div className="as-scroll overflow-y-auto shrink-0" style={{maxHeight: showGlobe ? '38%' : '30%', minHeight:140}}>
                {filteredAgents.length===0&&(
                  <div className="text-center py-8 text-xs font-mono text-white/30">
                    {agentStates.length===0?'Initializing agents...':'No agents in this category'}
                  </div>
                )}
                {filteredAgents.map(s=>(
                  <AgentCard key={s.agent_id} state={s} isSelected={selectedAgent===s.agent_id}
                    onClick={()=>setSelectedAgent(selectedAgent===s.agent_id?null:s.agent_id)}
                    onChat={()=>{ setChatAgent(s); setChatHistory([]); }}/>
                ))}
              </div>
            )}

            {/* Selected agent detail on mobile */}
            {isMobile && selectedAgent && agentStateMap[selectedAgent] && (
              <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                className="rounded-xl overflow-hidden shrink-0"
                style={{background:'rgba(1,0,15,0.96)',border:'1px solid rgba(168,85,247,0.2)'}}>
                <div className="p-3 flex items-center gap-3">
                  <div className="text-xl">{agentStateMap[selectedAgent].agent_flag||'🌐'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white/90">{agentStateMap[selectedAgent].agent_name}</div>
                    <div className="text-[10px] font-mono text-white/40">{agentStateMap[selectedAgent].key_concern?.slice(0,80)}</div>
                  </div>
                  <button onClick={()=>{ setChatAgent(agentStateMap[selectedAgent]); setChatHistory([]); }}
                    className="text-[10px] font-bold px-3 py-2 rounded-lg"
                    style={{color:'#a855f7',background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.3)'}}>
                    💬
                  </button>
                  <button onClick={()=>setSelectedAgent(null)} className="text-white/40 hover:text-white/70 font-mono">✕</button>
                </div>
              </motion.div>
            )}

            {/* Conversation feed */}
            <div className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
              style={{border:'1px solid rgba(168,85,247,0.15)',background:'linear-gradient(180deg,rgba(5,0,15,0.96),rgba(0,0,0,0.99))',
                minHeight: isMobile ? 350 : undefined }}>

              {/* Topic bar */}
              <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]"
                style={{background:'linear-gradient(90deg,rgba(168,85,247,0.07),transparent)'}}>
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shrink-0"/>
                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest shrink-0">Discussion</span>
                <span className="text-xs font-mono text-white/70 font-bold flex-1 truncate">{activeConv?.topic||'Awaiting activation...'}</span>
                {selectedAgent&&<button onClick={()=>setSelectedAgent(null)} className="text-[10px] font-mono text-purple-400/60 hover:text-purple-400 shrink-0 transition-colors">✕ All</button>}
              </div>

              {/* Conv tabs */}
              {conversations.length>0&&(
                <div className="shrink-0 flex gap-1.5 px-3 py-2.5 overflow-x-auto border-b border-white/[0.05] as-scroll" style={{scrollbarWidth:'none'}}>
                  {conversations.slice(0,6).map(conv=>(
                    <button key={conv.id} onClick={()=>setActiveConvId(conv.id)}
                      className="text-[10px] font-mono px-3 py-1.5 rounded-full border transition-all shrink-0 max-w-[180px] truncate"
                      style={{
                        background:activeConvId===conv.id?'rgba(168,85,247,0.14)':'rgba(255,255,255,0.02)',
                        borderColor:activeConvId===conv.id?'rgba(168,85,247,0.4)':'rgba(255,255,255,0.06)',
                        color:activeConvId===conv.id?'#a855f7':'rgba(255,255,255,0.35)',
                      }}>
                      {conv.topic?.slice(0,40)||'Conv'}
                    </button>
                  ))}
                </div>
              )}

              {/* Generating state */}
              {generating && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto"/>
                    <div className="text-xs font-mono text-purple-400/60 tracking-[0.2em] uppercase">
                      {autoActivated.current && conversations.length === 0 ? 'Initializing Agent Network...' : 'Agents Processing Event'}
                    </div>
                    <div className="text-[10px] font-mono text-white/20">This may take a moment</div>
                  </div>
                </div>
              )}

              {/* Empty state - only if not generating */}
              {conversations.length===0&&!generating&&(
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4 px-6">
                    <div className="text-5xl opacity-30">🌍</div>
                    <p className="text-sm font-mono text-white/40">The agents are watching the world.</p>
                    <p className="text-xs font-mono text-white/20 leading-relaxed max-w-xs mx-auto">80+ agents across governments, banks, markets, and social classes — ready to react to live events.</p>
                    <button onClick={generate} className="text-xs font-mono px-6 py-3 rounded-xl font-bold"
                      style={{color:'#a855f7',background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.3)'}}>⚡ Activate</button>
                  </div>
                </div>
              )}

              {/* Messages */}
              {!generating && (
                <div className="flex-1 min-h-0 overflow-y-auto as-scroll px-4 py-4 space-y-0">
                  {loadingMsgs&&<div className="text-center py-6 text-xs font-mono text-white/25">Loading messages...</div>}
                  <AnimatePresence initial={false}>
                    {visibleMessages.map((msg,i)=><AgentMessage key={msg.id} msg={msg} idx={i}/>)}
                  </AnimatePresence>
                  <div ref={msgsEnd}/>
                </div>
              )}

              {/* Footer */}
              {messages.length>0&&!generating&&(
                <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-t border-white/[0.06]" style={{background:'rgba(0,0,0,0.6)'}}>
                  <span className="text-[10px] font-mono text-white/25">{messages.length} messages</span>
                  <span className="text-white/10">·</span>
                  <span className="text-[10px] font-mono text-white/25">{messages.filter((m:any)=>m.internal_thought).length} hidden thoughts</span>
                  {messages.some((m:any)=>(m.emotion_intensity||0)>=80)&&<span className="ml-auto text-[10px] font-mono text-red-400/60">⚠ extreme emotions</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── God's Eye Dialog ── */}
      <Dialog open={godEyeOpen} onOpenChange={setGodEyeOpen}>
        <DialogContent className="sm:max-w-md" style={{background:'rgba(3,0,18,0.98)',border:'1px solid rgba(251,191,36,0.25)'}}>
          <DialogHeader>
            <DialogTitle className="text-amber-400 font-mono tracking-wider flex items-center gap-2">
              👁 GOD'S EYE
            </DialogTitle>
            <DialogDescription className="text-white/50 font-mono text-xs">
              Inject a world event and watch all agents react in real-time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <textarea
              value={godEyeInput} onChange={e=>setGodEyeInput(e.target.value)}
              placeholder="e.g. Fed cuts 75bps in emergency meeting..."
              rows={3}
              className="w-full bg-transparent text-sm font-mono text-white/80 placeholder-white/25 outline-none p-4 rounded-xl resize-none"
              style={{border:'1px solid rgba(251,191,36,0.25)'}}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setGodEyeOpen(false)}
                className="text-xs font-mono font-bold px-4 py-2.5 rounded-lg text-white/40 hover:text-white/60 transition-colors">
                Cancel
              </button>
              <button onClick={injectGodEye} disabled={generating||!godEyeInput.trim()}
                className="text-xs font-mono font-bold px-5 py-2.5 rounded-lg disabled:opacity-40 transition-all"
                style={{color:'#fbbf24',background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.35)'}}>
                ⚡ INJECT EVENT
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Agent Chat Dialog ── */}
      <Dialog open={!!chatAgent} onOpenChange={(open) => { if (!open) { setChatAgent(null); setChatHistory([]); } }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden" style={{background:'rgba(3,0,18,0.98)',border:'1px solid rgba(168,85,247,0.3)',maxHeight:'80vh'}}>
          <div className="flex flex-col h-full" style={{ maxHeight: '80vh' }}>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]"
              style={{background:'linear-gradient(90deg,rgba(168,85,247,0.08),transparent)'}}>
              <div className="text-2xl">{chatAgent?.agent_flag||'🌐'}</div>
              <div className="flex-1">
                <DialogTitle className="text-sm font-bold text-white/90">{chatAgent?.agent_name}</DialogTitle>
                <DialogDescription className="text-[10px] font-mono text-purple-400/60 uppercase tracking-wider">{chatAgent?.agent_category} · Direct Interview</DialogDescription>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto as-scroll px-5 py-4 space-y-3" style={{ minHeight: 200 }}>
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-xs font-mono text-white/30">Ask {chatAgent?.agent_name} anything.</div>
                  <div className="text-[10px] font-mono text-white/20 mt-1">They will answer from memory and personality.</div>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role==='user'?'justify-end':''}`}>
                  {msg.role==='assistant' && <div className="text-lg shrink-0 mt-0.5">{chatAgent?.agent_flag||'🌐'}</div>}
                  <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm font-mono leading-relaxed"
                    style={{
                      background:msg.role==='user'?'rgba(168,85,247,0.15)':'rgba(255,255,255,0.04)',
                      border:`1px solid ${msg.role==='user'?'rgba(168,85,247,0.3)':'rgba(255,255,255,0.08)'}`,
                      color:msg.role==='user'?'rgba(196,181,253,0.9)':'rgba(255,255,255,0.75)',
                    }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2 items-center">
                  <div className="text-lg">{chatAgent?.agent_flag||'🌐'}</div>
                  <div className="flex gap-1.5 px-4 py-3 rounded-xl" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
                    {[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-purple-400/60" style={{animation:`as-pulse ${0.6+i*0.15}s ease-in-out infinite`}}/>)}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 flex gap-2 px-4 py-4 border-t border-white/[0.08]">
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&chatWithAgent()}
                placeholder={`Ask ${chatAgent?.agent_name?.split(' ')[0]}...`}
                className="flex-1 bg-transparent text-sm font-mono text-white/80 placeholder-white/25 outline-none px-4 py-2.5 rounded-lg"
                style={{border:'1px solid rgba(255,255,255,0.12)'}}/>
              <button onClick={chatWithAgent} disabled={chatLoading||!chatInput.trim()}
                className="text-[10px] font-bold px-4 py-2.5 rounded-lg disabled:opacity-40 transition-all font-mono"
                style={{color:'#a855f7',background:'rgba(168,85,247,0.15)',border:'1px solid rgba(168,85,247,0.3)'}}>
                SEND
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
