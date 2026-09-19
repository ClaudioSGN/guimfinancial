"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Big from "big.js";
import { useLanguage } from "@/lib/language";
import { supabase } from "@/lib/supabaseClient";
import { localDateKey, validateDollarPurchase, type DollarPurchase } from "@/lib/dollarPurchases";
import { formatCurrencyValue, type AppCurrency } from "../../shared/currency";

type Props = {
  userId: string;
  currency: AppCurrency;
  purchase: DollarPurchase | null;
  onClose: () => void;
  onSaved: (purchase: DollarPurchase) => void;
};

export function DollarPurchaseForm({ userId, currency, purchase, onClose, onSaved }: Props) {
  const { t, language } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  // Reuse the ID on retry: a lost response must not create a second purchase.
  const [id] = useState(() => purchase?.id ?? crypto.randomUUID());
  const [date, setDate] = useState(purchase?.date ?? localDateKey());
  const [paidCurrency, setPaidCurrency] = useState(purchase?.currency ?? currency);
  const [usd, setUsd] = useState(purchase ? String(purchase.usd_amount) : "");
  const [paid, setPaid] = useState(purchase ? String(purchase.total_paid) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = { date, usd_amount: usd, total_paid: paid, currency: paidCurrency };
  const valid = validateDollarPurchase(draft) === null;
  const rate = valid ? new Big(paid).div(usd).toNumber() : null;

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const problem = validateDollarPurchase(draft);
    if (problem) { setError(t(problem === "date" ? "dollars.invalidDate" : "dollars.invalidAmount")); return; }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = { id, user_id: userId, ...draft };
      const query = purchase
        ? supabase.from("dollar_purchases").update(payload).eq("id", id).eq("user_id", userId)
        : supabase.from("dollar_purchases").upsert(payload, { onConflict: "id" });
      const { data, error: saveError } = await query.select("id,user_id,date,usd_amount,total_paid,currency").single();
      if (saveError || !data) throw saveError ?? new Error("Missing saved purchase");
      onSaved(data as DollarPurchase);
    } catch {
      setError(t("dollars.saveError"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="dollar-purchase-title"
      onCancel={(event) => { event.preventDefault(); if (!busy.current) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[var(--border-bright)] bg-[var(--surface)] p-5 text-[var(--text-1)] shadow-2xl backdrop:bg-black/70">
      <h2 id="dollar-purchase-title" className="text-lg font-semibold">{t(purchase ? "dollars.editPurchase" : "dollars.add")}</h2>
      <p className="mt-2 text-sm text-[var(--text-3)]">{t("dollars.formHint")}</p>
      <form onSubmit={(event) => void save(event)} className="mt-5 space-y-4">
        <fieldset disabled={saving} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span>{t("dollars.date")}</span>
            <input className="ui-input" type="date" required max={localDateKey()} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("dollars.usdReceived")}</span>
            <input className="ui-input" type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" required value={usd} onChange={(event) => setUsd(event.target.value)} placeholder="100.00" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px]">
            <label className="block space-y-1 text-sm">
              <span>{t("dollars.totalPaid")}</span>
              <input className="ui-input" type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" required value={paid} onChange={(event) => setPaid(event.target.value)} placeholder="520.00" />
            </label>
            <div className="space-y-1 text-sm">
              <label htmlFor="dollar-paid-currency" className="block">{t("dollars.currency")}</label>
              <select id="dollar-paid-currency" className="ui-select" value={paidCurrency} onChange={(event) => setPaidCurrency(event.target.value as AppCurrency)}>
                <option value="BRL">BRL</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </fieldset>
        <p className="ui-card-inner p-3 text-sm text-[var(--text-2)]" aria-live="polite">
          {t("dollars.effectiveRate")}: {rate === null ? "—" : `US$ 1 = ${formatCurrencyValue(rate, language, paidCurrency, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
        </p>
        {error ? <p role="alert" className="text-sm text-[var(--red)]">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="ui-btn ui-btn-secondary" type="button" disabled={saving} onClick={onClose}>{t("common.cancel")}</button>
          <button className="ui-btn ui-btn-primary" type="submit" disabled={saving}>{t(saving ? "common.saving" : "common.save")}</button>
        </div>
      </form>
    </dialog>
  );
}
