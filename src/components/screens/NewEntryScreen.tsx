"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { hasMissingColumnError } from "@/lib/errorUtils";
import { formatCentsInput, parseCentsInput } from "@/lib/moneyInput";

type CardOwnerType = "self" | "friend";

type Account = {
  id: string;
  name: string;
  balance: number | string;
};

type Card = {
  id: string;
  name: string;
  owner_type: CardOwnerType;
  friend_name: string | null;
};

type LegacyCard = Omit<Card, "owner_type" | "friend_name">;

type Props = {
  entryType: string;
  onClose?: () => void;
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

function isCardOwnershipColumnMissing(error: unknown) {
  return hasMissingColumnError(error, ["owner_type", "friend_name"]);
}

function hydrateLegacyCards(cards: LegacyCard[]): Card[] {
  return cards.map((card) => ({
    ...card,
    owner_type: "self",
    friend_name: null,
  }));
}

export function NewEntryScreen({ entryType, onClose }: Props) {
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const { user } = useAuth();
  const router = useRouter();
  const isTransfer = entryType === "transfer";
  const isCardExpense = entryType === "card_expense";
  const needsAccount = entryType === "income" || entryType === "expense";
  const isExpenseEntry = entryType === "expense" || entryType === "card_expense";
  const canBeFixedEntry = entryType === "income" || isExpenseEntry;

  const emptyMoneyValue = formatCentsInput("", currency);
  const [amount, setAmount] = useState(emptyMoneyValue);
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
  const [isFixed, setIsFixed] = useState(false);
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentTotal, setInstallmentTotal] = useState("");
  const [createCardOpen, setCreateCardOpen] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [newCardLimitAmount, setNewCardLimitAmount] = useState(emptyMoneyValue);
  const [newCardOwnerType, setNewCardOwnerType] = useState<CardOwnerType>("self");
  const [newCardFriendName, setNewCardFriendName] = useState("");
  const [newCardClosingDay, setNewCardClosingDay] = useState("");
  const [newCardDueDay, setNewCardDueDay] = useState("");
  const [createCardSaving, setCreateCardSaving] = useState(false);
  const [createCardError, setCreateCardError] = useState<string | null>(null);

  useEffect(() => {
    if (parseCentsInput(amount) === 0) {
      setAmount(emptyMoneyValue);
    }
    if (parseCentsInput(newCardLimitAmount) === 0) {
      setNewCardLimitAmount(emptyMoneyValue);
    }
  }, [amount, emptyMoneyValue, newCardLimitAmount]);

  useEffect(() => {
    async function loadRefs() {
      if (!user) return;
      const loadCards = async () => {
        const cardsResult = await supabase
          .from("credit_cards")
          .select("id,name,owner_type,friend_name")
          .eq("user_id", user.id)
          .order("owner_type", { ascending: true })
          .order("name", { ascending: true });

        if (!cardsResult.error) {
          return {
            data: (cardsResult.data ?? []) as Card[],
            error: null as unknown,
          };
        }

        if (!isCardOwnershipColumnMissing(cardsResult.error)) {
          return { data: [] as Card[], error: cardsResult.error };
        }

        const legacyCardsResult = await supabase
          .from("credit_cards")
          .select("id,name")
          .eq("user_id", user.id)
          .order("name", { ascending: true });

        if (legacyCardsResult.error) {
          return { data: [] as Card[], error: legacyCardsResult.error };
        }

        return {
          data: hydrateLegacyCards((legacyCardsResult.data ?? []) as LegacyCard[]),
          error: null as unknown,
        };
      };

      const [accountsResult, cardsResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,name,balance")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        loadCards(),
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
          is_fixed: canBeFixedEntry ? isFixed : null,
          is_installment: isCardExpense ? isInstallment || null : null,
          installment_total: isCardExpense ? totalInstallments : null,
          installments_paid: isCardExpense && isInstallment ? 0 : null,
          is_paid: isCardExpense && isInstallment ? false : null,
        },
      ]);

      if (error) {
        const rawError = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
        const missingFixedColumn =
          rawError.includes("is_fixed") &&
          (error.code === "42703" || rawError.includes("column"));
        setErrorMsg(
          missingFixedColumn
            ? language === "pt"
              ? "Atualize o banco com supabase/schema.sql para usar a opcao de transacao fixa."
              : "Update your database with supabase/schema.sql to use the fixed transaction option."
            : t("newEntry.saveError"),
        );
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
    setTimeout(() => {
      setSaved(false);
      if (onClose) onClose(); else router.back();
    }, 800);
  }

  function resetCreateCardForm() {
    setNewCardName("");
    setNewCardLimitAmount(emptyMoneyValue);
    setNewCardOwnerType("self");
    setNewCardFriendName("");
    setNewCardClosingDay("");
    setNewCardDueDay("");
    setCreateCardError(null);
    setCreateCardSaving(false);
  }

  function openCreateCardModal() {
    resetCreateCardForm();
    setCreateCardOpen(true);
  }

  function closeCreateCardModal() {
    if (createCardSaving) return;
    setCreateCardOpen(false);
    resetCreateCardForm();
  }

  async function handleCreateCard() {
    if (!user) return;
    setCreateCardError(null);

    const parsedLimit = parseCentsInput(newCardLimitAmount);
    const parsedClosing = Number(newCardClosingDay);
    const parsedDue = Number(newCardDueDay);
    const trimmedFriendName = newCardFriendName.trim();

    if (!newCardName.trim()) {
      setCreateCardError(t("cards.nameError"));
      return;
    }
    if (newCardOwnerType === "friend" && !trimmedFriendName) {
      setCreateCardError(t("cards.friendNameError"));
      return;
    }
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setCreateCardError(t("newEntry.createCardLimitError"));
      return;
    }
    if (!Number.isInteger(parsedClosing) || parsedClosing < 1 || parsedClosing > 31) {
      setCreateCardError(t("newEntry.createCardClosingDayError"));
      return;
    }
    if (!Number.isInteger(parsedDue) || parsedDue < 1 || parsedDue > 31) {
      setCreateCardError(t("newEntry.createCardDueDayError"));
      return;
    }

    setCreateCardSaving(true);
    let { data, error } = await supabase
      .from("credit_cards")
      .insert([
        {
          user_id: user.id,
          name: newCardName.trim(),
          limit_amount: parsedLimit,
          owner_type: newCardOwnerType,
          friend_name: newCardOwnerType === "friend" ? trimmedFriendName : null,
          closing_day: parsedClosing,
          due_day: parsedDue,
        },
      ])
      .select("id,name,owner_type,friend_name")
      .single();

    if (error && isCardOwnershipColumnMissing(error)) {
      if (newCardOwnerType === "friend") {
        setCreateCardError(t("cards.schemaUpdateRequired"));
        setCreateCardSaving(false);
        return;
      }

      const legacyResult = await supabase
        .from("credit_cards")
        .insert([
          {
            user_id: user.id,
            name: newCardName.trim(),
            limit_amount: parsedLimit,
            closing_day: parsedClosing,
            due_day: parsedDue,
          },
        ])
        .select("id,name")
        .single();

      data = legacyResult.data
        ? {
            ...(legacyResult.data as LegacyCard),
            owner_type: "self",
            friend_name: null,
          }
        : null;
      error = legacyResult.error;
    }

    setCreateCardSaving(false);

    if (error) {
      setCreateCardError(t("cards.saveError"));
      return;
    }

    const created = data as Card;
    setCards((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setCardId(created.id);
    setCreateCardOpen(false);
    resetCreateCardForm();
    window.dispatchEvent(new Event("data-refresh"));
  }

  const displayDate = useMemo(() => {
    const value = new Date(date);
    return value.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US");
  }, [date, language]);

  return (
    <div className="flex flex-col gap-5">
      {!onClose ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} className="ui-btn ui-btn-ghost ui-btn-sm gap-1.5 text-[var(--text-3)]">
            <AppIcon name="arrow-left" size={14} />
            {language === "pt" ? "Voltar" : "Back"}
          </button>
        </div>
      ) : null}

      <div>
        <p className="ui-eyebrow">{t("newEntry.title")}</p>
        <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">{labelForType(entryType, t)}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="ui-label">{t("newEntry.amount")}</label>
          <input value={amount} onChange={(e) => setAmount(formatCentsInput(e.target.value, currency))} placeholder={emptyMoneyValue} inputMode="numeric" pattern="[0-9]*" className="ui-input text-lg font-semibold" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="ui-label">{t("newEntry.description")}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={language === "pt" ? "Ex: Supermercado" : "e.g., Grocery"} className="ui-input" />
        </div>

        {!isTransfer ? (
          <div className="flex flex-col gap-1.5">
            <label className="ui-label">{t("newEntry.category")}</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={language === "pt" ? "Ex: Alimentação" : "e.g., Food"} className="ui-input" />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label className="ui-label">{t("newEntry.date")}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ui-input" />
          <p className="text-xs text-[var(--text-3)]">{displayDate}</p>
        </div>

        {isCardExpense ? (
          <div className="flex flex-col gap-1.5">
            <label className="ui-label">{t("newEntry.card")}</label>
            <div className="flex flex-wrap gap-2">
              {cards.length === 0 ? (
                <span className="text-xs text-[var(--text-3)]">{language === "pt" ? "Nenhum cartão cadastrado." : "No cards registered."}</span>
              ) : cards.map((card) => (
                <button key={card.id} type="button" onClick={() => setCardId(card.id)}
                  className={`ui-btn ui-btn-sm ${cardId === card.id ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                  {card.owner_type === "friend" && card.friend_name ? `${card.name} · ${card.friend_name}` : card.name}
                </button>
              ))}
              <button type="button" onClick={openCreateCardModal} className="ui-btn ui-btn-secondary ui-btn-sm border-dashed">
                + {t("newEntry.createCard")}
              </button>
            </div>
          </div>
        ) : null}

        {canBeFixedEntry ? (
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3">
            <span className="text-sm text-[var(--text-2)]">
              {entryType === "income" ? t("newEntry.fixedIncome") : t("newEntry.fixedExpense")}
            </span>
            <button type="button" onClick={() => setIsFixed((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isFixed ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isFixed ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        ) : null}

        {isCardExpense ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3">
              <span className="text-sm text-[var(--text-2)]">{language === "pt" ? "Compra parcelada" : "Installments"}</span>
              <button type="button" onClick={() => setIsInstallment((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isInstallment ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isInstallment ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {isInstallment ? (
              <input value={installmentTotal} onChange={(e) => setInstallmentTotal(e.target.value)} placeholder={language === "pt" ? "Número de parcelas" : "Installment count"} inputMode="numeric" pattern="[0-9]*" className="ui-input" />
            ) : null}
          </div>
        ) : null}

        {needsAccount || isTransfer ? (
          <div className="flex flex-col gap-1.5">
            <label className="ui-label">{isTransfer ? t("newEntry.fromAccount") : t("newEntry.account")}</label>
            <div className="flex flex-wrap gap-2">
              {accounts.length === 0 ? (
                <span className="text-xs text-[var(--text-3)]">{language === "pt" ? "Nenhuma conta cadastrada." : "No accounts registered."}</span>
              ) : accounts.map((account) => (
                <button key={account.id} type="button" onClick={() => setAccountId(account.id)}
                  className={`ui-btn ui-btn-sm ${accountId === account.id ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                  {account.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isTransfer ? (
          <div className="flex flex-col gap-1.5">
            <label className="ui-label">{t("newEntry.toAccount")}</label>
            <div className="flex flex-wrap gap-2">
              {accounts.length === 0 ? (
                <span className="text-xs text-[var(--text-3)]">{language === "pt" ? "Nenhuma conta cadastrada." : "No accounts registered."}</span>
              ) : accounts.map((account) => (
                <button key={account.id} type="button" onClick={() => setToAccountId(account.id)}
                  className={`ui-btn ui-btn-sm ${toAccountId === account.id ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                  {account.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}
      {saved ? <p className="text-xs text-[var(--green)]">{t("newEntry.saved")}</p> : null}

      <button type="button" onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-lg w-full">
        {saving ? t("common.saving") : t("common.save")}
      </button>

      {/* Create card modal */}
      {createCardOpen ? (
        <div className="ui-modal-backdrop fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={closeCreateCardModal}>
          <div className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--text-1)]">{t("newEntry.createCardTitle")}</p>
              <button type="button" onClick={closeCreateCardModal} className="ui-btn ui-btn-ghost ui-btn-sm">{t("common.cancel")}</button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">{t("cards.ownerLabel")}</label>
                <div className="flex gap-2">
                  {(["self", "friend"] as const).map((ownerType) => (
                    <button key={ownerType} type="button" onClick={() => setNewCardOwnerType(ownerType)}
                      className={`ui-btn ui-btn-sm flex-1 ${newCardOwnerType === ownerType ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                      {ownerType === "self" ? t("cards.ownerSelf") : t("cards.ownerFriend")}
                    </button>
                  ))}
                </div>
              </div>
              <input value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder={t("cards.namePlaceholder")} className="ui-input" />
              {newCardOwnerType === "friend" ? (
                <input value={newCardFriendName} onChange={(e) => setNewCardFriendName(e.target.value)} placeholder={t("cards.friendNamePlaceholder")} className="ui-input" />
              ) : null}
              <input value={newCardLimitAmount} onChange={(e) => setNewCardLimitAmount(formatCentsInput(e.target.value, currency))} placeholder={t("cards.limitPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="ui-input" />
              <div className="grid grid-cols-2 gap-3">
                <input value={newCardClosingDay} onChange={(e) => setNewCardClosingDay(e.target.value)} placeholder={t("cards.closingDayPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="ui-input" />
                <input value={newCardDueDay} onChange={(e) => setNewCardDueDay(e.target.value)} placeholder={t("cards.dueDayPlaceholder")} inputMode="numeric" pattern="[0-9]*" className="ui-input" />
              </div>
              {createCardError ? <p className="text-xs text-[var(--red)]">{createCardError}</p> : null}
              <button type="button" onClick={handleCreateCard} disabled={createCardSaving} className="ui-btn ui-btn-primary ui-btn-lg w-full">
                {createCardSaving ? t("common.saving") : t("newEntry.createCardSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
