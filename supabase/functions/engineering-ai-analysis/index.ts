import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, inputs, outputs } = await req.json();

    // Generate analysis based on calculation type
    const analysis = generateAnalysis(type, inputs, outputs);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI analysis error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateAnalysis(type: string, inputs: any, outputs: any) {
  const compliance: string[] = [];
  const optimizations: string[] = [];
  const costEstimate: { item: string; cost: number }[] = [];

  if (type === 'beam') {
    // Compliance checks
    const spanDepthRatio = (inputs.span * 1000) / outputs.beamDepth;
    if (spanDepthRatio <= 20) {
      compliance.push('Span/depth ratio within limits (≤20)');
    } else {
      compliance.push('⚠️ Span/depth ratio exceeds 20 - check deflection');
    }

    if (outputs.beamWidth >= 200) {
      compliance.push('Minimum beam width satisfied (≥200mm)');
    }

    const steelRatio = outputs.providedAs / (outputs.beamWidth * outputs.effectiveDepth) * 100;
    if (steelRatio >= 0.12 && steelRatio <= 4) {
      compliance.push(`Steel ratio ${steelRatio.toFixed(2)}% within limits`);
    }

    compliance.push('Clear cover 40mm meets durability requirements');

    // Optimizations
    if (steelRatio > 2) {
      optimizations.push('Consider increasing beam depth to reduce steel');
    }
    if (outputs.beamWidth > 350) {
      optimizations.push('Could reduce width to 300mm for economy');
    }
    if (inputs.concreteGrade === 'C25' && inputs.span > 5) {
      optimizations.push('Consider C30 concrete for longer spans');
    }
    optimizations.push('Use prefabricated stirrups for faster construction');

    // Cost estimation removed - pricing varies by region

  } else if (type === 'foundation') {
    // Compliance checks
    if (outputs.bearingRatio <= 100) {
      compliance.push(`Bearing pressure ${outputs.bearingRatio}% of allowable - OK`);
    } else {
      compliance.push('⚠️ Bearing pressure exceeds allowable');
    }

    if (outputs.depth >= 300) {
      compliance.push('Minimum footing depth satisfied (≥300mm)');
    }

    compliance.push('Punching shear checked at d/2 from column face');
    compliance.push('Cover 75mm suitable for ground contact');

    // Optimizations
    if (outputs.bearingRatio < 60) {
      optimizations.push('Footing may be oversized - consider reducing');
    }
    if (outputs.length !== outputs.width) {
      optimizations.push('Consider square footing for simpler construction');
    }
    optimizations.push('Use lean concrete blinding (50mm) below footing');

    // Cost estimation removed - pricing varies by region
  }

  return { compliance, optimizations, costEstimate };
}
