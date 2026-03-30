import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { formatNatural, detectToneContext } from "../_shared/aynBrand.ts";
import { loadEmployeeState, loadCompanyState, loadActiveObjectives, updateEmployeeState, logReflection, buildEmployeeContext } from "../_shared/employeeState.ts";
import { applySystemDecay, loadCurrentDoctrine, isDoctrinStale } from "../_shared/politicalIntelligence.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMPLOYEE_ID = 'chief_of_staff';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Load own state and company context
    const [myState, companyState, objectives, employeeContext] = await Promise.all([
      loadEmployeeState(supabase, EMPLOYEE_ID),
      loadCompanyState(supabase),
      loadActiveObjectives(supabase),
      buildEmployeeContext(supabase, EMPLOYEE_ID),
    ]);

    // 1. Check all employee activity in last cycle (2h)
    const ago2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: recentActivity },
      { data: allStates },
      { data: recentReports },
      { data: recentDiscussions },
    ] = await Promise.all([
      supabase.from('ayn_activity_log').select('triggered_by, action_type, summary').gte('created_at', ago2h).order('created_at', { ascending: false }).limit(50),
      supabase.from('employee_states').select('employee_id, beliefs, emotional_stance, confidence, core_motivation, active_objectives, reputation_score, initiative_score, cognitive_load, emotional_memory'),
      supabase.from('ayn_mind').select('content, context').eq('type', 'employee_report').gte('created_at', ago2h).limit(20),
      supabase.from('employee_discussions').select('topic, employee_id, position, confidence').gte('created_at', ago24h).limit(20),
    ]);

    // Layer 3: Apply system decay for all 13 agents
    const decayPromises = (allStates || []).map((s: any) => applySystemDecay(supabase, s.employee_id));
    await Promise.all(decayPromises);

    // Layer 3: Load doctrine and check staleness
    const doctrine = await loadCurrentDoctrine(supabase);
    const doctrineStaleness = isDoctrinStale(doctrine);

    // Layer 3: Flag agents with low reputation
    const lowRepAgents = (allStates || [])
      .filter((s: any) => (s.reputation_score ?? 0.5) < 0.3)
      .map((s: any) => s.employee_id);

    // Layer 3: Rank agents by initiative * reputation for briefings
    const agentRankings = (allStates || [])
      .filter((s: any) => s.employee_id !== 'system')
      .map((s: any) => ({
        id: s.employee_id,
        score: (s.initiative_score ?? 0.5) * (s.reputation_score ?? 0.5),
      }))
      .sort((a: any, b: any) => b.score - a.score);

    // 2. Detect idle employees (no activity in 24h)
    const { data: dayActivity } = await supabase
      .from('ayn_activity_log')
      .select('triggered_by')
      .gte('created_at', ago24h);

    const activeEmployees = new Set((dayActivity || []).map((a: any) => a.triggered_by));
    const allEmployeeIds = (allStates || []).map((s: any) => s.employee_id);
    const idleEmployees = allEmployeeIds.filter((id: string) => !activeEmployees.has(id) && id !== 'system' && id !== EMPLOYEE_ID);

    // 3. Detect misalignment — employees with conflicting beliefs on same objectives
    const misalignments: string[] = [];
    if (allStates) {
      const salesState = allStates.find((s: any) => s.employee_id === 'sales');
      const securityState = allStates.find((s: any) => s.employee_id === 'security_guard');
      if (salesState && securityState) {
        const salesRisk = salesState.beliefs?.risk_tolerance || 0.5;
        const securityRisk = securityState.beliefs?.risk_tolerance || 0.5;
        if (Math.abs(salesRisk - securityRisk) > 0.5) {
          misalignments.push(`Sales risk tolerance (${salesRisk}) significantly diverges from Security (${securityRisk})`);
        }
      }
    }

    // 4. Synthesize with AI
    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: `You are the Chief of Staff for AYN's AI workforce. You produce brief alignment notes — not formatted reports.

${employeeContext}

Your job: check if the team is aligned to objectives, flag idle agents, detect conflicts, and update company state.
Respond naturally. No borders. No headers. Just a clear, honest internal note.
If everything is aligned, say so briefly. If there are issues, be specific.`,
        }, {
          role: 'user',
          content: `Recent activity (last 2h): ${recentActivity?.length || 0} actions across ${activeEmployees.size} employees.
Idle employees (24h): ${idleEmployees.length > 0 ? idleEmployees.join(', ') : 'none'}
Misalignments: ${misalignments.length > 0 ? misalignments.join('; ') : 'none detected'}
Recent reports: ${recentReports?.length || 0}
Recent debates: ${recentDiscussions?.length || 0}
${lowRepAgents.length > 0 ? `\n⚠️ Low reputation agents (< 0.3): ${lowRepAgents.join(', ')} — consider flagging to HR` : ''}
${doctrineStaleness ? `\n⚠️ Strategic doctrine may be stale (${doctrine ? `last updated: ${doctrine.period}` : 'no doctrine set'}). Consider updating company journal.` : ''}
Agent rankings (initiative × reputation): ${agentRankings.slice(0, 5).map((a: any) => `${a.id}:${a.score.toFixed(2)}`).join(', ')}

Objectives:
${objectives.map(o => `[P${o.priority}] ${o.title}: ${o.current_value}/${o.target_value}`).join('\n')}

Current company state: momentum=${companyState?.momentum}, stress=${companyState?.stress_level}, growth=${companyState?.growth_velocity}

Write a brief alignment note. Flag anything that needs attention.`,
        }],
      }),
    });

    if (!aiRes.ok) throw new Error('AI synthesis failed');
    const aiData = await aiRes.json();
    const note = aiData.choices?.[0]?.message?.content?.trim() || 'Could not generate alignment note';

    // 5. Update company state based on signals
    const newStress = Math.min(0.9, Math.max(0.1,
      (companyState?.stress_level || 0.2) +
      (misalignments.length * 0.1) +
      (idleEmployees.length > 3 ? 0.1 : 0) -
      (recentActivity?.length > 10 ? 0.05 : 0)
    ));

    const newMomentum = recentActivity && recentActivity.length > 15 ? 'high' :
      recentActivity && recentActivity.length > 5 ? 'stable' : 'low';

    await supabase.from('company_state').update({
      stress_level: newStress,
      momentum: newMomentum,
      updated_by: EMPLOYEE_ID,
    }).not('id', 'is', null); // Update the single row

    // 6. Save as employee report
    const tone = detectToneContext(note, newStress);
    await supabase.from('ayn_mind').insert({
      type: 'employee_report',
      content: formatNatural(EMPLOYEE_ID, note, tone),
      context: {
        from_employee: EMPLOYEE_ID,
        idle_employees: idleEmployees,
        misalignments,
        active_count: activeEmployees.size,
        stress_level: newStress,
      },
      shared_with_admin: false,
    });

    // 7. Log reflection
    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'alignment_check',
      reasoning: `Checked ${allEmployeeIds.length} employees. ${idleEmployees.length} idle. ${misalignments.length} misalignments.`,
      expected_outcome: 'Team stays aligned to objectives',
      confidence: myState?.confidence || 0.7,
      what_would_change_mind: 'Multiple employees drifting from priority-1 objective',
    });

    // 8. Alert founder only if there are significant issues
    if ((misalignments.length > 0 || idleEmployees.length > 3) && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, formatNatural(EMPLOYEE_ID, note, 'incident'));
    }

    await logAynActivity(supabase, 'chief_of_staff_alignment', `Alignment check: ${activeEmployees.size} active, ${idleEmployees.length} idle, ${misalignments.length} conflicts`, {
      details: { idle: idleEmployees, misalignments, stress: newStress },
      triggered_by: EMPLOYEE_ID,
    });

    return new Response(JSON.stringify({ success: true, idle: idleEmployees, misalignments, stress: newStress }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ayn-chief-of-staff error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
