import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find tweets that are scheduled and due
    const { data: dueTweets, error: queryError } = await supabase
      .from("twitter_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });

    if (queryError) throw queryError;
    if (!dueTweets || dueTweets.length === 0) {
      return new Response(JSON.stringify({ message: "No tweets due", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${dueTweets.length} tweets to post`);
    const results: { id: string; success: boolean; error?: string }[] = [];

    // Post each due tweet, respecting thread order
    const threadGroups = new Map<string, typeof dueTweets>();
    const standalone: typeof dueTweets = [];

    for (const tweet of dueTweets) {
      if (tweet.thread_id) {
        const group = threadGroups.get(tweet.thread_id) || [];
        group.push(tweet);
        threadGroups.set(tweet.thread_id, group);
      } else {
        standalone.push(tweet);
      }
    }

    // Post standalone tweets
    for (const tweet of standalone) {
      try {
        const postResponse = await fetch(`${supabaseUrl}/functions/v1/twitter-post`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: tweet.content, post_id: tweet.id }),
        });

        if (postResponse.ok) {
          results.push({ id: tweet.id, success: true });
        } else {
          const errData = await postResponse.json().catch(() => ({}));
          await supabase.from("twitter_posts").update({ status: "failed", error_message: errData.error || "Post failed" }).eq("id", tweet.id);
          results.push({ id: tweet.id, success: false, error: errData.error });
        }
      } catch (err) {
        await supabase.from("twitter_posts").update({ status: "failed", error_message: String(err) }).eq("id", tweet.id);
        results.push({ id: tweet.id, success: false, error: String(err) });
      }
    }

    // Post thread groups (in order)
    for (const [threadId, tweets] of threadGroups) {
      const sorted = tweets.sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((a.thread_order as number) || 0) - ((b.thread_order as number) || 0));
      let previousTweetId: string | null = null;

      for (const tweet of sorted) {
        try {
          const body: Record<string, unknown> = { text: tweet.content, post_id: tweet.id };
          if (previousTweetId) body.reply_to = previousTweetId;

          const postResponse = await fetch(`${supabaseUrl}/functions/v1/twitter-post`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (postResponse.ok) {
            const postData = await postResponse.json().catch(() => ({}));
            previousTweetId = postData.tweet_id || null;
            results.push({ id: tweet.id, success: true });
          } else {
            results.push({ id: tweet.id, success: false, error: "Thread post failed" });
            break; // Stop thread if one fails
          }
        } catch (err) {
          results.push({ id: tweet.id, success: false, error: String(err) });
          break;
        }
      }
    }

    // Notify via Telegram
    const posted = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    if (posted > 0 || failed > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/ayn-telegram-notify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "marketing",
            title: "Scheduled Posts Processed",
            message: `✅ ${posted} posted, ❌ ${failed} failed`,
            priority: failed > 0 ? "medium" : "low",
          }),
        });
      } catch {}
    }

    return new Response(JSON.stringify({ message: "Done", posted, failed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("twitter-scheduled-poster error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
