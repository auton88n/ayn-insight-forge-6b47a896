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

/**
 * Thin ember progress line fixed to the top of the window, like the one on
 * GitHub or YouTube. It waits a moment before appearing (most loads finish
 * inside that window, so nothing blinks) and then fades in. The page itself
 * shows no spinner at all.
 */
function TopProgress({ delayMs }: { delayMs: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  return (
    <div className="ayn-top-progress" data-show={show ? 'true' : 'false'} role="progressbar" aria-label="Loading">
      <span />
    </div>
  );
}

/** Full viewport version, used for route level suspense fallbacks. */
export function AynLoaderScreen({ delayMs = 300 }: { label?: string; delayMs?: number }) {
  return (
    <div className="min-h-screen" role="status" aria-live="polite">
      <TopProgress delayMs={delayMs} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * In-page version, used while a tab's content chunk loads. It reserves a
 * screenful of height (invisible) so the footer below it stays off screen
 * until the content arrives and cannot jump.
 */
export function AynLoaderBlock({ delayMs = 300 }: { delayMs?: number }) {
  return (
    <div style={{ minHeight: '100vh' }} role="status" aria-live="polite">
      <TopProgress delayMs={delayMs} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default AynLoader;
