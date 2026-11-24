import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/clinic-operations")({
  head: () => ({
    meta: [
      { title: "Clinic operations | Bella Vitae Medical Clinic" },
      { name: "description", content: "Private patient administration and clinical workflows for authorized Bella Vitae staff." },
    ],
  }),
  component: ClinicOperationsPage,
});

const PERMISSIONS = [
  { key: "patients.read", label: "Patient directory" },
  { key: "records.read", label: "Read medical records" },
  { key: "records.write", label: "Write medical records" },
  { key: "encounters.read", label: "Read consultations" },
  { key: "encounters.write", label: "Create consultations and visit summaries" },
  { key: "prescriptions.read", label: "Read prescriptions" },
  { key: "prescriptions.write", label: "Create prescriptions" },
  { key: "lab.read", label: "Read laboratory work" },
  { key: "lab.write", label: "Manage laboratory work" },
  { key: "billing.read", label: "Read billing" },
  { key: "billing.write", label: "Create and update invoices" },
  { key: "claims.read", label: "Read insurance claims" },
  { key: "claims.write", label: "Manage insurance claims" },
  { key: "documents.read", label: "Read document metadata" },
  { key: "documents.write", label: "Register patient documents" },
  { key: "audit.read", label: "Review audit activity" },
] as const;

type Permission = (typeof PERMISSIONS)[number]["key"];
type Tab = "Patients" | "Records" | "Consultations" | "Prescriptions" | "Laboratory" | "Billing" | "Audit";

