import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface ReplyEmailRequest {
  applicationId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message: string;
  serviceType: string;
}

// HTML entity escaping to prevent HTML injection
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    // Initialize Supabase client with user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized: Invalid token');
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      throw new Error('Unauthorized: Admin access required');
    }

    const {
      applicationId,
      recipientEmail: rawRecipientEmail,
      recipientName: rawRecipientName,
      subject: rawSubject,
      message: rawMessage,
      serviceType: rawServiceType
    }: ReplyEmailRequest = await req.json();

    // Escape user inputs
    const recipientName = escapeHtml(rawRecipientName);
    const subject = rawSubject; // Don't escape subject for email header
    const message = escapeHtml(rawMessage);
    const serviceType = escapeHtml(rawServiceType);

    console.log(`Processing reply email for application ${applicationId} to ${rawRecipientEmail}`);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    // v3.132.0 — this fallback still pointed at the retired pre-rebrand
    // domain, missed by the v3.85.0 domain-cutover sweep since
    // this function had no local repo source at the time.
    const infoEmail = Deno.env.get("SMTP_USER_") || "info@ayn.careers"; // info@ for sending admin replies
    const infoPass = Deno.env.get("SMTP_PASS_"); // info@ password

    if (!smtpHost || !infoEmail || !infoPass) {
      throw new Error("SMTP configuration missing for info@ email");
    }

    // Premium black-and-white AYN branded email template
    const replyHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;">AYN</h1>
<div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>
<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${recipientName},</p>
<div style="font-size:16px;color:#666;line-height:1.8;margin-bottom:32px;">
${message}
</div>
<div style="background:#f9f9f9;border-radius:12px;padding:20px;margin:32px 0;">
<p style="font-size:12px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">REGARDING YOUR APPLICATION</p>
<p style="font-size:16px;color:#333;margin:0;font-weight:600;">${serviceType}</p>
</div>
<p style="font-size:14px;color:#666;line-height:1.6;">
If you have any questions, simply reply to this email and we'll get back to you.
</p>
<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;">
<p style="font-size:14px;color:#333;margin:0 0 4px;font-weight:600;">Best regards,</p>
<p style="font-size:14px;color:#666;margin:0;">The AYN Team</p>
</div>
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
</div>
</div>
</body>
</html>`;

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const client = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port: smtpPort,
          tls: true,
          auth: {
            username: infoEmail,  // Authenticate as info@ayn.careers
            password: infoPass,   // Using info@ password
          },
        },
      });

      await client.send({
        from: infoEmail,  // Admin replies come from info@ayn.careers
        to: rawRecipientEmail,
        replyTo: infoEmail,  // Replies go back to info@ayn.careers
        subject: rawSubject,
        content: "auto",
        html: replyHtml,
      });

      await client.close();
      emailSent = true;
      console.log(`Reply email sent successfully to ${rawRecipientEmail}`);
    } catch (smtpError) {
      console.error("SMTP error:", smtpError);
      emailError = smtpError instanceof Error ? smtpError.message : 'Unknown SMTP error';
    }

    // Store the reply in database
    const { error: insertError } = await supabase
      .from('application_replies')
      .insert({
        application_id: applicationId,
        subject: rawSubject,
        message: rawMessage,
        sent_by: user.id,
        email_sent: emailSent,
        email_error: emailError,
      });

    if (insertError) {
      console.error("Error storing reply:", insertError);
    }

    // Update application status to 'contacted' and set last_contacted_at
    const { error: updateError } = await supabase
      .from('service_applications')
      .update({
        status: 'contacted',
        last_contacted_at: new Date().toISOString(),
        email_sent: emailSent,
        email_error: emailError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error("Error updating application:", updateError);
    }

    if (!emailSent) {
      return new Response(
        JSON.stringify({
          success: false,
          error: emailError,
          message: "Reply saved but email failed to send. You can retry."
        }),
        {
          status: 200, // Return 200 so UI shows the error message
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Reply sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error in send-reply-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
