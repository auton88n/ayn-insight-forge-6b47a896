/**
 * Search Handler — web search and URL scraping.
 * Extracted from ayn-unified/index.ts (was lines 447-482, 2154-2226).
 */

// ── Web Search via Firecrawl ────────────────────────────────
export async function performWebSearch(query: string): Promise<string> {
  try {
    const { searchWeb } = await import("../_shared/firecrawlHelper.ts");
    const { sanitizeForPrompt } = await import("../_shared/sanitizeFirecrawl.ts");
    const results = await searchWeb(query, { limit: 5 });
    
    if (!results.success || !results.data?.length) {
      return 'No search results found.';
    }

    return results.data.map((r: { title: string; description: string; url: string }) =>
      `- ${sanitizeForPrompt(r.title, 200)}: ${sanitizeForPrompt(r.description, 300)} (${r.url})`
    ).join('\n');
  } catch (err) {
    console.error('[search-handler] Web search failed:', err);
    return 'Search failed.';
  }
}

// ── URL Scraping ────────────────────────────────────────────
export async function scrapeAndInjectUrl(url: string): Promise<string | null> {
  try {
    const { scrapeUrl: scrapeUrlFn } = await import("../_shared/firecrawlHelper.ts");
    const { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } = await import("../_shared/sanitizeFirecrawl.ts");
    
    const cleanUrl = url.replace(/[.,;!?]$/, '');
    const scraped = await scrapeUrlFn(cleanUrl);
    
    if (!scraped.success || !scraped.markdown) return null;

    const title = scraped.metadata?.title || cleanUrl;
    const safeContent = sanitizeForPrompt(scraped.markdown, 4000);
    return `\n\n${FIRECRAWL_CONTENT_GUARD}\nWEBSITE CONTENT (user shared: "${title}"):\n${safeContent}\n\nAnswer based on this content. If the user asked something about it, use this. If they just shared it without a question, summarize what it is.`;
  } catch (err) {
    console.warn('[search-handler] URL scrape failed:', err);
    return null;
  }
}

// ── Relevance Check: Does the message need live web data? ───
export function needsWebLookup(msg: string): boolean {
  const l = msg.toLowerCase();
  // Skip: clearly conversational or creative
  const skip = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|nice|cool)/i,
    /make.*image|generate.*image|create.*image|draw/i,
    /make.*pdf|create.*pdf|generate.*pdf|make.*excel|create.*excel/i,
    /how are you|what can you do|who are you|what is ayn/i,
  ];
  if (skip.some(r => r.test(l))) return false;
  
  // Search: current data, prices, news, people, events
  const search = [
    /\b(today|tonight|yesterday|this week|this month|right now|currently|latest|recent|news|breaking)\b/i,
    /\b(price|stock|crypto|bitcoin|btc|eth|market|rate|exchange|gold|oil)\b/i,
    /\b(weather|temperature|forecast)\b/i,
    /\b(who is|who are|is .* still|does .* still)\b/i,
    /\b(ceo|president|prime minister|founder|owner|chairman)\b/i,
    /\b(what happened|what is happening|when did|when is|where is|how much is|how many)\b/i,
    /\b(score|result|winner|champion|standings|match|game)\b/i,
    /\b(competitors|competition|startup|company|fundraising|investors|venture capital|series a|seed round)\b/i,
    /\b(regulation|law|legal|compliance|taxes|policies|zatca|misa|pif)\b/i,
    /\b(vision 2030|giga project|neom|qiddiya|red sea project|saudization)\b/i,
    /\b(سعر|اخبار|اليوم|الان|حاليا|من هو|ما هو|كم|نتيجة|شركة|منافسين|استثمار|رؤية 2030|نظام|قانون)\b/i,
  ];
  if (search.some(r => r.test(l))) return true;
  
  // Long questions ending with ? about the world or business
  if (msg.trim().endsWith('?') && msg.split(' ').length > 5) return true;
  return false;
}
