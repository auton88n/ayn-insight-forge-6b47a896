import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface ContactEmailRequest {
  name: string;
  email: string;
  message: string;
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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name: rawName, email: rawEmail, message: rawMessage }: ContactEmailRequest = await req.json();
    
    // Escape user inputs to prevent HTML injection
    const name = escapeHtml(rawName);
    const email = escapeHtml(rawEmail);
    const message = escapeHtml(rawMessage);

    console.log(`Processing contact form submission from ${email}`);

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const notificationEmail = Deno.env.get("NOTIFICATION_EMAIL") || "info@aynn.io";

    if (!smtpHost || !smtpUser || !smtpPass) {
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

    // Notification email to team
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
<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;margin-bottom:32px;">
<p style="font-size:16px;color:#166534;margin:0;font-weight:600;">New Contact Message</p>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;width:100px;">Name</td><td style="padding:12px 16px;border-bottom:1px solid #eee;">${name}</td></tr>
<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Email</td><td style="padding:12px 16px;border-bottom:1px solid #eee;"><a href="mailto:${email}" style="color:#0ea5e9;">${email}</a></td></tr>
</table>
<div style="margin-top:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">MESSAGE</p>
<p style="font-size:14px;color:#333;line-height:1.6;background:#f9f9f9;padding:16px;border-radius:8px;white-space:pre-wrap;">${message}</p>
</div>
<div style="margin-top:32px;text-align:center;">
<a href="mailto:${email}?subject=Re: Your Message to AYN" style="display:inline-block;background:#000;color:#fff;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:600;">Reply to ${name}</a>
</div>
<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Contact Form Notification</p>
</div>
</div>
</body>
</html>`;

    // Confirmation email to sender
    const confirmationHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<h1 style="font-size:56px;font-weight:900;letter-spacing:-2px;margin:0;">AYN</h1>
<div style="width:40px;height:4px;background:#000;margin:16px auto;"></div>
</div>
<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${name},</p>
<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">Thank you for reaching out to us. We've received your message and our team will get back to you within 24-48 hours.</p>
<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin:32px 0;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">YOUR MESSAGE</p>
<p style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;">${message}</p>
</div>
<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
</div>
</div>
</body>
</html>`;

    // Send notification to team
    await client.send({
      from: smtpUser,
      to: notificationEmail,
      replyTo: email,
      subject: `New Contact Message from ${name}`,
      content: "auto",
      html: notificationHtml,
    });

    console.log(`Notification email sent to ${notificationEmail}`);

    // Send confirmation to sender
    await client.send({
      from: smtpUser,
      to: email,
      replyTo: notificationEmail,
      subject: "We received your message - AYN",
      content: "auto",
      html: confirmationHtml,
    });

    console.log(`Confirmation email sent to ${email}`);

    await client.close();

    return new Response(
      JSON.stringify({ success: true, message: "Emails sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error sending contact emails:", error);
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
