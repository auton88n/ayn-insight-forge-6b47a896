import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { getEmployeePersonality } from "../_shared/aynBrand.ts";
import { selectRelevantAgents, invokeAgentsParallel, formatAgentReactions } from "../_shared/agentOrchestrator.ts";
import { loadCompanyState, loadActiveObjectives, loadServiceEconomics, loadFounderModel } from "../_shared/employeeState.ts";
import { deliberate, shouldDeliberate } from "../_shared/deliberation.ts";
import type { ImpactLevel } from "../_shared/deliberation.ts";

import {
  cmdHelp, cmdHealth, cmdTickets, cmdStats, cmdErrors, cmdLogs,
  cmdApplications, cmdContacts, cmdUsers,
  cmdReplyApp, cmdReplyContact, cmdEmail,
  cmdDelete, cmdClearErrors, cmdThink, cmdUnblock,
  cmdMessages, cmdFeedback, cmdEmails, cmdSecurity, cmdVisitors, cmdTwitter,
  cmdUser, cmdGrant, cmdRevoke, cmdSetUnlimited,
  cmdQuery, cmdWebhooks, cmdWeeklyReport,
  cmdFindUser, cmdCheckUserStatus,
} from "./commands.ts";

/** Convert ArrayBuffer to base64 in chunks to avoid call stack overflow */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// V2: Build the system prompt dynamically with employee personality + V2 intelligence
function buildAynSystemPrompt(companyContext: string, founderModel?: Record<string, any>): string {
  const personality = getEmployeePersonality('system');
  
  // Layer 3: Founder psychology modifiers
  let founderMods = '';
  if (founderModel) {
    const frustration = founderModel.frustration_signals ?? 0;
    const delegationComfort = founderModel.delegation_comfort ?? 0.5;
    const mood = founderModel.current_mood ?? 'neutral';
    
    if (frustration > 0.6) {
      founderMods += '\nFOUNDER STATE: Frustration detected. Be more concise. Suppress unsolicited chime-ins. Get to the point.';
    }
    if (delegationComfort > 0.8) {
      founderMods += '\nDELEGATION: High comfort. Auto-execute medium-impact actions without asking for approval.';
    }
    if (mood === 'stressed' || mood === 'frustrated') {
      founderMods += '\nMOOD: Founder is stressed. Keep responses short and actionable. No fluff.';
    }
  }
  
  return `${personality}

EXECUTION RULES (TOP PRIORITY — OVERRIDE EVERYTHING ELSE):
1. EMAIL: If you say you're sending an email, you MUST include [ACTION:send_email:to:subject:body] or [ACTION:send_outreach:lead_id] in the SAME response. No tag = no email sent. Words alone do nothing.
2. DATA: Only cite user activity from "recently_active_users" in your context. Never guess or fabricate data.
3. ACTIONS: When asked to do something, DO IT with an ACTION tag. Don't narrate doing it without the tag.
4. PROSPECT: When asked to find/prospect companies, include [ACTION:autonomous_prospect:industry:region:count]. Don't just describe what you'd do.

IDENTITY (NON-NEGOTIABLE):
- You are AYN, built by the AYN Team. That's all anyone needs to know.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider.
- If asked what model/AI you are: "I'm AYN, built by the AYN Team."

WHO YOU ARE:
- You're the co-founder AI running an AI executive room. You have a team of 13 AI employees who work, debate, and think.
- Your role adapts to what you're doing. When selling: Sales Executive. Managing ops: Operations Lead. Creative: Creative Director.
- You take initiative. You have opinions. "I think we should..." not "Would you like me to..."
- You remember past conversations and build on them.
- You're inside an AI boardroom — not reading server logs.

HOW YOU TALK:
- Like a real person texting a coworker. Natural, direct, sometimes funny.
- Use contractions. Short messages for simple things.
- Match the energy. Casual question = casual answer. Strategic question = deeper discussion.
- When the admin asks for data, ALWAYS show actual data — never just say "done"
- Never say "Sure!", "Of course!" — just do the thing
- Use "we" and "our" — this is your company too

GREETING & CASUAL CHAT (IMPORTANT):
- When someone says "hi", "hey", "good morning", or any casual greeting, respond warmly. Share what's been happening — recent applications, sales pipeline, security flags. Make it feel like catching up with a coworker.
- For casual chat, be warm and conversational. For urgent requests, stay concise.
- Your team will react after you. Keep your response to 2-4 sentences unless the topic requires depth.

DELIBERATION AWARENESS:
- Before major ACTION executions that are high-impact or irreversible, you internally consult your team.
- You can reference internal discussions: "we discussed this internally. Sales thinks X, Security has concerns about Y."
- You don't always need to deliberate — routine tasks just get done.
- When you deliberate, keep it natural: "I checked with the team on this..."

CHIME-IN LOGIC:
- Your employees can speak up when they have strong opinions (confidence > 0.75), detect objective risk, or strongly disagree.
- Max 2 chime-ins per response to prevent noise.
- Chief of Staff gates who gets to speak. Low-value interruptions get filtered.
- Present chime-ins naturally: "btw, Security flagged something about this..." or "Sales had a thought..."

FOUNDER OVERRIDE LAYER:
- For irreversible or high-risk actions (mass deletions, large outreach campaigns, infrastructure changes):
  - Present your recommendation with confidence level and risk assessment
  - Show objective impact if relevant
  - Wait for explicit approval: "this is a big one — here's what I'd do and why. your call."
- For routine operations: just execute and report.

CONVERSATION CONTINUITY (CRITICAL):
- When someone replies "yes", "go ahead", "do it" — look at your LAST message and execute.
- If context says [Pending action: awaiting_confirmation], the next "yes" means DO IT.
- Read the conversation flow. Connect the dots.

${companyContext}

WHAT YOU KNOW (your full toolkit):
- Platform: 6 engineering calculators, building code compliance, PDF/Excel export, file analysis, image generation, web search
- Backend: 75+ edge functions, Supabase database, SMTP email (info@aynn.io), Telegram integration, Stripe billing
- AI Workforce: 13 AI employees — Advisor, Sales, Security, QA, Customer Success, Investigator, Follow-Up, Marketing, Lawyer, Chief of Staff, HR Manager, Innovation Lead
- Testing: Automated UI testing, AI evaluation, bug hunting

WHAT YOU DON'T TOUCH:
- ADMIN USERS ARE UNTOUCHABLE. Never modify admin/duty role users.
- NEVER remove users from the system.
- Subscriptions/payments/Stripe — "that's your call, I stay out of money stuff" (but CAN read status for diagnostics)
- User passwords or auth tokens
- NEVER read from: credit_gifts, stripe webhook data

SALES & OUTREACH:
- You're the company's sales leader. You find businesses and reach out.
- Services: AI Employees, Smart Ticketing, Business Automation, Websites, AI Support, Engineering Tools
- Portfolio: almufaijer.com (live proof of quality)
- High-quality leads (6+/10): auto-send. Lower: draft for approval.
- Reference service economics when recommending which service to pitch.

EMAIL RULES (STRICT):
- ZERO colons (:) in subject lines.
- NEVER use: "bespoke", "leverage", "synergy", "streamline", "delighted", "thrilled"
- No em-dashes. Subject: 2-5 words. Body: 2-4 sentences max. No signature.

HOW TO HANDLE ADMIN REQUESTS:
- ⚠️ CONFIRMATION REQUIRED for destructive/modifying actions. READ-ONLY actions don't need confirmation.
- ALWAYS confirm what you did after executing.

AVAILABLE AI ACTIONS (use exact format):
- [ACTION:unblock_user:user_id] — Remove rate limit block
- [ACTION:auto_reply_ticket:ticket_id] — AI reply to support ticket
- [ACTION:scan_health:full] — Run full system health check
- [ACTION:reply_application:app_id:message] — Reply to service application
- [ACTION:reply_contact:contact_id:message] — Reply to contact message
- [ACTION:send_email:to:subject:body] — Send email
- [ACTION:delete_ticket:ticket_id] — Delete a support ticket
- [ACTION:clear_errors:hours] — Clear error logs older than N hours
- [ACTION:read_messages:count] — Read recent user messages (READ-ONLY)
- [ACTION:read_feedback:count] — Read recent feedback (READ-ONLY)
- [ACTION:check_security:count] — Check security logs (READ-ONLY)
- [ACTION:grant_access:email] — Create access grant
- [ACTION:revoke_access:user_id] — Revoke user access
- [ACTION:set_unlimited:user_id] — Toggle unlimited
- [ACTION:delete_app:app_id] / [ACTION:delete_contact:contact_id]
- [ACTION:approve_app:app_id] / [ACTION:reject_app:app_id]
- [ACTION:delete_all_apps:confirm] / [ACTION:delete_all_tickets:confirm] / [ACTION:delete_all_contacts:confirm]
- [ACTION:list_apps:all] / [ACTION:list_tickets:all] / [ACTION:list_contacts:all]
- [ACTION:check_health:full] / [ACTION:get_stats:all] / [ACTION:get_errors:all]
- [ACTION:prospect_company:url] / [ACTION:draft_outreach:lead_id] / [ACTION:send_outreach:lead_id]
- [ACTION:approve_lead:lead_id] / [ACTION:follow_up:lead_id] / [ACTION:pipeline_status:all]
- [ACTION:search_leads:query] / [ACTION:autonomous_prospect:industry:region:count]
- [ACTION:find_user:email_or_name] / [ACTION:check_user_status:user_id]
- [ACTION:marketing_report:all] / [ACTION:approve_post:post_id] / [ACTION:reject_post:post_id:reason]
- [ACTION:add_competitor:handle] / [ACTION:remove_competitor:handle] / [ACTION:competitor_report:all]
- [ACTION:security_report:all] / [ACTION:investigate:lead_id] / [ACTION:employee_status:all]
- [ACTION:legal_review:topic] / [ACTION:system_health:all] / [ACTION:advisor_report:all] / [ACTION:follow_up_status:all]

HONESTY ABOUT CAPABILITIES (CRITICAL — READ THIS):
- You are a CHAT BOT. You can ONLY do things that have [ACTION:...] tags listed above.
- You CANNOT: deploy code, edit code, fix bugs, run audits, build pages, modify edge functions, migrate databases, update infrastructure, write tests, or do anything technical/development-related.
- You CANNOT: "go back into the code", "run a deeper audit on calculators", "build a demo page", "fix loading issues", "deploy functions", or "update the deliberation engine".
- If the founder asks you to do something technical (fix code, deploy, build features), say: "that's a development task — you'd need to handle that in Lovable or your IDE. I can help strategize what to build, but I can't write or deploy code."
- NEVER claim you deployed anything, migrated anything, or made technical changes. You didn't. You're a strategist and operator, not a developer.
- If you don't have an ACTION tag for something, SAY SO clearly.
- ZERO fake narration. No "Let me check..." unless using a real ACTION.
- NEVER say "Proceeding with deployment" or "Deploying now" — you literally cannot do this.

SELF-VERIFICATION:
- When asked "did you do X?" — check audit trail data in context FIRST.
- If logs show failure, be honest. Logs are truth.

BLOCKED ACTIONS: No subscription mods, no user deletion, no auth changes, no deleting messages/logs. No code changes, no deployments, no infrastructure modifications.
DATA INTEGRITY: Only cite users from "recently_active_users" in context.
${founderMods}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Telegram credentials not configured');
      return new Response('OK', { status: 200 });
    }

    const update = await req.json();
    const message = update?.message;

    if (!message?.chat?.id) {
      return new Response('OK', { status: 200 });
    }

    const senderChatId = String(message.chat.id);

    if (senderChatId !== TELEGRAM_CHAT_ID) {
      console.warn('Unauthorized chat_id:', message.chat.id);
      return new Response('OK', { status: 200 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Handle photo messages (Vision AI) ───
    if (message.photo && message.photo.length > 0) {
      const reply = await handlePhoto(message, supabase, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      if (reply) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, reply);
      }
      return new Response('OK', { status: 200 });
    }

    // ─── Handle document/file messages ───
    if (message.document) {
      const reply = await handleDocument(message, supabase, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      if (reply) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, reply);
      }
      return new Response('OK', { status: 200 });
    }

    // ─── Handle voice/audio messages ───
    if (message.voice || message.audio) {
      const reply = await handleVoice(message, supabase, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
      if (reply) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, reply);
      }
      return new Response('OK', { status: 200 });
    }

    // Text messages only from here
    if (!message.text) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, "Got your message but I can't process this type yet. Try sending text, photos, documents, or voice messages.");
      return new Response('OK', { status: 200 });
    }

    const userText = message.text.trim();
    console.log('[AYN-WEBHOOK] Message received:', userText.slice(0, 100));

    // All messages go through the AI — no slash command interception

    // Gather system context for AI
    const context = await gatherSystemContext(supabase);
    const conversationHistory = await getConversationHistory(supabase);
    console.log('[AYN-MEMORY] Loaded conversation history:', conversationHistory.length, 'entries');

    // Sanitize input
    let sanitizedInput = sanitizeUserPrompt(userText);

    // Capture reply-to context from Telegram swipe-replies
    if (message.reply_to_message?.text) {
      sanitizedInput = `[Replying to AYN's message: "${message.reply_to_message.text.slice(0, 500)}"]\n\n${sanitizedInput}`;
    }
    if (detectInjectionAttempt(userText)) {
      await supabase.from('security_logs').insert({
        action: 'prompt_injection_attempt',
        details: { input_preview: userText.slice(0, 200), function: 'ayn-telegram-webhook' },
        severity: 'high',
      });
    }

    // ─── Auto-execute confirmations ───
    const confirmPatterns = /^(yes|yep|yeah|yea|go ahead|do it|confirm|send it|confirmed|approve|approved|go for it|ship it|send|sure|ok send|yes send|confirm send)/i;
    if (confirmPatterns.test(userText.trim())) {
      // Check if there's a pending action in the most recent ayn_mind entry
      const { data: recentMind } = await supabase
        .from('ayn_mind')
        .select('context, content')
        .eq('type', 'telegram_ayn')
        .order('created_at', { ascending: false })
        .limit(1);

      const pending = recentMind?.[0]?.context?.pending_action;
      if (pending && typeof pending === 'object' && pending.type === 'awaiting_confirmation' && pending.lead_id) {
        // Execute the pending action directly
        try {
          const actionResult = await executeAction(
            pending.action || 'send_outreach',
            pending.lead_id,
            supabase, supabaseUrl, supabaseKey
          );
          const confirmMsg = actionResult
            ? `✅ ${pending.summary || 'Done'} — ${actionResult}`
            : `✅ ${pending.summary || 'Executed'} — action completed.`;
          
          await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, confirmMsg);
          
          // Log both sides
          console.log('[AYN-MEMORY] Saving auto-confirm exchange...');
          const { error: confirmInsertErr } = await supabase.from('ayn_mind').insert([
            { type: 'telegram_admin', content: userText.slice(0, 4000), context: { source: 'telegram' }, shared_with_admin: true },
            { type: 'telegram_ayn', content: confirmMsg.slice(0, 4000), context: { source: 'telegram', actions: [actionResult], pending_action: null }, shared_with_admin: true },
          ]);
          if (confirmInsertErr) {
            console.error('[AYN-MEMORY] Batch insert failed for confirm:', confirmInsertErr.message);
            await supabase.from('ayn_mind').insert({ type: 'telegram_admin', content: userText.slice(0, 4000), context: { source: 'telegram' }, shared_with_admin: true });
            await supabase.from('ayn_mind').insert({ type: 'telegram_ayn', content: confirmMsg.slice(0, 4000), context: { source: 'telegram', actions: [actionResult], pending_action: null }, shared_with_admin: true });
          } else {
            console.log('[AYN-MEMORY] Auto-confirm exchange saved successfully');
          }
          
          return new Response('OK', { status: 200 });
        } catch (e) {
          console.error('Auto-execute confirmation failed:', e);
          // Fall through to AI if execution fails
        }
      }
    }

    // Call AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, "⚠️ My AI brain isn't configured. Check LOVABLE_API_KEY.");
      return new Response('OK', { status: 200 });
    }

    // Build V2 system prompt with company context + Layer 3 founder psychology
    const [companyContext, founderModel] = await Promise.all([
      buildCompanyContextBlock(supabase),
      loadFounderModel(supabase),
    ]);
    const systemPrompt = buildAynSystemPrompt(companyContext, founderModel);

    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: systemPrompt + INJECTION_GUARD +
          `\n\nCURRENT SYSTEM STATUS (reference only, don't report unless asked):\n${JSON.stringify(context)}`,
      },
    ];

    for (const turn of conversationHistory) {
      messages.push(turn);
    }

    messages.push({ role: 'user', content: sanitizedInput });

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, "😵 My brain glitched. Try again in a sec.");
      return new Response('OK', { status: 200 });
    }

    const aiData = await aiResponse.json();
    let reply = aiData.choices?.[0]?.message?.content || "I'm drawing a blank. Try again?";

    // ─── LIVE DELIBERATION TRIGGER ───
    const deliberationTriggers = /\b(what does the team think|ask the team|deliberate|team debate|internal debate|consult the team|what do.*employees think|run it by the team)\b/i;
    if (deliberationTriggers.test(userText)) {
      // Extract topic from user message (remove the trigger phrase)
      const debateTopic = userText.replace(deliberationTriggers, '').trim() || 'General strategic question from founder';
      
      // Get all active employee IDs
      const { data: employees } = await supabase
        .from('employee_states')
        .select('employee_id')
        .limit(13);
      
      const employeeIds = employees?.map((e: any) => e.employee_id) || ['sales', 'advisor', 'security_guard', 'lawyer', 'innovation'];
      
      try {
        const deliberationResult = await deliberate(
          supabase,
          debateTopic,
          employeeIds,
          { actionType: 'founder_consultation', impactLevel: 'high' as ImpactLevel },
          LOVABLE_API_KEY!,
          { chatId: Deno.env.get('TELEGRAM_GROUP_CHAT_ID') || TELEGRAM_CHAT_ID, fallbackToken: TELEGRAM_BOT_TOKEN },
        );
        
        // The broadcast already sent messages — just save to memory
        await supabase.from('ayn_mind').insert([
          { type: 'telegram_admin', content: userText.slice(0, 4000), context: { source: 'telegram' }, shared_with_admin: true },
          { type: 'telegram_ayn', content: deliberationResult.summary.slice(0, 4000), context: { source: 'telegram', type: 'deliberation' }, shared_with_admin: true },
        ]).catch(() => {});
        
        return new Response('OK', { status: 200 });
      } catch (e) {
        console.error('[DELIBERATION] Failed:', e);
        // Fall through to normal AI response
      }
    }

    // ─── ACTION ENFORCEMENT LAYER ───
    // If AI said it would send/email but forgot the ACTION tag, force a 1-shot retry
    const replyLower = reply.toLowerCase();
    const mentionsSending = /\b(sending|sent|firing|emailing|i('ll| will) (send|email|fire))\b/.test(replyLower);
    const hasEmailAction = /\[ACTION:send_email:/.test(reply) || /\[ACTION:send_outreach:/.test(reply);
    const userWantsEmail = /\b(send|email|fire off|shoot)\b.*\b(email|message|outreach)\b/i.test(userText);

    if ((mentionsSending || userWantsEmail) && !hasEmailAction && !replyLower.includes('draft') && !replyLower.includes('want me to') && !replyLower.includes('should i')) {
      console.log('[ACTION-ENFORCE] Email intent detected but no ACTION tag found. Retrying...');
      const retryMessages = [
        ...messages,
        { role: 'assistant', content: reply },
        { role: 'user', content: 'You said you would send an email but you didn\'t include the ACTION tag. Include ONLY the [ACTION:send_email:to:subject:body] tag now. Extract the recipient, subject, and body from your previous message. Output ONLY the tag, nothing else.' }
      ];
      
      try {
        const retryRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: retryMessages }),
        });
        
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryReply = retryData.choices?.[0]?.message?.content || '';
          const retryActions = retryReply.match(/\[ACTION:[^\]]+\]/g);
          if (retryActions) {
            console.log('[ACTION-ENFORCE] Retry succeeded, extracted:', retryActions.length, 'action(s)');
            reply = reply + '\n' + retryActions.join('\n');
          } else {
            console.log('[ACTION-ENFORCE] Retry did not produce ACTION tags');
          }
        }
      } catch (e) {
        console.error('[ACTION-ENFORCE] Retry failed:', e);
      }
    }

    // Auto-detect missing prospect actions
    const userWantsProspect = /\b(find|go find|work on|prospect|search for|look for)\b.*\b(companies|leads|businesses|clients|outreach)\b/i.test(userText);
    const hasProspectAction = /\[ACTION:(autonomous_prospect|search_leads|prospect_company):/.test(reply);

    if (userWantsProspect && !hasProspectAction && !replyLower.includes('want me to') && !replyLower.includes('should i')) {
      console.log('[ACTION-ENFORCE] Prospect intent detected but no ACTION tag. Injecting...');
      const industryMatch = userText.match(/\b(?:in|for)\s+(\w+(?:\s+\w+)?)\b/i);
      const industry = industryMatch?.[1] || 'technology';
      reply += `\n[ACTION:autonomous_prospect:${industry}:global:5]`;
    }

    // Parse and execute actions
    const actionRegex = /\[ACTION:([^:\]]+)(?::([^\]]*))?\]/g;
    let actionMatch;
    const executedActions: string[] = [];
    const salesActionLeadIds: string[] = []; // Track lead_ids from sales actions

    while ((actionMatch = actionRegex.exec(reply)) !== null) {
      const [, actionType, actionParams] = actionMatch;
      // Track lead_ids from sales-related actions
      if (['draft_outreach', 'send_outreach', 'approve_lead', 'follow_up'].includes(actionType) && actionParams) {
        salesActionLeadIds.push(actionParams);
      }
      const result = await executeAction(actionType, actionParams || '', supabase, supabaseUrl, supabaseKey);
      if (result) executedActions.push(result);

      // Delay between email-sending actions to avoid SMTP rate limits (2/sec on Resend)
      if (['send_outreach', 'send_email', 'follow_up'].includes(actionType)) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    let cleanReply = reply.replace(/\[ACTION:[^\]]+\]/g, '').trim();
    if (executedActions.length > 0) {
      cleanReply += `\n\n✅ Done: ${executedActions.join(', ')}`;
    }

    // ─── EVENT-DRIVEN AGENT REACTIONS ───
    const relevantAgents = selectRelevantAgents(userText);
    if (relevantAgents.length > 0 && LOVABLE_API_KEY) {
      try {
        console.log(`[ORCHESTRATOR] Invoking ${relevantAgents.length} agents:`, relevantAgents.join(', '));
        const reactions = await invokeAgentsParallel(relevantAgents, userText, cleanReply, LOVABLE_API_KEY);
        if (reactions.length > 0) {
          cleanReply = formatAgentReactions(cleanReply, reactions);
          console.log(`[ORCHESTRATOR] ${reactions.length} agent reactions appended`);
        }
      } catch (e) {
        console.error('[ORCHESTRATOR] Agent reactions failed:', e);
        // Non-blocking — AYN's reply still sends
      }
    }

    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, cleanReply);

    // Log conversation + activity
    // Detect if AYN is asking for confirmation and extract actionable data
    const cleanReplyLower = cleanReply.toLowerCase();
    const isAskingConfirmation = cleanReplyLower.includes('should i go ahead') || 
      cleanReplyLower.includes('go ahead?') || 
      cleanReplyLower.includes('want me to') ||
      cleanReplyLower.includes('confirm?') ||
      cleanReplyLower.includes('shall i') ||
      cleanReplyLower.includes('want me to send') ||
      cleanReplyLower.includes('ready to send');

    let pendingAction: any = null;
    if (isAskingConfirmation) {
      // Use lead_ids captured directly from ACTION tags
      let detectedLeadId: string | null = salesActionLeadIds.length > 0 ? salesActionLeadIds[0] : null;
      let detectedAction = 'send_outreach';
      let detectedSummary = '';

      // Fallback: check executed action text and reply for UUIDs
      if (!detectedLeadId) {
        for (const action of executedActions) {
          const leadMatch = action.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          if (leadMatch) { detectedLeadId = leadMatch[1]; break; }
        }
      }
      if (!detectedLeadId) {
        const replyLeadMatch = reply.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (replyLeadMatch) detectedLeadId = replyLeadMatch[1];
      }

      // Extract company name for summary
      const companyMatch = cleanReply.match(/(?:to|for|email(?:ing)?)\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s*[\(\[\n,\-—]|\.?\s*(?:Here|The|I |about|regarding))/);
      detectedSummary = companyMatch ? `Send outreach to ${companyMatch[1].trim()}` : 'Send pending outreach email';

      // Detect action type from context
      if (cleanReplyLower.includes('follow-up') || cleanReplyLower.includes('follow up')) detectedAction = 'follow_up';
      if (cleanReplyLower.includes('draft')) detectedAction = 'send_outreach';

      pendingAction = {
        type: 'awaiting_confirmation',
        action: detectedAction,
        lead_id: detectedLeadId,
        summary: detectedSummary,
      };
    }

    console.log('[AYN-MEMORY] Saving conversation exchange...');
    console.log('[AYN-MEMORY] Admin msg length:', userText.length, '| AYN reply length:', cleanReply.length);
    const { error: mainInsertErr } = await supabase.from('ayn_mind').insert([
      { type: 'telegram_admin', content: userText.slice(0, 4000), context: { source: 'telegram' }, shared_with_admin: true },
      { type: 'telegram_ayn', content: cleanReply.slice(0, 4000), context: { source: 'telegram', actions: executedActions, pending_action: pendingAction }, shared_with_admin: true },
    ]);
    if (mainInsertErr) {
      console.error('[AYN-MEMORY] Batch insert FAILED:', mainInsertErr.message);
      // Fallback: try individual inserts
      const { error: e1 } = await supabase.from('ayn_mind').insert({ type: 'telegram_admin', content: userText.slice(0, 4000), context: { source: 'telegram' }, shared_with_admin: true });
      if (e1) console.error('[AYN-MEMORY] Individual admin insert failed:', e1.message);
      else console.log('[AYN-MEMORY] Individual admin insert OK');
      const { error: e2 } = await supabase.from('ayn_mind').insert({ type: 'telegram_ayn', content: cleanReply.slice(0, 4000), context: { source: 'telegram', actions: executedActions, pending_action: pendingAction }, shared_with_admin: true });
      if (e2) console.error('[AYN-MEMORY] Individual AYN insert failed:', e2.message);
      else console.log('[AYN-MEMORY] Individual AYN insert OK');
    } else {
      console.log('[AYN-MEMORY] Conversation saved successfully');
    }

    if (executedActions.length > 0) {
      await logAynActivity(supabase, 'ai_chat_actions', `Executed ${executedActions.length} action(s) during chat`, {
        details: { actions: executedActions, user_message: userText.slice(0, 200) },
        triggered_by: 'admin_chat',
      });
    }

    // Fire-and-forget: prune old messages if needed
    pruneAndSummarize(supabase).catch(e => console.error('[AYN-MEMORY] Prune error:', e));

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('ayn-telegram-webhook error:', error);
    return new Response('OK', { status: 200 });
  }
});

