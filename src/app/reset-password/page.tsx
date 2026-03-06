"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AuthErrorLike = {
  message?: string;
};

function getErrorText(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as AuthErrorLike).message;
    if (typeof value === "string") return value;
  }
  if (typeof error === "string") return error;
  return "Falha ao atualizar senha.";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setLoadingSession(false);
    }

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setHasSession(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword() {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!password.trim()) {
      setErrorMsg("Digite sua nova senha.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("As senhas nao conferem.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(getErrorText(error));
        return;
      }

      setSuccessMsg("Senha atualizada com sucesso. Redirecionando para o login...");
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore local signout errors
      }
      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (error) {
      setErrorMsg(getErrorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-10 text-slate-50">
      <div className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-[#1E232E] bg-[#121621] p-6">
        <p className="text-xl font-semibold text-[#E5E8EF]">Redefinir senha</p>
        <p className="text-xs text-[#8B94A6]">
          Use o link do email de recuperacao para abrir esta tela e definir uma nova senha.
        </p>

        {loadingSession ? (
          <p className="text-sm text-[#A8B0C2]">Carregando...</p>
        ) : !hasSession ? (
          <div className="space-y-3">
            <p className="text-sm text-[#E4A6A6]">
              Nao encontramos uma sessao de recuperacao valida. Abra novamente o link enviado por email.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="w-full rounded-xl border border-[#2A3140] bg-[#151E2D] py-2 text-sm font-semibold text-[#E4E7EC]"
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nova senha"
              type="password"
              className="w-full rounded-xl border border-[#1E232E] bg-[#0F121A] px-4 py-3 text-sm text-[#E4E7EC]"
            />
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmar nova senha"
              type="password"
              className="w-full rounded-xl border border-[#1E232E] bg-[#0F121A] px-4 py-3 text-sm text-[#E4E7EC]"
            />
            {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
            {successMsg ? <p className="text-xs text-[#5DD6C7]">{successMsg}</p> : null}
            <button
              type="button"
              onClick={handleUpdatePassword}
              disabled={saving}
              className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
