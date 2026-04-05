import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

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

async function verifySignature(data: string, signature: string, secret: string): Promise<boolean> {
  const expectedSignature = await createSignature(data, secret);
  return signature === expectedSignature;
}

interface ApprovalToken {
  user_id: string;
  user_email: string;
  admin_email: string;
  expires_at: number;
  signature: string;
}

function parseToken(tokenString: string): ApprovalToken | null {
  try {
    const decoded = atob(tokenString);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Approve access function called");
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const baseUrl = "https://aynn.io";

  // Helper to redirect with status
  const redirect = (status: "success" | "error" | "expired" | "invalid", message?: string) => {
    const redirectUrl = `${baseUrl}/approval-result?status=${status}${message ? `&message=${encodeURIComponent(message)}` : ""}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl }
    });
  };

  if (!token) {
    console.error("No token provided");
    return redirect("invalid", "No approval token provided");
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const approvalSecret = Deno.env.get("APPROVAL_TOKEN_SECRET");
    
    if (!approvalSecret) {
      console.error("APPROVAL_TOKEN_SECRET not configured");
      return redirect("error", "Server configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate token
    const tokenData = parseToken(token);
    if (!tokenData) {
      console.error("Invalid token format");
      return redirect("invalid", "Invalid token format");
    }

    console.log("Token parsed:", { 
      user_id: tokenData.user_id, 
      user_email: tokenData.user_email,
      expires_at: new Date(tokenData.expires_at).toISOString()
    });

    // Check expiration
    if (Date.now() > tokenData.expires_at) {
      console.error("Token expired");
      return redirect("expired", "This approval link has expired");
    }

    // Verify signature
    const dataToVerify = `${tokenData.user_id}:${tokenData.user_email}:${tokenData.admin_email}:${tokenData.expires_at}`;
    const isValid = await verifySignature(dataToVerify, tokenData.signature, approvalSecret);
    
    if (!isValid) {
      console.error("Invalid signature");
      return redirect("invalid", "Invalid approval token signature");
    }

    // Check if user already has access
    const { data: existingGrant, error: checkError } = await supabase
      .from("access_grants")
      .select("is_active")
      .eq("user_id", tokenData.user_id)
      .single();

    if (checkError) {
      console.error("Error checking existing grant:", checkError);
      return redirect("error", "Failed to verify user access status");
    }

    if (existingGrant?.is_active) {
      console.log("User already has access");
      return redirect("success", `${tokenData.user_email} already has access`);
    }

    // Approve access
    const { error: updateError } = await supabase
      .from("access_grants")
      .update({
        is_active: true,
        granted_at: new Date().toISOString(),
        requires_approval: false,
        notes: `Approved via email link on ${new Date().toISOString()}`
      })
      .eq("user_id", tokenData.user_id);

    if (updateError) {
      console.error("Error updating access grant:", updateError);
      return redirect("error", "Failed to approve access");
    }

    // Log the approval action
    await supabase.from("security_logs").insert({
      action: "email_access_approval",
      details: {
        user_id: tokenData.user_id,
        user_email: tokenData.user_email,
        admin_email: tokenData.admin_email,
        approved_at: new Date().toISOString(),
        method: "email_link"
      },
      severity: "info"
    });

    // Log to admin notification log
    await supabase.from("admin_notification_log").insert({
      notification_type: "access_approval",
      recipient_email: tokenData.admin_email,
      subject: `Access approved for ${tokenData.user_email}`,
      status: "completed",
      metadata: {
        user_id: tokenData.user_id,
        user_email: tokenData.user_email,
        approved_via: "email_link"
      }
    });

    console.log("Access approved successfully for:", tokenData.user_email);
    return redirect("success", tokenData.user_email);

  } catch (error) {
    console.error("Unexpected error:", error);
    return redirect("error", "An unexpected error occurred");
  }
};

serve(handler);
