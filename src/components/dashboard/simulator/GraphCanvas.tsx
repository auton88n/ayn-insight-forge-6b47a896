/**
 * GraphCanvas v3 — Natural force-directed particle field.
 * Agents scatter organically, connect to neighbors, pulse with emotions.
 * No perfect ring — real physics simulation.
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
  other:        '#94a3b8',
};

const EMOTION_GLOW: Record<string, string> = {
  panic:      '#ef4444',
  fear:       '#f97316',
  anger:      '#dc2626',
  excited:    '#fbbf24',
  optimistic: '#10b981',
  cautious:   '#8b5cf6',
  neutral:    '#94a3b8',
  calm:       '#06b6d4',
};

interface Node {
  id: string; label: string; flag: string; cat: string;
  x: number; y: number; vx: number; vy: number;
  r: number; mass: number;
}

interface Props {
  agents: EnginAgent[];
  graph:  EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  onSelect?: (id: string) => void;
}

export function GraphCanvas({ agents, graph, emotions, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number>(0);
  const nodesRef  = useRef<Node[]>([]);
  const frameRef  = useRef(0);
  const hoveredRef = useRef<string | null>(null);

  // Build edges from graph
  const edgeSet = useMemo(() => {
    if (!graph?.edges) return [] as {s:string,t:string}[];
    return graph.edges.map(e => ({ s: e.source, t: e.target }));
  }, [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d')!;

    // Resize helper
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

    // Initialize nodes scattered randomly (NOT in a ring)
    const W = () => canvas.clientWidth;
    const H = () => canvas.clientHeight;

    if (agents.length && nodesRef.current.length !== agents.length) {
      nodesRef.current = agents.map(a => {
        const isPerson = a.category === 'persona' || a.category === 'social_class';
        return {
          id:    a.id,
          label: a.name,
          flag:  a.flag || '●',
          cat:   a.category || 'other',
          // Random scatter across canvas
          x:  W() * 0.1 + Math.random() * W() * 0.8,
          y:  H() * 0.1 + Math.random() * H() * 0.8,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          r:    isPerson ? 4 : 7,
          mass: isPerson ? 1 : 2,
        };
      });
    }

    const idxOf = new Map(nodesRef.current.map((n,i) => [n.id, i]));

    // Mouse interaction
    const handleClick = (e: MouseEvent) => {
      if (!onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < n.r + 6) { onSelect(n.id); break; }
      }
    };
    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hoveredRef.current = null;
      for (const n of nodesRef.current) {
        if (Math.hypot(n.x - mx, n.y - my) < n.r + 8) { hoveredRef.current = n.id; break; }
      }
    };
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);

    // ── DRAW LOOP ─────────────────────────────────────────────────────────
    const draw = () => {
      frameRef.current++;
      const t   = frameRef.current;
      const w   = canvas.clientWidth;
      const h   = canvas.clientHeight;
      const nodes = nodesRef.current;

      ctx.clearRect(0, 0, w, h);

      if (nodes.length === 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // ── Force simulation ────────────────────────────────────────────────
      const REPEL  = 1800;
      const ATTRACT = 0.003;
      const DAMPEN  = 0.88;
      const CENTER_PULL = 0.0004;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        let fx = 0, fy = 0;

        // Repel from all other nodes
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 1;
          const f  = REPEL / d2;
          fx += f * dx / Math.sqrt(d2);
          fy += f * dy / Math.sqrt(d2);
        }

        // Attract to connected edges
        edgeSet.forEach(e => {
          let other: Node | null = null;
          if (e.s === a.id) other = nodes[idxOf.get(e.t) ?? -1] ?? null;
          if (e.t === a.id) other = nodes[idxOf.get(e.s) ?? -1] ?? null;
          if (!other) return;
          const dx = other.x - a.x, dy = other.y - a.y;
          const d  = Math.hypot(dx, dy);
          const target = 130;
          const f = (d - target) * ATTRACT;
          fx += f * dx / (d + 1);
          fy += f * dy / (d + 1);
        });

        // Gentle center gravity
        fx += (w / 2 - a.x) * CENTER_PULL;
        fy += (h / 2 - a.y) * CENTER_PULL;

        a.vx = (a.vx + fx / a.mass) * DAMPEN;
        a.vy = (a.vy + fy / a.mass) * DAMPEN;

        // Speed cap
        const spd = Math.hypot(a.vx, a.vy);
        if (spd > 2) { a.vx = a.vx / spd * 2; a.vy = a.vy / spd * 2; }

        a.x += a.vx;
        a.y += a.vy;

        // Boundary bounce with padding
        const pad = a.r + 12;
        if (a.x < pad) { a.x = pad; a.vx *= -0.5; }
        if (a.x > w - pad) { a.x = w - pad; a.vx *= -0.5; }
        if (a.y < pad) { a.y = pad; a.vy *= -0.5; }
        if (a.y > h - pad) { a.y = h - pad; a.vy *= -0.5; }
      }

      // ── Draw edges ──────────────────────────────────────────────────────
      edgeSet.forEach(e => {
        const si = idxOf.get(e.s), ti = idxOf.get(e.t);
        if (si == null || ti == null) return;
        const a = nodes[si], b = nodes[ti];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 300) return;
        const alpha = (1 - dist / 300) * 0.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `${CAT_COLOR[a.cat] || '#94a3b8'}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      // Also draw proximity connections (agents close to each other)
      for (let i = 0; i < Math.min(nodes.length, 40); i++) {
        for (let j = i + 1; j < Math.min(nodes.length, 40); j++) {
          const a = nodes[i], b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > 100) continue;
          const alpha = (1 - dist / 100) * 0.08;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `#94a3b8${Math.round(alpha * 255).toString(16).padStart(2,'0')}`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // ── Draw nodes ──────────────────────────────────────────────────────
      nodes.forEach(n => {
        const em    = emotions[n.id];
        const emoColor = em ? (EMOTION_GLOW[em.emotion] || CAT_COLOR[n.cat]) : CAT_COLOR[n.cat];
        const intensity = em?.intensity ?? 0.5;
        const pulse = 1 + 0.15 * Math.sin(t * 0.06 + n.x * 0.01);
        const isHovered = hoveredRef.current === n.id;
        const r = n.r * (isHovered ? 1.6 : 1) * (em ? 1 + intensity * 0.3 : 1);

        // Outer glow
        const glowR = r * (3 + intensity * 2);
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        grd.addColorStop(0, `${emoColor}50`);
        grd.addColorStop(1, `${emoColor}00`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = emoColor + 'dd';
        ctx.fill();
        ctx.strokeStyle = emoColor + 'ff';
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Flag emoji for institutional agents
        if (n.r >= 7 || isHovered) {
          ctx.font = `${Math.round(r * 1.8)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.flag, n.x, n.y);
        }

        // Label on hover
        if (isHovered) {
          const label = n.label.length > 18 ? n.label.slice(0,17)+'…' : n.label;
          ctx.font = '11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = '#ffffffcc';
          ctx.fillText(label, n.x, n.y - r - 4);
        }
      });

      // ── Legend ──────────────────────────────────────────────────────────
      const cats = [...new Set(nodes.map(n => n.cat))].slice(0, 6);
      cats.forEach((cat, i) => {
        const color = CAT_COLOR[cat] || '#94a3b8';
        ctx.beginPath();
        ctx.arc(14, h - 16 - i * 16, 4, 0, Math.PI * 2);
        ctx.fillStyle = color + 'cc';
        ctx.fill();
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff50';
        ctx.fillText(cat.replace('_',' '), 22, h - 16 - i * 16);
      });

      // Node count
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff30';
      ctx.fillText(`${nodes.length} agents`, w - 8, h - 8);

      rafRef.current = requestAnimationFrame(draw);
    };

    const animRef = rafRef;
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
      <canvas ref={canvasRef} className="w-full h-full cursor-pointer" />
    </div>
  );
}
