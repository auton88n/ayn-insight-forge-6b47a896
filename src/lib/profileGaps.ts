/**
 * profileGaps.ts — v3.3.0
 *
 * One place that decides whether each of the four profile groups is complete,
 * and what an employer loses when it is not. Shared by ProfileTab (which has
 * the live form state), the Get discovered tab, and Home's next actions, so
 * all three say the same thing.
 */

export interface GroupGap {
  group: string;
  complete: boolean;
  consequence: string;
}

export interface GapInput {
  firstName?: string;
  email?: string;
  currentTitle?: string;
  city?: string;
  desiredTitles?: string[];
  countries?: string[];
  citizenship?: string;
  skillsCount?: number;
  experiencesCount?: number;
}

export function computeGroupGaps(i: GapInput): GroupGap[] {
  return [
    {
      group: "About you",
      complete: !!(i.firstName && i.email && (i.currentTitle || i.city)),
      consequence: "Without a current title and location, employers cannot place you on their shortlist.",
    },
    {
      group: "What you're looking for",
      complete: (i.desiredTitles?.length ?? 0) > 0,
      consequence: "No desired titles means you will not surface for role based searches.",
    },
    {
      group: "Where you can work",
      complete: (i.countries?.length ?? 0) > 0 || !!i.citizenship,
      consequence: "Employers filter by work eligibility first. Without it you are excluded from most searches.",
    },
    {
      group: "Your experience",
      complete: (i.skillsCount ?? 0) > 0 && (i.experiencesCount ?? 0) > 0,
      consequence: "With no skills or experience there is nothing for the matcher to compare a job against.",
    },
  ];
}
