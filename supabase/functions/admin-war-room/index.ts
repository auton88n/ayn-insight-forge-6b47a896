import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { getAgentEmoji, getAgentDisplayName } from "../_shared/aynBrand.ts";
import { loadCompanyState, loadActiveObjectives, loadEmployeeState } from "../_shared/employeeState.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// === 3-Layer Roster ===
const EXECUTIVE = ['system', 'chief_of_staff'];
const STRATEGIC = ['advisor', 'innovation', 'hr_manager'];
const OPERATIONAL = ['sales', 'investigator', 'follow_up', 'marketing', 'customer_success', 'qa_watchdog', 'security_guard', 'lawyer'];

// One-line war room roles — replaces the 200-word personality dump
const WAR_ROOM_ROLES: Record<string, string> = {
  system: "Co-Founder & orchestrator. You set direction and make final calls.",
  chief_of_staff: "Meta-orchestrator. You align the team and gate priorities.",
  advisor: "Strategic advisor. You synthesize data into long-term direction.",
  innovation: "Innovation lead. You push experiments and new ideas.",
  hr_manager: "HR & culture lead. You track performance and team health.",
  sales: "Sales hunter. You push for revenue, pipeline, and closing deals.",
  investigator: "Data investigator. You dig deep to find hidden patterns.",
  follow_up: "Follow-up agent. You ensure nothing falls through the cracks.",
  marketing: "Marketing strategist. You drive brand, content, and positioning.",
  customer_success: "Customer success. You fight churn and improve retention.",
  qa_watchdog: "QA watchdog. You monitor quality, uptime, and system health.",
  security_guard: "Security guard. You flag risks, threats, and vulnerabilities.",
  lawyer: "Legal counsel. You ensure compliance and manage legal risk.",
};

function selectRelevantAgents(topic: string): string[] {
  const msg = topic.toLowerCase();
  const selected = new Set<string>([...EXECUTIVE, ...STRATEGIC]);

  // Add operational agents by keyword relevance
  if (msg.includes('sale') || msg.includes('lead') || msg.includes('revenue') || msg.includes('deal') || msg.includes('pipeline')) selected.add('sales');
  if (msg.includes('market') || msg.includes('brand') || msg.includes('content') || msg.includes('campaign') || msg.includes('competitor')) selected.add('marketing');
  if (msg.includes('security') || msg.includes('attack') || msg.includes('threat') || msg.includes('breach') || msg.includes('hack')) selected.add('security_guard');
  if (msg.includes('legal') || msg.includes('compliance') || msg.includes('gdpr') || msg.includes('contract') || msg.includes('risk')) selected.add('lawyer');
  if (msg.includes('customer') || msg.includes('churn') || msg.includes('retention') || msg.includes('user') || msg.includes('onboard')) selected.add('customer_success');
  if (msg.includes('quality') || msg.includes('bug') || msg.includes('uptime') || msg.includes('monitor') || msg.includes('test')) selected.add('qa_watchdog');
  if (msg.includes('data') || msg.includes('analyz') || msg.includes('pattern') || msg.includes('research') || msg.includes('investigate')) selected.add('investigator');
  if (msg.includes('follow') || msg.includes('email') || msg.includes('reply') || msg.includes('outreach')) selected.add('follow_up');

  // Fill remaining operational agents randomly up to 10 total
  const remaining = OPERATIONAL.filter(a => !selected.has(a));
  while (selected.size < 10 && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    selected.add(remaining.splice(idx, 1)[0]);
  }

  return Array.from(selected);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Check admin
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { topic } = await req.json();
    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY') || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const selectedAgents = selectRelevantAgents(topic);
    const discussionId = crypto.randomUUID();

    // Load shared context
    const [companyState, objectives] = await Promise.all([
      loadCompanyState(supabase),
      loadActiveObjectives(supabase),
    ]);

    const contextBlock = `Company: momentum=${companyState?.momentum}, stress=${companyState?.stress_level}. Active objectives: ${objectives.slice(0, 3).map((o: any) => `${o.title} (P${o.priority})`).join(', ')}`;

    // AYN speaks first, then rest in order
    const orderedAgents = ['system', ...selectedAgents.filter(a => a !== 'system')];

    const conversationThread: { name: string; reply: string }[] = [];
    const allInserted: any[] = [];

    for (const agentId of orderedAgents) {
      const state = await loadEmployeeState(supabase, agentId);
      const name = getAgentDisplayName(agentId);
      const role = WAR_ROOM_ROLES[agentId] || 'Team member.';

      // Build conversation history
      let discussionSoFar = '';
      if (conversationThread.length > 0) {
        discussionSoFar = conversationThread.map(m => `${m.name}: "${m.reply}"`).join('\n');
      }

      const isFirst = conversationThread.length === 0;

      const systemMsg = `You are ${name}. ${role} STRICT RULE: Reply in ONE sentence only. Maximum 20 words. No fluff. Stay in character.`;

      const userMsg = isFirst
        ? `${contextBlock}\n\nThe founder wants the team to discuss: "${topic}"\n\nYou speak FIRST. Set the direction.`
        : `${contextBlock}\n\nTopic: "${topic}"\n\n[Discussion so far]\n${discussionSoFar}\n\nYour turn. React to what others said. Agree, disagree, or build on their points. Reference them by name.`;

      try {
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: userMsg },
            ],
            max_tokens: 60,
          }),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (!reply) continue;

        const { data: inserted, error: insertError } = await supabase
          .from('employee_discussions')
          .insert({
            discussion_id: discussionId,
            employee_id: agentId,
            topic,
            position: reply,
            reasoning: null,
            confidence: state?.confidence ?? 0.7,
            impact_level: 'medium',
          })
          .select()
          .single();

        if (!insertError && inserted) {
          allInserted.push(inserted);
          conversationThread.push({ name, reply });
        }
      } catch {
        // skip failed agent
      }
    }

    return new Response(JSON.stringify({
      discussion_id: discussionId,
      messages: allInserted,
      agents: orderedAgents,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('War room error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
