import { AppShell } from "@/components/AppShell";
import { BudgetScreen } from "@/components/screens/BudgetScreen";

export default function BudgetPage() {
  return (
    <AppShell activeTab="budget">
      <BudgetScreen />
    </AppShell>
  );
}
