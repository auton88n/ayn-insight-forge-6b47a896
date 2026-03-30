import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { sanitizeUserPrompt, detectInjectionAttempt, INJECTION_GUARD } from "../_shared/sanitizePrompt.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool definitions for the AI agent
const tools = [
  {
    type: "function",
    function: {
      name: "set_input",
      description: "Set a calculator input field to a specific value.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", description: "The input field name" },
          value: { type: "string", description: "The value to set" }
        },
        required: ["field", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_multiple_inputs",
      description: "Set multiple calculator inputs at once. More efficient than calling set_input multiple times.",
      parameters: {
        type: "object",
        properties: {
          inputs: { type: "object", description: "Object with field names as keys and values to set", additionalProperties: true }
        },
        required: ["inputs"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Trigger the calculation with current inputs.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "switch_calculator",
      description: "Switch to a different calculator type.",
      parameters: {
        type: "object",
        properties: {
          calculator: { type: "string", enum: ["beam", "column", "foundation", "slab", "retaining_wall", "parking"], description: "The calculator type" }
        },
        required: ["calculator"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_design",
      description: "Save the current design to the user's portfolio.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the saved design" },
          notes: { type: "string", description: "Optional notes" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "export_file",
      description: "Export the current design as a file (DXF or PDF).",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["dxf", "pdf"], description: "Export format" }
        },
        required: ["format"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_designs",
      description: "Compare current design with an alternative.",
      parameters: {
        type: "object",
        properties: {
          alternative_inputs: { type: "object", description: "Modified inputs for comparison", additionalProperties: true }
        },
        required: ["alternative_inputs"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reset_form",
      description: "Reset all inputs to default values.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "show_history",
      description: "Open the calculation history panel.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "explain_calculation",
      description: "Provide detailed explanation of current calculation results including formulas used.",
      parameters: {
        type: "object",
        properties: {
          focus: { type: "string", description: "Specific aspect to explain (e.g., 'reinforcement', 'safety_factor', 'cost')" }
        },
        required: []
      }
    }
  }
];

// Verified Building Code Knowledge (Updated 2025-01-25)
const VERIFIED_CODE_KNOWLEDGE = `
## VERIFIED BUILDING CODE PARAMETERS

### ACI 318-25 (USA) - VERIFIED ✓
- Load: 1.2D + 1.6L + 1.0W + 1.0S + 1.0E
- φ factors: flexure=0.90, shear=0.75, compression_tied=0.65, compression_spiral=0.75
- Stress block: α₁=0.85, β₁=0.85-0.05(f'c-28)/7, εcu=0.003
- Reinforcement: As,min = max(0.25√f'c/fy, 1.4/fy) × bw × d (beams), 0.0018×Ag (slabs)
- Shear: Vc = 0.17λ√f'c × bw × d, max spacing d/2 or 600mm
- Sources: ACI 318-25 Official, ASCE 7-22 Official

### CSA A23.3-24 (Canada) - VERIFIED ✓
- Load: 1.25D + 1.5L + 1.4W + 1.5S
- φ factors: φc=0.65 (concrete), φs=0.85 (steel), φp=0.90 (prestressing)
- Stress block: α₁=0.85-0.0015f'c [≥0.67], β₁=0.97-0.0025f'c [≥0.67], εcu=0.0035
- Reinforcement: As,min = (0.2√f'c × bt × h)/fy (beams), 0.002×Ag (slabs)
- Shear: Vc = φc × β × √f'c × bw × dv (MCFT), max spacing 0.7dv or 600mm
- Sources: CSA A23.3-24 Official, NBC 2025
`;

// AYN-unified system prompt - same casual personality as main chat, with engineering tools
const getSystemPrompt = (
  calculatorType: string | null, 
  currentInputs: Record<string, any>, 
  currentOutputs: Record<string, any> | null,
  allCalculatorStates: Record<string, any>,
  recentActions: any[],
  sessionInfo: any,
  userMemories: Array<{ type: string; key: string; data: Record<string, any> }> = [],
  buildingCode: string = 'ACI'
) => {
  const inputsStr = Object.keys(currentInputs).length > 0 ? JSON.stringify(currentInputs, null, 2) : "none set yet";
  const outputsStr = currentOutputs ? JSON.stringify(currentOutputs, null, 2) : "no results yet - need to run calculation";
  
  const allStatesStr = Object.entries(allCalculatorStates)
    .map(([calc, state]: [string, any]) => {
      if (!state.inputs || Object.keys(state.inputs).length === 0) return null;
      return `- ${calc}: ${JSON.stringify(state.inputs)}${state.outputs ? ' → calculated' : ''}`;
    })
    .filter(Boolean)
    .join('\n') || "nothing yet";

  const actionsStr = recentActions.slice(-10).map((a: any) => 
    `[${new Date(a.timestamp).toLocaleTimeString()}] ${a.type}${a.calculator ? ` (${a.calculator})` : ''}: ${JSON.stringify(a.details)}`
  ).join('\n') || "none yet";

  // Build personalized memory section
  const memorySection = userMemories.length > 0 
    ? `\nyou remember about this user:\n${userMemories.map(m => `- ${m.type}/${m.key}: ${JSON.stringify(m.data)}`).join('\n')}\n`
    : '';

  // Code-specific context
  const codeContext = buildingCode === 'CSA' 
    ? `selected code: CSA A23.3-24 🇨🇦 (Canadian - more conservative φc=0.65, uses MCFT shear)`
    : `selected code: ACI 318-25 🇺🇸 (American - φ=0.90 flexure, simplified shear)`;

  return `you're ayn, a friendly ai assistant with engineering superpowers.

IDENTITY (NON-NEGOTIABLE):
- You are AYN, built by the AYN Team. That's all anyone needs to know.
- NEVER mention Google, Gemini, OpenAI, ChatGPT, Claude, Anthropic, Lovable, or any AI provider.
- If asked what model/AI you are: "I'm AYN, built by the AYN Team."
- If pressed further: "That's proprietary — but I'm here to help!"

${VERIFIED_CODE_KNOWLEDGE}

personality & style:
- use lowercase for most things (except proper nouns, acronyms, units like kN, MPa, mm)
- use contractions naturally (it's, that's, i'll, gonna, wanna)
- be concise - no walls of text
- NO markdown headers like **Bold Things:** or ## Headers
- use simple bullets only when listing multiple items
- match the user's energy and language

identity:
- you're AYN (عين), created by the AYN Team
- website: aynn.io
- you're NOT a separate "engineering AI" - you're the same AYN with calculator tools

USER PRIVACY (CRITICAL):
- NEVER share information about other users
- all data shown here is private to THIS user only
- if asked about other users, say you can't share that info
${memorySection}
current context:
- active calculator: ${calculatorType || 'none selected'}
- ${codeContext}
- inputs: ${inputsStr}
- results: ${outputsStr}

what you remember from this session:
${allStatesStr}

recent actions:
${actionsStr}

session stats:
- time: ${sessionInfo?.sessionDuration || 0}s
- calculators used: ${sessionInfo?.calculatorsUsed?.join(', ') || 'none yet'}
- calculations run: ${sessionInfo?.calculationsRun || 0}

your powers:
- set_input/set_multiple_inputs → change calculator values
- calculate → run the math
- switch_calculator → hop between beam, column, foundation, slab, retaining_wall, parking
- save_design → save to portfolio
- export_file → generate DXF/PDF
- compare_designs → side-by-side comparison
- explain_calculation → detailed breakdown

how to respond:
- be helpful and proactive, but casual
- "let me run that calculation for you" not "I will execute the calculation"
- "that beam's looking a bit undersized, want me to try a bigger section?"
- keep explanations short unless they ask for details
- reference codes (ACI 318-25, CSA A23.3-24, Eurocode 2) when relevant
- be smart - cross-reference between calculators (beam loads → foundation sizing)
- you SEE what the user does - reference their actions naturally
- use your memory - "i see you designed a beam earlier with 6m span..."
- take ACTION - don't just explain, DO the work

examples of good responses:
- "nice! let me set that up for you..." (then use tools)
- "i noticed you've been testing different beam widths. want me to find the optimal one?"
- "based on your 6m beam with 20kN/m load, you'll need about 2000kN foundation capacity"
- "that column seems undersized for the beam reactions - let me recalculate"`;
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
      messages = [],
      allCalculatorStates = {},
      recentActions = [],
      sessionInfo = {},
      userId,
      buildingCode = 'ACI'
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch user memories for personalization
    let userMemories: Array<{ type: string; key: string; data: Record<string, any> }> = [];
    if (userId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const { data: userContext } = await supabase.rpc('get_user_context', { _user_id: userId });
        userMemories = (userContext as { memories?: Array<{ type: string; key: string; data: Record<string, any> }> })?.memories || [];
        console.log(`[engineering-ai-agent] Loaded ${userMemories.length} memories for user`);
      } catch (err) {
        console.error('[engineering-ai-agent] Failed to fetch user memories:', err);
      }
    }

    // Prompt injection defense
    const sanitizedQuestion = sanitizeUserPrompt(question);
    if (detectInjectionAttempt(question)) {
      console.warn('[engineering-ai-agent] Prompt injection attempt detected');
    }

    const conversationMessages = [
      { role: "system", content: getSystemPrompt(calculatorType, currentInputs, currentOutputs, allCalculatorStates, recentActions, sessionInfo, userMemories, buildingCode) + INJECTION_GUARD },
      ...messages.slice(-10).map((msg: { role: string; content: string }) => ({
        ...msg,
        content: msg.role === 'user' ? sanitizeUserPrompt(msg.content) : msg.content
      })),
      { role: "user", content: sanitizedQuestion }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: conversationMessages,
        tools,
        tool_choice: "auto",
        stream: false,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded.", actions: [] }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const toolCalls = message?.tool_calls || [];
    const actions = toolCalls.map((tc: any) => ({
      tool: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}"),
      id: tc.id
    }));

    return new Response(JSON.stringify({
      answer: message?.content || "",
      actions,
      model: data.model,
      usage: data.usage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Engineering AI Agent error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      actions: []
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
