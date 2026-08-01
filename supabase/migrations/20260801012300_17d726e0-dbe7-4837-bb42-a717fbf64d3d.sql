-- ── 1. Record the six admin functions that only existed in the live database ──
CREATE OR REPLACE FUNCTION public.admin_insert_ticket_message(p_ticket_id uuid, p_content text, p_sender text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, content)
  VALUES (p_ticket_id, auth.uid(), p_sender, p_content)
  RETURNING row_to_json(ticket_messages.*)::jsonb INTO v_result;

  UPDATE support_tickets SET updated_at = now(), status = 'in_progress' WHERE id = p_ticket_id AND status = 'open';
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_ticket(p_id uuid, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE support_tickets SET
    status = COALESCE(p_data->>'status', status),
    priority = COALESCE(p_data->>'priority', priority),
    updated_at = now()
  WHERE id = p_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_system_config(p_key text, p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  INSERT INTO system_config (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = p_value, updated_at = now();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_system_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'config', (SELECT jsonb_agg(row_to_json(c)) FROM system_config c),
    'app_settings', (SELECT jsonb_agg(row_to_json(s)) FROM app_settings s)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_error_monitoring(p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN jsonb_build_object(
    'errors', (
      SELECT jsonb_agg(row_to_json(e))
      FROM (SELECT error_message, error_stack, url, user_id, created_at FROM error_logs ORDER BY created_at DESC LIMIT p_limit) e
    ),
    'resolutions', (SELECT jsonb_agg(row_to_json(r)) FROM error_group_resolutions r)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_support_tickets(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN jsonb_build_object(
    'tickets', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT
          t.id, t.user_id, t.subject, t.category, t.priority, t.status,
          t.guest_email, t.guest_name, t.assigned_to, t.has_unread_reply,
          t.created_at, t.updated_at,
          COALESCE(u.email, t.guest_email) AS email,
          COALESCE(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            t.guest_name,
            split_part(COALESCE(u.email, t.guest_email, ''), '@', 1),
            'Anonymous'
          ) AS display_name,
          (SELECT count(*) FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS reply_count,
          (SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at)
           FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS replies
        FROM support_tickets t
        LEFT JOIN auth.users u ON u.id = t.user_id
        ORDER BY t.updated_at DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    'total', (SELECT count(*) FROM support_tickets)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_insert_ticket_message(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_ticket(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_system_config(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_system_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_error_monitoring(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_support_tickets(integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_insert_ticket_message(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_system_config(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_system_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_error_monitoring(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_support_tickets(integer, integer) TO authenticated;

-- ── 2. Drop the leftovers of the deleted legacy admin panel ──
DROP FUNCTION IF EXISTS public.admin_delete_custom_order;
DROP FUNCTION IF EXISTS public.admin_upsert_custom_order;
DROP FUNCTION IF EXISTS public.get_admin_activity_log;
DROP FUNCTION IF EXISTS public.get_admin_ai_limits;
DROP FUNCTION IF EXISTS public.get_admin_applications;
DROP FUNCTION IF EXISTS public.get_admin_beta_feedback;
DROP FUNCTION IF EXISTS public.get_admin_churn_alerts;
DROP FUNCTION IF EXISTS public.get_admin_contact_messages;
DROP FUNCTION IF EXISTS public.get_admin_conversations;
DROP FUNCTION IF EXISTS public.get_admin_credit_gifts;
DROP FUNCTION IF EXISTS public.get_admin_custom_orders;
DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats;
DROP FUNCTION IF EXISTS public.get_admin_email_broadcast_users;
DROP FUNCTION IF EXISTS public.get_admin_error_logs;
DROP FUNCTION IF EXISTS public.get_admin_error_monitoring_data;
DROP FUNCTION IF EXISTS public.get_admin_llm_management;
DROP FUNCTION IF EXISTS public.get_admin_llm_stats;
DROP FUNCTION IF EXISTS public.get_admin_message_ratings;
DROP FUNCTION IF EXISTS public.get_admin_nda_agreements;
DROP FUNCTION IF EXISTS public.get_admin_nda_list;
DROP FUNCTION IF EXISTS public.get_admin_notification_log;
DROP FUNCTION IF EXISTS public.get_admin_subscriptions;
DROP FUNCTION IF EXISTS public.get_admin_support_data;
DROP FUNCTION IF EXISTS public.get_admin_system_metrics;
DROP FUNCTION IF EXISTS public.get_admin_system_monitoring;
DROP FUNCTION IF EXISTS public.get_admin_test_results;
DROP FUNCTION IF EXISTS public.get_admin_test_results_data;
DROP FUNCTION IF EXISTS public.get_admin_user_growth;
DROP FUNCTION IF EXISTS public.get_admin_user_messages;
DROP FUNCTION IF EXISTS public.get_admin_users;
DROP FUNCTION IF EXISTS public.get_admin_visitor_analytics;

-- ── 3. A declined employer is not a suspended employer ──
ALTER TYPE public.employer_status ADD VALUE IF NOT EXISTS 'declined';

CREATE OR REPLACE FUNCTION public.admin_employer_decline(p_user_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE employer_accounts
     SET status = 'declined', internal_note = p_note, updated_at = now()
   WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- ── 4. Searches per period become a real plan allowance ──
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS searches_limit integer;
