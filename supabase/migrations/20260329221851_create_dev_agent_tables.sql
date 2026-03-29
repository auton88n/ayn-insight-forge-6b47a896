CREATE TABLE IF NOT EXISTS public.ayn_dev_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ayn_dev_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ayn_dev_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ayn_dev_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
alter table public.ayn_dev_conversations enable row level security;
alter table public.ayn_dev_messages enable row level security;
alter table public.ayn_dev_skills enable row level security;

-- Allow authenticated admins to access the tables
create policy "Enable all for authenticated" on public.ayn_dev_conversations for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated" on public.ayn_dev_messages for all to authenticated using (true) with check (true);
create policy "Enable all for authenticated" on public.ayn_dev_skills for all to authenticated using (true) with check (true);

-- Insert a default skill so the user can test the domain knowledge injection!
INSERT INTO public.ayn_dev_skills (category, name, description, content, enabled)
VALUES (
    'Architecture', 
    'AYN Dev Agent Pattern', 
    'Rules for edge function deployment and React UI components', 
    'Whenever you modify UI components in src/components/, strictly use Tailwind CSS and standard shadcn/ui. Ensure Edge Functions always use Deno.serve and standard CORS headers.', 
    true
) ON CONFLICT DO NOTHING;
