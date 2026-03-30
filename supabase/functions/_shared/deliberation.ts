/**
 * Deliberation Engine — Internal Agent Debate System (Layer 3)
 * 60/40 weighted synthesis + doctrine alignment bonus.
 * Trust-filtered objections, cognitive load gating, post-debate trust updates.
 * Optional Telegram broadcast: agents post positions live to your chat.
 */

import { loadEmployeeState, loadActiveObjectives, loadServiceEconomics, loadCompanyState } from "./employeeState.ts";
import { loadCurrentDoctrine, updatePeerTrust } from "./politicalIntelligence.ts";
import { broadcastDeliberation } from "./telegramHelper.ts";
import { logAynActivity } from "./aynLogger.ts";

export type ImpactLevel = 'low' | 'medium' | 'high' | 'irreversible';

export interface DeliberationPosition {
  employee_id: string;
  employee_name: string;
  position: string;
  reasoning: string;
  confidence: number;
  objections: string;
  objective_impact: { objective_id: string; expected_delta: number; confidence: number }[];
  // Layer 3 additions
  reputation_score: number;
  cognitive_load: number;
  peer_trust_toward: Record<string, number>;
  doctrine_aligned: boolean;
}

export interface DeliberationResult {
  decision: string;
  reasoning: string;
  dissent: string[];
  confidence: number;
  impact_level: ImpactLevel;
  objective_impact: { objective_id: string; expected_delta: number; confidence: number }[];
  requires_approval: boolean;
  summary: string;
}

// ─── Anti-Over-Deliberation ───

const SKIP_DELIBERATION_ACTIONS = [
  'routine_health_check',
  'cron_sweep',
  'log_cleanup',
  'report_generation',
  'performance_tracking',
];

export function shouldDeliberate(actionType: string, impactLevel: ImpactLevel): boolean {
  if (SKIP_DELIBERATION_ACTIONS.includes(actionType)) return false;
  if (impactLevel === 'low') return false;
  return true;
}

// ─── Core Deliberation ───

