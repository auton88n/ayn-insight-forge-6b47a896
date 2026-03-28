import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MapPoint {
  id?: string;
  coordinates: [number, number];
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
  critical: { color: '#ef4444', label: 'CONFLICT',  icon: '⚔', pulse: true  },
  high:     { color: '#f97316', label: 'HIGH RISK', icon: '⚠', pulse: true  },
  alert:    { color: '#eab308', label: 'ALERT',     icon: '!', pulse: false },
  stable:   { color: '#22c55e', label: 'STABLE',    icon: '●', pulse: false },
  satellite:{ color: '#a855f7', label: 'SATELLITE', icon: '◆', pulse: false },
  unknown:  { color: '#06b6d4', label: 'UNKNOWN',   icon: '?', pulse: false },
  aviation: { color: '#3b82f6', label: 'AVIATION',  icon: '✈', pulse: false },
  maritime: { color: '#14b8a6', label: 'MARITIME',  icon: '⚓', pulse: false },
  cyber:    { color: '#ec4899', label: 'CYBER',     icon: '⬡', pulse: true  },
  disaster: { color: '#f97316', label: 'DISASTER',  icon: '△', pulse: true  },
} as const;

const LAYER_ICONS: Record<MapLayer, string> = {
  all: '◈', conflict: '⚔', maritime: '⚓', aviation: '✈', cyber: '⬡', disasters: '△',
};

function countLayer(points: MapPoint[], layer: MapLayer): number {
  if (layer === 'all') return points.length;
  const cats = LAYER_CATEGORIES[layer];
  return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase()))).length;
}

function shipLabel(t: number) {
  if (t >= 70 && t < 80) return 'Cargo';
  if (t >= 80 && t < 90) return 'Tanker';
  if (t >= 60 && t < 70) return 'Passenger';
  return 'Vessel';
}

// ─── Projection helpers ───────────────────────────────────────────────────────
function project(lng: number, lat: number, w: number, h: number, zoom: number, panX: number, panY: number) {
  // Mercator-like equirectangular for speed
  const x = ((lng + 180) / 360) * w * zoom + panX;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (h / 2) - (w * zoom * mercN) / (2 * Math.PI) + panY;
  return { x, y };
}

function unproject(px: number, py: number, w: number, h: number, zoom: number, panX: number, panY: number) {
  const lng = ((px - panX) / (w * zoom)) * 360 - 180;
  const mercN = (((h / 2) - (py - panY)) * 2 * Math.PI) / (w * zoom);
  const lat = (2 * Math.atan(Math.exp(mercN)) - Math.PI / 2) * (180 / Math.PI);
  return { lng, lat };
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
        style={{ transform: `translateX(-${offset % (txt.length * 5.6)}px)`, transition: 'none' }}>
        {txt + '   ·   ' + txt}
      </span>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
interface TooltipData {
  x: number; y: number;
  type: 'intel' | 'flight' | 'ship';
  data: any;
}

function MapTooltip({ tip, w, h }: { tip: TooltipData; w: number; h: number }) {
  const TW = 220, TH = 90;
  const left = tip.x + TW + 20 > w ? tip.x - TW - 10 : tip.x + 14;
  const top  = tip.y + TH > h - 20  ? tip.y - TH - 8  : tip.y + 8;

  let color = '#06b6d4', title = '', lines: string[] = [];

  if (tip.type === 'intel') {
    const cfg = riskConfig[tip.data.risk as keyof typeof riskConfig] ?? riskConfig.unknown;
    color = cfg.color;
    title = tip.data.label;
    lines = [
      cfg.label,
      tip.data.category || '',
      tip.data.detail?.slice(0, 90) || 'Intelligence signal active',
    ].filter(Boolean);
  } else if (tip.type === 'flight') {
    color = '#60a5fa';
    title = `✈ ${tip.data.callsign || 'Unknown'}`;
    lines = [
      tip.data.country || '',
      `Alt: ${Math.round(tip.data.altitude || 0).toLocaleString()}m`,
      `${Math.round((tip.data.velocity || 0) * 1.94)} kts  ·  ${Math.round(tip.data.heading || 0)}°`,
    ].filter(Boolean);
  } else {
    color = '#2dd4bf';
    title = `⚓ ${tip.data.name || 'Unknown Vessel'}`;
    lines = [
      shipLabel(tip.data.ship_type),
      tip.data.destination ? `→ ${tip.data.destination}` : '',
      `${(tip.data.speed || 0).toFixed(1)} kts`,
    ].filter(Boolean);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.1 }}
      style={{
        position: 'absolute', left, top, zIndex: 50, pointerEvents: 'none',
        background: 'rgba(0,2,10,0.97)',
        border: `1px solid ${color}55`,
        borderRadius: 10,
        boxShadow: `0 0 24px ${color}33, 0 8px 32px rgba(0,0,0,0.8)`,
        padding: '10px 14px', minWidth: 170, maxWidth: TW,
      }}>
      <div style={{ color, fontFamily: 'monospace', fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', marginBottom: 5 }}>
        {title}
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5 }}>
          {l}
        </div>
      ))}
    </motion.div>
  );
}

