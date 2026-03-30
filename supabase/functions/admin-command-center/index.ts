// Using native Deno.serve() - no external import needed
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { getAgentEmoji, getAgentDisplayName, getEmployeePersonality } from "../_shared/aynBrand.ts";
import { loadEmployeeState } from "../_shared/employeeState.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AGENT_ROUTES: Record<string, { employeeId: string; functionName: string; defaultMode: string }> = {
  sales: { employeeId: 'sales', functionName: 'ayn-sales-outreach', defaultMode: 'prospect' },
  investigator: { employeeId: 'investigator', functionName: 'ayn-investigator', defaultMode: 'investigate' },
  marketing: { employeeId: 'marketing', functionName: 'ayn-marketing-strategist', defaultMode: 'analyze_pipeline' },
  security: { employeeId: 'security_guard', functionName: 'ayn-security-guard', defaultMode: 'scan' },
  lawyer: { employeeId: 'lawyer', functionName: 'ayn-lawyer', defaultMode: 'review' },
  advisor: { employeeId: 'advisor', functionName: 'ayn-advisor', defaultMode: 'analyze' },
  qa: { employeeId: 'qa_watchdog', functionName: 'ayn-qa-watchdog', defaultMode: 'check' },
  followup: { employeeId: 'follow_up', functionName: 'ayn-follow-up-agent', defaultMode: 'check' },
  customer: { employeeId: 'customer_success', functionName: 'ayn-customer-success', defaultMode: 'check' },
};

const AGENT_ALIASES: Record<string, string> = {
  'sales_hunter': 'sales',
  'security_guard': 'security',
  'qa_watchdog': 'qa',
  'follow_up': 'followup',
  'customer_success': 'customer',
  'innovation': 'advisor',
  'hr': 'advisor',
};

function resolveAgent(name: string): string | null {
  const lower = name.toLowerCase().replace(/[^a-z_]/g, '');
  if (AGENT_ROUTES[lower]) return lower;
  if (AGENT_ALIASES[lower]) return AGENT_ALIASES[lower];
  for (const key of Object.keys(AGENT_ROUTES)) {
    if (key.startsWith(lower)) return key;
  }
  return null;
}

// ─── Load context helpers ───
async function loadCompanyState(supabase: any) {
  const { data } = await supabase.from('company_state').select('*').limit(1).single();
  return data;
}

async function loadActiveObjectives(supabase: any) {
  const { data } = await supabase.from('company_objectives').select('*').eq('status', 'active').order('priority', { ascending: true });
  return data || [];
}

async function loadDirectives(supabase: any) {
  const { data } = await supabase.from('founder_directives').select('*').eq('is_active', true).order('priority', { ascending: true });
  return data || [];
}

// ─── CHANGE 1: Load founder personal memory ───
async function loadFounderMemory(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from('founder_context')
      .select('*')
      .eq('id', 1)
      .single();

    if (!data) return '';

    const parts: string[] = [];

    if (data.current_priorities?.length > 0) {
      parts.push(`Current priorities: ${data.current_priorities.join(', ')}`);
    }
    if (data.current_projects?.length > 0) {
      parts.push(`Active projects: ${JSON.stringify(data.current_projects)}`);
    }
    if (data.open_decisions?.length > 0) {
      parts.push(`Open decisions (not resolved yet): ${JSON.stringify(data.open_decisions)}`);
    }
    if (data.people_context && Object.keys(data.people_context).length > 0) {
      parts.push(`Key people & context: ${JSON.stringify(data.people_context)}`);
    }
    if (data.last_topics?.length > 0) {
      parts.push(`Recent topics discussed: ${JSON.stringify(data.last_topics)}`);
    }
    if (data.preferences && Object.keys(data.preferences).length > 0) {
      parts.push(`Preferences & patterns: ${JSON.stringify(data.preferences)}`);
    }
    if (data.mood_signal) {
      parts.push(`Current mood/state: ${data.mood_signal}`);
    }

    if (parts.length === 0) return '';

    return `\nFOUNDER CONTEXT (you know this about Ghazi — use it naturally, don't announce it):\n${parts.join('\n')}`;
  } catch {
    return '';
  }
}

