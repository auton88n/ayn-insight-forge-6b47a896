import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtractedPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'ngl' | 'design' | 'unknown';
  label?: string;
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
}

interface ParsedPDFResult {
  points: ExtractedPoint[];
  nglPoints: ExtractedPoint[];
  designPoints: ExtractedPoint[];
  textAnnotations: string[];
  extractedLevels: Array<{ label: string; value: number; type: string; confidence?: string }>;
  gridLines?: Array<{ direction: string; value: number }>;
  metadata: {
    pageCount?: number;
    hasCoordinateGrid: boolean;
    hasLevelAnnotations: boolean;
    estimatedScale?: string;
    overallConfidence?: 'high' | 'medium' | 'low';
    lowConfidenceCount?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName } = await req.json();
    
    if (!pdfBase64) {
      throw new Error('No PDF content provided');
    }
    
    console.log(`Processing PDF: ${fileName}, base64 length: ${pdfBase64.length}`);
    
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Use OpenAI with vision capabilities to analyze the PDF drawing
    const systemPrompt = `You are an expert civil engineering drawing analyzer. Your task is to extract survey points, elevation levels, and grading information from scanned engineering drawings and PDFs.

When analyzing a drawing, look for:
1. **Survey Points**: Points labeled with coordinates (X, Y) and elevations (Z or EL)
2. **NGL (Natural Ground Level)**: Existing ground elevations, often labeled as NGL, EG, or "Existing"
3. **FGL (Finished Ground Level)**: Design/proposed elevations, labeled as FGL, DL, FG, or "Proposed"
4. **Contour Lines**: Lines connecting points of equal elevation
5. **Grid Lines**: Reference grid with coordinates
6. **Spot Elevations**: Individual elevation points scattered across the drawing
7. **Level Tables**: Tables showing point IDs with their NGL and FGL values
8. **Cross-Sections**: Profile views showing existing vs proposed grades

Extract and return data in this exact JSON format:
{
  "points": [
    {"id": "P1", "x": 100.0, "y": 200.0, "z": 580.50, "type": "ngl", "label": "Survey Point 1", "confidence": "high", "confidenceReason": "Clearly labeled with NGL prefix"},
    {"id": "P2", "x": 100.0, "y": 200.0, "z": 581.20, "type": "design", "label": "Design Level 1", "confidence": "medium", "confidenceReason": "Value partially obscured"}
  ],
  "levelTable": [
    {"pointId": "P1", "ngl": 580.50, "fgl": 581.20, "cutFill": 0.70, "confidence": "high"}
  ],
  "contourElevations": [580, 581, 582],
  "gridReference": {"originX": 0, "originY": 0, "spacing": 10},
  "drawingScale": "1:500",
  "notes": ["Any relevant notes from the drawing"],
  "overallConfidence": "medium",
  "qualityNotes": ["Some text was blurry", "Contour labels were clear"]
}

CONFIDENCE SCORING RULES:
- "high": Value is clearly visible, properly labeled, and unambiguous
- "medium": Value is readable but may have minor ambiguity (e.g., slightly blurry, unlabeled but contextually clear)
- "low": Value is partially obscured, estimated, or inferred from context

For each point, include:
- "confidence": one of "high", "medium", or "low"
- "confidenceReason": brief explanation of why this confidence level was assigned

IMPORTANT: 
- Extract ALL visible elevation values, even if partially visible (mark low confidence)
- Coordinates may be in meters or feet - note the units if visible
- If a point has both NGL and FGL, create two separate entries
- Be thorough - every elevation number matters for volume calculations
- Always provide confidence scores for each extracted value`;

    // Use Lovable AI Gateway with Gemini 3 Flash for vision analysis
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { 
            role: "system", 
            content: systemPrompt 
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this engineering drawing/PDF and extract all survey points, elevation levels (NGL and FGL), and any coordinate information. Focus on finding point coordinates and their associated elevations. Return the data in the JSON format specified.`
              },
              {
                type: "file",
                file: {
                  filename: fileName || "drawing.pdf",
                  file_data: pdfBase64.startsWith('data:') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      if (response.status === 402) {
        throw new Error("AI credits exhausted. Please add credits to your Lovable workspace.");
      }
      throw new Error(`AI processing failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';
    
    console.log("AI response received, parsing extracted data...");
    
    // Parse the AI response to extract structured data
    let extractedData: any = {};
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.log("Could not parse JSON from AI response, extracting manually...");
      // Fall back to text extraction
      extractedData = extractPointsFromText(content);
    }

