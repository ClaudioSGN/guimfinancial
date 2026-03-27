"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getStoredSessionUser, supabase } from "@/lib/supabaseClient";
import { getErrorMessage, isTransientNetworkError } from "@/lib/errorUtils";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let recheckTimer: number | null = null;

    async function resolveUserFromSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.user ?? null;
      } catch (error) {
        if (isTransientNetworkError(error)) {
          console.warn("[auth] session recheck failed:", getErrorMessage(error));
          return getStoredSessionUser();
        }
        console.error("[auth] session recheck failed:", error);
        return null;
      }
    }

    async function init() {
      try {
        const nextUser = await resolveUserFromSession();
        if (!mounted) return;
        setUser(nextUser);
      } catch (error) {
        if (!mounted) return;
        if (isTransientNetworkError(error)) {
          console.warn("[auth] session bootstrap failed:", getErrorMessage(error));
          // Preserve the locally cached session when refresh/bootstrap fails temporarily.
          setUser(getStoredSessionUser());
        } else {
          console.error("[auth] session bootstrap failed:", error);
          setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    function scheduleSessionRecheck() {
      if (recheckTimer != null) {
        window.clearTimeout(recheckTimer);
      }
      recheckTimer = window.setTimeout(() => {
        void (async () => {
          const nextUser = await resolveUserFromSession();
          if (!mounted) return;
          setUser(nextUser);
          setLoading(false);
        })();
      }, 0);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setUser(session.user);
        setLoading(false);
        return;
      }

      scheduleSessionRecheck();
    });

    return () => {
      mounted = false;
      if (recheckTimer != null) {
        window.clearTimeout(recheckTimer);
      }
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut({ scope: "local" });
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
