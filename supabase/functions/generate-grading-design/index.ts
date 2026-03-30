import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

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

// Regional grading standards for AI knowledge
const REGIONAL_STANDARDS = {
  USA: `
USA GRADING STANDARDS (verified January 2026):

STORM WATER MANAGEMENT:
- EPA 2022 CGP (Construction General Permit)
- Permit required for sites ≥1 acre (0.4 hectares) of disturbed land
- SWPPP (Stormwater Pollution Prevention Plan) required
- Reference: 40 CFR 122.26

EXCAVATION SAFETY (OSHA 29 CFR 1926 Subpart P):
- Maximum allowable slopes by soil type:
  * Stable rock: 90° (vertical)
  * Type A soil: 53° (3/4H:1V ratio)
  * Type B soil: 45° (1H:1V ratio)
  * Type C soil: 34° (1.5H:1V ratio)
- Excavations >5 feet deep require protective systems

DRAINAGE REQUIREMENTS (IBC 2024 Section 1804.4):
- Foundation drainage: Minimum 5% slope for 10 feet from building
- Impervious surfaces: Minimum 2% slope for 10 feet
- Maximum fill slope: 50% (2:1 ratio)
- Swales: Minimum 1% longitudinal slope

COMPACTION STANDARDS (ASTM D698/D1557):
- Structural fill: 95% Standard Proctor (ASTM D698)
- Under pavements: 95-98% Modified Proctor (ASTM D1557)
- Utility trenches: 90-95% Standard Proctor
- Subgrade: 95% Standard Proctor minimum
`,
  CANADA: `
CANADA GRADING STANDARDS (verified January 2026):

STORM WATER MANAGEMENT:
- Provincial/Municipal permits required (~0.4 hectares typical threshold)
- Environmental Compliance Approval (ECA) in Ontario
- CCME Guidelines for stormwater management
- Reference: Provincial environmental regulations

EXCAVATION SAFETY (Provincial OHS):
- Similar to OSHA requirements
- Maximum unprotected depth: 1.5 meters (vs 5 feet in USA)
- Protective systems required beyond 1.5m depth
- Reference: Provincial Occupational Health and Safety Acts

DRAINAGE REQUIREMENTS (NBCC 2025):
- Foundation drainage: Minimum 5% slope for 1.8 meters from building
- Minimum site slope: 1-2% for surface drainage
- Maximum fill slope: 33% (3:1 ratio) - MORE CONSERVATIVE than USA
- Frost protection depth varies by region (1.2m to 2.4m)

COMPACTION STANDARDS (CSA A23.1:24):
- Structural fill: 95% Standard Proctor
- Under pavements: 95-98% Modified Proctor
- Utility trenches: 90-95% Standard Proctor
- Additional frost protection considerations required
- Reference: CSA A23.1:24 (14th edition, June 2024)
`
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { 
      points, 
      terrainAnalysis, 
      requirements,
      region = 'USA'
    } = await req.json();
    
    if (!points || points.length === 0) {
      throw new Error('No survey points provided');
    }

    console.log(`Generating grading design for ${points.length} points, region: ${region}`);
    console.log('Requirements:', requirements);
    console.log('Terrain analysis:', terrainAnalysis);

    // Get regional standards for AI context
    const regionalStandards = REGIONAL_STANDARDS[region as keyof typeof REGIONAL_STANDARDS] || REGIONAL_STANDARDS.USA;

    // Create a summary of the terrain for the AI
    const terrainSummary = `
Site Terrain Summary:
- Point count: ${terrainAnalysis.pointCount}
- Elevation range: ${terrainAnalysis.minElevation}m to ${terrainAnalysis.maxElevation}m (range: ${terrainAnalysis.elevationRange}m)
- Average elevation: ${terrainAnalysis.avgElevation}m
- Estimated area: ${terrainAnalysis.estimatedArea} m² (${(terrainAnalysis.estimatedArea / 10000).toFixed(2)} hectares)
- X coordinates: ${terrainAnalysis.minX} to ${terrainAnalysis.maxX}
- Y coordinates: ${terrainAnalysis.minY} to ${terrainAnalysis.maxY}
`;

    // Sample points for AI (send representative subset if too many)
    const samplePoints = points.length > 50 
      ? points.filter((_: SurveyPoint, i: number) => i % Math.ceil(points.length / 50) === 0)
      : points;

    const prompt = `You are a civil engineering grading design expert with deep knowledge of regional building codes and standards.

APPLICABLE REGIONAL STANDARDS (${region}):
${regionalStandards}

${terrainSummary}

Sample NGL (Natural Ground Level) points:
${samplePoints.map((p: SurveyPoint) => `Point ${p.id}: (${p.x}, ${p.y}) Elev: ${p.z}m`).join('\n')}

User Requirements:
${requirements || 'Standard site grading for construction with proper drainage'}

CRITICAL DESIGN CONSTRAINTS:
1. The design elevation MUST be very close to the average terrain elevation (${terrainAnalysis.avgElevation}m) to balance cut and fill volumes.
2. Target net earthwork as close to ZERO as possible to minimize import/export of material.
3. The design elevation should typically be within ±0.3m of ${terrainAnalysis.avgElevation}m unless user requirements explicitly demand a specific elevation.
4. APPLY THE ${region} STANDARDS listed above for all slope limits, drainage requirements, and compaction specifications.
5. Flag any potential code violations based on the regional standards.

Generate a grading design with the following JSON structure:
{
  "designElevation": <MUST be close to ${terrainAnalysis.avgElevation}m to balance cut/fill>,
  "slopeDirection": "<N/S/E/W or combination>",
  "slopePercentage": <drainage slope percentage, typically 1-3%>,
  "gradingZones": [
    {
      "name": "<zone name>",
      "area": <area in m²>,
      "nglAvg": <average existing elevation>,
      "fglTarget": <target finished elevation>,
      "cutVolume": <cut volume in m³>,
      "fillVolume": <fill volume in m³>
    }
  ],
  "totalCutVolume": <total cut in m³>,
  "totalFillVolume": <total fill in m³>,
  "netVolume": <MUST be close to zero - positive = excess cut, negative = fill needed>,
  "designNotes": [
    "<include specific ${region} code references in your notes>",
    "<flag any potential compliance issues with regional standards>",
    "<design consideration>"
  ],
  "drainageRecommendations": "<region-specific drainage design recommendation with code reference>",
  "compactionRequirements": "<region-specific compaction specifications with standard reference>"
}

IMPORTANT REQUIREMENTS:
1. BALANCE CUT AND FILL - The design elevation must minimize net earthwork. Total cut should approximately equal total fill.
2. Ensure proper drainage per ${region} standards (${region === 'USA' ? 'min 5% slope for 10 ft from foundation per IBC 2024' : 'min 5% slope for 1.8m from foundation per NBCC 2025'})
3. Account for compaction factor (typically 10-15% for fill)
4. Maximum fill slope: ${region === 'USA' ? '50% (2:1) per IBC 2024' : '33% (3:1) per NBCC 2025'}
5. Follow ${region} civil engineering grading practices and CITE SPECIFIC CODE SECTIONS in your recommendations

Return ONLY valid JSON, no additional text.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { 
            role: 'system', 
            content: `You are a professional civil engineer specializing in site grading and earthwork design with expertise in ${region} building codes and standards. Always respond with valid JSON only. Always cite specific code sections (e.g., "IBC 2024 Section 1804.4" or "NBCC 2025 Section 9.14") when making recommendations.`
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from generate-grading-design)');
        return new Response(JSON.stringify({ success: false, error: 'Service temporarily unavailable. Please try again later.' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    console.log('AI Response:', aiResponse);

    // Parse the AI response
    let designResult;
    try {
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        designResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to parse grading design from AI');
    }

    // Generate FGL points based on design
    const fglPoints = points.map((p: SurveyPoint) => {
      // Calculate FGL based on design elevation and slope
      const centerX = (terrainAnalysis.minX + terrainAnalysis.maxX) / 2;
      const centerY = (terrainAnalysis.minY + terrainAnalysis.maxY) / 2;
      
      // Apply slope from center
      const slopeFactor = (designResult.slopePercentage || 1.5) / 100;
      const distanceFromCenter = Math.sqrt(
        Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2)
      );
      
      // Calculate FGL with slope
      const baseElevation = designResult.designElevation || terrainAnalysis.avgElevation;
      const slopeAdjustment = distanceFromCenter * slopeFactor * 
        (p.y < centerY ? 1 : -1); // Slope towards south by default
      
      const fgl = baseElevation + slopeAdjustment;
      const cutFill = p.z - fgl; // Positive = cut, Negative = fill
      
      return {
        ...p,
        fgl: Math.round(fgl * 100) / 100,
        cutFill: Math.round(cutFill * 100) / 100,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      design: designResult,
      fglPoints,
      region,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating grading design:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
