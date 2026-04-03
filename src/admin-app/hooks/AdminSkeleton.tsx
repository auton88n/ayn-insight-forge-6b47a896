/**
 * Admin skeleton loading components.
 * Replaces generic <Loader2 animate-spin /> with content-shaped placeholders
 * that reduce perceived load time and prevent layout shift.
 */

export function AdminSkeleton({ rows = 5, variant = 'table' }: { rows?: number; variant?: 'table' | 'cards' | 'stats' | 'chart' }) {
  if (variant === 'stats') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 animate-in fade-in duration-200">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-4">
            <div className="h-3 w-16 bg-muted rounded-md mb-3 animate-pulse" />
            <div className="h-8 w-24 bg-muted rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-muted rounded-md mb-2 animate-pulse" />
                <div className="h-3 w-48 bg-muted rounded-md animate-pulse" />
              </div>
            </div>
            <div className="h-3 w-full bg-muted/60 rounded-md animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-5 animate-in fade-in duration-200">
        <div className="h-4 w-40 bg-muted rounded-md mb-4 animate-pulse" />
        <div className="h-48 w-full bg-muted/40 rounded-lg animate-pulse" />
      </div>
    );
  }

  // Table variant (default)
  return (
    <div className="space-y-2 animate-in fade-in duration-200">
      {/* Search bar skeleton */}
      <div className="h-10 w-64 bg-muted rounded-lg mb-4 animate-pulse" />
      {/* Table header */}
      <div className="flex gap-4 px-4 py-3 border-b border-border/50">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 bg-muted rounded-md animate-pulse" style={{ width: `${20 + i * 5}%` }} />
        ))}
      </div>
      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-border/30" style={{ opacity: 1 - i * 0.1 }}>
          <div className="h-3 w-[25%] bg-muted/70 rounded-md animate-pulse" />
          <div className="h-3 w-[30%] bg-muted/70 rounded-md animate-pulse" />
          <div className="h-3 w-[15%] bg-muted/70 rounded-md animate-pulse" />
          <div className="h-3 w-[20%] bg-muted/70 rounded-md animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** Wrap a component with skeleton: shows skeleton while loading, content when ready */
export function AdminQueryWrapper({
  isLoading,
  error,
  children,
  skeleton = <AdminSkeleton />,
}: {
  isLoading: boolean;
  error: Error | null;
  children: React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="text-center">
          <p className="text-sm mb-2">Failed to load data</p>
          <p className="text-xs text-muted-foreground/60">{error.message}</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
