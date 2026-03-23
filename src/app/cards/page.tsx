"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { hasMissingColumnError } from "@/lib/errorUtils";
import { BankBrandBadge, BankBrandPicker } from "@/components/BankBrandBadge";
import { DEFAULT_BANK_BRAND_CODE, type BankBrandCode } from "@/lib/bankBrands";

type CardOwnerType = "self" | "friend";
type Card = {
  id: string;
  name: string;
  limit_amount: number | string;
  owner_type: CardOwnerType;
  friend_name: string | null;
  closing_day: number;
  due_day: number;
  bank_code?: string | null;
};
type LegacyCard = Omit<Card, "owner_type" | "friend_name">;
type Transaction = {
  id: string;
  type: "income" | "expense" | "card_expense";
  amount: number | string;
  date: string;
  account_id: string | null;
  card_id: string | null;
  installment_total: number | null;
  installments_paid: number | null;
  is_paid: boolean | null;
};
type RawTransaction = Omit<Transaction, "amount"> & { amount?: number | string | null; value?: number | string | null };
type Account = {
  id: string;
  name: string;
  balance: number | string;
  card_limit?: number | string | null;
  closing_day?: number | null;
  due_day?: number | null;
};
type CardInsight = {
  currentStatement: number;
  nextStatement: number;
  overdueAmount: number;
  usedTotal: number;
  availableLimit: number;
  utilizationPercent: number;
  daysUntilClosing: number;
  daysUntilDue: number;
  signedDaysUntilDue: number;
  statementClosed: boolean;
};

function isCardOwnershipColumnMissing(error: unknown) {
  return hasMissingColumnError(error, ["owner_type", "friend_name"]);
}

function hydrateLegacyCards(cards: LegacyCard[]): Card[] {
  return cards.map((card) => ({ ...card, owner_type: "self", friend_name: null }));
}

function normalizeTransactionAmounts(rows: RawTransaction[]): Transaction[] {
  return rows.map((row) => ({ ...row, amount: row.amount ?? row.value ?? 0 }));
}

function parseLocalDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSafeDayInMonth(year: number, month: number, day: number) {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), maxDay);
}

function getInstallmentMonthOffset(startDate: string, targetMonth: Date) {
  const parsed = parseLocalDate(startDate);
  if (!parsed) return null;
  return (targetMonth.getFullYear() - parsed.getFullYear()) * 12 +
    (targetMonth.getMonth() - parsed.getMonth());
}

function isCardLinkedExpense(tx: Transaction) {
  return Boolean(tx.card_id) && tx.type !== "income";
}

function getCardChargeTiming(tx: Transaction, card: Card, today: Date) {
  const txDate = parseLocalDate(tx.date);
  if (!txDate) return null;
  const closingDay = getSafeDayInMonth(txDate.getFullYear(), txDate.getMonth(), Number(card.closing_day));
  const closesThisMonth = new Date(txDate.getFullYear(), txDate.getMonth(), closingDay);
  const statementMonth =
    txDate.getTime() <= closesThisMonth.getTime()
      ? new Date(txDate.getFullYear(), txDate.getMonth(), 1)
      : new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);
  const currentStatementMonth =
    today.getDate() <= Number(card.closing_day)
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const monthDelta =
    (statementMonth.getFullYear() - currentStatementMonth.getFullYear()) * 12 +
    (statementMonth.getMonth() - currentStatementMonth.getMonth());
  if (monthDelta < 0) return "overdue" as const;
  if (monthDelta === 0) return "current" as const;
  if (monthDelta === 1) return "next" as const;
  return "future" as const;
}

