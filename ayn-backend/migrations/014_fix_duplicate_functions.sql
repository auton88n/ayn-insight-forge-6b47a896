-- Migration 014: Fix duplicate check_user_ai_limit function

-- Drop all versions of the function
DROP FUNCTION IF EXISTS check_user_ai_limit(uuid);
DROP FUNCTION IF EXISTS check_user_ai_limit(text);
DROP FUNCTION IF EXISTS check_user_ai_limit(varchar);

-- Recreate clean single version
CREATE OR REPLACE FUNCTION check_user_ai_limit(p_user_id uuid)
RETURNS TABLE(allowed boolean, reason text, remaining integer) AS $$
DECLARE
    v_daily_limit integer;
    v_current_count integer;
    v_bonus_credits integer;
BEGIN
    SELECT 
        COALESCE(daily_messages, 5),
        COALESCE(current_daily_messages, 0),
        COALESCE(bonus_credits, 0)
    INTO v_daily_limit, v_current_count, v_bonus_credits
    FROM user_ai_limits
    WHERE user_id = p_user_id;

    -- No record = free tier defaults
    IF NOT FOUND THEN
        v_daily_limit := 5;
        v_current_count := 0;
        v_bonus_credits := 0;
    END IF;

    IF v_bonus_credits > 0 THEN
        RETURN QUERY SELECT true, 'bonus_credits'::text, v_bonus_credits;
    ELSIF v_current_count < v_daily_limit THEN
        RETURN QUERY SELECT true, 'within_limit'::text, (v_daily_limit - v_current_count);
    ELSE
        RETURN QUERY SELECT false, 'daily_limit_reached'::text, 0;
    END IF;
END;
$$ LANGUAGE plpgsql;
