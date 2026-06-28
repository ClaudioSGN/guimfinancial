import { supabase } from "@/lib/supabaseClient";
import {
  getErrorMessage,
  hasMissingColumnError,
  hasMissingTableError,
} from "@/lib/errorUtils";
import { getRemainingInstallmentIndexes } from "@/lib/installmentResponsibility";

export type FriendProfile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  friend_code: string | null;
  avatar_url: string | null;
};

export type SharedRequestStatus = "pending" | "accepted" | "declined";
export type SharedRequestType = "income" | "expense" | "card_expense";

export type SharedTransactionRequest = {
  id: string;
  requester_user_id: string;
  recipient_user_id: string;
  transaction_type: SharedRequestType;
  amount: number | string;
  description: string | null;
  category: string | null;
  date: string;
  is_fixed: boolean | null;
  is_installment: boolean | null;
  installment_total: number | null;
  responsibility_installment_indexes: number[] | null;
  status: SharedRequestStatus;
  sender_transaction_id: string | null;
  recipient_transaction_id: string | null;
  decline_reason: string | null;
  note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_user_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
};

function buildFriendMap(
  friendships: FriendshipRow[],
  profiles: FriendProfile[],
  viewerUserId: string,
) {
  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  return friendships
    .map((row) => {
      const friendUserId =
        row.user_id === viewerUserId ? row.friend_user_id : row.user_id;
      const profile = profileById.get(friendUserId);
      if (!profile) return null;
      return profile;
    })
    .filter(Boolean) as FriendProfile[];
}

function uniqueProfiles(profiles: FriendProfile[]) {
  const map = new Map<string, FriendProfile>();
  profiles.forEach((profile) => {
    map.set(profile.user_id, profile);
  });
  return Array.from(map.values()).sort((left, right) =>
    getProfileLabel(left).localeCompare(getProfileLabel(right), undefined, {
      sensitivity: "base",
    }),
  );
}

export function getProfileLabel(profile: Pick<FriendProfile, "display_name" | "email" | "friend_code">) {
  return (
    profile.display_name?.trim() ||
    profile.email?.trim() ||
    profile.friend_code?.trim() ||
    "User"
  );
}

