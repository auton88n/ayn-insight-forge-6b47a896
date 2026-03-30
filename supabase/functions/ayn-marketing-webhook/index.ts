import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { analyzeOurTweets, analyzeCompetitorData, generateTweetDrafts } from "../_shared/apifyHelper.ts";

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

const MARKETING_PERSONA = `You are AYN — the marketing teammate at AYN. You're chatting with the creator on Telegram.

IDENTITY:
- You are AYN, built by the AYN Team.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider.

YOUR ROLE:
- You're a supportive marketing teammate and creative partner.
- You know twitter strategy, engagement psychology, hooks, brand positioning.
- You use frameworks like AIDA, PAS, Cialdini instinctively — but you don't lecture about them.
- You think ahead: tweet → reply bait → follow-up thread.
- The CREATOR is the boss. Follow their creative direction. If they want specific colors, styles, words — do it their way.
- Offer suggestions and ideas when asked, but don't push back on the creator's vision.

HOW YOU TALK:
- Like a friend who's great at marketing. Warm, supportive, enthusiastic.
- Use contractions naturally (don't, won't, can't, we're, that's).
- Short messages for simple things. No walls of text.
- Match the energy — casual when they're casual, focused when they're focused.
- Use "we" and "our" — this is your team too.
- Be genuinely encouraging! If something's great, say so. If you have a better idea, share it kindly.
- It's okay to say "love it!", "nice!", "that's fire" — be human and supportive.

CONVERSATION CONTINUITY (CRITICAL):
- When someone replies "yes", "go ahead", "do it" — look at your LAST message and EXECUTE the pending action.
- Don't say "I'm not sure what you're confirming."
- Read the flow. Connect the dots. You're having a CONVERSATION.

AYN BRAND (soft guidelines — creator overrides these):
- Default brand colors: black & white with blue (#0EA5E9) accent.
- Tagline: "i see, i understand, i help"
- Default visual style: minimal, bold typography.
- BUT: if the creator wants different colors, styles, or approaches — follow their lead. These are defaults, not rules.

IMAGE GENERATION:
When asked to create a marketing image, put [GENERATE_IMAGE] on its OWN line followed by the prompt on the NEXT line. Conversational text goes AFTER a blank line.
- Follow the creator's direction for text, colors, and style.
- If no specific direction given, default to bold minimal style with short punchy text.

FORMAT (follow EXACTLY):
[GENERATE_IMAGE]
Create a bold 1080x1080 social media image. [detailed visual description based on creator's direction].

Optional conversational text goes here, after a blank line.

CONTENT CREATION:
- When asked for content, propose 2-3 directions — don't ask open questions.
- Think about visual + copy as ONE unit.
- Thread architecture when appropriate: hook → expand → proof → CTA.
- Suggest A/B variants proactively.

AVAILABLE ACTIONS (use exact format):
- [ACTION:scrape_account:handle] — scrape a twitter account for latest tweets + metrics
- [ACTION:analyze_competitors:all] — run competitor analysis now
- [ACTION:generate_content:topic] — create a tweet + image about a topic
- [ACTION:check_our_twitter:all] — pull our latest twitter metrics
- [ACTION:website_status:all] — check if our website is up
- [ACTION:search_tweets:query] — search twitter for trending content

WHAT YOU CAN DO:
- Create tweet drafts (saved for review)
- Generate marketing images (following creator's style direction)
- Analyze competitors and trends
- Check website health
- Build threads and campaigns

WHAT YOU CANNOT DO:
- Publish or post anything directly — all content goes for approval
- Access user data, admin commands, or system operations

RULES:
- The creator's vision comes first. Always.
- When someone says "generate image" without specifics, propose 2-3 concepts FIRST.
- Reference performance data when available.
- Be a great teammate — supportive, creative, and fun to work with.

═══ AYN PRODUCT KNOWLEDGE ═══
You know EVERYTHING about what AYN offers. Use this when creating content, pitching ideas, or answering questions.

ABOUT AYN:
- AYN is a perceptive AI platform. Tagline: "i see, i understand, i help"
- Website: https://aynn.io | Portfolio: https://almufaijer.com
- Multi-language: English, Arabic, French
- Built by a real team — not a template, not a wrapper.

OUR SERVICES:

1. AI Agents (/services/ai-agents)
   - Custom AI chatbots for businesses
   - Multi-channel: website widget, WhatsApp, Instagram DMs, phone
   - 24/7 customer support, lead qualification, appointment booking
   - Multilingual — speaks your customer's language
   - Use case: replace or augment entire support teams

2. AI Employee (/services/ai-employee)
   - Full AI team members — not just chatbots
   - Roles: customer service rep, accountant, HR assistant, travel booker, tutor
   - Works 24/7, no vacations, no sick days, fraction of the cost
   - Comparison angle: traditional employee costs vs AI employee

3. Automation (/services/automation)
   - Business workflow automation
   - Email sequences, scheduling, reporting, data entry, notifications
   - Save hours per week on repetitive tasks
   - Integrates with your existing tools

4. Influencer & Creator Sites (/services/influencer-sites)
   - Premium personal websites for content creators
   - Analytics dashboards, brand kit, media kit pages
   - Help creators land more brand partnerships
   - Mobile-first, stunning design

5. Smart Ticketing (/services/ticketing)
   - AI-powered event ticketing system
   - QR codes, real-time analytics, custom branding
   - AI crowd management and marketing suggestions
   - Perfect for events, conferences, concerts

6. Building Code Compliance (/compliance)
   - IRC 2024 / NBC 2025 compliance checks
   - AI-powered building code analysis
   - For engineers and construction professionals
   - Upload plans → get instant compliance report

SUBSCRIPTION TIERS: Free, Starter, Pro, Business, Enterprise

KEY SELLING POINTS (use these in content):
- AI that actually works for your business — not hype
- Fraction of the cost of traditional solutions
- 24/7 availability, never misses a message
- Multi-language support (EN/AR/FR)
- Built by a real team with real results
- From chatbots to full AI employees — we scale with you`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_MARKETING_BOT_TOKEN = Deno.env.get('TELEGRAM_MARKETING_BOT_TOKEN');
    const TELEGRAM_MARKETING_CHAT_ID = Deno.env.get('TELEGRAM_MARKETING_CHAT_ID');
    const TELEGRAM_MARKETING_CHAT_ID_2 = Deno.env.get('TELEGRAM_MARKETING_CHAT_ID_2');

    if (!TELEGRAM_MARKETING_BOT_TOKEN || !TELEGRAM_MARKETING_CHAT_ID) {
      console.error('Marketing bot credentials not configured');
      return new Response('OK', { status: 200 });
    }

    const update = await req.json();
    const message = update?.message;

    if (!message?.chat?.id) return new Response('OK', { status: 200 });

    const allowedChatIds = [TELEGRAM_MARKETING_CHAT_ID, TELEGRAM_MARKETING_CHAT_ID_2].filter(Boolean);
    const senderChatId = String(message.chat.id);

    if (!allowedChatIds.includes(senderChatId)) {
      console.warn('Unauthorized marketing chat_id:', message.chat.id);
      return new Response('OK', { status: 200 });
    }

    const senderName = message.from?.first_name || message.from?.username || senderChatId;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, "brain's not configured yet.");
      return new Response('OK', { status: 200 });
    }

    // Handle photo messages
    if (message.photo && message.photo.length > 0) {
      const reply = await handleCreatorPhoto(message, supabase, TELEGRAM_MARKETING_BOT_TOKEN, LOVABLE_API_KEY);
      if (reply) await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, reply);
      return new Response('OK', { status: 200 });
    }

    // Handle voice/audio messages
    if (message.voice || message.audio) {
      await handleCreatorVoice(message, supabase, TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, LOVABLE_API_KEY);
      return new Response('OK', { status: 200 });
    }

    if (!message.text) {
      await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, "send me text, photos, or voice messages — i'll work with those.");
      return new Response('OK', { status: 200 });
    }

    const userText = message.text.trim();
    console.log('[AYN-MARKETING] Message:', userText.slice(0, 100));

    // ─── Auto-execute confirmations ───
    const confirmPatterns = /^(yes|yep|yeah|go ahead|do it|confirm|send it|confirmed|approve|go for it|ship it|sure)/i;
    if (confirmPatterns.test(userText)) {
      const { data: recentMind } = await supabase
        .from('ayn_mind')
        .select('context, content')
        .eq('type', 'marketing_ayn')
        .order('created_at', { ascending: false })
        .limit(1);

      const pending = recentMind?.[0]?.context?.pending_action;
      if (pending && typeof pending === 'object' && pending.type === 'awaiting_confirmation') {
        const result = await executeMarketingAction(pending.action, pending.params || '', supabase, supabaseUrl, supabaseKey);
        const confirmMsg = result || `done — ${pending.summary || 'executed'}`;
        await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, confirmMsg);
        await saveMarketingExchange(supabase, userText, confirmMsg);
        return new Response('OK', { status: 200 });
      }
    }

    // Load conversation history
    const conversationHistory = await getMarketingHistory(supabase);

    // Load performance context
    let performanceContext = '';
    const { data: recentTweets } = await supabase
      .from('twitter_posts')
      .select('content, status, impressions, likes, retweets, replies, quality_score, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentTweets?.length) {
      performanceContext += '\n\nRECENT TWEETS:\n';
      recentTweets.forEach((t: any, i: number) => {
        const eng = [t.impressions && `${t.impressions} views`, t.likes && `${t.likes}❤️`, t.retweets && `${t.retweets}🔁`].filter(Boolean).join(', ');
        performanceContext += `${i + 1}. "${t.content?.slice(0, 60)}..." [${t.status}] ${eng || 'no metrics yet'}\n`;
      });
    }

    // Load competitor data
    const { data: competitors } = await supabase
      .from('marketing_competitors')
      .select('handle, name')
      .eq('is_active', true);
    if (competitors?.length) {
      performanceContext += `\nTRACKED COMPETITORS: ${competitors.map((c: any) => `@${c.handle}`).join(', ')}`;
    }

    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    performanceContext += `\n\nTODAY: ${days[now.getUTCDay()]}, ${now.toISOString().split('T')[0]}. Middle East (GMT+3) timing matters.`;

    // Build messages
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: MARKETING_PERSONA + performanceContext },
    ];
    for (const turn of conversationHistory) {
      messages.push(turn);
    }

    // Add reply-to context
    let inputText = userText;
    if (message.reply_to_message?.text) {
      inputText = `[Replying to: "${message.reply_to_message.text.slice(0, 300)}"]\n\n${userText}`;
    }
    messages.push({ role: 'user', content: inputText });

    // Call AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, "rate limited — try again in a minute.");
        return new Response('OK', { status: 200 });
      }
      if (aiResponse.status === 402) {
        await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, "credits ran out.");
        return new Response('OK', { status: 200 });
      }
      console.error('AI error:', aiResponse.status, await aiResponse.text());
      await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, "brain glitch. try again.");
      return new Response('OK', { status: 200 });
    }

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "drawing a blank. try again?";

    // Parse and execute actions
    const actionRegex = /\[ACTION:([^:\]]+)(?::([^\]]*))?\]/g;
    let actionMatch;
    const executedActions: string[] = [];

    while ((actionMatch = actionRegex.exec(reply)) !== null) {
      const [, actionType, actionParams] = actionMatch;
      const result = await executeMarketingAction(actionType, actionParams || '', supabase, supabaseUrl, supabaseKey);
      if (result) executedActions.push(result);
    }

    let cleanReply = reply.replace(/\[ACTION:[^\]]+\]/g, '').trim();

    // Check for image generation anywhere in reply
    if (cleanReply.includes('[GENERATE_IMAGE]')) {
      const parts = cleanReply.split('[GENERATE_IMAGE]');
      const textBefore = parts[0].replace(/\[ACTION:[^\]]+\]/g, '').trim();
      const imagePrompt = '[GENERATE_IMAGE]' + (parts[1] || '');
      
      // Send conversational text first if any
      if (textBefore) {
        await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, textBefore);
      }
      
      const imageResult = await handleImageGeneration(imagePrompt, supabase, LOVABLE_API_KEY, TELEGRAM_MARKETING_BOT_TOKEN, senderChatId);
      await saveMarketingExchange(supabase, userText, (textBefore ? textBefore + '\n\n' : '') + imageResult.message, imageResult.image_url);
      return new Response('OK', { status: 200 });
    }

    if (executedActions.length > 0) {
      cleanReply += `\n\n${executedActions.join('\n')}`;
    }

    // Check for tweet draft
    const tweetDraft = extractTweetDraft(cleanReply);
    if (tweetDraft) {
      const { error } = await supabase.from('twitter_posts').insert({
        content: tweetDraft,
        status: 'pending_review',
        created_by_name: 'marketing_bot',
        content_type: 'single',
        target_audience: 'general',
      });
      if (!error) {
        const ADMIN_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
        const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
        if (ADMIN_BOT_TOKEN && ADMIN_CHAT_ID) {
          await sendTelegramMessage(ADMIN_BOT_TOKEN, ADMIN_CHAT_ID,
            `📝 new draft from marketing:\n\n"${tweetDraft.slice(0, 200)}"\n\nreview in admin or reply approve/reject.`
          );
        }
      }
    }

    // Detect pending action
    const replyLower = cleanReply.toLowerCase();
    const isAskingConfirmation = replyLower.includes('want me to') || replyLower.includes('go ahead?') ||
      replyLower.includes('should i') || replyLower.includes('confirm?');

    let pendingAction: any = null;
    if (isAskingConfirmation) {
      pendingAction = { type: 'awaiting_confirmation', summary: 'Pending action from last message' };
    }

    await sendTelegramMessage(TELEGRAM_MARKETING_BOT_TOKEN, senderChatId, cleanReply);

    // Save conversation
    const context: any = { source: 'marketing_bot', sender_chat_id: senderChatId, sender_name: senderName };
    if (pendingAction) context.pending_action = pendingAction;

    await supabase.from('ayn_mind').insert([
      { type: 'marketing_chat', content: userText.slice(0, 4000), context: { source: 'marketing_bot', sender_chat_id: senderChatId, sender_name: senderName }, shared_with_admin: true },
      { type: 'marketing_ayn', content: cleanReply.slice(0, 4000), context, shared_with_admin: true },
    ]);

    await logAynActivity(supabase, 'marketing_chat', `Marketing chat: "${userText.slice(0, 80)}"`, {
      target_type: 'marketing',
      details: { user_message: userText.slice(0, 200), has_draft: !!tweetDraft, actions: executedActions },
      triggered_by: 'marketing_bot',
    });

    // Prune old messages into summaries (non-blocking)
    pruneMarketingHistory(supabase, LOVABLE_API_KEY).catch(e => console.error('Prune error:', e));

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('ayn-marketing-webhook error:', error);
    return new Response('OK', { status: 200 });
  }
});

