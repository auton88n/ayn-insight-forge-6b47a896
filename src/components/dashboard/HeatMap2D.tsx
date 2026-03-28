import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────────────
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
  critical: { color: '#ff2244', label: 'CONFLICT',  size: 0.6, glow: 'rgba(255,34,68,0.9)',   pulse: true  },
  high:     { color: '#ff6600', label: 'HIGH RISK', size: 0.5, glow: 'rgba(255,102,0,0.8)',   pulse: true  },
  alert:    { color: '#ffcc00', label: 'ALERT',     size: 0.4, glow: 'rgba(255,204,0,0.7)',   pulse: false },
  stable:   { color: '#00ff88', label: 'STABLE',    size: 0.35,glow: 'rgba(0,255,136,0.6)',   pulse: false },
  satellite:{ color: '#cc88ff', label: 'SATELLITE', size: 0.35,glow: 'rgba(204,136,255,0.6)', pulse: false },
  unknown:  { color: '#00ccff', label: 'UNKNOWN',   size: 0.35,glow: 'rgba(0,204,255,0.6)',   pulse: false },
  aviation: { color: '#00aaff', label: 'AVIATION',  size: 0.4, glow: 'rgba(0,170,255,0.8)',   pulse: true  },
  maritime: { color: '#00ffcc', label: 'MARITIME',  size: 0.4, glow: 'rgba(0,255,204,0.8)',   pulse: false },
  cyber:    { color: '#ff00aa', label: 'CYBER',     size: 0.4, glow: 'rgba(255,0,170,0.8)',   pulse: true  },
  disaster: { color: '#ff8800', label: 'DISASTER',  size: 0.5, glow: 'rgba(255,136,0,0.8)',   pulse: true  },
} as const;

const LAYER_ICONS: Record<MapLayer, string> = {
  all: '◈', conflict: '⚔', maritime: '⚓', aviation: '✈', cyber: '⬡', disasters: '△',
};
const LAYER_LABELS: Record<MapLayer, string> = {
  all: 'ALL', conflict: 'CONFLICT', maritime: 'MARITIME',
  aviation: 'AVIATION', cyber: 'CYBER', disasters: 'DISASTERS',
};

function countLayer(points: MapPoint[], layer: MapLayer): number {
  if (layer === 'all') return points.length;
  const cats = LAYER_CATEGORIES[layer];
  return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase()))).length;
}

// Ship type → label
function shipTypeLabel(t: number): string {
  if (t >= 70 && t < 80) return 'Cargo';
  if (t >= 80 && t < 90) return 'Tanker';
  if (t >= 60 && t < 70) return 'Passenger';
  if (t >= 30 && t < 36) return 'Fishing';
  return 'Vessel';
}

// ─── Ticker ──────────────────────────────────────────────────────────────────
function ThreatTicker({ items }: { items: string[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOffset(o => o + 0.5), 16);
    return () => clearInterval(t);
  }, []);
  const totalText = items.join('   ·   ');
  const repeated = totalText + '   ·   ' + totalText;
  return (
    <div className="overflow-hidden whitespace-nowrap flex-1">
      <span className="inline-block text-[8px] font-mono text-white/35 tracking-widest"
        style={{ transform: `translateX(-${offset % (totalText.length * 5.6)}px)`, transition: 'none' }}>
        {repeated}
      </span>
    </div>
  );
}

