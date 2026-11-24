
-- Bella Vitae clinical operations foundation.
-- All patient-linked clinical and financial tables are private by default.
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'patients.read','records.read','records.write','encounters.read','encounters.write',
    'prescriptions.read','prescriptions.write','lab.read','lab.write',
    'billing.read','billing.write','claims.read','claims.write',
    'documents.read','documents.write','audit.read'
  )),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
CREATE INDEX IF NOT EXISTS staff_permissions_user_id_idx ON public.staff_permissions(user_id);
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_permissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
CREATE POLICY "Administrators manage staff permissions" ON public.staff_permissions
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

CREATE POLICY "Permitted staff can view patient directory" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = (select auth.uid()) AND sp.permission = 'patients.read'
    )
  );

CREATE TABLE IF NOT EXISTS public.clinic_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_departments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_departments FROM anon;
GRANT SELECT ON public.clinic_departments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.clinic_departments TO authenticated;
GRANT ALL ON public.clinic_departments TO service_role;
CREATE POLICY "Authenticated users view active departments" ON public.clinic_departments
  FOR SELECT TO authenticated USING (active OR public.has_role((select auth.uid()), 'admin'));
CREATE POLICY "Admins manage departments" ON public.clinic_departments
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));
INSERT INTO public.clinic_departments (name, description, sort_order) VALUES
 ('General Medicine','General consultations and primary care',1),
 ('Dentistry','Dental consultations and treatment planning',2),
 ('Gynecology','Women’s health consultations',3),
 ('Internal Medicine','Adult medical assessment and follow-up',4),
 ('Laboratory','Diagnostic sample collection and testing',5)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.patient_medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN ('history','allergy','condition','procedure','immunization','other')),
  title text NOT NULL,
  clinician_notes text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_medical_records_patient_idx ON public.patient_medical_records(patient_id, recorded_at DESC);
ALTER TABLE public.patient_medical_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_medical_records FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_medical_records TO authenticated;
GRANT ALL ON public.patient_medical_records TO service_role;
CREATE POLICY "Authorized staff read medical records" ON public.patient_medical_records
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='records.read')
  );
CREATE POLICY "Authorized staff create medical records" ON public.patient_medical_records
  FOR INSERT TO authenticated WITH CHECK (
    recorded_by = (select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='records.write')
    )
  );
CREATE POLICY "Authorized staff update medical records" ON public.patient_medical_records
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='records.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='records.write')
  );
CREATE POLICY "Administrators delete medical records" ON public.patient_medical_records
  FOR DELETE TO authenticated USING (public.has_role((select auth.uid()), 'admin'));

CREATE TABLE IF NOT EXISTS public.clinical_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  clinician_id uuid NOT NULL REFERENCES auth.users(id),
  department text NOT NULL,
  chief_complaint text NOT NULL,
  assessment text,
  plan text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','signed','closed')),
  encounter_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_encounters_patient_idx ON public.clinical_encounters(patient_id, encounter_at DESC);
CREATE INDEX IF NOT EXISTS clinical_encounters_clinician_idx ON public.clinical_encounters(clinician_id, encounter_at DESC);
ALTER TABLE public.clinical_encounters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinical_encounters FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_encounters TO authenticated;
GRANT ALL ON public.clinical_encounters TO service_role;
CREATE POLICY "Authorized staff read encounters" ON public.clinical_encounters
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.read')
  );
CREATE POLICY "Authorized staff create encounters" ON public.clinical_encounters
  FOR INSERT TO authenticated WITH CHECK (
    clinician_id=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
    )
  );
CREATE POLICY "Authorized staff update encounters" ON public.clinical_encounters
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  );
CREATE POLICY "Administrators delete encounters" ON public.clinical_encounters
  FOR DELETE TO authenticated USING (public.has_role((select auth.uid()), 'admin'));

