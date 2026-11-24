import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createWorker } from "@/lib/admin.functions";
import { listAdministrators, assignAdministrator, revokeAdministrator } from "@/lib/admin-roles.functions";
import { listWorkers, deleteWorker } from "@/lib/staff.functions";
import { sendTestNotification } from "@/lib/status.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin panel | Bella Vitae Medical Clinic" },
      {
        name: "description",
        content: "Manage contacts, staff accounts, appointments and news for Bella Vitae Medical Clinic.",
      },
      { property: "og:title", content: "Admin panel | Bella Vitae Medical Clinic" },
      { property: "og:description", content: "Internal management area for clinic administrators." },
    ],
  }),
  component: AdminPage,
});

const TABS = ["Appointments", "Messages", "Contacts", "Insurances", "Workers", "News", "Team", "Administrators", "Access", "Settings"] as const;
type Tab = (typeof TABS)[number];

function AdminPage() {
  const { loading, isAdmin, isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>("Appointments");

  if (loading) {
    return (
      <SiteLayout>
        <p className="mx-auto max-w-6xl px-4 py-16 text-muted-foreground">Loading…</p>
      </SiteLayout>
    );
  }

  if (!isStaff) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-primary">Restricted area</h1>
          <p className="mt-2 text-muted-foreground">
            This panel is reserved for clinic staff and administrators.
          </p>
          <Link to="/auth" className="mt-4 inline-block text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </SiteLayout>
    );
  }

  const visibleTabs = isAdmin ? TABS : (["Appointments", "Messages", "News"] as const);

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold text-primary">{isAdmin ? "Admin panel" : "Staff panel"}</h1>
        <div className="mt-6 flex flex-wrap gap-2 border-b border-border">
          {visibleTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium ${
                tab === t ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="py-8">
          {tab === "Appointments" ? <AppointmentsTab /> : null}
          {tab === "Messages" ? <MessagesTab isAdmin={isAdmin} /> : null}
          {tab === "Contacts" && isAdmin ? <ContactsTab /> : null}
          {tab === "Insurances" && isAdmin ? <InsurancesTab /> : null}
          {tab === "Workers" && isAdmin ? <WorkersTab /> : null}
          {tab === "News" ? <NewsTab /> : null}
          {tab === "Team" && isAdmin ? <TeamTab /> : null}
          {tab === "Administrators" && isAdmin ? <AdministratorsTab /> : null}
          {tab === "Access" && isAdmin ? <StaffAccessTab /> : null}
          {tab === "Settings" && isAdmin ? <SettingsTab /> : null}
        </div>
      </div>
    </SiteLayout>
  );
}

