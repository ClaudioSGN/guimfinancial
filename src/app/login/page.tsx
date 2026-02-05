"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMsg(null);
    setSaving(true);
    if (mode === "signup" && !username.trim()) {
      setSaving(false);
      setErrorMsg("Informe um nome de usu\u00e1rio.");
      return;
    }
    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: {
              data: { username: username.trim() },
            },
          });
    const { error } = await action;
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-10 text-slate-50">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            GuimFinancial
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </p>
        </div>

        <div className="space-y-3">
          {mode === "signup" ? (
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Nome de usu\u00e1rio"
              type="text"
              className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
            />
          ) : null}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha"
            type="password"
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
          >
            {saving ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </div>

        <button
          type="button"
          className="text-xs text-[#8B94A6]"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login"
            ? "Ainda não tem conta? Criar agora"
            : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
