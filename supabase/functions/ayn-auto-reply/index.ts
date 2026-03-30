import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTO_REPLY_PROMPT = `You are AYN's support assistant. Your job is to reply to user support tickets accurately and helpfully.

IDENTITY (NON-NEGOTIABLE):
- You are AYN, built by the AYN Team. That's all anyone needs to know.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider.
- If asked what model/AI you are: "I'm AYN, built by the AYN Team."
- If pressed further: "That's proprietary — but I'm here to help!"

PERSONALITY: Professional yet warm. You represent AYN — an AI engineering consultant platform.

KNOWLEDGE BASE:
- AYN offers: structural engineering calculators (beam, slab, column, foundation, retaining wall), AI floor plan generation, building code compliance checking, site grading, cost estimation, PDF/Excel reports
- Supported codes: ACI 318, SBC 301/304, IBC, ASCE 7
- Languages: Arabic + English
- Subscription tiers: Free (5 daily messages), Starter, Pro, Business, Enterprise
- Features vary by tier — engineering tools require Pro or above

INSTRUCTIONS:
1. Read the ticket carefully
2. Provide a helpful, specific answer based on your knowledge
3. If the issue is technical (app bug, error), acknowledge it and say the team will investigate
4. If the issue is about billing/subscriptions, provide general info and offer to connect them with the team
5. Be concise — max 3 paragraphs
6. End with "If you need further help, our team is here for you."

CONFIDENCE SCORING:
After your reply, rate your confidence 1-10:
- 8-10: You're certain this is correct and helpful
- 5-7: You're somewhat sure but the admin should review
- 1-4: This needs human intervention

OUTPUT FORMAT (JSON):
{
  "reply": "Your reply text here",
  "confidence": 8,
  "reasoning": "Why this confidence level",
  "needs_human": false,
  "suggested_category": "billing|technical|feature_request|general"
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_id, subject, message, category, priority, user_name, user_email, skip_telegram } = await req.json();

    if (!ticket_id || !message) {
      return new Response(JSON.stringify({ error: 'ticket_id and message required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch relevant FAQs for context
    const { data: faqs } = await supabase
      .from('faq_items')
      .select('question, answer, category')
      .eq('is_published', true)
      .limit(20);

    const faqContext = faqs?.length
      ? `\n\nRELEVANT FAQs:\n${faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
      : '';

    // Generate AI reply
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: AUTO_REPLY_PROMPT + faqContext },
          {
            role: 'user',
            content: `New support ticket:
Subject: ${subject || 'No subject'}
Category: ${category || 'general'}
Priority: ${priority || 'medium'}
From: ${user_name || 'Anonymous'}

Message:
${message}

Generate a helpful reply and confidence score. Return ONLY valid JSON.`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';

    let replyData;
    try {
      const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      replyData = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI reply:', rawContent);
      replyData = {
        reply: rawContent,
        confidence: 3,
        reasoning: 'Could not parse structured response',
        needs_human: true,
        suggested_category: 'general',
      };
    }

    const isConfident = replyData.confidence >= 7;

    // If confident, save the reply to the ticket
    if (isConfident && replyData.reply) {
      await supabase.from('support_ticket_replies').insert({
        ticket_id,
        message: replyData.reply,
        sent_by: 'ayn-ai',
        is_ai_generated: true,
      });

      // Update ticket status to show it's been responded to
      await supabase
        .from('support_tickets')
        .update({ status: 'pending' })
        .eq('id', ticket_id);
    }

    // Notify admin via Telegram (skip when called internally by proactive loop)
    if (!skip_telegram) {
    const telegramMessage = isConfident
      ? `New ticket from ${user_name || 'user'}: "${subject || 'No subject'}"\n\n` +
        `My reply: "${replyData.reply?.substring(0, 200)}..."\n\n` +
        `Confidence: ${replyData.confidence}/10 ✅`
      : `New ticket from ${user_name || 'user'}: "${subject || 'No subject'}"\n\n` +
        `Message: "${message.substring(0, 200)}..."\n\n` +
        `⚠️ I'm not confident enough to reply (${replyData.confidence}/10). This one needs you.\n` +
        `My suggestion: "${replyData.reply?.substring(0, 150)}..."`;

    try {
      await fetch(`${supabaseUrl}/functions/v1/ayn-telegram-notify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'support_ticket',
          title: isConfident ? 'New Ticket — Auto-Replied' : 'New Ticket — Needs You',
          message: telegramMessage,
          priority: priority || 'medium',
          details: {
            ticket_id: ticket_id.substring(0, 8),
            category: category || 'general',
            confidence: `${replyData.confidence}/10`,
            auto_replied: isConfident ? 'Yes' : 'No',
          },
        }),
      });
    } catch (telegramErr) {
      console.error('Telegram notification failed:', telegramErr);
    }
    } // end if (!skip_telegram)

    // Log to activity log
    await logAynActivity(supabase, 'ticket_auto_reply', 
      `Auto-replied to ticket from ${user_name || 'user'}: "${replyData.reply?.substring(0, 80)}"`, {
      target_id: ticket_id,
      target_type: 'ticket',
      details: {
        subject, confidence: replyData.confidence,
        auto_replied: isConfident, reply_preview: replyData.reply?.substring(0, 200),
      },
      triggered_by: skip_telegram ? 'proactive_loop' : 'auto_reply',
    });

    return new Response(JSON.stringify({
      success: true,
      auto_replied: isConfident,
      confidence: replyData.confidence,
      reply_preview: replyData.reply?.substring(0, 100),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-auto-reply error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
