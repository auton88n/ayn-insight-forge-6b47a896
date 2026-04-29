/**
 * AgentParticleField v2 — same clean dot aesthetic as GraphCanvas.
 * Small colored dots + thin lines. No emoji. No glow. Minimal.
 */
import { useEffect, useRef } from 'react';
import { EnginAgent } from '@/lib/enginApi';

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

interface Props {
  agents:   EnginAgent[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading:  boolean;
}

export function AgentParticleField({ agents, emotions, loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const nodesRef  = useRef<{id:string;cat:string;x:number;y:number;vx:number;vy:number}[]>([]);
  const frameRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !agents.length) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    nodesRef.current = agents.map(a => ({
      id:  a.id,
      cat: a.category || 'other',
      x:   W * 0.1 + Math.random() * W * 0.8,
      y:   H * 0.1 + Math.random() * H * 0.8,
      vx:  (Math.random() - 0.5) * 0.4,
      vy:  (Math.random() - 0.5) * 0.4,
    }));

    const draw = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, W, H);
      const nodes = nodesRef.current;

      nodes.forEach(n => {
        if (loading) {
          n.vx += (W/2 - n.x) * 0.00008;
          n.vy += (H/2 - n.y) * 0.00008;
        }
        n.vx *= 0.92; n.vy *= 0.92;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 4 || n.x > W-4) n.vx *= -0.8;
        if (n.y < 4 || n.y > H-4) n.vy *= -0.8;
      });

      // Proximity lines
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x-b.x, a.y-b.y);
          if (d > 75) continue;
          const alpha = (1 - d/75) * (loading ? 0.22 : 0.12);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `#06b6d4${Math.round(alpha*255).toString(16).padStart(2,'0')}`;
          ctx.stroke();
        }
      }

      // Dots
      nodes.forEach(n => {
        const em    = emotions[n.id];
        const color = CAT_COLOR[n.cat] || '#64748b';
        const r = 2.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI*2);
        ctx.fillStyle = color + (loading ? 'ee' : 'aa');
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [agents, emotions, loading]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      {loading && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400/50 uppercase tracking-[0.3em] animate-pulse">
          simulation running
        </div>
      )}
    </div>
  );
}