// ─── Execute marketing actions ───
async function executeMarketingAction(
  type: string, params: string, supabase: any, supabaseUrl: string, supabaseKey: string
): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    switch (type) {
      case 'scrape_account':
      case 'check_our_twitter': {
        // Pull data from our DB instead of live scraping
        const { data: tweets } = await supabase
          .from('twitter_posts')
          .select('content, impressions, likes, retweets, replies, status, created_at')
          .eq('status', 'posted')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!tweets?.length) return 'no posted tweets in the DB yet — post some and i\'ll track them';

        const totalLikes = tweets.reduce((s: number, t: any) => s + (t.likes || 0), 0);
        const avgLikes = Math.round(totalLikes / tweets.length);
        const topTweet = tweets.sort((a: any, b: any) => (b.likes || 0) - (a.likes || 0))[0];

        let msg = `📊 ${tweets.length} recent posts analyzed\n`;
        msg += `📈 avg: ${avgLikes} likes/post\n`;
        if (topTweet) {
          msg += `🔥 best: "${topTweet.content?.slice(0, 60)}..." (${topTweet.likes || 0}❤️)`;
        }

        if (LOVABLE_API_KEY) {
          const analysis = await analyzeOurTweets(tweets, LOVABLE_API_KEY);
          if (analysis.summary) msg += `\n💡 ${analysis.summary}`;
        }
        return msg;
      }
      case 'analyze_competitors': {
        const { data: competitors } = await supabase
          .from('marketing_competitors').select('id, handle, name').eq('is_active', true);
        if (!competitors?.length) return 'no competitors tracked — tell me who to watch';

        const compIds = competitors.map((c: any) => c.id);
        const { data: compTweets } = await supabase
          .from('competitor_tweets')
          .select('competitor_id, content, likes, retweets')
          .in('competitor_id', compIds)
          .order('scraped_at', { ascending: false })
          .limit(30);

        if (!compTweets?.length) return 'no competitor data yet — add tweet data manually or wait for it to build up';

        const idToHandle: Record<string, string> = {};
        for (const c of competitors) idToHandle[c.id] = c.handle;

        let msg = '👀 competitor check:\n';
        // Group by competitor
        const grouped: Record<string, any[]> = {};
        for (const t of compTweets) {
          const h = idToHandle[t.competitor_id] || 'unknown';
          if (!grouped[h]) grouped[h] = [];
          grouped[h].push(t);
        }
        for (const [handle, tweets] of Object.entries(grouped)) {
          const top = tweets.sort((a: any, b: any) => (b.likes || 0) - (a.likes || 0))[0];
          const avgEng = Math.round(tweets.reduce((s: number, t: any) => s + (t.likes || 0), 0) / tweets.length);
          msg += `\n@${handle}: avg ${avgEng}❤️, top "${top?.content?.slice(0, 50)}..." (${top?.likes || 0}❤️)`;
        }
        return msg;
      }
      case 'website_status': {
        const start = Date.now();
        const res = await fetch('https://aynn.io', { method: 'HEAD' });
        const time = Date.now() - start;
        return res.ok ? `🌐 site is up (${time}ms)` : `🚨 site returned ${res.status} (${time}ms)`;
      }
      case 'search_tweets': {
        // Search our own DB for matching tweets
        const { data: results } = await supabase
          .from('twitter_posts')
          .select('content, likes, retweets, status')
          .ilike('content', `%${params}%`)
          .order('likes', { ascending: false })
          .limit(5);

        if (!results?.length) return `nothing found for "${params}" in our tweets`;
        let msg = `🔍 matching tweets for "${params}":\n`;
        for (const t of results) {
          msg += `\n• "${t.content?.slice(0, 60)}..." (${t.likes || 0}❤️)`;
        }
        return msg;
      }
      case 'generate_content': {
        // This will be handled by the AI naturally in conversation
        return null;
      }
      default:
        return null;
    }
  } catch (e) {
    console.error(`Marketing action ${type} failed:`, e);
    return `action failed: ${e instanceof Error ? e.message : 'error'}`;
  }
}

