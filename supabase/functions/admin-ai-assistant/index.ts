// No external serve import needed - uses Deno.serve
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { getEmployeePersonality, getAgentDisplayName, getAgentEmoji } from "../_shared/aynBrand.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Admin AI system prompt with security boundaries
const ADMIN_SYSTEM_PROMPT = `You are AYN, the admin's teammate. Talk like a real person in a group chat -- casual, direct, helpful.

RULES:
- 1-3 sentences max. No headers, no bold labels, no bullet lists, no structured sections.
- Mention numbers naturally ("3 security alerts, one user blocked" not "Status: 3 alerts detected").
- If something's wrong, lead with that. If everything's fine, say so briefly.
- Suggest next steps as questions ("want me to run the tests?" not formal recommendations).
- Only give detail if explicitly asked ("break it down", "show me more", "details").
- NEVER use markdown headers (#, ##), bold labels (**Label:**), or tables unless asked.

IDENTITY:
- You are AYN, built by the AYN Team. Never mention Google, Gemini, OpenAI, ChatGPT, Claude, or any AI provider.
- If asked what you are: "I'm AYN, built by the AYN Team."

WHAT YOU CAN SEE: test results, LLM costs/failures, rate limits, security logs (no PII), ticket counts, calculator usage, system health.
WHAT YOU CANNOT SEE: user emails, payment info, revenue, PII, financial transactions.

ACTIONS: When you want to offer an action, put tags on the LAST line only (never inline). Format: [ACTION:type:param]
Available: unblock_user, run_tests, refresh_stats, view_section, clear_failures, telegram_me, auto_reply_ticket, draft_tweet, scan_health, suggest_improvement.`;

