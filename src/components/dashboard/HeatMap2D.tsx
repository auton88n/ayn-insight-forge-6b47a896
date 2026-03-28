import React, { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  trail?: [number, number][];
}

export type MapLayer = 'all' | 'conflict' | 'maritime' | 'aviation' | 'cyber' | 'disasters';

const LAYER_CATEGORIES: Record<MapLayer, string[]> = {
  all:       [],
  conflict:  ['Conflict', 'Military'],
  maritime:  ['Maritime', 'Supply Chain'],
  aviation:  ['Aviation'],
  cyber:     ['Cyber'],
  disasters: ['Disaster', 'Seismology', 'Wildfire'],
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

// 3D Globe using react-globe.gl
function Globe3D({ points, activeLayer, onPointClick }: {
  points: MapPoint[];
  activeLayer: MapLayer;
  onPointClick?: (pt: MapPoint) => void;
}) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [GlobeComp, setGlobeComp] = useState<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 460 });

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
      ctrl.autoRotateSpeed = 0.25;
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.1;
    }
    globeRef.current.pointOfView?.({ lat: 20, lng: 20, altitude: 1.8 }, 1200);
  }, [GlobeComp]);

  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  const globePoints = useMemo(() =>
    filteredPoints.map(p => ({
      lat: p.coordinates[1], lng: p.coordinates[0],
      size: (riskConfig[p.risk]?.size ?? 0.4) * 1.2,
      color: riskConfig[p.risk]?.color ?? '#00ffcc',
      label: p.label, detail: p.detail, risk: p.risk, _raw: p,
    })), [filteredPoints]);

  const arcData = useMemo(() => {
    const criticals = filteredPoints.filter(p => ['critical', 'cyber', 'high'].includes(p.risk));
    return criticals.slice(0, 10).map((src, i) => {
      const dst = filteredPoints[(i * 3 + 5) % Math.max(1, filteredPoints.length)];
      return dst && dst !== src ? {
        startLat: src.coordinates[1], startLng: src.coordinates[0],
        endLat: dst.coordinates[1],   endLng: dst.coordinates[0],
        color: [riskConfig[src.risk]?.color + 'cc', 'rgba(0,0,0,0)'],
      } : null;
    }).filter(Boolean);
  }, [filteredPoints]);

  if (!GlobeComp) return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-[9px] font-mono text-[#00ffcc]/40 animate-pulse tracking-[0.3em]">INITIALIZING 3D GLOBE...</div>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full h-full" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <GlobeComp
        ref={globeRef}
        width={dims.w}
        height={dims.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        atmosphereColor="#00ffcc"
        atmosphereAltitude={0.12}
        pointsData={globePoints}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointAltitude={0.008}
        pointRadius="size"
        pointResolution={12}
        pointLabel={(d: any) => `
          <div style="background:rgba(0,4,10,0.97);border:1px solid ${d.color}55;border-radius:10px;padding:10px 14px;font-family:'Courier New',monospace;max-width:240px;box-shadow:0 0 30px ${d.color}33,0 8px 32px rgba(0,0,0,0.8)">
            <div style="color:${d.color};font-size:11px;font-weight:900;letter-spacing:0.12em;margin-bottom:4px">${d.label}</div>
            <div style="color:rgba(255,255,255,0.45);font-size:8px;line-height:1.5">${(d.detail||'Intelligence monitoring active.').slice(0,130)}</div>
          </div>`}
        onPointClick={(d: any) => onPointClick?.(d._raw)}
        arcsData={arcData}
        arcStartLat="startLat" arcStartLng="startLng"
        arcEndLat="endLat"     arcEndLng="endLng"
        arcColor="color"
        arcDashLength={0.35}
        arcDashGap={0.15}
        arcDashAnimateTime={1800}
        arcStroke={0.3}
        arcAltitude={0.25}
      />
    </div>
  );
}

export function HeatMap2D({
  points = [], height = 500, onPointClick,
  showLayerToggle = false, isLive = false, lastRefresh, ticker = [],
}: {
  points?: MapPoint[]; height?: number; onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean; isLive?: boolean; lastRefresh?: Date; ticker?: string[];
}) {
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const layers: MapLayer[] = ['all', 'conflict', 'maritime', 'aviation', 'cyber', 'disasters'];

  return (
    <div className="w-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0,25,18,0.95) 0%, rgba(0,3,8,0.99) 70%)',
        border: '1px solid rgba(0,255,200,0.10)',
        boxShadow: '0 0 80px rgba(0,255,200,0.05), 0 0 200px rgba(0,0,0,0.9), inset 0 1px 0 rgba(0,255,200,0.06)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#00ffcc]/6"
        style={{ background: 'linear-gradient(90deg, rgba(0,255,200,0.03) 0%, transparent 50%)' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 items-center">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: '0 0 8px #ff2244' }} />
            <div className="w-2 h-2 rounded-full bg-yellow-400 opacity-60" />
            <div className="w-2 h-2 rounded-full bg-[#00ff88]" style={{ boxShadow: '0 0 6px #00ff88' }} />
          </div>
          <span className="text-[10px] font-mono font-black text-[#00ffcc] tracking-[0.22em]">AYN // WORLD THREAT MATRIX</span>
          <span className="text-[7px] font-mono text-white/15 tracking-widest">LIVE INTEL · 3D</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/20">{points.length} SIGNALS ACTIVE</span>
          {isLive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
              style={{ border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.06)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" style={{ boxShadow: '0 0 6px #00ff88' }} />
              <span className="text-[7px] font-mono text-[#00ff88] tracking-widest">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Layer tabs */}
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

      {/* Globe */}
      <div className="relative" style={{ height: `${height}px` }}>
        <div className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,3,8,0.75) 100%)' }} />
        {/* Corner brackets */}
        {[['top-2 left-2','border-t border-l'],['top-2 right-2','border-t border-r'],
          ['bottom-2 left-2','border-b border-l'],['bottom-2 right-2','border-b border-r']].map(([p,b],i)=>(
          <div key={i} className={`absolute w-5 h-5 border-[#00ffcc]/25 z-20 ${p} ${b}`} />
        ))}

        <Globe3D points={points} activeLayer={activeLayer} onPointClick={onPointClick} />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-20">
          <div className="bg-black/85 border border-white/8 rounded-xl px-3 py-2 space-y-1.5"
            style={{ backdropFilter: 'blur(16px)' }}>
            {(['critical','high','maritime','aviation','cyber','disaster'] as const).map(r => (
              <div key={r} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: riskConfig[r].color, boxShadow: `0 0 8px ${riskConfig[r].glow}` }} />
                <span className="text-[6.5px] font-mono text-white/30 uppercase tracking-widest">{riskConfig[r].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Signal counters */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
          {[
            { l:'CONFLICT', c: countLayer(points,'conflict'), col:'#ff2244' },
            { l:'MARITIME', c: countLayer(points,'maritime'), col:'#00ffcc' },
            { l:'CYBER',    c: countLayer(points,'cyber'),    col:'#ff00aa' },
            { l:'DISASTERS',c: countLayer(points,'disasters'),col:'#ff8800' },
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

      {/* Ticker */}
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
