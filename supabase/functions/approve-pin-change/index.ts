import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Generate HTML response page
function generateHtmlResponse(title: string, message: string, isSuccess: boolean): string {
  const color = isSuccess ? '#22c55e' : '#ef4444';
  const icon = isSuccess ? '✓' : '✕';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - AYN Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${color}20;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 40px;
      color: ${color};
    }
    h1 {
      color: #1a1a2e;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: #1a1a2e;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(0,0,0,0.2);
    }
    .logo {
      font-size: 32px;
      font-weight: 800;
      color: #1a1a2e;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AYN</div>
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://aynn.io" class="btn">Go to Dashboard</a>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const action = url.searchParams.get('action');

  if (!token || !action || !['approve', 'reject'].includes(action)) {
    return new Response(
      generateHtmlResponse('Invalid Request', 'Missing or invalid parameters.', false),
      { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find pending change by token
    const { data: pendingChange, error: findError } = await supabase
      .from('pending_pin_changes')
      .select('*')
      .eq('approval_token', token)
      .eq('status', 'pending')
      .single();

    if (findError || !pendingChange) {
      console.log('Pending change not found or already processed');
      return new Response(
        generateHtmlResponse('Request Not Found', 'This PIN change request was not found or has already been processed.', false),
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

    // Check expiration
    if (new Date(pendingChange.expires_at) < new Date()) {
      await supabase
        .from('pending_pin_changes')
        .update({ status: 'expired' })
        .eq('id', pendingChange.id);

      return new Response(
        generateHtmlResponse('Request Expired', 'This PIN change request has expired. Please submit a new request.', false),
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

    if (action === 'approve') {
      // Update the actual PIN
      const { error: updateError } = await supabase
        .from('system_config')
        .upsert({ 
          key: 'admin_pin', 
          value: { hash: pendingChange.new_pin_hash, salt: 'ayn_admin_salt_2024' },
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (updateError) {
        console.error('Error updating PIN:', updateError);
        return new Response(
          generateHtmlResponse('Update Failed', 'Failed to update the admin PIN. Please try again.', false),
          { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
        );
      }

      // Clear any lockout
      await supabase
        .from('system_config')
        .delete()
        .eq('key', 'admin_pin_lockout');

      // Mark as approved
      await supabase
        .from('pending_pin_changes')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', pendingChange.id);

      // Log the approval
      await supabase.from('security_logs').insert({
        user_id: pendingChange.user_id,
        action: 'admin_pin_change_approved',
        details: { pending_id: pendingChange.id },
        severity: 'high'
      });

      console.log(`PIN change approved for user ${pendingChange.user_id}`);

      return new Response(
        generateHtmlResponse('PIN Updated Successfully', 'The admin panel PIN has been changed. You can now use your new PIN to access the admin panel.', true),
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );

    } else {
      // Reject the change
      await supabase
        .from('pending_pin_changes')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', pendingChange.id);

      // Log the rejection
      await supabase.from('security_logs').insert({
        user_id: pendingChange.user_id,
        action: 'admin_pin_change_rejected',
        details: { pending_id: pendingChange.id },
        severity: 'high'
      });

      console.log(`PIN change rejected for user ${pendingChange.user_id}`);

      return new Response(
        generateHtmlResponse('PIN Change Rejected', 'The PIN change request has been rejected. The existing PIN remains unchanged.', true),
        { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
      );
    }

  } catch (error) {
    console.error('Error processing PIN change:', error);
    return new Response(
      generateHtmlResponse('Error', 'An unexpected error occurred. Please try again.', false),
      { headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
    );
  }
});
