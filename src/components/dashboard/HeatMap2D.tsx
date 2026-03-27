import React, { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export interface MapPoint {
  id?: string;
  coordinates: [number, number]; // [lng, lat]
  label: string;
  detail?: string;
  category?: string;
  risk: 'critical' | 'high' | 'alert' | 'stable' | 'unknown' | 'satellite' | 'aviation' | 'maritime' | 'cyber' | 'disaster';
  // For animated movement (ships/aircraft)
  heading?: number;          // degrees
  speed?: number;            // knots or km/h
  trail?: [number, number][]; // previous positions
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

export const riskConfig: Record<string, { color: string; label: string; size: number; glow: string }> = {
  critical: { color: '#ef4444', label: 'Conflict',   size: 5,   glow: 'rgba(239,68,68,0.6)' },
  high:     { color: '#f97316', label: 'High Risk',  size: 4,   glow: 'rgba(249,115,22,0.5)' },
  alert:    { color: '#f59e0b', label: 'Alert',      size: 3.5, glow: 'rgba(245,158,11,0.4)' },
  stable:   { color: '#10b981', label: 'Stable',     size: 3,   glow: 'rgba(16,185,129,0.3)' },
  satellite:{ color: '#c084fc', label: 'Satellite',  size: 3,   glow: 'rgba(192,132,252,0.4)' },
  unknown:  { color: '#06b6d4', label: 'Unknown',    size: 3,   glow: 'rgba(6,182,212,0.3)' },
  aviation: { color: '#60a5fa', label: 'Aviation',   size: 3.5, glow: 'rgba(96,165,250,0.5)' },
  maritime: { color: '#2dd4bf', label: 'Maritime',   size: 3.5, glow: 'rgba(45,212,191,0.5)' },
  cyber:    { color: '#e879f9', label: 'Cyber',      size: 3,   glow: 'rgba(232,121,249,0.5)' },
  disaster: { color: '#fb923c', label: 'Disaster',   size: 4,   glow: 'rgba(251,146,60,0.55)' },
};

const LAYER_ICONS: Record<MapLayer, string> = {
  all:       '🌐',
  conflict:  '⚔️',
  maritime:  '🚢',
  aviation:  '✈️',
  cyber:     '💻',
  disasters: '🌋',
};

const LAYER_LABELS: Record<MapLayer, string> = {
  all:       'All',
  conflict:  'Conflict',
  maritime:  'Maritime',
  aviation:  'Aviation',
  cyber:     'Cyber',
  disasters: 'Disasters',
};

function MapLegend({ activeLayer }: { activeLayer: MapLayer }) {
  const items = activeLayer === 'all'
    ? ['critical', 'high', 'alert', 'maritime', 'aviation', 'cyber', 'disaster'] as const
    : ['critical', 'high', 'alert', 'stable'] as const;
  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-2 flex-wrap bg-black/70 backdrop-blur-md border border-white/10 rounded px-2.5 py-1.5 z-10 max-w-[280px]">
      {items.map(risk => (
        <div key={risk} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: riskConfig[risk].color, boxShadow: `0 0 6px ${riskConfig[risk].glow}` }} />
          <span className="text-[8px] font-mono text-white/50 uppercase tracking-wider">{riskConfig[risk].label}</span>
        </div>
      ))}
    </div>
  );
}

// Movement arrow for ships/aircraft
function MovementIndicator({ heading, color }: { heading: number; color: string }) {
  const rad = (heading * Math.PI) / 180;
  const dx = Math.sin(rad) * 8;
  const dy = -Math.cos(rad) * 8;
  return (
    <line
      x1={0} y1={0}
      x2={dx} y2={dy}
      stroke={color}
      strokeWidth={1.5}
      strokeOpacity={0.8}
      markerEnd="url(#arrowHead)"
    />
  );
}