// ─── Canvas Map ───────────────────────────────────────────────────────────────
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

interface WorldGeoJSON {
  type: string;
  features: any[];
}

function getSimulatedFlights(): LiveFlight[] {
  const corridors = [
    ...Array.from({length:18},(_,i)=>({lat:52+Math.random()*6, lng:-55+i*5,  hdg:88,  cs:'NAT'})),
    ...Array.from({length:25},(_,i)=>({lat:46+Math.random()*12,lng:-8+i*2.4, hdg:75+Math.random()*50,cs:'EUR'})),
    ...Array.from({length:18},(_,i)=>({lat:22+Math.random()*28,lng:100+i*4,  hdg:70+Math.random()*100,cs:'APX'})),
    ...Array.from({length:12},(_,i)=>({lat:22+Math.random()*18,lng:38+i*3,   hdg:85+Math.random()*80,cs:'MED'})),
    ...Array.from({length:18},(_,i)=>({lat:12+Math.random()*38,lng:-118+i*4.5,hdg:85+Math.random()*50,cs:'AMR'})),
    ...Array.from({length:12},(_,i)=>({lat:-18+Math.random()*36,lng:-8+i*4,  hdg:82+Math.random()*60,cs:'AFR'})),
    ...Array.from({length:14},(_,i)=>({lat:36+Math.random()*10,lng:-172+i*9, hdg:85,  cs:'PAC'})),
    ...Array.from({length:12},(_,i)=>({lat:-3+Math.random()*22, lng:98+i*3,  hdg:90+Math.random()*80,cs:'SEA'})),
  ];
  return corridors.map((c,i)=>({
    id:`s${i}`, callsign:`${c.cs}${100+i}`,
    lat:c.lat+(Math.random()-0.5)*1.5,
    lng:c.lng+(Math.random()-0.5)*1.5,
    altitude:9000+Math.random()*3000,
    velocity:220+Math.random()*80,
    heading:c.hdg+(Math.random()-0.5)*15,
    country:'',
  }));
}

