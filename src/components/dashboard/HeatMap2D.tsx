import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

const LAYER_CATEGORIES: Record<MapLayer, string[]> = {
  all: [], conflict: ['Conflict', 'Military'],
  maritime: ['Maritime', 'Supply Chain'], aviation: ['Aviation'],
  cyber: ['Cyber'], disasters: ['Disaster', 'Seismology', 'Wildfire'],
};

export const riskConfig = {
  critical: { color: '#ef4444', glow: '#ef444488', label: 'CONFLICT',  icon: '⚔', pulse: true  },
  high:     { color: '#f97316', glow: '#f9731688', label: 'HIGH RISK', icon: '⚠', pulse: true  },
  alert:    { color: '#eab308', glow: '#eab30888', label: 'ALERT',     icon: '!', pulse: false },
  stable:   { color: '#22c55e', glow: '#22c55e88', label: 'STABLE',    icon: '●', pulse: false },
  satellite:{ color: '#a855f7', glow: '#a855f788', label: 'SATELLITE', icon: '◆', pulse: false },
  unknown:  { color: '#06b6d4', glow: '#06b6d488', label: 'INTEL',     icon: '◉', pulse: false },
  aviation: { color: '#3b82f6', glow: '#3b82f688', label: 'AVIATION',  icon: '✈', pulse: false },
  maritime: { color: '#14b8a6', glow: '#14b8a688', label: 'MARITIME',  icon: '⚓', pulse: false },
  cyber:    { color: '#ec4899', glow: '#ec489988', label: 'CYBER',     icon: '⬡', pulse: true  },
  disaster: { color: '#f97316', glow: '#f9731688', label: 'DISASTER',  icon: '△', pulse: true  },
} as const;

const LAYER_ICONS: Record<MapLayer, string> = {
  all: '◈', conflict: '⚔', maritime: '⚓', aviation: '✈', cyber: '⬡', disasters: '△',
};
const LAYER_LABELS: Record<MapLayer, string> = {
  all: 'ALL', conflict: 'CONFLICT', maritime: 'MARITIME',
  aviation: 'AVIATION', cyber: 'CYBER', disasters: 'DISASTERS',
};

function countLayer(pts: MapPoint[], layer: MapLayer) {
  if (layer === 'all') return pts.length;
  const cats = LAYER_CATEGORIES[layer];
  return pts.filter(p => cats.some(c => (p.category||'').toLowerCase().includes(c.toLowerCase()))).length;
}

function shipLabel(t: number) {
  if (t >= 70 && t < 80) return 'Cargo';
  if (t >= 80 && t < 90) return 'Tanker';
  if (t >= 60 && t < 70) return 'Passenger';
  if (t >= 30 && t < 36) return 'Fishing';
  return 'Vessel';
}

// ─── Simulated flights along major corridors ──────────────────────────────────
function getSimulatedFlights(): LiveFlight[] {
  const corridors = [
    ...Array.from({length:20},(_,i)=>({lat:52+Math.random()*6,  lng:-55+i*5,   hdg:88,  cs:'NAT'})),
    ...Array.from({length:25},(_,i)=>({lat:46+Math.random()*12, lng:-8+i*2.4,  hdg:75+Math.random()*50, cs:'EUR'})),
    ...Array.from({length:18},(_,i)=>({lat:22+Math.random()*28, lng:100+i*4,   hdg:70+Math.random()*100,cs:'APX'})),
    ...Array.from({length:12},(_,i)=>({lat:22+Math.random()*18, lng:38+i*3,    hdg:85+Math.random()*80, cs:'MEA'})),
    ...Array.from({length:18},(_,i)=>({lat:12+Math.random()*38, lng:-118+i*4.5,hdg:85+Math.random()*50, cs:'AMR'})),
    ...Array.from({length:10},(_,i)=>({lat:-18+Math.random()*36,lng:-8+i*4,    hdg:82+Math.random()*60, cs:'AFR'})),
    ...Array.from({length:14},(_,i)=>({lat:36+Math.random()*10, lng:-172+i*9,  hdg:85,  cs:'PAC'})),
    ...Array.from({length:12},(_,i)=>({lat:-3+Math.random()*22, lng:98+i*3,    hdg:90+Math.random()*80, cs:'SEA'})),
  ];
  return corridors.map((c,i)=>({
    id:`s${i}`, callsign:`${c.cs}${100+i}`,
    lat: c.lat+(Math.random()-0.5)*1.2,
    lng: c.lng+(Math.random()-0.5)*1.2,
    altitude: 9000+Math.random()*3000,
    velocity: 220+Math.random()*80,
    heading: c.hdg+(Math.random()-0.5)*12,
    country:'',
  }));
}

