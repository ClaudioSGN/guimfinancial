import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";
import { DailyReminderWatcher } from "@/components/DailyReminderWatcher";

export const metadata: Metadata = {
  title: "Guim Finanças - Dashboard",
  description: "Painel administrativo financeiro",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex h-screen overflow-hidden bg-[#0b1226] text-slate-50">
        <DailyReminderWatcher />
        <PwaRegister />

        <div className="flex min-h-screen w-full flex-col overflow-hidden">
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
