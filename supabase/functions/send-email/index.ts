import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';
import { escapeHtml, wrapEmail, heading, para, ctaButton } from '../_shared/emailTemplate.ts';

// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface EmailRequest {
  to: string;
  emailType: 'welcome';
  data: { userName?: string; role?: string };
  userId?: string;
}

// v3.114.0 — this file used to hold nine templates (welcome, credit_warning,
// auto_delete_warning, payment_receipt, password_reset, subscription_created/
// renewed/canceled/updated), all on a flat black-and-white header/footer with
// zero relation to the current "Charcoal & Ember" branding, and all
// describing the retired consulting/engineering product ("Civil & Structural
// Engineering Calculations", "Creative Design Ideas", daily message-tier
// credits). Eight of the nine were never reachable by any real caller —
// AuthModal.tsx's post-signup call (the only real caller anywhere in src/)
// has always passed emailType: 'welcome' and nothing else, and every other
// type required the service-role key, which no frontend code held. Deleted
// the eight, along with the client-side src/hooks/useEmail.ts and
// src/lib/email-templates.ts that only ever supported them and were
// themselves never imported anywhere. What is left is the one template that
// is actually live, rewritten on the real shared branding and describing the
// real product, role-aware for the two real account types.
function welcomeEmailTemplate(userName: string, role: string | undefined): { subject: string; html: string } {
  const safeName = escapeHtml(userName || 'there');
  const isEmployer = role === 'employer';

  const body = isEmployer
    ? `${heading(`Welcome to AYN, ${safeName}`)}
       ${para("Your account is on its way. Once you're approved, tell AYN about the role you're hiring for and it will search candidates who opted into the talent pool, with the reasoning behind every match.")}
       ${para('Nothing is invented — every match is grounded in what a candidate actually put in their own profile.', { muted: true, marginTop: 16 })}
       ${ctaButton('https://ayn.careers/', 'Go to AYN')}`
    : `${heading(`Welcome to AYN, ${safeName}`)}
       ${para('Upload your resume to get started. From there you can score it against a real job posting, tailor it in seconds, and get a cover letter grounded in your real experience.')}
       ${para('Nothing AYN writes is invented — every tailored resume and cover letter only ever uses what is really in your background.', { muted: true, marginTop: 16 })}
       ${ctaButton('https://ayn.careers/resume-hub', 'Go to Resume Hub')}`;

  return { subject: 'Welcome to AYN', html: wrapEmail(body) };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const resend = new Resend(resendApiKey);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { to, emailType, data, userId }: EmailRequest = await req.json();

    if (!to || !emailType) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, emailType" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (emailType !== 'welcome') {
      return new Response(
        JSON.stringify({ error: `Unknown email type: ${emailType}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-email] Sending ${emailType} email to ${to}`);

    const template = welcomeEmailTemplate(data?.userName || '', data?.role);

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "AYN <noreply@ayn.careers>",
      to: [to],
      subject: template.subject,
      html: template.html,
    });

    console.log(`[send-email] Email sent successfully:`, emailResponse);

    // Log to email_logs table
    if (userId) {
      const { error: logError } = await supabase.from('email_logs').insert({
        user_id: userId,
        email_type: emailType,
        recipient_email: to,
        sent_at: new Date().toISOString(),
        status: 'sent',
        metadata: { resend_id: emailResponse.id, data }
      });

      if (logError) {
        console.error('[send-email] Failed to log email:', logError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: emailResponse.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("[send-email] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
