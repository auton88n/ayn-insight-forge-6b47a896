import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

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

// ─── Config ───────────────────────────────────────────────────────────────────
const LAYER_CATEGORIES: Record<MapLayer, string[]> = {
  all: [], conflict: ['Conflict', 'Military'],
  maritime: ['Maritime', 'Supply Chain'], aviation: ['Aviation'],
  cyber: ['Cyber'], disasters: ['Disaster', 'Seismology', 'Wildfire'],
};

export const riskConfig = {
  critical: { color: '#ef4444', label: 'CONFLICT',  icon: '⚔', pulse: true  },
  high:     { color: '#f97316', label: 'HIGH RISK', icon: '⚠', pulse: true  },
  alert:    { color: '#eab308', label: 'ALERT',     icon: '!', pulse: false },
  stable:   { color: '#22c55e', label: 'STABLE',    icon: '●', pulse: false },
  satellite:{ color: '#a855f7', label: 'SATELLITE', icon: '◆', pulse: false },
  unknown:  { color: '#06b6d4', label: 'INTEL',     icon: '◉', pulse: false },
  aviation: { color: '#3b82f6', label: 'AVIATION',  icon: '✈', pulse: false },
  maritime: { color: '#14b8a6', label: 'MARITIME',  icon: '⚓', pulse: false },
  cyber:    { color: '#ec4899', label: 'CYBER',     icon: '⬡', pulse: true  },
  disaster: { color: '#f97316', label: 'DISASTER',  icon: '△', pulse: true  },
} as const;

type RiskKey = keyof typeof riskConfig;

const LAYER_META: Record<MapLayer, { icon: string; label: string; color: string }> = {
  all:       { icon: '◈', label: 'ALL',      color: '#00ffcc' },
  conflict:  { icon: '⚔', label: 'CONFLICT', color: '#ef4444' },
  maritime:  { icon: '⚓', label: 'MARITIME', color: '#14b8a6' },
  aviation:  { icon: '✈', label: 'AVIATION', color: '#3b82f6' },
  cyber:     { icon: '⬡', label: 'CYBER',    color: '#ec4899' },
  disasters: { icon: '△', label: 'DISASTERS',color: '#f97316' },
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
  return 'Vessel';
}

// ─── Simulated flights ────────────────────────────────────────────────────────
function getSimulatedFlights(): LiveFlight[] {
  const corridors = [
    ...Array.from({length:20},(_,i)=>({lat:52+Math.random()*6,  lng:-55+i*5,   hdg:88,  cs:'NAT'})),
    ...Array.from({length:25},(_,i)=>({lat:46+Math.random()*12, lng:-8+i*2.4,  hdg:80,  cs:'EUR'})),
    ...Array.from({length:18},(_,i)=>({lat:22+Math.random()*20, lng:100+i*4,   hdg:100, cs:'ASA'})),
    ...Array.from({length:12},(_,i)=>({lat:24+Math.random()*16, lng:38+i*3,    hdg:90,  cs:'MEA'})),
    ...Array.from({length:18},(_,i)=>({lat:15+Math.random()*35, lng:-118+i*4.5,hdg:90,  cs:'AMR'})),
    ...Array.from({length:14},(_,i)=>({lat:36+Math.random()*8,  lng:-172+i*9,  hdg:85,  cs:'PAC'})),
    ...Array.from({length:12},(_,i)=>({lat:-2+Math.random()*20, lng:98+i*3,    hdg:90,  cs:'SEA'})),
  ];
  return corridors.map((c,i)=>({
    id:`s${i}`, callsign:`${c.cs}${100+i}`,
    lat: c.lat+(Math.random()-0.5)*0.8,
    lng: c.lng+(Math.random()-0.5)*0.8,
    altitude: 9500+Math.random()*2500,
    velocity: 230+Math.random()*70,
    heading: c.hdg+(Math.random()-0.5)*10,
    country:'',
  }));
}

