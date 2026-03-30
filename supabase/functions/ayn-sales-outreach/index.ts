import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { logAynActivity } from "../_shared/aynLogger.ts";
import { AYN_BRAND, getEmployeeSystemPrompt, formatNatural } from "../_shared/aynBrand.ts";
import { logReflection } from "../_shared/employeeState.ts";
import { scrapeUrl } from "../_shared/firecrawlHelper.ts";
import { sanitizeForPrompt, FIRECRAWL_CONTENT_GUARD } from "../_shared/sanitizeFirecrawl.ts";
import { sanitizeUserPrompt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { notifyFounder } from "../_shared/proactiveAlert.ts";

const EMPLOYEE_ID = 'sales';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SERVICES = AYN_BRAND.services;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const { mode, url, lead_id, email_draft, search_query, source } = body;

    switch (mode) {
      case 'prospect':
        return await handleProspect(supabase, url);
      case 'draft_email':
        return await handleDraftEmail(supabase, lead_id);
      case 'send_email':
        return await handleSendEmail(supabase, lead_id, email_draft);
      case 'follow_up':
        return await handleFollowUp(supabase, lead_id);
      case 'pipeline_status':
        return await handlePipelineStatus(supabase);
      case 'search_leads':
        return await handleSearchLeads(supabase, search_query);
      default:
        // Cron mode: run pipeline check autonomously
        if (source === 'cron' || !mode) {
          return await handleCronCycle(supabase);
        }
        return jsonResponse({ error: `Unknown mode: ${mode}` }, 400);
    }
  } catch (error) {
    console.error('ayn-sales-outreach error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// ─── Scrape website via Firecrawl ───
async function scrapeWebsite(url: string): Promise<{ content: string; metadata: any }> {
  const result = await scrapeUrl(url, { onlyMainContent: true });
  if (result.success) {
    return {
      content: result.markdown || 'Could not extract content',
      metadata: result.metadata || {},
    };
  }
  return { content: 'Could not fetch website', metadata: {} };
}

// ─── Prospect a company URL ───
async function handleProspect(supabase: any, url: string) {
  if (!url) return jsonResponse({ error: 'URL is required' }, 400);

  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith('http')) formattedUrl = `https://${formattedUrl}`;

  console.log('Prospecting:', formattedUrl);

  const { content: websiteContent, metadata } = await scrapeWebsite(formattedUrl);

  // Use AI to analyze the company
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return jsonResponse({ error: 'LOVABLE_API_KEY not configured' }, 500);

  const analysisRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{
        role: 'system',
        content: `You are a sales analyst. Analyze this company's website and identify:
1. Company name
2. Industry
3. Contact email (look for info@, contact@, hello@, or any visible email)
4. Contact person name (if visible)
5. Pain points — what problems do they have that our services could solve?
6. Website quality score (1-10) — is their site modern, fast, well-designed?
7. Which of our services would help them most?

Our services: ${SERVICES.map(s => `${s.name}: ${s.desc}`).join('\n')}
${FIRECRAWL_CONTENT_GUARD}
Respond in JSON format:
{
  "company_name": "...",
  "industry": "...",
  "contact_email": "...",
  "contact_name": "...",
  "pain_points": ["..."],
  "website_quality": 7,
  "recommended_services": ["AI Employees", "Smart Ticketing Systems"],
  "notes": "Brief assessment of opportunity"
}` + INJECTION_GUARD,
      }, {
        role: 'user',
        content: `Website URL: ${formattedUrl}\nTitle: ${metadata.title || 'Unknown'}\n\nContent:\n${sanitizeForPrompt(websiteContent, 8000)}`,
      }],
    }),
  });

  if (!analysisRes.ok) {
    return jsonResponse({ error: 'AI analysis failed' }, 500);
  }

  const aiData = await analysisRes.json();
  let analysis: any;
  try {
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return jsonResponse({ error: 'Failed to parse AI analysis' }, 500);
  }

  if (!analysis) return jsonResponse({ error: 'No analysis result' }, 500);

  // Check if lead already exists
  const { data: existing } = await supabase
    .from('ayn_sales_pipeline')
    .select('id')
    .eq('company_url', formattedUrl)
    .limit(1);

  if (existing?.length) {
    return jsonResponse({ success: true, message: 'Lead already exists in pipeline', lead_id: existing[0].id, analysis });
  }

  // Insert new lead
  const { data: newLead, error: insertErr } = await supabase
    .from('ayn_sales_pipeline')
    .insert({
      company_name: analysis.company_name || metadata.title || 'Unknown Company',
      company_url: formattedUrl,
      contact_email: analysis.contact_email || '',
      contact_name: analysis.contact_name || null,
      industry: analysis.industry || null,
      pain_points: analysis.pain_points || [],
      recommended_services: analysis.recommended_services || [],
      notes: analysis.notes || null,
      context: { website_quality: analysis.website_quality, scraped_at: new Date().toISOString(), metadata },
      status: 'lead',
    })
    .select('id')
    .single();

  if (insertErr) return jsonResponse({ error: `Failed to save lead: ${insertErr.message}` }, 500);

  await supabase.from('ayn_mind').insert({
    type: 'sales_lead',
    content: formatNatural(EMPLOYEE_ID, `new target: ${analysis.company_name} (${analysis.industry}). pain points: ${analysis.pain_points?.join(', ')}. our play: ${analysis.recommended_services?.join(', ')}. quality: ${analysis.website_quality}/10. ${analysis.notes || 'looks promising.'}`, 'casual'),
    context: { lead_id: newLead.id, company_url: formattedUrl, ...analysis },
    shared_with_admin: false,
  });

  await logAynActivity(supabase, 'sales_prospect', `Prospected ${analysis.company_name} from ${formattedUrl}`, {
    target_id: newLead.id, target_type: 'sales_lead',
    details: analysis,
    triggered_by: 'sales_outreach',
  });

  await notifyFounder(supabase, {
    employee_id: EMPLOYEE_ID,
    message: `new lead: ${analysis.company_name} (${analysis.industry || 'unknown industry'}). website quality ${analysis.website_quality}/10. pain points: ${(analysis.pain_points || []).slice(0, 2).join(', ')}. want me to draft an outreach?`,
    priority: analysis.website_quality >= 7 ? 'info' : 'info',
    needs_approval: true,
    details: { lead_id: newLead.id, quality: analysis.website_quality },
  });

  return jsonResponse({ success: true, lead_id: newLead.id, analysis });
}

