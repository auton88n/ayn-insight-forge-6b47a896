import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  critical: { color: '#ff2244', label: 'CONFLICT',   size: 5.5, glow: 'rgba(255,34,68,0.7)',   pulse: true  },
  high:     { color: '#ff6600', label: 'HIGH RISK',  size: 4.5, glow: 'rgba(255,102,0,0.6)',   pulse: true  },
  alert:    { color: '#ffcc00', label: 'ALERT',      size: 3.5, glow: 'rgba(255,204,0,0.5)',   pulse: false },
  stable:   { color: '#00ff88', label: 'STABLE',     size: 3.0, glow: 'rgba(0,255,136,0.4)',   pulse: false },
  satellite:{ color: '#cc88ff', label: 'SATELLITE',  size: 3.0, glow: 'rgba(204,136,255,0.4)', pulse: false },
  unknown:  { color: '#00ccff', label: 'UNKNOWN',    size: 3.0, glow: 'rgba(0,204,255,0.4)',   pulse: false },
  aviation: { color: '#00aaff', label: 'AVIATION',   size: 4.0, glow: 'rgba(0,170,255,0.6)',   pulse: true  },
  maritime: { color: '#00ffcc', label: 'MARITIME',   size: 4.0, glow: 'rgba(0,255,204,0.6)',   pulse: false },
  cyber:    { color: '#ff00aa', label: 'CYBER',      size: 3.5, glow: 'rgba(255,0,170,0.6)',   pulse: true  },
  disaster: { color: '#ff8800', label: 'DISASTER',   size: 4.5, glow: 'rgba(255,136,0,0.6)',   pulse: true  },
} as const;

const LAYER_ICONS: Record<MapLayer, string> = {
  all: '◈', conflict: '⚔', maritime: '⚓', aviation: '✈', cyber: '⬡', disasters: '△',
};
const LAYER_LABELS: Record<MapLayer, string> = {
  all: 'ALL SIGNALS', conflict: 'CONFLICT', maritime: 'MARITIME',
  aviation: 'AVIATION', cyber: 'CYBER', disasters: 'DISASTERS',
};

// Count per layer
function countLayer(points: MapPoint[], layer: MapLayer): number {
  if (layer === 'all') return points.length;
  const cats = LAYER_CATEGORIES[layer];
  return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase()))).length;
}

// Ticker component
function ThreatTicker({ items }: { items: string[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOffset(o => o + 1), 40);
    return () => clearInterval(t);
  }, []);
  const totalText = items.join('   ·   ');
  const repeated = totalText + '   ·   ' + totalText;
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <span
        className="inline-block text-[8px] font-mono text-white/30 tracking-widest"
        style={{ transform: `translateX(-${offset % (totalText.length * 5.6)}px)`, transition: 'none' }}
      >
        {repeated}
      </span>
    </div>
  );
}

