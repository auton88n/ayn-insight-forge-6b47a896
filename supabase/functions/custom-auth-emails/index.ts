import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// v3.159.0 — npm: specifier, see job-board-sync's identical comment.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Security-Policy': "default-src 'self'; script-src 'none'; object-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
};

interface AuthEmailRequest {
  type: 'signup_confirmation' | 'password_reset' | 'email_change';
  email: string;
  confirmation_url: string;
  user_data?: any;
}

const serve_handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication and admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !userRole) {
      throw new Error('Insufficient permissions - admin role required');
    }
    const resend = new Resend(resendApiKey);

    const { type, email, confirmation_url, user_data }: AuthEmailRequest = await req.json();

    // Get the email template from database
    const { data: template, error: templateError } = await supabase
      .from('auth_email_templates')
      .select('*')
      .eq('template_type', type)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      console.error('Template error:', templateError);
      return new Response(
        JSON.stringify({ error: 'Email template not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Replace template variables
    let htmlContent = template.html_content;
    let textContent = template.text_content || '';

    // Replace common variables
    htmlContent = htmlContent.replace(/\{\{ \.Email \}\}/g, email);
    htmlContent = htmlContent.replace(/\{\{ \.ConfirmationURL \}\}/g, confirmation_url);

    textContent = textContent.replace(/\{\{ \.Email \}\}/g, email);
    textContent = textContent.replace(/\{\{ \.ConfirmationURL \}\}/g, confirmation_url);

    // Add user-specific data if available
    if (user_data) {
      for (const [key, value] of Object.entries(user_data)) {
        const placeholder = `{{ .${key} }}`;
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), String(value));
        textContent = textContent.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }

    // Send the email
    const emailResponse = await resend.emails.send({
      // v3.160.0 — self-hosted's Resend account only has support.ayn.careers
      // verified; ayn.careers itself isn't, so this send-from moved there.
      // This function has zero real callers in src/ regardless — fixed
      // anyway for consistency.
      from: 'AYN <auth@support.ayn.careers>',
      to: [email],
      subject: template.subject,
      html: htmlContent,
      text: textContent,
    });

    console.log('Custom auth email sent successfully:', emailResponse);

    return new Response(JSON.stringify({
      success: true,
      message: 'Custom authentication email sent successfully',
      email_id: emailResponse.data?.id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in custom-auth-emails function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to send custom authentication email',
        details: error.message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(serve_handler);
