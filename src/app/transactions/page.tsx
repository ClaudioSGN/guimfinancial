import { AppShell } from "@/components/AppShell";
import { TransactionsScreen } from "@/components/screens/TransactionsScreen";

export default function TransactionsPage() {
  return (
    <AppShell activeTab="transactions">
      <TransactionsScreen />
    </AppShell>
  );
}