// Scanning line animation
function ScanLine() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <motion.div
        className="absolute inset-x-0 h-[1px] opacity-20"
        style={{ background: 'linear-gradient(90deg, transparent, #00ffcc, transparent)' }}
        animate={{ y: ['0%', '100%', '0%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

// Radar sweep overlay
function RadarSweep() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      <motion.div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0,255,200,0.3) 15deg, transparent 60deg)',
          transformOrigin: '50% 50%',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

export function HeatMap2D({
  points = [],
  height = 460,
  onPointClick,
  showLayerToggle = false,
  isLive = false,
  lastRefresh,
  ticker = [],
}: {
  points?: MapPoint[];
  height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean;
  isLive?: boolean;
  lastRefresh?: Date;
  ticker?: string[];
}) {
  const [activeTooltip, setActiveTooltip] = useState<MapPoint | null>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');
  const [tick, setTick] = useState(0);

  // Blink counter for pulsing signals
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1200);
    return () => clearInterval(t);
  }, []);

  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  const layers: MapLayer[] = ['all', 'conflict', 'maritime', 'aviation', 'cyber', 'disasters'];

  return (
    <div className="w-full flex flex-col bg-[#020508] border border-[#00ffcc]/10 rounded-lg overflow-hidden"
         style={{ boxShadow: '0 0 40px rgba(0,255,200,0.04), inset 0 0 80px rgba(0,10,20,0.8)' }}>

      {/* ── Header row */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#00ffcc]/8 bg-[#000]/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
            <div className="w-1 h-1 rounded-full bg-yellow-500" />
            <div className="w-1 h-1 rounded-full bg-green-500" />
          </div>
          <span className="text-[9px] font-mono font-bold text-[#00ffcc] tracking-[0.3em]">
            AYN // GLOBAL THREAT MATRIX
          </span>
          <span className="text-[7px] font-mono text-white/20 tracking-widest">v4.1 · CLASSIFIED</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[7px] font-mono text-white/20">{filteredPoints.length} SIGNALS ACTIVE</span>
          {isLive && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[7px] font-mono text-emerald-400 tracking-widest">LIVE FEED</span>
              {lastRefresh && (
                <span className="text-[6px] font-mono text-white/20">
                  {Math.round((Date.now() - lastRefresh.getTime()) / 60000)}m
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Layer toggle */}
      {showLayerToggle && (
        <div className="flex items-center gap-1 px-2.5 py-1.5 bg-black/40 border-b border-white/4 flex-wrap">
          {layers.map(layer => {
            const count = countLayer(points, layer);
            const active = activeLayer === layer;
            return (
              <button
                key={layer}
                onClick={() => setActiveLayer(layer)}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-[7px] font-mono uppercase tracking-[0.1em] transition-all border',
                  active
                    ? 'bg-[#00ffcc]/15 border-[#00ffcc]/40 text-[#00ffcc]'
                    : 'bg-white/2 border-white/8 text-white/25 hover:border-white/15 hover:text-white/40'
                )}
              >
                <span className="text-[8px]">{LAYER_ICONS[layer]}</span>
                <span>{LAYER_LABELS[layer]}</span>
                <span className={cn(
                  'ml-0.5 text-[6px] px-1 py-0.5 rounded-full',
                  active ? 'bg-[#00ffcc]/20 text-[#00ffcc]' : 'bg-white/5 text-white/20'
                )}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Map canvas */}
      <div className="relative" style={{ height: `${height}px` }}>
        {/* Backgrounds */}
        <div className="absolute inset-0 bg-[#020a0f]" />
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(0,255,200,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,200,0.4) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(0,255,200,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,200,0.2) 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
        <ScanLine />
        <RadarSweep />
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 140, center: [20, 15] }}
          style={{ width: '100%', height: '100%', position: 'relative', zIndex: 5 }}
        >
          <defs>
            <marker id="arrowHead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
              <path d="M0,0 L0,4 L4,2 z" fill="rgba(0,255,200,0.6)" />
            </marker>
            <filter id="glow-red">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-soft">
              <feGaussianBlur stdDeviation="2" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(0, 255, 200, 0.04)"
                  stroke="rgba(0, 255, 200, 0.18)"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover:   { fill: 'rgba(0,255,200,0.12)', outline: 'none', stroke: 'rgba(0,255,200,0.4)' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {filteredPoints.map((point, index) => {
            const cfg = riskConfig[point.risk] ?? riskConfig.unknown;
            const isPulsing = cfg.pulse && (tick % 2 === index % 2);
            return (
              <Marker
                key={`${point.id ?? index}`}
                coordinates={point.coordinates}
                onMouseEnter={() => setActiveTooltip(point)}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={() => onPointClick?.(point)}
              >
                <g className={cn('group', onPointClick && 'cursor-pointer')} style={{ filter: `url(#glow-${point.risk === 'critical' || point.risk === 'high' ? 'red' : 'soft'})` }}>
                  {/* Movement heading arrow */}
                  {point.heading !== undefined && (() => {
                    const rad = (point.heading * Math.PI) / 180;
                    const dx = Math.sin(rad) * 10; const dy = -Math.cos(rad) * 10;
                    return <line x1={0} y1={0} x2={dx} y2={dy} stroke={cfg.color} strokeWidth={1.5} strokeOpacity={0.7} />;
                  })()}
                  {/* Outer pulse ring */}
                  <circle r={cfg.size * 3.5} fill={cfg.color} opacity={isPulsing ? 0.08 : 0.04} className="transition-opacity duration-700" />
                  {/* Mid ring */}
                  <circle r={cfg.size * 2} fill={cfg.color} opacity={0.15} className="group-hover:opacity-25 transition-opacity" />
                  {/* Core */}
                  <circle r={cfg.size} fill={cfg.color} opacity={0.95} style={{ filter: `drop-shadow(0 0 6px ${cfg.glow})` }} />
                  {/* Label */}
                  <text
                    textAnchor="middle"
                    y={-(cfg.size + 7)}
                    style={{
                      fontFamily: '"Courier New", monospace',
                      fontSize: '6px',
                      fill: cfg.color,
                      fontWeight: 'bold',
                      userSelect: 'none',
                      letterSpacing: '0.08em',
                      textShadow: `0 0 8px ${cfg.glow}`,
                    }}
                    className="opacity-65 group-hover:opacity-100 transition-opacity"
                  >
                    {point.label}
                  </text>
                </g>
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 bg-black/80 border border-white/8 rounded px-2.5 py-1.5 z-20 max-w-[340px]">
          {(['critical','high','alert','maritime','aviation','cyber','disaster'] as const).map(r => (
            <div key={r} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: riskConfig[r].color, boxShadow: `0 0 4px ${riskConfig[r].glow}` }} />
              <span className="text-[6.5px] font-mono text-white/35 uppercase tracking-widest">{riskConfig[r].label}</span>
            </div>
          ))}
        </div>

        {/* Corner brackets */}
        {[['top-1.5 left-1.5 border-t-2 border-l-2','tl'],['top-1.5 right-1.5 border-t-2 border-r-2','tr'],
          ['bottom-1.5 left-1.5 border-b-2 border-l-2','bl'],['bottom-1.5 right-1.5 border-b-2 border-r-2','br']].map(([cls,k]) => (
          <div key={k} className={`absolute w-4 h-4 border-[#00ffcc]/25 z-20 ${cls}`} />
        ))}

        {/* Tooltip */}
        <AnimatePresence>
          {activeTooltip && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 6 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            >
              <div
                className="rounded-lg overflow-hidden shadow-2xl"
                style={{
                  border: `1px solid ${riskConfig[activeTooltip.risk]?.color ?? '#00ffcc'}35`,
                  background: 'rgba(0,5,12,0.97)',
                  boxShadow: `0 0 30px ${riskConfig[activeTooltip.risk]?.glow ?? 'rgba(0,255,200,0.2)'}, 0 4px 40px rgba(0,0,0,0.9)`,
                  maxWidth: 340,
                  minWidth: 260,
                }}
              >
                {/* Header */}
                <div className="px-3 py-2 border-b border-white/5"
                  style={{ background: `linear-gradient(135deg, ${riskConfig[activeTooltip.risk]?.color ?? '#00ffcc'}12, transparent)` }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: riskConfig[activeTooltip.risk]?.color, boxShadow: `0 0 8px ${riskConfig[activeTooltip.risk]?.glow}` }} />
                      <span className="text-[10px] font-bold tracking-[0.15em] text-white">
                        {activeTooltip.label}
                      </span>
                    </div>
                    {activeTooltip.category && (
                      <span className="text-[6.5px] font-mono px-1.5 py-0.5 rounded tracking-widest"
                        style={{ background: `${riskConfig[activeTooltip.risk]?.color}20`, color: riskConfig[activeTooltip.risk]?.color }}>
                        {activeTooltip.category.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                {/* Body */}
                <div className="px-3 py-2.5">
                  <p className="text-[8.5px] text-white/65 leading-relaxed font-mono">
                    {activeTooltip.detail ?? 'Location actively monitored by intelligence network.'}
                  </p>
                  <div className="mt-2 pt-2 border-t border-white/5 flex gap-3 items-center flex-wrap">
                    <span className="text-[6px] text-white/20 font-mono">
                      {activeTooltip.coordinates[1].toFixed(2)}°N · {activeTooltip.coordinates[0].toFixed(2)}°E
                    </span>
                    {activeTooltip.speed !== undefined && (
                      <span className="text-[6px] text-white/20 font-mono">{activeTooltip.speed} kts</span>
                    )}
                    <span className="text-[6.5px] font-bold font-mono tracking-widest ml-auto"
                      style={{ color: riskConfig[activeTooltip.risk]?.color }}>
                      ● {riskConfig[activeTooltip.risk]?.label}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Threat ticker */}
      {ticker.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-white/4 bg-black/50">
          <span className="shrink-0 text-[6.5px] font-mono font-bold text-red-500 tracking-widest border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
            ▶ FEED
          </span>
          <ThreatTicker items={ticker} />
        </div>
      )}
    </div>
  );
}
