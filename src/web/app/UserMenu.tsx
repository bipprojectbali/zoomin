import { LogOut, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/error.message";
import { hasRole } from "@/role.global.label";
import { useSession } from "@/session.context";
import type { SessionUser } from "../../shared/api.types";
import { APP_NAV, APP_SHELL_TEXT as TEXT } from "./app.labels";
import { RoleBadge } from "./RoleBadge";
import { UserAvatar } from "./UserAvatar";

/** Avatar dropdown ala Google: identitas + peran, navigasi (mobile), Profil & akun, Keluar akun. */
export function UserMenu({ user }: { user: SessionUser }) {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const nav = APP_NAV.filter((n) => hasRole(user, n.min));

  async function onSignOut() {
    try {
      await signOut();
      toast.success(TEXT.signedOut);
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("user-menu: signOut gagal", err);
      toast.error(TEXT.signOutFailed(errorMessage(err)));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={TEXT.userMenu}
        data-testid="user-menu"
      >
        <UserAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <UserAvatar user={user} className="size-10" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            <RoleBadge role={user.role} />
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {nav.length > 1 && (
          <>
            <DropdownMenuGroup className="sm:hidden">
              {nav.map((n) => (
                <DropdownMenuItem key={n.to} asChild>
                  <Link to={n.to}>{n.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="sm:hidden" />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings" data-testid="menu-settings">
            <UserRound aria-hidden="true" />
            {TEXT.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onSignOut()} data-testid="logout">
          <LogOut aria-hidden="true" />
          {TEXT.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
