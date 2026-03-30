/**
 * AYN Telegram Command Handlers
 * All slash commands for managing the platform via Telegram.
 */
import { logAynActivity } from "../_shared/aynLogger.ts";

type Supabase = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.56.0").createClient>;

// ─── Admin protection: prevent AYN from modifying admin users ───
async function isAdminUser(supabase: Supabase, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'duty'])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

const ADMIN_PROTECTED_MSG = "🛡️ That user is an admin. I can't modify admin accounts — that's above my pay grade.";

// ─── /help ───
export async function cmdHelp(): Promise<string> {
  return `🤖 AYN Commands:

📊 Status:
/health — System health check
/tickets — Open/pending ticket counts
/stats — User stats
/errors — Recent errors
/logs — My recent activity log

📋 Data:
/applications — Recent service applications
/contacts — Recent contact messages
/users — Recent users
/messages — Recent user chat messages
/feedback — User ratings & beta feedback
/emails — Recent system emails
/security — Recent security events
/visitors — Today's visitor analytics
/twitter — Twitter post performance

👤 User Management:
/user [id] — View full user profile + access grant
/grant [email] — Create access grant for user
/revoke [id] — Deactivate user's access grant
/set_unlimited [id] — Set user to unlimited usage

💬 Actions:
/reply_app [id] [message] — Reply to application
/reply_contact [id] [message] — Reply to contact
/email [to] [subject] | [body] — Send email

🔍 System:
/query [table] [limit] — Read-only data peek
/webhooks — Check webhook/email/LLM health
/weekly_report — Full 7-day executive summary

🗑️ Delete:
/delete_ticket [id]
/messages — Read user messages (read-only)
/delete_app [id]
/delete_contact [id]
/clear_errors [hours] — Clear old errors

🧠 AI:
/think — Force a thinking cycle
/unblock [user_id] — Unblock a user

Or just chat with me naturally!`;
}

// ─── /health ───
export async function cmdHealth(supabase: Supabase): Promise<string> {
  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: errors }, { count: llmFails }, { data: blocked }] = await Promise.all([
    supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', now24h),
    supabase.from('llm_failures').select('*', { count: 'exact', head: true }).gte('created_at', now24h),
    supabase.from('api_rate_limits').select('user_id').gt('blocked_until', new Date().toISOString()),
  ]);
  let score = 100;
  if (errors && errors > 10) score -= Math.min(30, errors);
  if (llmFails && llmFails > 5) score -= Math.min(20, llmFails * 2);
  const blockedCount = blocked?.length || 0;
  if (blockedCount > 0) score -= blockedCount * 3;
  score = Math.max(0, score);
  return `📊 System Health: ${score}%\n⚠️ Errors (24h): ${errors || 0}\n🤖 LLM Failures: ${llmFails || 0}\n🚫 Blocked users: ${blockedCount}`;
}

// ─── /tickets ───
export async function cmdTickets(supabase: Supabase): Promise<string> {
  const [{ count: open }, { count: pending }] = await Promise.all([
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return `🎫 Tickets\n• Open: ${open || 0}\n• Pending: ${pending || 0}`;
}

// ─── /stats ───
export async function cmdStats(supabase: Supabase): Promise<string> {
  const [{ count: total }, { count: active }] = await Promise.all([
    supabase.from('access_grants').select('*', { count: 'exact', head: true }),
    supabase.from('access_grants').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  return `👥 Users: ${active || 0} active / ${total || 0} total`;
}

// ─── /errors ───
export async function cmdErrors(supabase: Supabase): Promise<string> {
  const { data: recentErrors } = await supabase
    .from('error_logs')
    .select('error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!recentErrors?.length) return '✅ No recent errors!';

  const errorList = recentErrors.map((e: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(e.created_at!).getTime()) / 60000);
    return `${i + 1}. ${e.error_message.slice(0, 80)} (${ago}m ago)`;
  }).join('\n');
  return `⚠️ Recent Errors:\n${errorList}`;
}

// ─── /logs ───
export async function cmdLogs(supabase: Supabase): Promise<string> {
  const { data: logs } = await supabase
    .from('ayn_activity_log')
    .select('action_type, summary, triggered_by, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!logs?.length) return '📝 No activity logged yet.';

  const list = logs.map((l: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(l.created_at).getTime()) / 60000);
    const unit = ago >= 60 ? `${Math.round(ago / 60)}h` : `${ago}m`;
    return `${i + 1}. [${l.action_type}] ${l.summary.slice(0, 100)} (${unit} ago)`;
  }).join('\n');
  return `📝 Recent AYN Activity:\n${list}`;
}

// ─── /applications ───
export async function cmdApplications(supabase: Supabase): Promise<string> {
  const { data: apps } = await supabase
    .from('service_applications')
    .select('id, full_name, service_type, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!apps?.length) return '📋 No applications found.';

  const list = apps.map((a: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(a.created_at).getTime()) / 3600000);
    return `${i + 1}. ${a.full_name} — ${a.service_type} [${a.status}] (${ago}h ago)\n   ID: ${a.id.slice(0, 8)}`;
  }).join('\n');
  return `📋 Recent Applications:\n${list}\n\nReply: /reply_app [id] [message]`;
}

// ─── /contacts ───
export async function cmdContacts(supabase: Supabase): Promise<string> {
  const { data: msgs } = await supabase
    .from('contact_messages')
    .select('id, name, email, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!msgs?.length) return '📬 No contact messages found.';

  const list = msgs.map((m: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(m.created_at).getTime()) / 3600000);
    return `${i + 1}. ${m.name} (${m.email.slice(0, 20)}...) [${m.status}] (${ago}h ago)\n   "${m.message.slice(0, 60)}..."\n   ID: ${m.id.slice(0, 8)}`;
  }).join('\n');
  return `📬 Contact Messages:\n${list}\n\nReply: /reply_contact [id] [message]`;
}

