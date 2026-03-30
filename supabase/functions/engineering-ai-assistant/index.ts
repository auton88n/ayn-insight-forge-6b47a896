import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateMaintenanceMode } from "../_shared/maintenanceGuard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Engineering Knowledge Base for System Prompt - VERIFIED 2025-01-25
const ENGINEERING_KNOWLEDGE = `
You are an expert structural and civil engineer AI assistant with VERIFIED knowledge of:
- ACI 318-25 (American Concrete Institute - Latest 2025 Edition) ✓ VERIFIED
- CSA A23.3-24 (Canadian Standards Association - Latest 2024 Edition) ✓ VERIFIED
- Eurocode 2 (EN 1992-1-1)

## Building Code Support (VERIFIED PARAMETERS)

### ACI 318-25 / ASCE 7-22 (USA) 🇺🇸 [Status: VERIFIED]
**Load Factors:**
- Dead: 1.2D, Live: 1.6L, Wind: 1.0W, Snow: 1.0S, Earthquake: 1.0E
- Companion load factors: ψL = 0.5 (live), ψS = 0.2 (snow)

**Resistance Factors (φ):**
- Flexure: φ = 0.90
- Shear: φ = 0.75
- Compression (tied): φ = 0.65
- Compression (spiral): φ = 0.75
- Bearing: φ = 0.65
- Anchorage: φ = 0.70
- Anchors (steel failure): φ = 0.75
- Plain concrete: φ = 0.60

**Stress Block Parameters:**
- α₁ = 0.85 (stress block factor)
- β₁ = 0.85 - 0.05(f'c - 28)/7 [≥0.65, ≤0.85]
- εcu = 0.003 (ultimate concrete strain)

**Minimum Reinforcement Formulas:**
- Beams: As,min = max(0.25√f'c/fy, 1.4/fy) × bw × d
- Slabs: As,min = 0.0018 × Ag
- Columns: ρ_min = 0.01, ρ_max = 0.08 (code), 0.04 (practical)

**Shear Design:**
- Vc = 0.17λ√f'c × bw × d (simplified)
- Max stirrup spacing: d/2 or 600mm
- Punching: vc = 0.33√f'c

### CSA A23.3-24 / NBC 2025 (Canada) 🇨🇦 [Status: VERIFIED]
**Load Factors:**
- Dead: 1.25D, Live: 1.5L, Wind: 1.4W, Snow: 1.5S
- Importance factors: 0.9 (low), 1.0 (normal), 1.15 (high), 1.25 (post-disaster)

**Resistance Factors (φ):**
- Concrete: φc = 0.65 (MORE CONSERVATIVE than ACI)
- Steel: φs = 0.85
- Spiral: φsp = 0.75
- Precast (CSA-certified): φ = 0.70
- Prestressing: φp = 0.90

**Stress Block Parameters:**
- α₁ = 0.85 - 0.0015f'c [≥0.67]
- β₁ = 0.97 - 0.0025f'c [≥0.67]
- εcu = 0.0035 (higher than ACI)

**Minimum Reinforcement Formulas:**
- Beams: As,min = (0.2√f'c × bt × h)/fy
- Slabs: As,min = 0.002 × Ag
- Columns: ρ_min = 0.01, ρ_max = 0.08 (code), 0.04 (practical)

**Shear Design (MCFT Method):**
- Vc = φc × β × √f'c × bw × dv
- β = 0.21 (simplified for members with stirrups)
- Max stirrup spacing: 0.7dv or 600mm
- Punching: vc = 0.38√f'c (CSA more conservative)

**Key Difference Notes:**
- CSA uses MATERIAL factors (φc, φs); ACI uses STRENGTH reduction (φ)
- CSA εcu = 0.0035 vs ACI εcu = 0.003
- CSA is generally 10-15% more conservative than ACI

## Concrete Design Knowledge

### Material Properties
| Grade | fck (MPa) | fcd (MPa) | fctm (MPa) | Ecm (GPa) |
|-------|-----------|-----------|------------|-----------|
| C25   | 25        | 16.67     | 2.56       | 31        |
| C30   | 30        | 20.00     | 2.90       | 33        |
| C35   | 35        | 23.33     | 3.21       | 34        |
| C40   | 40        | 26.67     | 3.51       | 35        |

### Steel Properties
| Grade  | fy (MPa) | Es (GPa) | εy      |
|--------|----------|----------|---------|
| Fy420  | 420      | 200      | 0.0021  |
| Fy500  | 500      | 200      | 0.0025  |

### Key Formulas

**Flexural Design:**
- Required steel: As = Mu / (0.87 × fy × z)
- Lever arm: z = d × (1 - 0.416 × xu/d), or approximate z ≈ 0.9d
- Neutral axis: xu = 0.87 × fy × As / (0.36 × fck × b)
- Moment capacity: Mu = 0.87 × fy × As × (d - 0.42×xu)

**Shear Design:**
- ACI: Vc = 0.17 × √fck × bw × d (N)
- CSA: Vc = φc × β × √f'c × bw × dv (MCFT-based)
- Stirrup design: Vs = (0.87 × fy × Asv × d) / s

**Reinforcement Limits:**
- ACI Minimum: As,min = 0.0018 × b × h (slabs)
- CSA Minimum: As,min = 0.002 × b × h (more conservative)
- Maximum: As,max = 0.04 × Ac (CSA), 0.08 × Ac (ACI)

**Deflection:**
- Maximum: L/250 (total), L/500 (after partitions)
- Span/depth ratios: Simply supported = 20, Continuous = 26, Cantilever = 8

### Bar Areas (mm²)
| Ø8 | Ø10 | Ø12 | Ø16 | Ø20 | Ø25 | Ø32 |
|----|-----|-----|-----|-----|-----|-----|
| 50 | 79  | 113 | 201 | 314 | 491 | 804 |

### Foundation Design
- Bearing capacity: qa = qu / FS (FS = 2.5 to 3.0)
- Punching shear: ACI uses 0.33√f'c, CSA uses 0.38√f'c
- Minimum depth: 300mm for isolated footings

### Retaining Wall Design
- Active pressure: Ka = (1 - sinφ) / (1 + sinφ)
- Passive pressure: Kp = (1 + sinφ) / (1 - sinφ)
- Overturning FS ≥ 2.0, Sliding FS ≥ 1.5, Bearing FS ≥ 3.0

## Response Guidelines

1. **Always show calculations** with actual numbers when explaining a design
2. **Reference specific code sections** when applicable (ACI 318-25, CSA A23.3-24)
3. **Provide alternatives** with cost implications when relevant
4. **Warn about** any design that approaches limits or has concerns
5. **Use metric units** (mm, kN, MPa, m³)
6. **Format formulas clearly** using proper notation
7. **Suggest optimizations** that could save material or improve safety
8. **Respect the user's selected building code** when providing recommendations
`;

