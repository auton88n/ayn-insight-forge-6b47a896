/**
 * AYN Premium UI — GlinUI-inspired components (github.com/glincker/glinui)
 *
 * All effects adapted for AYN's dark monochrome theme.
 * No color changes — only surface physics, motion, and light refraction upgrades.
 *
 * Components:
 *  - SpotlightCard   — radial spotlight follows cursor (GlinUI SpotlightCard)
 *  - BorderBeam      — animated beam travels around border (GlinUI BorderBeam)
 *  - GlowBorder      — rotating conic-gradient glow ring (GlinUI GlowBorder)
 *  - ShimmerButton   — shimmer sweep animation on hover (GlinUI ShimmerButton)
 *  - PulsatingButton — pulsing ring on active/live states (GlinUI PulsatingButton)
 *  - GlassCard       — Apple Liquid Glass surface (GlinUI GlassCard)
 *  - MagneticButton  — button follows cursor magnetically (GlinUI MagneticCTA)
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ─── CSS injected once ────────────────────────────────────────────────────────
const PREMIUM_KEYFRAMES = `
@keyframes ayn-border-beam {
  to { offset-distance: 100%; }
}
@keyframes ayn-glow-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ayn-shimmer-sweep {
  0%   { transform: translateX(-100%) skewX(-12deg); }
  100% { transform: translateX(200%)  skewX(-12deg); }
}
@keyframes ayn-pulsate-ring {
  0%   { box-shadow: 0 0 0 0   var(--ayn-pulse-color, rgba(0,255,200,0.4)); opacity: 1; }
  70%  { box-shadow: 0 0 0 10px var(--ayn-pulse-color, rgba(0,255,200,0)); opacity: 0.6; }
  100% { box-shadow: 0 0 0 0   var(--ayn-pulse-color, rgba(0,255,200,0)); opacity: 0; }
}
@keyframes ayn-ripple {
  0%   { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(2.4); opacity: 0; }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = PREMIUM_KEYFRAMES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ─── SpotlightCard ────────────────────────────────────────────────────────────
// Radial white spotlight follows the cursor inside the card.
// From GlinUI SpotlightCard — adapted for dark surfaces.
interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  spotlightColor?: string;
  spotlightSize?: number;
}

export function SpotlightCard({
  className, children, onMouseMove, onMouseLeave, spotlightColor, spotlightSize = 280, ...props
}: SpotlightCardProps) {
  useEffect(() => { injectStyles(); }, []);
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--spot-x', `${(e.clientX - rect.left).toFixed(1)}px`);
    ref.current.style.setProperty('--spot-y', `${(e.clientY - rect.top).toFixed(1)}px`);
    setActive(true);
    onMouseMove?.(e);
  }, [onMouseMove]);

  const handleLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setActive(false);
    onMouseLeave?.(e);
  }, [onMouseLeave]);

  const color = spotlightColor ?? 'rgba(255,255,255,0.07)';

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...props}
    >
      {/* Spotlight overlay */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(${spotlightSize}px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${color}, transparent 70%)`,
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

// ─── BorderBeam ───────────────────────────────────────────────────────────────
// A glowing beam sweeps around the border continuously.
// From GlinUI BorderBeam.
interface BorderBeamProps {
  duration?: number;
  delay?: number;
  size?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
}

export function BorderBeam({
  duration = 6, delay = 0, size = 80,
  colorFrom = 'rgba(0,255,200,0.8)',
  colorTo = 'transparent',
  className,
}: BorderBeamProps) {
  useEffect(() => { injectStyles(); }, []);
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit]',
        '[mask-clip:padding-box,border-box] [mask-composite:intersect]',
        'border border-transparent',
        '[mask-image:linear-gradient(transparent,transparent),linear-gradient(#fff,#fff)]',
        className
      )}
    >
      <div
        style={{
          position: 'absolute',
          width: size,
          aspectRatio: '1',
          offsetPath: 'rect(0 auto auto 0 round inherit)',
          animationDelay: `${delay}s`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo})`,
          animation: `ayn-border-beam ${duration}s linear infinite`,
        } as React.CSSProperties}
      />
    </div>
  );
}

// ─── GlowBorder ──────────────────────────────────────────────────────────────
// Rotating conic-gradient glow ring. Wraps any content.
// From GlinUI GlowBorder.
interface GlowBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  duration?: number;
  glowColor?: string;
  borderRadius?: string;
  innerClassName?: string;
}

