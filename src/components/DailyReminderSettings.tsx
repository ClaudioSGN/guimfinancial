"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  initialSettings: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function DailyReminderSettings({ initialSettings }: Props) {
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [time, setTime] = useState(
    `${pad2(initialSettings.hour)}:${pad2(initialSettings.minute)}`
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave() {
    setErrorMsg(null);
    setSaved(false);

    const [hStr, mStr] = time.split(":");
    const hour = Number(hStr);
    const minute = Number(mStr);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      setErrorMsg("Hora inválida.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("reminder_settings").upsert([
      {
        id: "default",
        remind_enabled: enabled,
        remind_hour: hour,
        remind_minute: minute,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Erro ao guardar lembrete.");
      return;
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("daily-reminder-shown");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <section className="rounded-2xl border border-zinc-900 bg-zinc-950/80 p-4 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
            Lembrete diário
          </p>
          <p className="text-[11px] text-zinc-400">
            Recebe um lembrete para rever as finanças uma vez por dia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400">
            Hora do lembrete:
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-400"
          />
        </div>
        <div className="flex items-center gap-2">
          {errorMsg && (
            <span className="text-[11px] text-red-400">
              {errorMsg}
            </span>
          )}
          {saved && !errorMsg && (
            <span className="text-[11px] text-emerald-400">
              Lembrete guardado.
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
          >
            {saving ? "A guardar..." : "Guardar"}
          </button>
        </div>
      </div>
    </section>
  );
}
