import { Users, Video } from "lucide-react";
import { useSearchParams } from "react-router";
import { RoomsPanel } from "@/admin/RoomsPanel";
import { UsersPanel } from "@/admin/UsersPanel";
import { ADMIN_TEXT as TEXT } from "@/admin/admin.labels";
import { AppShell } from "@/app/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/session.context";

type AdminTab = "users" | "rooms";
const TAB_PARAM = "tab";

/** Halaman /admin (guard admin+ di main.tsx): tab Pengguna dan Room. Tab aktif disimpan di `?tab=`. */
export default function AdminPage() {
  return (
    <AppShell title={TEXT.pageTitle}>
      <AdminContent />
    </AppShell>
  );
}

function AdminContent() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const tab: AdminTab = params.get(TAB_PARAM) === "rooms" ? "rooms" : "users";
  if (!user) return null; // RequireRole di main.tsx menjamin user ada; guard untuk tipe

  return (
    <Tabs value={tab} onValueChange={(v) => setParams(v === "users" ? {} : { [TAB_PARAM]: v }, { replace: true })} className="gap-4" data-testid="admin-page">
      <TabsList>
        <TabsTrigger value="users" data-testid="admin-tab-users" className="px-3">
          <Users />
          {TEXT.tabUsers}
        </TabsTrigger>
        <TabsTrigger value="rooms" data-testid="admin-tab-rooms" className="px-3">
          <Video />
          {TEXT.tabRooms}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersPanel actor={user} />
      </TabsContent>
      <TabsContent value="rooms">
        <RoomsPanel />
      </TabsContent>
    </Tabs>
  );
}
