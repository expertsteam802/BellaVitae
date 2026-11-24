import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarClock,
  Clock,
  IdCard,
  Phone,
  RefreshCw,
  Search,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { TIME_SLOTS } from "@/lib/clinic";

export const Route = createFileRoute("/my-appointments")({
  head: () => ({
    meta: [
      { title: "My appointments | Bella Vitae Medical Clinic" },
      {
        name: "description",
        content: "Find one of your Bella Vitae appointments using its appointment code and booking phone number.",
      },
      { property: "og:title", content: "My appointments | Bella Vitae Medical Clinic" },
      {
        property: "og:description",
        content: "Look up, reschedule or cancel an appointment using your appointment code and phone number.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyAppointmentsPage,
});

type PatientAppointment = {
  code: string;
  patient_name: string;
  phone: string;
  doctor: string;
  insurance: string;
  insurance_card: string | null;
  requested_date: string;
  requested_time: string;
  reason: string | null;
  status: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  rescheduled_at: string | null;
  previous_date: string | null;
  previous_time: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "border-accent/40 bg-accent/20 text-accent-foreground",
  confirmed: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-border bg-muted text-muted-foreground",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatStamp(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function MyAppointmentsPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [appointment, setAppointment] = useState<PatientAppointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"none" | "cancel" | "reschedule">("none");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0] ?? "07:00");

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 8) {
      toast.error("Enter the phone number used when booking");
      return;
    }
    if (code.trim().length < 4) {
      toast.error("Enter your appointment code");
      return;
    }

    setBusy(true);
    setAppointment(null);
    setPanel("none");
    try {
      const { data, error } = await supabase.rpc(
        "get_appointment_by_code_and_phone" as never,
        { _code: code.trim().toUpperCase(), _phone: phone.trim() } as never,
      );
      if (error) throw error;
      const row = (data as unknown as PatientAppointment[] | null)?.[0] ?? null;
      if (!row) {
        toast.error("No appointment matched that code and phone number");
        return;
      }
      setAppointment(row);
      setDate(row.requested_date);
      setTime(row.requested_time);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not find this appointment");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!appointment) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "cancel_appointment_by_code_and_phone" as never,
        {
          _code: appointment.code,
          _phone: phone.trim(),
          _reason: reason,
        } as never,
      );
      if (error) throw error;
      if (data === true) {
        toast.success("Appointment cancelled");
        await refreshAppointment();
      } else {
        toast.error("This appointment can no longer be cancelled. Please contact the clinic.");
      }
      setPanel("none");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this appointment");
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    if (!appointment) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "reschedule_appointment_by_code_and_phone" as never,
        {
          _code: appointment.code,
          _phone: phone.trim(),
          _date: date,
          _time: time,
        } as never,
      );
      if (error) throw error;
      if (data === true) {
        toast.success("Appointment rescheduled");
        await refreshAppointment();
      } else {
        toast.error("This appointment can no longer be changed. Please contact the clinic.");
      }
      setPanel("none");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reschedule this appointment");
    } finally {
      setBusy(false);
    }
  };

  const refreshAppointment = async () => {
    if (!appointment) return;
    const { data, error } = await supabase.rpc(
      "get_appointment_by_code_and_phone" as never,
      { _code: appointment.code, _phone: phone.trim() } as never,
    );
    if (error) throw error;
    setAppointment((data as unknown as PatientAppointment[] | null)?.[0] ?? null);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <SiteLayout>
      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        <h1 className="text-3xl font-bold text-primary md:text-4xl">My appointments</h1>
        <p className="mt-3 text-muted-foreground">
          Enter the appointment code you received when booking and the phone number used for that booking.
          You can look up, reschedule or cancel that appointment without an OTP.
        </p>

        <form
          onSubmit={lookup}
          className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Appointment code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BV-XXXXXXXX"
              maxLength={20}
              autoComplete="off"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Booking phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              autoComplete="tel"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-end justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Search className="size-4" aria-hidden="true" />
            {busy ? "Checking…" : "Find appointment"}
          </button>
        </form>

        {appointment ? (
          <div className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold tracking-wider text-primary">{appointment.code}</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{appointment.patient_name}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[appointment.status] ?? "border-border bg-muted text-muted-foreground"}`}>
                {STATUS_LABEL[appointment.status] ?? appointment.status}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail icon={Stethoscope} label="Doctor" value={appointment.doctor} />
              <Detail icon={CalendarCheck} label="Date" value={formatDate(appointment.requested_date)} />
              <Detail icon={Clock} label="Time" value={appointment.requested_time} />
              <Detail icon={Phone} label="Phone" value={appointment.phone} />
              <Detail
                icon={IdCard}
                label="Insurance"
                value={appointment.insurance + (appointment.insurance_card ? ` · ${appointment.insurance_card}` : "")}
              />
              <Detail icon={CalendarClock} label="Booked on" value={formatStamp(appointment.created_at) ?? "—"} />
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Reason for visit: </span>
              {appointment.reason?.trim() ? appointment.reason : "Not specified"}
            </p>

            {appointment.rescheduled_at && appointment.previous_date ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Rescheduled on {formatStamp(appointment.rescheduled_at)} — previously {formatDate(appointment.previous_date)} at {appointment.previous_time}.
              </p>
            ) : null}

            {appointment.status === "cancelled" ? (
              <p className="mt-2 text-sm text-destructive">
                Cancelled {formatStamp(appointment.cancelled_at) ? `on ${formatStamp(appointment.cancelled_at)}` : ""}
                {appointment.cancellation_reason ? ` — reason: ${appointment.cancellation_reason}` : ""}
              </p>
            ) : null}

            {appointment.status !== "cancelled" && appointment.status !== "completed" && appointment.requested_date >= today ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPanel(panel === "reschedule" ? "none" : "reschedule")}
                  className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => setPanel(panel === "cancel" ? "none" : "cancel")}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="size-4" aria-hidden="true" />
                  Cancel
                </button>
              </div>
            ) : null}

            {panel === "reschedule" ? (
              <form
                className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4"
                onSubmit={(e) => { e.preventDefault(); void reschedule(); }}
              >
                <p className="text-sm font-medium text-foreground">Choose a new date and time</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="date"
                    min={today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="New date"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="New time"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {TIME_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Confirm new time"}
                </button>
              </form>
            ) : null}

            {panel === "cancel" ? (
              <form
                className="mt-4 space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
                onSubmit={(e) => { e.preventDefault(); void cancel(); }}
              >
                <label className="block text-sm font-medium text-foreground">
                  Reason for cancelling <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Reason for cancellation"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  {busy ? "Cancelling…" : "Confirm cancellation"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </SiteLayout>
  );
}
