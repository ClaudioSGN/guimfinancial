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
      {/* Profile hero */}
      <div className="ui-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-bright)] bg-[var(--surface-3)] text-base font-semibold text-[var(--text-1)]">
              {profileAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileAvatar} alt={displayName} className="h-full w-full object-cover" />
              ) : initials}
            </div>
            <div className="min-w-0">
              <p className="ui-eyebrow">{t("profile.yourProfile")}</p>
              <h1 className="truncate text-lg font-semibold text-[var(--text-1)]">{displayName}</h1>
              <p className="truncate text-xs text-[var(--text-3)]">{user?.email || "--"}</p>
            </div>
          </div>
          <button type="button" onClick={() => { setErrorMsg(null); setIsEditOpen(true); }} className="ui-btn ui-btn-secondary shrink-0">
            {t("common.edit")}
          </button>
        </div>
      </div>

      {saved ? (
        <div className="rounded-xl border border-[var(--green)] border-opacity-30 bg-[var(--green-dim)] px-4 py-3 text-xs text-[var(--green)]">
          {t("profile.saved")}
        </div>
      ) : null}

      {loading ? (
        <div className="ui-card p-5">
          <p className="text-sm text-[var(--text-3)]">{t("common.loading")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="ui-card p-5">
            <p className="text-sm font-semibold text-[var(--text-1)]">{t("profile.sectionBasic")}</p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="ui-card-inner px-4 py-3">
                <p className="ui-eyebrow">{t("more.profileName")}</p>
                <p className="mt-1 text-sm text-[var(--text-1)]">{displayName}</p>
              </div>
              <div className="ui-card-inner px-4 py-3">
                <p className="ui-eyebrow">{language === "pt" ? "E-mail" : "Email"}</p>
                <p className="mt-1 text-sm text-[var(--text-1)]">{user?.email || "--"}</p>
              </div>
            </div>
          </div>

          <div className="ui-card p-5">
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {language === "pt" ? "Sobre este perfil" : "About this profile"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-3)]">
              {language === "pt"
                ? "O perfil exibe os dados básicos da sua conta Supabase."
                : "Your profile displays the basic account information."}
            </p>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {isEditOpen ? (
        <div className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => { setIsEditOpen(false); setErrorMsg(null); }}>
          <div className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">{t("profile.sectionBasic")}</p>
                <p className="mt-0.5 text-xs text-[var(--text-3)]">
                  {language === "pt" ? "Atualize os dados do seu perfil." : "Update your profile details."}
                </p>
              </div>
              <button type="button" onClick={() => { setIsEditOpen(false); setErrorMsg(null); }} className="ui-btn ui-btn-ghost ui-btn-sm">
                {t("common.cancel")}
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex w-fit cursor-pointer items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-bright)] bg-[var(--surface-3)] text-xs font-semibold text-[var(--text-1)]">
                  {profileAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileAvatar} alt={displayName} className="h-full w-full object-cover" />
                  ) : initials}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileFileChange} />
                <span className="ui-btn ui-btn-secondary ui-btn-sm">{t("more.profileChoose")}</span>
              </label>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">{t("more.profileName")}</label>
                <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={t("more.profileNamePlaceholder")} className="ui-input" />
              </div>

              {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}

              <div className="flex gap-2 sm:justify-end">
                <button type="button" onClick={() => { setIsEditOpen(false); setErrorMsg(null); }} className="ui-btn ui-btn-secondary flex-1 sm:flex-none">
                  {t("common.cancel")}
                </button>
                <button type="button" onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary flex-1 sm:flex-none">
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