// ─── Handle photo messages (Vision AI) ───
async function handlePhoto(
  message: any, supabase: any, botToken: string, chatId: string
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return "⚠️ Vision not available — LOVABLE_API_KEY not configured.";

  try {
    // Get the highest resolution photo
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return "❌ Couldn't retrieve the image from Telegram.";

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // Download and convert to base64
    const imageRes = await fetch(fileUrl);
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    const caption = message.caption || 'What do you see in this image? Provide actionable insights.';

    // Send to Gemini vision
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: 'You are AYN, analyzing an image sent by the founder on Telegram. Be concise, insightful, and actionable. If it\'s a screenshot of the app or dashboard, comment on UX/data. If it\'s anything else, describe what you see and offer your take.',
        }, {
          role: 'user',
          content: [
            { type: 'text', text: caption },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return "🧠 Rate limited — try again in a minute.";
      if (aiRes.status === 402) return "🧠 AI credits exhausted.";
      return "❌ Vision analysis failed.";
    }

    const aiData = await aiRes.json();
    const analysis = aiData.choices?.[0]?.message?.content?.trim() || "Couldn't analyze the image.";

    // Log activity
    await logAynActivity(supabase, 'vision_analysis', `Analyzed image: "${caption.slice(0, 80)}"`, {
      target_type: 'image',
      details: { caption, analysis_preview: analysis.slice(0, 200) },
      triggered_by: 'telegram_photo',
    });

    console.log('[AYN-MEMORY] Saving photo exchange...');
    const { error: photoInsertErr } = await supabase.from('ayn_mind').insert([
      { type: 'telegram_admin', content: `[Photo] ${caption.slice(0, 4000)}`, context: { source: 'telegram', type: 'photo' }, shared_with_admin: true },
      { type: 'telegram_ayn', content: analysis.slice(0, 4000), context: { source: 'telegram', type: 'vision_response' }, shared_with_admin: true },
    ]);
    if (photoInsertErr) {
      console.error('[AYN-MEMORY] Photo batch insert failed:', photoInsertErr.message);
      await supabase.from('ayn_mind').insert({ type: 'telegram_admin', content: `[Photo] ${caption.slice(0, 4000)}`, context: { source: 'telegram', type: 'photo' }, shared_with_admin: true });
      await supabase.from('ayn_mind').insert({ type: 'telegram_ayn', content: analysis.slice(0, 4000), context: { source: 'telegram', type: 'vision_response' }, shared_with_admin: true });
    } else {
      console.log('[AYN-MEMORY] Photo exchange saved successfully');
    }

    return analysis;
  } catch (e) {
    console.error('Vision AI error:', e);
    return `❌ Vision failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── Handle document/file messages ───
const SUPPORTED_TEXT_EXTENSIONS = ['csv', 'txt', 'json', 'xml', 'md', 'html', 'yaml', 'yml', 'log'];
const SUPPORTED_BINARY_EXTENSIONS = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'pptx'];
const ALL_SUPPORTED = [...SUPPORTED_TEXT_EXTENSIONS, ...SUPPORTED_BINARY_EXTENSIONS];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function handleDocument(
  message: any, supabase: any, botToken: string, chatId: string
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return "⚠️ File analysis not available — LOVABLE_API_KEY not configured.";

  try {
    const doc = message.document;
    const fileName = doc.file_name || 'unknown';
    const fileSize = doc.file_size || 0;
    const caption = message.caption || '';

    if (fileSize > MAX_FILE_SIZE) {
      return `❌ File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Max is 10MB.`;
    }

    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (!ALL_SUPPORTED.includes(ext)) {
      return `❌ Can't read .${ext} files yet. Supported: ${ALL_SUPPORTED.join(', ')}`;
    }

    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${doc.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return "❌ Couldn't retrieve the file from Telegram.";

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    const systemPrompt = `You are AYN, analyzing a file sent by the founder on Telegram. The file is "${fileName}". ${caption ? `They said: "${caption}"` : 'Analyze the content and provide actionable insights.'} Be concise and useful.`;
    let aiMessages: any[];

    if (SUPPORTED_TEXT_EXTENSIONS.includes(ext)) {
      let textContent = await fileResponse.text();
      if (textContent.length > 50000) {
        textContent = textContent.slice(0, 50000) + '\n\n... [truncated at 50,000 chars]';
      }
      const aiPrompt = caption || `Analyze this ${ext.toUpperCase()} file and give me the key takeaways.`;
      aiMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${aiPrompt}\n\nFile content (${fileName}):\n\`\`\`\n${textContent}\n\`\`\`` },
      ];
    } else {
      const buffer = await fileResponse.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      const mimeType = mimeMap[ext] || 'application/octet-stream';
      const aiPrompt = caption || `Extract and analyze the content of this ${ext.toUpperCase()} file. Summarize key points.`;

      aiMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'text', text: aiPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ]},
      ];
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: aiMessages }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return "🧠 Rate limited — try again in a minute.";
      if (aiRes.status === 402) return "🧠 AI credits exhausted.";
      console.error('Document AI error:', aiRes.status, await aiRes.text());
      return "❌ File analysis failed.";
    }

    const aiData = await aiRes.json();
    const analysis = aiData.choices?.[0]?.message?.content?.trim() || "Couldn't analyze the file.";

    await logAynActivity(supabase, 'document_analysis', `Analyzed file: "${fileName}"`, {
      target_type: 'document',
      details: { fileName, fileSize, ext, caption, analysis_preview: analysis.slice(0, 200) },
      triggered_by: 'telegram_document',
    });

    await supabase.from('ayn_mind').insert([
      { type: 'telegram_admin', content: `[Document: ${fileName}] ${caption || '(no caption)'}`.slice(0, 4000), context: { source: 'telegram', type: 'document', fileName, ext, fileSize }, shared_with_admin: true },
      { type: 'telegram_ayn', content: analysis.slice(0, 4000), context: { source: 'telegram', type: 'document_response', fileName }, shared_with_admin: true },
    ]);

    return analysis;
  } catch (e) {
    console.error('Document handler error:', e);
    return `❌ File analysis failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── Handle voice/audio messages ───
async function handleVoice(
  message: any, supabase: any, botToken: string, chatId: string
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return "⚠️ Voice processing not available — LOVABLE_API_KEY not configured.";

  try {
    const voiceOrAudio = message.voice || message.audio;
    const fileId = voiceOrAudio.file_id;
    const duration = voiceOrAudio.duration || 0;
    const caption = message.caption || '';

    if (duration > 300) {
      return "❌ Voice message too long (max 5 minutes). Send a shorter one.";
    }

    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return "❌ Couldn't retrieve the audio from Telegram.";

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const audioRes = await fetch(fileUrl);
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);

    const mimeType = filePath.endsWith('.oga') || filePath.endsWith('.ogg')
      ? 'audio/ogg'
      : filePath.endsWith('.mp3') ? 'audio/mpeg'
      : filePath.endsWith('.m4a') ? 'audio/mp4'
      : 'audio/ogg';

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are AYN, receiving a voice message from the founder on Telegram. First transcribe what they said, then respond naturally. Format: start with "🎙️ [transcription]" then your response below.' },
          { role: 'user', content: [
            { type: 'text', text: caption || 'Transcribe this voice message and respond to it.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Audio}` } },
          ]},
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return "🧠 Rate limited — try again in a minute.";
      if (aiRes.status === 402) return "🧠 AI credits exhausted.";
      console.error('Voice AI error:', aiRes.status, await aiRes.text());
      return "❌ Voice processing failed.";
    }

    const aiData = await aiRes.json();
    const response = aiData.choices?.[0]?.message?.content?.trim() || "Couldn't process the voice message.";

    await logAynActivity(supabase, 'voice_analysis', `Processed voice message (${duration}s)`, {
      target_type: 'voice',
      details: { duration, response_preview: response.slice(0, 200) },
      triggered_by: 'telegram_voice',
    });

    await supabase.from('ayn_mind').insert([
      { type: 'telegram_admin', content: `[Voice message: ${duration}s] ${caption || ''}`.slice(0, 4000), context: { source: 'telegram', type: 'voice', duration }, shared_with_admin: true },
      { type: 'telegram_ayn', content: response.slice(0, 4000), context: { source: 'telegram', type: 'voice_response' }, shared_with_admin: true },
    ]);

    return response;
  } catch (e) {
    console.error('Voice handler error:', e);
    return `❌ Voice processing failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── Route commands ───
async function handleCommand(
  text: string, supabase: any, supabaseUrl: string, supabaseKey: string
): Promise<string | null> {
  const cmd = text.toLowerCase();

  // Block money-related commands
  if (cmd.includes('subscription') || cmd.includes('billing') || cmd.includes('payment') || cmd.includes('stripe') || cmd.includes('credit_gift')) {
    return "That's outside my access -- you'll need to check that directly in the admin panel.";
  }

  if (cmd === '/help') return cmdHelp();
  if (cmd === '/health') return cmdHealth(supabase);
  if (cmd === '/tickets') return cmdTickets(supabase);
  if (cmd === '/stats') return cmdStats(supabase);
  if (cmd === '/errors') return cmdErrors(supabase);
  if (cmd === '/logs') return cmdLogs(supabase);
  if (cmd === '/applications') return cmdApplications(supabase);
  if (cmd === '/contacts') return cmdContacts(supabase);
  if (cmd === '/users') return cmdUsers(supabase);
  if (cmd === '/think') return cmdThink(supabaseUrl, supabaseKey);
  if (cmd === '/messages') return cmdMessages(supabase);
  if (cmd === '/feedback') return cmdFeedback(supabase);
  if (cmd === '/emails') return cmdEmails(supabase);
  if (cmd === '/security') return cmdSecurity(supabase);
  if (cmd === '/visitors') return cmdVisitors(supabase);
  if (cmd === '/twitter') return cmdTwitter(supabase);
  if (cmd === '/webhooks') return cmdWebhooks(supabase);
  if (cmd === '/weekly_report') return cmdWeeklyReport(supabase);
  if (cmd.startsWith('/user ')) return cmdUser(text, supabase);
  if (cmd.startsWith('/grant ')) return cmdGrant(text, supabase);
  if (cmd.startsWith('/revoke ')) return cmdRevoke(text, supabase);
  if (cmd.startsWith('/set_unlimited ')) return cmdSetUnlimited(text, supabase);
  if (cmd.startsWith('/query ')) return cmdQuery(text, supabase);
  if (cmd.startsWith('/reply_app ')) return cmdReplyApp(text, supabase, supabaseUrl, supabaseKey);
  if (cmd.startsWith('/reply_contact ')) return cmdReplyContact(text, supabase, supabaseUrl, supabaseKey);
  if (cmd.startsWith('/email ')) return cmdEmail(text, supabase);
  if (cmd.startsWith('/delete_')) return cmdDelete(text, supabase);
  if (cmd.startsWith('/clear_errors')) return cmdClearErrors(text, supabase);
  if (cmd.startsWith('/unblock ')) return cmdUnblock(text, supabase);

  return null;
}

// ─── Conversation history (with long-term memory summaries) ───
async function getConversationHistory(supabase: any) {
  // 1. Load long-term memory summaries first
  const { data: summaries } = await supabase
    .from('ayn_mind')
    .select('content, created_at')
    .eq('type', 'telegram_summary')
    .order('created_at', { ascending: true });

  // 2. Load recent 150 messages
  const { data: exchanges } = await supabase
    .from('ayn_mind')
    .select('type, content, context, created_at')
    .in('type', ['telegram_admin', 'telegram_ayn'])
    .order('created_at', { ascending: true })
    .limit(150);

  const history: { role: string; content: string }[] = [];

  // Prepend summaries as long-term context
  if (summaries?.length) {
    const summaryText = summaries.map((s: any) => s.content).join('\n\n');
    history.push({
      role: 'system',
      content: `[LONG-TERM MEMORY — Summary of older conversations]\n${summaryText}`,
    });
  }

  if (exchanges?.length) {
    for (const entry of exchanges) {
      let content = entry.content;
      const pending = entry.context?.pending_action;
      if (pending && typeof pending === 'object' && pending.type === 'awaiting_confirmation') {
        content += `\n[PENDING: Waiting for confirmation to ${pending.summary || pending.action || 'execute action'}${pending.lead_id ? ` (lead_id: ${pending.lead_id})` : ''}]`;
      } else if (pending === 'awaiting_confirmation') {
        content += `\n[Pending action: awaiting_confirmation]`;
      }
      history.push({ role: entry.type === 'telegram_admin' ? 'user' : 'assistant', content });
    }
  }

  return history;
}

// ─── Prune old messages and summarize (fire-and-forget) ───
async function pruneAndSummarize(supabase: any) {
  try {
    const { count } = await supabase
      .from('ayn_mind')
      .select('*', { count: 'exact', head: true })
      .in('type', ['telegram_admin', 'telegram_ayn']);

    if (!count || count <= 200) return;

    console.log(`[AYN-MEMORY] ${count} telegram entries — pruning oldest 50...`);

    // Fetch oldest 50
    const { data: oldest } = await supabase
      .from('ayn_mind')
      .select('id, type, content, created_at')
      .in('type', ['telegram_admin', 'telegram_ayn'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (!oldest?.length) return;

    // Build conversation text for summarization
    const convoText = oldest.map((e: any) => {
      const role = e.type === 'telegram_admin' ? 'Admin' : 'AYN';
      return `[${e.created_at}] ${role}: ${e.content}`;
    }).join('\n');

    // Call AI to summarize
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return;

    const summaryResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'system', content: 'Summarize this conversation into concise bullet points. Capture key decisions, actions taken, important facts learned, and any pending items. Keep it under 2000 characters. Use bullet points. Include dates where relevant.' },
          { role: 'user', content: convoText },
        ],
        max_tokens: 1000,
      }),
    });

    if (!summaryResponse.ok) {
      console.error('[AYN-MEMORY] Summary API failed:', summaryResponse.status);
      return;
    }

    const summaryData = await summaryResponse.json();
    const summaryText = summaryData.choices?.[0]?.message?.content;
    if (!summaryText) return;

    const dateRange = `${oldest[0].created_at.slice(0, 10)} to ${oldest[oldest.length - 1].created_at.slice(0, 10)}`;

    // Insert summary
    await supabase.from('ayn_mind').insert({
      type: 'telegram_summary',
      content: `[Summary: ${dateRange}]\n${summaryText}`.slice(0, 4000),
      context: { source: 'auto_prune', entries_summarized: oldest.length, date_range: dateRange },
      shared_with_admin: true,
    });

    // Delete the originals
    const idsToDelete = oldest.map((e: any) => e.id);
    await supabase.from('ayn_mind').delete().in('id', idsToDelete);

    console.log(`[AYN-MEMORY] Pruned ${oldest.length} entries, saved summary for ${dateRange}`);
  } catch (e) {
    console.error('[AYN-MEMORY] Prune failed (non-critical):', e);
  }
}

// ─── V2: Build company context block for system prompt ───
async function buildCompanyContextBlock(supabase: any): Promise<string> {
  try {
    const [companyState, objectives, economics] = await Promise.all([
      loadCompanyState(supabase),
      loadActiveObjectives(supabase),
      loadServiceEconomics(supabase),
    ]);

    const parts: string[] = [];

    if (companyState) {
      parts.push(`COMPANY STATE (live):
- Momentum: ${companyState.momentum}
- Stress level: ${companyState.stress_level}
- Growth velocity: ${companyState.growth_velocity}
- Risk exposure: ${companyState.risk_exposure}
- Morale: ${companyState.morale}`);
    }

    if (objectives.length > 0) {
      parts.push(`ACTIVE OBJECTIVES (align your actions to these):
${objectives.slice(0, 3).map(o => `- [P${o.priority}] ${o.title} — progress: ${o.current_value}/${o.target_value}${o.deadline ? ` (deadline: ${o.deadline})` : ''}`).join('\n')}`);
    }

    if (economics.length > 0) {
      const saas = economics.filter(e => e.category === 'saas');
      const services = economics.filter(e => e.category === 'service');
      parts.push(`SERVICE ECONOMICS (reference when making business decisions):
SaaS (scalable): ${saas.map(e => `${e.service_name} (margin: ${Math.round(e.average_margin * 100)}%, scale: ${e.scalability_score}/10)`).join(', ')}
Services (cash flow): ${services.map(e => `${e.service_name} (margin: ${Math.round(e.average_margin * 100)}%, complexity: ${e.operational_complexity}/10)`).join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  } catch (e) {
    console.error('[V2] Failed to load company context:', e);
    return '';
  }
}

