-- Enforce patient consistency across linked clinical and billing records.
ALTER TABLE public.clinical_encounters
  ADD CONSTRAINT clinical_encounters_id_patient_id_key UNIQUE (id, patient_id);
ALTER TABLE public.lab_orders
  ADD CONSTRAINT lab_orders_id_patient_id_key UNIQUE (id, patient_id);
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_id_patient_id_key UNIQUE (id, patient_id);

ALTER TABLE public.patient_visit_summaries
  DROP CONSTRAINT IF EXISTS patient_visit_summaries_encounter_id_fkey;
ALTER TABLE public.patient_visit_summaries
  ADD CONSTRAINT patient_visit_summaries_encounter_patient_fkey
  FOREIGN KEY (encounter_id, patient_id)
  REFERENCES public.clinical_encounters(id, patient_id) ON DELETE CASCADE;

ALTER TABLE public.diagnoses
  DROP CONSTRAINT IF EXISTS diagnoses_encounter_id_fkey;
ALTER TABLE public.diagnoses
  ADD CONSTRAINT diagnoses_encounter_patient_fkey
  FOREIGN KEY (encounter_id, patient_id)
  REFERENCES public.clinical_encounters(id, patient_id) ON DELETE CASCADE;

ALTER TABLE public.lab_results
  DROP CONSTRAINT IF EXISTS lab_results_order_id_fkey;
ALTER TABLE public.lab_results
  ADD CONSTRAINT lab_results_order_patient_fkey
  FOREIGN KEY (order_id, patient_id)
  REFERENCES public.lab_orders(id, patient_id) ON DELETE CASCADE;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_invoice_patient_fkey
  FOREIGN KEY (invoice_id, patient_id)
  REFERENCES public.invoices(id, patient_id) ON DELETE CASCADE;

ALTER TABLE public.insurance_claims
  DROP CONSTRAINT IF EXISTS insurance_claims_invoice_id_fkey;
ALTER TABLE public.insurance_claims
  ADD CONSTRAINT insurance_claims_invoice_patient_fkey
  FOREIGN KEY (invoice_id, patient_id)
  REFERENCES public.invoices(id, patient_id) ON DELETE SET NULL;
