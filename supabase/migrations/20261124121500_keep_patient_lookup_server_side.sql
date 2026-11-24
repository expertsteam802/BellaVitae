-- Keep appointment-code + phone checks inside server functions, not public Supabase RPCs.
DROP FUNCTION IF EXISTS public.get_appointment_by_code_and_phone(text, text);
DROP FUNCTION IF EXISTS public.cancel_appointment_by_code_and_phone(text, text, text);
DROP FUNCTION IF EXISTS public.reschedule_appointment_by_code_and_phone(text, text, date, text);
