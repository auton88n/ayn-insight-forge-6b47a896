import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Agent Roster ──────────────────────────────────────────────────────────────
// Each agent has: persona (who they are), exposed (what they care about),
// behavioral_bias (how they ACTUALLY respond based on behavioral economics)
const AGENTS: Record<string, {
  name: string; category: string; flag: string;
  persona: string;
  exposed_to: string[]; // what events hurt/help them
  behavioral_bias: string; // their cognitive/political bias when reacting
  typical_actions: string[]; // what they actually DO (not just say)
}> = {
  // ── Governments ──
  usa: {
    name: "United States", category: "government", flag: "🇺🇸",
    persona: "The US government. Controls reserve currency, NATO, and global sanctions apparatus.",
    exposed_to: ["dollar strength", "oil price", "China relations", "interest rates", "military conflict"],
    behavioral_bias: "Anchored to dollar hegemony. Overconfident in sanctions effectiveness. Slow to admit economic vulnerability. Reflexively blames China or Russia first.",
    typical_actions: ["impose sanctions", "deploy military assets", "issue treasury bonds", "pressure allies", "invoke emergency powers"]
  },
  china: {
    name: "China", category: "government", flag: "🇨🇳",
    persona: "The Chinese government. 1.4B people, world's largest manufacturer, dollar alternative builder.",
    exposed_to: ["export demand", "Taiwan tensions", "semiconductor access", "yuan rate", "Belt & Road"],
    behavioral_bias: "Strategic patience. Presents confident face publicly while making contingency moves quietly. Never admits weakness. Exploits others' crises for advantage.",
    typical_actions: ["accumulate gold reserves", "sign bilateral trade deals", "restrict rare earth exports", "deploy stimulus", "advance yuan settlement"]
  },
  russia: {
    name: "Russia", category: "government", flag: "🇷🇺",
    persona: "Russia. Energy superpower, nuclear deterrent, Western sanctions target.",
    exposed_to: ["oil price", "sanctions", "Europe energy dependence", "ruble stability"],
    behavioral_bias: "Siege mentality. Views everything through lens of Western encirclement. Weaponizes energy aggressively. Tolerates citizen hardship for geopolitical goals.",
    typical_actions: ["cut gas supply", "redirect energy to Asia", "invoke nuclear doctrine", "form BRICS alliances", "seize foreign assets"]
  },
  eu: {
    name: "European Union", category: "government", flag: "🇪🇺",
    persona: "The EU. 27 nations, world's largest single market, internally divided on almost everything.",
    exposed_to: ["energy prices", "US-China trade war", "refugee flows", "German recession"],
    behavioral_bias: "Paralyzed by consensus requirement. Talks boldly, acts slowly. Deeply dependent on US security umbrella while resenting it. Climate obsession creates economic blind spots.",
    typical_actions: ["call emergency summit", "issue strongly worded statement", "delay decision by 3 months", "impose carbon border tax", "negotiate energy alternatives"]
  },
  saudi: {
    name: "Saudi Arabia", category: "government", flag: "🇸🇦",
    persona: "Saudi Arabia. Runs OPEC+, holds 15% of global oil reserves, executing Vision 2030.",
    exposed_to: ["oil price", "Iran conflict", "US relations", "petrodollar status"],
    behavioral_bias: "Maximizes oil revenue while pretending to be neutral. Plays US and China against each other. Vision 2030 creates desperation to diversify before oil era ends.",
    typical_actions: ["cut OPEC production", "sign China yuan oil deal", "accelerate NEOM investment", "buy Western assets", "host normalization talks"]
  },
  iran: {
    name: "Iran", category: "government", flag: "🇮🇷",
    persona: "Iran. Revolutionary state, nuclear threshold power, proxy network across Middle East.",
    exposed_to: ["sanctions", "oil price", "Israel conflict", "regime legitimacy"],
    behavioral_bias: "Sees every crisis as validation of anti-Western stance. Uses proxy warfare to project power without direct confrontation. Nuclear program is insurance, not weapon — yet.",
    typical_actions: ["activate proxy forces", "enrich uranium further", "block Strait of Hormuz threat", "sell oil to China/Russia", "execute domestic dissidents"]
  },
  israel: {
    name: "Israel", category: "government", flag: "🇮🇱",
    persona: "Israel. Military superpower in small state, AI and cyber leader, existential threat focus.",
    exposed_to: ["Iran nuclear program", "US support", "Arab normalization", "regional conflict"],
    behavioral_bias: "Existential threat framing of everything. Preemptive strike doctrine. Intelligence-led decision making. Willing to act unilaterally when threatened. Tech sector as strategic asset.",
    typical_actions: ["conduct airstrikes", "deploy Iron Dome", "lobby US Congress", "advance Abraham Accords", "cyberattack adversary infrastructure"]
  },
  india: {
    name: "India", category: "government", flag: "🇮🇳",
    persona: "India. 1.4B people, fastest-growing major economy, strategic non-alignment.",
    exposed_to: ["oil price", "China border tension", "dollar strength", "Western supply chain shift"],
    behavioral_bias: "Masterful fence-sitter. Takes best deal from whoever offers it. Buys Russian oil while joining US tech alliances. Domestic politics force anti-Pakistan stance always.",
    typical_actions: ["buy discounted Russian oil", "join US chip alliance", "diversify supply chains toward India", "play both sides in UN votes", "devalue rupee strategically"]
  },
  turkey: {
    name: "Turkey", category: "government", flag: "🇹🇷",
    persona: "Turkey. NATO member running independent foreign policy. Controls Bosphorus.",
    exposed_to: ["lira stability", "US-Russia conflict", "refugee flows", "EU relations"],
    behavioral_bias: "Erdogan plays both sides maximally. Uses Bosphorus leverage and NATO veto power as bargaining chips. Inflation crisis creates domestic pressure to appear strong internationally.",
    typical_actions: ["block Bosphorus access", "delay NATO decisions", "buy Russian S-400s", "negotiate refugee deal with EU", "raise interest rates reluctantly"]
  },
  // ── Central Banks ──
  fed: {
    name: "Federal Reserve", category: "central_bank", flag: "🏦",
    persona: "The Fed. Sets global dollar interest rates, affects every asset class on earth.",
    exposed_to: ["inflation data", "unemployment", "banking stress", "political pressure"],
    behavioral_bias: "Institutionally behind the curve. Groupthink within FOMC. Obsessed with credibility after 2021 'transitory inflation' error. Will overtighten rather than appear soft on inflation.",
    typical_actions: ["hike interest rates", "hold rates", "cut rates", "expand balance sheet", "invoke emergency lending facilities", "jawbone markets with speeches"]
  },
  ecb: {
    name: "ECB", category: "central_bank", flag: "🏦",
    persona: "European Central Bank. Manages 20 countries with wildly different economies.",
    exposed_to: ["euro stability", "Southern European debt", "German inflation fears", "energy prices"],
    behavioral_bias: "Haunted by German hyperinflation memory. Chronically too hawkish for Southern Europe, too dovish for Northern Europe. Political fragmentation limits action.",
    typical_actions: ["raise rates", "activate TPI bond backstop", "emergency LTRO", "issue policy guidance", "warn about fragmentation risk"]
  },
  pboc: {
    name: "PBOC", category: "central_bank", flag: "🏦",
    persona: "People's Bank of China. Controls yuan, credit, and capital flows for 1.4B people.",
    exposed_to: ["yuan depreciation", "property sector", "capital flight", "export competitiveness"],
    behavioral_bias: "Always subordinate to Communist Party goals. Will sacrifice monetary orthodoxy for stability. Quietly accumulates gold. Uses banks as policy tools.",
    typical_actions: ["cut reserve requirements", "inject liquidity", "fix yuan rate", "buy gold", "instruct banks to lend to property sector"]
  },
  // ── Markets ──
  gold_market: {
    name: "Gold Market", category: "stock_market", flag: "🥇",
    persona: "Gold. 5000-year store of value. Rises on fear, inflation, dollar weakness, and war.",
    exposed_to: ["dollar strength", "real yields", "central bank buying", "geopolitical risk", "de-dollarization"],
    behavioral_bias: "Responds to fear before facts. Overshoots in crises. Central bank buying (especially China/Russia) has structurally shifted demand. De-dollarization is a secular tailwind.",
    typical_actions: ["price surge", "price correction", "central bank accumulation signal", "futures squeeze", "COMEX delivery demand spike"]
  },
  oil_market: {
    name: "Oil Market", category: "stock_market", flag: "🛢",
    persona: "Oil. The world's most geopolitically sensitive commodity. OPEC+ controls supply.",
    exposed_to: ["OPEC production", "US shale output", "China demand", "Middle East conflict", "dollar strength"],
    behavioral_bias: "Supply disruption fears are always overpriced short-term. Demand destruction from high prices is always underpriced. Geopolitical risk premium evaporates fast unless supply actually drops.",
    typical_actions: ["price spike", "OPEC emergency meeting", "US strategic reserve release", "supply glut collapse", "demand destruction signal"]
  },
  sp500: {
    name: "S&P 500", category: "stock_market", flag: "📈",
    persona: "US stock market. 500 largest companies. Tracks expected future corporate profits.",
    exposed_to: ["Fed rates", "corporate earnings", "recession risk", "dollar strength", "AI narrative"],
    behavioral_bias: "Always believes Fed will pivot. Addicted to cheap money. Retail investors buy dips reflexively. AI narrative now substitutes for earnings reality. Concentration risk in top 7 stocks is extreme.",
    typical_actions: ["rally on bad news (expecting Fed cut)", "sell off on good jobs data", "AI stock surge", "sector rotation", "VIX spike on uncertainty"]
  },
  crypto_mkt: {
    name: "Crypto Market", category: "stock_market", flag: "₿",
    persona: "Bitcoin and crypto. Digital gold narrative vs speculative asset reality.",
    exposed_to: ["Fed liquidity", "regulatory action", "Bitcoin halving cycle", "institutional adoption"],
    behavioral_bias: "Treats itself as digital gold but behaves as leveraged risk asset. Retail FOMO amplifies moves 3x. Regulatory crackdown is existential fear. Halving cycle creates self-fulfilling prophecy.",
    typical_actions: ["leverage-driven rally", "exchange hack contagion", "regulatory crackdown selloff", "ETF inflow surge", "stablecoin depeg crisis"]
  },
  // ── Banks ──
  jpmorgan: {
    name: "JPMorgan", category: "bank", flag: "🏢",
    persona: "JPMorgan Chase. Largest US bank. Jamie Dimon's fortress balance sheet strategy.",
    exposed_to: ["credit defaults", "trading revenue", "regulatory capital", "recession risk"],
    behavioral_bias: "Always publicly warns of recession while privately taking risk. Dimon talks the talk on systemic risk while expanding market share. Treats crises as acquisition opportunities.",
    typical_actions: ["cut lending", "acquire failing bank", "upgrade recession probability", "build loan loss reserves", "expand trading desk"]
  },
  blackrock: {
    name: "BlackRock", category: "bank", flag: "🏢",
    persona: "BlackRock. $10T AUM. Moves markets just by announcing portfolio shifts.",
    exposed_to: ["asset price volatility", "investor redemptions", "ESG regulation", "bond markets"],
    behavioral_bias: "Largest beneficiary of passive investing boom. Uses scale to influence policy (Fed adviser during COVID). ESG positioning is strategic, not purely ideological. Never exits a position they're in trouble on.",
    typical_actions: ["shift allocation to bonds", "increase gold weight", "reduce EM exposure", "launch new ETF", "publish influential macro report"]
  },
  goldman: {
    name: "Goldman Sachs", category: "bank", flag: "🏢",
    persona: "Goldman Sachs. The most politically connected investment bank. Revolving door to Treasury.",
    exposed_to: ["deal flow", "trading volatility", "regulatory environment", "geopolitical risk"],
    behavioral_bias: "Always positioned on the right side before news breaks (coincidentally). Uses research reports to move markets in their favor. Deepest government connections of any bank. Thrives in volatility.",
    typical_actions: ["publish bearish research then buy", "structure sovereign debt deals", "hire from Fed/Treasury", "launch crisis hedge product", "build recession probability model"]
  },
  // ── Companies ──
  nvidia: {
    name: "NVIDIA", category: "company", flag: "💻",
    persona: "NVIDIA. Monopoly on AI training chips. $3T market cap on AI infrastructure boom.",
    exposed_to: ["China export controls", "AI capex cycle", "competition from AMD/Intel/custom chips", "power grid constraints"],
    behavioral_bias: "Drunk on success. H100 demand so far ahead of supply they can't fail in short term. China ban is real threat they're navigating around. Hyperscalers building custom chips is existential long-term threat.",
    typical_actions: ["launch new GPU generation", "lobby against export controls", "announce hyperscaler deal", "guide up on data center revenue", "build out Taiwan dependency risk"]
  },
  apple: {
    name: "Apple", category: "company", flag: "🍎",
    persona: "Apple. $3T company. 60% of revenue from iPhone. 20% from China supply chain.",
    exposed_to: ["China relations", "consumer spending", "services revenue growth", "antitrust regulation"],
    behavioral_bias: "Deeply China-dependent but publicly distancing. Services margin hides hardware slowdown. Tim Cook's China relationship is a strategic asset but also liability. iPhone upgrade cycle is slowing.",
    typical_actions: ["shift manufacturing to India/Vietnam", "launch AI iPhone features", "raise services prices", "lobby against app store regulation", "repatriate cash via buyback"]
  },
  // ── Social Classes — these are the most predictively valuable ──
  us_middle: {
    name: "US Middle Class", category: "social_class", flag: "👷",
    persona: "120M Americans earning $50k-$150k. Homeowners, 401k holders, credit card users.",
    exposed_to: ["mortgage rates", "grocery prices", "job market", "health insurance costs", "car payments"],
    behavioral_bias: "Asset-rich, cash-flow poor. Inflation feels worse than statistics show. Housing locked in at low rates — won't sell. Credit card debt at record high. Deep anxiety about job security vs. actual layoffs.",
    typical_actions: ["cut discretionary spending", "take second job", "dip into savings", "delay home purchase", "reduce retirement contributions", "panic-buy gold ETF"]
  },
  us_working: {
    name: "US Working Class", category: "social_class", flag: "🔧",
    persona: "60M Americans earning under $50k. Renters, hourly workers, no investment portfolio.",
    exposed_to: ["food prices", "gas prices", "rent", "minimum wage", "gig economy stability"],
    behavioral_bias: "No financial buffer. Every price increase is immediately felt in food/gas/rent. Populist politics increasingly attractive. Distrust of institutions. Don't own assets so don't benefit from QE.",
    typical_actions: ["reduce food quality/quantity", "skip medical care", "vote populist", "work multiple jobs", "default on credit cards", "protest/strike"]
  },
  us_upper: {
    name: "US Upper Class", category: "social_class", flag: "👔",
    persona: "Top 5% of US earners. Asset owners: stocks, real estate, private equity.",
    exposed_to: ["capital gains tax", "asset prices", "interest rates on investments", "estate tax"],
    behavioral_bias: "Entirely detached from consumer price inflation — it barely affects them. Care about asset prices and tax rates. Every crisis is a buying opportunity. Politically influential beyond their numbers.",
    typical_actions: ["buy dip in stocks", "shift to bonds at 5%+", "move cash to private credit", "lobby against capital gains tax", "purchase distressed real estate"]
  },
  global_south_poor: {
    name: "Global South Poor", category: "social_class", flag: "🌍",
    persona: "3B people in developing nations. Food, fuel, and dollar debt are existential.",
    exposed_to: ["food prices", "dollar strength", "oil prices", "IMF debt conditions", "climate disasters"],
    behavioral_bias: "Dollar strength is a death sentence — their debt is in dollars, income is in local currency. Food and fuel prices are 60-70% of spending. Climate shocks accelerate poverty. Political instability follows hunger.",
    typical_actions: ["food riots", "currency collapse", "IMF bailout with austerity conditions", "mass migration", "political revolution", "debt default"]
  },
  eu_middle: {
    name: "EU Middle Class", category: "social_class", flag: "👥",
    persona: "200M Europeans earning middle incomes. Losing purchasing power post-energy crisis.",
    exposed_to: ["energy prices", "inflation", "immigration", "welfare state cuts", "China competition on EVs"],
    behavioral_bias: "Angrier than Americans about equivalent inflation because European welfare state raised expectations. Energy crisis 2022 permanently changed spending behavior. Rising populism reflects their economic anxiety.",
    typical_actions: ["switch to cheaper energy", "vote far-right", "reduce travel", "buy heat pump", "cancel subscriptions", "protest pension reform"]
  },
  china_middle: {
    name: "Chinese Middle Class", category: "social_class", flag: "🇨🇳",
    persona: "400M Chinese urban residents. Property is 70% of wealth. Confidence shattered by Evergrande.",
    exposed_to: ["property prices", "youth unemployment", "regulatory crackdowns", "zero-COVID legacy"],
    behavioral_bias: "Property collapse destroyed wealth and confidence simultaneously. Youth unemployment at 20%+ means next generation isn't forming households. Lying flat (tangping) is rational response to broken social contract.",
    typical_actions: ["stop buying apartments", "move savings to gold", "send money offshore", "delay marriage/children", "protest quietly", "seek overseas emigration"]
  },
  india_middle: {
    name: "Indian Middle Class", category: "social_class", flag: "🇮🇳",
    persona: "300M Indians entering middle class. Ambitious, mobile, digitally native.",
    exposed_to: ["inflation", "job market in IT sector", "rupee stability", "China competition"],
    behavioral_bias: "Most optimistic large middle class in world. Trust Modi's economic narrative. Benefit from China supply chain shift. IT sector exposure to global slowdown is vulnerability.",
    typical_actions: ["increase UPI digital payments", "buy gold for wedding", "apply for US visa", "invest in Indian stock market", "switch to Indian-made products"]
  },
};

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "government", label: "Governments", icon: "🏛" },
  { id: "central_bank", label: "Central Banks", icon: "🏦" },
  { id: "stock_market", label: "Markets", icon: "📈" },
  { id: "bank", label: "Banks", icon: "🏢" },
  { id: "company", label: "Companies", icon: "💼" },
  { id: "social_class", label: "Social Classes", icon: "👥" },
];

