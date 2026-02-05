import { AppShell } from "@/components/AppShell";
import { InvestmentsScreen } from "@/components/screens/InvestmentsScreen";

export default function InvestmentsPage() {
  return (
    <AppShell activeTab="investments">
      <InvestmentsScreen />
    </AppShell>
  );
}