    // Convert extracted data to our standard format
    const result = convertToStandardFormat(extractedData);
    
    console.log(`Extracted: ${result.points.length} total points, ${result.nglPoints.length} NGL, ${result.designPoints.length} design`);
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        allPoints: result.points,
        nglPoints: result.nglPoints,
        designPoints: result.designPoints,
        polylines: [],
        textAnnotations: result.textAnnotations.map(t => ({ content: t, x: 0, y: 0 })),
        layers: ['PDF-NGL', 'PDF-DESIGN'],
        bounds: calculateBounds(result.points),
      },
      terrainAnalysis: calculateTerrainAnalysis(result.nglPoints),
      summary: {
        totalPoints: result.points.length,
        nglPointCount: result.nglPoints.length,
        designPointCount: result.designPoints.length,
        polylineCount: 0,
        textCount: result.textAnnotations.length,
        layerCount: 2,
        layers: ['PDF-NGL', 'PDF-DESIGN'],
        extractedLevels: result.extractedLevels,
      },
      metadata: result.metadata,
      rawExtraction: extractedData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('PDF parse error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PDF'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Extract points from text content when JSON parsing fails
function extractPointsFromText(text: string): any {
  const points: ExtractedPoint[] = [];
  const levelTable: any[] = [];
  let pointCounter = 0;
  
  // Extract NGL values - low confidence since extracted via regex fallback
  const nglMatches = text.matchAll(/ngl[:\s=]*(\d+\.?\d*)/gi);
  for (const match of nglMatches) {
    points.push({
      id: `NGL_${++pointCounter}`,
      x: pointCounter * 10,
      y: pointCounter * 10,
      z: parseFloat(match[1]),
      type: 'ngl',
      label: `NGL ${match[1]}`,
      confidence: 'low',
      confidenceReason: 'Extracted via text pattern matching (fallback mode)'
    });
  }
  
  // Extract FGL/Design values
  const fglMatches = text.matchAll(/fgl[:\s=]*(\d+\.?\d*)/gi);
  for (const match of fglMatches) {
    points.push({
      id: `FGL_${++pointCounter}`,
      x: pointCounter * 10,
      y: pointCounter * 10,
      z: parseFloat(match[1]),
      type: 'design',
      label: `FGL ${match[1]}`,
      confidence: 'low',
      confidenceReason: 'Extracted via text pattern matching (fallback mode)'
    });
  }
  
  // Extract point tables like "P1: NGL=580.50, FGL=581.20"
  const tablePattern = /([A-Z]?\d+)[:\s]+ngl[:\s=]*(\d+\.?\d*)[,\s]+fgl[:\s=]*(\d+\.?\d*)/gi;
  const tableMatches = text.matchAll(tablePattern);
  for (const match of tableMatches) {
    const pointId = match[1];
    const ngl = parseFloat(match[2]);
    const fgl = parseFloat(match[3]);
    
    levelTable.push({
      pointId,
      ngl,
      fgl,
      cutFill: fgl - ngl,
      confidence: 'medium'
    });
    
    // Add as separate points - medium confidence for table data
    points.push({
      id: `${pointId}_NGL`,
      x: 0,
      y: 0,
      z: ngl,
      type: 'ngl',
      label: `${pointId} NGL`,
      confidence: 'medium',
      confidenceReason: 'Extracted from level table pattern'
    });
    points.push({
      id: `${pointId}_FGL`,
      x: 0,
      y: 0,
      z: fgl,
      type: 'design',
      label: `${pointId} FGL`,
      confidence: 'medium',
      confidenceReason: 'Extracted from level table pattern'
    });
  }
  
  return { points, levelTable, overallConfidence: 'low', qualityNotes: ['Data extracted via fallback text parsing'] };
}

// Convert AI extracted data to standard format
function convertToStandardFormat(data: any): ParsedPDFResult {
  const points: ExtractedPoint[] = [];
  const extractedLevels: Array<{ label: string; value: number; type: string; confidence?: string }> = [];
  let pointCounter = 0;
  let lowConfidenceCount = 0;
  
  // Process points array if present
  if (data.points && Array.isArray(data.points)) {
    for (const p of data.points) {
      const confidence = p.confidence || 'medium';
      if (confidence === 'low') lowConfidenceCount++;
      
      points.push({
        id: p.id || `P${++pointCounter}`,
        x: parseFloat(p.x) || 0,
        y: parseFloat(p.y) || 0,
        z: parseFloat(p.z) || 0,
        type: p.type === 'design' || p.type === 'fgl' ? 'design' : 
              p.type === 'ngl' || p.type === 'existing' ? 'ngl' : 'unknown',
        label: p.label,
        confidence: confidence,
        confidenceReason: p.confidenceReason || 'No reason provided'
      });
      
      extractedLevels.push({
        label: p.id || p.label || `Point ${pointCounter}`,
        value: parseFloat(p.z) || 0,
        type: p.type || 'unknown',
        confidence: confidence
      });
    }
  }
  
  // Process level table if present
  if (data.levelTable && Array.isArray(data.levelTable)) {
    for (const level of data.levelTable) {
      const tableConfidence = level.confidence || 'medium';
      
      if (level.ngl) {
        if (tableConfidence === 'low') lowConfidenceCount++;
        points.push({
          id: `${level.pointId}_NGL`,
          x: parseFloat(level.x) || pointCounter * 10,
          y: parseFloat(level.y) || pointCounter * 10,
          z: parseFloat(level.ngl),
          type: 'ngl',
          label: `${level.pointId} NGL`,
          confidence: tableConfidence,
          confidenceReason: level.confidenceReason || 'From level table'
        });
        extractedLevels.push({
          label: `${level.pointId} NGL`,
          value: parseFloat(level.ngl),
          type: 'ngl',
          confidence: tableConfidence
        });
      }
      if (level.fgl) {
        if (tableConfidence === 'low') lowConfidenceCount++;
        points.push({
          id: `${level.pointId}_FGL`,
          x: parseFloat(level.x) || pointCounter * 10,
          y: parseFloat(level.y) || pointCounter * 10,
          z: parseFloat(level.fgl),
          type: 'design',
          label: `${level.pointId} FGL`,
          confidence: tableConfidence,
          confidenceReason: level.confidenceReason || 'From level table'
        });
        extractedLevels.push({
          label: `${level.pointId} FGL`,
          value: parseFloat(level.fgl),
          type: 'design',
          confidence: tableConfidence
        });
      }
      pointCounter++;
    }
  }
  
  const nglPoints = points.filter(p => p.type === 'ngl');
  const designPoints = points.filter(p => p.type === 'design');
  
  // Calculate overall confidence
  const totalPoints = points.length;
  const overallConfidence: 'high' | 'medium' | 'low' = 
    totalPoints === 0 ? 'low' :
    lowConfidenceCount / totalPoints > 0.3 ? 'low' :
    lowConfidenceCount / totalPoints > 0.1 ? 'medium' : 
    data.overallConfidence || 'high';
  
  return {
    points,
    nglPoints,
    designPoints,
    textAnnotations: data.notes || data.qualityNotes || [],
    extractedLevels,
    metadata: {
      hasCoordinateGrid: !!data.gridReference,
      hasLevelAnnotations: extractedLevels.length > 0,
      estimatedScale: data.drawingScale,
      overallConfidence,
      lowConfidenceCount,
    }
  };
}

// Calculate bounds from points
function calculateBounds(points: ExtractedPoint[]) {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const zs = points.map(p => p.z).filter(z => !isNaN(z));
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: zs.length > 0 ? Math.min(...zs) : 0,
    maxZ: zs.length > 0 ? Math.max(...zs) : 0,
  };
}

// Calculate terrain analysis from NGL points
function calculateTerrainAnalysis(nglPoints: ExtractedPoint[]) {
  const elevations = nglPoints.map(p => p.z).filter(z => !isNaN(z) && z !== 0);
  
  if (elevations.length === 0) {
    return null;
  }
  
  return {
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
    avgElevation: elevations.reduce((a, b) => a + b, 0) / elevations.length,
    elevationRange: Math.max(...elevations) - Math.min(...elevations),
    pointCount: nglPoints.length,
  };
}
