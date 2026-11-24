-- Clinic-entered payments: this records receipts but does not process card/mobile-money transactions.
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','mobile_money','bank_transfer','card','insurance','other')),
  reference text,
  received_by uuid NOT NULL REFERENCES auth.users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_invoice_patient_fkey
    FOREIGN KEY (invoice_id, patient_id)
    REFERENCES public.invoices(id, patient_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_patient_idx ON public.invoice_payments(invoice_id, patient_id);
CREATE INDEX IF NOT EXISTS invoice_payments_patient_id_idx ON public.invoice_payments(patient_id);
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_payments FROM anon;
GRANT SELECT, INSERT ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;

CREATE POLICY "Patients read their own invoice payments" ON public.invoice_payments
  FOR SELECT TO authenticated USING (patient_id = (select auth.uid()));
CREATE POLICY "Authorized staff read invoice payments" ON public.invoice_payments
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.read')
  );
CREATE POLICY "Authorized staff record invoice payments" ON public.invoice_payments
  FOR INSERT TO authenticated WITH CHECK (
    received_by = (select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
    )
  );
CREATE POLICY "Administrators manage invoice payments" ON public.invoice_payments
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.apply_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_status text;
BEGIN
  SELECT total, status INTO v_total, v_status
  FROM public.invoices
  WHERE id = NEW.invoice_id AND patient_id = NEW.patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found for this patient';
  END IF;
  IF v_status NOT IN ('issued','partial') THEN
    RAISE EXCEPTION 'Only issued invoices can receive payments';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_paid
  FROM public.invoice_payments
  WHERE invoice_id = NEW.invoice_id;
  v_paid := v_paid + NEW.amount;

  IF v_paid > v_total THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding invoice balance';
  END IF;

  UPDATE public.invoices
  SET status = CASE WHEN v_paid >= v_total THEN 'paid' ELSE 'partial' END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_invoice_payment_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invoice_payment_update_status
  BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_payment_status();

CREATE TRIGGER audit_invoice_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.write_clinic_audit_log();
