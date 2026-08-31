// v3.309.0 — real region expansion, requested directly: "expand the jobs
// to cover middle east and Europe and North America and Australia." The
// previous version of this file was a single boolean, isUsOrCanadaLocation
// — correct for the v3.163.0 decision to launch on North America only, but
// the wrong shape once job-board-sync needed to fetch and correctly bucket
// four distinct regions, not just accept-or-reject one. Rebuilt around
// classifyRegion(location), returning which one of the four target regions
// (if any) a location genuinely belongs to — the same "when unsure, leave
// it out" discipline this file has always used, just with four positive
// outcomes instead of one, and isUsOrCanadaLocation kept as a thin wrapper
// so every existing caller of the old boolean name keeps working unchanged.
//
// Real ordering matters here, not just real lists: North America is always
// checked first. Every genuine city-name collision found by reasoning
// through this change (Vienna, VA; Dublin, OH and Dublin, CA; Melbourne,
// FL — a real aerospace-coast city; Brisbane, CA; Perth, ON) is a case
// where a real US/Canada state or province is also present in the same
// string, so checking North America's own state/province rules first
// means the correct region wins before a same-named foreign city's own
// bare-name check ever runs. A truly bare "Dublin" or "Manchester" with no
// state/province context falls through to the Europe check and correctly
// resolves there — the same accepted class of ambiguity this file's own
// history already documents for "Georgia" (state vs. country).
export const US_STATE_ABBR = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);
export const CA_PROVINCE_ABBR = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"]);
export const US_CA_CITY_ALLOWLIST = [
  "new york city", "new york", "san francisco", "los angeles", "chicago", "boston", "seattle",
  "austin", "denver", "atlanta", "miami", "toronto", "montreal", "vancouver", "ottawa", "calgary",
  "edmonton", "winnipeg", "palo alto", "mountain view", "san jose", "cambridge", "washington",
  "san diego", "portland", "philadelphia", "dallas", "houston", "phoenix", "detroit", "minneapolis",
  "charlotte", "nashville", "salt lake city", "pittsburgh", "raleigh", "durham", "columbus",
  "indianapolis", "kansas city", "st. louis", "cincinnati", "cleveland", "milwaukee", "sacramento",
  "san antonio", "orlando", "tampa", "las vegas", "baltimore", "jacksonville", "fremont", "oakland",
  "berkeley", "santa monica", "santa clara", "sunnyvale", "redwood city", "menlo park", "irvine",
  "brooklyn", "jersey city", "hoboken", "quebec city", "halifax", "victoria", "regina", "waterloo",
  "kitchener", "mississauga", "burnaby", "richmond", "surrey",
];
const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
  "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];
const CA_PROVINCE_NAMES = [
  "ontario", "quebec", "québec", "british columbia", "alberta", "manitoba", "saskatchewan",
  "nova scotia", "new brunswick", "newfoundland", "prince edward island",
  "northwest territories", "yukon", "nunavut",
];

// v3.309.0 — Europe. Deliberately the major, easiest-to-verify economies
// rather than an exhaustive 44-country list — the same "start with what
// can actually be checked" reasoning the original US/Canada-only launch
// used, extendable later the same way this expansion itself was planned
// for from v3.163.0 onward.
const EUROPE_COUNTRIES = [
  "united kingdom", "uk", "england", "scotland", "wales", "northern ireland",
  "germany", "france", "spain", "italy", "netherlands", "belgium", "switzerland",
  "ireland", "portugal", "poland", "sweden", "norway", "denmark", "austria",
  "finland", "romania", "greece", "hungary", "czech republic", "czechia",
];
const EUROPE_CITIES = [
  "london", "manchester", "birmingham", "edinburgh", "glasgow", "belfast", "cardiff",
  "berlin", "munich", "frankfurt", "hamburg", "cologne", "stuttgart",
  "paris", "lyon", "marseille", "toulouse",
  "madrid", "barcelona", "valencia", "seville",
  "rome", "milan", "turin", "naples",
  "amsterdam", "rotterdam", "the hague", "utrecht", "eindhoven",
  "brussels", "antwerp",
  "zurich", "geneva", "basel", "lausanne",
  "dublin", "cork",
  "lisbon", "porto",
  "warsaw", "krakow", "wroclaw",
  "stockholm", "gothenburg", "malmo", "malmö",
  "oslo", "bergen",
  "copenhagen", "aarhus",
  "vienna", "graz",
  "helsinki", "espoo",
  "bucharest",
  "athens", "thessaloniki",
  "budapest",
  "prague", "brno",
];

// v3.309.0 — Middle East. The same seven-country list already settled on
// directly ("no you cant group we need names of countries no regions",
// see the earlier Middle East targeting entry in this codebase's own
// history) rather than a looser regional grouping.
const MIDDLE_EAST_COUNTRIES = [
  "united arab emirates", "uae", "saudi arabia", "ksa", "israel", "qatar", "kuwait", "bahrain", "oman",
];
const MIDDLE_EAST_CITIES = [
  "dubai", "abu dhabi", "sharjah", "ajman",
  "riyadh", "jeddah", "dammam", "khobar",
  "tel aviv", "jerusalem", "haifa", "tlv",
  "doha",
  "kuwait city",
  "manama",
  "muscat",
];

const AUSTRALIA_COUNTRIES = ["australia"];
const AUSTRALIA_CITIES = [
  "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "gold coast",
];

