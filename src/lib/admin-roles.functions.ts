import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INITIAL_ADMIN_EMAILS = ["mucyochristhecla@gmail.com", "nibellasheja@gmail.com"];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.from("user_roles").select("user_id")
    .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error("Could not verify administrator permissions");
  if (!data) throw new Error("Only administrators can manage administrator access");
}

export const listAdministrators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    if (error) throw new Error("Could not load administrators");
    const ids = (roles ?? []).map((row) => row.user_id);
    if (!ids.length) return { administrators: [] };
    const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id, full_name, email").in("id", ids);
    if (profileError) throw new Error("Could not load administrator profiles");
    return {
      administrators: (profiles ?? []).map((p) => ({
        id: p.id, fullName: p.full_name ?? "", email: p.email ?? "",
        protected: INITIAL_ADMIN_EMAILS.includes((p.email ?? "").toLowerCase()),
      })).sort((a, b) => a.email.localeCompare(b.email)),
    };
  });

export const assignAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ email: z.string().trim().email().max(255) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id, email").ilike("email", email).maybeSingle();
    if (profileError) throw new Error("Could not find that account");
    if (!profile) throw new Error("That email has not registered for Bella Vitae yet. Ask the person to create an account first.");
    const { data: existing } = await supabaseAdmin.from("user_roles").select("id")
      .eq("user_id", profile.id).eq("role", "admin").maybeSingle();
    if (existing) throw new Error("That account is already an administrator");
    const { error: roleError } = await supabaseAdmin.from("user_roles")
      .insert({ user_id: profile.id, role: "admin" });
    if (roleError) throw new Error("Could not grant administrator access");
    const { error: auditError } = await (supabaseAdmin as any).from("admin_role_audit").insert({
      actor_id: context.userId, target_user_id: profile.id, target_email: profile.email ?? email, action: "granted",
    });
    if (auditError) console.error("Admin role audit insert failed", auditError.message);
    return { ok: true };
  });

export const revokeAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot remove your own administrator access");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("id, email").eq("id", data.userId).maybeSingle();
    if (profileError || !profile) throw new Error("Administrator account was not found");
    const email = (profile.email ?? "").toLowerCase();
    if (INITIAL_ADMIN_EMAILS.includes(email)) throw new Error("The two initial clinic administrators are protected from removal");
    const { count, error: countError } = await supabaseAdmin.from("user_roles")
      .select("id", { count: "exact", head: true }).eq("role", "admin");
    if (countError) throw new Error("Could not verify administrator count");
    if ((count ?? 0) <= 1) throw new Error("At least one administrator must remain");
    const { error } = await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", data.userId).eq("role", "admin");
    if (error) throw new Error("Could not remove administrator access");
    const { error: auditError } = await (supabaseAdmin as any).from("admin_role_audit").insert({
      actor_id: context.userId, target_user_id: data.userId, target_email: profile.email ?? "", action: "revoked",
    });
    if (auditError) console.error("Admin role audit insert failed", auditError.message);
    return { ok: true };
  });
