import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { analyzeOurTweets, analyzeCompetitorData, generateTweetDrafts } from "../_shared/apifyHelper.ts";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { scrapeUrl, searchWeb } from "../_shared/firecrawlHelper.ts";
import { sanitizeForPrompt } from "../_shared/sanitizeFirecrawl.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const MKT_BOT_TOKEN = Deno.env.get('TELEGRAM_MARKETING_BOT_TOKEN');
  const MKT_CHAT_ID = Deno.env.get('TELEGRAM_MARKETING_CHAT_ID');
  const ADMIN_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

  const report: string[] = [];
  const errors: string[] = [];

  try {
    console.log('[MARKETING-LOOP] Starting autonomous cycle...');

    // ─── 1. Analyze our Twitter data from DB ───
    const { data: ourTweets } = await supabase
      .from('twitter_posts')
      .select('content, impressions, likes, retweets, replies, status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    let ourAnalysis = null;
    if (LOVABLE_API_KEY && ourTweets?.length) {
      try {
        ourAnalysis = await analyzeOurTweets(ourTweets, LOVABLE_API_KEY);
        
        const posted = ourTweets.filter(t => t.status === 'posted');
        const totalLikes = posted.reduce((s, t) => s + (t.likes || 0), 0);
        const totalImpressions = posted.reduce((s, t) => s + (t.impressions || 0), 0);
        const avgLikes = posted.length ? Math.round(totalLikes / posted.length) : 0;

        report.push(`📊 analyzed ${ourTweets.length} tweets (${posted.length} posted)`);
        report.push(`📈 avg ${avgLikes} likes/post, ${totalImpressions} total impressions`);
        
        if (ourAnalysis.engagement_trend !== 'unknown') {
          report.push(`📉 trend: ${ourAnalysis.engagement_trend}`);
        }
        if (ourAnalysis.summary) {
          report.push(`💡 ${ourAnalysis.summary}`);
        }
      } catch (e) {
        errors.push(`analysis: ${e instanceof Error ? e.message : 'failed'}`);
      }
    } else if (!ourTweets?.length) {
      report.push('📭 no tweets in the DB yet — post some and i\'ll start tracking');
    }

    // ─── 2. Analyze competitor data from DB ───
    let competitorResults: Awaited<ReturnType<typeof analyzeCompetitorData>> = [];
    try {
      const { data: competitors } = await supabase
        .from('marketing_competitors')
        .select('id, handle, name')
        .eq('is_active', true);

      if (competitors?.length) {
        const compIds = competitors.map(c => c.id);
        const { data: compTweets } = await supabase
          .from('competitor_tweets')
          .select('competitor_id, content, likes, retweets, impressions')
          .in('competitor_id', compIds)
          .order('scraped_at', { ascending: false })
          .limit(50);

        if (compTweets?.length && LOVABLE_API_KEY) {
          // Map competitor_id to handle
          const idToHandle: Record<string, string> = {};
          for (const c of competitors) idToHandle[c.id] = c.handle;

          const mapped = compTweets.map(t => ({
            handle: idToHandle[t.competitor_id] || 'unknown',
            content: t.content || '',
            likes: t.likes || 0,
            retweets: t.retweets || 0,
          }));

          competitorResults = await analyzeCompetitorData(mapped, LOVABLE_API_KEY);
          
          if (competitorResults.length) {
            report.push(`\n👀 competitors:`);
            for (const c of competitorResults) {
              report.push(`  @${c.handle}: avg ${c.avg_engagement} likes, top: "${c.top_content[0]?.slice(0, 50)}..."`);
            }
          }
        } else if (!compTweets?.length) {
          report.push('no competitor tweet data yet — add some manually or wait for data');
        }
      } else {
        report.push('no competitors tracked — tell me who to watch');
      }
    } catch (e) {
      errors.push(`competitors: ${e instanceof Error ? e.message : 'failed'}`);
    }

    // ─── 3. Generate tweet drafts ───
    if (LOVABLE_API_KEY && ourAnalysis) {
      try {
        const drafts = await generateTweetDrafts({
          ourAnalysis,
          competitors: competitorResults,
        }, LOVABLE_API_KEY);

        for (const draft of drafts) {
          await supabase.from('twitter_posts').insert({
            content: draft.slice(0, 280),
            status: 'pending_review',
            created_by_name: 'marketing_bot',
            content_type: 'single',
            target_audience: 'general',
          });
        }

        if (drafts.length) {
          report.push(`\n✍️ created ${drafts.length} draft(s):`);
          for (let i = 0; i < drafts.length; i++) {
            report.push(`  ${i + 1}. "${drafts[i].slice(0, 80)}..."`);
          }
        }
      } catch (e) {
        errors.push(`drafts: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }

    // ─── 4. Auto-generate a branded image ───
    if (LOVABLE_API_KEY && ourAnalysis && ourAnalysis.best_hooks.length > 0) {
      try {
        const hookRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [{
              role: 'user',
              content: `Based on these successful hooks: ${ourAnalysis.best_hooks.join(', ')}\n\nGive me ONE 3-word phrase for a bold branded image. Just the 3 words, nothing else.`,
            }],
          }),
        });

        if (hookRes.ok) {
          const hookData = await hookRes.json();
          const hook = hookData.choices?.[0]?.message?.content?.trim();

          if (hook && hook.split(/\s+/).length <= 5) {
            const imgRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'google/gemini-3-pro-image-preview',
                messages: [{
                  role: 'user',
                  content: `Create a bold 1080x1080 social media image. Pure black background. The text "${hook}" centered in massive white bold sans-serif font. One word highlighted in electric blue (#0EA5E9). Minimal, high-contrast, premium feel. No other elements.`,
                }],
                modalities: ['image', 'text'],
              }),
            });

            if (imgRes.ok) {
              const imgData = await imgRes.json();
              const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

              if (imageUrl) {
                const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
                if (base64Match) {
                  const binaryData = Uint8Array.from(atob(base64Match[2]), c => c.charCodeAt(0));
                  const filename = `marketing-auto-${Date.now()}.${base64Match[1]}`;

                  await supabase.storage.from('generated-images')
                    .upload(filename, binaryData, { contentType: `image/${base64Match[1]}` });

                  const { data: publicUrlData } = supabase.storage.from('generated-images').getPublicUrl(filename);

                  await supabase.from('twitter_posts').insert({
                    content: hook,
                    status: 'pending_review',
                    created_by_name: 'marketing_bot',
                    image_url: publicUrlData.publicUrl,
                    content_type: 'image',
                  });

                  report.push(`\n🎨 auto-generated image: "${hook}"`);

                  if (MKT_BOT_TOKEN && MKT_CHAT_ID) {
                    await fetch(`https://api.telegram.org/bot${MKT_BOT_TOKEN}/sendPhoto`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: MKT_CHAT_ID,
                        photo: publicUrlData.publicUrl,
                        caption: `🎨 auto-generated: "${hook}"\napprove or tell me to tweak`,
                      }),
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        errors.push(`image gen: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }

    // ─── 5. Website health check via Firecrawl ───
    try {
      const siteUrl = 'https://aynn.io';
      const start = Date.now();
      const siteResult = await scrapeUrl(siteUrl, { onlyMainContent: false, formats: ['markdown'] });
      const responseTime = Date.now() - start;

      if (siteResult.success) {
        const contentLength = (siteResult.markdown || '').length;
        report.push(`\n🌐 site is up (${responseTime}ms, ${contentLength} chars scraped)`);
      } else {
        report.push(`\n🚨 site scrape failed: ${siteResult.error}`);
      }
    } catch (e) {
      report.push(`\n🚨 site is DOWN: ${e instanceof Error ? e.message : 'unreachable'}`);
    }

    // ─── 5b. Competitor web research via Firecrawl search ───
    try {
      const searchResult = await searchWeb('AI automation agency SaaS engineering tools 2026', { limit: 3, scrapeResults: false });
      if (searchResult.success && searchResult.data?.length) {
        report.push(`\n🔍 market pulse:`);
        for (const r of searchResult.data.slice(0, 3)) {
          const safeTitle = sanitizeForPrompt(r.title || '', 60);
          report.push(`  • ${safeTitle} — ${r.url}`);
        }
      }
    } catch (e) {
      // Non-critical, skip silently
    }

    // ─── 6. Send report ───
    if (errors.length > 0) {
      report.push(`\n⚠️ issues:\n${errors.join('\n')}`);
    }

    const fullReport = `hey, just ran my check —\n\n${report.join('\n')}`;

    if (MKT_BOT_TOKEN && MKT_CHAT_ID) {
      await sendTelegramMessage(MKT_BOT_TOKEN, MKT_CHAT_ID, fullReport);
    }
    if (ADMIN_BOT_TOKEN && ADMIN_CHAT_ID) {
      await sendTelegramMessage(ADMIN_BOT_TOKEN, ADMIN_CHAT_ID, `📣 marketing update:\n\n${report.join('\n')}`);
    }

    await logAynActivity(supabase, 'marketing_proactive_loop', fullReport.slice(0, 500), {
      target_type: 'marketing',
      details: {
        tweets_analyzed: ourTweets?.length || 0,
        competitors_analyzed: competitorResults.length,
        errors: errors.length,
      },
      triggered_by: 'cron',
    });

    await supabase.from('ayn_mind').insert({
      type: 'marketing_ayn',
      content: fullReport.slice(0, 4000),
      context: { source: 'proactive_loop', cycle_time: new Date().toISOString() },
      shared_with_admin: true,
    });

    console.log('[MARKETING-LOOP] Cycle complete.');
    return new Response(JSON.stringify({ success: true, report: report.join('\n') }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[MARKETING-LOOP] Fatal error:', error);
    return new Response(JSON.stringify({ error: 'Loop failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
