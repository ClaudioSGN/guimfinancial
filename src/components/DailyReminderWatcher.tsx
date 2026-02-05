"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

type CreditCardReminder = {
  id: string;
  name: string;
  closingDay: number | null;
  dueDay: number | null;
};

const POLL_INTERVAL_MS = 30_000; // checa a cada 30s
const REMINDER_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
type TauriNotificationApi = {
  isPermissionGranted?: () => Promise<boolean>;
  requestPermission?: () => Promise<"granted" | "denied" | "prompt">;
  sendNotification?: (payload: { title: string; body: string }) => void;
};

function getTauriNotificationApi(): TauriNotificationApi | null {
  if (typeof window === "undefined") return null;
  const tauri = (window as { __TAURI__?: { notification?: TauriNotificationApi } })
    .__TAURI__;
  return tauri?.notification ?? null;
}

// chave pra marcar que já notificou hoje
function getDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getReminderKey(kind: string, dateKey: string, id?: string) {
  return `reminder-shown-${kind}-${id ?? "global"}-${dateKey}`;
}

async function fetchSettingsFromSupabase(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from("reminder_settings")
    .select("remind_enabled, remind_hour, remind_minute")
    .eq("id", REMINDER_SETTINGS_ID)
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

async function fetchCreditCards(): Promise<CreditCardReminder[]> {
  const { data, error } = await supabase
    .from("credit_cards")
    .select("id,name,closing_day,due_day");

  if (error) {
    console.error("Erro ao carregar credit_cards:", error.message);
    return [];
  }

  return (data ?? []).map((card) => ({
    id: card.id,
    name: card.name ?? "Cartao",
    closingDay: card.closing_day ?? null,
    dueDay: card.due_day ?? null,
  }));
}

async function ensureNotificationPermission(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (!enabled) return;
  const tauriNotification = getTauriNotificationApi();
  if (tauriNotification?.isPermissionGranted && tauriNotification.requestPermission) {
    try {
      const granted = await tauriNotification.isPermissionGranted();
      if (!granted) {
        await tauriNotification.requestPermission();
      }
    } catch (e) {
      console.error("Erro ao pedir permissao de notificacao:", e);
    }
    return;
  }
  if (!("Notification" in window)) return;

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

function notify(title: string, body: string, tag: string) {
  if (typeof window === "undefined") return;
  const tauriNotification = getTauriNotificationApi();
  if (tauriNotification?.sendNotification) {
    try {
      tauriNotification.sendNotification({ title, body });
    } catch (e) {
      console.error("Erro ao enviar notificacao:", e);
    }
    return;
  }

  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(title, {
    body,
    tag,
  });
}

function isWithinReminderWindow(now: Date, settings: ReminderSettings) {
  const target = new Date();
  target.setHours(settings.hour, settings.minute, 0, 0);
  const diffMs = now.getTime() - target.getTime();
  return diffMs >= 0 && diffMs < 10 * 60 * 1000;
}

function matchesDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getValidDay(date: Date, day: number) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

function maybeShowNotifications(
  settings: ReminderSettings,
  cards: CreditCardReminder[],
) {
  if (typeof window === "undefined") return;
  if (!settings.enabled) return;

  const now = new Date();
  if (!isWithinReminderWindow(now, settings)) return;

  const dateKey = getDateKey(now);
  const dailyKey = getReminderKey("daily", dateKey);

  if (localStorage.getItem(dailyKey) !== "yes") {
    notify(
      "Hora de rever financas e investimentos",
      "Abra o app e confira o resumo do dia.",
      "guim-financas-daily-reminder",
    );
    localStorage.setItem(dailyKey, "yes");
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  cards.forEach((card) => {
    if (card.closingDay) {
      const closingDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        getValidDay(now, card.closingDay),
      );
      if (matchesDate(today, closingDate)) {
        const closingKey = getReminderKey("card-closing", dateKey, card.id);
        if (localStorage.getItem(closingKey) !== "yes") {
          notify(
            `Cartao fecha hoje: ${card.name}`,
            "A fatura do cartao fechou hoje.",
            `guim-card-closing-${card.id}`,
          );
          localStorage.setItem(closingKey, "yes");
        }
      }
    }

    if (card.dueDay) {
      const dueDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        getValidDay(now, card.dueDay),
      );
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(dueDate.getDate() - 1);
      if (matchesDate(today, reminderDate)) {
        const dueKey = getReminderKey("card-due", dateKey, card.id);
        if (localStorage.getItem(dueKey) !== "yes") {
          notify(
            `Vencimento amanha: ${card.name}`,
            "A fatura vence amanha. Verifique o pagamento.",
            `guim-card-due-${card.id}`,
          );
          localStorage.setItem(dueKey, "yes");
        }
      }
    }
  });
}
export function DailyReminderWatcher() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [cards, setCards] = useState<CreditCardReminder[]>([]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const s = await fetchSettingsFromSupabase();
      const c = await fetchCreditCards();
      if (!mounted) return;

      if (s) {
        setSettings(s);
        await ensureNotificationPermission(s.enabled);
      }
      setCards(c);
    }

    init();

    function handleRefresh() {
      fetchCreditCards().then((next) => {
        if (mounted) setCards(next);
      });
    }

    window.addEventListener("data-refresh", handleRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("data-refresh", handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!settings) return;

    const id = setInterval(() => {
      maybeShowNotifications(settings, cards);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [settings, cards]);

  // componente “fantasma”: só cuida de notificações
  return null;
}