export function HeatMap2D({
  points = [],
  height = 420,
  onPointClick,
  showLayerToggle = false,
  isLive = false,
  lastRefresh,
}: {
  points?: MapPoint[];
  height?: number;
  onPointClick?: (pt: MapPoint) => void;
  showLayerToggle?: boolean;
  isLive?: boolean;
  lastRefresh?: Date;
}) {
  const [activeTooltip, setActiveTooltip] = useState<MapPoint | null>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all');

  const filteredPoints = useMemo(() => {
    if (activeLayer === 'all') return points;
    const cats = LAYER_CATEGORIES[activeLayer];
    return points.filter(p => cats.some(c => (p.category || '').toLowerCase().includes(c.toLowerCase())));
  }, [points, activeLayer]);

  const layers: MapLayer[] = ['all', 'conflict', 'maritime', 'aviation', 'cyber', 'disasters'];

  return (
    <div className="w-full flex flex-col gap-0">
      {/* Layer toggle bar */}
      {showLayerToggle && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 bg-black/30 flex-wrap">
          <span className="text-[8px] font-mono text-white/20 uppercase tracking-wider mr-1">Layer</span>
          {layers.map(layer => (
            <button
              key={layer}
              onClick={() => setActiveLayer(layer)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider transition-all border',
                activeLayer === layer
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                  : 'bg-white/3 border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
              )}
            >
              <span>{LAYER_ICONS[layer]}</span>
              <span>{LAYER_LABELS[layer]}</span>
              {activeLayer !== 'all' && layer !== 'all' && layer === activeLayer && (
                <span className="text-[7px] text-cyan-400/60 ml-0.5">
                  {filteredPoints.length}
                </span>
              )}
            </button>
          ))}
          {isLive && (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-mono text-emerald-400/70">LIVE</span>
              {lastRefresh && (
                <span className="text-[7px] font-mono text-white/20">
                  ·{' '}{Math.round((Date.now() - lastRefresh.getTime()) / 60000)}m ago
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="w-full relative flex items-center justify-center p-0" style={{ minHeight: `${height}px` }}>
        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,200,0.1) 2px, rgba(0,255,200,0.1) 4px)' }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(0,255,200,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,200,0.2) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 130, center: [20, 20] }}
          style={{ width: '100%', height: '100%', outline: 'none' }}
        >
          {/* Arrow marker defs */}
          <defs>
            <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.6)" />
            </marker>
          </defs>

          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(255, 255, 255, 0.04)"
                  stroke="rgba(0, 255, 200, 0.12)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "rgba(0, 255, 200, 0.1)", outline: "none", stroke: "rgba(0, 255, 200, 0.35)" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {filteredPoints.map((point, index) => {
            const config = riskConfig[point.risk] || riskConfig.unknown;
            return (
              <Marker
                key={`${point.id ?? index}-${point.coordinates[0]}-${point.coordinates[1]}`}
                coordinates={point.coordinates}
                onMouseEnter={() => setActiveTooltip(point)}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={() => onPointClick && onPointClick(point)}
              >
                <g className={cn("group", onPointClick && "cursor-pointer")}>
                  {/* Movement arrow for moving entities */}
                  {point.heading !== undefined && (
                    <MovementIndicator heading={point.heading} color={config.color} />
                  )}
                  {/* Outer pulse ring */}
                  <circle r={config.size * 2.5} fill={config.color} className="opacity-10 animate-ping" />
                  {/* Mid glow */}
                  <circle r={config.size * 1.5} fill={config.color} className="opacity-20 group-hover:opacity-30 transition-opacity" />
                  {/* Core dot */}
                  <circle r={config.size} fill={config.color} className="opacity-90 group-hover:opacity-100" style={{ filter: `drop-shadow(0 0 4px ${config.glow})` }} />
                  {/* Label */}
                  <text
                    textAnchor="middle"
                    y={-(config.size + 8)}
                    style={{ fontFamily: "monospace", fontSize: "6.5px", fill: config.color, fontWeight: "bold", userSelect: "none", letterSpacing: '0.5px' }}
                    className="opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    {point.label}
                  </text>
                </g>
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Legend */}
        <MapLegend activeLayer={activeLayer} />

        {/* Pin count */}
        {filteredPoints.length > 0 && (
          <div className="absolute top-2 right-2 bg-black/60 border border-white/10 rounded px-2 py-0.5 text-[8px] font-mono text-white/30 z-10">
            {filteredPoints.length} signals
          </div>
        )}

        {/* Tooltip */}
        <AnimatePresence>
          {activeTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            >
              <div className="bg-black/95 border rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.9)] backdrop-blur-xl max-w-[300px] overflow-hidden"
                style={{ borderColor: `${riskConfig[activeTooltip.risk]?.color || '#06b6d4'}30` }}>
                <div className="px-3 py-2 border-b border-white/5"
                  style={{ background: `linear-gradient(135deg, ${riskConfig[activeTooltip.risk]?.color || '#06b6d4'}10, transparent)` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: riskConfig[activeTooltip.risk]?.color || '#06b6d4', boxShadow: `0 0 8px ${riskConfig[activeTooltip.risk]?.glow || 'rgba(6,182,212,0.3)'}` }} />
                    <span className="text-[10px] font-bold tracking-wider text-white uppercase">{activeTooltip.label}</span>
                    {activeTooltip.category && (
                      <span className="text-[7px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono uppercase">{activeTooltip.category}</span>
                    )}
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[9px] text-white/60 leading-relaxed font-mono">
                    {activeTooltip.detail || "Location monitored by global grid."}
                  </p>
                  <div className="mt-1.5 pt-1.5 border-t border-white/5 flex gap-3 flex-wrap">
                    <span className="text-[7px] text-white/25 font-mono">LAT {activeTooltip.coordinates[1].toFixed(2)}</span>
                    <span className="text-[7px] text-white/25 font-mono">LNG {activeTooltip.coordinates[0].toFixed(2)}</span>
                    {activeTooltip.speed !== undefined && (
                      <span className="text-[7px] text-white/25 font-mono">{activeTooltip.speed} kts</span>
                    )}
                    <span className="text-[7px] font-mono uppercase"
                      style={{ color: riskConfig[activeTooltip.risk]?.color || '#06b6d4' }}>
                      {riskConfig[activeTooltip.risk]?.label || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Corner brackets */}
        <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-cyan-500/20" />
        <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-cyan-500/20" />
        <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-cyan-500/20" />
        <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-cyan-500/20" />
      </div>
    </div>
  );
}
