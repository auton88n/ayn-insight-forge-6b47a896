/** Reject a demonstrated prior-experience/engagement mix-up in a feed internship tag.
 * Other feed types are preserved; no replacement type is guessed from salary or seniority. */
export function verifiedEmploymentType(value: string | null | undefined, title: string, description: string): string | null {
  if (!value) return null;
  if (!/^(?:intern|internship)$/i.test(value)) return value;
  const roleEvidence = /\b(?:intern|internship)\b/i.test(title)
    || /^\s*(?:job type|employment type|position type)\s*:\s*(?:intern|internship)\b/im.test(description)
    || /\b(?:this|the)\s+(?:position|role|opportunity)\s+is\s+(?:an?\s+)?(?:paid\s+|unpaid\s+)?internship\b/i.test(description);
  const priorExperience = /\b(?:prior|previous|past)\b[^.\n]{0,100}\binternship\s+experience\b/i.test(description);
  return !roleEvidence && priorExperience ? null : value;
}