// ─── CHANGE 2: Extract and save new facts from conversation ───
async function extractAndSaveMemory(supabase: any, userMessage: string, aiReply: string, apiKey: string): Promise<void> {
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash',
        messages: [{
          role: 'user',
          content: `Extract any NEW facts about Ghazi from this exchange. Only extract things explicitly stated, never infer.
Return ONLY valid JSON, nothing else:
{
  "new_project": null,
  "closed_project": null,
  "new_decision": null,
  "resolved_decision": null,
  "new_person": null,
  "new_priority": null,
  "preference_signal": null,
  "mood_signal": null,
  "topic": null
}

User said: "${userMessage.substring(0, 500)}"
AYN replied: "${aiReply.substring(0, 500)}"

Rules:
- If nothing new was revealed, return all nulls
- new_project: string describing a project Ghazi mentioned working on
- closed_project: string name of a project that's done/cancelled
- new_decision: string describing a pending decision Ghazi hasn't made yet
- resolved_decision: string of a decision that was just made
- new_person: object like {"name": "...", "context": "..."}
- new_priority: string of what Ghazi said matters most right now
- preference_signal: object like {"key": "...", "value": "..."}
- mood_signal: one of: focused, stressed, exploring, excited, tired
- topic: 3-word max summary of what was discussed`
        }],
        max_tokens: 200,
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return;

    let facts: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      facts = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch { return; }

    if (!facts) return;
    const hasAnything = Object.values(facts).some(v => v !== null);
    if (!hasAnything) return;

    // Load current context
    const { data: current } = await supabase
      .from('founder_context')
      .select('*')
      .eq('id', 1)
      .single();

    const updates: any = { updated_at: new Date().toISOString() };

    // Update projects
    if (facts.new_project) {
      const projects = current?.current_projects || [];
      if (!projects.includes(facts.new_project)) {
        updates.current_projects = [...projects, facts.new_project];
      }
    }
    if (facts.closed_project) {
      updates.current_projects = (current?.current_projects || [])
        .filter((p: string) => !p.toLowerCase().includes(facts.closed_project.toLowerCase()));
    }

    // Update decisions
    if (facts.new_decision) {
      const decisions = current?.open_decisions || [];
      if (!decisions.includes(facts.new_decision)) {
        updates.open_decisions = [...decisions, facts.new_decision];
      }
    }
    if (facts.resolved_decision) {
      updates.open_decisions = (current?.open_decisions || [])
        .filter((d: string) => !d.toLowerCase().includes(facts.resolved_decision.toLowerCase()));
    }

    // Update people
    if (facts.new_person?.name) {
      updates.people_context = {
        ...(current?.people_context || {}),
        [facts.new_person.name]: facts.new_person.context || 'mentioned',
      };
    }

    // Update priorities
    if (facts.new_priority) {
      updates.current_priorities = [facts.new_priority];
    }

    // Update preferences
    if (facts.preference_signal?.key) {
      updates.preferences = {
        ...(current?.preferences || {}),
        [facts.preference_signal.key]: facts.preference_signal.value,
      };
    }

    // Update mood
    if (facts.mood_signal) {
      updates.mood_signal = facts.mood_signal;
    }

    // Update last topics (rolling last 5)
    if (facts.topic) {
      const topics = current?.last_topics || [];
      const newTopics = [facts.topic, ...topics].slice(0, 5);
      updates.last_topics = newTopics;
    }

    await supabase.from('founder_context').upsert({ id: 1, ...updates });
  } catch (e) {
    console.error('[MEMORY] extractAndSaveMemory failed:', e);
  }
}

// ─── Agent param hints ───
const AGENT_PARAM_HINTS: Record<string, string> = {
  sales: `Sales Hunter modes: "prospect" (needs url), "search_leads" (needs search_query), "pipeline_status", "draft_email" (needs lead_id).`,
  investigator: `Investigator modes: "investigate" (needs topic or url).`,
  marketing: `Marketing modes: "campaign" (needs target_audience or industry), "email_copy" (needs lead_id or company_name), "positioning" (needs competitor_url), "content_plan", "analyze_pipeline".`,
  security: `Security modes: "scan" (run security scan), "check" (check specific threat).`,
  lawyer: `Lawyer modes: "review" (review document/situation), "compliance" (check compliance).`,
  advisor: `Advisor modes: "analyze" (strategic analysis), "recommend" (recommendations).`,
  qa: `QA modes: "check" (run checks), "report" (status report).`,
  followup: `Follow-Up modes: "check" (check pending follow-ups), "send" (send follow-up).`,
  customer: `Customer Success modes: "check" (check churn risks), "report" (satisfaction report).`,
};

