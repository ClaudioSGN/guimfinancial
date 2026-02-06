"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { loadProfileSettings, saveProfileSettings } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";
import { CheckForUpdatesCard } from "@/components/CheckForUpdatesCard";

const STORAGE_KEYS = {
  enabled: "dailyReminderEnabled",
  time: "dailyReminderTime",
};
const REMINDER_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function MoreScreen() {
  const { language, setLanguage, t } = useLanguage();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    const storedEnabled = window.localStorage.getItem(STORAGE_KEYS.enabled);
    const storedTime = window.localStorage.getItem(STORAGE_KEYS.time);
    if (storedEnabled != null) setEnabled(storedEnabled === "true");
    if (storedTime) {
      const [h, m] = storedTime.split(":").map((value) => Number(value));
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        setHour(h);
        setMinute(m);
      }
    }

    const profile = loadProfileSettings();
    if (profile.avatarUrl) setProfileAvatar(profile.avatarUrl);
  }, []);

  useEffect(() => {
    const username = user?.user_metadata?.username;
    if (typeof username === "string") {
      setProfileName(username);
    }
  }, [user]);

  const timeLabel = useMemo(() => `${pad2(hour)}:${pad2(minute)}`, [hour, minute]);

  async function handleSave() {
    setErrorMsg(null);
    setSaved(false);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      setErrorMsg(language === "pt" ? "Hora inválida." : "Invalid time.");
      return;
    }

    setSaving(true);
    window.localStorage.setItem(STORAGE_KEYS.enabled, String(enabled));
    window.localStorage.setItem(STORAGE_KEYS.time, timeLabel);
    const { error } = await supabase.from("reminder_settings").upsert([
      {
        id: REMINDER_SETTINGS_ID,
        remind_enabled: enabled,
        remind_hour: hour,
        remind_minute: minute,
      },
    ]);
    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg(
        language === "pt"
          ? "Falha ao guardar lembrete."
          : "Failed to save reminder.",
      );
      return;
    }

    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("reminder-shown-")) {
        window.localStorage.removeItem(key);
      }
    }
    window.dispatchEvent(new Event("data-refresh"));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleProfileFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProfileErrorMsg(null);
    if (!file.type.startsWith("image/")) {
      setProfileErrorMsg(
        language === "pt" ? "Envie uma imagem valida." : "Upload a valid image.",
      );
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

  function handleProfileSave() {
    setProfileErrorMsg(null);
    setProfileSaving(true);
    if (!user) {
      setProfileErrorMsg(
        language === "pt" ? "Entre para salvar seu perfil." : "Sign in to save your profile.",
      );
      setProfileSaving(false);
      return;
    }
    const nextUsername = profileName.trim();
    if (!nextUsername) {
      setProfileErrorMsg(
        language === "pt" ? "Informe um nome de usuario." : "Enter a username.",
      );
      setProfileSaving(false);
      return;
    }
    supabase.auth
      .updateUser({ data: { username: nextUsername } })
      .then(({ error }) => {
        if (error) {
          setProfileErrorMsg(error.message);
          setProfileSaving(false);
          return;
        }
        saveProfileSettings({
          avatarUrl: profileAvatar || undefined,
        });
        window.dispatchEvent(new Event("profile-updated"));
        setProfileSaving(false);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2500);
      });
  }

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      console.error(error);
      setSignOutError(
        language === "pt" ? "Falha ao sair." : "Failed to sign out.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
          {t("tabs.more")}
        </p>
        <p className="text-2xl font-semibold text-[#E5E8EF]">{t("more.title")}</p>
        <p className="text-sm text-[#9CA3AF]">{t("more.subtitle")}</p>
      </div>

      <div id="profile" className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.profileTitle")}</p>
        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.profilePhoto")}</p>
              <p className="text-xs text-[#8A93A3]">{t("more.profilePhotoHint")}</p>
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[#263043] bg-[#0F141E] text-xs font-semibold text-[#E2E6ED]">
                {profileAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileAvatar}
                    alt="Profile avatar preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "GF"
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
          </div>

          <div className="mt-4 flex flex-col gap-2">
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
            {user?.email ? (
              <p className="text-xs text-[#8A93A3]">Email: {user.email}</p>
            ) : null}
          </div>

          <div className="mt-4 space-y-2 text-xs">
            {profileErrorMsg ? (
              <p className="text-red-400">{profileErrorMsg}</p>
            ) : null}
            {profileSaved ? (
              <p className="text-[#5DD6C7]">{t("more.profileSaved")}</p>
            ) : null}
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {profileSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.dailyReminder")}</p>
        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.enableReminder")}</p>
              <p className="text-xs text-[#8A93A3]">{t("more.reminderHelper")}</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((value) => !value)}
              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${
                enabled ? "bg-[#2F6C73]" : "bg-[#2A2F3A]"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-[#E0F2F1] transition ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.reminderTime")}</p>
              <p className="text-xs text-[#8A93A3]">{t("more.reminderTimeHelper")}</p>
            </div>
            <input
              type="time"
              value={timeLabel}
              onChange={(event) => {
                const [h, m] = event.target.value.split(":").map((value) => Number(value));
                if (!Number.isNaN(h)) setHour(h);
                if (!Number.isNaN(m)) setMinute(m);
              }}
              className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 rounded-full border border-[#1B2232] bg-[#0C1018] px-3 py-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  enabled ? "bg-[#5DD6C7]" : "bg-[#5B667A]"
                }`}
              />
              <span className="text-[#C7CEDA]">
                {enabled ? t("more.active") : t("more.paused")}
              </span>
            </div>
            <span className="text-[#7F8694]">
              {enabled ? `${t("more.next")}: ${timeLabel}` : t("more.notScheduled")}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
            {saved && !errorMsg ? (
              <p className="text-xs text-[#5DD6C7]">{t("more.saved")}</p>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-[#E6EDF3] py-2 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.moreOptions")}</p>
        <div className="space-y-3">
          <Link
            href="/accounts"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.accounts")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.accountsHint")}</p>
          </Link>
          <Link
            href="/cards"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.cards")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.cardsHint")}</p>
          </Link>
          <Link
            href="/export"
            className="block rounded-2xl border border-[#1C2332] bg-[#0F121A] p-4"
          >
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("more.export")}</p>
            <p className="text-xs text-[#8B94A6]">{t("more.exportHint")}</p>
          </Link>

          <CheckForUpdatesCard />

          {user ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full rounded-2xl border border-[#3A1E1E] bg-[#1A0F0F] p-4 text-left disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#F3B5B5]">
                  {signingOut ? t("common.loading") : t("more.signOut")}
                </p>
                <p className="text-xs text-[#CFA5A5]">{t("more.signOutHint")}</p>
              </button>
              {signOutError ? <p className="text-xs text-red-400">{signOutError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-[#C7CEDA]">{t("more.language")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setLanguage("pt")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              language === "pt"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.portuguese")}
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-semibold ${
              language === "en"
                ? "border-[#3A8F8A] bg-[#163137] text-[#DCE3EE]"
                : "border-[#1C2332] bg-[#0F121A] text-[#DCE3EE]"
            }`}
          >
            {t("more.english")}
          </button>
        </div>
      </div>
    </div>
  );
}
