// v3.330.0 — extracted from BrowseJobs.tsx as part of splitting that
// 2,282-line file into focused pieces. Pure data/logic, no React
// dependency, used only by BrowseJobs.tsx today but kept as a real
// standalone module (not a local helper) since grouping raw location
// strings into a coarse region is a generic, reusable concern, not a
// BrowseJobs-specific one.
//
// v3.142.0 — asked directly for "a better way to organize locations": the
// filter held 1,000+ distinct raw strings (job-board-sync pulls location
// text as-is from each company's own ATS, so granularity varies wildly —
// "Germany", "Kyle, TX", "Dearborn, MI, United States" all coexist) in one
// flat alphabetical list. There's no reliable geocoder here to turn that
// into real city/country structure, so this groups by the last
// comma-separated segment instead — usually a state, province or country —
// which is honest about what the data actually is rather than pretending
// to a precision it doesn't have. Search still works as a flat filter
// across everything; grouping is only for browsing with no query typed.
// The catalogue now deliberately covers North America, Europe, the Middle
// East, and Australia. Group only locations we can place with a real signal;
// an unknown location stays visibly "Other locations" rather than being
// falsely labelled as United States.
const CA_PROVINCE_ABBR_SET = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"]);
const US_STATE_ABBR_SET = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"]);
const CA_CITY_HINTS = [
  "toronto", "montreal", "vancouver", "ottawa", "calgary", "edmonton", "winnipeg", "quebec city",
  "halifax", "victoria", "regina", "waterloo", "kitchener", "mississauga", "burnaby", "richmond",
  "surrey", "canada",
];
const EUROPE_LOCATION_HINTS = ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland", "germany", "france", "spain", "italy", "netherlands", "belgium", "switzerland", "ireland", "portugal", "poland", "sweden", "norway", "denmark", "austria", "finland", "romania", "greece", "hungary", "czech republic", "czechia", "london", "manchester", "berlin", "munich", "paris", "madrid", "barcelona", "rome", "milan", "amsterdam", "brussels", "zurich", "dublin", "lisbon", "warsaw", "stockholm", "oslo", "copenhagen", "vienna", "helsinki", "athens", "budapest", "prague"];
const MIDDLE_EAST_LOCATION_HINTS = ["united arab emirates", "uae", "saudi arabia", "ksa", "israel", "qatar", "kuwait", "bahrain", "oman", "dubai", "abu dhabi", "riyadh", "jeddah", "tel aviv", "jerusalem", "haifa", "doha", "manama", "muscat"];
const AUSTRALIA_LOCATION_HINTS = ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "gold coast"];

export type LocationRegion = "North America" | "Europe" | "Middle East" | "Australia" | "Other locations";

export function hasLocationHint(location: string, hints: string[]) {
  return hints.some((hint) => new RegExp(`\\b${hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(location));
}

export function classifyLocationRegion(loc: string): LocationRegion {
  const l = loc.toLowerCase();
  if (/\b(united states|u\.s\.a?\.?|usa|canada)\b/.test(l)) return "North America";
  if (hasLocationHint(l, CA_CITY_HINTS)) return "North America";
  const abbrevMatch = loc.match(/,\s*([A-Z]{2})\b/);
  if (abbrevMatch && (CA_PROVINCE_ABBR_SET.has(abbrevMatch[1]) || US_STATE_ABBR_SET.has(abbrevMatch[1]))) return "North America";
  if (hasLocationHint(l, MIDDLE_EAST_LOCATION_HINTS)) return "Middle East";
  if (hasLocationHint(l, AUSTRALIA_LOCATION_HINTS)) return "Australia";
  if (hasLocationHint(l, EUROPE_LOCATION_HINTS)) return "Europe";
  return "Other locations";
}

export function groupByRegion(locs: string[]) {
  const buckets: { region: LocationRegion; items: string[] }[] = [
    { region: "North America", items: [] },
    { region: "Europe", items: [] },
    { region: "Middle East", items: [] },
    { region: "Australia", items: [] },
    { region: "Other locations", items: [] },
  ];
  for (const loc of locs) {
    const bucket = buckets.find((b) => b.region === classifyLocationRegion(loc))!;
    bucket.items.push(loc);
  }
  for (const b of buckets) b.items.sort((a, b2) => a.localeCompare(b2));
  return buckets.filter((b) => b.items.length > 0);
}
