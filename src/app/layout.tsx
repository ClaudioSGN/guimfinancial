import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Guim Finance",
  description: "App minimalista de gestão de finanças pessoais.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json"/>
        <link rel="icon" href="/icons/icon-192.png"/>
        <link rel="apple-touch-icon" href="/icons/icon-192.png"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Guim Finance"/>
        <meta name="theme-color" content="#000000"/>
      </head>
      <body className="bg-black text-zinc-100">
        <PwaRegister/>
        {children}
      </body>
    </html>
  );
}