CREATE TABLE IF NOT EXISTS public.patient_visit_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL UNIQUE REFERENCES public.clinical_encounters(id) ON DELETE CASCADE,
  summary text NOT NULL,
  care_plan text,
  follow_up_instructions text,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS patient_visit_summaries_patient_idx ON public.patient_visit_summaries(patient_id, published_at DESC);
ALTER TABLE public.patient_visit_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_visit_summaries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_visit_summaries TO authenticated;
GRANT ALL ON public.patient_visit_summaries TO service_role;
CREATE POLICY "Patients read their own visit summaries" ON public.patient_visit_summaries
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read visit summaries" ON public.patient_visit_summaries
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.read')
  );
CREATE POLICY "Authorized staff create visit summaries" ON public.patient_visit_summaries
  FOR INSERT TO authenticated WITH CHECK (
    created_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
    )
  );
CREATE POLICY "Authorized staff update visit summaries" ON public.patient_visit_summaries
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  );

CREATE TABLE IF NOT EXISTS public.diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL REFERENCES public.clinical_encounters(id) ON DELETE CASCADE,
  code text,
  description text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnoses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnoses TO authenticated;
GRANT ALL ON public.diagnoses TO service_role;
CREATE POLICY "Authorized staff read diagnoses" ON public.diagnoses
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.read')
  );
CREATE POLICY "Authorized staff write diagnoses" ON public.diagnoses
  FOR INSERT TO authenticated WITH CHECK (
    recorded_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
    )
  );
CREATE POLICY "Authorized staff update diagnoses" ON public.diagnoses
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='encounters.write')
  );

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.clinical_encounters(id) ON DELETE SET NULL,
  prescribed_by uuid NOT NULL REFERENCES auth.users(id),
  medication_name text NOT NULL,
  strength text,
  dosage text NOT NULL,
  route text,
  frequency text NOT NULL,
  duration text,
  instructions text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  prescribed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescriptions_patient_idx ON public.prescriptions(patient_id, prescribed_at DESC);
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prescriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
CREATE POLICY "Patients read own prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read prescriptions" ON public.prescriptions
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='prescriptions.read')
  );
CREATE POLICY "Authorized staff create prescriptions" ON public.prescriptions
  FOR INSERT TO authenticated WITH CHECK (
    prescribed_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='prescriptions.write')
    )
  );
CREATE POLICY "Authorized staff update prescriptions" ON public.prescriptions
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='prescriptions.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='prescriptions.write')
  );

CREATE TABLE IF NOT EXISTS public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.clinical_encounters(id) ON DELETE SET NULL,
  ordered_by uuid NOT NULL REFERENCES auth.users(id),
  test_name text NOT NULL,
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine','urgent')),
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','collected','processing','resulted','cancelled')),
  clinical_notes text,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_orders_patient_idx ON public.lab_orders(patient_id, ordered_at DESC);
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_orders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders TO authenticated;
GRANT ALL ON public.lab_orders TO service_role;
CREATE POLICY "Patients read own lab orders" ON public.lab_orders
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read lab orders" ON public.lab_orders
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.read')
  );
CREATE POLICY "Authorized staff create lab orders" ON public.lab_orders
  FOR INSERT TO authenticated WITH CHECK (
    ordered_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
    )
  );
CREATE POLICY "Authorized staff update lab orders" ON public.lab_orders
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
  );

CREATE TABLE IF NOT EXISTS public.lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result_summary text NOT NULL,
  result_value text,
  unit text,
  reference_range text,
  interpretation text,
  is_verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_results_patient_idx ON public.lab_results(patient_id, created_at DESC);
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_results FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_results TO authenticated;
GRANT ALL ON public.lab_results TO service_role;
CREATE POLICY "Patients read verified own lab results" ON public.lab_results
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()) AND is_verified=true);
CREATE POLICY "Authorized staff read lab results" ON public.lab_results
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.read')
  );
CREATE POLICY "Authorized staff create lab results" ON public.lab_results
  FOR INSERT TO authenticated WITH CHECK (
    NOT is_verified AND verified_by IS NULL AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
    )
  );
