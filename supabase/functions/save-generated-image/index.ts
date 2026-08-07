import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // SECURITY FIX (full source-read audit): this function had no auth
    // check at all and had zero real callers anywhere in the frontend --
    // pure dead code, but still live and directly reachable. Locked to
    // service-role-only, same pattern as send-notifications.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Saving image from URL:', imageUrl.substring(0, 100) + '...');

    // SECURITY FIX (full source-read audit): the original check was
    // `imageUrl.includes('oaidalleapiprodscus.blob.core.windows.net')`, a
    // substring match, not a hostname check -- a URL like
    // "https://attacker.example/x?q=oaidalleapiprodscus.blob.core.windows.net"
    // satisfied it while the real fetch target was attacker-controlled.
    // Combined with the missing auth check above, this was an open,
    // anonymous fetch-and-publicly-host primitive. Now parses the URL and
    // compares the actual hostname.
    let isDalleUrl = false;
    try {
      isDalleUrl = new URL(imageUrl).hostname === 'oaidalleapiprodscus.blob.core.windows.net';
    } catch {
      isDalleUrl = false;
    }
    if (!isDalleUrl) {
      console.log('Not a DALL-E URL, returning original');
      return new Response(
        JSON.stringify({ permanentUrl: imageUrl, saved: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the image
    console.log('Fetching image...');
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      console.error('Failed to fetch image:', imageResponse.status, imageResponse.statusText);

      // IMPORTANT: Do NOT return a 4xx here.
      // The frontend calls this function as a best-effort cache; an expired DALL·E URL should not crash the app.
      return new Response(
        JSON.stringify({ permanentUrl: imageUrl, saved: false, expired: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    const uint8Array = new Uint8Array(imageBuffer);

    console.log('Image fetched, size:', uint8Array.length, 'bytes');

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().split('-')[0];
    const filename = `dalle-${timestamp}-${randomId}.png`;

    console.log('Uploading to storage as:', filename);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('generated-images')
      .upload(filename, uint8Array, {
        contentType: 'image/png',
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to save image', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(filename);

    console.log('Image saved successfully:', publicUrlData.publicUrl);

    return new Response(
      JSON.stringify({
        permanentUrl: publicUrlData.publicUrl,
        saved: true,
        filename
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in save-generated-image:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
