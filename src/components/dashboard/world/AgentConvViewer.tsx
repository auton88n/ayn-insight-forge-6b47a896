import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spineAuth } from '@/lib/spineAuth';

const EM: Record<string, {color:string;bg:string;border:string;emoji:string;label:string}> = {
  neutral:    {color:'#94a3b8',bg:'rgba(148,163,184,0.08)',border:'rgba(148,163,184,0.2)',  emoji:'😐',label:'Neutral'},
  confident:  {color:'#60a5fa',bg:'rgba(96,165,250,0.08)', border:'rgba(96,165,250,0.2)',   emoji:'💪',label:'Confident'},
  panicked:   {color:'#f87171',bg:'rgba(248,113,113,0.12)',border:'rgba(248,113,113,0.3)',  emoji:'😱',label:'Panicked'},
  happy:      {color:'#4ade80',bg:'rgba(74,222,128,0.08)', border:'rgba(74,222,128,0.2)',   emoji:'😊',label:'Happy'},
  angry:      {color:'#fb923c',bg:'rgba(251,146,60,0.1)',  border:'rgba(251,146,60,0.25)',  emoji:'😠',label:'Angry'},
  worried:    {color:'#fbbf24',bg:'rgba(251,191,36,0.08)', border:'rgba(251,191,36,0.2)',   emoji:'😟',label:'Worried'},
  suspicious: {color:'#a78bfa',bg:'rgba(167,139,250,0.08)',border:'rgba(167,139,250,0.2)', emoji:'🤨',label:'Suspicious'},
  excited:    {color:'#f472b6',bg:'rgba(244,114,182,0.08)',border:'rgba(244,114,182,0.2)', emoji:'🤩',label:'Excited'},
  sad:        {color:'#64748b',bg:'rgba(100,116,139,0.08)',border:'rgba(100,116,139,0.2)', emoji:'😢',label:'Sad'},
  tense:      {color:'#ef4444',bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.2)',   emoji:'😤',label:'Tense'},
  bitter:     {color:'#f97316',bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.2)',  emoji:'😒',label:'Bitter'},
};

const CAT_COLOR: Record<string,string> = {
  government:'#60a5fa',central_bank:'#34d399',stock_market:'#fbbf24',
  bank:'#a78bfa',company:'#f472b6',social_class:'#94a3b8',
};

const ROUND_CONFIG: Record<number, {label:string;sublabel:string;color:string;icon:string}> = {
  1:{label:'IMMEDIATE',    sublabel:'Direct institutional response · 0–24 hours', color:'#ef4444',icon:'⚡'},
  2:{label:'TRANSMISSION', sublabel:'Second-order economic effects · 1–7 days',   color:'#f59e0b',icon:'🔄'},
  3:{label:'HUMAN IMPACT', sublabel:'Behavioral & social shifts · weeks to months',color:'#34d399',icon:'👥'},
};

function RoundDivider({round}:{round:number}) {
  const cfg = ROUND_CONFIG[round];
  if (!cfg) return null;
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px flex-1" style={{background:`linear-gradient(90deg,transparent,${cfg.color}40)`}}/>
      <div className="flex flex-col items-center px-4 py-2 rounded-xl"
        style={{background:`${cfg.color}10`,border:`1px solid ${cfg.color}30`}}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{cfg.icon}</span>
          <span className="text-[11px] font-bold font-mono tracking-[0.12em] uppercase" style={{color:cfg.color}}>
            Round {round} — {cfg.label}
          </span>
        </div>
        <span className="text-[9px] font-mono mt-0.5" style={{color:`${cfg.color}80`}}>{cfg.sublabel}</span>
      </div>
      <div className="h-px flex-1" style={{background:`linear-gradient(90deg,${cfg.color}40,transparent)`}}/>
    </div>
  );
}

