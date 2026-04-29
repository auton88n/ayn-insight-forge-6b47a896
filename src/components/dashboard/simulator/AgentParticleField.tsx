/**
 * AgentParticleField — Live particle visualization of the 87-agent society.
 * Each particle = one agent. Color = category. Size = activity level.
 * Pulses and connects as agents react during simulation.
 */
import { useEffect, useRef } from 'react';
import { EnginAgent } from '@/lib/enginApi';

interface Props {
  agents: EnginAgent[];
  emotions: Record<string, { emotion: string; intensity?: number }>;
  loading: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  government:   '#3b82f6', // blue
  central_bank: '#f59e0b', // amber
  stock_market: '#10b981', // emerald
  bank:         '#8b5cf6', // violet
  company:      '#06b6d4', // cyan
  media:        '#ef4444', // red
  religion:     '#f97316', // orange
  social_class: '#84cc16', // lime
  persona:      '#ec4899', // pink
};

const EMOTION_INTENSITY: Record<string, number> = {
  panic: 1.8, fear: 1.5, anger: 1.6, excited: 1.7,
  optimistic: 1.3, cautious: 1.0, neutral: 0.8, calm: 0.7,
};

export function AgentParticleField({ agents, emotions, loading }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const animRef    = useRef<number>(0);
  const nodesRef   = useRef<AgentNode[]>([]);
  const frameRef   = useRef(0);

  interface AgentNode {
    id: string; name: string; category: string; flag: string;
    x: number; y: number; vx: number; vy: number;
    r: number; color: string; alpha: number;
    emotion: string; intensity: number;
    connections: number[];
  }

  useEffect(() => {
    if (!agents.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    // Build nodes from agents
    nodesRef.current = agents.map((a, i) => {
      const angle = (i / agents.length) * Math.PI * 2;
      const r_orbit = Math.random() * 0.35 + 0.15; // 15-50% from center
      const em = emotions[a.id] || { emotion: 'neutral', intensity: 0.5 };
      const emIntensity = EMOTION_INTENSITY[em.emotion] || 1;
      return {
        id: a.id,
        name: a.name,
        category: a.category || 'persona',
        flag: a.flag || '🌐',
        x: W / 2 + Math.cos(angle) * W * r_orbit,
        y: H / 2 + Math.sin(angle) * H * r_orbit,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: a.category === 'persona' ? 3 : 5,
        color: CATEGORY_COLORS[a.category] || '#94a3b8',
        alpha: 0.7,
        emotion: em.emotion,
        intensity: emIntensity,
        connections: [],
      };
    });

    // Build sparse connection graph
    nodesRef.current.forEach((node, i) => {
      const maxConn = node.category === 'persona' ? 2 : 4;
      for (let j = 0; j < maxConn; j++) {
        const target = Math.floor(Math.random() * nodesRef.current.length);
        if (target !== i) node.connections.push(target);
      }
    });

    const ctx = canvas.getContext('2d')!;

    const draw = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, W, H);

      const nodes = nodesRef.current;
      const t = frameRef.current;
      const pulse = loading ? 1 + 0.3 * Math.sin(t * 0.05) : 1;

      // Draw connections
      nodes.forEach((node, i) => {
        node.connections.forEach(j => {
          const other = nodes[j];
          if (!other) return;
          const dist = Math.hypot(node.x - other.x, node.y - other.y);
          if (dist > 250) return;
          const alpha = (1 - dist / 250) * 0.15 * (loading ? pulse : 1);
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.strokeStyle = `${node.color}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        });
      });

      // Draw nodes
      nodes.forEach(node => {
        // Update position
        node.x += node.vx;
        node.y += node.vy;

        // Soft boundary
        if (node.x < 20 || node.x > W - 20) node.vx *= -0.8;
        if (node.y < 20 || node.y > H - 20) node.vy *= -0.8;

        // Gentle gravity toward center when loading
        if (loading) {
          node.vx += (W/2 - node.x) * 0.0001;
          node.vy += (H/2 - node.y) * 0.0001;
        }

        // Speed cap
        const speed = Math.hypot(node.vx, node.vy);
        if (speed > 1.5) { node.vx = (node.vx/speed)*1.5; node.vy = (node.vy/speed)*1.5; }

        const r = node.r * node.intensity * pulse;
        const alpha = node.alpha * (loading ? pulse : 1);

        // Glow
        const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 3);
        grd.addColorStop(0, `${node.color}60`);
        grd.addColorStop(1, `${node.color}00`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `${node.color}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`;
        ctx.fill();

        // Flag label for institutional agents
        if (node.category !== 'persona' && node.r >= 5) {
          ctx.font = `${Math.round(r * 2)}px serif`;
          ctx.fillText(node.flag, node.x - r, node.y + r * 0.4);
        }
      });

      // "SIMULATING" pulse overlay
      if (loading) {
        ctx.font = '10px monospace';
        ctx.fillStyle = `rgba(6,182,212,${0.3 + 0.2 * Math.sin(t * 0.08)})`;
        ctx.textAlign = 'center';
        ctx.fillText('● SIMULATION RUNNING', W / 2, H - 16);
        ctx.textAlign = 'left';
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [agents, emotions, loading]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
        {Object.entries(CATEGORY_COLORS).slice(0, 5).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-mono text-muted-foreground/50 capitalize">
              {cat.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Agent count */}
      <div className="absolute top-3 right-4 text-[10px] font-mono text-muted-foreground/40">
        {agents.length} agents active
      </div>
    </div>
  );
}
