-- Separate laboratory data entry from clinical verification authority.
ALTER TABLE public.staff_permissions DROP CONSTRAINT IF EXISTS staff_permissions_permission_check;
ALTER TABLE public.staff_permissions ADD CONSTRAINT staff_permissions_permission_check CHECK (permission IN (
  'patients.read','records.read','records.write','encounters.read','encounters.write',
  'prescriptions.read','prescriptions.write','lab.read','lab.write','lab.verify',
  'billing.read','billing.write','claims.read','claims.write',
  'documents.read','documents.write','audit.read'
));

DROP POLICY IF EXISTS "Authorized staff update lab results" ON public.lab_results;
CREATE POLICY "Authorized staff update lab results" ON public.lab_results
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission IN ('lab.write','lab.verify'))
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR (
      is_verified = false AND verified_by IS NULL
      AND EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
    )
    OR (
      is_verified = true AND verified_by = (select auth.uid()) AND verified_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.verify')
    )
  );