// ── Cascade routing: which agents are PRIMARY, SECONDARY, TERTIARY responders ──
// Based on actual economic transmission mechanisms
const IMPACT_ROUTES: Record<string, { primary: string[]; secondary: string[]; tertiary: string[] }> = {
  oil_spike:      { primary: ["oil_market","fed","russia","saudi"],           secondary: ["eu","us_working","india","china","global_south_poor"], tertiary: ["gold_market","sp500","us_middle","eu_middle"] },
  gold_surge:     { primary: ["gold_market","fed","pboc","russia"],           secondary: ["sp500","crypto_mkt","us_upper","blackrock"],           tertiary: ["china","india_middle","eu_middle"] },
  rate_hike:      { primary: ["fed","sp500","jpmorgan","blackrock"],          secondary: ["us_middle","us_working","crypto_mkt","gold_market"],    tertiary: ["global_south_poor","eu","pboc","china_middle"] },
  rate_cut:       { primary: ["fed","sp500","crypto_mkt","gold_market"],      secondary: ["us_middle","us_upper","blackrock","goldman"],           tertiary: ["eu","pboc","india","eu_middle"] },
  geopolitical:   { primary: ["usa","israel","iran","russia"],                secondary: ["oil_market","gold_market","eu","saudi"],                tertiary: ["us_middle","us_working","global_south_poor","fed"] },
  currency_crash: { primary: ["fed","pboc","global_south_poor","india"],      secondary: ["oil_market","gold_market","jpmorgan","blackrock"],      tertiary: ["eu","us_middle","china_middle","india_middle"] },
  recession:      { primary: ["fed","sp500","us_middle","jpmorgan"],          secondary: ["us_working","blackrock","goldman","eu"],                tertiary: ["china","oil_market","global_south_poor","india"] },
  trade_war:      { primary: ["usa","china","nvidia","apple"],                secondary: ["eu","japan","sp500","gold_market"],                    tertiary: ["india","india_middle","china_middle","global_south_poor"] },
  ai_disruption:  { primary: ["nvidia","microsoft","sp500","nasdaq"],         secondary: ["us_middle","us_working","goldman","blackrock"],         tertiary: ["china","eu","india","global_south_poor"] },
  general:        { primary: ["fed","usa","china","gold_market"],             secondary: ["sp500","oil_market","eu","russia"],                    tertiary: ["us_middle","global_south_poor","eu_middle","india"] },
};

