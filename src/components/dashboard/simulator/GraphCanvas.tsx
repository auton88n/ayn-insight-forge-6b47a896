/**
 * GraphCanvas v5 — Professional intelligence-grade network visualization.
 *
 * Aesthetic direction: "classified data terminal" — deep space dark,
 * near-invisible connections, 1px nodes with depth through opacity not size.
 * Think: Palantir, Bloomberg Terminal, NSA PRISM visualization.
 *
 * Rules:
 *  - Node radius: 1.5px (persona) to 2.5px (institutional). Never larger.
 *  - Line opacity: 0.06–0.18. Never a bright cyan grid.
 *  - Color is desaturated by 60% — hints of category, not screaming it.
 *  - Depth illusion via z-layering: dim background nodes, bright foreground.
 *  - On hover: one node brightens + label appears. Nothing else.
 */
import { useEffect, useRef, useMemo } from 'react';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

// Desaturated, deep — not game colors
const CAT_HUE: Record<string, [number, number, number]> = {
  government:   [210, 60, 55],   // steel blue
  central_bank: [42,  55, 60],   // muted amber
  stock_market: [158, 45, 50],   // seafoam
  bank:         [270, 40, 55],   // muted violet
  company:      [195, 50, 55],   // teal
  media:        [0,   50, 55],   // brick
  religion:     [28,  45, 55],   // terracotta
  social_class: [88,  40, 50],   // olive
  persona:      [330, 35, 55],   // dusty rose
  other:        [220, 15, 40],   // slate
};

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

interface Node {
  id: string; cat: string; label: string;
  x: number; y: number; vx: number; vy: number;
  r: number; mass: number; depth: number; // 0–1, affects opacity
}

interface Props {
  agents:   EnginAgent[];
  graph:    EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  onSelect?: (id: string) => void;
}

