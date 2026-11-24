-- Remove patient phone OTP and replace it with appointment-code + booking-phone verification.
-- Each lookup returns only the one appointment whose code and phone both match.

CREATE OR REPLACE FUNCTION public.set_appointment_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    v_code := 'BV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    SELECT EXISTS (
      SELECT 1 FROM public.appointments WHERE code = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  NEW.code := v_code;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_appointment_by_code_and_phone(
  _code text,
  _phone text
)
RETURNS TABLE (
  code text,
  patient_name text,
  phone text,
  doctor text,
  insurance text,
  insurance_card text,
  requested_date date,
  requested_time text,
  reason text,
  status text,
  cancellation_reason text,
  cancelled_at timestamptz,
  rescheduled_at timestamptz,
  previous_date date,
  previous_time text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.code, a.patient_name, a.phone, a.doctor, a.insurance, a.insurance_card,
         a.requested_date, a.requested_time, a.reason, a.status,
         a.cancellation_reason, a.cancelled_at, a.rescheduled_at,
         a.previous_date, a.previous_time, a.created_at
  FROM public.appointments a
  WHERE length(trim(coalesce(_phone, ''))) >= 8
    AND length(trim(coalesce(_code, ''))) BETWEEN 4 AND 20
    AND upper(trim(a.code)) = upper(trim(_code))
    AND regexp_replace(a.phone, '[^0-9]', '', 'g') =
        regexp_replace(_phone, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_code_and_phone(
  _code text,
  _phone text,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF length(trim(coalesce(_phone, ''))) < 8
     OR length(trim(coalesce(_code, ''))) NOT BETWEEN 4 AND 20 THEN
    RETURN false;
  END IF;

  UPDATE public.appointments a
     SET status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = nullif(trim(coalesce(_reason, '')), '')
   WHERE upper(trim(a.code)) = upper(trim(_code))
     AND regexp_replace(a.phone, '[^0-9]', '', 'g') =
         regexp_replace(_phone, '[^0-9]', '', 'g')
     AND a.status NOT IN ('cancelled', 'completed')
     AND a.requested_date >= current_date;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_code_and_phone(
  _code text,
  _phone text,
  _date date,
  _time text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF length(trim(coalesce(_phone, ''))) < 8
     OR length(trim(coalesce(_code, ''))) NOT BETWEEN 4 AND 20 THEN
    RETURN false;
  END IF;

  IF _date IS NULL OR _date < current_date THEN
    RAISE EXCEPTION 'Please choose today or a future date';
  END IF;

  IF _time !~ '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
     OR _time < '07:00' OR _time > '23:00' THEN
    RAISE EXCEPTION 'Please choose a valid time between 07:00 and 23:00';
  END IF;

  UPDATE public.appointments a
     SET previous_date = a.requested_date,
         previous_time = a.requested_time,
         requested_date = _date,
         requested_time = _time,
         rescheduled_at = now(),
         status = 'pending'
   WHERE upper(trim(a.code)) = upper(trim(_code))
     AND regexp_replace(a.phone, '[^0-9]', '', 'g') =
         regexp_replace(_phone, '[^0-9]', '', 'g')
     AND a.status NOT IN ('cancelled', 'completed')
     AND a.requested_date >= current_date;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    DELETE FROM public.appointment_reminders r
     USING public.appointments a
     WHERE r.appointment_id = a.id
       AND upper(trim(a.code)) = upper(trim(_code))
       AND r.status <> 'sent';
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_appointment_by_code_and_phone(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment_by_code_and_phone(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment_by_code_and_phone(text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointment_by_code_and_phone(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_code_and_phone(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_code_and_phone(text, text, date, text) TO anon, authenticated;

-- Remove all OTP/token-based database integrations and their stored codes.
DROP FUNCTION IF EXISTS public.get_appointments_by_token(uuid);
DROP FUNCTION IF EXISTS public.cancel_appointment_by_token(uuid, text, text);
DROP FUNCTION IF EXISTS public.reschedule_appointment_by_token(uuid, text, date, text);
DROP FUNCTION IF EXISTS public.phone_for_token(uuid);
DROP FUNCTION IF EXISTS public.request_phone_otp(text);
DROP FUNCTION IF EXISTS public.verify_phone_otp(text, text);
DROP TABLE IF EXISTS public.phone_otps;
