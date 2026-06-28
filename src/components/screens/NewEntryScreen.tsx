"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { AppIcon } from "@/components/AppIcon";
import { BankBrandBadge, BankBrandPicker } from "@/components/BankBrandBadge";
import { DEFAULT_BANK_BRAND_CODE, type BankBrandCode } from "@/lib/bankBrands";
import {
  getMissingColumn,
  hasMissingColumnError,
  hasMissingTableError,
} from "@/lib/errorUtils";
import { formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import {
  buildAlternatingInstallmentIndexes,
  getRemainingInstallmentIndexes,
  normalizeResponsibilityInstallmentIndexes,
} from "@/lib/installmentResponsibility";
import {
  createSharedTransactionRequest,
  getSocialErrorMessage,
  getProfileLabel,
  loadAcceptedFriends,
  type FriendProfile,
} from "@/lib/social";

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
  bank_code?: string | null;
};

type LegacyCard = Omit<Card, "owner_type" | "friend_name">;

type Props = {
  entryType: string;
  onClose?: () => void;
};

type BaseEntryType = "income" | "expense" | "card_expense" | "transfer";
type ShareEntryChoice = "income" | "expense" | "card_expense";
type MissingTransactionFeature = "fixed" | "installments" | "custom_installments" | null;

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function labelForType(type: string, t: (key: string) => string) {
  if (type === "share_with_friend") {
    return "share_with_friend";
  }
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
  const isShareEntry = entryType === "share_with_friend";
  const [shareEntryType, setShareEntryType] = useState<ShareEntryChoice>("expense");
  const effectiveEntryType: BaseEntryType = isShareEntry
    ? shareEntryType
    : (entryType as BaseEntryType);
  const isTransfer = effectiveEntryType === "transfer";
  const isCardExpense = effectiveEntryType === "card_expense";
  const needsAccount = effectiveEntryType === "income" || effectiveEntryType === "expense";
  const senderNeedsAccount = needsAccount;
  const senderNeedsCard = isCardExpense;
  const isExpenseEntry =
    effectiveEntryType === "expense" || effectiveEntryType === "card_expense";
  const canBeFixedEntry = effectiveEntryType === "income" || isExpenseEntry;
  const shouldSendToFriend = isShareEntry;

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
  const [customInstallmentResponsibility, setCustomInstallmentResponsibility] = useState(false);
  const [responsibilityInstallmentIndexes, setResponsibilityInstallmentIndexes] = useState<number[]>([]);
  const [createCardOpen, setCreateCardOpen] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [newCardLimitAmount, setNewCardLimitAmount] = useState(emptyMoneyValue);
  const [newCardOwnerType, setNewCardOwnerType] = useState<CardOwnerType>("self");
  const [newCardFriendName, setNewCardFriendName] = useState("");
  const [newCardBankCode, setNewCardBankCode] = useState<BankBrandCode>(DEFAULT_BANK_BRAND_CODE);
  const [newCardClosingDay, setNewCardClosingDay] = useState("");
  const [newCardDueDay, setNewCardDueDay] = useState("");
  const [createCardSaving, setCreateCardSaving] = useState(false);
  const [createCardError, setCreateCardError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [shareWarning, setShareWarning] = useState<string | null>(null);

  useEffect(() => {
    async function loadRefs() {
      if (!user) return;
      const loadCards = async () => {
        const cardsResult = await supabase
          .from("credit_cards")
          .select("id,name,owner_type,friend_name,bank_code")
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

      const [accountsResult, cardsResult, friendsResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,name,balance")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        loadCards(),
        loadAcceptedFriends(user.id).catch((error) => {
          if (hasMissingTableError(error, ["gamification_friendships", "gamification_profiles"])) {
            return [] as FriendProfile[];
          }
          throw error;
        }),
      ]);

      if (!accountsResult.error) {
        setAccounts((accountsResult.data ?? []) as Account[]);
      }
      if (!cardsResult.error) {
        setCards((cardsResult.data ?? []) as Card[]);
      }
      setFriends(friendsResult);
      if (!friendsResult.length) {
        setSelectedFriendId(null);
      } else {
        setSelectedFriendId((current) =>
          current && friendsResult.some((friend) => friend.user_id === current)
            ? current
            : friendsResult[0]?.user_id ?? null,
        );
      }
    }

    loadRefs().catch(() => {
      setFriends([]);
      setSelectedFriendId(null);
    });
  }, [user]);

  const parsedAmount = useMemo(() => parseCentsInput(amount), [amount]);
  const parsedInstallmentTotal = useMemo(() => {
    const parsed = Number(installmentTotal);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 120 ? parsed : null;
  }, [installmentTotal]);
  const effectiveSelectedFriendId = useMemo(
    () =>
      selectedFriendId && friends.some((friend) => friend.user_id === selectedFriendId)
        ? selectedFriendId
        : friends[0]?.user_id ?? null,
    [friends, selectedFriendId],
  );
  const installmentOptions = useMemo(
    () =>
      parsedInstallmentTotal
        ? Array.from({ length: parsedInstallmentTotal }, (_, index) => index + 1)
        : [],
    [parsedInstallmentTotal],
  );

  function syncResponsibilityInstallments(nextTotal: number | null) {
    if (!nextTotal) {
      setResponsibilityInstallmentIndexes([]);
      return;
    }

    const nextOptions = Array.from({ length: nextTotal }, (_, index) => index + 1);
    setResponsibilityInstallmentIndexes((current) => {
      const valid = current.filter((value) => value >= 1 && value <= nextTotal);
      return valid.length ? valid : nextOptions;
    });
  }

  function handleInstallmentToggle() {
    setIsInstallment((current) => {
      const next = !current;
      if (!next) {
        setCustomInstallmentResponsibility(false);
        setResponsibilityInstallmentIndexes([]);
      } else {
        syncResponsibilityInstallments(parsedInstallmentTotal);
      }
      return next;
    });
  }

  function handleInstallmentTotalChange(nextValue: string) {
    setInstallmentTotal(nextValue);
    const parsed = Number(nextValue);
    const nextTotal =
      Number.isInteger(parsed) && parsed >= 1 && parsed <= 120 ? parsed : null;
    syncResponsibilityInstallments(nextTotal);
  }

  function handleCustomInstallmentResponsibilityToggle() {
    setCustomInstallmentResponsibility((current) => {
      const next = !current;
      if (!next) {
        setResponsibilityInstallmentIndexes([]);
      } else {
        syncResponsibilityInstallments(parsedInstallmentTotal);
      }
      return next;
    });
  }

  async function insertTransactionWithCompatibility(
    payload: Record<string, unknown>,
    options: {
      requiresFixed: boolean;
      requiresInstallments: boolean;
      requiresCustomInstallments: boolean;
    },
  ) {
    const nextPayload: Record<string, unknown> = { ...payload };

    while (true) {
      const result = await supabase
        .from("transactions")
        .insert([nextPayload])
        .select("id")
        .single();
      if (!result.error) {
        return {
          error: null as unknown,
          missingFeature: null as MissingTransactionFeature,
          insertedId: result.data.id as string,
        };
      }

      const missingColumn = getMissingColumn(result.error);
      if (!missingColumn) {
        return {
          error: result.error,
          missingFeature: null as MissingTransactionFeature,
          insertedId: null as string | null,
        };
      }

      if (missingColumn === "responsibility_installment_indexes") {
        if (options.requiresCustomInstallments) {
          return {
            error: result.error,
            missingFeature: "custom_installments" as MissingTransactionFeature,
            insertedId: null as string | null,
          };
        }
        delete nextPayload.responsibility_installment_indexes;
        continue;
      }

      if (
        missingColumn === "is_installment" ||
        missingColumn === "installment_total" ||
        missingColumn === "installments_paid" ||
        missingColumn === "is_paid"
      ) {
        if (options.requiresInstallments) {
          return {
            error: result.error,
            missingFeature: "installments" as MissingTransactionFeature,
            insertedId: null as string | null,
          };
        }
        delete nextPayload[missingColumn];
        continue;
      }

      if (missingColumn === "is_fixed") {
        if (options.requiresFixed) {
          return {
            error: result.error,
            missingFeature: "fixed" as MissingTransactionFeature,
            insertedId: null as string | null,
          };
        }
        delete nextPayload.is_fixed;
        continue;
      }

      return {
        error: result.error,
        missingFeature: null as MissingTransactionFeature,
        insertedId: null as string | null,
      };
    }
  }

  async function rollbackInsertedTransaction(
    transactionId: string | null,
    balanceRollback: { accountId: string; delta: number } | null,
  ) {
    if (transactionId) {
      await supabase.from("transactions").delete().eq("id", transactionId).eq("user_id", user?.id ?? "");
    }
    if (balanceRollback) {
      await updateAccountBalance(balanceRollback.accountId, balanceRollback.delta);
    }
  }

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
    setShareWarning(null);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t("newEntry.amountError"));
      return;
    }

    if (shouldSendToFriend && !effectiveSelectedFriendId) {
      setErrorMsg(
        language === "pt"
          ? "Selecione um amigo para receber a atribuicao."
          : "Select a friend to receive the attribution.",
      );
      return;
    }

    if (isTransfer) {
      if (!accountId || !toAccountId) {
        setErrorMsg(t("newEntry.selectAccountsError"));
        return;
      }
    } else if (senderNeedsAccount && !accountId) {
      setErrorMsg(t("newEntry.selectAccountError"));
      return;
    } else if (senderNeedsCard && !cardId) {
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
      let responsibilityIndexes: number[] | null = null;
      if (isCardExpense && isInstallment) {
        const n = Number(installmentTotal);
        if (!n || !Number.isInteger(n) || n < 1 || n > 120) {
          setErrorMsg(language === "pt" ? "Numero de parcelas invalido." : "Invalid installment count.");
          setSaving(false);
          return;
        }
        totalInstallments = n;

        if (customInstallmentResponsibility) {
          if (!responsibilityInstallmentIndexes.length) {
            setErrorMsg(
              language === "pt"
                ? "Selecione ao menos uma parcela que será paga por você."
                : "Select at least one installment that you will pay.",
            );
            setSaving(false);
            return;
          }

          responsibilityIndexes =
            normalizeResponsibilityInstallmentIndexes(
              responsibilityInstallmentIndexes,
              totalInstallments,
            ) ?? null;
        }

        if (shouldSendToFriend && totalInstallments > 1) {
          const senderInstallments = responsibilityIndexes ?? installmentOptions;
          const remainingInstallments = getRemainingInstallmentIndexes(
            totalInstallments,
            senderInstallments,
          );

          if (!customInstallmentResponsibility) {
            setErrorMsg(
              language === "pt"
                ? "Ao atribuir uma compra parcelada para um amigo, selecione primeiro as parcelas que ficam com você."
                : "When assigning an installment purchase to a friend, first select the installments that stay with you.",
            );
            setSaving(false);
            return;
          }

          if (!remainingInstallments.length) {
            setErrorMsg(
              language === "pt"
                ? "Deixe pelo menos uma parcela disponivel para o amigo."
                : "Leave at least one installment available for your friend.",
            );
            setSaving(false);
            return;
          }
        }
      }

      if (shouldSendToFriend && effectiveSelectedFriendId) {
        let senderTransactionId: string | null = null;
        let balanceRollback: { accountId: string; delta: number } | null = null;
        try {
          const senderInsert = await insertTransactionWithCompatibility(
            {
              user_id: user.id,
              type: effectiveEntryType,
              account_id: senderNeedsAccount ? accountId : null,
              card_id: senderNeedsCard ? cardId : null,
              amount: parsedAmount,
              description: description || null,
              category: category || null,
              date,
              is_fixed: canBeFixedEntry ? isFixed : null,
              is_installment: isCardExpense ? isInstallment || null : null,
              installment_total: isCardExpense ? totalInstallments : null,
              responsibility_installment_indexes:
                isCardExpense && isInstallment ? responsibilityIndexes : null,
              installments_paid: isCardExpense && isInstallment ? 0 : null,
              is_paid: isCardExpense && isInstallment ? false : null,
            },
            {
              requiresFixed: Boolean(canBeFixedEntry && isFixed),
              requiresInstallments: Boolean(isCardExpense && isInstallment),
              requiresCustomInstallments: Boolean(
                isCardExpense &&
                isInstallment &&
                responsibilityIndexes &&
                responsibilityIndexes.length,
              ),
            },
          );

          if (senderInsert.error) {
            const senderErrorFeature = senderInsert.missingFeature;
            setErrorMsg(
              senderErrorFeature === "fixed"
                ? language === "pt"
                  ? "Atualize o banco com supabase/schema.sql para usar a opção de transação fixa."
                  : "Update your database with supabase/schema.sql to use the fixed transaction option."
                : senderErrorFeature === "installments"
                  ? language === "pt"
                    ? "Atualize o banco com supabase/schema.sql para usar compras parceladas no cartão."
                    : "Update your database with supabase/schema.sql to use card installments."
                  : senderErrorFeature === "custom_installments"
                    ? language === "pt"
                      ? "Atualize o banco com supabase/schema.sql para usar parcelas personalizadas."
                      : "Update your database with supabase/schema.sql to use custom installment responsibility."
                    : t("newEntry.saveError"),
            );
            setSaving(false);
            return;
          }

          senderTransactionId = senderInsert.insertedId;

          if (senderNeedsAccount && accountId) {
            const delta = effectiveEntryType === "income" ? parsedAmount : -parsedAmount;
            await updateAccountBalance(accountId, delta);
            balanceRollback = { accountId, delta: -delta };
          }

          await createSharedTransactionRequest({
            requesterUserId: user.id,
            recipientUserId: effectiveSelectedFriendId,
            transactionType:
              effectiveEntryType === "income" ||
              effectiveEntryType === "expense" ||
              effectiveEntryType === "card_expense"
                ? effectiveEntryType
                : "expense",
            amount: parsedAmount,
            description: description || null,
            category: category || null,
            date,
            isFixed: canBeFixedEntry ? isFixed : null,
            isInstallment: isCardExpense ? isInstallment || null : null,
            installmentTotal: isCardExpense ? totalInstallments : null,
            responsibilityInstallmentIndexes:
              isCardExpense && isInstallment ? responsibilityIndexes : null,
            senderTransactionId,
            note:
              isCardExpense && language === "pt"
                ? "Sua parte já foi criada. O amigo escolhe o cartão e as parcelas restantes ao aceitar."
                : isCardExpense
                  ? "Your side has already been created. Your friend will choose their card and remaining installments when accepting."
                  : null,
          });
          window.dispatchEvent(new Event("social-refresh"));
        } catch (error) {
          await rollbackInsertedTransaction(senderTransactionId, balanceRollback);
          setShareWarning(
            getSocialErrorMessage(error, language),
          );
          setSaving(false);
          return;
        }
      } else {
        const { error, missingFeature } = await insertTransactionWithCompatibility(
          {
            user_id: user.id,
            type: effectiveEntryType,
            account_id: senderNeedsAccount ? accountId : null,
            card_id: senderNeedsCard ? cardId : null,
            amount: parsedAmount,
            description: description || null,
            category: category || null,
            date,
            is_fixed: canBeFixedEntry ? isFixed : null,
            is_installment: isCardExpense ? isInstallment || null : null,
            installment_total: isCardExpense ? totalInstallments : null,
            responsibility_installment_indexes:
              isCardExpense && isInstallment ? responsibilityIndexes : null,
            installments_paid: isCardExpense && isInstallment ? 0 : null,
            is_paid: isCardExpense && isInstallment ? false : null,
          },
          {
            requiresFixed: Boolean(canBeFixedEntry && isFixed),
            requiresInstallments: Boolean(isCardExpense && isInstallment),
            requiresCustomInstallments: Boolean(
              isCardExpense &&
              isInstallment &&
              responsibilityIndexes &&
              responsibilityIndexes.length,
            ),
          },
        );

        if (error) {
          setErrorMsg(
            missingFeature === "fixed"
              ? language === "pt"
                ? "Atualize o banco com supabase/schema.sql para usar a opção de transação fixa."
                : "Update your database with supabase/schema.sql to use the fixed transaction option."
              : missingFeature === "installments"
                ? language === "pt"
                  ? "Atualize o banco com supabase/schema.sql para usar compras parceladas no cartão."
                  : "Update your database with supabase/schema.sql to use card installments."
                : missingFeature === "custom_installments"
                  ? language === "pt"
                    ? "Atualize o banco com supabase/schema.sql para usar parcelas personalizadas."
                    : "Update your database with supabase/schema.sql to use custom installment responsibility."
                  : t("newEntry.saveError"),
          );
          setSaving(false);
          return;
        }

        if (senderNeedsAccount) {
          const delta = effectiveEntryType === "income" ? parsedAmount : -parsedAmount;
          await updateAccountBalance(accountId!, delta);
        }
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
    setNewCardBankCode(DEFAULT_BANK_BRAND_CODE);
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
          bank_code: newCardBankCode,
          limit_amount: parsedLimit,
          owner_type: newCardOwnerType,
          friend_name: newCardOwnerType === "friend" ? trimmedFriendName : null,
          closing_day: parsedClosing,
          due_day: parsedDue,
        },
      ])
      .select("id,name,owner_type,friend_name,bank_code")
      .single();

    if (error && (isCardOwnershipColumnMissing(error) || hasMissingColumnError(error, ["bank_code"]))) {
      if (newCardOwnerType === "friend" && isCardOwnershipColumnMissing(error)) {
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
            ...(isCardOwnershipColumnMissing(error)
              ? {}
              : { owner_type: newCardOwnerType, friend_name: newCardOwnerType === "friend" ? trimmedFriendName : null }),
            closing_day: parsedClosing,
            due_day: parsedDue,
          },
        ])
        .select("id,name,owner_type,friend_name")
        .single();

      data = legacyResult.data
        ? {
            ...(legacyResult.data as LegacyCard & { owner_type?: CardOwnerType; friend_name?: string | null }),
            owner_type: (legacyResult.data as { owner_type?: CardOwnerType }).owner_type ?? "self",
            friend_name: (legacyResult.data as { friend_name?: string | null }).friend_name ?? null,
            bank_code: null,
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
        <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">
          {isShareEntry
            ? language === "pt"
              ? "Atribuir a amigos"
              : "Assign to friends"
            : labelForType(effectiveEntryType, t)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {isShareEntry ? (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4">
            <label className="ui-label">
              {language === "pt" ? "Tipo da atribuicao" : "Attribution type"}
            </label>
            <div className="grid grid-cols-1 gap-2 min-[460px]:grid-cols-3">
              {([
                { key: "expense", label: language === "pt" ? "Despesa" : "Expense" },
                { key: "card_expense", label: language === "pt" ? "Despesa cartão" : "Card expense" },
                { key: "income", label: language === "pt" ? "Receita" : "Income" },
              ] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setShareEntryType(option.key)}
                  className={`ui-btn ui-btn-sm w-full justify-center ${shareEntryType === option.key ? "ui-btn-primary" : "ui-btn-secondary"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

        {senderNeedsCard ? (
          <div className="flex flex-col gap-1.5">
            <label className="ui-label">{t("newEntry.card")}</label>
            <div className="flex flex-wrap gap-2">
              {cards.length === 0 ? (
                <span className="text-xs text-[var(--text-3)]">{language === "pt" ? "Nenhum cartão cadastrado." : "No cards registered."}</span>
              ) : cards.map((card) => (
                <button key={card.id} type="button" onClick={() => setCardId(card.id)}
                  className={`ui-btn ui-btn-sm gap-2 ${cardId === card.id ? "ui-btn-primary" : "ui-btn-secondary"}`}>
                  <BankBrandBadge bankCode={card.bank_code} size="sm" />
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
              {effectiveEntryType === "income" ? t("newEntry.fixedIncome") : t("newEntry.fixedExpense")}
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
              <button type="button" onClick={handleInstallmentToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isInstallment ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isInstallment ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {isInstallment ? (
              <div className="flex flex-col gap-3">
                <input value={installmentTotal} onChange={(e) => handleInstallmentTotalChange(e.target.value)} placeholder={language === "pt" ? "Número de parcelas" : "Installment count"} inputMode="numeric" pattern="[0-9]*" className="ui-input" />

                {parsedInstallmentTotal && parsedInstallmentTotal > 1 ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-1)]">
                          {language === "pt" ? "Parcelas que eu pago" : "Installments I pay"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-3)]">
                          {language === "pt"
                            ? "Cadastre o valor total e deixe marcadas so as parcelas que saem do seu bolso."
                            : "Register the full amount and keep selected only the installments that come out of your pocket."}
                        </p>
                      </div>
                      <button type="button" onClick={handleCustomInstallmentResponsibilityToggle}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${customInstallmentResponsibility ? "bg-[var(--accent)]" : "bg-[var(--surface-3)] border border-[var(--border-bright)]"}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${customInstallmentResponsibility ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </div>

                    {customInstallmentResponsibility ? (
                      <div className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setResponsibilityInstallmentIndexes(installmentOptions)} className="ui-btn ui-btn-secondary ui-btn-sm">
                            {language === "pt" ? "Todas" : "All"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setResponsibilityInstallmentIndexes(
                                buildAlternatingInstallmentIndexes(parsedInstallmentTotal, 1),
                              )
                            }
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                          >
                            {language === "pt" ? "1a, 3a, 5a..." : "1st, 3rd, 5th..."}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setResponsibilityInstallmentIndexes(
                                buildAlternatingInstallmentIndexes(parsedInstallmentTotal, 2),
                              )
                            }
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                          >
                            {language === "pt" ? "2a, 4a, 6a..." : "2nd, 4th, 6th..."}
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 min-[560px]:grid-cols-5">
                          {installmentOptions.map((installmentIndex) => {
                            const isSelected = responsibilityInstallmentIndexes.includes(installmentIndex);
                            return (
                              <button
                                key={installmentIndex}
                                type="button"
                                onClick={() =>
                                  setResponsibilityInstallmentIndexes((current) =>
                                    current.includes(installmentIndex)
                                      ? current.filter((value) => value !== installmentIndex)
                                      : [...current, installmentIndex].sort((left, right) => left - right),
                                  )
                                }
                                className={`ui-btn ui-btn-sm w-full justify-center ${isSelected ? "ui-btn-primary" : "ui-btn-secondary"}`}
                              >
                                {installmentIndex}x
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-xs text-[var(--text-3)]">
                          {language === "pt"
                            ? "As parcelas desmarcadas ficam por conta do amigo ou de outro acordo."
                            : "Unselected installments stay with your friend or another agreement."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {senderNeedsAccount || isTransfer ? (
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

        {isShareEntry ? (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4">
            <div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {language === "pt" ? "Enviar para um amigo" : "Send to a friend"}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  {language === "pt"
                    ? "Sua transação será salva agora. O amigo escolhe a conta ou cartão dele ao aceitar."
                    : "Your transaction will be saved now. Your friend will choose their own account or card when accepting."}
                </p>
              </div>
            </div>

            {!friends.length ? (
              <p className="text-xs text-[var(--text-3)]">
                {language === "pt"
                  ? "Adicione amigos na aba Mais para usar atribuições compartilhadas."
                  : "Add friends in the More tab to use shared attributions."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="ui-label">
                  {language === "pt" ? "Recebera a atribuicao" : "Will receive the attribution"}
                </label>
                <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
                  {friends.map((friend) => (
                    <button
                      key={friend.user_id}
                      type="button"
                      onClick={() => setSelectedFriendId(friend.user_id)}
                      className={`ui-btn ui-btn-sm w-full justify-start ${effectiveSelectedFriendId === friend.user_id ? "ui-btn-primary" : "ui-btn-secondary"}`}
                    >
                      {getProfileLabel(friend)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-3)]">
                  {language === "pt"
                    ? "O amigo poderá aceitar ou recusar na aba Notificações."
                    : "Your friend will be able to accept or decline it in Notifications."}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}
      {shareWarning ? <p className="text-xs text-[var(--amber)]">{shareWarning}</p> : null}
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
              <BankBrandPicker selected={newCardBankCode} onSelect={setNewCardBankCode} />
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
