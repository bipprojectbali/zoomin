import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL, ROLES } from "@/role.label";
import type { RoomRole } from "../../shared/api.types";

/** Select peran room (Peserta/Penonton/Host). */
export function RoleSelect({
  value,
  onChange,
  label,
  testId,
  disabled,
}: {
  value: RoomRole;
  onChange: (role: RoomRole) => void;
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as RoomRole)}>
      <SelectTrigger aria-label={label} data-testid={testId} className="w-full sm:w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
