import { AppShell } from "@/components/AppShell";
import { ProfileScreen } from "@/components/screens/ProfileScreen";

export default function ProfilePage() {
  return (
    <AppShell activeTab="profile">
      <ProfileScreen />
    </AppShell>
  );
}