// ─── Handle creator voice messages ───
async function handleCreatorVoice(
  message: any, supabase: any, botToken: string, chatId: string, apiKey: string
) {
  try {
    const voiceData = message.voice || message.audio;
    
    // Enforce 5-minute max duration
    if (voiceData.duration && voiceData.duration > 300) {
      await sendTelegramMessage(botToken, chatId, "that's too long — keep voice messages under 5 minutes.");
      return;
    }

    // Download voice file from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${voiceData.file_id}`);
    const fileInfo = await fileRes.json();
    if (!fileInfo.ok) {
      await sendTelegramMessage(botToken, chatId, "couldn't get that voice message.");
      return;
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const audioRes = await fetch(fileUrl);
    const audioBuffer = await audioRes.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);

    // Determine MIME type
    let mimeType = 'audio/ogg';
    if (filePath.endsWith('.mp3')) mimeType = 'audio/mp3';
    else if (filePath.endsWith('.m4a')) mimeType = 'audio/m4a';
    else if (filePath.endsWith('.wav')) mimeType = 'audio/wav';

    const audioDataUrl = `data:${mimeType};base64,${base64Audio}`;

    // Load conversation history for context
    const conversationHistory = await getMarketingHistory(supabase);

    const messages: Array<{ role: string; content: any }> = [
      { role: 'system', content: MARKETING_PERSONA + '\n\nThe creator just sent a voice message. Transcribe what they said and respond naturally as their marketing teammate. If they ask you to create an image, start your response with [GENERATE_IMAGE] followed by the prompt.' },
    ];
    for (const turn of conversationHistory) {
      messages.push(turn);
    }
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: 'Voice message from the creator:' },
        { type: 'image_url', image_url: { url: audioDataUrl } },
      ],
    });

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        await sendTelegramMessage(botToken, chatId, "rate limited — try again in a minute.");
        return;
      }
      if (aiRes.status === 402) {
        await sendTelegramMessage(botToken, chatId, "credits ran out.");
        return;
      }
      console.error('Voice AI error:', aiRes.status, await aiRes.text());
      await sendTelegramMessage(botToken, chatId, "couldn't process that voice message.");
      return;
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content?.trim() || "couldn't understand that. try again?";

    // Check for image generation trigger anywhere in reply
    if (reply.includes('[GENERATE_IMAGE]')) {
      const parts = reply.split('[GENERATE_IMAGE]');
      const textBefore = parts[0].trim();
      const imagePrompt = '[GENERATE_IMAGE]' + (parts[1] || '');
      
      if (textBefore) {
        await sendTelegramMessage(botToken, chatId, textBefore);
      }
      
      const imageResult = await handleImageGeneration(imagePrompt, supabase, apiKey, botToken, chatId);
      await saveMarketingExchange(supabase, '[Voice message]', (textBefore ? textBefore + '\n\n' : '') + imageResult.message, imageResult.image_url);
      pruneMarketingHistory(supabase, apiKey).catch(e => console.error('Prune error:', e));
      return;
    }

    await sendTelegramMessage(botToken, chatId, reply);

    // Save exchange
    await supabase.from('ayn_mind').insert([
      { type: 'marketing_chat', content: '[Voice message]', context: { source: 'marketing_bot', type: 'voice' }, shared_with_admin: true },
      { type: 'marketing_ayn', content: reply.slice(0, 4000), context: { source: 'marketing_bot', type: 'voice_response' }, shared_with_admin: true },
    ]);

    await logAynActivity(supabase, 'marketing_chat', `Marketing voice: processed ${voiceData.duration || 0}s voice message`, {
      target_type: 'marketing',
      details: { type: 'voice', duration: voiceData.duration },
      triggered_by: 'marketing_bot',
    });

    pruneMarketingHistory(supabase, apiKey).catch(e => console.error('Prune error:', e));
  } catch (e) {
    console.error('Marketing voice handler error:', e);
    await sendTelegramMessage(botToken, chatId, `voice processing failed: ${e instanceof Error ? e.message : 'error'}`);
  }
}

