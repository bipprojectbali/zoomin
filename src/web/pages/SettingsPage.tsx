import { AppShell } from "@/app/AppShell";
import { Separator } from "@/components/ui/separator";
import { DangerSection } from "@/settings/DangerSection";
import { ProfileSection } from "@/settings/ProfileSection";
import { SessionsSection } from "@/settings/SessionsSection";
import { SETTINGS_TEXT as TEXT } from "@/settings/settings.labels";
import { SettingsSection } from "@/settings/SettingsSection";
import { useSession } from "@/session.context";

/** /settings: Profil, Sesi aktif, Zona bahaya (rute dibungkus RequireSession di main.tsx). */
export default function SettingsPage() {
  const { user } = useSession();
  if (!user) return null; // RequireSession menjamin user; guard untuk tipe.
  return (
    <AppShell title={TEXT.title}>
      <div className="flex max-w-4xl flex-col gap-8">
        <SettingsSection id="profile" title={TEXT.profile.title} description={TEXT.profile.description} testId="settings-profile">
          {/* key: form di-reset saat profil berubah dari server (mis. setelah simpan). */}
          <ProfileSection key={`${user.name}|${user.image}`} user={user} />
        </SettingsSection>
        <Separator />
        <SettingsSection id="sessions" title={TEXT.sessions.title} description={TEXT.sessions.description} testId="settings-sessions">
          <SessionsSection />
        </SettingsSection>
        <Separator />
        <SettingsSection id="delete-account" tone="danger" title={TEXT.danger.title} description={TEXT.danger.description}>
          <DangerSection user={user} />
        </SettingsSection>
      </div>
    </AppShell>
  );
}
