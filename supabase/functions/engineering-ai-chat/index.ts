import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dynamic building code knowledge generator
function generateBuildingCodeKnowledge(buildingCode: { id: string; name?: string } | null) {
  const codeId = buildingCode?.id || 'ACI';
  
  if (codeId === 'CSA') {
    return `
# ═══════════════════════════════════════════════════════════════
# ACTIVE BUILDING CODE: CSA A23.3-24 / NBC 2025 (Canada)
# ═══════════════════════════════════════════════════════════════

Version: June 2024 (8th edition)
Official Source: www.csagroup.org

## LOAD FACTORS (NBC 2025 Division B Part 4)
| Load Type | Factor |
|-----------|--------|
| Dead Load (D only) | 1.4 |
| Dead Load (combined) | 1.25 |
| Live Load (L) | 1.5 |
| Wind Load (W) | 1.4 |
| Snow Load (S) | 1.5 |
| Seismic Load (E) | 1.0 |

## LOAD COMBINATIONS (Use EXACTLY)
- U = 1.4D
- U = 1.25D + 1.5L
- U = 1.25D + 1.5S
- U = 1.25D + 1.5L + 0.5S
- U = 1.0D + 1.0E + 0.5L + 0.25S
- U = 1.25D + 1.4W
- U = 0.9D + 1.4W (for uplift)
- U = 0.9D + 1.0E (for seismic overturning)

## RESISTANCE FACTORS (Clause 8.4) ⚠️ MORE CONSERVATIVE THAN ACI
| Component | Factor |
|-----------|--------|
| Concrete (φc) | 0.65 |
| Steel (φs) | 0.85 |
| Spiral columns | 0.75 |

⚠️ CSA requires ~38% MORE steel than ACI for same design!

## STRESS BLOCK PARAMETERS (Linear formulas)
- α₁ = 0.85 - 0.0015 × f'c (minimum 0.67)
- β₁ = 0.97 - 0.0025 × f'c (minimum 0.67)

## MINIMUM REINFORCEMENT (Clause 10)
- Beams: As,min = (0.2√f'c × bt × h)/fy
- Slabs: ρmin = 0.002 ⚠️ HIGHER than ACI (0.0018)
- Columns min: ρmin = 0.01
- Columns max: ρmax = 0.04 ⚠️ LOWER than ACI (0.08)

## SHEAR DESIGN - MCFT Method (Chapter 11)
⚠️ Uses Modified Compression Field Theory (DIFFERENT from ACI)

WITH minimum stirrups:
  Vc = φc × λ × β × √f'c × bw × dv
  Where β = 0.18

WITHOUT minimum stirrups:
  β = 230/(1000 + dv)

Maximum spacing: min(0.7dv, 600 mm)
Note: CSA uses dv (shear depth), not d

## DEFLECTION LIMITS (Clause 9) ⚠️ MORE STRINGENT
| Condition | Limit |
|-----------|-------|
| Immediate | L/240 (vs ACI L/360) |
| After partitions | L/480 |

## CONCRETE PROPERTIES
- Ec = 4500√f'c (MPa) ⚠️ LOWER than ACI (4700)
- Minimum f'c: 20 MPa

## CODE REFERENCES FOR CITATIONS
- Load factors: NBC 2025 Division B Part 4
- φ factors: CSA A23.3-24 Clause 8.4
- Min reinforcement: CSA A23.3-24 Clause 10.5
- Shear (MCFT): CSA A23.3-24 Chapter 11
- Deflection: CSA A23.3-24 Clause 9
`;
  }
  
  // Default: ACI
  return `
# ═══════════════════════════════════════════════════════════════
# ACTIVE BUILDING CODE: ACI 318-25 / ASCE 7-22 (United States)
# ═══════════════════════════════════════════════════════════════

Version: July 2025
Official Source: www.concrete.org

## LOAD FACTORS (ASCE 7-22) ⚠️ MAJOR CHANGES FROM PREVIOUS VERSIONS
| Load Type | Factor | Note |
|-----------|--------|------|
| Dead Load (D only) | 1.4 | |
| Dead Load (combined) | 1.2 | |
| Live Load (L) | 1.6 | |
| Wind Load (W) | 1.0 | ⚠️ Changed from 1.6! |
| Snow Load (S) | 1.0 | ⚠️ Changed from 1.6! |
| Seismic Load (E) | 1.0 | |
| Roof Live (Lr) | 1.6 | |

## LOAD COMBINATIONS (ASCE 7-22 Section 2.3.2 - Use EXACTLY)
- U = 1.4D
- U = 1.2D + 1.6L + 0.5(Lr or S)
- U = 1.2D + 1.0W + 0.5L + 0.5(Lr or S)
- U = 1.2D + 1.0E + 0.5L + 0.2S
- U = 0.9D + 1.0W (for wind uplift)
- U = 0.9D + 1.0E (for seismic overturning)

## STRENGTH REDUCTION FACTORS (Table 21.2.1)
| Component | φ |
|-----------|---|
| Flexure (tension-controlled) | 0.90 |
| Shear and torsion | 0.75 |
| Compression (tied columns) | 0.65 |
| Compression (spiral columns) | 0.75 |
| Bearing | 0.65 |

## STRESS BLOCK PARAMETERS (Section 22.2.2.4.1)
- α₁ = 0.85 (constant)
- β₁:
  • If f'c ≤ 28 MPa: β₁ = 0.85
  • If 28 < f'c < 55 MPa: β₁ = 0.85 - 0.05(f'c - 28)/7
  • If f'c ≥ 55 MPa: β₁ = 0.65

## MINIMUM REINFORCEMENT (Sections 9.6.1.2, 7.6.1.1)
- Beams: As,min = max(0.25√f'c/fy, 1.4/fy) × bw × d
- Slabs: ρmin = 0.0018 (Grade 60)
- Columns min: ρmin = 0.01 (1%)
- Columns max: ρmax = 0.08 (8%, but practically 4%)

## SHEAR DESIGN (Chapter 22, Table 22.5.5.1)
WITH minimum stirrups:
  Vc = (0.17λ√f'c) × bw × d

Size effect factor (Section 22.5.5.1.3):
  λs = √(2/(1+0.004d)) ≤ 1.0

Maximum stirrup spacing (Table 9.7.6.2.2):
  Standard: min(d/2, 600 mm)
  High shear (Vs > 4√f'c × bw × d): min(d/4, 300 mm)

## DEFLECTION LIMITS (Table 24.2.2)
| Condition | Limit |
|-----------|-------|
| Floor (immediate) | L/360 |
| Roof (immediate) | L/180 |
| After partitions | L/480 |

## CONCRETE PROPERTIES
- Ec = 4700√f'c (MPa)
- Minimum f'c: 17 MPa

## DEVELOPMENT LENGTH (Chapter 25)
- Tension: ld = (fy × ψt × ψe × ψs × ψg × db)/(25λ√f'c) ≥ 300mm
- Compression: ldc = (fy × ψr × db)/(50λ√f'c) ≥ 200mm
- Lap splice (Class B): 1.3 × ld

## CODE REFERENCES FOR CITATIONS
- Load combinations: ASCE 7-22 Section 2.3.2
- φ factors: ACI 318-25 Table 21.2.1
- Stress block: ACI 318-25 Section 22.2.2.4.1
- Min reinforcement: ACI 318-25 Sections 9.6.1.2, 7.6.1.1
- Shear design: ACI 318-25 Chapter 22, Table 22.5.5.1
- Stirrup spacing: ACI 318-25 Table 9.7.6.2.2
- Punching shear: ACI 318-25 Table 22.6.5.2
- Deflection: ACI 318-25 Table 24.2.2
- Cover: ACI 318-25 Table 20.5.1.3.1
- Development length: ACI 318-25 Chapter 25
`;
}

