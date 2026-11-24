import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const accessSchema = z.object({
  code: z.string().trim().min(4).max(20),
  phone: z.string().trim().min(8).max(40),
});

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function findAppointment(code: string, phone: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("id, code, patient_name, phone, doctor, insurance, insurance_card, requested_date, requested_time, reason, status, cancellation_reason, cancelled_at, rescheduled_at, previous_date, previous_time, created_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw new Error("Could not look up this appointment");
  if (!data || normalizePhone(data.phone) !== normalizePhone(phone)) return null;
  return data;
}

export const lookupAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accessSchema.parse(data))
  .handler(async ({ data }) => {
    return findAppointment(data.code, data.phone);
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    accessSchema.extend({ reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const appointment = await findAppointment(data.code, data.phone);
    if (!appointment) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (
      appointment.requested_date < today ||
      appointment.status === "cancelled" ||
      appointment.status === "completed"
    ) return false;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: data.reason?.trim() || null,
      })
      .eq("id", appointment.id)
      .eq("status", appointment.status)
      .gte("requested_date", today)
      .select("id")
      .maybeSingle();

    if (error) throw new Error("Could not cancel this appointment");
    return Boolean(updated);
  });

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    accessSchema.extend({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const today = new Date().toISOString().slice(0, 10);
    if (data.date < today) throw new Error("Please choose today or a future date");
    if (data.time < "07:00" || data.time > "23:00") {
      throw new Error("The clinic is open from 07:00 to 23:00");
    }

    const appointment = await findAppointment(data.code, data.phone);
    if (
      !appointment ||
      appointment.requested_date < today ||
      appointment.status === "cancelled" ||
      appointment.status === "completed"
    ) return false;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("appointments")
      .update({
        previous_date: appointment.requested_date,
        previous_time: appointment.requested_time,
        requested_date: data.date,
        requested_time: data.time,
        rescheduled_at: new Date().toISOString(),
        status: "pending",
      })
      .eq("id", appointment.id)
      .eq("status", appointment.status)
      .gte("requested_date", today)
      .select("id")
      .maybeSingle();

    if (error) throw new Error("Could not reschedule this appointment");

    if (updated) {
      await supabaseAdmin
        .from("appointment_reminders")
        .delete()
        .eq("appointment_id", appointment.id)
        .neq("status", "sent");
    }

    return Boolean(updated);
  });
