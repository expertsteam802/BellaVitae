-- Ensure invoice settlement states are backed by actual recorded payments.
CREATE OR REPLACE FUNCTION public.validate_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total numeric(14,2);
  v_status text;
  v_paid numeric(14,2);
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
  FROM public.invoice_payments WHERE invoice_id = NEW.invoice_id;
  IF v_paid + NEW.amount > v_total THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding invoice balance';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_invoice_payment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
BEGIN
  SELECT total INTO v_total
  FROM public.invoices
  WHERE id = NEW.invoice_id AND patient_id = NEW.patient_id
  FOR UPDATE;
  SELECT COALESCE(sum(amount), 0) INTO v_paid
  FROM public.invoice_payments WHERE invoice_id = NEW.invoice_id;
  UPDATE public.invoices
  SET status = CASE WHEN v_paid >= v_total THEN 'paid' ELSE 'partial' END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_invoice_payment_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_payment_update_status ON public.invoice_payments;
CREATE TRIGGER invoice_payment_validate
  BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_payment();
CREATE TRIGGER invoice_payment_update_status
  AFTER INSERT ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_payment_status();

CREATE OR REPLACE FUNCTION public.guard_invoice_settlement_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_paid numeric(14,2);
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT COALESCE(sum(amount), 0) INTO v_paid
    FROM public.invoice_payments WHERE invoice_id = NEW.id;

    IF NEW.status = 'paid' AND NOT (NEW.total > 0 AND v_paid >= NEW.total) THEN
      RAISE EXCEPTION 'An invoice can only be marked paid when recorded payments cover its total';
    END IF;
    IF NEW.status = 'partial' AND NOT (v_paid > 0 AND v_paid < NEW.total) THEN
      RAISE EXCEPTION 'Partial status must match a recorded partial payment';
    END IF;
    IF NEW.status IN ('draft','issued','void') AND v_paid > 0 THEN
      RAISE EXCEPTION 'An invoice with recorded payments cannot be reverted or voided';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_settlement_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_invoice_settlement_status ON public.invoices;
CREATE TRIGGER guard_invoice_settlement_status
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_settlement_status();
