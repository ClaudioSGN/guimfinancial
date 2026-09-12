"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/AuthPages.module.css";
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
    <div className={styles.page}>
      <main className={styles.layout}>
        <section className={styles.introduction}>
          <div className={styles.brandRow}>
            <div className={styles.brand}>
              <div className={styles.monogram}>
                GF
              </div>
              <div>
                <p className={styles.brandName}>Guimfinancial</p>
                <p className={styles.brandCaption}>
                  Painel financeiro
                </p>
              </div>
            </div>
            <span className={styles.badge}>
              Beta privado
            </span>
          </div>

          <div className={styles.introContent}>
            <div>
              <p className={styles.eyebrow}>
                Seu dinheiro, sem ruído
              </p>
              <h1 className={styles.headline}>
                Entre, registre e entenda seu mês.
              </h1>
              <p className={styles.description}>
                Um painel direto para acompanhar contas, cartões, amigos, orçamento e investimentos
                sem perder tempo procurando onde lançar cada coisa.
              </p>
            </div>

            <div className={styles.steps}>
              {[
                ["01", "Registre receitas e despesas em poucos cliques."],
                ["02", "Veja o impacto no mês antes de gastar mais."],
                ["03", "Separe cartões próprios e dívidas com amigos."],
              ].map(([step, text]) => (
                <div key={step} className={styles.step}>
                  <p className={styles.stepNumber}>{step}</p>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.shortcut}>
            <p className={styles.eyebrow}>
              Atalho
            </p>
            <p className={styles.shortcutText}>
              Depois de entrar, use <span className={styles.inlineLabel}>Registrar</span> para lançar
              receitas, despesas, cartões ou atribuições sem procurar por menus.
            </p>
          </div>
        </section>

        <section className={styles.formSection}>
          <div className={styles.mobileBrand}>
            <div className={styles.monogram}>
              GF
            </div>
            <div>
              <p className={styles.brandName}>Guimfinancial</p>
              <p className={styles.brandCaption}>Painel financeiro</p>
            </div>
          </div>

          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {mfaFactorId ? "Segurança" : mode === "login" ? "Bem-vindo de volta" : "Comece agora"}
                </p>
                <h2 className={styles.formTitle}>
                  {mfaFactorId ? "Confirme o acesso" : mode === "login" ? "Entrar na conta" : "Criar conta"}
                </h2>
                <p className={styles.formDescription}>
                  {mfaFactorId
                    ? "Use o código do seu app autenticador para concluir o login."
                    : mode === "login"
                      ? "Acesse seu painel financeiro com e-mail e senha."
                      : "Crie seu perfil para começar a controlar o mês."}
                </p>
              </div>
              {!mfaFactorId ? (
                <div className={styles.modeTabs}>
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className={`${styles.modeTab} ${
                      mode === "login" ? styles.modeTabActive : ""
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className={`${styles.modeTab} ${
                      mode === "signup" ? styles.modeTabActive : ""
                    }`}
                  >
                    Criar
                  </button>
                </div>
              ) : null}
            </div>

            {mfaFactorId ? (
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    Código 2FA
                  </span>
                  <input
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="000000"
                    inputMode="numeric"
                    className={`${styles.input} ${styles.codeInput}`}
                  />
                </label>
                {errorMsg ? (
                  <p
                    className={`${styles.notice} ${
                      errorTone === "info"
                        ? styles.infoNotice
                        : styles.errorNotice
                    }`}
                  >
                    {errorMsg}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleVerifyMfa}
                  disabled={saving}
                  className={styles.primaryButton}
                >
                  {saving ? "Aguarde..." : "Verificar 2FA"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelMfa}
                  disabled={saving}
                  className={styles.secondaryButton}
                >
                  Cancelar e sair
                </button>
              </div>
            ) : (
              <div className={styles.fields}>
                {mode === "signup" ? (
                  <label className={styles.field}>
                    <span className={styles.label}>
                      Nome de usuário
                    </span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Ex.: claudiosgn"
                      type="text"
                      className={styles.input}
                    />
                  </label>
                ) : null}

                <label className={styles.field}>
                  <span className={styles.label}>
                    E-mail
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com"
                    type="email"
                    className={styles.input}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>
                    Senha
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    type="password"
                    className={styles.input}
                  />
                </label>

                {mode === "login" ? (
                  <div className={styles.loginOptions}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={rememberLogin}
                        onChange={(event) => setRememberLogin(event.target.checked)}
                        className={styles.checkbox}
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
                      className={styles.textButton}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                ) : null}

                {showRecovery && mode === "login" ? (
                  <div className={styles.recoveryCard}>
                    <div>
                      <p className={styles.recoveryTitle}>Recuperar senha</p>
                      <p className={styles.formDescription}>
                        Enviaremos um link para você criar uma nova senha.
                      </p>
                    </div>
                    <input
                      value={recoveryEmail}
                      onChange={(event) => setRecoveryEmail(event.target.value)}
                      placeholder="E-mail para recuperar senha"
                      type="email"
                      className={styles.input}
                    />
                    <button
                      type="button"
                      onClick={handlePasswordRecovery}
                      disabled={recoveryLoading}
                      className={styles.outlineButton}
                    >
                      {recoveryLoading ? "Enviando..." : "Enviar link de recuperação"}
                    </button>
                    {recoveryMsg ? <p className={styles.helperText}>{recoveryMsg}</p> : null}
                  </div>
                ) : null}

                {errorMsg ? (
                  <p
                    className={`${styles.notice} ${
                      errorTone === "info"
                        ? styles.infoNotice
                        : styles.errorNotice
                    }`}
                  >
                    {errorMsg}
                  </p>
                ) : null}

                {mode === "signup" && signupCooldown > 0 ? (
                  <p className={styles.helperText}>
                    Próxima tentativa de cadastro em {signupCooldown}s.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || (mode === "signup" && signupCooldown > 0)}
                  className={styles.primaryButton}
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
                  className={`${styles.secondaryButton} ${styles.mobileSwitch}`}
                  onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? "Ainda não tem conta? Criar agora" : "Já tem conta? Entrar"}
                </button>
              </div>
            )}
          </div>

          <p className={styles.securityNote}>
            Ao continuar, você acessa o painel Guimfinancial com conexão segura via Supabase.
          </p>
        </section>
      </main>
    </div>
  );
}