function classifySignal(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("oil") || e.includes("opec") || e.includes("crude") || e.includes("energy")) return "oil_spike";
  if (e.includes("gold") || e.includes("precious") || e.includes("safe haven")) return "gold_surge";
  if (e.includes("rate hike") || e.includes("tighten") || e.includes("hawkish")) return "rate_hike";
  if (e.includes("rate cut") || e.includes("pivot") || e.includes("dovish") || e.includes("qe")) return "rate_cut";
  if (e.includes("war") || e.includes("conflict") || e.includes("attack") || e.includes("missile") || e.includes("military")) return "geopolitical";
  if (e.includes("currency") || e.includes("collapse") || e.includes("peso") || e.includes("lira") || e.includes("default")) return "currency_crash";
  if (e.includes("recession") || e.includes("gdp") || e.includes("unemployment") || e.includes("layoff")) return "recession";
  if (e.includes("tariff") || e.includes("trade war") || e.includes("sanction") || e.includes("export control")) return "trade_war";
  if (e.includes("ai") || e.includes("chip") || e.includes("automation") || e.includes("nvidia")) return "ai_disruption";
  return "general";
}

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function callAI(messages: { role: string; content: string }[], maxTokens = 2000): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      stream: false,
      max_tokens: maxTokens,
    }),
  });
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`AI gateway error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJSON(raw: string): any {
  try {
    const m = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    return JSON.parse(m ? m[1] : raw);
  } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

// ── CORE: Impact Cascade Engine ───────────────────────────────────────────────
// 3-round propagation based on real economic transmission mechanisms
async function runImpactCascade(
  supabase: ReturnType<typeof createClient>,
  event: string,
  isFromSignal = false,
  signalId?: string
): Promise<{ conversation_id: string; messages: any[]; topic: string; cascade_summary: any }> {

  const signalType = classifySignal(event);
  const routes = IMPACT_ROUTES[signalType] || IMPACT_ROUTES.general;

  // Round 1: Primary responders (direct economic exposure)
  // Round 2: Secondary (transmission effects — 48-72hrs in real world)
  // Round 3: Social class reactions (weeks later — real human behavior)

  const allMessages: any[] = [];
  const agentMemory: Record<string, string> = {}; // tracks what each agent said so far

  const topic = `Impact Cascade: ${event.substring(0, 60)}${event.length > 60 ? "..." : ""}`;

  // Save conversation first
  const { data: conv, error: convErr } = await supabase
    .from("ayn_agent_conversations")
    .insert({
      topic,
      status: "active",
      signal_id: signalId || null,
      metadata: { signal_type: signalType, event, cascade: true }
    })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error("Failed to create cascade conversation");

  let seqOrder = 1;

  async function runRound(
    agentIds: string[],
    round: number,
    roundLabel: string,
    priorContext: string
  ): Promise<string> {
    const agentDescriptions = agentIds
      .filter(id => AGENTS[id])
      .map(id => {
        const a = AGENTS[id];
        return `${a.flag} ${a.name} (${a.category}):
  - Persona: ${a.persona}
  - Behavioral bias: ${a.behavioral_bias}
  - Typical actions they take: ${a.typical_actions.join(", ")}
  - Exposed to: ${a.exposed_to.join(", ")}${agentMemory[id] ? `\n  - What they've already said: "${agentMemory[id]}"` : ""}`;
      }).join("\n\n");

    const systemPrompt = `You are simulating REALISTIC behavioral responses to world events.

