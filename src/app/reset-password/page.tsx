"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "@/components/AuthPages.module.css";

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
    <div className={`${styles.page} ${styles.resetPage}`}>
      <div className={`${styles.formCard} ${styles.resetCard}`}>
        <div className={styles.resetIcon} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10" width="14" height="11" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
        </div>
        <p className={styles.formTitle}>Redefinir senha</p>
        <p className={styles.formDescription}>
          Use o link do email de recuperacao para abrir esta tela e definir uma nova senha.
        </p>

        {loadingSession ? (
          <p className={styles.helperText}>Carregando...</p>
        ) : !hasSession ? (
          <div className={styles.fields}>
            <p className={`${styles.notice} ${styles.errorNotice}`}>
              Não encontramos uma sessão de recuperação válida. Abra novamente o link enviado por e-mail.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className={styles.secondaryButton}
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <div className={styles.fields}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nova senha"
              type="password"
              className={styles.input}
            />
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmar nova senha"
              type="password"
              className={styles.input}
            />
            {errorMsg ? <p className={`${styles.notice} ${styles.errorNotice}`}>{errorMsg}</p> : null}
            {successMsg ? <p className={`${styles.notice} ${styles.infoNotice}`}>{successMsg}</p> : null}
            <button
              type="button"
              onClick={handleUpdatePassword}
              disabled={saving}
              className={styles.primaryButton}
            >
              {saving ? "Salvando..." : "Salvar nova senha"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