// ─── Draft an outreach email ───
async function handleDraftEmail(supabase: any, lead_id: string) {
  if (!lead_id) return jsonResponse({ error: 'lead_id is required' }, 400);

  const { data: lead } = await supabase
    .from('ayn_sales_pipeline')
    .select('*')
    .eq('id', lead_id)
    .single();

  if (!lead) return jsonResponse({ error: 'Lead not found' }, 404);

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return jsonResponse({ error: 'LOVABLE_API_KEY not configured' }, 500);

  const emailNumber = (lead.emails_sent || 0) + 1;
  const angle = emailNumber === 1
    ? 'First contact — identify their biggest pain point and show how we solve it. Reference almufaijer.com as proof.'
    : emailNumber === 2
    ? 'Follow-up — different angle, more specific value proposition. Mention a specific feature that would help them.'
    : 'Final follow-up — create urgency or offer a free consultation/demo. Keep it short.';

  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{
        role: 'system',
        content: `You're writing a sales email for AYN (aynn.io). We build AI-powered solutions for businesses.

Write a ${emailNumber === 1 ? 'cold outreach' : 'follow-up'} email that sounds like it's from a real person — not a template.

Rules:
- Write like a human, not a corporation. Conversational, warm, direct.
- Short — 3 paragraphs max. Nobody reads long cold emails.
- Reference their SPECIFIC problems. Show you actually looked at their business.
- One clear CTA — reply, book a call, or check our work
- Portfolio: https://almufaijer.com (a project we built — mention naturally, not as a bullet point)
- Sign off with a personal name + role. Example: "Sarah, Sales @ AYN" or "Mark, Growth Lead @ AYN". NEVER sign as "AYN Team", "The AYN Team", "Best, AYN Team", or any variation of a team signature. Always use a personal first name + a role that fits the context.
- From: info@aynn.io
- ${angle}
- Don't use phrases like "I hope this email finds you well", "I wanted to reach out", "leverage", "synergy", "streamline". Write like you'd text a business contact.

Our services: ${SERVICES.map(s => s.name).join(', ')}

Respond in JSON:
{
  "subject": "...",
  "html_body": "...",
  "plain_text": "..."
}`,
      }, {
        role: 'user',
        content: `Company: ${lead.company_name}\nContact: ${lead.contact_name || 'there'}\nIndustry: ${lead.industry || 'Unknown'}\nWebsite: ${lead.company_url || 'N/A'}\nPain points: ${lead.pain_points?.join(', ') || 'Unknown'}\nRecommended services: ${lead.recommended_services?.join(', ') || 'General'}\nPrevious emails sent: ${lead.emails_sent || 0}\nNotes: ${lead.notes || 'None'}`,
      }],
    }),
  });

  if (!aiRes.ok) return jsonResponse({ error: 'AI draft generation failed' }, 500);

  const aiData = await aiRes.json();
  let draft: any;
  try {
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    draft = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return jsonResponse({ error: 'Failed to parse email draft' }, 500);
  }

  // Fix signature if AI used "AYN Team" or similar
  if (draft) {
    const teamSignatureRegex = /(?:Best|Regards|Cheers|Thanks|Warm regards|Kind regards),?\s*\n?\s*(?:The\s+)?AYN\s*(?:Team)?(?:\s*\n?\s*AYN\s*Team)?/gi;
    const hasTeamSig = teamSignatureRegex.test(draft.html_body || '') || /AYN\s*Team/i.test(draft.html_body || '');
    if (hasTeamSig) {
      const names = ['Sarah', 'Mark', 'Lina', 'James', 'Noor'];
      const roles = ['Sales @ AYN', 'Growth Lead @ AYN', 'Partnerships @ AYN'];
      const name = names[Math.floor(Math.random() * names.length)];
      const role = roles[Math.floor(Math.random() * roles.length)];
      const personalSig = `${name}\n${role}`;
      // Reset regex since test() advances lastIndex
      const fixRegex = /(?:Best|Regards|Cheers|Thanks|Warm regards|Kind regards),?\s*\n?\s*(?:The\s+)?AYN\s*(?:Team)?(?:\s*\n?\s*AYN\s*Team)?/gi;
      draft.html_body = (draft.html_body || '').replace(fixRegex, personalSig);
      if (draft.plain_text) {
        draft.plain_text = draft.plain_text.replace(/(?:Best|Regards|Cheers|Thanks|Warm regards|Kind regards),?\s*\n?\s*(?:The\s+)?AYN\s*(?:Team)?(?:\s*\n?\s*AYN\s*Team)?/gi, personalSig);
      }
    }
  }

  await supabase.from('ayn_mind').insert({
    type: 'sales_draft',
    content: `Email draft for ${lead.company_name}: "${draft?.subject}"`,
    context: { lead_id, draft, email_number: emailNumber },
    shared_with_admin: true,
  });

  return jsonResponse({ success: true, lead_id, draft, email_number: emailNumber });
}