CRITICAL RULES:
1. Agents act based on SELF-INTEREST and COGNITIVE BIASES, not idealism
2. Social classes react with REAL human behavior (panic-buying, cutting spending, emigrating, voting differently)
3. Governments and institutions do what's POLITICALLY EXPEDIENT, not optimal
4. Markets react based on PSYCHOLOGY, not just fundamentals
5. Show DISAGREEMENT and CONFLICT between agents
6. Each agent must state one CONCRETE ACTION they are taking, not just opinions
7. Internal thoughts should reveal the CYNICAL REALITY behind public statements
8. NO generic statements. Every line must be specific to THIS event.`;

    const userPrompt = `EVENT: "${event}"
SIGNAL TYPE: ${signalType.replace(/_/g, " ").toUpperCase()}
ROUND: ${round} of 3 — ${roundLabel}

${priorContext ? `WHAT HAPPENED IN PRIOR ROUNDS:\n${priorContext}\n\n` : ""}
AGENTS REACTING THIS ROUND:
${agentDescriptions}

Generate ${agentIds.filter(id => AGENTS[id]).length * 1}-${agentIds.filter(id => AGENTS[id]).length * 2} messages showing their cascade reaction.

IMPORTANT FOR SOCIAL CLASS AGENTS: Show real behavioral economics:
- What they STOP buying or DELAY
- How they VOTE differently
- What they BUY as protection (gold, canned food, etc)
- Whether they MIGRATE, PROTEST, or WITHDRAW from system
- Specific numbers where possible ($X more per month on food, X% cut in spending)