export function GraphCanvas({ agents, graph, emotions, onSelect }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const rafRef     = useRef<number>(0);
  const nodesRef   = useRef<Node[]>([]);
  const frameRef   = useRef(0);
  const hoveredRef = useRef<string | null>(null);
  const forcesRef  = useRef<{ fx: Float32Array; fy: Float32Array }>({
    fx: new Float32Array(0),
    fy: new Float32Array(0),
  });

  const edgeSet = useMemo(() =>
    (graph?.edges || []).map(e => ({ s: e.source, t: e.target })),
  [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    const resize = () => {
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(rawDpr, window.innerWidth < 1024 ? 1.25 : 1.5);
      const rect = wrap.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width  = rect.width  + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const W = () => canvas.clientWidth;
    const H = () => canvas.clientHeight;

    // Init nodes — scattered with random depth
    if (agents.length && nodesRef.current.length !== agents.length) {
      nodesRef.current = agents.map(a => {
        const isPerson = a.category === 'social_class' || a.category === 'person';
        return {
          id:    a.id,
          cat:   a.category || 'other',
          label: a.name,
          x:  W() * 0.15 + Math.random() * W() * 0.70,
          y:  H() * 0.15 + Math.random() * H() * 0.70,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          r:  isPerson ? 1.5 : 2.2,
          mass: isPerson ? 0.7 : 1.3,
          depth: Math.random(), // random z-depth for atmosphere
        };
      });
      forcesRef.current = {
        fx: new Float32Array(nodesRef.current.length),
        fy: new Float32Array(nodesRef.current.length),
      };
    }

    const idxOf = new Map(nodesRef.current.map((n, i) => [n.id, i]));

    // Mouse
    const handleClick = (e: MouseEvent) => {
      if (!onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < Math.max(n.r + 6, 12)) {
          onSelect(n.id);
          break;
        }
      }
    };
    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hoveredRef.current = null;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < Math.max(n.r + 10, 14)) {
          hoveredRef.current = n.id;
          break;
        }
      }
    };
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);

    const draw = () => {
      frameRef.current++;
      const t = frameRef.current;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const nodes = nodesRef.current;

      // Deep dark background — not pure black, very subtle blue tint
      ctx.fillStyle = '#060810';
      ctx.fillRect(0, 0, w, h);

      if (!nodes.length) { rafRef.current = requestAnimationFrame(draw); return; }

      // ── Force simulation ──────────────────────────────────────────────────
      const REPEL  = 1200;
      const SPRING = 0.0015;
      const DAMP   = 0.92;
      const CENTER = 0.00008;
      const { fx: forceX, fy: forceY } = forcesRef.current;
      const shouldSolveForces = t <= 180 || t % 3 === 0;

      if (shouldSolveForces) {
        forceX.fill(0);
        forceY.fill(0);

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const sameCat = a.cat === b.cat;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx*dx + dy*dy, 1);
          const d  = Math.sqrt(d2);
          const f  = REPEL / d2;
            const xForce = f * dx / d;
            const yForce = f * dy / d;
            forceX[i] += xForce; forceY[i] += yForce;
            forceX[j] -= xForce; forceY[j] -= yForce;

            if (sameCat && d < 120) {
              const cf = (d - 120) * 0.0003;
              const cx = cf * (b.x - a.x) / d;
              const cy = cf * (b.y - a.y) / d;
              forceX[i] += cx; forceY[i] += cy;
              forceX[j] -= cx; forceY[j] -= cy;
            }
          }
        }

        edgeSet.forEach(e => {
          const si = idxOf.get(e.s), ti = idxOf.get(e.t);
          if (si == null || ti == null) return;
          const a = nodes[si], b = nodes[ti];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d  = Math.hypot(dx, dy) || 1;
          const f  = (d - 160) * SPRING;
          const xForce = f * dx / d;
          const yForce = f * dy / d;
          forceX[si] += xForce; forceY[si] += yForce;
          forceX[ti] -= xForce; forceY[ti] -= yForce;
        });
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        let fx = forceX[i], fy = forceY[i];

        fx += (w/2 - a.x) * CENTER;
        fy += (h/2 - a.y) * CENTER;

        // Soft boundary repulsion — pushes away from edges smoothly
        const EDGE = 80;
        const edgeF = 0.8;
        if (a.x < EDGE) fx += edgeF * (EDGE - a.x) / EDGE;
        if (a.x > w - EDGE) fx -= edgeF * (a.x - (w - EDGE)) / EDGE;
        if (a.y < EDGE) fy += edgeF * (EDGE - a.y) / EDGE;
        if (a.y > h - EDGE) fy -= edgeF * (a.y - (h - EDGE)) / EDGE;

        a.vx = (a.vx + fx / a.mass) * DAMP;
        a.vy = (a.vy + fy / a.mass) * DAMP;
        const spd = Math.hypot(a.vx, a.vy);
        if (spd > 1.2) { a.vx = a.vx/spd*1.2; a.vy = a.vy/spd*1.2; }

        a.x += a.vx; a.y += a.vy;
        // Hard clamp only as absolute last resort — far outside canvas
        a.x = Math.max(-20, Math.min(w + 20, a.x));
        a.y = Math.max(-20, Math.min(h + 20, a.y));
      }

      // ── Draw graph edges (very faint) ─────────────────────────────────────
      edgeSet.forEach(e => {
        const si = idxOf.get(e.s), ti = idxOf.get(e.t);
        if (si == null || ti == null) return;
        const a = nodes[si], b = nodes[ti];
        const dist = Math.hypot(a.x-b.x, a.y-b.y);
        if (dist > 400) return;
        const alpha = (1 - dist/400) * 0.14;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(100,160,220,${alpha})`;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      });

      // ── Proximity edges (ultra faint) ─────────────────────────────────────
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dist = Math.hypot(a.x-b.x, a.y-b.y);
          if (dist > 65) continue;
          const alpha = (1 - dist/65) * 0.09;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(150,165,185,${alpha})`;
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }

      // ── Draw nodes ────────────────────────────────────────────────────────
      const hovered = hoveredRef.current;

      nodes.forEach(n => {
        const [h_hue, h_sat, h_lit] = CAT_HUE[n.cat] || CAT_HUE.other;
        const isHovered = hovered === n.id;
        const em = emotions[n.id];

        // Depth-based opacity — far nodes are dimmer
        const depthOpacity = 0.35 + n.depth * 0.5;
        const opacity = isHovered ? 1 : depthOpacity;

        // Pulsing breath for active nodes
        const breath = 1 + 0.06 * Math.sin(t * 0.04 + n.x * 0.03);
        const r = n.r * (isHovered ? 2.5 : breath);

        // Emotion modifies lightness only
        let lit = h_lit;
        if (em) {
          const emBoost: Record<string,number> = {
            panic:8, fear:5, anger:7, excited:10, optimistic:6
          };
          lit += (emBoost[em.emotion] || 0);
        }

        // Draw dot — single clean circle, no glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI*2);
        ctx.fillStyle = hsl(h_hue, h_sat, lit, opacity);
        ctx.fill();

        // Hover state: outer ring only
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3, 0, Math.PI*2);
          ctx.strokeStyle = hsl(h_hue, h_sat, lit + 20, 0.4);
          ctx.lineWidth = 0.6;
          ctx.stroke();

          // Label — mono, small, offset above
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = hsl(h_hue, 20, 80, 0.9);
          ctx.fillText(n.label.length > 22 ? n.label.slice(0,21)+'…' : n.label, n.x, n.y - r - 5);

          // Category label below
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillStyle = hsl(h_hue, 20, 60, 0.5);
          ctx.textBaseline = 'top';
          ctx.fillText(n.cat.replace('_',' '), n.x, n.y + r + 4);
        }
      });

      // ── Minimal category key — bottom left, very dim ───────────────────────
      const cats = [...new Set(nodes.map(n => n.cat))];
      let kx = 10;
      const ky = h - 12;
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      cats.slice(0, 7).forEach(cat => {
        const [ch, cs, cl] = CAT_HUE[cat] || CAT_HUE.other;
        ctx.beginPath();
        ctx.arc(kx + 3, ky, 2, 0, Math.PI*2);
        ctx.fillStyle = hsl(ch, cs, cl, 0.5);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(120,130,150,0.35)`;
        const label = cat.replace('_',' ');
        ctx.fillText(label, kx + 8, ky);
        kx += ctx.measureText(label).width + 18;
      });

      // Node count — far right, very dim
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(100,110,130,0.25)';
      ctx.fillText(`${nodes.length}`, w - 8, ky);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMove);
    };
  }, [agents, edgeSet, emotions, onSelect]);

  return (
    <div ref={wrapRef} className="w-full h-full rounded-xl overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
    </div>
  );
}
