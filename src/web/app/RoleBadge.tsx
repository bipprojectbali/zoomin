import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GlobalRole } from "../../shared/api.types";
import { GLOBAL_ROLE_BADGE_CLASS, GLOBAL_ROLE_LABEL } from "../role.global.label";

/** Badge peran global (User / Admin / Super admin). */
export function RoleBadge({ role, className }: { role: GlobalRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn(GLOBAL_ROLE_BADGE_CLASS[role], className)} data-testid="role-badge">
      {GLOBAL_ROLE_LABEL[role]}
    </Badge>
  );
}