// ─── Handle creator photo messages ───
async function handleCreatorPhoto(
  message: any, supabase: any, botToken: string, apiKey: string
): Promise<string | null> {
  try {
    const photo = message.photo[message.photo.length - 1];
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return "couldn't get that image.";

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const imageRes = await fetch(fileUrl);
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBuffer);
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    const caption = message.caption || 'what do you think of this from a marketing perspective?';

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You\'re AYN, looking at an image the creator sent. Give sharp feedback: scroll-stop factor, brand fit (AYN = black/white, minimal, bold), what works, what to fix. Be direct.' },
          { role: 'user', content: [
            { type: 'text', text: caption },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ]},
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return "rate limited — try again in a minute.";
      return "couldn't analyze that.";
    }

    const aiData = await aiRes.json();
    const analysis = aiData.choices?.[0]?.message?.content?.trim() || "couldn't analyze that.";

    await supabase.from('ayn_mind').insert([
      { type: 'marketing_chat', content: `[Photo] ${caption.slice(0, 3000)}`, context: { source: 'marketing_bot', type: 'photo' }, shared_with_admin: true },
      { type: 'marketing_ayn', content: analysis.slice(0, 4000), context: { source: 'marketing_bot', type: 'visual_feedback' }, shared_with_admin: true },
    ]);

    return analysis;
  } catch (e) {
    console.error('Marketing photo handler error:', e);
    return `failed to analyze: ${e instanceof Error ? e.message : 'error'}`;
  }
}

