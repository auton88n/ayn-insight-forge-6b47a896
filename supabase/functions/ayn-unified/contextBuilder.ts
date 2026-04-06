/**
 * Context Builder — gathers market data, user context, intelligence, and trading data.
 * Extracted from ayn-unified/index.ts
 *
 * UNIFIED LIMIT SYSTEM: checkUserLimit now calls check_user_ai_limit RPC exclusively.
 * This is the single source of truth for ALL tiers (free daily, paid monthly, unlimited).
 * The edge function and frontend both use the same RPC — no dual-system, no sync issues.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

type SupabaseClient = ReturnType<typeof createClient>;

// ── Market Snapshot ──────────────────────────────────────────────────────────
export async function getMarketSnapshot(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase.from('ayn_market_snapshot').select('*').limit(1).maybeSingle();
    if (!data) return {};
    const ageHours = data.updated_at
      ? Math.round((Date.now() - new Date(data.updated_at).getTime()) / 3600000)
      : null;
    return { ...data, snapshot_age_hours: ageHours };
  } catch { return {}; }
}

// ── User Context (memories, preferences) ────────────────────────────────────
export async function getUserContext(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  try {
    const [memoryRes, prefRes] = await Promise.all([
      supabase.from('user_memory').select('key,value').eq('user_id', userId).limit(20),
      supabase.from('user_preferences').select('key,value').eq('user_id', userId).limit(10),
    ]);
    return {
      memories: memoryRes.data || [],
      preferences: prefRes.data || [],
    };
  } catch { return {}; }
}

// ── Market Prices ────────────────────────────────────────────────────────────
export async function getMarketPrices(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase.from('ayn_market_prices').select('*').limit(1).maybeSingle();
    return data || {};
  } catch { return {}; }
}

// ── Trade Flows ──────────────────────────────────────────────────────────────
export async function getTradeFlows(supabase: SupabaseClient, countryCodes: string[]): Promise<Record<string, unknown>[]> {
  if (!countryCodes.length) return [];
  try {
    const { data } = await supabase
      .from('ayn_trade_flows')
      .select('*')
      .in('country_code', countryCodes)
      .limit(10);
    return data || [];
  } catch { return []; }
}

// ── Country Intelligence ─────────────────────────────────────────────────────
export async function getCountryIntelligence(supabase: SupabaseClient, countryCodes: string[]): Promise<Record<string, unknown>[]> {
  if (!countryCodes.length) return [];
  try {
    const { data } = await supabase
      .from('ayn_country_intelligence')
      .select('*')
      .in('country_code', countryCodes);
    return data || [];
  } catch { return []; }
}

// ── Country Detection ────────────────────────────────────────────────────────
const COUNTRY_PATTERNS: Record<string, string[]> = {
  SA: ['saudi', 'ksa', 'riyadh', 'jeddah', 'dammam', 'السعودية', 'الرياض', 'جدة'],
  AE: ['uae', 'emirates', 'dubai', 'abu dhabi', 'الامارات', 'دبي'],
  US: ['usa', 'united states', 'america', 'american', 'امريكا'],
  GB: ['uk', 'united kingdom', 'britain', 'british', 'london', 'بريطانيا'],
  CN: ['china', 'chinese', 'beijing', 'shanghai', 'الصين'],
  IN: ['india', 'indian', 'mumbai', 'delhi', 'الهند'],
  JP: ['japan', 'japanese', 'tokyo', 'اليابان'],
  DE: ['germany', 'german', 'berlin', 'المانيا'],
  FR: ['france', 'french', 'paris', 'فرنسا'],
  CA: ['canada', 'canadian', 'toronto', 'كندا'],
  EG: ['egypt', 'egyptian', 'cairo', 'مصر', 'القاهرة'],
  QA: ['qatar', 'qatari', 'doha', 'قطر'],
  KW: ['kuwait', 'kuwaiti', 'الكويت'],
  BH: ['bahrain', 'bahraini', 'البحرين'],
  OM: ['oman', 'omani', 'muscat', 'عمان'],
  JO: ['jordan', 'jordanian', 'amman', 'الأردن'],
  TR: ['turkey', 'turkish', 'istanbul', 'ankara', 'تركيا'],
};

export function detectCountries(message: string): string[] {
  const lower = message.toLowerCase();
  const found: string[] = [];
  for (const [code, patterns] of Object.entries(COUNTRY_PATTERNS)) {
    if (patterns.some(p => lower.includes(p))) found.push(code);
  }
  return found;
}

// ── Market Data Relevance ────────────────────────────────────────────────────
export function needsMarketData(message: string): boolean {
  return /\b(price|gold|oil|silver|commodity|currency|exchange rate|dollar|rial|bitcoin|crypto|market|سعر|ذهب|نفط|عملة|دولار|ريال)\b/i.test(message);
}

// ── Intelligence Context Builder ─────────────────────────────────────────────
export function buildIntelligenceContext(
  marketSnapshot: Record<string, unknown>,
  countryProfiles: Record<string, unknown>[],
  marketPrices: Record<string, unknown>,
  tradeFlows: Record<string, unknown>[],
): string {
  let ctx = '';

  const brief = marketSnapshot.intelligence_brief as string[] || [];
  if (brief.length > 0) {
    ctx += `\n\nBACKGROUND INTELLIGENCE (for context only — do NOT recite unless user asks about markets/world events):\n${brief.join('\n')}\n\nRULE: Only use when user asks about markets, business, world events. Never cite unprompted.`;
  }

  if (countryProfiles.length > 0) {
    ctx += '\n\nCOUNTRY INTELLIGENCE PROFILES (live data):';
    for (const profile of countryProfiles) {
      const b = (profile.intelligence_brief as string[]) || [];
      const age = profile.fetched_at
        ? `updated ${Math.round((Date.now() - new Date(profile.fetched_at as string).getTime()) / 3600000)}h ago`
        : '';
      ctx += `\n\n${profile.country_name} (${age}):`;
      if (b.length > 0) ctx += '\n' + b.slice(0, 8).join('\n');
      const hot = profile.hot_sectors as any[];
      if (hot?.length > 0) ctx += `\nHot sectors: ${hot[0].snippet || hot[0].title || ''}`;
      const opps = profile.opportunities as any[];
      if (opps?.length > 0) ctx += `\nMarket gap: ${opps[0].snippet || opps[0].title || ''}`;
    }
  }

  const prices = marketPrices as any;
  if (prices && Object.keys(prices).length > 0) {
    const narrative = (prices.narrative as string[]) || [];
    const corr = (prices.correlations as any)?.signals || [];
    if (narrative.length > 0) ctx += `\n\nLIVE COMMODITY & MARKET PRICES:\n${narrative.slice(0, 15).join('\n')}`;
    if (corr.length > 0) ctx += `\n\nMARKET CORRELATIONS:\n${corr.join('\n')}`;
  }

  if (tradeFlows.length > 0) {
    ctx += '\n\nTRADE FLOWS:';
    for (const flow of tradeFlows) {
      const b = (flow.intelligence_brief as string[]) || [];
      if (b.length > 0) ctx += '\n' + b.join('\n');
      const exports = flow.top_exports as any[];
      const imports = flow.top_imports as any[];
      if (exports?.length > 0) ctx += `\nTop exports: ${exports.slice(0, 2).map((e: any) => e.snippet || e.title).join(' | ')}`;
      if (imports?.length > 0) ctx += `\nTop imports: ${imports.slice(0, 2).map((i: any) => i.snippet || i.title).join(' | ')}`;
    }
  }

  return ctx;
}

// ── UNIFIED User Limit Check ─────────────────────────────────────────────────
// THE ONLY LIMIT CHECK. Calls check_user_ai_limit RPC which handles:
//   - Free:       5 msgs/day (daily reset) + bonus credits (permanent pool)
//   - Starter:    200 msgs/month
//   - Pro:        1,000 msgs/month
//   - Business:   5,000 msgs/month
//   - Enterprise: unlimited
//   - Unlimited:  unlimited
// The RPC both CHECKS and INCREMENTS atomically.
// Frontend must NOT call check_user_ai_limit separately before sending —
// that would double-count. Frontend reads from user_ai_limits table directly
// for display only (useUsageTracking hook).
export async function checkUserLimit(
  supabase: SupabaseClient,
  userId: string,
  intent: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc('check_user_ai_limit', {
      _user_id: userId,
      _intent_type: intent || 'chat',
    });

    if (error) {
      console.error('[checkUserLimit] RPC error:', error.message);
      return { allowed: true }; // Fail open — never block user due to our bug
    }

    if (!data?.allowed) {
      return { allowed: false, reason: data?.error || 'Limit reached' };
    }

    return { allowed: true };
  } catch (e) {
    console.error('[checkUserLimit] Exception:', e);
    return { allowed: true }; // Fail open
  }
}

// ── Credit Warning ───────────────────────────────────────────────────────────
export async function checkAndSendCreditWarning(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('user_ai_limits')
      .select('monthly_messages, current_monthly_messages, is_unlimited')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data || data.is_unlimited) return;

    const limit = data.monthly_messages || 50;
    const used = data.current_monthly_messages || 0;
    const pct = (used / limit) * 100;

    if (pct >= 80) {
      const { data: existing } = await supabase
        .from('admin_notification_log')
        .select('id')
        .eq('user_id', userId)
        .eq('notification_type', 'credit_warning')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
        .limit(1);

      if (!existing?.length) {
        await supabase.from('admin_notification_log').insert({
          user_id: userId,
          notification_type: 'credit_warning',
          details: { used, limit, pct: Math.round(pct) },
        });
      }
    }
  } catch { /* silent */ }
}
