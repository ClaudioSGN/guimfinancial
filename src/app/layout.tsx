import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";
import { DailyReminderWatcher } from "@/components/DailyReminderWatcher";
import { LanguageProvider } from "@/lib/language";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/AuthGate";
import { UpdateChecker } from "@/components/UpdateChecker";
import { DesktopWindowFrame } from "@/components/DesktopWindowFrame";

export const metadata: Metadata = {
  title: "Guim Finanças - Dashboard",
  description: "Painel administrativo financeiro",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0D0F14] text-slate-50" suppressHydrationWarning>
        <LanguageProvider>
          <AuthProvider>
            <DailyReminderWatcher />
            <PwaRegister />
            <UpdateChecker />
            <DesktopWindowFrame>
              <AuthGate>{children}</AuthGate>
            </DesktopWindowFrame>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
