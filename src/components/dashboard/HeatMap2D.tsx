import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MapPoint {
  id?: string;
  coordinates: [number, number]; // [lng, lat]
  label: string;
  detail?: string;
  category?: string;
  risk: 'critical' | 'high' | 'alert' | 'stable' | 'unknown' | 'satellite'
      | 'aviation' | 'maritime' | 'cyber' | 'disaster';
  heading?: number;
  speed?: number;
}

export type MapLayer = 'all' | 'conflict' | 'maritime' | 'aviation' | 'cyber' | 'disasters';

interface LiveFlight {
  id: string; callsign: string; lat: number; lng: number;
  altitude: number; velocity: number; heading: number; country: string;
}
interface LiveShip {
  id: string; name: string; lat: number; lng: number;
  speed: number; heading: number; ship_type: number; destination: string;
}

export const riskConfig = {
  critical: { color: [239,68,68]   as [number,number,number], hex:'#ef4444', label:'CONFLICT',  pulse:true  },
  high:     { color: [249,115,22]  as [number,number,number], hex:'#f97316', label:'HIGH RISK', pulse:true  },
  alert:    { color: [234,179,8]   as [number,number,number], hex:'#eab308', label:'ALERT',     pulse:false },
  stable:   { color: [34,197,94]   as [number,number,number], hex:'#22c55e', label:'STABLE',    pulse:false },
  satellite:{ color: [168,85,247]  as [number,number,number], hex:'#a855f7', label:'SATELLITE', pulse:false },
  unknown:  { color: [6,182,212]   as [number,number,number], hex:'#06b6d4', label:'INTEL',     pulse:false },
  aviation: { color: [59,130,246]  as [number,number,number], hex:'#3b82f6', label:'AVIATION',  pulse:false },
  maritime: { color: [20,184,166]  as [number,number,number], hex:'#14b8a6', label:'MARITIME',  pulse:false },
  cyber:    { color: [236,72,153]  as [number,number,number], hex:'#ec4899', label:'CYBER',     pulse:true  },
  disaster: { color: [249,115,22]  as [number,number,number], hex:'#f97316', label:'DISASTER',  pulse:true  },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_CATEGORIES: Record<MapLayer, string[]> = {
  all:[], conflict:['Conflict','Military'], maritime:['Maritime','Supply Chain'],
  aviation:['Aviation'], cyber:['Cyber'], disasters:['Disaster','Seismology','Wildfire'],
};
const LAYER_META: Record<MapLayer,{icon:string;label:string;color:string}> = {
  all:{icon:'◈',label:'ALL',color:'#00ffcc'},       conflict:{icon:'⚔',label:'CONFLICT',color:'#ef4444'},
  maritime:{icon:'⚓',label:'MARITIME',color:'#14b8a6'}, aviation:{icon:'✈',label:'AVIATION',color:'#3b82f6'},
  cyber:{icon:'⬡',label:'CYBER',color:'#ec4899'},    disasters:{icon:'△',label:'DISASTERS',color:'#f97316'},
};

function countLayer(pts:MapPoint[],layer:MapLayer){
  if(layer==='all')return pts.length;
  const cats=LAYER_CATEGORIES[layer];
  return pts.filter(p=>cats.some(c=>(p.category||'').toLowerCase().includes(c.toLowerCase()))).length;
}
function shipLabel(t:number){
  if(t>=70&&t<80)return'Cargo';if(t>=80&&t<90)return'Tanker';
  if(t>=60&&t<70)return'Passenger';return'Vessel';
}

// Simulated flights
function getSimulatedFlights():LiveFlight[]{
  const corridors=[
    ...Array.from({length:22},(_,i)=>({lat:52+Math.random()*6, lng:-55+i*5,  hdg:88, cs:'NAT'})),
    ...Array.from({length:28},(_,i)=>({lat:46+Math.random()*12,lng:-8+i*2.4, hdg:80, cs:'EUR'})),
    ...Array.from({length:20},(_,i)=>({lat:22+Math.random()*22,lng:100+i*4,  hdg:100,cs:'ASA'})),
    ...Array.from({length:14},(_,i)=>({lat:24+Math.random()*16,lng:38+i*3,   hdg:90, cs:'MEA'})),
    ...Array.from({length:20},(_,i)=>({lat:15+Math.random()*35,lng:-118+i*4.5,hdg:90,cs:'AMR'})),
    ...Array.from({length:16},(_,i)=>({lat:36+Math.random()*8, lng:-172+i*9, hdg:85, cs:'PAC'})),
    ...Array.from({length:14},(_,i)=>({lat:-2+Math.random()*20,lng:98+i*3,   hdg:90, cs:'SEA'})),
  ];
  return corridors.map((c,i)=>({
    id:`s${i}`,callsign:`${c.cs}${100+i}`,
    lat:c.lat+(Math.random()-0.5)*0.6, lng:c.lng+(Math.random()-0.5)*0.6,
    altitude:9500+Math.random()*2500, velocity:230+Math.random()*70,
    heading:c.hdg+(Math.random()-0.5)*8, country:'',
  }));
}

// Ticker
function ThreatTicker({items}:{items:string[]}){
  const [offset,setOffset]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setOffset(o=>o+0.35),16);return()=>clearInterval(t);},[]);
  if(!items.length)return null;
  const txt=items.join('   ·   ');
  return(
    <div style={{overflow:'hidden',whiteSpace:'nowrap',flex:1}}>
      <span style={{display:'inline-block',fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.35)',
        letterSpacing:'0.06em',transform:`translateX(-${offset%(txt.length*5.6)}px)`,transition:'none'}}>
        {txt+'   ·   '+txt}
      </span>
    </div>
  );
}

