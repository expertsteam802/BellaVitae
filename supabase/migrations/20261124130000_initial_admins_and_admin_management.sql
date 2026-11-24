CREATE TABLE IF NOT EXISTS public.admin_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_role_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_role_audit FROM anon, authenticated;
GRANT ALL ON public.admin_role_audit TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone', lower(NEW.email))
  ON CONFLICT (id) DO UPDATE SET email = lower(EXCLUDED.email);

  -- Public signups are patients. Only the two approved initial administrators
  -- receive admin access; staff roles are assigned by a trusted server function.
  IF lower(NEW.email) IN ('mucyochristhecla@gmail.com','nibellasheja@gmail.com') THEN
    v_role := 'admin';
  ELSE
    v_role := 'patient';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
