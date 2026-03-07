"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { getProfileBioLabel } from "@/lib/profileBios";
import {
  isGamificationSchemaMissingCached,
  isGamificationSchemaMissingError,
  markGamificationSchemaAvailable,
  markGamificationSchemaMissing,
} from "@/lib/gamificationSchema";

type GamificationProfile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  friend_code: string;
  avatar_url: string | null;
  coins: number | string | null;
  bio_code: string | null;
  missions_completed: number | string | null;
  serasa_negative: boolean | null;
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

type InvestmentRow = {
  id: string;
  user_id: string;
  type: "b3" | "crypto" | "fixed_income";
  symbol: string;
  name: string | null;
  quantity: number | string;
  average_price: number | string;
  created_at: string;
};

type WalletMonthlyRow = {
  user_id: string;
  month_ref: string;
  pnl_value: number | string;
  wallet_value: number | string;
};

type MissionRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  mission_type: "manual_savings" | "add_asset" | "no_expense_day";
  target_value: number | string;
  coin_reward: number | string;
  is_active: boolean;
};

type UserMissionRow = {
  id: string;
  user_id: string;
  mission_id: string;
  week_start: string;
  progress_value: number | string;
  completed_at: string | null;
  reward_claimed: boolean;
};

type MedalRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string;
  coin_reward: number | string;
};

type UserMedalRow = {
  id: string;
  user_id: string;
  medal_id: string;
  source: string | null;
  created_at: string;
};

type RankingMetric = "monthPnl" | "coins";
type RankingScope = "friends" | "all";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function asDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function asIso(value: Date) {
  return value.toISOString();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof error === "string") return error;
  return "";
}

function getMissingColumn(error: unknown) {
  const message = getErrorMessage(error);
  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /could not find (?:the )?["']?([a-zA-Z0-9_]+)["']? column/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  if (error && typeof error === "object") {
    const details = (error as { details?: unknown }).details;
    if (typeof details === "string") {
      for (const pattern of patterns) {
        const match = details.match(pattern);
        if (match?.[1]) return match[1];
      }
    }
  }

  return null;
}

function getInitials(name?: string | null) {
  if (!name) return "GF";
  const parts = name.trim().split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "GF";
}

const RANK_TIERS_PT = [
  "Magnata",
  "Estratégista",
  "Investidor",
  "Economista",
  "Planejador",
  "Aprendiz",
  "Iniciante",
] as const;

const RANK_TIERS_EN = [
  "Magnate",
  "Strategist",
  "Investor",
  "Economist",
  "Planner",
  "Apprentice",
  "Beginner",
] as const;

function getRankingLabel(position: number, language: "pt" | "en") {
  const tiers = language === "pt" ? RANK_TIERS_PT : RANK_TIERS_EN;
  return tiers[position] ?? `#${position + 1}`;
}

