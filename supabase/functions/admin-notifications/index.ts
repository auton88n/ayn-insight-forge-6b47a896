import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "access_request" | "daily_report" | "security_alert" | "pin_change_approval" | "maintenance_announcement";
  user_id?: string;
  user_email?: string;
  action?: string;
  severity?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at?: string;
  approve_url?: string;
  reject_url?: string;
  expires_at?: string;
  message?: string;
  startTime?: string;
  endTime?: string;
}

// Simple HMAC-like signature using Web Crypto API
async function createSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataToSign = encoder.encode(data);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, dataToSign);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Generate approval token
async function generateApprovalToken(
  userId: string, 
  userEmail: string, 
  adminEmail: string, 
  secret: string
): Promise<string> {
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
  const dataToSign = `${userId}:${userEmail}:${adminEmail}:${expiresAt}`;
  const signature = await createSignature(dataToSign, secret);
  
  const tokenData = {
    user_id: userId,
    user_email: userEmail,
    admin_email: adminEmail,
    expires_at: expiresAt,
    signature
  };
  
  return btoa(JSON.stringify(tokenData));
}

// Mask email for logging (j***@example.com)
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const maskedLocal = local.length <= 2 
    ? local[0] + '***' 
    : local[0] + '***' + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// Clean email template with dark mode support