CREATE POLICY "Authorized staff update lab results" ON public.lab_results
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='lab.write')
  );

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('BV-INV-' || lpad(nextval('public.invoice_number_seq')::text, 7, '0')),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'RWF' CHECK (currency='RWF'),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','partial','void')),
  due_date date,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_patient_idx ON public.invoices(patient_id, created_at DESC);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
CREATE POLICY "Patients read own invoices" ON public.invoices
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read invoices" ON public.invoices
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.read')
  );
CREATE POLICY "Authorized staff create invoices" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (
    created_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
    )
  );
CREATE POLICY "Authorized staff update invoices" ON public.invoices
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
  );

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items(invoice_id);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
CREATE POLICY "Patients read own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read invoice items" ON public.invoice_items
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.read')
  );
CREATE POLICY "Authorized staff write invoice items" ON public.invoice_items
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
  );
CREATE POLICY "Authorized staff update invoice items" ON public.invoice_items
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='billing.write')
  );

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  insurer_name text NOT NULL,
  policy_number text,
  claim_number text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected','paid')),
  submitted_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insurance_claims FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims TO authenticated;
GRANT ALL ON public.insurance_claims TO service_role;
CREATE POLICY "Patients read own insurance claims" ON public.insurance_claims
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read insurance claims" ON public.insurance_claims
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='claims.read')
  );
CREATE POLICY "Authorized staff create insurance claims" ON public.insurance_claims
  FOR INSERT TO authenticated WITH CHECK (
    created_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='claims.write')
    )
  );
CREATE POLICY "Authorized staff update insurance claims" ON public.insurance_claims
  FOR UPDATE TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='claims.write')
  ) WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='claims.write')
  );

CREATE TABLE IF NOT EXISTS public.patient_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  document_type text NOT NULL CHECK (document_type IN ('referral','imaging','lab_report','insurance','consent','other')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_documents TO authenticated;
GRANT ALL ON public.patient_documents TO service_role;
CREATE POLICY "Patients read own document metadata" ON public.patient_documents
  FOR SELECT TO authenticated USING (patient_id=(select auth.uid()));
CREATE POLICY "Authorized staff read patient documents" ON public.patient_documents
  FOR SELECT TO authenticated USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='documents.read')
  );
CREATE POLICY "Authorized staff add patient documents" ON public.patient_documents
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by=(select auth.uid()) AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.user_id=(select auth.uid()) AND sp.permission='documents.write')
    )
  );

CREATE TABLE IF NOT EXISTS public.clinic_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinic_audit_log_patient_idx ON public.clinic_audit_log(patient_id, occurred_at DESC);
ALTER TABLE public.clinic_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_audit_log FROM anon, authenticated;
GRANT ALL ON public.clinic_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.write_clinic_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid;
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_patient_id := OLD.patient_id;
    v_id := OLD.id;
  ELSE
    v_patient_id := NEW.patient_id;
    v_id := NEW.id;
  END IF;
  INSERT INTO public.clinic_audit_log(actor_id, patient_id, entity_name, record_id, action)
  VALUES (auth.uid(), v_patient_id, TG_TABLE_NAME, v_id, TG_OP);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.write_clinic_audit_log() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_medical_records','clinical_encounters','patient_visit_summaries',
    'diagnoses','prescriptions','lab_orders','lab_results','invoices',
    'invoice_items','insurance_claims','patient_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_clinic_audit_log()', t, t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_clinic_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinic_departments_touch BEFORE UPDATE ON public.clinic_departments
FOR EACH ROW EXECUTE FUNCTION public.touch_clinic_updated_at();
CREATE TRIGGER clinical_encounters_touch BEFORE UPDATE ON public.clinical_encounters
FOR EACH ROW EXECUTE FUNCTION public.touch_clinic_updated_at();
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.touch_clinic_updated_at();
CREATE TRIGGER insurance_claims_touch BEFORE UPDATE ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.touch_clinic_updated_at();
