import { cn } from '@/lib/utils';

const AYN_MARK = '/ayn-mark.png';

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
          className="absolute inset-0 rounded-full bg-primary/20 blur-2xl ayn-loader-glow"
        />
        {/* rotating arc */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/40 ayn-loader-arc"
        />
        {/* the mark */}
        <img
          src={aynMark.url}
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

/** Full viewport version, used for route level suspense fallbacks. */
export function AynLoaderScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <AynLoader size="lg" label={label} />
    </div>
  );
}

export default AynLoader;
