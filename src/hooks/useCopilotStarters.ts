/**
 * useCopilotStarters — v3.7.0 "AYN chat becomes a job search copilot"
 *
 * The empty chat used to offer "Tell me more" and "Give examples", which say
 * nothing to someone who came here to find a job. These starters are built
 * from the person's actual state: an unscored saved job, a pending proposal,
 * a missing profile group. Reads the user's own rows under RLS.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CopilotStarter {
  content: string;
  emoji: string;
}

const FALLBACK: CopilotStarter[] = [
  { content: "What should I work on to get hired faster?", emoji: "🎯" },
  { content: "Help me describe what I do in one line", emoji: "✍️" },
  { content: "What roles should I be targeting?", emoji: "🧭" },
];

export function useCopilotStarters(enabled: boolean): CopilotStarter[] {
  const [starters, setStarters] = useState<CopilotStarter[]>(FALLBACK);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;

      const [jobsRes, matchRes, canonRes, poolRes, proposalRes] = await Promise.all([
        supabase.from("jobs").select("id, title, company").eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("job_matches").select("job_id, score").eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(20),
        supabase.from("user_profile_canonical").select("skills, experiences, preferences")
          .eq("user_id", userId).maybeSingle(),
        supabase.from("talent_pool_consent").select("opted_in").eq("user_id", userId).maybeSingle(),
        supabase.from("reveal_requests").select("id, job_title")
          .eq("candidate_user_id", userId).eq("status", "pending")
          .order("sent_at", { ascending: false }).limit(1),
      ]);

      if (cancelled) return;

      const jobs = jobsRes.data ?? [];
      const scored = new Map((matchRes.data ?? []).map((m) => [m.job_id as string, m.score as number]));
      const canon = canonRes.data as { skills?: unknown[]; experiences?: unknown[]; preferences?: Record<string, unknown> } | null;
      const prefs = canon?.preferences ?? {};
      const pending = proposalRes.data?.[0] as { job_title?: string } | undefined;

      const built: CopilotStarter[] = [];

      if (pending) {
        built.push({
          content: `Should I accept the ${pending.job_title || "proposal"} I was sent?`,
          emoji: "📬",
        });
      }

      const unscored = jobs.find((j) => !scored.has(j.id as string));
      const bestScored = jobs
        .filter((j) => scored.has(j.id as string))
        .sort((a, b) => (scored.get(b.id as string) ?? 0) - (scored.get(a.id as string) ?? 0))[0];

      if (unscored) {
        built.push({
          content: `Am I a fit for ${unscored.title || "that role"} at ${unscored.company || "that company"}?`,
          emoji: "🔍",
        });
      } else if (bestScored) {
        built.push({
          content: `What is holding back my match for ${bestScored.title || "that role"}?`,
          emoji: "📈",
        });
      }

      if (!canon?.experiences?.length) {
        built.push({ content: "Help me write my work history properly", emoji: "🧱" });
      } else if (!canon?.skills?.length) {
        built.push({ content: "Which skills should I put on my profile?", emoji: "🛠️" });
      } else if (!Array.isArray(prefs.desired_titles) || !prefs.desired_titles.length) {
        built.push({ content: "What job titles should I be going after?", emoji: "🧭" });
      }

      if (!poolRes.data?.opted_in) {
        built.push({ content: "Is it worth letting employers find me?", emoji: "👀" });
      }

      if (!jobs.length) {
        built.push({ content: "Where should I start my job search?", emoji: "🚀" });
      } else {
        built.push({ content: "How should I prepare for an interview for one of my saved jobs?", emoji: "🎤" });
      }

      const final = [...built, ...FALLBACK].slice(0, 3);
      setStarters(final);
    })().catch(() => { /* fallback stays */ });

    return () => { cancelled = true; };
  }, [enabled]);

  return starters;
}
