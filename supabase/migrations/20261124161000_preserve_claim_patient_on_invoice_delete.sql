ALTER TABLE public.insurance_claims
  DROP CONSTRAINT IF EXISTS insurance_claims_invoice_patient_fkey;
ALTER TABLE public.insurance_claims
  ADD CONSTRAINT insurance_claims_invoice_patient_fkey
  FOREIGN KEY (invoice_id, patient_id)
  REFERENCES public.invoices(id, patient_id) ON DELETE RESTRICT;
