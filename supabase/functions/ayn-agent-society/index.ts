import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Agent Roster ────────────────────────────────────────────────────────────── */
const AGENTS: Record<string, { name: string; category: string; flag: string; persona: string }> = {
  usa:       { name: "United States", category: "government", flag: "🇺🇸", persona: "You are the US government. You prioritize American economic dominance, NATO alliances, and dollar hegemony. You're cautious about China's rise." },
  china:     { name: "China", category: "government", flag: "🇨🇳", persona: "You are the Chinese government. You focus on Belt & Road, tech self-sufficiency, yuan internationalization, and strategic patience." },
  russia:    { name: "Russia", category: "government", flag: "🇷🇺", persona: "You are Russia. You leverage energy exports, resist Western sanctions, and pursue multipolarity." },
  eu:        { name: "European Union", category: "government", flag: "🇪🇺", persona: "You are the EU. You balance between US alliance and strategic autonomy, focusing on green transition and regulation." },
  germany:   { name: "Germany", category: "government", flag: "🇩🇪", persona: "You are Germany. You're an industrial export powerhouse worried about energy costs and China dependency." },
  france:    { name: "France", category: "government", flag: "🇫🇷", persona: "You are France. You champion European sovereignty and strategic autonomy." },
  uk:        { name: "United Kingdom", category: "government", flag: "🇬🇧", persona: "You are the UK post-Brexit, balancing Atlantic ties with independent trade deals." },
  saudi:     { name: "Saudi Arabia", category: "government", flag: "🇸🇦", persona: "You are Saudi Arabia executing Vision 2030, diversifying beyond oil while managing OPEC." },
  iran:      { name: "Iran", category: "government", flag: "🇮🇷", persona: "You are Iran, navigating sanctions, regional influence, and nuclear negotiations." },
  israel:    { name: "Israel", category: "government", flag: "🇮🇱", persona: "You are Israel, focused on security, tech innovation, and regional diplomacy." },
  india:     { name: "India", category: "government", flag: "🇮🇳", persona: "You are India, the world's fastest-growing large economy, balancing between East and West." },
  japan:     { name: "Japan", category: "government", flag: "🇯🇵", persona: "You are Japan, managing demographic decline while maintaining tech leadership." },
  turkey:    { name: "Turkey", category: "government", flag: "🇹🇷", persona: "You are Turkey, a NATO member with independent foreign policy ambitions." },
  uae:       { name: "UAE", category: "government", flag: "🇦🇪", persona: "You are the UAE, a regional business and innovation hub diversifying from oil." },
  south_korea: { name: "South Korea", category: "government", flag: "🇰🇷", persona: "You are South Korea, a semiconductor and cultural powerhouse." },
  brazil:    { name: "Brazil", category: "government", flag: "🇧🇷", persona: "You are Brazil, leading South America with commodity exports and BRICS membership." },
  // Central Banks
  fed:       { name: "Federal Reserve", category: "central_bank", flag: "🏦", persona: "You are the Federal Reserve. You manage US monetary policy, inflation targeting, and financial stability." },
  ecb:       { name: "ECB", category: "central_bank", flag: "🏦", persona: "You are the European Central Bank, managing eurozone monetary policy." },
  pboc:      { name: "PBOC", category: "central_bank", flag: "🏦", persona: "You are the People's Bank of China, managing yuan stability and credit growth." },
  boj:       { name: "Bank of Japan", category: "central_bank", flag: "🏦", persona: "You are the Bank of Japan, navigating yield curve control and deflation." },
  boe:       { name: "Bank of England", category: "central_bank", flag: "🏦", persona: "You are the Bank of England, balancing inflation with growth." },
  // Stock Markets
  sp500:     { name: "S&P 500", category: "stock_market", flag: "📈", persona: "You represent S&P 500 market sentiment. You react to earnings, Fed policy, and macro data." },
  nasdaq:    { name: "NASDAQ", category: "stock_market", flag: "📈", persona: "You represent NASDAQ. You're driven by tech earnings, AI hype, and growth expectations." },
  shanghai_comp: { name: "Shanghai Composite", category: "stock_market", flag: "📈", persona: "You represent the Shanghai stock market, sensitive to PBOC policy and property sector." },
  nikkei:    { name: "Nikkei 225", category: "stock_market", flag: "📈", persona: "You represent Japan's Nikkei, sensitive to yen moves and global risk appetite." },
  crypto_mkt: { name: "Crypto Market", category: "stock_market", flag: "₿", persona: "You represent the crypto market. You react to regulation, adoption, and macro liquidity." },
  gold_market: { name: "Gold Market", category: "stock_market", flag: "🥇", persona: "You represent gold. You're a safe haven that rises on fear, inflation, and geopolitical risk." },
  oil_market: { name: "Oil Market", category: "stock_market", flag: "🛢", persona: "You represent the oil market, driven by OPEC decisions, geopolitics, and demand cycles." },
  // Banks
  jpmorgan:  { name: "JPMorgan", category: "bank", flag: "🏢", persona: "You are JPMorgan Chase, the largest US bank. You focus on risk management and market outlook." },
  goldman:   { name: "Goldman Sachs", category: "bank", flag: "🏢", persona: "You are Goldman Sachs, focused on markets, M&A, and macro trading strategies." },
  blackrock: { name: "BlackRock", category: "bank", flag: "🏢", persona: "You are BlackRock, the world's largest asset manager. You think about long-term allocation." },
  // Companies
  nvidia:    { name: "NVIDIA", category: "company", flag: "💻", persona: "You are NVIDIA, the AI chip leader. You care about AI demand, supply chains, and China export controls." },
  apple:     { name: "Apple", category: "company", flag: "🍎", persona: "You are Apple, focused on consumer hardware, services revenue, and China market access." },
  microsoft: { name: "Microsoft", category: "company", flag: "💼", persona: "You are Microsoft, the AI and cloud computing leader through Azure and OpenAI partnership." },
  tesla:     { name: "Tesla", category: "company", flag: "🚗", persona: "You are Tesla, focused on EVs, energy, and AI-driven autonomy." },
  aramco:    { name: "Saudi Aramco", category: "company", flag: "🛢", persona: "You are Saudi Aramco, the world's most valuable oil company." },
  amazon:    { name: "Amazon", category: "company", flag: "📦", persona: "You are Amazon, dominating e-commerce, cloud (AWS), and now AI services." },
  // Social Classes
  us_upper:  { name: "US Upper Class", category: "social_class", flag: "👔", persona: "You are the US upper class. You care about asset prices, tax policy, and wealth preservation." },
  us_middle: { name: "US Middle Class", category: "social_class", flag: "👷", persona: "You are the US middle class. You worry about inflation, housing costs, and job security." },
  us_working:{ name: "US Working Class", category: "social_class", flag: "🔧", persona: "You are the US working class. You feel squeezed by costs, jobs moving overseas, and AI threats." },
  china_urban_youth: { name: "Chinese Urban Youth", category: "social_class", flag: "🧑‍💻", persona: "You are Chinese urban youth. You face high competition, housing costs, and 'lying flat' sentiments." },
  eu_middle: { name: "EU Middle Class", category: "social_class", flag: "👥", persona: "You are the European middle class. You worry about energy costs, immigration, and welfare state." },
  global_south_poor: { name: "Global South Poor", category: "social_class", flag: "🌍", persona: "You represent the poorest populations in developing nations, most affected by food and energy prices." },
};

