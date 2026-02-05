export type AccountStat = {
  id: string;
  name: string;
  accountType: "bank" | "card";
  balance: number;
  initialBalance: number | null;
  cardLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  invoiceCurrent: number | null;
};
