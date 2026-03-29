import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MapPoint {
  id?: string;
  coordinates: [number, number]; // [lng, lat]
  label: string;
  detail?: string;
  category?: string;
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
  critical: { hex:'#ef4444', label:'CONFLICT',  pulse:true  },
  high:     { hex:'#f97316', label:'HIGH RISK', pulse:true  },
  alert:    { hex:'#eab308', label:'ALERT',     pulse:false },
  stable:   { hex:'#22c55e', label:'STABLE',    pulse:false },
  satellite:{ hex:'#a855f7', label:'SATELLITE', pulse:false },
  unknown:  { hex:'#06b6d4', label:'INTEL',     pulse:false },
  aviation: { hex:'#3b82f6', label:'AVIATION',  pulse:false },
  maritime: { hex:'#14b8a6', label:'MARITIME',  pulse:false },
  cyber:    { hex:'#ec4899', label:'CYBER',     pulse:true  },
  disaster: { hex:'#f97316', label:'DISASTER',  pulse:true  },
  nuclear:  { hex:'#84cc16', label:'NUCLEAR',   pulse:true  },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_CATS: Record<MapLayer,string[]> = {
  all:[], conflict:['Conflict','Military'], maritime:['Maritime','Supply Chain'],
  aviation:['Aviation'], cyber:['Cyber'], disasters:['Disaster','Seismology','Wildfire'],
  nuclear:['Nuclear'],
};
const LAYER_META: Record<MapLayer,{icon:string;label:string;color:string}> = {
  all:      {icon:'◈',label:'ALL',      color:'#00ffcc'},
  conflict: {icon:'⚔',label:'CONFLICT', color:'#ef4444'},
  maritime: {icon:'⚓',label:'MARITIME', color:'#14b8a6'},
  aviation: {icon:'✈',label:'AVIATION', color:'#3b82f6'},
  cyber:    {icon:'⬡',label:'CYBER',    color:'#ec4899'},
  disasters:{icon:'△',label:'DISASTERS',color:'#f97316'},
  nuclear:  {icon:'☢',label:'NUCLEAR',  color:'#84cc16'},
};

// View mode CSS filters — pure CSS, zero WebGL cost
const VIEW_FILTERS: Record<ViewMode,string> = {
  standard:    'none',
  nightvision: 'brightness(1.15) contrast(1.25) sepia(1) hue-rotate(62deg) saturate(9) drop-shadow(0 0 2px #00ff44)',
  flir:        'sepia(1) hue-rotate(295deg) saturate(6) brightness(0.85) contrast(1.4)',
};

// GPS jamming colours by level
const JAM_COLORS: Record<1|2|3, {fill:string; stroke:string}> = {
  1: { fill:'rgba(234,179,8,0.12)',  stroke:'rgba(234,179,8,0.5)'  },
  2: { fill:'rgba(249,115,22,0.18)', stroke:'rgba(249,115,22,0.6)' },
  3: { fill:'rgba(239,68,68,0.25)',  stroke:'rgba(239,68,68,0.75)' },
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
  const txt=items.join('   ·   ');
  return(
    <div style={{overflow:'hidden',whiteSpace:'nowrap',flex:1}}>
      <span style={{display:'inline-block',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.35)',
        letterSpacing:'0.06em',transform:`translateX(-${off%(txt.length*5.6)}px)`,transition:'none'}}>
        {txt+'   ·   '+txt}
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
  const [Globe, setGlobe]             = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [viewMode, setViewMode]       = useState<ViewMode>('standard');
  const [selected, setSelected]       = useState<MapPoint|null>(null);
  const [showJam, setShowJam]         = useState(false);
  const [jamCells, setJamCells]       = useState<GpsHexCell[]>([]);
  const [jamLoading, setJamLoading]   = useState(false);
  const [jamCount, setJamCount]       = useState(0);
  const layers: MapLayer[] = ['all','conflict','maritime','aviation','cyber','disasters','nuclear'];

  // Load Globe dynamically
  useEffect(()=>{
    import('react-globe.gl').then(m=>setGlobe(()=>m.default));
  },[]);

  // Auto-rotate
  useEffect(()=>{
    if(!globeRef.current)return;
    const ctrl=globeRef.current.controls();
    ctrl.autoRotate=true; ctrl.autoRotateSpeed=0.25;
    ctrl.enableZoom=true; ctrl.minDistance=120; ctrl.maxDistance=600;
    globeRef.current.pointOfView({lat:25,lng:15,altitude:2.2});
  },[Globe]);

  // Fetch GPS jamming data (only when toggled on, cached 6h)
  const fetchJamming = useCallback(async()=>{
    if(jamCells.length>0){ setShowJam(true); return; } // already loaded
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

  // Globe point data
  const globePoints=useMemo(()=>filtered.map(pt=>{
    const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
    const [r,g,b]=hexRgb(cfg.hex);
    return{
      ...pt, lat:pt.coordinates[1], lng:pt.coordinates[0],
      color:`rgba(${r},${g},${b},0.8)`,
      ringColor:`rgba(${r},${g},${b},0.3)`,
      size:pt.risk==='critical'?0.18:pt.risk==='high'?0.15:pt.risk==='cyber'||pt.risk==='nuclear'?0.15:0.1,
      altitude:pt.risk==='critical'||pt.risk==='nuclear'?0.015:0.008,
    };
  }),[filtered]);

  // Threat arcs
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
        color:[cfg.hex+'00', cfg.hex+'cc'],
        stroke:a.risk==='critical'?0.25:0.15,
      });
    }
    return result;
  },[filtered]);

  // GPS jamming polygons for globe
  const jamPolygons=useMemo(()=>{
    if(!showJam)return[];
    return jamCells.map(c=>({
      ...c,
      coords:c.boundary,
      fillColor:JAM_COLORS[c.level].fill,
      sideColor:'rgba(0,0,0,0)',
      strokeColor:JAM_COLORS[c.level].stroke,
    }));
  },[jamCells,showJam]);

  // Labels for zoom-in detail
  const labels = useMemo(()=>filtered.filter(p=>p.risk==='critical'||p.risk==='high'||p.risk==='cyber'||p.risk==='nuclear').map(pt=>{
    const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
    return{
      ...pt,
      lat:pt.coordinates[1],
      lng:pt.coordinates[0],
      text:pt.label,
      color:cfg.hex+'cc',
      size:0.2,
      dotRadius:0,
    };
  }),[filtered]);

  const handlePointClick=useCallback((pt:any)=>{
    setSelected(pt as MapPoint);
    onPointClick?.(pt as MapPoint);
    globeRef.current?.pointOfView({lat:pt.lat,lng:pt.lng,altitude:1.2},800);
  },[onPointClick]);

  const viewBtnStyle=(mode:ViewMode)=>({
    display:'flex' as const, alignItems:'center' as const, gap:5,
    padding:'4px 10px', borderRadius:99, cursor:'pointer' as const,
    fontSize:7, fontFamily:'monospace', letterSpacing:'0.1em',
    transition:'all 0.12s',
    background: viewMode===mode ? 'rgba(0,255,200,0.12)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${viewMode===mode ? 'rgba(0,255,200,0.45)' : 'rgba(255,255,255,0.08)'}`,
    color: viewMode===mode ? '#00ffcc' : 'rgba(255,255,255,0.35)',
  });

  const pill=(lbl:string,val:string,color:string)=>(
    <div key={lbl} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(0,3,14,0.88)',
      border:`1px solid ${color}44`,borderRadius:7,padding:'4px 9px',backdropFilter:'blur(8px)'}}>
      <div style={{width:2,height:16,borderRadius:2,background:color,boxShadow:`0 0 6px ${color}`}}/>
      <div>
        <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',letterSpacing:'0.18em'}}>{lbl}</div>
        <div style={{fontSize:13,fontFamily:'monospace',fontWeight:900,color,lineHeight:1.1}}>{val}</div>
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',width:'100%',borderRadius:14,overflow:'hidden',
      background:'#020b18',border:'1px solid rgba(0,255,200,0.12)',boxShadow:'0 0 60px rgba(0,0,0,0.8)'}}>

      {/* ── Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'9px 16px',borderBottom:'1px solid rgba(255,255,255,0.05)',
        background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:5}}>
            {[['#ef4444',true],['#eab308',false],['#22c55e',false]].map(([c,p],i)=>(
              <div key={i} style={{width:8,height:8,borderRadius:'50%',background:c as string,
                boxShadow:p?`0 0 8px ${c}`:undefined}}/>
            ))}
          </div>
          <span style={{fontSize:10,fontFamily:'monospace',fontWeight:900,color:'#00ffcc',letterSpacing:'0.22em'}}>
            AYN // WORLD THREAT MATRIX
          </span>
          <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)',letterSpacing:'0.1em'}}>
            DRAG · ZOOM · CLICK SIGNAL
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>
            {filtered.length} SIGNALS
          </span>
          {isLive&&(
            <div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:99,
              border:'1px solid rgba(0,255,136,0.3)',background:'rgba(0,255,136,0.06)'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 6px #22c55e'}}/>
              <span style={{fontSize:7,fontFamily:'monospace',color:'#4ade80',letterSpacing:'0.15em'}}>LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls bar */}
      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',
        padding:'7px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',
        background:'rgba(0,0,0,0.45)',flexShrink:0}}>

        {/* View mode toggles */}
        <button style={viewBtnStyle('standard')} onClick={()=>setViewMode('standard')}>
          ◉ STANDARD
        </button>
        <button style={viewBtnStyle('nightvision')} onClick={()=>setViewMode('nightvision')}>
          <span style={{fontSize:10}}>🌿</span> NV
        </button>
        <button style={viewBtnStyle('flir')} onClick={()=>setViewMode('flir')}>
          <span style={{fontSize:10}}>🌡</span> FLIR
        </button>

        <div style={{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 3px',flexShrink:0}}/>

        {/* GPS Jamming toggle */}
        <button onClick={toggleJam} style={{
          display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,cursor:'pointer',
          background:showJam?'rgba(234,179,8,0.15)':'rgba(255,255,255,0.03)',
          border:`1px solid ${showJam?'rgba(234,179,8,0.5)':'rgba(255,255,255,0.08)'}`,
          color:showJam?'#fbbf24':'rgba(255,255,255,0.3)',
          fontSize:7,fontFamily:'monospace',letterSpacing:'0.1em',transition:'all 0.12s'}}>
          <span style={{fontSize:11}}>📡</span>
          GPS JAM
          {jamLoading&&<span style={{fontSize:7,opacity:0.6}}>…</span>}
          {!jamLoading&&jamCount>0&&(
            <span style={{background:showJam?'rgba(234,179,8,0.2)':'rgba(255,255,255,0.06)',
              color:showJam?'#fbbf24':'rgba(255,255,255,0.4)',
              padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>
              {jamCount}
            </span>
          )}
        </button>

        {showLayerToggle&&(
          <>
            <div style={{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 3px',flexShrink:0}}/>
            {layers.map(l=>{
              const{icon,label,color}=LAYER_META[l];
              const cnt=countLayer(points,l);
              const act=activeLayer===l;
              return(
                <button key={l} onClick={()=>setActiveLayer(l)} style={{
                  display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:99,cursor:'pointer',
                  background:act?`${color}18`:'rgba(255,255,255,0.02)',
                  border:`1px solid ${act?color+'55':'rgba(255,255,255,0.07)'}`,
                  color:act?color:'rgba(255,255,255,0.3)',fontSize:7,fontFamily:'monospace',
                  letterSpacing:'0.1em',whiteSpace:'nowrap',transition:'all 0.12s'}}>
                  <span style={{fontSize:10}}>{icon}</span>{label}
                  <span style={{background:act?`${color}22`:'rgba(255,255,255,0.06)',
                    color:act?color:'rgba(255,255,255,0.35)',padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* ── Globe + overlays */}
      <div style={{position:'relative',height,background:'#020b18',overflow:'hidden'}} ref={containerRef}>

        {/* View mode wrapper — CSS filter only, zero GL cost */}
        <div style={{
          width:'100%', height:'100%',
          filter: VIEW_FILTERS[viewMode],
          transition: 'filter 0.4s ease',
        }}>
          {/* Night vision scanline overlay */}
          {viewMode==='nightvision'&&(
            <div style={{
              position:'absolute',inset:0,zIndex:5,pointerEvents:'none',
              backgroundImage:'repeating-linear-gradient(0deg,rgba(0,0,0,0.08) 0px,rgba(0,0,0,0.08) 1px,transparent 1px,transparent 3px)',
            }}/>
          )}
          {/* FLIR noise overlay */}
          {viewMode==='flir'&&(
            <div style={{
              position:'absolute',inset:0,zIndex:5,pointerEvents:'none',
              background:'radial-gradient(ellipse at center,rgba(255,80,0,0.04) 0%,rgba(0,0,0,0.15) 100%)',
            }}/>
          )}

          {Globe&&(
            <Globe
              ref={globeRef}
              width={containerRef.current?.clientWidth||1200}
              height={height}
              backgroundColor="rgba(0,0,0,0)"
              atmosphereColor={viewMode==='nightvision'?'#00ff44':viewMode==='flir'?'#ff4400':'#1e3a8a'}
              atmosphereAltitude={0.15}
              globeImageUrl={viewMode==='standard'?"//unpkg.com/three-globe/example/img/earth-dark.jpg":"//unpkg.com/three-globe/example/img/earth-night.jpg"}
              bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"

              // Intel signal points
              pointsData={globePoints}
              pointLat="lat" pointLng="lng"
              pointColor="color" pointRadius="size" pointAltitude="altitude"
              pointResolution={12}
              onPointClick={handlePointClick}
              pointLabel={(d:any)=>`
                <div style="background:rgba(0,3,14,0.96);border:1px solid ${riskConfig[d.risk as RiskKey]?.hex??'#06b6d4'}55;border-radius:8px;padding:8px 12px;font-family:monospace;max-width:220px">
                  <div style="font-size:11px;font-weight:900;color:${riskConfig[d.risk as RiskKey]?.hex??'#06b6d4'};letter-spacing:0.1em;margin-bottom:4px">${d.label}</div>
                  ${d.detail?`<div style="font-size:8px;color:rgba(255,255,255,0.5);line-height:1.6">${d.detail.slice(0,140)}</div>`:''}
                </div>`}

              // Pulse rings
              ringsData={globePoints.filter((p:any)=>riskConfig[p.risk as RiskKey]?.pulse)}
              ringLat="lat" ringLng="lng" ringColor="ringColor"
              ringMaxRadius={1.5} ringPropagationSpeed={1.5}
              ringRepeatPeriod={800} ringAltitude={0.005}

              // Threat arcs
              arcsData={arcs}
              arcStartLat="startLat" arcStartLng="startLng"
              arcEndLat="endLat" arcEndLng="endLng"
              arcColor="color" arcStroke="stroke"
              arcDashLength={0.4} arcDashGap={0.2}
              arcDashAnimateTime={2000} arcAltitudeAutoScale={0.25}

              // Labels
              labelsData={labels}
              labelLat="lat" labelLng="lng" labelText="text"
              labelColor="color" labelSize="size" labelDotRadius="dotRadius"
              labelAltitude={0.015} labelResolution={2}

              // GPS Jamming hexagons — single polygon draw call
              polygonsData={jamPolygons}
              polygonGeoJsonGeometry={(d:any)=>({
                type:'Polygon',
                coordinates:[d.coords],
              })}
              polygonCapColor="fillColor"
              polygonSideColor="sideColor"
              polygonStrokeColor="strokeColor"
              polygonAltitude={0.002}
              polygonLabel={(d:any)=>`
                <div style="background:rgba(0,3,14,0.95);border:1px solid rgba(234,179,8,0.5);border-radius:6px;padding:6px 10px;font-family:monospace">
                  <div style="font-size:10px;font-weight:900;color:#fbbf24">📡 GPS JAMMING</div>
                  <div style="font-size:8px;color:rgba(255,255,255,0.5);margin-top:3px">Level ${d.level === 3 ? '🔴 HIGH' : d.level === 2 ? '🟠 MEDIUM' : '🟡 LOW'} interference</div>
                  <div style="font-size:7px;color:rgba(255,255,255,0.3);margin-top:2px">Source: GPSJam.org · ADS-B aircraft reports</div>
                </div>`}
            />
          )}
        </div>

        {/* Stats — top right */}
        <div style={{position:'absolute',top:12,right:12,zIndex:10,
          display:'flex',flexDirection:'column',gap:5,pointerEvents:'none'}}>
          {countLayer(points,'conflict')>0&&pill('CONFLICT',String(countLayer(points,'conflict')),'#ef4444')}
          {countLayer(points,'nuclear')>0&&pill('NUCLEAR',String(countLayer(points,'nuclear')),'#84cc16')}
          {countLayer(points,'cyber')>0&&pill('CYBER',String(countLayer(points,'cyber')),'#ec4899')}
          {showJam&&jamCount>0&&pill('JAM ZONES',String(jamCount),'#fbbf24')}
        </div>

        {/* View mode indicator */}
        {viewMode!=='standard'&&(
          <div style={{position:'absolute',top:12,left:12,zIndex:10,pointerEvents:'none',
            background:'rgba(0,3,14,0.9)',border:'1px solid rgba(0,255,200,0.3)',
            borderRadius:8,padding:'5px 10px',display:'flex',alignItems:'center',gap:6,
            backdropFilter:'blur(8px)'}}>
            <div style={{width:5,height:5,borderRadius:'50%',
              background:viewMode==='nightvision'?'#22ff44':'#ff4422',
              boxShadow:`0 0 6px ${viewMode==='nightvision'?'#22ff44':'#ff4422'}`,
              animation:'ayn-globe-pulse 1.5s ease-in-out infinite'}}/>
            <span style={{fontSize:8,fontFamily:'monospace',fontWeight:900,letterSpacing:'0.15em',
              color:viewMode==='nightvision'?'#4ade80':'#fb923c'}}>
              {viewMode==='nightvision'?'NIGHT VISION':'FLIR THERMAL'}
            </span>
            <style>{`@keyframes ayn-globe-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
          </div>
        )}

        {/* Legend — bottom left */}
        <div style={{position:'absolute',bottom:12,left:12,zIndex:10,pointerEvents:'none',
          background:'rgba(0,2,14,0.93)',border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:9,padding:'8px 12px',backdropFilter:'blur(10px)'}}>
          <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.18em',marginBottom:6}}>SIGNAL KEY</div>
          {(['critical','high','alert','maritime','aviation','cyber','nuclear','disaster'] as RiskKey[]).map(r=>(
            <div key={r} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
              <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                background:riskConfig[r].hex,boxShadow:`0 0 5px ${riskConfig[r].hex}`}}/>
              <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.08em'}}>
                {riskConfig[r].label}
              </span>
            </div>
          ))}
          {showJam&&(
            <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:5,paddingTop:5}}>
              <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.18em',marginBottom:5}}>GPS JAM</div>
              {([3,2,1] as const).map(l=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
                  <div style={{width:10,height:8,borderRadius:2,flexShrink:0,
                    background:JAM_COLORS[l].fill,border:`1px solid ${JAM_COLORS[l].stroke}`}}/>
                  <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)'}}>
                    {l===3?'HIGH':l===2?'MEDIUM':'LOW'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected point detail */}
        {selected&&(
          <div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',
            zIndex:20,background:'rgba(0,3,14,0.97)',
            border:`1px solid ${riskConfig[selected.risk as RiskKey]?.hex??'#06b6d4'}44`,
            borderRadius:12,padding:'12px 16px',maxWidth:340,backdropFilter:'blur(16px)',
            boxShadow:'0 8px 40px rgba(0,0,0,0.9)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div>
                <div style={{fontSize:12,fontWeight:900,color:riskConfig[selected.risk as RiskKey]?.hex??'#06b6d4',
                  fontFamily:'monospace',letterSpacing:'0.1em'}}>{selected.label}</div>
                <div style={{fontSize:7,color:'rgba(255,255,255,0.3)',fontFamily:'monospace',letterSpacing:'0.15em',marginTop:2}}>
                  {riskConfig[selected.risk as RiskKey]?.label??'INTEL'}
                  {selected.category?` · ${selected.category.toUpperCase()}`:''}
                </div>
              </div>
              <button onClick={()=>setSelected(null)} style={{
                background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:6,color:'rgba(255,255,255,0.4)',fontSize:14,padding:'2px 8px',
                cursor:'pointer',fontFamily:'monospace'}}>✕</button>
            </div>
            {selected.detail&&(
              <div style={{fontSize:9,color:'rgba(255,255,255,0.6)',lineHeight:1.7,fontFamily:'monospace',
                borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:8}}>
                {selected.detail}
              </div>
            )}
            <div style={{fontSize:7,color:'rgba(255,255,255,0.2)',fontFamily:'monospace',marginTop:6}}>
              {selected.coordinates[1].toFixed(2)}°N · {selected.coordinates[0].toFixed(2)}°E
            </div>
          </div>
        )}

        {/* Loading */}
        {!Globe&&(
          <div style={{position:'absolute',inset:0,zIndex:20,background:'#020b18',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14}}>
            <div style={{width:40,height:40,borderRadius:'50%',
              border:'2px solid rgba(0,255,200,0.12)',borderTop:'2px solid #00ffcc',
              animation:'ayn-spin 0.8s linear infinite'}}/>
            <span style={{fontFamily:'monospace',fontSize:9,color:'rgba(0,255,200,0.5)',letterSpacing:'0.2em'}}>
              INITIALIZING GLOBE...
            </span>
            <style>{`@keyframes ayn-spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </div>

      {/* ── Ticker */}
      {ticker.length>0&&(
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'5px 16px',
          borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.6)',flexShrink:0}}>
          <span style={{flexShrink:0,fontSize:6.5,fontFamily:'monospace',fontWeight:900,color:'#f87171',
            letterSpacing:'0.15em',border:'1px solid rgba(248,113,113,0.3)',
            background:'rgba(248,113,113,0.1)',padding:'2px 6px',borderRadius:4}}>▶ FEED</span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