// ─── 3D Globe ────────────────────────────────────────────────────────────────
function Globe3D({ points, activeLayer, onPointClick, flights, ships, showFlights, showShips }: {
  points: MapPoint[]; activeLayer: MapLayer;
  onPointClick?: (pt: MapPoint) => void;
  flights: LiveFlight[]; ships: LiveShip[];
  showFlights: boolean; showShips: boolean;
}) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [GlobeComp, setGlobeComp] = useState<any>(null);
  const [dims, setDims] = useState({ w: 900, h: 560 });

  useEffect(() => {
    // @ts-ignore
    import('react-globe.gl').then((m: any) => setGlobeComp(() => m.default || m));
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setDims({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    const ctrl = globeRef.current.controls?.();
    if (ctrl) {
      ctrl.autoRotate = true;
      ctrl.autoRotateSpeed = 0.18;
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.06;
    }
    globeRef.current.pointOfView?.({ lat: 22, lng: 15, altitude: 1.6 }, 1500);
  }, [GlobeComp]);

  // ── Filtered intel points
  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  // ── Intel points — large, clearly colored, altitude-raised rings
  const intelPoints = useMemo(() => filteredPoints.map(p => ({
    lat: p.coordinates[1], lng: p.coordinates[0],
    size: (riskConfig[p.risk]?.size ?? 0.4) * 2.0,  // 2x bigger
    color: riskConfig[p.risk]?.color ?? '#00ffcc',
    label: p.label,
    detail: p.detail,
    risk: p.risk,
    _type: 'intel',
    _raw: p,
  })), [filteredPoints]);

  // ── Threat arcs
  const arcData = useMemo(() => {
    const crits = filteredPoints.filter(p => ['critical', 'cyber', 'high'].includes(p.risk));
    return crits.slice(0, 12).map((src, i) => {
      const dst = filteredPoints[(i * 3 + 5) % Math.max(1, filteredPoints.length)];
      return dst && dst !== src ? {
        startLat: src.coordinates[1], startLng: src.coordinates[0],
        endLat: dst.coordinates[1],   endLng: dst.coordinates[0],
        color: [riskConfig[src.risk]?.color + 'ee', 'rgba(0,0,0,0)'],
      } : null;
    }).filter(Boolean);
  }, [filteredPoints]);

  // ── HTML elements for flights — actual ✈ icons
  const flightElements = useMemo(() => {
    if (!showFlights) return [];
    // Sample flights for performance (max 800 rendered as HTML)
    const sample = flights.length > 800 ? flights.filter((_, i) => i % Math.ceil(flights.length / 800) === 0) : flights;
    return sample.map(f => ({
      lat: f.lat, lng: f.lng,
      callsign: f.callsign,
      country: f.country,
      altitude_m: f.altitude,
      velocity: f.velocity,
      heading: f.heading,
      _type: 'flight',
    }));
  }, [flights, showFlights]);

  // ── HTML elements for ships — actual ⚓ icons
  const shipElements = useMemo(() => {
    if (!showShips) return [];
    return ships.map(s => ({
      lat: s.lat, lng: s.lng,
      name: s.name,
      speed_kts: s.speed,
      heading: s.heading,
      ship_type: s.ship_type,
      destination: s.destination,
      _type: 'ship',
    }));
  }, [ships, showShips]);

  // Combined HTML elements
  const htmlElements = useMemo(() => [...flightElements, ...shipElements], [flightElements, shipElements]);

  if (!GlobeComp) return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-[9px] font-mono text-[#00ffcc]/40 animate-pulse tracking-[0.3em]">
        INITIALIZING GLOBAL INTELLIGENCE FEED...
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full h-full"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <GlobeComp
        ref={globeRef}
        width={dims.w} height={dims.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#00ffcc"
        atmosphereAltitude={0.15}

        // ── Intel signal points — large glowing dots
        pointsData={intelPoints}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.02}
        pointRadius="size"
        pointResolution={16}
        pointsMerge={false}
        pointLabel={(d: any) => `
          <div style="background:rgba(0,4,12,0.97);border:1px solid ${d.color}66;border-radius:12px;padding:12px 16px;font-family:'Courier New',monospace;max-width:260px;box-shadow:0 0 30px ${d.color}44,0 8px 32px rgba(0,0,0,0.9)">
            <div style="color:${d.color};font-size:12px;font-weight:900;letter-spacing:0.12em;margin-bottom:5px">${d.label}</div>
            <div style="color:rgba(255,255,255,0.5);font-size:9px;line-height:1.5">${(d.detail || 'Intelligence monitoring active.').slice(0, 140)}</div>
            <div style="color:${d.color};font-size:8px;margin-top:6px;opacity:0.6">● ${(d.risk || '').toUpperCase()}</div>
          </div>`}
        onPointClick={(d: any) => { if (d._raw) onPointClick?.(d._raw); }}

        // ── Threat arcs
        arcsData={arcData}
        arcStartLat="startLat" arcStartLng="startLng"
        arcEndLat="endLat"     arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.4} arcDashGap={0.15}
        arcDashAnimateTime={1600}
        arcStroke={0.5} arcAltitude={0.3}

        // ── Live flights + ships as HTML icons
        htmlElementsData={htmlElements}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.005}
        htmlElement={(d: any) => {
          const el = document.createElement('div');
          if (d._type === 'flight') {
            el.style.cssText = `
              position:relative; cursor:pointer; transition:transform 0.2s;
              filter:drop-shadow(0 0 4px rgba(56,189,248,0.8));
            `;
            // Rotate icon to match heading
            el.innerHTML = `
              <div style="
                font-size:14px; line-height:1;
                transform:rotate(${d.heading || 0}deg);
                color:#38bdf8;
                text-shadow:0 0 8px #38bdf8, 0 0 16px #38bdf844;
              ">✈</div>
            `;
            el.title = `✈ ${d.callsign || 'Unknown'}
${d.country || ''}
Alt: ${Math.round(d.altitude_m || 0).toLocaleString()}m
${Math.round((d.velocity || 0) * 1.94)} kts · ${Math.round(d.heading || 0)}°`;
          } else {
            el.style.cssText = `
              position:relative; cursor:pointer;
              filter:drop-shadow(0 0 4px rgba(45,212,191,0.8));
            `;
            el.innerHTML = `
              <div style="
                font-size:13px; line-height:1;
                color:#2dd4bf;
                text-shadow:0 0 8px #2dd4bf, 0 0 16px #2dd4bf44;
              ">⚓</div>
            `;
            el.title = `⚓ ${d.name || 'Unknown Vessel'}
${shipTypeLabel(d.ship_type)} → ${d.destination || '?'}
${(d.speed_kts || 0).toFixed(1)} kts · ${Math.round(d.heading || 0)}°`;
          }

          // Hover expand
          el.onmouseenter = () => { el.style.transform = 'scale(1.8)'; el.style.zIndex = '999'; };
          el.onmouseleave = () => { el.style.transform = 'scale(1)'; el.style.zIndex = '1'; };
          return el;
        }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const SUPA_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';

export function HeatMap2D({
  points = [], height = 620, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number; onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean; lastRefresh?: Date; ticker?: string[];
}) {
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');

  // ── Live traffic state
  const [flights, setFlights]           = useState<LiveFlight[]>([]);
  const [ships, setShips]               = useState<LiveShip[]>([]);
  const [showFlights, setShowFlights]   = useState(true);
  const [showShips, setShowShips]       = useState(true);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficLastFetch, setTrafficLastFetch] = useState<Date | null>(null);
  const [flightCount, setFlightCount]   = useState(0);
  const [shipCount, setShipCount]       = useState(0);

  const layers: MapLayer[] = ['all', 'conflict', 'maritime', 'aviation', 'cyber', 'disasters'];

  const fetchTraffic = useCallback(async () => {
    setTrafficLoading(true);
    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/ayn-live-traffic?type=all`);
      if (res.ok) {
        const data = await res.json();
        if (data.flights) setFlights(data.flights);
        if (data.ships)   setShips(data.ships);
        setFlightCount(data.flight_count || 0);
        setShipCount(data.ship_count || 0);
        setTrafficLastFetch(new Date());
      }
    } catch (e) {
      console.warn('[traffic]', e);
    } finally {
      setTrafficLoading(false);
    }
  }, []);

  // Fetch on mount, then every 30s for flights
  useEffect(() => {
    fetchTraffic();
    const t = setInterval(fetchTraffic, 30_000);
    return () => clearInterval(t);
  }, [fetchTraffic]);

  return (
    <div className="w-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0,25,18,0.95) 0%, rgba(0,3,8,0.99) 70%)',
        border: '1px solid rgba(0,255,200,0.10)',
        boxShadow: '0 0 80px rgba(0,255,200,0.05), inset 0 1px 0 rgba(0,255,200,0.06)',
      }}>

      {/* ── Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#00ffcc]/6"
        style={{ background: 'linear-gradient(90deg, rgba(0,255,200,0.03) 0%, transparent 50%)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 items-center">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: '0 0 8px #ff2244' }} />
            <div className="w-2 h-2 rounded-full bg-yellow-400 opacity-60" />
            <div className="w-2 h-2 rounded-full bg-[#00ff88]" style={{ boxShadow: '0 0 6px #00ff88' }} />
          </div>
          <span className="text-[10px] font-mono font-black text-[#00ffcc] tracking-[0.22em]">
            AYN // WORLD THREAT MATRIX
          </span>
          <span className="text-[7px] font-mono text-white/15 tracking-widest">LIVE · 3D</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/20">{points.length} INTEL SIGNALS</span>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
              style={{ border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.06)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" style={{ boxShadow: '0 0 6px #00ff88' }} />
              <span className="text-[7px] font-mono text-[#00ff88] tracking-widest">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Live traffic controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/4 bg-black/40">
        {/* Flights toggle */}
        <button onClick={() => setShowFlights(v => !v)}
          className="flex items-center gap-2 px-3 py-1 rounded-full transition-all"
          style={{
            background: showFlights ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showFlights ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
          }}>
          <span className="text-[9px]">✈</span>
          <span className="text-[7px] font-mono font-bold" style={{ color: showFlights ? '#38bdf8' : 'rgba(255,255,255,0.3)' }}>
            LIVE FLIGHTS
          </span>
          <span className="text-[7px] font-mono font-black px-1.5 py-0.5 rounded-full"
            style={{ background: showFlights ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', color: showFlights ? '#38bdf8' : 'rgba(255,255,255,0.25)' }}>
            {flightCount.toLocaleString()}
          </span>
        </button>

        {/* Ships toggle */}
        <button onClick={() => setShowShips(v => !v)}
          className="flex items-center gap-2 px-3 py-1 rounded-full transition-all"
          style={{
            background: showShips ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showShips ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.08)'}`,
          }}>
          <span className="text-[9px]">⚓</span>
          <span className="text-[7px] font-mono font-bold" style={{ color: showShips ? '#2dd4bf' : 'rgba(255,255,255,0.3)' }}>
            LIVE SHIPS
          </span>
          <span className="text-[7px] font-mono font-black px-1.5 py-0.5 rounded-full"
            style={{ background: showShips ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.05)', color: showShips ? '#2dd4bf' : 'rgba(255,255,255,0.25)' }}>
            {shipCount.toLocaleString()}
          </span>
        </button>

        <div className="flex-1" />

        {/* Refresh status */}
        {trafficLoading ? (
          <div className="text-[7px] font-mono text-white/25 animate-pulse">fetching traffic...</div>
        ) : trafficLastFetch ? (
          <div className="text-[7px] font-mono text-white/20">
            traffic updated {Math.round((Date.now() - trafficLastFetch.getTime()) / 1000)}s ago
          </div>
        ) : null}

        <button onClick={fetchTraffic} disabled={trafficLoading}
          className="text-[7px] font-mono text-white/20 hover:text-white/50 transition-colors disabled:opacity-30">
          ↺ refresh
        </button>
      </div>

      {/* ── Intel layer tabs */}
      {showLayerToggle && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/4 bg-black/50 overflow-x-auto">
          {layers.map(layer => {
            const count = countLayer(points, layer);
            const active = activeLayer === layer;
            const danger = layer === 'conflict';
            return (
              <button key={layer} onClick={() => setActiveLayer(layer)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[7px] font-mono uppercase tracking-[0.12em] transition-all border whitespace-nowrap flex-shrink-0',
                  active
                    ? danger ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-[#00ffcc]/10 border-[#00ffcc]/35 text-[#00ffcc]'
                    : 'bg-white/2 border-white/6 text-white/25 hover:border-white/12 hover:text-white/40'
                )}>
                <span>{LAYER_ICONS[layer]}</span>
                {LAYER_LABELS[layer]}
                <span className={cn('text-[6px] px-1 py-0.5 rounded-full font-bold ml-0.5',
                  active ? (danger ? 'bg-red-500/20 text-red-400' : 'bg-[#00ffcc]/15 text-[#00ffcc]') : 'bg-white/5 text-white/20')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Globe */}
      <div className="relative" style={{ height: `${height}px` }}>
        <div className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,3,8,0.65) 100%)' }} />

        {/* Corner brackets */}
        {[['top-2 left-2','border-t border-l'],['top-2 right-2','border-t border-r'],
          ['bottom-2 left-2','border-b border-l'],['bottom-2 right-2','border-b border-r']].map(([p,b],i) => (
          <div key={i} className={`absolute w-5 h-5 border-[#00ffcc]/25 z-20 ${p} ${b}`} />
        ))}

        <Globe3D
          points={points} activeLayer={activeLayer} onPointClick={onPointClick}
          flights={flights} ships={ships}
          showFlights={showFlights} showShips={showShips}
        />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-20">
          <div className="bg-black/85 border border-white/8 rounded-xl px-3 py-2.5 space-y-1.5"
            style={{ backdropFilter: 'blur(16px)' }}>
            <div className="text-[6px] font-mono text-white/20 uppercase tracking-widest mb-1">Intel Signals</div>
            {(['critical','high','maritime','aviation','cyber','disaster'] as const).map(r => (
              <div key={r} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: riskConfig[r].color, boxShadow: `0 0 8px ${riskConfig[r].glow}` }} />
                <span className="text-[6.5px] font-mono text-white/30 uppercase tracking-widest">{riskConfig[r].label}</span>
              </div>
            ))}
            <div className="border-t border-white/6 pt-1.5 mt-1 space-y-1.5">
              <div className="text-[6px] font-mono text-white/20 uppercase tracking-widest">Live Traffic</div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
                <span className="text-[6.5px] font-mono text-white/30 tracking-widest">✈ AIRCRAFT</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#2dd4bf', boxShadow: '0 0 6px #2dd4bf' }} />
                <span className="text-[6.5px] font-mono text-white/30 tracking-widest">⚓ VESSELS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Signal counters */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
          {showFlights && flightCount > 0 && (
            <div className="flex items-center gap-2 bg-black/80 border border-white/8 rounded-lg px-2.5 py-1.5"
              style={{ backdropFilter: 'blur(12px)' }}>
              <div className="w-1 h-5 rounded-full" style={{ background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
              <div>
                <div className="text-[6px] font-mono text-white/25 tracking-widest">AIRCRAFT</div>
                <div className="text-[11px] font-mono font-black" style={{ color: '#38bdf8' }}>
                  {flightCount.toLocaleString()}
                </div>
              </div>
            </div>
          )}
          {showShips && shipCount > 0 && (
            <div className="flex items-center gap-2 bg-black/80 border border-white/8 rounded-lg px-2.5 py-1.5"
              style={{ backdropFilter: 'blur(12px)' }}>
              <div className="w-1 h-5 rounded-full" style={{ background: '#2dd4bf', boxShadow: '0 0 8px #2dd4bf' }} />
              <div>
                <div className="text-[6px] font-mono text-white/25 tracking-widest">VESSELS</div>
                <div className="text-[11px] font-mono font-black" style={{ color: '#2dd4bf' }}>
                  {shipCount.toLocaleString()}
                </div>
              </div>
            </div>
          )}
          {[
            { l:'CONFLICT', c: countLayer(points,'conflict'), col:'#ff2244' },
            { l:'CYBER',    c: countLayer(points,'cyber'),    col:'#ff00aa' },
          ].filter(s => s.c > 0).map(s => (
            <div key={s.l} className="flex items-center gap-2 bg-black/80 border border-white/8 rounded-lg px-2.5 py-1.5"
              style={{ backdropFilter: 'blur(12px)' }}>
              <div className="w-1 h-5 rounded-full" style={{ background: s.col, boxShadow: `0 0 8px ${s.col}` }} />
              <div>
                <div className="text-[6px] font-mono text-white/25 tracking-widest">{s.l}</div>
                <div className="text-[11px] font-mono font-black" style={{ color: s.col }}>{s.c}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ticker */}
      {ticker.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-white/4 bg-black/70">
          <span className="shrink-0 text-[6.5px] font-mono font-black text-red-400 tracking-widest border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
            ▶ FEED
          </span>
          <ThreatTicker items={ticker} />
        </div>
      )}
    </div>
  );
}
