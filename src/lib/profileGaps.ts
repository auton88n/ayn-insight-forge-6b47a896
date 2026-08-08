/**
 * profileGaps.ts — v3.5.0
 *
 * One place that decides whether each profile group is complete, what an
 * employer loses when it is not, and which one or two missing things would
 * move the needle most. Shared by ProfileTab (live form state), the Get
 * discovered tab, and Home's next actions, so all three say the same thing.
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
  // v3.5.0 — the new matching signals.
  skillsWithLevel?: number;
  rolesWithAchievements?: number;
  rolesWithIndustry?: number;
  availability?: string;
  employmentTypes?: string[];
  knownForCount?: number;
}

export function computeGroupGaps(i: GapInput): GroupGap[] {
  return [
    {
      group: "About you",
      complete: !!(i.firstName && i.email && (i.currentTitle || i.city)),
      consequence: "Without a current title and location, employers cannot place you on their shortlist.",
    },
    {
      group: "Your experience",
      complete:
        (i.skillsCount ?? 0) > 0 &&
        (i.experiencesCount ?? 0) > 0 &&
        (i.rolesWithAchievements ?? 0) > 0,
      consequence:
        "With no skills or achievements there is nothing for the matcher to compare a job against, and nothing for tailoring to rewrite.",
    },
    {
      group: "What you are looking for",
      complete: (i.desiredTitles?.length ?? 0) > 0 && !!i.availability,
      consequence: "Desired titles and availability are the first two filters in most employer searches.",
    },
    {
      group: "Work eligibility",
      complete: (i.countries?.length ?? 0) > 0 || !!i.citizenship,
      consequence: "Employers filter by work eligibility first. Without it you are excluded from most searches.",
    },
  ];
}

export interface Readiness {
  ready: boolean;
  line: string;
}

/**
 * The compact matching-readiness line. Not a percentage: it names at most the
 * two highest impact things still missing, in the order employers use them.
 */
export function computeReadiness(i: GapInput): Readiness {
  const misses: string[] = [];

  if ((i.experiencesCount ?? 0) > 0 && (i.rolesWithAchievements ?? 0) === 0) {
    misses.push("achievements on your roles");
  }
  if ((i.skillsCount ?? 0) > 0 && (i.skillsWithLevel ?? 0) === 0) {
    misses.push("levels on your top skills");
  }
  if (!i.availability) {
    misses.push("your availability");
  }
  if ((i.desiredTitles?.length ?? 0) === 0) {
    misses.push("desired titles");
  }
  if ((i.countries?.length ?? 0) === 0 && !i.citizenship) {
    misses.push("where you can work");
  }
  if ((i.skillsCount ?? 0) === 0) {
    misses.unshift("your skills");
  }
  if ((i.experiencesCount ?? 0) === 0) {
    misses.unshift("your work history");
  }

  if (misses.length === 0) {
    return { ready: true, line: "Your profile has everything employers search on. Keep it current and you are done." };
  }

  const top = misses.slice(0, 2);
  const what = top.length === 2 ? `${top[0]} and ${top[1]}` : top[0];
  return { ready: false, line: `Add ${what}.` };
}
