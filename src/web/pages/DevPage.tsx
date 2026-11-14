import { Activity, FileClock, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "../app/AppShell";
import { AuditPanel } from "../dev/AuditPanel";
import { ConfigPanel } from "../dev/ConfigPanel";
import { DEV_TEXT } from "../dev/dev.labels";
import { HealthPanel } from "../dev/HealthPanel";
import { RolesPanel } from "../dev/RolesPanel";
import { SettingsPanel } from "../dev/SettingsPanel";

const TABS = [
  { id: "health", label: DEV_TEXT.tabs.health, icon: Activity, Panel: HealthPanel },
  { id: "roles", label: DEV_TEXT.tabs.roles, icon: ShieldCheck, Panel: RolesPanel },
  { id: "audit", label: DEV_TEXT.tabs.audit, icon: FileClock, Panel: AuditPanel },
  { id: "settings", label: DEV_TEXT.tabs.settings, icon: SlidersHorizontal, Panel: SettingsPanel },
  { id: "config", label: DEV_TEXT.tabs.config, icon: Settings2, Panel: ConfigPanel },
] as const;

/**
 * Route `/dev` (super_admin; guard di router). Tab tidak aktif di-unmount Radix, jadi auto refresh Ringkasan hanya
 * berjalan saat tab itu dibuka.
 */
export default function DevPage() {
  return (
    <AppShell title={DEV_TEXT.pageTitle}>
      <Tabs defaultValue="health" className="gap-6" data-testid="dev-page">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} data-testid={`dev-tab-${id}`} className="px-3">
                <Icon aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map(({ id, Panel }) => (
          <TabsContent key={id} value={id}>
            <Panel />
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  );
}
