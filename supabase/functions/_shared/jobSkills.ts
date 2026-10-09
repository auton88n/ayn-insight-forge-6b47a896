/** Reject a scraped tag only when every occurrence is in legal/instruction boilerplate.
 * USCIS training can be a real requirement; this is not a global denylist. */
export function relevantPostingSkills(skills: string[] | null | undefined, description: string): string[] {
  const passages = description.split(/\n|(?<=[.!?])\s+/);
  return (skills || []).filter(skill => {
    if (!/^(uscis|e-verify|eeo)$/i.test(skill)) return true;
    const hits = passages.filter(p => p.toLowerCase().includes(skill.toLowerCase()));
    return hits.some(p => !/\b(?:visit|equal opportunity|e-verify|learn more|additional information|www\.|https?:)\b/i.test(p));
  });
}