// Inline styles
const STYLES=`
.maplibregl-popup-content{
  background:rgba(0,3,14,0.97)!important;border-radius:12px!important;
  border:1px solid rgba(0,255,200,0.2)!important;
  box-shadow:0 0 40px rgba(0,0,0,0.9)!important;
  padding:0!important;font-family:'Courier New',monospace!important;min-width:220px;overflow:hidden;
}
.maplibregl-popup-tip{display:none!important;}
.maplibregl-popup-close-button{color:rgba(255,255,255,0.35)!important;font-size:20px!important;
  top:6px!important;right:10px!important;background:transparent!important;}
.maplibregl-popup-close-button:hover{color:rgba(255,255,255,0.7)!important;}
.maplibregl-ctrl-group{background:transparent!important;border:1px solid rgba(0,255,200,0.18)!important;
  border-radius:8px!important;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.6)!important;}
.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out{background:rgba(0,3,14,0.9)!important;}
.maplibregl-ctrl-zoom-in span,.maplibregl-ctrl-zoom-out span{
  background-image:none!important;color:#00ffcc!important;
  font-size:20px!important;display:flex!important;align-items:center!important;justify-content:center!important;
  width:100%!important;height:100%!important;}
.maplibregl-ctrl-zoom-in span::before{content:'+'!important;}
.maplibregl-ctrl-zoom-out span::before{content:'−'!important;}
.maplibregl-ctrl button:hover{background:rgba(0,255,200,0.1)!important;}
.maplibregl-ctrl-attrib{display:none!important;}
@keyframes ayn-spin{to{transform:rotate(360deg)}}
`;
function injectStyles(){
  if(document.getElementById('ayn-deckgl-css'))return;
  const s=document.createElement('style');s.id='ayn-deckgl-css';s.textContent=STYLES;
  document.head.appendChild(s);
}