function generateEmailTemplate(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>
:root{color-scheme:light dark}
@media(prefers-color-scheme:dark){
.email-bg{background-color:#1a1a1a!important}
.email-card{background-color:#2a2a2a!important;border-color:#3a3a3a!important}
.email-header{border-color:#3a3a3a!important}
.email-title{color:#ffffff!important}
.email-logo{color:#ffffff!important}
.email-text{color:#e0e0e0!important}
.email-muted{color:#a0a0a0!important}
.email-box{background-color:#333333!important}
.email-footer{background-color:#222222!important;border-color:#3a3a3a!important}
}
</style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div class="email-bg" style="background-color:#f5f5f5;padding:40px 20px">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="background-color:#ffffff;border-radius:12px;border:1px solid #e5e5e5">
<tr><td class="email-header" style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #e5e5e5">
<h1 class="email-logo" style="margin:0;font-size:36px;font-weight:800;letter-spacing:-1px;color:#0a0a0a">AYN</h1>
<div style="width:40px;height:3px;background:#6366f1;margin:12px auto 0;border-radius:2px"></div>
</td></tr>
<tr><td style="padding:28px 32px 12px">
<h2 class="email-title" style="margin:0;font-size:22px;font-weight:600;color:#0a0a0a">${title}</h2>
</td></tr>
<tr><td style="padding:16px 32px 32px">
${content}
</td></tr>
<tr><td class="email-footer" style="padding:24px 32px;background-color:#fafafa;border-top:1px solid #e5e5e5;border-radius:0 0 12px 12px">
<p class="email-muted" style="margin:0;font-size:12px;color:#888;text-align:center">
This is an automated notification from AYN<br>
&copy; ${new Date().getFullYear()} AYN. All rights reserved.
</p>
</td></tr>
</table>
</td></tr>
</table>
</div>
</body>
</html>`;
}

// Access request email content
function generateAccessRequestContent(data: NotificationRequest, approveUrl?: string): string {
  const timestamp = data.created_at 
    ? new Date(data.created_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }) 
    : new Date().toLocaleString('en-US');
  
  return `
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">New User</p>
<p class="email-text" style="margin:0;font-size:16px;font-weight:500;color:#0a0a0a">${data.user_email || 'Unknown'}</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">User ID</p>
<p class="email-text" style="margin:0;font-size:13px;font-family:monospace;color:#0a0a0a">${data.user_id || 'Unknown'}</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Requested At</p>
<p class="email-text" style="margin:0;font-size:13px;color:#0a0a0a">${timestamp}</p>
</div>
<p class="email-muted" style="margin:16px 0 0;font-size:13px;color:#666">
A new user has registered and is awaiting access approval.
</p>
<div style="margin-top:24px;text-align:center">
${approveUrl ? `
<a href="${approveUrl}" style="display:inline-block;padding:12px 28px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;margin-right:12px">Approve Now</a>
` : ''}
<a href="https://aynn.io/admin" style="display:inline-block;padding:12px 28px;background-color:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Open Admin Panel</a>
</div>
<p class="email-muted" style="margin:20px 0 0;font-size:11px;color:#999;text-align:center">
The approval link expires in 24 hours for security.
</p>`;
}

// Security alert email content
function generateSecurityAlertContent(data: NotificationRequest): string {
  const timestamp = data.created_at 
    ? new Date(data.created_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }) 
    : new Date().toLocaleString('en-US');
  
  const isCritical = data.severity === 'critical';
  const alertColor = isCritical ? '#dc2626' : '#f59e0b';
  const alertLabel = data.severity?.toUpperCase() || 'HIGH';
  
  return `
<div style="background-color:${isCritical ? '#fef2f2' : '#fffbeb'};border-left:4px solid ${alertColor};border-radius:4px;padding:14px;margin-bottom:16px">
<p style="margin:0;font-size:13px;font-weight:600;color:${alertColor}">${alertLabel} SEVERITY ALERT</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Action</p>
<p class="email-text" style="margin:0;font-size:14px;font-weight:500;color:#0a0a0a">${data.action || 'Unknown action'}</p>
</div>
${data.ip_address ? `
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">IP Address</p>
<p class="email-text" style="margin:0;font-size:13px;font-family:monospace;color:#0a0a0a">${data.ip_address}</p>
</div>
` : ''}
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Detected At</p>
<p class="email-text" style="margin:0;font-size:13px;color:#0a0a0a">${timestamp}</p>
</div>
${data.details ? `
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Details</p>
<pre class="email-text" style="margin:0;font-size:11px;font-family:monospace;color:#0a0a0a;white-space:pre-wrap;word-break:break-all">${JSON.stringify(data.details, null, 2)}</pre>
</div>
` : ''}
<p class="email-muted" style="margin:16px 0 0;font-size:13px;color:#666">
Please investigate this security event immediately.
</p>
<div style="margin-top:24px;text-align:center">
<a href="https://aynn.io/admin" style="display:inline-block;padding:12px 28px;background-color:#dc2626;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">View Security Logs</a>
</div>`;
}

// PIN change approval email content
function generatePinChangeApprovalContent(data: NotificationRequest): string {
  const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const expiresAt = data.expires_at 
    ? new Date(data.expires_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
    : 'in 1 hour';
  
  return `
<div style="background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:14px;margin-bottom:16px">
<p style="margin:0;font-size:13px;font-weight:600;color:#92400e">🔐 PIN Change Request</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Requested By</p>
<p class="email-text" style="margin:0;font-size:16px;font-weight:500;color:#0a0a0a">${data.user_email || 'Admin'}</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Requested At</p>
<p class="email-text" style="margin:0;font-size:13px;color:#0a0a0a">${timestamp}</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Expires</p>
<p class="email-text" style="margin:0;font-size:13px;color:#0a0a0a">${expiresAt}</p>
</div>
<p class="email-muted" style="margin:16px 0 0;font-size:13px;color:#666">
Someone has requested to change the admin panel PIN. Click below to approve or reject this request.
</p>
<div style="margin-top:24px;text-align:center">
<a href="${data.approve_url}" style="display:inline-block;padding:14px 32px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;margin-right:12px">✓ Approve PIN Change</a>
<a href="${data.reject_url}" style="display:inline-block;padding:14px 32px;background-color:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">✕ Reject</a>
</div>
<p class="email-muted" style="margin:24px 0 0;font-size:11px;color:#999;text-align:center">
If you did not request this change, click Reject immediately and review your account security.
</p>`;
}

// Maintenance announcement email content
function generateMaintenanceAnnouncementContent(data: NotificationRequest): string {
  const startTime = data.startTime 
    ? new Date(data.startTime).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : 'Soon';
  const endTime = data.endTime 
    ? new Date(data.endTime).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : 'To be announced';
  
  return `
<div style="background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:14px;margin-bottom:16px">
<p style="margin:0;font-size:13px;font-weight:600;color:#92400e">🚧 Scheduled Maintenance</p>
</div>
<p class="email-text" style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333">
${data.message || 'We will be performing scheduled maintenance on the AYN system.'}
</p>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Start Time</p>
<p class="email-text" style="margin:0;font-size:14px;font-weight:500;color:#0a0a0a">${startTime}</p>
</div>
<div class="email-box" style="background-color:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:16px">
<p class="email-muted" style="margin:0 0 6px;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Expected Completion</p>
<p class="email-text" style="margin:0;font-size:14px;font-weight:500;color:#0a0a0a">${endTime}</p>
</div>
<p class="email-muted" style="margin:16px 0 0;font-size:13px;color:#666">
During this time, you may experience temporary service interruptions. We apologize for any inconvenience and thank you for your patience.
</p>
<div style="margin-top:24px;text-align:center">
<a href="https://aynn.io" style="display:inline-block;padding:12px 28px;background-color:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">Visit AYN</a>
</div>`;
}

// Daily report email content
function generateDailyReportContent(metrics: Record<string, unknown>): string {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  return `
<p class="email-muted" style="margin:0 0 20px;font-size:13px;color:#666">${today}</p>

<h3 class="email-title" style="margin:24px 0 12px;font-size:14px;font-weight:600;color:#0a0a0a;border-bottom:1px solid #e5e5e5;padding-bottom:8px">User Metrics</h3>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
<tr>
<td width="33%" class="email-box" style="padding:12px;background-color:#f8f9fa;border-radius:6px 0 0 6px">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">Total Users</p>
<p class="email-text" style="margin:4px 0 0;font-size:22px;font-weight:600;color:#0a0a0a">${metrics.totalUsers || 0}</p>
</td>
<td width="33%" class="email-box" style="padding:12px;background-color:#f8f9fa">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">Active Users</p>
<p class="email-text" style="margin:4px 0 0;font-size:22px;font-weight:600;color:#0a0a0a">${metrics.activeUsers || 0}</p>
</td>
<td width="34%" class="email-box" style="padding:12px;background-color:#f8f9fa;border-radius:0 6px 6px 0">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">New Today</p>
<p style="margin:4px 0 0;font-size:22px;font-weight:600;color:#22c55e">${metrics.newUsersToday || 0}</p>
</td>
</tr>
</table>

<h3 class="email-title" style="margin:24px 0 12px;font-size:14px;font-weight:600;color:#0a0a0a;border-bottom:1px solid #e5e5e5;padding-bottom:8px">Activity</h3>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
<tr>
<td width="33%" class="email-box" style="padding:12px;background-color:#f8f9fa;border-radius:6px 0 0 6px">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">Messages Today</p>
<p class="email-text" style="margin:4px 0 0;font-size:22px;font-weight:600;color:#0a0a0a">${metrics.messagesToday || 0}</p>
</td>
<td width="33%" class="email-box" style="padding:12px;background-color:#f8f9fa">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">Total Messages</p>
<p class="email-text" style="margin:4px 0 0;font-size:22px;font-weight:600;color:#0a0a0a">${metrics.totalMessages || 0}</p>
</td>
<td width="34%" class="email-box" style="padding:12px;background-color:#f8f9fa;border-radius:0 6px 6px 0">
<p class="email-muted" style="margin:0;font-size:11px;color:#888">Sessions Today</p>
<p class="email-text" style="margin:4px 0 0;font-size:22px;font-weight:600;color:#0a0a0a">${metrics.sessionsToday || 0}</p>
</td>
</tr>
</table>

<div style="margin-top:24px;text-align:center">
<a href="https://aynn.io/admin" style="display:inline-block;padding:12px 28px;background-color:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500">View Full Dashboard</a>
</div>`;
}

// Fetch daily metrics from database
async function fetchDailyMetrics(supabase: ReturnType<typeof createClient>): Promise<Record<string, unknown>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [
    totalUsersResult,
    activeUsersResult,
    newUsersTodayResult,
    messagesTodayResult,
    totalMessagesResult,
    sessionsTodayResult
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('access_grants').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('chat_sessions').select('id', { count: 'exact', head: true }).gte('created_at', todayISO)
  ]);

  return {
    totalUsers: totalUsersResult.count || 0,
    activeUsers: activeUsersResult.count || 0,
    newUsersToday: newUsersTodayResult.count || 0,
    messagesToday: messagesTodayResult.count || 0,
    totalMessages: totalMessagesResult.count || 0,
    sessionsToday: sessionsTodayResult.count || 0
  };
}

// Fetch all active user emails for maintenance notification
async function fetchAllUserEmails(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  // Fetch ALL users from access_grants regardless of active status
  // This ensures maintenance notifications reach everyone
  const { data, error } = await supabase
    .from('access_grants')
    .select('user_id');

  if (error || !data) {
    console.error('Error fetching users:', error);
    return [];
  }

  const userIds = data.map(d => d.user_id);
  if (userIds.length === 0) return [];

  // Get emails from auth.users via service role
  const emails: string[] = [];
  for (const userId of userIds) {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email) {
      emails.push(userData.user.email);
    }
  }

  return emails;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Admin notifications function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const approvalSecret = Deno.env.get("APPROVAL_TOKEN_SECRET");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resend = new Resend(resendApiKey);
    const data: NotificationRequest = await req.json();
    console.log("Notification type:", data.type);

    // Special handling for maintenance announcements - send to all users
    if (data.type === 'maintenance_announcement') {
      const userEmails = await fetchAllUserEmails(supabase);
      console.log(`Sending maintenance notification to ${userEmails.length} users`);

      const subject = "🚧 Scheduled Maintenance - AYN";
      const content = generateEmailTemplate("Scheduled Maintenance", generateMaintenanceAnnouncementContent(data));

      let successCount = 0;
      let failCount = 0;
      const recipientResults: { masked: string; status: string; error?: string }[] = [];

      console.log(`--- Maintenance batch send starting for ${userEmails.length} recipients ---`);
      
      // Send in batches of 10 for better performance
      const batchSize = 10;
      for (let i = 0; i < userEmails.length; i += batchSize) {
        const batch = userEmails.slice(i, i + batchSize);
        const batchPromises = batch.map(async (email) => {
          const masked = maskEmail(email);
          try {
            await resend.emails.send({
              from: "AYN Admin <noreply@mail.aynn.io>",
              to: email,
              subject: subject,
              html: content,
            });
            successCount++;
            recipientResults.push({ masked, status: 'sent' });
            console.log(`✓ Sent to: ${masked}`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`✗ Failed to send to ${masked}: ${errorMsg}`);
            failCount++;
            recipientResults.push({ masked, status: 'failed', error: errorMsg });
          }
        });
        await Promise.all(batchPromises);
      }

      console.log(`--- Maintenance batch complete: ${successCount} sent, ${failCount} failed ---`);

      // Log the batch send with per-recipient details (masked)
      await supabase.from('admin_notification_log').insert({
        notification_type: 'maintenance_announcement',
        recipient_email: `batch:${userEmails.length} users`,
        subject: subject,
        status: failCount === 0 ? 'sent' : 'partial',
        metadata: { 
          success_count: successCount, 
          fail_count: failCount,
          recipients: recipientResults 
        }
      });

      return new Response(
        JSON.stringify({ success: true, sent: successCount, failed: failCount }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Special handling for PIN change approval - use admin config email
    if (data.type === 'pin_change_approval') {
      const { data: config } = await supabase
        .from('admin_notification_config')
        .select('recipient_email, is_enabled')
        .eq('notification_type', 'security_alert')
        .single();

      if (!config?.is_enabled) {
        return new Response(
          JSON.stringify({ error: "Security notifications disabled" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const subject = "🔐 Admin PIN Change Request - AYN";
      const content = generateEmailTemplate("Admin PIN Change Request", generatePinChangeApprovalContent(data));

      try {
        await resend.emails.send({
          from: "AYN Admin <noreply@mail.aynn.io>",
          to: config.recipient_email,
          subject: subject,
          html: content,
        });

        await supabase.from('admin_notification_log').insert({
          notification_type: 'pin_change_approval',
          recipient_email: config.recipient_email,
          subject: subject,
          status: 'sent'
        });

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (emailError) {
        console.error("Email send error:", emailError);
        return new Response(
          JSON.stringify({ error: "Failed to send email" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Standard notification handling
    const { data: config, error: configError } = await supabase
      .from('admin_notification_config')
      .select('*')
      .eq('notification_type', data.type)
      .single();

    if (configError || !config) {
      console.log("Config not found or error:", configError);
      return new Response(
        JSON.stringify({ error: "Notification type not configured" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!config.is_enabled) {
      console.log("Notifications disabled for type:", data.type);
      return new Response(
        JSON.stringify({ message: "Notifications disabled for this type" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let subject: string;
    let content: string;

    switch (data.type) {
      case "access_request": {
        subject = "New Access Request - AYN";
        let approveUrl: string | undefined;
        if (approvalSecret && data.user_id && data.user_email) {
          const token = await generateApprovalToken(
            data.user_id,
            data.user_email,
            config.recipient_email,
            approvalSecret
          );
          approveUrl = `https://dfkoxuokfkttjhfjcecx.supabase.co/functions/v1/approve-access?token=${encodeURIComponent(token)}`;
        }
        content = generateEmailTemplate("New Access Request", generateAccessRequestContent(data, approveUrl));
        break;
      }
      case "security_alert":
        subject = `Security Alert: ${data.severity?.toUpperCase() || 'HIGH'} - AYN`;
        content = generateEmailTemplate("Security Alert", generateSecurityAlertContent(data));
        break;
      case "daily_report": {
        const metrics = await fetchDailyMetrics(supabase);
        subject = "Daily System Report - AYN";
        content = generateEmailTemplate("Daily System Report", generateDailyReportContent(metrics));
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: "Unknown notification type" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    try {
      await resend.emails.send({
        from: "AYN Admin <noreply@mail.aynn.io>",
        to: config.recipient_email,
        subject: subject,
        html: content,
      });
      console.log("Email sent successfully to:", config.recipient_email);

      await supabase.from('admin_notification_log').insert({
        notification_type: data.type,
        recipient_email: config.recipient_email,
        subject: subject,
        content: content.substring(0, 1000),
        status: 'sent',
        metadata: { user_id: data.user_id, user_email: data.user_email }
      });

      return new Response(
        JSON.stringify({ success: true, message: "Notification sent" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (emailError) {
      console.error("Email send error:", emailError);
      
      await supabase.from('admin_notification_log').insert({
        notification_type: data.type,
        recipient_email: config.recipient_email,
        subject: subject,
        status: 'failed',
        error_message: emailError instanceof Error ? emailError.message : 'Unknown error'
      });

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailError instanceof Error ? emailError.message : 'Unknown error' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  } catch (error) {
    console.error("Handler error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
