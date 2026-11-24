import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Resolve the signed-in user's role from the trusted server-side role table. */
export const getCurrentUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) {
      console.error("Role lookup failed", error.message);
      throw new Error("Unable to verify account permissions. Please try again.");
    }
    const roles = (data ?? []).map((row) => row.role);
    return roles.includes("admin") ? "admin" : roles.includes("staff") ? "staff" : "patient";
  });
