/**
 * Shared Twitter analysis helper using Gemini via Lovable AI Gateway.
 * Analyzes existing data from the database instead of live scraping.
 */

export interface TweetAnalysis {
  top_performing: string[];
  weak_performers: string[];
  best_hooks: string[];
  recommended_topics: string[];
  engagement_trend: 'up' | 'down' | 'stable' | 'unknown';
  summary: string;
}

export interface CompetitorAnalysis {
  handle: string;
  top_content: string[];
  avg_engagement: number;
  content_patterns: string[];
}

/**
 * Use Gemini to analyze our existing tweet data from the DB.
 */
export async function analyzeOurTweets(
  tweets: Array<{ content: string; impressions?: number; likes?: number; retweets?: number; replies?: number; status?: string; created_at?: string }>,
  apiKey: string
): Promise<TweetAnalysis> {
  if (!tweets.length) {
    return {
      top_performing: [],
      weak_performers: [],
      best_hooks: [],
      recommended_topics: [],
      engagement_trend: 'unknown',
      summary: 'no tweet data to analyze yet',
    };
  }

  const tweetList = tweets.map(t => {
    const eng = `${t.likes || 0}❤️ ${t.retweets || 0}🔁 ${t.replies || 0}💬 ${t.impressions || 0}👀`;
    return `- "${t.content?.slice(0, 120)}" [${eng}] (${t.status || 'unknown'})`;
  }).join('\n');

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `You're a Twitter/X strategist. Analyze these tweets and return ONLY valid JSON (no markdown, no backticks) with this structure:
{
  "top_performing": ["tweet excerpts that got best engagement"],
  "weak_performers": ["tweet excerpts that underperformed"],
  "best_hooks": ["the opening hooks that worked"],
  "recommended_topics": ["topics we should tweet about next"],
  "engagement_trend": "up" | "down" | "stable",
  "summary": "1-2 sentence takeaway"
}`,
        }, {
          role: 'user',
          content: `Analyze these tweets:\n${tweetList}`,
        }],
      }),
    });

    if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Clean any markdown wrapping
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned) as TweetAnalysis;
  } catch (e) {
    console.error('Tweet analysis failed:', e);
    return {
      top_performing: [],
      weak_performers: [],
      best_hooks: [],
      recommended_topics: [],
      engagement_trend: 'unknown',
      summary: `analysis failed: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

/**
 * Use Gemini to analyze competitor tweets stored in the DB.
 */
export async function analyzeCompetitorData(
  competitorTweets: Array<{ handle: string; content: string; likes: number; retweets: number }>,
  apiKey: string
): Promise<CompetitorAnalysis[]> {
  if (!competitorTweets.length) return [];

  // Group by handle
  const grouped: Record<string, typeof competitorTweets> = {};
  for (const t of competitorTweets) {
    if (!grouped[t.handle]) grouped[t.handle] = [];
    grouped[t.handle].push(t);
  }

  const results: CompetitorAnalysis[] = [];
  for (const [handle, tweets] of Object.entries(grouped)) {
    const avgEng = Math.round(tweets.reduce((s, t) => s + (t.likes || 0), 0) / tweets.length);
    const topTweets = tweets.sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);

    results.push({
      handle,
      top_content: topTweets.map(t => t.content?.slice(0, 100) || ''),
      avg_engagement: avgEng,
      content_patterns: [], // filled by higher-level analysis
    });
  }

  return results;
}

/**
 * Use Gemini to generate tweet drafts based on analysis.
 */
export async function generateTweetDrafts(
  context: { ourAnalysis: TweetAnalysis; competitors: CompetitorAnalysis[]; additionalContext?: string },
  apiKey: string
): Promise<string[]> {
  const prompt = buildDraftPrompt(context);

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `You're AYN's content creator. Write 2 tweet drafts under 280 chars each. Format each as:
DRAFT: "tweet text here"

Rules:
- Strong hooks (first 5 words matter most)
- No hashtags unless absolutely necessary
- Sound human, not corporate
- Each tweet should be different in style (one direct, one thought-provoking)`,
        }, {
          role: 'user',
          content: prompt,
        }],
      }),
    });

    if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const drafts: string[] = [];
    const matches = content.matchAll(/DRAFT:\s*"([^"]{10,280})"/g);
    for (const m of matches) {
      drafts.push(m[1].trim());
    }
    return drafts;
  } catch (e) {
    console.error('Draft generation failed:', e);
    return [];
  }
}

function buildDraftPrompt(context: { ourAnalysis: TweetAnalysis; competitors: CompetitorAnalysis[]; additionalContext?: string }): string {
  let prompt = '';

  if (context.ourAnalysis.summary) {
    prompt += `Our performance: ${context.ourAnalysis.summary}\n`;
  }
  if (context.ourAnalysis.best_hooks.length) {
    prompt += `Our best hooks: ${context.ourAnalysis.best_hooks.join(', ')}\n`;
  }
  if (context.ourAnalysis.recommended_topics.length) {
    prompt += `Suggested topics: ${context.ourAnalysis.recommended_topics.join(', ')}\n`;
  }
  if (context.competitors.length) {
    prompt += `\nCompetitor insights:\n`;
    for (const c of context.competitors) {
      prompt += `@${c.handle} (avg ${c.avg_engagement} likes): ${c.top_content.join(' | ')}\n`;
    }
  }
  if (context.additionalContext) {
    prompt += `\n${context.additionalContext}`;
  }

  prompt += `\nWrite 2 tweet drafts that would outperform what we've been posting.`;
  return prompt;
}