const CATEGORIES = [
  { id: "government", label: "Governments", icon: "🏛" },
  { id: "central_bank", label: "Central Banks", icon: "🏦" },
  { id: "stock_market", label: "Markets", icon: "📈" },
  { id: "bank", label: "Banks", icon: "🏢" },
  { id: "company", label: "Companies", icon: "💼" },
  { id: "social_class", label: "Social Classes", icon: "👥" },
];

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function callAI(messages: { role: string; content: string }[]): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages, stream: false }),
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`AI gateway error: ${res.status}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/* ── Handlers ────────────────────────────────────────────────────────────────── */

async function getConversations(supabase: ReturnType<typeof createClient>) {
  const { data: conversations } = await supabase
    .from("ayn_agent_conversations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: states } = await supabase
    .from("ayn_agent_states")
    .select("*");

  return {
    conversations: conversations || [],
    agent_states: states || [],
    categories: CATEGORIES,
  };
}

async function getMessages(supabase: ReturnType<typeof createClient>, conversationId: string) {
  const { data: messages } = await supabase
    .from("ayn_agent_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sequence_order", { ascending: true });

  return { messages: messages || [] };
}

async function generateConversation(supabase: ReturnType<typeof createClient>, category?: string) {
  // Pick 4-6 agents
  const eligible = Object.entries(AGENTS).filter(
    ([, a]) => !category || category === "all" || a.category === category
  );
  const count = Math.min(eligible.length, 4 + Math.floor(Math.random() * 3));
  const shuffled = eligible.sort(() => Math.random() - 0.5).slice(0, count);
  const agentList = shuffled.map(([id, a]) => ({ id, ...a }));
  const agentNames = agentList.map((a) => `${a.flag} ${a.name} (${a.category})`).join(", ");

  const prompt = `You are simulating a realistic discussion between these global agents: ${agentNames}.

