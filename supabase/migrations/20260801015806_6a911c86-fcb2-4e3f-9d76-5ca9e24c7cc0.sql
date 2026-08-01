DROP TRIGGER IF EXISTS on_security_event ON public.security_logs;
DROP FUNCTION IF EXISTS public.trigger_security_guard() CASCADE;