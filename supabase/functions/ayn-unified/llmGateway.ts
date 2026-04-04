/**
 * LLM Gateway — handles model selection, fallback chains, and API calls.
 * Extracted from ayn-unified/index.ts (was lines 38-446).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const LLM_REQUEST_TIMEOUT_MS = 45000;

export interface LLMModel {
  id: string;
  provider: 'lovable' | 'openrouter';
  model_id: string;
  display_name: string;
}

export const FALLBACK_CHAINS: Record<string, LLMModel[]> = {
  chat: [
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' },
    { id: 'lovable-gemini-flash', provider: 'lovable', model_id: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' },
    { id: 'lovable-gemini-flash-lite', provider: 'lovable', model_id: 'google/gemini-2.5-flash-lite', display_name: 'Gemini 2.5 Flash Lite' }
  ],
  deep: [
    { id: 'lovable-gemini-3-pro', provider: 'lovable', model_id: 'google/gemini-3-pro-preview', display_name: 'Gemini 3 Pro' },
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' },
  ],
  engineering: [
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' },
    { id: 'lovable-gemini-3-pro', provider: 'lovable', model_id: 'google/gemini-3-pro-preview', display_name: 'Gemini 3 Pro' },
    { id: 'lovable-gemini-flash', provider: 'lovable', model_id: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' }
  ],
  files: [
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' },
    { id: 'lovable-gemini-flash', provider: 'lovable', model_id: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' }
  ],
  search: [
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' }
  ],
  image: [
    { id: 'lovable-gemini-image', provider: 'lovable', model_id: 'google/gemini-2.5-flash-image', display_name: 'Gemini Image' }
  ],
  'trading-coach': [
    { id: 'lovable-gemini-3-flash', provider: 'lovable', model_id: 'google/gemini-3-flash-preview', display_name: 'Gemini 3 Flash' },
    { id: 'lovable-gemini-flash', provider: 'lovable', model_id: 'google/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' },
    { id: 'lovable-gemini-flash-lite', provider: 'lovable', model_id: 'google/gemini-2.5-flash-lite', display_name: 'Gemini 2.5 Flash Lite' }
  ],
};

export function needsDeepReasoning(message: string): boolean {
  const l = message.toLowerCase();
  if (message.length > 300) return true;
  return /\b(analyze|analysis|strategy|compare|evaluate|assess|should i|what do you think about|how should i|help me decide|pros and cons|explain why|what are the implications|business plan|investment|long.term|forecast|predict|risk|opportunity|advise me|what would you recommend)\b/i.test(l) ||
  /\b(تحليل|استراتيجية|قارن|قيم|هل يجب|ماذا تعتقد|كيف يجب|ساعدني|إيجابيات وسلبيات|اشرح لماذا|خطة عمل|توصية|نصيحة)\b/.test(l);
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

export async function callLLM(
  model: LLMModel,
  messages: Array<{ role: string; content: any }>,
  stream: boolean,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tools?: any[]
): Promise<{ response: Response | { content: string; tool_calls?: any[] }; modelUsed: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  const startTime = Date.now();
  
  let apiUrl: string;
  let headers: Record<string, string>;
  
  if (model.provider === 'lovable') {
    apiUrl = 'https://api.lovable.dev/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    };
  } else {
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aynn.io',
      'X-Title': 'AYN',
    };
  }

  const body: Record<string, unknown> = {
    model: model.model_id,
    messages,
    stream,
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
  };

  const { controller, timeoutId } = createTimeoutController(LLM_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[llm-gateway] ${model.display_name} error ${res.status}:`, errText.substring(0, 200));
      throw new Error(`${model.display_name} returned ${res.status}`);
    }

    const responseTimeMs = Date.now() - startTime;

    // Log usage (fire and forget)
    supabase.from('llm_usage_logs').insert({
      user_id: userId === 'internal-evaluator' ? null : userId,
      model_name: model.display_name,
      model_id: model.id,
      response_time_ms: responseTimeMs,
      was_fallback: false,
    }).then(() => {}).catch(() => {});

    if (stream) {
      return { response: res, modelUsed: model.display_name };
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    const tool_calls = choice?.message?.tool_calls;

    return {
      response: { content, ...(tool_calls ? { tool_calls } : {}) },
      modelUsed: model.display_name,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function callWithFallback(
  intent: string,
  messages: Array<{ role: string; content: any }>,
  stream: boolean,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tools?: any[]
): Promise<{ response: Response | { content: string; tool_calls?: any[] }; modelUsed: string; wasFallback: boolean }> {
  const chain = FALLBACK_CHAINS[intent] || FALLBACK_CHAINS.chat;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const { response, modelUsed } = await callLLM(model, messages, stream, supabase, userId, tools);
      return { response, modelUsed, wasFallback: i > 0 };
    } catch (error) {
      console.warn(`[llm-gateway] ${model.display_name} failed (attempt ${i + 1}/${chain.length}):`, error instanceof Error ? error.message : error);

      // Log failure
      supabase.from('llm_failures').insert({
        user_id: userId === 'internal-evaluator' ? null : userId,
        model_id: model.id,
        model_name: model.display_name,
        error_message: error instanceof Error ? error.message : String(error),
        intent_type: intent,
      }).then(() => {}).catch(() => {});

      if (i === chain.length - 1) {
        throw new Error(`All models in ${intent} chain failed`);
      }
    }
  }

  throw new Error('No models available');
}