For each message return:
- agent_id: one of [${agentIds.filter(id => AGENTS[id]).map(id => `"${id}"`).join(",")}]
- message: their PUBLIC statement (2-3 sentences, specific, in character)
- concrete_action: ONE specific thing they are doing RIGHT NOW
- emotion: one of [neutral, confident, panicked, happy, angry, worried, suspicious, excited, sad, tense, bitter]
- emotion_intensity: 20-100
- internal_thought: what they're REALLY thinking (cynical, strategic, fearful)
- responding_to: agent_id or null
- cascade_round: ${round}

Return JSON: { "messages": [...] }`;

    const raw = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 3000);

    const parsed = parseJSON(raw);
    const msgs = parsed?.messages || [];

    // Store and save messages
    const toInsert = msgs.map((m: any) => {
      const agent = AGENTS[m.agent_id];
      if (!agent) return null;
      // Update memory
      agentMemory[m.agent_id] = m.message?.substring(0, 150);
      return {
        conversation_id: conv.id,
        agent_id: m.agent_id,
        agent_name: agent.name,
        agent_role: agent.category,
        message: m.message,
        emotion: m.emotion || "neutral",
        emotion_intensity: m.emotion_intensity || 50,
        internal_thought: m.internal_thought || null,
        market_action: m.concrete_action ? { action: m.concrete_action, reason: `Round ${round} cascade response` } : null,
        responding_to_agent: m.responding_to || null,
        sequence_order: seqOrder++,
        agent_flag: agent.flag,
        message_type: round === 3 ? "social_impact" : round === 2 ? "transmission" : "primary",
        cascade_round: round,
      };
    }).filter(Boolean);

    if (toInsert.length > 0) {
      await supabase.from("ayn_agent_messages").insert(toInsert);
      allMessages.push(...toInsert);

      // Update agent states
      for (const m of toInsert) {
        await supabase.from("ayn_agent_states").upsert({
          agent_id: m.agent_id,
          agent_name: m.agent_name,
          agent_role: m.agent_role,
          agent_category: m.agent_role,
          agent_flag: m.agent_flag,
          current_emotion: m.emotion,
          emotion_intensity: m.emotion_intensity,
          key_concern: event.substring(0, 200),
          last_action: m.market_action?.action || m.message?.substring(0, 100),
          stance_summary: m.internal_thought?.substring(0, 200),
        }, { onConflict: "agent_id" });
      }
    }

    // Return context summary for next round
    return toInsert.map((m: any) => `${m.agent_name}: "${m.message}" [ACTION: ${m.market_action?.action || "monitoring"}]`).join("\n");
  }

  // Execute 3 rounds
  const r1Context = await runRound(
    routes.primary.filter(id => AGENTS[id]),
    1, "IMMEDIATE REACTION — Direct market & institutional response (0-24 hours)",
    ""
  );
  
  await new Promise(r => setTimeout(r, 500)); // small delay

  const r2Context = await runRound(
    routes.secondary.filter(id => AGENTS[id]),
    2, "TRANSMISSION EFFECTS — Second-order economic impacts (1-7 days)",
    r1Context
  );
  
  await new Promise(r => setTimeout(r, 500));

  const r3Context = await runRound(
    routes.tertiary.filter(id => AGENTS[id]),
    3, "HUMAN BEHAVIORAL SHIFTS — Social class responses (weeks to months)",
    `${r1Context}\n${r2Context}`
  );

  // Generate cascade summary / prediction
  const summaryPrompt = `Based on this cascade simulation of: "${event}"