function AppointmentsTab() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin_appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("requested_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin_appointments"] });
  };

  const remove = async (id: string, code: string | null) => {
    if (!window.confirm(`Delete appointment ${code ?? ""}? This cannot be undone.`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Appointment deleted");
    qc.invalidateQueries({ queryKey: ["admin_appointments"] });
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left">
          <tr>
            {["Code", "Patient", "Phone", "Insurance", "Doctor", "When", "Status", "", ""].map((h, i) => (
              <th key={`${h}-${i}`} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((a) => (
            <tr key={a.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono">{a.code}</td>
              <td className="px-3 py-2">{a.patient_name}</td>
              <td className="px-3 py-2">{a.phone}</td>
              <td className="px-3 py-2">{a.insurance}{a.insurance_card ? ` · ${a.insurance_card}` : ""}</td>
              <td className="px-3 py-2">{a.doctor}</td>
              <td className="px-3 py-2">{a.requested_date} {a.requested_time}</td>
              <td className="px-3 py-2">{a.status}</td>
              <td className="px-3 py-2">
                <select
                  value={a.status}
                  onChange={(e) => setStatus(a.id, e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {["pending", "confirmed", "completed", "cancelled"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                {isAdmin ? (
                  <button
                    onClick={() => remove(a.id, a.code)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Delete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data ?? []).length === 0 ? (
        <p className="p-4 text-muted-foreground">No appointments yet.</p>
      ) : null}
    </div>
  );
}

function InsurancesTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data } = useQuery({
    queryKey: ["admin_insurances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insurances")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin_insurances"] });
    qc.invalidateQueries({ queryKey: ["insurances"] });
  };

  const add = async () => {
    if (name.trim().length < 2) {
      toast.error("Enter the insurance name");
      return;
    }
    const { error } = await supabase.from("insurances").insert({
      name: name.trim().toUpperCase(),
      sort_order: (data?.length ?? 0) + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    toast.success("Insurance added");
    refresh();
  };

  const rename = async (id: string, value: string) => {
    const { error } = await supabase.from("insurances").update({ name: value }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Insurance updated");
    refresh();
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("insurances").update({ active }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Remove ${label} from the accepted insurances?`)) return;
    const { error } = await supabase.from("insurances").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Add an insurance</h2>
        <p className="text-sm text-muted-foreground">
          Insurances listed here appear on the homepage and in the booking form.
        </p>
        <Field label="Insurance name" value={name} onChange={setName} />
        <button
          onClick={add}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Add insurance
        </button>
      </div>
      <div className="space-y-3">
        {(data ?? []).map((i) => (
          <InsuranceRow
            key={i.id}
            insurance={i}
            onRename={rename}
            onToggle={toggle}
            onRemove={remove}
          />
        ))}
        {(data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No insurances yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function InsuranceRow({
  insurance,
  onRename,
  onToggle,
  onRemove,
}: {
  insurance: { id: string; name: string; active: boolean };
  onRename: (id: string, value: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onRemove: (id: string, label: string) => void;
}) {
  const [value, setValue] = useState(insurance.name);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={insurance.active}
          onChange={(e) => onToggle(insurance.id, e.target.checked)}
        />
        Accepted
      </label>
      <button
        onClick={() => onRename(insurance.id, value.trim())}
        className="rounded-md bg-secondary px-3 py-2 text-xs font-medium"
      >
        Save
      </button>
      <button
        onClick={() => onRemove(insurance.id, insurance.name)}
        className="text-xs text-destructive hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

function ContactsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["clinic_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinic_contacts").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const save = async (id: string, values: { label: string; phone: string; email: string }) => {
    const { error } = await supabase.from("clinic_contacts").update(values).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contact updated");
    qc.invalidateQueries({ queryKey: ["clinic_contacts"] });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(data ?? []).map((c) => (
        <ContactCard key={c.id} contact={c} onSave={save} />
      ))}
    </div>
  );
}

function MessagesTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin_messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("contact_messages")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin_messages"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin_messages"] });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Messages sent from the “Contact us” form arrive here — nothing is sent by email.
      </p>
      {(data ?? []).map((m) => (
        <div key={m.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{m.subject}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                m.status === "new" ? "bg-accent/20 text-accent-foreground" : "bg-secondary"
              }`}
            >
              {m.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            From {m.sender_name}
            {m.sender_phone ? ` · ${m.sender_phone}` : ""}
            {m.sender_email ? ` · ${m.sender_email}` : ""} · to {m.to_label ?? "Reception"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
          <div className="mt-2 flex gap-4">
            {m.status === "new" ? (
              <button onClick={() => markRead(m.id)} className="text-xs text-primary hover:underline">
                Mark as read
              </button>
            ) : null}
            {isAdmin ? (
              <button onClick={() => remove(m.id)} className="text-xs text-destructive hover:underline">
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      ) : null}
    </div>
  );
}

function ContactCard({
  contact,
  onSave,
}: {
  contact: { id: string; label: string; phone: string; email: string };
  onSave: (id: string, v: { label: string; phone: string; email: string }) => void;
}) {
  const [label, setLabel] = useState(contact.label);
  const [phone, setPhone] = useState(contact.phone);
  const [email, setEmail] = useState(contact.email);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <Field label="Label" value={label} onChange={setLabel} />
      <Field label="Phone" value={phone} onChange={setPhone} />
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <button
        onClick={() => onSave(contact.id, { label, phone, email })}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Save
      </button>
    </div>
  );
}

function WorkersTab() {
  const register = useServerFn(createWorker);
  const fetchWorkers = useServerFn(listWorkers);
  const removeWorker = useServerFn(deleteWorker);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    specialty: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: workers } = useQuery({
    queryKey: ["admin_workers"],
    queryFn: async () => (await fetchWorkers({ data: undefined })).workers,
  });

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete the account of ${name}? This cannot be undone.`)) return;
    try {
      await removeWorker({ data: { userId: id } });
      toast.success("Worker deleted");
      qc.invalidateQueries({ queryKey: ["admin_workers"] });
      qc.invalidateQueries({ queryKey: ["staff_members"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the worker");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ data: { ...form, addToTeam: true } });
      toast.success(`Worker account created for ${form.email}`);
      setForm({ fullName: "", email: "", password: "", phone: "", specialty: "" });
      qc.invalidateQueries({ queryKey: ["admin_workers"] });
      qc.invalidateQueries({ queryKey: ["staff_members"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the worker");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
      <h2 className="text-lg font-semibold">Register a worker</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create login credentials for a staff member. They can change their name, phone and password
        themselves from “My account”.
      </p>
      <p className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
        Give the worker the work email and temporary password below. They sign in at{" "}
        <strong>/auth</strong> and land on their own <strong>/dashboard</strong>, where they see
        their messages and appointments and can change their password.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
        <Field label="Full name" value={form.fullName} onChange={(v) => set("fullName", v)} required />
        <Field label="Specialty / job title" value={form.specialty} onChange={(v) => set("specialty", v)} required />
        <Field label="Work email" type="email" value={form.email} onChange={(v) => set("email", v)} required />
        <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
        <Field
          label="Temporary password (min. 8 characters)"
          type="password"
          value={form.password}
          onChange={(v) => set("password", v)}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create worker account"}
        </button>
      </form>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Registered workers</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left">
              <tr>
                {["Name", "Specialty", "Phone", "Email", "Role", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(workers ?? []).map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-3 py-2">{w.fullName || "—"}</td>
                  <td className="px-3 py-2">{w.specialty || "—"}</td>
                  <td className="px-3 py-2">{w.phone || "—"}</td>
                  <td className="px-3 py-2">{w.email}</td>
                  <td className="px-3 py-2">{w.role}</td>
                  <td className="px-3 py-2">
                    {w.role === "admin" ? null : (
                      <button
                        onClick={() => onDelete(w.id, w.fullName || w.email)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(workers ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No workers registered yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NewsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data } = useQuery({
    queryKey: ["admin_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const publish = async () => {
    if (title.trim().length < 3 || body.trim().length < 5) {
      toast.error("Add a title and a message");
      return;
    }
    const { error } = await supabase.from("posts").insert({
      title: title.trim(),
      body: body.trim(),
      image_url: imageUrl.trim() || null,
      author_id: user?.id ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setBody("");
    setImageUrl("");
    toast.success("Published");
    qc.invalidateQueries({ queryKey: ["admin_posts"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin_posts"] });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">New post</h2>
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Image URL (optional)" value={imageUrl} onChange={setImageUrl} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={publish}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Publish
        </button>
      </div>
      <div className="space-y-3">
        {(data ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">{p.title}</h3>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.body}</p>
            <button onClick={() => remove(p.id)} className="mt-2 text-xs text-destructive hover:underline">
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [phones, setPhones] = useState("");

  const { data } = useQuery({
    queryKey: ["staff_members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_members").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const add = async () => {
    if (fullName.trim().length < 2 || specialty.trim().length < 2) {
      toast.error("Name and specialty are required");
      return;
    }
    const { error } = await supabase.from("staff_members").insert({
      full_name: fullName.trim(),
      specialty: specialty.trim(),
      phones: phones.trim() || null,
      sort_order: (data?.length ?? 0) + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setFullName("");
    setSpecialty("");
    setPhones("");
    qc.invalidateQueries({ queryKey: ["staff_members"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("staff_members").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["staff_members"] });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Add a team member</h2>
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field label="Specialty" value={specialty} onChange={setSpecialty} />
        <Field label="Phone(s)" value={phones} onChange={setPhones} />
        <button onClick={add} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Add
        </button>
      </div>
      <div className="space-y-3">
        {(data ?? []).map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-4">
            <p className="font-semibold">{m.full_name}</p>
            <p className="text-sm text-muted-foreground">{m.specialty}</p>
            {m.phones ? <p className="text-sm text-muted-foreground">{m.phones}</p> : null}
            <button onClick={() => remove(m.id)} className="mt-2 text-xs text-destructive hover:underline">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const sendTest = useServerFn(sendTestNotification);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data } = useQuery({
    queryKey: ["clinic_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (data && !loaded) {
    setLoaded(true);
    setEmail(data.notification_email ?? "");
  }

  const save = async () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Please enter a valid email address");
      return;
    }
    const { error } = data
      ? await supabase.from("clinic_settings").update({ notification_email: value }).eq("id", data.id)
      : await supabase.from("clinic_settings").insert({ notification_email: value });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Notification email saved");
    qc.invalidateQueries({ queryKey: ["clinic_settings"] });
  };

  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Appointment notifications</h2>
      <p className="text-sm text-muted-foreground">
        Every new online booking is emailed to this address with the full patient details and the
        appointment code.
      </p>
      <Field label="Notification email" type="email" value={email} onChange={setEmail} />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Save
        </button>
        <button
          onClick={async () => {
            try {
              const r = await sendTest();
              if (r.sent) toast.success("Test email sent — check the inbox");
              else toast.warning(r.error ?? "Test email could not be sent");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not send test email");
            }
          }}
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
        >
          Send test email
        </button>
      </div>
    </div>
  );
}



function StaffAccessTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const db = supabase as any;
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const permissionOptions = [
    ["patients.read", "Patient directory"],
    ["records.read", "Read medical records"],
    ["records.write", "Write medical records"],
    ["encounters.read", "Read consultations"],
    ["encounters.write", "Create consultations and visit summaries"],
    ["prescriptions.read", "Read prescriptions"],
    ["prescriptions.write", "Create prescriptions"],
    ["lab.read", "Read laboratory work"],
    ["lab.write", "Manage laboratory work and verify results"],
    ["billing.read", "Read invoices"],
    ["billing.write", "Create and update invoices"],
    ["claims.read", "Read insurance claims"],
    ["claims.write", "Manage insurance claims"],
    ["documents.read", "Read patient document metadata"],
    ["documents.write", "Register patient documents"],
    ["audit.read", "Review audit activity"],
  ] as const;

  const { data, isLoading } = useQuery({
    queryKey: ["clinic_staff_access"],
    queryFn: async () => {
      const { data: roles, error: roleError } = await supabase.from("user_roles").select("user_id").eq("role", "staff");
      if (roleError) throw roleError;
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      const [{ data: profiles, error: profileError }, { data: grants, error: grantsError }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, specialty").in("id", ids),
        db.from("staff_permissions").select("user_id, permission").in("user_id", ids),
      ]);
      if (profileError) throw profileError;
      if (grantsError) throw grantsError;
      return (profiles ?? []).map((profile) => ({
        ...profile,
        permissions: (grants ?? []).filter((grant: { user_id: string }) => grant.user_id === profile.id).map((grant: { permission: string }) => grant.permission),
      })).sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
    },
  });

  const toggle = async (staffId: string, permission: string, enabled: boolean) => {
    setBusyUser(staffId);
    try {
      const result = enabled
        ? await db.from("staff_permissions").insert({ user_id: staffId, permission, granted_by: user?.id })
        : await db.from("staff_permissions").delete().eq("user_id", staffId).eq("permission", permission);
      if (result.error) throw result.error;
      toast.success(enabled ? "Permission granted" : "Permission removed");
      qc.invalidateQueries({ queryKey: ["clinic_staff_access"] });
      qc.invalidateQueries({ queryKey: ["my-clinic-permissions"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update staff permissions");
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Staff access control</h2>
        <p className="mt-1 text-sm text-muted-foreground">Grant only the permissions required for each person's job. Administrators retain full access. Staff receive no clinical or billing permissions by default.</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading staff accounts…</p> : null}
      {(data ?? []).map((staff) => (
        <details key={staff.id} className="rounded-xl border border-border bg-card p-4">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
            <span><strong>{staff.full_name || staff.email || "Staff account"}</strong><span className="ml-2 text-sm text-muted-foreground">{staff.specialty || ""}</span><span className="mt-1 block text-xs text-muted-foreground">{staff.email}</span></span>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs">{staff.permissions.length} permissions</span>
          </summary>
          <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
            {permissionOptions.map(([permission, label]) => {
              const checked = staff.permissions.includes(permission);
              return (
                <label key={permission} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-secondary/60">
                  <input type="checkbox" checked={checked} disabled={busyUser === staff.id} onChange={(e) => void toggle(staff.id, permission, e.target.checked)} className="mt-0.5" />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </details>
      ))}
      {!isLoading && (data ?? []).length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No staff accounts found. Register staff members in the Workers tab first.</p> : null}
    </div>
  );
}

function AdministratorsTab() {
  const fetchAdmins = useServerFn(listAdministrators);
  const assignAdmin = useServerFn(assignAdministrator);
  const revokeAdmin = useServerFn(revokeAdministrator);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["clinic_administrators"],
    queryFn: async () => (await fetchAdmins({ data: undefined })).administrators,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await assignAdmin({ data: { email: email.trim().toLowerCase() } });
      toast.success("Administrator access granted");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["clinic_administrators"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign administrator access");
    } finally { setBusy(false); }
  };

  const remove = async (id: string, targetEmail: string) => {
    if (!window.confirm(`Remove administrator access from ${targetEmail}?`)) return;
    setBusy(true);
    try {
      await revokeAdmin({ data: { userId: id } });
      toast.success("Administrator access removed");
      qc.invalidateQueries({ queryKey: ["clinic_administrators"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove administrator access");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Assign an administrator</h2>
        <p className="text-sm text-muted-foreground">
          Enter the email address of an existing Bella Vitae account. The person must register and sign in at least once before you can grant access.
        </p>
        <Field label="Account email" type="email" value={email} onChange={setEmail} required />
        <button type="submit" disabled={busy || !email.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Please wait…" : "Grant admin access"}
        </button>
      </form>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Administrators</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading administrators…</p> : null}
        {(data ?? []).map((admin) => (
          <div key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div>
              <p className="font-semibold">{admin.fullName || admin.email}</p>
              <p className="text-sm text-muted-foreground">{admin.email}</p>
              {admin.protected ? <p className="mt-1 text-xs text-primary">Initial clinic administrator</p> : null}
            </div>
            {!admin.protected ? (
              <button type="button" disabled={busy} onClick={() => remove(admin.id, admin.email)} className="text-sm text-destructive hover:underline disabled:opacity-60">
                Remove access
              </button>
            ) : null}
          </div>
        ))}
        {!isLoading && (data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No administrator accounts are registered yet.</p> : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}