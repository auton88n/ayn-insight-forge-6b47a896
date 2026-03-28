import React, { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MapPoint {
  id?: string;
  coordinates: [number, number]; // [lng, lat]
  label: string;
  detail?: string;
  category?: string;
  risk: 'critical'|'high'|'alert'|'stable'|'unknown'|'satellite'|'aviation'|'maritime'|'cyber'|'disaster';
  heading?: number;
  speed?: number;
}

export type MapLayer = 'all'|'conflict'|'maritime'|'aviation'|'cyber'|'disasters';

const LAYER_CATEGORIES: Record<MapLayer,string[]> = {
  all:[], conflict:['Conflict','Military'], maritime:['Maritime','Supply Chain'],
  aviation:['Aviation'], cyber:['Cyber'], disasters:['Disaster','Seismology','Wildfire'],
};

export const riskConfig = {
  critical: { color:'#ff2244', size:0.7, glow:'rgba(255,34,68,0.9)',   label:'CONFLICT',  pulse:true  },
  high:     { color:'#ff6600', size:0.55,glow:'rgba(255,102,0,0.8)',   label:'HIGH RISK', pulse:true  },
  alert:    { color:'#ffcc00', size:0.45,glow:'rgba(255,204,0,0.7)',   label:'ALERT',     pulse:false },
  stable:   { color:'#00ff88', size:0.38,glow:'rgba(0,255,136,0.6)',   label:'STABLE',    pulse:false },
  satellite:{ color:'#cc88ff', size:0.38,glow:'rgba(204,136,255,0.6)',label:'SATELLITE', pulse:false },
  unknown:  { color:'#00ccff', size:0.38,glow:'rgba(0,204,255,0.6)',   label:'INTEL',     pulse:false },
  aviation: { color:'#00aaff', size:0.45,glow:'rgba(0,170,255,0.8)',   label:'AVIATION',  pulse:true  },
  maritime: { color:'#00ffcc', size:0.45,glow:'rgba(0,255,204,0.8)',   label:'MARITIME',  pulse:false },
  cyber:    { color:'#ff00aa', size:0.45,glow:'rgba(255,0,170,0.8)',   label:'CYBER',     pulse:true  },
  disaster: { color:'#ff8800', size:0.55,glow:'rgba(255,136,0,0.8)',   label:'DISASTER',  pulse:true  },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_ICONS: Record<MapLayer,string> = { all:'◈',conflict:'⚔',maritime:'⚓',aviation:'✈',cyber:'⬡',disasters:'△' };
const LAYER_LABELS: Record<MapLayer,string> = { all:'ALL',conflict:'CONFLICT',maritime:'MARITIME',aviation:'AVIATION',cyber:'CYBER',disasters:'DISASTERS' };

function countLayer(pts:MapPoint[],l:MapLayer){ if(l==='all')return pts.length; const c=LAYER_CATEGORIES[l]; return pts.filter(p=>c.some(x=>(p.category||'').toLowerCase().includes(x.toLowerCase()))).length; }

// Ticker
function ThreatTicker({items}:{items:string[]}){
  const [off,setOff]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setOff(o=>o+0.4),16);return()=>clearInterval(t);},[]);
  if(!items.length)return null;
  const txt=items.join('   ·   ');
  return(
    <div className="overflow-hidden whitespace-nowrap flex-1">
      <span className="inline-block text-[8px] font-mono text-white/35 tracking-widest"
        style={{transform:`translateX(-${off%(txt.length*5.6)}px)`,transition:'none'}}>
        {txt+'   ·   '+txt}
      </span>
    </div>
  );
}

