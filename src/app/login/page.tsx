"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getRememberLoginPreference,
  setRememberLoginPreference,
  supabase,
} from "@/lib/supabaseClient";

type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

type AuthFeedback = {
  tone: "error" | "info";
  message: string;
};

function isEmailRateLimitError(error: AuthErrorLike) {
  const normalizedMessage = (error.message ?? "").toLowerCase();
  return (
    error.code === "over_email_send_rate_limit" ||
    (error.status === 429 && normalizedMessage.includes("email")) ||
    normalizedMessage.includes("email rate limit")
  );
}

function isEmailNotConfirmedError(error: AuthErrorLike) {
  const normalizedMessage = (error.message ?? "").toLowerCase();
  return (
    error.code === "email_not_confirmed" ||
    normalizedMessage.includes("email not confirmed")
  );
}

function formatAuthFeedback(error: unknown): AuthFeedback {
  if (error && typeof error === "object") {
    const authError = error as AuthErrorLike;
    if (isEmailNotConfirmedError(authError)) {
      return {
        tone: "info",
        message: "Por favor, confirme o seu endereco de e-mail.",
      };
    }
    if (isEmailRateLimitError(authError)) {
      return {
        tone: "error",
        message:
          "Muitas tentativas de envio de e-mail. Aguarde alguns minutos e tente novamente. Se a conta ja existir, entre com seu e-mail e senha.",
      };
    }
    const message = authError.message ?? "Authentication failed.";
    if (message === "Database error querying schema") {
      return {
        tone: "error",
        message:
          "Supabase auth error: database schema query failed. Check Supabase Authentication logs/hooks.",
      };
    }
    const details: string[] = [];
    if (authError.code) details.push(`code=${authError.code}`);
    if (typeof authError.status === "number") details.push(`status=${authError.status}`);
    return {
      tone: "error",
      message: details.length > 0 ? `${message} (${details.join(", ")})` : message,
    };
  }
  if (typeof error === "string") {
    return { tone: "error", message: error };
  }
  return { tone: "error", message: "Authentication failed." };
}

