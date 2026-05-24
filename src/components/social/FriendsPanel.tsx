"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { getProfileLabel, type FriendProfile, type SharedTransactionRequest, loadAcceptedFriends, loadOutgoingSharedRequests, loadProfilesByIds, findFriendCandidate, addFriendConnection, getSocialErrorMessage } from "@/lib/social";
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

export function FriendsPanel({ userId }: Props) {
  const { language } = useLanguage();
  const { currency } = useCurrency();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<SharedTransactionRequest[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, FriendProfile>>({});
  const [myProfile, setMyProfile] = useState<FriendProfile | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [nextFriends, nextOutgoing, ownProfiles] = await Promise.all([
        loadAcceptedFriends(userId),
        loadOutgoingSharedRequests(userId),
        loadProfilesByIds([userId]),
      ]);

      const friendProfileIds = nextOutgoing.map((item) => item.recipient_user_id);
      const outgoingProfiles = await loadProfilesByIds(friendProfileIds);
      const profileMap = Object.fromEntries(
        outgoingProfiles.map((profile) => [profile.user_id, profile]),
      );

      setFriends(nextFriends);
      setOutgoingRequests(nextOutgoing);
      setProfilesById(profileMap);
      setMyProfile(ownProfiles[0] ?? null);
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

  async function handleAddFriend() {
    const trimmed = query.trim();
    if (!trimmed) {
      setErrorMsg(
        language === "pt"
          ? "Digite o e-mail ou codigo do amigo."
          : "Enter your friend's email or code.",
      );
      return;
    }

    setAdding(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const profile = await findFriendCandidate(trimmed, userId);
      if (!profile) {
        setErrorMsg(
          language === "pt"
            ? "Nenhum usuario encontrado com esse e-mail ou codigo."
            : "No user was found with that email or code.",
        );
        setAdding(false);
        return;
      }

      const result = await addFriendConnection(userId, profile.user_id);
      setQuery("");
      setSuccessMsg(
        result.alreadyExists
          ? language === "pt"
            ? "Essa amizade ja existe."
            : "This friendship already exists."
          : language === "pt"
            ? "Amigo adicionado com sucesso."
            : "Friend added successfully.",
      );
      await loadData();
      window.dispatchEvent(new Event("social-refresh"));
    } catch (error) {
      setErrorMsg(getSocialErrorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  const pendingOrDeclinedOutgoing = useMemo(
    () => outgoingRequests.slice(0, 8),
    [outgoingRequests],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {language === "pt" ? "Seu codigo de amigo" : "Your friend code"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {language === "pt"
                ? "Compartilhe este codigo ou seu e-mail para conectar perfis."
                : "Share this code or your email to connect profiles."}
            </p>
          </div>
          <div className="ui-card-inner min-w-[180px] px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)]">
              {language === "pt" ? "Codigo" : "Code"}
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-1)]">
              {myProfile?.friend_code ?? "--------"}
            </p>
          </div>
        </div>
      </div>

      <div className="ui-card p-5">
        <p className="text-sm font-semibold text-[var(--text-1)]">
          {language === "pt" ? "Adicionar amigo" : "Add friend"}
        </p>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          {language === "pt"
            ? "Procure pelo e-mail da conta ou pelo codigo do amigo."
            : "Search by account email or friend code."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={language === "pt" ? "email@exemplo.com ou A1B2C3D4" : "email@example.com or A1B2C3D4"}
            className="ui-input flex-1"
          />
          <button
            type="button"
            onClick={handleAddFriend}
            disabled={adding}
            className="ui-btn ui-btn-primary"
          >
            {adding
              ? language === "pt"
                ? "Adicionando..."
                : "Adding..."
              : language === "pt"
                ? "Adicionar"
                : "Add"}
          </button>
        </div>
        {errorMsg ? <p className="mt-3 text-xs text-[var(--red)]">{errorMsg}</p> : null}
        {successMsg ? <p className="mt-3 text-xs text-[var(--green)]">{successMsg}</p> : null}
      </div>

      <div className="ui-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {language === "pt" ? "Amigos conectados" : "Connected friends"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {language === "pt"
                ? "Escolha um deles ao enviar despesas ou receitas."
                : "Pick one of them when sending shared expenses or income."}
            </p>
          </div>
          <span className="ui-badge ui-badge-neutral">
            {friends.length} {language === "pt" ? "amigos" : "friends"}
          </span>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--text-3)]">
            {language === "pt" ? "Carregando..." : "Loading..."}
          </p>
        ) : !friends.length ? (
          <p className="mt-4 text-sm text-[var(--text-3)]">
            {language === "pt"
              ? "Nenhum amigo conectado ainda."
              : "No connected friends yet."}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {friends.map((friend) => (
              <div key={friend.user_id} className="ui-card-inner flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-1)]">
                    {getProfileLabel(friend)}
                  </p>
                  <p className="truncate text-xs text-[var(--text-3)]">
                    {friend.email ?? friend.friend_code ?? friend.user_id}
                  </p>
                </div>
                <span className="ui-badge ui-badge-income">
                  {language === "pt" ? "Amigo" : "Friend"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ui-card p-5">
        <p className="text-sm font-semibold text-[var(--text-1)]">
          {language === "pt" ? "Atribuicoes enviadas" : "Sent attributions"}
        </p>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          {language === "pt"
            ? "Acompanhe o que os amigos aceitaram ou recusaram."
            : "Track what your friends accepted or declined."}
        </p>

        {!pendingOrDeclinedOutgoing.length ? (
          <p className="mt-4 text-sm text-[var(--text-3)]">
            {language === "pt"
              ? "Nenhuma atribuicao enviada ainda."
              : "No attributions sent yet."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {pendingOrDeclinedOutgoing.map((request) => {
              const friend = profilesById[request.recipient_user_id];
              const amount = Number(request.amount) || 0;
              return (
                <div key={request.id} className="ui-card-inner px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {request.transaction_type === "income"
                          ? language === "pt"
                            ? "Receita enviada"
                            : "Sent income"
                          : request.transaction_type === "card_expense"
                            ? language === "pt"
                              ? "Despesa no cartao enviada"
                              : "Sent card expense"
                            : language === "pt"
                              ? "Despesa enviada"
                              : "Sent expense"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        {language === "pt" ? "Para" : "To"} {friend ? getProfileLabel(friend) : "—"}
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
                  {request.decline_reason ? (
                    <p className="mt-3 rounded-xl border border-[var(--red)] border-opacity-30 bg-[var(--red-dim)] px-3 py-2 text-xs text-[var(--red)]">
                      {language === "pt" ? "Motivo da recusa: " : "Decline reason: "}
                      {request.decline_reason}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
