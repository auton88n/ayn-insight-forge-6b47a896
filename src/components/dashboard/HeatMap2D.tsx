import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MapPoint {
  id?: string;
  coordinates: [number, number]; // [lng, lat]
  label: string;
  detail?: string;
  category?: string;
  heading?: number;
  speed?: number;
  risk: 'critical'|'high'|'alert'|'stable'|'unknown'|'satellite'|'aviation'|'maritime'|'cyber'|'disaster'|'nuclear';
}
export type MapLayer = 'all'|'conflict'|'maritime'|'aviation'|'cyber'|'disasters'|'nuclear';
export type ViewMode  = 'standard'|'nightvision'|'flir';

interface GpsHexCell {
  hex: string; level: 1|2|3;
  lat: number; lng: number;
  boundary: [number,number][];
}

export const riskConfig = {
  critical: { hex:'#dc2626', label:'CRITICAL',  pulse:true,  bg:'rgba(220,38,38,0.08)' },
  high:     { hex:'#ea580c', label:'HIGH',       pulse:true,  bg:'rgba(234,88,12,0.06)' },
  alert:    { hex:'#ca8a04', label:'ELEVATED',   pulse:false, bg:'rgba(202,138,4,0.05)' },
  stable:   { hex:'#16a34a', label:'STABLE',     pulse:false, bg:'rgba(22,163,74,0.05)' },
  satellite:{ hex:'#7c3aed', label:'SATELLITE',  pulse:false, bg:'rgba(124,58,237,0.05)' },
  unknown:  { hex:'#0891b2', label:'UNKNOWN',    pulse:false, bg:'rgba(8,145,178,0.05)' },
  aviation: { hex:'#2563eb', label:'AVIATION',   pulse:false, bg:'rgba(37,99,235,0.05)' },
  maritime: { hex:'#0d9488', label:'MARITIME',   pulse:false, bg:'rgba(13,148,136,0.05)' },
  cyber:    { hex:'#c026d3', label:'CYBER',      pulse:true,  bg:'rgba(192,38,211,0.06)' },
  disaster: { hex:'#ea580c', label:'DISASTER',   pulse:true,  bg:'rgba(234,88,12,0.06)' },
  nuclear:  { hex:'#65a30d', label:'NUCLEAR',    pulse:true,  bg:'rgba(101,163,13,0.06)' },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_CATS: Record<MapLayer,string[]> = {
  all:[], conflict:['Conflict','Military'], maritime:['Maritime','Supply Chain'],
  aviation:['Aviation'], cyber:['Cyber'], disasters:['Disaster','Seismology','Wildfire'],
  nuclear:['Nuclear'],
};
const LAYER_META: Record<MapLayer,{icon:string;label:string;color:string;desc:string}> = {
  all:      {icon:'⊞',label:'ALL LAYERS',  color:'#94a3b8', desc:'Full overlay'},
  conflict: {icon:'⚔',label:'CONFLICT',    color:'#dc2626', desc:'Active combat zones'},
  maritime: {icon:'⚓',label:'MARITIME',    color:'#0d9488', desc:'Shipping & chokepoints'},
  aviation: {icon:'✈',label:'AVIATION',    color:'#2563eb', desc:'Airspace restrictions'},
  cyber:    {icon:'⬡',label:'CYBER',       color:'#c026d3', desc:'Threat actor ops'},
  disasters:{icon:'△',label:'NATURAL',     color:'#ea580c', desc:'Seismic & volcanic'},
  nuclear:  {icon:'☢',label:'NUCLEAR',     color:'#65a30d', desc:'Facilities & programs'},
};

const VIEW_FILTERS: Record<ViewMode,string> = {
  standard:    'none',
  nightvision: 'brightness(1.15) contrast(1.25) sepia(1) hue-rotate(62deg) saturate(9) drop-shadow(0 0 2px #00ff44)',
  flir:        'sepia(1) hue-rotate(295deg) saturate(6) brightness(0.85) contrast(1.4)',
};

const JAM_COLORS: Record<1|2|3, {fill:string; stroke:string}> = {
  1: { fill:'rgba(0,0,0,0)', stroke:'rgba(234,179,8,0.45)'  },
  2: { fill:'rgba(0,0,0,0)', stroke:'rgba(249,115,22,0.55)' },
  3: { fill:'rgba(0,0,0,0)', stroke:'rgba(239,68,68,0.65)' },
};

function countLayer(pts:MapPoint[],l:MapLayer){
  if(l==='all')return pts.length;
  const c=LAYER_CATS[l];
  return pts.filter(p=>c.some(x=>(p.category||'').toLowerCase().includes(x.toLowerCase()))).length;
}
function hexRgb(hex:string):[number,number,number]{
  const n=parseInt(hex.slice(1),16);
  return[(n>>16)&255,(n>>8)&255,n&255];
}

// Ticker
function ThreatTicker({items}:{items:string[]}){
  const [off,setOff]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setOff(o=>o+0.35),16);return()=>clearInterval(t);},[]);
  if(!items.length)return null;
  const txt=items.join('   │   ');
  return(
    <div style={{overflow:'hidden',whiteSpace:'nowrap',flex:1}}>
      <span style={{display:'inline-block',fontSize:9,fontFamily:'"JetBrains Mono",monospace',color:'rgba(148,163,184,0.5)',
        letterSpacing:'0.04em',transform:`translateX(-${off%(txt.length*5.6)}px)`,transition:'none'}}>
        {txt+'   │   '+txt}
      </span>
    </div>
  );
}

