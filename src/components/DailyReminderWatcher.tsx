"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

const POLL_INTERVAL_MS = 30_000; // checa a cada 30s

// chave pra marcar que já notificou hoje
function getStorageKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `daily-reminder-shown-${y}${m}${d}`;
}

async function fetchSettingsFromSupabase(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from("reminder_settings")
    .select("remind_enabled, remind_hour, remind_minute")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar reminder_settings:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    enabled: !!data.remind_enabled,
    hour: data.remind_hour ?? 20,
    minute: data.remind_minute ?? 0,
  };
}

async function ensureNotificationPermission(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (!enabled) return;

  // já tem permissão decidida
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return;
  }

  // evita ficar pedindo toda hora
  const requested = localStorage.getItem("daily-reminder-permission-requested");
  if (requested === "yes") return;

  try {
    const result = await Notification.requestPermission();
    localStorage.setItem("daily-reminder-permission-requested", "yes");
    console.log("Permissão de notificação:", result);
  } catch (e) {
    console.error("Erro ao pedir permissão de notificação:", e);
  }
}

function maybeShowNotification(settings: ReminderSettings) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (!settings.enabled) return;
  if (Notification.permission !== "granted") return;

  const now = new Date();
  const key = getStorageKey(now);

  // já notificou hoje → sai
  if (localStorage.getItem(key) === "yes") return;

  // horário configurado (hoje)
  const target = new Date();
  target.setHours(settings.hour, settings.minute, 0, 0);

  const diffMs = now.getTime() - target.getTime();

  // janela de disparo: de 0 até +10min
  if (diffMs >= 0 && diffMs < 10 * 60 * 1000) {
    new Notification("Hora de rever as finanças 💸", {
      body: "Abre o app e dá uma olhada no teu resumo do dia.",
      tag: "guim-financas-daily-reminder",
    });

    localStorage.setItem(key, "yes");
  }
}

export function DailyReminderWatcher() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const s = await fetchSettingsFromSupabase();
      if (!mounted) return;

      if (s) {
        setSettings(s);
        await ensureNotificationPermission(s.enabled);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;

    const id = setInterval(() => {
      maybeShowNotification(settings);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [settings]);

  // componente “fantasma”: só cuida de notificações
  return null;
}
