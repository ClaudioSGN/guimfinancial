"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
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
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [resettingData, setResettingData] = useState(false);
  const [resetDataError, setResetDataError] = useState<string | null>(null);
  const [resetDataSuccess, setResetDataSuccess] = useState(false);

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
  }, []);

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

  async function handleResetAllData() {
    if (!user || resettingData) return;
    setResetDataError(null);
    setResetDataSuccess(false);

    const confirmed = window.confirm(t("more.resetDataConfirm"));
    if (!confirmed) return;

    const typed = window.prompt(`${t("more.resetDataTypeToConfirm")} RESET`);
    if (typed?.trim().toUpperCase() !== "RESET") {
      setResetDataError(t("more.resetDataTypingMismatch"));
      return;
    }

    setResettingData(true);

    const tables = [
      "gamification_user_missions",
      "gamification_user_medals",
      "gamification_wallet_monthly",
      "gamification_friendships",
      "gamification_profiles",
      "investment_purchases",
      "investments",
      "transactions",
      "transfers",
      "credit_cards",
      "accounts",
      "reminder_settings",
      "goals",
    ] as const;

    const errors: string[] = [];

    for (const table of tables) {
      // Some installations may not have optional tables (ex: goals) yet.
      const { error } = await (supabase.from(table as any) as any)
        .delete()
        .eq("user_id", user.id);
      if (!error) continue;
      if (error.code === "42P01") continue;
      errors.push(`${table}: ${error.message}`);
    }

    setResettingData(false);

    if (errors.length > 0) {
      console.error("[more] reset data errors:", errors);
      setResetDataError(t("more.resetDataError"));
      return;
    }

    window.localStorage.removeItem(STORAGE_KEYS.enabled);
    window.localStorage.removeItem(STORAGE_KEYS.time);
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("reminder-shown-")) {
        window.localStorage.removeItem(key);
      }
    }
    setEnabled(true);
    setHour(9);
    setMinute(0);
    window.dispatchEvent(new Event("data-refresh"));
    setResetDataSuccess(true);
    setTimeout(() => setResetDataSuccess(false), 3000);
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
                onClick={handleResetAllData}
                disabled={resettingData}
                className="w-full rounded-2xl border border-[#5D3A16] bg-[#24190E] p-4 text-left disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#F2C38B]">
                  {resettingData ? t("common.loading") : t("more.resetData")}
                </p>
                <p className="text-xs text-[#D6B086]">{t("more.resetDataHint")}</p>
              </button>
              {resetDataError ? <p className="text-xs text-red-400">{resetDataError}</p> : null}
              {resetDataSuccess ? (
                <p className="text-xs text-[#5DD6C7]">{t("more.resetDataSuccess")}</p>
              ) : null}

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
