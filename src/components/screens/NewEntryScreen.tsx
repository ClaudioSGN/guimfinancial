"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { formatCentsInput, parseCentsInput } from "@/lib/moneyInput";

type Account = {
  id: string;
  name: string;
  balance: number | string;
};

type Card = {
  id: string;
  name: string;
};

type Props = {
  entryType: string;
};

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function labelForType(type: string, t: (key: string) => string) {
  if (type === "transfer") return t("newEntry.transfer");
  if (type === "income") return t("newEntry.income");
  if (type === "card_expense") return t("newEntry.cardExpense");
  return t("newEntry.expense");
}

export function NewEntryScreen({ entryType }: Props) {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const isTransfer = entryType === "transfer";
  const isCardExpense = entryType === "card_expense";
  const needsAccount = entryType === "income" || entryType === "expense";

  const [amount, setAmount] = useState("R$ 0");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(toDateString(new Date()));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState("");

  useEffect(() => {
    async function loadRefs() {
      if (!user) return;
      const [accountsResult, cardsResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,name,balance")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("credit_cards")
          .select("id,name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      if (!accountsResult.error) {
        setAccounts((accountsResult.data ?? []) as Account[]);
      }
      if (!cardsResult.error) {
        setCards((cardsResult.data ?? []) as Card[]);
      }
    }

    loadRefs();
  }, [user]);

  const parsedAmount = useMemo(() => parseCentsInput(amount), [amount]);

  async function updateAccountBalance(id: string, delta: number) {
    if (!user) return;
    const current = accounts.find((account) => account.id === id);
    if (!current) return;
    const nextBalance = (Number(current.balance) || 0) + delta;
    await supabase
      .from("accounts")
      .update({ balance: nextBalance })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  async function handleSave() {
    if (!user) return;
    setErrorMsg(null);
    setSaved(false);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t("newEntry.amountError"));
      return;
    }

    if (isTransfer) {
      if (!accountId || !toAccountId) {
        setErrorMsg(t("newEntry.selectAccountsError"));
        return;
      }
    } else if (needsAccount && !accountId) {
      setErrorMsg(t("newEntry.selectAccountError"));
      return;
    } else if (isCardExpense && !cardId) {
      setErrorMsg(t("newEntry.selectCardError"));
      return;
    }

    setSaving(true);

    if (isTransfer) {
      const { error } = await supabase.from("transfers").insert([
        {
          user_id: user.id,
          from_account_id: accountId,
          to_account_id: toAccountId,
          amount: parsedAmount,
          description: description || null,
          date,
        },
      ]);

      if (error) {
        setErrorMsg(t("newEntry.saveErrorTransfer"));
        setSaving(false);
        return;
      }

      await updateAccountBalance(accountId!, -parsedAmount);
      await updateAccountBalance(toAccountId!, parsedAmount);
    } else {
      let totalInstallments: number | null = null;
      if (isCardExpense && isInstallment) {
        const n = Number(installmentTotal);
        if (!n || !Number.isInteger(n) || n < 1 || n > 120) {
          setErrorMsg(language === "pt" ? "Numero de parcelas invalido." : "Invalid installment count.");
          return;
        }
        totalInstallments = n;
      }

      const { error } = await supabase.from("transactions").insert([
        {
          user_id: user.id,
          type: entryType,
          account_id: needsAccount ? accountId : null,
          card_id: isCardExpense ? cardId : null,
          amount: parsedAmount,
          description: description || null,
          category: category || null,
          date,
          is_installment: isCardExpense ? isInstallment || null : null,
          installment_total: isCardExpense ? totalInstallments : null,
          installments_paid: isCardExpense && isInstallment ? 0 : null,
          is_paid: isCardExpense && isInstallment ? false : null,
        },
      ]);

      if (error) {
        setErrorMsg(t("newEntry.saveError"));
        setSaving(false);
        return;
      }

      if (needsAccount) {
        const delta = entryType === "income" ? parsedAmount : -parsedAmount;
        await updateAccountBalance(accountId!, delta);
      }
    }

    setSaving(false);
    setSaved(true);
    window.dispatchEvent(new Event("data-refresh"));
    setTimeout(() => setSaved(false), 2000);
    router.back();
  }

  const displayDate = useMemo(() => {
    const value = new Date(date);
    return value.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US");
  }, [date, language]);

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs text-[#9CA3AF]"
        >
          <AppIcon name="arrow-left" size={14} />
          Voltar
        </button>

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("newEntry.title")}
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {labelForType(entryType, t)}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#C7CEDA]">
              {t("newEntry.amount")}
            </label>
            <input
              value={amount}
              onChange={(event) => setAmount(formatCentsInput(event.target.value))}
              placeholder="R$ 0"
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#C7CEDA]">
              {t("newEntry.description")}
            </label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={language === "pt" ? "Ex: Supermercado" : "e.g., Grocery"}
              className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
            />
          </div>

          {!isTransfer ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#C7CEDA]">
                {t("newEntry.category")}
              </label>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder={language === "pt" ? "Ex: Alimentacao" : "e.g., Food"}
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#C7CEDA]">
              {t("newEntry.date")}
            </label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
            />
            <p className="text-xs text-[#8B94A6]">{displayDate}</p>
          </div>

          {isCardExpense ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#C7CEDA]">
                {t("newEntry.card")}
              </label>
              <div className="flex flex-wrap gap-2">
                {cards.length === 0 ? (
                  <span className="text-xs text-[#8B94A6]">
                    {language === "pt" ? "Nenhum cartao cadastrado." : "No cards registered."}
                  </span>
                ) : (
                  cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setCardId(card.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        cardId === card.id
                          ? "border-[#5DD6C7] bg-[#1F2A3A] text-[#C7CEDA]"
                          : "border-[#2A3140] bg-[#0F141E] text-[#C7CEDA]"
                      }`}
                    >
                      {card.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {isCardExpense ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-[#C7CEDA]">
                <input
                  type="checkbox"
                  checked={isInstallment}
                  onChange={(event) => setIsInstallment(event.target.checked)}
                  className="h-4 w-4 rounded border-[#2A3140] bg-[#0F141E] text-[#5DD6C7]"
                />
                <span>{language === "pt" ? "Compra parcelada" : "Installments"}</span>
              </label>
              {isInstallment ? (
                <input
                  value={installmentTotal}
                  onChange={(event) => setInstallmentTotal(event.target.value)}
                  placeholder={language === "pt" ? "Numero de parcelas" : "Installment count"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
                />
              ) : null}
            </div>
          ) : null}

          {needsAccount || isTransfer ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#C7CEDA]">
                {isTransfer ? t("newEntry.fromAccount") : t("newEntry.account")}
              </label>
              <div className="flex flex-wrap gap-2">
                {accounts.length === 0 ? (
                  <span className="text-xs text-[#8B94A6]">
                    {language === "pt" ? "Nenhuma conta cadastrada." : "No accounts registered."}
                  </span>
                ) : (
                  accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setAccountId(account.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        accountId === account.id
                          ? "border-[#5DD6C7] bg-[#1F2A3A] text-[#C7CEDA]"
                          : "border-[#2A3140] bg-[#0F141E] text-[#C7CEDA]"
                      }`}
                    >
                      {account.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {isTransfer ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#C7CEDA]">
                {t("newEntry.toAccount")}
              </label>
              <div className="flex flex-wrap gap-2">
                {accounts.length === 0 ? (
                  <span className="text-xs text-[#8B94A6]">
                    {language === "pt" ? "Nenhuma conta cadastrada." : "No accounts registered."}
                  </span>
                ) : (
                  accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setToAccountId(account.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        toAccountId === account.id
                          ? "border-[#5DD6C7] bg-[#1F2A3A] text-[#C7CEDA]"
                          : "border-[#2A3140] bg-[#0F141E] text-[#C7CEDA]"
                      }`}
                    >
                      {account.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
        {saved ? <p className="text-xs text-[#5DD6C7]">{t("newEntry.saved")}</p> : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