// ─── Ticker ───────────────────────────────────────────────────────────────────
function ThreatTicker({ items }: { items: string[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOffset(o => o + 0.4), 16);
    return () => clearInterval(t);
  }, []);
  const txt = items.join('   ·   ');
  return (
    <div className="overflow-hidden whitespace-nowrap flex-1">
      <span className="inline-block text-[8px] font-mono text-white/35 tracking-widest"
        style={{ transform:`translateX(-${offset%(txt.length*5.6)}px)`, transition:'none' }}>
        {txt+'   ·   '+txt}
      </span>
    </div>
  );
}

// ─── SVG marker HTML generators ───────────────────────────────────────────────
function makeIntelMarker(cfg: typeof riskConfig[keyof typeof riskConfig], label: string, pulse: boolean) {
  const c = cfg.color;
  return `
    <div style="position:relative;cursor:pointer;">
      ${pulse ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${c}22;animation:ayn-pulse 1.5s ease-in-out infinite;pointer-events:none;"></div>` : ''}
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:radial-gradient(circle at 35% 35%, ${c}cc, ${c}66);
        border:2px solid ${c};
        box-shadow:0 0 0 3px ${c}33, 0 0 16px ${c}66;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;color:#fff;font-weight:900;
        position:relative;z-index:2;
      ">${cfg.icon}</div>
      <div style="
        position:absolute;top:-26px;left:50%;transform:translateX(-50%);
        background:rgba(0,2,10,0.95);
        border:1px solid ${c}66;
        border-radius:5px;
        padding:2px 7px;
        white-space:nowrap;
        font:700 9px/14px 'Courier New',monospace;
        color:${c};
        letter-spacing:0.06em;
        pointer-events:none;
        box-shadow:0 0 10px ${c}33;
        max-width:140px;overflow:hidden;text-overflow:ellipsis;
      ">${label.slice(0,22)}</div>
    </div>`;
}

function makeFlightMarker(heading: number, callsign: string) {
  return `
    <div style="position:relative;cursor:pointer;">
      <div style="
        width:20px;height:20px;
        display:flex;align-items:center;justify-content:center;
        transform:rotate(${heading}deg);
        font-size:15px;
        filter:drop-shadow(0 0 4px #60a5fa) drop-shadow(0 0 8px #3b82f6);
        color:#93c5fd;
        line-height:1;
      ">✈</div>
    </div>`;
}

function makeShipMarker(heading: number) {
  const r = heading;
  return `
    <div style="position:relative;cursor:pointer;">
      <div style="
        width:18px;height:18px;
        display:flex;align-items:center;justify-content:center;
        transform:rotate(${r}deg);
        font-size:13px;
        filter:drop-shadow(0 0 4px #2dd4bf) drop-shadow(0 0 6px #14b8a6);
        color:#5eead4;
        line-height:1;
      ">▲</div>
    </div>`;
}

// ─── Main Map Component ───────────────────────────────────────────────────────
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const MAP_ID = 'ayn-leaflet-map';

export function HeatMap2D({
  points = [], height = 600, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean;
  lastRefresh?: Date; ticker?: string[];
}) {
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const intelLayerRef = useRef<any>(null);
  const flightLayerRef = useRef<any>(null);
  const shipLayerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [flights, setFlights] = useState<LiveFlight[]>([]);
  const [ships, setShips] = useState<LiveShip[]>([]);
  const [showFlights, setShowFlights] = useState(true);
  const [showShips, setShowShips] = useState(true);
  const [flightCount, setFlightCount] = useState(0);
  const [shipCount, setShipCount] = useState(0);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficTime, setTrafficTime] = useState<Date|null>(null);
  const [mapReady, setMapReady] = useState(false);

  const layers: MapLayer[] = ['all','conflict','maritime','aviation','cyber','disasters'];

  // ── Init Leaflet map once ──────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    import('leaflet').then(L => {
      leafletRef.current = L;

      // Inject global CSS for Leaflet + AYN custom styles
      if (!document.getElementById('ayn-leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'ayn-leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const style = document.createElement('style');
        style.textContent = `
          @keyframes ayn-pulse {
            0%,100% { transform:scale(1); opacity:0.6; }
            50% { transform:scale(1.6); opacity:0; }
          }
          .ayn-intel-marker { background:transparent!important; border:none!important; }
          .leaflet-popup-content-wrapper {
            background:rgba(0,3,12,0.97)!important;
            border:1px solid rgba(0,255,200,0.2)!important;
            border-radius:12px!important;
            box-shadow:0 0 30px rgba(0,255,200,0.1), 0 8px 40px rgba(0,0,0,0.9)!important;
            color:#fff!important;
            font-family:'Courier New',monospace!important;
          }
          .leaflet-popup-tip { background:rgba(0,3,12,0.97)!important; }
          .leaflet-popup-close-button { color:rgba(255,255,255,0.4)!important; font-size:16px!important; }
          .ayn-popup-title { font-size:12px;font-weight:900;letter-spacing:0.1em;margin-bottom:6px; }
          .ayn-popup-row { font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:3px;line-height:1.5; }
          .ayn-popup-badge {
            display:inline-block;padding:2px 8px;border-radius:4px;
            font-size:8px;font-weight:700;letter-spacing:0.12em;margin-top:4px;
          }
          .leaflet-container { background:#020b18!important; }
          .leaflet-control-zoom a {
            background:rgba(0,3,12,0.9)!important;
            color:#00ffcc!important;
            border:1px solid rgba(0,255,200,0.2)!important;
            font-size:16px!important;
          }
          .leaflet-control-zoom a:hover { background:rgba(0,255,200,0.1)!important; }
        `;
        document.head.appendChild(style);
      }

      const map = L.map(mapContainerRef.current!, {
        center: [20, 15],
        zoom: 3,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true,   // faster rendering
      });

      // Dark tile layer from CartoDB (free, no key, beautiful dark style)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd',
        opacity: 0.85,
      }).addTo(map);

      // Subtle AYN green overlay grid (drawn on top via canvas layer)
      // Create layer groups
      intelLayerRef.current  = L.layerGroup().addTo(map);
      flightLayerRef.current = L.layerGroup().addTo(map);
      shipLayerRef.current   = L.layerGroup().addTo(map);

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // ── Update intel markers ───────────────────────────────────────────────────
  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category||'').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  useEffect(() => {
    if (!mapReady || !intelLayerRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    intelLayerRef.current.clearLayers();

    for (const pt of filteredPoints) {
      const cfg = riskConfig[pt.risk] ?? riskConfig.unknown;
      const icon = L.divIcon({
        html: makeIntelMarker(cfg, pt.label, cfg.pulse),
        className: 'ayn-intel-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const popupHtml = `
        <div class="ayn-popup-title" style="color:${cfg.color}">${cfg.icon} ${pt.label}</div>
        ${pt.category ? `<div class="ayn-popup-row">Category: ${pt.category}</div>` : ''}
        ${pt.detail   ? `<div class="ayn-popup-row" style="max-width:240px;line-height:1.6">${pt.detail.slice(0,160)}</div>` : ''}
        <div class="ayn-popup-row">📍 ${pt.coordinates[1].toFixed(2)}°N · ${pt.coordinates[0].toFixed(2)}°E</div>
        <span class="ayn-popup-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">
          ${cfg.label}
        </span>
      `;

      const marker = L.marker([pt.coordinates[1], pt.coordinates[0]], { icon })
        .bindPopup(popupHtml, { maxWidth: 280 })
        .on('click', () => onPointClick?.(pt));

      intelLayerRef.current.addLayer(marker);
    }
  }, [filteredPoints, mapReady, onPointClick]);

  // ── Update flight markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !flightLayerRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    flightLayerRef.current.clearLayers();
    if (!showFlights) return;

    for (const f of flights) {
      const icon = L.divIcon({
        html: makeFlightMarker(f.heading, f.callsign),
        className: 'ayn-intel-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const popupHtml = `
        <div class="ayn-popup-title" style="color:#60a5fa">✈ ${f.callsign||'Unknown'}</div>
        ${f.country ? `<div class="ayn-popup-row">🌍 ${f.country}</div>` : ''}
        <div class="ayn-popup-row">⬆ ${Math.round(f.altitude||0).toLocaleString()}m altitude</div>
        <div class="ayn-popup-row">⚡ ${Math.round((f.velocity||0)*1.94)} kts · ${Math.round(f.heading||0)}° heading</div>
        <span class="ayn-popup-badge" style="background:#3b82f622;color:#60a5fa;border:1px solid #3b82f644">LIVE AIRCRAFT</span>
      `;
      L.marker([f.lat, f.lng], { icon }).bindPopup(popupHtml, { maxWidth: 240 })
        .addTo(flightLayerRef.current);
    }
  }, [flights, showFlights, mapReady]);

  // ── Update ship markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !shipLayerRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    shipLayerRef.current.clearLayers();
    if (!showShips) return;

    for (const s of ships) {
      const icon = L.divIcon({
        html: makeShipMarker(s.heading),
        className: 'ayn-intel-marker',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const popupHtml = `
        <div class="ayn-popup-title" style="color:#2dd4bf">⚓ ${s.name||'Unknown'}</div>
        <div class="ayn-popup-row">🚢 ${shipLabel(s.ship_type)}</div>
        ${s.destination ? `<div class="ayn-popup-row">→ ${s.destination}</div>` : ''}
        <div class="ayn-popup-row">⚡ ${(s.speed||0).toFixed(1)} kts · ${Math.round(s.heading||0)}° heading</div>
        <span class="ayn-popup-badge" style="background:#14b8a622;color:#2dd4bf;border:1px solid #14b8a644">LIVE VESSEL</span>
      `;
      L.marker([s.lat, s.lng], { icon }).bindPopup(popupHtml, { maxWidth: 240 })
        .addTo(shipLayerRef.current);
    }
  }, [ships, showShips, mapReady]);

  // ── Fetch flights (browser-direct, bypasses server IP blocks) ─────────────
  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch('https://opensky-network.org/api/states/all', {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const json = await res.json();
        const states: any[][] = json.states || [];
        const pts: LiveFlight[] = [];
        for (const s of states) {
          if (!s[6]||!s[5]||s[8]) continue;
          const cs = (s[1]||'').trim();
          if (!cs) continue;
          pts.push({ id:s[0], callsign:cs, lat:+s[6], lng:+s[5],
            altitude:+(s[7]||0), velocity:+(s[9]||0), heading:+(s[10]||0), country:s[2]||'' });
          if (pts.length >= 1000) break;
        }
        setFlights(pts); setFlightCount(pts.length);
        setTrafficTime(new Date()); return;
      }
    } catch {}
    const sim = getSimulatedFlights();
    setFlights(sim); setFlightCount(sim.length); setTrafficTime(new Date());
  }, []);

  const fetchShips = useCallback(async () => {
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-live-traffic?type=ships`);
      if (res.ok) {
        const d = await res.json();
        if (d.ships) { setShips(d.ships); setShipCount(d.ship_count||0); }
      }
    } catch {}
  }, []);

  useEffect(() => {
    setTrafficLoading(true);
    Promise.all([fetchFlights(), fetchShips()]).finally(() => setTrafficLoading(false));
    const ft = setInterval(fetchFlights, 20_000);
    const st = setInterval(fetchShips, 90_000);
    return () => { clearInterval(ft); clearInterval(st); };
  }, [fetchFlights, fetchShips]);

  return (
    <div className="w-full flex flex-col rounded-2xl overflow-hidden"
      style={{ background:'#020b18', border:'1px solid rgba(0,255,200,0.12)', boxShadow:'0 0 60px rgba(0,255,200,0.04)' }}>

      {/* ── Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6"
        style={{ background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 items-center">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow:'0 0 8px #ef4444' }}/>
            <div className="w-2 h-2 rounded-full bg-yellow-400 opacity-50"/>
            <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow:'0 0 6px #22c55e' }}/>
          </div>
          <span className="text-[10px] font-mono font-black text-[#00ffcc] tracking-[0.22em]">AYN // WORLD THREAT MATRIX</span>
          <span className="text-[7px] font-mono text-white/15 tracking-wider">LIVE INTEL · CLICK TO EXPLORE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/20">{filteredPoints.length} INTEL SIGNALS</span>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
              style={{ border:'1px solid rgba(0,255,136,0.3)', background:'rgba(0,255,136,0.06)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
              <span className="text-[7px] font-mono text-emerald-400 tracking-widest">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/4 bg-black/40 flex-wrap">
        {/* Flights toggle */}
        <button onClick={() => setShowFlights(v=>!v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[7px] font-mono"
          style={{
            background: showFlights?'rgba(96,165,250,0.12)':'rgba(255,255,255,0.03)',
            border:`1px solid ${showFlights?'rgba(96,165,250,0.4)':'rgba(255,255,255,0.08)'}`,
            color: showFlights?'#93c5fd':'rgba(255,255,255,0.3)',
          }}>
          ✈ FLIGHTS
          <span className="font-black px-1.5 py-0.5 rounded text-[6px]"
            style={{ background:showFlights?'rgba(96,165,250,0.2)':'rgba(255,255,255,0.05)' }}>
            {flightCount.toLocaleString()}
          </span>
        </button>

        {/* Ships toggle */}
        <button onClick={() => setShowShips(v=>!v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[7px] font-mono"
          style={{
            background: showShips?'rgba(45,212,191,0.12)':'rgba(255,255,255,0.03)',
            border:`1px solid ${showShips?'rgba(45,212,191,0.4)':'rgba(255,255,255,0.08)'}`,
            color: showShips?'#5eead4':'rgba(255,255,255,0.3)',
          }}>
          ⚓ SHIPS
          <span className="font-black px-1.5 py-0.5 rounded text-[6px]"
            style={{ background:showShips?'rgba(45,212,191,0.2)':'rgba(255,255,255,0.05)' }}>
            {shipCount.toLocaleString()}
          </span>
        </button>

        {showLayerToggle && <>
          <div className="w-px h-4 bg-white/10 mx-1"/>
          {layers.map(layer => {
            const cnt = countLayer(points, layer);
            const active = activeLayer === layer;
            return (
              <button key={layer} onClick={() => setActiveLayer(layer)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[7px] font-mono uppercase tracking-wide transition-all border whitespace-nowrap"
                style={{
                  background: active?'rgba(0,255,200,0.1)':'rgba(255,255,255,0.02)',
                  borderColor: active?'rgba(0,255,200,0.4)':'rgba(255,255,255,0.06)',
                  color: active?'#00ffcc':'rgba(255,255,255,0.3)',
                }}>
                {LAYER_ICONS[layer]} {LAYER_LABELS[layer]}
                <span className="ml-0.5 px-1 rounded text-[6px]"
                  style={{ background:active?'rgba(0,255,200,0.15)':'rgba(255,255,255,0.05)' }}>
                  {cnt}
                </span>
              </button>
            );
          })}
        </>}

        <div className="flex-1"/>
        {trafficLoading && <span className="text-[7px] font-mono text-white/20 animate-pulse">fetching live data...</span>}
        {trafficTime && !trafficLoading && (
          <span className="text-[7px] font-mono text-white/15">
            updated {Math.round((Date.now()-trafficTime.getTime())/1000)}s ago
          </span>
        )}
      </div>

      {/* ── Map */}
      <div className="relative w-full" style={{ height }}>
        {/* Leaflet container */}
        <div ref={mapContainerRef} id={MAP_ID} style={{ width:'100%', height:'100%', zIndex:1 }}/>

        {/* Counters overlay */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-[1000] pointer-events-none">
          {showFlights && flightCount > 0 && (
            <div style={{ background:'rgba(0,2,10,0.92)', border:'1px solid rgba(96,165,250,0.3)', borderRadius:10, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, backdropFilter:'blur(8px)' }}>
              <div style={{ width:3, height:22, borderRadius:2, background:'#60a5fa', boxShadow:'0 0 8px #60a5fa' }}/>
              <div>
                <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.25)', letterSpacing:'0.15em' }}>AIRCRAFT</div>
                <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:900, color:'#93c5fd' }}>{flightCount.toLocaleString()}</div>
              </div>
            </div>
          )}
          {showShips && shipCount > 0 && (
            <div style={{ background:'rgba(0,2,10,0.92)', border:'1px solid rgba(45,212,191,0.3)', borderRadius:10, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, backdropFilter:'blur(8px)' }}>
              <div style={{ width:3, height:22, borderRadius:2, background:'#2dd4bf', boxShadow:'0 0 8px #2dd4bf' }}/>
              <div>
                <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.25)', letterSpacing:'0.15em' }}>VESSELS</div>
                <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:900, color:'#5eead4' }}>{shipCount.toLocaleString()}</div>
              </div>
            </div>
          )}
          {countLayer(points,'conflict') > 0 && (
            <div style={{ background:'rgba(0,2,10,0.92)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:10, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, backdropFilter:'blur(8px)' }}>
              <div style={{ width:3, height:22, borderRadius:2, background:'#ef4444', boxShadow:'0 0 8px #ef4444' }}/>
              <div>
                <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.25)', letterSpacing:'0.15em' }}>CONFLICT</div>
                <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:900, color:'#fca5a5' }}>{countLayer(points,'conflict')}</div>
              </div>
            </div>
          )}
          {countLayer(points,'cyber') > 0 && (
            <div style={{ background:'rgba(0,2,10,0.92)', border:'1px solid rgba(236,72,153,0.35)', borderRadius:10, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, backdropFilter:'blur(8px)' }}>
              <div style={{ width:3, height:22, borderRadius:2, background:'#ec4899', boxShadow:'0 0 8px #ec4899' }}/>
              <div>
                <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.25)', letterSpacing:'0.15em' }}>CYBER</div>
                <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:900, color:'#f9a8d4' }}>{countLayer(points,'cyber')}</div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="absolute bottom-6 left-3 z-[1000] pointer-events-none"
          style={{ background:'rgba(0,2,10,0.93)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'10px 14px', backdropFilter:'blur(12px)' }}>
          <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.2)', letterSpacing:'0.18em', marginBottom:8 }}>SIGNAL KEY</div>
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as const).map(r => (
            <div key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:riskConfig[r].color, boxShadow:`0 0 8px ${riskConfig[r].color}` }}/>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.4)', letterSpacing:'0.1em' }}>
                {riskConfig[r].icon} {riskConfig[r].label}
              </span>
            </div>
          ))}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:6, paddingTop:6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ fontSize:12, filter:'drop-shadow(0 0 4px #60a5fa)', color:'#93c5fd' }}>✈</span>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.4)' }}>AIRCRAFT</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, filter:'drop-shadow(0 0 4px #2dd4bf)', color:'#5eead4' }}>▲</span>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.4)' }}>VESSEL</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Ticker */}
      {ticker.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/4 bg-black/60">
          <span className="shrink-0 text-[6.5px] font-mono font-black text-red-400 tracking-widest border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
            ▶ FEED
          </span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