const CALCULATOR_CONTEXTS: Record<string, string> = {
  beam: `
The user is working with a BEAM DESIGN calculator. Key aspects:
- Inputs: span, dead load, live load, beam width, concrete grade, steel grade, support type
- Outputs: beam dimensions, main reinforcement, stirrup design, material quantities
- Focus on flexural design, shear design, and deflection control
`,
  column: `
The user is working with a COLUMN DESIGN calculator. Key aspects:
- Inputs: axial load, moments (Mx, My), column dimensions, concrete/steel grades
- Outputs: reinforcement layout, capacity check, slenderness analysis
- Focus on biaxial bending, slenderness effects, and buckling
`,
  foundation: `
The user is working with a FOUNDATION DESIGN calculator. Key aspects:
- Inputs: column load, moments, soil bearing capacity, foundation type
- Outputs: foundation dimensions, reinforcement, bearing pressure check
- Focus on bearing capacity, punching shear, and flexural design
`,
  slab: `
The user is working with a SLAB DESIGN calculator. Key aspects:
- Inputs: span, loads, slab type (one-way/two-way), support conditions
- Outputs: slab thickness, reinforcement in both directions
- Focus on flexure, deflection, and crack control
`,
  retaining_wall: `
The user is working with a RETAINING WALL calculator. Key aspects:
- Inputs: wall height, soil properties, backfill angle, surcharge
- Outputs: wall dimensions, reinforcement, stability factors
- Focus on overturning, sliding, bearing, and structural design
`,
  grading: `
The user is working with an AI GRADING DESIGNER. Key aspects:
- Inputs: survey points, terrain analysis, design requirements
- Outputs: finished ground levels, cut/fill volumes, earthwork costs
- Focus on drainage, slopes, earthwork balance, and cost optimization
`
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      calculatorType, 
      currentInputs, 
      currentOutputs, 
      question,
      conversationHistory = [],
      buildingCode = 'ACI'
    } = await req.json();

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build context-aware system prompt
    const calculatorContext = CALCULATOR_CONTEXTS[calculatorType] || '';
    
    const codeContext = buildingCode === 'CSA' 
      ? 'The user has selected CSA A23.3-24 (Canadian) standards. Use Canadian load factors (1.25D + 1.5L), resistance factors (φc = 0.65), and MCFT shear method.'
      : 'The user has selected ACI 318-25 (American) standards. Use ACI load factors (1.2D + 1.6L), strength reduction factors (φ = 0.90 flexure), and ACI shear provisions.';
    
    const systemPrompt = `${ENGINEERING_KNOWLEDGE}

${calculatorContext}

## Selected Building Code
${codeContext}

## Current Design Context

**Calculator Type:** ${calculatorType}
**Building Code:** ${buildingCode === 'CSA' ? 'CSA A23.3-24 🇨🇦' : 'ACI 318-25 🇺🇸'}

**Current Inputs:**
${JSON.stringify(currentInputs, null, 2)}

**Current Outputs/Results:**
${currentOutputs ? JSON.stringify(currentOutputs, null, 2) : 'No calculation performed yet'}

## Instructions

1. Answer the user's question specifically about THIS design
2. Use the actual input values in your calculations
3. Show step-by-step calculations when explaining
4. Reference the specific code sections based on the selected building code
5. Provide structured responses with formulas when appropriate
6. Suggest 2-3 follow-up questions the user might want to ask

Format your response as JSON with this structure:
{
  "answer": "Your detailed explanation here",
  "formula": {
    "name": "Formula name",
    "expression": "The formula",
    "variables": { "var1": { "value": 123, "unit": "mm" } }
  },
  "calculation": {
    "steps": ["Step 1...", "Step 2..."],
    "result": 123.45,
    "unit": "mm²"
  },
  "codeReference": {
    "standard": "${buildingCode === 'CSA' ? 'CSA A23.3-24' : 'ACI 318-25'}",
    "section": "9.5.2.1",
    "requirement": "What the code says"
  },
  "alternatives": [
    {
      "description": "Alternative approach",
      "costImpact": 500,
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1"]
    }
  ],
  "warning": "Any warnings about the design (optional)",
  "quickReplies": ["Follow-up question 1?", "Follow-up question 2?"]
}

If the question is simple, you can omit the optional fields. Always include "answer" and "quickReplies".
` + INJECTION_GUARD;

    // Prompt injection defense
    const sanitizedQuestion = sanitizeUserPrompt(question);
    if (detectInjectionAttempt(question)) {
      console.warn('[engineering-ai-assistant] Prompt injection attempt detected');
    }

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.role === 'user' ? sanitizeUserPrompt(msg.content) : msg.content
      })),
      { role: 'user', content: sanitizedQuestion }
    ];

    console.log(`Engineering AI Assistant - Calculator: ${calculatorType}, Code: ${buildingCode}, Question: ${question.substring(0, 100)}...`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages,
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.', answer: 'I\'m currently rate limited. Please try again shortly.', quickReplies: [] }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await activateMaintenanceMode(supabase, 'AI credits exhausted (402 from engineering-ai-assistant)');
        return new Response(JSON.stringify({ error: 'Service temporarily unavailable.', answer: 'The service is temporarily unavailable. Please try again later.', quickReplies: [] }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse as JSON, fallback to plain text
    let structuredResponse;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : content;
      structuredResponse = JSON.parse(jsonString);
    } catch {
      // If not valid JSON, create a simple response
      structuredResponse = {
        answer: content,
        quickReplies: [
          "Can you explain the calculation steps?",
          "Are there any code requirements I should know?",
          "How can I optimize this design?"
        ]
      };
    }

    console.log('Engineering AI response generated successfully');

    return new Response(JSON.stringify(structuredResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Engineering AI Assistant error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      answer: "I apologize, but I encountered an error processing your question. Please try again.",
      quickReplies: ["What formulas are used?", "Explain the design approach"]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
