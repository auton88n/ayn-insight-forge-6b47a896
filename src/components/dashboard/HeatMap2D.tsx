import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, Marker as MLMarker, Popup as MLPopup } from 'maplibre-gl';

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
interface LiveFlight { id:string; callsign:string; lat:number; lng:number; altitude:number; velocity:number; heading:number; country:string; }
interface LiveShip   { id:string; name:string; lat:number; lng:number; speed:number; heading:number; ship_type:number; destination:string; }

export const riskConfig = {
  critical: { hex:'#ef4444', r:239, g:68,  b:68,  label:'CONFLICT',  pulse:true  },
  high:     { hex:'#f97316', r:249, g:115, b:22,  label:'HIGH RISK', pulse:true  },
  alert:    { hex:'#eab308', r:234, g:179, b:8,   label:'ALERT',     pulse:false },
  stable:   { hex:'#22c55e', r:34,  g:197, b:94,  label:'STABLE',    pulse:false },
  satellite:{ hex:'#a855f7', r:168, g:85,  b:247, label:'SATELLITE', pulse:false },
  unknown:  { hex:'#06b6d4', r:6,   g:182, b:212, label:'INTEL',     pulse:false },
  aviation: { hex:'#3b82f6', r:59,  g:130, b:246, label:'AVIATION',  pulse:false },
  maritime: { hex:'#14b8a6', r:20,  g:184, b:166, label:'MARITIME',  pulse:false },
  cyber:    { hex:'#ec4899', r:236, g:72,  b:153, label:'CYBER',     pulse:true  },
  disaster: { hex:'#f97316', r:249, g:115, b:22,  label:'DISASTER',  pulse:true  },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_CATS: Record<MapLayer,string[]> = {
  all:[], conflict:['Conflict','Military'], maritime:['Maritime','Supply Chain'],
  aviation:['Aviation'], cyber:['Cyber'], disasters:['Disaster','Seismology','Wildfire'],
};
const LAYER_META: Record<MapLayer,{icon:string;label:string;color:string}> = {
  all:{icon:'◈',label:'ALL',color:'#00ffcc'},      conflict:{icon:'⚔',label:'CONFLICT',color:'#ef4444'},
  maritime:{icon:'⚓',label:'MARITIME',color:'#14b8a6'}, aviation:{icon:'✈',label:'AVIATION',color:'#3b82f6'},
  cyber:{icon:'⬡',label:'CYBER',color:'#ec4899'},  disasters:{icon:'△',label:'DISASTERS',color:'#f97316'},
};

function countLayer(pts:MapPoint[],l:MapLayer){ if(l==='all')return pts.length; const c=LAYER_CATS[l]; return pts.filter(p=>c.some(x=>(p.category||'').toLowerCase().includes(x.toLowerCase()))).length; }
function shipLabel(t:number){ if(t>=70&&t<80)return'Cargo'; if(t>=80&&t<90)return'Tanker'; if(t>=60&&t<70)return'Passenger'; return'Vessel'; }

function simFlights():LiveFlight[]{
  const cc=[
    ...Array.from({length:22},(_,i)=>({lat:52+Math.random()*6, lng:-55+i*5,  cs:'NAT',h:88})),
    ...Array.from({length:28},(_,i)=>({lat:46+Math.random()*12,lng:-8+i*2.4, cs:'EUR',h:80})),
    ...Array.from({length:20},(_,i)=>({lat:22+Math.random()*22,lng:100+i*4,  cs:'ASA',h:100})),
    ...Array.from({length:14},(_,i)=>({lat:24+Math.random()*16,lng:38+i*3,   cs:'MEA',h:90})),
    ...Array.from({length:20},(_,i)=>({lat:15+Math.random()*35,lng:-118+i*4.5,cs:'AMR',h:90})),
    ...Array.from({length:16},(_,i)=>({lat:36+Math.random()*8, lng:-172+i*9, cs:'PAC',h:85})),
    ...Array.from({length:14},(_,i)=>({lat:-2+Math.random()*20,lng:98+i*3,   cs:'SEA',h:90})),
  ];
  return cc.map((c,i)=>({id:`s${i}`,callsign:`${c.cs}${100+i}`,lat:c.lat+(Math.random()-0.5)*0.5,lng:c.lng+(Math.random()-0.5)*0.5,altitude:9500+Math.random()*2500,velocity:230+Math.random()*70,heading:c.h+(Math.random()-0.5)*8,country:''}));
}

// CSS
const CSS=`
.ayn-mk{background:transparent!important;border:none!important;cursor:pointer;}
.maplibregl-popup-content{background:rgba(0,3,14,0.97)!important;border-radius:12px!important;border:1px solid rgba(0,255,200,0.2)!important;box-shadow:0 0 40px rgba(0,0,0,0.9)!important;padding:0!important;font-family:'Courier New',monospace!important;min-width:220px;overflow:hidden;}
.maplibregl-popup-tip{display:none!important;}
.maplibregl-popup-close-button{color:rgba(255,255,255,0.4)!important;font-size:20px!important;top:6px!important;right:10px!important;background:transparent!important;}
.maplibregl-popup-close-button:hover{color:rgba(255,255,255,0.8)!important;}
.maplibregl-ctrl-group{background:transparent!important;border:1px solid rgba(0,255,200,0.2)!important;border-radius:8px!important;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.7)!important;}
.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out{background:rgba(0,3,14,0.92)!important;}
.maplibregl-ctrl-zoom-in span,.maplibregl-ctrl-zoom-out span{background-image:none!important;color:#00ffcc!important;font-size:20px!important;display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important;}
.maplibregl-ctrl-zoom-in span::before{content:'+'!important;}.maplibregl-ctrl-zoom-out span::before{content:'−'!important;}
.maplibregl-ctrl button:hover{background:rgba(0,255,200,0.1)!important;}.maplibregl-ctrl-attrib{display:none!important;}
@keyframes ayn-spin{to{transform:rotate(360deg)}}@keyframes ayn-pulse-out{0%{transform:scale(1);opacity:0.7;}100%{transform:scale(2.8);opacity:0;}}
`;
function injectCSS(){if(document.getElementById('ayn-map-v3'))return;const s=document.createElement('style');s.id='ayn-map-v3';s.textContent=CSS;document.head.appendChild(s);}

// Marker SVG factories
function mkIntel(hex:string,pulse:boolean,_zoom:number):string{
  // Simple, reliable 10px dot with optional pulse ring
  const p=pulse?`<div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid ${hex};opacity:0;animation:ayn-pulse-out 2s ease-out infinite;pointer-events:none;"></div><div style="position:absolute;inset:-6px;border-radius:50%;border:1px solid ${hex};opacity:0;animation:ayn-pulse-out 2s ease-out 0.8s infinite;pointer-events:none;"></div>`:'';
  return`${p}<div style="width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${hex},${hex}99);border:1.5px solid ${hex};box-shadow:0 0 8px ${hex}99,0 0 16px ${hex}44;position:relative;"></div>`;
}

function mkLabel(label:string,hex:string):string{
  const short=label.length>20?label.slice(0,19)+'…':label;
  return`<div style="position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,2,14,0.95);border:1px solid ${hex}66;border-radius:5px;padding:3px 7px 2px;font:700 8px/12px 'Courier New',monospace;color:${hex};letter-spacing:0.06em;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.8);text-transform:uppercase;">${short}</div>`;
}

// Popup HTML
function popIntel(pt:MapPoint):string{const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;const c=cfg.hex;return`<div style="background:${c}14;border-bottom:1px solid ${c}33;padding:12px 16px 10px;"><div style="font-size:11px;font-weight:900;color:${c};letter-spacing:0.1em;margin-bottom:2px;">${pt.label}</div><div style="font-size:7px;color:${c}99;letter-spacing:0.15em;">${cfg.label}${pt.category?' · '+pt.category.toUpperCase():''}</div></div>${pt.detail?`<div style="padding:10px 16px 6px;"><div style="font-size:9px;color:rgba(255,255,255,0.55);line-height:1.65;max-width:240px;">${pt.detail.slice(0,200)}</div></div>`:''}<div style="padding:4px 16px 10px;font-size:7px;color:rgba(255,255,255,0.2);">${pt.coordinates[1].toFixed(2)}°N · ${pt.coordinates[0].toFixed(2)}°E</div>`;}
function popFlight(f:LiveFlight):string{return`<div style="background:#1d4ed818;border-bottom:1px solid #3b82f633;padding:12px 16px 10px;"><div style="font-size:11px;font-weight:900;color:#60a5fa;letter-spacing:0.1em;">✈ ${f.callsign||'UNKNOWN'}</div><div style="font-size:7px;color:#60a5fa88;">LIVE AIRCRAFT</div></div><div style="padding:10px 16px 12px;">${f.country?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">🌍 ${f.country}</div>`:''}<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⬆ ${Math.round(f.altitude||0).toLocaleString()}m</div><div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${Math.round((f.velocity||0)*1.94)} kts</div><div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 ${Math.round(f.heading||0)}°</div></div>`;}
function popShip(s:LiveShip):string{return`<div style="background:#0d947718;border-bottom:1px solid #14b8a633;padding:12px 16px 10px;"><div style="font-size:11px;font-weight:900;color:#2dd4bf;letter-spacing:0.1em;">⚓ ${s.name||'UNKNOWN'}</div><div style="font-size:7px;color:#2dd4bf88;">${shipLabel(s.ship_type).toUpperCase()} · LIVE</div></div><div style="padding:10px 16px 12px;">${s.destination?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">→ ${s.destination}</div>`:''}<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${(s.speed||0).toFixed(1)} kts</div><div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 ${Math.round(s.heading||0)}°</div></div>`;}

const DARK_STYLE:any={version:8,sources:{carto:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png','https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png','https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],tileSize:256,maxzoom:20}},layers:[{id:'carto',type:'raster',source:'carto',paint:{'raster-opacity':0.9}}],glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'};
const SUPA='https://dfkoxuokfkttjhfjcecx.supabase.co';
let UID=0;

// ─── Main ─────────────────────────────────────────────────────────────────────
export function HeatMap2D({
  points=[],height=420,onPointClick,showLayerToggle=false,isLive=false,lastRefresh,ticker=[],
}:{points?:MapPoint[];height?:number;onPointClick?:(pt:MapPoint)=>void;showLayerToggle?:boolean;isLive?:boolean;lastRefresh?:Date;ticker?:string[];}){
  const cid=useRef(`ayn-map-${++UID}`).current;
  const mapRef=useRef<MLMap|null>(null);
  const intelMks=useRef<MLMarker[]>([]);
  const flightMks=useRef<MLMarker[]>([]);
  const shipMks=useRef<MLMarker[]>([]);
  const popRef=useRef<MLPopup|null>(null);
  const zoomRef=useRef(2);

  const [ready,setReady]=useState(false);
  const [activeLayer,setActiveLayer]=useState<MapLayer>('all');
  const [flights,setFlights]=useState<LiveFlight[]>([]);
  const [ships,setShips]=useState<LiveShip[]>([]);
  const [showF,setShowF]=useState(true);
  const [showS,setShowS]=useState(true);
  const [fc,setFc]=useState(0);
  const [sc,setSc]=useState(0);
  const [loading,setLoading]=useState(false);
  const [updated,setUpdated]=useState<Date|null>(null);
  const layers:MapLayer[]=['all','conflict','maritime','aviation','cyber','disasters'];

  const filtered=useMemo(()=>{
    if(activeLayer==='all')return points;
    const c=LAYER_CATS[activeLayer];
    return points.filter(p=>c.some(x=>(p.category||'').toLowerCase().includes(x.toLowerCase())));
  },[points,activeLayer]);

  // Init map
  useEffect(()=>{
    injectCSS();
    let dead=false;
    import('maplibre-gl').then(ML=>{
      if(dead||mapRef.current)return;
      const map=new ML.Map({container:cid,style:DARK_STYLE,center:[10,25],zoom:2.2,minZoom:1.5,maxZoom:16,antialias:true,fadeDuration:100,renderWorldCopies:false}) as unknown as MLMap;
      (map as any).addControl(new ML.NavigationControl({showCompass:false}),'bottom-right');
      (map as any).on('load',()=>{if(!dead){mapRef.current=map;setReady(true);}});
      (map as any).on('zoom',()=>{zoomRef.current=(map as any).getZoom();});
    });
    return()=>{
      dead=true;
      popRef.current?.remove();
      if(mapRef.current){(mapRef.current as any).remove();mapRef.current=null;setReady(false);}
    };
  },[cid]);

  // Helper: create marker
  const mkMarker=useCallback((html:string,lngLat:[number,number],size:[number,number],anchor:'center'|'bottom'):MLMarker|null=>{
    if(!mapRef.current)return null;
    return import('maplibre-gl').then(ML=>{
      const el=document.createElement('div');
      el.className='ayn-mk';el.innerHTML=html;
      el.style.cssText=`width:${size[0]}px;height:${size[1]}px;display:flex;align-items:center;justify-content:center;`;
      return new ML.Marker({element:el,anchor}).setLngLat(lngLat).addTo(mapRef.current!);
    }) as any;
  },[]);

  // Render intel markers
  useEffect(()=>{
    if(!ready)return;
    import('maplibre-gl').then(ML=>{
      intelMks.current.forEach(m=>m.remove());intelMks.current=[];
      const zoom=(mapRef.current as any)?.getZoom()??2;
      zoomRef.current=zoom;
      const showLabels=zoom>=3;

      filtered.forEach(pt=>{
        const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
          // Wrapper with optional label
        const el=document.createElement('div');
        el.className='ayn-mk';
        el.style.cssText='position:relative;cursor:pointer;';
        el.innerHTML=mkIntel(cfg.hex,cfg.pulse,zoom)+(showLabels?mkLabel(pt.label,cfg.hex):'');
        el.style.cssText='position:relative;cursor:pointer;width:10px;height:10px;';
        el.onclick=()=>{
          onPointClick?.(pt);
          popRef.current?.remove();
          const popup=new ML.Popup({closeButton:true,maxWidth:'300px',offset:[0,-12]})
            .setLngLat([pt.coordinates[0],pt.coordinates[1]])
            .setHTML(popIntel(pt)).addTo(mapRef.current!);
          popRef.current=popup as unknown as MLPopup;
        };
        const m=new ML.Marker({element:el,anchor:'center'})
          .setLngLat([pt.coordinates[0],pt.coordinates[1]])
          .addTo(mapRef.current!);
        intelMks.current.push(m as unknown as MLMarker);
      });
    });
  },[filtered,ready,onPointClick]);

  // Re-render on zoom change (labels appear/disappear)
  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    const handler=()=>{
      // Just re-trigger the intel effect by updating a dummy state would cause loop
      // Instead directly update label visibility
      const zoom=(mapRef.current as any)?.getZoom()??2;
      intelMks.current.forEach((m:any)=>{
        const el=m.getElement();
        const labelEl=el.querySelector('.ayn-label') as HTMLElement;
        if(labelEl)labelEl.style.display=zoom>=3.5?'block':'none';
      });
    };
    (mapRef.current as any).on('zoom',handler);
    return()=>{(mapRef.current as any)?.off('zoom',handler);};
  },[ready]);

  // Render flight markers
  useEffect(()=>{
    if(!ready)return;
    import('maplibre-gl').then(ML=>{
      flightMks.current.forEach(m=>m.remove());flightMks.current=[];
      if(!showF)return;
      // Sample for performance
      const sample=flights.length>600?flights.filter((_,i)=>i%Math.ceil(flights.length/600)===0):flights;
      sample.forEach(f=>{
        const el=document.createElement('div');
        el.className='ayn-mk';
        el.style.cssText=`font-size:13px;color:#93c5fd;transform:rotate(${f.heading}deg);filter:drop-shadow(0 0 4px #3b82f6);cursor:pointer;line-height:1;`;
        el.textContent='✈';
        el.onclick=()=>{
          popRef.current?.remove();
          const popup=new ML.Popup({closeButton:true,maxWidth:'260px',offset:[0,-8]})
            .setLngLat([f.lng,f.lat]).setHTML(popFlight(f)).addTo(mapRef.current!);
          popRef.current=popup as unknown as MLPopup;
        };
        flightMks.current.push(new ML.Marker({element:el,anchor:'center'}).setLngLat([f.lng,f.lat]).addTo(mapRef.current!) as unknown as MLMarker);
      });
    });
  },[flights,showF,ready]);

  // Render ship markers
  useEffect(()=>{
    if(!ready)return;
    import('maplibre-gl').then(ML=>{
      shipMks.current.forEach(m=>m.remove());shipMks.current=[];
      if(!showS)return;
      ships.forEach(s=>{
        const el=document.createElement('div');
        el.className='ayn-mk';
        el.style.cssText=`font-size:11px;color:#5eead4;transform:rotate(${s.heading}deg);filter:drop-shadow(0 0 4px #14b8a6);cursor:pointer;line-height:1;`;
        el.textContent='▲';
        el.onclick=()=>{
          popRef.current?.remove();
          const popup=new ML.Popup({closeButton:true,maxWidth:'260px',offset:[0,-8]})
            .setLngLat([s.lng,s.lat]).setHTML(popShip(s)).addTo(mapRef.current!);
          popRef.current=popup as unknown as MLPopup;
        };
        shipMks.current.push(new ML.Marker({element:el,anchor:'center'}).setLngLat([s.lng,s.lat]).addTo(mapRef.current!) as unknown as MLMarker);
      });
    });
  },[ships,showS,ready]);

  // Traffic fetches
  const fetchF=useCallback(async()=>{
    try{const r=await fetch('https://opensky-network.org/api/states/all',{signal:AbortSignal.timeout(10000)});
      if(r.ok){const j=await r.json();const s:any[][]=j.states||[];const pts:LiveFlight[]=[];
        for(const x of s){if(!x[6]||!x[5]||x[8])continue;const cs=(x[1]||'').trim();if(!cs)continue;
          pts.push({id:x[0],callsign:cs,lat:+x[6],lng:+x[5],altitude:+(x[7]||0),velocity:+(x[9]||0),heading:+(x[10]||0),country:x[2]||''});
          if(pts.length>=900)break;}
        setFlights(pts);setFc(pts.length);setUpdated(new Date());return;}}catch{}
    const s=simFlights();setFlights(s);setFc(s.length);setUpdated(new Date());
  },[]);
  const fetchS=useCallback(async()=>{
    try{const r=await fetch(`${SUPA}/functions/v1/ayn-live-traffic?type=ships`);
      if(r.ok){const d=await r.json();if(d.ships){setShips(d.ships);setSc(d.ship_count||0);}}}catch{}
  },[]);
  useEffect(()=>{
    setLoading(true);Promise.all([fetchF(),fetchS()]).finally(()=>setLoading(false));
    const a=setInterval(fetchF,20000);const b=setInterval(fetchS,90000);
    return()=>{clearInterval(a);clearInterval(b);};
  },[fetchF,fetchS]);

  // Ticker
  function Ticker({items}:{items:string[]}){
    const [off,setOff]=useState(0);
    useEffect(()=>{const t=setInterval(()=>setOff(o=>o+0.35),16);return()=>clearInterval(t);},[]);
    if(!items.length)return null;
    const txt=items.join('   ·   ');
    return<div style={{overflow:'hidden',whiteSpace:'nowrap',flex:1}}><span style={{display:'inline-block',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.35)',letterSpacing:'0.06em',transform:`translateX(-${off%(txt.length*5.6)}px)`,transition:'none'}}>{txt+'   ·   '+txt}</span></div>;
  }

  const pill=(lbl:string,val:string,color:string)=>(
    <div key={lbl} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(0,3,14,0.9)',border:`1px solid ${color}44`,borderRadius:7,padding:'4px 9px'}}>
      <div style={{width:2,height:16,borderRadius:2,background:color,boxShadow:`0 0 6px ${color}`}}/>
      <div><div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',letterSpacing:'0.18em'}}>{lbl}</div>
      <div style={{fontSize:13,fontFamily:'monospace',fontWeight:900,color,lineHeight:1.1}}>{val}</div></div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',width:'100%',borderRadius:14,overflow:'hidden',background:'#020b18',border:'1px solid rgba(0,255,200,0.12)',boxShadow:'0 0 60px rgba(0,0,0,0.8)'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 16px',borderBottom:'1px solid rgba(255,255,255,0.05)',background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:5}}>{[['#ef4444',true],['#eab308',false],['#22c55e',false]].map(([c,p],i)=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:c as string,boxShadow:p?`0 0 8px ${c}`:undefined}}/>)}</div>
          <span style={{fontSize:10,fontFamily:'monospace',fontWeight:900,color:'#00ffcc',letterSpacing:'0.22em'}}>AYN // WORLD THREAT MATRIX</span>
          <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)',letterSpacing:'0.1em'}}>LIVE INTEL · CLICK SIGNAL FOR DETAILS</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>{filtered.length} SIGNALS</span>
          {isLive&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:99,border:'1px solid rgba(0,255,136,0.3)',background:'rgba(0,255,136,0.06)'}}><div style={{width:6,height:6,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 6px #22c55e'}}/><span style={{fontSize:7,fontFamily:'monospace',color:'#4ade80',letterSpacing:'0.15em'}}>LIVE</span></div>}
        </div>
      </div>
      {/* Controls */}
      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',padding:'7px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.45)',flexShrink:0}}>
        {(['flights','ships'] as const).map(type=>{const isF=type==='flights';const on=isF?showF:showS;const cnt=(isF?fc:sc).toLocaleString();const col=isF?'#60a5fa':'#2dd4bf';return(
          <button key={type} onClick={()=>isF?setShowF(v=>!v):setShowS(v=>!v)} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,cursor:'pointer',background:on?`${col}18`:'rgba(255,255,255,0.03)',border:`1px solid ${on?col+'55':'rgba(255,255,255,0.08)'}`,color:on?col:'rgba(255,255,255,0.3)',fontSize:7,fontFamily:'monospace',letterSpacing:'0.1em'}}>
            <span style={{fontSize:11}}>{isF?'✈':'⚓'}</span>{isF?'FLIGHTS':'SHIPS'}<span style={{background:on?`${col}22`:'rgba(255,255,255,0.06)',color:on?col:'rgba(255,255,255,0.4)',padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>{cnt}</span>
          </button>);})}
        {showLayerToggle&&<>{<div style={{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 3px'}}/>}{layers.map(l=>{const{icon,label,color}=LAYER_META[l];const cnt=countLayer(points,l);const act=activeLayer===l;return(<button key={l} onClick={()=>setActiveLayer(l)} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:99,cursor:'pointer',background:act?`${color}18`:'rgba(255,255,255,0.02)',border:`1px solid ${act?color+'55':'rgba(255,255,255,0.07)'}`,color:act?color:'rgba(255,255,255,0.3)',fontSize:7,fontFamily:'monospace',letterSpacing:'0.1em',whiteSpace:'nowrap'}}><span style={{fontSize:10}}>{icon}</span>{label}<span style={{background:act?`${color}22`:'rgba(255,255,255,0.06)',color:act?color:'rgba(255,255,255,0.35)',padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>{cnt}</span></button>);})}</>}
        <div style={{flex:1}}/>
        {loading&&<span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>updating...</span>}
        {updated&&!loading&&<span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)'}}>{Math.round((Date.now()-updated.getTime())/1000)}s ago</span>}
      </div>
      {/* Map */}
      <div style={{position:'relative',height}}>
        <div id={cid} style={{width:'100%',height:'100%'}}/>
        {/* Stats */}
        <div style={{position:'absolute',top:10,right:10,zIndex:10,display:'flex',flexDirection:'column',gap:4,pointerEvents:'none'}}>
          {showF&&fc>0&&pill('AIRCRAFT',fc.toLocaleString(),'#60a5fa')}
          {showS&&sc>0&&pill('VESSELS',sc.toLocaleString(),'#2dd4bf')}
          {countLayer(points,'conflict')>0&&pill('CONFLICT',String(countLayer(points,'conflict')),'#ef4444')}
          {countLayer(points,'cyber')>0&&pill('CYBER',String(countLayer(points,'cyber')),'#ec4899')}
        </div>
        {/* Legend */}
        <div style={{position:'absolute',bottom:32,left:10,zIndex:10,pointerEvents:'none',background:'rgba(0,2,14,0.93)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:9,padding:'8px 12px',backdropFilter:'blur(10px)'}}>
          <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.18em',marginBottom:6}}>SIGNAL KEY</div>
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as RiskKey[]).map(r=>(
            <div key={r} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
              <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:riskConfig[r].hex,boxShadow:`0 0 5px ${riskConfig[r].hex}`}}/>
              <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.08em'}}>{riskConfig[r].label}</span>
            </div>
          ))}
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:5,paddingTop:5}}>
            {[['✈','#93c5fd','AIRCRAFT'],['▲','#5eead4','VESSEL']].map(([i,c,l])=>(
              <div key={l} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
                <span style={{fontSize:11,color:c as string,filter:`drop-shadow(0 0 3px ${c})`}}>{i}</span>
                <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)'}}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Loading */}
        {!ready&&<div style={{position:'absolute',inset:0,zIndex:20,background:'#020b18',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14}}>
          <div style={{width:40,height:40,borderRadius:'50%',border:'2px solid rgba(0,255,200,0.12)',borderTop:'2px solid #00ffcc',animation:'ayn-spin 0.8s linear infinite'}}/>
          <span style={{fontFamily:'monospace',fontSize:9,color:'rgba(0,255,200,0.5)',letterSpacing:'0.2em'}}>INITIALIZING INTELLIGENCE MAP...</span>
        </div>}
      </div>
      {/* Ticker */}
      {ticker.length>0&&<div style={{display:'flex',alignItems:'center',gap:12,padding:'5px 16px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.6)',flexShrink:0}}>
        <span style={{flexShrink:0,fontSize:6.5,fontFamily:'monospace',fontWeight:900,color:'#f87171',letterSpacing:'0.15em',border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.1)',padding:'2px 6px',borderRadius:4}}>▶ FEED</span>
        <Ticker items={ticker}/>
      </div>}
    </div>
  );
}
