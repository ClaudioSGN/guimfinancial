"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { AppIcon } from "@/components/AppIcon";
import { getMonthShortName } from "../../../shared/i18n";

type RawTransaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount?: number | string | null;
  value?: number | string | null;
  description?: string | null;
  category?: string | null;
  date: string;
  account_id?: string | null;
  card_id?: string | null;
  is_fixed?: boolean | null;
  is_installment?: boolean | null;
  installment_total?: number | null;
  installments_paid?: number | null;
};

type Transaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number;
  description: string | null;
  category: string | null;
  date: string;
  account_id: string | null;
  card_id: string | null;
  is_fixed: boolean | null;
  is_installment: boolean | null;
  installment_total: number | null;
  installments_paid: number | null;
};

type Account = {
  id: string;
  name: string;
};

type Card = {
  id: string;
  name: string;
  owner_type?: "self" | "friend" | null;
  friend_name?: string | null;
};

type ExportRow = Transaction & {
  effectiveDate: string;
  installmentIndex: number;
  totalInstallments: number;
};

const SALARY_CARRYOVER_DAY_LIMIT = 10;
const SALARY_HINT_KEYWORDS = ["salario", "salary", "wage", "payroll", "pagamento"];
const CSV_HEADERS = [
  "Data",
  "Categoria",
  "Descricao",
  "Valor",
  "Tipo",
  "Modalidade",
  "Parcela_Atual",
  "Total_Parcelas",
  "Metodo_Pagamento",
  "Responsavel",
];

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMonthLabel(date: Date, language: "pt" | "en") {
  return `${getMonthShortName(language, date.getMonth())} ${date.getFullYear()}`;
}

function getMonthOptions(language: "pt" | "en", total = 12) {
  return Array.from({ length: total }, (_, index) => {
    const value = new Date(new Date().getFullYear(), new Date().getMonth() - index, 1);
    return { value, label: getMonthLabel(value, language) };
  });
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCsvText(value: string | null | undefined, fallback = "-") {
  const cleaned = (value ?? fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function escapeCsvValue(value: string | number) {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function addMonthsClamped(date: Date, monthsToAdd: number) {
  const targetMonthStart = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(date.getDate(), lastDay),
  );
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function getTransactionsQueryEnd(date: Date) {
  return toDateString(new Date(date.getFullYear(), date.getMonth() + 1, SALARY_CARRYOVER_DAY_LIMIT));
}

function isSalaryCarryoverCandidate(tx: Transaction, txDate: Date) {
  if (tx.type !== "income") return false;
  if (txDate.getDate() > SALARY_CARRYOVER_DAY_LIMIT) return false;
  const haystacks = [tx.description, tx.category].map(normalizeSearchText).filter(Boolean);
  return haystacks.some((text) => SALARY_HINT_KEYWORDS.some((keyword) => text.includes(keyword)));
}

function normalizeTransactions(rows: RawTransaction[]) {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount ?? row.value ?? 0) || 0,
    description: row.description ?? null,
    category: row.category ?? null,
    date: row.date,
    account_id: row.account_id ?? null,
    card_id: row.card_id ?? null,
    is_fixed: row.is_fixed ?? null,
    is_installment: row.is_installment ?? null,
    installment_total: row.installment_total ?? null,
    installments_paid: row.installments_paid ?? null,
  }));
}

