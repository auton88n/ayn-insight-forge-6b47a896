/**
 * hubSnapshot.ts — v3.3.0
 *
 * Everything Home needs to decide what the next useful action is. No counts
 * dashboard, no engagement metrics: just the four conditions that can block a
 * job seeker, loaded in one pass.
 */
import { supabase } from "@/integrations/supabase/client";
import { resumeHubApi } from "@/lib/resumeHub";
import { employerApi } from "@/lib/employer";
import { computeGroupGaps, type GroupGap } from "@/lib/profileGaps";

export interface HubSnapshot {
  resumeCount: number;
  primaryResumeTitle: string | null;
  groupGaps: GroupGap[];
  unscoredJobs: number;
  pendingIntros: number;
  poolOptedIn: boolean;
}

export async function loadHubSnapshot(userId: string): Promise<HubSnapshot> {
  const [
    resumesRes,
    primaryRes,
    canonRes,
    profRes,
    jobsRes,
    matchesRes,
    poolRes,
    revealsRes,
  ] = await Promise.all([
    supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("resumes").select("title").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
    supabase.from("user_profile_canonical").select("skills, experiences, work_auth, preferences, derived").eq("user_id", userId).maybeSingle(),
    supabase.from("user_profile_data").select("legal_first_name, email, address").eq("user_id", userId).maybeSingle(),
    supabase.from("jobs").select("id").eq("user_id", userId),
    supabase.from("job_matches").select("job_id").eq("user_id", userId),
    resumeHubApi.talentPoolGet().catch(() => null),
    employerApi.proposalList().catch(() => null),
  ]);

  const canon = (canonRes.data ?? {}) as {
    skills?: Array<{ level?: string | null } | string>; experiences?: Array<{ bullets?: string[]; industry?: string }>;
    work_auth?: { countries?: string[]; citizenship?: string; work_authorized_ca?: boolean; work_authorized_us?: boolean };
    preferences?: { desired_titles?: string[]; availability?: string; employment_types?: string[] };
    derived?: { current_title?: string; known_for?: string[] };
  };
  const prof = (profRes.data ?? {}) as { legal_first_name?: string; email?: string; address?: { city?: string } };
  const wa = canon.work_auth ?? {};
  const countries = wa.countries ?? [
    ...(wa.work_authorized_ca ? ["Canada"] : []),
    ...(wa.work_authorized_us ? ["United States"] : []),
  ];
  const skills = canon.skills ?? [];
  const experiences = canon.experiences ?? [];

  const jobIds = ((jobsRes.data ?? []) as { id: string }[]).map(j => j.id);
  const scored = new Set(((matchesRes.data ?? []) as { job_id: string }[]).map(m => m.job_id));

  return {
    resumeCount: resumesRes.count ?? 0,
    primaryResumeTitle: (primaryRes.data as { title?: string } | null)?.title ?? null,
    groupGaps: computeGroupGaps({
      firstName: prof.legal_first_name,
      email: prof.email,
      currentTitle: canon.derived?.current_title,
      city: prof.address?.city,
      desiredTitles: canon.preferences?.desired_titles,
      countries,
      citizenship: wa.citizenship,
      skillsCount: skills.length,
      experiencesCount: experiences.length,
      skillsWithLevel: skills.filter(s => typeof s === "object" && s && !!s.level).length,
      rolesWithAchievements: experiences.filter(e => (e.bullets ?? []).filter(Boolean).length > 0).length,
      rolesWithIndustry: experiences.filter(e => !!e.industry).length,
      availability: canon.preferences?.availability,
      employmentTypes: canon.preferences?.employment_types,
      knownForCount: (canon.derived?.known_for ?? []).length,
    }),

    unscoredJobs: jobIds.filter(id => !scored.has(id)).length,
    pendingIntros: (revealsRes?.requests ?? []).filter(r => r.status === "pending").length,
    poolOptedIn: !!poolRes?.opted_in,
  };
}