const BASE_ENGINEERING_KNOWLEDGE = `
## Material Properties

### Concrete Grades
| Grade | fck (MPa) | Ec (GPa) |
|-------|-----------|----------|
| C20 | 20 | 30 |
| C25 | 25 | 31 |
| C30 | 30 | 33 |
| C35 | 35 | 34 |
| C40 | 40 | 35 |

### Steel Reinforcement
| Grade | fy (MPa) | Es (GPa) |
|-------|----------|----------|
| Fy420 | 420 | 200 |
| Fy500 | 500 | 200 |

### Standard Bar Areas (mm²)
| Ø8 | Ø10 | Ø12 | Ø14 | Ø16 | Ø18 | Ø20 | Ø22 | Ø25 | Ø28 | Ø32 |
|----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 50 | 79 | 113 | 154 | 201 | 254 | 314 | 380 | 491 | 616 | 804 |

## DESIGN WARNINGS - Always Check These

⚠️ ρ < ρmin → "BRITTLE FAILURE RISK - Increase reinforcement"
⚠️ ρ > ρmax → "OVER-REINFORCED - Compression failure before tension yielding"
⚠️ Bar spacing < 25mm → "CONGESTION - Difficult concrete placement"
⚠️ Cover < minimum → "DURABILITY ISSUE - Inadequate protection"
⚠️ Vu > φVn → "SHEAR FAILURE - Must provide stirrups"
⚠️ Δ > allowable → "EXCESSIVE DEFLECTION - Increase depth"

## Rules of Thumb (Preliminary Design)
- Beam depth: h ≈ L/12 to L/16 for simple spans
- Slab thickness: h ≈ L/24 to L/30 for one-way
- Column size: Minimum 300mm × 300mm
- Reinforcement ratio: Aim for 1-2% for economy
- Stirrup spacing: Typically 100-300mm

## RESPONSE GUIDELINES

1. **Always cite the code section**:
   ✓ Good: "Per ACI 318-25 Table 21.2.1, φ = 0.90 for flexure..."
   ✗ Bad: "The reduction factor is 0.90..."

2. **Show step-by-step calculations**:
   ✓ Good: "Mu = 1.2D + 1.6L = 1.2(20) + 1.6(30) = 72 kNm"
   ✗ Bad: "You need 72 kNm capacity"

3. **Use the EXACT load factors from the active code**

4. **Warn about failures immediately**:
   "⚠️ DESIGN FAILS [check name] - [issue] - [fix suggestion]"

5. **End with professional review reminder**:
   "Professional engineer review required for final design."

6. **Compare codes when asked**:
   Show numerical differences between ACI and CSA
`;

