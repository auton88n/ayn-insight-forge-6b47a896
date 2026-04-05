import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders from _shared/cors.ts
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface VisitData {
  visitor_id: string;
  page_path: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  session_id?: string;
  screen_width?: number;
  screen_height?: number;
  user_agent?: string;
}

// Detect device type from user agent
function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
  return 'desktop';
}

// Detect browser from user agent
function getBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('edg')) return 'Edge';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('safari')) return 'Safari';
  if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
  return 'Other';
}

// Detect OS from user agent
function getOS(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac os') || ua.includes('macos')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  return 'Other';
}

// Get geolocation from IP using free API
async function getGeoLocation(ip: string): Promise<{ country: string; country_code: string; city: string; region: string }> {
  try {
    // Skip for localhost/private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return { country: 'Local', country_code: 'XX', city: 'Local', region: 'Local' };
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        country: data.country || 'Unknown',
        country_code: data.countryCode || 'XX',
        city: data.city || 'Unknown',
        region: data.regionName || 'Unknown'
      };
    }
  } catch (error) {
    console.error('Geolocation error:', error);
  }
  
  return { country: 'Unknown', country_code: 'XX', city: 'Unknown', region: 'Unknown' };
}

// Sanitize path to prevent XSS and handle malicious input
function sanitizePath(path: string): string {
  if (typeof path !== 'string') return '/';
  // Remove any HTML/script tags and limit length
  return path.replace(/<[^>]*>/g, '').replace(/[<>'"]/g, '').slice(0, 500);
}

// Validate visitor_id format (alphanumeric with limited special chars)
function validateVisitorId(visitorId: string): boolean {
  if (typeof visitorId !== 'string') return false;
  if (visitorId.length < 5 || visitorId.length > 100) return false;
  // Only allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(visitorId);
}

// In-memory rate limiting for edge function (per-instance)
const requestTracker = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 15;

function checkEdgeFunctionRateLimit(visitorId: string): boolean {
  const now = Date.now();
  const tracker = requestTracker.get(visitorId);
  
  if (!tracker || tracker.resetAt < now) {
    requestTracker.set(visitorId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (tracker.count >= MAX_REQUESTS_PER_MINUTE) {
    console.warn(`Rate limit exceeded for visitor: ${visitorId.slice(0, 20)}...`);
    return false;
  }
  
  tracker.count++;
  return true;
}

// Cleanup old entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestTracker.entries()) {
    if (value.resetAt < now) {
      requestTracker.delete(key);
    }
  }
}, 60000);

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Safely parse JSON, handle non-JSON input
    let visitData: VisitData;
    try {
      visitData = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    // Validate required fields
    if (!visitData.visitor_id || !visitData.page_path) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: visitor_id, page_path" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate visitor_id format
    if (!validateVisitorId(visitData.visitor_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid visitor_id format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check edge function rate limit
    if (!checkEdgeFunctionRateLimit(visitData.visitor_id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please slow down." }),
        { status: 429, headers: { 
          "Content-Type": "application/json",
          "Retry-After": "60",
          ...corsHeaders 
        } }
      );
    }
    
    // Get client IP from headers
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || 'Unknown';
    
    // Get user agent
    const userAgent = visitData.user_agent || req.headers.get('user-agent') || '';
    
    // Parse device info
    const deviceType = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);
    const os = getOS(userAgent);
    
    // Get geolocation
    const geo = await getGeoLocation(clientIp);
    
    console.log(`Tracking visit: ${visitData.page_path} from ${geo.country} (${geo.city})`);

    // Insert analytics record with sanitized data
    const { error } = await supabase.from('visitor_analytics').insert({
      visitor_id: sanitizePath(visitData.visitor_id),
      page_path: sanitizePath(visitData.page_path),
      referrer: visitData.referrer || null,
      country: geo.country,
      country_code: geo.country_code,
      city: geo.city,
      region: geo.region,
      device_type: deviceType,
      browser: browser,
      os: os,
      utm_source: visitData.utm_source || null,
      utm_medium: visitData.utm_medium || null,
      utm_campaign: visitData.utm_campaign || null,
      session_id: visitData.session_id || null
    });

    if (error) {
      console.error('Insert error:', error);
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Track visit error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
