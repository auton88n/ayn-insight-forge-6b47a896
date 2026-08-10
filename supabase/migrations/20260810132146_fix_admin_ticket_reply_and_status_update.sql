-- v3.117.0 — admin_insert_ticket_message inserted into a column literally
-- named "content", but ticket_messages' real column is "message" (confirmed
-- live: every admin reply attempt errored 42703, column does not exist).
-- p_sender (declared text) also needs an explicit cast to the ticket_sender_type
-- enum, since plpgsql won't implicitly cast a resolved text value to a custom enum.
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
  INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message)
  VALUES (p_ticket_id, auth.uid(), p_sender::ticket_sender_type, p_content)
  RETURNING row_to_json(ticket_messages.*)::jsonb INTO v_result;

  UPDATE support_tickets SET updated_at = now(), status = 'in_progress' WHERE id = p_ticket_id AND status = 'open';
  RETURN v_result;
END;
$function$;

-- v3.117.0 — status and priority are enum columns (support_ticket_status /
-- support_ticket_priority), but COALESCE compared them against the raw text
-- pulled from p_data->>'status' with no cast, which Postgres refuses to
-- match (confirmed live: 42804, "COALESCE types text and support_ticket_status
-- cannot be matched" — every admin status/priority change errored out).
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
    status = COALESCE((p_data->>'status')::support_ticket_status, status),
    priority = COALESCE((p_data->>'priority')::support_ticket_priority, priority),
    updated_at = now()
  WHERE id = p_id;
  RETURN true;
END;
$function$;
