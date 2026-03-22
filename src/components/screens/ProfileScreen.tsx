"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { loadProfileSettings, saveProfileSettings } from "@/lib/profile";

function getInitials(name: string | null | undefined) {
  const value = (name ?? "").trim();
  if (!value) return "GF";
  const parts = value.split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "GF";
}

export function ProfileScreen() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    const localProfile = loadProfileSettings();
    const metadataName =
      typeof user?.user_metadata?.username === "string" ? user.user_metadata.username.trim() : "";
    const emailFallback =
      typeof user?.email === "string" ? user.email.split("@")[0].trim() : "";
    const metadataAvatar =
      typeof user?.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url.trim()
        : "";

    setProfileName(localProfile.name || metadataName || emailFallback || "");
    setProfileAvatar(localProfile.avatarUrl || metadataAvatar || null);
    setLoading(false);
  }, [user]);

  const displayName = useMemo(() => {
    if (profileName.trim()) return profileName.trim();
    if (typeof user?.email === "string" && user.email.trim()) return user.email.trim();
    return "GuimFinancial";
  }, [profileName, user]);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  function handleProfileFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg(language === "pt" ? "Envie uma imagem valida." : "Upload a valid image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!user) return;

    const nextName = profileName.trim();
    if (!nextName) {
      setErrorMsg(language === "pt" ? "Informe um nome." : "Enter a name.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          username: nextName,
          avatar_url: profileAvatar || null,
        },
      });
      if (error) throw error;

      saveProfileSettings({
        name: nextName,
        avatarUrl: profileAvatar || undefined,
      });

      window.dispatchEvent(new Event("profile-updated"));
      window.dispatchEvent(new Event("data-refresh"));
      setSaved(true);
      setIsEditOpen(false);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setErrorMsg(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[28px] border border-[#24304A] bg-[radial-gradient(circle_at_top_left,#1C2940_0%,#121825_48%,#0E121A_100%)] p-6 shadow-[0_28px_70px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-[#31405F] bg-[#101827] text-xl font-semibold text-[#EAF3FF]">
              {profileAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileAvatar} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8FA2C9]">
                {t("profile.yourProfile")}
              </p>
              <h1 className="truncate text-2xl font-semibold text-[#EEF4FF]">{displayName}</h1>
              <p className="truncate text-sm text-[#9BB0D8]">{user?.email || "--"}</p>
              <p className="mt-2 text-xs text-[#9BB0D8]">
                {language === "pt"
                  ? "Edite seu nome e avatar usados no app."
                  : "Edit the name and avatar used across the app."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setIsEditOpen(true);
            }}
            className="rounded-full border border-[#31405F] bg-[#111A28] px-4 py-2 text-sm font-semibold text-[#EAF3FF]"
          >
            {t("common.edit")}
          </button>
        </div>
      </section>

      {saved ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          {t("profile.saved")}
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <p className="text-sm text-[#9CA3AF]">{t("common.loading")}</p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.sectionBasic")}</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[#8A93A3]">{t("more.profileName")}</p>
                <p className="mt-1 text-[#E6EDF3]">{displayName}</p>
              </div>
              <div className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[#8A93A3]">
                  {language === "pt" ? "E-mail" : "Email"}
                </p>
                <p className="mt-1 text-[#E6EDF3]">{user?.email || "--"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
            <p className="text-sm font-semibold text-[#E4E7EC]">
              {language === "pt" ? "Sobre este perfil" : "About this profile"}
            </p>
            <p className="mt-3 text-sm leading-6 text-[#9CA3AF]">
              {language === "pt"
                ? "Amigos & Liga foi removido deste app. O perfil continua apenas com os dados basicos da sua conta."
                : "Friends & League has been removed from this app. Your profile now keeps only the basic account information."}
            </p>
          </div>
        </section>
      )}

      {isEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060B14]/80 px-4 py-6 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("profile.sectionBasic")}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#1E232E] bg-[#121621] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.sectionBasic")}</p>
                <p className="mt-1 text-xs text-[#8A93A3]">
                  {language === "pt"
                    ? "Atualize os dados basicos do seu perfil."
                    : "Update your basic profile details."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setErrorMsg(null);
                }}
                className="rounded-full border border-[#2A3140] bg-[#151A27] px-4 py-2 text-xs text-[#E6EDF3]"
              >
                {t("common.cancel")}
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="flex w-fit cursor-pointer items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-[#263043] bg-[#0F141E] text-xs font-semibold text-[#E2E6ED]">
                  {profileAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileAvatar} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfileFileChange}
                />
                <span className="rounded-full border border-[#2A3140] bg-[#151A27] px-4 py-2 text-xs text-[#E6EDF3]">
                  {t("more.profileChoose")}
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-[0.18em] text-[#8A93A3]">
                  {t("more.profileName")}
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder={t("more.profileNamePlaceholder")}
                  className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
                />
              </div>

              {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditOpen(false);
                    setErrorMsg(null);
                  }}
                  className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-3 text-sm font-semibold text-[#E6EDF3]"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-xl bg-[#E6EDF3] px-6 py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
