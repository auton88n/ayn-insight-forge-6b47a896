// Strips personal data out of an outbound apply link before AYN stores or
// shows it. Some company career pages (comeet, for one) put the email address
// of whoever the link was originally generated for into the query string
// (pms_email=someone@gmail.com); sending that on would hand one person's
// address to every candidate who clicks. Only the personal parameters are
// removed; the rest of the URL is left exactly as it was, and a URL with
// nothing to remove is returned unchanged.
//
// Keep this file and src/lib/applyUrl.ts identical; the edge functions and
// the front end deploy separately and cannot import each other. A test in
// src/lib/applyUrl.test.ts runs the same cases against both.
const PERSONAL_PARAM = /^(pms_.*|e-?mail|mail|candidate_?e-?mail|applicant_?e-?mail|user_?e-?mail|referr?er_?e-?mail|ref_?e-?mail)$/i;
const LOOKS_LIKE_EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

export function cleanApplyUrl(url: string): string;
export function cleanApplyUrl(url: string | null | undefined): string | null | undefined;
export function cleanApplyUrl(url: string | null | undefined): string | null | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return url; }
  const drop: string[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (PERSONAL_PARAM.test(key) || LOOKS_LIKE_EMAIL.test(value.trim())) drop.push(key);
  });
  if (!drop.length) return url;
  for (const key of new Set(drop)) parsed.searchParams.delete(key);
  return parsed.toString();
}