// ─── Send an approved email ───
async function handleSendEmail(supabase: any, lead_id: string, email_draft: any) {
  if (!lead_id) return jsonResponse({ error: 'lead_id is required' }, 400);

  const { data: lead } = await supabase
    .from('ayn_sales_pipeline')
    .select('*')
    .eq('id', lead_id)
    .single();

  if (!lead) return jsonResponse({ error: 'Lead not found' }, 404);
  if (!lead.contact_email) return jsonResponse({ error: 'No contact email for this lead' }, 400);

  if (lead.emails_sent === 0 && !lead.admin_approved) {
    return jsonResponse({ error: 'First contact requires admin approval. Use Telegram to approve.' }, 403);
  }

  const SMTP_HOST = Deno.env.get('SMTP_HOST');
  const SMTP_PORT = Deno.env.get('SMTP_PORT');
  const SMTP_USER = Deno.env.get('SMTP_USER');
  const SMTP_PASS = Deno.env.get('SMTP_PASS');
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return jsonResponse({ error: 'SMTP credentials not configured' }, 500);

  let draft = email_draft;
  if (!draft) {
    const draftRes = await handleDraftEmail(supabase, lead_id);
    const draftData = await draftRes.json();
    draft = draftData.draft;
  }

  if (!draft?.subject || !draft?.html_body) {
    return jsonResponse({ error: 'Invalid email draft' }, 400);
  }

  let sent = false;
  let emailResult: any = {};

  const attemptSmtpSend = async () => {
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: Number(SMTP_PORT) || 465,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASS },
      },
    });

    await client.send({
      from: `AYN <${SMTP_USER}>`,
      to: lead.contact_email,
      subject: draft.subject,
      content: draft.html_body,
      html: draft.html_body,
      replyTo: SMTP_USER,
    });

    await client.close();
  };

  try {
    await attemptSmtpSend();
    sent = true;
    emailResult = { status: 'sent', method: 'smtp' };
  } catch (smtpErr) {
    const errMsg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
    const isRateLimit = /rate.?limit|429|too many request/i.test(errMsg);

    if (isRateLimit) {
      console.log('Rate limited, retrying after 2s delay...');
      await new Promise(r => setTimeout(r, 2000));
      try {
        await attemptSmtpSend();
        sent = true;
        emailResult = { status: 'sent', method: 'smtp', retried: true };
      } catch (retryErr) {
        console.error('SMTP retry also failed:', retryErr);
        emailResult = { status: 'failed', error: retryErr instanceof Error ? retryErr.message : 'SMTP retry error', retried: true };
      }
    } else {
      console.error('SMTP send failed:', smtpErr);
      emailResult = { status: 'failed', error: errMsg };
    }
  }

  const nextFollowUp = new Date();
  nextFollowUp.setDate(nextFollowUp.getDate() + (lead.emails_sent === 0 ? 3 : 7));

  await supabase.from('ayn_sales_pipeline').update({
    emails_sent: (lead.emails_sent || 0) + 1,
    last_email_at: new Date().toISOString(),
    next_follow_up_at: nextFollowUp.toISOString(),
    status: lead.emails_sent === 0 ? 'contacted' : 'followed_up',
  }).eq('id', lead_id);

  await logAynActivity(supabase, 'sales_email_sent', `Sent ${lead.emails_sent === 0 ? 'outreach' : 'follow-up'} to ${lead.company_name} (${lead.contact_email})`, {
    target_id: lead_id, target_type: 'sales_lead',
    details: { subject: draft.subject, email_sent: sent, resend_result: emailResult },
    triggered_by: 'sales_outreach',
  });

  return jsonResponse({ success: sent, lead_id, email_result: emailResult });
}

