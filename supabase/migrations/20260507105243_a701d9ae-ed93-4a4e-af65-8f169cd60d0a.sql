-- Command Center: team updates feed
CREATE TABLE public.cc_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  department TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cc_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_updates_select_own" ON public.cc_updates
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "cc_updates_insert_own" ON public.cc_updates
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "cc_updates_update_own" ON public.cc_updates
  FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "cc_updates_delete_own" ON public.cc_updates
  FOR DELETE USING ((select auth.uid()) = user_id);

CREATE INDEX idx_cc_updates_user_created ON public.cc_updates(user_id, created_at DESC);

-- Command Center: inbox items (messages, reports, questions sent between users)
CREATE TABLE public.cc_inbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  sender_name TEXT,
  recipient_id UUID NOT NULL,
  recipient_email TEXT,
  kind TEXT NOT NULL DEFAULT 'message',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_ids UUID[] DEFAULT '{}',
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cc_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_inbox_select_participant" ON public.cc_inbox
  FOR SELECT USING ((select auth.uid()) IN (sender_id, recipient_id));
CREATE POLICY "cc_inbox_insert_as_sender" ON public.cc_inbox
  FOR INSERT WITH CHECK ((select auth.uid()) = sender_id);
CREATE POLICY "cc_inbox_update_recipient" ON public.cc_inbox
  FOR UPDATE USING ((select auth.uid()) = recipient_id);
CREATE POLICY "cc_inbox_delete_participant" ON public.cc_inbox
  FOR DELETE USING ((select auth.uid()) IN (sender_id, recipient_id));

CREATE INDEX idx_cc_inbox_recipient_created ON public.cc_inbox(recipient_id, created_at DESC);
CREATE INDEX idx_cc_inbox_sender_created ON public.cc_inbox(sender_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.cc_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_cc_updates_updated_at
BEFORE UPDATE ON public.cc_updates
FOR EACH ROW EXECUTE FUNCTION public.cc_set_updated_at();