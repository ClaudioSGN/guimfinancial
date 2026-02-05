import { AppShell } from "@/components/AppShell";
import { MoreScreen } from "@/components/screens/MoreScreen";

export default function MorePage() {
  return (
    <AppShell activeTab="more">
      <MoreScreen />
    </AppShell>
  );
}
