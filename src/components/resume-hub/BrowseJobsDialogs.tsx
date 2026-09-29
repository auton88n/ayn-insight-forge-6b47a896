// The two dialogs opened from the Browse Jobs toolbar. Extracted from
// BrowseJobs.tsx; markup and behaviour are unchanged. All state stays in
// BrowseJobs, these only render what they are handed.
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type resumeHubApi } from "@/lib/resumeHub";
import { humanizeCategory } from "@/lib/jobPostingFormat";

export type RoleFit = { title: string; match_pct: number; openings: number; companies: string[]; sample_job_id: string };
export type TrendingData = Awaited<ReturnType<typeof resumeHubApi.jobBoardTrending>>;

interface RoleFinderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: boolean;
  roles: RoleFit[] | null;
  hasProfile: boolean;
  onRetry: () => void;
  onPick: (title: string) => void;
  onOpenProfile: () => void;
}

// v3.151.0 — real job titles, scored the same free way every card
// already is, grouped from the live catalog instead of guessed by
// an AI. Picking one filters the list to real postings under it.
export function RoleFinderDialog({ open, onOpenChange, loading, error, roles, hasProfile, onRetry, onPick, onOpenProfile }: RoleFinderDialogProps) {
  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Roles that fit you</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground -mt-2">
        Real job titles from postings open right now, ranked by the same quick match every card shows. Not a guess at demand, just a count of what's actually listed.
      </p>
      <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
        ) : error ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Couldn't load this right now.</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : !roles || roles.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {hasProfile
                ? "Nothing in today's postings scored well against your profile yet. Check back as new jobs come in."
                : "Add a resume or a few skills to Profile first, then AYN can find roles that fit you."}
            </p>
            {!hasProfile && (
              <Button type="button" size="sm" onClick={() => { onOpenChange(false); onOpenProfile(); }}>
                Open Profile
              </Button>
            )}
          </div>
        ) : (
          roles.map((r) => (
            <button
              key={r.title}
              type="button"
              onClick={() => onPick(r.title)}
              className="w-full text-left rounded-md border border-border/60 px-3 py-2.5 hover:bg-muted transition flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.openings} open posting{r.openings === 1 ? "" : "s"}{r.companies.length ? ` · ${r.companies.slice(0, 2).join(", ")}${r.companies.length > 2 ? "…" : ""}` : ""}
                </p>
              </div>
              <span
                className="shrink-0 text-xs font-semibold rounded-full px-2 py-1"
                style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}
              >
                {r.match_pct}%
              </span>
            </button>
          ))
        )}
      </div>
    </DialogContent>
  </Dialog>
  );
}

interface TrendingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: string[];
  city: string | null;
  onPickCity: (city: string | null) => void;
  loading: boolean;
  error: boolean;
  data: TrendingData | null;
  onRetry: () => void;
}

// v3.166.0 — real posting volume, nationally and by chosen city, over
// the last 3 days. Never a guessed demand number, always a real count
// of what's actually landing on file right now.
export function TrendingDialog({ open, onOpenChange, cities, city, onPickCity, loading, error, data, onRetry }: TrendingDialogProps) {
  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Trending right now</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground -mt-2">
        Real posting volume from the last 3 days, across every region AYN tracks. Not a guess at demand, just a count of what's actually landing.
      </p>

      {cities.length > 0 && (
        <Select
          value={city ?? "__national"}
          onValueChange={(v) => onPickCity(v === "__national" ? null : v)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All tracked locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__national">All tracked locations</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        </div>
      ) : error ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Couldn't load this right now.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : (() => {
        const scope = city && data?.city ? data.city : data?.national;
        const byCategory = scope && "byCategory" in scope ? scope.byCategory : [];
        const byCompany = scope && "byCompany" in scope ? scope.byCompany : [];
        if (!byCategory.length && !byCompany.length) {
          return <p className="py-6 text-center text-sm text-muted-foreground">Nothing landed here in the last 3 days.</p>;
        }
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">By role</p>
              <div className="space-y-1">
                {byCategory.map((r) => (
                  <div key={r.category} className="flex items-start justify-between gap-2 text-sm py-1">
                    <span>{humanizeCategory(r.category)}</span>
                    <span className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">By company</p>
              <div className="space-y-1">
                {byCompany.map((r) => (
                  <div key={r.company} className="flex items-start justify-between gap-2 text-sm py-1">
                    <span>{r.company}</span>
                    <span className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </DialogContent>
  </Dialog>
  );
}
