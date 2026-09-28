// v3.325.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files. Canonical-profile CRUD, legal consent
// recording, and Talent Pool discovery (Phase A: seeker-side consent +
// indexing). Pure code movement, zero logic changes.
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { rateLimitGate, discoveryRestriction, RESTRICTION_MESSAGE } from "./gates.ts";
import { type CanonicalProfile, loadCanonical, EMPTY_CANONICAL, extractCanonical } from "./canonicalProfile.ts";
import { reindexIfOptedIn, indexCandidate } from "./candidateIndex.ts";

// profile_canonical_get: load the saved canonical profile (empty shell if none)
export async function handleProfileCanonicalGet(ctx: ActionCtx): Promise<Response> {
  const canonical = await loadCanonical(ctx.admin, ctx.userId);
  return json({ canonical: canonical || EMPTY_CANONICAL, hasProfile: !!canonical });
}

// profile_canonical_extract: run AI to (re)build canonical from primary resume + user_profile_data.
// Does NOT save automatically; UI shows the result for confirmation/edit.
export async function handleProfileCanonicalExtract(ctx: ActionCtx): Promise<Response> {
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 20, 15); if (limited) return limited; }
  const [{ data: resume }, { data: profile }] = await Promise.all([
    ctx.admin.from("resumes").select("content").eq("user_id", ctx.userId).eq("is_primary", true).maybeSingle(),
    ctx.admin.from("user_profile_data").select("*").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  if (!resume?.content && !profile) return json({ error: "No primary resume or profile to extract from" }, 404);
  const canonical = await extractCanonical({
    resumeContent: resume?.content || null,
    profileExtras: profile || null,
  });
  return json({ canonical });
}

// profile_canonical_save: persist user-edited canonical profile (upsert by user_id).
export async function handleProfileCanonicalSave(ctx: ActionCtx): Promise<Response> {
  const { canonical } = ctx.payload as { canonical?: Partial<CanonicalProfile> };
  if (!canonical || typeof canonical !== "object") return json({ error: "canonical required" }, 400);
  const row = {
    user_id: ctx.userId,
    skills: canonical.skills ?? [],
    experiences: canonical.experiences ?? [],
    education: canonical.education ?? [],
    certifications: canonical.certifications ?? [],
    work_auth: canonical.work_auth ?? {},
    preferences: canonical.preferences ?? {},
    derived: canonical.derived ?? {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.admin.from("user_profile_canonical")
    .upsert(row, { onConflict: "user_id" });
  if (error) return json({ error: error.message }, 500);
  // v2.9.0-A: re-index this user for the talent pool if they've opted in.
  reindexIfOptedIn(ctx.admin, ctx.userId);
  return json({ ok: true });
}

// ─────────────────────────────────────────────────────────────
// v2.9.0-A — Talent Pool (Phase A: data layer)
// Seeker-side consent + indexing. Employer search lives in Phase B
// and runs via the service role, gated on opted_in.
// ─────────────────────────────────────────────────────────────
export async function handleTalentPoolGet(ctx: ActionCtx): Promise<Response> {
  // v3.2.0 — the Hub renders the employer-facing preview, skills split by
  // provenance, and a freshness line, so this returns everything needed
  // for that in one round trip. v3.5.1 adds the consent wording version.
  const [{ data: consent }, { data: idx }, { data: skillRows }, { data: resumeRow }, { data: canonRow }] = await Promise.all([
    ctx.admin.from("talent_pool_consent").select("opted_in, consented_at, consent_version").eq("user_id", ctx.userId).maybeSingle(),

    ctx.admin.from("candidate_index")
      .select("headline, summary, seniority, location, years_experience, indexed_at, embedding_model")
      .eq("user_id", ctx.userId).maybeSingle(),
    ctx.admin.from("candidate_skills").select("id, skill, provenance, source").eq("user_id", ctx.userId).order("provenance"),
    ctx.admin.from("resumes").select("updated_at").eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.admin.from("user_profile_canonical").select("updated_at").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  const skills = (skillRows ?? []) as Array<{ id: string; skill: string; provenance: string; source: string }>;
  // v3.28.0 — say it plainly when an admin has taken this profile out of
  // the pool, instead of showing a toggle that quietly does nothing.
  const discoveryBlock = await discoveryRestriction(ctx.admin, ctx.userId);
  return json({
    discovery_restricted: discoveryBlock.restricted,
    discovery_restriction_reason: discoveryBlock.reason,
    opted_in: !!consent?.opted_in,
    consented_at: consent?.consented_at ?? null,
    consent_version: (consent as { consent_version?: string } | null)?.consent_version ?? null,

    indexed: !!idx,
    skills_count: skills.length,
    preview: idx
      ? {
          headline: idx.headline ?? "",
          seniority: idx.seniority ?? "",
          location: idx.location ?? "",
          years_experience: idx.years_experience ?? null,
          indexed_at: idx.indexed_at ?? null,
          embedding_model: idx.embedding_model ?? null,
        }
      : null,
    skills,
    indexed_at: idx?.indexed_at ?? null,
    resume_updated_at: resumeRow?.updated_at ?? null,
    profile_updated_at: canonRow?.updated_at ?? null,
  });
}

// v3.33.0 — the acceptance itself is recorded by handle_new_user, inside
// the same transaction as the account, so it cannot be skipped by a failed
// request or a closed tab. This action only completes that row with the IP
// address, which only the server can see, and it records a re-acceptance
// of a newer version as a new row. Append only otherwise.
export async function handleLegalConsentRecord(ctx: ActionCtx): Promise<Response> {
  const { terms_version, privacy_version, source } = ctx.payload as {
    terms_version?: string; privacy_version?: string; source?: string;
  };
  if (!terms_version || !privacy_version) {
    return json({ error: "terms_version and privacy_version required" }, 400);
  }
  const tv = String(terms_version).slice(0, 32);
  const pv = String(privacy_version).slice(0, 32);
  const fwd = ctx.req.headers.get("x-forwarded-for") || "";
  const ip = (fwd.split(",")[0] || ctx.req.headers.get("cf-connecting-ip") || "").trim() || null;
  const ua = (ctx.req.headers.get("user-agent") || "").slice(0, 500);

  const { data: existing } = await ctx.admin
    .from("terms_consent_log")
    .select("id, ip_address, user_agent")
    .eq("user_id", ctx.userId)
    .eq("terms_version", tv)
    .eq("privacy_version", pv)
    .eq("terms_accepted", true)
    .order("accepted_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const row = existing[0] as { id: string; ip_address: string | null; user_agent: string | null };
    if (!row.ip_address || !row.user_agent) {
      const { error } = await ctx.admin.from("terms_consent_log")
        .update({ ip_address: row.ip_address || ip, user_agent: row.user_agent || ua })
        .eq("id", row.id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, completed: true });
  }

  const { error } = await ctx.admin.from("terms_consent_log").insert({
    user_id: ctx.userId,
    terms_version: tv,
    privacy_version: pv,
    privacy_accepted: true,
    terms_accepted: true,
    ip_address: ip,
    source: source === "reaccept" ? "reaccept" : "signup",
    user_agent: ua,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function handleTalentPoolSet(ctx: ActionCtx): Promise<Response> {
  const { opted_in, consent_version } = ctx.payload as { opted_in?: boolean; consent_version?: string };
  if (typeof opted_in !== "boolean") return json({ error: "opted_in required" }, 400);
  // v3.28.0 — cannot opt back in while restricted from discovery.
  if (opted_in) {
    const block = await discoveryRestriction(ctx.admin, ctx.userId);
    if (block.restricted) {
      return json({
        code: "account_restricted",
        error: "account_restricted",
        capability: "discovery",
        reason: block.reason,
        message: RESTRICTION_MESSAGE.discovery,
      }, 403);
    }
  }
  const now = new Date().toISOString();
  // v3.5.1 — record WHICH consent wording the user agreed to, so a future
  // copy change never leaves us guessing what they were shown.
  const row = {
    user_id: ctx.userId,
    opted_in,
    consented_at: opted_in ? now : null,
    revoked_at: opted_in ? null : now,
    consent_version: opted_in ? (consent_version || "v3.5.1-full-profile") : null,
    updated_at: now,
  };
  const { error } = await ctx.admin.from("talent_pool_consent").upsert(row, { onConflict: "user_id" });
  if (error) return json({ error: error.message }, 500);

  if (opted_in) {
    try { await indexCandidate(ctx.admin, ctx.userId); }
    catch (e) { console.error("indexCandidate failed", (e as Error).message); }
  } else {
    await Promise.all([
      ctx.admin.from("candidate_index").delete().eq("user_id", ctx.userId),
      ctx.admin.from("candidate_skills").delete().eq("user_id", ctx.userId),
    ]);
  }
  return json({ ok: true, opted_in });
}

// v2.9.1 — manual re-index (Talent Pool card "Re-index my profile" link).
// Only useful when opted in; refreshes the caller's candidate_index row
// with the current embedding model.
export async function handleTalentPoolReindexSelf(ctx: ActionCtx): Promise<Response> {
  const { data: consent } = await ctx.admin.from("talent_pool_consent")
    .select("opted_in").eq("user_id", ctx.userId).maybeSingle();
  if (!consent?.opted_in) return json({ error: "Opt in first" }, 400);
  try {
    const result = await indexCandidate(ctx.admin, ctx.userId);
    if (!result) return json({ error: "No profile to index" }, 400);
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