function ClinicOperationsPage() {
  const { user, loading, isStaff, isAdmin } = useAuth();
  const db = supabase as any;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Patients");
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [record, setRecord] = useState({ recordType: "history", title: "", notes: "" });
  const [encounter, setEncounter] = useState({ department: "General Medicine", complaint: "", assessment: "", plan: "", summary: "", followUp: "" });
  const [prescription, setPrescription] = useState({ medication: "", strength: "", dosage: "", route: "Oral", frequency: "", duration: "", instructions: "" });
  const [lab, setLab] = useState({ testName: "", priority: "routine", notes: "" });
  const [result, setResult] = useState({ orderId: "", summary: "", value: "", unit: "", range: "", interpretation: "" });
  const [invoice, setInvoice] = useState({ description: "", amount: "", dueDate: "", discount: "0" });
  const [busy, setBusy] = useState(false);

  const permissionsQuery = useQuery({
    enabled: !!user && !isAdmin,
    queryKey: ["my-clinic-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await db.from("staff_permissions").select("permission").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((x: { permission: Permission }) => x.permission);
    },
  });
  const granted = useMemo(() => new Set<Permission>(permissionsQuery.data ?? []), [permissionsQuery.data]);
  const can = (permission: Permission) => isAdmin || granted.has(permission);

  const patientsQuery = useQuery({
    enabled: !!user && isStaff && can("patients.read"),
    queryKey: ["clinic-patient-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, email, phone").order("full_name").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const recordsQuery = useQuery({
    enabled: !!user && isStaff && can("records.read"),
    queryKey: ["clinic-medical-records"],
    queryFn: async () => {
      const { data, error } = await db.from("patient_medical_records").select("*").order("recorded_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const encountersQuery = useQuery({
    enabled: !!user && isStaff && can("encounters.read"),
    queryKey: ["clinic-encounters"],
    queryFn: async () => {
      const { data, error } = await db.from("clinical_encounters").select("*").order("encounter_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const prescriptionsQuery = useQuery({
    enabled: !!user && isStaff && can("prescriptions.read"),
    queryKey: ["clinic-prescriptions"],
    queryFn: async () => {
      const { data, error } = await db.from("prescriptions").select("*").order("prescribed_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const labOrdersQuery = useQuery({
    enabled: !!user && isStaff && can("lab.read"),
    queryKey: ["clinic-lab-orders"],
    queryFn: async () => {
      const { data, error } = await db.from("lab_orders").select("*").order("ordered_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const labResultsQuery = useQuery({
    enabled: !!user && isStaff && can("lab.read"),
    queryKey: ["clinic-lab-results"],
    queryFn: async () => {
      const { data, error } = await db.from("lab_results").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const invoicesQuery = useQuery({
    enabled: !!user && isStaff && can("billing.read"),
    queryKey: ["clinic-invoices"],
    queryFn: async () => {
      const { data, error } = await db.from("invoices").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const claimsQuery = useQuery({
    enabled: !!user && isStaff && can("claims.read"),
    queryKey: ["clinic-claims"],
    queryFn: async () => {
      const { data, error } = await db.from("insurance_claims").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const auditQuery = useQuery({
    enabled: !!user && isStaff && can("audit.read"),
    queryKey: ["clinic-audit-log"],
    queryFn: async () => {
      const { data, error } = await db.from("clinic_audit_log").select("id, actor_id, patient_id, entity_name, record_id, action, occurred_at").order("occurred_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const patientList = patientsQuery.data ?? [];
  const filteredPatients = patientList.filter((p: any) => {
    const q = search.trim().toLowerCase();
    return !q || [p.full_name, p.email, p.phone].some((v) => String(v ?? "").toLowerCase().includes(q));
  });
  const refresh = (...keys: string[]) => keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  const choosePatient = (id: string) => {
    setSelectedPatient(id);
    setTab("Patients");
  };
  const submit = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "The operation could not be completed"); }
    finally { setBusy(false); }
  };

  if (loading || (user && !isAdmin && permissionsQuery.isLoading)) {
    return <SiteLayout><p className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Loading clinic workspace…</p></SiteLayout>;
  }
  if (!isStaff) return (
    <SiteLayout><div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-primary">Staff workspace</h1>
      <p className="mt-2 text-muted-foreground">This area is available to authenticated clinic staff.</p>
      <Link to="/auth" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Sign in</Link>
    </div></SiteLayout>
  );

  const tabs: { key: Tab; label: string; allowed: boolean }[] = [
    { key: "Patients", label: "Patients", allowed: can("patients.read") },
    { key: "Records", label: "Medical records", allowed: can("records.read") || can("records.write") },
    { key: "Consultations", label: "Consultations", allowed: can("encounters.read") || can("encounters.write") },
    { key: "Prescriptions", label: "Prescriptions", allowed: can("prescriptions.read") || can("prescriptions.write") },
    { key: "Laboratory", label: "Laboratory", allowed: can("lab.read") || can("lab.write") },
    { key: "Billing", label: "Billing & claims", allowed: can("billing.read") || can("billing.write") || can("claims.read") || can("claims.write") },
    { key: "Audit", label: "Audit log", allowed: can("audit.read") },
  ].filter((t) => t.allowed);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Bella Vitae · Internal system</p>
            <h1 className="mt-2 text-3xl font-bold text-primary">Clinic operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">Signed in as {user?.email}. Access is limited by your assigned permissions.</p>
          </div>
          <Link to="/admin" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">Back to staff panel</Link>
        </div>

        <div className="mt-7 flex flex-wrap gap-2 border-b border-border">
          {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-t-md px-3 py-2 text-sm font-medium ${tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{t.label}</button>)}
        </div>

        {tabs.length === 0 ? <div className="mt-8 rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">No clinical permissions assigned</h2><p className="mt-2 text-sm text-muted-foreground">Ask a clinic administrator to grant only the access needed for your job. No patient records are available until access is approved.</p></div> : null}

        {tab === "Patients" && can("patients.read") ? (
          <section className="py-7">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
              <div>
                <h2 className="text-xl font-semibold">Patient directory</h2>
                <p className="mt-1 text-sm text-muted-foreground">Only profiles visible under your patient-directory permission are listed.</p>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                <div className="mt-3 space-y-2">
                  {filteredPatients.map((p: any) => <button key={p.id} onClick={() => setSelectedPatient(p.id)} className={`w-full rounded-xl border p-3 text-left ${selectedPatient === p.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"}`}>
                    <span className="block font-medium">{p.full_name || "Patient profile"}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{p.email || "No email"} · {p.phone || "No phone"}</span>
                  </button>)}
                  {patientsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading patients…</p> : null}
                  {!patientsQuery.isLoading && filteredPatients.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No matching patients.</p> : null}
                </div>
              </div>
              <div className="h-fit rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold">Selected patient</h3>
                {selectedPatient ? <><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{selectedPatient}</p><p className="mt-3 text-sm">Patient selected. You can use this account in the clinical forms below.</p></> : <p className="mt-2 text-sm text-muted-foreground">Select a patient from the directory to prepare a consultation, record, prescription, laboratory order or invoice.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {can("encounters.write") ? <button onClick={() => setTab("Consultations")} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">New consultation</button> : null}
                  {can("records.write") ? <button onClick={() => setTab("Records")} className="rounded-md border border-border px-3 py-2 text-xs">Add record</button> : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "Records" ? (
          <section className="grid gap-6 py-7 lg:grid-cols-2">
            {can("records.write") ? <form className="space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
              if (!selectedPatient) throw new Error("Select a patient in the Patients tab first");
              if (record.title.trim().length < 2 || record.notes.trim().length < 3) throw new Error("Enter a record title and clinical note");
              const { error } = await db.from("patient_medical_records").insert({ patient_id: selectedPatient, record_type: record.recordType, title: record.title.trim(), clinician_notes: record.notes.trim(), recorded_by: user!.id });
              if (error) throw error;
              setRecord({ recordType: "history", title: "", notes: "" }); toast.success("Medical record saved"); refresh("clinic-medical-records");
            }); }}>
              <h2 className="text-lg font-semibold">Add a medical record</h2>
              <PatientChip id={selectedPatient} />
              <SelectField label="Record type" value={record.recordType} onChange={(v) => setRecord({ ...record, recordType: v })} options={["history","allergy","condition","procedure","immunization","other"]} />
              <Field label="Record title" value={record.title} onChange={(v) => setRecord({ ...record, title: v })} />
              <TextField label="Clinical notes (staff-only)" value={record.notes} onChange={(v) => setRecord({ ...record, notes: v })} />
              <Submit busy={busy}>Save record</Submit>
            </form> : <Notice>Read-only access to medical records.</Notice>}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Recent medical records</h2>
              {(recordsQuery.data ?? []).map((r: any) => <article key={r.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{r.title}</strong><span className="text-xs capitalize text-muted-foreground">{r.record_type}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{r.clinician_notes}</p><p className="mt-2 text-xs text-muted-foreground">Patient {r.patient_id} · {new Date(r.recorded_at).toLocaleString()}</p></article>)}
              {(recordsQuery.data ?? []).length === 0 ? <Notice>No records available.</Notice> : null}
            </div>
          </section>
        ) : null}

        {tab === "Consultations" ? (
          <section className="grid gap-6 py-7 lg:grid-cols-2">
            {can("encounters.write") ? <form className="space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
              if (!selectedPatient) throw new Error("Select a patient in the Patients tab first");
              if (encounter.complaint.trim().length < 3) throw new Error("Enter the patient's chief complaint");
              const { data, error } = await db.from("clinical_encounters").insert({ patient_id: selectedPatient, clinician_id: user!.id, department: encounter.department, chief_complaint: encounter.complaint.trim(), assessment: encounter.assessment.trim() || null, plan: encounter.plan.trim() || null, status: "draft" }).select("id").single();
              if (error) throw error;
              if (encounter.summary.trim()) {
                const { error: summaryError } = await db.from("patient_visit_summaries").insert({ patient_id: selectedPatient, encounter_id: data.id, summary: encounter.summary.trim(), care_plan: encounter.plan.trim() || null, follow_up_instructions: encounter.followUp.trim() || null, created_by: user!.id });
                if (summaryError) throw summaryError;
              }
              setEncounter({ department: "General Medicine", complaint: "", assessment: "", plan: "", summary: "", followUp: "" }); toast.success("Consultation saved as a draft"); refresh("clinic-encounters");
            }); }}>
              <h2 className="text-lg font-semibold">New consultation</h2><PatientChip id={selectedPatient} />
              <SelectField label="Department" value={encounter.department} onChange={(v) => setEncounter({ ...encounter, department: v })} options={["General Medicine","Dentistry","Gynecology","Internal Medicine","Other"]} />
              <TextField label="Chief complaint" value={encounter.complaint} onChange={(v) => setEncounter({ ...encounter, complaint: v })} />
              <TextField label="Clinical assessment (staff-only)" value={encounter.assessment} onChange={(v) => setEncounter({ ...encounter, assessment: v })} />
              <TextField label="Clinical plan (staff-only)" value={encounter.plan} onChange={(v) => setEncounter({ ...encounter, plan: v })} />
              <TextField label="Patient-facing visit summary (optional)" value={encounter.summary} onChange={(v) => setEncounter({ ...encounter, summary: v })} />
              <TextField label="Patient follow-up instructions (optional)" value={encounter.followUp} onChange={(v) => setEncounter({ ...encounter, followUp: v })} />
              <p className="text-xs text-muted-foreground">Clinical notes remain staff-only. Only the separate patient-facing summary is shown in the portal.</p>
              <Submit busy={busy}>Save draft consultation</Submit>
            </form> : <Notice>Read-only consultation access.</Notice>}
            <div className="space-y-3"><h2 className="text-lg font-semibold">Recent consultations</h2>
              {(encountersQuery.data ?? []).map((e: any) => <article key={e.id} className="rounded-xl border border-border bg-card p-4"><div className="flex justify-between gap-2"><strong>{e.department}</strong><span className="text-xs capitalize text-muted-foreground">{e.status}</span></div><p className="mt-2 text-sm">{e.chief_complaint}</p>{e.assessment ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{e.assessment}</p> : null}<p className="mt-2 break-all text-xs text-muted-foreground">Patient {e.patient_id} · {new Date(e.encounter_at).toLocaleString()}</p></article>)}
              {(encountersQuery.data ?? []).length === 0 ? <Notice>No consultations available.</Notice> : null}
            </div>
          </section>
        ) : null}

        {tab === "Prescriptions" ? (
          <section className="grid gap-6 py-7 lg:grid-cols-2">
            {can("prescriptions.write") ? <form className="space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
              if (!selectedPatient) throw new Error("Select a patient in the Patients tab first");
              if (!prescription.medication.trim() || !prescription.dosage.trim() || !prescription.frequency.trim()) throw new Error("Medication, dosage and frequency are required");
              const { error } = await db.from("prescriptions").insert({ patient_id: selectedPatient, prescribed_by: user!.id, medication_name: prescription.medication.trim(), strength: prescription.strength.trim() || null, dosage: prescription.dosage.trim(), route: prescription.route || null, frequency: prescription.frequency.trim(), duration: prescription.duration.trim() || null, instructions: prescription.instructions.trim() || null });
              if (error) throw error;
              setPrescription({ medication: "", strength: "", dosage: "", route: "Oral", frequency: "", duration: "", instructions: "" }); toast.success("Prescription saved"); refresh("clinic-prescriptions");
            }); }}>
              <h2 className="text-lg font-semibold">Create prescription</h2><PatientChip id={selectedPatient} />
              <Field label="Medication name" value={prescription.medication} onChange={(v) => setPrescription({ ...prescription, medication: v })} />
              <Field label="Strength" value={prescription.strength} onChange={(v) => setPrescription({ ...prescription, strength: v })} />
              <Field label="Dosage (as prescribed by clinician)" value={prescription.dosage} onChange={(v) => setPrescription({ ...prescription, dosage: v })} />
              <SelectField label="Route" value={prescription.route} onChange={(v) => setPrescription({ ...prescription, route: v })} options={["Oral","Topical","Inhaled","Injection","Other"]} />
              <Field label="Frequency" value={prescription.frequency} onChange={(v) => setPrescription({ ...prescription, frequency: v })} />
              <Field label="Duration" value={prescription.duration} onChange={(v) => setPrescription({ ...prescription, duration: v })} />
              <TextField label="Instructions" value={prescription.instructions} onChange={(v) => setPrescription({ ...prescription, instructions: v })} />
              <Submit busy={busy}>Save prescription</Submit>
            </form> : <Notice>Read-only prescription access.</Notice>}
            <div className="space-y-3"><h2 className="text-lg font-semibold">Recent prescriptions</h2>
              {(prescriptionsQuery.data ?? []).map((p: any) => <article key={p.id} className="rounded-xl border border-border bg-card p-4"><div className="flex justify-between gap-2"><strong>{p.medication_name} {p.strength ?? ""}</strong><span className="text-xs capitalize">{p.status}</span></div><p className="mt-2 text-sm">{p.dosage} · {p.route ?? "—"} · {p.frequency}</p><p className="text-sm text-muted-foreground">{p.duration ?? "Duration not entered"} {p.instructions ? "· " + p.instructions : ""}</p><p className="mt-2 break-all text-xs text-muted-foreground">Patient {p.patient_id}</p></article>)}
              {(prescriptionsQuery.data ?? []).length === 0 ? <Notice>No prescriptions available.</Notice> : null}
            </div>
          </section>
        ) : null}

        {tab === "Laboratory" ? (
          <section className="space-y-7 py-7">
            <div className="grid gap-6 lg:grid-cols-2">
              {can("lab.write") ? <form className="space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
                if (!selectedPatient || lab.testName.trim().length < 2) throw new Error("Select a patient and enter a test name");
                const { error } = await db.from("lab_orders").insert({ patient_id: selectedPatient, ordered_by: user!.id, test_name: lab.testName.trim(), priority: lab.priority, clinical_notes: lab.notes.trim() || null });
                if (error) throw error;
                setLab({ testName: "", priority: "routine", notes: "" }); toast.success("Laboratory order created"); refresh("clinic-lab-orders");
              }); }}>
                <h2 className="text-lg font-semibold">New laboratory order</h2><PatientChip id={selectedPatient} />
                <Field label="Test name" value={lab.testName} onChange={(v) => setLab({ ...lab, testName: v })} />
                <SelectField label="Priority" value={lab.priority} onChange={(v) => setLab({ ...lab, priority: v })} options={["routine","urgent"]} />
                <TextField label="Internal laboratory notes" value={lab.notes} onChange={(v) => setLab({ ...lab, notes: v })} />
                <Submit busy={busy}>Create order</Submit>
              </form> : <Notice>Read-only laboratory access.</Notice>}
              {can("lab.write") ? <form className="space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
                if (!result.orderId || result.summary.trim().length < 2) throw new Error("Select an order and enter a result summary");
                const order = (labOrdersQuery.data ?? []).find((x: any) => x.id === result.orderId);
                if (!order) throw new Error("The selected laboratory order was not found");
                const { error } = await db.from("lab_results").insert({ order_id: result.orderId, patient_id: order.patient_id, result_summary: result.summary.trim(), result_value: result.value.trim() || null, unit: result.unit.trim() || null, reference_range: result.range.trim() || null, interpretation: result.interpretation.trim() || null, is_verified: false, verified_by: null });
                if (error) throw error;
                await db.from("lab_orders").update({ status: "resulted" }).eq("id", result.orderId);
                setResult({ orderId: "", summary: "", value: "", unit: "", range: "", interpretation: "" }); toast.success("Result saved as unverified"); refresh("clinic-lab-results","clinic-lab-orders");
              }); }}>
                <h2 className="text-lg font-semibold">Enter laboratory result</h2>
                <SelectField label="Laboratory order" value={result.orderId} onChange={(v) => setResult({ ...result, orderId: v })} options={(labOrdersQuery.data ?? []).map((o: any) => ({ value: o.id, label: o.test_name + " · " + o.patient_id.slice(0,8) }))} />
                <Field label="Result name / summary" value={result.summary} onChange={(v) => setResult({ ...result, summary: v })} />
                <Field label="Result value" value={result.value} onChange={(v) => setResult({ ...result, value: v })} />
                <Field label="Unit" value={result.unit} onChange={(v) => setResult({ ...result, unit: v })} />
                <Field label="Reference range" value={result.range} onChange={(v) => setResult({ ...result, range: v })} />
                <TextField label="Interpretation (staff-entered)" value={result.interpretation} onChange={(v) => setResult({ ...result, interpretation: v })} />
                <p className="text-xs text-muted-foreground">New results are private until a qualified laboratory staff member verifies them.</p>
                <Submit busy={busy}>Save unverified result</Submit>
              </form> : null}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3"><h2 className="text-lg font-semibold">Laboratory orders</h2>
                {(labOrdersQuery.data ?? []).map((o: any) => <article key={o.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{o.test_name}</strong><span className="text-xs capitalize">{o.status} · {o.priority}</span></div><p className="mt-2 break-all text-xs text-muted-foreground">Patient {o.patient_id} · {new Date(o.ordered_at).toLocaleString()}</p></article>)}
                {(labOrdersQuery.data ?? []).length === 0 ? <Notice>No laboratory orders.</Notice> : null}
              </div>
              <div className="space-y-3"><h2 className="text-lg font-semibold">Results awaiting verification / released</h2>
                {(labResultsQuery.data ?? []).map((r: any) => <article key={r.id} className="rounded-xl border border-border bg-card p-4"><div className="flex justify-between gap-2"><strong>{r.result_summary}</strong><span className="text-xs">{r.is_verified ? "Verified" : "Awaiting verification"}</span></div><p className="mt-2 text-sm">{r.result_value ?? "—"} {r.unit ?? ""} {r.reference_range ? "· Range: " + r.reference_range : ""}</p><p className="break-all text-xs text-muted-foreground">Patient {r.patient_id}</p>{!r.is_verified && can("lab.write") ? <button onClick={() => void submit(async () => { const { error } = await db.from("lab_results").update({ is_verified: true, verified_by: user!.id, verified_at: new Date().toISOString() }).eq("id", r.id); if (error) throw error; toast.success("Result verified and released to the patient portal"); refresh("clinic-lab-results"); })} className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Verify and release</button> : null}</article>)}
                {(labResultsQuery.data ?? []).length === 0 ? <Notice>No results recorded.</Notice> : null}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "Billing" ? (
          <section className="space-y-7 py-7">
            {can("billing.write") ? <form className="max-w-2xl space-y-3 rounded-xl border border-border bg-card p-5" onSubmit={(e) => { e.preventDefault(); void submit(async () => {
              if (!selectedPatient || invoice.description.trim().length < 2) throw new Error("Select a patient and enter an invoice description");
              const amount = Number(invoice.amount); const discount = Number(invoice.discount || 0);
              if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(discount) || discount < 0 || discount > amount) throw new Error("Enter valid RWF amounts; discount cannot exceed the charge");
              const { data, error } = await db.from("invoices").insert({ patient_id: selectedPatient, currency: "RWF", subtotal: amount, discount, total: amount - discount, status: "draft", due_date: invoice.dueDate || null, created_by: user!.id }).select("id, invoice_number").single();
              if (error) throw error;
              const { error: itemError } = await db.from("invoice_items").insert({ invoice_id: data.id, patient_id: selectedPatient, description: invoice.description.trim(), quantity: 1, unit_price: amount });
              if (itemError) { await db.from("invoices").update({ status: "void" }).eq("id", data.id); throw itemError; }
              setInvoice({ description: "", amount: "", dueDate: "", discount: "0" }); toast.success("Draft invoice " + data.invoice_number + " created"); refresh("clinic-invoices");
            }); }}>
              <h2 className="text-lg font-semibold">Create draft invoice</h2><PatientChip id={selectedPatient} />
              <Field label="Charge description" value={invoice.description} onChange={(v) => setInvoice({ ...invoice, description: v })} />
              <Field label="Amount (RWF)" type="number" value={invoice.amount} onChange={(v) => setInvoice({ ...invoice, amount: v })} />
              <Field label="Discount (RWF)" type="number" value={invoice.discount} onChange={(v) => setInvoice({ ...invoice, discount: v })} />
              <Field label="Due date" type="date" value={invoice.dueDate} onChange={(v) => setInvoice({ ...invoice, dueDate: v })} />
              <Submit busy={busy}>Create draft invoice</Submit>
            </form> : null}
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <h2 className="p-4 text-lg font-semibold">Invoices</h2>
              <table className="w-full text-sm"><thead className="bg-secondary/60 text-left"><tr>{["Invoice","Patient ID","Total","Due","Status","Update"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>
                {(invoicesQuery.data ?? []).map((i: any) => <tr key={i.id} className="border-t border-border"><td className="px-3 py-2 font-mono">{i.invoice_number}</td><td className="px-3 py-2 font-mono text-xs">{i.patient_id.slice(0,8)}…</td><td className="px-3 py-2 tabular-nums">{Number(i.total).toLocaleString()} RWF</td><td className="px-3 py-2">{i.due_date ?? "—"}</td><td className="px-3 py-2 capitalize">{i.status}</td><td className="px-3 py-2">{can("billing.write") ? <select value={i.status} onChange={(e) => void submit(async () => { const { error } = await db.from("invoices").update({ status: e.target.value }).eq("id", i.id); if (error) throw error; refresh("clinic-invoices"); })} className="rounded-md border border-input bg-background px-2 py-1 text-xs">{["draft","issued","partial","paid","void"].map((s) => <option key={s}>{s}</option>)}</select> : "—"}</td></tr>)}
              </tbody></table>
              {(invoicesQuery.data ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">No invoices yet.</p> : null}
            </div>
            {can("claims.read") ? <div className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">Insurance claims</h2><div className="mt-3 space-y-2">{(claimsQuery.data ?? []).map((c: any) => <div key={c.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{c.insurer_name} · {c.claim_number || "No claim number"} · {Number(c.amount).toLocaleString()} RWF</span><span className="capitalize">{c.status}</span></div>)}{(claimsQuery.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No claims recorded.</p> : null}</div></div> : null}
          </section>
        ) : null}

        {tab === "Audit" ? <section className="py-7"><h2 className="text-xl font-semibold">Clinical audit activity</h2><p className="mt-1 text-sm text-muted-foreground">Metadata only: this log records who changed which record and when, not the medical note contents.</p><div className="mt-4 space-y-2">{(auditQuery.data ?? []).map((a: any) => <div key={a.id} className="rounded-lg border border-border bg-card p-3 text-sm"><span className="font-semibold">{a.action}</span> · {a.entity_name} · record {a.record_id}<p className="mt-1 text-xs text-muted-foreground">Actor {a.actor_id ?? "system"} · Patient {a.patient_id ?? "—"} · {new Date(a.occurred_at).toLocaleString()}</p></div>)}{(auditQuery.data ?? []).length === 0 ? <Notice>No audit events yet.</Notice> : null}</div></section> : null}
      </div>
    </SiteLayout>
  );
}

function PatientChip({ id }: { id: string }) {
  return <p className="rounded-md bg-secondary/60 p-2 text-xs text-muted-foreground">{id ? "Patient selected: " + id : "Choose a patient in the Patients tab before submitting."}</p>;
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>;
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span><textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: (string | { value: string; label: string })[] }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select…</option>{options.map((o) => { const v = typeof o === "string" ? o : o.value; const l = typeof o === "string" ? o : o.label; return <option key={v} value={v}>{l}</option>; })}</select></label>;
}
function Submit({ children, busy }: { children: React.ReactNode; busy: boolean }) {
  return <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : children}</button>;
}
function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">{children}</p>;
}