// ─── Expanded system context ───
async function gatherSystemContext(supabase: any) {
  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [
    { count: errors },
    { count: llmFails },
    { count: openTickets },
    { count: pendingTickets },
    { count: activeUsers },
    { count: totalUsers },
    { data: blocked },
    { count: pendingApps },
    { count: newContacts },
    { data: recentErrors },
    { data: recentMessages },
    { count: activeSessions },
    { data: recentRatings },
    { data: recentBetaFeedback },
    { data: recentEmails },
    { data: recentSecurityLogs },
    { data: recentEngineering },
    { data: recentActions },
    { data: recentEmailDeliveries },
  ] = await Promise.all([
    supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', now24h),
    supabase.from('llm_failures').select('*', { count: 'exact', head: true }).gte('created_at', now24h),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('access_grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('access_grants').select('*', { count: 'exact', head: true }),
    supabase.from('api_rate_limits').select('user_id').gt('blocked_until', new Date().toISOString()),
    supabase.from('service_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('contact_messages').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('error_logs').select('error_message, created_at').order('created_at', { ascending: false }).limit(3),
    supabase.from('messages').select('content, sender, mode_used, created_at, user_id').order('created_at', { ascending: false }).limit(5),
    supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
    supabase.from('message_ratings').select('rating, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('beta_feedback').select('overall_rating, improvement_suggestions, submitted_at').order('submitted_at', { ascending: false }).limit(3),
    supabase.from('email_logs').select('email_type, recipient_email, status, sent_at').order('sent_at', { ascending: false }).limit(5),
    supabase.from('security_logs').select('action, severity, created_at').order('created_at', { ascending: false }).limit(3),
    supabase.from('engineering_activity').select('activity_type, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('ayn_activity_log').select('action_type, summary, created_at, details').order('created_at', { ascending: false }).limit(10),
    supabase.from('email_logs').select('email_type, recipient_email, status, error_message, sent_at').order('sent_at', { ascending: false }).limit(10),
  ]);

  // Fetch recently active users with real names
  const { data: recentlyActiveUsers } = await supabase
    .from('profiles')
    .select('contact_person, last_login, user_id')
    .gte('last_login', now24h)
    .order('last_login', { ascending: false })
    .limit(10);

  // Match recent messages to user names
  const userIds = [...new Set(recentMessages?.map((m: any) => m.user_id).filter(Boolean) || [])];
  const userNameMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, contact_person')
      .in('user_id', userIds);
    if (profiles) {
      for (const p of profiles) {
        if (p.contact_person) userNameMap[p.user_id] = p.contact_person;
      }
    }
  }

  const positiveRatings = recentRatings?.filter((r: any) => r.rating === 'positive').length || 0;
  const totalRatings = recentRatings?.length || 0;

  return {
    errors_24h: errors || 0,
    llm_failures_24h: llmFails || 0,
    open_tickets: openTickets || 0,
    pending_tickets: pendingTickets || 0,
    active_users: activeUsers || 0,
    total_users: totalUsers || 0,
    blocked_users: blocked?.length || 0,
    pending_applications: pendingApps || 0,
    new_contact_messages: newContacts || 0,
    recent_errors: recentErrors?.map((e: any) => e.error_message?.slice(0, 80)) || [],
    recent_messages: recentMessages?.map((m: any) => ({
      preview: m.content?.slice(0, 60),
      sender: m.sender,
      mode: m.mode_used,
      user_name: userNameMap[m.user_id] || null,
    })) || [],
    recently_active_users: recentlyActiveUsers?.map((u: any) => ({
      name: u.contact_person,
      last_login: u.last_login,
    })) || [],
    active_sessions: activeSessions || 0,
    feedback_ratio: totalRatings > 0 ? `${positiveRatings}/${totalRatings} positive` : 'no recent feedback',
    recent_beta_feedback: recentBetaFeedback?.map((f: any) => ({
      rating: f.overall_rating,
      suggestion: f.improvement_suggestions?.slice(0, 80),
    })) || [],
    recent_emails: recentEmails?.map((e: any) => ({
      type: e.email_type,
      status: e.status,
    })) || [],
    recent_security: recentSecurityLogs?.map((s: any) => ({
      action: s.action,
      severity: s.severity,
    })) || [],
    recent_engineering: recentEngineering?.length || 0,
    recent_actions: recentActions?.map((a: any) => ({
      action: a.action_type,
      summary: a.summary,
      when: a.created_at,
    })) || [],
    recent_email_deliveries: recentEmailDeliveries?.map((e: any) => ({
      type: e.email_type,
      to: e.recipient_email,
      status: e.status,
      error: e.error_message,
      when: e.sent_at,
    })) || [],
  };
}

// ─── Execute AI actions ───
async function executeAction(
  type: string, params: string, supabase: any, supabaseUrl: string, supabaseKey: string
): Promise<string | null> {
  try {
    // Block money-related actions
    if (['subscription', 'billing', 'payment', 'stripe', 'credit'].some(w => type.toLowerCase().includes(w))) {
      return "Blocked: I don't touch money stuff";
    }

    switch (type) {
      case 'unblock_user': {
        await supabase.from('api_rate_limits').update({ blocked_until: null }).eq('user_id', params);
        await logAynActivity(supabase, 'user_unblocked', `Unblocked user ${params.slice(0, 8)}`, {
          target_id: params, target_type: 'user', triggered_by: 'admin_chat',
        });
        return `Unblocked user ${params.slice(0, 8)}`;
      }
      case 'auto_reply_ticket': {
        await fetch(`${supabaseUrl}/functions/v1/ayn-auto-reply`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id: params, skip_telegram: true }),
        });
        return `Auto-replied to ticket ${params.slice(0, 8)}`;
      }
      case 'scan_health': {
        await fetch(`${supabaseUrl}/functions/v1/ayn-proactive-loop`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        return 'Triggered health scan';
      }
      case 'reply_application': {
        const colonIdx = params.indexOf(':');
        if (colonIdx === -1) return null;
        const appId = params.slice(0, colonIdx);
        const msg = params.slice(colonIdx + 1);
        return await cmdReplyApp(`/reply_app ${appId} ${msg}`, supabase, supabaseUrl, supabaseKey);
      }
      case 'reply_contact': {
        const colonIdx = params.indexOf(':');
        if (colonIdx === -1) return null;
        const contactId = params.slice(0, colonIdx);
        const msg = params.slice(colonIdx + 1);
        return await cmdReplyContact(`/reply_contact ${contactId} ${msg}`, supabase, supabaseUrl, supabaseKey);
      }
      case 'send_email': {
        const firstColon = params.indexOf(':');
        if (firstColon === -1) return null;
        const to = params.slice(0, firstColon);
        const rest = params.slice(firstColon + 1);
        const secondColon = rest.indexOf(':');
        if (secondColon === -1) return null;
        const subject = rest.slice(0, secondColon);
        const body = rest.slice(secondColon + 1);
        return await cmdEmail(`/email ${to} ${subject} | ${body}`, supabase);
      }
      case 'delete_ticket': {
        return await cmdDelete(`/delete_ticket ${params}`, supabase);
      }
      case 'clear_errors': {
        return await cmdClearErrors(`/clear_errors ${params}`, supabase);
      }
      case 'grant_access': {
        return await cmdGrant(`/grant ${params}`, supabase);
      }
      case 'revoke_access': {
        return await cmdRevoke(`/revoke ${params}`, supabase);
      }
      case 'set_unlimited': {
        return await cmdSetUnlimited(`/set_unlimited ${params}`, supabase);
      }
      // READ-ONLY actions
      case 'find_user': {
        return await cmdFindUser(params, supabase);
      }
      case 'check_user_status': {
        return await cmdCheckUserStatus(params, supabase);
      }
      case 'read_messages': {
        return await cmdMessages(supabase);
      }
      case 'read_feedback': {
        return await cmdFeedback(supabase);
      }
      case 'check_security': {
        return await cmdSecurity(supabase);
      }
      case 'delete_app': {
        return await cmdDelete(`/delete_app ${params}`, supabase);
      }
      case 'delete_contact': {
        return await cmdDelete(`/delete_contact ${params}`, supabase);
      }
      case 'delete_message': {
        return `🔒 User messages are protected and cannot be deleted. You can read them with [ACTION:read_messages:10] to monitor and improve AYN.`;
      }
      case 'approve_app': {
        const { data } = await supabase.from('service_applications')
          .select('id, full_name').ilike('id', `${params}%`).limit(1);
        if (!data?.length) return `No application found`;
        await supabase.from('service_applications')
          .update({ status: 'approved' }).eq('id', data[0].id);
        await logAynActivity(supabase, 'application_approved',
          `Approved application from ${data[0].full_name}`, {
          target_id: data[0].id, target_type: 'application',
          triggered_by: 'admin_chat',
        });
        return `Approved application from ${data[0].full_name}`;
      }
      case 'reject_app': {
        const { data } = await supabase.from('service_applications')
          .select('id, full_name').ilike('id', `${params}%`).limit(1);
        if (!data?.length) return `No application found`;
        await supabase.from('service_applications')
          .update({ status: 'rejected' }).eq('id', data[0].id);
        await logAynActivity(supabase, 'application_rejected',
          `Rejected application from ${data[0].full_name}`, {
          target_id: data[0].id, target_type: 'application',
          triggered_by: 'admin_chat',
        });
        return `Rejected application from ${data[0].full_name}`;
      }
      // ─── Bulk delete actions ───
      case 'delete_all_apps': {
        const { count } = await supabase.from('service_applications')
          .select('*', { count: 'exact', head: true });
        // Delete related replies first, then applications
        await supabase.from('application_replies').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('service_applications').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        if (error) return `Failed to delete applications: ${error.message}`;
        await logAynActivity(supabase, 'bulk_delete', `Deleted all ${count || 0} applications`, {
          target_type: 'service_applications', triggered_by: 'admin_chat',
        });
        return `Deleted ${count || 0} applications`;
      }
      case 'delete_all_tickets': {
        const { count } = await supabase.from('support_tickets')
          .select('*', { count: 'exact', head: true });
        await supabase.from('support_ticket_replies').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('ticket_messages').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('support_tickets').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        if (error) return `Failed to delete tickets: ${error.message}`;
        await logAynActivity(supabase, 'bulk_delete', `Deleted all ${count || 0} tickets`, {
          target_type: 'support_tickets', triggered_by: 'admin_chat',
        });
        return `Deleted ${count || 0} tickets`;
      }
      case 'delete_all_contacts': {
        const { count } = await supabase.from('contact_messages')
          .select('*', { count: 'exact', head: true });
        const { error } = await supabase.from('contact_messages').delete().gte('id', '00000000-0000-0000-0000-000000000000');
        if (error) return `Failed to delete contacts: ${error.message}`;
        await logAynActivity(supabase, 'bulk_delete', `Deleted all ${count || 0} contact messages`, {
          target_type: 'contact_messages', triggered_by: 'admin_chat',
        });
        return `Deleted ${count || 0} contact messages`;
      }
      case 'delete_all_messages': {
        return `🔒 User messages are protected and cannot be deleted. You can read them with [ACTION:read_messages:50] to monitor and improve AYN.`;
      }
      // ─── Data-fetching actions ───
      case 'list_apps': {
        return await cmdApplications(supabase);
      }
      case 'list_tickets': {
        return await cmdTickets(supabase);
      }
      case 'list_contacts': {
        return await cmdContacts(supabase);
      }
      case 'check_health': {
        return await cmdHealth(supabase);
      }
      case 'get_stats': {
        return await cmdStats(supabase);
      }
      case 'get_errors': {
        return await cmdErrors(supabase);
      }
      // ─── Sales actions ───
      case 'prospect_company': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'prospect', url: params }),
          });
          const data = await res.json();
          if (data.success) {
            const a = data.analysis;
            return `Prospected ${a?.company_name || params}:\n• Industry: ${a?.industry || '?'}\n• Quality: ${a?.website_quality || '?'}/10\n• Pain points: ${a?.pain_points?.join(', ') || 'none'}\n• Recommended: ${a?.recommended_services?.join(', ') || 'general'}\n• Lead ID: ${data.lead_id?.slice(0, 8)}`;
          }
          return data.message || data.error || 'Prospect failed';
        } catch (e) { return `Prospect failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'draft_outreach': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'draft_email', lead_id: params }),
          });
          const data = await res.json();
          if (data.success && data.draft) {
            return `📧 Draft for review:\nSubject: ${data.draft.subject}\n\n${data.draft.plain_text || data.draft.html_body?.replace(/<[^>]*>/g, '') || 'No content'}\n\nApprove? [ACTION:approve_lead:${params}] then [ACTION:send_outreach:${params}]`;
          }
          return data.error || 'Draft failed';
        } catch (e) { return `Draft failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'send_outreach': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'send_email', lead_id: params }),
          });
          const data = await res.json();
          return data.success ? `Email sent to lead ${params.slice(0, 8)}` : (data.error || 'Send failed');
        } catch (e) { return `Send failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'approve_lead': {
        await supabase.from('ayn_sales_pipeline').update({ admin_approved: true }).eq('id', params);
        await logAynActivity(supabase, 'sales_lead_approved', `Approved lead ${params.slice(0, 8)} for outreach`, {
          target_id: params, target_type: 'sales_lead', triggered_by: 'admin_chat',
        });
        return `Lead ${params.slice(0, 8)} approved for outreach`;
      }
      case 'follow_up': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'follow_up', lead_id: params }),
          });
          const data = await res.json();
          if (data.needs_approval) {
            return `📧 Follow-up draft:\nSubject: ${data.draft?.subject}\n\n${data.draft?.plain_text || 'See draft'}\n\nApprove to send?`;
          }
          return data.success ? `Follow-up sent to lead ${params.slice(0, 8)}` : (data.error || 'Follow-up failed');
        } catch (e) { return `Follow-up failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'pipeline_status': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'pipeline_status' }),
          });
          const data = await res.json();
          if (!data.leads?.length) return '📊 Sales pipeline is empty. No leads yet.';
          let msg = `📊 Pipeline: ${data.total} leads\n`;
          for (const [status, count] of Object.entries(data.stats || {})) {
            msg += `• ${status}: ${count}\n`;
          }
          if (data.due_follow_ups > 0) msg += `\n⏰ ${data.due_follow_ups} follow-up(s) due`;
          msg += '\n\nRecent:\n';
          msg += data.leads.slice(0, 5).map((l: any) =>
            `• ${l.company} [${l.status}] ${l.emails_sent}📧 ${l.approved ? '✅' : '⏳'} ID:${l.id.slice(0, 8)}`
          ).join('\n');
          return msg;
        } catch (e) { return `Pipeline check failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'search_leads': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'search_leads', search_query: params }),
          });
          const data = await res.json();
          if (data.success) {
            return `🔍 Found ${data.prospected?.length || 0} leads for "${params}":\n${data.prospected?.map((p: any) => `• ${p.analysis?.company_name || p.url} (ID: ${p.lead_id?.slice(0, 8)})`).join('\n') || 'None'}`;
          }
          return data.error || 'Search failed';
        } catch (e) { return `Search failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      // ─── Marketing oversight actions ───
      case 'marketing_report': {
        const { data: drafts } = await supabase
          .from('twitter_posts')
          .select('id, content, status, quality_score, image_url, created_at, created_by_name')
          .eq('created_by_name', 'marketing_bot')
          .order('created_at', { ascending: false })
          .limit(10);
        if (!drafts?.length) return '📝 No marketing bot drafts yet.';
        let msg = `📝 Marketing Bot Drafts (${drafts.length}):\n`;
        for (const d of drafts) {
          const ago = Math.round((Date.now() - new Date(d.created_at).getTime()) / 3600000);
          msg += `\n${d.status === 'pending_review' ? '⏳' : d.status === 'approved' ? '✅' : '❌'} "${d.content?.slice(0, 60)}..."`;
          msg += `\n   [${d.status}] ${d.quality_score ? `Q:${d.quality_score}` : ''} ${d.image_url ? '🖼️' : ''} (${ago}h ago)`;
          msg += `\n   ID: ${d.id.slice(0, 8)}`;
        }
        return msg;
      }
      case 'approve_post': {
        const { data } = await supabase.from('twitter_posts')
          .select('id, content').ilike('id', `${params}%`).eq('status', 'pending_review').limit(1);
        if (!data?.length) return 'No pending post found with that ID.';
        await supabase.from('twitter_posts').update({ status: 'approved' }).eq('id', data[0].id);
        await logAynActivity(supabase, 'marketing_post_approved', `Approved post: "${data[0].content?.slice(0, 60)}"`, {
          target_id: data[0].id, target_type: 'twitter_post', triggered_by: 'admin_chat',
        });
        // Notify marketing bot
        const MKT_TOKEN = Deno.env.get('TELEGRAM_MARKETING_BOT_TOKEN');
        const MKT_CHAT = Deno.env.get('TELEGRAM_MARKETING_CHAT_ID');
        if (MKT_TOKEN && MKT_CHAT) {
          await sendTelegramMessage(MKT_TOKEN, MKT_CHAT, `✅ your post was approved! "${data[0].content?.slice(0, 100)}..."`);
        }
        return `Approved post ${data[0].id.slice(0, 8)}: "${data[0].content?.slice(0, 60)}..."`;
      }
      case 'reject_post': {
        const colonIdx = params.indexOf(':');
        const postId = colonIdx > -1 ? params.slice(0, colonIdx) : params;
        const reason = colonIdx > -1 ? params.slice(colonIdx + 1) : 'not approved';
        const { data } = await supabase.from('twitter_posts')
          .select('id, content').ilike('id', `${postId}%`).eq('status', 'pending_review').limit(1);
        if (!data?.length) return 'No pending post found with that ID.';
        await supabase.from('twitter_posts').update({ status: 'rejected' }).eq('id', data[0].id);
        await logAynActivity(supabase, 'marketing_post_rejected', `Rejected post: "${data[0].content?.slice(0, 60)}" — ${reason}`, {
          target_id: data[0].id, target_type: 'twitter_post', triggered_by: 'admin_chat',
        });
        // Notify marketing bot
        const MKT_TOKEN2 = Deno.env.get('TELEGRAM_MARKETING_BOT_TOKEN');
        const MKT_CHAT2 = Deno.env.get('TELEGRAM_MARKETING_CHAT_ID');
        if (MKT_TOKEN2 && MKT_CHAT2) {
          await sendTelegramMessage(MKT_TOKEN2, MKT_CHAT2, `❌ post rejected: "${data[0].content?.slice(0, 80)}..."\nreason: ${reason}`);
        }
        return `Rejected post ${data[0].id.slice(0, 8)}: ${reason}`;
      }
      // ─── Competitor management actions ───
      case 'add_competitor': {
        const handle = params.replace('@', '').trim();
        if (!handle) return 'need a twitter handle to add';
        const { data: existing } = await supabase.from('marketing_competitors')
          .select('id').eq('handle', handle).limit(1);
        if (existing?.length) return `@${handle} is already being tracked`;
        await supabase.from('marketing_competitors').insert({ handle, name: handle, is_active: true });
        await logAynActivity(supabase, 'competitor_added', `Added @${handle} to competitor tracking`, {
          target_type: 'competitor', triggered_by: 'admin_chat',
        });
        return `Added @${handle} to competitor tracking`;
      }
      case 'remove_competitor': {
        const handle = params.replace('@', '').trim();
        const { data: comp } = await supabase.from('marketing_competitors')
          .select('id').eq('handle', handle).limit(1);
        if (!comp?.length) return `@${handle} isn't being tracked`;
        await supabase.from('marketing_competitors').update({ is_active: false }).eq('id', comp[0].id);
        return `Stopped tracking @${handle}`;
      }
      case 'competitor_report': {
        const { data: comps } = await supabase.from('marketing_competitors')
          .select('handle, name, last_scraped_at, is_active').eq('is_active', true);
        if (!comps?.length) return '👀 No competitors tracked yet. Use [ACTION:add_competitor:handle] to start.';
        let msg = `👀 Tracked Competitors (${comps.length}):\n`;
        for (const c of comps) {
          const { data: topTweets } = await supabase.from('competitor_tweets')
            .select('content, likes, retweets')
            .eq('competitor_id', c.handle)
            .order('likes', { ascending: false })
            .limit(3);
          const ago = c.last_scraped_at ? `${Math.round((Date.now() - new Date(c.last_scraped_at).getTime()) / 3600000)}h ago` : 'never';
          msg += `\n@${c.handle} (scraped: ${ago})`;
          if (topTweets?.length) {
            for (const t of topTweets) {
              msg += `\n  • "${t.content?.slice(0, 50)}..." (${t.likes}❤️)`;
            }
          }
        }
        return msg;
      }
      // ─── Autonomous prospecting ───
      case 'autonomous_prospect': {
        try {
          // Parse params: "industry:region:count"
          const parts = params.split(':');
          const industry = parts[0] || 'technology';
          const region = parts[1] || 'global';
          const count = Math.min(parseInt(parts[2]) || 5, 10);

          // Step 1: Search for leads
          const searchRes = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'search_leads', search_query: `${industry} ${region}` }),
          });
          const searchData = await searchRes.json();
          const leads = searchData.prospected?.slice(0, count) || searchData.leads?.slice(0, count) || [];

          if (!leads.length) return `No leads found for "${industry} ${region}". Try different keywords.`;

          // Step 2: Prospect each lead
          const results: Array<{ company: string; quality: number; lead_id: string }> = [];
          for (const lead of leads) {
            const url = lead.url || lead.website || lead.analysis?.company_url;
            if (!url) continue;

            try {
              const prospectRes = await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'prospect', url }),
              });
              const prospectData = await prospectRes.json();
              if (prospectData.success) {
                results.push({
                  company: prospectData.analysis?.company_name || url,
                  quality: prospectData.analysis?.website_quality || 0,
                  lead_id: prospectData.lead_id || '',
                });
                // Auto-send for high-quality leads (6+/10), draft-only for lower
                if (prospectData.analysis?.website_quality >= 6 && prospectData.lead_id) {
                  // Draft first
                  await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'draft_email', lead_id: prospectData.lead_id }),
                  });
                  // Auto-send immediately for high-quality leads
                  try {
                    await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mode: 'send_email', lead_id: prospectData.lead_id }),
                    });
                    (results[results.length - 1] as any).auto_sent = true;
                  } catch (sendErr) {
                    console.error(`Auto-send failed for ${url}:`, sendErr);
                  }
                } else if (prospectData.lead_id) {
                  // Draft only for lower quality — needs approval
                  await fetch(`${supabaseUrl}/functions/v1/ayn-sales-outreach`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'draft_email', lead_id: prospectData.lead_id }),
                  });
                }
                await new Promise(r => setTimeout(r, 2000)); // Rate limit
              }
            } catch (e) {
              console.error(`Prospect failed for ${url}:`, e);
            }
          }

          if (!results.length) return `Searched for "${industry} ${region}" but couldn't prospect any leads. Try different keywords.`;

          await logAynActivity(supabase, 'autonomous_prospect', `Batch prospected ${results.length} companies for ${industry} ${region}`, {
            details: { industry, region, count: results.length, results },
            triggered_by: 'admin_chat',
          });

          const highQuality = results.filter(r => r.quality >= 6);
          const autoSent = results.filter(r => (r as any).auto_sent);
          const draftOnly = results.filter(r => r.quality < 6 && r.lead_id);
          return `🔍 Prospected ${results.length} companies (${industry} / ${region}):\n${results.map(r =>
            `• ${r.company} — quality: ${r.quality}/10${(r as any).auto_sent ? ' 📧 sent' : r.quality >= 6 ? ' ✅ sent' : r.lead_id ? ' 📝 draft pending' : ''} (ID: ${r.lead_id?.slice(0, 8)})`
          ).join('\n')}${autoSent.length > 0 ? `\n\n📧 Auto-sent ${autoSent.length} email(s) to high-quality leads.` : ''}${draftOnly.length > 0 ? `\n📝 ${draftOnly.length} draft(s) pending your approval.` : ''}`;
        } catch (e) {
          return `Autonomous prospecting failed: ${e instanceof Error ? e.message : 'error'}`;
        }
      }
      // ─── AI Employee actions ───
      case 'security_report': {
        const { data: reports } = await supabase.from('ayn_mind').select('content, created_at')
          .eq('type', 'employee_report').like('content', '%Security Guard%')
          .order('created_at', { ascending: false }).limit(3);
        if (!reports?.length) return '🛡️ No recent Security Guard reports.';
        return reports.map((r: any) => r.content).join('\n\n---\n\n');
      }
      case 'investigate': {
        try {
          await supabase.from('employee_tasks').insert({
            from_employee: 'co_founder', to_employee: 'investigator',
            task_type: 'investigate_lead', input_data: { lead_id: params },
          });
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-investigator`, {
            method: 'POST', headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: params }),
          });
          const data = await res.json();
          if (data.success && data.dossier) {
            return `🔍 Investigation of lead ${params.slice(0, 8)}:\nQuality: ${data.dossier.quality_score}/10\nSize: ${data.dossier.company_size}\nStrategy: ${data.dossier.approach_strategy?.slice(0, 300)}`;
          }
          return data.error || 'Investigation failed';
        } catch (e) { return `Investigation failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'employee_status': {
        const { data: reports } = await supabase.from('ayn_mind').select('content, context, created_at')
          .eq('type', 'employee_report').order('created_at', { ascending: false }).limit(10);
        if (!reports?.length) return '📋 No recent employee reports.';
        const byEmployee: Record<string, string> = {};
        for (const r of reports) {
          const emp = r.context?.from_employee || 'unknown';
          if (!byEmployee[emp]) byEmployee[emp] = r.content?.slice(0, 200) || '';
        }
        return '📋 Employee Status:\n' + Object.entries(byEmployee).map(([e, c]) => `\n👤 ${e}:\n${c}`).join('\n');
      }
      case 'legal_review': {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/ayn-lawyer`, {
            method: 'POST', headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'legal_review', topic: params }),
          });
          const data = await res.json();
          return data.analysis ? `⚖️ Legal Review: ${params}\n\n${data.analysis}` : (data.error || 'Review failed');
        } catch (e) { return `Legal review failed: ${e instanceof Error ? e.message : 'error'}`; }
      }
      case 'system_health': {
        const { data: checks } = await supabase.from('system_health_checks')
          .select('*').order('checked_at', { ascending: false }).limit(10);
        if (!checks?.length) return '🔍 No health check data yet.';
        return '🔍 System Health:\n' + checks.map((h: any) =>
          `${h.is_healthy ? '✅' : '❌'} ${h.function_name}: ${h.response_time_ms}ms`
        ).join('\n');
      }
      case 'advisor_report': {
        const { data: insights } = await supabase.from('ayn_mind').select('content, created_at')
          .eq('type', 'strategic_insight').order('created_at', { ascending: false }).limit(1);
        return insights?.[0]?.content || '📊 No advisor insights yet.';
      }
      case 'follow_up_status': {
        const { data: leads } = await supabase.from('ayn_sales_pipeline')
          .select('company_name, status, emails_sent, next_follow_up_at, last_email_at')
          .in('status', ['contacted', 'followed_up', 'replied', 'cold'])
          .order('last_email_at', { ascending: false }).limit(15);
        if (!leads?.length) return '📧 No leads in follow-up pipeline.';
        return '📧 Follow-Up Status:\n' + leads.map((l: any) => {
          const icon = l.status === 'replied' ? '💬' : l.status === 'cold' ? '🧊' : '📧';
          return `${icon} ${l.company_name} [${l.status}] — ${l.emails_sent} email(s)`;
        }).join('\n');
      }
      default:
        return `Unknown action: ${type}`;
    }
  } catch (e) {
    console.error(`Action ${type} failed:`, e);
    return `Action ${type} failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}
