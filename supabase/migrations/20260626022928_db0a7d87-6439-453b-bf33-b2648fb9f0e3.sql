CREATE TABLE public.extension_link_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id UUID,
  token TEXT,
  device_label TEXT NOT NULL DEFAULT 'Chrome',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX idx_extension_link_codes_code ON public.extension_link_codes(code);
CREATE INDEX idx_extension_link_codes_expires ON public.extension_link_codes(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_link_codes TO authenticated;
GRANT ALL ON public.extension_link_codes TO service_role;

ALTER TABLE public.extension_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own approved codes"
ON public.extension_link_codes FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can approve link codes"
ON public.extension_link_codes FOR UPDATE
TO authenticated
USING (status = 'pending' AND expires_at > now())
WITH CHECK ((select auth.uid()) = user_id);