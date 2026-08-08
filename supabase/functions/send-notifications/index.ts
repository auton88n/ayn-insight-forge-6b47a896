// send-notifications — system/cost alert emails.
//
// SECURITY FIX (found by a full source-read audit, not caught by the
// earlier curl-boundary-test pass): this function had verify_jwt:false and
// NO auth check of any kind in its body. Anyone with the public anon key
// could POST { type, subject, content, recipient_email } and have it send
// a real "AYN System" branded email to that address from ayn.careers -- or, by
// passing a user_id instead, resolve an arbitrary account id to its real
// email via auth.admin.getUserById and message that person directly. The
// `content` field was interpolated into the outgoing HTML with zero
// escaping, so this was also an HTML-injection/phishing primitive riding
// on AYN's own sending domain.
//
// This function has no legitimate frontend caller -- it exists purely to
// be invoked server-to-server (its one real caller, cost-monitor, is
// itself dead/orphaned). Locked to service-role-only, the same "is this
// call internal" check ayn-unified already used for its own internal
// calls, rather than opening it to any signed-in user for no reason.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "npm:resend@2.0.0";
import { escapeHtml } from '../_shared/emailTemplate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  type: 'emergency_shutdown' | 'cost_threshold' | 'resource_warning' | 'auth_email';
  user_id?: string;
  subject: string;
  content: string;
  metadata?: any;
  recipient_email?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const notificationEmail = Deno.env.get('NOTIFICATION_EMAIL') || 'noreply@ayn.careers';

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    const { type, user_id, subject, content, metadata, recipient_email }: NotificationRequest = await req.json();

    // Determine recipient email
    let recipientEmail = recipient_email;

    if (!recipientEmail) {
      // For system alerts, use notification email
      if (['emergency_shutdown', 'resource_warning'].includes(type)) {
        recipientEmail = notificationEmail;
      } else if (user_id) {
        // For user-specific alerts, get user's email
        const { data: user, error: userError } = await supabase.auth.admin.getUserById(user_id);
        if (userError || !user) {
          throw new Error(`Could not find user: ${user_id}`);
        }
        recipientEmail = user.email;
      }
    }

    if (!recipientEmail) {
      throw new Error('No recipient email found');
    }

    const safeContent = escapeHtml(content);
    const safeMetadata = metadata ? escapeHtml(JSON.stringify(metadata, null, 2)) : '';

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: `AYN System <${notificationEmail}>`,
      to: [recipientEmail],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AYN System Alert</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              ${safeContent}
            </div>
            ${safeMetadata ? `
              <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                <strong>Additional Details:</strong>
                <pre style="margin: 5px 0; font-size: 12px; overflow-x: auto;">${safeMetadata}</pre>
              </div>
            ` : ''}
          </div>
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>This is an automated message from AYN System. Please do not reply.</p>
            <p>Time: ${new Date().toISOString()}</p>
          </div>
        </div>
      `,
      text: content + (metadata ? `\n\nDetails: ${JSON.stringify(metadata, null, 2)}` : '')
    });

    console.log('Email sent successfully:', emailResponse);

    // Log to alert history
    const { error: logError } = await supabase
      .from('alert_history')
      .insert({
        alert_type: type,
        recipient_email: recipientEmail,
        subject: subject,
        content: content,
        user_id: user_id || null,
        metadata: metadata || {},
        status: emailResponse.error ? 'failed' : 'sent',
        error_message: emailResponse.error?.message || null
      });

    if (logError) {
      console.error('Failed to log alert:', logError);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Notification sent successfully',
      email_id: emailResponse.data?.id,
      recipient: recipientEmail
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in send-notifications function:', error);
    return new Response(JSON.stringify({
      error: 'Failed to send notification',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
