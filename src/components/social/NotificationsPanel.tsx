"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { acceptSharedRequest, declineSharedRequest, getProfileLabel, getSocialErrorMessage, loadIncomingSharedRequests, loadProfilesByIds, type FriendProfile, type SharedTransactionRequest } from "@/lib/social";
import { formatCurrencyValue } from "../../../shared/currency";

type Props = {
  userId: string;
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
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<SharedTransactionRequest | null>(null);
  const [declineReason, setDeclineReason] = useState("");

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
      setErrorMsg(getSocialErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  async function handleAccept(request: SharedTransactionRequest) {
    setActingId(request.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await acceptSharedRequest(request, userId);
      setSuccessMsg(
        language === "pt"
          ? "Atribuicao aceita e adicionada nas suas transacoes."
          : "Attribution accepted and added to your transactions.",
      );
      window.dispatchEvent(new Event("data-refresh"));
      window.dispatchEvent(new Event("social-refresh"));
      await loadData();
    } catch (error) {
      setErrorMsg(getSocialErrorMessage(error));
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
      setErrorMsg(getSocialErrorMessage(error));
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
              return (
                <div key={request.id} className="ui-card-inner px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {request.transaction_type === "income"
                          ? language === "pt"
                            ? "Receita recebida"
                            : "Incoming income"
                          : language === "pt"
                            ? "Despesa recebida"
                            : "Incoming expense"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        {language === "pt" ? "Enviado por" : "Sent by"} {sender ? getProfileLabel(sender) : "—"}
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
                    <p className="truncate">{request.description || request.category || "—"}</p>
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
                        onClick={() => handleAccept(request)}
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
