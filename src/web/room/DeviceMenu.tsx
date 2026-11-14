/** Chevron di samping tombol mic/kamera: pilih perangkat saat meeting (UX-28). */
import { useMediaDeviceSelect } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/error.message";
import { logMediaFailure } from "./room.connection";
import { ROOM_LABELS, deviceLabel } from "./room.labels";

type Group = { kind: MediaDeviceKind; title: string };

export function DeviceMenu({ room, label, groups, disabled, testId }: {
  room: Room;
  label: string;
  groups: Group[];
  disabled: boolean;
  testId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-full"
          aria-label={label}
          disabled={disabled}
          data-testid={testId}
        >
          <ChevronUp />
        </Button>
      </DropdownMenuTrigger>
      {/* Konten baru di-mount saat menu dibuka → enumerasi perangkat hanya saat dibutuhkan. */}
      <DropdownMenuContent side="top" align="start" className="w-72">
        {groups.map((g, i) => (
          <div key={g.kind}>
            {i > 0 && <DropdownMenuSeparator />}
            <DeviceGroup room={room} {...g} />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeviceGroup({ room, kind, title }: Group & { room: Room }) {
  const onError = (err: Error) => {
    logMediaFailure(`room: perangkat ${kind} gagal`, err);
    toast.error(`${ROOM_LABELS.deviceFailed}: ${errorMessage(err)}`);
  };
  // requestPermissions false: izin sudah diminta saat pre-join/publish; jangan munculkan prompt baru.
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, room, requestPermissions: false, onError });

  const select = (id: string) => {
    setActiveMediaDevice(id).catch((err: unknown) => onError(err instanceof Error ? err : new Error(String(err))));
  };

  return (
    <>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {devices.length === 0 ? (
        <DropdownMenuItem disabled>{ROOM_LABELS.noDevices}</DropdownMenuItem>
      ) : (
        <DropdownMenuRadioGroup value={activeDeviceId} onValueChange={select}>
          {devices.map((d, i) => (
            <DropdownMenuRadioItem key={d.deviceId || i} value={d.deviceId}>
              <span className="truncate">{deviceLabel(d, i)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      )}
    </>
  );
}
