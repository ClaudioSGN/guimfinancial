"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const PUBLIC_ROUTES = new Set(["/login"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.has(pathname);
    if (!user && !isPublic) {
      router.replace("/login");
      return;
    }
    if (user && isPublic) {
      router.replace("/");
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return null;
  }

  const isPublic = PUBLIC_ROUTES.has(pathname);
  if (!user && !isPublic) {
    return null;
  }

  return <>{children}</>;
}
