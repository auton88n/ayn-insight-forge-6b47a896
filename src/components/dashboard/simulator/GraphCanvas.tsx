/**
 * GraphCanvas v4 — Minimal network graph.
 * Small dots + thin connecting lines. No emojis. No glow. Clean.
 * Inspired by: sparse force-directed graph like image 2.
 */
import { useEffect, useRef, useMemo } from 'react';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

const CAT_COLOR: Record<string, string> = {
  government:   '#3b82f6',
  central_bank: '#f59e0b',
  stock_market: '#10b981',
  bank:         '#8b5cf6',
  company:      '#06b6d4',
  media:        '#ef4444',
  religion:     '#f97316',
  social_class: '#84cc16',
  persona:      '#ec4899',
  other:        '#64748b',
};

interface Node {
  id: string; cat: string; label: string;
  x: number; y: number; vx: number; vy: number;
  r: number; mass: number;
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

  const edgeSet = useMemo(() =>
    (graph?.edges || []).map(e => ({ s: e.source, t: e.target })),
  [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr  = window.devicePixelRatio || 1;
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

    // Init nodes — scattered randomly, tiny dots
    if (agents.length && nodesRef.current.length !== agents.length) {
      nodesRef.current = agents.map(a => ({
        id:    a.id,
        cat:   a.category || 'other',
        label: a.name,
        x:  W() * 0.1 + Math.random() * W() * 0.8,
        y:  H() * 0.1 + Math.random() * H() * 0.8,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r:  a.category === 'persona' ? 2.5 : 3.5,
        mass: a.category === 'persona' ? 0.8 : 1.2,
      }));
    }

    const idxOf = new Map(nodesRef.current.map((n, i) => [n.id, i]));

    // Mouse
    const handleClick = (e: MouseEvent) => {
      if (!onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < n.r + 8) { onSelect(n.id); break; }
      }
    };
    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hoveredRef.current = null;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < n.r + 10) { hoveredRef.current = n.id; break; }
      }
    };
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);

    const draw = () => {
      frameRef.current++;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const nodes = nodesRef.current;
      ctx.clearRect(0, 0, w, h);

      if (!nodes.length) { rafRef.current = requestAnimationFrame(draw); return; }

      // ── Force simulation (light) ────────────────────────────────────────
      const REPEL  = 900;
      const SPRING = 0.002;
      const DAMP   = 0.90;
      const CENTER = 0.0003;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        let fx = 0, fy = 0;

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy + 1;
          const d  = Math.sqrt(d2);
          const f  = REPEL / d2;
          fx += f * dx / d;
          fy += f * dy / d;
        }

        edgeSet.forEach(e => {
          let other: Node | null = null;
          if (e.s === a.id) other = nodes[idxOf.get(e.t) ?? -1] ?? null;
          if (e.t === a.id) other = nodes[idxOf.get(e.s) ?? -1] ?? null;
          if (!other) return;
          const dx = other.x - a.x, dy = other.y - a.y;
          const d  = Math.hypot(dx, dy) || 1;
          const f  = (d - 140) * SPRING;
          fx += f * dx / d;
          fy += f * dy / d;
        });

        // Proximity attraction (sparse connections)
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          const d = Math.hypot(a.x-b.x, a.y-b.y);
          if (d < 90 && d > 0) {
            const f = (d - 90) * 0.0005;
            fx += f * (b.x - a.x) / d;
            fy += f * (b.y - a.y) / d;
          }
        }

        fx += (w/2 - a.x) * CENTER;
        fy += (h/2 - a.y) * CENTER;

        a.vx = (a.vx + fx / a.mass) * DAMP;
        a.vy = (a.vy + fy / a.mass) * DAMP;
        const spd = Math.hypot(a.vx, a.vy);
        if (spd > 1.5) { a.vx = a.vx/spd*1.5; a.vy = a.vy/spd*1.5; }

        a.x += a.vx; a.y += a.vy;
        const pad = 8;
        if (a.x < pad) { a.x = pad; a.vx *= -0.5; }
        if (a.x > w-pad) { a.x = w-pad; a.vx *= -0.5; }
        if (a.y < pad) { a.y = pad; a.vy *= -0.5; }
        if (a.y > h-pad) { a.y = h-pad; a.vy *= -0.5; }
      }

      // ── Draw edges — graph edges ────────────────────────────────────────
      ctx.lineWidth = 0.6;
      edgeSet.forEach(e => {
        const si = idxOf.get(e.s), ti = idxOf.get(e.t);
        if (si == null || ti == null) return;
        const a = nodes[si], b = nodes[ti];
        const dist = Math.hypot(a.x-b.x, a.y-b.y);
        if (dist > 350) return;
        const alpha = (1 - dist/350) * 0.25;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `#06b6d4${Math.round(alpha*255).toString(16).padStart(2,'0')}`;
        ctx.stroke();
      });

      // ── Draw proximity edges ────────────────────────────────────────────
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dist = Math.hypot(a.x-b.x, a.y-b.y);
          if (dist > 80) continue;
          const alpha = (1 - dist/80) * 0.18;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `#94a3b8${Math.round(alpha*255).toString(16).padStart(2,'0')}`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // ── Draw nodes — small clean dots ───────────────────────────────────
      nodes.forEach(n => {
        const em = emotions[n.id];
        const color = CAT_COLOR[n.cat] || '#64748b';
        const isHovered = hoveredRef.current === n.id;
        const r = n.r * (isHovered ? 2 : 1);

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI*2);
        ctx.fillStyle = color + (isHovered ? 'ff' : 'cc');
        ctx.fill();

        // Subtle emotion ring (no glow, just a thin stroke)
        if (em && em.emotion !== 'neutral') {
          const emColors: Record<string,string> = {
            panic:'#ef4444', fear:'#f97316', anger:'#dc2626',
            excited:'#fbbf24', optimistic:'#10b981', cautious:'#8b5cf6',
          };
          const emColor = emColors[em.emotion];
          if (emColor) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 2, 0, Math.PI*2);
            ctx.strokeStyle = emColor + '80';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Label only on hover
        if (isHovered) {
          const label = n.label.length > 20 ? n.label.slice(0,19)+'…' : n.label;
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#ffffffbb';
          ctx.fillText(label, n.x, n.y - r - 3);
        }
      });

      // ── Bottom legend ────────────────────────────────────────────────────
      const cats = [...new Set(nodes.map(n => n.cat))].filter(c => c !== 'other');
      const legendY = h - 10;
      let legendX = 10;
      ctx.font = '9px monospace';
      ctx.textBaseline = 'middle';
      cats.slice(0, 6).forEach(cat => {
        const color = CAT_COLOR[cat] || '#64748b';
        ctx.beginPath();
        ctx.arc(legendX + 4, legendY, 3, 0, Math.PI*2);
        ctx.fillStyle = color + 'cc';
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff30';
        ctx.fillText(cat.replace('_',' '), legendX + 10, legendY);
        legendX += ctx.measureText(cat.replace('_',' ')).width + 20;
      });

      // Node count
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff20';
      ctx.fillText(`${nodes.length} agents`, w - 8, h - 10);

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
    <div ref={wrapRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />
    </div>
  );
}