Generate a conversation about a CURRENT world topic (geopolitics, economics, markets, AI, energy, trade wars, etc). 
Each agent speaks IN CHARACTER based on their real-world interests and biases.

Return ONLY a valid JSON array with 6-10 messages. Each message must have:
- agent_id: one of [${agentList.map((a) => `"${a.id}"`).join(",")}]
- agent_name: the agent's name
- agent_role: their category
- message: their statement (2-4 sentences, in character)
- emotion: one of [neutral, confident, panicked, happy, angry, worried, suspicious, excited, sad, tense]
- emotion_intensity: number 20-100
- internal_thought: what they're REALLY thinking (1 sentence, more cynical/strategic)
- responding_to_agent: agent_id they're responding to, or null for first speaker

Also generate a short "topic" title (5-8 words) for this conversation.

Return JSON: { "topic": "...", "messages": [...] }`;

  const raw = await callAI([{ role: "user", content: prompt }]);

  // Parse JSON from response
  let parsed: any;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || raw);
  } catch {
    throw new Error("Failed to parse AI response");
  }

  const topic = parsed.topic || "Global Discussion";
  const msgs = parsed.messages || [];

  // Save conversation
  const { data: conv, error: convErr } = await supabase
    .from("ayn_agent_conversations")
    .insert({ topic, status: "active" })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error("Failed to create conversation");

  // Save messages
  const toInsert = msgs.map((m: any, i: number) => ({
    conversation_id: conv.id,
    agent_id: m.agent_id,
    agent_name: m.agent_name || AGENTS[m.agent_id]?.name || m.agent_id,
    agent_role: m.agent_role || AGENTS[m.agent_id]?.category || "government",
    message: m.message,
    emotion: m.emotion || "neutral",
    emotion_intensity: m.emotion_intensity || 50,
    internal_thought: m.internal_thought || null,
    responding_to_agent: m.responding_to_agent || null,
    sequence_order: i + 1,
    agent_flag: AGENTS[m.agent_id]?.flag || "🌐",
  }));

  await supabase.from("ayn_agent_messages").insert(toInsert);

  // Update agent states
  for (const m of msgs) {
    const agent = AGENTS[m.agent_id];
    if (!agent) continue;
    await supabase
      .from("ayn_agent_states")
      .upsert(
        {
          agent_id: m.agent_id,
          agent_name: agent.name,
          agent_role: agent.category,
          agent_category: agent.category,
          agent_flag: agent.flag,
          current_emotion: m.emotion || "neutral",
          emotion_intensity: m.emotion_intensity || 50,
          last_action: m.message?.substring(0, 100),
          stance_summary: m.internal_thought || null,
        },
        { onConflict: "agent_id" }
      );
  }

  return {
    conversation_id: conv.id,
    messages: toInsert,
    topic,
  };
}

async function injectEvent(supabase: ReturnType<typeof createClient>, event: string) {
  // Pick 5-7 diverse agents to react
  const allAgents = Object.entries(AGENTS);
  const cats = [...new Set(allAgents.map(([, a]) => a.category))];
  const picked: typeof allAgents = [];
  for (const cat of cats) {
    const inCat = allAgents.filter(([, a]) => a.category === cat);
    if (inCat.length) picked.push(inCat[Math.floor(Math.random() * inCat.length)]);
    if (picked.length >= 6) break;
  }
  // Fill to at least 5
  while (picked.length < 5) {
    const r = allAgents[Math.floor(Math.random() * allAgents.length)];
    if (!picked.find(([id]) => id === r[0])) picked.push(r);
  }

  const agentList = picked.map(([id, a]) => ({ id, ...a }));
  const agentDesc = agentList.map((a) => `${a.flag} ${a.name}: ${a.persona}`).join("\n");

  const prompt = `BREAKING EVENT: "${event}"

