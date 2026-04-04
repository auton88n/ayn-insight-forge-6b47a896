import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface EmailRequest {
  type: 'generate' | 'improve' | 'template';
  content?: string;
  context?: {
    purpose?: string;
    tone?: string;
    audience?: string;
    subject?: string;
    key_points?: string[];
    template_type?: string;
  };
}

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client for authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify the user is authenticated and is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !userRole) {
      throw new Error('Insufficient permissions - admin role required');
    }

    const emailRequest: EmailRequest = await req.json();
    const { type, content, context } = emailRequest;

    let systemPrompt = '';
    let userPrompt = '';

    switch (type) {
      case 'generate':
        systemPrompt = `You are an AI email writing assistant for AYN Platform administrators. 
        Create professional, clear, and engaging emails based on the user's requirements.
        Always maintain a professional tone while being friendly and helpful.
        Structure emails with proper greeting, body, and closing.
        Keep emails concise but comprehensive.`;
        
        userPrompt = `Create an email with the following details:
        Purpose: ${context?.purpose || 'General communication'}
        Tone: ${context?.tone || 'Professional'}
        Audience: ${context?.audience || 'Users'}
        Subject: ${context?.subject || 'Please suggest a subject'}
        Key Points: ${context?.key_points?.join(', ') || 'None specified'}
        
        Please provide both a subject line and email content.`;
        break;

      case 'improve':
        systemPrompt = `You are an AI email writing assistant. Improve the given email by:
        - Making it clearer and more concise
        - Improving the tone and professionalism
        - Enhancing readability and structure
        - Fixing grammar and spelling issues
        - Making it more engaging while staying professional`;
        
        userPrompt = `Please improve this email:
        
        ${content}
        
        Context: ${JSON.stringify(context, null, 2)}`;
        break;

      case 'template':
        systemPrompt = `You are an AI assistant creating reusable email templates for AYN Platform.
        Create templates with placeholder variables using {{variable_name}} format.
        Make templates flexible and professional for the specified type.
        Include common variables like {{user_name}}, {{company_name}}, etc.`;
        
        userPrompt = `Create a ${context?.template_type || 'general'} email template with:
        Purpose: ${context?.purpose || 'General communication'}
        Tone: ${context?.tone || 'Professional'}
        
        Include appropriate variables and structure for reuse.
        Provide both subject and content with variables.`;
        break;

      default:
        throw new Error('Invalid request type');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('AI gateway error:', response.status, errorData);
      if (response.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      if (response.status === 402) {
        const maintenanceSupabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(maintenanceSupabase, 'AI credits exhausted (402 from ai-email-assistant)');
        return new Response(JSON.stringify({ success: false, error: 'Service temporarily unavailable. Please try again later.' }), {
          status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    // Parse the response to extract subject and content
    let subject = '';
    let emailContent = '';

    if (generatedContent.includes('Subject:') || generatedContent.includes('SUBJECT:')) {
      const lines = generatedContent.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().startsWith('subject:')) {
          subject = line.replace(/^subject:\s*/i, '').trim();
          break;
        }
      }
      emailContent = generatedContent.replace(/^subject:.*\n/i, '').trim();
    } else {
      // Try to extract from markdown format
      const subjectMatch = generatedContent.match(/\*\*Subject:\*\*\s*(.*)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        emailContent = generatedContent.replace(/\*\*Subject:\*\*.*\n/, '').trim();
      } else {
        emailContent = generatedContent;
      }
    }

    // Extract variables from the content if it's a template
    let variables: string[] = [];
    if (type === 'template') {
      const matches = emailContent.match(/\{\{([^}]+)\}\}/g) || [];
      variables = [...new Set(matches.map(match => match.replace(/[{}]/g, '')))];
      
      // Also check subject for variables
      if (subject) {
        const subjectMatches = subject.match(/\{\{([^}]+)\}\}/g) || [];
        const subjectVars = subjectMatches.map(match => match.replace(/[{}]/g, ''));
        variables = [...new Set([...variables, ...subjectVars])];
      }
    }

    console.log('AI generated email successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        subject: subject || context?.subject || 'Email from AYN Platform',
        content: emailContent,
        variables: variables,
        originalRequest: type
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error) {
    console.error('Error in ai-email-assistant function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to generate email content' 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});