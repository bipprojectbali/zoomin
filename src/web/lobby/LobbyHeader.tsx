import { LogOut } from "lucide-react";
import { AppBrand } from "@/app.brand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "../../shared/api.types";

const TEXT = {
  logout: "Keluar akun",
  adminRole: "Admin",
  guestRole: "Tamu",
  confirmTitle: "Keluar akun dari zoomin?",
  confirmBody: "Sebagai tamu, Anda butuh link undangan dari admin room untuk masuk lagi.",
  cancel: "Batal",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Header lobby: brand, identitas user, Keluar akun (tamu wajib konfirmasi karena tak bisa login ulang sendiri). */
export function LobbyHeader({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const roleLabel = user.isAdmin ? TEXT.adminRole : TEXT.guestRole;
  const logoutButton = (props: { onClick?: () => void }) => (
    <Button type="button" variant="ghost" size="sm" data-testid="logout" {...props}>
      <LogOut aria-hidden="true" />
      {TEXT.logout}
    </Button>
  );
  return (
    <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
        <AppBrand />
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs font-medium">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="truncate text-sm font-medium">{user.name}</span>
            {/* Admin bernama "Admin" tidak perlu baris peran kembar (QA-15). */}
            {user.name !== roleLabel && <span className="text-xs text-muted-foreground">{roleLabel}</span>}
          </span>
          {user.isAdmin ? (
            logoutButton({ onClick: onLogout })
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>{logoutButton({})}</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{TEXT.confirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{TEXT.confirmBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{TEXT.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={onLogout}>{TEXT.logout}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </header>
  );
}
