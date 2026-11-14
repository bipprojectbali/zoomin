import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SessionUser } from "../../shared/api.types";
import { initials } from "./app.labels";

/** Avatar user: foto (Google/profil) bila ada, fallback inisial. */
export function UserAvatar({ user, className }: { user: Pick<SessionUser, "name" | "image">; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-brand/15 text-xs font-medium text-brand">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
