import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const EMBER = '#e85d3a';

const AYN_MARK = '/ayn-mark.svg';

const SIZES = {
  sm: { box: 40, ring: 60 },
  md: { box: 56, ring: 84 },
  lg: { box: 76, ring: 112 },
} as const;

export type AynLoaderSize = keyof typeof SIZES;

/**
 * The AYN mark, breathing, inside a rotating ember arc.
 * Pure CSS keyframes so it stays cheap during route transitions.
 */
export function AynLoader({
  size = 'md',
  label,
  className,
}: {
  size?: AynLoaderSize;
  label?: string;
  className?: string;
}) {
  const { box, ring } = SIZES[size];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center', className)}>
      <div className="relative flex items-center justify-center" style={{ width: ring, height: ring }}>
        {/* the only moving part: one steady ember arc */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-transparent ayn-loader-arc"
          style={{ borderTopColor: EMBER, borderRightColor: 'rgba(232, 93, 58, 0.35)' }}
        />
        <img
          src={AYN_MARK}
          alt=""
          aria-hidden
          className="relative select-none"
          style={{ width: box, height: box }}
          draggable={false}
        />
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** One grey shape. Shimmers softly; static when the visitor prefers reduced motion. */
function Bone({ w = '100%', h = 16, r = 10, className }: { w?: number | string; h?: number; r?: number; className?: string }) {
  return <span aria-hidden className={cn('ayn-skel', className)} style={{ width: w, height: h, borderRadius: r }} />;
}

/**
 * The shape of a page's content: heading block, a few lines of text, a row of
 * cards and a list. It sits inside the page's own section and shell classes, so
 * it occupies exactly the space real content will, and nothing jumps when the
 * real page replaces it. Reserves a screenful of height so the footer below it
 * stays off screen until content is in place.
 */
function ContentSkeleton() {
  return (
    <section className="lp-section" style={{ minHeight: '100vh' }}>
      <div className="lp-shell ayn-skel-in">
        <Bone w={96} h={26} r={999} />
        <div style={{ height: 18 }} />
        <Bone w="58%" h={44} r={12} />
        <div style={{ height: 22 }} />
        <Bone w="80%" h={16} />
        <div style={{ height: 10 }} />
        <Bone w="64%" h={16} />
        <div className="ayn-skel-cards">
          {[0, 1, 2].map((i) => <Bone key={i} w="100%" h={150} r={20} />)}
        </div>
        <div className="ayn-skel-rows">
          {[0, 1, 2, 3].map((i) => <Bone key={i} w="100%" h={64} r={16} />)}
        </div>
      </div>
    </section>
  );
}

/** Sidebar (desktop) and top bar (phone) skeletons, sized like the real ones. */
function ShellSkeleton() {
  return (
    <>
      <aside className="lp-sidebar" aria-hidden>
        <div className="lp-sidebar-top"><Bone w={64} h={24} r={8} /></div>
        <div style={{ padding: '8px 14px', display: 'grid', gap: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Bone key={i} w={i % 3 === 0 ? '70%' : '86%'} h={18} r={8} />)}
        </div>
      </aside>
      <div className="lp-sidebar-mobile-bar" aria-hidden>
        <Bone w={64} h={22} r={8} />
        <Bone w={28} h={22} r={8} />
      </div>
    </>
  );
}

/** Full page version, used for route level suspense fallbacks. */
export function AynLoaderScreen(_props: { label?: string; delayMs?: number }) {
  // The dark app screens (admin, settings) have no cream page shell to mirror,
  // so a cream skeleton would flash light on a dark page. Keep those blank.
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return <div className="min-h-screen" role="status" aria-label="Loading"><span className="sr-only">Loading</span></div>;
  }
  return (
    <div className="lp lp-shell-with-sidebar" role="status" aria-live="polite" aria-label="Loading">
      <ShellSkeleton />
      <main className="lp-sidebar-main">
        <ContentSkeleton />
      </main>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** In-page version, used while a tab's content chunk loads inside the existing shell. */
export function AynLoaderBlock(_props: { delayMs?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <ContentSkeleton />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default AynLoader;
