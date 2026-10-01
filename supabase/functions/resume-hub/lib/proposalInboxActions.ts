// v3.328.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files. The proposal lifecycle (send a proposal,
// list a candidate's own proposals, accept/decline, the employer's own
// reveal-status view with PII released only on accept) and the two-way
// inbox built on top of the same reveal_requests relationship (v3.163.0).
// Pure code movement, zero logic changes.
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { featureGate } from "./gates.ts";
import { employerBilling, planLimitReached } from "./billing.ts";
import { notifyCandidate, notifyOrgMembers } from "./notifications.ts";
import { screenMessageBody } from "./messageSafety.ts";
import { ctaButton, heading, para, escapeHtml } from "../../_shared/emailTemplate.ts";

// v3.6.0 — a reveal request is now a JOB PROPOSAL. The employer must say
// what the role is and write a message. Contact details are still only
// released after the candidate accepts (see employer_reveal_status).
export async function handleEmployerRevealRequest(ctx: ActionCtx): Promise<Response> {
  { const off = await featureGate(ctx.admin, "proposals"); if (off) return off; }
  const {
    search_id, ref, job_title, job_location, employment_type, salary_range, job_url, message,
  } = ctx.payload as {
    search_id?: string; ref?: string; job_title?: string; job_location?: string;
    employment_type?: string; salary_range?: string; job_url?: string; message?: string;
  };
  if (!search_id || !ref) return json({ error: "search_id and ref required" }, 400);
  const title = String(job_title || "").trim();
  const msg = String(message || "").trim();
  if (!title) return json({ error: "job_title required" }, 400);
  if (!msg) return json({ error: "message required" }, 400);
  if (msg.length > 1000) return json({ error: "message must be 1000 characters or fewer" }, 400);

  const { data: search } = await ctx.admin.from("employer_searches")
    .select("id, org_id, ref_map").eq("id", search_id).maybeSingle();
  if (!search) return json({ error: "search not found" }, 404);
  if (!(await ctx.assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
  const { data: proposalOrg } = await ctx.admin.from("orgs").select("name").eq("id", search.org_id).maybeSingle();
  const proposalOrgName = proposalOrg?.name || "A company";
  const orgGate = await ctx.assertOrgProfileComplete(search.org_id);
  if (orgGate) return orgGate;
  const candidateUserId = (search.ref_map as Record<string, string> | null)?.[ref];
  if (!candidateUserId) return json({ error: "unknown ref" }, 400);

  // v3.14.0 — proposals limit per billing period.
  const propBilling = await employerBilling(ctx.admin, ctx.userId, search.org_id);
  const propGate = planLimitReached(propBilling, "proposal");
  if (propGate) return propGate;

  // Rate limits 1+2 (one open proposal per org/candidate; no new
  // proposal within 30 days of a decline) plus the insert itself all
  // run inside one atomic, advisory-locked Postgres function now — the
  // three were previously separate unguarded round trips from here,
  // a real TOCTOU race the blueprint-checklist backend audit found.
  const { data: rr, error: rrErr } = await ctx.admin.rpc("create_reveal_request_atomic", {
    p_org_id: search.org_id,
    p_candidate_user_id: candidateUserId,
    p_search_id: search_id,
    p_candidate_ref: ref,
    p_job_title: title,
    p_job_location: job_location?.trim() || null,
    p_employment_type: employment_type?.trim() || null,
    p_salary_range: salary_range?.trim() || null,
    p_job_url: job_url?.trim() || null,
    p_message: msg,
  });
  if (rrErr) return json({ error: rrErr.message }, 500);
  const rrResult = rr as { ok: boolean; code?: string; id?: string };
  if (!rrResult.ok) {
    if (rrResult.code === "open_proposal_exists") {
      return json({ error: "You already have an open proposal with this candidate. Wait for a reply before sending another." }, 429);
    }
    if (rrResult.code === "recent_decline_cooldown") {
      return json({ error: "This candidate declined a proposal from you in the last 30 days. You can try again after that." }, 429);
    }
    return json({ error: "Could not create proposal." }, 500);
  }
  // Awaited: a Deno edge function isolate can be torn down right after
  // the response is sent, so an un-awaited notify can silently never run.
  await notifyCandidate(
    ctx.admin,
    candidateUserId,
    `New job proposal from ${proposalOrgName} | AYN`,
    `${heading("You have a new proposal")}
    ${para(`${escapeHtml(proposalOrgName)} sent you a proposal for ${escapeHtml(title)}.`)}`,
    "proposal_received",
    ctaButton("https://ayn.careers/", "View proposal"),
  );
  return json({ ok: true, status: "pending" });
}

export async function handleRevealList(ctx: ActionCtx): Promise<Response> {
  const { data: rows } = await ctx.admin.from("reveal_requests")
    .select("id, org_id, search_id, status, created_at, decided_at, job_title, job_location, employment_type, salary_range, job_url, message, sent_at, responded_at, two_way_enabled, candidate_blocked")
    .eq("candidate_user_id", ctx.userId)
    .order("sent_at", { ascending: false });
  const enriched: Array<Record<string, unknown>> = [];
  for (const r of (rows || [])) {
    const [{ data: org }, { data: s }] = await Promise.all([
      ctx.admin.from("orgs")
        .select("name, website, industry, company_size, headquarters, about, logo_url, linkedin_url")
        .eq("id", r.org_id).maybeSingle(),
      r.search_id
        ? ctx.admin.from("employer_searches").select("job_spec").eq("id", r.search_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    enriched.push({
      id: r.id,
      org_name: org?.name || "A company",
      org_website: org?.website || null,
      // v3.10.0 — who is reaching out, so the candidate can judge it.
      org_industry: org?.industry || null,
      org_size: org?.company_size || null,
      org_headquarters: org?.headquarters || null,
      org_about: org?.about || null,
      org_logo_url: org?.logo_url || null,
      org_linkedin_url: org?.linkedin_url || null,
      job_title: r.job_title || (s?.job_spec as { title?: string } | null)?.title || "",
      job_location: r.job_location || null,
      employment_type: r.employment_type || null,
      salary_range: r.salary_range || null,
      job_url: r.job_url || null,
      message: r.message || "",
      status: r.status,
      sent_at: r.sent_at || r.created_at,
      created_at: r.created_at,
      responded_at: r.responded_at || r.decided_at,
      decided_at: r.decided_at,
      two_way_enabled: !!r.two_way_enabled,
      candidate_blocked: !!r.candidate_blocked,
    });
  }
  return json({ requests: enriched });
}

// ──────────────────────────── INBOX ────────────────────────────
// v3.163.0 — real in-app messaging, attached to the existing proposal
// relationship (reveal_requests) rather than a freestanding thread
// system, so anonymity-until-accepted stays enforced the same way it
// already is everywhere else. Message *reads* deliberately do NOT go
// through an action here — the frontend queries inbox_messages
// directly, so the "candidate never sees a blocked message" rule is
// enforced by the database's own RLS policy, not by remembering to
// filter correctly in application code.
export async function handleInboxSend(ctx: ActionCtx): Promise<Response> {
  const { reveal_request_ids, body } = ctx.payload as { reveal_request_ids?: string[]; body?: string };
  const ids = Array.isArray(reveal_request_ids) ? reveal_request_ids.filter(Boolean) : [];
  const text = String(body || "").trim();
  if (!ids.length) return json({ error: "reveal_request_ids required" }, 400);
  if (!text) return json({ error: "message body required" }, 400);
  if (text.length > 2000) return json({ error: "message must be 2000 characters or fewer" }, 400);

  const { data: rows } = await ctx.admin.from("reveal_requests")
    .select("id, org_id, candidate_user_id, two_way_enabled, candidate_blocked")
    .in("id", ids);
  if (!rows || rows.length !== ids.length) return json({ error: "one or more threads not found" }, 404);

  // Every targeted thread must belong to the same side of the same
  // relationship as the caller — an employer can only message threads
  // in orgs they belong to, a candidate can only reply on their own,
  // single thread, and only when the employer has opened it two-way.
  const isCandidateSender = rows.every(r => r.candidate_user_id === ctx.userId);
  let senderRole: "employer" | "candidate";
  if (isCandidateSender) {
    if (ids.length !== 1) return json({ error: "candidates can only reply on one thread at a time" }, 400);
    const r = rows[0];
    if (r.candidate_blocked) return json({ error: "This employer has blocked further messages on this thread." }, 403);
    if (!r.two_way_enabled) return json({ error: "This employer hasn't opened this conversation to replies." }, 403);
    senderRole = "candidate";
  } else {
    for (const r of rows) {
      if (!(await ctx.assertOrgMember(r.org_id))) return json({ error: "not an org member for one or more threads" }, 403);
    }
    senderRole = "employer";
  }

  const screen = screenMessageBody(text);
  const insertRows = rows.map(r => ({
    reveal_request_id: r.id,
    sender_role: senderRole,
    sender_user_id: ctx.userId,
    kind: "text",
    body: text,
    status: screen.ok ? "sent" : "blocked",
    block_reason: screen.ok ? null : screen.reason,
  }));
  const { error: iErr } = await ctx.admin.from("inbox_messages").insert(insertRows);
  if (iErr) return json({ error: iErr.message }, 500);

  if (!screen.ok) {
    return json({ ok: false, blocked: true, reason: screen.reason, sent_count: 0 }, 200);
  }

  // Best-effort nudge only — the message itself lives in AYN, never in
  // the notification email body (blueprint.md's own established
  // pattern for proposal/assessment notifications, reused here).
  if (senderRole === "employer") {
    for (const r of rows) {
      await notifyCandidate(
        ctx.admin, r.candidate_user_id,
        "You have a new message | AYN",
        `${heading("New message")}${para("An employer sent you a message. Sign in to AYN to read it.")}`,
        "inbox_message", ctaButton("https://ayn.careers/", "View message"),
      );
    }
  } else {
    const { data: org } = await ctx.admin.from("orgs").select("id").eq("id", rows[0].org_id).maybeSingle();
    if (org) {
      await notifyOrgMembers(
        ctx.admin, String(org.id),
        "You have a new message | AYN",
        `${heading("New message")}${para("A candidate replied to your message. Sign in to AYN to read it.")}`,
        "inbox_message", ctaButton("https://ayn.careers/", "View message"),
      );
    }
  }

  return json({ ok: true, blocked: false, sent_count: rows.length });
}

export async function handleInboxListThreads(ctx: ActionCtx): Promise<Response> {
  const { as } = ctx.payload as { as?: "employer" | "candidate" };
  const mode = as === "employer" ? "employer" : "candidate";

  let threadRows: Array<{ id: string; org_id: string; candidate_user_id: string; job_title: string | null; two_way_enabled: boolean; candidate_blocked: boolean }> = [];
  if (mode === "candidate") {
    const { data } = await ctx.admin.from("reveal_requests")
      .select("id, org_id, candidate_user_id, job_title, two_way_enabled, candidate_blocked")
      .eq("candidate_user_id", ctx.userId);
    threadRows = data || [];
  } else {
    const { data: memberships } = await ctx.admin.from("org_members").select("org_id").eq("user_id", ctx.userId);
    const orgIds = [...new Set((memberships || []).map(m => m.org_id))];
    if (orgIds.length) {
      const { data } = await ctx.admin.from("reveal_requests")
        .select("id, org_id, candidate_user_id, job_title, two_way_enabled, candidate_blocked")
        .in("org_id", orgIds);
      threadRows = data || [];
    }
  }
  if (!threadRows.length) return json({ threads: [] });

  const threadIds = threadRows.map(t => t.id);
  const { data: msgs } = await ctx.admin.from("inbox_messages")
    .select("reveal_request_id, sender_role, body, status, read_at, created_at")
    .in("reveal_request_id", threadIds)
    .eq("status", "sent")
    .order("created_at", { ascending: false });

  const orgIds2 = mode === "candidate" ? [...new Set(threadRows.map(t => t.org_id))] : [];
  const { data: orgs } = orgIds2.length
    ? await ctx.admin.from("orgs").select("id, name").in("id", orgIds2)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((orgs || []).map(o => [o.id, o.name]));

  const threads = threadRows.map(t => {
    const tMsgs = (msgs || []).filter(m => m.reveal_request_id === t.id);
    const last = tMsgs[0] || null;
    const otherRole = mode === "employer" ? "candidate" : "employer";
    const unread = tMsgs.filter(m => m.sender_role === otherRole && !m.read_at).length;
    return {
      reveal_request_id: t.id,
      job_title: t.job_title,
      org_name: mode === "candidate" ? (orgNameById.get(t.org_id) || "A company") : undefined,
      candidate_ref: mode === "employer" ? `c-${t.candidate_user_id.slice(0, 8)}` : undefined,
      two_way_enabled: t.two_way_enabled,
      candidate_blocked: t.candidate_blocked,
      last_message: last?.body || null,
      last_message_at: last?.created_at || null,
      unread_count: unread,
    };
  }).sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || ""));

  return json({ threads });
}

export async function handleInboxMarkRead(ctx: ActionCtx): Promise<Response> {
  const { reveal_request_id, as: _as } = ctx.payload as { reveal_request_id?: string; as?: "employer" | "candidate" };
  if (!reveal_request_id) return json({ error: "reveal_request_id required" }, 400);
  const { data: r } = await ctx.admin.from("reveal_requests")
    .select("id, org_id, candidate_user_id").eq("id", reveal_request_id).maybeSingle();
  if (!r) return json({ error: "thread not found" }, 404);
  const isCandidate = r.candidate_user_id === ctx.userId;
  if (!isCandidate && !(await ctx.assertOrgMember(r.org_id))) return json({ error: "not a participant" }, 403);
  const theirRole = isCandidate ? "employer" : "candidate";
  await ctx.admin.from("inbox_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("reveal_request_id", reveal_request_id)
    .eq("sender_role", theirRole)
    .is("read_at", null);
  return json({ ok: true });
}

export async function handleInboxSetTwoWay(ctx: ActionCtx): Promise<Response> {
  const { reveal_request_id, enabled } = ctx.payload as { reveal_request_id?: string; enabled?: boolean };
  if (!reveal_request_id || typeof enabled !== "boolean") return json({ error: "reveal_request_id and enabled required" }, 400);
  const { data: r } = await ctx.admin.from("reveal_requests").select("org_id").eq("id", reveal_request_id).maybeSingle();
  if (!r) return json({ error: "thread not found" }, 404);
  if (!(await ctx.assertOrgMember(r.org_id))) return json({ error: "not an org member" }, 403);
  await ctx.admin.from("reveal_requests").update({ two_way_enabled: enabled }).eq("id", reveal_request_id);
  return json({ ok: true, two_way_enabled: enabled });
}

export async function handleInboxBlockCandidate(ctx: ActionCtx): Promise<Response> {
  const { reveal_request_id, blocked } = ctx.payload as { reveal_request_id?: string; blocked?: boolean };
  if (!reveal_request_id || typeof blocked !== "boolean") return json({ error: "reveal_request_id and blocked required" }, 400);
  const { data: r } = await ctx.admin.from("reveal_requests").select("org_id").eq("id", reveal_request_id).maybeSingle();
  if (!r) return json({ error: "thread not found" }, 404);
  if (!(await ctx.assertOrgMember(r.org_id))) return json({ error: "not an org member" }, 403);
  await ctx.admin.from("reveal_requests").update({ candidate_blocked: blocked }).eq("id", reveal_request_id);
  return json({ ok: true, candidate_blocked: blocked });
}

export async function handleRevealDecide(ctx: ActionCtx): Promise<Response> {
  const { id, approve } = ctx.payload as { id?: string; approve?: boolean };
  if (!id || typeof approve !== "boolean") return json({ error: "id and approve required" }, 400);
  const status = approve ? "approved" : "declined";
  const now = new Date().toISOString();
  const { data: decided, error } = await ctx.admin.from("reveal_requests")
    .update({ status, decided_at: now, responded_at: now })
    .eq("id", id).eq("candidate_user_id", ctx.userId)
    .select("org_id, job_title").maybeSingle();
  if (error) return json({ error: error.message }, 500);
  // The ownership filter above can match zero rows -- someone else's id,
  // a typo, an already-consumed link -- and .update() silently succeeds
  // with nothing changed either way. Reproduced live: a second candidate
  // guessing at another candidate's reveal_request id got a false
  // {ok:true} back with no row actually touched. The write itself was
  // never at risk (candidate_user_id already scoped it correctly), but
  // the response claimed success for nothing happening.
  if (!decided) return json({ error: "Proposal not found." }, 404);
  if (decided?.org_id) {
    const roleTitle = decided.job_title ? escapeHtml(decided.job_title) : "your role";
    await notifyOrgMembers(
      ctx.admin,
      decided.org_id,
      approve ? "A candidate accepted your proposal | AYN" : "A candidate declined your proposal | AYN",
      approve
        ? `${heading("Your proposal was accepted")}
          ${para(`The candidate for ${roleTitle} accepted your proposal. Their contact details are now available.`)}`
        : `${heading("Your proposal was declined")}
          ${para(`The candidate for ${roleTitle} declined your proposal.`)}`,
      approve ? "proposal_accepted" : "proposal_declined",
      approve
        ? ctaButton("https://ayn.careers/", "View candidate")
        : ctaButton("https://ayn.careers/", "View in EmployerHub"),
    );
  }
  return json({ ok: true, status });
}

export async function handleEmployerRevealStatus(ctx: ActionCtx): Promise<Response> {
  const { search_id } = ctx.payload as { search_id?: string };
  const { data: memberships } = await ctx.admin.from("org_members")
    .select("org_id").eq("user_id", ctx.userId);
  const orgIds = (memberships || []).map(m => m.org_id);
  if (orgIds.length === 0) return json({ requests: [] });

  let q = ctx.admin.from("reveal_requests")
    .select("id, org_id, candidate_user_id, candidate_ref, status, job_title, job_location, employment_type, salary_range, job_url, message, sent_at, responded_at, created_at, decided_at, two_way_enabled, candidate_blocked")
    .in("org_id", orgIds)
    .order("sent_at", { ascending: false });

  const refByUser = new Map<string, string>();
  if (search_id) {
    const { data: search } = await ctx.admin.from("employer_searches")
      .select("org_id, ref_map").eq("id", search_id).maybeSingle();
    if (!search) return json({ error: "not found" }, 404);
    if (!(await ctx.assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
    for (const [ref, uid] of Object.entries((search.ref_map as Record<string, string> | null) || {})) refByUser.set(uid, ref);
    q = q.eq("search_id", search_id);
  }

  const { data: rows } = await q;
  const enriched: Array<Record<string, unknown>> = [];
  for (const r of (rows || [])) {
    const base: Record<string, unknown> = {
      id: r.id,
      ref: r.candidate_ref || refByUser.get(r.candidate_user_id) || "",
      status: r.status,
      job_title: r.job_title || "",
      job_location: r.job_location || null,
      employment_type: r.employment_type || null,
      salary_range: r.salary_range || null,
      job_url: r.job_url || null,
      message: r.message || "",
      sent_at: r.sent_at || r.created_at,
      created_at: r.created_at,
      responded_at: r.responded_at || r.decided_at,
      decided_at: r.decided_at,
      two_way_enabled: !!r.two_way_enabled,
      candidate_blocked: !!r.candidate_blocked,
    };
    // First name only, so a list of proposals for one role is readable.
    // Last name, email and phone are released ONLY on an accepted proposal.
    const { data: prof } = await ctx.admin.from("user_profile_data")
      .select("legal_first_name, legal_last_name, email, phone").eq("user_id", r.candidate_user_id).maybeSingle();
    base.first_name = String(prof?.legal_first_name || "").trim().split(/\s+/)[0] || null;
    if (r.status === "approved") {
      const { data: authUser } = await ctx.admin.auth.admin.getUserById(r.candidate_user_id);
      base.name = [prof?.legal_first_name, prof?.legal_last_name].filter(Boolean).join(" ") || null;
      base.email = prof?.email || authUser?.user?.email || null;
      base.phone = prof?.phone || null;
    }

    enriched.push(base);
  }
  return json({ requests: enriched });
}
