/**
 * Tool Handler — AYN tool definitions and execution for the ReACT tool loop.
 * Extracted from ayn-unified/index.ts.
 * 
 * Contains:
 * - AYN_TOOLS: OpenAI-format tool definitions
 * - executeTool: dispatches tool calls to data sources
 * - worldMonitorFetch: proxy to WorldMonitor edge function
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { performWebSearch } from "./searchHandler.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// ── Tool Definitions ────────────────────────────────────────
export const AYN_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_market_prices",
      description: "Gets the latest live prices for commodities, crypto, and currencies.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_business_news",
      description: "Gets the latest top business and market news headlines.",
      parameters: { 
        type: "object", 
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['US', 'SA']" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_geopolitical_risks",
      description: "Retrieves active conflicts, trade tensions, and sanctions globally.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live internet for ANY information you don't have — recent events, company details, people, regulations, technologies, market data. ALWAYS search when you're not 100% certain of current facts.",
      parameters: { 
        type: "object", 
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sector_intelligence",
      description: "Gets specific intelligence reports for various sectors: startups, jobs, supply_chain, real_estate, consumer, health, tech, energy, gov_policy, education.",
      parameters: { 
        type: "object", 
        properties: { sector: { type: "string", enum: ["startups", "jobs", "supply_chain", "real_estate", "consumer", "health", "tech", "energy", "gov_policy", "education"] } },
        required: ["sector"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_country_profile",
      description: "Gets deep intelligence on a specific country: economy, hot sectors, government reforms, regional dynamics.",
      parameters: {
        type: "object",
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['SA', 'US', 'AE']" } },
        required: ["country_codes"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_trade_flows",
      description: "Gets data on imports, exports, and trade dependencies for specific countries.",
      parameters: {
        type: "object",
        properties: { country_codes: { type: "array", items: { type: "string" }, description: "e.g. ['CN', 'SA']" } },
        required: ["country_codes"]
      }
    }
  },
  // ── WorldMonitor Live Intelligence Tools ──────────────────
  {
    type: "function",
    function: {
      name: "get_live_conflict_data",
      description: "Gets LIVE real-time conflict zone data: active war zones, escalation signals, ceasefire status.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_military_signals",
      description: "Gets live military deployment data: troop movements, naval positions, exercises, defense spending.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_maritime_intelligence",
      description: "Gets live maritime intelligence: AIS ship tracking, chokepoint status, port disruptions, piracy.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sanctions_data",
      description: "Searches live OFAC, EU, and UN sanctions lists for a specific entity.",
      parameters: {
        type: "object",
        properties: { entity: { type: "string", description: "Entity name or country to search" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cyber_threats",
      description: "Gets live cyberattack intelligence: APT groups, ransomware, infrastructure attacks.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_natural_disasters",
      description: "Gets live natural disaster data: earthquakes 5.0+, tsunamis, wildfires, volcanic eruptions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_infrastructure_status",
      description: "Gets live global infrastructure status: power outages, undersea cable cuts, data center incidents.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_global_forecast",
      description: "Gets AI-powered geopolitical forecasts: probability-weighted predictions for conflicts, elections, crises.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_aviation_intelligence",
      description: "Gets live aviation intelligence: airspace closures, NOTAM alerts, flight disruptions.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_satellite_imagery",
      description: "Gets satellite-derived intelligence: troop buildup, facility construction, movement patterns.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

// ── WorldMonitor Proxy ──────────────────────────────────────
async function worldMonitorFetch(domain: string, entity?: string): Promise<any> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const params = new URLSearchParams({ domain });
    if (entity) params.set('entity', entity);
    const res = await fetch(
      `${supabaseUrl}/functions/v1/worldmonitor-proxy?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return { status: 'WorldMonitor proxy error', http: res.status };
    return await res.json();
  } catch (err) {
    console.error(`[tool-handler] worldMonitorFetch(${domain}) error:`, err);
    return { status: 'WorldMonitor data temporarily unavailable', domain };
  }
}

// ── Tool Executor ───────────────────────────────────────────
export async function executeTool(toolCall: any, supabase: SupabaseClient): Promise<any> {
  const name = toolCall?.function?.name;
  let args: any = {};
  if (toolCall?.function?.arguments) {
    try { args = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
  }
  
  try {
    if (name === 'get_market_prices') {
      const { data } = await supabase.from('ayn_market_prices').select('*').eq('singleton_key', 1).maybeSingle();
      return data || { status: 'No data available' };
    }
    if (name === 'get_business_news') {
      const codes = args.country_codes || ['US', 'SA', 'GB'];
      const { data } = await supabase.from('ayn_business_news').select('*').in('country_code', codes).limit(5);
      return data || { status: 'No news found' };
    }
    if (name === 'get_geopolitical_risks') {
      const { data } = await supabase.from('ayn_geopolitical').select('*').eq('singleton_key', 1).maybeSingle();
      return data || { status: 'No data' };
    }
    if (name === 'search_web' && args.query) {
      const res = await performWebSearch(args.query);
      return { search_results: res };
    }
    if (name === 'get_sector_intelligence') {
      const sec = args.sector;
      if (sec === 'startups') return (await supabase.from('ayn_startup_intel').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'supply_chain') return (await supabase.from('ayn_supply_chain').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'tech') return (await supabase.from('ayn_tech_disruption').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'jobs') return (await supabase.from('ayn_job_market').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'real_estate') return (await supabase.from('ayn_real_estate').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'consumer') return (await supabase.from('ayn_consumer_sentiment').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'health') return (await supabase.from('ayn_health_intel').select('*').in('country_code', ['SA', 'US']).limit(2)).data;
      if (sec === 'energy') return (await supabase.from('ayn_business_news').select('*').ilike('category', '%energy%').limit(2)).data || { status: 'No specific energy intel found' };
      if (sec === 'gov_policy') return (await supabase.from('ayn_geopolitical').select('*').eq('singleton_key', 1).maybeSingle()).data;
      if (sec === 'education') return { status: 'Education sector focus is emerging, check cross-sector tech/startup data.' };
      return { status: 'Sector not found' };
    }
    if (name === 'get_country_profile') {
      const codes = args.country_codes || [];
      if (codes.length === 0) return { status: 'No country codes provided' };
      const { data } = await supabase.from('ayn_country_intelligence').select('country_code, country_name, region, economy, government, hot_sectors, opportunities, intelligence_brief').in('country_code', codes);
      return data || { status: 'No profiles found' };
    }
    if (name === 'get_trade_flows') {
      const codes = args.country_codes || [];
      if (codes.length === 0) return { status: 'No country codes provided' };
      const { data } = await supabase.from('ayn_trade_flows').select('country_code, country_name, top_exports, top_imports, opportunities, dependencies, intelligence_brief').in('country_code', codes);
      return data || { status: 'No trade data found' };
    }
    // WorldMonitor Live Tools
    if (name === 'get_live_conflict_data') return await worldMonitorFetch('conflict');
    if (name === 'get_military_signals') return await worldMonitorFetch('military');
    if (name === 'get_maritime_intelligence') return await worldMonitorFetch('maritime');
    if (name === 'get_sanctions_data') return await worldMonitorFetch('sanctions', args.entity);
    if (name === 'get_cyber_threats') return await worldMonitorFetch('cyber');
    if (name === 'get_natural_disasters') {
      const [seismo, wildfire] = await Promise.all([worldMonitorFetch('seismology'), worldMonitorFetch('wildfire')]);
      return { earthquakes: seismo, wildfires: wildfire };
    }
    if (name === 'get_infrastructure_status') return await worldMonitorFetch('infrastructure');
    if (name === 'get_global_forecast') return await worldMonitorFetch('forecast');
    if (name === 'get_aviation_intelligence') return await worldMonitorFetch('aviation');
    if (name === 'get_satellite_imagery') return await worldMonitorFetch('satellite');
  } catch (err) {
    return { error: String(err) };
  }
  return { status: 'Tool not recognized or arguments missing.' };
}