export function HeatMap2D({
  points = [], height = 600, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean;
  lastRefresh?: Date; ticker?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1200);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);
  const [tick, setTick] = useState(0);

  // Live traffic
  const [flights, setFlights] = useState<LiveFlight[]>([]);
  const [ships, setShips]     = useState<LiveShip[]>([]);
  const [showFlights, setShowFlights] = useState(true);
  const [showShips, setShowShips]     = useState(true);
  const [flightCount, setFlightCount] = useState(0);
  const [shipCount, setShipCount]     = useState(0);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficTime, setTrafficTime] = useState<Date | null>(null);

  const layers: MapLayer[] = ['all', 'conflict', 'maritime', 'aviation', 'cyber', 'disasters'];

  // Observe width
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(Math.floor(e[0].contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Pulse tick
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 900);
    return () => clearInterval(t);
  }, []);

  // Load world GeoJSON once
  useEffect(() => {
    import('topojson-client' as any).then(topo => {
      fetch(GEO_URL).then(r => r.json()).then(world => {
        const feat = (topo as any).feature(world, world.objects.countries);
        setGeoFeatures(feat.features);
      });
    }).catch(() => {
      // fallback: load without topojson
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(r => r.json())
        .catch(() => null);
    });
  }, []);

  // Load geo with d3-geo
  const [pathMaker, setPathMaker] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      import('d3-geo' as any),
      import('topojson-client' as any),
    ]).then(([d3geo, topo]) => {
      fetch(GEO_URL).then(r=>r.json()).then(world => {
        const features = (topo as any).feature(world, world.objects.countries).features;
        setGeoFeatures(features);
      });
    }).catch(console.error);
  }, []);

  // Fetch flights from browser (bypasses OpenSky server IP block)
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
          if (!s[6] || !s[5] || s[8]) continue;
          const cs = (s[1] || '').trim();
          if (!cs) continue;
          pts.push({ id:s[0], callsign:cs, lat:+s[6], lng:+s[5],
            altitude:+(s[7]||0), velocity:+(s[9]||0), heading:+(s[10]||0), country:s[2]||'' });
          if (pts.length >= 1200) break;
        }
        setFlights(pts); setFlightCount(pts.length);
        setTrafficTime(new Date());
        return;
      }
    } catch {}
    const sim = getSimulatedFlights();
    setFlights(sim); setFlightCount(sim.length);
    setTrafficTime(new Date());
  }, []);

  const fetchShipsDirect = useCallback(async () => {
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
    Promise.all([fetchFlights(), fetchShipsDirect()]).finally(() => setTrafficLoading(false));
    const ft = setInterval(fetchFlights, 15_000);
    const st = setInterval(fetchShipsDirect, 90_000);
    return () => { clearInterval(ft); clearInterval(st); };
  }, [fetchFlights, fetchShipsDirect]);

  // Filtered intel points
  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category||'').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  // ─── DRAW ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const H = height;
    canvas.width = w; canvas.height = H;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#030c18');
    bg.addColorStop(1, '#020810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,255,200,0.04)';
    ctx.lineWidth = 0.5;
    for (let lat = -80; lat <= 80; lat += 20) {
      const p1 = project(-180, lat, w, H, zoom, pan.x, pan.y);
      const p2 = project(180, lat, w, H, zoom, pan.x, pan.y);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let lng = -180; lng <= 180; lng += 30) {
      const p1 = project(lng, 80, w, H, zoom, pan.x, pan.y);
      const p2 = project(lng, -80, w, H, zoom, pan.x, pan.y);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // Country fills — simple polygon render without d3
    if (geoFeatures.length > 0) {
      for (const feature of geoFeatures) {
        const geom = feature.geometry;
        if (!geom) continue;

        const drawRing = (coords: number[][]) => {
          if (!coords.length) return;
          const p0 = project(coords[0][0], coords[0][1], w, H, zoom, pan.x, pan.y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < coords.length; i++) {
            const p = project(coords[i][0], coords[i][1], w, H, zoom, pan.x, pan.y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
        };

        ctx.beginPath();
        if (geom.type === 'Polygon') {
          for (const ring of geom.coordinates) drawRing(ring);
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates)
            for (const ring of poly) drawRing(ring);
        }
        ctx.fillStyle = 'rgba(0,255,200,0.055)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,200,0.22)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    } else {
      // Fallback: ocean color with continent outlines hint
      ctx.fillStyle = 'rgba(0,255,200,0.015)';
      ctx.fillRect(0, 0, w, H);
    }

    // Equator highlight
    const eq = project(0, 0, w, H, zoom, pan.x, pan.y);
    ctx.strokeStyle = 'rgba(0,255,200,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(project(-180, 0, w, H, zoom, pan.x, pan.y).x, eq.y);
    ctx.lineTo(project(180, 0, w, H, zoom, pan.x, pan.y).x, eq.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Live Ships
    if (showShips) {
      for (const ship of ships) {
        const { x, y } = project(ship.lng, ship.lat, w, H, zoom, pan.x, pan.y);
        if (x < -10 || x > w + 10 || y < -10 || y > H + 10) continue;
        // Draw ship as teal triangle
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((ship.heading * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(-3.5, 4); ctx.closePath();
        ctx.fillStyle = '#2dd4bf';
        ctx.shadowColor = '#2dd4bf'; ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Live Flights
    if (showFlights) {
      for (const f of flights) {
        const { x, y } = project(f.lng, f.lat, w, H, zoom, pan.x, pan.y);
        if (x < -10 || x > w + 10 || y < -10 || y > H + 10) continue;
        // Draw flight as blue arrow
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((f.heading * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(2.5, 2); ctx.lineTo(0, 0); ctx.lineTo(-2.5, 2);
        ctx.closePath();
        ctx.fillStyle = '#60a5fa';
        ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 5;
        ctx.fill();
        ctx.restore();
      }
    }

    // ── Intel signals — fully labeled markers
    for (const pt of filteredPoints) {
      const { x, y } = project(pt.coordinates[0], pt.coordinates[1], w, H, zoom, pan.x, pan.y);
      if (x < -20 || x > w + 20 || y < -20 || y > H + 20) continue;
      const cfg = riskConfig[pt.risk] ?? riskConfig.unknown;
      const isPulsing = cfg.pulse && tick % 2 === 0;
      const r = 7;

      // Pulse ring
      if (isPulsing) {
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = cfg.color + '22';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = cfg.color + '33';
        ctx.fill();
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color + '44';
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Icon inside dot
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.icon, x, y);

      // ── Label (always shown — the key fix)
      const label = pt.label.length > 18 ? pt.label.slice(0, 17) + '…' : pt.label;
      const labelY = y - r - 4;

      // Label background
      ctx.font = 'bold 9px monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,2,10,0.88)';
      ctx.beginPath();
      // rounded rect
      const lx = x - tw/2 - 4, ly = labelY - 9, lw = tw + 8, lh = 13;
      ctx.roundRect(lx, ly, lw, lh, 3);
      ctx.fill();

      // Label border
      ctx.strokeStyle = cfg.color + '66';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Label text
      ctx.fillStyle = cfg.color;
      ctx.fillText(label, x, labelY - 2);

      // Risk badge
      ctx.font = '7px monospace';
      ctx.fillStyle = cfg.color + 'aa';
      ctx.fillText(cfg.label, x, labelY + 9);
    }

    // ── Flight callsign labels (only when zoomed in)
    if (zoom >= 2 && showFlights) {
      for (const f of flights) {
        const { x, y } = project(f.lng, f.lat, w, H, zoom, pan.x, pan.y);
        if (x < 0 || x > w || y < 0 || y > H) continue;
        ctx.font = '7px monospace';
        ctx.fillStyle = '#93c5fd';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(f.callsign, x, y + 8);
      }
    }

    // ── Ship name labels (only when zoomed in)
    if (zoom >= 2.5 && showShips) {
      for (const s of ships) {
        const { x, y } = project(s.lng, s.lat, w, H, zoom, pan.x, pan.y);
        if (x < 0 || x > w || y < 0 || y > H) continue;
        ctx.font = '7px monospace';
        ctx.fillStyle = '#5eead4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(s.name.slice(0, 12), x, y + 8);
      }
    }

    // Vignette
    const vig = ctx.createRadialGradient(w/2, H/2, H*0.3, w/2, H/2, H*0.8);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,2,10,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, H);

  }, [w, height, zoom, pan, geoFeatures, filteredPoints, flights, ships, showFlights, showShips, tick]);

  // ─── Mouse: drag to pan ───────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setTooltip(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      setPan({
        x: dragStart.current.px + (e.clientX - dragStart.current.x),
        y: dragStart.current.py + (e.clientY - dragStart.current.y),
      });
      return;
    }

    // Hit-test for tooltip
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check intel points first
    for (const pt of filteredPoints) {
      const { x, y } = project(pt.coordinates[0], pt.coordinates[1], w, height, zoom, pan.x, pan.y);
      if (Math.hypot(mx - x, my - y) < 12) {
        setTooltip({ x: mx, y: my, type: 'intel', data: pt });
        return;
      }
    }
    // Check flights
    if (showFlights) {
      for (const f of flights) {
        const { x, y } = project(f.lng, f.lat, w, height, zoom, pan.x, pan.y);
        if (Math.hypot(mx - x, my - y) < 8) {
          setTooltip({ x: mx, y: my, type: 'flight', data: f });
          return;
        }
      }
    }
    // Check ships
    if (showShips) {
      for (const s of ships) {
        const { x, y } = project(s.lng, s.lat, w, height, zoom, pan.x, pan.y);
        if (Math.hypot(mx - x, my - y) < 8) {
          setTooltip({ x: mx, y: my, type: 'ship', data: s });
          return;
        }
      }
    }
    setTooltip(null);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    const moved = Math.abs(e.clientX - dragStart.current.x) > 3 || Math.abs(e.clientY - dragStart.current.y) > 3;
    dragging.current = false;
    if (!moved) {
      // click — check intel points
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const pt of filteredPoints) {
        const { x, y } = project(pt.coordinates[0], pt.coordinates[1], w, height, zoom, pan.x, pan.y);
        if (Math.hypot(mx - x, my - y) < 12) { onPointClick?.(pt); return; }
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.6, Math.min(8, zoom * factor));
    // Zoom toward cursor
    setPan(p => ({
      x: mx - (mx - p.x) * (newZoom / zoom),
      y: my - (my - p.y) * (newZoom / zoom),
    }));
    setZoom(newZoom);
  };

  const resetView = () => { setZoom(1.0); setPan({ x: 0, y: 0 }); };

  return (
    <div className="w-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#020810',
        border: '1px solid rgba(0,255,200,0.12)',
        boxShadow: '0 0 60px rgba(0,255,200,0.04)',
      }}>

      {/* ── Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/6"
        style={{ background: 'linear-gradient(90deg,rgba(0,255,200,0.04),transparent)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: '0 0 8px #ef4444' }} />
            <div className="w-2 h-2 rounded-full bg-yellow-400 opacity-50" />
            <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #22c55e' }} />
          </div>
          <span className="text-[10px] font-mono font-black text-[#00ffcc] tracking-[0.22em]">AYN // WORLD THREAT MATRIX</span>
          <span className="text-[7px] font-mono text-white/15">LIVE INTEL · SCROLL TO ZOOM · DRAG TO PAN</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/20">{filteredPoints.length} INTEL</span>
          <button onClick={resetView} className="text-[7px] font-mono text-white/25 hover:text-white/60 transition-colors">⊙ RESET</button>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
              style={{ border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.06)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[7px] font-mono text-emerald-400 tracking-widest">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Traffic + layer controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/4 bg-black/40 flex-wrap">
        {/* Flight toggle */}
        <button onClick={() => setShowFlights(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[7px] font-mono"
          style={{
            background: showFlights ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showFlights ? 'rgba(96,165,250,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: showFlights ? '#93c5fd' : 'rgba(255,255,255,0.3)',
          }}>
          ✈ FLIGHTS
          <span className="font-black px-1 py-0.5 rounded" style={{ background: showFlights ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)' }}>
            {flightCount.toLocaleString()}
          </span>
        </button>

        {/* Ship toggle */}
        <button onClick={() => setShowShips(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[7px] font-mono"
          style={{
            background: showShips ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showShips ? 'rgba(45,212,191,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: showShips ? '#5eead4' : 'rgba(255,255,255,0.3)',
          }}>
          ⚓ SHIPS
          <span className="font-black px-1 py-0.5 rounded" style={{ background: showShips ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.05)' }}>
            {shipCount.toLocaleString()}
          </span>
        </button>

        <div className="w-px h-4 bg-white/10" />

        {/* Layer tabs */}
        {showLayerToggle && layers.map(layer => {
          const cnt = countLayer(points, layer);
          const active = activeLayer === layer;
          return (
            <button key={layer} onClick={() => setActiveLayer(layer)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[7px] font-mono uppercase tracking-wide transition-all border"
              style={{
                background: active ? 'rgba(0,255,200,0.1)' : 'rgba(255,255,255,0.02)',
                borderColor: active ? 'rgba(0,255,200,0.4)' : 'rgba(255,255,255,0.06)',
                color: active ? '#00ffcc' : 'rgba(255,255,255,0.3)',
              }}>
              {LAYER_ICONS[layer]} {layer === 'all' ? 'ALL' : layer.toUpperCase()}
              <span style={{ background: active ? 'rgba(0,255,200,0.15)' : 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: 4 }}>
                {cnt}
              </span>
            </button>
          );
        })}

        <div className="flex-1" />
        {trafficLoading && <span className="text-[7px] font-mono text-white/20 animate-pulse">fetching...</span>}
        {trafficTime && !trafficLoading && (
          <span className="text-[7px] font-mono text-white/15">
            {Math.round((Date.now() - trafficTime.getTime()) / 1000)}s ago
          </span>
        )}
      </div>

      {/* ── Map canvas */}
      <div ref={containerRef} className="relative w-full" style={{ height, cursor: dragging.current ? 'grabbing' : 'crosshair' }}>
        <canvas ref={canvasRef} width={w} height={height}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={() => { dragging.current = false; setTooltip(null); }}
          onWheel={onWheel}
          style={{ display: 'block', width: '100%', height }} />

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-20">
          <button onClick={() => setZoom(z => Math.min(8, z * 1.3))}
            className="w-7 h-7 rounded-lg text-[12px] flex items-center justify-center transition-all font-bold"
            style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(0,255,200,0.2)', color: '#00ffcc' }}>+</button>
          <button onClick={() => setZoom(z => Math.max(0.6, z * 0.77))}
            className="w-7 h-7 rounded-lg text-[12px] flex items-center justify-center transition-all font-bold"
            style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(0,255,200,0.2)', color: '#00ffcc' }}>−</button>
          <button onClick={resetView}
            className="w-7 h-7 rounded-lg text-[9px] flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(0,255,200,0.12)', color: 'rgba(0,255,200,0.6)' }}>⊙</button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-20"
          style={{ background: 'rgba(0,2,10,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 14px', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: 6, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em', marginBottom: 6 }}>INTEL SIGNALS</div>
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as const).map(r => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: riskConfig[r].color, boxShadow: `0 0 6px ${riskConfig[r].color}` }} />
              <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>{riskConfig[r].icon} {riskConfig[r].label}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 6, paddingTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '8px solid #60a5fa' }} />
              <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>✈ AIRCRAFT</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '8px solid #2dd4bf' }} />
              <span style={{ fontSize: 7, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>⚓ VESSELS</span>
            </div>
          </div>
        </div>

        {/* Signal counters top-right */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
          {showFlights && flightCount > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: '#60a5fa', boxShadow: '0 0 8px #60a5fa' }} />
              <div>
                <div style={{ fontSize: 6, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}>AIRCRAFT</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 900, color: '#93c5fd' }}>{flightCount.toLocaleString()}</div>
              </div>
            </div>
          )}
          {showShips && shipCount > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(45,212,191,0.3)', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: '#2dd4bf', boxShadow: '0 0 8px #2dd4bf' }} />
              <div>
                <div style={{ fontSize: 6, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}>VESSELS</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 900, color: '#5eead4' }}>{shipCount.toLocaleString()}</div>
              </div>
            </div>
          )}
          {countLayer(points,'conflict') > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 20, borderRadius: 2, background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
              <div>
                <div style={{ fontSize: 6, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em' }}>CONFLICT</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 900, color: '#fca5a5' }}>{countLayer(points,'conflict')}</div>
              </div>
            </div>
          )}
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {tooltip && <MapTooltip tip={tooltip} w={w} h={height} />}
        </AnimatePresence>
      </div>

      {/* ── Ticker */}
      {ticker.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/4 bg-black/60">
          <span className="shrink-0 text-[6.5px] font-mono font-black text-red-400 tracking-widest border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
            ▶ FEED
          </span>
          <ThreatTicker items={ticker} />
        </div>
      )}
    </div>
  );
}