// A real, disclosed denylist for everything still genuinely out of scope
// (not the four target regions above) — kept narrow to the countries/
// cities actually confirmed live leaking through freehire's own filter in
// the original v3.169.0 finding, plus the largest, most likely-to-recur
// ones (India, China, Southeast Asia, Latin America, Africa), same "when
// unsure, leave it out" rule: a location that matches nothing here and
// nothing above returns null either way, this list only exists to stop an
// out-of-scope country's own state/city name from ever being mistaken for
// one of the four target regions by a looser downstream check.
const OUT_OF_SCOPE_DENYLIST = [
  "brazil", "sao paulo", "são paulo", "rio de janeiro", "mexico", "mexico city",
  "argentina", "buenos aires", "colombia", "bogota", "chile", "santiago", "peru", "lima",
  "india", "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "pune", "chennai",
  "vietnam", "ho chi minh", "hanoi", "philippines", "manila", "singapore", "malaysia",
  "kuala lumpur", "indonesia", "jakarta", "thailand", "bangkok", "china", "shanghai", "beijing",
  "shenzhen", "hong kong", "taiwan", "taipei", "japan", "tokyo", "osaka", "korea", "seoul",
  "new zealand", "auckland", "south africa", "cairo", "egypt", "turkey", "istanbul",
  "russia", "moscow", "ukraine", "kyiv", "nigeria", "lagos", "kenya", "nairobi",
  "pakistan", "karachi", "lahore", "bangladesh", "dhaka", "sri lanka", "colombo",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toWordBoundaryPatterns(terms: string[]): RegExp[] {
  return terms.map((term) => {
    const startsWord = /^[a-z0-9]/i.test(term[0]);
    const endsWord = /[a-z0-9]$/i.test(term[term.length - 1]);
    return new RegExp((startsWord ? "\\b" : "") + escapeRegex(term) + (endsWord ? "\\b" : ""));
  });
}
const OUT_OF_SCOPE_PATTERNS = toWordBoundaryPatterns(OUT_OF_SCOPE_DENYLIST);
const EUROPE_COUNTRY_PATTERNS = toWordBoundaryPatterns(EUROPE_COUNTRIES);
const EUROPE_CITY_PATTERNS = toWordBoundaryPatterns(EUROPE_CITIES);
const MIDDLE_EAST_COUNTRY_PATTERNS = toWordBoundaryPatterns(MIDDLE_EAST_COUNTRIES);
const MIDDLE_EAST_CITY_PATTERNS = toWordBoundaryPatterns(MIDDLE_EAST_CITIES);
const AUSTRALIA_COUNTRY_PATTERNS = toWordBoundaryPatterns(AUSTRALIA_COUNTRIES);
const AUSTRALIA_CITY_PATTERNS = toWordBoundaryPatterns(AUSTRALIA_CITIES);

export type TargetRegion = "north_america" | "europe" | "middle_east" | "australia";

function matchesNorthAmerica(loc: string, original: string): boolean {
  if (/\b(united states|u\.s\.a?\.?|usa|canada)\b/.test(loc)) return true;
  for (const name of US_STATE_NAMES) if (loc.includes(name)) return true;
  for (const name of CA_PROVINCE_NAMES) if (loc.includes(name)) return true;
  // Case-sensitive on purpose, checked against the ORIGINAL (not
  // lowercased) string — see the original file's own note: several state
  // codes (IN, OR, HI, OK, CO, ME) collide with common lowercase words, so
  // only an uppercase token counts as a real abbreviation.
  const abbrevTokens = original.match(/\b[A-Z]{2}\b/g) || [];
  for (const tok of abbrevTokens) if (US_STATE_ABBR.has(tok) || CA_PROVINCE_ABBR.has(tok)) return true;
  for (const city of US_CA_CITY_ALLOWLIST) if (loc.includes(city)) return true;
  return false;
}

/** Which of the four target regions a location genuinely belongs to, or
 * null when it can't be positively confirmed (a genuinely out-of-scope
 * location, or a location too ambiguous to place — the same "leave it
 * out" rule this file has always used, extended to four outcomes). North
 * America is always checked first; see this file's own header for why
 * that ordering is what makes the real city-name collisions
 * (Vienna/VA, Dublin/OH, Melbourne/FL, Brisbane/CA, Perth/ON) resolve
 * correctly without a special case for each one. */
export function classifyRegion(location: string | null | undefined): TargetRegion | null {
  if (!location) return null;
  const loc = location.toLowerCase().trim();
  if (loc === "remote") return "north_america"; // this app's own default audience, unchanged from the original file
  for (const pattern of OUT_OF_SCOPE_PATTERNS) if (pattern.test(loc)) return null;

  if (matchesNorthAmerica(loc, location)) return "north_america";

  for (const pattern of MIDDLE_EAST_COUNTRY_PATTERNS) if (pattern.test(loc)) return "middle_east";
  for (const pattern of MIDDLE_EAST_CITY_PATTERNS) if (pattern.test(loc)) return "middle_east";

  for (const pattern of AUSTRALIA_COUNTRY_PATTERNS) if (pattern.test(loc)) return "australia";
  for (const pattern of AUSTRALIA_CITY_PATTERNS) if (pattern.test(loc)) return "australia";

  for (const pattern of EUROPE_COUNTRY_PATTERNS) if (pattern.test(loc)) return "europe";
  for (const pattern of EUROPE_CITY_PATTERNS) if (pattern.test(loc)) return "europe";

  return null;
}

/** True if the location belongs to ANY of the four target regions —
 * what a region-agnostic caller (ats-direct-sync, which polls a whole
 * company board regardless of location rather than querying one region
 * at a time) actually needs. */
export function isInTargetRegion(location: string | null | undefined): boolean {
  return classifyRegion(location) !== null;
}

/** Kept for the one call shape that genuinely only ever meant "US or
 * Canada" and nothing else — a thin wrapper so no existing caller needed
 * to change when this file grew three more regions. */
export function isUsOrCanadaLocation(location: string | null | undefined): boolean {
  return classifyRegion(location) === "north_america";
}