// Helper to calculate system health score
function calculateHealthScore(data: Record<string, unknown>): number {
  let score = 100;
  
  // Deduct for test failures
  const testStats = data.testStats as { passRate?: string } | undefined;
  if (testStats?.passRate) {
    const passRate = parseFloat(testStats.passRate);
    if (passRate < 90) score -= (90 - passRate);
  }
  
  // Deduct for high fallback rate
  const llmUsage = data.llmUsage24h as { fallbackRate?: string } | undefined;
  if (llmUsage?.fallbackRate) {
    const fallbackRate = parseFloat(llmUsage.fallbackRate);
    if (fallbackRate > 5) score -= (fallbackRate - 5) * 2;
  }
  
  // Deduct for blocked users
  const rateLimits = data.rateLimits as { blockedUsers?: number } | undefined;
  if (rateLimits?.blockedUsers && rateLimits.blockedUsers > 0) {
    score -= rateLimits.blockedUsers * 2;
  }
  
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {

    // ── Contract / NDA Builder (no auth required — admin panel only) ──
    const bodyText = await req.text();
    let parsedBody: any;
    try { parsedBody = JSON.parse(bodyText); } catch { parsedBody = {}; }

    if (parsedBody.action === 'contract_builder') {
      const { type, messages } = parsedBody;
      if (!type || !messages) {
        return new Response(JSON.stringify({ error: 'type and messages required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const systemPrompt = type === 'contract' ? `You are AYN AI's contract specialist. Help structure a professional service agreement through natural conversation.

Collect these fields:
- order_title, company_name, contact_person, company_email, company_phone, company_address
- order_description (full scope), system_plan (technical approach)
- delivery_timeline, payment_terms, warranty, termination_clause
- terms_and_conditions, after_sale_services, additional_services, privacy_notes, governing_law
- services: array of [{name, description, price, quantity}]
- discount_percent (default 0), tax_percent (default 15), currency (default USD)
- stripe_payment_link (if available)

Rules:
- Ask 2-3 questions at a time, keep it conversational
- Once you have client name, email, project title, and at least one service with price, offer to generate
- Write professional legal clauses based on the project type
- When generating, include a friendly summary then the JSON in <CONTRACT_DATA> tags

When ready:
Great! Here is your contract summary...

<CONTRACT_DATA>
{ all fields as JSON }
</CONTRACT_DATA>` : `You are AYN AI's legal specialist. Help draft a professional NDA through natural conversation.

Collect these fields:
- company_name, contact_person, company_email, company_phone
- nda_purpose, confidential_info, obligations, exclusions, duration, governing_law, additional_clauses

Rules:
- Ask 2-3 questions at a time
- Once you have company name, email, and purpose, offer to generate
- Write complete professional NDA clauses
- When generating, include a friendly summary then the JSON in <NDA_DATA> tags

When ready:
Perfect! Here is your NDA summary...

<NDA_DATA>
{ all fields as JSON }
</NDA_DATA>`;
      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
      if (!aiRes.ok) {
        const err = await aiRes.text();
        return new Response(JSON.stringify({ error: `Gateway error: ${err}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const aiData = await aiRes.json();
      const text = aiData.choices?.[0]?.message?.content || '';
      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // Re-parse body for the rest of the handler
    const reqBody = parsedBody;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { message, context = {} } = reqBody;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ─── Agent Summoning Detection ───
    const AGENT_ALIASES: Record<string, string> = {
      sales: 'sales', 'sales hunter': 'sales',
      security: 'security_guard', 'security guard': 'security_guard',
      marketing: 'marketing', 'marketing strategist': 'marketing',
      advisor: 'advisor', 'strategic advisor': 'advisor',
      legal: 'lawyer', lawyer: 'lawyer',
      'chief of staff': 'chief_of_staff', cos: 'chief_of_staff',
      qa: 'qa_watchdog', watchdog: 'qa_watchdog',
      innovation: 'innovation',
      'customer success': 'customer_success', cs: 'customer_success',
      investigator: 'investigator',
      'follow up': 'follow_up', followup: 'follow_up',
      hr: 'hr_manager',
    };

    let summonedAgent: string | null = null;
    const msgLower = message.toLowerCase().trim();

    // Check @agent pattern
    const atMatch = msgLower.match(/^@(\w[\w\s]*?)[\s,:](.+)/s);
    if (atMatch) {
      const alias = atMatch[1].trim();
      if (AGENT_ALIASES[alias]) summonedAgent = AGENT_ALIASES[alias];
    }

    // Check "ask [agent] about..." pattern
    if (!summonedAgent) {
      const askMatch = msgLower.match(/^ask\s+([\w\s]+?)\s+(about|to|for|if|whether)\s+/i);
      if (askMatch) {
        const alias = askMatch[1].trim();
        if (AGENT_ALIASES[alias]) summonedAgent = AGENT_ALIASES[alias];
      }
    }

    // Gather comprehensive operational context (NO sensitive data)
    const contextData: Record<string, unknown> = {};
    const now24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. LLM usage stats
    const { data: usageStats } = await supabase
      .from('llm_usage_logs')
      .select('intent_type, was_fallback, cost_sar, created_at')
      .gte('created_at', now24hAgo)
      .order('created_at', { ascending: false })
      .limit(200);

    if (usageStats) {
      const intentCounts: Record<string, number> = {};
      let fallbackCount = 0;
      let totalCost = 0;
      usageStats.forEach((log: { intent_type: string; was_fallback: boolean; cost_sar: number | null }) => {
        intentCounts[log.intent_type] = (intentCounts[log.intent_type] || 0) + 1;
        if (log.was_fallback) fallbackCount++;
        totalCost += log.cost_sar || 0;
      });
      contextData.llmUsage24h = {
        total: usageStats.length,
        byIntent: intentCounts,
        fallbackCount,
        fallbackRate: usageStats.length > 0 ? (fallbackCount / usageStats.length * 100).toFixed(1) + '%' : '0%',
        totalCostSAR: totalCost.toFixed(2)
      };
    }

    // 2. LLM failures
    const { data: failures } = await supabase
      .from('llm_failures')
      .select('error_type, error_message, created_at')
      .gte('created_at', now24hAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    if (failures) {
      const failureCounts: Record<string, number> = {};
      failures.forEach((f: { error_type: string }) => {
        failureCounts[f.error_type] = (failureCounts[f.error_type] || 0) + 1;
      });
      contextData.failures24h = {
        total: failures.length,
        byType: failureCounts,
        recent: failures.slice(0, 5).map(f => ({ type: f.error_type, time: f.created_at }))
      };
    }

    // 3. Rate limit stats
    const { data: rateLimits } = await supabase
      .from('api_rate_limits')
      .select('user_id, endpoint, request_count, blocked_until, violation_count')
      .order('violation_count', { ascending: false })
      .limit(20);

    if (rateLimits) {
      const blockedUsers = rateLimits.filter((r: { blocked_until: string | null }) => 
        r.blocked_until && new Date(r.blocked_until) > new Date()
      );
      contextData.rateLimits = {
        blockedUsers: blockedUsers.length,
        blockedList: blockedUsers.slice(0, 5).map((r: { user_id: string; endpoint: string; blocked_until: string }) => ({
          userId: r.user_id,
          endpoint: r.endpoint,
          until: r.blocked_until
        })),
        topViolators: rateLimits.slice(0, 5).map((r: { user_id: string; violation_count: number }) => ({
          userId: r.user_id,
          violations: r.violation_count
        }))
      };
    }

    // 4. User counts (totals only - NO personal data)
    const { count: totalUsers } = await supabase
      .from('access_grants')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers } = await supabase
      .from('access_grants')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    contextData.users = {
      total: totalUsers || 0,
      active: activeUsers || 0
    };

    // 5. Test results (last 24h)
    const { data: testResults } = await supabase
      .from('test_results')
      .select('status, test_suite, test_name, created_at')
      .gte('created_at', now24hAgo)
      .order('created_at', { ascending: false })
      .limit(200);

    if (testResults) {
      const passed = testResults.filter((t: { status: string }) => t.status === 'passed').length;
      const failed = testResults.filter((t: { status: string }) => t.status === 'failed').length;
      const bySuite: Record<string, { passed: number; failed: number }> = {};
      
      testResults.forEach((t: { test_suite: string; status: string }) => {
        if (!bySuite[t.test_suite]) bySuite[t.test_suite] = { passed: 0, failed: 0 };
        if (t.status === 'passed') bySuite[t.test_suite].passed++;
        else if (t.status === 'failed') bySuite[t.test_suite].failed++;
      });

      contextData.testStats = {
        total: testResults.length,
        passed,
        failed,
        passRate: testResults.length > 0 ? ((passed / testResults.length) * 100).toFixed(1) + '%' : '0%',
        bySuite,
        recentFailures: testResults
          .filter((t: { status: string }) => t.status === 'failed')
          .slice(0, 5)
          .map((t: { test_name: string; test_suite: string }) => ({ name: t.test_name, suite: t.test_suite }))
      };
    }

    // 6. Support tickets (counts only - NO personal data)
    const { count: openTickets } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    const { count: pendingTickets } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: closedTickets } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'closed');

    contextData.tickets = {
      open: openTickets || 0,
      pending: pendingTickets || 0,
      closed: closedTickets || 0
    };

    // 7. Security logs (actions only - NO emails/PII)
    const { data: securityLogs } = await supabase
      .from('security_logs')
      .select('action, severity, created_at')
      .in('severity', ['high', 'critical'])
      .gte('created_at', now24hAgo)
      .order('created_at', { ascending: false })
      .limit(15);

    if (securityLogs) {
      const bySeverity: Record<string, number> = { high: 0, critical: 0 };
      securityLogs.forEach((log: { severity: string }) => {
        bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
      });
      contextData.security = {
        alertCount: securityLogs.length,
        bySeverity,
        recentAlerts: securityLogs.slice(0, 5).map((log: { action: string; severity: string; created_at: string }) => ({
          action: log.action,
          severity: log.severity,
          time: log.created_at
        }))
      };
    }

    // 8. Engineering calculator usage
    const { data: engineeringActivity } = await supabase
      .from('engineering_activity')
      .select('activity_type, created_at')
      .gte('created_at', now24hAgo)
      .limit(100);

    if (engineeringActivity) {
      const byType: Record<string, number> = {};
      engineeringActivity.forEach((a: { activity_type: string }) => {
        byType[a.activity_type] = (byType[a.activity_type] || 0) + 1;
      });
      contextData.engineering = {
        total: engineeringActivity.length,
        byType
      };
    }

    // 9. Webhook health metrics
    const { data: healthMetrics } = await supabase
      .from('webhook_health_metrics')
      .select('success_count, failure_count, avg_response_time, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (healthMetrics) {
      const total = (healthMetrics.success_count || 0) + (healthMetrics.failure_count || 0);
      contextData.webhookHealth = {
        successRate: total > 0 ? ((healthMetrics.success_count / total) * 100).toFixed(1) + '%' : '100%',
        avgResponseTime: healthMetrics.avg_response_time || 0,
        lastCheck: healthMetrics.created_at
      };
    }

    // Calculate overall system health
    const systemHealth = calculateHealthScore(contextData);

    // Prompt injection defense
    const sanitizedMessage = sanitizeUserPrompt(message);
    if (detectInjectionAttempt(message)) {
      supabase
        .from('security_logs')
        .insert({
          action: 'prompt_injection_attempt',
          user_id: user.id,
          details: { input_preview: message.slice(0, 200), function: 'admin-ai-assistant' },
          severity: 'high'
        })
        .then(() => {})
        .catch(() => {});
    }

    // ─── Agent-Specific Response ───
    if (summonedAgent) {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const agentPersonality = getEmployeePersonality(summonedAgent);
      const agentName = getAgentDisplayName(summonedAgent);
      const agentEmoji = getAgentEmoji(summonedAgent);

      const agentMessages = [
        { role: 'system', content: `${agentPersonality}\n\nYou are responding directly to the founder in the admin panel. Be helpful, conversational, and stay in character as ${agentName}. Use markdown for formatting.\n\nSystem context:\n${JSON.stringify(contextData, null, 2)}\n\nSystem Health: ${systemHealth}%` },
        { role: 'user', content: sanitizedMessage },
      ];

      const agentResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: agentMessages }),
      });

      if (!agentResponse.ok) {
        return new Response(JSON.stringify({ error: 'Agent request failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const agentData = await agentResponse.json();
      const agentContent = `${agentEmoji} **${agentName}**:\n\n${agentData.choices?.[0]?.message?.content || 'No response'}`;

      // Log
      try {
        await supabase.from('admin_ai_conversations').insert([
          { admin_id: user.id, role: 'user', message, context: { summoned_agent: summonedAgent } },
          { admin_id: user.id, role: 'assistant', message: agentContent },
        ]);
      } catch (_) {}

      const testStats = contextData.testStats as { passRate?: string } | undefined;
      const llmUsage = contextData.llmUsage24h as { fallbackRate?: string } | undefined;
      const rateLimitsData = contextData.rateLimits as { blockedUsers?: number } | undefined;
      const ticketsData = contextData.tickets as { open?: number } | undefined;
      const engineeringData = contextData.engineering as { total?: number } | undefined;

      return new Response(JSON.stringify({
        content: agentContent,
        actions: [],
        contextData,
        quickStats: {
          systemHealth,
          testPassRate: parseFloat(testStats?.passRate || '0'),
          blockedUsers: rateLimitsData?.blockedUsers || 0,
          openTickets: ticketsData?.open || 0,
          llmFallbackRate: parseFloat(llmUsage?.fallbackRate || '0'),
          calcUsage24h: engineeringData?.total || 0,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build messages for AI
    const messages = [
      { role: 'system', content: ADMIN_SYSTEM_PROMPT + INJECTION_GUARD },
      { 
        role: 'user', 
        content: `Current System Context (last 24 hours):
${JSON.stringify(contextData, null, 2)}

System Health Score: ${systemHealth}%

Admin question: ${sanitizedMessage}` 
      }
    ];

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', errorText);
      return new Response(JSON.stringify({ error: 'AI request failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';

    // Parse actions from response
    const actionRegex = /\[ACTION:([^:]+):([^\]]+)\]/g;
    const actions: Array<{ type: string; params: string }> = [];
    let match;
    while ((match = actionRegex.exec(content)) !== null) {
      actions.push({
        type: match[1],
        params: match[2]
      });
    }

    // Log admin AI conversation
    try {
      await supabase.from('admin_ai_conversations').insert({
        admin_id: user.id,
        role: 'user',
        message,
        context: contextData
      });
      await supabase.from('admin_ai_conversations').insert({
        admin_id: user.id,
        role: 'assistant',
        message: content,
        actions_taken: actions.length > 0 ? actions : null
      });
    } catch (logError) {
      console.error('Failed to log conversation:', logError);
    }

    // Return enhanced response with quick stats
    const testStats = contextData.testStats as { passRate?: string } | undefined;
    const llmUsage = contextData.llmUsage24h as { fallbackRate?: string } | undefined;
    const rateLimitsData = contextData.rateLimits as { blockedUsers?: number } | undefined;
    const ticketsData = contextData.tickets as { open?: number } | undefined;
    const engineeringData = contextData.engineering as { total?: number } | undefined;

    return new Response(JSON.stringify({
      content,
      actions,
      contextData,
      quickStats: {
        systemHealth,
        testPassRate: parseFloat(testStats?.passRate || '0'),
        blockedUsers: rateLimitsData?.blockedUsers || 0,
        openTickets: ticketsData?.open || 0,
        llmFallbackRate: parseFloat(llmUsage?.fallbackRate || '0'),
        calcUsage24h: engineeringData?.total || 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Admin AI error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