export function GlowBorder({
  className, children, duration = 5,
  glowColor = 'rgba(0,255,200,0.6)',
  borderRadius = '1rem',
  innerClassName,
  style, ...props
}: GlowBorderProps) {
  useEffect(() => { injectStyles(); }, []);
  return (
    <div className={cn('relative', className)} style={{ borderRadius, ...style }} {...props}>
      {/* Rotating conic glow */}
      <div aria-hidden className="absolute -inset-px overflow-hidden rounded-[inherit]">
        <div
          style={{
            position: 'absolute',
            inset: '-100%',
            background: `conic-gradient(from 0deg, transparent 0%, ${glowColor} 10%, transparent 20%)`,
            animation: `ayn-glow-rotate ${duration}s linear infinite`,
          }}
        />
      </div>
      {/* Content */}
      <div className={cn('relative rounded-[inherit]', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

// ─── ShimmerButton ────────────────────────────────────────────────────────────
// Shimmer sweep plays on hover. Perfect for CTA and action buttons.
// From GlinUI ShimmerButton.
interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerOnHover?: boolean;
}

export function ShimmerButton({
  className, children, shimmerColor = 'rgba(255,255,255,0.15)',
  shimmerOnHover = true, ...props
}: ShimmerButtonProps) {
  useEffect(() => { injectStyles(); }, []);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      className={cn('relative inline-flex items-center justify-center overflow-hidden', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      {/* Shimmer layer */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
          animation: (!shimmerOnHover || hovered)
            ? 'ayn-shimmer-sweep 1.2s ease-in-out'
            : 'none',
          animationFillMode: 'forwards',
        }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

// ─── PulsatingButton ──────────────────────────────────────────────────────────
// Live pulsing ring — perfect for LIVE badges and active states.
// From GlinUI PulsatingButton.
interface PulsatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pulseColor?: string;
  pulseDuration?: number;
  pulseRings?: number;
}

export function PulsatingButton({
  className, children, pulseColor = 'rgba(0,255,200,0.5)',
  pulseDuration = 2, pulseRings = 1, ...props
}: PulsatingButtonProps) {
  useEffect(() => { injectStyles(); }, []);
  return (
    <button className={cn('relative inline-flex items-center justify-center', className)} {...props}>
      {Array.from({ length: pulseRings }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            boxShadow: `0 0 0 0 ${pulseColor}`,
            border: `1px solid ${pulseColor}`,
            animation: `ayn-pulsate-ring ${pulseDuration}s ease-out ${i * (pulseDuration / pulseRings)}s infinite`,
          }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

// ─── GlassCard ────────────────────────────────────────────────────────────────
// Apple Liquid Glass surface — backdrop blur + saturate + top-edge refraction.
// Adapted from GlinUI GlassCard design tokens for dark surfaces.
interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  blur?: 'sm' | 'md' | 'lg';
  lift?: boolean; // hover lift effect
}

export function GlassCard({
  className, children, blur = 'md', lift = true, style, ...props
}: GlassCardProps) {
  const blurPx = { sm: '8px', md: '16px', lg: '28px' }[blur];
  return (
    <div
      className={cn(
        'relative rounded-2xl border transition-all duration-300',
        // Top-edge refraction border (brighter on top, per GlinUI spec)
        'border-white/8',
        '[border-top-color:rgba(255,255,255,0.14)]',
        // Glass surface
        'bg-white/[0.04]',
        // Hover state
        lift && 'hover:-translate-y-0.5 hover:bg-white/[0.07] hover:border-white/12 hover:[border-top-color:rgba(255,255,255,0.22)]',
        // Shadow
        'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_1px_0_rgba(255,255,255,0.05)_inset]',
        'hover:shadow-[0_16px_48px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.08)_inset]',
        className
      )}
      style={{
        backdropFilter: `saturate(180%) blur(${blurPx})`,
        WebkitBackdropFilter: `saturate(180%) blur(${blurPx})`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── MagneticButton ───────────────────────────────────────────────────────────
// Button follows cursor with magnetic pull within a radius.
// From GlinUI MagneticCTA.
interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  maxOffset?: number;
  magnetRadius?: number;
}

export function MagneticButton({
  className, children, maxOffset = 6, magnetRadius = 80, ...props
}: MagneticButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((e: React.MouseEvent) => {
    if (!wrapRef.current || !btnRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > magnetRadius) { reset(); return; }
    const strength = 1 - dist / magnetRadius;
    btnRef.current.style.transform =
      `translate3d(${(dx / dist) * maxOffset * strength}px, ${(dy / dist) * maxOffset * strength}px, 0)`;
  }, [magnetRadius, maxOffset]);

  const reset = useCallback(() => {
    if (btnRef.current) btnRef.current.style.transform = 'translate3d(0,0,0)';
  }, []);

  return (
    <div ref={wrapRef} className="inline-flex" onMouseMove={handleMove} onMouseLeave={reset}>
      <button
        ref={btnRef}
        className={cn('transition-transform duration-150 ease-out', className)}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}

// ─── Convenience: SpotlightCard + BorderBeam combo ────────────────────────────
// Combines spotlight tracking + border beam for max premium feel.
interface PremiumCardProps extends SpotlightCardProps {
  beamColor?: string;
  beamDuration?: number;
  showBeam?: boolean;
}

export function PremiumCard({
  className, children, beamColor, beamDuration = 6, showBeam = true, ...props
}: PremiumCardProps) {
  return (
    <SpotlightCard
      className={cn(
        // Glass surface (matching GlassCard)
        'border border-white/8 [border-top-color:rgba(255,255,255,0.14)] bg-white/[0.04]',
        'backdrop-blur-[16px] [backdrop-filter:saturate(180%)_blur(16px)]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]',
        'hover:-translate-y-0.5 hover:bg-white/[0.07]',
        'hover:shadow-[0_16px_48px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'transition-all duration-300 rounded-2xl',
        className
      )}
      {...props}
    >
      {showBeam && (
        <BorderBeam
          colorFrom={beamColor ?? 'rgba(0,255,200,0.7)'}
          colorTo="transparent"
          duration={beamDuration}
        />
      )}
      {children}
    </SpotlightCard>
  );
}