function Message({msg,idx}:{msg:any;idx:number}) {
  const [showThought,setShowThought] = useState(false);
  const em = EM[msg.emotion||'neutral']||EM.neutral;
  const catCol = CAT_COLOR[msg.agent_role||'government']||'#9ca3af';
  const intense = (msg.emotion_intensity||0)>=80;
  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.02,duration:0.2}}
      className="flex gap-4 pb-5 mb-1 border-b border-white/[0.05] last:border-0">
      <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg relative"
        style={{background:em.bg,border:`1px solid ${em.border}`,boxShadow:intense?`0 0 14px ${em.color}30`:undefined}}>
        {msg.agent_flag||'🌐'}
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]"
          style={{background:'rgba(0,0,0,0.95)',border:`1px solid ${em.border}`}}>{em.emoji}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-sm font-bold" style={{color:catCol}}>{msg.agent_name}</span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            style={{color:em.color,background:em.bg,border:`1px solid ${em.border}`}}>
            {em.label}{intense?` ${msg.emotion_intensity}%`:''}
          </span>
          {msg.responding_to_agent&&<span className="text-[9px] font-mono text-white/30">↩ {msg.responding_to_agent}</span>}
        </div>
        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed"
          style={{background:`linear-gradient(135deg,${em.bg},rgba(0,0,0,0.4))`,border:`1px solid ${em.border}`,borderLeft:`3px solid ${catCol}`,color:'rgba(255,255,255,0.88)'}}>
          {msg.message}
        </div>
        {msg.market_action?.action&&(
          <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg"
            style={{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.2)'}}>
            <span className="text-[11px] shrink-0 mt-0.5 text-emerald-400">→</span>
            <span className="text-[11px] font-mono font-bold text-emerald-300">{msg.market_action.action}</span>
          </div>
        )}
        {msg.internal_thought&&(
          <div className="mt-2">
            <button onClick={()=>setShowThought(!showThought)}
              className="text-[10px] font-mono italic flex items-center gap-1 transition-colors"
              style={{color:showThought?'#c4b5fd':'rgba(255,255,255,0.28)'}}>
              💭 {showThought?'hide thought':'reveal inner thought'}
            </button>
            <AnimatePresence>
              {showThought&&(
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="mt-1.5 rounded-lg px-4 py-3 text-xs font-mono italic leading-relaxed"
                    style={{color:'#c4b5fd',background:'rgba(167,139,250,0.07)',border:'1px solid rgba(167,139,250,0.18)',borderLeft:'3px solid rgba(167,139,250,0.45)'}}>
                    "{msg.internal_thought}"
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CascadeSummary({summary}:{summary:any}) {
  if (!summary?.headline_outcome) return null;
  const confColor = summary.probability==='High'?'#34d399':summary.probability==='Medium'?'#fbbf24':'#94a3b8';
  const confBg = summary.probability==='High'?'rgba(52,211,153,0.1)':summary.probability==='Medium'?'rgba(251,191,36,0.1)':'rgba(148,163,184,0.1)';
  return (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.2,duration:0.4}}
      className="rounded-2xl overflow-hidden mb-6" style={{background:'rgba(1,0,18,0.95)',border:'1px solid rgba(168,85,247,0.3)'}}>
      <div className="px-5 py-3 flex items-center gap-2"
        style={{background:'linear-gradient(90deg,rgba(168,85,247,0.12),transparent)',borderBottom:'1px solid rgba(168,85,247,0.15)'}}>
        <span className="text-sm">🔮</span>
        <span className="text-[10px] font-bold font-mono tracking-[0.15em] uppercase text-purple-400">Cascade Prediction</span>
        <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full"
          style={{color:confColor,background:confBg,border:`1px solid ${confColor}40`}}>
          {summary.probability} confidence
        </span>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm font-semibold text-white/90 leading-relaxed">{summary.headline_outcome}</p>
        <div className="grid grid-cols-2 gap-3">
          {summary.winners?.length>0&&(
            <div className="rounded-xl p-3" style={{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.2)'}}>
              <div className="text-[9px] font-bold font-mono text-emerald-400/70 uppercase tracking-wider mb-2">Winners</div>
              {summary.winners.map((w:string,i:number)=><div key={i} className="text-[11px] text-emerald-300/80 leading-snug">✓ {w}</div>)}
            </div>
          )}
          {summary.losers?.length>0&&(
            <div className="rounded-xl p-3" style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)'}}>
              <div className="text-[9px] font-bold font-mono text-red-400/70 uppercase tracking-wider mb-2">Losers</div>
              {summary.losers.map((l:string,i:number)=><div key={i} className="text-[11px] text-red-300/80 leading-snug">✗ {l}</div>)}
            </div>
          )}
        </div>
        {summary.watch_indicators?.length>0&&(
          <div>
            <div className="text-[9px] font-bold font-mono text-white/30 uppercase tracking-wider mb-2">Watch these</div>
            <div className="flex flex-wrap gap-2">
              {summary.watch_indicators.map((w:string,i:number)=>(
                <span key={i} className="text-[10px] font-mono px-2 py-1 rounded-lg"
                  style={{color:'rgba(251,191,36,0.85)',background:'rgba(251,191,36,0.07)',border:'1px solid rgba(251,191,36,0.22)'}}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
        {summary.human_impact_summary&&(
          <div className="pt-3 border-t border-white/[0.06]">
            <div className="text-[9px] font-bold font-mono text-white/30 uppercase tracking-wider mb-1.5">Human impact</div>
            <p className="text-[11px] text-white/55 leading-relaxed font-mono">{summary.human_impact_summary}</p>
          </div>
        )}
        {summary.key_risks?.length>0&&(
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="text-[9px] font-bold font-mono text-white/30 uppercase tracking-wider mb-2">Key risks</div>
            {summary.key_risks.map((r:string,i:number)=>(
              <div key={i} className="text-[10px] font-mono text-orange-300/60">⚠ {r}</div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function AgentConvViewer({convId}:{convId:string}) {
  const [messages,setMessages] = useState<any[]>([]);
  const [convMeta,setConvMeta] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const msgsEnd = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!convId)return;
    setLoading(true);setError(null);setMessages([]);setConvMeta(null);
    spineAuth.getAccessToken().then(token => {
      fetch(`https://spine.aynn.io/intelligence/agent-conversations/${convId}/messages`,{
        headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}
      }).then(r=>r.json()).then(d=>setMessages(Array.isArray(d)?d:[])).catch(e=>setError(String(e))).finally(()=>setLoading(false));
      fetch(`https://spine.aynn.io/intelligence/agent-conversations/${convId}`,{
        headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}
      }).then(r=>r.json()).then(d=>{if(d?.[0])setConvMeta(d[0]);}).catch(()=>{});
    });
  },[convId]);

  const isCascade = convMeta?.metadata?.cascade;
  const cascadeSummary = convMeta?.metadata?.summary;
  const grouped = messages.reduce((acc:Record<number,any[]>,msg)=>{
    const r=msg.cascade_round||0;if(!acc[r])acc[r]=[];acc[r].push(msg);return acc;
  },{});
  const hasRounds = Object.keys(grouped).some(k=>Number(k)>0);

  if(loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto"/>
        <p className="text-xs font-mono text-white/25 tracking-widest">
          {isCascade?'RUNNING CASCADE...':'LOADING'}
        </p>
      </div>
    </div>
  );

  if(error) return <div className="flex items-center justify-center py-12"><p className="text-xs font-mono text-red-400/50">Failed to load</p></div>;
  if(!messages.length) return <div className="flex items-center justify-center py-12"><p className="text-sm font-mono text-white/25">No messages yet</p></div>;

  return (
    <div className="px-5 py-5" style={{maxHeight:680,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(168,85,247,0.15) transparent'}}>
      {isCascade&&cascadeSummary&&<CascadeSummary summary={cascadeSummary}/>}
      {isCascade&&(
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.06]">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"/>
          <span className="text-[9px] font-mono font-bold text-purple-400 tracking-[0.15em] uppercase">
            3-Round Impact Cascade · {messages.length} agent reactions
          </span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {hasRounds
          ? [1,2,3].map(round=>{
              const rMsgs=grouped[round]||[];
              if(!rMsgs.length)return null;
              return <div key={round}><RoundDivider round={round}/>{rMsgs.map((msg,i)=><Message key={msg.id||i} msg={msg} idx={i}/>)}</div>;
            })
          : messages.map((msg,i)=><Message key={msg.id||i} msg={msg} idx={i}/>)
        }
      </AnimatePresence>
      <div className="flex items-center gap-3 pt-4 mt-2 border-t border-white/[0.05]">
        <span className="text-[10px] font-mono text-white/20">{messages.length} reactions</span>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/20">{messages.filter((m:any)=>m.market_action?.action).length} actions</span>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/20">{messages.filter((m:any)=>m.internal_thought).length} hidden thoughts</span>
        {messages.some((m:any)=>(m.emotion_intensity||0)>=80)&&<span className="ml-auto text-[10px] font-mono text-red-400/60">⚠ extreme tension</span>}
      </div>
      <div ref={msgsEnd}/>
    </div>
  );
}
