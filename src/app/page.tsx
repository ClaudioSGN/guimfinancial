import { AppShell } from "@/components/AppShell";
import { HomeScreen } from "@/components/screens/HomeScreen";

export default function HomePage() {
  return (
    <AppShell activeTab="home">
      <HomeScreen />
    </AppShell>
  );
}
