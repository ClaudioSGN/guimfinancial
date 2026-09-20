"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { todayKey, totalDollars, validAmount, validDate, type DollarEntry } from "./ledger";
import { deleteEntry, DOLLARS_CHANGED, readEntries, saveEntry } from "./storage";

export function DollarBalanceCard({ showAmounts }: { showAmounts: boolean }) {
  const { user } = useAuth();
  return user ? <DollarCard key={user.id} userId={user.id} showAmounts={showAmounts} /> : null;
}

function DollarCard({ userId, showAmounts }: { userId: string; showAmounts: boolean }) {
  const { t, language } = useLanguage();
  const [entries, setEntries] = useState<DollarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<DollarEntry | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const confirmDeleteButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const formatter = useMemo(() => new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }), [language]);
  const total = useMemo(() => totalDollars(entries), [entries]);
  // Intl supports exact decimal strings; TypeScript's older Intl types omit them.
  const money = (value: string) => showAmounts ? formatter.format(value as unknown as number) : "••••••";
  const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language === "pt" ? "pt-BR" : "en-US");

  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const rows = await readEntries(userId);
      if (version === request.current) {
        setEntries(rows);
        setLoadError(false);
      }
    } catch {
      if (version === request.current) setLoadError(true);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(DOLLARS_CHANGED);
      channel.onmessage = onChange;
    } catch { /* Focus refresh still works without cross-tab messaging. */ }
    window.addEventListener(DOLLARS_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      request.current += 1;
      channel?.close();
      window.removeEventListener(DOLLARS_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  function start(button: HTMLButtonElement, entry?: DollarEntry) {
    returnFocus.current = button;
    setError(null);
    setFeedback(null);
    setDeleting(null);
    setEditing(entry ?? { id: crypto.randomUUID(), date: todayKey(), usd: "" });
  }

  function closeEditor() {
    setEditing(null);
    requestAnimationFrame(() => {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      else addButton.current?.focus();
    });
  }

  async function save(entry: DollarEntry) {
    await saveEntry(userId, entry);
    await refresh();
    closeEditor();
    setFeedback("saved");
  }

  async function remove(id: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await deleteEntry(userId, id);
      await refresh();
      setDeleting(null);
      setFeedback("deleted");
      requestAnimationFrame(() => (historyButton.current ?? addButton.current)?.focus());
    } catch {
      setError("deleteError");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function cancelDelete(id: string) {
    setDeleting(null);
    setError(null);
    requestAnimationFrame(() => document.getElementById(`dollar-delete-${id}`)?.focus());
  }

  return (
    <section className="ui-card min-w-0 p-5" aria-labelledby="dollar-card-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dollar-card-title" className="text-sm font-semibold">{t("dollarBalance.title")}</h2>
        <span className="ui-badge ui-badge-neutral">USD</span>
      </div>
      {loadError ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm text-[var(--red)]">{t("dollarBalance.loadError")}</p>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void refresh()}>{t("dollarBalance.retry")}</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="ui-amount break-all text-2xl" aria-label={t("dollarBalance.total")}>
            {loading ? "—" : money(total)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("dollarBalance.total")}</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button ref={addButton} type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={busy || !!editing}
          onClick={(event) => start(event.currentTarget)}>
          <span aria-hidden="true"><AppIcon name="plus" size={14} /></span>
          {t("dollarBalance.add")}
        </button>
        {!loadError && entries.length > 0 ? (
          <button ref={historyButton} type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy || !!editing}
            aria-expanded={expanded} aria-controls="dollar-history" onClick={() => {
              setExpanded((value) => !value);
              setDeleting(null);
              setError(null);
            }}>
            {t("dollarBalance.history")}
            <span aria-hidden="true" className={expanded ? "rotate-180" : ""}><AppIcon name="chevron-down" size={14} /></span>
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-3)]">{t("dollarBalance.storageHint")}</p>

      {editing ? <DollarForm key={editing.id} entry={editing} formatter={formatter} onSave={save} onCancel={closeEditor} /> : null}
      {feedback ? <p role="status" className="mt-3 text-xs text-[var(--green)]">{t(`dollarBalance.${feedback}`)}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--red)]">{t(`dollarBalance.${error}`)}</p> : null}

      {expanded && !loadError && entries.length > 0 ? (
        <div id="dollar-history" className="mt-4 border-t border-[var(--border)]">
          <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto">
            {entries.slice(0, visibleCount).map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="ui-amount break-all text-sm">{money(entry.usd)}</p>
                  <time dateTime={entry.date} className="text-xs text-[var(--text-3)]">{formatDate(entry.date)}</time>
                </div>
                {deleting === entry.id ? (
                  <div className="w-full space-y-2" onKeyDown={(event) => {
                    if (event.key === "Escape" && !busy) { event.preventDefault(); cancelDelete(entry.id); }
                  }}>
                    <p className="text-xs">{t("dollarBalance.confirmDelete")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button ref={confirmDeleteButton} type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={busy} onClick={() => void remove(entry.id)}>{t("dollarBalance.delete")}</button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={() => cancelDelete(entry.id)}>{t("common.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy || !!editing} onClick={(event) => start(event.currentTarget, entry)}>{t("common.edit")}</button>
                    <button id={`dollar-delete-${entry.id}`} type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy || !!editing} onClick={() => {
                      setDeleting(entry.id);
                      setError(null);
                      setFeedback(null);
                      requestAnimationFrame(() => confirmDeleteButton.current?.focus());
                    }}>{t("dollarBalance.delete")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {visibleCount < entries.length ? <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm mt-2" onClick={() => setVisibleCount((value) => value + 5)}>{t("dollarBalance.more")}</button> : null}
        </div>
      ) : null}
    </section>
  );
}

function DollarForm({ entry, formatter, onSave, onCancel }: {
  entry: DollarEntry;
  formatter: Intl.NumberFormat;
  onSave: (entry: DollarEntry) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [cents, setCents] = useState(entry.usd ? totalDollars([entry]).replace(".", "") : "");
  const [date, setDate] = useState(entry.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const amountInput = useRef<HTMLInputElement>(null);

  useEffect(() => { amountInput.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const digits = cents.padStart(3, "0");
    const usd = `${digits.slice(0, -2).replace(/^0+(?=\d)/, "")}.${digits.slice(-2)}`;
    if (!validAmount(usd)) { setError("invalidAmount"); return; }
    if (!validDate(date) || date > todayKey()) { setError("invalidDate"); return; }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...entry, usd, date });
    } catch {
      setError("saveError");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form aria-label={t("dollarBalance.formTitle")} className="mt-4 border-t border-[var(--border)] pt-4" onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); } }}>
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <label className="block space-y-1 text-xs text-[var(--text-2)]">
          <span>{t("dollarBalance.amount")}</span>
          <input ref={amountInput} className="ui-input" inputMode="numeric" autoComplete="off" required
            placeholder={formatter.format(0)} value={cents ? formatter.format(Number(cents) / 100) : ""}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
              if (digits.length <= 14) setCents(digits);
              setError(null);
            }} />
        </label>
        <label className="block min-w-0 space-y-1 text-xs text-[var(--text-2)]">
          <span>{t("dollarBalance.date")}</span>
          <input className="ui-input min-w-0 max-w-full" type="date" required max={todayKey()} value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} />
        </label>
      </fieldset>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--red)]">{t(`dollarBalance.${error}`)}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy}>{t(busy ? "common.saving" : "common.save")}</button>
      </div>
    </form>
  );
}
