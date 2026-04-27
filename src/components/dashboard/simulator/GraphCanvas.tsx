/**
 * Lightweight force-graph — Canvas2D, no three.js dependency for the
 * simulator stage so initial paint is instant. Nodes pulse on emotion change.
 */
import { useEffect, useMemo, useRef } from 'react';
import { EnginAgent, EnginGraph } from '@/lib/enginApi';

const CAT_COLOR: Record<string, string> = {
  government:   '#06b6d4',
  central_bank: '#fbbf24',
  market:       '#f472b6',
  bank:         '#a78bfa',
  company:      '#34d399',
  person:       '#fb923c',
  institution:  '#8b5cf6',
  other:        '#94a3b8',
};

interface Props {
  agents: EnginAgent[];
  graph: EnginGraph | null;
  emotions: Record<string, { emotion: string; intensity?: number }>;
  onSelect?: (id: string) => void;
}

export function GraphCanvas({ agents, graph, emotions, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef   = useRef<HTMLDivElement | null>(null);
  const rafRef    = useRef<number | null>(null);

  const nodes = useMemo(() => agents.map((a, i) => ({
    id: a.id, label: a.name, cat: a.category,
    // initial circular layout
    x: 0, y: 0, vx: 0, vy: 0,
    angle: (i / Math.max(1, agents.length)) * Math.PI * 2,
  })), [agents]);

  const edges = useMemo(() => (graph?.edges || []).map(e => ({ s: e.source, t: e.target })), [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width  = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width  = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Init positions in a circle
    const rect = wrap.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const r  = Math.min(rect.width, rect.height) * 0.38;
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = cx + Math.cos(a) * r;
      n.y = cy + Math.sin(a) * r;
    });

    const idIndex = new Map(nodes.map((n, i) => [n.id, i]));
    let t = 0;

    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Background dotted ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(120, 130, 200, 0.08)';
      ctx.setLineDash([3, 8]);
      ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Edges
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(160, 170, 220, 0.1)';
      for (const e of edges) {
        const a = nodes[idIndex.get(e.s) ?? -1];
        const b = nodes[idIndex.get(e.t) ?? -1];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        const color = CAT_COLOR[n.cat] || CAT_COLOR.other;
        const emo = emotions[n.id];
        const pulse = emo ? 1 + 0.4 * Math.abs(Math.sin(t * 0.06 + n.angle)) : 1;
        const baseR = 3 + (emo?.intensity ? emo.intensity * 3 : 0);
        const rNode = baseR * pulse;

        // Glow
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rNode * 4);
        grad.addColorStop(0, color + 'cc');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rNode * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rNode, 0, Math.PI * 2);
        ctx.fill();
      }

      t++;
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const onClick = (ev: MouseEvent) => {
      const rectC = canvas.getBoundingClientRect();
      const px = ev.clientX - rectC.left;
      const py = ev.clientY - rectC.top;
      let best = -1; let bestD = 999;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - px, n.y - py);
        if (d < bestD && d < 14) { bestD = d; best = i; }
      });
      if (best >= 0) onSelect?.(nodes[best].id);
    };
    canvas.addEventListener('click', onClick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('click', onClick);
    };
  }, [nodes, edges, emotions, onSelect]);

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[320px] rounded-2xl overflow-hidden bg-gradient-to-b from-background/40 to-background/80 border border-border/40">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {agents.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-xs font-mono text-muted-foreground/40">
          building agent network…
        </div>
      )}
    </div>
  );
}
