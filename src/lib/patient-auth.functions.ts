import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("250") ? digits : digits.startsWith("0") ? "250" + digits.slice(1) : "250" + digits;
  if (!/^2507\d{8}$/.test(national)) {
    throw new Error("Enter a valid Rwanda mobile number, for example 0788 123 456.");
  }
  return { phone: "+" + national, email: national + "@patients.bellavitae.invalid" };
}

/** Public patient registration. Creates a patient-only Supabase Auth account; PIN is hashed by Auth. */
export const registerPatientAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(9).max(24),
    network: z.enum(["airtel", "mtn"]),
    pin: z.string().regex(/^\d{6,12}$/, "PIN must contain 6 to 12 digits."),
  }).parse(input))
  .handler(async ({ data }) => {
    const { phone, email } = normalizePhone(data.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("patient_auth_identities")
      .select("user_id")
      .eq("phone_e164", phone)
      .maybeSingle();
    if (existing) throw new Error("An account already exists for this phone number. Choose patient sign-in instead.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.pin,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName.trim(),
        phone,
        mobile_network: data.network,
        account_type: "patient",
      },
    });
    if (error || !created.user) {
      console.error("Patient account creation failed", error?.message);
      throw new Error("Could not create the patient account. Check the phone number or try signing in.");
    }

    const { error: identityError } = await supabaseAdmin
      .from("patient_auth_identities")
      .insert({ user_id: created.user.id, phone_e164: phone, mobile_network: data.network });
    if (identityError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      console.error("Patient phone mapping failed", identityError.message);
      throw new Error("Could not finish patient registration. Please try again.");
    }
    return { ok: true, phone };
  });
