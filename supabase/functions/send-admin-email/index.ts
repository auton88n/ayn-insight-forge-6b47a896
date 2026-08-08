import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request): Promise<Response> => {
  console.log('send-admin-email function invoked');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    console.log('Checking RESEND_API_KEY availability...');
    console.log('RESEND_API_KEY exists:', !!resendApiKey);

    if (!resendApiKey) {
      const errorMsg = 'RESEND_API_KEY environment variable is not set. Please check Supabase secrets configuration.';
      console.error(errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const resend = new Resend(resendApiKey);

    // Get Supabase environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { to, subject, content, fromEmail, htmlContent } = body;

    if (!to || !subject || !content) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, subject, content' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Parsed request:', { to, subject, fromEmail });

    // Get current user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Authenticated user:', user.id);

    // SECURITY FIX (full source-read audit): this function checked only
    // that the caller held *any* valid session, never that they were an
    // admin -- unlike every sibling admin-email function (admin-broadcast,
    // custom-auth-emails, send-reply-email, send-ticket-reply,
    // verify-admin-pin all check has_role(...,'admin')). Any freshly
    // signed-up account could send email "from" admin@ayn.careers to anyone.
    // Same has_role check as admin-broadcast, closing the gap.
    const { data: isAdmin, error: roleErr } = await supabaseClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Process subject and content for variables
    const finalSubject = subject;
    const finalContent = content;
    const finalHtmlContent = htmlContent || `<div style="white-space: pre-wrap;">${content}</div>`;

    // Create email record in database
    const { data: emailRecord, error: emailError } = await supabaseClient
      .from('admin_emails')
      .insert({
        sender_email: fromEmail || 'admin@ayn.careers',
        recipient_email: to,
        subject: finalSubject,
        content: finalContent,
        html_content: finalHtmlContent,
        status: 'pending',
        created_by: user.id,
        email_type: 'outbound',
        metadata: { sent_from: 'admin_panel' }
      })
      .select()
      .single();

    if (emailError) {
      console.error('Database error:', emailError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create email record' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    console.log('Email record created:', emailRecord.id);

    // Send email via Resend
    try {
      console.log('Attempting to send email via Resend...');
      const primaryFrom = fromEmail || 'AYN Admin <admin@ayn.careers>';

      const emailResponse = await resend.emails.send({
        from: primaryFrom,
        to: [to],
        subject: finalSubject,
        text: finalContent,
        html: finalHtmlContent,
      });

      console.log('Resend response:', emailResponse);

      if (emailResponse.error) {
        throw new Error(`Resend API error: ${emailResponse.error.message}`);
      }

      // Update email record as sent
      await supabaseClient
        .from('admin_emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          metadata: {
            ...emailRecord.metadata,
            resend_id: emailResponse.data?.id,
            resend_response: emailResponse,
            sender_used: primaryFrom
          }
        })
        .eq('id', emailRecord.id);

      console.log('Email sent successfully');

      return new Response(
        JSON.stringify({
          success: true,
          emailId: emailRecord.id,
          resendId: emailResponse.data?.id,
          message: 'Email sent successfully'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );

    } catch (emailError: any) {
      console.error('Error sending email:', emailError);

      // If domain is not verified, try fallback
      const errorMessage = emailError?.message || JSON.stringify(emailError);
      const shouldFallback = /domain.*not.*verified|not verified|blocked.*sending|from address/i.test(errorMessage);

      if (shouldFallback) {
        try {
          console.log('Attempting fallback with Resend sandbox...');
          const fallbackFrom = 'Lovable Sandbox <onboarding@resend.dev>';

          const fallbackResponse = await resend.emails.send({
            from: fallbackFrom,
            to: [to],
            subject: finalSubject,
            text: finalContent,
            html: finalHtmlContent,
          });

          console.log('Fallback response:', fallbackResponse);

          await supabaseClient
            .from('admin_emails')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              metadata: {
                ...emailRecord.metadata,
                resend_id: fallbackResponse.data?.id,
                resend_response: fallbackResponse,
                fallback_used: true,
                sender_used: fallbackFrom,
                primary_error: errorMessage
              }
            })
            .eq('id', emailRecord.id);

          return new Response(
            JSON.stringify({
              success: true,
              emailId: emailRecord.id,
              resendId: fallbackResponse.data?.id,
              message: 'Email sent successfully (fallback sender)'
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            }
          );
        } catch (fallbackError: any) {
          console.error('Fallback send failed:', fallbackError);

          await supabaseClient
            .from('admin_emails')
            .update({
              status: 'failed',
              error_message: `Primary: ${errorMessage} | Fallback: ${fallbackError?.message || JSON.stringify(fallbackError)}`,
              metadata: { ...emailRecord.metadata, error_primary: emailError, error_fallback: fallbackError }
            })
            .eq('id', emailRecord.id);

          return new Response(
            JSON.stringify({ success: false, error: 'Email sending failed for both primary and fallback senders' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      // Update email record as failed
      await supabaseClient
        .from('admin_emails')
        .update({
          status: 'failed',
          error_message: errorMessage,
          metadata: { ...emailRecord.metadata, error: emailError }
        })
        .eq('id', emailRecord.id);

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

  } catch (error) {
    console.error('Unexpected error in send-admin-email function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
