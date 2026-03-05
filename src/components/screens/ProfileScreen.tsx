"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { loadProfileSettings, saveProfileSettings } from "@/lib/profile";
import {
  isGamificationSchemaMissingCached,
  isGamificationSchemaMissingError,
  markGamificationSchemaAvailable,
  markGamificationSchemaMissing,
} from "@/lib/gamificationSchema";

type LeagueProfileRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  coins: number | string | null;
  serasa_negative: boolean | null;
  friend_code: string | null;
  created_at: string | null;
  updated_at: string | null;
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

type FriendshipRow = {
  user_id: string;
  friend_user_id: string;
  status: "pending" | "accepted" | "blocked";
};

type FriendListRow = {
  friend_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  is_mutual: boolean | null;
};

type MedalRarity = "common" | "rare" | "epic" | "legendary";

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
  const match = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);
  return match?.[1] ?? null;
}

function readTextField(source: unknown, key: string) {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readBooleanField(source: unknown, key: string) {
  if (!source || typeof source !== "object") return false;
  const value = (source as Record<string, unknown>)[key];
  return Boolean(value);
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getInitials(name: string | null | undefined) {
  const value = (name ?? "").trim();
  if (!value) return "GF";
  const parts = value.split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "GF";
}

function buildLevelData(coins: number) {
  const safeCoins = Math.max(0, Math.floor(coins));
  const level = Math.floor(Math.sqrt(safeCoins / 50)) + 1;
  const currentBase = Math.pow(level - 1, 2) * 50;
  const nextBase = Math.pow(level, 2) * 50;
  const progress = Math.max(0, safeCoins - currentBase);
  const required = Math.max(1, nextBase - currentBase);
  const percent = Math.max(0, Math.min(100, Math.round((progress / required) * 100)));
  return {
    level,
    progress,
    required,
    remaining: Math.max(0, nextBase - safeCoins),
    percent,
  };
}

function getMedalRarity(coinReward: number): MedalRarity {
  if (coinReward >= 30) return "legendary";
  if (coinReward >= 20) return "epic";
  if (coinReward >= 12) return "rare";
  return "common";
}

function getRarityOrder(rarity: MedalRarity) {
  switch (rarity) {
    case "legendary":
      return 3;
    case "epic":
      return 2;
    case "rare":
      return 1;
    default:
      return 0;
  }
}

function getRarityClasses(rarity: MedalRarity, earned: boolean) {
  if (!earned) {
    return "border-dashed border-[#3A4255] bg-[#0F121A] text-[#5F6A80]";
  }
  switch (rarity) {
    case "legendary":
      return "border-[#EAB765] bg-[#2A1D0F] text-[#FFDCA2]";
    case "epic":
      return "border-[#8C78FF] bg-[#1E1838] text-[#D0C8FF]";
    case "rare":
      return "border-[#3EA9FF] bg-[#10263A] text-[#BDE3FF]";
    default:
      return "border-[#5B687F] bg-[#161C28] text-[#CAD6EA]";
  }
}

function getRarityDotClass(rarity: MedalRarity) {
  switch (rarity) {
    case "legendary":
      return "bg-[#EAB765]";
    case "epic":
      return "bg-[#8C78FF]";
    case "rare":
      return "bg-[#3EA9FF]";
    default:
      return "bg-[#7E8799]";
  }
}

function getRarityLabel(t: (key: string) => string, rarity: MedalRarity) {
  switch (rarity) {
    case "legendary":
      return t("profile.rarityLegendary");
    case "epic":
      return t("profile.rarityEpic");
    case "rare":
      return t("profile.rarityRare");
    default:
      return t("profile.rarityCommon");
  }
}

function renderMedalIcon(rarity: MedalRarity) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (rarity) {
    case "legendary":
      return (
        <svg {...common}>
          <path d="M6 7h12l-2 5H8z" />
          <path d="M9 12v3a3 3 0 006 0v-3" />
          <path d="M10 19h4" />
        </svg>
      );
    case "epic":
      return (
        <svg {...common}>
          <path d="M12 4l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      );
    case "rare":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9.5 12.5l1.7 1.7 3.3-3.7" />
        </svg>
      );
  }
}

function formatShortDate(value: string, language: "pt" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isFunctionMissingError(error: unknown, functionName: string) {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes(functionName.toLowerCase())) return true;
  if (message.includes("function") && message.includes("does not exist")) return true;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "42883") return true;
  }
  return false;
}