export function GamificationScreen() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [friendEmailInput, setFriendEmailInput] = useState("");
  const [manualProgressInput, setManualProgressInput] = useState<Record<string, string>>({});
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("monthPnl");
  const [rankingScope, setRankingScope] = useState<RankingScope>("friends");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);

  const [myProfile, setMyProfile] = useState<GamificationProfile | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<GamificationProfile[]>([]);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [friendAssets, setFriendAssets] = useState<Record<string, InvestmentRow[]>>({});
  const [walletMonthlyByUser, setWalletMonthlyByUser] = useState<Record<string, WalletMonthlyRow>>(
    {},
  );
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [userMissions, setUserMissions] = useState<UserMissionRow[]>([]);
  const [medals, setMedals] = useState<MedalRow[]>([]);
  const [userMedals, setUserMedals] = useState<UserMedalRow[]>([]);

  const currentMonthStart = useMemo(() => asDate(startOfMonth(new Date())), []);
  const currentMonthStartIso = useMemo(() => asIso(startOfMonth(new Date())), []);
  const currentMonthEndIso = useMemo(() => asIso(endOfMonth(new Date())), []);
  const weekStartDate = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEndDate = useMemo(() => endOfWeekSunday(new Date()), []);
  const weekStart = useMemo(() => asDate(weekStartDate), [weekStartDate]);
  const weekStartIso = useMemo(() => asIso(weekStartDate), [weekStartDate]);
  const weekEndIso = useMemo(() => asIso(weekEndDate), [weekEndDate]);

  const medalById = useMemo(() => {
    const next: Record<string, MedalRow> = {};
    medals.forEach((medal) => {
      next[medal.id] = medal;
    });
    return next;
  }, [medals]);

  const myMedals = useMemo(() => {
    if (!userId) return [];
    return userMedals.filter((entry) => entry.user_id === userId);
  }, [userId, userMedals]);

  const recentMyMedals = useMemo(() => {
    return [...myMedals]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 4);
  }, [myMedals]);

  const friendIds = useMemo(() => {
    if (!userId) return [];
    return unique(
      friendships
        .filter((row) => row.status === "accepted")
        .map((row) => (row.user_id === userId ? row.friend_user_id : row.user_id)),
    );
  }, [friendships, userId]);

  const participantProfiles = useMemo(() => {
    const next: GamificationProfile[] = [];
    if (myProfile) next.push(myProfile);
    next.push(...friendProfiles);
    return next;
  }, [friendProfiles, myProfile]);

  const rankingRows = useMemo(() => {
    const pool =
      rankingScope === "friends"
        ? participantProfiles.filter(
            (profile) => profile.user_id === userId || friendIds.includes(profile.user_id),
          )
        : participantProfiles;
    const decorated = pool.map((profile) => {
      const monthly = walletMonthlyByUser[profile.user_id];
      const monthPnl = monthly ? toNumber(monthly.pnl_value) : 0;
      const coins = toNumber(profile.coins);
      return {
        profile,
        monthPnl,
        coins,
        sortValue: rankingMetric === "monthPnl" ? monthPnl : coins,
      };
    });
    return decorated.sort((a, b) => b.sortValue - a.sortValue);
  }, [
    friendIds,
    participantProfiles,
    rankingMetric,
    rankingScope,
    userId,
    walletMonthlyByUser,
  ]);

  const missionViews = useMemo(() => {
    return missions.map((mission) => {
      const progress = userMissions.find((row) => row.mission_id === mission.id);
      const target = Math.max(0.0001, toNumber(mission.target_value));
      const value = progress ? toNumber(progress.progress_value) : 0;
      const ratio = Math.max(0, Math.min(1, value / target));
      const completed = Boolean(progress?.completed_at) || value >= target;
      const claimed = Boolean(progress?.reward_claimed);
      return {
        mission,
        progress,
        target,
        value,
        ratio,
        completed,
        claimed,
      };
    });
  }, [missions, userMissions]);

  const selectedFriendProfile = useMemo(() => {
    if (!selectedFriendId) return null;
    return friendProfiles.find((profile) => profile.user_id === selectedFriendId) ?? null;
  }, [friendProfiles, selectedFriendId]);

  const selectedFriendAssets = useMemo(() => {
    if (!selectedFriendId) return [];
    return friendAssets[selectedFriendId] ?? [];
  }, [friendAssets, selectedFriendId]);

  const selectedFriendMedals = useMemo(() => {
    if (!selectedFriendId) return [];
    return userMedals.filter((entry) => entry.user_id === selectedFriendId);
  }, [selectedFriendId, userMedals]);

  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      }).format(value),
    [language],
  );

  const formatSignedCurrency = useCallback(
    (value: number) => `${value >= 0 ? "+" : "-"} ${formatCurrency(Math.abs(value))}`,
    [formatCurrency],
  );
  const getBioTag = useCallback(
    (bioCode: string | null | undefined) => getProfileBioLabel(bioCode, language),
    [language],
  );

  const refreshData = useCallback(async () => {
    if (!user || !userId) {
      setLoading(false);
      return;
    }
    if (isGamificationSchemaMissingCached()) {
      setErrorMsg(t("gamification.schemaMissing"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    try {
      const usernameCandidate =
        typeof user.user_metadata?.username === "string"
          ? user.user_metadata.username
          : "";
      const emailAddress = typeof user.email === "string" ? user.email.trim() : "";
      const emailFallback = emailAddress ? emailAddress.split("@")[0] : "";
      const fallbackName = (usernameCandidate || emailFallback || "Player").trim();
      const normalizedEmail = emailAddress ? emailAddress.toLowerCase() : null;

      const myProfileExistingRes = await supabase
        .from("gamification_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (myProfileExistingRes.error) {
        if (isGamificationSchemaMissingError(myProfileExistingRes.error)) {
          markGamificationSchemaMissing();
          setErrorMsg(t("gamification.schemaMissing"));
          setLoading(false);
          return;
        }
        throw myProfileExistingRes.error;
      }

      let myProfileRow = (myProfileExistingRes.data as GamificationProfile | null) ?? null;
      if (!myProfileRow) {
        const insertRes = await supabase
          .from("gamification_profiles")
          .insert([
            {
              user_id: userId,
              display_name: fallbackName,
              updated_at: new Date().toISOString(),
            },
          ])
          .select("*")
          .single();
        if (insertRes.error) {
          if (isGamificationSchemaMissingError(insertRes.error)) {
            markGamificationSchemaMissing();
            setErrorMsg(t("gamification.schemaMissing"));
            setLoading(false);
            return;
          }
          throw insertRes.error;
        }
        myProfileRow = insertRes.data as GamificationProfile;
      } else {
        const updates: { display_name?: string; updated_at?: string } = {};
        if (!myProfileRow.display_name?.trim()) {
          updates.display_name = fallbackName;
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const updateRes = await supabase
            .from("gamification_profiles")
            .update(updates)
            .eq("user_id", userId)
            .select("*")
            .single();
          if (updateRes.error) {
            if (isGamificationSchemaMissingError(updateRes.error)) {
              markGamificationSchemaMissing();
              setErrorMsg(t("gamification.schemaMissing"));
              setLoading(false);
              return;
            }
            throw updateRes.error;
          }
          myProfileRow = updateRes.data as GamificationProfile;
        }
      }

      // Keep trying to sync the email when the column exists, without breaking
      // older DB schemas that may not have this column yet.
      if (normalizedEmail) {
        const emailRes = await supabase
          .from("gamification_profiles")
          .update({ email: normalizedEmail, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .select("*")
          .single();
        if (emailRes.error) {
          if (isGamificationSchemaMissingError(emailRes.error)) {
            markGamificationSchemaMissing();
            setErrorMsg(t("gamification.schemaMissing"));
            setLoading(false);
            return;
          }
          const missingColumn = getMissingColumn(emailRes.error);
          if (missingColumn !== "email") throw emailRes.error;
        } else {
          myProfileRow = emailRes.data as GamificationProfile;
        }
      }
      markGamificationSchemaAvailable();

      if (!myProfileRow) {
        throw new Error("Unable to load your league profile.");
      }

      const friendshipsRes = await supabase
        .from("gamification_friendships")
        .select("id,user_id,friend_user_id,status,created_at")
        .or(`user_id.eq.${userId},friend_user_id.eq.${userId}`)
        .eq("status", "accepted");
      if (friendshipsRes.error) throw friendshipsRes.error;

      const friendshipRows = (friendshipsRes.data ?? []) as FriendshipRow[];
      const resolvedFriendIds = unique(
        friendshipRows
          .filter((row) => row.status === "accepted")
          .map((row) => (row.user_id === userId ? row.friend_user_id : row.user_id)),
      );
      const participantIds = unique([userId, ...resolvedFriendIds]);

      const [friendProfilesRes, friendAssetsRes, medalsRes, missionsRes] =
        await Promise.all([
          resolvedFriendIds.length
            ? supabase
                .from("gamification_profiles")
                .select("*")
                .in("user_id", resolvedFriendIds)
            : Promise.resolve({ data: [], error: null } as any),
          resolvedFriendIds.length
            ? supabase
                .from("investments")
                .select("id,user_id,type,symbol,name,quantity,average_price,created_at")
                .in("user_id", resolvedFriendIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
          supabase.from("gamification_medals").select("*"),
          supabase.from("gamification_weekly_missions").select("*").eq("is_active", true),
        ]);

      if (friendProfilesRes.error) throw friendProfilesRes.error;
      if (friendAssetsRes.error) throw friendAssetsRes.error;
      if (medalsRes.error) throw medalsRes.error;
      if (missionsRes.error) throw missionsRes.error;

      const missionRows = (missionsRes.data ?? []) as MissionRow[];

      const monthTransactionsRes = await supabase
        .from("transactions")
        .select("type,amount,date")
        .eq("user_id", userId)
        .gte("date", currentMonthStart)
        .lte("date", currentMonthEndIso.slice(0, 10));
      if (monthTransactionsRes.error) throw monthTransactionsRes.error;

      const accountsRes = await supabase
        .from("accounts")
        .select("balance")
        .eq("user_id", userId);
      if (accountsRes.error) throw accountsRes.error;

      const monthPnl = (monthTransactionsRes.data ?? []).reduce((acc, row: any) => {
        const amount = toNumber(row.amount);
        if (row.type === "income") return acc + amount;
        if (row.type === "expense" || row.type === "card_expense") return acc - amount;
        return acc;
      }, 0);
      const walletValue = (accountsRes.data ?? []).reduce(
        (acc, row: any) => acc + toNumber(row.balance),
        0,
      );

      await supabase.from("gamification_wallet_monthly").upsert(
        [
          {
            user_id: userId,
            month_ref: currentMonthStart,
            pnl_value: monthPnl,
            wallet_value: walletValue,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_id,month_ref" },
      );

      const walletMonthlyRes = await supabase
        .from("gamification_wallet_monthly")
        .select("user_id,month_ref,pnl_value,wallet_value")
        .in("user_id", participantIds)
        .eq("month_ref", currentMonthStart);
      if (walletMonthlyRes.error) throw walletMonthlyRes.error;

      if (missionRows.length) {
        const seedRes = await supabase.from("gamification_user_missions").upsert(
          missionRows.map((mission) => ({
            user_id: userId,
            mission_id: mission.id,
            week_start: weekStart,
          })),
          { onConflict: "user_id,mission_id,week_start" },
        );
        if (seedRes.error) throw seedRes.error;
      }

      const [weekInvestmentsRes, weekExpensesRes, userMissionsRes] = await Promise.all([
        supabase
          .from("investments")
          .select("id")
          .eq("user_id", userId)
          .gte("created_at", weekStartIso)
          .lte("created_at", weekEndIso),
        supabase
          .from("transactions")
          .select("date")
          .eq("user_id", userId)
          .in("type", ["expense", "card_expense"])
          .gte("date", weekStart)
          .lte("date", weekEndIso.slice(0, 10)),
        supabase
          .from("gamification_user_missions")
          .select("id,user_id,mission_id,week_start,progress_value,completed_at,reward_claimed")
          .eq("user_id", userId)
          .eq("week_start", weekStart),
      ]);

      if (weekInvestmentsRes.error) throw weekInvestmentsRes.error;
      if (weekExpensesRes.error) throw weekExpensesRes.error;
      if (userMissionsRes.error) throw userMissionsRes.error;

      const weekInvestmentsCount = (weekInvestmentsRes.data ?? []).length;
      const expenseDays = new Set(
        (weekExpensesRes.data ?? []).map((row: any) => String(row.date)),
      );
      const elapsedDays = Math.min(
        7,
        Math.max(
          1,
          Math.floor((Date.now() - weekStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
        ),
      );
      const noExpenseDays = Math.max(0, elapsedDays - expenseDays.size);

      const missionById: Record<string, MissionRow> = {};
      missionRows.forEach((mission) => {
        missionById[mission.id] = mission;
      });
      for (const row of (userMissionsRes.data ?? []) as UserMissionRow[]) {
        const mission = missionById[row.mission_id];
        if (!mission || mission.mission_type === "manual_savings") continue;
        const computed = mission.mission_type === "add_asset" ? weekInvestmentsCount : noExpenseDays;
        const existing = toNumber(row.progress_value);
        const target = toNumber(mission.target_value);
        const nowIso = new Date().toISOString();

        let nextProgress = computed;
        let nextCompletedAt = computed >= target ? row.completed_at ?? nowIso : null;

        // "Add asset" mission should represent actions done in the week, not current holdings.
        // Keep progress/completion monotonic so deleting an asset does not reopen the mission.
        if (mission.mission_type === "add_asset") {
          nextProgress = Math.max(existing, computed);
          const completed = Boolean(row.completed_at) || nextProgress >= target;
          nextCompletedAt = completed ? row.completed_at ?? nowIso : null;
        }

        if (existing === nextProgress && row.completed_at === nextCompletedAt) continue;
        const updateRes = await supabase
          .from("gamification_user_missions")
          .update({
            progress_value: nextProgress,
            completed_at: nextCompletedAt,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("user_id", userId);
        if (updateRes.error) throw updateRes.error;
      }

      const [refreshedMissionsRes, userMedalsRes] = await Promise.all([
        supabase
          .from("gamification_user_missions")
          .select("id,user_id,mission_id,week_start,progress_value,completed_at,reward_claimed")
          .eq("user_id", userId)
          .eq("week_start", weekStart),
        supabase
          .from("gamification_user_medals")
          .select("id,user_id,medal_id,source,created_at")
          .in("user_id", participantIds),
      ]);
      if (refreshedMissionsRes.error) throw refreshedMissionsRes.error;
      if (userMedalsRes.error) throw userMedalsRes.error;

      const friendAssetsMap: Record<string, InvestmentRow[]> = {};
      ((friendAssetsRes.data ?? []) as InvestmentRow[]).forEach((asset) => {
        if (!friendAssetsMap[asset.user_id]) friendAssetsMap[asset.user_id] = [];
        friendAssetsMap[asset.user_id].push(asset);
      });

      const monthlyMap: Record<string, WalletMonthlyRow> = {};
      ((walletMonthlyRes.data ?? []) as WalletMonthlyRow[]).forEach((entry) => {
        monthlyMap[entry.user_id] = entry;
      });

      setMyProfile(myProfileRow);
      setFriendships(friendshipRows);
      setFriendProfiles((friendProfilesRes.data ?? []) as GamificationProfile[]);
      setFriendAssets(friendAssetsMap);
      setWalletMonthlyByUser(monthlyMap);
      setMissions(missionRows);
      setUserMissions((refreshedMissionsRes.data ?? []) as UserMissionRow[]);
      setMedals((medalsRes.data ?? []) as MedalRow[]);
      setUserMedals((userMedalsRes.data ?? []) as UserMedalRow[]);
    } catch (error) {
      if (isGamificationSchemaMissingError(error)) {
        markGamificationSchemaMissing();
        setErrorMsg(t("gamification.schemaMissing"));
        setLoading(false);
        return;
      }
      console.warn("[gamification] refreshData:", getErrorMessage(error));
      setErrorMsg(t("gamification.loadError"));
    } finally {
      setLoading(false);
    }
  }, [
    currentMonthEndIso,
    currentMonthStart,
    t,
    user,
    userId,
    weekEndIso,
    weekStart,
    weekStartDate,
    weekStartIso,
  ]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  async function handleAddFriend() {
    if (!userId) return;
    if (isGamificationSchemaMissingCached()) {
      setErrorMsg(t("gamification.schemaMissing"));
      return;
    }
    const friendEmail = friendEmailInput.trim().toLowerCase();
    if (!friendEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail)) {
      setErrorMsg(t("gamification.friendEmailInvalid"));
      return;
    }
    setAddingFriend(true);
    setErrorMsg(null);
    try {
      const targetRes = await supabase
        .from("gamification_profiles")
        .select("user_id,email")
        .ilike("email", friendEmail)
        .single();
      if (targetRes.error || !targetRes.data) {
        setErrorMsg(t("gamification.friendNotFound"));
        setAddingFriend(false);
        return;
      }
      const targetUserId = String(targetRes.data.user_id);
      const myEmail = String(user?.email ?? "").trim().toLowerCase();
      if (targetUserId === userId || (myEmail && friendEmail === myEmail)) {
        setErrorMsg(t("gamification.friendSelfError"));
        setAddingFriend(false);
        return;
      }
      const existsRes = await supabase
        .from("gamification_friendships")
        .select("id")
        .or(`and(user_id.eq.${userId},friend_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_user_id.eq.${userId})`)
        .limit(1);
      if (existsRes.error) throw existsRes.error;
      if ((existsRes.data ?? []).length === 0) {
        const insertRes = await supabase.from("gamification_friendships").insert([
          {
            user_id: userId,
            friend_user_id: targetUserId,
            status: "accepted",
          },
        ]);
        if (insertRes.error) throw insertRes.error;
      }
      setFriendEmailInput("");
      await refreshData();
    } catch (error) {
      if (isGamificationSchemaMissingError(error)) {
        markGamificationSchemaMissing();
        setErrorMsg(t("gamification.schemaMissing"));
        return;
      }
      console.warn("[gamification] handleAddFriend:", getErrorMessage(error));
      setErrorMsg(t("gamification.friendAddError"));
    } finally {
      setAddingFriend(false);
    }
  }

  async function handleAddManualProgress(missionId: string) {
    if (!userId) return;
    if (isGamificationSchemaMissingCached()) {
      setErrorMsg(t("gamification.schemaMissing"));
      return;
    }
    const raw = manualProgressInput[missionId] ?? "";
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const current = userMissions.find((row) => row.mission_id === missionId);
    const mission = missions.find((row) => row.id === missionId);
    if (!current || !mission) return;
    const nextValue = toNumber(current.progress_value) + parsed;
    const isCompleted = nextValue >= toNumber(mission.target_value);
    const { error } = await supabase
      .from("gamification_user_missions")
      .update({
        progress_value: nextValue,
        completed_at: isCompleted ? current.completed_at ?? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("user_id", userId);
    if (error) {
      if (isGamificationSchemaMissingError(error)) {
        markGamificationSchemaMissing();
        setErrorMsg(t("gamification.schemaMissing"));
        return;
      }
      console.warn("[gamification] handleAddManualProgress:", getErrorMessage(error));
      setErrorMsg(t("gamification.saveError"));
      return;
    }
    setManualProgressInput((prev) => ({ ...prev, [missionId]: "" }));
    await refreshData();
  }

  async function handleClaimMission(missionId: string) {
    if (!myProfile || !userId) return;
    if (isGamificationSchemaMissingCached()) {
      setErrorMsg(t("gamification.schemaMissing"));
      return;
    }
    const missionView = missionViews.find((item) => item.mission.id === missionId);
    if (!missionView || !missionView.progress || !missionView.completed || missionView.claimed) return;
    setClaimingMissionId(missionId);
    setErrorMsg(null);
    try {
      const claimRes = await supabase
        .from("gamification_user_missions")
        .update({
          reward_claimed: true,
          completed_at: missionView.progress.completed_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", missionView.progress.id)
        .eq("user_id", userId)
        .eq("reward_claimed", false)
        .select("id")
        .maybeSingle();
      if (claimRes.error) throw claimRes.error;
      if (!claimRes.data) {
        await refreshData();
        return;
      }

      const reward = toNumber(missionView.mission.coin_reward);
      const profileUpdate: Record<string, unknown> = {
        coins: toNumber(myProfile.coins) + reward,
        missions_completed: toNumber(myProfile.missions_completed) + 1,
        updated_at: new Date().toISOString(),
      };
      while (Object.keys(profileUpdate).length > 0) {
        const coinsUpdateRes = await supabase
          .from("gamification_profiles")
          .update(profileUpdate)
          .eq("user_id", userId);
        if (!coinsUpdateRes.error) break;
        const missingColumn = getMissingColumn(coinsUpdateRes.error);
        if (!missingColumn || !(missingColumn in profileUpdate)) {
          throw coinsUpdateRes.error;
        }
        delete profileUpdate[missingColumn];
      }

      const rookieMedal = medals.find((item) => item.code === "mission_rookie");
      if (rookieMedal) {
        await supabase.from("gamification_user_medals").upsert(
          [{ user_id: userId, medal_id: rookieMedal.id, source: "mission" }],
          { onConflict: "user_id,medal_id" },
        );
      }

      await refreshData();
    } catch (error) {
      if (isGamificationSchemaMissingError(error)) {
        markGamificationSchemaMissing();
        setErrorMsg(t("gamification.schemaMissing"));
        return;
      }
      console.warn("[gamification] handleClaimMission:", getErrorMessage(error));
      setErrorMsg(t("gamification.saveError"));
    } finally {
      setClaimingMissionId(null);
    }
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-6 text-sm text-[#9CA3AF]">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("gamification.title")}
          </p>
          <p className="text-xl font-semibold text-[#E5E8EF]">{t("gamification.title")}</p>
          <p className="text-sm text-[#9CA3AF]">{t("gamification.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2 lg:max-w-[52%]">
          <span className="rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2 text-xs font-semibold text-[#D6FBF4]">
            {toNumber(myProfile?.coins)} {t("gamification.coins")}
          </span>
          {recentMyMedals.length ? (
            recentMyMedals.map((entry) => (
              <span
                key={`header-reward-${entry.id}`}
                className="rounded-xl border border-[#33435F] bg-[#162033] px-3 py-2 text-xs font-semibold text-[#DCE7FF]"
              >
                {medalById[entry.medal_id]?.title ?? t("gamification.medal")}
              </span>
            ))
          ) : (
            <span className="rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2 text-xs text-[#8B94A6]">
              {t("gamification.noMedals")}
            </span>
          )}
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {errorMsg}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
        <p className="text-sm font-semibold text-[#E4E7EC]">{t("gamification.addFriendTitle")}</p>
        <p className="mt-1 text-xs text-[#8B94A6]">{t("gamification.addFriendHint")}</p>
        <div className="mt-3 flex gap-2">
          <input
            value={friendEmailInput}
            onChange={(event) => setFriendEmailInput(event.target.value)}
            placeholder={t("gamification.friendEmailPlaceholder")}
            className="flex-1 rounded-xl border border-[#1E232E] bg-[#0F121A] px-3 py-2 text-sm text-[#E4E7EC]"
          />
          <button
            type="button"
            onClick={handleAddFriend}
            disabled={addingFriend}
            className="rounded-xl border border-[#2A3344] bg-[#163137] px-3 py-2 text-xs font-semibold text-[#D6FBF4]"
          >
            {addingFriend ? t("common.saving") : t("gamification.addFriend")}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[#7F8694]">
            {t("gamification.friends")}
          </p>
          {friendProfiles.length ? (
            friendProfiles.map((friend) => (
              <div
                key={friend.user_id}
                className="rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#2A3344] bg-[#121B2C] text-[10px] font-semibold text-[#DCE7FF] ${
                        friend.serasa_negative ? "avatar-negative-border" : ""
                      }`}
                    >
                      {friend.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={friend.avatar_url}
                          alt={friend.display_name || t("gamification.player")}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(friend.display_name)
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#E4E7EC]">
                        {friend.display_name || t("gamification.player")}
                      </p>
                      <span className="rounded-full border border-[#2E3B54] bg-[#131C2A] px-2 py-0.5 text-[10px] text-[#BFD0EB]">
                        {getBioTag(friend.bio_code)}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/profile?user=${friend.user_id}`}
                    className="text-[11px] text-[#7FD7FF]"
                  >
                    {t("gamification.viewProfile")}
                  </Link>
                </div>
                <p className="text-[11px] text-[#8B94A6]">
                  {friend.email || "--"}
                </p>
                {friend.serasa_negative ? (
                  <p className="mt-1 text-[11px] text-red-300">
                    {t("gamification.serasaWarning")}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-xs text-[#8B94A6]">{t("gamification.noFriends")}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#E4E7EC]">{t("gamification.rankingTitle")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRankingMetric("monthPnl")}
              className={`rounded-full border px-3 py-1 text-xs ${
                rankingMetric === "monthPnl"
                  ? "border-[#57D8C8] bg-[#163137] text-[#D6FBF4]"
                  : "border-[#2A3344] text-[#8B94A6]"
              }`}
            >
              {t("gamification.rankingByPnl")}
            </button>
            <button
              type="button"
              onClick={() => setRankingMetric("coins")}
              className={`rounded-full border px-3 py-1 text-xs ${
                rankingMetric === "coins"
                  ? "border-[#57D8C8] bg-[#163137] text-[#D6FBF4]"
                  : "border-[#2A3344] text-[#8B94A6]"
              }`}
            >
              {t("gamification.rankingByCoins")}
            </button>
            <button
              type="button"
              onClick={() =>
                setRankingScope((current) => (current === "friends" ? "all" : "friends"))
              }
              className="rounded-full border border-[#2A3344] px-3 py-1 text-xs text-[#8B94A6]"
            >
              {rankingScope === "friends"
                ? t("gamification.scopeFriends")
                : t("gamification.scopeAll")}
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {rankingRows.length ? (
            rankingRows.map((row, index) => (
              <div
                key={row.profile.user_id}
                className="flex items-center justify-between rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-14 rounded-md border border-[#33435F] px-2 py-1 text-center text-[11px] text-[#C8D4EE]">
                    {getRankingLabel(index, language)}
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#2A3344] bg-[#121B2C] text-[10px] font-semibold text-[#DCE7FF] ${
                        row.profile.serasa_negative ? "avatar-negative-border" : ""
                      }`}
                    >
                      {row.profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.profile.avatar_url}
                          alt={row.profile.display_name || t("gamification.player")}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(row.profile.display_name)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#E4E7EC]">
                          {row.profile.display_name || t("gamification.player")}
                        </p>
                        <span className="rounded-full border border-[#2E3B54] bg-[#131C2A] px-2 py-0.5 text-[10px] text-[#BFD0EB]">
                          {getBioTag(row.profile.bio_code)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8B94A6]">
                        {t("gamification.coins")}: {toNumber(row.profile.coins)}
                      </p>
                    </div>
                  </div>
                </div>
                <p
                  className={`text-sm font-semibold ${
                    rankingMetric === "monthPnl" && row.monthPnl < 0
                      ? "text-red-300"
                      : "text-emerald-300"
                  }`}
                >
                  {rankingMetric === "monthPnl"
                    ? formatSignedCurrency(row.monthPnl)
                    : `${toNumber(row.profile.coins)} ${t("gamification.coins")}`}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#8B94A6]">{t("gamification.emptyRanking")}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
        <p className="text-sm font-semibold text-[#E4E7EC]">{t("gamification.friendAssetsTitle")}</p>
        <p className="mt-1 text-xs text-[#8B94A6]">{t("gamification.friendAssetsHint")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {friendProfiles.length ? (
            friendProfiles.map((friend) => {
              const assets = friendAssets[friend.user_id] ?? [];
              const monthly = walletMonthlyByUser[friend.user_id];
              const monthPnl = monthly ? toNumber(monthly.pnl_value) : 0;
              const medalsCount = userMedals.filter((entry) => entry.user_id === friend.user_id).length;
              return (
                <div
                  key={friend.user_id}
                  className="rounded-xl border border-[#2A3344] bg-[#0F121A] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#2A3344] bg-[#121B2C] text-[10px] font-semibold text-[#DCE7FF] ${
                          friend.serasa_negative ? "avatar-negative-border" : ""
                        }`}
                      >
                        {friend.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={friend.avatar_url}
                            alt={friend.display_name || t("gamification.player")}
                            className="h-full w-full object-cover"
                          />
                      ) : (
                        getInitials(friend.display_name)
                      )}
                    </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#E4E7EC]">
                          {friend.display_name || t("gamification.player")}
                        </p>
                        <span className="rounded-full border border-[#2E3B54] bg-[#131C2A] px-2 py-0.5 text-[10px] text-[#BFD0EB]">
                          {getBioTag(friend.bio_code)}
                        </span>
                      </div>
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        monthPnl >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {formatSignedCurrency(monthPnl)}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-[#8B94A6]">
                    {t("gamification.medalsCount")}: {medalsCount}
                  </p>
                  {friend.serasa_negative ? (
                    <p className="mt-2 text-[11px] text-red-300">{t("gamification.serasaWarning")}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {assets.length ? (
                      assets.slice(0, 8).map((asset) => (
                        <span
                          key={`${friend.user_id}-${asset.id}`}
                          className="rounded-full border border-[#324261] px-2 py-0.5 text-[11px] text-[#CFE1FF]"
                        >
                          {(asset.name || asset.symbol).toUpperCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#8B94A6]">
                        {t("gamification.noAssetsShared")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[#8B94A6]">{t("gamification.noFriends")}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
        <p className="text-sm font-semibold text-[#E4E7EC]">{t("gamification.weeklyMissionsTitle")}</p>
        <p className="mt-1 text-xs text-[#8B94A6]">
          {t("gamification.weeklyMissionsHint")} {weekStart}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {missionViews.length ? (
            missionViews.map((view) => (
              <div
                key={view.mission.id}
                className="rounded-xl border border-[#2A3344] bg-[#0F121A] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#E4E7EC]">{view.mission.title}</p>
                  <span className="rounded-full border border-[#384964] px-2 py-0.5 text-[11px] text-[#CFE1FF]">
                    +{toNumber(view.mission.coin_reward)} {t("gamification.coins")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8B94A6]">
                  {view.mission.description || t("gamification.missionDefaultDescription")}
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#1A2435]">
                  <div
                    className={`h-full ${view.completed ? "bg-emerald-400" : "bg-[#5DD6C7]"}`}
                    style={{ width: `${Math.max(6, Math.round(view.ratio * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#8B94A6]">
                  {t("gamification.progress")}: {view.value.toFixed(2)} / {view.target.toFixed(2)}
                </p>

                {view.mission.mission_type === "manual_savings" && !view.completed ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={manualProgressInput[view.mission.id] ?? ""}
                      onChange={(event) =>
                        setManualProgressInput((state) => ({
                          ...state,
                          [view.mission.id]: event.target.value,
                        }))
                      }
                      placeholder={t("gamification.manualProgressPlaceholder")}
                      className="flex-1 rounded-xl border border-[#1E232E] bg-[#0A0E16] px-3 py-2 text-sm text-[#E4E7EC]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddManualProgress(view.mission.id)}
                      className="rounded-xl border border-[#2A3344] bg-[#163137] px-3 py-2 text-xs font-semibold text-[#D6FBF4]"
                    >
                      {t("gamification.addProgress")}
                    </button>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  {view.completed && !view.claimed ? (
                    <button
                      type="button"
                      onClick={() => handleClaimMission(view.mission.id)}
                      disabled={claimingMissionId === view.mission.id}
                      className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"
                    >
                      {claimingMissionId === view.mission.id
                        ? t("common.saving")
                        : t("gamification.claimReward")}
                    </button>
                  ) : null}
                  {view.claimed ? (
                    <span className="text-xs text-emerald-300">{t("gamification.rewardClaimed")}</span>
                  ) : null}
                  {!view.completed && !view.claimed ? (
                    <span className="text-xs text-[#8B94A6]">{t("gamification.inProgress")}</span>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#8B94A6]">{t("gamification.noMissions")}</p>
          )}
        </div>
      </section>

      {selectedFriendProfile ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6"
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-[#1E232E] bg-[#0F121A] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#2A3344] bg-[#121B2C] text-xs font-semibold text-[#DCE7FF] ${
                    selectedFriendProfile.serasa_negative ? "avatar-negative-border" : ""
                  }`}
                >
                  {selectedFriendProfile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedFriendProfile.avatar_url}
                      alt={selectedFriendProfile.display_name || t("gamification.player")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(selectedFriendProfile.display_name)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#E5E8EF]">
                      {selectedFriendProfile.display_name || t("gamification.player")}
                    </p>
                    <span className="rounded-full border border-[#2E3B54] bg-[#131C2A] px-2 py-0.5 text-[10px] text-[#BFD0EB]">
                      {getBioTag(selectedFriendProfile.bio_code)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-[#8B94A6]">
                    {selectedFriendProfile.email || "--"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFriendId(null)}
                className="text-xs text-[#8B94A6]"
              >
                {t("common.cancel")}
              </button>
            </div>
            {selectedFriendProfile.serasa_negative ? (
              <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {t("gamification.serasaWarning")}
              </div>
            ) : null}
            <p className="mt-3 text-xs text-[#8B94A6]">
              {t("gamification.coins")}: {toNumber(selectedFriendProfile.coins)}
            </p>
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-[#8B94A6]">{t("gamification.myMedals")}</p>
              <div className="flex flex-wrap gap-2">
                {selectedFriendMedals.length ? (
                  selectedFriendMedals.map((entry) => (
                    <span
                      key={entry.id}
                      className="rounded-full border border-[#3A4B66] bg-[#182033] px-2 py-1 text-[11px] text-[#DCE7FF]"
                    >
                      {medalById[entry.medal_id]?.title ?? t("gamification.medal")}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#8B94A6]">{t("gamification.noMedals")}</span>
                )}
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-[#8B94A6]">{t("gamification.friendAssetsTitle")}</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedFriendAssets.length ? (
                  selectedFriendAssets.map((asset) => (
                    <span
                      key={asset.id}
                      className="rounded-full border border-[#324261] px-2 py-0.5 text-[11px] text-[#CFE1FF]"
                    >
                      {(asset.name || asset.symbol).toUpperCase()}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#8B94A6]">{t("gamification.noAssetsShared")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

