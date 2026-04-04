import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface ApplicationEmailRequest {
  serviceType: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  message?: string;
  formData?: Record<string, unknown>;
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
    const { serviceType: rawServiceType, applicantName: rawApplicantName, applicantEmail: rawApplicantEmail, applicantPhone: rawApplicantPhone, message: rawMessage, formData: rawFormData }: ApplicationEmailRequest = await req.json();
    
    // Escape user inputs to prevent HTML injection
    const serviceType = escapeHtml(rawServiceType);
    const applicantName = escapeHtml(rawApplicantName);
    const applicantEmail = escapeHtml(rawApplicantEmail);
    const applicantPhone = rawApplicantPhone ? escapeHtml(rawApplicantPhone) : undefined;
    const message = rawMessage ? escapeHtml(rawMessage) : undefined;
    
    // Escape form data values
    const formData = rawFormData ? Object.fromEntries(
      Object.entries(rawFormData).map(([key, value]) => [
        key,
        typeof value === 'string' ? escapeHtml(value) : 
        Array.isArray(value) ? value.map(v => typeof v === 'string' ? escapeHtml(v) : v) : value
      ])
    ) : undefined;

    console.log(`Processing application email for ${serviceType} from ${applicantEmail}`);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const notificationEmail = Deno.env.get("NOTIFICATION_EMAIL") || "info@aynn.io";

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);

    // Build complete form data from individual fields and any extra formData
    const completeFormData: Record<string, unknown> = {
      ...(applicantPhone ? { phone: applicantPhone } : {}),
      ...(message ? { message } : {}),
      ...(formData || {}),
    };

    // Format form data for email
    const formatFormData = (data: Record<string, unknown>): string => {
      if (!data || Object.keys(data).length === 0) return '';
      return Object.entries(data)
        .filter(([key]) => key !== 'message')
        .map(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          if (Array.isArray(value)) {
            return `<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">${label}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;">${value.join(', ')}</td></tr>`;
          }
          return `<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">${label}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;">${value || 'Not provided'}</td></tr>`;
        })
        .join('');
    };

    // Confirmation email to applicant
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
<p style="font-size:18px;color:#333;margin-bottom:24px;">Hi ${applicantName},</p>
<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">Thank you for your interest in our <strong>${serviceType}</strong> service. We've received your application and our team is reviewing it.</p>
<p style="font-size:16px;color:#666;line-height:1.6;margin-bottom:24px;">We'll get back to you within 24-48 hours with next steps.</p>
<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin:32px 0;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">SERVICE</p>
<p style="font-size:18px;color:#333;margin:0;font-weight:600;">${serviceType}</p>
</div>

<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI - Your Intelligent Companion</p>
</div>
</div>
</body>
</html>`;

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
<div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:16px 20px;margin-bottom:32px;">
<p style="font-size:16px;color:#0369a1;margin:0;font-weight:600;">New Service Application</p>
</div>
<div style="background:#f9f9f9;border-radius:12px;padding:24px;margin-bottom:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">SERVICE TYPE</p>
<p style="font-size:20px;color:#333;margin:0;font-weight:700;">${serviceType}</p>
</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Name</td><td style="padding:8px 16px;border-bottom:1px solid #eee;">${applicantName}</td></tr>
<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#666;font-weight:600;">Email</td><td style="padding:8px 16px;border-bottom:1px solid #eee;"><a href="mailto:${rawApplicantEmail}" style="color:#0ea5e9;">${applicantEmail}</a></td></tr>
${formatFormData(completeFormData)}
</table>
${completeFormData.message ? `
<div style="margin-top:24px;">
<p style="font-size:14px;color:#999;margin:0 0 8px;text-transform:uppercase;font-weight:600;">MESSAGE</p>
<p style="font-size:14px;color:#333;line-height:1.6;background:#f9f9f9;padding:16px;border-radius:8px;">${completeFormData.message}</p>
</div>
` : ''}
<div style="margin-top:32px;text-align:center;">
<a href="mailto:${rawApplicantEmail}?subject=Re: Your ${serviceType} Application" style="display:inline-block;background:#000;color:#fff;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:600;">Reply to Applicant</a>
</div>
<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee;text-align:center;">
<p style="font-size:12px;color:#999;margin:0;">AYN AI Admin Notification</p>
</div>
</div>
</body>
</html>`;

    // Send confirmation to applicant (with Reply-To for support)
    const { error: confirmError } = await resend.emails.send({
      from: "AYN <noreply@mail.aynn.io>",
      to: rawApplicantEmail,
      replyTo: notificationEmail,
      subject: `Application Received - ${serviceType}`,
      html: confirmationHtml,
    });

    if (confirmError) {
      console.error("Error sending confirmation email:", confirmError);
    } else {
      console.log(`Confirmation email sent to ${applicantEmail}`);
    }

    // Send notification to team (with Reply-To set to applicant so team can reply directly)
    const { error: notifyError } = await resend.emails.send({
      from: "AYN <noreply@mail.aynn.io>",
      to: notificationEmail,
      replyTo: rawApplicantEmail,
      subject: `New Application: ${serviceType} - ${applicantName}`,
      html: notificationHtml,
    });

    if (notifyError) {
      console.error("Error sending notification email:", notifyError);
    } else {
      console.log(`Notification email sent to ${notificationEmail}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Emails sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error sending application emails:", error);
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
