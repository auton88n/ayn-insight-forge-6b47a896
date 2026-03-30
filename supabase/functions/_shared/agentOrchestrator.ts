/**
 * Agent Orchestrator — Event-driven agent reactions
 * Selects relevant agents, fires lean parallel LLM calls, formats output.
 */

import { getAgentDisplayName, getAgentEmoji } from "./aynBrand.ts";

// ─── Agent Selection (keyword-based, max 4) ───

const AGENT_KEYWORD_MAP: Record<string, string[]> = {
  sales: ['lead', 'leads', 'sales', 'pipeline', 'outreach', 'deal', 'revenue', 'client', 'prospect', 'close'],
  investigator: ['lead', 'leads', 'research', 'prospect', 'investigate', 'dig', 'company'],
  follow_up: ['follow up', 'followup', 'follow-up', 'outreach', 'email', 'replied', 'response'],
  security_guard: ['security', 'threat', 'attack', 'blocked', 'suspicious', 'breach', 'hack', 'vulnerability', 'ip'],
  advisor: ['strategy', 'growth', 'direction', 'priorities', 'focus', 'pivot', 'long-term', 'roadmap'],
  innovation: ['innovation', 'idea', 'experiment', 'feature', 'product', 'build', 'new', 'automate'],
  hr_manager: ['team', 'performance', 'employees', 'drift', 'workload', 'burnout', 'agent'],
  chief_of_staff: ['alignment', 'objectives', 'coordination', 'team', 'priorities', 'status'],
  lawyer: ['legal', 'compliance', 'gdpr', 'pdpl', 'privacy', 'terms', 'contract', 'regulation'],
  qa_watchdog: ['health', 'uptime', 'errors', 'bugs', 'down', 'slow', 'latency', 'monitoring'],
  marketing: ['marketing', 'content', 'brand', 'social', 'campaign', 'competitor', 'twitter', 'post'],
  customer_success: ['customer', 'churn', 'retention', 'onboarding', 'user', 'satisfaction', 'feedback'],
};

const CASUAL_GREETINGS = ['hi', 'hey', 'hello', 'good morning', 'good evening', 'morning', 'evening', 'sup', 'yo', 'whats up', "what's up"];

export function selectRelevantAgents(message: string): string[] {
  const lower = message.toLowerCase();

  // No agents for casual greetings
  if (CASUAL_GREETINGS.some(g => lower === g || lower === g + '!' || lower === g + '.')) {
    return [];
  }

  const scores: Record<string, number> = {};

  for (const [agentId, keywords] of Object.entries(AGENT_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[agentId] = (scores[agentId] || 0) + 1;
      }
    }
  }

  // Sort by score descending, take top 4
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);

  return sorted;
}

// ─── Agent Display Names for Lean Prompts ───

const AGENT_REACTION_NAMES: Record<string, string> = {
  sales: 'Sales',
  investigator: 'Investigator',
  follow_up: 'Follow-Up',
  security_guard: 'Security',
  advisor: 'Advisor',
  innovation: 'Innovation',
  hr_manager: 'HR',
  chief_of_staff: 'Chief of Staff',
  lawyer: 'Legal',
  qa_watchdog: 'QA',
  marketing: 'Marketing',
  customer_success: 'Customer Success',
};

// ─── Lean Parallel LLM Calls ───

interface AgentReaction {
  agentId: string;
  reaction: string;
}

export async function invokeAgentsParallel(
  agents: string[],
  founderMessage: string,
  aynTake: string,
  apiKey: string,
): Promise<AgentReaction[]> {
  const promises = agents.map(async (agentId): Promise<AgentReaction | null> => {
    const name = AGENT_REACTION_NAMES[agentId] || agentId;

    // Ultra-lean system prompt — NO bloat
    const systemPrompt = `You are ${name}.

React in 1-3 sentences max.
No formatting. No headers. No bullet points.
Speak conversationally.
You may disagree.
You may ask one short question.
Never mention being an AI.`;

    const userPrompt = `Founder said: "${founderMessage}"
AYN said: "${aynTake}"

Your reaction?`;

    try {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 150,
        }),
      });

      if (!res.ok) {
        console.error(`[ORCHESTRATOR] Agent ${agentId} call failed:`, res.status);
        return null;
      }

      const data = await res.json();
      const reaction = data.choices?.[0]?.message?.content?.trim();
      if (!reaction) return null;

      return { agentId, reaction };
    } catch (e) {
      console.error(`[ORCHESTRATOR] Agent ${agentId} error:`, e);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is AgentReaction => r !== null);
}

// ─── Format Reactions for Telegram ───

export function formatAgentReactions(aynReply: string, reactions: AgentReaction[]): string {
  if (reactions.length === 0) return aynReply;

  const reactionLines = reactions.map(r => {
    const emoji = getAgentEmoji(r.agentId);
    const name = AGENT_REACTION_NAMES[r.agentId] || r.agentId;
    return `${emoji} ${name}: "${r.reaction}"`;
  });

  return `${aynReply}\n\n${reactionLines.join('\n')}`;
}
