import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PREJOIN_TEXT } from "./prejoin.labels";
import { useDevices } from "./preview.tracks";

/** Radix Select tidak menerima value kosong; sentinel ini = perangkat default sistem (deviceId undefined). */
const SYSTEM_DEFAULT = "__system-default__";

type Props = {
  kind: MediaDeviceKind;
  label: string;
  icon: ReactNode;
  value?: string;
  /** Berubah → daftar dimuat ulang (label perangkat baru muncul setelah izin diberikan). */
  refreshKey: unknown;
  disabled?: boolean;
  onChange: (deviceId: string | undefined) => void;
};

/** Pemilih perangkat (kamera/mic) bergaya shadcn. */
export function DeviceSelect({ kind, label, icon, value, refreshKey, disabled, onChange }: Props) {
  const devices = useDevices(kind, refreshKey);
  // Perangkat tersimpan yang sudah dicabut → tampilkan default, bukan nilai yatim.
  const current = value && devices.some((d) => d.deviceId === value) ? value : SYSTEM_DEFAULT;

  return (
    <Select
      value={current}
      disabled={disabled}
      onValueChange={(v) => onChange(v === SYSTEM_DEFAULT ? undefined : v)}
    >
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SYSTEM_DEFAULT}>{PREJOIN_TEXT.defaultDevice}</SelectItem>
        {devices
          .filter((d) => d.deviceId !== "default")
          .map((d, i) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
