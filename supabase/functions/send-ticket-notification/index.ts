import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface TicketNotificationRequest {
  ticketId: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  userName?: string;
  userEmail?: string;
}

// HTML entity escaping to prevent HTML injection
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'urgent': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    default: return '#22c55e';
  }
};

const getCategoryLabel = (category: string): string => {
  return category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      ticketId, 
      subject: rawSubject, 
      message: rawMessage, 
      category: rawCategory, 
      priority: rawPriority, 
      userName: rawUserName, 
      userEmail: rawUserEmail 
    }: TicketNotificationRequest = await req.json();

    // Escape user inputs
    const subject = escapeHtml(rawSubject);
    const message = escapeHtml(rawMessage);
    const category = escapeHtml(rawCategory);
    const priority = escapeHtml(rawPriority);
    const userName = rawUserName ? escapeHtml(rawUserName) : 'Anonymous';
    const userEmail = rawUserEmail ? escapeHtml(rawUserEmail) : null;
    const ticketRef = ticketId.slice(0, 8).toUpperCase();

    console.log(`Processing support ticket notification: ${ticketId}`);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const notificationEmail = Deno.env.get("NOTIFICATION_EMAIL") || "info@aynn.io";

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("SMTP configuration missing");
      throw new Error("SMTP configuration missing");
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    });

    const priorityColor = getPriorityColor(priority);
    const categoryLabel = getCategoryLabel(category);

    // Confirmation email to user (if email provided)
    if (userEmail) {
      const userConfirmationHtml = `
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
<p style="font-size:16px;color:#166534;margin:0;font-weight:600;">✓ Ticket Submitted Successfully</p>
</div>

<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${userName},</p>

<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">Thank you for contacting our support team. We've received your ticket and will get back to you as soon as possible.</p>

<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">YOUR TICKET REFERENCE</p>
<p style="font-size:28px;color:#333;margin:0;font-weight:900;letter-spacing:2px;font-family:monospace;">#${ticketRef}</p>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;width:100px;">Subject</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;">${subject}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Category</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;">${categoryLabel}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Priority</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;">
<span style="background:${priorityColor}15;color:${priorityColor};padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700;text-transform:uppercase;">${priority}</span>
</td>
</tr>
</table>

<div style="background:#f0f9ff;border-radius:8px;padding:16px;margin-bottom:24px;">
<p style="font-size:14px;color:#0369a1;margin:0;">💡 <strong>Keep this reference number</strong> handy. You can use it to track your ticket status or when contacting us about this issue.</p>
</div>

<p style="font-size:14px;color:#666;line-height:1.6;">Our support team typically responds within 24-48 hours. We appreciate your patience.</p>

<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Support Team</p>
</div>
</div>
</body>
</html>`;

      await client.send({
        from: smtpUser,
        to: rawUserEmail!,
        replyTo: notificationEmail,
        subject: `Ticket #${ticketRef} Received - ${rawSubject}`,
        content: "auto",
        html: userConfirmationHtml,
      });

      console.log(`Confirmation email sent to user: ${rawUserEmail}`);
    }

    // Notification email to admin
    const notificationHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;">AYN</h1>
<div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>

<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px 20px;margin-bottom:32px;">
<p style="font-size:16px;color:#92400e;margin:0;font-weight:600;">🎫 New Support Ticket #${ticketRef}</p>
</div>

<div style="display:flex;gap:12px;margin-bottom:24px;">
<div style="background:${priorityColor}15;border:1px solid ${priorityColor}30;border-radius:8px;padding:8px 16px;">
<span style="font-size:12px;color:${priorityColor};font-weight:700;text-transform:uppercase;">${priority} Priority</span>
</div>
<div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:8px 16px;">
<span style="font-size:12px;color:#6b7280;font-weight:600;">${categoryLabel}</span>
</div>
</div>

<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">SUBJECT</p>
<p style="font-size:18px;color:#333;margin:0;font-weight:700;">${subject}</p>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;width:120px;">Ticket ID</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;">#${ticketRef}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">From</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;">${userName}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Email</td>
<td style="padding:12px 16px;border-bottom:1px solid #eee;">
${userEmail ? `<a href="mailto:${userEmail}" style="color:#0ea5e9;">${userEmail}</a>` : '<span style="color:#999;">Not provided</span>'}
</td>
</tr>
</table>

<div style="margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 12px;text-transform:uppercase;font-weight:600;">MESSAGE</p>
<div style="background:#f9f9f9;padding:20px;border-radius:8px;border-left:3px solid #e5e7eb;">
<p style="font-size:14px;color:#333;line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
</div>
</div>

<div style="margin-top:32px;text-align:center;">
<p style="font-size:13px;color:#666;margin-bottom:16px;">View and respond to this ticket in the admin panel</p>
</div>

<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Support Notification</p>
</div>
</div>
</body>
</html>`;

    // Send notification to admin
    await client.send({
      from: smtpUser,
      to: notificationEmail,
      replyTo: rawUserEmail || smtpUser,
      subject: `[${priority.toUpperCase()}] New Support Ticket #${ticketRef}: ${rawSubject}`,
      content: "auto",
      html: notificationHtml,
    });

    console.log(`Support ticket notification sent to ${notificationEmail}`);

    await client.close();

    // Trigger AYN auto-reply for the ticket
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://dfkoxuokfkttjhfjcecx.supabase.co";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseKey) {
        await fetch(`${supabaseUrl}/functions/v1/ayn-auto-reply`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ticket_id: ticketId,
            subject: rawSubject,
            message: rawMessage,
            category: rawCategory,
            priority: rawPriority,
            user_name: rawUserName,
            user_email: rawUserEmail,
          }),
        });
        console.log("AYN auto-reply triggered for ticket:", ticketId);
      }
    } catch (autoReplyErr) {
      console.error("AYN auto-reply trigger failed (non-blocking):", autoReplyErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent successfully", ticketRef }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error sending ticket notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