export function ProfileScreen() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [leagueDisplayName, setLeagueDisplayName] = useState("");
  const [leagueSerasaNegative, setLeagueSerasaNegative] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "friends">("overview");
  const [profileRow, setProfileRow] = useState<LeagueProfileRow | null>(null);
  const [medals, setMedals] = useState<MedalRow[]>([]);
  const [userMedals, setUserMedals] = useState<UserMedalRow[]>([]);
  const [friendList, setFriendList] = useState<FriendListRow[]>([]);
  const [friendsLimited, setFriendsLimited] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const targetUserFromQuery = (searchParams.get("user") ?? "").trim();
  const targetUserId = targetUserFromQuery || user?.id || null;
  const isOwnProfile = Boolean(user?.id && targetUserId && user.id === targetUserId);

  const ownFallbackName = useMemo(() => {
    const username =
      typeof user?.user_metadata?.username === "string"
        ? user.user_metadata.username.trim()
        : "";
    const emailFallback =
      typeof user?.email === "string" ? user.email.split("@")[0].trim() : "";
    return (username || emailFallback || "").trim();
  }, [user]);

  useEffect(() => {
    const localProfile = loadProfileSettings();
    if (localProfile.name) setProfileName(localProfile.name);
    if (localProfile.avatarUrl) setProfileAvatar(localProfile.avatarUrl);
  }, []);

  useEffect(() => {
    const username =
      typeof user?.user_metadata?.username === "string"
        ? user.user_metadata.username.trim()
        : "";
    const emailFallback =
      typeof user?.email === "string" ? user.email.split("@")[0] : "";
    const fallback = (username || emailFallback || "").trim();
    if (!fallback) return;
    setProfileName((current) => current || fallback);
    setLeagueDisplayName((current) => current || fallback);
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeagueProfile() {
      if (!user || !targetUserId) {
        setLoadingData(false);
        return;
      }
      if (isGamificationSchemaMissingCached()) {
        setSchemaMissing(true);
        setLoadingData(false);
        return;
      }

      setLoadingData(true);
      setFriendsLimited(false);
      setErrorMsg(null);

      const profileRes = await supabase
        .from("gamification_profiles")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (cancelled) return;

      if (profileRes.error) {
        if (isGamificationSchemaMissingError(profileRes.error)) {
          markGamificationSchemaMissing();
          setSchemaMissing(true);
          setLoadingData(false);
          return;
        }
        console.warn("[profile] loadLeagueProfile:", getErrorMessage(profileRes.error));
        setErrorMsg(t("profile.loadError"));
        setLoadingData(false);
        return;
      }

      markGamificationSchemaAvailable();
      setSchemaMissing(false);

      const row = (profileRes.data as LeagueProfileRow | null) ?? null;
      setProfileRow(row);
      if (row && isOwnProfile) {
        const displayName = readTextField(row, "display_name")?.trim() ?? "";
        if (displayName) {
          setLeagueDisplayName(displayName);
          setProfileName((current) => current || displayName);
        }
        const avatarUrl = readTextField(row, "avatar_url")?.trim() ?? "";
        if (avatarUrl) {
          setProfileAvatar((current) => current || avatarUrl || null);
        }
        setLeagueSerasaNegative(readBooleanField(row, "serasa_negative"));
      }

      const [medalsRes, userMedalsRes] = await Promise.all([
        supabase.from("gamification_medals").select("id,code,title,description,icon,coin_reward"),
        supabase
          .from("gamification_user_medals")
          .select("id,user_id,medal_id,source,created_at")
          .eq("user_id", targetUserId),
      ]);
      if (cancelled) return;

      if (medalsRes.error) {
        console.warn("[profile] loadMedals:", getErrorMessage(medalsRes.error));
      } else {
        setMedals((medalsRes.data ?? []) as MedalRow[]);
      }

      if (userMedalsRes.error) {
        console.warn("[profile] loadUserMedals:", getErrorMessage(userMedalsRes.error));
      } else {
        setUserMedals((userMedalsRes.data ?? []) as UserMedalRow[]);
      }

      const rpcRes = await supabase.rpc("profile_friends_view", {
        target_user_id: targetUserId,
      });
      if (cancelled) return;

      if (!rpcRes.error) {
        setFriendList((rpcRes.data ?? []) as FriendListRow[]);
      } else {
        const rpcMissing = isFunctionMissingError(rpcRes.error, "profile_friends_view");
        if (rpcMissing) {
          setFriendsLimited(true);
        } else {
          console.warn("[profile] loadFriendsRpc:", getErrorMessage(rpcRes.error));
        }

        const directRes = await supabase
          .from("gamification_friendships")
          .select("user_id,friend_user_id,status")
          .or(`user_id.eq.${targetUserId},friend_user_id.eq.${targetUserId}`)
          .eq("status", "accepted");

        if (cancelled) return;
        if (directRes.error) {
          console.warn("[profile] loadFriendsFallback:", getErrorMessage(directRes.error));
          setFriendList([]);
        } else {
          const rows = (directRes.data ?? []) as FriendshipRow[];
          const friendIds = Array.from(
            new Set(
              rows.map((entry) =>
                entry.user_id === targetUserId ? entry.friend_user_id : entry.user_id,
              ),
            ),
          );

          let viewerFriendIds = new Set<string>();
          if (user.id) {
            const viewerRes = await supabase
              .from("gamification_friendships")
              .select("user_id,friend_user_id,status")
              .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`)
              .eq("status", "accepted");

            if (!viewerRes.error) {
              viewerFriendIds = new Set(
                ((viewerRes.data ?? []) as FriendshipRow[]).map((entry) =>
                  entry.user_id === user.id ? entry.friend_user_id : entry.user_id,
                ),
              );
            }
          }

          if (!friendIds.length) {
            setFriendList([]);
          } else {
            const friendProfilesRes = await supabase
              .from("gamification_profiles")
              .select("user_id,display_name,email,avatar_url")
              .in("user_id", friendIds);

            if (friendProfilesRes.error) {
              console.warn(
                "[profile] loadFriendProfilesFallback:",
                getErrorMessage(friendProfilesRes.error),
              );
              setFriendList(
                friendIds.map((friendId) => ({
                  friend_user_id: friendId,
                  display_name: null,
                  avatar_url: null,
                  email: null,
                  is_mutual: user.id !== targetUserId && viewerFriendIds.has(friendId),
                })),
              );
            } else {
              const profileById = new Map(
                ((friendProfilesRes.data ?? []) as Array<{
                  user_id: string;
                  display_name: string | null;
                  email: string | null;
                  avatar_url: string | null;
                }>).map((entry) => [entry.user_id, entry]),
              );

              setFriendList(
                friendIds
                  .map((friendId) => {
                    const profile = profileById.get(friendId);
                    return {
                      friend_user_id: friendId,
                      display_name: profile?.display_name ?? null,
                      avatar_url: profile?.avatar_url ?? null,
                      email: profile?.email ?? null,
                      is_mutual: user.id !== targetUserId && viewerFriendIds.has(friendId),
                    };
                  })
                  .sort((a, b) =>
                    (a.display_name || a.email || "")
                      .toLowerCase()
                      .localeCompare((b.display_name || b.email || "").toLowerCase()),
                  ),
              );
            }
          }
        }
      }

      setLoadingData(false);
    }

    void loadLeagueProfile();
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, t, targetUserId, user]);

  function handleProfileFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    if (!file.type.startsWith("image/")) {
      setErrorMsg(
        language === "pt" ? "Envie uma imagem valida." : "Upload a valid image.",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!user || !isOwnProfile) return;
    setErrorMsg(null);
    setSaved(false);

    const nextUsername = profileName.trim();
    if (!nextUsername) {
      setErrorMsg(
        language === "pt" ? "Informe um nome de usuario." : "Enter a username.",
      );
      return;
    }
    const nextLeagueName = (leagueDisplayName.trim() || nextUsername).trim();
    const emailAddress = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    setSaving(true);
    try {
      const metadataRes = await supabase.auth.updateUser({ data: { username: nextUsername } });
      if (metadataRes.error) throw metadataRes.error;

      saveProfileSettings({
        name: nextUsername,
        avatarUrl: profileAvatar || undefined,
      });
      window.dispatchEvent(new Event("profile-updated"));

      let skipLeagueSync = isGamificationSchemaMissingCached();
      setSchemaMissing(skipLeagueSync);

      if (!skipLeagueSync) {
        const existingRes = await supabase
          .from("gamification_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existingRes.error) {
          if (isGamificationSchemaMissingError(existingRes.error)) {
            markGamificationSchemaMissing();
            setSchemaMissing(true);
            skipLeagueSync = true;
          } else {
            throw existingRes.error;
          }
        }

        if (!skipLeagueSync) {
          const payload: {
            user_id: string;
            display_name: string;
            serasa_negative: boolean;
            updated_at: string;
          } = {
            user_id: user.id,
            display_name: nextLeagueName,
            serasa_negative: leagueSerasaNegative,
            updated_at: new Date().toISOString(),
          };

          const profileRes = await supabase
            .from("gamification_profiles")
            .upsert([payload], { onConflict: "user_id" });

          if (profileRes.error) {
            if (isGamificationSchemaMissingError(profileRes.error)) {
              markGamificationSchemaMissing();
              setSchemaMissing(true);
              skipLeagueSync = true;
            } else {
              throw profileRes.error;
            }
          } else {
            markGamificationSchemaAvailable();
            setSchemaMissing(false);
          }
        }

        if (!skipLeagueSync) {
          const optionalUpdate: Record<string, unknown> = {
            avatar_url: profileAvatar || null,
            email: emailAddress || null,
          };
          while (Object.keys(optionalUpdate).length > 0) {
            const optionalRes = await supabase
              .from("gamification_profiles")
              .update(optionalUpdate)
              .eq("user_id", user.id);
            if (!optionalRes.error) break;
            if (isGamificationSchemaMissingError(optionalRes.error)) {
              markGamificationSchemaMissing();
              setSchemaMissing(true);
              break;
            }
            const missingColumn = getMissingColumn(optionalRes.error);
            if (!missingColumn || !(missingColumn in optionalUpdate)) {
              throw optionalRes.error;
            }
            delete optionalUpdate[missingColumn];
          }
        }
      }

      window.dispatchEvent(new Event("data-refresh"));
      setLeagueDisplayName(nextLeagueName);
      setProfileRow((current) => ({
        user_id: user.id,
        display_name: nextLeagueName,
        email: emailAddress || current?.email || null,
        avatar_url: profileAvatar || current?.avatar_url || null,
        coins: current?.coins ?? 0,
        serasa_negative: leagueSerasaNegative,
        friend_code: current?.friend_code ?? null,
        created_at: current?.created_at ?? null,
        updated_at: new Date().toISOString(),
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.warn("[profile] handleSave:", getErrorMessage(error));
      setErrorMsg(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const medalById = useMemo(() => {
    const map: Record<string, MedalRow> = {};
    medals.forEach((medal) => {
      map[medal.id] = medal;
    });
    return map;
  }, [medals]);

  const earnedMedals = useMemo(
    () =>
      userMedals
        .map((entry) => ({
          entry,
          medal: medalById[entry.medal_id] ?? null,
        }))
        .sort(
          (a, b) =>
            new Date(b.entry.created_at).getTime() - new Date(a.entry.created_at).getTime(),
        ),
    [medalById, userMedals],
  );

  const earnedMedalIds = useMemo(
    () => new Set(userMedals.map((entry) => entry.medal_id)),
    [userMedals],
  );

  const medalCollection = useMemo(() => {
    const fallbackCatalog = earnedMedals
      .map(({ medal }) => medal)
      .filter((medal): medal is MedalRow => Boolean(medal));
    const catalog = medals.length ? medals : fallbackCatalog;
    return catalog
      .map((medal) => {
        const rarity = getMedalRarity(toNumber(medal.coin_reward));
        return {
          medal,
          rarity,
          earned: earnedMedalIds.has(medal.id),
        };
      })
      .sort((a, b) => {
        if (a.earned !== b.earned) return a.earned ? -1 : 1;
        const rarityDiff = getRarityOrder(b.rarity) - getRarityOrder(a.rarity);
        if (rarityDiff !== 0) return rarityDiff;
        return a.medal.title.localeCompare(b.medal.title);
      });
  }, [earnedMedals, earnedMedalIds, medals]);

  const medalStats = useMemo(() => {
    const stats = {
      total: medalCollection.length,
      earned: 0,
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };

    medalCollection.forEach((entry) => {
      if (entry.earned) {
        stats.earned += 1;
      }
      stats[entry.rarity] += 1;
    });

    return stats;
  }, [medalCollection]);

  const profileDisplayName = (readTextField(profileRow, "display_name") ?? "").trim();
  const profileEmail = (readTextField(profileRow, "email") ?? "").trim();
  const headerName =
    profileDisplayName ||
    (isOwnProfile ? profileName.trim() || ownFallbackName : "") ||
    (profileEmail ? profileEmail.split("@")[0] : "") ||
    t("gamification.player");

  const headerAvatar =
    (readTextField(profileRow, "avatar_url") ?? "").trim() ||
    (isOwnProfile ? profileAvatar ?? "" : "");

  const headerCoins = toNumber(profileRow?.coins ?? 0);
  const levelData = buildLevelData(headerCoins);
  const mutualCount = friendList.filter((entry) => Boolean(entry.is_mutual)).length;

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border border-[#1E232E] bg-[radial-gradient(120%_90%_at_0%_0%,#1F2D4F_0%,#111827_55%,#0B1018_100%)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#5DD6C7]/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-16 h-40 w-40 rounded-full bg-[#6C8CFF]/10 blur-2xl" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#33435F] bg-[#0F141E] text-xl font-semibold text-[#EAF3FF]">
              {headerAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headerAvatar}
                  alt={headerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(headerName)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#8FA2C9]">
                {isOwnProfile ? t("profile.yourProfile") : t("profile.playerProfile")}
              </p>
              <h1 className="truncate text-2xl font-semibold text-[#EEF4FF]">{headerName}</h1>
              <p className="truncate text-sm text-[#9BB0D8]">
                {profileEmail || (isOwnProfile ? user?.email || "--" : "--")}
              </p>
            </div>
          </div>

          <div className="min-w-[180px] rounded-2xl border border-[#33435F] bg-[#0D1422]/90 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8FA2C9]">
              {t("profile.level")}
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#EAF3FF]">Lv {levelData.level}</p>
            <p className="mt-1 text-xs text-[#9BB0D8]">
              {headerCoins} {t("gamification.coins")}
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              activeTab === "overview"
                ? "border-[#6FA8FF] bg-[#1C2B48] text-[#EAF3FF]"
                : "border-[#33435F] bg-[#101827]/70 text-[#9BB0D8]"
            }`}
          >
            {t("profile.tabOverview")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("friends")}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              activeTab === "friends"
                ? "border-[#6FA8FF] bg-[#1C2B48] text-[#EAF3FF]"
                : "border-[#33435F] bg-[#101827]/70 text-[#9BB0D8]"
            }`}
          >
            {t("profile.tabFriends")}
          </button>
        </div>
      </section>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {t("profile.leagueUnavailable")}
        </div>
      ) : null}

      {loadingData ? (
        <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <p className="text-sm text-[#9CA3AF]">{t("common.loading")}</p>
        </section>
      ) : null}

      {!loadingData && activeTab === "overview" ? (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.levelProgressTitle")}</p>
                <p className="text-xs text-[#8A93A3]">Lv {levelData.level}</p>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#1E2636]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#6FA8FF] to-[#5DD6C7]"
                  style={{ width: `${levelData.percent}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#8A93A3]">
                <span>
                  {levelData.progress}/{levelData.required}
                </span>
                <span>
                  {levelData.remaining} {t("profile.toNextLevel")}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1E232E] bg-[#121621] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.medalsCardTitle")}</p>
                <span className="text-[11px] text-[#8A93A3]">
                  {medalStats.earned}/{medalStats.total}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {medalCollection.length ? (
                  medalCollection.map((entry) => (
                    <div
                      key={entry.medal.id}
                      title={`${entry.medal.title} • ${getRarityLabel(t, entry.rarity)}`}
                      className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${getRarityClasses(
                        entry.rarity,
                        entry.earned,
                      )}`}
                    >
                      {renderMedalIcon(entry.rarity)}
                      <span
                        className={`absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border border-[#0B0F18] ${getRarityDotClass(
                          entry.rarity,
                        )}`}
                      />
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-[#8A93A3]">{t("gamification.noMedals")}</span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-[#2A3344] bg-[#0F121A] px-2.5 py-2 text-[#8A93A3]">
                  <span className="text-[#D0D7E5]">{t("profile.rarityLegendary")}</span>: {medalStats.legendary}
                </div>
                <div className="rounded-lg border border-[#2A3344] bg-[#0F121A] px-2.5 py-2 text-[#8A93A3]">
                  <span className="text-[#D0D7E5]">{t("profile.rarityEpic")}</span>: {medalStats.epic}
                </div>
                <div className="rounded-lg border border-[#2A3344] bg-[#0F121A] px-2.5 py-2 text-[#8A93A3]">
                  <span className="text-[#D0D7E5]">{t("profile.rarityRare")}</span>: {medalStats.rare}
                </div>
                <div className="rounded-lg border border-[#2A3344] bg-[#0F121A] px-2.5 py-2 text-[#8A93A3]">
                  <span className="text-[#D0D7E5]">{t("profile.rarityCommon")}</span>: {medalStats.common}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.medalsListTitle")}</p>
              <span className="text-xs text-[#8A93A3]">{medalStats.earned}</span>
            </div>
            <div className="mt-4">
              {earnedMedals.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {earnedMedals.map(({ entry, medal }) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${getRarityClasses(
                              getMedalRarity(toNumber(medal?.coin_reward ?? 0)),
                              true,
                            )}`}
                          >
                            {renderMedalIcon(getMedalRarity(toNumber(medal?.coin_reward ?? 0)))}
                          </div>
                          <p className="truncate text-sm font-semibold text-[#E6EDF3]">
                            {medal?.title || t("gamification.medal")}
                          </p>
                        </div>
                        <span className="rounded-full border border-[#2E3A52] bg-[#111827] px-2 py-0.5 text-[10px] text-[#B8C5DF]">
                          {getRarityLabel(t, getMedalRarity(toNumber(medal?.coin_reward ?? 0)))}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#8A93A3]">
                        {medal?.description || t("gamification.missionDefaultDescription")}
                      </p>
                      <p className="mt-2 text-[11px] text-[#7F8694]">
                        {formatShortDate(entry.created_at, language)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8A93A3]">{t("gamification.noMedals")}</p>
              )}
            </div>
          </section>

          {isOwnProfile ? (
            <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.sectionBasic")}</p>
                  <p className="mt-1 text-xs text-[#8A93A3]">{t("profile.subtitle")}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[#263043] bg-[#0F141E] text-xs font-semibold text-[#E2E6ED]">
                    {profileAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profileAvatar}
                        alt="Profile avatar preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(profileName || headerName)
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfileFileChange}
                  />
                  <span className="rounded-full border border-[#2A3140] bg-[#151A27] px-4 py-2 text-xs text-[#E6EDF3]">
                    {t("more.profileChoose")}
                  </span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-[#8A93A3]">
                    {t("more.profileName")}
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder={t("more.profileNamePlaceholder")}
                    className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
                  />
                  <p className="text-xs text-[#8A93A3]">
                    {t("gamification.accountEmail")}: {user?.email || "--"}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-[#8A93A3]">
                    {t("more.leagueDisplayName")}
                  </label>
                  <input
                    type="text"
                    value={leagueDisplayName}
                    onChange={(event) => setLeagueDisplayName(event.target.value)}
                    placeholder={t("more.leagueDisplayNamePlaceholder")}
                    className="rounded-xl border border-[#2A3140] bg-[#151A27] px-4 py-2 text-sm text-[#E6EDF3]"
                  />
                  <button
                    type="button"
                    onClick={() => setLeagueSerasaNegative((current) => !current)}
                    className={`w-fit rounded-xl border px-3 py-2 text-xs font-semibold ${
                      leagueSerasaNegative
                        ? "border-red-500/50 bg-red-500/10 text-red-200"
                        : "border-[#2A3344] bg-[#151A27] text-[#D6FBF4]"
                    }`}
                  >
                    {leagueSerasaNegative
                      ? t("gamification.serasaNegative")
                      : t("gamification.serasaClean")}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
                {saved ? <p className="text-xs text-[#5DD6C7]">{t("profile.saved")}</p> : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
              <p className="text-sm text-[#9CA3AF]">{t("profile.readOnlyHint")}</p>
            </section>
          )}
        </>
      ) : null}

      {!loadingData && activeTab === "friends" ? (
        <section className="rounded-2xl border border-[#1E232E] bg-[#121621] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#E4E7EC]">{t("profile.friendsListTitle")}</p>
            <span className="rounded-full border border-[#2A3344] bg-[#151A27] px-3 py-1 text-xs text-[#D6E0F4]">
              {friendList.length} {t("profile.friendsCount")}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#8A93A3]">
            {isOwnProfile ? t("profile.friendsHintOwn") : t("profile.friendsHintVisitor")}
          </p>

          {!isOwnProfile ? (
            <div className="mt-3 rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2 text-xs text-[#A9B7D1]">
              {t("profile.mutualFriends")}: {mutualCount}
            </div>
          ) : null}

          {friendsLimited ? (
            <p className="mt-3 text-xs text-amber-300">{t("profile.friendsLimited")}</p>
          ) : null}

          <div className="mt-4 space-y-2">
            {friendList.length ? (
              friendList.map((entry) => (
                <div
                  key={entry.friend_user_id}
                  className="rounded-xl border border-[#2A3344] bg-[#0F121A] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#2A3344] bg-[#121B2C] text-xs font-semibold text-[#DCE7FF]">
                        {entry.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.avatar_url}
                            alt={entry.display_name || t("gamification.player")}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          getInitials(entry.display_name)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#E4E7EC]">
                          {entry.display_name || t("gamification.player")}
                        </p>
                        <p className="truncate text-xs text-[#8B94A6]">{entry.email || "--"}</p>
                      </div>
                    </div>
                    {!isOwnProfile ? (
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] ${
                          entry.is_mutual
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : "border-[#33435F] bg-[#131A2A] text-[#9BB0D8]"
                        }`}
                      >
                        {entry.is_mutual ? t("profile.mutualBadge") : t("profile.noMutualBadge")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#8A93A3]">{t("profile.noFriends")}</p>
            )}
          </div>
        </section>
      ) : null}

      {!loadingData && errorMsg && !isOwnProfile ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {errorMsg}
        </div>
      ) : null}
    </div>
  );
}