// ─── Follow up on existing leads ───
async function handleFollowUp(supabase: any, lead_id: string) {
  if (!lead_id) return jsonResponse({ error: 'lead_id is required' }, 400);

  const { data: lead } = await supabase
    .from('ayn_sales_pipeline')
    .select('*')
    .eq('id', lead_id)
    .single();

  if (!lead) return jsonResponse({ error: 'Lead not found' }, 404);

  if (lead.emails_sent >= 3) {
    return jsonResponse({ error: 'Max 3 emails per lead reached' }, 400);
  }
  if (lead.status === 'rejected' || lead.status === 'converted') {
    return jsonResponse({ error: `Lead is ${lead.status}, no follow-up needed` }, 400);
  }
  if (lead.last_email_at) {
    const daysSince = (Date.now() - new Date(lead.last_email_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 3) {
      return jsonResponse({ error: `Too soon for follow-up. Last email was ${Math.round(daysSince)} day(s) ago. Minimum 3 days.` }, 400);
    }
  }

  const draftRes = await handleDraftEmail(supabase, lead_id);
  const draftData = await draftRes.json();

  if (!draftData.success) return jsonResponse(draftData, 500);

  if (lead.admin_approved) {
    return await handleSendEmail(supabase, lead_id, draftData.draft);
  }

  return jsonResponse({ success: true, needs_approval: true, draft: draftData.draft, lead_id });
}

// ─── Pipeline status ───
async function handlePipelineStatus(supabase: any) {
  const { data: leads } = await supabase
    .from('ayn_sales_pipeline')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!leads?.length) {
    return jsonResponse({ success: true, message: 'Pipeline is empty', stats: {}, leads: [] });
  }

  const stats: Record<string, number> = {};
  for (const lead of leads) {
    stats[lead.status] = (stats[lead.status] || 0) + 1;
  }

  const dueFollowUps = leads.filter((l: any) =>
    l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date() &&
    !['converted', 'rejected'].includes(l.status) && l.emails_sent < 3
  );

  return jsonResponse({
    success: true,
    total: leads.length,
    stats,
    due_follow_ups: dueFollowUps.length,
    leads: leads.map((l: any) => ({
      id: l.id,
      company: l.company_name,
      status: l.status,
      emails_sent: l.emails_sent,
      approved: l.admin_approved,
      next_follow_up: l.next_follow_up_at,
    })),
  });
}

