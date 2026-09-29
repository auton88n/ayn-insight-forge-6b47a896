// The heading and the sort / discovery / view toolbar above the Browse Jobs
// list. Extracted from BrowseJobs.tsx; markup and behaviour are unchanged.
// Renders a fragment so its blocks stay direct children of the page's
// vertical stack.
import { Button } from "@/components/ui/button";
import { Clock, Compass, Layers, List, ShieldCheck, TrendingUp, Wand2 } from "lucide-react";

interface BrowseToolbarProps {
  newestFirst: boolean;
  onToggleNewest: () => void;
  onOpenTrending: () => void;
  onOpenRoles: () => void;
  matchMode: boolean;
  onToggleMatchMode: () => void;
  /** Profile's desired locations, shown while "Match me" is on. */
  desiredLocations: string[] | null;
  onOpenProfile: () => void;
  viewMode: "list" | "swipe";
  onViewModeChange: (mode: "list" | "swipe") => void;
}

export function BrowseToolbar({
  newestFirst, onToggleNewest, onOpenTrending, onOpenRoles, matchMode, onToggleMatchMode,
  desiredLocations, onOpenProfile, viewMode, onViewModeChange,
}: BrowseToolbarProps) {
  return (
    <>
    {/* v3.167.0 — reported directly: the toolbar visibly jumped up and
        down. Real cause: title and toolbar shared one flex-wrap row, so
        whenever a button's own label changed length ("Best match" <->
        "Newest", "Match me" <-> "Showing my matches") the row's total
        width crossed the wrap threshold and the toolbar jumped between
        sharing the title's line and wrapping below it. Stacked into two
        always-separate rows instead -- the toolbar's vertical position
        can no longer depend on any button's text length. Each button
        also gets a fixed min-width so its own label change doesn't
        shift its neighbors horizontally either. */}
    {/* v3.273.0 -- swapped the thin accent-dash heading for the site's
        real .lp-eyebrow pill (see JobsTab.tsx's own note on this same
        pass for the full reasoning). */}
    <div>
      <h3 className="lp-eyebrow" style={{ marginBottom: 8 }}>Browse jobs</h3>
      {/* v3.169.0 — asked directly to research what people actually say
          about LinkedIn and Indeed, then use it as an advantage. Ghost
          and fake listings came back as the single most-repeated
          complaint across every real source checked (surveys put it
          around 40% of job seekers, and it's a named driver of why
          people now blanket-apply to hundreds of jobs at once instead
          of trusting any one posting). This was already true and
          already stated as plain body text; given real weight instead —
          a shield icon and its own line — since research says this is
          exactly the thing worth leading with, not burying.
          v3.171.0 — recolored to the new trust teal, matching the same
          signal repeated in the detail pane below. */}
      <p className="text-sm mt-1.5 flex items-center gap-1.5 font-semibold" style={{ color: "var(--rh-trust)" }}>
        <ShieldCheck className="w-4 h-4 shrink-0" />
        Every posting comes straight from a real company's own hiring system. Never LinkedIn, Indeed, or a third-party aggregator.
      </p>
    </div>
    {/* v3.185.0 — reported directly from a mobile screenshot: the
        List/Swipe toggle used ml-auto inside the SAME wrapping row as the
        sort/discovery buttons, so once that row actually wrapped on a
        narrow screen, ml-auto flung the toggle onto its own line pinned
        hard against the right edge -- stranded, with no visual
        connection to anything above it. Splitting the sort cluster and
        the view toggle into two real sibling flex items under one
        justify-between row fixes both widths at once: wide screens still
        get the exact same left-cluster/right-toggle layout (justify-
        between does what ml-auto used to), and a narrow screen's second
        line now left-aligns directly under the sort buttons instead of
        floating disconnected on the right. */}
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleNewest}
          className="text-xs text-muted-foreground min-w-[104px] justify-start"
        >
          <Clock className="w-3.5 h-3.5 mr-1.5 shrink-0" />{newestFirst ? "Newest" : "Best match"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenTrending} className="text-xs text-muted-foreground">
          <TrendingUp className="w-3.5 h-3.5 mr-1.5" />Trending
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenRoles} className="text-xs text-muted-foreground">
          <Compass className="w-3.5 h-3.5 mr-1.5" />Explore roles
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onToggleMatchMode}
          style={matchMode ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" } : undefined}
          variant={matchMode ? undefined : "outline"}
          className={matchMode ? "hover:opacity-90 ml-1 min-w-[132px] justify-start" : "ml-1 min-w-[132px] justify-start"}
        >
          <Wand2 className="w-4 h-4 mr-1.5 shrink-0" />{matchMode ? "Showing my matches" : "Match me"}
        </Button>
      </div>

      {/* v3.171.0 — "swipe to decide," a genuinely second way to move
          through the same filtered/scored jobs, not a reskin of the
          list. A plain segmented toggle, not its own nav item, since
          it's a view of the same data rather than a different page. */}
      <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--rh-raised)" }}>
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition"
          style={viewMode === "list" ? { background: "var(--rh-surface)", color: "var(--rh-ink)", boxShadow: "var(--rh-shadow-card)" } : { color: "var(--rh-muted)" }}
        >
          <List className="w-3.5 h-3.5" />List
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("swipe")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition"
          style={viewMode === "swipe" ? { background: "var(--rh-gradient)", color: "#fff", boxShadow: "var(--rh-glow)" } : { color: "var(--rh-muted)" }}
        >
          <Layers className="w-3.5 h-3.5" />Swipe
        </button>
      </div>
    </div>

    {matchMode && (
      <p className="text-xs text-muted-foreground -mt-2">
        Sorted by fit, filtered to {desiredLocations?.length === 1 ? "the location" : "the locations"} you set in Profile:{" "}
        <span className="text-foreground font-medium">{desiredLocations?.join(", ")}</span>.{" "}
        <button type="button" className="underline hover:text-foreground" onClick={onOpenProfile}>Change this</button>
      </p>
    )}
    </>
  );
}