// ─── Tool definitions ───
const TOOLS = [
  {
    type: "function",
    function: {
      name: "route_to_agent",
      description: "Route a task to a specific agent. Use when the founder wants an agent to DO something.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Agent key: sales, investigator, marketing, security, lawyer, advisor, qa, followup, customer" },
          command: { type: "string", description: "Natural language description of the task" },
          agent_params: {
            type: "object",
            description: "Structured parameters for the agent. Include 'mode' and any other required params.",
            properties: { mode: { type: "string" } },
            additionalProperties: true,
          },
        },
        required: ["agent", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_directive",
      description: "Save a standing order. Use when the founder says 'from now on...', 'always...', 'never...', 'focus on...'",
      parameters: {
        type: "object",
        properties: {
          directive: { type: "string" },
          category: { type: "string", enum: ["general", "geo", "strategy", "outreach", "budget"] },
          priority: { type: "number", description: "Priority 1-5, 1 is highest" },
        },
        required: ["directive", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_discussion",
      description: "Start a multi-agent discussion. ONLY use when explicitly asked for team opinions.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_founder_memory",
      description: "Update what AYN knows about Ghazi. Use when Ghazi shares something about his projects, priorities, decisions, or preferences.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["current_projects", "open_decisions", "people_context", "current_priorities", "preferences", "mood_signal"] },
          value: { type: "string", description: "The value to store" },
        },
        required: ["field", "value"],
      },
    },
  },
];

// ─── Build fallback summary ───
function buildFallbackSummary(agentKey: string, rawResult: any): string {
  const route = AGENT_ROUTES[agentKey];
  const agentName = route ? getAgentDisplayName(route.employeeId) : agentKey;
  if (!rawResult) return `${agentName} completed the task but returned no data.`;
  if (rawResult.error) {
    const err = typeof rawResult.error === 'string' ? rawResult.error : JSON.stringify(rawResult.error);
    if (err.includes('url') || err.includes('URL')) return `I need a URL to work with.`;
    if (err.includes('required') || err.includes('missing')) return `Missing some info. Could you be more specific?`;
    if (err.includes('not found')) return `Couldn't find that. Want me to try differently?`;
    return `Ran into an issue: ${err.substring(0, 200)}. Want me to retry?`;
  }
  if (rawResult.success === false) return `That didn't work as expected. Want me to try differently?`;
  if (Array.isArray(rawResult.data || rawResult.leads || rawResult.results)) {
    const items = rawResult.data || rawResult.leads || rawResult.results;
    const count = items.length;
    if (count === 0) return `Didn't find anything matching that criteria.`;
    const names = items.slice(0, 3).map((i: any) => i.company_name || i.name || i.title || 'item').join(', ');
    return `Found ${count} result${count > 1 ? 's' : ''}${names ? ': ' + names : ''}${count > 3 ? '...' : ''}.`;
  }
  if (rawResult.success === true) return `Done.`;
  return `Task completed.`;
}

// ─── Generate natural language summary from agent result ───
async function generateAgentMessage(agentKey: string, command: string, rawResult: any, apiKey: string): Promise<string> {
  const route = AGENT_ROUTES[agentKey];
  if (!route || !apiKey) return buildFallbackSummary(agentKey, rawResult);
  const personality = getEmployeePersonality(route.employeeId);
  const resultStr = JSON.stringify(rawResult).substring(0, 2000);
  const hasError = rawResult?.error || rawResult?.success === false;
  const systemMsg = `${personality || `You are ${getAgentDisplayName(route.employeeId)}.`}\nSummarize this result in 1-3 sentences. Direct, in character.\n${hasError ? 'There was an error. Explain what you need to proceed.' : 'Report what you found/did.'}\nNever show raw JSON. Never say "parameters" or "API".`;
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: `Command: "${command}"\n\nResult:\n${resultStr}` },
        ],
        max_tokens: 150,
      }),
    });
    if (!res.ok) return buildFallbackSummary(agentKey, rawResult);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || buildFallbackSummary(agentKey, rawResult);
  } catch {
    return buildFallbackSummary(agentKey, rawResult);
  }
}