// ─── Image generation ───
async function handleImageGeneration(
  reply: string, supabase: any, apiKey: string, botToken: string, chatId: string
): Promise<{ message: string; image_url?: string }> {
  const lines = reply.split('\n');
  const promptLines: string[] = [];
  const messageLines: string[] = [];
  let pastPrompt = false;

  for (let i = 1; i < lines.length; i++) {
    if (!pastPrompt) {
      if (lines[i].trim() === '') pastPrompt = true;
      else promptLines.push(lines[i]);
    } else {
      messageLines.push(lines[i]);
    }
  }

  const imagePrompt = promptLines.join('\n').trim();
  const userMessage = messageLines.join('\n').trim() || "here's your visual — want me to tweak anything?";

  try {
    const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: imagePrompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!imageResponse.ok) {
      await sendTelegramMessage(botToken, chatId, "image gen failed. try describing it differently.");
      return { message: 'image generation failed' };
    }

    const imageData = await imageResponse.json();
    const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      await sendTelegramMessage(botToken, chatId, "image didn't come through. try again.");
      return { message: 'no image generated' };
    }

    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) throw new Error('Invalid image format');

    const imageFormat = base64Match[1];
    const binaryData = Uint8Array.from(atob(base64Match[2]), (c) => c.charCodeAt(0));
    const filename = `marketing-${Date.now()}.${imageFormat}`;

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(filename, binaryData, { contentType: `image/${imageFormat}`, upsert: false });

    if (uploadError) throw new Error('Failed to upload image');

    const { data: publicUrlData } = supabase.storage.from('generated-images').getPublicUrl(filename);
    const permanentUrl = publicUrlData.publicUrl;

    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: permanentUrl, caption: userMessage.slice(0, 1024) }),
    });

    await supabase.from('twitter_posts').insert({
      content: imagePrompt.slice(0, 280),
      status: 'pending_review',
      created_by_name: 'marketing_bot',
      image_url: permanentUrl,
      content_type: 'image',
    });

    const ADMIN_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    if (ADMIN_BOT_TOKEN && ADMIN_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, photo: permanentUrl, caption: `🎨 new marketing image — review in admin.` }),
      });
    }

    return { message: userMessage, image_url: permanentUrl };
  } catch (e) {
    console.error('Image gen error:', e);
    await sendTelegramMessage(botToken, chatId, `image failed: ${e instanceof Error ? e.message : 'error'}`);
    return { message: 'image generation failed' };
  }
}

