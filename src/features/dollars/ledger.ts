import Big from "big.js";

export type DollarEntry = { id: string; date: string; usd: string };

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validAmount(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value) && new Big(value).gt(0);
}

export function validEntry(value: unknown): value is DollarEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DollarEntry>;
  return typeof row.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(row.id) &&
    validDate(row.date) && validAmount(row.usd);
}

export function parseStoredEntry(value: unknown): DollarEntry {
  if (!value || typeof value !== "object") throw new Error("Invalid stored entry");
  const row = value as Partial<DollarEntry>;
  // Old imports accepted leading zeros and omitted decimal places. Normalize in
  // memory so the cents-based editor receives a consistent amount without a migration.
  const usd = typeof row.usd === "string" && /^\d{1,12}(\.\d{1,2})?$/.test(row.usd)
    ? new Big(row.usd).toFixed(2) : row.usd;
  const entry = { id: row.id, date: row.date, usd };
  if (!validEntry(entry)) throw new Error("Invalid stored entry");
  return entry;
}

export function totalDollars(entries: readonly DollarEntry[]): string {
  return entries.reduce((sum, entry) => sum.plus(entry.usd), new Big(0)).toFixed(2);
}