const CALCULATOR_CONTEXTS: Record<string, string> = {
  beam: `## BEAM DESIGN CONTEXT
Key checks: Flexural capacity, Shear capacity, Min/max reinforcement, Deflection, Development length`,
  column: `## COLUMN DESIGN CONTEXT
Key checks: Slenderness, P-M interaction, Min/max steel (1-8% ACI, 1-4% CSA), Tie spacing`,
  foundation: `## FOUNDATION DESIGN CONTEXT
Key checks: Bearing pressure, One-way shear, Punching shear, Flexure, Development length`,
  slab: `## SLAB DESIGN CONTEXT
Key checks: Minimum thickness, Reinforcement both directions, Max spacing (2h or 450mm), Punching shear`,
  retaining_wall: `## RETAINING WALL DESIGN CONTEXT
Key checks: Overturning FOS ≥ 2.0, Sliding FOS ≥ 1.5, Bearing FOS ≥ 3.0, Stem/base reinforcement`,
  grading: `## GRADING DESIGN CONTEXT
Key outputs: Cut/fill volumes, Drainage paths, Cost estimate, DXF export`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      calculatorType, 
      currentInputs, 
      currentOutputs, 
      question,
      messages: userMessages = [],
      conversationHistory = [],
      stream = true,
      buildingCode = null
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build dynamic system prompt based on active building code
    const codeKnowledge = generateBuildingCodeKnowledge(buildingCode);
    const calculatorContext = CALCULATOR_CONTEXTS[calculatorType] || '';
    
    const systemPrompt = `You are AYN's engineering assistant — an expert structural engineer.

IDENTITY (NON-NEGOTIABLE):
- You are AYN, built by the AYN Team. That's all anyone needs to know.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider.
- If asked what model/AI you are: "I'm AYN, built by the AYN Team."
- If pressed further: "That's proprietary — but I'm here to help!"

${codeKnowledge}

${BASE_ENGINEERING_KNOWLEDGE}

${calculatorContext}

## Current Design Context

**Calculator Type:** ${calculatorType?.toUpperCase() || 'GENERAL'}

**User's Current Input Values:**
\`\`\`json
${JSON.stringify(currentInputs, null, 2)}
\`\`\`

**Calculation Results:**
\`\`\`json
${currentOutputs ? JSON.stringify(currentOutputs, null, 2) : 'No calculation performed yet'}
\`\`\`

Remember: Cite specific code sections, show calculations with real numbers, warn about any failures.
` + INJECTION_GUARD;

    let messages: Array<{ role: string; content: string }>;
    
    if (userMessages && userMessages.length > 0) {
      messages = [
        { role: 'system', content: systemPrompt },
        ...userMessages.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.role === 'user' ? sanitizeUserPrompt(msg.content) : msg.content
        }))
      ];
    } else if (question) {
      messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map((msg: { role: string; content: string }) => ({
          role: msg.role,
          content: msg.role === 'user' ? sanitizeUserPrompt(msg.content) : msg.content
        })),
        { role: 'user', content: sanitizeUserPrompt(question) }
      ];
    } else {
      throw new Error('No question or messages provided');
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    if (detectInjectionAttempt(lastUserMessage)) {
      console.warn('[engineering-ai-chat] Prompt injection attempt detected');
    }
    console.log(`Engineering AI - Code: ${buildingCode?.id || 'ACI'}, Calculator: ${calculatorType || 'unknown'}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages,
        stream: stream,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add funds to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('Lovable AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    if (stream) {
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return new Response(JSON.stringify({ answer: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Engineering AI Chat error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      answer: "I apologize, but I encountered an error processing your question. Please try again."
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