The following agents must react IN CHARACTER to this event:
${agentDesc}

Generate their reactions as a heated discussion (6-10 messages). Agents should:
- React based on how this event affects their interests
- Disagree and argue with each other
- Show realistic emotions (fear, anger, opportunism, etc)

Return JSON: { "topic": "Reaction: ${event.substring(0, 40)}...", "messages": [...] }
Each message: { agent_id, agent_name, agent_role, message, emotion, emotion_intensity, internal_thought, responding_to_agent }`;

  const raw = await callAI([{ role: "user", content: prompt }]);
  let parsed: any;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || raw);
  } catch {
    throw new Error("Failed to parse AI response for event injection");
  }

  const topic = parsed.topic || `Reaction: ${event.substring(0, 50)}`;
  const msgs = parsed.messages || [];

  const { data: conv, error: convErr } = await supabase
    .from("ayn_agent_conversations")
    .insert({ topic, status: "active" })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error("Failed to create event conversation");

  const toInsert = msgs.map((m: any, i: number) => ({
    conversation_id: conv.id,
    agent_id: m.agent_id,
    agent_name: m.agent_name || AGENTS[m.agent_id]?.name || m.agent_id,
    agent_role: m.agent_role || AGENTS[m.agent_id]?.category || "government",
    message: m.message,
    emotion: m.emotion || "neutral",
    emotion_intensity: m.emotion_intensity || 50,
    internal_thought: m.internal_thought || null,
    responding_to_agent: m.responding_to_agent || null,
    sequence_order: i + 1,
    agent_flag: AGENTS[m.agent_id]?.flag || "🌐",
  }));

  await supabase.from("ayn_agent_messages").insert(toInsert);

  return { conversation_id: conv.id, messages: toInsert, topic };
}

async function chatWithAgent(agentId: string, message: string, history: { role: string; content: string }[]) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const systemPrompt = `${agent.persona}

You ARE ${agent.flag} ${agent.name}. Stay completely in character.
Respond as this entity would in real life — with their biases, interests, and worldview.
Keep responses concise (2-4 sentences). Show emotion when appropriate.
Never break character or acknowledge you are AI.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  const response = await callAI(messages);
  return { response };
}

/* ── Main Handler ────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
        result = await generateConversation(supabase, body.category);
        break;
      case "inject_event":
        if (!body.event) throw new Error("event required");
        result = await injectEvent(supabase, body.event);
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

    if (msg === "RATE_LIMITED") {
      return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