// ─── 3D Globe ─────────────────────────────────────────────────────────────────
function Globe3D({points,activeLayer,onPointClick}:{
  points:MapPoint[]; activeLayer:MapLayer; onPointClick?:(pt:MapPoint)=>void;
}){
  const globeRef=useRef<any>(null);
  const containerRef=useRef<HTMLDivElement>(null);
  const [GlobeComp,setGlobeComp]=useState<any>(null);
  const [dims,setDims]=useState({w:900,h:460});

  useEffect(()=>{
    // @ts-ignore
    import('react-globe.gl').then((m:any)=>setGlobeComp(()=>m.default||m));
  },[]);

  useEffect(()=>{
    const obs=new ResizeObserver(entries=>{
      const r=entries[0]?.contentRect;
      if(r)setDims({w:Math.floor(r.width),h:Math.floor(r.height)});
    });
    if(containerRef.current)obs.observe(containerRef.current);
    return()=>obs.disconnect();
  },[]);

  useEffect(()=>{
    if(!globeRef.current)return;
    const ctrl=globeRef.current.controls?.();
    if(ctrl){
      ctrl.autoRotate=true;
      ctrl.autoRotateSpeed=0.22;
      ctrl.enableDamping=true;
      ctrl.dampingFactor=0.06;
      ctrl.minDistance=150;
      ctrl.maxDistance=600;
    }
    globeRef.current.pointOfView?.({lat:20,lng:15,altitude:1.8},1200);
  },[GlobeComp]);

  const filtered=useMemo(()=>{
    if(activeLayer==='all')return points;
    const cats=LAYER_CATEGORIES[activeLayer];
    return points.filter(p=>cats.some(c=>(p.category||'').toLowerCase().includes(c.toLowerCase())));
  },[points,activeLayer]);

  // Globe point data — sized by risk
  const globePoints=useMemo(()=>filtered.map(p=>({
    lat:p.coordinates[1], lng:p.coordinates[0],
    size:(riskConfig[p.risk as RiskKey]?.size??0.4)*1.4,
    color:riskConfig[p.risk as RiskKey]?.color??'#00ffcc',
    label:p.label, detail:p.detail, risk:p.risk, _raw:p,
  })),[filtered]);

  // Threat arcs between critical/cyber hotspots
  const arcData=useMemo(()=>{
    const crits=filtered.filter(p=>['critical','cyber','high'].includes(p.risk));
    return crits.slice(0,14).map((src,i)=>{
      const dst=filtered[(i*4+7)%Math.max(1,filtered.length)];
      return dst&&dst!==src?{
        startLat:src.coordinates[1],startLng:src.coordinates[0],
        endLat:dst.coordinates[1],  endLng:dst.coordinates[0],
        color:[(riskConfig[src.risk as RiskKey]?.color??'#ff2244')+'dd','rgba(0,0,0,0)'],
      }:null;
    }).filter(Boolean);
  },[filtered]);

  if(!GlobeComp)return(
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#00ffcc]/20 border-t-[#00ffcc] rounded-full animate-spin"/>
        <span className="text-[9px] font-mono text-[#00ffcc]/40 tracking-[0.3em]">INITIALIZING GLOBE...</span>
      </div>
    </div>
  );

  return(
    <div ref={containerRef} className="w-full h-full"
      style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
      <GlobeComp
        ref={globeRef}
        width={dims.w} height={dims.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#00ffcc"
        atmosphereAltitude={0.14}
        // ── Intel points
        pointsData={globePoints}
        pointLat="lat" pointLng="lng"
        pointColor="color"
        pointAltitude={0.015}
        pointRadius="size"
        pointResolution={14}
        pointsMerge={false}
        pointLabel={(d:any)=>`
          <div style="background:rgba(0,4,12,0.97);border:1px solid ${d.color}66;border-radius:12px;padding:12px 16px;font-family:'Courier New',monospace;max-width:260px;box-shadow:0 0 30px ${d.color}44,0 8px 32px rgba(0,0,0,0.9)">
            <div style="color:${d.color};font-size:12px;font-weight:900;letter-spacing:0.12em;margin-bottom:5px">${d.label}</div>
            <div style="color:rgba(255,255,255,0.55);font-size:9px;line-height:1.6">${(d.detail||'Intelligence monitoring active.').slice(0,180)}</div>
          </div>`}
        onPointClick={(d:any)=>{if(d._raw)onPointClick?.(d._raw);}}
        onPointHover={(d:any)=>{if(globeRef.current?.controls)globeRef.current.controls().autoRotate=!d;}}
        // ── Threat arcs
        arcsData={arcData}
        arcStartLat="startLat" arcStartLng="startLng"
        arcEndLat="endLat"     arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.4} arcDashGap={0.15}
        arcDashAnimateTime={1600}
        arcStroke={0.5} arcAltitude={0.28}
        // ── Hex polygons for country fill (subtle)
        hexPolygonsData={[]}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function HeatMap2D({
  points=[],height=460,onPointClick,
  showLayerToggle=false,isLive=false,lastRefresh,ticker=[],
}:{
  points?:MapPoint[];height?:number;onPointClick?:(pt:MapPoint)=>void;
  showLayerToggle?:boolean;isLive?:boolean;lastRefresh?:Date;ticker?:string[];
}){
  const [activeLayer,setActiveLayer]=useState<MapLayer>('all');
  const layers:MapLayer[]=['all','conflict','maritime','aviation','cyber','disasters'];

  const filtered=useMemo(()=>{
    if(activeLayer==='all')return points;
    const cats=LAYER_CATEGORIES[activeLayer];
    return points.filter(p=>cats.some(c=>(p.category||'').toLowerCase().includes(c.toLowerCase())));
  },[points,activeLayer]);

  return(
    <div className="w-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background:'radial-gradient(ellipse at 50% 0%,rgba(0,25,18,0.98) 0%,rgba(0,3,8,0.99) 70%)',
        border:'1px solid rgba(0,255,200,0.12)',
        boxShadow:'0 0 80px rgba(0,255,200,0.05),inset 0 1px 0 rgba(0,255,200,0.06)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#00ffcc]/6"
        style={{background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)'}}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 items-center">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{boxShadow:'0 0 8px #ff2244'}}/>
            <div className="w-2 h-2 rounded-full bg-yellow-400 opacity-50"/>
            <div className="w-2 h-2 rounded-full bg-[#00ff88]" style={{boxShadow:'0 0 6px #00ff88'}}/>
          </div>
          <span className="text-[10px] font-mono font-black text-[#00ffcc] tracking-[0.22em]">
            AYN // WORLD THREAT MATRIX
          </span>
          <span className="text-[7px] font-mono text-white/15 tracking-widest">
            LIVE INTEL · DRAG TO ROTATE · HOVER SIGNAL
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/20">{filtered.length} SIGNALS</span>
          {isLive&&(
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
              style={{border:'1px solid rgba(0,255,136,0.3)',background:'rgba(0,255,136,0.06)'}}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" style={{boxShadow:'0 0 6px #00ff88'}}/>
              <span className="text-[7px] font-mono text-[#00ff88] tracking-widest">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Layer tabs */}
      {showLayerToggle&&(
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/4 bg-black/50 overflow-x-auto">
          {layers.map(layer=>{
            const cnt=countLayer(points,layer);
            const active=activeLayer===layer;
            const danger=layer==='conflict';
            return(
              <button key={layer} onClick={()=>setActiveLayer(layer)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[7px] font-mono uppercase tracking-[0.12em] transition-all border whitespace-nowrap flex-shrink-0',
                  active
                    ? danger?'bg-red-500/15 border-red-500/40 text-red-400':'bg-[#00ffcc]/10 border-[#00ffcc]/35 text-[#00ffcc]'
                    : 'bg-white/2 border-white/6 text-white/25 hover:border-white/12 hover:text-white/40'
                )}>
                <span>{LAYER_ICONS[layer]}</span>
                {LAYER_LABELS[layer]}
                <span className={cn('text-[6px] px-1 py-0.5 rounded-full font-bold ml-0.5',
                  active?(danger?'bg-red-500/20 text-red-400':'bg-[#00ffcc]/15 text-[#00ffcc]'):'bg-white/5 text-white/20')}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Globe */}
      <div className="relative" style={{height}}>
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none z-10"
          style={{background:'radial-gradient(ellipse at 50% 50%,transparent 40%,rgba(0,3,8,0.7) 100%)'}}/>
        {/* Corner brackets */}
        {[['top-2 left-2','border-t border-l'],['top-2 right-2','border-t border-r'],
          ['bottom-2 left-2','border-b border-l'],['bottom-2 right-2','border-b border-r']].map(([p,b],i)=>(
          <div key={i} className={`absolute w-5 h-5 border-[#00ffcc]/25 z-20 ${p} ${b}`}/>
        ))}

        <Globe3D points={points} activeLayer={activeLayer} onPointClick={onPointClick}/>

        {/* Signal counters — right side */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
          {[
            {l:'CONFLICT', c:countLayer(points,'conflict'), col:'#ff2244'},
            {l:'MARITIME', c:countLayer(points,'maritime'), col:'#00ffcc'},
            {l:'CYBER',    c:countLayer(points,'cyber'),    col:'#ff00aa'},
            {l:'DISASTERS',c:countLayer(points,'disasters'),col:'#ff8800'},
          ].filter(s=>s.c>0).map(s=>(
            <div key={s.l} className="flex items-center gap-2 bg-black/85 border border-white/8 rounded-lg px-2.5 py-1.5"
              style={{backdropFilter:'blur(12px)'}}>
              <div className="w-1 h-5 rounded-full" style={{background:s.col,boxShadow:`0 0 8px ${s.col}`}}/>
              <div>
                <div className="text-[6px] font-mono text-white/25 tracking-widest">{s.l}</div>
                <div className="text-[11px] font-mono font-black" style={{color:s.col}}>{s.c}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend — bottom left */}
        <div className="absolute bottom-3 left-3 z-20">
          <div className="bg-black/85 border border-white/8 rounded-xl px-3 py-2.5 space-y-1.5"
            style={{backdropFilter:'blur(16px)'}}>
            <div className="text-[5.5px] font-mono text-white/20 uppercase tracking-[0.2em] mb-1">Signal Key</div>
            {(['critical','high','alert','maritime','aviation','cyber','disaster'] as RiskKey[]).map(r=>(
              <div key={r} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{backgroundColor:riskConfig[r].color,boxShadow:`0 0 6px ${riskConfig[r].glow}`}}/>
                <span className="text-[6.5px] font-mono text-white/35 uppercase tracking-widest">
                  {riskConfig[r].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker */}
      {ticker.length>0&&(
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/4 bg-black/70">
          <span className="shrink-0 text-[6.5px] font-mono font-black text-red-400 tracking-widest border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
            ▶ FEED
          </span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