function getPasswordRecoveryRedirectUrl() {
  const configuredBase =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredBase) {
    const cleaned = configuredBase.replace(/\/+$/, "");
    return cleaned.endsWith("/reset-password") ? cleaned : `${cleaned}/reset-password`;
  }

  if (typeof window === "undefined") return undefined;
  const { origin, hostname } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLocalHost) {
    // Let Supabase use the project Site URL/Redirect URLs instead of localhost.
    return undefined;
  }

  return `${origin}/reset-password`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [rememberLogin, setRememberLogin] = useState(getRememberLoginPreference);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<"error" | "info">("error");
  const [signupCooldown, setSignupCooldown] = useState(0);

  useEffect(() => {
    if (signupCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setSignupCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [signupCooldown]);

  async function maybeStartMfaChallenge() {
    const { data: factors, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factor = factors.totp[0];
    if (!factor) return false;

    const { data: aal, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError || aal.currentLevel !== "aal2") {
      setMfaFactorId(factor.id);
      setMfaCode("");
      return true;
    }

    return false;
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setErrorTone("error");
    setRecoveryMsg(null);
    if (mode === "signup" && signupCooldown > 0) {
      setErrorMsg(`Aguarde ${signupCooldown}s para tentar criar conta novamente.`);
      return;
    }
    setSaving(true);
    setRememberLoginPreference(rememberLogin);
    if (mode === "signup" && !username.trim()) {
      setSaving(false);
      setErrorMsg("Informe um nome de usuario.");
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

    try {
      const { error } = await action;
      if (error) {
        if (mode === "signup" && isEmailRateLimitError(error as AuthErrorLike)) {
          setSignupCooldown(60);
        }
        const feedback = formatAuthFeedback(error);
        setErrorTone(feedback.tone);
        setErrorMsg(feedback.message);
        return;
      }
      if (mode === "login") {
        const needsMfa = await maybeStartMfaChallenge();
        if (needsMfa) return;
      }
      router.replace("/");
    } catch (error) {
      const feedback = formatAuthFeedback(error);
      setErrorTone(feedback.tone);
      setErrorMsg(feedback.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyMfa() {
    if (!mfaFactorId) return;
    const code = mfaCode.trim();
    if (!code) {
      setErrorMsg("Digite o codigo de 6 digitos do Google Authenticator.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setErrorTone("error");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code,
      });
      if (error) {
        const feedback = formatAuthFeedback(error);
        setErrorTone(feedback.tone);
        setErrorMsg(feedback.message);
        return;
      }
      router.replace("/");
    } catch (error) {
      const feedback = formatAuthFeedback(error);
      setErrorTone(feedback.tone);
      setErrorMsg(feedback.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelMfa() {
    setMfaFactorId(null);
    setMfaCode("");
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // ignore local signout errors
    }
  }

  async function handlePasswordRecovery() {
    setErrorMsg(null);
    setRecoveryMsg(null);
    const targetEmail = recoveryEmail.trim() || email.trim();
    if (!targetEmail) {
      setRecoveryMsg("Informe o email para recuperar a senha.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const redirectTo = getPasswordRecoveryRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, { redirectTo });
      if (error) {
        setRecoveryMsg(formatAuthFeedback(error).message);
        return;
      }
      setRecoveryMsg("Se o email existir, enviaremos um link para redefinir a senha.");
    } catch (error) {
      setRecoveryMsg(formatAuthFeedback(error).message);
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-10 text-slate-50">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">GuimFinancial</p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {mfaFactorId ? "2FA" : mode === "login" ? "Entrar" : "Criar conta"}
          </p>
        </div>

        {mfaFactorId ? (
          <div className="space-y-3">
            <p className="text-xs text-[#8B94A6]">
              Digite o codigo de 6 digitos do Google Authenticator para concluir o login.
            </p>
            <input
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              placeholder="Codigo 2FA"
              inputMode="numeric"
              className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
            />
            {errorMsg ? (
              <p className={errorTone === "info" ? "text-xs text-[#8B94A6]" : "text-xs text-red-400"}>
                {errorMsg}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleVerifyMfa}
              disabled={saving}
              className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {saving ? "Aguarde..." : "Verificar 2FA"}
            </button>
            <button
              type="button"
              onClick={handleCancelMfa}
              disabled={saving}
              className="w-full rounded-xl border border-[#2A3140] bg-[#111827] py-3 text-sm font-semibold text-[#D6DBE6] disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mode === "signup" ? (
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Nome de usuario"
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
            {mode === "login" ? (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8B94A6]">
                  <input
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(event) => setRememberLogin(event.target.checked)}
                    className="h-4 w-4 rounded border border-[#2A3140] bg-[#151A27]"
                  />
                  <span>Manter conectado</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowRecovery((value) => !value);
                    setRecoveryMsg(null);
                    setRecoveryEmail(email);
                  }}
                  className="text-xs text-[#8B94A6] underline underline-offset-2"
                >
                  Esqueci minha senha
                </button>
              </div>
            ) : null}
            {showRecovery && mode === "login" ? (
              <div className="space-y-2 rounded-xl border border-[#1E232E] bg-[#111723] p-3">
                <input
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  placeholder="Email para recuperar senha"
                  type="email"
                  className="w-full rounded-xl border border-[#2A3140] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
                />
                <button
                  type="button"
                  onClick={handlePasswordRecovery}
                  disabled={recoveryLoading}
                  className="w-full rounded-xl border border-[#2A3140] bg-[#151E2D] py-2 text-sm font-semibold text-[#E4E7EC] disabled:opacity-60"
                >
                  {recoveryLoading ? "Enviando..." : "Enviar link de recuperacao"}
                </button>
                {recoveryMsg ? <p className="text-xs text-[#8B94A6]">{recoveryMsg}</p> : null}
              </div>
            ) : null}
            {errorMsg ? (
              <p className={errorTone === "info" ? "text-xs text-[#8B94A6]" : "text-xs text-red-400"}>
                {errorMsg}
              </p>
            ) : null}
            {mode === "signup" && signupCooldown > 0 ? (
              <p className="text-xs text-[#8B94A6]">
                Proxima tentativa de cadastro em {signupCooldown}s.
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || (mode === "signup" && signupCooldown > 0)}
              className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {saving
                ? "Aguarde..."
                : mode === "signup" && signupCooldown > 0
                  ? `Aguarde ${signupCooldown}s`
                  : mode === "login"
                    ? "Entrar"
                    : "Criar conta"}
            </button>
          </div>
        )}

        {!mfaFactorId ? (
          <button
            type="button"
            className="text-xs text-[#8B94A6]"
            onClick={() => {
              setShowRecovery(false);
              setRecoveryMsg(null);
              setErrorMsg(null);
              setErrorTone("error");
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Ainda nao tem conta? Criar agora" : "Ja tem conta? Entrar"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
