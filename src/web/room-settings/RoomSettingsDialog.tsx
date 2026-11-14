import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RoomSummary } from "../../shared/api.types";
import { DeleteRoomDialog } from "./DeleteRoomDialog";
import { GeneralTab } from "./GeneralTab";
import { MembersTab } from "./MembersTab";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";
import { StatusTab } from "./StatusTab";

/** Tab dialog pengaturan room. */
export type RoomSettingsTab = "general" | "members" | "status" | "danger";

const TABS: readonly { value: RoomSettingsTab; label: string }[] = [
  { value: "general", label: TEXT.tabGeneral },
  { value: "members", label: TEXT.tabMembers },
  { value: "status", label: TEXT.tabStatus },
  { value: "danger", label: TEXT.tabDanger },
];

type Props = {
  room: RoomSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: RoomSettingsTab;
  /** Room terbaru dari server setelah PATCH. */
  onChanged: (room: RoomSummary) => void;
  onDeleted: (roomId: string) => void;
};

/** Dialog "Pengaturan room" (lobby & /admin): Umum, Anggota, Status, Zona bahaya. */
export function RoomSettingsDialog({ room, open, onOpenChange, initialTab = "general", onChanged, onDeleted }: Props) {
  const [tab, setTab] = useState<RoomSettingsTab>(initialTab);
  const [deleting, setDeleting] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        data-testid="room-settings-dialog"
        // Radix menangkap Escape di document (capture) sebelum handler input: saran pemilih undangan yang terbuka
        // ditutup dulu oleh InvitePicker, dialog baru tertutup pada Escape berikutnya.
        onEscapeKeyDown={(e) => document.activeElement?.getAttribute("aria-expanded") === "true" && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{TEXT.title}</DialogTitle>
          <DialogDescription>{TEXT.description(room.title)}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as RoomSettingsTab)} className="gap-4">
          <TabsList className="w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`room-settings-tab-${t.value}`}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="general">
            <GeneralTab room={room} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="members">
            <MembersTab roomId={room.id} />
          </TabsContent>
          <TabsContent value="status">
            <StatusTab room={room} onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="danger">
            <section className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
              <h3 className="font-medium">{TEXT.deleteHeading}</h3>
              <p className="text-sm text-muted-foreground">{TEXT.deleteBody}</p>
              <Button type="button" variant="destructive" className="self-start" onClick={() => setDeleting(true)} data-testid="room-delete-open">
                <Trash2 aria-hidden="true" />
                {TEXT.deleteOpen}
              </Button>
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
      <DeleteRoomDialog
        room={room}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={(id) => {
          onOpenChange(false);
          onDeleted(id);
        }}
      />
    </Dialog>
  );
}
