/** Presentation/search aliases only. Source locations remain untouched. Unknown
 * geography is retained, never geocoded or turned into worldwide eligibility. */
const countries = {
  us: 'United States', usa: 'United States', 'united states': 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', gbr: 'United Kingdom', 'united kingdom': 'United Kingdom',
  ae: 'UAE', are: 'UAE', uae: 'UAE', 'united arab emirates': 'UAE',
  sau: 'Saudi Arabia', qat: 'Qatar', kwt: 'Kuwait', bhr: 'Bahrain', omn: 'Oman', isr: 'Israel', can: 'Canada', canada: 'Canada',
  australia: 'Australia', india: 'India', germany: 'Germany', france: 'France',
};
const states = Object.fromEntries([
  'AL:Alabama','AK:Alaska','AZ:Arizona','AR:Arkansas','CA:California','CO:Colorado','CT:Connecticut','DE:Delaware',
  'FL:Florida','GA:Georgia','HI:Hawaii','ID:Idaho','IL:Illinois','IN:Indiana','IA:Iowa','KS:Kansas','KY:Kentucky',
  'LA:Louisiana','ME:Maine','MD:Maryland','MA:Massachusetts','MI:Michigan','MN:Minnesota','MS:Mississippi',
  'MO:Missouri','MT:Montana','NE:Nebraska','NV:Nevada','NH:New Hampshire','NJ:New Jersey','NM:New Mexico',
  'NY:New York','NC:North Carolina','ND:North Dakota','OH:Ohio','OK:Oklahoma','OR:Oregon','PA:Pennsylvania',
  'RI:Rhode Island','SC:South Carolina','SD:South Dakota','TN:Tennessee','TX:Texas','UT:Utah','VT:Vermont',
  'VA:Virginia','WA:Washington','WV:West Virginia','WI:Wisconsin','WY:Wyoming','DC:District of Columbia',
].map(pair => pair.split(':')));
const modePattern = /\b(remote|hybrid|on[ -]?site)\b/ig;
// These state abbreviations also identify countries (or non-US regions).
// Without an explicit US country, ZIP or spelled-out state, retain the code.
const ambiguousRegions = new Set('AL AR AZ CA CO DE GA ID IL IN KY LA MA MD ME MN MO MS MT NC NE PA SC SD TN VA WA'.split(' '));
export function locationWorkMode(raw) {
  const modes = [...(raw || '').matchAll(modePattern)].map(m => m[1].toLowerCase().replace(/[ -]/g, ''));
  const unique = [...new Set(modes)];
  // "Boston or remote" describes alternatives, not a confirmed remote role.
  if (/\bor\s+remote\b/i.test(raw || '') || unique.length !== 1) return null;
  return unique[0];
}
function placeCase(value) {
  if (/^[A-Z\s'.-]+$/.test(value) && value.length > 3) return value.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());
  return /^[A-Z]{2}[a-z]{2,}$/.test(value) ? value[0] + value.slice(1).toLowerCase() : value;
}
function singlePlace(raw) {
  // Observed facility token, not a general country-code guess (DE can also
  // mean Delaware). Preserve other unknown facility strings verbatim.
  if (/^DE-Dresden\d{4}$/i.test(raw.trim())) return 'Dresden, Germany';
  const hasUSZip = /\b[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/.test(raw);
  let value = raw.replace(/\b(?:or\s+)?(?:remote|hybrid|on[ -]?site)(?:\s+contract)?\b/ig, '')
    .replace(/[()]/g, '').replace(/\s+[-–—]\s+/g, ', ')
    .replace(/\b([A-Z]{2})(\d{5}(?:-\d{4})?)\b/g, '$1 $2');
  let parts = value.split(/\s*[,·]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^\d{2,}(?:[-\s][^,]+)?$/.test(parts[0])) parts = parts.slice(1);
  // Only remove recognizable facility labels when another place is supplied.
  if (parts.length > 1) parts = parts.filter(p => !/\b(?:headquarters|distribution center|transfer station)\b/i.test(p) && !/^corporate$/i.test(p));
  if (parts.some(p => /^salt lake city$/i.test(p))) parts = parts.filter(p => !/^slc$/i.test(p));
  parts = parts.map(p => p.replace(/^GATELE-/i, '').replace(/\s+\d{5}(?:-\d{4})?$/, ''));
  // State codes are expanded only in a multi-part location. A lone "CA" is
  // ambiguous and must not be silently classified as California or Canada.
  const hasUS = parts.some(p => countries[p.toLowerCase()] === 'United States');
  const hasOtherCountry = parts.some(p => countries[p.toLowerCase()] && countries[p.toLowerCase()] !== 'United States');
  let usRegion = false;
  parts = parts.map((p, i) => {
    const state = states[p.toUpperCase()] || Object.values(states).find(s => s.toLowerCase() === p.toLowerCase());
    const ambiguousRegion = ambiguousRegions.has(p.toUpperCase());
    if (state && !hasOtherCountry && (hasUS || i > 0) && (!ambiguousRegion || hasUS || hasUSZip || p.length > 2)) { usRegion = true; return state; }
    return countries[p.toLowerCase().replace(/\./g, '')] || placeCase(p);
  });
  if (usRegion && !hasUS) parts.push('United States');
  return [...new Map(parts.map(p => [p.toLowerCase(), p])).values()].join(', ');
}
export function canonicalLocation(raw) {
  if (!raw?.trim()) return '';
  const places = raw.split(/\s*[;/]\s*|\s+\|\s+/).map(singlePlace).filter(Boolean);
  const result = [...new Set(places)].join(' · ');
  if (result && /\bor\s+remote\b/i.test(raw)) return result + ' · Remote option';
  return result || (locationWorkMode(raw) ? (locationWorkMode(raw) === 'onsite' ? 'On-site' : placeCase(locationWorkMode(raw).toUpperCase())) : raw.trim());
}
export function normalizeLocationCounts(groups) {
  const counts = new Map();
  for (const group of groups) {
    const label = canonicalLocation(group.location);
    if (label) counts.set(label, (counts.get(label) || 0) + group.roles);
  }
  return [...counts].map(([location, roles]) => ({ location, roles })).sort((a, b) => b.roles - a.roles || a.location.localeCompare(b.location));
}
