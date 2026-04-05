import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Security headers for all responses
const securityHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Content-Security-Policy': "default-src 'self'; script-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

// Suspicious patterns that could indicate malicious content
const SUSPICIOUS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /eval\s*\(/i,
  /document\.(write|cookie)/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /vbscript:/i,
];

const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB limit

interface SurveyPoint {
  id: string;
  x: number;
  y: number;
  z: number;
}

interface TerrainAnalysis {
  minElevation: number;
  maxElevation: number;
  elevationRange: number;
  avgElevation: number;
  pointCount: number;
  estimatedArea: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function parseTabSeparated(content: string): SurveyPoint[] {
  const lines = content.trim().split('\n');
  const points: SurveyPoint[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('point')) continue;
    
    const parts = trimmed.split(/\t+/);
    if (parts.length >= 4) {
      const id = parts[0].trim();
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        points.push({ id, x, y, z });
      }
    }
  }
  
  return points;
}

function parseCSV(content: string): SurveyPoint[] {
  const lines = content.trim().split('\n');
  const points: SurveyPoint[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('point')) continue;
    
    const parts = trimmed.split(',');
    if (parts.length >= 4) {
      const id = parts[0].trim();
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        points.push({ id, x, y, z });
      }
    }
  }
  
  return points;
}

function analyzePoints(points: SurveyPoint[]): TerrainAnalysis {
  if (points.length === 0) {
    return {
      minElevation: 0,
      maxElevation: 0,
      elevationRange: 0,
      avgElevation: 0,
      pointCount: 0,
      estimatedArea: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  const elevations = points.map(p => p.z);
  const xCoords = points.map(p => p.x);
  const yCoords = points.map(p => p.y);

  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const minX = Math.min(...xCoords);
  const maxX = Math.max(...xCoords);
  const minY = Math.min(...yCoords);
  const maxY = Math.max(...yCoords);

  const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
  const estimatedArea = (maxX - minX) * (maxY - minY);

  return {
    minElevation: Math.round(minElevation * 100) / 100,
    maxElevation: Math.round(maxElevation * 100) / 100,
    elevationRange: Math.round((maxElevation - minElevation) * 100) / 100,
    avgElevation: Math.round(avgElevation * 100) / 100,
    pointCount: points.length,
    estimatedArea: Math.round(estimatedArea * 100) / 100,
    minX: Math.round(minX * 100) / 100,
    maxX: Math.round(maxX * 100) / 100,
    minY: Math.round(minY * 100) / 100,
    maxY: Math.round(maxY * 100) / 100,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required',
      }), {
        status: 401,
        headers: securityHeaders,
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid or expired session',
      }), {
        status: 401,
        headers: securityHeaders,
      });
    }

    // Rate limiting check
    const { data: rateLimitResult, error: rateLimitError } = await supabase.rpc('check_api_rate_limit', {
      p_user_id: user.id,
      p_endpoint: 'parse-survey',
      p_max_requests: 20,
      p_window_minutes: 60
    });

    if (!rateLimitError && rateLimitResult?.[0]?.allowed === false) {
      const retryAfter = Math.ceil((rateLimitResult[0].blocked_until - Date.now()) / 1000);
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      }), {
        status: 429,
        headers: {
          ...securityHeaders,
          'Retry-After': String(retryAfter > 0 ? retryAfter : 60),
        },
      });
    }

    const { content, fileName } = await req.json();
    
    // Content size validation
    if (!content || content.length > MAX_CONTENT_SIZE) {
      return new Response(JSON.stringify({
        success: false,
        error: content ? 'File content exceeds maximum size of 5MB' : 'No file content provided',
      }), {
        status: 400,
        headers: securityHeaders,
      });
    }

    if (content.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        error: 'No file content provided',
        points: [],
        terrainAnalysis: null,
      }), {
        status: 400,
        headers: securityHeaders,
      });
    }

    // Malicious content scan
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        console.warn('Malicious pattern detected in survey file', { 
          userId: user.id, 
          pattern: pattern.source,
          fileName 
        });
        return new Response(JSON.stringify({
          success: false,
          error: 'File contains potentially harmful content',
        }), {
          status: 400,
          headers: securityHeaders,
        });
      }
    }

    console.log(`Parsing survey file: ${fileName}`);
    
    let points: SurveyPoint[] = [];
    const lowerFileName = fileName?.toLowerCase() || '';
    
    // Detect format and parse
    if (lowerFileName.endsWith('.csv') || content.includes(',')) {
      console.log('Detected CSV format');
      points = parseCSV(content);
    } else {
      console.log('Detected tab-separated format');
      points = parseTabSeparated(content);
    }
    
    // If tab parsing failed, try CSV
    if (points.length === 0 && !lowerFileName.endsWith('.csv')) {
      console.log('Tab parsing failed, trying CSV');
      points = parseCSV(content);
    }

    if (points.length === 0) {
      throw new Error('Could not parse any valid survey points from the file. Expected format: pointID, easting, northing, elevation');
    }

    console.log(`Successfully parsed ${points.length} points`);
    
    const terrainAnalysis = analyzePoints(points);
    
    return new Response(JSON.stringify({
      success: true,
      points,
      terrainAnalysis,
    }), {
      headers: securityHeaders,
    });
  } catch (error) {
    console.error('Error parsing survey file:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: securityHeaders,
    });
  }
});
