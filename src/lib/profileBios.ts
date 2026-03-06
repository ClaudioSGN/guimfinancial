import type { Language } from "../../shared/i18n";

export type ProfileBioDefinition = {
  code: string;
  missionClaimsRequired: number;
  labelPt: string;
  labelEn: string;
};

export const DEFAULT_PROFILE_BIO_CODE = "mendigueira";

export const PROFILE_BIOS: ProfileBioDefinition[] = [
  {
    code: "mendigueira",
    missionClaimsRequired: 0,
    labelPt: "Mendigueira",
    labelEn: "Mendigueira",
  },
  {
    code: "sobrevivente_do_mes",
    missionClaimsRequired: 1,
    labelPt: "Sobrevivente do mes",
    labelEn: "Month Survivor",
  },
  {
    code: "poupador_aprendiz",
    missionClaimsRequired: 3,
    labelPt: "Poupador aprendiz",
    labelEn: "Savings Apprentice",
  },
  {
    code: "cacador_de_missoes",
    missionClaimsRequired: 5,
    labelPt: "Cacador de missoes",
    labelEn: "Mission Hunter",
  },
  {
    code: "estrategista_de_bolso",
    missionClaimsRequired: 8,
    labelPt: "Estrategista de bolso",
    labelEn: "Pocket Strategist",
  },
  {
    code: "magnata_da_liga",
    missionClaimsRequired: 12,
    labelPt: "Magnata da liga",
    labelEn: "League Tycoon",
  },
];

export function normalizeProfileBioCode(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  const exists = PROFILE_BIOS.some((entry) => entry.code === normalized);
  return exists ? normalized : DEFAULT_PROFILE_BIO_CODE;
}

export function getProfileBioLabel(
  code: string | null | undefined,
  language: Language,
) {
  const normalized = normalizeProfileBioCode(code);
  const entry =
    PROFILE_BIOS.find((item) => item.code === normalized) ??
    PROFILE_BIOS[0];
  return language === "pt" ? entry.labelPt : entry.labelEn;
}

export function getUnlockedProfileBios(missionsCompleted: number) {
  const safeCompleted = Number.isFinite(missionsCompleted)
    ? Math.max(0, Math.floor(missionsCompleted))
    : 0;
  return PROFILE_BIOS.filter(
    (entry) => entry.missionClaimsRequired <= safeCompleted,
  );
}

export function getNextLockedProfileBio(missionsCompleted: number) {
  const safeCompleted = Number.isFinite(missionsCompleted)
    ? Math.max(0, Math.floor(missionsCompleted))
    : 0;
  return PROFILE_BIOS.find(
    (entry) => entry.missionClaimsRequired > safeCompleted,
  );
}