function buildMonthTransactions(transactions: Transaction[], month: Date): ExportRow[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  const budgetMonthEnd = toDateString(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  return transactions
    .flatMap((tx) => {
      const txDate = parseLocalDate(tx.date);
      if (!txDate) return [];

      const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
      const isInstallment = totalInstallments > 0;
      const isFixedExpense = !!tx.is_fixed && tx.type !== "income";
      const monthOffset =
        (monthStart.getFullYear() - txDate.getFullYear()) * 12 +
        (monthStart.getMonth() - txDate.getMonth());

      if (isInstallment) {
        const installmentAmount = tx.amount / totalInstallments;
        const rows: ExportRow[] = [];
        for (let index = 0; index < totalInstallments; index += 1) {
          const installmentDate = addMonthsClamped(txDate, index);
          if (installmentDate < monthStart || installmentDate > monthEnd) continue;
          rows.push({
            ...tx,
            amount: installmentAmount,
            effectiveDate: toDateString(installmentDate),
            installmentIndex: index + 1,
            totalInstallments,
          });
        }
        return rows;
      }

      if (isFixedExpense) {
        if (monthOffset < 0) return [];
        const recurringDate = addMonthsClamped(txDate, monthOffset);
        if (recurringDate < monthStart || recurringDate > monthEnd) return [];
        return [{
          ...tx,
          effectiveDate: toDateString(recurringDate),
          installmentIndex: 1,
          totalInstallments: 1,
        }];
      }

      if (isSalaryCarryoverCandidate(tx, txDate)) {
        const assignedMonth = new Date(txDate.getFullYear(), txDate.getMonth() - 1, 1);
        if (!isSameMonth(assignedMonth, month)) return [];
        return [{
          ...tx,
          effectiveDate: budgetMonthEnd,
          installmentIndex: 1,
          totalInstallments: 1,
        }];
      }

      if (txDate < monthStart || txDate > monthEnd) return [];
      return [{
        ...tx,
        effectiveDate: toDateString(txDate),
        installmentIndex: 1,
        totalInstallments: 1,
      }];
    })
    .sort((a, b) => {
      if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate.localeCompare(b.effectiveDate);
      return (a.description ?? "").localeCompare(b.description ?? "");
    });
}

function getTransactionTypeLabel(type: Transaction["type"]) {
  return type === "income" ? "Entrada" : "Saida";
}

function getTransactionModeLabel(tx: ExportRow) {
  if (tx.totalInstallments > 1) return "Parcelado";
  if (tx.type === "income" && tx.is_fixed) return "Fixo";
  if (tx.type !== "income" && tx.is_fixed) return "Recorrente";
  return "Variavel";
}

function downloadCsv(content: string, fileName: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthOpen, setMonthOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const monthOptions = useMemo(() => getMonthOptions(language), [language]);
  const monthLabel = useMemo(() => getMonthLabel(selectedMonth, language), [language, selectedMonth]);

  const copy = language === "pt"
    ? {
        subtitle: "Baixe o CSV do mes com o padrao Data, Categoria, Descricao, Valor, Tipo e parcelas.",
        month: "Mes da exportacao",
        button: "Exportar CSV",
        exporting: "Exportando...",
        ready: "CSV gerado com sucesso.",
        empty: "Nenhuma transacao encontrada para o mes selecionado.",
        error: "Nao foi possivel gerar o CSV agora.",
      }
    : {
        subtitle: "Download the month CSV using the Data, Categoria, Descricao, Valor, Tipo and installment pattern.",
        month: "Export month",
        button: "Export CSV",
        exporting: "Exporting...",
        ready: "CSV created successfully.",
        empty: "No transactions were found for the selected month.",
        error: "Could not generate the CSV right now.",
      };

  async function handleExportCsv() {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const queryEnd = getTransactionsQueryEnd(selectedMonth);

      const [transactionsResult, accountsResult, cardsResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .lte("date", queryEnd)
          .order("date", { ascending: true }),
        supabase
          .from("accounts")
          .select("*")
          .eq("user_id", user.id),
        supabase
          .from("credit_cards")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (transactionsResult.error || accountsResult.error || cardsResult.error) {
        throw transactionsResult.error ?? accountsResult.error ?? cardsResult.error;
      }

      const transactions = normalizeTransactions((transactionsResult.data ?? []) as RawTransaction[]);
      const monthTransactions = buildMonthTransactions(transactions, selectedMonth);

      if (monthTransactions.length === 0) {
        setErrorMsg(copy.empty);
        setLoading(false);
        return;
      }

      const accountMap = new Map(
        ((accountsResult.data ?? []) as Account[]).map((account) => [account.id, account.name]),
      );
      const cardMap = new Map(
        ((cardsResult.data ?? []) as Card[]).map((card) => [card.id, card]),
      );

      const lines = [
        CSV_HEADERS.join(","),
        ...monthTransactions.map((tx) => {
          const card = tx.card_id ? cardMap.get(tx.card_id) ?? null : null;
          const paymentMethod = tx.card_id
            ? card?.name ?? "-"
            : tx.account_id
              ? accountMap.get(tx.account_id) ?? "-"
              : "-";
          const responsible =
            card?.owner_type === "friend" && card.friend_name
              ? card.friend_name
              : "Eu";

          const values = [
            tx.effectiveDate,
            normalizeCsvText(tx.category, "Sem categoria"),
            normalizeCsvText(tx.description ?? tx.category, "-"),
            tx.amount.toFixed(2),
            getTransactionTypeLabel(tx.type),
            getTransactionModeLabel(tx),
            tx.installmentIndex,
            tx.totalInstallments,
            normalizeCsvText(paymentMethod, "-"),
            normalizeCsvText(responsible, "Eu"),
          ];

          return values.map(escapeCsvValue).join(",");
        }),
      ];

      downloadCsv(
        lines.join("\r\n"),
        `guimfinancial-${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}.csv`,
      );
      setSuccessMsg(copy.ready);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      setErrorMsg(copy.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <Link href="/more" className="flex items-center gap-2 text-xs text-[#9CA3AF]">
          <AppIcon name="arrow-left" size={14} />
          {t("tabs.more")}
        </Link>

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("export.reports")}
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {t("export.title")}
          </p>
          <p className="text-sm text-[#9CA3AF]">{copy.subtitle}</p>
        </div>

        <div className="rounded-3xl border border-[#1B2230] bg-[#111723] p-5">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[#7F8694]">{copy.month}</p>
              <button
                type="button"
                onClick={() => setMonthOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-2xl border border-[#2A3140] bg-[#141A25] px-4 py-3 text-left text-sm font-semibold text-[#C7CEDA]"
              >
                <span>{monthLabel}</span>
                <AppIcon name="chevron-down" size={16} />
              </button>
              {monthOpen ? (
                <div className="grid gap-2 rounded-2xl border border-[#1B2230] bg-[#0F141E] p-2 sm:grid-cols-3">
                  {monthOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(option.value);
                        setMonthOpen(false);
                      }}
                      className="rounded-xl px-3 py-2 text-left text-sm text-[#C7CEDA] hover:bg-[#151A27]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || !user}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#E6EDF3] px-4 py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
            >
              <AppIcon name="download" size={16} />
              {loading ? copy.exporting : copy.button}
            </button>

            {errorMsg ? <p className="text-sm text-red-400">{errorMsg}</p> : null}
            {successMsg ? <p className="text-sm text-[#5DD6C7]">{successMsg}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