export async function deliberate(
  supabase: any,
  topic: string,
  involvedEmployeeIds: string[],
  context: { actionType: string; impactLevel: ImpactLevel; additionalContext?: string },
  apiKey: string,
  broadcast?: { chatId: string; fallbackToken?: string },
): Promise<DeliberationResult> {
  const discussionId = crypto.randomUUID();

  // Load shared context + doctrine
  const [objectives, economics, companyState, doctrine] = await Promise.all([
    loadActiveObjectives(supabase),
    loadServiceEconomics(supabase),
    loadCompanyState(supabase),
    loadCurrentDoctrine(supabase),
  ]);

  // Load each employee's state in parallel
  const employeeStates = await Promise.all(
    involvedEmployeeIds.map(id => loadEmployeeState(supabase, id))
  );

  // Cognitive load gating: exclude agents with load > 0.8 from non-critical deliberations
  const filteredStates = employeeStates.filter(s => {
    if (!s) return false;
    if (context.impactLevel === 'high' || context.impactLevel === 'irreversible') return true;
    return (s.cognitive_load ?? 0.2) <= 0.8;
  });

  const doctrineStr = doctrine ? `\nCurrent strategic doctrine (${doctrine.period}): ${doctrine.strategic_shift}` : '';

  const contextBlock = `
Topic: ${topic}
Impact level: ${context.impactLevel}
${context.additionalContext ? `Additional context: ${context.additionalContext}` : ''}
${doctrineStr}

Company state: momentum=${companyState?.momentum}, stress=${companyState?.stress_level}, growth=${companyState?.growth_velocity}, risk=${companyState?.risk_exposure}

Active objectives:
${objectives.map(o => `- [P${o.priority}] ${o.title} (progress: ${o.current_value}/${o.target_value})`).join('\n')}

Service economics:
${economics.map(e => `- ${e.service_name}: ${e.category}, margin=${Math.round(e.average_margin * 100)}%, scalability=${e.scalability_score}/10`).join('\n')}`;

  // Generate positions in parallel (one LLM call per employee)
  const positions: DeliberationPosition[] = [];

  const positionPromises = filteredStates
    .filter(s => s !== null)
    .map(async (state) => {
      const prompt = `You are ${state!.employee_id} in AYN's AI workforce.
Your core motivation: ${state!.core_motivation}
Your beliefs: growth_priority=${state!.beliefs.growth_priority}, risk_tolerance=${state!.beliefs.risk_tolerance}
Your confidence: ${state!.confidence}
Your emotional stance: ${state!.emotional_stance}
Your reputation: ${state!.reputation_score?.toFixed(2) ?? '0.50'}
Your cognitive load: ${state!.cognitive_load?.toFixed(2) ?? '0.20'}

${contextBlock}

Give your position on this topic in 2-3 sentences. Be direct. Include:
1. Your stance (support/oppose/conditional)
2. Why (based on your motivation and the data)
3. Any objection to other likely positions
4. Impact on objectives (which objective, expected change, your confidence)
${doctrine ? `5. Whether your position aligns with the current strategic doctrine: "${doctrine.strategic_shift}"` : ''}

Respond as JSON: {"position":"...","reasoning":"...","objections":"...","confidence":0.X,"objective_impact":[{"objective_id":"...","expected_delta":0,"confidence":0.X}]${doctrine ? ',"doctrine_aligned":true/false' : ''}}`;

      try {
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

        return {
          employee_id: state!.employee_id,
          employee_name: state!.employee_id.replace(/_/g, ' '),
          position: parsed.position || 'no position',
          reasoning: parsed.reasoning || '',
          confidence: parsed.confidence || state!.confidence,
          objections: parsed.objections || '',
          objective_impact: parsed.objective_impact || [],
          reputation_score: state!.reputation_score ?? 0.5,
          cognitive_load: state!.cognitive_load ?? 0.2,
          peer_trust_toward: state!.peer_models ?? {},
          doctrine_aligned: parsed.doctrine_aligned ?? false,
        } as DeliberationPosition;
      } catch {
        return null;
      }
    });

  const results = await Promise.all(positionPromises);
  for (const r of results) {
    if (r) positions.push(r);
  }

  // Store debate in employee_discussions
  for (const pos of positions) {
    await supabase.from('employee_discussions').insert({
      discussion_id: discussionId,
      topic,
      employee_id: pos.employee_id,
      position: pos.position,
      reasoning: pos.reasoning,
      confidence: pos.confidence,
      objections: pos.objections,
      impact_level: context.impactLevel,
      objective_impact: pos.objective_impact,
    });
  }

  // ─── 60/40 + Doctrine Weighted Synthesis ───

  // Score each position
  const scoredPositions = positions.map(p => {
    // Objective alignment: average of expected deltas weighted by objective priority
    const objectiveScore = p.objective_impact.length > 0
      ? p.objective_impact.reduce((sum, oi) => {
          const obj = objectives.find(o => o.id === oi.objective_id || o.metric === oi.objective_id);
          const priorityWeight = obj ? (1 / obj.priority) : 0.5; // P1 = 1.0, P2 = 0.5, etc.
          return sum + (oi.expected_delta * oi.confidence * priorityWeight);
        }, 0) / p.objective_impact.length
      : 0;

    // Normalize objective score to 0-1 range (sigmoid-like clamping)
    const normalizedObjective = Math.max(0, Math.min(1, 0.5 + objectiveScore));

    // Reputation-adjusted confidence (floor at 0.25)
    const repAdjustedConfidence = p.confidence * Math.max(p.reputation_score, 0.25);

    // Doctrine bonus
    const doctrineBonus = (doctrine && p.doctrine_aligned) ? 0.1 : 0.0;

    // Final weight: 60/40 + doctrine
    const finalWeight = (0.6 * normalizedObjective) + (0.4 * repAdjustedConfidence) + doctrineBonus;

    return { ...p, finalWeight, normalizedObjective, repAdjustedConfidence, doctrineBonus };
  });

  // Sort by final weight descending
  scoredPositions.sort((a, b) => b.finalWeight - a.finalWeight);

  // Trust-filtered dissent: only surface objections from agents who distrust the top position holder
  const topPosition = scoredPositions[0];
  const dissent = scoredPositions
    .filter(p => {
      if (!p.objections || p.objections.length < 5) return false;
      if (p.employee_id === topPosition?.employee_id) return false;
      // Only raise objections if trust toward the top agent is < 0.5
      const trustTowardTop = p.peer_trust_toward[topPosition?.employee_id] ?? 0.5;
      return trustTowardTop < 0.5 && p.confidence > 0.6;
    })
    .slice(0, 2)
    .map(p => `${p.employee_name}: ${p.objections}`);

  // Average confidence (weighted by reputation)
  const totalRepWeight = scoredPositions.reduce((sum, p) => sum + Math.max(p.reputation_score, 0.25), 0);
  const avgConfidence = totalRepWeight > 0
    ? scoredPositions.reduce((sum, p) => sum + p.confidence * Math.max(p.reputation_score, 0.25), 0) / totalRepWeight
    : 0.5;

  // Aggregate objective impacts
  const objectiveImpacts: Record<string, { total_delta: number; confidence: number; count: number }> = {};
  for (const pos of scoredPositions) {
    for (const oi of pos.objective_impact) {
      if (!objectiveImpacts[oi.objective_id]) {
        objectiveImpacts[oi.objective_id] = { total_delta: 0, confidence: 0, count: 0 };
      }
      objectiveImpacts[oi.objective_id].total_delta += oi.expected_delta;
      objectiveImpacts[oi.objective_id].confidence += oi.confidence;
      objectiveImpacts[oi.objective_id].count++;
    }
  }

  const aggregatedImpact = Object.entries(objectiveImpacts).map(([id, data]) => ({
    objective_id: id,
    expected_delta: data.total_delta / data.count,
    confidence: data.confidence / data.count,
  }));

  // Determine if approval is required
  const requiresApproval =
    context.impactLevel === 'irreversible' ||
    (context.impactLevel === 'high' && aggregatedImpact.some(oi => {
      const obj = objectives.find(o => o.id === oi.objective_id || o.metric === oi.objective_id);
      return obj && obj.priority === 1;
    }));

  // ─── Post-Debate Trust Updates ───
  // Aligned agents get +0.05 peer trust; opposing agents get -0.03
  if (topPosition && scoredPositions.length > 1) {
    const trustUpdates: Promise<void>[] = [];
    for (const p of scoredPositions) {
      if (p.employee_id === topPosition.employee_id) continue;
      // Simple alignment check: same doctrine alignment as winner
      const aligned = p.doctrine_aligned === topPosition.doctrine_aligned &&
        Math.sign(p.finalWeight - 0.5) === Math.sign(topPosition.finalWeight - 0.5);
      const delta = aligned ? 0.05 : -0.03;
      trustUpdates.push(updatePeerTrust(supabase, topPosition.employee_id, p.employee_id, delta));
      trustUpdates.push(updatePeerTrust(supabase, p.employee_id, topPosition.employee_id, delta));
    }
    // Fire and forget — don't block the response
    Promise.all(trustUpdates).catch(() => {});
  }

  // Build natural language summary
  const summary = summarizeDebate(scoredPositions, dissent, avgConfidence, requiresApproval, doctrine?.strategic_shift);

  const result: DeliberationResult = {
    decision: topPosition?.position || 'no consensus',
    reasoning: scoredPositions.map(p => `${p.employee_name} (w:${p.finalWeight.toFixed(2)}): ${p.reasoning}`).join(' | '),
    dissent,
    confidence: avgConfidence,
    impact_level: context.impactLevel,
    objective_impact: aggregatedImpact,
    requires_approval: requiresApproval,
    summary,
  };

  // ─── Telegram Live Broadcast ───
  if (broadcast && context.impactLevel !== 'low') {
    try {
      // Rate limit: max 1 broadcast per hour
      const { data: recentBroadcasts } = await supabase
        .from('ayn_activity_log')
        .select('id')
        .eq('action_type', 'deliberation_broadcast')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (!recentBroadcasts || recentBroadcasts.length === 0) {
      await broadcastDeliberation(
          supabase,
          broadcast.chatId,
          topic,
          context.impactLevel,
          positions,
          result,
          topPosition ? { employee_id: topPosition.employee_id, finalWeight: topPosition.finalWeight } : null,
          doctrine?.strategic_shift,
          broadcast.fallbackToken,
        );
        await logAynActivity(supabase, 'deliberation_broadcast', `Live debate: ${topic}`, {
          details: { impact: context.impactLevel, agents: positions.length, topic },
        });
      } else {
        console.log('[DELIBERATION] Skipped broadcast — rate limited (1/hour)');
      }
    } catch (e) {
      console.error('[DELIBERATION] Broadcast failed:', e);
    }
  }

  // Store synthesis as system message
  await supabase.from('employee_discussions').insert({
    discussion_id: discussionId,
    topic,
    employee_id: 'system',
    position: result.decision,
    reasoning: result.summary,
    confidence: result.confidence,
    objections: result.dissent.join(' | '),
    impact_level: context.impactLevel,
    objective_impact: result.objective_impact,
  }).catch(() => {});

  return result;
}

