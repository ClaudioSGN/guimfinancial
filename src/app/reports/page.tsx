import { AppShell } from "@/components/AppShell";
import { ReportsScreen } from "@/components/screens/ReportsScreen";

export default function ReportsPage() {
  return (
    <AppShell activeTab="more">
      <ReportsScreen />
    </AppShell>
  );
}
