import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { sendTelegramMessage } from "../_shared/telegramHelper.ts";
import { getEmployeeSystemPrompt, formatNatural } from "../_shared/aynBrand.ts";
import { logReflection } from "../_shared/employeeState.ts";

const EMPLOYEE_ID = 'lawyer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    let body: any = {};
    try { body = await req.json(); } catch {}
    const mode = body.mode || 'compliance_scan';

    if (mode === 'legal_review') {
      const topic = body.topic || 'general compliance';
      const analysis = await aiLegalAnalysis(LOVABLE_API_KEY, `Provide a legal analysis for AYN (aynn.io), a SaaS platform operating in Saudi Arabia, regarding: ${topic}. Consider GDPR, PDPL (Saudi Personal Data Protection Law), data protection, ToS requirements, and liability.`);

      await supabase.from('ayn_mind').insert({
        type: 'legal_analysis',
        content: formatNatural(EMPLOYEE_ID, `re: ${topic}\n\n${analysis}`, 'strategic'),
        context: { from_employee: EMPLOYEE_ID, topic },
        shared_with_admin: true,
      });

      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, formatNatural(EMPLOYEE_ID, `legal review: ${topic}\n\n${analysis}`, 'strategic'));
      }

      return jsonRes({ success: true, topic, analysis });
    }

    if (mode === 'contract_check') {
      const contractText = body.text || '';
      if (!contractText) return jsonRes({ error: 'No contract text provided' }, 400);

      const analysis = await aiLegalAnalysis(LOVABLE_API_KEY, `Review this contract/agreement for AYN (aynn.io) and identify:\n1. Potential risks (with severity: HIGH/MEDIUM/LOW)\n2. Missing clauses we should insist on\n3. Unfavorable terms to negotiate\n4. Specific recommendations\n\nContract:\n${contractText.slice(0, 8000)}`);

      await supabase.from('ayn_mind').insert({
        type: 'legal_analysis',
        content: formatNatural(EMPLOYEE_ID, `contract review:\n\n${analysis}`, 'strategic'),
        context: { from_employee: EMPLOYEE_ID, type: 'contract_review' },
        shared_with_admin: true,
      });

      return jsonRes({ success: true, analysis });
    }

    // Default: Daily compliance scan
    const findings: string[] = [];

    // 1. Check for high/critical security events
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: securityLogs } = await supabase
      .from('security_logs')
      .select('action, severity, details')
      .gte('created_at', ago24h)
      .in('severity', ['high', 'critical'])
      .limit(20);

    if (securityLogs?.length) {
      findings.push(`[HIGH] ${securityLogs.length} high/critical security event(s) in 24h — requires review per PDPL Article 22`);
      const types = [...new Set(securityLogs.map((l: any) => l.action))];
      findings.push(`Event types: ${types.join(', ')}`);
    }

    // 2. Check for unencrypted sensitive data
    const { count: unencryptedAlerts } = await supabase
      .from('alert_history')
      .select('*', { count: 'exact', head: true })
      .is('recipient_email_encrypted', null);

    if (unencryptedAlerts && unencryptedAlerts > 0) {
      findings.push(`[MEDIUM] ${unencryptedAlerts} alert(s) with unencrypted email addresses — GDPR Art. 32 / PDPL Art. 19 violation risk`);
    }

    // 3. Check data retention
    const ago90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count: oldLogs } = await supabase
      .from('security_logs')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', ago90d);

    if (oldLogs && oldLogs > 1000) {
      findings.push(`[LOW] ${oldLogs} security logs older than 90 days — review data minimization obligations under PDPL Art. 10`);
    }

    // 4. Check user data exposure
    const { count: publicProfiles } = await supabase
      .from('creator_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true);

    findings.push(`[INFO] ${publicProfiles || 0} public creator profiles — ensure consent mechanisms comply with PDPL Art. 6`);

    // AI compliance summary with personality
    const complianceSummary = await aiLegalAnalysis(LOVABLE_API_KEY, `Based on these findings from AYN's daily compliance scan, provide a brief risk assessment with severity levels and priority actions:\n\n${findings.join('\n')}`);

    // Save report with personality
    const reportContent = `Daily Compliance Scan Complete\n\nFindings:\n${findings.map(f => `• ${f}`).join('\n')}\n\nRisk Assessment:\n${complianceSummary}`;

    await supabase.from('ayn_mind').insert({
      type: 'legal_analysis',
      content: formatNatural(EMPLOYEE_ID, `compliance scan: ${findings.length} finding(s).\n\n${findings.join('\n')}\n\n${complianceSummary}`, findings.some(f => f.includes('[HIGH]')) ? 'incident' : 'casual'),
      context: { from_employee: EMPLOYEE_ID, scan_type: 'daily_compliance', findings_count: findings.length },
      shared_with_admin: true,
    });

    if (findings.some(f => f.includes('[HIGH]')) && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
        formatNatural(EMPLOYEE_ID, `compliance alert — HIGH findings: ${findings.filter(f => f.includes('[HIGH]')).join('; ')}. review within 24h.`, 'incident')
      );
    }

    await logReflection(supabase, {
      employee_id: EMPLOYEE_ID,
      action_ref: 'daily_compliance_scan',
      reasoning: `Scanned security events, encryption, data retention, user exposure. ${findings.length} findings.`,
      expected_outcome: 'Maintain regulatory compliance across GDPR and PDPL',
      confidence: 0.8,
      what_would_change_mind: 'If new regulations are introduced that we haven\'t accounted for',
    });

    await logAynActivity(supabase, 'compliance_scan', `Compliance scan: ${findings.length} finding(s)`, {
      details: { findings },
      triggered_by: EMPLOYEE_ID,
    });

    return jsonRes({ success: true, findings, summary: complianceSummary });
  } catch (error) {
    console.error('ayn-lawyer error:', error);
    return jsonRes({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function aiLegalAnalysis(apiKey: string, prompt: string): Promise<string> {
  const systemPrompt = getEmployeeSystemPrompt('lawyer', `You provide concise legal analysis for AYN (aynn.io), a SaaS platform operating from Saudi Arabia. Cover GDPR, PDPL (Saudi Personal Data Protection Law), data protection, liability, and regulatory compliance. Be specific — cite actual regulations. Provide actionable recommendations, not just warnings. Max 500 words.`);

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{
          role: 'system',
          content: systemPrompt,
        }, {
          role: 'user',
          content: prompt,
        }],
      }),
    });
    if (!res.ok) return 'Legal analysis unavailable — will retry on next scan.';
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No analysis generated';
  } catch {
    return 'Legal analysis failed — flagging for manual review.';
  }
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}
