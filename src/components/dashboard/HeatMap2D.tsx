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

// ─── Risk config ──────────────────────────────────────────────────────────────
export const riskConfig = {
  critical: { color: '#ef4444', glow: '#ef444466', label: 'CONFLICT',  icon: '⚔', pulse: true  },
  high:     { color: '#f97316', glow: '#f9731666', label: 'HIGH RISK', icon: '⚠', pulse: true  },
  alert:    { color: '#eab308', glow: '#eab30866', label: 'ALERT',     icon: '!', pulse: false },
  stable:   { color: '#22c55e', glow: '#22c55e66', label: 'STABLE',    icon: '●', pulse: false },
  satellite:{ color: '#a855f7', glow: '#a855f766', label: 'SATELLITE', icon: '◆', pulse: false },
  unknown:  { color: '#06b6d4', glow: '#06b6d466', label: 'INTEL',     icon: '◉', pulse: false },
  aviation: { color: '#3b82f6', glow: '#3b82f666', label: 'AVIATION',  icon: '✈', pulse: false },
  maritime: { color: '#14b8a6', glow: '#14b8a666', label: 'MARITIME',  icon: '⚓', pulse: false },
  cyber:    { color: '#ec4899', glow: '#ec489966', label: 'CYBER',     icon: '⬡', pulse: true  },
  disaster: { color: '#f97316', glow: '#f9731666', label: 'DISASTER',  icon: '△', pulse: true  },
} as const;
type RiskKey = keyof typeof riskConfig;

const LAYER_CATEGORIES: Record<MapLayer, string[]> = {
  all: [], conflict: ['Conflict', 'Military'],
  maritime: ['Maritime', 'Supply Chain'], aviation: ['Aviation'],
  cyber: ['Cyber'], disasters: ['Disaster', 'Seismology', 'Wildfire'],
};