// Popup HTML builders
function intelPopup(pt:MapPoint):string{
  const cfg=riskConfig[pt.risk as RiskKey]??riskConfig.unknown;
  const c=cfg.hex;
  return`<div style="background:${c}14;border-bottom:1px solid ${c}33;padding:12px 16px 10px;">
    <div style="font-size:11px;font-weight:900;color:${c};letter-spacing:0.1em;margin-bottom:2px;">${pt.label}</div>
    <div style="font-size:7px;color:${c}99;letter-spacing:0.15em;">${cfg.label}${pt.category?' · '+pt.category.toUpperCase():''}</div>
  </div>
  ${pt.detail?`<div style="padding:10px 16px 6px;"><div style="font-size:9px;color:rgba(255,255,255,0.55);line-height:1.65;max-width:240px;">${pt.detail.slice(0,200)}</div></div>`:''}
  <div style="padding:4px 16px 10px;font-size:7px;color:rgba(255,255,255,0.2);">
    ${pt.coordinates[1].toFixed(2)}°N · ${pt.coordinates[0].toFixed(2)}°E
  </div>`;
}
function flightPopup(f:LiveFlight):string{return`
  <div style="background:#1d4ed818;border-bottom:1px solid #3b82f633;padding:12px 16px 10px;">
    <div style="font-size:11px;font-weight:900;color:#60a5fa;letter-spacing:0.1em;">✈ ${f.callsign||'UNKNOWN'}</div>
    <div style="font-size:7px;color:#60a5fa88;letter-spacing:0.15em;">LIVE AIRCRAFT</div>
  </div>
  <div style="padding:10px 16px 12px;">
    ${f.country?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">🌍 ${f.country}</div>`:''}
    <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⬆ ${Math.round(f.altitude||0).toLocaleString()}m</div>
    <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${Math.round((f.velocity||0)*1.94)} kts</div>
    <div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 ${Math.round(f.heading||0)}°</div>
  </div>`;}
function shipPopup(s:LiveShip):string{return`
  <div style="background:#0d947718;border-bottom:1px solid #14b8a633;padding:12px 16px 10px;">
    <div style="font-size:11px;font-weight:900;color:#2dd4bf;letter-spacing:0.1em;">⚓ ${s.name||'UNKNOWN'}</div>
    <div style="font-size:7px;color:#2dd4bf88;letter-spacing:0.15em;">${shipLabel(s.ship_type).toUpperCase()} · LIVE</div>
  </div>
  <div style="padding:10px 16px 12px;">
    ${s.destination?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">→ ${s.destination}</div>`:''}
    <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${(s.speed||0).toFixed(1)} kts</div>
    <div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 ${Math.round(s.heading||0)}°</div>
  </div>`;}

// Map dark style (CartoDB)
const DARK_STYLE:any={
  version:8,
  sources:{'carto':{ type:'raster',
    tiles:['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
           'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
           'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
    tileSize:256,maxzoom:20}},
  layers:[{id:'carto',type:'raster',source:'carto',paint:{'raster-opacity':0.9}}],
  glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

const SUPA_URL='https://dfkoxuokfkttjhfjcecx.supabase.co';
let uid=0;

export function HeatMap2D({
  points=[],height=420,onPointClick,
  showLayerToggle=false,isLive=false,lastRefresh,ticker=[],
}:{
  points?:MapPoint[];height?:number;onPointClick?:(pt:MapPoint)=>void;
  showLayerToggle?:boolean;isLive?:boolean;lastRefresh?:Date;ticker?:string[];
}){
  const containerId=useRef(`ayn-map-${++uid}`).current;
  const mapRef=useRef<any>(null);
  const deckRef=useRef<any>(null);
  const popupRef=useRef<any>(null);
  const pulseRef=useRef(0);
  const rafRef=useRef<number>(0);

  const [mapReady,setMapReady]=useState(false);
  const [activeLayer,setActiveLayer]=useState<MapLayer>('all');
  const [flights,setFlights]=useState<LiveFlight[]>([]);
  const [ships,setShips]=useState<LiveShip[]>([]);
  const [showFlights,setShowFlights]=useState(true);
  const [showShips,setShowShips]=useState(true);
  const [flightCount,setFlightCount]=useState(0);
  const [shipCount,setShipCount]=useState(0);
  const [loading,setLoading]=useState(false);
  const [lastUpdate,setLastUpdate]=useState<Date|null>(null);
  const layers:MapLayer[]=['all','conflict','maritime','aviation','cyber','disasters'];

  const filteredPoints=useMemo(()=>{
    if(activeLayer==='all')return points;
    const cats=LAYER_CATEGORIES[activeLayer];
    return points.filter(p=>cats.some(c=>(p.category||'').toLowerCase().includes(c.toLowerCase())));
  },[points,activeLayer]);

  // Build Deck.gl layers and update the overlay
  const updateLayers=useCallback(()=>{
    if(!deckRef.current)return;
    const {ScatterplotLayer,TextLayer}=require('@deck.gl/layers');
    const zoom=mapRef.current?.getZoom()??2;
    const zoomScale=Math.min(1,(zoom-1)/4);
    const maxPx=Math.round(4+10*zoomScale); // 4px at zoom 1, 14px at zoom 5+
    const pulse=1+0.5*(0.5+0.5*Math.sin(pulseRef.current/400));
    const baseOpacity=zoom<2.5?0.65:zoom<4?0.82:1.0;

    const layerList:any[]=[];

    // ── Intel ScatterplotLayer (small, clean dots like worldmonitor)
    layerList.push(new ScatterplotLayer({
      id:'intel-base',
      data:filteredPoints,
      getPosition:(d:MapPoint)=>[d.coordinates[0],d.coordinates[1]],
      getRadius:(d:MapPoint)=>12000,
      getFillColor:(d:MapPoint)=>{
        const c=riskConfig[d.risk as RiskKey]?.color??[6,182,212];
        const a=Math.round(220*baseOpacity);
        return [...c,a] as [number,number,number,number];
      },
      getLineColor:(d:MapPoint)=>{
        const c=riskConfig[d.risk as RiskKey]?.color??[6,182,212];
        return [...c,255] as [number,number,number,number];
      },
      radiusMinPixels:4,
      radiusMaxPixels:maxPx,
      lineWidthMinPixels:1.5,
      stroked:true,
      pickable:true,
      onClick:(info:any)=>{
        if(!info.object||!mapRef.current)return;
        const pt=info.object as MapPoint;
        onPointClick?.(pt);
        // Show popup
        if(popupRef.current)popupRef.current.remove();
        import('maplibre-gl').then(({Popup})=>{
          const popup=new Popup({closeButton:true,maxWidth:'300px',offset:[0,-8]})
            .setLngLat([pt.coordinates[0],pt.coordinates[1]])
            .setHTML(intelPopup(pt))
            .addTo(mapRef.current);
          popupRef.current=popup;
        });
      },
    }));

    // ── Pulse ring for critical/cyber markers
    const pulsing=filteredPoints.filter(p=>riskConfig[p.risk as RiskKey]?.pulse);
    if(pulsing.length>0){
      layerList.push(new ScatterplotLayer({
        id:'intel-pulse',
        data:pulsing,
        getPosition:(d:MapPoint)=>[d.coordinates[0],d.coordinates[1]],
        getRadius:(d:MapPoint)=>12000,
        radiusScale:pulse,
        radiusMinPixels:5,
        radiusMaxPixels:maxPx*2.2,
        stroked:true,
        filled:false,
        getLineColor:(d:MapPoint)=>{
          const c=riskConfig[d.risk as RiskKey]?.color??[239,68,68];
          return [...c,Math.round(140*baseOpacity)] as [number,number,number,number];
        },
        lineWidthMinPixels:1,
        pickable:false,
        updateTriggers:{radiusScale:pulseRef.current},
      }));
    }

    // ── Label TextLayer (only at zoom >= 3)
    if(zoom>=3){
      layerList.push(new TextLayer({
        id:'intel-labels',
        data:filteredPoints,
        getPosition:(d:MapPoint)=>[d.coordinates[0],d.coordinates[1]],
        getText:(d:MapPoint)=>d.label.slice(0,20),
        getSize:zoom>=5?11:zoom>=4?10:9,
        getColor:(d:MapPoint)=>{
          const c=riskConfig[d.risk as RiskKey]?.color??[6,182,212];
          return [...c,220] as [number,number,number,number];
        },
        getPixelOffset:[0,-16],
        getTextAnchor:'middle' as const,
        getAlignmentBaseline:'bottom' as const,
        fontFamily:'Courier New, monospace',
        fontWeight:'bold',
        background:true,
        getBackgroundColor:[0,2,14,200] as [number,number,number,number],
        backgroundPadding:[4,2,4,2],
        getBorderColor:(d:MapPoint)=>{
          const c=riskConfig[d.risk as RiskKey]?.color??[6,182,212];
          return [...c,120] as [number,number,number,number];
        },
        getBorderWidth:1,
        pickable:false,
      }));
    }

    // ── Live flights (tiny blue dots with heading)
    if(showFlights&&flights.length){
      layerList.push(new ScatterplotLayer({
        id:'flights',
        data:flights,
        getPosition:(d:LiveFlight)=>[d.lng,d.lat],
        getRadius:6000,
        getFillColor:[96,165,250,Math.round(200*baseOpacity)] as [number,number,number,number],
        getLineColor:[147,197,253,255] as [number,number,number,number],
        radiusMinPixels:2,
        radiusMaxPixels:5,
        lineWidthMinPixels:0.5,
        stroked:true,
        pickable:true,
        onClick:(info:any)=>{
          if(!info.object||!mapRef.current)return;
          const f=info.object as LiveFlight;
          if(popupRef.current)popupRef.current.remove();
          import('maplibre-gl').then(({Popup})=>{
            popupRef.current=new Popup({closeButton:true,maxWidth:'260px',offset:[0,-6]})
              .setLngLat([f.lng,f.lat]).setHTML(flightPopup(f)).addTo(mapRef.current);
          });
        },
      }));
      // Callsign labels at high zoom
      if(zoom>=6){
        layerList.push(new TextLayer({
          id:'flight-labels',
          data:flights,
          getPosition:(d:LiveFlight)=>[d.lng,d.lat],
          getText:(d:LiveFlight)=>d.callsign,
          getSize:8,
          getColor:[147,197,253,180] as [number,number,number,number],
          getPixelOffset:[0,-10],
          getTextAnchor:'middle' as const,
          fontFamily:'Courier New, monospace',
          pickable:false,
        }));
      }
    }

    // ── Live ships (tiny teal dots)
    if(showShips&&ships.length){
      layerList.push(new ScatterplotLayer({
        id:'ships',
        data:ships,
        getPosition:(d:LiveShip)=>[d.lng,d.lat],
        getRadius:8000,
        getFillColor:[45,212,191,Math.round(200*baseOpacity)] as [number,number,number,number],
        getLineColor:[94,234,212,255] as [number,number,number,number],
        radiusMinPixels:2,
        radiusMaxPixels:5,
        lineWidthMinPixels:0.5,
        stroked:true,
        pickable:true,
        onClick:(info:any)=>{
          if(!info.object||!mapRef.current)return;
          const s=info.object as LiveShip;
          if(popupRef.current)popupRef.current.remove();
          import('maplibre-gl').then(({Popup})=>{
            popupRef.current=new Popup({closeButton:true,maxWidth:'260px',offset:[0,-6]})
              .setLngLat([s.lng,s.lat]).setHTML(shipPopup(s)).addTo(mapRef.current);
          });
        },
      }));
    }

    deckRef.current.setProps({layers:layerList});
  },[filteredPoints,flights,ships,showFlights,showShips,onPointClick]);

  // Init MapLibre + Deck.gl overlay
  useEffect(()=>{
    injectStyles();
    let destroyed=false;

    Promise.all([
      import('maplibre-gl'),
      import('@deck.gl/core'),
      import('@deck.gl/mapbox'),
    ]).then(([ML,{Deck},DeckMapbox])=>{
      if(destroyed)return;

      const map=new ML.Map({
        container:containerId,
        style:DARK_STYLE,
        center:[15,20],
        zoom:2,
        minZoom:1.5,
        maxZoom:16,
        antialias:true,
        fadeDuration:150,
        renderWorldCopies:false,
      });

      map.addControl(new ML.NavigationControl({showCompass:false}),'bottom-right');

      // Deck.gl overlay — same approach as worldmonitor
      const deck=new Deck({
        canvas:undefined,
        width:'100%',height:'100%',
        controller:false, // MapLibre handles controls
        useDevicePixels:true,
        _customRender:()=>map.triggerRepaint(),
      });

      // Use MapboxOverlay to sync with MapLibre
      const deckOverlay=new DeckMapbox.MapboxOverlay({
        interleaved:false,
        layers:[],
        getCursor:()=>'crosshair',
      });
      map.addControl(deckOverlay as any);
      deckRef.current=deckOverlay;

      map.on('load',()=>{
        if(!destroyed){mapRef.current=map;setMapReady(true);}
      });

      // Animate pulse on each frame
      const animate=()=>{
        pulseRef.current=Date.now();
        updateLayers();
        rafRef.current=requestAnimationFrame(animate);
      };
      map.on('load',()=>{rafRef.current=requestAnimationFrame(animate);});
    });

    return()=>{
      destroyed=true;
      cancelAnimationFrame(rafRef.current);
      if(popupRef.current){popupRef.current.remove();popupRef.current=null;}
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
      setMapReady(false);
    };
  },[containerId]);

  // Re-render layers when data changes
  useEffect(()=>{if(mapReady)updateLayers();},[mapReady,updateLayers]);

  // Fetch flights
  const fetchFlights=useCallback(async()=>{
    try{
      const res=await fetch('https://opensky-network.org/api/states/all',{signal:AbortSignal.timeout(10000)});
      if(res.ok){
        const json=await res.json();const states:any[][]=json.states||[];
        const pts:LiveFlight[]=[];
        for(const s of states){
          if(!s[6]||!s[5]||s[8])continue;
          const cs=(s[1]||'').trim();if(!cs)continue;
          pts.push({id:s[0],callsign:cs,lat:+s[6],lng:+s[5],altitude:+(s[7]||0),velocity:+(s[9]||0),heading:+(s[10]||0),country:s[2]||''});
          if(pts.length>=900)break;
        }
        setFlights(pts);setFlightCount(pts.length);setLastUpdate(new Date());return;
      }
    }catch{}
    const sim=getSimulatedFlights();setFlights(sim);setFlightCount(sim.length);setLastUpdate(new Date());
  },[]);

  const fetchShips=useCallback(async()=>{
    try{
      const res=await fetch(`${SUPA_URL}/functions/v1/ayn-live-traffic?type=ships`);
      if(res.ok){const d=await res.json();if(d.ships){setShips(d.ships);setShipCount(d.ship_count||0);}}
    }catch{}
  },[]);

  useEffect(()=>{
    setLoading(true);
    Promise.all([fetchFlights(),fetchShips()]).finally(()=>setLoading(false));
    const ft=setInterval(fetchFlights,20_000);const st=setInterval(fetchShips,90_000);
    return()=>{clearInterval(ft);clearInterval(st);};
  },[fetchFlights,fetchShips]);

  // UI helpers
  const pill=(label:string,value:string,color:string)=>(
    <div key={label} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(0,3,14,0.88)',
      border:`1px solid ${color}44`,borderRadius:7,padding:'4px 9px',backdropFilter:'blur(8px)'}}>
      <div style={{width:2,height:16,borderRadius:2,background:color,boxShadow:`0 0 6px ${color}`}}/>
      <div>
        <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.3)',letterSpacing:'0.18em'}}>{label}</div>
        <div style={{fontSize:13,fontFamily:'monospace',fontWeight:900,color,lineHeight:1.1}}>{value}</div>
      </div>
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',width:'100%',borderRadius:14,overflow:'hidden',
      background:'#020b18',border:'1px solid rgba(0,255,200,0.12)',boxShadow:'0 0 60px rgba(0,0,0,0.8)'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 16px',
        borderBottom:'1px solid rgba(255,255,255,0.05)',
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
            LIVE INTEL · CLICK SIGNAL FOR DETAILS
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:8,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>
            {filteredPoints.length} SIGNALS
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

      {/* Controls */}
      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',padding:'7px 16px',
        borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.45)',flexShrink:0}}>
        {(['flights','ships'] as const).map(type=>{
          const isF=type==='flights';
          const on=isF?showFlights:showShips;
          const cnt=(isF?flightCount:shipCount).toLocaleString();
          const col=isF?'#60a5fa':'#2dd4bf';
          return(
            <button key={type} onClick={()=>isF?setShowFlights(v=>!v):setShowShips(v=>!v)} style={{
              display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,cursor:'pointer',
              background:on?`${col}18`:'rgba(255,255,255,0.03)',
              border:`1px solid ${on?col+'55':'rgba(255,255,255,0.08)'}`,
              color:on?col:'rgba(255,255,255,0.3)',fontSize:7,fontFamily:'monospace',letterSpacing:'0.1em'}}>
              <span style={{fontSize:11}}>{isF?'✈':'⚓'}</span>
              {isF?'FLIGHTS':'SHIPS'}
              <span style={{background:on?`${col}22`:'rgba(255,255,255,0.06)',color:on?col:'rgba(255,255,255,0.4)',
                padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>{cnt}</span>
            </button>
          );
        })}
        {showLayerToggle&&<>
          <div style={{width:1,height:16,background:'rgba(255,255,255,0.1)',margin:'0 3px',flexShrink:0}}/>
          {layers.map(layer=>{
            const {icon,label,color}=LAYER_META[layer];
            const cnt=countLayer(points,layer);const active=activeLayer===layer;
            return(
              <button key={layer} onClick={()=>setActiveLayer(layer)} style={{
                display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:99,cursor:'pointer',
                background:active?`${color}18`:'rgba(255,255,255,0.02)',
                border:`1px solid ${active?color+'55':'rgba(255,255,255,0.07)'}`,
                color:active?color:'rgba(255,255,255,0.3)',fontSize:7,fontFamily:'monospace',
                letterSpacing:'0.1em',whiteSpace:'nowrap'}}>
                <span style={{fontSize:10}}>{icon}</span>{label}
                <span style={{background:active?`${color}22`:'rgba(255,255,255,0.06)',
                  color:active?color:'rgba(255,255,255,0.35)',padding:'1px 5px',borderRadius:4,fontSize:9,fontWeight:700}}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </>}
        <div style={{flex:1}}/>
        {loading&&<span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.2)'}}>updating...</span>}
        {lastUpdate&&!loading&&(
          <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.15)'}}>
            {Math.round((Date.now()-lastUpdate.getTime())/1000)}s ago
          </span>
        )}
      </div>

      {/* Map */}
      <div style={{position:'relative',height}}>
        <div id={containerId} style={{width:'100%',height:'100%'}}/>

        {/* Stats top-right */}
        <div style={{position:'absolute',top:10,right:10,zIndex:10,display:'flex',flexDirection:'column',gap:4,pointerEvents:'none'}}>
          {showFlights&&flightCount>0&&pill('AIRCRAFT',flightCount.toLocaleString(),'#60a5fa')}
          {showShips&&shipCount>0&&pill('VESSELS',shipCount.toLocaleString(),'#2dd4bf')}
          {countLayer(points,'conflict')>0&&pill('CONFLICT',String(countLayer(points,'conflict')),'#ef4444')}
          {countLayer(points,'cyber')>0&&pill('CYBER',String(countLayer(points,'cyber')),'#ec4899')}
        </div>

        {/* Legend bottom-left */}
        <div style={{position:'absolute',bottom:32,left:10,zIndex:10,pointerEvents:'none',
          background:'rgba(0,2,14,0.93)',border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:9,padding:'8px 12px',backdropFilter:'blur(10px)'}}>
          <div style={{fontSize:6,fontFamily:'monospace',color:'rgba(255,255,255,0.2)',letterSpacing:'0.18em',marginBottom:6}}>SIGNAL KEY</div>
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as RiskKey[]).map(r=>(
            <div key={r} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
              <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:riskConfig[r].hex,
                boxShadow:`0 0 5px ${riskConfig[r].hex}`}}/>
              <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.08em'}}>
                {riskConfig[r].label}
              </span>
            </div>
          ))}
          <div style={{borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:5,paddingTop:5}}>
            {[['✈','#93c5fd','AIRCRAFT'],['▲','#5eead4','VESSEL']].map(([ico,col,lbl])=>(
              <div key={lbl} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
                <span style={{fontSize:11,color:col as string,filter:`drop-shadow(0 0 3px ${col})`}}>{ico}</span>
                <span style={{fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)'}}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Loading */}
        {!mapReady&&(
          <div style={{position:'absolute',inset:0,zIndex:20,background:'#020b18',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14}}>
            <div style={{width:40,height:40,borderRadius:'50%',
              border:'2px solid rgba(0,255,200,0.12)',borderTop:'2px solid #00ffcc',
              animation:'ayn-spin 0.8s linear infinite'}}/>
            <span style={{fontFamily:'monospace',fontSize:9,color:'rgba(0,255,200,0.5)',letterSpacing:'0.2em'}}>
              LOADING INTELLIGENCE MAP...
            </span>
          </div>
        )}
      </div>

      {/* Ticker */}
      {ticker.length>0&&(
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'5px 16px',
          borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.6)',flexShrink:0}}>
          <span style={{flexShrink:0,fontSize:6.5,fontFamily:'monospace',fontWeight:900,color:'#f87171',
            letterSpacing:'0.15em',border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.1)',
            padding:'2px 6px',borderRadius:4}}>▶ FEED</span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