function getCardExpenseSettlementUpdate(tx: Transaction, targetDate: Date) {
  if (!isCardLinkedExpense(tx)) return null;
  const amount = Number(tx.amount) || 0;
  if (amount <= 0) return null;
  const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
  if (totalInstallments > 0) {
    const paidInstallments = Math.min(Math.max(Number(tx.installments_paid) || 0, 0), totalInstallments);
    const dueInstallments = Math.min(Math.max((getInstallmentMonthOffset(tx.date, targetDate) ?? -1) + 1, 0), totalInstallments);
    if (dueInstallments <= paidInstallments) return null;
    const perInstallment = amount / totalInstallments;
    return {
      update: { installments_paid: dueInstallments, is_paid: dueInstallments >= totalInstallments },
      balanceDelta: perInstallment * (dueInstallments - paidInstallments),
    };
  }
  const txDate = parseLocalDate(tx.date);
  const normalizedTxDate = txDate ? new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate()) : null;
  const isDueNow = normalizedTxDate ? normalizedTxDate.getTime() <= targetDate.getTime() : true;
  if (!isDueNow || tx.is_paid) return null;
  return { update: { is_paid: true }, balanceDelta: amount };
}

function formatMoney(value: number, language: "pt" | "en", currency: "BRL" | "EUR") {
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
  }).format(value);
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function CardsPage() {
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const emptyMoneyValue = formatCentsInput("", currency);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardTransactions, setCardTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payingCardId, setPayingCardId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bankCode, setBankCode] = useState<BankBrandCode>(DEFAULT_BANK_BRAND_CODE);
  const [limitAmount, setLimitAmount] = useState(emptyMoneyValue);
  const [ownerType, setOwnerType] = useState<CardOwnerType>("self");
  const [friendName, setFriendName] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [editing, setEditing] = useState<Card | null>(null);
  const [editName, setEditName] = useState("");
  const [editBankCode, setEditBankCode] = useState<BankBrandCode>(DEFAULT_BANK_BRAND_CODE);
  const [editLimitAmount, setEditLimitAmount] = useState(emptyMoneyValue);
  const [editOwnerType, setEditOwnerType] = useState<CardOwnerType>("self");
  const [editFriendName, setEditFriendName] = useState("");
  const [editClosingDay, setEditClosingDay] = useState("");
  const [editDueDay, setEditDueDay] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function loadCards() {
    const result = await supabase
      .from("credit_cards")
      .select("id,name,limit_amount,owner_type,friend_name,closing_day,due_day,bank_code")
      .order("owner_type", { ascending: true })
      .order("name", { ascending: true });
    if (!result.error) return (result.data ?? []) as Card[];
    if (hasMissingColumnError(result.error, ["bank_code"])) {
      const noBankCode = await supabase
        .from("credit_cards")
        .select("id,name,limit_amount,owner_type,friend_name,closing_day,due_day")
        .order("owner_type", { ascending: true })
        .order("name", { ascending: true });
      if (!noBankCode.error) return (noBankCode.data ?? []) as Card[];
      if (!isCardOwnershipColumnMissing(noBankCode.error)) throw noBankCode.error;
    } else if (!isCardOwnershipColumnMissing(result.error)) {
      throw result.error;
    }
    const legacy = await supabase
      .from("credit_cards")
      .select("id,name,limit_amount,closing_day,due_day")
      .order("name", { ascending: true });
    if (legacy.error) throw legacy.error;
    return hydrateLegacyCards((legacy.data ?? []) as LegacyCard[]);
  }

  async function loadCardTransactions() {
    const result = await supabase
      .from("transactions")
      .select("id,type,amount,value,date,account_id,card_id,installment_total,installments_paid,is_paid")
      .in("type", ["expense", "card_expense"])
      .not("card_id", "is", null);
    if (!result.error) return normalizeTransactionAmounts((result.data ?? []) as RawTransaction[]);
    if (!hasMissingColumnError(result.error, ["value", "amount"])) throw result.error;
    const fallback = await supabase
      .from("transactions")
      .select(
        hasMissingColumnError(result.error, ["value"])
          ? "id,type,amount,date,account_id,card_id,installment_total,installments_paid,is_paid"
          : "id,type,value,date,account_id,card_id,installment_total,installments_paid,is_paid",
      )
      .in("type", ["expense", "card_expense"])
      .not("card_id", "is", null);
    if (fallback.error) throw fallback.error;
    return normalizeTransactionAmounts((fallback.data ?? []) as RawTransaction[]);
  }

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [nextCards, nextTransactions, accountsResult] = await Promise.all([
        loadCards(),
        loadCardTransactions(),
        supabase.from("accounts").select("id,name,balance,card_limit,closing_day,due_day"),
      ]);
      if (accountsResult.error) throw accountsResult.error;
      const nextAccounts = (accountsResult.data ?? []) as Account[];
      const cardsByName = new Map(
        nextCards.map((card) => [normalizeSearchText(card.name), card.id]),
      );
      const legacyCardAccountsById = new Map(
        nextAccounts
          .filter((account) => account.card_limit != null || account.closing_day != null || account.due_day != null)
          .map((account) => [account.id, account]),
      );
      const bridgedTransactions = nextTransactions.map((tx) => {
        if (tx.card_id) return tx;
        const legacyCardAccount = tx.account_id ? legacyCardAccountsById.get(tx.account_id) : null;
        if (!legacyCardAccount) return tx;
        const matchedCardId = cardsByName.get(normalizeSearchText(legacyCardAccount.name));
        return matchedCardId ? { ...tx, card_id: matchedCardId } : tx;
      });
      setCards(nextCards);
      setCardTransactions(bridgedTransactions);
      setAccounts(nextAccounts);
    } catch (error) {
      console.error("Error loading cards:", error);
      setErrorMsg(language === "pt" ? "Falha ao carregar cartoes." : "Failed to load cards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [language]);

  useEffect(() => {
    if (parseCentsInput(limitAmount) === 0) setLimitAmount(emptyMoneyValue);
    if (parseCentsInput(editLimitAmount) === 0) setEditLimitAmount(emptyMoneyValue);
  }, [limitAmount, editLimitAmount, emptyMoneyValue]);

  const cardInsightsById = useMemo<Record<string, CardInsight>>(() => {
    const today = new Date();
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const insights: Record<string, CardInsight> = {};
    cards.forEach((card) => {
      const limitAmountValue = Number(card.limit_amount) || 0;
      const closingDayValue = Number(card.closing_day) || 1;
      const dueDayValue = Number(card.due_day) || 1;
      const currentClosingDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth(), closingDayValue));
      const nextClosingDate =
        currentDate.getTime() <= currentClosingDate.getTime()
          ? currentClosingDate
          : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth() + 1, closingDayValue));
      const currentDueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth(), dueDayValue));
      const nextDueDate =
        currentDate.getTime() <= currentDueDate.getTime()
          ? currentDueDate
          : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, getSafeDayInMonth(currentDate.getFullYear(), currentDate.getMonth() + 1, dueDayValue));
      const statementClosed =
        currentDate.getTime() >= currentClosingDate.getTime() &&
        currentDate.getTime() <= currentDueDate.getTime();
      const dueReferenceDate = statementClosed ? currentDueDate : nextDueDate;
      let currentStatement = 0;
      let nextStatement = 0;
      let overdueAmount = 0;
      let usedTotal = 0;
      cardTransactions.forEach((tx) => {
        if (!isCardLinkedExpense(tx) || tx.card_id !== card.id) return;
        const amount = Number(tx.amount) || 0;
        if (amount <= 0) return;
        const totalInstallments = Math.max(0, Number(tx.installment_total) || 0);
        const paidInstallments = Math.min(Math.max(Number(tx.installments_paid) || 0, 0), totalInstallments);
        if (totalInstallments > 0) {
          const perInstallment = amount / totalInstallments;
          usedTotal += perInstallment * (totalInstallments - paidInstallments);
          const txDate = parseLocalDate(tx.date);
          if (!txDate) return;
          for (let index = paidInstallments; index < totalInstallments; index += 1) {
            const installmentDate = new Date(txDate.getFullYear(), txDate.getMonth() + index, txDate.getDate());
            const timing = getCardChargeTiming({ ...tx, date: toDateString(installmentDate), amount: perInstallment, installment_total: null, installments_paid: null, is_paid: false }, card, currentDate);
            if (timing === "overdue") overdueAmount += perInstallment;
            if (timing === "current") currentStatement += perInstallment;
            if (timing === "next") nextStatement += perInstallment;
          }
          return;
        }
        if (!tx.is_paid) {
          usedTotal += amount;
          const timing = getCardChargeTiming(tx, card, currentDate);
          if (timing === "overdue") overdueAmount += amount;
          if (timing === "current") currentStatement += amount;
          if (timing === "next") nextStatement += amount;
        }
      });
      insights[card.id] = {
        currentStatement,
        nextStatement,
        overdueAmount,
        usedTotal,
        availableLimit: Math.max(limitAmountValue - usedTotal, 0),
        utilizationPercent: limitAmountValue > 0 ? Math.min((usedTotal / limitAmountValue) * 100, 100) : 0,
        daysUntilClosing: Math.max(Math.ceil((nextClosingDate.getTime() - currentDate.getTime()) / 86_400_000), 0),
        daysUntilDue: Math.max(Math.ceil((dueReferenceDate.getTime() - currentDate.getTime()) / 86_400_000), 0),
        signedDaysUntilDue: Math.ceil((dueReferenceDate.getTime() - currentDate.getTime()) / 86_400_000),
        statementClosed,
      };
    });
    return insights;
  }, [cards, cardTransactions]);

  const openStatementsCount = useMemo(
    () => cards.filter((card) => !cardInsightsById[card.id]?.statementClosed).length,
    [cards, cardInsightsById],
  );

  const closedStatementsCount = useMemo(
    () => cards.filter((card) => cardInsightsById[card.id]?.statementClosed).length,
    [cards, cardInsightsById],
  );

  async function updateAccountBalance(accountId: string, delta: number) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    const nextBalance = (Number(account.balance) || 0) + delta;
    await supabase.from("accounts").update({ balance: nextBalance }).eq("id", accountId);
  }

  async function handleAdd() {
    setErrorMsg(null);
    const parsedLimit = parseCentsInput(limitAmount);
    const parsedClosing = Number(closingDay);
    const parsedDue = Number(dueDay);
    const trimmedFriendName = friendName.trim();
    if (!name.trim()) return setErrorMsg(t("cards.nameError"));
    if (ownerType === "friend" && !trimmedFriendName) return setErrorMsg(t("cards.friendNameError"));
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      return setErrorMsg(t("cards.dataError"));
    }

    setSaving(true);
    let { error } = await supabase.from("credit_cards").insert([{
      name: name.trim(),
      limit_amount: parsedLimit,
      owner_type: ownerType,
      friend_name: ownerType === "friend" ? trimmedFriendName : null,
      closing_day: parsedClosing,
      due_day: parsedDue,
      bank_code: bankCode,
    }]);
    if (error && (isCardOwnershipColumnMissing(error) || hasMissingColumnError(error, ["bank_code"]))) {
      if (ownerType === "friend") {
        const noBankCode = await supabase.from("credit_cards").insert([{
          name: name.trim(),
          limit_amount: parsedLimit,
          owner_type: ownerType,
          friend_name: trimmedFriendName,
          closing_day: parsedClosing,
          due_day: parsedDue,
        }]);
        if (!noBankCode.error) {
          setName("");
          setBankCode(DEFAULT_BANK_BRAND_CODE);
          setLimitAmount(emptyMoneyValue);
          setOwnerType("self");
          setFriendName("");
          setClosingDay("");
          setDueDay("");
          setSaving(false);
          await loadData();
          window.dispatchEvent(new Event("data-refresh"));
          return;
        }
        if (!isCardOwnershipColumnMissing(noBankCode.error)) {
          setSaving(false);
          return setErrorMsg(t("cards.saveError"));
        }
        setSaving(false);
        return setErrorMsg(t("cards.schemaUpdateRequired"));
      }
      const legacy = await supabase.from("credit_cards").insert([{
        name: name.trim(),
        limit_amount: parsedLimit,
        closing_day: parsedClosing,
        due_day: parsedDue,
      }]);
      error = legacy.error;
    }
    if (error) {
      setSaving(false);
      return setErrorMsg(t("cards.saveError"));
    }
    setName("");
    setBankCode(DEFAULT_BANK_BRAND_CODE);
    setLimitAmount(emptyMoneyValue);
    setOwnerType("self");
    setFriendName("");
    setClosingDay("");
    setDueDay("");
    setSaving(false);
    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  function openEdit(card: Card) {
    setEditing(card);
    setEditName(card.name);
    setEditBankCode((card.bank_code as BankBrandCode | null) ?? DEFAULT_BANK_BRAND_CODE);
    setEditLimitAmount(formatCentsFromNumber(Number(card.limit_amount) || 0, currency));
    setEditOwnerType(card.owner_type ?? "self");
    setEditFriendName(card.friend_name ?? "");
    setEditClosingDay(String(card.closing_day ?? ""));
    setEditDueDay(String(card.due_day ?? ""));
    setErrorMsg(null);
  }

  async function handleEditSave() {
    if (!editing) return;
    setErrorMsg(null);
    const parsedLimit = parseCentsInput(editLimitAmount);
    const parsedClosing = Number(editClosingDay);
    const parsedDue = Number(editDueDay);
    const trimmedFriendName = editFriendName.trim();
    if (!editName.trim()) return setErrorMsg(t("cards.nameError"));
    if (editOwnerType === "friend" && !trimmedFriendName) return setErrorMsg(t("cards.friendNameError"));
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      return setErrorMsg(t("cards.dataError"));
    }

    setEditSaving(true);
    let { error } = await supabase
      .from("credit_cards")
      .update({
        name: editName.trim(),
        limit_amount: parsedLimit,
        owner_type: editOwnerType,
        friend_name: editOwnerType === "friend" ? trimmedFriendName : null,
        closing_day: parsedClosing,
        due_day: parsedDue,
        bank_code: editBankCode,
      })
      .eq("id", editing.id);
    if (error && (isCardOwnershipColumnMissing(error) || hasMissingColumnError(error, ["bank_code"]))) {
      if (editOwnerType === "friend") {
        const noBankCode = await supabase
          .from("credit_cards")
          .update({
            name: editName.trim(),
            limit_amount: parsedLimit,
            owner_type: editOwnerType,
            friend_name: trimmedFriendName,
            closing_day: parsedClosing,
            due_day: parsedDue,
          })
          .eq("id", editing.id);
        if (!noBankCode.error) {
          setEditSaving(false);
          setEditing(null);
          await loadData();
          window.dispatchEvent(new Event("data-refresh"));
          return;
        }
        if (!isCardOwnershipColumnMissing(noBankCode.error)) {
          setEditSaving(false);
          return setErrorMsg(t("cards.saveError"));
        }
        setEditSaving(false);
        return setErrorMsg(t("cards.schemaUpdateRequired"));
      }
      const legacy = await supabase
        .from("credit_cards")
        .update({
          name: editName.trim(),
          limit_amount: parsedLimit,
          closing_day: parsedClosing,
          due_day: parsedDue,
        })
        .eq("id", editing.id);
      error = legacy.error;
    }
    setEditSaving(false);
    if (error) return setErrorMsg(t("cards.saveError"));
    setEditing(null);
    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleRemove(card: Card) {
    if (!window.confirm(`Remover o cartao "${card.name}"?`) || deletingId) return;
    setDeletingId(card.id);
    const { error } = await supabase.from("credit_cards").delete().eq("id", card.id);
    setDeletingId(null);
    if (error) return setErrorMsg(t("cards.removeError"));
    await loadData();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleMarkStatementPaid(card: Card) {
    if (payingCardId) return;
    const message =
      language === "pt"
        ? `Marcar a fatura do cartao "${card.name}" como paga?`
        : `Mark the "${card.name}" card statement as paid?`;
    if (!window.confirm(message)) return;
    setErrorMsg(null);
    setPayingCardId(card.id);
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueTransactions = cardTransactions
        .filter((tx) => tx.card_id === card.id)
        .map((tx) => ({ tx, settlement: getCardExpenseSettlementUpdate(tx, today) }))
        .filter((item): item is { tx: Transaction; settlement: NonNullable<ReturnType<typeof getCardExpenseSettlementUpdate>> } => Boolean(item.settlement));
      for (const item of dueTransactions) {
        const { error } = await supabase.from("transactions").update(item.settlement.update).eq("id", item.tx.id);
        if (error) throw error;
        if (item.tx.account_id && Number.isFinite(item.settlement.balanceDelta)) {
          await updateAccountBalance(item.tx.account_id, -item.settlement.balanceDelta);
        }
      }
      await loadData();
      window.dispatchEvent(new Event("data-refresh"));
    } catch (error) {
      console.error("Error marking statement paid:", error);
      setErrorMsg(language === "pt" ? "Falha ao marcar a fatura como paga." : "Failed to mark the statement as paid.");
    } finally {
      setPayingCardId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
        <Link href="/more" className="text-xs text-[#9CA3AF]">← {t("tabs.more")}</Link>

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">{t("cards.title")}</p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {language === "pt" ? "Gerir cartoes e faturas" : "Manage cards and statements"}
          </p>
          <p className="text-sm text-[#8A93A3]">
            {language === "pt"
              ? "Acompanhe limite usado, fatura atual, proxima fatura e pagamentos."
              : "Track used limit, current statement, next statement, and payments."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
            <p className="text-xs text-[#8A93A3]">{language === "pt" ? "Cartoes" : "Cards"}</p>
            <p className="mt-2 text-2xl font-semibold text-[#E5E8EF]">{cards.length}</p>
          </div>
          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
            <p className="text-xs text-[#8A93A3]">{language === "pt" ? "Faturas abertas" : "Open statements"}</p>
            <p className="mt-2 text-2xl font-semibold text-[#5DD6C7]">{openStatementsCount}</p>
          </div>
          <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
            <p className="text-xs text-[#8A93A3]">{language === "pt" ? "Faturas para pagar" : "Statements due"}</p>
            <p className="mt-2 text-2xl font-semibold text-[#F4C27A]">{closedStatementsCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4 sm:p-5">
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8B94A6]">{t("cards.ownerLabel")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setOwnerType("self")} className={`rounded-full border px-3 py-1 text-xs ${ownerType === "self" ? "border-[#5DD6C7] bg-[#173038] text-[#D7FBF6]" : "border-[#2A3140] bg-[#0F141E] text-[#A8B2C3]"}`}>{t("cards.ownerSelf")}</button>
                <button type="button" onClick={() => setOwnerType("friend")} className={`rounded-full border px-3 py-1 text-xs ${ownerType === "friend" ? "border-[#5DD6C7] bg-[#173038] text-[#D7FBF6]" : "border-[#2A3140] bg-[#0F141E] text-[#A8B2C3]"}`}>{t("cards.ownerFriend")}</button>
              </div>
            </div>
            <BankBrandPicker selected={bankCode} onSelect={setBankCode} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("cards.namePlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#0F141E] px-4 py-3 text-sm text-[#E4E7EC]" />
              {ownerType === "friend" ? <input value={friendName} onChange={(event) => setFriendName(event.target.value)} placeholder={t("cards.friendNamePlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#0F141E] px-4 py-3 text-sm text-[#E4E7EC]" /> : null}
              <input value={limitAmount} onChange={(event) => setLimitAmount(formatCentsInput(event.target.value, currency))} placeholder={t("cards.limitPlaceholder")} inputMode="decimal" pattern="[0-9.,]*" className="w-full rounded-xl border border-[#1E232E] bg-[#0F141E] px-4 py-3 text-sm text-[#E4E7EC]" />
              <input value={closingDay} onChange={(event) => setClosingDay(event.target.value)} placeholder={t("cards.closingDayPlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#0F141E] px-4 py-3 text-sm text-[#E4E7EC]" />
              <input value={dueDay} onChange={(event) => setDueDay(event.target.value)} placeholder={t("cards.dueDayPlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#0F141E] px-4 py-3 text-sm text-[#E4E7EC]" />
            </div>
            {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
            <button type="button" onClick={handleAdd} disabled={saving} className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60">{saving ? t("common.saving") : t("cards.add")}</button>
          </div>
        </div>

        <div className="grid gap-4">
          {loading ? (
            <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-6 text-sm text-[#8A93A3]">
              {language === "pt" ? "A carregar cartoes..." : "Loading cards..."}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#263043] bg-[#121621] p-6 text-sm text-[#8A93A3]">
              {language === "pt" ? "Nenhum cartao registado ainda." : "No cards registered yet."}
            </div>
          ) : (
            cards.map((item) => {
              const insight = cardInsightsById[item.id];
              const currentStatementTotal = (insight?.currentStatement ?? 0) + (insight?.overdueAmount ?? 0);
              const canMarkPaid = currentStatementTotal > 0;
              const statementClosed = insight?.statementClosed ?? false;
              const dueLabel =
                !statementClosed && currentStatementTotal <= 0
                  ? language === "pt"
                    ? "Sem fatura pendente"
                    : "No statement due"
                  : (insight?.signedDaysUntilDue ?? 0) < 0
                    ? language === "pt"
                      ? `Atrasada ha ${Math.abs(insight?.signedDaysUntilDue ?? 0)} dia(s)`
                      : `Overdue by ${Math.abs(insight?.signedDaysUntilDue ?? 0)} day(s)`
                    : (insight?.signedDaysUntilDue ?? 0) === 0
                      ? language === "pt"
                        ? "Vence hoje"
                        : "Due today"
                      : language === "pt"
                        ? `Vence em ${insight?.daysUntilDue ?? 0} dia(s)`
                        : `Due in ${insight?.daysUntilDue ?? 0} day(s)`;
              return (
                <div key={item.id} className={`rounded-2xl border p-4 sm:p-5 ${item.owner_type === "friend" ? "border-[#25404B] bg-[#10212A]" : "border-[#1E232E] bg-[#121621]"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <BankBrandBadge bankCode={item.bank_code} />
                        <p className="text-lg font-semibold text-[#E4E7EC]">{item.name}</p>
                        <span className="rounded-full border border-[#2A3140] bg-[#0F141E] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#9AA3B2]">
                          {item.owner_type === "friend" ? t("cards.ownerBadgeFriend") : t("cards.ownerBadgeSelf")}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${statementClosed ? "border-amber-500/45 bg-amber-500/10 text-amber-200" : "border-[#2A8C73] bg-[#163137] text-[#91E6DA]"}`}>
                          {statementClosed ? (language === "pt" ? "Fatura fechada" : "Statement due") : (language === "pt" ? "Fatura aberta" : "Statement open")}
                        </span>
                      </div>
                      {item.owner_type === "friend" && item.friend_name ? (
                        <p className="text-sm text-[#A8D7D1]">{t("home.friendCardOwner")}: {item.friend_name}</p>
                      ) : null}
                      <p className="text-xs text-[#8A93A3]">{t("cards.closes")} {item.closing_day} · {t("cards.due")} {item.due_day}</p>
                      <div className="h-2 rounded-full bg-[#1A2230]">
                        <div className="h-2 rounded-full bg-[#5DD6C7]" style={{ width: `${Math.min(100, Math.max(0, insight?.utilizationPercent ?? 0))}%` }} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button type="button" onClick={() => handleMarkStatementPaid(item)} disabled={!canMarkPaid || payingCardId === item.id} className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1.5 text-xs text-[#D6DEE8] hover:border-[#5DD6C7]/60 hover:text-[#5DD6C7] disabled:opacity-50">
                        {payingCardId === item.id ? (language === "pt" ? "A pagar..." : "Paying...") : (language === "pt" ? "Marcar fatura paga" : "Mark statement paid")}
                      </button>
                      <button type="button" onClick={() => openEdit(item)} className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1.5 text-xs text-[#8B94A6] hover:border-[#5DD6C7]/60 hover:text-[#5DD6C7]">{t("common.edit")}</button>
                      <button type="button" onClick={() => handleRemove(item)} disabled={deletingId === item.id} className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1.5 text-xs text-[#8B94A6] hover:border-red-500/60 hover:text-red-400 disabled:opacity-60">
                        {deletingId === item.id
                          ? t("common.saving")
                          : language === "pt"
                            ? "Remover"
                            : "Remove"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-[#1B2230] bg-[#0F141E] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">{language === "pt" ? "Fatura atual" : "Current statement"}</p>
                      <p className="mt-2 text-xl font-semibold text-[#E4E7EC]">{formatMoney(currentStatementTotal, language, currency)}</p>
                      <p className="mt-1 text-xs text-[#8B94A6]">{dueLabel}</p>
                    </div>
                    <div className="rounded-xl border border-[#1B2230] bg-[#0F141E] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">{language === "pt" ? "Proxima fatura" : "Next statement"}</p>
                      <p className="mt-2 text-xl font-semibold text-[#E4E7EC]">{formatMoney(insight?.nextStatement ?? 0, language, currency)}</p>
                      <p className="mt-1 text-xs text-[#8B94A6]">{language === "pt" ? `Fecha em ${insight?.daysUntilClosing ?? 0} dia(s)` : `Closes in ${insight?.daysUntilClosing ?? 0} day(s)`}</p>
                    </div>
                    <div className="rounded-xl border border-[#1B2230] bg-[#0F141E] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">{language === "pt" ? "Limite usado" : "Used limit"}</p>
                      <p className="mt-2 text-xl font-semibold text-[#E4E7EC]">{formatMoney(insight?.usedTotal ?? 0, language, currency)}</p>
                      <p className="mt-1 text-xs text-[#8B94A6]">{`${(insight?.utilizationPercent ?? 0).toFixed(1)}%`}</p>
                    </div>
                    <div className="rounded-xl border border-[#1B2230] bg-[#0F141E] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F8AA0]">{language === "pt" ? "Limite disponivel" : "Available limit"}</p>
                      <p className="mt-2 text-xl font-semibold text-[#5DD6C7]">{formatMoney(insight?.availableLimit ?? 0, language, currency)}</p>
                      <p className="mt-1 text-xs text-[#8B94A6]">{formatMoney(Number(item.limit_amount) || 0, language, currency)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#1E232E] bg-[#121621] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#E5E8EF]">{t("cards.title")}</p>
              <button type="button" onClick={() => !editSaving && setEditing(null)} className="text-xs text-[#8B94A6]">{t("common.cancel")}</button>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8B94A6]">{t("cards.ownerLabel")}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditOwnerType("self")} className={`rounded-full border px-3 py-1 text-xs ${editOwnerType === "self" ? "border-[#5DD6C7] bg-[#173038] text-[#D7FBF6]" : "border-[#2A3140] bg-[#0F141E] text-[#A8B2C3]"}`}>{t("cards.ownerSelf")}</button>
                  <button type="button" onClick={() => setEditOwnerType("friend")} className={`rounded-full border px-3 py-1 text-xs ${editOwnerType === "friend" ? "border-[#5DD6C7] bg-[#173038] text-[#D7FBF6]" : "border-[#2A3140] bg-[#0F141E] text-[#A8B2C3]"}`}>{t("cards.ownerFriend")}</button>
                </div>
              </div>
              <BankBrandPicker selected={editBankCode} onSelect={setEditBankCode} />
              <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder={t("cards.namePlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]" />
              {editOwnerType === "friend" ? <input value={editFriendName} onChange={(event) => setEditFriendName(event.target.value)} placeholder={t("cards.friendNamePlaceholder")} className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]" /> : null}
              <input value={editLimitAmount} onChange={(event) => setEditLimitAmount(formatCentsInput(event.target.value, currency))} placeholder={t("cards.limitPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]" />
              <input value={editClosingDay} onChange={(event) => setEditClosingDay(event.target.value)} placeholder={t("cards.closingDayPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]" />
              <input value={editDueDay} onChange={(event) => setEditDueDay(event.target.value)} placeholder={t("cards.dueDayPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]" />
              {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
              <button type="button" onClick={handleEditSave} disabled={editSaving} className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60">{editSaving ? t("common.saving") : t("common.save")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
