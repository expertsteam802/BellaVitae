import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth.functions";

export type AppRole = "admin" | "staff" | "patient";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      setRole(null);
      setLoading(Boolean(next?.user));
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Session lookup failed", error.message);
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (!data.session?.user) {
        setRole(null);
        setLoading(false);
      }
    }).catch((error) => {
      if (!active) return;
      console.error("Session lookup failed", error);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    let active = true;
    setRole(null);
    setLoading(true);

    getCurrentUserRole()
      .then((resolvedRole) => {
        if (!active) return;
        setRole(resolvedRole as AppRole);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Account role verification failed", error);
        setRole(null);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  return {
    session,
    user,
    role,
    loading,
    isAdmin: role === "admin",
    isStaff: role === "staff" || role === "admin",
    signOut: () => supabase.auth.signOut(),
  };
}
