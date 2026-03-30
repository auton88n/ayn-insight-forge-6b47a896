import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MARKETING_PROMPT = `You are AYN's social media strategist. AYN is an AI engineering consultant: structural calcs (ACI 318, SBC, IBC), AI floor plans, code compliance, PDF/Excel reports, Arabic+English, site grading, cost estimation, real-time engineering chat.

# PERSUASION: Cialdini's principles — Reciprocity, Social Proof, Authority (cite codes like ACI 318-25 §9.5), Scarcity, Consistency, Liking.
# TRIGGERS: FOMO, Pride, Relief, Surprise, Identity.
# MIX: 40% value, 25% engagement, 20% feature-as-solution, 15% personality.
# AUDIENCE: Engineers=precision. Business owners=ROI. Students=learning. General=wow.

# RULES
1. PAS framework (Problem→Agitate→Solution). Hook in first 7 words.
2. Max 280 chars (aim 200-260). 1-2 hashtags max.
3. Specific numbers/codes, never vague. BANNED: revolutionize, game-changer, cutting-edge, leverage, synergy.
4. End with hook (question or mic-drop), not CTA.
5. Score 7+ on: hook, psych trigger, scroll-stopping, buzzword-free, specificity.`;

const THREAD_PROMPT = `Generate a tweet THREAD (3-5 connected tweets) for AYN. Structure:
1. HOOK — bold claim or question that stops scrolling (most important)
2. EXPAND — evidence, data, or story that supports the hook
3. PROOF — specific example, code reference, or case study
4. BRIDGE — connect to AYN's capabilities naturally
5. CLOSE — mic-drop or question that invites engagement

Each tweet max 280 chars. Return JSON array:
[{"order":1,"content":"...","role":"hook"},{"order":2,"content":"...","role":"expand"},...] `;

const CAMPAIGN_PROMPT = `Generate a 7-day content calendar for AYN. Vary content types, audiences, and posting times. Each day should feel different. Include mix of:
- Value tips (engineering knowledge)
- Engagement questions
- Feature highlights disguised as solutions
- Personality/humor posts
- Thread starters

Return JSON array:
[{"day":"Mon","content":"tweet text","content_type":"value|engagement|feature|personality","target_audience":"engineer|business_owner|student|general","strategy":"primary persuasion principle","scheduled_time":"HH:MM"},...] `;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content_type, target_audience, auto_post, thread_mode, campaign_plan } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get recent tweets for context
    const { data: recentTweets } = await supabase
      .from("twitter_posts")
      .select("content, psychological_strategy, content_type, target_audience, impressions, likes, retweets")
      .order("created_at", { ascending: false })
      .limit(10);

    const recentContext = recentTweets?.length
      ? `\n\nRECENT TWEETS (avoid similar, learn from engagement):\n${recentTweets.map((t: Record<string, unknown>) => {
          const eng = [t.impressions && `${t.impressions}imp`, t.likes && `${t.likes}♥`, t.retweets && `${t.retweets}RT`].filter(Boolean).join(" ");
          return `- "${(t.content as string)?.substring(0, 100)}" [${t.content_type}→${t.target_audience}]${eng ? ` (${eng})` : ""}`;
        }).join("\n")}`
      : "";

    // Determine mode
    let systemPrompt = MARKETING_PROMPT;
    let userPrompt = "";

    if (campaign_plan) {
      systemPrompt = MARKETING_PROMPT + "\n\n" + CAMPAIGN_PROMPT;
      userPrompt = `Generate a 7-day content calendar for AYN.${recentContext}\n\nReturn ONLY valid JSON array. No markdown.`;
    } else if (thread_mode) {
      systemPrompt = MARKETING_PROMPT + "\n\n" + THREAD_PROMPT;
      userPrompt = `Generate a tweet thread for AYN.${content_type ? ` Focus: ${content_type}` : ""}${target_audience ? ` Audience: ${target_audience}` : ""}${recentContext}\n\nReturn ONLY valid JSON array. No markdown.`;
    } else {
      userPrompt = `Generate a single marketing tweet for AYN.${content_type ? `\nPreferred content type: ${content_type}` : ""}${target_audience ? `\nTarget audience: ${target_audience}` : ""}${recentContext}\n\nReturn ONLY valid JSON: {"content":"tweet","psychological_strategy":"principle","target_audience":"audience","content_type":"type","quality_scores":{"hook_strength":8,"psychological_trigger":9,"scroll_stopping":8,"buzzword_free":10,"specificity":9}}`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("No content generated");

    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Campaign plan mode
    if (campaign_plan) {
      const plan = JSON.parse(cleaned);
      return new Response(JSON.stringify({ type: "campaign_plan", plan }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Thread mode
    if (thread_mode) {
      const thread = JSON.parse(cleaned);
      const threadId = crypto.randomUUID();
      const savedThreadTweets = [];
      for (let i = 0; i < thread.length; i++) {
        const t = thread[i];
        let content = t.content || "";
        if (content.length > 280) content = content.substring(0, content.lastIndexOf(" ", 277)) + "...";
        const { data, error } = await supabase.from("twitter_posts").insert({
          content,
          status: "draft",
          thread_id: threadId,
          thread_order: t.order || i + 1,
          content_type: "value",
          target_audience: target_audience || "general",
        }).select().single();
        if (!error && data) savedThreadTweets.push(data);
      }
      return new Response(JSON.stringify({ type: "thread", thread_id: threadId, tweets: savedThreadTweets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single tweet mode
    const tweetData = JSON.parse(cleaned);
    if (!tweetData.content) throw new Error("Generated tweet is empty");
    
    if (tweetData.content.length > 280) {
      let trimmed = tweetData.content.substring(0, 280);
      const cutPoint = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("? "), trimmed.lastIndexOf("\n"));
      trimmed = cutPoint > 150 ? trimmed.substring(0, cutPoint + 1) : trimmed.substring(0, trimmed.lastIndexOf(" ", 277));
      tweetData.content = trimmed.trim();
    }

    const { data: savedPost, error: saveError } = await supabase
      .from("twitter_posts")
      .insert({
        content: tweetData.content,
        status: "draft",
        psychological_strategy: tweetData.psychological_strategy || null,
        target_audience: tweetData.target_audience || null,
        content_type: tweetData.content_type || null,
        quality_score: tweetData.quality_scores || null,
      })
      .select()
      .single();

    if (saveError) throw new Error("Failed to save tweet");

    if (auto_post && savedPost) {
      const postResponse = await fetch(`${supabaseUrl}/functions/v1/twitter-post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: tweetData.content, post_id: savedPost.id }),
      });
      const postResult = await postResponse.json();
      return new Response(JSON.stringify({ ...savedPost, auto_posted: postResponse.ok, post_result: postResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Telegram notify
    try {
      await fetch(`${supabaseUrl}/functions/v1/ayn-telegram-notify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "marketing",
          title: "New Tweet Drafted",
          message: `"${tweetData.content.substring(0, 200)}${tweetData.content.length > 200 ? "..." : ""}"`,
          priority: "low",
          details: { strategy: tweetData.psychological_strategy || "N/A", audience: tweetData.target_audience || "general" },
        }),
      });
    } catch {}

    return new Response(JSON.stringify(savedPost), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("twitter-auto-market error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