export async function loadAcceptedFriends(userId: string) {
  const friendshipsResult = await supabase
    .from("gamification_friendships")
    .select("id,user_id,friend_user_id,status,created_at")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`);

  if (friendshipsResult.error) throw friendshipsResult.error;

  const friendships = (friendshipsResult.data ?? []) as FriendshipRow[];
  const friendIds = Array.from(
    new Set(
      friendships.map((row) =>
        row.user_id === userId ? row.friend_user_id : row.user_id,
      ),
    ),
  );
  if (!friendIds.length) return [] as FriendProfile[];

  const profilesResult = await supabase
    .from("gamification_profiles")
    .select("user_id,display_name,email,friend_code,avatar_url")
    .in("user_id", friendIds);
  if (profilesResult.error) throw profilesResult.error;

  return uniqueProfiles(
    buildFriendMap(
      friendships,
      (profilesResult.data ?? []) as FriendProfile[],
      userId,
    ),
  );
}

export async function findFriendCandidate(query: string, currentUserId: string) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const normalizedCode = trimmed.toUpperCase();
  const normalizedEmail = trimmed.toLowerCase();

  let profileResult = await supabase
    .from("gamification_profiles")
    .select("user_id,display_name,email,friend_code,avatar_url")
    .eq("friend_code", normalizedCode)
    .neq("user_id", currentUserId)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;
  if (profileResult.data) return profileResult.data as FriendProfile;

  profileResult = await supabase
    .from("gamification_profiles")
    .select("user_id,display_name,email,friend_code,avatar_url")
    .ilike("email", normalizedEmail)
    .neq("user_id", currentUserId)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;
  return (profileResult.data ?? null) as FriendProfile | null;
}

export async function addFriendConnection(userId: string, friendUserId: string) {
  const direct = await supabase
    .from("gamification_friendships")
    .select("id,status")
    .eq("user_id", userId)
    .eq("friend_user_id", friendUserId)
    .maybeSingle();
  if (direct.error) throw direct.error;

  if (direct.data?.status === "accepted") return { alreadyExists: true };
  if (direct.data) {
    const updateResult = await supabase
      .from("gamification_friendships")
      .update({ status: "accepted" })
      .eq("id", direct.data.id);
    if (updateResult.error) throw updateResult.error;
    return { alreadyExists: false };
  }

  const reverse = await supabase
    .from("gamification_friendships")
    .select("id,status")
    .eq("user_id", friendUserId)
    .eq("friend_user_id", userId)
    .maybeSingle();
  if (reverse.error) throw reverse.error;
  if (reverse.data) {
    return { alreadyExists: reverse.data.status === "accepted" };
  }

  const insertResult = await supabase.from("gamification_friendships").insert([
    {
      user_id: userId,
      friend_user_id: friendUserId,
      status: "accepted",
    },
  ]);
  if (insertResult.error) throw insertResult.error;
  return { alreadyExists: false };
}

export async function createSharedTransactionRequest(params: {
  requesterUserId: string;
  recipientUserId: string;
  transactionType: SharedRequestType;
  amount: number;
  description?: string | null;
  category?: string | null;
  date: string;
  isFixed?: boolean | null;
  isInstallment?: boolean | null;
  installmentTotal?: number | null;
  responsibilityInstallmentIndexes?: number[] | null;
  senderTransactionId?: string | null;
  note?: string | null;
}) {
  const basePayload = {
    requester_user_id: params.requesterUserId,
    recipient_user_id: params.recipientUserId,
    transaction_type: params.transactionType,
    amount: params.amount,
    description: params.description ?? null,
    category: params.category ?? null,
    date: params.date,
  };

  const fullPayload = {
    ...basePayload,
    is_fixed: params.isFixed ?? null,
    is_installment: params.isInstallment ?? null,
    installment_total: params.installmentTotal ?? null,
    responsibility_installment_indexes:
      params.responsibilityInstallmentIndexes ?? null,
    sender_transaction_id: params.senderTransactionId ?? null,
    note: params.note ?? null,
  };

  const insertResult = await supabase
    .from("shared_transaction_requests")
    .insert([fullPayload]);

  if (!insertResult.error) return;

  if (
    hasMissingColumnError(insertResult.error, [
      "is_fixed",
      "is_installment",
      "installment_total",
      "responsibility_installment_indexes",
      "note",
      "sender_transaction_id",
    ])
  ) {
    const missingNote = hasMissingColumnError(insertResult.error, ["note"]);
    const missingSenderTransactionId = hasMissingColumnError(insertResult.error, [
      "sender_transaction_id",
    ]);
    const missingResponsibilityInstallments = hasMissingColumnError(insertResult.error, [
      "responsibility_installment_indexes",
    ]);

    if (missingResponsibilityInstallments && params.responsibilityInstallmentIndexes?.length) {
      throw insertResult.error;
    }

    if (
      (hasMissingColumnError(insertResult.error, ["is_installment"]) ||
        hasMissingColumnError(insertResult.error, ["installment_total"])) &&
      (params.isInstallment || params.installmentTotal)
    ) {
      throw insertResult.error;
    }

    if (hasMissingColumnError(insertResult.error, ["is_fixed"]) && params.isFixed) {
      throw insertResult.error;
    }

    const legacyPayload = {
      ...basePayload,
      ...(missingResponsibilityInstallments
        ? {}
        : {
            responsibility_installment_indexes:
              params.responsibilityInstallmentIndexes ?? null,
          }),
      ...(missingSenderTransactionId
        ? {}
        : { sender_transaction_id: params.senderTransactionId ?? null }),
      ...(missingNote ? {} : { note: params.note ?? null }),
    };
    const legacyInsertResult = await supabase
      .from("shared_transaction_requests")
      .insert([legacyPayload]);
    if (!legacyInsertResult.error) return;
    throw legacyInsertResult.error;
  }

  throw insertResult.error;
}

export async function loadIncomingSharedRequests(userId: string) {
  const result = await supabase
    .from("shared_transaction_requests")
    .select("*")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []) as SharedTransactionRequest[];
}

export async function loadOutgoingSharedRequests(userId: string) {
  const result = await supabase
    .from("shared_transaction_requests")
    .select("*")
    .eq("requester_user_id", userId)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []) as SharedTransactionRequest[];
}

export async function loadProfilesByIds(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueIds.length) return [] as FriendProfile[];
  const result = await supabase
    .from("gamification_profiles")
    .select("user_id,display_name,email,friend_code,avatar_url")
    .in("user_id", uniqueIds);
  if (result.error) throw result.error;
  return (result.data ?? []) as FriendProfile[];
}

export async function acceptSharedRequest(
  request: SharedTransactionRequest,
  recipientUserId: string,
  options: {
    accountId?: string | null;
    cardId?: string | null;
    responsibilityInstallmentIndexes?: number[] | null;
  } = {},
) {
  const amount = Number(request.amount) || 0;

  if (request.transaction_type === "card_expense" && !options.cardId) {
    throw new Error("Card selection is required.");
  }
  if (request.transaction_type !== "card_expense" && !options.accountId) {
    throw new Error("Account selection is required.");
  }

  const recipientResponsibilityInstallments =
    request.transaction_type === "card_expense" && request.is_installment
      ? options.responsibilityInstallmentIndexes ??
        getRemainingInstallmentIndexes(
          request.installment_total,
          request.responsibility_installment_indexes,
        )
      : null;

  if (
    request.transaction_type === "card_expense" &&
    request.is_installment &&
    (!recipientResponsibilityInstallments || recipientResponsibilityInstallments.length === 0)
  ) {
    throw new Error("No installments are available for the recipient.");
  }

  const txInsert = await supabase
    .from("transactions")
    .insert([
      {
        user_id: recipientUserId,
        type: request.transaction_type,
        account_id: request.transaction_type === "card_expense" ? null : options.accountId ?? null,
        card_id: request.transaction_type === "card_expense" ? options.cardId ?? null : null,
        amount,
        description: request.description,
        category: request.category,
        date: request.date,
        is_fixed: request.is_fixed,
        is_installment: request.transaction_type === "card_expense" ? request.is_installment : null,
        installment_total:
          request.transaction_type === "card_expense" && request.is_installment
            ? request.installment_total
            : null,
        responsibility_installment_indexes:
          request.transaction_type === "card_expense" && request.is_installment
            ? recipientResponsibilityInstallments
            : request.transaction_type === "card_expense"
              ? request.responsibility_installment_indexes
            : null,
        installments_paid:
          request.transaction_type === "card_expense" && request.is_installment
            ? 0
            : null,
        is_paid:
          request.transaction_type === "card_expense" && request.is_installment
            ? false
            : null,
      },
    ])
    .select("id")
    .single();
  if (txInsert.error) throw txInsert.error;

  if (request.transaction_type !== "card_expense" && options.accountId) {
    const accountResult = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", options.accountId)
      .eq("user_id", recipientUserId)
      .single();
    if (accountResult.error) throw accountResult.error;

    const currentBalance = Number(accountResult.data.balance) || 0;
    const nextBalance =
      request.transaction_type === "income"
        ? currentBalance + amount
        : currentBalance - amount;

    const updateAccountResult = await supabase
      .from("accounts")
      .update({ balance: nextBalance })
      .eq("id", options.accountId)
      .eq("user_id", recipientUserId);
    if (updateAccountResult.error) throw updateAccountResult.error;
  }

  const updateResult = await supabase
    .from("shared_transaction_requests")
    .update({
      status: "accepted",
      recipient_transaction_id: txInsert.data.id,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("recipient_user_id", recipientUserId);
  if (updateResult.error) throw updateResult.error;
}

export async function declineSharedRequest(
  requestId: string,
  recipientUserId: string,
  reason: string,
) {
  const updateResult = await supabase
    .from("shared_transaction_requests")
    .update({
      status: "declined",
      decline_reason: reason,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("recipient_user_id", recipientUserId);
  if (updateResult.error) throw updateResult.error;
}

export function getSocialErrorMessage(
  error: unknown,
  language: "pt" | "en" = "en",
) {
  const rawMessage = getErrorMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (hasMissingTableError(error, ["shared_transaction_requests"])) {
    return language === "pt"
      ? "A tabela de atribuições compartilhadas não existe no Supabase. Aplique o arquivo supabase/schema.sql mais recente."
      : "The shared transaction requests table is missing in Supabase. Apply the latest supabase/schema.sql file.";
  }

  if (
    hasMissingColumnError(error, [
      "is_fixed",
      "is_installment",
      "installment_total",
      "responsibility_installment_indexes",
      "email",
      "friend_code",
      "avatar_url",
      "decline_reason",
      "note",
    ])
  ) {
    return language === "pt"
      ? "Seu banco esta desatualizado para a area social. Aplique o arquivo supabase/schema.sql mais recente."
      : "Your database is outdated for the social features. Apply the latest supabase/schema.sql file.";
  }

  if (
    normalized.includes("shared_transaction_requests_transaction_type_check") ||
    normalized.includes("card_expense")
  ) {
    return language === "pt"
      ? "Seu banco ainda não aceita despesa de cartão nas atribuições. Aplique o arquivo supabase/schema.sql mais recente."
      : "Your database does not yet allow card expenses in shared attributions. Apply the latest supabase/schema.sql file.";
  }

  if (
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("violates row-level security policy")
  ) {
    return language === "pt"
      ? "Não foi possível compartilhar essa atribuição. Confirme que a amizade foi aceita pelos dois lados e que o Supabase está com o schema atualizado."
      : "This attribution could not be shared. Confirm the friendship is accepted and that Supabase is using the latest schema.";
  }

  return rawMessage;
}
