import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";
import { DailyReminderWatcher } from "@/components/DailyReminderWatcher";
import { GestureNavigator } from "@/components/GestureNavigator";

export const metadata: Metadata = {
  title: "Guim Finanças",
  description: "Dashboard minimalista de finanças pessoais",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-zinc-100">
        <DailyReminderWatcher />
        <PwaRegister />
        <GestureNavigator>{children}</GestureNavigator>
      </body>
    </html>
  );
}