// ─── Search for leads using Gemini to suggest URLs ───
async function handleSearchLeads(supabase: any, query: string) {
  if (!query) return jsonResponse({ error: 'search_query is required' }, 400);

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return jsonResponse({ error: 'LOVABLE_API_KEY not configured' }, 500);

  console.log('Searching for leads:', query);

  // Use Gemini to suggest likely company URLs
  const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [{
        role: 'system',
        content: `You are a B2B lead researcher. Given a search query about an industry or type of business, suggest 5 real company website URLs that match. Focus on small-to-medium businesses that could benefit from AI automation, websites, or customer support solutions.

Return ONLY a JSON array of URLs, nothing else:
["https://example1.com", "https://example2.com", ...]`,
      }, {
        role: 'user',
        content: query,
      }],
    }),
  });

  if (!aiRes.ok) return jsonResponse({ error: 'AI search failed' }, 500);

  const aiData = await aiRes.json();
  let urls: string[] = [];
  try {
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    urls = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return jsonResponse({ error: 'Failed to parse search results' }, 500);
  }

  // Prospect each URL
  const prospected: any[] = [];
  for (const u of urls.slice(0, 3)) {
    try {
      const prospectRes = await handleProspect(supabase, u);
      const prospectData = await prospectRes.json();
      if (prospectData.success) {
        prospected.push({ url: u, lead_id: prospectData.lead_id, analysis: prospectData.analysis });
      }
    } catch (e) {
      console.error('Failed to prospect:', u, e);
    }
  }

  await logAynActivity(supabase, 'sales_search', `Searched for leads: "${query}" — found ${prospected.length}`, {
    details: { query, urls_suggested: urls.length, prospected_count: prospected.length },
    triggered_by: 'sales_outreach',
  });

  return jsonResponse({ success: true, query, total_results: urls.length, prospected });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Cron cycle: autonomous pipeline check ───
async function handleCronCycle(supabase: any) {
  console.log('Sales cron cycle starting...');

  try {
    // Check pipeline status
    const statusRes = await handlePipelineStatus(supabase);
    const statusData = await statusRes.json();

    const total = statusData.total || 0;
    const dueFollowUps = statusData.due_follow_ups || 0;
    const stats = statusData.stats || {};

    const summary = `Pipeline: ${total} leads (${Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(', ')}). ${dueFollowUps} follow-ups due.`;

    await logAynActivity(supabase, 'sales_cron_cycle', summary, {
      details: { total, stats, due_follow_ups: dueFollowUps },
      triggered_by: EMPLOYEE_ID,
    });

    // Push proactive alert if there are follow-ups due or new leads
    if (dueFollowUps > 0) {
      await notifyFounder(supabase, {
        employee_id: EMPLOYEE_ID,
        message: `${dueFollowUps} follow-up${dueFollowUps > 1 ? 's' : ''} due in the pipeline. ${total} total leads. want me to handle them?`,
        priority: dueFollowUps >= 5 ? 'warning' : 'info',
        needs_approval: true,
        details: { total, stats, due_follow_ups: dueFollowUps },
      });
    }

    if (total === 0) {
      await notifyFounder(supabase, {
        employee_id: EMPLOYEE_ID,
        message: "pipeline's empty. give me some target industries or company URLs and I'll start hunting.",
        priority: 'info',
      });
    }

    if (total === 0) {
      await logReflection(supabase, {
        employee_id: EMPLOYEE_ID,
        action_ref: 'cron_empty_pipeline',
        reasoning: 'No leads in pipeline. Need founder to provide target URLs or search queries via Telegram.',
        expected_outcome: 'Founder feeds leads or enables autonomous search',
        confidence: 0.5,
        what_would_change_mind: 'If leads arrive from other sources',
      });
    }

    return jsonResponse({ success: true, cron: true, summary, stats, due_follow_ups: dueFollowUps });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown cron error';
    console.error('Sales cron cycle error:', errMsg);
    await logAynActivity(supabase, 'sales_cron_error', `Cron cycle failed: ${errMsg}`, {
      triggered_by: EMPLOYEE_ID,
    });
    return jsonResponse({ success: false, error: errMsg }, 500);
  }
}