Round 1 (Immediate): ${r1Context}
Round 2 (Transmission): ${r2Context}  
Round 3 (Behavioral): ${r3Context}

Generate a concise PREDICTION REPORT. Return JSON:
{
  "headline_outcome": "One sentence on the most likely outcome in 30-90 days",
  "probability": "Low/Medium/High confidence",
  "key_risks": ["risk1", "risk2", "risk3"],
  "winners": ["entity that benefits", "why"],
  "losers": ["entity that suffers", "why"],
  "watch_indicators": ["specific metric to watch", "specific price level", "political trigger"],
  "human_impact_summary": "2 sentences on how ordinary people's lives change"
}`;

  const summaryRaw = await callAI([{ role: "user", content: summaryPrompt }], 1000);
  const cascadeSummary = parseJSON(summaryRaw) || {
    headline_outcome: "Simulation completed — see messages for details",
    probability: "Medium",
    key_risks: [],
    winners: [],
    losers: [],
    watch_indicators: [],
    human_impact_summary: ""
  };

  // Save summary to conversation metadata
  await supabase.from("ayn_agent_conversations")
    .update({ metadata: { signal_type: signalType, event, cascade: true, summary: cascadeSummary } })
    .eq("id", conv.id);

  return { conversation_id: conv.id, messages: allMessages, topic, cascade_summary: cascadeSummary };
}

// ── Other handlers ─────────────────────────────────────────────────────────────

async function getConversations(supabase: ReturnType<typeof createClient>) {
  const { data: conversations } = await supabase
    .from("ayn_agent_conversations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: states } = await supabase.from("ayn_agent_states").select("*");
  return { conversations: conversations || [], agent_states: states || [], categories: CATEGORIES };
}

async function getMessages(supabase: ReturnType<typeof createClient>, conversationId: string) {
  const { data: messages } = await supabase
    .from("ayn_agent_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sequence_order", { ascending: true });
  return { messages: messages || [] };
}

async function chatWithAgent(agentId: string, message: string, history: { role: string; content: string }[]) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  const systemPrompt = `You ARE ${agent.flag} ${agent.name}.
${agent.persona}
Your behavioral bias: ${agent.behavioral_bias}
Typical actions you take: ${agent.typical_actions.join(", ")}

