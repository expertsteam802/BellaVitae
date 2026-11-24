-- Allow staff to read only their own permission grants and allow authorized audit review.
CREATE POLICY "Staff view their own permissions" ON public.staff_permissions
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "Authorized administrators review clinical audit log" ON public.clinic_audit_log
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = (select auth.uid()) AND sp.permission = 'audit.read'
    )
  );
GRANT SELECT ON public.clinic_audit_log TO authenticated;
