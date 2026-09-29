// The search box, location picker and filters menu of the Browse Jobs page.
// Extracted from BrowseJobs.tsx; markup and behaviour are unchanged. Each one
// only renders what it is handed: the open/closed flags, the outside-click
// refs and the state all still live in BrowseJobs.
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ChevronDown, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeCategory, humanizeSlug } from "@/lib/jobPostingFormat";
import type { groupByRegion } from "@/lib/locationRegion";
import { POSTED_WITHIN_OPTIONS } from "./browseJobsHelpers";

export type SearchSuggestion = { v: string; kind: "title" | "company" };

interface SearchBoxProps {
  boxRef: RefObject<HTMLDivElement>;
  value: string;
  onType: (value: string) => void;
  onFocus: () => void;
  open: boolean;
  suggestions: SearchSuggestion[];
  onPick: (value: string) => void;
}

export function SearchBox({ boxRef, value, onType, onFocus, open, suggestions, onPick }: SearchBoxProps) {
  return (
  <div className="relative flex-1" ref={boxRef}>
    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={value}
      onChange={(e) => onType(e.target.value)}
      onFocus={onFocus}
      placeholder="Search by title or company"
      className="pl-9"
    />
    {open && suggestions.length > 0 && (
      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg py-1 max-h-64 overflow-y-auto">
        {suggestions.map((s) => (
          <button
            key={`${s.kind}-${s.v}`}
            type="button"
            className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => onPick(s.v)}
          >
            {s.kind === "company"
              ? <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              : <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <span className="truncate">{s.v}</span>
          </button>
        ))}
      </div>
    )}
  </div>
  );
}

export type VisibleLocations = { flat: string[] | null; byRegion: ReturnType<typeof groupByRegion> | null };

interface LocationPickerProps {
  boxRef: RefObject<HTMLDivElement>;
  /** Greyed out while "Match me" is on (it uses Profile's locations instead). */
  disabled: boolean;
  location: string | null;
  open: boolean;
  onToggle: () => void;
  filter: string;
  onFilterChange: (value: string) => void;
  totalCount: number;
  visible: VisibleLocations;
  onSelect: (location: string | null) => void;
}

export function LocationPicker({ boxRef, disabled, location, open, onToggle, filter, onFilterChange, totalCount, visible, onSelect }: LocationPickerProps) {
  return (
  <div className={`relative w-full lg:w-64 ${disabled ? "opacity-50 pointer-events-none" : ""}`} ref={boxRef}>
    <button
      type="button"
      onClick={onToggle}
      className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm"
    >
      <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className={`flex-1 text-left truncate ${location ? "" : "text-muted-foreground"}`}>
        {location ?? "All locations"}
      </span>
      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
    {open && (
      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={`Search ${totalCount} locations`}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => onSelect(null)}
          >
            All locations
          </button>
          {visible.flat
            ? visible.flat.map((loc) => (
              <button
                key={loc}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                onClick={() => onSelect(loc)}
              >
                {loc}
              </button>
            ))
            : visible.byRegion?.map((g) => (
              <div key={g.region}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.region} <span className="font-normal normal-case">· {g.items.length}</span>
                </p>
                {g.items.slice(0, 14).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                    style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                    onClick={() => onSelect(loc)}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            ))}
          {visible.flat?.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No location matches that.</p>
          )}
        </div>
      </div>
    )}
  </div>
  );
}

type NullableSetter = Dispatch<SetStateAction<string | null>>;

interface FiltersMenuProps {
  boxRef: RefObject<HTMLDivElement>;
  open: boolean;
  onToggle: () => void;
  activeCount: number;
  postedWithin: string | null;
  setPostedWithin: NullableSetter;
  employmentTypes: string[];
  employmentType: string | null;
  setEmploymentType: NullableSetter;
  seniorities: string[];
  seniority: string | null;
  setSeniority: NullableSetter;
  categories: string[];
  category: string | null;
  setCategory: NullableSetter;
}

export function FiltersMenu({
  boxRef, open, onToggle, activeCount, postedWithin, setPostedWithin, employmentTypes, employmentType, setEmploymentType,
  seniorities, seniority, setSeniority, categories, category, setCategory,
}: FiltersMenuProps) {
  return (
<div className="relative flex-1 lg:flex-initial shrink-0" ref={boxRef}>
<Button
  type="button"
  variant={activeCount > 0 ? "default" : "outline"}
  onClick={onToggle}
  style={activeCount > 0 ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" } : undefined}
  className={activeCount > 0 ? "hover:opacity-90" : ""}
>
  <SlidersHorizontal className="w-4 h-4 mr-1.5" />Filters
  {activeCount > 0 && (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold bg-white/25 px-1">
      {activeCount}
    </span>
  )}
</Button>
{open && (
  <div className="absolute z-50 mt-1 right-0 w-[300px] rounded-md border bg-popover shadow-lg p-3 space-y-3 max-h-[70vh] overflow-y-auto">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Posted within</p>
      <div className="flex flex-wrap gap-1.5">
        {POSTED_WITHIN_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setPostedWithin((v) => (v === o.key ? null : o.key))}
            className="text-xs px-2.5 py-1 rounded-full border transition"
            style={postedWithin === o.key
              ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
              : { borderColor: "var(--border, hsl(var(--border)))" }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>

    {employmentTypes.length > 0 && (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Job type</p>
        <div className="flex flex-wrap gap-1.5">
          {employmentTypes.map((et) => (
            <button
              key={et}
              type="button"
              onClick={() => setEmploymentType((v) => (v === et ? null : et))}
              className="text-xs px-2.5 py-1 rounded-full border transition"
              style={employmentType === et
                ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
                : { borderColor: "var(--border, hsl(var(--border)))" }}
            >
              {EMPLOYMENT_TYPE_LABELS[et] || humanizeSlug(et)}
            </button>
          ))}
        </div>
      </div>
    )}

    {seniorities.length > 0 && (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Seniority</p>
        <div className="flex flex-wrap gap-1.5">
          {seniorities.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeniority((v) => (v === s ? null : s))}
              className="text-xs px-2.5 py-1 rounded-full border transition"
              style={seniority === s
                ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
                : { borderColor: "var(--border, hsl(var(--border)))" }}
            >
              {SENIORITY_LABELS[s] || humanizeSlug(s)}
            </button>
          ))}
        </div>
      </div>
    )}

    {categories.length > 0 && (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Category</p>
        <Select value={category ?? "__all"} onValueChange={(v) => setCategory(v === "__all" ? null : v)}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{humanizeCategory(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}

    {activeCount > 0 && (
      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setEmploymentType(null); setSeniority(null); setCategory(null); setPostedWithin(null); }}>
        Clear these filters
      </Button>
    )}
  </div>
)}
</div>
  );
}