const SUPA='https://dfkoxuokfkttjhfjcecx.supabase.co';

// ─── Main Component ───────────────────────────────────────────────────────────
export function HeatMap2D({
  points=[], height=460, onPointClick,
  showLayerToggle=false, isLive=false, lastRefresh, ticker=[],
}:{
  points?:MapPoint[]; height?:number; onPointClick?:(pt:MapPoint)=>void;
  showLayerToggle?:boolean; isLive?:boolean; lastRefresh?:Date; ticker?:string[];
}){
  const globeRef    = useRef<any>(null);
  const containerRef= useRef<HTMLDivElement>(null);
  const [globeWidth, setGlobeWidth]   = useState(0);
  const [Globe, setGlobe]             = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [viewMode, setViewMode]       = useState<ViewMode>('standard');
  const [selected, setSelected]       = useState<MapPoint|null>(null);
  const [clickPos, setClickPos]       = useState<{x:number;y:number}>({x:0,y:0});
  const [showJam, setShowJam]         = useState(false);
  const [jamCells, setJamCells]       = useState<GpsHexCell[]>([]);
  const [jamLoading, setJamLoading]   = useState(false);
  const [jamCount, setJamCount]       = useState(0);
  const layers: MapLayer[] = ['all','conflict','maritime','aviation','cyber','disasters','nuclear'];

  useEffect(()=>{
    import('react-globe.gl').then(m=>setGlobe(()=>m.default));
  },[]);

  useEffect(()=>{
    if(!containerRef.current) return;
    const node = containerRef.current;
    const updateWidth = () => setGlobeWidth(node.clientWidth || 0);
    updateWidth();
    const observer = new ResizeObserver(entries=>{
      const entry = entries[0];
      if(entry) setGlobeWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!globeRef.current)return;
    const ctrl=globeRef.current.controls();
    ctrl.autoRotate=true; ctrl.autoRotateSpeed=0.25;
    ctrl.enableZoom=true; ctrl.minDistance=120; ctrl.maxDistance=600;
    globeRef.current.pointOfView({lat:25,lng:15,altitude:2.2});
  },[Globe]);

  const fetchJamming = useCallback(async()=>{
    if(jamCells.length>0){ setShowJam(true); return; }
    setJamLoading(true);
    try{
      const res=await fetch(`${SUPA}/functions/v1/ayn-gpsjam`);
      if(res.ok){
        const d=await res.json();
        setJamCells((d.cells||[]).filter((c:GpsHexCell)=>c.boundary&&c.boundary.length>2));
        setJamCount(d.count||0);
        setShowJam(true);
      }
    }catch(e){ console.warn('[gpsjam] fetch failed:', e); }
    finally{ setJamLoading(false); }
  },[jamCells.length]);

  const toggleJam=()=>{
    if(!showJam && jamCells.length===0) fetchJamming();
    else setShowJam(v=>!v);
  };

  const filtered=useMemo(()=>{
    if(activeLayer==='all')return points;
    const c=LAYER_CATS[activeLayer];
    return points.filter(p=>c.some(x=>(p.category||'').toLowerCase().includes(x.toLowerCase())));
  },[points,activeLayer]);

  const globePoints=useMemo(()=>filtered.map(pt=>{
    const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
    const [r,g,b]=hexRgb(cfg.hex);
    return{
      ...pt, lat:pt.coordinates[1], lng:pt.coordinates[0],
      color:`rgba(${r},${g},${b},0.85)`,
      ringColor:`rgba(${r},${g},${b},0.3)`,
      size:pt.risk==='critical'?0.18:pt.risk==='high'?0.15:pt.risk==='cyber'||pt.risk==='nuclear'?0.15:0.1,
      altitude:pt.risk==='critical'||pt.risk==='nuclear'?0.015:0.008,
    };
  }),[filtered]);

  const arcs=useMemo(()=>{
    const hot=filtered.filter(p=>p.risk==='critical'||p.risk==='cyber'||p.risk==='high');
    const result:any[]=[];
    for(let i=0;i<Math.min(hot.length,14);i++){
      const a=hot[i], b=hot[(i+3)%hot.length];
      if(a===b)continue;
      const cfg=riskConfig[a.risk as RiskKey]??riskConfig.unknown;
      result.push({
        startLat:a.coordinates[1],startLng:a.coordinates[0],
        endLat:b.coordinates[1],  endLng:b.coordinates[0],
        color:[cfg.hex+'00', cfg.hex+'88'],
        stroke:a.risk==='critical'?0.25:0.15,
      });
    }
    return result;
  },[filtered]);

  const jamPolygons=useMemo(()=>{
    if(!showJam)return[];
    return jamCells
      .filter(c=>{
        if(!c.boundary||c.boundary.length<3) return false;
        const lngs=c.boundary.map(p=>p[0]);
        const lats=c.boundary.map(p=>p[1]);
        const lngSpan=Math.max(...lngs)-Math.min(...lngs);
        const latSpan=Math.max(...lats)-Math.min(...lats);
        if(lngSpan>5||latSpan>5) return false;
        if(lngs.some(v=>Math.abs(v)>180)||lats.some(v=>Math.abs(v)>90)) return false;
        return true;
      })
      .map(c=>{
        let ring=[...c.boundary];
        const first=ring[0], last=ring[ring.length-1];
        if(first[0]!==last[0]||first[1]!==last[1]) ring.push(first);
        return{
          ...c, coords:ring,
          fillColor:JAM_COLORS[c.level].fill,
          sideColor:'rgba(0,0,0,0)',
          strokeColor:JAM_COLORS[c.level].stroke,
        };
      });
  },[jamCells,showJam]);

  const labels = useMemo(()=>filtered.filter(p=>p.risk==='critical'||p.risk==='high'||p.risk==='cyber'||p.risk==='nuclear').map(pt=>{
    const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
    return{
      ...pt, lat:pt.coordinates[1], lng:pt.coordinates[0],
      text:pt.label, color:cfg.hex+'cc', size:0.2, dotRadius:0,
    };
  }),[filtered]);

  const handlePointClick=useCallback((pt:any)=>{
    setSelected(pt as MapPoint);
    onPointClick?.(pt as MapPoint);
    globeRef.current?.pointOfView({lat:pt.lat,lng:pt.lng,altitude:1.2},800);
  },[onPointClick]);

  const handleGlobeMouseDown=useCallback((e:React.MouseEvent)=>{
    setClickPos({x:e.clientX,y:e.clientY});
  },[]);

  // Counts for summary bar
  const conflictCount = countLayer(points,'conflict');
  const cyberCount = countLayer(points,'cyber');
  const nuclearCount = countLayer(points,'nuclear');
  const maritimeCount = countLayer(points,'maritime');

  const now = new Date();
  const timestamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')} ${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')} UTC`;

  return(
    <div style={{display:'flex',flexDirection:'column',width:'100%',maxWidth:'100%',minWidth:0,borderRadius:12,overflow:'hidden',
      background:'#0a0f1a',border:'1px solid rgba(148,163,184,0.12)',boxShadow:'0 4px 40px rgba(0,0,0,0.6)'}}>

      <style>{`
        @keyframes cia-pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes cia-beam{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
        @keyframes cia-card-in{from{opacity:0;transform:scale(0.97) translateY(3px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes cia-spin{to{transform:rotate(360deg)}}
        .cia-btn{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;cursor:pointer;
          font-size:10px;font-family:"JetBrains Mono",monospace;font-weight:700;letter-spacing:0.08em;
          transition:all 0.15s;border:1px solid transparent;background:transparent;text-transform:uppercase}
        .cia-btn:hover{background:rgba(148,163,184,0.08)}
        .cia-btn-active{background:rgba(148,163,184,0.1);border-color:rgba(148,163,184,0.2);color:#e2e8f0}
        .cia-divider{width:1px;height:20px;background:rgba(148,163,184,0.12);flex-shrink:0}
      `}</style>

      {/* ── CLASSIFICATION HEADER BAR ────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'8px 16px',borderBottom:'1px solid rgba(148,163,184,0.08)',
        background:'linear-gradient(180deg,rgba(15,23,42,0.95),rgba(10,15,26,0.98))'}}>

        {/* Left: Classification + Title */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:6,
            background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.2)',
            borderRadius:4,padding:'3px 8px'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#dc2626',
              animation:'cia-pulse 2s ease-in-out infinite'}}/>
            <span style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:900,
              color:'#fca5a5',letterSpacing:'0.15em'}}>TS//SCI</span>
          </div>
          <div style={{width:1,height:18,background:'rgba(148,163,184,0.1)'}}/>
          <div>
            <div style={{fontSize:11,fontFamily:'"JetBrains Mono",monospace',fontWeight:900,
              color:'#e2e8f0',letterSpacing:'0.12em'}}>
              GLOBAL THREAT ASSESSMENT
            </div>
            <div style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',
              color:'rgba(148,163,184,0.5)',letterSpacing:'0.06em',marginTop:1}}>
              AYN INTELLIGENCE DIRECTORATE — {timestamp}
            </div>
          </div>
        </div>

        {/* Right: Status indicators */}
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:9,fontFamily:'"JetBrains Mono",monospace',
            color:'rgba(148,163,184,0.35)',letterSpacing:'0.05em'}}>
            {filtered.length} SIGNALS ACTIVE
          </span>
          {isLive&&(
            <div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:4,
              border:'1px solid rgba(22,163,74,0.25)',background:'rgba(22,163,74,0.06)'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:'#22c55e',
                boxShadow:'0 0 6px #22c55e',animation:'cia-pulse 1.5s ease-in-out infinite'}}/>
              <span style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:800,
                color:'#4ade80',letterSpacing:'0.12em'}}>LIVE FEED</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY METRICS BAR ──────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:0,
        borderBottom:'1px solid rgba(148,163,184,0.06)',
        background:'rgba(15,23,42,0.6)'}}>
        {[
          {label:'CONFLICT ZONES',value:conflictCount,color:'#dc2626'},
          {label:'CYBER THREATS',value:cyberCount,color:'#c026d3'},
          {label:'NUCLEAR',value:nuclearCount,color:'#65a30d'},
          {label:'MARITIME',value:maritimeCount,color:'#0d9488'},
          ...(showJam&&jamCount>0?[{label:'GPS JAMMING',value:jamCount,color:'#ca8a04'}]:[]),
        ].map((m,i)=>(
          <div key={m.label} style={{
            flex:1,display:'flex',alignItems:'center',gap:8,padding:'8px 14px',
            borderRight:i<3?'1px solid rgba(148,163,184,0.06)':'none',
            minWidth:0}}>
            <div style={{width:3,height:22,borderRadius:2,background:m.color,opacity:0.7,flexShrink:0}}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:7,fontFamily:'"JetBrains Mono",monospace',fontWeight:600,
                color:'rgba(148,163,184,0.4)',letterSpacing:'0.15em',whiteSpace:'nowrap',
                overflow:'hidden',textOverflow:'ellipsis'}}>{m.label}</div>
              <div style={{fontSize:16,fontFamily:'"JetBrains Mono",monospace',fontWeight:900,
                color:m.color,lineHeight:1.1}}>{m.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CONTROLS BAR ─────────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',
        padding:'6px 12px',borderBottom:'1px solid rgba(148,163,184,0.06)',
        background:'rgba(10,15,26,0.8)'}}>

        {/* View modes */}
        <div style={{display:'flex',alignItems:'center',gap:2,padding:2,
          background:'rgba(148,163,184,0.04)',borderRadius:6,border:'1px solid rgba(148,163,184,0.08)'}}>
          {([
            {id:'standard' as ViewMode, label:'STD',icon:'◉'},
            {id:'nightvision' as ViewMode, label:'NV',icon:'◈'},
            {id:'flir' as ViewMode, label:'IR',icon:'◆'},
          ]).map(v=>(
            <button key={v.id} onClick={()=>setViewMode(v.id)}
              className="cia-btn" style={{
                padding:'4px 10px',fontSize:9,borderRadius:4,
                ...(viewMode===v.id?{background:'rgba(148,163,184,0.12)',color:'#e2e8f0',
                  borderColor:'rgba(148,163,184,0.2)'}:{color:'rgba(148,163,184,0.35)'})}}>
              <span style={{fontSize:11}}>{v.icon}</span>{v.label}
            </button>
          ))}
        </div>

        <div className="cia-divider"/>

        {/* GPS Jamming */}
        <button onClick={toggleJam} className="cia-btn" style={{
          ...(showJam?{background:'rgba(202,138,4,0.1)',borderColor:'rgba(202,138,4,0.25)',
            color:'#fbbf24'}:{color:'rgba(148,163,184,0.4)'})}}>
          <span style={{fontSize:12}}>📡</span>GPS JAM
          {jamLoading&&<span style={{opacity:0.5}}>…</span>}
          {!jamLoading&&jamCount>0&&(
            <span style={{background:showJam?'rgba(202,138,4,0.15)':'rgba(148,163,184,0.08)',
              padding:'1px 6px',borderRadius:3,fontSize:9,fontWeight:800,
              color:showJam?'#fbbf24':'rgba(148,163,184,0.5)'}}>
              {jamCount}
            </span>
          )}
        </button>

        {showLayerToggle&&(
          <>
            <div className="cia-divider"/>
            <div style={{display:'flex',alignItems:'center',gap:2,flexWrap:'wrap'}}>
              {layers.map(l=>{
                const{icon,label,color}=LAYER_META[l];
                const cnt=countLayer(points,l);
                const act=activeLayer===l;
                return(
                  <button key={l} onClick={()=>setActiveLayer(l)} className="cia-btn" style={{
                    fontSize:9,padding:'4px 10px',borderRadius:4,
                    ...(act?{background:`${color}14`,borderColor:`${color}30`,color}:
                      {color:'rgba(148,163,184,0.35)'})}}>
                    <span style={{fontSize:11}}>{icon}</span>
                    <span>{label}</span>
                    <span style={{background:act?`${color}18`:'rgba(148,163,184,0.06)',
                      color:act?color:'rgba(148,163,184,0.4)',
                      padding:'1px 5px',borderRadius:3,fontSize:9,fontWeight:800}}>{cnt}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Globe + overlays ────────────────────────────────────────────── */}
      <div style={{position:'relative',width:'100%',height,background:'#080d18',overflow:'hidden'}} ref={containerRef} onMouseDown={handleGlobeMouseDown}>

        {/* Subtle grid overlay for CIA feel */}
        <div style={{position:'absolute',inset:0,zIndex:1,pointerEvents:'none',opacity:0.03,
          backgroundImage:'linear-gradient(rgba(148,163,184,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,0.5) 1px,transparent 1px)',
          backgroundSize:'60px 60px'}}/>

        {/* View mode wrapper */}
        <div style={{width:'100%',height:'100%',filter:VIEW_FILTERS[viewMode],transition:'filter 0.4s ease'}}>
          {viewMode==='nightvision'&&(
            <div style={{position:'absolute',inset:0,zIndex:5,pointerEvents:'none',
              backgroundImage:'repeating-linear-gradient(0deg,rgba(0,0,0,0.08) 0px,rgba(0,0,0,0.08) 1px,transparent 1px,transparent 3px)'}}/>
          )}
          {viewMode==='flir'&&(
            <div style={{position:'absolute',inset:0,zIndex:5,pointerEvents:'none',
              background:'radial-gradient(ellipse at center,rgba(255,80,0,0.04) 0%,rgba(0,0,0,0.15) 100%)'}}/>
          )}

          {Globe&&(
            <Globe
              ref={globeRef}
              width={Math.max(globeWidth || containerRef.current?.clientWidth || 0, 320)}
              height={height}
              backgroundColor="rgba(0,0,0,0)"
              atmosphereColor={viewMode==='nightvision'?'#00ff44':viewMode==='flir'?'#ff4400':'#1e3a5f'}
              atmosphereAltitude={0.1}
              globeImageUrl={viewMode==='standard'?"/textures/earth-blue-marble-8k.jpg":"/textures/earth-night-lights.jpg"}
              bumpImageUrl="/textures/earth-bump.jpg"

              pointsData={globePoints}
              pointLat="lat" pointLng="lng"
              pointColor="color" pointRadius="size" pointAltitude="altitude"
              pointResolution={12}
              onPointClick={handlePointClick}
              pointLabel={(d:any)=>`
                <div style="background:rgba(10,15,26,0.97);border:1px solid ${riskConfig[d.risk as RiskKey]?.hex??'#0891b2'}40;border-radius:6px;padding:10px 14px;font-family:'JetBrains Mono',monospace;max-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.6)">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                    <div style="width:6px;height:6px;border-radius:50%;background:${riskConfig[d.risk as RiskKey]?.hex??'#0891b2'}"></div>
                    <span style="font-size:10px;font-weight:800;color:${riskConfig[d.risk as RiskKey]?.hex??'#0891b2'};letter-spacing:0.08em">${d.label}</span>
                  </div>
                  ${d.detail?`<div style="font-size:9px;color:rgba(148,163,184,0.7);line-height:1.7;border-left:2px solid ${riskConfig[d.risk as RiskKey]?.hex??'#0891b2'}30;padding-left:8px">${d.detail.slice(0,160)}</div>`:''}
                </div>`}

              ringsData={globePoints.filter((p:any)=>riskConfig[p.risk as RiskKey]?.pulse)}
              ringLat="lat" ringLng="lng" ringColor="ringColor"
              ringMaxRadius={1.5} ringPropagationSpeed={1.5}
              ringRepeatPeriod={800} ringAltitude={0.005}

              arcsData={arcs}
              arcStartLat="startLat" arcStartLng="startLng"
              arcEndLat="endLat" arcEndLng="endLng"
              arcColor="color" arcStroke="stroke"
              arcDashLength={0.4} arcDashGap={0.2}
              arcDashAnimateTime={2000} arcAltitudeAutoScale={0.25}

              labelsData={labels}
              labelLat="lat" labelLng="lng" labelText="text"
              labelColor="color" labelSize="size" labelDotRadius="dotRadius"
              labelAltitude={0.015} labelResolution={2}

              pathsData={jamPolygons}
              pathPoints="coords"
              pathPointLat={(p:any)=>p[1]}
              pathPointLng={(p:any)=>p[0]}
              pathColor="strokeColor"
              pathDashLength={0.01}
              pathDashGap={0}
              pathStroke={2}
              pathLabel={(d:any)=>`
                <div style="background:rgba(10,15,26,0.97);border:1px solid rgba(202,138,4,0.35);border-radius:6px;padding:8px 12px;font-family:'JetBrains Mono',monospace;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
                  <div style="font-size:10px;font-weight:800;color:#fbbf24;letter-spacing:0.08em">📡 GPS INTERFERENCE</div>
                  <div style="font-size:8px;color:rgba(148,163,184,0.6);margin-top:4px">Level ${d.level === 3 ? '■ HIGH' : d.level === 2 ? '■ MEDIUM' : '■ LOW'}</div>
                  <div style="font-size:7px;color:rgba(148,163,184,0.3);margin-top:3px">Source: ADS-B telemetry via GPSJam.org</div>
                </div>`}
            />
          )}
        </div>

        {/* View mode indicator — top left */}
        {viewMode!=='standard'&&(
          <div style={{position:'absolute',top:12,left:12,zIndex:10,pointerEvents:'none',
            background:'rgba(10,15,26,0.95)',border:'1px solid rgba(148,163,184,0.15)',
            borderRadius:6,padding:'5px 12px',display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:5,height:5,borderRadius:'50%',
              background:viewMode==='nightvision'?'#22c55e':'#ea580c',
              boxShadow:`0 0 6px ${viewMode==='nightvision'?'#22c55e':'#ea580c'}`,
              animation:'cia-pulse 1.5s ease-in-out infinite'}}/>
            <span style={{fontSize:9,fontFamily:'"JetBrains Mono",monospace',fontWeight:800,
              letterSpacing:'0.1em',color:viewMode==='nightvision'?'#4ade80':'#fb923c'}}>
              {viewMode==='nightvision'?'NIGHT VISION ACTIVE':'THERMAL IMAGING'}
            </span>
          </div>
        )}

        {/* LEGEND — bottom left, clean readable layout */}
        <div style={{position:'absolute',bottom:12,left:12,zIndex:10,pointerEvents:'none',
          background:'rgba(10,15,26,0.95)',border:'1px solid rgba(148,163,184,0.1)',
          borderRadius:8,padding:'10px 14px',backdropFilter:'blur(12px)',minWidth:130}}>
          <div style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:800,
            color:'rgba(148,163,184,0.4)',letterSpacing:'0.15em',marginBottom:8,
            paddingBottom:6,borderBottom:'1px solid rgba(148,163,184,0.08)'}}>THREAT LEVELS</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {(['critical','high','alert','maritime','aviation','cyber','nuclear','disaster'] as RiskKey[]).map(r=>(
              <div key={r} style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:2,flexShrink:0,
                  background:riskConfig[r].hex,opacity:0.9}}/>
                <span style={{fontSize:9,fontFamily:'"JetBrains Mono",monospace',fontWeight:600,
                  color:'rgba(226,232,240,0.55)',letterSpacing:'0.05em'}}>
                  {riskConfig[r].label}
                </span>
              </div>
            ))}
          </div>
          {showJam&&(
            <div style={{borderTop:'1px solid rgba(148,163,184,0.08)',marginTop:8,paddingTop:8}}>
              <div style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:800,
                color:'rgba(148,163,184,0.4)',letterSpacing:'0.15em',marginBottom:6}}>GPS INTERFERENCE</div>
              {([3,2,1] as const).map(l=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <div style={{width:10,height:8,borderRadius:2,flexShrink:0,
                    border:`1.5px solid ${JAM_COLORS[l].stroke}`,background:'transparent'}}/>
                  <span style={{fontSize:9,fontFamily:'"JetBrains Mono",monospace',fontWeight:600,
                    color:'rgba(226,232,240,0.5)'}}>
                    {l===3?'HIGH':l===2?'MEDIUM':'LOW'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coordinates + classification — bottom right */}
        <div style={{position:'absolute',bottom:12,right:12,zIndex:10,pointerEvents:'none',
          display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          <div style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',
            color:'rgba(148,163,184,0.2)',letterSpacing:'0.06em'}}>
            DRAG · SCROLL · CLICK SIGNAL
          </div>
          <div style={{fontSize:7,fontFamily:'"JetBrains Mono",monospace',
            color:'rgba(148,163,184,0.15)',letterSpacing:'0.08em'}}>
            AYN INTELLIGENCE DIRECTORATE
          </div>
        </div>

        {/* ── Selected point popup — CIA dossier style ────────────────── */}
        {selected&&(()=>{
          const COL = riskConfig[selected.risk as RiskKey]?.hex??'#0891b2';
          const CARD_W = 360;
          const CARD_H = 160;
          const vpW = window.innerWidth;
          const vpH = window.innerHeight;
          let left = clickPos.x + 16;
          let top  = clickPos.y + 16;
          if (left + CARD_W > vpW - 12) left = clickPos.x - CARD_W - 16;
          if (top  + CARD_H > vpH - 12) top  = clickPos.y - CARD_H - 16;
          left = Math.max(12, Math.min(left, vpW - CARD_W - 12));
          top  = Math.max(12, Math.min(top,  vpH - CARD_H - 12));
          return (
          <div style={{
            position:'fixed', left, top, zIndex:9999, width:CARD_W,
            background:'rgba(10,15,26,0.97)',
            backdropFilter:'saturate(180%) blur(24px)',
            border:`1px solid rgba(148,163,184,0.12)`,
            borderTop:`2px solid ${COL}`,
            borderRadius:8, overflow:'hidden',
            boxShadow:'0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
            animation:'cia-card-in 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Status strip */}
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',
              borderBottom:'1px solid rgba(148,163,184,0.06)',
              background:`linear-gradient(90deg,${COL}08,transparent)`}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:COL,flexShrink:0,
                boxShadow:`0 0 8px ${COL}80`}}/>
              <span style={{fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:900,
                color:COL,letterSpacing:'0.12em',textTransform:'uppercase',flex:1}}>
                {riskConfig[selected.risk as RiskKey]?.label??'INTELLIGENCE'} — {selected.category?.toUpperCase()||'SIGNAL'}
              </span>
              <button onClick={()=>setSelected(null)}
                style={{width:22,height:22,borderRadius:4,border:'1px solid rgba(148,163,184,0.12)',
                  background:'rgba(148,163,184,0.05)',color:'rgba(148,163,184,0.5)',
                  fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',
                  justifyContent:'center',flexShrink:0,fontFamily:'"JetBrains Mono",monospace',
                  transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(148,163,184,0.15)';e.currentTarget.style.color='#e2e8f0';}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(148,163,184,0.05)';e.currentTarget.style.color='rgba(148,163,184,0.5)';}}
              >✕</button>
            </div>

            {/* Content */}
            <div style={{padding:'12px 14px 14px'}}>
              <div style={{fontSize:17,fontWeight:900,color:'#e2e8f0',
                fontFamily:'"JetBrains Mono",monospace',letterSpacing:'0.02em',lineHeight:1.15,
                marginBottom:8}}>{selected.label}</div>

              {selected.detail&&(
                <div style={{fontSize:10,color:'rgba(148,163,184,0.65)',lineHeight:1.75,
                  fontFamily:'"JetBrains Mono",monospace',marginBottom:10,
                  borderLeft:`2px solid ${COL}35`,paddingLeft:10}}>
                  {selected.detail}
                </div>
              )}

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                paddingTop:8,borderTop:'1px solid rgba(148,163,184,0.06)'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="2.5" stroke="rgba(148,163,184,0.3)" strokeWidth="0.8"/>
                    <line x1="5" y1="0" x2="5" y2="2" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8"/>
                    <line x1="5" y1="8" x2="5" y2="10" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8"/>
                    <line x1="0" y1="5" x2="2" y2="5" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8"/>
                    <line x1="8" y1="5" x2="10" y2="5" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8"/>
                  </svg>
                  <span style={{fontSize:9,color:'rgba(148,163,184,0.35)',fontFamily:'"JetBrains Mono",monospace'}}>
                    {Math.abs(selected.coordinates[1]).toFixed(2)}°{selected.coordinates[1]>=0?'N':'S'}{' '}
                    {Math.abs(selected.coordinates[0]).toFixed(2)}°{selected.coordinates[0]>=0?'E':'W'}
                  </span>
                </div>
                <span style={{fontSize:7,fontFamily:'"JetBrains Mono",monospace',fontWeight:800,
                  letterSpacing:'0.15em',color:'rgba(148,163,184,0.2)'}}>AYN INTEL</span>
              </div>
            </div>
          </div>);})()}

        {!Globe&&(
          <div style={{position:'absolute',inset:0,zIndex:20,background:'#080d18',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14}}>
            <div style={{width:40,height:40,borderRadius:'50%',
              border:'2px solid rgba(148,163,184,0.1)',borderTop:'2px solid #94a3b8',
              animation:'cia-spin 0.8s linear infinite'}}/>
            <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:10,
              color:'rgba(148,163,184,0.5)',letterSpacing:'0.15em',fontWeight:700}}>
              INITIALIZING GLOBE
            </span>
          </div>
        )}
      </div>

      {/* ── Ticker ────────────────────────────────────────────────────────── */}
      {ticker.length>0&&(
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'6px 16px',
          borderTop:'1px solid rgba(148,163,184,0.06)',background:'rgba(10,15,26,0.9)',flexShrink:0}}>
          <span style={{flexShrink:0,fontSize:8,fontFamily:'"JetBrains Mono",monospace',fontWeight:900,
            color:'#dc2626',letterSpacing:'0.12em',border:'1px solid rgba(220,38,38,0.25)',
            background:'rgba(220,38,38,0.06)',padding:'2px 8px',borderRadius:3}}>FEED</span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
