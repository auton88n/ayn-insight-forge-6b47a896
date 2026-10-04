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
    <div className={cn('flex flex-col items-center justify-center gap-4 text-center', className)}>
      <div className="relative flex items-center justify-center" style={{ width: ring, height: ring }}>
        {/* ember glow */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full blur-2xl ayn-loader-glow"
          style={{ background: 'rgba(232, 93, 58, 0.2)' }}
        />
        {/* rotating arc */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-transparent ayn-loader-arc"
          style={{ borderTopColor: EMBER, borderRightColor: 'rgba(232, 93, 58, 0.4)' }}
        />
        {/* the mark */}
        <img
          src={AYN_MARK}
          alt=""
          aria-hidden
          className="relative ayn-loader-mark select-none"
          style={{ width: box, height: box }}
          draggable={false}
        />
      </div>
      {label ? (
        <p className="text-sm text-muted-foreground ayn-loader-label">{label}</p>
      ) : null}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Full viewport version, used for route level suspense fallbacks. It adds no
 * background of its own (the page canvas is already painted by the theme
 * script, so there is no white or dark flash) and stays invisible for the
 * first moment: most routes finish loading inside that window, and a spinner
 * that blinks on and off for a fraction of a second reads as a flicker.
 */
export function AynLoaderScreen({ label = 'Loading', delayMs = 350 }: { label?: string; delayMs?: number }) {
  const [show, setShow] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);

  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      {show ? <AynLoader size="lg" label={label} /> : <span className="sr-only">Loading</span>}
    </div>
  );
}

/**
 * In-page version, used while a tab's content chunk loads. It reserves a
 * screenful of height so the footer below it does not sit high and then
 * jump down when the content arrives, and it waits a moment before showing.
 */
export function AynLoaderBlock({ delayMs = 350 }: { delayMs?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '110vh', alignItems: 'flex-start', paddingTop: '30vh' }} role="status" aria-live="polite">
      {show ? <AynLoader size="lg" label="Loading" /> : <span className="sr-only">Loading</span>}
    </div>
  );
}

export default AynLoader;
