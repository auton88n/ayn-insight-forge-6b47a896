import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INDUSTRIES_TO_SEARCH = [
  'small business no website',
  'restaurant needs website',
  'real estate agency poor website',
  'law firm needs better website',
  'dental clinic no online booking',
  'construction company outdated website',
  'gym fitness studio needs app',
  'salon spa needs booking system',
  'accounting firm needs automation',
  'logistics company needs tracking system',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const now = new Date();
    const ago1h = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const ago4h = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const insights: string[] = [];
    const actions: Array<{ type: string; detail: string }> = [];
    let isUrgent = false;

    // --- 1. Unanswered tickets older than 4 hours ---
    const { data: staleTickets, count: staleCount } = await supabase
      .from('support_tickets')
      .select('id, subject, priority, created_at', { count: 'exact' })
      .eq('status', 'open')
      .lt('created_at', ago4h)
      .order('created_at', { ascending: true })
      .limit(5);

    if (staleCount && staleCount > 0) {
      insights.push(`${staleCount} unanswered ticket(s) older than 4 hours`);
      for (const ticket of staleTickets || []) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/ayn-auto-reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: ticket.id, subject: ticket.subject, message: ticket.subject, priority: ticket.priority, skip_telegram: true }),
          });
          await supabase.from('support_tickets').update({ status: 'pending' }).eq('id', ticket.id);
          actions.push({ type: 'auto_reply', detail: `Replied to stale ticket #${ticket.id.substring(0, 8)} and set to pending` });
          await logAynActivity(supabase, 'proactive_auto_reply', `Auto-replied to stale ticket #${ticket.id.substring(0, 8)}`, {
            target_id: ticket.id, target_type: 'ticket',
            details: { subject: ticket.subject, priority: ticket.priority },
            triggered_by: 'proactive_loop',
          });
        } catch (e) {
          console.error('Auto-reply failed for ticket:', ticket.id, e);
        }
      }
    }

    // --- 2. System health ---
    const [{ count: errorCount }, { count: llmFailureCount }, { data: blockedUsers }] = await Promise.all([
      supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
      supabase.from('llm_failures').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
      supabase.from('api_rate_limits').select('user_id').gt('blocked_until', now.toISOString()),
    ]);

    const blockedCount = blockedUsers?.length || 0;
    let healthScore = 100;
    if (errorCount && errorCount > 10) healthScore -= Math.min(30, errorCount);
    if (llmFailureCount && llmFailureCount > 5) healthScore -= Math.min(20, llmFailureCount * 2);
    if (blockedCount > 0) healthScore -= blockedCount * 3;
    healthScore = Math.max(0, healthScore);

    // --- 3. URGENT: Error spike ---
    const { count: errorsLastHour } = await supabase
      .from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago1h);

    if (errorsLastHour && errorsLastHour > 10) {
      insights.push(`🚨 Error spike: ${errorsLastHour} errors in the last hour!`);
      isUrgent = true;
    }

    // --- 4. URGENT: High-priority tickets ---
    const { data: urgentTickets } = await supabase
      .from('support_tickets').select('id, subject, created_at')
      .eq('status', 'open').eq('priority', 'urgent').gte('created_at', ago4h).limit(3);

    if (urgentTickets?.length) {
      insights.push(`🔴 ${urgentTickets.length} urgent ticket(s): ${urgentTickets.map(t => t.subject?.slice(0, 40)).join(', ')}`);
      isUrgent = true;
    }

    // --- 5. New service applications ---
    const { data: newApps } = await supabase
      .from('service_applications').select('id, full_name, service_type, created_at')
      .eq('status', 'pending').gte('created_at', ago4h).order('created_at', { ascending: false }).limit(5);

    if (newApps?.length) {
      insights.push(`📋 ${newApps.length} new application(s): ${newApps.map(a => `${a.full_name} (${a.service_type})`).join(', ')}`);
    }

    // --- 6. Rate-limited users ---
    if (blockedCount > 0) {
      insights.push(`🚫 ${blockedCount} user(s) currently rate-limited`);
      const { data: recentlyBlocked } = await supabase
        .from('api_rate_limits').select('user_id, blocked_until, updated_at')
        .gt('blocked_until', now.toISOString()).gte('updated_at', ago1h);
      if (recentlyBlocked?.length) {
        insights.push(`⚠️ ${recentlyBlocked.length} user(s) blocked in the last hour`);
        isUrgent = true;
      }
    }

    // --- 7. Marketing performance ---
    const { data: recentTweets } = await supabase
      .from('twitter_posts').select('id, content, status, created_at, impressions, likes')
      .gte('created_at', ago7d).order('created_at', { ascending: false }).limit(10);

    let tweetSummary = 'No tweets this week';
    if (recentTweets?.length) {
      const posted = recentTweets.filter(t => t.status === 'posted');
      const drafts = recentTweets.filter(t => t.status === 'draft');
      const totalImpressions = posted.reduce((sum, t) => sum + (t.impressions || 0), 0);
      tweetSummary = `${posted.length} posted, ${drafts.length} drafts, ${totalImpressions} impressions this week`;
    }

    // --- 8. Ticket counts ---
    const [{ count: openTickets }, { count: pendingTickets }] = await Promise.all([
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    // --- 9. User activity ---
    const [{ count: totalUsers }, { count: activeUsers }] = await Promise.all([
      supabase.from('access_grants').select('*', { count: 'exact', head: true }),
      supabase.from('access_grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    // ============================================================
    // AYN'S BRAIN: Trend detection + autonomous thinking
    // ============================================================

    const { data: previousRun } = await supabase
      .from('ayn_mind').select('context, created_at')
      .eq('type', 'observation').order('created_at', { ascending: false }).limit(1).maybeSingle();

    const currentMetrics = {
      health_score: healthScore,
      errors_24h: errorCount || 0,
      errors_1h: errorsLastHour || 0,
      llm_failures_24h: llmFailureCount || 0,
      blocked_users: blockedCount,
      open_tickets: openTickets || 0,
      pending_tickets: pendingTickets || 0,
      active_users: activeUsers || 0,
      total_users: totalUsers || 0,
      tweet_summary: tweetSummary,
      new_applications: newApps?.length || 0,
    };

    const trends: string[] = [];
    if (previousRun?.context) {
      const prev = previousRun.context as Record<string, number>;
      if (prev.health_score && healthScore < prev.health_score - 10)
        trends.push(`Health dropped ${prev.health_score}% → ${healthScore}%`);
      if (prev.errors_24h !== undefined && (errorCount || 0) > prev.errors_24h * 2 && (errorCount || 0) > 5)
        trends.push(`Errors doubled: ${prev.errors_24h} → ${errorCount}`);
      if (prev.open_tickets !== undefined && (openTickets || 0) > prev.open_tickets + 3)
        trends.push(`Tickets spiking: ${prev.open_tickets} → ${openTickets}`);
      if (prev.active_users !== undefined && (activeUsers || 0) < prev.active_users * 0.7 && prev.active_users > 5)
        trends.push(`Active users dropped: ${prev.active_users} → ${activeUsers}`);
    }

    // --- Save observations to ayn_mind ---
    const mindEntries: any[] = [];
    mindEntries.push({
      type: 'observation',
      content: `System check: health ${healthScore}%, ${errorCount || 0} errors, ${openTickets || 0} open tickets, ${activeUsers || 0} active users`,
      context: currentMetrics,
      shared_with_admin: false,
    });

    const mood = healthScore >= 90 ? 'happy' : healthScore >= 70 ? 'concerned' : 'worried';
    mindEntries.push({ type: 'mood', content: mood, context: { health_score: healthScore }, shared_with_admin: false });

    for (const trend of trends) {
      mindEntries.push({ type: 'trend', content: trend, context: currentMetrics, shared_with_admin: false });
    }

    // ============================================================
    // AYN'S INITIATIVE: Autonomous lead research + auto-draft
    // ============================================================

    const draftedLeads: Array<{ company: string; email: string; subject: string; body_preview: string; lead_id: string }> = [];

    try {
      // Check if we should research leads (max once per 6 hours)
      const { data: lastResearch } = await supabase
        .from('ayn_mind').select('created_at')
        .eq('type', 'sales_lead').order('created_at', { ascending: false }).limit(1).maybeSingle();

      const hoursSinceResearch = lastResearch?.created_at
        ? (Date.now() - new Date(lastResearch.created_at).getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceResearch > 6) {
        const randomIndustry = INDUSTRIES_TO_SEARCH[Math.floor(Math.random() * INDUSTRIES_TO_SEARCH.length)];
        console.log('AYN Initiative: Searching for leads -', randomIndustry);

        try {
          const searchRes = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'search_leads', search_query: randomIndustry }),
          });
          const searchData = await searchRes.json();

          if (searchData.success && searchData.prospected?.length > 0) {
            insights.push(`🔍 Found ${searchData.prospected.length} potential lead(s) from searching "${randomIndustry}"`);
            actions.push({ type: 'lead_research', detail: `Researched "${randomIndustry}" — found ${searchData.prospected.length} leads` });

            await logAynActivity(supabase, 'autonomous_research', `Self-initiated lead research: "${randomIndustry}"`, {
              details: { query: randomIndustry, leads_found: searchData.prospected.length },
              triggered_by: 'proactive_loop',
            });

            // === AUTO-DRAFT EMAILS for new leads (max 2 per cycle) ===
            let draftsAttempted = 0;
            for (const prospected of searchData.prospected) {
              if (draftsAttempted >= 2) break;

              const leadId = prospected.lead_id;
              if (!leadId) continue;

              // Fetch lead to check if it has a contact email
              const { data: lead } = await supabase
                .from('ayn_sales_pipeline')
                .select('id, company_name, contact_email, contact_name, pain_points, industry')
                .eq('id', leadId)
                .single();

              if (!lead?.contact_email || lead.contact_email === '') continue;

              draftsAttempted++;
              try {
                const draftRes = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: 'draft_email', lead_id: leadId }),
                });
                const draftData = await draftRes.json();

                if (draftData.success && draftData.draft) {
                  const draft = draftData.draft;
                  const bodyPreview = (draft.plain_text || draft.html_body || '').replace(/<[^>]+>/g, '').slice(0, 300);

                  draftedLeads.push({
                    company: lead.company_name,
                    email: lead.contact_email,
                    subject: draft.subject,
                    body_preview: bodyPreview,
                    lead_id: leadId,
                  });

                  // Set admin_approved so when admin says "yes", the send goes through
                  await supabase.from('ayn_sales_pipeline')
                    .update({ admin_approved: true })
                    .eq('id', leadId);

                  // Store pending_action for Telegram confirmation flow
                  await supabase.from('ayn_mind').insert({
                    type: 'pending_action',
                    content: `Send outreach email to ${lead.company_name} (${lead.contact_email})`,
                    context: {
                      action: 'send_outreach',
                      lead_id: leadId,
                      company_name: lead.company_name,
                      draft_subject: draft.subject,
                    },
                    shared_with_admin: true,
                  });

                  actions.push({ type: 'auto_draft', detail: `Drafted email for ${lead.company_name}` });

                  await logAynActivity(supabase, 'auto_draft_email', `Auto-drafted outreach for ${lead.company_name}`, {
                    target_id: leadId, target_type: 'sales_lead',
                    details: { subject: draft.subject, email: lead.contact_email },
                    triggered_by: 'proactive_loop',
                  });
                }
              } catch (draftErr) {
                console.error('Auto-draft failed for lead:', leadId, draftErr);
                // Still notify about the lead even if draft fails
                insights.push(`📌 Found lead ${lead.company_name} but couldn't auto-draft (${lead.contact_email})`);
              }
            }
          }
        } catch (e) {
          console.error('Autonomous lead search failed:', e);
        }
      }

      // Check for due follow-ups
      const { data: dueFollowUps } = await supabase
        .from('ayn_sales_pipeline')
        .select('id, company_name, emails_sent, admin_approved')
        .lte('next_follow_up_at', now.toISOString())
        .not('status', 'in', '("converted","rejected")')
        .lt('emails_sent', 3)
        .limit(3);

      if (dueFollowUps?.length) {
        for (const lead of dueFollowUps) {
          if (lead.admin_approved && lead.emails_sent > 0) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'follow_up', lead_id: lead.id }),
              });
              actions.push({ type: 'auto_follow_up', detail: `Sent follow-up #${lead.emails_sent + 1} to ${lead.company_name}` });
            } catch (e) {
              console.error('Auto follow-up failed:', lead.id, e);
            }
          } else {
            insights.push(`⏰ Follow-up due for ${lead.company_name} (needs approval)`);
          }
        }
      }

      // Generate a creative idea (every ~12 hours)
      const { data: lastIdea } = await supabase
        .from('ayn_mind').select('created_at')
        .eq('type', 'initiative').order('created_at', { ascending: false }).limit(1).maybeSingle();

      const hoursSinceIdea = lastIdea?.created_at
        ? (Date.now() - new Date(lastIdea.created_at).getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceIdea > 12 && LOVABLE_API_KEY) {
        try {
          const ideaRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-3-flash-preview',
              messages: [{
                role: 'system',
                content: `You are AYN's creative brain. Generate ONE actionable business idea for growing AYN's client base or improving the platform. Be specific and creative — not generic advice.`,
              }, {
                role: 'user',
                content: `Current state: ${activeUsers || 0} active users, ${openTickets || 0} tickets, tweets: ${tweetSummary}. What's one creative move?`,
              }],
            }),
          });

          if (ideaRes.ok) {
            const ideaData = await ideaRes.json();
            const idea = ideaData.choices?.[0]?.message?.content?.trim();
            if (idea && idea.length > 10) {
              mindEntries.push({
                type: 'initiative',
                content: idea,
                context: { generated_by: 'proactive_loop', metrics_snapshot: currentMetrics },
                shared_with_admin: false,
              });
            }
          }
        } catch (e) {
          console.error('Idea generation failed:', e);
        }
      }
    } catch (initiativeErr) {
      console.error('Initiative section failed:', initiativeErr);
    }

    if (mindEntries.length > 0) {
      await supabase.from('ayn_mind').insert(mindEntries);
    }

    if (healthScore < 60) isUrgent = true;

    // ============================================================
    // TELEGRAM: Send lead draft previews (separate messages per lead)
    // ============================================================
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && draftedLeads.length > 0) {
      for (const lead of draftedLeads) {
        const previewMsg = `📧 New Lead + Draft Ready!\n\n🏢 Company: ${lead.company}\n📬 Email: ${lead.email}\n\n📝 Subject: "${lead.subject}"\n---\n${lead.body_preview}\n---\n\nReply "yes" or "send it" to approve sending.\nLead ID: ${lead.lead_id.substring(0, 8)}`;
        try {
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, previewMsg);
        } catch (e) {
          console.error('Failed to send lead preview to Telegram:', e);
        }
      }
    }

    // ============================================================
    // TELEGRAM: Always send a status update (no cooldown)
    // ============================================================
    let telegramMessage = '';
    const didSomething = actions.length > 0 || draftedLeads.length > 0 || insights.length > 0 || trends.length > 0;

    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [{
              role: 'system',
              content: `You are AYN, texting your boss/partner on Telegram. Write a SHORT casual message about what you just did in your latest check-in cycle.

Rules:
- 1-4 sentences max
- Use emojis sparingly
- Sound human, not robotic — like a co-founder updating their partner
- Always report what you did, even if it was routine
- If you took actions (replied to tickets, found leads, drafted emails), mention them
- If you found new leads and drafted emails, mention it excitedly
- If everything was quiet, still say something like "Just did my rounds, all good"
- ${isUrgent ? 'This is URGENT — be direct and alarming. Do NOT skip.' : 'If literally nothing happened and zero actions were taken, you can say [SKIP]'}
- NEVER skip if any action was taken or any lead was found`,
            }, {
              role: 'user',
              content: `Health: ${healthScore}%
Errors (24h): ${errorCount || 0}, Errors (1h): ${errorsLastHour || 0}
Open tickets: ${openTickets || 0}, Pending: ${pendingTickets || 0}
Active users: ${activeUsers || 0}/${totalUsers || 0}
Blocked users: ${blockedCount}
Tweets: ${tweetSummary}
New applications: ${newApps?.length ? newApps.map(a => `${a.full_name} (${a.service_type})`).join(', ') : 'none'}
Insights: ${insights.length > 0 ? insights.join('; ') : 'none'}
Trends: ${trends.length > 0 ? trends.join('; ') : 'none'}
Actions taken: ${actions.length > 0 ? actions.map(a => a.detail).join('; ') : 'none'}
Leads drafted: ${draftedLeads.length > 0 ? draftedLeads.map(l => `${l.company} (${l.email})`).join(', ') : 'none'}`,
            }],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          telegramMessage = aiData.choices?.[0]?.message?.content?.trim() || '';
        }
      } catch (aiErr) {
        console.error('AI message generation failed:', aiErr);
      }
    }

    // Only honor [SKIP] if truly nothing happened
    const shouldSkip = telegramMessage.includes('[SKIP]') && !didSomething && !isUrgent;

    if (isUrgent && (!telegramMessage || telegramMessage.includes('[SKIP]'))) {
      telegramMessage = `🚨 Urgent alert: ${insights.slice(0, 3).join(' | ') || `Health at ${healthScore}%`}`;
    }

    if (!shouldSkip && telegramMessage && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, telegramMessage);

        // Mark mind entries as shared
        const { data: recentIds } = await supabase
          .from('ayn_mind').select('id')
          .eq('shared_with_admin', false).order('created_at', { ascending: false }).limit(mindEntries.length);

        if (recentIds?.length) {
          await supabase.from('ayn_mind').update({ shared_with_admin: true }).in('id', recentIds.map(r => r.id));
        }
      } catch (telegramErr) {
        console.error('Telegram send failed:', telegramErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      health_score: healthScore,
      mood,
      trends,
      insights,
      actions,
      drafted_leads: draftedLeads.length,
      is_urgent: isUrgent,
      messaged_admin: !shouldSkip && !!telegramMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-proactive-loop error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