const LAYER_META: Record<MapLayer, { icon: string; label: string; color: string }> = {
  all:       { icon: '◈', label: 'ALL',       color: '#00ffcc' },
  conflict:  { icon: '⚔', label: 'CONFLICT',  color: '#ef4444' },
  maritime:  { icon: '⚓', label: 'MARITIME',  color: '#14b8a6' },
  aviation:  { icon: '✈', label: 'AVIATION',  color: '#3b82f6' },
  cyber:     { icon: '⬡', label: 'CYBER',     color: '#ec4899' },
  disasters: { icon: '△', label: 'DISASTERS', color: '#f97316' },
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
    ...Array.from({length:22},(_,i)=>({lat:52+Math.random()*6,  lng:-55+i*5,   hdg:88,  cs:'NAT'})),
    ...Array.from({length:28},(_,i)=>({lat:46+Math.random()*12, lng:-8+i*2.4,  hdg:80,  cs:'EUR'})),
    ...Array.from({length:20},(_,i)=>({lat:22+Math.random()*22, lng:100+i*4,   hdg:100, cs:'ASA'})),
    ...Array.from({length:14},(_,i)=>({lat:24+Math.random()*16, lng:38+i*3,    hdg:90,  cs:'MEA'})),
    ...Array.from({length:20},(_,i)=>({lat:15+Math.random()*35, lng:-118+i*4.5,hdg:90,  cs:'AMR'})),
    ...Array.from({length:16},(_,i)=>({lat:36+Math.random()*8,  lng:-172+i*9,  hdg:85,  cs:'PAC'})),
    ...Array.from({length:14},(_,i)=>({lat:-2+Math.random()*20, lng:98+i*3,    hdg:90,  cs:'SEA'})),
    ...Array.from({length:8}, (_,i)=>({lat:-30+Math.random()*20,lng:-60+i*8,   hdg:40,  cs:'SAM'})),
  ];
  return corridors.map((c,i)=>({
    id:`s${i}`, callsign:`${c.cs}${100+i}`,
    lat: c.lat+(Math.random()-0.5)*0.6,
    lng: c.lng+(Math.random()-0.5)*0.6,
    altitude: 9500+Math.random()*2500,
    velocity: 230+Math.random()*70,
    heading: c.hdg+(Math.random()-0.5)*8,
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
  return (
    <div style={{ overflow:'hidden', whiteSpace:'nowrap', flex:1 }}>
      <span style={{
        display:'inline-block', fontSize:8, fontFamily:'monospace',
        color:'rgba(255,255,255,0.35)', letterSpacing:'0.06em',
        transform:`translateX(-${offset%(txt.length*5.6)}px)`, transition:'none',
      }}>{txt+'   ·   '+txt}</span>
    </div>
  );
}

// ─── Inject global styles ────────────────────────────────────────────────────
const STYLES = `
.ayn-marker { background:transparent!important;border:none!important; }
.maplibregl-popup-content {
  background:rgba(0,3,14,0.97)!important;
  border-radius:12px!important;
  border:1px solid rgba(0,255,200,0.18)!important;
  box-shadow:0 0 40px rgba(0,0,0,0.9),0 0 24px rgba(0,255,200,0.06)!important;
  padding:0!important;
  font-family:'Courier New',monospace!important;
  min-width:230px;
  overflow:hidden;
}
.maplibregl-popup-tip { display:none!important; }
.maplibregl-popup-close-button {
  color:rgba(255,255,255,0.3)!important;
  font-size:22px!important;
  top:6px!important;right:10px!important;
  line-height:1!important;
  background:transparent!important;
}
.maplibregl-popup-close-button:hover{color:rgba(255,255,255,0.7)!important;}
.maplibregl-ctrl-zoom-in,.maplibregl-ctrl-zoom-out,.maplibregl-ctrl-compass {
  background:rgba(0,3,14,0.92)!important;
  border:none!important;
}
.maplibregl-ctrl-zoom-in span,.maplibregl-ctrl-zoom-out span {
  background-image:none!important;
  color:#00ffcc;font-size:18px;font-weight:300;
  display:flex;align-items:center;justify-content:center;width:100%;height:100%;
}
.maplibregl-ctrl-zoom-in span::before{content:'+'}
.maplibregl-ctrl-zoom-out span::before{content:'−'}
.maplibregl-ctrl-group {
  background:transparent!important;
  border:1px solid rgba(0,255,200,0.18)!important;
  border-radius:8px!important;
  overflow:hidden;
  box-shadow:0 0 20px rgba(0,0,0,0.6)!important;
}
.maplibregl-ctrl button:hover{background:rgba(0,255,200,0.1)!important;}
.maplibregl-ctrl-attrib{display:none!important;}
@keyframes ayn-pulse-ring {
  0%   { transform:scale(1);   opacity:0.9; }
  100% { transform:scale(2.5); opacity:0; }
}
@keyframes ayn-ping {
  0%,100% { opacity:1; }
  50%      { opacity:0.3; }
}
`;

function injectStyles() {
  if (document.getElementById('ayn-ml-styles')) return;
  const s = document.createElement('style');
  s.id = 'ayn-ml-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ─── Marker factories (DOM elements, not innerHTML strings) ───────────────────
function createIntelMarker(cfg: typeof riskConfig[RiskKey], label: string): HTMLElement {
  const c = cfg.color;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:22px;height:22px;cursor:pointer;';

  // Pulse ring (only for critical/cyber/disaster)
  if (cfg.pulse) {
    const ring = document.createElement('div');
    ring.style.cssText = `
      position:absolute;inset:-5px;border-radius:50%;
      border:2px solid ${c};
      animation:ayn-pulse-ring 2.2s ease-out infinite;
      pointer-events:none;z-index:0;
    `;
    wrap.appendChild(ring);

    const ring2 = document.createElement('div');
    ring2.style.cssText = `
      position:absolute;inset:-5px;border-radius:50%;
      border:2px solid ${c};
      animation:ayn-pulse-ring 2s ease-out 0.6s infinite;
      pointer-events:none;z-index:0;
    `;
    wrap.appendChild(ring2);
  }

  // Core dot
  const dot = document.createElement('div');
  dot.style.cssText = `
    position:absolute;inset:0;border-radius:50%;z-index:1;
    background:radial-gradient(circle at 35% 30%, ${c}ff 0%, ${c}cc 40%, ${c}88 100%);
    border:2.5px solid ${c};
    box-shadow:0 0 0 3px ${c}33, 0 0 16px ${c}88, 0 0 32px ${c}44, 0 2px 8px rgba(0,0,0,0.8);
    display:flex;align-items:center;justify-content:center;
    font-size:10px;color:#fff;
    transition:transform 0.15s,box-shadow 0.15s;
  `;
  dot.textContent = cfg.icon;
  dot.onmouseenter = () => {
    dot.style.transform = 'scale(1.2)';
    dot.style.boxShadow = `0 0 0 4px ${c}55, 0 0 28px ${c}cc, 0 0 50px ${c}66, 0 4px 12px rgba(0,0,0,0.9)`;
  };
  dot.onmouseleave = () => {
    dot.style.transform = '';
    dot.style.boxShadow = `0 0 0 3px ${c}33, 0 0 16px ${c}88, 0 0 32px ${c}44, 0 2px 8px rgba(0,0,0,0.8)`;
  };
  wrap.appendChild(dot);

  // Label chip
  const chip = document.createElement('div');
  const short = label.length > 18 ? label.slice(0,17)+'…' : label;
  chip.style.cssText = `
    position:absolute;
    bottom:calc(100% + 4px);
    left:50%;transform:translateX(-50%);
    background:rgba(0,2,14,0.96);
    border:1px solid ${c}66;
    border-radius:5px;
    padding:2px 6px 1px;
    white-space:nowrap;
    font:700 7.5px/11px 'Courier New',monospace;
    color:${c};
    letter-spacing:0.06em;
    pointer-events:none;
    box-shadow:0 0 12px rgba(0,0,0,0.8),0 0 8px ${c}22;
    text-transform:uppercase;
    z-index:10;
  `;
  chip.textContent = short;
  wrap.appendChild(chip);

  return wrap;
}

function createFlightMarker(heading: number): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width:14px;height:14px;
    display:flex;align-items:center;justify-content:center;
    font-size:12px;color:#93c5fd;
    transform:rotate(${heading}deg);
    filter:drop-shadow(0 0 5px #3b82f6) drop-shadow(0 0 10px #1d4ed8);
    cursor:pointer;
    transition:filter 0.15s, transform 0.15s;
  `;
  el.textContent = '✈';
  el.onmouseenter = () => { el.style.filter = 'drop-shadow(0 0 8px #60a5fa) drop-shadow(0 0 16px #3b82f6)'; };
  el.onmouseleave = () => { el.style.filter = 'drop-shadow(0 0 5px #3b82f6) drop-shadow(0 0 10px #1d4ed8)'; };
  return el;
}

function createShipMarker(heading: number): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width:12px;height:12px;
    display:flex;align-items:center;justify-content:center;
    font-size:10px;color:#5eead4;
    transform:rotate(${heading}deg);
    filter:drop-shadow(0 0 4px #14b8a6) drop-shadow(0 0 8px #0d9488);
    cursor:pointer;
    transition:filter 0.15s;
  `;
  el.textContent = '▲';
  el.onmouseenter = () => { el.style.filter = 'drop-shadow(0 0 7px #2dd4bf) drop-shadow(0 0 14px #14b8a6)'; };
  el.onmouseleave = () => { el.style.filter = 'drop-shadow(0 0 4px #14b8a6) drop-shadow(0 0 8px #0d9488)'; };
  return el;
}

// ─── Popup HTML ───────────────────────────────────────────────────────────────
function intelPopupHtml(pt: MapPoint) {
  const cfg = riskConfig[pt.risk as RiskKey] ?? riskConfig.unknown;
  const c = cfg.color;
  return `
    <div style="background:${c}12;border-bottom:1px solid ${c}33;padding:14px 18px 10px;">
      <div style="font-size:12px;font-weight:900;color:${c};letter-spacing:0.1em;margin-bottom:3px">${cfg.icon} ${pt.label}</div>
      <div style="font-size:7.5px;color:${c}88;letter-spacing:0.15em">${cfg.label}${pt.category ? ' · '+pt.category.toUpperCase() : ''}</div>
    </div>
    ${pt.detail ? `<div style="padding:12px 18px 6px"><div style="font-size:9px;color:rgba(255,255,255,0.55);line-height:1.7;max-width:250px">${pt.detail.slice(0,200)}</div></div>` : ''}
    <div style="padding:6px 18px 12px;font-size:7.5px;color:rgba(255,255,255,0.2);font-family:monospace">
      ${pt.coordinates[1].toFixed(3)}° N · ${pt.coordinates[0].toFixed(3)}° E
    </div>`;
}

function flightPopupHtml(f: LiveFlight) {
  return `
    <div style="background:#1d4ed818;border-bottom:1px solid #3b82f633;padding:14px 18px 10px">
      <div style="font-size:12px;font-weight:900;color:#60a5fa;letter-spacing:0.1em">✈ ${f.callsign||'UNKNOWN'}</div>
      <div style="font-size:7.5px;color:#60a5fa88;letter-spacing:0.15em">LIVE AIRCRAFT</div>
    </div>
    <div style="padding:12px 18px">
      ${f.country?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:5px">🌍 ${f.country}</div>`:''}
      <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:5px">⬆ ${Math.round(f.altitude||0).toLocaleString()} m altitude</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:5px">⚡ ${Math.round((f.velocity||0)*1.94)} kts</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.5)">🧭 ${Math.round(f.heading||0)}° heading</div>
    </div>`;
}

function shipPopupHtml(s: LiveShip) {
  return `
    <div style="background:#0d947718;border-bottom:1px solid #14b8a633;padding:14px 18px 10px">
      <div style="font-size:12px;font-weight:900;color:#2dd4bf;letter-spacing:0.1em">⚓ ${s.name||'UNKNOWN'}</div>
      <div style="font-size:7.5px;color:#2dd4bf88;letter-spacing:0.15em">${shipLabel(s.ship_type).toUpperCase()} · LIVE VESSEL</div>
    </div>
    <div style="padding:12px 18px">
      ${s.destination?`<div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:5px">→ Dest: ${s.destination}</div>`:''}
      <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-bottom:5px">⚡ ${(s.speed||0).toFixed(1)} knots</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.5)">🧭 ${Math.round(s.heading||0)}° heading</div>
    </div>`;
}

// ─── Map style URL — free, no API key ─────────────────────────────────────────
// Uses OSM-based dark style from demotiles (public, no key)
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

// Better: use a free dark intelligence-grade style
const DARK_STYLE = {
  version: 8 as const,
  sources: {
    'carto-dark': {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: '© CartoDB © OpenStreetMap',
    },
  },
  layers: [{
    id: 'carto-dark',
    type: 'raster' as const,
    source: 'carto-dark',
    minzoom: 0, maxzoom: 22,
    paint: { 'raster-opacity': 0.92, 'raster-brightness-min': 0 },
  }],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
let uid = 0;

export function HeatMap2D({
  points = [], height = 380, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean;
  lastRefresh?: Date; ticker?: string[];
}) {
  const containerId   = useRef(`ayn-map-${++uid}`).current;
  const mapRef        = useRef<any>(null);
  const markersRef    = useRef<any[]>([]);
  const flightMkRef   = useRef<any[]>([]);
  const shipMkRef     = useRef<any[]>([]);
  const containerRef  = useRef<HTMLDivElement>(null);

  const [mapReady,    setMapReady]    = useState(false);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [flights,     setFlights]     = useState<LiveFlight[]>([]);
  const [ships,       setShips]       = useState<LiveShip[]>([]);
  const [showFlights, setShowFlights] = useState(true);
  const [showShips,   setShowShips]   = useState(true);
  const [flightCount, setFlightCount] = useState(0);
  const [shipCount,   setShipCount]   = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState<Date|null>(null);

  const layers: MapLayer[] = ['all','conflict','maritime','aviation','cyber','disasters'];

  // ── Init MapLibre ────────────────────────────────────────────────────────────
  useEffect(() => {
    injectStyles();
    let destroyed = false;

    import('maplibre-gl').then(({ Map, Marker, Popup, NavigationControl }) => {
      if (destroyed || mapRef.current) return;

      const map = new Map({
        container: containerId,
        style: DARK_STYLE as any,
        center: [15, 20],
        zoom: 2.2,
        minZoom: 1.5,
        maxZoom: 16,
        renderWorldCopies: false,
        antialias: true,
        fadeDuration: 200,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        if (!destroyed) setMapReady(true);
      });

      mapRef.current = map;
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // ── Filter intel ─────────────────────────────────────────────────────────────
  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category||'').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  // ── Render intel markers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import('maplibre-gl').then(({ Marker, Popup }) => {
      // Remove old markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      filteredPoints.forEach(pt => {
        const cfg = riskConfig[pt.risk as RiskKey] ?? riskConfig.unknown;
        const el = createIntelMarker(cfg, pt.label);

        const popup = new Popup({ closeButton: true, maxWidth: '320px', offset: [0,-20] })
          .setHTML(intelPopupHtml(pt));

        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([pt.coordinates[0], pt.coordinates[1]])
          .setPopup(popup)
          .addTo(mapRef.current);

        el.addEventListener('click', () => onPointClick?.(pt));
        markersRef.current.push(marker);
      });
    });
  }, [filteredPoints, mapReady, onPointClick]);

  // ── Render flight markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import('maplibre-gl').then(({ Marker, Popup }) => {
      flightMkRef.current.forEach(m => m.remove());
      flightMkRef.current = [];
      if (!showFlights) return;

      flights.forEach(f => {
        const el = createFlightMarker(f.heading);
        const popup = new Popup({ closeButton: true, maxWidth: '280px', offset: [0,-12] })
          .setHTML(flightPopupHtml(f));
        const m = new Marker({ element: el, anchor: 'center' })
          .setLngLat([f.lng, f.lat])
          .setPopup(popup)
          .addTo(mapRef.current);
        flightMkRef.current.push(m);
      });
    });
  }, [flights, showFlights, mapReady]);

  // ── Render ship markers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    import('maplibre-gl').then(({ Marker, Popup }) => {
      shipMkRef.current.forEach(m => m.remove());
      shipMkRef.current = [];
      if (!showShips) return;

      ships.forEach(s => {
        const el = createShipMarker(s.heading);
        const popup = new Popup({ closeButton: true, maxWidth: '280px', offset: [0,-12] })
          .setHTML(shipPopupHtml(s));
        const m = new Marker({ element: el, anchor: 'center' })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(mapRef.current);
        shipMkRef.current.push(m);
      });
    });
  }, [ships, showShips, mapReady]);

  // ── Fetch flights (browser-direct) ────────────────────────────────────────────
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
          if (pts.length >= 900) break;
        }
        setFlights(pts); setFlightCount(pts.length); setLastUpdate(new Date()); return;
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
    const st = setInterval(fetchShips,  90_000);
    return () => { clearInterval(ft); clearInterval(st); };
  }, [fetchFlights, fetchShips]);

  // ── UI helpers ────────────────────────────────────────────────────────────────
  const statPill = (label: string, value: string, color: string) => (
    <div key={label} style={{
      display:'flex', alignItems:'center', gap:7,
      background:'rgba(0,3,14,0.88)', border:`1px solid ${color}44`,
      borderRadius:8, padding:'5px 10px', backdropFilter:'blur(8px)',
    }}>
      <div style={{ width:2.5, height:18, borderRadius:2, background:color, boxShadow:`0 0 8px ${color}` }}/>
      <div>
        <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.3)', letterSpacing:'0.18em' }}>{label}</div>
        <div style={{ fontSize:14, fontFamily:'monospace', fontWeight:900, color, lineHeight:1.1 }}>{value}</div>
      </div>
    </div>
  );

  const layerBtn = (layer: MapLayer) => {
    const { icon, label, color } = LAYER_META[layer];
    const cnt = countLayer(points, layer);
    const active = activeLayer === layer;
    return (
      <button key={layer} onClick={() => setActiveLayer(layer)} style={{
        display:'flex', alignItems:'center', gap:5, padding:'5px 11px',
        borderRadius:99, cursor:'pointer', transition:'all 0.12s',
        background: active ? `${color}18` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? color+'55' : 'rgba(255,255,255,0.08)'}`,
        color: active ? color : 'rgba(255,255,255,0.3)',
        fontSize:7.5, fontFamily:'monospace', letterSpacing:'0.1em', whiteSpace:'nowrap',
      }}>
        <span style={{ fontSize:10 }}>{icon}</span>
        {label}
        <span style={{
          background: active ? `${color}22` : 'rgba(255,255,255,0.06)',
          color: active ? color : 'rgba(255,255,255,0.4)',
          padding:'1px 5px', borderRadius:4, fontSize:9, fontWeight:700,
        }}>{cnt}</span>
      </button>
    );
  };

  const trafficBtn = (type: 'flights'|'ships') => {
    const isF = type === 'flights';
    const on  = isF ? showFlights : showShips;
    const cnt = (isF ? flightCount : shipCount).toLocaleString();
    const col = isF ? '#60a5fa' : '#2dd4bf';
    const ico = isF ? '✈' : '⚓';
    const lbl = isF ? 'FLIGHTS' : 'SHIPS';
    return (
      <button key={type} onClick={() => isF ? setShowFlights(v=>!v) : setShowShips(v=>!v)} style={{
        display:'flex', alignItems:'center', gap:6, padding:'5px 11px',
        borderRadius:99, cursor:'pointer', transition:'all 0.12s',
        background: on ? `${col}18` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${on ? col+'55' : 'rgba(255,255,255,0.08)'}`,
        color: on ? col : 'rgba(255,255,255,0.3)',
        fontSize:7.5, fontFamily:'monospace', letterSpacing:'0.1em',
      }}>
        <span style={{ fontSize:12 }}>{ico}</span>
        {lbl}
        <span style={{
          background: on ? `${col}22` : 'rgba(255,255,255,0.06)',
          color: on ? col : 'rgba(255,255,255,0.4)',
          padding:'1px 6px', borderRadius:4, fontSize:9, fontWeight:700,
        }}>{cnt}</span>
      </button>
    );
  };

  return (
    <div style={{
      display:'flex', flexDirection:'column', width:'100%',
      borderRadius:16, overflow:'hidden',
      background:'#020b18',
      border:'1px solid rgba(0,255,200,0.12)',
      boxShadow:'0 0 80px rgba(0,0,0,0.8), 0 0 1px rgba(0,255,200,0.1)',
    }}>

      {/* ── Header ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 18px', borderBottom:'1px solid rgba(255,255,255,0.05)',
        background:'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)',
        flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', gap:6 }}>
            {[['#ef4444',true],['#eab308',false],['#22c55e',false]].map(([c,p],i)=>(
              <div key={i} style={{
                width:9,height:9,borderRadius:'50%',background:c as string,
                boxShadow: p?`0 0 8px ${c}`:undefined,
              }}/>
            ))}
          </div>
          <span style={{ fontSize:10.5, fontFamily:'monospace', fontWeight:900, color:'#00ffcc', letterSpacing:'0.22em' }}>
            AYN // WORLD THREAT MATRIX
          </span>
          <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.15)', letterSpacing:'0.1em' }}>
            LIVE INTEL · CLICK ANY SIGNAL FOR DETAILS
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.2)' }}>
            {filteredPoints.length} SIGNALS
          </span>
          {isLive && (
            <div style={{
              display:'flex', alignItems:'center', gap:6, padding:'3px 10px',
              borderRadius:99, border:'1px solid rgba(0,255,136,0.3)',
              background:'rgba(0,255,136,0.06)',
            }}>
              <div style={{
                width:7,height:7,borderRadius:'50%',background:'#22c55e',
                boxShadow:'0 0 6px #22c55e',animation:'ayn-ping 2s ease-in-out infinite',
              }}/>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'#4ade80', letterSpacing:'0.15em' }}>LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:6, flexWrap:'wrap',
        padding:'8px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)',
        background:'rgba(0,0,0,0.45)', flexShrink:0,
      }}>
        {trafficBtn('flights')}
        {trafficBtn('ships')}
        {showLayerToggle && (
          <>
            <div style={{ width:1,height:18,background:'rgba(255,255,255,0.1)',margin:'0 4px',flexShrink:0 }}/>
            {layers.map(layerBtn)}
          </>
        )}
        <div style={{ flex:1 }}/>
        {loading && (
          <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.2)' }}>
            updating traffic...
          </span>
        )}
        {lastUpdate && !loading && (
          <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.15)' }}>
            {Math.round((Date.now()-lastUpdate.getTime())/1000)}s ago
          </span>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ position:'relative', flex:1, height }}>
        {/* MapLibre container */}
        <div id={containerId} style={{ width:'100%', height:'100%' }}/>

        {/* Stats — compact top-right */}
        <div style={{
          position:'absolute', top:12, right:12, zIndex:10,
          display:'flex', flexDirection:'column', gap:5,
          pointerEvents:'none',
        }}>
          {showFlights && flightCount>0 && statPill('AIRCRAFT', flightCount.toLocaleString(), '#60a5fa')}
          {showShips   && shipCount>0   && statPill('VESSELS',  shipCount.toLocaleString(),  '#2dd4bf')}
          {countLayer(points,'conflict')>0 && statPill('CONFLICT', String(countLayer(points,'conflict')), '#ef4444')}
          {countLayer(points,'cyber')>0    && statPill('CYBER',    String(countLayer(points,'cyber')),    '#ec4899')}
        </div>

        {/* Legend — compact bottom-left */}
        <div style={{
          position:'absolute', bottom:36, left:12, zIndex:10,
          background:'rgba(0,2,14,0.92)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:10, padding:'9px 13px', backdropFilter:'blur(12px)',
          pointerEvents:'none',
        }}>
          <div style={{ fontSize:6, fontFamily:'monospace', color:'rgba(255,255,255,0.2)', letterSpacing:'0.18em', marginBottom:7 }}>SIGNAL KEY</div>
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as RiskKey[]).map(r => (
            <div key={r} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
              <div style={{ width:9,height:9,borderRadius:'50%',flexShrink:0,
                background:riskConfig[r].color,boxShadow:`0 0 6px ${riskConfig[r].color}` }}/>
              <span style={{ fontSize:7,fontFamily:'monospace',color:'rgba(255,255,255,0.4)',letterSpacing:'0.08em' }}>
                {riskConfig[r].icon} {riskConfig[r].label}
              </span>
            </div>
          ))}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:6, paddingTop:6, display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:12, color:'#93c5fd', filter:'drop-shadow(0 0 4px #3b82f6)' }}>✈</span>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.4)' }}>AIRCRAFT</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:11, color:'#5eead4', filter:'drop-shadow(0 0 4px #14b8a6)' }}>▲</span>
              <span style={{ fontSize:7, fontFamily:'monospace', color:'rgba(255,255,255,0.4)' }}>VESSEL</span>
            </div>
          </div>
        </div>

        {/* Loading overlay */}
        {!mapReady && (
          <div style={{
            position:'absolute', inset:0, zIndex:20, background:'#020b18',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16,
          }}>
            <div style={{
              width:50,height:50,borderRadius:'50%',
              border:'2px solid rgba(0,255,200,0.15)',
              borderTop:'2px solid #00ffcc',
              animation:'spin 0.8s linear infinite',
            }}/>
            <span style={{ fontFamily:'monospace', fontSize:10, color:'rgba(0,255,200,0.5)', letterSpacing:'0.2em' }}>
              LOADING INTELLIGENCE MAP...
            </span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </div>

      {/* ── Ticker ── */}
      {ticker.length > 0 && (
        <div style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'6px 18px', borderTop:'1px solid rgba(255,255,255,0.04)',
          background:'rgba(0,0,0,0.6)', flexShrink:0,
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
