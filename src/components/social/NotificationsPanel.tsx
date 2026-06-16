"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { supabase } from "@/lib/supabaseClient";
import {
  acceptSharedRequest,
  declineSharedRequest,
  getProfileLabel,
  getSocialErrorMessage,
  loadIncomingSharedRequests,
  loadProfilesByIds,
  type FriendProfile,
  type SharedTransactionRequest,
} from "@/lib/social";
import {
  buildAlternatingInstallmentIndexes,
  getRemainingInstallmentIndexes,
  parseExplicitInstallmentIndexes,
} from "@/lib/installmentResponsibility";
import { formatCurrencyValue } from "../../../shared/currency";

type Props = {
  userId: string;
};

type AccountOption = {
  id: string;
  name: string;
};

type CardOption = {
  id: string;
  name: string;
};

function formatCurrency(amount: number, language: "pt" | "en", currency: "BRL" | "EUR") {
  return formatCurrencyValue(amount, language, currency);
}

function formatDate(value: string, language: "pt" | "en") {
  return new Date(`${value}T00:00:00`).toLocaleDateString(
    language === "pt" ? "pt-BR" : "en-US",
  );
}

export function NotificationsPanel({ userId }: Props) {
  const { language } = useLanguage();
  const { currency } = useCurrency();
  const [requests, setRequests] = useState<SharedTransactionRequest[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, FriendProfile>>({});
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<SharedTransactionRequest | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [acceptTarget, setAcceptTarget] = useState<SharedTransactionRequest | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedRecipientInstallmentIndexes, setSelectedRecipientInstallmentIndexes] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const nextRequests = await loadIncomingSharedRequests(userId);
      const profiles = await loadProfilesByIds(
        nextRequests.map((request) => request.requester_user_id),
      );
      setRequests(nextRequests);
      setProfilesById(Object.fromEntries(profiles.map((profile) => [profile.user_id, profile])));
    } catch (error) {
      setErrorMsg(getSocialErrorMessage(error, language));
    } finally {
      setLoading(false);
    }
  }, [language, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    async function loadDestinationOptions() {
      const [accountsResult, cardsResult] = await Promise.all([
        supabase
          .from("accounts")
          .select("id,name")
          .eq("user_id", userId)
          .order("name", { ascending: true }),
        supabase
          .from("credit_cards")
          .select("id,name")
          .eq("user_id", userId)
          .order("name", { ascending: true }),
      ]);

      if (!accountsResult.error) {
        setAccounts((accountsResult.data ?? []) as AccountOption[]);
      }
      if (!cardsResult.error) {
        setCards((cardsResult.data ?? []) as CardOption[]);
      }
    }

    loadDestinationOptions();
  }, [userId]);

  useEffect(() => {
    function handleRefresh() {
      void loadData();
    }
    window.addEventListener("social-refresh", handleRefresh);
    return () => window.removeEventListener("social-refresh", handleRefresh);
  }, [loadData]);

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests],
  );

  const acceptTitle = useMemo(() => {
    if (!acceptTarget) return "";
    if (acceptTarget.transaction_type === "income") {
      return language === "pt" ? "Escolha a conta da receita" : "Choose the income account";
    }
    if (acceptTarget.transaction_type === "card_expense") {
      return language === "pt" ? "Escolha o cartao da despesa" : "Choose the expense card";
    }
    return language === "pt" ? "Escolha a conta da despesa" : "Choose the expense account";
  }, [acceptTarget, language]);

  const senderBlockedInstallments = useMemo(
    () =>
      acceptTarget
        ? parseExplicitInstallmentIndexes(
            acceptTarget.responsibility_installment_indexes,
            acceptTarget.installment_total,
          )
        : [],
    [acceptTarget],
  );

  const recipientAvailableInstallments = useMemo(
    () =>
      acceptTarget
        ? getRemainingInstallmentIndexes(
            acceptTarget.installment_total,
            acceptTarget.responsibility_installment_indexes,
          )
        : [],
    [acceptTarget],
  );

  function openAcceptModal(request: SharedTransactionRequest) {
    setAcceptTarget(request);
    setSelectedAccountId(accounts[0]?.id ?? null);
    setSelectedCardId(cards[0]?.id ?? null);
    setSelectedRecipientInstallmentIndexes(
      getRemainingInstallmentIndexes(
        request.installment_total,
        request.responsibility_installment_indexes,
      ),
    );
    setErrorMsg(null);
  }

  function closeAcceptModal() {
    setAcceptTarget(null);
    setSelectedAccountId(null);
    setSelectedCardId(null);
    setSelectedRecipientInstallmentIndexes([]);
  }

  async function handleAcceptSubmit() {
    if (!acceptTarget) return;

    if (acceptTarget.transaction_type === "card_expense" && !selectedCardId) {
      setErrorMsg(
        language === "pt"
          ? "Selecione o cartao que recebera essa despesa."
          : "Select the card that will receive this expense.",
      );
      return;
    }

    if (acceptTarget.transaction_type !== "card_expense" && !selectedAccountId) {
      setErrorMsg(
        language === "pt"
          ? "Selecione a conta que recebera essa transacao."
          : "Select the account that will receive this transaction.",
      );
      return;
    }

    if (
      acceptTarget.transaction_type === "card_expense" &&
      acceptTarget.is_installment &&
      recipientAvailableInstallments.length === 0
    ) {
      setErrorMsg(
        language === "pt"
          ? "Essa atribuicao nao deixou parcelas disponiveis para voce. Peça para o remetente ajustar a divisao."
          : "This attribution did not leave any installments available for you. Ask the sender to adjust the split.",
      );
      return;
    }

    if (
      acceptTarget.transaction_type === "card_expense" &&
      acceptTarget.is_installment &&
      recipientAvailableInstallments.length > 0 &&
      selectedRecipientInstallmentIndexes.length === 0
    ) {
      setErrorMsg(
        language === "pt"
          ? "Selecione ao menos uma parcela que ficara com voce."
          : "Select at least one installment that will stay with you.",
      );
      return;
    }

    setActingId(acceptTarget.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await acceptSharedRequest(acceptTarget, userId, {
        accountId: acceptTarget.transaction_type === "card_expense" ? null : selectedAccountId,
        cardId: acceptTarget.transaction_type === "card_expense" ? selectedCardId : null,
        responsibilityInstallmentIndexes:
          acceptTarget.transaction_type === "card_expense" && acceptTarget.is_installment
            ? selectedRecipientInstallmentIndexes
            : null,
      });
      setSuccessMsg(
        language === "pt"
          ? "Atribuicao aceita e adicionada nas suas transacoes."
          : "Attribution accepted and added to your transactions.",
      );
      closeAcceptModal();
      window.dispatchEvent(new Event("data-refresh"));
      window.dispatchEvent(new Event("social-refresh"));
      await loadData();
    } catch (error) {
      setErrorMsg(getSocialErrorMessage(error, language));
    } finally {
      setActingId(null);
    }
  }

  async function handleDeclineSubmit() {
    if (!declineTarget) return;
    const trimmed = declineReason.trim();
    if (!trimmed) {
      setErrorMsg(
        language === "pt"
          ? "Explique o motivo da recusa."
          : "Please explain why you declined it.",
      );
      return;
    }
    setActingId(declineTarget.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await declineSharedRequest(declineTarget.id, userId, trimmed);
      setSuccessMsg(
        language === "pt"
          ? "Atribuicao recusada."
          : "Attribution declined.",
      );
      setDeclineTarget(null);
      setDeclineReason("");
      window.dispatchEvent(new Event("social-refresh"));
      await loadData();
    } catch (error) {
      setErrorMsg(getSocialErrorMessage(error, language));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {language === "pt" ? "Caixa de entrada" : "Inbox"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {language === "pt"
                ? "Aceite ou recuse despesas e receitas enviadas por amigos."
                : "Accept or decline expenses and income sent by friends."}
            </p>
          </div>
          <span className={`ui-badge ${pendingCount > 0 ? "ui-badge-warning" : "ui-badge-neutral"}`}>
            {pendingCount} {language === "pt" ? "pendentes" : "pending"}
          </span>
        </div>

        {errorMsg ? <p className="mt-4 text-xs text-[var(--red)]">{errorMsg}</p> : null}
        {successMsg ? <p className="mt-4 text-xs text-[var(--green)]">{successMsg}</p> : null}

        {loading ? (
          <p className="mt-4 text-sm text-[var(--text-3)]">
            {language === "pt" ? "Carregando..." : "Loading..."}
          </p>
        ) : !requests.length ? (
          <p className="mt-4 text-sm text-[var(--text-3)]">
            {language === "pt"
              ? "Nenhuma notificacao por aqui."
              : "No notifications here yet."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {requests.map((request) => {
              const sender = profilesById[request.requester_user_id];
              const amount = Number(request.amount) || 0;
              const isPending = request.status === "pending";
              const typeLabel =
                request.transaction_type === "income"
                  ? language === "pt"
                    ? "Receita recebida"
                    : "Incoming income"
                  : request.transaction_type === "card_expense"
                    ? language === "pt"
                      ? "Despesa no cartao recebida"
                      : "Incoming card expense"
                    : language === "pt"
                      ? "Despesa recebida"
                      : "Incoming expense";

              return (
                <div key={request.id} className="ui-card-inner px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {typeLabel}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        {language === "pt" ? "Enviado por" : "Sent by"} {sender ? getProfileLabel(sender) : "--"}
                      </p>
                    </div>
                    <span className={`ui-badge ${
                      request.status === "accepted"
                        ? "ui-badge-income"
                        : request.status === "declined"
                          ? "ui-badge-expense"
                          : "ui-badge-warning"
                    }`}>
                      {request.status === "accepted"
                        ? language === "pt"
                          ? "Aceita"
                          : "Accepted"
                        : request.status === "declined"
                          ? language === "pt"
                            ? "Recusada"
                            : "Declined"
                          : language === "pt"
                            ? "Pendente"
                            : "Pending"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-[var(--text-2)] sm:grid-cols-3">
                    <p>{formatCurrency(amount, language, currency)}</p>
                    <p>{formatDate(request.date, language)}</p>
                    <p className="truncate">{request.description || request.category || "--"}</p>
                  </div>

                  {request.note ? (
                    <p className="mt-3 text-xs text-[var(--text-3)]">{request.note}</p>
                  ) : null}

                  {request.decline_reason ? (
                    <p className="mt-3 rounded-xl border border-[var(--red)] border-opacity-30 bg-[var(--red-dim)] px-3 py-2 text-xs text-[var(--red)]">
                      {language === "pt" ? "Motivo da recusa: " : "Decline reason: "}
                      {request.decline_reason}
                    </p>
                  ) : null}

                  {isPending ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          openAcceptModal(request);
                        }}
                        disabled={actingId === request.id}
                        className="ui-btn ui-btn-primary ui-btn-sm"
                      >
                        {actingId === request.id
                          ? language === "pt"
                            ? "Salvando..."
                            : "Saving..."
                          : language === "pt"
                            ? "Aceitar"
                            : "Accept"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineTarget(request);
                          setDeclineReason("");
                          setErrorMsg(null);
                        }}
                        disabled={actingId === request.id}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                      >
                        {language === "pt" ? "Recusar" : "Decline"}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {acceptTarget ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={closeAcceptModal}
        >
          <div
          className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl"
          onClick={(event) => event.stopPropagation()}
        >
            <div className="mb-4">
              <p className="text-sm font-semibold text-[var(--text-1)]">{acceptTitle}</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                {acceptTarget.transaction_type === "card_expense"
                  ? language === "pt"
                    ? "A despesa sera criada no cartao escolhido com o mesmo tipo da origem."
                    : "The expense will be created on the selected card with the same original type."
                  : language === "pt"
                    ? "A transacao sera criada na conta escolhida."
                    : "The transaction will be created in the selected account."}
              </p>
            </div>

            {acceptTarget.transaction_type === "card_expense" ? (
              <div className="flex flex-col gap-2">
                <label className="ui-label">{language === "pt" ? "Cartao" : "Card"}</label>
                <div className="flex flex-wrap gap-2">
                  {cards.length === 0 ? (
                    <p className="text-xs text-[var(--text-3)]">
                      {language === "pt" ? "Nenhum cartao cadastrado." : "No cards registered."}
                    </p>
                  ) : cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className={`ui-btn ui-btn-sm ${selectedCardId === card.id ? "ui-btn-primary" : "ui-btn-secondary"}`}
                    >
                      {card.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="ui-label">{language === "pt" ? "Conta" : "Account"}</label>
                <div className="flex flex-wrap gap-2">
                  {accounts.length === 0 ? (
                    <p className="text-xs text-[var(--text-3)]">
                      {language === "pt" ? "Nenhuma conta cadastrada." : "No accounts registered."}
                    </p>
                  ) : accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setSelectedAccountId(account.id)}
                      className={`ui-btn ui-btn-sm ${selectedAccountId === account.id ? "ui-btn-primary" : "ui-btn-secondary"}`}
                    >
                      {account.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {acceptTarget.transaction_type === "card_expense" && acceptTarget.is_installment ? (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-3)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {language === "pt" ? "Parcelas que ficam com voce" : "Installments that stay with you"}
                </p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  {language === "pt"
                    ? `Essa compra parcelada tera ${acceptTarget.installment_total ?? 0} parcelas. As parcelas do remetente ficam bloqueadas.`
                    : `This purchase will have ${acceptTarget.installment_total ?? 0} installments. The sender's installments are blocked.`}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRecipientInstallmentIndexes(recipientAvailableInstallments)}
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    {language === "pt" ? "Todas as minhas" : "All mine"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRecipientInstallmentIndexes(
                        recipientAvailableInstallments.filter((value) =>
                          buildAlternatingInstallmentIndexes(
                            Number(acceptTarget.installment_total) || 0,
                            1,
                          ).includes(value),
                        ),
                      )
                    }
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    {language === "pt" ? "1a, 3a, 5a..." : "1st, 3rd, 5th..."}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRecipientInstallmentIndexes(
                        recipientAvailableInstallments.filter((value) =>
                          buildAlternatingInstallmentIndexes(
                            Number(acceptTarget.installment_total) || 0,
                            2,
                          ).includes(value),
                        ),
                      )
                    }
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    {language === "pt" ? "2a, 4a, 6a..." : "2nd, 4th, 6th..."}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
                  {Array.from(
                    { length: Math.max(Number(acceptTarget.installment_total) || 0, 0) },
                    (_, index) => index + 1,
                  ).map((installmentIndex) => {
                    const isBlocked = senderBlockedInstallments.includes(installmentIndex);
                    const isSelected = selectedRecipientInstallmentIndexes.includes(installmentIndex);
                    return (
                      <button
                        key={installmentIndex}
                        type="button"
                        disabled={isBlocked}
                        onClick={() =>
                          setSelectedRecipientInstallmentIndexes((current) =>
                            current.includes(installmentIndex)
                              ? current.filter((value) => value !== installmentIndex)
                              : [...current, installmentIndex].sort((left, right) => left - right),
                          )
                        }
                        className={`ui-btn ui-btn-sm w-full justify-center ${
                          isBlocked
                            ? "cursor-not-allowed opacity-45"
                            : isSelected
                              ? "ui-btn-primary"
                              : "ui-btn-secondary"
                        }`}
                      >
                        {installmentIndex}x
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-col gap-1 text-xs text-[var(--text-3)]">
                  <p>
                    {language === "pt"
                      ? "Parcelas apagadas/escurecidas ja pertencem a quem enviou."
                      : "Dimmed installments already belong to the sender."}
                  </p>
                  <p>
                    {language === "pt"
                      ? "As destacadas serao criadas na sua transacao."
                      : "Highlighted installments will be created in your transaction."}
                  </p>
                </div>
              </div>
            ) : null}

            {acceptTarget.is_fixed ? (
              <p className="mt-2 text-xs text-[var(--text-3)]">
                {language === "pt"
                  ? "A configuracao de transacao fixa tambem sera preservada."
                  : "The fixed transaction setting will also be preserved."}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2 sm:justify-end">
              <button
                type="button"
                onClick={closeAcceptModal}
                className="ui-btn ui-btn-secondary"
              >
                {language === "pt" ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleAcceptSubmit}
                disabled={actingId === acceptTarget.id}
                className="ui-btn ui-btn-primary"
              >
                {actingId === acceptTarget.id
                  ? language === "pt"
                    ? "Salvando..."
                    : "Saving..."
                  : language === "pt"
                    ? "Confirmar aceite"
                    : "Confirm acceptance"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {declineTarget ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setDeclineTarget(null)}
        >
          <div
            className="ui-card-2 ui-slide-up w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-[var(--text-1)]">
                {language === "pt" ? "Por que voce esta recusando?" : "Why are you declining this?"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                {language === "pt"
                  ? "Esse motivo sera mostrado para quem enviou a atribuicao."
                  : "This reason will be shown to the person who sent the attribution."}
              </p>
            </div>
            <textarea
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              rows={4}
              placeholder={
                language === "pt"
                  ? "Ex.: essa compra nao foi minha / o valor esta incorreto"
                  : "e.g. this purchase was not mine / the amount is incorrect"
              }
              className="ui-input min-h-[120px] resize-none"
            />
            <div className="mt-4 flex gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                className="ui-btn ui-btn-secondary"
              >
                {language === "pt" ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleDeclineSubmit}
                disabled={actingId === declineTarget.id}
                className="ui-btn ui-btn-primary"
              >
                {actingId === declineTarget.id
                  ? language === "pt"
                    ? "Enviando..."
                    : "Sending..."
                  : language === "pt"
                    ? "Confirmar recusa"
                    : "Confirm decline"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
