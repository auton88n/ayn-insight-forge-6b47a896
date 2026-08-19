// v3.167.0 — built for ats-direct-sync (which had zero location filtering
// of its own, pulling a company's entire live board regardless of where a
// role is based). A US-state/CA-province abbreviation match, an explicit
// country named outright, or a name from a curated list of major US/Canada
// cities that show up bare with no country suffix in practice (e.g.
// Ashby's own "New York City"), plus a denylist of the non-US/Canada
// countries and cities actually observed live. A location this can't
// positively confirm is excluded, not guessed at — a bare "Remote" with
// nothing else to go on is included, since that's this app's own default
// audience and excluding every unlabeled remote role would be its own
// kind of wrong; anything crossed with a real foreign country/city name
// stays excluded regardless, even if the same string also names a valid
// US/Canada location (a multi-country requisition like "Bangalore, India;
// Remote, Canada" is deliberately excluded rather than guessed at — the
// same "when unsure, leave it out" rule this file follows everywhere).
//
// v3.169.0 — moved here from being ats-direct-sync's own private copy, and
// applied to job-board-sync too. Found live during a verification sweep:
// freehire's own `countries=ca,us` API filter (the only scoping
// job-board-sync had) is leaky — real UK/Peru/Australia/Dubai/India/
// Turkey/Brazil/Philippines/Italy postings were confirmed live in the
// ingested table despite that param. Rather than trust either vendor's
// own country scoping, this same local classifier is now the one real
// backstop both ingestion paths share.
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
export const NON_US_CA_DENYLIST = [
  "uk", "france", "paris", "united kingdom", "london", "germany", "berlin", "munich",
  "spain", "madrid", "barcelona", "italy", "rome", "milan", "netherlands", "amsterdam", "belgium",
  "brussels", "switzerland", "zurich", "geneva", "ireland", "dublin", "portugal", "lisbon",
  "poland", "warsaw", "sweden", "stockholm", "norway", "oslo", "denmark", "copenhagen", "austria",
  "vienna", "brazil", "sao paulo", "são paulo", "rio de janeiro", "mexico", "mexico city",
  "argentina", "buenos aires", "colombia", "bogota", "chile", "santiago", "peru", "lima",
  "india", "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "pune", "chennai",
  "vietnam", "ho chi minh", "hanoi", "philippines", "manila", "singapore", "malaysia",
  "kuala lumpur", "indonesia", "jakarta", "thailand", "bangkok", "china", "shanghai", "beijing",
  "shenzhen", "hong kong", "taiwan", "taipei", "japan", "tokyo", "osaka", "korea", "seoul",
  "australia", "sydney", "melbourne", "brisbane", "adelaide", "hobart",
  "new zealand", "auckland", "south africa", "cairo", "egypt", "israel", "tel aviv", "tlv", "uae",
  "dubai", "abu dhabi", "saudi arabia", "riyadh", "turkey", "istanbul", "russia", "moscow",
  "ukraine", "kyiv", "romania", "bucharest", "greece", "athens", "finland", "helsinki", "amer,",
  "hungary", "budapest", "casablanca", "morocco", "maroc", "ciudad de méxico", "ciudad de mexico",
  "nigeria", "lagos", "kenya", "nairobi", "pakistan", "karachi", "lahore", "bangladesh", "dhaka",
  "sri lanka", "colombo",
];
// v3.169.0 — added after a live cross-check against every distinct
// location string already in the table (5,995 distinct values) found this
// was rejecting a real, sizable share of genuinely-US/Canada postings, not
// just foreign ones -- 1,429 wrongly rejected before this fix, 950 after
// (the remainder is real foreign locations plus a long tail of lower-
// frequency edge cases: bare region tags like "EMEA", ambiguous no-
// context strings, and cities too obscure for the curated allowlist --
// disclosed as an accepted limit, not chased further):
// full state/province names ("Erie, Pennsylvania", "Oshawa, Ontario") were
// never recognized at all (only 2-letter abbreviations were), "USA"
// without periods ("California, USA") didn't match the "united states"
// phrase check, and the abbreviation check only looked right after a
// comma, missing dash/semicolon-separated multi-location strings like
// "AZ - Waddell; CA - Vernon". Georgia (US state) vs. Georgia (the
// country) is a real, disclosed ambiguity in this list — accepted as a
// state name since no Georgia-the-country posting has been observed live
// and freehire/the direct ATS pollers are already US/Canada-skewed
// sources, same class of judgment call this file already makes elsewhere.
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

// v3.169.0 — a second real collision, found the same way as the first
// ("uk" matching inside "Milwaukee"): plain .includes("india") also
// matches inside "Indiana"/"Indianapolis" -- a real, major US city
// (already in US_CA_CITY_ALLOWLIST) was being rejected before it could
// ever reach that check, because the denylist ran first and matched on a
// substring, not a real word. Generalizing the word-boundary fix to every
// denylist term instead of special-casing "uk" alone, precompiled once at
// module load rather than rebuilt on every call (this runs over
// thousands of rows per ingestion pass).
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const DENY_PATTERNS = NON_US_CA_DENYLIST.map((term) => {
  const startsWord = /^[a-z0-9]/i.test(term[0]);
  const endsWord = /[a-z0-9]$/i.test(term[term.length - 1]);
  return new RegExp((startsWord ? "\\b" : "") + escapeRegex(term) + (endsWord ? "\\b" : ""));
});

export function isUsOrCanadaLocation(location: string | null | undefined): boolean {
  // No location at all can't be positively confirmed either -- same "when
  // unsure, leave it out" rule as everything else here, not a special case.
  if (!location) return false;
  const loc = location.toLowerCase().trim();
  if (loc === "remote") return true;
  for (const pattern of DENY_PATTERNS) if (pattern.test(loc)) return false;
  if (/\b(united states|u\.s\.a?\.?|usa|canada)\b/.test(loc)) return true;
  for (const name of US_STATE_NAMES) if (loc.includes(name)) return true;
  for (const name of CA_PROVINCE_NAMES) if (loc.includes(name)) return true;
  // Case-sensitive on purpose, checked against the ORIGINAL (not
  // lowercased) string: an uppercase 2-letter token anywhere is a real
  // state/province abbreviation far more often than a coincidental
  // English word, but several codes (IN, OR, HI, OK, CO, ME) collide with
  // common lowercase words -- restricting the match to uppercase avoids
  // "in"/"or"/"hi"/"ok" false-positiving on ordinary sentence text.
  const abbrevTokens = location.match(/\b[A-Z]{2}\b/g) || [];
  for (const tok of abbrevTokens) if (US_STATE_ABBR.has(tok) || CA_PROVINCE_ABBR.has(tok)) return true;
  for (const city of US_CA_CITY_ALLOWLIST) if (loc.includes(city)) return true;
  return false;
}