// ─── Ticker ───────────────────────────────────────────────────────────────────
function ThreatTicker({ items }: { items: string[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOffset(o => o + 0.35), 16);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return null;
  const txt = items.join('   ·   ');
  const max = txt.length * 5.6;
  return (
    <div style={{ overflow:'hidden', whiteSpace:'nowrap', flex:1 }}>
      <span style={{
        display:'inline-block', fontFamily:'monospace', fontSize:8,
        color:'rgba(255,255,255,0.35)', letterSpacing:'0.06em',
        transform:`translateX(-${offset%max}px)`, transition:'none',
      }}>
        {txt + '   ·   ' + txt}
      </span>
    </div>
  );
}

// ─── Inject AYN custom Leaflet styles ────────────────────────────────────────
const AYN_LEAFLET_STYLES = `
  .leaflet-container { background: #020b18 !important; font-family: 'Courier New', monospace; }
  .leaflet-tile-pane { opacity: 0.88; }
  .leaflet-control-zoom { border: 1px solid rgba(0,255,200,0.2) !important; background: transparent !important; }
  .leaflet-control-zoom a {
    background: rgba(0,5,15,0.92) !important;
    color: #00ffcc !important;
    border-bottom: 1px solid rgba(0,255,200,0.15) !important;
    width: 28px !important; height: 28px !important;
    line-height: 28px !important; font-size: 16px !important;
  }
  .leaflet-control-zoom a:hover { background: rgba(0,255,200,0.12) !important; }
  .leaflet-popup-content-wrapper {
    background: rgba(0,3,14,0.97) !important;
    border-radius: 12px !important;
    border: 1px solid rgba(0,255,200,0.18) !important;
    box-shadow: 0 0 40px rgba(0,0,0,0.9), 0 0 20px rgba(0,255,200,0.06) !important;
    padding: 0 !important;
    min-width: 220px;
  }
  .leaflet-popup-content { margin: 0 !important; padding: 0 !important; }
  .leaflet-popup-tip-container { display: none; }
  .leaflet-popup-close-button {
    color: rgba(255,255,255,0.3) !important;
    font-size: 20px !important;
    top: 8px !important; right: 10px !important;
    z-index: 10;
  }
  .leaflet-popup-close-button:hover { color: rgba(255,255,255,0.7) !important; }
  .ayn-marker { background: transparent !important; border: none !important; box-shadow: none !important; }
  @keyframes ayn-ring-pulse {
    0%   { transform: scale(1);   opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  .ayn-pulse-ring {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    animation: ayn-ring-pulse 1.6s ease-out infinite;
    pointer-events: none;
  }
`;

function injectStyles() {
  if (document.getElementById('ayn-map-styles')) return;
  const el = document.createElement('style');
  el.id = 'ayn-map-styles';
  el.textContent = AYN_LEAFLET_STYLES;
  document.head.appendChild(el);
}

// ─── Marker HTML factories ────────────────────────────────────────────────────
function intelMarkerHtml(cfg: typeof riskConfig[RiskKey], label: string) {
  const c = cfg.color;
  const short = label.length > 20 ? label.slice(0,19)+'…' : label;
  return `
    <div style="position:relative;width:32px;height:32px;">
      ${cfg.pulse ? `<div class="ayn-pulse-ring" style="background:${c}33;border:1.5px solid ${c}88;"></div>` : ''}
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:radial-gradient(circle at 38% 32%, ${c}ee 0%, ${c}77 60%, ${c}44 100%);
        border:2px solid ${c};
        box-shadow:0 0 0 2px ${c}33, 0 0 12px ${c}77, 0 2px 8px rgba(0,0,0,0.8);
        display:flex;align-items:center;justify-content:center;
        font-size:14px;color:#fff;
        position:relative;z-index:2;cursor:pointer;
      ">${cfg.icon}</div>
      <div style="
        position:absolute;
        bottom:calc(100% + 4px);
        left:50%;transform:translateX(-50%);
        background:rgba(0,2,12,0.96);
        border:1px solid ${c}55;
        border-radius:5px;
        padding:3px 8px 2px;
        white-space:nowrap;
        font:700 9px/13px 'Courier New',monospace;
        color:${c};
        letter-spacing:0.07em;
        pointer-events:none;
        box-shadow:0 0 12px ${c}33;
        text-transform:uppercase;
      ">${short}</div>
    </div>`;
}

function flightMarkerHtml(heading: number) {
  return `
    <div style="
      width:22px;height:22px;
      display:flex;align-items:center;justify-content:center;
      transform:rotate(${heading}deg);
      font-size:16px;
      color:#93c5fd;
      filter:drop-shadow(0 0 5px #3b82f6) drop-shadow(0 0 10px #1d4ed855);
      line-height:1;cursor:pointer;
    ">✈</div>`;
}

function shipMarkerHtml(heading: number) {
  return `
    <div style="
      width:18px;height:18px;
      display:flex;align-items:center;justify-content:center;
      transform:rotate(${heading}deg);
      font-size:14px;
      color:#5eead4;
      filter:drop-shadow(0 0 5px #14b8a6) drop-shadow(0 0 8px #0d947755);
      line-height:1;cursor:pointer;
    ">▲</div>`;
}

// ─── Popup HTML ───────────────────────────────────────────────────────────────
function intelPopup(pt: MapPoint) {
  const cfg = riskConfig[pt.risk as RiskKey] ?? riskConfig.unknown;
  const c = cfg.color;
  return `
    <div style="font-family:'Courier New',monospace;overflow:hidden;border-radius:12px;">
      <div style="background:${c}18;border-bottom:1px solid ${c}33;padding:12px 16px 10px;">
        <div style="font-size:11px;font-weight:900;color:${c};letter-spacing:0.1em;margin-bottom:2px;">
          ${cfg.icon} ${pt.label}
        </div>
        <div style="font-size:8px;color:${c}99;letter-spacing:0.12em;">
          ${cfg.label}${pt.category ? ' · '+pt.category.toUpperCase() : ''}
        </div>
      </div>
      ${pt.detail ? `
      <div style="padding:10px 16px 6px;">
        <div style="font-size:9px;color:rgba(255,255,255,0.55);line-height:1.65;max-width:240px;">
          ${pt.detail.slice(0,180)}
        </div>
      </div>` : ''}
      <div style="padding:6px 16px 12px;display:flex;align-items:center;gap:8px;">
        <div style="font-size:7.5px;color:rgba(255,255,255,0.2);font-family:monospace;">
          ${pt.coordinates[1].toFixed(2)}°N · ${pt.coordinates[0].toFixed(2)}°E
        </div>
      </div>
    </div>`;
}

function flightPopup(f: LiveFlight) {
  return `
    <div style="font-family:'Courier New',monospace;overflow:hidden;border-radius:12px;">
      <div style="background:#1d4ed822;border-bottom:1px solid #3b82f633;padding:12px 16px 10px;">
        <div style="font-size:12px;font-weight:900;color:#60a5fa;letter-spacing:0.1em;">✈ ${f.callsign||'UNKNOWN'}</div>
        <div style="font-size:8px;color:#60a5fa88;letter-spacing:0.12em;">LIVE AIRCRAFT</div>
      </div>
      <div style="padding:10px 16px 12px;">
        ${f.country?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">🌍 ${f.country}</div>`:''}
        <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⬆ Altitude: ${Math.round(f.altitude||0).toLocaleString()} m</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${Math.round((f.velocity||0)*1.94)} kts</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 Heading: ${Math.round(f.heading||0)}°</div>
      </div>
    </div>`;
}

function shipPopup(s: LiveShip) {
  return `
    <div style="font-family:'Courier New',monospace;overflow:hidden;border-radius:12px;">
      <div style="background:#0d947722;border-bottom:1px solid #14b8a633;padding:12px 16px 10px;">
        <div style="font-size:11px;font-weight:900;color:#2dd4bf;letter-spacing:0.1em;">⚓ ${s.name||'UNKNOWN'}</div>
        <div style="font-size:8px;color:#2dd4bf88;letter-spacing:0.12em;">${shipLabel(s.ship_type).toUpperCase()} · LIVE VESSEL</div>
      </div>
      <div style="padding:10px 16px 12px;">
        ${s.destination?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">→ ${s.destination}</div>`:''}
        <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:4px;">⚡ ${(s.speed||0).toFixed(1)} knots</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.5);">🧭 Heading: ${Math.round(s.heading||0)}°</div>
      </div>
    </div>`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
let mapInstanceCount = 0;

export function HeatMap2D({
  points = [], height = 580, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean;
  lastRefresh?: Date; ticker?: string[];
}) {
  const mapRef        = useRef<any>(null);
  const leafletRef    = useRef<any>(null);
  const intelLayer    = useRef<any>(null);
  const flightLayer   = useRef<any>(null);
  const shipLayer     = useRef<any>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapId         = useRef(`ayn-map-${++mapInstanceCount}`);

  const [mapReady, setMapReady]         = useState(false);
  const [activeLayer, setActiveLayer]   = useState<MapLayer>('all');
  const [flights, setFlights]           = useState<LiveFlight[]>([]);
  const [ships, setShips]               = useState<LiveShip[]>([]);
  const [showFlights, setShowFlights]   = useState(true);
  const [showShips, setShowShips]       = useState(true);
  const [flightCount, setFlightCount]   = useState(0);
  const [shipCount, setShipCount]       = useState(0);
  const [loading, setLoading]           = useState(false);
  const [lastUpdate, setLastUpdate]     = useState<Date|null>(null);

  const layers: MapLayer[] = ['all','conflict','maritime','aviation','cyber','disasters'];

  // ── Init Leaflet ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;
    injectStyles();

    import('leaflet').then(L => {
      leafletRef.current = L;
      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const el = document.getElementById(mapId.current);
      if (!el) return;

      const map = L.map(el, {
        center: [20, 15],
        zoom: 2,
        minZoom: 2,
        maxZoom: 14,
        zoomControl: true,
        attributionControl: false,
        maxBounds: [[-90,-200],[90,200]],
        maxBoundsViscosity: 0.9,
      });

      // CartoDB Dark Matter — best free dark tile for intelligence dashboards
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Layer groups
      intelLayer.current  = L.layerGroup().addTo(map);
      flightLayer.current = L.layerGroup().addTo(map);
      shipLayer.current   = L.layerGroup().addTo(map);

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // ── Render intel markers ────────────────────────────────────────────────────
  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category||'').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  useEffect(() => {
    if (!mapReady || !intelLayer.current) return;
    const L = leafletRef.current;
    intelLayer.current.clearLayers();

    filteredPoints.forEach(pt => {
      const cfg = riskConfig[pt.risk as RiskKey] ?? riskConfig.unknown;
      const icon = L.divIcon({
        html: intelMarkerHtml(cfg, pt.label),
        className: 'ayn-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -20],
      });
      L.marker([pt.coordinates[1], pt.coordinates[0]], { icon })
        .bindPopup(intelPopup(pt), { maxWidth: 300, className: 'ayn-popup' })
        .on('click', () => onPointClick?.(pt))
        .addTo(intelLayer.current);
    });
  }, [filteredPoints, mapReady, onPointClick]);

  // ── Render flight markers ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !flightLayer.current) return;
    const L = leafletRef.current;
    flightLayer.current.clearLayers();
    if (!showFlights) return;

    flights.forEach(f => {
      const icon = L.divIcon({
        html: flightMarkerHtml(f.heading),
        className: 'ayn-marker',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -14],
      });
      L.marker([f.lat, f.lng], { icon })
        .bindPopup(flightPopup(f), { maxWidth: 260, className: 'ayn-popup' })
        .addTo(flightLayer.current);
    });
  }, [flights, showFlights, mapReady]);

  // ── Render ship markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !shipLayer.current) return;
    const L = leafletRef.current;
    shipLayer.current.clearLayers();
    if (!showShips) return;

    ships.forEach(s => {
      const icon = L.divIcon({
        html: shipMarkerHtml(s.heading),
        className: 'ayn-marker',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
      });
      L.marker([s.lat, s.lng], { icon })
        .bindPopup(shipPopup(s), { maxWidth: 260, className: 'ayn-popup' })
        .addTo(shipLayer.current);
    });
  }, [ships, showShips, mapReady]);

  // ── Fetch flights (browser-direct to bypass server IP blocks) ───────────────
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
        setLastUpdate(new Date()); return;
      }
    } catch {}
    const sim = getSimulatedFlights();
    setFlights(sim); setFlightCount(sim.length); setLastUpdate(new Date());
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
    setLoading(true);
    Promise.all([fetchFlights(), fetchShips()]).finally(() => setLoading(false));
    const ft = setInterval(fetchFlights, 20_000);
    const st = setInterval(fetchShips, 90_000);
    return () => { clearInterval(ft); clearInterval(st); };
  }, [fetchFlights, fetchShips]);

  // ─── Stat pills ───────────────────────────────────────────────────────────
  const statPill = (label: string, value: number|string, color: string) => (
    <div style={{
      display:'flex', alignItems:'center', gap:6,
      background:'rgba(0,3,14,0.9)',
      border:`1px solid ${color}44`,
      borderRadius:8, padding:'4px 10px',
      backdropFilter:'blur(8px)',
    }}>
      <div style={{ width:2, height:16, borderRadius:1, background:color, boxShadow:`0 0 6px ${color}` }}/>
      <div>
        <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.3)', letterSpacing:'0.15em' }}>{label}</div>
        <div style={{ fontSize:13, fontFamily:'monospace', fontWeight:900, color, lineHeight:1.1 }}>{value}</div>
      </div>
    </div>
  );

  return (
    <div style={{
      display:'flex', flexDirection:'column', borderRadius:16, overflow:'hidden',
      background:'#020b18', border:'1px solid rgba(0,255,200,0.12)',
      boxShadow:'0 0 60px rgba(0,0,0,0.8)',
    }}>

      {/* ── Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)',
        background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            {[['#ef4444',true],['#eab308',false],['#22c55e',false]].map(([c,p],i)=>(
              <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:c as string,
                boxShadow: p ? `0 0 8px ${c}` : 'none',
                animation: p ? 'none' : undefined }} />
            ))}
          </div>
          <span style={{ fontSize:10, fontFamily:'monospace', fontWeight:900, color:'#00ffcc', letterSpacing:'0.22em' }}>
            AYN // WORLD THREAT MATRIX
          </span>
          <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.15)', letterSpacing:'0.1em' }}>
            LIVE INTEL · CLICK ANY SIGNAL
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.2)' }}>
            {filteredPoints.length} SIGNALS
          </span>
          {isLive && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:99,
              border:'1px solid rgba(0,255,136,0.3)', background:'rgba(0,255,136,0.06)' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e',
                boxShadow:'0 0 6px #22c55e', animation:'ayn-ring-pulse 2s ease-out infinite' }}/>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'#4ade80', letterSpacing:'0.15em' }}>LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls: layer tabs + traffic toggles in ONE clean row */}
      <div style={{
        display:'flex', alignItems:'center', gap:6, flexWrap:'wrap',
        padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)',
        background:'rgba(0,0,0,0.5)',
      }}>
        {/* Flight toggle */}
        {(['flights','ships'] as const).map(type => {
          const isF = type==='flights';
          const on  = isF ? showFlights : showShips;
          const cnt = isF ? flightCount : shipCount;
          const col = isF ? '#60a5fa' : '#2dd4bf';
          const ico = isF ? '✈' : '⚓';
          const lbl = isF ? 'FLIGHTS' : 'SHIPS';
          return (
            <button key={type}
              onClick={() => isF ? setShowFlights(v=>!v) : setShowShips(v=>!v)}
              style={{
                display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
                borderRadius:99, cursor:'pointer', transition:'all 0.15s',
                background: on ? `${col}18` : 'rgba(255,255,255,0.03)',
                border:`1px solid ${on ? col+'55' : 'rgba(255,255,255,0.07)'}`,
                color: on ? col : 'rgba(255,255,255,0.3)',
                fontSize:7, fontFamily:'monospace', letterSpacing:'0.1em',
              }}>
              <span style={{ fontSize:10 }}>{ico}</span>
              {lbl}
              <span style={{
                background: on ? `${col}25` : 'rgba(255,255,255,0.05)',
                padding:'1px 5px', borderRadius:4, fontSize:9, fontWeight:700,
              }}>{cnt.toLocaleString()}</span>
            </button>
          );
        })}

        {showLayerToggle && (
          <>
            <div style={{ width:1, height:16, background:'rgba(255,255,255,0.1)', margin:'0 2px' }}/>
            {layers.map(layer => {
              const { icon, label, color } = LAYER_META[layer];
              const cnt = countLayer(points, layer);
              const active = activeLayer === layer;
              return (
                <button key={layer} onClick={() => setActiveLayer(layer)} style={{
                  display:'flex', alignItems:'center', gap:4, padding:'4px 10px',
                  borderRadius:99, cursor:'pointer', transition:'all 0.15s',
                  background: active ? `${color}15` : 'rgba(255,255,255,0.02)',
                  border:`1px solid ${active ? color+'50' : 'rgba(255,255,255,0.06)'}`,
                  color: active ? color : 'rgba(255,255,255,0.3)',
                  fontSize:7, fontFamily:'monospace', letterSpacing:'0.1em', whiteSpace:'nowrap',
                }}>
                  {icon} {label}
                  <span style={{
                    background: active ? `${color}20` : 'rgba(255,255,255,0.04)',
                    padding:'1px 5px', borderRadius:3, fontSize:9, fontWeight:700,
                  }}>{cnt}</span>
                </button>
              );
            })}
          </>
        )}

        <div style={{ flex:1 }}/>
        {loading && <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.2)' }}>updating...</span>}
        {lastUpdate && !loading && (
          <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.15)' }}>
            {Math.round((Date.now()-lastUpdate.getTime())/1000)}s ago
          </span>
        )}
      </div>

      {/* ── Map + stats overlay */}
      <div style={{ position:'relative', height }}>
        {/* Map container */}
        <div id={mapId.current} style={{ width:'100%', height:'100%', zIndex:1 }}/>

        {/* Stats — top RIGHT, small, not covering the map */}
        <div style={{
          position:'absolute', top:10, right:10, zIndex:1000,
          display:'flex', flexDirection:'column', gap:5, pointerEvents:'none',
        }}>
          {showFlights && flightCount>0 && statPill('AIRCRAFT', flightCount.toLocaleString(), '#60a5fa')}
          {showShips   && shipCount>0   && statPill('VESSELS',  shipCount.toLocaleString(),  '#2dd4bf')}
          {countLayer(points,'conflict')>0 && statPill('CONFLICT', countLayer(points,'conflict'), '#ef4444')}
          {countLayer(points,'cyber')>0    && statPill('CYBER',    countLayer(points,'cyber'),    '#ec4899')}
        </div>

        {/* Legend — bottom left, compact */}
        <div style={{
          position:'absolute', bottom:10, left:10, zIndex:1000, pointerEvents:'none',
          background:'rgba(0,2,12,0.93)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:10, padding:'8px 12px', backdropFilter:'blur(10px)',
        }}>
          <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.2)', letterSpacing:'0.18em', marginBottom:6 }}>SIGNAL KEY</div>
          {(['critical','high','maritime','aviation','cyber','disaster'] as RiskKey[]).map(r => (
            <div key={r} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
              <div style={{ width:9,height:9,borderRadius:'50%', flexShrink:0,
                background:riskConfig[r].color, boxShadow:`0 0 6px ${riskConfig[r].color}` }}/>
              <span style={{ fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.1em' }}>
                {riskConfig[r].icon} {riskConfig[r].label}
              </span>
            </div>
          ))}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:5, paddingTop:5 }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:3 }}>
              <span style={{ fontSize:11,color:'#93c5fd',filter:'drop-shadow(0 0 4px #3b82f6)' }}>✈</span>
              <span style={{ fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)' }}>AIRCRAFT</span>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:7 }}>
              <span style={{ fontSize:10,color:'#5eead4',filter:'drop-shadow(0 0 4px #14b8a6)' }}>▲</span>
              <span style={{ fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)' }}>VESSEL</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Ticker */}
      {ticker.length > 0 && (
        <div style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'6px 16px', borderTop:'1px solid rgba(255,255,255,0.04)',
          background:'rgba(0,0,0,0.6)',
        }}>
          <span style={{
            flexShrink:0, fontSize:6.5, fontFamily:'monospace', fontWeight:900,
            color:'#f87171', letterSpacing:'0.15em',
            border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.1)',
            padding:'2px 6px', borderRadius:4,
          }}>▶ FEED</span>
          <ThreatTicker items={ticker}/>
        </div>
      )}
    </div>
  );
}
