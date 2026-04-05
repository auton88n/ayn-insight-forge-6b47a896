import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Get access token from service account credentials
async function getAccessToken(credentials: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  // Create JWT header and payload
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: exp,
    iat: now,
  };

  // Base64url encode
  const base64url = (str: string) => {
    const base64 = btoa(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Import private key and sign
  const privateKeyPem = credentials.private_key;
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signature = base64url(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token exchange error:', error);
    throw new Error(`Failed to get access token: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Fetch GA4 report data
async function fetchGA4Report(accessToken: string, propertyId: string, metrics: string[], dimensions: string[] = [], dateRange: { startDate: string; endDate: string }) {
  const requestBody: any = {
    dateRanges: [dateRange],
    metrics: metrics.map(name => ({ name })),
  };

  if (dimensions.length > 0) {
    requestBody.dimensions = dimensions.map(name => ({ name }));
  }

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('GA4 report error:', error);
    throw new Error(`GA4 API error: ${error}`);
  }

  return response.json();
}

// Fetch real-time data
async function fetchRealTimeData(accessToken: string, propertyId: string) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metrics: [{ name: 'activeUsers' }],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Realtime report error:', error);
    return { activeUsers: 0 };
  }

  const data = await response.json();
  const activeUsers = data.rows?.[0]?.metricValues?.[0]?.value || '0';
  return { activeUsers: parseInt(activeUsers) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const credentialsJson = Deno.env.get('GOOGLE_ANALYTICS_CREDENTIALS');
    const propertyId = Deno.env.get('GA4_PROPERTY_ID');

    if (!credentialsJson) {
      throw new Error('GOOGLE_ANALYTICS_CREDENTIALS not configured');
    }

    if (!propertyId) {
      throw new Error('GA4_PROPERTY_ID not configured');
    }

    console.log('Parsing credentials...');
    const credentials = JSON.parse(credentialsJson);
    
    console.log('Getting access token...');
    const accessToken = await getAccessToken(credentials);
    
    console.log('Fetching GA4 data...');

    // Date ranges
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch all data in parallel
    const [
      realTimeData,
      todayData,
      weekData,
      monthData,
      topPagesData,
      trafficSourcesData,
      countryData,
    ] = await Promise.all([
      fetchRealTimeData(accessToken, propertyId),
      fetchGA4Report(accessToken, propertyId, ['sessions', 'screenPageViews', 'totalUsers', 'bounceRate', 'averageSessionDuration'], [], { startDate: today, endDate: today }),
      fetchGA4Report(accessToken, propertyId, ['sessions', 'screenPageViews', 'totalUsers'], [], { startDate: sevenDaysAgo, endDate: today }),
      fetchGA4Report(accessToken, propertyId, ['sessions', 'screenPageViews', 'totalUsers'], [], { startDate: thirtyDaysAgo, endDate: today }),
      fetchGA4Report(accessToken, propertyId, ['screenPageViews'], ['pagePath'], { startDate: sevenDaysAgo, endDate: today }),
      fetchGA4Report(accessToken, propertyId, ['sessions'], ['sessionSource'], { startDate: sevenDaysAgo, endDate: today }),
      fetchGA4Report(accessToken, propertyId, ['sessions'], ['country'], { startDate: sevenDaysAgo, endDate: today }),
    ]);

    // Parse the data
    const parseMetrics = (data: any) => {
      const row = data.rows?.[0];
      if (!row) return {};
      const result: any = {};
      data.metricHeaders?.forEach((header: any, index: number) => {
        result[header.name] = parseFloat(row.metricValues[index].value) || 0;
      });
      return result;
    };

    const parseTopItems = (data: any, dimensionName: string, metricName: string, limit = 10) => {
      if (!data.rows) return [];
      return data.rows
        .slice(0, limit)
        .map((row: any) => ({
          [dimensionName]: row.dimensionValues[0].value,
          [metricName]: parseInt(row.metricValues[0].value) || 0,
        }));
    };

    const todayMetrics = parseMetrics(todayData);
    const weekMetrics = parseMetrics(weekData);
    const monthMetrics = parseMetrics(monthData);

    const result = {
      realTime: {
        activeUsers: realTimeData.activeUsers,
      },
      today: {
        sessions: Math.round(todayMetrics.sessions || 0),
        pageViews: Math.round(todayMetrics.screenPageViews || 0),
        users: Math.round(todayMetrics.totalUsers || 0),
        bounceRate: Math.round((todayMetrics.bounceRate || 0) * 100) / 100,
        avgSessionDuration: Math.round(todayMetrics.averageSessionDuration || 0),
      },
      week: {
        sessions: Math.round(weekMetrics.sessions || 0),
        pageViews: Math.round(weekMetrics.screenPageViews || 0),
        users: Math.round(weekMetrics.totalUsers || 0),
      },
      month: {
        sessions: Math.round(monthMetrics.sessions || 0),
        pageViews: Math.round(monthMetrics.screenPageViews || 0),
        users: Math.round(monthMetrics.totalUsers || 0),
      },
      topPages: parseTopItems(topPagesData, 'pagePath', 'pageViews'),
      trafficSources: parseTopItems(trafficSourcesData, 'source', 'sessions'),
      countries: parseTopItems(countryData, 'country', 'sessions'),
      fetchedAt: new Date().toISOString(),
    };

    console.log('Successfully fetched GA4 data');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in google-analytics function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
