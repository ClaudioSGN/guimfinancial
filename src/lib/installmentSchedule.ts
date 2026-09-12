import { getPaidResponsibleInstallmentCount, getResponsibleInstallmentIndexes } from "./installmentResponsibility";

type InstallmentPlan = {
  date: string;
  amount: number | string | null;
  installment_total?: number | string | null;
  installments_paid?: number | string | null;
  responsibility_installment_indexes?: unknown;
};

/** Parse a calendar date without converting midnight UTC to the previous local day. */
export function parseCalendarDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function calendarDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Month navigation always starts on day 1, including when today is the 31st. */
export function shiftCalendarMonth(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

/** The purchase month is 1/N; payment progress never changes the calendar index. */
export function getMonthInstallment(plan: InstallmentPlan, month: Date) {
  const start = parseCalendarDate(plan.date);
  const total = Number(plan.installment_total);
  if (!start || !Number.isSafeInteger(total) || total < 1 || Number.isNaN(month.getTime())) return null;
  const offset = (month.getFullYear() - start.getFullYear()) * 12 + month.getMonth() - start.getMonth();
  const index = offset + 1;
  if (index < 1 || index > total) return null;
  const responsible = getResponsibleInstallmentIndexes(plan);
  const position = responsible.indexOf(index);
  if (position < 0) return null;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const date = new Date(month.getFullYear(), month.getMonth(), Math.min(start.getDate(), lastDay));
  return {
    index,
    total,
    date: calendarDateString(date),
    amount: (Number(plan.amount) || 0) / total,
    isPaid: position < getPaidResponsibleInstallmentCount(plan),
  };
}

/** Include future planning months and the end of every known installment plan. */
export function getPlanningMonths(
  selected: Date,
  plans: Pick<InstallmentPlan, "date" | "installment_total">[] = [],
  today = new Date(),
) {
  const months = new Map<string, Date>();
  const add = (date: Date) => {
    const first = shiftCalendarMonth(date, 0);
    months.set(calendarDateString(first), first);
  };
  for (let offset = -11; offset <= 12; offset += 1) add(shiftCalendarMonth(today, offset));
  add(selected);
  for (const plan of plans) {
    const start = parseCalendarDate(plan.date);
    if (!start) continue;
    add(start);
    const total = Number(plan.installment_total);
    if (!Number.isSafeInteger(total) || total < 1) continue;
    for (let offset = 0; offset < total; offset += 1) add(shiftCalendarMonth(start, offset));
  }
  return Array.from(months.values()).sort((a, b) => b.getTime() - a.getTime());
}