// ─── Natural Language Summarization ───

function summarizeDebate(
  positions: (DeliberationPosition & { finalWeight: number; doctrineBonus: number })[],
  dissent: string[],
  avgConfidence: number,
  requiresApproval: boolean,
  currentDoctrine?: string
): string {
  if (positions.length === 0) return "couldn't get enough input to make a call on this.";

  const parts: string[] = [];
  parts.push("we discussed this internally.");

  // Main positions (top 3 by weight)
  for (const p of positions.slice(0, 3)) {
    const name = p.employee_name.charAt(0).toUpperCase() + p.employee_name.slice(1);
    const docTag = p.doctrineBonus > 0 ? ' [doctrine-aligned]' : '';
    parts.push(`${name} (weight: ${p.finalWeight.toFixed(2)}${docTag}): "${p.position}"`);
  }

  if (dissent.length > 0) {
    parts.push(`\npushback: ${dissent.join(' ')}`);
  }

  if (currentDoctrine) {
    parts.push(`\ncurrent doctrine: "${currentDoctrine}"`);
  }

  const confStr = avgConfidence >= 0.8 ? 'high confidence' : avgConfidence >= 0.6 ? 'moderate confidence' : 'low confidence — I\'d want more data';
  parts.push(`\noverall: ${confStr} (${Math.round(avgConfidence * 10)}/10).`);

  if (requiresApproval) {
    parts.push("\n⚠️ this is high-impact. waiting for your go-ahead before executing.");
  }

  return parts.join(' ');
}
