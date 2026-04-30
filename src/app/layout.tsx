import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { DailyReminderWatcher } from "@/components/DailyReminderWatcher";
import { LanguageProvider } from "@/lib/language";
import { AuthProvider } from "@/lib/auth";
import { CurrencyProvider } from "@/lib/currency";
import { AuthGate } from "@/components/AuthGate";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Guim Financas",
  description: "Painel financeiro pessoal com visual leve e foco no dia a dia.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} min-h-screen text-slate-950 antialiased`}
        suppressHydrationWarning
      >
        <LanguageProvider>
          <CurrencyProvider>
            <AuthProvider>
              <DailyReminderWatcher />
              <PwaRegister />
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