// ─── /users ───
export async function cmdUsers(supabase: Supabase): Promise<string> {
  const { data: users } = await supabase
    .from('profiles')
    .select('user_id, company_name, contact_person, account_status, last_login, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!users?.length) return '👥 No users found.';

  const list = users.map((u: any, i: number) => {
    const name = u.contact_person || u.company_name || 'Unknown';
    const status = u.account_status || 'active';
    return `${i + 1}. ${name} [${status}]\n   ID: ${u.user_id.slice(0, 8)}`;
  }).join('\n');
  return `👥 Recent Users:\n${list}`;
}

// ─── /messages ───
export async function cmdMessages(supabase: Supabase): Promise<string> {
  const { data: msgs } = await supabase
    .from('messages')
    .select('content, sender, mode_used, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!msgs?.length) return '💬 No recent messages.';

  const list = msgs.map((m: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(m.created_at).getTime()) / 60000);
    const unit = ago >= 60 ? `${Math.round(ago / 60)}h` : `${ago}m`;
    return `${i + 1}. [${m.sender}${m.mode_used ? '/' + m.mode_used : ''}] "${m.content.slice(0, 60)}${m.content.length > 60 ? '…' : ''}" (${unit} ago)`;
  }).join('\n');
  return `💬 Recent Messages:\n${list}`;
}

// ─── /feedback ───
export async function cmdFeedback(supabase: Supabase): Promise<string> {
  const [{ data: ratings }, { data: beta }] = await Promise.all([
    supabase.from('message_ratings').select('rating, message_preview, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('beta_feedback').select('overall_rating, improvement_suggestions, submitted_at').order('submitted_at', { ascending: false }).limit(5),
  ]);

  let result = '';

  if (ratings?.length) {
    const pos = ratings.filter((r: any) => r.rating === 'positive').length;
    const neg = ratings.filter((r: any) => r.rating === 'negative').length;
    result += `👍 Ratings: ${pos} positive / ${neg} negative (last ${ratings.length})\n`;
    const recent = ratings.slice(0, 3).map((r: any) =>
      `  ${r.rating === 'positive' ? '👍' : '👎'} "${r.message_preview.slice(0, 50)}…"`
    ).join('\n');
    result += recent;
  } else {
    result += '👍 No message ratings yet.';
  }

  if (beta?.length) {
    result += `\n\n🧪 Beta Feedback:\n`;
    result += beta.map((b: any, i: number) =>
      `${i + 1}. ⭐${b.overall_rating || '?'}/5 — "${(b.improvement_suggestions || 'No suggestion').slice(0, 80)}"`
    ).join('\n');
  }

  return result;
}

// ─── /emails ───
export async function cmdEmails(supabase: Supabase): Promise<string> {
  const { data: emails } = await supabase
    .from('email_logs')
    .select('email_type, recipient_email, status, sent_at')
    .order('sent_at', { ascending: false })
    .limit(10);

  if (!emails?.length) return '📧 No recent emails.';

  const list = emails.map((e: any, i: number) => {
    const ago = e.sent_at ? Math.round((Date.now() - new Date(e.sent_at).getTime()) / 60000) : 0;
    const unit = ago >= 60 ? `${Math.round(ago / 60)}h` : `${ago}m`;
    const recipient = e.recipient_email ? e.recipient_email.slice(0, 20) + '…' : 'unknown';
    return `${i + 1}. [${e.email_type}] → ${recipient} (${e.status || '?'}, ${unit} ago)`;
  }).join('\n');
  return `📧 Recent Emails:\n${list}`;
}

// ─── /security ───
export async function cmdSecurity(supabase: Supabase): Promise<string> {
  const { data: logs } = await supabase
    .from('security_logs')
    .select('action, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!logs?.length) return '🔒 No recent security events. All clear.';

  const list = logs.map((l: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(l.created_at).getTime()) / 60000);
    const unit = ago >= 60 ? `${Math.round(ago / 60)}h` : `${ago}m`;
    const sev = l.severity === 'high' ? '🔴' : l.severity === 'medium' ? '🟡' : '🟢';
    return `${i + 1}. ${sev} ${l.action} (${unit} ago)`;
  }).join('\n');
  return `🔒 Security Events:\n${list}`;
}

// ─── /visitors ───
export async function cmdVisitors(supabase: Supabase): Promise<string> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: visits } = await supabase
    .from('visitor_analytics')
    .select('page_url, created_at')
    .gte('created_at', todayStart.toISOString());

  if (!visits?.length) return '👀 No visitors recorded today yet.';

  const uniquePages = new Set(visits.map((v: any) => v.page_url));
  const topPages: Record<string, number> = {};
  visits.forEach((v: any) => {
    const page = v.page_url || '/';
    topPages[page] = (topPages[page] || 0) + 1;
  });
  const sorted = Object.entries(topPages).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let result = `👀 Today's Visitors:\n• ${visits.length} page views\n• ${uniquePages.size} unique pages\n\nTop pages:\n`;
  result += sorted.map(([page, count]) => `  ${page} — ${count} views`).join('\n');
  return result;
}

