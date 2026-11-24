import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Patient portal | Bella Vitae Medical Clinic" },
      { name: "description", content: "Private patient portal for appointments, visit summaries, prescriptions, verified laboratory results and invoices." },
    ],
  }),
  component: PatientPortalPage,
});

function PatientPortalPage() {
  const { user, loading } = useAuth();
  const db = supabase as any;

  const appointments = useQuery({
    enabled: !!user,
    queryKey: ["portal-appointments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments")
        .select("id, code, requested_date, requested_time, doctor, status")
        .eq("user_id", user!.id).order("requested_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const summaries = useQuery({
    enabled: !!user,
    queryKey: ["portal-summaries", user?.id],
    queryFn: async () => {
      const { data, error } = await db.from("patient_visit_summaries")
        .select("id, summary, care_plan, follow_up_instructions, published_at")
        .eq("patient_id", user!.id).order("published_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const prescriptions = useQuery({
    enabled: !!user,
    queryKey: ["portal-prescriptions", user?.id],
    queryFn: async () => {
      const { data, error } = await db.from("prescriptions")
        .select("id, medication_name, strength, dosage, route, frequency, duration, instructions, status, prescribed_at")
        .eq("patient_id", user!.id).order("prescribed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const results = useQuery({
    enabled: !!user,
    queryKey: ["portal-lab-results", user?.id],
    queryFn: async () => {
      const { data, error } = await db.from("lab_results")
        .select("id, result_summary, result_value, unit, reference_range, interpretation, verified_at")
        .eq("patient_id", user!.id).eq("is_verified", true).order("verified_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const invoices = useQuery({
    enabled: !!user,
    queryKey: ["portal-invoices", user?.id],
    queryFn: async () => {
      const { data, error } = await db.from("invoices")
        .select("id, invoice_number, currency, subtotal, discount, total, status, due_date, created_at")
        .eq("patient_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loading) return <SiteLayout><p className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Loading your portal…</p></SiteLayout>;
  if (!user) return (
    <SiteLayout>
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-primary">Your patient portal</h1>
        <p className="mt-3 text-muted-foreground">Sign in to view information that the clinic has securely linked to your account.</p>
        <Link to="/auth" className="mt-6 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Sign in</Link>
      </div>
    </SiteLayout>
  );

  const busy = [appointments, summaries, prescriptions, results, invoices].some((q) => q.isLoading);
  const error = [appointments, summaries, prescriptions, results, invoices].find((q) => q.error)?.error;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Bella Vitae · Private access</p>
            <h1 className="mt-2 text-3xl font-bold text-primary">Patient portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
          </div>
          <Link to="/account" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">Manage account</Link>
        </div>
        {error ? <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Some portal information could not be loaded. Please refresh or contact the clinic.</p> : null}
        {busy ? <p className="mt-6 text-sm text-muted-foreground">Loading your information…</p> : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Appointments" count={appointments.data?.length ?? 0} />
          <SummaryCard label="Visit summaries" count={summaries.data?.length ?? 0} />
          <SummaryCard label="Prescriptions" count={prescriptions.data?.length ?? 0} />
          <SummaryCard label="Verified lab results" count={results.data?.length ?? 0} />
        </div>

        <section className="mt-10">
          <SectionTitle title="My appointments" subtitle="Appointments connected to this signed-in account." />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(appointments.data ?? []).map((a: any) => (
              <article key={a.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{a.doctor}</p><Status value={a.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{a.requested_date} · {a.requested_time}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Booking code: {a.code ?? "—"}</p>
              </article>
            ))}
            {(appointments.data ?? []).length === 0 ? <Empty>No appointments are linked to this account yet. You can still use the booking code lookup on My appointments.</Empty> : null}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle title="Visit summaries" subtitle="Patient-facing summaries published by your care team." />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(summaries.data ?? []).map((s: any) => (
              <article key={s.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{new Date(s.published_at).toLocaleString()}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{s.summary}</p>
                {s.care_plan ? <div className="mt-3"><p className="text-xs font-semibold uppercase text-primary">Care plan</p><p className="mt-1 whitespace-pre-wrap text-sm">{s.care_plan}</p></div> : null}
                {s.follow_up_instructions ? <div className="mt-3"><p className="text-xs font-semibold uppercase text-primary">Follow-up</p><p className="mt-1 whitespace-pre-wrap text-sm">{s.follow_up_instructions}</p></div> : null}
              </article>
            ))}
            {(summaries.data ?? []).length === 0 ? <Empty>Your care team has not published a visit summary to this portal yet.</Empty> : null}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle title="Prescriptions" subtitle="Medication instructions entered by your clinician. Contact the clinic if anything is unclear." />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(prescriptions.data ?? []).map((p: any) => (
              <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold">{p.medication_name} {p.strength ?? ""}</p><Status value={p.status} /></div>
                <p className="mt-2 text-sm">Dosage: {p.dosage}</p>
                <p className="text-sm">Route: {p.route || "Not specified"} · Frequency: {p.frequency}</p>
                {p.duration ? <p className="text-sm">Duration: {p.duration}</p> : null}
                {p.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.instructions}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">{new Date(p.prescribed_at).toLocaleDateString()}</p>
              </article>
            ))}
            {(prescriptions.data ?? []).length === 0 ? <Empty>No prescriptions are available in your portal.</Empty> : null}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle title="Laboratory results" subtitle="Only results verified by the clinic laboratory are shown here." />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(results.data ?? []).map((r: any) => (
              <article key={r.id} className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold">{r.result_summary}</p>
                {r.result_value ? <p className="mt-2 text-sm">Result: {r.result_value} {r.unit ?? ""}</p> : null}
                {r.reference_range ? <p className="text-sm text-muted-foreground">Reference range: {r.reference_range}</p> : null}
                {r.interpretation ? <p className="mt-2 whitespace-pre-wrap text-sm">{r.interpretation}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">Verified {r.verified_at ? new Date(r.verified_at).toLocaleString() : ""}</p>
              </article>
            ))}
            {(results.data ?? []).length === 0 ? <Empty>No verified laboratory results are available yet.</Empty> : null}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle title="Invoices" subtitle="Clinic charges are shown in Rwandan francs (RWF)." />
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left"><tr>{["Invoice","Date","Due date","Total","Status"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {(invoices.data ?? []).map((i: any) => <tr key={i.id} className="border-t border-border"><td className="px-4 py-3 font-mono">{i.invoice_number}</td><td className="px-4 py-3">{new Date(i.created_at).toLocaleDateString()}</td><td className="px-4 py-3">{i.due_date ?? "—"}</td><td className="px-4 py-3 tabular-nums">{Number(i.total).toLocaleString()} {i.currency}</td><td className="px-4 py-3"><Status value={i.status} /></td></tr>)}
              </tbody>
            </table>
            {(invoices.data ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">No invoices are available.</p> : null}
          </div>
        </section>
        <p className="mt-10 rounded-xl bg-secondary/60 p-4 text-xs text-muted-foreground">This portal displays information entered and released by Bella Vitae staff. It is not an emergency service. For urgent concerns, contact the clinic directly.</p>
      </div>
    </SiteLayout>
  );
}

function SummaryCard({ label, count }: { label: string; count: number }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{count}</p></div>;
}
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">{children}</p>;
}
function Status({ value }: { value: string }) {
  return <span className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize">{value.replaceAll("_", " ")}</span>;
}
