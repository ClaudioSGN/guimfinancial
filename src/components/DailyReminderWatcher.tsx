"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { getErrorMessage, isTransientNetworkError } from "@/lib/errorUtils";

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

type FixedBillReminder = {
  id: string;
  name: string;
  dueDay: number | null;
  amount: number;
};

const POLL_INTERVAL_MS = 30_000;
const REMINDER_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function getDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getReminderKey(kind: string, dateKey: string, id?: string) {
  return `reminder-shown-${kind}-${id ?? "global"}-${dateKey}`;
}

function logReminderLoadError(scope: string, error: unknown) {
  if (isTransientNetworkError(error)) {
    console.warn(`[reminder] ${scope}:`, getErrorMessage(error));
    return;
  }
  console.error(`[reminder] ${scope}:`, error);
}

async function fetchSettingsFromSupabase(): Promise<ReminderSettings | null> {
  try {
    const { data, error } = await supabase
      .from("reminder_settings")
      .select("remind_enabled, remind_hour, remind_minute")
      .eq("id", REMINDER_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      logReminderLoadError("erro ao carregar reminder_settings", error);
      return null;
    }

    if (!data) return null;

    return {
      enabled: !!data.remind_enabled,
      hour: data.remind_hour ?? 20,
      minute: data.remind_minute ?? 0,
    };
  } catch (error) {
    logReminderLoadError("falha ao carregar reminder_settings", error);
    return null;
  }
}

async function fetchCreditCards(): Promise<CreditCardReminder[]> {
  try {
    const { data, error } = await supabase
      .from("credit_cards")
      .select("id,name,closing_day,due_day");

    if (error) {
      logReminderLoadError("erro ao carregar credit_cards", error);
      return [];
    }

    return (data ?? []).map((card) => ({
      id: card.id,
      name: card.name ?? "Cartao",
      closingDay: card.closing_day ?? null,
      dueDay: card.due_day ?? null,
    }));
  } catch (error) {
    logReminderLoadError("falha ao carregar credit_cards", error);
    return [];
  }
}

async function fetchFixedBills(): Promise<FixedBillReminder[]> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,description,category,date,amount,is_fixed,type")
      .eq("is_fixed", true)
      .in("type", ["expense", "card_expense"]);

    if (error) {
      logReminderLoadError("erro ao carregar contas fixas", error);
      return [];
    }

    return (data ?? []).map((item) => {
      const rawDate = typeof item.date === "string" ? item.date : "";
      const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dueDay = match ? Number(match[3]) : null;
      return {
        id: item.id,
        name: item.description || item.category || "Conta fixa",
        dueDay: Number.isFinite(dueDay) ? dueDay : null,
        amount: Number(item.amount) || 0,
      };
    });
  } catch (error) {
    logReminderLoadError("falha ao carregar contas fixas", error);
    return [];
  }
}

async function ensureNotificationPermission(enabled: boolean) {
  if (typeof window === "undefined" || !enabled || !("Notification" in window)) return;

  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return;
  }

  const requested = localStorage.getItem("daily-reminder-permission-requested");
  if (requested === "yes") return;

  try {
    const result = await Notification.requestPermission();
    localStorage.setItem("daily-reminder-permission-requested", "yes");
    console.log("Permissao de notificacao:", result);
  } catch (error) {
    console.error("Erro ao pedir permissao de notificacao:", error);
  }
}

function notify(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
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
  fixedBills: FixedBillReminder[],
) {
  if (typeof window === "undefined" || !settings.enabled) return;

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

  fixedBills.forEach((bill) => {
    if (!bill.dueDay) return;

    const dueDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      getValidDay(now, bill.dueDay),
    );
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(dueDate.getDate() - 1);

    if (matchesDate(today, reminderDate)) {
      const dueKey = getReminderKey("fixed-bill-due", dateKey, bill.id);
      if (localStorage.getItem(dueKey) !== "yes") {
        notify(
          `Conta fixa vence amanha: ${bill.name}`,
          `Lembrete para ${bill.name} (${bill.amount.toFixed(2)}).`,
          `guim-fixed-bill-${bill.id}`,
        );
        localStorage.setItem(dueKey, "yes");
      }
    }
  });
}

export function DailyReminderWatcher() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [cards, setCards] = useState<CreditCardReminder[]>([]);
  const [fixedBills, setFixedBills] = useState<FixedBillReminder[]>([]);

  useEffect(() => {
    if (loading || !userId) return;

    let mounted = true;

    async function init() {
      const s = await fetchSettingsFromSupabase();
      const [c, bills] = await Promise.all([fetchCreditCards(), fetchFixedBills()]);
      if (!mounted) return;

      if (s) {
        setSettings(s);
        await ensureNotificationPermission(s.enabled);
      }
      setCards(c);
      setFixedBills(bills);
    }

    init();

    function handleRefresh() {
      Promise.all([fetchCreditCards(), fetchFixedBills()]).then(([nextCards, nextBills]) => {
        if (!mounted) return;
        setCards(nextCards);
        setFixedBills(nextBills);
      });
    }

    window.addEventListener("data-refresh", handleRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("data-refresh", handleRefresh);
    };
  }, [loading, userId]);

  useEffect(() => {
    if (!settings) return;

    const id = setInterval(() => {
      maybeShowNotifications(settings, cards, fixedBills);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [settings, cards, fixedBills]);

  return null;
}