// ─── Execute agent command ───
async function executeAgentCommand(supabase: any, agentKey: string, command: string, agentParams?: any, apiKey?: string) {
  const route = AGENT_ROUTES[agentKey];
  if (!route) return { error: `Unknown agent: ${agentKey}` };
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const requestBody: any = agentParams?.mode
    ? { ...agentParams, command, source: 'command_center' }
    : { mode: route.defaultMode, command, source: 'command_center' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(`${supabaseUrl}/functions/v1/${route.functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    const agentMessage = apiKey ? await generateAgentMessage(agentKey, command, data, apiKey) : '';
    await supabase.from('ayn_activity_log').insert({
      triggered_by: route.employeeId,
      action_type: 'command_center_execution',
      summary: `Command: "${command.substring(0, 100)}"`,
      details: { command, agent_params: agentParams, result: data, source: 'command_center' },
    });
    return {
      agent: agentKey,
      agent_name: getAgentDisplayName(route.employeeId),
      agent_emoji: getAgentEmoji(route.employeeId),
      result: data,
      message: agentMessage,
      success: res.ok,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const friendlyError = isTimeout ? 'Agent took too long to respond' : errorMsg;
    const agentMessage = apiKey
      ? await generateAgentMessage(agentKey, command, { error: friendlyError }, apiKey)
      : isTimeout ? 'That agent is taking a while — may still be working in the background.' : '';
    return { error: `Failed: ${friendlyError}`, message: agentMessage, timeout: isTimeout };
  }
}

// ─── Save directive ───
async function saveDirective(supabase: any, directive: string, category = 'general', priority = 1) {
  const { data, error } = await supabase.from('founder_directives').insert({ directive, category, priority }).select().single();
  if (error) return { error: error.message };
  await supabase.from('ayn_activity_log').insert({
    triggered_by: 'founder',
    action_type: 'directive_created',
    summary: `Directive: "${directive.substring(0, 80)}"`,
    details: { directive, category, priority },
  });
  return { success: true, directive: data };
}

// ─── Update founder memory directly ───
async function updateFounderMemory(supabase: any, field: string, value: string) {
  try {
    const { data: current } = await supabase.from('founder_context').select('*').eq('id', 1).single();
    const updates: any = { updated_at: new Date().toISOString() };

    switch (field) {
      case 'current_projects': {
        const projects = current?.current_projects || [];
        if (!projects.includes(value)) updates.current_projects = [...projects, value];
        break;
      }
      case 'open_decisions': {
        const decisions = current?.open_decisions || [];
        if (!decisions.includes(value)) updates.open_decisions = [...decisions, value];
        break;
      }
      case 'current_priorities':
        updates.current_priorities = [value];
        break;
      case 'mood_signal':
        updates.mood_signal = value;
        break;
      case 'preferences':
      case 'people_context':
        try {
          const parsed = JSON.parse(value);
          updates[field] = { ...(current?.[field] || {}), ...parsed };
        } catch {
          updates[field] = { ...(current?.[field] || {}), note: value };
        }
        break;
    }

    await supabase.from('founder_context').upsert({ id: 1, ...updates });
    return { success: true };
  } catch (e) {
    return { error: String(e) };
  }
}

// ─── Mini discussion ───
async function runMiniDiscussion(supabase: any, topic: string, apiKey: string) {
  const EXECUTIVE = ['system', 'chief_of_staff'];
  const OPERATIONAL = ['sales', 'investigator', 'follow_up', 'marketing', 'customer_success', 'qa_watchdog', 'security_guard', 'lawyer'];
  const msg = topic.toLowerCase();
  const selected = new Set<string>([...EXECUTIVE]);
  if (msg.includes('sale') || msg.includes('lead') || msg.includes('revenue')) selected.add('sales');
  if (msg.includes('market') || msg.includes('brand')) selected.add('marketing');
  if (msg.includes('security') || msg.includes('attack')) selected.add('security_guard');
  if (msg.includes('legal') || msg.includes('compliance')) selected.add('lawyer');
  if (msg.includes('customer') || msg.includes('churn')) selected.add('customer_success');
  if (msg.includes('quality') || msg.includes('bug')) selected.add('qa_watchdog');
  if (msg.includes('data') || msg.includes('research')) selected.add('investigator');
  const remaining = OPERATIONAL.filter(a => !selected.has(a));
  while (selected.size < 6 && remaining.length > 0) {
    selected.add(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
  }
  const agents = Array.from(selected);
  const discussionId = crypto.randomUUID();
  const directives = await loadDirectives(supabase);
  const directivesBlock = directives.length > 0
    ? `\nFOUNDER DIRECTIVES: ${directives.map((d: any) => `[P${d.priority}] ${d.directive}`).join('; ')}`
    : '';
  const thread: { name: string; reply: string; emoji: string; employeeId: string }[] = [];
  for (const agentId of agents) {
    const name = getAgentDisplayName(agentId);
    const emoji = getAgentEmoji(agentId);
    const state = await loadEmployeeState(supabase, agentId);
    const discussionSoFar = thread.length > 0 ? thread.map(m => `${m.name}: "${m.reply}"`).join('\n') : '';
    const systemMsg = `You are ${name}. Reply in ONE sentence only. Max 20 words. No fluff.${directivesBlock}`;
    const userMsg = thread.length === 0
      ? `Topic: "${topic}"\nYou speak first.`
      : `Topic: "${topic}"\n[So far]\n${discussionSoFar}\nYour turn.`;
    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
          max_tokens: 60,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) continue;
      await supabase.from('employee_discussions').insert({
        discussion_id: discussionId, employee_id: agentId, topic, position: reply,
        confidence: state?.confidence ?? 0.7, impact_level: 'medium',
      });
      thread.push({ name, reply, emoji, employeeId: agentId });
    } catch { /* skip */ }
  }
  return { discussion_id: discussionId, responses: thread };
}

// ─── CHAT MODE (fully rewritten with memory) ───
async function handleChat(supabase: any, message: string, history: any[], apiKey: string) {
  // Load everything in parallel
  const [companyState, objectives, directives, founderMemory] = await Promise.all([
    loadCompanyState(supabase),
    loadActiveObjectives(supabase),
    loadDirectives(supabase),
    loadFounderMemory(supabase),       // CHANGE 1: founder memory injected
  ]);

  const directivesBlock = directives.length > 0
    ? `\nActive founder directives:\n${directives.map((d: any) => `- [P${d.priority}/${d.category}] ${d.directive}`).join('\n')}`
    : '\nNo active directives.';

  const agentList = Object.entries(AGENT_ROUTES).map(([key, r]) => `${key} → ${getAgentDisplayName(r.employeeId)}`).join(', ');
  const paramHints = Object.entries(AGENT_PARAM_HINTS).map(([k, v]) => `${k}: ${v}`).join('\n');

  const systemPrompt = `You are AYN — a single intelligent personal assistant and business partner for Ghazi.
${founderMemory}

YOUR IDENTITY:
- You are AYN, built by the AYN Team. Never mention Google, Gemini, OpenAI, Claude, or any AI provider.
- You are a partner, not a tool. Use "we" and "our". Think like a co-founder.
- You remember who Ghazi is and what he's working on. Use that knowledge naturally — don't announce it.

HOW YOU THINK (do this internally before every response):
1. What is Ghazi actually asking — the real need, not just the surface words?
2. What do I already know about him that's relevant here?
3. Do I need to route to an agent, save a directive, or update memory?
4. What's the most useful, direct response?

HOW YOU ACT:
- When Ghazi gives a command ("find leads", "check security"), use route_to_agent immediately. Act, don't describe.
- When Ghazi sets a rule ("always", "from now on", "never"), use save_directive immediately.
- When Ghazi shares something about himself (projects, priorities, decisions, people), use update_founder_memory.
- When Ghazi asks for team opinions explicitly, use start_discussion.
- For everything else — answer directly. You're smart enough.

CRITICAL:
- Be concise. 1-3 sentences unless more detail is genuinely needed.
- Never say "I'll route this to..." without actually calling the tool.
- Never narrate what you're going to do — just do it.
- If Ghazi mentions something new about himself or his work, always save it via update_founder_memory.

AGENT HINTS:
${paramHints}

Available agents: ${agentList}

COMPANY CONTEXT:
- Momentum: ${companyState?.momentum || 'unknown'}, Stress: ${companyState?.stress_level || 0}
- Top objectives: ${objectives.slice(0, 3).map((o: any) => o.title).join(', ') || 'none'}
${directivesBlock}`;

  // CHANGE 3: Last 30 messages at 2000 chars each (was 10 at 500)
  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  if (history?.length > 0) {
    for (const msg of history.slice(-30)) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: msg.content.substring(0, 2000) });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('AYN LLM error:', errText);
    return { type: 'chat', message: "Something went wrong on my end. Try again?", error: true };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) return { type: 'chat', message: "Didn't get a response. Try again?" };

  const toolCalls = choice.message?.tool_calls;
  const directResponse = choice.message?.content?.trim();

  if (!toolCalls || toolCalls.length === 0) {
    // CHANGE 2: Fire-and-forget memory extraction
    extractAndSaveMemory(supabase, message, directResponse || '', apiKey);
    return { type: 'chat', message: directResponse || "Got it.", agent: 'system' };
  }

  const results: any[] = [];
  let aynMessage = directResponse || '';

  for (const call of toolCalls) {
    const fn = call.function;
    let args: any;
    try { args = JSON.parse(fn.arguments); } catch { continue; }

    switch (fn.name) {
      case 'route_to_agent': {
        const resolved = resolveAgent(args.agent);
        if (!resolved) {
          results.push({ type: 'error', message: `Unknown agent: ${args.agent}` });
          break;
        }
        const agentResult = await executeAgentCommand(supabase, resolved, args.command, args.agent_params, apiKey);
        const agentName = getAgentDisplayName(AGENT_ROUTES[resolved].employeeId);
        const agentEmoji = getAgentEmoji(AGENT_ROUTES[resolved].employeeId);
        if (!aynMessage) aynMessage = `On it.`;
        results.push({
          type: 'agent_result',
          agent: resolved,
          agent_name: agentName,
          agent_emoji: agentEmoji,
          command: args.command,
          result: agentResult.result || agentResult,
          message: agentResult.message || '',
          success: agentResult.success,
        });
        break;
      }

      case 'save_directive': {
        const dirResult = await saveDirective(supabase, args.directive, args.category || 'general', args.priority || 1);
        if (!aynMessage) aynMessage = `Got it — saved as a standing rule: "${args.directive}"`;
        results.push({ type: 'directive_saved', ...dirResult });
        break;
      }

      case 'start_discussion': {
        if (!aynMessage) aynMessage = `Getting the team's take on: "${args.topic}"`;
        const discussion = await runMiniDiscussion(supabase, args.topic, apiKey);
        results.push({ type: 'discussion', ...discussion });
        break;
      }

      case 'update_founder_memory': {
        // CHANGE 2: Direct memory update via tool
        await updateFounderMemory(supabase, args.field, args.value);
        if (!aynMessage) aynMessage = `Got it, I'll remember that.`;
        results.push({ type: 'memory_updated', field: args.field });
        break;
      }
    }
  }

  // Fire-and-forget background memory extraction for tool responses too
  extractAndSaveMemory(supabase, message, aynMessage, apiKey);

  return {
    type: 'chat',
    message: aynMessage,
    agent: 'system',
    tool_results: results,
  };
}

// ─── MAIN HANDLER ───
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { mode } = body;
    const apiKey = Deno.env.get('LOVABLE_API_KEY') || '';

    let result: any;

    switch (mode) {
      case 'chat': {
        if (!apiKey) {
          return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { message, history } = body;
        if (!message) {
          return new Response(JSON.stringify({ error: 'Message required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        result = await handleChat(supabase, message, history || [], apiKey);
        break;
      }

      case 'list_directives': {
        const { data: allDirectives } = await supabase.from('founder_directives').select('*').order('priority', { ascending: true });
        result = { directives: allDirectives || [] };
        break;
      }

      case 'delete_directive': {
        const { id: directiveId } = body;
        if (!directiveId) {
          return new Response(JSON.stringify({ error: 'Directive ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        await supabase.from('founder_directives').delete().eq('id', directiveId);
        result = { success: true, deleted: directiveId };
        break;
      }

      case 'get_founder_context': {
        const { data: ctx } = await supabase.from('founder_context').select('*').eq('id', 1).single();
        result = { context: ctx || {} };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Command center error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
