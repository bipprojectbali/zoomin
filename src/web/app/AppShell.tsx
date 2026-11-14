import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { AppBrand } from "@/app.brand";
import { cn } from "@/lib/utils";
import { hasRole } from "@/role.global.label";
import { useSession } from "@/session.context";
import { APP_NAV, APP_SHELL_TEXT as TEXT } from "./app.labels";
import { UserMenu } from "./UserMenu";

type AppShellProps = {
  /** Judul halaman (h1) di atas konten; kosong = halaman menulis judulnya sendiri. */
  title?: string;
  /** Aksi di kanan judul (mis. tombol "Buat room"). */
  actions?: ReactNode;
  children: ReactNode;
};

/** Kerangka halaman aplikasi (lobby/admin/dev/settings): header + navigasi berbasis peran + user menu + main. */
export function AppShell({ title, actions, children }: AppShellProps) {
  const { user } = useSession();
  const nav = APP_NAV.filter((n) => hasRole(user, n.min));
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/app" aria-label={TEXT.home} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <AppBrand />
          </Link>
          {nav.length > 1 && (
            <nav aria-label={TEXT.nav} className="hidden items-center gap-1 sm:flex">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      isActive && "bg-accent text-foreground",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">{user && <UserMenu user={user} />}</div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {(title || actions) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
