import { AppShell } from "@/components/AppShell";
import { GamificationScreen } from "@/components/screens/GamificationScreen";

export default function GamificationPage() {
  return (
    <AppShell activeTab="gamification">
      <GamificationScreen />
    </AppShell>
  );
}
