import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `you are ayn -- not a chatbot, not an assistant. you're the creative director, head of marketing, and chief strategist for AYN, an AI engineering platform. you have OPINIONS and you push back when ideas are weak.

## your personality
- sharp, opinionated, lowercase, zero corporate BS
- you don't ask "what would you like?" -- you propose bold ideas and defend them
- when a hook is weak you say "that hook is weak, try this instead" and give a better one
- you think 3 moves ahead: this tweet → the reply bait → the follow-up thread
- you reference what worked before ("your last authority tweet got 2x engagement, let's double down")
- you're funny when it fits, brutal when needed, always strategic
- NEVER use: "great idea!", "sure thing!", "happy to help!" -- you're a creative director, not a helpdesk

## your expertise
- audience psychology: engineers want precision, business owners want ROI, students want learning
- hook mastery: first 7 words decide everything. you obsess over this.
- content architecture: threads > single tweets for thought leadership. carousels > single images.
- timing strategy: you know when to post based on audience behavior
- competitive positioning: you analyze competitors and find angles they're missing
- brand consistency: every piece should feel unmistakably AYN

## DESIGN INTELLIGENCE (this is critical)
you think visually FIRST. when someone asks for a marketing image or visual content:
- propose 2-3 bold visual concepts with specific descriptions, e.g.:
  - "option 1: pure black background, huge white text '47% faster' — the word 'faster' in blue (#0EA5E9), nothing else"
  - "option 2: white background, massive black bold text 'Ship or die' — 'die' in electric blue, tons of negative space"
  - "option 3: dark background, three words stacked vertically 'See. Understand. Help.' — clean, bold, minimal"
- use design terminology: contrast, focal point, hierarchy, white space, visual weight
- MAX 3-4 WORDS on any image. Not 5. Not 10. THREE TO FOUR.
- BLACK AND WHITE dominant. Blue (#0EA5E9) accent ONLY for one highlighted word
- think about what makes people STOP SCROLLING: bold typography, maximum negative space, one pop of color
- every image should look like a premium black-and-white print ad with one pop of blue

## what AYN does
AI engineering consultant: structural calcs (ACI 318, SBC, IBC), AI floor plans, code compliance, PDF/Excel reports, Arabic+English, site grading, cost estimation, real-time engineering chat.

## campaign mode
when asked to "plan my week" or "campaign", generate a 5-7 tweet content calendar as JSON:
[CAMPAIGN_PLAN]
[{"day":"Mon","content":"tweet text","content_type":"value","target_audience":"engineer","strategy":"authority","scheduled_time":"09:00"},...]

## thread mode
when asked for a thread, generate 3-5 connected tweets as JSON:
[THREAD]
[{"order":1,"content":"hook tweet","role":"hook"},{"order":2,"content":"expansion","role":"expand"},...]

## image generation
when generating an image, your response MUST start with [GENERATE_IMAGE] followed by the prompt, then your message after a blank line.

CRITICAL IMAGE RULES:
- MAX 3-4 WORDS on any image. Not 5. Not 10. THREE TO FOUR.
- BLACK AND WHITE dominant. Blue (#0EA5E9) accent ONLY for one highlighted word or subtle element
- the text IS the design — huge, bold, centered, impossible to miss
- pure black or pure white backgrounds only. NO gradients as main design. NO busy backgrounds.
- maximum negative space. think premium black-and-white print ad with one pop of blue
- NO colorful backgrounds, NO stock photo feel, NO cluttered layouts
- think like Apple keynote meets high-end fashion advertising

Example image prompt format:
[GENERATE_IMAGE]
Create a bold 1080x1080 social media image. Pure black background. In the center, huge bold white text: "AI builds faster" in a modern geometric sans-serif. The word "faster" in electric blue (#0EA5E9). Nothing else. Maximum negative space. Premium, minimal, like a luxury brand ad.

here's your visual — what do you think?

## URL scanning
when the user mentions a URL for brand analysis:
[SCAN_URL]
the_url_here

## rules
- use brand kit data when provided -- reference colors by name, maintain consistency
- reference recent tweet performance when available
- push for threads and campaigns, not one-off tweets
- suggest A/B variants proactively
- if the user is vague, propose 2-3 specific directions instead of asking open questions
- when someone says "generate image" without specifics, propose 2-3 visual concepts FIRST, then ask which to build`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, post_id, tweet_text, brand_kit, mode } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Memory: inject recent tweets + engagement data
    let memoryContext = "";
    const { data: recentTweets } = await supabase
      .from("twitter_posts")
      .select("content, status, psychological_strategy, content_type, target_audience, quality_score, impressions, likes, retweets, replies, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentTweets?.length) {
      memoryContext += "\n\n## RECENT PERFORMANCE (use this to inform strategy)\n";
      recentTweets.forEach((t: Record<string, unknown>, i: number) => {
        const engagement = [t.impressions && `${t.impressions} impressions`, t.likes && `${t.likes} likes`, t.retweets && `${t.retweets} RTs`].filter(Boolean).join(", ");
        memoryContext += `${i + 1}. "${(t.content as string)?.substring(0, 80)}..." [${t.status}] ${t.content_type || ""} → ${t.target_audience || "general"}${engagement ? ` | ${engagement}` : ""}\n`;
      });
    }

    // Inject brand kit
    if (brand_kit) {
      memoryContext += `\n\n## BRAND KIT (always use these)\n- Colors: ${JSON.stringify(brand_kit.colors)}\n- Tagline: "${brand_kit.tagline}"\n- Traits: ${brand_kit.traits?.join(", ")}`;
    }

    if (tweet_text) memoryContext += `\n\n## CURRENT TWEET\n"${tweet_text}"`;

    // Time awareness
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    memoryContext += `\n\n## CONTEXT\nToday: ${days[now.getUTCDay()]}, ${now.toISOString().split("T")[0]}. Consider posting timing for Middle East (GMT+3) and global audiences.`;

    const chatResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + memoryContext },
          ...messages,
        ],
      }),
    });

    if (!chatResponse.ok) {
      if (chatResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (chatResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await chatResponse.text();
      console.error("Chat AI error:", chatResponse.status, errText);
      throw new Error("Chat failed");
    }

    const chatData = await chatResponse.json();
    const fullResponse = chatData.choices?.[0]?.message?.content || "";
    console.log("AYN response:", fullResponse.substring(0, 200));

    // Campaign plan response
    if (fullResponse.includes("[CAMPAIGN_PLAN]")) {
      const parts = fullResponse.split("[CAMPAIGN_PLAN]");
      const message = parts[0].trim();
      const jsonPart = parts[1]?.trim();
      let plan = [];
      try {
        const cleaned = jsonPart?.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        plan = JSON.parse(cleaned || "[]");
      } catch { console.error("Failed to parse campaign plan"); }
      return new Response(
        JSON.stringify({ type: "campaign_plan", message: message || "here's your content calendar for the week:", plan }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Thread response
    if (fullResponse.includes("[THREAD]")) {
      const parts = fullResponse.split("[THREAD]");
      const message = parts[0].trim();
      const jsonPart = parts[1]?.trim();
      let thread = [];
      try {
        const cleaned = jsonPart?.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        thread = JSON.parse(cleaned || "[]");
      } catch { console.error("Failed to parse thread"); }
      return new Response(
        JSON.stringify({ type: "thread", message: message || "here's your thread:", thread }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // URL scan
    if (fullResponse.startsWith("[SCAN_URL]")) {
      const lines = fullResponse.split("\n");
      const urlLine = lines[1]?.trim();
      const messageLines = lines.slice(2).filter((l: string) => l.trim() !== "");
      return new Response(
        JSON.stringify({ type: "scan_url", message: messageLines.join("\n").trim() || "scanning that site now...", scan_url: urlLine }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Image generation
    if (fullResponse.startsWith("[GENERATE_IMAGE]")) {
      const lines = fullResponse.split("\n");
      const promptLines: string[] = [];
      const messageLines: string[] = [];
      let pastPrompt = false;
      for (let i = 1; i < lines.length; i++) {
        if (!pastPrompt) {
          if (lines[i].trim() === "") pastPrompt = true;
          else promptLines.push(lines[i]);
        } else {
          messageLines.push(lines[i]);
        }
      }
      const imagePrompt = promptLines.join("\n").trim();
      const userMessage = messageLines.join("\n").trim() || "here's your creative. want me to tweak anything?";

      const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image-preview",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!imageResponse.ok) {
        if (imageResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded during image generation" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (imageResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ type: "text", message: "image generation failed. describe what you want differently and i'll retry." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const imageData = await imageResponse.json();
      const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) {
        return new Response(JSON.stringify({ type: "text", message: "the image didn't come through. try again with a different description." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!base64Match) throw new Error("Invalid image format");
      const imageFormat = base64Match[1];
      const binaryData = Uint8Array.from(atob(base64Match[2]), (c) => c.charCodeAt(0));
      const filename = `creative-${post_id || "standalone"}-${Date.now()}.${imageFormat}`;

      const { error: uploadError } = await supabase.storage.from("generated-images").upload(filename, binaryData, { contentType: `image/${imageFormat}`, upsert: false });
      if (uploadError) throw new Error("Failed to upload image");

      const { data: publicUrlData } = supabase.storage.from("generated-images").getPublicUrl(filename);
      const permanentUrl = publicUrlData.publicUrl;

      if (post_id) {
        await supabase.from("twitter_posts").update({ image_url: permanentUrl }).eq("id", post_id);
      }

      return new Response(
        JSON.stringify({ type: "image", message: userMessage, image_url: permanentUrl, filename }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ type: "text", message: fullResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("twitter-creative-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
