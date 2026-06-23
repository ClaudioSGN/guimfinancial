"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  clearForcedLogoutFlag,
  clearStoredSupabaseSession,
  getStoredSessionUser,
  hasForcedLogoutFlag,
  setForcedLogoutFlag,
  supabase,
} from "@/lib/supabaseClient";
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const lastKnownUserRef = useRef<User | null>(null);

  useEffect(() => {
    let mounted = true;
    let recheckTimer: number | null = null;

    async function resolveUserFromSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.user ?? null;
      } catch (error) {
        if (isSigningOut) {
          return null;
        }
        if (isTransientNetworkError(error)) {
          console.warn("[auth] session recheck failed:", getErrorMessage(error));
          return lastKnownUserRef.current ?? getStoredSessionUser();
        }
        console.error("[auth] session recheck failed:", error);
        return null;
      }
    }

    async function init() {
      if (hasForcedLogoutFlag()) {
        clearStoredSupabaseSession();
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore local cleanup errors during forced logout recovery
        }
        if (!mounted) return;
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const nextUser = await resolveUserFromSession();
        if (!mounted) return;
        if (nextUser) {
          clearForcedLogoutFlag();
        }
        lastKnownUserRef.current = nextUser;
        setUser(nextUser);
      } catch (error) {
        if (!mounted) return;
        if (isSigningOut) {
          lastKnownUserRef.current = null;
          setUser(null);
          return;
        }
        if (isTransientNetworkError(error)) {
          console.warn("[auth] session bootstrap failed:", getErrorMessage(error));
          // Preserve the locally cached session when refresh/bootstrap fails temporarily.
          const fallbackUser = lastKnownUserRef.current ?? getStoredSessionUser();
          lastKnownUserRef.current = fallbackUser;
          setUser(fallbackUser);
        } else {
          console.error("[auth] session bootstrap failed:", error);
          lastKnownUserRef.current = null;
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
          lastKnownUserRef.current = nextUser;
          setUser(nextUser);
          setLoading(false);
        })();
      }, 0);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || isSigningOut) {
        lastKnownUserRef.current = null;
        setUser(null);
        setLoading(false);
        return;
      }

      if (session?.user) {
        clearForcedLogoutFlag();
        lastKnownUserRef.current = session.user;
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
  }, [isSigningOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut: async () => {
        setIsSigningOut(true);
        setForcedLogoutFlag();
        lastKnownUserRef.current = null;
        setUser(null);
        setLoading(false);
        clearStoredSupabaseSession();
        try {
          const { error } = await supabase.auth.signOut();
          if (error) {
            await supabase.auth.signOut({ scope: "local" });
          }
        } finally {
          clearStoredSupabaseSession();
          setIsSigningOut(false);
        }
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
