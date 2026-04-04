import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface TicketReplyRequest {
  ticketId: string;
  userEmail: string;
  userName?: string;
  subject: string;
  message: string;
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

    // Initialize Supabase client
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
      ticketId,
      userEmail: rawUserEmail,
      userName: rawUserName,
      subject: rawSubject, 
      message: rawMessage,
    }: TicketReplyRequest = await req.json();

    if (!rawUserEmail) {
      console.log('No user email provided, skipping notification');
      return new Response(
        JSON.stringify({ success: true, message: "No email to send to" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Escape user inputs for HTML
    const userName = rawUserName ? escapeHtml(rawUserName) : 'User';
    const message = escapeHtml(rawMessage);
    const ticketRef = ticketId.slice(0, 8).toUpperCase();

    console.log(`Processing ticket reply notification for ticket ${ticketId} to ${rawUserEmail}`);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const infoEmail = Deno.env.get("SMTP_USER_") || "info@aynn.io";
    const infoPass = Deno.env.get("SMTP_PASS_");

    if (!smtpHost || !infoEmail || !infoPass) {
      console.error("SMTP configuration missing");
      throw new Error("SMTP configuration missing for info@ email");
    }

    // Premium branded email template for ticket replies
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

<div style="background:#dcfce7;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:32px;">
<p style="font-size:16px;color:#166534;margin:0;font-weight:600;">✓ New Reply to Your Support Ticket</p>
</div>

<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${userName},</p>

<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">Our support team has responded to your ticket.</p>

<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">TICKET REFERENCE</p>
<p style="font-size:28px;color:#333;margin:0 0 16px;font-weight:900;letter-spacing:2px;font-family:monospace;">#${ticketRef}</p>
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">SUBJECT</p>
<p style="font-size:16px;color:#333;margin:0;font-weight:600;">${escapeHtml(rawSubject.replace('Re: ', ''))}</p>
</div>

<div style="margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 12px;text-transform:uppercase;font-weight:600;">RESPONSE FROM AYN SUPPORT</p>
<div style="background:#f0f9ff;padding:20px;border-radius:8px;border-left:3px solid #0ea5e9;">
<p style="font-size:14px;color:#333;line-height:1.7;margin:0;">${message}</p>
</div>
</div>

<div style="background:#fef3c7;border-radius:8px;padding:16px;margin-bottom:24px;">
<p style="font-size:14px;color:#92400e;margin:0;">💬 <strong>Want to reply?</strong> Simply respond to this email or log in to your account to view the full conversation.</p>
</div>

<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;">
<p style="font-size:14px;color:#333;margin:0 0 4px;font-weight:600;">Best regards,</p>
<p style="font-size:14px;color:#666;margin:0;">The AYN Support Team</p>
</div>

<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
</div>
</div>
</body>
</html>`;

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: infoEmail,
          password: infoPass,
        },
      },
    });

    await client.send({
      from: infoEmail,
      to: rawUserEmail,
      replyTo: infoEmail,
      subject: `Re: Ticket #${ticketRef} - ${rawSubject.replace('Re: ', '')}`,
      content: "auto",
      html: replyHtml,
    });

    await client.close();
    console.log(`Ticket reply notification sent successfully to ${rawUserEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error in send-ticket-reply:", error);
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
