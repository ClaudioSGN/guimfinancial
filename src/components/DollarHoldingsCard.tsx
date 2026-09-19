"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useLanguage } from "@/lib/language";
import { supabase } from "@/lib/supabaseClient";
import { hasMissingTableError } from "@/lib/errorUtils";
import { summarizeDollarPurchases, type DollarPurchase, type DollarQuotes } from "@/lib/dollarPurchases";
import { formatCurrencyValue, type AppCurrency } from "../../shared/currency";

const DollarPurchaseForm = dynamic(() => import("./DollarPurchaseForm").then((module) => module.DollarPurchaseForm));
const COLUMNS = "id,user_id,date,usd_amount,total_paid,currency";

export function DollarHoldingsCard({ showAmounts }: { showAmounts: boolean }) {
  const { user } = useAuth();
  return user ? <Holdings key={user.id} userId={user.id} showAmounts={showAmounts} /> : null;
}

function Holdings({ userId, showAmounts }: { userId: string; showAmounts: boolean }) {
  const { t, language } = useLanguage();
  const { currency } = useCurrency();
  const [purchases, setPurchases] = useState<DollarPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"unavailable" | "loadError" | null>(null);
  const [reload, setReload] = useState(0);
  const [quotes, setQuotes] = useState<DollarQuotes | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteReload, setQuoteReload] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(10);
  const [editor, setEditor] = useState<{ purchase: DollarPurchase | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);
  const [saved, setSaved] = useState(false);
  const mutationBusy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const rows: DollarPurchase[] = [];
        // Supabase limits results per request. Fetch all pages for accurate totals.
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.from("dollar_purchases").select(COLUMNS)
            .eq("user_id", userId).order("date", { ascending: false }).order("id", { ascending: false })
            .range(offset, offset + 499).abortSignal(controller.signal);
          if (error) throw error;
          if (controller.signal.aborted) return;
          rows.push(...(data as DollarPurchase[]));
          if (data.length < 500) break;
        }
        setPurchases(rows);
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(hasMissingTableError(error, ["dollar_purchases"]) ? "unavailable" : "loadError");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, reload]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/exchange-rates", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unavailable quote");
        const body = await response.json();
        if (!body.quotes?.BRL || !body.quotes?.EUR) throw new Error("Invalid quote");
        if (!controller.signal.aborted) { setQuotes(body.quotes); setQuoteError(false); }
      } catch {
        if (!controller.signal.aborted) { setQuotes(null); setQuoteError(true); }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [quoteReload]);

  const summaries = useMemo(() => summarizeDollarPurchases(purchases, quotes ?? {}), [purchases, quotes]);
  const usdFormatter = useMemo(() => new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "USD" }), [language]);
  const percentFormatter = useMemo(() => new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "exceptZero" }), [language]);
  const money = (value: number, code: AppCurrency, precision = 2) => showAmounts ? formatCurrencyValue(value, language, code, { minimumFractionDigits: precision, maximumFractionDigits: precision }) : "••••••";
  const dollars = (value: number) => showAmounts ? usdFormatter.format(value) : "••••••";
  const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language === "pt" ? "pt-BR" : "en-US");

  function openEditor(purchase: DollarPurchase | null) {
    setSaved(false);
    setMutationError(false);
    setEditor({ purchase });
  }

  async function remove(purchase: DollarPurchase) {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setDeleting(purchase.id);
    setMutationError(false);
    setSaved(false);
    try {
      const { error } = await supabase.from("dollar_purchases").delete()
        .eq("id", purchase.id).eq("user_id", userId).select("id").single();
      if (error) throw error;
      setPurchases((current) => current.filter((row) => row.id !== purchase.id));
      setConfirmDelete(null);
    } catch { setMutationError(true); }
    finally { setDeleting(null); mutationBusy.current = false; }
  }

  return (
    <section aria-labelledby="dollar-holdings-title" className="ui-card min-w-0 p-5 sm:col-span-2 lg:col-span-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="dollar-holdings-title" className="text-sm font-semibold text-[var(--text-1)]">{t("dollars.title")}</h2>
          <p className="mt-1 text-xs text-[var(--text-3)]">{t("dollars.subtitle")}</p>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={loading || !!loadError || !!deleting || !!editor} onClick={() => openEditor(null)}>{t("dollars.add")}</button>
      </div>
      {loading ? <p className="mt-4 text-sm text-[var(--text-3)]" role="status">{t("common.loading")}</p> : loadError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-[var(--text-3)]">{t(`dollars.${loadError}`)}</p>
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>{t("dollars.retry")}</button>
        </div>
      ) : !purchases.length ? <p className="mt-4 text-sm text-[var(--text-3)]">{t("dollars.empty")}</p> : (
        <div className="mt-4 space-y-3">
          {summaries.map((summary) => (
            <div key={summary.currency} className="ui-card-inner p-4">
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0">
                  <p className="ui-eyebrow">{t("dollars.purchased")} · {summary.currency}</p>
                  <p className="ui-amount mt-1 break-all text-xl">{dollars(summary.usd)}</p>
                  <p className="mt-1 break-words text-xs text-[var(--text-3)]">{t("dollars.averageRate")}: {money(summary.averageRate, summary.currency, 4)}/USD</p>
                </div>
                <div className="min-w-0"><p className="ui-eyebrow">{t("dollars.invested")}</p><p className="ui-amount mt-1 break-all text-lg">{money(summary.paid, summary.currency)}</p></div>
                <div className="min-w-0"><p className="ui-eyebrow">{t("dollars.currentValue")}</p><p className="ui-amount mt-1 break-all text-lg">{summary.value === null ? "—" : money(summary.value, summary.currency)}</p></div>
                <div className="min-w-0">
                  <p className="ui-eyebrow">{t("dollars.variation")}</p>
                  <p className={`ui-amount mt-1 break-all text-lg ${showAmounts && summary.gain !== null ? summary.gain >= 0 ? "text-[var(--green)]" : "text-[var(--red)]" : ""}`}>
                    {summary.gain === null ? "—" : `${showAmounts && summary.gain > 0 ? "+" : ""}${money(summary.gain, summary.currency)}`}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">{summary.gainPercent === null ? "—" : showAmounts ? `${percentFormatter.format(summary.gainPercent)}%` : "••••••"}</p>
                </div>
              </div>
              {quotes?.[summary.currency] ? <p className="mt-3 text-xs text-[var(--text-3)]">US$ 1 = {formatCurrencyValue(quotes[summary.currency].rate, language, summary.currency, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} · {t("dollars.asOf")} {dateLabel(quotes[summary.currency].date)}</p> : null}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-3)]">
        <p className="max-w-2xl">{t("dollars.referenceHint")} <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer" className="underline">Frankfurter</a>.</p>
        <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={quoteLoading} onClick={() => { setQuoteLoading(true); setQuoteReload((value) => value + 1); }}>{t(quoteLoading ? "common.loading" : "dollars.refreshRate")}</button>
      </div>
      {quoteError ? <p role="status" className="mt-2 text-xs text-[var(--amber)]">{t("dollars.quoteError")}</p> : null}
      {saved ? <p role="status" className="mt-3 text-sm text-[var(--green)]">{t("dollars.saved")}</p> : null}
      {mutationError ? <p role="alert" className="mt-3 text-sm text-[var(--red)]">{t("dollars.deleteError")}</p> : null}
      {!loadError && !loading && purchases.length ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <button className="ui-btn ui-btn-ghost ui-btn-sm" aria-expanded={historyOpen} aria-controls="dollar-purchase-history" onClick={() => setHistoryOpen((value) => !value)}>{t("dollars.history")} ({purchases.length})</button>
          {historyOpen ? <div id="dollar-purchase-history" className="mt-2 divide-y divide-[var(--border)]">
            {purchases.slice(0, historyCount).map((purchase) => (
              <div key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="break-all font-medium">{dollars(Number(purchase.usd_amount))} · {money(Number(purchase.total_paid), purchase.currency)}</p>
                  <p className="mt-1 text-xs text-[var(--text-3)]">{dateLabel(purchase.date)} · {purchase.currency}</p>
                </div>
                {confirmDelete === purchase.id ? <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-3)]">{t("dollars.confirmDelete")}</span>
                  <button className="ui-btn ui-btn-danger ui-btn-sm" disabled={!!deleting} onClick={() => void remove(purchase)}>{t(deleting ? "common.loading" : "dollars.delete")}</button>
                  <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!!deleting} onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</button>
                </div> : <div className="flex gap-2">
                  <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!!deleting || !!editor} onClick={() => openEditor(purchase)}>{t("common.edit")}</button>
                  <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!!deleting || !!editor} onClick={() => { setConfirmDelete(purchase.id); setMutationError(false); }}>{t("dollars.delete")}</button>
                </div>}
              </div>
            ))}
            {historyCount < purchases.length ? <button className="ui-btn ui-btn-ghost ui-btn-sm mt-2" onClick={() => setHistoryCount((value) => value + 10)}>{t("dollars.showMore")}</button> : null}
          </div> : null}
        </div>
      ) : null}
      {editor ? <DollarPurchaseForm userId={userId} currency={currency} purchase={editor.purchase} onClose={() => setEditor(null)} onSaved={(purchase) => {
        setPurchases((current) => [purchase, ...current.filter((row) => row.id !== purchase.id)].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
        setEditor(null);
        setSaved(true);
      }} /> : null}
    </section>
  );
}