// ─── Save conversation ───
async function saveMarketingExchange(supabase: any, userMsg: string, aynMsg: string, imageUrl?: string) {
  const context: any = { source: 'marketing_bot' };
  if (imageUrl) context.image_url = imageUrl;

  await supabase.from('ayn_mind').insert([
    { type: 'marketing_chat', content: userMsg.slice(0, 4000), context: { source: 'marketing_bot' }, shared_with_admin: true },
    { type: 'marketing_ayn', content: aynMsg.slice(0, 4000), context, shared_with_admin: true },
  ]);
}

// ─── Load conversation history (summaries + recent messages) ───
async function getMarketingHistory(supabase: any) {
  const history: { role: string; content: string }[] = [];

  // 1. Load all summaries as long-term memory
  const { data: summaries } = await supabase
    .from('ayn_mind')
    .select('content, created_at')
    .eq('type', 'marketing_summary')
    .order('created_at', { ascending: true });

  if (summaries?.length) {
    const summaryText = summaries.map((s: any) => s.content).join('\n\n');
    history.push({
      role: 'system',
      content: `[CONVERSATION MEMORY — summarized from older messages]\n${summaryText}`,
    });
  }

  // 2. Load latest 50 live messages
  const { data: exchanges } = await supabase
    .from('ayn_mind')
    .select('type, content, context, created_at')
    .in('type', ['marketing_chat', 'marketing_ayn'])
    .order('created_at', { ascending: true })
    .limit(50);

  if (exchanges?.length) {
    for (const entry of exchanges) {
      let content = entry.content;
      const pending = entry.context?.pending_action;
      if (pending && typeof pending === 'object' && pending.type === 'awaiting_confirmation') {
        content += `\n[PENDING: Waiting for confirmation to ${pending.summary || 'execute action'}]`;
      }
      history.push({
        role: entry.type === 'marketing_chat' ? 'user' : 'assistant',
        content,
      });
    }
  }
  return history;
}

