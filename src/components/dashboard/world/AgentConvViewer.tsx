import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

const EM: Record<string, {color:string;bg:string;border:string;emoji:string;label:string}> = {
  neutral:    {color:'#94a3b8',bg:'rgba(148,163,184,0.08)',border:'rgba(148,163,184,0.2)',emoji:'😐',label:'Neutral'},
  confident:  {color:'#60a5fa',bg:'rgba(96,165,250,0.08)',border:'rgba(96,165,250,0.2)',emoji:'💪',label:'Confident'},
  panicked:   {color:'#f87171',bg:'rgba(248,113,113,0.12)',border:'rgba(248,113,113,0.3)',emoji:'😱',label:'Panicked'},
  happy:      {color:'#4ade80',bg:'rgba(74,222,128,0.08)',border:'rgba(74,222,128,0.2)',emoji:'😊',label:'Happy'},
  angry:      {color:'#fb923c',bg:'rgba(251,146,60,0.1)',border:'rgba(251,146,60,0.25)',emoji:'😠',label:'Angry'},
  worried:    {color:'#fbbf24',bg:'rgba(251,191,36,0.08)',border:'rgba(251,191,36,0.2)',emoji:'😟',label:'Worried'},
  suspicious: {color:'#a78bfa',bg:'rgba(167,139,250,0.08)',border:'rgba(167,139,250,0.2)',emoji:'🤨',label:'Suspicious'},
  excited:    {color:'#f472b6',bg:'rgba(244,114,182,0.08)',border:'rgba(244,114,182,0.2)',emoji:'🤩',label:'Excited'},
  sad:        {color:'#64748b',bg:'rgba(100,116,139,0.08)',border:'rgba(100,116,139,0.2)',emoji:'😢',label:'Sad'},
  tense:      {color:'#ef4444',bg:'rgba(239,68,68,0.08)',border:'rgba(239,68,68,0.2)',emoji:'😤',label:'Tense'},
};

const CAT_COLOR: Record<string,string> = {
  government:'#60a5fa',central_bank:'#34d399',stock_market:'#fbbf24',
  bank:'#a78bfa',company:'#f472b6',social_class:'#94a3b8',
};

function Message({ msg, idx }: { msg: any; idx: number }) {
  const [showThought, setShowThought] = useState(false);
  const em = EM[msg.emotion||'neutral'] || EM.neutral;
  const catCol = CAT_COLOR[msg.agent_role||'government'] || '#9ca3af';
  const intense = (msg.emotion_intensity||0) >= 80;

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:idx*0.03,duration:0.25}}
      className="flex gap-4 pb-6 mb-1 border-b border-white/[0.06] last:border-0">
      <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl relative"
        style={{background:em.bg,border:`1px solid ${em.border}`,boxShadow:intense?`0 0 18px ${em.color}30`:undefined}}>
        {msg.agent_flag||'🌐'}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{background:'rgba(0,0,0,0.95)',border:`1px solid ${em.border}`}}>{em.emoji}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[15px] font-bold" style={{color:em.color}}>{msg.agent_name}</span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{color:em.color,background:em.bg,border:`1px solid ${em.border}`}}>
            {em.emoji} {em.label}{intense?` · ${msg.emotion_intensity}%`:''}
          </span>
        </div>
        <div className="rounded-xl px-4 py-4 text-sm leading-[1.9]"
          style={{background:`linear-gradient(135deg,${em.bg},rgba(0,0,0,0.45))`,border:`1px solid ${em.border}`,borderLeft:`3px solid ${catCol}`,color:'rgba(255,255,255,0.85)'}}>
          {msg.message}
        </div>
        {msg.internal_thought && (
          <div className="mt-2">
            <button onClick={()=>setShowThought(!showThought)}
              className="text-[10px] font-mono italic flex items-center gap-1 transition-colors"
              style={{color:showThought?'#c4b5fd':'rgba(255,255,255,0.3)'}}>
              💭 {showThought?'hide thought':'reveal inner thought'}
            </button>
            <AnimatePresence>
              {showThought && (
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">
                  <div className="mt-2 rounded-lg px-4 py-3 text-xs font-mono italic leading-relaxed"
                    style={{color:'#c4b5fd',background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',borderLeft:'3px solid rgba(167,139,250,0.5)'}}>
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

export default function AgentConvViewer({ convId }: { convId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const msgsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!convId) return;
    setLoading(true);
    setError(null);
    setMessages([]);

    fetch(`${SUPA_URL}/functions/v1/ayn-agent-society`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'get_messages', conversation_id: convId }),
    })
      .then(r => r.json())
      .then(data => { setMessages(data.messages || []); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [convId]);

  useEffect(() => {
    if (messages.length > 0) msgsEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto"/>
        <p className="text-xs font-mono text-white/25 tracking-widest">LOADING MESSAGES</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center py-12">
      <p className="text-xs font-mono text-red-400/50">Failed to load messages</p>
    </div>
  );

  if (!messages.length) return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm font-mono text-white/25">No messages in this discussion yet</p>
    </div>
  );

  return (
    <div className="px-6 py-5" style={{maxHeight:600,overflowY:'auto',scrollbarWidth:'thin',scrollbarColor:'rgba(168,85,247,0.2) transparent'}}>
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => <Message key={msg.id||i} msg={msg} idx={i} />)}
      </AnimatePresence>
      <div className="flex items-center gap-3 pt-4 border-t border-white/[0.05]">
        <span className="text-[10px] font-mono text-white/20">{messages.length} messages</span>
        <span className="text-white/10">·</span>
        <span className="text-[10px] font-mono text-white/20">{messages.filter((m:any)=>m.internal_thought).length} hidden thoughts</span>
        {messages.some((m:any)=>(m.emotion_intensity||0)>=80) && (
          <span className="ml-auto text-[10px] font-mono text-red-400/60">⚠ extreme emotions</span>
        )}
      </div>
      <div ref={msgsEnd}/>
    </div>
  );
}