Stay completely in character. Answer as this entity would — with their real interests, biases, and blind spots.
Be specific and concrete. Show emotion. Never break character. 2-4 sentences max unless asked for more.`;
  const msgs = [{ role: "system", content: systemPrompt }, ...history.slice(-10), { role: "user", content: message }];
  const response = await callAI(msgs, 500);
  return { response };
}

async function generateFromSignal(supabase: ReturnType<typeof createClient>, signalId: string) {
  const { data: signal } = await supabase
    .from("ayn_world_signals")
    .select("*")
    .eq("id", signalId)
    .single();
  if (!signal) throw new Error("Signal not found");

  const eventText = `${signal.headline}. Region: ${signal.region}. Severity: ${signal.severity}. ${signal.body || ""}`.trim();
  return runImpactCascade(supabase, eventText, true, signalId);
}

// ── Main ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { mode } = body;
    const supabase = getSupabase();
    let result: any;

    switch (mode) {
      case "get_conversations":
        result = await getConversations(supabase);
        break;
      case "get_messages":
        if (!body.conversation_id) throw new Error("conversation_id required");
        result = await getMessages(supabase, body.conversation_id);
        break;
      case "generate_conversation":
        // Legacy — run a general cascade on current world state
        result = await runImpactCascade(supabase, "Current global macro environment: rising tensions, dollar under pressure, AI disrupting labor markets");
        break;
      case "inject_event":
        if (!body.event) throw new Error("event required");
        result = await runImpactCascade(supabase, body.event);
        break;
      case "generate_from_signal":
        if (!body.signal_id) throw new Error("signal_id required");
        result = await generateFromSignal(supabase, body.signal_id);
        break;
      case "chat":
        if (!body.agent_id || !body.message) throw new Error("agent_id and message required");
        result = await chatWithAgent(body.agent_id, body.message, body.history || []);
        break;
      default:
        throw new Error(`Unknown mode: ${mode}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[ayn-agent-society]", msg);
    if (msg === "RATE_LIMITED") return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (msg === "PAYMENT_REQUIRED") return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
