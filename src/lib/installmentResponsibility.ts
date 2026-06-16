type InstallmentResponsibilityLike = {
  installment_total?: number | string | null;
  installments_paid?: number | string | null;
  responsibility_installment_indexes?: unknown;
};

function getInstallmentTotal(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function parseRawIndexes(raw: unknown): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((value) => Number(value));

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((value) => Number(value));
    } catch {
      // Ignore JSON parse errors and try PostgreSQL array syntax next.
    }

    const pgArray = trimmed.match(/^\{(.*)\}$/);
    if (pgArray) {
      return pgArray[1]
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));
    }
  }

  return [];
}

export function parseExplicitInstallmentIndexes(
  raw: unknown,
  totalInstallments: number | string | null | undefined,
) {
  const total = getInstallmentTotal(totalInstallments);
  if (total <= 0) return [] as number[];

  return Array.from(
    new Set(
      parseRawIndexes(raw)
        .map((value) => Math.trunc(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= total),
    ),
  ).sort((left, right) => left - right);
}

export function normalizeResponsibilityInstallmentIndexes(
  raw: unknown,
  totalInstallments: number | string | null | undefined,
) {
  const total = getInstallmentTotal(totalInstallments);
  if (total <= 0) return null;

  const normalized = parseExplicitInstallmentIndexes(raw, total);

  if (normalized.length === 0 || normalized.length >= total) return null;
  return normalized;
}

export function getRemainingInstallmentIndexes(
  totalInstallments: number | string | null | undefined,
  blockedIndexesRaw: unknown,
) {
  const total = getInstallmentTotal(totalInstallments);
  if (total <= 0) return [] as number[];

  const blocked = new Set(
    parseExplicitInstallmentIndexes(blockedIndexesRaw, total),
  );

  return Array.from({ length: total }, (_, index) => index + 1).filter(
    (value) => !blocked.has(value),
  );
}

export function getResponsibleInstallmentIndexes(tx: InstallmentResponsibilityLike) {
  const total = getInstallmentTotal(tx.installment_total);
  if (total <= 0) return [] as number[];
  const custom = normalizeResponsibilityInstallmentIndexes(
    tx.responsibility_installment_indexes,
    total,
  );
  if (custom) return custom;
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function isResponsibleForInstallment(
  tx: InstallmentResponsibilityLike,
  installmentIndex: number,
) {
  const responsibleIndexes = getResponsibleInstallmentIndexes(tx);
  if (!responsibleIndexes.length) return false;
  return responsibleIndexes.includes(installmentIndex);
}

export function getResponsibleInstallmentCount(tx: InstallmentResponsibilityLike) {
  return getResponsibleInstallmentIndexes(tx).length;
}

export function getPaidResponsibleInstallmentCount(tx: InstallmentResponsibilityLike) {
  const responsibleCount = getResponsibleInstallmentCount(tx);
  if (responsibleCount <= 0) return 0;
  const paid = Number(tx.installments_paid);
  if (!Number.isFinite(paid) || paid <= 0) return 0;
  return Math.min(Math.trunc(paid), responsibleCount);
}

export function getPendingResponsibleInstallmentIndexes(tx: InstallmentResponsibilityLike) {
  const responsibleIndexes = getResponsibleInstallmentIndexes(tx);
  const paidCount = getPaidResponsibleInstallmentCount(tx);
  return responsibleIndexes.slice(paidCount);
}

export function isResponsibleInstallmentPlanFullyPaid(tx: InstallmentResponsibilityLike) {
  const responsibleCount = getResponsibleInstallmentCount(tx);
  if (responsibleCount <= 0) return true;
  return getPaidResponsibleInstallmentCount(tx) >= responsibleCount;
}

export function getOutstandingResponsibleInstallmentAmount(
  amount: number,
  tx: InstallmentResponsibilityLike,
) {
  const total = getInstallmentTotal(tx.installment_total);
  if (total <= 0) return Number(tx.installments_paid) ? 0 : amount;

  const perInstallment = amount / total;
  const remainingCount =
    getResponsibleInstallmentCount(tx) - getPaidResponsibleInstallmentCount(tx);
  return perInstallment * Math.max(remainingCount, 0);
}

export function getSettledResponsibleInstallmentAmount(
  amount: number,
  tx: InstallmentResponsibilityLike,
) {
  const total = getInstallmentTotal(tx.installment_total);
  if (total <= 0) return Number(tx.installments_paid) ? amount : 0;

  const perInstallment = amount / total;
  return perInstallment * getPaidResponsibleInstallmentCount(tx);
}

export function buildAlternatingInstallmentIndexes(
  totalInstallments: number,
  startAt: 1 | 2 = 1,
) {
  if (!Number.isFinite(totalInstallments) || totalInstallments < 1) return [] as number[];
  return Array.from({ length: totalInstallments }, (_, index) => index + 1).filter(
    (value) => value % 2 === startAt % 2,
  );
}
