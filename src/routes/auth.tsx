import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in | Bella Vitae Medical Clinic" },
      { name: "description", content: "Secure sign-in for authorized Bella Vitae clinic staff and administrators." },
    ],
  }),
  component: StaffAuthPage,
});

function StaffAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;

      const role = await getCurrentUserRole();
      if (role !== "admin" && role !== "staff") {
        await supabase.auth.signOut();
        throw new Error("This sign-in is for clinic staff only. Patients should use Patient access with their phone number and PIN.");
      }

      toast.success(role === "admin" ? "Administrator access confirmed." : "Staff access confirmed.");
      await navigate({ to: role === "admin" ? "/admin" : "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SiteLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Staff only</p>
          <h1 className="mt-2 text-2xl font-bold text-primary">Clinic staff sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the email and password issued to you by a clinic administrator. Patient accounts cannot sign in here.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Work email</span>
              <input type="email" autoComplete="username" value={email} required
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Password</span>
              <input type="password" autoComplete="current-password" value={password} required
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <button type="submit" disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "Verifying access…" : "Sign in to staff workspace"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Are you a patient? <a href="/patient-access" className="font-medium text-primary hover:underline">Open patient access</a>
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
