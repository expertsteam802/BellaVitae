import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { registerPatientAccount } from "@/lib/patient-auth.functions";
import { normalizePatientPhone } from "@/lib/patient-auth";

export const Route = createFileRoute("/patient-access")({
  head: () => ({
    meta: [
      { title: "Patient access | Bella Vitae Medical Clinic" },
      { name: "description", content: "Access your Bella Vitae patient portal securely with your phone number and private PIN." },
    ],
  }),
  component: PatientAccessPage,
});

function PatientAccessPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<"airtel" | "mtn">("airtel");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const normalized = normalizePatientPhone(phone);
      if (mode === "register") {
        await registerPatientAccount({ data: { fullName, phone: normalized.phone, network, pin } });
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized.signInEmail,
        password: pin,
      });
      if (error) throw new Error(mode === "register"
        ? "Your account was created, but sign-in failed. Please try signing in with the same phone and PIN."
        : "Phone number or PIN is incorrect. If this is your first visit, register first.");
      toast.success(mode === "register" ? "Patient account created." : "Welcome to your patient portal.");
      await navigate({ to: "/portal" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to access the patient portal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-14">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Private patient access</p>
          <h1 className="mt-2 text-2xl font-bold text-primary">{mode === "signin" ? "Patient sign in" : "First-time patient registration"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your Rwanda mobile number and private 6–12 digit PIN. No OTP is used. Keep your PIN private.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Full name</span>
                  <input value={fullName} required minLength={2} maxLength={120} onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
                </label>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Mobile network (choose once)</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setNetwork("airtel")}
                      className={`rounded-md border px-3 py-2.5 text-sm font-semibold ${network === "airtel" ? "border-primary bg-primary/10 text-primary" : "border-input"}`}>Airtel</button>
                    <button type="button" onClick={() => setNetwork("mtn")}
                      className={`rounded-md border px-3 py-2.5 text-sm font-semibold ${network === "mtn" ? "border-primary bg-primary/10 text-primary" : "border-input"}`}>MTN</button>
                  </div>
                </fieldset>
              </>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Phone number</span>
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} required placeholder="0788 123 456"
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Private PIN</span>
              <input type="password" inputMode="numeric" autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={pin} required minLength={6} maxLength={12} pattern="[0-9]{6,12}" placeholder="6–12 digits"
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <button type="submit" disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Please wait…" : mode === "signin" ? "Open patient portal" : "Create patient account"}
            </button>
          </form>
          <button onClick={() => setMode(mode === "signin" ? "register" : "signin")}
            className="mt-4 w-full text-sm text-primary hover:underline">
            {mode === "signin" ? "First time here? Register your phone" : "Already registered? Sign in"}
          </button>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Patient information is private. Use your own phone number and do not share your PIN.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
