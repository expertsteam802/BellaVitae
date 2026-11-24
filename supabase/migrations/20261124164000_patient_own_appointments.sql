-- Let signed-in patients see only appointments linked to their own account.
CREATE POLICY "Patients read their own appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