// ─── /twitter ───
export async function cmdTwitter(supabase: Supabase): Promise<string> {
  const { data: posts } = await supabase
    .from('twitter_posts')
    .select('content, status, engagement_score, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!posts?.length) return '🐦 No twitter posts found.';

  const list = posts.map((p: any, i: number) => {
    const ago = Math.round((Date.now() - new Date(p.created_at).getTime()) / 3600000);
    return `${i + 1}. "${p.content?.slice(0, 60)}…" [${p.status}] ${p.engagement_score ? `📈${p.engagement_score}` : ''} (${ago}h ago)`;
  }).join('\n');
  return `🐦 Recent Tweets:\n${list}`;
}

// ─── /reply_app ───
export async function cmdReplyApp(
  text: string, supabase: Supabase, supabaseUrl: string, supabaseKey: string
): Promise<string> {
  const parts = text.replace(/^\/reply_app\s+/i, '').split(/\s+/);
  const idFragment = parts[0];
  const message = parts.slice(1).join(' ');
  if (!idFragment || !message) return '❌ Usage: /reply_app [id] [message]';

  const { data: apps } = await supabase
    .from('service_applications')
    .select('id, full_name, email, service_type')
    .ilike('id', `${idFragment}%`)
    .limit(1);

  if (!apps?.length) return `❌ No application found starting with "${idFragment}"`;
  const app = apps[0];

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-reply-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: app.id,
        recipientEmail: app.email,
        recipientName: app.full_name,
        subject: `Re: Your ${app.service_type} Application`,
        message,
        serviceType: app.service_type,
      }),
    });

    const result = await res.json();

    await logAynActivity(supabase, 'application_replied', `Replied to ${app.full_name}: "${message.slice(0, 80)}"`, {
      target_id: app.id,
      target_type: 'application',
      details: { recipient: app.email, message, email_sent: result.success },
      triggered_by: 'telegram_command',
    });

    return result.success
      ? `✅ Replied to ${app.full_name} (${app.email}) about their ${app.service_type} application.`
      : `⚠️ Reply saved but email failed: ${result.error}`;
  } catch (e) {
    return `❌ Failed to send reply: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── /reply_contact ───
export async function cmdReplyContact(
  text: string, supabase: Supabase, supabaseUrl: string, supabaseKey: string
): Promise<string> {
  const parts = text.replace(/^\/reply_contact\s+/i, '').split(/\s+/);
  const idFragment = parts[0];
  const message = parts.slice(1).join(' ');
  if (!idFragment || !message) return '❌ Usage: /reply_contact [id] [message]';

  const { data: msgs } = await supabase
    .from('contact_messages')
    .select('id, name, email')
    .ilike('id', `${idFragment}%`)
    .limit(1);

  if (!msgs?.length) return `❌ No contact message found starting with "${idFragment}"`;
  const contact = msgs[0];

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return '❌ RESEND_API_KEY not configured';

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AYN <info@aynn.io>',
        to: [contact.email],
        subject: `Re: Your message to AYN`,
        html: `<p>Hi ${contact.name},</p><p>${message.replace(/\n/g, '<br>')}</p><p>Best regards,<br>The AYN Team</p>`,
      }),
    });

    const emailSent = emailRes.ok;
    await supabase.from('contact_messages').update({ status: 'replied' }).eq('id', contact.id);

    await logAynActivity(supabase, 'contact_replied', `Replied to ${contact.name}: "${message.slice(0, 80)}"`, {
      target_id: contact.id,
      target_type: 'contact_message',
      details: { recipient: contact.email, message, email_sent: emailSent },
      triggered_by: 'telegram_command',
    });

    return emailSent
      ? `✅ Replied to ${contact.name} (${contact.email}).`
      : `⚠️ Status updated but email may have failed.`;
  } catch (e) {
    return `❌ Failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── /email ───
export async function cmdEmail(text: string, supabase: Supabase): Promise<string> {
  const afterCmd = text.replace(/^\/email\s+/i, '');
  const spaceIdx = afterCmd.indexOf(' ');
  if (spaceIdx === -1) return '❌ Usage: /email [to] [subject] | [body]';
  const to = afterCmd.slice(0, spaceIdx);
  const rest = afterCmd.slice(spaceIdx + 1);
  const pipeIdx = rest.indexOf('|');
  if (pipeIdx === -1) return '❌ Usage: /email [to] [subject] | [body]';
  let cleanSubject = rest.slice(0, pipeIdx).trim()
    .replace(/^(?:AYN|ayn)\s*[:/\-–—]\s*/i, '')  // Remove "AYN:" or "AYN /" prefix
    .replace(/[—–]/g, '-')                         // Replace em-dashes with hyphens
    .replace(/\s+/g, ' ')                          // Collapse whitespace
    .trim();
  if (!cleanSubject) cleanSubject = 'Quick question';
  if (cleanSubject.length > 60) cleanSubject = cleanSubject.slice(0, 57) + '...';
  const subject = cleanSubject;
  const body = rest.slice(pipeIdx + 1).trim();

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return '❌ RESEND_API_KEY not configured';

  try {
    const signature = `AYN AI<br><span style="color:#888;font-size:13px;">Intelligent Automation Solutions</span><br><a href="https://aynn.io" style="color:#0EA5E9;">aynn.io</a>`;

    // Clean body: remove leaked subject prefix, handle newlines
    let cleanBody = body
      .replace(/^[^,.:!?]{0,40}:\s*/i, '')  // Remove "something:" prefix leaked from subject
      .replace(/\\n/g, '\n')
      .replace(/\n/g, '<br>');
    // Strip AI-generated signatures from body
    cleanBody = cleanBody.replace(/<br>\s*(?:Best|Regards|Cheers|Thanks|Warm regards|Kind regards),?\s*(?:<br>)?\s*(?:The\s+)?AYN(?:\s+Team)?(?:<br>.*)?$/i, '');
    // Programmatically replace banned words the AI might still use
    cleanBody = cleanBody
      .replace(/\bbespoke\b/gi, 'custom')
      .replace(/\bstreamline[sd]?\b/gi, 'simplify')
      .replace(/\bleverage[sd]?\b/gi, 'use')
      .replace(/\bsynergy\b/gi, 'teamwork')
      .replace(/\boff[\s-]the[\s-]shelf\b/gi, 'generic')
      .replace(/\bheavy lifting\b/gi, 'hard work')
      .replace(/\bdelighted\b/gi, 'happy')
      .replace(/\bthrilled\b/gi, 'glad');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AYN <info@mail.aynn.io>',
        to: [to],
        subject,
        html: `
<div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
  <div style="background:#000;padding:24px;text-align:center;">
    <h1 style="color:#fff;font-size:32px;font-weight:900;letter-spacing:-1px;margin:0;">AYN</h1>
    <div style="width:30px;height:3px;background:#0EA5E9;margin:10px auto 0;"></div>
  </div>
  <div style="padding:32px 24px;color:#333;font-size:15px;line-height:1.7;">
    ${cleanBody}
  </div>
  <div style="padding:20px 24px;border-top:1px solid #eee;">
    <p style="margin:0;font-size:14px;font-weight:600;color:#000;">${signature}</p>
  </div>
  <div style="background:#f9f9f9;padding:16px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#999;">&copy; 2026 AYN AI. All rights reserved.</p>
  </div>
</div>`,
      }),
    });

    await logAynActivity(supabase, 'email_sent', `Sent email to ${to}: "${subject}"`, {
      target_type: 'email',
      details: { to, subject, body, success: res.ok },
      triggered_by: 'telegram_command',
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[cmdEmail] Resend error:', errBody);
      return `❌ Email failed: ${errBody}`;
    }
    return `✅ Email sent to ${to}`;
  } catch (e) {
    return `❌ Failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── Delete commands ───
export async function cmdDelete(
  text: string, supabase: Supabase
): Promise<string> {
  const cmd = text.toLowerCase();

  if (cmd.startsWith('/delete_ticket ')) {
    const id = text.slice(15).trim();
    const { data } = await supabase.from('support_tickets').select('id, subject').ilike('id', `${id}%`).limit(1);
    if (!data?.length) return `❌ No ticket found starting with "${id}"`;
    await supabase.from('support_tickets').delete().eq('id', data[0].id);
    await logAynActivity(supabase, 'ticket_deleted', `Deleted ticket: ${data[0].subject || data[0].id}`, {
      target_id: data[0].id, target_type: 'ticket',
      details: { subject: data[0].subject },
      triggered_by: 'telegram_command',
    });
    return `🗑️ Deleted ticket ${data[0].id.slice(0, 8)}`;
  }

  if (cmd.startsWith('/delete_message')) {
    return `🔒 User messages are protected and cannot be deleted via Telegram. Use /messages to read them instead.`;
  }

  if (cmd.startsWith('/delete_app ')) {
    const id = text.slice(12).trim();
    const { data } = await supabase.from('service_applications').select('id, full_name, service_type').ilike('id', `${id}%`).limit(1);
    if (!data?.length) return `❌ No application found starting with "${id}"`;
    await supabase.from('service_applications').delete().eq('id', data[0].id);
    await logAynActivity(supabase, 'application_deleted', `Deleted application from ${data[0].full_name}`, {
      target_id: data[0].id, target_type: 'application',
      details: { full_name: data[0].full_name, service_type: data[0].service_type },
      triggered_by: 'telegram_command',
    });
    return `🗑️ Deleted application from ${data[0].full_name}`;
  }

  if (cmd.startsWith('/delete_contact ')) {
    const id = text.slice(16).trim();
    const { data } = await supabase.from('contact_messages').select('id, name, message').ilike('id', `${id}%`).limit(1);
    if (!data?.length) return `❌ No contact message found starting with "${id}"`;
    await supabase.from('contact_messages').delete().eq('id', data[0].id);
    await logAynActivity(supabase, 'contact_deleted', `Deleted contact message from ${data[0].name}`, {
      target_id: data[0].id, target_type: 'contact_message',
      details: { name: data[0].name, message_preview: data[0].message.slice(0, 200) },
      triggered_by: 'telegram_command',
    });
    return `🗑️ Deleted contact from ${data[0].name}`;
  }

  return '❌ Unknown delete command';
}

// ─── /clear_errors ───
export async function cmdClearErrors(text: string, supabase: Supabase): Promise<string> {
  const hoursStr = text.replace(/^\/clear_errors\s*/i, '').trim() || '24';
  const hours = parseInt(hoursStr);
  if (isNaN(hours) || hours < 1) return '❌ Usage: /clear_errors [hours]';
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('error_logs').select('*', { count: 'exact', head: true }).lt('created_at', cutoff);
  await supabase.from('error_logs').delete().lt('created_at', cutoff);
  await logAynActivity(supabase, 'errors_cleared', `Cleared ${count || 0} errors older than ${hours}h`, {
    target_type: 'error_log',
    details: { hours, cutoff, deleted_count: count },
    triggered_by: 'telegram_command',
  });
  return `🧹 Cleared ${count || 0} error logs older than ${hours} hours.`;
}

// ─── /think ───
export async function cmdThink(supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/ayn-proactive-loop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return "🧠 Running a thinking cycle now... I'll message you if I find anything interesting.";
  } catch {
    return '❌ Failed to trigger thinking cycle.';
  }
}

// ─── /unblock ───
export async function cmdUnblock(text: string, supabase: Supabase): Promise<string> {
  const userId = text.slice(9).trim();
  if (!userId) return '❌ Usage: /unblock [user_id]';

  // Block if target is an admin
  if (await isAdminUser(supabase, userId)) return ADMIN_PROTECTED_MSG;

  await supabase.from('api_rate_limits').update({ blocked_until: null }).eq('user_id', userId);
  await logAynActivity(supabase, 'user_unblocked', `Unblocked user ${userId.slice(0, 8)}`, {
    target_id: userId, target_type: 'user',
    triggered_by: 'telegram_command',
  });
  return `✅ Unblocked user ${userId.slice(0, 8)}...`;
}

// ═══════════════════════════════════════════════════════
// NEW COMMANDS
// ═══════════════════════════════════════════════════════

// ─── /user [id] — Full user profile ───
export async function cmdUser(text: string, supabase: Supabase): Promise<string> {
  const idFragment = text.replace(/^\/user\s+/i, '').trim();
  if (!idFragment) return '❌ Usage: /user [user_id]';

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, company_name, contact_person, business_type, account_status, last_login, created_at')
    .ilike('user_id', `${idFragment}%`)
    .limit(1);

  if (!profiles?.length) return `❌ No user found starting with "${idFragment}"`;
  const p = profiles[0];

  const { data: grants } = await supabase
    .from('access_grants')
    .select('is_active, monthly_limit, current_month_usage, auth_method, expires_at, created_at')
    .eq('user_id', p.user_id)
    .limit(1);

  const grant = grants?.[0];
  const lastLogin = p.last_login ? new Date(p.last_login).toLocaleDateString() : 'never';
  const joined = new Date(p.created_at).toLocaleDateString();

  let result = `👤 User Profile:
• Name: ${p.contact_person || 'N/A'}
• Company: ${p.company_name || 'N/A'}
• Type: ${p.business_type || 'N/A'}
• Status: ${p.account_status || 'active'}
• Last login: ${lastLogin}
• Joined: ${joined}
• ID: ${p.user_id}`;

  if (grant) {
    const limitStr = grant.monthly_limit === -1 ? 'unlimited' : `${grant.current_month_usage || 0}/${grant.monthly_limit || 'N/A'}`;
    result += `\n\n🔑 Access Grant:
• Active: ${grant.is_active ? '✅' : '❌'}
• Auth: ${grant.auth_method || 'N/A'}
• Usage: ${limitStr}
• Expires: ${grant.expires_at ? new Date(grant.expires_at).toLocaleDateString() : 'never'}`;
  } else {
    result += '\n\n🔑 No access grant found.';
  }

  return result;
}

// ─── /grant [email] — Create access grant ───
export async function cmdGrant(text: string, supabase: Supabase): Promise<string> {
  const email = text.replace(/^\/grant\s+/i, '').trim();
  if (!email || !email.includes('@')) return '❌ Usage: /grant [email]';

  // Look up user by email in auth.users via profiles
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const user = authUsers?.users?.find((u: any) => u.email === email);

  if (!user) return `❌ No auth user found with email "${email}"`;

  // Check if grant already exists
  const { data: existing } = await supabase
    .from('access_grants')
    .select('id, is_active')
    .eq('user_id', user.id)
    .limit(1);

  // Block if target is an admin
  if (await isAdminUser(supabase, user.id)) return ADMIN_PROTECTED_MSG;

  if (existing?.length) {
    if (existing[0].is_active) return `⚠️ User already has an active access grant.`;
    // Reactivate
    await supabase.from('access_grants').update({ is_active: true }).eq('id', existing[0].id);
    await logAynActivity(supabase, 'access_grant_reactivated', `Reactivated access for ${email}`, {
      target_id: user.id, target_type: 'user', triggered_by: 'telegram_command',
    });
    return `✅ Reactivated access grant for ${email}`;
  }

  // Create new grant
  await supabase.from('access_grants').insert({
    user_id: user.id,
    is_active: true,
    monthly_limit: 50,
    granted_by: 'ayn_telegram',
    notes: 'Created via Telegram command',
  });

  await logAynActivity(supabase, 'access_grant_created', `Created access grant for ${email}`, {
    target_id: user.id, target_type: 'user', triggered_by: 'telegram_command',
  });

  return `✅ Access granted to ${email} (limit: 50/month)`;
}

// ─── /revoke [id] — Deactivate access grant ───
export async function cmdRevoke(text: string, supabase: Supabase): Promise<string> {
  const idFragment = text.replace(/^\/revoke\s+/i, '').trim();
  if (!idFragment) return '❌ Usage: /revoke [user_id]';

  const { data: grants } = await supabase
    .from('access_grants')
    .select('id, user_id, is_active')
    .ilike('user_id', `${idFragment}%`)
    .limit(1);

  if (!grants?.length) return `❌ No access grant found for user starting with "${idFragment}"`;

  // Block if target is an admin
  if (await isAdminUser(supabase, grants[0].user_id)) return ADMIN_PROTECTED_MSG;

  if (!grants[0].is_active) return `⚠️ Access is already revoked for this user.`;

  await supabase.from('access_grants').update({ is_active: false }).eq('id', grants[0].id);

  await logAynActivity(supabase, 'access_revoked', `Revoked access for user ${grants[0].user_id.slice(0, 8)}`, {
    target_id: grants[0].user_id, target_type: 'user', triggered_by: 'telegram_command',
  });

  return `✅ Revoked access for user ${grants[0].user_id.slice(0, 8)}...`;
}

// ─── /set_unlimited [id] — Set user to unlimited ───
export async function cmdSetUnlimited(text: string, supabase: Supabase): Promise<string> {
  const idFragment = text.replace(/^\/set_unlimited\s+/i, '').trim();
  if (!idFragment) return '❌ Usage: /set_unlimited [user_id]';

  const { data: grants } = await supabase
    .from('access_grants')
    .select('id, user_id, monthly_limit')
    .ilike('user_id', `${idFragment}%`)
    .limit(1);

  if (!grants?.length) return `❌ No access grant found for user starting with "${idFragment}"`;

  // Block if target is an admin
  if (await isAdminUser(supabase, grants[0].user_id)) return ADMIN_PROTECTED_MSG;

  const newLimit = grants[0].monthly_limit === -1 ? 50 : -1;
  await supabase.from('access_grants').update({ monthly_limit: newLimit }).eq('id', grants[0].id);

  await logAynActivity(supabase, 'user_limit_changed', `Set user ${grants[0].user_id.slice(0, 8)} to ${newLimit === -1 ? 'unlimited' : `${newLimit}/month`}`, {
    target_id: grants[0].user_id, target_type: 'user', triggered_by: 'telegram_command',
  });

  return newLimit === -1
    ? `✅ User ${grants[0].user_id.slice(0, 8)}... is now unlimited.`
    : `✅ User ${grants[0].user_id.slice(0, 8)}... set back to 50/month limit.`;
}

// ─── /query [table] [limit] — Read-only data peek ───
export async function cmdQuery(text: string, supabase: Supabase): Promise<string> {
  const parts = text.replace(/^\/query\s+/i, '').trim().split(/\s+/);
  const table = parts[0];
  const limit = Math.min(parseInt(parts[1] || '5'), 20);

  if (!table) return '❌ Usage: /query [table] [limit]\n\nAllowed: error_logs, support_tickets, service_applications, contact_messages, visitor_analytics, ayn_activity_log, twitter_posts, engineering_activity';

  const ALLOWED_TABLES = [
    'error_logs', 'support_tickets', 'service_applications', 'contact_messages',
    'visitor_analytics', 'ayn_activity_log', 'twitter_posts', 'engineering_activity',
  ];
  const BLOCKED_KEYWORDS = ['subscription', 'credit_gift', 'stripe', 'payment', 'billing'];

  if (BLOCKED_KEYWORDS.some(k => table.toLowerCase().includes(k))) {
    return "❌ That table is outside my access — money stuff is off-limits.";
  }
  if (!ALLOWED_TABLES.includes(table)) {
    return `❌ Table "${table}" not in allowed list.\n\nAllowed: ${ALLOWED_TABLES.join(', ')}`;
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return `❌ Query failed: ${error.message}`;
  if (!data?.length) return `📭 No data in ${table}.`;

  const rows = data.map((row: any, i: number) => {
    // Show a compact summary of each row
    const keys = Object.keys(row).filter(k => !['id', 'user_id', 'created_at', 'updated_at'].includes(k));
    const summary = keys.slice(0, 4).map(k => {
      const val = row[k];
      if (val === null) return `${k}: null`;
      if (typeof val === 'string') return `${k}: "${String(val).slice(0, 40)}"`;
      return `${k}: ${JSON.stringify(val).slice(0, 40)}`;
    }).join(', ');
    const ago = row.created_at ? Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000) + 'h ago' : '';
    return `${i + 1}. ${summary} (${ago})`;
  }).join('\n');

  return `📊 ${table} (${data.length} rows):\n${rows}`;
}

// ─── /webhooks — System monitoring ───
export async function cmdWebhooks(supabase: Supabase): Promise<string> {
  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: failedEmails }, { data: llmFailures }, { data: topErrors }] = await Promise.all([
    supabase.from('email_logs').select('email_type, error_message, sent_at')
      .eq('status', 'failed').gte('sent_at', now24h).order('sent_at', { ascending: false }).limit(5),
    supabase.from('llm_failures').select('error_type, error_message, created_at')
      .gte('created_at', now24h).order('created_at', { ascending: false }).limit(5),
    supabase.from('error_logs').select('error_message, created_at')
      .gte('created_at', now24h).order('created_at', { ascending: false }).limit(20),
  ]);

  let result = '🔧 System Health (24h):\n';

  // Failed emails
  if (failedEmails?.length) {
    result += `\n📧 Failed Emails (${failedEmails.length}):\n`;
    result += failedEmails.map((e: any) => `  • [${e.email_type}] ${(e.error_message || 'unknown error').slice(0, 60)}`).join('\n');
  } else {
    result += '\n📧 Emails: All OK';
  }

  // LLM failures
  if (llmFailures?.length) {
    result += `\n\n🤖 LLM Failures (${llmFailures.length}):\n`;
    result += llmFailures.map((f: any) => `  • [${f.error_type}] ${(f.error_message || '').slice(0, 60)}`).join('\n');
  } else {
    result += '\n\n🤖 LLM: All OK';
  }

  // Top recurring errors
  if (topErrors?.length) {
    const errorGroups: Record<string, number> = {};
    topErrors.forEach((e: any) => {
      const msg = e.error_message?.slice(0, 60) || 'unknown';
      errorGroups[msg] = (errorGroups[msg] || 0) + 1;
    });
    const recurring = Object.entries(errorGroups).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (recurring.length) {
      result += `\n\n🔄 Recurring Errors:\n`;
      result += recurring.map(([msg, count]) => `  • ${msg} (x${count})`).join('\n');
    }
  }

  return result;
}

// ─── find_user — Lookup user by email or name ───
export async function cmdFindUser(query: string, supabase: Supabase): Promise<string> {
  if (!query || query.length < 2) return '❌ Need at least 2 characters to search.';

  try {
    // Search profiles by contact_person (name)
    const { data: profileMatches } = await supabase
      .from('profiles')
      .select('user_id, contact_person, company_name, account_status, last_login')
      .ilike('contact_person', `%${query}%`)
      .limit(5);

    // Search auth users by email
    const { data: authData } = await supabase.auth.admin.listUsers();
    const emailMatches = authData?.users?.filter((u: any) =>
      u.email?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5) || [];

    // Merge results (deduplicate by user_id)
    const seen = new Set<string>();
    const results: Array<{
      user_id: string;
      name: string;
      email: string;
      company: string;
      status: string;
      last_login: string;
    }> = [];

    // Add profile matches
    for (const p of profileMatches || []) {
      if (seen.has(p.user_id)) continue;
      seen.add(p.user_id);
      const authUser = authData?.users?.find((u: any) => u.id === p.user_id);
      results.push({
        user_id: p.user_id,
        name: p.contact_person || 'N/A',
        email: authUser?.email || 'N/A',
        company: p.company_name || 'N/A',
        status: p.account_status || 'active',
        last_login: p.last_login ? new Date(p.last_login).toLocaleDateString() : 'never',
      });
    }

    // Add email matches not already found
    for (const u of emailMatches) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      const profile = profileMatches?.find((p: any) => p.user_id === u.id);
      results.push({
        user_id: u.id,
        name: profile?.contact_person || 'N/A',
        email: u.email || 'N/A',
        company: profile?.company_name || 'N/A',
        status: profile?.account_status || 'active',
        last_login: profile?.last_login ? new Date(profile.last_login).toLocaleDateString() : 'never',
      });
    }

    if (results.length === 0) return `❌ No users found matching "${query}"`;

    // For each result, fetch subscription tier and access grant status
    const enriched = await Promise.all(results.map(async (r) => {
      const [{ data: sub }, { data: grant }, { data: limits }] = await Promise.all([
        supabase.from('user_subscriptions').select('subscription_tier, status').eq('user_id', r.user_id).limit(1),
        supabase.from('access_grants').select('is_active, monthly_limit').eq('user_id', r.user_id).limit(1),
        supabase.from('user_ai_limits').select('is_unlimited').eq('user_id', r.user_id).limit(1),
      ]);
      const tier = sub?.[0]?.subscription_tier || 'free';
      const grantStatus = grant?.[0] ? (grant[0].is_active ? '✅ active' : '❌ inactive') : '⚠️ none';
      const unlimited = limits?.[0]?.is_unlimited ? '♾️' : '';
      return `• ${r.name} (${r.email})\n  Company: ${r.company} | Status: ${r.status}\n  Tier: ${tier} ${unlimited} | Grant: ${grantStatus}\n  Last login: ${r.last_login}\n  ID: ${r.user_id}`;
    }));

    await logAynActivity(supabase, 'user_lookup', `Searched for "${query}" — found ${results.length} result(s)`, {
      target_type: 'user',
      details: { query, result_count: results.length },
      triggered_by: 'telegram_command',
    });

    return `🔍 Found ${results.length} user(s) matching "${query}":\n\n${enriched.join('\n\n')}`;
  } catch (e) {
    console.error('cmdFindUser error:', e);
    return `❌ User lookup failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── check_user_status — Comprehensive user status (read-only) ───
export async function cmdCheckUserStatus(userIdOrPrefix: string, supabase: Supabase): Promise<string> {
  if (!userIdOrPrefix || userIdOrPrefix.length < 4) return '❌ Need at least 4 characters of the user ID.';

  try {
    // Find the user profile
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, contact_person, company_name, business_type, account_status, last_login, created_at')
      .ilike('user_id', `${userIdOrPrefix}%`)
      .limit(1);

    if (!profiles?.length) return `❌ No user found starting with "${userIdOrPrefix}"`;
    const p = profiles[0];

    // Fetch all status data in parallel
    const [
      { data: sub },
      { data: grant },
      { data: limits },
      { data: authData },
    ] = await Promise.all([
      supabase.from('user_subscriptions').select('subscription_tier, status, stripe_customer_id, current_period_end').eq('user_id', p.user_id).limit(1),
      supabase.from('access_grants').select('is_active, monthly_limit, current_month_usage, auth_method, expires_at, granted_by, notes').eq('user_id', p.user_id).limit(1),
      supabase.from('user_ai_limits').select('is_unlimited, daily_messages, monthly_messages, current_daily_messages, current_monthly_messages, daily_engineering, monthly_engineering, current_daily_engineering, current_monthly_engineering, bonus_credits, daily_reset_at, monthly_reset_at').eq('user_id', p.user_id).limit(1),
      supabase.auth.admin.getUserById(p.user_id),
    ]);

    const email = authData?.user?.email || 'N/A';
    const s = sub?.[0];
    const g = grant?.[0];
    const l = limits?.[0];

    let result = `📋 Full Status Report for ${p.contact_person || email}:

👤 Profile:
• Name: ${p.contact_person || 'N/A'}
• Email: ${email}
• Company: ${p.company_name || 'N/A'}
• Type: ${p.business_type || 'N/A'}
• Status: ${p.account_status || 'active'}
• Last login: ${p.last_login ? new Date(p.last_login).toLocaleDateString() : 'never'}
• Joined: ${new Date(p.created_at).toLocaleDateString()}
• ID: ${p.user_id}`;

    result += `\n\n💳 Subscription:
• Tier: ${s?.subscription_tier || 'free'}
• Status: ${s?.status || 'none'}
• Period end: ${s?.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : 'N/A'}`;

    if (g) {
      result += `\n\n🔑 Access Grant:
• Active: ${g.is_active ? '✅' : '❌'}
• Limit: ${g.monthly_limit === -1 ? 'unlimited' : g.monthly_limit}
• Usage: ${g.current_month_usage || 0}
• Auth: ${g.auth_method || 'N/A'}
• Granted by: ${g.granted_by || 'N/A'}
• Expires: ${g.expires_at ? new Date(g.expires_at).toLocaleDateString() : 'never'}`;
    } else {
      result += '\n\n🔑 Access Grant: None';
    }

    if (l) {
      result += `\n\n📊 AI Limits:
• Unlimited: ${l.is_unlimited ? '✅ YES' : '❌ no'}
• Daily msgs: ${l.current_daily_messages || 0}/${l.daily_messages || 'N/A'}
• Monthly msgs: ${l.current_monthly_messages || 0}/${l.monthly_messages || 'N/A'}
• Daily eng: ${l.current_daily_engineering || 0}/${l.daily_engineering || 'N/A'}
• Monthly eng: ${l.current_monthly_engineering || 0}/${l.monthly_engineering || 'N/A'}
• Bonus credits: ${l.bonus_credits || 0}
• Daily reset: ${l.daily_reset_at ? new Date(l.daily_reset_at).toLocaleString() : 'N/A'}
• Monthly reset: ${l.monthly_reset_at ? new Date(l.monthly_reset_at).toLocaleString() : 'N/A'}`;
    } else {
      result += '\n\n📊 AI Limits: No record';
    }

    await logAynActivity(supabase, 'user_status_check', `Checked full status for ${p.contact_person || email}`, {
      target_id: p.user_id,
      target_type: 'user',
      details: { tier: s?.subscription_tier, unlimited: l?.is_unlimited, grant_active: g?.is_active },
      triggered_by: 'telegram_command',
    });

    return result;
  } catch (e) {
    console.error('cmdCheckUserStatus error:', e);
    return `❌ Status check failed: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }
}

// ─── /weekly_report — 7-day executive summary ───
export async function cmdWeeklyReport(supabase: Supabase): Promise<string> {
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: newGrantsThisWeek },
    { count: newGrantsLastWeek },
    { count: errorsThisWeek },
    { count: errorsLastWeek },
    { count: ticketsResolved },
    { count: ticketsTotal },
    { data: topPages },
    { data: tweets },
    { count: messagesCount },
    { data: ratings },
  ] = await Promise.all([
    supabase.from('access_grants').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('access_grants').select('*', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', ago14d).lt('created_at', ago7d),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('created_at', ago7d),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('visitor_analytics').select('page_url').gte('created_at', ago7d),
    supabase.from('twitter_posts').select('content, status, impressions, likes').gte('created_at', ago7d),
    supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    supabase.from('message_ratings').select('rating').gte('created_at', ago7d),
  ]);

  // Top pages
  const pageViews: Record<string, number> = {};
  topPages?.forEach((v: any) => {
    const page = v.page_url || '/';
    pageViews[page] = (pageViews[page] || 0) + 1;
  });
  const top5Pages = Object.entries(pageViews).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Tweet stats
  const postedTweets = tweets?.filter((t: any) => t.status === 'posted') || [];
  const totalImpressions = postedTweets.reduce((sum: number, t: any) => sum + (t.impressions || 0), 0);
  const totalLikes = postedTweets.reduce((sum: number, t: any) => sum + (t.likes || 0), 0);

  // Feedback
  const positive = ratings?.filter((r: any) => r.rating === 'positive').length || 0;
  const totalRatings = ratings?.length || 0;

  // Try AI summary
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (LOVABLE_API_KEY) {
    try {
      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{
            role: 'system',
            content: 'You are AYN writing a weekly executive summary for the founder. Be concise, use emojis, highlight wins and concerns. 10-15 lines max.',
          }, {
            role: 'user',
            content: `Weekly data:
User growth: ${newGrantsThisWeek || 0} new (was ${newGrantsLastWeek || 0} last week)
Errors: ${errorsThisWeek || 0} (was ${errorsLastWeek || 0} last week)
Tickets: ${ticketsResolved || 0} resolved / ${ticketsTotal || 0} total
Top pages: ${top5Pages.map(([p, c]) => `${p}(${c})`).join(', ') || 'none'}
Tweets: ${postedTweets.length} posted, ${totalImpressions} impressions, ${totalLikes} likes
AI messages: ${messagesCount || 0}
Feedback: ${positive}/${totalRatings} positive`,
          }],
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const summary = aiData.choices?.[0]?.message?.content?.trim();
        if (summary) return `📊 Weekly Report\n\n${summary}`;
      }
    } catch (e) {
      console.error('AI weekly report failed:', e);
    }
  }

  // Fallback: raw report
  return `📊 Weekly Report (7 days):

👥 Users: ${newGrantsThisWeek || 0} new grants (prev week: ${newGrantsLastWeek || 0})
⚠️ Errors: ${errorsThisWeek || 0} (prev week: ${errorsLastWeek || 0})
🎫 Tickets: ${ticketsResolved || 0}/${ticketsTotal || 0} resolved
🐦 Tweets: ${postedTweets.length} posted, ${totalImpressions} impressions
💬 AI Messages: ${messagesCount || 0}
👍 Feedback: ${positive}/${totalRatings} positive

Top Pages:
${top5Pages.map(([p, c]) => `  ${p} — ${c} views`).join('\n') || '  No data'}`;
}
