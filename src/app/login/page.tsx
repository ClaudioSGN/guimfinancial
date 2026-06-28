"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearForcedLogoutFlag,
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
        message: "Por favor, confirme o seu endereço de e-mail.",
      };
    }
    if (isEmailRateLimitError(authError)) {
      return {
        tone: "error",
        message:
          "Muitas tentativas de envio de e-mail. Aguarde alguns minutos e tente novamente. Se a conta já existir, entre com seu e-mail e senha.",
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

  function switchMode(nextMode: "login" | "signup") {
    setShowRecovery(false);
    setRecoveryMsg(null);
    setErrorMsg(null);
    setErrorTone("error");
    setMode(nextMode);
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
    clearForcedLogoutFlag();
    if (mode === "signup" && !username.trim()) {
      setSaving(false);
      setErrorMsg("Informe um nome de usuário.");
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
      setErrorMsg("Digite o código de 6 dígitos do Google Authenticator.");
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
      setRecoveryMsg("Informe o e-mail para recuperar a senha.");
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
      setRecoveryMsg("Se o e-mail existir, enviaremos um link para redefinir a senha.");
    } catch (error) {
      setRecoveryMsg(formatAuthFeedback(error).message);
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050B10] text-[#EEF8F5]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(86,224,194,0.055)_1px,transparent_1px),linear-gradient(rgba(86,224,194,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="absolute -left-28 top-16 h-96 w-96 rounded-full bg-[#56E0C2]/20 blur-3xl" />
      <div className="absolute -right-20 bottom-0 h-[28rem] w-[28rem] rounded-full bg-[#FBBF24]/10 blur-3xl" />

      <main className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="hidden min-h-[760px] flex-col justify-between border border-white/10 bg-[#07151B]/75 p-8 shadow-[18px_18px_0_rgba(0,0,0,0.24)] backdrop-blur-xl lg:flex">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center bg-[#56E0C2] font-black text-[#041016] shadow-[8px_8px_0_rgba(86,224,194,0.16)]">
                GF
              </div>
              <div>
                <p className="text-xl font-black uppercase tracking-[-0.04em]">Guimfinancial</p>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#7C97AA]">
                  Painel financeiro
                </p>
              </div>
            </div>
            <span className="border border-[#56E0C2]/30 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#56E0C2]">
              Beta privado
            </span>
          </div>

          <div className="max-w-2xl space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#56E0C2]">
                Seu dinheiro, sem ruído
              </p>
              <h1 className="font-[var(--font-display)] text-6xl font-black leading-[0.92] tracking-[-0.08em] text-white xl:text-7xl">
                Entre, registre e entenda seu mês.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-[#99ADBC]">
                Um painel direto para acompanhar contas, cartões, amigos, orçamento e investimentos
                sem perder tempo procurando onde lançar cada coisa.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                ["01", "Registre receitas e despesas em poucos cliques."],
                ["02", "Veja o impacto no mês antes de gastar mais."],
                ["03", "Separe cartões próprios e dívidas com amigos."],
              ].map(([step, text]) => (
                <div key={step} className="border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-xs font-black text-[#56E0C2]">{step}</p>
                  <p className="mt-3 text-sm leading-6 text-[#C1D0D9]">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7C97AA]">
              Atalho
            </p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#C1D0D9]">
              Depois de entrar, use <span className="text-[#56E0C2]">Registrar</span> para lançar
              receitas, despesas, cartões ou atribuições sem procurar por menus.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-12 w-12 place-items-center bg-[#56E0C2] font-black text-[#041016]">
              GF
            </div>
            <div>
              <p className="font-black uppercase">Guimfinancial</p>
              <p className="text-xs uppercase tracking-[0.22em] text-[#7C97AA]">Painel financeiro</p>
            </div>
          </div>

          <div className="border border-white/10 bg-[#0B1721]/92 p-5 shadow-[14px_14px_0_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#56E0C2]">
                  {mfaFactorId ? "Segurança" : mode === "login" ? "Bem-vindo de volta" : "Comece agora"}
                </p>
                <h2 className="mt-3 font-[var(--font-display)] text-4xl font-black tracking-[-0.07em] text-white">
                  {mfaFactorId ? "Confirme o acesso" : mode === "login" ? "Entrar na conta" : "Criar conta"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8DA5B7]">
                  {mfaFactorId
                    ? "Use o código do seu app autenticador para concluir o login."
                    : mode === "login"
                      ? "Acesse seu painel financeiro com e-mail e senha."
                      : "Crie seu perfil para começar a controlar o mês."}
                </p>
              </div>
              {!mfaFactorId ? (
                <div className="hidden border border-white/10 bg-white/[0.035] p-1 text-xs font-black sm:flex">
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className={`px-4 py-2 uppercase transition ${
                      mode === "login" ? "bg-[#56E0C2] text-[#041016]" : "text-[#8DA5B7]"
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className={`px-4 py-2 uppercase transition ${
                      mode === "signup" ? "bg-[#56E0C2] text-[#041016]" : "text-[#8DA5B7]"
                    }`}
                  >
                    Criar
                  </button>
                </div>
              ) : null}
            </div>

            {mfaFactorId ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#8DA5B7]">
                    Código 2FA
                  </span>
                  <input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="000000"
                    inputMode="numeric"
                    className="w-full border border-white/10 bg-[#101E2B] px-4 py-4 text-lg font-bold tracking-[0.28em] text-white outline-none transition placeholder:text-[#405A6D] focus:border-[#56E0C2]"
                  />
                </label>
                {errorMsg ? (
                  <p
                    className={`border px-4 py-3 text-sm ${
                      errorTone === "info"
                        ? "border-[#56E0C2]/20 bg-[#56E0C2]/10 text-[#A8F5E6]"
                        : "border-red-400/20 bg-red-400/10 text-red-200"
                    }`}
                  >
                    {errorMsg}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleVerifyMfa}
                  disabled={saving}
                  className="w-full bg-[#56E0C2] py-4 text-sm font-black uppercase tracking-[0.12em] text-[#041016] shadow-[8px_8px_0_rgba(86,224,194,0.16)] transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {saving ? "Aguarde..." : "Verificar 2FA"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelMfa}
                  disabled={saving}
                  className="w-full border border-white/10 bg-white/[0.035] py-4 text-sm font-bold text-[#B8CAD7] transition hover:border-white/20 disabled:opacity-60"
                >
                  Cancelar e sair
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {mode === "signup" ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#8DA5B7]">
                      Nome de usuário
                    </span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Ex.: claudiosgn"
                      type="text"
                      className="w-full border border-white/10 bg-[#101E2B] px-4 py-4 text-sm text-white outline-none transition placeholder:text-[#405A6D] focus:border-[#56E0C2]"
                    />
                  </label>
                ) : null}

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#8DA5B7]">
                    E-mail
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com"
                    type="email"
                    className="w-full border border-white/10 bg-[#101E2B] px-4 py-4 text-sm text-white outline-none transition placeholder:text-[#405A6D] focus:border-[#56E0C2]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-[#8DA5B7]">
                    Senha
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    type="password"
                    className="w-full border border-white/10 bg-[#101E2B] px-4 py-4 text-sm text-white outline-none transition placeholder:text-[#405A6D] focus:border-[#56E0C2]"
                  />
                </label>

                {mode === "login" ? (
                  <div className="flex flex-col gap-3 border-y border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-[#B8CAD7]">
                      <input
                        type="checkbox"
                        checked={rememberLogin}
                        onChange={(event) => setRememberLogin(event.target.checked)}
                        className="h-4 w-4 accent-[#56E0C2]"
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
                      className="text-left text-sm font-bold text-[#56E0C2] hover:underline sm:text-right"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                ) : null}

                {showRecovery && mode === "login" ? (
                  <div className="space-y-3 border border-[#56E0C2]/20 bg-[#56E0C2]/[0.06] p-4">
                    <div>
                      <p className="text-sm font-bold text-white">Recuperar senha</p>
                      <p className="mt-1 text-xs leading-5 text-[#8DA5B7]">
                        Enviaremos um link para você criar uma nova senha.
                      </p>
                    </div>
                    <input
                      value={recoveryEmail}
                      onChange={(event) => setRecoveryEmail(event.target.value)}
                      placeholder="E-mail para recuperar senha"
                      type="email"
                      className="w-full border border-white/10 bg-[#101E2B] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#405A6D] focus:border-[#56E0C2]"
                    />
                    <button
                      type="button"
                      onClick={handlePasswordRecovery}
                      disabled={recoveryLoading}
                      className="w-full border border-[#56E0C2]/40 bg-[#07151B] py-3 text-sm font-black uppercase tracking-[0.1em] text-[#A8F5E6] disabled:opacity-60"
                    >
                      {recoveryLoading ? "Enviando..." : "Enviar link de recuperação"}
                    </button>
                    {recoveryMsg ? <p className="text-xs leading-5 text-[#A8F5E6]">{recoveryMsg}</p> : null}
                  </div>
                ) : null}

                {errorMsg ? (
                  <p
                    className={`border px-4 py-3 text-sm ${
                      errorTone === "info"
                        ? "border-[#56E0C2]/20 bg-[#56E0C2]/10 text-[#A8F5E6]"
                        : "border-red-400/20 bg-red-400/10 text-red-200"
                    }`}
                  >
                    {errorMsg}
                  </p>
                ) : null}

                {mode === "signup" && signupCooldown > 0 ? (
                  <p className="text-sm text-[#8DA5B7]">
                    Próxima tentativa de cadastro em {signupCooldown}s.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || (mode === "signup" && signupCooldown > 0)}
                  className="w-full bg-[#56E0C2] py-4 text-sm font-black uppercase tracking-[0.12em] text-[#041016] shadow-[8px_8px_0_rgba(86,224,194,0.16)] transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {saving
                    ? "Aguarde..."
                    : mode === "signup" && signupCooldown > 0
                      ? `Aguarde ${signupCooldown}s`
                      : mode === "login"
                        ? "Entrar"
                        : "Criar conta"}
                </button>

                <button
                  type="button"
                  className="w-full border border-white/10 bg-white/[0.035] py-4 text-sm font-bold text-[#B8CAD7] transition hover:border-white/20 sm:hidden"
                  onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? "Ainda não tem conta? Criar agora" : "Já tem conta? Entrar"}
                </button>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-[#627C91]">
            Ao continuar, você acessa o painel Guimfinancial com conexão segura via Supabase.
          </p>
        </section>
      </main>
    </div>
  );
}