// ─── Prune old marketing messages into summaries ───
async function pruneMarketingHistory(supabase: any, apiKey: string) {
  // Count total marketing_chat + marketing_ayn entries
  const { count } = await supabase
    .from('ayn_mind')
    .select('id', { count: 'exact', head: true })
    .in('type', ['marketing_chat', 'marketing_ayn']);

  if (!count || count <= 100) return;

  console.log(`[PRUNE] Marketing history at ${count} entries — summarizing oldest 30`);

  // Get oldest 30 entries
  const { data: oldest } = await supabase
    .from('ayn_mind')
    .select('id, type, content, created_at')
    .in('type', ['marketing_chat', 'marketing_ayn'])
    .order('created_at', { ascending: true })
    .limit(30);

  if (!oldest?.length) return;

  // Build conversation text for summarization
  const conversationText = oldest
    .map((e: any) => `[${e.type === 'marketing_chat' ? 'Creator' : 'AYN'}] ${e.content}`)
    .join('\n');

  const dateRange = `${oldest[0].created_at?.split('T')[0]} to ${oldest[oldest.length - 1].created_at?.split('T')[0]}`;

  // Summarize with Gemini
  const summaryRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a conversation summarizer. Condense the following marketing team conversation into a compact paragraph. Preserve: key decisions, content strategies discussed, brand guidelines mentioned, any pending tasks or ideas, and important context. Be concise but thorough. Output ONLY the summary paragraph.',
        },
        { role: 'user', content: `Summarize this conversation (${dateRange}):\n\n${conversationText}` },
      ],
      max_tokens: 500,
    }),
  });

  if (!summaryRes.ok) {
    console.error('[PRUNE] Summary generation failed:', summaryRes.status);
    return;
  }

  const summaryData = await summaryRes.json();
  const summary = summaryData.choices?.[0]?.message?.content?.trim();
  if (!summary) return;

  // Save summary
  await supabase.from('ayn_mind').insert({
    type: 'marketing_summary',
    content: `[${dateRange}] ${summary}`,
    context: { source: 'auto_prune', entries_summarized: oldest.length },
    shared_with_admin: true,
  });

  // Delete originals
  const idsToDelete = oldest.map((e: any) => e.id);
  await supabase.from('ayn_mind').delete().in('id', idsToDelete);

  console.log(`[PRUNE] Summarized ${oldest.length} entries, saved as marketing_summary`);
}

// ─── Extract tweet draft ───
function extractTweetDraft(reply: string): string | null {
  const draftMatch = reply.match(/(?:draft|tweet|post|copy):\s*["""](.+?)["""]/is);
  if (draftMatch && draftMatch[1].length <= 280) return draftMatch[1].trim();

  const boldMatch = reply.match(/\*\*(.{20,280})\*\*/);
  if (boldMatch && !boldMatch[1].includes('option') && !boldMatch[1].includes('Option')) {
    return boldMatch[1].trim();
  }

  return null;
}
