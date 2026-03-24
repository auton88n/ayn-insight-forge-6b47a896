const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_CONTRACT = `You are AYN AI's contract specialist. Help structure a professional service agreement through natural conversation.

Collect these fields:
- order_title, company_name, contact_person, company_email, company_phone, company_address
- order_description (full scope), system_plan (technical approach)
- delivery_timeline, payment_terms, warranty, termination_clause
- terms_and_conditions, after_sale_services, additional_services, privacy_notes, governing_law
- services: array of [{name, description, price, quantity}]
- discount_percent (default 0), tax_percent (default 15), currency (default USD)
- stripe_payment_link (if available)

Rules:
- Ask 2-3 questions at a time, keep it conversational
- Once you have client name, email, project title, and at least one service with price, offer to generate
- Write professional legal clauses based on what you know about the project
- When generating, include a friendly summary then the JSON in <CONTRACT_DATA> tags

Format when ready:
Great! Here is your contract summary...

<CONTRACT_DATA>
{ all fields as JSON }
</CONTRACT_DATA>`;

const SYSTEM_NDA = `You are AYN AI's legal specialist. Help draft a professional NDA through natural conversation.

Collect these fields:
- company_name, contact_person, company_email, company_phone
- nda_purpose, confidential_info, obligations, exclusions, duration, governing_law, additional_clauses

Rules:
- Ask 2-3 questions at a time
- Once you have company name, email, and purpose, offer to generate
- Write complete professional NDA clauses
- When generating, include a friendly summary then the JSON in <NDA_DATA> tags

Format when ready:
Perfect! Here is your NDA summary...

<NDA_DATA>
{ all fields as JSON }
</NDA_DATA>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { messages, type } = await req.json();
    if (!messages || !type) throw new Error('messages and type are required');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = type === 'contract' ? SYSTEM_CONTRACT : SYSTEM_NDA;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gateway error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ text }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[ai-contract-builder]', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
